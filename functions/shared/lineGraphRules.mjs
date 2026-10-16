/*
 * GRAPH THE LINE: THE RULES BOTH SIDES PLAY BY.
 *
 * The constants the student's device and the server must agree on — the
 * game's mode ids, what an attempt can be, what a verdict can say, how many
 * tries a line gets, the pause after repeated mistakes — kept apart from the
 * generator so the student's game bundle carries these few values and not
 * the question builders. (Graph Feature Rush keeps the same split:
 * graphFeatureRushRules.mjs.)
 *
 * NO SUBMIT BUTTON. A line is checked the moment it is complete: when the
 * student lets go of the second point, and again each time they let go of a
 * point they dragged. Nothing is checked mid-drag. Each check of a wrong line
 * is one recorded miss; letting go without changing the line is not a new
 * attempt. A chosen equation is checked when it is tapped. Only a typed
 * ("Build it") equation waits for Enter: checking every keystroke would let a
 * student type digits until the screen turned green.
 *
 * Pure: shared by Cloud Functions, the student device and tests.
 */

/*
 * Three formats, each its own registered game mode (liveChallengeModes.mjs)
 * so each declares its own round structure, question pool and round limits:
 *
 *   classic  one graph a round; by default the whole class graphs the same
 *            equation, and the answer is shown between rounds
 *   sprint   a set number of graphs in a row; a round ends when everyone has
 *            finished them, or at the clock
 *   rush     as many graphs as possible before the clock runs out
 *
 * The ids are permanent once a room stores them.
 */
export const LINE_GRAPH_FORMAT = Object.freeze({
  CLASSIC: 'classic',
  SPRINT: 'sprint',
  RUSH: 'rush',
});

export const LINE_GRAPH_FORMAT_IDS = Object.freeze(Object.values(LINE_GRAPH_FORMAT));

export const LINE_GRAPH_MODE_ID = Object.freeze({
  CLASSIC: 'lineGraphClassic',
  SPRINT: 'lineGraphSprint',
  RUSH: 'lineGraphRush',
});

export const LINE_GRAPH_MODE_IDS = Object.freeze(Object.values(LINE_GRAPH_MODE_ID));

const MODE_BY_FORMAT = Object.freeze({
  [LINE_GRAPH_FORMAT.CLASSIC]: LINE_GRAPH_MODE_ID.CLASSIC,
  [LINE_GRAPH_FORMAT.SPRINT]: LINE_GRAPH_MODE_ID.SPRINT,
  [LINE_GRAPH_FORMAT.RUSH]: LINE_GRAPH_MODE_ID.RUSH,
});

const FORMAT_BY_MODE = Object.freeze(Object.fromEntries(Object.entries(MODE_BY_FORMAT).map(([format, mode]) => [mode, format])));

export const isLineGraphMode = (modeId) => Object.hasOwn(FORMAT_BY_MODE, String(modeId || ''));
export const lineGraphFormatOfMode = (modeId) => FORMAT_BY_MODE[String(modeId || '')] || null;
export const lineGraphModeOfFormat = (format) => MODE_BY_FORMAT[String(format || '')] || null;

export const LINE_ITEM_TYPE = Object.freeze({
  // An equation is shown; the student draws its line.
  GRAPH: 'graph',
  // A line is shown; the student names its equation.
  NAME: 'name',
});

export const LINE_ITEM_TYPE_IDS = Object.freeze(Object.values(LINE_ITEM_TYPE));

// How a "Name it" item is answered.
export const LINE_ANSWER_STYLE = Object.freeze({
  // The two points of a drawn line.
  GRAPH: 'graph',
  // One of four equations; the wrong ones are built from common mistakes.
  CHOICE: 'choice',
  // The boxes of a form template, checked on Enter.
  BUILD: 'build',
});

export const LINE_ATTEMPT_KIND = Object.freeze({
  LINE: 'line',
  CHOICE: 'choice',
  EQUATION: 'equation',
  SKIP: 'skip',
});

export const LINE_VERDICT = Object.freeze({
  // Recorded attempts.
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
  SKIPPED: 'skipped',
  // Not recorded: neither credit nor penalty.
  // The right line, not drawn through the key points, in a game that
  // requires the method.
  METHOD: 'method',
  // A typed equation whose WRITING needs fixing (a fraction in standard
  // form, an empty box) — the mathematics was not judged.
  FORM: 'form',
  // The same wrong answer as the attempt just before it (a point let go
  // where it already was).
  REPEATED: 'repeated',
  RESOLVED: 'resolved',
  OUT_OF_ORDER: 'outOfOrder',
  LIMIT: 'limit',
  INVALID: 'invalid',
});

export const LINE_LIMITS = Object.freeze({
  // Attempts in one request: a device sends one request at a time, so a burst
  // of checks on a slow connection arrives as one batch, in order.
  batch: 12,
  // Recorded attempts on one item, in one round, and in a whole match. They
  // bound the private record, which is ONE document (see
  // graphFeatureRushRules.mjs: a receipt is under half a kilobyte).
  perQuestion: 30,
  perRound: 400,
  perMatch: 1_800,
  // How long before its request arrived an attempt may claim to have happened.
  claimWindowMs: 8_000,
  // Questions a device may ask for at once.
  issueBatch: 8,
  // Characters in one typed box.
  fieldLength: 16,
});

/*
 * TRIES. A teacher chooses how many wrong checks a graph gets before the
 * game shows its line and moves on: 1, 2, 3 (the default) or 0 — "until
 * right", which still moves a stuck student on after LINE_AUTO_SKIP_MISSES,
 * as Graph Feature Rush does. A chosen equation always gets one try:
 * tapping through four options is guessing, not graphing.
 */
export const LINE_TRIES_OPTIONS = Object.freeze([1, 2, 3, 0]);
export const DEFAULT_LINE_TRIES = 3;
export const LINE_AUTO_SKIP_MISSES = 8;

/** Wrong checks after which an item is shown and moved past (the forfeit). */
export const missesAllowed = ({ triesPerItem = DEFAULT_LINE_TRIES, answerStyle = LINE_ANSWER_STYLE.GRAPH } = {}) => {
  if (answerStyle === LINE_ANSWER_STYLE.CHOICE) return 1;
  const tries = Math.floor(Number(triesPerItem));
  if (!LINE_TRIES_OPTIONS.includes(tries)) return DEFAULT_LINE_TRIES;
  return tries > 0 ? tries : LINE_AUTO_SKIP_MISSES;
};

/*
 * The pause after repeated mistakes on one item: none after one, one second
 * after a second in a row, a second more per further miss, at most four —
 * the rush's tuning (graphFeatureRushRules.mjs), which keeps a student who
 * drags points at random slower than one who reads the equation while
 * costing a careful student nothing.
 */
export const LINE_LOCKOUT = Object.freeze({ after: 2, baseMs: 1_000, stepMs: 1_000, maxMs: 4_000 });

export const lineLockoutMs = (consecutiveMisses = 0) => {
  const misses = Math.max(0, Math.floor(Number(consecutiveMisses) || 0));
  if (misses < LINE_LOCKOUT.after) return 0;
  return Math.min(LINE_LOCKOUT.maxMs, LINE_LOCKOUT.baseMs + (misses - LINE_LOCKOUT.after) * LINE_LOCKOUT.stepMs);
};

// How long a right answer's flash, a shown answer, and a skip hold the screen.
export const LINE_CORRECT_FLASH_MS = 450;
export const LINE_REVEAL_MS = 1_800;
export const LINE_SKIP_PAUSE_MS = 1_200;
