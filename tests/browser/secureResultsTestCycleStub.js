/*
 * The Test Cycle callables, stubbed for the results harness (secureResults.mjs).
 *
 * Each card is the shape `getStudentTestCycle` returns — stage, action,
 * phases from the real shared stage module, the grade breakdown from the real
 * shared record module, and the fields this package adds: `testSkills`,
 * `reviewBySkill` and `testReviewExamSessionId`. The stage comes from the
 * page's `?stage=`.
 *
 * LABELS AS A SERVER REALLY SENDS THEM. A blueprint target the teacher did not
 * name carries the label normalizeTestBlueprint gave it — the standard's code,
 * or "Target N". The current server sends those as null
 * (functions/lib/testCycle.js, node-tested on real blueprints); an older one
 * sent them as they were. Both are here, so the card is measured on codes as
 * well as nulls and must name every skill in words either way.
 *
 * Corrections: like issueTestCycleCorrectionQuestion, an open question is
 * handed back as the SAME instance until an answer closes it.
 */
import { buildTestCyclePhaseStatus, testCycleGradeBreakdown } from '../../src/platform/assessment/testCycle.js';

const POLICY = { mode: 'testCycle' };
const POLICY_FIELDS = {
  passingScore: 70, maxRecordedGrade: 70, gradeReplacement: 'replaceIfHigherCapped',
  summary: 'If you retest, your retest can raise your grade up to 70%. It can never lower it.', external: false,
};

// In blueprint order — the order questions are issued in.
const TEST_SKILLS = [
  { alignmentKey: 'texas:A.5A', label: null, questionCount: 4 },
  { alignmentKey: 'texas:A.3B', label: 'Rate of change from tables and graphs', questionCount: 3 },
  // An older server: the normalizer's "Target N" and the code itself.
  { alignmentKey: 'texas:A.2A', label: 'Target 3', questionCount: 2 },
  { alignmentKey: 'texas:A.2C', label: 'texas:A.2C', questionCount: 1 },
];

const REVIEW_BY_SKILL = [
  { alignmentKey: 'texas:A.5A', label: 'texas:A.5A', attempted: 3, correct: 3, total: 3 },
  { alignmentKey: 'texas:A.3B', label: 'Rate of change from tables and graphs', attempted: 3, correct: 1, total: 4 },
  { alignmentKey: 'texas:A.2A', label: null, attempted: 0, correct: 0, total: 2 },
];

const CORRECTIONS = {
  planId: 'harness-corrections', secure: false, hintsAllowed: true, gradeImpact: 'none', complete: false,
  targets: [
    // The plan copies the blueprint label: the code, for a target nobody named.
    { correctionId: 'correction-eq', order: 1, label: 'texas:A.5A', alignmentKey: 'texas:A.5A', diagnosis: 'standard', missed: 2, requiredCorrectResponses: 2, correctResponses: 0, complete: false },
    { correctionId: 'correction-slope', order: 2, label: 'Rate of change from tables and graphs', alignmentKey: 'texas:A.3B', diagnosis: 'standard', missed: 1, requiredCorrectResponses: 2, correctResponses: 2, complete: true },
  ],
};

const released = (examSessionId, rawScore) => ({ examSessionId, state: 'released', rawScore, releasedAt: Date.now() });
const record = {
  review: { review: { complete: false }, test: { examSessionId: 'course-test', state: 'assigned' } },
  test: { review: { complete: true }, test: { examSessionId: 'course-test', state: 'assigned' } },
  corrections: { review: { complete: true }, test: released('course-test', 52), corrections: { required: true, planId: 'harness-corrections', total: 2, completedTargets: 1 } },
  retest: { review: { complete: true }, test: released('course-test', 52), corrections: { required: true, complete: true, planId: 'harness-corrections', total: 2, completedTargets: 2 }, retest: { examSessionId: 'course-retest', state: 'assigned' } },
  passed: { review: { complete: true }, test: released('course-test', 84) },
  complete: { review: { complete: true }, test: released('course-test', 52), corrections: { required: true, complete: true, planId: 'harness-corrections', total: 2, completedTargets: 2 }, retest: released('course-retest', 88) },
  testInProgress: { review: { complete: true }, test: { examSessionId: 'course-test', state: 'inProgress' } },
  // A teacher opened a retest after a pass: the 70% cap cannot raise an 85.
  retestAfterPass: { review: { complete: true }, test: released('course-test', 85), teacherControls: { retestUnlocked: true }, retest: { examSessionId: 'course-retest', state: 'assigned' } },
  // Retesting closed while a Retest was already under way: still answerable.
  retestClosed: { review: { complete: true }, test: released('course-test', 52), corrections: { required: true, complete: true, planId: 'harness-corrections', total: 2, completedTargets: 2 }, teacherControls: { retestDisabled: true }, retest: { examSessionId: 'course-retest', state: 'inProgress' } },
};

