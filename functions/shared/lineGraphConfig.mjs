/*
 * GRAPH THE LINE: WHAT A TEACHER CHOOSES.
 *
 * The FORMAT (Classic, Sprint, Rush) is the game mode itself — each format
 * is its own registered mode, with its own round limits — and is never read
 * from a request's settings. Everything else here shapes the questions:
 *
 *   itemTypes      Graph it (equation → line), Name it (line → equation), or both
 *   forms          slope-intercept, standard (graphed by its intercepts),
 *                  point-slope — at least one
 *   specialLines   also horizontal and vertical lines (y = k, x = h)
 *   difficulty     easy | standard | challenge | mixed (ramps up)
 *   nameStyle      how Name it is answered: choose one of four, or build it
 *                  in the boxes of a form
 *   triesPerItem   wrong checks before the line is shown: 1, 2, 3 or 0 (until
 *                  right, with the auto-skip)
 *   sprintLength   graphs in a Sprint round: 5, 10, 15 or 20
 *   sameEquations  everyone gets the same equations (in their own order, for
 *                  Sprint and Rush) — Classic's default, so the class can
 *                  talk about one line
 *   showMethod     a line counts only through its key points: the
 *                  y-intercept, both intercepts, the point in the equation
 *   slopeHelper    show "up 2, right 3" while placing the second point
 *
 * Course names are not part of validation: a preset is a starting point a
 * teacher changes, not a rule. Pure and light — no generator — so the mode
 * registry and the teacher's setup screen carry it.
 */

import { LINE_FORM, LINE_FORM_IDS, LINE_FORM_LABELS } from './lineGraphForms.mjs';
import {
  DEFAULT_LINE_TRIES,
  LINE_GRAPH_FORMAT,
  LINE_GRAPH_FORMAT_IDS,
  LINE_ITEM_TYPE,
  LINE_ITEM_TYPE_IDS,
  LINE_TRIES_OPTIONS,
} from './lineGraphRules.mjs';

export class LineGraphConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LineGraphConfigError';
  }
}

export const LINE_TIER = Object.freeze({
  EASY: 'easy',
  STANDARD: 'standard',
  CHALLENGE: 'challenge',
});

export const LINE_TIER_ORDER = Object.freeze([LINE_TIER.EASY, LINE_TIER.STANDARD, LINE_TIER.CHALLENGE]);

export const LINE_DIFFICULTY = Object.freeze({ ...LINE_TIER, MIXED: 'mixed' });

export const LINE_DIFFICULTY_OPTIONS = Object.freeze([
  Object.freeze({ id: LINE_DIFFICULTY.EASY, label: 'Easy', description: 'Whole-number slopes and intercepts on a bigger grid.' }),
  Object.freeze({ id: LINE_DIFFICULTY.STANDARD, label: 'Standard', description: 'Fraction slopes, negative points, sign traps like y + 3 = −2(x − 4).' }),
  Object.freeze({ id: LINE_DIFFICULTY.CHALLENGE, label: 'Challenge', description: 'Rearranged and unreduced equations, decimals, lines through the origin, intercepts off the grid.' }),
  Object.freeze({ id: LINE_DIFFICULTY.MIXED, label: 'Mixed', description: 'Starts easy, then mixes Standard and Challenge.' }),
]);

const DIFFICULTIES = new Set(Object.values(LINE_DIFFICULTY));

/** The tiers a difficulty draws from. */
export const lineDifficultyTiers = (difficulty) => (difficulty === LINE_DIFFICULTY.MIXED ? [...LINE_TIER_ORDER] : [difficulty]);

export const LINE_FORMAT_OPTIONS = Object.freeze([
  Object.freeze({
    id: LINE_GRAPH_FORMAT.CLASSIC,
    label: 'Classic',
    description: 'One graph a round. Everyone graphs the same equation, then the class sees the line.',
  }),
  Object.freeze({
    id: LINE_GRAPH_FORMAT.SPRINT,
    label: 'Sprint',
    description: 'A set of graphs in a row. Most right, then fewest misses, then fastest finish.',
  }),
  Object.freeze({
    id: LINE_GRAPH_FORMAT.RUSH,
    label: 'Rush',
    description: 'As many graphs as you can before the clock runs out.',
  }),
]);

export const LINE_NAME_STYLE = Object.freeze({
  CHOICE: 'choice',
  BUILD: 'build',
});

export const LINE_NAME_STYLE_OPTIONS = Object.freeze([
  Object.freeze({ id: LINE_NAME_STYLE.CHOICE, label: 'Choose from 4', description: 'Tap the matching equation. One try; the wrong options are common mistakes.' }),
  Object.freeze({ id: LINE_NAME_STYLE.BUILD, label: 'Build it', description: 'Fill in the form (y = □x + □) and press Enter.' }),
]);

export const LINE_ITEM_TYPE_OPTIONS = Object.freeze([
  Object.freeze({ id: LINE_ITEM_TYPE.GRAPH, label: 'Graph it', description: 'See an equation, draw its line.' }),
  Object.freeze({ id: LINE_ITEM_TYPE.NAME, label: 'Name it', description: 'See a line, name its equation.' }),
]);

