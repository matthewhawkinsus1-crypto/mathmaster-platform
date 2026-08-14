import { evaluateFunctionSpec, nearlyEqual } from '../shared/toolMath.js';

export const BUILDER_FAMILIES = Object.freeze(['linear', 'quadratic', 'exponential', 'absolute', 'verticalLine']);

export const normalizeBuilderModel = (model = {}) => ({
  family: BUILDER_FAMILIES.includes(model.family) ? model.family : 'linear',
  a: Number.isFinite(Number(model.a)) ? Number(model.a) : 1,
  h: Number.isFinite(Number(model.h)) ? Number(model.h) : 0,
  k: Number.isFinite(Number(model.k)) ? Number(model.k) : 0,
  base: Number.isFinite(Number(model.base)) && Number(model.base) > 0 && !nearlyEqual(Number(model.base), 1) ? Number(model.base) : 2,
  domainMode: model.domainMode === 'discrete' ? 'discrete' : 'continuous',
  domainMin: Number.isFinite(Number(model.domainMin)) ? Number(model.domainMin) : -4,
  domainMax: Number.isFinite(Number(model.domainMax)) ? Number(model.domainMax) : 4,
  verticalX: Number.isFinite(Number(model.verticalX)) ? Number(model.verticalX) : 0,
});

export const modelFunctionSpec = (rawModel = {}) => {
  const model = normalizeBuilderModel(rawModel);
  if (model.family === 'verticalLine') return null;
  // Linear uses slope/intercept form in the builder. Do not carry a stale h
  // value across when a student switches from a shifted quadratic/absolute
  // model to a line.
  if (model.family === 'linear') return { type: 'linear', a: model.a, h: 0, k: model.k, base: model.base };
  return { type: model.family, a: model.a, h: model.h, k: model.k, base: model.base };
};

export const builderEquation = (rawModel = {}) => {
  const model = normalizeBuilderModel(rawModel);
  const signed = (value) => Number(value) < 0 ? ` − ${Math.abs(Number(value))}` : Number(value) > 0 ? ` + ${Number(value)}` : '';
  const inside = (h) => Number(h) < 0 ? `x + ${Math.abs(Number(h))}` : Number(h) > 0 ? `x − ${Number(h)}` : 'x';
  if (model.family === 'verticalLine') return `x = ${model.verticalX}`;
  if (model.family === 'linear') return `f(x) = ${model.a}x${signed(model.k)}`;
  if (model.family === 'quadratic') return `f(x) = ${model.a}(${inside(model.h)})²${signed(model.k)}`;
  if (model.family === 'absolute') return `f(x) = ${model.a}|${inside(model.h)}|${signed(model.k)}`;
  if (model.family === 'exponential') return `f(x) = ${model.a}(${model.base})^(${inside(model.h)})${signed(model.k)}`;
  return 'f(x)';
};

export const modelIsFunction = (model) => normalizeBuilderModel(model).family !== 'verticalLine';

const modelReallyBelongsToFamily = (rawModel, family) => {
  const model = normalizeBuilderModel(rawModel);
  if (model.family !== family) return false;
  // A zero leading coefficient collapses these into another family. The
  // builder should not award a 'quadratic' badge for y=4 simply because the
  // family dropdown still says quadratic.
  if (['quadratic', 'absolute', 'exponential'].includes(family)) return !nearlyEqual(model.a, 0);
  return true;
};

export const evaluateBuilderModel = (rawModel, x) => {
  const model = normalizeBuilderModel(rawModel);
  if (model.family === 'verticalLine') return Number.NaN;
  return evaluateFunctionSpec(modelFunctionSpec(model), Number(x));
};

const behavior = (model) => {
  const m = normalizeBuilderModel(model);
  if (m.family === 'linear') return m.a > 0 ? 'increasing' : m.a < 0 ? 'decreasing' : 'constant';
  if (m.family === 'exponential') {
    const sign = m.a * Math.log(m.base);
    return sign > 0 ? 'increasing' : sign < 0 ? 'decreasing' : 'constant';
  }
  if (m.family === 'verticalLine') return 'neither';
  return 'changes';
};

const hasExtremum = (model, kind) => {
  const m = normalizeBuilderModel(model);
  if (!['quadratic', 'absolute'].includes(m.family)) return false;
  return kind === 'minimum' ? m.a > 0 : kind === 'maximum' ? m.a < 0 : false;
};

