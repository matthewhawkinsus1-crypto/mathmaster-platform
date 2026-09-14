/*
 * RECOVERING A GRADE FROM A WORKSPACE DRAFT — AND REFUSING TO, BY DEFAULT.
 *
 * A workspace draft is what was in the student's boxes, saved so a Chromebook
 * restart does not cost them their work. It is NOT an attempt: nobody pressed
 * Submit, no attempt was counted, and no deadline acted on it. Turning drafts
 * into grades wholesale would invent academic records, which is worse than the
 * incident it would be trying to repair.
 *
 * So this file's job is mostly to say NO, with a reason a teacher can read.
 * A draft may be proposed as a recoverable attempt only when ALL FIVE of these
 * are proven from server-held data:
 *
 *   1. the response is COMPLETE — it grades as a finished answer;
 *   2. its SERVER-STAMPED save time precedes the section's authoritative close,
 *      so it demonstrably existed before the cutoff (the per-entry `savedAt` is
 *      a Chromebook clock and is never used for this);
 *   3. the AUTHORITATIVE question can be reconstructed — the stored question at
 *      that index, matching the variant the draft was written against;
 *   4. the server holds a valid GRADING CONTRACT for it, through the same
 *      shared ordinary grading module a manual Submit uses;
 *   5. NO NEWER CANONICAL ATTEMPT exists for that question.
 *
 * Anything short of all five is preserved and reported as teacher-reviewable
 * recovery evidence. Nothing here writes; nothing here grades a response it
 * cannot reproduce; and even a fully proven draft is only a PROPOSAL, applied
 * by an explicit teacher action.
 */
import { readWorkspaceDraftEntries } from './workspaceDraftSchema.mjs';
import {
  gradeOrdinaryResponse,
  serverGradingSupport,
} from './ordinaryResponseGrading.mjs';
import { normalizeQuestionRecord } from './attemptPolicy.mjs';

const text = (value) => String(value ?? '');
const trimmed = (value) => text(value).trim();
// `Number(null)` is 0, and 0 is finite. Treating a missing close time as the
// epoch would silently mark every draft "saved after the cutoff", which is the
// wrong refusal and hides the real one.
const millisOrNull = (value) => (
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value)
);

/** Why a draft is not eligible. Every one of these keeps the data. */
export const DRAFT_RECOVERY_STATUS = Object.freeze({
  RECOVERABLE: 'recoverable',
  INCOMPLETE_RESPONSE: 'incomplete-response',
  SAVED_AFTER_CUTOFF: 'saved-after-cutoff',
  NO_PROVABLE_CUTOFF: 'no-provable-cutoff',
  QUESTION_NOT_RECONSTRUCTIBLE: 'question-not-reconstructible',
  UNSUPPORTED_QUESTION: 'unsupported-question',
  NEWER_CANONICAL_ATTEMPT: 'newer-canonical-attempt',
  NOT_A_RESPONSE_DRAFT: 'not-a-response-draft',
  PRACTICE_ONLY_BUCKET: 'practice-only-bucket',
});

/*
 * WHICH DRAFT KEYS HOLD A RESPONSE THIS MODULE CAN READ.
 *
 * A draft key is `<prefix>:<bucket>:<student>:<assignment>:<index>:<variant>`
 * plus a tool suffix. Only the suffixes below hold a whole response for a
 * question type the server can mark. Everything else — graph constructions,
 * step algebra, workflow stages, scratch state — is a workspace, not an answer,
 * and is reported rather than interpreted.
 */
const RESPONSE_SUFFIX_TYPES = Object.freeze({
  literal: { type: 'literal', kind: 'scalar' },
  'ordered-pair': { type: 'orderedPair', kind: 'scalar' },
  system: { type: 'system', kind: 'scalar' },
  'multi-answer': { type: 'multiAnswer', kind: 'fields' },
  table: { type: 'table', kind: 'fields' },
});

export const RECOVERABLE_DRAFT_SUFFIXES = Object.freeze(Object.keys(RESPONSE_SUFFIX_TYPES));

/** The tool suffix of a draft key, or null when it carries none. */
export const draftKeySuffix = (key) => {
  const parts = text(key).split(':');
  return parts.length > 1 ? parts[parts.length - 1] : null;
};

/** Post-deadline Practice Mode has its own bucket and never becomes a grade. */
export const draftKeyIsPracticeBucket = (key) => text(key).split(':').includes('practice');

/**
 * Rebuild the normalized response a draft holds, in the shape the shared
 * ordinary grading contract reads. Returns null when the value is not a
 * response this module can read — never a guess.
 */
