/*
 * THE RECOVERY RECORD AND EVERY WAY IT MAY CHANGE.
 *
 * Stored at grades/{studentId}.sectionRecoveryByAssignment[assignmentId][section]
 * — a map the Firestore rules pin to the server (like the Test Cycle grades and
 * teacher overrides), because it decides a recorded grade and the grades
 * document is otherwise student-writable. Only the `advanceSectionRecovery`
 * callable writes it, by applying one of the pure transitions below.
 *
 *   practicing -> unlocked -> inProgress -> completed
 *                                       \-> held -> (a teacher) -> completed
 *                                                              \-> held, awaiting the student's answer
 *                                                                  to a replacement question -> completed | held
 *
 * HELD is a submitted Recovery MathMaster could not grade well enough to
 * score (sectionRecoveryEvidence.mjs): the student's work is kept, no
 * Recovery score exists, and nothing downstream — the recorded grade,
 * Classroom, Grade Transfer — treats it as finished until a teacher resolves
 * it (sectionRecoveryResolution.mjs).
 *
 * What it keeps, because the brief asks that it be kept:
 *   - the Practice items answered for the gate (unique fingerprints, server-
 *     graded, independence recorded) and the mastery snapshot that unlocked it
 *   - the Recovery plan (delivery pins) and the per-item results. A pin is
 *     kept EXACTLY as stored, even one this build cannot read; a replaced
 *     question stays in the plan, marked `supersededBy`, with its pin and
 *     result untouched
 *   - the raw Recovery score, the cap and type it was recorded under
 *   - timestamps and an audit history
 * What it never keeps: the original section score as a grade. The original is
 * always recomputed live from the untouched question records (a snapshot is
 * stored for the audit trail only), so a teacher's later correction of an
 * original answer still flows through to the recorded score.
 *
 * Pure: no Firestore, no clock (`at` is passed in).
 */

import { evaluateRecentPracticeMastery } from './practiceMastery.mjs';
import { RECOVERY_TYPE, normalizeRecoveryPolicy, recoveryCapFor } from './recoveryPolicy.mjs';
import { RECOVERY_HISTORY_EVENT, appendRecoveryHistory, buildSectionRecoveryGradeState } from './sectionRecoveryGrade.mjs';
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';
import {
  RECOVERY_HOLD_REASON,
  RECOVERY_ITEM_STATUS,
  evaluateRecoveryEvidence,
  isGradedItemStatus,
  isLegacyUnavailableResult,
  isRecoveryItemStatus,
  itemWeight,
  keptResponse,
  recoveryAwaitsReplacementAnswer,
  scoreRecoveryEvidence,
} from './sectionRecoveryEvidence.mjs';

export const SECTION_RECOVERY_FIELD = 'sectionRecoveryByAssignment';
export const RECOVERY_RECORD_SCHEMA_VERSION = 1;

export const RECOVERY_RECORD_STATUS = Object.freeze({
  PRACTICING: 'practicing',
  UNLOCKED: 'unlocked',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  // Submitted, but MathMaster could not grade enough of it to score it.
  HELD: 'held',
});

