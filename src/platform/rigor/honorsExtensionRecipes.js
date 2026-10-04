/*
 * DETERMINISTIC (NO-AI) HONORS EXTENSIONS COME ONLY FROM VETTED RECIPES.
 *
 * "Add built-in Honors extension (no AI)" used to write one generic
 * free-response question for any assignment: a graphStory labelled with the
 * DESTINATION class's course ("Algebra II Honors extension"), telling the
 * student to make a graph it never drew, graded by character counts. An
 * Algebra I linear.multipleRepresentations lesson received exactly that in
 * production; it could not be self-graded and could not pass Pre-Flight.
 *
 * A deterministic extension now has to be earned by a RECIPE: a vetted,
 * versioned, data-only description of one Honors task for one concept. A
 * recipe declares
 *
 *   anchor            the question family it extends (linear.multipleRepresentations)
 *   supportedCourses  the courses it is written for (checked against the
 *                     assignment's course AND the anchor questions' own TEKS)
 *   target            the existing rich family + tool that builds and grades it
 *   rigor             DOK and difficulty above the lesson's, and how
 *   selfGraded        always true: the target tool's own grader marks it
 *   version           so a stored extension can tell it is out of date
 *
 * and the question it builds is an ordinary family-backed slot on that
 * existing tool: one version per student, server-graded, Recovery-ready. When
 * no recipe fits the assignment's concept and course, the answer is a
 * structured "unavailable" result with NO question — never a free-response
 * substitute — and the caller leaves the assignment unchanged.
 *
 * The course an extension is written for is the ASSIGNMENT's, never the
 * destination class profile's: the extension extends the mathematics the
 * assignment teaches. A disagreeing profile is reported, not obeyed.
 *
 * Pure and deterministic: no AI, no clock, no randomness, no Firestore.
 */
import { allocateQuestionValue } from '../../../functions/shared/questionValue.mjs';
import { resolveFamilyConstraints } from '../../../functions/shared/questionFamilyContract.mjs';
import { getPlatformQuestionFamily } from '../../../functions/shared/questionFamilyRegistry.mjs';
import { validateAssignmentQuestions } from '../../assignmentBlueprint.js';
import { validateQuestionSemantics } from '../contract/semanticValidation.js';
import { auditQuestionToolContract } from '../contract/questionToolContract.js';
import { validateAlignments } from '../contract/alignments.js';
import { honorsUnavailableReason } from './honorsRecipeBacklog.js';

export const HONORS_EXTENSION_CONTRACT_VERSION = 2;
export const DETERMINISTIC_HONORS_SOURCE = 'deterministic-policy';

export const HONORS_RECIPE_STATUS = Object.freeze({ READY: 'ready', UNAVAILABLE: 'unavailable' });

