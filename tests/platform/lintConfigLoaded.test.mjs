// THE LINT CONFIG MUST BE THE FILE OXLINT ACTUALLY READS.
//
// The React rules lived in `_oxlintrc.json`. oxlint looks for `.oxlintrc.json`,
// so for as long as anyone can remember `npm run lint` ran with its defaults:
// no React plugin, no rules-of-hooks, no undefined-identifier check. Turning the
// file on found 57 conditional hook calls (a "rendered fewer hooks" crash
// waiting for a tool to receive a question in another mode), a `<React.Fragment>`
// in a file that never imported React (the relation workspace crashed at the
// moment a student solved a literal equation), and a block-scoped `const` read
// outside its block in `submitPathResponse` (every finalized SAT/ACT/TSIA-style
// Path question threw inside its transaction).
//
// These are the checks AGENTS.md says "the whole gate misses". They are only a
// gate while this file is named so oxlint loads it, and while the rules that
// caught them stay errors — CI runs `npm run lint`, and only errors fail it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = path.join(repo, '.oxlintrc.json');

test('the lint config is named so oxlint loads it', () => {
  assert.ok(existsSync(configPath), '.oxlintrc.json must exist at the repository root');
  assert.ok(!existsSync(path.join(repo, '_oxlintrc.json')), 'a second, ignored config would invite edits that do nothing');
});

test('hook order, undefined JSX and undefined identifiers fail the lint', () => {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.ok(config.plugins.includes('react'), 'the React plugin provides rules-of-hooks and jsx-no-undef');
  assert.equal(config.rules['react/rules-of-hooks'], 'error');
  assert.equal(config.rules['react/jsx-no-undef'], 'error');
  const undefScopes = (config.overrides || []).filter((entry) => entry.rules?.['no-undef'] === 'error');
  const covered = undefScopes.flatMap((entry) => entry.files);
  assert.ok(covered.includes('src/**'), 'the browser runtime is checked for identifiers it never imports');
  assert.ok(covered.some((glob) => glob.startsWith('functions/')), 'Cloud Functions are checked too');
  assert.ok(undefScopes.some((entry) => entry.env?.browser) && undefScopes.some((entry) => entry.env?.node),
    'each runtime is checked against its own globals, or window/process would be reported as undefined');
});

test('oxlint really applies the config: a missing import is an error', { timeout: 60_000 }, () => {
  const bin = path.join(repo, 'node_modules', '.bin', process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint');
  if (!existsSync(bin)) return; // the lint step itself reports a missing install
  // A throwaway tree with the real config at its root, so the probe is linted
  // under the same `src/**` override without ever appearing in the real src/
  // (other suites scan it while this one runs).
  const root = mkdtempSync(path.join(os.tmpdir(), 'mm-lint-probe-'));
  try {
    mkdirSync(path.join(root, 'src'));
    copyFileSync(configPath, path.join(root, '.oxlintrc.json'));
    writeFileSync(path.join(root, 'src', 'Probe.jsx'),
      'export default function Probe() { return <NeverImported value={neverDeclared()} />; }\n');
    const result = spawnSync(bin, ['src/Probe.jsx'], { cwd: root, encoding: 'utf8' });
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, `lint must fail on the probe:\n${output}`);
    assert.match(output, /jsx-no-undef/);
    assert.match(output, /no-undef\).*neverDeclared/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
