/*
 * CANONICAL STUDENT PERSISTENCE — THE SEPTEMBER 14 CONTRACT.
 *
 * On September 14 students worked through Warm-Up and Classwork, saw feedback,
 * moved between questions, and their teacher's gradebook showed the questions
 * unattempted. Every test in this file exists because of one of the two
 * defects that produced that, or because of a rule that must not be broken
 * while fixing them.
 *
 * WHAT THIS FILE CANNOT PROVE. It runs the queue and the classifier as
 * functions. It does not run IndexedDB, Firestore, or the callable. We already
 * had green in-memory outbox tests while real Chromebook persistence failed, so
 * the real-storage and real-Firestore halves live where they can actually fail:
 *
 *   tests/browser/durableOutboxRecovery.mjs        real IndexedDB, real reload
 *   tests/integration/canonicalPersistence*.test.mjs   real Firestore emulator
 *
 * The scenario numbers in the test names are the ones in the incident brief.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GRADE_BEARING_KINDS,
  DEVICE_SUMMARY_SCHEMA_VERSION,
  SUBMISSION_DISPOSITION,
  actionLane,
  actionStreamKey,
  createDurableAction,
  createMemoryOutboxStorage,
  drainDurableActions,
  enqueueDurableAction,
  groupDurableActionsIntoStreams,
  listDurableActions,
  listRetiredDurableActions,
  migrateLegacyDurableAction,
  summarizeDurableOutbox,
} from '../../src/platform/performance/durableActionOutbox.js';
import {
  buildIngestedAttempt,
  buildSubmissionEnvelope,
  captureSectionAccessProof,
  decideSubmissionIngestion,
  normalizeSubmissionEnvelope,
  resolveLiveSectionAccess,
} from '../../functions/shared/submissionIngestion.mjs';
import { classifyCapturedSubmission } from '../../functions/shared/studentSubmissionDisposition.mjs';

const STUDENT = 'S1042';
const ASSIGNMENT = 'assignment.with`punctuation';

const submission = ({
  actionId, questionIndex = 0, previous = 0, attempts = previous + 1,
  kind = 'ordinarySubmission', createdAt = Date.now(), role = 'classwork',
} = {}) => createDurableAction({
  kind,
  studentId: STUDENT,
  assignmentId: ASSIGNMENT,
  questionIndex,
  actionId,
  createdAt,
  payload: {
    previousTotalAttempts: previous,
    activityRole: role,
    record: { totalAttempts: attempts, attemptCount: attempts, status: 'attempted' },
  },
});

const checkpoint = ({ actionId, questionIndex = 0 } = {}) => createDurableAction({
  kind: 'responseCheckpoint',
  studentId: STUDENT,
  assignmentId: ASSIGNMENT,
  questionIndex,
  actionId,
  payload: { documentId: `cp-${questionIndex}`, activityRole: 'classwork' },
});

const progress = ({ actionId, questionIndex = 0, timeSpent = 30 } = {}) => createDurableAction({
  kind: 'questionProgress',
  studentId: STUDENT,
  assignmentId: ASSIGNMENT,
  questionIndex,
  actionId,
  payload: { timeSpent, activityRole: 'classwork' },
});

/**
 * A canonical store that behaves the way the server does: idempotent on the
 * action id, ordered on `previousTotalAttempts`, and classifying rather than
 * answering every failure with one word.
 */
const canonicalStore = ({ failFor = () => null } = {}) => {
  const records = new Map();
  const seen = [];
  return {
    records,
    seen,
    attempts: (questionIndex = 0) => Number(records.get(`${ASSIGNMENT}:${questionIndex}`)?.totalAttempts || 0),
    async reconcile(action) {
      seen.push(action.actionId);
      const failure = failFor(action);
      if (failure) {
        if (failure instanceof Error) throw failure;
        return failure;
      }
      const key = `${action.assignmentId}:${action.questionIndex}`;
      const current = records.get(key) || { totalAttempts: 0, timeSpent: 0 };
      if (action.kind === 'questionProgress') {
        records.set(key, { ...current, timeSpent: Math.max(current.timeSpent || 0, action.payload.timeSpent || 0) });
        return { disposition: SUBMISSION_DISPOSITION.ACCEPTED };
      }
      if (action.kind === 'responseCheckpoint') return { disposition: SUBMISSION_DISPOSITION.ACCEPTED };
      const classification = classifyCapturedSubmission({
        actionId: action.actionId,
        kind: action.kind,
        activityRole: action.payload.activityRole,
        capturedAt: action.createdAt,
        previousTotalAttempts: action.payload.previousTotalAttempts,
        canonicalRecord: current,
        assignmentExists: true,
        gradeRecordExists: true,
        authorizedForClass: true,
        assignmentClosedAtCapture: false,
        sectionOpenAtCapture: true,
      });
      if (classification.disposition !== SUBMISSION_DISPOSITION.ACCEPTED) return classification;
      records.set(key, { ...action.payload.record, lastSubmissionId: action.actionId });
      return { disposition: SUBMISSION_DISPOSITION.ACCEPTED };
    },
  };
};

const drain = (storage, reconcile) => drainDurableActions({ storage, studentId: STUDENT, reconcile, timeoutMs: 500 });

/* ==========================================================================
 * THE HEAD-OF-LINE DEFECT.
 *
 * The old drain was one `for` loop over one list that `break`s on the first
 * failure, so anything ahead of a Submit could hold it back indefinitely.
 * ======================================================================== */

test('5. a failing response checkpoint ahead of a Submit does not block the Submit', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore({
    failFor: (action) => (action.kind === 'responseCheckpoint' ? new Error('rules rejected the checkpoint') : null),
  });
  // Captured in this order: the checkpoint is older, so the old serial drain
  // reached it first and stopped there.
  await enqueueDurableAction(checkpoint({ actionId: 'cp-blocked' }), { storage });
  await enqueueDurableAction(submission({ actionId: 'submit-behind-checkpoint' }), { storage });

  const result = await drain(storage, store.reconcile);
  assert.equal(store.attempts(0), 1, 'the Submit must reach canonical storage');
  assert.equal(result.remainingGrade, 0);
  // The checkpoint is still owed a delivery, and still there to be delivered.
  assert.deepEqual((await listDurableActions({ storage })).map((action) => action.actionId), ['cp-blocked']);
});

