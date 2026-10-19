/*
 * ONE SIMULATED GRAPH THE LINE ROUND, FOR THE LAUNCH CERTIFICATION.
 *
 * A simulated student device (liveChallengeSimStudent.mjs) plays a Graph the
 * Line round with this: what LineGraphRound.jsx does, which node cannot
 * render.
 *
 * What is REAL: every decision goes through the screen's own session
 * (src/platform/liveChallenge/lineGraphSession.js) — the verdict on each line,
 * option and typed equation (the server's own grading functions), tries,
 * pauses, flashes, what is queued and what is never sent, and the server's
 * word when the device and the server disagree. The stored queue is read with
 * the screen's own parser. Every request is the real callable, under the
 * student's identity, through the device's transport (its latency, its
 * outages).
 *
 * What is MIRRORED from LineGraphRound.jsx — and held to it by
 * tests/platform/liveChallengeLaunchCertificationMirror.test.mjs, so the two
 * cannot drift apart:
 *   time      the round's start and deadline anchored once, when the round
 *             mounts, to this device's monotonic clock (monotonicRoundOrigin):
 *             a calibration that moves later moves nothing
 *   start     first whatever this student's storage holds for the round, sent
 *             until the server has it; then where the server says the student
 *             is, with their next items (a student whose join is still on its
 *             way asks again a second later)
 *   sending   gathered for COALESCE_MS, one request at a time, oldest first; a
 *             final refusal — or "time is up" while this device's clock
 *             agrees — drops the queue and stops; anything else is sent again
 *             after a growing pause
 *   storage   the queue, under the screen's key, written whenever it changes
 *   items     fetched ahead whenever fewer than the session's minimum are left
 *   the end   a finished set is sent at once; at the buzzer, and when the
 *             round closes, whatever is still queued goes
 *
 * What a student DOES is a plan (LINE_PLAN): right first time; a wrong answer
 * fixed; the class's common mistake, then fixed; wrong until out of tries; or
 * skipping every other item where the format has Skip. A plan draws lines the
 * way a student does — through two grid points of the right line, or of a
 * deliberately wrong one — from the item the device was sent, which carries
 * its line (the drawn graph shows it anyway). Every wrong answer is
 * deterministic for an item, so in a Classic round, where everyone has the
 * same line, every student on the `common` plan draws the same wrong line.
 */
import { performance } from 'node:perf_hooks';
import * as Q from '../../../functions/shared/graphFeatureRational.mjs';
import { isVertical, latticePointsInView, lineKey, lineThroughPoints, slopeOf, yInterceptOf } from '../../../functions/shared/lineGraphMath.mjs';
import { LINE_ANSWER_STYLE, LINE_GRAPH_FORMAT, LINE_LIMITS, LINE_VERDICT, lineGraphFormatOfMode } from '../../../functions/shared/lineGraphRules.mjs';
import { timestampToMillis } from '../../../functions/shared/liveChallengeTimer.mjs';
import { monotonicRoundOrigin } from '../../../functions/shared/liveChallengeParity.mjs';
import { rushRefusalIsTimeUp } from '../../../src/platform/liveChallenge/challengeAnswerRefusal.js';
import {
  LINE_FEEDBACK,
  LINE_INPUT,
  LINE_PREFETCH,
  LINE_QUEUE_KEY_PREFIX,
  acknowledge,
  createLineSession,
  currentQuestion,
  dropQueue,
  inputState,
  lineQueueKey,
  lockRemainingMs,
  newLineAttemptId,
  nextBatch,
  parseStoredLineQueue,
  prefetchRequest,
  recordChoice,
  recordEquation,
  recordLine,
  recordSkip,
  settle,
  withQuestions,
} from '../../../src/platform/liveChallenge/lineGraphSession.js';

// LineGraphRound.jsx's own values (the mirror test reads both files).
const COALESCE_MS = 500;
const RETRY_MIN_MS = 600;
const RETRY_MAX_MS = 5_000;
const JOIN_WAIT_MS = 1_000;

// The server will never take these: the round is over, stale, or not this student's.
const isFinalRefusal = (error) => /failed-precondition|not-found|permission-denied|invalid-argument/.test(String(error?.code || ''));

export const LINE_PLAN = Object.freeze({
  RIGHT: 'right', // every item right, first time
  FIX: 'fix', // a wrong answer first, then the right one
  COMMON: 'common', // the class's common mistake first, then the right one
  STUCK: 'stuck', // wrong until out of tries: the answer is shown, the item ends
  SKIP: 'skip', // every other item skipped where the format has Skip; right otherwise
});

