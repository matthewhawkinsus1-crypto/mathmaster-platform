// Moved from src/grading/equivalence.js (now an `export *`
// shim) so the shared composed-workflow grader
// (functions/shared/serverGrading/questionGraders/composedWorkflow.mjs) reads
// a workflow with the same code the browser runs.

// The hardened instance (../../algebra/safeMath.mjs): this runs on student
// text on the server, where a range, an allocating call or a namespace change
// would reach every student graded by the same instance.
import { parse, simplify } from '../../algebra/safeMath.mjs';
import { compareMathAnswer, normalizeMathAnswer } from '../../answerUtils.mjs';
import { sameValue as sharedAnswerEquivalent } from '../../answerEquivalence.mjs';
import { algebraicExpressionInput } from './expressionSafety.mjs';

// What reaches the parser at all — one definition, shared with the grader's
// pre-check of student text (expressionSafety.mjs).
const safeExpression = algebraicExpressionInput;

export const isAlgebraicallyEquivalent = (studentExpression, expectedExpression, tolerance = 1e-9) => {
  // Use the same conservative equivalence rules as secure My Math Path first.
  // This prevents assignment grading and Path grading from disagreeing about
  // the same student-written equation.
  if (sharedAnswerEquivalent(studentExpression, expectedExpression, tolerance)) return true;
  if (compareMathAnswer(studentExpression, expectedExpression, tolerance)) return true;
  const student = safeExpression(studentExpression);
  const expected = safeExpression(expectedExpression);
  if (!student || !expected) return false;
  if (student.includes('=') || expected.includes('=')) {
    const studentParts = student.split('=');
    const expectedParts = expected.split('=');
    if (studentParts.length !== 2 || expectedParts.length !== 2) return false;
    const forward = normalizeMathAnswer(studentParts[0]) === normalizeMathAnswer(expectedParts[0])
      && normalizeMathAnswer(studentParts[1]) === normalizeMathAnswer(expectedParts[1]);
    const reversed = normalizeMathAnswer(studentParts[0]) === normalizeMathAnswer(expectedParts[1])
      && normalizeMathAnswer(studentParts[1]) === normalizeMathAnswer(expectedParts[0]);
    return forward || reversed;
  }
  try {
    parse(student);
    parse(expected);
    const simplified = simplify(`(${student}) - (${expected})`).toString().replace(/\s+/g, '');
    return simplified === '0';
  } catch {
    return false;
  }
};
