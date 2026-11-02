/*
 * GRAPH FEATURE RUSH: THE RULES BOTH SIDES PLAY BY.
 *
 * The small set of constants the student's device and the server must agree
 * on — what an attempt can be, what a verdict can say, how many attempts fit
 * in one request, the device's pacing after mistakes, and what an item is
 * worth. Kept apart from graphFeatureRush.mjs (the server's grading) so the
 * student's game bundle carries these few numbers and not the generator and
 * its families.
 *
 * Pure: shared by Cloud Functions, the student device and tests.
 */

import { setAnswerTaps, setFromPlain } from './numberLineSets.mjs';

// The game mode's id (liveChallengeModes.CHALLENGE_MODE_ID), here so the
// student's screen can recognise a rush room without the mode registry.
export const RUSH_MODE_ID = 'graphFeatureRush';

// Inequality Graphing Rush (inequalityRush.mjs) plays by these same rules:
// its items are rush questions graphed on a number line, its attempts are rush
// attempts, and its students play on the rush's round screen.
export const INEQUALITY_RUSH_MODE_ID = 'inequalityRush';
export const RUSH_MODE_IDS = Object.freeze([RUSH_MODE_ID, INEQUALITY_RUSH_MODE_ID]);

/** Whether a room's mode plays on the rush's attempts and round screen. */
export const isRushModeId = (modeId) => RUSH_MODE_IDS.includes(String(modeId || ''));

export const RUSH_ATTEMPT_KIND = Object.freeze({
  TAP: 'tap',
  DOES_NOT_EXIST: 'dne',
  // The feature exists, past the edge of the view (a game with off-screen
  // features turned on).
  OFF_SCREEN: 'offScreen',
  // A set drawn on an axis — a domain, a range, an interval, an inequality's
  // solutions — sent with ✓ Check
  // (`drawing`: numberLineSets.drawingToPlain).
  CHECK: 'check',
  SKIP: 'skip',
});

export const RUSH_VERDICT = Object.freeze({
  // Recorded attempts.
  HIT: 'hit',
  MISS: 'miss',
  SKIPPED: 'skipped',
  // Not recorded: neither credit nor penalty.
  ALREADY_FOUND: 'alreadyFound',
  RESOLVED: 'resolved',
  OUT_OF_ORDER: 'outOfOrder',
  LIMIT: 'limit',
  INVALID: 'invalid',
  // Sooner than the student's own device could have taken it (RUSH_PACING).
  TOO_FAST: 'tooFast',
});

export const RUSH_LIMITS = Object.freeze({
  // Attempts in one request. A device sends one request at a time, so a burst
  // of taps on a slow connection arrives as one batch, in order.
  batch: 12,
  // Recorded attempts on one graph, in one round, and in a whole match. Far
  // above anything a student tapping with intent produces; they bound the
  // private record, which is ONE document (Firestore's limit is 1 MiB, and a
  // receipt is about 430 bytes: 1,800 of them stay under 800 KiB).
  perQuestion: 30,
  perRound: 400,
  perMatch: 1_800,
  // How long before its request arrived an attempt may claim to have happened.
  claimWindowMs: 8_000,
  // Questions a device may ask for at once.
  issueBatch: 8,
});

// Consecutive wrong answers on one graph before input pauses, and the pause.
// One second, growing a second per further miss, at most four: at 600 ms
// steps a student tapping along an axis at the spacing of the tap tolerance
// completed as many intercept graphs as one reading them (simulated, through
// the real pipeline); at these, about two thirds as many, while a careful
// reader loses nothing and a struggling one almost nothing.
export const RUSH_LOCKOUT = Object.freeze({ after: 2, baseMs: 1_000, stepMs: 1_000, maxMs: 4_000 });

// Misses on one graph after which it is skipped for the student: a stuck
// student moves on, and sweeping an axis for intercepts stops paying. The
// server records the skip with the miss that reaches it; the device shows it.
export const RUSH_AUTO_SKIP_MISSES = 8;

// A set — a domain, a range, an interval — is checked, not tapped for, and so
// is every inequality, including one whose answer is "No solution" (and an
// interval that happens nowhere): three wrong answers show the
// answer and move on. The device holds the answer on screen for
// RUSH_REVEAL_PAUSE_MS (the server's pace accounting takes the skip pause, the
// shorter of the two, so it never refuses a student who waited longer).
export const RUSH_SET_AUTO_SKIP_MISSES = 3;
export const RUSH_REVEAL_PAUSE_MS = 2_600;

