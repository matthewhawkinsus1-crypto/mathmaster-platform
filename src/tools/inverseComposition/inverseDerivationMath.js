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

export const isLinearInverseSolved = (state) => Boolean(deriveInverse(state.left, state.right));

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
