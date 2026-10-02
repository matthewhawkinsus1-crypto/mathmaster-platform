const EPS = 1e-9;

export const evaluateSpecWithDomain = (spec = {}, x) => {
  const value = Number(x);
  if (!Number.isFinite(value)) return Number.NaN;
  if (spec.domain?.min != null && value < Number(spec.domain.min) - EPS) return Number.NaN;
  if (spec.domain?.max != null && value > Number(spec.domain.max) + EPS) return Number.NaN;

  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  if (type === 'linear') return a * (value - h) + k;
  if (type === 'quadratic') return a * (value - h) ** 2 + k;
  if (type === 'absolute') return a * Math.abs(value - h) + k;
  if (type === 'cubic') return a * (value - h) ** 3 + k;
  if (type === 'squareRoot') return value < h ? Number.NaN : a * Math.sqrt(value - h) + k;
  if (type === 'exponential') return base > 0 && base !== 1 ? a * base ** (value - h) + k : Number.NaN;
  if (type === 'logarithmic') return value > h && base > 0 && base !== 1 ? a * (Math.log(value - h) / Math.log(base)) + k : Number.NaN;
  if (type === 'rational') return Math.abs(value - h) < EPS ? Number.NaN : a / (value - h) + k;
  return Number.NaN;
};

export const inverseValue = (spec = {}, y) => {
  const value = Number(y);
  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  if (!Number.isFinite(value) || Math.abs(a) < EPS) return Number.NaN;

  if (type === 'linear') return ((value - k) / a) + h;
  if (type === 'exponential') {
    const ratio = (value - k) / a;
    return ratio > 0 && base > 0 && base !== 1 ? h + Math.log(ratio) / Math.log(base) : Number.NaN;
  }
  if (type === 'logarithmic') {
    return base > 0 && base !== 1 ? h + base ** ((value - k) / a) : Number.NaN;
  }
  if (type === 'quadratic') {
    const ratio = (value - k) / a;
    if (ratio < -EPS) return Number.NaN;
    const branch = spec.inverseBranch === 'left' || spec.domain?.max === h ? -1 : 1;
    return h + branch * Math.sqrt(Math.max(0, ratio));
  }
  if (type === 'squareRoot') {
    const rootOutput = (value - k) / a;
    if (rootOutput < -EPS) return Number.NaN;
    return h + rootOutput ** 2;
  }
  return Number.NaN;
};

export const hasFunctionalInverse = (spec = {}) => {
  const type = spec.type || 'linear';
  if (type === 'linear') return Math.abs(Number(spec.a ?? 1)) > EPS;
  if (['exponential', 'logarithmic', 'squareRoot'].includes(type)) return Math.abs(Number(spec.a ?? 1)) > EPS;
  if (type === 'quadratic') {
    const h = Number(spec.h ?? 0);
    return spec.inverseBranch === 'left' || spec.inverseBranch === 'right' || Number(spec.domain?.min) === h || Number(spec.domain?.max) === h;
  }
  return false;
};

export const composeValue = (outer, inner, x) => {
  const innerValue = evaluateSpecWithDomain(inner, x);
  return Number.isFinite(innerValue) ? evaluateSpecWithDomain(outer, innerValue) : Number.NaN;
};

