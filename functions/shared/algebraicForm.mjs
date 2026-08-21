// Comparing two written equations by their mathematics rather than their text.
//
// THE BUG THIS FIXES. A question asked for the equation of a line with slope
// 3/2. The authored key was `y=1.5x-6`, with `y=3/2x-6` listed by hand as an
// accepted alternative. A student who wrote `y=6/4x-6` — the slope straight off
// the rise-over-run they had just computed, not yet reduced — was marked wrong.
// So was `y=\frac{3}{2}x-6`, which is what the MathLive keypad produces. The
// grader was comparing normalized STRINGS, so correctness depended on whether
// the author had happened to type that spelling into `accepted`.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not decide that two equations
// describe the same line. `y - 5 = -3(x - 2)` and `y = -3x + 11` have the same
// graph, and a question that says "in slope-intercept form" is entitled to
// reject the first one. So the comparison is side-by-side: the left side must
// match the left side and the right must match the right, as polynomials.
// Rearranging across the equals sign, or between forms, still fails — the
// student's ARRANGEMENT is preserved and only their ARITHMETIC is normalized.
//
// It is also refused above degree one (see `sameLinearEquation`), because
// "simplify", "expand" and "write in vertex form" are questions ABOUT the form.
// Accepting `(x+2)(x+3)` for `x^2+5x+6` would not be generosity, it would be
// declining to assess the thing being assessed.

const EPSILON = 1e-9;

// --- polynomials ---------------------------------------------------------------
//
// A polynomial is a map from a monomial key to a coefficient. The key is the
// variables in sorted order with their powers ("" is the constant term, "x" is
// x, "x^2" is x², "xy" is xy), which makes equality a matter of comparing two
// small maps.

const constantPoly = (value) => new Map(value === 0 ? [] : [['', value]]);
const variablePoly = (name) => new Map([[name, 1]]);

const prune = (poly) => {
  for (const [key, value] of poly) if (Math.abs(value) < EPSILON) poly.delete(key);
  return poly;
};

const addPoly = (left, right, sign = 1) => {
  const out = new Map(left);
  for (const [key, value] of right) out.set(key, (out.get(key) || 0) + sign * value);
  return prune(out);
};

const parseMonomial = (key) => {
  const powers = new Map();
  if (!key) return powers;
  for (const [, name, exponent] of key.matchAll(/([a-z])(?:\^(\d+))?/g)) {
    powers.set(name, (powers.get(name) || 0) + (exponent ? Number(exponent) : 1));
  }
  return powers;
};

const monomialKey = (powers) => [...powers.entries()]
  .filter(([, power]) => power > 0)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([name, power]) => (power === 1 ? name : `${name}^${power}`))
  .join('');

const multiplyPoly = (left, right) => {
  const out = new Map();
  for (const [leftKey, leftValue] of left) {
    for (const [rightKey, rightValue] of right) {
      const powers = parseMonomial(leftKey);
      for (const [name, power] of parseMonomial(rightKey)) powers.set(name, (powers.get(name) || 0) + power);
      const key = monomialKey(powers);
      out.set(key, (out.get(key) || 0) + leftValue * rightValue);
    }
  }
  return prune(out);
};

/** The value of a polynomial with no variables in it, or null when it has some. */
const asConstant = (poly) => {
  for (const key of poly.keys()) if (key !== '') return null;
  return poly.get('') || 0;
};

const dividePoly = (left, right) => {
  const divisor = asConstant(right);
  // Dividing by an expression containing a variable leaves the world of
  // polynomials. Refuse rather than approximate.
  if (divisor === null || Math.abs(divisor) < EPSILON) return null;
  const out = new Map();
  for (const [key, value] of left) out.set(key, value / divisor);
  return prune(out);
};

const powerPoly = (base, exponent) => {
  const power = asConstant(exponent);
  if (power === null || !Number.isInteger(power) || power < 0 || power > 8) return null;
  let out = constantPoly(1);
  for (let index = 0; index < power; index += 1) out = multiplyPoly(out, base);
  return out;
};

export const polynomialDegree = (poly) => {
  let degree = 0;
  for (const key of poly.keys()) {
    let total = 0;
    for (const power of parseMonomial(key).values()) total += power;
    degree = Math.max(degree, total);
  }
  return degree;
};

export const samePolynomial = (left, right, tolerance = 1e-6) => {
  if (!left || !right) return false;
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    if (Math.abs((left.get(key) || 0) - (right.get(key) || 0)) > tolerance) return false;
  }
  return true;
};

// --- reading what a student typed ----------------------------------------------

const UNICODE_MINUS = /[−–—]/g;

