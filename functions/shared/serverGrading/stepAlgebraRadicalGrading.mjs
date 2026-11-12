/*
 * GRADING A RADICAL EQUATION SOLVED ON THE RELATION WORKSPACE.
 *
 * Squaring (or cubing, or raising to a 4th or 5th power) produces CANDIDATES,
 * and an even power can produce one the original equation rejects. So a
 * finished radical solve is three things, each judged against the
 * AUTHORITATIVE equation the server holds — never against anything the
 * response says about itself:
 *
 *   relation-work           the algebra reached exactly the candidates raising
 *                           both sides produces (every one, none invented).
 *                           The one shortcut: an isolated even root equal to a
 *                           negative number is "no real solution" with no
 *                           algebra at all — and only that shape (the claim
 *                           must be true of the ORIGINAL equation).
 *   candidate-verification  for EVERY candidate the student reached: both
 *                           sides of the original equation, substituted and
 *                           evaluated (exact values — 1/4 and 0.25 are the
 *                           same), and the decision that follows from them.
 *   solution-set            the final answer: the candidates that satisfy the
 *                           original, unordered, a repeated root once, or "no
 *                           real solution" — and "no real solution" is only
 *                           right when every candidate failed (or none was
 *                           ever produced).
 *
 * "No candidates" and "every candidate failed" are different outcomes and are
 * reported as such (`detail.radical.outcome`); neither excuses the checks the
 * other requires: a student who reached candidates must check each one before
 * "no real solution" is a finished answer.
 *
 * Checks are keyed by the candidate's VALUE, not by where it sits, so when an
 * earlier step changes the candidates, a check for a value that is no longer
 * a candidate is simply not read and the new candidates are unchecked again.
 * The workspace clears them at the same moment; the server does not depend on
 * that.
 *
 * Student text is data: a typed number is read only if it is plain algebra
 * inside the standard budget (isSafeStudentExpression), exactly.
 *
 * Pure: the light radical shape, the exact-rational reader and the shared
 * algebra engine.
 */
import { latexToExpression } from '../algebra/algebraAstEngine.mjs';
import { exactRationalFromExpression } from '../algebra/algebraExactRational.mjs';
import { evaluate } from '../algebra/safeMath.mjs';
import {
  parseRadicalEquation,
  radicalSidesAt,
  rational,
  rationalEquals,
  rationalToNumber,
  rationalToText,
  solveRadicalShape,
} from '../toolMath/algebra-relations/radicalEquationShape.mjs';
import { isSafeStudentExpression } from './stepAlgebraEquivalence.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const typed = (value) => (typeof value === 'string' ? value : '');
const MAX_TYPED_VALUE = 80;

// --- Reading typed numbers ---------------------------------------------------------------

const expressionOf = (value) => {
  const raw = typed(value).trim();
  if (!raw || raw.length > MAX_TYPED_VALUE) return null;
  try {
    const expression = latexToExpression(raw);
    return isSafeStudentExpression(expression) ? expression : null;
  } catch {
    return null;
  }
};

/** The exact rational a typed number stands for (0.25, 1/4 and \frac{1}{4} alike), or null. */
export const readExactValue = (value) => {
  const expression = expressionOf(value);
  if (expression === null) return null;
  try {
    const exact = exactRationalFromExpression(expression);
    return exact ? rational(exact.n, exact.d) : null;
  } catch {
    return null;
  }
};

/*
 * A value written with a root — sqrt(9) + 2 for 5 — is a number a student
 * substituting into the original equation really types. It is read by
 * evaluating only when it holds no letter, and compared very tightly.
 */
