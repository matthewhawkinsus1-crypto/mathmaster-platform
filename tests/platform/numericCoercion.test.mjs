// `Number(null)` IS 0, NOT NaN.
//
// One line of JavaScript trivia, four separate defects in this repository, all
// with the same shape and all invisible in testing — because the guard people
// write looks exactly right:
//
//     Number.isFinite(Number(value)) ? Number(value) : null
//
// It rejects undefined, 'abc' and NaN. It ACCEPTS null, '', [] and false, and
// turns every one of them into a confident zero. In a platform whose central
// promise is "we do not classify a student before we have enough evidence to be
// right about them", a guard that silently converts absent evidence into a score
// of zero is close to the worst possible bug: it is wrong, it is confident, and
// it is wrong in the direction that makes children look worse.

import test from 'node:test';
import assert from 'node:assert/strict';

import { finiteNumber, isFiniteNumber, numberOr } from '../../src/platform/utils/numeric.js';
import { rollUpMastery } from '../../src/platform/profile/studentLearningProfile.js';
import { calculateCompositeActivityGrade, recomputePostGradeOnCorrection } from '../../src/platform/publishing/compositeGradeCalculator.js';

// --- the guard itself ----------------------------------------------------------

test('every value Number() would silently zero is rejected', () => {
  [null, undefined, '', '   ', false, true, [], {}, NaN, 'abc', Infinity].forEach((value) => {
    assert.equal(finiteNumber(value), null, `${JSON.stringify(value)} was accepted`);
  });
});

test('real numbers and numeric strings are accepted', () => {
  // Firestore and form inputs both produce numeric strings; refusing those would
  // be pedantry rather than safety.
  assert.equal(finiteNumber(0), 0);
  assert.equal(finiteNumber(-4.5), -4.5);
  assert.equal(finiteNumber('72'), 72);
  assert.equal(finiteNumber('0'), 0);
  assert.equal(isFiniteNumber(0), true, 'zero is a real number and must survive');
});

test('numberOr falls back rather than zeroing', () => {
  assert.equal(numberOr(null, 12), 12);
  assert.equal(numberOr(0, 12), 0, 'a genuine zero is not the missing case');
});

// --- the defect that reached every badge in the product ------------------------

test('a skill with no mastery estimate does not drag course mastery towards zero', () => {
  // The worst of the four. The legacy adapter writes `estimate: null` for
  // exactly the skills a student has no score on, and the old guard accepted
  // them at 0% — so every untouched skill lowered course mastery, and with it
  // the performance projection shown on every badge.
  const measured = {
    'A.2A': { mastery: { estimate: 90 }, dimensions: { eligibleGradeLevelEvents: 6 } },
    'A.5C': { mastery: { estimate: 86 }, dimensions: { eligibleGradeLevelEvents: 6 } },
  };
  const withUntouched = {
    ...measured,
    'A.7A': { mastery: { estimate: null }, dimensions: { eligibleGradeLevelEvents: 6 } },
    'A.9B': { mastery: { estimate: null }, dimensions: { eligibleGradeLevelEvents: 6 } },
  };

  const before = rollUpMastery(measured);
  const after = rollUpMastery(withUntouched);
  assert.equal(after.courseMastery, before.courseMastery, 'untouched skills must not move the number');
  assert.equal(after.skillsWithEvidence, 2, 'and must not be counted as evidence');
  assert.ok(before.courseMastery > 0.8, 'sanity: this student is doing well');
});

test('a genuine zero estimate still counts, because it is a real result', () => {
  // The fix must not swing the other way. A student who scored 0 on a skill has
  // been measured, and excluding that would flatter them.
  const rolled = rollUpMastery({
    'A.2A': { mastery: { estimate: 100 }, dimensions: { eligibleGradeLevelEvents: 4 } },
    'A.5C': { mastery: { estimate: 0 }, dimensions: { eligibleGradeLevelEvents: 4 } },
  });
  assert.equal(rolled.skillsWithEvidence, 2);
  assert.equal(rolled.courseMastery, 0.5);
});

test('no measured skills at all returns null, not zero', () => {
  const rolled = rollUpMastery({ 'A.2A': { mastery: { estimate: null } } });
  assert.equal(rolled.courseMastery, null);
  assert.equal(rolled.skillsWithEvidence, 0);
});

// --- the same mistake, one level down, inside a grade ---------------------------

test('an activity with no score recorded is left out of the composite, not averaged in as zero', () => {
  // The calculator already had `if (score === null) return;` — a skip that never
  // fired, because the normalizer never returned null. This is the same mistake
  // as converting unanswered work into academic failure, made one level further
  // down where nothing on any screen could show it.
  const scored = calculateCompositeActivityGrade([
    { role: 'classwork', score: 90 },
    { role: 'practice', score: 90 },
  ]);
  const withMissing = calculateCompositeActivityGrade([
    { role: 'classwork', score: 90 },
    { role: 'practice', score: 90 },
    { role: 'dol', score: null },
  ]);
  assert.equal(withMissing, scored);
  assert.equal(withMissing, 90);
});

test('a recorded zero still lowers the composite, because it was measured', () => {
  const withZero = calculateCompositeActivityGrade([
    { role: 'classwork', score: 90 },
    { role: 'practice', score: 0 },
  ]);
  assert.ok(withZero < 90, 'a real zero is real');
});

test('a never-synced post reports no previous score rather than a previous zero', () => {
  // Otherwise the first sync of a genuine 0% looks like no change and is skipped.
  const result = recomputePostGradeOnCorrection({ postId: 'p1', lastSyncedScore: null }, [
    { role: 'practice', score: 0 },
  ]);
  assert.equal(result.previousScore, null);
  assert.equal(result.shouldSyncToClassroom, true);
});
