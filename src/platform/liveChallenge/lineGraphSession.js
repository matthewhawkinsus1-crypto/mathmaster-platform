/*
 * GRAPH THE LINE: ONE STUDENT'S ROUND, ON THEIR DEVICE.
 *
 * The device checks every answer the instant it is complete — a line when
 * its second point is let go, a chosen equation when it is tapped, a typed
 * one on Enter — with the server's own grading functions
 * (lineGraphGrading.mjs), so the verdict never waits on the network. Every
 * recorded attempt also joins a queue for the server, which grades it again
 * from its own copy of the item and alone decides what counts. When the
 * queue drains, the device compares where it thinks the student is with
 * where the server says they are, and takes the server's word if they differ.
 * (Graph Feature Rush keeps the same shape: rushSession.js.)
 *
 * WHAT IS SENT. Only what the server records: a right answer, a wrong one,
 * and a skip. A right line drawn past the key points in a game that requires
 * the method (`method`), boxes that do not yet spell an equation (`form`) and
 * the same wrong answer again (`repeated`) are answered here and never sent —
 * the server would record none of them (lineGraphAttempts.mjs).
 *
 * TRIES. The miss that uses the last try ends the item: the answer is shown
 * for LINE_REVEAL_MS and the next item follows — as the server records it, in
 * one receipt. A pause grows with misses in a row (lineLockoutMs).
 *
 * Pure and immutable: each function takes a session and returns the next one
 * (and, for an answer, the attempt to send). Time comes in as `nowMs`, a
 * monotonic clock reading, so the rules are tested without timers.
 */

import { checkChoiceAnswer, checkEquationAnswer, checkLineAnswer } from '../../../functions/shared/lineGraphGrading.mjs';
import {
  LINE_FORM,
  pointSlopeTokens,
  presentEquation,
  slopeInterceptTokens,
  specialTokens,
  standardTokens,
} from '../../../functions/shared/lineGraphForms.mjs';
import { isHorizontal, slopeOf, xInterceptOf, yInterceptOf } from '../../../functions/shared/lineGraphMath.mjs';
import {
  LINE_ANSWER_STYLE,
  LINE_ATTEMPT_KIND,
  LINE_CORRECT_FLASH_MS,
  LINE_ITEM_TYPE,
  LINE_LIMITS,
  LINE_REVEAL_MS,
  LINE_SKIP_PAUSE_MS,
  LINE_VERDICT,
  lineLockoutMs,
  missesAllowed,
} from '../../../functions/shared/lineGraphRules.mjs';

export const LINE_FEEDBACK = Object.freeze({
  CORRECT: 'correct',
  MISS: 'miss',
  // Out of tries: the answer is shown, then the next item.
  REVEALED: 'revealed',
  // Not recorded: what to fix.
  REPEATED: 'repeated',
  METHOD: 'method',
  FORM: 'form',
  SKIPPED: 'skipped',
  RESYNCED: 'resynced',
});

export const LINE_INPUT = Object.freeze({
  READY: 'ready',
  LOCKED: 'locked',
  TRANSITION: 'transition',
  WAITING: 'waiting',
  // Every item of the round is done (a Classic or Sprint round).
  FINISHED: 'finished',
});

// Items kept ready ahead of the one on screen, and when to ask for more.
export const LINE_PREFETCH = Object.freeze({ batch: 6, refillBelow: 3 });

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};

const countsFromServer = (state = {}) => Object.freeze({
  completed: Math.max(0, integerOr(state.questionsCorrect, 0)),
  ended: Math.max(0, integerOr(state.ended, 0)),
  attempts: Math.max(0, integerOr(state.attempts, 0)),
  hits: Math.max(0, integerOr(state.hits, 0)),
});

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
 * `poolSize` is where the round's items end. `queue` is any attempt the
 * device made and has not yet heard back about (restored after a refresh);
 * the server answers a resent one as a replay. `rules` are the room's:
 * { triesPerItem, showMethod }.
 */