test('6. a failing progress save ahead of a Submit does not block the Submit', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore({
    failFor: (action) => (action.kind === 'questionProgress' ? { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'offline' } : null),
  });
  await enqueueDurableAction(progress({ actionId: 'next-blocked' }), { storage });
  await enqueueDurableAction(submission({ actionId: 'submit-behind-progress' }), { storage });

  await drain(storage, store.reconcile);
  assert.equal(store.attempts(0), 1);
  assert.deepEqual((await listDurableActions({ storage })).map((action) => action.actionId), ['next-blocked']);
});

test('a grade-bearing action is attempted before background work even when it was captured later', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore();
  await enqueueDurableAction(checkpoint({ actionId: 'cp-first' }), { storage });
  await enqueueDurableAction(progress({ actionId: 'progress-first' }), { storage });
  await enqueueDurableAction(submission({ actionId: 'submit-last' }), { storage });

  await drain(storage, store.reconcile);
  assert.equal(store.seen[0], 'submit-last', 'the Submit must be tried first, not third');
});

test('a reconcile that never answers is bounded, and the next question still reaches canonical storage', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore({
    // A Firestore client transaction does not fail fast offline: it waits for
    // the network. One of those used to own the single global drain chain.
    failFor: (action) => (action.questionIndex === 0 ? new Promise(() => {}) : null),
  });
  await enqueueDurableAction(submission({ actionId: 'hung-q0', questionIndex: 0 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'fine-q1', questionIndex: 1 }), { storage });

  const result = await drainDurableActions({
    storage,
    studentId: STUDENT,
    reconcile: (action) => Promise.resolve(store.reconcile(action)).then((value) => value),
    timeoutMs: 80,
  });
  assert.equal(store.attempts(1), 1, 'question 1 must not wait behind a hung question 0');
  assert.equal(result.remainingGrade, 1);
  assert.match(result.retained[0].reason, /^delivery-error:/);
});

/*
 * A HUNG QUESTION MUST NOT MAKE ANOTHER QUESTION WAIT OUT ITS TIMEOUT.
 *
 * Grouping into streams stopped a stalled question blocking another one
 * PERMANENTLY. Draining those streams one after another still made question 2
 * wait the full reconcile timeout behind question 1 — fifteen seconds in
 * production. Independent streams run concurrently now, so "not blocked" means
 * "not delayed", which is what the invariant actually says.
 */
test('a hung question 1 does not delay question 2, and question 3 stays ordered', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore();
  const TIMEOUT_MS = 800;
  const landedAt = new Map();

  const reconcile = async (action) => {
    // Question 1 never answers at all — the offline Firestore transaction that
    // waits for connectivity rather than failing.
    if (action.questionIndex === 1) return new Promise(() => {});
    const outcome = await store.reconcile(action);
    landedAt.set(action.actionId, Date.now());
    return outcome;
  };

  await enqueueDurableAction(submission({ actionId: 'q1-hangs', questionIndex: 1 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'q2-fast', questionIndex: 2 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'q3-a1', questionIndex: 3, previous: 0, attempts: 1 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'q3-a2', questionIndex: 3, previous: 1, attempts: 2 }), { storage });

  const startedAt = Date.now();
  const result = await drainDurableActions({
    storage, studentId: STUDENT, reconcile, timeoutMs: TIMEOUT_MS,
  });

  // Question 2 is canonical, and it got there without waiting out question 1.
  assert.equal(store.attempts(2), 1);
  const q2Delay = landedAt.get('q2-fast') - startedAt;
  assert.ok(
    q2Delay < TIMEOUT_MS / 2,
    `question 2 landed after ${q2Delay}ms; it must not wait behind question 1's ${TIMEOUT_MS}ms timeout`,
  );

  // Question 3's two attempts are still in the order the student made them.
  assert.equal(store.attempts(3), 2);
  assert.ok(store.seen.indexOf('q3-a1') < store.seen.indexOf('q3-a2'));

  // And the hung question is kept, not discarded.
  assert.equal(result.remainingGrade, 1);
  assert.deepEqual((await listDurableActions({ storage })).map((action) => action.actionId), ['q1-hangs']);
});

test('the pool is bounded: a hundred queued questions never open more than the limit at once', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore();
  let inFlight = 0;
  let peak = 0;
  const reconcile = async (action) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => { setTimeout(resolve, 1); });
    try {
      return await store.reconcile(action);
    } finally {
      inFlight -= 1;
    }
  };

  for (let question = 0; question < 100; question += 1) {
    // eslint-disable-next-line no-await-in-loop
    await enqueueDurableAction(submission({ actionId: `bulk-q${question}`, questionIndex: question }), { storage });
  }
  const result = await drainDurableActions({
    storage, studentId: STUDENT, reconcile, timeoutMs: 2000, gradeConcurrency: 4,
  });

  assert.equal(result.remaining, 0, 'every question must be delivered');
  assert.ok(peak > 1, 'independent questions must actually run concurrently');
  assert.ok(peak <= 4, `peak concurrency was ${peak}; a recovered queue must not fire unbounded writes`);
});

test('a stalled grade stream still runs before any background work starts', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore();
  const order = [];
  const reconcile = async (action) => {
    order.push(action.kind);
    if (action.actionId === 'slow-submit') await new Promise((resolve) => { setTimeout(resolve, 30); });
    return store.reconcile(action);
  };

  // Captured oldest-first: the background work would win a plain queue order.
  await enqueueDurableAction(checkpoint({ actionId: 'old-checkpoint' }), { storage });
  await enqueueDurableAction(progress({ actionId: 'old-progress' }), { storage });
  await enqueueDurableAction(submission({ actionId: 'slow-submit', questionIndex: 5 }), { storage });

  await drainDurableActions({ storage, studentId: STUDENT, reconcile, timeoutMs: 2000 });
  assert.equal(order[0], 'ordinarySubmission', 'the grade lane must start first');
  assert.ok(
    order.indexOf('ordinarySubmission') < order.indexOf('responseCheckpoint'),
    'background work must not start before grade-bearing work has been attempted',
  );
  assert.equal(store.attempts(5), 1);
});

