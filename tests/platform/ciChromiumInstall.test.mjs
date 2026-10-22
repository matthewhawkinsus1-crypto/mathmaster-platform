// The browser jobs get Chromium's system packages from a cache, not the Ubuntu
// mirror (.github/actions/setup/install-chromium.sh).
//
// From the mirror, `playwright install --with-deps` took anything from 17
// seconds to 16 minutes per job (PR #513: 6, 7.7, 9.5 and 16 minutes in four
// jobs of one run). The script installs the packages Playwright asks for from
// cached .deb files and goes to the mirror only when the cache cannot supply
// exactly the missing ones. These run it against stand-ins for apt, dpkg, sudo
// and npx, recording what it asked of each.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(repo, '.github/actions/setup/install-chromium.sh');
const WANTED = 'libnss3 fonts-unifont fonts-wqy-zenhei xfonts-cyrillic';

// Each stand-in logs its arguments; installed packages live in a state file.
const STUBS = {
  npx: `#!/usr/bin/env bash
echo "npx $*" >> "$LOG"
if [ "$*" = "playwright install-deps --dry-run chromium" ]; then
  [ -n "$FAKE_WANTED" ] && echo "sudo -- sh -c \\"apt-get update&& apt-get install -y --no-install-recommends $FAKE_WANTED\\""
fi
exit 0`,
  'dpkg-query': `#!/usr/bin/env bash
grep -qx "\${@: -1}" "$STATE" && echo "install ok installed" && exit 0
exit 1`,
  sudo: `#!/usr/bin/env bash
"$@"`,
  'apt-get': `#!/usr/bin/env bash
echo "apt-get $*" >> "$LOG"
archives=""; packages=(); download=0
for arg in "$@"; do
  case "$arg" in
    Dir::Cache::archives=*) archives="\${arg#Dir::Cache::archives=}" ;;
    --download-only) download=1 ;;
    -*|install|update|-o) ;;
    *) packages+=("$arg") ;;
  esac
done
for package in "\${packages[@]}"; do
  if [ "$download" = 1 ]; then touch "$archives/$package.deb"; else echo "$package" >> "$STATE"; fi
done`,
  dpkg: `#!/usr/bin/env bash
echo "dpkg $*" >> "$LOG"
[ "$1" = "-i" ] || exit 0
shift
[ -n "$DPKG_FAILS" ] && exit 1
for deb in "$@"; do basename "$deb" .deb >> "$STATE"; done`,
};

const scenario = ({ installed = [], cache = null, wanted = WANTED, dpkgFails = false } = {}) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'chromium-install-'));
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  Object.entries(STUBS).forEach(([name, body]) => {
    writeFileSync(path.join(bin, name), `${body}\n`);
    chmodSync(path.join(bin, name), 0o755);
  });
  const state = path.join(dir, 'installed');
  writeFileSync(state, installed.map((name) => `${name}\n`).join(''));
  const debs = path.join(dir, 'debs');
  if (cache) {
    mkdirSync(debs);
    cache.debs.forEach((name) => writeFileSync(path.join(debs, `${name}.deb`), ''));
    writeFileSync(path.join(debs, 'needed.txt'), cache.needed);
  }
  const output = path.join(dir, 'github-output');
  writeFileSync(output, '');
  const log = path.join(dir, 'log');
  writeFileSync(log, '');
  const run = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: dir,
      PLAYWRIGHT_DEBS: debs,
      GITHUB_OUTPUT: output,
      STATE: state,
      LOG: log,
      FAKE_WANTED: wanted,
      ...(dpkgFails ? { DPKG_FAILS: '1' } : {}),
    },
  });
  const result = {
    status: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean),
    output: readFileSync(output, 'utf8'),
    needed: existsSync(path.join(debs, 'needed.txt')) ? readFileSync(path.join(debs, 'needed.txt'), 'utf8') : null,
  };
  rmSync(dir, { recursive: true, force: true });
  return result;
};

const aptCalls = (calls) => calls.filter((call) => call.startsWith('apt-get'));

test('with everything installed it neither downloads nor installs a package, and still installs Chromium', () => {
  const run = scenario({ installed: WANTED.split(' ') });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(aptCalls(run.calls), []);
  assert.ok(!run.calls.some((call) => call.startsWith('dpkg -i')));
  assert.ok(run.calls.includes('npx playwright install chromium'));
  assert.equal(run.output, '', 'nothing to save');
});

