import { estimateQuestionValue } from '../../../functions/shared/questionValue.mjs';

const finitePositive = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const DEFAULT_QUESTION_WEIGHT = 1;
export const MIN_QUESTION_WEIGHT = 0.25;
export const MAX_QUESTION_WEIGHT = 20;

export const normalizeQuestionWeight = (question = {}) => {
  const raw = finitePositive(question?.questionWeight);
  if (raw === null) return DEFAULT_QUESTION_WEIGHT;
  return Math.max(MIN_QUESTION_WEIGHT, Math.min(MAX_QUESTION_WEIGHT, raw));
};

export const weightedQuestionTotals = ({
  tracker = null,
  questions = [],
  indices = [],
  creditForRecord,
  attemptedForRecord = null,
} = {}) => {
  let possibleWeight = 0;
  let earnedWeight = 0;
  let attemptedWeight = 0;
  let attemptedEarnedWeight = 0;

  (Array.isArray(indices) ? indices : []).forEach((index) => {
    const question = questions?.[index] || {};
    const weight = normalizeQuestionWeight(question);
    const credit = Math.max(0, Math.min(1, Number(creditForRecord?.(tracker?.[index])) || 0));
    possibleWeight += weight;
    earnedWeight += credit * weight;

    if (attemptedForRecord?.(tracker?.[index])) {
      attemptedWeight += weight;
      attemptedEarnedWeight += credit * weight;
    }
  });

  return {
    possibleWeight,
    earnedWeight,
    attemptedWeight,
    attemptedEarnedWeight,
    score: possibleWeight > 0 ? Math.round((earnedWeight / possibleWeight) * 100) : null,
    creditOnAttempted: attemptedWeight > 0
      ? Math.round((attemptedEarnedWeight / attemptedWeight) * 100)
      : null,
  };
};

/*
 * The value MathMaster gives a question when it is created — the SAME rule
 * the authoring compiler stamps, the editor's "Suggest" offers and the AI
 * weight review is shown (functions/shared/questionValue.mjs). It counts the
 * work the question's own grader assesses (cards, fields, stages, modes), so a
 * rich tool's board is no longer measured as one answer because it has no
 * `answerFields`.
 */
export const suggestedQuestionWeight = (question = {}) => estimateQuestionValue(question).value;
