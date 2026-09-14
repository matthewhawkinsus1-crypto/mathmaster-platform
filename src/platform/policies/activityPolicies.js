import { getStoredAssignmentTypeProjection } from '../contract/storedAssignmentV5.js';
// Roles, policies and the attempt counts they carry live in shared code so the
// Cloud Functions deadline finalizer enforces the same attempt policy.
import {
  ACTIVITY_ROLES,
  isActivityRole,
  normalizeActivityRole,
  getEffectiveActivityPolicy,
} from '../../../functions/shared/activityPolicies.mjs';

export {
  ACTIVITY_ROLES,
  ACTIVITY_POLICIES,
  isActivityRole,
  normalizeActivityRole,
  getEffectiveActivityPolicy,
  toEnforcedActivityPolicy,
} from '../../../functions/shared/activityPolicies.mjs';

export const resolveQuestionActivityRole = ({ question = {}, assignment = {}, isDOL = false } = {}) => {
  const explicit = question?.activityRole ?? question?.role;
  if (isActivityRole(explicit)) return normalizeActivityRole(explicit);
  if (isDOL || question?.isDOL === true) return ACTIVITY_ROLES.DOL;
  const assignmentType = getStoredAssignmentTypeProjection(assignment);
  if (assignmentType === 'notesClasswork') return ACTIVITY_ROLES.CLASSWORK;
  if (assignmentType === 'quiz') return ACTIVITY_ROLES.QUIZ;
  if (assignmentType === 'test') return ACTIVITY_ROLES.TEST;
  if (assignmentType === 'warmup') return ACTIVITY_ROLES.WARMUP;
  return ACTIVITY_ROLES.PRACTICE;
};

export const getQuestionActivityPolicy = (options = {}) => getEffectiveActivityPolicy(resolveQuestionActivityRole(options));