const STATUSES = new Set(Object.values(RECOVERY_RECORD_STATUS));
const MAX_PRACTICE_ITEMS = 40;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const iso = (value) => {
  const date = value instanceof Date ? value : new Date(Number.isFinite(Number(value)) ? Number(value) : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
};

export const emptyRecoveryRecord = (section) => ({
  schemaVersion: RECOVERY_RECORD_SCHEMA_VERSION,
  section,
  status: RECOVERY_RECORD_STATUS.PRACTICING,
  type: null,
  opportunitiesUsed: 0,
  practice: { items: [], nextIndex: 0 },
  masteryEvidence: null,
  plan: null,
  results: {},
  rawScore: null,
  cap: null,
  originalScoreAtStart: null,
  originalScoreAtCompletion: null,
  attendance: null,
  createdAt: null,
  unlockedAt: null,
  startedAt: null,
  completedAt: null,
  history: [],
});

const normalizePracticeItem = (raw) => {
  if (!isObject(raw) || !clean(raw.key)) return null;
  return {
    key: clean(raw.key).slice(0, 400),
    familyId: clean(raw.familyId) || null,
    coverageKey: clean(raw.coverageKey) || null,
    correct: raw.correct === true,
    independent: raw.independent !== false,
    solutionViewed: raw.solutionViewed === true,
    attempts: Math.max(1, Math.min(10, Math.round(Number(raw.attempts) || 1))),
    at: clean(raw.at) || null,
  };
};

const normalizePlanItem = (item) => {
  const pin = normalizeDeliveryPin(item.pin);
  const supersededBy = clean(item.supersededBy).slice(0, 80);
  const replaces = clean(item.replaces).slice(0, 80);
  return {
    itemId: clean(item.itemId),
    storageIndex: Math.max(0, Number(item.storageIndex) || 0),
    questionId: clean(item.questionId),
    familyId: clean(item.familyId) || null,
    coverageKey: clean(item.coverageKey) || null,
    // HISTORY IS NOT NORMALIZED AWAY. A pin this build cannot read (truncated,
    // or from a shape it does not know) is kept exactly as stored: it is the
    // record of what the student was given, and writing back `null` in its
    // place would erase it. Readers normalize it themselves and treat it as
    // the classified failure it is (pin-malformed).
    pin: pin || (item.pin === undefined ? null : item.pin),
    // A question a teacher replaced stays in the plan, pointing at the new one.
    ...(supersededBy ? { supersededBy } : {}),
    // A replacement names the question it replaced, when, and why.
    ...(replaces ? {
      replaces,
      issuedAt: clean(item.issuedAt) || null,
      issueReason: clean(item.issueReason).slice(0, 80) || null,
    } : {}),
  };
};

/** The stored record, validated; null when absent. */
export const normalizeRecoveryRecord = (raw, section = null) => {
  if (!isObject(raw)) return null;
  const resolvedSection = clean(raw.section || section);
  const base = emptyRecoveryRecord(resolvedSection);
  const status = STATUSES.has(raw.status) ? raw.status : base.status;
  const plan = isObject(raw.plan) && Array.isArray(raw.plan.items)
    ? {
      opportunity: Math.max(1, Number(raw.plan.opportunity) || 1),
      items: raw.plan.items
        .filter((item) => isObject(item) && clean(item.itemId))
        .map(normalizePlanItem),
    }
    : null;
  return {
    ...base,
    ...raw,
    section: resolvedSection,
    status,
    type: Object.values(RECOVERY_TYPE).includes(raw.type) ? raw.type : null,
    opportunitiesUsed: Math.max(0, Math.round(Number(raw.opportunitiesUsed) || 0)),
    practice: {
      items: list(raw.practice?.items).map(normalizePracticeItem).filter(Boolean).slice(-MAX_PRACTICE_ITEMS),
      nextIndex: Math.max(0, Math.round(Number(raw.practice?.nextIndex) || 0)),
    },
    plan,
    results: isObject(raw.results) ? raw.results : {},
    history: list(raw.history),
    // Present only on a Recovery that was ever held or partly graded, so an
    // ordinary record keeps exactly the shape it always had.
    ...(raw.hold !== undefined ? { hold: isObject(raw.hold) ? raw.hold : null } : {}),
    ...(raw.evidence !== undefined ? { evidence: isObject(raw.evidence) ? raw.evidence : null } : {}),
    ...(raw.holdHistory !== undefined ? { holdHistory: list(raw.holdHistory).filter(isObject).slice(-HOLD_HISTORY_LIMIT) } : {}),
  };
};

/** The plan items that count: everything a teacher has not replaced. */
export const activeRecoveryPlanItems = (record) => list(record?.plan?.items).filter((item) => !clean(item?.supersededBy));

export const recoveryRecordFor = (gradeData, assignmentId, section) => normalizeRecoveryRecord(
  gradeData?.[SECTION_RECOVERY_FIELD]?.[clean(assignmentId)]?.[section],
  section,
);

/** Every fingerprint this record has already shown the student. */
export const recoveryRecordFingerprints = (record) => [
  ...list(record?.practice?.items).map((item) => item.key),
  ...list(record?.plan?.items).map((item) => item.pin?.fingerprint).filter(Boolean),
];

const masteryFor = (record, { policy, requiredCoverage, at }) => evaluateRecentPracticeMastery({
  outcomes: record.practice.items,
  requiredCoverage,
  policy,
  now: Date.parse(iso(at)),
});

export class RecoveryTransitionError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'RecoveryTransitionError';
    this.code = code;
  }
}

