import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyIncompleteDraftRepairCommit,
  restoreIncompleteAssignmentV5,
} from '../../src/platform/preflight/incompleteAssignmentDraft.js';
import {
  prepareQuestionRevisionRestore,
} from '../../src/platform/preflight/assignmentRepairHistory.js';

const question = (questionId, prompt, answer = '3') => ({
  questionId,
  type: 'algebra',
  prompt,
  answer,
  activityRole: 'classwork',
  alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
});

const assignmentV5 = {
  schemaVersion: 5,
  assignment: {
    assignmentId: 'history-safety',
    title: 'Repair history fixture',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [{
    id: 'cw',
    role: 'classwork',
    title: 'Classwork',
    questions: [
      question('q-1', 'Solve x + 2 = 5.'),
      question('q-2', 'Solve x + 4 = 7.'),
    ],
  }],
};

const draft = (overrides = {}) => ({
  id: 'draft-history',
  schemaVersion: 5,
  title: assignmentV5.assignment.title,
  assignmentRevision: 4,
  teacherReviewContext: { flags: [] },
  authoringReview: {
    state: 'incomplete',
    ownerUid: 'teacher-1',
  },
  authoringDraft: {
    canonicalJson: JSON.stringify(assignmentV5),
    sourceSchemaVersion: 5,
  },
  assignedClassIds: [],
  assignedClassPeriods: [],
  dueAt: null,
  releaseAt: null,
  ...overrides,
});

test('a draft repair automatically records only the questions that changed', () => {
  const repaired = structuredClone(assignmentV5);
  repaired.sections[0].questions[0].prompt = 'Solve x + 2 = 5. Show one algebra step.';

  const next = applyIncompleteDraftRepairCommit(draft(), {
    assignmentV5: repaired,
    teacherReviewContext: { flags: [] },
    committedRevision: 5,
  }, { nowIso: '2026-09-07T16:20:00.000Z' });

  assert.equal(next.assignmentRevision, 5);
  assert.equal(next.repairHistory.length, 1);
  const entry = next.repairHistory[0];
  assert.equal(entry.fromRevision, 4);
  assert.equal(entry.toRevision, 5);
  assert.equal(entry.committedAt, '2026-09-07T16:20:00.000Z');
  assert.equal(entry.questions.length, 1, 'unchanged questions must not be copied into repair history');
  assert.equal(entry.questions[0].questionId, 'q-1');
  assert.equal(entry.questions[0].sectionId, 'cw');
  assert.equal(entry.questions[0].beforeQuestion.prompt, 'Solve x + 2 = 5.');
  assert.equal(entry.questions[0].afterQuestion.prompt, 'Solve x + 2 = 5. Show one algebra step.');

  const serializedEntry = JSON.stringify(entry);
  assert.doesNotMatch(serializedEntry, /q-2/, 'repair history must stay question-scoped instead of storing the whole assignment');
  assert.doesNotMatch(serializedEntry, /Solve x \+ 4 = 7/);
});

test('restoring an older question version creates a new revision instead of moving the revision number backward', () => {
  const repaired = structuredClone(assignmentV5);
  repaired.sections[0].questions[0].prompt = 'Solve x + 2 = 5. Show one algebra step.';
  const revision5 = applyIncompleteDraftRepairCommit(draft(), {
    assignmentV5: repaired,
    teacherReviewContext: { flags: [] },
    committedRevision: 5,
  }, { nowIso: '2026-09-07T16:20:00.000Z' });

  const restore = prepareQuestionRevisionRestore({
    assignmentV5: restoreIncompleteAssignmentV5(revision5),
    historyEntry: revision5.repairHistory[0],
    questionId: 'q-1',
    currentRevision: 5,
  });

  assert.equal(restore.baseRevision, 5);
  assert.equal(restore.nextRevision, 6);
  assert.equal(restore.restoredFromRevision, 4);
  assert.equal(restore.questionId, 'q-1');
  assert.equal(restore.candidateAssignmentV5.sections[0].questions[0].questionId, 'q-1');
  assert.equal(restore.candidateAssignmentV5.sections[0].questions[0].prompt, 'Solve x + 2 = 5.');
  assert.equal(restore.candidateAssignmentV5.sections[0].questions[1].prompt, 'Solve x + 4 = 7.', 'restore must not touch another question');

  const revision6 = applyIncompleteDraftRepairCommit(revision5, {
    assignmentV5: restore.candidateAssignmentV5,
    teacherReviewContext: revision5.teacherReviewContext,
    committedRevision: restore.nextRevision,
  }, { nowIso: '2026-09-07T16:22:00.000Z' });

  assert.equal(revision6.assignmentRevision, 6, 'history restore is a new edit, never revision rollback');
  assert.equal(revision6.repairHistory.length, 2);
  assert.equal(revision6.repairHistory[1].fromRevision, 5);
  assert.equal(revision6.repairHistory[1].toRevision, 6);
  assert.equal(revision6.repairHistory[1].questions[0].beforeQuestion.prompt, 'Solve x + 2 = 5. Show one algebra step.');
  assert.equal(revision6.repairHistory[1].questions[0].afterQuestion.prompt, 'Solve x + 2 = 5.');
});

test('a history entry cannot restore a different or missing immutable question id', () => {
  const repaired = structuredClone(assignmentV5);
  repaired.sections[0].questions[0].prompt = 'Solve x + 2 = 5. Show one algebra step.';
  const revision5 = applyIncompleteDraftRepairCommit(draft(), {
    assignmentV5: repaired,
    teacherReviewContext: { flags: [] },
    committedRevision: 5,
  });

  assert.throws(() => prepareQuestionRevisionRestore({
    assignmentV5: restoreIncompleteAssignmentV5(revision5),
    historyEntry: revision5.repairHistory[0],
    questionId: 'q-2',
    currentRevision: 5,
  }), /history|question|q-2/i);

  assert.throws(() => prepareQuestionRevisionRestore({
    assignmentV5: restoreIncompleteAssignmentV5(revision5),
    historyEntry: revision5.repairHistory[0],
    questionId: 'q-missing',
    currentRevision: 5,
  }), /history|question|q-missing/i);
});

test('the incomplete-draft repair commit path refuses delivered or student-history assignments', () => {
  const repaired = structuredClone(assignmentV5);
  repaired.sections[0].questions[0].prompt = 'Solve x + 2 = 5. Show one algebra step.';
  const committedRepair = {
    assignmentV5: repaired,
    teacherReviewContext: { flags: [] },
    committedRevision: 5,
  };

  assert.throws(
    () => applyIncompleteDraftRepairCommit(draft({ assignedClassIds: ['class-1'] }), committedRepair),
    /live|student|assigned|Safe Live Repair/i,
    'once a class receives an assignment, general draft repair must not become a second live-mutation path',
  );
  assert.throws(
    () => applyIncompleteDraftRepairCommit(draft({ hasLiveProtection: true }), committedRepair),
    /live|student|Safe Live Repair/i,
  );
  assert.throws(
    () => applyIncompleteDraftRepairCommit(draft({ studentEvidenceCount: 1 }), committedRepair),
    /live|student|Safe Live Repair/i,
  );

  const safeDraft = applyIncompleteDraftRepairCommit(draft(), committedRepair);
  assert.equal(safeDraft.assignmentRevision, 5, 'an unassigned authoring draft still uses the normal Repair Center path');
});

console.log('assignmentRepairHistorySafety.test.mjs: all assertions passed');