const STAGES = {
  review: { stage: 'review', secure: false, hintsAllowed: true, canEnter: true, actionLabel: 'Continue Review', statusLabel: 'Review', detail: 'Finish the review to unlock your test. Hints and tools are available here.', examSessionId: null, reviewExamSessionId: null, testReviewExamSessionId: null, reviewProgress: { attempted: 6, total: 9, complete: false } },
  test: { stage: 'test', secure: true, hintsAllowed: false, canEnter: true, actionLabel: 'Start Test', statusLabel: 'Test', detail: 'Secure test: no hints or help. You can skip, flag and go back to any question until you submit, and your score is held until your teacher releases it.', examSessionId: 'course-test', reviewExamSessionId: null, testReviewExamSessionId: null, reviewProgress: { attempted: 9, total: 9, complete: true } },
  corrections: { stage: 'corrections', secure: false, hintsAllowed: true, canEnter: true, actionLabel: 'Continue Corrections', statusLabel: 'Corrections', detail: 'Your test was 52% (passing is 70%). Finish your corrections to unlock a retest. Corrections do not change your recorded grade.', examSessionId: null, reviewExamSessionId: 'course-test', testReviewExamSessionId: 'course-test', corrections: CORRECTIONS, reviewProgress: { attempted: 9, total: 9, complete: true } },
  retest: { stage: 'retest', secure: true, hintsAllowed: false, canEnter: true, actionLabel: 'Start Retest', statusLabel: 'Retest', detail: 'Secure retest: no hints. You can skip, flag and go back to any question until you submit. The highest grade retesting can record is 70%.', examSessionId: 'course-retest', reviewExamSessionId: 'course-test', testReviewExamSessionId: 'course-test', reviewProgress: { attempted: 9, total: 9, complete: true } },
  passed: { stage: 'passed', secure: false, hintsAllowed: false, canEnter: true, actionLabel: 'Review Test', statusLabel: 'Passed', detail: 'Test complete · recorded grade 84%.', examSessionId: null, reviewExamSessionId: 'course-test', testReviewExamSessionId: 'course-test', reviewProgress: { attempted: 9, total: 9, complete: true } },
  complete: { stage: 'complete', secure: false, hintsAllowed: false, canEnter: true, actionLabel: 'Review Retest', statusLabel: 'Retest complete', detail: 'Retest raw 88% recorded at the 70% retest cap.', examSessionId: null, reviewExamSessionId: 'course-retest', testReviewExamSessionId: 'course-test', reviewProgress: { attempted: 9, total: 9, complete: true } },
  testInProgress: { stage: 'test', secure: true, hintsAllowed: false, canEnter: true, actionLabel: 'Resume Test', statusLabel: 'Test', detail: 'Secure test: no hints or help. You can skip, flag and go back to any question until you submit, and your score is held until your teacher releases it.', examSessionId: 'course-test', reviewExamSessionId: null, testReviewExamSessionId: null, reviewProgress: { attempted: 9, total: 9, complete: true } },
  retestAfterPass: { stage: 'retest', secure: true, hintsAllowed: false, canEnter: true, actionLabel: 'Start Retest', statusLabel: 'Retest', detail: 'Secure retest: no hints. The highest grade retesting can record is 70%.', examSessionId: 'course-retest', reviewExamSessionId: 'course-test', testReviewExamSessionId: null, reviewProgress: { attempted: 9, total: 9, complete: true } },
  // getStudentTestCycle sends no testReviewExamSessionId while the Retest is open.
  retestClosed: { stage: 'retestClosed', secure: false, hintsAllowed: false, canEnter: false, actionLabel: 'Retest closed', statusLabel: 'Retest closed', detail: 'Your teacher has closed retesting for this assessment. Recorded grade 52%.', examSessionId: null, reviewExamSessionId: 'course-test', testReviewExamSessionId: null, reviewProgress: { attempted: 9, total: 9, complete: true } },
};

