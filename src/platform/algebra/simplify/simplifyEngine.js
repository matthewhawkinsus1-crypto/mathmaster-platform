/*
 * ONE SIMPLIFY, EVERYWHERE (student push Q).
 *
 * Simplify makes a part of an expression SHORTER BY COMPUTING. That is four
 * kinds of part, found from the MathJS tree of what is on the board — never
 * from an assignment's numbers:
 *
 *   product      numbers multiplied together:  (-2/3)(3),  3(5x),  (-1)(-4x)
 *   likeTerms    terms with the same variable part:  2x and -4x,  12 and 5
 *   fraction     a numeric fraction not in lowest terms:  6/4
 *   parentheses  a group added or subtracted:  + (-4x + 12),  - (-4x + 12)
 *   unit         a factor of 1 left behind by an older build:  (1)(12)
 *
 * Changing a part's SHAPE (Factor, Split fraction, Cancel factors, Arrange
 * terms) is Rewrite, not Simplify; those stay in algebraStructureTools.js.
 *
 * The platform never supplies a result. The student types the simplified form
 * of the part they chose (or of a whole side), and this module only checks it:
 * equal to what it replaces, and actually simpler. A unit factor is the one
 * exception, and it computes nothing: removing a "1 times" is applied when the
 * student asks for it, as "Remove parentheses" after a plus sign is.
 *
 * Expressions are grouped into REGIONS so every workspace uses one engine: an
 * equation's two sides, or the two or three expressions of a relation branch.
 * A region is { key, label, expression }.
 */
import { parse } from '../../math/mathjs.js';
import {
  expressionToLatex,
  expressionsEquivalent,
  latexToExpression,
  splitAdditiveTerms,
} from '../../../algebraAstEngine.js';
import {
  exactMonomial,
  exactRationalFromExpression,
  exactRationalFromNode,
  makeRational,
  multiplyRational,
  rationalEquals,
  rationalToExpression,
  rationalToLatex,
  reducedNumberValue,
} from '../../../algebraExactRational.js';
import { findLikeTermGroups, monomialSignature } from '../../../algebraLikeTermsModel.js';
import { rebuildSideSafely, serializeItems, sideItems } from '../../../algebraStructureToolState.js';
import { spokenMathLabel } from '../../language/mathSpeechLabel.js';
import { letterRunsAsProducts } from '../../math/latexToExpression.js';

export const SIMPLIFY_PART_KINDS = Object.freeze({
  PRODUCT: 'product',
  LIKE_TERMS: 'likeTerms',
  FRACTION: 'fraction',
  PARENTHESES: 'parentheses',
  UNIT: 'unit',
});

const unwrap = (node) => {
  let current = node;
  while (current?.type === 'ParenthesisNode') current = current.content;
  return current;
};

const isWrittenUnit = (rawNode) => {
  const node = unwrap(rawNode);
  if (node?.type === 'OperatorNode' && node.fn === 'unaryMinus' && node.args?.length === 1) return isWrittenUnit(node.args[0]);
  return node?.type === 'ConstantNode' && Number(node.value) === 1;
};

const hasSymbols = (node) => node.filter((child) => child.isSymbolNode && !['e', 'pi'].includes(child.name)).length > 0;

const nodeText = (node) => node.toString({ parenthesis: 'keep', implicit: 'hide' });

const safeLatex = (text) => {
  try { return expressionToLatex(text); } catch { return String(text ?? ''); }
};

// --- Reading a term as factors ---------------------------------------------------------

/**
 * The factors of a product, through grouping but never through a fraction bar.
 * A minus sign belongs to the factor it is written on: -4x is the numbers -4
 * and the letter x, and -1(x - 2) is -1 and (x - 2). Returns
 * [{ value } | { text }] — a value for a purely numeric factor.
 */
export const signedFactors = (rawNode) => {
  const node = unwrap(rawNode);
  if (!node) return [];
  if (node.type === 'OperatorNode' && node.fn === 'multiply') {
    return node.args.flatMap((arg) => signedFactors(arg));
  }
  if (node.type === 'OperatorNode' && node.fn === 'unaryMinus' && node.args?.length === 1) {
    const inner = signedFactors(node.args[0]);
    const firstNumber = inner.findIndex((factor) => factor.value);
    if (firstNumber >= 0) {
      return inner.map((factor, index) => (index === firstNumber
        ? { ...factor, value: makeRational(-factor.value.n, factor.value.d) }
        : factor));
    }
    // A minus sign with no number of its own: -y. Not a written 1.
    return [{ value: makeRational(-1, 1), node: null, sign: true }, ...inner];
  }
  if (!hasSymbols(node)) {
    const value = exactRationalFromNode(node);
    // `literal`: written as one number (3, 1/2). Anything else — 1/2 · 2,
    // 2 + 3 — still has arithmetic in it, which is the student's.
    if (value) return [{ value, node, literal: isWrittenNumber(node) }];
  }
  return [{ text: nodeText(node), node }];
};

const isOne = (value) => value && value.n === 1 && value.d === 1;

function isWrittenNumber(rawNode) {
  const node = unwrap(rawNode);
  if (!node) return false;
  if (node.type === 'OperatorNode' && node.fn === 'unaryMinus' && node.args?.length === 1) return isWrittenNumber(node.args[0]);
  return Boolean(reducedNumberValue(node));
}
const isSum = (node) => {
  const inner = unwrap(node);
  return inner?.type === 'OperatorNode' && ['add', 'subtract'].includes(inner.fn) && inner.args?.length === 2;
};

const isSumText = (text) => {
  try { return isSum(parse(String(text))); } catch { return false; }
};

const groupedText = (text) => {
  try {
    const node = unwrap(parse(String(text)));
    const grouped = node?.type === 'OperatorNode' && ['add', 'subtract', 'unaryMinus'].includes(node.fn);
    return grouped ? `(${text})` : String(text);
  } catch {
    return `(${text})`;
  }
};

