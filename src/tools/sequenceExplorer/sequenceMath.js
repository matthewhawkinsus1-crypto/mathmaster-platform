import { nearlyEqual } from '../shared/toolMath.js';

export const SEQUENCE_KINDS = ['arithmetic', 'geometric'];

export const normalizeSequenceSpec = (spec = {}, fallbackKind = 'arithmetic') => {
  const kind = spec.kind || fallbackKind;
  if (!SEQUENCE_KINDS.includes(kind)) throw new Error(`Unsupported sequence kind: ${kind}.`);
  const first = Number(spec.first ?? 1);
  if (!Number.isFinite(first)) throw new Error('Sequence first term must be finite.');
  if (kind === 'arithmetic') {
    const difference = Number(spec.difference ?? spec.change ?? 1);
    if (!Number.isFinite(difference)) throw new Error('Arithmetic common difference must be finite.');
    return { kind, first, difference };
  }
  const ratio = Number(spec.ratio ?? spec.change ?? 2);
  if (!Number.isFinite(ratio)) throw new Error('Geometric common ratio must be finite.');
  return { kind, first, ratio };
};

export const isPositiveSequenceIndex = (value) => Number.isInteger(Number(value)) && Number(value) >= 1;

export const sequenceTerm = (spec = {}, n = 1) => {
  if (!isPositiveSequenceIndex(n)) throw new Error('Sequence index n must be a positive integer.');
  const normalized = normalizeSequenceSpec(spec, spec.kind);
  return normalized.kind === 'arithmetic'
    ? normalized.first + (Number(n) - 1) * normalized.difference
    : normalized.first * normalized.ratio ** (Number(n) - 1);
};

export const generateSequence = (spec = {}, count = 6, startIndex = 1) => {
  if (!isPositiveSequenceIndex(startIndex)) throw new Error('Sequence start index must be positive.');
  if (!Number.isInteger(Number(count)) || Number(count) < 1) throw new Error('Sequence count must be a positive integer.');
  return Array.from({ length: Number(count) }, (_, index) => {
    const n = Number(startIndex) + index;
    return { n, value: sequenceTerm(spec, n) };
  });
};


// Student evidence should support the requested term without printing the
// requested answer itself.  This is shared by the renderer and Preflight tests
// so an AI cannot accidentally set displayCount = targetN and give the answer
// away in the table/graph.
export const sequenceEvidenceCount = (requestedCount = 7, targetN = null, { cap = 20, revealTarget = false } = {}) => {
  const requested = Math.max(1, Math.min(Number(cap) || 20, Number.isInteger(Number(requestedCount)) ? Number(requestedCount) : 7));
  const target = Number(targetN);
  if (revealTarget || !Number.isInteger(target) || target <= 1) return requested;
  return Math.max(1, Math.min(requested, target - 1));
};

export const sequenceChange = (spec = {}) => {
  const normalized = normalizeSequenceSpec(spec, spec.kind);
  return normalized.kind === 'arithmetic' ? normalized.difference : normalized.ratio;
};

export const nextSequenceTerm = (spec = {}, current) => {
  const normalized = normalizeSequenceSpec(spec, spec.kind);
  return normalized.kind === 'arithmetic'
    ? Number(current) + normalized.difference
    : Number(current) * normalized.ratio;
};

export const inferSequenceKind = (values = [], tolerance = 1e-8) => {
  const nums = values.map(Number);
  if (nums.length < 3 || nums.some((value) => !Number.isFinite(value))) return 'unknown';
  const difference = nums[1] - nums[0];
  const arithmetic = nums.slice(2).every((value, index) => nearlyEqual(value - nums[index + 1], difference, tolerance));

  let geometric = false;
  if (nearlyEqual(nums[0], 0, tolerance)) {
    geometric = nums.every((value) => nearlyEqual(value, 0, tolerance));
  } else {
    const ratio = nums[1] / nums[0];
    geometric = nums.every((value, index) => nearlyEqual(value, nums[0] * ratio ** index, tolerance));
  }
  if (arithmetic && geometric) return 'both';
  if (arithmetic) return 'arithmetic';
  if (geometric) return 'geometric';
  return 'neither';
};

export const sequencePartialSum = (spec = {}, n = 1) => {
  if (!isPositiveSequenceIndex(n)) throw new Error('Partial-sum index must be a positive integer.');
  const normalized = normalizeSequenceSpec(spec, spec.kind);
  const count = Number(n);
  if (normalized.kind === 'arithmetic') {
    return (count / 2) * (2 * normalized.first + (count - 1) * normalized.difference);
  }
  if (nearlyEqual(normalized.ratio, 1)) return count * normalized.first;
  return normalized.first * (1 - normalized.ratio ** count) / (1 - normalized.ratio);
};

export const sequenceRuleParts = (spec = {}) => {
  const normalized = normalizeSequenceSpec(spec, spec.kind);
  if (normalized.kind === 'arithmetic') {
    return {
      kind: normalized.kind,
      first: normalized.first,
      change: normalized.difference,
      explicitTemplate: 'aₙ = A + (n − 1)D',
      recursiveTemplate: 'a₁ = A; aₙ = aₙ₋₁ + D',
    };
  }
  return {
    kind: normalized.kind,
    first: normalized.first,
    change: normalized.ratio,
    explicitTemplate: 'aₙ = A · Rⁿ⁻¹',
    recursiveTemplate: 'a₁ = A; aₙ = R · aₙ₋₁',
  };
};

export const compareSequencesAt = (leftSpec = {}, rightSpec = {}, n = 1, tolerance = 1e-8) => {
  const left = sequenceTerm(leftSpec, n);
  const right = sequenceTerm(rightSpec, n);
  const relation = nearlyEqual(left, right, tolerance) ? 'equal' : left > right ? 'left' : 'right';
  return { n: Number(n), left, right, relation, difference: Math.abs(left - right) };
};
