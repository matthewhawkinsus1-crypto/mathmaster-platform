import {
  applyAssessmentAvailability,
  buildTestCyclePhaseStatus,
  describeTestCycleGradePolicy,
  normalizeTestBlueprint,
  normalizeTestCyclePolicy,
  resolveAssessmentAvailability,
  resolveTestCycleStage,
  testCycleGradeBreakdown,
} from '../assessment/testCycle.js';
import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';

/*
 * EVERY STAGE A STUDENT CAN SEE, FOR A TEACHER, WITHOUT A STUDENT.
 *
 * "View as Student" on a Test Cycle used to play the stored Review as an
 * ordinary lesson — the one stage that is ordinary content — so a teacher had
 * no way to see the card their students meet, what a locked Test says, what
 * Corrections or a capped Retest look like, or the secure Test itself.
 *
 * Each scenario here is a synthetic record run through the SAME shared stage
 * machine, availability overlay, phase strip and grade breakdown the server
 * uses for a real student, with this assignment's real policy and blueprint.
 * The result is a card payload in exactly the server's shape. Nothing is read
 * from or written to any student's data: there is no student.
 */

export const TEST_CYCLE_PREVIEW_SCENARIOS = Object.freeze([
  { id: 'review', label: 'Review (Test locked)' },
  { id: 'testReady', label: 'Test unlocked' },
  { id: 'testInProgress', label: 'Test in progress' },
  { id: 'awaitingRelease', label: 'Test submitted' },
  { id: 'passed', label: 'Passed' },
  { id: 'corrections', label: 'Corrections' },
  { id: 'retest', label: 'Retest unlocked' },
  { id: 'complete', label: 'Retest graded' },
  { id: 'scheduled', label: 'Not open yet' },
  { id: 'paused', label: 'Paused' },
]);

const reviewQuestionCount = (assignment) => getStoredAssignmentQuestions(assignment)
  .filter((question) => question?.teacherExcluded !== true && String(question?.activityRole || '').toLowerCase() === 'review')
  .length;

export const testCycleDeliveryFacts = (blueprint) => {
  const normalized = normalizeTestBlueprint(blueprint);
  const seconds = Number(normalized.timeLimitSeconds);
  const timed = Number.isFinite(seconds) && seconds > 0;
  return {
    timed,
    timeLimitMinutes: timed ? Math.round(seconds / 60) : null,
    calculatorMode: normalized.calculatorMode || 'questionSpecific',
    questionCount: normalized.targets.reduce((sum, target) => sum + Math.max(0, Number(target.questionCount) || 0), 0) || null,
  };
};

