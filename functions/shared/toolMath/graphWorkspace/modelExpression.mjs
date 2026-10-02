// Moved from src/platform/workflow/modelExpression.js so the shared graph
// workspace grader (functions/shared/serverGrading/tools/graphWorkspace.mjs)
// evaluates a student-built model with the same parser the browser uses.
// The old path is now an `export *` shim.

import { compile, parse } from '../../algebra/safeMath.mjs';
import { latexToExpression } from '../../algebra/latexToExpression.mjs';

// Shared parser/evaluator for a model the STUDENT wrote.  This sits below both
// workflow grading and graph rendering so those two systems cannot drift: the
// exact expression used to check the student's table is also the expression
// used to build the student's graph.

// The LaTeX a student's field reports is read by the same boundary every
// other evaluator uses (compact \frac23, \dfrac, nested fractions, braced
// exponents; ../../algebra/latexToExpression.mjs). This file used to keep its
// own weaker copy, which flattened 2^{x+1} into 2^x + 1 and could not read
// \frac23 at all.
//
// After it, whitespace goes — the parser below splits on `=` and matches
// `f(x)` without spaces — but a space BETWEEN two terms is a product (π r²,
// MathJS's own `2~ y`), so it becomes `*` rather than gluing `pi r` into an
// unknown symbol `pir`. Braces left over grouped nothing the rules recognise
// and are dropped, as before.
const normalizeLatex = (value) => latexToExpression(value)
  .replace(/([A-Za-z0-9)])\s+(?=[A-Za-z0-9(])/g, '$1*')
  .replace(/\s+/g, '')
  .replace(/[{}]/g, '');

// Compiled models, keyed by what the student typed. Bounded: every partial
// expression a student types on the way to an answer is compiled once, and on
// the server this module lives as long as a warm instance and sees every
// student's text. Map order is insertion order, so the oldest entry goes first.
const COMPILED_CACHE_LIMIT = 400;
const compiledCache = new Map();
const compileCached = (cacheKey, expression) => {
  let compiled = compiledCache.get(cacheKey);
  if (!compiled) {
    compiled = compile(expression);
    compiledCache.set(cacheKey, compiled);
    if (compiledCache.size > COMPILED_CACHE_LIMIT) compiledCache.delete(compiledCache.keys().next().value);
  }
  return compiled;
};

/** Test hook: how many compiled models are held. */
export const compiledModelCacheSize = () => compiledCache.size;
export { COMPILED_CACHE_LIMIT };

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

  // f(x), W(t), A(n), y, etc.  A bare expression is a rule in its one letter
  // (x when it has none, or more than one).
  // A modelling equation may also use a named dependent quantity without
  // function notation, e.g. V = 12t. In that case V is the OUTPUT name, not
  // the input variable. If the right side contains exactly one other symbol,
  // infer that symbol as the independent variable so V = 12t and V(t) = 12t
  // are treated as the same model.
  let variable = 'x';
  if (!left) {
    // A bare right side in one letter is a model in that letter: `5t+40` is
    // a rule in t. Reading it as a rule in x left t undefined, so the table
    // and graph built from it failed while the same model written as V(t)=…
    // worked.
    try {
      const symbols = [...new Set(parse(expression)
        .filter((node) => node?.isSymbolNode)
        .map((node) => node.name)
        .filter((name) => /^[A-Za-z]$/.test(name) && name.toLowerCase() !== 'e'))];
      if (symbols.length === 1) variable = symbols[0];
    } catch {
      // Malformed input is rejected by the probe below.
    }
  } else {
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
    const compiled = compileCached(cacheKey, expression);
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
    const compiled = compileCached(model.cacheKey || `${model.variable || 'x'}|${model.expression}`, model.expression);
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
