import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { region } from './helpers/sourceContract.mjs';
import {
  createDurableAction,
  createMemoryOutboxStorage,
  drainDurableActions,
  enqueueDurableAction,
  listDurableActions,
  listRetiredDurableActions,
  overlayDurableActionsOnGrades,
  SUBMISSION_DISPOSITION,
} from '../../src/platform/performance/durableActionOutbox.js';

const submission = ({ actionId, questionIndex = 0, previous = 0, attempts = previous + 1 } = {}) => createDurableAction({
  kind: 'ordinarySubmission', studentId: 'student', assignmentId: 'assignment.with punctuation`', questionIndex, actionId,
  payload: { previousTotalAttempts: previous, record: { totalAttempts: attempts, status: 'attempted' }, evidenceEvent: { eventKey: `event-${questionIndex}-${attempts}` } },
});
const progress = ({ actionId, questionIndex, timeSpent }) => createDurableAction({
  kind: 'questionProgress', studentId: 'student', assignmentId: 'assignment.with punctuation`', questionIndex, actionId,
  payload: { timeSpent },
});
const step = ({ actionId, previous = 0, attempts = previous + 1 } = {}) => createDurableAction({
  kind: 'stepSubmission', studentId: 'student', assignmentId: 'assignment.with punctuation`', questionIndex: 0, actionId,
  payload: { previousTotalAttempts: previous, record: { totalAttempts: attempts, status: 'attempted', stepState: { completed: attempts } } },
});

const authorityHarness = ({ online = true, authorized = true } = {}) => {
  const records = new Map();
  const evidence = new Set();
  const calls = [];
  return {
    records, evidence, calls,
    setOnline(value) { online = value; },
    revoke() { authorized = false; },
    async reconcile(action) {
      calls.push(action.actionId);
      if (!online) throw new Error('offline');
      if (!authorized) return { status: 'rejected' };
      const key = `${action.assignmentId}:${action.questionIndex}`;
      const current = records.get(key) || { totalAttempts: 0, timeSpent: 0 };
      if (action.kind === 'questionProgress') {
        records.set(key, { ...current, timeSpent: Math.max(current.timeSpent || 0, action.payload.timeSpent || 0) });
        return { status: 'durable' };
      }
      if (current.lastSubmissionId === action.actionId) {
        if (action.payload.evidenceEvent) evidence.add(action.payload.evidenceEvent.eventKey);
        return { status: 'durable', duplicate: true };
      }
      if (current.totalAttempts !== action.payload.previousTotalAttempts) return { status: 'rejected' };
      records.set(key, { ...action.payload.record, lastSubmissionId: action.actionId });
      if (action.payload.evidenceEvent) evidence.add(action.payload.evidenceEvent.eventKey);
      return { status: 'durable' };
    },
  };
};

test('online submit is persisted exactly once and retry is idempotent', async () => {
  const storage = createMemoryOutboxStorage();
  const authority = authorityHarness();
  const action = submission({ actionId: 'submit-1' });
  await enqueueDurableAction(action, { storage });
  // The drain result gained classification fields (tally/retained/gradeBlocked)
  // when rejection stopped being one undifferentiated verdict. Assert the
  // outcome this test is about, not the whole growing shape.
  const first = await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.equal(first.recovered, 1);
  assert.equal(first.rejected, 0);
  assert.equal(first.remaining, 0);
  await enqueueDurableAction(action, { storage });
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.equal(authority.records.values().next().value.totalAttempts, 1);
  assert.equal(authority.evidence.size, 1);
});

test('double enqueue with one submission id creates one attempt', async () => {
  const action = submission({ actionId: 'same-click' });
  const storage = createMemoryOutboxStorage();
  await Promise.all([enqueueDurableAction(action, { storage }), enqueueDurableAction(action, { storage })]);
  assert.equal((await listDurableActions({ storage })).length, 1);
});

