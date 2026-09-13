/*
 * The secure exam callables, stubbed for the device harness.
 *
 * Enough to render the secure container's start screen and one question, which
 * is where a student on a phone actually sits a course Test. Grading, integrity
 * and release are certified against the real functions in the emulator suite;
 * what this exists to measure is whether the controls fit on the device.
 */

const session = {
  examSessionId: 'cert-exam-session',
  examType: 'courseTest',
  title: 'Certification Unit 3 Test',
  status: 'in_progress',
  requiredQuestions: 25,
  summary: { completedQuestions: 7 },
  violationCount: 0,
  startedAt: Date.now(),
  timeLimitSeconds: 45 * 60,
  expiresAt: Date.now() + 38 * 60 * 1000,
  feedbackReleased: false,
  accommodationsConfirmed: false,
};

export const createSecureExamSession = async () => ({ success: true, session: { ...session } });
export const listStudentSecureExamSessions = async () => ({ sessions: [{ ...session, courseTest: { assignmentId: 'cert-assignment' } }] });
export const getStudentSecureExamReview = async () => ({ review: { session: { ...session }, answeredQuestions: 25, correctQuestions: 21, scorePercent: 84, items: [] } });
export const startSecureExamSession = async () => ({ success: true, session: { ...session } });
export const issueSecureExamQuestion = async () => ({
  questionInstance: {
    questionInstanceId: 'cert-secure-q8',
    questionType: 'response',
    prompt: 'A line passes through $(-3, 7)$ and $(5, -9)$. Write its equation in slope-intercept form.',
    responseFields: [{ id: 'answer', label: 'Equation', inputProfile: 'text' }],
    choices: [],
    attemptsAllowed: 1,
    examCalculatorMode: null,
  },
  draftResponse: null,
  session: { ...session },
});
export const saveSecureExamDraft = async () => ({ success: true, recorded: true });
export const submitSecureExamResponse = async () => ({ success: true, recorded: true, correctnessReleased: false, needsNextQuestion: true, session: { ...session } });
export const recordSecureExamIntegrityEvent = async () => ({ success: true, status: 'in_progress', violationCount: 1 });
export const finalizeSecureExam = async () => ({ success: true, session: { ...session, status: 'submitted' } });
export const listProctorExamSessions = async () => ({ sessions: [] });
export const proctorExamAction = async () => ({ success: true, session: { ...session } });
