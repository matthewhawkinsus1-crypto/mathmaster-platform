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
 * A question MathMaster cannot rebuild or mark is classified, never scored:
 * see sectionRecoveryEvidence.mjs for the item statuses and the
 * sufficient-evidence rule that decides between a score and a hold.
 *
 * Pure: no Firestore, no clock (`at` is a parameter).
 */
import { RECOVERY_TYPE } from './recoveryPolicy.mjs';
import { RECOVERY_STATE } from './sectionRecoveryEligibility.mjs';
import { buildRecoveryAssessmentPlan } from './sectionRecoveryPlan.mjs';
import {
  RecoveryTransitionError,
  activeRecoveryPlanItems,
  applyRecoveryCompletion,
  applyRecoveryPracticeAttempt,
  applyRecoveryStart,
  applyRecoveryUnlock,
} from './sectionRecoveryRecord.mjs';
import {
  PIN_REPLAY_FAILURE,
  RECOVERY_GRADING_FAILURE,
  RECOVERY_ITEM_STATUS,
  classifyRecoveryReproductionFailure,
  isGradedItemStatus,
  isUnansweredGradingReason,
  recoveryHintForClassification,
  sanitizeReportedClassification,
} from './sectionRecoveryEvidence.mjs';
import { reproduceFamilyQuestionFromPin } from './questionFamilyInstance.mjs';
import { ALLOCATION_BASIS, allocationIndexFor, normalizeDeliveryPin } from './questionGenerationIdentity.mjs';
import { deliveredQuestionForGrading, runtimeRepairedQuestion } from './serverGrading/deliveredQuestion.mjs';
import { gradeFamilyInstanceResponse, serverResponseGradingSupport } from './serverGrading/serverResponseGrading.mjs';
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

/*
 * WHOSE PRACTICE QUESTION IS THIS?
 *
 * A Practice pin's slot names the assignment and section but not the student,
 * so a classmate's pin used to pass every check: it replayed (it is a real
 * question), it was graded, and it counted toward THIS student's mastery. A
 * Practice item is allocated from the student's own seat
 * (sectionRecoveryPlan.mjs buildRecoveryPracticeItem), so — as
 * deliveryPinAllocationProblem decides for an ordinary delivery — the pin's
 * seat must be one this student holds, and its index must be that seat's
 * allocation for the pin's OWN variant and stride. Not the stride the class
 * has now: it grows with every student seated, and an item dealt before that
 * is still this student's. A provisional seat (not yet seated by the
 * teacher's app) can only be checked against the student's provisional seat
 * today; if seating moved it, the runner deals the next item.
 */
const practicePinIsOwn = (pin, context) => {
  const own = context.seatInfo || {};
  const seatIsOwn = pin.basis === ALLOCATION_BASIS.SEATED
    ? (Array.isArray(context.heldSeats) ? context.heldSeats : []).includes(pin.seat)
    : pin.basis === ALLOCATION_BASIS.PROVISIONAL && own.basis === ALLOCATION_BASIS.PROVISIONAL && pin.seat === own.seat;
  return seatIsOwn && pin.index === allocationIndexFor({ seat: pin.seat, variant: pin.variant, stride: pin.stride });
};

/*
 * ONE PINNED RECOVERY QUESTION, GRADED — OR CLASSIFIED.
 *
 * In this order, so a student's payload can never decide that a question was
 * MathMaster's failure:
 *
 *   1. Rebuild the instance from its own pin. Any failure (or a throw) is a
 *      platform failure, classified in PR #430's vocabulary.
 *   2. Ask whether the server can mark this question at all — about the
 *      question, never the answer. No means a platform failure.
 *   3. Only now read the answer. None, or a blank/incomplete one, is the
 *      student's unanswered question (worth zero, as always). One the grader
 *      cannot read, or that makes it throw, needs a teacher: the server cannot
 *      tell a platform bug from a tampered payload there. The device saying
 *      it could not show a question the server CAN rebuild is the same.
 */
