import { normalizeAlgebraicText, parsePolynomial, splitEquationSides } from './algebraicForm.mjs';
import { sameLinearInequality } from './linearInequalityEquivalence.mjs';
import { sameSimpleInequality, asNumber } from './answerEquivalence.mjs';

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

  // MathLive deliberately renders multiplication between single-letter
  // variables without a dot: c*y becomes "cy" inside a rendered fraction.
  // Solver Race literal equations use single-letter symbols, so split a
  // letters-only run back into its factors before inserting multiplication.
  // Identifiers containing digits or underscores remain intact.
  const factors = raw.flatMap((token) => (
    /^[A-Za-z]{2,}$/.test(token) ? [...token] : [token]
  ));
  const tokens = [];
  const isValueEnd = (token) => token && (/^(?:\d|[A-Za-z]|\))/.test(token));
  const isValueStart = (token) => token && (/^(?:\d|[A-Za-z]|\()/.test(token));
  factors.forEach((token) => {
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

const EPSILON = 1e-7;
const close = (a, b) => a === b || ([a, b].every(Number.isFinite)
  && Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b)));
const reverseRelation = (relation) => ({ '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' })[relation];

const linearCoefficients = (expression, variable) => {
  const polynomial = parsePolynomial(expression);
  if (!polynomial) return null;
  let coefficient = 0;
  let constant = 0;
  for (const [key, value] of polynomial) {
    if (key === variable) coefficient += value;
    else if (key === '') constant += value;
    else return null;
  }
  return { coefficient, constant };
};

const polynomialDelta = (relation) => {
  const sides = splitEquationSides(relation);
  if (!sides) return null;
  const left = parsePolynomial(sides.left);
  const right = parsePolynomial(sides.right);
  if (!left || !right) return null;
  const delta = new Map(left);
  for (const [key, value] of right) delta.set(key, (delta.get(key) || 0) - value);
  for (const [key, value] of delta) if (Math.abs(value) < 1e-9) delta.delete(key);
  return delta.size ? delta : null;
};

const proportionalPolynomialRelations = (left, right) => {
  const a = polynomialDelta(left);
  const b = polynomialDelta(right);
  if (!a || !b) return false;
  const keys = new Set([...a.keys(), ...b.keys()]);
  let ratio = null;
  for (const key of keys) {
    const av = a.get(key) || 0;
    const bv = b.get(key) || 0;
    if (Math.abs(av) < 1e-9 && Math.abs(bv) < 1e-9) continue;
    if (Math.abs(av) < 1e-9 || Math.abs(bv) < 1e-9) return false;
    const next = bv / av;
    if (!Number.isFinite(next) || Math.abs(next) < 1e-9) return false;
    if (ratio == null) ratio = next;
    else if (!close(next, ratio)) return false;
  }
  return ratio != null;
};

const splitRelation = (value) => {
  const normalized = String(value ?? '').replace(/≤|\\leq?|\\le/g, '<=').replace(/≥|\\geq?|\\ge/g, '>=').trim();
  const expressions = [];
  const relations = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if ('([{'.includes(character)) depth += 1;
    else if (')]}'.includes(character)) depth -= 1;
    if (depth !== 0) continue;
    const pair = normalized.slice(index, index + 2);
    const relation = ['<=', '>='].includes(pair) ? pair : ['=', '<', '>'].includes(character) ? character : null;
    if (!relation) continue;
    expressions.push(normalized.slice(start, index).trim());
    relations.push(relation);
    index += relation.length - 1;
    start = index + 1;
  }
  expressions.push(normalized.slice(start).trim());
  return relations.length && expressions.every(Boolean) && expressions.length === relations.length + 1
    ? { expressions, relations }
    : null;
};

const linearEquationRoots = (value, variable) => {
  const branches = clean(value).split(/\s+OR\s+/i);
  const roots = [];
  for (const branch of branches) {
    const relation = splitRelation(branch);
    if (!relation || relation.relations.length !== 1 || relation.relations[0] !== '=') return null;
    const left = linearCoefficients(relation.expressions[0], variable);
    const right = linearCoefficients(relation.expressions[1], variable);
    if (!left || !right) return null;
    const coefficient = left.coefficient - right.coefficient;
    if (Math.abs(coefficient) <= EPSILON) return null;
    roots.push((right.constant - left.constant) / coefficient);
  }
  return [...roots].sort((a, b) => a - b);
};