export const LINE_FORM_OPTIONS = Object.freeze(LINE_FORM_IDS.map((id) => Object.freeze({ id, label: LINE_FORM_LABELS[id] })));

export const LINE_SPRINT_LENGTHS = Object.freeze([5, 10, 15, 20]);
export const DEFAULT_SPRINT_LENGTH = 10;

/*
 * A Rush round offers more graphs than anyone finishes (the engine's
 * MAX_QUESTIONS_PER_ROUND; a test holds the two equal), a Classic round one,
 * a Sprint round its length — so a Sprint round is over for a student who
 * has worked through it, and closes early once everyone has.
 */
export const LINE_RUSH_POOL = 150;
export const LINE_SPRINT_MAX_POOL = Math.max(...LINE_SPRINT_LENGTHS);

export const lineRoundQuestionCount = (format, config = {}) => {
  if (format === LINE_GRAPH_FORMAT.CLASSIC) return 1;
  if (format === LINE_GRAPH_FORMAT.SPRINT) {
    const length = Number(config?.sprintLength);
    return LINE_SPRINT_LENGTHS.includes(length) ? length : DEFAULT_SPRINT_LENGTH;
  }
  return LINE_RUSH_POOL;
};

/*
 * ROUNDS AND SECONDS, per format. A Classic round is one line (a careful
 * student needs 10–30 seconds), a Sprint round must hold its whole set, and
 * a Rush round is the rush's own.
 */
export const LINE_ROUND_LIMITS = Object.freeze({
  [LINE_GRAPH_FORMAT.CLASSIC]: Object.freeze({
    minRounds: 3,
    maxRounds: 20,
    defaultRounds: 8,
    minSeconds: 20,
    maxSeconds: 120,
    defaultSeconds: 45,
    secondsOptions: Object.freeze([20, 30, 45, 60, 90, 120]),
  }),
  [LINE_GRAPH_FORMAT.SPRINT]: Object.freeze({
    minRounds: 1,
    maxRounds: 5,
    defaultRounds: 2,
    minSeconds: 60,
    maxSeconds: 300,
    defaultSeconds: 180,
    secondsOptions: Object.freeze([60, 90, 120, 180, 240, 300]),
  }),
  [LINE_GRAPH_FORMAT.RUSH]: Object.freeze({
    minRounds: 1,
    maxRounds: 8,
    defaultRounds: 3,
    minSeconds: 30,
    maxSeconds: 120,
    defaultSeconds: 60,
    secondsOptions: Object.freeze([30, 45, 60, 90, 120]),
  }),
});

// About 12 seconds a graph, rounded to an offered time.
const SPRINT_SECONDS = Object.freeze({ 5: 120, 10: 180, 15: 240, 20: 300 });

/** The round length a setup screen suggests for a format and its settings. */
export const suggestedLineRoundSeconds = (format, config = {}) => (format === LINE_GRAPH_FORMAT.SPRINT
  ? SPRINT_SECONDS[lineRoundQuestionCount(format, config)]
  : LINE_ROUND_LIMITS[format]?.defaultSeconds ?? LINE_ROUND_LIMITS[LINE_GRAPH_FORMAT.RUSH].defaultSeconds);

/*
 * PRESETS: what the questions are about. A preset never sets the format —
 * any preset plays as Classic, Sprint or Rush.
 */
export const LINE_GRAPH_PRESETS = Object.freeze([
  Object.freeze({
    id: 'slopeInterceptStart',
    label: 'Slope-intercept start',
    description: 'Graph y = mx + b with whole-number slopes.',
    itemTypes: Object.freeze([LINE_ITEM_TYPE.GRAPH]),
    forms: Object.freeze([LINE_FORM.SLOPE_INTERCEPT]),
    specialLines: false,
    difficulty: LINE_DIFFICULTY.EASY,
  }),
  Object.freeze({
    id: 'standardIntercepts',
    label: 'Graph by intercepts',
    description: 'Standard form, Ax + By = C: find both intercepts and connect them.',
    itemTypes: Object.freeze([LINE_ITEM_TYPE.GRAPH]),
    forms: Object.freeze([LINE_FORM.STANDARD]),
    specialLines: false,
    difficulty: LINE_DIFFICULTY.STANDARD,
  }),
  Object.freeze({
    id: 'pointSlopeSigns',
    label: 'Point-slope signs',
    description: 'y − y₁ = m(x − x₁), with the sign traps of negative points.',
    itemTypes: Object.freeze([LINE_ITEM_TYPE.GRAPH]),
    forms: Object.freeze([LINE_FORM.POINT_SLOPE]),
    specialLines: false,
    difficulty: LINE_DIFFICULTY.STANDARD,
  }),
  Object.freeze({
    id: 'allThreeForms',
    label: 'All three forms',
    description: 'Slope-intercept, standard and point-slope, mixed.',
    itemTypes: Object.freeze([LINE_ITEM_TYPE.GRAPH]),
    forms: Object.freeze([...LINE_FORM_IDS]),
    specialLines: false,
    difficulty: LINE_DIFFICULTY.STANDARD,
  }),
  Object.freeze({
    id: 'graphAndName',
    label: 'Graph it and name it',
    description: 'All three forms, both directions: draw lines and name them.',
    itemTypes: Object.freeze([...LINE_ITEM_TYPE_IDS]),
    forms: Object.freeze([...LINE_FORM_IDS]),
    specialLines: false,
    difficulty: LINE_DIFFICULTY.STANDARD,
  }),
  Object.freeze({
    id: 'unitReview',
    label: 'Unit review',
    description: 'Everything, horizontal and vertical lines included, ramping from Easy to Challenge.',
    itemTypes: Object.freeze([...LINE_ITEM_TYPE_IDS]),
    forms: Object.freeze([...LINE_FORM_IDS]),
    specialLines: true,
    difficulty: LINE_DIFFICULTY.MIXED,
  }),
]);