export const HONORS_RECIPE_UNAVAILABLE = Object.freeze({
  NO_ANCHOR: 'no-anchor-concept',
  NO_VETTED_RECIPE: 'no-vetted-recipe',
  COURSE_UNKNOWN: 'course-unknown',
  COURSE_NOT_SUPPORTED: 'course-not-supported',
  COURSE_CONFLICT: 'course-conflict',
  STORIES_EXHAUSTED: 'stories-exhausted',
  AMBIGUOUS: 'recipe-selection-ambiguous',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const clone = (value) => JSON.parse(JSON.stringify(value));
const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

/* ---------------------------------------------------------------------------
 * Courses — strict. Anything MathMaster cannot name is unknown, never a
 * default: normalizeCourseId() maps "geometry" to Algebra I, which is exactly
 * the kind of guess that let the wrong course reach a question.
 * ------------------------------------------------------------------------- */

const COURSE_ALIASES = Object.freeze({
  algebra1: 'algebra1', alg1: 'algebra1', a1: 'algebra1', algebrai: 'algebra1',
  algebra2: 'algebra2', alg2: 'algebra2', a2: 'algebra2', algebraii: 'algebra2',
});
export const HONORS_COURSE_LABELS = Object.freeze({ algebra1: 'Algebra I', algebra2: 'Algebra II' });

export const strictCourseId = (value) => COURSE_ALIASES[clean(value).toLowerCase().replace(/[^a-z0-9]/g, '')] || null;

const courseOfTeksCode = (code) => {
  const value = clean(code).toUpperCase();
  if (/^(?:A2|2A)[.\s:-]/.test(value)) return 'algebra2';
  if (/^A[.\s:-]/.test(value)) return 'algebra1';
  return null;
};

const teksCodesOf = (question = {}) => {
  const aligned = (Array.isArray(question.alignments) ? question.alignments : [])
    .filter((entry) => isObject(entry) && clean(entry.framework || 'teks').toLowerCase() === 'teks' && clean(entry.code))
    .map((entry) => clean(entry.code));
  const loose = [question.standard, question.primaryStandard, ...(Array.isArray(question.teks) ? question.teks : [question.teks])]
    .map((entry) => (isObject(entry) ? clean(entry.code) : clean(entry)))
    .filter(Boolean);
  return [...new Set([...aligned, ...loose])];
};

/* ---------------------------------------------------------------------------
 * Which questions are Honors extensions, and which kind.
 * ------------------------------------------------------------------------- */

const LEGACY_FAMILY = /^honors-modeling-/;

/** Never an anchor, never part of the lesson's concept: it extends the lesson. */
const isHonorsExtensionQuestion = (question = {}) => (
  isObject(question?.honorsEnrichment) || LEGACY_FAMILY.test(clean(question?.familyId))
);

/* ---------------------------------------------------------------------------
 * The anchor: the concept the assignment actually teaches.
 * ------------------------------------------------------------------------- */

// A static (non-family) question that is unmistakably one family's work names
// that family, so a hand-authored board anchors the same way a family slot does.
const CONCEPT_ALIASES = Object.freeze([
  Object.freeze({
    familyId: 'linear.multipleRepresentations',
    matches: (question) => clean(question?.toolId || question?.type) === 'representationBridge'
      && clean(question?.mode) === 'linearMultipleRepresentations',
  }),
  // The linear card sort, authored by hand rather than drawn from the family.
  Object.freeze({
    familyId: 'linear.representationSort',
    matches: (question) => clean(question?.toolId || question?.type) === 'representationMatch'
      && clean(question?.mode) === 'linearConnections',
  }),
]);

const familyIdOf = (question = {}) => {
  const declared = clean(question?.questionFamily?.id || question?.questionFamily?.familyId);
  if (declared) return declared;
  return CONCEPT_ALIASES.find((alias) => alias.matches(question))?.familyId || null;
};

const conceptKeyOf = (question = {}) => {
  const familyId = familyIdOf(question);
  if (familyId) return familyId;
  const type = clean(question?.toolId || question?.type);
  if (!type) return null;
  return `tool:${type}${clean(question?.mode) ? `/${clean(question.mode)}` : ''}`;
};

const isExamStyle = (question = {}) => question?.assessmentContext?.examStyle === true;
const roleOf = (question = {}) => clean(question?.activityRole || question?.role).toLowerCase();
// Warm-ups usually review an earlier concept; the lesson's own concept is
// taught and checked in the sections below them.
const CORE_ROLES = new Set(['classwork', 'practice', 'dol', 'quiz', 'test']);

/**
 * The assignment's core concept: the family (or tool) most of its delivered,
 * non-Honors, non-exam questions use, counted over the core sections, with the
 * first to appear winning a tie. Returns null when there is nothing to anchor on.
 */
export const resolveHonorsAnchor = (questions = []) => {
  const candidates = (Array.isArray(questions) ? questions : [])
    .filter((question) => isObject(question) && question.teacherExcluded !== true)
    .filter((question) => !isHonorsExtensionQuestion(question) && !isExamStyle(question))
    .filter((question) => conceptKeyOf(question));
  const core = candidates.filter((question) => CORE_ROLES.has(roleOf(question)));
  const pool = core.length ? core : candidates;
  if (!pool.length) return null;

  const tally = new Map();
  pool.forEach((question, order) => {
    const key = conceptKeyOf(question);
    const entry = tally.get(key) || { key, count: 0, order, questions: [] };
    entry.count += 1;
    entry.questions.push(question);
    tally.set(key, entry);
  });
  const [best] = [...tally.values()].sort((left, right) => right.count - left.count || left.order - right.order);
  const teksCourses = new Set(best.questions.flatMap(teksCodesOf).map(courseOfTeksCode).filter(Boolean));
  return {
    conceptKey: best.key,
    familyId: familyIdOf(best.questions[0]),
    questionId: clean(best.questions[0]?.questionId) || null,
    count: best.count,
    teksCourses: [...teksCourses].sort(),
  };
};

/* ---------------------------------------------------------------------------
 * Recipes.
 * ------------------------------------------------------------------------- */

const recipeProblem = (id, message) => {
  throw new Error(`Honors recipe ${id || '(unnamed)'}: ${message}`);
};

// Fields that grade by length or by a person. An Honors extension is marked by
// its tool's own grader; a recipe that carries any of these is refused.
const NON_TOOL_GRADING_FIELDS = Object.freeze([
  'minimumScenarioCharacters', 'minimumExplanationCharacters', 'minimumCharacters', 'minimumWords',
  'rubric', 'manualScoring', 'teacherScored', 'requiresTeacherScoring',
]);

/**
 * Validate and freeze a recipe. A recipe that cannot prove what it extends,
 * whom it serves, what builds and grades it, how it is harder, and that it is
 * self-graded never enters the registry.
 *
 * Proven at definition time, against the live Question Family registry:
 *   - every anchor is a registered family, and the lesson baseline the recipe
 *     claims is not below what that family itself declares (no recipe can make
 *     its increase look larger by understating the lesson);
 *   - the target is a registered family VERSION whose tools include the
 *     target tool, and every constraint is one that family accepts as written
 *     (a misspelled or out-of-range knob would silently fall back to a
 *     default and build a different, easier task);
 *   - the Honors DOK and band exceed both the lesson baseline and the target
 *     family's own declared difficulty;
 *   - no field that grades by length or needs a teacher to score;
 *   - `delivery` declares what certification must then demonstrate:
 *     serverGraded (always), perStudentVersions and recoveryReady.
 */
export const defineHonorsRecipe = (spec = {}) => {
  const id = clean(spec.id);
  if (!/^honors\.[A-Za-z0-9.]+$/.test(id)) recipeProblem(id, 'ids are dotted and start with "honors.".');
  if (!Number.isInteger(spec.version) || spec.version < 1) recipeProblem(id, '`version` must be a positive integer.');
  const familyIds = Array.isArray(spec.anchor?.familyIds) ? spec.anchor.familyIds.map(clean).filter(Boolean) : [];
  if (!familyIds.length) recipeProblem(id, 'an anchor question family is required.');
  const courses = Array.isArray(spec.supportedCourses) ? spec.supportedCourses.map(strictCourseId) : [];
  if (!courses.length || courses.some((course) => !course)) recipeProblem(id, 'at least one supported course, each Algebra I or Algebra II, is required.');
  const target = spec.target || {};
  if (!clean(target.familyId) || !Number.isInteger(target.familyVersion) || !clean(target.toolId)) {
    recipeProblem(id, 'a target family, family version and tool are required.');
  }
  const rigor = spec.rigor || {};
  if (!(Number(rigor.dok) > Number(rigor.baseline?.dok))) recipeProblem(id, 'its DOK must be above the lesson baseline.');
  if (!(Number(rigor.difficultyBand) > Number(rigor.baseline?.difficultyBand))) recipeProblem(id, 'its difficulty band must be above the lesson baseline.');
  if (!Array.isArray(rigor.increases) || !rigor.increases.length) recipeProblem(id, 'it must say how it raises rigor.');
  if (spec.selfGraded !== true) recipeProblem(id, 'a deterministic Honors extension must be self-graded by its tool.');
  if (!Array.isArray(spec.stories) || !spec.stories.length || spec.stories.some((story) => !clean(story?.id))) {
    recipeProblem(id, 'at least one story with an id is required.');
  }
  if (new Set(spec.stories.map((story) => clean(story.id))).size !== spec.stories.length) recipeProblem(id, 'story ids must be different.');
  if (!clean(spec.question?.prompt)) recipeProblem(id, 'a student prompt is required.');

  familyIds.forEach((familyId) => {
    const anchorFamily = getPlatformQuestionFamily(familyId);
    if (!anchorFamily) recipeProblem(id, `its anchor "${familyId}" is not a registered Question Family.`);
    if (Number(rigor.baseline.dok) < anchorFamily.difficulty.dok || Number(rigor.baseline.difficultyBand) < anchorFamily.difficulty.band) {
      recipeProblem(id, `its lesson baseline (DOK ${rigor.baseline.dok}, band ${rigor.baseline.difficultyBand}) is below what ${familyId} itself declares (DOK ${anchorFamily.difficulty.dok}, band ${anchorFamily.difficulty.band}).`);
    }
  });
  const targetFamily = getPlatformQuestionFamily(target.familyId, target.familyVersion);
  if (!targetFamily || targetFamily.version !== target.familyVersion) {
    recipeProblem(id, `its target ${target.familyId} v${target.familyVersion} is not a registered Question Family version.`);
  }
  if (!targetFamily.tools[clean(target.toolId)]) recipeProblem(id, `${targetFamily.id} cannot fill the ${target.toolId} tool.`);
  const constraintIssues = resolveFamilyConstraints(targetFamily, isObject(target.constraints) ? target.constraints : {}).issues;
  if (constraintIssues.length) {
    recipeProblem(id, `${targetFamily.id} does not accept its constraints as written (${constraintIssues.map((issue) => `${issue.constraint}: ${issue.code}`).join('; ')}).`);
  }
  if (Number(rigor.dok) < targetFamily.difficulty.dok || Number(rigor.difficultyBand) < targetFamily.difficulty.band) {
    recipeProblem(id, `its Honors rigor is below what ${targetFamily.id} itself declares.`);
  }
  const graders = [spec.question, ...spec.stories].flatMap((part) => NON_TOOL_GRADING_FIELDS.filter((field) => isObject(part) && field in part));
  if (graders.length) recipeProblem(id, `it carries ${[...new Set(graders)].join(', ')}, which is not how an Honors extension is graded.`);
  // The TEKS a recipe's question claims must be TEKS of a course it is written
  // for: an "Algebra II" recipe carrying Algebra I standards is the leak the
  // course checks exist to stop.
  const claimedCourses = [spec.question.standard, ...(Array.isArray(spec.question.alignments) ? spec.question.alignments.map((entry) => entry?.code) : [])]
    .map(courseOfTeksCode).filter(Boolean);
  if (!claimedCourses.length) recipeProblem(id, 'its question must be aligned to at least one Algebra I or Algebra II TEKS.');
  if (claimedCourses.some((course) => !courses.includes(course))) {
    recipeProblem(id, `its TEKS alignments belong to ${[...new Set(claimedCourses)].map((course) => HONORS_COURSE_LABELS[course]).join(' and ')}, but it is written for ${courses.map((course) => HONORS_COURSE_LABELS[course]).join(' and ')}.`);
  }
  if (spec.question.requiredCards !== undefined
    && (!Array.isArray(spec.question.requiredCards) || !spec.question.requiredCards.length || spec.question.requiredCards.some((card) => !clean(card)))) {
    recipeProblem(id, '`question.requiredCards`, when present, lists at least one card.');
  }
  const delivery = spec.delivery || {};
  if (delivery.serverGraded !== true) recipeProblem(id, '`delivery.serverGraded` must be true: the server marks every version.');
  if (typeof delivery.perStudentVersions !== 'boolean' || typeof delivery.recoveryReady !== 'boolean') {
    recipeProblem(id, '`delivery` must declare perStudentVersions and recoveryReady.');
  }
  if (spec.selection !== undefined && !Number.isInteger(spec.selection?.priority)) {
    recipeProblem(id, '`selection.priority`, when present, is an integer.');
  }
  return deepFreeze({
    ...clone(spec),
    id,
    anchor: { ...clone(spec.anchor), familyIds },
    supportedCourses: courses,
  });
};

const TANK_CONTEXT = {
  independentQuantity: {
    value: 'time since the tank started draining (minutes)',
    choices: ['time since the tank started draining (minutes)', 'water in the tank (liters)', 'liters drained every {{per}} minutes'],
  },
  dependentQuantity: {
    value: 'water in the tank (liters)',
    choices: ['time since the tank started draining (minutes)', 'water in the tank (liters)', 'liters drained every {{per}} minutes'],
  },
  slopeMeaning: {
    value: 'The tank loses {{unitRate}} liters of water each minute.',
    choices: [
      'The tank loses {{unitRate}} liters of water each minute.',
      'The tank loses {{rate}} liters of water each minute.',
      'The tank loses {{inverseRate}} liters of water each minute.',
      'The tank gains {{unitRate}} liters of water each minute.',
    ],
  },
  yInterceptMeaning: {
    value: 'The tank held {{start}} liters when it started draining.',
    choices: [
      'The tank held {{start}} liters when it started draining.',
      'The tank held {{readAmount}} liters when it started draining.',
      'The tank is empty after {{start}} minutes.',
      'The tank loses {{start}} liters every {{per}} minutes.',
    ],
  },
  xInterceptMeaning: {
    value: 'The tank is empty {{end}} minutes after it started draining.',
    choices: [
      'The tank is empty {{end}} minutes after it started draining.',
      'The tank is empty {{remaining}} minutes after it started draining.',
      'The tank held {{end}} liters when it started draining.',
      'The tank loses {{end}} liters of water each minute.',
    ],
  },
  domain: {
    min: 0,
    max: '{{end}}',
    value: '0 ≤ x ≤ {{end}}',
    choices: ['0 ≤ x ≤ {{end}}', '0 ≤ x ≤ {{start}}', '{{readTime}} ≤ x ≤ {{end}}', 'x ≥ 0'],
  },
};

const BATTERY_CONTEXT = {
  independentQuantity: {
    value: 'time since the video started (minutes)',
    choices: ['time since the video started (minutes)', 'battery charge (percent)', 'percentage points lost every {{per}} minutes'],
  },
  dependentQuantity: {
    value: 'battery charge (percent)',
    choices: ['time since the video started (minutes)', 'battery charge (percent)', 'percentage points lost every {{per}} minutes'],
  },
  slopeMeaning: {
    value: 'The battery charge drops {{unitRate}} percentage points each minute.',
    choices: [
      'The battery charge drops {{unitRate}} percentage points each minute.',
      'The battery charge drops {{rate}} percentage points each minute.',
      'The battery charge drops {{inverseRate}} percentage points each minute.',
      'The battery charge rises {{unitRate}} percentage points each minute.',
    ],
  },
  yInterceptMeaning: {
    value: 'The battery was at {{start}}% when the video started.',
    choices: [
      'The battery was at {{start}}% when the video started.',
      'The battery was at {{readAmount}}% when the video started.',
      'The battery runs out {{start}} minutes after the video starts.',
      'The battery drops {{start}} percentage points every {{per}} minutes.',
    ],
  },
  xInterceptMeaning: {
    value: 'The battery reaches 0% {{end}} minutes after the video started.',
    choices: [
      'The battery reaches 0% {{end}} minutes after the video started.',
      'The battery reaches 0% {{remaining}} minutes after the video started.',
      'The battery was at {{end}}% when the video started.',
      'The battery charge drops {{end}} percentage points each minute.',
    ],
  },
  domain: {
    min: 0,
    max: '{{end}}',
    value: '0 ≤ x ≤ {{end}}',
    choices: ['0 ≤ x ≤ {{end}}', '0 ≤ x ≤ {{start}}', '{{readTime}} ≤ x ≤ {{end}}', 'x ≥ 0'],
  },
};

const CANDLE_CONTEXT = {
  independentQuantity: {
    value: 'time since the candle was lit (hours)',
    choices: ['time since the candle was lit (hours)', 'height of the candle (centimeters)', 'centimeters burned every {{per}} hours'],
  },
  dependentQuantity: {
    value: 'height of the candle (centimeters)',
    choices: ['time since the candle was lit (hours)', 'height of the candle (centimeters)', 'centimeters burned every {{per}} hours'],
  },
  slopeMeaning: {
    value: 'The candle gets {{unitRate}} centimeters shorter each hour.',
    choices: [
      'The candle gets {{unitRate}} centimeters shorter each hour.',
      'The candle gets {{rate}} centimeters shorter each hour.',
      'The candle gets {{inverseRate}} centimeters shorter each hour.',
      'The candle gets {{unitRate}} centimeters taller each hour.',
    ],
  },
  yInterceptMeaning: {
    value: 'The candle was {{start}} centimeters tall when it was lit.',
    choices: [
      'The candle was {{start}} centimeters tall when it was lit.',
      'The candle was {{readAmount}} centimeters tall when it was lit.',
      'The candle burns out {{start}} hours after it is lit.',
      'The candle gets {{start}} centimeters shorter every {{per}} hours.',
    ],
  },
  xInterceptMeaning: {
    value: 'The candle is completely gone {{end}} hours after it was lit.',
    choices: [
      'The candle is completely gone {{end}} hours after it was lit.',
      'The candle is completely gone {{remaining}} hours after it was lit.',
      'The candle was {{end}} centimeters tall when it was lit.',
      'The candle gets {{end}} centimeters shorter each hour.',
    ],
  },
  domain: {
    min: 0,
    max: '{{end}}',
    value: '0 ≤ x ≤ {{end}}',
    choices: ['0 ≤ x ≤ {{end}}', '0 ≤ x ≤ {{start}}', '{{readTime}} ≤ x ≤ {{end}}', 'x ≥ 0'],
  },
};

/**
 * linear.multipleRepresentations → the same board, at Honors depth.
 *
 * The lesson's boards (DOK 2, band 2) hand the student a line and ask for the
 * rest of it. Here the story states a negative FRACTIONAL rate and one later
 * reading — never the starting amount — so the y-intercept must be recovered
 * (27 + (3/2)·6 = 36), the x-intercept follows from it, and every context
 * choice is set against a real error: the inverted rate, the reading taken
 * for the start, time measured from the reading, a domain that never ends.
 * No writing is added; the depth is mathematical.
 */
const LINEAR_MR_RATE_FROM_READING = defineHonorsRecipe({
  id: 'honors.linear.multipleRepresentations.rateFromReading',
  version: 1,
  title: 'Recover the starting amount from a fractional rate and a later reading',
  anchor: { familyIds: ['linear.multipleRepresentations'] },
  supportedCourses: ['algebra1'],
  target: {
    familyId: 'linear.multipleRepresentations',
    familyVersion: 1,
    toolId: 'representationBridge',
    mode: 'linearMultipleRepresentations',
    constraints: {
      given: 'scenario',
      scenarioStart: 'fromReading',
      slope: 'fraction',
      rateRange: [2, 7],
      denominatorRange: [2, 4],
      startRange: [12, 48],
      durationRange: [6, 30],
    },
  },
  rigor: {
    dok: 3,
    difficultyBand: 4,
    baseline: { dok: 2, difficultyBand: 2 },
    increases: [
      'a negative, genuinely fractional rate of change, stated per several units of time',
      'a y-intercept that is never stated: the starting amount is recovered from the rate and a later reading',
      'an x-intercept that follows from that recovered start, not from the story',
      'independent and dependent quantities chosen from the context',
      'the slope and both intercepts interpreted in context against common errors (inverted rate, the reading taken for the start, time measured from the reading)',
      'the domain on which the model makes sense, against domains that never end or start at the reading',
      'every representation built and kept consistent: three equation forms, intercepts, two points, a table and three graphs',
    ],
  },
  selfGraded: true,
  // Declared here, demonstrated by certification (honorsRecipeCertification.test.mjs):
  // one generated version per student, marked by the server, Recovery-ready.
  delivery: { perStudentVersions: true, serverGraded: true, recoveryReady: true },
  question: {
    prompt: 'Honors extension. Read the situation. Decide what x and y stand for, then build every representation of this relationship, in any order you like. Reason from the situation to interpret the slope and both intercepts, and choose the domain on which the model makes sense.',
    standard: 'A.2C',
    alignments: [
      { framework: 'teks', code: 'A.2C', role: 'primary' },
      { framework: 'teks', code: 'A.3B', role: 'secondary' },
      { framework: 'teks', code: 'A.3C', role: 'secondary' },
      { framework: 'teks', code: 'A.2A', role: 'secondary' },
      { framework: 'teks', code: 'A.2B', role: 'secondary' },
    ],
    studentActions: ['connectLinearRepresentations'],
    feedbackTiming: 'guided',
    tags: ['honors', 'honors-extension', 'multiple-representations', 'modeling', 'reasoning'],
  },
  stories: [
    {
      id: 'tank',
      source: {
        kind: 'scenario',
        prompt: 'A water tank drains at a constant rate of {{rate}} liters every {{per}} minutes. {{readTime}} minutes after it starts draining, the tank holds {{readAmount}} liters. It keeps draining at the same rate until it is empty.',
      },
      context: TANK_CONTEXT,
    },
    {
      id: 'battery',
      source: {
        kind: 'scenario',
        prompt: 'While a phone streams a video, its battery charge drops at a constant rate of {{rate}} percentage points every {{per}} minutes. {{readTime}} minutes after the video starts, the battery is at {{readAmount}}%. The video keeps playing until the battery reaches 0%.',
      },
      context: BATTERY_CONTEXT,
    },
    {
      id: 'candle',
      source: {
        kind: 'scenario',
        prompt: 'A candle burns down at a constant rate of {{rate}} centimeters every {{per}} hours. {{readTime}} hours after it is lit, the candle is {{readAmount}} centimeters tall. It keeps burning at the same rate until it is completely gone.',
      },
      context: CANDLE_CONTEXT,
    },
  ],
});

/* ---------------------------------------------------------------------------
 * The reading-story board, extended to the other linear concepts.
 *
 * MathMaster's certified Algebra I lesson already asks for every
 * representation from a standard-form equation with a fractional slope, in
 * Process Mode, as ordinary DOK 2 Classwork. A board with no situation is
 * therefore NOT an Honors task, whatever its numbers. What the certified Honors
 * recipe above adds is reasoning from a situation: a rate stated per several
 * units, a starting amount that must be RECOVERED from one later reading, and
 * meanings chosen against real errors. The recipes below give the slope,
 * intercept and representation-sort lessons that same depth, each focused on
 * its own concept (requiredCards and the meanings graded), each with its own
 * stories so an Honors class does not meet the same situation in every linear
 * lesson. Same family, same constraints, same grader as the certified recipe.
 *
 * Every story states only {{rate}}, {{per}}, {{readTime}} and {{readAmount}}.
 * {{start}} and {{end}} (the intercepts) and {{remaining}} appear only inside
 * answer choices. The family keeps start, end, reading time, reading amount
 * and time remaining five different numbers, and the unit rate, the stated
 * rate and the inverted rate three different numbers, so every wrong choice
 * stays wrong on every version.
 * ------------------------------------------------------------------------- */

const READING_STORY_CONSTRAINTS = Object.freeze({
  given: 'scenario',
  scenarioStart: 'fromReading',
  slope: 'fraction',
  rateRange: [2, 7],
  denominatorRange: [2, 4],
  startRange: [12, 48],
  durationRange: [6, 30],
});

const readingStoryTarget = () => ({
  familyId: 'linear.multipleRepresentations',
  familyVersion: 1,
  toolId: 'representationBridge',
  mode: 'linearMultipleRepresentations',
  constraints: clone(READING_STORY_CONSTRAINTS),
});

const READING_STORY_DOMAIN = Object.freeze({
  min: 0,
  max: '{{end}}',
  value: '0 ≤ x ≤ {{end}}',
  choices: ['0 ≤ x ≤ {{end}}', '0 ≤ x ≤ {{start}}', '{{readTime}} ≤ x ≤ {{end}}', 'x ≥ 0'],
});

/**
 * linear.slopeFromPoints → the rate of change hidden in a situation.
 *
 * The lesson (DOK 1, band 2) hands the student two points and asks for the
 * slope. Here no slope and no starting amount is given: the rate is stated
 * per several units ("5 meters every 2 minutes"), so the slope is a negative
 * fraction the student must form; the student names two points the situation
 * guarantees (the slope between them must be that rate), recovers the
 * starting amount from the rate and one later reading, and interprets the
 * slope against the stated rate, the inverted rate and the wrong direction.
 */
const SLOPE_RATE_OF_CHANGE = defineHonorsRecipe({
  id: 'honors.linear.slopeFromPoints.rateOfChange',
  version: 1,
  title: 'Find a fractional rate of change and the starting value it implies, from a situation',
  anchor: { familyIds: ['linear.slopeFromPoints'] },
  supportedCourses: ['algebra1'],
  target: readingStoryTarget(),
  rigor: {
    dok: 3,
    difficultyBand: 4,
    baseline: { dok: 1, difficultyBand: 2 },
    increases: [
      'the rate of change is stated per several units, so the slope is a negative, genuinely fractional unit rate the student must form — not a quotient of two given points',
      'no points are handed over: the student names two points the situation guarantees, and the slope between them must equal the rate',
      'the starting value is never stated: it is recovered from the rate and one later reading (reverse reasoning)',
      'the slope is interpreted in context against the stated rate, the inverted rate and the wrong direction of change',
      'the y-intercept is interpreted in context against the later reading mistaken for the start',
      'the same rate kept consistent across slope-intercept form, a table and a graph',
    ],
  },
  selfGraded: true,
  delivery: { perStudentVersions: true, serverGraded: true, recoveryReady: true },
  question: {
    prompt: 'Honors extension. Read the situation and decide what x and y stand for. Use the situation to find the rate of change and the starting value, name two points on the line, and build each representation below. Reason from the situation to interpret the slope and the y-intercept.',
    standard: 'A.3A',
    alignments: [
      { framework: 'teks', code: 'A.3A', role: 'primary' },
      { framework: 'teks', code: 'A.3B', role: 'secondary' },
      { framework: 'teks', code: 'A.2C', role: 'secondary' },
      { framework: 'teks', code: 'A.3C', role: 'secondary' },
    ],
    studentActions: ['connectLinearRepresentations'],
    feedbackTiming: 'guided',
    requiredCards: ['slope', 'yIntercept', 'twoPoints', 'slopeIntercept', 'table', 'graphSlopeIntercept'],
    tags: ['honors', 'honors-extension', 'rate-of-change', 'slope', 'modeling', 'reasoning'],
  },
  stories: [
    {
      id: 'balloon',
      source: {
        kind: 'scenario',
        prompt: 'A hot-air balloon descends at a constant rate of {{rate}} meters every {{per}} minutes. {{readTime}} minutes after it starts descending, the balloon is {{readAmount}} meters above the ground. It keeps descending at the same rate until it lands.',
      },
      context: {
        independentQuantity: {
          value: 'time since the balloon started descending (minutes)',
          choices: ['time since the balloon started descending (minutes)', 'height of the balloon above the ground (meters)', 'meters descended every {{per}} minutes'],
        },
        dependentQuantity: {
          value: 'height of the balloon above the ground (meters)',
          choices: ['time since the balloon started descending (minutes)', 'height of the balloon above the ground (meters)', 'meters descended every {{per}} minutes'],
        },
        slopeMeaning: {
          value: 'The balloon descends {{unitRate}} meters each minute.',
          choices: [
            'The balloon descends {{unitRate}} meters each minute.',
            'The balloon descends {{rate}} meters each minute.',
            'The balloon descends {{inverseRate}} meters each minute.',
            'The balloon rises {{unitRate}} meters each minute.',
          ],
        },
        yInterceptMeaning: {
          value: 'The balloon was {{start}} meters above the ground when it started descending.',
          choices: [
            'The balloon was {{start}} meters above the ground when it started descending.',
            'The balloon was {{readAmount}} meters above the ground when it started descending.',
            'The balloon lands {{start}} minutes after it starts descending.',
            'The balloon descends {{start}} meters every {{per}} minutes.',
          ],
        },
      },
    },
    {
      id: 'hourglass',
      source: {
        kind: 'scenario',
        prompt: 'Sand falls from the top chamber of an hourglass at a constant rate of {{rate}} grams every {{per}} seconds. {{readTime}} seconds after the hourglass is turned over, the top chamber holds {{readAmount}} grams of sand. Sand keeps falling at the same rate until the top chamber is empty.',
      },
      context: {
        independentQuantity: {
          value: 'time since the hourglass was turned over (seconds)',
          choices: ['time since the hourglass was turned over (seconds)', 'sand in the top chamber (grams)', 'grams of sand that fall every {{per}} seconds'],
        },
        dependentQuantity: {
          value: 'sand in the top chamber (grams)',
          choices: ['time since the hourglass was turned over (seconds)', 'sand in the top chamber (grams)', 'grams of sand that fall every {{per}} seconds'],
        },
        slopeMeaning: {
          value: 'The top chamber loses {{unitRate}} grams of sand each second.',
          choices: [
            'The top chamber loses {{unitRate}} grams of sand each second.',
            'The top chamber loses {{rate}} grams of sand each second.',
            'The top chamber loses {{inverseRate}} grams of sand each second.',
            'The top chamber gains {{unitRate}} grams of sand each second.',
          ],
        },
        yInterceptMeaning: {
          value: 'The top chamber held {{start}} grams of sand when the hourglass was turned over.',
          choices: [
            'The top chamber held {{start}} grams of sand when the hourglass was turned over.',
            'The top chamber held {{readAmount}} grams of sand when the hourglass was turned over.',
            'The top chamber is empty {{start}} seconds after the hourglass is turned over.',
            'The top chamber loses {{start}} grams of sand every {{per}} seconds.',
          ],
        },
      },
    },
    {
      id: 'snowDepth',
      source: {
        kind: 'scenario',
        prompt: 'Once a thaw begins, the snow on a field melts at a constant rate of {{rate}} inches every {{per}} days. {{readTime}} days after the thaw begins, the snow is {{readAmount}} inches deep. It keeps melting at the same rate until it is gone.',
      },
      context: {
        independentQuantity: {
          value: 'time since the thaw began (days)',
          choices: ['time since the thaw began (days)', 'depth of the snow (inches)', 'inches of snow that melt every {{per}} days'],
        },
        dependentQuantity: {
          value: 'depth of the snow (inches)',
          choices: ['time since the thaw began (days)', 'depth of the snow (inches)', 'inches of snow that melt every {{per}} days'],
        },
        slopeMeaning: {
          value: 'The snow gets {{unitRate}} inches shallower each day.',
          choices: [
            'The snow gets {{unitRate}} inches shallower each day.',
            'The snow gets {{rate}} inches shallower each day.',
            'The snow gets {{inverseRate}} inches shallower each day.',
            'The snow gets {{unitRate}} inches deeper each day.',
          ],
        },
        yInterceptMeaning: {
          value: 'The snow was {{start}} inches deep when the thaw began.',
          choices: [
            'The snow was {{start}} inches deep when the thaw began.',
            'The snow was {{readAmount}} inches deep when the thaw began.',
            'The snow is gone {{start}} days after the thaw begins.',
            'The snow gets {{start}} inches shallower every {{per}} days.',
          ],
        },
      },
    },
  ],
});

/**
 * functions.identifyIntercepts → intercepts recovered and interpreted in context.
 *
 * The lesson (DOK 1, band 2) reads both intercepts off Ax + By = C. Here
 * neither intercept is stated: the y-intercept is the starting amount,
 * recovered from a fractional rate and one later reading; the x-intercept
 * (when it runs out) follows from it. Both are interpreted against real
 * errors (the reading taken for the start, time measured from the reading,
 * start and end swapped), they bound the domain, and the student writes the
 * line in standard form and graphs it through the intercepts they derived.
 */
const INTERCEPTS_IN_CONTEXT = defineHonorsRecipe({
  id: 'honors.functions.identifyIntercepts.interceptsInContext',
  version: 1,
  title: 'Recover both intercepts of a situation and interpret them',
  anchor: { familyIds: ['functions.identifyIntercepts'] },
  supportedCourses: ['algebra1'],
  target: readingStoryTarget(),
  rigor: {
    dok: 3,
    difficultyBand: 4,
    baseline: { dok: 1, difficultyBand: 2 },
    increases: [
      'neither intercept is stated: the y-intercept (the starting amount) is recovered from a negative, fractional rate and one later reading',
      'the x-intercept (when it runs out) follows from the recovered start, not from the story',
      'both intercepts interpreted in context against real errors: the reading taken for the start, time measured from the reading, start and end swapped',
      'the domain the intercepts bound, against domains that never end or start at the reading',
      'the line written in standard form from intercepts the student derived, and graphed through them',
    ],
  },
  selfGraded: true,
  delivery: { perStudentVersions: true, serverGraded: true, recoveryReady: true },
  question: {
    prompt: 'Honors extension. Read the situation and decide what x and y stand for. Find both intercepts of this relationship, write it in standard form and in slope-intercept form, and graph it through its intercepts. Reason from the situation to interpret both intercepts, and choose the domain on which the model makes sense.',
    standard: 'A.3C',
    alignments: [
      { framework: 'teks', code: 'A.3C', role: 'primary' },
      { framework: 'teks', code: 'A.2A', role: 'secondary' },
      { framework: 'teks', code: 'A.2B', role: 'secondary' },
      { framework: 'teks', code: 'A.2C', role: 'secondary' },
    ],
    studentActions: ['connectLinearRepresentations'],
    feedbackTiming: 'guided',
    requiredCards: ['xIntercept', 'yIntercept', 'slope', 'standardForm', 'slopeIntercept', 'graphIntercepts'],
    tags: ['honors', 'honors-extension', 'intercepts', 'modeling', 'reasoning'],
  },
  stories: [
    {
      id: 'elevator',
      source: {
        kind: 'scenario',
        prompt: 'An elevator moves down from the top of a building at a constant speed of {{rate}} meters every {{per}} seconds. {{readTime}} seconds after it starts moving down, it is {{readAmount}} meters above the ground floor. It keeps moving down at the same speed until it reaches the ground floor.',
      },
      context: {
        independentQuantity: {
          value: 'time since the elevator started moving down (seconds)',
          choices: ['time since the elevator started moving down (seconds)', 'height of the elevator above the ground floor (meters)', 'meters traveled every {{per}} seconds'],
        },
        dependentQuantity: {
          value: 'height of the elevator above the ground floor (meters)',
          choices: ['time since the elevator started moving down (seconds)', 'height of the elevator above the ground floor (meters)', 'meters traveled every {{per}} seconds'],
        },
        yInterceptMeaning: {
          value: 'The elevator was {{start}} meters above the ground floor when it started moving down.',
          choices: [
            'The elevator was {{start}} meters above the ground floor when it started moving down.',
            'The elevator was {{readAmount}} meters above the ground floor when it started moving down.',
            'The elevator reaches the ground floor {{start}} seconds after it starts moving down.',
            'The elevator moves down {{start}} meters every {{per}} seconds.',
          ],
        },
        xInterceptMeaning: {
          value: 'The elevator reaches the ground floor {{end}} seconds after it started moving down.',
          choices: [
            'The elevator reaches the ground floor {{end}} seconds after it started moving down.',
            'The elevator reaches the ground floor {{remaining}} seconds after it started moving down.',
            'The elevator was {{end}} meters above the ground floor when it started moving down.',
            'The elevator moves down {{end}} meters each second.',
          ],
        },
        domain: READING_STORY_DOMAIN,
      },
    },
    {
      id: 'cooler',
      source: {
        kind: 'scenario',
        prompt: 'The ice in a cooler melts at a constant rate of {{rate}} pounds every {{per}} hours. {{readTime}} hours after the cooler is packed, it holds {{readAmount}} pounds of ice. The ice keeps melting at the same rate until it has all melted.',
      },
      context: {
        independentQuantity: {
          value: 'time since the cooler was packed (hours)',
          choices: ['time since the cooler was packed (hours)', 'ice in the cooler (pounds)', 'pounds of ice that melt every {{per}} hours'],
        },
        dependentQuantity: {
          value: 'ice in the cooler (pounds)',
          choices: ['time since the cooler was packed (hours)', 'ice in the cooler (pounds)', 'pounds of ice that melt every {{per}} hours'],
        },
        yInterceptMeaning: {
          value: 'The cooler held {{start}} pounds of ice when it was packed.',
          choices: [
            'The cooler held {{start}} pounds of ice when it was packed.',
            'The cooler held {{readAmount}} pounds of ice when it was packed.',
            'The ice has all melted {{start}} hours after the cooler is packed.',
            'The ice melts {{start}} pounds every {{per}} hours.',
          ],
        },
        xInterceptMeaning: {
          value: 'The ice has all melted {{end}} hours after the cooler was packed.',
          choices: [
            'The ice has all melted {{end}} hours after the cooler was packed.',
            'The ice has all melted {{remaining}} hours after the cooler was packed.',
            'The cooler held {{end}} pounds of ice when it was packed.',
            'The ice melts {{end}} pounds each hour.',
          ],
        },
        domain: READING_STORY_DOMAIN,
      },
    },
    {
      id: 'boatFuel',
      source: {
        kind: 'scenario',
        prompt: 'A fishing boat burns fuel at a constant rate of {{rate}} gallons every {{per}} hours. {{readTime}} hours after it leaves the dock, its tank holds {{readAmount}} gallons. It keeps burning fuel at the same rate until the tank is empty.',
      },
      context: {
        independentQuantity: {
          value: 'time since the boat left the dock (hours)',
          choices: ['time since the boat left the dock (hours)', 'fuel in the tank (gallons)', 'gallons burned every {{per}} hours'],
        },
        dependentQuantity: {
          value: 'fuel in the tank (gallons)',
          choices: ['time since the boat left the dock (hours)', 'fuel in the tank (gallons)', 'gallons burned every {{per}} hours'],
        },
        yInterceptMeaning: {
          value: 'The tank held {{start}} gallons when the boat left the dock.',
          choices: [
            'The tank held {{start}} gallons when the boat left the dock.',
            'The tank held {{readAmount}} gallons when the boat left the dock.',
            'The tank is empty {{start}} hours after the boat leaves the dock.',
            'The boat burns {{start}} gallons every {{per}} hours.',
          ],
        },
        xInterceptMeaning: {
          value: 'The tank is empty {{end}} hours after the boat left the dock.',
          choices: [
            'The tank is empty {{end}} hours after the boat left the dock.',
            'The tank is empty {{remaining}} hours after the boat left the dock.',
            'The tank held {{end}} gallons when the boat left the dock.',
            'The boat burns {{end}} gallons each hour.',
          ],
        },
        domain: READING_STORY_DOMAIN,
      },
    },
  ],
});

/**
 * linear.representationSort → build every representation instead of sorting them.
 *
 * The lesson (DOK 2, band 1) asks which given cards describe the same line.
 * Here there are no cards to sort: from one situation, with a fractional rate
 * and a starting amount that must be recovered from a later reading, the
 * student constructs every card themselves — three equation forms, both
 * intercepts, two points, a table and three graphs — and chooses all six
 * meanings against real errors.
 */
const SORT_BUILD_FROM_READING = defineHonorsRecipe({
  id: 'honors.linear.representationSort.buildFromReading',
  version: 1,
  title: 'Construct every representation of a situation instead of sorting given ones',
  anchor: { familyIds: ['linear.representationSort'] },
  supportedCourses: ['algebra1'],
  target: readingStoryTarget(),
  rigor: {
    dok: 3,
    difficultyBand: 4,
    baseline: { dok: 2, difficultyBand: 1 },
    increases: [
      'recognition becomes construction: no card is given, every representation is built from the situation',
      'a negative, genuinely fractional rate stated per several units',
      'the starting amount (y-intercept) recovered from one later reading, and the x-intercept from it',
      'independent and dependent quantities, both intercepts and the slope interpreted against common errors',
      'the domain on which the model makes sense, against domains that never end or start at the reading',
      'every representation kept consistent: three equation forms, intercepts, two points, a table and three graphs',
    ],
  },
  selfGraded: true,
  delivery: { perStudentVersions: true, serverGraded: true, recoveryReady: true },
  question: {
    prompt: 'Honors extension. There are no cards to sort this time. Read the situation, decide what x and y stand for, and build every representation of this relationship yourself, in any order you like. Reason from the situation to interpret the slope and both intercepts, and choose the domain on which the model makes sense.',
    standard: 'A.2B',
    alignments: [
      { framework: 'teks', code: 'A.2B', role: 'primary' },
      { framework: 'teks', code: 'A.2C', role: 'secondary' },
      { framework: 'teks', code: 'A.3B', role: 'secondary' },
      { framework: 'teks', code: 'A.3C', role: 'secondary' },
      { framework: 'teks', code: 'A.2A', role: 'secondary' },
    ],
    studentActions: ['connectLinearRepresentations'],
    feedbackTiming: 'guided',
    tags: ['honors', 'honors-extension', 'multiple-representations', 'modeling', 'reasoning'],
  },
  stories: [
    {
      id: 'generator',
      source: {
        kind: 'scenario',
        prompt: 'A generator burns fuel at a constant rate of {{rate}} liters every {{per}} hours. {{readTime}} hours after it is switched on, its tank holds {{readAmount}} liters. It keeps running at the same rate until the tank is empty.',
      },
      context: {
        independentQuantity: {
          value: 'time since the generator was switched on (hours)',
          choices: ['time since the generator was switched on (hours)', 'fuel in the generator\'s tank (liters)', 'liters burned every {{per}} hours'],
        },
        dependentQuantity: {
          value: 'fuel in the generator\'s tank (liters)',
          choices: ['time since the generator was switched on (hours)', 'fuel in the generator\'s tank (liters)', 'liters burned every {{per}} hours'],
        },
        slopeMeaning: {
          value: 'The generator burns {{unitRate}} liters of fuel each hour.',
          choices: [
            'The generator burns {{unitRate}} liters of fuel each hour.',
            'The generator burns {{rate}} liters of fuel each hour.',
            'The generator burns {{inverseRate}} liters of fuel each hour.',
            'The generator\'s tank gains {{unitRate}} liters of fuel each hour.',
          ],
        },
        yInterceptMeaning: {
          value: 'The tank held {{start}} liters when the generator was switched on.',
          choices: [
            'The tank held {{start}} liters when the generator was switched on.',
            'The tank held {{readAmount}} liters when the generator was switched on.',
            'The tank is empty {{start}} hours after the generator is switched on.',
            'The generator burns {{start}} liters every {{per}} hours.',
          ],
        },
        xInterceptMeaning: {
          value: 'The tank is empty {{end}} hours after the generator was switched on.',
          choices: [
            'The tank is empty {{end}} hours after the generator was switched on.',
            'The tank is empty {{remaining}} hours after the generator was switched on.',
            'The tank held {{end}} liters when the generator was switched on.',
            'The generator burns {{end}} liters of fuel each hour.',
          ],
        },
        domain: READING_STORY_DOMAIN,
      },
    },
    {
      id: 'floodStage',
      source: {
        kind: 'scenario',
        prompt: 'After a storm, a river falls at a constant rate of {{rate}} inches every {{per}} hours. {{readTime}} hours after it starts to fall, the river is {{readAmount}} inches above flood stage. It keeps falling at the same rate until it is back at flood stage.',
      },
      context: {
        independentQuantity: {
          value: 'time since the river started to fall (hours)',
          choices: ['time since the river started to fall (hours)', 'height of the river above flood stage (inches)', 'inches the river falls every {{per}} hours'],
        },
        dependentQuantity: {
          value: 'height of the river above flood stage (inches)',
          choices: ['time since the river started to fall (hours)', 'height of the river above flood stage (inches)', 'inches the river falls every {{per}} hours'],
        },
        slopeMeaning: {
          value: 'The river falls {{unitRate}} inches each hour.',
          choices: [
            'The river falls {{unitRate}} inches each hour.',
            'The river falls {{rate}} inches each hour.',
            'The river falls {{inverseRate}} inches each hour.',
            'The river rises {{unitRate}} inches each hour.',
          ],
        },
        yInterceptMeaning: {
          value: 'The river was {{start}} inches above flood stage when it started to fall.',
          choices: [
            'The river was {{start}} inches above flood stage when it started to fall.',
            'The river was {{readAmount}} inches above flood stage when it started to fall.',
            'The river is back at flood stage {{start}} hours after it starts to fall.',
            'The river falls {{start}} inches every {{per}} hours.',
          ],
        },
        xInterceptMeaning: {
          value: 'The river is back at flood stage {{end}} hours after it started to fall.',
          choices: [
            'The river is back at flood stage {{end}} hours after it started to fall.',
            'The river is back at flood stage {{remaining}} hours after it started to fall.',
            'The river was {{end}} inches above flood stage when it started to fall.',
            'The river falls {{end}} inches each hour.',
          ],
        },
        domain: READING_STORY_DOMAIN,
      },
    },
    {
      id: 'printerFilament',
      source: {
        kind: 'scenario',
        prompt: 'A 3D printer uses filament at a constant rate of {{rate}} meters every {{per}} hours. {{readTime}} hours after a print starts, the spool holds {{readAmount}} meters of filament. The printer keeps using filament at the same rate until the spool is empty.',
      },
      context: {
        independentQuantity: {
          value: 'time since the print started (hours)',
          choices: ['time since the print started (hours)', 'filament left on the spool (meters)', 'meters of filament used every {{per}} hours'],
        },
        dependentQuantity: {
          value: 'filament left on the spool (meters)',
          choices: ['time since the print started (hours)', 'filament left on the spool (meters)', 'meters of filament used every {{per}} hours'],
        },
        slopeMeaning: {
          value: 'The spool loses {{unitRate}} meters of filament each hour.',
          choices: [
            'The spool loses {{unitRate}} meters of filament each hour.',
            'The spool loses {{rate}} meters of filament each hour.',
            'The spool loses {{inverseRate}} meters of filament each hour.',
            'The spool gains {{unitRate}} meters of filament each hour.',
          ],
        },
        yInterceptMeaning: {
          value: 'The spool held {{start}} meters of filament when the print started.',
          choices: [
            'The spool held {{start}} meters of filament when the print started.',
            'The spool held {{readAmount}} meters of filament when the print started.',
            'The spool is empty {{start}} hours after the print starts.',
            'The spool loses {{start}} meters of filament every {{per}} hours.',
          ],
        },
        xInterceptMeaning: {
          value: 'The spool is empty {{end}} hours after the print started.',
          choices: [
            'The spool is empty {{end}} hours after the print started.',
            'The spool is empty {{remaining}} hours after the print started.',
            'The spool held {{end}} meters of filament when the print started.',
            'The spool loses {{end}} meters of filament each hour.',
          ],
        },
        domain: READING_STORY_DOMAIN,
      },
    },
  ],
});

/* ---------------------------------------------------------------------------
 * The registry, and the rule that keeps selection deterministic.
 * ------------------------------------------------------------------------- */

/**
 * Every (anchor family, course) that more than one recipe claims. A claim
 * shared by several recipes is `resolved` only when each declares a distinct
 * `selection.priority` (the higher wins); otherwise which recipe a lesson got
 * would depend on registry order.
 */
export const findCompetingHonorsRecipes = (registry = []) => {
  const claims = new Map();
  (Array.isArray(registry) ? registry : []).forEach((recipe) => {
    recipe.anchor.familyIds.forEach((familyId) => recipe.supportedCourses.forEach((courseId) => {
      const key = `${familyId}|${courseId}`;
      if (!claims.has(key)) claims.set(key, { familyId, courseId, recipes: [] });
      claims.get(key).recipes.push(recipe);
    }));
  });
  return [...claims.values()]
    .filter((claim) => claim.recipes.length > 1)
    .map(({ familyId, courseId, recipes }) => {
      const priorities = recipes.map((recipe) => recipe.selection?.priority);
      return {
        familyId,
        courseId,
        recipeIds: recipes.map((recipe) => recipe.id).sort(),
        resolved: priorities.every(Number.isInteger) && new Set(priorities).size === priorities.length,
      };
    });
};

/** A registry MathMaster may select from: unique ids, unique stories, no unresolved competition. */
export const assertDeterministicHonorsRegistry = (registry = []) => {
  const ids = registry.map((recipe) => recipe.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) throw new Error(`Honors recipe ids must be unique: ${[...new Set(duplicates)].join(', ')}.`);
  const unresolved = findCompetingHonorsRecipes(registry).filter((claim) => !claim.resolved);
  if (unresolved.length) {
    throw new Error(`Honors recipes compete for the same anchor and course without a selection rule: ${unresolved
      .map((claim) => `${claim.familyId} (${claim.courseId}): ${claim.recipeIds.join(', ')}`).join('; ')}. Give each a distinct selection.priority, or narrow its anchor.`);
  }
  return registry;
};

/**
 * Every vetted recipe. Adding one: write it with defineHonorsRecipe, add it
 * here, and certify it in tests/platform/honorsRecipeCertification.test.mjs
 * (the certification walks this registry, so a new recipe is certified the
 * moment it is listed). The deterministic-Honors coverage report
 * (honorsRecipeCoverage.js) reads READY from this list.
 */
export const HONORS_RECIPE_REGISTRY = assertDeterministicHonorsRegistry(Object.freeze([
  LINEAR_MR_RATE_FROM_READING,
  SLOPE_RATE_OF_CHANGE,
  INTERCEPTS_IN_CONTEXT,
  SORT_BUILD_FROM_READING,
]));

/* ---------------------------------------------------------------------------
 * Selection.
 * ------------------------------------------------------------------------- */

const conceptLabel = (anchor) => anchor?.familyId || anchor?.conceptKey || 'this concept';
const courseLabel = (course) => HONORS_COURSE_LABELS[course] || course;
const LEFT_UNCHANGED = 'MathMaster did not add a substitute question, and the assignment was left unchanged.';

const unavailable = (code, teacherMessage, extra = {}) => ({
  status: HONORS_RECIPE_STATUS.UNAVAILABLE,
  code,
  teacherMessage,
  recipe: null,
  question: null,
  ...extra,
});

/**
 * Choose the recipe for an assignment, or say exactly why there is none.
 *
 * Both the anchor family AND the course are checked: the assignment's
 * declared course must agree with the TEKS its anchor questions are aligned
 * to, and the recipe must be written for that course.
 */
export const selectHonorsExtensionRecipe = ({
  questions = [],
  assignmentCourseId = null,
  registry = HONORS_RECIPE_REGISTRY,
} = {}) => {
  const anchor = resolveHonorsAnchor(questions);
  if (!anchor) {
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.NO_ANCHOR,
      `MathMaster could not identify the core concept this assignment teaches, so a vetted no-AI Honors extension is not yet available for it. ${LEFT_UNCHANGED}`,
      { anchorFamilyId: null },
    );
  }
  const anchorFamilyId = anchor.familyId;
  // Only for wording: the audit (honorsRecipeBacklog.js) says in plain words
  // why this concept has no extension in this course.
  const reasonFor = (courseId) => {
    const reason = honorsUnavailableReason(anchorFamilyId, courseId);
    return reason ? ` ${reason}` : '';
  };
  const wordingCourse = strictCourseId(assignmentCourseId) || (anchor.teksCourses.length === 1 ? anchor.teksCourses[0] : null);
  const forFamily = (Array.isArray(registry) ? registry : []).filter((recipe) => anchorFamilyId && recipe.anchor.familyIds.includes(anchorFamilyId));
  if (!forFamily.length) {
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.NO_VETTED_RECIPE,
      `A vetted no-AI Honors extension is not yet available for this concept (${conceptLabel(anchor)}).${reasonFor(wordingCourse)} ${LEFT_UNCHANGED} Use the MathMaster AI or outside-AI Honors repair instead.`,
      { anchor, anchorFamilyId },
    );
  }

  const declaredRaw = clean(assignmentCourseId);
  const declared = strictCourseId(declaredRaw);
  if (declaredRaw && !declared) {
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.COURSE_UNKNOWN,
      `This assignment's course ("${declaredRaw}") is not one MathMaster's no-AI Honors recipes are written for, so none was chosen. ${LEFT_UNCHANGED}`,
      { anchor, anchorFamilyId },
    );
  }
  if (anchor.teksCourses.length > 1 || (declared && anchor.teksCourses.length === 1 && anchor.teksCourses[0] !== declared)) {
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.COURSE_CONFLICT,
      `This assignment is set to ${declared ? courseLabel(declared) : 'a course'}, but its ${conceptLabel(anchor)} questions are aligned to ${anchor.teksCourses.map(courseLabel).join(' and ')} TEKS. MathMaster will not choose a no-AI Honors extension until the course and the TEKS agree. ${LEFT_UNCHANGED}`,
      { anchor, anchorFamilyId, courseId: declared },
    );
  }
  const courseId = declared || anchor.teksCourses[0] || null;
  if (!courseId) {
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.COURSE_UNKNOWN,
      `MathMaster could not confirm this assignment's course from its settings or its TEKS, so it will not choose a no-AI Honors extension. ${LEFT_UNCHANGED}`,
      { anchor, anchorFamilyId },
    );
  }
  // Never registry order: one recipe per (anchor, course), or competitors that
  // each declare a distinct selection.priority. Anything else changes nothing.
  const forCourse = forFamily.filter((candidate) => candidate.supportedCourses.includes(courseId));
  const competing = findCompetingHonorsRecipes(forCourse).find((claim) => claim.familyId === anchorFamilyId && claim.courseId === courseId);
  if (competing && !competing.resolved) {
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.AMBIGUOUS,
      `More than one vetted no-AI Honors extension claims ${conceptLabel(anchor)} for ${courseLabel(courseId)}, and none is marked as the one to use, so MathMaster chose neither. ${LEFT_UNCHANGED}`,
      { anchor, anchorFamilyId, courseId },
    );
  }
  const [recipe] = [...forCourse].sort((left, right) => (
    (right.selection?.priority ?? 0) - (left.selection?.priority ?? 0) || left.id.localeCompare(right.id)
  ));
  if (!recipe) {
    const written = [...new Set(forFamily.flatMap((candidate) => candidate.supportedCourses))].map(courseLabel).join(' or ');
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.COURSE_NOT_SUPPORTED,
      `The vetted no-AI Honors extension for ${conceptLabel(anchor)} is written for ${written}, and this is an ${courseLabel(courseId)} assignment, so a vetted no-AI Honors extension is not yet available for it.${reasonFor(courseId)} ${LEFT_UNCHANGED}`,
      { anchor, anchorFamilyId, courseId },
    );
  }
  return { status: HONORS_RECIPE_STATUS.READY, code: null, teacherMessage: '', recipe, anchor, anchorFamilyId, courseId };
};

