/*
 * PRACTICE-BASED RECOVERY, ORCHESTRATED — ONE PURE SERVICE, TWO CALLERS.
 *
 * The browser calls `buildSectionRecoveryContext` to decide what a student
 * should see (it cannot read attendance, so it never claims an excused
 * make-up). The `advanceSectionRecovery` Cloud Function calls the same
 * function with the full picture and then `runSectionRecoveryAction`, inside
 * a transaction, to change anything. There is no second definition of who may
 * recover, what they are asked, or how it is graded.
 *
 * Every question a Recovery shows is a question-family instance identified by
 * a delivery pin, and every answer that affects a grade is marked HERE, on the
 * server, against the instance rebuilt from that pin — never from a verdict a
 * browser sends.
 *
 * Pure: no Firestore, no clock (`nowValue` / `at` are parameters).
 */

import { normalizeRecoveryPolicy, RECOVERY_TYPE } from './recoveryPolicy.mjs';
import { evaluateRecentPracticeMastery } from './practiceMastery.mjs';
import { resolveWarmupDelivery } from './warmupDelivery.mjs';
import { resolveRecoveryAttendance } from './recoveryAttendance.mjs';
import { assessSectionRecoveryReadiness } from './sectionRecoveryReadiness.mjs';
import {
  ORIGINAL_OPPORTUNITY,
  RECOVERY_STATE,
  evaluateSectionRecoveryEligibility,
  resolveOriginalOpportunity,
} from './sectionRecoveryEligibility.mjs';
import { buildRecoveryAssessmentPlan, buildRecoveryPracticeItem } from './sectionRecoveryPlan.mjs';
import {
  RecoveryTransitionError,
  applyRecoveryCompletion,
  applyRecoveryPracticeAttempt,
  applyRecoveryStart,
  applyRecoveryUnlock,
  normalizeRecoveryRecord,
  recoveryRecordFingerprints,
} from './sectionRecoveryRecord.mjs';
import { isFamilyBackedQuestion, reproduceFamilyQuestionFromPin, resolveFamilyQuestionInstance } from './questionFamilyInstance.mjs';
import { normalizeDeliveryPin, resolveGenerationAllocation, resolveLearnerSeat } from './questionGenerationIdentity.mjs';
import { gradeFamilyInstanceResponse } from './questionFamilyGrading.mjs';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const RECOVERY_ACTION = Object.freeze({
  STATUS: 'status',
  PRACTICE: 'practice',
  UNLOCK: 'unlock',
  START: 'start',
  SUBMIT: 'submit',
});

const MATH_SUPPORT_KEYS = ['hintUsed', 'teacherAssisted', 'scaffoldUsed', 'remediationUsed', 'workedExampleUsed', 'modified'];

/** Did this attempt use help that makes it something other than independent? */
export const attemptWasIndependent = (supportUsage = {}) => (
  supportUsage?.isMathematicallyIndependent !== false
  && !MATH_SUPPORT_KEYS.some((key) => Boolean(supportUsage?.[key]))
  && !(Array.isArray(supportUsage?.modifications) && supportUsage.modifications.length > 0)
);

/** Question weight, with the same bounds as the grading engine. */
export const recoveryQuestionWeight = (question = {}) => {
  const raw = Number(question?.questionWeight);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.max(0.25, Math.min(20, raw));
};

/**
 * Fingerprints of every family-backed question this student has been shown in
 * this assignment: canonical pins first, then the seat allocation for every
 * variant they have reached (they may have seen a question without
 * submitting). Recovery and its Practice skip all of them.
 */
export const studentSeenFingerprints = ({
  assignment = null,
  questions = [],
  tracker = {},
  seatInfo = null,
  sectionModeFor = () => 'personalized',
} = {}) => {
  const seen = new Set();
  list(questions).forEach((question, storageIndex) => {
    if (!isFamilyBackedQuestion(question)) return;
    const record = tracker?.[storageIndex] || tracker?.[String(storageIndex)] || {};
    const pin = normalizeDeliveryPin(record.familyDelivery);
    if (pin) seen.add(pin.fingerprint);
    const reached = Math.max(0, Math.floor(Number(record.variantIndex) || 0));
    for (let variant = 0; variant <= reached; variant += 1) {
      const result = resolveFamilyQuestionInstance({
        question,
        assignmentId: assignment?.id || '',
        storageIndex,
        allocation: resolveGenerationAllocation({
          sectionMode: sectionModeFor(clean(question?.activityRole).toLowerCase()),
          seatInfo,
          variant,
        }),
      });
      if (!result.error) seen.add(result.delivery.fingerprint);
    }
  });
  return [...seen];
};

