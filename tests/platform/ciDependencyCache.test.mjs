/*
 * THE INSTALLED DEPENDENCIES COME FROM A CACHE, AND ONLY IF THEY ARE THE
 * LOCKFILE'S (docs/audits/2026-11-28-ci-throughput.md).
 *
 * CI is bound by its 20 runners, not by any one job: a full run asks for about
 * 630 job-minutes, and every minute a job spends installing is a minute no
 * other pull request's job can run. In every job `npm ci` took about 32 s
 * (its downloads were already cached) and, in the browser jobs, Playwright's
 * browser builds about 14 s more to download. The shared setup action
 * (.github/actions/setup/action.yml) now restores both from the Actions
 * cache. These hold it to:
 *
 *   1. a key naming everything that decides what `npm ci` does: package.json
 *      and the lockfile (`npm ci` refuses a lockfile that does not match
 *      package.json, so a change to package.json alone must miss and run it),
 *      the exact Node, the OS image and the architecture;
 *   2. a restored node_modules used only after scripts/check-lockfile-install.mjs
 *      finds every package at the lockfile's version; otherwise it is deleted
 *      and `npm ci` installs it, exactly as before (run here, on a real
 *      drifted tree);
 *   3. `npm ci` on every miss, and the tree saved straight after it, before
 *      Playwright is added on top;
 *   4. the browser builds keyed on the Playwright version, restored before
 *      install-chromium.sh, which still runs `npx playwright install chromium`.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const action = readFileSync(path.join(root, '.github/actions/setup/action.yml'), 'utf8');

// The composite action's steps, in order (`- ` at four spaces under `steps:`).
const steps = action.split(/^ {2}steps:\n/m)[1]
  .split(/^(?= {4}- )/m)
  .filter((step) => /^ {4}- /.test(step));
const indexOf = (pattern, label) => {
  const index = steps.findIndex((step) => pattern.test(step));
  assert.notEqual(index, -1, `no step ${label}`);
  return index;
};
const stepWith = (pattern, label) => steps[indexOf(pattern, label)];

test('node_modules is restored under a key naming package.json and the lockfile, the exact Node, the OS image and the architecture', () => {
  const key = stepWith(/id: modules-key\n/, 'computing the node_modules key');
  // package.json too: a change to it alone must miss, so `npm ci` checks it against the lockfile.
  assert.match(key, /hashFiles\('package\.json', 'package-lock\.json'\)/);
  assert.match(key, /process\.versions\.node/);
  assert.match(key, /\$\{ImageOS/);
  assert.match(key, /\$\{RUNNER_ARCH\}/);
  const restore = stepWith(/id: modules\n/, 'restoring node_modules');
  assert.match(restore, /uses: actions\/cache\/restore@v4/);
  assert.match(restore, /path: node_modules\n/);
  assert.match(restore, /key: \$\{\{ steps\.modules-key\.outputs\.key \}\}/);
  // An exact key only: a tree for another lockfile is never a starting point.
  assert.doesNotMatch(restore, /restore-keys/);
});

test('a restored tree is checked against the lockfile before anything uses it, and `npm ci` runs whenever it is not the lockfile\'s', () => {
  const check = indexOf(/id: restored\n/, 'checking the restored tree');
  assert.match(steps[check], /if: steps\.modules\.outputs\.cache-hit == 'true'/);
  assert.match(steps[check], /node scripts\/check-lockfile-install\.mjs/);
  const install = indexOf(/run: npm ci\n/, 'running npm ci');
  assert.ok(check < install, 'the check comes before npm ci');
  // npm ci is skipped only on the check's word, so a miss, or a hit that
  // fails the check, installs from the lockfile as it always did.
  assert.match(steps[install], /if: steps\.restored\.outputs\.matches != 'true'/);
  // Nothing else is installed or run between the restore and that decision.
  const restore = indexOf(/id: modules\n/, 'restoring node_modules');
  assert.deepEqual([restore + 1, restore + 2], [check, install]);
});

test('the tree is saved straight after `npm ci` on a miss, before Playwright is added on top', () => {
  const install = indexOf(/run: npm ci\n/, 'running npm ci');
  const save = indexOf(/uses: actions\/cache\/save@v4\n(?:.*\n)*?\s+path: node_modules\n/, 'saving node_modules');
  assert.equal(save, install + 1);
  assert.match(steps[save], /if: steps\.modules\.outputs\.cache-hit != 'true'/);
  assert.match(steps[save], /continue-on-error: true/);
  assert.match(steps[save], /key: \$\{\{ steps\.modules-key\.outputs\.key \}\}/);
  const playwright = indexOf(/npm install --no-save playwright@/, 'adding Playwright');
  assert.ok(save < playwright, 'saved before Playwright is added');
});

test('the browser builds are restored under the Playwright version before install-chromium.sh, and saved after it on a miss', () => {
  const image = stepWith(/id: image\n/, 'naming the Playwright caches');
  assert.match(image, /browsers=playwright-browsers-\$\{ImageOS:-unknown\}-\$\{RUNNER_ARCH\}-\$version/);
  assert.match(image, /version="\$\(npx playwright --version/);
  const restore = indexOf(/id: browsers\n/, 'restoring the browser builds');
  assert.match(steps[restore], /path: ~\/\.cache\/ms-playwright\n/);
  assert.match(steps[restore], /if: inputs\.browser == 'true'/);
  const install = indexOf(/run: bash "\$GITHUB_ACTION_PATH\/install-chromium\.sh"/, 'installing Chromium');
  const save = indexOf(/uses: actions\/cache\/save@v4\n(?:.*\n)*?\s+path: ~\/\.cache\/ms-playwright\n/, 'saving the browser builds');
  assert.ok(restore < install && install < save, 'restore, install, save');
  assert.match(steps[save], /steps\.browsers\.outputs\.cache-hit != 'true'/);
  // The script still asks Playwright for Chromium, which fetches what is missing.
  assert.match(readFileSync(path.join(root, '.github/actions/setup/install-chromium.sh'), 'utf8'), /\nnpx playwright install chromium\n?$/);
});

/* --- the check on a restored tree, run ---------------------------------- */

