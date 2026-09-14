// How a Path release reads to a human.
//
// Deliberately free of `firebase/*` imports: the phase names and the shape of a
// failure message are decisions worth testing directly, and a module that
// reaches for the Firebase SDK can only be checked as source text.

export const RELEASE_PHASE_MESSAGES = Object.freeze({
  created: 'Certified release detected',
  validating: 'Comparing with production',
  staging: 'Staging',
  activating: 'Activating',
  coverage: 'Rebuilding coverage',
  verifying: 'Verifying',
  complete: 'Complete',
  failed: 'Failed',
});

/**
 * A release failure as one line, with everything an administrator can act on.
 *
 * Phase, question, family, property path and diagnostic id — the fields that
 * make the difference between "something went wrong" and "this document, this
 * property, this fix".
 */
export const describeReleaseDiagnostic = (diagnostic) => {
  if (!diagnostic) return null;
  const where = [
    diagnostic.phase ? `phase ${diagnostic.phase}` : null,
    diagnostic.questionId ? `question ${diagnostic.questionId}` : null,
    diagnostic.familyId ? `family ${diagnostic.familyId}` : null,
    diagnostic.propertyPath ? `at ${diagnostic.propertyPath}` : null,
    diagnostic.diagnosticId ? `diagnostic ${diagnostic.diagnosticId}` : null,
  ].filter(Boolean).join(' · ');
  return {
    headline: diagnostic.message || 'The Path release failed.',
    where,
    code: diagnostic.code || null,
    recoverable: Boolean(diagnostic.recoverable),
    nextAction: diagnostic.nextAction || null,
  };
};

/** The change plan in the four categories the release reports. */
export const describeReleaseCounts = (counts) => {
  if (!counts) return null;
  return `${counts.added ?? 0} added · ${counts.changed ?? 0} changed · ${counts.unchanged ?? 0} unchanged · ${counts.removed ?? 0} superseded`;
};

export default describeReleaseDiagnostic;
