import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { region } from './helpers/sourceContract.mjs';
import {
  REVIEW_RESEND,
  SUBMISSION_DISPOSITION,
  createDurableAction,
  createMemoryOutboxStorage,
  drainDurableActions,
  isRetiredReviewWorkToResend,
  listDurableActions,
  listRetiredDurableActions,
  resendRetiredReviewWork,
  resetRetiredTallyVerificationForTests,
  summarizeDurableOutbox,
} from '../../src/platform/performance/durableActionOutbox.js';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

/*
 * REVIEW WORK THE SERVER REFUSED BY MISTAKE GOES BACK IN THE QUEUE.
 *
 * Before the server ingested a Test Cycle's Review, every Review answer came
 * back "permanently-invalid / secure-assignment-excluded" and was moved to the
 * device's `retired` store. The student's work is still there. These hold the
 * resend to: only that refusal, only Review, never a loop, never a lost or
 * double-counted envelope, and the retired tally exact throughout.
 */

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const STUDENT = 'S1';

const action = ({ actionId, studentId = STUDENT, kind = 'ordinarySubmission', role = 'review', questionIndex = 0 }) => createDurableAction({
  kind,
  studentId,
  assignmentId: 'cycle-1',
  questionIndex,
  actionId,
  createdAt: NOW - 3 * 24 * HOUR,
  payload: kind === 'questionProgress'
    ? { timeSpent: 40, activityRole: role }
    : { previousTotalAttempts: 0, activityRole: role, record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' } },
});

const refused = (row, { reason = REVIEW_RESEND.reason, disposition = SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, retiredAt = NOW - 2 * 24 * HOUR } = {}) => ({
  ...row,
  retirement: { disposition, reason, retiredAt, receipt: null },
});

const device = () => createMemoryOutboxStorage([], {
  retired: [
    refused(action({ actionId: 'review-q0', questionIndex: 0 })),
    refused(action({ actionId: 'review-q1', kind: 'stepSubmission', questionIndex: 1 })),
    refused(action({ actionId: 'review-progress', kind: 'questionProgress', questionIndex: 1 })),
    // Not Review on the device: stays retired.
    refused(action({ actionId: 'classwork-q2', role: 'classwork', questionIndex: 2 })),
    // Review, refused for a real reason: stays retired.
    refused(action({ actionId: 'review-closed', questionIndex: 3 }), { reason: 'section-closed-at-capture' }),
    // Review, retired because the server already had it: stays retired.
    refused(action({ actionId: 'review-duplicate', questionIndex: 4 }), { disposition: SUBMISSION_DISPOSITION.DUPLICATE }),
    // Another student on the same Chromebook: not theirs to resend now.
    refused(action({ actionId: 'classmate-review', studentId: 'S2', questionIndex: 0 })),
  ],
});

test('only Review work refused as "secure" is put back in the queue, for the student signed in', async () => {
  resetRetiredTallyVerificationForTests();
  const storage = device();
  const result = await resendRetiredReviewWork({ storage, studentId: STUDENT, now: NOW });
  assert.deepEqual(result, { checked: true, resent: 3 });

  const queued = await listDurableActions({ storage, studentId: STUDENT });
  assert.deepEqual(queued.map((row) => row.actionId).sort(), ['review-progress', 'review-q0', 'review-q1']);
  for (const row of queued) {
    assert.equal(row.retirement, undefined, 'a queued row carries no verdict');
    assert.deepEqual(row.reviewResend, {
      attempts: 1, lastAt: NOW, previousReason: REVIEW_RESEND.reason, previousRetiredAt: NOW - 2 * 24 * HOUR,
    });
    // The student's own envelope, unchanged, in its original capture order.
    assert.equal(row.payload.activityRole, 'review');
    assert.equal(row.createdAt, NOW - 3 * 24 * HOUR);
  }
  const stillRetired = (await listRetiredDurableActions({ storage })).map((row) => row.actionId).sort();
  assert.deepEqual(stillRetired, ['classmate-review', 'classwork-q2', 'review-closed', 'review-duplicate']);
  // The rule itself refuses another student's row, not only the listing.
  const classmate = (await listRetiredDurableActions({ storage })).find((row) => row.actionId === 'classmate-review');
  assert.equal(isRetiredReviewWorkToResend(classmate, { studentId: STUDENT, now: NOW }), false);
  assert.equal(isRetiredReviewWorkToResend(classmate, { studentId: 'S2', now: NOW }), true);
});

test('the retired tally stays exact across the move', async () => {
  resetRetiredTallyVerificationForTests();
  const storage = device();
  // A tally exists before the move, so the move itself must keep it right.
  const before = await summarizeDurableOutbox({ storage, studentId: STUDENT });
  assert.equal(before.retired, 6);
  await resendRetiredReviewWork({ storage, studentId: STUDENT, now: NOW });
  const after = await summarizeDurableOutbox({ storage, studentId: STUDENT });
  assert.equal(after.retired, 3);
  assert.equal(after.retiredByDisposition[SUBMISSION_DISPOSITION.PERMANENTLY_INVALID], 2, 'classwork-q2 and review-closed');
  assert.equal(after.queued, 3);
  assert.equal(storage.retiredRowScans(), 1, 'kept current by the move, not rebuilt by re-reading');
});

test('delivered work leaves the queue; work refused again is retired again and not resent in a loop', async () => {
  resetRetiredTallyVerificationForTests();
  const storage = device();
  await resendRetiredReviewWork({ storage, studentId: STUDENT, now: NOW });
  await drainDurableActions({
    storage,
    studentId: STUDENT,
    now: NOW,
    // A server that ingests Review takes two; one is still refused (say, the
    // page loaded before the fixed functions were live).
    reconcile: async (queued) => (queued.actionId === 'review-q1'
      ? { disposition: SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, reason: REVIEW_RESEND.reason }
      : { disposition: SUBMISSION_DISPOSITION.ACCEPTED }),
  });
  assert.deepEqual(await listDurableActions({ storage, studentId: STUDENT }), []);
  const again = (await listRetiredDurableActions({ storage })).find((row) => row.actionId === 'review-q1');
  assert.equal(again.reviewResend.attempts, 1, 'the resend count survives re-retirement');

  // Same page: never again, whatever the clock says.
  assert.deepEqual(await resendRetiredReviewWork({ storage, studentId: STUDENT, now: NOW + 7 * HOUR }), { checked: false, resent: 0 });

  // Later pages: not before the interval, then up to the cap, then never.
  const later = (row, hoursLater) => isRetiredReviewWorkToResend(row, { studentId: STUDENT, now: NOW + hoursLater * HOUR });
  assert.equal(later(again, 1), false, 'too soon after the last try');
  assert.equal(later(again, 7), true, 'a later page tries again');
  assert.equal(later({ ...again, reviewResend: { ...again.reviewResend, attempts: REVIEW_RESEND.maxAttempts } }, 100), false, 'never past the cap');
});

test('a row another tab moved, or that changed since it was read, is left alone', async () => {
  const storage = device();
  const [row] = (await listRetiredDurableActions({ storage, studentId: STUDENT })).filter((entry) => entry.actionId === 'review-q0');
  const restored = { ...row, retirement: undefined };
  // Changed since it was chosen: a drain retired it again at a later time.
  assert.equal(await storage.restoreRetiredIfUnchanged('review-q0', { ...row.retirement, retiredAt: row.retirement.retiredAt + 1 }, restored), false);
  assert.equal(await storage.restoreRetiredIfUnchanged('review-q0', row.retirement, restored), true);
  // The second tab arrives after the first: nothing left to move, nothing duplicated.
  assert.equal(await storage.restoreRetiredIfUnchanged('review-q0', row.retirement, restored), false);
  assert.equal((await listDurableActions({ storage, studentId: STUDENT })).length, 1);

  // A queued row under the same id is newer work owed a delivery: never overwritten.
  const newer = { ...action({ actionId: 'review-q1', kind: 'stepSubmission', questionIndex: 1 }), payload: { activityRole: 'review', newer: true } };
  const both = createMemoryOutboxStorage([newer], {
    retired: [refused(action({ actionId: 'review-q1', kind: 'stepSubmission', questionIndex: 1 }))],
  });
  const [old] = await listRetiredDurableActions({ storage: both });
  assert.equal(await both.restoreRetiredIfUnchanged('review-q1', old.retirement, { ...old, retirement: undefined }), false);
  const [kept] = await listDurableActions({ storage: both, studentId: STUDENT });
  assert.equal(kept.payload.newer, true);
  assert.equal((await listRetiredDurableActions({ storage: both })).length, 1, 'and the retired evidence stays');
});

test('the student runtime restores refused Review work before it reads and delivers the queue', () => {
  const recover = region(app, 'const recoverAndReconcileQueuedStudentWork = async () => {', 'const reconcileQueuedStudentWork = ', 'recoverAndReconcileQueuedStudentWork');
  const resendAt = recover.indexOf('await resendRetiredReviewWork({ studentId: user.id })');
  const listAt = recover.indexOf('const actions = await listDurableActions({ studentId: user.id });');
  assert.ok(resendAt >= 0, 'the resend runs on recovery');
  assert.ok(listAt > resendAt, 'before the queue is read, so restored work is shown and delivered in the same pass');
  // A failure there must not stop the rest of recovery.
  assert.match(recover.slice(resendAt, listAt), /\.catch\(/);
  // Imported where it is called: a .jsx call with no import passes every check.
  assert.match(region(app, 'import {\n  createDurableAction,', "} from './platform/performance/durableActionOutbox.js';", 'outbox import'), /\bresendRetiredReviewWork,/);
});
