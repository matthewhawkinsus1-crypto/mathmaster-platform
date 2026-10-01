/*
 * GRADING A FAMILY-BACKED QUESTION ON THE SERVER.
 *
 * For every other generated question the server cannot re-create what the
 * student saw, so it stores the browser's verdict (`gradedBy: 'client'`). A
 * family-backed question is different: the generator is shared code and the
 * student's work carries a delivery pin, so ingestion can rebuild the exact
 * instance and mark the raw response itself with the same grading contract the
 * browser used.
 *
 * WHICH PIN. The pin sent with this attempt describes precisely what that
 * device displayed, so it is preferred; the canonical record's pin (written by
 * an earlier attempt) is the fallback for envelopes from older clients. A pin
 * for a different variant is never used — after "New Question" the old
 * instance is not the question being answered.
 *
 * Pure: no Firestore, no clock.
 */

import { isFamilyBackedQuestion, reproduceFamilyQuestionFromPin } from './questionFamilyInstance.mjs';
import { ALLOCATION_BASIS, normalizeDeliveryPin, resolveLearnerSeat } from './questionGenerationIdentity.mjs';
import { gradeOrdinaryResponse, serverGradingSupport } from './ordinaryResponseGrading.mjs';
import { evaluateExpression } from './pathQuestionGeneration.mjs';

export const FAMILY_DELIVERY_VERIFICATION = Object.freeze({
  SEAT_VERIFIED: 'seat-verified',
  SEAT_MISMATCH: 'seat-mismatch',
  PROVISIONAL: 'provisional',
  SHARED: 'shared',
  UNSEATED_ASSIGNMENT: 'unseated-assignment',
});

/**
 * How the pin relates to the seat the server can see for this student.
 * Informational — recorded for diagnostics, never used to refuse work the
 * student has already done against the question they were shown.
 */
export const verifyDeliveryPinSeat = ({ assignment = null, studentId = null, classId = null, pin = null } = {}) => {
  const normalized = normalizeDeliveryPin(pin);
  if (!normalized) return null;
  if (normalized.basis === ALLOCATION_BASIS.SHARED) return FAMILY_DELIVERY_VERIFICATION.SHARED;
  const seatInfo = resolveLearnerSeat({ assignment, studentId, classId });
  if (seatInfo.basis !== ALLOCATION_BASIS.SEATED) {
    return normalized.basis === ALLOCATION_BASIS.PROVISIONAL
      ? FAMILY_DELIVERY_VERIFICATION.PROVISIONAL
      : FAMILY_DELIVERY_VERIFICATION.UNSEATED_ASSIGNMENT;
  }
  if (normalized.basis === ALLOCATION_BASIS.PROVISIONAL) return FAMILY_DELIVERY_VERIFICATION.PROVISIONAL;
  return normalized.seat === seatInfo.seat
    ? FAMILY_DELIVERY_VERIFICATION.SEAT_VERIFIED
    : FAMILY_DELIVERY_VERIFICATION.SEAT_MISMATCH;
};

/**
 * The question to grade against.
 *
 *   { familyBacked: false, question }                 any other question
 *   { familyBacked: true, question, pin, verification } rebuilt instance
 *   { familyBacked: true, question: null, reason }     cannot rebuild: the
 *                                                       caller keeps today's
 *                                                       client-verdict path
 */
