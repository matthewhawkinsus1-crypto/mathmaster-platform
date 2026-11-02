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
 *   recordTap / recordDoesNotExist / recordOffScreen / recordSkip
 *                                                 a student's input
 *   recordSetTap / recordCheck                    a domain, a range or an
 *                                                 interval, marked on the
 *                                                 graph itself: its arrows for
 *                                                 "keeps going", its points
 *                                                 and asymptotes for numbers
 *                                                 (rushGraphModel.setTapAt) —
 *                                                 the drawing (this device
 *                                                 only) and its ✓ Check
 *   recordAxisTap / toggleAxisArrow               an inequality's number line:
 *                                                 a tap on a number, a tap on
 *                                                 one of its end arrows
 *
 * Inequality Graphing Rush plays on this same session: its items are number
 * line questions (inequalityRush.mjs) — a tap on the line drops a dot, ✓ Check
 * grades the drawing, and "No solution" is the "Does Not Exist" press.
 *   settle                                        a completion flash or skip
 *                                                 pause ending: next graph
 *   acknowledge                                   the server's reply to a batch
 *   withQuestions / prefetchRequest               the graphs on hand
 */

import { clampTolerance, resolveTap, TAP_RESULT } from '../../../functions/shared/graphFeatureHitTest.mjs';
import { getGraphFeature, isIntervalFeature } from '../../../functions/shared/graphFeatureRegistry.mjs';
import {
  EMPTY_DRAWING,
  drawingForSet,
  drawingSet,
  drawingToPlain,
  inequalityNotation,
  intervalNotation,
  setFromPlain,
  setHint,
  setsEqual,
  snapNumberLineValue,
  tapNumber,
  toggleArrow,
  withArrows,
} from '../../../functions/shared/numberLineSets.mjs';
import {
  RUSH_ATTEMPT_KIND,
  RUSH_COMPLETE_FLASH_MS,
  RUSH_LIMITS,
  RUSH_REVEAL_PAUSE_MS,
  RUSH_SKIP_PAUSE_MS,
  isNumberLineQuestion,
  rushAutoSkipMisses,
  rushLockoutMs,
  rushQuestionWeight,
} from '../../../functions/shared/graphFeatureRushRules.mjs';
import { NO_SOLUTION_MISS, inequalityAnswerText, inequalityHint, isInequalityQuestion } from '../../../functions/shared/inequalityRush.mjs';
import { SET_TAP_TIP, formatPoint, formatTarget, nearOpenDot, setAxisOf } from './rushGraphModel.js';

export const RUSH_FEEDBACK = Object.freeze({
  HIT: 'hit',
  COMPLETE: 'complete',
  MISS: 'miss',
  ALREADY_FOUND: 'alreadyFound',
  SKIPPED: 'skipped',
  AUTO_SKIPPED: 'autoSkipped',
  RESYNCED: 'resynced',
  // A tap on a set question that means nothing there (rushGraphModel.SET_TAP_TIP):
  // said, never counted.
  TIP: 'tip',
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

// The round's points as the server counts them: each item's weight times
// the share of it done (whole numbers for a rush; rounded for display).
const pointsOf = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 1000) / 1000 : 0;
};

const countsFromServer = (state = {}) => Object.freeze({
  completed: Math.max(0, integerOr(state.questionsCorrect, 0)),
  skipped: Math.max(0, integerOr(state.skipped, 0)),
  attempts: Math.max(0, integerOr(state.attempts, 0)),
  hits: Math.max(0, integerOr(state.hits, 0)),
  points: pointsOf(state.scoreTotal),
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
  // A domain, range or interval being drawn on the current graph (numberLineSets),
  // and the graph's arrows tapped for it (each id with the side it says).
  drawing: EMPTY_DRAWING,
  arrowPicks: Object.freeze([]),
  feedback: null,
  seq: 0,
});

/** The set target of a domain, range or interval question, or null. */
export const setTargetOf = (question) => (question?.targets || []).find((target) => target?.geometry === 'set') || null;

export { isInequalityQuestion, isNumberLineQuestion };
/**
 * Whether a question is answered by drawing a set on an axis — also an
 * interval question whose answer is "Does Not Exist" (no target, its axis
 * stamped on it), which must play exactly like the rest.
 */
export const isSetQuestion = (question) => Boolean(setAxisOf(question));

// The word an interval question asks about ("increasing", "positive"), or null.
const intervalWordOf = (question) => (isIntervalFeature(question?.feature) ? question.feature : null);

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

