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
  summarizeDurableOutbox,
} from '../../src/platform/performance/durableActionOutbox.js';
import { callableDeliveryDiagnostic } from '../../src/services/submissionIngestionService.js';
import { assessPersistencePending } from '../../functions/shared/persistencePending.mjs';
import { verifyPolicies } from '../../scripts/verify-persistence-production.mjs';

const action = ({ id, assignmentId = 'assignment-a', kind = 'ordinarySubmission', questionIndex = 0 }) => createDurableAction({
  actionId: id, kind, studentId: 'student-a', assignmentId, questionIndex,
  payload: { previousTotalAttempts: 0, record: { totalAttempts: 1 } },
});

test('callable transport failure remains durable with bounded safe diagnostics', async () => {
  const storage = createMemoryOutboxStorage();
  await enqueueDurableAction(action({ id: 'permission-denied' }), { storage });
  const diagnostic = callableDeliveryDiagnostic({ code: 'functions/permission-denied', message: 'raw answer must not survive: 42' });
  const result = await drainDurableActions({
    storage, studentId: 'student-a', now: 1000,
    reconcile: async () => ({ disposition: 'retryable', reason: diagnostic.safeReason, diagnostic }),
  });
  assert.equal(result.remainingGrade, 1);
  const [queued] = await listDurableActions({ storage });
  assert.deepEqual({
    attempts: queued.delivery.attempts,
    transport: queued.delivery.transport,
    firebaseCode: queued.delivery.firebaseCode,
    safeReason: queued.delivery.safeReason,
    firstFailureAt: queued.delivery.firstFailureAt,
    latestFailureAt: queued.delivery.latestFailureAt,
  }, {
    attempts: 1, transport: 'callable', firebaseCode: 'permission-denied',
    safeReason: 'callable-permission-denied', firstFailureAt: 1000, latestFailureAt: 1000,
  });
  assert.doesNotMatch(JSON.stringify(queued.delivery), /raw answer|42/);
});

test('assignment summaries never leak another assignment reason', async () => {
  const storage = createMemoryOutboxStorage();
  await enqueueDurableAction(action({ id: 'a', assignmentId: 'assignment-a' }), { storage });
  await enqueueDurableAction(action({ id: 'b', assignmentId: 'assignment-b', questionIndex: 1 }), { storage });
  await drainDurableActions({
    storage, studentId: 'student-a', now: 2000,
    reconcile: async (queued) => ({ disposition: 'retryable', reason: queued.assignmentId === 'assignment-a' ? 'callable-unavailable' : 'question-identity-mismatch' }),
  });
  const summary = await summarizeDurableOutbox({ storage, studentId: 'student-a' });
  assert.deepEqual(summary.blockedReasonsByAssignment['assignment-a'], { 'callable-unavailable': 1 });
  assert.deepEqual(summary.blockedReasonsByAssignment['assignment-b'], { 'question-identity-mismatch': 1 });
  assert.deepEqual(summary.queuedKindsByAssignment['assignment-a'], { ordinarySubmission: 1 });
});

test('known ordinary persistence gaps block finality and clearing them restores it', () => {
  assert.deepEqual(assessPersistencePending({ queuedGradeBearing: 2 }), {
    persistencePending: true, reasons: ['device-queue'],
  });
  assert.equal(assessPersistencePending({ worked: 4, canonicalAttempted: 3 }).persistencePending, true);
  assert.equal(assessPersistencePending({ worked: 3, canonicalAttempted: 3 }).persistencePending, false);
  assert.equal(assessPersistencePending({ queuedGradeBearing: 2, secureTestCycle: true }).persistencePending, false);
});

test('production IAM verification requires both public Cloud Run invoker bindings', () => {
  const valid = { bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] };
  const privatePolicy = { bindings: [{ role: 'roles/run.invoker', members: ['user:teacher@example.com'] }] };
  assert.equal(verifyPolicies({ ingeststudentsubmissions: valid, reportstudentdevicequeue: privatePolicy }).every((item) => item.ok), false);
  assert.equal(verifyPolicies({ ingeststudentsubmissions: valid, reportstudentdevicequeue: valid }).every((item) => item.ok), true);
});

test('grade delivery has one canonical writer and hydration reports before and after drain', async () => {
  const [app, functionsSource] = await Promise.all([
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/index.js', import.meta.url), 'utf8'),
  ]);
  const dispatcher = region(app, 'const reconcileDurableStudentAction', 'const drainStudentOutbox', 'durable dispatcher');
  assert.match(dispatcher, /if \(INGESTIBLE_KINDS\.includes\(action\.kind\)\)[\s\S]*return \{[\s\S]*disposition: SUBMISSION_DISPOSITION\.RETRYABLE/);
  assert.match(dispatcher, /\/\/ Checkpoints and elapsed-time progress are non-grade background state\.[\s\S]*return reconcileThroughClientTransaction\(action\)/);
  assert.doesNotMatch(dispatcher, /falling back|studentIngestionFallback/);
  const hydration = region(app, 'const recoverAndReconcileQueuedStudentWork', 'const reconcileQueuedStudentWork', 'hydration reconciliation');
  assert.match(hydration, /await reconcileAndReportStudentOutbox\(\)/);
  const cycle = region(app, 'const reconcileAndReportStudentOutbox', 'const leaveUnavailableAssignment', 'report-drain-report');
  const firstReport = cycle.indexOf('await reportStudentOutbox()');
  const drain = cycle.indexOf('await drainStudentOutbox(options)');
  const secondReport = cycle.indexOf('await reportStudentOutbox()', firstReport + 1);
  assert.ok(firstReport >= 0 && firstReport < drain && drain < secondReport);
  const passback = region(functionsSource, 'exports.syncGradeToClassroom', 'exports.getClassroomSyncHealth', 'Classroom passback');
  assert.match(passback, /!isTestCycleAssignment && isFinal/);
  assert.match(passback, /status: "sync-pending"[\s\S]*isFinal: false/);
  assert.match(passback, /if \(persistenceState\.persistencePending\)[\s\S]*continue;/);
});
