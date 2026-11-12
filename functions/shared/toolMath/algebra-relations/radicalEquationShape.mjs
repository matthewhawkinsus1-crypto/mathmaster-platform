/*
 * THE SINGLE-RADICAL EQUATION THE STEP ALGEBRA RELATION WORKSPACE VERIFIES,
 * READ EXACTLY.
 *
 *   a·ⁿ√(m·v + b) + (l₁·v + k₁)  =  l₂·v + k₂          n = 2, 3, 4 or 5
 *
 * One radical, a linear radicand, and linear (or constant) terms around it.
 * That is the whole of tomorrow's verified scope:
 *
 *   index 2      any linear other side after the radical is isolated — squaring
 *                gives a linear or a FACTORABLE quadratic, and may add an
 *                extraneous candidate;
 *   index 3-5    a constant other side after isolation — raising both sides to
 *                the index gives a linear equation.
 *
 * Everything else (two radicals, a radical inside a radical, a variable in the
 * index, an irrational candidate, a quadratic with no real roots) is NOT
 * claimed: `parseRadicalEquation` answers { ok: false, reason } and the caller
 * keeps whatever it did before. Nothing here guesses.
 *
 * WHY THIS IS A SEPARATE, EXACT MODULE. The workspace's generic checks sample
 * numbers through mathjs; a radical equation needs the one thing sampling
 * cannot give — the exact set of candidates the student's algebra must reach,
 * which of them satisfy the ORIGINAL equation, and the exact value of each
 * side there (1/4 and 0.25 are the same number; sqrt(1/4) is exactly 1/2).
 * All of it is rational arithmetic over safe integers, so the answer is a fact
 * about the authored equation, never about a float.
 *
 * Pure and LIGHT: no mathjs, no imports. The V5 compiler, the workspace and the
 * server grader all read the same function, so "supported" means one thing.
 */

// --- Exact rationals over safe integers ----------------------------------------------

const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

/** A reduced rational { n, d } with d > 0. Throws RangeError beyond safe integers. */
export const rational = (n, d = 1) => {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d === 0) throw new RangeError('rational out of range');
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d) || 1;
  return Object.freeze({ n: (sign * n) / g, d: (sign * d) / g });
};

const ZERO = rational(0);
const ONE = rational(1);

const plus = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
const minus = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
const times = (a, b) => rational(a.n * b.n, a.d * b.d);
const over = (a, b) => {
  if (b.n === 0) throw new RangeError('division by zero');
  return rational(a.n * b.d, a.d * b.n);
};
const negate = (a) => rational(-a.n, a.d);
const isZero = (a) => a.n === 0;
const sign = (a) => Math.sign(a.n);
const power = (a, exponent) => {
  let result = ONE;
  for (let step = 0; step < exponent; step += 1) result = times(result, a);
  return result;
};

export const rationalEquals = (a, b) => Boolean(a) && Boolean(b) && a.n === b.n && a.d === b.d;
export const rationalToNumber = (a) => a.n / a.d;
/** "5", "-1/4": the form a student reads and the draft stores. */
export const rationalToText = (a) => (a.d === 1 ? String(a.n) : `${a.n}/${a.d}`);
export const compareRationals = (a, b) => Math.sign(a.n * b.d - b.n * a.d);

/** Exact integer n-th root of a non-negative safe integer, or null. */
const integerRoot = (value, index) => {
  if (!Number.isSafeInteger(value) || value < 0) return null;
  if (value < 2) return value;
  const guess = Math.round(value ** (1 / index));
  for (const candidate of [guess - 1, guess, guess + 1]) {
    if (candidate >= 0 && BigInt(candidate) ** BigInt(index) === BigInt(value)) return candidate;
  }
  return null;
};

/** Exact rational n-th root of a non-negative rational, or null when irrational. */
const nonNegativeRationalRoot = (value, index) => {
  const numerator = integerRoot(value.n, index);
  const denominator = integerRoot(value.d, index);
  return numerator === null || denominator === null ? null : rational(numerator, denominator);
};

