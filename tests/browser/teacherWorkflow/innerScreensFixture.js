/*
 * THE SCREENS INSIDE A SCREEN (NV14) — synthetic. Opt-in: `&innerScreens=1`,
 * usually with `&recovery=p0` (Theo's DOL Recovery, recoveryFixture.js).
 * Driven by innerScreenBackJourneys.mjs.
 *
 * Algebra I — Period 1 gets a Test Cycle, "Unit 4 Test — Linear Functions",
 * whose Test was released below passing: Corrections are open, and "Review my
 * Test" reaches the released Test. Its card is the shape getStudentTestCycle
 * sends, built from the real shared stage, phase and grade modules for the
 * record below (fakeTestCycleService.js answers with it). Theo also has two
 * College & Career practice tests (fakeSecureExamService.js): an ACT he has
 * not started, then a Digital SAT under way.
 *
 * The harness runs the app in its MOCK_LOCAL sandbox, whose Test Cycle card is
 * always a sandbox Review and whose practice tests live only in page memory.
 * These stand in for exactly this scenario; everything else is the real
 * service.
 *
 * All invented. Nothing here reaches a Firebase project.
 */
import {
  buildTestCyclePhaseStatus,
  normalizeTestCyclePolicy,
  resolveTestCycleStage,
  testCycleGradeBreakdown,
} from '../../../src/platform/assessment/testCycle.js';

export const INNER_SCREENS_CLASS_ID = 'c-alg1-p1';
export const INNER_SCREENS_TEST_CYCLE_ID = 'a-unit4-test-cycle';
export const INNER_SCREENS_TEST_CYCLE_TITLE = 'Unit 4 Test — Linear Functions';
export const INNER_SCREENS_TEST_SESSION_ID = 'nv14-unit4-test';
export const INNER_SCREENS_ACT_SESSION_ID = 'nv14-act-practice';
export const INNER_SCREENS_SAT_SESSION_ID = 'nv14-sat-practice';
export const INNER_SCREENS_SAT_TITLE = 'Digital SAT Math — practice test';
export const INNER_SCREENS_REVIEW_TITLE = 'Unit 4 Test — Linear Functions (your Test)';

const DAY = 86_400_000;
const endOfDay = (ms) => new Date(new Date(ms).setHours(23, 59, 0, 0)).toISOString();

/** The scenario's documents (fixture.js, `&innerScreens=1`). */
export const addInnerScreensScenario = ({ fixture, now }) => {
  fixture[`assignments/${INNER_SCREENS_TEST_CYCLE_ID}`] = {
    title: INNER_SCREENS_TEST_CYCLE_TITLE,
    schemaVersion: 5,
    assignmentType: 'notesClasswork',
    folder: 'Algebra I',
    contentVersion: 1,
    assignedClassIds: [INNER_SCREENS_CLASS_ID],
    assignedClassPeriods: ['Period 1'],
    releaseAt: new Date(now - 10 * DAY).toISOString(),
    // Due today, so Assignments lists it under Active.
    dueAt: endOfDay(now),
    lateDueAt: endOfDay(now + 5 * DAY),
    assessmentPolicy: { mode: 'testCycle', passingScore: 70, review: { required: true } },
    sections: [{
      id: 'review',
      role: 'review',
      title: 'Review',
      questions: [{ questionId: `${INNER_SCREENS_TEST_CYCLE_ID}-r1`, activityRole: 'review', type: 'literal', prompt: 'Solve 2x = 8 for x.', solveFor: 'x', acceptedAnswers: ['4'] }],
    }],
    gradingPeriod: { id: 'mp2', label: '2nd Marking Period', order: 2 },
    createdAt: new Date(now - 11 * DAY).toISOString(),
  };
};

/** Whether this harness database holds the scenario (seeded with `&innerScreens=1`). */
export const innerScreensSeeded = (store) => Boolean(store?.get?.(`assignments/${INNER_SCREENS_TEST_CYCLE_ID}`));

const POLICY = normalizeTestCyclePolicy({ mode: 'testCycle', passingScore: 70 });
const RECORD = {
  assignmentId: INNER_SCREENS_TEST_CYCLE_ID,
  review: { complete: true },
  test: { examSessionId: INNER_SCREENS_TEST_SESSION_ID, state: 'released', rawScore: 52, releasedAt: 1 },
  corrections: { required: true, planId: 'nv14-corrections', total: 2, completedTargets: 0 },
};
const CORRECTIONS = {
  planId: 'nv14-corrections', secure: false, hintsAllowed: true, gradeImpact: 'none', complete: false,
  targets: [
    { correctionId: 'nv14-solving', order: 1, label: 'Solving linear equations', alignmentKey: 'texas:A.5A', diagnosis: 'standard', missed: 2, requiredCorrectResponses: 2, correctResponses: 1, complete: false },
    { correctionId: 'nv14-rate', order: 2, label: 'Rate of change from tables', alignmentKey: 'texas:A.3B', diagnosis: 'standard', missed: 1, requiredCorrectResponses: 2, correctResponses: 0, complete: false },
  ],
};

