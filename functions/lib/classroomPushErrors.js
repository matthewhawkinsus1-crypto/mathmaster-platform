"use strict";

/*
 * WHAT GOOGLE CLASSROOM ACTUALLY SAID WHEN A GRADE PUSH FAILED.
 *
 * Until Oct 14, 2026 a failed push kept only `error.message`. For 337 pushes
 * that day that was "Precondition check failed.", which says nothing about the
 * cause. Google's HTTP status, its status name (FAILED_PRECONDITION) and its
 * reason codes were lost, and the section trigger's log line lost even the
 * message: the logger's own `message` field replaced it.
 *
 * The three Classroom calls in lib/classroom.js tag a thrown error with the
 * step that failed. This module turns that error into small, loggable fields.
 * gaxios already removes the Authorization header from errors; only the
 * fields below are kept, never the request.
 */

const { FieldValue } = require("firebase-admin/firestore");

const CLASSROOM_ERROR_STEPS = Object.freeze({
  findSubmission: "find-submission",
  patchGrade: "patch-grade",
  returnSubmission: "return-submission",
});

const text = (value, max) => String(value ?? "").trim().slice(0, max);

function describeClassroomError(error) {
  const body = error?.response?.data?.error;
  const apiError = body && typeof body === "object" ? body : {};
  const httpStatus = [error?.response?.status, error?.status, apiError.code, error?.code]
    .map(Number)
    .find((value) => Number.isInteger(value) && value >= 100 && value <= 599) ?? null;
  const reasons = [...new Set([
    ...(Array.isArray(apiError.errors) ? apiError.errors : []),
    ...(Array.isArray(apiError.details) ? apiError.details : []),
    ...(Array.isArray(error?.errors) ? error.errors : []),
  ].map((entry) => text(entry?.reason, 100)).filter(Boolean))].slice(0, 5);
  return {
    step: text(error?.classroomStep, 40) || null,
    httpStatus,
    googleStatus: text(apiError.status, 60) || null,
    reasons,
    message: text(apiError.message || error?.message || error, 500),
  };
}

// Google answers a request over the per-minute limit with 429 / RESOURCE_EXHAUSTED.
// Waiting and sending again is the whole fix.
function isClassroomQuotaError(description) {
  return description.httpStatus === 429
    || description.googleStatus === "RESOURCE_EXHAUSTED"
    || description.reasons.some((reason) => /rate.?limit.?exceeded|quota.?exceeded/i.test(reason))
    || /^quota exceeded/i.test(description.message);
}

// Stored on the classroomGradeSyncs row.
function classroomErrorAuditFields(description) {
  return {
    error: description.message,
    errorStep: description.step,
    errorCode: description.httpStatus,
    errorStatus: description.googleStatus,
    errorReasons: description.reasons,
  };
}

const CLASSROOM_RATE_LIMITED_MESSAGE = "Google Classroom's per-minute limit was reached. MathMaster sends this grade again automatically.";
const CLASSROOM_RATE_LIMIT_EXHAUSTED_MESSAGE = "Google Classroom's per-minute limit refused this grade for about two hours of automatic retries. Retry it from this page.";
const NOT_SENT_AFTER_LIMIT = "Not sent: Google Classroom's per-minute limit was reached earlier in this push.";

// A row that synced keeps no error from an earlier attempt.
function clearedClassroomErrorFields() {
  return {
    error: FieldValue.delete(),
    errorStep: FieldValue.delete(),
    errorCode: FieldValue.delete(),
    errorStatus: FieldValue.delete(),
    errorReasons: FieldValue.delete(),
  };
}

/**
 * The audit fields for a push Google refused. A refusal for the per-minute
 * limit is "rate-limited" while it can still be queued again, and "failed"
 * (for the teacher to see and retry) once it cannot.
 */
function classroomPushFailure(error, { mayRequeue }) {
  const description = describeClassroomError(error);
  const quota = isClassroomQuotaError(description);
  const fields = classroomErrorAuditFields(description);
  if (quota && mayRequeue) return { description, quota, audit: { status: "rate-limited", message: CLASSROOM_RATE_LIMITED_MESSAGE, ...fields } };
  if (quota) return { description, quota, audit: { status: "failed", message: CLASSROOM_RATE_LIMIT_EXHAUSTED_MESSAGE, ...fields } };
  return { description, quota, audit: { status: "failed", ...fields } };
}

/*
 * A GRADE CLASSROOM HOLDS BUT WOULD NOT RETURN.
 *
 * Google's grading guide: "The submission can only be returned if it has
 * already been turned in by the student." Setting a grade has no such rule.
 * MathMaster students work in MathMaster, and many never press Turn in on
 * Classroom, so a section's final grade was patched and then its return was
 * refused with 400 FAILED_PRECONDITION ("Precondition check failed."). The row
 * was marked failed, logged as an error, and every later grade write sent the
 * grade and asked for the return again: about 100-200 errors a pass, from
 * ordinary grade syncs as well as the pushes after a checkpoint (Nov 1-12,
 * 2026, issue #545).
 *
 * Such a row is now "graded-not-returned". The grade stays in Classroom, the
 * row says why it was not returned, and the section trigger does not ask
 * Google to return that submission again while it is still in the state Google
 * refused it in, unless a teacher sends that grade again.
 */
