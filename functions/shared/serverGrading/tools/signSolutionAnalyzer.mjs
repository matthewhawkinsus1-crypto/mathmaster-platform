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
 * any order. One part, score 0 or 1. (radicalSolve, the staged solver added
 * later, is the exception: one part per stage — see it below.)
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
import { parsePolynomial, samePolynomial } from '../../algebraicForm.mjs';
import { matchesNumericAnswer } from '../../toolMath/shared/toolMath.mjs';
import {
  RADICAL_SOLVE_DEFAULT,
  buildSignIntervals,
  isNotRealEntry,
  parseRadicalValueList,
  radicalSolveKey,
  radicalSolveSides,
  sameIntervalSelection,
  sameRadicalValueSet,
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

/*
 * RADICAL SOLVE: the method, one part per stage (signSolutionMath.mjs
 * radicalSolveKey), each right or wrong on its own — so the score is the
 * share of stages done right, unlike the all-or-nothing selections above.
 *
 *   isolate     the side the radical equals once it stands alone: any
 *               expression equal to (px + q − c)/a
 *   raise       the right side once both sides are raised to the index:
 *               (sx + t)ⁿ, expanded or not
 *   candidates  every real solution of the raised equation, in any order —
 *               or a word for none when it has none
 *   check       for each candidate the student listed, both sides of the
 *               ORIGINAL equation there (the left side "not real" where its
 *               root is not) and whether the candidate solves it. Judged
 *               against the student's own candidates, so careful checking
 *               earns its part after a slip in solving; with no candidate to
 *               check it is right only when there is none to find
 *   final       the solutions of the original equation, or no real solution
 *
 * Expressions are read as polynomials in the equation's variable
 * (algebraicForm.mjs), values as numbers or fractions within 0.01.
 */
const entry = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
const filled = (value) => entry(value).trim() !== '';
const DECISIONS = Object.freeze(['solution', 'extraneous']);

const polynomialIn = (coefficients, variable) => new Map(coefficients
  .map((value, index) => {
    const degree = coefficients.length - 1 - index;
    return [degree === 0 ? '' : degree === 1 ? variable : `${variable}^${degree}`, value];
  })
  .filter(([, value]) => Math.abs(value) > 1e-12));

const expressionPart = (id, label, value, expected, variable) => {
  const parsed = filled(value) ? parsePolynomial(entry(value)) : null;
  return {
    id,
    label,
    isComplete: filled(value),
    isCorrect: Boolean(parsed) && samePolynomial(parsed, polynomialIn(expected, variable), 0.01),
    response: entry(value),
  };
};

const listText = (list, variable) => (list.kind === 'none' ? 'none' : list.values.map((value) => `${variable} = ${value}`).join(', '));

const radicalSolve = (question, work) => withKey(
  () => radicalSolveKey(question.radicalEquation || RADICAL_SOLVE_DEFAULT),
  (key) => {
    const { variable } = key.equation;
    const candidates = parseRadicalValueList(work.candidates, variable);
    const rows = Array.isArray(work.rows) ? work.rows : [];
    const checked = candidates.kind === 'values' ? candidates.values.map((value, index) => {
      const row = rows[index] && typeof rows[index] === 'object' && !Array.isArray(rows[index]) ? rows[index] : {};
      const sides = radicalSolveSides(key.equation, value);
      const leftRight = sides.left === null ? isNotRealEntry(entry(row.left)) : matchesNumericAnswer(entry(row.left), sides.left, 0.01);
      const decided = typeof row.decision === 'string' && DECISIONS.includes(row.decision) ? row.decision : '';
      return {
        complete: filled(row.left) && filled(row.right) && decided !== '',
        correct: leftRight && matchesNumericAnswer(entry(row.right), sides.right, 0.01) && decided === (sides.holds ? 'solution' : 'extraneous'),
        response: `${variable} = ${value}: ${entry(row.left) || '?'} vs ${entry(row.right) || '?'}, ${decided || '?'}`,
      };
    }) : [];
    const final = parseRadicalValueList(work.finalAnswer, variable);
    const saysNone = work.noRealSolution === true || final.kind === 'none';
    const finalValues = final.kind === 'values' ? final.values : null;
    return gradedResult({
      parts: [
        expressionPart('isolate', 'Radical isolated', work.isolated, [key.isolated.m, key.isolated.b], variable),
        expressionPart('raise', 'Both sides raised to the index', work.raised, key.raised, variable),
        {
          id: 'candidates',
          label: 'Candidates',
          isComplete: candidates.kind !== 'blank',
          isCorrect: candidates.kind === 'none' ? key.candidates.length === 0 : candidates.kind === 'values' && sameRadicalValueSet(candidates.values, key.candidates),
          response: candidates.kind === 'blank' || candidates.kind === 'unreadable' ? entry(work.candidates) : listText(candidates, variable),
        },
        {
          id: 'check',
          label: 'Each candidate checked in the original equation',
          isComplete: checked.length ? checked.every((row) => row.complete) : candidates.kind === 'none',
          isCorrect: checked.length ? checked.every((row) => row.correct) : candidates.kind === 'none' && key.candidates.length === 0,
          response: checked.map((row) => row.response).join('; '),
        },
        {
          id: 'final',
          label: 'Solution of the original equation',
          isComplete: saysNone || final.kind !== 'blank',
          isCorrect: key.solutions.length
            ? !saysNone && Boolean(finalValues) && sameRadicalValueSet(finalValues, key.solutions)
            : saysNone && !finalValues,
          response: saysNone && !finalValues ? 'no real solution' : entry(work.finalAnswer),
        },
      ],
    });
  },
);

export default bindToolGrader(declaration, 'signSolutionAnalyzer', {
  polynomial: signChart(false),
  rational: signChart(true),
  radicalCheck,
  radicalSolve,
});