/** The real n-th root of a rational: exact, or null when it is irrational or not real. */
export const exactRealRoot = (value, index) => {
  if (sign(value) >= 0) return nonNegativeRationalRoot(value, index);
  if (index % 2 === 0) return null;
  const root = nonNegativeRationalRoot(negate(value), index);
  return root === null ? null : negate(root);
};

// --- Reading the source ---------------------------------------------------------------

const FUNCTION_NAMES = Object.freeze({ sqrt: 2, cbrt: 3, nthRoot: null });
export const RADICAL_INDEX_RANGE = Object.freeze({ min: 2, max: 5 });
const MAX_SOURCE_LENGTH = 240;

const fail = (reason) => { const error = new Error(reason); error.radicalReason = reason; throw error; };

/** The brace-matched argument of a LaTeX command that starts at `from` (a `{`). */
const braced = (text, from) => {
  if (text[from] !== '{') return null;
  let depth = 0;
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return { body: text.slice(from + 1, index), end: index + 1 };
    }
  }
  return null;
};

/** \frac{a}{b}, \sqrt{a}, \sqrt[n]{a} to the plain text the reader below parses. */
const plainText = (input) => {
  let text = String(input ?? '')
    .replace(/\$/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\[,;! ]/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/∛\s*\(/g, 'cbrt(');
  for (let guard = 0; guard < 40 && text.includes('\\'); guard += 1) {
    const frac = text.indexOf('\\frac');
    const sqrt = text.indexOf('\\sqrt');
    if (frac < 0 && sqrt < 0) fail('latex-command');
    if (frac >= 0 && (sqrt < 0 || frac < sqrt)) {
      const top = braced(text, frac + 5);
      const bottom = top && braced(text, top.end);
      if (!bottom) fail('latex-malformed');
      text = `${text.slice(0, frac)}((${top.body})/(${bottom.body}))${text.slice(bottom.end)}`;
    } else {
      let cursor = sqrt + 5;
      let rootIndex = null;
      if (text[cursor] === '[') {
        const close = text.indexOf(']', cursor);
        if (close < 0) fail('latex-malformed');
        rootIndex = text.slice(cursor + 1, close);
        cursor = close + 1;
      }
      const radicand = braced(text, cursor);
      if (!radicand) fail('latex-malformed');
      const call = rootIndex === null ? `sqrt((${radicand.body}))` : `nthRoot((${radicand.body}),(${rootIndex}))`;
      text = `${text.slice(0, sqrt)}${call}${text.slice(radicand.end)}`;
    }
  }
  if (text.includes('\\')) fail('latex-command');
  return text.replace(/\{/g, '(').replace(/\}/g, ')');
};

const tokenize = (text) => {
  const tokens = [];
  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (/\s/.test(ch)) { index += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      const match = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(text.slice(index));
      if (!match) fail('number');
      const [whole, fraction = ''] = match[0].split('.');
      tokens.push({ type: 'num', value: rational(Number(`${whole || '0'}${fraction}`), 10 ** fraction.length) });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      const match = /^[A-Za-z]+/.exec(text.slice(index));
      tokens.push({ type: 'id', value: match[0] });
      index += match[0].length;
      continue;
    }
    if ('+-*/^(),='.includes(ch)) { tokens.push({ type: ch }); index += 1; continue; }
    fail('character');
  }
  return tokens;
};

/*
 * A value is  c1·v + c0 + (rad ? rad.coef·ⁿ√(rad.m·v + rad.b) : 0).
 * Anything that would leave that shape (a product of two variable terms, a
 * second radical, a power of the variable) is refused where it is built.
 */
const constantValue = (value) => ({ c1: ZERO, c0: value, rad: null });
const isPlainConstant = (value) => isZero(value.c1) && value.rad === null;

const sameRadical = (a, b) => a.index === b.index && rationalEquals(a.m, b.m) && rationalEquals(a.b, b.b);

