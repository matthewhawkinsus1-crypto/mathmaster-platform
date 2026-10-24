/*
 * NV10: HOME'S "SOME WORK NEEDS ATTENTION" SAYS WHICH WORK AND WHAT TO DO.
 *
 * The line read "Some work needs attention — keep this tab open" for an
 * answer only on screen, an answer the server had not recorded, and
 * unfinished work that was not backed up alike, with no assignment named. It
 * now names the assignment where it is known (a refused draft's key names it;
 * the outbox drain reports which assignments' answers are waiting) and gives
 * one next step for each kind of trouble.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region } from './helpers/sourceContract.mjs';
import { SAVE_TONE, describeSaveStatus } from '../../src/platform/student/saveStatusModel.js';
import { packUpWorkLine } from '../../src/platform/student/packUpLine.js';
import {
  DRAFT_SAVE_PROBLEM, clearDraftSaveProblems, draftSaveProblemAssignmentIds, reportDraftSaveProblem,
} from '../../src/platform/persistence/draftSaveHealth.js';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import {
  SUBMISSION_DISPOSITION, createDurableAction, createMemoryOutboxStorage, drainDurableActions, enqueueDurableAction,
} from '../../src/platform/performance/durableActionOutbox.js';

test('each kind of trouble says what to do, and names the assignments it is on', () => {
  const review = describeSaveStatus({ persistenceStatus: 'needs-review', needsReviewTitles: ['Lesson 5: Slope'] });
  assert.equal(review.tone, SAVE_TONE.ATTENTION);
  assert.equal(review.text, 'Some work needs attention: answers on Lesson 5: Slope have not been recorded yet. Keep this tab open while MathMaster sends them.');
  assert.match(describeSaveStatus({ persistenceStatus: 'needs-review', needsReviewTitles: ['Lesson 5', 'Lesson 6'] }).text, /answers on Lesson 5 and Lesson 6 have not/);
  assert.match(describeSaveStatus({ persistenceStatus: 'needs-review', needsReviewTitles: ['Lesson 5', 'Lesson 6', 'Lesson 7', 'Lesson 5'] }).text, /answers on Lesson 5 and 2 more assignments have not/);
  assert.equal(describeSaveStatus({ persistenceStatus: 'volatile' }).text, 'Some work needs attention: an answer is only on this screen. Keep this tab open until it saves, and tell your teacher if this stays.');
  const drafts = describeSaveStatus({ persistenceStatus: 'durable', draftsUnsaved: true, unsavedDraftTitles: ['Lesson 5'] });
  assert.equal(drafts.tone, SAVE_TONE.ATTENTION);
  assert.equal(drafts.text, 'Some work needs attention: unfinished work on Lesson 5 is not backed up. Open it, finish it on this device, and tell your teacher.');
  assert.equal(describeSaveStatus({ draftsUnsaved: true }).text, 'Some work needs attention: some unfinished work is not backed up. Finish it on this device, and tell your teacher.');
  // A title nobody could read is no title.
  assert.match(describeSaveStatus({ persistenceStatus: 'needs-review', needsReviewTitles: ['', null, '  '] }).text, /some answers have not been recorded/);
  // The pack-up line reads the same status and still never says "saved".
  assert.equal(packUpWorkLine(review).kind, 'notSaved');
  assert.equal(packUpWorkLine(drafts).kind, 'notSaved');
});

test('a draft that is not backed up names its assignment, for this student only', () => {
  clearDraftSaveProblems();
  try {
    reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.BACKUP_REFUSED, buildQuestionDraftKey({ studentId: 'stu 1', assignmentId: 'A:1/x', questionIndex: 2 }));
    reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.BACKUP_FULL, buildQuestionDraftKey({ studentId: 'stu 1', assignmentId: 'B2', questionIndex: 0 }));
    reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.DEVICE_FULL, buildQuestionDraftKey({ studentId: 'stu 1', assignmentId: 'B2', questionIndex: 1 }));
    reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.BACKUP_FULL, buildQuestionDraftKey({ studentId: 'someone else', assignmentId: 'C3', questionIndex: 0 }));
    assert.deepEqual(draftSaveProblemAssignmentIds('stu 1').sort(), ['A:1/x', 'B2']);
    assert.deepEqual(draftSaveProblemAssignmentIds('nobody'), []);
    assert.deepEqual(draftSaveProblemAssignmentIds(null), []);
  } finally {
    clearDraftSaveProblems();
  }
});

test('the outbox drain says which assignment each kept answer is on', async () => {
  const storage = createMemoryOutboxStorage();
  const action = createDurableAction({
    kind: 'ordinarySubmission', studentId: 'student', assignmentId: 'lesson-5', questionIndex: 0, actionId: 'submit-1',
    payload: { previousTotalAttempts: 0, record: { totalAttempts: 1, status: 'attempted' }, evidenceEvent: { eventKey: 'event-0-1' } },
  });
  await enqueueDurableAction(action, { storage });
  const result = await drainDurableActions({
    storage, studentId: 'student', reconcile: async () => ({ disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason: 'not-recorded' }),
  });
  assert.equal(result.tally.needsReview, 1);
  assert.deepEqual(result.retained.map((entry) => [entry.assignmentId, entry.disposition]), [['lesson-5', SUBMISSION_DISPOSITION.NEEDS_REVIEW]]);
});

test('App hands Home the titles of the assignments the work is on', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const drain = region(app, 'const drainStudentOutbox = async', 'return result;', 'the drain');
  assert.match(drain, /setStudentNeedsReviewAssignmentIds\(\[\.\.\.new Set\(\(result\.retained \|\| \[\]\)\s*\.filter\(\(entry\) => entry\.disposition === SUBMISSION_DISPOSITION\.NEEDS_REVIEW && entry\.assignmentId\)/);
  const status = region(app, 'const studentSaveStatusNow = () => describeSaveStatus({', '});', 'Home\'s save status');
  assert.match(status, /needsReviewTitles: studentAssignmentTitles\(studentNeedsReviewAssignmentIds\),/);
  assert.match(status, /unsavedDraftTitles: studentAssignmentTitles\(draftSaveHealthVersion >= 0 \? draftSaveProblemAssignmentIds\(user\?\.id\) : \[\]\),/);
});
