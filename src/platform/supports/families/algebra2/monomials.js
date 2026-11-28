/*
 * MONOMIALS WITH WHOLE AND RATIONAL EXPONENTS, AS THE ALGEBRA II LESSONS
 * WRITE THEM (WE-I).
 *
 *   parseMonomialExpression("(a⁻³)(a²b⁴)(c⁻¹)")  → a tree, or null
 *   evaluateMonomial(tree)                       → { c, v } exact, or null
 *   monomialText(m), positiveForm(m)             → "9x⁻⁴y⁶", "9y⁶/x⁴"
 *   monomialSteps(tree)                          → the moves that simplify it
 *
 * It reads the labels the lessons give their answer boxes: products written
 * side by side or with "·", quotients with "/" or "÷", powers as superscripts
 * (x⁻³, n¹⁰) or as "^(2/3)". Side by side binds tighter than "/" and "÷", so
 * "−15ab³ ÷ 5ab" is (−15ab³) ÷ (5ab), as it is read. A monomial is a
 * coefficient (an exact fraction) and a whole or fractional exponent for each
 * letter. Anything else (a sum, a radical, a decimal) is not read: null.
 */
import {
  MINUS,
  Q,
  SUPERSCRIPT_CHARACTERS,
  exactRoot,
  fromSuperscript,
  isObject,
  math,
  qAdd,
  qDiv,
  qEq,
  qIsInt,
  qMul,
  qPow,
  qSub,
  qText,
  superscript,
} from './shared.js';

/* ------------------------------------------------------------- reading */

const tokenize = (source) => {
  const value = String(source ?? '').replace(/\s+/g, '').replace(/−/g, '-');
  const tokens = [];
  let index = 0;
  while (index < value.length) {
    const character = value[index];
    if (/\d/.test(character)) {
      let end = index;
      while (end < value.length && /\d/.test(value[end])) end += 1;
      tokens.push({ t: 'num', v: Number(value.slice(index, end)) });
      index = end;
    } else if (/[a-z]/.test(character)) {
      tokens.push({ t: 'var', v: character });
      index += 1;
    } else if (SUPERSCRIPT_CHARACTERS.includes(character)) {
      let end = index;
      while (end < value.length && SUPERSCRIPT_CHARACTERS.includes(value[end])) end += 1;
      const exponent = fromSuperscript(value.slice(index, end));
      if (exponent === null) return null;
      tokens.push({ t: 'pow', v: Q(exponent) });
      index = end;
    } else if (character === '^') {
      const match = /^\^\((-?\d+)\/(\d+)\)/.exec(value.slice(index)) || /^\^\((-?\d+)\)/.exec(value.slice(index)) || /^\^(\d+)/.exec(value.slice(index));
      if (!match) return null;
      tokens.push({ t: 'pow', v: Q(Number(match[1]), match[2] ? Number(match[2]) : 1) });
      index += match[0].length;
    } else if (character === '(' || character === ')') {
      tokens.push({ t: character });
      index += 1;
    } else if (character === '·' || character === '×') {
      tokens.push({ t: 'mul' });
      index += 1;
    } else if (character === '/' || character === '÷') {
      tokens.push({ t: 'div', v: character });
      index += 1;
    } else if (character === '-') {
      tokens.push({ t: 'neg' });
      index += 1;
    } else {
      return null;
    }
  }
  return tokens;
};

/** The expression as a tree, or null where it is not a product, quotient or power of monomials. */
export const parseMonomialExpression = (source) => {
  const tokens = tokenize(source);
  if (!tokens || !tokens.length) return null;
  let at = 0;
  const peek = () => tokens[at];
  const expression = () => {
    let left = term();
    if (!left) return null;
    while (peek() && (peek().t === 'mul' || peek().t === 'div')) {
      const operator = tokens[at];
      at += 1;
      const right = term();
      if (!right) return null;
      left = operator.t === 'mul' ? { t: 'prod', items: [left, right], explicit: true } : { t: 'div', a: left, b: right, sign: operator.v };
    }
    return left;
  };
  const term = () => {
    let negative = false;
    if (peek()?.t === 'neg') {
      negative = true;
      at += 1;
    }
    const items = [];
    while (peek() && (peek().t === 'num' || peek().t === 'var' || peek().t === '(')) {
      const item = factor();
      if (!item) return null;
      items.push(item);
    }
    if (!items.length) return null;
    const body = items.length === 1 ? items[0] : { t: 'prod', items };
    return negative ? { t: 'neg', a: body } : body;
  };
  const factor = () => {
    const token = tokens[at];
    let node;
    if (token.t === 'num') {
      at += 1;
      node = { t: 'num', v: token.v };
    } else if (token.t === 'var') {
      at += 1;
      node = { t: 'var', v: token.v };
    } else {
      at += 1;
      const inner = expression();
      if (!inner || peek()?.t !== ')') return null;
      at += 1;
      node = { ...inner, paren: true };
    }
    while (peek()?.t === 'pow') {
      node = { t: 'pow', a: node, e: tokens[at].v };
      at += 1;
    }
    return node;
  };
  const tree = expression();
  return tree && at === tokens.length ? tree : null;
};

