/*
 * SYSTEMS OF EQUATIONS RUSH: TWO LINES ON EVERY GRAPH.
 *
 * A Live Challenge mode built on Graph Feature Rush's machinery, as Inequality
 * Graphing Rush is (docs/architecture/systems-rush.md): every student gets
 * their own graphs and races the round clock; the server regenerates an item
 * to grade it; attempts are rush attempts (graphFeatureRush.mjs
 * applyRushAttempts) and the student plays on the rush's round screen, its
 * hit test and its keyboard cursor unchanged. Every graph is a SYSTEM — two
 * lines.
 *
 *   QUESTIONS        what a student is asked about the system (the teacher
 *                    chooses any of them):
 *     yIntercept       "Find all y-intercepts": where each line crosses the
 *                      y-axis
 *     xIntercept       "Find all x-intercepts"
 *     solution         "Find where the two lines intersect" — and, from
 *                      Standard, "Find the solution of the system": the same
 *                      point in the system's own words
 *
 *   KINDS OF SYSTEM  what is drawn (the teacher chooses any of them):
 *     slanted          two slanted lines crossing at a grid point
 *     levelUpright     a horizontal or a vertical line: a line with no
 *                      x-intercept or no y-intercept; from Standard, two of
 *                      them, so an intercept question can have none at all
 *     cannotDetermine  they cross between grid lines (at Challenge, also past
 *                      the edge of the graph): one solution, which the graph
 *                      cannot show exactly
 *     parallel         parallel lines: no solution
 *     sameLine         the same line twice: infinitely many solutions
 *
 *   ANSWERS          a tap on each intercept, or on the solution; "Does Not
 *                    Exist" on an intercept question when neither line
 *                    crosses that axis; and on a solution question one button
 *                    for each special kind the game includes — No Solution
 *                    (the rush's "Does Not Exist" press), Infinitely Many,
 *                    Can't Be Determined. A game offers its buttons on EVERY
 *                    solution question, so a button being there never says
 *                    anything about the graph on screen.
 *
 * TWO LINES THAT CAN ALWAYS BE TOLD APART. Line 1 is drawn solid and wide,
 * line 2 dashed and narrow on top of it, each labelled at its own end of the
 * screen (rushGraphModel.systemDrawing). The same line drawn twice reads as a
 * wide line with a dashed line running down its middle, labelled 1 at one end
 * and 2 at the other: two lines, one lying on the other — never one line that
 * might be two. Every system is drawn the same way, so the drawing gives
 * nothing away.
 *
 * This module is what the student's device, the teacher's setup screen and
 * the mode registry share: the settings and their rule, a line in plain
 * numbers and the measures taken of it, and the game's words. The systems
 * themselves are built and checked by systemsGenerator.mjs, on the server
 * only; the reading guide a round publishes is systemsReading.mjs.
 *
 * Pure and light: Cloud Functions, the student device, the teacher's setup
 * screen and tests.
 */

import { RUSH_ATTEMPT_KIND, SYSTEMS_RUSH_MODE_ID } from './graphFeatureRushRules.mjs';

// The game mode's id (liveChallengeModes.CHALLENGE_MODE_ID.SYSTEMS_RUSH),
// declared with the rules the rush's screen and attempts share.
export { SYSTEMS_RUSH_MODE_ID };

// What a system item is (a question's `kind`): the round screen draws two lines.
export const SYSTEM_ITEM_KIND = 'system';

/** Whether a question is a system of two lines. */
export const isSystemsQuestion = (question) => question?.kind === SYSTEM_ITEM_KIND;

export class SystemsRushConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SystemsRushConfigError';
  }
}

/* --------------------------------- settings -------------------------------- */

export const SYSTEM_QUESTION = Object.freeze({
  Y_INTERCEPT: 'yIntercept',
  X_INTERCEPT: 'xIntercept',
  SOLUTION: 'solution',
});
export const SYSTEM_QUESTION_IDS = Object.freeze(Object.values(SYSTEM_QUESTION));

// What each question is called on the setup screen and in the report.
export const SYSTEM_QUESTIONS = Object.freeze([
  Object.freeze({ id: SYSTEM_QUESTION.Y_INTERCEPT, label: 'y-intercepts', description: 'Tap where each line crosses the y-axis.' }),
  Object.freeze({ id: SYSTEM_QUESTION.X_INTERCEPT, label: 'x-intercepts', description: 'Tap where each line crosses the x-axis — if it does.' }),
  Object.freeze({ id: SYSTEM_QUESTION.SOLUTION, label: 'Solution of the system', description: 'Tap where the two lines intersect.' }),
]);
const QUESTION_BY_ID = new Map(SYSTEM_QUESTIONS.map((entry) => [entry.id, entry]));
export const systemQuestionLabel = (id) => QUESTION_BY_ID.get(String(id || ''))?.label || null;

