import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const builder = path.join(repoRoot, 'scripts', 'build-tsia2-v2-1.mjs');
const releaseTarget = 'ccmr-fidelity-v2.1-authentic-language';

const scope = {
  rationalIrrationalMagnitude: 'crcAndDiagnostic',
  ratioProportionPercent: 'crcAndDiagnostic',
  proportionalContext: 'crcAndDiagnostic',
  linearExpressionsEquationsInterpretation: 'crcAndDiagnostic',
  basicNumberOperations: 'diagnosticOnly',
  roundingPlaceValue: 'diagnosticOnly',
  numberFormsComparison: 'diagnosticOnly',
};

const writeJson = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

test('TSIA2 domain check accepts a valid zero-completion authoring scaffold', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'mathmaster-tsia2-scaffold-'));
  try {
    const domainRoot = path.join(root, 'drafts', 'ccmr-v2.1', 'tsia2', 'quantitativeReasoning');
    writeJson(path.join(domainRoot, 'TSIA2_QUANTITATIVE_REASONING_MAPPING.v2.1.json'), {
      schemaVersion: 2,
      artifactType: 'mappingLedger',
      releaseTarget,
      framework: 'tsia2',
      domainId: 'quantitativeReasoning',
      nativeSkills: Object.fromEntries(Object.entries(scope).map(([id, tsia2TestScope]) => [id, {
        status: 'author',
        tsia2TestScope,
        officialSkillArea: id,
      }])),
    });
    writeJson(path.join(domainRoot, 'TSIA2_QUANTITATIVE_REASONING_COMPLETION.v2.1.json'), {
      schemaVersion: 2,
      artifactType: 'completionManifest',
      releaseTarget,
      framework: 'tsia2',
      domainId: 'quantitativeReasoning',
      completedNativeSkills: [],
    });

    const result = spawnSync(process.execPath, [builder, '--domain', 'quantitativeReasoning', '--check'], {
      cwd: repoRoot,
      env: { ...process.env, MATHMASTER_ROOT: root },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.scopeUnits, 0);
    assert.equal(summary.documents, 0);
    assert.equal(summary.failures.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
