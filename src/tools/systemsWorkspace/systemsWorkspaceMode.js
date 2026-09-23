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
  const hasAlgebraicIntent = actions.includes('solveSystem')
    && !actions.includes('graphSystem')
    && (
      ALGEBRAIC_METHODS.has(method)
      || Array.isArray(question?.equations)
      || Array.isArray(question?.equationsLatex)
      || question?.requireVerification === true
    );

  if (hasAlgebraicIntent) return 'algebraic';
  return explicitMode || 'linear';
}
