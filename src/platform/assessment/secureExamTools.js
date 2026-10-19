/*
 * WHICH EXAM TOOLS A SECURE ITEM OFFERS: THE REFERENCE SHEET AND THE GRAPHING
 * CALCULATOR.
 *
 * Both are promises an exam makes, so both are read from the exam's own
 * policy (src/platform/policies/examPolicyResolver.js) and from nothing else.
 *
 * THE REFERENCE SHEET is the exam's `formulaSheet`. Only the Digital SAT
 * promises one (`satMathReference`); the ACT, TSIA2, ASVAB and a teacher's
 * course test say `none`, and get none. The exam header already told SAT
 * students "Reference sheet available" — this is what makes that true.
 *
 * THE GRAPHING CALCULATOR follows the calculator rule every secure item
 * already uses (resolveExamCalculatorPolicy, called exactly as
 * RichQuestionRuntime calls it): offered where that rule makes a calculator
 * available AND its mode is graphing. So an item the policy gives no
 * calculator never gets a graphing one — a TSIA2 item without one, an ASVAB
 * item, a course-test item marked `none` — and a course test whose blueprint
 * names a scientific calculator gets the scientific one only.
 *
 * AN UNKNOWN EXAM GETS NOTHING. getExamPolicy falls back to the Digital SAT
 * for a type it does not know, which is how a course test once showed "Digital
 * SAT Math · Reference sheet available" and the SAT calculator. These tools
 * are only offered for an exam type the policy table actually names.
 *
 * Pure: no DOM, no clock.
 */
import {
  COURSE_TEST_EXAM_TYPE, EXAM_POLICIES, getExamPolicy, resolveExamCalculatorPolicy,
} from '../policies/examPolicyResolver.js';
import { CALCULATOR_MODES } from '../policies/calculatorPolicy.js';

export const REFERENCE_SHEETS = Object.freeze({
  SAT_MATH: 'satMathReference',
});

const SUPPORTED_REFERENCE_SHEETS = new Set(Object.values(REFERENCE_SHEETS));

const NO_TOOLS = Object.freeze({
  referenceSheet: false,
  referenceSheetId: null,
  graphingCalculator: false,
  calculatorPolicy: null,
});

/** Is this an exam type the policy table names (not a fallback)? */
export const isKnownExamType = (examType) => (
  examType === COURSE_TEST_EXAM_TYPE
  || (typeof examType === 'string' && Object.prototype.hasOwnProperty.call(EXAM_POLICIES, examType))
);

/** The reference sheet an exam promises, or null. */
export const referenceSheetForExam = (examType) => {
  if (!isKnownExamType(examType)) return null;
  const sheet = String(getExamPolicy(examType).formulaSheet || 'none');
  return SUPPORTED_REFERENCE_SHEETS.has(sheet) ? sheet : null;
};

/**
 * @param examType               session.examType ('digitalSAT', 'act', 'tsia2',
 *                               'asvab', 'courseTest')
 * @param sessionCalculatorMode  session.calculatorMode (a course test's
 *                               blueprint setting travels here)
 * @param question               the issued item: its `calculatorPolicy`,
 *                               `examCalculatorMode`, `assessedConstruct`
 * @param studentSupportProfile  as RichQuestionRuntime passes it
 * @param accommodationConfirmed as RichQuestionRuntime passes it
 * @param calculatorPolicy       optional: the policy the runtime already
 *                               resolved for this item, so the two can never
 *                               disagree. When given it is used as is.
 * @returns {{ referenceSheet: boolean, referenceSheetId: string|null,
 *             graphingCalculator: boolean, calculatorPolicy: object|null }}
 */
export const resolveSecureExamTools = ({
  examType,
  sessionCalculatorMode = null,
  question = null,
  studentSupportProfile = null,
  accommodationConfirmed = false,
  calculatorPolicy = null,
} = {}) => {
  if (!isKnownExamType(examType)) return NO_TOOLS;
  const referenceSheetId = referenceSheetForExam(examType);
  const item = question && typeof question === 'object' ? question : {};
  const resolved = calculatorPolicy && typeof calculatorPolicy === 'object'
    ? calculatorPolicy
    : resolveExamCalculatorPolicy({
      examType,
      questionSpec: { ...item, sessionCalculatorMode },
      studentSupportProfile,
      accommodationConfirmed,
      isComputationSkill: item.assessedConstruct === 'computation',
    });
  return {
    referenceSheet: Boolean(referenceSheetId),
    referenceSheetId,
    graphingCalculator: resolved?.available === true && resolved.mode === CALCULATOR_MODES.GRAPHING,
    calculatorPolicy: resolved || null,
  };
};

export default resolveSecureExamTools;