const addValues = (a, b, subtract = false) => {
  const flip = (x) => (subtract ? negate(x) : x);
  let rad = a.rad;
  if (b.rad) {
    const incoming = { ...b.rad, coef: flip(b.rad.coef) };
    if (!rad) rad = incoming;
    else if (sameRadical(rad, incoming)) rad = { ...rad, coef: plus(rad.coef, incoming.coef) };
    else fail('two-radicals');
  }
  // Like radicals that cancel (√x − √x) leave no radical behind, and with it go the domain
  // restriction and the candidate check the original equation owes: refused, never read as the
  // equation that is left.
  if (rad && isZero(rad.coef)) fail('cancelled-radical');
  return { c1: subtract ? minus(a.c1, b.c1) : plus(a.c1, b.c1), c0: subtract ? minus(a.c0, b.c0) : plus(a.c0, b.c0), rad };
};

const scaleValue = (value, factor) => {
  // 0·√(x − 10) is not "nothing": the equation it came from still needs x − 10 ≥ 0.
  if (value.rad && isZero(factor)) fail('cancelled-radical');
  return {
    c1: times(value.c1, factor),
    c0: times(value.c0, factor),
    rad: value.rad ? { ...value.rad, coef: times(value.rad.coef, factor) } : null,
  };
};

const multiplyValues = (a, b) => {
  if (isPlainConstant(a)) return scaleValue(b, a.c0);
  if (isPlainConstant(b)) return scaleValue(a, b.c0);
  return fail('nonlinear');
};

const readSide = (tokens, context) => {
  let position = 0;
  const peek = () => tokens[position];
  const take = () => { position += 1; return tokens[position - 1]; };
  const expect = (type) => { if (peek()?.type !== type) fail('syntax'); return take(); };
  // What juxtaposition may multiply by: 2x, 3(x + 1), 2sqrt(x). Never a bare
  // number on the right — "3x 1" is a template that lost its sign, and reading
  // it as 3x·1 would quietly make it a different equation.
  const startsPrimary = (token) => Boolean(token) && (token.type === 'id' || token.type === '(');

  const parseExpression = () => {
    let left = parseTerm();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const operator = take().type;
      left = addValues(left, parseTerm(), operator === '-');
    }
    return left;
  };

  const parseTerm = () => {
    let left = parseUnary();
    for (;;) {
      const token = peek();
      if (token?.type === '*') { take(); left = multiplyValues(left, parseUnary()); continue; }
      if (token?.type === '/') {
        take();
        const divisor = parseUnary();
        if (!isPlainConstant(divisor) || isZero(divisor.c0)) fail('division');
        left = scaleValue(left, over(ONE, divisor.c0));
        continue;
      }
      if (startsPrimary(token)) {
        left = multiplyValues(left, parsePower());
        continue;
      }
      return left;
    }
  };

  const parseUnary = () => {
    if (peek()?.type === '-') { take(); return scaleValue(parseUnary(), rational(-1)); }
    if (peek()?.type === '+') { take(); return parseUnary(); }
    return parsePower();
  };

  const parsePower = () => {
    const base = parsePrimary();
    if (peek()?.type !== '^') return base;
    take();
    const exponent = peek()?.type === '(' ? (take(), (() => { const inner = parseExpression(); expect(')'); return inner; })()) : parseUnary();
    if (!isPlainConstant(exponent) || exponent.c0.d !== 1 || exponent.c0.n < 0 || exponent.c0.n > 6) fail('power');
    if (exponent.c0.n === 1) return base;
    if (!isPlainConstant(base)) fail('nonlinear');
    return constantValue(power(base.c0, exponent.c0.n));
  };

  const parsePrimary = () => {
    const token = take();
    if (!token) fail('syntax');
    if (token.type === 'num') return constantValue(token.value);
    if (token.type === '(') { const inner = parseExpression(); expect(')'); return inner; }
    if (token.type !== 'id') fail('syntax');
    if (Object.prototype.hasOwnProperty.call(FUNCTION_NAMES, token.value)) {
      expect('(');
      const radicand = parseExpression();
      let index = FUNCTION_NAMES[token.value];
      if (token.value === 'nthRoot') {
        expect(',');
        const given = parseExpression();
        if (!isPlainConstant(given) || given.c0.d !== 1) fail('index');
        index = given.c0.n;
      }
      expect(')');
      if (!Number.isInteger(index) || index < RADICAL_INDEX_RANGE.min || index > RADICAL_INDEX_RANGE.max) fail('index');
      if (radicand.rad) fail('nested-radical');
      if (isZero(radicand.c1)) fail('constant-radicand');
      return { c1: ZERO, c0: ZERO, rad: { index, coef: ONE, m: radicand.c1, b: radicand.c0 } };
    }
    if (token.value.length !== 1) fail('name');
    if (context.variable && context.variable !== token.value) fail('multiple-variables');
    context.variable = token.value;
    return { c1: ONE, c0: ZERO, rad: null };
  };

  const value = parseExpression();
  if (position !== tokens.length) fail('syntax');
  return value;
};

