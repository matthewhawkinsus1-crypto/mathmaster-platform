import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const script = path.join(repoRoot, 'scripts', 'build-tsia2-production-seed.mjs');

test('TSIA2 production seed CLI validates the complete deployable package without writing in --check mode', () => {
  const run = spawnSync(process.execPath, [script, '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.framework, 'tsia2');
  assert.equal(summary.releaseTarget, 'ccmr-fidelity-v2.1-authentic-language');
  assert.equal(summary.items, 200);
  assert.equal(summary.nativeSkills, 25);
  assert.equal(summary.direct, 125);
  assert.equal(summary.challenge, 75);
  assert.equal(summary.crcAndDiagnosticFamilies, 144);
  assert.equal(summary.diagnosticOnlyFamilies, 56);
  assert.equal(summary.unroutedNativeSkills, 0);
  assert.equal(summary.wroteFiles, false);
});