export const SYSTEM_KIND = Object.freeze({
  SLANTED: 'slanted',
  LEVEL_UPRIGHT: 'levelUpright',
  CANNOT_DETERMINE: 'cannotDetermine',
  PARALLEL: 'parallel',
  SAME_LINE: 'sameLine',
});
export const SYSTEM_KIND_IDS = Object.freeze(Object.values(SYSTEM_KIND));

// What each kind is called on the setup screen and in the report.
export const SYSTEM_KINDS = Object.freeze([
  Object.freeze({ id: SYSTEM_KIND.SLANTED, label: 'Two slanted lines', example: 'one solution on the grid', description: 'Two slanted lines that cross at a grid point.' }),
  Object.freeze({ id: SYSTEM_KIND.LEVEL_UPRIGHT, label: 'Horizontal & vertical lines', example: 'y\u00a0=\u00a03, x\u00a0=\u00a0−2', description: 'A horizontal or a vertical line: one with no x-intercept or no y-intercept.' }),
  Object.freeze({ id: SYSTEM_KIND.CANNOT_DETERMINE, label: 'Can\'t be determined', example: 'crossing between grid lines', description: 'The lines cross between grid lines: the solution exists, but the graph cannot show it exactly.' }),
  Object.freeze({ id: SYSTEM_KIND.PARALLEL, label: 'No solution', example: 'parallel lines', description: 'Parallel lines that never meet.' }),
  Object.freeze({ id: SYSTEM_KIND.SAME_LINE, label: 'Infinitely many solutions', example: 'the same line twice', description: 'The same line twice, drawn so both lines show.' }),
]);
const KIND_BY_ID = new Map(SYSTEM_KINDS.map((entry) => [entry.id, entry]));
export const systemKindLabel = (id) => KIND_BY_ID.get(String(id || ''))?.label || null;

// The kinds whose solution is a point to tap: a solution question needs one.
export const CROSSING_KINDS = Object.freeze([SYSTEM_KIND.SLANTED, SYSTEM_KIND.LEVEL_UPRIGHT]);

/*
 * THE ANSWER BUTTONS of a solution question: one for each special kind a
 * game includes, on every solution question of that game. "No Solution" is
 * the rush's "Does Not Exist" press (an inequality's "No Solution" too).
 */
export const SYSTEM_ANSWER_BUTTONS = Object.freeze([
  Object.freeze({ kind: SYSTEM_KIND.PARALLEL, press: RUSH_ATTEMPT_KIND.DOES_NOT_EXIST, label: 'No Solution', hint: 'Parallel? No Solution.', ariaLabel: 'No solution: the lines never meet' }),
  Object.freeze({ kind: SYSTEM_KIND.SAME_LINE, press: RUSH_ATTEMPT_KIND.INFINITELY_MANY, label: 'Infinitely Many', hint: 'The same line? Infinitely Many.', ariaLabel: 'Infinitely many solutions: every point of one line is on the other' }),
  Object.freeze({ kind: SYSTEM_KIND.CANNOT_DETERMINE, press: RUSH_ATTEMPT_KIND.CANNOT_DETERMINE, label: 'Can\'t Be Determined', hint: 'Between grid lines? Can\'t Be Determined.', ariaLabel: 'Can\'t be determined: one solution the graph cannot show exactly' }),
]);

/** The buttons a game's solution questions offer, from its settings. */
export const systemAnswerButtons = (config = {}) => {
  const kinds = new Set(Array.isArray(config?.kinds) ? config.kinds : []);
  return SYSTEM_ANSWER_BUTTONS.filter((button) => kinds.has(button.kind));
};

export const SYSTEMS_DIFFICULTY = Object.freeze({ EASY: 'easy', STANDARD: 'standard', CHALLENGE: 'challenge', MIXED: 'mixed' });
const DIFFICULTIES = new Set(Object.values(SYSTEMS_DIFFICULTY));