/**
 * Everything needed to decide and act on one student's Recovery of one
 * section. All inputs are plain data the caller has already read.
 */
export const buildSectionRecoveryContext = ({
  assignment = null,
  section = 'dol',
  sectionEntries = [],
  questions = [],
  tracker = {},
  sectionOriginal = { score: null, attempted: 0, total: 0 },
  record = null,
  studentId = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  supportEvents = null,
  challengeCredit = null,
  studentProfile = null,
  sectionModeFor = () => 'personalized',
  nowValue = Date.now(),
} = {}) => {
  const policy = normalizeRecoveryPolicy(assignment || {});
  const normalizedRecord = normalizeRecoveryRecord(record, section);
  const opportunity = resolveOriginalOpportunity({ assignment, section, schedule, classId, classPeriod, studentId, nowValue, studentProfile });
  const readiness = assessSectionRecoveryReadiness({ assignmentId: assignment?.id || '', section, entries: sectionEntries });
  const warmupDelivery = section === 'warmup'
    ? resolveWarmupDelivery({ assignment, hasAuthoredWarmup: list(sectionEntries).length > 0, challengeCredit })
    : null;
  // Attendance is known only where it can be read (the server). Elsewhere the
  // context says so instead of guessing.
  const attendance = Array.isArray(supportEvents)
    ? resolveRecoveryAttendance({ supportEvents, studentId, classId, classPeriod, dateKey: opportunity.instructionDateKey || null })
    : { excused: false, known: false };
  const seatInfo = studentId ? resolveLearnerSeat({ assignment, studentId, classId }) : null;
  const requiredCoverage = [...new Set(readiness.readySlots.map((slot) => slot.coverageKey).filter(Boolean))];
  const mastery = evaluateRecentPracticeMastery({
    outcomes: normalizedRecord?.practice?.items || [],
    requiredCoverage,
    policy,
    now: Number(nowValue instanceof Date ? nowValue.getTime() : nowValue),
  });
  const eligibility = evaluateSectionRecoveryEligibility({
    section,
    policy,
    original: sectionOriginal,
    opportunity,
    warmupDelivery,
    attendance,
    readiness,
    mastery,
    record: normalizedRecord,
  });
  const questionsByIndex = Object.fromEntries(list(sectionEntries).map((entry) => [entry.storageIndex, entry.question]));
  const seen = [
    ...studentSeenFingerprints({ assignment, questions, tracker, seatInfo, sectionModeFor }),
    ...recoveryRecordFingerprints(normalizedRecord),
  ];
  return {
    assignmentId: assignment?.id || '',
    section,
    policy,
    record: normalizedRecord,
    opportunity,
    readiness,
    warmupDelivery,
    attendance,
    seatInfo,
    requiredCoverage,
    mastery,
    eligibility,
    questionsByIndex,
    seenFingerprints: [...new Set(seen)],
    sectionOriginal,
  };
};

/** The next Practice item (with its pin), or null when Practice is closed. */
export const nextRecoveryPracticeItem = (context) => {
  const state = context?.eligibility?.state;
  if (![RECOVERY_STATE.LOCKED, RECOVERY_STATE.UNLOCKED].includes(state)) return null;
  const item = buildRecoveryPracticeItem({
    assignmentId: context.assignmentId,
    section: context.section,
    readySlots: context.readiness.readySlots,
    questionsByIndex: context.questionsByIndex,
    practiceIndex: context.record?.practice?.nextIndex || 0,
    seatInfo: context.seatInfo,
    seenFingerprints: context.seenFingerprints,
  });
  if (item.error) return null;
  const { question: _question, ...withoutQuestion } = item;
  return withoutQuestion;
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
    const reproduced = reproduceFamilyQuestionFromPin({
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
        ? reproduceFamilyQuestionFromPin({ question, assignmentId: context.assignmentId, storageIndex: item.storageIndex, pin: item.pin })
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

export { ORIGINAL_OPPORTUNITY, RECOVERY_STATE };
