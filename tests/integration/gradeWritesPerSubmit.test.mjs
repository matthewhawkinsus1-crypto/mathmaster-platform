/*
 * HOW MANY TIMES ONE SUBMIT WRITES A STUDENT'S GRADE RECORD.
 *
 *   firebase emulators:exec --only firestore --project mathmaster-grade-writes \
 *     --config tests/browser/emulator/firebase.json \
 *     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/gradeWritesPerSubmit.test.mjs"
 * (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
 * this file too.) GRADE_WRITES_OUT=<dir> also writes what was measured there:
 * inventory.json (every write, by step) and snapshots.json (each student's
 * stored grade, detail and evidence after every step, timestamps and random
 * ids normalized). GRADE_WRITES_MEASURE=1 records without checking the pins,
 * which is how another tree (the commit before a change) is measured with the
 * same steps; every other run checks them.
 *
 * Every change to grades/{studentId} runs two Cloud Functions,
 * `syncGradeToClassroom` and `syncSectionGradeToClassroom` (both
 * onDocumentWritten on that document), and sends the document again to every
 * teacher whose gradebook or live monitor is open. So the number of writes to
 * that document per Submit is a Functions bill per Submit, per student.
 *
 * This drives each kind of Submit the way the student's browser does, through
 * the REAL callables, the real client modules (the durable outbox, the device
 * report and its dedupe, the response checkpoint, the activity record) and the
 * real triggers, against the emulator, and counts every write with the ledger
 * in support/gradeWriteLedger.mjs:
 *
 *   classwork   a typed answer's response checkpoint, then Submit: the device
 *               report, the drain (ingestStudentSubmissions), the report after
 *               it, the activity flush and the completion reconcile, the
 *               mastery trigger for the attempt's evidence event; a Next (the
 *               time on the question, then the activity flush); and the
 *               deadline finalizer and a teacher's sweep afterwards
 *   finishing   the same, for the Submit that completes the assignment (the
 *               final Classroom passback, held while the device still reports
 *               the work queued, then released)
 *   secure      one secure Test item answered (the navigation runtime's draft
 *               save), the older one-call submit, the Test's final Submit, and
 *               (not a Submit) the teacher's release that sends it to
 *               Classroom, the same release again, and a release whose
 *               Corrections plan was never written
 *   recovery    a Recovery Practice answer, a Recovery answer saved, and the
 *               Recovery Submit
 *
 * The counts each step must produce are pinned below, so a write added to a
 * Submit turns this red. Each pin names the actor and the fields, not only a
 * number. What reached Classroom (each push, each row of the teacher's
 * passback monitor) is pinned step by step at the end.
 *
 * Isolation: own project id, set before the Cloud Functions load.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { FieldPath as ClientFieldPath, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

const PROJECT = 'mathmaster-grade-writes';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST must be set: this suite must never reach a real project.');
process.env.GCLOUD_PROJECT = PROJECT;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJECT });

const {
  ASSIGNMENT_ID, CLASS_ID, PREFIX, TEACHER_EMAIL, certAssignment: classworkAssignment, classroomCallLog, db, fns, patchGradeCalls, repo, resetClassroomCalls,
  seedFixture, seedRosteredStudent, studentRequest, teacherRequest,
} = await import('./canonicalPersistenceHarness.mjs');
const ledger = await import('./support/gradeWriteLedger.mjs');
const {
  createDurableAction, createMemoryOutboxStorage, drainDurableActions, enqueueDurableAction,
} = await import('../../src/platform/performance/durableActionOutbox.js');
const { buildResponseCheckpointAction, checkpointDocumentId } = await import('../../src/platform/performance/responseCheckpoint.js');
const { reportDeviceQueueUnlessUnchanged } = await import('../../src/platform/persistence/deviceReportDedupe.js');
const { recordAssignmentActivity } = await import('../../src/assignmentLifecycle.js');
const { buildProgressEnvelope, buildSubmissionEnvelope } = await import('../../functions/shared/submissionEnvelope.mjs');
const {
  CERT_WRONG_ANSWER, certAnswerFromPrompt, certAssignment, certFamilies,
} = await import('../fixtures/testCycleCertificationFixture.mjs');
const { reproduceFamilyQuestionFromPin } = await import('../../functions/shared/questionFamilyInstance.mjs');
const { planSeatAdditions } = await import('../../functions/shared/questionGenerationIdentity.mjs');
const { getStoredAssignmentQuestions } = await import('../../src/platform/contract/storedAssignmentV5.js');
const {
  applyRecoveryAnswerPatch, buildRecoveryAnswerValue, createRecoveryAnswerSync, readRecoveryDraftEntries,
  recoveryAnswerKey, recoveryDraftDocumentId,
} = await import('../../src/platform/recovery/recoveryAnswerDrafts.js');

const require = createRequire(import.meta.url);
const sectionEntry = require(path.join(repo, 'functions/classroomSectionEntry.js'));
const { rosterLinkDocumentId } = require(path.join(repo, 'functions/lib/publication.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));

ledger.installGradeWriteLedger({ db });
ledger.useGradeTriggers([
  { name: 'syncGradeToClassroom', fn: fns.syncGradeToClassroom },
  { name: 'syncSectionGradeToClassroom', fn: sectionEntry.cloudFunctions.syncSectionGradeToClassroom },
]);

const OUT = process.env.GRADE_WRITES_OUT || '';
const MEASURE_ONLY = process.env.GRADE_WRITES_MEASURE === '1';
/** A pinned count: checked on every run but a measuring one. */
const pin = (actual, expected, message) => { if (!MEASURE_ONLY) assert.deepEqual(actual, expected, message); };
const inventory = {};
const snapshots = {};
const [emulatorHost, emulatorPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
let rulesEnv;

/* ------------------------------------------------------------------ measuring */

const topFields = (fields) => [...new Set(fields.map((field) => field.split('.')[0]))].sort();

/** A path or a field with this run's ids replaced by what they name. */
const pattern = (text, names) => Object.entries(names).reduce(
  (out, [id, name]) => out.split(id).join(name),
  String(text),
);

/** The new evidence events since the last look, delivered to the mastery trigger as Firestore would. */
const knownEvidence = new Map();
const deliverNewEvidence = async (studentId) => {
  const seen = knownEvidence.get(studentId) || new Set();
  const snapshot = await db.collection('grades').doc(studentId).collection('evidenceEvents').get();
  for (const evidence of snapshot.docs) {
    if (seen.has(evidence.id)) continue;
    seen.add(evidence.id);
    // eslint-disable-next-line no-await-in-loop
    await ledger.asActor('trigger:updateMyMathPathMasteryFromEvidence', () => fns.updateMyMathPathMasteryFromEvidence.run({
      params: { studentId, eventId: evidence.id },
      data: evidence,
    }));
  }
  knownEvidence.set(studentId, seen);
};

/*
 * What a step sent to Classroom, and what the teacher's passback monitor says
 * after it: each push (a grade patched, as a draft or assigned; a submission
 * returned), and each monitor row the step wrote, as it reads after the step.
 */
const PUSHES = new Set(['patchGrade', 'returnSubmission']);
const describePush = (call) => (call.call === 'patchGrade'
  ? `patchGrade ${call.courseWorkId} ${call.grade} ${call.assignToStudent ? 'assigned' : 'draft'}`
  : `${call.call} ${call.courseWorkId}`);
const describeAuditRow = (row) => [
  row?.courseworkId, row?.status, row?.stage, row?.grade,
  ...(row?.studentVisible ? ['visible'] : []), ...(row?.returnedToStudent ? ['returned'] : []),
].join(' ');
const classroomEffects = async ({ calls, writes, names }) => {
  const auditPaths = [...new Set(writes.filter((write) => write.path.startsWith('classroomGradeSyncs/')).map((write) => write.path))];
  const rows = await Promise.all(auditPaths.map(async (auditPath) => describeAuditRow((await db.doc(auditPath).get()).data())));
  return {
    pushes: calls.filter((call) => PUSHES.has(call.call)).map((call) => pattern(describePush(call), names)),
    auditRows: rows.map((row) => pattern(row, names)).sort(),
  };
};

/**
 * One step of a Submit: what it wrote, what the triggers it woke did, and what
 * reached Classroom. The grades triggers (and the mastery trigger for a new
 * evidence event) run after the step, as Firestore delivers them, before the
 * next step starts.
 */
const step = async (scenario, name, { studentId, names }, fn) => {
  const from = ledger.mark();
  const callsFrom = classroomCallLog().length;
  await fn();
  await ledger.settleGradeTriggers();
  await deliverNewEvidence(studentId);
  await ledger.settleGradeTriggers();
  const recorded = ledger.since(from);
  const gradePath = `grades/${studentId}`;
  const gradeWrites = recorded.writes.filter((write) => write.path === gradePath);
  const invocations = recorded.invocations.filter((invocation) => invocation.documentPath === gradePath);
  const result = {
    gradeWrites: gradeWrites.map((write) => `${write.actor}: ${topFields(write.fields).join(' + ')}${write.changed === false ? ' (unchanged)' : ''}`),
    detailWrites: recorded.writes.filter((write) => ledger.isResponseDetailPath(write.path) && write.path.startsWith(`${gradePath}/`)).length,
    triggerRuns: invocations.length,
    triggerRunsWithWork: invocations.filter((invocation) => invocation.didWork).length,
  };
  (inventory[scenario] ||= {})[name] = {
    ...result,
    writes: recorded.writes.map((write) => ({
      actor: write.actor,
      path: pattern(write.path, names),
      kind: write.kind,
      fields: write.fields.map((field) => pattern(field, names)),
      transactional: write.transactional,
      ...(write.changed === null ? {} : { changed: write.changed }),
    })),
    triggerRuns: invocations.map(({ trigger, didWork, reads, writes }) => ({ trigger, didWork, reads, writes })),
    ...await classroomEffects({ calls: classroomCallLog().slice(callsFrom), writes: recorded.writes, names }),
  };
  (snapshots.afterEachStep ||= {})[`${scenario}: ${name}`] = await gradeStateAt(studentId);
  return result;
};

/*
 * The student's stored grade, its records' detail and the evidence written
 * for their work, comparable between two runs: timestamps, and the ids a run
 * draws at random (an event key's UUID, a record's detailRef, a session id),
 * are replaced by what they are, and documents keyed by such an id are listed
 * in a stable order instead.
 */
const RANDOM_ID_KEYS = new Set(['detailRef', 'eventKey', 'examSessionId', 'planId', 'questionInstanceId', 'notificationId', 'recordId']);
const normalize = (value) => JSON.parse(JSON.stringify(value, (key, entry) => {
  if (entry && typeof entry === 'object' && typeof entry.toMillis === 'function') return '<timestamp>';
  if (RANDOM_ID_KEYS.has(key) && typeof entry === 'string') return `<${key}>`;
  if (typeof entry === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(entry)) return '<iso>';
  if (typeof entry === 'string') return entry.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>');
  if (typeof entry === 'number' && entry > 1.5e12 && entry < 2.5e12) return '<ms>';
  return entry;
}));
const stableList = (documents) => documents.map(normalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
const storedState = async (studentId, extra = {}) => {
  const gradeRef = db.collection('grades').doc(studentId);
  const [grade, detail, evidence, misconceptions] = await Promise.all([
    gradeRef.get(),
    gradeRef.collection('responseDetail').get(),
    gradeRef.collection('evidenceEvents').get(),
    gradeRef.collection('misconceptionEvidence').get(),
  ]);
  return normalize({
    grade: grade.data() || null,
    responseDetail: Object.fromEntries(detail.docs.map((entry) => [entry.id, entry.data()])),
    evidenceEvents: stableList(evidence.docs.map((entry) => entry.data())),
    misconceptionEvidence: stableList(misconceptions.docs.map((entry) => entry.data())),
    ...extra,
  });
};

/*
 * After a step: the grade fields, the detail and the evidence, which no
 * change here may move, apart from the Classroom receipts and the release
 * signal (what the triggers write back, and the device report's wake-up).
 */
const gradeStateAt = async (studentId) => {
  const state = await storedState(studentId);
  const { classroomSyncStatusByAssignment = null, classroomSectionSyncStatusByAssignment = null, classroomReleaseSignals: _signals, ...grade } = state.grade || {};
  return {
    grade,
    responseDetail: state.responseDetail,
    evidenceEvents: state.evidenceEvents,
    misconceptionEvidence: state.misconceptionEvidence,
    receipts: { whole: classroomSyncStatusByAssignment, sections: classroomSectionSyncStatusByAssignment },
  };
};

after(async () => {
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(path.join(OUT, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
    writeFileSync(path.join(OUT, 'snapshots.json'), `${JSON.stringify(snapshots, null, 2)}\n`);
  }
});

/* ------------------------------------------------------- the student's browser */

const studentClient = (studentId) => rulesEnv
  .authenticatedContext(`uid-${studentId}`, { role: 'student', studentId })
  .firestore();

/** One student's browser: its durable outbox and its device report state, in memory. */
const browserFor = (studentId) => ({ studentId, storage: createMemoryOutboxStorage(), elapsedSeconds: 0 });

/** The device report the browser sends around a drain (reportDeviceQueueState). */
const reportQueue = (browser) => reportDeviceQueueUnlessUnchanged({
  studentId: browser.studentId,
  storage: browser.storage,
  transport: ({ deviceId, generation, summary }) => ledger.asActor('reportStudentDeviceQueue', () => fns.reportStudentDeviceQueue.run(
    studentRequest(browser.studentId, { deviceId, reportGeneration: generation, summary }),
  )),
});

/** App.jsx reconcileThroughClientTransaction: a checkpoint is the one thing the browser writes itself. */
const writeCheckpointAsTheBrowser = async (browser, action) => {
  const client = studentClient(browser.studentId);
  await ledger.clientWrite('client:responseCheckpoint', [
    { path: `studentResponseCheckpoints/${action.payload.documentId}`, kind: 'set', fields: Object.keys(action.payload), transactional: true },
  ], () => runTransaction(client, async (transaction) => {
    await Promise.all([
      transaction.get(doc(client, 'assignments', action.assignmentId)),
      transaction.get(doc(client, 'grades', action.studentId)),
    ]);
    transaction.set(doc(client, 'studentResponseCheckpoints', action.payload.documentId), {
      ...action.payload,
      studentId: action.studentId,
      assignmentId: action.assignmentId,
      questionIndex: action.questionIndex,
      classId: CLASS_ID,
      serverAcknowledgedAt: serverTimestamp(),
      candidateFinalizeAt: action.payload.candidateFinalizeAt ? new Date(action.payload.candidateFinalizeAt) : null,
      status: 'active',
    });
  }));
  return { disposition: 'accepted' };
};

/** App.jsx reconcileDurableStudentAction, for the kinds a classwork Submit queues. */
const reconcileAction = (browser) => async (action) => {
  if (action.kind === 'responseCheckpoint') return writeCheckpointAsTheBrowser(browser, action);
  const payload = action.payload || {};
  const envelope = action.kind === 'questionProgress'
    ? buildProgressEnvelope({
      actionId: action.actionId, kind: action.kind, studentId: action.studentId, assignmentId: action.assignmentId,
      questionIndex: action.questionIndex, activityRole: payload.activityRole, capturedAt: action.createdAt,
      timeSpentSeconds: payload.timeSpent,
    })
    : buildSubmissionEnvelope({
      actionId: action.actionId,
      kind: action.kind,
      studentId: action.studentId,
      assignmentId: action.assignmentId,
      questionIndex: action.questionIndex,
      questionId: payload.questionId,
      variantIndex: payload.variantIndex,
      activityRole: payload.activityRole,
      capturedAt: action.createdAt,
      previousTotalAttempts: payload.previousTotalAttempts,
      record: payload.record,
      response: payload.response,
      supportUsage: payload.record?.supportUsage || null,
      assignmentSupportUsage: payload.supportUsage || null,
      hasClassworkGrade: payload.hasClassworkGrade === true,
      hasDolGrade: payload.hasDolGrade === true,
      checkpointDocumentId: payload.checkpointDocumentId,
      timeSpentSeconds: payload.timeSpentSeconds,
      deliveryAttempts: Number(action.delivery?.attempts || 0),
    });
  const result = await ledger.asActor('ingestStudentSubmissions', () => fns.ingestStudentSubmissions.run(
    studentRequest(action.studentId, { submissions: [envelope] }),
  ));
  const receipt = result.receipts.find((entry) => entry.actionId === action.actionId);
  return { disposition: receipt.disposition, reason: receipt.reason || null, receipt };
};

const ANSWERS = ['2x+1', 'x+5', 'x-4', '9'];
const literal = (value) => ({ kind: 'scalar', type: 'literal', value, fields: [] });
const identityFor = (studentId, questionIndex) => ({
  studentId,
  assignmentId: ASSIGNMENT_ID,
  questionIndex,
  questionId: `${PREFIX}-q${questionIndex}`,
  variantIndex: 0,
  generationKey: `${ASSIGNMENT_ID}|${studentId}|${questionIndex}|variant:0`,
});

/** The student types an answer: QuestionEngine's checkpoint, queued and drained (handleResponseCheckpoint). */
const typeAnswer = async (browser, questionIndex) => {
  const now = Date.now();
  const action = buildResponseCheckpointAction({
    identity: identityFor(browser.studentId, questionIndex),
    question: { type: 'literal', questionId: `${PREFIX}-q${questionIndex}`, acceptedAnswers: [ANSWERS[questionIndex]], solveFor: 'y', prompt: 'p' },
    activityRole: 'classwork',
    answerState: { isComplete: true, responseKey: ANSWERS[questionIndex] },
    revision: now,
    finalizeAt: new Date(now + 172_800_000).toISOString(),
    finalizationReason: 'assignment-final-cutoff',
    finalizationContext: { classId: CLASS_ID, classPeriod: 'Period 1' },
    previousTotalAttempts: 0,
    timeSpentSeconds: 20,
    capturedAt: now,
  });
  assert.ok(action, 'a literal classwork answer is checkpointed');
  await enqueueDurableAction(action, { storage: browser.storage });
  await drainDurableActions({ storage: browser.storage, studentId: browser.studentId, reconcile: reconcileAction(browser) });
};

/*
 * App.jsx flushAssignmentActivity: the engagement time this page has counted
 * since its last flush, the one field of the grade record the student's own
 * browser writes (firestore.rules, studentClientOwnedGradeFields).
 */
const flushActivityAsTheBrowser = async (browser, extraSeconds = 0) => {
  const { studentId } = browser;
  const assignment = { id: ASSIGNMENT_ID, ...(await db.collection('assignments').doc(ASSIGNMENT_ID).get()).data() };
  const stored = (await db.collection('grades').doc(studentId).get()).data()?.assignmentActivity?.[ASSIGNMENT_ID] || null;
  const nextRecord = recordAssignmentActivity({ activity: stored, assignment, seconds: browser.elapsedSeconds + extraSeconds, nowValue: Date.now(), studentId });
  browser.elapsedSeconds = 0;
  await ledger.clientWrite('client:activityFlush', [{ path: `grades/${studentId}`, kind: 'update', fields: [`assignmentActivity.${ASSIGNMENT_ID}`] }],
    () => updateDoc(doc(studentClient(studentId), 'grades', studentId), new ClientFieldPath('assignmentActivity', ASSIGNMENT_ID), nextRecord));
};

/*
 * The student presses Submit (App.jsx handleGradeSubmit): the work is queued
 * durably, then reconcileAndReportStudentOutbox — the device report, the
 * drain, the device report again — then flushAssignmentActivity, whose
 * activity write is followed by the completion reconcile. Each is its own
 * step, so the triggers run between them as they would in production.
 */
const submitAsTheBrowser = async (scenario, browser, questionIndex, { names, seconds = 45, response = literal(ANSWERS[questionIndex]) } = {}) => {
  const { studentId } = browser;
  const record = (await db.collection('grades').doc(studentId).get()).data()?.gradesByAssignment?.[ASSIGNMENT_ID]?.[String(questionIndex)] || {};
  const previousTotalAttempts = Number(record.totalAttempts) || 0;
  const context = { studentId, names };
  const steps = {};
  const action = createDurableAction({
    kind: 'ordinarySubmission',
    studentId,
    assignmentId: ASSIGNMENT_ID,
    questionIndex,
    actionId: `${studentId}-submit-q${questionIndex}-attempt-${previousTotalAttempts + 1}`,
    payload: {
      previousTotalAttempts,
      activityRole: 'classwork',
      timedSectionAccess: null,
      capturedSectionAccess: null,
      response,
      familyDelivery: null,
      questionId: `${PREFIX}-q${questionIndex}`,
      variantIndex: 0,
      timeSpentSeconds: seconds,
      checkpointDocumentId: checkpointDocumentId(identityFor(studentId, questionIndex)),
      record: { status: 'attempted', attemptCount: previousTotalAttempts + 1, totalAttempts: previousTotalAttempts + 1, timeSpent: seconds },
      supportUsage: { modified: false, accommodations: [], modifications: [] },
      hasClassworkGrade: false,
      classworkGrade: null,
      hasDolGrade: false,
      dolGrade: null,
      evidenceEvent: null,
    },
  });
  await enqueueDurableAction(action, { storage: browser.storage });
  browser.elapsedSeconds += seconds;
  steps.reportBefore = await step(scenario, 'device report before the drain', context, () => reportQueue(browser));
  steps.drain = await step(scenario, 'drain: ingestStudentSubmissions', context, async () => {
    const drained = await drainDurableActions({ storage: browser.storage, studentId, reconcile: reconcileAction(browser) });
    assert.equal(drained.tally.accepted, 1, 'the Submit is accepted');
  });
  steps.reportAfter = await step(scenario, 'device report after the drain', context, () => reportQueue(browser));
  steps.activity = await step(scenario, 'activity flush (the browser)', context, () => flushActivityAsTheBrowser(browser));
  steps.reconcile = await step(scenario, 'completion reconcile', context, () => ledger.asActor('reconcileAssignmentActivityProjection', () => (
    fns.reconcileAssignmentActivityProjection.run(studentRequest(studentId, { assignmentId: ASSIGNMENT_ID }))
  )));
  return steps;
};

/** The whole Submit, totalled over its steps. */
const total = (steps) => Object.values(steps).reduce((sum, entry) => ({
  gradeWrites: [...sum.gradeWrites, ...entry.gradeWrites],
  detailWrites: sum.detailWrites + entry.detailWrites,
  triggerRuns: sum.triggerRuns + entry.triggerRuns,
  triggerRunsWithWork: sum.triggerRunsWithWork + entry.triggerRunsWithWork,
}), { gradeWrites: [], detailWrites: 0, triggerRuns: 0, triggerRunsWithWork: 0 });

/* ---------------------------------------------------------------- the fixtures */

const CLASSWORK_STUDENT = `${PREFIX}-gw-classwork`;

// A Test Cycle of its own (testCycleCertificationFixture.mjs with this file's prefix).
const TC_PREFIX = 'gw_';
const TC_CLASS = 'gw-tc-class';
const TC_ASSIGNMENT = 'gw-tc-assignment';
const TC_STUDENT = 'GW_TC_STUDENT';
const TC_COURSE = 'gw-tc-course';

// A DOL Recovery of its own (as tests/integration/sectionRecoveryPlatformFailure.test.mjs builds one).
const RC_CLASS = 'gw-rc-class';
const RC_COURSE = 'gw-rc-course';
const RC_STUDENT = 'gw-rc-student';
const DAY = 86_400_000;
const NOW = Date.now();
const dateKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const twoStep = (questionId, questionWeight) => ({ questionId, type: 'stepAlgebra', prompt: 'Solve for x.', questionWeight, questionFamily: { id: 'linear.twoStepEquation' } });
const zeros = (questionId, questionWeight) => ({ questionId, type: 'multiAnswer', prompt: 'Find the zeros.', questionWeight, questionFamily: { id: 'functions.identifyZeros' } });
const intercepts = (questionId, questionWeight) => ({ questionId, type: 'multiAnswer', prompt: 'Find both intercepts.', questionWeight, questionFamily: { id: 'functions.identifyIntercepts' } });
const RC_ASSIGNMENT = { id: 'gw-rc-assignment', dol: [twoStep('d1', 4), zeros('d2', 3), intercepts('d3', 3)] };
const recoveryAssignmentDoc = ({ id, dol }) => {
  const assignment = {
    id,
    title: 'Grade writes Recovery',
    schemaVersion: 5,
    assignedClassIds: [RC_CLASS],
    releaseAt: new Date(NOW - 10 * DAY).toISOString(),
    dueAt: new Date(NOW - 3 * DAY).toISOString(),
    lateDueAt: new Date(NOW + 5 * DAY).toISOString(),
    dol: { instructionDate: dateKey(NOW - 3 * DAY) },
    sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: dol }],
  };
  assignment.generationSeats = { version: 1, byClassId: { [RC_CLASS]: planSeatAdditions({ assignment, classId: RC_CLASS, studentIds: [RC_STUDENT] }) } };
  const { id: _id, ...stored } = assignment;
  return stored;
};
const ORIGINAL_DOL = {
  0: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() },
  1: { status: 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() },
  2: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0, lastAttemptAt: new Date(NOW - 3 * DAY).toISOString() },
};
const recoveryQuestions = () => getStoredAssignmentQuestions({ id: RC_ASSIGNMENT.id, ...recoveryAssignmentDoc(RC_ASSIGNMENT) });
const reproduce = (item) => reproduceFamilyQuestionFromPin({
  question: recoveryQuestions()[item.storageIndex], assignmentId: RC_ASSIGNMENT.id, storageIndex: item.storageIndex, pin: item.pin,
});
const correctResponse = ({ question, instance }) => {
  if (question.type === 'stepAlgebra') return { kind: 'opaque', type: 'stepAlgebra', value: `${question.variable || 'x'}=${question.generatedAnswer}`, fields: [] };
  const answer = instance.answer;
  const values = answer.kind === 'set' ? answer.value.map(String)
    : answer.kind === 'points' ? [`(${answer.value.xIntercept.join(', ')})`, `(${answer.value.yIntercept.join(', ')})`]
      : [String(answer.value)];
  return { kind: 'fields', type: question.type, value: '', fields: (question.answerFields || []).map((field, index) => ({ id: field.id, value: values[index] ?? '', isComplete: true })) };
};
const recovery = (action, payload = undefined) => ledger.asActor('advanceSectionRecovery', () => fns.advanceSectionRecovery.run(studentRequest(RC_STUDENT, {
  assignmentId: RC_ASSIGNMENT.id, section: 'dol', action, ...(payload ? { payload } : {}),
})));