const refuse = (code, message) => { throw new RecoveryTransitionError(code, message); };

/**
 * One graded Practice item for the gate. A question the student has already
 * answered here is refused rather than counted twice.
 */
export const applyRecoveryPracticeAttempt = ({
  record: rawRecord = null,
  section,
  item,
  practiceIndex = null,
  policy = null,
  requiredCoverage = [],
  at = Date.now(),
} = {}) => {
  const normalizedPolicy = policy?.version ? policy : normalizeRecoveryPolicy(policy || {});
  const record = normalizeRecoveryRecord(rawRecord, section) || emptyRecoveryRecord(section);
  if (record.status === RECOVERY_RECORD_STATUS.IN_PROGRESS || record.status === RECOVERY_RECORD_STATUS.COMPLETED) {
    refuse('recovery-already-started', 'Practice for this Recovery is closed: it has already started.');
  }
  const practiceItem = normalizePracticeItem({ ...item, at: iso(at) });
  if (!practiceItem) refuse('practice-item-invalid');
  if (record.practice.items.some((existing) => existing.key === practiceItem.key)) {
    refuse('practice-item-repeated', 'This practice question was already answered.');
  }
  const items = [...record.practice.items, practiceItem].slice(-MAX_PRACTICE_ITEMS);
  const nextIndex = Math.max(record.practice.nextIndex, Number.isInteger(practiceIndex) ? practiceIndex + 1 : record.practice.nextIndex + 1);
  const next = {
    ...record,
    createdAt: record.createdAt || iso(at),
    practice: { items, nextIndex },
  };
  const mastery = masteryFor(next, { policy: normalizedPolicy, requiredCoverage, at });
  return {
    record: {
      ...next,
      history: appendRecoveryHistory(next.history, {
        at: iso(at),
        event: RECOVERY_HISTORY_EVENT.PRACTICE,
        detail: `${practiceItem.correct && practiceItem.independent ? 'Correct' : 'Not yet'} · mastery ${mastery.correct}/${mastery.windowSize}`,
      }),
    },
    mastery,
  };
};

/** Record the unlock, with the exact evidence that justified it. */
export const applyRecoveryUnlock = ({
  record: rawRecord = null,
  section,
  mastery,
  masteryRequired = true,
  at = Date.now(),
} = {}) => {
  const record = normalizeRecoveryRecord(rawRecord, section) || emptyRecoveryRecord(section);
  if (record.status !== RECOVERY_RECORD_STATUS.PRACTICING && record.status !== RECOVERY_RECORD_STATUS.UNLOCKED) {
    refuse('recovery-not-unlockable', 'This Recovery has already started.');
  }
  if (masteryRequired && !mastery?.met) refuse('mastery-not-met', 'More Practice is needed before this Recovery unlocks.');
  if (record.status === RECOVERY_RECORD_STATUS.UNLOCKED) return { record };
  return {
    record: {
      ...record,
      status: RECOVERY_RECORD_STATUS.UNLOCKED,
      createdAt: record.createdAt || iso(at),
      unlockedAt: iso(at),
      masteryEvidence: mastery ? {
        met: mastery.met === true,
        correct: mastery.correct,
        considered: mastery.considered,
        windowSize: mastery.windowSize,
        requiredCorrect: mastery.requiredCorrect,
        percent: mastery.percent,
        coverage: mastery.coverage,
        itemKeys: list(mastery.itemKeys).slice(0, 40),
        masteryRequired,
        evaluatedAt: iso(at),
      } : { met: false, masteryRequired: false, evaluatedAt: iso(at) },
      history: appendRecoveryHistory(record.history, {
        at: iso(at),
        event: RECOVERY_HISTORY_EVENT.UNLOCKED,
        detail: masteryRequired
          ? `Unlocked after Practice mastery (${mastery.correct} of last ${mastery.windowSize} correct).`
          : 'Unlocked as an excused make-up.',
      }),
    },
  };
};