/**
 * Read a radical equation exactly.
 *
 *   { ok: true, shape } with
 *     variable, index, radicand { m, b }, alpha (the radical's coefficient),
 *     radicalSide 'left' | 'right', left / right (as written: c1, c0, rad),
 *     isolated { r, s }   — after isolating the radical it equals r·v + s
 *     domain               — for an even index, the radicand must be >= 0
 *   { ok: false, reason }  — outside the verified scope; the caller keeps its
 *                            existing behaviour.
 */
export const parseRadicalEquation = (source, { variable = null } = {}) => {
  try {
    const raw = String(source ?? '');
    if (!raw.trim() || raw.length > MAX_SOURCE_LENGTH) return { ok: false, reason: 'source' };
    const sides = plainText(raw).split('=');
    if (sides.length !== 2 || !sides[0].trim() || !sides[1].trim()) return { ok: false, reason: 'not-an-equation' };
    const context = { variable: variable ? String(variable) : null };
    const left = readSide(tokenize(sides[0]), context);
    const right = readSide(tokenize(sides[1]), context);
    if (!left.rad && !right.rad) return { ok: false, reason: 'no-radical' };
    if (left.rad && right.rad) return { ok: false, reason: 'two-radicals' };
    if (!context.variable) return { ok: false, reason: 'no-variable' };
    const radicalSide = left.rad ? 'left' : 'right';
    const carrier = left.rad ? left : right;
    const other = left.rad ? right : left;
    const { rad } = carrier;
    // alpha·R + c1·v + c0 = o1·v + o0   =>   R = ((o1 - c1)/alpha)·v + (o0 - c0)/alpha
    const r = over(minus(other.c1, carrier.c1), rad.coef);
    const s = over(minus(other.c0, carrier.c0), rad.coef);
    if (rad.index >= 3 && !isZero(r)) return { ok: false, reason: 'variable-beyond-square-root' };
    return {
      ok: true,
      shape: Object.freeze({
        variable: context.variable,
        index: rad.index,
        radicand: Object.freeze({ m: rad.m, b: rad.b }),
        alpha: rad.coef,
        radicalSide,
        left: Object.freeze(left),
        right: Object.freeze(right),
        isolated: Object.freeze({ r, s }),
      }),
    };
  } catch (error) {
    return { ok: false, reason: error?.radicalReason || (error instanceof RangeError ? 'out-of-range' : 'unreadable') };
  }
};

// --- Exact solution ---------------------------------------------------------------------

/** The exact square root of a non-negative rational, or null. */
const exactSquareRoot = (value) => nonNegativeRationalRoot(value, 2);

/** Does the isolated radical equal r·c + s, so that c satisfies the original? */
const satisfiesOriginal = (shape, candidate) => {
  if (shape.index % 2 === 1) return true;
  const target = plus(times(shape.isolated.r, candidate), shape.isolated.s);
  return sign(target) >= 0;
};

/**
 * The candidates raising both sides produces, which of them satisfy the
 * ORIGINAL equation, and how the equation ends.
 *
 *   { ok: true, candidates, genuine, extraneous, outcome, structuralNoSolution }
 *   { ok: false, reason }  — the raised equation has no rational roots the lesson
 *                            can factor (irrational, or none), so it is outside
 *                            the verified scope.
 *
 * `outcome` keeps "no candidate was ever produced" apart from "every candidate
 * failed": hasSolutions | allCandidatesFail | noCandidates.
 */
