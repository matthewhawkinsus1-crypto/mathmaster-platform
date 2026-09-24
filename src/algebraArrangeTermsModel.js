/*
 * ARRANGING TERMS: 3 - (5/2)x -> -(5/2)x + 3.
 *
 * Reordering is always equivalent — each term keeps its own sign — so the
 * platform does not need to judge it, only to let the student do it: tap one
 * term, tap another, and the two change places. Nothing is committed until
 * the student keeps the new order, and each swap is one Undo step.
 */
import { splitAdditiveTerms } from './algebraAstEngine.js';
import {
  equationKey,
  pushTransient,
  rebuildSideSafely,
  sideItems,
} from './algebraStructureToolState.js';

export const ARRANGE_TOOL = 'arrange';

export const arrangeableSides = (equation) => ['left', 'right']
  .filter((side) => (splitAdditiveTerms(equation?.[side]) || []).length >= 2);

export const openArrangeTerms = (equation) => {
  const sides = arrangeableSides(equation);
  return {
    kind: ARRANGE_TOOL,
    equationKey: equationKey(equation),
    side: sides.length === 1 ? sides[0] : null,
    order: sides.length === 1 ? (splitAdditiveTerms(equation[sides[0]]) || []).map((_, index) => index) : [],
    selected: null,
    undoStack: [],
    lastActionKey: null,
  };
};

/** Tap a term at `position` in the current (rearranged) order. */
export const tapArrangeTerm = (state, equation, side, position) => {
  const count = (splitAdditiveTerms(equation?.[side]) || []).length;
  if (!state || count < 2 || position < 0 || position >= count) return state;
  if (state.side !== side) {
    return pushTransient(state, { ...state, side, order: Array.from({ length: count }, (_, index) => index), selected: position });
  }
  if (state.selected == null) return pushTransient(state, { ...state, selected: position });
  if (state.selected === position) return pushTransient(state, { ...state, selected: null });
  const order = [...state.order];
  [order[state.selected], order[position]] = [order[position], order[state.selected]];
  return pushTransient(state, { ...state, order, selected: null });
};

export const arrangementChanged = (state) => Boolean(
  state?.order?.length && state.order.some((termIndex, position) => termIndex !== position),
);

/** The side's terms in the student's order, as the engine's term descriptors. */
export const arrangedTerms = (state, equation) => {
  const terms = splitAdditiveTerms(equation?.[state?.side]) || [];
  if (!state?.order?.length || state.order.length !== terms.length) return terms;
  return state.order.map((termIndex) => terms[termIndex]);
};

export const commitArrangement = (equation, state) => {
  if (!state?.side || !arrangementChanged(state)) return { ok: false, reason: 'unchanged' };
  const items = sideItems(equation[state.side]);
  if (items.length !== state.order.length) return { ok: false, reason: 'stale' };
  const nextSide = rebuildSideSafely(equation[state.side], state.order.map((index) => items[index]), equation.variable || 'x');
  if (!nextSide) return { ok: false, reason: 'notEquivalent' };
  return {
    ok: true,
    equation: { ...equation, [state.side]: nextSide },
    step: {
      kind: 'arrange-terms',
      description: `Rearranged the terms on the ${state.side} side`,
      parts: [`Rearranged the terms on the ${state.side} side`],
    },
  };
};
