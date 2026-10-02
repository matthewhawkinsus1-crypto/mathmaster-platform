/*
 * WHAT A FRACTION QUESTION SHOWS THE STUDENT.
 *
 * Kept out of the .jsx so it can be tested: node cannot import a component,
 * and these decisions are the visible half of the fraction-question fix
 * (functions/shared/fractionAnswer.mjs).
 *
 * A drill, or a sum the author wrote out, asks the student to add the two
 * fractions on screen. A question whose author wrote the answer asks whatever
 * its prompt asks. Putting a generated "a/b + c/d =" beside that prompt showed
 * the student a second question — and the grader used to mark that one.
 */
import {
  FRACTION_QUESTION_SHAPES,
  fractionAnswerCandidates,
  fractionQuestionShape,
  writtenNumberLatex,
} from '../functions/shared/fractionAnswer.mjs';

const asText = (value) => String(value ?? '').trim();
const unique = (values) => [...new Set(values.filter((value) => asText(value) !== '').map(asText))];

/**
 * prompt           the prompt to show ('' = none)
 * expressionLatex  the math line under the prompt ('' = none)
 * questionText     how the question is described in the response details a
 *                  teacher reads
 */
export const fractionQuestionDisplay = (question) => {
  const q = question && typeof question === 'object' ? question : {};
  const shape = fractionQuestionShape(q);
  if (shape !== FRACTION_QUESTION_SHAPES.AUTHORED_ANSWER) {
    return {
      shape,
      prompt: q.prompt || 'Add the fractions.',
      expressionLatex: q.expressionLatex || `\\frac{${q.n1}}{${q.d1}} + \\frac{${q.n2}}{${q.d2}} =`,
      questionText: q.prompt || `Solve: ${q.n1}/${q.d1} + ${q.n2}/${q.d2}`,
    };
  }
  return {
    shape,
    prompt: q.prompt || '',
    expressionLatex: q.expressionLatex || '',
    questionText: q.prompt || q.expressionLatex || 'Answer with a fraction.',
  };
};

/**
 * The solution-review lines for a fraction question.
 *
 * An authored answer is shown as the author wrote it (stacked), with any
 * accepted forms they listed — and nothing they did not write: a decimal line
 * would tell the student 0.75 was acceptable when "lowest terms" says it is
 * not. A drill keeps its fraction, decimal and slash lines.
 */
export const fractionSolutionRepresentations = (question) => {
  const q = question && typeof question === 'object' ? question : {};
  if (fractionQuestionShape(q) === FRACTION_QUESTION_SHAPES.AUTHORED_ANSWER) {
    return unique(fractionAnswerCandidates(q).map(writtenNumberLatex)).slice(0, 3);
  }
  const numerator = Number(q.ansNum);
  const denominator = Number(q.ansDen);
  const decimal = denominator ? numerator / denominator : null;
  return unique([
    `\\frac{${numerator}}{${denominator}}`,
    Number.isFinite(decimal) ? `Decimal: ${Number(decimal.toFixed(6))}` : '',
    `${numerator}/${denominator}`,
  ]).slice(0, 3);
};
