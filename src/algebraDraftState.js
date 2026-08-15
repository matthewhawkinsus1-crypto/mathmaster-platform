import { applyBalancedOperation } from './algebraAstEngine.js';

// Increment this whenever the shape/meaning of a pending algebra move changes.
// Saved equations are durable; cancellation/simplification UI is derived and
// must not be allowed to survive a code update in an obsolete form.
export const ALGEBRA_DRAFT_VERSION = 2;

const cleanTransientState = (draft, equation) => ({
  ...draft,
  algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
  equation,
  operand: '',
  pendingMove: null,
  crossedSides: [],
  cancelledPairIds: {},
  selectedCancellationIndices: {},
  simplificationAnswers: {},
});

export const rehydrateAlgebraDraft = ({ draft, initialEquation }) => {
  if (!draft) return null;
  const equation = draft.equation || initialEquation;
  if (!equation?.left || !equation?.right) return null;

  // Legacy drafts were allowed to persist the entire pendingMove object. That
  // object contains simplificationTargets produced by the engine version that
  // created it. Clear that transient step once when upgrading; the student's
  // last committed equation is preserved.
  if (Number(draft.algebraDraftVersion) !== ALGEBRA_DRAFT_VERSION) {
    return cleanTransientState(draft, equation);
  }

  if (!draft.pendingMove) return { ...draft, equation };

  // Even within the same draft version, recompute the pending move from the
  // committed equation + operation rather than trusting serialized derived
  // fields. This keeps renderer state in sync with the current engine.
  const operation = draft.pendingMove.operation;
  const operand = draft.pendingMove.operandExpression ?? draft.pendingMove.operand;
  if (!operation || !String(operand ?? '').trim()) return cleanTransientState(draft, equation);

  try {
    const pendingMove = applyBalancedOperation({
      equationState: equation,
      operation,
      operand: String(operand),
    });

    // Cancellation token IDs are renderer-derived, so restart only the visual
    // crossing state after refresh. Preserve simplification answers only for
    // sides that the recomputed engine still says genuinely need work.
    const validSimplificationSides = new Set(
      (pendingMove.simplificationTargets || []).map((target) => target.side),
    );
    const simplificationAnswers = Object.fromEntries(
      Object.entries(draft.simplificationAnswers || {})
        .filter(([side]) => validSimplificationSides.has(side)),
    );

    return {
      ...draft,
      algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
      equation,
      pendingMove,
      crossedSides: [],
      cancelledPairIds: {},
      selectedCancellationIndices: {},
      simplificationAnswers,
    };
  } catch {
    return cleanTransientState(draft, equation);
  }
};
