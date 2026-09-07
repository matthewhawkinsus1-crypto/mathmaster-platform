import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareQuestionRevisionRestore } from '../../src/platform/preflight/assignmentRepairHistory.js';

/*
 * REFUSING A RESTORE MUST BE A DECISION, NOT A CRASH.
 *
 * The history contract accepts any error matching /history|question|q-2/i. A
 * TypeError reading `beforeQuestion` off undefined satisfies that by accident,
 * so removing the guard entirely still passes — the code appears to refuse the
 * restore while actually just falling over.
 *
 * That distinction is not cosmetic. An accidental crash is one defensive
 * rewrite away from silence: read the missing entry with `?.` and the restore
 * proceeds, writing undefined into a question or leaving the assignment
 * untouched while reporting success. A deliberate refusal survives that edit,
 * and tells the teacher which question has no recorded version.
 */

const assignmentV5 = {
  schemaVersion: 5,
  assignment: { assignmentId: 'a-1', title: 'Refusal fixture', courseId: 'algebra1' },
  sections: [{
    id: 'cw',
    role: 'classwork',
    questions: [
      { questionId: 'q-1', type: 'algebra', prompt: 'Solve x + 2 = 5.', answer: '3' },
      { questionId: 'q-2', type: 'algebra', prompt: 'Solve x + 4 = 7.', answer: '3' },
    ],
  }],
};

const historyEntry = {
  fromRevision: 4,
  toRevision: 5,
  committedAt: '2026-09-07T16:20:00.000Z',
  questions: [{
    questionId: 'q-1',
    sectionId: 'cw',
    beforeQuestion: { questionId: 'q-1', type: 'algebra', prompt: 'Older wording.', answer: '3' },
    afterQuestion: { questionId: 'q-1', type: 'algebra', prompt: 'Solve x + 2 = 5.', answer: '3' },
  }],
};

const restoreOf = (questionId) => () => prepareQuestionRevisionRestore({
  assignmentV5,
  historyEntry,
  questionId,
  currentRevision: 5,
});

test('a question absent from the history entry is refused deliberately, not by crashing', () => {
  for (const questionId of ['q-2', 'q-missing']) {
    assert.throws(restoreOf(questionId), (error) => {
      assert.ok(error instanceof Error, 'must be a thrown Error');
      assert.equal(
        error.constructor.name,
        'Error',
        'a TypeError here means the guard was removed and the code merely fell over',
      );
      assert.match(
        error.message,
        new RegExp(questionId),
        'the refusal must name the question the teacher asked to restore',
      );
      assert.match(
        error.message,
        /histor|recorded version/i,
        'the refusal must say why: nothing recorded a version of this question',
      );
      return true;
    });
  }
});

test('a valid restore still succeeds and leaves other questions untouched', () => {
  const restore = restoreOf('q-1')();
  assert.equal(restore.candidateAssignmentV5.sections[0].questions[0].prompt, 'Older wording.');
  assert.equal(restore.candidateAssignmentV5.sections[0].questions[1].prompt, 'Solve x + 4 = 7.');
  assert.equal(restore.nextRevision, 6);
});

console.log('assignmentRepairHistoryRefusal.test.mjs: all assertions passed');
