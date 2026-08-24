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

const NO_CALCULATOR_DEFAULT_TYPES = new Set([
  'algebra', 'fraction', 'numberLine', 'stepAlgebra', 'graphing',
  'graphing2', 'stepAlgebra2', 'representationMatch', 'signSolutionAnalyzer',
]);

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

const defaultForQuestion = (questionSpec) => {
  const type = String(questionSpec?.toolId || questionSpec?.type || '');
  if (questionSpec?.assessedConstruct === 'computation' || NO_CALCULATOR_DEFAULT_TYPES.has(type)) return CALCULATOR_MODES.NONE;
  return CALCULATOR_MODES.BASIC;
};

export const resolveCalculatorPolicy = ({
  questionSpec = {},
  activityPolicy = {},
  studentSupportProfile = null,
  teacherCalculatorChoice = null,
  assessmentContext = null,
} = {}) => {
  const assessment = normalizeAssessmentContext(assessmentContext);
  if (assessment?.mode === CALCULATOR_MODES.NONE && !assessment.accommodationOverride) {
    return { available: false, mode: CALCULATOR_MODES.NONE, source: 'assessmentContext', reason: 'Calculator disabled by the active assessment context.' };
  }
  if (assessment?.forceAvailable && assessment.mode !== CALCULATOR_MODES.NONE) {
    return { available: true, mode: assessment.mode, source: 'assessmentContext', reason: 'Calculator mode set by the active assessment context.' };
  }

  const explicitQuestionMode = normalizeMode(questionSpec.calculatorPolicy) || CALCULATOR_MODES.INHERIT;
  const activityDefault = normalizeMode(activityPolicy.calculatorDefault) || 'questionSpecific';
  let basePolicy = explicitQuestionMode;
  let baseSource = 'questionDesign';

  if (basePolicy === CALCULATOR_MODES.INHERIT) {
    basePolicy = activityDefault;
    baseSource = 'activityPolicy';
  }
  if (basePolicy === 'questionSpecific') {
    basePolicy = normalizeMode(questionSpec?.rawSpec?.calculatorMode)
      || normalizeMode(questionSpec?.generator?.calculatorMode)
      || normalizeMode(questionSpec?.calculatorMode)
      || defaultForQuestion(questionSpec);
    baseSource = 'questionDesign';
  }
  if (basePolicy === CALCULATOR_MODES.TEACHER_CHOICE) {
    const teacherMode = normalizeMode(teacherCalculatorChoice);
    if (!CONCRETE_MODES.has(teacherMode)) {
      return { available: false, mode: CALCULATOR_MODES.NONE, source: 'teacherChoice', reason: 'Teacher calculator choice has not been set.' };
    }
    basePolicy = teacherMode;
    baseSource = 'teacherChoice';
  }

  const support = supportSettings(studentSupportProfile);
  const computationSkill = questionSpec.assessedConstruct === 'computation' || explicitQuestionMode === CALCULATOR_MODES.NONE;
  if (support.calculator && (!computationSkill || support.overrideComputation)) {
    const accommodationMode = assessment?.mode && assessment.mode !== CALCULATOR_MODES.NONE
      ? assessment.mode
      : support.mode;
    return { available: true, mode: accommodationMode, source: 'accommodation', reason: 'Enabled per the student support plan.' };
  }

  if (basePolicy === CALCULATOR_MODES.NONE || !CONCRETE_MODES.has(basePolicy)) {
    return {
      available: false,
      mode: CALCULATOR_MODES.NONE,
      source: baseSource,
      reason: computationSkill ? 'Calculator disabled because computation is the assessed skill.' : 'Calculator disabled by activity/question policy.',
    };
  }
  return { available: true, mode: basePolicy, source: baseSource, reason: 'Calculator allowed by the resolved question policy.' };
};
