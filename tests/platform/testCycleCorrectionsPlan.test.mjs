import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CORRECTION_DIAGNOSIS,
  applyCorrectionEvidence,
  buildCorrectionPlan,
  buildPerformanceProfile,
  correctionPlanProgress,
  correctionsAreDue,
} from '../../functions/shared/testCycleCorrections.mjs';
import {
  applyRetestReleased,
  applyTestReleased,
  normalizeTestCycleRecord,
} from '../../functions/shared/testCycleRecord.mjs';

/*
 * CORRECTIONS ARE BUILT FROM THIS STUDENT'S OWN FAILED TEST.
 *
 * Not from the class average, not from the standard the unit is about, and not
 * from a misconception nobody observed.
 */

const POLICY = { mode: 'testCycle' };

const BLUEPRINT = {
  blueprintId: 'unit3',
  targets: [
    { targetId: 't1', alignmentKey: 'texas:A.5A', label: 'Solving linear equations', dok: 2, difficultyBand: 3, questionCount: 2, weight: 2, familyIds: ['f1', 'f2', 'f3'] },
    { targetId: 't2', alignmentKey: 'texas:A.7C', label: 'Quadratic features', dok: 3, difficultyBand: 4, questionCount: 2, anchor: true, familyIds: ['g1', 'g2', 'g3'] },
    { targetId: 't3', alignmentKey: 'texas:A.9B', label: 'Exponential growth', dok: 2, difficultyBand: 2, questionCount: 2, familyIds: ['h1', 'h2', 'h3'] },
  ],
};

// Missed both A.5A items (one with a recorded error pattern), missed one A.7C,
// got both A.9B right. 3 correct of 6 -> 50%, which is below the 70 pass mark.
const RESPONSES = [
  { targetId: 't1', slotId: 't1#1', familyId: 'f1', questionInstanceId: 'i1', score: 0, isCorrect: false, misconceptionCode: 'distributes-sign-once' },
  { targetId: 't1', slotId: 't1#2', familyId: 'f2', questionInstanceId: 'i2', score: 0, isCorrect: false },
  { targetId: 't2', slotId: 't2#1', familyId: 'g1', questionInstanceId: 'i3', score: 1, isCorrect: true },
  { targetId: 't2', slotId: 't2#2', familyId: 'g2', questionInstanceId: 'i4', score: 0, isCorrect: false },
  { targetId: 't3', slotId: 't3#1', familyId: 'h1', questionInstanceId: 'i5', score: 1, isCorrect: true },
  { targetId: 't3', slotId: 't3#2', familyId: 'h2', questionInstanceId: 'i6', score: 1, isCorrect: true },
];

const profile = () => buildPerformanceProfile({ blueprint: BLUEPRINT, responses: RESPONSES });
const plan = (grade = 50) => buildCorrectionPlan({
  blueprint: BLUEPRINT, profile: profile(), policy: POLICY, releasedTestGrade: grade,
  assignmentId: 'A1', studentId: 'S1', examSessionId: 'e1',
});

test('the performance profile is built from standard, item, DOK, difficulty and representation', () => {
  const built = profile();
  const byId = Object.fromEntries(built.targets.map((target) => [target.targetId, target]));
  assert.equal(byId.t1.missed, 2);
  assert.equal(byId.t2.missed, 1);
  assert.equal(byId.t3.missed, 0);
  assert.equal(byId.t1.mastery, 0);
  assert.equal(byId.t3.mastery, 1);
  assert.equal(byId.t1.dok, 2);
  assert.equal(byId.t2.difficultyBand, 4);
  assert.equal(built.overallScore, 50);
  // Weakest first, and weight counts: t1 is both fully missed and weighted 2.
  assert.equal(built.weakestFirst[0].targetId, 't1');
  assert.ok(!built.weakestFirst.some((target) => target.targetId === 't3'), 'a mastered target is not a weak target');
});

test('a failed released Test automatically produces a correction plan', () => {
  assert.equal(correctionsAreDue({ releasedTestGrade: 50, policy: POLICY }), true);
  const built = plan();
  assert.ok(built, 'a failed test must produce corrections without anyone asking');
  assert.deepEqual(built.targets.map((target) => target.targetId), ['t1', 't2']);
  assert.equal(built.releasedTestGrade, 50);
  assert.equal(built.passingScore, 70);
});

