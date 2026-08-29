import { compile, parse } from 'mathjs';

// Shared parser/evaluator for a model the STUDENT wrote.  This sits below both
// workflow grading and graph rendering so those two systems cannot drift: the
// exact expression used to check the student's table is also the expression
// used to build the student's graph.

const LATEX_TO_MATH = [
  [/\\left|\\right/g, ''],
  [/\\cdot|\\times/g, '*'],
  [/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))'],
  [/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)'],
  [/\\pi/g, 'pi'],
  [/[{}]/g, ''],
  [/\s+/g, ''],
];

const compiledCache = new Map();

const normalizeLatex = (value) => {
  let text = String(value ?? '').trim().replace(/[−–—]/g, '-');
  LATEX_TO_MATH.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
  return text;
};

/**
 * Read a student function definition such as W(t)=5t, f(x)=x+2 or y=3x-1.
 * Returns only information derived from what the student typed; no answer key
 * or authored function is consulted.
 */
export const parseFunctionModel = (value) => {
  const normalized = normalizeLatex(value);
  if (!normalized || /[;\[\]]/.test(normalized) || normalized.length > 300) return null;

  const parts = normalized.split('=');
  let left = '';
  let expression = normalized;
  if (parts.length === 2) {
    [left, expression] = parts;
  } else if (parts.length > 2) {
    return null;
  }
  if (!expression) return null;

  // f(x), W(t), A(n), y, etc.  A bare expression defaults to x.
  // A modelling equation may also use a named dependent quantity without
  // function notation, e.g. V = 12t. In that case V is the OUTPUT name, not
  // the input variable. If the right side contains exactly one other symbol,
  // infer that symbol as the independent variable so V = 12t and V(t) = 12t
  // are treated as the same model.
  let variable = 'x';
  if (left) {
    const call = left.match(/^[A-Za-z][A-Za-z0-9_]*\(([A-Za-z])\)$/);
    const bare = left.match(/^([A-Za-z])$/);
    if (call) {
      variable = call[1];
    } else if (bare) {
      if (bare[1].toLowerCase() === 'y') {
        variable = 'x';
      } else {
        try {
          const symbols = [...new Set(parse(expression)
            .filter((node) => node?.isSymbolNode)
            .map((node) => node.name)
            .filter((name) => /^[A-Za-z]$/.test(name) && name !== bare[1] && !['e'].includes(name.toLowerCase())))];
          variable = symbols.length === 1 ? symbols[0] : bare[1];
        } catch {
          variable = bare[1];
        }
      }
    } else {
      return null;
    }
  }

  try {
    const cacheKey = `${variable}|${expression}`;
    let compiled = compiledCache.get(cacheKey);
    if (!compiled) {
      compiled = compile(expression);
      compiledCache.set(cacheKey, compiled);
    }
    // Probe once. A variable-only expression is fine; truly malformed syntax is
    // rejected before a graph stage is allowed to depend on it.
    const probe = compiled.evaluate({ [variable]: 0, x: 0 });
    if (typeof probe === 'object' && probe !== null) return null;
    return {
      raw: String(value ?? ''),
      normalized,
      expression,
      variable,
      cacheKey,
    };
  } catch {
    return null;
  }
};


/**
 * Canonicalize a student-authored function model so arbitrary function and
 * input-variable names do not affect correctness.  W(t)=18t, f(x)=18x and
 * g(n)=18n all describe the same input-output rule.
 *
 * Only the model's declared input symbol is renamed. Other symbols remain
 * untouched, so parameters/constants keep their mathematical meaning.
 */
export const canonicalizeFunctionExpression = (value) => {
  const model = parseFunctionModel(value);
  if (!model) return null;
  try {
    const replacement = parse('__mm_input__');
    const node = parse(model.expression).transform((current) => (
      current?.isSymbolNode && current.name === model.variable ? replacement : current
    ));
    return node.toString({ parenthesis: 'auto', implicit: 'hide' });
  } catch {
    return null;
  }
};

