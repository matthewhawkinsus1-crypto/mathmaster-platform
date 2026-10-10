/*
 * THE INCLUSION "LET'S BACK UP" STEP FOR ONE QUESTION.
 *
 *   backUpStepFor(question) → { prompt, options, correct, source }
 *
 * After two misses, a student with inclusion supports gets one quick
 * two-choice check before the next try. It used to be the same sentence on
 * every item of a type ("What operation undoes multiplication?" on every Step
 * Algebra question, whatever the equation). Now, in order:
 *
 *   authored    the question's own `scaffold` { prompt, options, correct }
 *   family      the question family's backUpQuestion — about THIS problem's
 *               first move (src/platform/supports/families)
 *   platform    a generic re-orientation question for the type
 *
 * It never asks for the answer. Every step is recorded as backUpStepUsed. An
 * authored or family step names THIS problem's first move (and a wrong pick
 * leaves only the other choice), so it is help with the mathematics: it is
 * also recorded as scaffoldUsed and the next attempt is a supported one. Only
 * the platform's generic step, true of every problem of the type, is not
 * (supportUseMemory.js attemptSupportUsageFrom; PR #462 review B3).
 */
import { familyFor } from '../families/index.js';

const text = (value) => String(value ?? '').trim();

const valid = (step) => {
  if (!step || typeof step !== 'object') return null;
  const options = (Array.isArray(step.options) ? step.options : []).map(text).filter(Boolean);
  const correct = text(step.correct);
  if (!text(step.prompt) || options.length < 2 || !options.includes(correct)) return null;
  return { prompt: text(step.prompt), options, correct };
};

const PLATFORM_STEPS = Object.freeze({
  // True of every equation, so it can never point the wrong way when the
  // family has nothing specific to ask.
  stepAlgebra: { prompt: 'Let’s back up. When you change one side of an equation, what must you do to the other side?', options: ['The same thing', 'Nothing'], correct: 'The same thing' },
  functionGraph: { prompt: 'Before continuing, must a plotted point match both its x-coordinate and y-coordinate?', options: ['Yes', 'No'], correct: 'Yes' },
  functionInvestigation: { prompt: 'Before continuing, must a plotted point match both its x-coordinate and y-coordinate?', options: ['Yes', 'No'], correct: 'Yes' },
});
const GENERIC_STEP = Object.freeze({ prompt: 'Before continuing, should you revise the specific parts identified in the feedback?', options: ['Yes', 'No'], correct: 'Yes' });

export const backUpStepFor = (question) => {
  const authored = valid(question?.scaffold);
  if (authored) return { ...authored, source: 'authored' };
  try {
    const family = familyFor(question);
    const fromFamily = valid(family?.backUpQuestion?.(question));
    if (fromFamily) return { ...fromFamily, source: 'family' };
  } catch { /* fall through to the platform step */ }
  const platform = PLATFORM_STEPS[text(question?.type)] || GENERIC_STEP;
  return { ...platform, options: [...platform.options], source: 'platform' };
};

export default backUpStepFor;
