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
// letters negative (near 0 and far out), so 10xy√(3y) is not 10|x|y√(3y) and
// m + 3 is not |m + 3|.
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
//   - in each term, one number, each letter once and one root (√3·√5 is
//     √15, and √2·∛2 is ⁶√32: roots of different indices combine over a
//     common index);
//   - like terms combined (3√5 − 6√5), and a fraction in lowest terms
//     (4√2/6).
// A form this reader does not understand is never accepted here; the ordinary
// grader still accepts the key exactly as written.
//
// THE FORMS THE LESSONS TEACH AS EQUAL ARE THE SAME ANSWER (the owner,
// 2026-11-19), each judged by the rules above:
//   - a power of a root is the root of the power: (∛V)² is ∛(V²), as
//     b^(x/y) = ʸ√(bˣ) = (ʸ√b)ˣ (Radicals L3 CW 5), and a number's power under
//     a root is that number, ⁴√(2³) is ⁴√8, as L3 PR 15's own back-up step
//     writes 7^(2/3) as ∛(7²). (√x)³ is √(x³), which is not simplified;
//   - a unit fraction in front of a bracket is the bracket over its
//     denominator: ½(√3 − 1) is (√3 − 1)/2 (Radicals L2 CW 11), and so are
//     −½(1 − √3) and −(1 − √3)/2. A whole number in front of a bracket is a
//     product still to multiply out: −4(2 + √3) is the question retyped;
//   - brackets that change nothing, ∛((V)²), are not there.
// A decimal stays refused wherever it is (w^0.5 for w^(1/2)): a box that
// compares form takes the exact notation.

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
  // A barred letter is also sampled negative, near 0 and far out: |m + 3| is
  // m + 3 at every m above −3, so only a value past −3 tells the two apart.
  barredLettersOf(key).forEach((name) => {
    points.slice(0, 3).forEach((point) => points.push({ ...point, [name]: -point[name] }, { ...point, [name]: -10 * point[name] }));
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

/*
 * WHY A FORM IS NOT TAKEN. "Not in simplest form" is said only when it is
 * true (the owner, 2026-11-19), so each refusal below says which it is:
 *   LEFT    a step of simplifying is left in it, one this reader can name: a
 *           perfect power under a root, a root or a fraction in a
 *           denominator, like terms, two numbers or two roots in one term, a
 *           negative power, a fraction not in lowest terms, a product or a
 *           power not worked out;
 *   UNREAD  this reader does not take the form at all (a decimal exponent, a
 *           letter dividing one term of a sum, bars round a root), which says
 *           nothing about whether it is simplified.
 */
const LEFT = 'left';
const UNREAD = 'unread';
const worse = (problems) => (problems.includes(LEFT) ? LEFT : problems.find(Boolean) || null);

const isNumber = (node) => node.t === 'num' || (node.t === 'group' && isNumber(node.arg));
/** The node inside every pair of brackets that changes nothing: ((V)) is V. */
const unwrap = (node) => (node.t === 'group' ? unwrap(node.arg) : node);
const containsKind = (node, kinds) => {
  let found = false;
  walk(node, (child) => { if (kinds.includes(child.t)) found = true; });
  return found;
};
// A power that is not a whole number: a root written as an exponent, or a
// decimal or a letter in the exponent.
const hasFractionalPower = (node) => {
  let found = false;
  walk(node, (child) => {
    if (child.t !== 'pow') return;
    const fraction = exponentFraction(child.exp);
    if (!fraction || fraction.q !== 1) found = true;
  });
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

// A whole number's whole power, worked out (2³ is 8), or null past 10¹²: a
// root's radicand is factored, and that is as far as it is worth factoring.
const MAX_WORKED_POWER = 1e12;
const wholePower = (base, exponent) => {
  const value = base ** exponent;
  return Number.isSafeInteger(value) && value <= MAX_WORKED_POWER ? value : null;
};

/**
 * A radicand as a monomial: { coefficient, powers } with a positive whole
 * coefficient and whole exponents, or null when it is not one (a sum, a
 * fraction, a negative number). Brackets that change nothing are read
 * through, ∛((V)²) as ∛(V²), and a number's power is the number, ⁴√(2³) as
 * ⁴√8.
 */
const radicandMonomial = (node) => {
  let coefficient = 1;
  const powers = new Map();
  const take = (factor) => {
    const child = unwrap(factor);
    if (child.t === 'prod' && !child.den.length) return child.num.every(take);
    if (child.t === 'num') {
      coefficient *= child.v;
      return true;
    }
    if (child.t === 'var') {
      powers.set(child.n, (powers.get(child.n) || 0) + 1);
      return true;
    }
    if (child.t !== 'pow') return false;
    const base = unwrap(child.base);
    const fraction = exponentFraction(child.exp);
    if (!fraction || fraction.q !== 1 || fraction.p < 1) return false;
    if (base.t === 'var') {
      powers.set(base.n, (powers.get(base.n) || 0) + fraction.p);
      return true;
    }
    const worked = base.t === 'num' && Number.isInteger(base.v) ? wholePower(base.v, fraction.p) : null;
    if (worked === null) return false;
    coefficient *= worked;
    return true;
  };
  if (!take(node)) return null;
  return Number.isInteger(coefficient) && coefficient >= 1 ? { coefficient, powers } : null;
};

/** The monomial to a whole power: (2x)³ is 8x³. Null when its number grows past what is factored. */
const raiseMonomial = ({ coefficient, powers }, power) => {
  const raised = wholePower(coefficient, power);
  return raised === null ? null : { coefficient: raised, powers: new Map([...powers].map(([name, exponent]) => [name, exponent * power])) };
};

/** ⁿ√(c·x^a·…) is simplified: no perfect nth-power factor, smallest index. Why not, or null. */
const monomialRootProblem = (index, monomial) => {
  const exponents = [...primeMultiplicities(monomial.coefficient), ...monomial.powers.values()];
  if (!exponents.length) return LEFT; // √1
  if (exponents.some((exponent) => exponent >= index)) return LEFT;
  return exponents.reduce((divisor, exponent) => gcd(divisor, exponent), index) === 1 ? null : LEFT;
};

/** Why ⁿ√(radicand) is not simplified, or null when it is. */
const rootProblem = (index, radicand) => {
  const inner = unwrap(radicand);
  // A fraction under a root, or a root under a root (√(√x) is ⁴√x).
  if (containsKind(inner, ['frac', 'root']) || (inner.t === 'prod' && inner.den.length)) return LEFT;
  const monomial = radicandMonomial(inner);
  if (monomial) return monomialRootProblem(index, monomial);
  // Only a monomial is judged further; a root of a sum, √(x + 1), has no
  // perfect-power factor to take out.
  if (inner.t === 'sum') return null;
  // Not a monomial: a sign that comes out of the root (∛(−16)), a negative
  // or fractional power under it, a power still to work out ((2x)², and a
  // sum's power of the index or more), or a form this reader does not take.
  const problems = [];
  walk(inner, (child) => {
    if (child.t === 'neg') problems.push(LEFT);
    if (child.t !== 'pow') return;
    const fraction = exponentFraction(child.exp);
    const base = unwrap(child.base);
    if (!fraction) problems.push(UNREAD);
    else if (fraction.q !== 1 || fraction.p < 1) problems.push(LEFT);
    else if (['prod', 'frac', 'pow'].includes(base.t) || (base.t === 'sum' && fraction.p >= index)) problems.push(LEFT);
  });
  return worse(problems) || UNREAD;
};

const keyOf = (node) => JSON.stringify(node);
// A root as its index and radicand, the same however the radicand is written:
// ∛(V²), (∛V)² and ∛((V)²) are like radicals.
const rootKey = (index, monomial, radicand) => `${index}:${monomial
  ? JSON.stringify([monomial.coefficient, [...monomial.powers].sort()])
  : keyOf(unwrap(radicand))}`;

/**
 * One term of a sum: its factors, read as a signed number, letters with whole
 * powers, letters with fractional powers, roots and absolute values.
 * { info } when the term is simplified, { problem } (LEFT or UNREAD) when not.
 */
const readTerm = (node) => {
  const info = { coefficient: 1, numbers: 0, denominator: 1, powers: new Map(), fractional: new Map(), roots: [], bars: [] };
  // Every factor is read, so a step left in one is found after another this
  // reader does not take (|√(12x)|·w^0.5 still has a square under its root).
  const problems = [];
  const refuse = (why) => {
    problems.push(why);
    return false;
  };
  const each = (parts, read) => parts.map(read).every(Boolean);
  // Each letter once, whole and fractional powers together: x·x^(1/12) is
  // x^(13/12) not yet combined (Codex on #520). A letter both outside and
  // under a root (6x√x) is a different thing, and simplest.
  const written = (name) => info.powers.has(name) || info.fractional.has(name);
  // One root in a term: √3·√5 is √15, and √2·∛2 is ⁶√32.
  const root = (index, monomial, radicand) => {
    if (info.roots.length) return refuse(LEFT);
    const why = monomial ? monomialRootProblem(index, monomial) : rootProblem(index, radicand);
    if (why) return refuse(why);
    info.roots.push(rootKey(index, monomial, radicand));
    return true;
  };
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
      // Only a number may divide inside a term: 2√3/3, never √x/x² + 1. A
      // root or a fraction below is still to be cleared; a letter below is a
      // sum of fractions this reader does not take.
      if (inDenominator) return refuse(LEFT);
      if (!bottom.every(isNumber)) {
        return refuse(bottom.some((part) => containsKind(part, ['root', 'frac']) || hasFractionalPower(part)) ? LEFT : UNREAD);
      }
      const above = each(top, (part) => factor(part, false));
      return each(bottom, (part) => factor(part, true)) && above;
    }
    if (inDenominator) return refuse(UNREAD);
    if (child.t === 'var') {
      if (written(child.n)) return refuse(LEFT);
      info.powers.set(child.n, 1);
      return true;
    }
    if (child.t === 'root') return root(child.index, radicandMonomial(child.arg), child.arg);
    if (child.t === 'abs') {
      // Bars round a root or a fraction are no form this reader takes; what
      // is inside them may still have a step left.
      if (containsKind(child.arg, ['frac', 'root'])) return refuse(simplestFormProblem(child.arg) === LEFT ? LEFT : UNREAD);
      info.bars.push(keyOf(child.arg));
      return true;
    }
    if (child.t === 'pow') {
      const fraction = exponentFraction(child.exp);
      // A decimal or a letter in the exponent is no form this box takes
      // (w^0.5: the decimal decision, 2026-11-19).
      if (!fraction) return refuse(UNREAD);
      if (fraction.p <= 0 || gcd(fraction.p, fraction.q) !== 1) return refuse(LEFT);
      const base = unwrap(child.base);
      if (base.t === 'abs' && fraction.q === 1) return factor(base, false);
      if (fraction.q === 1) {
        if (base.t === 'var') {
          if (written(base.n)) return refuse(LEFT);
          info.powers.set(base.n, fraction.p);
          return true;
        }
        // A power of a root is the root of the power: (∛V)² is ∛(V²), and
        // (√x)³ is √(x³), whose square comes out (L3 CW 5).
        if (base.t === 'root') {
          const monomial = radicandMonomial(base.arg);
          const raised = monomial && raiseMonomial(monomial, fraction.p);
          if (raised) return root(base.index, raised, null);
          const why = rootProblem(base.index, base.arg);
          return refuse(why === LEFT || fraction.p >= base.index ? LEFT : UNREAD);
        }
        // A number's power, or a power of a product, a sum or a power, is
        // still to be worked out: 2³, (2x)³, (√3 − 1)², (x²)³.
        return refuse(['num', 'prod', 'frac', 'sum', 'pow'].includes(base.t) ? LEFT : UNREAD);
      }
      if (base.t === 'var') {
        if (written(base.n)) return refuse(LEFT);
        info.fractional.set(base.n, `${fraction.p}/${fraction.q}`);
        return true;
      }
      // A number to a fractional power is a root of it: 2^(1/3) is ∛2.
      if (base.t === 'num' && Number.isInteger(base.v) && base.v >= 2) {
        const radicand = { t: 'num', v: base.v ** fraction.p };
        return root(fraction.q, radicandMonomial(radicand), radicand);
      }
      // 1 to any power is 1; a root or a power raised again is one power.
      return refuse(['root', 'pow'].includes(base.t) || (base.t === 'num' && base.v === 1) ? LEFT : UNREAD);
    }
    // A bracket inside a term is a product still to multiply out:
    // √2(√3 − 1), (√3 + 1)(√3 − 1), −4(2 + √3).
    if (child.t === 'sum') return refuse(LEFT);
    return refuse(UNREAD);
  };
  if (!factor(node, false)) return { problem: worse(problems) || UNREAD };
  if (info.numbers > 1) return { problem: LEFT };
  if (info.denominator !== 1 && Number.isInteger(info.coefficient) && Number.isInteger(info.denominator)
    && gcd(info.coefficient, info.denominator) !== 1) return { problem: LEFT };
  info.signature = JSON.stringify([
    [...info.powers].sort(), [...info.fractional].sort(), [...info.roots].sort(), [...info.bars].sort(),
  ]);
  return { info };
};

const termsOf = (node) => {
  const inner = unwrap(node);
  return inner.t === 'sum' ? inner.terms.map((term) => (term.sign < 0 ? { t: 'neg', arg: term.node } : term.node)) : [inner];
};

// A denominator: numbers, letters to whole powers, or a sum of such terms
// (y − 1). A root, a fractional power or another fraction in it is still to
// be cleared; bars, or a decimal power, this reader does not take.
const denominatorProblem = (node) => {
  const problems = [];
  walk(node, (child) => {
    if (['root', 'frac'].includes(child.t) || (child.t === 'prod' && child.den.length)) problems.push(LEFT);
    if (child.t === 'abs') problems.push(UNREAD);
    if (child.t === 'pow') {
      const fraction = exponentFraction(child.exp);
      if (!fraction) problems.push(UNREAD);
      else if (fraction.q !== 1 || fraction.p < 1) problems.push(LEFT);
    }
  });
  return worse(problems);
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

/** ±(a + b): a sum, in its brackets or as a fraction's numerator, with its sign. */
const signedSum = (node) => {
  let sign = 1;
  let inner = node;
  while (inner.t === 'neg' || inner.t === 'group') {
    if (inner.t === 'neg') sign = -sign;
    inner = inner.arg;
  }
  return inner.t === 'sum' ? { sign, sum: inner } : null;
};

/*
 * A UNIT FRACTION IN FRONT OF A BRACKET IS THE BRACKET OVER ITS DENOMINATOR:
 * ½(√3 − 1) is (√3 − 1)/2 (Radicals L2 CW 11), and so are −½(1 − √3),
 * (√3 − 1)·½ and −(1 − √3)/2. The numerator as { sign, sum, over }, the sum
 * taken over `over` (1 when the fraction bar is the bracket's own), or null.
 * A whole number in front stays a product to multiply out (readTerm).
 */
const bracketOverNumber = (numerator) => {
  const whole = signedSum(numerator);
  if (whole) return { ...whole, over: 1 };
  let sign = 1;
  let node = numerator;
  while (node.t === 'neg' || node.t === 'group') {
    if (node.t === 'neg') sign = -sign;
    node = node.arg;
  }
  if (node.t !== 'prod' || node.den.length || node.num.length !== 2) return null;
  const bracketAt = node.num.findIndex((factor) => signedSum(factor));
  if (bracketAt < 0) return null;
  const bracket = signedSum(node.num[bracketAt]);
  const coefficient = exponentFraction(node.num[1 - bracketAt]);
  if (!coefficient || Math.abs(coefficient.p) !== 1) return null;
  return { sign: sign * bracket.sign * coefficient.p, sum: bracket.sum, over: coefficient.q };
};

/** Why this expression is not in simplest form, LEFT or UNREAD, or null when it is. */
const simplestFormProblem = (tree) => {
  const { numerator, denominator } = quotientOf(tree);
  const cleared = denominator && denominatorProblem(denominator);
  if (cleared) return cleared;
  // ½(√3 − 1) and its spellings, read as (√3 − 1)/2; without a fraction
  // (−(2 + √3)) the bracket is still to be multiplied out.
  const bracket = bracketOverNumber(numerator);
  const overNumber = bracket && bracket.over > 1;
  if (overNumber && denominator) return LEFT; // ½(√3 − 1)/2: a fraction of a fraction
  const aboveNodes = bracket && (overNumber || denominator)
    ? termsOf(bracket.sum).map((term) => (bracket.sign < 0 ? { t: 'neg', arg: term } : term))
    : termsOf(numerator);
  const above = aboveNodes.map(readTerm);
  const below = overNumber ? [readTerm({ t: 'num', v: bracket.over })] : denominator ? termsOf(denominator).map(readTerm) : null;
  const problems = [...above, ...(below || [])].map((term) => term.problem).filter(Boolean);
  if (problems.length) return worse(problems);
  const terms = above.map((term) => term.info);
  // Like terms combined.
  if (new Set(terms.map((term) => term.signature)).size !== terms.length) return LEFT;
  if (!below) return null;
  // Not a complex fraction: nothing above or below has a fraction of its own.
  const denominatorTerms = below.map((term) => term.info);
  if ([...terms, ...denominatorTerms].some((term) => term.denominator !== 1)) return LEFT;
  // In lowest terms: no number divides every coefficient and the denominator.
  const coefficients = [...terms, ...denominatorTerms].map((term) => term.coefficient);
  if (coefficients.every(Number.isInteger) && coefficients.reduce((divisor, value) => gcd(divisor, value), 0) !== 1) return LEFT;
  // …and no letter divides every term above and below.
  return [...denominatorTerms[0].powers.keys()].some((name) => (
    [...terms, ...denominatorTerms].every((term) => term.powers.has(name)))) ? LEFT : null;
};

/** Is this expression written in simplest form? */
export const isSimplestRadicalForm = (value) => {
  const tree = typeof value === 'string' ? parseRadicalExpression(value) : value;
  return Boolean(tree) && simplestFormProblem(tree) === null;
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

// A calculator's display: a number with no letter, no root and no power but
// a whole one. 0.5√2 and 2^0.5 are exact, whatever else they are.
const isPlainNumber = (node) => {
  let plain = true;
  walk(node, (child) => {
    if (child.t === 'var' || child.t === 'root') plain = false;
    if (child.t === 'pow') {
      const fraction = exponentFraction(child.exp);
      if (!fraction || fraction.q !== 1) plain = false;
    }
  });
  return plain;
};

/**
 * WHY AN ANSWER WITH THE KEY'S VALUE WAS REFUSED, so the student is told the
 * real reason instead of a bare "Not quite" (walkthrough 2026-10-23,
 * Polynomials and Radicals). Null when it is right, or when it is not the
 * key's value at all (an ordinary wrong answer).
 *   'decimal'      a calculator's decimal for an exact key (within 0.5%);
 *   'notation'     the key's value in the other notation (radicals for an
 *                  exponent key, or the other way round);
 *   'notSimplest'  the key's value and notation, with a step of simplifying
 *                  left in it (LEFT above): only then is "not in simplest
 *                  form" true (the owner, 2026-11-19). So is the key's value
 *                  with a root or a rational exponent where the key has
 *                  neither (⁵√(32x⁵y¹⁰) for 2xy²): it comes out entirely, and
 *                  "the other notation" would not be true;
 *   'form'         the key's value and notation in a form this box does not
 *                  take (w^0.5, 0.5√2: the decimal decision). It names no
 *                  misconception, so the student is told nothing about form.
 */
export const radicalFormMiss = (student, key) => {
  if (sameSimplestRadicalForm(student, key)) return null;
  const studentTree = parseRadicalExpression(student);
  const keyTree = parseRadicalExpression(key);
  if (!studentTree || !keyTree) return null;
  if (hasDecimal(student) && !hasDecimal(key) && isPlainNumber(studentTree)) {
    if (lettersOf(keyTree).size) return null;
    const typed = evaluate(studentTree, {});
    const exact = evaluate(keyTree, {});
    return Number.isFinite(typed) && Number.isFinite(exact) && Math.abs(typed - exact) <= 0.005 * Math.max(1, Math.abs(exact)) ? 'decimal' : null;
  }
  if (!sameValue(studentTree, keyTree)) return null;
  const studentNotation = notationOf(studentTree);
  const keyNotation = notationOf(keyTree);
  // A decimal is refused for being one (0.5(√3 − 1), whose ½(√3 − 1) is
  // right), so its form is not the reason given.
  const decimal = hasDecimal(student) && !hasDecimal(key);
  if (studentNotation.radical !== keyNotation.radical || studentNotation.exponent !== keyNotation.exponent) {
    if (keyNotation.radical || keyNotation.exponent) return 'notation';
    return decimal ? 'form' : 'notSimplest';
  }
  if (decimal) return 'form';
  return simplestFormProblem(studentTree) === LEFT ? 'notSimplest' : 'form';
};

export default sameSimplestRadicalForm;
