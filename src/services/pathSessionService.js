import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import {
  EXECUTION_MODES,
  getExecutionConfigurationMessage,
  getExecutionMode,
  isExecutionMisconfigured,
  isMockPathAllowed,
} from '../config/executionMode.js';
import { generateRuntimeUUID } from '../utils/idUtils.js';
import { toCanonicalKey } from '../utils/teksUtils.js';

// The live My Math Path runtime.
//
// TWO RUNTIMES, AND A REFUSAL.
//
//   firebaseProduction  the secure server. The only runtime a real student may
//                       ever meet.
//   mockLocal           a developer sandbox, available only in a build that is
//                       allowed to have one (see config/executionMode.js).
//   misconfigured       neither. Every entry point below throws a labelled,
//                       recoverable configuration error.
//
// The third case is the point of this file's shape. Previously a deployment
// that lost its execution-mode variable fell back to the sandbox, so students
// were shown "enter 4 to verify the secure session flow" and the platform
// recorded mastery for it. Nothing about that looked broken from the outside.
// Now a build that cannot reach the secure Path says so.

export class PathConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PathConfigurationError';
    this.code = 'path/not-configured';
    // Read by the session container to show a service message with a retry
    // rather than a mathematics-looking failure.
    this.isConfigurationError = true;
    this.recoverable = true;
  }
}

const assertRuntimeAvailable = () => {
  if (!isExecutionMisconfigured()) return;
  throw new PathConfigurationError(
    getExecutionConfigurationMessage()
      || 'My Math Path is not configured on this deployment.',
  );
};

const usingMockRuntime = () => isMockPathAllowed() && getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL;

const mockSessions = new Map();
const mockAnswers = new Map();

const callable = (name) => httpsCallable(functions, name);

const callableDetails = (caught) => (
  (caught?.details && typeof caught.details === 'object' && caught.details)
  || (caught?.customData?.details && typeof caught.customData.details === 'object' && caught.customData.details)
  || {}
);

const pathOperationLabel = Object.freeze({
  startMyMathPathSession: 'start this practice session',
  issueNextQuestion: 'prepare the next secure question',
  submitPathResponse: 'check this response',
  getMyMathPathSkillProgress: 'load your completed Path passes',
});

const normalizePathCallableError = (caught, operation) => {
  if (caught?.isConfigurationError) return caught;
  const code = String(caught?.code || '').replace(/^functions\//, '');
  const details = callableDetails(caught);
  const diagnosticId = String(details?.diagnosticId || '').trim() || null;
  const reason = String(details?.reason || '').trim() || null;
  const action = pathOperationLabel[operation] || 'complete this Path action';
  let message = String(caught?.message || '').replace(/^Firebase:\s*/i, '').trim();

  if (code === 'internal') {
    message = `The secure My Math Path service could not ${action}.`;
    if (diagnosticId) message += ` Diagnostic ID: ${diagnosticId}.`;
    message += ' Return to My Math Path or try again; an administrator can use the diagnostic ID in Path content coverage.';
  } else if (!message) {
    message = `My Math Path could not ${action}.`;
  }

  const error = new Error(message);
  error.name = 'PathRuntimeError';
  error.code = code ? `functions/${code}` : (caught?.code || 'path/runtime-error');
  error.reason = reason;
  error.operation = operation;
  error.diagnosticId = diagnosticId;
  error.details = details;
  error.recoverable = ['internal', 'unavailable', 'deadline-exceeded', 'resource-exhausted'].includes(code);
  return error;
};

const invokePathCallable = async (name, payload) => {
  try {
    const response = await callable(name)(payload);
    return response.data;
  } catch (caught) {
    throw normalizePathCallableError(caught, name);
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value));

// The sandbox question is deliberately labelled as one. A developer should be
// able to tell at a glance that they are not looking at authored content, and a
// screenshot of it should be self-evidently not a student experience.
const mockQuestionFor = (session) => {
  const questionNumber = session.summary.completedQuestions + 1;
  const questionInstanceId = `qi_mock_${generateRuntimeUUID()}`;
  const expected = String(3 + questionNumber);
  mockAnswers.set(questionInstanceId, expected);
  return {
    questionInstanceId,
    familyId: 'developer-sandbox',
    familyVersion: 1,
    questionType: 'number',
    activityRole: 'practice',
    difficultyBand: 3,
    dok: 1,
    calculatorPolicy: 'none',
    isDevelopmentSandbox: true,
    prompt: `Developer sandbox (not authored content). Enter ${expected}.`,
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }],
    attemptsAllowed: 3,
    attemptsUsed: 0,
  };
};

