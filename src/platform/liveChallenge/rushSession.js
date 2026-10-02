/*
 * GRAPH FEATURE RUSH: ONE STUDENT'S ROUND, ON THEIR DEVICE.
 *
 * The device grades every tap the instant it lands, with the same hit test
 * and the same rules the server uses, so feedback never waits on the network.
 * Every attempt also joins a queue for the server, which grades it again from
 * its own copy of the question and alone decides what counts. When the queue
 * drains, the device compares where it thinks the student is with where the
 * server says they are, and if the two differ it takes the server's word.
 *
 * Pure and immutable: each function takes a session and returns the next one
 * (plus, for an input, the attempt to send). Timing comes in as `nowMs`, a
 * monotonic clock reading, so the rules are tested without timers.
 *
 *   recordTap / recordDoesNotExist / recordSkip   a student's input
 *   settle                                        a completion flash or skip
 *                                                 pause ending: next graph
 *   acknowledge                                   the server's reply to a batch
 *   withQuestions / prefetchRequest               the graphs on hand
 */

import { clampTolerance, resolveTap, TAP_RESULT } from '../../../functions/shared/graphFeatureHitTest.mjs';
import { getGraphFeature } from '../../../functions/shared/graphFeatureRegistry.mjs';
import {
  RUSH_ATTEMPT_KIND,
  RUSH_AUTO_SKIP_MISSES,
  RUSH_COMPLETE_FLASH_MS,
  RUSH_LIMITS,
  RUSH_SKIP_PAUSE_MS,
  rushLockoutMs,
} from '../../../functions/shared/graphFeatureRushRules.mjs';
import { formatPoint } from './rushGraphModel.js';

export const RUSH_FEEDBACK = Object.freeze({
  HIT: 'hit',
  COMPLETE: 'complete',
  MISS: 'miss',
  ALREADY_FOUND: 'alreadyFound',
  SKIPPED: 'skipped',
  AUTO_SKIPPED: 'autoSkipped',
  RESYNCED: 'resynced',
});

export const RUSH_INPUT = Object.freeze({
  READY: 'ready',
  LOCKED: 'locked',
  TRANSITION: 'transition',
  WAITING: 'waiting',
  EXHAUSTED: 'exhausted',
});

// Graphs kept ready ahead of the one on screen, and when to ask for more.
export const RUSH_PREFETCH = Object.freeze({ batch: 6, refillBelow: 3 });

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};

const countsFromServer = (state = {}) => Object.freeze({
  completed: Math.max(0, integerOr(state.questionsCorrect, 0)),
  skipped: Math.max(0, integerOr(state.skipped, 0)),
  attempts: Math.max(0, integerOr(state.attempts, 0)),
  hits: Math.max(0, integerOr(state.hits, 0)),
});

const missesFromServer = (state = {}) => Math.max(
  0,
  integerOr(state.cursorAttempts, 0) - (Array.isArray(state.cursorTargetsFound) ? state.cursorTargetsFound.length : 0),
);

const indexQuestions = (existing = {}, questions = []) => {
  const next = { ...existing };
  (Array.isArray(questions) ? questions : []).forEach((question) => {
    const index = integerOr(question?.questionIndex, null);
    if (index !== null && index >= 0 && !next[index]) next[index] = question;
  });
  return next;
};

/**
 * A session for a round, starting where the server says the student is.
 * `poolSize` is where the round's graphs end. `queue` is any attempt the
 * device made and has not yet heard back about (restored after a refresh);
 * the server answers a resent one as a replay.
 */
export const createRushSession = ({ roundIndex = 0, serverState = {}, questions = [], queue = [], poolSize = null } = {}) => Object.freeze({
  roundIndex: integerOr(roundIndex, 0),
  questions: Object.freeze(indexQuestions({}, questions)),
  poolEnd: Number.isInteger(poolSize) && poolSize > 0 ? poolSize : null,
  cursor: Math.max(0, integerOr(serverState.cursor, 0)),
  found: Object.freeze(Array.isArray(serverState.cursorTargetsFound) ? serverState.cursorTargetsFound.map(String) : []),
  missesOnGraph: missesFromServer(serverState),
  missesInARow: 0,
  lockedUntil: 0,
  transition: null,
  counts: countsFromServer(serverState),
  queue: Object.freeze([...(Array.isArray(queue) ? queue : [])]),
  feedback: null,
  seq: 0,
});

