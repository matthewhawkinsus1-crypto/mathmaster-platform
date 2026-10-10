/*
 * Shared grader for the `regressionCalculator` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from RegressionCalculator.jsx's Submit workflow:
 *
 *   data-entry | graph-to-table  the student's table is exactly the source
 *                                pairs, in any row order
 *   linear-regression            that table is right AND the executed run is
 *                                a linear regression on that same table
 *   correlation-produced         the linear-regression stage passed AND the
 *                                run's r, m and b are within 0.0005 of the
 *                                regression of the run's own table, whose r
 *                                is within 0.0005 of the source data's r (the
 *                                Path grader's rule; the calculator's run
 *                                always meets it)
 *   interpretation               direction and strength match the source r
 *                                (0.1 / 0.5 / 0.8 thresholds); not a part at
 *                                all when requireInterpretation is false
 *
 * Every stage is worth the same, so the score is the share of stages passed
 * (n = 4, or 3 without interpretation) and the verdict is "every stage". The
 * same defaults as the calculator: the source is sourceData (or points), and
 * interpretation is required unless explicitly false.
 *
 * The mathematics — reading the source and computing its regression — is the
 * one implementation the calculator and My Math Path share
 * (functions/shared/pathRegressionCalculatorGrading.mjs).
 */
import declaration from '../declarations/regressionCalculator.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import {
  cleanRegressionPoints,
  regressionCalculatorStats,
} from '../../toolMath/regressionCalculator/regressionCalculatorMath.mjs';

/** The one regression operation the calculator executes. */
export const REGRESSION_OPERATION = 'linearRegression';

/*
 * The process trail is an append-only log (every table keystroke adds an
 * event). It is never graded, but it rides in the work, so the work keeps only
 * its most recent events: a long session still ends with the run and the
 * interpretation the teacher wants to see, and the response stays far inside
 * TOOL_RESPONSE_LIMITS.
 */
export const REGRESSION_PROCESS_EVIDENCE_LIMIT = 150;

/** How r reads as a direction and a strength. */
const describeCorrelation = (r) => ({
  direction: Math.abs(r) < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative',
  strength: Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : Math.abs(r) >= 0.1 ? 'weak' : 'none',
});

// The calculator's own comparison: the same pairs, exactly, in any row order.
const samePairs = (left, right) => JSON.stringify([...left].sort(([ax, ay], [bx, by]) => ax - bx || ay - by))
  === JSON.stringify([...right].sort(([ax, ay], [bx, by]) => ax - bx || ay - by));

// A coordinate as the calculator holds it: a number, or a numeric entry. A
// blank, null or anything else is not a coordinate (Number(null) would be 0).
const coordinate = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
};

// The rows that count: two finite coordinates. Anything else is skipped, as
// the calculator skips a half-filled or non-numeric table row.
const readPairs = (value) => (Array.isArray(value) ? value : [])
  .filter((row) => Array.isArray(row) && row.length === 2)
  .map((row) => row.map(coordinate))
  .filter((pair) => pair.every(Number.isFinite));

const readObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
const readChoice = (value) => (typeof value === 'string' ? value : '');
const formatPairs = (pairs) => pairs.map(([x, y]) => `(${x}, ${y})`).join(', ');

/**
 * The work the calculator submits — and reports live for a deadline — built
 * from its state. One builder, so the Check handler, the live report and the
 * tests all carry the identical shape.
 */
export const buildRegressionCalculatorWork = ({
  table = [],
  regressionRun = null,
  direction = '',
  strength = '',
  processEvidence = [],
} = {}) => ({
  table,
  regressionRun: regressionRun || null,
  interpretation: { direction, strength },
  processEvidence: Array.isArray(processEvidence) ? processEvidence.slice(-REGRESSION_PROCESS_EVIDENCE_LIMIT) : [],
});

const gradeWorkflow = (tablePartId, tableLabel) => (question, work) => {
  const source = cleanRegressionPoints(question.sourceData || question.points);
  const expected = regressionCalculatorStats(source);
  const key = expected ? describeCorrelation(expected.r) : null;
  const requireInterpretation = question.requireInterpretation !== false;

  const entered = readPairs(work.table);
  const run = readObject(work.regressionRun);
  const ranRegression = run?.operation === REGRESSION_OPERATION;
  const runR = run ? coordinate(run.r) : Number.NaN;
  const interpretation = readObject(work.interpretation);
  const direction = readChoice(interpretation?.direction);
  const strength = readChoice(interpretation?.strength);

  const tableCorrect = samePairs(entered, source);
  const regressionCorrect = tableCorrect && ranRegression && samePairs(readPairs(run.table), entered);
  // As My Math Path grades the same stage: the run's r, m and b are the
  // regression of the run's own table, and that table's r is the source's.
  const runStats = regressionCorrect ? regressionCalculatorStats(readPairs(run.table)) : null;
  const matchesRun = (field) => Math.abs(coordinate(run[field]) - runStats[field]) <= 0.0005;
  const correlationCorrect = Boolean(runStats)
    && matchesRun('r') && matchesRun('m') && matchesRun('b')
    && Math.abs(runStats.r - Number(expected?.r)) <= 0.0005;
  const parts = [
    {
      id: tablePartId,
      label: tableLabel,
      // A row for every source point (and at least the two a regression needs).
      isComplete: entered.length >= Math.max(2, source.length),
      isCorrect: tableCorrect,
      response: formatPairs(entered),
    },
    {
      id: 'linear-regression',
      label: 'Linear regression',
      isComplete: ranRegression,
      isCorrect: regressionCorrect,
      response: ranRegression ? REGRESSION_OPERATION : '',
    },
    {
      id: 'correlation-produced',
      label: 'Correlation produced',
      isComplete: Number.isFinite(runR),
      isCorrect: correlationCorrect,
      response: Number.isFinite(runR) ? `r = ${runR}` : '',
    },
  ];
  if (requireInterpretation) {
    parts.push({
      id: 'interpretation',
      label: 'Interpretation',
      isComplete: Boolean(direction && strength),
      isCorrect: Boolean(key) && direction === key.direction && strength === key.strength,
      response: [direction, strength].filter(Boolean).join(', '),
    });
  }
  const passed = parts.filter((part) => part.isCorrect).length;
  return gradedResult({
    parts,
    isCorrect: passed === parts.length,
    score: passed / parts.length,
  });
};

export default bindToolGrader(declaration, 'regressionCalculator', {
  data: gradeWorkflow('data-entry', 'Data entry'),
  scatterplot: gradeWorkflow('graph-to-table', 'Graph to table'),
});
