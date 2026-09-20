import { linearRegression, matchesNumericAnswer, nearlyEqual } from '../shared/toolMath.js';
import { canonicalFromEquationText, canonicalFromSlopeIntercept, linesEquivalent } from '../shared/linearEquations.js';

export const LINEAR_TABLE_WORKBENCH_MODES = Object.freeze(['constantRate', 'deriveEquation', 'repairValue']);

export const normalizeRows = (rows = []) => (Array.isArray(rows) ? rows : [])
  .map((row) => (Array.isArray(row)
    ? { x: Number(row[0]), y: Number(row[1]) }
    : { x: Number(row?.x), y: Number(row?.y) }));

const isFiniteRow = (row) => Boolean(row) && Number.isFinite(row.x) && Number.isFinite(row.y);

/** Every pair of rows has a well-defined interval only when their x-values differ. */
export const rateBetween = (a, b) => {
  if (!isFiniteRow(a) || !isFiniteRow(b)) return null;
  const dx = b.x - a.x;
  if (Math.abs(dx) < 1e-12) return null;
  return (b.y - a.y) / dx;
};

/** The exact Δx/Δy/rate for the interval between two authored rows — ground truth
 * the student's typed values are checked against. Order-independent: MathMaster
 * always reports the interval as "from the smaller x to the larger x." */
export const intervalTruth = (a, b) => {
  if (!isFiniteRow(a) || !isFiniteRow(b)) return null;
  const [first, second] = a.x <= b.x ? [a, b] : [b, a];
  const dx = second.x - first.x;
  if (Math.abs(dx) < 1e-12) return null;
  const dy = second.y - first.y;
  return { dx, dy, rate: dy / dx };
};

export const isCollinear = (rows = [], tolerance = 1e-6) => {
  const finite = rows.filter(isFiniteRow);
  if (finite.length < 2) return true;
  const sorted = [...finite].sort((left, right) => left.x - right.x);
  const base = rateBetween(sorted[0], sorted[1]);
  if (base == null) return false;
  for (let index = 1; index < sorted.length - 1; index += 1) {
    const rate = rateBetween(sorted[index], sorted[index + 1]);
    if (rate == null || !nearlyEqual(rate, base, tolerance)) return false;
  }
  return true;
};

export const tableClassification = (rows = [], tolerance = 1e-6) => (
  isCollinear(rows, tolerance) ? 'linear' : 'nonlinear'
);

/** Least-squares fit, exact for a genuinely collinear table (r = 1). */
export const fitTableLine = (rows = []) => {
  const finite = rows.filter(isFiniteRow);
  const { m, b } = linearRegression(finite.map((row) => [row.x, row.y]));
  return { m, b };
};

const pairKeyOf = (i, j) => [Number(i), Number(j)].sort((a, b) => a - b).join(':');
export const pairKey = pairKeyOf;

/**
 * Derives which single row breaks an otherwise-linear table, and what its
 * mathematically correct y-value would be, purely from the authored rows.
 *
 * There is no authored "this row is wrong" flag to trust: a table qualifies
 * for repairValue only when removing EXACTLY ONE row leaves the rest
 * perfectly collinear. A table that is already linear fails this (every
 * removal "works," so nothing is uniquely identified); a table with more
 * than one inconsistency fails it too (no single removal fixes it). Both are
 * authoring errors that Preflight should reject, not repair silently.
 */
export const findTableRepair = (rows = [], tolerance = 1e-6) => {
  const finite = rows.filter(isFiniteRow);
  if (finite.length < 4 || finite.length !== rows.length) return null;
  const candidates = [];
  rows.forEach((_, index) => {
    const rest = rows.filter((__, otherIndex) => otherIndex !== index);
    if (isCollinear(rest, tolerance)) candidates.push(index);
  });
  if (candidates.length !== 1) return null;
  const offendingIndex = candidates[0];
  const rest = rows.filter((__, index) => index !== offendingIndex);
  const { m, b } = fitTableLine(rest);
  if (!Number.isFinite(m) || !Number.isFinite(b)) return null;
  const offendingRow = normalizeRows(rows)[offendingIndex];
  const correctedY = m * offendingRow.x + b;
  return { offendingIndex, expected: { m, b }, correctedY };
};