/* ------------------------------------------------------------ the value */

const ONE = Q(1);
const monomial = (c, v = {}) => ({ c, v: Object.fromEntries(Object.entries(v).filter(([, exponent]) => exponent.n !== 0)) });
const times = (a, b) => {
  const v = { ...a.v };
  Object.entries(b.v).forEach(([letter, exponent]) => { v[letter] = v[letter] ? qAdd(v[letter], exponent) : exponent; });
  return monomial(qMul(a.c, b.c), v);
};
const over = (a, b) => {
  const v = { ...a.v };
  Object.entries(b.v).forEach(([letter, exponent]) => { v[letter] = v[letter] ? qSub(v[letter], exponent) : Q(-exponent.n, exponent.d); });
  return monomial(qDiv(a.c, b.c), v);
};
// A coefficient to a rational power: exact only where its root is.
const coefficientPower = (c, e) => {
  if (qIsInt(e)) return qPow(c, e.n);
  const top = exactRoot(c.n, e.d);
  const bottom = exactRoot(c.d, e.d);
  if (top === null || bottom === null) return null;
  return qPow(Q(top, bottom), e.n);
};
const raised = (a, e) => {
  const c = coefficientPower(a.c, e);
  if (!c) return null;
  return monomial(c, Object.fromEntries(Object.entries(a.v).map(([letter, exponent]) => [letter, qMul(exponent, e)])));
};

/** The tree's value as { c: exact coefficient, v: { letter: exact exponent } }, or null. */
export const evaluateMonomial = (node) => {
  if (!isObject(node)) return null;
  if (node.t === 'num') return monomial(Q(node.v));
  if (node.t === 'var') return monomial(ONE, { [node.v]: ONE });
  if (node.t === 'neg') {
    const inner = evaluateMonomial(node.a);
    return inner && monomial(Q(-inner.c.n, inner.c.d), inner.v);
  }
  if (node.t === 'pow') {
    const inner = evaluateMonomial(node.a);
    return inner && raised(inner, node.e);
  }
  if (node.t === 'prod') {
    let value = monomial(ONE);
    for (const item of node.items) {
      const next = evaluateMonomial(item);
      if (!next) return null;
      value = times(value, next);
    }
    return value;
  }
  if (node.t === 'div') {
    const top = evaluateMonomial(node.a);
    const bottom = evaluateMonomial(node.b);
    if (!top || !bottom || bottom.c.n === 0) return null;
    return over(top, bottom);
  }
  return null;
};

/* ----------------------------------------------------------- writing */

/** x⁴, x⁻⁴, x^(2/3), x (an exponent of 1 left out). */
export const powerText = (letter, exponent) => {
  if (qEq(exponent, ONE)) return letter;
  if (qIsInt(exponent)) return `${letter}${superscript(exponent.n)}`;
  return `${letter}^(${qText(exponent)})`;
};
const sortedLetters = (v) => Object.keys(v).sort();
const lettersText = (v, positive = false) => sortedLetters(v)
  .map((letter) => powerText(letter, positive ? Q(Math.abs(v[letter].n), v[letter].d) : v[letter]))
  .join('');

/** "9x⁻⁴y⁶", "−3b²", "1". */
export const monomialText = (m) => {
  const letters = lettersText(m.v);
  const c = m.c;
  if (!letters) return qText(c);
  if (c.n === 1 && c.d === 1) return letters;
  if (c.n === -1 && c.d === 1) return `${MINUS}${letters}`;
  return c.d === 1 ? `${qText(c)}${letters}` : `(${qText(c)})${letters}`;
};