test('a passing Test produces no corrections at all', () => {
  assert.equal(correctionsAreDue({ releasedTestGrade: 70, policy: POLICY }), false);
  assert.equal(correctionsAreDue({ releasedTestGrade: 88, policy: POLICY }), false);
  assert.equal(plan(88), null);
  // An unreleased test has no grade, so it has no corrections either.
  assert.equal(correctionsAreDue({ releasedTestGrade: null, policy: POLICY }), false);
});

test('each correction maps back to the actual failed Test evidence', () => {
  const built = plan();
  const t1 = built.targets.find((target) => target.targetId === 't1');
  assert.deepEqual(t1.evidence.map((item) => item.questionInstanceId), ['i1', 'i2']);
  assert.equal(t1.alignmentKey, 'texas:A.5A');
  assert.equal(t1.missed, 2);
  assert.equal(t1.attempted, 2);

  const t2 = built.targets.find((target) => target.targetId === 't2');
  assert.deepEqual(t2.evidence.map((item) => item.questionInstanceId), ['i4'], 'only the missed item, not the correct one');
});

test('a misconception is named only when the evidence carried one', () => {
  const built = plan();
  const t1 = built.targets.find((target) => target.targetId === 't1');
  assert.equal(t1.diagnosis, CORRECTION_DIAGNOSIS.MISCONCEPTION);
  assert.equal(t1.misconception, 'distributes-sign-once');

  const t2 = built.targets.find((target) => target.targetId === 't2');
  assert.equal(t2.diagnosis, CORRECTION_DIAGNOSIS.STANDARD, 'no error pattern was recorded, so none is invented');
  assert.equal(t2.misconception, null);
  assert.match(t2.diagnosisDetail, /texas:A\.7C/, 'it targets the missed standard instead');
});

test('corrections practise on parallel items, never on the secure item with its answer shown', () => {
  const built = plan();
  const t1 = built.targets.find((target) => target.targetId === 't1');
  assert.equal(t1.replaysSecureItem, false);
  assert.deepEqual(t1.forbiddenInstanceIds, ['i1', 'i2'], 'the exact instances the student saw are forbidden');
  assert.deepEqual(t1.practiceFamilyIds, ['f3'], 'a family the student has not met is preferred');
});

test('a correction target is complete only on successful evidence', () => {
  const built = plan();
  const t2 = built.targets.find((target) => target.targetId === 't2');
  assert.equal(t2.requiredCorrectResponses, 1);

  // Wrong answers cost nothing and prove nothing.
  let working = applyCorrectionEvidence(built, { correctionId: t2.correctionId, isCorrect: false });
  assert.equal(working.targets.find((target) => target.targetId === 't2').complete, false);

  working = applyCorrectionEvidence(working, { correctionId: t2.correctionId, isCorrect: true, at: 5 });
  assert.equal(working.targets.find((target) => target.targetId === 't2').complete, true);
  assert.equal(working.complete, false, 't1 still owes two correct responses');

  const t1 = built.targets.find((target) => target.targetId === 't1');
  assert.equal(t1.requiredCorrectResponses, 2);
  working = applyCorrectionEvidence(working, { correctionId: t1.correctionId, isCorrect: true });
  working = applyCorrectionEvidence(working, { correctionId: t1.correctionId, isCorrect: true });
  assert.equal(working.complete, true);
  assert.deepEqual(correctionPlanProgress(working), { total: 2, complete: 2, remaining: 0, allComplete: true });
});

test('corrections never mutate the recorded Test grade', () => {
  let record = normalizeTestCycleRecord({ assignmentId: 'A1', studentId: 'S1' });
  record = applyTestReleased(record, { rawScore: 50, policy: POLICY, releasedAt: 1 });
  const gradeAfterTest = record.recordedGrade;

  let built = plan();
  for (const target of built.targets) {
    for (let index = 0; index < target.requiredCorrectResponses; index += 1) {
      built = applyCorrectionEvidence(built, { correctionId: target.correctionId, isCorrect: true });
    }
  }
  record = { ...record, corrections: { ...record.corrections, complete: true, total: 2, completedTargets: 2 } };

  assert.equal(built.complete, true);
  assert.equal(record.recordedGrade, gradeAfterTest, 'finishing corrections changed nothing about the grade');
  assert.equal(record.recordedGrade, 50);
  // Only a released retest can move it.
  record = applyRetestReleased(record, { rawScore: 91, policy: POLICY, releasedAt: 2 });
  assert.equal(record.recordedGrade, 70);
});

test('the correction plan declares itself instructional and grade-neutral', () => {
  const built = plan();
  assert.equal(built.secure, false);
  assert.equal(built.hintsAllowed, true);
  assert.equal(built.gradeImpact, 'none');
});