const constraintInterval = (leftExpression, relation, rightExpression, variable) => {
  const left = linearCoefficients(leftExpression, variable);
  const right = linearCoefficients(rightExpression, variable);
  if (!left || !right || relation === '=') return null;
  let coefficient = left.coefficient - right.coefficient;
  let bound = right.constant - left.constant;
  let direction = relation;
  if (Math.abs(coefficient) <= EPSILON) return null;
  if (coefficient < 0) {
    coefficient *= -1;
    bound *= -1;
    direction = reverseRelation(direction);
  }
  const endpoint = bound / coefficient;
  return direction === '<' || direction === '<='
    ? { low: -Infinity, high: endpoint, lowClosed: false, highClosed: direction === '<=' }
    : { low: endpoint, high: Infinity, lowClosed: direction === '>=', highClosed: false };
};

const intersectIntervals = (left, right) => {
  const low = Math.max(left.low, right.low);
  const high = Math.min(left.high, right.high);
  if (low > high + EPSILON) return null;
  const lowClosed = left.low > right.low ? left.lowClosed
    : right.low > left.low ? right.lowClosed : left.lowClosed && right.lowClosed;
  const highClosed = left.high < right.high ? left.highClosed
    : right.high < left.high ? right.highClosed : left.highClosed && right.highClosed;
  if (close(low, high) && !(lowClosed && highClosed)) return null;
  return { low, high, lowClosed, highClosed };
};

const linearInequalityIntervals = (value, variable) => {
  const branches = clean(value).split(/\s+OR\s+/i);
  const intervals = [];
  for (const branch of branches) {
    const parsed = splitRelation(branch.replace(/\s+AND\s+/ig, ' '));
    if (!parsed || parsed.relations.length > 2 || parsed.relations.includes('=')) return null;
    let interval = { low: -Infinity, high: Infinity, lowClosed: false, highClosed: false };
    for (let index = 0; index < parsed.relations.length; index += 1) {
      const constraint = constraintInterval(
        parsed.expressions[index], parsed.relations[index], parsed.expressions[index + 1], variable,
      );
      interval = constraint && intersectIntervals(interval, constraint);
      if (!interval) return null;
    }
    intervals.push(interval);
  }
  return intervals.sort((a, b) => a.low - b.low);
};

const sameIntervals = (left, right) => left && right && left.length === right.length
  && left.every((interval, index) => {
    const candidate = right[index];
    return (interval.low === candidate.low || close(interval.low, candidate.low))
      && (interval.high === candidate.high || close(interval.high, candidate.high))
      && interval.lowClosed === candidate.lowClosed
      && interval.highClosed === candidate.highClosed;
  });


const findAbsoluteExpression = (value) => {
  const text = String(value ?? '');
  const bars = text.match(/\|([^|]+)\|/);
  if (bars) return { whole: bars[0], inner: bars[1] };
  const start = text.search(/\babs\s*\(/i);
  if (start < 0) return null;
  const open = text.indexOf('(', start);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    else if (text[index] === ')') depth -= 1;
    if (depth === 0) return { whole: text.slice(start, index + 1), inner: text.slice(open + 1, index) };
  }
  return null;
};

const canonicalAbsoluteConstraint = (value, variable) => {
  const absolute = findAbsoluteExpression(value);
  if (!absolute) return null;
  const relation = splitRelation(String(value).replace(absolute.whole, 'z'));
  if (!relation || relation.relations.length !== 1) return null;
  const left = linearCoefficients(relation.expressions[0], 'z');
  const right = linearCoefficients(relation.expressions[1], 'z');
  const inner = linearCoefficients(absolute.inner, variable);
  if (!left || !right || !inner || Math.abs(inner.coefficient) <= EPSILON) return null;
  let coefficient = left.coefficient - right.coefficient;
  let constant = left.constant - right.constant;
  let comparison = relation.relations[0];
  if (Math.abs(coefficient) <= EPSILON) return null;
  if (coefficient < 0) {
    coefficient *= -1;
    constant *= -1;
    comparison = reverseRelation(comparison);
  }
  return {
    comparison,
    centerOffset: inner.constant / inner.coefficient,
    bound: (-constant / coefficient) / Math.abs(inner.coefficient),
  };
};

const equivalentAbsoluteConstraint = (left, right, variable) => {
  const a = canonicalAbsoluteConstraint(left, variable);
  const b = canonicalAbsoluteConstraint(right, variable);
  return a && b && a.comparison === b.comparison
    && close(a.centerOffset, b.centerOffset) && close(a.bound, b.bound);
};

const inequalityBranches = (value) => clean(value).split(/\s+OR\s+/i).map((entry) => entry.trim());

