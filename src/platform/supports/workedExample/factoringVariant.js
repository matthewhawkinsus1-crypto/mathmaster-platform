/*
 * "PRACTISE ONE LIKE THIS" FOR FACTORING (numericVariant.js's fourth kind):
 * THE ITEM ITSELF, WITH NEW NUMBERS.
 *
 *   buildFactoringVariant(question, { seed }) → { prompt, steps, answer, fields, kind } | null
 *   readFactoringItem(question)               → the item's factoring work, or null
 *   factorByMethod(polynomial)                → how a student factors it, or null
 *
 * Algebra II Factoring Polynomials (and its Honors twin) had a practice for
 * 2 of its 27 Classwork and Practice items: a student who missed a
 * factoring item's last try got the worked solution and nothing to try again.
 * Its factoring items have a shape a variant can keep exactly: a polynomial
 * factored over the integers by the methods the lesson teaches,
 *
 *   a common factor            12xy + 24xy² − 30x²y⁴ = 6xy(2 + 4y − 5xy³)
 *   a trinomial                x² − 10x + 16 = (x − 2)(x − 8), 3x² + 26x + 35 = (3x + 5)(x + 7)
 *   a perfect square           49x² + 28x + 4 = (7x + 2)²
 *   a difference of squares    25a² − 36b² = (5a + 6b)(5a − 6b)
 *   a sum or difference of cubes   8c³ − g³ = (2c − g)(4c² + 2cg + g²)
 *   four terms by grouping     x³ + 5x² − 2x − 10 = (x + 5)(x² − 2)
 *
 * and any of these after another, until every factor is prime ("factor
 * completely": y⁴ − 625 = (y² + 25)(y + 5)(y − 5)).
 *
 * WHERE THE WORK IS READ. A box is read only when the item grades it as a
 * factoring (gradingMode factoredForm) and names the polynomial it factors:
 * in its label ("x² − 10x + 16 =", "Factored form of 15a − 3ab + 4b − 20"),
 * or, when the item has one such box and its label is only words ("Factored
 * form"), in the prompt's one piece of mathematics with the key's value. Its
 * key must be exactly what the methods above give (the platform's own
 * factored-form comparator decides), so the key confirms the reading. Two
 * other boxes are read beside one factoring box: the common factor ("GCF of
 * the three terms") and a group of a grouping ("First group: x³ + 5x² ="),
 * each confirmed by its key. Every typed box must be read; a choice is left
 * out (fp-cw-7's "Is 9x² − 12x + 16 a perfect square trinomial?" names the
 * item's own polynomial, and its options are the item's reasons).
 *
 * NOT VARIED: a word problem (a prompt with a number outside its
 * mathematics), a family slot, a box this cannot read (a step written as a
 * partial factorization, "a = …", a substitution u = x³), a polynomial the
 * methods above do not finish (x⁴ + 64), and four terms that must be
 * rearranged before they group.
 *
 * THE SAME SHAPE AND METHOD, NEVER EASIER. The variant is built from the
 * item's own factoring with new numbers: every factor keeps its terms,
 * letters, exponents and signs, a 1 stays 1, and every other number keeps its
 * sign and moves at most one down or two up (never below 2), the sizes adding
 * up to at least the item's. What a method ties together stays tied (the two
 * factors of a difference of squares, a cube's trinomial, a square). The new
 * polynomial is then factored afresh by the same methods, and must take
 * exactly the item's path (the same method at every step, the same prime
 * factors in the end): x² − 2 stays prime, a common factor appears only where
 * the item's does, a trinomial has at least as many factor pairs to try, and
 * factors that differ in the item still differ (fp-p-13's (x + 5)(x + 3)(x − 3)
 * never becomes (x + 4)²(x − 4)).
 *
 * NEVER A GIVE-AWAY. No answer equals one of the item's keys, no piece of
 * mathematics the variant writes has a key's value, and the guard every
 * family sibling passes (similarExampleIsSafe) runs too.
 *
 * VERIFIED. Each box's key is graded by the item's own box (its factored-form
 * comparator, gradeMultiAnswerResponse): the key right, the polynomial left
 * expanded wrong, a factor off by one wrong, and the item's own key wrong.
 * The practice checks the student's answer with that same box (`fields`), so
 * a polynomial retyped unfactored is "not yet", as it is on the item.
 *
 * THE ITEM'S METHOD. The steps name every move: the common factor of each
 * term, the two numbers whose product and sum are the trinomial's (split into
 * four terms when the leading coefficient is not 1), the squares or cubes,
 * each group's common factor, and every factor left prime. Every "=" in them
 * is true (tests/platform/practiceLikeThisFactoring.test.mjs reads each one).
 *
 * NOTHING HERE IS RECORDED. It returns values, like numericVariant.js.
 */
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { isFamilyBackedQuestion } from '../../../../functions/shared/questionFamilySlot.mjs';
import { parsePolynomial, samePolynomial } from '../../../../functions/shared/algebraicForm.mjs';
import { sameFactoredPolynomialExpression } from '../../../../functions/shared/factoredPolynomialExpressionEquivalence.mjs';
import { gradeMultiAnswerResponse } from '../../../../functions/shared/ordinaryResponseGrading.mjs';
// The item's factored-form boxes grade with the form-specific comparators.
import '../../../../functions/shared/formSpecificFieldGrading.mjs';
import { questionAnswerValues } from '../hints/questionHints.js';
import { similarExampleIsSafe } from './similarProblem.js';

export const FACTORING_VARIANT_KIND = 'factoring';

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

/* ------------------------------------------------------ seeded randomness */

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const randomFrom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const integer = (random, low, high) => low + Math.floor(random() * (high - low + 1));

/* ------------------------------------------------------------- monomials */