/**
 * The shorthand MathLive really emits, written out in full.
 *
 * Typing `5/3` into a math field serializes as `\frac53` — no braces, because
 * each part is a single token. Typing `x^2` gives `^2`, but pressing the
 * superscript key gives `^{2}`, and `√` typed as a character gives `\surd`
 * rather than `\sqrt`. Every grader that only knew the long spellings marked
 * those correct answers wrong.
 *
 * Exported because answer normalization needs the same expansion: the fix has
 * to be in one place, or the two will drift the way the delimiter scanners did.
 */
export const expandLatexShorthand = (value) => String(value ?? '')
  // `\left` and `\right` are sizing hints with no mathematical content, and
  // they sit between every other rule here and the thing it needs to match —
  // `\sqrt{\left(2\right)}` is `\sqrt{(2)}` is `\sqrt{2}`. Removed first so the
  // rest of this chain sees the mathematics rather than the decoration.
  .replace(/\\left|\\right/g, '')
  // `\frac53` and `\frac5{x+1}` → `\frac{5}{3}`. A brace-less part is exactly
  // one character; anything longer already carries its braces.
  .replace(/\\([dt]?frac)(?!\s*\{)\s*(\\?[A-Za-z0-9])\s*(\{[^{}]*\}|\\?[A-Za-z0-9])/g,
    (match, command, first, second) => `\\${command}{${first}}${second.startsWith('{') ? second : `{${second}}`}`)
  .replace(/\\([dt]?frac)\s*(\{[^{}]*\})\s*(\\?[A-Za-z0-9])(?![A-Za-z0-9])/g,
    (match, command, first, second) => `\\${command}${first}{${second}}`)
  // `\surd` is the bare radical glyph and `√` is the character an answer key
  // is often written with; `\sqrt` is the one with a body. All three mean the
  // same root, so they are spelled the same way before anything compares them.
  .replace(/(?:\\surd|√)\s*(\{[^{}]*\}|\([^()]*\)|[A-Za-z0-9]+)/g, (match, body) => `\\sqrt{${body.replace(/^[({]|[)}]$/g, '')}}`)
  // ASCIIMath `sqrt(2)` is the same root as `\sqrt{2}`, and answer keys are
  // written both ways. So are the redundant brackets the editor leaves behind
  // when a student types `sqrt(` and MathLive closes the fence for them.
  .replace(/\bsqrt\s*\(([^()]*)\)/g, '\\sqrt{$1}')
  .replace(/\\sqrt\{\(([^()]*)\)\}/g, '\\sqrt{$1}')
  // `^{(n-1)}` is the same power as `^(n-1)`: the braces are the editor's
  // bookkeeping around a group that already has its own brackets.
  .replace(/([\^_])\{(\([^()]*\))\}/g, '$1$2')
  // `\frac{(r-3)}{2}` is `\frac{r-3}{2}`. A fraction bar already groups its
  // parts, so brackets round a whole part are the editor's, not the student's.
  .replace(/\\([dt]?frac)\{\(([^()]*)\)\}/g, '\\$1{$2}')
  .replace(/(\\[dt]?frac\{[^{}]*\})\{\(([^()]*)\)\}/g, '$1{$2}')
  // `x^{2}` and `x^{2}` are the same power as `x^2`; braces round a single
  // token are MathLive's bookkeeping, not the student's meaning.
  .replace(/([\^_])\{(-?[A-Za-z0-9])\}/g, '$1$2');

/**
 * LaTeX in, ordinary algebra out.
 *
 * MathLive produces `\frac{3}{2}x`, a keyboard produces `3/2x`, and the seed
 * bank contains both. `\frac` is rewritten innermost-first so nested fractions
 * survive.
 */
export const normalizeAlgebraicText = (value) => {
  let text = expandLatexShorthand(value)
    .replace(UNICODE_MINUS, '-')
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:cdot|times)/g, '*')
    .replace(/\\(?:,|;|!|quad|qquad| )/g, '')
    .replace(/\\(?:text|mathrm|operatorname)\{([^{}]*)\}/g, '$1')
    .replace(/\s+/g, '');

  // Innermost `\frac{a}{b}` first, so `\frac{\frac{1}{2}}{3}` resolves.
  for (let guard = 0; guard < 12; guard += 1) {
    const next = text.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))');
    if (next === text) break;
    text = next;
  }
  if (/\\[dt]?frac/.test(text)) return null; // a fraction we could not resolve

  // `x^{2}` and `x^{-1}` become `x^(2)`; a bare `x^2` is already fine.
  text = text.replace(/\{/g, '(').replace(/\}/g, ')');
  if (/\\[a-z]/i.test(text)) return null; // an unrecognised command: refuse rather than guess
  return text;
};

const tokenize = (text) => {
  const tokens = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (/\d|\./.test(char)) {
      const match = /^\d*\.?\d+/.exec(text.slice(index));
      if (!match) return null;
      tokens.push({ kind: 'number', value: Number(match[0]) });
      index += match[0].length;
    } else if (/[a-zA-Z]/.test(char)) {
      tokens.push({ kind: 'name', value: char.toLowerCase() });
      index += 1;
    } else if ('+-*/^()'.includes(char)) {
      tokens.push({ kind: char });
      index += 1;
    } else {
      return null; // an inequality sign, a comma, an interval bracket: not our job
    }
  }
  return tokens;
};

