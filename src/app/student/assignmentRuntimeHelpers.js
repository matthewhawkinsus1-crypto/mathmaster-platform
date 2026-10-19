/*
 * The assignment runtime's small pure helpers, moved out of App.jsx unchanged
 * (the App shell split, student push G). Trackers for a new or practice
 * attempt, the held-feedback rule, date formatting for the teacher's forms,
 * the Warm-Up capture a timed section records, and a DOL section's score.
 */
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { getEffectiveActivityPolicy, resolveQuestionActivityRole } from '../../platform/policies/activityPolicies.js';
import { emptyQuestionRecord, getQuestionCredit, normalizeQuestionRecord } from '../../attemptPolicy.js';
import { formatDateTime, getWarmupState } from '../../assignmentLifecycle.js';
import { normalizeQuestionWeight } from '../../platform/grading/questionWeights.js';

export const createQuestionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizeAssignmentQuestions = (questions = []) => questions.map((question) => ({
  ...question,
  questionId: question.questionId || createQuestionId(),
  teacherExcluded: question.teacherExcluded === true,
}));

export const assignmentFeedbackWasReleased = (assignment) => assignment?.feedbackReleased === true || Boolean(assignment?.feedbackReleasedAt);

export const assignmentUsesTeacherReleasePolicy = (assignment) => (
  getStoredAssignmentQuestions(assignment).some((question) => {
    const role = resolveQuestionActivityRole({ question, assignment });
    return getEffectiveActivityPolicy(role).feedback === 'teacherRelease';
  })
);

export const assignmentHasHeldTeacherFeedback = (assignment) => (
  assignmentUsesTeacherReleasePolicy(assignment) && !assignmentFeedbackWasReleased(assignment)
);

export const createEmptyAssignmentTracker = (questions = []) => {
  const initialTracker = {};
  questions.forEach((_, index) => {
    initialTracker[index] = emptyQuestionRecord();
  });
  return initialTracker;
};

export const createPracticeAssignmentTracker = (questions = [], frozenTracker = {}) => {
  const initialTracker = {};
  questions.forEach((_, index) => {
    const frozenRecord = normalizeQuestionRecord(frozenTracker[index]);
    initialTracker[index] = {
      ...emptyQuestionRecord(),
      variantIndex: frozenRecord.variantIndex,
    };
  });
  return initialTracker;
};

export const formatDueDate = (assignmentOrValue) => {
  if (assignmentOrValue && typeof assignmentOrValue === 'object') {
    return formatDateTime(assignmentOrValue.dueAt || assignmentOrValue.dueDate);
  }
  return formatDateTime(assignmentOrValue);
};

export const formatLateDueDate = (assignment) =>
  formatDateTime(assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate);

export const formatTimeStamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

export const toDateTimeLocalInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const activityTitleForRole = (role) => ({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  dol: 'DOL',
  practice: 'Practice',
  quiz: 'Quiz',
  test: 'Unit Test',
}[role] || 'Activity');

export const captureTimedSectionAccess = ({
  activityRole,
  assignment,
  schedule,
  classId,
  classPeriod,
  capturedAt,
}) => {
  if (activityRole !== 'warmup') return null;
  const state = getWarmupState({
    assignment,
    schedule,
    classId,
    classPeriod,
    nowValue: capturedAt,
  });
  return {
    role: 'warmup',
    status: state.status,
    teacherTimerScheduled: state.teacherTimerScheduled === true,
    endsAt: state.endsAt instanceof Date ? state.endsAt.toISOString() : null,
    instructionDateKey: state.instructionDateKey || null,
  };
};

export const warmupCaptureWasActive = (capture, capturedAt) => {
  if (capture?.role !== 'warmup' || capture?.status !== 'active') return false;
  const endsAt = capture?.endsAt ? new Date(capture.endsAt).getTime() : Number.NaN;
  return !Number.isFinite(endsAt) || capturedAt <= endsAt;
};

export const calculateDOLSectionScore = (assignmentTracker = {}, questionIndices = [], assignment = null) => {
  const indices = Array.isArray(questionIndices) ? questionIndices : [];
  if (!indices.length) return 0;
  const questions = getStoredAssignmentQuestions(assignment || {});
  let possibleWeight = 0;
  let earnedWeight = 0;
  indices.forEach((index) => {
    const weight = normalizeQuestionWeight(questions[index] || {});
    possibleWeight += weight;
    earnedWeight += getQuestionCredit(assignmentTracker?.[index]) * weight;
  });
  return possibleWeight > 0 ? Math.round((earnedWeight / possibleWeight) * 100) : 0;
};

// Statuses that mean something to a student who has come back after the close.
// Every other lifecycle status is internal bookkeeping.
export const DISPLAYED_CHECKPOINT_OUTCOMES = ['auto-submitted', 'incomplete-at-close', 'explicitly-submitted'];
