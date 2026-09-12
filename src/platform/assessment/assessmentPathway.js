import { normalizeQuestionRecord, getQuestionCredit } from '../../attemptPolicy.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';
import { weightedQuestionTotals } from '../grading/questionWeights.js';

export const ASSESSMENT_PATHWAY_MODE = 'testCycle';

export const ASSESSMENT_STAGE = Object.freeze({
  REVIEW: 'review',
  TEST: 'test',
  AWAITING_FEEDBACK: 'awaitingFeedback',
  PASSED: 'passed',
  RETEST_LOCKED: 'retestLocked',
  RETEST: 'retest',
  COMPLETE: 'complete',
});

const clean = (value) => String(value ?? '').trim();
const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const clampScore = (value, fallback = 70) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : fallback;
};

export const isAssessmentPathwayAssignment = (assignment = {}) => (
  clean(assignment?.assessmentPolicy?.mode) === ASSESSMENT_PATHWAY_MODE
);

export const normalizeAssessmentPolicy = (value = null) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const mode = clean(value.mode);
  if (mode !== ASSESSMENT_PATHWAY_MODE) return null;
  return {
    ...value,
    mode: ASSESSMENT_PATHWAY_MODE,
    passingScore: clampScore(value.passingScore, 70),
    review: {
      required: value?.review?.required !== false,
      ...(value.review || {}),
    },
    test: {
      ...(value.test || {}),
      feedback: 'teacherRelease',
    },
    retest: {
      strategy: clean(value?.retest?.strategy) || 'shortForm',
      scorePolicy: clean(value?.retest?.scorePolicy) || 'replaceIfHigher',
      ...(value.retest || {}),
    },
  };
};

export const assessmentRoleIndices = (assignment = {}, role = '') => {
  const normalizedRole = clean(role).toLowerCase();
  return projectCurrentAssignmentContent(assignment).entries
    .filter((entry) => entry.logicalRole === normalizedRole)
    .map((entry) => entry.storageIndex);
};

const isTerminalRecord = (record) => ['correct', 'expired'].includes(normalizeQuestionRecord(record).status);

const roleProgress = ({ assignment, tracker = {}, role }) => {
  const indices = assessmentRoleIndices(assignment, role);
  const questions = getStoredAssignmentQuestions(assignment);
  const attempted = indices.filter((index) => normalizeQuestionRecord(tracker?.[index]).status !== 'unattempted').length;
  const done = indices.filter((index) => isTerminalRecord(tracker?.[index])).length;
  const weighted = weightedQuestionTotals({
    tracker,
    questions,
    indices,
    creditForRecord: (record) => getQuestionCredit(normalizeQuestionRecord(record)),
    attemptedForRecord: (record) => normalizeQuestionRecord(record).status !== 'unattempted',
  });
  return {
    role,
    indices,
    total: indices.length,
    attempted,
    done,
    terminal: indices.length > 0 && done === indices.length,
    score: indices.length ? (weighted.score ?? 0) : null,
    creditOnAttempted: weighted.creditOnAttempted ?? null,
  };
};

const feedbackReleased = (assignment = {}) => (
  assignment?.feedbackReleased === true || Boolean(assignment?.feedbackReleasedAt)
);

export const assessmentRetestFeedbackWasReleased = (assignment = {}) => (
  assignment?.assessmentRetestFeedbackReleased === true
  || Boolean(assignment?.assessmentRetestFeedbackReleasedAt)
);

const stageWindowOpen = (value, now) => {
  const opensAt = parseDate(value);
  return !opensAt || now >= opensAt;
};