/** With positive exponents only: "9y⁶/x⁴", "b⁴/(ac)", "1/n⁸", "4r⁴/s⁶". */
export const positiveForm = (m) => {
  const up = Object.fromEntries(Object.entries(m.v).filter(([, exponent]) => exponent.n > 0));
  const down = Object.fromEntries(Object.entries(m.v).filter(([, exponent]) => exponent.n < 0));
  const sign = m.c.n < 0 ? MINUS : '';
  const topNumber = Math.abs(m.c.n);
  const bottomNumber = m.c.d;
  const topLetters = lettersText(up);
  const bottomLetters = lettersText(down, true);
  const top = `${topNumber === 1 && topLetters ? '' : topNumber}${topLetters}`;
  const bottomParts = `${bottomNumber === 1 ? '' : bottomNumber}${bottomLetters}`;
  if (!bottomParts) return `${sign}${top}`;
  const bracket = (bottomNumber !== 1 ? 1 : 0) + Object.keys(down).length > 1;
  return `${sign}${top}/${bracket ? `(${bottomParts})` : bottomParts}`;
};
export const hasNegativeExponent = (m) => Object.values(m.v).some((exponent) => exponent.n < 0);

/** The tree written back as text, in the item's own layout. */
export const expressionText = (node) => {
  const wrap = (inner, child) => (child.paren ? `(${inner})` : inner);
  if (node.t === 'num') return String(node.v);
  if (node.t === 'var') return node.v;
  if (node.t === 'neg') return wrap(`${MINUS}${expressionText(node.a)}`, node);
  if (node.t === 'pow') {
    const base = expressionText(node.a);
    const needs = node.a.t !== 'var' && node.a.t !== 'num' && !node.a.paren;
    const shown = needs ? `(${base})` : base;
    return wrap(qIsInt(node.e) ? `${shown}${superscript(node.e.n)}` : `${shown}^(${qText(node.e)})`, node);
  }
  if (node.t === 'prod') return wrap(node.items.map(expressionText).join(node.explicit ? ' · ' : ''), node);
  if (node.t === 'div') return wrap(`${expressionText(node.a)}${node.sign === '÷' ? ' ÷ ' : '/'}${expressionText(node.b)}`, node);
  return '';
};

/* ------------------------------------------------------------ the moves */

// Written in words, with no letter standing alone: a lesson's own answer can
// be one letter ("a"), and the guard reads that letter in a sibling's step as it.
export const MONOMIAL_WHY = Object.freeze({
  product: 'To multiply powers of the same base, keep the base and add the exponents. Numbers in front multiply.',
  quotient: 'To divide powers of the same base, keep the base and subtract the exponents. Numbers in front divide.',
  power: 'Raising a product or quotient to a power raises every factor, so each exponent is multiplied by the power.',
  rational: 'The denominator of a rational exponent names a root and the numerator names a power: take the root first.',
  negative: 'A negative exponent means the reciprocal. The simplified answer has no negative exponents, so those factors move to the denominator with positive exponents.',
});

const exponentSum = (values) => values.map((value, index) => (index === 0 ? qText(value) : value.n < 0 ? `${MINUS} ${qText(Q(-value.n, value.d))}` : `+ ${qText(value)}`)).join(' ');

/**
 * The moves that simplify the expression, each { show, why }, and its value.
 * One move for the operation at the top (and for a power or quotient inside
 * it), then, where an exponent is negative, the move that makes it positive.
 */
