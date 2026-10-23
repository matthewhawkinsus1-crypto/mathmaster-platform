export const CALCULATOR_MODES = Object.freeze({
  NONE: 'none',
  BASIC: 'basic',
  SQUARE_ROOT: 'squareRoot',
  SCIENTIFIC: 'scientific',
  GRAPHING: 'graphing',
  TEACHER_CHOICE: 'teacherChoice',
  INHERIT: 'inherit',
});

const CONCRETE_MODES = new Set([
  CALCULATOR_MODES.NONE,
  CALCULATOR_MODES.BASIC,
  CALCULATOR_MODES.SQUARE_ROOT,
  CALCULATOR_MODES.SCIENTIFIC,
  CALCULATOR_MODES.GRAPHING,
]);

const BASE_CALCULATOR_BUTTONS = Object.freeze(['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '^', '=']);
const SCIENTIFIC_CALCULATOR_BUTTONS = Object.freeze(['sin(', 'cos(', 'tan(', 'sqrt(', 'log(', 'ln(', 'π']);
const SQUARE_ROOT_CALCULATOR_BUTTONS = Object.freeze(['√(', ...BASE_CALCULATOR_BUTTONS.filter((button) => button !== '^')]);

export const getCalculatorButtonsForMode = (mode) => {
  if (mode === CALCULATOR_MODES.SQUARE_ROOT) return [...SQUARE_ROOT_CALCULATOR_BUTTONS];
  if ([CALCULATOR_MODES.SCIENTIFIC, CALCULATOR_MODES.GRAPHING].includes(mode)) {
    return [...SCIENTIFIC_CALCULATOR_BUTTONS, ...BASE_CALCULATOR_BUTTONS];
  }
  return [...BASE_CALCULATOR_BUTTONS];
};

export const getCalculatorModeLabel = (mode) => {
  if (mode === CALCULATOR_MODES.SQUARE_ROOT) return 'SQUARE ROOT';
  if (mode === CALCULATOR_MODES.SCIENTIFIC) return 'SCIENTIFIC';
  if (mode === CALCULATOR_MODES.GRAPHING) return 'GRAPHING';
  if (mode === CALCULATOR_MODES.BASIC) return 'BASIC';
  return String(mode || CALCULATOR_MODES.BASIC).replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
};

/**
 * The calculator drawer's own title. A "graphing" policy allows graphing
 * technology, but graphs are drawn in the question's graph workspace — the
 * drawer only computes. Titled "GRAPHING CALCULATOR", it sent students told to
 * "enter f(x) into the built-in graphing calculator" to a keypad with nowhere
 * to enter a function (live QA, Algebra I DOL #2).
 */
export const getCalculatorDrawerLabel = (mode) => (
  mode === CALCULATOR_MODES.GRAPHING ? 'SCIENTIFIC' : getCalculatorModeLabel(mode)
);

/**
 * Mode-level guard used after expression normalization. The Square Root
 * calculator is intentionally narrower than the generic scientific evaluator:
 * students may use ordinary arithmetic and sqrt, but keyboard entry must not
 * unlock trig, logarithms, constants, or exponentiation that the UI does not
 * expose.
 */
export const calculatorModeAllowsExpression = (normalizedExpression, mode) => {
  if (mode !== CALCULATOR_MODES.SQUARE_ROOT) return true;
  const text = String(normalizedExpression ?? '');
  if (text.includes('^')) return false;
  const names = text.match(/[A-Za-z]+/g) || [];
  return names.every((name) => name === 'sqrt');
};

export const ASSESSMENT_CALCULATOR_CONTEXTS = Object.freeze({
  sat: Object.freeze({ mode: CALCULATOR_MODES.GRAPHING, forceAvailable: true, accommodationOverride: false }),
  digitalSat: Object.freeze({ mode: CALCULATOR_MODES.GRAPHING, forceAvailable: true, accommodationOverride: false }),
  asvab: Object.freeze({ mode: CALCULATOR_MODES.NONE, forceAvailable: false, accommodationOverride: false }),
});

const normalizeMode = (value) => {
  const text = String(value || '').trim();
  if (CONCRETE_MODES.has(text) || text === CALCULATOR_MODES.TEACHER_CHOICE || text === CALCULATOR_MODES.INHERIT || text === 'questionSpecific') return text;
  return null;
};

const normalizeAssessmentContext = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return ASSESSMENT_CALCULATOR_CONTEXTS[value] || null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const mode = normalizeMode(value.mode);
  if (!CONCRETE_MODES.has(mode)) return null;
  return {
    mode,
    forceAvailable: value.forceAvailable === true,
    accommodationOverride: value.accommodationOverride === true,
  };
};

const supportSettings = (profile) => {
  const source = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  // Three shapes reach this function and all three have to work, because a
  // student must not lose a calculator by walking into a different part of the
  // platform:
  //   { accommodations: [...] }               the stored profile
  //   { supportProfile: { accommodations } }  a key several callers preferred
  //                                           and nothing in production writes
  //   { profile: { accommodations } }         a whole student record
  // The middle one is the reason this comment exists: four call sites read it
  // FIRST, so a caller passing a student record fell straight through to an
  // empty list and the accommodation silently vanished.
  const accommodations = [
    source.accommodations,
    source.supportProfile?.accommodations,
    source.profile?.accommodations,
  ].find(Array.isArray)?.map(String) || [];
  const calculatorAccommodation = accommodations.find((value) => [
    'calculator', 'calculator-basic', 'calculator-scientific', 'calculator-graphing',
  ].includes(value));
  const mode = calculatorAccommodation === 'calculator-basic'
    ? CALCULATOR_MODES.BASIC
    : calculatorAccommodation === 'calculator-graphing'
      ? CALCULATOR_MODES.GRAPHING
      : CALCULATOR_MODES.SCIENTIFIC;
  return {
    calculator: Boolean(calculatorAccommodation),
    mode,
    overrideComputation: accommodations.includes('calculator-override-computation') || source.calculatorOverrideComputation === true,
  };
};

const defaultForQuestion = () => CALCULATOR_MODES.BASIC;

// How much a calculator can do, for "the stricter of two settings". Basic and
// Square Root are equally strong: neither has the other's key.
const MODE_STRENGTH = Object.freeze({
  [CALCULATOR_MODES.NONE]: 0,
  [CALCULATOR_MODES.BASIC]: 1,
  [CALCULATOR_MODES.SQUARE_ROOT]: 1,
  [CALCULATOR_MODES.SCIENTIFIC]: 2,
  [CALCULATOR_MODES.GRAPHING]: 3,
});

// Exit tickets, quizzes and tests: the roles whose outcome feedback waits.
const ASSESSMENT_ACTIVITY_ROLES = new Set(['dol', 'quiz', 'test']);
const isAssessmentActivity = (activityPolicy = {}) => (
  ASSESSMENT_ACTIVITY_ROLES.has(String(activityPolicy?.role || '').toLowerCase())
  || (typeof activityPolicy?.feedback === 'string' && activityPolicy.feedback !== 'immediate')
);

/**
 * WHICH CALCULATOR A STUDENT GETS, IN THIS ORDER (pass 3, PR-25; the order
 * of levels 2 and 3 is the owner's, 2026-10-20: the question wins, as #239
 * had it):
 *
 *   1. Assessment rules — the active assessment context (a secure exam, a
 *      course Test's blueprint) decides outright.
 *   2. The question's own setting — its `calculatorPolicy`, the activity's
 *      default when that inherits, then the mode the item embeds. A question
 *      set to "teacher choice" uses the teacher's choice; with none set it
 *      has no setting of its own here.
 *   3. The assignment's setting — `toolPolicy.calculator` on the assignment
 *      ("graphing" for a whole lesson), for every item with no setting of its
 *      own on ordinary work. `inherit` (the schema default) and
 *      `questionSpecific` mean "no setting here".
 *   4. The platform default (basic).
 *
 * Two stricter rules hold whatever the assignment says:
 *   - a skill that is assessed without a calculator (the question says
 *     `none`) gets none — only a documented accommodation that overrides
 *     computation gives one back;
 *   - on an exit ticket, quiz or test the assignment setting may still narrow
 *     the question's own calculator but never widen it: the stricter of the
 *     two is used. There an item with no setting of its own counts as having
 *     the platform default, so "graphing" leaves it basic and "none" turns it
 *     off (owner, 2026-10-23). On other work the question's own is used as it
 *     is.
 *
 * A student's documented calculator accommodation applies after all of this,
 * exactly as before. Any assessment context skips level 2 entirely: what the
 * context does not force is the question's to decide, never the assignment's.
 *
 * `keyPointsAllowed` (every result): may a graphing calculator LIST zeros,
 * minimum and maximum here? Not on an exit ticket, quiz or test (or any
 * activity whose outcome feedback waits) unless the item itself authored a
 * graphing calculator — there a listed vertex or zero is the answer the item
 * asks for. Graph, trace and table still follow the policy. QuestionEngine
 * also allows them once outcome feedback is shown (released).
 */
/**
 * Does the graphing calculator list zeros, minimum and maximum right now?
 * Where the policy allows them, or once the WHOLE assessment's feedback is
 * released (`assessmentReviewReleased`). Not on one question's own release:
 * a DOL question that closes (correct, or out of tries) shows its feedback
 * while the exit ticket is still open, and a listed vertex on that question's
 * calculator would answer the next one (pass 3 review, B1').
 */
export const calculatorKeyPointsShown = ({ policy = null, assessmentReviewReleased = false } = {}) => (
  policy?.keyPointsAllowed === true || assessmentReviewReleased === true
);

export const resolveCalculatorPolicy = ({
  questionSpec = {},
  activityPolicy = {},
  studentSupportProfile = null,
  teacherCalculatorChoice = null,
  assignmentCalculatorMode = null,
  assessmentContext = null,
} = {}) => {
  const explicitQuestionMode = normalizeMode(questionSpec.calculatorPolicy) || CALCULATOR_MODES.INHERIT;
  const embeddedQuestionMode = normalizeMode(questionSpec?.rawSpec?.calculatorMode)
    || normalizeMode(questionSpec?.generator?.calculatorMode)
    || normalizeMode(questionSpec?.calculatorMode);
  const keyPointsAllowed = !isAssessmentActivity(activityPolicy)
    || explicitQuestionMode === CALCULATOR_MODES.GRAPHING
    || embeddedQuestionMode === CALCULATOR_MODES.GRAPHING;
  const policy = (result) => ({ ...result, keyPointsAllowed });

  const assessment = normalizeAssessmentContext(assessmentContext);
  if (assessment?.mode === CALCULATOR_MODES.NONE && !assessment.accommodationOverride) {
    return policy({ available: false, mode: CALCULATOR_MODES.NONE, source: 'assessmentContext', reason: 'Calculator disabled by the active assessment context.' });
  }
  if (assessment?.forceAvailable && assessment.mode !== CALCULATOR_MODES.NONE) {
    return policy({ available: true, mode: assessment.mode, source: 'assessmentContext', reason: 'Calculator mode set by the active assessment context.' });
  }

  const activityDefault = normalizeMode(activityPolicy.calculatorDefault) || 'questionSpecific';
  let basePolicy = explicitQuestionMode;
  let baseSource = 'questionDesign';

  if (basePolicy === CALCULATOR_MODES.INHERIT) {
    basePolicy = activityDefault;
    baseSource = 'activityPolicy';
  }
  if (basePolicy === 'questionSpecific') {
    basePolicy = embeddedQuestionMode || defaultForQuestion(questionSpec);
    baseSource = embeddedQuestionMode ? 'questionDesign' : 'platformDefault';
  }
  let teacherChoiceMissing = false;
  if (basePolicy === CALCULATOR_MODES.TEACHER_CHOICE) {
    const teacherMode = normalizeMode(teacherCalculatorChoice);
    teacherChoiceMissing = !CONCRETE_MODES.has(teacherMode);
    basePolicy = teacherChoiceMissing ? CALCULATOR_MODES.NONE : teacherMode;
    baseSource = 'teacherChoice';
  }

  const skillDeclaresNoCalculator = explicitQuestionMode === CALCULATOR_MODES.NONE
    || embeddedQuestionMode === CALCULATOR_MODES.NONE;

  // 3. The assignment's setting, for an item with none of its own.
  const assignmentSetting = normalizeMode(assignmentCalculatorMode);
  const assignmentMode = assignmentSetting === CALCULATOR_MODES.TEACHER_CHOICE
    ? normalizeMode(teacherCalculatorChoice)
    : assignmentSetting;
  if (!assessment && CONCRETE_MODES.has(assignmentMode)) {
    const assessmentActivity = isAssessmentActivity(activityPolicy);
    // A "teacher choice" question with no choice set has no mode of its own:
    // the assignment's setting is the teacher's choice.
    const questionAuthoredMode = baseSource === 'platformDefault' || teacherChoiceMissing ? null : basePolicy;
    // On an exit ticket, quiz or test an item with no setting of its own keeps
    // the platform default as its own, so the assignment may narrow it but
    // never widen it. A "graphing" assignment gave such an item the graph,
    // trace and table, which can show the integer zeros or the symmetry the
    // item asks for (owner, 2026-10-23: B-96 / C1-44). On other work it takes
    // the assignment's setting, as before.
    const questionOwnMode = questionAuthoredMode
      ?? (assessmentActivity && baseSource === 'platformDefault' ? basePolicy : null);
    if (skillDeclaresNoCalculator) {
      basePolicy = CALCULATOR_MODES.NONE;
      baseSource = 'questionDesign';
    } else if (
      CONCRETE_MODES.has(questionOwnMode)
      && (!assessmentActivity || MODE_STRENGTH[questionOwnMode] <= MODE_STRENGTH[assignmentMode])
    ) {
      // 2. The question's own: as it is on other work, and the stricter of
      // the two on an exit ticket, quiz or test.
    } else {
      basePolicy = assignmentMode;
      baseSource = 'assignmentToolPolicy';
      teacherChoiceMissing = false;
    }
  }
  if (teacherChoiceMissing) {
    return policy({ available: false, mode: CALCULATOR_MODES.NONE, source: 'teacherChoice', reason: 'Teacher calculator choice has not been set.' });
  }

  const support = supportSettings(studentSupportProfile);
  if (support.calculator && (!skillDeclaresNoCalculator || support.overrideComputation)) {
    const accommodationMode = assessment?.mode && assessment.mode !== CALCULATOR_MODES.NONE
      ? assessment.mode
      : support.mode;
    return policy({ available: true, mode: accommodationMode, source: 'accommodation', reason: 'Enabled per the student support plan.' });
  }
  // A context that allows a calculator only by accommodation, for a student
  // without one: none.
  if (assessment?.mode === CALCULATOR_MODES.NONE) {
    return policy({ available: false, mode: CALCULATOR_MODES.NONE, source: 'assessmentContext', reason: 'Calculator disabled by the active assessment context.' });
  }

  if (basePolicy === CALCULATOR_MODES.NONE || !CONCRETE_MODES.has(basePolicy)) {
    return policy({
      available: false,
      mode: CALCULATOR_MODES.NONE,
      source: baseSource,
      reason: skillDeclaresNoCalculator
        ? 'No calculator is allowed for this skill.'
        : baseSource === 'assignmentToolPolicy'
          ? 'Your teacher turned the calculator off for this assignment.'
          : 'Calculator disabled by activity/question policy.',
    });
  }
  return policy({
    available: true,
    mode: basePolicy,
    source: baseSource,
    reason: baseSource === 'assignmentToolPolicy' ? 'Calculator set by this assignment.' : 'Calculator allowed by the resolved question policy.',
  });
};
