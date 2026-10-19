/*
 * A WARM-UP THE SERVER FINALIZED, REOPENED — AND THE SAME QUESTION COMES BACK.
 *
 * Production, October 2026: Algebra I — Multiple Representations of Linear
 * Equations, Warm-Up Question 1 (lmr-wu-1, representationMatch, Question
 * Family linear.representationSort). After the Warm-Up timed out and the
 * teacher reopened it, students returning to Q1 met the OUTER question
 * boundary's "This question did not load" — Try again, Go to Question 2,
 * Copy details — with their attempts and grade intact. The October 3 fix
 * (3a18858) had made a malformed saved draft recoverable inside the response
 * module; this failure was not inside the module.
 *
 * WHAT HAPPENED. A Warm-Up allows three attempts. A student Checked twice,
 * left a third complete sort unchecked, and the Warm-Up's timer closed. The
 * deadline finalizer auto-submitted that sort: the third attempt, so the
 * question became CLOSED ("expired"). Nothing in the browser had ever shown a
 * closed card sort — the student had not been on the page — until the teacher
 * reopened the Warm-Up and the student came back. A closed question renders
 * its solution review, outside the response module's boundary; for a card
 * sort that review fell through to the "complete set" layout and put a set's
 * `table` into the page, and a Question Family set carries its table as a
 * spec — `{ xValues: [-1, 0, 1, 2] }`. React refused to render the object
 * ("Objects are not valid as a React child (found: object with keys
 * {xValues})"), the nearest boundary was the outer one, and every reload and
 * every Chromebook threw again.
 *
 * WHY OCTOBER 3 DID NOT SEE IT. Its browser journey's harness had no server:
 * a Check stayed queued on the device, and no deadline finalized anything, so
 * no question there ever became closed. This file runs the half of the
 * lifecycle it could not: Checks through server ingestion, the checkpoint
 * through the deadline finalizer, the reopen, a reload on the same Chromebook
 * and on another one — each step through the code production runs
 * (helpers/warmupServerLifecycle.mjs) — and then renders the REAL
 * QuestionEngine for what came back.
 *
 * And two disagreements between the finalized server state and the browser,
 * found on the way and fixed with it:
 *
 *   - the board came back EMPTY after an auto-submit: the deadline records the
 *     attempt at the close, and the student's own saved sort — the very work
 *     that was submitted — read as older than its own submission, so it was
 *     deleted on the next mount and refused from the server backup
 *     (canonicalResponseTime.js);
 *   - an open session never learned of the auto-submit: it kept offering an
 *     attempt the server no longer had, and its next checkpoint carried a
 *     stale attempt count, so a SECOND close skipped the student's newer work
 *     (canonicalTrackerReconciliation.js).
 */
import test, { after, before, mock } from 'node:test';
import assert from 'node:assert/strict';