export const monomialSteps = (node) => {
  const value = evaluateMonomial(node);
  if (!value) return null;
  const steps = [];
  const describe = (current) => {
    if (current.t === 'neg') return describe(current.a);
    if (current.t === 'pow' && (current.a.t === 'prod' || current.a.t === 'div' || current.a.t === 'pow' || current.a.paren)) {
      const inner = evaluateMonomial(current.a);
      const result = evaluateMonomial(current);
      if (!inner || !result) return;
      const e = current.e;
      const coefficient = qIsInt(e) || inner.c.n === 1 ? '' : `${qText(inner.c)}^(${qText(e)}) = ${qText(result.c)}, `;
      const letters = sortedLetters(inner.v).map((letter) => `${letter}: ${qText(inner.v[letter])} · ${e.n < 0 ? `(${qText(e)})` : qText(e)} = ${qText(qMul(inner.v[letter], e))}`).join(', ');
      steps.push({
        show: `Raise every factor of ${math(expressionText(current))} to the power ${math(qText(e))}: ${math(`${coefficient}${letters}`)}. That gives ${math(monomialText(result))}.`,
        why: qIsInt(e) ? MONOMIAL_WHY.power : `${MONOMIAL_WHY.power} ${MONOMIAL_WHY.rational}`,
      });
      return;
    }
    if (current.t === 'prod') {
      const parts = current.items.map(evaluateMonomial);
      if (parts.some((part) => !part)) return;
      const result = evaluateMonomial(current);
      const letters = [...new Set(parts.flatMap((part) => Object.keys(part.v)))].sort();
      const sums = letters.map((letter) => {
        const exponents = parts.map((part) => part.v[letter]).filter(Boolean);
        return exponents.length > 1 ? `${letter}: ${exponentSum(exponents)} = ${qText(exponents.reduce(qAdd))}` : null;
      }).filter(Boolean).join(', ');
      steps.push({ show: sums
        ? `Add the exponents of each base in ${math(expressionText(current))}: ${math(sums)}. That gives ${math(monomialText(result))}.`
        : `Multiply the factors of ${math(expressionText(current))}. That gives ${math(monomialText(result))}.`, why: MONOMIAL_WHY.product });
      return;
    }
    if (current.t === 'div') {
      const top = evaluateMonomial(current.a);
      const bottom = evaluateMonomial(current.b);
      const result = evaluateMonomial(current);
      if (!top || !bottom || !result) return;
      const letters = [...new Set([...Object.keys(top.v), ...Object.keys(bottom.v)])].sort();
      const differences = letters.map((letter) => `${letter}: ${qText(top.v[letter] || Q(0))} ${MINUS} ${(bottom.v[letter] || Q(0)).n < 0 ? `(${qText(bottom.v[letter])})` : qText(bottom.v[letter] || Q(0))} = ${qText(result.v[letter] || Q(0))}`).join(', ');
      const numbers = qEq(top.c, ONE) && qEq(bottom.c, ONE) ? '' : `${qText(top.c)} ÷ ${qText(bottom.c)} = ${qText(result.c)}, `;
      steps.push({ show: `Divide the numbers and subtract the exponents of each base in ${math(expressionText(current))}: ${math(`${numbers}${differences}`)}. That gives ${math(monomialText(result))}.`, why: MONOMIAL_WHY.quotient });
    }
  };
  describe(node);
  if (!steps.length) return null;
  if (hasNegativeExponent(value)) {
    steps.push({ show: `${math(monomialText(value))} has negative exponents. Move those factors to the denominator with positive exponents: ${math(positiveForm(value))}.`, why: MONOMIAL_WHY.negative });
  }
  return { steps, value };
};

/* ---------------------------------------------------------- new numbers */

const LETTERS = Object.freeze(['m', 'p', 'k', 'r', 's', 't', 'u', 'w', 'v', 'g', 'h', 'd']);
const lettersIn = (node, found = new Set()) => {
  if (!isObject(node)) return found;
  if (node.t === 'var') found.add(node.v);
  [node.a, node.b, ...(node.items || [])].forEach((child) => lettersIn(child, found));
  return found;
};

/**
 * The tree with other numbers and other letters, the same shape: each
 * exponent keeps its sign and stays 1 where it is 1 (a fractional one keeps
 * its denominator), each number keeps its sign and stays 1 where it is 1,
 * and under a rational power of denominator q every exponent inside is a
 * multiple of q and every number a qth power, so the result is exact. Null
 * where the draw does not give an exact value.
 */