/** What an item is worth: the taps its answer takes (the server's stamp, else the rule). */
export const questionWeightOf = (question) => Math.max(1, integerOr(question?.weight, rushQuestionWeight(question)));

// The points a correct answer earns: its share of the item, as the server
// awards it (graphFeatureRush.applyRushAttempts) — a point a target found,
// the whole weight for a set, "Does Not Exist" or "Off screen".
const shareOf = (question, foundBefore) => {
  const weight = questionWeightOf(question);
  const targets = Math.max(1, integerOr(question?.targetCount, 1));
  return Math.round((weight * (foundBefore + 1)) / targets) - Math.round((weight * foundBefore) / targets);
};

// A hit: the target is found; finding the last one completes the graph.
const applyHit = (session, question, targetId, nowMs, extra = {}) => {
  const found = Object.freeze([...session.found, String(targetId)]);
  const completes = found.length >= Math.max(1, integerOr(question.targetCount, 1));
  const earned = shareOf(question, session.found.length);
  const counts = Object.freeze({
    ...session.counts,
    attempts: session.counts.attempts + 1,
    hits: session.counts.hits + 1,
    completed: session.counts.completed + (completes ? 1 : 0),
    points: pointsOf((session.counts.points || 0) + earned),
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
    points: earned,
    ...extra,
  });
};

// A miss: a cooldown from the second in a row, and the graph is skipped on
// the last allowed miss — as the server records it in the same transaction:
// the eighth on a tap question, the third wrong check of a set,
// which holds the answer on screen long enough to read.
const applyMiss = (session, nowMs, extra = {}) => {
  const question = currentQuestion(session);
  const missesInARow = session.missesInARow + 1;
  const missesOnGraph = session.missesOnGraph + 1;
  const autoSkip = missesOnGraph >= rushAutoSkipMisses(question);
  // A number line shows its answer as it moves on: long enough to read.
  const skipPause = isNumberLineQuestion(question) ? RUSH_REVEAL_PAUSE_MS : RUSH_SKIP_PAUSE_MS;
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
    transition: autoSkip ? Object.freeze({ kind: RUSH_FEEDBACK.AUTO_SKIPPED, questionIndex: session.cursor, until: Number(nowMs) + skipPause }) : null,
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
  // A miss on an open dot is told why: that point is not on the graph.
  const next = tap.result === TAP_RESULT.HIT
    ? applyHit(session, question, tap.targetId, nowMs)
    : applyMiss(session, nowMs, {
      x: Number(x),
      y: Number(y),
      ...(nearOpenDot({ question, x, y, tolerance: limits }) ? { openDot: true } : {}),
    });
  return { session: queued(next, attempt), attempt };
};

/** Whether a question's feature exists past the edge of its view. */
const isOffScreen = (question) => question?.offScreen === true;

/**
 * "Does Not Exist": right on a graph without the feature, a miss on one with
 * it — on screen, or past the edge (it exists there).
 */
export const recordDoesNotExist = (session, { nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== RUSH_INPUT.READY) return refused(session, nowMs);
  const question = currentQuestion(session);
  const attempt = Object.freeze({
    attemptId: String(attemptId),
    questionIndex: session.cursor,
    kind: RUSH_ATTEMPT_KIND.DOES_NOT_EXIST,
    clientElapsedMs: elapsedOf(elapsedMs),
  });
  const absent = (!Array.isArray(question.targets) || question.targets.length === 0) && !isOffScreen(question);
  // On an inequality the press is "No solution": the same rule, its own words.
  const noSolution = isInequalityQuestion(question) ? { noSolution: true } : {};
  const next = absent
    ? applyHit(session, question, 'dne', nowMs, { doesNotExist: true, ...noSolution })
    : applyMiss(session, nowMs, { doesNotExist: true, offScreen: isOffScreen(question), ...noSolution });
  return { session: queued(next, attempt), attempt };
};

/**
 * "Off screen" (a game with off-screen features): right when the feature
 * exists past the edge of the view, a miss when it is on screen or absent.
 */
