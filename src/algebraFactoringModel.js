/*
 * FACTORING AS A STUDENT-DRIVEN STEP ALGEBRA MOVE.
 *
 * 15x - 45 -> 15(x - 3), done by the student in four decisions:
 *
 *   1. choose the terms being factored          15x, -45
 *   2. write each one as primes                 3 × 5 × x,  -1 × 3 × 3 × 5
 *   3. choose the factors EVERY term shares     3 and 5 (and, optionally, -1)
 *      and pull that common factor out          15( … )
 *   4. write what is left of each term          x, -3
 *
 * The platform never names the greatest common factor and never fills the
 * parentheses. It exposes structure (the prime factors of a number are a
 * representation, not a decision), checks that the chosen factor really is in
 * every selected term, and checks each remaining factor with exact integer
 * arithmetic: factor × remainder must be the original term, term by term.
 *
 * A partial common factor is a correct move: 15x - 45 -> 3(5x - 15) is
 * accepted, and 5x - 15 inside the group is still offered for factoring. A
 * negative common factor is allowed wherever it is mathematically true:
 * -6x + 12 -> -6(x - 2) or 6(-x + 2), whichever the student chooses.
 *
 * Only integer-coefficient terms are factored here (the linear-algebra case the
 * workspace needs). A term with a fractional coefficient is simply not offered.
 */
import {
  expressionToLatex,
  latexToExpression,
  splitAdditiveTerms,
  splitMultiplicativeFactors,
} from './algebraAstEngine.js';
import {
  exactMonomial,
  gcdInteger,
  integerMonomialToExpression,
  makeRational,
  monomialsEqual,
  multiplyMonomials,
  signedFactorList,
} from './algebraExactRational.js';
import { parse } from 'mathjs';
import {
  equationKey,
  pushTransient,
  rebuildSideSafely,
  serializeItems,
  sideItems,
} from './algebraStructureToolState.js';

export const FACTOR_TOOL = 'factor';

/** An integer-coefficient monomial with a nonzero coefficient, or null. */
export const integerTermMonomial = (termText) => {
  const monomial = exactMonomial(String(termText));
  if (!monomial || monomial.coefficient.d !== 1 || monomial.coefficient.n === 0) return null;
  return monomial;
};

const hasVariables = (monomial) => Object.keys(monomial?.powers || {}).length > 0;

// --- Where factoring can happen ----------------------------------------------------

const termDescriptor = (term) => ({
  sign: term.sign < 0 ? -1 : 1,
  text: String(term.text || '').trim(),
  latex: term.latex,
  magnitudeText: term.magnitudeText,
  magnitudeLatex: term.magnitudeLatex,
  signedText: term.sign < 0 ? `-(${term.magnitudeText})` : term.magnitudeText,
});

const listIsFactorable = (terms, { allowSignOnly = false } = {}) => {
  const monomials = terms.map((term) => integerTermMonomial(term.signedText));
  const selectable = monomials.filter(Boolean);
  if (selectable.length < 2 || !selectable.some(hasVariables)) return false;
  for (let i = 0; i < selectable.length; i += 1) {
    for (let j = i + 1; j < selectable.length; j += 1) {
      if (gcdInteger(selectable[i].coefficient.n, selectable[j].coefficient.n) > 1) return true;
      const shared = Object.keys(selectable[i].powers).some((name) => selectable[j].powers[name] > 0);
      if (shared) return true;
    }
  }
  // Only a sign in common (-x + 2): worth factoring when the target form asks
  // for x first, e.g. 6(-x + 2) on the way to -6(x - 2).
  return allowSignOnly && selectable[0].coefficient.n < 0;
};

/**
 * Every additive list on either side that holds a nontrivial common factor:
 * a whole side (15x - 45), or the one grouped sum inside a product term
 * (the 5x - 15 in 3(5x - 15)). Structural, never keyed to particular numbers.
 */