// A term is { c, powers: { x: 2, y: 1 } }: a whole-number coefficient and the
// exponent of each letter. A polynomial is an array of terms, in the order
// it is written.
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const cleanPowers = (powers) => Object.fromEntries(Object.entries(powers).filter(([, power]) => power > 0).sort(([a], [b]) => (a < b ? -1 : 1)));
const keyOf = (powers) => Object.entries(cleanPowers(powers)).map(([letter, power]) => `${letter}${power}`).join('');
const degreeOf = (powers) => Object.values(powers).reduce((sum, power) => sum + power, 0);
const term = (c, powers = {}) => ({ c, powers: cleanPowers(powers) });
const times = (left, right) => {
  const powers = { ...left.powers };
  Object.entries(right.powers).forEach(([letter, power]) => { powers[letter] = (powers[letter] || 0) + power; });
  return term(left.c * right.c, powers);
};
const negateTerm = (value) => term(-value.c, value.powers);
const negatePoly = (terms) => terms.map(negateTerm);
const sameMonomial = (left, right) => keyOf(left.powers) === keyOf(right.powers);
/** left ÷ right for monomials (right divides left), or null. */
const dividedBy = (left, right) => {
  if (!right.c || left.c % right.c !== 0) return null;
  const powers = { ...left.powers };
  for (const [letter, power] of Object.entries(right.powers)) {
    if ((powers[letter] || 0) < power) return null;
    powers[letter] -= power;
  }
  return term(left.c / right.c, powers);
};
const isUnit = (value) => Math.abs(value.c) === 1 && !keyOf(value.powers);
/** The root of a monomial (index 2 or 3), or null: (7x)² for 49x², (2c)³ for 8c³. */
const rootOf = (value, index) => {
  const size = Math.round(Math.abs(value.c) ** (1 / index));
  if (size ** index !== Math.abs(value.c)) return null;
  if (index % 2 === 0 && value.c < 0) return null;
  if (Object.values(value.powers).some((power) => power % index !== 0)) return null;
  return term(Math.sign(value.c) * size, Object.fromEntries(Object.entries(value.powers).map(([letter, power]) => [letter, power / index])));
};
const powerOf = (value, index) => {
  let out = term(1);
  for (let step = 0; step < index; step += 1) out = times(out, value);
  return out;
};

/** The terms combined: like terms added, zero terms dropped, the first appearance's order kept. */
const combineTerms = (terms) => {
  const out = new Map();
  terms.forEach((entry) => {
    const key = keyOf(entry.powers);
    out.set(key, term((out.get(key)?.c || 0) + entry.c, entry.powers));
  });
  return [...out.values()].filter((entry) => entry.c !== 0);
};
const productOf = (left, right) => combineTerms(left.flatMap((a) => right.map((b) => times(a, b))));
const scaled = (terms, factor) => terms.map((entry) => times(factor, entry));

/** Standard order: the highest degree first; among equal degrees, alphabetical by letter, higher powers first. */
const ordered = (terms) => [...terms].sort((a, b) => {
  const degree = degreeOf(b.powers) - degreeOf(a.powers);
  if (degree) return degree;
  for (const letter of LETTERS) {
    const difference = (b.powers[letter] || 0) - (a.powers[letter] || 0);
    if (difference) return difference;
  }
  return 0;
});

/** The common factor of the terms: the gcd of the numbers and each letter's smallest exponent, positive. */
const commonFactorOf = (terms) => {
  const c = terms.reduce((g, entry) => gcd(g, entry.c), 0) || 1;
  const letters = Object.keys(terms[0]?.powers || {}).filter((letter) => terms.every((entry) => (entry.powers[letter] || 0) > 0));
  return term(c, Object.fromEntries(letters.map((letter) => [letter, Math.min(...terms.map((entry) => entry.powers[letter]))])));
};

/* --------------------------------------------------------------- writing */

const lettersLatex = (powers) => Object.entries(cleanPowers(powers))
  .map(([letter, power]) => (power === 1 ? letter : `${letter}^${power > 9 ? `{${power}}` : power}`)).join('');
const lettersTyped = (powers) => Object.entries(cleanPowers(powers))
  .map(([letter, power]) => (power === 1 ? letter : `${letter}^${power}`)).join('');
const sizeLatex = (value, letters = lettersLatex) => {
  const shown = letters(value.powers);
  const size = Math.abs(value.c);
  return shown ? `${size === 1 ? '' : size}${shown}` : String(size);
};
const termLatex = (value) => `${value.c < 0 ? '-' : ''}${sizeLatex(value)}`;
/** A term as a factor after another: a negative one in brackets. */
const factorLatex = (value) => (value.c < 0 ? `(${termLatex(value)})` : termLatex(value));
/** Terms in the order given, "4y^2 + 2y - 3". */
const polyLatex = (terms) => (terms.length ? terms.map((entry, index) => (index === 0
  ? termLatex(entry)
  : `${entry.c < 0 ? ' - ' : ' + '}${sizeLatex(entry)}`)).join('') : '0');
/** As a student types it into a box: "-4y^3-2y^2+3y". */
const polyTyped = (terms) => (terms.length ? terms.map((entry, index) => `${entry.c < 0 ? '-' : index === 0 ? '' : '+'}${sizeLatex(entry, lettersTyped)}`).join('') : '0');

/* ------------------------------------------------- reading the item's math */

