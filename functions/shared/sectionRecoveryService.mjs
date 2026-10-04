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

import { normalizeRecoveryPolicy } from './recoveryPolicy.mjs';
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
import { buildRecoveryPracticeItem } from './sectionRecoveryPlan.mjs';
import {
  normalizeRecoveryRecord,
  recoveryRecordFingerprints,
} from './sectionRecoveryRecord.mjs';
import { isFamilyBackedQuestion, resolveFamilyQuestionInstance } from './questionFamilyInstance.mjs';
import {
  learnerToken,
  normalizeDeliveryPin,
  readGenerationSeats,
  resolveGenerationAllocation,
  resolveLearnerSeat,
} from './questionGenerationIdentity.mjs';

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
  // The student's private override record, read by the caller with its own
  // authority (studentAssignmentOverrides.mjs). Undefined where it was not read.
  privateOverride = undefined,
  sectionModeFor = () => 'personalized',
  nowValue = Date.now(),
} = {}) => {
  const policy = normalizeRecoveryPolicy(assignment || {});
  const normalizedRecord = normalizeRecoveryRecord(record, section);
  const opportunity = resolveOriginalOpportunity({ assignment, section, schedule, classId, classPeriod, studentId, nowValue, studentProfile, privateOverride });
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
  // Every seat this student holds on this assignment, in any class. A seat map
  // is append-only, so a seat a Practice item was dealt on stays theirs while
  // the class grows (sectionRecoveryActions.mjs practicePinIsOwn).
  const token = studentId ? learnerToken(assignment?.id || '', studentId) : null;
  const heldSeats = token
    ? [...new Set(Object.values(readGenerationSeats(assignment).byClassId)
      .filter((seats) => Object.prototype.hasOwnProperty.call(seats, token))
      .map((seats) => seats[token]))]
    : [];
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
    heldSeats,
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

/*
 * `runSectionRecoveryAction` — the server half that GRADES — lives in
 * sectionRecoveryActions.mjs. It loads every shared grader, and this module
 * is also imported by the student app (studentRecoveryModel.js), which must
 * not download every tool's mathematics to show a Recovery panel.
 */
export { ORIGINAL_OPPORTUNITY, RECOVERY_STATE };
