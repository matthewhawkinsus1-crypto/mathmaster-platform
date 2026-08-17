import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as liveSessionService from '../../services/pathSessionService.js';
import { generateRuntimeUUID } from '../../utils/idUtils.js';
import PathSessionPlayer from './PathSessionPlayer.jsx';

// The session runtime is injected.
//
// A real student gets the live service, which calls the secure server. The
// Teacher Path Simulator supplies its own runtime over a synthetic learner —
// it cannot use the student callables, because those require an authenticated
// student claim and weakening that check to let a teacher impersonate a student
// would be a real security hole. One container, two runtimes, no second copy of
// the session UI.
export const MyMathPathProductionContainer = ({
  targetAlignmentKey,
  sessionKind = 'practice',
  requiredQuestions = 5,
  studentProfile,
  sessionProvider = null,
  onReturnToDashboard,
  onSessionComplete,
  onSimulationController = null,
  onSimulationEvent = null,
}) => {
  const provider = sessionProvider || liveSessionService;
  const {
    startOrResumePathSession,
    fetchNextSanitizedQuestion,
    submitStudentResponse,
    forceCurrentQuestionOutcome = null,
  } = provider;
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submissionError, setSubmissionError] = useState(null);
  const [lastGradingResult, setLastGradingResult] = useState(null);
  const pendingSubmissionRef = useRef(null);
  const completionReportedRef = useRef(false);

  const initializeSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSubmissionError(null);
    completionReportedRef.current = false;
    try {
      const result = await startOrResumePathSession({ targetAlignmentKey, sessionKind, requiredQuestions });
      setSession(result.session);
      if (result.session.status === 'active') {
        const next = await fetchNextSanitizedQuestion({ sessionId: result.session.sessionId });
        setCurrentQuestion(next.questionInstance);
      } else {
        setCurrentQuestion(null);
      }
    } catch (caught) {
      setError(caught.message || 'Unable to load this My Math Path session.');
    } finally {
      setLoading(false);
    }
  }, [targetAlignmentKey, sessionKind, requiredQuestions]);

  useEffect(() => { initializeSession(); }, [initializeSession]);

  useEffect(() => {
    if (session?.status !== 'completed' || completionReportedRef.current) return;
    completionReportedRef.current = true;
    onSessionComplete?.(session);
  }, [session, onSessionComplete]);

  const handleSubmitAnswer = async (responsePayload, supportUsage = {}, grade = null) => {
    if (!session || !currentQuestion || submitting) return;
    setSubmitting(true);
    setSubmissionError(null);
    const responseKey = JSON.stringify({ questionInstanceId: currentQuestion.questionInstanceId, responsePayload });
    if (pendingSubmissionRef.current?.responseKey !== responseKey) {
      pendingSubmissionRef.current = { responseKey, submissionId: `sub_${generateRuntimeUUID()}` };
    }
    try {
      const result = await submitStudentResponse({
        sessionId: session.sessionId,
        questionInstanceId: currentQuestion.questionInstanceId,
        submissionId: pendingSubmissionRef.current.submissionId,
        responsePayload,
        supportUsage,
        // Only the canonical renderer supplies this, and only a runtime that
        // already holds the answer key accepts it. The secure server ignores
        // it and grades for itself.
        ...(grade ? { isCorrect: grade.isCorrect } : {}),
      });
      pendingSubmissionRef.current = null;
      setLastGradingResult(result.grading);
      setSession(result.session);
      if (result.needsNextQuestion && result.session.status === 'active') {
        const next = await fetchNextSanitizedQuestion({ sessionId: result.session.sessionId });
        setCurrentQuestion(next.questionInstance);
        setLastGradingResult(null);
      } else if (result.session.status === 'active') {
        setCurrentQuestion((current) => (current
          ? { ...current, attemptsUsed: result.grading?.attemptNumber ?? current.attemptsUsed }
          : current));
      } else {
        setCurrentQuestion(null);
      }
      onSimulationEvent?.({
        id: `path-event-${Date.now()}`,
        at: Date.now(),
        kind: 'student-response',
        label: result.grading?.isCorrect
          ? 'Answered correctly'
          : result.grading?.questionFinalized ? 'Question finalized incorrect' : 'Incorrect attempt',
        detail: `${currentQuestion.teksCode || currentQuestion.alignmentKey || 'Path skill'} · attempt ${result.grading?.attemptNumber || 0}${result.decision?.explanation ? ` · ${result.decision.explanation}` : ''}`,
        isCorrect: Boolean(result.grading?.isCorrect),
        grading: result.grading || null,
        decision: result.decision || result.session?.lastDecision || null,
        question: {
          questionInstanceId: currentQuestion.questionInstanceId,
          sourceBankQuestionId: currentQuestion.sourceBankQuestionId || null,
          teksCode: currentQuestion.teksCode || null,
          prompt: currentQuestion.tool?.prompt || currentQuestion.canonicalQuestion?.prompt || currentQuestion.prompt || '',
        },
        session: result.session,
      });
      // The server's verdict, in the shape QuestionEngine renders feedback
      // from. Under secure grading this is the only verdict that exists.
      return {
        isCorrect: Boolean(result.grading?.isCorrect),
        status: result.grading?.isCorrect ? 'correct' : result.grading?.questionFinalized ? 'expired' : 'attempted',
        attemptCount: Number(result.grading?.attemptNumber || 0),
        remainingAttempts: Number(result.grading?.attemptsRemaining || 0),
        expired: !result.grading?.isCorrect && Boolean(result.grading?.questionFinalized),
        partGrades: result.grading?.parts || [],
      };
    } catch (caught) {
      setSubmissionError(`Submission was not confirmed. Check your connection and retry; MathMaster will reuse the same submission ID. ${caught.message || ''}`.trim());
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const forceOutcomeFromSimulator = useCallback(async (outcomeId) => {
    if (!session || !currentQuestion) {
      return { ok: false, reason: 'Start or open a Path practice question first.' };
    }
    if (typeof forceCurrentQuestionOutcome !== 'function') {
      return { ok: false, reason: 'This runtime does not support teacher force controls.' };
    }
    if (submitting) return { ok: false, reason: 'Wait for the current submission to finish.' };

    setSubmitting(true);
    setSubmissionError(null);
    try {
      const before = session;
      const forced = await forceCurrentQuestionOutcome({
        sessionId: session.sessionId,
        questionInstanceId: currentQuestion.questionInstanceId,
        outcomeId,
      });
      setSession(forced.session);
      setLastGradingResult(forced.grading || null);
      setCurrentQuestion(forced.questionInstance || null);
      const event = {
        id: `path-force-${Date.now()}`,
        at: Date.now(),
        kind: 'forced-outcome',
        outcomeId,
        label: forced.grading?.skipped
          ? 'Skipped / abandoned'
          : forced.grading?.isCorrect ? 'Forced correct' : forced.grading?.questionFinalized ? 'Forced incorrect — finalized' : 'Forced incorrect attempt',
        detail: `${currentQuestion.teksCode || currentQuestion.alignmentKey || 'Path skill'} · ${before.summary?.completedQuestions || 0} → ${forced.session?.summary?.completedQuestions || 0} completed${forced.decision?.explanation ? ` · ${forced.decision.explanation}` : ''}`,
        isCorrect: forced.grading?.isCorrect === true,
        grading: forced.grading || null,
        decision: forced.decision || forced.session?.lastDecision || null,
        question: {
          questionInstanceId: currentQuestion.questionInstanceId,
          sourceBankQuestionId: currentQuestion.sourceBankQuestionId || null,
          teksCode: currentQuestion.teksCode || null,
          prompt: currentQuestion.tool?.prompt || currentQuestion.canonicalQuestion?.prompt || currentQuestion.prompt || '',
        },
        nextQuestion: forced.questionInstance ? {
          sourceBankQuestionId: forced.questionInstance.sourceBankQuestionId || null,
          teksCode: forced.questionInstance.teksCode || null,
        } : null,
        session: forced.session,
      };
      onSimulationEvent?.(event);
      return { ok: true, event };
    } catch (caught) {
      const reason = caught?.message || 'The simulator force action failed.';
      onSimulationEvent?.({
        id: `path-force-error-${Date.now()}`,
        at: Date.now(),
        kind: 'error',
        label: 'Simulator force action failed',
        detail: reason,
        isCorrect: null,
        question: {
          sourceBankQuestionId: currentQuestion.sourceBankQuestionId || null,
          teksCode: currentQuestion.teksCode || null,
        },
      });
      return { ok: false, reason };
    } finally {
      setSubmitting(false);
    }
  }, [session, currentQuestion, submitting, forceCurrentQuestionOutcome, onSimulationEvent]);

  useEffect(() => {
    if (!onSimulationController) return undefined;
    onSimulationController({
      canForce: Boolean(session && currentQuestion && typeof forceCurrentQuestionOutcome === 'function' && !submitting),
      session,
      question: currentQuestion ? {
        questionInstanceId: currentQuestion.questionInstanceId,
        sourceBankQuestionId: currentQuestion.sourceBankQuestionId || null,
        teksCode: currentQuestion.teksCode || null,
        alignmentKey: currentQuestion.alignmentKey || null,
        prompt: currentQuestion.tool?.prompt || currentQuestion.canonicalQuestion?.prompt || currentQuestion.prompt || '',
        attemptsUsed: currentQuestion.attemptsUsed || 0,
        attemptsAllowed: currentQuestion.attemptsAllowed || 0,
      } : null,
      forceOutcome: forceOutcomeFromSimulator,
    });
    return () => onSimulationController(null);
  }, [onSimulationController, session, currentQuestion, submitting, forceCurrentQuestionOutcome, forceOutcomeFromSimulator]);

  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#174ea6' }}>Loading your personalized path…</div>;
  if (error) return <div style={{ maxWidth: '560px', margin: '40px auto', padding: '22px', borderRadius: '10px', background: '#fce8e6', color: '#a50e0e', textAlign: 'center' }}><strong>My Math Path could not start</strong><p>{error}</p><button type="button" onClick={initializeSession} style={{ padding: '9px 15px' }}>Retry</button></div>;

  if (session?.status === 'completed' || session?.status === 'teacherSupportNeeded') {
    const paused = session.status === 'teacherSupportNeeded';
    return (
      <section style={{ maxWidth: '620px', margin: '36px auto', padding: '30px', border: '1px solid #dadce0', borderRadius: '12px', background: '#fff', textAlign: 'center' }}>
        <h1 style={{ color: '#202124' }}>{paused ? 'Practice paused' : 'Session complete!'}</h1>
        <p style={{ color: '#5f6368' }}>{paused ? (session.teacherMessage || 'Your progress is saved. Check in with your teacher before continuing this skill.') : `You completed ${session.summary?.completedQuestions || session.pathState?.counters?.questionsThisSession || 0} questions.`}</p>
        {!paused && <div style={{ margin: '18px 0', padding: '13px', borderRadius: '8px', background: '#e6f4ea', color: '#137333' }}><strong>{session.summary?.correctQuestions || 0}</strong> correct · <strong>{session.summary?.independentSuccesses || 0}</strong> independent successes</div>}
        <button type="button" onClick={onReturnToDashboard} style={{ padding: '11px 20px', border: 0, borderRadius: '7px', background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Return to My Math Path</button>
      </section>
    );
  }

  return <>{submissionError && <div role="alert" style={{ maxWidth: '760px', margin: '18px auto 0', padding: '11px 13px', borderRadius: '8px', background: '#fff4ce', color: '#7a4f00' }}>{submissionError}</div>}<PathSessionPlayer session={session} questionInstance={currentQuestion} lastGradingResult={lastGradingResult} isSubmitting={submitting} studentProfile={studentProfile} onSubmitAnswer={handleSubmitAnswer} /></>;
};

export default MyMathPathProductionContainer;