test('offline submit remains queued and a recreated client recovers it after reconnect', async () => {
  const storage = createMemoryOutboxStorage();
  const authority = authorityHarness({ online: false });
  await enqueueDurableAction(submission({ actionId: 'offline-submit' }), { storage });
  const offlineDrain = await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.equal(offlineDrain.recovered, 0);
  assert.equal(offlineDrain.remaining, 1);
  // An offline submission is grade-bearing work still owed a delivery.
  assert.equal(offlineDrain.remainingGrade, 1);
  // A new list call represents a page reload: state comes from durable storage,
  // not from a closure owned by the submitting component.
  assert.equal((await listDurableActions({ storage, studentId: 'student' }))[0].actionId, 'offline-submit');
  authority.setOnline(true);
  // The drain result gained classification fields (tally/retained/gradeBlocked)
  // when rejection stopped being one undifferentiated verdict. Assert the
  // outcome this test is about, not the whole growing shape.
  const first = await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.equal(first.recovered, 1);
  assert.equal(first.rejected, 0);
  assert.equal(first.remaining, 0);
});

test('submission and Next captured while offline both survive and reconcile in capture order', async () => {
  const storage = createMemoryOutboxStorage();
  const authority = authorityHarness({ online: false });
  await enqueueDurableAction(submission({ actionId: 'answer-q1', questionIndex: 0 }), { storage });
  await enqueueDurableAction(progress({ actionId: 'next-q1', questionIndex: 0, timeSpent: 42 }), { storage });
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.equal((await listDurableActions({ storage })).length, 2);
  authority.setOnline(true);
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  const record = authority.records.values().next().value;
  assert.equal(record.totalAttempts, 1);
  assert.equal(record.timeSpent, 42);
  assert.deepEqual(authority.calls.slice(-2), ['answer-q1', 'next-q1']);
});

test('two fast questions reconcile independently without overwriting either record', async () => {
  const storage = createMemoryOutboxStorage();
  const authority = authorityHarness();
  await enqueueDurableAction(submission({ actionId: 'q1', questionIndex: 0 }), { storage });
  await enqueueDurableAction(submission({ actionId: 'q2', questionIndex: 1 }), { storage });
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.equal(authority.records.size, 2);
  assert.deepEqual([...authority.records.values()].map((record) => record.lastSubmissionId), ['q1', 'q2']);
});

test('two algebra steps followed by Next survive offline and reconcile exactly once in order', async () => {
  const storage = createMemoryOutboxStorage();
  const authority = authorityHarness({ online: false });
  await enqueueDurableAction(step({ actionId: 'step-1' }), { storage });
  await enqueueDurableAction(step({ actionId: 'step-2', previous: 1, attempts: 2 }), { storage });
  await enqueueDurableAction(progress({ actionId: 'next-after-steps', questionIndex: 0, timeSpent: 90 }), { storage });
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.deepEqual((await listDurableActions({ storage })).map((action) => action.actionId), ['step-1', 'step-2', 'next-after-steps']);
  authority.setOnline(true);
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.deepEqual(authority.calls.slice(-3), ['step-1', 'step-2', 'next-after-steps']);
  assert.equal(authority.records.values().next().value.totalAttempts, 2);
  assert.equal(authority.records.values().next().value.timeSpent, 90);
  assert.equal((await listDurableActions({ storage })).length, 0);
});

test('reloaded algebra step retry is idempotent and revoked authority wins', async () => {
  const storage = createMemoryOutboxStorage();
  const authority = authorityHarness({ online: false });
  const action = step({ actionId: 'reload-step' });
  await enqueueDurableAction(action, { storage });
  assert.equal((await listDurableActions({ storage }))[0].kind, 'stepSubmission');
  authority.setOnline(true);
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  await enqueueDurableAction(action, { storage });
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.equal(authority.records.values().next().value.totalAttempts, 1);

  const rejectedStorage = createMemoryOutboxStorage();
  const revoked = authorityHarness({ online: false });
  await enqueueDurableAction(step({ actionId: 'closed-step' }), { storage: rejectedStorage });
  revoked.setOnline(true);
  revoked.revoke();
  await drainDurableActions({ storage: rejectedStorage, studentId: 'student', reconcile: revoked.reconcile });
  assert.equal(revoked.records.size, 0);
});

