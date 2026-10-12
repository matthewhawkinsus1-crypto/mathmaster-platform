/*
 * ONE TEACHER ACTION FOR MANY STUDENTS — AND AN HONEST ACCOUNT OF IT.
 *
 * "Waive Review" and "Open Test sessions" used to be one browser request per
 * student (or one request that walked a whole class inside a single 60-second
 * limit and reported nothing if it was cut off). A class of thirty was thirty
 * chances for a request to be lost, and a request that timed out half-way left
 * some students changed, others not, and the teacher told only "the server did
 * not answer".
 *
 * A bulk operation is a stored document with an id:
 *
 *   - the browser names the operation (its id is the idempotency key) and the
 *     server resolves who it applies to, once, from the audience it authorizes;
 *   - the server works through the students in small batches inside a time
 *     budget, writing each student's outcome to the operation as it goes;
 *   - when the budget runs out it returns with the operation still `running`,
 *     and the browser asks again with the same id: the server continues with
 *     the students who have no outcome yet. Nothing is done twice, because
 *     each student's step is itself idempotent and a student with an outcome
 *     is never revisited;
 *   - a teacher who closes the tab finds the operation on the panel when they
 *     come back, with how far it got, and can finish it.
 *
 * FOUR OUTCOMES, NEVER ONE WORD FOR ALL OF THEM.
 *   succeeded        the change was made for this student;
 *   alreadyComplete  it was already true (already waived, session already open);
 *   notEligible      the action does not apply to them, with the reason;
 *   failed           it was attempted and did not happen, with the reason.
 *
 * `summarizeBulkOperation` is the only place the headline is written, and it
 * says "done" only when nobody failed and nobody is still pending. A partial
 * failure is reported as one, with each student's reason.
 *
 * Pure by construction: no Firestore, no network, no clock of its own.
 */

export const BULK_ACTION = Object.freeze({
  WAIVE_REVIEW: 'waiveReview',
  OPEN_TEST_SESSIONS: 'openTestSessions',
});
export const BULK_ACTIONS = Object.freeze(Object.values(BULK_ACTION));

export const BULK_ACTION_LABEL = Object.freeze({
  [BULK_ACTION.WAIVE_REVIEW]: 'Waive Review',
  [BULK_ACTION.OPEN_TEST_SESSIONS]: 'Open Test sessions',
});

export const BULK_OUTCOME = Object.freeze({
  SUCCEEDED: 'succeeded',
  ALREADY_COMPLETE: 'alreadyComplete',
  NOT_ELIGIBLE: 'notEligible',
  FAILED: 'failed',
});
const OUTCOMES = Object.freeze(Object.values(BULK_OUTCOME));

export const BULK_STATUS = Object.freeze({
  RUNNING: 'running',
  COMPLETED: 'completed',
  COMPLETED_WITH_FAILURES: 'completedWithFailures',
});

/** A whole school's worth is not one operation; a grade level's classes are. */
export const BULK_MAX_TARGETS = 400;
/** Students changed at once. Each is its own transaction on its own documents. */
export const BULK_CONCURRENCY = 4;
/** Work for this long, then hand back so no single request nears its limit. */
export const BULK_TIME_BUDGET_MS = 25000;

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const OPERATION_ID = /^[A-Za-z0-9_-]{8,80}$/;

/** The browser's idempotency key, or null when it is not one we will store. */
export const normalizeBulkOperationId = (value) => {
  const id = clean(value);
  return OPERATION_ID.test(id) ? id : null;
};

/** Distinct, trimmed student ids, in the order given, capped. */
export const normalizeBulkTargets = (value) => [...new Set(list(value).map(clean).filter((id) => id && id.length <= 180))]
  .slice(0, BULK_MAX_TARGETS);

export const newBulkOperation = ({
  operationId, assignmentId, action, targetStudentIds = [], scope = null, requestedBy = null, now = Date.now(),
} = {}) => {
  const id = normalizeBulkOperationId(operationId);
  if (!id) throw new Error('A bulk operation needs an id of 8 to 80 letters, digits, dashes or underscores.');
  if (!BULK_ACTIONS.includes(clean(action))) throw new Error('Choose a supported class-wide action.');
  return {
    operationId: id,
    assignmentId: clean(assignmentId),
    action: clean(action),
    scope: isObject(scope) ? scope : { kind: 'students' },
    requestedBy: clean(requestedBy) || null,
    targetStudentIds: normalizeBulkTargets(targetStudentIds),
    results: {},
    status: BULK_STATUS.RUNNING,
    createdAt: Number(now),
    updatedAt: Number(now),
    completedAt: null,
  };
};

const normalizeResult = (raw) => {
  if (!isObject(raw) || !OUTCOMES.includes(clean(raw.outcome))) return null;
  return {
    outcome: clean(raw.outcome),
    detail: clean(raw.detail).slice(0, 300) || null,
    at: Number(raw.at) || null,
  };
};