export const createLineSession = ({ roundIndex = 0, serverState = {}, questions = [], queue = [], poolSize = null, rules = {} } = {}) => Object.freeze({
  roundIndex: integerOr(roundIndex, 0),
  questions: Object.freeze(indexQuestions({}, questions)),
  poolEnd: Number.isInteger(poolSize) && poolSize > 0 ? poolSize : null,
  cursor: Math.max(0, integerOr(serverState.cursor, 0)),
  missesOnItem: Math.max(0, integerOr(serverState.cursorMisses, 0)),
  missesInARow: 0,
  // The answer of the last recorded miss on this item: the same answer again
  // is `repeated`, not a second miss.
  lastMissKey: null,
  lockedUntil: 0,
  transition: null,
  counts: countsFromServer(serverState),
  // Right answers in a row with no miss between them. Display only.
  streak: 0,
  queue: Object.freeze([...(Array.isArray(queue) ? queue : [])]),
  feedback: null,
  seq: 0,
  rules: Object.freeze({
    triesPerItem: rules.triesPerItem ?? undefined,
    showMethod: rules.showMethod === true,
  }),
});

/** The item the student is on once any flash or pause has ended. */
export const effectiveCursor = (session) => (session.transition ? session.transition.questionIndex + 1 : session.cursor);

export const currentQuestion = (session) => session.questions[session.cursor] || null;

/** Whether input is taken right now, and if not, why. */
export const inputState = (session, nowMs) => {
  if (session.transition) return LINE_INPUT.TRANSITION;
  if (session.poolEnd !== null && session.cursor >= session.poolEnd) return LINE_INPUT.FINISHED;
  if (!currentQuestion(session)) return LINE_INPUT.WAITING;
  if (Number(nowMs) < session.lockedUntil) return LINE_INPUT.LOCKED;
  return LINE_INPUT.READY;
};

export const lockRemainingMs = (session, nowMs) => Math.max(0, session.lockedUntil - Number(nowMs));

/** Wrong checks this item may still take before its answer is shown (Infinity: "until right"). */
export const triesLeft = (session) => {
  const question = currentQuestion(session);
  if (!question) return 0;
  const untilRight = Number(session.rules.triesPerItem) === 0 && question.answerStyle !== LINE_ANSWER_STYLE.CHOICE;
  if (untilRight) return Number.POSITIVE_INFINITY;
  return Math.max(0, missesAllowed({ triesPerItem: session.rules.triesPerItem, answerStyle: question.answerStyle }) - session.missesOnItem);
};

/** The items the server sent, added to those on hand (never replacing one). */
export const withQuestions = (session, questions = []) => Object.freeze({
  ...session,
  questions: Object.freeze(indexQuestions(session.questions, questions)),
});

/**
 * The next items to ask for, or null when enough are on hand: at least
 * `refillBelow` from the one the student is on (counting it).
 */
export const prefetchRequest = (session) => {
  const from = effectiveCursor(session);
  if (session.poolEnd !== null && from >= session.poolEnd) return null;
  let ready = 0;
  while (session.questions[from + ready]) ready += 1;
  if (ready >= LINE_PREFETCH.refillBelow) return null;
  const fromIndex = from + ready;
  if (session.poolEnd !== null && fromIndex >= session.poolEnd) return null;
  return { fromIndex, count: LINE_PREFETCH.batch };
};

const withFeedback = (session, feedback) => Object.freeze({
  ...session,
  seq: session.seq + 1,
  feedback: Object.freeze({ ...feedback, seq: session.seq + 1 }),
});

const queued = (session, attempt) => Object.freeze({ ...session, queue: Object.freeze([...session.queue, Object.freeze(attempt)]) });

const elapsedOf = (elapsedMs) => Math.max(0, Math.round(Number(elapsedMs) || 0));

const refused = (session, nowMs) => ({ session, attempt: null, verdict: null, refused: inputState(session, nowMs) });

// A right answer: the item is complete — a short flash, then the next one.
const applyCorrect = (session, nowMs, extra = {}) => {
  const firstTry = session.missesOnItem === 0;
  const next = Object.freeze({
    ...session,
    counts: Object.freeze({
      ...session.counts,
      attempts: session.counts.attempts + 1,
      hits: session.counts.hits + 1,
      completed: session.counts.completed + 1,
    }),
    streak: firstTry ? session.streak + 1 : 1,
    missesInARow: 0,
    lockedUntil: 0,
    transition: Object.freeze({ kind: LINE_FEEDBACK.CORRECT, questionIndex: session.cursor, until: Number(nowMs) + LINE_CORRECT_FLASH_MS }),
  });
  return withFeedback(next, { kind: LINE_FEEDBACK.CORRECT, questionIndex: session.cursor, firstTry, ...extra });
};

