// Is a typed polynomial written in SIMPLEST FORM?
//
// THE GAP THIS CLOSES. A typed answer is graded by its value
// (answerEquivalence.mjs sameValue), so on "Simplify (2a³ + 5a − 7) −
// (a³ − 3a + 2)" a student who distributed and stopped —
// `2a^3+5a-7-a^3+3a-2` — was marked right for `a^3+8a-9`, and a student who
// retyped the factors `(2a^2b)(4a^3b)` was marked right for `8a^5b^2`. When
// the question is ABOUT simplifying, that is declining to assess the skill.
//
// An answer field opts in with `answerForm: 'simplifiedPolynomial'`. The
// answer must then still have the key's value (the ordinary grader decides
// that), AND be written so that nothing is left to do:
//
//   grouping     no brackets around letters:  (2a^2b)(4a^3b),  -(x - 4),
//                (x)(y),  2(x)
//   product      each term is ONE number times each letter at most once:
//                2·3x, x·x^2, aa, 2^3x, (2+3)x are all work left to do; and
//                ONE sign, never under the bar: \frac{3x}{-2}, -\frac{-3x}{2}
//   power        an exponent is a whole number of at least 2 (x^1, x^0 are
//                not simplest; x^-2 and x^(1/2) are not polynomials)
//   lowestTerms  a fraction coefficient in lowest terms, and no written 1
//                in front of letters (1x)
//   zeroTerm     no 0x terms
//   likeTerms    no two terms with the same letters and powers
//
// The term ORDER is not checked: `8a + a^3 - 9` is simplified. A question that
// needs descending order has to say so and grade it another way.
//
// The rules mirror the platform's Simplify control (src/platform/algebra/
// simplify/simplifyEngine.js writtenTermProblem: the numbers written in a term
// must be exactly its reduced coefficient's, or one decimal equal to it), but
// this module is server-safe and dependency-free so the browser and the
// server mark the same answer the same way.

import { normalizeAlgebraicText } from './algebraicForm.mjs';

export const SIMPLIFIED_POLYNOMIAL_FORM = 'simplifiedPolynomial';

export const SIMPLIFIED_POLYNOMIAL_PROBLEMS = Object.freeze({
  UNREADABLE: 'unreadable',
  GROUPING: 'grouping',
  PRODUCT: 'product',
  POWER: 'power',
  NOT_POLYNOMIAL: 'notPolynomial',
  LOWEST_TERMS: 'lowestTerms',
  ZERO_TERM: 'zeroTerm',
  LIKE_TERMS: 'likeTerms',
});
const P = SIMPLIFIED_POLYNOMIAL_PROBLEMS;

// Long enough for any polynomial a lesson asks for; refusing anything longer
// keeps the scan cheap on student text.
const MAX_LENGTH = 400;

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
};

const tokenize = (text) => {
  const tokens = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (/\d|\./.test(char)) {
      const match = /^\d*\.?\d+/.exec(text.slice(index));
      if (!match) return null;
      tokens.push({ kind: 'number', text: match[0], value: Number(match[0]) });
      index += match[0].length;
    } else if (/[a-zA-Z]/.test(char)) {
      tokens.push({ kind: 'name', value: char.toLowerCase() });
      index += 1;
    } else if ('+-*/^()'.includes(char)) {
      tokens.push({ kind: char });
      index += 1;
    } else {
      return null;
    }
  }
  return tokens;
};

/*
 * A numeric group — `((1)/(1000))` is what `\frac{1}{1000}` becomes — read as
 * a value and the literals written in it. Addition inside one is arithmetic
 * left to do. Returns { value, literals, problem } or null when it holds a
 * letter (that is grouping, not a number).
 */
