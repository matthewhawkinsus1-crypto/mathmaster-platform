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
// LIGHT: the support question is answered from the grading manifest alone.
// The graders themselves are in serverGrading/serverResponseGrading.mjs,
// which this module must not import — the student app imports this file.
import { serverResponseGradingSupport } from './serverGrading/gradingSupport.mjs';
import { deliveredQuestionForGrading } from './serverGrading/deliveredQuestion.mjs';
import { gradeStepAlgebraFinalAnswer } from './serverGrading/stepAlgebraFinalAnswer.mjs';

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
 *
 * Through the SAME shared grading registry every other path uses: an ordinary
 * type, a registry tool mode with a shared grader, or the Step Algebra
 * final-answer check. Recovery readiness, Pre-Flight and grading therefore
 * cannot disagree about which family tools the server can mark. The marking
 * itself is `gradeFamilyInstanceResponse` in
 * serverGrading/serverResponseGrading.mjs (heavy: it loads every grader).
 * ------------------------------------------------------------------------- */

/** Can the server mark a response to this built family instance? */
export const familyInstanceServerGradable = (question) => serverResponseGradingSupport(question).supported === true;

/** Why it cannot, when it cannot: the registry's reason and documented blocker. */
export const familyInstanceGradingSupport = (question) => serverResponseGradingSupport(question);

/**
 * THE QUESTION THE SERVER GRADES, for any stored question.
 *
 * Exactly what QuestionEngine renders: the stored question with the runtime
 * repair applied, then — for a Question Family slot — the instance rebuilt
 * from the validated delivery pin, then the word-problem layer's
 * normalization. Ingestion, the deadline finalizer and Recovery all call this,
 * so one raw response gets one verdict whichever path delivered it.
 *
 * Returns resolveFamilyQuestionForGrading's shape: `question` is null (with a
 * `reason`) only for a family slot whose instance cannot be rebuilt.
 */
export const resolveServerGradingQuestion = ({
  assignment = null,
  question = null,
  questionIndex = 0,
  variantIndex = 0,
  canonicalRecord = null,
  claimedDelivery = null,
  studentId = null,
  classId = null,
} = {}) => {
  if (!question || typeof question !== 'object') return { familyBacked: false, question: null, pin: null, reason: 'question-index-not-found' };
  const delivered = deliveredQuestionForGrading(question);
  const family = resolveFamilyQuestionForGrading({
    assignment,
    question: delivered,
    questionIndex,
    variantIndex,
    canonicalRecord,
    claimedDelivery,
    studentId,
    classId,
  });
  if (!family.familyBacked) return { ...family, question: delivered };
  if (!family.question) return family;
  return { ...family, question: deliveredQuestionForGrading(family.question) };
};

export { gradeStepAlgebraFinalAnswer };
