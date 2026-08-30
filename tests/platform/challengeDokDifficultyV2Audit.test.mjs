import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  TARGET_ADAPTIVE_PAIRS,
  runAudit,
} from '../../scripts/audit-challenge-dok-difficulty-v2.mjs';

test('Fidelity V2 challenge and DOK/difficulty audit protects the current cross-course baseline', () => {
  const result = runAudit();

  assert.equal(result.algebra1.standardCount, 49);
  assert.equal(result.algebra2.standardCount, 48);
  assert.equal(result.algebra1.familyCount, 245);
  assert.equal(result.algebra2.familyCount, 240);
  assert.deepEqual(TARGET_ADAPTIVE_PAIRS, ['2:2', '2:3', '2:4', '3:3', '3:4']);

  // Both Algebra courses have completed the preferred adaptive target.
  assert.equal(result.algebra1.challengeReadyCount, 49);
  assert.equal(result.algebra1.strictFailureCount, 0);
  assert.equal(result.algebra2.challengeReadyCount, 48);
  assert.equal(result.algebra2.challengeMissingCount, 0);

  const baselineMaxGaps = {
    algebra1: { '2:2': 27, '2:3': 0, '2:4': 20, '3:3': 40, '3:4': 35 },
    algebra2: { '2:2': 14, '2:3': 2, '2:4': 34, '3:3': 42, '3:4': 0 },
  };

  for (const [courseName, expected] of Object.entries(baselineMaxGaps)) {
    const actual = result[courseName].missingTargetCounts;
    for (const pair of TARGET_ADAPTIVE_PAIRS) {
      assert.ok(
        actual[pair] <= expected[pair],
        courseName + ' regressed on ' + pair + ': ' + actual[pair] + ' gaps > baseline ' + expected[pair],
      );
    }
  }
});

test('Algebra I and Algebra II are strictly ready across all five preferred adaptive cells', () => {
  const result = runAudit();

  assert.equal(result.algebra1.strictFailureCount, 0);
  assert.equal(result.algebra1.fullPreferredTargetCount, 49);
  assert.equal(result.algebra1.challengeReadyCount, 49);

  assert.equal(result.algebra2.strictFailureCount, 0);
  assert.equal(result.algebra2.fullPreferredTargetCount, 48);
  assert.equal(result.algebra2.challengeReadyCount, 48);

  for (const course of [result.algebra1, result.algebra2]) {
    for (const row of course.standards) {
      assert.deepEqual(row.missingTargets, [], row.standard + ' still has a preferred adaptive gap');
      assert.deepEqual(row.undocumentedMissingTargets, [], row.standard + ' has an undocumented adaptive gap');
    }
  }
});


test('variant-bearing Algebra I families preserve their original core cell', () => {
  const dir = 'drafts/fidelity-v2/algebra1';
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));

  for (const name of files) {
    const entry = JSON.parse(readFileSync(dir + '/' + name, 'utf8'));
    for (const doc of entry.documents || []) {
      if (!Array.isArray(doc.variants) || doc.variants.length === 0) continue;
      const originalPair = String(doc.dok) + ':' + String(doc.difficultyBand);
      const preservesCore = doc.variants.some((variant) => {
        const dok = Number(variant.dok ?? doc.dok);
        const band = Number(variant.difficultyBand ?? doc.difficultyBand);
        return String(dok) + ':' + String(band) === originalPair
          && String(variant.coverageKey || '').startsWith('core-');
      });
      assert.equal(
        preservesCore,
        true,
        doc.id + ' has variants but no explicit core variant preserving original DOK/difficulty ' + originalPair,
      );
    }
  }
});


test('variant-bearing Algebra II families preserve their original DOK/difficulty cell', () => {
  const dir = 'drafts/fidelity-v2/algebra2';
  const files = readdirSync(dir).filter((name) => name.endsWith('.json'));

  for (const name of files) {
    const entry = JSON.parse(readFileSync(dir + '/' + name, 'utf8'));
    for (const doc of entry.documents || []) {
      if (!Array.isArray(doc.variants) || doc.variants.length === 0) continue;
      const originalPair = String(doc.dok) + ':' + String(doc.difficultyBand);
      const preservesCore = doc.variants.some((variant) => {
        const dok = Number(variant.dok ?? doc.dok);
        const band = Number(variant.difficultyBand ?? doc.difficultyBand);
        return String(dok) + ':' + String(band) === originalPair;
      });
      assert.equal(
        preservesCore,
        true,
        doc.id + ' variants lost the original DOK/difficulty cell ' + originalPair,
      );
    }
  }
});