const readNumericGroup = (tokens) => {
  if (tokens.some((token) => token.kind === 'name')) return null;
  const literals = [];
  let position = 0;
  let problem = null;
  const peek = () => tokens[position];
  const readUnary = () => {
    if (peek()?.kind === '-') { position += 1; const inner = readUnary(); return inner == null ? null : -inner; }
    if (peek()?.kind === '+') { position += 1; return readUnary(); }
    const token = peek();
    if (token?.kind === 'number') { position += 1; literals.push(token.value); return token.value; }
    if (token?.kind === '(') {
      position += 1;
      const inner = readSum();
      if (inner == null || peek()?.kind !== ')') return null;
      position += 1;
      return inner;
    }
    return null;
  };
  const readProduct = () => {
    let value = readUnary();
    while (value != null) {
      const token = peek();
      if (token?.kind === '/') { position += 1; const right = readUnary(); if (right == null || right === 0) return null; value /= right; }
      else if (token?.kind === '*' || token?.kind === '(' || token?.kind === 'number') {
        if (token.kind === '*') position += 1;
        const right = readUnary();
        if (right == null) return null;
        problem = P.PRODUCT;
        value *= right;
      } else if (token?.kind === '^') { position += 1; const right = readUnary(); if (right == null) return null; problem = P.PRODUCT; value **= right; }
      else return value;
    }
    return null;
  };
  const readSum = () => {
    let value = readProduct();
    while (value != null && (peek()?.kind === '+' || peek()?.kind === '-')) {
      const sign = peek().kind === '-' ? -1 : 1;
      position += 1;
      const right = readProduct();
      if (right == null) return null;
      problem = P.PRODUCT;
      value += sign * right;
    }
    return value;
  };
  const value = readSum();
  if (value == null || position !== tokens.length || !Number.isFinite(value)) return { problem: P.UNREADABLE };
  return { value, literals, problem };
};

// The tokens between a `(` at `start` and its matching `)`.
const groupEnd = (tokens, start) => {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].kind === '(') depth += 1;
    else if (tokens[index].kind === ')') { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
};

const readExponent = (tokens, position) => {
  const token = tokens[position];
  if (token?.kind === 'number') return { power: token.value, next: position + 1 };
  if (token?.kind === '(') {
    const end = groupEnd(tokens, position);
    if (end < 0) return null;
    const group = readNumericGroup(tokens.slice(position + 1, end));
    if (!group || group.problem === P.UNREADABLE) return null;
    return { power: group.value, next: end + 1 };
  }
  if (token?.kind === '-') {
    const magnitude = readExponent(tokens, position + 1);
    return magnitude && { power: -magnitude.power, next: magnitude.next };
  }
  return null;
};

// Whether a token list holds a + or - that adds two things (not a sign that
// opens a factor): `x - 4` does, `-1` and `2*-3` do not.
const hasBinaryAdditive = (tokens) => {
  let depth = 0;
  return tokens.some((token, index) => {
    if (token.kind === '(') depth += 1;
    if (token.kind === ')') depth -= 1;
    if (depth !== 0 || (token.kind !== '+' && token.kind !== '-')) return false;
    const previous = tokens[index - 1];
    return Boolean(previous) && !['*', '/', '^', '(', '+', '-'].includes(previous.kind);
  });
};

/*
 * One term (its sign already removed): every factor, and what is wrong with it
 * if anything. Returns { signature, coefficient, problem }.
 *
 * Brackets with no addition inside are only grouping marks — `\frac{x}{2}`
 * reaches here as `((x)/(2))` — so their factors are read as part of the term.
 * That is also what catches a retyped product: `(2a^2b)(4a^3b)` is one term
 * with two numbers and each letter twice.
 */
