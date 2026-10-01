import { nearlyEqual } from '../shared/toolMath.mjs';

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

/*
 * WHAT SEQUENCE EXPLORER DRAWS AND GRADES FOR ONE QUESTION.
 *
 * Read by SequenceExplorer.jsx to lay out the screen and by the shared grader
 * (functions/shared/serverGrading/tools/sequenceExplorer.mjs) to mark the
 * student's work, so the rows a student fills or plots are by construction the
 * rows the server checks. Each default here is the screen's own default for an
 * unauthored field.
 */

/** The single sequence every non-compare mode shows (unauthored: arithmetic 1, 2, 3, ...). */
export const sequenceSpecFromQuestion = (question = {}) => {
  const kind = question?.sequence?.kind || question?.kind || 'arithmetic';
  return normalizeSequenceSpec({ ...question?.sequence, kind }, kind);
};

/** Compare mode's two sequences (unauthored: 3, 7, 11, ... against 1, 2, 4, ...). */
export const compareSpecsFromQuestion = (question = {}) => ({
  left: normalizeSequenceSpec(question?.left || { kind: 'arithmetic', first: 3, difference: 4 }, question?.left?.kind || 'arithmetic'),
  right: normalizeSequenceSpec(question?.right || { kind: 'geometric', first: 1, ratio: 2 }, question?.right?.kind || 'geometric'),
});

/** The authored student actions a composed sequence screen requires. */
export const sequenceStudentActions = (question = {}) => (Array.isArray(question?.studentActions) ? question.studentActions : []);

/** Build-the-model mode: how many term positions the table and graph hold. */
export const fullBridgeTermCount = (question = {}) => {
  const targetN = Number(question?.targetN || 0);
  const requestedCount = Number(question?.displayCount ?? 5);
  return sequenceEvidenceCount(
    Math.max(3, requestedCount),
    targetN > 0 ? targetN : null,
    { revealTarget: question?.revealTargetTerm === true, cap: 8 },
  );
};

/** Compare mode: how many term positions of each sequence are drawn (and, when plotting is required, plotted). */
export const comparePlotCount = (question = {}) => {
  const requirePlot = sequenceStudentActions(question).includes('plotSequence');
  const compareN = Number(question?.compareN ?? 7);
  const evidenceCount = sequenceEvidenceCount(question?.displayCount ?? 7, compareN, { revealTarget: question?.revealCompareTerm === true, cap: 7 });
  const authoredDisplayCount = Number(question?.displayCount);
  const preferredPlotCount = Number.isInteger(authoredDisplayCount) && authoredDisplayCount > 0
    ? authoredDisplayCount
    : Math.min(compareN, 7);
  return requirePlot
    ? Math.max(1, Math.min(8, Math.max(preferredPlotCount, Math.min(compareN, 7))))
    : evidenceCount;
};

/** The grid a plotted term value snaps to: authored, else the coarsest step every value sits on. */
export const inferPlotSnapStep = (rows = [], authored = null) => {
  const supplied = Number(authored);
  if (Number.isFinite(supplied) && supplied > 0) return supplied;
  const values = rows.map((row) => Number(row.value)).filter(Number.isFinite);
  if (values.every((value) => Math.abs(value - Math.round(value)) <= 1e-9)) return 1;
  if (values.every((value) => Math.abs(value * 4 - Math.round(value * 4)) <= 1e-9)) return 0.25;
  if (values.every((value) => Math.abs(value * 10 - Math.round(value * 10)) <= 1e-9)) return 0.1;
  return 0.01;
};

/** How far a plotted point may sit from (n, aₙ) and still be that term. */
export const plotPointTolerance = (snapStep) => Math.max(0.02, snapStep / 3);

/**
 * A plotted discrete graph matches the rows: exactly one point per row, and
 * every row (n, aₙ) has a plotted point within `tolerance` of it.
 */
export const pointSetMatchesRows = (points = [], rows = [], tolerance = 0.02) => {
  if (!Array.isArray(points) || points.length !== rows.length) return false;
  return rows.every((row) => points.some((point) => (
    Math.abs(Number(point?.[0]) - Number(row.n)) <= tolerance
    && Math.abs(Number(point?.[1]) - Number(row.value)) <= tolerance
  )));
};