export const SYSTEMS_DIFFICULTY_OPTIONS = Object.freeze([
  Object.freeze({ id: 'easy', label: 'Easy', description: 'Whole-number slopes, small windows, and every intercept there to find.' }),
  Object.freeze({ id: 'standard', label: 'Standard', description: 'Fraction slopes, halves, lines that share an intercept, and "Does Not Exist".' }),
  Object.freeze({ id: 'challenge', label: 'Challenge', description: 'More slopes, wider windows, and lines that meet past the edge of the graph.' }),
  Object.freeze({ id: 'mixed', label: 'Mixed', description: 'Starts gentle, then mixes Standard and Challenge.' }),
]);

export const SYSTEMS_ROUND_LIMITS = Object.freeze({
  minRounds: 1,
  maxRounds: 8,
  defaultRounds: 3,
  minSeconds: 30,
  maxSeconds: 120,
  defaultSeconds: 60,
  secondsOptions: Object.freeze([30, 45, 60, 90, 120]),
});

/*
 * THE PRESETS ARE LEVELS: the order a class meets systems in. The intercepts
 * of two lines; where the two lines intersect; the same point called the
 * solution of the system; horizontal and vertical lines, which miss an axis;
 * a solution the graph cannot show; no solution and infinitely many. Each is
 * a starting point a teacher can change, and the last plays all of it.
 */
export const SYSTEMS_RUSH_PRESETS = Object.freeze([
  Object.freeze({
    id: 'intercepts',
    label: 'Level 1 · Intercepts',
    course: 'algebra1',
    description: 'Two lines on every graph: tap each one\'s y-intercept and x-intercept.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    questions: Object.freeze([SYSTEM_QUESTION.Y_INTERCEPT, SYSTEM_QUESTION.X_INTERCEPT]),
    kinds: Object.freeze([SYSTEM_KIND.SLANTED]),
    difficulty: 'easy',
  }),
  Object.freeze({
    id: 'whereTheyIntersect',
    label: 'Level 2 · Where They Intersect',
    course: 'algebra1',
    description: 'The intercepts, then where the two lines intersect.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    questions: Object.freeze([SYSTEM_QUESTION.Y_INTERCEPT, SYSTEM_QUESTION.X_INTERCEPT, SYSTEM_QUESTION.SOLUTION]),
    kinds: Object.freeze([SYSTEM_KIND.SLANTED]),
    difficulty: 'easy',
  }),
  Object.freeze({
    id: 'solutionOfTheSystem',
    label: 'Level 3 · The Solution',
    course: 'algebra1',
    description: '"The solution of the system": the point where the lines intersect, on both of them. Fraction slopes.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    questions: Object.freeze([SYSTEM_QUESTION.SOLUTION]),
    kinds: Object.freeze([SYSTEM_KIND.SLANTED]),
    difficulty: 'standard',
  }),
  Object.freeze({
    id: 'horizontalVertical',
    label: 'Level 4 · Horizontal & Vertical',
    course: 'algebra1',
    description: 'Lines with no x-intercept or no y-intercept — and graphs where neither line crosses an axis.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    questions: Object.freeze([SYSTEM_QUESTION.Y_INTERCEPT, SYSTEM_QUESTION.X_INTERCEPT, SYSTEM_QUESTION.SOLUTION]),
    kinds: Object.freeze([SYSTEM_KIND.SLANTED, SYSTEM_KIND.LEVEL_UPRIGHT]),
    difficulty: 'standard',
  }),
  Object.freeze({
    id: 'cannotDetermine',
    label: 'Level 5 · Can\'t Be Determined',
    course: 'algebra1',
    description: 'Some lines cross between grid lines: the solution exists, but the graph cannot show it.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    questions: Object.freeze([SYSTEM_QUESTION.SOLUTION]),
    kinds: Object.freeze([SYSTEM_KIND.SLANTED, SYSTEM_KIND.CANNOT_DETERMINE]),
    difficulty: 'standard',
  }),
  Object.freeze({
    id: 'noneOrInfinite',
    label: 'Level 6 · None or Infinitely Many',
    course: 'algebra1',
    description: 'Parallel lines with no solution, and the same line twice with infinitely many.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    questions: Object.freeze([SYSTEM_QUESTION.SOLUTION]),
    kinds: Object.freeze([SYSTEM_KIND.SLANTED, SYSTEM_KIND.PARALLEL, SYSTEM_KIND.SAME_LINE]),
    difficulty: 'standard',
  }),
  Object.freeze({
    id: 'everySystem',
    label: 'Every Kind of System',
    course: null,
    description: 'All three questions and all five kinds of system, ramping from gentle to hard.',
    roundCount: 3,
    roundSeconds: 90,
    scoringStrategyId: 'grandPrix',
    questions: SYSTEM_QUESTION_IDS,
    kinds: SYSTEM_KIND_IDS,
    difficulty: 'mixed',
  }),
]);