const readTerm = (tokens, leadingSigns = 0) => {
  const powers = new Map();
  // The term's own sign is one; `\frac{-1}{2}` may write it inside instead.
  let signs = leadingSigns;
  const numerator = [];
  const denominator = [];
  let value = 1;
  let problem = null;
  const flag = (next) => { if (!problem) problem = next; };

  const addFactor = (factorValue, literals, below) => {
    if (below) {
      if (factorValue === 0) return false;
      value /= factorValue;
      denominator.push(...literals);
    } else {
      value *= factorValue;
      numerator.push(...literals);
    }
    return true;
  };

  // Reads a run of factors; `below` says the run sits under a fraction bar.
  const readFactors = (list, below, insideGroup) => {
    let dividing = false;
    for (let position = 0; position < list.length;) {
      const token = list[position];
      if (token.kind === '*') { dividing = false; position += 1; continue; }
      if (token.kind === '/') { dividing = true; position += 1; continue; }
      if (token.kind === '+' || token.kind === '-') {
        // `\frac{-1}{2}` writes its sign inside the bracket; anywhere else a
        // sign between factors is work left to do, and so is one under the
        // bar (`\frac{3x}{-2}`): the coefficient check reads magnitudes only.
        if (!(insideGroup && position === 0) || below) flag(P.PRODUCT);
        signs += 1;
        if (token.kind === '-') value = -value;
        position += 1;
        continue;
      }
      const under = below !== dividing;

      if (token.kind === 'name') {
        let power = 1;
        position += 1;
        if (list[position]?.kind === '^') {
          const exponent = readExponent(list, position + 1);
          if (!exponent) return false;
          power = exponent.power;
          position = exponent.next;
          if (!Number.isInteger(power) || power < 0) flag(P.NOT_POLYNOMIAL);
          else if (power < 2) flag(P.POWER);
        }
        if (under) flag(P.NOT_POLYNOMIAL);
        if (powers.has(token.value)) flag(P.PRODUCT);
        powers.set(token.value, (powers.get(token.value) || 0) + (under ? -power : power));
        dividing = false;
        continue;
      }

      if (token.kind === 'number') {
        position += 1;
        let factorValue = token.value;
        if (list[position]?.kind === '^') {
          // A number raised to a power is arithmetic left to do.
          const exponent = readExponent(list, position + 1);
          if (!exponent) return false;
          flag(P.PRODUCT);
          factorValue **= exponent.power;
          position = exponent.next;
        }
        if (!addFactor(factorValue, [token.value], under)) return false;
        dividing = false;
        continue;
      }

      if (token.kind === '(') {
        const end = groupEnd(list, position);
        if (end < 0) return false;
        const inner = list.slice(position + 1, end);
        position = end + 1;
        const powered = list[position]?.kind === '^';
        if (powered) {
          const exponent = readExponent(list, position + 1);
          if (!exponent) return false;
          position = exponent.next;
          flag(P.PRODUCT);
        }
        if (hasBinaryAdditive(inner)) {
          const numeric = readNumericGroup(inner);
          if (!numeric) flag(P.GROUPING);
          else if (numeric.problem === P.UNREADABLE) return false;
          else {
            flag(P.PRODUCT);
            if (!addFactor(numeric.value, numeric.literals, under)) return false;
          }
        } else if (!readFactors(inner, under, true)) {
          return false;
        }
        dividing = false;
        continue;
      }
      return false;
    }
    return true;
  };

  if (!readFactors(tokens, false, false)) return { problem: P.UNREADABLE };
  // Two signs in one term (`-\frac{-3x}{2}`, `x + \frac{-1}{2}`) cancel or
  // combine: a sign left to resolve.
  if (signs > 1) flag(P.PRODUCT);

  const letters = [...powers.entries()]
    .filter(([, power]) => power !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signature = monomialSignature(Object.fromEntries(letters));
  const hasLetters = signature !== '';
  if (Math.abs(value) < 1e-12) return { signature, coefficient: 0, powers: Object.fromEntries(letters), problem: problem || P.ZERO_TERM };

  // The numbers written must be exactly the reduced coefficient's: its
  // numerator (left out when it is a 1 in front of letters) and denominator,
  // or one decimal equal to it.
  if (!problem) {
    const literals = [...numerator, ...denominator].map(Math.abs);
    const magnitude = Math.abs(value);
    const unitBeforeLetters = hasLetters && Math.abs(magnitude - 1) < 1e-12;
    const oneDecimal = literals.length === 1 && !denominator.length && !unitBeforeLetters
      && Math.abs(literals[0] - magnitude) < 1e-12;
    const noneNeeded = !literals.length && unitBeforeLetters;
    if (!oneDecimal && !noneNeeded) {
      if (!literals.length || !literals.every(Number.isInteger)) flag(P.LOWEST_TERMS);
      else {
        const top = numerator.map(Math.abs).reduce((acc, item) => acc * item, 1);
        const bottom = denominator.map(Math.abs).reduce((acc, item) => acc * item, 1);
        const divisor = gcd(top, bottom);
        const n = top / divisor;
        const d = bottom / divisor;
        const canonical = [];
        if (n !== 1 || !hasLetters) canonical.push(n);
        if (d !== 1) canonical.push(d);
        const sorted = (list) => [...list].sort((a, b) => a - b).join(',');
        const written = sorted(literals);
        const accepted = written === sorted(canonical) || (d !== 1 && n === 1 && written === sorted([...canonical, 1]));
        if (!accepted) flag(numerator.length > 1 || denominator.length > 1 ? P.PRODUCT : P.LOWEST_TERMS);
      }
    }
  }
  return { signature, coefficient: value, powers: Object.fromEntries(letters), problem };
};

/*
 * A bracket the student typed around a letter: `(x)(y)`, `2(x)`, `-(x)`.
 * Read from the RAW text, because normalizing writes `\frac{x}{2}` as
 * `((x)/(2))`, where a fraction's grouping and a typed bracket look the same;
 * in the raw text a fraction uses braces and only a typed bracket is ( or [.
 * A bracket around a number alone (`\left(\frac{1}{2}\right)x`) is not.
 */
const typedBracketAroundLetter = (raw) => {
  const text = raw.replace(/\\(?:left|right|[bB]igg?[lr]?)/g, '').replace(/\\[a-zA-Z]+/g, ' ');
  const open = [];
  for (const char of text) {
    if (char === '(' || char === '[') open.push('');
    else if (char === ')' || char === ']') {
      const inner = open.pop();
      if (inner === undefined) return false;
      if (/[a-zA-Z]/.test(inner)) return true;
      if (open.length) open[open.length - 1] += inner;
    } else if (open.length) open[open.length - 1] += char;
  }
  return false;
};

/*
 * The top-level terms of a token list: split at + and - outside brackets,
 * never at a sign that opens a factor (after `*`, `/`, `^` or `(`).
 */
const splitTerms = (tokens) => {
  const terms = [];
  let current = [];
  let depth = 0;
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    const opensFactor = !previous || ['*', '/', '^', '(', '+', '-'].includes(previous.kind);
    if (depth === 0 && (token.kind === '+' || token.kind === '-') && !opensFactor) {
      terms.push(current);
      current = [token];
      return;
    }
    if (token.kind === '(') depth += 1;
    if (token.kind === ')') depth -= 1;
    current.push(token);
  });
  terms.push(current);
  return depth === 0 ? terms : null;
};

