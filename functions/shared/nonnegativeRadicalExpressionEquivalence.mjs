// Semantic equivalence for monomial radical/rational-exponent expressions
// under an EXPLICIT nonnegative-variable assumption.
//
// A2.7G asks students to rewrite variable radical expressions into equivalent
// forms. Generic form-preserving grading can normalize MathLive's spelling of
// sqrt, but it cannot prove that sqrt(x^5), x^2*sqrt(x), and x^(5/2) are the
// same expression. This opt-in comparator handles that narrow monomial world.
//
// IMPORTANT: even roots are interpreted this way only when the authored field
// explicitly opts in and the prompt supplies the needed nonnegative-variable
// assumption. The separate absolute-value family does NOT use this comparator.

import {
  expandLatexShorthand,
  normalizeAlgebraicText,
} from './algebraicForm.mjs';

const EPS = 1e-9;

const radicalPowers = (value) => {
  let text = expandLatexShorthand(value)
    .replace(/\^\{(-?\d+(?:\.\d+)?)\}/g, '^($1)');

  // Innermost radical first. After exponent-brace normalization, the A2.7G
  // monomial bodies contain no nested braces except a nested radical, which
  // settles on an earlier pass.
  for (let guard = 0; guard < 16; guard += 1) {
    const next = text.replace(
      /\\sqrt(?:\[\s*(\d+)\s*\])?\{([^{}]+)\}/g,
      (match, rawIndex, body) => {
        const index = rawIndex ? Number(rawIndex) : 2;
        if (!Number.isInteger(index) || index < 2 || index > 12) return match;
        return `((${body})^(1/${index}))`;
      },
    );
    if (next === text) break;
    text = next;
  }

  if (/\\sqrt/.test(text)) return null;
  return normalizeAlgebraicText(text);
};

const tokenize = (text) => {
  const tokens = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (/\s/.test(char)) { index += 1; continue; }
    if (/\d|\./.test(char)) {
      const match = /^\d*\.?\d+/.exec(text.slice(index));
      if (!match) return null;
      tokens.push({ kind: 'number', value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z]/.test(char)) {
      tokens.push({ kind: 'name', value: char.toLowerCase() });
      index += 1;
      continue;
    }
    if ('+-*/^()'.includes(char)) {
      tokens.push({ kind: char });
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
};

const constant = (value) => ({ coefficient: value, powers: new Map() });
const variable = (name) => ({ coefficient: 1, powers: new Map([[name, 1]]) });

const clone = (value) => ({
  coefficient: value.coefficient,
  powers: new Map(value.powers),
});

const multiply = (left, right, sign = 1) => {
  if (!left || !right) return null;
  const out = clone(left);
  if (sign === 1) out.coefficient *= right.coefficient;
  else {
    if (Math.abs(right.coefficient) < EPS) return null;
    out.coefficient /= right.coefficient;
  }
  for (const [name, power] of right.powers) {
    out.powers.set(name, (out.powers.get(name) || 0) + sign * power);
  }
  return out;
};

const asConstant = (value) => (
  value && value.powers.size === 0 && Number.isFinite(value.coefficient)
    ? value.coefficient
    : null
);

const power = (base, exponentValue) => {
  const exponent = asConstant(exponentValue);
  if (!base || exponent === null || !Number.isFinite(exponent)) return null;
  if (base.coefficient < 0 && Math.abs(exponent - Math.round(exponent)) > EPS) return null;
  const coefficient = base.coefficient ** exponent;
  if (!Number.isFinite(coefficient)) return null;
  const powers = new Map();
  for (const [name, current] of base.powers) powers.set(name, current * exponent);
  return { coefficient, powers };
};

const parseMonomial = (value) => {
  const text = radicalPowers(value);
  if (!text) return null;
  const tokens = tokenize(text);
  if (!tokens || !tokens.length) return null;

  let position = 0;
  const peek = () => tokens[position] || null;
  const startsAtom = () => {
    const token = peek();
    return token && (token.kind === 'number' || token.kind === 'name' || token.kind === '(');
  };

  let parseProduct;

  const parsePrimary = () => {
    const token = peek();
    if (!token) return null;
    if (token.kind === 'number') {
      position += 1;
      return constant(token.value);
    }
    if (token.kind === 'name') {
      position += 1;
      return variable(token.value);
    }
    if (token.kind === '(') {
      position += 1;
      const inner = parseProduct();
      if (!inner || peek()?.kind !== ')') return null;
      position += 1;
      return inner;
    }
    return null;
  };

  const parseUnary = () => {
    if (peek()?.kind === '+') {
      position += 1;
      return parseUnary();
    }
    if (peek()?.kind === '-') {
      position += 1;
      const inner = parseUnary();
      return inner ? { coefficient: -inner.coefficient, powers: inner.powers } : null;
    }
    return parsePrimary();
  };

  const parsePower = () => {
    let base = parseUnary();
    if (!base) return null;
    if (peek()?.kind === '^') {
      position += 1;
      const exponent = parsePower();
      base = power(base, exponent);
    }
    return base;
  };

  parseProduct = () => {
    let left = parsePower();
    if (!left) return null;
    for (;;) {
      if (peek()?.kind === '*') {
        position += 1;
        left = multiply(left, parsePower(), 1);
      } else if (peek()?.kind === '/') {
        position += 1;
        left = multiply(left, parsePower(), -1);
      } else if (startsAtom()) {
        left = multiply(left, parsePower(), 1);
      } else {
        return left;
      }
      if (!left) return null;
    }
  };

  const result = parseProduct();
  return result && position === tokens.length ? result : null;
};

const sameMonomial = (left, right, tolerance) => {
  if (!left || !right) return false;
  if (Math.abs(left.coefficient - right.coefficient) > tolerance) return false;
  const variables = new Set([...left.powers.keys(), ...right.powers.keys()]);
  for (const name of variables) {
    if (Math.abs((left.powers.get(name) || 0) - (right.powers.get(name) || 0)) > tolerance) return false;
  }
  return true;
};

export const sameNonnegativeRadicalExpression = (left, right, tolerance = 1e-6) => (
  sameMonomial(parseMonomial(left), parseMonomial(right), Math.max(tolerance, EPS))
);

export default sameNonnegativeRadicalExpression;
