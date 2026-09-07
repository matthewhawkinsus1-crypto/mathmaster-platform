export const AUTHORING_STATES = Object.freeze({
  INCOMPLETE: 'incomplete',
  NEEDS_REVIEW: 'needsReview',
  READY: 'ready',
  PUBLISHED: 'published',
});

const BLOCKING_SEVERITIES = new Set(['blocking', 'error']);
const RESOLVED_FLAG_STATUSES = new Set(['fixed', 'resolved', 'dismissed', 'closed']);
const NORMAL_LIBRARY_STATES = new Set([AUTHORING_STATES.READY, AUTHORING_STATES.PUBLISHED]);

const normalizedSeverity = (value) => String(value || '').trim().toLowerCase();
const normalizedStatus = (value) => String(value || 'open').trim().toLowerCase();

export const teacherFlagNeedsReview = (flag) => {
  if (!flag || typeof flag !== 'object') return false;
  return !RESOLVED_FLAG_STATUSES.has(normalizedStatus(flag.status));
};

/**
 * A failed intake result is salvageable only when MathMaster successfully
 * parsed a current Assignment V5 and the remaining failures are downstream
 * validation/review findings. Malformed JSON, raw arrays, and unsupported
 * schema versions never cross this boundary.
 */
export const canSalvageV5IntakeResult = (result) => (
  result?.ok === false
  && Number(result?.sourceSchemaVersion) === 5
  && Number(result?.parsed?.assignmentV5?.schemaVersion) === 5
);

/**
 * The normal Assignment Library should contain work that is ready to reuse or
 * already published. Explicit incomplete/needs-review drafts belong in the
 * repair workflow instead. Assignments created before authoringState existed
 * remain visible for backward compatibility until they are reviewed/migrated.
 */
export const isAssignmentEligibleForNormalLibrary = (assignment = {}) => {
  const explicitState = assignment?.authoringState || assignment?.authoringReview?.state || null;
  if (!explicitState) return true;
  return NORMAL_LIBRARY_STATES.has(explicitState);
};

/**
 * Authoring/review readiness is deliberately independent from the assignment
 * deadline lifecycle. A lesson can be closed for students and still be a
 * perfectly healthy reusable library item; likewise a future assignment can
 * be incomplete and require repair before it is publishable.
 */
export const deriveAssignmentAuthoringState = ({
  diagnostics = [],
  teacherFlags = [],
  published = false,
} = {}) => {
  const safeDiagnostics = Array.isArray(diagnostics) ? diagnostics : [];
  const safeFlags = Array.isArray(teacherFlags) ? teacherFlags : [];

  if (safeDiagnostics.some((entry) => BLOCKING_SEVERITIES.has(normalizedSeverity(entry?.severity)))) {
    return AUTHORING_STATES.INCOMPLETE;
  }

  if (
    safeDiagnostics.some((entry) => normalizedSeverity(entry?.severity) === 'warning')
    || safeFlags.some(teacherFlagNeedsReview)
  ) {
    return AUTHORING_STATES.NEEDS_REVIEW;
  }

  return published === true ? AUTHORING_STATES.PUBLISHED : AUTHORING_STATES.READY;
};

export const authoringStateLabel = (state) => ({
  [AUTHORING_STATES.INCOMPLETE]: 'Incomplete — Needs Repair',
  [AUTHORING_STATES.NEEDS_REVIEW]: 'Needs Review',
  [AUTHORING_STATES.READY]: 'Ready',
  [AUTHORING_STATES.PUBLISHED]: 'Published',
}[state] || 'Needs Review');

export default deriveAssignmentAuthoringState;
