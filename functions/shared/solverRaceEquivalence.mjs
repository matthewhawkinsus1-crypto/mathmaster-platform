import { normalizeAlgebraicText, splitEquationSides } from './algebraicForm.mjs';
import { sameLinearInequality } from './linearInequalityEquivalence.mjs';
import { sameSimpleInequality, sameText, asNumber } from './answerEquivalence.mjs';

const clean = (value) => String(value ?? '').trim()
  .replace(/\s+(?:or|OR)\s+/g, ' OR ')
  .replace(/\s+(?:and|AND)\s+/g, ' AND ');

const isolatedFor = (relation, variable) => {
  const sides = splitEquationSides(relation);
  if (!sides) return false;
  return sides.left.trim() === variable || sides.right.trim() === variable;
};

const tokenizeRational = (value) => {
  const text = normalizeAlgebraicText(value);
  if (!text || text.length > 120 || /[\^=<>|]/.test(text)) return null;
  const raw = text.match(/\d+(?:\.\d+)?|[A-Za-z][A-Za-z0-9_]*|[()+\-*/]/g);
  if (!raw || raw.join('') !== text.replace(/\s+/g, '') || raw.length > 80) return null;
  const tokens = [];
  const isValueEnd = (token) => token && (/^(?:\d|[A-Za-z]|\))/.test(token));
  const isValueStart = (token) => token && (/^(?:\d|[A-Za-z]|\()/.test(token));
  raw.forEach((token) => {
    if (isValueEnd(tokens[tokens.length - 1]) && isValueStart(token)) tokens.push('*');
    tokens.push(token);
  });
  return tokens;
};

const evaluateRational = (expression, values) => {
  const tokens = tokenizeRational(expression);
  if (!tokens) return null;
  let position = 0;
  const primary = () => {
    const token = tokens[position];
    if (token === '+' || token === '-') {
      position += 1;
      const value = primary();
      return value == null ? null : (token === '-' ? -value : value);
    }
    if (token === '(') {
      position += 1;
      const value = sum();
      if (tokens[position] !== ')') return null;
      position += 1;
      return value;
    }
    if (/^\d/.test(token || '')) {
      position += 1;
      return Number(token);
    }
    if (/^[A-Za-z]/.test(token || '') && Object.hasOwn(values, token)) {
      position += 1;
      return values[token];
    }
    return null;
  };
  const product = () => {
    let value = primary();
    if (value == null) return null;
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position++];
      const right = primary();
      if (right == null || (operator === '/' && Math.abs(right) < 1e-12)) return null;
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };
  const sum = () => {
    let value = product();
    if (value == null) return null;
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++];
      const right = product();
      if (right == null) return null;
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };
  const result = sum();
  return result != null && position === tokens.length && Number.isFinite(result) ? result : null;
};

const isolatedExpression = (relation, variable) => {
  const sides = splitEquationSides(relation);
  if (!sides) return null;
  if (sides.left.trim() === variable && !new RegExp(`\\b${variable}\\b`).test(sides.right)) return sides.right;
  if (sides.right.trim() === variable && !new RegExp(`\\b${variable}\\b`).test(sides.left)) return sides.left;
  return null;
};

/** Bounded semantic equivalence for the catalog's rational-linear literals. */
export const sameLiteralIsolation = (actual, expected, variable) => {
  const left = isolatedExpression(actual, variable);
  const right = isolatedExpression(expected, variable);
  if (!left || !right || !tokenizeRational(left) || !tokenizeRational(right)) return false;
  const symbols = [...new Set(`${left} ${right}`.match(/[A-Za-z][A-Za-z0-9_]*/g) || [])]
    .filter((symbol) => symbol !== variable);
  if (symbols.length > 8) return false;
  let compared = 0;
  for (let sample = 0; sample < 12; sample += 1) {
    const values = Object.fromEntries(symbols.map((symbol, index) => [symbol, ((sample + 2) * (index + 3) % 17) + 1]));
    const a = evaluateRational(left, values);
    const b = evaluateRational(right, values);
    if (a == null || b == null) continue; // normal nonzero literal-coefficient assumption
    compared += 1;
    if (Math.abs(a - b) > 1e-8 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
  }
  return compared >= 8;
};

const equationSolutions = (value, variable) => {
  const text = clean(value);
  if (/^(?:no solution|none|empty set|∅)$/i.test(text)) return [];
  const branches = text.split(/\s+OR\s+/i);
  const values = [];
  for (const branch of branches) {
    const sides = splitEquationSides(branch);
    if (!sides) return null;
    const other = sides.left.trim() === variable ? sides.right : sides.right.trim() === variable ? sides.left : null;
    const numeric = asNumber(other);
    if (numeric === null) return null;
    values.push(numeric);
  }
  return [...new Set(values)].sort((a, b) => a - b);
};

const sameNumericSet = (a, b, tolerance = 1e-6) => a && b && a.length === b.length
  && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);

const inequalityBranches = (value) => clean(value).split(/\s+OR\s+/i).map((entry) => entry.trim());

export const gradeSolverRaceRelation = ({ family, expected, variable = 'x', actual }) => {
  if (family === 'literalEquation') {
    return isolatedFor(actual, variable) && sameLiteralIsolation(actual, expected, variable);
  }
  if (family === 'linearInequality') {
    return sameSimpleInequality(actual, expected) || sameLinearInequality(actual, expected);
  }
  if (family === 'absoluteValueEquation') {
    return sameNumericSet(equationSolutions(actual, variable), equationSolutions(expected, variable));
  }
  if (family === 'absoluteValueInequality') {
    if (/^(?:all real numbers|all reals)$/i.test(expected) || /^(?:no solution|none|empty set|∅)$/i.test(expected)) {
      return sameText(actual, expected)
        || (/^all real/i.test(expected) && /^all real/i.test(actual))
        || (/^(?:no solution|none|empty set|∅)$/i.test(expected) && /^(?:no solution|none|empty set|∅)$/i.test(actual));
    }
    const left = inequalityBranches(actual);
    const right = inequalityBranches(expected);
    if (left.length !== right.length) return false;
    const remaining = [...right];
    const oneToOne = left.every((branch) => {
      const index = remaining.findIndex((candidate) => sameSimpleInequality(branch, candidate));
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
    return (oneToOne && remaining.length === 0)
      || sameSimpleInequality(actual.replace(/\s+AND\s+/i, ''), expected.replace(/\s+AND\s+/i, ''));
  }
  return false;
};
