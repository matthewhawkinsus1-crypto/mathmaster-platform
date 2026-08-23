import { ACTIVITY_ROLES, getEffectiveActivityPolicy } from '../policies/activityPolicies.js';
import { finiteNumber } from '../utils/numeric.js';

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value)));

// A MISSING SCORE IS NOT A ZERO.
//
// `Number(null)` is 0, so this guard used to accept a missing score and clamp
// it to 0 — which meant the `if (score === null) return;` skip below never
// fired, and an activity with no score recorded was averaged into the composite
// grade as a hard zero rather than being left out of it. That is the same
// mistake as converting unanswered work into academic failure, made one level
// further down where nothing on any screen could show it.
const normalizeScore = (value) => {
  const candidate = value && typeof value === 'object' ? (value.score ?? value.percent ?? value.percentage) : value;
  const parsed = finiteNumber(candidate);
  return parsed === null ? null : clampPercent(parsed);
};

export const calculateCompositeActivityGrade = (activityScores = []) => {
  let totalWeight = 0;
  let weightedScoreSum = 0;
  (Array.isArray(activityScores) ? activityScores : []).forEach((entry) => {
    if (!entry || entry.role === ACTIVITY_ROLES.WARMUP) return;
    const score = normalizeScore(entry.score ?? entry);
    if (score === null) return;
    const policy = getEffectiveActivityPolicy(entry.role);
    const weight = Math.max(0, Number(policy.grading.compositeWeight) || 0);
    if (weight <= 0) return;
    totalWeight += weight;
    weightedScoreSum += score * weight;
  });
  return totalWeight > 0 ? Math.round(weightedScoreSum / totalWeight) : 0;
};

export const calculateCompositeLessonGrade = (activityScoresByRole = {}) => {
  const entries = [];
  Object.entries(activityScoresByRole || {}).forEach(([role, value]) => {
    const values = Array.isArray(value) ? value : [value];
    values.forEach((score) => entries.push({ role, score }));
  });
  return calculateCompositeActivityGrade(entries);
};

export const recomputePostGradeOnCorrection = (post, updatedActivityScores) => {
  const newCompositeScore = Array.isArray(updatedActivityScores)
    ? calculateCompositeActivityGrade(updatedActivityScores)
    : calculateCompositeLessonGrade(updatedActivityScores);
  // Never synced is null, not zero — otherwise a first sync of a genuine 0%
  // looks like no change and is skipped.
  const previousScore = finiteNumber(post?.lastSyncedScore);
  return {
    postId: post?.postId || null,
    previousScore,
    newCompositeScore,
    shouldSyncToClassroom: previousScore !== newCompositeScore,
  };
};
