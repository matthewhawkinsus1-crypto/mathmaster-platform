// "Simplify" answers with radicals and rational exponents (A2.7G): the same
// VALUE as the key, written in SIMPLEST FORM, in the key's notation.
//
// The ordinary grader compares the written form, so it refuses √192 for 8√3
// (right) but also 1 + √2 for √2 + 1 and 16√5 + 46 for 46 + 16√5 (wrong: those
// are the same simplified answer). The equivalence modes go the other way and
// accept √(25a⁴b⁹) for 5a²b⁴√b — the question retyped. This comparator is the
// middle: any arrangement of a fully simplified answer, nothing that still
// needs simplifying.
//
// SAME VALUE. Both expressions are evaluated at sample points. Letters are
// taken to be positive (the lessons' "assume every variable is positive"),
// except that a key with absolute value bars is also sampled with the barred
// letters negative, so 10xy√(3y) is not 10|x|y√(3y).
//
// SAME NOTATION. A key written with radicals asks for radicals; a key written
// with rational exponents asks for exponents. A student may use a notation
// only when the key does.
//
// EXACT, NOT A CALCULATOR'S DECIMAL. A decimal is written in neither notation,
// so it never answers a radical or exponent key, however many digits it
// carries (3.4641016151377544 for 2√3 agrees with the key to the last digit a
// computer keeps, which is why a tolerance alone cannot refuse it). Against a
// key with neither, a decimal is right only as a lone number that IS the key's
// value: 0.25 for 1/4, never 0.142857142857 for 1/7.
//
// SIMPLEST FORM, as the lessons define it:
//   - no radicand has a factor that is a perfect power of the index (√48),
//     and no letter under a root has an exponent of the index or more (√x³);
//   - the index is as small as it can be (⁶√(4x⁴) is ∛(2x²));
//   - no fraction under a root and no root (or fractional power) in a
//     denominator;
//   - no negative exponents;
//   - in each term, one number, each letter once, one root of each index
//     (√3·√5 is √15);
//   - like terms combined (3√5 − 6√5), and a fraction in lowest terms
//     (4√2/6).
// A form this reader does not understand is never accepted here; the ordinary
// grader still accepts the key exactly as written.

import { expandLatexShorthand } from './algebraicForm.mjs';

const MAX_INDEX = 12;

// --- reading ---------------------------------------------------------------

const prepare = (value) => expandLatexShorthand(value)
  .replace(/[−–—]/g, '-')
  .replace(/\\(?:cdot|times)/g, '*')
  .replace(/\\div/g, '/')
  .replace(/\\(?:lvert|rvert|vert|mid)/g, '|')
  .replace(/\\[dt]frac/g, '\\frac')
  .replace(/\\(?:,|;|!|:|quad|qquad| )/g, '')
  .replace(/\s+/g, '');

const tokenize = (text) => {
  const tokens = [];
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index);
    const number = /^\d*\.?\d+/.exec(rest);
    const command = /^\\(sqrt|frac)(?![A-Za-z])/.exec(rest);
    if (number) {
      tokens.push({ kind: 'num', value: Number(number[0]) });
      index += number[0].length;
    } else if (command) {
      tokens.push({ kind: command[1] });
      index += command[0].length;
    } else if (/[A-Za-z]/.test(rest[0])) {
      tokens.push({ kind: 'var', value: rest[0].toLowerCase() });
      index += 1;
    } else if ('+-*/^(){}[]|'.includes(rest[0])) {
      tokens.push({ kind: rest[0] });
      index += 1;
    } else {
      return null;
    }
  }
  return tokens;
};

const CLOSE = { '(': ')', '{': '}', '[': ']' };

