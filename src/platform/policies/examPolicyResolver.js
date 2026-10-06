import { EXAM_TYPES } from '../assessment/examDomainRegistry.js';
import { CALCULATOR_MODES } from './calculatorPolicy.js';

export const EXAM_POLICIES = Object.freeze({
  [EXAM_TYPES.DIGITAL_SAT]: Object.freeze({
    examType: EXAM_TYPES.DIGITAL_SAT,
    title: 'Digital SAT Math',
    calculatorMode: CALCULATOR_MODES.GRAPHING,
    calculatorAvailability: 'allMath',
    allowExternalApprovedCalculator: true,
    formulaSheet: 'satMathReference',
    totalQuestions: 44,
    timeLimitSeconds: 70 * 60,
    sections: Object.freeze([{ id: 'module1', questions: 22, timeLimitSeconds: 35 * 60 }, { id: 'module2', questions: 22, timeLimitSeconds: 35 * 60 }]),
    feedbackMode: 'teacherRelease',
    attemptsAllowed: 1,
    policyAsOf: '2026-08-08',
  }),
  [EXAM_TYPES.ACT]: Object.freeze({
    examType: EXAM_TYPES.ACT,
    title: 'ACT Mathematics',
    calculatorMode: CALCULATOR_MODES.GRAPHING,
    calculatorAvailability: 'mathSection',
    allowExternalApprovedCalculator: true,
    formulaSheet: 'none',
    totalQuestions: 45,
    timeLimitSeconds: 50 * 60,
    sections: Object.freeze([{ id: 'math', questions: 45, timeLimitSeconds: 50 * 60 }]),
    feedbackMode: 'teacherRelease',
    attemptsAllowed: 1,
    policyAsOf: '2026-08-08',
  }),
  [EXAM_TYPES.TSIA2]: Object.freeze({
    examType: EXAM_TYPES.TSIA2,
    title: 'TSIA2 Mathematics',
    calculatorMode: CALCULATOR_MODES.NONE,
    calculatorAvailability: 'itemLevelPopup',
    allowExternalApprovedCalculator: false,
    formulaSheet: 'none',
    totalQuestions: 20,
    timeLimitSeconds: null,
    sections: Object.freeze([{ id: 'crc', questions: 20, timeLimitSeconds: null }, { id: 'diagnosticIfNeeded', questions: 48, timeLimitSeconds: null }]),
    feedbackMode: 'teacherRelease',
    attemptsAllowed: 1,
    policyAsOf: '2026-08-08',
  }),
  [EXAM_TYPES.ASVAB]: Object.freeze({
    examType: EXAM_TYPES.ASVAB,
    title: 'CAT-ASVAB Math Simulation',
    calculatorMode: CALCULATOR_MODES.NONE,
    calculatorAvailability: 'prohibited',
    allowExternalApprovedCalculator: false,
    formulaSheet: 'none',
    totalQuestions: 30,
    timeLimitSeconds: 86 * 60,
    sections: Object.freeze([{ id: 'arithmeticReasoning', questions: 15, timeLimitSeconds: 55 * 60 }, { id: 'mathematicsKnowledge', questions: 15, timeLimitSeconds: 31 * 60 }]),
    feedbackMode: 'teacherRelease',
    attemptsAllowed: 1,
    policyAsOf: '2026-08-08',
  }),
});

/*
 * A TEACHER'S COURSE TEST IS NOT A SIMULATION, AND IT IS NOT THE SAT.
 *
 * Course tests (Test Cycle Tests and Retests) run on the same secure runtime as
 * the four simulations but have no published specification: their length,
 * timing and calculator come from the teacher's blueprint, carried on the
 * session. This browser used to have no entry for them at all, so
 * `getExamPolicy('courseTest')` fell back to Digital SAT — the header read
 * "Digital SAT Math · Reference sheet available", an untimed Test showed a
 * 70-minute SAT countdown that restarted on every refresh and then tried to
 * end the exam, and every item offered the SAT graphing calculator.
 *
 * So a course test has its own policy: no time limit of its own (only the
 * server's deadline, from an explicit blueprint limit, can time it), no
 * formula sheet claim, and a calculator decided by the session's blueprint
 * setting or, for `questionSpecific`, by each item.
 */
export const COURSE_TEST_EXAM_TYPE = 'courseTest';

const COURSE_TEST_POLICY = Object.freeze({
  examType: COURSE_TEST_EXAM_TYPE,
  title: 'Course Test',
  calculatorMode: CALCULATOR_MODES.NONE,
  calculatorAvailability: 'sessionOrItem',
  allowExternalApprovedCalculator: false,
  formulaSheet: 'none',
  totalQuestions: null,
  timeLimitSeconds: null,
  sections: Object.freeze([]),
  feedbackMode: 'teacherRelease',
  attemptsAllowed: 1,
  policyAsOf: '2026-10-05',
});

const concreteModes = new Set([
  CALCULATOR_MODES.NONE,
  CALCULATOR_MODES.BASIC,
  CALCULATOR_MODES.SQUARE_ROOT,
  CALCULATOR_MODES.SCIENTIFIC,
  CALCULATOR_MODES.GRAPHING,
]);

// The TSIA2 on-screen item calculator has assessment-defined modes. Scientific
// is intentionally excluded even though MathMaster supports it elsewhere.
const TSIA2_ITEM_CALCULATOR_MODES = new Set([
  CALCULATOR_MODES.NONE,
  CALCULATOR_MODES.BASIC,
  CALCULATOR_MODES.SQUARE_ROOT,
  CALCULATOR_MODES.GRAPHING,
]);

