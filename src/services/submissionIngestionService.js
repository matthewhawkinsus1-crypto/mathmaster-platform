/*
 * DELIVERING A CAPTURED SUBMISSION TO THE SERVER.
 *
 * The student's Submit is already durable in IndexedDB before this runs, and
 * the student is already working on the next question. This is the background
 * courier, and its one job is to come back with a RECEIPT — a server-issued
 * answer that says what became of the submission — so the outbox knows whether
 * the queue row may be retired.
 *
 * Nothing here decides anything. Every judgement (was the section open when
 * this was captured, has a newer attempt superseded it, is this a duplicate)
 * belongs to the server, which re-reads the authoritative assignment and roster
 * and re-grades the raw response wherever it can. A transport failure is a
 * retry, never a verdict.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { measurePerformanceOperation } from '../platform/performance/performanceTelemetry.js';
import { summarizeDurableOutbox } from '../platform/performance/durableActionOutbox.js';
import { nextDeviceReportGeneration } from '../platform/persistence/deviceIdentity.js';
import {
  MAX_ENVELOPES_PER_CALL,
  SUBMISSION_DISPOSITION,
  normalizeSubmissionEnvelope,
} from '../../functions/shared/submissionIngestion.mjs';

export { MAX_ENVELOPES_PER_CALL };

/*
 * HOW LONG THE COURIER MAY BE AWAY.
 *
 * Shorter than the outbox's own reconcile bound, so a slow callable surfaces as
 * "still saving" on the next retry rather than as a stalled drain.
 */
export const INGEST_TIMEOUT_MS = 12_000;

const withTimeout = (promise, timeoutMs) => {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => { if (timer) clearTimeout(timer); }),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('The server did not answer in time.');
        error.code = 'functions/deadline-exceeded';
        reject(error);
      }, timeoutMs);
    }),
  ]);
};

/**
 * Send one batch of envelopes and return the receipts, keyed by action id.
 *
 * Throws only on transport failure, which the caller must treat as retryable:
 * a submission that could not be delivered is still owed a delivery.
 */
export const ingestStudentSubmissions = async (envelopes, { timeoutMs = INGEST_TIMEOUT_MS } = {}) => {
  const submissions = (Array.isArray(envelopes) ? envelopes : [])
    .map(normalizeSubmissionEnvelope)
    .filter(Boolean)
    .slice(0, MAX_ENVELOPES_PER_CALL);
  if (!submissions.length) return new Map();

  const response = await measurePerformanceOperation(
    'callable_request_ms',
    () => withTimeout(httpsCallable(functions, 'ingestStudentSubmissions')({ submissions }), timeoutMs),
    { flow: 'ingestStudentSubmissions' },
  );
  const receipts = Array.isArray(response?.data?.receipts) ? response.data.receipts : [];
  return new Map(receipts.filter((receipt) => receipt?.actionId).map((receipt) => [String(receipt.actionId), receipt]));
};

/** Deliver exactly one envelope, answering with its disposition. */
export const ingestOneSubmission = async (envelope, options) => {
  const receipts = await ingestStudentSubmissions([envelope], options);
  const receipt = receipts.get(String(envelope?.actionId || ''));
  if (!receipt) {
    // The call succeeded and said nothing about this submission. That is not
    // permission to throw the student's work away.
    return { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'no-receipt-issued' };
  }
  return receipt;
};

export { SUBMISSION_DISPOSITION };

const SAFE_FIREBASE_CODES = new Set([
  'cancelled', 'deadline-exceeded', 'internal', 'permission-denied',
  'resource-exhausted', 'unauthenticated', 'unavailable', 'unknown',
]);

/** Reduce a callable failure to operational metadata; never retain its message/details. */
export const callableDeliveryDiagnostic = (error, transport = 'callable') => {
  const rawCode = String(error?.code || '').replace(/^functions\//, '').toLowerCase();
  const firebaseCode = SAFE_FIREBASE_CODES.has(rawCode) ? rawCode : 'unknown';
  return Object.freeze({
    transport,
    firebaseCode,
    safeReason: `callable-${firebaseCode}`,
  });
};

/*
 * THIS DEVICE'S OWN INCIDENT REPORT.
 *
 * A queue in IndexedDB is invisible to every server query, so after a drain has
 * done what it can, the device says what it is still holding and why. That is
 * what makes "work exists but has not arrived" visible to a teacher instead of
 * looking identical to "the student did nothing".
 *
 * Counts and blocked-reason labels only. No responses, no attempt records,
 * nothing that could become a grade — the report is diagnostics, and a
 * diagnostic that carried academic data would be a second grading store.
 *
 * WHO is reporting and WHICH report is newer both come from
 * `deviceIdentity.js`, which keeps them beside the queue they describe. The
 * generation is stamped at CAPTURE, in the same step that reads the summary,
 * because what the server has to order is when the queue was observed — not
 * when the request happened to arrive. `withTimeout` below stops waiting; it
 * cannot cancel a callable already on the wire, so a slow positive report can
 * and does arrive after the zero report that replaced it.
 */
export { resolveDeviceId } from '../platform/persistence/deviceIdentity.js';

export const reportDeviceQueueState = async ({ studentId, summary = null, timeoutMs = INGEST_TIMEOUT_MS } = {}) => {
  if (!studentId) return null;
  const [payload, { deviceId, generation }] = await Promise.all([
    summary || summarizeDurableOutbox({ studentId }),
    nextDeviceReportGeneration(),
  ]);
  const response = await withTimeout(
    httpsCallable(functions, 'reportStudentDeviceQueue')({
      deviceId,
      reportGeneration: generation,
      summary: payload,
    }),
    timeoutMs,
  );
  return response?.data || null;
};

/*
 * ASK THE SERVER TO RE-DERIVE CLASSWORK COMPLETION FROM CANONICAL ATTEMPTS.
 *
 * The browser no longer authors `classworkGradesByAssignment`. It cannot: the
 * only tracker it has is the local overlay, which contains attempts that are
 * still queued on this device and have never reached canonical grades, so a
 * completion computed here could mark a student Classwork-complete on evidence
 * the gradebook cannot see.
 *
 * Ingestion already re-derives the projection whenever an attempt lands. This
 * covers the one case it cannot: the completion rule also counts engagement
 * minutes, so the threshold can be crossed by TIME after the last response was
 * already ingested. The call carries an assignment id and nothing else — no
 * completion, no score, no tracker. The server reads the canonical document and
 * decides.
 *
 * It is a background reconciliation. Nothing a student does waits for it.
 */
export const reconcileAssignmentActivityProjection = async ({ assignmentId, timeoutMs = INGEST_TIMEOUT_MS } = {}) => {
  if (!assignmentId) return null;
  const response = await withTimeout(
    httpsCallable(functions, 'reconcileAssignmentActivityProjection')({ assignmentId }),
    timeoutMs,
  );
  return response?.data || null;
};