/** The expression as a small tree, or null when it cannot be read. */
export const parseRadicalExpression = (value) => {
  const text = prepare(value);
  if (!text || /=|<|>/.test(text)) return null;
  const tokens = tokenize(text);
  if (!tokens?.length) return null;
  let position = 0;
  let absDepth = 0;
  const peek = (offset = 0) => tokens[position + offset] || null;
  const accept = (kind) => (peek()?.kind === kind ? (position += 1, true) : false);

  let parseSum;
  const parseGroup = () => {
    const open = peek()?.kind;
    if (!CLOSE[open]) return null;
    position += 1;
    const inner = parseSum();
    return inner && accept(CLOSE[open]) ? inner : null;
  };
  const startsFactor = () => {
    const kind = peek()?.kind;
    return ['num', 'var', '(', '{', '[', 'sqrt', 'frac'].includes(kind) || (kind === '|' && absDepth === 0);
  };
  const parseAtom = () => {
    const token = peek();
    if (!token) return null;
    if (token.kind === 'num') { position += 1; return { t: 'num', v: token.value }; }
    if (token.kind === 'var') { position += 1; return { t: 'var', n: token.value }; }
    if (CLOSE[token.kind]) {
      const inner = parseGroup();
      return inner && { t: 'group', arg: inner };
    }
    if (token.kind === '|') {
      position += 1;
      absDepth += 1;
      const inner = parseSum();
      absDepth -= 1;
      return inner && accept('|') ? { t: 'abs', arg: inner } : null;
    }
    if (token.kind === 'sqrt') {
      position += 1;
      let index = 2;
      if (peek()?.kind === '[') {
        position += 1;
        const indexToken = peek();
        if (indexToken?.kind !== 'num' || !accept('num') || !accept(']')) return null;
        index = indexToken.value;
        if (!Number.isInteger(index) || index < 2 || index > MAX_INDEX) return null;
      }
      const radicand = parseGroup();
      return radicand && { t: 'root', index, arg: radicand };
    }
    if (token.kind === 'frac') {
      position += 1;
      const numerator = parseGroup();
      const denominator = numerator && parseGroup();
      return denominator && { t: 'frac', num: numerator, den: denominator };
    }
    return null;
  };
  const parseExponent = () => {
    if (accept('-')) {
      const inner = parseExponent();
      return inner && { t: 'neg', arg: inner };
    }
    return parseAtom();
  };
  const parsePower = () => {
    const base = parseAtom();
    if (!base || !accept('^')) return base;
    const exponent = parseExponent();
    return exponent && { t: 'pow', base, exp: exponent };
  };
  const parseUnary = () => {
    if (accept('+')) return parseUnary();
    if (accept('-')) {
      const inner = parseUnary();
      return inner && { t: 'neg', arg: inner };
    }
    return parsePower();
  };
  const parseTerm = () => {
    const first = parseUnary();
    if (!first) return null;
    const num = [first];
    const den = [];
    for (;;) {
      if (accept('*')) {
        const next = parseUnary();
        if (!next) return null;
        num.push(next);
      } else if (accept('/')) {
        const next = parseUnary();
        if (!next) return null;
        den.push(next);
      } else if (startsFactor()) {
        const next = parsePower();
        if (!next) return null;
        num.push(next);
      } else {
        break;
      }
    }
    return num.length === 1 && !den.length ? first : { t: 'prod', num, den };
  };
  parseSum = () => {
    const first = parseTerm();
    if (!first) return null;
    const terms = [{ sign: 1, node: first }];
    for (;;) {
      const sign = accept('+') ? 1 : accept('-') ? -1 : 0;
      if (!sign) break;
      const next = parseTerm();
      if (!next) return null;
      terms.push({ sign, node: next });
    }
    return terms.length === 1 ? first : { t: 'sum', terms };
  };

  const tree = parseSum();
  return tree && position === tokens.length ? tree : null;
};

// --- values ----------------------------------------------------------------

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};

/** A constant exponent as an exact fraction { p, q } (q > 0), or null. */
const exponentFraction = (node) => {
  if (node.t === 'num') return Number.isInteger(node.v) ? { p: node.v, q: 1 } : null;
  if (node.t === 'group') return exponentFraction(node.arg);
  if (node.t === 'neg') {
    const inner = exponentFraction(node.arg);
    return inner && { p: -inner.p, q: inner.q };
  }
  const parts = node.t === 'frac' ? [node.num, node.den]
    : node.t === 'prod' && node.num.length === 1 && node.den.length === 1 ? [node.num[0], node.den[0]] : null;
  if (!parts) return null;
  const [top, bottom] = parts.map(exponentFraction);
  if (!top || !bottom || top.q !== 1 || bottom.q !== 1 || bottom.p === 0) return null;
  return bottom.p < 0 ? { p: -top.p, q: -bottom.p } : { p: top.p, q: bottom.p };
};