/* ==========================================================================
 * NOTHING CAPTURED IS SILENTLY DISCARDED.
 * ======================================================================== */

test('2. an unclassified rejection keeps the submission and writes no grade', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore({ failFor: () => ({ status: 'rejected' }) });
  await enqueueDurableAction(submission({ actionId: 'bare-rejection' }), { storage });

  const result = await drain(storage, store.reconcile);
  assert.equal(store.records.size, 0);
  assert.equal((await listDurableActions({ storage })).length, 1);
  assert.equal(result.retained[0].disposition, SUBMISSION_DISPOSITION.RETRYABLE);
});

test('a proven retirement keeps the envelope as recovery evidence rather than deleting it', async () => {
  const storage = createMemoryOutboxStorage();
  await enqueueDurableAction(submission({ actionId: 'after-the-bell' }), { storage });
  await drain(storage, async () => ({
    disposition: SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
    reason: 'section-closed-at-capture',
  }));

  assert.equal((await listDurableActions({ storage })).length, 0);
  const retired = await listRetiredDurableActions({ storage });
  assert.equal(retired.length, 1);
  assert.equal(retired[0].retirement.reason, 'section-closed-at-capture');
  assert.equal(retired[0].payload.record.totalAttempts, 1);
});

test('a needs-review outcome keeps the work and is counted for the teacher', async () => {
  const storage = createMemoryOutboxStorage();
  await enqueueDurableAction(submission({ actionId: 'unprovable' }), { storage });
  const result = await drain(storage, async () => ({
    disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW,
    reason: 'section-close-time-unknown',
  }));
  assert.equal(result.tally.needsReview, 1);
  assert.equal((await listDurableActions({ storage })).length, 1);

  const summary = await summarizeDurableOutbox({ storage, studentId: STUDENT });
  assert.equal(summary.queuedGradeBearing, 1);
  assert.equal(summary.needsReview, 1);
  assert.equal(summary.blockedReasons['section-close-time-unknown'], 1);
});

test('one lost attempt no longer cascades into every later attempt on that question', async () => {
  // THE CASCADE. A rejected first attempt used to be DELETED, which left the
  // canonical count behind what the second attempt expected — so the second was
  // "rejected" and deleted too, and so on. The whole question was lost.
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore();
  let firstIsOffline = true;
  const reconcile = async (action) => {
    if (action.actionId === 'attempt-1' && firstIsOffline) throw new Error('offline');
    return store.reconcile(action);
  };

  await enqueueDurableAction(submission({ actionId: 'attempt-1', previous: 0, attempts: 1 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'attempt-2', previous: 1, attempts: 2 }), { storage });
  await drain(storage, reconcile);
  assert.equal(store.attempts(0), 0, 'nothing may land while the earlier attempt is still owed');
  assert.equal((await listDurableActions({ storage })).length, 2, 'both attempts must survive');

  firstIsOffline = false;
  await drain(storage, reconcile);
  assert.equal(store.attempts(0), 2, 'both attempts land, in order, once the first can be delivered');
  assert.equal((await listDurableActions({ storage })).length, 0);
});

/* ==========================================================================
 * ORDERING.
 * ======================================================================== */

test('7. multiple offline submissions preserve order per question, and questions do not block each other', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore();
  await enqueueDurableAction(submission({ actionId: 'q0-a1', questionIndex: 0, previous: 0, attempts: 1 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'q1-a1', questionIndex: 1, previous: 0, attempts: 1 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'q0-a2', questionIndex: 0, previous: 1, attempts: 2 }), { storage });

  await drain(storage, store.reconcile);
  assert.equal(store.attempts(0), 2);
  assert.equal(store.attempts(1), 1);
  assert.ok(
    store.seen.indexOf('q0-a1') < store.seen.indexOf('q0-a2'),
    'two attempts at the SAME question must reach the server in the order the student made them',
  );
});

test('10. rapid Step Algebra submissions stay in one ordered stream', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore();
  await enqueueDurableAction(submission({ actionId: 'step-1', kind: 'stepSubmission', previous: 0, attempts: 1 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'step-2', kind: 'stepSubmission', previous: 1, attempts: 2 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'step-3', kind: 'stepSubmission', previous: 2, attempts: 3 }), { storage });

  const streams = groupDurableActionsIntoStreams(await listDurableActions({ storage }));
  assert.equal(streams.length, 1, 'steps on one question are one stream, or they can be reordered');
  await drain(storage, store.reconcile);
  assert.deepEqual(store.seen, ['step-1', 'step-2', 'step-3']);
  assert.equal(store.attempts(0), 3);
});

test('8. Submit then Next records the attempt and merges the time without undoing it', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore();
  await enqueueDurableAction(submission({ actionId: 'submit-then-next' }), { storage });
  await enqueueDurableAction(progress({ actionId: 'next', timeSpent: 42 }), { storage });

  await drain(storage, store.reconcile);
  const record = store.records.get(`${ASSIGNMENT}:0`);
  assert.equal(record.totalAttempts, 1);
  assert.equal(record.timeSpent, 42);
});

test('a grade stream and a background stream for the same question are separate streams', () => {
  assert.equal(actionLane(submission({ actionId: 'x' })), 'grade');
  assert.equal(actionLane(checkpoint({ actionId: 'y' })), 'background');
  assert.notEqual(actionStreamKey(submission({ actionId: 'x' })), actionStreamKey(checkpoint({ actionId: 'y' })));
  // ...and an assignment id containing the key separator cannot merge two
  // unrelated questions into one ordered stream.
  assert.notEqual(
    actionStreamKey({ kind: 'ordinarySubmission', assignmentId: 'a', questionIndex: 1 }),
    actionStreamKey({ kind: 'ordinarySubmission', assignmentId: 'a 1', questionIndex: -1 }),
  );
});

/* ==========================================================================
 * IDEMPOTENCY AND STALENESS.
 * ======================================================================== */