/** Start: freeze the plan, the type and the cap. Uses the opportunity. */
export const applyRecoveryStart = ({
  record: rawRecord = null,
  section,
  plan,
  type = RECOVERY_TYPE.RECOVERY,
  policy = null,
  attendance = null,
  originalScore = null,
  at = Date.now(),
} = {}) => {
  const normalizedPolicy = policy?.version ? policy : normalizeRecoveryPolicy(policy || {});
  const record = normalizeRecoveryRecord(rawRecord, section) || emptyRecoveryRecord(section);
  if (record.status === RECOVERY_RECORD_STATUS.IN_PROGRESS) return { record };
  if (record.status !== RECOVERY_RECORD_STATUS.UNLOCKED) refuse('recovery-locked', 'This Recovery is not unlocked yet.');
  if (record.opportunitiesUsed >= normalizedPolicy.automaticOpportunities) {
    refuse('recovery-opportunity-used', 'The automatic Recovery opportunity has already been used.');
  }
  if (!plan || !list(plan.items).length) refuse('recovery-plan-empty');
  return {
    record: {
      ...record,
      status: RECOVERY_RECORD_STATUS.IN_PROGRESS,
      type,
      cap: recoveryCapFor(normalizedPolicy, section, type),
      opportunitiesUsed: record.opportunitiesUsed + 1,
      plan: {
        opportunity: record.opportunitiesUsed + 1,
        items: list(plan.items).map((item) => ({
          itemId: item.itemId,
          storageIndex: item.storageIndex,
          questionId: item.questionId,
          familyId: item.familyId,
          coverageKey: item.coverageKey || null,
          pin: normalizeDeliveryPin(item.pin),
        })),
      },
      attendance: attendance ? {
        mark: attendance.mark || null,
        excused: attendance.excused === true,
        dateKey: attendance.dateKey || null,
      } : null,
      originalScoreAtStart: Number.isFinite(Number(originalScore)) ? Number(originalScore) : null,
      startedAt: iso(at),
      history: appendRecoveryHistory(record.history, {
        at: iso(at),
        event: RECOVERY_HISTORY_EVENT.STARTED,
        detail: `${type === RECOVERY_TYPE.EXCUSED_MAKE_UP ? 'Excused make-up' : 'Recovery'} started with ${plan.items.length} question${plan.items.length === 1 ? '' : 's'}.`,
      }),
    },
  };
};

/*
 * ONE PER-ITEM RESULT, AS STORED.
 *
 *   status              sectionRecoveryEvidence.mjs RECOVERY_ITEM_STATUS
 *   isCorrect / credit  the verdict — null when MathMaster has none, never a
 *                       "false" or a 0 it did not earn
 *   weight              the question's weight, kept for the audit even when
 *                       the question is left out of the score
 *   countsTowardScore   whether its weight is in the denominator
 *   attempted           whether this question cost the student an answer
 *   classification      why MathMaster could not grade it (PR #430's names)
 *
 * A caller that predates `status` (a result of { isCorrect, credit, weight,
 * graded, reason }) is read the way it always was, except that the old
 * marker for an unreproducible question — graded:false with
 * reason 'question-unavailable' — is the platform failure it always meant.
 */
export const itemStatusOf = (entry) => {
  if (!entry) return RECOVERY_ITEM_STATUS.UNANSWERED;
  if (isRecoveryItemStatus(entry.status)) return entry.status;
  if (isLegacyUnavailableResult(entry)) return RECOVERY_ITEM_STATUS.PLATFORM_UNAVAILABLE;
  const credit = Number(entry.credit ?? (entry.isCorrect ? 1 : 0)) || 0;
  return entry.isCorrect === true || credit >= 1 ? RECOVERY_ITEM_STATUS.CORRECT : RECOVERY_ITEM_STATUS.INCORRECT;
};

const storedItemResult = (entry, at) => {
  const status = itemStatusOf(entry);
  const graded = isGradedItemStatus(status);
  const credit = status === RECOVERY_ITEM_STATUS.CORRECT || status === RECOVERY_ITEM_STATUS.INCORRECT
    ? Math.max(0, Math.min(1, Number(entry?.credit ?? (entry?.isCorrect ? 1 : 0)) || 0))
    : status === RECOVERY_ITEM_STATUS.UNANSWERED ? 0 : null;
  return {
    status,
    isCorrect: graded ? status === RECOVERY_ITEM_STATUS.CORRECT || (credit !== null && credit >= 1) : null,
    credit,
    weight: itemWeight(entry?.weight),
    countsTowardScore: graded,
    graded,
    attempted: status === RECOVERY_ITEM_STATUS.CORRECT || status === RECOVERY_ITEM_STATUS.INCORRECT,
    reason: clean(entry?.reason).slice(0, 120) || null,
    classification: clean(entry?.classification).slice(0, 80) || null,
    recovery: clean(entry?.recovery).slice(0, 40) || null,
    ...(clean(entry?.reportedClassification) ? { reportedClassification: clean(entry.reportedClassification).slice(0, 80) } : {}),
    answeredAt: iso(at),
  };
};