/** A signed term from a value and the letters it multiplies: never 1x, never 0x. */
export const termFromValue = (value, rest = []) => {
  if (!value) return null;
  const sign = value.n < 0 ? -1 : 1;
  const magnitude = makeRational(Math.abs(value.n), value.d);
  if (magnitude.n === 0) return { sign: 1, magnitude: '0' };
  const restText = rest.map(groupedText).join(' * ');
  if (!restText) return { sign, magnitude: rationalToExpression(magnitude) };
  // A product of 1 with a sum, (2/2)(x + 3): the group stays a group, stored
  // as 1(…) like a substituted one, so removing it (and, after a minus,
  // stating each sign) is still the student's next step.
  if (isOne(magnitude) && rest.length === 1 && isSumText(rest[0])) return { sign, magnitude: `1 * ${restText}` };
  if (isOne(magnitude)) return { sign, magnitude: restText };
  const number = magnitude.d === 1 ? rationalToExpression(magnitude) : `(${rationalToExpression(magnitude)})`;
  return { sign, magnitude: `${number} * ${restText}` };
};

const describeValueLatex = (value) => {
  const latex = rationalToLatex(value);
  return value.n < 0 ? `\\left(${latex}\\right)` : latex;
};

// --- Detecting the parts ---------------------------------------------------------------

const termNode = (term) => {
  try { return parse(String(term.magnitudeText)); } catch { return null; }
};

/** + (sum) or - (sum), stored as the unit product 1(sum) so splitters keep it whole. */
const parenthesesPart = (term, node) => {
  const inner = unwrap(node);
  if (inner?.type !== 'OperatorNode' || inner.fn !== 'multiply' || inner.args?.length !== 2) return null;
  const [unit, group] = inner.args;
  // Only a 1 or -1 written as such: (2/2)(x + 3) is a product the student computes.
  if (!isWrittenUnit(unit) || !isSum(group)) return null;
  const unitValue = exactRationalFromNode(unit);
  const sign = (term.sign < 0 ? -1 : 1) * (unitValue.n < 0 ? -1 : 1);
  const groupText = nodeText(unwrap(group));
  const innerTerms = splitAdditiveTerms(groupText) || [];
  if (innerTerms.length < 2) return null;
  return { sign, groupText, innerTerms: innerTerms.map((entry) => ({ sign: entry.sign < 0 ? -1 : 1, magnitude: entry.magnitudeText, latex: entry.magnitudeLatex })) };
};

/**
 * The additive chain as written, before the term splitter folds a leading
 * minus into the term's sign: x - (-1)(x + 2) is the raw term (-1)(x + 2)
 * after a minus, though the splitter reports + 1(x + 2). Same order as
 * splitAdditiveTerms.
 */
const rawAdditiveTerms = (expression) => {
  const terms = [];
  const walk = (node, sign) => {
    if (node?.type === 'OperatorNode' && node.fn === 'add' && node.args?.length === 2) { walk(node.args[0], sign); walk(node.args[1], sign); return; }
    if (node?.type === 'OperatorNode' && node.fn === 'subtract' && node.args?.length === 2) { walk(node.args[0], sign); walk(node.args[1], -sign); return; }
    if (node?.type === 'OperatorNode' && node.fn === 'unaryMinus' && node.args?.length === 1) { walk(node.args[0], -sign); return; }
    if (node?.type === 'ParenthesisNode') { walk(node.content, sign); return; }
    terms.push({ node, sign });
  };
  try { walk(parse(String(expression)), 1); } catch { return []; }
  return terms;
};

/** A written (-1)(sum) after a minus: two signs the student multiplies. */
const hiddenSignProduct = (raw) => {
  if (!raw || raw.sign > 0) return false;
  const inner = unwrap(raw.node);
  if (inner?.type !== 'OperatorNode' || inner.fn !== 'multiply' || inner.args?.length !== 2 || !isSum(inner.args[1])) return false;
  const unit = exactRationalFromNode(inner.args[0]);
  return Boolean(unit && unit.n === -1 && unit.d === 1);
};

const regionTermParts = (term, raw = null) => {
  const node = termNode(term);
  if (!node) return null;
  const termSign = term.sign < 0 ? -1 : 1;
  const parentheses = parenthesesPart(term, node);
  if (parentheses && hiddenSignProduct(raw)) {
    // x - (-1)(x + 2): the sign product is the student's, (-1) × (-1).
    const values = [makeRational(-1, 1), makeRational(-1, 1)];
    return {
      kind: SIMPLIFY_PART_KINDS.PRODUCT,
      values,
      rest: [parentheses.groupText],
      latex: `-\\left(-1\\right)\\left(${safeLatex(parentheses.groupText)}\\right)`,
      productLatex: values.map(describeValueLatex).join(' \\times '),
      name: `product: minus negative 1 times the quantity ${spokenMathLabel(parentheses.groupText)}`,
    };
  }
  if (parentheses) {
    return {
      kind: SIMPLIFY_PART_KINDS.PARENTHESES,
      ...parentheses,
      latex: `${parentheses.sign < 0 ? '-' : '+'}\\left(${safeLatex(parentheses.groupText)}\\right)`,
      name: `parentheses: ${parentheses.sign < 0 ? 'minus' : 'plus'} the quantity ${spokenMathLabel(parentheses.groupText)}`,
    };
  }
  const factors = signedFactors(node);
  const numbers = factors.filter((factor) => factor.value);
  const rest = factors.filter((factor) => !factor.value).map((factor) => factor.text);
  const nonUnit = numbers.filter((factor) => !isOne(factor.value));
  const signedTermLatex = term.latex.replace(/^\+\s*/, '');
  const computed = numbers.some((factor) => !factor.literal && !factor.sign);
  const hasUnit = numbers.some((factor) => isOne(factor.value) && factor.literal);
  const name = `product: ${spokenMathLabel(term.text.replace(/^\+\s*/, ''))}`;
  // The term's own sign travels on its first number when that number is
  // positive: -3(2x) is (-3) × 2. A negative first number keeps its own sign
  // and the term's minus becomes its own factor, (-1) × (-1) × 4: the sign
  // product is always the student's.
  const signed = (values) => {
    if (termSign > 0 || !values.length) return values;
    const [first, ...others] = values;
    return first.n > 0 ? [makeRational(-first.n, first.d), ...others] : [makeRational(-1, 1), first, ...others];
  };
  if (nonUnit.length >= 2 || (computed && factors.length >= 2)) {
    const values = signed(numbers.filter((factor) => !isOne(factor.value) || !factor.literal).map((factor) => factor.value));
    return {
      kind: SIMPLIFY_PART_KINDS.PRODUCT,
      values,
      rest,
      latex: signedTermLatex,
      // Arithmetic hidden inside a number (2 · 1/2) is shown as written.
      productLatex: computed ? signedTermLatex : values.map(describeValueLatex).join(' \\times '),
      name,
    };
  }
  if (hasUnit && factors.length >= 2) {
    // Only a factor of 1 is left: (1)(12), x · 1. Removing it is one press,
    // but only while nothing else changes; a 1 beside a sign — (1)(-4x),
    // or a minus folded in front — leaves the term for the student to write.
    if (termSign > 0 && nonUnit.every((factor) => factor.value.n > 0)) {
      return {
        kind: SIMPLIFY_PART_KINDS.UNIT,
        values: nonUnit.map((factor) => factor.value),
        rest,
        termSign,
        latex: signedTermLatex,
        name: `a factor of 1: ${spokenMathLabel(term.text.replace(/^\+\s*/, ''))}`,
      };
    }
    const values = signed(nonUnit.length ? nonUnit.map((factor) => factor.value) : [makeRational(1, 1)]);
    return {
      kind: SIMPLIFY_PART_KINDS.PRODUCT,
      values,
      rest,
      latex: signedTermLatex,
      productLatex: signedTermLatex,
      name,
    };
  }
  const inner = unwrap(node);
  if (inner?.type === 'OperatorNode' && inner.fn === 'divide' && inner.args?.length === 2) {
    const denominator = exactRationalFromNode(inner.args[1]);
    if (denominator && isOne(denominator)) {
      // a ÷ 1: nothing to compute.
      return {
        kind: SIMPLIFY_PART_KINDS.UNIT,
        divideByOne: nodeText(unwrap(inner.args[0])),
        termSign,
        latex: signedTermLatex,
        name: `divided by 1: ${spokenMathLabel(term.text.replace(/^\+\s*/, ''))}`,
      };
    }
    if (!hasSymbols(inner)) {
      const value = exactRationalFromNode(inner);
      if (value && !reducedNumberValue(inner)) {
        return {
          kind: SIMPLIFY_PART_KINDS.FRACTION,
          value: termSign < 0 ? makeRational(-value.n, value.d) : value,
          latex: signedTermLatex,
          name: `fraction: ${spokenMathLabel(term.text.replace(/^\+\s*/, ''))}`,
        };
      }
    }
  }
  return null;
};

