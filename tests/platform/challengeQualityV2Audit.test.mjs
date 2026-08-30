import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runChallengeQualityAudit,
} from '../../scripts/audit-challenge-quality-v2.mjs';

test('every Algebra I and Algebra II standard has an authentic non-procedural Challenge option', () => {
  const result = runChallengeQualityAudit();

  assert.equal(result.algebra1.standardCount, 49);
  assert.equal(result.algebra1.qualityReadyCount, 49);
  assert.deepEqual(result.algebra1.qualityMissing, []);

  assert.equal(result.algebra2.standardCount, 48);
  assert.equal(result.algebra2.qualityReadyCount, 48);
  assert.deepEqual(result.algebra2.qualityMissing, []);
});

test('a procedural DOK3/Band4 row can never be the only Challenge evidence for a standard', () => {
  const result = runChallengeQualityAudit();

  for (const course of [result.algebra1, result.algebra2]) {
    for (const row of course.standards) {
      if (!row.challengeRows.some((challenge) => challenge.taskType === 'procedural')) continue;
      assert.equal(
        row.challengeRows.some((challenge) => challenge.qualifies),
        true,
        row.standard + ' relies only on procedural work for Challenge',
      );
    }
  }
});

test('qualifying Challenge rows expose a concrete depth reason', () => {
  const result = runChallengeQualityAudit();

  for (const course of [result.algebra1, result.algebra2]) {
    for (const row of course.standards) {
      const qualifying = row.challengeRows.filter((challenge) => challenge.qualifies);
      assert.ok(qualifying.length >= 1, row.standard + ' has no qualifying Challenge row');
      for (const challenge of qualifying) {
        assert.notEqual(challenge.reason, 'procedural-only');
        assert.notEqual(challenge.reason, 'insufficient-depth-evidence');
      }
    }
  }
});