test('15. a duplicate retry does not create a second attempt', async () => {
  const storage = createMemoryOutboxStorage();
  const store = canonicalStore();
  const action = submission({ actionId: 'one-click' });
  await enqueueDurableAction(action, { storage });
  await drain(storage, store.reconcile);
  // The tab closed before the queue row was removed, so the same envelope is
  // delivered again after the reload.
  await enqueueDurableAction(action, { storage });
  await drain(storage, store.reconcile);
  assert.equal(store.attempts(0), 1);
});

test('16. a stale older action cannot overwrite a newer canonical attempt', () => {
  const stale = classifyCapturedSubmission({
    actionId: 'stale',
    previousTotalAttempts: 0,
    canonicalRecord: { totalAttempts: 3, lastSubmissionId: 'newer' },
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: true,
    assignmentClosedAtCapture: false,
    sectionOpenAtCapture: true,
  });
  assert.equal(stale.disposition, SUBMISSION_DISPOSITION.SUPERSEDED);
  assert.equal(stale.reason, 'newer-canonical-attempt');
});

test('20. a draft from another device cannot overwrite a newer grade', () => {
  // A second Chromebook holding an older envelope for the same question reads
  // as superseded, which retires it — it never rolls the record backward.
  const fromOtherDevice = decideSubmissionIngestion({
    envelope: normalizeSubmissionEnvelope(buildSubmissionEnvelope({
      actionId: 'other-device',
      kind: 'ordinarySubmission',
      studentId: STUDENT,
      assignmentId: ASSIGNMENT,
      questionIndex: 0,
      activityRole: 'classwork',
      previousTotalAttempts: 0,
      record: { totalAttempts: 1, status: 'attempted' },
    })),
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: true,
    assignmentClosedAtCapture: false,
    question: { type: 'functionGraph', activityRole: 'classwork' },
    canonicalRecord: { totalAttempts: 2, variantIndex: 0, status: 'attempted' },
  });
  assert.equal(fromOtherDevice.disposition, SUBMISSION_DISPOSITION.SUPERSEDED);
});

/* ==========================================================================
 * LIFECYCLE, JUDGED AT CAPTURE TIME.
 * ======================================================================== */

const CAPTURED_AT = Date.parse('2026-09-14T15:10:00Z');
const CLOSED_AT = Date.parse('2026-09-14T15:15:00Z');

test('13. Classwork closed AFTER the capture keeps the submission', () => {
  const live = resolveLiveSectionAccess({
    assignment: {
      sectionAccess: { classwork: { overridesByClassId: { 'class-a': { state: 'closed', changedAt: new Date(CLOSED_AT).toISOString() } } } },
    },
    activityRole: 'classwork',
    classId: 'class-a',
  });
  assert.equal(live.isOpen, false, 'the section is closed right now');

  const outcome = classifyCapturedSubmission({
    actionId: 'captured-before-close',
    capturedAt: CAPTURED_AT,
    previousTotalAttempts: 0,
    canonicalRecord: { totalAttempts: 0 },
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: true,
    assignmentClosedAtCapture: false,
    sectionOpenAtCapture: true,
  });
  assert.equal(outcome.disposition, SUBMISSION_DISPOSITION.ACCEPTED);
});

test('a section closed BEFORE the capture is the one case that retires the work', () => {
  const outcome = classifyCapturedSubmission({
    actionId: 'captured-after-close',
    capturedAt: CLOSED_AT + 60_000,
    previousTotalAttempts: 0,
    canonicalRecord: { totalAttempts: 0 },
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: true,
    assignmentClosedAtCapture: false,
    sectionOpenAtCapture: false,
  });
  assert.equal(outcome.disposition, SUBMISSION_DISPOSITION.PERMANENTLY_INVALID);
  assert.equal(outcome.reason, 'section-closed-at-capture');
});

test('a section closed with no record of WHEN is kept for review, never erased', () => {
  const outcome = classifyCapturedSubmission({
    actionId: 'unprovable-close',
    capturedAt: CAPTURED_AT,
    previousTotalAttempts: 0,
    canonicalRecord: { totalAttempts: 0 },
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: true,
    assignmentClosedAtCapture: false,
    // Closed now, nothing says when. The old code resolved this ambiguity by
    // destroying the student's answer.
    sectionOpenAtCapture: null,
  });
  assert.equal(outcome.disposition, SUBMISSION_DISPOSITION.NEEDS_REVIEW);
  assert.equal(outcome.reason, 'section-close-time-unknown');
});

test('the capture-time section proof beats a teacher edit made afterwards', () => {
  const proof = captureSectionAccessProof({
    sectionAccess: { role: 'classwork', enabled: true, isOpen: true, status: 'open', override: null },
    capturedAt: CAPTURED_AT,
  });
  const envelope = normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: 'proofed',
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: 0,
    activityRole: 'classwork',
    capturedAt: CAPTURED_AT,
    previousTotalAttempts: 0,
    record: { totalAttempts: 1, status: 'attempted' },
    capturedSectionAccess: proof,
  }));
  const decision = decideSubmissionIngestion({
    envelope,
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: true,
    assignmentClosedAtCapture: false,
    // The teacher has since closed it, AND the close carries no timestamp —
    // which without the capture proof would be the unprovable case.
    liveSectionAccess: { role: 'classwork', enabled: true, isOpen: false, override: null },
    question: { type: 'functionGraph', activityRole: 'classwork' },
    canonicalRecord: null,
  });
  assert.equal(decision.disposition, SUBMISSION_DISPOSITION.ACCEPTED);
});

test('11 & 12. a teacher-reopened Warm-Up survives the assignment closing again', () => {
  const reopened = {
    actionId: 'warmup-reopened',
    activityRole: 'warmup',
    capturedAt: CAPTURED_AT,
    previousTotalAttempts: 0,
    canonicalRecord: { totalAttempts: 0 },
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: true,
    assignmentClosedAtCapture: true,
    warmupActiveAtCapture: true,
    sectionOpenAtCapture: true,
  };
  assert.equal(
    classifyCapturedSubmission({ ...reopened, teacherReopenedWarmupAtCapture: true }).disposition,
    SUBMISSION_DISPOSITION.ACCEPTED,
  );
  // Closed again, and the reopen is what carried it. Without the reopen the
  // same capture is correctly refused.
  assert.equal(
    classifyCapturedSubmission({ ...reopened, teacherReopenedWarmupAtCapture: false }).disposition,
    SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
  );
  // A Warm-Up that was NOT active at capture is refused even with a reopen
  // flag, so the exception cannot be used as a general bypass.
  assert.equal(
    classifyCapturedSubmission({ ...reopened, assignmentClosedAtCapture: false, teacherReopenedWarmupAtCapture: false, warmupActiveAtCapture: false }).reason,
    'warmup-closed-at-capture',
  );
});

