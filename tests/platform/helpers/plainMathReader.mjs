/*
 * A SMALL, INDEPENDENT READER FOR LESSON KEYS (tests only).
 *
 * The prompt's LaTeX and a key's typed form, evaluated with plain
 * floating-point arithmetic — never with a grader's own reader — so a key
 * cannot pass a lesson test by agreeing with itself. Shared by the Algebra II
 * polynomials and radicals lesson tests (Regular and Honors).
 */
// The prompt's LaTeX ("\sqrt[3]{ -64 a^3 y^{ 15 } }", "\dfrac{3}{\sqrt{2}}")
// and a key's typed form ("7a^2√(2a)", "cbrt(6x^2)/(3x)", "|m-1|",
// "x^(1/5)/x") as one expression, evaluated with Math. Letters multiply; √, ∛
// and ∜ take the factor after them.
export const plain = (text) => {
  let value = String(text)
    .replace(/[−–]/g, '-')
    .replace(/\\left|\\right|\\[,;!]/g, '')
    .replace(/\\(?:cdot|times)/g, '*')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4');
  // Innermost groups first; a root's or a fraction's own braces wait for it.
  for (let previous = ''; previous !== value;) {
    previous = value;
    value = value
      .replace(/\\sqrt\[(\d+)\]\{([^{}]*)\}/g, ' root($1)($2)')
      .replace(/\\sqrt\{([^{}]*)\}/g, ' sqrt($1)')
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
      .replace(/(?<!\\sqrt(?:\[\d+\])?|\\[dt]?frac|\})\{([^{}]*)\}/g, '($1)');
  }
  return value;
};
const FUNCTIONS = new Set(['sqrt', 'cbrt', 'root', 'abs']);
const RADICALS = '√∛∜';
export const tokensOf = (text) => {
  const source = plain(text);
  const tokens = [];
  for (let index = 0; index < source.length;) {
    const rest = source.slice(index);
    const match = /^\s+/.exec(rest) || /^\d*\.?\d+/.exec(rest) || /^[A-Za-z]+/.exec(rest);
    if (match && /^\s/.test(match[0])) {
      index += match[0].length;
    } else if (match && /^[\d.]/.test(match[0])) {
      tokens.push({ kind: 'num', value: Number(match[0]) });
      index += match[0].length;
    } else if (match) {
      if (FUNCTIONS.has(match[0])) tokens.push({ kind: 'fn', name: match[0] });
      else [...match[0]].forEach((letter) => tokens.push({ kind: 'var', name: letter }));
      index += match[0].length;
    } else if (RADICALS.includes(rest[0])) {
      tokens.push({ kind: 'radical', index: RADICALS.indexOf(rest[0]) + 2 });
      index += 1;
    } else if ('+-*/^()|'.includes(rest[0])) {
      tokens.push({ kind: rest[0] });
      index += 1;
    } else {
      throw new Error(`cannot read "${rest[0]}" in ${text}`);
    }
  }
  return tokens;
};
export const realRoot = (value, index) => (value >= 0 ? value ** (1 / index) : index % 2 === 1 ? -((-value) ** (1 / index)) : Number.NaN);
// A negative base takes an odd root: (−125)^(1/3) is −5.
export const raise = (base, exponent) => {
  if (base >= 0 || Number.isInteger(exponent)) return base ** exponent;
  for (let q = 3; q <= 15; q += 2) {
    const p = Math.round(exponent * q);
    if (Math.abs(p / q - exponent) < 1e-12) return (p % 2 ? -1 : 1) * (-base) ** exponent;
  }
  return Number.NaN;
};
export const read = (text) => {
  const tokens = tokensOf(text);
  let at = 0;
  let bars = 0;
  const fail = () => { throw new Error(`cannot read ${text}`); };
  const expect = (kind) => { if (tokens[at]?.kind !== kind) fail(); at += 1; };
  const startsFactor = (token) => Boolean(token) && (['num', 'var', 'fn', 'radical', '('].includes(token.kind) || (token.kind === '|' && bars === 0));
  let sum;
  const group = () => { expect('('); const inner = sum(); expect(')'); return inner; };
  const atom = () => {
    const token = tokens[at];
    if (token?.kind === '(') return group();
    at += 1;
    if (token?.kind === 'num') return () => token.value;
    if (token?.kind === 'var') return (scope) => scope[token.name];
    if (token?.kind === '|') {
      bars += 1;
      const inner = sum();
      bars -= 1;
      expect('|');
      return (scope) => Math.abs(inner(scope));
    }
    if (token?.kind === 'radical') {
      const radicand = atom();
      return (scope) => realRoot(radicand(scope), token.index);
    }
    if (token?.kind === 'fn' && token.name === 'root') {
      const index = group();
      const radicand = group();
      return (scope) => realRoot(radicand(scope), index(scope));
    }
    if (token?.kind === 'fn') {
      const argument = group();
      if (token.name === 'abs') return (scope) => Math.abs(argument(scope));
      return (scope) => realRoot(argument(scope), token.name === 'cbrt' ? 3 : 2);
    }
    return fail();
  };
  let unary;
  const power = () => {
    const base = atom();
    if (tokens[at]?.kind !== '^') return base;
    at += 1;
    const exponent = unary();
    return (scope) => raise(base(scope), exponent(scope));
  };
  unary = () => {
    if (tokens[at]?.kind === '-') {
      at += 1;
      const argument = unary();
      return (scope) => -argument(scope);
    }
    if (tokens[at]?.kind === '+') at += 1;
    return power();
  };
  const product = () => {
    let value = unary();
    for (;;) {
      const token = tokens[at];
      const left = value;
      if (token?.kind === '*' || token?.kind === '/') {
        at += 1;
        const right = unary();
        value = token.kind === '*' ? (scope) => left(scope) * right(scope) : (scope) => left(scope) / right(scope);
      } else if (startsFactor(token)) {
        const right = power();
        value = (scope) => left(scope) * right(scope);
      } else {
        return value;
      }
    }
  };
  sum = () => {
    let value = product();
    while (tokens[at]?.kind === '+' || tokens[at]?.kind === '-') {
      const sign = tokens[at].kind === '+' ? 1 : -1;
      at += 1;
      const left = value;
      const right = product();
      value = (scope) => left(scope) + sign * right(scope);
    }
    return value;
  };
  const whole = sum();
  if (at !== tokens.length) fail();
  return whole;
};
export const evaluator = (text) => {
  try {
    return read(text);
  } catch {
    return null;
  }
};

// Six points, every letter positive (the lessons' standing assumption).
export const SCOPES = [0, 1, 2, 3, 4, 5].map((sample) => Object.fromEntries(
  [...'abcdefghijklmnopqrstuvwxyz'].map((letter, index) => [letter, 0.55 + ((7 * index + 11 * sample) % 23) / 8]),
));
export const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
export const sameValue = (left, right) => {
  const f = typeof left === 'function' ? left : evaluator(left);
  const g = typeof right === 'function' ? right : evaluator(right);
  return Boolean(f && g) && SCOPES.every((scope) => close(f(scope), g(scope)));
};

// Each $…$ of a prompt, and each side of the equations among them.
export const segmentsOf = (prompt) => (String(prompt).match(/\$[^$]+\$/g) || []).map((segment) => segment.slice(1, -1));
export const sidesOf = (prompt) => segmentsOf(prompt).flatMap((segment) => segment.split('='));
