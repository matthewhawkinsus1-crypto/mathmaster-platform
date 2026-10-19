/*
 * THE WARM-UP REOPEN LIFECYCLE, AGAINST THE REAL CLOUD FUNCTIONS.
 *
 *   npm run test:warmup-reopen:emulator
 *
 * The production failure (lmr-wu-1, "This question did not load" after the
 * teacher reopened the Warm-Up) needed the server: ingestion recorded the
 * student's Checks, the deadline finalizer auto-submitted the last complete
 * card sort, and that third attempt CLOSED the question. The October 3 browser
 * journey ran without a server and never got there.
 *
 * Here the server is the real one: functions/index.js loaded against the
 * Firestore emulator (tests/integration/canonicalPersistenceHarness.mjs). The
 * student's Checks go through the real `ingestStudentSubmissions` callable,
 * the checkpoint is finalized by the real scheduled
 * `finalizeStudentResponseCheckpoints`, and a teacher's sweep
 * (`sweepStudentResponseCheckpoints`) plus a second scheduler run prove a retry
 * writes nothing more — as does a Check that reaches ingestion for the closed
 * question after the reopen. The browser's half — opening the question, the
 * board, the envelope, the checkpoint, the workspace backup, and rendering the
 * real QuestionEngine for the record the server wrote — is
 * tests/platform/helpers/warmupServerLifecycle.mjs.
 *
 * IN REAL TIME. The functions read the wall clock, and the finalizer honours a
 * Warm-Up's own close only on its instructional day, so the class period here
 * is TODAY's, around now, and the Warm-Up closes on a timer the teacher
 * starts as the student begins. The test waits those seconds out rather than
 * faking a clock the Firestore client reads too.
 *
 * Its own emulator run: it writes the school's bell schedule
 * (`settings/classSchedule`), which other suites' functions also read.
 */
import '../support/schoolTimeZone.mjs';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { db, fns, studentRequest, teacherRequest } from '../canonicalPersistenceHarness.mjs';
import { getQuestionCredit, normalizeQuestionRecord } from '../../../src/attemptPolicy.js';
import {
  CLASS_ID,
  PERIOD,
  checkSort,
  checkpointSort,
  closeRenderer,
  createDevice,
  deckOf,
  lmrAssignment,
  loadRenderer,
  openQuestion,
  readRender,
  renderQuestion,
  restoreFromServer,
  saveSort,
  serverBackupOf,
  sortFor,
  teacherWarmup,
  useSchoolSchedule,
  warmupStateAt,
} from '../../platform/helpers/warmupServerLifecycle.mjs';

const TEACHER = 'warmup.reopen.teacher@desotoisd.org';
const STUDENT = 'wreopen-student-a';
const ASSIGNMENT = 'wreopen-lmr';
// The Warm-Up timer the teacher starts as the student begins: long enough for
// a loaded CI runner to make every capture before it closes (asserted below).
const TIMER_MS = 25_000;
const MINUTE = 60_000;

const pad = (value) => String(value).padStart(2, '0');
const dateKeyOf = (ms) => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const clockOf = (ms) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;
const startOfDay = (ms) => new Date(ms).setHours(0, 0, 0, 0);
const waitUntil = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms - Date.now())); });

/**
 * Period 1, TODAY: it began a few minutes ago and runs well past the test. In
 * the last minutes of a day the run waits for the next one, so the whole
 * lifecycle happens on one instructional day.
 */
const todaysPeriod = async () => {
  if (Date.now() >= startOfDay(Date.now()) + (24 * 60 - 5) * MINUTE) {
    await waitUntil(new Date(Date.now()).setHours(24, 0, 5, 0));
  }
  const now = Date.now();
  const midnight = startOfDay(now);
  const startMs = Math.max(midnight, Math.floor((now - 8 * MINUTE) / MINUTE) * MINUTE);
  const endMs = Math.min(startMs + 50 * MINUTE, midnight + (23 * 60 + 59) * MINUTE);
  const day = dateKeyOf(now);
  return {
    day,
    schedule: {
      version: 2,
      dayTypeOverrides: { [day]: 'A' },
      daySchedules: { A: { periods: { [PERIOD]: { enabled: true, start: clockOf(startMs), end: clockOf(endMs) } } }, B: { periods: {} } },
    },
  };
};