const likeTermsName = (terms, indices) => `like terms: ${indices
  .map((index) => spokenMathLabel(terms[index].text.replace(/^\+\s*/, '')))
  .join(' and ')}`;

const joinedTermsLatex = (terms, indices) => indices
  .map((index, position) => (position === 0 ? terms[index].latex.replace(/^\+\s*/, '') : terms[index].latex))
  .join(' ');

/**
 * Every simplifiable part, in reading order: region by region, then by the
 * first term each part touches. Each part has a stable id, the region it is
 * in, the indices of its terms (as `splitAdditiveTerms` numbers them), the
 * LaTeX the box shows, and an accessible name.
 */
export const detectSimplifyParts = (regions = []) => {
  const parts = [];
  regions.forEach((region) => {
    if (!region || region.expression == null || region.expression === '') return;
    const terms = splitAdditiveTerms(region.expression) || [];
    const raw = rawAdditiveTerms(region.expression);
    terms.forEach((term, termIndex) => {
      const part = regionTermParts(term, raw.length === terms.length ? raw[termIndex] : null);
      if (part) parts.push({ ...part, variable: region.variable || 'x', region: region.key, regionLabel: region.label || region.key, termIndices: [termIndex] });
    });
    let groups = [];
    try { groups = findLikeTermGroups(region.expression); } catch { groups = []; }
    groups.forEach((group) => {
      // A group's terms must each be one plain term the student can read: a
      // grouped sum or a stored unit group is never "like" anything.
      const indices = group.indices.filter((index) => !parenthesesPart(terms[index], termNode(terms[index])));
      if (indices.length < 2) return;
      parts.push({
        kind: SIMPLIFY_PART_KINDS.LIKE_TERMS,
        variable: region.variable || 'x',
        region: region.key,
        regionLabel: region.label || region.key,
        termIndices: indices,
        key: group.key,
        selectedExpression: indices.map((index, position) => {
          const magnitude = terms[index].magnitudeText;
          if (position === 0) return terms[index].sign < 0 ? `-(${magnitude})` : `(${magnitude})`;
          return `${terms[index].sign < 0 ? '-' : '+'} (${magnitude})`;
        }).join(' '),
        latex: joinedTermsLatex(terms, indices),
        name: likeTermsName(terms, indices),
      });
    });
  });
  const regionOrder = regions.map((region) => region?.key);
  return parts
    .map((part) => ({ ...part, id: `${part.region}:${part.kind}:${part.termIndices.join('.')}` }))
    .sort((a, b) => (regionOrder.indexOf(a.region) - regionOrder.indexOf(b.region))
      || (a.termIndices[0] - b.termIndices[0])
      || (a.termIndices.length - b.termIndices.length));
};

export const findSimplifyPart = (regions, partId) => (
  detectSimplifyParts(regions).find((part) => part.id === partId) || null
);

/** Term indices, per region, that belong to at least one part (for the board's highlight). */
export const highlightedTermIndices = (parts, regionKey) => [...new Set(parts
  .filter((part) => part.region === regionKey)
  .flatMap((part) => part.termIndices))].sort((a, b) => a - b);

/** The parts a tap on one board term opens, in the order repeated taps cycle through them. */
export const partsForTerm = (parts, regionKey, termIndex) => parts
  .filter((part) => part.region === regionKey && part.termIndices.includes(termIndex));

// --- What the student must type ----------------------------------------------------------

/** Does this part ask for typed work? Parentheses after a plus and a unit factor do not. */
export const partNeedsAnswer = (part) => Boolean(part) && !(
  part.kind === SIMPLIFY_PART_KINDS.UNIT
  || (part.kind === SIMPLIFY_PART_KINDS.PARENTHESES && part.sign > 0)
);