export const startOrResumePathSession = async ({ targetAlignmentKey, sessionKind = 'practice', requiredQuestions = 5, assessmentFramework = null, coursePracticeIntent = null, weekKey = null, weeklySlotKey = null, weeklySlot = null }) => {
  assertRuntimeAvailable();
  const canonicalKey = toCanonicalKey(targetAlignmentKey);
  if (!canonicalKey) throw new Error('Choose a TEKS standard before starting My Math Path.');
  if (usingMockRuntime()) {
    const existing = [...mockSessions.values()].find((item) => item.status === 'active' && item.target.alignmentKey === canonicalKey && item.sessionKind === sessionKind && (item.assessmentFramework || null) === (assessmentFramework || null) && (item.weeklySlotKey || null) === (weeklySlotKey || null));
    if (existing) return { success: true, session: clone(existing) };
    const session = {
      sessionId: `path_mock_${generateRuntimeUUID()}`,
      status: 'active',
      sessionKind,
      assessmentFramework: assessmentFramework || null,
      coursePracticeIntent: coursePracticeIntent === 'challenge' ? 'challenge' : null,
      weekKey: weekKey || null,
      weeklySlotKey: weeklySlotKey || null,
      weeklySlot: weeklySlot || null,
      isDevelopmentSandbox: true,
      requiredQuestions: Math.max(2, Math.min(10, Number(requiredQuestions) || 5)),
      target: { alignmentKey: canonicalKey },
      summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
      currentQuestion: null,
      pathState: { counters: { questionsThisSession: 0 } },
    };
    mockSessions.set(session.sessionId, session);
    return { success: true, session: clone(session) };
  }
  return invokePathCallable('startMyMathPathSession', {
    targetAlignmentKey: canonicalKey,
    sessionKind,
    requiredQuestions,
    assessmentFramework: assessmentFramework || null,
    coursePracticeIntent: coursePracticeIntent === 'challenge' ? 'challenge' : null,
    weekKey: weekKey || null,
    weeklySlotKey: weeklySlotKey || null,
    weeklySlot: weeklySlot || null,
  });
};

export const fetchMyMathPathSkillProgress = async () => {
  assertRuntimeAvailable();
  if (usingMockRuntime()) {
    return { success: true, byTeksCode: {}, skillsWithCompletedPasses: 0, totalCompletedPasses: 0 };
  }
  return invokePathCallable('getMyMathPathSkillProgress', {});
};

export const fetchNextSanitizedQuestion = async ({ sessionId }) => {
  assertRuntimeAvailable();
  if (usingMockRuntime()) {
    const session = mockSessions.get(sessionId);
    if (!session) throw new Error('The local My Math Path session no longer exists.');
    if (session.currentQuestion) return { questionInstance: clone(session.currentQuestion) };
    const questionInstance = mockQuestionFor(session);
    session.currentQuestion = questionInstance;
    return { questionInstance: clone(questionInstance) };
  }
  return invokePathCallable('issueNextQuestion', { sessionId });
};

export const submitStudentResponse = async ({
  sessionId,
  questionInstanceId,
  responsePayload,
  supportUsage = {},
  // What the support bar actually rendered and what the student pressed. These
  // are CLAIMS: the server intersects them with the supports it authorized at
  // issue time, so a modified client can only ever narrow what is recorded.
  supportsPresented = [],
  supportsUsed = [],
  submissionId = null,
}) => {
  assertRuntimeAvailable();
  const activeSubmissionId = submissionId || `sub_${generateRuntimeUUID()}`;
  if (usingMockRuntime()) {
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
      // Parity with the secure runtime: a review exists only once the question
      // is closed, never before.
      solutionReview: finalized ? {
        headline: 'Developer sandbox item',
        reasoning: ['This is not authored mathematics. It exists so the session plumbing can be exercised locally.'],
      } : null,
      session: clone(session),
      needsNextQuestion: finalized && session.status === 'active',
    };
  }
  return invokePathCallable('submitPathResponse', {
    sessionId,
    questionInstanceId,
    submissionId: activeSubmissionId,
    responsePayload,
    supportUsage,
    supportsPresented,
    supportsUsed,
  });
};
