import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { EXECUTION_MODES, getExecutionMode } from '../config/executionMode.js';
import { generateRuntimeUUID } from '../utils/idUtils.js';
import { getExamPolicy } from '../platform/policies/examPolicyResolver.js';
import { measurePerformanceOperation } from '../platform/performance/performanceTelemetry.js';

const call = (name, data) => measurePerformanceOperation(
  'callable_request_ms',
  () => httpsCallable(functions, name)(data).then((response) => response.data),
  { flow: name },
);

/*
 * THE SANDBOX (MOCK_LOCAL): THE SECURE-EXAM CONTRACT, PLAYED IN MEMORY.
 *
 * A developer build without Functions, and the browser harness, run the
 * student's secure screens against this. It plays the same contract the
 * Functions do (functions/lib/secureExamNavigation.js and the callables in
 * functions/index.js), because a sandbox that behaves differently teaches the
 * screen the wrong thing:
 *
 *   - every issued question is an editable draft until the test is finished;
 *     a question is issued when the student first reaches it, and only the
 *     next unopened one can be reached ("skip" is Next);
 *   - a Digital SAT practice test has two modules, and moving into module 2
 *     needs `closeModule: true` and closes module 1;
 *   - refusals carry the server's student-facing message and its `details`
 *     (`navigation`, or the paused `status`), shaped like a callable error;
 *   - finishing grades every open draft, records a blank one as unanswered,
 *     and a practice test's results are released at once;
 *   - the third integrity event pauses the test, and the second one warns.
 *
 * Its "answer key" is a sandbox value held here, never on the item it hands
 * the screen, and it reaches a review only after the results are released —
 * the same boundary the server keeps.
 */
const mockSessions = new Map();

const MOCK_INTEGRITY_LOCK_THRESHOLD = 3;
const TERMINAL = new Set(['submitted', 'time_expired', 'force_submitted']);
const LOCKED = new Set(['locked_integrity', 'locked_proctor']);

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isMock = () => getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL;

// Shaped like the Functions SDK's HttpsError on the client: `code`, `message`
// and `details`, so the screen reads a sandbox refusal exactly as a real one.
const mockError = (code, message, details = null) => {
  const error = new Error(message);
  error.code = `functions/${code}`;
  if (details) error.details = details;
  return error;
};

const MOCK_ITEMS = [
  { prompt: 'Solve $2x=8$. Enter $x$.', responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }], key: '4', alignmentKey: 'A.5A' },
  {
    prompt: 'Which expression is equivalent to $3(x+2)$?',
    responseFields: [{ id: 'answer', label: 'Choose one' }],
    choices: [{ id: 'a', label: '$3x+2$' }, { id: 'b', label: '$3x+6$' }, { id: 'c', label: '$x+6$' }, { id: 'd', label: '$3x+5$' }],
    key: 'b',
    keyDisplay: '$3x+6$',
    alignmentKey: 'A.10D',
  },
  { prompt: 'What is the slope of the line through $(1, 2)$ and $(3, 8)$?', responseFields: [{ id: 'answer', label: 'Slope', inputProfile: 'number' }], key: '3', alignmentKey: 'A.3A' },
  {
    prompt: 'If $f(x)=x^2-1$, what is $f(3)$?',
    responseFields: [{ id: 'answer', label: 'Choose one' }],
    choices: [{ id: 'a', label: '$6$' }, { id: 'b', label: '$8$' }, { id: 'c', label: '$9$' }, { id: 'd', label: '$10$' }],
    key: 'b',
    keyDisplay: '$8$',
    alignmentKey: 'A.12B',
  },
  { prompt: 'Solve for $y$: $y-5=12$.', responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }], key: '17', alignmentKey: 'A.5A' },
  { prompt: 'A rectangle is $7$ units long and $4$ units wide. What is its area, in square units?', responseFields: [{ id: 'answer', label: 'Area', inputProfile: 'number' }], key: '28', alignmentKey: '7.9C' },
];