// The `run:` of the step that checks a restored tree, with the script it calls
// taken from this repository.
const checkScript = () => stepWith(/id: restored\n/, 'checking the restored tree')
  .split(/^ {6}run: \|\n/m)[1]
  .split('\n')
  .map((line) => line.replace(/^ {8}/, ''))
  .join('\n')
  .replace('node scripts/check-lockfile-install.mjs', `node ${JSON.stringify(path.join(root, 'scripts/check-lockfile-install.mjs'))}`);

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
const install = (dir, name, version) => {
  mkdirSync(path.join(dir, 'node_modules', name), { recursive: true });
  writeFileSync(path.join(dir, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }));
};
const repoWithLock = (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ci-dependency-cache-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    packages: { '': { name: 'app' }, 'node_modules/react': { version: '19.2.8' }, 'node_modules/react-dom': { version: '19.2.8' } },
  }));
  git(dir, 'init', '-q');
  git(dir, 'add', 'package-lock.json');
  git(dir, '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'lock');
  return dir;
};
const runCheck = (dir) => {
  const output = path.join(dir, 'github-output');
  writeFileSync(output, '');
  const run = spawnSync('bash', ['-e', '-c', checkScript()], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } });
  return { status: run.status, output: readFileSync(output, 'utf8'), stdout: run.stdout, stderr: run.stderr };
};

test('a restored tree that is the lockfile\'s is used as it is', (t) => {
  const dir = repoWithLock(t);
  install(dir, 'react', '19.2.8');
  install(dir, 'react-dom', '19.2.8');
  const run = runCheck(dir);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.output.trim(), 'matches=true');
  assert.ok(existsSync(path.join(dir, 'node_modules/react/package.json')));
});

test('a restored tree that is not the lockfile\'s is deleted, and the step says nothing matched, so `npm ci` installs it again', (t) => {
  for (const drift of [
    (dir) => { install(dir, 'react', '19.3.1'); install(dir, 'react-dom', '19.2.8'); },
    (dir) => { install(dir, 'react', '19.2.8'); },
  ]) {
    const dir = repoWithLock(t);
    drift(dir);
    const run = runCheck(dir);
    // The step itself succeeds: the job goes on to `npm ci`.
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.output, '', 'no matches=true');
    assert.equal(existsSync(path.join(dir, 'node_modules')), false, 'the restored tree is gone');
    assert.match(run.stdout, /not the lockfile's: installing it again/);
  }
});