/** The question index the student is on once any flash or pause has ended. */
export const effectiveCursor = (session) => (session.transition ? session.transition.questionIndex + 1 : session.cursor);

export const currentQuestion = (session) => session.questions[session.cursor] || null;

/** Whether input is taken right now, and if not, why. */
export const inputState = (session, nowMs) => {
  if (session.transition) return RUSH_INPUT.TRANSITION;
  if (session.poolEnd !== null && session.cursor >= session.poolEnd) return RUSH_INPUT.EXHAUSTED;
  if (!currentQuestion(session)) return RUSH_INPUT.WAITING;
  if (Number(nowMs) < session.lockedUntil) return RUSH_INPUT.LOCKED;
  return RUSH_INPUT.READY;
};

export const lockRemainingMs = (session, nowMs) => Math.max(0, session.lockedUntil - Number(nowMs));

/** The questions the server sent, added to those on hand (never replacing one). */
export const withQuestions = (session, questions = []) => Object.freeze({
  ...session,
  questions: Object.freeze(indexQuestions(session.questions, questions)),
});

/**
 * The next graphs to ask for, or null when enough are on hand: at least
 * `refillBelow` from the one the student is on (counting it).
 */
export const prefetchRequest = (session) => {
  const from = effectiveCursor(session);
  if (session.poolEnd !== null && from >= session.poolEnd) return null;
  let ready = 0;
  while (session.questions[from + ready]) ready += 1;
  if (ready >= RUSH_PREFETCH.refillBelow) return null;
  const fromIndex = from + ready;
  if (session.poolEnd !== null && fromIndex >= session.poolEnd) return null;
  return { fromIndex, count: RUSH_PREFETCH.batch };
};

const featureOf = (question) => getGraphFeature(question?.feature);

const withFeedback = (session, feedback) => Object.freeze({
  ...session,
  seq: session.seq + 1,
  feedback: Object.freeze({ ...feedback, seq: session.seq + 1 }),
});

const queued = (session, attempt) => Object.freeze({ ...session, queue: Object.freeze([...session.queue, Object.freeze(attempt)]) });

const elapsedOf = (elapsedMs) => Math.max(0, Math.round(Number(elapsedMs) || 0));

// A hit: the target is found; finding the last one completes the graph.
const applyHit = (session, question, targetId, nowMs, extra = {}) => {
  const found = Object.freeze([...session.found, String(targetId)]);
  const completes = found.length >= Math.max(1, integerOr(question.targetCount, 1));
  const counts = Object.freeze({
    ...session.counts,
    attempts: session.counts.attempts + 1,
    hits: session.counts.hits + 1,
    completed: session.counts.completed + (completes ? 1 : 0),
  });
  const next = Object.freeze({
    ...session,
    found,
    counts,
    missesInARow: 0,
    lockedUntil: 0,
    transition: completes ? Object.freeze({ kind: RUSH_FEEDBACK.COMPLETE, questionIndex: session.cursor, until: Number(nowMs) + RUSH_COMPLETE_FLASH_MS }) : null,
  });
  return withFeedback(next, {
    kind: completes ? RUSH_FEEDBACK.COMPLETE : RUSH_FEEDBACK.HIT,
    questionIndex: session.cursor,
    targetId: String(targetId),
    ...extra,
  });
};

// A miss: a cooldown from the second in a row, and the graph is skipped on
// the last allowed miss — as the server records it in the same transaction.
const applyMiss = (session, nowMs, extra = {}) => {
  const missesInARow = session.missesInARow + 1;
  const missesOnGraph = session.missesOnGraph + 1;
  const autoSkip = missesOnGraph >= RUSH_AUTO_SKIP_MISSES;
  const counts = Object.freeze({
    ...session.counts,
    // The server's skip is a record of its own.
    attempts: session.counts.attempts + (autoSkip ? 2 : 1),
    skipped: session.counts.skipped + (autoSkip ? 1 : 0),
  });
  const next = Object.freeze({
    ...session,
    counts,
    missesInARow,
    missesOnGraph,
    lockedUntil: autoSkip ? 0 : Number(nowMs) + rushLockoutMs(missesInARow),
    transition: autoSkip ? Object.freeze({ kind: RUSH_FEEDBACK.AUTO_SKIPPED, questionIndex: session.cursor, until: Number(nowMs) + RUSH_SKIP_PAUSE_MS }) : null,
  });
  return withFeedback(next, {
    kind: autoSkip ? RUSH_FEEDBACK.AUTO_SKIPPED : RUSH_FEEDBACK.MISS,
    questionIndex: session.cursor,
    lockMs: autoSkip ? 0 : rushLockoutMs(missesInARow),
    ...extra,
  });
};

