/*
 * THE TIME A SAVED DRAFT HAS TO BE NEWER THAN.
 *
 * Two readers ask "is this saved workspace older than the answer the platform
 * already recorded for the question?": a tool restoring its workspace
 * (toolDraftIsSuperseded in usePersistentToolState.js, given this time by
 * QuestionEngine) and the restore of the server's draft backup
 * (selectRestorableDraftEntries, called from App.jsx). Both compared against
 * the record's `lastAttemptAt`. For an answer the student submitted, that is
 * when they pressed Submit, and the workspace that produced it is re-stamped
 * at that moment (stampToolDraftSubmission), so the comparison holds.
 *
 * A Warm-Up or DOL deadline submits FOR the student, on the server. That
 * attempt is recorded at the close — its academic time, correctly — while the
 * work itself was last touched earlier, when the device captured the
 * checkpoint. Compared with the close, the student's own workspace — the very
 * card sort that was just auto-submitted — looked older than its own
 * submission: the next mount deleted it, the server backup was refused, and
 * once the teacher reopened the Warm-Up the board came back empty on every
 * Chromebook, with the attempt spent.
 *
 * For a deadline auto-submit the recorded answer is the checkpoint revision
 * the finalizer graded, and the attempt's own id names it:
 * `deadline:<checkpoint id>:<revision>` (checkpointSubmissionId in
 * functions/shared/responseCheckpointFinalizer.mjs). The revision is the time
 * the platform captured that work on the device — on the same device clock
 * that dated the workspace — and the capture FOLLOWS the edit it records: the
 * checkpoint waits out a debounce (CHECKPOINT_DEBOUNCE_MS, 1.2 s) after the
 * shared grader has said the work is complete. So the work that was submitted
 * was saved up to a few seconds BEFORE its revision, and the time a saved
 * workspace must be newer than is the start of that window. A workspace saved
 * after it is the submitted work or newer work; one saved before it is older.
 * Every other record keeps `lastAttemptAt`.
 *
 * This decides only which saved workspace is shown. No attempt, grade, pin or
 * piece of evidence reads it, and it never changes the record.
 */

export const DEADLINE_SUBMISSION_ORIGIN = 'deadline-auto-submit';
const DEADLINE_SUBMISSION_PREFIX = 'deadline:';

/*
 * How long before its capture the captured work can have been saved: the
 * checkpoint debounce plus the shared grader's completeness check, with room
 * for a Chromebook loading that grader for the first time.
 */
export const CHECKPOINT_CAPTURE_WINDOW_MS = 10_000;

/** The checkpoint revision a deadline attempt's id names, or 0. */
export const deadlineSubmissionRevision = (submissionId) => {
  const id = String(submissionId ?? '');
  if (!id.startsWith(DEADLINE_SUBMISSION_PREFIX)) return 0;
  const revision = Number(id.slice(id.lastIndexOf(':') + 1));
  return Number.isFinite(revision) && revision > 0 ? revision : 0;
};

/**
 * Milliseconds: when the question's recorded answer was last worked on, or 0
 * when nothing has been recorded. `record` is a question record (normalized or
 * not).
 */
export const canonicalResponseSavedAt = (record) => {
  const recorded = Date.parse(record?.lastAttemptAt || record?.recordedAt || '') || 0;
  if (String(record?.submissionOrigin || '') !== DEADLINE_SUBMISSION_ORIGIN) return recorded;
  const revision = deadlineSubmissionRevision(record?.lastSubmissionId);
  // Captured work cannot postdate the close it was submitted at; a revision
  // that claims to (a device clock running fast) is not used.
  if (!revision || (recorded && revision > recorded)) return recorded;
  return Math.max(0, revision - CHECKPOINT_CAPTURE_WINDOW_MS);
};