const resultsOf = (operation) => {
  const results = {};
  Object.entries(isObject(operation?.results) ? operation.results : {}).forEach(([studentId, raw]) => {
    const result = normalizeResult(raw);
    if (result) results[clean(studentId)] = result;
  });
  return results;
};

/** The students this operation has not reached yet, in its own order. */
export const pendingBulkTargets = (operation) => {
  const results = resultsOf(operation);
  return normalizeBulkTargets(operation?.targetStudentIds).filter((studentId) => !results[studentId]);
};

export const bulkCounts = (operation) => {
  const results = resultsOf(operation);
  const targets = normalizeBulkTargets(operation?.targetStudentIds);
  const counts = { total: targets.length, succeeded: 0, alreadyComplete: 0, notEligible: 0, failed: 0, pending: 0 };
  targets.forEach((studentId) => {
    const outcome = results[studentId]?.outcome;
    if (outcome) counts[outcome] += 1;
    else counts.pending += 1;
  });
  return counts;
};

/** Finished means every target has an outcome; failures decide which finish. */
export const bulkStatus = (operation) => {
  const counts = bulkCounts(operation);
  if (counts.pending > 0) return BULK_STATUS.RUNNING;
  return counts.failed > 0 ? BULK_STATUS.COMPLETED_WITH_FAILURES : BULK_STATUS.COMPLETED;
};

/** One student's outcome, written once. A student with an outcome keeps it. */
export const withBulkResult = (operation, studentId, result, now = Date.now()) => {
  const id = clean(studentId);
  const normalized = normalizeResult({ ...result, at: now });
  if (!id || !normalized) return operation;
  const results = resultsOf(operation);
  if (results[id]) return operation;
  const next = { ...operation, results: { ...results, [id]: normalized }, updatedAt: Number(now) };
  const status = bulkStatus(next);
  return { ...next, status, completedAt: status === BULK_STATUS.RUNNING ? null : Number(now) };
};

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * What the teacher is told. The headline is the whole truth in one line; the
 * tone is `success` only when nobody failed and nobody is left.
 */
export const summarizeBulkOperation = (operation) => {
  const counts = bulkCounts(operation);
  const status = bulkStatus(operation);
  const label = BULK_ACTION_LABEL[clean(operation?.action)] || 'The action';
  const results = resultsOf(operation);
  const failures = normalizeBulkTargets(operation?.targetStudentIds)
    .filter((studentId) => results[studentId]?.outcome === BULK_OUTCOME.FAILED)
    .map((studentId) => ({ studentId, detail: results[studentId].detail || 'It did not go through.' }));
  const notEligible = normalizeBulkTargets(operation?.targetStudentIds)
    .filter((studentId) => results[studentId]?.outcome === BULK_OUTCOME.NOT_ELIGIBLE)
    .map((studentId) => ({ studentId, detail: results[studentId].detail || 'Not eligible.' }));

  const parts = [`${counts.succeeded} succeeded`];
  if (counts.alreadyComplete) parts.push(`${counts.alreadyComplete} already complete`);
  if (counts.notEligible) parts.push(`${counts.notEligible} not eligible`);
  parts.push(`${counts.failed} failed`);
  const tally = parts.join(', ');

  let headline;
  let tone;
  if (status === BULK_STATUS.RUNNING) {
    const done = counts.total - counts.pending;
    headline = `${label}: ${done} of ${plural(counts.total, 'student')} done so far (${tally}). ${counts.pending} still to do.`;
    tone = counts.failed > 0 ? 'error' : 'progress';
  } else if (counts.total === 0) {
    headline = `${label}: no students to change.`;
    tone = 'success';
  } else if (status === BULK_STATUS.COMPLETED_WITH_FAILURES) {
    headline = `${label} did not finish for everyone: ${tally}, of ${plural(counts.total, 'student')}.`;
    tone = 'error';
  } else {
    headline = `${label} finished for ${plural(counts.total, 'student')}: ${tally}.`;
    tone = 'success';
  }
  return { status, counts, headline, tone, failures, notEligible, finished: status !== BULK_STATUS.RUNNING };
};

/** The operation as a teacher's browser receives it. */
export const bulkOperationView = (operation) => {
  const results = resultsOf(operation);
  return {
    operationId: clean(operation?.operationId),
    assignmentId: clean(operation?.assignmentId),
    action: clean(operation?.action),
    actionLabel: BULK_ACTION_LABEL[clean(operation?.action)] || null,
    scope: isObject(operation?.scope) ? operation.scope : null,
    requestedBy: clean(operation?.requestedBy) || null,
    createdAt: Number(operation?.createdAt) || null,
    updatedAt: Number(operation?.updatedAt) || null,
    completedAt: Number(operation?.completedAt) || null,
    results: normalizeBulkTargets(operation?.targetStudentIds).map((studentId) => ({
      studentId,
      outcome: results[studentId]?.outcome || 'pending',
      detail: results[studentId]?.detail || null,
    })),
    ...summarizeBulkOperation(operation),
  };
};