export const detectFactorableLists = (equation, options = {}) => {
  if (!equation) return [];
  const lists = [];
  ['left', 'right'].forEach((side) => {
    const sideTerms = splitAdditiveTerms(equation[side]) || [];
    if (sideTerms.length >= 2) {
      const terms = sideTerms.map(termDescriptor);
      if (listIsFactorable(terms, options)) lists.push({ id: `${side}:side`, side, scope: 'side', terms });
    }
    sideTerms.forEach((sideTerm, sideTermIndex) => {
      const factors = splitMultiplicativeFactors(sideTerm.magnitudeText);
      if (!factors || factors.denominator.length) return;
      const groups = factors.numerator
        .map((factor, index) => ({ factor, index, terms: splitAdditiveTerms(factor.text) || [] }))
        .filter((entry) => entry.terms.length >= 2);
      if (groups.length !== 1 || factors.numerator.length < 2) return;
      const terms = groups[0].terms.map(termDescriptor);
      if (!listIsFactorable(terms, options)) return;
      lists.push({
        id: `${side}:term:${sideTermIndex}`,
        side,
        scope: 'group',
        sideTermIndex,
        outsideFactors: factors.numerator.filter((_, index) => index !== groups[0].index).map((factor) => factor.text),
        terms,
      });
    });
  });
  return lists;
};

export const findFactorableList = (equation, listId, options = {}) => (
  detectFactorableLists(equation, options).find((list) => list.id === listId) || null
);

// --- Prime tokens ----------------------------------------------------------------------

/**
 * The factors a selected term is written as: 15x -> 3, 5, x; -45 -> -1, 3, 3, 5.
 * The sign is shown but not chosen per term — pulling out a negative is one
 * decision for the whole factor (every number has -1 as a factor).
 */
export const factorTokensForTerm = (termText) => {
  const monomial = integerTermMonomial(termText);
  if (!monomial) return null;
  const tokens = [];
  (signedFactorList(monomial.coefficient.n) || []).forEach((value) => {
    if (value === 1) return;
    if (value === -1) tokens.push({ kind: 'sign', key: 'sign', value: -1, latex: '-1', selectable: false });
    else tokens.push({ kind: 'prime', key: `p:${value}`, value, latex: String(value), selectable: true });
  });
  Object.entries(monomial.powers).forEach(([name, power]) => {
    for (let index = 0; index < power; index += 1) {
      tokens.push({ kind: 'variable', key: `v:${name}`, value: name, latex: name, selectable: true });
    }
  });
  if (!tokens.length || tokens.every((token) => token.kind === 'sign')) {
    tokens.push({ kind: 'one', key: 'one', value: 1, latex: '1', selectable: false });
  }
  return tokens;
};

const monomialFromTokenKeys = (keys = [], negate = false) => {
  let coefficient = negate ? -1 : 1;
  const powers = {};
  keys.forEach((key) => {
    if (key.startsWith('p:')) coefficient *= Number(key.slice(2));
    else if (key.startsWith('v:')) {
      const name = key.slice(2);
      powers[name] = (powers[name] || 0) + 1;
    }
  });
  return { coefficient: makeRational(coefficient, 1), powers };
};

export const monomialText = (monomial) => integerMonomialToExpression(monomial) || '';
export const monomialLatex = (monomial) => {
  const text = monomialText(monomial);
  try { return text ? expressionToLatex(text) : ''; } catch { return text; }
};

// --- Validation --------------------------------------------------------------------------

/**
 * Does `factor` divide EVERY term exactly? Terms and factor may be expression
 * text or exact monomials. `{ ok: true }`, or `{ ok: false, reason, termIndex }`
 * with reason 'invalidFactor' | 'trivial' | 'notInteger' | 'notDivisible'.
 */
export const validateCommonFactor = (terms = [], factor) => {
  const factorMonomial = typeof factor === 'string' || typeof factor === 'number'
    ? integerTermMonomial(String(factor))
    : factor;
  if (!factorMonomial || factorMonomial.coefficient.d !== 1 || factorMonomial.coefficient.n === 0) {
    return { ok: false, reason: 'invalidFactor' };
  }
  if (factorMonomial.coefficient.n === 1 && !hasVariables(factorMonomial)) return { ok: false, reason: 'trivial' };
  for (let index = 0; index < terms.length; index += 1) {
    const term = typeof terms[index] === 'string' ? integerTermMonomial(terms[index]) : terms[index];
    if (!term) return { ok: false, reason: 'notInteger', termIndex: index };
    if (term.coefficient.n % factorMonomial.coefficient.n !== 0) return { ok: false, reason: 'notDivisible', termIndex: index };
    const missing = Object.entries(factorMonomial.powers).some(([name, power]) => (term.powers[name] || 0) < power);
    if (missing) return { ok: false, reason: 'notDivisible', termIndex: index };
  }
  return { ok: true };
};

