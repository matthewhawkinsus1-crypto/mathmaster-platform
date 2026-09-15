/*
 * WHAT MAY BE DONE WITH A CAPTURED STUDENT SUBMISSION.
 *
 * This file exists because of a production incident. Ordinary Submit used to
 * write straight to Firestore; after PR #226 it crosses a durable local
 * boundary first and a background reconciler carries it to
 * `grades/{studentId}.gradesByAssignment`. That reconciler answered every
 * failure with one word — `rejected` — and the outbox DELETED anything
 * rejected. So "the teacher closed the section a minute ago", "your roster row
 * has not been created yet" and "you already submitted this" were all
 * indistinguishable, and all three destroyed the student's work.
 *
 * A single verdict is never enough. Every way a submission can fail to become
 * canonical is classified here into exactly one of:
 *
 *   ACCEPTED            write it.
 *   DUPLICATE           this exact submission is already canonical. Retire it.
 *   SUPERSEDED          a NEWER canonical attempt exists for this question, so
 *                       writing this one would create a duplicate or
 *                       out-of-order attempt. Retire it.
 *   PERMANENTLY_INVALID proven, from the capture-time evidence, that this work
 *                       was never eligible for credit. Retire it.
 *   NEEDS_REVIEW        cannot be proven either way and retrying will not
 *                       change that. KEEP it, as teacher-reviewable evidence.
 *   RETRYABLE           might still succeed. KEEP it and try again.
 *
 * Only DUPLICATE, SUPERSEDED and PERMANENTLY_INVALID may retire academic work,
 * and even then the retired envelope is kept as recovery evidence rather than
 * erased. Everything else stays queued. That is the whole safety property.
 */

export const SUBMISSION_DISPOSITION = Object.freeze({
  ACCEPTED: 'accepted',
  DUPLICATE: 'duplicate',
  SUPERSEDED: 'superseded',
  PERMANENTLY_INVALID: 'permanently-invalid',
  NEEDS_REVIEW: 'needs-review',
  RETRYABLE: 'retryable',
});

/** Dispositions that take an action out of the delivery queue. */
export const TERMINAL_DISPOSITIONS = Object.freeze([
  SUBMISSION_DISPOSITION.ACCEPTED,
  SUBMISSION_DISPOSITION.DUPLICATE,
  SUBMISSION_DISPOSITION.SUPERSEDED,
  SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
]);

/**
 * Dispositions that retire a captured submission WITHOUT a canonical write.
 *
 * Each one must be provable. `NEEDS_REVIEW` is deliberately absent: it is the
 * disposition for everything MathMaster cannot prove, and unprovable work is
 * kept, not retired.
 */
export const RETIRING_DISPOSITIONS = Object.freeze([
  SUBMISSION_DISPOSITION.DUPLICATE,
  SUBMISSION_DISPOSITION.SUPERSEDED,
  SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
]);

export const isTerminalDisposition = (disposition) => TERMINAL_DISPOSITIONS.includes(String(disposition || ''));
export const retainsStudentWork = (disposition) => !isTerminalDisposition(disposition);

const text = (value) => String(value ?? '').trim();
const millis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const outcome = (disposition, reason, extra = {}) => ({ disposition, reason: reason || null, ...extra });

/*
 * HOW LONG A SUBMISSION MAY KEEP RETRYING BEFORE A HUMAN IS ASKED.
 *
 * A retryable condition that has not cleared in a school week is not going to
 * clear by itself — the assignment was deleted, the student was moved off the
 * roster, something is genuinely wrong. Retrying it forever hides it. The
 * submission is NOT discarded: it becomes NEEDS_REVIEW, which keeps the work
 * and surfaces it in the teacher recovery report with its reason.
 */
export const RETRY_ESCALATION_ATTEMPTS = 40;
export const RETRY_ESCALATION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const shouldEscalateToReview = ({ deliveryAttempts = 0, capturedAt = null, now = Date.now() } = {}) => {
  const age = millis(capturedAt) === null ? 0 : now - millis(capturedAt);
  return Number(deliveryAttempts) >= RETRY_ESCALATION_ATTEMPTS && age >= RETRY_ESCALATION_AGE_MS;
};