const chooseStory = (recipe, { storyId = null, avoidStoryIds = [], cycle = true } = {}) => {
  const stories = recipe.stories;
  const requested = clean(storyId) && stories.find((story) => story.id === clean(storyId));
  if (requested) return requested;
  const avoid = (Array.isArray(avoidStoryIds) ? avoidStoryIds : []).map(clean);
  const fresh = stories.find((story) => !avoid.includes(story.id));
  if (fresh) return fresh;
  if (!cycle) return null;
  // Every story used: anything but the most recent one, so a swap still changes it.
  const last = avoid[avoid.length - 1];
  return stories.find((story) => story.id !== last) || stories[0];
};

const buildRecipeQuestion = ({ recipe, story, anchor, courseId, questionId = null }) => {
  const { question: authored, target, rigor } = recipe;
  return allocateQuestionValue({
    ...(clean(questionId) ? { questionId: clean(questionId) } : {}),
    type: target.toolId,
    mode: target.mode,
    activityRole: 'classwork',
    prompt: authored.prompt,
    standard: authored.standard,
    alignments: clone(authored.alignments),
    studentActions: clone(authored.studentActions),
    dok: rigor.dok,
    difficultyBand: rigor.difficultyBand,
    feedbackTiming: authored.feedbackTiming,
    tags: clone(authored.tags),
    // A board focused on one concept asks for the cards that concept needs.
    ...(Array.isArray(authored.requiredCards) ? { requiredCards: clone(authored.requiredCards) } : {}),
    questionFamily: { id: target.familyId, version: target.familyVersion, constraints: clone(target.constraints) },
    ...(story.source ? { source: clone(story.source) } : {}),
    ...(story.context ? { context: clone(story.context) } : {}),
    honorsEnrichment: {
      generatedBy: 'MathMaster',
      source: DETERMINISTIC_HONORS_SOURCE,
      contractVersion: HONORS_EXTENSION_CONTRACT_VERSION,
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      storyId: story.id,
      anchorFamilyId: anchor.familyId,
      anchorQuestionId: anchor.questionId,
      gradingFamilyId: target.familyId,
      courseId,
      selfGraded: true,
    },
  });
};

