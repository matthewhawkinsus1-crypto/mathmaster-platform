// AN UNSAVED-WORK NOTICE LASTS ONLY AS LONG AS THE WORK IT IS ABOUT.
//
// Batch 3 tells a student when unfinished work is not being saved
// (draftSaveHealth.js). A problem used to clear only when the same draft key
// saved again, or at sign-out. So after a failed save, a student who started
// the question over, asked for a new problem, or submitted the answer kept
// "Your work is not being saved on this device…" for the rest of the session:
// the work it was about was gone, or in the device queue. Each of those now
// clears every problem of that question's draft family, and only that family.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DRAFT_SAVE_PROBLEM,
  clearDraftSaveProblems,
  clearDraftSaveProblemsForFamily,
  describeDraftSaveProblems,
  draftSaveProblemsFor,
  reportDraftSaveProblem,
} from '../../src/platform/persistence/draftSaveHealth.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const STUDENT = 'S-life';
const ASSIGNMENT = 'A-life';
const family = (question) => `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:${question}:0:student`;
const mine = () => draftSaveProblemsFor({ studentId: STUDENT, assignmentId: ASSIGNMENT });
const notice = () => describeDraftSaveProblems(mine());

class FullStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(name) { return this.values.has(name) ? this.values.get(name) : null; }
  setItem() { throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' }); }
  removeItem(name) { this.values.delete(String(name)); }
}

let instance = 0;
const drafts = async () => {
  globalThis.window = { localStorage: new FullStorage() };
  instance += 1;
  return import(`../../src/questionDraftStorage.js?life=${instance}`);
};
const quietly = async (run) => {
  const { warn } = console;
  console.warn = () => {};
  try { return await run(); } finally { console.warn = warn; }
};

// Question 1 cannot be saved (two nested drafts), question 2's backup is
// full: the notice stands for both.
const failTwoQuestions = () => {
  clearDraftSaveProblems();
  reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.DEVICE_FULL, `${family(1)}:multi-answer`);
  reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.BACKUP_REFUSED, `${family(1)}:step-algebra`);
  reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.BACKUP_FULL, `${family(2)}:literal`);
  assert.equal(notice().kind, DRAFT_SAVE_PROBLEM.DEVICE_FULL);
};

test('one family is cleared, every kind, and nothing of another question', () => {
  failTwoQuestions();
  // `…:1:0:student` is not a prefix of `…:10:0:student`.
  reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.DEVICE_FULL, `${family(10)}:literal`);
  assert.equal(clearDraftSaveProblemsForFamily(family(1)), true);
  assert.deepEqual(mine(), { 'device-full': 1, 'backup-refused': 0, 'backup-full': 1 });
  assert.equal(clearDraftSaveProblemsForFamily(family(10)), true);
  assert.equal(notice().kind, DRAFT_SAVE_PROBLEM.BACKUP_FULL, 'question 2 is still not backed up, and still says so');
  assert.equal(clearDraftSaveProblemsForFamily(''), false);
  clearDraftSaveProblems();
});

test('Start over clears the notice, even when the device cannot store the reset either', async () => {
  failTwoQuestions();
  const store = await drafts();
  await quietly(() => store.resetQuestionDraftFamily(family(1)));
  assert.deepEqual(mine(), { 'device-full': 0, 'backup-refused': 0, 'backup-full': 1 });
  clearDraftSaveProblems();
});

test('a new problem and a retired assignment clear theirs', async () => {
  failTwoQuestions();
  const store = await drafts();
  store.removeQuestionDraftFamily(family(1));
  assert.deepEqual(mine(), { 'device-full': 0, 'backup-refused': 0, 'backup-full': 1 });
  // Another assignment whose id starts with this one's keeps its notice.
  const other = { studentId: STUDENT, assignmentId: `${ASSIGNMENT}2` };
  reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.DEVICE_FULL, `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}2:1:0:student:literal`);
  store.removeAssignmentDrafts({ studentId: STUDENT, assignmentId: ASSIGNMENT });
  assert.equal(notice(), null);
  assert.equal(describeDraftSaveProblems(draftSaveProblemsFor(other)).kind, DRAFT_SAVE_PROBLEM.DEVICE_FULL);
  clearDraftSaveProblems();
});

test('a submission the device queued clears its question; one it could not queue, or a refusal, does not', () => {
  const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
  assert.match(engine, /import \{ clearDraftSaveProblemsForFamily \} from '\.\/platform\/persistence\/draftSaveHealth\.js';/);
  const guarded = /if \(isSubmissionNotQueued\(result\)\) \{\s*setFeedback\(result\);\s*return;\s*\}\s*if \(!result\?\.blocked\) clearDraftSaveProblemsForFamily\(draftKey\);/g;
  // The ordinary Submit, and both registry-tool paths.
  const submit = region(engine, 'const performSubmit = async () => {', 'const handleSubmit = async () => {');
  assert.equal([...submit.matchAll(guarded)].length, 1, 'the ordinary Submit');
  const tool = region(engine, 'const handleMissingToolAction = async (', 'const handleModelingLabGrade = async (');
  assert.equal([...tool.matchAll(guarded)].length, 2, 'both tool paths');
});