test('14. work captured while authorized survives a roster read that has not caught up', () => {
  const outcome = classifyCapturedSubmission({
    actionId: 'authorized-at-capture',
    capturedAt: CAPTURED_AT,
    previousTotalAttempts: 0,
    canonicalRecord: { totalAttempts: 0 },
    assignmentExists: true,
    gradeRecordExists: true,
    // The assignment no longer names this student's class.
    authorizedForClass: false,
    assignmentClosedAtCapture: false,
    sectionOpenAtCapture: true,
  });
  assert.equal(outcome.disposition, SUBMISSION_DISPOSITION.RETRYABLE);
  assert.equal(outcome.reason, 'assignment-not-assigned-to-class');
});

test('a missing grade row is a retry, not a reason to destroy the submission', () => {
  const outcome = classifyCapturedSubmission({
    actionId: 'no-roster-row',
    previousTotalAttempts: 0,
    canonicalRecord: null,
    assignmentExists: true,
    gradeRecordExists: false,
    authorizedForClass: true,
    assignmentClosedAtCapture: false,
    sectionOpenAtCapture: true,
  });
  assert.equal(outcome.disposition, SUBMISSION_DISPOSITION.RETRYABLE);
});

test('a retryable condition that never clears escalates to review, and still keeps the work', () => {
  const stuck = {
    actionId: 'stuck',
    capturedAt: Date.now() - (8 * 24 * 60 * 60 * 1000),
    previousTotalAttempts: 0,
    canonicalRecord: null,
    assignmentExists: false,
    gradeRecordExists: true,
    authorizedForClass: true,
    assignmentClosedAtCapture: false,
    sectionOpenAtCapture: true,
  };
  assert.equal(classifyCapturedSubmission({ ...stuck, deliveryAttempts: 2 }).disposition, SUBMISSION_DISPOSITION.RETRYABLE);
  assert.equal(classifyCapturedSubmission({ ...stuck, deliveryAttempts: 400 }).disposition, SUBMISSION_DISPOSITION.NEEDS_REVIEW);
});

test('idempotency is decided before eligibility, so a reconnect after the bell cannot invalidate a graded attempt', () => {
  const outcome = classifyCapturedSubmission({
    actionId: 'already-landed',
    capturedAt: CAPTURED_AT,
    previousTotalAttempts: 0,
    canonicalRecord: { totalAttempts: 1, lastSubmissionId: 'already-landed' },
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: true,
    // Everything about the section says no, now.
    assignmentClosedAtCapture: true,
    sectionOpenAtCapture: false,
  });
  assert.equal(outcome.disposition, SUBMISSION_DISPOSITION.DUPLICATE);
});

/* ==========================================================================
 * 23. SECURITY. A BROWSER MAY NOT SUPPLY A VERDICT.
 * ======================================================================== */

const LITERAL_QUESTION = { type: 'literal', acceptedAnswers: ['2x+1'], solveFor: 'y', activityRole: 'classwork', prompt: 'Solve' };

test('23. a forged correct verdict is overruled by the server marking the raw response', () => {
  const forged = buildSubmissionEnvelope({
    actionId: 'forged',
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: 0,
    activityRole: 'classwork',
    previousTotalAttempts: 0,
    record: { totalAttempts: 1, attemptCount: 1, status: 'correct', partialCredit: 100, bestPartialCredit: 100 },
    response: { kind: 'scalar', type: 'literal', value: 'not the answer', fields: [] },
  });
  const built = buildIngestedAttempt({
    envelope: forged, assignment: { id: ASSIGNMENT }, question: LITERAL_QUESTION, canonicalRecord: null,
  });
  assert.equal(built.gradedBy, 'server');
  assert.equal(built.record.status, 'attempted');
  assert.equal(built.record.partialCredit, 0);
});

test('23. the same student answering correctly is marked correct by the server, not by the browser', () => {
  const honest = buildSubmissionEnvelope({
    actionId: 'honest',
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: 0,
    activityRole: 'classwork',
    previousTotalAttempts: 0,
    // The browser claims WRONG; the server still marks the response correct.
    record: { totalAttempts: 1, attemptCount: 1, status: 'attempted', partialCredit: 0 },
    response: { kind: 'scalar', type: 'literal', value: '2x+1', fields: [] },
  });
  const built = buildIngestedAttempt({
    envelope: honest, assignment: { id: ASSIGNMENT }, question: LITERAL_QUESTION, canonicalRecord: null,
  });
  assert.equal(built.gradedBy, 'server');
  assert.equal(built.record.status, 'correct');
});

test('23. a question the server cannot mark accepts the client record but bounds every field that decides credit', () => {
  const inflated = buildSubmissionEnvelope({
    actionId: 'inflated',
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: 0,
    activityRole: 'classwork',
    previousTotalAttempts: 0,
    record: { totalAttempts: 99, attemptCount: 99, status: 'correct', partialCredit: 900, bestPartialCredit: 900 },
  });
  const built = buildIngestedAttempt({
    envelope: inflated,
    assignment: { id: ASSIGNMENT },
    question: { type: 'functionGraph', activityRole: 'classwork' },
    canonicalRecord: null,
  });
  assert.equal(built.gradedBy, 'client');
  assert.equal(built.record.totalAttempts, 1, 'attempts advance by at most one, from the count the SERVER read');
  assert.equal(built.record.attemptCount, 1);
  assert.equal(built.record.partialCredit, 100);
  assert.equal(built.record.lastSubmissionId, 'inflated', 'the submission id is stamped here, never accepted');
});

