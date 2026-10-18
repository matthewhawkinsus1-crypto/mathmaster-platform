/*
 * HINTS THAT GIVE THE ANSWER — a Pre-Flight WARNING, never a block (student
 * pass 3, P2-6 / the matrices walkthrough's R-11).
 *
 * In the matrices lesson the hints did the items: CW 8's second and third
 * hints wrote rows 1 and 2 of the matrix equation, PR 10's wrote the
 * comparison row, CW 2's said "row 3, column 1", and CW 4's sorted one of the
 * figures. After three tries the hints had answered the question. A hint
 * should point at the next move; this tells the author which hints state the
 * thing the student is asked to produce:
 *
 *   - Matrix Lab: a row the student must write, a value of the solution, the
 *     place of an element described in words (matrixLabHintLeaks, shared);
 *   - a figure sort: a hint that quotes one of the figures to be sorted.
 *
 * ADVISORY, like attemptFeedbackPreflight.js: any warning in the readiness
 * diagnostics turns an assignment "Needs Review" and hides it from students,
 * and a hint that says a little too much is the author's call, not a broken
 * item. So these are shown in their own Pre-Flight panel.
 */
import { matrixLabHintLeaks } from '../../../functions/shared/toolMath/matrixLab/matrixLabModel.mjs';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hintsOf = (question) => asArray(question?.hints).map((hint) => clean(typeof hint === 'string' ? hint : hint?.text));

// A figure-sort hint that quotes a figure ("(4 × 1) · (1 × 4): … 4 × 4")
// sorts that figure for the student.
const figureHintLeaks = (question) => {
  const stages = asArray(question?.workflow).filter((stage) => isObject(stage) && stage.kind === 'figureMatch');
  const hints = hintsOf(question);
  const leaks = [];
  stages.forEach((stage) => {
    asArray(stage.items).forEach((item, index) => {
      const shown = clean(item?.text || item?.math);
      if (shown.length < 3) return;
      hints.forEach((hint, hintIndex) => {
        if (hint.includes(shown)) leaks.push({ hint: hintIndex + 1, reason: `quotes Figure ${index + 1} (${shown}), one of the figures the student sorts` });
      });
    });
  });
  return leaks;
};

export const questionHintLeaks = (question = {}) => {
  const type = clean(question?.type || question?.toolId);
  const leaks = type === 'matrixLab' ? matrixLabHintLeaks(question) : [];
  return [...leaks, ...figureHintLeaks(question)];
};

export const auditAssignmentHintAnswers = (questions = [], { deliveredOnly = true } = {}) => {
  const warnings = [];
  asArray(questions).forEach((question, index) => {
    if (!isObject(question)) return;
    if (deliveredOnly && question.teacherExcluded === true) return;
    const byHint = new Map();
    questionHintLeaks(question).forEach((leak) => byHint.set(leak.hint, [...(byHint.get(leak.hint) || []), leak.reason]));
    [...byHint].sort(([a], [b]) => a - b).forEach(([hint, reasons]) => {
      warnings.push(`Question ${index + 1}, hint ${hint} ${[...new Set(reasons)].join('; ')}. A hint should point at the next move without doing it: ask what to look at, or name the step, and leave the result to the student.`);
    });
  });
  return { warnings };
};

export default auditAssignmentHintAnswers;