/**
 * Was this section open when the student pressed Submit?
 *
 * Returns `null` when that cannot be decided from the evidence available, and
 * `null` is a real answer — it is the difference between "the teacher closed
 * Classwork before this student answered" and "the teacher closed Classwork
 * while this answer was still in the queue". The old code could not tell them
 * apart and erased the student's work for both.
 *
 * `capturedSectionAccess` is the section state the browser recorded AT CAPTURE.
 * It is the only witness that does not depend on a teacher's later edits, so it
 * is consulted first. Otherwise the current override's `changedAt` is used: a
 * close stamped AFTER the capture cannot have applied to it.
 */
export const sectionWasOpenAtCapture = ({
  capturedSectionAccess = null,
  liveSectionAccess = null,
  capturedAt = null,
} = {}) => {
  const live = liveSectionAccess && typeof liveSectionAccess === 'object' ? liveSectionAccess : null;
  const capture = millis(capturedAt);
  const closedNow = Boolean(live && live.enabled === true && live.isOpen !== true);
  const closedAt = closedNow ? millis(live?.override?.changedAt) : null;

  /*
   * THE SERVER'S OWN CLOSE TIME OUTRANKS THE BROWSER'S SNAPSHOT.
   *
   * The capture proof is read from the student's assignment listener, and that
   * listener can be STALE: a teacher closes Classwork at 10:00, the update has
   * not reached the device, and the student answers at 10:05 with a snapshot
   * that still says open. Trusting that snapshot unconditionally would launder
   * post-close work into a grade — so when the assignment itself carries a
   * close stamped at or before the capture, that is the answer.
   *
   * This still preserves the rule the incident turned on: a close stamped
   * AFTER the capture closed the section on a student who had already
   * answered, and their work stands.
   */
  if (closedAt !== null && capture !== null) return closedAt > capture;

  // No close in force: nothing to have been closed against.
  if (!closedNow) return true;

  /*
   * Closed now, with no record of WHEN. The section state the browser observed
   * at capture is the only witness left, and it is the reason a teacher's
   * later close cannot silently erase work — see the incident write-up.
   */
  const captured = capturedSectionAccess && typeof capturedSectionAccess === 'object' ? capturedSectionAccess : null;
  if (captured && typeof captured.isOpen === 'boolean') return captured.isOpen;

  // Closed, and nothing anywhere says when. Unprovable either way.
  return null;
};

/**
 * Classify one captured submission against authoritative, freshly read context.
 *
 * Nothing here reads a verdict, a score or an answer key. It decides only
 * whether this submission may become a canonical attempt, must be retired, or
 * must be kept.
 */
