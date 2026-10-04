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
 *                      never rewritten. The Recovery is in progress again and
 *                      the student answers ONLY the new questions — the ones
 *                      already graded are carried, never asked or re-marked.
 *
 * Every resolution is appended to the record's history as a teacher action
 * (who, when, what, the note) and stays on the record's hold; the callable
 * also writes a gradeOverrideAudits row.
 *
 * Pure: no Firestore, no clock (`at` is passed in).
 */
import { RECOVERY_TYPE } from './recoveryPolicy.mjs';
import { RECOVERY_HISTORY_EVENT, appendRecoveryHistory, buildSectionRecoveryGradeState } from './sectionRecoveryGrade.mjs';
import {
  RECOVERY_RECORD_STATUS,
  RecoveryTransitionError,
  activeRecoveryPlanItems,
  normalizeRecoveryRecord,
  recoveryEvidenceItem,
} from './sectionRecoveryRecord.mjs';
import { isGradedItemStatus, scoreRecoveryEvidence } from './sectionRecoveryEvidence.mjs';
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

const evidenceItemsOf = (record) => activeRecoveryPlanItems(record)
  .map((item) => recoveryEvidenceItem(item, record.results?.[item.itemId]));

/** The resolutions this record allows, in the order a teacher should consider them. */
export const heldRecoveryActionsFor = (rawRecord, section = null) => {
  const record = normalizeRecoveryRecord(rawRecord, section);
  if (record?.status !== RECOVERY_RECORD_STATUS.HELD) return [];
  const anyGraded = evidenceItemsOf(record).some((item) => isGradedItemStatus(item.status));
  return [
    ...(heldRecoveryItemIds(record).length ? [HELD_RECOVERY_ACTION.ISSUE_REPLACEMENT] : []),
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
 * Apply one resolution to a HELD record.
 *
 * Returns { record, gradeState } — gradeState is null when no section grade
 * changes (a replacement: the Recovery is in progress again).
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
  if (!record || record.status !== RECOVERY_RECORD_STATUS.HELD) {
    refuse('recovery-not-held', 'This Recovery is not waiting for a teacher.');
  }
  if (!isHeldRecoveryAction(action)) refuse('recovery-resolution-unknown', 'Choose how to resolve this Recovery.');
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
    const excludedItemIds = items.filter((item) => !isGradedItemStatus(item.status)).map((item) => item.itemId);
    const state = gradeStateFor(rawScore);
    return {
      record: {
        ...record,
        status: RECOVERY_RECORD_STATUS.COMPLETED,
        rawScore,
        evidence: { ...record.evidence, excludedItemIds, finalizedBy: 'teacher' },
        hold: { ...record.hold, resolution },
        originalScoreAtCompletion: original,
        originalAttemptedAtCompletion: originalAttempted !== false,
        recordedScoreAtCompletion: state.recordedScore,
        completedAt: iso(at),
        history: appendRecoveryHistory(record.history, {
          at: iso(at),
          event: RECOVERY_HISTORY_EVENT.TEACHER_OVERRIDE,
          detail: `${who(teacher)} finalized this Recovery from the ${plural(graded, 'question')} MathMaster could grade; `
            + `${plural(excludedItemIds.length, 'question')} it could not grade ${excludedItemIds.length === 1 ? 'was' : 'were'} left out of the score. ${state.reason}${noteText}`,
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
  const resolved = {
    ...record.hold,
    resolution: { ...resolution, replacements: added.map((item) => ({ from: item.replaces, to: item.itemId })) },
  };
  return {
    record: {
      ...record,
      status: RECOVERY_RECORD_STATUS.IN_PROGRESS,
      plan: { ...record.plan, items: [...list(record.plan?.items).map(supersede), ...added] },
      hold: null,
      holdHistory: [...list(record.holdHistory), resolved].slice(-10),
      history: appendRecoveryHistory(record.history, {
        at: iso(at),
        event: RECOVERY_HISTORY_EVENT.TEACHER_OVERRIDE,
        detail: `${who(teacher)} issued ${plural(added.length, 'replacement question')} for ${added.map((item) => item.replaces).join(', ')} because MathMaster could not grade ${added.length === 1 ? 'it' : 'them'}. The questions already graded are kept and not asked again.${noteText}`,
      }),
    },
    gradeState: null,
  };
};
