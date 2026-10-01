const ALGEBRAIC_METHODS = new Set(['substitution', 'elimination', 'studentChoice']);

const actionsFor = (question = {}) => (
  Array.isArray(question?.studentActions)
    ? question.studentActions.map((value) => String(value ?? '').trim()).filter(Boolean)
    : []
);

/**
 * Old V5 content can contain a Systems Workspace question whose renderer mode
 * was defaulted to "linear" even though the authored intent is algebraic.
 * Never let that storage defect downgrade substitution/elimination into the
 * graph-only linear workspace.
 */
export function resolveSystemsWorkspaceMode(question = {}) {
  const explicitMode = String(question?.mode || '').trim();
  const actions = actionsFor(question);
  const method = String(question?.method || '').trim();
  // #359: a three-plane spatial model authored without an explicit mode is a
  // real interactive 3D exploration, never the graph workspace's default
  // linear system, and never the algebraic solve workspace either — checked
  // first, because the plain-shape algebraic fallback below (equations +
  // variables, no method) would otherwise also match a spatial question that
  // was authored with a `variables` list.
  const spatialKind = String(question?.spatialModel?.kind || '').trim().toLowerCase();
  const isThreePlaneSpatialShape = spatialKind === 'threeplanes'
    && actions.includes('connectRepresentations')
    && Array.isArray(question?.equations);
  if (!explicitMode && isThreePlaneSpatialShape) return 'spatial';

  const hasAlgebraicIntent = actions.includes('solveSystem')
    && !actions.includes('graphSystem')
    && (
      ALGEBRAIC_METHODS.has(method)
      || Array.isArray(question?.equations)
      || Array.isArray(question?.equationsLatex)
      || question?.requireVerification === true
    );

  if (hasAlgebraicIntent) return 'algebraic';
  // The plain authored shape from #341 — equations as strings, plus variables
  // or a method, and no mode at all — is an algebraic system. Falling back to
  // 'linear' would show the student the graph workspace's DEFAULT system,
  // which is not the question they were assigned.
  const authoredAlgebraicShape = !explicitMode
    && !isThreePlaneSpatialShape
    && !actions.includes('graphSystem')
    && !question?.system
    && Array.isArray(question?.equations)
    && question.equations.length >= 2
    && question.equations.every((equation) => typeof equation === 'string')
    && (ALGEBRAIC_METHODS.has(method) || Array.isArray(question?.variables));
  if (authoredAlgebraicShape) return 'algebraic';
  return explicitMode || 'linear';
}
