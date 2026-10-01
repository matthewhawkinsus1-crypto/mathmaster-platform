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
 *
 * What it keeps, because the brief asks that it be kept:
 *   - the Practice items answered for the gate (unique fingerprints, server-
 *     graded, independence recorded) and the mastery snapshot that unlocked it
 *   - the Recovery plan (delivery pins) and the per-item results
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

export const SECTION_RECOVERY_FIELD = 'sectionRecoveryByAssignment';
export const RECOVERY_RECORD_SCHEMA_VERSION = 1;

export const RECOVERY_RECORD_STATUS = Object.freeze({
  PRACTICING: 'practicing',
  UNLOCKED: 'unlocked',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
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
        .map((item) => ({
          itemId: clean(item.itemId),
          storageIndex: Math.max(0, Number(item.storageIndex) || 0),
          questionId: clean(item.questionId),
          familyId: clean(item.familyId) || null,
          coverageKey: clean(item.coverageKey) || null,
          pin: normalizeDeliveryPin(item.pin),
        })),
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
  };
};

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

/**
 * Complete: per-item server results -> raw score -> recorded score state.
 *
 * `results` = [{ itemId, isCorrect, credit (0-1), weight }]. Items missing a
 * result count as zero — a submitted Recovery with a blank question is a
 * submitted Recovery, exactly like an unanswered DOL question.
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
  if (!record || record.status !== RECOVERY_RECORD_STATUS.IN_PROGRESS) {
    refuse('recovery-not-in-progress', 'There is no Recovery in progress to submit.');
  }
  const byItem = new Map(list(results).map((entry) => [clean(entry?.itemId), entry]));
  let earned = 0;
  let possible = 0;
  const stored = {};
  record.plan.items.forEach((item) => {
    const entry = byItem.get(item.itemId) || null;
    const weight = Number.isFinite(Number(entry?.weight)) && Number(entry.weight) > 0 ? Number(entry.weight) : 1;
    const credit = Math.max(0, Math.min(1, Number(entry?.credit ?? (entry?.isCorrect ? 1 : 0)) || 0));
    earned += credit * weight;
    possible += weight;
    stored[item.itemId] = {
      isCorrect: entry?.isCorrect === true,
      credit,
      weight,
      graded: entry?.graded !== false,
      reason: entry?.reason || null,
      answeredAt: iso(at),
    };
  });
  const rawScore = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  const state = buildSectionRecoveryGradeState({
    section,
    originalScore,
    originalAttempted,
    rawRecoveryScore: rawScore,
    type: record.type || RECOVERY_TYPE.RECOVERY,
    policy,
  });
  return {
    record: {
      ...record,
      status: RECOVERY_RECORD_STATUS.COMPLETED,
      results: stored,
      rawScore,
      originalScoreAtCompletion: Number.isFinite(Number(originalScore)) ? Number(originalScore) : null,
      originalAttemptedAtCompletion: originalAttempted !== false,
      recordedScoreAtCompletion: state.recordedScore,
      completedAt: iso(at),
      history: appendRecoveryHistory(record.history, {
        at: iso(at),
        event: RECOVERY_HISTORY_EVENT.COMPLETED,
        detail: state.reason,
        recordedScore: state.recordedScore,
      }),
    },
    gradeState: state,
  };
};
