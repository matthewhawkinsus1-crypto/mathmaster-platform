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

/*
 * An external-original cycle (the district DOL) has Review and one secure
 * session, which is the retest of a score entered from another system. Its
 * preview offers only the stages that exist there, in its words.
 */
const EXTERNAL_SCENARIO_LABEL = Object.freeze({
  review: 'Review (Retest locked)',
  testReady: 'Retest unlocked',
  testInProgress: 'Retest in progress',
  awaitingRelease: 'Retest submitted',
  complete: 'Retest graded',
});

export const previewScenariosFor = (assignment = {}) => {
  const policy = normalizeTestCyclePolicy(assignment?.assessmentPolicy || { mode: 'testCycle' });
  if (!policy?.externalAssessment) return TEST_CYCLE_PREVIEW_SCENARIOS;
  return TEST_CYCLE_PREVIEW_SCENARIOS
    .filter((scenario) => EXTERNAL_SCENARIO_LABEL[scenario.id] || ['scheduled', 'paused'].includes(scenario.id))
    .map((scenario) => ({ ...scenario, label: EXTERNAL_SCENARIO_LABEL[scenario.id] || scenario.label }));
};

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
  const external = Boolean(policy.externalAssessment);
  // A mastery-gated Review reports its mastery against the bar, as the server does.
  const minimumMastery = policy.review.minimumMastery;
  const mastery = (value) => (minimumMastery === undefined ? {} : { mastery: value, minimumMastery });
  const reviewDone = { attempted: reviewTotal, total: reviewTotal, complete: reviewTotal > 0, ...mastery(100) };
  // The external original the teacher entered, below passing (that is what opens a retest).
  const externalOriginal = external ? { externalAssessment: { originalScore: failing, source: policy.externalAssessment.source } } : {};
  const released = (rawScore) => ({ examSessionId: 'preview-test', state: 'released', rawScore, releasedAt: now });

  const scenarios = {
    review: { record: {}, reviewProgress: { attempted: Math.min(1, reviewTotal), total: reviewTotal, complete: false, ...mastery(40) } },
    testReady: { record: { review: { complete: true }, test: { examSessionId: 'preview-test', state: 'assigned' } }, reviewProgress: reviewDone },
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
    complete: external ? { record: { review: { complete: true }, test: released(retestRaw) }, reviewProgress: reviewDone } : {
      record: {
        review: { complete: true },
        test: released(failing),
        corrections: { required: true, planId: 'preview-plan', total: 3, completedTargets: 3, complete: true },
        retest: { examSessionId: 'preview-retest', state: 'released', rawScore: retestRaw, releasedAt: now },
      },
      reviewProgress: reviewDone,
    },
    scheduled: { record: {}, reviewProgress: { attempted: 0, total: reviewTotal, complete: false, ...mastery(0) }, assignmentOverride: { releaseAt: new Date(now + 24 * 60 * 60 * 1000).toISOString() } },
    paused: { record: { review: { complete: true }, test: { examSessionId: 'preview-test', state: 'assigned' } }, reviewProgress: reviewDone, assignmentOverride: { unpublished: true } },
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
  const record = { assignmentId: assignment.id || 'preview', studentId: 'preview-student', ...externalOriginal, ...chosen.record };
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
      external,
    },
    delivery: testCycleDeliveryFacts(blueprint),
  };
};

/*
 * WHAT THE SERVER NEEDS TO PREVIEW AN UNSAVED TEST CYCLE, AND NOTHING ELSE.
 *
 * The review screen's assignment carries every Review question with its
 * answers. Previewing the secure stages needs none of that: only what makes it
 * a Test Cycle (its policy, or the purpose, gating and Review role that declare
 * one), its blueprint or secure reference, and a title. The whole document
 * would be uploaded again on every draw and every checked answer.
 */
export const testCycleCandidateContract = (assignment = {}) => {
  const source = assignment && typeof assignment === 'object' ? assignment : {};
  const meta = source.assignment && typeof source.assignment === 'object' ? source.assignment : {};
  return {
    schemaVersion: 5,
    title: meta.title || source.title || '',
    assignment: {
      title: meta.title || source.title || '',
      courseId: meta.courseId || source.courseId || null,
      gradingPurpose: meta.gradingPurpose || null,
    },
    assessmentPolicy: source.assessmentPolicy || null,
    testBlueprint: source.testBlueprint || null,
    secureTestReference: source.secureTestReference || null,
    deliveryPolicy: { sectionGating: source.deliveryPolicy?.sectionGating || null },
    sections: (Array.isArray(source.sections) ? source.sections : []).map((section) => ({ role: section?.role || null })),
  };
};
