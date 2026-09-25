import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHECKPOINT_DEBOUNCE_MS } from './platform/performance/responseCheckpoint.js';
import GraphLine from './GraphLine';
import NumberLine from './NumberLine';
import FractionGrader from './FractionGrader';
import LiteralGrader from './LiteralGrader';
import SystemGrader from './SystemGrader';
import TableGrader from './TableGrader';
import OrderedPairGrader from './OrderedPairGrader';
import MultiAnswerGrader from './MultiAnswerGrader';
import FunctionGraphBuilder from './FunctionGraphBuilder';
import GraphAnalysis from './GraphAnalysis';
import StepByStepAlgebra from './StepByStepAlgebra';
import LinearInterceptsOrchestrator from './LinearInterceptsOrchestrator';
import MultiRelationAlgebra from './MultiRelationAlgebra';
import {
  ALGEBRA_WORKSPACE_ROUTES,
  prepareQuestionForRuntimeRouting,
  resolveAlgebraWorkspaceRoute,
} from './platform/algebra/algebraWorkspaceRoute.js';
import ScratchpadOverlay from './ScratchpadOverlay';
import SolutionReview from './SolutionReview';
import ToolSolutionReview from './tools/shared/ToolSolutionReview';
import GuidedClassworkCoach from './GuidedClassworkCoach';
import RelationshipModel from './RelationshipModel';
import WorkflowRunner from './platform/workflow/WorkflowRunner';
import { readComposedQuestion } from './platform/workflow/questionWorkflow';
import { buildLiteralWorkspaceQuestion, usesLiteralWorkspace } from './literalWorkspace';
import GraphScenarioMatch from './GraphScenarioMatch';
import GraphComparison from './GraphComparison';
import GraphStory from './GraphStory';
import ContextInterpretation from './ContextInterpretation';
import MathDisplay from './MathDisplay';
import { generateQuestion } from './problemGenerator';
import { buildSupportUsage, getStudentSupportPresentation } from './studentSupport';
import { removeQuestionDraftFamily, resetQuestionDraftFamily } from './questionDraftStorage';
import CalculatorPanel from './components/CalculatorPanel';
import ProblemUnderstandingPanel from './components/ProblemUnderstandingPanel';
import MobileViewportContainer, { isMobileQuestionViewport } from './components/student/MobileViewportContainer';
import { normalizeContextualQuestion } from './platform/context/wordProblemLayer';
import { getEffectiveActivityPolicy } from './platform/policies/activityPolicies';
import { resolveCalculatorPolicy } from './platform/policies/calculatorPolicy';
import { getToolDefinition } from './tools/toolRegistry';
import { buildRawPathResponse } from './platform/path/pathToolResponses';
import { ToolRuntimeProvider } from './tools/shared/ToolRuntimeContext';
import { ToolDraftScopeProvider, forgetToolDrafts, stampToolDraftSubmission } from './tools/shared/usePersistentToolState.js';
import InteractiveModelingLabPlayer from './components/labs/InteractiveModelingLabPlayer.jsx';
import { useToast } from './ui/Toast';
import QuestionModuleBoundary from './QuestionModuleBoundary';
import StandardBadge from './components/common/StandardBadge.jsx';
import { questionAssessmentFramework } from './platform/student/questionAlignmentInfo.js';
import { normalizeQuestionStandards } from './questionMetadata';
import ReferenceInfoCard from './ReferenceInfoCard';
import { resolveReferenceInfo } from './referenceInfo';
import {
  getAttemptsRemaining,
  normalizeQuestionRecord,
  resolveQuestionMaximumAttempts,
} from './attemptPolicy';
import { stableStringify } from './utils/idUtils';
import { ENTER_TO_CONTINUE_HINT, focusFirstAnswerControl, shouldAdvanceOnEnter, shouldFocusAnswerOnOpen, shouldSubmitAnswerOnEnter } from './platform/interaction/answerEntryUx.js';
import { normalizeQuestionWeight } from './platform/grading/questionWeights.js';
import { resolveTaskContextPresentation } from './platform/workflow/taskContextPresentation.js';
import { WorkViewCapabilityProvider } from './platform/workView/workViewCapabilities.js';
import { WorkViewUndoProvider } from './platform/workView/useMathUndoHistory.js';
import { QuestionLifecycleProvider } from './platform/question/QuestionLifecycleContext.jsx';
import UniversalUndoButton from './components/common/UniversalUndoButton.jsx';
import EnlargeableFigure from './components/common/EnlargeableFigure.jsx';
import { startPerformanceSpan } from './platform/performance/performanceTelemetry.js';
import { useRenderPerformance } from './platform/performance/useRenderPerformance.js';

const WorkViewReadySignal = ({ span }) => {
  useEffect(() => {
    span?.finish({ status: 'interactive' });
  }, [span]);
  return null;
};

const EMPTY_ANSWER_STATE = {
  isComplete: false,
  isCorrect: false,
  responseKey: '',
  questionDetails: '',
  parts: [],
};

const MULTIPART_TYPES = new Set([
  'functionGraph',
  'functionInvestigation',
  'graphAnalysis',
  'table',
  'multiAnswer',
  'system',
  'stepAlgebra',
  'relationshipModel',
  'graphScenarioMatch',
  'graphComparison',
  'graphStory',
  'contextInterpretation',
  'modelingLab',
]);

// Firestore listeners and several teacher-authoring screens legitimately
// rebuild plain question objects even when the question itself has not
// changed. Tool workspaces reset when their `question` prop changes identity,
// so passing those fresh-but-equivalent objects through QuestionEngine used to
// erase whatever the teacher/student was typing or plotting.
//
// Keep the previous object identity while its CONTENT is the same. A real edit,
// variant change, or profile change still produces a new stable value and
// therefore still resets the workspace exactly once, as intended.
const useDeepStableValue = (value) => {
  const signature = stableStringify(value ?? null);
  const ref = useRef({ signature, value });
  if (ref.current.signature !== signature) ref.current = { signature, value };
  return ref.current.value;
};

const speakText = (text) => {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(String(text).replace(/[$\\]/g, ' ')));
};