test('a later legitimate attempt is distinct while an out-of-order stale retry is rejected', async () => {
  const storage = createMemoryOutboxStorage();
  const authority = authorityHarness();
  await enqueueDurableAction(submission({ actionId: 'attempt-1' }), { storage });
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  await enqueueDurableAction(submission({ actionId: 'attempt-2', previous: 1, attempts: 2 }), { storage });
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  await enqueueDurableAction(submission({ actionId: 'stale-attempt', previous: 0, attempts: 1 }), { storage });
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.equal(authority.records.values().next().value.totalAttempts, 2);
  assert.equal(authority.evidence.size, 2);
});

/*
 * THE SEPTEMBER 14 REGRESSION, PINNED.
 *
 * This test used to assert that a rejected submission was REMOVED from the
 * queue. That is the defect: `rejected` was one undifferentiated verdict, so
 * "the teacher closed the section a minute ago" destroyed a student's answer
 * exactly as thoroughly as "this was never a valid submission". The behaviour
 * the test protects — a revoked authority never mints a canonical grade — is
 * unchanged and still asserted. What changed is that the evidence survives.
 */
test('an unclassified rejection never creates a canonical grade and never destroys the submission', async () => {
  const storage = createMemoryOutboxStorage();
  const authority = authorityHarness({ online: false });
  await enqueueDurableAction(submission({ actionId: 'revoked' }), { storage });
  await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  authority.setOnline(true);
  authority.revoke();
  const result = await drainDurableActions({ storage, studentId: 'student', reconcile: authority.reconcile });
  assert.equal(authority.records.size, 0);
  assert.equal((await listDurableActions({ storage })).length, 1);
  assert.equal(result.retained[0].disposition, SUBMISSION_DISPOSITION.RETRYABLE);
  assert.equal(result.retained[0].reason, 'unclassified-rejection');
  assert.equal((await listRetiredDurableActions({ storage })).length, 0);
});

test('only a PROVEN disposition retires a submission, and it is retired to evidence rather than deleted', async () => {
  const storage = createMemoryOutboxStorage();
  const closed = async () => ({ disposition: SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, reason: 'section-closed-at-capture' });
  await enqueueDurableAction(submission({ actionId: 'after-the-bell' }), { storage });
  const result = await drainDurableActions({ storage, studentId: 'student', reconcile: closed });
  assert.equal(result.rejected, 1);
  assert.equal((await listDurableActions({ storage })).length, 0);
  const retired = await listRetiredDurableActions({ storage });
  assert.equal(retired.length, 1);
  assert.equal(retired[0].actionId, 'after-the-bell');
  assert.equal(retired[0].retirement.reason, 'section-closed-at-capture');
  // The student's own envelope is still there to be reviewed.
  assert.equal(retired[0].payload.record.totalAttempts, 1);
});

test('reload overlay restores queued answers locally without rolling a newer canonical record backward', async () => {
  const queued = [
    submission({ actionId: 'queued-q1', questionIndex: 0, previous: 0, attempts: 1 }),
    progress({ actionId: 'queued-progress', questionIndex: 0, timeSpent: 55 }),
    submission({ actionId: 'stale-q2', questionIndex: 1, previous: 0, attempts: 1 }),
  ];
  const current = {
    'assignment.with punctuation`': {
      0: { totalAttempts: 0, status: 'unattempted', timeSpent: 5 },
      1: { totalAttempts: 2, status: 'correct', timeSpent: 30 },
    },
  };
  const restored = overlayDurableActionsOnGrades(current, queued);
  assert.equal(restored['assignment.with punctuation`'][0].totalAttempts, 1);
  assert.equal(restored['assignment.with punctuation`'][0].timeSpent, 55);
  assert.equal(restored['assignment.with punctuation`'][1].totalAttempts, 2);
  assert.equal(restored['assignment.with punctuation`'][1].status, 'correct');
});

