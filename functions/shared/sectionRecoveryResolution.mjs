/*
 * A TEACHER RESOLVES A HELD RECOVERY.
 *
 * A Recovery is HELD when MathMaster could not grade enough of it to score it
 * (sectionRecoveryEvidence.mjs). The student's work is kept and nothing
 * downstream treats the section grade as settled. Only a person may release
 * it, through the `resolveHeldSectionRecovery` callable (the student's teacher
 * of record), and only in one of three ways — none of which ever counts a
 * question MathMaster could not grade against the student, and none of which
 * invents credit:
 *
 *   finalizeGraded     "the questions MathMaster graded are enough for this
 *                      student." The raw score is computed over exactly those
 *                      questions — the same denominator rule as an automatic
 *                      finalization — and recorded as max(original,
 *                      min(raw, cap)). Needs at least one graded question.
 *   keepOriginal       "close it." No Recovery score is recorded; the
 *                      original section score stands, as if no Recovery had
 *                      been taken.
 *   issueReplacement   "ask again." Every question MathMaster did not grade
 *                      gets a NEW question (sectionRecoveryPlan.mjs
 *                      buildRecoveryReplacementItems: new item id, new slot,
 *                      the student's own seat, never a question they have
 *                      seen). The old item stays in the plan, its pin
 *                      byte-identical, marked `supersededBy`; its result is
 *                      never rewritten. The Recovery STAYS HELD — grade and
 *                      passback paused, and code that predates replacements
 *                      leaves it alone — while the student answers ONLY the
 *                      new questions until their final submission date (the
 *                      ones already graded are carried, never asked or
 *                      re-marked). Past that date, or at any time, the
 *                      teacher may still finalize or keep the original.
 *
 * A Recovery COMPLETED before this policy, with a question it could not
 * reproduce scored as 0 (sectionRecoveryEvidence.mjs
 * isLegacyUnavailableResult — the P0 itself), may be corrected the same way:
 * finalizeGraded re-scores it over the questions MathMaster graded. Its stored
 * results are not touched; only the score derived from them changes.
 *
 * Every resolution is appended to the record's history as a teacher action
 * (who, when, what, the note) and stays on the record (its hold, or the hold
 * history once settled); the callable also writes a gradeOverrideAudits row.
 *
 * Pure: no Firestore, no clock (`at` is passed in).
 */
import { RECOVERY_TYPE } from './recoveryPolicy.mjs';
import { RECOVERY_HISTORY_EVENT, appendRecoveryHistory, buildSectionRecoveryGradeState } from './sectionRecoveryGrade.mjs';
import {
  HOLD_HISTORY_LIMIT,
  RECOVERY_RECORD_STATUS,
  RecoveryTransitionError,
  activeRecoveryPlanItems,
  archivedRecoveryHold,
  normalizeRecoveryRecord,
  recoveryEvidenceItem,
} from './sectionRecoveryRecord.mjs';
import {
  isGradedItemStatus,
  isLegacyUnavailableResult,
  recoveryAwaitsReplacementAnswer,
  scoreRecoveryEvidence,
} from './sectionRecoveryEvidence.mjs';
import { normalizeDeliveryPin } from './questionGenerationIdentity.mjs';

export const HELD_RECOVERY_ACTION = Object.freeze({
  FINALIZE_GRADED: 'finalizeGraded',
  KEEP_ORIGINAL: 'keepOriginal',
  ISSUE_REPLACEMENT: 'issueReplacement',
});

