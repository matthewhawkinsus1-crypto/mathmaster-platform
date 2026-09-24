/*
 * MULTIPLYING THE NUMBERS IN A PRODUCT.
 *
 * Factoring in stages leaves numbers side by side: 3(5(x - 3)), 6(-1(x - 2)).
 * Distributing leaves (-2/3)(3). Each is one arithmetic fact for the student to
 * state — 3 × 5 = 15 — and then the workspace writes 15(x - 3). The platform
 * checks the product exactly (fractions stay fractions); it never supplies it.
 */
import { parse } from 'mathjs';
import { expressionToLatex, latexToExpression, splitAdditiveTerms } from './algebraAstEngine.js';
import {
  exactRationalFromExpression,
  exactRationalFromNode,
  makeRational,
  multiplyRational,
  rationalEquals,
  rationalToExpression,
  reducedNumberValue,
} from './algebraExactRational.js';
import {
  equationKey,
  pushTransient,
  rebuildSideSafely,
  sideItems,
} from './algebraStructureToolState.js';

export const ARITHMETIC_TOOL = 'arithmetic';

const unwrap = (node) => {
  let current = node;
  while (current?.type === 'ParenthesisNode') current = current.content;
  return current;
};

// A factor keeps grouping only when it is a sum or starts with a sign:
// 15(x - 3), but 15x rather than 15(x).
const needsGroup = (factorText) => {
  try {
    const node = unwrap(parse(String(factorText)));
    return node?.type === 'OperatorNode' && ['add', 'subtract', 'unaryMinus'].includes(node.fn);
  } catch {
    return true;
  }
};

const hasSymbols = (node) => node.filter((child) => child.isSymbolNode && !['e', 'pi'].includes(child.name)).length > 0;

// The factors of a product, through grouping, but never through a fraction bar:
// 3(5(x - 3)) -> 3, 5, (x - 3); (-2/3)(3) -> (-2/3), 3.
const productFactors = (node, factors = []) => {
  const current = unwrap(node);
  if (current?.type === 'OperatorNode' && current.fn === 'multiply') {
    current.args.forEach((arg) => productFactors(arg, factors));
  } else if (current?.type === 'OperatorNode' && current.fn === 'unaryMinus' && current.args?.length === 1
    && unwrap(current.args[0])?.type === 'OperatorNode' && unwrap(current.args[0]).fn === 'multiply') {
    // -1(x - 2) written as -(1 (x - 2)): the sign is a numeric factor of -1.
    factors.push(parse('-1'));
    productFactors(current.args[0], factors);
  } else if (current) {
    factors.push(current);
  }
  return factors;
};

export const arithmeticParts = (termMagnitudeText) => {
  try {
    const factors = productFactors(parse(String(termMagnitudeText)));
    const numbers = [];
    const rest = [];
    factors.forEach((factor) => {
      const value = !hasSymbols(factor) ? exactRationalFromNode(factor) : null;
      if (value) numbers.push({ value, latex: expressionToLatex(factor.toString({ parenthesis: 'keep', implicit: 'hide' })) });
      else rest.push(factor.toString({ parenthesis: 'keep', implicit: 'hide' }));
    });
    if (numbers.length < 2) return null;
    const product = numbers.reduce((acc, entry) => (acc ? multiplyRational(acc, entry.value) : null), makeRational(1, 1));
    if (!product) return null;
    return { numbers, rest, product };
  } catch {
    return null;
  }
};

export const detectArithmeticProducts = (equation) => {
  if (!equation) return [];
  const found = [];
  ['left', 'right'].forEach((side) => {
    (splitAdditiveTerms(equation[side]) || []).forEach((term, sideTermIndex) => {
      const parts = arithmeticParts(term.magnitudeText);
      if (!parts) return;
      found.push({
        id: `${side}:${sideTermIndex}`,
        side,
        sideTermIndex,
        termSign: term.sign < 0 ? -1 : 1,
        latex: term.latex,
        numbers: parts.numbers,
        rest: parts.rest,
        productLatex: parts.numbers.map((entry) => (entry.latex.startsWith('-') ? `\\left(${entry.latex}\\right)` : entry.latex)).join(' \\times '),
      });
    });
  });
  return found;
};