/**
 * The one entry point for a no-AI Honors extension.
 *
 *   ready        { question, recipe, anchor, courseId, notes }
 *   unavailable  { code, teacherMessage, question: null } — the caller must
 *                leave the assignment exactly as it was.
 *
 * `destinationCourseId` (the Honors class's profile) never chooses content;
 * when it disagrees with the assignment the teacher is told in `notes`.
 * `avoidStoryIds` asks for a different story (a swap); `cycle: false` makes
 * an exhausted list unavailable instead of reusing one.
 */
export const buildDeterministicHonorsExtension = ({
  questions = [],
  assignmentCourseId = null,
  destinationCourseId = null,
  questionId = null,
  storyId = null,
  avoidStoryIds = [],
  cycle = true,
  registry = HONORS_RECIPE_REGISTRY,
} = {}) => {
  const selection = selectHonorsExtensionRecipe({ questions, assignmentCourseId, registry });
  if (selection.status !== HONORS_RECIPE_STATUS.READY) return selection;
  const { recipe, anchor, courseId } = selection;
  const story = chooseStory(recipe, { storyId, avoidStoryIds, cycle });
  if (!story) {
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.STORIES_EXHAUSTED,
      `Every vetted version of this no-AI Honors extension has already been used here. ${LEFT_UNCHANGED}`,
      { anchor, anchorFamilyId: anchor.familyId, courseId },
    );
  }
  const notes = [];
  const destination = strictCourseId(destinationCourseId);
  if (destination && destination !== courseId) {
    notes.push(`The Honors class is set to ${courseLabel(destination)}, but this is an ${courseLabel(courseId)} assignment. The extension stays ${courseLabel(courseId)}; check the class's course setting.`);
  }
  return {
    status: HONORS_RECIPE_STATUS.READY,
    code: null,
    teacherMessage: '',
    recipe,
    anchor,
    anchorFamilyId: anchor.familyId,
    courseId,
    notes,
    question: buildRecipeQuestion({ recipe, story, anchor, courseId, questionId }),
  };
};