const readRadicalNumber = (value) => {
  const expression = expressionOf(value);
  if (expression === null || !/\b(?:sqrt|cbrt|nthRoot)\s*\(/.test(expression) || /[A-Za-z]/.test(expression.replace(/sqrt|cbrt|nthRoot/g, ''))) return null;
  try {
    const number = Number(evaluate(expression));
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
};

const isReadableValue = (value) => readExactValue(value) !== null || readRadicalNumber(value) !== null;

const valueEquals = (value, expected) => {
  if (!expected) return false;
  const exact = readExactValue(value);
  if (exact) return rationalEquals(exact, expected);
  const number = readRadicalNumber(value);
  const target = rationalToNumber(expected);
  return number !== null && Math.abs(number - target) <= 1e-12 * Math.max(1, Math.abs(target));
};

const distinct = (values) => values.filter((value, index, all) => all.findIndex((other) => rationalEquals(other, value)) === index);
const sameSet = (left, right) => left.length === right.length && left.every((value) => right.some((other) => rationalEquals(other, value)));
const includes = (list, value) => list.some((other) => rationalEquals(other, value));
const keyOf = (value) => `${value.n}/${value.d}`;

// --- The authoritative equation --------------------------------------------------------

/**
 * The radical shape and its exact solution for the ORIGINAL relation the
 * server holds, or null when this is not a radical equation the lesson
 * verifies (the caller then grades it as it always did).
 */
export const radicalGradingContext = (pristine) => {
  if (!pristine) return null;
  const parsed = parseRadicalEquation(pristine.original, { variable: pristine.variable });
  if (!parsed.ok) return null;
  const expected = solveRadicalShape(parsed.shape);
  return expected.ok ? { shape: parsed.shape, expected } : null;
};

// --- Grading ----------------------------------------------------------------------------

const candidateRows = ({ shape, expected, reached, checks }) => {
  const byValue = new Map();
  checks.filter(isObject).forEach((entry) => {
    const value = readExactValue(entry.candidate);
    if (value) byValue.set(keyOf(value), entry);
  });
  return reached.map((candidate) => {
    const entry = byValue.get(keyOf(candidate)) || null;
    const choice = entry?.choice === 'valid' || entry?.choice === 'extraneous' ? entry.choice : null;
    const sides = radicalSidesAt(shape, candidate);
    const complete = Boolean(entry) && choice !== null && isReadableValue(entry.left) && isReadableValue(entry.right);
    const truth = includes(expected.genuine, candidate) ? 'valid' : 'extraneous';
    const correct = complete
      && sides.defined && sides.left !== null && sides.right !== null
      && valueEquals(entry.left, sides.left)
      && valueEquals(entry.right, sides.right)
      && choice === truth;
    return { candidate, choice, complete, correct };
  });
};

const readSolutionSet = (solutionSet) => {
  if (!isObject(solutionSet)) return { complete: false, values: null, none: false };
  if (solutionSet.none === true) return { complete: true, values: [], none: true };
  const entries = Array.isArray(solutionSet.values) ? solutionSet.values : [];
  const read = entries.map(readExactValue);
  const complete = entries.length > 0 && read.every(Boolean);
  return { complete, values: complete ? distinct(read) : null, none: false };
};

/**
 * Grade a radical equation's final work. `summary` is relationSolutionSummary
 * of the student's final relation; `work` the relation workspace's work.
 * Returns { parts, isComplete, isCorrect, detail }.
 */
export const gradeRadicalRelation = ({ context, summary, work, awaitingSymbolDecision, relationText }) => {
  const { shape, expected } = context;
  const claimsNoSolution = summary.solved === true && summary.kind === 'special' && summary.special === 'noSolution';

  // The candidates the student's algebra reached, as exact numbers.
  let reached = null;
  if (summary.solved === true && summary.kind === 'values') {
    const read = (summary.valueExpressions || []).map(readExactValue);
    reached = read.length > 0 && read.every(Boolean) ? distinct(read) : null;
  }
  const reachedCandidates = reached !== null && sameSet(reached, expected.candidates);
  const relationCorrect = reachedCandidates || (claimsNoSolution && expected.structuralNoSolution);

  // Everything below is owed only when the algebra ended in candidates.
  const owesChecks = summary.solved === true && summary.kind === 'values';
  const rows = owesChecks && reached !== null
    ? candidateRows({ shape, expected, reached, checks: Array.isArray(work?.candidateChecks) ? work.candidateChecks : [] })
    : [];
  const checksComplete = owesChecks && reached !== null && rows.every((row) => row.complete);
  const checksCorrect = checksComplete && reachedCandidates && rows.every((row) => row.correct);

  const set = readSolutionSet(work?.solutionSet);
  const setCorrect = set.complete && sameSet(set.values, expected.genuine);

  const isComplete = !awaitingSymbolDecision
    && summary.solved === true
    && (claimsNoSolution || (checksComplete && set.complete));
  const isCorrect = isComplete && relationCorrect && (claimsNoSolution || (checksCorrect && setCorrect));

  const parts = [{
    id: 'relation-work',
    label: 'Solve the equation or inequality',
    isComplete: summary.solved === true,
    isCorrect: summary.solved === true && relationCorrect,
    response: relationText,
  }];
  if (owesChecks) {
    parts.push({
      id: 'candidate-verification',
      label: 'Check candidates in the original equation',
      isComplete: checksComplete,
      isCorrect: checksCorrect,
      response: rows.map((row) => `${rationalToText(row.candidate)}:${row.choice || 'unchecked'}`).join(', '),
    });
    parts.push({
      id: 'solution-set',
      label: 'State the solution set',
      isComplete: set.complete,
      isCorrect: setCorrect,
      response: !set.complete ? '' : set.none ? 'no real solution' : set.values.map(rationalToText).join(', '),
    });
  }

  // "No candidates" and "every candidate failed" are told apart by what each
  // owes, which the parts carry: a structural claim stands alone as its
  // relation-work part (there is nothing to check), while candidates that all
  // fail owe a check each and a solution-set of "no real solution".
  return { parts, isComplete, isCorrect };
};