const calculatorSupport = (profile) => {
  // `supportProfile` is a key nothing in production writes — the teacher UI
  // stores the profile at `profile`. Preferring it first meant a student record
  // fell through to an empty object and the accommodation disappeared.
  const source = profile?.supportProfile || profile?.profile || profile || {};
  const accommodations = Array.isArray(source.accommodations) ? source.accommodations.map(String) : [];
  const entry = accommodations.find((value) => ['calculator', 'calculator-basic', 'calculator-scientific', 'calculator-graphing'].includes(value));
  const mode = entry === 'calculator-basic' ? CALCULATOR_MODES.BASIC : entry === 'calculator-graphing' ? CALCULATOR_MODES.GRAPHING : CALCULATOR_MODES.SCIENTIFIC;
  return { active: Boolean(entry), mode, overrideComputation: accommodations.includes('calculator-override-computation') || source.calculatorOverrideComputation === true };
};

export const getExamPolicy = (examType) => (
  examType === COURSE_TEST_EXAM_TYPE
    ? COURSE_TEST_POLICY
    : EXAM_POLICIES[examType] || EXAM_POLICIES[EXAM_TYPES.DIGITAL_SAT]
);

export const resolveExamCalculatorPolicy = ({ examType, questionSpec = {}, studentSupportProfile = null, isComputationSkill = false, accommodationConfirmed = false } = {}) => {
  const policy = getExamPolicy(examType);
  const support = calculatorSupport(studentSupportProfile);
  if (support.active && (!isComputationSkill || support.overrideComputation)) {
    /*
     * A simulation's calculator rule is a published exam regulation, so a
     * support-plan calculator that departs from it needs a proctor to confirm
     * the deviation. A teacher's own course test has no outside regulation to
     * deviate from: the student's documented accommodation IS the rule for
     * their classroom test, exactly as it is on every other assignment.
     */
    const wouldDeviateFromExam = examType !== COURSE_TEST_EXAM_TYPE && policy.calculatorMode === CALCULATOR_MODES.NONE;
    if (wouldDeviateFromExam && !accommodationConfirmed) {
      return {
        available: false,
        mode: CALCULATOR_MODES.NONE,
        source: 'accommodationPending',
        reason: 'A calculator support would deviate from the base simulation policy and requires explicit teacher/proctor confirmation.',
        simulationDeviation: true,
        requiresHumanConfirmation: true,
      };
    }
    return {
      available: true,
      mode: policy.calculatorMode === CALCULATOR_MODES.GRAPHING ? CALCULATOR_MODES.GRAPHING : support.mode,
      source: 'accommodation',
      reason: examType === COURSE_TEST_EXAM_TYPE
        ? 'Calculator enabled by your documented support plan.'
        : 'Calculator enabled by the documented MathMaster support plan for this simulation.',
      simulationDeviation: wouldDeviateFromExam,
      requiresHumanConfirmation: wouldDeviateFromExam,
    };
  }

  if (policy.calculatorAvailability === 'sessionOrItem') {
    // The blueprint's session-wide setting wins when it names a concrete mode;
    // `questionSpecific` (the default) defers to each item; anything else is
    // no calculator. Never the SAT graphing calculator by accident.
    const sessionMode = String(questionSpec.sessionCalculatorMode || '').trim();
    // An item's own calculator requirement travels as `calculatorPolicy` on
    // every issued question (buildSanitizedQuestion). Under the default
    // `questionSpecific` it is what decides: an item written to need a
    // scientific calculator gets one, an item marked `none` gets none.
    const itemMode = String(questionSpec.examCalculatorMode || questionSpec.calculatorMode || questionSpec.calculatorPolicy || '').trim();
    const requested = concreteModes.has(sessionMode) ? sessionMode : itemMode;
    const mode = concreteModes.has(requested) ? requested : CALCULATOR_MODES.NONE;
    if (mode === CALCULATOR_MODES.NONE) {
      return { available: false, mode: CALCULATOR_MODES.NONE, source: 'courseTestPolicy', reason: 'Your teacher has not provided a calculator for this question.' };
    }
    return { available: true, mode, source: 'courseTestPolicy', reason: 'Your teacher provides this calculator for this test.' };
  }

  if (policy.calculatorAvailability === 'itemLevelPopup') {
    const requested = String(questionSpec.examCalculatorMode || questionSpec.calculatorMode || '').trim();
    const allowedModes = examType === EXAM_TYPES.TSIA2 ? TSIA2_ITEM_CALCULATOR_MODES : concreteModes;
    const itemMode = allowedModes.has(requested) ? requested : CALCULATOR_MODES.NONE;
    if (itemMode === CALCULATOR_MODES.NONE) return { available: false, mode: CALCULATOR_MODES.NONE, source: 'examItemPolicy', reason: 'This TSIA2-style item does not provide a calculator.' };
    return { available: true, mode: itemMode, source: 'examItemPolicy', reason: 'Calculator mode is provided for this TSIA2-style item.' };
  }
  if (policy.calculatorMode === CALCULATOR_MODES.NONE) return { available: false, mode: CALCULATOR_MODES.NONE, source: 'examRegulation', reason: `${policy.title} simulation is configured without calculator access.` };
  return { available: true, mode: policy.calculatorMode, source: 'examRegulation', reason: `Calculator access follows the ${policy.title} simulation policy.` };
};

export const examAssessmentCalculatorContext = ({ examType, questionSpec = {}, studentSupportProfile = null, accommodationConfirmed = false } = {}) => {
  const resolved = resolveExamCalculatorPolicy({ examType, questionSpec, studentSupportProfile, accommodationConfirmed, isComputationSkill: questionSpec.assessedConstruct === 'computation' });
  return { mode: resolved.mode, forceAvailable: resolved.available, accommodationOverride: resolved.source === 'accommodation' };
};