/** The Digital SAT's two modules, as the server draws them. */
const mockModules = (examType, requiredQuestions) => {
  if (examType !== 'digitalSAT' || requiredQuestions < 2) return null;
  const firstEnd = Math.ceil(requiredQuestions / 2);
  return [{ number: 1, start: 0, end: firstEnd }, { number: 2, start: firstEnd, end: requiredQuestions }];
};

/** A shortened practice test keeps the real test's pace (rounded up to a minute). */
const mockTimeLimitSeconds = (policy, requiredQuestions) => {
  const full = Number(policy?.timeLimitSeconds);
  const total = Number(policy?.totalQuestions);
  if (!Number.isFinite(full) || full <= 0) return null;
  if (!Number.isFinite(total) || total <= 0 || requiredQuestions >= total) return full;
  return Math.max(60, Math.ceil((full * requiredQuestions) / total / 60) * 60);
};

const mockDeadline = (session) => (
  session.startedAt && session.timeLimitSeconds
    ? session.startedAt + (Number(session.timeLimitSeconds) + Number(session.addedTimeSeconds || 0)) * 1000
    : null
);

const meaningful = (value) => {
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(meaningful);
  return Boolean(value) && typeof value === 'object' && Object.values(value).some(meaningful);
};
/** As the server reads it: a typed field answer, or any Rich Tool construction. */
const mockHasWork = (payload) => (
  Object.values(payload?.responses && typeof payload.responses === 'object' ? payload.responses : {}).some((value) => String(value ?? '').trim())
  || meaningful(payload?.raw)
);

const newMockSession = (payload = {}) => {
  const examType = payload.examType || 'digitalSAT';
  const policy = getExamPolicy(examType);
  const courseTest = examType === 'courseTest';
  const sandboxItems = Array.isArray(payload.sandboxItems) ? clone(payload.sandboxItems) : null;
  const requested = Number(payload.questionCount);
  const ceiling = Number(policy.totalQuestions) || 50;
  const requiredQuestions = Number.isInteger(requested) && requested > 0
    ? Math.min(ceiling, requested)
    : sandboxItems?.length || Math.min(4, ceiling);
  return {
    examSessionId: payload.examSessionId || `exam_mock_${generateRuntimeUUID()}`,
    examType,
    title: payload.title || policy.title,
    status: 'not_started',
    studentId: payload.studentId || 'mock_student',
    classPeriod: payload.classPeriod || 'Mock Period',
    requiredQuestions,
    violationCount: 0,
    startedAt: null,
    createdAt: Date.now(),
    timeLimitSeconds: courseTest
      ? (Number(payload.timeLimitMinutes) > 0 ? Number(payload.timeLimitMinutes) * 60 : null)
      : mockTimeLimitSeconds(policy, requiredQuestions),
    addedTimeSeconds: 0,
    calculatorMode: payload.calculatorMode || policy.calculatorMode,
    accommodationsConfirmed: payload.accommodationsConfirmed === true,
    feedbackReleased: false,
    // A practice test's results are the student's once it is finished; a
    // course Test's are the teacher's to release.
    releasePolicy: !courseTest && payload.releasePolicy !== 'teacher' ? 'automatic' : 'teacher',
    // Sandbox only. The server reads the multiplier from the student's support
    // profile when the test starts; a demo or harness says it here instead.
    sandboxTimeMultiplier: Number(payload.extendedTimeMultiplier) > 1 ? Math.min(4, Number(payload.extendedTimeMultiplier)) : 1,
    sandboxItems,
    integrityEventIds: [],
    responses: {},
    issued: {},
    nav: { itemOrder: [], items: {}, cursor: 0, closedThrough: 0, modules: mockModules(examType, requiredQuestions) },
  };
};

const mockAnsweredCount = (session) => session.nav.itemOrder.filter((id) => {
  const response = session.responses[id];
  if (response) return response.unanswered !== true;
  const entry = session.nav.items[id];
  return entry?.state === 'open' && entry.hasWork === true;
}).length;

