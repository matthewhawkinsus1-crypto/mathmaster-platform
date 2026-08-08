import { ACTIVITY_ROLES, getEffectiveActivityPolicy } from '../policies/activityPolicies.js';

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value)));

const normalizeScore = (value) => {
  const candidate = value && typeof value === 'object' ? (value.score ?? value.percent ?? value.percentage) : value;
  return Number.isFinite(Number(candidate)) ? clampPercent(candidate) : null;
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
  const previousScore = Number.isFinite(Number(post?.lastSyncedScore)) ? Number(post.lastSyncedScore) : null;
  return {
    postId: post?.postId || null,
    previousScore,
    newCompositeScore,
    shouldSyncToClassroom: previousScore !== newCompositeScore,
  };
};
