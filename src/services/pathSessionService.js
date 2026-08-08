import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { EXECUTION_MODES, getExecutionMode } from '../config/executionMode.js';
import { generateRuntimeUUID } from '../utils/idUtils.js';
import { toCanonicalKey } from '../utils/teksUtils.js';

const mockSessions = new Map();
const mockAnswers = new Map();

const callable = (name) => httpsCallable(functions, name);

const clone = (value) => JSON.parse(JSON.stringify(value));

const mockQuestionFor = (session) => {
  const questionNumber = session.summary.completedQuestions + 1;
  const questionInstanceId = `qi_mock_${generateRuntimeUUID()}`;
  mockAnswers.set(questionInstanceId, '4');
  return {
    questionInstanceId,
    familyId: 'phase5-connectivity-sandbox',
    familyVersion: 1,
    questionType: 'number',
    activityRole: 'practice',
    difficultyBand: 3,
    dok: 1,
    calculatorPolicy: 'none',
    prompt: `Phase 5 local sandbox · ${session.target.alignmentKey} · check ${questionNumber}: enter 4 to verify the secure session flow.`,
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }],
    attemptsAllowed: 3,
    attemptsUsed: 0,
  };
};

export const startOrResumePathSession = async ({ targetAlignmentKey, sessionKind = 'practice', requiredQuestions = 5 }) => {
  const canonicalKey = toCanonicalKey(targetAlignmentKey);
  if (!canonicalKey) throw new Error('Choose a TEKS standard before starting My Math Path.');
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const existing = [...mockSessions.values()].find((item) => item.status === 'active' && item.target.alignmentKey === canonicalKey && item.sessionKind === sessionKind);
    if (existing) return { success: true, session: clone(existing) };
    const session = {
      sessionId: `path_mock_${generateRuntimeUUID()}`,
      status: 'active',
      sessionKind,
      requiredQuestions: Math.max(2, Math.min(10, Number(requiredQuestions) || 5)),
      target: { alignmentKey: canonicalKey },
      summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
      currentQuestion: null,
      pathState: { counters: { questionsThisSession: 0 } },
    };
    mockSessions.set(session.sessionId, session);
    return { success: true, session: clone(session) };
  }
  const response = await callable('startMyMathPathSession')({
    targetAlignmentKey: canonicalKey,
    sessionKind,
    requiredQuestions,
  });
  return response.data;
};

export const fetchNextSanitizedQuestion = async ({ sessionId }) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSessions.get(sessionId);
    if (!session) throw new Error('The local My Math Path session no longer exists.');
    if (session.currentQuestion) return { questionInstance: clone(session.currentQuestion) };
    const questionInstance = mockQuestionFor(session);
    session.currentQuestion = questionInstance;
    return { questionInstance: clone(questionInstance) };
  }
  const response = await callable('issueNextQuestion')({ sessionId });
  return response.data;
};

export const submitStudentResponse = async ({
  sessionId,
  questionInstanceId,
  responsePayload,
  supportUsage = {},
  submissionId = null,
}) => {
  const activeSubmissionId = submissionId || `sub_${generateRuntimeUUID()}`;
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSessions.get(sessionId);
    if (!session || session.currentQuestion?.questionInstanceId !== questionInstanceId) throw new Error('That local question is no longer active.');
    const question = session.currentQuestion;
    const firstValue = Object.values(responsePayload?.responses || {})[0];
    const isCorrect = String(firstValue ?? '').trim() === mockAnswers.get(questionInstanceId);
    question.attemptsUsed = (question.attemptsUsed || 0) + 1;
    const finalized = isCorrect || question.attemptsUsed >= question.attemptsAllowed;
    if (finalized) {
      session.summary.completedQuestions += 1;
      session.summary.correctQuestions += isCorrect ? 1 : 0;
      const independent = supportUsage.isMathematicallyIndependent !== false
        && !supportUsage.hintUsed && !supportUsage.teacherAssisted && !supportUsage.scaffoldUsed;
      session.summary.independentSuccesses += isCorrect && independent ? 1 : 0;
      session.pathState.counters.questionsThisSession = session.summary.completedQuestions;
      session.currentQuestion = null;
      if (session.summary.completedQuestions >= session.requiredQuestions) session.status = 'completed';
    }
    return {
      success: true,
      submissionId: activeSubmissionId,
      grading: { isCorrect, score: isCorrect ? 1 : 0, attemptNumber: question.attemptsUsed, attemptsRemaining: Math.max(0, question.attemptsAllowed - question.attemptsUsed), questionFinalized: finalized },
      session: clone(session),
      needsNextQuestion: finalized && session.status === 'active',
    };
  }
  const response = await callable('submitPathResponse')({
    sessionId,
    questionInstanceId,
    submissionId: activeSubmissionId,
    responsePayload,
    supportUsage,
  });
  return response.data;
};