/* ------------------------- answers a student gives ------------------------ */

const plainPoint = (point) => ({ x: Number(point.x), y: Number(point.y) });
const inView = (view, point) => point.x >= view.xMin && point.x <= view.xMax && point.y >= view.yMin && point.y <= view.yMax;

// Two grid points of the right line: the key points the answer is shown
// through (a game that wants the method wants exactly these), or any two.
const rightPoints = (question) => {
  const shown = (question.reveal?.points || []).map(plainPoint);
  if (shown.length === 2) return shown;
  return latticePointsInView(question.line, question.view, { inset: 1 }).slice(0, 2).map(plainPoint);
};

// Wrong lines a student might draw: through the right line's first point and
// a point some grid lines off its second — up or down (sideways when the line
// is vertical) — one per offset that stays on the grid. All different lines,
// in the same order for everyone given the same item. A key point can sit on
// the grid's edge, where every offset one way leaves it: the offsets reach
// far enough that at least six stay on any grid the generator draws (±6 or
// more), so a stuck student always has three wrong lines after the class's
// common mistake and a slip.
const WRONG_OFFSETS = Object.freeze([1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]);
const wrongLines = (question) => {
  const [p, q] = rightPoints(question);
  const sideways = isVertical(question.line);
  return WRONG_OFFSETS
    .map((offset) => (sideways ? { x: q.x + offset, y: q.y } : { x: q.x, y: q.y + offset }))
    .filter((point) => inView(question.view, point))
    .map((point) => [p, point]);
};

const numberText = (value) => {
  const r = Q.toRational(value);
  return r.d === 1 ? String(r.n) : `${r.n}/${r.d}`;
};
// The exact values of a "build it" item's boxes.
const rightValues = (question) => {
  const { line } = question;
  if (question.build?.form === 'standard') return { A: line.a, B: line.b, C: line.c };
  if (question.build?.form === 'pointSlope') return { x1: question.marked.x, y1: question.marked.y, m: slopeOf(line) };
  return { m: slopeOf(line), b: yInterceptOf(line) };
};
const typed = (values) => Object.fromEntries(Object.entries(values).map(([box, value]) => [box, numberText(value)]));
// The boxes filled in right, as a student types them.
const rightFields = (question) => typed(rightValues(question));
// Wrong by `k` in one box: the constant, the slope or the y-intercept.
const wrongFields = (question, k) => {
  const values = rightValues(question);
  const box = question.build?.form === 'standard' ? 'C' : question.build?.form === 'pointSlope' ? 'm' : 'b';
  return typed({ ...values, [box]: Q.add(Q.toRational(values[box]), k) });
};

const rightAction = (question) => {
  if (question.answerStyle === LINE_ANSWER_STYLE.CHOICE) return { kind: 'choice', choiceId: question.answerChoice };
  if (question.answerStyle === LINE_ANSWER_STYLE.BUILD) return { kind: 'equation', fields: rightFields(question) };
  return { kind: 'line', points: rightPoints(question) };
};
// The wrong answers of an item, in a fixed order: the first is the class's
// common mistake, the second a student's own slip, the rest a stuck student's.
const wrongActions = (question) => {
  if (question.answerStyle === LINE_ANSWER_STYLE.CHOICE) {
    return (question.choices || []).filter((choice) => choice.id !== question.answerChoice).map((choice) => ({ kind: 'choice', choiceId: choice.id }));
  }
  if (question.answerStyle === LINE_ANSWER_STYLE.BUILD) return [1, -1, 2, -2, 3].map((k) => ({ kind: 'equation', fields: wrongFields(question, k) }));
  return wrongLines(question).map((points) => ({ kind: 'line', points }));
};

/** What a student on `plan` does with an item, in order. */
export const lineActionsFor = (question, plan, { itemNumber = 0, canSkip = true } = {}) => {
  const right = rightAction(question);
  if (plan === LINE_PLAN.SKIP) return canSkip && itemNumber % 2 === 1 ? [{ kind: 'skip' }] : [right];
  if (plan === LINE_PLAN.RIGHT) return [right];
  const wrongs = wrongActions(question);
  const choose = question.answerStyle === LINE_ANSWER_STYLE.CHOICE;
  if (plan === LINE_PLAN.COMMON) return choose ? wrongs.slice(0, 1) : [wrongs[0], right];
  // One try for a chosen equation: a student who would slip there just answers.
  if (plan === LINE_PLAN.FIX) return choose ? [right] : [wrongs[1], right];
  // Stuck: wrong until out of tries (the item ends; what is left is never
  // used). With "until right" the right answer follows the third miss.
  return choose ? wrongs.slice(2, 3) : [...wrongs.slice(2, 5), right];
};