const gradeRecoveryItem = ({ context, item, response, reported }) => {
  const question = context.questionsByIndex[item.storageIndex] || null;
  const weight = recoveryQuestionWeight(question);
  const unavailable = (classification, reason) => ({
    itemId: item.itemId,
    status: RECOVERY_ITEM_STATUS.PLATFORM_UNAVAILABLE,
    weight,
    reason,
    classification,
    recovery: recoveryHintForClassification(classification),
    ...(reported ? { reportedClassification: reported } : {}),
    response,
  });
  const review = (classification, reason) => ({
    itemId: item.itemId,
    status: RECOVERY_ITEM_STATUS.NEEDS_REVIEW,
    weight,
    reason,
    classification,
    recovery: 'needs-repair',
    ...(reported ? { reportedClassification: reported } : {}),
    response,
  });

  if (!question) return unavailable(RECOVERY_GRADING_FAILURE.QUESTION_REMOVED, 'question-not-in-section');
  let reproduced;
  try {
    reproduced = reproduceDeliveredFamilyQuestion({ question, assignmentId: context.assignmentId, storageIndex: item.storageIndex, pin: item.pin });
  } catch (error) {
    return unavailable(PIN_REPLAY_FAILURE.RESOLUTION_EXCEPTION, `reproduction-threw:${String(error?.name || 'Error').slice(0, 40)}`);
  }
  if (reproduced.error) {
    let classification = PIN_REPLAY_FAILURE.GENERATION_FAILED;
    try {
      classification = classifyRecoveryReproductionFailure({ question, pin: item.pin, error: reproduced.error, issues: reproduced.issues });
    } catch { /* an unreadable question is still this question's platform failure */ }
    return unavailable(classification, `family-${reproduced.error}`);
  }
  const support = serverResponseGradingSupport(reproduced.question);
  if (!support?.supported) return unavailable(RECOVERY_GRADING_FAILURE.GRADER_UNAVAILABLE, String(support?.reason || 'not-server-gradable').slice(0, 120));

  if (!response) {
    return reported
      ? review(RECOVERY_GRADING_FAILURE.REPORTED_UNAVAILABLE, 'device-could-not-show')
      : { itemId: item.itemId, status: RECOVERY_ITEM_STATUS.UNANSWERED, weight, reason: 'no-answer' };
  }
  let grading;
  try {
    grading = gradeFamilyInstanceResponse({ question: reproduced.question, response });
  } catch (error) {
    return review(RECOVERY_GRADING_FAILURE.GRADING_EXCEPTION, `grading-threw:${String(error?.name || 'Error').slice(0, 40)}`);
  }
  if (grading?.graded === false) {
    return isUnansweredGradingReason(grading.reason)
      ? { itemId: item.itemId, status: RECOVERY_ITEM_STATUS.UNANSWERED, weight, reason: grading.reason }
      : review(RECOVERY_GRADING_FAILURE.RESPONSE_UNREADABLE, String(grading.reason || 'ungradable').slice(0, 120));
  }
  const isCorrect = grading?.isCorrect === true;
  return {
    itemId: item.itemId,
    status: isCorrect ? RECOVERY_ITEM_STATUS.CORRECT : RECOVERY_ITEM_STATUS.INCORRECT,
    isCorrect,
    credit: isCorrect ? 1 : 0,
    weight,
    reason: null,
  };
};

/** The questions the student's device reported it could not show, bounded to this plan. */
const reportedUnavailableItems = (payload, planItemIds) => {
  const raw = payload?.unavailableItems && typeof payload.unavailableItems === 'object' && !Array.isArray(payload.unavailableItems)
    ? payload.unavailableItems
    : {};
  return Object.fromEntries(Object.entries(raw)
    .filter(([itemId]) => planItemIds.has(itemId))
    .map(([itemId, value]) => [itemId, sanitizeReportedClassification(value?.classification ?? value)]));
};

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
    if (!practicePinIsOwn(pin, context)) refuse('practice-pin-invalid', 'That practice question does not belong to this Recovery.');
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
    if (eligibility.state === RECOVERY_STATE.HELD) {
      refuse('recovery-held', 'Your Recovery is being held for review by your teacher.');
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
    // A replacement question still unanswered at the final submission date:
    // the Recovery waits for the teacher, the graded answers kept.
    if (eligibility.state === RECOVERY_STATE.HELD) {
      refuse('recovery-held', 'Your Recovery is being held for review by your teacher. Your answers are saved.');
    }
    if (eligibility.state !== RECOVERY_STATE.IN_PROGRESS || !context.record?.plan) {
      refuse('recovery-not-in-progress', 'There is no Recovery in progress to submit.');
    }
    const responses = payload.responses && typeof payload.responses === 'object' ? payload.responses : {};
    const active = activeRecoveryPlanItems(context.record);
    const reported = reportedUnavailableItems(payload, new Set(active.map((item) => item.itemId)));
    const prior = context.record.results || {};
    const results = active.map((item) => {
      // Graded before a teacher replaced another question: kept as it was —
      // never asked again, never re-marked.
      if (isGradedItemStatus(prior[item.itemId]?.status)) return { itemId: item.itemId, carried: true };
      return gradeRecoveryItem({
        context,
        item,
        response: responses[item.itemId] || null,
        reported: reported[item.itemId] || null,
      });
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
    const excludedCount = applied.record.evidence?.excludedItemIds?.length || 0;
    return {
      record: applied.record,
      changed: true,
      // A hold changes no grade: nothing was scored, the original stands.
      gradeChanged: !applied.held,
      response: applied.held
        ? {
          held: true,
          holdReason: applied.record.hold.reason,
          rawScore: null,
          recordedScore: null,
          cap: applied.record.cap ?? null,
          type: applied.record.type,
          reason: 'Your Recovery is being held for review.',
        }
        : {
          held: false,
          excludedCount,
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
