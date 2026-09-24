/*
 * STEP ALGEBRA'S STRUCTURE TOOLS, AS ONE SLOT.
 *
 * Factor, Split fraction, Cancel factors, Simplify arithmetic and Arrange terms
 * are contextual: each is offered only when the committed equation has the
 * structure it acts on, detected from the MathJS tree rather than from any
 * assignment's numbers. At most one is open at a time, and whichever it is
 * lives in one plain-JSON slot that the question draft persists and Universal
 * Undo walks back one decision at a time.
 */
import { detectFactorableLists, FACTOR_TOOL, openFactoring, commitFactoring } from './algebraFactoringModel.js';
import { detectSplittableFractions, SPLIT_TOOL, openFractionSplit, commitFractionSplit } from './algebraFractionSplitModel.js';
import { detectReducibleFractions, REDUCE_TOOL, openFractionReduction, commitFractionReduction } from './algebraFractionReductionModel.js';
import { detectArithmeticProducts, ARITHMETIC_TOOL, openArithmetic, commitArithmetic } from './algebraArithmeticModel.js';
import { arrangeableSides, ARRANGE_TOOL, openArrangeTerms, commitArrangement } from './algebraArrangeTermsModel.js';
import { equationKey, undoTransient } from './algebraStructureToolState.js';

export const STRUCTURE_TOOL_KINDS = [FACTOR_TOOL, SPLIT_TOOL, REDUCE_TOOL, ARITHMETIC_TOOL, ARRANGE_TOOL];

export const STRUCTURE_TOOL_LABELS = {
  [FACTOR_TOOL]: 'Factor',
  [SPLIT_TOOL]: 'Split fraction',
  [REDUCE_TOOL]: 'Cancel factors',
  [ARITHMETIC_TOOL]: 'Simplify arithmetic',
  [ARRANGE_TOOL]: 'Arrange terms',
};

/**
 * Only a line objective (y = a(x - c)) needs a sign-only factor offered, as in
 * 6(-x + 2) -> 6(-1(x - 2)). Everywhere else Factor appears only for a real
 * common factor, so ordinary solving is not crowded with it.
 */
export const factoringOptionsFor = (equation) => ({
  allowSignOnly: equation?.objective?.kind === 'factoredLinear',
});

/** Which structure tools the committed equation offers, and on what. */
export const detectStructureTools = (equation, { excludeSides = [] } = {}) => {
  if (!equation?.left || !equation?.right) {
    return { [FACTOR_TOOL]: [], [SPLIT_TOOL]: [], [REDUCE_TOOL]: [], [ARITHMETIC_TOOL]: [], [ARRANGE_TOOL]: [] };
  }
  const keep = (entries) => entries.filter((entry) => !excludeSides.includes(entry.side ?? entry));
  return {
    [FACTOR_TOOL]: keep(detectFactorableLists(equation, factoringOptionsFor(equation))),
    [SPLIT_TOOL]: keep(detectSplittableFractions(equation)),
    [REDUCE_TOOL]: keep(detectReducibleFractions(equation)),
    [ARITHMETIC_TOOL]: keep(detectArithmeticProducts(equation)),
    [ARRANGE_TOOL]: keep(arrangeableSides(equation)),
  };
};

export const openStructureTool = (kind, equation) => {
  if (kind === FACTOR_TOOL) return openFactoring(equation);
  if (kind === SPLIT_TOOL) return openFractionSplit(equation);
  if (kind === REDUCE_TOOL) return openFractionReduction(equation);
  if (kind === ARITHMETIC_TOOL) return openArithmetic(equation);
  if (kind === ARRANGE_TOOL) return openArrangeTerms(equation);
  return null;
};

export const commitStructureTool = (tool, equation) => {
  if (!tool || !equation) return { ok: false, reason: 'closed' };
  if (tool.equationKey !== equationKey(equation)) return { ok: false, reason: 'stale' };
  if (tool.kind === FACTOR_TOOL) return commitFactoring(equation, tool, factoringOptionsFor(equation));
  if (tool.kind === SPLIT_TOOL) return commitFractionSplit(equation, tool);
  if (tool.kind === REDUCE_TOOL) return commitFractionReduction(equation, tool);
  if (tool.kind === ARITHMETIC_TOOL) return commitArithmetic(equation, tool);
  if (tool.kind === ARRANGE_TOOL) return commitArrangement(equation, tool);
  return { ok: false, reason: 'unknown' };
};

/** One Undo step inside the open tool; null when the tool itself closes. */
export const undoStructureTool = (tool) => undoTransient(tool);

/**
 * A restored draft's tool, only if it is still about THIS equation and is a
 * tool this build knows. Anything else is dropped: never replay decisions
 * against different mathematics.
 */
export const sanitizeStructureTool = (tool, equation) => {
  if (!tool || typeof tool !== 'object' || !STRUCTURE_TOOL_KINDS.includes(tool.kind)) return null;
  if (!equation || tool.equationKey !== equationKey(equation)) return null;
  return { ...tool, undoStack: Array.isArray(tool.undoStack) ? tool.undoStack : [] };
};
