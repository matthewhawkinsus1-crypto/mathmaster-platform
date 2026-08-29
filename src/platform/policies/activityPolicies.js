import { getStoredAssignmentTypeProjection } from '../contract/storedAssignmentV5.js';

export const ACTIVITY_ROLES = Object.freeze({
  WARMUP: 'warmup',
  CLASSWORK: 'classwork',
  DOL: 'dol',
  PRACTICE: 'practice',
  QUIZ: 'quiz',
  TEST: 'test',
});

const makePolicy = (policy) => Object.freeze({
  ...policy,
  grading: Object.freeze({ ...policy.grading }),
  mastery: Object.freeze({ ...policy.mastery }),
});

export const ACTIVITY_POLICIES = Object.freeze({
  [ACTIVITY_ROLES.WARMUP]: makePolicy({
    role: ACTIVITY_ROLES.WARMUP,
    name: 'Warm-Up',
    attempts: 3,
    allowReplacement: true,
    feedback: 'immediate',
    hintsAllowed: true,
    remediationAllowed: true,
    adaptiveDuringAttempt: false,
    grading: { mode: 'engagement', pointsPossible: 5, syncDefault: 'weeklyCombined', compositeWeight: 0 },
    mastery: { evidenceWeight: 0.8, evidenceType: 'diagnostic' },
    calculatorDefault: 'none',
  }),
  [ACTIVITY_ROLES.CLASSWORK]: makePolicy({
    role: ACTIVITY_ROLES.CLASSWORK,
    name: 'Classwork',
    attempts: 3,
    allowReplacement: true,
    feedback: 'immediate',
    hintsAllowed: true,
    remediationAllowed: true,
    adaptiveDuringAttempt: true,
    grading: { mode: 'accuracy', pointsPossible: 100, syncDefault: 'bundleWithLesson', compositeWeight: 0.4 },
    mastery: { evidenceWeight: 0.9, evidenceType: 'instructional' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.DOL]: makePolicy({
    role: ACTIVITY_ROLES.DOL,
    name: 'Exit Ticket / DOL',
    attempts: 1,
    allowReplacement: false,
    feedback: 'afterAssignmentSubmit',
    hintsAllowed: false,
    remediationAllowed: false,
    adaptiveDuringAttempt: false,
    grading: { mode: 'accuracy', pointsPossible: 100, syncDefault: 'separateColumn', compositeWeight: 0.35 },
    mastery: { evidenceWeight: 1.25, evidenceType: 'independent' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.PRACTICE]: makePolicy({
    role: ACTIVITY_ROLES.PRACTICE,
    name: 'Independent Practice',
    attempts: 3,
    allowReplacement: true,
    feedback: 'immediate',
    hintsAllowed: true,
    remediationAllowed: true,
    adaptiveDuringAttempt: true,
    grading: { mode: 'accuracyWithRecovery', pointsPossible: 100, syncDefault: 'bundleOrLateDeadline', compositeWeight: 0.25 },
    mastery: { evidenceWeight: 1, evidenceType: 'independent' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.QUIZ]: makePolicy({
    role: ACTIVITY_ROLES.QUIZ,
    name: 'Quiz',
    attempts: 1,
    allowReplacement: false,
    feedback: 'teacherRelease',
    hintsAllowed: false,
    remediationAllowed: false,
    adaptiveDuringAttempt: false,
    grading: { mode: 'accuracy', pointsPossible: 100, syncDefault: 'separateColumn', compositeWeight: 0 },
    mastery: { evidenceWeight: 1.35, evidenceType: 'summative' },
    calculatorDefault: 'questionSpecific',
  }),
  [ACTIVITY_ROLES.TEST]: makePolicy({
    role: ACTIVITY_ROLES.TEST,
    name: 'Unit Test',
    attempts: 1,
    allowReplacement: false,
    feedback: 'teacherRelease',
    hintsAllowed: false,
    remediationAllowed: false,
    adaptiveDuringAttempt: false,
    grading: { mode: 'accuracy', pointsPossible: 100, syncDefault: 'separateColumn', compositeWeight: 0 },
    mastery: { evidenceWeight: 1.4, evidenceType: 'summative' },
    calculatorDefault: 'questionSpecific',
  }),
});

export const isActivityRole = (value) => Object.values(ACTIVITY_ROLES).includes(String(value || '').toLowerCase());

export const normalizeActivityRole = (role, fallback = ACTIVITY_ROLES.CLASSWORK) => {
  const normalized = String(role || '').trim().toLowerCase();
  return isActivityRole(normalized) ? normalized : fallback;
};

export const getEffectiveActivityPolicy = (role) => ACTIVITY_POLICIES[normalizeActivityRole(role)];

export const toEnforcedActivityPolicy = (role) => {
  const policy = getEffectiveActivityPolicy(role);
  return {
    role: policy.role,
    attemptsAllowed: policy.attempts,
    allowReplacement: policy.allowReplacement,
    feedbackMode: policy.feedback,
    hintsAllowed: policy.hintsAllowed,
    remediationAllowed: policy.remediationAllowed,
    adaptiveDuringAttempt: policy.adaptiveDuringAttempt,
    calculatorDefault: policy.calculatorDefault,
    grading: { ...policy.grading },
    mastery: { ...policy.mastery },
  };
};

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