/** The evidence view of a stored result (for the sufficient-evidence rule and the score). */
export const recoveryEvidenceItem = (planItem, stored) => ({
  itemId: planItem.itemId,
  coverageKey: planItem.coverageKey,
  familyId: planItem.familyId,
  questionId: planItem.questionId,
  storageIndex: planItem.storageIndex,
  weight: stored?.weight,
  status: stored ? itemStatusOf(stored) : RECOVERY_ITEM_STATUS.UNANSWERED,
  credit: stored?.credit ?? null,
});

const compactEvidence = (evidence) => ({
  policyVersion: evidence.policyVersion,
  sufficient: evidence.sufficient,
  reason: evidence.reason,
  plannedCount: evidence.plannedCount,
  gradedCount: evidence.gradedCount,
  plannedWeight: evidence.plannedWeight,
  gradedWeight: evidence.gradedWeight,
  weightShare: evidence.weightShare,
  plannedSkills: evidence.plannedSkills,
  coveredSkills: evidence.coveredSkills,
  missingSkills: evidence.missingSkills,
  minimumGradedItems: evidence.minimumGradedItems,
  minimumWeightShare: evidence.minimumWeightShare,
  unavailableItemIds: evidence.unavailableItemIds,
  reviewItemIds: evidence.reviewItemIds,
  excludedItemIds: evidence.excludedItemIds,
});

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** How many settled holds a record keeps (each needs a teacher and a resubmission). */
export const HOLD_HISTORY_LIMIT = 10;

/** A hold as it is archived: with the evidence it was decided on. */
export const archivedRecoveryHold = (record) => ({
  ...record?.hold,
  ...(record?.evidence ? { evidence: record.evidence } : {}),
});

const HOLD_DETAIL = Object.freeze({
  [RECOVERY_HOLD_REASON.NEEDS_REVIEW]: 'MathMaster has work it could not grade, so a teacher must review it',
  [RECOVERY_HOLD_REASON.NO_GRADED_ITEMS]: 'MathMaster could not grade any question',
  [RECOVERY_HOLD_REASON.SKILL_WITHOUT_EVIDENCE]: 'a skill this Recovery assesses has no question MathMaster could grade',
  [RECOVERY_HOLD_REASON.TOO_LITTLE_EVIDENCE]: 'the questions MathMaster could grade carry less than half of the Recovery\'s weight',
  [RECOVERY_HOLD_REASON.TOO_FEW_QUESTIONS]: 'too few questions could be graded for this section',
});

/**
 * Complete: per-item server results -> the sufficient-evidence rule -> a raw
 * score over the graded questions -> the recorded score state. Or a HOLD.
 *
 * `results` = [{ itemId, status, isCorrect, credit (0-1), weight, reason,
 * classification, response?, carried? }]. A plan item with no result is an
 * unanswered question — a submitted Recovery with a blank question is a
 * submitted Recovery, exactly like an unanswered DOL question. A result marked
 * `carried` (an answer graded before a teacher replaced another question)
 * keeps the stored result byte-for-byte.
 *
 * Returns { record, gradeState, held }. A held Recovery has no gradeState: no
 * Recovery score was recorded, and the original stands.
 */