export const resolveFamilyQuestionForGrading = ({
  assignment = null,
  question = null,
  questionIndex = 0,
  variantIndex = 0,
  canonicalRecord = null,
  claimedDelivery = null,
  studentId = null,
  classId = null,
} = {}) => {
  if (!isFamilyBackedQuestion(question)) return { familyBacked: false, question, pin: null, reason: null };
  const variant = Math.max(0, Math.floor(Number(variantIndex) || 0));
  const claimed = normalizeDeliveryPin(claimedDelivery);
  const canonical = normalizeDeliveryPin(canonicalRecord?.familyDelivery);
  const pin = claimed?.variant === variant ? claimed : canonical?.variant === variant ? canonical : null;
  if (!pin) return { familyBacked: true, question: null, pin: null, reason: 'family-delivery-missing' };
  const reproduced = reproduceFamilyQuestionFromPin({
    question,
    assignmentId: assignment?.id || '',
    storageIndex: questionIndex,
    pin,
  });
  if (reproduced.error) {
    return { familyBacked: true, question: null, pin, reason: `family-${reproduced.error}` };
  }
  return {
    familyBacked: true,
    question: reproduced.question,
    pin,
    reason: null,
    verification: verifyDeliveryPinSeat({ assignment, studentId, classId, pin }),
    changedFromCanonical: Boolean(canonical && canonical.variant === variant && canonical.fingerprint !== pin.fingerprint),
  };
};

/* ---------------------------------------------------------------------------
 * Marking a family instance's raw response — the server's view.
 * ------------------------------------------------------------------------- */


/** "\frac{-14}{-7}" -> "(-14)/(-7)", "21-6" stays; null for anything else. */
const latexNumericToExpression = (latex) => {
  let text = String(latex ?? '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\[dt]?frac/g, '\\frac')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, '');
  for (let guard = 0; guard < 20 && text.includes('\\frac'); guard += 1) {
    const next = text.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/, '($1)/($2)');
    if (next === text) return null;
    text = next;
  }
  if (/[\\{}]/.test(text)) return null;
  return text;
};

/**
 * Check a Step Algebra final equation ("x = 21-6", "3 = x") against the
 * instance's answer. The workspace only permits balanced steps, so reaching
 * an isolated variable already means the student solved it; this confirms
 * the final value really is the instance's answer before any credit counts.
 */
export const gradeStepAlgebraFinalAnswer = ({ question = null, responseValue = '' } = {}) => {
  const expected = Number(question?.generatedAnswer);
  const variable = String(question?.variable || question?.objective?.variable || 'x').trim();
  if (!Number.isFinite(expected) || !variable) return { graded: false, reason: 'no-step-answer-key', isCorrect: false };
  const equation = String(responseValue ?? '').split('|')[0];
  const sides = equation.split('=');
  if (sides.length !== 2) return { graded: false, reason: 'step-answer-unparseable', isCorrect: false };
  const [left, right] = sides.map((side) => side.replace(/\s+/g, ''));
  const isVariable = (side) => side.replace(/[{}]/g, '') === variable;
  const valueSide = isVariable(left) ? right : isVariable(right) ? left : null;
  if (valueSide === null) return { graded: true, reason: null, isComplete: true, isCorrect: false };
  const expression = latexNumericToExpression(valueSide);
  const value = expression === null ? null : evaluateExpression(expression, {});
  if (value === null) return { graded: false, reason: 'step-answer-unparseable', isCorrect: false };
  return { graded: true, reason: null, isComplete: true, isCorrect: Math.abs(value - expected) <= 1e-9 };
};

/** Can the server mark a response to this built family instance? */
export const familyInstanceServerGradable = (question) => (
  serverGradingSupport(question).supported
  || (String(question?.type || '') === 'stepAlgebra' && Number.isFinite(Number(question?.generatedAnswer)))
);

/**
 * Mark a raw response against a built family instance: the ordinary grading
 * contract where it applies, the verified Step Algebra final answer otherwise.
 */
export const gradeFamilyInstanceResponse = ({ question = null, response = null } = {}) => {
  if (serverGradingSupport(question).supported) return gradeOrdinaryResponse({ question, response });
  if (String(question?.type || '') === 'stepAlgebra') {
    return gradeStepAlgebraFinalAnswer({ question, responseValue: response?.value });
  }
  return { graded: false, reason: `unsupported-type:${question?.type || 'unknown'}`, isCorrect: false };
};