// A wrong answer: a miss with its hint, a pause from the second in a row,
// and on the last allowed miss the answer is shown and the item ends — as
// the server records it, in the same receipt.
const applyMiss = (session, question, check, nowMs, extra = {}) => {
  const allowed = missesAllowed({ triesPerItem: session.rules.triesPerItem, answerStyle: question.answerStyle });
  const missesOnItem = session.missesOnItem + 1;
  const missesInARow = session.missesInARow + 1;
  const revealed = missesOnItem >= allowed;
  const lockMs = revealed ? 0 : lineLockoutMs(missesInARow);
  const next = Object.freeze({
    ...session,
    counts: Object.freeze({
      ...session.counts,
      attempts: session.counts.attempts + 1,
      ended: session.counts.ended + (revealed ? 1 : 0),
    }),
    streak: 0,
    missesOnItem,
    missesInARow,
    lastMissKey: check.answerKey || null,
    lockedUntil: lockMs ? Number(nowMs) + lockMs : 0,
    transition: revealed ? Object.freeze({ kind: LINE_FEEDBACK.REVEALED, questionIndex: session.cursor, until: Number(nowMs) + LINE_REVEAL_MS }) : null,
  });
  return withFeedback(next, {
    kind: revealed ? LINE_FEEDBACK.REVEALED : LINE_FEEDBACK.MISS,
    questionIndex: session.cursor,
    message: check.message || '',
    diagnosis: check.diagnosis || null,
    lockMs,
    ...extra,
  });
};

/*
 * One complete answer, checked. `check` is the grading function's result;
 * `payload` is what the attempt carries for the server (points, a choice,
 * the boxes). Returns { session, attempt, verdict }: `attempt` is null when
 * nothing is to be recorded.
 */
const recordCheck = (session, { kind, check, payload, nowMs, elapsedMs, attemptId, extra = {} }) => {
  const question = currentQuestion(session);
  if (!check || check.verdict === LINE_VERDICT.INVALID) return { session, attempt: null, verdict: LINE_VERDICT.INVALID };
  if (check.verdict === LINE_VERDICT.METHOD || check.verdict === LINE_VERDICT.FORM) {
    const feedbackKind = check.verdict === LINE_VERDICT.METHOD ? LINE_FEEDBACK.METHOD : LINE_FEEDBACK.FORM;
    return {
      session: withFeedback(session, { kind: feedbackKind, questionIndex: session.cursor, message: check.message || '', field: check.field || null, ...extra }),
      attempt: null,
      verdict: check.verdict,
    };
  }
  if (check.verdict === LINE_VERDICT.INCORRECT && check.answerKey && check.answerKey === session.lastMissKey) {
    return {
      session: withFeedback(session, { kind: LINE_FEEDBACK.REPEATED, questionIndex: session.cursor, ...extra }),
      attempt: null,
      verdict: LINE_VERDICT.REPEATED,
    };
  }
  const attempt = Object.freeze({
    attemptId: String(attemptId),
    questionIndex: session.cursor,
    kind,
    ...payload,
    clientElapsedMs: elapsedOf(elapsedMs),
  });
  const next = check.verdict === LINE_VERDICT.CORRECT
    ? applyCorrect(session, nowMs, extra)
    : applyMiss(session, question, check, nowMs, extra);
  return { session: queued(next, attempt), attempt, verdict: check.verdict };
};

/** Graph it: the two points of a complete line, checked the moment it is let go. */
export const recordLine = (session, { points, nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== LINE_INPUT.READY) return refused(session, nowMs);
  const question = currentQuestion(session);
  const placed = (Array.isArray(points) ? points : []).map((point) => Object.freeze({ x: Number(point?.x), y: Number(point?.y) }));
  const check = checkLineAnswer({ question, points: placed, showMethod: session.rules.showMethod });
  return recordCheck(session, {
    kind: LINE_ATTEMPT_KIND.LINE,
    check,
    payload: { points: Object.freeze(placed) },
    nowMs,
    elapsedMs,
    attemptId,
  });
};

