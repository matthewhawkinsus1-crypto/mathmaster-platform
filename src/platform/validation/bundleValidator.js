import { isActivityRole, toEnforcedActivityPolicy } from '../policies/activityPolicies.js';
import { CURRENT_BUNDLE_SCHEMA_VERSION } from '../schemas/BundleDefinition.js';
import { validateQuestionDefinition } from './validatorRegistry.js';
import { validateLabDefinition } from '../labs/labDefinitionSchema.js';

const policiesMatch = (actual, expected) => (
  actual?.attemptsAllowed === expected.attemptsAllowed
  && actual?.allowReplacement === expected.allowReplacement
  && actual?.feedbackMode === expected.feedbackMode
  && actual?.hintsAllowed === expected.hintsAllowed
  && actual?.remediationAllowed === expected.remediationAllowed
  && actual?.adaptiveDuringAttempt === expected.adaptiveDuringAttempt
  && actual?.calculatorDefault === expected.calculatorDefault
);

export const validateLessonBundle = (normalizedBundle) => {
  const report = {
    bundleId: normalizedBundle?.bundleId || null,
    isValid: true,
    criticalErrors: [],
    warnings: [...(Array.isArray(normalizedBundle?.normalizationWarnings) ? normalizedBundle.normalizationWarnings : [])],
    activityReports: [],
  };
  if (!normalizedBundle || typeof normalizedBundle !== 'object') {
    return { ...report, isValid: false, criticalErrors: ['Bundle is missing or not an object.'] };
  }
  if (Number(normalizedBundle.schemaVersion) !== CURRENT_BUNDLE_SCHEMA_VERSION) {
    report.criticalErrors.push(`Bundle schemaVersion must be ${CURRENT_BUNDLE_SCHEMA_VERSION}.`);
  }
  if (!normalizedBundle.bundleId) report.criticalErrors.push('Bundle is missing bundleId.');
  if (!Array.isArray(normalizedBundle.activities) || normalizedBundle.activities.length === 0) {
    report.criticalErrors.push('Bundle contains no activities.');
  }
  const activityIds = new Set();
  const questionIds = new Set();
  const roleCounts = new Map();

  (normalizedBundle.activities || []).forEach((activity) => {
    const actReport = {
      activityId: activity?.activityId || null,
      role: activity?.role || null,
      title: activity?.title || '',
      questionCount: Array.isArray(activity?.questions) ? activity.questions.length : 0,
      isModelingLab: activity?.isModelingLab === true,
      isValid: true,
      errors: [],
      warnings: [],
    };
    if (!activity?.activityId) actReport.errors.push('Activity is missing activityId.');
    else if (activityIds.has(activity.activityId)) actReport.errors.push(`Duplicate activityId: ${activity.activityId}.`);
    else activityIds.add(activity.activityId);
    if (!isActivityRole(activity?.role)) actReport.errors.push(`Unsupported activity role: ${activity?.role || '(missing)'}.`);
    else {
      roleCounts.set(activity.role, (roleCounts.get(activity.role) || 0) + 1);
      const expectedPolicy = toEnforcedActivityPolicy(activity.role);
      if (!policiesMatch(activity.policy, expectedPolicy)) actReport.errors.push('Activity policy does not match the central policy registry.');
    }
    const hasQuestions = Array.isArray(activity?.questions) && activity.questions.length > 0;
    const hasLab = activity?.isModelingLab === true && activity?.labDefinition;
    if (!hasQuestions && !hasLab) actReport.errors.push('Activity has no questions and no modeling lab.');
    if (hasLab) {
      const labValidation = validateLabDefinition(activity.labDefinition);
      if (!labValidation.isValid) actReport.errors.push(`Modeling lab: ${labValidation.errors.join(' | ')}`);
      if (labValidation.warnings.length) actReport.warnings.push(`Modeling lab: ${labValidation.warnings.join(' | ')}`);
    }

    (activity?.questions || []).forEach((question, index) => {
      const validation = validateQuestionDefinition(question);
      if (question?.questionId) {
        if (questionIds.has(question.questionId)) actReport.errors.push(`Question ${index + 1}: duplicate questionId ${question.questionId}.`);
        else questionIds.add(question.questionId);
      }
      if (question?.activityRole !== activity.role) actReport.errors.push(`Question ${index + 1}: activityRole does not match its activity.`);
      if (isActivityRole(activity?.role) && !policiesMatch(question?.enforcedPolicy, toEnforcedActivityPolicy(activity.role))) {
        actReport.errors.push(`Question ${index + 1}: enforcedPolicy does not match the central policy registry.`);
      }
      if (!validation.isValid) actReport.errors.push(`Question ${index + 1}: ${validation.errors.join(' | ')}`);
      if (validation.warnings.length) actReport.warnings.push(`Question ${index + 1}: ${validation.warnings.join(' | ')}`);
    });
    actReport.isValid = actReport.errors.length === 0;
    if (!actReport.isValid) report.isValid = false;
    report.activityReports.push(actReport);
  });
  roleCounts.forEach((count, role) => {
    if (count > 1) report.warnings.push(`Bundle contains ${count} ${role} activities; publication preserves all of them in source order.`);
  });
  if (report.criticalErrors.length) report.isValid = false;
  return report;
};