const requestedStage = () => {
  // The harness can move the cycle on while a screen is open — a teacher
  // opening the Retest under an open Test review.
  if (window.__stageOverride && STAGES[window.__stageOverride]) return window.__stageOverride;
  const stage = new URLSearchParams(window.location.search).get('stage') || 'review';
  return STAGES[stage] ? stage : 'review';
};

export const getStudentTestCycle = async ({ assignmentId }) => {
  const stage = requestedStage();
  const card = STAGES[stage];
  const cycleRecord = { assignmentId, studentId: 'harness-student', ...record[stage] };
  return {
    success: true,
    assignmentId,
    title: 'Unit 3 Test Cycle — Linear Functions',
    ...card,
    phases: buildTestCyclePhaseStatus({ state: { ...card, policy: { ...POLICY, passingScore: 70 } }, record: cycleRecord }),
    grade: testCycleGradeBreakdown(cycleRecord, POLICY),
    corrections: card.corrections || null,
    // Whether the Test review would hold its answers: ?answersHeld=1.
    testAnswersHeld: card.testReviewExamSessionId ? new URLSearchParams(window.location.search).get('answersHeld') === '1' : null,
    availability: { open: true, reason: 'open', opensAt: null },
    dueAt: null,
    policy: POLICY_FIELDS,
    delivery: { timed: true, timeLimitMinutes: 45, calculatorMode: 'questionSpecific', questionCount: 10 },
    testSkills: TEST_SKILLS,
    reviewBySkill: REVIEW_BY_SKILL,
  };
};

let issued = 0;
let openInstance = null;
export const issueTestCycleCorrectionQuestion = async () => {
  window.__correctionIssues = (window.__correctionIssues || 0) + 1;
  if (!openInstance) {
    issued += 1;
    openInstance = {
      questionInstanceId: `harness-correction-${issued}`, questionType: 'response',
      prompt: 'Solve $3x + 4 = 19$ for $x$.',
      responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number' }], choices: [],
    };
  }
  return { success: true, secure: false, hintsAllowed: true, attemptsAllowed: 3, attemptsUsed: 0, questionInstance: openInstance };
};
export const submitTestCycleCorrectionResponse = async () => {
  openInstance = null;
  return { success: true, isCorrect: true, attemptsUsed: 1, progress: { total: 2, complete: 1 }, correctionsComplete: false };
};
export const assignTestCycleSessions = async () => ({ success: true, createdSessions: 0, reusedSessions: 0, students: [] });
export const preflightTestCycleAssignment = async () => ({ success: true, preflight: { errors: [], warnings: [], checks: [], blocked: false } });
export const preflightTestCycleCandidate = async () => ({ success: true, testCycle: false, preflight: null });
export const listTeacherTestCycleRecords = async () => ({ success: true, rows: [] });
export const getTeacherTestCyclePlans = async () => ({ success: true, record: null, corrections: null, retest: null });
export const teacherTestCycleAction = async () => ({ success: true });
export const releaseTestCycleResults = async () => ({ success: true });
export const releaseTestCycleAnswers = async () => ({ success: true });
export const updateTestCyclePolicy = async () => ({ success: true });
export const previewTestCycleSecureItems = async () => ({ success: true, items: [] });
export const gradeTestCyclePreviewItem = async () => ({ success: true });
export const attachTestCycleContract = async () => ({ success: true });
