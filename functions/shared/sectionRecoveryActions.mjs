/*
 * PRACTICE-BASED RECOVERY: THE SERVER ACTIONS THAT CHANGE (AND GRADE) IT.
 *
 * Split from sectionRecoveryService.mjs, which the student app also imports to
 * build its Recovery panel. This half marks answers through the shared grading
 * registry (serverGrading/serverResponseGrading.mjs) — which loads every
 * tool's grader — so it is imported only by the `advanceSectionRecovery`
 * Cloud Function and the tests.
 *
 * Every question a Recovery shows is a Question Family instance identified by
 * a delivery pin, and every answer that affects a grade is marked HERE, on the
 * server, against the instance rebuilt from that pin — the same instance the
 * student's QuestionEngine rendered (runtime repair applied to the template,
 * then the word-problem layer) — never from a verdict a browser sends.
 *
 * Pure: no Firestore, no clock (`at` is a parameter).
 */
import { RECOVERY_TYPE } from './recoveryPolicy.mjs';
import { RECOVERY_STATE } from './sectionRecoveryEligibility.mjs';
import { buildRecoveryAssessmentPlan } from './sectionRecoveryPlan.mjs';
import {
  RecoveryTransitionError,
  applyRecoveryCompletion,
  applyRecoveryPracticeAttempt,
  applyRecoveryStart,
  applyRecoveryUnlock,
} from './sectionRecoveryRecord.mjs';
import { reproduceFamilyQuestionFromPin } from './questionFamilyInstance.mjs';
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from './serverGrading/deliveredQuestion.mjs';
import { gradeFamilyInstanceResponse } from './serverGrading/serverResponseGrading.mjs';
import {
  RECOVERY_ACTION,
  attemptWasIndependent,
  nextRecoveryPracticeItem,
  recoveryQuestionWeight,
} from './sectionRecoveryService.mjs';

/**
 * The instance a pin names, built exactly as QuestionEngine builds it: from
 * the runtime-repaired template, then normalized by the word-problem layer.
 * (The template itself is NOT normalized first: the plan dealt this pin from
 * the stored template, and a local template's fingerprint covers `context`.)
 */
const reproduceDeliveredFamilyQuestion = ({ question, assignmentId, storageIndex, pin }) => {
  const reproduced = reproduceFamilyQuestionFromPin({
    question: runtimeRepairedQuestion(question),
    assignmentId,
    storageIndex,
    pin,
  });
  return reproduced.error ? reproduced : { ...reproduced, question: deliveredQuestionForGrading(reproduced.question) };
};

const refuse = (code, message) => { throw new RecoveryTransitionError(code, message); };

const expectedPracticeSlotPrefix = (context) => `${context.assignmentId}|recoveryPractice:${context.section}:o`;

/**
 * Apply one student action. Returns { record, changed, gradeChanged, response }.
 * Throws RecoveryTransitionError (with a code) for anything not allowed.
 */