// A real root: odd roots of negatives are real, even ones are not.
const realRoot = (value, index) => {
  if (value >= 0) return value ** (1 / index);
  return index % 2 === 1 ? -((-value) ** (1 / index)) : Number.NaN;
};

const evaluate = (node, scope) => {
  switch (node.t) {
    case 'num': return node.v;
    case 'var': return scope[node.n] ?? Number.NaN;
    case 'group': return evaluate(node.arg, scope);
    case 'neg': return -evaluate(node.arg, scope);
    case 'abs': return Math.abs(evaluate(node.arg, scope));
    case 'sum': return node.terms.reduce((total, term) => total + term.sign * evaluate(term.node, scope), 0);
    case 'prod': return node.num.reduce((total, factor) => total * evaluate(factor, scope), 1)
      / node.den.reduce((total, factor) => total * evaluate(factor, scope), 1);
    case 'frac': return evaluate(node.num, scope) / evaluate(node.den, scope);
    case 'root': return realRoot(evaluate(node.arg, scope), node.index);
    case 'pow': {
      const base = evaluate(node.base, scope);
      const fraction = exponentFraction(node.exp);
      if (!fraction) return base ** evaluate(node.exp, scope);
      const reduced = gcd(fraction.p, fraction.q) || 1;
      const p = fraction.p / reduced;
      const q = fraction.q / reduced;
      return realRoot(base, q) ** p;
    }
    default: return Number.NaN;
  }
};

const walk = (node, visit) => {
  visit(node);
  const children = node.t === 'sum' ? node.terms.map((term) => term.node)
    : node.t === 'prod' ? [...node.num, ...node.den]
      : node.t === 'frac' ? [node.num, node.den]
        : node.t === 'pow' ? [node.base, node.exp]
          : node.arg ? [node.arg] : [];
  children.forEach((child) => walk(child, visit));
};

const lettersOf = (node) => {
  const letters = new Set();
  walk(node, (child) => { if (child.t === 'var') letters.add(child.n); });
  return letters;
};
const barredLettersOf = (node) => {
  const letters = new Set();
  walk(node, (child) => { if (child.t === 'abs') lettersOf(child.arg).forEach((name) => letters.add(name)); });
  return letters;
};

const SAMPLE_VALUES = Object.freeze([1.37, 2.21, 0.83, 3.29, 1.71, 2.67, 0.59, 1.93]);

const sameValue = (student, key) => {
  const letters = [...new Set([...lettersOf(student), ...lettersOf(key)])].sort();
  const points = [];
  for (let sample = 0; sample < 6; sample += 1) {
    points.push(Object.fromEntries(letters.map((name, index) => [name, SAMPLE_VALUES[(sample + 3 * index) % SAMPLE_VALUES.length]])));
  }
  barredLettersOf(key).forEach((name) => {
    points.slice(0, 3).forEach((point) => points.push({ ...point, [name]: -point[name] }));
  });
  let compared = 0;
  for (const point of points) {
    const expected = evaluate(key, point);
    if (!Number.isFinite(expected)) continue;
    const actual = evaluate(student, point);
    if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-9 * Math.max(1, Math.abs(expected))) return false;
    compared += 1;
  }
  return compared >= Math.min(3, points.length);
};

// --- notation --------------------------------------------------------------

const notationOf = (node) => {
  let radical = false;
  let exponent = false;
  walk(node, (child) => {
    if (child.t === 'root') radical = true;
    if (child.t === 'pow') {
      const fraction = exponentFraction(child.exp);
      if (!fraction || fraction.q !== 1) exponent = true;
    }
  });
  return { radical, exponent };
};