before(async () => {
  rulesEnv = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host: emulatorHost,
      port: Number(emulatorPort),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  await seedFixture();
  // The fixture's questions name a standard here, so each attempt's evidence
  // event reaches the mastery trigger as a real lesson's does.
  const aligned = classworkAssignment();
  aligned.sections.forEach((section) => section.questions.forEach((question) => { question.masteryEvidenceKeys = ['texas:A.5A']; }));
  await db.collection('assignments').doc(ASSIGNMENT_ID).set(aligned);
  await seedRosteredStudent(CLASSWORK_STUDENT);

  await Promise.all(certFamilies({ prefix: TC_PREFIX }).map(({ id, ...fields }) => db.collection('pathQuestionBank').doc(id).set(fields)));
  await db.collection('classes').doc(TC_CLASS).set({
    name: 'Grade writes Test Cycle', course: 'algebra1', courseLevel: 'standard', period: 'Period 4', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('grades').doc(TC_STUDENT).set({
    displayName: TC_STUDENT, classId: TC_CLASS, classPeriod: 'Period 4', assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
  });
  await db.collection('assignments').doc(TC_ASSIGNMENT).set(certAssignment({ prefix: TC_PREFIX, classIds: [TC_CLASS], assignmentId: TC_ASSIGNMENT }));
  // Posted to Classroom, so the release below reaches it (nothing before the
  // release does: an unreleased Test has no grade to send).
  await db.collection('classroomLinks').doc('gw-tc-whole').set({
    schemaVersion: 2, publicationId: 'gw-tc-whole', assignmentId: TC_ASSIGNMENT,
    courseId: TC_COURSE, courseName: 'Grade writes Test Cycle', courseworkId: 'gw-tc-whole-cw',
    teacherUid: `uid-${TEACHER_EMAIL}`, status: 'published', maxPoints: 100, sectionKey: 'whole',
  });
  await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(TC_COURSE, TC_STUDENT)).set({ courseId: TC_COURSE, studentId: TC_STUDENT, googleUserId: `google-${TC_STUDENT}` });

  await db.collection('classes').doc(RC_CLASS).set({ name: 'Grade writes Recovery', period: 'Period 2', teacherOfRecord: TEACHER_EMAIL, status: 'active', course: 'algebra1' });
  await db.collection('assignments').doc(RC_ASSIGNMENT.id).set(recoveryAssignmentDoc(RC_ASSIGNMENT));
  for (const sectionKey of ['whole', 'dol']) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomLinks').doc(`gw-rc-${sectionKey}`).set({
      schemaVersion: 2, publicationId: `gw-rc-${sectionKey}`, assignmentId: RC_ASSIGNMENT.id,
      courseId: RC_COURSE, courseName: 'Grade writes Recovery', courseworkId: `gw-rc-${sectionKey}-cw`,
      teacherUid: `uid-${TEACHER_EMAIL}`, status: 'published', maxPoints: 100,
      sectionKey, publicationKind: sectionKey === 'whole' ? 'assignment' : 'section',
      ...(sectionKey === 'whole' ? {} : { gradePassbackEnabled: false, sectionGradePassbackEnabled: true }),
    });
  }
  await db.collection('grades').doc(RC_STUDENT).set({
    displayName: RC_STUDENT, classId: RC_CLASS, classPeriod: 'Period 2', assignedTeacherEmail: TEACHER_EMAIL, status: 'active',
    gradesByAssignment: { [RC_ASSIGNMENT.id]: ORIGINAL_DOL },
  });
  await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(RC_COURSE, RC_STUDENT)).set({ courseId: RC_COURSE, studentId: RC_STUDENT, googleUserId: `google-${RC_STUDENT}` });
});