/** The production lesson, due today, its Warm-Up today in Period 1. */
const lessonFor = ({ day }) => {
  const lateDue = new Date(`${day}T12:00:00`);
  lateDue.setDate(lateDue.getDate() + 3);
  const { id: _id, ...assignment } = lmrAssignment({
    id: ASSIGNMENT,
    studentIds: [STUDENT],
    instructionDate: day,
    releaseAt: `${day}T00:00:00`,
    dueAt: `${day}T23:59:00`,
    lateDueAt: `${dateKeyOf(lateDue.getTime())}T23:59:00`,
  });
  // The default ten minutes would close it mid-test; the teacher's timer does.
  return { ...assignment, warmup: { ...assignment.warmup, closeMinutesAfterStart: 40 } };
};

const readRecord = async () => {
  const grade = (await db.collection('grades').doc(STUDENT).get()).data() || {};
  return grade?.gradesByAssignment?.[ASSIGNMENT]?.['0'] ?? null;
};
const readAssignment = async () => ({ id: ASSIGNMENT, ...(await db.collection('assignments').doc(ASSIGNMENT).get()).data() });
// App.jsx handleToggleWarmupForClass writes the control's result to the assignment.
const saveWarmup = (assignment, changedAtMs) => db.collection('assignments').doc(ASSIGNMENT)
  .update({ warmup: assignment.warmup, updatedAt: new Date(changedAtMs).toISOString() });
const ingest = async (envelope) => {
  const result = await fns.ingestStudentSubmissions.run(studentRequest(STUDENT, { submissions: [JSON.parse(JSON.stringify(envelope))] }));
  return result.receipts[0];
};
const placedIn = (sort, slot) => Object.values(sort).filter((value) => value === slot).length;

/** Everything the server holds about Q1: the record, its checkpoint, the teacher's evidence. */
const serverStateOf = async (checkpointId) => {
  const gradeRef = db.collection('grades').doc(STUDENT);
  const [grade, checkpoint, inspection, events] = await Promise.all([
    gradeRef.get(),
    db.collection('studentResponseCheckpoints').doc(checkpointId).get(),
    gradeRef.collection('responseInspectionEvidence').get(),
    gradeRef.collection('evidenceEvents').get(),
  ]);
  const plain = (value) => JSON.parse(JSON.stringify(value ?? null));
  return {
    record: plain(grade.data()?.gradesByAssignment?.[ASSIGNMENT]?.['0']),
    checkpoint: plain(checkpoint.data()),
    inspection: plain(inspection.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    events: plain(events.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
  };
};

let period = null;

before(async () => {
  period = await todaysPeriod();
  useSchoolSchedule(period.schedule);
  await loadRenderer();
  await db.collection('settings').doc('classSchedule').set(period.schedule);
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Algebra I — Period 1', course: 'algebra1', courseLevel: 'standard',
    period: PERIOD, teacherOfRecord: TEACHER, status: 'active',
  });
  await db.collection('grades').doc(STUDENT).set({
    displayName: 'Warm-Up Reopen Student', classId: CLASS_ID, classPeriod: PERIOD,
    assignedTeacherEmail: TEACHER, status: 'active', gradesByAssignment: {},
  });
  await db.collection('assignments').doc(ASSIGNMENT).set(lessonFor(period));
});

after(async () => {
  useSchoolSchedule(null);
  await closeRenderer();
  const checkpoints = await db.collection('studentResponseCheckpoints').where('studentId', '==', STUDENT).get();
  const receipts = await db.collection('studentSubmissionReceipts').where('studentId', '==', STUDENT).get();
  await Promise.all([...checkpoints.docs, ...receipts.docs].map((doc) => doc.ref.delete()));
  await Promise.all([
    db.collection('assignments').doc(ASSIGNMENT).delete(),
    db.collection('grades').doc(STUDENT).delete(),
    db.collection('classes').doc(CLASS_ID).delete(),
    db.collection('settings').doc('classSchedule').delete(),
  ]);
});