// What a teacher calls each tool a recipe can build on.
const TOOL_NAMES = Object.freeze({
  'representationBridge/linearMultipleRepresentations': 'the Multiple Representations board',
});

/**
 * The sentence Pre-Flight shows before the teacher adds an extension: which
 * task, on which tool (the lesson's own, or another self-graded MathMaster
 * tool — never left implied), at what DOK against the lesson's, and that the
 * lesson's questions are untouched. `selection` is a READY result of
 * selectHonorsExtensionRecipe.
 */
export const describeHonorsRecipeForTeacher = (selection = {}) => {
  const { recipe, anchorFamilyId } = selection || {};
  if (!recipe) return '';
  const tool = TOOL_NAMES[`${recipe.target.toolId}/${recipe.target.mode || ''}`] || `MathMaster's ${recipe.target.toolId} tool`;
  const where = recipe.anchor.familyIds.includes(recipe.target.familyId) && recipe.target.familyId === anchorFamilyId
    ? `the lesson's own tool, ${tool}`
    : `${tool}, the MathMaster tool this lesson builds toward`;
  const title = `${recipe.title.charAt(0).toLowerCase()}${recipe.title.slice(1)}`;
  return `MathMaster has a vetted Honors extension for this lesson's concept: ${title}. It is one self-graded question on ${where}, with ${recipe.delivery.perStudentVersions ? 'a different version for every student' : 'the same version for every student'}, at DOK ${recipe.rigor.dok} where the lesson works at DOK ${recipe.rigor.baseline.dok}, and it does not change the existing questions.`;
};