/** Does this part ask for a sign on each term (parentheses after a minus)? */
export const partNeedsSigns = (part) => part?.kind === SIMPLIFY_PART_KINDS.PARENTHESES && part.sign < 0;

// `context`: the expressions on the board the answer is checked against, so a
// typed 5xy reads as 5·x·y where the board has x and y (GR36,
// letterRunsAsProducts). The board's own reading is never changed.
const readTyped = (answer, context = []) => {
  const raw = String(answer ?? '').trim();
  if (!raw) return { reason: 'empty' };
  try {
    const expression = letterRunsAsProducts(latexToExpression(raw), context);
    const node = parse(expression);
    return { expression, node };
  } catch {
    return { reason: 'unreadable' };
  }
};

/**
 * Written as simply as the part allows: no factor of 1 and no second number
 * left in a product, and every number in lowest terms.
 */
const simplestTermProblem = (node) => {
  const factors = signedFactors(node);
  const numbers = factors.filter((factor) => factor.value);
  const letters = factors.filter((factor) => !factor.value);
  if (numbers.length >= 2) return 'notSingleNumber';
  if (numbers.length === 1 && letters.length && !numbers[0].sign
    && isOne(makeRational(Math.abs(numbers[0].value.n), numbers[0].value.d))) return 'unitCoefficient';
  if (numbers.length === 1 && numbers[0].node && !reducedNumberValue(numbers[0].node)
    && !(numbers[0].node.type === 'OperatorNode' && numbers[0].node.fn === 'unaryMinus' && reducedNumberValue(numbers[0].node.args[0]))) {
    return 'notLowestTerms';
  }
  return null;
};

// Numbers written in a term, not counting exponents: 10x/2 has two, x^2 none.
const writtenLiterals = (node, inExponent = false, found = []) => {
  if (!node) return found;
  if (node.type === 'ConstantNode' && !inExponent) found.push(Number(node.value));
  if (node.type === 'OperatorNode' && node.fn === 'pow' && node.args?.length === 2) {
    writtenLiterals(node.args[0], inExponent, found);
    return found;
  }
  (node.args || (node.content ? [node.content] : [])).forEach((child) => writtenLiterals(child, inExponent, found));
  return found;
};

const hasUnitExponent = (node) => node.filter((child) => child.type === 'OperatorNode' && child.fn === 'pow'
  && unwrap(child.args?.[1])?.type === 'ConstantNode' && Number(unwrap(child.args[1]).value) === 1).length > 0;

/**
 * A single term written as simply as its value allows: x, -6x, 5x/2, (1/2)x —
 * never 10x/2, 2x · 1, (2+3)x, 0/2 or x^1. A term that is not a monomial
 * (15(x - 3)) is judged by its factors alone.
 */
export const writtenTermProblem = (node) => {
  const factorProblem = simplestTermProblem(node);
  if (factorProblem) return factorProblem;
  if (hasUnitExponent(node)) return 'notSimplest';
  const monomial = exactMonomial(node);
  if (!monomial) return null;
  // The numbers written must be exactly the reduced coefficient's: its
  // numerator (left out when it is a 1 in front of letters) and denominator.
  const { n, d } = monomial.coefficient;
  const canonical = [];
  if (Math.abs(n) !== 1 || !Object.keys(monomial.powers).length) canonical.push(Math.abs(n));
  if (d !== 1) canonical.push(d);
  const sorted = (values) => [...values].map((value) => Math.abs(value)).sort((a, b) => a - b).join(',');
  const written = sorted(writtenLiterals(node));
  // (1/2)x writes the 1 a numerator needs.
  if (written === sorted(canonical) || (d !== 1 && Math.abs(n) === 1 && written === sorted([...canonical, 1]))) return null;
  // A coefficient may be one decimal equal to it: 2.5x and 0.35x are as
  // simple as 5x/2 and 7x/20.
  //
  // KEPT ACCEPTED (the owner, GR27): a padded decimal (2.50x for 2x + 0.5x) and
  // a long one for a fraction that does not end (0.8333333333333334x for
  // x/2 + x/3). Each is the right value written as one term. mathjs keeps only
  // a number's value, so 2.50 cannot be told from 2.5 here, and a decimal
  // that long gets no exact value, so the check falls back to equality.
  // Refusing either would mark a right answer wrong; that is never traded for
  // a tidier form. (tests/platform/simplifyEngine.test.mjs pins both.)
  const literals = writtenLiterals(node);
  if (literals.length === 1 && Math.abs(literals[0]) === Math.abs(n) / d) return null;
  return 'notLowestTerms';
};

const productValue = (values) => values.reduce((acc, value) => multiplyRational(acc, value), makeRational(1, 1));

/**
 * Check what the student typed for one part. Returns { ok: true, item } — the
 * signed term (or terms) that replace the part — or { ok: false, reason }.
 * `signs` is the student's sign for each term inside parentheses after a minus.
 */