export const getLineGraphPreset = (id) => LINE_GRAPH_PRESETS.find((preset) => preset.id === id) || null;

/** The preset a class of this course starts from. */
export const defaultLineGraphPresetFor = (courseId) => (
  courseId === 'algebra2' ? getLineGraphPreset('graphAndName') : getLineGraphPreset('allThreeForms')
);

const listOf = (raw, allowed) => [...new Set((Array.isArray(raw) ? raw : []).map(String))]
  .filter((entry) => allowed.includes(entry))
  // Canonical order, so equal configs compare equal.
  .sort((left, right) => allowed.indexOf(left) - allowed.indexOf(right));

const booleanOr = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/**
 * The validated question settings for a room of `format`. Throws
 * LineGraphConfigError with a sentence a teacher can act on.
 */
export const normalizeLineGraphConfig = (raw = {}, { format = LINE_GRAPH_FORMAT.RUSH } = {}) => {
  if (!LINE_GRAPH_FORMAT_IDS.includes(format)) throw new LineGraphConfigError('Choose Classic, Sprint or Rush.');
  const source = raw && typeof raw === 'object' ? raw : {};
  const preset = getLineGraphPreset(source.presetId);
  const itemTypes = listOf(source.itemTypes ?? preset?.itemTypes ?? [LINE_ITEM_TYPE.GRAPH], LINE_ITEM_TYPE_IDS);
  const forms = listOf(source.forms ?? preset?.forms ?? LINE_FORM_IDS, LINE_FORM_IDS);
  const difficulty = DIFFICULTIES.has(source.difficulty) ? source.difficulty : (preset?.difficulty || LINE_DIFFICULTY.STANDARD);
  const specialLines = booleanOr(source.specialLines, preset?.specialLines ?? false);
  if (!itemTypes.length) throw new LineGraphConfigError('Choose Graph it, Name it, or both.');
  if (!forms.length) throw new LineGraphConfigError('Choose at least one form of equation.');

  const tries = Math.floor(Number(source.triesPerItem));
  const triesPerItem = LINE_TRIES_OPTIONS.includes(tries) ? tries : DEFAULT_LINE_TRIES;
  const nameStyle = Object.values(LINE_NAME_STYLE).includes(source.nameStyle) ? source.nameStyle : LINE_NAME_STYLE.CHOICE;
  const length = Number(source.sprintLength);
  const sprintLength = format === LINE_GRAPH_FORMAT.SPRINT
    ? (LINE_SPRINT_LENGTHS.includes(length) ? length : DEFAULT_SPRINT_LENGTH)
    : null;

  // The preset is remembered only while the settings still match it.
  const matchesPreset = preset
    && preset.difficulty === difficulty
    && preset.specialLines === specialLines
    && listOf(preset.itemTypes, LINE_ITEM_TYPE_IDS).join() === itemTypes.join()
    && listOf(preset.forms, LINE_FORM_IDS).join() === forms.join();

  return Object.freeze({
    format,
    presetId: matchesPreset ? preset.id : 'custom',
    itemTypes: Object.freeze(itemTypes),
    forms: Object.freeze(forms),
    specialLines,
    difficulty,
    nameStyle,
    triesPerItem,
    sprintLength,
    sameEquations: booleanOr(source.sameEquations, format === LINE_GRAPH_FORMAT.CLASSIC),
    showMethod: booleanOr(source.showMethod, false),
    slopeHelper: booleanOr(source.slopeHelper, difficulty === LINE_DIFFICULTY.EASY),
  });
};

/** The teacher-facing problem with a config, or null (for a setup screen's button). */
export const lineGraphConfigProblem = (raw, { format = LINE_GRAPH_FORMAT.RUSH } = {}) => {
  try {
    normalizeLineGraphConfig(raw, { format });
    return null;
  } catch (error) {
    if (error instanceof LineGraphConfigError) return error.message;
    throw error;
  }
};