const SUPERSCRIPT_DIGITS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/** Math as written (Unicode, LaTeX or typed) → "x^2-10x+16", or null for anything else. */
const normalizeMath = (raw) => {
  const value = text(raw)
    .replace(/^\$|\$$/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\^\{(\d+)\}/g, '^$1')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((digit) => SUPERSCRIPT_DIGITS[digit]).join('')}`)
    .replace(/[−–]/g, '-')
    .replace(/\s+/g, '');
  return /^[A-Za-z0-9^+\-()]+$/.test(value) ? value : null;
};

/** One monomial without its sign ("12xy^2", "x", "16"), or null. */
const readMonomial = (raw) => {
  const match = /^(\d*)((?:[A-Za-z](?:\^\d+)?)*)$/.exec(raw);
  if (!match || (!match[1] && !match[2])) return null;
  const c = match[1] ? Number(match[1]) : 1;
  if (!Number.isSafeInteger(c) || c < 1) return null;
  const powers = {};
  for (const [, letter, power] of match[2].matchAll(/([A-Za-z])(?:\^(\d+))?/g)) {
    const exponent = power ? Number(power) : 1;
    if (exponent < 1) return null;
    powers[letter] = (powers[letter] || 0) + exponent;
  }
  return term(c, powers);
};

/** "x^2-10x+16" → its terms in order, or null (a bracket, a fraction, two like terms). */
const readTerms = (raw) => {
  const value = normalizeMath(raw);
  if (!value || /[()]/.test(value)) return null;
  const pieces = value.match(/[+-]?[^+-]+/g) || [];
  if (pieces.join('') !== value) return null;
  const terms = [];
  for (const piece of pieces) {
    const sign = piece.startsWith('-') ? -1 : 1;
    const monomial = readMonomial(piece.replace(/^[+-]/, ''));
    if (!monomial) return null;
    terms.push(term(sign * monomial.c, monomial.powers));
  }
  const keys = terms.map((entry) => keyOf(entry.powers));
  return terms.length && new Set(keys).size === keys.length ? terms : null;
};

/** The platform's own reading of a polynomial (algebraicForm.mjs), as written by a key or by this module. */
const platformValue = (raw) => {
  const value = normalizeMath(raw);
  if (!value) return null;
  try {
    return parsePolynomial(value);
  } catch {
    return null;
  }
};
const valueOfTerms = (terms) => platformValue(polyTyped(terms));

/* ------------------------------------------------- factoring by method */

/*
 * How a student factors a polynomial over the integers, as a tree of moves:
 *
 *   { method: 'common', factor, terms, inner }            the common factor taken out
 *   { method: 'squares', A, B, terms, plus, minus }       A² − B² = (A + B)(A − B)
 *   { method: 'cubes', A, B, sign, terms, binomial, trinomial }   A³ ± B³
 *   { method: 'square', A, B, sign, terms, base }         A² ± 2AB + B² = (A ± B)²
 *   { method: 'trinomial', terms, U, V, a, b, c, m, n, first, second }   (pU + qV)(rU + sV)
 *   { method: 'grouping', terms, g1, g2, binomial, other, flipped }     g1·B + g2·B = B(g1 + g2)
 *   { method: 'prime', terms }                            no method above factors it
 *
 * Each move's own factors are factored in turn. A sum of squares, and a
 * quadratic with no whole-number factor pair, are prime. Four terms are
 * grouped as written (the first two, the last two). Five or more terms are
 * not read (null).
 */
const MAX_DEPTH = 6;

const factorPairs = (value) => {
  const pairs = [];
  for (let d = 1; d * d <= Math.abs(value); d += 1) if (value % d === 0) pairs.push([d, value / d]);
  return pairs;
};

/** a·U² + b·UV + c·V² → (pU + qV)(rU + sV), whole numbers, or null. */
const splitTrinomial = (a, b, c) => {
  for (let p = 1; p <= Math.abs(a); p += 1) {
    if (a % p !== 0) continue;
    const r = a / p;
    for (let size = 1; size <= Math.abs(c); size += 1) {
      if (c % size !== 0) continue;
      for (const q of [size, -size]) {
        const s = c / q;
        if (p * s + q * r === b) return { p, q, r, s };
      }
    }
  }
  return null;
};

export const factorByMethod = (terms, depth = 0) => {
  if (!terms?.length || depth > MAX_DEPTH) return null;
  if (terms.length === 1) return { method: 'prime', terms };
  // A common factor first (the gcd of the numbers, each shared letter's smallest exponent).
  const factor = commonFactorOf(terms);
  if (!isUnit(factor)) {
    const inner = factorByMethod(terms.map((entry) => dividedBy(entry, factor)), depth + 1);
    return inner ? { method: 'common', factor, terms, inner } : null;
  }
  if (terms.length === 2) {
    const [first, second] = terms;
    // A difference of squares (either term may be the negative one), before cubes: 64x⁶ − y⁶.
    if (Math.sign(first.c) !== Math.sign(second.c)) {
      const [plusTerm, minusTerm] = first.c > 0 ? [first, second] : [second, first];
      const A = rootOf(plusTerm, 2);
      const B = rootOf(negateTerm(minusTerm), 2);
      if (A && B) {
        // 256 − n⁴ is (16 + n²)(16 − n²); −9 + x² is (x + 3)(x − 3).
        const plus = factorByMethod([A, B], depth + 1);
        const minus = factorByMethod([A, negateTerm(B)], depth + 1);
        return plus && minus ? { method: 'squares', A, B, written: first.c > 0 ? 'AB' : 'BA', terms, plus, minus } : null;
      }
    }
    const A = rootOf(first, 3);
    const B = rootOf(term(Math.abs(second.c), second.powers), 3);
    if (A && A.c > 0 && B && first.c > 0) {
      const sign = Math.sign(second.c);
      const binomial = factorByMethod([A, term(sign * B.c, B.powers)], depth + 1);
      const trinomial = factorByMethod([powerOf(A, 2), term(-sign * times(A, B).c, times(A, B).powers), powerOf(B, 2)], depth + 1);
      return binomial && trinomial ? { method: 'cubes', A, B, sign, terms, binomial, trinomial } : null;
    }
    return { method: 'prime', terms };
  }
  if (terms.length === 3) {
    const [t1, t2, t3] = terms;
    const U = rootOf(term(1, t1.powers), 2);
    const V = rootOf(term(1, t3.powers), 2);
    if (U && V && sameMonomial(t2, times(U, V)) && keyOf(U.powers) !== keyOf(V.powers)) {
      // A perfect square: A², B² positive, the middle term ±2AB.
      const A = rootOf(t1, 2);
      const B = rootOf(t3, 2);
      if (A && B && Math.abs(t2.c) === 2 * A.c * B.c) {
        const sign = Math.sign(t2.c);
        const base = factorByMethod([A, term(sign * B.c, B.powers)], depth + 1);
        return base ? { method: 'square', A, B, sign, terms, base } : null;
      }
      const split = splitTrinomial(t1.c, t2.c, t3.c);
      if (split) {
        const { p, q, r, s } = split;
        const first = factorByMethod([term(p, U.powers), term(q, V.powers)], depth + 1);
        const second = factorByMethod([term(r, U.powers), term(s, V.powers)], depth + 1);
        // The two numbers of the split: m + n = b, m·n = a·c.
        return first && second ? { method: 'trinomial', terms, U, V, a: t1.c, b: t2.c, c: t3.c, m: p * s, n: q * r, split, first, second } : null;
      }
    }
    return { method: 'prime', terms };
  }
  if (terms.length === 4) {
    // The first two and the last two, each group's common factor taking its first term's sign.
    const groupOf = (pair) => {
      const positive = commonFactorOf(pair);
      const common = pair[0].c < 0 ? negateTerm(positive) : positive;
      return { common, binomial: pair.map((entry) => dividedBy(entry, common)) };
    };
    const one = groupOf(terms.slice(0, 2));
    const two = groupOf(terms.slice(2));
    const same = samePolynomial(valueOfTerms(one.binomial), valueOfTerms(two.binomial), 1e-9);
    const opposite = !same && samePolynomial(valueOfTerms(one.binomial), valueOfTerms(negatePoly(two.binomial)), 1e-9);
    if (!same && !opposite) return null;
    // Opposite binomials: the first group's is rewritten (5 − b = −1(b − 5)).
    const g1 = opposite ? negateTerm(one.common) : one.common;
    const g2 = two.common;
    const binomial = factorByMethod(two.binomial, depth + 1);
    const other = factorByMethod([g1, g2], depth + 1);
    return binomial && other ? { method: 'grouping', terms, groups: [one, two], flipped: opposite, g1, g2, binomial, other } : null;
  }
  return null;
};

/** The prime factors a tree ends with: { scalar, factors: [terms] } (a monomial factor's number in scalar, its letters as a factor). */
const finalFactors = (node) => {
  switch (node.method) {
    case 'common': {
      const inner = finalFactors(node.inner);
      const letters = keyOf(node.factor.powers) ? [[term(1, node.factor.powers)]] : [];
      return { scalar: node.factor.c * inner.scalar, factors: [...letters, ...inner.factors] };
    }
    case 'squares': case 'cubes': case 'trinomial': case 'grouping': {
      // A trinomial split into four terms ends with its common binomial first, as its last step writes it.
      const split = node.method === 'trinomial' && node.a !== 1;
      const parts = node.method === 'squares' ? [node.plus, node.minus]
        : node.method === 'cubes' ? [node.binomial, node.trinomial]
          : node.method === 'trinomial' ? (split ? [node.second, node.first] : [node.first, node.second]) : [node.binomial, node.other];
      const read = parts.map(finalFactors);
      return { scalar: read.reduce((product, entry) => product * entry.scalar, 1), factors: read.flatMap((entry) => entry.factors) };
    }
    case 'square': {
      const base = finalFactors(node.base);
      return { scalar: base.scalar ** 2, factors: [...base.factors, ...base.factors] };
    }
    default:
      return { scalar: 1, factors: [node.terms] };
  }
};

/** A factor in brackets, or alone when it is one letter. */
const bracket = (terms, typed = false) => {
  const written = typed ? polyTyped(terms) : polyLatex(terms);
  return terms.length === 1 && terms[0].c === 1 ? written : `(${written})`;
};

/** The finished factorization, written: "3x^2(2x + y)(4x^2 - 2xy + y^2)", "(y^2 + 25)(y + 5)(y - 5)", "(7x + 2)^2". */
const factoredWriting = (node, { typed = false } = {}) => {
  const { scalar, factors } = finalFactors(node);
  // Letters of a common factor go in front, then the brackets; a repeated bracket is a square.
  const monomials = factors.filter((entry) => entry.length === 1);
  const brackets = factors.filter((entry) => entry.length > 1);
  const front = term(scalar, monomials.reduce((powers, entry) => {
    Object.entries(entry[0].powers).forEach(([letter, power]) => { powers[letter] = (powers[letter] || 0) + power; });
    return powers;
  }, {}));
  const written = [];
  const seen = new Map();
  brackets.forEach((entry) => {
    const key = polyTyped(entry);
    seen.set(key, { entry, count: (seen.get(key)?.count || 0) + 1 });
  });
  [...seen.values()].forEach(({ entry, count }) => written.push(`${bracket(entry, typed)}${count > 1 ? `^${count}` : ''}`));
  const lead = isUnit(front) ? (front.c < 0 ? '-' : '') : (typed ? polyTyped([front]) : termLatex(front));
  return `${lead}${written.join('')}`;
};

/** The shape of a factoring: the methods, and every polynomial's letters, exponents and signs — never its numbers. */
const shapeOf = (node) => {
  const signs = (terms) => terms.map((entry) => `${entry.c < 0 ? '-' : '+'}${keyOf(entry.powers) || '1'}${Math.abs(entry.c) === 1 ? '·1' : ''}`).join('');
  switch (node.method) {
    case 'common': return `common[${keyOf(node.factor.powers)}${node.factor.c === 1 ? '·1' : ''}](${shapeOf(node.inner)})`;
    case 'squares': return `squares[${node.written}](${shapeOf(node.plus)},${shapeOf(node.minus)})`;
    case 'cubes': return `cubes[${node.sign}](${shapeOf(node.binomial)},${shapeOf(node.trinomial)})`;
    case 'square': return `square[${node.sign}](${shapeOf(node.base)})`;
    // The two factors of a trinomial in either order.
    case 'trinomial': return `trinomial[${Math.abs(node.a) === 1 ? 'a1' : 'a'}](${[shapeOf(node.first), shapeOf(node.second)].sort().join(',')})`;
    case 'grouping': return `grouping[${node.flipped ? 'flip' : 'same'}](${shapeOf(node.binomial)},${shapeOf(node.other)})`;
    default: return `prime(${signs(node.terms)})`;
  }
};

/* ------------------------------------------------------- reading the item */

const mathPieces = (prompt) => (text(prompt).match(/\$[^$]+\$/g) || []).map((piece) => piece.slice(1, -1));
const outsideMath = (prompt) => text(prompt).replace(/\$[^$]+\$/g, ' ');
const isChoiceField = (field) => /choice|select|dropdown|radio/i.test(String(field?.type || field?.inputType || '')) || list(field?.options).length > 0;
const hasMath = (label) => /\d|[A-Za-z]\s*[\^²³⁴⁵⁶⁷⁸⁹]|[A-Za-z]\s*[+\-−]|[+\-−]\s*[A-Za-z\d]/.test(label);

// "x² − 10x + 16 =", "Factored form of 15a − 3ab + 4b − 20", "First group: x³ + 5x² =".
const FACTOR_LEAD = /^(?:(?:completely\s+)?factored\s+form(?:\s+of)?|factor(?:\s+completely)?)\s*:?\s*/i;
const GROUP_LABEL = /^(first|second)\s+group\s*:\s*(.+?)\s*=?\s*$/i;
const GCF_LABEL = /^(?:the\s+)?(?:gcf|greatest\s+common\s+factor)\b/i;

/** The polynomial a label names, as terms, or null. */
const labelPolynomial = (label) => {
  const math = text(label).replace(FACTOR_LEAD, '').replace(/\s*=\s*$/, '');
  return hasMath(math) ? readTerms(math) : null;
};

/** A factored key as the platform reads it, and the polynomial it is worth. */
const keyValue = (key) => {
  const value = platformValue(key);
  return value && value.size ? value : null;
};

/**
 * The item as factoring work: { boxes: [{ role, field, terms?, tree?, group? }] }
 * in the order of its typed boxes, or null. `role` is 'factor', 'gcf' or 'group'.
 */
export const readFactoringItem = (question) => {
  if (!question || typeof question !== 'object' || question.type !== 'multiAnswer') return null;
  if (isFamilyBackedQuestion(question) || question.familyDelivery || question.generator || question.context) return null;
  const prompt = text(question.prompt);
  // A story's numbers (prices, a classmate's work) keep it the item's.
  if (/\d/.test(outsideMath(prompt))) return null;
  const fields = list(question.answerFields).filter((field) => text(field?.id));
  const typed = fields.filter((field) => !isChoiceField(field));
  if (!typed.length || typed.length > 4) return null;

  const factorFields = typed.filter((field) => field.gradingMode === 'factoredForm' && !GROUP_LABEL.test(text(field.label)));
  const boxes = [];
  for (const field of typed) {
    if (typeof field.answer !== 'string' || !text(field.answer)) return null;
    const label = text(field.label);
    const group = GROUP_LABEL.exec(label);
    if (group && field.gradingMode === 'factoredForm') {
      const terms = readTerms(group[2]);
      if (!terms || terms.length !== 2) return null;
      boxes.push({ role: 'group', which: group[1].toLowerCase() === 'first' ? 0 : 1, field, terms });
      continue;
    }
    if (GCF_LABEL.test(label) && field.gradingMode !== 'factoredForm') {
      boxes.push({ role: 'gcf', field });
      continue;
    }
    if (field.gradingMode !== 'factoredForm') return null;
    let terms = labelPolynomial(label);
    // "Factored form": the prompt's one piece of mathematics with the key's value.
    if (!terms && !hasMath(label.replace(FACTOR_LEAD, '')) && factorFields.length === 1) {
      const worth = keyValue(field.answer);
      const matching = mathPieces(prompt).map(readTerms).filter((candidate) => candidate && worth && samePolynomial(valueOfTerms(candidate), worth, 1e-9));
      if (matching.length === 1) [terms] = matching;
    }
    if (!terms) return null;
    // The key confirms the reading: the methods give exactly the key's factoring.
    const tree = factorByMethod(terms);
    if (!tree || tree.method === 'prime') return null;
    if (!sameFactoredPolynomialExpression(factoredWriting(tree, { typed: true }), field.answer)) return null;
    boxes.push({ role: 'factor', field, terms, tree });
  }
  const factors = boxes.filter((box) => box.role === 'factor');
  if (!factors.length) return null;
  // A common-factor box or a group box speaks about the item's one factoring.
  const helpers = boxes.filter((box) => box.role !== 'factor');
  if (helpers.length) {
    if (factors.length !== 1) return null;
    const [{ tree }] = factors;
    for (const box of helpers) {
      if (box.role === 'gcf') {
        if (tree.method !== 'common' || !samePolynomial(platformValue(box.field.answer), valueOfTerms([tree.factor]), 1e-9)) return null;
      } else {
        const grouping = tree.method === 'grouping' ? tree : tree.method === 'common' && tree.inner.method === 'grouping' ? tree.inner : null;
        if (!grouping || tree !== grouping) return null;
        const own = grouping.terms.slice(box.which * 2, box.which * 2 + 2);
        if (!samePolynomial(valueOfTerms(own), valueOfTerms(box.terms), 1e-9)) return null;
        const { common, binomial } = grouping.groups[box.which];
        if (!sameFactoredPolynomialExpression(`${polyTyped([common])}(${polyTyped(binomial)})`, box.field.answer)) return null;
      }
    }
    if (new Set(helpers.map((box) => `${box.role}${box.which ?? ''}`)).size !== helpers.length) return null;
  }
  return { boxes };
};

/* ------------------------------------------------- the item with new numbers */

/*
 * The item's factoring rebuilt with new numbers, bottom up: { terms, A, B }.
 * `draw` gives each number its new value. What a move ties together is built
 * from the same new numbers: both factors of a difference of squares from one
 * A and one B (and A and B from the next difference of squares down, when
 * A − B is one), a cube's binomial and trinomial from one A and one B, a
 * square from its base; the factors of a trinomial or a grouping are rebuilt
 * on their own and multiplied. Null when a move's factors are tied in a way
 * this does not rebuild.
 */
const rebuild = (node, draw) => {
  const atom = (value) => term(draw(value.c), value.powers);
  switch (node.method) {
    case 'prime':
      return { terms: node.terms.map(atom) };
    case 'common': {
      const inner = rebuild(node.inner, draw);
      return inner && { terms: scaled(inner.terms, atom(node.factor)) };
    }
    case 'squares': {
      if (node.plus.method !== 'prime') return null;
      let A;
      let B;
      if (node.minus.method === 'squares') {
        const minus = rebuild(node.minus, draw);
        if (!minus) return null;
        A = powerOf(minus.A, 2);
        B = powerOf(minus.B, 2);
      } else if (node.minus.method === 'prime') {
        A = atom(node.A);
        B = atom(node.B);
      } else return null;
      const square = powerOf(A, 2);
      const other = negateTerm(powerOf(B, 2));
      return { terms: node.written === 'AB' ? [square, other] : [other, square], A, B };
    }
    case 'cubes': {
      if (node.binomial.method !== 'prime' || node.trinomial.method !== 'prime') return null;
      const A = atom(node.A);
      const B = atom(node.B);
      const cube = powerOf(B, 3);
      return { terms: [powerOf(A, 3), term(node.sign * cube.c, cube.powers)], A, B };
    }
    case 'square': {
      if (node.base.method !== 'prime') return null;
      const A = atom(node.A);
      const B = atom(node.B);
      return { terms: [powerOf(A, 2), times(term(2 * node.sign), times(A, B)), powerOf(B, 2)], A, B };
    }
    case 'trinomial': case 'grouping': {
      const [left, right] = node.method === 'trinomial' ? [node.first, node.second] : [node.binomial, node.other];
      const one = rebuild(left, draw);
      const two = one && rebuild(right, draw);
      if (!two) return null;
      // The product, written in the item's order of its terms.
      const product = productOf(one.terms, two.terms);
      const inOrder = node.terms.map((own) => product.find((entry) => sameMonomial(entry, own)));
      return inOrder.every(Boolean) && product.length === node.terms.length ? { terms: inOrder } : null;
    }
    default:
      return null;
  }
};

/** Every node of a tree, depth first. */
const CHILDREN = ['inner', 'plus', 'minus', 'binomial', 'trinomial', 'base', 'first', 'second', 'other'];
const nodesOf = (node) => [node, ...CHILDREN.filter((key) => node[key]?.method).flatMap((key) => nodesOf(node[key]))];

/* ------------------------------------------------------------ the steps */

/** "x^2", "25^2", "(7x)^2", "(y^2)^2": a monomial raised to a power. */
const powerLatex = (value, index = 2) => {
  const letters = Object.entries(value.powers);
  const bare = value.c > 0 && (!letters.length || (value.c === 1 && letters.length === 1 && letters[0][1] === 1));
  return `${bare ? termLatex(value) : `(${termLatex(value)})`}^${index}`;
};
const productText = (left, right) => `${termLatex(left)} \\cdot ${factorLatex(right)}`;
const signed = (value) => (value < 0 ? `(${value})` : String(value));

/** The worked steps of one factoring, in the order a student works it. */
const stepsOf = (node, steps = []) => {
  const whole = polyLatex(node.terms);
  switch (node.method) {
    case 'common': {
      const quotients = node.terms.map((entry) => dividedBy(entry, node.factor));
      const each = node.terms.map((entry, index) => `$${termLatex(entry)} = ${productText(node.factor, quotients[index])}$`);
      steps.push(`The greatest common factor of the terms is $${termLatex(node.factor)}$: ${each.slice(0, -1).join(', ')} and ${each.at(-1)}.`);
      steps.push(`Factor it out: $${whole} = ${termLatex(node.factor)}(${polyLatex(quotients)})$.`);
      if (node.inner.method !== 'prime') stepsOf(node.inner, steps);
      break;
    }
    case 'squares': {
      const pieces = node.written === 'AB'
        ? `${powerLatex(node.A)} - ${powerLatex(node.B)}`
        : `-${powerLatex(node.B)} + ${powerLatex(node.A)}`;
      steps.push(`$${whole} = ${pieces}$ is a difference of squares: $${whole} = ${bracket([node.A, node.B])}${bracket([node.A, negateTerm(node.B)])}$.`);
      [node.plus, node.minus].filter((part) => part.method !== 'prime').forEach((part) => stepsOf(part, steps));
      break;
    }
    case 'cubes': {
      const [plus, minus] = node.sign > 0 ? ['+', '-'] : ['-', '+'];
      const pattern = `(${termLatex(node.A)} ${plus} ${sizeLatex(node.B)})(${powerLatex(node.A)} ${minus} (${termLatex(node.A)})(${termLatex(node.B)}) + ${powerLatex(node.B)})`;
      steps.push(`$${whole} = ${powerLatex(node.A, 3)} ${plus} ${powerLatex(node.B, 3)}$ is a ${node.sign > 0 ? 'sum' : 'difference'} of cubes: $${whole} = ${pattern} = ${bracket(node.binomial.terms)}${bracket(node.trinomial.terms)}$.`);
      steps.push(`$${polyLatex(node.trinomial.terms)}$ does not factor over the integers.`);
      break;
    }
    case 'square': {
      const [first, middle, last] = node.terms;
      // "x^2 = x^2" says nothing: a square already written as one is not rewritten.
      const pieces = [[first, node.A], [last, node.B]]
        .filter(([written, root]) => termLatex(written) !== powerLatex(root))
        .map(([written, root]) => `$${termLatex(written)} = ${powerLatex(root)}$`);
      pieces.push(`$${termLatex(middle)} = ${node.sign < 0 ? '-' : ''}2(${termLatex(node.A)})(${termLatex(node.B)})$`);
      steps.push(`${pieces.slice(0, -1).join(', ')}${pieces.length > 1 ? ' and ' : ''}${pieces.at(-1)}, so $${whole}$ is a perfect square trinomial: $${whole} = ${bracket(node.base.terms)}^2$.`);
      break;
    }
    case 'trinomial': {
      const { a, b, c, U, V, split: { p, q, r, s } } = node;
      // The two numbers in the order their factors are written: q and s when a is 1, the split's m and n otherwise.
      const [m, n] = a === 1 ? [q, s] : [node.m, node.n];
      const numbers = `$${m}$ and $${n}$, since $${signed(m)} \\cdot ${signed(n)} = ${a * c}$ and $${m} + ${signed(n)} = ${b}$`;
      if (a === 1) {
        steps.push(`Find two numbers whose product is $${c}$ and whose sum is $${b}$: ${numbers}.`);
        steps.push(`So $${whole} = ${bracket(node.first.terms)}${bracket(node.second.terms)}$.`);
      } else {
        const UV = times(U, V);
        const split = [node.terms[0], term(m, UV.powers), term(n, UV.powers), node.terms[2]];
        const left = [term(r, U.powers), term(s, V.powers)];
        const groupOne = times(term(p), U);
        const groupTwo = times(term(q), V);
        steps.push(`Multiply the first and last coefficients: $${a} \\cdot ${signed(c)} = ${a * c}$. Find two numbers whose product is $${a * c}$ and whose sum is $${b}$: ${numbers}.`);
        steps.push(`Split the middle term and group: $${whole} = ${polyLatex(split)} = ${termLatex(groupOne)}(${polyLatex(left)}) ${groupTwo.c < 0 ? '-' : '+'} ${sizeLatex(groupTwo)}(${polyLatex(left)})$.`);
        steps.push(`Factor out the common binomial: $${whole} = (${polyLatex(left)})(${polyLatex([groupOne, groupTwo])})$.`);
      }
      [node.first, node.second].filter((part) => part.method !== 'prime').forEach((part) => stepsOf(part, steps));
      break;
    }
    case 'grouping': {
      const [one, two] = node.groups;
      const [t1, t2, t3, t4] = node.terms;
      steps.push(`Group the first two terms and the last two terms: $${whole} = (${polyLatex([t1, t2])}) + (${polyLatex([t3, t4])})$.`);
      steps.push(`Factor each group: $${polyLatex([t1, t2])} = ${termLatex(one.common)}(${polyLatex(one.binomial)})$ and $${polyLatex([t3, t4])} = ${termLatex(two.common)}(${polyLatex(two.binomial)})$.`);
      if (node.flipped) steps.push(`The binomials $${polyLatex(one.binomial)}$ and $${polyLatex(two.binomial)}$ are opposites: $${termLatex(one.common)}(${polyLatex(one.binomial)}) = ${termLatex(node.g1)}(${polyLatex(two.binomial)})$.`);
      steps.push(`Factor out the common binomial: $${whole} = (${polyLatex(two.binomial)})(${polyLatex([node.g1, node.g2])})$.`);
      [node.binomial, node.other].filter((part) => part.method !== 'prime').forEach((part) => stepsOf(part, steps));
      break;
    }
    default:
      break;
  }
  return steps;
};

/** The prime factors of degree 2 or more, said once: "$x^2 + 2$ and $x^2 - 2$ do not factor over the integers." */
const primeNote = (tree) => {
  const nodes = nodesOf(tree);
  const cubeTrinomials = new Set(nodes.filter((node) => node.method === 'cubes').map((node) => node.trinomial));
  const shown = [...new Set(nodes
    .filter((node) => node.method === 'prime' && node.terms.length > 1 && !cubeTrinomials.has(node)
      && Math.max(...node.terms.map((entry) => degreeOf(entry.powers))) > 1)
    .map((node) => polyLatex(node.terms)))];
  if (!shown.length) return null;
  return shown.length === 1
    ? `$${shown[0]}$ does not factor over the integers.`
    : `$${shown.slice(0, -1).join('$, $')}$ and $${shown.at(-1)}$ do not factor over the integers.`;
};

/** Every step of a box's factoring, ending at its factored form when it took more than one move. */
const workedSteps = (tree) => {
  const steps = stepsOf(tree);
  const note = primeNote(tree);
  if (note) steps.push(note);
  if (nodesOf(tree).filter((node) => node.method !== 'prime').length > 1) steps.push(`So $${polyLatex(tree.terms)} = ${factoredWriting(tree)}$.`);
  return steps;
};

/* ------------------------------------------------------------ the variant */

const ORDINALS = ['First', 'Second', 'Third', 'Fourth'];

/*
 * A number's new value: a 1 stays 1; any other keeps its sign and moves at
 * most one down or two up, never below 2. `pick(low, high)` chooses it, and
 * each box's sizes are added up, the item's and the variant's.
 */
const rangeOf = (c) => {
  const size = Math.abs(c);
  return size === 1 ? [1, 1] : [Math.max(2, size - 1), size + 2];
};
const drawerFor = (pick) => {
  const sizes = { item: 0, variant: 0 };
  const draw = (c) => {
    const [low, high] = rangeOf(c);
    const next = pick(low, high);
    sizes.item += Math.abs(c);
    sizes.variant += next;
    return Math.sign(c) * next;
  };
  return { draw, sizes };
};

/*
 * The new numbers of every box, one candidate at a time. Few enough
 * candidates (every number has at most four values) are all tried, in an
 * order the seed decides, so a seed never draws one twice and an item whose
 * every candidate fails says so at once; more are drawn at random.
 */
const candidatesFor = (boxes, seed, attempts) => {
  const radices = [];
  boxes.forEach((box) => rebuild(box.tree, drawerFor((low, high) => {
    radices.push(high - low + 1);
    return low;
  }).draw));
  const total = radices.reduce((product, radix) => product * radix, 1);
  const random = randomFrom(seed);
  if (total > attempts) return { count: attempts, pick: () => (low, high) => integer(random, low, high) };
  const start = Math.floor(random() * total);
  let step = 1 + Math.floor(random() * Math.max(1, total - 1));
  while (gcd(step, total) !== 1) step += 1;
  return {
    count: total,
    pick: (attempt) => {
      let index = (start + attempt * step) % total;
      let at = 0;
      return (low) => {
        const digit = index % radices[at];
        index = Math.floor(index / radices[at]);
        at += 1;
        return low + digit;
      };
    },
  };
};

const largestOf = (terms) => Math.max(...terms.map((entry) => Math.abs(entry.c)));
/** Which prime factors of a finished factoring are the same (up to sign): "1,1,1", or "1,2" for (x + 4)²(x − 4). */
const repeatsOf = (tree) => {
  const counts = new Map();
  finalFactors(tree).factors.forEach((factor) => {
    const sorted = ordered(factor);
    const key = polyTyped(sorted[0].c < 0 ? negatePoly(sorted) : sorted);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.values()].sort((a, b) => a - b).join(',');
};
/** The sizes of a finished factoring's numbers: its number in front and every factor's coefficients. */
const factoringSize = (tree) => {
  const { scalar, factors } = finalFactors(tree);
  return Math.abs(scalar) + factors.flat().reduce((sum, entry) => sum + Math.abs(entry.c), 0);
};

/** Every piece of mathematics written: each $…$, and each side of each "=" in it. */
const writtenMath = (variant) => [variant.prompt, ...variant.steps, variant.answer]
  .flatMap((line) => (String(line).match(/\$[^$]+\$/g) || []).map((piece) => piece.slice(1, -1)))
  .flatMap((piece) => piece.split('='))
  .map((side) => side.replace(/\\cdot/g, '*').trim())
  .filter(Boolean);

/** The box as the item grades it, keyed to the variant (any alternate answer listed was the item's). */
const keyedField = (field, answer) => ({ ...field, answer, acceptedAnswers: undefined, accepted: undefined, expected: undefined });

/** The item's own boxes about the variant's keys: right, and a near miss, the polynomial unfactored or the item's key wrong. */
const boxesAgree = (question, item, keys, trees) => {
  try {
    const fields = item.boxes.map((box, index) => keyedField(box.field, keys[index]));
    const asked = { ...question, answerFields: fields };
    const grade = (typed) => gradeMultiAnswerResponse(asked, Object.fromEntries(fields.map((field, index) => [field.id, typed[index]]))).parts;
    if (!grade(keys).every((part) => part.isCorrect === true)) return false;
    return item.boxes.every((box, index) => {
      const wrong = [text(box.field.answer)];
      if (box.role === 'factor') {
        // Unfactored, and one prime factor's last number off by one.
        wrong.push(polyTyped(ordered(trees[index].terms)));
        const { scalar, factors } = finalFactors(trees[index]);
        const at = factors.findIndex((entry) => entry.length > 1);
        const moved = factors.map((entry, position) => (position === at ? entry.map((value, place) => (place === entry.length - 1 ? term(value.c + 1, value.powers) : value)) : entry));
        wrong.push(`${scalar === 1 ? '' : scalar === -1 ? '-' : scalar}${moved.map((entry) => bracket(entry, true)).join('')}`);
      } else if (box.role === 'gcf') {
        const value = readTerms(keys[index])?.[0];
        if (value) wrong.push(polyTyped([term(value.c + 1, value.powers)]));
      }
      return wrong.every((answer) => grade(keys.map((key, at) => (at === index ? answer : key)))[index].isCorrect === false);
    });
  } catch {
    return false;
  }
};

const ATTEMPTS = 600;

const variantOf = (question, item, seed) => {
  const factorBoxes = item.boxes.filter((box) => box.role === 'factor');
  const itemKeys = item.boxes.map((box) => text(box.field.answer));
  const itemValues = itemKeys.map(platformValue).filter((value) => value && value.size);
  const answersAnywhere = [...itemKeys, ...questionAnswerValues(question)];
  const words = [text(question.prompt), ...item.boxes.map((box) => text(box.field.label))].join(' ');
  const completely = /\bcompletely\b/i.test(words);
  const byGrouping = /\bby\s+grouping\b/i.test(text(question.prompt));
  const allTrinomials = factorBoxes.every((box) => box.terms.length === 3);
  const noun = allTrinomials ? 'trinomial' : 'polynomial';
  const candidates = candidatesFor(factorBoxes, hashText(`${Number(seed) || 0}|${FACTORING_VARIANT_KIND}|${factorBoxes.map((box) => polyTyped(box.terms)).join('|')}`), ATTEMPTS);

  for (let attempt = 0; attempt < candidates.count; attempt += 1) {
    const pick = candidates.pick(attempt);
    // Each box never easier on its own: its numbers' sizes add up to at least the item box's.
    const rebuilt = factorBoxes.map((box) => {
      const { draw, sizes } = drawerFor(pick);
      const entry = rebuild(box.tree, draw);
      return entry && sizes.variant >= sizes.item ? entry : null;
    });
    if (rebuilt.some((entry) => !entry)) continue;
    const trees = rebuilt.map((entry) => factorByMethod(entry.terms));
    // The item's path exactly: the same move at every step, the same prime factors in the end.
    if (trees.some((tree, index) => !tree || shapeOf(tree) !== shapeOf(factorBoxes[index].tree))) continue;
    // A trinomial has at least as many factor pairs to try; no number grows past three times the item's (or 30 more).
    const harder = trees.every((tree, index) => {
      const own = nodesOf(factorBoxes[index].tree);
      return nodesOf(tree).every((node, at) => node.method !== 'trinomial'
        || factorPairs(Math.abs(node.a * node.c)).length >= factorPairs(Math.abs(own[at].a * own[at].c)).length);
    });
    if (!harder) continue;
    if (trees.some((tree, index) => largestOf(tree.terms) > Math.max(3 * largestOf(factorBoxes[index].terms), largestOf(factorBoxes[index].terms) + 30))) continue;
    // The factoring's own numbers as large as the item's too (a cube's trinomial, a² ∓ ab + b², included).
    if (trees.some((tree, index) => factoringSize(tree) < factoringSize(factorBoxes[index].tree))) continue;
    // Factors that are different in the item stay different: 5(x + 4)(x + 4)(x − 4) is not 5(x + 5)(x + 3)(x − 3)'s shape.
    if (trees.some((tree, index) => repeatsOf(tree) !== repeatsOf(factorBoxes[index].tree))) continue;
    // Different polynomials stay different.
    const written = trees.map((tree) => polyTyped(tree.terms));
    if (new Set(written).size !== written.length) continue;

    // The answers, box by box in the item's order.
    const treeOf = new Map(factorBoxes.map((box, index) => [box, trees[index]]));
    const [mainTree] = trees;
    const keys = item.boxes.map((box) => {
      if (box.role === 'factor') return factoredWriting(treeOf.get(box), { typed: true });
      if (box.role === 'gcf') return polyTyped([mainTree.factor]);
      const grouping = mainTree.method === 'grouping' ? mainTree : mainTree.inner;
      const { common, binomial } = grouping.groups[box.which];
      return `${polyTyped([common])}(${polyTyped(binomial)})`;
    });
    const shown = item.boxes.map((box) => {
      if (box.role === 'factor') return factoredWriting(treeOf.get(box));
      if (box.role === 'gcf') return termLatex(mainTree.factor);
      const grouping = mainTree.method === 'grouping' ? mainTree : mainTree.inner;
      const { common, binomial } = grouping.groups[box.which];
      return `${termLatex(common)}(${polyLatex(binomial)})`;
    });
    const trees2 = item.boxes.map((box) => (box.role === 'factor' ? treeOf.get(box) : null));
    // Read back by the platform's own reader: each factoring multiplies out to its polynomial,
    // the common factor times what is left is the polynomial, and each group to its two terms.
    const readBack = item.boxes.every((box, index) => {
      if (box.role === 'factor') return samePolynomial(platformValue(keys[index]), valueOfTerms(treeOf.get(box).terms), 1e-9);
      const grouping = mainTree.method === 'grouping' ? mainTree : mainTree.inner;
      if (box.role === 'gcf') return samePolynomial(platformValue(`${keys[index]}(${polyTyped(mainTree.inner.terms)})`), valueOfTerms(mainTree.terms), 1e-9);
      return samePolynomial(platformValue(keys[index]), valueOfTerms(grouping.terms.slice(box.which * 2, box.which * 2 + 2)), 1e-9);
    });
    if (!readBack) continue;

    let prompt;
    let labels;
    if (factorBoxes.length === 1) {
      const math = `$${polyLatex(mainTree.terms)}$`;
      if (item.boxes.some((box) => box.role === 'gcf')) prompt = `Factor ${math}: find the GCF of its terms, then factor it out.`;
      else if (item.boxes.some((box) => box.role === 'group')) prompt = `Factor ${math} by grouping: factor the first two terms and the last two terms, then factor out the common binomial.`;
      else prompt = `Factor ${math}${completely ? ' completely' : byGrouping ? ' by grouping' : ''}.`;
      labels = item.boxes.map((box) => (box.role === 'gcf' ? 'GCF' : box.role === 'group' ? `${box.which ? 'Second' : 'First'} group` : 'Factored form'));
    } else {
      const lead = `Factor each ${noun}${completely ? ' completely' : byGrouping ? ' by grouping' : ''}.`;
      prompt = [lead, ...trees.map((tree, index) => `${ORDINALS[index]}: $${polyLatex(tree.terms)}$.`)].join(' ');
      labels = ORDINALS.slice(0, item.boxes.length);
    }
    const variant = {
      prompt,
      steps: trees.flatMap(workedSteps),
      answer: labels.map((label, index) => `${label} = $${shown[index]}$`).join('; '),
      fields: item.boxes.map((box, index) => keyedField(box.field, keys[index])),
      kind: FACTORING_VARIANT_KIND,
    };

    // Never the item's: no key, and no piece of mathematics with a key's value.
    if (keys.some((key, index) => sameFactoredPolynomialExpression(key, itemKeys[index]) || samePolynomial(platformValue(key), platformValue(itemKeys[index]), 1e-9))) continue;
    if (writtenMath(variant).some((piece) => {
      const value = platformValue(piece);
      return value && value.size && itemValues.some((own) => samePolynomial(value, own, 1e-9));
    })) continue;
    if (hintRevealsAnswer([variant.prompt, ...variant.steps, variant.answer].join('\n'), answersAnywhere)) continue;
    if (!similarExampleIsSafe(question, variant)) continue;
    // The item's own boxes agree with every key.
    if (!boxesAgree(question, item, keys, trees2)) continue;
    return variant;
  }
  return null;
};

export const buildFactoringVariant = (question, { seed = 0 } = {}) => {
  try {
    const item = readFactoringItem(question);
    return item ? variantOf(question, item, seed) : null;
  } catch {
    return null;
  }
};