export const solveRadicalShape = (shape) => {
  try {
    const { index, radicand: { m, b }, isolated: { r, s } } = shape;
    let roots;
    if (index === 2 && !isZero(r)) {
      const a = times(r, r);
      const bq = minus(times(times(rational(2), r), s), m);
      const c = minus(times(s, s), b);
      const discriminant = minus(times(bq, bq), times(times(rational(4), a), c));
      if (sign(discriminant) < 0) return { ok: false, reason: 'no-real-candidates' };
      const root = exactSquareRoot(discriminant);
      if (root === null) return { ok: false, reason: 'irrational-candidates' };
      const denominator = times(rational(2), a);
      roots = isZero(root)
        ? [over(negate(bq), denominator)]
        : [over(minus(negate(bq), root), denominator), over(plus(negate(bq), root), denominator)];
    } else {
      roots = [over(minus(power(s, index), b), m)];
    }
    const candidates = roots
      .sort(compareRationals)
      .filter((value, position, all) => position === 0 || !rationalEquals(value, all[position - 1]));
    const genuine = candidates.filter((value) => satisfiesOriginal(shape, value));
    const extraneous = candidates.filter((value) => !satisfiesOriginal(shape, value));
    return {
      ok: true,
      candidates,
      genuine,
      extraneous,
      outcome: genuine.length ? 'hasSolutions' : candidates.length ? 'allCandidatesFail' : 'noCandidates',
      // An isolated even root equal to a negative number needs no algebra at all.
      structuralNoSolution: shape.index % 2 === 0 && isZero(shape.isolated.r) && sign(shape.isolated.s) < 0,
    };
  } catch {
    return { ok: false, reason: 'out-of-range' };
  }
};

/**
 * Both sides of the ORIGINAL equation, as written, at a rational value.
 * { defined: false } outside the real numbers; { defined: true, left, right }
 * with exact rationals, or null for a side whose radical is irrational there.
 */
export const radicalSidesAt = (shape, value) => {
  try {
    const radicandValue = plus(times(shape.radicand.m, value), shape.radicand.b);
    if (shape.index % 2 === 0 && sign(radicandValue) < 0) return { defined: false, left: null, right: null };
    const root = exactRealRoot(radicandValue, shape.index);
    const side = (written) => {
      const linear = plus(times(written.c1, value), written.c0);
      if (!written.rad) return linear;
      return root === null ? null : plus(linear, times(written.rad.coef, root));
    };
    return { defined: true, left: side(shape.left), right: side(shape.right) };
  } catch {
    return { defined: false, left: null, right: null };
  }
};

/** Whether the original equation holds at a rational value (null when it cannot be told exactly). */
export const radicalHoldsAt = (shape, value) => {
  const sides = radicalSidesAt(shape, value);
  if (!sides.defined) return false;
  if (sides.left === null || sides.right === null) return null;
  return rationalEquals(sides.left, sides.right);
};

/** For an even index the radicand must be 0 or more; the text a student reads. */
export const radicalDomainText = (shape) => {
  if (shape.index % 2 === 1) return '';
  const { m, b } = shape.radicand;
  const term = (coefficient) => {
    if (coefficient.n === 1 && coefficient.d === 1) return shape.variable;
    if (coefficient.n === -1 && coefficient.d === 1) return `-${shape.variable}`;
    return `${rationalToText(coefficient)}${shape.variable}`;
  };
  const constant = isZero(b) ? '' : ` ${sign(b) < 0 ? '-' : '+'} ${rationalToText(sign(b) < 0 ? negate(b) : b)}`;
  return `${term(m)}${constant} ≥ 0`;
};

/** Convenience for callers that only need to know whether the equation is in scope. */
export const isSupportedRadicalEquation = (source, options = {}) => {
  const parsed = parseRadicalEquation(source, options);
  return parsed.ok && solveRadicalShape(parsed.shape).ok;
};