after(async () => {
  await rulesEnv?.cleanup();
});

/* ======================================================================= */

/*
 * THE PINS. Each Submit kind, step by step: the writes to grades/{studentId}
 * (actor: fields), the writes to its responseDetail documents, and how many
 * grades-trigger runs those writes cause (two per changing write: the
 * whole-assignment and the section trigger) and how many of those runs do
 * Classroom work rather than exit at once.
 */
const NOTHING = Object.freeze({ gradeWrites: [], detailWrites: 0, triggerRuns: 0, triggerRunsWithWork: 0 });
const INGESTED = 'ingestStudentSubmissions: gradesByAssignment + supportUsageByAssignment';
const RECEIPT = 'trigger:syncGradeToClassroom: classroomSyncStatusByAssignment';
// A Submit whose answer moves the Classroom grade: before the due date the
// trigger sends it to Classroom as a teacher's draft, which the student cannot
// see. No student screen shows a draft receipt, so none is written back to the
// grade record (functions/lib/classroomGradeRuntime.js
// classroomReceiptNeedsWriting): before, it was a second write and two more
// trigger runs.
const DRAIN_SENDING_A_DRAFT = Object.freeze({ gradeWrites: [INGESTED], detailWrites: 1, triggerRuns: 2, triggerRunsWithWork: 2 });
// A Submit that leaves the Classroom grade where it was (a second wrong try).
const DRAIN_SENDING_NOTHING = Object.freeze({ gradeWrites: [INGESTED], detailWrites: 1, triggerRuns: 2, triggerRunsWithWork: 2 });
// The report after the drain: the device's queue for the assignment fell to
// zero, so it wakes the Classroom triggers in case a final grade waited on it.
const REPORT_AFTER = Object.freeze({ gradeWrites: ['reportStudentDeviceQueue: classroomReleaseSignals'], detailWrites: 0, triggerRuns: 2, triggerRunsWithWork: 2 });
const ACTIVITY = Object.freeze({ gradeWrites: ['client:activityFlush: assignmentActivity'], detailWrites: 0, triggerRuns: 2, triggerRunsWithWork: 0 });
const plainSubmit = (drain) => ({ reportBefore: NOTHING, drain, reportAfter: REPORT_AFTER, activity: ACTIVITY, reconcile: NOTHING });