/**
 * Convert common finite-domain notation into a graph restriction.  This is
 * intentionally conservative: when the notation is unclear, return null
 * rather than inventing endpoint semantics.
 */
export const parseIntervalDomainRestriction = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const min = Number(value.min);
    const max = Number(value.max);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return {
        min,
        max,
        minInclusive: value.minInclusive !== false,
        maxInclusive: value.maxInclusive !== false,
      };
    }
  }

  const text = String(value ?? '')
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(/\\left|\\right/g, '')
    .replace(/\\infty/g, '∞')
    .replace(/\\leq|≤/g, '<=')
    .replace(/\\geq|≥/g, '>=')
    .replace(/\s+/g, '');
  if (!text || text.includes('∞')) return null;

  const interval = text.match(/^([[(])([^,]+),([^\)\]]+)([)\]])$/);
  if (interval) {
    const min = Number(interval[2]);
    const max = Number(interval[3]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return {
        min,
        max,
        minInclusive: interval[1] === '[',
        maxInclusive: interval[4] === ']',
      };
    }
  }

  // Examples: 0<=t<=12, -3<x<=4. The variable letter itself is irrelevant.
  const chained = text.match(/^(-?\d+(?:\.\d+)?)(<=|<)([A-Za-z])(<|<=)(-?\d+(?:\.\d+)?)$/);
  if (chained) {
    const min = Number(chained[1]);
    const max = Number(chained[5]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return {
        min,
        max,
        minInclusive: chained[2] === '<=',
        maxInclusive: chained[4] === '<=',
      };
    }
  }

  return null;
};

export const toEvaluableExpression = (value) => parseFunctionModel(value)?.expression || null;

export const evaluateNumericValue = (value) => {
  if (String(value ?? '').trim() === '') return null;
  const direct = Number(String(value).replace(/[−–—]/g, '-'));
  if (Number.isFinite(direct)) return direct;
  const expression = normalizeLatex(value);
  if (!expression || /[=;\[\]]/.test(expression) || expression.length > 200) return null;
  try {
    const result = compile(expression).evaluate();
    const numeric = Number(result);
    return Number.isFinite(numeric) ? numeric : null;
  } catch {
    return null;
  }
};

export const evaluateModelAt = (modelOrValue, x) => {
  const model = typeof modelOrValue === 'object' && modelOrValue?.expression
    ? modelOrValue
    : parseFunctionModel(modelOrValue);
  if (!model || !Number.isFinite(Number(x))) return null;
  try {
    let compiled = compiledCache.get(model.cacheKey || `${model.variable || 'x'}|${model.expression}`);
    if (!compiled) {
      compiled = compile(model.expression);
      compiledCache.set(model.cacheKey || `${model.variable || 'x'}|${model.expression}`, compiled);
    }
    // Supply both the student's variable and x.  This lets W(t)=5t and y=5x
    // drive the same coordinate-plane interaction without renaming their work.
    const result = compiled.evaluate({ [model.variable || 'x']: Number(x), x: Number(x) });
    const numeric = Number(result);
    return Number.isFinite(numeric) ? numeric : null;
  } catch {
    return null;
  }
};

export const buildExpressionFunctionSpec = (value, { referencePoints = [], domain = null } = {}) => {
  const model = parseFunctionModel(value);
  if (!model) return null;
  return {
    type: 'expression',
    expression: model.expression,
    variable: model.variable,
    originalEquation: model.raw,
    referencePoints: (Array.isArray(referencePoints) ? referencePoints : [])
      .filter((point) => Array.isArray(point) && point.length === 2 && point.every((entry) => Number.isFinite(Number(entry))))
      .map(([x, y]) => [Number(x), Number(y)]),
    ...(domain && typeof domain === 'object' ? { domain } : {}),
  };
};
