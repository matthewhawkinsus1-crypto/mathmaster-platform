import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { assignmentGradeProgress } = require('../../functions/lib/classroomGradeRuntime.js');
const { classroomPublicationGrade } = require('../../functions/lib/classroomSectionGrade.js');
const { automaticClassroomSectionKeys } = require('../../functions/lib/classroomSectionPublishing.js');
const { testCycleGradeProgress } = require('../../functions/lib/testCycleGrade.js');

const q = (id) => ({ questionId: id, type: 'multipleChoice', prompt: id, choices: ['A', 'B'], correctAnswer: 'A' });
const assignment = {
  schemaVersion: 5,
  assessmentPolicy: {
    mode: 'testCycle',
    passingScore: 70,
    review: { required: true },
    test: {},
    retest: { strategy: 'shortForm', scorePolicy: 'replaceIfHigher' },
  },
  sections: [
    { id: 'review', role: 'review', questions: [q('r1'), q('r2')] },
    { id: 'test', role: 'test', questions: [q('t1'), q('t2'), q('t3'), q('t4')] },
    { id: 'retest', role: 'retest', questions: [q('rt1'), q('rt2')] },
  ],
};
const questions = assignment.sections.flatMap((section) => section.questions.map((question) => ({
  ...question,
  activityRole: section.role,
  sectionId: section.id,
})));
const correct = { status: 'correct', totalAttempts: 1, attemptCount: 1 };
const wrong = { status: 'expired', totalAttempts: 1, attemptCount: 1, bestPartialCredit: 0 };

test('Test Cycle Classroom grade excludes Review practice', () => {
  const tracker = {
    0: correct, 1: correct,
    2: correct, 3: wrong, 4: wrong, 5: wrong,
  };
  const result = testCycleGradeProgress({
    assignment,
    tracker,
    questions,
    gradeProgress: assignmentGradeProgress,
  });
  assert.equal(result.grade, 25);
  assert.equal(result.sourceRole, 'test');
  assert.deepEqual(result.questionIndices, [2, 3, 4, 5]);
  assert.equal(result.total, 4);
});

test('completed Retest stays out of Classroom until Retest feedback is released', () => {
  const tracker = {
    0: correct, 1: correct,
    2: correct, 3: wrong, 4: wrong, 5: wrong,
    6: correct, 7: correct,
  };
  const held = testCycleGradeProgress({
    assignment: { ...assignment, feedbackReleased: true },
    tracker,
    questions,
    gradeProgress: assignmentGradeProgress,
  });
  assert.equal(held.grade, 25);
  assert.equal(held.sourceRole, 'test');
  assert.equal(held.retestGrade, 100);
  assert.equal(held.retestComplete, true);
  assert.equal(held.retestFeedbackReleased, false);

  const released = testCycleGradeProgress({
    assignment: {
      ...assignment,
      feedbackReleased: true,
      assessmentRetestFeedbackReleased: true,
    },
    tracker,
    questions,
    gradeProgress: assignmentGradeProgress,
  });
  assert.equal(released.grade, 100);
  assert.equal(released.sourceRole, 'retest');
  assert.deepEqual(released.questionIndices, [6, 7]);
});

test('replace-if-higher preserves the original Test score when Retest is lower', () => {
  const tracker = {
    0: correct, 1: correct,
    2: correct, 3: correct, 4: wrong, 5: wrong,
    6: wrong, 7: wrong,
  };
  const result = testCycleGradeProgress({
    assignment: {
      ...assignment,
      feedbackReleased: true,
      assessmentRetestFeedbackReleased: true,
    },
    tracker,
    questions,
    gradeProgress: assignmentGradeProgress,
  });
  assert.equal(result.testGrade, 50);
  assert.equal(result.retestGrade, 0);
  assert.equal(result.grade, 50);
  assert.equal(result.sourceRole, 'test');
});

test('a passing Test never gets replaced by Retest evidence', () => {
  const tracker = {
    0: correct, 1: correct,
    2: correct, 3: correct, 4: correct, 5: wrong,
    6: correct, 7: correct,
  };
  const result = testCycleGradeProgress({
    assignment: {
      ...assignment,
      feedbackReleased: true,
      assessmentRetestFeedbackReleased: true,
    },
    tracker,
    questions,
    gradeProgress: assignmentGradeProgress,
  });
  assert.equal(result.testGrade, 75);
  assert.equal(result.grade, 75);
  assert.equal(result.retestEligible, false);
  assert.equal(result.sourceRole, 'test');
});

test('whole-assignment Classroom publication uses the Test Cycle official score', () => {
  const tracker = {
    0: correct, 1: correct,
    2: correct, 3: wrong, 4: wrong, 5: wrong,
    6: correct, 7: correct,
  };
  const result = classroomPublicationGrade({
    assignment: { ...assignment, feedbackReleased: true },
    publication: { sectionKey: 'whole' },
    tracker,
    questions,
    gradeProgress: assignmentGradeProgress,
  });
  assert.equal(result.sectionKey, 'whole');
  assert.equal(result.sectionLabel, 'Assessment');
  assert.equal(result.grade, 25);
  assert.deepEqual(result.questionIndices, [2, 3, 4, 5]);
});

test('Test Cycle Classroom auto-publishing stays one whole-assignment post', () => {
  assert.deepEqual(automaticClassroomSectionKeys(assignment), ['whole']);
});


test('released Retest score is not suppressed by the earlier final Test sync', () => {
  const source = await import('node:fs').then(({ readFileSync }) => readFileSync('functions/index.js', 'utf8'));
  const start = source.indexOf('const sameOfficialAssessmentGrade = !isTestCycleAssignment(assignment)');
  assert.ok(start >= 0, 'whole-assignment passback must distinguish a changed Test Cycle official grade');
  const dedupe = source.slice(start, source.indexOf('const publicationTeacherUid', start));
  assert.match(dedupe, /Number\(priorAudit\.grade\) === Number\(grade\)/);
  assert.match(dedupe, /Number\(priorAudit\.classroomGrade\) === Number\(classroomGrade\)/);
  assert.match(dedupe, /&& sameOfficialAssessmentGrade/);
});