const classworkBrowser = browserFor(CLASSWORK_STUDENT);
const classworkNames = { [CLASSWORK_STUDENT]: '{studentId}', [ASSIGNMENT_ID]: '{assignmentId}', [encodeURIComponent(CLASSWORK_STUDENT)]: '{studentId}' };
const assertSteps = (steps, expected, label) => {
  for (const [name, value] of Object.entries(expected)) pin(steps[name], value, `${label}, ${name}`);
};
const recordOf = async (questionIndex) => (await db.collection('grades').doc(CLASSWORK_STUDENT).get()).data().gradesByAssignment[ASSIGNMENT_ID][questionIndex];

test('a classwork Submit: its checkpoint, the Submit (wrong, wrong again, right), Next, and the deadline after it', async () => {
  const browser = classworkBrowser;
  const names = classworkNames;
  await ledger.followGradeDocument(CLASSWORK_STUDENT);

  const typed = await step('classwork', 'typing: the response checkpoint', { studentId: CLASSWORK_STUDENT, names }, () => typeAnswer(browser, 0));
  pin(typed, NOTHING, 'a checkpoint never writes the grade record');

  // Each Submit, with what reached Classroom: a draft grade (assigned to
  // nobody, returned to nobody) whenever the answer moved the grade.
  const drafts = () => patchGradeCalls().map((call) => ({ grade: call.grade, assignToStudent: call.assignToStudent }));
  const wrong = literal('definitely not it');
  resetClassroomCalls();
  assertSteps(await submitAsTheBrowser('classwork, a wrong answer', browser, 0, { names, response: wrong }), plainSubmit(DRAIN_SENDING_A_DRAFT), 'a first wrong answer');
  assert.equal((await recordOf(0)).status, 'attempted');
  assert.deepEqual(drafts(), [{ grade: 0, assignToStudent: false }], 'the first answer reaches Classroom as a draft');
  resetClassroomCalls();
  assertSteps(await submitAsTheBrowser('classwork, wrong again', browser, 0, { names, response: wrong }), plainSubmit(DRAIN_SENDING_NOTHING), 'a second wrong answer');
  assert.deepEqual(drafts(), [], 'the same grade is not sent again');
  resetClassroomCalls();
  const steps = await submitAsTheBrowser('classwork', browser, 0, { names });
  assertSteps(steps, plainSubmit(DRAIN_SENDING_A_DRAFT), 'the right answer');
  assert.equal((await recordOf(0)).status, 'correct');
  assert.deepEqual(drafts(), [{ grade: 25, assignToStudent: false }], 'the new grade reaches Classroom as a draft');
  const audit = (await db.collection('classroomGradeSyncs').where('studentId', '==', CLASSWORK_STUDENT).get()).docs.map((entry) => entry.data());
  assert.deepEqual(audit.map((entry) => [entry.status, entry.stage, entry.grade, entry.studentVisible]), [['synced', 'progress-25', 25, false]], 'the teacher\'s monitor row says so');
  pin((await db.collection('grades').doc(CLASSWORK_STUDENT).get()).data().classroomSyncStatusByAssignment, undefined, 'no draft receipt on the grade record');
  inventory.classwork.total = total(steps);

  // Next (App.jsx changeQuestion): the time on the question goes through
  // ingestion, the activity is flushed, and the flush asks the completion
  // reconcile whether that time completed Classwork (not here: one question
  // of four is answered). No device report: elapsed time is not grade-bearing
  // work.
  const recordBeforeNext = await recordOf(0);
  const NEXT = 'Next: time on the question, then the activity flush';
  const next = await step('classwork', NEXT, { studentId: CLASSWORK_STUDENT, names }, async () => {
    await enqueueDurableAction(createDurableAction({
      kind: 'questionProgress', studentId: CLASSWORK_STUDENT, assignmentId: ASSIGNMENT_ID, questionIndex: 0,
      payload: { timeSpent: 200, activityRole: 'classwork' },
    }), { storage: browser.storage });
    await drainDurableActions({ storage: browser.storage, studentId: CLASSWORK_STUDENT, reconcile: reconcileAction(browser) });
    await flushActivityAsTheBrowser(browser, 20);
    await ledger.asActor('reconcileAssignmentActivityProjection', () => (
      fns.reconcileAssignmentActivityProjection.run(studentRequest(CLASSWORK_STUDENT, { assignmentId: ASSIGNMENT_ID }))
    ));
  });
  // What a Next writes to the record: its time on task, and nothing else.
  const { timeSpent: timeAfterNext, ...restAfterNext } = await recordOf(0);
  const { timeSpent: timeBeforeNext, ...restBeforeNext } = recordBeforeNext;
  assert.deepEqual([timeBeforeNext < 200, timeAfterNext], [true, 200], 'the Next raised the question\'s time on task');
  assert.deepEqual(restAfterNext, restBeforeNext, 'and changed nothing else in its record');
  // Both triggers still see both writes, and neither does any work for them:
  // nothing either computes reads time on task, so a change that moves only
  // that is no change (functions/lib/classroomTrackerChange.js). Before, the
  // time on the record woke both into reading the assignment and what each
  // needs to grade it (7 and 5 reads), to compute the grade they had already
  // sent, and send nothing.
  pin(next, {
    gradeWrites: ['ingestStudentSubmissions: gradesByAssignment', 'client:activityFlush: assignmentActivity'],
    detailWrites: 0,
    triggerRuns: 4,
    triggerRunsWithWork: 0,
  });
  pin(inventory.classwork[NEXT].triggerRuns.map(({ trigger, reads, writes }) => `${trigger}: ${reads} reads, ${writes} writes`), [
    'syncGradeToClassroom: 0 reads, 0 writes',
    'syncSectionGradeToClassroom: 0 reads, 0 writes',
    'syncGradeToClassroom: 0 reads, 0 writes',
    'syncSectionGradeToClassroom: 0 reads, 0 writes',
  ], 'a Next costs the triggers no reads');
  assert.deepEqual([inventory.classwork[NEXT].pushes, inventory.classwork[NEXT].auditRows], [[], []], 'and sends Classroom nothing, as before');

  // The deadline passes: the finalizer and a teacher's sweep find the
  // checkpoint retired by the Submit, and write nothing for it.
  const deadline = await step('classwork', 'deadline: finalizer and sweep', { studentId: CLASSWORK_STUDENT, names }, async () => {
    await ledger.asActor('finalizeStudentResponseCheckpoints', () => fns.finalizeStudentResponseCheckpoints.run({}));
    await ledger.asActor('sweepStudentResponseCheckpoints', () => fns.sweepStudentResponseCheckpoints.run(teacherRequest({ assignmentId: ASSIGNMENT_ID, classId: CLASS_ID })));
  });
  pin(deadline, NOTHING);
});

