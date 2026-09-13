/*
 * The Test Cycle callables, stubbed for the device harness.
 *
 * The device certification asks a layout question — can a student reach the
 * control that starts their secure Test on a 390px phone — and a layout
 * question must not be answered by a screen driven by data the product would
 * never produce. So every payload here is the shape the REAL
 * `getStudentTestCycle` returns, built from the same canonical breakdown the
 * server builds, with the stage chosen from the page's query string.
 *
 * The end-to-end correctness of these payloads is certified separately, against
 * the real Cloud Functions, in tests/integration/testCycleCertification.test.mjs.
 */

import { testCycleGradeBreakdown } from '../../../src/platform/assessment/testCycle.js';

const POLICY = { mode: 'testCycle' };

const gradeFor = ({ originalTestGrade = null, rawRetestGrade = null, correctionsComplete = false }) => (
  testCycleGradeBreakdown({
    assignmentId: 'cert-assignment',
    test: originalTestGrade === null ? {} : { state: 'released', rawScore: originalTestGrade },
    retest: rawRetestGrade === null ? {} : { state: 'released', rawScore: rawRetestGrade },
    corrections: { required: originalTestGrade !== null && originalTestGrade < 70, complete: correctionsComplete },
  }, POLICY)
);

const CORRECTIONS = {
  planId: 'cert-corrections',
  secure: false,
  hintsAllowed: true,
  gradeImpact: 'none',
  complete: false,
  targets: [
    {
      correctionId: 'correction-tA', order: 1, label: 'Solving linear equations',
      alignmentKey: 'texas:A.5A', diagnosis: 'misconception', misconception: 'distributes-sign-once',
      diagnosisDetail: 'Observed error pattern "distributes-sign-once" on this standard.',
      missed: 3, requiredCorrectResponses: 2, correctResponses: 0, complete: false,
    },
    {
      correctionId: 'correction-tC', order: 2, label: 'Exponential growth — long standard name that has to wrap on a narrow phone',
      alignmentKey: 'texas:A.9B', diagnosis: 'standard', misconception: null,
      diagnosisDetail: 'Targeting the missed standard texas:A.9B; no specific error pattern was recorded.',
      missed: 2, requiredCorrectResponses: 2, correctResponses: 1, complete: false,
    },
  ],
};

const STAGES = {
  review: {
    stage: 'review', secure: false, hintsAllowed: true, canEnter: true,
    actionLabel: 'Start Review', statusLabel: 'Review',
    detail: 'Finish the review to unlock your test. Hints and tools are available here.',
    examSessionId: null, reviewExamSessionId: null, corrections: null,
    grade: gradeFor({}),
  },
  test: {
    stage: 'test', secure: true, hintsAllowed: false, canEnter: true,
    actionLabel: 'Start Test', statusLabel: 'Test',
    detail: 'Secure test: one attempt per question, no hints or help, and your score is held until your teacher releases it.',
    examSessionId: 'cert-exam-session', reviewExamSessionId: null, corrections: null,
    grade: gradeFor({}),
  },
  awaitingRelease: {
    stage: 'awaitingRelease', secure: false, hintsAllowed: false, canEnter: false,
    actionLabel: 'Submitted', statusLabel: 'Test submitted',
    detail: 'Your test is submitted. Your score and your next step appear once your teacher releases results.',
    examSessionId: null, reviewExamSessionId: null, corrections: null,
    grade: gradeFor({}),
  },
  corrections: {
    stage: 'corrections', secure: false, hintsAllowed: true, canEnter: true,
    actionLabel: 'Start Corrections', statusLabel: 'Corrections',
    detail: 'Your test was 52%. Work through your corrections to unlock a retest. Corrections do not change your recorded grade.',
    examSessionId: null, reviewExamSessionId: null, corrections: CORRECTIONS,
    grade: gradeFor({ originalTestGrade: 52 }),
  },
  retest: {
    stage: 'retest', secure: true, hintsAllowed: false, canEnter: true,
    actionLabel: 'Start Retest', statusLabel: 'Retest',
    detail: 'Secure retest: one attempt per question, no hints. The highest grade retesting can record is 70%.',
    examSessionId: 'cert-retest-session', reviewExamSessionId: null, corrections: null,
    grade: gradeFor({ originalTestGrade: 52, correctionsComplete: true }),
  },
  complete: {
    stage: 'complete', secure: false, hintsAllowed: false, canEnter: true,
    actionLabel: 'Review Retest', statusLabel: 'Retest complete',
    detail: 'Retest raw 84% recorded at the 70% retest cap.',
    examSessionId: null, reviewExamSessionId: 'cert-retest-session', corrections: null,
    grade: gradeFor({ originalTestGrade: 52, rawRetestGrade: 84, correctionsComplete: true }),
  },
};

const requestedStage = () => {
  const stage = new URLSearchParams(window.location.search).get('stage') || 'test';
  return STAGES[stage] ? stage : 'test';
};

export const getStudentTestCycle = async ({ assignmentId }) => ({
  success: true,
  assignmentId,
  title: 'Certification Unit 3 Test Cycle — a deliberately long assessment title that has to wrap',
  ...STAGES[requestedStage()],
});

let issuedCorrections = 0;

export const issueTestCycleCorrectionQuestion = async () => {
  issuedCorrections += 1;
  return {
    success: true,
    secure: false,
    hintsAllowed: true,
    attemptsAllowed: 3,
    questionInstance: {
      questionInstanceId: `cert-correction-${issuedCorrections}`,
      questionType: 'response',
      prompt: 'Solve $4x - 7 = 21$ for $x$, showing the inverse operations in order.',
      hint: 'Undo the subtraction before the multiplication.',
      responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number' }],
      choices: [],
    },
  };
};

export const submitTestCycleCorrectionResponse = async () => ({
  success: true, isCorrect: true, score: 1, correctionsComplete: false,
  progress: { total: 2, complete: 1, remaining: 1, allComplete: false },
  retestOpened: false,
});

export const assignTestCycleSessions = async () => ({ success: true, createdSessions: 0, reusedSessions: 0, students: [] });
export const preflightTestCycleAssignment = async () => ({ success: true, preflight: { errors: [], warnings: [], checks: [], blocked: false } });
export const listTeacherTestCycleRecords = async () => ({ success: true, rows: [] });
export const getTeacherTestCyclePlans = async () => ({ success: true, record: null, corrections: null, retest: null });
export const teacherTestCycleAction = async () => ({ success: true });