export const checkSimplifyPart = (part, { answer = '', signs = [] } = {}) => {
  if (!part) return { ok: false, reason: 'stale' };
  if (part.kind === SIMPLIFY_PART_KINDS.UNIT) {
    if (part.divideByOne != null) return { ok: true, items: [{ sign: part.termSign, magnitude: part.divideByOne }] };
    // Only the factor of 1 goes. The term's own number keeps its own sign.
    const value = part.values.length ? part.values[0] : makeRational(1, 1);
    const signed = part.termSign < 0 ? makeRational(-value.n, value.d) : value;
    return { ok: true, items: [termFromValue(signed, part.rest)] };
  }
  if (part.kind === SIMPLIFY_PART_KINDS.PARENTHESES) {
    if (part.sign > 0) return { ok: true, items: part.innerTerms.map(({ sign, magnitude }) => ({ sign, magnitude })) };
    if (!Array.isArray(signs) || signs.length !== part.innerTerms.length || signs.some((sign) => sign !== 1 && sign !== -1)) {
      return { ok: false, reason: 'signsMissing' };
    }
    if (part.innerTerms.some((entry, index) => signs[index] !== -entry.sign)) return { ok: false, reason: 'signsWrong' };
    return { ok: true, items: part.innerTerms.map(({ magnitude }, index) => ({ sign: signs[index], magnitude })) };
  }

  // Checked against the part's own expression: its terms, or its letters.
  const typed = readTyped(answer, [part.selectedExpression, ...(Array.isArray(part.rest) ? part.rest : [])]);
  if (typed.reason) return { ok: false, reason: typed.reason };

  if (part.kind === SIMPLIFY_PART_KINDS.PRODUCT) {
    // The box asks "3 × 5 =": the product of the numbers. Typing the whole
    // term, 15(x - 3), is the same work and is accepted too.
    const expected = productValue(part.values);
    const negated = makeRational(-expected.n, expected.d);
    const typedValue = exactRationalFromExpression(typed.expression);
    const restText = part.rest.map(groupedText).join(' * ');
    const asTerm = (value) => (restText ? `(${rationalToExpression(value)}) * ${restText}` : rationalToExpression(value));
    const equalsTerm = (value) => {
      try { return expressionsEquivalent(asTerm(value), typed.expression, part.variable || 'x'); } catch { return false; }
    };
    const matches = typedValue ? rationalEquals(typedValue, expected) : equalsTerm(expected);
    if (!matches) {
      const flipped = expected.n !== 0 && (typedValue ? rationalEquals(typedValue, negated) : equalsTerm(negated));
      return { ok: false, reason: flipped ? 'sign' : 'notEqual' };
    }
    if ((splitAdditiveTerms(typed.expression) || []).length !== 1) return { ok: false, reason: 'notSingleTerm' };
    const problem = typedValue
      ? (reducedNumberValue(typed.node) || (unwrap(typed.node)?.fn === 'unaryMinus' && reducedNumberValue(unwrap(typed.node).args[0])) ? null : 'notSingleNumber')
      : writtenTermProblem(typed.node);
    if (problem) return { ok: false, reason: problem };
    return { ok: true, items: [termFromValue(expected, part.rest)] };
  }

  if (part.kind === SIMPLIFY_PART_KINDS.FRACTION) {
    const value = exactRationalFromExpression(typed.expression);
    if (!value) return { ok: false, reason: 'notEqual' };
    if (!rationalEquals(value, part.value)) {
      return { ok: false, reason: rationalEquals(value, makeRational(-part.value.n, part.value.d)) ? 'sign' : 'notEqual' };
    }
    const reduced = reducedNumberValue(typed.node)
      || (unwrap(typed.node)?.fn === 'unaryMinus' && reducedNumberValue(unwrap(typed.node).args[0]));
    if (!reduced) return { ok: false, reason: 'notLowestTerms' };
    return { ok: true, items: [termFromValue(part.value)] };
  }

  if (part.kind === SIMPLIFY_PART_KINDS.LIKE_TERMS) {
    let equal = false;
    try { equal = expressionsEquivalent(part.selectedExpression, typed.expression, part.variable || 'x'); } catch { equal = false; }
    if (!equal) return { ok: false, reason: 'notEqual' };
    const typedTerms = splitAdditiveTerms(typed.expression) || [];
    if (typedTerms.length !== 1) return { ok: false, reason: 'notSingleTerm' };
    const zero = exactRationalFromExpression(typed.expression);
    if (zero && zero.n === 0) return reducedNumberValue(typed.node) ? { ok: true, items: [] } : { ok: false, reason: 'notLowestTerms' };
    if (monomialSignature(typedTerms[0].text) !== part.key) return { ok: false, reason: 'notSingleTerm' };
    const problem = writtenTermProblem(typed.node);
    if (problem) return { ok: false, reason: problem };
    // Stored with its multiplication written out (7 * x), as the engine's own
    // terms are, so the board draws 7x rather than a spaced 7 x.
    let magnitude = typedTerms[0].magnitudeText;
    try { magnitude = parse(magnitude).toString({ parenthesis: 'keep', implicit: 'show' }); } catch { /* keep as typed */ }
    return { ok: true, items: [{ sign: typedTerms[0].sign < 0 ? -1 : 1, magnitude }] };
  }
  return { ok: false, reason: 'stale' };
};

/** Never "+ 0": a zero term disappears unless it is all that is left. */
const withoutZeroTerms = (items) => {
  const kept = items.filter((item) => {
    const value = exactRationalFromExpression(item.magnitude);
    return !(value && value.n === 0);
  });
  return kept.length ? kept : [{ sign: 1, magnitude: '0' }];
};

/** The region's expression after replacing the part with checked items, proved equivalent. */
export const applySimplifyItems = (region, part, items) => {
  // The terms left alone are kept as written — (1)(-4x) stays (1)(-4x), not
  // the splitter's flattened 1 * -4 * x — whenever the written chain lines up.
  const split = sideItems(region.expression);
  const raw = rawAdditiveTerms(region.expression);
  // Only where the splitter's text lost a grouping ("1 * -4 * x", "1 * 12") is the
  // written form used; otherwise its own text, which every display handles.
  const current = raw.length === split.length
    ? split.map((item, index) => (/\*\s*-|^1 \*/.test(item.magnitude)
      ? { sign: raw[index].sign, magnitude: raw[index].node.toString({ parenthesis: 'keep', implicit: 'hide' }) }
      : item))
    : split;
  const first = part.termIndices[0];
  const drop = new Set(part.termIndices);
  const next = [];
  current.forEach((item, index) => {
    if (index === first) next.push(...items);
    if (!drop.has(index)) next.push(item);
  });
  return rebuildSideSafely(region.expression, withoutZeroTerms(next), region.variable || 'x');
};

const PART_STEP = {
  [SIMPLIFY_PART_KINDS.PRODUCT]: { equation: 'simplify-arithmetic', relation: 'student-rewrite', verb: 'Multiplied the numbers' },
  [SIMPLIFY_PART_KINDS.LIKE_TERMS]: { equation: 'combine-like-terms', relation: 'combine-like-terms', verb: 'Combined like terms' },
  [SIMPLIFY_PART_KINDS.FRACTION]: { equation: 'reduce-fraction', relation: 'student-rewrite', verb: 'Reduced a fraction' },
  [SIMPLIFY_PART_KINDS.PARENTHESES]: { equation: 'inline-term-rewrite', relation: 'student-rewrite', verb: 'Removed parentheses' },
  [SIMPLIFY_PART_KINDS.UNIT]: { equation: 'inline-term-rewrite', relation: 'student-rewrite', verb: 'Removed a factor of 1' },
};