/** Name it, choose: the tapped option. One try. */
export const recordChoice = (session, { choiceId, nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== LINE_INPUT.READY) return refused(session, nowMs);
  const question = currentQuestion(session);
  const check = checkChoiceAnswer({ question, choiceId });
  return recordCheck(session, {
    kind: LINE_ATTEMPT_KIND.CHOICE,
    check,
    payload: { choice: String(choiceId ?? '') },
    nowMs,
    elapsedMs,
    attemptId,
    extra: { choiceId: String(choiceId ?? '') },
  });
};

/** Name it, build: the typed boxes, on Enter. */
export const recordEquation = (session, { fields, nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== LINE_INPUT.READY) return refused(session, nowMs);
  const question = currentQuestion(session);
  const typed = Object.fromEntries(Object.entries(fields || {}).map(([id, value]) => [id, String(value ?? '').slice(0, LINE_LIMITS.fieldLength)]));
  const check = checkEquationAnswer({ question, fields: typed });
  return recordCheck(session, {
    kind: LINE_ATTEMPT_KIND.EQUATION,
    check,
    payload: { fields: Object.freeze(typed) },
    nowMs,
    elapsedMs,
    attemptId,
  });
};

/** Give up on this item: ended, not correct, and on to the next. */
export const recordSkip = (session, { nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== LINE_INPUT.READY) return refused(session, nowMs);
  const attempt = Object.freeze({
    attemptId: String(attemptId),
    questionIndex: session.cursor,
    kind: LINE_ATTEMPT_KIND.SKIP,
    clientElapsedMs: elapsedOf(elapsedMs),
  });
  const next = Object.freeze({
    ...session,
    counts: Object.freeze({ ...session.counts, attempts: session.counts.attempts + 1, ended: session.counts.ended + 1 }),
    streak: 0,
    missesInARow: 0,
    lockedUntil: 0,
    transition: Object.freeze({ kind: LINE_FEEDBACK.SKIPPED, questionIndex: session.cursor, until: Number(nowMs) + LINE_SKIP_PAUSE_MS }),
  });
  return {
    session: queued(withFeedback(next, { kind: LINE_FEEDBACK.SKIPPED, questionIndex: session.cursor }), attempt),
    attempt,
    verdict: LINE_VERDICT.SKIPPED,
  };
};

/** When a flash, a shown answer or a skip pause is over: the next item. */
export const settle = (session, nowMs) => {
  if (!session.transition || Number(nowMs) < session.transition.until) return session;
  return Object.freeze({
    ...session,
    cursor: session.transition.questionIndex + 1,
    missesOnItem: 0,
    missesInARow: 0,
    lastMissKey: null,
    lockedUntil: 0,
    transition: null,
  });
};

/** The next batch to send: the oldest attempts first, at most a request's worth. */
export const nextBatch = (session) => session.queue.slice(0, LINE_LIMITS.batch);

/** True when the device and the server disagree about where the student is. */
export const differsFromServer = (session, serverState = {}) => {
  if (effectiveCursor(session) !== Math.max(0, integerOr(serverState.cursor, 0))) return true;
  if (session.transition) return false;
  return session.missesOnItem !== Math.max(0, integerOr(serverState.cursorMisses, 0));
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
    missesOnItem: Math.max(0, integerOr(serverState.cursorMisses, 0)),
    missesInARow: 0,
    lastMissKey: null,
    lockedUntil: 0,
    transition: null,
  });
  return { session: withFeedback(next, { kind: LINE_FEEDBACK.RESYNCED, questionIndex: next.cursor }), resynced: true };
};

/** Attempts the server will never take (the round is over): dropped, not retried. */
export const dropQueue = (session) => Object.freeze({ ...session, queue: Object.freeze([]) });

/* ------------------------------- feedback -------------------------------- */

const triesText = (left) => {
  if (!Number.isFinite(left) || left <= 0) return '';
  return left === 1 ? ' 1 try left.' : ` ${left} tries left.`;
};

