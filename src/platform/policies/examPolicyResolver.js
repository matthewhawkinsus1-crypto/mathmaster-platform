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

export const getExamPolicy = (examType) => EXAM_POLICIES[examType] || EXAM_POLICIES[EXAM_TYPES.DIGITAL_SAT];

export const resolveExamCalculatorPolicy = ({ examType, questionSpec = {}, studentSupportProfile = null, isComputationSkill = false, accommodationConfirmed = false } = {}) => {
  const policy = getExamPolicy(examType);
  const support = calculatorSupport(studentSupportProfile);
  if (support.active && (!isComputationSkill || support.overrideComputation)) {
    const wouldDeviateFromExam = policy.calculatorMode === CALCULATOR_MODES.NONE;
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
      reason: 'Calculator enabled by the documented MathMaster support plan for this simulation.',
      simulationDeviation: wouldDeviateFromExam,
      requiresHumanConfirmation: wouldDeviateFromExam,
    };
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