import { getQuestionCredit, normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { adoptCanonicalAdvances } from '../../src/platform/persistence/canonicalTrackerReconciliation.js';
import { writeQuestionDraft } from '../../src/questionDraftStorage.js';
import { toolDraftKey } from '../../src/tools/shared/usePersistentToolState.js';
import { CHECKPOINT_STATUS } from '../../functions/shared/responseCheckpointSchema.mjs';
import {
  DAY,
  NEXT_DAY,
  WARMUP_ATTEMPTS,
  at,
  checkSort,
  checkpointSort,
  closeRenderer,
  createDevice,
  deckOf,
  finalizeLikeServer,
  gradeDocumentFor,
  ingestLikeServer,
  lmrAssignment,
  loadRenderer,
  openQuestion,
  readRender,
  recordOf,
  renderQuestion,
  restoreFromServer,
  saveSort,
  savedSort,
  serverBackupOf,
  sortFor,
  teacherWarmup,
  warmupStateAt,
} from './helpers/warmupServerLifecycle.mjs';

before(async () => { await loadRenderer(); });
after(async () => { await closeRenderer(); });

// One school clock for the whole lifecycle: drafts, checkpoints, ingestion
// and the finalizer all read Date.now().
const clock = (t) => {
  mock.timers.enable({ apis: ['Date'], now: at(DAY, '07:55') });
  t.after(() => mock.timers.reset());
  return (ms) => mock.timers.setTime(ms);
};

const placedCount = (sort) => Object.keys(sort || {}).length;
const placedIn = (sort, slot) => Object.values(sort || {}).filter((value) => value === slot).length;

/* ===================================================================== */
/* 1. THE INCIDENT, END TO END                                           */
/* ===================================================================== */

test('lmr-wu-1: two Checks, the deadline auto-submits the third sort, the teacher reopens — the same question renders, closed, with the student\'s sort and its solution', async (t) => {
  const setTime = clock(t);
  const STUDENT = 'student-a';
  let assignment = lmrAssignment({ studentIds: [STUDENT] });
  const chromebook = createDevice(STUDENT);
  let server = gradeDocumentFor(STUDENT);

  // Monday 08:01, Period 1: the Warm-Up is open and Q1 is dealt to this student.
  setTime(at(DAY, '08:01'));
  assert.equal(warmupStateAt(assignment, Date.now()).status, 'active');
  let opened = await openQuestion(chromebook, { assignment, nowMs: Date.now() });
  assert.equal(opened.processed.type, 'representationMatch');
  assert.equal(opened.question.questionId, 'lmr-wu-1');
  const dealt = opened.processed.familyDelivery;
  assert.equal(dealt.familyId, 'linear.representationSort');
  assert.equal(dealt.basis, 'seated', 'the class was seated by the teacher\'s app');
  // The production table spec the review used to render.
  assert.deepEqual(opened.processed.sets[0].table, { xValues: [-1, 0, 1, 2] });

  // Two Checks, both wrong, both recorded by server ingestion.
  let session;
  for (const [hhmm, how] of [['08:02', 'all-a'], ['08:04', 'all-b']]) {
    setTime(at(DAY, hhmm));
    const sort = sortFor(opened.processed, how);
    await saveSort(chromebook, opened, sort);
    const checked = await checkSort(chromebook, opened, { sort, sessionRecord: session, capturedAt: Date.now() });
    const ingested = ingestLikeServer({ envelope: checked.envelope, assignment, gradeDocument: server, now: Date.now() + 1500 });
    assert.equal(ingested.receipt.disposition, 'accepted', `the ${hhmm} Check is accepted by ingestion`);
    assert.equal(ingested.receipt.gradedBy, 'server', 'and marked by the server from the pinned instance');
    server = ingested.gradeDocument;
    session = checked.sessionRecord;
  }
  assert.equal(normalizeQuestionRecord(recordOf(server, assignment.id)).totalAttempts, 2);
  assert.equal(recordOf(server, assignment.id).familyDelivery.fingerprint, dealt.fingerprint);

  // 08:06: a third, complete sort — not checked. The board saves it and its
  // checkpoint reaches MathMaster before the close.
  setTime(at(DAY, '08:06'));
  const lastSort = sortFor(opened.processed, 'one-off');
  await saveSort(chromebook, opened, lastSort);
  setTime(at(DAY, '08:06', 2));
  const checkpoint = await checkpointSort(chromebook, opened, { sort: lastSort, sessionRecord: session, capturedAt: Date.now() });
  assert.equal(checkpoint.isComplete, true);
  assert.equal(checkpoint.previousTotalAttempts, 2);

  // 08:10 the timer closes the Warm-Up; 08:11 the scheduler finalizes.
  assert.equal(warmupStateAt(assignment, at(DAY, '08:10', 30)).status, 'closed');
  setTime(at(DAY, '08:11'));
  const finalized = finalizeLikeServer({ checkpoint, assignment, gradeDocument: server, now: Date.now() });
  assert.equal(finalized.decision.status, CHECKPOINT_STATUS.AUTO_SUBMITTED);
  server = finalized.gradeDocument;
  const closed = recordOf(server, assignment.id);
  assert.equal(closed.status, 'expired', `the third of ${WARMUP_ATTEMPTS} attempts closes the question`);
  assert.equal(closed.totalAttempts, 3);
  assert.equal(closed.submissionOrigin, 'deadline-auto-submit');
  assert.equal(closed.familyDelivery.fingerprint, dealt.fingerprint, 'the server pinned the instance the student was shown');
  const closedCredit = getQuestionCredit(closed);
  // A retry of the scheduler writes nothing more.
  assert.equal(finalizeLikeServer({ checkpoint: finalized.checkpoint, assignment, gradeDocument: server, now: Date.now() + 60_000 }).decision.action, 'skip');

  // Tuesday 08:02: the lesson is past due; the teacher reopens the Warm-Up.
  setTime(at(NEXT_DAY, '08:02'));
  const beforeReopen = JSON.parse(JSON.stringify(server));
  assignment = teacherWarmup(assignment, 'reopen', Date.now(), NEXT_DAY);
  setTime(at(NEXT_DAY, '08:03'));
  assert.equal(warmupStateAt(assignment, Date.now()).status, 'active', 'the reopened Warm-Up is open');
  assert.deepEqual(server, beforeReopen, 'a reopen changes section availability, never the record');

  // The same Chromebook, reloaded.
  opened = await openQuestion(chromebook, { assignment, record: closed, nowMs: Date.now() });
  assert.equal(opened.lifecycle.isLate, true, 'the student is in the late window, as in production');
  assert.equal(opened.familyContext.pinSource, 'canonical');
  assert.equal(opened.processed.type, 'representationMatch', 'no platformQuestionError: the canonical pin replays');
  assert.equal(opened.processed.familyPinNotice, undefined);
  assert.equal(opened.processed.familyDelivery.fingerprint, dealt.fingerprint, 'the same mathematical question');
  assert.equal(opened.processed.prompt, (await openQuestion(createDevice(STUDENT), { assignment, record: closed, nowMs: Date.now() })).processed.prompt);
  const rendered = await renderQuestion(chromebook, opened, { record: closed, nowMs: Date.now() });
  assert.deepEqual(rendered.errors, [], 'the question renders without an exception');
  const screen = readRender(rendered);
  assert.equal(screen.failed, false, 'no "This question did not load"');
  assert.equal(screen.locked, true, 'a closed question stays closed after the reopen');
  assert.equal(screen.closedNotice, true);
  assert.equal(screen.review, true, 'the card-sort solution is shown');
  assert.equal(screen.placedInA + screen.placedInB, deckOf(opened.processed).length, 'the board shows the sort that was submitted');
  assert.equal(screen.placedInA, placedIn(lastSort, 0));
  assert.equal(normalizeQuestionRecord(closed).totalAttempts, 3, 'no attempt was added');
  assert.equal(getQuestionCredit(closed), closedCredit, 'and the grade did not move');

  // Another Chromebook: no local draft, no device pin — only the server.
  const other = createDevice(STUDENT);
  assert.equal(await restoreFromServer(other, serverBackupOf(chromebook, opened), closed), 1, 'the server backup of the submitted sort is restored');
  const elsewhere = await openQuestion(other, { assignment, record: closed, nowMs: Date.now() });
  assert.equal(elsewhere.processed.familyDelivery.fingerprint, dealt.fingerprint);
  const elsewhereScreen = readRender(await renderQuestion(other, elsewhere, { record: closed, nowMs: Date.now() }));
  assert.equal(elsewhereScreen.failed, false);
  assert.equal(elsewhereScreen.locked, true);
  assert.equal(elsewhereScreen.review, true);
  assert.equal(elsewhereScreen.placedInA + elsewhereScreen.placedInB, deckOf(elsewhere.processed).length);

  // Question 2 of the Warm-Up is still there.
  const neighbour = await openQuestion(other, { assignment, questionIndex: 1, nowMs: Date.now() });
  assert.equal(neighbour.question.questionId, 'lmr-wu-2');
  assert.equal(neighbour.processed.type, 'representationMatch');
  assert.equal(readRender(await renderQuestion(other, neighbour, { nowMs: Date.now() })).failed, false);
});

/* ===================================================================== */
/* 2. A CORRECT Q1 IS FINAL                                              */
/* ===================================================================== */

test('a correct (terminal) Q1 stays correct, locked and viewable through the close and the reopen', async (t) => {
  const setTime = clock(t);
  const STUDENT = 'student-c';
  let assignment = lmrAssignment({ studentIds: [STUDENT] });
  const chromebook = createDevice(STUDENT);
  let server = gradeDocumentFor(STUDENT);

  setTime(at(DAY, '08:02'));
  let opened = await openQuestion(chromebook, { assignment, nowMs: Date.now() });
  const sort = sortFor(opened.processed, 'correct');
  await saveSort(chromebook, opened, sort);
  setTime(at(DAY, '08:03'));
  const checked = await checkSort(chromebook, opened, { sort, capturedAt: Date.now() });
  assert.equal(checked.verdict.isCorrect, true);
  server = ingestLikeServer({ envelope: checked.envelope, assignment, gradeDocument: server, now: Date.now() + 1000 }).gradeDocument;
  const correct = recordOf(server, assignment.id);
  assert.equal(correct.status, 'correct');

  setTime(at(NEXT_DAY, '08:02'));
  assignment = teacherWarmup(assignment, 'reopen', Date.now(), NEXT_DAY);
  setTime(at(NEXT_DAY, '08:03'));
  opened = await openQuestion(chromebook, { assignment, record: correct, nowMs: Date.now() });
  const screen = readRender(await renderQuestion(chromebook, opened, { record: correct, nowMs: Date.now() }));
  assert.equal(screen.failed, false);
  assert.equal(screen.locked, true, 'a reopen never makes a correct response editable again');
  assert.equal(screen.correctNotice, true);
  assert.equal(screen.placedInA + screen.placedInB, deckOf(opened.processed).length, 'the student still sees what they completed');
  assert.equal(recordOf(server, assignment.id).totalAttempts, 1);
  assert.equal(getQuestionCredit(recordOf(server, assignment.id)), 1);
});

/* ===================================================================== */
/* 3. EVERY STARTING STATE, THROUGH CLOSE → FINALIZE → REOPEN → RELOAD    */
/* ===================================================================== */

const START_STATES = [
  // name, what the student did before the close, and what must come back.
  { name: 'untouched', act: async () => {}, expect: { status: 'unattempted', attempts: 0, placed: 0, locked: false } },
  {
    name: 'partially sorted draft',
    act: async ({ chromebook, opened }) => { await saveSort(chromebook, opened, sortFor(opened.processed, 'partial')); },
    expect: { status: 'unattempted', attempts: 0, placed: 5, locked: false },
  },
  {
    name: 'complete but not submitted (auto-submitted at the deadline)',
    act: async ({ chromebook, opened, setTime, checkpoints }) => {
      const sort = sortFor(opened.processed, 'one-off');
      await saveSort(chromebook, opened, sort);
      setTime(Date.now() + 2000);
      checkpoints.push(await checkpointSort(chromebook, opened, { sort, capturedAt: Date.now() }));
    },
    expect: { status: 'attempted', attempts: 1, placed: 'all', locked: false, origin: 'deadline-auto-submit' },
  },
  {
    name: 'incorrect submitted attempt',
    act: async ({ chromebook, opened, assignment, server }) => {
      const sort = sortFor(opened.processed, 'all-a');
      await saveSort(chromebook, opened, sort);
      const checked = await checkSort(chromebook, opened, { sort, capturedAt: Date.now() });
      server.current = ingestLikeServer({ envelope: checked.envelope, assignment, gradeDocument: server.current, now: Date.now() + 1000 }).gradeDocument;
    },
    expect: { status: 'attempted', attempts: 1, placed: 'all', locked: false, origin: 'server-ingestion' },
  },
  {
    name: 'correct submitted response',
    act: async ({ chromebook, opened, assignment, server }) => {
      const sort = sortFor(opened.processed, 'correct');
      await saveSort(chromebook, opened, sort);
      const checked = await checkSort(chromebook, opened, { sort, capturedAt: Date.now() });
      server.current = ingestLikeServer({ envelope: checked.envelope, assignment, gradeDocument: server.current, now: Date.now() + 1000 }).gradeDocument;
    },
    expect: { status: 'correct', attempts: 1, placed: 'all', locked: true },
  },
  {
    name: 'malformed legacy draft (a null card map)',
    act: async ({ chromebook, opened }) => {
      await chromebook.run(() => writeQuestionDraft(toolDraftKey(opened.draftKey), { linearAssignments: null }, { edit: true }));
    },
    expect: { status: 'unattempted', attempts: 0, placed: 0, locked: false },
  },
];

for (const state of START_STATES) {
  test(`start state "${state.name}": close → finalize → reopen → reload brings back the same question and keeps the record`, async (t) => {
    const setTime = clock(t);
    const STUDENT = `student-${state.name.replace(/[^a-z]+/gi, '-').toLowerCase()}`;
    let assignment = lmrAssignment({ studentIds: [STUDENT] });
    const chromebook = createDevice(STUDENT);
    const server = { current: gradeDocumentFor(STUDENT) };
    const checkpoints = [];

    setTime(at(DAY, '08:02'));
    let opened = await openQuestion(chromebook, { assignment, nowMs: Date.now() });
    const dealt = opened.processed.familyDelivery;
    await state.act({ chromebook, opened, assignment, server, setTime, checkpoints });

    // The close, and the scheduler over whatever checkpoints exist.
    setTime(at(DAY, '08:11'));
    for (const checkpoint of checkpoints) {
      server.current = finalizeLikeServer({ checkpoint, assignment, gradeDocument: server.current, now: Date.now() }).gradeDocument;
    }
    const recordBefore = recordOf(server.current, assignment.id);
    const creditBefore = getQuestionCredit(recordBefore);

    setTime(at(NEXT_DAY, '08:02'));
    assignment = teacherWarmup(assignment, 'reopen', Date.now(), NEXT_DAY);
    setTime(at(NEXT_DAY, '08:03'));
    const record = recordOf(server.current, assignment.id);
    assert.deepEqual(record, recordBefore, 'the reopen left the record exactly as the server wrote it');

    opened = await openQuestion(chromebook, { assignment, record: record || undefined, nowMs: Date.now() });
    assert.equal(opened.processed.type, 'representationMatch', 'no platformQuestionError');
    assert.equal(opened.processed.familyDelivery.fingerprint, dealt.fingerprint, 'the same family instance');
    assert.equal(opened.question.questionId, 'lmr-wu-1');
    const normalized = normalizeQuestionRecord(record);
    assert.equal(normalized.status, state.expect.status);
    assert.equal(normalized.totalAttempts, state.expect.attempts, 'no attempt was added or lost');
    assert.equal(getQuestionCredit(record), creditBefore, 'the grade did not move');
    if (state.expect.origin) assert.equal(record.submissionOrigin, state.expect.origin);

    const rendered = await renderQuestion(chromebook, opened, { record: record || undefined, nowMs: Date.now() });
    assert.deepEqual(rendered.errors, []);
    const screen = readRender(rendered);
    assert.equal(screen.failed, false, 'the question renders');
    assert.equal(screen.locked, state.expect.locked, state.expect.locked ? 'a final question stays final' : 'an open question is open again');
    const expectedPlaced = state.expect.placed === 'all' ? deckOf(opened.processed).length : state.expect.placed;
    assert.equal(screen.placedInA + screen.placedInB, expectedPlaced, 'the valid work is back on the board');

    const neighbour = await openQuestion(chromebook, { assignment, questionIndex: 1, nowMs: Date.now() });
    assert.equal(readRender(await renderQuestion(chromebook, neighbour, { nowMs: Date.now() })).failed, false, 'Question 2 is reachable');
  });
}

test('start state "server-restored draft": partial work on one Chromebook comes back on another after the reopen', async (t) => {
  const setTime = clock(t);
  const STUDENT = 'student-restored';
  let assignment = lmrAssignment({ studentIds: [STUDENT] });
  const first = createDevice(STUDENT);
  setTime(at(DAY, '08:02'));
  const opened = await openQuestion(first, { assignment, nowMs: Date.now() });
  const partial = sortFor(opened.processed, 'partial');
  await saveSort(first, opened, partial);

  setTime(at(NEXT_DAY, '08:02'));
  assignment = teacherWarmup(assignment, 'reopen', Date.now(), NEXT_DAY);
  setTime(at(NEXT_DAY, '08:03'));
  const second = createDevice(STUDENT);
  assert.equal(await restoreFromServer(second, serverBackupOf(first, opened), undefined), 1);
  const reopened = await openQuestion(second, { assignment, nowMs: Date.now() });
  // With no attempt yet, the device pin of the first Chromebook is not here:
  // the seat allocation deals the same instance again.
  assert.equal(reopened.processed.familyDelivery.fingerprint, opened.processed.familyDelivery.fingerprint);
  assert.deepEqual(await savedSort(second, reopened), partial);
  const screen = readRender(await renderQuestion(second, reopened, { nowMs: Date.now() }));
  assert.equal(screen.failed, false);
  assert.equal(screen.locked, false);
  assert.equal(screen.placedInA + screen.placedInB, placedCount(partial));
});

/* ===================================================================== */
/* 4. CLOSE → REOPEN → CLOSE → REOPEN                                    */
/* ===================================================================== */

test('close → reopen → close → reopen: the open session takes in each auto-submit, so the second close submits the newer work', async (t) => {
  const setTime = clock(t);
  const STUDENT = 'student-cycles';
  let assignment = lmrAssignment({ studentIds: [STUDENT] });
  const chromebook = createDevice(STUDENT);
  let server = gradeDocumentFor(STUDENT);
  // The open session's own grades (App.jsx `tracker`), loaded at sign-in.
  let session = { [assignment.id]: {} };

  setTime(at(DAY, '08:02'));
  let opened = await openQuestion(chromebook, { assignment, nowMs: Date.now() });
  const firstSort = sortFor(opened.processed, 'all-a');
  await saveSort(chromebook, opened, firstSort);
  setTime(at(DAY, '08:02', 3));
  const firstCheckpoint = await checkpointSort(chromebook, opened, { sort: firstSort, capturedAt: Date.now() });

  // Close #1 (the timer) and its finalization.
  setTime(at(DAY, '08:11'));
  server = finalizeLikeServer({ checkpoint: firstCheckpoint, assignment, gradeDocument: server, now: Date.now() }).gradeDocument;
  assert.equal(recordOf(server, assignment.id).totalAttempts, 1);

  // The student never reloads. The grade listener brings the auto-submit in.
  const adopted = adoptCanonicalAdvances(session, server.gradesByAssignment);
  assert.equal(adopted.adopted.length, 1, 'the session adopts the attempt it did not make');
  session = adopted.grades;
  assert.equal(normalizeQuestionRecord(session[assignment.id][0]).totalAttempts, 1);

  // Reopen #1 (next day); the student changes the sort; the open board
  // checkpoints against the attempt count it now knows.
  setTime(at(NEXT_DAY, '08:02'));
  assignment = teacherWarmup(assignment, 'reopen', Date.now(), NEXT_DAY);
  setTime(at(NEXT_DAY, '08:05'));
  opened = { ...opened, assignment };
  const secondSort = sortFor(opened.processed, 'one-off');
  await saveSort(chromebook, opened, secondSort);
  setTime(at(NEXT_DAY, '08:05', 3));
  const secondCheckpoint = await checkpointSort(chromebook, opened, { sort: secondSort, sessionRecord: session[assignment.id][0], capturedAt: Date.now() });
  assert.equal(secondCheckpoint.previousTotalAttempts, 1);

  // What the stale session used to send: the second close skipped the newer work.
  const staleCheckpoint = await checkpointSort(chromebook, opened, { sort: secondSort, sessionRecord: undefined, capturedAt: Date.now() });
  setTime(at(NEXT_DAY, '08:20'));
  assignment = teacherWarmup(assignment, 'close', Date.now(), NEXT_DAY);
  setTime(at(NEXT_DAY, '08:21'));
  assert.equal(
    finalizeLikeServer({ checkpoint: staleCheckpoint, assignment, gradeDocument: server, now: Date.now() }).decision.status,
    CHECKPOINT_STATUS.SKIPPED_NEWER_SUBMISSION,
    'a checkpoint built from a stale session is skipped at the close (why the session must adopt the auto-submit)',
  );

  // Close #2 (the teacher) and its finalization: the newer work is submitted.
  const second = finalizeLikeServer({ checkpoint: secondCheckpoint, assignment, gradeDocument: server, now: Date.now() });
  assert.equal(second.decision.status, CHECKPOINT_STATUS.AUTO_SUBMITTED);
  server = second.gradeDocument;
  const twice = recordOf(server, assignment.id);
  assert.equal(twice.totalAttempts, 2);
  assert.equal(twice.status, 'attempted', 'two of three attempts: still open to the student');

  // Reopen #2; reload: two attempts, open, the newest sort on the board.
  setTime(at(NEXT_DAY, '08:25'));
  assignment = teacherWarmup(assignment, 'reopen', Date.now(), NEXT_DAY);
  setTime(at(NEXT_DAY, '08:26'));
  const reloaded = await openQuestion(chromebook, { assignment, record: twice, nowMs: Date.now() });
  assert.equal(reloaded.processed.familyDelivery.fingerprint, opened.processed.familyDelivery.fingerprint);
  const screen = readRender(await renderQuestion(chromebook, reloaded, { record: twice, nowMs: Date.now() }));
  assert.equal(screen.failed, false);
  assert.equal(screen.locked, false);
  assert.equal(screen.placedInA, placedIn(secondSort, 0), 'the newest sort is on the board');
});
