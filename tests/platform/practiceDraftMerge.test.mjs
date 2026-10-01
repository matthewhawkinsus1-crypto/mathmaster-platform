/*
 * POST-DEADLINE PRACTICE MODE SURVIVES EVERY CHROMEBOOK THAT OPENS IT.
 *
 * Practice Mode's progress rides the workspace-draft document (App.jsx). Every
 * entry into a closed assignment starts a fresh tracker — every question
 * unattempted, on the graded variant — and sends it at once. The server merge
 * used to keep whichever whole tracker was saved last, so that fresh start
 * replaced the saved practice whenever it got there after it: when the device
 * could not read the saved copy first (the server out of reach as Practice
 * Mode opened, and back without the browser noticing), or closed before the
 * merged copy it sends after reading went out. The practice was gone on every
 * device (tests/browser/teacherWorkflow/draftCrossDeviceJourneys.mjs,
 * `practice`).
 *
 * Now the server keeps, per question, the record with more practice progress
 * — the rule the device already applied to the copy it reads back
 * (functions/shared/practiceTrackerMerge.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildWorkspaceDraftPatch,
  mergeWorkspaceDraftDocument,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { mergePracticeTrackers, samePracticeProgress } from '../../functions/shared/practiceTrackerMerge.mjs';
import { mergePracticeTrackers as appMerge } from '../../src/platform/student/practiceTrackerMerge.js';
import { executableSource } from './helpers/sourceContract.mjs';

const STUDENT = 'S-practice';
const ASSIGNMENT = 'A-closed';
const ISO = (minute) => new Date(Date.UTC(2026, 8, 20, 18, minute)).toISOString();

// What a fresh entry into Practice Mode holds for each question
// (App.jsx's createPracticeAssignmentTracker): no attempts, graded variant.
const freshStart = (count = 4) => Object.fromEntries(Array.from({ length: count }, (_, index) => [
  index, { status: 'unattempted', attemptCount: 0, totalAttempts: 0, variantIndex: 0, lastAttemptAt: null },
]));
const correct = (attempts, minute) => ({ status: 'correct', attemptCount: attempts, totalAttempts: attempts, variantIndex: 0, lastAttemptAt: ISO(minute) });
const attempted = (attempts, minute) => ({ status: 'attempted', attemptCount: attempts, totalAttempts: attempts, variantIndex: 0, lastAttemptAt: ISO(minute) });

const save = (existing, practice, practiceUpdatedAt) => mergeWorkspaceDraftDocument({
  existing,
  patch: buildWorkspaceDraftPatch({
    studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [],
    practice, hasPractice: true, practiceUpdatedAt,
  }),
});
const progress = (document) => Object.fromEntries(Object.entries(document?.practice || {})
  .map(([index, record]) => [index, `${record.status}/${record.totalAttempts}`]));

/* ------------------------------------------------- the one rule, both sides */

test('the restore and the server copy merge practice by the same rule', () => {
  assert.equal(appMerge, mergePracticeTrackers, 'App.jsx\'s import path is the shared rule itself');
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /import \{ mergePracticeTrackers \} from '\.\/platform\/student\/practiceTrackerMerge\.js';/);
  assert.match(app, /\[activeAssignmentId\]: mergePracticeTrackers\(stored\.practice \|\| \{\}, current\[activeAssignmentId\] \|\| \{\}\)/,
    'the copy read back is merged per question with the session\'s');
});

test('per question, more practice wins: a fresh start never beats saved work, and work done here is kept', () => {
  const saved = { ...freshStart(), 1: correct(2, 10), 3: attempted(1, 12) };
  const session = { ...freshStart(), 2: attempted(1, 20) };
  const merged = mergePracticeTrackers(saved, session);
  assert.deepEqual(merged[1], saved[1]);
  assert.deepEqual(merged[3], saved[3]);
  assert.deepEqual(merged[2], session[2]);
  // A later variant is more progress than any number of tries on an earlier one.
  const replaced = { ...attempted(0, 30), status: 'unattempted', variantIndex: 1 };
  assert.deepEqual(mergePracticeTrackers({ 0: attempted(3, 25) }, { 0: replaced })[0], replaced);
  // Equal progress keeps this session's row: it is the one on screen.
  const here = { ...correct(2, 10), timeSpent: 40 };
  assert.equal(mergePracticeTrackers({ 1: correct(2, 10) }, { 1: here })[1], here);
  assert.equal(samePracticeProgress(saved, mergePracticeTrackers(saved, freshStart())), true);
  assert.equal(samePracticeProgress({}, freshStart()), true, 'a fresh start records no progress');
  assert.equal(samePracticeProgress(saved, merged), false);
});

/* -------------------------------------------------------- the server copy */

test('the fresh start a device sends as Practice Mode opens changes nothing in the saved practice', () => {
  const saved = save(null, { ...freshStart(), 1: correct(2, 10), 3: attempted(1, 12) }, 5_000);
  // Saved after it, as when the device could not read the saved copy first.
  const after = save(saved, freshStart(), 9_000);
  assert.deepEqual(progress(after), progress(saved));
  assert.equal(after.practiceUpdatedAt, 5_000, 'and the practice is not dated by an opening');
});

test('an ordinary assignment\'s save (no practice in it) never clears the saved practice', () => {
  const saved = save(null, { 0: correct(1, 5) }, 5_000);
  const ordinary = save(saved, null, 9_000);
  assert.deepEqual(progress(ordinary), { 0: 'correct/1' });
  assert.equal(ordinary.practiceUpdatedAt, 5_000);
  const notSent = mergeWorkspaceDraftDocument({
    existing: saved,
    patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [] }),
  });
  assert.deepEqual(progress(notSent), { 0: 'correct/1' });
});

test('practice done on two Chromebooks is kept from both, in either order of saving', () => {
  // One device practised question 1; another, offline and never having read
  // the saved copy, practised question 2 — and saves later.
  const first = { ...freshStart(), 1: correct(2, 10) };
  const second = { ...freshStart(), 2: attempted(1, 40) };
  const oneThenTwo = save(save(null, first, 5_000), second, 9_000);
  const twoThenOne = save(save(null, second, 9_000), first, 5_000);
  for (const document of [oneThenTwo, twoThenOne]) {
    assert.deepEqual(progress(document), { 0: 'unattempted/0', 1: 'correct/2', 2: 'attempted/1', 3: 'unattempted/0' });
    assert.equal(document.practiceUpdatedAt, 9_000, 'dated by the latest save that changed it');
  }
  // On the same question, more progress wins whichever save lands last.
  const less = { 1: attempted(1, 10) };
  const more = { 1: correct(2, 11) };
  assert.deepEqual(progress(save(save(null, more, 2_000), less, 3_000)), { 1: 'correct/2' });
  assert.deepEqual(progress(save(save(null, less, 3_000), more, 2_000)), { 1: 'correct/2' });
});

test('a saved copy whose time is not a number (an older document) still merges', () => {
  const older = {
    schemaVersion: 1,
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    entries: [],
    practice: { 2: correct(2, 3) },
    // A Firestore Timestamp, as the case-review fixture stores it.
    practiceUpdatedAt: { seconds: 1_790_000_000, nanoseconds: 0 },
  };
  const after = save(older, freshStart(), 9_000);
  assert.equal(progress(after)[2], 'correct/2');
  const progressed = save(older, { ...freshStart(), 0: attempted(1, 30) }, 9_000);
  assert.deepEqual([progress(progressed)[0], progress(progressed)[2]], ['attempted/1', 'correct/2']);
  assert.equal(progressed.practiceUpdatedAt, 9_000);
});