/**
 * The step a committed part reports. Every kind is one the server already
 * accepts (EQUATION_REWRITE_KINDS / RELATION_STEP_KINDS), so the rewrite
 * credit is unchanged and no Functions deploy is needed.
 */
export const simplifyStepFor = (part, { host = 'equation' } = {}) => {
  const entry = PART_STEP[part?.kind] || PART_STEP[SIMPLIFY_PART_KINDS.PRODUCT];
  const where = part?.regionLabel ? ` on the ${part.regionLabel}` : '';
  const description = `${entry.verb}${where}`;
  return {
    kind: host === 'relation' ? entry.relation : entry.equation,
    description,
    parts: part?.kind === SIMPLIFY_PART_KINDS.PRODUCT
      ? ['Multiplied ', { latex: part.productLatex }, where]
      : [description],
  };
};

/** Check a part and, when right, build the region's new expression. */
export const commitSimplifyPart = (regions, partId, work = {}, options = {}) => {
  const part = findSimplifyPart(regions, partId);
  if (!part) return { ok: false, reason: 'stale' };
  const check = checkSimplifyPart(part, work);
  if (!check.ok) return check;
  const region = regions.find((entry) => entry.key === part.region);
  const expression = applySimplifyItems(region, part, check.items);
  if (!expression) return { ok: false, reason: 'notEqual' };
  return { ok: true, region: part.region, expression, part, step: simplifyStepFor(part, options) };
};

// --- The whole-side route -------------------------------------------------------------------

const compact = (text) => String(text ?? '').replace(/\s+/g, '');

/**
 * Free-form: the student types a simpler version of a whole region. It must be
 * equal to what is there, different from it, and must not leave more to
 * simplify than before (x + x + 12 for 2x + 12 is equal, but not simpler).
 */
export const checkRegionRewrite = (region, answer, { read = null, equivalent = null } = {}) => {
  // A host may read and compare the way its workspace does (the relation
  // workspace's absolute values and roots); the rules stay the same.
  let typed;
  if (read) {
    if (!String(answer ?? '').trim()) return { ok: false, reason: 'empty' };
    try { typed = { expression: read(answer) }; } catch { return { ok: false, reason: 'unreadableSide' }; }
  } else {
    typed = readTyped(answer, [region.expression]);
    if (typed.reason) return { ok: false, reason: typed.reason === 'unreadable' ? 'unreadableSide' : typed.reason };
  }
  let equal = false;
  try {
    equal = equivalent
      ? equivalent(typed.expression, region.expression)
      : expressionsEquivalent(typed.expression, region.expression, region.variable || 'x');
  } catch { equal = false; }
  if (!equal) return { ok: false, reason: 'notEquivalentSide' };
  if (compact(typed.expression) === compact(region.expression)) return { ok: false, reason: 'unchanged' };
  const beforeParts = detectSimplifyParts([region]);
  const afterParts = detectSimplifyParts([{ ...region, expression: typed.expression }]);
  const likeTermCount = (parts) => parts.filter((part) => part.kind === SIMPLIFY_PART_KINDS.LIKE_TERMS)
    .reduce((total, part) => total + part.termIndices.length, 0);
  if (afterParts.length > beforeParts.length || likeTermCount(afterParts) > likeTermCount(beforeParts)) {
    return { ok: false, reason: 'moreToSimplify' };
  }
  // Every term the student wrote anew is written simply: never 1x, 2x · 1,
  // 10x/2 or (2 + 3)x. A term kept exactly as it was is left to its own part.
  const compactTerm = (term) => {
    try { return compact(parse(term.magnitudeText).toString({ parenthesis: 'auto', implicit: 'show' })); } catch { return compact(term.magnitudeText); }
  };
  const unchangedTerms = new Set((splitAdditiveTerms(region.expression) || []).map(compactTerm));
  for (const term of splitAdditiveTerms(typed.expression) || []) {
    if (unchangedTerms.has(compactTerm(term))) continue;
    let node;
    try { node = parse(term.magnitudeText); } catch { continue; }
    const problem = writtenTermProblem(node);
    if (problem) return { ok: false, reason: problem };
  }
  // "+ 0" never reaches the board, whatever was typed.
  const items = sideItems(typed.expression);
  const kept = withoutZeroTerms(items);
  const expression = kept.length !== items.length ? serializeItems(kept) : typed.expression;
  return { ok: true, expression };
};

// --- Check my simplification: the one slip it names (TL41) -----------------------------------

/*
 * CHECK MY SIMPLIFICATION NAMES ONE SLIP (TL41, the smallest slice of the
 * owner's option 5: "a 'check my simplification' diagnosis that names the
 * likely error").
 *
 * A whole side typed in Simplify that is not equal to the side on the board is
 * normally told only that (notEquivalentSide). One slip is named instead: a
 * sign left as it was when parentheses the board shows after a minus sign, or
 * after a negative number, were removed — 5 − 3(x − 2) typed as 5 − 3x − 6, or
 * 4x − 2(x + 3) typed as 4x − 2x + 6. It is named only when all of these hold:
 *
 *   1. The student's own line SHOWS it. Term for term, in any order, the line
 *      is the side as the board draws it with those parentheses removed and at
 *      least one sign inside left as it was; any other group may be kept or
 *      correctly removed. A line that also combined terms (2x + 6 for
 *      4x − 2(x + 3)) is consistent with the slip but does not show it, and a
 *      line with a second error does not match: both keep the plain message.
 *      So does a bare −(x + 1): the board draws it already opened (− x − 1),
 *      so the student removed no parentheses there.
 *   2. Fixing the slip would not put the answer on the board. The corrected
 *      line must not read "a letter = something that does not depend on it",
 *      either way round and however the letter is written (x, 1x,
 *      x − 2(2 − 2)), and the equation must have a letter at all. In
 *      x = 10 − 2(3 + 1), y = 4x − 2(x + 3), x − 2(2 − 2) = 10 or
 *      10 − 2(3 + 1) = 2 the corrected line IS the answer, so naming the slip
 *      would give the next line away: those keep the plain message.
 *   3. The host asks for it: Step Algebra's equations, and only where verdicts
 *      are shown, never in an activity that withholds them. The relation
 *      workspace does not ask.
 *
 * The message names the kind of slip and the rule — never a term, a number or
 * a corrected line (SIMPLIFY_MESSAGES.signInsideParentheses).
 *
 * NOT BUILT (TL41):
 *   - Any other slip. Each needs its own "the line shows it" test and its own
 *     proof that naming it cannot give the answer away.
 *   - Naming a slip in the "Check my simplification" box after a balanced move
 *     (StepByStepAlgebraCore, checkSimplifications). That box holds the
 *     arithmetic a move leaves on a side — 15/3 after dividing 3x = 15 by 3 —
 *     which is usually the answer itself, so it keeps naming only the side to
 *     revise.
 *   - Option 3, support-level variants of Simplify (for example, at level 1,
 *     showing which kind of part to look for). The owner did not choose it:
 *     every support level gets the same Simplify, this message included.
 */