const ACTIONS = new Set(Object.values(HELD_RECOVERY_ACTION));
export const isHeldRecoveryAction = (value) => ACTIONS.has(value);

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const iso = (value) => {
  const date = value instanceof Date ? value : new Date(Number.isFinite(Number(value)) ? Number(value) : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
};
const refuse = (code, message) => { throw new RecoveryTransitionError(code, message); };
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The active items MathMaster did not grade: what a replacement replaces. */
export const heldRecoveryItemIds = (record) => activeRecoveryPlanItems(record)
  .filter((item) => !isGradedItemStatus(record?.results?.[item.itemId]?.status))
  .map((item) => item.itemId);

/** Replacement questions issued and not answered yet: no evidence either way. */
export const pendingReplacementItemIds = (record) => activeRecoveryPlanItems(record)
  .filter((item) => item.replaces && !record?.results?.[item.itemId])
  .map((item) => item.itemId);

/** Items of a COMPLETED record scored before this policy with a 0 it did not earn. */
export const legacyUnavailableItemIds = (record) => activeRecoveryPlanItems(record)
  .filter((item) => isLegacyUnavailableResult(record?.results?.[item.itemId]))
  .map((item) => item.itemId);

/** A completed Recovery the old rule scored with a platform failure as 0, not yet corrected. */
export const recoveryNeedsLegacyCorrection = (rawRecord, section = null) => {
  const record = normalizeRecoveryRecord(rawRecord, section);
  return record?.status === RECOVERY_RECORD_STATUS.COMPLETED
    && !record.legacyCorrection
    && legacyUnavailableItemIds(record).length > 0;
};

// The evidence a teacher's finalization is computed from: every active
// question except a replacement the student has not answered.
const evidenceItemsOf = (record) => {
  const pending = new Set(pendingReplacementItemIds(record));
  return activeRecoveryPlanItems(record)
    .filter((item) => !pending.has(item.itemId))
    .map((item) => recoveryEvidenceItem(item, record.results?.[item.itemId]));
};

/**
 * The resolutions this record allows, in the order a teacher should consider
 * them — the one gate every resolution passes (the callable asks before it
 * builds anything).
 */
export const heldRecoveryActionsFor = (rawRecord, section = null) => {
  const record = normalizeRecoveryRecord(rawRecord, section);
  if (!record) return [];
  const anyGraded = evidenceItemsOf(record).some((item) => isGradedItemStatus(item.status));
  if (recoveryNeedsLegacyCorrection(record)) return anyGraded ? [HELD_RECOVERY_ACTION.FINALIZE_GRADED] : [];
  if (record.status !== RECOVERY_RECORD_STATUS.HELD) return [];
  // A replacement already waits for the student: finalize or keep, not another.
  const awaitingStudent = recoveryAwaitsReplacementAnswer(record);
  return [
    ...(!awaitingStudent && heldRecoveryItemIds(record).length ? [HELD_RECOVERY_ACTION.ISSUE_REPLACEMENT] : []),
    ...(anyGraded ? [HELD_RECOVERY_ACTION.FINALIZE_GRADED] : []),
    HELD_RECOVERY_ACTION.KEEP_ORIGINAL,
  ];
};

const actorOf = (actor) => ({
  uid: clean(actor?.uid) || null,
  email: clean(actor?.email).toLowerCase() || null,
  name: clean(actor?.name) || null,
});

const who = (actor) => (actor.email ? `Teacher ${actor.email}` : 'A teacher');

/**
 * Apply one resolution to a HELD record (or correct a COMPLETED one the old
 * rule scored with a platform failure as 0).
 *
 * Returns { record, gradeState } — gradeState is null when no section grade
 * changes (a replacement: the Recovery stays held for the student's answer).
 * Throws RecoveryTransitionError for anything not allowed.
 */
export const applyHeldRecoveryResolution = ({
  record: rawRecord = null,
  section,
  action,
  actor = null,
  note = '',
  replacements = null,
  policy = null,
  originalScore = null,
  originalAttempted = true,
  at = Date.now(),
} = {}) => {
  const record = normalizeRecoveryRecord(rawRecord, section);
  const legacyCorrection = recoveryNeedsLegacyCorrection(record);
  if (!record || (record.status !== RECOVERY_RECORD_STATUS.HELD && !legacyCorrection)) {
    refuse('recovery-not-held', 'This Recovery is not waiting for a teacher.');
  }
  if (!isHeldRecoveryAction(action)) refuse('recovery-resolution-unknown', 'Choose how to resolve this Recovery.');
  if (!heldRecoveryActionsFor(record).includes(action)) {
    refuse('recovery-resolution-unavailable', action === HELD_RECOVERY_ACTION.ISSUE_REPLACEMENT && recoveryAwaitsReplacementAnswer(record)
      ? 'A replacement question is already waiting for the student.'
      : 'That is not available for this Recovery.');
  }
  // A replacement the student has not answered is settled by this decision:
  // its hold goes to the history, with the evidence it was decided on.
  const settledHold = recoveryAwaitsReplacementAnswer(record)
    ? { holdHistory: [...list(record.holdHistory), archivedRecoveryHold(record)].slice(-HOLD_HISTORY_LIMIT) }
    : {};
  const teacher = actorOf(actor);
  const cleanNote = clean(note).slice(0, 500) || null;
  const resolution = { action, actor: teacher, at: iso(at), note: cleanNote };
  const noteText = cleanNote ? ` Note: ${cleanNote}` : '';
  const original = Number.isFinite(Number(originalScore)) && originalScore !== null ? Number(originalScore) : null;
  const gradeStateFor = (rawRecoveryScore) => buildSectionRecoveryGradeState({
    section,
    originalScore,
    originalAttempted,
    rawRecoveryScore,
    type: record.type || RECOVERY_TYPE.RECOVERY,
    policy,
    capOverride: record.cap,
  });

  if (action === HELD_RECOVERY_ACTION.FINALIZE_GRADED) {
    const items = evidenceItemsOf(record);
    const { rawScore } = scoreRecoveryEvidence(items);
    if (rawScore === null) {
      refuse('recovery-nothing-graded', 'MathMaster could not grade any question in this Recovery, so there is nothing to finalize from. Issue a replacement question or keep the original score.');
    }
    const graded = items.filter((item) => isGradedItemStatus(item.status)).length;
    const pending = pendingReplacementItemIds(record);
    const excludedItemIds = [...items.filter((item) => !isGradedItemStatus(item.status)).map((item) => item.itemId), ...pending];
    const state = gradeStateFor(rawScore);
    if (legacyCorrection) {
      // Completed under the old rule: the stored results stay exactly as they
      // are; only the score derived from them is corrected, and the score it
      // replaces is kept on the record.
      return {
        record: {
          ...record,
          rawScore,
          evidence: { ...record.evidence, excludedItemIds, finalizedBy: 'teacher' },
          legacyCorrection: {
            ...resolution,
            rawScoreBefore: record.rawScore ?? null,
            recordedScoreBefore: record.recordedScoreAtCompletion ?? null,
            excludedItemIds,
          },
          recordedScoreAtCompletion: state.recordedScore,
          history: appendRecoveryHistory(record.history, {
            at: iso(at),
            event: RECOVERY_HISTORY_EVENT.TEACHER_OVERRIDE,
            detail: `${who(teacher)} corrected this Recovery: ${plural(excludedItemIds.length, 'question')} MathMaster could not reproduce `
              + `${excludedItemIds.length === 1 ? 'was' : 'were'} scored as 0 when it was submitted, and ${excludedItemIds.length === 1 ? 'is' : 'are'} now left out of the score `
              + `(${record.rawScore ?? '—'}% → ${rawScore}%). ${state.reason}${noteText}`,
            recordedScore: state.recordedScore,
          }),
        },
        gradeState: state,
      };
    }
    return {
      record: {
        ...record,
        status: RECOVERY_RECORD_STATUS.COMPLETED,
        rawScore,
        evidence: { ...record.evidence, excludedItemIds, finalizedBy: 'teacher' },
        ...settledHold,
        hold: { ...record.hold, resolution },
        originalScoreAtCompletion: original,
        originalAttemptedAtCompletion: originalAttempted !== false,
        recordedScoreAtCompletion: state.recordedScore,
        completedAt: iso(at),
        history: appendRecoveryHistory(record.history, {
          at: iso(at),
          event: RECOVERY_HISTORY_EVENT.TEACHER_OVERRIDE,
          detail: `${who(teacher)} finalized this Recovery from the ${plural(graded, 'question')} MathMaster could grade; `
            + `${plural(excludedItemIds.length, 'question')} ${pending.length ? 'not graded' : 'it could not grade'} ${excludedItemIds.length === 1 ? 'was' : 'were'} left out of the score. ${state.reason}${noteText}`,
          recordedScore: state.recordedScore,
        }),
      },
      gradeState: state,
    };
  }

  if (action === HELD_RECOVERY_ACTION.KEEP_ORIGINAL) {
    const state = gradeStateFor(null);
    return {
      record: {
        ...record,
        status: RECOVERY_RECORD_STATUS.COMPLETED,
        rawScore: null,
        ...settledHold,
        hold: { ...record.hold, resolution },
        originalScoreAtCompletion: original,
        originalAttemptedAtCompletion: originalAttempted !== false,
        recordedScoreAtCompletion: state.recordedScore,
        completedAt: iso(at),
        history: appendRecoveryHistory(record.history, {
          at: iso(at),
          event: RECOVERY_HISTORY_EVENT.TEACHER_OVERRIDE,
          detail: `${who(teacher)} kept the original score: no Recovery score was recorded, and nothing MathMaster could not grade counted against the student.${noteText}`,
          recordedScore: state.recordedScore,
        }),
      },
      gradeState: state,
    };
  }

  // ISSUE_REPLACEMENT
  const targets = heldRecoveryItemIds(record);
  const fresh = list(replacements).filter((item) => clean(item?.itemId) && clean(item?.replaces) && normalizeDeliveryPin(item?.pin));
  const byReplaced = new Map(fresh.map((item) => [clean(item.replaces), item]));
  if (!targets.length) refuse('recovery-nothing-to-replace', 'Every question in this Recovery was graded.');
  if (targets.some((itemId) => !byReplaced.has(itemId)) || fresh.length !== targets.length) {
    refuse('recovery-replacement-incomplete', 'Every question MathMaster could not grade needs its own replacement.');
  }
  const existing = new Set(list(record.plan?.items).map((item) => item.itemId));
  if (fresh.some((item) => existing.has(clean(item.itemId)))) {
    refuse('recovery-replacement-identity', 'A replacement question must have a new identity.');
  }
  const supersede = (item) => (byReplaced.has(item.itemId) ? { ...item, supersededBy: clean(byReplaced.get(item.itemId).itemId) } : item);
  const added = fresh.map((item) => ({
    itemId: clean(item.itemId),
    storageIndex: Math.max(0, Number(item.storageIndex) || 0),
    questionId: clean(item.questionId),
    familyId: clean(item.familyId) || null,
    coverageKey: clean(item.coverageKey) || null,
    pin: normalizeDeliveryPin(item.pin),
    replaces: clean(item.replaces),
    issuedAt: clean(item.issuedAt) || iso(at),
    issueReason: clean(item.issueReason).slice(0, 80) || null,
  }));
  return {
    record: {
      ...record,
      // Still HELD: the grade and Classroom passback wait for the student's
      // answer, and code that predates replacements reads it as finished
      // (sectionRecoveryEvidence.mjs recoveryAwaitsReplacementAnswer).
      status: RECOVERY_RECORD_STATUS.HELD,
      plan: { ...record.plan, items: [...list(record.plan?.items).map(supersede), ...added] },
      hold: {
        ...record.hold,
        resolution: { ...resolution, replacements: added.map((item) => ({ from: item.replaces, to: item.itemId })) },
      },
      history: appendRecoveryHistory(record.history, {
        at: iso(at),
        event: RECOVERY_HISTORY_EVENT.TEACHER_OVERRIDE,
        detail: `${who(teacher)} issued ${plural(added.length, 'replacement question')} for ${added.map((item) => item.replaces).join(', ')} because MathMaster could not grade ${added.length === 1 ? 'it' : 'them'}. The questions already graded are kept and not asked again; the student may answer until their final submission date.${noteText}`,
      }),
    },
    gradeState: null,
  };
};