/**
 * Recursive descent over `+ - * / ^` with implicit multiplication.
 *
 * Multiplication and division share a precedence level and associate to the
 * left, which is the ordinary reading and the one the bank assumes: `3/2x` is
 * `(3/2)·x`, not `3/(2x)`. A student who means the latter writes the brackets.
 */
const parseTokens = (tokens) => {
  let position = 0;
  const peek = () => tokens[position] || null;
  const startsAtom = () => {
    const token = peek();
    return Boolean(token) && (token.kind === 'number' || token.kind === 'name' || token.kind === '(');
  };

  let parseExpression;

  const parseAtom = () => {
    const token = peek();
    if (!token) return null;
    if (token.kind === 'number') { position += 1; return constantPoly(token.value); }
    if (token.kind === 'name') { position += 1; return variablePoly(token.value); }
    if (token.kind === '(') {
      position += 1;
      const inner = parseExpression();
      if (!inner || peek()?.kind !== ')') return null;
      position += 1;
      return inner;
    }
    return null;
  };

  const parseUnary = () => {
    const token = peek();
    if (token?.kind === '-') { position += 1; const operand = parseUnary(); return operand && addPoly(new Map(), operand, -1); }
    if (token?.kind === '+') { position += 1; return parseUnary(); }
    const base = parseAtom();
    if (!base) return null;
    if (peek()?.kind === '^') {
      position += 1;
      const exponent = parseUnary();
      return exponent && powerPoly(base, exponent);
    }
    return base;
  };

  const parseProduct = () => {
    let left = parseUnary();
    if (!left) return null;
    for (;;) {
      const token = peek();
      if (token?.kind === '*') {
        position += 1;
        const right = parseUnary();
        if (!right) return null;
        left = multiplyPoly(left, right);
      } else if (token?.kind === '/') {
        position += 1;
        const right = parseUnary();
        if (!right) return null;
        const quotient = dividePoly(left, right);
        if (!quotient) return null;
        left = quotient;
      } else if (startsAtom()) {
        // Implicit multiplication: `2x`, `3(x+1)`, `x y`.
        const right = parseUnary();
        if (!right) return null;
        left = multiplyPoly(left, right);
      } else {
        return left;
      }
    }
  };

  parseExpression = () => {
    let left = parseProduct();
    if (!left) return null;
    for (;;) {
      const token = peek();
      if (token?.kind !== '+' && token?.kind !== '-') return left;
      position += 1;
      const right = parseProduct();
      if (!right) return null;
      left = addPoly(left, right, token.kind === '-' ? -1 : 1);
    }
  };

  const result = parseExpression();
  // A trailing token means we did not understand the whole expression, and a
  // partial understanding is worse than none.
  return result && position === tokens.length ? result : null;
};

/** One side of an equation as a polynomial, or null when it cannot be read. */
export const parsePolynomial = (value) => {
  const text = normalizeAlgebraicText(value);
  if (!text) return null;
  const tokens = tokenize(text);
  if (!tokens || !tokens.length) return null;
  return parseTokens(tokens);
};

/** `left = right`, split at the single top-level equals sign. */
export const splitEquationSides = (value) => {
  const text = String(value ?? '');
  const parts = text.split('=');
  if (parts.length !== 2) return null;
  if (!parts[0].trim() || !parts[1].trim()) return null;
  return { left: parts[0], right: parts[1] };
};

/**
 * Whether two written equations say the same thing in the same arrangement.
 *
 * Both sides must parse, both must be at most degree one, and each side must
 * match its counterpart coefficient for coefficient. That is enough to accept
 * `y=6/4x-6` for `y=1.5x-6` and still refuse `y-5=-3(x-2)` for a question that
 * asked for slope-intercept form.
 *
 * The degree limit is the guard that keeps this from grading form questions.
 * Above degree one, `(x+2)(x+3)` and `x^2+5x+6` are the same polynomial and
 * different answers, and only the author knows which was wanted.
 */
export const sameLinearEquation = (left, right, tolerance = 1e-6) => {
  const a = splitEquationSides(left);
  const b = splitEquationSides(right);
  if (!a || !b) return false;

  const sides = [
    [parsePolynomial(a.left), parsePolynomial(b.left)],
    [parsePolynomial(a.right), parsePolynomial(b.right)],
  ];
  if (sides.some(([one, two]) => !one || !two)) return false;
  if (sides.some(([one, two]) => polynomialDegree(one) > 1 || polynomialDegree(two) > 1)) return false;
  return sides.every(([one, two]) => samePolynomial(one, two, tolerance));
};