export default function QuestionEngine({
  question,
  onGrade,
  onStepGrade,
  onRequestNewQuestion,
  onLoadScratchpad,
  onSaveScratchpad,
  generationKey,
  // The assignment-adaptation decision for this student and this question,
  // resolved by the caller so the generator and the evidence writer agree.
  // Null means "not adapted", which is what preview and every legacy
  // assignment pass.
  adaptation = null,
  questionRecord,
  maximumAttempts = null,
  teacherGrantedExtraAttempts = 0,
  attemptsDoNotExpire = false,
  draftKey = null,
  studentProfile = null,
  guidedMode = false,
  guidedNotesMode = 'automatic',
  assignmentLocked = false,
  assignmentLockedMessage = '',
  replacementWarning = '',
  dolMode = false,
  activityRole = 'practice',
  activityPolicy = null,
  feedbackReleased = false,
  assessmentContext = null,
  teacherCalculatorChoice = null,
  assignmentId = null,
  executionScope = 'student',
  showStandardBadge = true,
  onNextQuestion = null,
  nextQuestionLabel = '',
  nextQuestionSectionLabel = '',
  sectionComplete = false,
  sectionLabel = '',
  sectionQuestionCount = 0,
  onContinueSection = null,
  continueSectionLabel = '',
  // Secure server grading. When present, this question's verdict belongs to the
  // server: the engine collects the student's raw work, sends it, and displays
  // what comes back. Nothing the tools compute about correctness is reported as
  // the result, and the tools are told not to show a verdict of their own.
  //   { pathToolId, submit(rawWork, supportUsage, meta) -> feedback }
  serverGrading = null,
  onResponseStateChange = null,
  onResponseCheckpoint = null,
  onSpotlightFrame = null,
}) {
  useRenderPerformance('QuestionEngine', String(question?.toolId || question?.type || 'question'));
  const resolvedActivityPolicy = activityPolicy || getEffectiveActivityPolicy(activityRole);
  const showOutcomeFeedback = resolvedActivityPolicy?.feedback === 'immediate' || feedbackReleased === true;
  const stableQuestion = useDeepStableValue(question);
  const stableStudentProfile = useDeepStableValue(studentProfile);
  // Deep-stabilised like the profile: `adaptation` is rebuilt on every parent
  // render, so a raw object reference in the dependency list would regenerate
  // the question on every keystroke — and leaving it OUT would serve a stale
  // band after the student's evidence moves.
  const stableAdaptation = useDeepStableValue(adaptation);
  // ONE RUNTIME VIEW FOR EVERY HOST. The student assignment player repaired
  // stored questions before they got here; Teacher Question Review, library
  // and Path previews, Live Challenge and the demo did not, so a stored
  // `stepAlgebra2` intercept question opened the mature engine for a student
  // and a retired mini-solver for the teacher checking it. The repair is pure
  // and idempotent, so the player's already-repaired question passes through
  // unchanged (same identity).
  const serverGraded = Boolean(serverGrading);
  const runtimeQuestion = useMemo(
    () => prepareQuestionForRuntimeRouting(stableQuestion, { serverGraded }),
    [stableQuestion, serverGraded],
  );
  const processedQuestion = useMemo(
    () => normalizeContextualQuestion(generateQuestion(runtimeQuestion, generationKey, stableStudentProfile, stableAdaptation)),
    [runtimeQuestion, generationKey, stableStudentProfile, stableAdaptation],
  );
  // Which algebra workspace this question opens — decided once, by the same
  // React-free resolver the capability certification tests call.
  const algebraWorkspaceRoute = useMemo(
    () => resolveAlgebraWorkspaceRoute(processedQuestion),
    [processedQuestion],
  );
  const resolvedMaximumAttempts = resolveQuestionMaximumAttempts({
    question: processedQuestion,
    maximumAttempts,
    activityPolicy: resolvedActivityPolicy,
    teacherGrantedExtraAttempts,
  });
  // The primary standard this question is aligned to, for the badge beneath the
  // prompt. Read through the same normalizer the rest of the platform uses, so
  // a question aligned in any of the accepted shapes resolves the same way.
  const questionStandardCode = useMemo(
    () => normalizeQuestionStandards(processedQuestion).primary?.[0]?.code || '',
    [processedQuestion],
  );
  const questionAssessment = useMemo(
    () => questionAssessmentFramework(processedQuestion, assessmentContext),
    [processedQuestion, assessmentContext],
  );
  const questionGradeWeight = normalizeQuestionWeight(processedQuestion);
  const referenceInfo = useMemo(() => resolveReferenceInfo(processedQuestion), [processedQuestion]);
  const presentationQuestion = useMemo(
    () => (referenceInfo ? { ...processedQuestion, suppressScenarioDisplay: true } : processedQuestion),
    [processedQuestion, referenceInfo],
  );
  const referenceSpeechText = useMemo(
    () => [processedQuestion?.prompt, ...(referenceInfo?.statements || []).map((entry) => entry?.text)].filter(Boolean).join('. '),
    [processedQuestion?.prompt, referenceInfo],
  );
  const { confirm: confirmAction, toastInfo } = useToast();
  // Built once per question, not once per render. StepByStepAlgebra resets its
  // whole workspace when its `question` prop changes identity, so handing it a
  // freshly-built object on every render wiped the armed operation the instant
  // a student clicked it.
  const literalWorkspace = useMemo(
    () => (usesLiteralWorkspace(processedQuestion) ? buildLiteralWorkspaceQuestion(processedQuestion) : null),
    [processedQuestion],
  );
  // A composed question is defined by its workflow, not by its type name.
  const isComposed = useMemo(
    () => readComposedQuestion(processedQuestion).composed,
    [processedQuestion],
  );
  const missingToolDefinition = useMemo(
    // A malformed item can carry a toolId the registry doesn't know while its
    // `type` names a real tool; fall through to `type` rather than showing the
    // unsupported-question panel for a tool that exists.
    // A composed question never routes to the registry, and must not be treated
    // as a self-submitting tool either — it is submitted here like every other
    // question, so the tool lookup is skipped entirely.
    () => (isComposed
      ? null
      : getToolDefinition(processedQuestion?.toolId) || getToolDefinition(processedQuestion?.type)),
    [processedQuestion, isComposed],
  );
  const workViewSpan = useMemo(
    () => (missingToolDefinition ? startPerformanceSpan('workview_ready_ms', { toolId: missingToolDefinition.toolId }) : null),
    [missingToolDefinition],
  );
  const record = normalizeQuestionRecord(questionRecord);
  /*
   * WHEN THIS QUESTION WAS LAST REALLY ANSWERED.
   *
   * The precedence an unfinished draft has to respect: a newer submitted answer
   * outranks it. Read from the question record the platform already keeps —
   * never from anything a tool or a browser reports about its own freshness —
   * and 0 while the question has never been submitted, which is the common case
   * and leaves the draft entirely in charge.
   */
  const canonicalAnswerSavedAt = Date.parse(record.lastAttemptAt || '') || 0;
  const [answerState, setAnswerState] = useState(EMPTY_ANSWER_STATE);

  useEffect(() => {
    onSpotlightFrame?.({ question: processedQuestion, answerState });
  }, [answerState, processedQuestion, onSpotlightFrame]);
  const [feedback, setFeedback] = useState(null);
  const [lastSubmittedResponseKey, setLastSubmittedResponseKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlightRef = useRef(false);
  const [requesting, setRequesting] = useState(false);
  const [baseUndoController, setBaseUndoController] = useState(null);
  const [undoController, setUndoController] = useState(null);
  const [questionResetVersion, setQuestionResetVersion] = useState(0);
  const [resettingQuestion, setResettingQuestion] = useState(false);
  const [solverWorkspaceMode, setSolverWorkspaceMode] = useState('normal');
  const solverWorkspaceActive = solverWorkspaceMode !== 'normal';
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [scratchpadLoading, setScratchpadLoading] = useState(false);
  const previousSectionCompleteRef = useRef(Boolean(sectionComplete));
  const [sectionCompletionCelebrating, setSectionCompletionCelebrating] = useState(false);
  const questionEngineRef = useRef(null);
  const checkpointTimerRef = useRef(null);
  const checkpointWrittenRef = useRef(false);
  const checkpointPendingRef = useRef({ eligible: false, state: null });

  useEffect(() => {
    const wasComplete = previousSectionCompleteRef.current;
    previousSectionCompleteRef.current = Boolean(sectionComplete);
    if (wasComplete || !sectionComplete) return undefined;
    setSectionCompletionCelebrating(true);
    const timer = window.setTimeout(() => setSectionCompletionCelebrating(false), 1400);
    return () => window.clearTimeout(timer);
  }, [sectionComplete]);
  const [scratchpadDataUrl, setScratchpadDataUrl] = useState('');
  const [scratchpadPages, setScratchpadPages] = useState(null);
  const [unchangedConfirmOpen, setUnchangedConfirmOpen] = useState(false);
  const [scaffoldComplete, setScaffoldComplete] = useState(false);
  const [scaffoldMessage, setScaffoldMessage] = useState('');
  const [contextScaffoldComplete, setContextScaffoldComplete] = useState(false);
  const [contextScaffoldUsed, setContextScaffoldUsed] = useState(false);
  const [calculatorUsed, setCalculatorUsed] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [workflowGuidanceState, setWorkflowGuidanceState] = useState(null);
  const [workflowSubmissionReview, setWorkflowSubmissionReview] = useState(null);
  const workflowGuidanceQuestionKey = processedQuestion?.questionId
    ?? processedQuestion?.id
    ?? processedQuestion?.prompt
    ?? null;
  const currentWorkflowGuidance = workflowGuidanceState?.questionKey === workflowGuidanceQuestionKey
    ? workflowGuidanceState
    : null;
  const taskContextPresentation = resolveTaskContextPresentation({
    originalTaskPrompt: processedQuestion?.prompt || processedQuestion?.scenario,
    currentStagePrompt: currentWorkflowGuidance?.currentStagePrompt,
    composed: isComposed,
  });

  const supportPresentation = useMemo(
    () => processedQuestion?.supportPresentation || getStudentSupportPresentation(stableStudentProfile),
    [processedQuestion, stableStudentProfile],
  );
  const supportUsage = useMemo(
    () => buildSupportUsage(stableStudentProfile, stableQuestion),
    [stableStudentProfile, stableQuestion],
  );

  useEffect(() => {
    setAnswerState(EMPTY_ANSWER_STATE);
    setFeedback(null);
    setLastSubmittedResponseKey(record.lastResponseKey || '');
    setSubmitting(false);
    submissionInFlightRef.current = false;
    setRequesting(false);
    setBaseUndoController(null);
    setUndoController(null);
    setQuestionResetVersion(0);
    setResettingQuestion(false);
    setSolverWorkspaceMode('normal');
    setScratchpadOpen(false);
    setScratchpadDataUrl('');
    setScratchpadPages(null);
    setUnchangedConfirmOpen(false);
    setScaffoldComplete(false);
    setScaffoldMessage('');
    setContextScaffoldComplete(false);
    setContextScaffoldUsed(false);
    setCalculatorUsed(false);
    setCalculatorOpen(false);
    setHintUsed(false);
    setWorkflowSubmissionReview(null);
  }, [processedQuestion]);

  useEffect(() => {
    if (
      feedback?.isCorrect === false &&
      answerState.responseKey !== lastSubmittedResponseKey
    ) {
      setFeedback(null);
    }
  }, [answerState.responseKey, feedback, lastSubmittedResponseKey]);

  const registerUndo = useCallback((controller) => {
    setBaseUndoController(controller ? { ...controller, ownerId: 'current-tool' } : null);
  }, []);

  const remainingAttempts = getAttemptsRemaining(record, resolvedMaximumAttempts);
  const isCorrect = record.status === 'correct' || feedback?.status === 'correct';
  // An expired record is terminal only while the CURRENT policy still has no
  // attempts left. A teacher DOL grant raises the effective maximum, so the
  // same preserved record becomes editable again without deleting its history.
  const isExpired = remainingAttempts <= 0 && (record.status === 'expired' || feedback?.expired);
  const locked = Boolean(isCorrect || isExpired || assignmentLocked);
  const sameIncorrectResponse =
    record.status === 'attempted' &&
    Boolean(answerState.responseKey) &&
    answerState.responseKey === (record.lastResponseKey || lastSubmittedResponseKey);
  /*
   * DEADLINE RESPONSE CHECKPOINTING.
   *
   * ONE set of eligibility rules, obeyed by both the debounce and the page
   * lifecycle flush. They used to differ, and the difference was the bug: a
   * student who pressed Submit and then closed the tab had the cleanup handler
   * write a fresh checkpoint for work that was already an attempt, which the
   * deadline could then submit a second time.
   *
   * An INCOMPLETE or cleared response is checkpointed too — but only once this
   * question already has a checkpoint to supersede. That is what stops a
   * deleted answer from being auto-submitted: the later, empty revision
   * replaces the completed one rather than leaving it as the latest state.
   *
   * Nothing here waits on the network. The callback hands the revision to the
   * durable outbox and returns.
   */
  const responseAlreadySubmitted = Boolean(answerState.responseKey)
    && (answerState.responseKey === lastSubmittedResponseKey
      || answerState.responseKey === record.lastResponseKey);
  const checkpointAllowed = Boolean(onResponseCheckpoint)
    && !serverGrading
    && !locked
    // `submitting` is state and arrives a render later; the ref flips the
    // instant Submit is pressed. A pagehide in that gap must not checkpoint
    // work that is already becoming an attempt.
    && !submitting
    && !submissionInFlightRef.current
    && !responseAlreadySubmitted;
  const checkpointPending = checkpointAllowed
    && (Boolean(answerState.isComplete && answerState.responseKey) || checkpointWrittenRef.current);
  checkpointPendingRef.current = { eligible: checkpointPending, state: answerState };

  // A different question, variant or delivery starts its own checkpoint history.
  useEffect(() => {
    checkpointWrittenRef.current = false;
  }, [generationKey, draftKey]);

  const flushResponseCheckpoint = useCallback((reason) => {
    const { eligible, state } = checkpointPendingRef.current;
    if (!eligible || !state) return;
    checkpointWrittenRef.current = true;
    onResponseCheckpoint?.(state, { reason });
  }, [onResponseCheckpoint]);

  useEffect(() => {
    if (!checkpointPending) return undefined;
    window.clearTimeout(checkpointTimerRef.current);
    checkpointTimerRef.current = window.setTimeout(
      () => flushResponseCheckpoint('debounce'),
      CHECKPOINT_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(checkpointTimerRef.current);
  }, [answerState, checkpointPending, flushResponseCheckpoint]);

  // Read through a ref so the listener below can be registered ONCE.
  const flushCheckpointRef = useRef(flushResponseCheckpoint);
  flushCheckpointRef.current = flushResponseCheckpoint;

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    /*
     * REGISTERED ONCE, SO THE CLEANUP MEANS UNMOUNT.
     *
     * `onResponseCheckpoint` changes identity whenever the parent re-renders
     * with new grades. If this effect depended on it, React would tear down and
     * re-run it on ordinary state churn — and the cleanup flushes. That turns a
     * "the page is going away" signal into "something re-rendered", which is
     * not the same thing and can flush repeatedly while the student is still
     * working. The ref keeps the handler current without making the
     * SUBSCRIPTION depend on it.
     */
    const flush = () => flushCheckpointRef.current('page-lifecycle');
    const visibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
    // Mount/unmount only — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMultipart = MULTIPART_TYPES.has(processedQuestion?.type) || (answerState.parts || []).length > 1;
  const scaffoldRequired = Boolean(resolvedActivityPolicy?.remediationAllowed !== false && supportPresentation.inclusion && record.status === 'attempted' && record.attemptCount >= 2 && !locked && !scaffoldComplete);
  const contextScaffoldEnabled = Boolean(processedQuestion?.context?.scenario && processedQuestion?.context?.scaffold?.enabled !== false);
  const contextScaffoldRequired = contextScaffoldEnabled && !contextScaffoldComplete && !locked;
  const terminalFeedbackHidden = !showOutcomeFeedback && (isCorrect || isExpired);

  // Every ordinary assignment and canonical Path question passes through this
  // runtime. Focus the first real answer control once the question is ready —
  // unless doing so would open a keypad over work the student has not read, or
  // would point at one cell of a composed workspace as though it were the
  // answer. See shouldFocusAnswerOnOpen.
  useEffect(() => {
    if (locked || scaffoldRequired || contextScaffoldRequired) return undefined;
    if (!shouldFocusAnswerOnOpen({ composed: isComposed, narrowViewport: isMobileQuestionViewport() })) {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      focusFirstAnswerControl(questionEngineRef.current);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [processedQuestion, record.variantIndex, locked, scaffoldRequired, contextScaffoldRequired, isComposed]);

  // Two-step keyboard flow: Enter submits a complete single-line answer; after
  // the platform confirms it is correct, the NEXT Enter advances. Keeping the
  // advance listener at window level makes the shortcut reliable even after the
  // now-locked answer field loses focus. It never steals Enter from dialogs or
  // multiline editing.
  useEffect(() => {
    const nextAction = sectionComplete && typeof onContinueSection === 'function'
      ? onContinueSection
      : (!sectionComplete && typeof onNextQuestion === 'function' ? onNextQuestion : null);
    const canAdvance = Boolean(isCorrect && showOutcomeFeedback && nextAction && !scratchpadOpen && !unchangedConfirmOpen);
    if (!canAdvance || typeof window === 'undefined') return undefined;
    const handleAdvanceShortcut = (event) => {
      if (!shouldAdvanceOnEnter({ event, canAdvance })) return;
      event.preventDefault();
      event.stopPropagation();
      nextAction();
    };
    window.addEventListener('keydown', handleAdvanceShortcut, true);
    return () => window.removeEventListener('keydown', handleAdvanceShortcut, true);
  }, [isCorrect, showOutcomeFeedback, sectionComplete, onContinueSection, onNextQuestion, scratchpadOpen, unchangedConfirmOpen]);

  const calculatorPolicy = useMemo(() => resolveCalculatorPolicy({
    questionSpec: processedQuestion || {},
    activityPolicy: resolvedActivityPolicy,
    studentSupportProfile: studentProfile,
    teacherCalculatorChoice,
    assessmentContext,
  }), [processedQuestion, resolvedActivityPolicy, studentProfile, teacherCalculatorChoice, assessmentContext]);
  const calculatorUnavailableReason = calculatorPolicy?.reason || 'No calculator is allowed for this skill.';
  const handleCalculatorControl = () => {
    if (!calculatorPolicy?.available) {
      toastInfo('Calculator unavailable', calculatorUnavailableReason);
      return;
    }
    setCalculatorUsed(true);
    setCalculatorOpen((current) => !current);
  };
  const scaffold = processedQuestion?.scaffold || (processedQuestion?.type === 'stepAlgebra'
    ? { prompt: 'Let’s back up. What operation undoes multiplication?', options: ['Add', 'Divide'], correct: 'Divide' }
    : processedQuestion?.type === 'functionGraph' || processedQuestion?.type === 'functionInvestigation'
      ? { prompt: 'Before continuing, must a plotted point match both its x-coordinate and y-coordinate?', options: ['Yes', 'No'], correct: 'Yes' }
      : { prompt: 'Before continuing, should you revise the specific parts identified in the feedback?', options: ['Yes', 'No'], correct: 'Yes' });

  const attemptSupportUsage = () => ({
    ...supportUsage,
    hintUsed: Boolean(hintUsed),
    scaffoldUsed: Boolean(scaffoldComplete),
    contextScaffoldUsed: Boolean(contextScaffoldUsed),
    calculatorUsed: Boolean(calculatorUsed),
    isMathematicallyIndependent: !hintUsed && !scaffoldComplete,
  });

  // Secure callers sometimes need to finalize the work already on screen
  // (for example, at a synchronized round deadline). Publish only the same
  // canonical raw payload manual Submit uses; no browser verdict or step score
  // is included in this seam.
  useEffect(() => {
    if (!serverGrading || !onResponseStateChange) return;
    onResponseStateChange(buildRawPathResponse({
      pathToolId: serverGrading.pathToolId,
      answerState,
    }));
  }, [answerState, onResponseStateChange, serverGrading]);

  // The one place a server-graded attempt is sent. Returns the server's
  // feedback, or a refusal — never a locally computed verdict.
  const submitToServer = async (rawWork, meta = {}) => {
    if (!rawWork) {
      return {
        isCorrect: false,
        status: 'attempted',
        attemptCount: record.attemptCount,
        remainingAttempts,
        blocked: true,
        message: 'This question cannot be scored securely, so it was not submitted. Tell your teacher.',
      };
    }
    return (await serverGrading.submit(rawWork, attemptSupportUsage(), meta)) || null;
  };

  const performSubmit = async () => {
    if (!answerState.isComplete || submitting || submissionInFlightRef.current || locked) return;
    submissionInFlightRef.current = true;
    const localAckSpan = startPerformanceSpan('submit_local_ack_ms', {
      flow: serverGrading ? 'secure' : 'ordinary_assignment',
    });
    if (serverGrading) {
      setSubmitting(true);
      queueMicrotask(() => localAckSpan.finish({ status: 'acknowledged' }));
      setUnchangedConfirmOpen(false);
      setLastSubmittedResponseKey(answerState.responseKey ?? '');
      try {
        setFeedback(await submitToServer(
          buildRawPathResponse({ pathToolId: serverGrading.pathToolId, answerState }),
          { responseKey: answerState.responseKey ?? '', questionDetails: answerState.questionDetails },
        ));
      } finally {
        submissionInFlightRef.current = false;
        setSubmitting(false);
      }
      return;
    }
    setSubmitting(true);
    queueMicrotask(() => localAckSpan.finish({ status: 'acknowledged' }));
    setUnchangedConfirmOpen(false);
    setLastSubmittedResponseKey(answerState.responseKey ?? '');
    try {
      const result = await onGrade(
        answerState.isCorrect,
        answerState.questionDetails,
        answerState.parts || [],
        attemptSupportUsage(),
        answerState.responseKey ?? '',
        // Extensible metadata bag rather than a positional argument, so future
        // attempt facts can be added without re-threading every caller.
        // Self-grading tools report one score instead of per-part results.
        { partialCreditPercent: answerState.partialCreditPercent ?? null },
      );
      const nextFeedback = result || {
        isCorrect: answerState.isCorrect,
        status: answerState.isCorrect ? 'correct' : 'attempted',
        attemptCount: record.attemptCount + 1,
        remainingAttempts: Math.max(0, resolvedMaximumAttempts - record.attemptCount - 1),
        expired: !answerState.isCorrect && record.attemptCount + 1 >= resolvedMaximumAttempts,
        // `graded: false` marks a part whose correctness this tool cannot
        // judge — a table cell checked against the student's own function
        // rather than an answer key. Listing it as incorrect would tell a
        // student they got wrong something nobody here checked.
        incorrectParts: (answerState.parts || [])
          .filter((part) => part.graded !== false && !part.isCorrect)
          .map((part) => part.label),
      };
      setFeedback(nextFeedback);
      if (isComposed) {
        // Freeze the exact submitted responses and per-step verdicts. The live
        // answerState keeps changing as the student repairs work; without this
        // snapshot a newly edited response could inherit the old green/red
        // verdict. WorkflowRunner compares each current response with this
        // snapshot and marks edited steps "check again" until the next submit.
        setWorkflowSubmissionReview({
          responseKey: answerState.responseKey ?? '',
          parts: (answerState.parts || []).map((part) => ({ ...part })),
          isCorrect: nextFeedback?.isCorrect === true,
          attemptNumber: Number(nextFeedback?.attemptCount) || (record.attemptCount + 1),
        });
      }
    } finally {
      submissionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!answerState.isComplete || submitting || locked) return;
    if (sameIncorrectResponse && isMultipart) {
      setUnchangedConfirmOpen(true);
      return;
    }
    await performSubmit();
  };

  const handleMissingToolAction = async (type, payload = {}) => {
    // A hint revealed inside a tool is mathematical help, exactly like a hint
    // from the coach panel, so it has to reach the same support-usage record
    // that discounts mastery weight.
    if (type === 'HINT_USED') {
      setHintUsed(true);
      return;
    }
    if (type !== 'ATTEMPT_SUBMITTED' || submitting || locked) return;
    if (serverGrading) {
      // The registry tools already hand back the student's work in the shape
      // the contract grades. `payload.isCorrect` and `payload.score` are the
      // tool's own opinion and are not read here.
      setSubmitting(true);
      try {
        setFeedback(await submitToServer(payload?.response, { responseKey: JSON.stringify(payload?.response ?? {}) }));
      } finally {
        setSubmitting(false);
        // The work the student just submitted is current, not stale. Writing the
        // same values back keeps `toolDraftIsSuperseded` meaningful without
        // creating an attempt or touching a grade.
        stampToolDraftSubmission(draftKey);
      }
      return;
    }
    setSubmitting(true);
    try {
      const rawParts = payload?.metadata?.parts;
      const parts = Array.isArray(rawParts)
        ? rawParts.map((part, index) => ({
            id: part?.id || `part-${index + 1}`,
            label: part?.label || `Part ${index + 1}`,
            isComplete: part?.isComplete !== false,
            isCorrect: Boolean(part?.isCorrect),
            response: part?.response ?? '',
          }))
        : rawParts && typeof rawParts === 'object'
          ? Object.entries(rawParts).map(([id, value]) => ({ id, label: id, isComplete: true, isCorrect: Boolean(value), response: '' }))
          : [];
      const score = Number(payload?.score);
      const partialCreditPercent = Number.isFinite(score)
        ? Math.max(0, Math.min(100, Math.round((score <= 1 ? score * 100 : score))))
        : null;
      const responseKey = JSON.stringify(payload?.response ?? {});
      const details = `${missingToolDefinition?.label || 'Math tool'} response submitted.`;
      const result = await onGrade?.(
        Boolean(payload?.isCorrect),
        details,
        parts,
        attemptSupportUsage(),
        responseKey,
        { partialCreditPercent },
      );
      setFeedback(result || {
        isCorrect: Boolean(payload?.isCorrect),
        status: payload?.isCorrect ? 'correct' : record.attemptCount + 1 >= resolvedMaximumAttempts ? 'expired' : 'attempted',
        attemptCount: record.attemptCount + 1,
        remainingAttempts: Math.max(0, resolvedMaximumAttempts - record.attemptCount - 1),
        expired: !payload?.isCorrect && record.attemptCount + 1 >= resolvedMaximumAttempts,
        partialCredit: partialCreditPercent || 0,
      });
    } finally {
      setSubmitting(false);
      stampToolDraftSubmission(draftKey);
    }
  };

  const handleModelingLabGrade = async (evaluation) => {
    if (submitting || locked) return null;
    setSubmitting(true);
    try {
      const partialCreditPercent = Math.max(0, Math.min(100, Math.round(Number(evaluation?.compositeScore || 0) * 100)));
      const result = await onGrade?.(
        Boolean(evaluation?.isMastered),
        `Server-graded modeling lab · ${partialCreditPercent}% composite.`,
        [
          { id: 'modelAccuracy', label: 'Model accuracy', isComplete: true, isCorrect: Number(evaluation?.rubricBreakdown?.modelAccuracy || 0) >= 85 },
          { id: 'hypothesis', label: 'Hypothesis / experimental process', isComplete: true, isCorrect: Number(evaluation?.rubricBreakdown?.hypothesisCompleteness || 0) >= 85 },
          { id: 'justification', label: 'Written justification completion', isComplete: true, isCorrect: Number(evaluation?.rubricBreakdown?.writtenJustificationCompleteness || 0) >= 85 },
        ],
        attemptSupportUsage(),
        `lab:${processedQuestion?.labDefinition?.labId}:${partialCreditPercent}`,
        { partialCreditPercent },
      );
      setFeedback(result || {
        isCorrect: Boolean(evaluation?.isMastered),
        status: evaluation?.isMastered ? 'correct' : record.attemptCount + 1 >= resolvedMaximumAttempts ? 'expired' : 'attempted',
        attemptCount: record.attemptCount + 1,
        remainingAttempts: Math.max(0, resolvedMaximumAttempts - record.attemptCount - 1),
        expired: !evaluation?.isMastered && record.attemptCount + 1 >= resolvedMaximumAttempts,
        partialCredit: partialCreditPercent,
      });
      return result;
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestNewQuestion = async () => {
    if (!resolvedActivityPolicy?.allowReplacement || !onRequestNewQuestion || requesting) return;
    if (replacementWarning) {
      const proceed = await confirmAction({
        title: 'Start a new problem?',
        message: replacementWarning,
        confirmLabel: 'New problem',
      });
      if (!proceed) return;
    }
    setRequesting(true);
    try {
      removeQuestionDraftFamily(draftKey);
      // The stored entries are gone; drop the parsed copies too, or a
      // replacement that reuses this key could still be answered from the
      // previous variant's workspace.
      forgetToolDrafts(draftKey);
      setAnswerState(EMPTY_ANSWER_STATE);
      setFeedback(null);
      setLastSubmittedResponseKey('');
      setWorkflowSubmissionReview(null);
      await onRequestNewQuestion({ clearHistory: Boolean(dolMode), clearBest: Boolean(dolMode) });
    } finally {
      setRequesting(false);
    }
  };

  const handleResetQuestion = async () => {
    if (locked || resettingQuestion || submitting || requesting) return;

    const proceed = await confirmAction({
      title: 'Reset this question?',
      message: 'This clears all work on this question and returns every tool to its starting state. Your recorded attempts and grade history will not be erased.',
      confirmLabel: 'Reset question',
    });
    if (!proceed) return;

    setResettingQuestion(true);
    try {
      // Reset every nested draft (Step Algebra, intercept workflows, registry
      // tools, etc.) through the normal persistence channel so an older server
      // backup cannot resurrect the work on a later session/device.
      resetQuestionDraftFamily(draftKey);
      forgetToolDrafts(draftKey);

      // The attempt record is intentionally untouched. Reset means "start the
      // current workspace over", never "erase an attempt".
      setAnswerState(EMPTY_ANSWER_STATE);
      setFeedback(null);
      setLastSubmittedResponseKey(record.lastResponseKey || '');
      setWorkflowSubmissionReview(null);
      setWorkflowGuidanceState(null);
      setUnchangedConfirmOpen(false);
      setCalculatorOpen(false);

      // Drop stale Undo owners before remounting the response module. The new
      // tool registers its own fresh controller after it mounts.
      setBaseUndoController(null);
      setUndoController(null);
      setQuestionResetVersion((current) => current + 1);
    } finally {
      setResettingQuestion(false);
    }
  };

  const openScratchpad = async () => {
    if (scratchpadLoading) return;
    setScratchpadLoading(true);
    try {
      const saved = await onLoadScratchpad?.();
      setScratchpadDataUrl(saved?.dataUrl || '');
      // A record saved before pages existed carries only dataUrl, and the
      // overlay falls back to it. Nothing already saved needs migrating.
      setScratchpadPages(Array.isArray(saved?.pages) && saved.pages.length ? saved.pages : null);
      setScratchpadOpen(true);
    } finally {
      setScratchpadLoading(false);
    }
  };

  const saveScratchpad = async (pages, metadata) => {
    if (locked) return;
    const list = Array.isArray(pages) ? pages : [pages].filter(Boolean);
    await onSaveScratchpad?.(list, metadata);
    setScratchpadPages(list);
    setScratchpadDataUrl(list[0] || '');
  };

  // WHO MAY CHECK THEIR OWN GRAPH, DECIDED HERE AND NOT IN THE CONTENT.
  //
  // Checking a plotted point against the function is mathematical help, so it
  // follows the same permission as a hint: available while practising, absent
  // on a DOL. Deciding it from the section policy rather than from a question
  // field means an author cannot switch it on for an exit ticket, and a bank
  // question carried into a DOL loses it automatically.
  const selfCheckAllowed = resolvedActivityPolicy?.hintsAllowed !== false && !locked;

  const graphModuleProps = {
    selfCheckAllowed,
    // Reported exactly like a revealed hint, which is what discounts the
    // mastery weight through isMathematicallyIndependent.
    onSelfCheck: () => setHintUsed(true),
  };

  const commonModuleProps = {
    question: presentationQuestion,
    onStateChange: setAnswerState,
    onUndoStateChange: registerUndo,
    workspaceMode: solverWorkspaceMode,
    onWorkspaceModeChange: setSolverWorkspaceMode,
    feedback: showOutcomeFeedback ? feedback : null,
    draftKey,
    disabled: locked || scaffoldRequired || contextScaffoldRequired || submitting,
  };

  const renderModule = () => {
    if (!processedQuestion) return null;
    // A composed question is defined by its workflow, not by its type name, and
    // that beats every other route including the tool registry: a
    // relationMapping question that composes stages is a composition, while the
    // same type without one is still the standalone tool. A recipe expands into
    // a workflow, so `recipe: { ask: [...] }` and a hand-written workflow reach
    // the same runtime.
    if (isComposed) {
      return (
        <WorkflowRunner
          question={presentationQuestion}
          onStateChange={commonModuleProps.onStateChange}
          onProgressChange={(progress) => setWorkflowGuidanceState({
            ...progress,
            questionKey: workflowGuidanceQuestionKey,
          })}
          disabled={commonModuleProps.disabled}
          draftKey={draftKey}
          canonicalSavedAt={canonicalAnswerSavedAt}
          showPrompt={false}
          showStagePrompt={false}
          submissionReview={showOutcomeFeedback ? workflowSubmissionReview : null}
        />
      );
    }

    if (missingToolDefinition) {
      const Tool = missingToolDefinition.component;
      return (
        // Under server grading the tool must not render a verdict: it has no
        // answer key in its payload, so its own check would report "not yet"
        // for correct work. The server's result is shown below instead.
        <ToolRuntimeProvider
          showImmediateFeedback={showOutcomeFeedback && !serverGrading}
          questionTerminal={locked}
        >
          {/* THE REGISTRY TOOLS REACH THE PLATFORM UNDO BUTTON THROUGH HERE.
              Every other module is handed `onUndoStateChange` as a prop, but a
              registry tool is mounted with `questionData` and `onAction` and
              nothing else — which is why each of them grew a local Undo button
              beside its own controls, and no two of them took back the same
              amount of work. The channel is opened once, at the call site, and
              a tool joins it with `useMathUndoHistory`. */}
          {/* AND THIS IS WHERE THEIR UNFINISHED WORK SURVIVES LEAVING.
              The workspace is remounted on every navigation, so a value held in
              a tool's own `useState` is gone the moment the student presses
              Next. The registry tools adopt the `draftKey` seam through this
              provider: `usePersistentToolState` names a field, the platform
              decides where it lives, and the existing local-draft plus
              background workspace-sync layers carry it from there. A tool still
              knows nothing about Firestore.

              `canonicalSavedAt` is what stops a stale draft outranking a newer
              submitted answer — see `toolDraftIsSuperseded`. */}
          <ToolDraftScopeProvider draftKey={draftKey} canonicalSavedAt={canonicalAnswerSavedAt}>
            <Suspense fallback={<p role="status">Opening Work View…</p>}>
              <WorkViewReadySignal span={workViewSpan} />
              <Tool questionData={presentationQuestion} onAction={handleMissingToolAction} draftKey={draftKey} />
            </Suspense>
          </ToolDraftScopeProvider>
        </ToolRuntimeProvider>
      );
    }

    switch (processedQuestion.type) {
      case 'modelingLab':
        return <InteractiveModelingLabPlayer rawLabSpec={processedQuestion.labDefinition} assignmentId={assignmentId} executionScope={executionScope} supportUsage={supportUsage} disabled={commonModuleProps.disabled} onServerGraded={handleModelingLabGrade} />;
      case 'graphing':
        return <GraphLine {...commonModuleProps} />;
      case 'functionGraph':
      case 'functionInvestigation':
        return <FunctionGraphBuilder {...commonModuleProps} {...graphModuleProps} />;
      case 'graphAnalysis':
        return <GraphAnalysis {...commonModuleProps} {...graphModuleProps} />;
      case 'stepAlgebra':
        // The relation check runs first, so an inequality never reaches the
        // intercept orchestrator by accident (see algebraWorkspaceRoute.js).
        if (algebraWorkspaceRoute.route === ALGEBRA_WORKSPACE_ROUTES.RELATION) {
          return (
            <MultiRelationAlgebra
              {...commonModuleProps}
              workspaceActions={workspaceActions}
              questionRecord={record}
              onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
              attemptsDoNotExpire={attemptsDoNotExpire}
            />
          );
        }
        // linearIntercepts keeps its own conceptual zero-substitution stage,
        // but hands the actual one-variable solve to the SAME mature Step
        // Algebra engine as every other stepAlgebra question — never a
        // second, narrower mini-solver (issue #297). Old stored
        // `stepAlgebra2` questions are runtime-migrated onto `type:
        // "stepAlgebra"` (see assignmentRuntimeRepair.js), so they reach this
        // branch too.
        if (algebraWorkspaceRoute.route === ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS) {
          return (
            <LinearInterceptsOrchestrator
              key={draftKey || processedQuestion?.questionId || processedQuestion?.id || generationKey}
              {...commonModuleProps}
              questionRecord={record}
              onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
              maximumAttempts={resolvedMaximumAttempts}
              attemptsDoNotExpire={attemptsDoNotExpire}
            />
          );
        }
        return (
          <StepByStepAlgebra
            {...commonModuleProps}
            workspaceActions={workspaceActions}
            questionRecord={record}
            onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
            maximumAttempts={resolvedMaximumAttempts}
            attemptsDoNotExpire={attemptsDoNotExpire}
          />
        );
      case 'algebra':
        // Retired legacy answer-box solver. Older stored test assignments may
        // still carry the old type, so treat it as an alias for the balance
        // workspace instead of reviving the obsolete EquationGrader UI.
        return (
          <StepByStepAlgebra
            {...commonModuleProps}
            workspaceActions={workspaceActions}
            questionRecord={record}
            onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
            maximumAttempts={resolvedMaximumAttempts}
            attemptsDoNotExpire={attemptsDoNotExpire}
          />
        );
      case 'numberLine':
        return <NumberLine {...commonModuleProps} />;
      case 'fraction':
        return <FractionGrader {...commonModuleProps} />;
      case 'literal': {
        // Solving a formula for one of its letters is the same act as solving a
        // numeric equation, so a literal question may ask for the balance
        // workspace instead of a box to type the rearranged expression into.
        if (!literalWorkspace) return <LiteralGrader {...commonModuleProps} />;
        if (!literalWorkspace.question) {
          // Falling back silently would leave a question that asked for the
          // workspace quietly grading something else.
          return (
            <div>
              <LiteralGrader {...commonModuleProps} />
              <p style={{ margin: '12px auto 0', maxWidth: 680, color: '#7a4f00', fontSize: 13, lineHeight: 1.55 }}>
                This question asked to be solved on the balance workspace, but {literalWorkspace.reason}, so it is
                shown as a written answer instead.
              </p>
            </div>
          );
        }
        return (
          <StepByStepAlgebra
            {...commonModuleProps}
            workspaceActions={workspaceActions}
            question={literalWorkspace.question}
            questionRecord={record}
            onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
            maximumAttempts={resolvedMaximumAttempts}
            attemptsDoNotExpire={attemptsDoNotExpire}
          />
        );
      }
      case 'system':
        return <SystemGrader {...commonModuleProps} />;
      case 'table':
        return <TableGrader {...commonModuleProps} />;
      case 'orderedPair':
        return <OrderedPairGrader {...commonModuleProps} />;
      case 'multiAnswer':
        return <MultiAnswerGrader {...commonModuleProps} />;
      case 'relationshipModel':
        return <RelationshipModel {...commonModuleProps} />;
      case 'graphScenarioMatch':
        return <GraphScenarioMatch {...commonModuleProps} />;
      case 'graphComparison':
        return <GraphComparison {...commonModuleProps} />;
      case 'graphStory':
        return <GraphStory {...commonModuleProps} />;
      case 'contextInterpretation':
        return <ContextInterpretation {...commonModuleProps} />;
      case 'platformQuestionError':
        return (
          <div role="alert" style={{ padding: '22px 24px', margin: '0 auto', maxWidth: '640px', borderRadius: '12px', background: '#fef7e0', border: '1px solid #f9ab00', textAlign: 'left' }}>
            <h3 style={{ margin: 0, color: '#7a4f00' }}>This question is temporarily unavailable</h3>
            <p style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
              MathMaster could not prepare this question correctly. You can continue with the rest of the assignment; this item will not trap you on this screen.
            </p>
          </div>
        );
      default:
        // Batch A-D interactive tools never reach this switch: they resolve
        // through the shared registry above, so a new tool becomes
        // student-usable by registering it rather than by editing this switch.
        return (
          <div style={{ padding: '22px 24px', margin: '0 auto', maxWidth: '640px', borderRadius: '12px', background: 'var(--mm-warning-soft, #fef7e0)', border: '1px solid var(--mm-warning, #f9ab00)', textAlign: 'left' }}>
            <h3 style={{ margin: 0, color: 'var(--mm-warning-text, #7a4f00)' }}>This question could not be displayed</h3>
            <p style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
              It uses a question type this version of MathMaster does not know how to show. Nothing you did caused this and your grade is not affected — let your teacher know.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--mm-ink-muted, #5f6368)' }}>
              Details for your teacher: unsupported question type &ldquo;{String(processedQuestion.type)}&rdquo;.
            </p>
          </div>
        );
    }
  };

  const submitDisabled = !answerState.isComplete || submitting || locked || scaffoldRequired || contextScaffoldRequired;
  const shouldShowSubmit = !missingToolDefinition && processedQuestion?.type !== 'modelingLab' && processedQuestion?.type !== 'platformQuestionError' && (processedQuestion?.type !== 'stepAlgebra' || answerState.isComplete);
  const scratchpadQuestionDetails = answerState.questionDetails || processedQuestion?.prompt || 'Show your work for this question.';
  const partialPercent = Math.max(Number(record.bestPartialCredit) || 0, Number(feedback?.partialCredit) || 0);
  const expiredAlmost = isExpired && partialPercent >= 50;
  const formulaAnchor = processedQuestion?.formulaAnchor || processedQuestion?.formulaLatex || null;
  const heldFeedbackMessage = resolvedActivityPolicy?.feedback === 'teacherRelease'
    ? 'Your response is recorded. Your teacher will release correctness feedback.'
    : 'Your response is recorded. Correctness feedback is held until the activity feedback window opens.';

  const questionAlignmentPanel = showStandardBadge && questionStandardCode ? (
    <StandardBadge
      code={questionStandardCode}
      framework={questionAssessment.framework}
      domainId={questionAssessment.domainId}
      examStyle={questionAssessment.examStyle}
      assessmentSkillLabel={processedQuestion?.ccmrAuthenticLanguage?.officialSkillFamily || ''}
      style={{ margin: '8px 0 0', maxWidth: '860px' }}
    />
  ) : null;

  const questionReferencePanel = referenceInfo
    ? <ReferenceInfoCard referenceInfo={referenceInfo} />
    : null;

  const guidedCoachEnabled = resolvedActivityPolicy?.hintsAllowed !== false
    && guidedNotesMode !== 'off'
    && (guidedMode || supportPresentation.visualChunking);
  const guidedCoach = (
    <GuidedClassworkCoach
      question={processedQuestion}
      draftKey={draftKey}
      enabled={guidedCoachEnabled}
      mode={guidedNotesMode}
      activeStageId={workflowGuidanceState?.currentStageId || null}
      workflowProgress={workflowGuidanceState}
      disabled={locked}
    />
  );
  const submitLabel = submitting
    ? 'Checking…'
    : processedQuestion?.type === 'stepAlgebra'
      ? 'Submit Solved Equation'
      : record.attemptCount > 0
        ? 'Submit Another Attempt'
        : 'Submit Answer';
  const workspaceActions = {
    undo: {
      label: '↶ Undo',
      onClick: () => undoController?.onUndo?.(),
      disabled: !undoController?.canUndo || locked,
      title: undoController?.label || 'Undo the most recent response change',
    },
    reset: {
      label: resettingQuestion ? 'Resetting…' : '↺ Reset Question',
      shortLabel: resettingQuestion ? 'Resetting…' : '↺ Reset',
      onClick: handleResetQuestion,
      disabled: locked || resettingQuestion || submitting || requesting,
      title: 'Clear this question\'s work and return every tool to its starting state',
    },
    scratchpad: {
      label: scratchpadLoading ? 'Opening…' : '✎ Scratchpad',
      onClick: openScratchpad,
      disabled: scratchpadLoading,
      title: 'Open the scratchpad without covering the solver controls',
    },
    calculator: {
      label: calculatorPolicy?.available ? '🧮 Calculator' : '🚫 🧮 Calculator',
      onClick: handleCalculatorControl,
      disabled: false,
      title: calculatorPolicy?.available ? 'Open the calculator' : calculatorUnavailableReason,
      unavailable: !calculatorPolicy?.available,
    },
    help: guidedCoachEnabled ? {
      label: 'Help',
      content: guidedCoach,
    } : null,
    submit: !locked && shouldShowSubmit ? {
      label: submitLabel,
      onClick: handleSubmit,
      disabled: submitDisabled,
      title: 'Submit this completed question',
    } : null,
  };

  // UNDO BELONGS WHERE THE HANDS ARE. These lived in a centred row above the
  // tool, which meant that on any question tall enough to scroll — which is most
  // graph questions — the student was several screens away from the control that
  // takes back the arrow they just drew. The work bar keeps them beside the
  // submit button at the bottom of the viewport instead.
  const questionWorkBar = (
    <>
      {!scratchpadOpen ? <UniversalUndoButton controller={undoController} disabled={locked} style={{ minHeight: '44px', padding: '9px 14px', borderRadius: '999px', border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 'bold', cursor: undoController?.canUndo && !locked ? 'pointer' : 'not-allowed', opacity: undoController?.canUndo && !locked ? 1 : 0.45 }} /> : null}
      {!scratchpadOpen ? (
        <button
          type="button"
          onClick={handleResetQuestion}
          disabled={workspaceActions.reset.disabled}
          title={workspaceActions.reset.title}
          aria-label={resettingQuestion ? 'Resetting…' : 'Reset Question'}
          style={{ minHeight: '44px', padding: '9px 14px', borderRadius: '999px', border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 'bold', cursor: workspaceActions.reset.disabled ? 'not-allowed' : 'pointer', opacity: workspaceActions.reset.disabled ? 0.45 : 1 }}
        >
          {/* "Question" drops on a phone so the work bar fits one row. */}
          {resettingQuestion ? 'Resetting…' : <>↺ Reset<span className="mathmaster-action-label-long"> Question</span></>}
        </button>
      ) : null}
      <button type="button" onClick={openScratchpad} disabled={scratchpadLoading} style={{ minHeight: '44px', padding: '9px 14px', borderRadius: '999px', border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 'bold', cursor: 'pointer' }}>
        {scratchpadLoading ? 'Opening…' : locked ? '✎ Scratchpad' : '✎ Scratchpad'}
      </button>
      <button
        type="button"
        onClick={handleCalculatorControl}
        aria-expanded={calculatorPolicy?.available ? calculatorOpen : false}
        aria-disabled={!calculatorPolicy?.available}
        aria-label={calculatorPolicy?.available ? 'Calculator' : `Calculator unavailable. ${calculatorUnavailableReason}`}
        title={calculatorPolicy?.available ? 'Open the calculator' : calculatorUnavailableReason}
        style={{
          minHeight: '44px',
          padding: '9px 14px',
          borderRadius: '999px',
          border: calculatorPolicy?.available ? '1px solid #c5d5ef' : '1px solid #d7a5a1',
          background: calculatorPolicy?.available && calculatorOpen ? '#eef4ff' : calculatorPolicy?.available ? '#fff' : '#fce8e6',
          color: calculatorPolicy?.available ? '#174ea6' : '#8c1d18',
          fontWeight: 'bold',
          cursor: 'pointer',
          opacity: calculatorPolicy?.available ? 1 : 0.9,
        }}
      >
        {calculatorPolicy?.available ? '🧮 Calculator' : '🚫 🧮 Calculator'}
      </button>
      {supportPresentation.textToSpeech && (
        <button type="button" onClick={() => speakText(referenceSpeechText)} style={{ minHeight: '44px', padding: '9px 14px', borderRadius: '999px', border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 'bold', cursor: 'pointer' }}>🔊 Read</button>
      )}
    </>
  );

  const questionContextPanel = (
    <div className="mathmaster-question-context-panel">
      {/* ONE LINE, NOT TWO SAYING THE SAME THING.
          This panel used to read "3 attempts on this question" on the left and
          "Variant 1 · 3 of 3 attempts remaining" on the right — the same fact
          twice, in a full-width box, above every question. The variant number
          is a content-authoring detail no student can act on, so it is gone from
          the student's view entirely; the remaining-attempts count is the part
          that changes their decision and is all that is left. */}
      {!supportPresentation.declutter && (
        <div
          role="status"
          className="mathmaster-question-attempt-strip"
          style={{
            border: `1px solid ${assignmentLocked && !terminalFeedbackHidden && record.status !== 'correct' && !isExpired ? '#9aa0a6' : terminalFeedbackHidden ? '#c9d6e8' : (record.status === 'attempted' || (record.status === 'expired' && !isExpired)) ? '#f9ab00' : isExpired ? '#e0b4b0' : record.status === 'correct' ? '#a8dab5' : '#d9e2f1'}`,
            background: terminalFeedbackHidden ? '#f4f7fb' : (record.status === 'attempted' || (record.status === 'expired' && !isExpired)) ? '#fef7e0' : isExpired ? '#fce8e6' : record.status === 'correct' ? '#e6f4ea' : '#f8fbff',
            color: '#3c4043',
          }}
        >
          <strong>
            {terminalFeedbackHidden
              ? 'Response submitted'
              : record.status === 'correct'
                ? 'Question complete'
                : isExpired
                  ? 'This question is closed'
                  // A locked question (Warm-Up after the period, closed section,
                  // ended DOL) rendered every control disabled under "3 of 3
                  // tries left"; the reason sat ~1470px below, past the tool
                  // (live QA, 1536×900). The reason belongs where the student
                  // lands.
                  : assignmentLocked
                    ? (assignmentLockedMessage || 'This assignment is closed. Your saved response is available for review.')
                    : `${remainingAttempts} of ${resolvedMaximumAttempts} ${resolvedMaximumAttempts === 1 ? 'try' : 'tries'} left`}
          </strong>
          {terminalFeedbackHidden && <span className="mathmaster-attempt-detail">Feedback opens later</span>}
          {!terminalFeedbackHidden && record.bestPartialCredit > 0 && record.status !== 'correct' && (
            <span className="mathmaster-attempt-detail">{record.bestPartialCredit}% partial credit so far</span>
          )}
        </div>
      )}

      {dolMode && <div style={{ margin: '0 auto 12px', maxWidth: '860px', padding: '10px 14px', borderRadius: '10px', background: '#f3e8fd', color: '#681da8', fontWeight: 900 }}>DOL question · this question records the daily DOL grade during the active class window.</div>}
      {questionGradeWeight !== 1 && (
        <div style={{ margin: '0 auto 12px', maxWidth: '860px', padding: '9px 13px', borderRadius: '10px', background: '#e8f0fe', color: '#174ea6', fontWeight: 900 }}>
          Grade weight ×{questionGradeWeight} · this question contributes {questionGradeWeight} times a standard-weight question to the assignment grade.
        </div>
      )}

      {formulaAnchor && supportPresentation.inclusion && (
        <aside style={{ position: 'sticky', top: '8px', zIndex: 4, margin: '0 0 12px auto', width: 'fit-content', maxWidth: '100%', padding: '10px 14px', borderRadius: '10px', background: '#fff4ce', border: '1px solid #f9ab00', color: '#5f4400', boxShadow: '0 4px 12px rgba(95,68,0,0.12)' }}>
          <strong style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Formula anchor</strong>
          <MathDisplay value={formulaAnchor} format="latex" />
        </aside>
      )}

      {contextScaffoldEnabled && !contextScaffoldComplete && !locked && (
        <ProblemUnderstandingPanel
          context={processedQuestion.context}
          onScaffoldComplete={() => {
            setContextScaffoldUsed(true);
            setContextScaffoldComplete(true);
          }}
        />
      )}
      {contextScaffoldEnabled && !referenceInfo && (contextScaffoldComplete || locked) && (
        <aside style={{ maxWidth: '860px', margin: '0 auto 18px', padding: '12px 15px', border: '1px solid #c5d5ef', borderRadius: '10px', background: '#f8fbff', textAlign: 'left', color: '#3c4043' }}>
          <strong style={{ color: '#174ea6' }}>Context:</strong> {processedQuestion.context.scenario}
        </aside>
      )}

    </div>
  );

  return (
    <QuestionLifecycleProvider terminal={locked}>
    <WorkViewUndoProvider register={setUndoController} baseController={baseUndoController} resetKey={`${processedQuestion?.questionId ?? processedQuestion?.id ?? processedQuestion?.prompt ?? 'question'}|${questionResetVersion}`}>
    <div
      ref={questionEngineRef}
      className={`mathmaster-question-engine mathmaster-question-engine-has-anchor ${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      onKeyDownCapture={(event) => {
        // Enter activates the one primary Check/Submit action only after the
        // response is complete. Incomplete multi-step tools and textareas retain
        // their own Enter behavior. Capturing here also works for MathLive.
        if (!shouldSubmitAnswerOnEnter({
          event,
          responseComplete: answerState.isComplete,
          canSubmit: shouldShowSubmit && !submitDisabled,
        })) return;
        event.preventDefault();
        event.stopPropagation();
        handleSubmit();
      }}
      style={{ position: 'relative', padding: '10px', textAlign: 'center', fontFamily: 'sans-serif', overflow: 'visible' }}
    >
      <MobileViewportContainer
        originalTaskPrompt={processedQuestion?.prompt || processedQuestion?.scenario || 'Complete the math task.'}
        currentStagePrompt={taskContextPresentation.currentStagePrompt}
        taskMeta={questionAlignmentPanel}
        taskContextPanel={questionReferencePanel}
        contextPanel={solverWorkspaceActive ? null : questionContextPanel}
        workspaceMode={solverWorkspaceMode}
        workBar={questionWorkBar}
        toolWorkspace={(
      <WorkViewCapabilityProvider capabilities={{
        undo: { label:workspaceActions.undo.label, onAction:workspaceActions.undo.onClick, disabled:workspaceActions.undo.disabled, title:workspaceActions.undo.title },
        task: { text:processedQuestion?.prompt || processedQuestion?.scenario || 'Complete the math task.', authoritative:true },
        help: workspaceActions.help || {
          label: 'Help',
          text: 'Use the task directions and the controls in this workspace. Your mathematical work stays in place when you open or close Work View.',
        },
        instruction: taskContextPresentation.currentStagePrompt ? { text:taskContextPresentation.currentStagePrompt } : null,
        primaryActions: workspaceActions.submit ? [{ ...workspaceActions.submit, onAction:workspaceActions.submit.onClick }] : [],
        secondaryActions: [
          { ...workspaceActions.reset, onAction:workspaceActions.reset.onClick },
          { ...workspaceActions.scratchpad, onAction:workspaceActions.scratchpad.onClick },
          ...(workspaceActions.calculator ? [{ ...workspaceActions.calculator, onAction:workspaceActions.calculator.onClick }] : []),
        ],
      }}>
      <EnlargeableFigure
        label="Question Work View"
        enlargeLabel="Enlarge question"
        presentationKey={processedQuestion?.questionId ?? processedQuestion?.id ?? processedQuestion?.prompt ?? null}
        forceClosed={locked}
        style={{ width: '100%' }}
      >
      <div
        className="mathmaster-question-tool-workspace"
        data-algebra-route={algebraWorkspaceRoute.route}
        data-algebra-engine={algebraWorkspaceRoute.engine || undefined}
        style={{ position: 'relative' }}
      >
        {!solverWorkspaceActive && guidedCoach}
        <fieldset disabled={locked || scaffoldRequired || contextScaffoldRequired || submitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div aria-disabled={locked || scaffoldRequired || contextScaffoldRequired || submitting ? 'true' : undefined} inert={locked || scaffoldRequired || contextScaffoldRequired || submitting ? '' : undefined} style={{ pointerEvents: locked || scaffoldRequired || contextScaffoldRequired || submitting ? 'none' : 'auto', opacity: locked ? 0.72 : scaffoldRequired || contextScaffoldRequired ? 0.5 : 1 }}>
            <QuestionModuleBoundary
              key={`${generationKey}|${record.variantIndex}|reset-${questionResetVersion}`}
              questionType={processedQuestion?.type}
              resetKey={`${generationKey}|${record.variantIndex}|reset-${questionResetVersion}`}
            >
              {renderModule()}
            </QuestionModuleBoundary>
          </div>
        </fieldset>

        {scaffoldRequired && (
          <div role="dialog" aria-modal="true" aria-label="Productive struggle scaffold" style={{ position: 'absolute', inset: 0, zIndex: 35, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(232,240,254,0.78)' }}>
            <div style={{ width: 'min(560px, 94%)', padding: '24px', borderRadius: '16px', background: '#fff', border: '3px solid #1a73e8', boxShadow: '0 20px 55px rgba(26,115,232,0.25)', textAlign: 'left' }}>
              <div style={{ fontSize: '12px', fontWeight: 900, color: '#174ea6', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Let&apos;s back up</div>
              <h2 style={{ margin: '8px 0 16px', color: '#202124' }}>{scaffold.prompt}</h2>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(scaffold.options || []).map((option) => (
                  <button key={option} type="button" onClick={() => { if (String(option) === String(scaffold.correct)) { setScaffoldComplete(true); setScaffoldMessage(''); } else setScaffoldMessage('Try the other choice. This support step does not use an attempt.'); }} style={{ padding: '11px 18px', borderRadius: '9px', border: '1px solid #aecbfa', background: '#e8f0fe', color: '#174ea6', fontWeight: 900, cursor: 'pointer' }}>{option}</button>
                ))}
              </div>
              {scaffoldMessage && <p style={{ margin: '14px 0 0', color: '#b3261e', fontWeight: 'bold' }}>{scaffoldMessage}</p>}
            </div>
          </div>
        )}

        {isCorrect && showOutcomeFeedback && (
          <div aria-label="Correct answer" role="status" style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'rgba(230,244,234,0.10)' }}>
            <div style={{ transform: 'rotate(-8deg)', textAlign: 'center', color: 'rgba(24,128,56,0.16)', textShadow: '0 2px 18px rgba(24,128,56,0.12)' }}>
              <div style={{ fontSize: 'clamp(120px, 24vw, 250px)', fontWeight: 900, lineHeight: 0.72 }}>✓</div>
              <div style={{ fontSize: 'clamp(42px, 8vw, 92px)', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Correct</div>
            </div>
          </div>
        )}

        {isExpired && showOutcomeFeedback && (
          <div
            aria-label={expiredAlmost ? 'Almost' : 'Incorrect'}
            role="status"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 30,
              pointerEvents: 'none',
              padding: '8px 12px',
              borderRadius: '999px',
              border: `2px solid ${expiredAlmost ? '#f9ab00' : '#d93025'}`,
              background: expiredAlmost ? 'rgba(255,248,225,0.96)' : 'rgba(252,232,230,0.96)',
              color: expiredAlmost ? '#6b5200' : '#8c1d18',
              fontWeight: 900,
              boxShadow: '0 3px 10px rgba(0,0,0,0.12)',
            }}
          >
            {expiredAlmost ? 'Almost — review below' : 'Incorrect — review below'}
          </div>
        )}
      </div>
      </EnlargeableFigure>
      </WorkViewCapabilityProvider>
        )}
        actionButtons={!locked && shouldShowSubmit ? (
        <button onClick={handleSubmit} disabled={submitDisabled} style={{ minHeight: '44px', padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', border: 'none', borderRadius: '8px', background: submitDisabled ? '#dadce0' : '#1a73e8', color: 'white', cursor: submitDisabled ? 'not-allowed' : 'pointer', boxShadow: submitDisabled ? 'none' : '0 4px 6px rgba(26, 115, 232, 0.2)' }}>
          {submitLabel}
        </button>
        ) : null}
      />

      <CalculatorPanel
        policy={calculatorPolicy}
        estimationRequired={processedQuestion?.estimationRequired === true}
        onCalculatorOpened={() => setCalculatorUsed(true)}
        open={calculatorOpen}
        onOpenChange={setCalculatorOpen}
        showLauncher={false}
      />

      {sameIncorrectResponse && !isMultipart && !locked && (
        <p style={{ marginTop: '10px', color: '#5f6368', fontWeight: 'bold' }}>You may submit the same response again. No answer change is required.</p>
      )}

      {/* A question the server cannot grade is not quietly marked wrong: the
          student is told it was not submitted, which is what happened. */}
      {feedback?.blocked && (
        <div role="alert" style={{ margin: '25px auto 0', padding: '15px', maxWidth: '700px', borderRadius: '8px', background: '#fef7e0', border: '1px solid #f9ab00', color: '#7a4f00', fontSize: '15px', fontWeight: 'bold' }}>
          {feedback.message}
        </div>
      )}

      {feedback && !feedback.blocked && showOutcomeFeedback && (
        <div style={{ margin: '25px auto 0', padding: '15px', maxWidth: '700px', borderRadius: '8px', backgroundColor: feedback.isCorrect ? '#e6f4ea' : '#fce8e6', color: feedback.isCorrect ? '#137333' : '#c5221f', fontSize: '16px', fontWeight: 'bold' }}>
          {feedback.message || (feedback.isCorrect
            ? 'Correct! This question is complete.'
            : isExpired
              ? `That was the final allowed attempt (${resolvedMaximumAttempts} total). This response is locked.${resolvedActivityPolicy?.allowReplacement ? ' Review the solution, then request a new question to continue.' : ''}`
              : `Not quite. You have ${remainingAttempts} ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining on this version.`)}
          {!feedback.isCorrect && isComposed && workflowSubmissionReview?.parts?.some((part) => part?.graded !== false && !part?.isCorrect) && (
            <div style={{ marginTop: '9px', paddingTop: '9px', borderTop: '1px solid rgba(197,34,31,0.24)' }}>
              The red steps above are the specific responses that need revision. MathMaster moved you to the first one.
            </div>
          )}
          {!feedback.isCorrect && !isComposed && Array.isArray(feedback.incorrectParts) && feedback.incorrectParts.length > 0 && (
            <div style={{ marginTop: '9px', paddingTop: '9px', borderTop: '1px solid rgba(197,34,31,0.24)' }}>Focus on: {feedback.incorrectParts.join(', ')}.</div>
          )}
        </div>
      )}

      {isCorrect && showOutcomeFeedback && sectionComplete && (
        <section
          className={`mathmaster-section-completion-card${sectionCompletionCelebrating ? ' is-celebrating' : ''}`}
          role="status"
          aria-label={`${sectionLabel || 'Section'} complete`}
        >
          <div className="mathmaster-section-completion-icon" aria-hidden="true">✓</div>
          <div className="mathmaster-section-completion-copy">
            <span>Section milestone</span>
            <strong>{String(sectionLabel || 'Section').toUpperCase()} COMPLETE</strong>
            <small>You completed all {sectionQuestionCount || ''} {sectionLabel || 'section'} question{Number(sectionQuestionCount) === 1 ? '' : 's'}.</small>
          </div>
          {typeof onContinueSection === 'function' ? (
            <div>
              <button type="button" onClick={onContinueSection} aria-keyshortcuts="Enter" className="mathmaster-section-completion-continue">
                <span>Continue to {continueSectionLabel || 'next section'}</span>
                <span aria-hidden="true">→</span>
              </button>
              <small style={{ display: 'block', marginTop: 6, color: '#5f6368', fontWeight: 750, textAlign: 'center' }}>{ENTER_TO_CONTINUE_HINT}</small>
            </div>
          ) : (
            <div className="mathmaster-section-completion-done">All currently available sections are complete.</div>
          )}
        </section>
      )}

      {locked && !sectionComplete && typeof onNextQuestion === 'function' && (
        <div role="navigation" aria-label="Continue to the next question" style={{ margin: '16px auto 6px', maxWidth: '700px', position: 'relative', zIndex: 50 }}>
          <button
            type="button"
            onClick={onNextQuestion}
            aria-keyshortcuts="Enter"
            className="mathmaster-success-next-question"
            style={{
              width: '100%',
              minHeight: '72px',
              padding: '14px 18px',
              border: '3px solid #0b57d0',
              borderRadius: '14px',
              background: '#1a73e8',
              color: '#fff',
              cursor: 'pointer',
              boxShadow: '0 8px 22px rgba(26,115,232,0.30)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              textAlign: 'left',
            }}
          >
            <span>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.88 }}>{isCorrect ? 'You got it — keep going' : 'This question is closed — keep going'}</span>
              <span style={{ display: 'block', marginTop: '3px', fontSize: '21px', fontWeight: 950 }}>Next Question</span>
              {(nextQuestionLabel || nextQuestionSectionLabel) && (
                <span style={{ display: 'block', marginTop: '2px', fontSize: '13px', fontWeight: 750, opacity: 0.92 }}>
                  {nextQuestionSectionLabel ? `${nextQuestionSectionLabel} · ` : ''}{nextQuestionLabel}
                </span>
              )}
              <span style={{ display: 'block', marginTop: '5px', fontSize: '12px', fontWeight: 800, opacity: 0.9 }}>{ENTER_TO_CONTINUE_HINT}</span>
            </span>
            <span aria-hidden="true" style={{ width: '44px', height: '44px', flex: '0 0 44px', display: 'grid', placeItems: 'center', borderRadius: '999px', background: '#fff', color: '#174ea6', fontSize: '30px', lineHeight: 1, fontWeight: 950 }}>→</span>
          </button>
        </div>
      )}

      {terminalFeedbackHidden && (
        <div role="status" style={{ margin: '25px auto 0', padding: '15px', maxWidth: '700px', borderRadius: '8px', background: '#eef4ff', color: '#174ea6', border: '1px solid #aecbfa', fontSize: '15px', fontWeight: 'bold' }}>
          {heldFeedbackMessage}
        </div>
      )}

      {assignmentLocked && !isCorrect && !isExpired && (
        <div style={{ margin: '25px auto 0', padding: '18px', maxWidth: '700px', borderRadius: '10px', border: '2px solid #5f6368', background: '#f1f3f4', color: '#3c4043' }}><strong>{assignmentLockedMessage || 'This assignment is permanently closed.'}</strong>{!assignmentLockedMessage && ' The saved response is available for review, but no changes or submissions are allowed.'}</div>
      )}

      {isExpired && showOutcomeFeedback && (
        <div style={{ margin: '25px auto 0', padding: '18px', maxWidth: '700px', borderRadius: '10px', border: `2px solid ${expiredAlmost ? '#f9ab00' : '#d93025'}`, background: expiredAlmost ? '#fff8e1' : '#fce8e6', color: expiredAlmost ? '#6b5200' : '#5f2120', position: 'relative', zIndex: 45 }}>
          <strong>This response is closed after {resolvedMaximumAttempts} {resolvedMaximumAttempts === 1 ? 'attempt' : 'attempts'}.</strong>
          {missingToolDefinition
            ? <ToolSolutionReview question={processedQuestion} />
            : <SolutionReview question={processedQuestion} incorrectParts={feedback?.incorrectParts || []} />}
          {resolvedActivityPolicy?.allowReplacement && (
            <>
              <p style={{ margin: '8px 0 14px' }}>Review the solution, then request a new problem at the same difficulty.</p>
              <button type="button" onClick={handleRequestNewQuestion} disabled={requesting || assignmentLocked} style={{ padding: '11px 18px', border: 'none', borderRadius: '8px', background: requesting || assignmentLocked ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 'bold', cursor: requesting || assignmentLocked ? 'not-allowed' : 'pointer' }}>
                {requesting ? 'Creating New Question…' : 'Request New Question'}
              </button>
            </>
          )}
        </div>
      )}

      {unchangedConfirmOpen && (
        <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setUnchangedConfirmOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(32,33,36,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div role="dialog" aria-modal="true" style={{ width: 'min(520px, 94vw)', padding: '24px', borderRadius: '14px', background: '#fff', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', textAlign: 'left' }}>
            <h2 style={{ marginTop: 0, color: '#202124' }}>Your values have not changed</h2>
            <p style={{ color: '#5f6368', lineHeight: 1.55 }}>This multipart response is identical to the previous submission. You may still use another attempt with the same values. Continue submitting?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" onClick={() => setUnchangedConfirmOpen(false)} style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #dadce0', background: '#fff', fontWeight: 'bold' }}>Go Back</button>
              <button type="button" onClick={performSubmit} style={{ padding: '10px 15px', borderRadius: '8px', border: 'none', background: '#1a73e8', color: '#fff', fontWeight: 'bold' }}>Submit Unchanged Values</button>
            </div>
          </div>
        </div>
      )}

      <ScratchpadOverlay open={scratchpadOpen} questionKey={processedQuestion?.questionId ?? processedQuestion?.id ?? null} questionDetails={scratchpadQuestionDetails} initialDataUrl={scratchpadDataUrl} initialPages={scratchpadPages} onSave={saveScratchpad} onClose={() => setScratchpadOpen(false)} readOnly={locked} />
    </div>
    </WorkViewUndoProvider>
    </QuestionLifecycleProvider>
  );
}