export const getSystemsPreset = (id) => SYSTEMS_RUSH_PRESETS.find((preset) => preset.id === id) || null;

/** The preset a class of this course starts from. */
export const defaultSystemsPresetFor = (courseId) => (
  courseId === 'algebra2' ? getSystemsPreset('everySystem') : getSystemsPreset('intercepts')
);

// Canonical order, so equal settings compare equal.
const idList = (raw, allowed) => [...new Set((Array.isArray(raw) ? raw : []).map(String))]
  .filter((id) => allowed.includes(id))
  .sort((left, right) => allowed.indexOf(left) - allowed.indexOf(right));

/**
 * The validated settings for a room. Throws SystemsRushConfigError with a
 * sentence a teacher can act on. A preset fills in whatever the request leaves
 * out, and stays named only while the settings still match it.
 */
export const normalizeSystemsRushConfig = (raw = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const preset = getSystemsPreset(source.presetId);
  const questions = idList(source.questions ?? preset?.questions, SYSTEM_QUESTION_IDS);
  const kinds = idList(source.kinds ?? preset?.kinds, SYSTEM_KIND_IDS);
  const difficulty = DIFFICULTIES.has(source.difficulty) ? source.difficulty : (preset?.difficulty || SYSTEMS_DIFFICULTY.STANDARD);
  if (!questions.length) throw new SystemsRushConfigError('Choose at least one question for students to answer.');
  if (!kinds.length) throw new SystemsRushConfigError('Choose at least one kind of system.');
  // A solution question whose answer is never a point to tap would teach "never tap".
  if (questions.includes(SYSTEM_QUESTION.SOLUTION) && !kinds.some((kind) => CROSSING_KINDS.includes(kind))) {
    throw new SystemsRushConfigError('Solution questions need some systems with one solution to tap: choose Two slanted lines or Horizontal & vertical lines too.');
  }
  const matchesPreset = preset
    && preset.difficulty === difficulty
    && idList(preset.questions, SYSTEM_QUESTION_IDS).join() === questions.join()
    && idList(preset.kinds, SYSTEM_KIND_IDS).join() === kinds.join();
  return Object.freeze({
    presetId: matchesPreset ? preset.id : 'custom',
    questions: Object.freeze(questions),
    kinds: Object.freeze(kinds),
    difficulty,
  });
};

/** The problem with a setup, in a teacher's words, or null (for a setup screen). */
export const systemsConfigProblem = (raw) => {
  try {
    normalizeSystemsRushConfig(raw);
    return null;
  } catch (error) {
    if (error instanceof SystemsRushConfigError) return error.message;
    throw error;
  }
};

/* ------------------------------- plain lines ------------------------------- */

/*
 * A LINE AS A DEVICE RECEIVES IT: `{ id, orientation: 'slanted', m, b }`
 * (y = mx + b, m never 0), `{ id, orientation: 'horizontal', y }` or
 * `{ id, orientation: 'vertical', x }`, in plain numbers. No line is ever an
 * axis (y = 0 or x = 0): every point of it would be an intercept. The
 * generator works in exact fractions (systemsGenerator.mjs) and measures what
 * it draws with these same functions.
 */
export const LINE_ORIENTATION = Object.freeze({ SLANTED: 'slanted', HORIZONTAL: 'horizontal', VERTICAL: 'vertical' });

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
// A number, or an exact fraction { n, d } as a number.
const numberOf = (value) => (value && typeof value === 'object' && Number.isFinite(value.n) && Number.isFinite(value.d) ? value.n / value.d : finite(value, Number.NaN));

/** Whether two plain lines are the same line. */
export const plainSameLine = (left, right) => {
  if (!left || !right || left.orientation !== right.orientation) return false;
  const near = (a, b) => Math.abs(finite(a) - finite(b)) < 1e-9;
  if (left.orientation === LINE_ORIENTATION.VERTICAL) return near(left.x, right.x);
  if (left.orientation === LINE_ORIENTATION.HORIZONTAL) return near(left.y, right.y);
  return near(left.m, right.m) && near(left.b, right.b);
};

/**
 * How far a point is from a plain line in tolerance units (the hit test's: 1
 * is the edge of a fingertip's reach), measured across the line.
 */