export const mutateMonomial = (node, seed, { avoidLetters = [] } = {}) => {
  const own = [...lettersIn(node)];
  const pool = LETTERS.filter((letter) => !own.includes(letter) && !avoidLetters.includes(letter));
  const start = Math.abs(Math.floor(Number(seed) || 0)) % Math.max(1, pool.length);
  const rename = Object.fromEntries(own.sort().map((letter, index) => [letter, pool[(start + index) % pool.length] || letter]));
  let counter = 0;
  const draw = (options) => {
    counter += 1;
    const index = (Math.floor(Number(seed) || 0) * 5 + counter * 11 + Math.floor((Number(seed) || 0) / 7)) % options.length;
    return options[(index + options.length) % options.length];
  };
  const walk = (current, q) => {
    if (current.t === 'num') {
      if (current.v === 1) return { ...current };
      if (q > 1) return { ...current, v: draw([2, 3]) ** q };
      return { ...current, v: draw([2, 3, 4, 5, 6, 8, 9, 10, 12]) };
    }
    if (current.t === 'var') return { ...current, v: rename[current.v] || current.v };
    if (current.t === 'neg') return { ...current, a: walk(current.a, q) };
    if (current.t === 'pow') {
      const e = current.e;
      let next;
      const onGroup = current.a.t !== 'var' && current.a.t !== 'num';
      if (qIsInt(e)) {
        const magnitude = Math.abs(e.n);
        // An exponent of 1 written out (c⁻¹) may become another; one left unwritten (x) stays.
        if (magnitude === 1 && (onGroup || q > 1)) next = e;
        else if (magnitude === 1) next = Q(Math.sign(e.n) * draw([1, 2, 3]), 1);
        else if (q > 1) next = Q(Math.sign(e.n) * q * draw([1, 2, 3]), 1);
        // A power on a whole group stays small (2 or 3), so its numbers do.
        else if (onGroup) next = Q(Math.sign(e.n) * draw([2, 3]), 1);
        else next = Q(Math.sign(e.n) * draw([2, 3, 4, 5, 6, 7, 8, 9]), 1);
      } else {
        // A fraction below 1 stays below 1, one above it stays above (up to twice the denominator).
        const below = Math.abs(e.n) < e.d;
        const choices = Array.from({ length: below ? e.d - 1 : e.d }, (_, index) => (below ? index + 1 : e.d + index + 1)).filter((value) => value % e.d !== 0);
        next = Q(Math.sign(e.n) * draw(choices), e.d);
      }
      // Inside a power whose denominator is not 1, the numbers below it must be exact roots.
      const inner = walk(current.a, qIsInt(next) ? q : q * next.d);
      return { ...current, a: inner, e: next };
    }
    if (current.t === 'prod') return { ...current, items: current.items.map((item) => walk(item, q)) };
    if (current.t === 'div') return { ...current, a: walk(current.a, q), b: walk(current.b, q) };
    return { ...current };
  };
  const mutated = walk(node, 1);
  const value = evaluateMonomial(mutated);
  // Classroom numbers: no coefficient past 200, no exponent past 30.
  if (!value || Math.abs(value.c.n) > 200 || value.c.d > 200) return null;
  if (Object.values(value.v).some((exponent) => Math.abs(exponent.n) > 30)) return null;
  return mutated;
};

/**
 * Whether the expression holds only for positive values of its letters: a
 * rational power with an even denominator applied to something with a letter
 * in it, or a value left with such an exponent. (x⁴)^(1/4) is |x|, so the
 * exponent rules give x only when x > 0.
 */
export const needsPositiveVariables = (node) => {
  const lettered = (current) => isObject(current) && (current.t === 'var' || [current.a, current.b, ...(current.items || [])].some(lettered));
  const walk = (current) => {
    if (!isObject(current)) return false;
    if (current.t === 'pow' && current.e.d % 2 === 0 && lettered(current.a)) return true;
    return [current.a, current.b, ...(current.items || [])].some(walk);
  };
  if (walk(node)) return true;
  const value = evaluateMonomial(node);
  return Boolean(value) && Object.values(value.v).some((exponent) => exponent.d % 2 === 0);
};

/** The same kind of result: the same letters' signs in the same places, a whole coefficient where the item's is. */
export const sameKindOfResult = (item, sibling, letterMap = null) => {
  if (!item || !sibling) return false;
  if (qIsInt(item.c) !== qIsInt(sibling.c)) return false;
  const signs = (m) => Object.values(m.v).map((exponent) => Math.sign(exponent.n)).sort().join(',');
  const wholes = (m) => Object.values(m.v).map((exponent) => qIsInt(exponent)).sort().join(',');
  if (letterMap) return signs(item) === signs(sibling) && wholes(item) === wholes(sibling);
  return signs(item) === signs(sibling) && wholes(item) === wholes(sibling);
};
