import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHECKPOINT_DEBOUNCE_MS, responseSignature, studentChangedResponse } from './platform/performance/responseCheckpoint.js';
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
import { quarantineQuestionDraftFamily, removeQuestionDraftFamily, resetQuestionDraftFamily } from './questionDraftStorage';
import CalculatorPanel from './components/CalculatorPanel';
import ProblemUnderstandingPanel from './components/ProblemUnderstandingPanel';
import MobileViewportContainer, { isMobileQuestionViewport } from './components/student/MobileViewportContainer';
import { normalizeContextualQuestion } from './platform/context/wordProblemLayer';
import { getEffectiveActivityPolicy } from './platform/policies/activityPolicies';
import { resolveCalculatorPolicy } from './platform/policies/calculatorPolicy';
import { getToolDefinition } from './tools/toolRegistry';
import { buildRawPathResponse } from './platform/path/pathToolResponses';
import { ToolRuntimeProvider } from './tools/shared/ToolRuntimeContext';
import { createAttemptOutcomeSlots } from './tools/shared/attemptOutcomeSlots.js';
import { gradeRegistryToolWork, sharedVerdictWithholdsAttempt } from './platform/grading/registryToolGrading.js';
import { attemptInputsFromGrading } from '../functions/shared/serverGrading/gradingResult.mjs';
import { buildModelingLabResponse, gradeModelingLabEvaluation } from '../functions/shared/serverGrading/modelingLabGrading.mjs';
import { ToolDraftScopeProvider, forgetToolDrafts, stampToolDraftSubmission } from './tools/shared/usePersistentToolState.js';
import InteractiveModelingLabPlayer from './components/labs/InteractiveModelingLabPlayer.jsx';
import { useToast } from './ui/Toast';
import QuestionModuleBoundary from './QuestionModuleBoundary';
import QuestionResolutionBoundary, { QuestionResolutionFailure, questionFailureContext, recordQuestionResolutionDiagnostic } from './QuestionResolutionBoundary';
import QuestionSupplementBoundary from './QuestionSupplementBoundary';
import { canonicalResponseSavedAt } from './platform/persistence/canonicalResponseTime.js';
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
import { ENTER_TO_CONTINUE_HINT, answerFocusPosition, countAnswerControls, focusFirstAnswerControl, focusForEnter, isTouchPrimaryPointer, nextEmptyAnswerField, resolveQuestionEnterIntent, restoreAnswerFocus, shouldAdvanceOnEnter, shouldFocusAnswerOnOpen } from './platform/interaction/answerEntryUx.js';
import { AnswerFocusPolicyProvider, DeferredFocusProvider, useDeferredFocusAuthority } from './platform/interaction/answerFocusPolicy.js';
import { normalizeQuestionWeight } from './platform/grading/questionWeights.js';
import { resolveTaskContextPresentation } from './platform/workflow/taskContextPresentation.js';
import { WorkViewCapabilityProvider } from './platform/workView/workViewCapabilities.js';
import { WorkViewUndoProvider } from './platform/workView/useMathUndoHistory.js';
import { QuestionLifecycleProvider } from './platform/question/QuestionLifecycleContext.jsx';
import UniversalUndoButton from './components/common/UniversalUndoButton.jsx';
import { toolSubmissionParts } from './tools/shared/toolSubmissionParts.js';
import EnlargeableFigure from './components/common/EnlargeableFigure.jsx';
import CalculatorIcon from './components/common/CalculatorIcon.jsx';
import { startPerformanceSpan } from './platform/performance/performanceTelemetry.js';
import { useRenderPerformance } from './platform/performance/useRenderPerformance.js';
import { useActiveWorkTab } from './platform/persistence/activeWorkTab.js';
import { StudentSupportTray } from './components/student/StudentSupportTools.jsx';
import { toolsEntitlementFromProfile } from './platform/language/supportToolsEntitlement.js';
import { speakAloud, speechAvailable } from './platform/language/speechText.js';

const WorkViewReadySignal = ({ span }) => {
  useEffect(() => {
    span?.finish({ status: 'interactive' });
  }, [span]);
  return null;
};

// Shown when the server will not mark this work, so nothing was recorded.
const UNCHECKABLE_WORK_FEEDBACK = Object.freeze({
  blocked: true,
  isCorrect: false,
  message: 'MathMaster could not check this answer, so it was not submitted and no attempt was used. Your work is saved. Let your teacher know about this question.',
});

const EMPTY_ANSWER_STATE = {
  isComplete: false,
  isCorrect: false,
  responseKey: '',
  questionDetails: '',
  parts: [],
};

// Answer states are small plain objects (flags, a response key, a details
// sentence, a parts list), so a serialized comparison is cheap and exact.
const sameAnswerState = (left, right) => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
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

// Read aloud, with the mathematics spoken as mathematics
// (platform/language/speechText.js — the same reader My Math Path uses).
// True only when the browser actually spoke.
const speakText = (text, language = 'en') => Boolean(text) && speakAloud(text, { language });