const mockPublicNavigation = (session) => ({
  version: 1,
  total: session.requiredQuestions,
  issued: session.nav.itemOrder.length,
  cursor: Math.min(session.nav.cursor, Math.max(0, session.requiredQuestions - 1)),
  items: session.nav.itemOrder.map((id, position) => {
    const entry = session.nav.items[id] || {};
    return {
      position,
      questionInstanceId: id,
      status: entry.state === 'recorded' ? 'recorded' : entry.hasWork ? 'answered' : 'unanswered',
      flagged: entry.flagged === true,
      closed: position < session.nav.closedThrough,
    };
  }),
  modules: session.nav.modules
    ? session.nav.modules.map((entry) => ({ ...entry, closed: entry.end <= session.nav.closedThrough }))
    : null,
  upgradedFromLinear: false,
});

/** What a browser is sent: never the issued items, their keys, or the responses. */
const publicMockSession = (session) => {
  const {
    nav: _nav, issued: _issued, responses: _responses, sandboxItems: _sandboxItems,
    sandboxTimeMultiplier: _sandboxTimeMultiplier, integrityEventIds: _integrityEventIds, ...safe
  } = session;
  const answeredQuestions = mockAnsweredCount(session);
  return clone({
    ...safe,
    summary: { completedQuestions: answeredQuestions },
    expiresAt: mockDeadline(session),
    timed: session.timeLimitSeconds !== null && session.timeLimitSeconds !== undefined,
    hasOpenQuestion: session.nav.itemOrder.some((id) => session.nav.items[id]?.state === 'open'),
    answeredQuestions,
    navigation: mockPublicNavigation(session),
    integrityLockThreshold: MOCK_INTEGRITY_LOCK_THRESHOLD,
  });
};

const mockSessionFor = (examSessionId) => {
  const session = mockSessions.get(examSessionId);
  if (!session) throw new Error('Secure exam sandbox session not found.');
  return session;
};

const assertMockInProgress = (session) => {
  if (TERMINAL.has(session.status)) throw mockError('failed-precondition', 'This exam has already been submitted.');
  if (LOCKED.has(session.status)) throw mockError('failed-precondition', 'This exam is locked. Ask the proctor to review the session.', { status: session.status });
  if (session.status !== 'in_progress') throw mockError('failed-precondition', 'This exam is not currently in progress.');
  const deadline = mockDeadline(session);
  if (deadline && Date.now() >= deadline) throw mockError('deadline-exceeded', 'The exam time has expired.');
};

/** Where a navigation request may go — functions/lib/secureExamNavigation.js resolveTarget. */
const mockTarget = (session, position, closeModule) => {
  const { nav } = session;
  let target = position;
  if (target === undefined || target === null) {
    const firstOpen = nav.itemOrder.findIndex((id, index) => nav.items[id]?.state === 'open' && index >= nav.closedThrough);
    target = firstOpen >= 0 ? firstOpen : nav.itemOrder.length;
    if (target >= session.requiredQuestions) throw mockError('failed-precondition', 'All required exam questions have been completed.');
  }
  if (!Number.isInteger(target) || target < 0 || target >= session.requiredQuestions) {
    throw mockError('invalid-argument', 'That question number is not on this test.');
  }
  if (target < nav.closedThrough) {
    throw mockError('failed-precondition', 'That module is finished. You can only move between questions in the current module.', { navigation: 'module_closed' });
  }
  if (target > nav.itemOrder.length) {
    throw mockError('failed-precondition', 'Open the questions in order the first time; you can skip any question with Next.', { navigation: 'not_reached' });
  }
  const issuing = target === nav.itemOrder.length;
  let closesThrough = null;
  if (issuing && nav.modules) {
    const index = nav.modules.findIndex((entry) => target >= entry.start && target < entry.end);
    if (index > 0 && nav.modules[index].start === target && nav.closedThrough < target) {
      if (!closeModule) {
        throw mockError('failed-precondition', `This is the end of module ${index}. Review your answers, then start module ${index + 1}. You will not be able to return to module ${index}.`, { navigation: 'module_end' });
      }
      closesThrough = target;
    }
  }
  return { position: target, issuing, closesThrough };
};