/* ---------------------------------------------------------------------------
 * Recognising stored extensions.
 * ------------------------------------------------------------------------- */

/**
 * What kind of Honors extension a stored question is.
 *
 *   isDeterministic  written by MathMaster's no-AI policy (any contract version)
 *   isCurrent        contract v2 from a recipe still registered at that version
 *   isLegacy         deterministic but not current — v1 (the generic
 *                    free-response generator) or a superseded recipe version —
 *                    and so a candidate for "Replace with Current Honors Extension"
 */
export const describeHonorsExtension = (question = {}, { registry = HONORS_RECIPE_REGISTRY } = {}) => {
  const meta = isObject(question?.honorsEnrichment) ? question.honorsEnrichment : null;
  const legacyFamily = LEGACY_FAMILY.test(clean(question?.familyId));
  const isHonorsExtension = Boolean(meta) || legacyFamily;
  const isDeterministic = clean(meta?.source) === DETERMINISTIC_HONORS_SOURCE || (legacyFamily && !meta);
  const contractVersion = isDeterministic ? (Number(meta?.contractVersion) || 1) : (meta ? Number(meta.contractVersion) || null : null);
  const recipe = isDeterministic && clean(meta?.recipeId)
    ? (Array.isArray(registry) ? registry : []).find((entry) => entry.id === clean(meta.recipeId)) || null
    : null;
  const isCurrent = Boolean(isDeterministic
    && contractVersion >= HONORS_EXTENSION_CONTRACT_VERSION
    && recipe
    && Number(meta?.recipeVersion) === recipe.version);
  return {
    isHonorsExtension,
    isDeterministic,
    isCurrent,
    isLegacy: isDeterministic && !isCurrent,
    contractVersion,
    recipeId: clean(meta?.recipeId) || null,
    recipeVersion: Number.isInteger(Number(meta?.recipeVersion)) ? Number(meta?.recipeVersion) : null,
    storyId: clean(meta?.storyId) || null,
  };
};