export const SIMPLIFY_SLIPS = Object.freeze({
  SIGN_INSIDE_PARENTHESES: 'signInsideParentheses',
});

// Irregular values, so two different terms never agree at all of them by chance.
const SLIP_PROBES = Object.freeze([1.37, -2.11, 3.53, -0.71, 2.89]);
const SLIP_SHIFT = 1.618;
// Past these the line is not searched; it keeps the plain message.
const MAX_SLIP_TERMS = 12;
const MAX_SLIP_GROUPS = 4;
const MAX_SLIP_SIGNS = 8;

// The signed terms of a sum as written. A group in parentheses stays one term.
const writtenChain = (node, sign = 1, terms = []) => {
  if (node?.type === 'OperatorNode' && node.args?.length === 2 && (node.fn === 'add' || node.fn === 'subtract')) {
    writtenChain(node.args[0], sign, terms);
    writtenChain(node.args[1], node.fn === 'add' ? sign : -sign, terms);
  } else if (node?.type === 'OperatorNode' && node.args?.length === 1 && (node.fn === 'unaryMinus' || node.fn === 'unaryPlus')) {
    writtenChain(node.args[0], node.fn === 'unaryMinus' ? -sign : sign, terms);
  } else {
    terms.push({ node, sign });
  }
  return terms;
};

/**
 * A group in parentheses, alone or times a number — −(x + 1), −3(x − 2),
 * 2(x − 3), a substitution's stored −1(…) — as the number it is multiplied by
 * (the term's sign included) and the terms inside. Null for anything else.
 */
const writtenGroup = ({ node, sign }) => {
  const inside = (candidate) => (candidate?.type === 'ParenthesisNode' && isSum(candidate) ? writtenChain(unwrap(candidate)) : null);
  const alone = inside(node);
  if (alone) return { multiplier: sign, inner: alone };
  if (node?.type !== 'OperatorNode' || node.fn !== 'multiply' || node.args?.length !== 2) return null;
  const inner = inside(node.args[1]);
  if (!inner || hasSymbols(node.args[0])) return null;
  const value = exactRationalFromNode(node.args[0]);
  if (!value || value.n === 0) return null;
  return { multiplier: sign * (value.n / value.d), inner };
};

const letterNames = (node) => [...new Set(node
  .filter((child) => child.isSymbolNode && !['e', 'pi'].includes(child.name))
  .map((child) => child.name))];

// A term's values at the probes, times a number; null when it cannot be read.
const valuesAt = (scopes) => (node, coefficient = 1) => {
  let code;
  try { code = node.compile(); } catch { return null; }
  const values = [];
  for (const scope of scopes) {
    let value;
    try { value = coefficient * Number(code.evaluate({ ...scope })); } catch { return null; }
    if (!Number.isFinite(value)) return null;
    values.push(value);
  }
  return values;
};

const sameValues = (a, b) => a.length === b.length
  && a.every((value, index) => Math.abs(value - b[index]) <= 1e-9 * Math.max(1, Math.abs(value), Math.abs(b[index])));

// Term for term, in any order: each expected term matched by its own typed term.
const sameTermsInAnyOrder = (typed, expected) => {
  if (typed.length !== expected.length) return false;
  const used = typed.map(() => false);
  return expected.every((values) => {
    const at = typed.findIndex((candidate, index) => !used[index] && sameValues(candidate, values));
    if (at < 0) return false;
    used[at] = true;
    return true;
  });
};

/**
 * The slip a typed whole side shows, or null (see the block above). `regions`
 * are the equation's two sides; `regionKey` the side the student retyped;
 * `answer` what they typed. Only a host that wants slips named calls this, and
 * only after checkRegionRewrite has said notEquivalentSide.
 */