/** The letters of a term as one key: { x: 2, y: 1 } → "x^2y^1"; a constant is "". */
export const monomialSignature = (powers = {}) => Object.entries(powers)
  .filter(([, power]) => Number(power) !== 0)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([name, power]) => `${name}^${power}`)
  .join('');

/*
 * Read a typed polynomial term by term: { problem, terms }, where each term is
 * { coefficient (signed), powers: { letter: exponent }, signature } in the
 * order written. `problem` is null when it is in simplest form.
 */
export const readTypedPolynomial = (value) => {
  const unreadable = { problem: P.UNREADABLE, terms: [] };
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > MAX_LENGTH || raw.includes('=')) return unreadable;
  const text = normalizeAlgebraicText(raw);
  if (!text) return unreadable;
  const tokens = tokenize(text);
  if (!tokens || !tokens.length) return unreadable;
  const split = splitTerms(tokens);
  if (!split) return unreadable;

  const seen = new Set();
  const terms = [];
  let firstProblem = null;
  for (const term of split) {
    // A term's own sign: any run of leading signs (a double sign is work left).
    let start = 0;
    let sign = 1;
    while (term[start]?.kind === '+' || term[start]?.kind === '-') {
      if (term[start].kind === '-') sign = -sign;
      start += 1;
    }
    if (start > 1) firstProblem = firstProblem || P.PRODUCT;
    const body = term.slice(start);
    if (!body.length) return unreadable;
    const read = readTerm(body, start);
    if (read.problem === P.UNREADABLE) return unreadable;
    terms.push({ coefficient: sign * read.coefficient, powers: read.powers, signature: read.signature });
    // A lone 0 is the simplified zero polynomial.
    if (read.problem === P.ZERO_TERM && split.length === 1 && read.signature === '') return { problem: null, terms };
    if (read.problem) firstProblem = firstProblem || read.problem;
    if (seen.has(read.signature)) firstProblem = firstProblem || P.LIKE_TERMS;
    seen.add(read.signature);
  }
  if (!firstProblem && typedBracketAroundLetter(raw)) firstProblem = P.GROUPING;
  return { problem: firstProblem, terms };
};

/**
 * Why a typed polynomial is not in simplest form, or null when it is.
 * Unreadable text is a problem too: it cannot be shown to be simplified.
 */
export const simplifiedPolynomialProblem = (value) => readTypedPolynomial(value).problem;

/** The terms of a polynomial written in simplest form, in written order; null otherwise. */
export const simplifiedPolynomialTerms = (value) => {
  const read = readTypedPolynomial(value);
  return read.problem === null ? read.terms : null;
};

export const isSimplifiedPolynomial = (value) => simplifiedPolynomialProblem(value) === null;

/** Whether an answer field asks for its polynomial in simplest form. */
export const fieldRequiresSimplifiedPolynomial = (field = {}) => field?.answerForm === SIMPLIFIED_POLYNOMIAL_FORM;

export default isSimplifiedPolynomial;
