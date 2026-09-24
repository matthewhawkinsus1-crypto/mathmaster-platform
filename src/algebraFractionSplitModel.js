/*
 * SPLITTING A FRACTION WHOSE NUMERATOR IS A SUM.
 *
 * (6 - 5x)/2 = 6/2 - 5x/2 is division distributing over addition — the same
 * shape of move as distribution, so it is performed the same way: the student
 * picks up the denominator and places a copy under each numerator term. The
 * committed result is exactly what they built, left unreduced (6/2 stays 6/2
 * until the student cancels it) and kept as exact stacked fractions.
 *
 * Offered only where it is valid: a numerator with at least two terms over a
 * nonzero NUMERIC denominator (an integer, a negative, or an exact fraction).
 * A sum in the denominator, 6/(2 + x), cannot be split and is never offered;
 * nor is a variable denominator, which would change where the expression is
 * defined.
 */
import { parse } from 'mathjs';
import { expressionToLatex, splitAdditiveTerms } from './algebraAstEngine.js';
import { exactRationalFromNode } from './algebraExactRational.js';
import {
  equationKey,
  pushTransient,
  rebuildSideSafely,
  serializeItems,
  sideItems,
} from './algebraStructureToolState.js';

export const SPLIT_TOOL = 'split';

const unwrap = (node) => {
  let current = node;
  while (current?.type === 'ParenthesisNode') current = current.content;
  return current;
};

const hasSymbols = (node) => node.filter((child) => child.isSymbolNode && !['e', 'pi'].includes(child.name)).length > 0;

/** The fraction a term is, if it is a splittable one: { numeratorTerms, denominatorText, ... }. */
export const splittableFraction = (termMagnitudeText) => {
  try {
    const node = unwrap(parse(String(termMagnitudeText)));
    if (node?.type !== 'OperatorNode' || node.fn !== 'divide' || node.args?.length !== 2) return null;
    const numeratorNode = unwrap(node.args[0]);
    const denominatorNode = unwrap(node.args[1]);
    if (!numeratorNode || !denominatorNode || hasSymbols(denominatorNode)) return null;
    const denominatorValue = exactRationalFromNode(denominatorNode);
    if (!denominatorValue || denominatorValue.n === 0) return null;
    const numeratorText = numeratorNode.toString({ parenthesis: 'keep', implicit: 'hide' });
    const numeratorTerms = splitAdditiveTerms(numeratorText) || [];
    if (numeratorTerms.length < 2) return null;
    const denominatorText = denominatorNode.toString({ parenthesis: 'keep', implicit: 'hide' });
    return {
      numeratorTerms: numeratorTerms.map((term) => ({
        sign: term.sign < 0 ? -1 : 1,
        text: term.text,
        latex: term.latex,
        magnitudeText: term.magnitudeText,
        magnitudeLatex: term.magnitudeLatex,
      })),
      denominatorText,
      denominatorLatex: expressionToLatex(denominatorText),
      denominatorValue,
    };
  } catch {
    return null;
  }
};

export const detectSplittableFractions = (equation) => {
  if (!equation) return [];
  const found = [];
  ['left', 'right'].forEach((side) => {
    (splitAdditiveTerms(equation[side]) || []).forEach((term, sideTermIndex) => {
      const fraction = splittableFraction(term.magnitudeText);
      if (fraction) found.push({ id: `${side}:${sideTermIndex}`, side, sideTermIndex, termSign: term.sign < 0 ? -1 : 1, ...fraction });
    });
  });
  return found;
};

export const findSplittableFraction = (equation, candidateId) => (
  detectSplittableFractions(equation).find((candidate) => candidate.id === candidateId) || null
);

export const openFractionSplit = (equation) => {
  const candidates = detectSplittableFractions(equation);
  return {
    kind: SPLIT_TOOL,
    equationKey: equationKey(equation),
    // One fraction: it is the only thing to work on. Several: the student picks.
    candidateId: candidates.length === 1 ? candidates[0].id : null,
    armed: false,
    placed: [],
    undoStack: [],
    lastActionKey: null,
  };
};

export const chooseSplitFraction = (state, equation, candidateId) => {
  if (!state || !findSplittableFraction(equation, candidateId) || state.candidateId === candidateId) return state;
  return pushTransient(state, { ...state, candidateId, armed: false, placed: [] });
};

export const isSplitComplete = (state, candidate) => Boolean(
  state && candidate && state.placed.length === candidate.numeratorTerms.length,
);

export const armSplitDenominator = (state, equation) => {
  const candidate = findSplittableFraction(equation, state?.candidateId);
  if (!state || !candidate || state.armed || isSplitComplete(state, candidate)) return state;
  return pushTransient(state, { ...state, armed: true });
};

export const placeSplitDenominator = (state, equation, termIndex) => {
  const candidate = findSplittableFraction(equation, state?.candidateId);
  if (!state || !candidate || !state.armed) return state;
  if (termIndex < 0 || termIndex >= candidate.numeratorTerms.length || state.placed.includes(termIndex)) return state;
  const placed = [...state.placed, termIndex];
  return pushTransient(state, { ...state, placed, armed: placed.length < candidate.numeratorTerms.length });
};

const groupedDenominator = (candidate) => {
  const text = String(candidate.denominatorText).trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? text : `(${text})`;
};

const numeratorMagnitude = (magnitude) => {
  try {
    const node = unwrap(parse(String(magnitude)));
    const simple = node.type === 'ConstantNode' || node.type === 'SymbolNode'
      || (node.type === 'OperatorNode' && node.fn === 'multiply' && node.args.every((arg) => ['ConstantNode', 'SymbolNode'].includes(arg.type)));
    return simple ? String(magnitude) : `(${magnitude})`;
  } catch {
    return `(${magnitude})`;
  }
};

/** The split, exactly as placed: first term keeps its sign in its numerator. */
export const splitFractionItems = (candidate) => candidate.numeratorTerms.map((term) => ({
  sign: term.sign,
  magnitude: `${numeratorMagnitude(term.magnitudeText)} / ${groupedDenominator(candidate)}`,
}));

export const commitFractionSplit = (equation, state) => {
  const candidate = findSplittableFraction(equation, state?.candidateId);
  if (!candidate || !isSplitComplete(state, candidate)) return { ok: false, reason: 'incomplete' };
  const splitText = serializeItems(splitFractionItems(candidate));
  const items = sideItems(equation[candidate.side]);
  // A fraction that is the whole side becomes the split terms. Anywhere else —
  // or behind a minus sign — it becomes a group in the same place:
  // 7 - (6 - 5x)/2 -> 7 - (6/2 - 5x/2). Distributing that sign is its own step.
  const nextItems = items.length === 1 && candidate.termSign > 0
    ? splitFractionItems(candidate)
    : items.map((item, index) => (index === candidate.sideTermIndex ? { sign: item.sign, magnitude: splitText } : item));
  const nextSide = rebuildSideSafely(equation[candidate.side], nextItems, equation.variable || 'x');
  if (!nextSide) return { ok: false, reason: 'notEquivalent' };
  return {
    ok: true,
    equation: { ...equation, [candidate.side]: nextSide },
    step: {
      kind: 'split-fraction',
      description: 'Split the numerator across the denominator',
      parts: ['Split the numerator across the denominator'],
    },
  };
};