export const classifyCapturedSubmission = ({
  actionId,
  kind = 'ordinarySubmission',
  activityRole = null,
  capturedAt = null,
  previousTotalAttempts = 0,
  canonicalRecord = null,
  assignmentExists = null,
  gradeRecordExists = null,
  authorizedForClass = null,
  assignmentClosedAtCapture = null,
  teacherReopenedWarmupAtCapture = false,
  warmupActiveAtCapture = null,
  sectionOpenAtCapture = null,
  deliveryAttempts = 0,
  now = Date.now(),
} = {}) => {
  const id = text(actionId);
  if (!id) return outcome(SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'missing-action-id');

  const canonical = canonicalRecord && typeof canonicalRecord === 'object' ? canonicalRecord : {};
  const canonicalAttempts = Number(canonical.totalAttempts || 0);
  const expectedAttempts = Number(previousTotalAttempts || 0);

  // Idempotency comes first: a retry of a submission that already landed must
  // resolve as a duplicate no matter what the section or the lifecycle says
  // now, or a reconnect after the bell would "invalidate" work already graded.
  if (text(canonical.lastSubmissionId) === id) {
    return outcome(SUBMISSION_DISPOSITION.DUPLICATE, 'already-canonical');
  }

  const escalate = (reason) => (
    shouldEscalateToReview({ deliveryAttempts, capturedAt, now })
      ? outcome(SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason)
      : outcome(SUBMISSION_DISPOSITION.RETRYABLE, reason)
  );

  // A document MathMaster could not read is not evidence that the student did
  // something wrong. Both of these used to destroy the submission.
  if (assignmentExists === false) return escalate('assignment-unreadable');
  if (gradeRecordExists === false) return escalate('grade-record-missing');
  if (authorizedForClass === false) return escalate('assignment-not-assigned-to-class');

  /*
   * LIFECYCLE AND SECTION STATE ARE JUDGED AT CAPTURE TIME.
   *
   * `assignmentClosedAtCapture` is resolved by the caller against the moment
   * the student pressed Submit. Only a close that was already in force then
   * makes the work ineligible, and that is a proof — so it retires.
   *
   * A Warm-Up the teacher had reopened is a live credit window even when the
   * assignment's own cutoff has passed, which is why it overrides.
   */
  if (assignmentClosedAtCapture === true && teacherReopenedWarmupAtCapture !== true) {
    return outcome(SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'assignment-closed-at-capture');
  }
  if (activityRole === 'warmup' && warmupActiveAtCapture === false) {
    return outcome(SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'warmup-closed-at-capture');
  }
  if (sectionOpenAtCapture === false) {
    return outcome(SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, 'section-closed-at-capture');
  }
  if (sectionOpenAtCapture === null) {
    // Closed now, with no proof of when. Keeping the work and telling the
    // teacher beats both "grade it anyway" and "erase it".
    return outcome(SUBMISSION_DISPOSITION.NEEDS_REVIEW, 'section-close-time-unknown');
  }

  /*
   * ATTEMPT ORDERING.
   *
   * `previousTotalAttempts` is what the canonical record looked like before
   * this response. It is how two attempts at the same question stay ordered
   * and how a stale queued action is stopped from overwriting a newer one.
   *
   *   canonical AHEAD  — a newer attempt already counted. This one would
   *                      duplicate or reorder history: SUPERSEDED.
   *   canonical BEHIND — an earlier attempt for this question has not landed
   *                      yet. That is a queue-order problem, not an invalid
   *                      submission: RETRYABLE, so the earlier one can go
   *                      first. Rejecting it is what cascaded one lost Warm-Up
   *                      attempt into every later attempt on that question.
   */
  if (canonicalAttempts > expectedAttempts) {
    return outcome(SUBMISSION_DISPOSITION.SUPERSEDED, 'newer-canonical-attempt', {
      canonicalAttempts,
      expectedAttempts,
    });
  }
  if (canonicalAttempts < expectedAttempts) {
    return escalate('awaiting-earlier-attempt');
  }

  return outcome(SUBMISSION_DISPOSITION.ACCEPTED, null);
};

/**
 * Normalize whatever a reconciler returned into a disposition.
 *
 * A reconciler written before this module returns `{ status: 'durable' }` or
 * the bare `{ status: 'rejected' }` that caused the incident. `rejected` maps
 * to RETRYABLE — never to a retirement — because a generic rejection proves
 * nothing. Proving something requires saying so explicitly.
 */
export const normalizeReconcileOutcome = (result) => {
  if (result && typeof result === 'object' && text(result.disposition)) {
    const disposition = text(result.disposition);
    const known = Object.values(SUBMISSION_DISPOSITION).includes(disposition);
    return {
      disposition: known ? disposition : SUBMISSION_DISPOSITION.RETRYABLE,
      reason: result.reason || (known ? null : `unknown-disposition:${disposition}`),
      receipt: result.receipt || null,
    };
  }
  const status = text(result?.status);
  if (status === 'durable') {
    return {
      disposition: result?.duplicate === true ? SUBMISSION_DISPOSITION.DUPLICATE : SUBMISSION_DISPOSITION.ACCEPTED,
      reason: null,
      receipt: result?.receipt || null,
    };
  }
  if (status === 'rejected') {
    return { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'unclassified-rejection', receipt: null };
  }
  return { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: status ? `unfinished:${status}` : 'no-outcome', receipt: null };
};
