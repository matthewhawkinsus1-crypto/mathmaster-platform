/*
 * REDUCING A FRACTION BY CANCELLING FACTORS THE STUDENT CAN SEE.
 *
 * 6/2 -> (2 × 3)/(2) -> 3. The student exposes the prime factors of the
 * fraction, then cancels matching pairs: one factor above the bar and an equal
 * factor below it. Nothing cancels on its own and nothing is converted to a
 * decimal — 5x/2 has no common factor, so it is never offered, and it stays
 * the exact 5x/2 it is.
 *
 * This extends the workspace's existing cancellation idea (matching factors
 * above and below a fraction bar) down to the prime factors of whole-number
 * coefficients, which the whole-factor cancellation cannot see: 6 and 2 are
 * not the same factor, but 2 × 3 and 2 share a 2.
 *
 * A term's sign travels with its numerator: -(2x)/(-4) is written as
 * (-1 × 2 × x)/(-1 × 2 × 2), so the two negatives are cancelled by the student
 * too, never silently.
 */
import { parse } from 'mathjs';
import { expressionToLatex, splitAdditiveTerms } from './algebraAstEngine.js';
import {
  exactMonomial,
  exactRationalFromNode,
  gcdInteger,
  integerMonomialToExpression,
  makeRational,
  signedFactorList,
} from './algebraExactRational.js';
import {
  equationKey,
  pushTransient,
  rebuildSideSafely,
  sideItems,
} from './algebraStructureToolState.js';

export const REDUCE_TOOL = 'reduce';

const unwrap = (node) => {
  let current = node;
  while (current?.type === 'ParenthesisNode') current = current.content;
  return current;
};

const hasSymbols = (node) => node.filter((child) => child.isSymbolNode && !['e', 'pi'].includes(child.name)).length > 0;

/** { numerator: monomial (sign folded in), denominator: integer } for a fraction term. */
export const fractionTermParts = (termMagnitudeText, termSign = 1) => {
  try {
    const node = unwrap(parse(String(termMagnitudeText)));
    if (node?.type !== 'OperatorNode' || node.fn !== 'divide' || node.args?.length !== 2) return null;
    const denominatorNode = unwrap(node.args[1]);
    if (!denominatorNode || hasSymbols(denominatorNode)) return null;
    const denominator = exactRationalFromNode(denominatorNode);
    if (!denominator || denominator.d !== 1 || denominator.n === 0) return null;
    const numerator = exactMonomial(node.args[0]);
    if (!numerator || numerator.coefficient.d !== 1 || numerator.coefficient.n === 0) return null;
    return {
      numerator: { ...numerator, coefficient: makeRational(termSign * numerator.coefficient.n, 1) },
      denominator: denominator.n,
    };
  } catch {
    return null;
  }
};

const tokensForNumber = (value, { dropOne = false } = {}) => (signedFactorList(value) || [])
  .filter((factor) => !(dropOne && factor === 1))
  .map((factor) => ({ value: factor, latex: String(factor), selectable: factor !== 1 }));

export const reductionTokens = (parts) => {
  if (!parts) return null;
  const variables = Object.entries(parts.numerator.powers).flatMap(([name, power]) => (
    Array.from({ length: power }, () => ({ value: name, latex: name, selectable: false, variable: true }))
  ));
  const numerator = [
    ...tokensForNumber(parts.numerator.coefficient.n, { dropOne: variables.length > 0 }),
    ...variables,
  ];
  return {
    numerator: numerator.length ? numerator : [{ value: 1, latex: '1', selectable: false }],
    denominator: tokensForNumber(parts.denominator),
  };
};

const isReducible = (parts) => {
  if (!parts || parts.denominator === 1) return false;
  const coefficient = parts.numerator.coefficient.n;
  if (gcdInteger(coefficient, parts.denominator) > 1) return true;
  return coefficient < 0 && parts.denominator < 0;
};

/** Every fraction term, on either side, that has a factor to cancel. */
export const detectReducibleFractions = (equation) => {
  if (!equation) return [];
  const found = [];
  ['left', 'right'].forEach((side) => {
    (splitAdditiveTerms(equation[side]) || []).forEach((term, sideTermIndex) => {
      const termSign = term.sign < 0 ? -1 : 1;
      const parts = fractionTermParts(term.magnitudeText, termSign);
      if (!isReducible(parts)) return;
      found.push({
        id: `${side}:${sideTermIndex}`,
        side,
        sideTermIndex,
        termSign,
        latex: term.latex,
        magnitudeLatex: term.magnitudeLatex,
        parts,
        tokens: reductionTokens(parts),
      });
    });
  });
  return found;
};

export const findReducibleFraction = (equation, candidateId) => (
  detectReducibleFractions(equation).find((candidate) => candidate.id === candidateId) || null
);