/** The line a set of points draws, as one key (what the class's mistake counts). */
export const drawnLineKey = (points) => lineKey(lineThroughPoints(points[0], points[1]));

/* ------------------------------- the round -------------------------------- */

/**
 * @param {object}   options.room       the room as the device holds it when the round mounts
 * @param {Function} options.request    (name, data) => the device's callable (latency, outages)
 * @param {Map}      options.storage    this student's localStorage
 * @param {Function} options.wait       (ms) => Promise<boolean>: the page's timer (false once the page is gone)
 * @param {Function} options.alive      () => whether this page still shows this round
 * @param {Function} options.roomNow    () => the room the device holds now
 * @param {Function} options.serverNow  () => this device's calibrated server time (read once, at mount)
 * @param {Function} options.random     the device's seeded random source
 * @param {object}   options.profile    { linePlan, lineThinkMs }
 * @param {object}   options.record     plain data the device reports (filled in here)
 */
export function createSimLineRound({ room, request, storage, wait, alive, roomNow, serverNow, random, profile, record }) {
  const roomId = room.roomId;
  const roundIndex = Number(room.currentRound) || 0;
  const roundVersion = Number(room.roundVersion) || 0;
  const roundToken = room.roundToken || '';
  const identity = { roomId, roundIndex, roundVersion, roundToken };
  const config = room.lineGraph?.config || {};
  const rules = { triesPerItem: config.triesPerItem, showMethod: config.showMethod === true };
  const canSkip = lineGraphFormatOfMode(room.challengeMode) !== LINE_GRAPH_FORMAT.CLASSIC;
  const queueKey = lineQueueKey(roomId, roundIndex, roundVersion);
  const startsAtMs = timestampToMillis(room.startsAt || room.roundStartedAt);
  const endsAtMs = timestampToMillis(room.roundEndsAt || room.endsAt);
  // Anchored once, as the screen anchors it when the round mounts.
  const startMono = monotonicRoundOrigin({
    monotonicNow: performance.now(),
    serverNowMs: serverNow(),
    startsAtMs,
  });
  const endMono = startMono + Math.max(0, endsAtMs - startsAtMs);

  Object.assign(record, {
    fetches: 0,
    items: 0,
    firstBatchBytes: 0,
    poolSize: null,
    submits: 0,
    sent: 0,
    retries: 0,
    resentFromStorage: 0,
    resyncs: 0,
    finalRefusal: null,
    finished: false,
    finishedAt: null,
    // The line of the first item this page was given (in a Classic round, everyone's).
    firstLine: null,
    verdicts: {},
    counts: null,
    // The round as the server last said it stood: where it put the student
    // when the page opened, then its reply to each batch.
    serverState: null,
    // Per item: the wrong lines (keys) and options this student recorded, how
    // it ended, and each attempt's verdict on the device and then the server's.
    byItem: {},
    // Each time the device took the server's word over its own.
    resyncLog: [],
    errors: [],
  });

  let session = null;
  let phase = 'loading';
  const attemptLog = new Map(); // attempt id -> its entry in byItem[...].log
  let inFlight = false;
  let flushTimer = false;
  let retryDelay = 0;
  let stopped = false;
  let fetching = false;

  const readQueue = () => parseStoredLineQueue(storage.get(queueKey) ?? null);
  const writeQueue = (queue) => {
    if (queue.length) storage.set(queueKey, JSON.stringify(queue));
    else storage.delete(queueKey);
  };
  // Forget every other round's queue: the server would refuse it anyway.
  const clearStaleLineQueues = () => {
    for (const key of storage.keys()) {
      if (typeof key === 'string' && key.startsWith(LINE_QUEUE_KEY_PREFIX) && key !== queueKey) storage.delete(key);
    }
  };
  const commit = (next) => {
    const previous = session;
    session = next;
    if (previous?.queue !== next.queue) writeQueue(next.queue);
    record.counts = { ...next.counts };
  };

  // The round is over for this screen: time is up on its clock, or the room closed it.
  const roundClosed = () => {
    const now = roomNow();
    return !now || now.roomId !== roomId || Number(now.currentRound) !== roundIndex
      || (Number(now.roundVersion) || 0) !== roundVersion || now.roundState === 'closed' || now.status !== 'running';
  };
  const over = () => performance.now() >= endMono || roundClosed();
  const accepting = () => phase === 'ready' && !over() && performance.now() >= startMono;

  const scheduleFlush = (delay = COALESCE_MS) => {
    if (stopped || inFlight || flushTimer) return;
    flushTimer = true;
    wait(delay).then((fired) => { flushTimer = false; if (fired) flush(); });
  };

  const flush = async () => {
    if (!session || inFlight || stopped || !alive()) return;
    const batch = nextBatch(session);
    if (!batch.length) return;
    inFlight = true;
    let retry = false;
    try {
      record.submits += 1;
      record.sent += batch.length;
      const reply = await request('submitLineGraphAttempts', { ...identity, attempts: batch });
      if (!alive()) return;
      retryDelay = 0;
      (reply?.verdicts || []).forEach((row) => {
        const entry = attemptLog.get(String(row?.attemptId));
        if (entry) entry[1] = `${row.verdict}${row.replay ? ' (replay)' : ''}`;
      });
      const before = { cursor: session.cursor, misses: session.missesOnItem, transition: session.transition?.kind || null };
      const { session: next, resynced } = acknowledge(session, { sent: batch, reply });
      if (resynced) {
        record.resyncs += 1;
        record.resyncLog.push({ device: before, server: { cursor: reply.state?.cursor, misses: reply.state?.cursorMisses } });
      }
      if (reply?.state) record.serverState = { ...reply.state };
      commit(next);
    } catch (error) {
      if (!alive()) return;
      const code = String(error?.code || '');
      // "Time is up" from the server, when this device's clock agrees; a
      // client-side timeout with the same code mid-round is retried.
      const timeIsUp = rushRefusalIsTimeUp(code, endMono - performance.now());
      if (isFinalRefusal(error) || timeIsUp) {
        stopped = true;
        record.finalRefusal = code;
        commit(dropQueue(session));
      } else {
        retryDelay = Math.min(RETRY_MAX_MS, Math.max(RETRY_MIN_MS, retryDelay * 2));
        record.retries += 1;
        retry = true;
      }
    } finally {
      inFlight = false;
    }
    if (!alive() || stopped) return;
    if (retry) {
      flushTimer = true;
      wait(retryDelay).then((fired) => { flushTimer = false; if (fired) flush(); });
    } else if (session.queue.length) {
      scheduleFlush(over() ? 0 : COALESCE_MS);
    }
  };

  const prefetch = async () => {
    if (!session || fetching || stopped || over()) return;
    const ask = prefetchRequest(session);
    if (!ask) return;
    fetching = true;
    try {
      record.fetches += 1;
      const reply = await request('getLineGraphRound', { ...identity, ...ask });
      if (!alive()) return;
      if (reply?.roundOpen !== false) {
        record.items += (reply?.questions || []).length;
        commit(withQuestions(session, reply?.questions || []));
      }
    } catch {
      if (alive()) await wait(1_500);
    } finally {
      fetching = false;
    }
  };

  // Records an answer on this screen, as the canvas, the options and the boxes do.
  const act = (action) => {
    const current = session;
    if (!current || !accepting()) return null;
    const at = performance.now();
    const context = { nowMs: at, elapsedMs: at - startMono, attemptId: newLineAttemptId() };
    let outcome;
    if (action.kind === 'line') outcome = recordLine(current, { ...context, points: action.points });
    else if (action.kind === 'choice') outcome = recordChoice(current, { ...context, choiceId: action.choiceId });
    else if (action.kind === 'equation') outcome = recordEquation(current, { ...context, fields: action.fields });
    else outcome = recordSkip(current, context);
    if (outcome.session !== current) commit(outcome.session);
    if (outcome.verdict) record.verdicts[outcome.verdict] = (record.verdicts[outcome.verdict] || 0) + 1;
    if (outcome.attempt) {
      const item = (record.byItem[outcome.attempt.questionIndex] ||= { wrongLines: [], wrongChoices: [], ended: null, log: [] });
      const entry = [outcome.verdict, null];
      item.log.push(entry);
      attemptLog.set(String(outcome.attempt.attemptId), entry);
      if (outcome.verdict === LINE_VERDICT.INCORRECT) {
        if (action.kind === 'line') item.wrongLines.push(drawnLineKey(action.points));
        if (action.kind === 'choice') item.wrongChoices.push(action.choiceId);
      }
      const kind = outcome.session.feedback?.kind;
      if (outcome.verdict === LINE_VERDICT.CORRECT) item.ended = 'right';
      else if (kind === LINE_FEEDBACK.REVEALED) item.ended = 'revealed';
      else if (outcome.verdict === LINE_VERDICT.SKIPPED) item.ended = 'skipped';
      scheduleFlush();
    }
    return outcome;
  };

  // The student: looks at each item, then answers it as the plan says.
  let plan = { questionIndex: null, actions: [] };
  let itemsSeen = 0;
  const play = async () => {
    while (alive()) {
      const nowMs = performance.now();
      if (session.transition && nowMs >= session.transition.until) { commit(settle(session, nowMs)); continue; }
      const input = inputState(session, nowMs);
      if (input === LINE_INPUT.FINISHED) {
        // A finished set goes to the server at once: the round may close early.
        if (!record.finished) Object.assign(record, { finished: true, finishedAt: Date.now() });
        flush();
        return;
      }
      if (over()) { flush(); return; } // at the buzzer, whatever is queued goes
      if (prefetchRequest(session)) prefetch();
      if (input === LINE_INPUT.TRANSITION) { await wait(session.transition.until - nowMs + 5); continue; } // eslint-disable-line no-await-in-loop
      if (input === LINE_INPUT.LOCKED) { await wait(lockRemainingMs(session, nowMs) + 5); continue; } // eslint-disable-line no-await-in-loop
      if (input === LINE_INPUT.WAITING) { await wait(150); continue; } // eslint-disable-line no-await-in-loop
      if (performance.now() < startMono) { await wait(startMono - performance.now() + 5); continue; } // eslint-disable-line no-await-in-loop
      const question = currentQuestion(session);
      if (plan.questionIndex !== question.questionIndex) {
        plan = { questionIndex: question.questionIndex, actions: lineActionsFor(question, profile.linePlan, { itemNumber: itemsSeen, canSkip }) };
        itemsSeen += 1;
      }
      // The student looks before they draw.
      // eslint-disable-next-line no-await-in-loop
      if (!(await wait(150 + Math.round(random() * profile.lineThinkMs)))) return;
      // A reply may have moved the student on while they looked.
      if (currentQuestion(session)?.questionIndex !== question.questionIndex || inputState(session, performance.now()) !== LINE_INPUT.READY) continue;
      // A line the screen did not take is drawn again; one it took is done.
      if (act(plan.actions[0] || rightAction(question))) plan.actions.shift();
    }
  };

  // START OR RESUME: first anything this device sent and never heard back
  // about, then where the server says the student is, with their next items.
  const start = async () => {
    clearStaleLineQueues();
    let pending = readQueue();
    let delay = RETRY_MIN_MS;
    while (pending.length && alive()) {
      const batch = pending.slice(0, LINE_LIMITS.batch);
      try {
        // eslint-disable-next-line no-await-in-loop
        await request('submitLineGraphAttempts', { ...identity, attempts: batch });
        record.resentFromStorage += batch.length;
        pending = pending.slice(batch.length);
        writeQueue(pending);
      } catch (error) {
        if (isFinalRefusal(error) || rushRefusalIsTimeUp(error?.code, endMono - performance.now())) {
          pending = [];
          writeQueue(pending);
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        if (!(await wait(delay))) return;
        delay = Math.min(RETRY_MAX_MS, delay * 2);
      }
    }
    delay = RETRY_MIN_MS;
    while (alive()) {
      try {
        record.fetches += 1;
        // eslint-disable-next-line no-await-in-loop
        const reply = await request('getLineGraphRound', { ...identity, count: LINE_PREFETCH.batch });
        if (!alive()) return;
        if (reply?.roundOpen === false) { phase = 'closed'; return; }
        if (reply?.joined === false) {
          // The device's join is on its way.
          // eslint-disable-next-line no-await-in-loop
          if (!(await wait(JOIN_WAIT_MS))) return;
          continue;
        }
        const questions = reply?.questions || [];
        record.items += questions.length;
        record.firstBatchBytes = JSON.stringify(questions).length;
        if (questions[0]?.line && record.firstLine === null) record.firstLine = lineKey(questions[0].line);
        record.poolSize = reply?.poolSize ?? null;
        commit(createLineSession({ roundIndex, serverState: reply?.state || {}, questions, poolSize: reply?.poolSize ?? null, rules }));
        if (reply?.state) record.serverState = { ...reply.state };
        phase = 'ready';
        break;
      } catch (error) {
        if (!alive()) return;
        if (isFinalRefusal(error)) {
          record.errors.push(`${error?.code}: ${error?.message}`);
          phase = 'closed';
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        if (!(await wait(delay))) return;
        delay = Math.min(RETRY_MAX_MS, delay * 2);
      }
    }
    if (phase === 'ready') await play();
  };

  start().catch((error) => record.errors.push(`round: ${error?.stack || error}`));

  return {
    /** The connection is back: send what is waiting now (the screen's 'online' handler). */
    flushNow: () => { if (!inFlight) flush(); },
  };
}