export const lineDistance = (line, point, limits) => {
  const lx = finite(limits?.x, 1) || 1;
  const ly = finite(limits?.y, 1) || 1;
  const x = finite(point?.x);
  const y = finite(point?.y);
  if (line.orientation === LINE_ORIENTATION.VERTICAL) return Math.abs(x - finite(line.x)) / lx;
  if (line.orientation === LINE_ORIENTATION.HORIZONTAL) return Math.abs(y - finite(line.y)) / ly;
  // In tolerance units the line is Y = (m·lx/ly) X + b/ly.
  const slope = (finite(line.m) * lx) / ly;
  const offset = finite(line.b) / ly;
  return Math.abs(slope * (x / lx) - y / ly + offset) / Math.hypot(slope, 1);
};

// A line's direction, for the angle the two lines cross at (a square view
// keeps both axes on one scale, so the angle on screen is this one).
const directionOf = (line) => (line.orientation === LINE_ORIENTATION.VERTICAL
  ? [0, 1]
  : [1, line.orientation === LINE_ORIENTATION.HORIZONTAL ? 0 : finite(line.m)]);

/** The angle two plain lines cross at, in degrees (0 for parallel lines). */
export const crossingAngle = (left, right) => {
  const [ax, ay] = directionOf(left);
  const [bx, by] = directionOf(right);
  const cos = Math.abs(ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
  return (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
};

/** How much of a plain line the view shows, as a fraction of the view's side. */
export const chordFraction = (line, view) => {
  const span = finite(view?.xMax) - finite(view?.xMin);
  if (!(span > 0)) return 0;
  if (line.orientation === LINE_ORIENTATION.VERTICAL) {
    return finite(line.x) > view.xMin && finite(line.x) < view.xMax ? (view.yMax - view.yMin) / span : 0;
  }
  if (line.orientation === LINE_ORIENTATION.HORIZONTAL) {
    return finite(line.y) > view.yMin && finite(line.y) < view.yMax ? 1 : 0;
  }
  const m = finite(line.m);
  const b = finite(line.b);
  const [atBottom, atTop] = [(view.yMin - b) / m, (view.yMax - b) / m];
  const from = Math.max(view.xMin, Math.min(atBottom, atTop));
  const to = Math.min(view.xMax, Math.max(atBottom, atTop));
  return to > from ? ((to - from) * Math.hypot(1, m)) / span : 0;
};

/** The distance between two parallel plain lines, in graph units. */
export const parallelGap = (left, right) => {
  if (left.orientation === LINE_ORIENTATION.VERTICAL) return Math.abs(finite(left.x) - finite(right.x));
  if (left.orientation === LINE_ORIENTATION.HORIZONTAL) return Math.abs(finite(left.y) - finite(right.y));
  return Math.abs(finite(left.b) - finite(right.b)) / Math.hypot(1, finite(left.m));
};

/*
 * PLAINLY BETWEEN GRID LINES: both coordinates at least a quarter of a grid
 * square from the nearest whole number and clear of a half (at most 0.4 from
 * the whole number), and the point at least 0.4 of a square from every grid
 * point — inside a grid square, where nobody reads a grid point (a quarter
 * each way, 0.35 from the corner, read as one on a phone), and never on a
 * half, which some would read.
 */
export const BETWEEN_GRID_POINT_CLEARANCE = 0.4;
const offGrid = (value) => {
  const fraction = value - Math.floor(value);
  return Math.min(fraction, 1 - fraction);
};
export const plainlyBetweenGridLines = (point) => {
  const [x, y] = [numberOf(point?.x), numberOf(point?.y)];
  const between = (value) => Number.isFinite(value) && offGrid(value) >= 0.25 - 1e-9 && offGrid(value) <= 0.4 + 1e-9;
  return between(x) && between(y) && Math.hypot(offGrid(x), offGrid(y)) >= BETWEEN_GRID_POINT_CLEARANCE - 1e-9;
};

/* ----------------------------------- words ---------------------------------- */

const MINUS = '−';

/** A plain number as the rush shows one: −4, 2.5, 0 (rushGraphModel.formatCoordinate). */
export const systemNumberText = (value) => {
  const rounded = Math.round(finite(value) * 1000) / 1000;
  if (rounded === 0) return '0';
  const text = String(Math.abs(rounded));
  return rounded < 0 ? `${MINUS}${text}` : text;
};
const pointText = (point) => `(${systemNumberText(point?.x)}, ${systemNumberText(point?.y)})`;

/*
 * The longest an exact crossing may be written, "(−99/13, −98/11)": the round
 * keeps its feedback line's room for one this long (systemsFeedbackLines), so
 * a crossing named in words never wraps a line the room did not hold. The
 * generator issues no crossing longer (systemsGenerator.systemProblems).
 */
export const MAX_CROSSING_TEXT = 16;
const WIDEST_CROSSING = '(−99/13, −98/11)';

/*
 * THE WORDS A QUESTION IS ASKED IN. Easy asks where the two lines intersect;
 * from Standard the same point is "the solution of the system" — at Standard
 * now one way, now the other, so a class hears both; at Challenge always the
 * system's own words (systemsGenerator.mjs picks).
 */
export const SYSTEM_PROMPTS = Object.freeze({
  [SYSTEM_QUESTION.Y_INTERCEPT]: Object.freeze({ id: 'yIntercepts', prompt: 'Find all y-intercepts' }),
  [SYSTEM_QUESTION.X_INTERCEPT]: Object.freeze({ id: 'xIntercepts', prompt: 'Find all x-intercepts' }),
  intersect: Object.freeze({ id: 'intersect', prompt: 'Find where the two lines intersect' }),
  [SYSTEM_QUESTION.SOLUTION]: Object.freeze({ id: 'solution', prompt: 'Find the solution of the system' }),
});

/**
 * Everything a round of these settings can ask, as the prompts its items
 * carry (the round screen keeps the room of the widest: rushSession.promptReserve).
 */
export const systemsPrompts = (config = {}) => {
  const questions = Array.isArray(config?.questions) ? config.questions : [];
  const difficulty = config?.difficulty || 'standard';
  const prompts = [];
  questions.forEach((question) => {
    if (question !== SYSTEM_QUESTION.SOLUTION) {
      if (SYSTEM_PROMPTS[question]) prompts.push(SYSTEM_PROMPTS[question].prompt);
      return;
    }
    if (difficulty !== 'challenge') prompts.push(SYSTEM_PROMPTS.intersect.prompt);
    if (difficulty !== 'easy') prompts.push(SYSTEM_PROMPTS[SYSTEM_QUESTION.SOLUTION].prompt);
  });
  return Object.freeze([...new Set(prompts)]);
};

/*
 * WHAT A STUDENT IS TOLD about the system on screen: what is there, in the
 * system's own words — and never which button is right before they have
 * answered.
 */
const AXIS_WORD = Object.freeze({ [SYSTEM_QUESTION.Y_INTERCEPT]: 'y', [SYSTEM_QUESTION.X_INTERCEPT]: 'x' });

// The press that answers a question (graphFeatureRushRules.rushPressAnswer, for a system).
const pressOf = (question) => question?.answerPress
  || (Array.isArray(question?.targets) && question.targets.length === 0 ? RUSH_ATTEMPT_KIND.DOES_NOT_EXIST : null);

/** A right answer, said: "Correct — (2, −1) is on both lines: the solution." Null where the rush's own words serve. */
export const systemRightWords = (question, { press = null, target = null } = {}) => {
  if (question?.feature === SYSTEM_QUESTION.SOLUTION) {
    if (press === RUSH_ATTEMPT_KIND.DOES_NOT_EXIST) return 'Correct — parallel lines never meet: no solution.';
    if (press === RUSH_ATTEMPT_KIND.INFINITELY_MANY) return 'Correct — the same line: every point on it is a solution.';
    if (press === RUSH_ATTEMPT_KIND.CANNOT_DETERMINE) {
      const at = question.crossingText ? ` at ${question.crossingText}` : '';
      return question.pastEdge
        ? `Correct — they meet${at}, past the edge of the graph.`
        : `Correct — they cross${at}, between grid lines.`;
    }
    return target ? `Correct — ${pointText(target)} is on both lines: the solution.` : 'Correct — that is the solution.';
  }
  if (press === RUSH_ATTEMPT_KIND.DOES_NOT_EXIST) return `Correct — neither line crosses the ${AXIS_WORD[question?.feature] || 'x'}-axis.`;
  return null;
};

/*
 * A WRONG PRESS is asked about what is there — a question back, as Inequality
 * Graphing Rush's hints are — never told the button that is right.
 */
export const systemPressHint = (question, press) => {
  if (question?.feature !== SYSTEM_QUESTION.SOLUTION) return `Look again: does a line cross the ${AXIS_WORD[question?.feature] || 'x'}-axis?`;
  const answer = pressOf(question);
  if (press === RUSH_ATTEMPT_KIND.DOES_NOT_EXIST) {
    if (answer === RUSH_ATTEMPT_KIND.INFINITELY_MANY) return 'Are the two lines apart? Look again.';
    if (question.pastEdge) return 'Are they parallel? Compare the gap between them at each end.';
    return 'Do these lines cross? Look again.';
  }
  if (press === RUSH_ATTEMPT_KIND.INFINITELY_MANY) return 'Is it the same line twice? Look again.';
  if (press === RUSH_ATTEMPT_KIND.CANNOT_DETERMINE) {
    if (answer === RUSH_ATTEMPT_KIND.DOES_NOT_EXIST) return 'Do these lines ever meet?';
    if (answer === RUSH_ATTEMPT_KIND.INFINITELY_MANY) return 'Do they share just one point? Look again.';
    return 'Look again at where they cross.';
  }
  return null;
};

export const SYSTEM_TAP_NOTES = Object.freeze({
  between: 'They cross between grid lines there — can you read that point exactly?',
  bothLines: 'That point is on both lines — and it is not the only one.',
  lineOne: 'That point is on line 1, not line 2.',
  lineTwo: 'That point is on line 2, not line 1.',
});

/**
 * What a wrong tap on a solution question landed on — one line, both (the
 * same line twice), the crossing between grid lines — or null, and the
 * rush's own words then. Measured with the hit test's own reach (`limits`:
 * its clamped tolerance): what is there, never which button is right.
 */
export const systemTapNote = (question, tap, limits) => {
  if (!isSystemsQuestion(question) || question.feature !== SYSTEM_QUESTION.SOLUTION) return null;
  const lines = Array.isArray(question.lines) ? question.lines : [];
  if (lines.length !== 2) return null;
  const lx = finite(limits?.x, 1) || 1;
  const ly = finite(limits?.y, 1) || 1;
  const reach = (point) => Math.hypot((finite(tap?.x) - finite(point.x)) / lx, (finite(tap?.y) - finite(point.y)) / ly);
  if (question.answerPress === RUSH_ATTEMPT_KIND.CANNOT_DETERMINE && question.crossing && !question.pastEdge && reach(question.crossing) <= 1) {
    return SYSTEM_TAP_NOTES.between;
  }
  const on = lines.map((line) => lineDistance(line, tap, limits) <= 1);
  if (plainSameLine(lines[0], lines[1])) return on[0] ? SYSTEM_TAP_NOTES.bothLines : null;
  if (on[0] && !on[1]) return SYSTEM_TAP_NOTES.lineOne;
  if (on[1] && !on[0]) return SYSTEM_TAP_NOTES.lineTwo;
  return null;
};

/** A wrong tap, in the rush's plain words: "Not the solution — try again." */
export const systemMissWords = (question) => {
  if (question?.feature === SYSTEM_QUESTION.SOLUTION) return 'Not the solution — try again.';
  return question?.feature === SYSTEM_QUESTION.Y_INTERCEPT ? 'Not a y-intercept — try again.' : 'Not an x-intercept — try again.';
};

/** The answer, said as the item moves on after its last allowed miss. */
export const systemRevealWords = (question) => {
  const targets = Array.isArray(question?.targets) ? question.targets : [];
  const list = (points) => (points.length < 2 ? points.join('') : `${points.slice(0, -1).join(', ')} and ${points[points.length - 1]}`);
  if (question?.feature === SYSTEM_QUESTION.SOLUTION) {
    const answer = pressOf(question);
    if (answer === RUSH_ATTEMPT_KIND.INFINITELY_MANY) return 'The same line twice: infinitely many solutions. Next graph.';
    if (answer === RUSH_ATTEMPT_KIND.CANNOT_DETERMINE) {
      const at = question.crossingText ? ` at ${question.crossingText}` : '';
      return question.pastEdge
        ? `They meet${at}, past the edge: can't be determined from the graph. Next graph.`
        : `They cross${at}, between grid lines: can't be determined from the graph. Next graph.`;
    }
    if (answer === RUSH_ATTEMPT_KIND.DOES_NOT_EXIST) return 'Parallel lines never meet: no solution. Next graph.';
    return targets.length ? `The solution is ${pointText(targets[0])}. Next graph.` : 'Next graph.';
  }
  const axis = AXIS_WORD[question?.feature] || 'x';
  if (!targets.length) return `Neither line crosses the ${axis}-axis: Does Not Exist. Next graph.`;
  return `The ${axis}-intercept${targets.length === 1 ? ' is' : 's are'} ${list(targets.map(pointText))}. Next graph.`;
};

/*
 * THE LONGEST THINGS A ROUND OF THESE SETTINGS CAN SAY about its systems,
 * with the widest numbers it can deal (no window passes ±10, and an exact
 * crossing is at most MAX_CROSSING_TEXT long): the round screen keeps its
 * feedback line's room for them (rushSession.feedbackReserve), so nothing it
 * says moves the graph. What the round CAN say, never what this graph will.
 */
const WIDE = Object.freeze({ x: -10.5, y: -10.5 });
export const systemsFeedbackLines = (config = {}) => {
  const questions = Array.isArray(config?.questions) ? config.questions : [];
  const kinds = new Set(Array.isArray(config?.kinds) ? config.kinds : []);
  const pastEdge = config?.difficulty === 'challenge' || config?.difficulty === 'mixed';
  const lines = [];
  questions.forEach((feature) => {
    if (feature !== SYSTEM_QUESTION.SOLUTION) {
      lines.push(
        systemRevealWords({ feature, targets: [{ id: 'a', ...WIDE }, { id: 'b', ...WIDE }] }),
        systemRevealWords({ feature, targets: [] }),
        systemRightWords({ feature }, { press: RUSH_ATTEMPT_KIND.DOES_NOT_EXIST }),
        systemPressHint({ feature }, RUSH_ATTEMPT_KIND.DOES_NOT_EXIST),
        systemMissWords({ feature }),
      );
      return;
    }
    const one = { feature, targets: [{ id: 'sol', ...WIDE }] };
    lines.push(systemRightWords(one, { target: WIDE }), systemRevealWords(one), systemMissWords(one), SYSTEM_TAP_NOTES.lineOne, SYSTEM_TAP_NOTES.lineTwo);
    const asked = [one];
    if (kinds.has(SYSTEM_KIND.PARALLEL)) {
      const none = { feature, targets: [] };
      asked.push(none);
      lines.push(systemRightWords(none, { press: RUSH_ATTEMPT_KIND.DOES_NOT_EXIST }), systemRevealWords(none));
    }
    if (kinds.has(SYSTEM_KIND.SAME_LINE)) {
      const same = { feature, targets: [], answerPress: RUSH_ATTEMPT_KIND.INFINITELY_MANY };
      asked.push(same);
      lines.push(systemRightWords(same, { press: RUSH_ATTEMPT_KIND.INFINITELY_MANY }), systemRevealWords(same), SYSTEM_TAP_NOTES.bothLines);
    }
    if (kinds.has(SYSTEM_KIND.CANNOT_DETERMINE)) {
      const between = { feature, targets: [], answerPress: RUSH_ATTEMPT_KIND.CANNOT_DETERMINE, crossingText: WIDEST_CROSSING };
      const variants = pastEdge ? [between, { ...between, pastEdge: true }] : [between];
      asked.push(...variants);
      variants.forEach((question) => lines.push(systemRightWords(question, { press: RUSH_ATTEMPT_KIND.CANNOT_DETERMINE }), systemRevealWords(question)));
      lines.push(SYSTEM_TAP_NOTES.between);
    }
    // Every button the game offers, pressed wrongly on every system it deals.
    systemAnswerButtons(config).forEach((button) => asked.forEach((question) => lines.push(systemPressHint(question, button.press))));
  });
  return Object.freeze([...new Set(lines.filter(Boolean))]);
};

/* ---------------------------------- report ---------------------------------- */

const TAPPED_WORDS = Object.freeze({
  [SYSTEM_QUESTION.Y_INTERCEPT]: 'a y-intercept',
  [SYSTEM_QUESTION.X_INTERCEPT]: 'an x-intercept',
  [SYSTEM_QUESTION.SOLUTION]: 'where the lines cross',
});
const ASKED_WORDS = Object.freeze({
  [SYSTEM_QUESTION.Y_INTERCEPT]: 'the y-intercepts',
  [SYSTEM_QUESTION.X_INTERCEPT]: 'the x-intercepts',
  [SYSTEM_QUESTION.SOLUTION]: 'the solution',
});

/** How the teacher's report names a systems game's rows (graphFeatureRush.buildRushReport). */
export const SYSTEMS_REPORT_LABELS = Object.freeze({
  featureLabel: (id) => systemQuestionLabel(id) || id,
  familyLabel: (id) => systemKindLabel(id) || id,
  mistakeLabel: (id) => id,
  wrongTapLabel: (asked, tapped) => `Tapped ${TAPPED_WORDS[tapped] || tapped} when asked for ${ASKED_WORDS[asked] || asked}`,
});