const refused = (session, nowMs) => ({ session, attempt: null, refused: inputState(session, nowMs) });

/**
 * A tap on the graph at (x, y) in graph units. `tolerance` is the pointer's
 * reach on this screen (rushGraphModel.tapTolerance); it is clamped before it
 * is sent, exactly as the server clamps it on receipt.
 */
export const recordTap = (session, { x, y, tolerance, pointer, nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== RUSH_INPUT.READY) return refused(session, nowMs);
  const question = currentQuestion(session);
  const limits = clampTolerance(tolerance, question.view);
  const tap = resolveTap({ targets: question.targets, found: session.found, tap: { x, y }, tolerance: limits, view: question.view });
  if (tap.result === TAP_RESULT.ALREADY_FOUND) {
    // Neither credit nor a penalty, and nothing for the server to record.
    return { session: withFeedback(session, { kind: RUSH_FEEDBACK.ALREADY_FOUND, questionIndex: session.cursor, targetId: tap.targetId }), attempt: null };
  }
  const attempt = Object.freeze({
    attemptId: String(attemptId),
    questionIndex: session.cursor,
    kind: RUSH_ATTEMPT_KIND.TAP,
    x: Number(x),
    y: Number(y),
    tolerance: Object.freeze({ x: limits.x, y: limits.y }),
    pointer,
    clientElapsedMs: elapsedOf(elapsedMs),
  });
  const next = tap.result === TAP_RESULT.HIT
    ? applyHit(session, question, tap.targetId, nowMs)
    : applyMiss(session, nowMs, { x: Number(x), y: Number(y) });
  return { session: queued(next, attempt), attempt };
};

/** "Does Not Exist": right on a graph without the feature, a miss on one with it. */
export const recordDoesNotExist = (session, { nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== RUSH_INPUT.READY) return refused(session, nowMs);
  const question = currentQuestion(session);
  const attempt = Object.freeze({
    attemptId: String(attemptId),
    questionIndex: session.cursor,
    kind: RUSH_ATTEMPT_KIND.DOES_NOT_EXIST,
    clientElapsedMs: elapsedOf(elapsedMs),
  });
  const absent = !Array.isArray(question.targets) || question.targets.length === 0;
  const next = absent
    ? applyHit(session, question, 'dne', nowMs, { doesNotExist: true })
    : applyMiss(session, nowMs, { doesNotExist: true });
  return { session: queued(next, attempt), attempt };
};

/** Give up on this graph: done, not correct, and on to the next. */
export const recordSkip = (session, { nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== RUSH_INPUT.READY) return refused(session, nowMs);
  const attempt = Object.freeze({
    attemptId: String(attemptId),
    questionIndex: session.cursor,
    kind: RUSH_ATTEMPT_KIND.SKIP,
    clientElapsedMs: elapsedOf(elapsedMs),
  });
  const next = Object.freeze({
    ...session,
    counts: Object.freeze({ ...session.counts, attempts: session.counts.attempts + 1, skipped: session.counts.skipped + 1 }),
    missesInARow: 0,
    lockedUntil: 0,
    transition: Object.freeze({ kind: RUSH_FEEDBACK.SKIPPED, questionIndex: session.cursor, until: Number(nowMs) + RUSH_SKIP_PAUSE_MS }),
  });
  return { session: queued(withFeedback(next, { kind: RUSH_FEEDBACK.SKIPPED, questionIndex: session.cursor }), attempt), attempt };
};

/** When a completion flash or skip pause is over, the next graph. */
export const settle = (session, nowMs) => {
  if (!session.transition || Number(nowMs) < session.transition.until) return session;
  return Object.freeze({
    ...session,
    cursor: session.transition.questionIndex + 1,
    found: Object.freeze([]),
    missesOnGraph: 0,
    missesInARow: 0,
    lockedUntil: 0,
    transition: null,
  });
};

/** The next batch to send: the oldest attempts first, at most a request's worth. */
export const nextBatch = (session) => session.queue.slice(0, RUSH_LIMITS.batch);

