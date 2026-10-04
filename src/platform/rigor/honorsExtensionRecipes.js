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
import { validateAssignmentQuestions } from '../../assignmentBlueprint.js';
import { validateQuestionSemantics } from '../contract/semanticValidation.js';
import { auditQuestionToolContract } from '../contract/questionToolContract.js';
import { validateAlignments } from '../contract/alignments.js';

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

/**
 * Validate and freeze a recipe. A recipe that cannot prove what it extends,
 * whom it serves, what builds and grades it, how it is harder, and that it is
 * self-graded never enters the registry.
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
  if (!clean(spec.question?.prompt)) recipeProblem(id, 'a student prompt is required.');
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

/**
 * Every vetted recipe. Adding one: write it with defineHonorsRecipe, add it
 * here, and add its anchor family to the certification in
 * tests/platform/honorsExtensionRecipes.test.mjs.
 */
export const HONORS_RECIPE_REGISTRY = Object.freeze([
  LINEAR_MR_RATE_FROM_READING,
]);

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
  const forFamily = (Array.isArray(registry) ? registry : []).filter((recipe) => anchorFamilyId && recipe.anchor.familyIds.includes(anchorFamilyId));
  if (!forFamily.length) {
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.NO_VETTED_RECIPE,
      `A vetted no-AI Honors extension is not yet available for this concept (${conceptLabel(anchor)}). ${LEFT_UNCHANGED} Use the MathMaster AI or outside-AI Honors repair instead.`,
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
  const recipe = forFamily.find((candidate) => candidate.supportedCourses.includes(courseId));
  if (!recipe) {
    const written = [...new Set(forFamily.flatMap((candidate) => candidate.supportedCourses))].map(courseLabel).join(' or ');
    return unavailable(
      HONORS_RECIPE_UNAVAILABLE.COURSE_NOT_SUPPORTED,
      `The vetted no-AI Honors extension for ${conceptLabel(anchor)} is written for ${written}, and this is a ${courseLabel(courseId)} assignment, so a vetted no-AI Honors extension is not yet available for it. ${LEFT_UNCHANGED}`,
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
    questionFamily: { id: target.familyId, version: target.familyVersion, constraints: clone(target.constraints) },
    source: clone(story.source),
    context: clone(story.context),
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
    notes.push(`The Honors class is set to ${courseLabel(destination)}, but this is a ${courseLabel(courseId)} assignment. The extension stays ${courseLabel(courseId)}; check the class's course setting.`);
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