export const regionRewriteSlip = (regions, regionKey, answer) => {
  if (!Array.isArray(regions) || regions.length !== 2) return null;
  const region = regions.find((entry) => entry?.key === regionKey);
  const other = regions.find((entry) => entry && entry.key !== regionKey);
  if (!region || !other || String(region.expression ?? '') === '' || String(other.expression ?? '') === '') return null;
  const typed = readTyped(answer, [region.expression]);
  if (typed.reason) return null;
  let sideNode;
  let otherNode;
  try {
    sideNode = parse(String(region.expression));
    otherNode = parse(String(other.expression));
  } catch {
    return null;
  }
  if ([sideNode, otherNode, typed.node].some((node) => node.filter((child) => child.type === 'FunctionNode').length)) return null;

  // No letter: nothing to solve, and the side's value is all the line says.
  const boardLetters = [...new Set([...letterNames(sideNode), ...letterNames(otherNode)])];
  if (!boardLetters.length) return null;
  const letters = [...new Set([...boardLetters, ...letterNames(typed.node)])];
  if (letters.length > SLIP_PROBES.length) return null;
  const scopesWith = (shifted = null) => SLIP_PROBES.map((_, probe) => Object.fromEntries(letters.map((name, index) => [
    name,
    SLIP_PROBES[(probe + index) % SLIP_PROBES.length] + (name === shifted ? SLIP_SHIFT : 0),
  ])));
  const scopes = scopesWith();
  const valuesOf = valuesAt(scopes);
  const sideValues = valuesOf(sideNode);
  const otherValues = valuesOf(otherNode);
  const typedValues = valuesOf(typed.node);
  if (!sideValues || !otherValues || !typedValues) return null;
  // An equal line is never a slip.
  if (sameValues(typedValues, sideValues)) return null;

  // Fixing the slip leaves this side's value as it is on the board now. If the
  // corrected line would be "a letter = something that does not depend on it",
  // it is the answer: never named. Unreadable counts as the answer.
  const answerStatement = (letterValues, againstNode, againstValues) => {
    const name = letters.find((entry) => sameValues(letterValues, scopes.map((scope) => scope[entry])));
    if (!name) return false;
    const moved = valuesAt(scopesWith(name))(againstNode);
    return !moved || sameValues(moved, againstValues);
  };
  if (answerStatement(otherValues, sideNode, sideValues) || answerStatement(sideValues, otherNode, otherValues)) return null;

  // The side as the board draws it: the shared splitter's terms. A group the
  // board keeps whole (a number times parentheses, a substitution's −1(…)) is
  // one the student removes. A bare −(x + 1) is drawn already opened
  // (− x − 1), so a sign typed wrong there is a copying slip, not this one.
  const terms = (splitAdditiveTerms(region.expression) || []).map((term) => {
    try { return { node: parse(String(term.magnitudeText)), sign: term.sign < 0 ? -1 : 1 }; } catch { return null; }
  });
  if (!terms.length || terms.some((term) => !term)) return null;
  const typedTerms = writtenChain(unwrap(typed.node));
  if (terms.length > MAX_SLIP_TERMS || typedTerms.length > MAX_SLIP_TERMS + MAX_SLIP_SIGNS) return null;
  const typedPrints = typedTerms.map(({ node, sign }) => valuesOf(node, sign));
  if (typedPrints.some((values) => !values)) return null;

  const plain = [];
  const groups = [];
  for (const term of terms) {
    const whole = valuesOf(term.node, term.sign);
    if (!whole) return null;
    const group = writtenGroup(term);
    if (!group) {
      plain.push(whole);
      continue;
    }
    const inner = group.inner.map(({ node, sign }) => valuesOf(node, group.multiplier * sign));
    if (inner.some((values) => !values)) return null;
    groups.push({ whole, inner, negative: group.multiplier < 0 });
  }
  if (!groups.some((group) => group.negative) || groups.length > MAX_SLIP_GROUPS) return null;

  // Each group kept whole or removed; removed after a minus, each sign inside
  // either changed (right) or left as it was (the slip) — at least one left.
  for (let removed = 1; removed < (1 << groups.length); removed += 1) {
    const fixed = [...plain];
    const signed = [];
    groups.forEach((group, index) => {
      if (!(removed & (1 << index))) fixed.push(group.whole);
      else if (group.negative) signed.push(...group.inner);
      else fixed.push(...group.inner);
    });
    if (!signed.length || signed.length > MAX_SLIP_SIGNS || fixed.length + signed.length !== typedPrints.length) continue;
    for (let leftAsItWas = 1; leftAsItWas < (1 << signed.length); leftAsItWas += 1) {
      const expected = [...fixed, ...signed.map((values, index) => (leftAsItWas & (1 << index) ? values.map((value) => -value) : values))];
      if (sameTermsInAnyOrder(typedPrints, expected)) return SIMPLIFY_SLIPS.SIGN_INSIDE_PARENTHESES;
    }
  }
  return null;
};

// --- Student-safe messages ------------------------------------------------------------------

/**
 * What a student is told. None of these names a result or says whether the
 * item's answer is right: they describe the student's own step, as the
 * existing workspace checks always have, and the equation is never changed.
 */
export const SIMPLIFY_MESSAGES = Object.freeze({
  empty: 'Type the simplified form first.',
  unreadable: 'MathMaster could not read that yet. Enter one expression, without an equals sign.',
  unreadableSide: 'MathMaster could not read that yet. Enter only the expression for that side, without an equals sign.',
  notEqual: 'That is not equal to the part you chose. Your equation has not been changed.',
  sign: 'Check the sign. Your equation has not been changed.',
  notSingleNumber: 'Multiply the numbers into one number. Your equation has not been changed.',
  notLowestTerms: 'Write each number in lowest terms. Your equation has not been changed.',
  unitCoefficient: 'Leave out a coefficient of one: write x, not 1x. Your equation has not been changed.',
  notSingleTerm: 'Combine the terms into one term. Your equation has not been changed.',
  notSimplest: 'Write it in simplest form. Your equation has not been changed.',
  signsMissing: 'Choose a sign for every term inside the parentheses.',
  signsWrong: 'Not every sign is right yet. A minus sign in front of parentheses changes the sign of every term inside. Your equation has not been changed.',
  notEquivalentSide: 'That is not equivalent to that side. Your equation has not been changed.',
  // TL41: named only when the student's own line shows it (regionRewriteSlip).
  [SIMPLIFY_SLIPS.SIGN_INSIDE_PARENTHESES]: 'A sign was left as it was when you removed the parentheses. A minus sign or a negative number in front of parentheses changes the sign of every term inside. Your equation has not been changed.',
  unchanged: 'That is the expression already shown. Type a simpler form to change it.',
  moreToSimplify: 'That leaves more to simplify than before. Your equation has not been changed.',
  stale: 'The equation changed, so that step was not applied. Choose the part again.',
});

export const simplifyMessage = (reason) => SIMPLIFY_MESSAGES[reason] || SIMPLIFY_MESSAGES.notEqual;

/** The part as one line for the box: "(1)(−4x) =". */
export const partPromptLatex = (part) => {
  if (!part) return '';
  if (part.kind === SIMPLIFY_PART_KINDS.PRODUCT) return `${part.productLatex} =`;
  return `${part.latex} =`;
};

export const PART_KIND_LABELS = Object.freeze({
  [SIMPLIFY_PART_KINDS.PRODUCT]: 'Multiply',
  [SIMPLIFY_PART_KINDS.LIKE_TERMS]: 'Like terms',
  [SIMPLIFY_PART_KINDS.FRACTION]: 'Fraction',
  [SIMPLIFY_PART_KINDS.PARENTHESES]: 'Parentheses',
  [SIMPLIFY_PART_KINDS.UNIT]: 'Remove 1',
});
