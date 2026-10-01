/*
 * Shared grader for the `signSolutionAnalyzer` registry tool — run by the
 * browser tool for its feedback, by QuestionEngine for the recorded verdict,
 * and by the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from SignSolutionAnalyzer.jsx: the same defaults
 * for an unauthored question (numerator (x + 2)(x − 3), a rational chart's
 * denominator (x − 1), relation '>', the radical √(x + 6) = 3 with candidates
 * 3 and −15), the same sign mathematics (signSolutionMath.mjs), and the same
 * all-or-nothing rule: the selection must be exactly the qualifying set, in
 * any order. One part, score 0 or 1.
 *
 * Completeness: at least one interval / candidate is selected. An empty
 * selection is still GRADED on an explicit Check — it is the right answer when
 * nothing qualifies, as on screen — but it cannot be told apart from a chart
 * nobody touched, so a deadline never auto-submits it.
 *
 * ONE DELIBERATE DIFFERENCE FROM THE PRE-SHARED TOOL (radicalCheck): a
 * selected candidate is compared by its numeric value. The screen compared the
 * raw authored value with `===` against Number()-mapped solutions, so when a
 * question carried its candidates as text — which is what a template's
 * placeholder substitution produces ("3", "-15") — the genuine solution "3"
 * never equalled 3 and the item could not be answered correctly. Numeric
 * candidates grade exactly as before.
 */
import declaration from '../declarations/signSolutionAnalyzer.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import {
  buildSignIntervals,
  sameIntervalSelection,
  validRadicalCandidates,
} from '../../toolMath/signSolutionAnalyzer/signSolutionMath.mjs';

const DEFAULT_NUMERATOR = Object.freeze([{ root: -2, multiplicity: 1 }, { root: 3, multiplicity: 1 }]);
const DEFAULT_DENOMINATOR = Object.freeze([{ root: 1, multiplicity: 1 }]);
const DEFAULT_RADICAL = Object.freeze({ radicand: { m: 1, b: 6 }, rhs: { m: 0, b: 3 } });
const DEFAULT_CANDIDATES = Object.freeze([3, -15]);

/*
 * A question the analyzer cannot render (factors that are not a list, a
 * relation that is not text) throws inside the sign mathematics, and the
 * screen never reaches its Check. The server says so instead of blaming the
 * student's work.
 */
const withKey = (build, grade) => {
  let key;
  try {
    key = build();
  } catch {
    return ungradedResult('invalid-question');
  }
  return grade(key);
};

const intervalLabel = (interval) => (interval
  ? `(${Number.isFinite(interval.left) ? interval.left : '−∞'}, ${Number.isFinite(interval.right) ? interval.right : '∞'})`
  : '?');

const selectionResult = ({ id, label, selection, isCorrect, response }) => {
  const complete = selection !== null && selection.length > 0;
  return gradedResult({
    isComplete: complete,
    // Exactly the qualifying set — which may be empty — is correct.
    isCorrect,
    parts: [{ id, label, isComplete: complete, isCorrect, response }],
  });
};

const signChart = (rational) => (question, work) => withKey(
  () => {
    const numeratorFactors = question.numeratorFactors || question.factors || DEFAULT_NUMERATOR;
    const denominatorFactors = rational ? (question.denominatorFactors || DEFAULT_DENOMINATOR) : [];
    const relation = question.relation || '>';
    return buildSignIntervals({ numeratorFactors, denominatorFactors }, relation).intervals;
  },
  (intervals) => {
    const expected = intervals.map((interval, index) => (interval.included ? index : null)).filter((value) => value !== null);
    // The chart's toggles hold interval indexes. Anything that is not a list
    // was not produced by the chart and matches nothing.
    const selection = Array.isArray(work.selected) ? work.selected : null;
    const isCorrect = selection !== null && sameIntervalSelection(selection, expected);
    const response = selection
      ? [...selection].sort((a, b) => Number(a) - Number(b)).map((index) => intervalLabel(Number.isInteger(index) ? intervals[index] : null)).join(' ∪ ')
      : '';
    return selectionResult({ id: 'intervals', label: 'Solution intervals', selection, isCorrect, response });
  },
);

// A candidate as the student toggled it: the authored value, number or text.
const candidateValue = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
};

const sameValues = (selected, expected) => {
  const a = [...selected].sort((x, y) => x - y);
  const b = [...expected].sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const radicalCheck = (question, work) => withKey(
  () => validRadicalCandidates(question.radicalEquation || DEFAULT_RADICAL, question.candidates || DEFAULT_CANDIDATES),
  (expected) => {
    const selection = Array.isArray(work.selected) ? work.selected : null;
    const isCorrect = selection !== null && sameValues(selection.map(candidateValue), expected);
    const response = selection ? selection.map((value) => `x = ${typeof value === 'string' || typeof value === 'number' ? value : '?'}`).join(', ') : '';
    return selectionResult({ id: 'candidates', label: 'Genuine solutions', selection, isCorrect, response });
  },
);

export default bindToolGrader(declaration, 'signSolutionAnalyzer', {
  polynomial: signChart(false),
  rational: signChart(true),
  radicalCheck,
});