export const runSectionRecoveryAction = ({ context, action, payload = {}, at = Date.now() } = {}) => {
  if (!context) refuse('recovery-context-missing');
  const { section, policy, eligibility } = context;

  if (action === RECOVERY_ACTION.STATUS) {
    return { record: context.record, changed: false, gradeChanged: false, response: { eligibility, mastery: context.mastery, nextPracticeItem: nextRecoveryPracticeItem(context) } };
  }

  // The assignment's final submission date is the Recovery end date: nothing
  // that could change a Recovery — or the grade it feeds — is accepted after it.
  if (eligibility.reason === 'recovery-window-ended') {
    refuse('recovery-window-ended', 'The final submission date for this assignment has passed, so Recovery is closed.');
  }

  if (action === RECOVERY_ACTION.PRACTICE) {
    if (![RECOVERY_STATE.LOCKED, RECOVERY_STATE.UNLOCKED].includes(eligibility.state)) {
      refuse('practice-not-available', 'Recovery Practice is not available right now.');
    }
    const pin = normalizeDeliveryPin(payload.pin);
    if (!pin || !pin.slot.startsWith(expectedPracticeSlotPrefix(context))) refuse('practice-pin-invalid');
    const slot = context.readiness.readySlots.find((candidate) => pin.slot.endsWith(`|${candidate.questionId || `index-${candidate.storageIndex}`}`));
    if (!slot) refuse('practice-pin-invalid', 'That practice question does not belong to this Recovery.');
    if (context.seenFingerprints.includes(pin.fingerprint)) refuse('practice-item-repeated', 'That practice question was already answered.');
    const reproduced = reproduceDeliveredFamilyQuestion({
      question: context.questionsByIndex[slot.storageIndex],
      assignmentId: context.assignmentId,
      storageIndex: slot.storageIndex,
      pin,
    });
    if (reproduced.error) refuse('practice-pin-invalid', 'That practice question could not be verified.');
    // A forfeit is an item the student could not finish (for example every
    // try in a step tool used up). It is recorded as incorrect without
    // grading — it can only lower mastery, so it needs no verification — and
    // it is what stops an unfinishable item from blocking Practice. There is
    // no free skip: moving on always costs the item.
    const grading = payload.forfeit === true
      ? { graded: true, isCorrect: false }
      : gradeFamilyInstanceResponse({ question: reproduced.question, response: payload.response });
    if (!grading.graded) refuse('practice-response-ungradable', grading.reason || 'The answer could not be read.');
    const applied = applyRecoveryPracticeAttempt({
      record: context.record,
      section,
      item: {
        key: pin.fingerprint,
        familyId: reproduced.family.id,
        coverageKey: slot.coverageKey,
        correct: grading.isCorrect === true,
        independent: attemptWasIndependent(payload.supportUsage),
        solutionViewed: payload.solutionViewed === true,
        attempts: payload.attempts,
      },
      practiceIndex: Number.isInteger(Number(payload.practiceIndex)) ? Number(payload.practiceIndex) : null,
      policy,
      requiredCoverage: context.requiredCoverage,
      at,
    });
    let nextRecord = applied.record;
    // Mastery shown: unlock in the same write, with the evidence that did it.
    if (applied.mastery.met && nextRecord.status === 'practicing') {
      nextRecord = applyRecoveryUnlock({ record: nextRecord, section, mastery: applied.mastery, at }).record;
    }
    return {
      record: nextRecord,
      changed: true,
      gradeChanged: false,
      response: {
        isCorrect: grading.isCorrect === true,
        mastery: applied.mastery,
        unlocked: nextRecord.status === 'unlocked',
      },
    };
  }

  if (action === RECOVERY_ACTION.UNLOCK) {
    if (eligibility.state !== RECOVERY_STATE.UNLOCKED) refuse('recovery-locked', 'More Practice is needed before this Recovery unlocks.');
    const masteryRequired = eligibility.type === RECOVERY_TYPE.RECOVERY || policy.mastery.excusedRequiresMastery;
    const applied = applyRecoveryUnlock({ record: context.record, section, mastery: context.mastery, masteryRequired, at });
    return { record: applied.record, changed: true, gradeChanged: false, response: { unlocked: true } };
  }

  if (action === RECOVERY_ACTION.START) {
    if (eligibility.state === RECOVERY_STATE.IN_PROGRESS) {
      return { record: context.record, changed: false, gradeChanged: false, response: { plan: context.record.plan } };
    }
    if (eligibility.state !== RECOVERY_STATE.UNLOCKED) refuse('recovery-locked', 'This Recovery is not unlocked.');
    let record = context.record;
    if (!record || record.status === 'practicing') {
      const masteryRequired = eligibility.type === RECOVERY_TYPE.RECOVERY || policy.mastery.excusedRequiresMastery;
      record = applyRecoveryUnlock({ record, section, mastery: context.mastery, masteryRequired, at }).record;
    }
    const plan = buildRecoveryAssessmentPlan({
      assignmentId: context.assignmentId,
      section,
      readySlots: context.readiness.readySlots,
      questionsByIndex: context.questionsByIndex,
      questionCount: section === 'warmup' ? policy.warmup.questionCount : 0,
      seatInfo: context.seatInfo,
      seenFingerprints: context.seenFingerprints,
      opportunity: (record?.opportunitiesUsed || 0) + 1,
    });
    if (plan.error) refuse('recovery-plan-unavailable', 'A fresh Recovery could not be prepared.');
    const applied = applyRecoveryStart({
      record,
      section,
      plan,
      type: eligibility.type,
      policy,
      attendance: context.attendance,
      originalScore: context.sectionOriginal?.score ?? null,
      at,
    });
    return { record: applied.record, changed: true, gradeChanged: false, response: { plan: applied.record.plan, type: applied.record.type } };
  }

  if (action === RECOVERY_ACTION.SUBMIT) {
    if (eligibility.state !== RECOVERY_STATE.IN_PROGRESS || !context.record?.plan) {
      refuse('recovery-not-in-progress', 'There is no Recovery in progress to submit.');
    }
    const responses = payload.responses && typeof payload.responses === 'object' ? payload.responses : {};
    const results = context.record.plan.items.map((item) => {
      const question = context.questionsByIndex[item.storageIndex];
      const reproduced = question && item.pin
        ? reproduceDeliveredFamilyQuestion({ question, assignmentId: context.assignmentId, storageIndex: item.storageIndex, pin: item.pin })
        : { error: 'missing' };
      if (reproduced.error) {
        return { itemId: item.itemId, isCorrect: false, credit: 0, weight: recoveryQuestionWeight(question), graded: false, reason: 'question-unavailable' };
      }
      const response = responses[item.itemId] || null;
      const grading = response ? gradeFamilyInstanceResponse({ question: reproduced.question, response }) : { graded: true, isCorrect: false };
      return {
        itemId: item.itemId,
        isCorrect: grading.isCorrect === true,
        credit: grading.isCorrect === true ? 1 : 0,
        weight: recoveryQuestionWeight(question),
        graded: grading.graded !== false,
        reason: grading.graded === false ? grading.reason || 'ungradable' : null,
      };
    });
    const applied = applyRecoveryCompletion({
      record: context.record,
      section,
      results,
      policy,
      originalScore: context.sectionOriginal?.score ?? null,
      originalAttempted: Number(context.sectionOriginal?.attempted) > 0,
      at,
    });
    return {
      record: applied.record,
      changed: true,
      gradeChanged: true,
      response: {
        rawScore: applied.record.rawScore,
        recordedScore: applied.gradeState.recordedScore,
        cap: applied.gradeState.cap,
        type: applied.record.type,
        reason: applied.gradeState.reason,
      },
    };
  }

  refuse('recovery-action-unknown', `Unknown Recovery action: ${action}`);
  return null;
};


export { RECOVERY_ACTION };
