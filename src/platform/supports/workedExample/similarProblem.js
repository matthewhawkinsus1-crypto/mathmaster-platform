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
 */
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { familyFor } from '../families/index.js';
import { questionAnswerValues } from '../hints/questionHints.js';

const text = (value) => String(value ?? '').trim();
const numeric = (value) => {
  const match = text(value).replace(/−/g, '-').replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(match)) return Number(match);
  const fraction = match.match(/^(-?\d+)\/(-?\d+)$/);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};

export const similarExampleIsSafe = (question, example) => {
  if (!example || typeof example !== 'object') return false;
  const prompt = text(example.prompt);
  const answer = text(example.answer);
  const steps = (Array.isArray(example.steps) ? example.steps : []).map(text).filter(Boolean);
  if (!prompt || !answer || !steps.length) return false;
  if (prompt === text(question?.prompt)) return false;
  const answers = questionAnswerValues(question);
  if (answers.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const exampleValue = numeric(answer);
  if (exampleValue !== null && answers.some((value) => numeric(value) !== null && Math.abs(numeric(value) - exampleValue) < 1e-9)) return false;
  if (steps.some((step) => hintRevealsAnswer(step, answers))) return false;
  if (hintRevealsAnswer(prompt, answers.filter((value) => numeric(value) === null))) return false;
  return true;
};

export const buildSimilarWorkedExample = (question, { seed = 0 } = {}) => {
  try {
    const family = familyFor(question);
    if (!family) return null;
    // A few seeds, so one unlucky draw that happens to share the answer is
    // replaced rather than withheld.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const example = family.similarProblem(question, { seed: Number(seed) + attempt });
      if (similarExampleIsSafe(question, example)) {
        return { prompt: text(example.prompt), steps: example.steps.map(text).filter(Boolean), answer: text(example.answer) };
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const questionHasSimilarExample = (question) => Boolean(buildSimilarWorkedExample(question));
