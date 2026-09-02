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

export const suggestedQuestionWeight = (question = {}) => {
  const workflowCount = Array.isArray(question?.workflow) ? question.workflow.length : 0;
  const recipeCount = Array.isArray(question?.recipe?.ask)
    ? question.recipe.ask.length
    : (Array.isArray(question?.ask) ? question.ask.length : 0);
  const answerFieldCount = Array.isArray(question?.answerFields) ? question.answerFields.length : 0;
  const actionCount = Array.isArray(question?.studentActions) ? question.studentActions.length : 0;

  const workUnits = Math.max(
    workflowCount,
    recipeCount,
    answerFieldCount,
    Math.min(8, actionCount),
    1,
  );
  if (workUnits >= 8) return 4;
  if (workUnits >= 6) return 3;
  if (workUnits >= 4) return 2;
  if (workUnits >= 3) return 1.5;
  return 1;
};
