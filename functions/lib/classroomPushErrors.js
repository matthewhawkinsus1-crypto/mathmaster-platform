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
  CLASSROOM_RATE_LIMITED_MESSAGE,
  classroomErrorAuditFields,
  classroomPushFailure,
  classroomPushHeldForLimit,
  clearedClassroomErrorFields,
  classroomStep,
  describeClassroomError,
  isClassroomQuotaError,
};