// --- decimals ----------------------------------------------------------------

const hasDecimal = (value) => /\d*\.\d/.test(prepare(value));

// The value as p/q with q ≤ 10⁶ (a continued fraction), or null when no such
// fraction is the value: a key with no letter, root or rational exponent is
// rational, and the lessons' denominators are small.
const asFraction = (value) => {
  const sign = value < 0 ? -1 : 1;
  let rest = Math.abs(value);
  let [p0, q0, p1, q1] = [0, 1, 1, 0];
  for (let step = 0; step < 40; step += 1) {
    const whole = Math.floor(rest);
    [p0, q0, p1, q1] = [p1, q1, whole * p1 + p0, whole * q1 + q0];
    if (q1 > 1e6) return null;
    if (Math.abs((sign * p1) / q1 - value) <= 1e-12 * Math.max(1, Math.abs(value))) return { p: sign * p1, q: q1 };
    rest = 1 / (rest - whole);
    if (!Number.isFinite(rest)) return null;
  }
  return null;
};

// A lone decimal N/10ᵏ that is exactly the key's value, compared in integers:
// 0.14285714285714285 and 1/7 are the same double, but not the same number.
const isExactDecimal = (student, keyTree) => {
  const match = /^([+-]?)(\d*)\.(\d+)$/.exec(prepare(student));
  if (!match || lettersOf(keyTree).size) return false;
  const value = evaluate(keyTree, {});
  const fraction = Number.isFinite(value) ? asFraction(value) : null;
  if (!fraction) return false;
  const [, sign, whole, digits] = match;
  const numerator = BigInt(`${whole || '0'}${digits}`) * (sign === '-' ? -1n : 1n);
  return numerator * BigInt(fraction.q) === BigInt(fraction.p) * 10n ** BigInt(digits.length);
};

// --- simplest form ---------------------------------------------------------

const isNumber = (node) => node.t === 'num' || (node.t === 'group' && isNumber(node.arg));
const containsKind = (node, kinds) => {
  let found = false;
  walk(node, (child) => { if (kinds.includes(child.t)) found = true; });
  return found;
};

/** Prime multiplicities of a positive integer: 72 → [3, 2]. */
const primeMultiplicities = (value) => {
  const counts = [];
  let rest = value;
  for (let prime = 2; prime * prime <= rest; prime += 1) {
    let count = 0;
    while (rest % prime === 0) { rest /= prime; count += 1; }
    if (count) counts.push(count);
  }
  if (rest > 1) counts.push(1);
  return counts;
};

/**
 * A radicand as a monomial: { coefficient, powers } with a positive whole
 * coefficient and whole exponents, or null when it is not one (a sum, a
 * fraction, a negative number).
 */
const radicandMonomial = (node) => {
  const factors = node.t === 'prod' && !node.den.length ? node.num : [node];
  let coefficient = 1;
  const powers = new Map();
  for (const factor of factors) {
    if (factor.t === 'num') {
      coefficient *= factor.v;
    } else if (factor.t === 'var') {
      powers.set(factor.n, (powers.get(factor.n) || 0) + 1);
    } else if (factor.t === 'pow' && factor.base.t === 'var') {
      const fraction = exponentFraction(factor.exp);
      if (!fraction || fraction.q !== 1 || fraction.p < 1) return null;
      powers.set(factor.base.n, (powers.get(factor.base.n) || 0) + fraction.p);
    } else {
      return null;
    }
  }
  return Number.isInteger(coefficient) && coefficient >= 1 ? { coefficient, powers } : null;
};

/** ⁿ√(c·x^a·…) is simplified: no perfect nth-power factor, smallest index. */
const simplestRoot = (index, radicand) => {
  if (containsKind(radicand, ['frac', 'root']) || (radicand.t === 'prod' && radicand.den.length)) return false;
  const monomial = radicandMonomial(radicand.t === 'group' ? radicand.arg : radicand);
  // Only a monomial is judged further; a root of a sum, √(x + 1), has no
  // perfect-power factor to take out.
  if (!monomial) return radicand.t === 'sum' || (radicand.t === 'group' && radicand.arg.t === 'sum');
  const exponents = [...primeMultiplicities(monomial.coefficient), ...monomial.powers.values()];
  if (!exponents.length) return false; // √1
  if (exponents.some((exponent) => exponent >= index)) return false;
  return exponents.reduce((divisor, exponent) => gcd(divisor, exponent), index) === 1;
};

