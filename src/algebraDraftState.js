import { applyBalancedOperation } from './algebraAstEngine.js';
import { sanitizeStructureTool } from './algebraStructureTools.js';

// Increment this whenever the shape/meaning of a pending algebra move changes.
// Saved equations are durable; cancellation/simplification UI is derived and
// must not be allowed to survive a code update in an obsolete form.
export const ALGEBRA_DRAFT_VERSION = 2;

const cleanTransientState = (draft, equation) => ({
  ...draft,
  algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
  equation,
  operand: '',
  // The armed operation goes with the operand it was going to use. Keeping one
  // without the other would restore a student into a half-gesture.
  armedTile: null,
  pendingMove: null,
  crossedSides: [],
  cancelledPairIds: {},
  selectedCancellationIndices: {},
  simplificationAnswers: {},
  likeTermsOpen: false,
  likeTermsSide: '',
  selectedLikeTermIndices: [],
  likeTermsAnswer: '',
  // An open Factor / Split fraction / Cancel factors / … tool is a run of
  // undecided choices, like a pending move: it goes. The work-step log is
  // committed history and stays.
  structureTool: null,
});

const MAX_WORK_STEPS = 80;

// The committed work-step log is displayed as the student's history, so only
// well-formed entries (two sides before and after, a description) come back.
const sanitizeWorkSteps = (steps) => (Array.isArray(steps) ? steps : [])
  .filter((step) => step && typeof step === 'object'
    && step.before?.left != null && step.before?.right != null
    && step.after?.left != null && step.after?.right != null
    && typeof step.description === 'string')
  .slice(-MAX_WORK_STEPS);

export const rehydrateAlgebraDraft = ({ draft, initialEquation }) => {
  if (!draft) return null;
  const equation = draft.equation || initialEquation;
  if (!equation?.left || !equation?.right) return null;

  // Legacy drafts were allowed to persist the entire pendingMove object. That
  // object contains simplificationTargets produced by the engine version that
  // created it. Clear that transient step once when upgrading; the student's
  // last committed equation is preserved.
  if (Number(draft.algebraDraftVersion) !== ALGEBRA_DRAFT_VERSION) {
    return { ...cleanTransientState(draft, equation), workSteps: sanitizeWorkSteps(draft.workSteps) };
  }

  // A structure tool is kept only while it is still about this exact equation.
  const structureTool = sanitizeStructureTool(draft.structureTool, equation);
  const workSteps = sanitizeWorkSteps(draft.workSteps);

  if (!draft.pendingMove) return { ...draft, equation, structureTool, workSteps };

  // Even within the same draft version, recompute the pending move from the
  // committed equation + operation rather than trusting serialized derived
  // fields. This keeps renderer state in sync with the current engine.
  const operation = draft.pendingMove.operation;
  const operand = draft.pendingMove.operandExpression ?? draft.pendingMove.operand;
  if (!operation || !String(operand ?? '').trim()) return { ...cleanTransientState(draft, equation), workSteps };

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
      structureTool: null,
      workSteps,
    };
  } catch {
    return { ...cleanTransientState(draft, equation), workSteps };
  }
};

export { sanitizeWorkSteps, MAX_WORK_STEPS };