export const responseFromDraftEntry = (entry) => {
  const suffix = draftKeySuffix(entry?.key);
  const shape = suffix ? RESPONSE_SUFFIX_TYPES[suffix] : null;
  if (!shape) return null;
  const value = entry?.value;

  if (shape.kind === 'scalar') {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    return { kind: 'scalar', type: shape.type, value: text(value).slice(0, 2000), fields: [] };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = Object.entries(value)
    .filter(([, fieldValue]) => typeof fieldValue === 'string' || typeof fieldValue === 'number')
    .slice(0, 60)
    .map(([id, fieldValue]) => ({
      id: text(id),
      value: text(fieldValue).slice(0, 240),
      isComplete: text(fieldValue).trim() !== '',
    }));
  if (!fields.length) return null;
  return { kind: 'fields', type: shape.type, value: '', fields };
};

const outcome = (status, reason, extra = {}) => ({
  status,
  recoverable: status === DRAFT_RECOVERY_STATUS.RECOVERABLE,
  reason: reason || status,
  ...extra,
});

/**
 * Assess ONE draft entry against authoritative context.
 *
 * `documentSavedAtMs` is the SERVER's `updatedAt` on the draft document — the
 * only save time a student's clock cannot move. `closesAtMs` is the section's
 * authoritative close, resolved by the caller from the assignment, the bell
 * schedule and the teacher's overrides.
 */
export const assessWorkspaceDraftEntry = ({
  entry,
  question = null,
  canonicalRecord = null,
  documentSavedAtMs = null,
  closesAtMs = null,
} = {}) => {
  const questionIndex = Number.isInteger(Number(entry?.questionIndex)) ? Number(entry.questionIndex) : null;
  const base = { key: text(entry?.key), questionIndex, savedAt: Number(entry?.savedAt) || 0 };

  if (draftKeyIsPracticeBucket(entry?.key)) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.PRACTICE_ONLY_BUCKET, 'post-deadline-practice-never-graded') };
  }
  const response = responseFromDraftEntry(entry);
  if (!response) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.NOT_A_RESPONSE_DRAFT, `tool-workspace:${draftKeySuffix(entry?.key) || 'none'}`) };
  }
  if (questionIndex === null) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.QUESTION_NOT_RECONSTRUCTIBLE, 'draft-has-no-question-index') };
  }
  if (!question || typeof question !== 'object') {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.QUESTION_NOT_RECONSTRUCTIBLE, 'question-index-not-found') };
  }

  const canonical = normalizeQuestionRecord(canonicalRecord);
  // The answer key moved when the student took a replacement question, so a
  // draft written against the previous variant can no longer be marked.
  if (Number(entry?.variantIndex ?? 0) !== Number(canonical.variantIndex || 0)) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.QUESTION_NOT_RECONSTRUCTIBLE, 'variant-superseded') };
  }

  const support = serverGradingSupport(question);
  if (!support.supported) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.UNSUPPORTED_QUESTION, `unsupported-question:${support.reason}`) };
  }
  if (trimmed(question.type) !== response.type) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.QUESTION_NOT_RECONSTRUCTIBLE, `draft-type-mismatch:${response.type}`) };
  }

  // A question that already has an attempt is settled. Recovery repairs a
  // MISSING record; it never adds to, or argues with, one that exists.
  if (Number(canonical.totalAttempts || 0) > 0) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.NEWER_CANONICAL_ATTEMPT, 'question-already-has-an-attempt', { canonicalAttempts: Number(canonical.totalAttempts) }) };
  }

  const grading = gradeOrdinaryResponse({ question, response });
  if (!grading.graded) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.INCOMPLETE_RESPONSE, grading.reason || 'incomplete-response') };
  }

  const closeAt = millisOrNull(closesAtMs);
  const savedAt = millisOrNull(documentSavedAtMs);
  if (closeAt === null) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.NO_PROVABLE_CUTOFF, 'no-authoritative-close') };
  }
  if (savedAt === null) {
    return { ...base, ...outcome(DRAFT_RECOVERY_STATUS.NO_PROVABLE_CUTOFF, 'no-server-save-time') };
  }
  if (savedAt > closeAt) {
    return {
      ...base,
      ...outcome(DRAFT_RECOVERY_STATUS.SAVED_AFTER_CUTOFF, 'server-save-time-after-close', {
        documentSavedAtMs: savedAt,
        closesAtMs: closeAt,
      }),
    };
  }

  return {
    ...base,
    ...outcome(DRAFT_RECOVERY_STATUS.RECOVERABLE, 'all-five-proofs-hold', {
      response,
      documentSavedAtMs: savedAt,
      closesAtMs: closeAt,
    }),
  };
};

/**
 * Assess a whole draft document, one entry at a time.
 *
 * `resolveQuestion`, `resolveCanonicalRecord` and `resolveCloseAt` are supplied
 * by the caller so this module reads nothing itself.
 */
export const assessWorkspaceDraftDocument = ({
  document,
  documentSavedAtMs = null,
  resolveQuestion = () => null,
  resolveCanonicalRecord = () => null,
  resolveCloseAt = () => null,
} = {}) => {
  const entries = readWorkspaceDraftEntries(document);
  const assessments = entries.map((entry) => assessWorkspaceDraftEntry({
    entry,
    question: resolveQuestion(entry),
    canonicalRecord: resolveCanonicalRecord(entry),
    documentSavedAtMs,
    closesAtMs: resolveCloseAt(entry),
  }));
  const counts = assessments.reduce((tally, assessment) => ({
    ...tally,
    [assessment.status]: (tally[assessment.status] || 0) + 1,
  }), {});
  return {
    studentId: text(document?.studentId) || null,
    assignmentId: text(document?.assignmentId) || null,
    entryCount: entries.length,
    latestSavedAt: entries.length ? Math.max(...entries.map((entry) => Number(entry.savedAt) || 0)) : null,
    documentSavedAtMs: millisOrNull(documentSavedAtMs),
    counts,
    recoverable: assessments.filter((assessment) => assessment.recoverable),
    needsReview: assessments.filter((assessment) => !assessment.recoverable),
  };
};
