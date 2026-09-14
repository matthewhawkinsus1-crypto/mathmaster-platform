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
      timer = setTimeout(() => reject(new Error('The server did not answer in time.')), timeoutMs);
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
