const EPSILON = 1e-9;

const clean = (value) => Math.abs(Number(value)) <= EPSILON ? 0 : Number(value);
const cloneRelation = (relation) => ({ x: relation.x, y: relation.y, c: relation.c });
const cloneSnapshot = (state) => ({
  phase: state.phase,
  left: cloneRelation(state.left),
  right: cloneRelation(state.right),
  inverse: state.inverse ? { ...state.inverse } : null,
});

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
};

const fractionParts = (value) => {
  const numeric = clean(value);
  if (Number.isInteger(numeric)) return { numerator: numeric, denominator: 1 };
  for (let denominator = 2; denominator <= 24; denominator += 1) {
    const numerator = Math.round(numeric * denominator);
    if (Math.abs(numeric - numerator / denominator) <= 1e-9) {
      const divisor = gcd(numerator, denominator);
      return { numerator: numerator / divisor, denominator: denominator / divisor };
    }
  }
  return null;
};

const formatNumber = (value) => {
  const numeric = clean(value);
  const fraction = fractionParts(numeric);
  if (fraction?.denominator === 1) return String(fraction.numerator);
  if (fraction) return `${fraction.numerator}/${fraction.denominator}`;
  return String(Number(numeric.toFixed(6)));
};

const formatVariableTerm = (coefficient, variable, isFirst) => {
  const numeric = clean(coefficient);
  if (numeric === 0) return null;
  const sign = numeric < 0 ? '-' : '+';
  const magnitude = Math.abs(numeric);
  const fraction = fractionParts(numeric);

  if (fraction && fraction.denominator > 1) {
    if (isFirst) return `(${formatNumber(numeric)})${variable}`;
    return `${sign} (${formatNumber(magnitude)})${variable}`;
  }

  let core;
  if (Math.abs(magnitude - 1) <= EPSILON) {
    core = variable;
  } else {
    core = `${formatNumber(magnitude)}${variable}`;
  }
  if (isFirst) return numeric < 0 ? `-${core}` : core;
  return `${sign} ${core}`;
};

const formatConstantTerm = (constant, isFirst) => {
  const numeric = clean(constant);
  if (numeric === 0) return null;
  if (isFirst) return formatNumber(numeric);
  return numeric < 0 ? `- ${formatNumber(Math.abs(numeric))}` : `+ ${formatNumber(numeric)}`;
};

const formatSide = (side) => {
  const pieces = [];
  const xTerm = formatVariableTerm(side.x, 'x', pieces.length === 0);
  if (xTerm) pieces.push(xTerm);
  const yTerm = formatVariableTerm(side.y, 'y', pieces.length === 0);
  if (yTerm) pieces.push(yTerm);
  const constantTerm = formatConstantTerm(side.c, pieces.length === 0);
  if (constantTerm) pieces.push(constantTerm);
  return pieces.length ? pieces.join(' ') : '0';
};

const isolatedYSide = (side) => clean(side.x) === 0 && clean(side.c) === 0 && Math.abs(clean(side.y) - 1) <= EPSILON;

const deriveInverse = (left, right) => {
  if (isolatedYSide(left) && clean(right.y) === 0) {
    return { slope: clean(right.x), intercept: clean(right.c) };
  }
  if (isolatedYSide(right) && clean(left.y) === 0) {
    return { slope: clean(left.x), intercept: clean(left.c) };
  }
  return null;
};

const withSolvedMetadata = (state, fallbackPhase = 'working') => {
  const inverse = deriveInverse(state.left, state.right);
  return {
    ...state,
    phase: inverse ? 'solved' : fallbackPhase,
    inverse,
  };
};

export const createLinearInverseDerivation = (functionSpec = {}) => {
  if (functionSpec.type !== 'linear') throw new Error('Inverse derivation currently supports linear functions only.');
  const a = Number(functionSpec.a ?? 1);
  const h = Number(functionSpec.h ?? 0);
  const k = Number(functionSpec.k ?? 0);
  if (![a, h, k].every(Number.isFinite)) throw new Error('Linear inverse derivation requires finite a, h, and k values.');
  if (Math.abs(a) <= EPSILON) throw new Error('Linear inverse derivation requires a nonzero slope.');

  return {
    phase: 'original',
    left: { x: 0, y: 1, c: 0 },
    right: { x: clean(a), y: 0, c: clean(k - a * h) },
    inverse: null,
    history: [],
  };
};

export const formatInverseDerivationRelation = (state) => `${formatSide(state.left)} = ${formatSide(state.right)}`;

export const isLinearInverseSolved = (state) => state?.phase !== 'original'
  && Boolean(deriveInverse(state.left, state.right));

/*
 * READING A DERIVATION FROM ITS CURRENT EQUATION ALONE.
 *
 * The lab's verdict depends only on the derivation's current equation, never
 * on the path that reached it, so the equation is the work a grader needs.
 * Two facts make that safe:
 *
 *   - phase is visible in the equation. Before the swap the only equation the
 *     lab can hold is the starting `y = ax + b` (y on the left, coefficient 1);
 *     the swap writes `x = ay + b`, and no balanced operation can ever put a y
 *     back on the left or an x on the right, so every later equation has an
 *     exact 0 there (`clean` turns -0 and dust into a literal 0);
 *   - an isolated equation is only a correct inverse if it is the inverse of
 *     THIS f. Every balanced operation keeps the equation equivalent to
 *     x = f(y), so a real derivation that isolates y has found 1/a and -b/a;
 *     an equation that claims to be solved but is not f's inverse (typed
 *     into a tampered response, or a draft left from a different f) is not.
 */