const keyOf = (node) => JSON.stringify(node);

/**
 * One term of a sum: its factors, read as a signed number, letters with whole
 * powers, letters with fractional powers, roots and absolute values. Null
 * when the term is not simplified.
 */
const readTerm = (node) => {
  const info = { coefficient: 1, numbers: 0, denominator: 1, powers: new Map(), fractional: new Map(), roots: [], bars: [] };
  const factor = (child, inDenominator) => {
    if (child.t === 'group') return factor(child.arg, inDenominator);
    if (child.t === 'neg') {
      info.coefficient = -info.coefficient;
      return factor(child.arg, inDenominator);
    }
    if (child.t === 'num') {
      if (inDenominator) info.denominator *= child.v;
      else { info.coefficient *= child.v; info.numbers += 1; }
      return true;
    }
    if (child.t === 'frac' || child.t === 'prod') {
      const top = child.t === 'frac' ? [child.num] : child.num;
      const bottom = child.t === 'frac' ? [child.den] : child.den;
      // Only a number may divide inside a term: 2√3/3, never √x/x² + 1.
      if (inDenominator || !bottom.every(isNumber)) return false;
      return top.every((part) => factor(part, false)) && bottom.every((part) => factor(part, true));
    }
    if (inDenominator) return false;
    if (child.t === 'var') {
      if (info.powers.has(child.n)) return false;
      info.powers.set(child.n, 1);
      return true;
    }
    if (child.t === 'root') {
      if (info.roots.some((root) => root.index === child.index) || !simplestRoot(child.index, child.arg)) return false;
      info.roots.push({ index: child.index, radicand: keyOf(child.arg) });
      return true;
    }
    if (child.t === 'abs') {
      if (containsKind(child.arg, ['frac', 'root'])) return false;
      info.bars.push(keyOf(child.arg));
      return true;
    }
    if (child.t === 'pow') {
      const fraction = exponentFraction(child.exp);
      if (!fraction || fraction.p <= 0 || gcd(fraction.p, fraction.q) !== 1) return false;
      const base = child.base.t === 'group' ? child.base.arg : child.base;
      if (base.t === 'abs' && fraction.q === 1) return factor(base, false);
      if (fraction.q === 1) {
        if (base.t !== 'var' || info.powers.has(base.n)) return false;
        info.powers.set(base.n, fraction.p);
        return true;
      }
      if (base.t === 'var') {
        if (info.fractional.has(base.n)) return false;
        info.fractional.set(base.n, `${fraction.p}/${fraction.q}`);
        return true;
      }
      // A number to a fractional power is a root of it: 2^(1/3) is ∛2.
      if (base.t === 'num' && Number.isInteger(base.v) && base.v >= 2) {
        if (info.roots.some((root) => root.index === fraction.q)) return false;
        if (!simplestRoot(fraction.q, { t: 'num', v: base.v ** fraction.p })) return false;
        info.roots.push({ index: fraction.q, radicand: keyOf({ t: 'num', v: base.v ** fraction.p }) });
        return true;
      }
      return false;
    }
    return false;
  };
  if (!factor(node, false) || info.numbers > 1) return null;
  if (info.denominator !== 1 && Number.isInteger(info.coefficient) && Number.isInteger(info.denominator)
    && gcd(info.coefficient, info.denominator) !== 1) return null;
  info.signature = JSON.stringify([
    [...info.powers].sort(), [...info.fractional].sort(),
    info.roots.map((root) => `${root.index}:${root.radicand}`).sort(), [...info.bars].sort(),
  ]);
  return info;
};