const issueMockItem = (session, position) => {
  const questionInstanceId = `examq_mock_${generateRuntimeUUID()}`;
  const sandbox = session.sandboxItems?.[position];
  if (sandbox?.question) {
    return {
      question: { ...clone(sandbox.question), questionInstanceId, runtimeMode: sandbox.question.runtimeMode || 'secureTest' },
      key: sandbox.key ? clone(sandbox.key) : null,
      draftResponse: null,
    };
  }
  const offset = [...String(session.examSessionId)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const authored = MOCK_ITEMS[(offset + position) % MOCK_ITEMS.length];
  return {
    question: {
      questionInstanceId,
      questionType: authored.choices ? 'multipleChoice' : 'response',
      runtimeMode: 'secureTest',
      prompt: authored.prompt,
      responseFields: clone(authored.responseFields),
      choices: clone(authored.choices || []),
      alignmentKey: authored.alignmentKey,
      alignmentKeys: [`texas:${authored.alignmentKey}`],
      dok: 1,
      difficultyBand: 3,
      examCalculatorMode: session.examType === 'tsia2' ? 'basic' : null,
    },
    key: { answers: { answer: authored.key }, display: authored.keyDisplay || authored.key },
    draftResponse: null,
  };
};

const gradeMockItem = (issued, payload) => {
  const answers = issued.key?.answers;
  if (!answers || !mockHasWork(payload)) return false;
  const responses = payload?.responses || {};
  return Object.entries(answers).every(([fieldId, expected]) => String(responses[fieldId] ?? '').trim() === String(expected));
};

/** Grade every open draft once, as finalize does on the server. */
const finalizeMockSession = (session, status) => {
  const now = Date.now();
  session.nav.itemOrder.forEach((id, position) => {
    const entry = session.nav.items[id];
    if (!entry || entry.state !== 'open') return;
    const issued = session.issued[id];
    const { workspaceDrafts: _workspaceDrafts, ...payload } = issued.draftResponse?.responsePayload || { responses: {} };
    const unanswered = !mockHasWork(payload);
    const isCorrect = gradeMockItem(issued, payload);
    session.responses[id] = {
      questionInstanceId: id,
      position,
      bankQuestionId: 'mock-bank-question',
      alignmentKeys: issued.question.alignmentKeys || [],
      questionType: issued.question.questionType || null,
      pathToolId: issued.question.pathToolId || null,
      unanswered,
      grading: { score: isCorrect ? 1 : 0, isCorrect },
      responsePayload: unanswered ? { responses: {} } : clone(payload),
      questionSnapshot: clone(issued.question),
      solution: issued.key?.display
        ? { answers: [{ fieldId: 'answer', label: 'Answer', display: issued.key.display }], review: issued.key.review ? clone(issued.key.review) : null }
        : null,
      submittedAt: now,
    };
    entry.state = 'recorded';
  });
  session.status = status;
  session.submittedAt = now;
  if (session.releasePolicy === 'automatic' && session.examType !== 'courseTest') session.feedbackReleased = true;
};

/*
 * The time a not-started session WILL have, as the student's list states it
 * before Start — functions/index.js projectedSecureExamTime. The extension is
 * applied for real at start (startMockSession); this only describes it.
 */
const mockProjectedTime = (session) => {
  if (session.status !== 'not_started' || !(session.sandboxTimeMultiplier > 1) || !session.timeLimitSeconds) return {};
  return {
    baseTimeLimitSeconds: session.timeLimitSeconds,
    timeLimitSeconds: Math.ceil((session.timeLimitSeconds * session.sandboxTimeMultiplier) / 60) * 60,
    extendedTimeMultiplier: session.sandboxTimeMultiplier,
  };
};

const startMockSession = (session) => {
  if (session.status !== 'not_started') return;
  Object.assign(session, mockProjectedTime(session));
  session.status = 'in_progress';
  session.startedAt = Date.now();
};

export const createSecureExamSession = async (payload) => {
  if (isMock()) {
    const session = newMockSession(payload || {});
    mockSessions.set(session.examSessionId, session);
    return { success: true, session: publicMockSession(session) };
  }
  return call('createSecureExamSession', payload);
};

export const listStudentSecureExamSessions = async () => {
  if (isMock()) {
    return {
      sessions: [...mockSessions.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((session) => publicMockSession({ ...session, ...mockProjectedTime(session) })),
    };
  }
  return call('listStudentSecureExamSessions', {});
};

export const getStudentSecureExamReview = async ({ examSessionId }) => {
  if (isMock()) {
    const session = mockSessionFor(examSessionId);
    if (!TERMINAL.has(session.status) || !session.feedbackReleased) throw new Error('Your teacher has not released feedback for this exam yet.');
    const items = Object.values(session.responses).sort((a, b) => a.position - b.position);
    const correctQuestions = items.filter((item) => item.grading?.isCorrect).length;
    const plannedQuestions = Math.max(session.requiredQuestions, items.length);
    return {
      review: {
        session: publicMockSession(session),
        answeredQuestions: items.filter((item) => !item.unanswered).length,
        plannedQuestions,
        correctQuestions,
        scorePercent: plannedQuestions ? Math.round((correctQuestions / plannedQuestions) * 100) : 0,
        earnedPoints: correctQuestions,
        possiblePoints: plannedQuestions,
        weighted: false,
        scoreBasis: 'planned',
        items: clone(items),
      },
    };
  }
  return call('getStudentSecureExamReview', { examSessionId });
};

export const startSecureExamSession = async ({ examSessionId = null, examType = 'digitalSAT' } = {}) => {
  if (isMock()) {
    let session = examSessionId ? mockSessions.get(examSessionId) : null;
    if (!session) {
      // The sandbox has no teacher to create the session first.
      session = newMockSession({ examSessionId, examType });
      mockSessions.set(session.examSessionId, session);
    }
    startMockSession(session);
    return { success: true, session: publicMockSession(session) };
  }
  if (!examSessionId) throw new Error('A teacher-created examSessionId is required in production.');
  return call('startSecureExamSession', { examSessionId });
};

/*
 * Open (or reopen) the question at `position` (zero-based): any question
 * already opened, or the next one, which is how a student skips ahead.
 * `closeModule` confirms leaving a finished Digital SAT module. Without a
 * position the server answers as the older linear client expected.
 *   → { position, recorded, questionInstance, draftResponse, session }
 */
export const issueSecureExamQuestion = async ({ examSessionId, position = undefined, closeModule = false } = {}) => {
  const target = Number.isInteger(position) ? { position } : {};
  if (isMock()) {
    const session = mockSessionFor(examSessionId);
    assertMockInProgress(session);
    const resolved = mockTarget(session, target.position, closeModule === true);
    let id = session.nav.itemOrder[resolved.position];
    if (!id) {
      const issued = issueMockItem(session, resolved.position);
      id = issued.question.questionInstanceId;
      session.issued[id] = issued;
      session.nav.itemOrder.push(id);
      session.nav.items[id] = { position: resolved.position, state: 'open', hasWork: false, flagged: false };
      if (resolved.closesThrough !== null) session.nav.closedThrough = Math.max(session.nav.closedThrough, resolved.closesThrough);
    }
    session.nav.cursor = resolved.position;
    const recorded = session.nav.items[id]?.state === 'recorded';
    return {
      position: resolved.position,
      recorded,
      questionInstance: recorded ? null : clone(session.issued[id].question),
      draftResponse: recorded ? null : clone(session.issued[id].draftResponse || null),
      session: publicMockSession(session),
    };
  }
  return call('issueSecureExamQuestion', { examSessionId, ...target, ...(closeModule === true ? { closeModule: true } : {}) });
};

/*
 * Autosave the student's draft for ANY open question, and/or set its review
 * flag. `flagged` alone leaves the saved answer untouched. Nothing is graded.
 *   → { success, recorded, navigation, answeredQuestions }
 */
export const saveSecureExamDraft = async ({ examSessionId, questionInstanceId, responsePayload = undefined, supportUsage = {}, flagged = undefined, draftWriter = undefined, draftRevision = undefined } = {}) => {
  const hasPayload = responsePayload !== undefined && responsePayload !== null;
  const flag = typeof flagged === 'boolean' ? { flagged } : {};
  // This page's stamp on an answer draft: the server writes no older revision
  // from the same page over a newer one (SecureExamContainer, serialDraftSaves.js).
  const stamp = hasPayload && typeof draftWriter === 'string' && Number.isSafeInteger(draftRevision) ? { draftWriter, draftRevision } : {};
  if (isMock()) {
    const session = mockSessionFor(examSessionId);
    assertMockInProgress(session);
    if (!hasPayload && !('flagged' in flag)) throw mockError('invalid-argument', 'Send an answer draft or a review flag.');
    const entry = session.nav.items[questionInstanceId];
    if (!entry || entry.state !== 'open' || entry.position < session.nav.closedThrough) {
      throw mockError('failed-precondition', 'That question is no longer active.');
    }
    if (hasPayload) {
      session.issued[questionInstanceId].draftResponse = { responsePayload: clone(responsePayload), supportUsage: clone(supportUsage || {}) };
      entry.hasWork = mockHasWork(responsePayload);
    }
    if ('flagged' in flag) entry.flagged = flag.flagged;
    return { success: true, recorded: true, navigation: mockPublicNavigation(session), answeredQuestions: mockAnsweredCount(session) };
  }
  return call('saveSecureExamDraft', { examSessionId, questionInstanceId, ...(hasPayload ? { responsePayload, supportUsage } : {}), ...stamp, ...flag });
};

/*
 * THE OLDER "RECORD AND LOCK" CALL. The navigation runtime never uses it: an
 * answer is a draft until the test is submitted. It remains for a browser
 * still running the previous build (ExamRuntimeController), as on the server.
 */
export const submitSecureExamResponse = async ({ examSessionId, questionInstanceId, responsePayload, supportUsage = {}, submissionId = null }) => {
  const activeSubmissionId = submissionId || `examsub_${generateRuntimeUUID()}`;
  if (isMock()) {
    const session = mockSessionFor(examSessionId);
    assertMockInProgress(session);
    const entry = session.nav.items[questionInstanceId];
    if (!entry || entry.state !== 'open' || entry.position < session.nav.closedThrough) throw mockError('failed-precondition', 'That question is no longer active.');
    session.issued[questionInstanceId].draftResponse = { responsePayload: clone(responsePayload || { responses: {} }), supportUsage: clone(supportUsage || {}) };
    entry.hasWork = mockHasWork(responsePayload);
    const issued = session.issued[questionInstanceId];
    const isCorrect = gradeMockItem(issued, responsePayload);
    session.responses[questionInstanceId] = {
      questionInstanceId,
      position: entry.position,
      bankQuestionId: 'mock-bank-question',
      alignmentKeys: issued.question.alignmentKeys || [],
      questionType: issued.question.questionType || null,
      pathToolId: issued.question.pathToolId || null,
      unanswered: !entry.hasWork,
      grading: { score: isCorrect ? 1 : 0, isCorrect },
      responsePayload: clone(responsePayload || { responses: {} }),
      questionSnapshot: clone(issued.question),
      solution: null,
      submittedAt: Date.now(),
    };
    entry.state = 'recorded';
    const finished = session.nav.itemOrder.length >= session.requiredQuestions
      && session.nav.itemOrder.every((id) => session.nav.items[id]?.state !== 'open');
    if (finished) finalizeMockSession(session, 'submitted');
    return { success: true, submissionId: activeSubmissionId, recorded: true, correctnessReleased: false, needsNextQuestion: !finished, session: publicMockSession(session) };
  }
  return call('submitSecureExamResponse', { examSessionId, questionInstanceId, responsePayload, supportUsage, submissionId: activeSubmissionId });
};

/*
 * One browser-observed integrity event. → { status, violationCount,
 * lockThreshold, warning } — `warning` when ONE more event will pause the test.
 */
export const recordSecureExamIntegrityEvent = async ({ examSessionId, eventId, type, details = {} }) => {
  if (isMock()) {
    const session = mockSessionFor(examSessionId);
    if (session.integrityEventIds.includes(eventId)) {
      return { success: true, duplicate: true, status: session.status, violationCount: session.violationCount, lockThreshold: MOCK_INTEGRITY_LOCK_THRESHOLD };
    }
    if (TERMINAL.has(session.status)) throw mockError('failed-precondition', 'This exam is already submitted.');
    session.integrityEventIds.push(eventId);
    session.violationCount += 1;
    if (session.violationCount >= MOCK_INTEGRITY_LOCK_THRESHOLD && session.status === 'in_progress') session.status = 'locked_integrity';
    return {
      success: true,
      status: session.status,
      violationCount: session.violationCount,
      lockThreshold: MOCK_INTEGRITY_LOCK_THRESHOLD,
      warning: session.status === 'in_progress' && session.violationCount === MOCK_INTEGRITY_LOCK_THRESHOLD - 1,
    };
  }
  return call('recordSecureExamIntegrityEvent', { examSessionId, eventId, type, details });
};

/** Submit (or, at the verified deadline, time out) the test. Grades every open draft. */
export const finalizeSecureExam = async ({ examSessionId, reason = 'studentSubmit' }) => {
  if (isMock()) {
    const session = mockSessionFor(examSessionId);
    if (TERMINAL.has(session.status)) return { success: true, session: publicMockSession(session) };
    if (session.status === 'not_started') throw mockError('failed-precondition', 'Start the exam before submitting it.');
    const deadline = mockDeadline(session);
    if (reason === 'timeExpired' && !(deadline && Date.now() >= deadline)) throw mockError('failed-precondition', 'The server-side exam deadline has not been reached.');
    if (reason !== 'timeExpired' && LOCKED.has(session.status)) throw mockError('failed-precondition', 'A locked exam must be resolved by the proctor.');
    finalizeMockSession(session, reason === 'timeExpired' ? 'time_expired' : 'submitted');
    return { success: true, session: publicMockSession(session) };
  }
  return call('finalizeSecureExam', { examSessionId, reason });
};

export const listProctorExamSessions = async (payload = {}) => {
  if (isMock()) {
    const values = [...mockSessions.values()].filter((session) => !payload.examType || session.examType === payload.examType);
    return { sessions: values.map(publicMockSession) };
  }
  return call('listProctorExamSessions', payload);
};

export const proctorExamAction = async (payload) => {
  if (isMock()) {
    const session = mockSessionFor(payload.examSessionId);
    const action = String(payload.action || '');
    if (action === 'releaseFeedback') {
      if (!TERMINAL.has(session.status)) throw mockError('failed-precondition', 'Submit the exam before releasing feedback.');
      session.feedbackReleased = true;
      return { success: true, session: publicMockSession(session) };
    }
    if (TERMINAL.has(session.status)) throw mockError('failed-precondition', 'This submitted exam cannot be changed except to release feedback.');
    if (action === 'unlock') {
      if (!LOCKED.has(session.status)) throw mockError('failed-precondition', 'Only a locked exam can be unlocked. A student starts their own exam.');
      session.status = 'in_progress';
    }
    if (action === 'lock') {
      if (session.status !== 'in_progress') throw mockError('failed-precondition', 'Only an exam in progress can be paused.');
      session.status = 'locked_proctor';
    }
    if (action === 'extendTime') {
      if (!session.timeLimitSeconds) throw mockError('failed-precondition', 'This exam is untimed; there is no time limit to extend.');
      session.addedTimeSeconds = Number(session.addedTimeSeconds || 0) + Math.max(1, Math.min(120, Math.round(Number(payload.minutes) || 5))) * 60;
    }
    if (action === 'forceSubmit') finalizeMockSession(session, 'force_submitted');
    return { success: true, session: publicMockSession(session) };
  }
  return call('proctorExamAction', payload);
};