test('the Submit that finishes the assignment: the final passback is held while the device reports it queued, then sent', async () => {
  const browser = classworkBrowser;
  const names = classworkNames;
  // Questions 1 and 2 as ordinary Submits: the same writes as the first.
  for (const questionIndex of [1, 2]) {
    // eslint-disable-next-line no-await-in-loop
    assertSteps(await submitAsTheBrowser(`classwork q${questionIndex}`, browser, questionIndex, { names }), plainSubmit(DRAIN_SENDING_A_DRAFT), `Submit ${questionIndex}`);
  }

  resetClassroomCalls();
  const steps = await submitAsTheBrowser('finishing', browser, 3, { names });
  assertSteps(steps, {
    reportBefore: NOTHING,
    // The final answer and the Classwork completion it earns are one write.
    // The device still reports the answer queued, so the final grade waits...
    drain: {
      gradeWrites: ['ingestStudentSubmissions: classworkGradesByAssignment + gradesByAssignment + supportUsageByAssignment'],
      detailWrites: 1,
      triggerRuns: 2,
      triggerRunsWithWork: 2,
    },
    // ...until the report after the drain releases it: the final grade goes
    // to Classroom, returned to the student, and their receipt says so.
    reportAfter: {
      gradeWrites: ['reportStudentDeviceQueue: classroomReleaseSignals', RECEIPT],
      detailWrites: 0,
      triggerRuns: 4,
      triggerRunsWithWork: 2,
    },
    activity: ACTIVITY,
    // Completion was recorded with the answer: the reconcile writes nothing.
    reconcile: NOTHING,
  }, 'the finishing Submit');
  const sent = patchGradeCalls();
  assert.equal(sent.length, 1, 'the final grade reaches Classroom once');
  assert.equal(sent[0].assignedGrade ?? sent[0].grade, 100);
  const receipt = (await db.collection('grades').doc(CLASSWORK_STUDENT).get()).data().classroomSyncStatusByAssignment[ASSIGNMENT_ID];
  assert.deepEqual([receipt.stage, receipt.isFinal, receipt.studentVisible, receipt.grade], ['final-complete', true, true, 100]);
  inventory.finishing.total = total(steps);
  snapshots.classwork = await storedState(CLASSWORK_STUDENT);
});