/** The current equation, read from untrusted work: { left, right } with numeric coefficients, or null. */
export const readDerivationEquation = (equation) => {
  const coefficient = (value) => ((typeof value === 'number' || typeof value === 'string') && String(value).trim() !== ''
    ? Number(value)
    : Number.NaN);
  const side = (relation) => (relation && typeof relation === 'object' && !Array.isArray(relation)
    ? { x: coefficient(relation.x), y: coefficient(relation.y), c: coefficient(relation.c) }
    : null);
  if (!equation || typeof equation !== 'object' || Array.isArray(equation)) return null;
  const left = side(equation.left);
  const right = side(equation.right);
  return left && right ? { left, right } : null;
};

/** True once x and y have been swapped — read from the equation's shape. */
export const derivationEquationIsSwapped = (equation) => Boolean(equation)
  && equation.left?.y === 0
  && equation.right?.x === 0;

/**
 * True once the derivation is finished: swapped, then y alone with
 * coefficient 1 — the lab's own `isLinearInverseSolved`, read from the
 * equation. Whether it is THIS f's inverse is derivationEquationSolvesInverse.
 */
export const derivationEquationIsolatesY = (equation) => derivationEquationIsSwapped(equation)
  && isLinearInverseSolved({ phase: 'working', left: equation.left, right: equation.right });

/** The inverse a correct derivation of this linear f must reach: y = slope·x + intercept. */
export const expectedLinearInverse = (functionSpec = {}) => {
  const start = createLinearInverseDerivation(functionSpec);
  const a = start.right.x;
  const b = start.right.c;
  return { slope: clean(1 / a), intercept: clean(-b / a) };
};

const closeTo = (value, expected, tolerance) => Number.isFinite(value)
  && Math.abs(value - expected) <= tolerance;

/*
 * The equation has y isolated after the swap AND it is f's inverse.
 *
 * The tolerances follow what balanced operations can do to a real derivation.
 * Isolating y puts the y coefficient within 1e-9 of 1, which pins the slope to
 * about 1e-9 relative, so the slope is held to 1e-6 relative. The constant can
 * carry the dust `clean` rounds away (a value under 1e-9 written as 0 on one
 * side only), multiplied by every later scaling — and a derivation that
 * isolates y has scaled by about 1/a — so the constant is held to 1e-6 of the
 * inverse's own size, max(1, |slope|, |intercept|). A derivation whose x term
 * or constant was rounded away outright (divide by 1e10, then multiply back)
 * no longer says x = f(y), and is not f's inverse.
 */
export const derivationEquationSolvesInverse = (equation, functionSpec = {}) => {
  if (!derivationEquationIsolatesY(equation)) return false;
  const reached = deriveInverse(equation.left, equation.right);
  const expected = expectedLinearInverse(functionSpec);
  const size = Math.max(1, Math.abs(expected.slope), Math.abs(expected.intercept));
  return closeTo(reached.slope, expected.slope, 1e-6 * Math.max(1, Math.abs(expected.slope)))
    && closeTo(reached.intercept, expected.intercept, 1e-6 * size);
};

const mapRelation = (relation, transform) => ({
  x: clean(transform(relation.x)),
  y: clean(transform(relation.y)),
  c: clean(transform(relation.c)),
});

export const applyInverseDerivationOperation = (state, operation, operand) => {
  if (!state?.left || !state?.right) throw new Error('A valid inverse derivation state is required.');
  const operationType = typeof operation === 'object' ? operation.type : operation;
  const value = typeof operation === 'object' && operation.value !== undefined ? operation.value : operand;

  if (operationType === 'undo') {
    if (!state.history?.length) return state;
    const previous = state.history[state.history.length - 1];
    return {
      ...previous,
      history: state.history.slice(0, -1),
    };
  }

  if (operationType === 'swapVariables') {
    if (state.phase !== 'original') throw new Error('Swap x and y exactly once before solving for y.');
    const swap = (relation) => ({ x: clean(relation.y), y: clean(relation.x), c: clean(relation.c) });
    return {
      ...state,
      left: swap(state.left),
      right: swap(state.right),
      phase: 'swapped',
      inverse: null,
      history: [...(state.history || []), cloneSnapshot(state)],
    };
  }

  if (!['add', 'subtract', 'multiply', 'divide'].includes(operationType)) {
    throw new Error(`Unsupported inverse derivation operation: ${operationType || '(missing)'}.`);
  }
  if (state.phase === 'original') throw new Error('Swap x and y before applying balanced operations.');

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${operationType} requires a finite numeric value.`);
  if (operationType === 'divide' && Math.abs(numeric) <= EPSILON) throw new Error('Cannot divide both sides by zero.');
  if (operationType === 'multiply' && Math.abs(numeric) <= EPSILON) throw new Error('Multiplying both sides by zero loses equation equivalence.');

  if (operationType === 'add') {
    const adjust = (relation) => ({ ...relation, c: clean(relation.c + numeric) });
    return withSolvedMetadata({
      ...state,
      left: adjust(state.left),
      right: adjust(state.right),
      history: [...(state.history || []), cloneSnapshot(state)],
    });
  }
  if (operationType === 'subtract') {
    const adjust = (relation) => ({ ...relation, c: clean(relation.c - numeric) });
    return withSolvedMetadata({
      ...state,
      left: adjust(state.left),
      right: adjust(state.right),
      history: [...(state.history || []), cloneSnapshot(state)],
    });
  }

  const transform = operationType === 'multiply'
    ? (coefficient) => coefficient * numeric
    : (coefficient) => coefficient / numeric;
  return withSolvedMetadata({
    ...state,
    left: mapRelation(state.left, transform),
    right: mapRelation(state.right, transform),
    history: [...(state.history || []), cloneSnapshot(state)],
  });
};