test('23. a question already correct cannot be un-terminalled by a later envelope', () => {
  const built = buildIngestedAttempt({
    envelope: buildSubmissionEnvelope({
      actionId: 'downgrade',
      kind: 'ordinarySubmission',
      studentId: STUDENT,
      assignmentId: ASSIGNMENT,
      questionIndex: 0,
      activityRole: 'classwork',
      previousTotalAttempts: 1,
      record: { totalAttempts: 2, attemptCount: 2, status: 'attempted', partialCredit: 0 },
    }),
    assignment: { id: ASSIGNMENT },
    question: { type: 'functionGraph', activityRole: 'classwork' },
    canonicalRecord: { totalAttempts: 1, attemptCount: 1, status: 'correct', bestPartialCredit: 100 },
  });
  assert.equal(built.record.status, 'correct');
  assert.equal(built.record.bestPartialCredit, 100, 'earned credit is never erased by a retry');
});

test('23. secure assessment data cannot enter the ordinary outbox or an ingestion envelope', () => {
  assert.throws(
    () => createDurableAction({ kind: 'ordinarySubmission', studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 0, payload: { secure: true } }),
    /Protected assessment data/,
  );
  assert.throws(
    () => buildSubmissionEnvelope({
      actionId: 'smuggled', kind: 'ordinarySubmission', studentId: STUDENT, assignmentId: ASSIGNMENT,
      questionIndex: 0, activityRole: 'classwork', record: { acceptedAnswers: ['2x+1'] },
    }),
    /answer keys, generator seeds or secure assessment data/,
  );
  assert.equal(
    normalizeSubmissionEnvelope({ actionId: 'a', kind: 'ordinarySubmission', assignmentId: ASSIGNMENT, questionIndex: 0, seed: 12 }),
    null,
  );
  // Only grade-bearing kinds are ingestible; a checkpoint may not become one.
  assert.equal(
    normalizeSubmissionEnvelope({ actionId: 'a', kind: 'responseCheckpoint', assignmentId: ASSIGNMENT, questionIndex: 0 }),
    null,
  );
  assert.deepEqual([...GRADE_BEARING_KINDS], ['ordinarySubmission', 'stepSubmission', 'questionReplacement']);
});

/* ==========================================================================
 * 17 & 18. WHAT IS ALREADY ON THE CHROMEBOOKS.
 * ======================================================================== */

test('17. a PR #226 queue row is readable and drainable exactly as it was stored', async () => {
  // Written by the release that is in the field: schemaVersion 1, no lane, no
  // delivery annotation. A schema that made these unreadable would BE the
  // data loss.
  const legacy = {
    schemaVersion: 1,
    actionId: 'legacy-226',
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: 4,
    createdAt: Date.parse('2026-09-14T15:02:00Z'),
    createdOrder: Date.parse('2026-09-14T15:02:00Z') * 1000,
    payload: { previousTotalAttempts: 0, activityRole: 'warmup', record: { totalAttempts: 1, status: 'attempted' } },
  };
  const storage = createMemoryOutboxStorage([legacy]);
  const store = canonicalStore();

  const listed = await listDurableActions({ storage, studentId: STUDENT });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].schemaVersion, 1, 'the stored row is not rewritten');
  await drain(storage, store.reconcile);
  assert.equal(store.attempts(4), 1);
});

test('17. an even older row with no createdOrder still sorts and drains', async () => {
  const ancient = {
    schemaVersion: 1,
    actionId: 'no-created-order',
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: 0,
    createdAt: 1_700_000_000_000,
    payload: { previousTotalAttempts: 0, record: { totalAttempts: 1, status: 'attempted' } },
  };
  const migrated = migrateLegacyDurableAction(ancient);
  assert.equal(migrated.createdOrder, 1_700_000_000_000 * 1000);
  const storage = createMemoryOutboxStorage([ancient]);
  const store = canonicalStore();
  await drain(storage, store.reconcile);
  assert.equal(store.attempts(0), 1);
});

test('17. a row this release cannot understand is skipped, never dropped from storage', async () => {
  const storage = createMemoryOutboxStorage([
    { actionId: 'from-the-future', kind: 'somethingNew', studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 0 },
  ]);
  assert.equal((await listDurableActions({ storage })).length, 0, 'it is not drained');
  assert.equal((await storage.list()).length, 1, 'and it is still in storage');
});

test('18. a PR #243 checkpoint row keeps its deterministic id and stays a background action', async () => {
  const legacyCheckpoint = {
    schemaVersion: 1,
    actionId: 'response_checkpoint:S1042__a1__0____0__gen',
    kind: 'responseCheckpoint',
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: 0,
    createdAt: Date.parse('2026-09-14T15:03:00Z'),
    createdOrder: Date.parse('2026-09-14T15:03:00Z') * 1000,
    payload: { documentId: 'S1042__a1__0____0__gen', activityRole: 'warmup', revision: 3 },
  };
  const storage = createMemoryOutboxStorage([legacyCheckpoint]);
  const listed = await listDurableActions({ storage, studentId: STUDENT });
  assert.equal(listed[0].actionId, legacyCheckpoint.actionId);
  assert.equal(actionLane(listed[0]), 'background');
  assert.equal(listed[0].payload.revision, 3, 'the revision the deadline finalizer needs survives');
});

/* ==========================================================================
 * A DEVICE QUEUE BELONGS TO ASSIGNMENTS, NOT TO A DEVICE.
 *
 * The first version reported one aggregate, and an assignment report then
 * showed a Chromebook's whole queue as if every row belonged to the assignment
 * in front of the teacher.
 * ======================================================================== */

