import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { questionCountText } from '../../platform/student/countText.js';
import * as liveSessionService from '../../services/pathSessionService.js';
import { generateRuntimeUUID } from '../../utils/idUtils.js';
import PathSessionPlayer from './PathSessionPlayer.jsx';
import { explainStepForStudent } from '../../platform/path/pathSessionRouting.js';
import { fetchQuestionWithContentReleaseRollover } from '../../platform/path/sessionContentReleaseRollover.js';
import { FRAMEWORK_LABELS } from '../../platform/ccmr/assessmentCrosswalk.js';
import { describeChallengeTier } from '../../platform/ccmr/assessmentFidelity.js';
import { responseClosesQuestion } from '../../platform/path/pathProgression.js';
import { coursePathLevelName } from '../../platform/path/pathPassPresentation.js';
import { PURPOSE_LABEL } from '../../platform/path/recommendationV2.js';
import { describeRetentionCheckOutcome } from '../../platform/retention/retentionCheckPresentation.js';
import { SESSION_END_STEP, chooseSessionEndNextStep } from '../../platform/path/pathSessionEnd.js';
import {
  SKILLS_UPDATE_PATIENCE_MS, describeSessionSkillsMoved, snapshotMasteryAtSessionStart,
} from '../../platform/mastery/sessionSkillMovement.js';
import { weeklyStartLabel } from './WeeklyPathGoalPanel.jsx';
import MyMathPathSessionRecap from './MyMathPathSessionRecap.jsx';
import MyMathPathSkillsMoved from './MyMathPathSkillsMoved.jsx';