export const recordOffScreen = (session, { nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== RUSH_INPUT.READY) return refused(session, nowMs);
  const question = currentQuestion(session);
  const attempt = Object.freeze({
    attemptId: String(attemptId),
    questionIndex: session.cursor,
    kind: RUSH_ATTEMPT_KIND.OFF_SCREEN,
    clientElapsedMs: elapsedOf(elapsedMs),
  });
  const next = isOffScreen(question)
    ? applyHit(session, question, 'offScreen', nowMs, { offScreenPress: true })
    : applyMiss(session, nowMs, { offScreenPress: true });
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

/*
 * DRAWING A DOMAIN, A RANGE OR AN INTERVAL ON THE GRAPH ITSELF. A tap lands on
 * what it means there (rushGraphModel.setTapAt): an arrow says "keeps going"
 * that way along the question's axis, and tapping it again takes it back —
 * each arrow on its own, so tapping both arms of a parabola for its range
 * keeps "up" on; a point or an asymptote drops a dot at its number, once for
 * a closed dot, twice for open, a third time to take it away
 * (numberLineSets.tapNumber). A tap that means nothing there is told why.
 *
 * AN INEQUALITY'S NUMBER LINE: a tap drops a dot at the nearest whole number,
 * and a tap on one of the line's own end arrows turns "keeps going" that way
 * on or off (toggleAxisArrow).
 *
 * None of it is sent: only ✓ Check is an attempt.
 */
const arrowsOf = (picks) => ({
  left: picks.some((pick) => pick.side === 'left'),
  right: picks.some((pick) => pick.side === 'right'),
});

export const recordSetTap = (session, { hit, nowMs }) => {
  if (inputState(session, nowMs) !== RUSH_INPUT.READY) return refused(session, nowMs);
  if (!hit) return { session, attempt: null };
  if (hit.kind === 'value') {
    return { session: Object.freeze({ ...session, drawing: tapNumber(session.drawing, hit.value) }), attempt: null };
  }
  if (hit.kind === 'arrow') {
    const picked = session.arrowPicks.some((pick) => pick.id === hit.id);
    const arrowPicks = Object.freeze(picked
      ? session.arrowPicks.filter((pick) => pick.id !== hit.id)
      : [...session.arrowPicks, Object.freeze({ id: String(hit.id), side: hit.side === 'left' ? 'left' : 'right' })]);
    return { session: Object.freeze({ ...session, arrowPicks, drawing: withArrows(session.drawing, arrowsOf(arrowPicks)) }), attempt: null };
  }
  return { session: withFeedback(session, { kind: RUSH_FEEDBACK.TIP, questionIndex: session.cursor, tip: hit.tip, line: hit.line || null }), attempt: null };
};
const axisStepOf = (question, axis) => {
  const step = Number(axis === 'y' ? question.view?.yStep : question.view?.xStep);
  return step > 0 ? step : 1;
};

// The axis a question is drawn on: its set's, or an inequality's line (x) —
// also for an item with no solution, which has no set to name it.
const drawingAxisOf = (question) => setAxisOf(question) || (isInequalityQuestion(question) ? 'x' : null);

/** The number an inequality's line drops a dot at for a tap at (x, y): the nearest tick in view. */
export const axisValueAt = (question, { x, y }) => {
  const axis = drawingAxisOf(question);
  if (!axis || !question?.view) return null;
  const step = axisStepOf(question, axis);
  const [low, high] = axis === 'y' ? [question.view.yMin, question.view.yMax] : [question.view.xMin, question.view.xMax];
  let value = snapNumberLineValue(axis === 'y' ? y : x, step);
  if (value === null) return null;
  if (value > high) value -= step;
  if (value < low) value += step;
  return value >= low && value <= high ? value : null;
};

// An inequality's number line only: a graph's set is tapped on the graph (recordSetTap).
export const recordAxisTap = (session, { x, y, nowMs }) => {
  if (inputState(session, nowMs) !== RUSH_INPUT.READY || !isInequalityQuestion(currentQuestion(session))) return refused(session, nowMs);
  const question = currentQuestion(session);
  const value = axisValueAt(question, { x, y });
  if (value === null) return { session, attempt: null };
  return { session: Object.freeze({ ...session, drawing: tapNumber(session.drawing, value) }), attempt: null };
};

/** One of an inequality's number-line end arrows tapped: 'left' or 'right' toggled. */
export const toggleAxisArrow = (session, side, { nowMs }) => {
  if (inputState(session, nowMs) !== RUSH_INPUT.READY || !isInequalityQuestion(currentQuestion(session))) return refused(session, nowMs);
  return { session: Object.freeze({ ...session, drawing: toggleArrow(session.drawing, side) }), attempt: null };
};

/** Whether the drawing names a set yet (✓ Check is offered only then). */
export const drawingReady = (session) => drawingSet(session.drawing) !== null;

/**
 * ✓ Check: the set the drawing means against the answer, exactly — right
 * completes the graph; wrong is a miss with a hint about the one thing that
 * is off (numberLineSets.setHint; for an inequality, inequalityHint: the sign
 * flip, which way, open or closed), and the third skips it, showing the
 * answer. An inequality with no solution has no set: any drawing is wrong.
 */
export const recordCheck = (session, { nowMs, elapsedMs, attemptId }) => {
  if (inputState(session, nowMs) !== RUSH_INPUT.READY) return refused(session, nowMs);
  const question = currentQuestion(session);
  const target = setTargetOf(question);
  const inequality = isInequalityQuestion(question);
  const drawn = drawingSet(session.drawing);
  if (!drawn || (!setAxisOf(question) && !inequality)) return { session, attempt: null };
  const attempt = Object.freeze({
    attemptId: String(attemptId),
    questionIndex: session.cursor,
    kind: RUSH_ATTEMPT_KIND.CHECK,
    drawing: drawingToPlain(session.drawing),
    clientElapsedMs: elapsedOf(elapsedMs),
  });
  const answer = target ? setFromPlain(target.set) : null;
  let next;
  if (answer && setsEqual(drawn, answer)) {
    // Read back in both notations: "x > −4 · (−4, ∞)".
    next = applyHit(session, question, target.id, nowMs, { checked: bothNotations(drawn, setVariableOf(question)).join(' · ') });
  } else {
    next = applyMiss(session, nowMs, { hint: checkHint(question, drawn, answer) });
  }
  return { session: queued(next, attempt), attempt };
};

/*
 * The hint for a wrong check: the one thing that is off (setHint); for an
 * inequality, inequalityHint; for an interval that happens nowhere, a nudge
 * to test what was marked — as an inequality with no solution gets — never
 * the answer.
 */
const NOWHERE_HINTS = Object.freeze({
  increasing: 'Check a part you marked: does the graph rise there, left to right?',
  decreasing: 'Check a part you marked: does the graph fall there, left to right?',
  constant: 'Check a part you marked: is the graph level there?',
  positive: 'Check a part you marked: is the graph above the x-axis there?',
  negative: 'Check a part you marked: is the graph below the x-axis there?',
});
const checkHint = (question, drawn, answer) => {
  if (isInequalityQuestion(question)) return inequalityHint(question, drawn);
  if (!answer) return NOWHERE_HINTS[question?.feature] || 'Look again at the graph.';
  return setHint(drawn, answer, { axis: setAxisOf(question) || 'x' });
};

/**
 * The answer as a drawing, for the reveal after the third miss: a set's own
 * drawing; for an inequality with no solution, an empty line — so the
 * student's wrong shading never stays up beside "no solution". Null for a
 * question answered by taps.
 */
export const answerDrawing = (question) => {
  const target = setTargetOf(question);
  if (target) {
    const answer = setFromPlain(target.set);
    return answer ? drawingForSet(answer) : null;
  }
  // No solution, or an interval that happens nowhere: an empty axis.
  return isNumberLineQuestion(question) ? EMPTY_DRAWING : null;
};

// The letter a set is written in: y for a range (the y-axis), x otherwise.
const setVariableOf = (question) => (setAxisOf(question) === 'y' ? 'y' : 'x');

/** A set in both notations, inequality first: ["x ≥ −3", "[−3, ∞)"]. */
export const bothNotations = (set, variable = 'x') => Object.freeze([inequalityNotation(set, variable), intervalNotation(set)]);

/**
 * The notation under a number-line question, as the forms to show side by
 * side — inequality notation first, then interval notation, so a student
 * sees both as they build (["x ≥ −3", "[−3, ∞)"]; a range in y:
 * ["y < 2", "(−∞, 2)"]) — of the set as drawn, or, while the answer is shown
 * after the third miss, of the answer (an inequality with no solution:
 * ["no solution", "∅"]). Null when nothing names a set yet.
 */
export const lineNotation = (question, drawing, { revealing = false } = {}) => {
  if (!isNumberLineQuestion(question)) return null;
  const target = setTargetOf(question);
  let set = null;
  if (revealing) set = (target && setFromPlain(target.set)) || [];
  else if (drawing) set = drawingSet(drawing);
  if (!set) return null;
  // An interval that happens nowhere is said in words, never "no solution".
  if (!set.length && intervalWordOf(question)) return Object.freeze([`never ${intervalWordOf(question)}`, '∅']);
  return bothNotations(set, setVariableOf(question));
};

/** When a completion flash or skip pause is over, the next graph. */
export const settle = (session, nowMs) => {
  if (!session.transition || Number(nowMs) < session.transition.until) return session;
  return Object.freeze({
    ...session,
    cursor: session.transition.questionIndex + 1,
    drawing: EMPTY_DRAWING,
    arrowPicks: Object.freeze([]),
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
    // A drawing belongs to the graph it was drawn on.
    drawing: integerOr(serverState.cursor, 0) === next.cursor ? next.drawing : EMPTY_DRAWING,
    arrowPicks: integerOr(serverState.cursor, 0) === next.cursor ? next.arrowPicks : Object.freeze([]),
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
// Where an off-screen feature is: "(11, 0)", "(−8, 0) and (8, 0)".
const offScreenPlaces = (question) => {
  const places = (question?.offScreenTargets || []).map(formatPoint);
  return places.length < 2 ? places.join('') : `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}`;
};

export const OPEN_DOT_MESSAGE = 'Open dot — that point isn\'t on the graph.';

// What a tap that means nothing on a set question is told (rushGraphModel.SET_TAP_TIP).
export const setTapTipMessage = (feedback, question) => {
  const range = setAxisOf(question) === 'y';
  switch (feedback?.tip) {
    case SET_TAP_TIP.GOES_NOWHERE:
      return range
        ? 'That end levels off — it doesn\'t keep going up or down.'
        : 'That end runs along an asymptote — it doesn\'t keep going left or right.';
    case SET_TAP_TIP.OTHER_AXIS:
      return range
        ? `${feedback.line || 'That line'} marks an x-value — this set is on the y-axis.`
        : `${feedback.line || 'That line'} marks a y-value — this set is on the x-axis.`;
    default:
      return 'Tap an arrow for "keeps going", or a point where the graph starts, stops, turns or crosses.';
  }
};

export const NO_SOLUTION_RIGHT = 'Correct — no solution: no number makes it true.';

export const feedbackMessage = (feedback, question) => {
  if (!feedback) return '';
  const feature = featureOf(question);
  const target = (question?.targets || []).find((entry) => entry.id === feedback.targetId);
  const inequality = isInequalityQuestion(question);
  switch (feedback.kind) {
    case RUSH_FEEDBACK.HIT:
      return target ? `Found ${formatTarget(target)}.` : 'Found one.';
    case RUSH_FEEDBACK.COMPLETE: {
      if (feedback.doesNotExist && intervalWordOf(question)) return `Correct — it is never ${intervalWordOf(question)}.`;
      if (feedback.doesNotExist) return inequality ? NO_SOLUTION_RIGHT : 'Correct — it does not exist on this graph.';
      if (feedback.checked) return `Correct — ${feedback.checked}.`;
      if (feedback.offScreenPress) {
        const places = offScreenPlaces(question);
        return places ? `Correct — it is off the screen, at ${places}.` : 'Correct — it is off the screen.';
      }
      return target ? `Found ${formatTarget(target)}. Graph complete!` : 'Graph complete!';
    }
    case RUSH_FEEDBACK.MISS:
      if (feedback.doesNotExist && inequality) return NO_SOLUTION_MISS;
      if (feedback.doesNotExist && intervalWordOf(question)) return `It is ${intervalWordOf(question)} somewhere — look again.`;
      // A feature past the edge exists: the arrows say where the graph goes.
      if (feedback.doesNotExist) return feedback.offScreen ? 'It exists — follow the arrows.' : 'It is on this graph — look again.';
      if (feedback.offScreenPress) return 'Not off the screen — look again.';
      if (feedback.openDot) return OPEN_DOT_MESSAGE;
      if (feedback.hint) return feedback.hint;
      return feature?.missMessage || 'Not there — try again.';
    case RUSH_FEEDBACK.ALREADY_FOUND:
      return 'Already found.';
    case RUSH_FEEDBACK.SKIPPED:
      return inequality ? 'Skipped. Next one.' : 'Skipped. Next graph.';
    case RUSH_FEEDBACK.AUTO_SKIPPED: {
      // An inequality, a domain, a range or an interval shows its answer as it moves on.
      if (inequality) return `Answer: ${inequalityAnswerText(question)}. Next one.`;
      const target = setTargetOf(question);
      const answer = target ? setFromPlain(target.set) : null;
      const word = intervalWordOf(question);
      if (word) {
        const said = answer ? bothNotations(answer, 'x').join(' · ') : null;
        return said ? `${word[0].toUpperCase()}${word.slice(1)}: ${said}. Next graph.` : `It is never ${word}. Next graph.`;
      }
      if (answer) return `The ${feature?.shortLabel || 'answer'} is ${bothNotations(answer, setVariableOf(question)).join(' · ')}. Next graph.`;
      return 'Too many misses on this one — moving on.';
    }
    case RUSH_FEEDBACK.RESYNCED:
      return 'Synced with your saved progress.';
    case RUSH_FEEDBACK.TIP:
      return setTapTipMessage(feedback, question);
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
