/*
 * Shared grader for the `linearTableWorkbench` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted from LinearTableWorkbench.jsx's Check, which called
 * scoreLinearTableWorkbench and reported one part per check. This grader calls
 * that SAME function — still the only definition of correctness — on the work
 * read back from the response, and reports the same parts in the same order,
 * with the same labels and the same equal-weight score: the interval checks
 * at 1e-6 with a/b fractions accepted, the classification against the rows,
 * the nonconstant-rate evidence rule, the derived repair, the fitted m and b
 * at 1e-4 and the equation as a line.
 *
 * Two deliberate differences from the inline Check, both pinned by
 * tests/tools/linearTableWorkbenchSharedGrading.test.mjs:
 *
 *   - "no row chosen" is not Row 1. The scorer compares
 *     `Number(repairRowIndex)` with the derived row, and `Number(null)` is 0,
 *     so a student who never opened the offending-row select earned the
 *     repairIndex part whenever the first row was the broken one.
 *   - a typed equation is evaluated only when equationTextIsSafeToEvaluate
 *     says so: mathjs would otherwise run whatever the box holds
 *     (`y = zeros(3000,3000)` takes a minute and ~700 MB). Refused text is
 *     graded exactly like an unparseable equation.
 */
import declaration from '../declarations/linearTableWorkbench.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import {
  equationTextIsSafeToEvaluate,
  pairKey,
  scoreLinearTableWorkbench,
} from '../../toolMath/linearTableWorkbench/linearTableWorkbenchMath.mjs';

const CLASSIFICATIONS = Object.freeze(['linear', 'nonlinear']);

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// A typed box is text. A finite number is read as its own spelling (what the
// box would hold); anything else a tampered response sends is a blank box.
const typedText = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};
const filled = (value) => value.trim() !== '';

// A table row index: what the row buttons and the offending-row select hold.
const rowIndexOf = (value) => {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : undefined;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return Number(value);
  return undefined;
};

/** How many distinct intervals the workbench asks for — the count its Check button waits for and its labels show. */
export const linearTableRequiredComparisons = (question) => Math.max(1, Number(question?.requiredComparisons) || 3);

/** The work as the workbench holds it, with every field in the type its controls produce. */
const readWork = (work) => {
  const source = isRecord(work) ? work : {};
  const repairRowIndex = rowIndexOf(source.repairRowIndex);
  return {
    intervals: (Array.isArray(source.intervals) ? source.intervals : []).map((raw) => {
      const entry = isRecord(raw) ? raw : {};
      return {
        i: rowIndexOf(entry.i),
        j: rowIndexOf(entry.j),
        dx: typedText(entry.dx),
        dy: typedText(entry.dy),
        rate: typedText(entry.rate),
      };
    }),
    classification: typeof source.classification === 'string' ? source.classification : '',
    repairRowIndex: repairRowIndex === undefined ? null : repairRowIndex,
    repairedValue: typedText(source.repairedValue),
    m: typedText(source.m),
    b: typedText(source.b),
    equation: typedText(source.equation),
  };
};

// No derived row index is negative, so this can never be the offending row.
const NO_ROW_CHOSEN = -1;

/**
 * scoreLinearTableWorkbench over the work — the one call both the verdict and
 * the workbench's per-interval feedback come from.
 */
export const linearTableWorkbenchChecks = (question = {}, work = {}) => {
  const read = readWork(work);
  const scored = scoreLinearTableWorkbench(question || {}, {
    evidence: read.intervals,
    classification: read.classification,
    repairedValue: read.repairedValue,
    m: read.m,
    b: read.b,
    repairRowIndex: read.repairRowIndex === null ? NO_ROW_CHOSEN : read.repairRowIndex,
    equation: equationTextIsSafeToEvaluate(read.equation) ? read.equation : '',
  });
  return { read, scored };
};

/**
 * Per recorded interval: { key, duplicate, valid, dxCorrect, dyCorrect,
 * rateCorrect, complete } — which box of which interval needs another look,
 * never the value it should hold. The workbench highlights these after Check.
 */
export const linearTableEvidenceChecks = (question, work) => linearTableWorkbenchChecks(question, work).scored.evidenceCorrectness;

const partLabel = (id, requiredComparisons) => ({
  evidenceCount: `At least ${requiredComparisons} distinct recorded intervals`,
  evidenceAccuracy: 'Δx, Δy, and rate for every recorded interval',
  nonconstantRateEvidence: 'Recorded intervals show that the rate changes',
  classification: 'Linear vs. nonlinear classification',
  repairIndex: 'Identified offending row',
  repairValue: 'Corrected value',
  slope: 'Slope (m)',
  intercept: 'y-intercept (b)',
  equation: 'Equation y = mx + b',
}[id] || id);

const rowName = (index) => (Number.isInteger(index) ? `Row ${index + 1}` : 'Row ?');
const intervalText = (entry) => `${rowName(entry.i)} → ${rowName(entry.j)}: Δx=${entry.dx}, Δy=${entry.dy}, rate=${entry.rate}`;

const gradeWorkbench = (question, work) => {
  const { read, scored } = linearTableWorkbenchChecks(question, work);
  const requiredComparisons = linearTableRequiredComparisons(question);
  const distinctPairs = new Set(read.intervals.map((entry) => pairKey(entry.i, entry.j))).size;
  const intervalsFilled = read.intervals.length > 0
    && read.intervals.every((entry) => filled(entry.dx) && filled(entry.dy) && filled(entry.rate));
  const intervals = read.intervals.map(intervalText).join('; ');
  // Complete means every input the view asks for is present — the intervals
  // the Check button waits for, each with all three values typed, plus every
  // answer box the mode shows. Correctness is the scorer's alone.
  const parts = {
    evidenceCount: { isComplete: distinctPairs >= requiredComparisons, response: `${distinctPairs} distinct of ${requiredComparisons}` },
    evidenceAccuracy: { isComplete: intervalsFilled, response: intervals },
    nonconstantRateEvidence: { isComplete: intervalsFilled, response: intervals },
    classification: { isComplete: CLASSIFICATIONS.includes(read.classification), response: read.classification },
    repairIndex: { isComplete: read.repairRowIndex !== null, response: read.repairRowIndex === null ? '' : rowName(read.repairRowIndex) },
    repairValue: { isComplete: filled(read.repairedValue), response: read.repairedValue },
    slope: { isComplete: filled(read.m), response: read.m },
    intercept: { isComplete: filled(read.b), response: read.b },
    equation: { isComplete: filled(read.equation), response: read.equation },
  };
  return gradedResult({
    isCorrect: scored.isCorrect === true,
    score: scored.score,
    parts: Object.entries(scored.parts).map(([id, isCorrect]) => ({
      id,
      label: partLabel(id, requiredComparisons),
      isComplete: parts[id]?.isComplete === true,
      isCorrect: isCorrect === true,
      response: parts[id]?.response ?? '',
    })),
  });
};

// scoreLinearTableWorkbench resolves the mode exactly as the declaration does,
// so each declared mode runs the branch for that mode.
export default bindToolGrader(declaration, 'linearTableWorkbench', {
  constantRate: gradeWorkbench,
  deriveEquation: gradeWorkbench,
  repairValue: gradeWorkbench,
});