/**
 * What a student is told for a feedback event — a hint that names what to
 * check, never the answer (lineGraphFeedback.mjs writes the hints).
 * `left` is the item's tries left after this event (triesLeft).
 */
export const lineFeedbackMessage = (feedback, question, { left = Number.POSITIVE_INFINITY } = {}) => {
  if (!feedback) return '';
  const naming = question?.itemType === LINE_ITEM_TYPE.NAME;
  switch (feedback.kind) {
    case LINE_FEEDBACK.CORRECT:
      return feedback.firstTry ? 'Correct!' : 'Correct — you fixed it!';
    case LINE_FEEDBACK.MISS:
      return `${feedback.message || 'Not this line — check it again.'}${triesText(left)}`.trim();
    case LINE_FEEDBACK.REVEALED:
      if (question?.answerStyle === LINE_ANSWER_STYLE.CHOICE) return 'Not that one — the right equation is marked.';
      return naming ? 'Here is the right equation. Next one coming…' : 'Here is the line. Next one coming…';
    case LINE_FEEDBACK.REPEATED:
      return naming ? 'That is the same equation as before — change a box.' : 'That is the same line as before — move a point to change it.';
    case LINE_FEEDBACK.METHOD:
    case LINE_FEEDBACK.FORM:
      return feedback.message || '';
    case LINE_FEEDBACK.SKIPPED:
      return 'Skipped. Next one.';
    case LINE_FEEDBACK.RESYNCED:
      return 'Synced with your saved progress.';
    default:
      return '';
  }
};

/**
 * The right equation of an item, as a shown answer reads it: a Graph-it
 * item's own equation; a chosen item's right option; a built item's line
 * written in its form (the device has the line — the drawn graph shows it —
 * but not the generator's wording, which is the same line).
 */
export const answerEquation = (question) => {
  if (!question) return null;
  if (question.itemType !== LINE_ITEM_TYPE.NAME) return question.equation || null;
  if (question.answerStyle === LINE_ANSWER_STYLE.CHOICE) {
    return (question.choices || []).find((choice) => choice.id === question.answerChoice)?.equation || null;
  }
  const { line } = question;
  if (!line) return null;
  if (line.b === 0) return presentEquation(specialTokens({ axis: 'x', value: xInterceptOf(line) }));
  if (question.form === LINE_FORM.STANDARD) return presentEquation(standardTokens({ A: line.a, B: line.b, C: line.c }));
  if (isHorizontal(line)) return presentEquation(specialTokens({ axis: 'y', value: yInterceptOf(line) }));
  if (question.form === LINE_FORM.POINT_SLOPE) {
    const at = question.marked || question.reveal?.points?.[0];
    if (at) return presentEquation(pointSlopeTokens({ x1: at.x, y1: at.y, m: slopeOf(line) }));
  }
  return presentEquation(slopeInterceptTokens({ m: slopeOf(line), b: yInterceptOf(line) }));
};

/* ------------------------------ persistence ------------------------------ */

/** Where a round's unsent attempts are kept, so a refresh resends rather than loses them. */
export const LINE_QUEUE_KEY_PREFIX = 'graph-the-line-queue-';
export const lineQueueKey = (roomId, roundIndex, roundVersion) => `${LINE_QUEUE_KEY_PREFIX}${roomId}-${roundIndex}-${Number(roundVersion) || 0}`;

const ATTEMPT_KINDS = new Set(Object.values(LINE_ATTEMPT_KIND));

/** A stored queue, shape-checked: anything malformed is dropped, not sent. */
export const parseStoredLineQueue = (raw) => {
  let parsed;
  try { parsed = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((attempt) => attempt
    && typeof attempt.attemptId === 'string'
    && /^[A-Za-z0-9_-]{1,40}$/.test(attempt.attemptId)
    && Number.isInteger(attempt.questionIndex)
    && ATTEMPT_KINDS.has(attempt.kind))
    .slice(0, LINE_LIMITS.perRound);
};

/** A device's attempt id: a UUID where the browser has one, else the same alphabet (at most 40 characters). */
export const newLineAttemptId = (crypto = globalThis.crypto) => {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const random = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random()}-${random()}`;
};
