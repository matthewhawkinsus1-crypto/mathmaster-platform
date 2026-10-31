/*
 * THE 3×3 SOLVE FAMILY DOES NOT WRITE "+ 0" (CT03 / E2-10, D-78).
 *
 * matrices.solveSystem3x3 moves a variable term to the right in equations 2 and
 * 3. When that equation's constant was 0, version 1 wrote it anyway ("= −3z + 0",
 * "= 0 − 3z"): the system was right but read as a slip, in 4,612 of the 60,694
 * valid draws on a full 400 × 400 seed grid (7.6%; this test walks a thin slice
 * of that grid). A family edit ships as a new version (a
 * delivered question pins its version and an unpinned reference means version
 * 1), so version 1 stays exactly as it was and version 2 leaves the zero out.
 * The DOL #2 review is the assignment that pins version 2.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { defaultFamilyVersion, getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { readLinearEquation3 } from '../../functions/shared/questionFamiliesMatrices.mjs';

const ID = 'matrices.solveSystem3x3';
const family = (version) => getPlatformQuestionFamily(ID, version);
const constraintsOf = (version) => resolveFamilyConstraints(family(version), {}).values;
const equationsOf = (version, values) => family(version).tools.matrixLab(values, { authored: {} }).equations;

// A zero written as a term of a moved equation's right side: "= −3z + 0", "= 0 − 3z".
const writesZeroTerm = (equation) => {
  const right = equation.split('=')[1].trim().split(/\s+/);
  return right.length > 1 && right.includes('0');
};

// Every valid draw the family can make on a thin slice of its 400 × 400 seeds.
const validDraws = (version) => {
  const family1 = family(version);
  const constraints = constraintsOf(version);
  const draws = [];
  for (let seed = 0; seed < 400; seed += 1) {
    for (let salt = 0; salt < 400; salt += 5) {
      const values = family1.derive({ seed, salt }, constraints);
      if (!family1.rules(values, constraints).length) draws.push(values);
    }
  }
  return draws;
};

test('version 1 is frozen: an unpinned reference still means version 1, and it still writes the zero a student was shown', () => {
  assert.equal(defaultFamilyVersion(ID), 1, 'an unpinned slot means version 1, not the latest');
  assert.equal(getPlatformQuestionFamily(ID).version, 1);
  assert.equal(family(1).version, 1);
  assert.equal(family(2).version, 2);
  // Hand-built instances, so the text does not depend on the random stream. Row 2 is
  // 2x − 3z = 0 with z moved over; row 3 is x + y − 2z = 4 with z moved over.
  const instance = (termFirst, constant) => ({
    A: [[1, 1, 1], [2, 0, -3], [1, 1, -2]],
    B: [6, constant, 4],
    moves: [null, { variable: 2, termFirst }, { variable: 2, termFirst }],
    solution: [1, 2, 3],
  });
  assert.deepEqual(equationsOf(1, instance(true, 0)), ['x + y + z = 6', '2x = 3z + 0', 'x + y = 2z + 4'], 'version 1 writes "+ 0" after the term');
  assert.deepEqual(equationsOf(1, instance(false, 0)), ['x + y + z = 6', '2x = 0 + 3z', 'x + y = 4 + 2z'], 'and "0 +" before it');
  assert.deepEqual(equationsOf(1, instance(true, 5)), ['x + y + z = 6', '2x = 3z + 5', 'x + y = 2z + 4']);
  // Version 2: only the zero is gone.
  assert.deepEqual(equationsOf(2, instance(true, 0)), ['x + y + z = 6', '2x = 3z', 'x + y = 2z + 4']);
  assert.deepEqual(equationsOf(2, instance(false, 0)), ['x + y + z = 6', '2x = 3z', 'x + y = 4 + 2z']);
  assert.deepEqual(equationsOf(2, instance(true, 5)), equationsOf(1, instance(true, 5)), 'a nonzero constant is written as before');
  assert.deepEqual(equationsOf(2, instance(false, 5)), equationsOf(1, instance(false, 5)));
});

test('over every valid draw: version 1 writes a zero term in about 7%, version 2 in none, and nothing else about a version changes', () => {
  const before = validDraws(1);
  const after = validDraws(2);
  assert.ok(before.length > 5000, `${before.length} valid draws`);
  assert.deepEqual(after, before, 'the same draws, A, B, moves and solution, in the same order');
  const zeroBefore = before.filter((values) => equationsOf(1, values).some(writesZeroTerm));
  const zeroAfter = after.filter((values) => equationsOf(2, values).some(writesZeroTerm));
  assert.ok(zeroBefore.length > 0.04 * before.length && zeroBefore.length < 0.12 * before.length, `${zeroBefore.length} of ${before.length} versions wrote a zero term`);
  assert.equal(zeroAfter.length, 0, 'no version 2 draw writes one');
  before.forEach((values) => {
    const v1 = equationsOf(1, values);
    const v2 = equationsOf(2, values);
    v2.forEach((equation, index) => {
      // The same equation as the Matrix Lab reads it: A's row and B's constant.
      const read = readLinearEquation3(equation);
      assert.deepEqual([read.row, read.constant], [values.A[index], values.B[index]], `${equation} is row ${index + 1} of the system`);
      // And only an equation that had a zero term is different.
      if (!writesZeroTerm(v1[index])) assert.equal(equation, v1[index]);
    });
  });
  // The answer and the fingerprint are the same system's, whichever version wrote it.
  before.slice(0, 200).forEach((values) => {
    assert.equal(family(2).fingerprint(values), family(1).fingerprint(values));
    assert.deepEqual(family(2).answer(values), family(1).answer(values));
  });
});

test('the DOL #2 review pins version 2 wherever it uses this family, and that version resolves', () => {
  const review = JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json', import.meta.url), 'utf8'));
  const pinned = review.sections.flatMap((section) => section.questions)
    .filter((question) => question.questionFamily?.id === ID)
    .map((question) => [question.questionId, question.questionFamily.version]);
  assert.equal(pinned.length, 2, 'Practice 17 and DOL 7 use the family');
  pinned.forEach(([questionId, version]) => {
    assert.equal(version, 2, `${questionId} pins version 2`);
    assert.equal(getPlatformQuestionFamily(ID, version)?.version, 2);
  });
});