export const getAssessmentPathwayState = ({
  assignment = {},
  tracker = {},
  nowValue = Date.now(),
} = {}) => {
  if (!isAssessmentPathwayAssignment(assignment)) return null;

  const policy = normalizeAssessmentPolicy(assignment.assessmentPolicy) || {
    mode: ASSESSMENT_PATHWAY_MODE,
    passingScore: 70,
    review: { required: true },
    test: { feedback: 'teacherRelease' },
    retest: { strategy: 'shortForm', scorePolicy: 'replaceIfHigher' },
  };
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const review = roleProgress({ assignment, tracker, role: 'review' });
  const test = roleProgress({ assignment, tracker, role: 'test' });
  const retest = roleProgress({ assignment, tracker, role: 'retest' });
  const passingScore = clampScore(policy.passingScore, 70);
  const testOpenBySchedule = stageWindowOpen(policy?.test?.opensAt, now);
  const reviewGateMet = !policy?.review?.required || review.total === 0 || review.terminal;
  const testReady = testOpenBySchedule && reviewGateMet;

  if (!testReady) {
    return {
      stage: ASSESSMENT_STAGE.REVIEW,
      visibleRole: 'review',
      canEnter: review.total > 0,
      actionLabel: review.attempted > 0 ? 'Continue Review' : 'Start Review',
      statusLabel: 'Review',
      detail: policy?.test?.opensAt && !testOpenBySchedule
        ? 'Complete the review. The test opens at the scheduled time.'
        : 'Complete the review before the test opens.',
      passingScore,
      review,
      test,
      retest,
      score: null,
      complete: false,
    };
  }

  if (!test.terminal) {
    return {
      stage: ASSESSMENT_STAGE.TEST,
      visibleRole: 'test',
      canEnter: test.total > 0,
      actionLabel: test.attempted > 0 ? 'Continue Test' : 'Start Test',
      statusLabel: 'Test',
      detail: 'Test mode: one attempt per question. Hints, replacement questions, and remediation are disabled.',
      passingScore,
      review,
      test,
      retest,
      score: test.score,
      complete: false,
    };
  }

  const released = feedbackReleased(assignment);
  if (!released) {
    return {
      stage: ASSESSMENT_STAGE.AWAITING_FEEDBACK,
      visibleRole: 'test',
      canEnter: false,
      actionLabel: 'Submitted',
      statusLabel: 'Test submitted',
      detail: 'Your test is submitted. Your score and next step will appear after your teacher releases results.',
      passingScore,
      review,
      test,
      retest,
      score: test.score,
      complete: false,
      feedbackHeld: true,
    };
  }

  if ((test.score ?? 0) >= passingScore) {
    return {
      stage: ASSESSMENT_STAGE.PASSED,
      visibleRole: 'test',
      canEnter: true,
      actionLabel: 'Review Test',
      statusLabel: 'Passed',
      detail: `Test complete · ${test.score ?? 0}%`,
      passingScore,
      review,
      test,
      retest,
      score: test.score,
      complete: true,
      passed: true,
    };
  }

  const retestOpen = stageWindowOpen(policy?.retest?.opensAt, now);
  if (!retestOpen) {
    return {
      stage: ASSESSMENT_STAGE.RETEST_LOCKED,
      visibleRole: 'test',
      canEnter: false,
      actionLabel: 'Retest scheduled',
      statusLabel: 'Retest pending',
      detail: `Your Test score is ${test.score ?? 0}%. You qualify for a Retest, which will appear here when it opens.`,
      passingScore,
      review,
      test,
      retest,
      score: test.score,
      complete: false,
      passed: false,
    };
  }

  if (retest.total > 0 && !retest.terminal) {
    return {
      stage: ASSESSMENT_STAGE.RETEST,
      visibleRole: 'retest',
      canEnter: true,
      actionLabel: retest.attempted > 0 ? 'Continue Retest' : 'Start Retest',
      statusLabel: 'Retest',
      detail: `Your Test score is ${test.score ?? 0}% (passing: ${passingScore}%). Retest mode uses a shorter fresh assessment, and your original Test remains locked while you retest.`,
      passingScore,
      review,
      test,
      retest,
      score: test.score,
      complete: false,
      passed: false,
    };
  }

  const finalScore = policy?.retest?.scorePolicy === 'replace'
    ? (retest.score ?? test.score ?? 0)
    : Math.max(test.score ?? 0, retest.score ?? 0);
  const retestFeedbackReleased = assessmentRetestFeedbackWasReleased(assignment);
  return {
    stage: ASSESSMENT_STAGE.COMPLETE,
    visibleRole: retest.total > 0 ? 'retest' : 'test',
    canEnter: retest.total > 0 ? retestFeedbackReleased : true,
    actionLabel: retest.total > 0
      ? (retestFeedbackReleased ? 'Review Retest' : 'Submitted')
      : 'Review Test',
    statusLabel: retest.total > 0 && !retestFeedbackReleased
      ? 'Retest submitted'
      : finalScore >= passingScore ? 'Retest passed' : 'Retest complete',
    detail: retest.total > 0 && !retestFeedbackReleased
      ? 'Your retest is submitted. Your final result will appear after your teacher releases retest feedback.'
      : `Assessment complete · recorded score ${finalScore}%`,
    passingScore,
    review,
    test,
    retest,
    score: finalScore,
    complete: true,
    passed: finalScore >= passingScore,
    feedbackHeld: retest.total > 0 && !retestFeedbackReleased,
  };
};

export const getAssessmentVisibleIndices = (options = {}) => {
  const state = getAssessmentPathwayState(options);
  if (!state) return null;
  return assessmentRoleIndices(options.assignment, state.visibleRole);
};

export const getAssessmentGradeSplit = ({ assignment = {}, tracker = {} } = {}) => {
  const state = getAssessmentPathwayState({ assignment, tracker });
  if (!state) return null;
  const policy = normalizeAssessmentPolicy(assignment.assessmentPolicy);
  const useRetest = state.retest?.terminal
    && (
      policy?.retest?.scorePolicy === 'replace'
      || (state.retest.score ?? 0) > (state.test.score ?? 0)
    );
  const source = useRetest ? state.retest : state.test;
  const score = state.retest?.terminal
    ? (policy?.retest?.scorePolicy === 'replace'
      ? (state.retest.score ?? 0)
      : Math.max(state.test.score ?? 0, state.retest.score ?? 0))
    : (state.test.score ?? 0);
  const total = source?.total || 0;
  const attempted = source?.attempted || 0;
  return {
    score,
    attempted,
    total,
    unanswered: Math.max(0, total - attempted),
    creditOnAttempted: source?.creditOnAttempted ?? null,
    shape: attempted === 0 ? 'notStarted' : attempted < total ? 'incomplete' : 'complete',
    assessmentStage: state.stage,
    sourceRole: useRetest ? 'retest' : 'test',
  };
};