const isAllRealResponse = (value) => /^(?:all real numbers|all reals)$/i.test(clean(value));
const isNoSolutionResponse = (value) => /^(?:no solution|none|empty set|∅)$/i.test(clean(value));
const sameInequalityBranch = (left, right) => (
  sameSimpleInequality(left, right) || sameLinearInequality(left, right)
);

export const gradeSolverRaceRelation = ({ family, expected, variable = 'x', actual }) => {
  if (family === 'linearEquation') {
    return sameNumericSet(equationSolutions(actual, variable), equationSolutions(expected, variable));
  }
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
    if (isAllRealResponse(expected)) return isAllRealResponse(actual);
    if (isNoSolutionResponse(expected)) return isNoSolutionResponse(actual);
    const left = inequalityBranches(actual);
    const right = inequalityBranches(expected);
    if (left.length !== right.length) return false;
    const remaining = [...right];
    const oneToOne = left.every((branch) => {
      const index = remaining.findIndex((candidate) => sameInequalityBranch(branch, candidate));
      if (index < 0) return false;
      remaining.splice(index, 1);
      return true;
    });
    return (oneToOne && remaining.length === 0)
      || sameSimpleInequality(actual.replace(/\s+AND\s+/i, ''), expected.replace(/\s+AND\s+/i, ''));
  }
  return false;
};

export const solverRaceRelationChanged = (actual, initial) => {
  const current = String(actual ?? '').trim();
  const starting = String(initial ?? '').trim();
  return Boolean(current && starting && normalizeAlgebraicText(current) !== normalizeAlgebraicText(starting));
};

/**
 * Authoritative credit for a solver relation that is valid but not final.
 *
 * The current relation must describe exactly the same solution set as the
 * server-held problem. Absolute-value work is verified in either of the two
 * states the relation workspace can produce: an equivalent isolated absolute
 * constraint, or a correctly split set of linear branches. Merely changing
 * text, client score fields, and the local step history are irrelevant here.
 */
export const solverRaceProgressScore = ({
  family,
  initial,
  expected,
  actual,
  variable = 'x',
  solutionDepth = 1,
  isCorrect = false,
}) => {
  const current = String(actual ?? '').trim();
  const starting = String(initial ?? '').trim();
  if (!solverRaceRelationChanged(current, starting)) return 0;
  if (isCorrect) return 1;

  let verified = false;
  if (family === 'linearEquation' || family === 'literalEquation') {
    verified = proportionalPolynomialRelations(current, starting);
  } else if (family === 'linearInequality') {
    verified = sameLinearInequality(current, starting);
  } else if (family === 'absoluteValueEquation') {
    verified = equivalentAbsoluteConstraint(current, starting, variable)
      || sameNumericSet(linearEquationRoots(current, variable), equationSolutions(expected, variable));
  } else if (family === 'absoluteValueInequality') {
    verified = equivalentAbsoluteConstraint(current, starting, variable)
      || sameIntervals(
        linearInequalityIntervals(current, variable),
        linearInequalityIntervals(expected, variable),
      );
  }

  return verified ? Math.min(.9, 1 / Math.max(1, Number(solutionDepth) || 1)) : 0;
};

const relationOperationComplexity = (value) => {
  const text = normalizeAlgebraicText(String(value ?? ''));
  const binaryOperators = (text.match(/[+*/]/g) || []).length
    + (text.match(/-(?!\d+(?:\.\d+)?(?:\b|$))/g) || []).length;
  const branches = (text.match(/\b(?:AND|OR)\b/gi) || []).length;
  const absoluteConstraints = Math.floor((text.match(/\|/g) || []).length / 2);
  return binaryOperators + branches + absoluteConstraints;
};

/** Server-derived progress depth for a relation already proven equivalent. */
export const solverRaceProductiveDepth = ({
  family, initial, expected, actual, variable = 'x', solutionDepth = 1, isCorrect = false,
}) => {
  const expectedDepth = Math.max(1, Math.floor(Number(solutionDepth) || 1));
  if (isCorrect) return expectedDepth;
  const score = solverRaceProgressScore({ family, initial, expected, actual, variable, solutionDepth, isCorrect });
  if (!(score > 0) || expectedDepth <= 1) return 0;
  const initialComplexity = relationOperationComplexity(initial);
  const currentComplexity = relationOperationComplexity(actual);
  const reducedOperations = Math.max(0, initialComplexity - currentComplexity);
  return Math.min(expectedDepth - 1, Math.max(1, reducedOperations));
};