/**
 * An Assignment V5 candidate with the extension where publish puts it: at the
 * end of the Classwork section (a Classwork section is added if there is
 * none). Used to run the whole-assignment Pre-Flight before the teacher is
 * told an extension was added.
 */
export const withHonorsExtension = (assignmentV5 = {}, question = null) => {
  if (!isObject(assignmentV5) || !isObject(question)) return assignmentV5;
  const sections = Array.isArray(assignmentV5.sections) ? assignmentV5.sections : [];
  const extension = { ...question, activityRole: 'classwork' };
  delete extension.sectionId;
  const target = sections.findIndex((section) => clean(section?.role).toLowerCase() === 'classwork');
  if (target < 0) {
    return { ...assignmentV5, sections: [...sections, { id: 'honors-extension', role: 'classwork', title: 'Classwork', questions: [extension] }] };
  }
  return {
    ...assignmentV5,
    sections: sections.map((section, index) => (
      index === target ? { ...section, questions: [...(Array.isArray(section.questions) ? section.questions : []), extension] } : section
    )),
  };
};

/* ---------------------------------------------------------------------------
 * Certification: the same checks Pre-Flight runs, on the extension alone.
 * ------------------------------------------------------------------------- */

/**
 * Would MathMaster deliver this extension as-is? Runs the renderer contract,
 * semantic validation (including "the prompt promises a graph"), the
 * question ↔ tool contract and alignment validation. Callers run it before
 * an extension is accepted or published; the whole-assignment Pre-Flight
 * still runs on the candidate around it.
 */
export const certifyHonorsExtensionQuestion = (question) => {
  const errors = [];
  if (!isObject(question)) return { ok: false, errors: ['The Honors extension is not a question.'] };
  try {
    validateAssignmentQuestions([question]);
  } catch (error) {
    errors.push(String(error?.message || error));
  }
  errors.push(...validateQuestionSemantics(question, { label: 'Question 1' }).errors);
  auditQuestionToolContract(question, 0)
    .filter((finding) => finding.severity === 'blocking')
    .forEach((finding) => errors.push(finding.message));
  errors.push(...validateAlignments(question, { label: 'Question 1' }).errors);
  const unique = [...new Set(errors.map(String))];
  return { ok: unique.length === 0, errors: unique };
};