function QuestionEngineBody({
  question,
  onGrade,
  onStepGrade,
  onRequestNewQuestion,
  onLoadScratchpad,
  onSaveScratchpad,
  generationKey,
  // For a question-family slot: the student's seat allocation, the variant and
  // any delivery pin (src/platform/generation/familyDelivery.js). Null for
  // every other question and every host that does not seat students.
  familyContext = null,
  // Told which family instance was shown, so the host can pin it and send the
  // pin with the student's work.
  onFamilyDelivery = null,
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
  // What this question's final action is called, when the host decides. A
  // secure Test passes "Record answer": the action records the student's one
  // answer and withholds the verdict, so a button that says "Check" (a tool's)
  // or "Checking…" would mislead. Reaches every registry tool through
  // ToolRuntimeContext (useSubmitLabel). Null keeps every existing label.
  submitLabel: hostSubmitLabel = null,
  onResponseCheckpoint = null,
  // Set when this mount only shows work a server copy restored after the
  // question had opened (App.jsx): { position } — where the student's cursor
  // was, from answerFocusPosition. Such a mount is not an opening.
  draftRestore = null,
  onSpotlightFrame = null,
  // Support evidence: ({ supportId, eventType }) when a support is on screen
  // ('available'), applied to this item ('provided') or used ('used'). The
  // caller filters to supports the student is entitled to and de-duplicates.
  // Student assignment work only; previews pass nothing.
  onSupportEvidence = null,
  // Which language Support tools to offer, when the caller already knows
  // (supportToolsEntitlement.js toolsEntitlementFromPath on My Math Path).
  supportEntitlement = null,
  // Supplied by the QuestionEngine wrapper: prepare this question again from
  // scratch (a remount). Offered only for a failure a retry can clear.
  onResolutionRetry = null,
  // Optional: told when this question could not be prepared (a classified
  // failure), with its classification. Recovery reports it to the server so
  // the question is never counted against the student.
  onResolutionFailure = null,
  // false: the failure panel shows no classification code and no copyable
  // report (Recovery says what happened in its own words).
  resolutionTechnicalDetails = true,
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
  // Same treatment: the host rebuilds this object on every render, and a new
  // identity must not regenerate the question.
  const stableFamilyContext = useDeepStableValue(familyContext);
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
    () => normalizeContextualQuestion(generateQuestion(runtimeQuestion, generationKey, stableStudentProfile, stableAdaptation, stableFamilyContext)),
    [runtimeQuestion, generationKey, stableStudentProfile, stableAdaptation, stableFamilyContext],
  );
  const familyDelivery = processedQuestion?.familyDelivery || null;
  const familyDeliverySignature = familyDelivery
    ? `${familyDelivery.slot}|${familyDelivery.variant}|${familyDelivery.fingerprint}`
    : '';
  useEffect(() => {
    if (familyDelivery && typeof onFamilyDelivery === 'function') onFamilyDelivery(familyDelivery, processedQuestion);
    // Reported once per distinct delivery, not once per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyDeliverySignature]);
  // A device pin that could not be used (familyPinReplay.js): the question on
  // screen is a fresh allocation, and support can see which pin was dropped.
  const familyPinNotice = processedQuestion?.familyPinNotice || null;
  useEffect(() => {
    if (!familyPinNotice) return;
    recordQuestionResolutionDiagnostic({
      kind: 'family-pin-superseded',
      context: { assignmentId, questionId: familyPinNotice.questionId, familyId: familyPinNotice.familyId, familyVersion: familyPinNotice.familyVersion, activityRole, executionScope },
      failure: { classification: familyPinNotice.classification, recovery: 'fresh-allocation', diagnostics: familyPinNotice },
    });
    // Once per distinct notice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyPinNotice?.classification, familyPinNotice?.pinFingerprint, familyDeliverySignature]);
  // A classified failure, reported to a host that asked (Recovery), once per
  // distinct failure. Never thrown back into this question.
  const platformFailure = processedQuestion?.type === 'platformQuestionError' ? processedQuestion.platformError || {} : null;
  const platformFailureSignature = platformFailure ? `${platformFailure.classification || 'unclassified'}|${platformFailure.recovery || ''}` : '';
  useEffect(() => {
    if (!platformFailureSignature || typeof onResolutionFailure !== 'function') return;
    try {
      onResolutionFailure({ classification: platformFailure.classification || null, recovery: platformFailure.recovery || null });
    } catch { /* the host's problem, never this question's */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformFailureSignature]);
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
   * and leaves the draft entirely in charge. A deadline auto-submit is dated by
   * when its work was captured, not by the close it was recorded at, so the
   * workspace that produced it is not mistaken for an older one
   * (canonicalResponseTime.js).
   */
  const canonicalAnswerSavedAt = canonicalResponseSavedAt(record);
  const [answerState, setAnswerState] = useState(EMPTY_ANSWER_STATE);
  // WHAT EVERY RESPONSE MODULE REPORTS INTO.
  //
  // Modules report their answer state from effects, and most rebuild the object
  // on every render. Stored as-is, an unchanged report still re-rendered this
  // engine, which re-rendered the module, whose effect reported again. Any
  // module whose effect also depended on a value rebuilt per render — a `|| {}`
  // or `= []` fallback for a field an imported question lacks — then looped
  // without end. Keeping the previous object for structurally equal work lets
  // React bail out, so that whole class of loop cannot start here.
  const reportAnswerState = useCallback((next) => {
    setAnswerState((current) => (sameAnswerState(current, next) ? current : next));
  }, []);

  useEffect(() => {
    onSpotlightFrame?.({ question: processedQuestion, answerState });
  }, [answerState, processedQuestion, onSpotlightFrame]);
  const [feedback, setFeedback] = useState(null);
  // PQ-022: the verdict areas of the registry tool on screen, and which of
  // them shows the outcome of which attempt (attemptOutcomeSlots.js). The
  // owner is tied to the feedback object it was chosen for, so it can never
  // carry over to another attempt's feedback.
  const [toolOutcomeSlots] = useState(createAttemptOutcomeSlots);
  const [toolOutcomeOwner, setToolOutcomeOwner] = useState(null);
  const toolOutcomeSequenceRef = useRef(0);
  const [lastSubmittedResponseKey, setLastSubmittedResponseKey] = useState(() => record.lastResponseKey || '');
  const [submitting, setSubmitting] = useState(false);
  const submissionInFlightRef = useRef(false);
  const [requesting, setRequesting] = useState(false);
  const [baseUndoController, setBaseUndoController] = useState(null);
  const [undoController, setUndoController] = useState(null);
  // Enter on a multi-part, DOL or one-try question brings this into focus
  // instead of submitting; the student's second Enter presses it.
  const submitButtonRef = useRef(null);
  // The latest completeness and submit, for an Enter that arrived before the
  // render following its keystroke (see the Enter handler).
  const enterFreshRef = useRef(null);
  const [questionResetVersion, setQuestionResetVersion] = useState(0);
  // How many times this question's module has been restarted from a fresh
  // workspace after it failed to render (QuestionModuleBoundary). Once.
  const [moduleRecoveries, setModuleRecoveries] = useState(0);
  const [resettingQuestion, setResettingQuestion] = useState(false);
  const [solverWorkspaceMode, setSolverWorkspaceMode] = useState('normal');
  const solverWorkspaceActive = solverWorkspaceMode !== 'normal';
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [scratchpadLoading, setScratchpadLoading] = useState(false);
  const previousSectionCompleteRef = useRef(Boolean(sectionComplete));
  const [sectionCompletionCelebrating, setSectionCompletionCelebrating] = useState(false);
  const questionEngineRef = useRef(null);
  // This mount's say over every focus that lands a frame or more after it was
  // asked for — its own, its tools', MathLive's. A press, tap or key from the
  // student after the mount (or after the request) cancels them; so does the
  // question going away. See deferredFocusAuthority.js.
  const focusAuthority = useDeferredFocusAuthority();
  const checkpointTimerRef = useRef(null);
  const checkpointWrittenRef = useRef(false);
  const checkpointPendingRef = useRef({ eligible: false, state: null });
  // Has the student touched THIS question in this session, and what did the
  // response look like before they did? (See studentChangedResponse.)
  const studentInteractedRef = useRef(false);
  const openingResponseSignatureRef = useRef(null);
  const checkpointIdentityRef = useRef(null);
  const markStudentInteraction = useCallback(() => {
    studentInteractedRef.current = true;
  }, []);

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
  // The parent re-creates this callback every render; the effects below must
  // fire when the ITEM changes, not on every render.
  const onSupportEvidenceRef = useRef(onSupportEvidence);
  useEffect(() => { onSupportEvidenceRef.current = onSupportEvidence; });
  const reportSupportEvidence = (supportId, eventType, details = null) => onSupportEvidenceRef.current?.({ supportId, eventType, ...(details ? { details } : {}) });
  // Read aloud is offered only where this browser can actually speak; where it
  // cannot, that is recorded as unavailable — never as available.
  const [readAloudReady] = useState(() => speechAvailable());
  const readAloudOffered = supportPresentation.textToSpeech && readAloudReady;
  // The prompt is in the student's language when an authored translation was
  // applied (src/studentSupport.js), and is read in that language.
  const readAloudLanguage = processedQuestion?.authoredPrompt !== undefined ? (supportPresentation.translationLanguage || 'en') : 'en';
  useEffect(() => {
    // Read aloud is on screen for this item (or could not be).
    if (supportPresentation.textToSpeech && readAloudReady) reportSupportEvidence('text-to-speech', 'available');
    else if (supportPresentation.textToSpeech) reportSupportEvidence('text-to-speech', 'unavailable', { reason: 'speech-engine-missing', surface: 'assignment' });
    // A modification that actually changed this item (never one that did not).
    (supportUsage.modifications || []).forEach((modificationId) => reportSupportEvidence(modificationId, 'provided'));
  }, [stableQuestion, supportPresentation.textToSpeech, supportUsage]); // eslint-disable-line react-hooks/exhaustive-deps

  // LANGUAGE SUPPORT TOOLS for this item — from the same effective profile as
  // every other support, shown only when entitled and backed by a resource
  // (platform/language/supportToolsModel.js). Nothing at all for a student
  // without one: the tray and its language data are a lazily loaded chunk.
  // My Math Path passes the server's own list instead (`supportEntitlement`):
  // the Path client never decides from a profile it read itself.
  const languageTools = useMemo(
    () => supportEntitlement || toolsEntitlementFromProfile(stableStudentProfile, { activityRole }),
    [supportEntitlement, stableStudentProfile, activityRole],
  );
  const supportItemKey = `${processedQuestion?.questionId ?? processedQuestion?.id ?? ''}|${record.variantIndex ?? 0}`;
  const reportToolEvidence = useCallback((evidence) => onSupportEvidenceRef.current?.(evidence), []);
  const supportTrayFor = (surface) => (languageTools.tools.length ? (
    <StudentSupportTray
      entitlement={languageTools}
      prompt={processedQuestion?.prompt || ''}
      question={processedQuestion}
      toolType={processedQuestion?.type || ''}
      surface={surface}
      itemKey={supportItemKey}
      // The work bar already carries Read aloud on the question; Work View does not.
      includeReadAloud={surface === 'enlarged' && readAloudOffered}
      onEvidence={reportToolEvidence}
    />
  ) : null);

  /*
   * A NEW QUESTION STARTS CLEAN — AND A QUESTION THAT HAS JUST OPENED IS NOT RESET.
   *
   * Everything below starts at these values, so on mount there is nothing to
   * reset. Resetting then was not harmless: React runs a child's effects before
   * its parent's, so this wiped what the response module had already reported
   * on mounting. Most modules report again on their next render; WorkflowRunner
   * reports only when an answer changes, so a finished composed question opened
   * again could not be submitted until the student changed an answer. The
   * question this state belongs to is remembered, not a first-run flag, so
   * React's development double mount is not mistaken for a new question.
   */
  const resetForQuestionRef = useRef(processedQuestion);
  useEffect(() => {
    if (resetForQuestionRef.current === processedQuestion) return;
    resetForQuestionRef.current = processedQuestion;
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
    // A registry tool reports its work through ATTEMPT_SUBMITTED, never through
    // `answerState`, whose response key therefore stays '' for it. Compared
    // with the last response key of a question that already had an attempt on
    // its record, '' looked like "the answer changed", and the outcome of the
    // tool's new attempt was cleared the instant it arrived (PQ-022). A tool
    // clears its own verdict when its work changes.
    if (missingToolDefinition) return;
    if (
      feedback?.isCorrect === false &&
      answerState.responseKey !== lastSubmittedResponseKey
    ) {
      setFeedback(null);
    }
  }, [answerState.responseKey, feedback, lastSubmittedResponseKey, missingToolDefinition]);

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
  // Where this question stands, for any failure report from its panels and
  // its module — scrubbed: no student, no draft key, no answer
  // (QuestionResolutionBoundary.jsx questionFailureContext).
  const failureContext = questionFailureContext({
    assignmentId,
    question,
    questionRecord: record,
    familyContext,
    activityRole,
    executionScope,
    assignmentLocked,
  });
  const supplementResetKey = `${generationKey}|${record.variantIndex}|reset-${questionResetVersion}`;
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
  // ONE TAB WORKS ON A QUESTION AT A TIME (activeWorkTab.js). If this
  // question has since been opened in another tab, this copy holds work as it
  // was when it loaded: it is paused — no typing, no draft, no checkpoint —
  // until the student chooses to continue here, which reloads the latest work.
  const activeWorkTab = useActiveWorkTab(executionScope === 'student' && draftKey ? draftKey : null);
  const pausedByAnotherTab = activeWorkTab.paused;
  const responseAlreadySubmitted = Boolean(answerState.responseKey)
    && (answerState.responseKey === lastSubmittedResponseKey
      || answerState.responseKey === record.lastResponseKey);
  const checkpointAllowed = Boolean(onResponseCheckpoint)
    && !serverGrading
    && !locked
    // A paused tab's answer is older than the work in the tab that owns the
    // question; closing it must not checkpoint that older answer.
    && !pausedByAnotherTab
    // `submitting` is state and arrives a render later; the ref flips the
    // instant Submit is pressed. A pagehide in that gap must not checkpoint
    // work that is already becoming an attempt.
    && !submitting
    && !submissionInFlightRef.current
    && !responseAlreadySubmitted;
  // A new question, variant or delivery starts with no interaction of its own
  // (decided during render, so the first render of the next question can never
  // inherit this one's).
  const checkpointIdentity = `${generationKey}|${draftKey}`;
  if (checkpointIdentityRef.current !== checkpointIdentity) {
    checkpointIdentityRef.current = checkpointIdentity;
    studentInteractedRef.current = false;
  }
  // Until the student interacts, the response on screen is the OPENING state
  // (defaults, or a draft restored from an earlier session); see
  // studentChangedResponse in responseCheckpoint.js.
  if (!studentInteractedRef.current) openingResponseSignatureRef.current = responseSignature(answerState);
  const checkpointPending = checkpointAllowed
    && (
      (Boolean(answerState.isComplete && answerState.responseKey) && studentChangedResponse({
        interacted: studentInteractedRef.current,
        openingSignature: openingResponseSignatureRef.current,
        answerState,
      }))
      || checkpointWrittenRef.current
    );
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
  // The attempt strip at the top of the question states the lock reason where
  // the student lands. When it does, the notice below the tool would repeat the
  // same sentence (two copies of "This assignment is closed.").
  const lockReasonInAttemptStrip = Boolean(
    assignmentLocked && !supportPresentation.declutter && !terminalFeedbackHidden
      && record.status !== 'correct' && !isExpired,
  );

  // Every ordinary assignment and canonical Path question passes through this
  // runtime. Focus the first real answer control once the question is ready —
  // unless doing so would open a keypad over work the student has not read, or
  // would point at one cell of a composed workspace as though it were the
  // answer. See shouldFocusAnswerOnOpen.
  //
  // Touch-first devices (an iPad is laid out like a laptop but raises an
  // on-screen keyboard) are excluded too. The decision is shared with the
  // registry tools through AnswerFocusPolicyProvider, because ToolShell used to
  // focus its first input regardless of it. A registry tool decides WHICH box,
  // if any: it knows whether it has one answer or twelve.
  const answerAutoFocusAllowed = !locked && !scaffoldRequired && !contextScaffoldRequired
    && shouldFocusAnswerOnOpen({ composed: isComposed, narrowViewport: isMobileQuestionViewport(), touchPrimary: isTouchPrimaryPointer() });
  // A remount that only shows restored work puts the cursor back where the
  // student had it, or nowhere — never in the first box, where a keystroke
  // already on its way would land over the restored answer. Read once, and
  // spent inside the frame (StrictMode runs this effect twice on mount).
  //
  // Both focuses are requests to the authority, made for this mount: once the
  // student presses, taps or keys anything after the mount, neither may move
  // the cursor any more (the click that beat the restore is where they want
  // to be). A later run of this effect — the scaffold finished, the question
  // unlocked — is a consequence of what just happened, so only an interaction
  // after IT cancels it, and it never pulls the cursor out of a box the
  // student is already in.
  const draftRestoreRef = useRef(draftRestore);
  const openingFocusSpentRef = useRef(false);
  useEffect(() => {
    const restore = draftRestoreRef.current;
    if (restore) {
      if (missingToolDefinition) return undefined;
      return focusAuthority.request(() => {
        draftRestoreRef.current = null;
        openingFocusSpentRef.current = true;
        restoreAnswerFocus(questionEngineRef.current, restore.position);
      });
    }
    if (!answerAutoFocusAllowed || missingToolDefinition) return undefined;
    const opening = !openingFocusSpentRef.current;
    return focusAuthority.request(() => {
      const root = questionEngineRef.current;
      if (!opening && answerFocusPosition(root)) return;
      if (focusFirstAnswerControl(root)) openingFocusSpentRef.current = true;
    }, { since: opening ? 'generation' : 'now' });
  }, [processedQuestion, record.variantIndex, answerAutoFocusAllowed, missingToolDefinition, focusAuthority]);

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
  useEffect(() => {
    if (calculatorPolicy?.available) reportSupportEvidence('calculator', 'available');
  }, [stableQuestion, calculatorPolicy?.available]); // eslint-disable-line react-hooks/exhaustive-deps
  const markCalculatorOpened = () => {
    setCalculatorUsed(true);
    reportSupportEvidence('calculator', 'used');
  };
  const handleCalculatorControl = () => {
    if (!calculatorPolicy?.available) {
      toastInfo('Calculator unavailable', calculatorUnavailableReason);
      return;
    }
    if (calculatorOpen) {
      setCalculatorOpen(false);
      return;
    }
    markCalculatorOpened();
    setCalculatorOpen(true);
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
  //
  // PUBLISHED WHEN THE WORK CHANGES, NOT WHEN THE HOST RE-RENDERS. A host
  // passes `serverGrading` and `onResponseStateChange` inline, and the Live
  // Challenge round stores what it receives in state. With both in the
  // dependency list every report re-rendered the host, which handed over new
  // props, which re-ran this: an endless loop for the whole of every Warm-Up
  // challenge round ("Maximum update depth exceeded" in development; a pinned
  // CPU on every Chromebook in production). The callback is read through a
  // ref, and a payload identical to the last one published is not sent again.
  const onResponseStateChangeRef = useRef(onResponseStateChange);
  onResponseStateChangeRef.current = onResponseStateChange;
  const lastPublishedResponseRef = useRef(null);
  const serverGradingToolId = serverGrading?.pathToolId ?? null;
  const publishesResponseState = Boolean(serverGrading && onResponseStateChange);
  useEffect(() => {
    if (!publishesResponseState) return;
    const rawWork = buildRawPathResponse({ pathToolId: serverGradingToolId, answerState });
    const signature = stableStringify(rawWork ?? null);
    if (signature === lastPublishedResponseRef.current) return;
    lastPublishedResponseRef.current = signature;
    onResponseStateChangeRef.current?.(rawWork);
  }, [answerState, publishesResponseState, serverGradingToolId]);

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
    if (!answerState.isComplete || submitting || submissionInFlightRef.current || locked || pausedByAnotherTab) return;
    /*
     * A SERVER-GRADED QUESTION WHOSE WORK THE SHARED GRADER DECLINED.
     *
     * A composed question reports `sharedGradingWithheld` when its shared
     * grader will not mark this work: text it will not run on the server
     * (ingestion holds that attempt for teacher review) or a response too
     * large to read. Recording the device's own marking would spend an
     * attempt, and show a result, the gradebook never receives — the same
     * rule as a registry tool's withheld verdict below.
     */
    if (!serverGrading && answerState.sharedGradingWithheld) {
      setFeedback(UNCHECKABLE_WORK_FEEDBACK);
      return;
    }
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
        // A question graded through the shared structured-response contract
        // (serverGrading/) reports its raw work as `toolResponse`, which rides
        // with the attempt so the server re-grades exactly that work.
        { partialCreditPercent: answerState.partialCreditPercent ?? null, toolResponse: answerState.toolResponse || null },
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
    if (!answerState.isComplete || submitting || locked || pausedByAnotherTab) return;
    if (sameIncorrectResponse && isMultipart) {
      setUnchangedConfirmOpen(true);
      return;
    }
    await performSubmit();
  };

  enterFreshRef.current = { isComplete: answerState.isComplete, submitDisabled: !answerState.isComplete || submitting || locked || scaffoldRequired || contextScaffoldRequired, handleSubmit };

  /*
   * A REGISTRY TOOL'S LIVE WORK, AS A CHECKPOINTABLE RESPONSE.
   *
   * Ordinary graders report their state through `onStateChange`; a registry
   * tool reports its raw work through the runtime context
   * (useReportToolWork). Turning it into the same `answerState` shape lets
   * the existing checkpoint machinery — debounce, page-lifecycle flush,
   * "already submitted" detection — carry tool work to a deadline unchanged.
   * Completeness comes from the shared grader, so a deadline only
   * auto-submits work the server itself would call finished.
   */
  const toolWorkQuestionRef = useRef(null);
  toolWorkQuestionRef.current = processedQuestion;
  const toolWorkSequenceRef = useRef(0);
  const registryToolId = missingToolDefinition?.toolId || null;
  const registryToolLabel = missingToolDefinition?.label || 'Math tool';
  const handleToolWork = useCallback((work) => {
    if (!registryToolId) return;
    /*
     * A SERVER-GRADED REGISTRY TOOL'S LIVE WORK IS ITS RAW RESPONSE.
     *
     * A registry tool reports the SAME work object its Check submits
     * (useReportToolWork), which is exactly the raw shape its Path Tool
     * Contract grades — so under server grading it is published as is, with
     * no local grading and no verdict. Before this, nothing was published for
     * a registry tool: a secure Test could not autosave a half-built graph, and
     * a reload lost it. Deduplicated by canonical value like every other
     * published response.
     */
    if (serverGrading) {
      // Only a host that keeps live tool work asks for it. Live Challenge also
      // grades on the server, and its round-end buzzer submits whatever it was
      // last given: half-built graphs reached the server as answers.
      if (serverGrading.publishToolWork !== true || !onResponseStateChangeRef.current) return;
      const signature = stableStringify(work ?? null);
      if (signature === lastPublishedResponseRef.current) return;
      lastPublishedResponseRef.current = signature;
      onResponseStateChangeRef.current?.(work ?? null);
      return;
    }
    const question = toolWorkQuestionRef.current;
    toolWorkSequenceRef.current += 1;
    const sequence = toolWorkSequenceRef.current;
    void gradeRegistryToolWork({ toolId: registryToolId, question, work }).then((result) => {
      if (sequence !== toolWorkSequenceRef.current || toolWorkQuestionRef.current !== question) return;
      if (!result?.toolResponse?.value) return;
      setAnswerState({
        isComplete: result.graded === true && result.isComplete === true,
        // Never a verdict: nothing reads correctness from a draft, and the
        // checkpoint schema refuses to carry one.
        isCorrect: false,
        responseKey: result.toolResponse.value,
        questionDetails: `${registryToolLabel} work in progress.`,
        parts: [],
        toolResponse: result.toolResponse,
      });
    });
  }, [registryToolId, registryToolLabel, serverGrading]);

  const handleMissingToolAction = async (type, payload = {}) => {
    // A hint revealed inside a tool is mathematical help, exactly like a hint
    // from the coach panel, so it has to reach the same support-usage record
    // that discounts mastery weight.
    if (type === 'HINT_USED') {
      setHintUsed(true);
      return;
    }
    if (type !== 'ATTEMPT_SUBMITTED' || submitting || locked || pausedByAnotherTab) return;
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
      /*
       * THE RECORDED VERDICT COMES FROM THE SHARED GRADER, NOT THE TOOL.
       *
       * The student's raw work is marked here by the same pure grader the
       * server runs (functions/shared/serverGrading), through the same
       * bounded bytes the server will read. Whatever the tool computed for
       * its own on-screen feedback is only a fallback for a tool mode that
       * is documented as not yet server-gradable. The structured work rides
       * with the attempt as `toolResponse`, so ingestion — or a deadline, or
       * a queue drained days later — reaches the identical verdict.
       */
      const sharedVerdict = await gradeRegistryToolWork({
        toolId: missingToolDefinition?.toolId,
        question: processedQuestion,
        work: payload?.response,
      });
      const toolResponse = sharedVerdict.toolResponse;
      /*
       * A MODE THE SERVER GRADES, BUT THIS WORK COULD NOT BE GRADED.
       *
       * The tool's question could not be computed ('invalid-question',
       * 'no-answer-key'), or the work is unreadable or oversize. The server
       * holds such a submission for teacher review instead of recording it,
       * so recording the tool's own fallback verdict here would spend an
       * attempt the gradebook never sees. Nothing is recorded; the work stays
       * in the tool's saved draft. Only a mode documented as graded on the
       * device (or a grader that could not load) uses the tool's verdict.
       */
      if (sharedVerdictWithholdsAttempt(sharedVerdict)) {
        setFeedback(UNCHECKABLE_WORK_FEEDBACK);
        return;
      }
      if (sharedVerdict.graded && Boolean(payload?.isCorrect) !== sharedVerdict.isCorrect) {
        // A tool whose own Check disagrees with its shared grader is a parity
        // defect worth seeing in development; the shared verdict stands.
        console.warn(`[grading-parity] ${missingToolDefinition?.toolId}: tool reported ${Boolean(payload?.isCorrect)}, shared grader ${sharedVerdict.isCorrect}.`);
      }
      if (sharedVerdict.graded) {
        const attemptInputs = attemptInputsFromGrading(sharedVerdict);
        const details = `${missingToolDefinition?.label || 'Math tool'} response submitted.`;
        const result = await onGrade?.(
          attemptInputs.isCorrect,
          details,
          attemptInputs.parts,
          attemptSupportUsage(),
          toolResponse?.value || JSON.stringify(payload?.response ?? {}),
          { partialCreditPercent: attemptInputs.partialCreditPercent, toolResponse },
        );
        const gradedFeedback = result || {
          isCorrect: attemptInputs.isCorrect,
          status: attemptInputs.isCorrect ? 'correct' : record.attemptCount + 1 >= resolvedMaximumAttempts ? 'expired' : 'attempted',
          attemptCount: record.attemptCount + 1,
          remainingAttempts: Math.max(0, resolvedMaximumAttempts - record.attemptCount - 1),
          expired: !attemptInputs.isCorrect && record.attemptCount + 1 >= resolvedMaximumAttempts,
          partialCredit: attemptInputs.partialCreditPercent || 0,
        };
        setFeedback(gradedFeedback);
        // The tool's verdict for this Check mounted when Check was pressed,
        // before the attempt was graded, so it is the latest slot (PQ-022).
        toolOutcomeSequenceRef.current += 1;
        setToolOutcomeOwner({ feedback: gradedFeedback, slot: toolOutcomeSlots.latest(), id: toolOutcomeSequenceRef.current });
        return;
      }
      // A mode graded on the device: only the parts this question asked, under
      // their names (toolSubmissionParts).
      const parts = toolSubmissionParts(payload?.metadata);
      const score = Number(payload?.score);
      const partialCreditPercent = Number.isFinite(score)
        ? Math.max(0, Math.min(100, Math.round((score <= 1 ? score * 100 : score))))
        : null;
      // Still carried as structured work, so the server stores exactly what
      // the student did even for a mode whose verdict stays on the device.
      const responseKey = toolResponse?.value || JSON.stringify(payload?.response ?? {});
      const details = `${missingToolDefinition?.label || 'Math tool'} response submitted.`;
      const result = await onGrade?.(
        Boolean(payload?.isCorrect),
        details,
        parts,
        attemptSupportUsage(),
        responseKey,
        { partialCreditPercent, toolResponse },
      );
      const nextFeedback = result || {
        isCorrect: Boolean(payload?.isCorrect),
        status: payload?.isCorrect ? 'correct' : record.attemptCount + 1 >= resolvedMaximumAttempts ? 'expired' : 'attempted',
        attemptCount: record.attemptCount + 1,
        remainingAttempts: Math.max(0, resolvedMaximumAttempts - record.attemptCount - 1),
        expired: !payload?.isCorrect && record.attemptCount + 1 >= resolvedMaximumAttempts,
        partialCredit: partialCreditPercent || 0,
      };
      setFeedback(nextFeedback);
      // The tool's verdict for this Check mounted when Check was pressed,
      // before the attempt was graded, so it is the latest slot (PQ-022).
      toolOutcomeSequenceRef.current += 1;
      setToolOutcomeOwner({ feedback: nextFeedback, slot: toolOutcomeSlots.latest(), id: toolOutcomeSequenceRef.current });
    } finally {
      setSubmitting(false);
      stampToolDraftSubmission(draftKey);
    }
  };

  const handleModelingLabGrade = async (evaluation, serverResult = null) => {
    if (submitting || locked) return null;
    setSubmitting(true);
    try {
      // The lab was graded by the server (submitModelingLab). The attempt
      // queued here carries only a REFERENCE to that evaluation — the lab and
      // submission ids — and ingestion records it from the server-written
      // marker. Parts and partial credit come from the same shared mapping
      // the server applies, so the student sees what the gradebook keeps.
      const grading = gradeModelingLabEvaluation(evaluation);
      const attemptInputs = attemptInputsFromGrading(grading);
      const partialCreditPercent = Math.max(0, Math.min(100, Math.round(Number(evaluation?.compositeScore || 0) * 100)));
      const labId = processedQuestion?.labDefinition?.labId;
      const toolResponse = buildModelingLabResponse({ question: processedQuestion, labId, submissionId: serverResult?.submissionId });
      const result = await onGrade?.(
        attemptInputs.isCorrect,
        `Server-graded modeling lab · ${partialCreditPercent}% composite.`,
        attemptInputs.parts,
        attemptSupportUsage(),
        toolResponse.value || `lab:${labId}:${partialCreditPercent}`,
        { partialCreditPercent: attemptInputs.partialCreditPercent, toolResponse },
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

  /*
   * THE WAY BACK FROM A QUESTION THAT CANNOT OPEN ITS SAVED WORK.
   *
   * QuestionModuleBoundary calls this when the student chooses "Start this
   * question fresh". The question's drafts are set aside — a copy is kept on
   * this device, and the family is tombstoned so the server backup cannot
   * bring the same draft back elsewhere — and the module remounts clean.
   *
   * No confirmation and no lock check, unlike Reset: the work it sets aside is
   * already unusable, and a locked (closed) question still has to be viewable.
   * It never submits, never grades and never touches the attempt record.
   */
  const handleRecoverQuestionModule = () => {
    quarantineQuestionDraftFamily(draftKey, { reason: 'question-module-error' });
    forgetToolDrafts(draftKey);
    setAnswerState(EMPTY_ANSWER_STATE);
    setFeedback(null);
    setWorkflowSubmissionReview(null);
    setBaseUndoController(null);
    setUndoController(null);
    setModuleRecoveries((current) => current + 1);
    setQuestionResetVersion((current) => current + 1);
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
      // Graph paper is a support only for a student entitled to it; opening the
      // scratchpad is their use of it.
      if (supportPresentation.graphPaper) reportSupportEvidence('graph-paper', 'used');
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
  // The same permission, handed to every registry tool through
  // ToolRuntimeContext: their hint panels (and any other hint affordance) are
  // absent where the activity withholds help, not merely recorded.
  const toolHintsAllowed = resolvedActivityPolicy?.hintsAllowed !== false;
  // A hint revealed anywhere — a tool's panel, the Work View Help drawer, the
  // solver's "Need a strategic hint?" — is recorded the same way.
  const recordHintUse = () => setHintUsed(true);
  // The step-algebra solvers carry their own strategic hint: the same
  // permission, and opening it is reported like any other hint.
  const stepAlgebraHintProps = {
    hintsAllowed: toolHintsAllowed,
    onHintUsed: recordHintUse,
  };
  // The algebra solvers are mounted here directly, not through the registry,
  // but the relation solver embeds a registry tool — its "graph your solution
  // and write it in interval notation" stage is IntervalNumberLine — which
  // reads its policy from ToolRuntimeContext. Without a provider it ran on the
  // context's defaults (verdicts and hints on) on a DOL, quiz or test. The
  // stage's key is the student's own solved relation, which the solver holds
  // under server grading too, so — unlike a registry tool — it follows
  // showOutcomeFeedback alone.
  const withSolverRuntime = (node) => (
    <ToolRuntimeProvider
      showImmediateFeedback={showOutcomeFeedback}
      hintsAllowed={toolHintsAllowed}
      onHintUsed={recordHintUse}
      questionTerminal={locked}
      submitLabel={hostSubmitLabel}
      verdictsWithheld={!showOutcomeFeedback}
    >
      {node}
    </ToolRuntimeProvider>
  );

  const graphModuleProps = {
    selfCheckAllowed,
    // Reported exactly like a revealed hint, which is what discounts the
    // mastery weight through isMathematicallyIndependent.
    onSelfCheck: () => setHintUsed(true),
    // The point check may name wrong points only where outcomes are shown at
    // once; on a DOL, quiz or test the submission is the check.
    revealPointCorrectness: showOutcomeFeedback,
  };

  const commonModuleProps = {
    question: presentationQuestion,
    onStateChange: reportAnswerState,
    onUndoStateChange: registerUndo,
    workspaceMode: solverWorkspaceMode,
    onWorkspaceModeChange: setSolverWorkspaceMode,
    feedback: showOutcomeFeedback ? feedback : null,
    draftKey,
    disabled: locked || scaffoldRequired || contextScaffoldRequired || submitting,
  };

  // THE ATTEMPT OUTCOME, WORDED ONCE. The box below the question and a
  // registry tool's result area show exactly the same words.
  const attemptOutcomeText = feedback
    ? (feedback.message || (feedback.isCorrect
      ? 'Correct! This question is complete.'
      : isExpired
        ? `That was the final allowed attempt (${resolvedMaximumAttempts} total). This response is locked.${resolvedActivityPolicy?.allowReplacement ? ' Review the solution, then request a new question to continue.' : ''}`
        : `Not quite. You have ${remainingAttempts} ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining on this version.`))
    : '';
  const attemptOutcomeFocus = feedback && !feedback.isCorrect && !isComposed && Array.isArray(feedback.incorrectParts) && feedback.incorrectParts.length > 0
    ? `Focus on: ${feedback.incorrectParts.join(', ')}.`
    : '';
  // WHERE A TOOL'S ATTEMPT OUTCOME IS SHOWN (PQ-022). In the tool's result
  // area, beside its own verdict, when the tool showed one for this attempt and
  // the box below would have shown the outcome at all: outcome feedback
  // allowed (never on a DOL, quiz or test before release), the attempt not
  // blocked, and the question still open — a correct or final attempt locks
  // the tool, inert, so the box below announces it as before. Otherwise in the
  // box. Never both, so it is announced once (PQ-017).
  const toolOutcomeSlot = toolOutcomeOwner && toolOutcomeOwner.feedback === feedback ? toolOutcomeOwner.slot : null;
  const outcomeInTool = Boolean(
    missingToolDefinition && toolOutcomeSlot !== null
      && feedback && !feedback.blocked && showOutcomeFeedback && !locked,
  );
  const toolAttemptOutcome = outcomeInTool ? {
    id: toolOutcomeOwner.id,
    slot: toolOutcomeSlot,
    text: attemptOutcomeText,
    detail: attemptOutcomeFocus,
    tone: feedback.isCorrect ? 'correct' : 'incorrect',
  } : null;

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
        // A composed question's steps are the same tools the registry mounts —
        // the mapping-diagram stage is RelationMapping, the number-line stage
        // IntervalNumberLine — and the same graph workspace, so they answer to
        // the same policy. Without this provider they read the context's
        // defaults, verdicts on and hints on: "Correct" / "Not yet" and a hint
        // panel on a mapping step of a DOL, before the question was submitted.
        // They get exactly what a standalone registry tool gets below.
        <ToolRuntimeProvider
          showImmediateFeedback={showOutcomeFeedback && !serverGrading}
          hintsAllowed={toolHintsAllowed}
          onHintUsed={recordHintUse}
          questionTerminal={locked}
          submitLabel={hostSubmitLabel}
          verdictsWithheld={!showOutcomeFeedback}
        >
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
            revealCorrectness={showOutcomeFeedback}
          />
        </ToolRuntimeProvider>
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
          hintsAllowed={toolHintsAllowed}
          onHintUsed={recordHintUse}
          questionTerminal={locked}
          attemptOutcome={toolAttemptOutcome}
          attemptOutcomeSlots={toolOutcomeSlots}
          reportWork={locked ? null : handleToolWork}
          submitLabel={hostSubmitLabel}
          verdictsWithheld={!showOutcomeFeedback}
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
            {/* A restore mount puts the cursor back itself (above), or nowhere:
                a tool must not focus its one box instead. */}
            <AnswerFocusPolicyProvider allowed={answerAutoFocusAllowed && !draftRestore}>
              <Suspense fallback={<p role="status">Opening Work View…</p>}>
                <WorkViewReadySignal span={workViewSpan} />
                <Tool questionData={presentationQuestion} onAction={handleMissingToolAction} draftKey={draftKey} />
              </Suspense>
            </AnswerFocusPolicyProvider>
          </ToolDraftScopeProvider>
        </ToolRuntimeProvider>
      );
    }

    switch (processedQuestion.type) {
      case 'modelingLab':
        // The lab is graded on submit and shows its own result; on a DOL,
        // quiz or test that waits for release like every other outcome.
        return <InteractiveModelingLabPlayer rawLabSpec={processedQuestion.labDefinition} assignmentId={assignmentId} executionScope={executionScope} supportUsage={supportUsage} disabled={commonModuleProps.disabled} onServerGraded={handleModelingLabGrade} revealEvaluation={showOutcomeFeedback} />;
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
          return withSolverRuntime(
            <MultiRelationAlgebra
              {...commonModuleProps}
              workspaceActions={workspaceActions}
              questionRecord={record}
              onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
              attemptsDoNotExpire={attemptsDoNotExpire}
            />,
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
          // Under the solver runtime like every other algebra route: the
          // Step Algebra it embeds reads the activity's verdict policy there.
          return withSolverRuntime(
            <LinearInterceptsOrchestrator
              key={draftKey || processedQuestion?.questionId || processedQuestion?.id || generationKey}
              {...commonModuleProps}
              {...stepAlgebraHintProps}
              // Not a registry tool, so the policy comes in as a prop: on a
              // DOL, quiz or test "Check x-intercept" records the point and
              // says nothing about it, and it is graded at submission.
              revealCorrectness={showOutcomeFeedback}
              questionRecord={record}
              onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
              maximumAttempts={resolvedMaximumAttempts}
              attemptsDoNotExpire={attemptsDoNotExpire}
            />,
          );
        }
        // StepByStepAlgebra hands a prompt-only inequality to the relation
        // solver itself, so it gets the same runtime.
        return withSolverRuntime(
          <StepByStepAlgebra
            {...commonModuleProps}
            {...stepAlgebraHintProps}
            workspaceActions={workspaceActions}
            questionRecord={record}
            onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
            maximumAttempts={resolvedMaximumAttempts}
            attemptsDoNotExpire={attemptsDoNotExpire}
          />,
        );
      case 'algebra':
        // Retired legacy answer-box solver. Older stored test assignments may
        // still carry the old type, so treat it as an alias for the balance
        // workspace instead of reviving the obsolete EquationGrader UI.
        return withSolverRuntime(
          <StepByStepAlgebra
            {...commonModuleProps}
            {...stepAlgebraHintProps}
            workspaceActions={workspaceActions}
            questionRecord={record}
            onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
            maximumAttempts={resolvedMaximumAttempts}
            attemptsDoNotExpire={attemptsDoNotExpire}
          />,
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
              <p style={{ margin: '12px auto 0', maxWidth: 680, color: 'var(--mm-warning-text)', fontSize: 13, lineHeight: 1.55 }}>
                This question asked to be solved on the balance workspace, but {literalWorkspace.reason}, so it is
                shown as a written answer instead.
              </p>
            </div>
          );
        }
        return withSolverRuntime(
          <StepByStepAlgebra
            {...commonModuleProps}
            {...stepAlgebraHintProps}
            workspaceActions={workspaceActions}
            question={literalWorkspace.question}
            questionRecord={record}
            onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
            maximumAttempts={resolvedMaximumAttempts}
            attemptsDoNotExpire={attemptsDoNotExpire}
          />,
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
        return resolutionFailurePanel;
      default:
        // Batch A-D interactive tools never reach this switch: they resolve
        // through the shared registry above, so a new tool becomes
        // student-usable by registering it rather than by editing this switch.
        return (
          <div style={{ padding: '22px 24px', margin: '0 auto', maxWidth: '640px', borderRadius: '12px', background: 'var(--mm-warning-soft, var(--mm-warning-bg))', border: '1px solid var(--mm-warning, #f9ab00)', textAlign: 'left' }}>
            <h3 style={{ margin: 0, color: 'var(--mm-warning-text)' }}>This question could not be displayed</h3>
            <p style={{ margin: '10px 0 0', lineHeight: 1.55 }}>
              It uses a question type this version of MathMaster does not know how to show. Nothing you did caused this and your grade is not affected — let your teacher know.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--mm-ink-muted, var(--mm-text-muted))' }}>
              Details for your teacher: unsupported question type &ldquo;{String(processedQuestion.type)}&rdquo;.
            </p>
          </div>
        );
    }
  };

  /*
   * A QUESTION THAT COULD NOT BE PREPARED — most importantly a Question
   * Family pin that will not replay, which is never swapped for another
   * instance (src/platform/generation/familyPinReplay.js). Rendered OUTSIDE
   * the locked fieldset below: an already-answered or closed question is
   * still a question the student must be able to move on from. No Submit is
   * offered (shouldShowSubmit), so no attempt or grade can follow.
   */
  const resolutionFailurePanel = processedQuestion?.type === 'platformQuestionError' ? (
    <QuestionResolutionFailure
      failure={processedQuestion.platformError}
      context={{
        ...failureContext,
        questionId: processedQuestion.questionId ?? failureContext.questionId,
        familyId: processedQuestion.platformError?.diagnostics?.familyId ?? null,
        familyVersion: processedQuestion.platformError?.diagnostics?.familyVersion ?? null,
        stage: 'resolution',
      }}
      executionScope={executionScope}
      onRetry={onResolutionRetry}
      onNextQuestion={onNextQuestion}
      nextQuestionLabel={nextQuestionLabel}
      hasRecordedWork={(Number(record.totalAttempts) || 0) > 0 || ['correct', 'expired'].includes(record.status)}
      technicalDetails={resolutionTechnicalDetails !== false}
      draftKey={draftKey}
    />
  ) : null;

  const submitDisabled = !answerState.isComplete || submitting || locked || scaffoldRequired || contextScaffoldRequired || pausedByAnotherTab;
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
      // A student sees "Learning goal", not the reporting codes; a teacher
      // repairing a question keeps them (StandardBadge audience).
      audience={executionScope === 'teacherRepairPreview' ? 'teacher' : 'student'}
      style={{ margin: '8px 0 0', maxWidth: '860px' }}
    />
  ) : null;

  const questionReferencePanel = referenceInfo
    ? <ReferenceInfoCard referenceInfo={referenceInfo} />
    : null;

  const guidedCoachEnabled = resolvedActivityPolicy?.hintsAllowed !== false
    && guidedNotesMode !== 'off'
    && (guidedMode || supportPresentation.visualChunking);
  // Guided Notes reads the question and its own saved step outside the
  // module's boundary: if it cannot render, the question goes on without it.
  const guidedCoach = (
    <QuestionSupplementBoundary stage="guided-notes" context={failureContext} draftKey={draftKey} resetKey={supplementResetKey}>
      <GuidedClassworkCoach
        question={processedQuestion}
        draftKey={draftKey}
        enabled={guidedCoachEnabled}
        mode={guidedNotesMode}
        activeStageId={workflowGuidanceState?.currentStageId || null}
        workflowProgress={workflowGuidanceState}
        disabled={locked}
      />
    </QuestionSupplementBoundary>
  );
  // An intercept question ends with two ordered pairs, not a solved equation,
  // so the Step Algebra label would name work the student never did.
  const submitLabel = submitting
    ? (hostSubmitLabel ? 'Recording…' : 'Checking…')
    : hostSubmitLabel
      ? hostSubmitLabel
    : algebraWorkspaceRoute.route === ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS
      ? 'Submit Intercepts'
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
      id: 'calculator',
      label: 'Calculator',
      // Drawn, not an emoji: 🧮 is a box on devices without a Unicode 11 emoji
      // font (CalculatorIcon.jsx). The Work View rail renders `icon` before the label.
      icon: <CalculatorIcon unavailable={!calculatorPolicy?.available} />,
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

  const barContinueAction = !locked
    ? null
    : sectionComplete && typeof onContinueSection === 'function'
      ? { label: `Continue to ${continueSectionLabel || 'next section'} →`, onClick: onContinueSection }
      : !sectionComplete && typeof onNextQuestion === 'function'
        ? { label: 'Next question →', onClick: onNextQuestion }
        : null;

  // UNDO BELONGS WHERE THE HANDS ARE. These lived in a centred row above the
  // tool, which meant that on any question tall enough to scroll — which is most
  // graph questions — the student was several screens away from the control that
  // takes back the arrow they just drew. The work bar keeps them beside the
  // submit button at the bottom of the viewport instead.
  const questionWorkBar = (
    <>
      {/* Every tool in this bar is an icon plus a word in its own span, so a
          phone whose bar also carries Submit / Next can show the icons alone
          and keep ONE row (MathToolMobileLayout.css). The word stays in the
          accessible name. */}
      {!scratchpadOpen ? <UniversalUndoButton className="mm-button-neutral mathmaster-work-bar-tool" controller={undoController} disabled={locked} style={{ minHeight: '44px', padding: '9px 14px', borderRadius: '999px', border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 'bold', cursor: undoController?.canUndo && !locked ? 'pointer' : 'not-allowed', opacity: undoController?.canUndo && !locked ? 1 : 0.45 }} /> : null}
      {!scratchpadOpen ? (
        <button
          className="mm-button-neutral mathmaster-work-bar-tool"
          type="button"
          onClick={handleResetQuestion}
          disabled={workspaceActions.reset.disabled}
          title={workspaceActions.reset.title}
          aria-label={resettingQuestion ? 'Resetting…' : 'Reset Question'}
          style={{ minHeight: '44px', padding: '9px 14px', borderRadius: '999px', border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 'bold', cursor: workspaceActions.reset.disabled ? 'not-allowed' : 'pointer', opacity: workspaceActions.reset.disabled ? 0.45 : 1 }}
        >
          {/* "Question" drops on a phone so the work bar fits one row. */}
          {resettingQuestion ? 'Resetting…' : <><span aria-hidden="true">↺</span><span className="mathmaster-action-label"> Reset<span className="mathmaster-action-label-long"> Question</span></span></>}
        </button>
      ) : null}
      <button className="mm-button-neutral mathmaster-work-bar-tool" type="button" onClick={openScratchpad} disabled={scratchpadLoading} aria-label={scratchpadLoading ? 'Opening scratchpad…' : 'Scratchpad'} style={{ minHeight: '44px', padding: '9px 14px', borderRadius: '999px', border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 'bold', cursor: 'pointer' }}>
        {scratchpadLoading ? 'Opening…' : <><span aria-hidden="true">✎</span><span className="mathmaster-action-label"> Scratchpad</span></>}
      </button>
      <button
        type="button"
        className="mathmaster-work-bar-tool"
        onClick={handleCalculatorControl}
        aria-expanded={calculatorPolicy?.available ? calculatorOpen : false}
        aria-disabled={!calculatorPolicy?.available}
        aria-label={calculatorPolicy?.available ? 'Calculator' : `Calculator unavailable. ${calculatorUnavailableReason}`}
        title={calculatorPolicy?.available ? 'Open the calculator' : calculatorUnavailableReason}
        style={{
          minHeight: '44px',
          padding: '9px 14px',
          borderRadius: '999px',
          border: calculatorPolicy?.available ? '1px solid var(--mm-tint-border)' : '1px solid var(--mm-error-border-soft)',
          background: calculatorPolicy?.available && calculatorOpen ? 'var(--mm-primary-subtle)' : calculatorPolicy?.available ? 'var(--mm-surface)' : 'var(--mm-error-bg)',
          color: calculatorPolicy?.available ? 'var(--mm-primary-text)' : 'var(--mm-error-text)',
          fontWeight: 'bold',
          cursor: 'pointer',
          opacity: calculatorPolicy?.available ? 1 : 0.9,
        }}
      >
        {calculatorPolicy?.available
          ? <><CalculatorIcon /><span className="mathmaster-action-label"> Calculator</span></>
          : <><CalculatorIcon unavailable /><span className="mathmaster-action-label"> Calculator</span></>}
      </button>
      {readAloudOffered && (
        <button type="button" className="mathmaster-work-bar-tool" aria-label="Read aloud" onClick={() => { if (speakText(referenceSpeechText, readAloudLanguage)) reportSupportEvidence('text-to-speech', 'used'); }} style={{ minHeight: '44px', padding: '9px 14px', borderRadius: '999px', border: '1px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 'bold', cursor: 'pointer' }}><span aria-hidden="true">🔊</span><span className="mathmaster-action-label"> Read</span></button>
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
            border: `1px solid ${assignmentLocked && !terminalFeedbackHidden && record.status !== 'correct' && !isExpired ? 'var(--mm-border-strong)' : terminalFeedbackHidden ? 'var(--mm-tint-border)' : (record.status === 'attempted' || (record.status === 'expired' && !isExpired)) ? '#f9ab00' : isExpired ? 'var(--mm-error-border-soft)' : record.status === 'correct' ? 'var(--mm-success-border)' : 'var(--mm-tint-border)'}`,
            background: terminalFeedbackHidden ? 'var(--mm-surface-tint)' : (record.status === 'attempted' || (record.status === 'expired' && !isExpired)) ? 'var(--mm-warning-bg)' : isExpired ? 'var(--mm-error-bg)' : record.status === 'correct' ? 'var(--mm-success-bg)' : 'var(--mm-surface-tint)',
            color: 'var(--mm-text)',
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

      {/* One quiet line in the student's words. It was a full-weight banner in
          grading vocabulary ("records the daily DOL grade during the active
          class window"), louder than the task it sat under. */}
      {dolMode && <div style={{ margin: '0 auto 12px', maxWidth: '860px', padding: '7px 12px', borderRadius: '10px', background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', fontSize: '14px', fontWeight: 800 }}>DOL exit ticket · this question counts toward today&apos;s DOL grade.</div>}
      {questionGradeWeight !== 1 && (
        <div style={{ margin: '0 auto 12px', maxWidth: '860px', padding: '9px 13px', borderRadius: '10px', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 900 }}>
          Grade weight ×{questionGradeWeight} · this question contributes {questionGradeWeight} times a standard-weight question to the assignment grade.
        </div>
      )}

      {formulaAnchor && supportPresentation.inclusion && (
        <aside style={{ position: 'sticky', top: '8px', zIndex: 4, margin: '0 0 12px auto', width: 'fit-content', maxWidth: '100%', padding: '10px 14px', borderRadius: '10px', background: 'var(--mm-warning-soft)', border: '1px solid #f9ab00', color: 'var(--mm-warning-text)', boxShadow: '0 4px 12px rgba(95,68,0,0.12)' }}>
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
        <aside style={{ maxWidth: '860px', margin: '0 auto 18px', padding: '12px 15px', border: '1px solid var(--mm-tint-border)', borderRadius: '10px', background: 'var(--mm-surface-tint)', textAlign: 'left', color: 'var(--mm-text)' }}>
          <strong style={{ color: 'var(--mm-primary-text)' }}>Context:</strong> {processedQuestion.context.scenario}
        </aside>
      )}

    </div>
  );

  return (
    <DeferredFocusProvider authority={focusAuthority}>
    <QuestionLifecycleProvider terminal={locked}>
    <WorkViewUndoProvider register={setUndoController} baseController={baseUndoController} resetKey={`${processedQuestion?.questionId ?? processedQuestion?.id ?? processedQuestion?.prompt ?? 'question'}|${questionResetVersion}`}>
    <div
      ref={questionEngineRef}
      className={`mathmaster-question-engine mathmaster-question-engine-has-anchor ${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      // Any press, keystroke or edit inside the question (portals included:
      // React delivers their events here too) is the student interacting.
      onPointerDownCapture={markStudentInteraction}
      onInputCapture={markStudentInteraction}
      onChangeCapture={markStudentInteraction}
      onKeyDownCapture={(event) => {
        markStudentInteraction();
        // THE ENTER CONTRACT (answerEntryUx.js), for the question as a whole.
        // A field that owns its own Enter (a MathInput with onSubmit, a stage
        // check) keeps it: this capture handler runs before theirs and must not
        // swallow it. Otherwise, with a submit available:
        //   incomplete           Enter moves to the next empty box
        //   one box, complete    Enter submits (the single-answer convention)
        //   several boxes, a DOL
        //   or a one-try item    Enter brings Submit into focus; a second,
        //                        deliberate Enter presses it
        // Textareas, selects and the calculator keep Enter throughout.
        if (event.target?.closest?.('[data-mm-enter-owner]')) return;
        const multipart = isComposed || countAnswerControls(questionEngineRef.current) > 1;
        const deliberate = Boolean(dolMode) || resolvedMaximumAttempts <= 1;
        const intent = resolveQuestionEnterIntent({
          event,
          responseComplete: answerState.isComplete,
          canSubmit: shouldShowSubmit && !locked,
          // Counted, not read off the type: a one-box `multiAnswer` is a
          // single answer and keeps Enter-to-submit.
          multipart,
          deliberateSubmit: deliberate,
        });
        if (intent === 'none') return;
        if (intent === 'next-field') {
          // A composed question's stages own their Enter; only a plain form of
          // boxes gets "next box".
          if (isComposed) return;
          event.preventDefault();
          event.stopPropagation();
          const next = nextEmptyAnswerField(questionEngineRef.current, event.target);
          if (next) {
            focusForEnter(next);
            return;
          }
          // Every box on the page is filled, but this render has not caught up
          // with the keystroke just before Enter ("6⏎" typed quickly left the
          // question looking incomplete and Enter did nothing). Decide once the
          // answer state has caught up — a few frames — from fresh state.
          const deadline = performance.now() + 400;
          // Moving to Submit a few frames from now is a deferred focus like any
          // other: a press or key after this Enter means the student went on.
          const enterTicket = focusAuthority.ticket({ since: 'now', channel: 'enter' });
          const decideWhenCurrent = () => {
            const fresh = enterFreshRef.current;
            if (!fresh?.isComplete) {
              if (performance.now() < deadline) window.requestAnimationFrame(decideWhenCurrent);
              return;
            }
            if (fresh.submitDisabled) return;
            if (multipart || deliberate) {
              if (focusAuthority.isLive(enterTicket)) focusForEnter(submitButtonRef.current);
            } else fresh.handleSubmit();
          };
          window.requestAnimationFrame(decideWhenCurrent);
          return;
        }
        if (submitDisabled) return;
        event.preventDefault();
        event.stopPropagation();
        if (intent === 'focus-submit') focusForEnter(submitButtonRef.current);
        else handleSubmit();
      }}
      style={{ position: 'relative', padding: '10px', textAlign: 'center', fontFamily: 'sans-serif', overflow: 'visible' }}
    >
      <MobileViewportContainer
        originalTaskPrompt={processedQuestion?.prompt || processedQuestion?.scenario || 'Complete the math task.'}
        currentStagePrompt={taskContextPresentation.currentStagePrompt}
        taskMeta={questionAlignmentPanel}
        taskContextPanel={questionReferencePanel}
        contextPanel={solverWorkspaceActive ? null : questionContextPanel}
        supportTray={supportTrayFor('assignment')}
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
        // The same Support tools inside Work View, so an enlarged tool never
        // loses them (rendered only while that drawer is open).
        supports: languageTools.tools.length ? { label: 'Support tools', render: () => supportTrayFor('enlarged') } : null,
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
        {pausedByAnotherTab ? (
          <div
            role="status"
            data-active-work-paused="true"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, margin: '0 auto 12px', maxWidth: 860, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--mm-info-border, var(--mm-primary-border))', background: 'var(--mm-info-bg, var(--mm-primary-soft))', color: 'var(--mm-text-strong)' }}
          >
            <span style={{ flex: '1 1 260px', lineHeight: 1.5 }}>
              <strong>This question is open in another tab.</strong> It is paused here so your work stays in one place.
            </span>
            <button
              type="button"
              onClick={() => {
                // Take the question back, then re-read the latest saved work:
                // the module remounts and loads its draft from storage.
                activeWorkTab.continueHere();
                setAnswerState(EMPTY_ANSWER_STATE);
                setQuestionResetVersion((current) => current + 1);
              }}
              style={{ minHeight: 44, padding: '9px 16px', border: 0, borderRadius: 10, background: 'var(--mm-primary, #174ea6)', color: 'var(--mm-on-primary, #ffffff)', fontWeight: 800, cursor: 'pointer' }}
            >
              Continue here
            </button>
          </div>
        ) : null}
        {resolutionFailurePanel || (
        <fieldset disabled={locked || scaffoldRequired || contextScaffoldRequired || submitting || pausedByAnotherTab} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {/* `inert` must be a boolean: React 19 reads inert="" as false, which
              left a completed answer's math field focused and editable (and
              swallowing the Enter that should continue). pointer-events alone
              only stops the mouse. */}
          <div aria-disabled={locked || scaffoldRequired || contextScaffoldRequired || submitting || pausedByAnotherTab ? 'true' : undefined} inert={locked || scaffoldRequired || contextScaffoldRequired || submitting || pausedByAnotherTab ? true : undefined} style={{ pointerEvents: locked || scaffoldRequired || contextScaffoldRequired || submitting || pausedByAnotherTab ? 'none' : 'auto', opacity: locked ? 0.72 : scaffoldRequired || contextScaffoldRequired || pausedByAnotherTab ? 0.5 : 1 }}>
            <QuestionModuleBoundary
              key={`${generationKey}|${record.variantIndex}|reset-${questionResetVersion}`}
              questionType={processedQuestion?.type}
              resetKey={`${generationKey}|${record.variantIndex}|reset-${questionResetVersion}`}
              context={{
                assignmentId,
                questionId: processedQuestion?.questionId ?? processedQuestion?.id ?? null,
                family: processedQuestion?.questionFamily?.id ?? question?.questionFamily?.id ?? familyDelivery?.familyId ?? null,
                activityRole,
                lifecycle: assignmentLocked ? 'section-locked' : isCorrect ? 'correct' : isExpired ? 'expired' : 'open',
                draftKey,
                variant: failureContext.variant,
                attempts: failureContext.attempts,
                origin: failureContext.origin,
                pinKind: failureContext.pinKind,
                pinRef: failureContext.pinRef,
              }}
              onRecover={draftKey && moduleRecoveries < 1 ? handleRecoverQuestionModule : null}
            >
              {renderModule()}
            </QuestionModuleBoundary>
          </div>
        </fieldset>
        )}

        {scaffoldRequired && (
          <div role="dialog" aria-modal="true" aria-label="Productive struggle scaffold" style={{ position: 'absolute', inset: 0, zIndex: 35, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(232,240,254,0.78)' }}>
            <div style={{ width: 'min(560px, 94%)', padding: '24px', borderRadius: '16px', background: 'var(--mm-surface)', border: '3px solid #1a73e8', boxShadow: '0 20px 55px rgba(26,115,232,0.25)', textAlign: 'left' }}>
              <div style={{ fontSize: '12px', fontWeight: 900, color: 'var(--mm-primary-text)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Let&apos;s back up</div>
              <h2 style={{ margin: '8px 0 16px', color: 'var(--mm-text-strong)' }}>{scaffold.prompt}</h2>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(scaffold.options || []).map((option) => (
                  <button key={option} type="button" onClick={() => { if (String(option) === String(scaffold.correct)) { setScaffoldComplete(true); setScaffoldMessage(''); } else setScaffoldMessage('Try the other choice. This support step does not use an attempt.'); }} style={{ padding: '11px 18px', borderRadius: '9px', border: '1px solid var(--mm-primary-border)', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 900, cursor: 'pointer' }}>{option}</button>
                ))}
              </div>
              {scaffoldMessage && <p style={{ margin: '14px 0 0', color: 'var(--mm-error-text)', fontWeight: 'bold' }}>{scaffoldMessage}</p>}
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
              color: expiredAlmost ? 'var(--mm-warning-text)' : 'var(--mm-error-text)',
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
        <button ref={submitButtonRef} type="button" className="mathmaster-bar-submit" onClick={handleSubmit} disabled={submitDisabled} style={{ minHeight: '44px', padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', border: 'none', borderRadius: '8px', background: submitDisabled ? 'var(--mm-surface-control-strong)' : '#1a73e8', color: submitDisabled ? 'var(--mm-disabled-text)' : 'white', cursor: submitDisabled ? 'not-allowed' : 'pointer', boxShadow: submitDisabled ? 'none' : '0 4px 6px rgba(26, 115, 232, 0.2)' }}>
          {submitLabel}
        </button>
        ) : barContinueAction ? (
        // THE NEXT STEP GOES WHERE SUBMIT WAS. The large continuation card is
        // rendered after the question container, which on a phone is a fixed
        // 100dvh box with overflow hidden: after a correct answer "Next
        // Question" sat at y=939 of an 844px screen, clipped and unreachable
        // (live QA round 2). On desktop it sat ~100px below the fold.
        <button
          type="button"
          className="mathmaster-bar-continue"
          onClick={barContinueAction.onClick}
          style={{ minHeight: '44px', padding: '12px 20px', fontSize: '16px', fontWeight: 'bold', border: 'none', borderRadius: '8px', background: '#1a73e8', color: 'white', cursor: 'pointer', boxShadow: '0 4px 6px rgba(26, 115, 232, 0.2)', whiteSpace: 'nowrap' }}
        >
          {barContinueAction.label}
        </button>
        ) : null}
      />

      <CalculatorPanel
        policy={calculatorPolicy}
        estimationRequired={processedQuestion?.estimationRequired === true}
        onCalculatorOpened={markCalculatorOpened}
        open={calculatorOpen}
        onOpenChange={setCalculatorOpen}
        showLauncher={false}
      />

      {sameIncorrectResponse && !isMultipart && !locked && (
        <p style={{ marginTop: '10px', color: 'var(--mm-text-muted)', fontWeight: 'bold' }}>You may submit the same response again. No answer change is required.</p>
      )}

      {/* A question the server cannot grade is not quietly marked wrong: the
          student is told it was not submitted, which is what happened. */}
      {feedback?.blocked && (
        <div role="alert" style={{ margin: '25px auto 0', padding: '15px', maxWidth: '700px', borderRadius: '8px', background: 'var(--mm-warning-bg)', border: '1px solid #f9ab00', color: 'var(--mm-warning-text)', fontSize: '15px', fontWeight: 'bold' }}>
          {feedback.message}
        </div>
      )}

      {/* role="status": the attempt outcome ("Not quite. You have 2 attempts
          remaining") was the one grading message a screen reader never heard —
          only the Correct overlay was a live region (platform quirks audit).
          Rendered only when outcome feedback is allowed, so a DOL stays silent.
          A registry tool that showed its own verdict shows this outcome beside
          it instead (`outcomeInTool`, PQ-022): one place, one announcement. */}
      {feedback && !feedback.blocked && showOutcomeFeedback && !outcomeInTool && (
        <div role="status" style={{ margin: '25px auto 0', padding: '15px', maxWidth: '700px', borderRadius: '8px', backgroundColor: feedback.isCorrect ? 'var(--mm-success-bg)' : 'var(--mm-error-bg)', color: feedback.isCorrect ? 'var(--mm-success-text)' : 'var(--mm-danger)', fontSize: '16px', fontWeight: 'bold' }}>
          {attemptOutcomeText}
          {!feedback.isCorrect && isComposed && workflowSubmissionReview?.parts?.some((part) => part?.graded !== false && !part?.isCorrect) && (
            <div style={{ marginTop: '9px', paddingTop: '9px', borderTop: '1px solid rgba(197,34,31,0.24)' }}>
              The red steps above are the specific responses that need revision. MathMaster moved you to the first one.
            </div>
          )}
          {attemptOutcomeFocus && (
            <div style={{ marginTop: '9px', paddingTop: '9px', borderTop: '1px solid rgba(197,34,31,0.24)' }}>{attemptOutcomeFocus}</div>
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
              <small style={{ display: 'block', marginTop: 6, color: 'var(--mm-text-muted)', fontWeight: 750, textAlign: 'center' }}>{ENTER_TO_CONTINUE_HINT}</small>
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
            <span aria-hidden="true" style={{ width: '44px', height: '44px', flex: '0 0 44px', display: 'grid', placeItems: 'center', borderRadius: '999px', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontSize: '30px', lineHeight: 1, fontWeight: 950 }}>→</span>
          </button>
        </div>
      )}

      {terminalFeedbackHidden && (
        <div role="status" style={{ margin: '25px auto 0', padding: '15px', maxWidth: '700px', borderRadius: '8px', background: 'var(--mm-primary-subtle)', color: 'var(--mm-primary-text)', border: '1px solid var(--mm-primary-border)', fontSize: '15px', fontWeight: 'bold' }}>
          {heldFeedbackMessage}
        </div>
      )}

      {assignmentLocked && !isCorrect && !isExpired && !lockReasonInAttemptStrip && (
        <div style={{ margin: '25px auto 0', padding: '18px', maxWidth: '700px', borderRadius: '10px', border: '2px solid #5f6368', background: 'var(--mm-surface-control)', color: 'var(--mm-text)' }}><strong>{assignmentLockedMessage || 'This assignment is permanently closed.'}</strong>{!assignmentLockedMessage && ' The saved response is available for review, but no changes or submissions are allowed.'}</div>
      )}

      {isExpired && showOutcomeFeedback && (
        <div style={{ margin: '25px auto 0', padding: '18px', maxWidth: '700px', borderRadius: '10px', border: `2px solid ${expiredAlmost ? '#f9ab00' : '#d93025'}`, background: expiredAlmost ? 'var(--mm-warning-bg)' : 'var(--mm-error-bg)', color: expiredAlmost ? 'var(--mm-warning-text)' : 'var(--mm-error-text)', position: 'relative', zIndex: 45 }}>
          <strong>This response is closed after {resolvedMaximumAttempts} {resolvedMaximumAttempts === 1 ? 'attempt' : 'attempts'}.</strong>
          {/* A CLOSED QUESTION STAYS A QUESTION. The review renders only once
              the question is closed, from the question's data, outside the
              module's boundary; lmr-wu-1's review threw there and took the
              whole question with it (QuestionSupplementBoundary.jsx). */}
          <QuestionSupplementBoundary
            stage="solution-review"
            context={failureContext}
            draftKey={draftKey}
            resetKey={supplementResetKey}
            fallback={<p role="status" style={{ margin: '10px 0 0' }}>The worked solution for this question could not be shown here. Your answers, attempts and grade are kept exactly as they are.</p>}
          >
            {missingToolDefinition
              ? <ToolSolutionReview question={processedQuestion} />
              : <SolutionReview question={processedQuestion} incorrectParts={feedback?.incorrectParts || []} />}
          </QuestionSupplementBoundary>
          {resolvedActivityPolicy?.allowReplacement && (
            <>
              <p style={{ margin: '8px 0 14px' }}>Review the solution, then request a new problem at the same difficulty.</p>
              <button type="button" onClick={handleRequestNewQuestion} disabled={requesting || assignmentLocked} style={{ padding: '11px 18px', border: 'none', borderRadius: '8px', background: requesting || assignmentLocked ? 'var(--mm-surface-control-strong)' : '#1a73e8', color: requesting || assignmentLocked ? 'var(--mm-disabled-text)' : '#fff', fontWeight: 'bold', cursor: requesting || assignmentLocked ? 'not-allowed' : 'pointer' }}>
                {requesting ? 'Creating New Question…' : 'Request New Question'}
              </button>
            </>
          )}
        </div>
      )}

      {unchangedConfirmOpen && (
        <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setUnchangedConfirmOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(32,33,36,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div role="dialog" aria-modal="true" style={{ width: 'min(520px, 94vw)', padding: '24px', borderRadius: '14px', background: 'var(--mm-surface)', boxShadow: '0 24px 70px rgba(0,0,0,0.35)', textAlign: 'left' }}>
            <h2 style={{ marginTop: 0, color: 'var(--mm-text-strong)' }}>Your values have not changed</h2>
            <p style={{ color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>This multipart response is identical to the previous submission. You may still use another attempt with the same values. Continue submitting?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" onClick={() => setUnchangedConfirmOpen(false)} style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', fontWeight: 'bold' }}>Go Back</button>
              <button type="button" onClick={performSubmit} style={{ padding: '10px 15px', borderRadius: '8px', border: 'none', background: '#1a73e8', color: '#fff', fontWeight: 'bold' }}>Submit Unchanged Values</button>
            </div>
          </div>
        </div>
      )}

      <ScratchpadOverlay open={scratchpadOpen} questionKey={processedQuestion?.questionId ?? processedQuestion?.id ?? null} questionDetails={scratchpadQuestionDetails} initialDataUrl={scratchpadDataUrl} initialPages={scratchpadPages} onSave={saveScratchpad} onClose={() => setScratchpadOpen(false)} readOnly={locked} gridBackground={supportPresentation.graphPaper === true} />
    </div>
    </WorkViewUndoProvider>
    </QuestionLifecycleProvider>
    </DeferredFocusProvider>
  );
}

/*
 * THE QUESTION-LEVEL BOUNDARY AROUND EVERYTHING THE ENGINE PREPARES.
 *
 * The body above resolves the question before any module renders: runtime
 * repair, the Question Family instance (replayed from its delivery pin), the
 * word-problem layer, and every memo derived from them. A throw there used to
 * escape to AppErrorBoundary and take down the whole assignment.
 * QuestionResolutionBoundary contains it to this question; navigation, the
 * neighbouring questions and the grade display all live outside it. "Try
 * again" remounts the body, which prepares the question from scratch —
 * always safe, because preparing a question writes nothing.
 */
export default function QuestionEngine(props) {
  const [resolutionAttempt, setResolutionAttempt] = useState(0);
  const retry = useCallback(() => setResolutionAttempt((value) => value + 1), []);
  const { question, generationKey, assignmentId, activityRole, executionScope, onNextQuestion, nextQuestionLabel, questionRecord } = props;
  const record = questionRecord && typeof questionRecord === 'object' ? questionRecord : {};
  // Read defensively: this runs above the boundary, on a question that may be
  // the very thing that cannot be prepared.
  const context = questionFailureContext({
    assignmentId,
    question,
    questionRecord: record,
    familyContext: props.familyContext,
    activityRole,
    executionScope,
    assignmentLocked: props.assignmentLocked,
  });
  return (
    <QuestionResolutionBoundary
      resetKey={`${generationKey ?? ''}|${context.questionId ?? ''}|${resolutionAttempt}`}
      context={context}
      executionScope={executionScope ?? 'student'}
      onRetry={retry}
      onNextQuestion={onNextQuestion}
      nextQuestionLabel={nextQuestionLabel}
      hasRecordedWork={(Number(record.totalAttempts) || 0) > 0 || ['correct', 'expired'].includes(record.status)}
      onResolutionFailure={props.onResolutionFailure}
      technicalDetails={props.resolutionTechnicalDetails !== false}
      draftKey={props.draftKey || null}
    >
      <QuestionEngineBody key={resolutionAttempt} {...props} onResolutionRetry={retry} />
    </QuestionResolutionBoundary>
  );
}