export const findArithmeticProduct = (equation, candidateId) => (
  detectArithmeticProducts(equation).find((candidate) => candidate.id === candidateId) || null
);

export const openArithmetic = (equation) => {
  const candidates = detectArithmeticProducts(equation);
  return {
    kind: ARITHMETIC_TOOL,
    equationKey: equationKey(equation),
    candidateId: candidates.length === 1 ? candidates[0].id : null,
    answer: '',
    undoStack: [],
    lastActionKey: null,
  };
};

export const chooseArithmeticProduct = (state, equation, candidateId) => {
  if (!state || !findArithmeticProduct(equation, candidateId) || state.candidateId === candidateId) return state;
  return pushTransient(state, { ...state, candidateId, answer: '' });
};

export const setArithmeticAnswer = (state, value) => (
  state ? pushTransient(state, { ...state, answer: String(value ?? '') }, { coalesceKey: 'answer' }) : state
);

/**
 * The student's product must equal the numbers' product exactly and be written
 * as ONE number in lowest terms (15, -6, 1/3 — not 3·5, not 2/6).
 */
export const checkArithmeticAnswer = (candidate, answer) => {
  const raw = String(answer ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  let expression;
  let node;
  try {
    expression = latexToExpression(raw);
    node = parse(expression);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const value = exactRationalFromExpression(expression);
  if (!value) return { ok: false, reason: 'unreadable' };
  const product = candidate.numbers.reduce((acc, entry) => multiplyRational(acc, entry.value), makeRational(1, 1));
  if (!rationalEquals(value, product)) {
    return { ok: false, reason: rationalEquals(value, makeRational(-product.n, product.d)) ? 'sign' : 'wrong' };
  }
  if (!reducedNumberValue(node)) return { ok: false, reason: 'notSingleNumber' };
  return { ok: true, value };
};

export const commitArithmetic = (equation, state) => {
  const candidate = findArithmeticProduct(equation, state?.candidateId);
  if (!candidate) return { ok: false, reason: 'stale' };
  const check = checkArithmeticAnswer(candidate, state.answer);
  if (!check.ok) return { ok: false, reason: check.reason };
  const magnitudeValue = makeRational(Math.abs(check.value.n), check.value.d);
  const valueText = rationalToExpression(magnitudeValue);
  const numberText = magnitudeValue.d === 1 ? valueText : `(${valueText})`;
  const restText = candidate.rest.map((factor) => (needsGroup(factor) ? `(${factor})` : factor)).join(' * ');
  let magnitude;
  if (!restText) magnitude = valueText;
  else if (magnitudeValue.n === 1 && magnitudeValue.d === 1) magnitude = candidate.rest.length === 1 ? candidate.rest[0] : restText;
  else magnitude = `${numberText} * ${restText}`;
  const sign = candidate.termSign * (check.value.n < 0 ? -1 : 1);
  const items = sideItems(equation[candidate.side]);
  items[candidate.sideTermIndex] = { sign, magnitude };
  const nextSide = rebuildSideSafely(equation[candidate.side], items, equation.variable || 'x');
  if (!nextSide) return { ok: false, reason: 'notEquivalent' };
  return {
    ok: true,
    equation: { ...equation, [candidate.side]: nextSide },
    step: {
      kind: 'simplify-arithmetic',
      description: `Multiplied the numbers on the ${candidate.side} side`,
      parts: ['Multiplied ', { latex: candidate.productLatex }, ` on the ${candidate.side} side`],
    },
  };
};

export const ARITHMETIC_MESSAGES = {
  empty: 'Enter the product of these numbers.',
  unreadable: 'Enter one number, such as 15 or -6.',
  sign: 'Check the sign of the product.',
  wrong: 'That is not the product of these numbers.',
  notSingleNumber: 'That is the right value. Write it as one number in lowest terms.',
};