/** The student's card for the scenario's Test Cycle, as getStudentTestCycle sends it. */
export const innerScreensCard = ({ studentId = null } = {}) => {
  const record = { ...RECORD, studentId };
  const state = resolveTestCycleStage({ policy: POLICY, record, reviewProgress: { attempted: 1, total: 1, complete: true } });
  return {
    success: true,
    assignmentId: INNER_SCREENS_TEST_CYCLE_ID,
    title: INNER_SCREENS_TEST_CYCLE_TITLE,
    stage: state.stage,
    secure: state.secure,
    hintsAllowed: state.hintsAllowed,
    canEnter: state.canEnter,
    actionLabel: state.actionLabel,
    statusLabel: state.statusLabel,
    detail: state.detail,
    phases: buildTestCyclePhaseStatus({ state, record }),
    examSessionId: null,
    reviewExamSessionId: INNER_SCREENS_TEST_SESSION_ID,
    testReviewExamSessionId: INNER_SCREENS_TEST_SESSION_ID,
    testAnswersHeld: false,
    grade: testCycleGradeBreakdown(record, POLICY),
    corrections: CORRECTIONS,
    availability: { open: true, reason: 'open', opensAt: null },
    schedule: null,
    dueAt: null,
    reviewProgress: { attempted: 1, total: 1, complete: true },
    policy: { passingScore: 70, maxRecordedGrade: 70, summary: 'If you retest, your retest can raise your grade up to 70%. It can never lower it.', external: false },
    delivery: { timed: true, timeLimitMinutes: 45, calculatorMode: 'questionSpecific', questionCount: 10 },
    testSkills: [],
    reviewBySkill: [],
  };
};

/** A correction question: the same instance until an answer closes it. */
export const innerScreensCorrectionQuestion = ({ correctionId }) => ({
  success: true,
  secure: false,
  hintsAllowed: true,
  attemptsAllowed: 3,
  attemptsUsed: 0,
  questionInstance: {
    questionInstanceId: `${correctionId}-q1`,
    questionType: 'response',
    prompt: 'Solve $3x + 4 = 19$ for $x$.',
    responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number' }],
    choices: [],
  },
});

/** The released Test, as getStudentSecureExamReview sends it (secureExam.publicReview's shape). */
export const innerScreensTestReview = () => ({
  review: {
    session: {
      examSessionId: INNER_SCREENS_TEST_SESSION_ID, examType: 'courseTest', title: INNER_SCREENS_REVIEW_TITLE,
      status: 'submitted', feedbackReleased: true, requiredQuestions: 1, releasePolicy: 'teacher', timed: false, timeLimitSeconds: null,
    },
    answeredQuestions: 1,
    plannedQuestions: 1,
    correctQuestions: 0,
    scorePercent: 0,
    earnedPoints: 0,
    possiblePoints: 1,
    weighted: false,
    scoreBasis: 'plannedWeighted',
    items: [{
      questionInstanceId: 'nv14-ct-1', position: 0, alignmentKeys: ['texas:A.5A'], targetId: 't-eq', planWeight: 1, assessmentDomainId: null,
      unanswered: false, pathToolId: null, questionType: 'response', grading: { score: 0, isCorrect: false },
      responsePayload: { responses: { answer: '5' } },
      questionSnapshot: { prompt: 'Solve $4x - 7 = 21$ for $x$.', responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }], choices: [] },
      solution: {
        answers: [{ fieldId: 'answer', label: 'Answer', display: '7' }],
        review: { headline: 'Undo the operations in reverse order.', reasoning: ['Add $7$ to both sides: $4x = 28$.', 'Divide both sides by $4$: $x = 7$.'], commonError: null, connection: null, answerSummary: '$x = 7$' },
      },
    }],
  },
});

const practiceTest = ({ examSessionId, examType, title, status, answered = 0 }) => ({
  examSessionId, examType, title, status,
  requiredQuestions: 10, violationCount: 0, startedAt: status === 'not_started' ? null : Date.now() - 20 * 60_000,
  createdAt: Date.now() - DAY, timeLimitSeconds: 1800, addedTimeSeconds: 0, calculatorMode: 'full', accommodationsConfirmed: false,
  feedbackReleased: false, releasePolicy: 'automatic', summary: { completedQuestions: answered },
  expiresAt: status === 'not_started' ? null : Date.now() + 10 * 60_000, clockPaused: false, timed: true,
  hasOpenQuestion: status !== 'not_started', answeredQuestions: answered, integrityLockThreshold: 3,
  navigation: { version: 1, total: 10, issued: answered, cursor: answered, items: [], modules: null, upgradedFromLinear: false },
});

/** Theo's practice tests, as listStudentSecureExamSessions sends them: the one under way listed second. */
export const innerScreensPracticeTests = () => ({
  sessions: [
    practiceTest({ examSessionId: INNER_SCREENS_ACT_SESSION_ID, examType: 'act', title: 'ACT Math — practice test', status: 'not_started' }),
    practiceTest({ examSessionId: INNER_SCREENS_SAT_SESSION_ID, examType: 'digitalSAT', title: INNER_SCREENS_SAT_TITLE, status: 'in_progress', answered: 4 }),
  ],
});