export const functionLabel = (spec = {}, name = 'f') => {
  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  const shifted = (variable = 'x') => h === 0 ? variable : `(${variable} ${h > 0 ? '−' : '+'} ${Math.abs(h)})`;
  const tail = k === 0 ? '' : ` ${k > 0 ? '+' : '−'} ${Math.abs(k)}`;
  // Written the way a student writes it: a coefficient of 1 is not written and
  // −1 is just the sign. The lab showed "f(x) = 1(x − 2)² − 1" and
  // "g(x) = -1x + 4" (platform quirks audit). The multiplication dot is only
  // needed when a number is actually written.
  const coefficient = a === 1 ? '' : a === -1 ? '−' : String(a).replace(/^-/, '−');
  const times = coefficient && coefficient !== '−' ? '·' : '';
  if (type === 'linear') return `${name}(x) = ${coefficient}${shifted()}${tail}`;
  if (type === 'quadratic') return `${name}(x) = ${coefficient}${shifted()}²${tail}`;
  if (type === 'exponential') return `${name}(x) = ${coefficient}${times}${base}^${shifted()}${tail}`;
  // A log's argument is always bracketed: "log_3x" reads as log_3 of x or as (log_3)·x.
  if (type === 'logarithmic') return `${name}(x) = ${coefficient}${times}log_${base}${h === 0 ? '(x)' : shifted()}${tail}`;
  if (type === 'squareRoot') return `${name}(x) = ${coefficient}√${shifted()}${tail}`;
  return `${name}(x) = ${type}`;
};

export const restrictionDescription = (spec = {}) => {
  if ((spec.type || 'linear') !== 'quadratic') return 'No special domain restriction is required for this function family.';
  const h = Number(spec.h ?? 0);
  if (spec.inverseBranch === 'left' || Number(spec.domain?.max) === h) return `Restrict the original domain to x ≤ ${h}.`;
  if (spec.inverseBranch === 'right' || Number(spec.domain?.min) === h) return `Restrict the original domain to x ≥ ${h}.`;
  return 'A quadratic must be restricted to one side of its vertex before its inverse is a function.';
};

/*
 * WHAT THE LAB'S SCREEN IS SET UP WITH, READ FROM THE QUESTION.
 *
 * One definition, used by InverseCompositionLab.jsx / InverseDerivationLab.jsx
 * to set up the screen and by the shared grader
 * (serverGrading/tools/inverseCompositionLab.mjs) to mark the work, so the
 * functions, the input x and the parts a mode asks for cannot mean one thing
 * on the screen and another in the gradebook.
 */

/** The functions the lab shows when the question does not author f or g. */
export const DEFAULT_INVERSE_LAB_F = Object.freeze({ type: 'linear', a: 2, h: 0, k: 3 });
export const DEFAULT_INVERSE_LAB_G = Object.freeze({ type: 'linear', a: -1, h: 0, k: 4 });

export const inverseLabFunctions = (question = {}) => ({
  f: question?.f || DEFAULT_INVERSE_LAB_F,
  g: question?.g || DEFAULT_INVERSE_LAB_G,
});

/** The input x the lab opens on. */
export const inverseLabInitialX = (question = {}) => question?.x ?? 2;

/** An authored x is the given input — the student cannot change it — unless the question allows it. */
export const inverseLabInputLocked = (question = {}) => question?.x !== undefined && question?.allowInputChange !== true;

/** The restriction choice that makes f one-to-one ('none' for anything but a quadratic). */
export const expectedInverseRestriction = (f = {}) => {
  if (f.type !== 'quadratic') return 'none';
  const h = Number(f.h ?? 0);
  if (f.inverseBranch === 'left' || Number(f.domain?.max) === h) return 'left';
  if (f.inverseBranch === 'right' || Number(f.domain?.min) === h) return 'right';
  return 'required';
};

/** Every value the restriction select can hold. */
export const INVERSE_RESTRICTION_CHOICES = Object.freeze(['none', 'left', 'right', 'required']);

/**
 * The parts a view asks for and marks, in order. `mode` is the lab's own
 * reading of the question (`question.mode || 'full'`); anything that is not
 * composition, inverse or restriction is marked as the full lab.
 */
export const inverseLabRequiredParts = (mode, f = {}) => (mode === 'composition' ? ['fog', 'gof']
  : mode === 'inverse' ? ['inverse']
    : mode === 'restriction' ? ['restriction', 'inverse']
      : ['fog', 'gof', 'inverse', ...(f.type === 'quadratic' ? ['restriction'] : [])]);