test('a secure Test item: a draft save that answers it, the older one-call submit, and the Test\'s final Submit', async () => {
  await fns.assignTestCycleSessions.run(teacherRequest({ assignmentId: TC_ASSIGNMENT, classId: TC_CLASS }));
  // Review passed, as the ordinary runtime records it.
  await db.collection('grades').doc(TC_STUDENT).set({ gradesByAssignment: { [TC_ASSIGNMENT]: { 0: { status: 'correct' }, 1: { status: 'correct' } } } }, { merge: true });
  const record = (await db.collection('testCycleRecords').doc(`${TC_ASSIGNMENT}__${TC_STUDENT}`).get()).data();
  const examSessionId = record.test.examSessionId;
  const names = { [TC_STUDENT]: '{studentId}', [TC_ASSIGNMENT]: '{assignmentId}', [examSessionId]: '{examSessionId}' };
  const context = { studentId: TC_STUDENT, names };
  await fns.startSecureExamSession.run(studentRequest(TC_STUDENT, { examSessionId }));
  await ledger.followGradeDocument(TC_STUDENT);

  const issue = (position) => fns.issueSecureExamQuestion.run(studentRequest(TC_STUDENT, { examSessionId, position }));
  const first = (await issue(0)).questionInstance;
  names[first.questionInstanceId] = '{questionInstanceId}';
  const answered = await step('secure', 'draft save that answers an item', context, () => ledger.asActor('saveSecureExamDraft', () => fns.saveSecureExamDraft.run(studentRequest(TC_STUDENT, {
    examSessionId, questionInstanceId: first.questionInstanceId, responsePayload: { responses: { answer: certAnswerFromPrompt(first.prompt) } },
  }))));
  // The answered count moves on the Test Cycle record (the teacher's table);
  // the grade record's projection would change only its `updatedAt`, so it is
  // not written (functions/index.js testCycleProjectionUnchanged).
  pin(answered, NOTHING, 'answering a secure item does not write the grade record');
  const edited = await step('secure', 'draft save of the same item again', context, () => ledger.asActor('saveSecureExamDraft', () => fns.saveSecureExamDraft.run(studentRequest(TC_STUDENT, {
    examSessionId, questionInstanceId: first.questionInstanceId, responsePayload: { responses: { answer: CERT_WRONG_ANSWER } },
  }))));
  pin(edited, NOTHING, 'an edit moves no answered count');

  const second = (await issue(1)).questionInstance;
  names[second.questionInstanceId] = '{questionInstanceId}';
  const oneCall = await step('secure', 'older one-call submit of an item', context, () => ledger.asActor('submitSecureExamResponse', () => fns.submitSecureExamResponse.run(studentRequest(TC_STUDENT, {
    examSessionId, questionInstanceId: second.questionInstanceId, responsePayload: { responses: { answer: certAnswerFromPrompt(second.prompt) } }, submissionId: 'gw-sub-2',
  }))));
  pin(oneCall, NOTHING, 'nor does the older call that records an item');
  assert.equal((await db.collection('testCycleRecords').doc(`${TC_ASSIGNMENT}__${TC_STUDENT}`).get()).data().test.answeredQuestions, 2, 'the record counts both answers');

  const finished = await step('secure', 'the Test\'s final Submit', context, () => ledger.asActor('finalizeSecureExam', () => fns.finalizeSecureExam.run(studentRequest(TC_STUDENT, { examSessionId }))));
  pin(finished, {
    gradeWrites: ['finalizeSecureExam: testCycleGrades'],
    detailWrites: 0,
    triggerRuns: 2,
    triggerRunsWithWork: 1,
  }, 'submitted is a new state the student\'s card shows');
  const testRecord = (await db.collection('testCycleRecords').doc(`${TC_ASSIGNMENT}__${TC_STUDENT}`).get()).data();
  assert.equal(testRecord.test.state, 'submitted');
  assert.equal(testRecord.test.answeredQuestions, 2, 'the teacher\'s table still reads the answered count from the record');

  // Not a Submit: the teacher releases the Test. The score and the
  // Corrections plan the failed Test opens are one transaction, so the record
  // and its projection are written once (before, twice: the release, then the
  // plan), and the recorded grade goes to the Test Cycle's Classroom column,
  // assigned and returned, with the student's receipt.
  const release = () => ledger.asActor('proctorExamAction', () => fns.proctorExamAction.run(teacherRequest({ examSessionId, action: 'releaseFeedback' })));
  const recordRef = db.collection('testCycleRecords').doc(`${TC_ASSIGNMENT}__${TC_STUDENT}`);
  const planRef = db.collection('testCycleCorrectionPlans').doc(`${TC_ASSIGNMENT}__${TC_STUDENT}`);
  const projectionOf = async () => (await db.collection('grades').doc(TC_STUDENT).get()).data().testCycleGrades[TC_ASSIGNMENT];
  resetClassroomCalls();
  const released = await step('secure', 'the teacher releases the Test', context, release);
  pin(released, {
    gradeWrites: ['proctorExamAction: testCycleGrades', RECEIPT],
    detailWrites: 0,
    triggerRuns: 4,
    triggerRunsWithWork: 1,
  }, 'the released grade and the Corrections it opens in one write, and the receipt for the grade Classroom now shows the student');
  // The release rule both triggers share: a released Test grade is assigned
  // to the student and returned, so their receipt is one they can see.
  pin(patchGradeCalls().map((call) => call.assignToStudent), [true], 'assigned to the student, not a teacher\'s draft');
  const receipt = (await db.collection('grades').doc(TC_STUDENT).get()).data().classroomSyncStatusByAssignment?.[TC_ASSIGNMENT];
  pin([receipt?.stage, receipt?.studentVisible, receipt?.returnedToStudent], ['testcycle-test', true, true], 'the student\'s receipt says Classroom shows them the grade');
  const releasedRecord = (await recordRef.get()).data();
  const { plan } = (await planRef.get()).data();
  const projection = await projectionOf();
  assert.equal(releasedRecord.test.state, 'released');
  assert.ok(plan.targets.length > 0, 'the failed Test opened its Corrections');
  assert.deepEqual(
    [releasedRecord.corrections.planId, releasedRecord.corrections.total, projection.recordedGrade, projection.correctionsTotal, projection.stage],
    [plan.planId, plan.targets.length, releasedRecord.recordedGrade, plan.targets.length, releasedRecord.stage],
    'the record and its projection carry both the score and the plan',
  );
  assert.deepEqual(patchGradeCalls().map((call) => call.grade), [releasedRecord.recordedGrade], 'the recorded grade reaches Classroom once');

  // The same release again (a double click, two tabs, "release all"): nothing.
  const repeated = await step('secure', 'the teacher releases it again', context, release);
  pin(repeated, NOTHING, 'a repeat release writes nothing');
  assert.deepEqual((await planRef.get()).data().plan, plan, 'and leaves the plan as it was');

  // A release interrupted between its two writes, before they were one, left
  // the record and its projection released with no Corrections plan. The
  // next release builds it, and writes the record and its projection once.
  await planRef.delete();
  await recordRef.update({ 'corrections.planId': null, 'corrections.total': 0 });
  await db.collection('grades').doc(TC_STUDENT).update(new admin.firestore.FieldPath('testCycleGrades', TC_ASSIGNMENT, 'correctionsTotal'), 0);
  await ledger.settleGradeTriggers();
  const repaired = await step('secure', 'a release whose Corrections plan was never written', context, release);
  pin(repaired, {
    gradeWrites: ['proctorExamAction: testCycleGrades'],
    detailWrites: 0,
    triggerRuns: 2,
    triggerRunsWithWork: 1,
  }, 'the plan, and the record and its projection with it, once');
  const repairedRecord = (await recordRef.get()).data();
  assert.equal((await planRef.get()).data()?.plan?.planId, plan.planId, 'the plan is there again');
  assert.deepEqual(
    [repairedRecord.corrections.planId, repairedRecord.corrections.total, repairedRecord.recordedGrade, (await projectionOf()).correctionsTotal],
    [plan.planId, plan.targets.length, releasedRecord.recordedGrade, plan.targets.length],
    'with the score as it was recorded',
  );
  snapshots.secure = await storedState(TC_STUDENT, { testCycleRecord: repairedRecord });
});