const countKeys = (keys = []) => keys.reduce((counts, key) => ({ ...counts, [key]: (counts[key] || 0) + 1 }), {});

const tokenValueLabel = (key) => (key.startsWith('p:') ? key.slice(2) : key.slice(2));

/**
 * What the student has chosen so far, in words the workspace can show:
 * whether it is the same factor in every selected term, and if not, where it
 * is missing. The product shown (3 × 5 = 15) is the product of the student's
 * own choices — the platform never proposes which factors to choose.
 */
export const describeCommonFactorChoice = (state, list) => {
  const selected = state?.selected || [];
  const chosenKeys = selected.map((termIndex) => {
    const tokens = factorTokensForTerm(list?.terms?.[termIndex]?.signedText) || [];
    return (state?.chosen?.[termIndex] || []).map((tokenIndex) => tokens[tokenIndex]?.key).filter(Boolean).sort();
  });
  const union = {};
  chosenKeys.forEach((keys) => {
    Object.entries(countKeys(keys)).forEach(([key, count]) => { union[key] = Math.max(union[key] || 0, count); });
  });
  let mismatch = null;
  selected.forEach((termIndex, position) => {
    if (mismatch) return;
    const counts = countKeys(chosenKeys[position]);
    const tokens = factorTokensForTerm(list?.terms?.[termIndex]?.signedText) || [];
    const available = countKeys(tokens.filter((token) => token.selectable).map((token) => token.key));
    Object.entries(union).forEach(([key, needed]) => {
      if (mismatch || (counts[key] || 0) >= needed) return;
      mismatch = {
        termIndex,
        key,
        value: tokenValueLabel(key),
        unavailable: (available[key] || 0) < needed,
      };
    });
  });
  const referenceKeys = chosenKeys[0] || [];
  const factor = monomialFromTokenKeys(referenceKeys, Boolean(state?.negate));
  const empty = !referenceKeys.length && !state?.negate;
  const productParts = [
    ...(state?.negate ? ['-1'] : []),
    ...referenceKeys.map(tokenValueLabel),
  ];
  return {
    ready: !mismatch && !empty && selected.length >= 2,
    empty,
    mismatch,
    factor,
    factorText: monomialText(factor),
    factorLatex: monomialLatex(factor),
    productLatex: productParts.length ? productParts.join(' \\times ') : '',
  };
};

// --- State ----------------------------------------------------------------------------------

export const openFactoring = (equation) => ({
  kind: FACTOR_TOOL,
  equationKey: equationKey(equation),
  phase: 'terms',
  listId: null,
  selected: [],
  chosen: {},
  negate: false,
  pulled: null,
  quotients: {},
  undoStack: [],
  lastActionKey: null,
});

const refusal = (state, reason, detail = {}) => ({ ok: false, state, reason, ...detail });
const accepted = (state) => ({ ok: true, state });

export const toggleFactorTerm = (state, equation, listId, termIndex, options = {}) => {
  if (!state || state.phase !== 'terms') return refusal(state, 'phase');
  const list = findFactorableList(equation, listId, options);
  const term = list?.terms?.[termIndex];
  if (!term) return refusal(state, 'unknownTerm');
  if (!integerTermMonomial(term.signedText)) return refusal(state, 'notFactorableTerm');
  if (state.listId !== listId) {
    return accepted(pushTransient(state, { ...state, listId, selected: [termIndex] }));
  }
  const selected = state.selected.includes(termIndex)
    ? state.selected.filter((index) => index !== termIndex)
    : [...state.selected, termIndex].sort((a, b) => a - b);
  return accepted(pushTransient(state, { ...state, selected }));
};

export const exposeFactorTokens = (state, equation, options = {}) => {
  if (!state || state.phase !== 'terms') return refusal(state, 'phase');
  const list = findFactorableList(equation, state.listId, options);
  if (!list || state.selected.length < 2) return refusal(state, 'needTwoTerms');
  if (state.selected.some((index) => !integerTermMonomial(list.terms[index]?.signedText))) return refusal(state, 'notFactorableTerm');
  return accepted(pushTransient(state, { ...state, phase: 'factor', chosen: {}, negate: false }));
};