export const applyRecoveryCompletion = ({
  record: rawRecord = null,
  section,
  results = [],
  policy = null,
  originalScore = null,
  originalAttempted = true,
  at = Date.now(),
} = {}) => {
  const record = normalizeRecoveryRecord(rawRecord, section);
  // In progress, or held while the student answers the replacement questions
  // a teacher issued (sectionRecoveryEvidence.mjs recoveryAwaitsReplacementAnswer).
  if (!record || (record.status !== RECOVERY_RECORD_STATUS.IN_PROGRESS && !recoveryAwaitsReplacementAnswer(record))) {
    refuse('recovery-not-in-progress', 'There is no Recovery in progress to submit.');
  }
  // The hold this submission settles stays on the record, with the evidence
  // it was decided on: history, never overwritten.
  const settledHold = record.hold
    ? { holdHistory: [...list(record.holdHistory), archivedRecoveryHold(record)].slice(-HOLD_HISTORY_LIMIT) }
    : {};
  const byItem = new Map(list(results).map((entry) => [clean(entry?.itemId), entry]));
  // A replaced question's result stays exactly as it was: history.
  const stored = { ...record.results };
  const keptResponses = {};
  const evidenceItems = [];
  activeRecoveryPlanItems(record).forEach((item) => {
    const entry = byItem.get(item.itemId) || null;
    const prior = record.results?.[item.itemId];
    if (entry?.carried === true && prior) {
      evidenceItems.push(recoveryEvidenceItem(item, prior));
      return;
    }
    const result = storedItemResult(entry, at);
    stored[item.itemId] = result;
    if (!result.graded && entry && entry.response !== undefined) {
      const kept = keptResponse(entry.response);
      if (kept) keptResponses[item.itemId] = kept;
    }
    evidenceItems.push(recoveryEvidenceItem(item, result));
  });
  const evidence = evaluateRecoveryEvidence({ section, items: evidenceItems });
  const allGraded = !evidence.unavailableItemIds.length && !evidence.reviewItemIds.length;

  if (!evidence.sufficient) {
    const itemIds = [...evidence.unavailableItemIds, ...evidence.reviewItemIds];
    const detail = `Held for review: ${HOLD_DETAIL[evidence.reason] || 'MathMaster could not grade this Recovery'} (`
      + `${plural(evidence.gradedCount, 'question')} of ${evidence.plannedCount} graded). `
      + 'Nothing was scored as wrong; no Recovery score is recorded until a teacher resolves it.';
    return {
      record: {
        ...record,
        status: RECOVERY_RECORD_STATUS.HELD,
        results: stored,
        rawScore: null,
        evidence: compactEvidence(evidence),
        ...settledHold,
        hold: {
          reason: evidence.reason,
          heldAt: iso(at),
          itemIds,
          ...(Object.keys(keptResponses).length ? { responses: keptResponses } : {}),
          resolution: null,
        },
        originalScoreAtSubmit: Number.isFinite(Number(originalScore)) && originalScore !== null ? Number(originalScore) : null,
        submittedAt: iso(at),
        history: appendRecoveryHistory(record.history, {
          at: iso(at),
          event: RECOVERY_HISTORY_EVENT.HELD,
          detail,
        }),
      },
      gradeState: null,
      held: true,
    };
  }

  const { rawScore } = scoreRecoveryEvidence(evidenceItems);
  const state = buildSectionRecoveryGradeState({
    section,
    originalScore,
    originalAttempted,
    rawRecoveryScore: rawScore,
    type: record.type || RECOVERY_TYPE.RECOVERY,
    policy,
  });
  const excluded = evidence.excludedItemIds.length;
  const detail = excluded
    ? `${state.reason} ${plural(excluded, 'question')} MathMaster could not grade ${excluded === 1 ? 'was' : 'were'} left out of the score.`
    : state.reason;
  return {
    record: {
      ...record,
      status: RECOVERY_RECORD_STATUS.COMPLETED,
      results: stored,
      rawScore,
      // Only a Recovery the evidence rule actually had to decide carries it;
      // an ordinary one keeps exactly the shape it always had.
      ...(allGraded && !record.evidence ? {} : { evidence: compactEvidence(evidence) }),
      ...(Object.keys(keptResponses).length ? { keptResponses } : {}),
      ...(record.hold ? { ...settledHold, hold: null } : {}),
      originalScoreAtCompletion: Number.isFinite(Number(originalScore)) ? Number(originalScore) : null,
      originalAttemptedAtCompletion: originalAttempted !== false,
      recordedScoreAtCompletion: state.recordedScore,
      completedAt: iso(at),
      history: appendRecoveryHistory(record.history, {
        at: iso(at),
        event: RECOVERY_HISTORY_EVENT.COMPLETED,
        detail,
        recordedScore: state.recordedScore,
      }),
    },
    gradeState: state,
    held: false,
  };
};
