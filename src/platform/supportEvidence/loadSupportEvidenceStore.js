/*
 * THE SUPPORT-EVIDENCE STORE, LOADED WHEN A STUDENT'S WORK FIRST WRITES TO IT.
 *
 * A student writes two kinds of evidence: the supports they were offered and
 * used (App.jsx's recordStudentSupportEvidence) and engaged minutes
 * (./useEngagementLedger.js). Both happen inside an assignment, never on Home,
 * so the store, and the teacher's support-record reads it also holds, are not
 * in a student's first load (scripts/check-first-load-budget.mjs). After the
 * first write the module is cached and every later write runs at once.
 *
 * A failed load is said here, once per failed write, and then rejects: each
 * caller already drops a failed write and lets its next one try again, because
 * evidence telemetry must never interrupt a student's work.
 */
export const loadSupportEvidenceStore = () => import('./supportEvidenceStore.js').catch((error) => {
  console.error('Support evidence could not load; this record will be tried again:', error);
  throw error;
});