export const openFractionReduction = (equation) => ({
  kind: REDUCE_TOOL,
  equationKey: equationKey(equation),
  candidateId: null,
  pending: null,
  pairs: [],
  undoStack: [],
  lastActionKey: null,
});

/** Choosing a fraction writes it as prime factors — the student's request. */
export const chooseReductionFraction = (state, equation, candidateId) => {
  if (!state || !findReducibleFraction(equation, candidateId) || state.candidateId === candidateId) return state;
  return pushTransient(state, { ...state, candidateId, pending: null, pairs: [] });
};

const tokenPaired = (state, row, index) => (state.pairs || []).some((pair) => (row === 'numerator' ? pair.numerator : pair.denominator) === index);

/**
 * One tap on a factor. The first tap holds it; a tap on an equal factor on the
 * other side of the bar cancels the pair. Returns { state, outcome } where
 * outcome is 'held' | 'released' | 'paired' | 'mismatch' | 'ignored'.
 */
export const tapReductionToken = (state, equation, row, index) => {
  const candidate = findReducibleFraction(equation, state?.candidateId);
  const token = candidate?.tokens?.[row]?.[index];
  if (!state || !candidate || !token) return { state, outcome: 'ignored' };
  if (tokenPaired(state, row, index)) return { state, outcome: 'ignored' };
  if (!token.selectable) return { state, outcome: token.variable ? 'variable' : 'ignored' };
  const pending = state.pending;
  if (!pending || pending.row === row) {
    if (pending && pending.row === row && pending.index === index) {
      return { state: pushTransient(state, { ...state, pending: null }), outcome: 'released' };
    }
    return { state: pushTransient(state, { ...state, pending: { row, index } }), outcome: 'held' };
  }
  const held = candidate.tokens[pending.row][pending.index];
  if (String(held.value) !== String(token.value)) return { state, outcome: 'mismatch', held: held.value, tapped: token.value };
  const pair = row === 'numerator'
    ? { numerator: index, denominator: pending.index }
    : { numerator: pending.index, denominator: index };
  return { state: pushTransient(state, { ...state, pending: null, pairs: [...state.pairs, pair] }), outcome: 'paired' };
};

const productOf = (values) => values.reduce((product, value) => product * value, 1);

/** What remains after the student's cancellations, as a signed side item. */
export const reducedTermItem = (candidate, pairs = []) => {
  const cancelledTop = new Set(pairs.map((pair) => pair.numerator));
  const cancelledBottom = new Set(pairs.map((pair) => pair.denominator));
  const top = candidate.tokens.numerator.filter((token, index) => !cancelledTop.has(index) && !token.variable);
  const bottom = candidate.tokens.denominator.filter((_, index) => !cancelledBottom.has(index));
  let numeratorValue = productOf(top.map((token) => Number(token.value)));
  let denominatorValue = productOf(bottom.map((token) => Number(token.value)));
  // A lone -1 left below the bar is written in front: a/(-1) = -a.
  if (denominatorValue < 0) {
    numeratorValue = -numeratorValue;
    denominatorValue = -denominatorValue;
  }
  const monomial = { coefficient: makeRational(Math.abs(numeratorValue), 1), powers: candidate.parts.numerator.powers };
  const numeratorText = integerMonomialToExpression(monomial);
  const sign = numeratorValue < 0 ? -1 : 1;
  if (denominatorValue === 1) return { sign, magnitude: numeratorText };
  const groupedNumerator = /^[\w.]+$/.test(numeratorText.replace(/\s+/g, '')) || /^\d+ [a-z]$/.test(numeratorText)
    ? numeratorText
    : `(${numeratorText})`;
  return { sign, magnitude: `${groupedNumerator} / ${denominatorValue}` };
};

export const commitFractionReduction = (equation, state) => {
  const candidate = findReducibleFraction(equation, state?.candidateId);
  if (!candidate) return { ok: false, reason: 'stale' };
  if (!state.pairs?.length) return { ok: false, reason: 'noPairs' };
  const items = sideItems(equation[candidate.side]);
  items[candidate.sideTermIndex] = reducedTermItem(candidate, state.pairs);
  const nextSide = rebuildSideSafely(equation[candidate.side], items, equation.variable || 'x');
  if (!nextSide) return { ok: false, reason: 'notEquivalent' };
  const fractionLatex = candidate.magnitudeLatex || expressionToLatex(equation[candidate.side]);
  return {
    ok: true,
    equation: { ...equation, [candidate.side]: nextSide },
    step: {
      kind: 'reduce-fraction',
      description: `Cancelled common factors on the ${candidate.side} side`,
      parts: ['Cancelled common factors in ', { latex: fractionLatex }, ` on the ${candidate.side} side`],
    },
  };
};