const sameSet = (left = [], right = []) => {
  const a = new Set(left.map(String));
  const b = new Set(right.map(String));
  return a.size === b.size && [...a].every((entry) => b.has(entry));
};

/** True when the device and the server disagree about where the student is. */
export const differsFromServer = (session, serverState = {}) => {
  const serverCursor = integerOr(serverState.cursor, 0);
  if (effectiveCursor(session) !== serverCursor) return true;
  if (session.transition) return false;
  return !sameSet(session.found, serverState.cursorTargetsFound || []);
};

/**
 * The server's reply to a batch. Its attempts leave the queue; once nothing
 * else is waiting to be sent, the server's state is the truth — its counts
 * always, and its position whenever the device's differs.
 */
export const acknowledge = (session, { sent = [], reply = {} } = {}) => {
  const sentIds = new Set((Array.isArray(sent) ? sent : []).map((attempt) => String(attempt?.attemptId)));
  const queue = Object.freeze(session.queue.filter((attempt) => !sentIds.has(String(attempt.attemptId))));
  let next = Object.freeze({ ...session, queue });
  const serverState = reply?.state;
  if (queue.length || !serverState) return { session: next, resynced: false };
  next = Object.freeze({ ...next, counts: countsFromServer(serverState) });
  if (!differsFromServer(next, serverState)) return { session: next, resynced: false };
  next = Object.freeze({
    ...next,
    cursor: Math.max(0, integerOr(serverState.cursor, 0)),
    found: Object.freeze((serverState.cursorTargetsFound || []).map(String)),
    missesOnGraph: missesFromServer(serverState),
    missesInARow: 0,
    lockedUntil: 0,
    transition: null,
  });
  return { session: withFeedback(next, { kind: RUSH_FEEDBACK.RESYNCED, questionIndex: next.cursor }), resynced: true };
};

/** Attempts the server will never take (the round is over): dropped, not retried. */
export const dropQueue = (session) => Object.freeze({ ...session, queue: Object.freeze([]) });

/* ------------------------------- feedback -------------------------------- */

/**
 * What a student is told, in words, for a feedback event. Never a hint about
 * where to look, and never how many targets remain.
 */
export const feedbackMessage = (feedback, question) => {
  if (!feedback) return '';
  const feature = featureOf(question);
  const target = (question?.targets || []).find((entry) => entry.id === feedback.targetId);
  switch (feedback.kind) {
    case RUSH_FEEDBACK.HIT:
      return target ? `Found ${formatPoint(target)}.` : 'Found one.';
    case RUSH_FEEDBACK.COMPLETE:
      if (feedback.doesNotExist) return 'Correct — it does not exist on this graph.';
      return target ? `Found ${formatPoint(target)}. Graph complete!` : 'Graph complete!';
    case RUSH_FEEDBACK.MISS:
      if (feedback.doesNotExist) return 'It is on this graph — look again.';
      return feature?.missMessage || 'Not there — try again.';
    case RUSH_FEEDBACK.ALREADY_FOUND:
      return 'Already found.';
    case RUSH_FEEDBACK.SKIPPED:
      return 'Skipped. Next graph.';
    case RUSH_FEEDBACK.AUTO_SKIPPED:
      return 'Too many misses on this one — moving on.';
    case RUSH_FEEDBACK.RESYNCED:
      return 'Synced with your saved progress.';
    default:
      return '';
  }
};

/* ------------------------------ persistence ------------------------------ */

/** Where a round's unsent attempts are kept, so a refresh resends rather than loses them. */
export const rushQueueKey = (roomId, roundIndex, roundVersion) => `graph-feature-rush-queue-${roomId}-${roundIndex}-${Number(roundVersion) || 0}`;
export const RUSH_QUEUE_KEY_PREFIX = 'graph-feature-rush-queue-';

/** A stored queue, shape-checked: anything malformed is dropped, not sent. */
export const parseStoredQueue = (raw) => {
  let parsed;
  try { parsed = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((attempt) => attempt
    && typeof attempt.attemptId === 'string'
    && Number.isInteger(attempt.questionIndex)
    && Object.values(RUSH_ATTEMPT_KIND).includes(attempt.kind))
    .slice(0, RUSH_LIMITS.perRound);
};

/** A device's attempt id: a UUID where the browser has one, else the same alphabet. */
export const newAttemptId = (crypto = globalThis.crypto) => {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const random = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random()}-${random()}`;
};