export const toggleFactorToken = (state, equation, termIndex, tokenIndex, options = {}) => {
  if (!state || state.phase !== 'factor' || !state.selected.includes(termIndex)) return refusal(state, 'phase');
  const list = findFactorableList(equation, state.listId, options);
  const tokens = factorTokensForTerm(list?.terms?.[termIndex]?.signedText) || [];
  const token = tokens[tokenIndex];
  if (!token) return refusal(state, 'unknownToken');
  if (!token.selectable) return refusal(state, token.kind === 'sign' ? 'signToken' : 'oneToken');
  const current = state.chosen?.[termIndex] || [];
  const nextChosen = current.includes(tokenIndex)
    ? current.filter((index) => index !== tokenIndex)
    : [...current, tokenIndex];
  return accepted(pushTransient(state, { ...state, chosen: { ...state.chosen, [termIndex]: nextChosen } }));
};

export const toggleNegativeFactor = (state) => {
  if (!state || state.phase !== 'factor') return refusal(state, 'phase');
  return accepted(pushTransient(state, { ...state, negate: !state.negate }));
};

export const pullOutCommonFactor = (state, equation, options = {}) => {
  if (!state || state.phase !== 'factor') return refusal(state, 'phase');
  const list = findFactorableList(equation, state.listId, options);
  if (!list) return refusal(state, 'stale');
  const choice = describeCommonFactorChoice(state, list);
  if (choice.empty) return refusal(state, 'emptyFactor');
  if (choice.mismatch) return refusal(state, choice.mismatch.unavailable ? 'notCommon' : 'unmatched', { mismatch: choice.mismatch });
  const validation = validateCommonFactor(state.selected.map((index) => list.terms[index].signedText), choice.factor);
  if (!validation.ok) return refusal(state, validation.reason, { termIndex: state.selected[validation.termIndex] });
  return accepted(pushTransient(state, {
    ...state,
    phase: 'quotients',
    pulled: { text: choice.factorText, latex: choice.factorLatex, coefficient: choice.factor.coefficient.n, powers: choice.factor.powers },
    quotients: {},
  }));
};

export const setFactorQuotient = (state, termIndex, value) => {
  if (!state || state.phase !== 'quotients') return state;
  return pushTransient(
    state,
    { ...state, quotients: { ...state.quotients, [termIndex]: String(value ?? '') } },
    { coalesceKey: `quotient:${termIndex}` },
  );
};

const containsDivision = (text) => {
  try {
    return parse(String(text)).filter((node) => node.type === 'OperatorNode' && node.fn === 'divide').length > 0;
  } catch {
    return true;
  }
};

/**
 * Check one remaining factor: the student's answer, times the pulled factor,
 * must be exactly the original term. 'sign' flags the classic slip of the
 * right number with the wrong sign, without saying what the answer is.
 */
