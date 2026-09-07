export const AUTHORING_STATES = Object.freeze({
  INCOMPLETE: 'incomplete',
  NEEDS_REVIEW: 'needsReview',
  READY: 'ready',
  PUBLISHED: 'published',
});

const BLOCKING_SEVERITIES = new Set(['blocking', 'error']);
const RESOLVED_FLAG_STATUSES = new Set(['fixed', 'resolved', 'dismissed', 'closed']);

const normalizedSeverity = (value) => String(value || '').trim().toLowerCase();
const normalizedStatus = (value) => String(value || 'open').trim().toLowerCase();

export const teacherFlagNeedsReview = (flag) => {
  if (!flag || typeof flag !== 'object') return false;
  return !RESOLVED_FLAG_STATUSES.has(normalizedStatus(flag.status));
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