const END_PRIMARY = { minHeight: 44, padding: '11px 20px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const END_SECONDARY = { minHeight: 44, padding: '11px 18px', border: '1px solid var(--mm-tint-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 850, cursor: 'pointer' };

// What the end screen leads with: the next weekly session when the week has
// one left (chooseSessionEndNextStep), and always the way back to the Path.
function SessionEndActions({ nextStep, onStartNext, onReturnToDashboard, showProgress = true }) {
  const startNext = nextStep?.kind === SESSION_END_STEP.START_NEXT_WEEKLY && typeof onStartNext === 'function';
  const next = startNext ? nextStep.nextSession : null;
  const done = startNext ? Math.max(0, Number(nextStep.required || 0) - Number(nextStep.remaining || 0)) : 0;
  return (
    <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
      {startNext && showProgress && nextStep.required > 0 && (
        <p style={{ margin: 0, color: 'var(--mm-text)', fontSize: 14, fontWeight: 750, lineHeight: 1.5 }}>
          {done} of {nextStep.required} weekly sessions done — {nextStep.remaining} to go.
          {next?.studentLabel || next?.teksCode ? <> Next up: <strong>{next.studentLabel || next.teksCode}</strong>.</> : null}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {startNext && (
          <button type="button" onClick={() => onStartNext(next)} style={END_PRIMARY}>
            {weeklyStartLabel(next, nextStep.nextInProgress, nextStep.required)}
          </button>
        )}
        <button type="button" onClick={onReturnToDashboard} style={startNext ? END_SECONDARY : END_PRIMARY}>Back to My Math Path</button>
      </div>
    </div>
  );
}

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
  // pathway. The secure server stores this on the session and selects only
  // directly-authored items for that framework; ordinary Path sessions keep
  // selecting ordinary course items.
  assessmentFramework = null,
  coursePracticeIntent = null,
  weekKey = null,
  weeklySlotKey = null,
  weeklySlot = null,
  // The alternative swapped into this weekly slot, if any. A label for the
  // server, which authorizes the launch against the frozen slot.
  chosenSkillId = null,
  intendedDok = null,
  intendedDifficultyBand = null,
  weeklyPurpose = null,
  weeklyGoalRequired = null,
  completesWeeklyGoal = false,
  studentProfile,
  sessionProvider = null,
  // The unified mastery profiles the Path renders from, and the live server
  // profile (the live app only; null in the simulator). "Skills that moved"
  // compares the two across this session.
  masteryProfilesByTEKS = null,
  liveServerMasteryProfiles = null,
  // The week once this session is counted (describeWeeklySessionEnd), and the
  // launcher for the next weekly session — null wherever launching is refused.
  weeklySessionEnd = null,
  onStartNextWeeklySession = null,
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
    fetchPathSessionRecap = null,
  } = provider;
  const [session, setSession] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [errorReason, setErrorReason] = useState(null);
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
  const [advancing, setAdvancing] = useState(false);
  const [routeNotice, setRouteNotice] = useState(null);
  const pendingSubmissionRef = useRef(null);
  const completionReportedRef = useRef(false);
  // How many times the student has pressed Retry on the SAME failure.
  //
  // A Retry button that reruns the identical failing call is the trap this
  // counter exists to end: the student presses it, sees the same message, and
  // has nowhere else to go. After a couple of honest attempts the screen stops
  // leading with Retry and leads with the way out instead.
  const [retryCount, setRetryCount] = useState(0);
  const [slowLoad, setSlowLoad] = useState(false);
  // Where the student's mastery stood when this session opened. Frozen at
  // mount — the container is keyed per launch — so "Skills that moved" is
  // measured from before the session, not from the last reload.
  const [masteryAtStart] = useState(() => snapshotMasteryAtSessionStart({
    masteryProfilesByTEKS,
    serverProfiles: liveServerMasteryProfiles,
  }));
  // What the session already held when it first loaded here. A resumed
  // session carries answers from before the break; "Skills that moved" waits
  // only for the answers given on this screen.
  const [evidenceAtLoad, setEvidenceAtLoad] = useState(null);
  const [recap, setRecap] = useState({ status: 'idle' });
  const [recapRequest, setRecapRequest] = useState(0);
  const [skillsPatienceExpired, setSkillsPatienceExpired] = useState(false);

  // One canonical launch description is reused for start and release rollover.
  // This is what keeps a frozen weekly slot, its assessment framework, and its
  // question-count contract intact if the assessment bank changes mid-session.
  const sessionLaunchConfig = useMemo(() => ({
    targetAlignmentKey,
    sessionKind,
    requiredQuestions,
    assessmentFramework,
    coursePracticeIntent,
    weekKey,
    weeklySlotKey,
    weeklySlot,
    // Forwarded by both runtimes, so a swapped weekly session is relaunched
    // as the same swap after a content-release rollover.
    chosenSkillId,
    // Synthetic Teacher Path Runtime consumes these. The live service
    // deliberately does not forward them to Firebase; production resolves
    // rigor from the frozen server weekly snapshot.
    intendedDok,
    intendedDifficultyBand,
    weeklyPurpose,
  }), [targetAlignmentKey, sessionKind, requiredQuestions, assessmentFramework, weekKey, weeklySlotKey, weeklySlot, chosenSkillId, intendedDok, intendedDifficultyBand, weeklyPurpose]);

  const contentRefreshNotice = {
    headline: 'Practice updated',
    message: 'This assessment was updated, so MathMaster started a fresh session for the same skill. Your earlier answers are still saved.',
    tone: 'return',
  };

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
    setErrorReason(null);
    setConfigurationError(null);
    setSubmissionError(null);
    completionReportedRef.current = false;
    try {
      const result = await startOrResumePathSession(sessionLaunchConfig);
      // A successful load clears the record of past failures, so a student who
      // hits one blip and recovers is not permanently shown the "this is not
      // working" screen.
      setRetryCount(0);
      setErrorReason(null);
      if (result.session.status === 'active') {
        const next = await fetchQuestionWithContentReleaseRollover({
          session: result.session,
          sessionConfig: sessionLaunchConfig,
          fetchNextSanitizedQuestion,
          startOrResumePathSession,
        });
        setSession(next.session);
        setCurrentQuestion(next.questionInstance);
        if (next.rolledOver) setRouteNotice(contentRefreshNotice);
      } else {
        setSession(result.session);
        setCurrentQuestion(null);
      }
    } catch (caught) {
      // A deployment that cannot reach the secure Path is a service problem,
      // not a mathematics problem, and it is said differently.
      setRetryCount((current) => current + 1);
      setErrorReason(caught?.reason || null);
      if (caught?.isConfigurationError) setConfigurationError(caught.message);
      else setError(caught.message || 'Unable to load this My Math Path session.');
    } finally {
      setLoading(false);
    }
  }, [sessionLaunchConfig, startOrResumePathSession, fetchNextSanitizedQuestion]);

  useEffect(() => { initializeSession(); }, [initializeSession]);

  // Loading should feel intentional, and a load that has clearly stalled should
  // hand the student an exit rather than a spinner they have to escape with the
  // browser's Back button.
  useEffect(() => {
    if (!loading) { setSlowLoad(false); return undefined; }
    const timer = setTimeout(() => setSlowLoad(true), 12000);
    return () => clearTimeout(timer);
  }, [loading]);

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
    if (!session || session.status !== 'active' || advancing) return;
    // IMPORTANT: awaitingContinue stays TRUE until the next question actually
    // arrives. The previous code cleared it before the network call, so one
    // failed request removed the student's Next button and stranded them.
    setSubmissionError(null);
    setAdvancing(true);
    try {
      const next = await fetchQuestionWithContentReleaseRollover({
        session,
        sessionConfig: sessionLaunchConfig,
        fetchNextSanitizedQuestion,
        startOrResumePathSession,
      });
      setSession(next.session);
      setCurrentQuestion(next.questionInstance);
      clearAttemptState();
      // The explanation is carried forward onto the question it explains, so a
      // student meeting a prerequisite reads why on that question's screen. A
      // content refresh gets its own plain-language explanation instead.
      if (next.rolledOver) setRouteNotice(contentRefreshNotice);
      else setRouteNotice(decisionNotice);
    } catch (caught) {
      // Leave awaitingContinue true. The same button becomes an explicit retry
      // rather than disappearing after a Wi-Fi/callable failure.
      setAwaitingContinue(true);
      setSubmissionError(caught.message || 'The next question could not be loaded. Try again.');
    } finally {
      setAdvancing(false);
    }
  }, [session, sessionLaunchConfig, fetchNextSanitizedQuestion, startOrResumePathSession, decisionNotice, advancing]);

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

      const questionClosed = responseClosesQuestion(result);
      if (questionClosed && result.session.status === 'active') {
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
        setAwaitingContinue(Boolean(result.solutionReview) || questionClosed);
        if (!result.solutionReview && !questionClosed) setCurrentQuestion(null);
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

  // THE RECAP IS ASKED FOR ONLY ONCE THE SESSION IS COMPLETED. Every item in it
  // is closed by then; the server refuses an active session regardless.
  const sessionCompleted = session?.status === 'completed';
  const completedSessionId = sessionCompleted ? session?.sessionId || null : null;
  useEffect(() => {
    if (!completedSessionId || typeof fetchPathSessionRecap !== 'function') return undefined;
    let cancelled = false;
    setRecap({ status: 'loading' });
    fetchPathSessionRecap({ sessionId: completedSessionId })
      .then((data) => { if (!cancelled) setRecap({ status: 'ready', data: data || {} }); })
      .catch((caught) => { if (!cancelled) setRecap({ status: 'error', message: caught?.message || null }); });
    return () => { cancelled = true; };
  }, [completedSessionId, fetchPathSessionRecap, recapRequest]);

  // The mastery trigger lands a moment after the last answer. Wait for it, but
  // not forever: after a while the screen says where the update will appear.
  useEffect(() => {
    if (!sessionCompleted) return undefined;
    const timer = setTimeout(() => setSkillsPatienceExpired(true), SKILLS_UPDATE_PATIENCE_MS);
    return () => clearTimeout(timer);
  }, [sessionCompleted]);

  useEffect(() => {
    if (session && evidenceAtLoad === null) setEvidenceAtLoad(session.evidenceBySkill || {});
  }, [session, evidenceAtLoad]);

  const skillsMoved = useMemo(() => describeSessionSkillsMoved({
    session,
    start: masteryAtStart,
    liveServerProfiles: liveServerMasteryProfiles,
    currentProfiles: masteryProfilesByTEKS,
    simulated: Boolean(sessionProvider),
    patienceExpired: skillsPatienceExpired,
    evidenceAtLoad,
  }), [session, masteryAtStart, liveServerMasteryProfiles, masteryProfilesByTEKS, sessionProvider, skillsPatienceExpired, evidenceAtLoad]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--mm-primary-text)' }}>
        <p style={{ margin: 0 }}>Loading your personalized path…</p>
        {/* A stalled load is not a state a student should have to escape with
            the browser's Back button. */}
        {slowLoad && (
          <div style={{ marginTop: 18 }}>
            <p style={{ margin: '0 0 12px', color: 'var(--mm-text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              This is taking longer than it should. Your work is safe — you can wait, or go back and try a different skill.
            </p>
            {onReturnToDashboard && <button
          type="button"
          onClick={onReturnToDashboard}
          style={{ minHeight: 44, padding: '11px 18px', border: '1px solid var(--mm-tint-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, cursor: 'pointer' }}
        >
          Back to My Math Path
        </button>}
          </div>
        )}
      </div>
    );
  }

  if (configurationError) {
    return (
      <section role="alert" style={{ maxWidth: 620, margin: '40px auto', padding: 24, borderRadius: 12, background: 'var(--mm-warning-soft)', border: '1px solid var(--mm-warning-border-soft)', color: 'var(--mm-warning-text)', textAlign: 'left' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 20, color: 'var(--mm-warning-text)' }}>My Math Path is not available right now</h1>
        <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
          This is a setup problem on the site, not a problem with your work. Nothing you have done has been lost.
          Please tell your teacher.
        </p>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--mm-text-muted)', lineHeight: 1.6 }}>{configurationError}</p>
        {/* THE TRAP THIS ENDS. Both error screens used to offer Retry and
            nothing else. A configuration problem does not fix itself between
            two clicks, so the student pressed Retry, saw the same message, and
            had no way back — the "trapped in an error state" failure exactly.
            The exit is always present; after two honest attempts it becomes the
            primary action, because by then Retry has been shown not to work. */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {retryCount < 2 && (
            <button type="button" onClick={initializeSession} style={{ minHeight: 44, padding: '0 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Try again</button>
          )}
          {onReturnToDashboard && <button
          type="button"
          onClick={onReturnToDashboard}
          style={{ minHeight: 44, padding: '11px 18px', border: '1px solid var(--mm-tint-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, cursor: 'pointer' }}
        >
          Back to My Math Path
        </button>}
        </div>
        {retryCount >= 2 && (
          <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--mm-warning-text)', lineHeight: 1.6 }}>
            Trying again has not helped, so this needs your teacher rather than another click. Everything else on your path is still open.
          </p>
        )}
      </section>
    );
  }

  const nextLevelUnavailable = errorReason === 'all-candidate-preparations-failed';
  const completedSessionError = /session is already complete|session is already completed/i.test(String(error || ''));

  if (nextLevelUnavailable || completedSessionError) {
    return (
      <section
        role="status"
        style={{
          maxWidth: 620,
          margin: '40px auto',
          padding: 24,
          borderRadius: 14,
          background: completedSessionError ? 'var(--mm-success-bg)' : 'var(--mm-warning-soft)',
          border: completedSessionError ? '2px solid #81c995' : '2px solid var(--mm-warning-border-soft)',
          color: completedSessionError ? 'var(--mm-success-text)' : 'var(--mm-warning-text)',
          textAlign: 'left',
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: 21, color: 'inherit' }}>
          {completedSessionError ? 'This practice round is already done' : 'Next level is temporarily unavailable'}
        </h1>
        <p style={{ margin: '0 0 10px', lineHeight: 1.65, color: 'var(--mm-text)' }}>
          {completedSessionError
            ? 'Your completed pass is saved. Return to My Math Path to see its completion badge and choose the next level or another open skill.'
            : 'Your earlier practice round is still done. MathMaster could not prepare a usable question for the next level, so it stopped instead of giving you broken or duplicate work.'}
        </p>
        {!completedSessionError && (
          <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--mm-warning-text)' }}>
            Your teacher can repair the affected question family in Path content coverage. This does not erase the level you already completed.
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {nextLevelUnavailable && retryCount < 2 && (
            <button type="button" onClick={initializeSession} style={{ minHeight: 44, padding: '0 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 850, cursor: 'pointer' }}>
              Try next level again
            </button>
          )}
          {onReturnToDashboard && (
            <button type="button" onClick={onReturnToDashboard} style={{ minHeight: 44, padding: '10px 16px', border: '1px solid var(--mm-border-strong)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 850, cursor: 'pointer' }}>
              Back to My Math Path
            </button>
          )}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <div role="alert" style={{ maxWidth: 560, margin: '40px auto', padding: 22, borderRadius: 10, background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', textAlign: 'left' }}>
        <strong style={{ display: 'block', marginBottom: 6 }}>This skill could not start</strong>
        <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>{error}</p>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--mm-warning-text)', lineHeight: 1.6 }}>
          Nothing you have done has been lost, and the rest of your path is still open.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {retryCount < 2 && (
            <button type="button" onClick={initializeSession} style={{ minHeight: 44, padding: '0 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Try again</button>
          )}
          {onReturnToDashboard && <button
          type="button"
          onClick={onReturnToDashboard}
          style={{ minHeight: 44, padding: '11px 18px', border: '1px solid var(--mm-tint-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, cursor: 'pointer' }}
        >
          Back to My Math Path
        </button>}
        </div>
      </div>
    );
  }

  const sessionOver = session?.status === 'completed' || session?.status === 'teacherSupportNeeded';
  if (sessionOver && !awaitingContinue) {
    const paused = session.status === 'teacherSupportNeeded';
    const directAssessment = Boolean(session?.assessmentFramework);
    const challengeTier = Math.max(1, Math.min(3, Number(session?.ccmrChallengeTier || 1)));
    const challenge = describeChallengeTier(challengeTier, session?.assessmentFramework);
    const completedCount = Math.max(1, Number(session?.summary?.completedQuestions || session?.requiredQuestions || 1));
    const sessionAccuracy = Number(session?.summary?.correctQuestions || 0) / completedCount;
    const independentRate = Number(session?.summary?.independentSuccesses || 0) / completedCount;
    const challengePassed = sessionAccuracy >= 0.8 && independentRate >= 0.6;
    // The week as it stands once THIS session is counted — by the server's
    // completion rule, so a paused session never reads as the goal met.
    const nextStep = chooseSessionEndNextStep({
      session,
      weeklyEnd: weeklySessionEnd,
      completesWeeklyGoal,
      canStartNext: typeof onStartNextWeeklySession === 'function',
    });
    const weeklyTargetReached = nextStep.kind === SESSION_END_STEP.WEEKLY_GOAL_COMPLETE;
    const goalSessions = nextStep.required || weeklyGoalRequired;
    const recapHasItems = recap.status === 'ready' && Array.isArray(recap.data?.items) && recap.data.items.length > 0;
    const weeklyPurposeLabel = session?.weeklySlotKey
      ? (PURPOSE_LABEL[session?.weeklyPurpose] || 'Weekly Path')
      : null;
    const courseChallengeIntent = !weeklyPurposeLabel
      && !directAssessment
      && session?.sessionKind !== 'retentionProbe'
      && session?.coursePracticeIntent === 'challenge';
    const coursePassLevel = !courseChallengeIntent && !weeklyPurposeLabel && !directAssessment && session?.sessionKind !== 'retentionProbe'
      ? Math.max(1, Math.min(3, Number(session?.coursePassLevel || 1)))
      : null;
    const coursePassName = coursePassLevel ? coursePathLevelName(coursePassLevel) : null;
    const nextCourseLevel = coursePassLevel && coursePassLevel < 3 ? coursePassLevel + 1 : null;
    // The server's verdict on a finished retention check, so the student learns
    // what it showed before the Path reloads with the moved schedule.
    const retentionVerdict = paused ? null : describeRetentionCheckOutcome(session);
    return (
      <div style={{ padding: '0 16px', boxSizing: 'border-box', width: '100%', minWidth: 0 }}>
      <section style={{
        maxWidth: 650, margin: '36px auto', padding: weeklyTargetReached ? 38 : 30,
        border: weeklyTargetReached ? '4px solid #58a96b' : '1px solid var(--mm-border)',
        borderRadius: 16,
        background: weeklyTargetReached ? 'linear-gradient(135deg, var(--mm-success-bg) 0%, var(--mm-warning-soft) 100%)' : 'var(--mm-surface)',
        textAlign: 'center',
        boxShadow: weeklyTargetReached ? '0 16px 46px rgba(19,115,51,.20)' : 'none',
      }}>
        {weeklyTargetReached && <div aria-hidden="true" style={{ fontSize: 54, lineHeight: 1, marginBottom: 8 }}>🎉</div>}
        {/* Sized here: the global h1 is 56px with no line height, so a
            two-line title ("Current learning complete", "Retention check
            complete") drew its lines on top of each other. */}
        <h1 style={{ color: weeklyTargetReached ? 'var(--mm-success-text)' : 'var(--mm-text-strong)', fontSize: weeklyTargetReached ? 'clamp(26px, 7vw, 32px)' : 'clamp(24px, 6vw, 30px)', lineHeight: 1.2, letterSpacing: '-0.3px', margin: '0 0 12px' }}>
          {weeklyTargetReached
            ? 'Weekly target reached!'
            : paused
              ? 'Practice paused'
              : directAssessment
                ? `${challenge.label} complete`
                : weeklyPurposeLabel
                  ? `${weeklyPurposeLabel} complete`
                  : courseChallengeIntent
                    ? 'Challenge complete'
                    : coursePassLevel
                    ? `Level ${coursePassLevel} complete`
                    : session?.sessionKind === 'retentionProbe'
                      ? `${PURPOSE_LABEL.retention} complete`
                      : 'Session complete'}
        </h1>
        {retentionVerdict && (
          <div role="status" style={{ margin: '0 auto 16px', maxWidth: 540, padding: '12px 14px', borderRadius: 10, background: retentionVerdict.passed ? 'var(--mm-success-bg)' : 'var(--mm-warning-bg)', color: retentionVerdict.passed ? 'var(--mm-success-text)' : 'var(--mm-warning-text)', lineHeight: 1.55, textAlign: 'left' }}>
            <strong style={{ display: 'block', marginBottom: 3 }}>{retentionVerdict.headline}</strong>
            {retentionVerdict.message}
          </div>
        )}
        {weeklyTargetReached && (
          <div style={{ margin: '0 auto 16px', maxWidth: 520, color: 'var(--mm-success-text)', fontSize: 16, fontWeight: 800, lineHeight: 1.55 }}>
            {goalSessions
              ? `You completed all ${goalSessions} of ${goalSessions} weekly Path sessions.`
              : 'You completed every assigned weekly Path session.'}
            {' '}Anything else you practise this week is extra.
          </div>
        )}
        {courseChallengeIntent && !paused && (
          <div style={{ margin: '0 auto 16px', maxWidth: 540, padding: '12px 14px', borderRadius: 10, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', lineHeight: 1.55 }}>
            <strong style={{ display: 'block', marginBottom: 3 }}>Ahead-of-class Challenge complete</strong>
            This session adds mastery evidence, but it does not advance the numbered Foundation → Deeper practice → Stretch practice levels for this skill.
          </div>
        )}
        {coursePassLevel && !paused && (
          <div style={{ margin: '0 auto 16px', maxWidth: 540 }}>
            <div style={{ display: 'inline-block', padding: '6px 11px', borderRadius: 999, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', fontSize: 12, fontWeight: 950, letterSpacing: '.04em', textTransform: 'uppercase' }}>
              ✓ Level {coursePassLevel} round done · {coursePassName}
            </div>
            <p style={{ margin: '10px 0 0', color: 'var(--mm-text)', fontSize: 14, lineHeight: 1.6 }}>
              {nextCourseLevel
                ? `This round is recorded on your Path card. Your next visit is Level ${nextCourseLevel} · ${coursePathLevelName(nextCourseLevel)}, with more demanding work.`
                : 'This Level 3 round is recorded on your Path card. If the mastery evidence is not complete yet, you can keep practising at this level without losing any completed rounds.'}
            </p>
          </div>
        )}
        {directAssessment && !paused && (
          <div style={{ display: 'inline-block', margin: '0 0 10px', padding: '5px 10px', borderRadius: 999, background: challengeTier >= 2 ? 'var(--mm-accent-soft)' : 'var(--mm-primary-soft)', color: challengeTier >= 2 ? 'var(--mm-accent-text)' : 'var(--mm-primary-text)', fontSize: 12, fontWeight: 900 }}>
            {FRAMEWORK_LABELS[session.assessmentFramework] || session.assessmentFramework} · {challenge.shortLabel}
          </div>
        )}
        <p style={{ color: 'var(--mm-text-muted)', lineHeight: 1.6 }}>
          {paused
            ? (session.teacherMessage || 'Your progress is saved. Check in with your teacher before continuing this skill.')
            : coursePassLevel
              ? `You completed ${questionCountText(session.summary?.completedQuestions || session.pathState?.counters?.questionsThisSession || 0)} in this practice round.`
              : `You worked through ${questionCountText(session.summary?.completedQuestions || session.pathState?.counters?.questionsThisSession || 0)}.`}
        </p>
        {!paused && (
          <div style={{ margin: '18px 0', padding: 13, borderRadius: 8, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', lineHeight: 1.6 }}>
            <strong>{session.summary?.correctQuestions || 0}</strong> right first time or after a retry ·{' '}
            <strong>{session.summary?.independentSuccesses || 0}</strong> of those on your own
          </div>
        )}
        {directAssessment && !paused && (
          <div style={{ margin: '0 0 18px', padding: 13, borderRadius: 9, background: challengePassed ? 'var(--mm-accent-soft)' : 'var(--mm-warning-bg)', color: challengePassed ? 'var(--mm-accent-text)' : 'var(--mm-warning-text)', lineHeight: 1.55, textAlign: 'left' }}>
            <strong style={{ display: 'block', marginBottom: 3 }}>
              {challengePassed
                ? challengeTier === 1
                  ? 'Harder challenge unlocked'
                  : challengeTier === 2
                    ? 'Advanced challenge unlocked'
                    : 'Assessment challenge complete'
                : 'Keep building this format'}
            </strong>
            {challengePassed
              ? challengeTier === 1
                ? 'The next time you choose this skill in this assessment, MathMaster will give you a shorter, harder set instead of repeating the direct-practice level.'
                : challengeTier === 2
                  ? 'The next set uses the highest-demand challenge families for this skill.'
                  : 'This skill will cool down in recommendations. It stays available for maintenance, but MathMaster will push other needs ahead of it.'
              : 'This set stays at the current level on your next visit so you can strengthen the assessment format before the difficulty rises.'}
          </div>
        )}
        <MyMathPathSkillsMoved skillsMoved={skillsMoved} />
        <SessionEndActions nextStep={nextStep} onStartNext={onStartNextWeeklySession} onReturnToDashboard={onReturnToDashboard} />
      </section>
      <MyMathPathSessionRecap recap={recap} onRetry={() => setRecapRequest((value) => value + 1)} />
      {/* A long review ends where it was read, with the same way on. */}
      {recapHasItems && (
        <div style={{ maxWidth: 650, margin: '-16px auto 40px' }}>
          <SessionEndActions nextStep={nextStep} onStartNext={onStartNextWeeklySession} onReturnToDashboard={onReturnToDashboard} showProgress={false} />
        </div>
      )}
      </div>
    );
  }

  return (
    <>
      {submissionError && (
        <div role="alert" style={{ maxWidth: 880, margin: '14px auto 0', padding: '11px 13px', borderRadius: 9, background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', lineHeight: 1.55 }}>
          {submissionError}
        </div>
      )}
      <PathSessionPlayer
        onExit={onReturnToDashboard}
        session={session}
        questionInstance={currentQuestion}
        lastGradingResult={lastGradingResult}
        lastFeedback={lastFeedback}
        lastSupport={lastSupport}
        solutionReview={solutionReview}
        routeNotice={routeNotice}
        isSubmitting={submitting}
        isAdvancing={advancing}
        continueLabel={submissionError && awaitingContinue ? 'Try next question again' : 'Next question'}
        assessmentFramework={assessmentFramework}
        weeklyGoalRequired={weeklyGoalRequired}
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