test('lmr-wu-1: Checks through real ingestion, the timer\'s auto-submit through the real scheduler, a teacher reopen — the same question renders, closed and intact, on this Chromebook and another', async () => {
  let assignment = await readAssignment();
  assert.equal(warmupStateAt(assignment, Date.now()).status, 'active', 'Period 1\'s Warm-Up is open');

  // The teacher starts the Warm-Up timer.
  const timerSetAt = Date.now();
  const closesAt = timerSetAt + TIMER_MS;
  await saveWarmup(teacherWarmup(assignment, 'timer', timerSetAt, period.day, { timerClosesAtMs: closesAt }), timerSetAt);
  assignment = await readAssignment();
  assert.equal(warmupStateAt(assignment, closesAt).status, 'closed', 'the timer closes the Warm-Up');

  // The student opens Q1: the family instance dealt to them.
  const chromebook = createDevice(STUDENT);
  let opened = await openQuestion(chromebook, { assignment, nowMs: Date.now() });
  assert.equal(opened.question.questionId, 'lmr-wu-1');
  assert.equal(opened.processed.type, 'representationMatch');
  const dealt = opened.processed.familyDelivery;
  assert.equal(dealt.familyId, 'linear.representationSort');

  // Two Checks, both wrong, both recorded by the real ingestion.
  let session;
  for (const how of ['all-a', 'all-b']) {
    const sort = sortFor(opened.processed, how);
    await saveSort(chromebook, opened, sort);
    const checked = await checkSort(chromebook, opened, { sort, sessionRecord: session, capturedAt: Date.now() });
    const receipt = await ingest(checked.envelope);
    assert.equal(receipt.disposition, 'accepted', `${how}: ${receipt.reason || ''}`);
    assert.equal(receipt.gradedBy, 'server', 'marked by the server from the pinned instance');
    session = checked.sessionRecord;
  }
  const afterChecks = await readRecord();
  assert.equal(afterChecks.totalAttempts, 2);
  assert.equal(afterChecks.familyDelivery.fingerprint, dealt.fingerprint, 'ingestion pinned the instance the student was shown');

  // A third complete sort, not checked: the board saves it and its checkpoint
  // reaches MathMaster before the timer runs out (as the drain transaction
  // stores it).
  const lastSort = sortFor(opened.processed, 'one-off');
  await saveSort(chromebook, opened, lastSort);
  const checkpoint = await checkpointSort(chromebook, opened, { sort: lastSort, sessionRecord: session, capturedAt: Date.now() });
  assert.equal(checkpoint.isComplete, true);
  assert.equal(checkpoint.previousTotalAttempts, 2);
  assert.ok(checkpoint.serverAcknowledgedAt.getTime() < closesAt, 'the checkpoint was stored before the close');
  await db.collection('studentResponseCheckpoints').doc(checkpoint.documentId).set(checkpoint);

  // The timer runs out. The real scheduler finalizes the checkpoint.
  await waitUntil(closesAt + 1_000);
  assert.equal(warmupStateAt(assignment, Date.now()).status, 'closed');
  await fns.finalizeStudentResponseCheckpoints.run({});
  const finalized = (await db.collection('studentResponseCheckpoints').doc(checkpoint.documentId).get()).data();
  assert.equal(finalized.status, 'auto-submitted', `the checkpoint was auto-submitted (${JSON.stringify(finalized.lastOutcome ?? finalized.rescheduleReason ?? null)})`);
  const closed = await readRecord();
  assert.equal(closed.status, 'expired', 'the auto-submitted third attempt closes the question');
  assert.equal(closed.totalAttempts, 3);
  assert.equal(closed.submissionOrigin, 'deadline-auto-submit');
  assert.equal(closed.familyDelivery.fingerprint, dealt.fingerprint, 'the server pinned the instance the student was shown');
  const credit = getQuestionCredit(closed);
  const settled = await serverStateOf(checkpoint.documentId);
  assert.deepEqual(settled.inspection.map((doc) => doc.submissionId), [closed.lastSubmissionId], 'the teacher sees the response the deadline submitted');
  assert.equal(settled.events.length, 3, 'one evidence event per counted attempt');

  // A teacher's sweep, and the scheduler again: nothing more is written.
  const sweep = await fns.sweepStudentResponseCheckpoints.run(teacherRequest({ assignmentId: ASSIGNMENT, classId: CLASS_ID }, TEACHER));
  assert.equal(sweep.complete, true);
  await fns.finalizeStudentResponseCheckpoints.run({});
  assert.deepEqual(await serverStateOf(checkpoint.documentId), settled, 'a retry of the deadline writes nothing');

  // The teacher reopens the Warm-Up for the class.
  const reopenedAt = Date.now();
  await saveWarmup(teacherWarmup(assignment, 'reopen', reopenedAt, period.day), reopenedAt);
  assignment = await readAssignment();
  assert.equal(warmupStateAt(assignment, Date.now()).status, 'active', 'the reopened Warm-Up is open');
  assert.deepEqual(await serverStateOf(checkpoint.documentId), settled, 'a reopen changes the section, never the record');

  // The same Chromebook, reloaded, with the record as the server wrote it.
  const record = await readRecord();
  opened = await openQuestion(chromebook, { assignment, record, nowMs: Date.now() });
  assert.equal(opened.familyContext.pinSource, 'canonical');
  assert.equal(opened.processed.type, 'representationMatch', 'no platformQuestionError: the canonical pin replays');
  assert.equal(opened.processed.familyDelivery.fingerprint, dealt.fingerprint, 'the same mathematical question');
  const rendered = await renderQuestion(chromebook, opened, { record, nowMs: Date.now() });
  assert.deepEqual(rendered.errors, [], 'the question renders without an exception');
  const screen = readRender(rendered);
  assert.equal(screen.failed, false, 'no "This question did not load"');
  assert.equal(screen.locked, true, 'a closed question stays closed after the reopen');
  assert.equal(screen.closedNotice, true);
  assert.equal(screen.review, true, 'the card-sort solution is shown');
  assert.equal(screen.placedInA + screen.placedInB, deckOf(opened.processed).length, 'the board shows the sort that was submitted');
  assert.equal(screen.placedInA, placedIn(lastSort, 0));

  // Another Chromebook: no local draft, no device pin — only the server.
  const other = createDevice(STUDENT);
  assert.equal(await restoreFromServer(other, serverBackupOf(chromebook, opened), record), 1, 'the workspace backup of the submitted sort is restored');
  const elsewhere = await openQuestion(other, { assignment, record, nowMs: Date.now() });
  assert.equal(elsewhere.familyContext.pinSource, 'canonical');
  assert.equal(elsewhere.processed.familyDelivery.fingerprint, dealt.fingerprint);
  const elsewhereRendered = await renderQuestion(other, elsewhere, { record, nowMs: Date.now() });
  assert.deepEqual(elsewhereRendered.errors, []);
  const elsewhereScreen = readRender(elsewhereRendered);
  assert.equal(elsewhereScreen.failed, false);
  assert.equal(elsewhereScreen.locked, true);
  assert.equal(elsewhereScreen.review, true);
  assert.equal(elsewhereScreen.placedInA, placedIn(lastSort, 0));
  assert.equal(elsewhereScreen.placedInA + elsewhereScreen.placedInB, deckOf(elsewhere.processed).length);

  // A Check that reaches the server for the closed question anyway — even a
  // correct one — is retired, and nothing about the question is rewritten:
  // not the record's provenance, not the teacher's evidence of the response
  // that counted, not that attempt's evidence event, not its checkpoint.
  const fourth = await checkSort(chromebook, opened, { sort: sortFor(opened.processed, 'correct'), sessionRecord: record, capturedAt: Date.now() });
  const delivered = await ingest(fourth.envelope);
  assert.equal(delivered.disposition, 'superseded');
  assert.equal(delivered.reason, 'question-already-final');
  assert.deepEqual(await serverStateOf(checkpoint.documentId), settled, 'the closed question is untouched');
  const latest = await readRecord();
  assert.equal(normalizeQuestionRecord(latest).totalAttempts, 3, 'no extra attempt');
  assert.equal(latest.status, 'expired');
  assert.equal(getQuestionCredit(latest), credit, 'and the grade did not move');

  // Question 2 of the Warm-Up still opens.
  const neighbour = await openQuestion(other, { assignment, questionIndex: 1, nowMs: Date.now() });
  assert.equal(neighbour.question.questionId, 'lmr-wu-2');
  assert.equal(readRender(await renderQuestion(other, neighbour, { nowMs: Date.now() })).failed, false);
});