const xIntercepts = (model) => {
  const m = normalizeBuilderModel(model);
  if (m.family === 'verticalLine') return [m.verticalX];
  if (m.family === 'linear') return nearlyEqual(m.a, 0) ? [] : [-m.k / m.a];
  if (m.family === 'quadratic') {
    const value = -m.k / m.a;
    if (value < -1e-9) return [];
    if (nearlyEqual(value, 0, 1e-8)) return [m.h];
    const root = Math.sqrt(value);
    return [m.h - root, m.h + root];
  }
  if (m.family === 'absolute') {
    const value = -m.k / m.a;
    return value < -1e-9 ? [] : nearlyEqual(value, 0, 1e-8) ? [m.h] : [m.h - value, m.h + value];
  }
  if (m.family === 'exponential') {
    const ratio = -m.k / m.a;
    if (!(ratio > 0)) return [];
    return [m.h + Math.log(ratio) / Math.log(m.base)];
  }
  return [];
};

const constraintLabel = (constraint = {}) => constraint.label || ({
  family: 'Function family', continuity: 'Continuous or discrete', behavior: 'Overall behavior', extremum: 'Maximum/minimum', isFunction: 'Function test', straightLine: 'Straight-line shape', passesThrough: 'Required point', vertex: 'Vertex', yIntercept: 'y-intercept', xIntercept: 'x-intercept',
}[constraint.kind] || constraint.kind || 'Constraint');

const normalizePoint = (value) => {
  if (Array.isArray(value) && value.length === 2) return [Number(value[0]), Number(value[1])];
  if (value && typeof value === 'object' && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))) return [Number(value.x), Number(value.y)];
  return null;
};

export const evaluateConstraint = (rawModel, constraint = {}, tolerance = 0.05) => {
  const model = normalizeBuilderModel(rawModel);
  const kind = constraint.kind;
  let ok = false;
  if (kind === 'family') ok = modelReallyBelongsToFamily(model, constraint.value);
  else if (kind === 'continuity' || kind === 'domainMode') ok = model.domainMode === constraint.value;
  else if (kind === 'behavior') ok = behavior(model) === constraint.value;
  else if (kind === 'extremum') ok = hasExtremum(model, constraint.value || constraint.extremumType);
  else if (kind === 'isFunction') ok = modelIsFunction(model) === Boolean(constraint.value);
  else if (kind === 'straightLine') ok = Boolean(constraint.value) === ['linear', 'verticalLine'].includes(model.family);
  else if (kind === 'passesThrough') {
    const point = normalizePoint(constraint.point || constraint.value);
    if (point) {
      ok = model.family === 'verticalLine'
        ? Math.abs(model.verticalX - point[0]) <= Number(constraint.tolerance ?? tolerance)
        : Math.abs(evaluateBuilderModel(model, point[0]) - point[1]) <= Number(constraint.tolerance ?? tolerance);
    }
  } else if (kind === 'vertex') {
    const point = normalizePoint(constraint.point || constraint.value);
    ok = ['quadratic', 'absolute'].includes(model.family) && Boolean(point)
      && Math.abs(model.h - point[0]) <= Number(constraint.tolerance ?? tolerance)
      && Math.abs(model.k - point[1]) <= Number(constraint.tolerance ?? tolerance);
  } else if (kind === 'yIntercept') {
    ok = model.family !== 'verticalLine' && Math.abs(evaluateBuilderModel(model, 0) - Number(constraint.value)) <= Number(constraint.tolerance ?? tolerance);
  } else if (kind === 'xIntercept') {
    const expected = Array.isArray(constraint.value) ? constraint.value.map(Number) : [Number(constraint.value)];
    const actual = xIntercepts(model);
    ok = expected.every((target) => actual.some((value) => Math.abs(value - target) <= Number(constraint.tolerance ?? tolerance)));
  }
  return { id: constraint.id || kind, label: constraintLabel(constraint), isCorrect: ok, constraint };
};

export const scoreConstraintModel = (model, constraints = []) => {
  const parts = constraints.map((constraint) => evaluateConstraint(model, constraint));
  const correctCount = parts.filter((part) => part.isCorrect).length;
  return { isCorrect: parts.length > 0 && correctCount === parts.length, score: parts.length ? correctCount / parts.length : 0, parts };
};

export const validateConstraintBuilderQuestion = (question = {}) => {
  const errors = [];
  const constraints = Array.isArray(question.constraints) ? question.constraints : [];
  if (!constraints.length) errors.push('constraintFunctionBuilder requires a non-empty constraints array.');
  const supported = new Set(['family','continuity','domainMode','behavior','extremum','isFunction','straightLine','passesThrough','vertex','yIntercept','xIntercept']);
  constraints.forEach((constraint, index) => {
    if (!supported.has(constraint?.kind)) errors.push(`constraints[${index}] uses unsupported kind ${constraint?.kind || '(missing)'}.`);
    if (constraint?.kind === 'family' && !BUILDER_FAMILIES.includes(constraint.value)) errors.push(`constraints[${index}] family must be one of ${BUILDER_FAMILIES.join(', ')}.`);
  });
  return errors;
};
