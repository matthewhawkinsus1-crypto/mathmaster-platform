import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
  sectionGradeEvidenceFingerprint,
  sectionGradeSyncIsCurrent,
} = require('../../functions/lib/classroomSectionGradeReconciliation.js');
const { classroomPublicationGrade } = require('../../functions/lib/classroomSectionGrade.js');
const { assignmentGradeProgress } = require('../../functions/lib/classroomGradeRuntime.js');

const assignment = {
  schemaVersion: 5,
  sections: [
    { role: 'warmup', questions: [{ id: 'w1' }] },
    { role: 'classwork', questions: [{ id: 'c1' }] },
    { role: 'practice', questions: [{ id: 'p1' }] },
    { role: 'dol', questions: [{ id: 'd1' }] },
  ],
};
const questions = assignment.sections.flatMap((section) => section.questions);

test('each completed V5 section derives only its own canonical tracker grade', () => {
  const tracker = {
    0: { status: 'correct', totalAttempts: 1 },
    1: { status: 'expired', totalAttempts: 3, bestPartialCredit: 60 },
    2: { status: 'expired', totalAttempts: 3, bestPartialCredit: 35 },
    3: { status: 'expired', totalAttempts: 3, bestPartialCredit: 80 },
  };

  const grade = (sectionKey) => classroomPublicationGrade({
    assignment,
    publication: { sectionKey },
    tracker,
    questions,
    gradeProgress: assignmentGradeProgress,
  });

  assert.deepEqual(['warmup', 'classwork', 'practice', 'dol'].map((key) => ({
    key,
    indices: grade(key).questionIndices,
    grade: grade(key).grade,
  })), [
    { key: 'warmup', indices: [0], grade: 100 },
    { key: 'classwork', indices: [1], grade: 60 },
    { key: 'practice', indices: [2], grade: 35 },
    { key: 'dol', indices: [3], grade: 80 },
  ]);
});

test('a historical synced false zero is stale until recalculated by the current repair version', () => {
  const evidence = sectionGradeEvidenceFingerprint({
    assignmentId: 'a1',
    publicationId: 'warmup-post',
    sectionKey: 'warmup',
    questionIndices: [0],
    tracker: { 0: { status: 'correct', totalAttempts: 1 } },
    grade: 100,
    classroomGrade: 100,
    maxPoints: 100,
    stage: 'final-complete',
    studentVisible: true,
  });

  assert.equal(sectionGradeSyncIsCurrent({
    prior: { status: 'synced', grade: 0, classroomGrade: 0, reconciliationVersion: 0 },
    evidenceFingerprint: evidence,
    returnedToStudent: true,
    shouldReturn: true,
  }), false);
  assert.equal(sectionGradeSyncIsCurrent({
    prior: {
      status: 'synced',
      grade: 100,
      classroomGrade: 100,
      reconciliationVersion: CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
      evidenceFingerprint: evidence,
    },
    evidenceFingerprint: evidence,
    returnedToStudent: true,
    shouldReturn: true,
  }), true);
});

test('a synced row becomes stale when canonical section evidence changes without another answer', () => {
  const base = {
    assignmentId: 'a1', publicationId: 'classwork-post', sectionKey: 'classwork',
    questionIndices: [1], grade: 50, classroomGrade: 50, maxPoints: 100,
    stage: 'final-complete', studentVisible: true,
  };
  const before = sectionGradeEvidenceFingerprint({
    ...base,
    tracker: { 1: { status: 'expired', bestPartialCredit: 50 } },
  });
  const after = sectionGradeEvidenceFingerprint({
    ...base,
    grade: 75,
    classroomGrade: 75,
    tracker: { 1: { status: 'expired', bestPartialCredit: 75 } },
  });

  assert.notEqual(before, after);
  assert.equal(sectionGradeSyncIsCurrent({
    prior: {
      status: 'synced',
      reconciliationVersion: CLASSROOM_SECTION_GRADE_RECONCILIATION_VERSION,
      evidenceFingerprint: before,
    },
    evidenceFingerprint: after,
    returnedToStudent: true,
    shouldReturn: true,
  }), false);
});