const termsOf = (node) => {
  const inner = node.t === 'group' ? node.arg : node;
  return inner.t === 'sum' ? inner.terms.map((term) => (term.sign < 0 ? { t: 'neg', arg: term.node } : term.node)) : [inner];
};

// A denominator: numbers, letters to whole powers, or a sum of such terms
// (y − 1). Never a root, a fractional power or another fraction.
const plainDenominator = (node) => {
  let plain = true;
  walk(node, (child) => {
    if (['root', 'frac', 'abs'].includes(child.t)) plain = false;
    if (child.t === 'prod' && child.den.length) plain = false;
    if (child.t === 'pow') {
      const fraction = exponentFraction(child.exp);
      if (!fraction || fraction.q !== 1 || fraction.p < 1) plain = false;
    }
  });
  return plain;
};

const product = (factors) => (factors.length === 1 ? factors[0] : { t: 'prod', num: factors, den: [] });

/**
 * The whole expression as numerator over denominator: (√3 − 1)/2,
 * y⁴√x/x⁴, (y⁴/x⁴)·√x and 9a⁶/b⁸ all have one. A fraction standing as a
 * factor gives its parts to the whole, so (y⁴/x⁴)√x reads as y⁴√x over x⁴.
 */
const quotientOf = (tree) => {
  let sign = 1;
  let node = tree;
  for (;;) {
    if (node.t === 'neg') { sign = -sign; node = node.arg; } else if (node.t === 'group') node = node.arg; else break;
  }
  const signed = (numerator) => (sign < 0 ? { t: 'neg', arg: numerator } : numerator);
  if (node.t === 'frac') return { numerator: signed(node.num), denominator: node.den };
  if (node.t !== 'prod') return { numerator: tree, denominator: null };
  const top = [];
  const bottom = [...node.den];
  node.num.forEach((factor) => {
    if (factor.t === 'frac') { top.push(factor.num); bottom.push(factor.den); } else top.push(factor);
  });
  if (!bottom.length) return { numerator: tree, denominator: null };
  return { numerator: signed(product(top)), denominator: product(bottom) };
};

/** Is this expression written in simplest form? */
export const isSimplestRadicalForm = (value) => {
  const tree = typeof value === 'string' ? parseRadicalExpression(value) : value;
  if (!tree) return false;
  const { numerator, denominator } = quotientOf(tree);
  if (denominator && !plainDenominator(denominator)) return false;
  const terms = termsOf(numerator).map(readTerm);
  if (terms.some((term) => !term)) return false;
  if (new Set(terms.map((term) => term.signature)).size !== terms.length) return false;
  if (!denominator) return true;
  // Not a complex fraction: nothing above or below has a fraction of its own.
  const denominatorTerms = termsOf(denominator).map(readTerm);
  if (denominatorTerms.some((term) => !term) || [...terms, ...denominatorTerms].some((term) => term.denominator !== 1)) return false;
  // In lowest terms: no number divides every coefficient and the denominator.
  const coefficients = [...terms, ...denominatorTerms].map((term) => term.coefficient / term.denominator);
  if (coefficients.every(Number.isInteger) && coefficients.reduce((divisor, value) => gcd(divisor, value), 0) !== 1) return false;
  // …and no letter divides every term above and below.
  return ![...denominatorTerms[0].powers.keys()].some((name) => (
    [...terms, ...denominatorTerms].every((term) => term.powers.has(name))));
};

/**
 * Is `student` the key's value, in simplest form, in a notation the key uses?
 */
export const sameSimplestRadicalForm = (student, key) => {
  const studentTree = parseRadicalExpression(student);
  const keyTree = parseRadicalExpression(key);
  if (!studentTree || !keyTree) return false;
  const studentNotation = notationOf(studentTree);
  const keyNotation = notationOf(keyTree);
  if (studentNotation.radical !== keyNotation.radical || studentNotation.exponent !== keyNotation.exponent) return false;
  if (hasDecimal(student) && !hasDecimal(key)) return isExactDecimal(student, keyTree);
  return isSimplestRadicalForm(studentTree) && sameValue(studentTree, keyTree);
};

export default sameSimplestRadicalForm;
