import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { EXECUTION_MODES, getExecutionMode } from '../config/executionMode.js';
import { generateRuntimeUUID } from '../utils/idUtils.js';
import { getExamPolicy } from '../platform/policies/examPolicyResolver.js';

const call = (name, data) => httpsCallable(functions, name)(data).then((response) => response.data);
const mockSessions = new Map();
const mockAnswers = new Map();

const clone = (value) => JSON.parse(JSON.stringify(value));
const mockSession = (examType) => {
  const policy = getExamPolicy(examType);
  const now = Date.now();
  return {
    examSessionId: `exam_mock_${generateRuntimeUUID()}`,
    examType,
    title: policy.title,
    status: 'in_progress',
    requiredQuestions: Math.min(4, policy.totalQuestions),
    summary: { completedQuestions: 0 },
    violationCount: 0,
    startedAt: now,
    timeLimitSeconds: policy.timeLimitSeconds,
    expiresAt: policy.timeLimitSeconds == null ? null : now + policy.timeLimitSeconds * 1000,
    feedbackReleased: false,
    responses: {},
    currentQuestion: null,
  };
};

const nextMockQuestion = (session) => {
  const questionInstanceId = `examq_mock_${generateRuntimeUUID()}`;
  mockAnswers.set(questionInstanceId, '4');
  return {
    questionInstanceId,
    questionType: 'response',
    prompt: 'Solve $2x=8$. Enter $x$.',
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }],
    choices: [],
    alignmentKey: 'A.5A',
    alignmentKeys: ['texas:A.5A'],
    dok: 1,
    difficultyBand: 3,
    examCalculatorMode: session.examType === 'tsia2' ? 'basic' : null,
  };
};

export const createSecureExamSession = async (payload) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSession(payload?.examType || 'digitalSAT');
    session.studentId = payload?.studentId || 'mock_student';
    session.classPeriod = payload?.classPeriod || 'Mock Period';
    session.accommodationsConfirmed = payload?.accommodationsConfirmed === true;
    session.status = 'not_started';
    mockSessions.set(session.examSessionId, session);
    return { success: true, session: clone(session) };
  }
  return call('createSecureExamSession', payload);
};

export const listStudentSecureExamSessions = async () => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) return { sessions: [...mockSessions.values()].map(clone) };
  return call('listStudentSecureExamSessions', {});
};

export const getStudentSecureExamReview = async ({ examSessionId }) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSessions.get(examSessionId);
    if (!session) throw new Error('Secure exam sandbox session not found.');
    if (!session.feedbackReleased) throw new Error('Your teacher has not released feedback for this exam yet.');
    const items = Object.values(session.responses || {}).sort((a, b) => Number(a.submittedAt || 0) - Number(b.submittedAt || 0));
    const correctQuestions = items.filter((item) => item.grading?.isCorrect).length;
    return {
      review: {
        session: clone(session),
        answeredQuestions: items.length,
        correctQuestions,
        scorePercent: items.length ? Math.round(correctQuestions / items.length * 100) : 0,
        items: clone(items),
      },
    };
  }
  return call('getStudentSecureExamReview', { examSessionId });
};

export const startSecureExamSession = async ({ examSessionId = null, examType = 'digitalSAT' } = {}) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const existing = examSessionId ? mockSessions.get(examSessionId) : null;
    if (existing) return { success: true, session: clone(existing) };
    const session = mockSession(examType);
    mockSessions.set(session.examSessionId, session);
    return { success: true, session: clone(session) };
  }
  if (!examSessionId) throw new Error('A teacher-created examSessionId is required in production.');
  return call('startSecureExamSession', { examSessionId });
};

export const issueSecureExamQuestion = async ({ examSessionId }) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSessions.get(examSessionId);
    if (!session) throw new Error('Secure exam sandbox session not found.');
    if (!session.currentQuestion) session.currentQuestion = nextMockQuestion(session);
    return { questionInstance: clone(session.currentQuestion), draftResponse: session.currentQuestion.draftResponse || null, session: clone(session) };
  }
  return call('issueSecureExamQuestion', { examSessionId });
};

