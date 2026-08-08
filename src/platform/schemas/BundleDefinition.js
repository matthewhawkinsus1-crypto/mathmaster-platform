import { ACTIVITY_ROLES, isActivityRole, normalizeActivityRole, toEnforcedActivityPolicy } from '../policies/activityPolicies.js';
import { generateStableId, stableStringify } from '../../utils/idUtils.js';
import { normalizeQuestionDefinition } from './QuestionDefinition.js';
import { normalizeLabDefinition } from '../labs/labDefinitionSchema.js';

export const CURRENT_BUNDLE_SCHEMA_VERSION = 3;

const parseBundleJson = (rawJson) => {
  if (typeof rawJson === 'string') {
    const trimmed = rawJson.trim();
    if (!trimmed) throw new Error('Lesson Bundle JSON is empty.');
    return JSON.parse(trimmed);
  }
  return rawJson;
};

const safeMetadata = (json) => {
  const source = json?.lessonMetadata || json?.lessonBundle || {};
  return source && typeof source === 'object' && !Array.isArray(source) ? source : {};
};

const titleForRole = (role) => ({
  [ACTIVITY_ROLES.WARMUP]: 'Warm-Up',
  [ACTIVITY_ROLES.CLASSWORK]: 'Classwork',
  [ACTIVITY_ROLES.DOL]: 'DOL',
  [ACTIVITY_ROLES.PRACTICE]: 'Practice',
  [ACTIVITY_ROLES.QUIZ]: 'Quiz',
  [ACTIVITY_ROLES.TEST]: 'Unit Test',
}[role] || 'Activity');

export const normalizeLessonBundle = (rawJson) => {
  const json = parseBundleJson(rawJson);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new TypeError('Lesson Bundle V3 must be a JSON object.');
  }
  const sourceActivities = Array.isArray(json.activities) ? json.activities : [];
  const metadata = safeMetadata(json);
  const bundleSeed = json.bundleId || stableStringify({ lessonMetadata: metadata, activities: sourceActivities });
  const bundleId = String(json.bundleId || generateStableId('bundle', bundleSeed));
  const normalizationWarnings = [];

  const activities = sourceActivities.map((sourceActivity, activityIndex) => {
    const activity = sourceActivity && typeof sourceActivity === 'object' && !Array.isArray(sourceActivity)
      ? sourceActivity
      : {};
    const requestedRole = String(activity.role || ACTIVITY_ROLES.CLASSWORK).trim().toLowerCase();
    const role = normalizeActivityRole(requestedRole);
    if (!isActivityRole(requestedRole)) {
      normalizationWarnings.push(`Activity ${activityIndex + 1} used unsupported role "${requestedRole}" and was normalized to classwork.`);
    }
    const activityId = String(activity.activityId || generateStableId('act', bundleId, activityIndex, role, activity.title || ''));
    const enforcedPolicy = toEnforcedActivityPolicy(role);
    const labDefinition = activity.labDefinition || activity.isModelingLab
      ? normalizeLabDefinition(activity.labDefinition || activity)
      : null;
    const sourceQuestions = Array.isArray(activity.questions) ? activity.questions : [];
    const questions = sourceQuestions.map((question, questionIndex) => {
      const questionId = String(question?.questionId || question?.id || generateStableId('q', bundleId, activityId, questionIndex));
      const normalized = normalizeQuestionDefinition(question, { questionId });
      if (normalized.ignoredPolicyOverrides.length) {
        normalizationWarnings.push(
          `${activityId} question ${questionIndex + 1}: ignored question-level policy override(s): ${normalized.ignoredPolicyOverrides.join(', ')}.`,
        );
      }
      return {
        ...normalized,
        questionId,
        activityId,
        activityRole: role,
        calculatorPolicy: normalized.calculatorPolicy,
        enforcedPolicy: { ...enforcedPolicy, grading: { ...enforcedPolicy.grading }, mastery: { ...enforcedPolicy.mastery } },
      };
    });

    return {
      activityId,
      role,
      title: String(activity.title || labDefinition?.title || titleForRole(role)),
      policy: { ...enforcedPolicy, grading: { ...enforcedPolicy.grading }, mastery: { ...enforcedPolicy.mastery } },
      isModelingLab: Boolean(labDefinition),
      labDefinition,
      questions,
    };
  });

  return {
    schemaVersion: CURRENT_BUNDLE_SCHEMA_VERSION,
    bundleId,
    lessonMetadata: {
      ...metadata,
      title: String(metadata.title || 'Untitled Lesson'),
      course: String(metadata.course || 'Unknown Course'),
      topic: metadata.topic ?? null,
    },
    activities,
    normalizationWarnings,
  };
};