/** Whether a question is answered on a number line: a domain, a range, an interval, an inequality. */
export const isNumberLineQuestion = (question) => question?.kind === 'inequality'
  // A set feature's question says its axis — also when its answer is "Does
  // Not Exist" and it has no target (an interval that never happens).
  || question?.setAxis === 'x' || question?.setAxis === 'y'
  || (Array.isArray(question?.targets) && question.targets.some((target) => target?.geometry === 'set'));

// The diagnosis of a wrong check that drew exactly a question's `flipSet` —
// the set its solving gives with the sign left unflipped (an inequality
// divided by a negative). Counted in the teacher's report beside the
// number-line diagnoses (numberLineSets.SET_DIAGNOSIS).
export const RUSH_SIGN_FLIP = 'signFlip';

/*
 * WHAT AN ITEM IS WORTH: THE TAPS ITS ANSWER TAKES. A tapped feature is a
 * point a target (two zeros: 2), "Does Not Exist", "Off screen" and "No
 * solution" a point, and a set — a domain, a range, an interval, an
 * inequality — the taps that draw it and check it (numberLineSets.
 * setAnswerTaps): "x ≥ −2" is 3, "−1 < x ≤ 4" is 4, "x ≠ 2" 5. So an item
 * that takes more taps pays for the time they take, and a student whose
 * round deals more domains is not out-raced by one who draws intercepts: a
 * correct tap is worth a point, whatever the item.
 *
 * The generator stamps it on the question (`weight`); the server grades with
 * the weight of its own regenerated copy, records it on the receipts
 * (`questionWeight`), and the round's work is the weighted sum
 * (liveChallengeResponses.questionProgress).
 */
export const RUSH_MAX_QUESTION_WEIGHT = 8;

export const rushQuestionWeight = (question) => {
  const targets = Array.isArray(question?.targets) ? question.targets : [];
  const setTarget = targets.find((target) => target?.geometry === 'set');
  let taps = 1;
  if (setTarget) taps = setAnswerTaps(setFromPlain(setTarget.set) || []) ?? 1;
  else if (targets.length) taps = targets.length;
  return Math.max(1, Math.min(RUSH_MAX_QUESTION_WEIGHT, taps));
};

/** How many misses on a question skip it: three for a number line, eight for taps. */
export const rushAutoSkipMisses = (question) => (
  isNumberLineQuestion(question) ? RUSH_SET_AUTO_SKIP_MISSES : RUSH_AUTO_SKIP_MISSES
);

/**
 * The cooldown after `consecutiveMisses` wrong taps (or wrong "Does Not
 * Exist" presses) in a row on one graph. A single mistake costs nothing; a
 * second in a row a moment's pause; spraying taps a growing one, so guessing
 * is slower than looking. Tuned by simulation (graphFeatureRushEngine tests):
 * reading the graph outranks spraying and axis-sweeping, even a sweep spaced
 * exactly to the tap tolerance.
 */
export const rushLockoutMs = (consecutiveMisses = 0) => {
  const misses = Math.max(0, Math.floor(Number(consecutiveMisses) || 0));
  if (misses < RUSH_LOCKOUT.after) return 0;
  return Math.min(RUSH_LOCKOUT.maxMs, RUSH_LOCKOUT.baseMs + (misses - RUSH_LOCKOUT.after) * RUSH_LOCKOUT.stepMs);
};

// How long a completed graph's success flash, and a skip, hold the screen.
export const RUSH_COMPLETE_FLASH_MS = 420;
export const RUSH_SKIP_PAUSE_MS = 1_200;

/*
 * WHAT THE SERVER CHECKS OF A STUDENT'S PACE (SI08).
 *
 * The device holds the screen after each answer: the completion flash, the
 * skip pause, the cooldown from the second miss in a row. A scripted client
 * can skip all of that, so the server now requires that the pauses a
 * student's recorded attempts imply, plus `firstLookMs` before the first
 * answer on each new graph (no one answers a graph in less time than it takes
 * to see it), fit in the round's elapsed time on the SERVER's clock when the
 * request arrived, give or take `slackMs`: a refresh or a resync clears a
 * pause still running on the device, a round pause can hold one, and a
 * device's GO can be a moment ahead of the server's. `firstLookMs` is far
 * below the time a person needs to see a new graph and answer it: it bounds a
 * script, never a student. Refused attempts are not recorded (no credit, no
 * penalty); the device resynchronizes and the student taps again.
 */
export const RUSH_PACING = Object.freeze({ firstLookMs: 100, slackMs: 5_000 });
