import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commitStagedQuestionRepairImport,
  stageSingleQuestionRepairImport,
} from '../../src/platform/preflight/questionRepairImport.js';

/*
 * REPAIRING ONE OF TWO BROKEN QUESTIONS MUST BE ALLOWED TO LAND.
 *
 * An assignment sitting in the Repair Center almost always carries blocking
 * diagnostics — that is why it is there. If a repair were judged by whether the
 * assignment is clean afterwards, the teacher could never commit anything: the
 * first repair would be refused because the SECOND question is still broken,
 * and so would every repair after it. The whole point of a per-question
 * workspace is that a teacher fixes one question at a time.
 *
 * What must block is a replacement that introduces something that was not wrong
 * before. This distinguishes the two, which the main contract's fixture cannot
 * because its baseline is already valid.
 */

const question = (questionId, prompt, role) => ({
  questionId,
  type: 'algebra',
  prompt,
  answer: '3',
  activityRole: role,
  alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
});

// The practice question is unrepairably broken for Firestore: an array directly
// inside an array, and not a recognisable coordinate pair, so nothing
// auto-repairs it. It stays blocking in every model built from this assignment.
const brokenAssignment = () => ({
  schemaVersion: 5,
  assignment: {
    assignmentId: 'assignment-17',
    title: 'Two broken questions',
    courseId: 'algebra1',
    instructionalPurpose: 'lesson',
    gradingPurpose: 'classwork',
  },
  sections: [
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [question('q-cw-1', 'Solve x + 2 = 5.', 'classwork')] },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [{ ...question('q-pr-1', 'Solve x + 4 = 7.', 'practice'), xIntercepts: [[5, 0, 99]] }],
    },
  ],
});

test('a repair commits while a different question is still broken', () => {
  const source = brokenAssignment();

  const staged = stageSingleQuestionRepairImport({
    assignmentV5: source,
    questionId: 'q-cw-1',
    replacementQuestion: { ...source.sections[0].questions[0], prompt: 'Solve x + 2 = 5. Show one step.' },
    baseRevision: 12,
    currentRevision: 12,
  });

  // The assignment is NOT valid — the practice question is still broken — and
  // that must not stop the classwork repair.
  assert.equal(staged.validation.assignmentIsValid, false, 'fixture must still carry a pre-existing blocking issue');
  assert.equal(staged.validation.newBlockingDiagnostics.length, 0, 'this repair introduces nothing new');
  assert.equal(staged.canCommit, true, 'a repair must not be refused because a different question is still broken');

  const committed = commitStagedQuestionRepairImport({
    stagedImport: staged,
    teacherReviewContext: null,
    currentRevision: 12,
    nextRevision: 13,
  });
  assert.equal(committed.assignmentV5.sections[0].questions[0].prompt, 'Solve x + 2 = 5. Show one step.');
  assert.equal(committed.assignmentV5.sections[1].questions[0].xIntercepts[0][2], 99, 'the untouched broken question is left exactly as it was');
});

test('a replacement that introduces a NEW failure is still refused on an already-broken assignment', () => {
  const source = brokenAssignment();

  const staged = stageSingleQuestionRepairImport({
    assignmentV5: source,
    questionId: 'q-cw-1',
    replacementQuestion: { ...source.sections[0].questions[0], yIntercepts: [[0, 7, 42]] },
    baseRevision: 12,
    currentRevision: 12,
  });

  assert.equal(staged.canCommit, false, 'a new blocking issue must block even when the assignment was already invalid');
  assert.ok(staged.validation.newBlockingDiagnostics.some((entry) => /Firestore/i.test(entry.message)));
  assert.throws(() => commitStagedQuestionRepairImport({
    stagedImport: staged,
    currentRevision: 12,
    nextRevision: 13,
  }), /cannot be committed|blocking/i);
});

console.log('questionRepairImportPartialProgress.test.mjs: all assertions passed');