const repairedRows = (rows, repair) => (
  repair ? rows.map((row, index) => (index === repair.offendingIndex ? { x: row.x, y: repair.correctedY } : row)) : rows
);

const equationMatchesLine = (text, m, b) => {
  const authored = canonicalFromEquationText(text);
  const target = canonicalFromSlopeIntercept(m, b);
  return Boolean(authored && target && linesEquivalent(authored, target));
};

const maxDistinctPairs = (rowCount) => (rowCount * (rowCount - 1)) / 2;

/**
 * Deterministic client-side grading. Every truth value here (interval math,
 * classification, the repaired value, the fitted line) is DERIVED from the
 * authored rows — nothing is looked up from a hidden answer key, so a
 * question with a bad authored "hint" cannot silently grade wrong.
 */
export const scoreLinearTableWorkbench = (question = {}, response = {}) => {
  const rows = normalizeRows(question.rows);
  const mode = LINEAR_TABLE_WORKBENCH_MODES.includes(question.mode) ? question.mode : 'constantRate';
  const requiredComparisons = Math.max(1, Math.min(Number(question.requiredComparisons) || 3, maxDistinctPairs(rows.length)));
  const evidence = Array.isArray(response.evidence) ? response.evidence : [];

  const seenPairs = new Set();
  const evidenceCorrectness = evidence.map((entryRaw) => {
    const entry = entryRaw || {};
    const key = pairKeyOf(entry.i, entry.j);
    const duplicate = seenPairs.has(key);
    seenPairs.add(key);
    const truth = intervalTruth(rows[entry.i], rows[entry.j]);
    if (!truth) return { key, duplicate, valid: false, dxCorrect: false, dyCorrect: false, rateCorrect: false, complete: false };
    const dxCorrect = matchesNumericAnswer(entry.dx, truth.dx, 1e-6);
    const dyCorrect = matchesNumericAnswer(entry.dy, truth.dy, 1e-6);
    const rateCorrect = matchesNumericAnswer(entry.rate, truth.rate, 1e-6);
    return { key, duplicate, valid: true, dxCorrect, dyCorrect, rateCorrect, complete: dxCorrect && dyCorrect && rateCorrect };
  });

  const distinctPairCount = new Set(evidenceCorrectness.map((entry) => entry.key)).size;
  const noDuplicates = evidenceCorrectness.every((entry) => !entry.duplicate);
  const enoughEvidence = distinctPairCount >= requiredComparisons && noDuplicates;
  const allEvidenceCorrect = evidenceCorrectness.length > 0 && evidenceCorrectness.every((entry) => entry.complete);
  const correctRecordedRates = evidenceCorrectness
    .map((entry, index) => entry.complete ? intervalTruth(rows[evidence[index]?.i], rows[evidence[index]?.j])?.rate : null)
    .filter((value) => Number.isFinite(value));
  const demonstratesNonconstantRate = correctRecordedRates.some((rate, index) => (
    correctRecordedRates.some((other, otherIndex) => otherIndex > index && !nearlyEqual(rate, other, 1e-6))
  ));

  const parts = {
    evidenceCount: enoughEvidence,
    evidenceAccuracy: allEvidenceCorrect,
  };

  let repair = null;
  let equationCheck = null;

  if (mode === 'repairValue') {
    repair = findTableRepair(rows);
    const indexCorrect = Boolean(repair) && Number(response.repairRowIndex) === repair.offendingIndex;
    const valueCorrect = Boolean(repair) && matchesNumericAnswer(response.repairedValue, repair.correctedY, 1e-6);
    parts.repairIndex = indexCorrect;
    parts.repairValue = valueCorrect;
    const expectedClassification = tableClassification(repairedRows(rows, repair));
    parts.classification = response.classification === expectedClassification;
  } else {
    const expectedClassification = tableClassification(rows);
    parts.classification = response.classification === expectedClassification;
    if (mode === 'constantRate' && expectedClassification === 'nonlinear') {
      // A nonlinear verdict must be supported by evidence that actually shows
      // two different correct rates. Otherwise a student can sample only a
      // locally linear subset of a broken table and guess "nonlinear."
      parts.nonconstantRateEvidence = demonstratesNonconstantRate;
    }
  }

  if (mode === 'deriveEquation') {
    const fit = fitTableLine(rows);
    const mCorrect = matchesNumericAnswer(response.m, fit.m, 1e-4);
    const bCorrect = matchesNumericAnswer(response.b, fit.b, 1e-4);
    const equationCorrect = equationMatchesLine(response.equation, fit.m, fit.b);
    equationCheck = { mCorrect, bCorrect, equationCorrect, fit };
    parts.slope = mCorrect;
    parts.intercept = bCorrect;
    parts.equation = equationCorrect;
  }

  const requiredParts = Object.values(parts);
  const score = requiredParts.length ? requiredParts.filter(Boolean).length / requiredParts.length : 0;
  const isCorrect = requiredParts.every(Boolean);

  return {
    isCorrect,
    score,
    parts,
    evidenceCorrectness,
    trueClassification: mode === 'repairValue' ? tableClassification(repairedRows(rows, repair)) : tableClassification(rows),
    repair,
    equationCheck,
  };
};

