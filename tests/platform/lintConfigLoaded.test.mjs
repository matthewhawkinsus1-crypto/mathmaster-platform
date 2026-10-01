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

// A hook that reads a value it does not list re-runs too rarely; one that lists
// a value rebuilt every render re-runs (and re-subscribes, re-fetches, re-writes)
// every render. Two of the fan-out bugs the engineering deep dive found were in
// the exhaustive-deps list, which is off repo-wide (156 warnings in the rest of
// src/ when this was turned on). src/platform/ was brought to zero and is held
// there: an error, so CI's `npm run lint` fails on a new one.
const exhaustiveDepsScopes = (config) => (config.overrides || [])
  .filter((entry) => ['react/exhaustive-deps', 'react-hooks/exhaustive-deps'].some((rule) => entry.rules?.[rule] === 'error'))
  .flatMap((entry) => entry.files);

test('a hook with an unlisted dependency is a lint error in src/platform/', () => {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.ok(exhaustiveDepsScopes(config).includes('src/platform/**'), 'react/exhaustive-deps must be an error for src/platform/**');
});

test('oxlint really applies it: a missing hook dependency in src/platform/ fails, the documented escape hatch passes', { timeout: 60_000 }, () => {
  const bin = path.join(repo, 'node_modules', '.bin', process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint');
  if (!existsSync(bin)) return; // the lint step itself reports a missing install
  const probe = (omission) => `import { useEffect, useState } from 'react';
export default function Probe({ value }) {
  const [seen, setSeen] = useState(null);
  useEffect(() => {
    setSeen(value);
${omission ? `    ${omission}\n` : ''}  }, []);
  return seen;
}
`;
  const root = mkdtempSync(path.join(os.tmpdir(), 'mm-lint-deps-probe-'));
  try {
    mkdirSync(path.join(root, 'src', 'platform'), { recursive: true });
    copyFileSync(configPath, path.join(root, '.oxlintrc.json'));
    const lint = (source) => {
      writeFileSync(path.join(root, 'src', 'platform', 'Probe.jsx'), source);
      const result = spawnSync(bin, ['src/platform/Probe.jsx'], { cwd: root, encoding: 'utf8' });
      return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
    };
    const missing = lint(probe(''));
    assert.notEqual(missing.status, 0, `lint must fail on an effect that reads \`value\` and lists []:\n${missing.output}`);
    assert.match(missing.output, /exhaustive-deps/);
    assert.match(missing.output, /value/);
    // A deliberate omission is allowed, one line at a time and with a reason —
    // the spelling the rest of src/ already uses.
    const deliberate = lint(probe('// eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on mount'));
    assert.equal(deliberate.status, 0, `the documented disable comment must be honoured:\n${deliberate.output}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