test('the device summary separates queued work by assignment', async () => {
  const storage = createMemoryOutboxStorage();
  const forAssignment = (assignmentId, actionId, questionIndex) => createDurableAction({
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId,
    questionIndex,
    actionId,
    payload: { previousTotalAttempts: 0, activityRole: 'classwork', record: { totalAttempts: 1, status: 'attempted' } },
  });

  // Nothing pending for assignment A; three pending for assignment B.
  await enqueueDurableAction(forAssignment('assignment-b', 'b-q0', 0), { storage });
  await enqueueDurableAction(forAssignment('assignment-b', 'b-q1', 1), { storage });
  await enqueueDurableAction(forAssignment('assignment-b', 'b-q2', 2), { storage });
  // ...plus one background action for A, which is not grade-bearing.
  await enqueueDurableAction(createDurableAction({
    kind: 'responseCheckpoint',
    studentId: STUDENT,
    assignmentId: 'assignment-a',
    questionIndex: 0,
    actionId: 'a-checkpoint',
    payload: { documentId: 'cp', activityRole: 'classwork' },
  }), { storage });

  const summary = await summarizeDurableOutbox({ storage, studentId: STUDENT });
  assert.equal(summary.summarySchemaVersion, DEVICE_SUMMARY_SCHEMA_VERSION);
  assert.equal(summary.queuedGradeBearing, 3, 'the device-wide total is still available');
  // THE NUMBER AN ASSIGNMENT REPORT MAY SHOW.
  assert.equal(summary.queuedGradeBearingByAssignment['assignment-b'], 3);
  assert.equal(
    summary.queuedGradeBearingByAssignment['assignment-a'],
    undefined,
    'assignment A has no grade-bearing work queued, and must not inherit B\'s count',
  );
  assert.equal(summary.queuedByAssignment['assignment-a'], 1, 'its checkpoint is still counted, as a checkpoint');
});

test('needs-review counts are broken down by assignment too', async () => {
  const storage = createMemoryOutboxStorage();
  const build = (assignmentId, actionId) => createDurableAction({
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId,
    questionIndex: 0,
    actionId,
    payload: { previousTotalAttempts: 0, activityRole: 'classwork', record: { totalAttempts: 1, status: 'attempted' } },
  });
  await enqueueDurableAction(build('assignment-a', 'a-review'), { storage });
  await enqueueDurableAction(build('assignment-b', 'b-fine'), { storage });

  await drainDurableActions({
    storage,
    studentId: STUDENT,
    timeoutMs: 500,
    reconcile: async (action) => (action.assignmentId === 'assignment-a'
      ? { disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason: 'section-close-time-unknown' }
      : { disposition: SUBMISSION_DISPOSITION.ACCEPTED }),
  });

  const summary = await summarizeDurableOutbox({ storage, studentId: STUDENT });
  assert.equal(summary.needsReviewByAssignment['assignment-a'], 1);
  assert.equal(summary.needsReviewByAssignment['assignment-b'], undefined);
});

/* ==========================================================================
 * 25. THIRTY STUDENTS AT ONCE.
 * ======================================================================== */

test('25. thirty students submitting ordinary work each reach canonical storage exactly once', async () => {
  const results = await Promise.all(Array.from({ length: 30 }, async (_unused, index) => {
    const studentId = `S${1000 + index}`;
    const storage = createMemoryOutboxStorage();
    const records = new Map();
    const reconcile = async (action) => {
      const key = `${action.assignmentId}:${action.questionIndex}`;
      const current = records.get(key) || { totalAttempts: 0 };
      if (current.lastSubmissionId === action.actionId) return { disposition: SUBMISSION_DISPOSITION.DUPLICATE };
      if (Number(current.totalAttempts) !== Number(action.payload.previousTotalAttempts)) {
        return { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'awaiting-earlier-attempt' };
      }
      records.set(key, { ...action.payload.record, lastSubmissionId: action.actionId });
      return { disposition: SUBMISSION_DISPOSITION.ACCEPTED };
    };
    for (let question = 0; question < 5; question += 1) {
      // eslint-disable-next-line no-await-in-loop
      await enqueueDurableAction(createDurableAction({
        kind: 'ordinarySubmission',
        studentId,
        assignmentId: ASSIGNMENT,
        questionIndex: question,
        actionId: `${studentId}-q${question}`,
        payload: { previousTotalAttempts: 0, activityRole: 'classwork', record: { totalAttempts: 1, status: 'attempted' } },
      }), { storage });
    }
    const result = await drainDurableActions({ storage, studentId, reconcile, timeoutMs: 1000 });
    return { studentId, records: records.size, remaining: result.remaining };
  }));

  assert.equal(results.length, 30);
  results.forEach((result) => {
    assert.equal(result.records, 5, `${result.studentId} must have five canonical records`);
    assert.equal(result.remaining, 0, `${result.studentId} must have an empty queue`);
  });
});

/* ==========================================================================
 * REVIEW FINDINGS — each of these was a real hole in the first version.
 * ======================================================================== */

test('a stale client snapshot cannot launder work submitted after a stamped close', async () => {
  const { sectionWasOpenAtCapture: openAtCapture } = await import('../../functions/shared/studentSubmissionDisposition.mjs');
  const closedAt = Date.parse('2026-09-14T15:00:00Z');
  const answeredAt = Date.parse('2026-09-14T15:05:00Z');
  const staleSnapshot = { role: 'classwork', enabled: true, isOpen: true, status: 'open', overrideChangedAt: null };
  const live = { role: 'classwork', enabled: true, isOpen: false, override: { state: 'closed', changedAt: new Date(closedAt).toISOString() } };

  // The teacher closed Classwork at 15:00. The student's assignment listener
  // had not caught up, so their capture proof still says "open" — and they
  // answered at 15:05. The assignment's own close time is the answer.
  assert.equal(openAtCapture({ capturedSectionAccess: staleSnapshot, liveSectionAccess: live, capturedAt: answeredAt }), false);

  // The rule the incident turned on is untouched: a close stamped AFTER the
  // capture closed the section on a student who had already answered.
  const closedLater = { ...live, override: { state: 'closed', changedAt: new Date(answeredAt + 600_000).toISOString() } };
  assert.equal(openAtCapture({ capturedSectionAccess: staleSnapshot, liveSectionAccess: closedLater, capturedAt: answeredAt }), true);

  // And a close with no recorded time still falls back to the capture witness.
  const noCloseTime = { role: 'classwork', enabled: true, isOpen: false, override: { state: 'closed', changedAt: null } };
  assert.equal(openAtCapture({ capturedSectionAccess: staleSnapshot, liveSectionAccess: noCloseTime, capturedAt: answeredAt }), true);
  assert.equal(openAtCapture({ liveSectionAccess: noCloseTime, capturedAt: answeredAt }), null);
});