export const validateLinearTableWorkbenchQuestion = (question = {}) => {
  const errors = [];
  const rawRows = Array.isArray(question.rows) ? question.rows : null;
  if (!rawRows || rawRows.length < 3) {
    errors.push('linearTableWorkbench requires at least three table rows.');
    return errors;
  }
  const rows = normalizeRows(rawRows);
  rows.forEach((row, index) => {
    if (!isFiniteRow(row)) errors.push(`linearTableWorkbench row ${index + 1} must have finite x and y values.`);
  });
  if (errors.length) return errors;

  const xValues = rows.map((row) => row.x);
  if (new Set(xValues.map((x) => Number(x.toFixed(9)))).size !== xValues.length) {
    errors.push('linearTableWorkbench rows must have distinct x-values; a repeated x is not a function.');
  }

  const mode = question.mode == null ? 'constantRate' : question.mode;
  if (!LINEAR_TABLE_WORKBENCH_MODES.includes(mode)) {
    errors.push(`linearTableWorkbench mode must be one of: ${LINEAR_TABLE_WORKBENCH_MODES.join(', ')}.`);
  }

  const requiredComparisons = question.requiredComparisons;
  if (requiredComparisons != null) {
    if (!Number.isInteger(Number(requiredComparisons)) || Number(requiredComparisons) < 1) {
      errors.push('linearTableWorkbench requiredComparisons must be a positive integer.');
    } else if (Number(requiredComparisons) > maxDistinctPairs(rows.length)) {
      errors.push('linearTableWorkbench requiredComparisons cannot exceed the number of distinct row pairs available.');
    }
  }

  if (mode === 'deriveEquation' && !errors.length && !isCollinear(rows)) {
    errors.push('linearTableWorkbench deriveEquation mode requires a table with a genuine constant rate of change.');
  }

  if (mode === 'repairValue' && !errors.length) {
    if (rows.length < 4) {
      errors.push('linearTableWorkbench repairValue mode requires at least four rows so the offending row can be uniquely determined.');
    } else {
      const repair = findTableRepair(rows);
      if (!repair) {
        errors.push('linearTableWorkbench repairValue mode requires a table where removing exactly one row leaves the rest on a single line.');
      } else if (question.repair?.rowIndex != null && Number(question.repair.rowIndex) !== repair.offendingIndex) {
        errors.push('linearTableWorkbench repair.rowIndex does not match the mathematically derived offending row; author the correct index or omit it.');
      }
    }
  }

  return errors;
};
