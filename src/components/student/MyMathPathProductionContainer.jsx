import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as liveSessionService from '../../services/pathSessionService.js';
import { generateRuntimeUUID } from '../../utils/idUtils.js';
import PathSessionPlayer from './PathSessionPlayer.jsx';
import { explainStepForStudent } from '../../platform/path/pathSessionRouting.js';

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
  // The assessment the student pressed for, when they came from a CCMR
  // pathway. Presentation only — it never reaches the server, and it cannot
  // change which question is issued or how it is graded.
  assessmentFramework = null,
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
  const [configurationError, setConfigurationError] = useState(null);
  const [submissionError, setSubmissionError] = useState(null);
  const [lastGradingResult, setLastGradingResult] = useState(null);
  const [lastFeedback, setLastFeedback] = useState(null);
  const [lastSupport, setLastSupport] = useState(null);
  const [solutionReview, setSolutionReview] = useState(null);
  // Set when a question closes. The next question is NOT fetched automatically:
  // a review the student never sees is not a review, and auto-advancing past it
  // is how "show a meaningful solution" turns into "flash one for 300ms".
  const [awaitingContinue, setAwaitingContinue] = useState(false);
  const [routeNotice, setRouteNotice] = useState(null);
  const pendingSubmissionRef = useRef(null);
  const completionReportedRef = useRef(false);

  const clearAttemptState = () => {
    setLastGradingResult(null);
    setLastFeedback(null);
    setLastSupport(null);
    setSolutionReview(null);
    setAwaitingContinue(false);
  };

  const initializeSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConfigurationError(null);
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
      // A deployment that cannot reach the secure Path is a service problem,
      // not a mathematics problem, and it is said differently.
      if (caught?.isConfigurationError) setConfigurationError(caught.message);
      else setError(caught.message || 'Unable to load this My Math Path session.');
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

  // The banner that tells the student why the path changed direction. Built from
  // the same decision object the teacher's route trace is built from, so the two
  // cannot say different things.
  const decisionNotice = useMemo(() => {
    const decision = session?.lastDecision || null;
    if (!decision) return null;
    // The secure server composes the sentence itself, from the same function
    // used here, so a browser that is a release behind cannot show a student a
    // different explanation from the one the session recorded. When it is
    // absent — the Teacher Path Simulator runs the engine locally — the
    // sentence is composed from the decision.
    if (decision.studentMessage) {
      return {
        headline: decision.studentHeadline || null,
        message: decision.studentMessage,
        tone: decision.studentTone || 'return',
      };
    }
    return explainStepForStudent(decision);
  }, [session?.lastDecision]);

  const advanceToNextQuestion = useCallback(async () => {
    if (!session || session.status !== 'active') return;
    setAwaitingContinue(false);
    setSubmissionError(null);
    try {
      const next = await fetchNextSanitizedQuestion({ sessionId: session.sessionId });
      setCurrentQuestion(next.questionInstance);
      clearAttemptState();
      // The explanation is carried forward onto the question it explains, so a
      // student meeting a prerequisite reads why on that question's screen.
      setRouteNotice(decisionNotice);
    } catch (caught) {
      setSubmissionError(caught.message || 'The next question could not be loaded. Try again.');
    }
  }, [session, fetchNextSanitizedQuestion, decisionNotice]);

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
        // Accommodation delivery travels beside the support usage rather than
        // inside it: the server treats these as CLAIMS about what rendered,
        // and reconciles them against what the student is actually authorized
        // for before recording anything.
        supportsPresented: Array.isArray(supportUsage?.supportsPresented) ? supportUsage.supportsPresented : [],
        supportsUsed: Array.isArray(supportUsage?.supportsUsed) ? supportUsage.supportsUsed : [],
        // Only the canonical renderer supplies this, and only a runtime that
        // already holds the answer key accepts it. The secure server ignores
        // it and grades for itself.
        ...(grade ? { isCorrect: grade.isCorrect } : {}),
      });
      pendingSubmissionRef.current = null;
      setLastGradingResult(result.grading);
      setLastFeedback(result.feedback || null);
      setLastSupport(result.support || null);
      // Only ever set from what the server sent, and the server only sends it
      // once the question is closed.
      setSolutionReview(result.solutionReview || null);
      setSession(result.session);

      if (result.grading?.questionFinalized && result.session.status === 'active') {
        // Hold here so the review can be read. `advanceToNextQuestion` is what
        // fetches the next one, and the student presses the button.
        setAwaitingContinue(true);
      } else if (result.session.status === 'active') {
        setCurrentQuestion((current) => (current
          ? { ...current, attemptsUsed: result.grading?.attemptNumber ?? current.attemptsUsed }
          : current));
      } else {
        // Session finished. The review stays on screen; the completion panel
        // renders under it once the student continues.
        setAwaitingContinue(Boolean(result.solutionReview));
        if (!result.solutionReview) setCurrentQuestion(null);
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
        message: result.feedback?.message || '',
      };
    } catch (caught) {
      if (caught?.isConfigurationError) {
        setConfigurationError(caught.message);
        return null;
      }
      setSubmissionError(`Submission was not confirmed. Check your connection and press Check again — MathMaster reuses the same submission ID, so retrying cannot count your answer twice. ${caught.message || ''}`.trim());
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
      setLastFeedback(forced.feedback || null);
      setLastSupport(forced.support || null);
      setSolutionReview(forced.solutionReview || null);
      setCurrentQuestion(forced.questionInstance || null);
      // A forced outcome is a teacher stepping through the machine; it does not
      // pause for a student to read a review.
      setAwaitingContinue(false);
      setRouteNotice(explainStepForStudent(forced.decision || forced.session?.lastDecision || null));
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
        pathToolId: currentQuestion.pathToolId || null,
        familyId: currentQuestion.familyId || null,
        difficultyBand: currentQuestion.difficultyBand ?? null,
        dok: currentQuestion.dok ?? null,
        representation: currentQuestion.representation || null,
        attemptsUsed: currentQuestion.attemptsUsed || 0,
        attemptsAllowed: currentQuestion.attemptsAllowed || 0,
        // Teacher-facing selection provenance. The student's own UI never
        // renders any of this; it exists so "why this question?" is
        // answerable in the simulator without guessing.
        selectionReason: currentQuestion.selectionReason || null,
        contentQuality: currentQuestion.contentQuality || null,
        selectedTaskType: currentQuestion.selectedTaskType || currentQuestion.taskType || null,
        selectedBand: currentQuestion.selectedBand ?? currentQuestion.difficultyBand ?? null,
        preferredBand: currentQuestion.preferredBand ?? null,
        unusedFamiliesRemaining: currentQuestion.unusedFamiliesRemaining ?? null,
        isRepeatFamily: currentQuestion.isRepeatFamily ?? null,
        pathRole: currentQuestion.pathRole || currentQuestion.activityRole || null,
      } : null,
      forceOutcome: forceOutcomeFromSimulator,
    });
    return () => onSimulationController(null);
  }, [onSimulationController, session, currentQuestion, submitting, forceCurrentQuestionOutcome, forceOutcomeFromSimulator]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#174ea6' }}>Loading your personalized path…</div>;

  if (configurationError) {
    return (
      <section role="alert" style={{ maxWidth: 620, margin: '40px auto', padding: 24, borderRadius: 12, background: '#fff4ce', border: '1px solid #f0d489', color: '#7a4f00', textAlign: 'left' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 20, color: '#7a4f00' }}>My Math Path is not available right now</h1>
        <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
          This is a setup problem on the site, not a problem with your work. Nothing you have done has been lost.
          Please tell your teacher.
        </p>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#5f6368', lineHeight: 1.6 }}>{configurationError}</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={initializeSession}
            style={{ minHeight: 42, padding: '0 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onReturnToDashboard}
            style={{ minHeight: 42, padding: '0 16px', border: '1px solid #dadce0', borderRadius: 8, background: '#fff', color: '#3c4043', fontWeight: 800, cursor: 'pointer' }}
          >
            Back to My Math Path
          </button>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 560, margin: '40px auto', padding: 22, borderRadius: 10, background: '#fce8e6', color: '#a50e0e', textAlign: 'center' }}>
        <strong>My Math Path could not start</strong>
        <p>{error}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={initializeSession} style={{ minHeight: 42, padding: '9px 15px' }}>
            Retry
          </button>
          <button type="button" onClick={onReturnToDashboard} style={{ minHeight: 42, padding: '9px 15px' }}>
            Back to My Math Path
          </button>
        </div>
      </div>
    );
  }

  const sessionOver = session?.status === 'completed' || session?.status === 'teacherSupportNeeded';
  if (sessionOver && !awaitingContinue) {
    const paused = session.status === 'teacherSupportNeeded';
    return (
      <section style={{ maxWidth: 620, margin: '36px auto', padding: 30, border: '1px solid #dadce0', borderRadius: 12, background: '#fff', textAlign: 'center' }}>
        <h1 style={{ color: '#202124' }}>{paused ? 'Practice paused' : 'Session complete'}</h1>
        <p style={{ color: '#5f6368', lineHeight: 1.6 }}>
          {paused
            ? (session.teacherMessage || 'Your progress is saved. Check in with your teacher before continuing this skill.')
            : `You worked through ${session.summary?.completedQuestions || session.pathState?.counters?.questionsThisSession || 0} questions.`}
        </p>
        {!paused && (
          <div style={{ margin: '18px 0', padding: 13, borderRadius: 8, background: '#e6f4ea', color: '#137333', lineHeight: 1.6 }}>
            <strong>{session.summary?.correctQuestions || 0}</strong> right first time or after a retry ·{' '}
            <strong>{session.summary?.independentSuccesses || 0}</strong> of those on your own
          </div>
        )}
        <button type="button" onClick={onReturnToDashboard} style={{ minHeight: 44, padding: '11px 20px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Back to My Math Path</button>
      </section>
    );
  }

  return (
    <>
      {submissionError && (
        <div role="alert" style={{ maxWidth: 880, margin: '14px auto 0', padding: '11px 13px', borderRadius: 9, background: '#fff4ce', color: '#7a4f00', lineHeight: 1.55 }}>
          {submissionError}
        </div>
      )}
      <PathSessionPlayer
        session={session}
        questionInstance={currentQuestion}
        lastGradingResult={lastGradingResult}
        lastFeedback={lastFeedback}
        lastSupport={lastSupport}
        solutionReview={solutionReview}
        routeNotice={routeNotice}
        isSubmitting={submitting}
        assessmentFramework={assessmentFramework}
        studentProfile={studentProfile}
        onSubmitAnswer={handleSubmitAnswer}
        onContinue={awaitingContinue
          ? (session?.status === 'active' ? advanceToNextQuestion : () => { setAwaitingContinue(false); setCurrentQuestion(null); })
          : null}
      />
    </>
  );
};

export default MyMathPathProductionContainer;