const CLASSROOM_GRADED_NOT_RETURNED = "graded-not-returned";
// Google's states for work that is not turned in: never opened (NEW), opened
// (CREATED), and turned in and then unsubmitted (RECLAIMED_BY_STUDENT).
const NOT_TURNED_IN_STATES = new Set(["NEW", "CREATED", "RECLAIMED_BY_STUDENT"]);
const RETURN_REFUSED_MESSAGES = Object.freeze({
  "not-turned-in": "Grade saved in Classroom, not returned: the student hasn't turned it in there, and Google lets MathMaster return only turned-in work. Return it in Classroom, or press Retry once they turn it in.",
  refused: "Grade saved in Classroom, not returned: Classroom refused to return it. MathMaster won't ask again until the submission changes there. Return it in Classroom, or press Retry.",
});

const submissionStateText = (value) => text(value, 40).toUpperCase();

function returnRefusalFields(reason, submissionState) {
  return {
    status: CLASSROOM_GRADED_NOT_RETURNED,
    message: RETURN_REFUSED_MESSAGES[reason],
    returnRefusedReason: reason,
    returnRefusedState: submissionState || null,
  };
}

/**
 * The row for a return Google refused for its precondition, after the grade
 * itself was saved, or null for any other error (those stay failures).
 * `submissionState` is the state the submission was in when it was refused.
 */
function classroomReturnRefusal(error, { submissionState = null } = {}) {
  const description = describeClassroomError(error);
  const precondition = description.googleStatus === "FAILED_PRECONDITION"
    || description.reasons.some((reason) => /^failed.?precondition$/i.test(reason));
  if (description.step !== CLASSROOM_ERROR_STEPS.returnSubmission || !precondition) return null;
  const state = submissionStateText(submissionState) || null;
  const reason = NOT_TURNED_IN_STATES.has(state) ? "not-turned-in" : "refused";
  return {
    description,
    reason,
    submissionState: state,
    audit: {
      ...classroomErrorAuditFields(description),
      ...returnRefusalFields(reason, state),
      returnRefusedAt: FieldValue.serverTimestamp(),
    },
  };
}

/**
 * A refusal that still stands: the row says Google refused to return this same
 * submission, and it is still in the state it was refused in, so asking again
 * would be refused again. Null when anything Google could act on has changed.
 */
function standingClassroomReturnRefusal({ prior = {}, courseworkId, submissionId, submissionState } = {}) {
  if (prior?.status !== CLASSROOM_GRADED_NOT_RETURNED) return null;
  const refusedIn = submissionStateText(prior.returnRefusedState);
  if (!refusedIn || refusedIn !== submissionStateText(submissionState)) return null;
  if (text(prior.submissionId, 200) !== text(submissionId, 200)) return null;
  if (text(prior.courseworkId, 200) !== text(courseworkId, 200)) return null;
  const reason = prior.returnRefusedReason === "not-turned-in" ? "not-turned-in" : "refused";
  return { reason, submissionState: refusedIn, audit: returnRefusalFields(reason, refusedIn) };
}

// A row synced after a refused return no longer says it was not returned.
function clearedReturnRefusalFields(prior = {}) {
  if (prior?.status !== CLASSROOM_GRADED_NOT_RETURNED && prior?.returnRefusedReason == null) return {};
  return {
    message: FieldValue.delete(),
    returnRefusedReason: FieldValue.delete(),
    returnRefusedState: FieldValue.delete(),
    returnRefusedAt: FieldValue.delete(),
  };
}

// A column not sent because Google already refused this teacher in this push.
function classroomPushHeldForLimit({ mayRequeue }) {
  return {
    ...clearedClassroomErrorFields(),
    status: mayRequeue ? "rate-limited" : "failed",
    message: mayRequeue ? CLASSROOM_RATE_LIMITED_MESSAGE : CLASSROOM_RATE_LIMIT_EXHAUSTED_MESSAGE,
    error: NOT_SENT_AFTER_LIMIT,
  };
}

// Tags an error thrown by one Classroom call with the step it came from.
async function classroomStep(step, call) {
  try {
    return await call();
  } catch (error) {
    if (error && typeof error === "object" && !error.classroomStep) error.classroomStep = step;
    throw error;
  }
}

module.exports = {
  CLASSROOM_ERROR_STEPS,
  CLASSROOM_GRADED_NOT_RETURNED,
  CLASSROOM_RATE_LIMITED_MESSAGE,
  RETURN_REFUSED_MESSAGES,
  classroomErrorAuditFields,
  classroomPushFailure,
  classroomPushHeldForLimit,
  classroomReturnRefusal,
  clearedClassroomErrorFields,
  clearedReturnRefusalFields,
  classroomStep,
  describeClassroomError,
  isClassroomQuotaError,
  standingClassroomReturnRefusal,
};