test('production integration uses FieldPath segments and secure Test Cycle never enters the ordinary outbox', async () => {
  const [app, secureService] = await Promise.all([
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/services/secureExamService.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(app, /`gradesByAssignment\.\$\{activeAssignmentId\}/);
  // THE RECONCILIATION UNIT, not one function name.
  // Delivery is now a dispatcher plus non-grade background persistence,
  // so the region starts where the envelope is built and ends at the drain. A
  // region pinned to a single function would have gone red for a rename while
  // every behaviour below stayed intact.
  const reconciliation = region(app, 'const buildSubmissionEnvelopeForAction', 'const drainStudentOutbox', 'student reconciliation');
  assert.match(reconciliation, /hasClassworkGrade: payload\.hasClassworkGrade === true/);
  assert.match(reconciliation, /hasDolGrade: payload\.hasDolGrade === true/);
  assert.match(reconciliation, /if \(INGESTIBLE_KINDS\.includes\(action\.kind\)\) \{\s*throw new Error\('Grade-bearing actions require server ingestion\.'/);
  assert.match(reconciliation, /await ingestOneSubmission\(buildSubmissionEnvelopeForAction\(action\)\)/);
  assert.match(reconciliation, /disposition: SUBMISSION_DISPOSITION\.RETRYABLE/);
  assert.doesNotMatch(reconciliation, /lastSubmissionId: action\.actionId|wroteEvidenceFor/);
  assert.doesNotMatch(reconciliation, /deleteField\(/);
  assert.match(app, /await enqueueDurableAction\(createDurableAction\(\{[\s\S]*kind: 'ordinarySubmission'/);
  assert.match(app, /createdAt: submissionCapturedAt/);
  assert.match(app, /timedSectionAccess,/);
  const stepRegion = app.slice(app.indexOf('const handleStepGrade'), app.indexOf('const handleRequestNewQuestion'));
  assert.doesNotMatch(stepRegion, /getLiveAssignment|gradesByAssignment:\s*updatedTracker|await updateDoc/);
  assert.ok(stepRegion.indexOf("kind: 'stepSubmission'") < stepRegion.indexOf('setTracker(updatedTracker)'), 'step must cross the outbox boundary before React advances');
  const replacementRegion = app.slice(app.indexOf('const handleRequestNewQuestion'), app.indexOf('const V5_COMPILER_PLUMBING_ERROR'));
  assert.doesNotMatch(replacementRegion, /getLiveAssignment|await updateDoc/);
  assert.ok(replacementRegion.indexOf("kind: 'questionReplacement'") < replacementRegion.indexOf('setTracker(updatedTracker)'), 'replacement must be queued before React advances');
  assert.doesNotMatch(secureService, /enqueueDurableAction|ordinarySubmission/);
  assert.match(app, /overlayDurableActionsOnGrades\(current, actions\)/);
  assert.match(app, /window\.setInterval\(reconcileQueuedStudentWork, 10_000\)/);
  assert.match(app, /window\.addEventListener\('pageshow', reconcileQueuedStudentWork\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange', reconcileWhenVisible\)/);
  assert.match(app, /studentGradeSourceForViewer\(viewer\)/);
  assert.match(app, /const studentData = collectStudentGradeSnapshot\(snapshot\)/);
  assert.match(app, /setAllStudents\(studentData\)/);
  assert.throws(() => createDurableAction({ kind: 'ordinarySubmission', studentId: 'student', assignmentId: 'assignment', questionIndex: 0, payload: { secure: true } }), /Protected assessment data/);
  assert.throws(() => createDurableAction({ kind: 'ordinarySubmission', studentId: 'student', assignmentId: 'assignment', questionIndex: 0, payload: { answerKey: 'never' } }), /Protected assessment data/);
});
