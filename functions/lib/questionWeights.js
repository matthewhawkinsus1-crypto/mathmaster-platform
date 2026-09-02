"use strict";

const DEFAULT_QUESTION_WEIGHT = 1;
const MIN_QUESTION_WEIGHT = 0.25;
const MAX_QUESTION_WEIGHT = 20;

function normalizeQuestionWeight(question = {}) {
  const parsed = Number(question?.questionWeight);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_QUESTION_WEIGHT;
  return Math.max(MIN_QUESTION_WEIGHT, Math.min(MAX_QUESTION_WEIGHT, parsed));
}

function weightedQuestionTotals({
  tracker = null,
  questions = [],
  indices = [],
  creditForRecord,
  attemptedForRecord = null,
} = {}) {
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
}

module.exports = {
  DEFAULT_QUESTION_WEIGHT,
  MIN_QUESTION_WEIGHT,
  MAX_QUESTION_WEIGHT,
  normalizeQuestionWeight,
  weightedQuestionTotals,
};