export const saveSecureExamDraft = async ({ examSessionId, questionInstanceId, responsePayload, supportUsage = {} }) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSessions.get(examSessionId);
    if (!session || session.currentQuestion?.questionInstanceId !== questionInstanceId) throw new Error('That secure exam question is no longer active.');
    session.currentQuestion.draftResponse = { responsePayload: clone(responsePayload), supportUsage: clone(supportUsage) };
    return { success: true, recorded: true };
  }
  return call('saveSecureExamDraft', { examSessionId, questionInstanceId, responsePayload, supportUsage });
};

export const submitSecureExamResponse = async ({ examSessionId, questionInstanceId, responsePayload, supportUsage = {}, submissionId = null }) => {
  const activeSubmissionId = submissionId || `examsub_${generateRuntimeUUID()}`;
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSessions.get(examSessionId);
    if (!session || session.status !== 'in_progress' || session.currentQuestion?.questionInstanceId !== questionInstanceId) throw new Error('That secure exam question is no longer active.');
    const response = Object.values(responsePayload?.responses || {})[0];
    const isCorrect = String(response ?? '').trim() === mockAnswers.get(questionInstanceId);
    const current = clone(session.currentQuestion);
    session.summary.completedQuestions += 1;
    session.summary.correctQuestions = Number(session.summary.correctQuestions || 0) + (isCorrect ? 1 : 0);
    session.responses[questionInstanceId] = {
      questionInstanceId,
      bankQuestionId: current.bankQuestionId || 'mock-bank-question',
      alignmentKeys: current.alignmentKeys || (current.alignmentKey ? [`texas:${current.alignmentKey}`] : []),
      questionType: current.questionType,
      familyId: current.familyId || 'mock-secure-family',
      grading: { score: isCorrect ? 1 : 0, isCorrect },
      responsePayload: clone(responsePayload || { responses: {} }),
      questionSnapshot: current,
      submittedAt: Date.now(),
    };
    session.currentQuestion = null;
    if (session.summary.completedQuestions >= session.requiredQuestions) session.status = 'submitted';
    return { success: true, submissionId: activeSubmissionId, recorded: true, correctnessReleased: false, _mockCorrect: isCorrect, session: clone(session), needsNextQuestion: session.status === 'in_progress' };
  }
  return call('submitSecureExamResponse', { examSessionId, questionInstanceId, responsePayload, supportUsage, submissionId: activeSubmissionId });
};

export const recordSecureExamIntegrityEvent = async ({ examSessionId, eventId, type, details = {} }) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSessions.get(examSessionId);
    if (!session) throw new Error('Secure exam sandbox session not found.');
    session.violationCount += 1;
    if (session.violationCount >= 3) session.status = 'locked_integrity';
    return { success: true, status: session.status, violationCount: session.violationCount };
  }
  return call('recordSecureExamIntegrityEvent', { examSessionId, eventId, type, details });
};

export const finalizeSecureExam = async ({ examSessionId, reason = 'studentSubmit' }) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSessions.get(examSessionId);
    if (!session) throw new Error('Secure exam sandbox session not found.');
    session.status = reason === 'timeExpired' ? 'time_expired' : 'submitted';
    return { success: true, session: clone(session) };
  }
  return call('finalizeSecureExam', { examSessionId, reason });
};

export const listProctorExamSessions = async (payload = {}) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const values = [...mockSessions.values()].filter((session) => !payload.examType || session.examType === payload.examType);
    return { sessions: values.map(clone) };
  }
  return call('listProctorExamSessions', payload);
};
export const proctorExamAction = async (payload) => {
  if (getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL) {
    const session = mockSessions.get(payload.examSessionId);
    if (!session) throw new Error('Secure exam sandbox session not found.');
    if (payload.action === 'unlock') session.status = 'in_progress';
    if (payload.action === 'lock') session.status = 'locked_proctor';
    if (payload.action === 'extendTime') { session.timeLimitSeconds = Number(session.timeLimitSeconds || 0) + Math.max(1, Number(payload.minutes) || 5) * 60; session.expiresAt = Date.now() + session.timeLimitSeconds * 1000; }
    if (payload.action === 'forceSubmit') session.status = 'force_submitted';
    if (payload.action === 'releaseFeedback') session.feedbackReleased = true;
    return { success: true, session: clone(session) };
  }
  return call('proctorExamAction', payload);
};