test('a DOL replacement keeps its attempt reset, so the next answer is graded rather than retired', async () => {
  const { requestReplacementQuestion } = await import('../../functions/shared/attemptPolicy.mjs');
  // The canonical state a student reaches after exhausting a DOL question.
  const expired = { status: 'expired', attemptCount: 3, totalAttempts: 3, variantIndex: 0, bestPartialCredit: 40 };
  // What the browser's replacement policy produces — the reset is deliberate.
  const replacement = requestReplacementQuestion(expired, { clearHistory: true, clearBest: true });
  assert.equal(replacement.totalAttempts, 0);
  assert.equal(replacement.variantIndex, 1);

  const built = buildIngestedAttempt({
    envelope: buildSubmissionEnvelope({
      actionId: 'dol-replacement',
      kind: 'questionReplacement',
      studentId: STUDENT,
      assignmentId: ASSIGNMENT,
      questionIndex: 0,
      activityRole: 'dol',
      previousTotalAttempts: 3,
      record: replacement,
    }),
    assignment: { id: ASSIGNMENT },
    question: { type: 'functionGraph', activityRole: 'dol' },
    canonicalRecord: expired,
  });

  // Clamping this back up to 3 is what made the NEXT submission — which
  // carries previousTotalAttempts: 0 — read as superseded and get retired
  // without ever being graded.
  assert.equal(built.record.totalAttempts, 0, 'the replacement reset must survive ingestion');
  assert.equal(built.record.attemptCount, 0);
  assert.equal(built.record.status, 'unattempted');
  assert.equal(built.record.variantIndex, 1);
  assert.equal(built.record.bestPartialCredit, 0, 'clearBest must survive too');

  // And the student's answer to the replacement is now accepted.
  assert.equal(
    classifyCapturedSubmission({
      actionId: 'answer-to-replacement',
      previousTotalAttempts: 0,
      canonicalRecord: built.record,
      assignmentExists: true,
      gradeRecordExists: true,
      authorizedForClass: true,
      assignmentClosedAtCapture: false,
      sectionOpenAtCapture: true,
    }).disposition,
    SUBMISSION_DISPOSITION.ACCEPTED,
  );
});

test('an unauthorized attempt reset is still refused', () => {
  // Not expired, and the variant did not move: a browser cannot wipe an
  // attempt count on a question it simply does not like.
  const built = buildIngestedAttempt({
    envelope: buildSubmissionEnvelope({
      actionId: 'forged-reset',
      kind: 'questionReplacement',
      studentId: STUDENT,
      assignmentId: ASSIGNMENT,
      questionIndex: 0,
      activityRole: 'classwork',
      previousTotalAttempts: 2,
      record: { status: 'unattempted', attemptCount: 0, totalAttempts: 0, variantIndex: 0, bestPartialCredit: 0 },
    }),
    assignment: { id: ASSIGNMENT },
    question: { type: 'functionGraph', activityRole: 'classwork' },
    canonicalRecord: { status: 'attempted', attemptCount: 2, totalAttempts: 2, variantIndex: 0, bestPartialCredit: 60 },
  });
  assert.equal(built.record.totalAttempts, 2, 'the canonical attempt count must stand');
  assert.equal(built.record.bestPartialCredit, 60, 'earned credit must stand');
});

test('the envelope carries the delivery attempt count, so escalation can happen server-side', () => {
  const envelope = normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: 'week-old',
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: 0,
    activityRole: 'classwork',
    capturedAt: Date.now() - (8 * 24 * 60 * 60 * 1000),
    previousTotalAttempts: 0,
    record: { totalAttempts: 1, status: 'attempted' },
    deliveryAttempts: 400,
  }));
  assert.equal(envelope.deliveryAttempts, 400, 'the count must survive the wire');

  // Without it this stayed `retryable` forever and never reached a teacher.
  const decision = decideSubmissionIngestion({
    envelope,
    assignmentExists: false,
    gradeRecordExists: true,
    authorizedForClass: true,
    assignmentClosedAtCapture: false,
    deliveryAttempts: envelope.deliveryAttempts,
  });
  assert.equal(decision.disposition, SUBMISSION_DISPOSITION.NEEDS_REVIEW);
});

test('recovery proposals cannot be committed against an assignment they were not computed for', async () => {
  const { readFile } = await import('node:fs/promises');
  const { region } = await import('./helpers/sourceContract.mjs');
  const [panel, home] = await Promise.all([
    readFile(new URL('../../src/components/teacher/StudentPersistenceRecoveryPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/TeacherHome.jsx', import.meta.url), 'utf8'),
  ]);

  /*
   * Changing the assignment dropdown swaps props without remounting, so a
   * preview run against assignment A stayed on screen when B was selected: A's
   * proposal count enabled the button and the commit sent B's ids. That writes
   * canonical grades for an assignment nobody previewed.
   */
  const commit = region(panel, 'const commitDrafts', 'return (', 'draft recovery commit');
  assert.match(
    commit,
    /proposals\?\.assignmentId !== assignmentId \|\| proposals\?\.classId !== classId/,
    'the write path itself must refuse proposals computed for a different target',
  );
  assert.ok(
    commit.indexOf('setError') < commit.indexOf('applyWorkspaceDraftRecovery'),
    'the guard must run BEFORE the recovery call, not after it',
  );

  // Belt and braces: the state is cleared on a target change, and the mount
  // site keys the component so it remounts anyway.
  assert.match(panel, /useEffect\(\(\) => \{[\s\S]*?setProposals\(null\);[\s\S]*?\}, \[assignmentId, classId\]\);/);
  assert.match(home, /key=\{`\$\{recoveryClassId\}::\$\{recoveryAssignmentId\}`\}/);
});

test('the client sends its delivery attempt count with every ingested submission', async () => {
  const { readFile } = await import('node:fs/promises');
  const { region } = await import('./helpers/sourceContract.mjs');
  const app = await readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const builder = region(app, 'const buildSubmissionEnvelopeForAction', 'const reconcileThroughClientTransaction', 'envelope builder');
  assert.match(builder, /deliveryAttempts: Number\(action\.delivery\?\.attempts \|\| 0\)/);
});