export const checkQuotient = (termText, pulled, answer) => {
  const raw = String(answer ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  let expression;
  try {
    expression = latexToExpression(raw);
    parse(expression);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if ((splitAdditiveTerms(expression) || []).length !== 1) return { ok: false, reason: 'notSingleTerm' };
  const quotient = exactMonomial(expression);
  const term = integerTermMonomial(termText);
  const factor = { coefficient: makeRational(pulled?.coefficient, 1), powers: pulled?.powers || {} };
  if (!quotient || !term || !factor.coefficient) return { ok: false, reason: 'unreadable' };
  const product = multiplyMonomials(factor, quotient);
  if (monomialsEqual(product, term)) {
    if (quotient.coefficient.d !== 1 || containsDivision(expression)) return { ok: false, reason: 'notSimplified' };
    return { ok: true, monomial: quotient, expression };
  }
  const negated = multiplyMonomials(factor, { ...quotient, coefficient: makeRational(-quotient.coefficient.n, quotient.coefficient.d) });
  if (monomialsEqual(negated, term)) return { ok: false, reason: 'sign' };
  return { ok: false, reason: 'wrong' };
};

export const checkFactorQuotients = (state, equation, options = {}) => {
  const list = findFactorableList(equation, state?.listId, options);
  if (!state || state.phase !== 'quotients' || !list) return { ok: false, results: [], reason: 'phase' };
  const results = state.selected.map((termIndex) => ({
    termIndex,
    ...checkQuotient(list.terms[termIndex].signedText, state.pulled, state.quotients?.[termIndex]),
  }));
  return { ok: results.every((result) => result.ok), results };
};

const describeSide = (side) => (side === 'left' ? 'left' : 'right');

/**
 * Commit the student's factoring. Returns { ok, equation, step } or
 * { ok: false, reason }. The new side is proved equivalent before it is used.
 */
export const commitFactoring = (equation, state, options = {}) => {
  const list = findFactorableList(equation, state?.listId, options);
  if (!list) return { ok: false, reason: 'stale' };
  const check = checkFactorQuotients(state, equation, options);
  if (!check.ok) return { ok: false, reason: 'quotients', results: check.results };

  const quotientItems = state.selected.map((termIndex, position) => {
    const monomial = check.results[position].monomial;
    const n = monomial.coefficient.n;
    return { sign: n < 0 ? -1 : 1, magnitude: monomialText({ ...monomial, coefficient: makeRational(Math.abs(n), 1) }) };
  });
  const factorSign = state.pulled.coefficient < 0 ? -1 : 1;
  const factorMagnitude = monomialText({ coefficient: makeRational(Math.abs(state.pulled.coefficient), 1), powers: state.pulled.powers || {} });
  // -1 × (x - 2) keeps its written 1, so the student sees the factor they chose.
  const productMagnitude = `${factorMagnitude} * (${serializeItems(quotientItems)})`;
  const productItem = { sign: factorSign, magnitude: productMagnitude };

  // Replace the selected terms with the product, where the first of them stood.
  const replaceInList = (items) => {
    const selected = new Set(state.selected);
    const next = [];
    items.forEach((item, index) => {
      if (index === state.selected[0]) next.push(productItem);
      if (!selected.has(index)) next.push(item);
    });
    return next;
  };

  const variable = equation.variable || 'x';
  let nextSide;
  if (list.scope === 'side') {
    nextSide = rebuildSideSafely(equation[list.side], replaceInList(sideItems(equation[list.side])), variable);
  } else {
    const groupItems = list.terms.map((term) => ({ sign: term.sign, magnitude: term.magnitudeText }));
    const groupText = serializeItems(replaceInList(groupItems));
    const outside = (list.outsideFactors || []).map((factor) => {
      try {
        const node = parse(String(factor));
        return node.type === 'OperatorNode' && !['multiply'].includes(node.fn) ? `(${factor})` : factor;
      } catch {
        return `(${factor})`;
      }
    });
    const items = sideItems(equation[list.side]);
    items[list.sideTermIndex] = { ...items[list.sideTermIndex], magnitude: `${outside.join(' * ')} * (${groupText})` };
    nextSide = rebuildSideSafely(equation[list.side], items, variable);
  }
  if (!nextSide) return { ok: false, reason: 'notEquivalent' };

  const next = { ...equation, [list.side]: nextSide };
  return {
    ok: true,
    equation: next,
    step: {
      kind: 'factor',
      description: `Factored ${state.pulled.text.replace(/\s+/g, '')} from the ${describeSide(list.side)} side`,
      parts: ['Factored ', { latex: state.pulled.latex }, ` from the ${describeSide(list.side)} side`],
    },
  };
};

export const FACTOR_QUOTIENT_MESSAGES = {
  empty: 'Write what is left of this term.',
  unreadable: 'MathMaster could not read that yet.',
  notSingleTerm: 'Write one term — what is left of this term after the common factor comes out.',
  notSimplified: 'That has the right value. Write it as a single simplified term, without a fraction.',
  sign: 'Check the sign: the common factor times this must give back the original term.',
  wrong: 'The common factor times this does not give back the original term.',
};

export const FACTOR_REFUSAL_MESSAGES = {
  needTwoTerms: 'Select at least two terms to factor.',
  notFactorableTerm: 'That term does not have a whole-number coefficient, so it cannot be factored this way.',
  signToken: 'The sign is shared by pulling out a negative factor. Use “Pull out a negative” instead.',
  oneToken: 'Every term has a factor of 1 — choose a factor greater than 1.',
  emptyFactor: 'Choose at least one factor that every selected term shares.',
  trivial: 'Pulling out 1 changes nothing. Choose a factor every term shares.',
  invalidFactor: 'That is not a factor MathMaster can pull out.',
  notDivisible: 'That factor does not divide every selected term.',
  notInteger: 'Every selected term needs a whole-number coefficient.',
  stale: 'The equation changed. Start factoring again.',
  phase: 'Finish the current step first.',
};