test('a Recovery: a Practice answer, an answer saved, and the Recovery Submit', async () => {
  const names = { [RC_STUDENT]: '{studentId}', [RC_ASSIGNMENT.id]: '{assignmentId}' };
  const context = { studentId: RC_STUDENT, names };
  await ledger.followGradeDocument(RC_STUDENT);

  let status = await recovery('status');
  assert.equal(status.state, 'locked');
  const firstItem = status.nextPracticeItem;
  const practiced = await step('recovery', 'a Recovery Practice answer', context, () => recovery('practice', {
    pin: firstItem.pin, practiceIndex: firstItem.practiceIndex, response: correctResponse(reproduce(firstItem)),
  }));
  pin(practiced, {
    gradeWrites: ['advanceSectionRecovery: sectionRecoveryByAssignment'],
    detailWrites: 0,
    triggerRuns: 2,
    triggerRunsWithWork: 0,
  }, 'a Practice answer is recorded on the Recovery record, and no grade moves');

  for (let index = 0; index < 24; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    status = await recovery('status');
    if (status.state !== 'locked') break;
    const item = status.nextPracticeItem;
    // eslint-disable-next-line no-await-in-loop
    await recovery('practice', { pin: item.pin, practiceIndex: item.practiceIndex, response: correctResponse(reproduce(item)) });
  }
  await ledger.settleGradeTriggers();
  const started = (await recovery('start')).record;
  assert.equal(started.status, 'inProgress');
  await ledger.settleGradeTriggers();

  // Each answer is saved to the student's own draft, not the grade record
  // (src/platform/recovery/recoveryAnswerDrafts.js; the Admin SDK stands in
  // for the browser's transaction, as recoveryAnswerDraftsCrossDevice does).
  const draftRef = db.collection('studentWorkspaceDrafts').doc(recoveryDraftDocumentId({ studentId: RC_STUDENT, assignmentId: RC_ASSIGNMENT.id }));
  const sync = createRecoveryAnswerSync({
    studentId: RC_STUDENT,
    assignmentId: RC_ASSIGNMENT.id,
    writer: 'gw-page',
    flush: (patch) => ledger.asActor('client:recoveryAnswerDraft', () => db.runTransaction((transaction) => applyRecoveryAnswerPatch({
      read: async () => {
        const snapshot = await transaction.get(draftRef);
        return snapshot.exists ? snapshot.data() : null;
      },
      write: (merged) => { transaction.set(draftRef, { ...merged, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); },
    }, patch))),
  });
  sync.hydrate({});
  sync.noteServerCopy([]);
  const keyOf = (item) => recoveryAnswerKey({ section: 'dol', opportunity: started.plan.opportunity || 1, itemId: item.itemId });
  const saved = await step('recovery', 'a Recovery answer saved', context, async () => {
    const [item] = started.plan.items;
    sync.save(keyOf(item), buildRecoveryAnswerValue({ itemId: item.itemId, fingerprint: item.pin.fingerprint, response: correctResponse(reproduce(item)) }));
    await sync.whenIdle();
  });
  pin(saved, NOTHING, 'a saved answer is a draft, never the grade record');
  for (const item of started.plan.items.slice(1)) {
    sync.save(keyOf(item), buildRecoveryAnswerValue({ itemId: item.itemId, fingerprint: item.pin.fingerprint, response: correctResponse(reproduce(item)) }));
  }
  await sync.whenIdle();
  sync.stop?.();
  const draftEntries = readRecoveryDraftEntries((await draftRef.get()).data());
  const responses = Object.fromEntries(started.plan.items.map((item) => [item.itemId, draftEntries.find((entry) => entry.key === keyOf(item)).value.response]));

  resetClassroomCalls();
  const submitted = await step('recovery', 'the Recovery Submit', context, () => recovery('submit', { responses }));
  pin(submitted, {
    gradeWrites: [
      'advanceSectionRecovery: sectionRecoveryByAssignment',
      'trigger:syncGradeToClassroom: classroomSyncStatusByAssignment',
      'trigger:syncSectionGradeToClassroom: classroomSectionSyncStatusByAssignment',
    ],
    detailWrites: 0,
    triggerRuns: 6,
    triggerRunsWithWork: 2,
  }, 'the recovered grade, and each trigger\'s receipt for the column it sent');
  assert.ok(patchGradeCalls().length >= 2, 'the recovered grade reaches both Classroom columns');
  snapshots.recovery = await storedState(RC_STUDENT);
});

/*
 * WHAT REACHED CLASSROOM, STEP BY STEP: each push (a grade patched, a
 * submission returned) and each row of the teacher's passback monitor a step
 * wrote, for every step above that did either; every other step did neither.
 * The same table measured on the commit before a Next stopped waking the
 * triggers: the Next sent nothing then and sends nothing now, and no other
 * step moved.
 */
const CLASSROOM_BY_STEP = {
  'classwork, a wrong answer: drain: ingestStudentSubmissions': {
    pushes: ['patchGrade canonpersist-coursework 0 draft'],
    auditRows: ['canonpersist-coursework synced progress-25 0'],
  },
  'classwork: drain: ingestStudentSubmissions': {
    pushes: ['patchGrade canonpersist-coursework 25 draft'],
    auditRows: ['canonpersist-coursework synced progress-25 25'],
  },
  'classwork q1: drain: ingestStudentSubmissions': {
    pushes: ['patchGrade canonpersist-coursework 50 draft'],
    auditRows: ['canonpersist-coursework synced progress-50 50'],
  },
  'classwork q2: drain: ingestStudentSubmissions': {
    pushes: ['patchGrade canonpersist-coursework 75 draft'],
    auditRows: ['canonpersist-coursework synced progress-75 75'],
  },
  // The final grade, held while the device reports the answer queued...
  'finishing: drain: ingestStudentSubmissions': {
    pushes: [],
    auditRows: ['canonpersist-coursework sync-pending sync-pending 100'],
  },
  // ...and sent, returned, when the report after the drain releases it.
  'finishing: device report after the drain': {
    pushes: ['patchGrade canonpersist-coursework 100 assigned', 'returnSubmission canonpersist-coursework'],
    auditRows: ['canonpersist-coursework synced final-complete 100 visible returned'],
  },
  // The teacher releases the failed Test: its recorded grade, to the Test
  // Cycle's own column (sent once, as when the release wrote the grade
  // record twice), assigned to the student and returned, by the release
  // rule both triggers share (classroomReleasePolicyOneRule.test.mjs).
  'secure: the teacher releases the Test': {
    pushes: ['patchGrade gw-tc-whole-cw 4 assigned', 'returnSubmission gw-tc-whole-cw'],
    auditRows: ['gw-tc-whole-cw synced testcycle-test 4 visible returned'],
  },
  'recovery: the Recovery Submit': {
    pushes: ['patchGrade gw-rc-whole-cw 90 assigned', 'returnSubmission gw-rc-whole-cw', 'patchGrade gw-rc-dol-cw 90 assigned', 'returnSubmission gw-rc-dol-cw'],
    auditRows: ['gw-rc-dol-cw synced late-progress-100 90 visible returned', 'gw-rc-whole-cw synced late-progress-100 90 visible returned'],
  },
};

test('what reached Classroom, step by step', () => {
  const table = {};
  for (const [scenario, steps] of Object.entries(inventory)) {
    for (const [name, entry] of Object.entries(steps)) {
      if (entry.pushes?.length || entry.auditRows?.length) table[`${scenario}: ${name}`] = { pushes: entry.pushes, auditRows: entry.auditRows };
    }
  }
  pin(table, CLASSROOM_BY_STEP);
});