export const buildTestCyclePreviewCard = ({ assignment = {}, scenario = 'review', now = Date.now() } = {}) => {
  const policy = normalizeTestCyclePolicy(assignment.assessmentPolicy || { mode: 'testCycle' });
  const described = describeTestCycleGradePolicy(policy);
  const failing = described.example.originalTestGrade < policy.passingScore
    ? described.example.originalTestGrade
    : Math.max(0, policy.passingScore - 16);
  const passing = Math.min(100, policy.passingScore + 15);
  const retestRaw = described.example.rawRetestGrade;
  const reviewTotal = reviewQuestionCount(assignment);
  const reviewDone = { attempted: reviewTotal, total: reviewTotal, complete: reviewTotal > 0 };
  const released = (rawScore) => ({ examSessionId: 'preview-test', state: 'released', rawScore, releasedAt: now });

  const scenarios = {
    review: { record: {}, reviewProgress: { attempted: Math.min(1, reviewTotal), total: reviewTotal, complete: false } },
    testReady: { record: { test: { examSessionId: 'preview-test', state: 'assigned' } }, reviewProgress: reviewDone },
    testInProgress: { record: { review: { complete: true }, test: { examSessionId: 'preview-test', state: 'inProgress', answeredQuestions: 3, totalQuestions: 10 } }, reviewProgress: reviewDone },
    awaitingRelease: { record: { review: { complete: true }, test: { examSessionId: 'preview-test', state: 'submitted' } }, reviewProgress: reviewDone },
    passed: { record: { review: { complete: true }, test: released(passing) }, reviewProgress: reviewDone },
    corrections: {
      record: { review: { complete: true }, test: released(failing), corrections: { required: true, planId: 'preview-plan', total: 3, completedTargets: 1 } },
      reviewProgress: reviewDone,
    },
    retest: {
      record: { review: { complete: true }, test: released(failing), corrections: { required: true, planId: 'preview-plan', total: 3, completedTargets: 3, complete: true }, retest: { examSessionId: 'preview-retest', state: 'assigned' } },
      reviewProgress: reviewDone,
    },
    complete: {
      record: {
        review: { complete: true },
        test: released(failing),
        corrections: { required: true, planId: 'preview-plan', total: 3, completedTargets: 3, complete: true },
        retest: { examSessionId: 'preview-retest', state: 'released', rawScore: retestRaw, releasedAt: now },
      },
      reviewProgress: reviewDone,
    },
    scheduled: { record: {}, reviewProgress: { attempted: 0, total: reviewTotal, complete: false }, assignmentOverride: { releaseAt: new Date(now + 24 * 60 * 60 * 1000).toISOString() } },
    paused: { record: { test: { examSessionId: 'preview-test', state: 'assigned' } }, reviewProgress: reviewDone, assignmentOverride: { unpublished: true } },
  };
  const chosen = scenarios[scenario] || scenarios.review;
  const effectiveAssignment = { ...assignment, ...(chosen.assignmentOverride || {}) };
  if (!chosen.assignmentOverride) {
    // The preview shows the stage, not today's real availability: a teacher
    // previewing an archived or paused cycle still wants to see its stages.
    delete effectiveAssignment.archived;
    delete effectiveAssignment.unpublished;
    delete effectiveAssignment.releaseAt;
    delete effectiveAssignment.releaseDate;
  }
  const record = { assignmentId: assignment.id || 'preview', studentId: 'preview-student', ...chosen.record };
  const availability = resolveAssessmentAvailability({ assignment: effectiveAssignment, now });
  const state = applyAssessmentAvailability(
    resolveTestCycleStage({ policy, record, reviewProgress: chosen.reviewProgress }),
    availability,
  );
  const blueprint = assignment.testBlueprint || null;
  const corrections = state.stage === 'corrections'
    ? {
      planId: 'preview-plan', secure: false, hintsAllowed: true, gradeImpact: 'none', complete: false,
      targets: [
        { correctionId: 'preview-1', order: 1, label: 'A skill this student missed', diagnosis: 'standard', diagnosisDetail: 'Built from each student\'s own missed Test questions.', missed: 2, requiredCorrectResponses: 2, correctResponses: 2, complete: true },
        { correctionId: 'preview-2', order: 2, label: 'Another missed skill', diagnosis: 'standard', diagnosisDetail: 'Practised on parallel questions, never the Test item itself.', missed: 3, requiredCorrectResponses: 2, correctResponses: 0, complete: false },
      ],
    }
    : null;
  return {
    success: true,
    preview: true,
    assignmentId: assignment.id || 'preview',
    title: normalizeTestBlueprint(blueprint).title || assignment.title || 'Test Cycle',
    stage: state.stage,
    secure: state.secure,
    hintsAllowed: state.hintsAllowed,
    canEnter: state.canEnter,
    actionLabel: state.actionLabel,
    statusLabel: state.statusLabel,
    detail: state.detail,
    phases: buildTestCyclePhaseStatus({ state, record }),
    examSessionId: state.secure ? 'preview' : null,
    reviewExamSessionId: null,
    grade: testCycleGradeBreakdown(record, policy),
    corrections,
    availability: { open: availability.open, reason: availability.reason, opensAt: availability.opensAt },
    dueAt: assignment.dueAt || assignment.dueDate || null,
    reviewProgress: chosen.reviewProgress,
    policy: {
      passingScore: policy.passingScore,
      maxRecordedGrade: policy.retest.maxRecordedGrade,
      gradeReplacement: policy.retest.gradeReplacement,
      summary: described.studentSummary,
    },
    delivery: testCycleDeliveryFacts(blueprint),
  };
};
