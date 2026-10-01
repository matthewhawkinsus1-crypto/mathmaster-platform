/*
 * GRAPH FEATURE RUSH: THE RULES BOTH SIDES PLAY BY.
 *
 * The small set of constants the student's device and the server must agree
 * on — what an attempt can be, what a verdict can say, how many attempts fit
 * in one request, and the device's pacing after mistakes. Kept apart from
 * graphFeatureRush.mjs (the server's grading) so the student's game bundle
 * carries these few numbers and not the generator and its families.
 *
 * Pure: shared by Cloud Functions, the student device and tests.
 */

// The game mode's id (liveChallengeModes.CHALLENGE_MODE_ID), here so the
// student's screen can recognise a rush room without the mode registry.
export const RUSH_MODE_ID = 'graphFeatureRush';

export const RUSH_ATTEMPT_KIND = Object.freeze({
  TAP: 'tap',
  DOES_NOT_EXIST: 'dne',
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
