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

/*
 * A PENDING MOVE IS STORED AS WHAT THE STUDENT DID, NOT AS WHAT THE ENGINE MADE.
 *
 * The engine's move is almost all derived: both sides before and after
 * simplifying, the cancellation and simplification targets, and an analysis of
 * the equation before and after the move that includes its `solution`. The
 * draft used to hold all of it, which put the solved value in a record the
 * student can read — and the server backup refuses any record carrying
 * `solution` (functions/shared/workspaceDraftSchema.mjs), so a draft with a
 * move in progress never left the device, with a console error on every write.
 *
 * What the student did is three things: the operation, its operand, and where
 * on each side they placed it. That is all the draft keeps; makePendingMove
 * rebuilds the rest with the current engine. The placement is kept because it
 * changes the move: −5 placed beside +5 is a different line from −5 appended
 * at the end, and a restore that dropped it brought back a different move.
 *
 * Drafts written before this kept the whole move; they restore through the
 * same operation + operand, so ALGEBRA_DRAFT_VERSION does not change.
 */
const PENDING_MOVE_SIDES = ['left', 'right'];

// The placement shapes the workspace produces: a term-relative position
// { kind, termIndex } from a drop or tap on an additive side, or a short word
// ('side', 'below', 'before', 'after') where the engine only needs the side.
const pendingMoveSidePlacement = (placement) => {
  if (typeof placement === 'string') return placement && placement.length <= 24 ? placement : null;
  if (!placement || typeof placement !== 'object' || Array.isArray(placement)) return null;
  const termIndex = Number(placement.termIndex);
  if (typeof placement.kind !== 'string' || !placement.kind || placement.kind.length > 24) return null;
  if (!Number.isInteger(termIndex) || termIndex < 0) return null;
  return { kind: placement.kind, termIndex };
};

export const pendingMovePlacement = (placementBySide) => Object.fromEntries(
  PENDING_MOVE_SIDES
    .map((side) => [side, pendingMoveSidePlacement(placementBySide?.[side])])
    .filter(([, placement]) => placement !== null),
);

/**
 * The one way a pending balance move is made — when the student places it and
 * when a draft restores it — so the move that comes back is the move that was
 * made. Throws what applyBalancedOperation throws.
 */
export const makePendingMove = ({ equation, operation, operand, placementBySide = null }) => {
  const placement = pendingMovePlacement(placementBySide);
  return {
    ...applyBalancedOperation({ equationState: equation, operation, operand: String(operand), placementBySide: placement }),
    placementBySide: placement,
  };
};

/** What the draft keeps of a pending move: only what is needed to make it again. */
export const pendingMoveDraft = (move) => {
  if (!move || typeof move !== 'object' || !move.operation) return null;
  const operandExpression = move.operandExpression ?? move.operand;
  if (!String(operandExpression ?? '').trim()) return null;
  const placementBySide = pendingMovePlacement(move.placementBySide);
  return {
    operation: String(move.operation),
    operandExpression: String(operandExpression),
    ...(Object.keys(placementBySide).length ? { placementBySide } : {}),
  };
};

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
  // committed equation + operation + placement rather than trusting serialized
  // derived fields (an older draft still carries them; they are ignored). This
  // keeps renderer state in sync with the current engine.
  const operation = draft.pendingMove.operation;
  const operand = draft.pendingMove.operandExpression ?? draft.pendingMove.operand;
  if (!operation || !String(operand ?? '').trim()) return { ...cleanTransientState(draft, equation), workSteps };

  try {
    const pendingMove = makePendingMove({
      equation,
      operation,
      operand,
      placementBySide: draft.pendingMove.placementBySide,
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
