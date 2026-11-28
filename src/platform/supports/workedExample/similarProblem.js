/*
 * "TRY A SIMILAR ONE": A WORKED SIBLING PROBLEM.
 *
 *   buildSimilarWorkedExample(question, { seed }) → { prompt, steps, answer } | null
 *
 * The question's family (../families) generates a sibling with different
 * numbers and works it in full. It must never be this question in disguise:
 *
 *   - its answer may not equal any answer of this question
 *     (questionAnswerValues), compared as text and, where numeric, as values;
 *   - its prompt may not equal this question's prompt;
 *   - none of its steps may contain one of this question's answers
 *     (hintRevealsAnswer);
 *
 * and a sibling that fails any check is not offered (null). Opening one is
 * mathematical help: QuestionEngine records it as workedExampleUsed, so the
 * next attempt is not counted as independent. Withheld wherever hints are.
 *
 * `keepCase` (only "Practise one like this", once the item has closed): the
 * family may work a sibling in the item's own case — "No solution" for a
 * no-solution item. The words the family names as that case (`caseAnswers`,
 * words only, never a number) are then the sibling's answer too, so they are
 * left out of the answers it may not show; every other check is the same.
 * While the item is open nothing asks for this, so a sibling there never says
 * which case the item is.
 */
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { familyFor } from '../families/index.js';
import { questionAnswerValues } from '../hints/questionHints.js';

const text = (value) => String(value ?? '').trim();
// A family step is a sentence, or { show, why }: the move and the reason it is
// made (a family that writes its reasons apart, as the A2 generators do). The
// guard reads both, so a reason cannot state an answer either.
const isStepObject = (step) => Boolean(step) && typeof step === 'object' && !Array.isArray(step);
const stepText = (step) => (isStepObject(step) ? [text(step.show), text(step.why)].filter(Boolean).join(' ') : text(step));
const stepPart = (step) => (isStepObject(step) ? { show: text(step.show), why: text(step.why) } : { show: text(step), why: '' });
const numeric = (value) => {
  const match = text(value).replace(/−/g, '-').replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(match)) return Number(match);
  const fraction = match.match(/^(-?\d+)\/(-?\d+)$/);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};

// Words only: a case's name ("No solution", "∅") never holds a digit or an
// equals sign, so "x = 3" or "3" named as a case is still this item's answer.
const caseWordsOf = (example) => (Array.isArray(example?.caseAnswers) ? example.caseAnswers : [])
  .map(text).filter((value) => value && !/[0-9=]/.test(value)).map((value) => value.toLowerCase());

// Answers a family knows that no field holds (a workshop division's quotient
// and remainder), read by this guard only: `exampleAnswers`, not
// `expectedValues`, so the hint guard and what a lesson's hints show are
// unchanged by a family that exists to build an example.
const exampleOnlyAnswers = (question) => {
  try {
    const family = familyFor(question);
    return typeof family?.exampleAnswers === 'function' ? (family.exampleAnswers(question) || []).map(text).filter(Boolean) : [];
  } catch {
    return [];
  }
};

export const similarExampleIsSafe = (question, example, { keepCase = false } = {}) => {
  if (!example || typeof example !== 'object') return false;
  const prompt = text(example.prompt);
  const answer = text(example.answer);
  const steps = (Array.isArray(example.steps) ? example.steps : []).map(stepText).filter(Boolean);
  if (!prompt || !answer || !steps.length) return false;
  if (prompt === text(question?.prompt)) return false;
  const shared = keepCase ? caseWordsOf(example) : [];
  const answers = [...questionAnswerValues(question), ...exampleOnlyAnswers(question)].filter((value) => !shared.includes(value.toLowerCase()));
  if (answers.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const exampleValue = numeric(answer);
  if (exampleValue !== null && answers.some((value) => numeric(value) !== null && Math.abs(numeric(value) - exampleValue) < 1e-9)) return false;
  if (steps.some((step) => hintRevealsAnswer(step, answers))) return false;
  if (hintRevealsAnswer(prompt, answers.filter((value) => numeric(value) === null))) return false;
  return true;
};

export const buildSimilarWorkedExample = (question, { seed = 0, keepCase = false } = {}) => {
  try {
    const family = familyFor(question);
    if (!family) return null;
    // A few seeds, so one unlucky draw that happens to share the answer is
    // replaced rather than withheld.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const example = family.similarProblem(question, { seed: Number(seed) + attempt, keepCase: keepCase === true });
      if (similarExampleIsSafe(question, example, { keepCase: keepCase === true })) {
        const parts = example.steps.map(stepPart).filter((part) => part.show);
        // `steps` stays one sentence a step (practice and the coverage report
        // read it); `parts` keeps each move's reason apart for the player.
        return {
          prompt: text(example.prompt),
          steps: parts.map((part) => [part.show, part.why].filter(Boolean).join(' ')),
          ...(example.steps.some(isStepObject) ? { parts } : {}),
          // The sibling's own problems (its polynomial, its expressions), so
          // the player can keep out one that is written in another item.
          ...(Array.isArray(example.problems) ? { problems: example.problems.map(text).filter(Boolean) } : {}),
          answer: text(example.answer),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const questionHasSimilarExample = (question) => Boolean(buildSimilarWorkedExample(question));
