/*
 * THE FOUR ANSWERS TO "WHO DECIDES WHETHER THIS IS CORRECT?"
 *
 * Every grade-bearing MathMaster surface — question type, registry tool, and
 * each tool mode — must declare exactly one of these in the grading manifest
 * (gradingManifest.mjs). tests/platform/serverGradingCoverageGate.test.mjs
 * fails if a new surface appears without a declaration, so no future tool can
 * silently inherit client-authoritative grading.
 */
export const GRADING_AUTHORITY = Object.freeze({
  // A pure shared grader marks the student's raw work, in the browser for
  // feedback and on the server as the authority. The browser verdict is
  // never trusted where this applies.
  SHARED_SERVER: 'shared-server-authoritative',
  // Graded authoritatively by a dedicated server subsystem with its own state
  // machine (Secure Test Cycle, My Math Path, the Modeling Lab evaluator).
  SPECIALIZED_SUBSYSTEM: 'specialized-server-subsystem',
  // Still graded on the student's device. Allowed ONLY with a documented,
  // specific technical blocker; ingestion sanitizes and bounds the record.
  CLIENT_GRADED: 'client-graded-documented-blocker',
  // Produces no academic result (read-only review, instructional display).
  NON_GRADED: 'non-graded-read-only',
});

export const GRADING_AUTHORITY_VALUES = Object.freeze(Object.values(GRADING_AUTHORITY));