test('a cache holding exactly the missing packages installs them from the cache and never touches the mirror', () => {
  const run = scenario({
    installed: ['libnss3'],
    cache: { needed: 'fonts-unifont fonts-wqy-zenhei xfonts-cyrillic', debs: ['fonts-unifont', 'fonts-wqy-zenhei', 'xfonts-cyrillic', 'xfonts-utils'] },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(aptCalls(run.calls), [], 'no apt-get at all: the mirror is not used');
  assert.ok(run.calls.some((call) => call.startsWith('dpkg -i')), 'installed with dpkg from the cached files');
  assert.match(run.stdout, /Installed from the cache: fonts-unifont fonts-wqy-zenhei xfonts-cyrillic/);
  assert.equal(run.output, '', 'a cache hit saves nothing');
  assert.ok(run.calls.includes('npx playwright install chromium'));
});

test('with no cache it downloads into the cache, installs from it, records what was missing and asks for a save', () => {
  const run = scenario({ installed: ['libnss3'] });
  assert.equal(run.status, 0, run.stderr);
  const apt = aptCalls(run.calls);
  assert.equal(apt[0], 'apt-get update');
  assert.match(apt[1], /--download-only -o Dir::Cache::archives=\S+ fonts-unifont fonts-wqy-zenhei xfonts-cyrillic$/);
  assert.match(apt[2], /^apt-get install -y --no-install-recommends -o Dir::Cache::archives=\S+ fonts-unifont fonts-wqy-zenhei xfonts-cyrillic$/);
  assert.equal(run.needed, 'fonts-unifont fonts-wqy-zenhei xfonts-cyrillic');
  assert.match(run.output, /^fetched=true$/m);
});

test('a cache made for a different set of missing packages is not trusted: the mirror is used', () => {
  const run = scenario({ installed: ['libnss3'], cache: { needed: 'fonts-unifont', debs: ['fonts-unifont'] } });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(aptCalls(run.calls).length >= 3, 'downloaded from the mirror');
  assert.ok(!run.calls.some((call) => call.startsWith('dpkg -i')), 'the mismatched cache is not installed');
  assert.match(run.output, /^fetched=true$/m);
});

test('a cached install that dpkg refuses falls back to the mirror', () => {
  const run = scenario({
    installed: ['libnss3'],
    cache: { needed: 'fonts-unifont fonts-wqy-zenhei xfonts-cyrillic', debs: ['fonts-unifont', 'fonts-wqy-zenhei', 'xfonts-cyrillic'] },
    dpkgFails: true,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.calls.includes('dpkg --configure -a'), 'finishes what the failed install left');
  assert.ok(aptCalls(run.calls).length >= 3, 'then downloads from the mirror');
});

test('an unreadable package list falls back to Playwright\'s own install', () => {
  const run = scenario({ wanted: '' });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.calls.includes('npx playwright install --with-deps chromium'));
});

test('the setup action restores the cache before the script and saves it only after a download, a key per runner image', () => {
  const action = readFileSync(path.join(repo, '.github/actions/setup/action.yml'), 'utf8');
  const restore = action.indexOf('uses: actions/cache/restore@');
  const install = action.indexOf('run: bash "$GITHUB_ACTION_PATH/install-chromium.sh"');
  const save = action.indexOf('uses: actions/cache/save@');
  assert.ok(restore > 0 && restore < install && install < save, 'restore, install, then save');
  assert.match(action.slice(save - 200, save), /if: inputs\.browser == 'true' && steps\.chromium\.outputs\.fetched == 'true'/);
  assert.match(action, /prefix="playwright-debs-\$\{ImageOS:-unknown\}-\$\{RUNNER_ARCH\}-\$\(npx playwright --version[^"]*\)-"/,
    'one OS, architecture and Playwright');
  assert.match(action, /echo "key=\$prefix\$\{ImageVersion:-unknown\}"/, 'a new runner image gets its own cache');
  // and starts from the newest one before it, which the script installs only
  // when it holds exactly the missing packages (the tests above).
  assert.match(action, /key: \$\{\{ steps\.image\.outputs\.key \}\}\n\s+restore-keys: \$\{\{ steps\.image\.outputs\.prefix \}\}/);
  assert.doesNotMatch(action, /--with-deps/, 'the setup itself never asks apt for everything');
});
