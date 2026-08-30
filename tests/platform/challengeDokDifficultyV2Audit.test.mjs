import test from 'node:test';
import assert from 'node:assert/strict';

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

  // This test is intentionally monotonic while the upgrade pass is active:
  // Challenge readiness may increase and gap counts may decrease, but neither
  // course is allowed to regress below the audited baseline.
  assert.ok(result.algebra1.challengeReadyCount >= 14);
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

test('strict readiness remains explicit until every preferred cell is present or excepted', () => {
  const result = runAudit();
  assert.ok(result.algebra1.strictFailureCount > 0);
  assert.ok(result.algebra2.strictFailureCount > 0);

  for (const course of [result.algebra1, result.algebra2]) {
    for (const row of course.standards) {
      assert.deepEqual(
        row.undocumentedMissingTargets,
        row.missingTargets,
        'No adaptive exceptions have been declared yet for ' + row.standard,
      );
    }
  }
});
