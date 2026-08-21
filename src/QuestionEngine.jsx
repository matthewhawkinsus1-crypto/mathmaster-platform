import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GraphLine from './GraphLine';
import EquationGrader from './EquationGrader';
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
import MultiRelationAlgebra from './MultiRelationAlgebra';
import { needsMultiRelationWorkspace } from './algebraRelationFoundation.js';
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
import { removeQuestionDraftFamily } from './questionDraftStorage';
import CalculatorPanel from './components/CalculatorPanel';
import ProblemUnderstandingPanel from './components/ProblemUnderstandingPanel';
import MobileViewportContainer from './components/student/MobileViewportContainer';
import { normalizeContextualQuestion } from './platform/context/wordProblemLayer';
import { getEffectiveActivityPolicy } from './platform/policies/activityPolicies';
import { resolveCalculatorPolicy } from './platform/policies/calculatorPolicy';
import { getToolDefinition } from './tools/toolRegistry';
import { buildRawPathResponse } from './platform/path/pathToolResponses';
import { ToolRuntimeProvider } from './tools/shared/ToolRuntimeContext';
import InteractiveModelingLabPlayer from './components/labs/InteractiveModelingLabPlayer.jsx';
import { useToast } from './ui/Toast';
import QuestionModuleBoundary from './QuestionModuleBoundary';
import QuestionPrompt from './QuestionPrompt';
import StandardBadge from './components/common/StandardBadge.jsx';
import { normalizeQuestionStandards } from './questionMetadata';
import ReferenceInfoCard from './ReferenceInfoCard';
import { resolveReferenceInfo } from './referenceInfo';
import {
  getAttemptsRemaining,
  MAX_ATTEMPTS_PER_QUESTION,
  normalizeQuestionRecord,
} from './attemptPolicy';
import { stableStringify } from './utils/idUtils';

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
  questionRecord,
  maximumAttempts = null,
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
}) {
  const resolvedActivityPolicy = activityPolicy || getEffectiveActivityPolicy(activityRole);
  const resolvedMaximumAttempts = Math.max(1, Number(maximumAttempts ?? resolvedActivityPolicy?.attempts ?? MAX_ATTEMPTS_PER_QUESTION) || MAX_ATTEMPTS_PER_QUESTION);
  const showOutcomeFeedback = resolvedActivityPolicy?.feedback === 'immediate' || feedbackReleased === true;
  const stableQuestion = useDeepStableValue(question);
  const stableStudentProfile = useDeepStableValue(studentProfile);
  const processedQuestion = useMemo(
    () => normalizeContextualQuestion(generateQuestion(stableQuestion, generationKey, stableStudentProfile)),
    [stableQuestion, generationKey, stableStudentProfile],
  );
  // The primary standard this question is aligned to, for the badge beneath the
  // prompt. Read through the same normalizer the rest of the platform uses, so
  // a question aligned in any of the accepted shapes resolves the same way.
  const questionStandardCode = useMemo(
    () => normalizeQuestionStandards(processedQuestion).primary?.[0]?.code || '',
    [processedQuestion],
  );
  const referenceInfo = useMemo(() => resolveReferenceInfo(processedQuestion), [processedQuestion]);
  const presentationQuestion = useMemo(
    () => (referenceInfo ? { ...processedQuestion, suppressScenarioDisplay: true } : processedQuestion),
    [processedQuestion, referenceInfo],
  );
  const referenceSpeechText = useMemo(
    () => [processedQuestion?.prompt, ...(referenceInfo?.statements || []).map((entry) => entry?.text)].filter(Boolean).join('. '),
    [processedQuestion?.prompt, referenceInfo],
  );
  const { confirm: confirmAction } = useToast();
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
  const record = normalizeQuestionRecord(questionRecord);
  const [answerState, setAnswerState] = useState(EMPTY_ANSWER_STATE);
  const [feedback, setFeedback] = useState(null);
  const [lastSubmittedResponseKey, setLastSubmittedResponseKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [undoController, setUndoController] = useState(null);
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [scratchpadLoading, setScratchpadLoading] = useState(false);
  const previousSectionCompleteRef = useRef(Boolean(sectionComplete));
  const [sectionCompletionCelebrating, setSectionCompletionCelebrating] = useState(false);

  useEffect(() => {
    const wasComplete = previousSectionCompleteRef.current;
    previousSectionCompleteRef.current = Boolean(sectionComplete);
    if (wasComplete || !sectionComplete) return undefined;
    setSectionCompletionCelebrating(true);
    const timer = window.setTimeout(() => setSectionCompletionCelebrating(false), 1400);
    return () => window.clearTimeout(timer);
  }, [sectionComplete]);
  const [scratchpadDataUrl, setScratchpadDataUrl] = useState('');
  const [unchangedConfirmOpen, setUnchangedConfirmOpen] = useState(false);
  const [scaffoldComplete, setScaffoldComplete] = useState(false);
  const [scaffoldMessage, setScaffoldMessage] = useState('');
  const [contextScaffoldComplete, setContextScaffoldComplete] = useState(false);
  const [contextScaffoldUsed, setContextScaffoldUsed] = useState(false);
  const [calculatorUsed, setCalculatorUsed] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [workflowGuidanceState, setWorkflowGuidanceState] = useState(null);

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
    setRequesting(false);
    setUndoController(null);
    setScratchpadOpen(false);
    setScratchpadDataUrl('');
    setUnchangedConfirmOpen(false);
    setScaffoldComplete(false);
    setScaffoldMessage('');
    setContextScaffoldComplete(false);
    setContextScaffoldUsed(false);
    setCalculatorUsed(false);
    setHintUsed(false);
    setWorkflowGuidanceState(null);
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
    setUndoController(controller ? { ...controller } : null);
  }, []);

  const remainingAttempts = getAttemptsRemaining(record, resolvedMaximumAttempts);
  const isCorrect = record.status === 'correct' || feedback?.status === 'correct';
  const isExpired = record.status === 'expired' || feedback?.expired;
  const locked = Boolean(isCorrect || isExpired || assignmentLocked);
  const sameIncorrectResponse =
    record.status === 'attempted' &&
    Boolean(answerState.responseKey) &&
    answerState.responseKey === (record.lastResponseKey || lastSubmittedResponseKey);
  const isMultipart = MULTIPART_TYPES.has(processedQuestion?.type) || (answerState.parts || []).length > 1;
  const scaffoldRequired = Boolean(resolvedActivityPolicy?.remediationAllowed !== false && supportPresentation.inclusion && record.status === 'attempted' && record.attemptCount >= 2 && !locked && !scaffoldComplete);
  const contextScaffoldEnabled = Boolean(processedQuestion?.context?.scenario && processedQuestion?.context?.scaffold?.enabled !== false);
  const contextScaffoldRequired = contextScaffoldEnabled && !contextScaffoldComplete && !locked;
  const terminalFeedbackHidden = !showOutcomeFeedback && (isCorrect || isExpired);
  const calculatorPolicy = useMemo(() => resolveCalculatorPolicy({
    questionSpec: processedQuestion || {},
    activityPolicy: resolvedActivityPolicy,
    studentSupportProfile: studentProfile,
    teacherCalculatorChoice,
    assessmentContext,
  }), [processedQuestion, resolvedActivityPolicy, studentProfile, teacherCalculatorChoice, assessmentContext]);
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
    if (!answerState.isComplete || submitting || locked) return;
    if (serverGrading) {
      setSubmitting(true);
      setUnchangedConfirmOpen(false);
      setLastSubmittedResponseKey(answerState.responseKey ?? '');
      try {
        setFeedback(await submitToServer(
          buildRawPathResponse({ pathToolId: serverGrading.pathToolId, answerState }),
          { responseKey: answerState.responseKey ?? '', questionDetails: answerState.questionDetails },
        ));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setSubmitting(true);
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
      setFeedback(
        result || {
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
        },
      );
    } finally {
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
      setAnswerState(EMPTY_ANSWER_STATE);
      setFeedback(null);
      setLastSubmittedResponseKey('');
      await onRequestNewQuestion({ clearHistory: Boolean(dolMode), clearBest: Boolean(dolMode) });
    } finally {
      setRequesting(false);
    }
  };

  const openScratchpad = async () => {
    if (scratchpadLoading) return;
    setScratchpadLoading(true);
    try {
      const saved = await onLoadScratchpad?.();
      setScratchpadDataUrl(saved?.dataUrl || '');
      setScratchpadOpen(true);
    } finally {
      setScratchpadLoading(false);
    }
  };

  const saveScratchpad = async (dataUrl, metadata) => {
    if (locked) return;
    await onSaveScratchpad?.(dataUrl, metadata);
    setScratchpadDataUrl(dataUrl);
  };

  const commonModuleProps = {
    question: presentationQuestion,
    onStateChange: setAnswerState,
    onUndoStateChange: registerUndo,
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
          onProgressChange={setWorkflowGuidanceState}
          disabled={commonModuleProps.disabled}
          draftKey={draftKey}
        />
      );
    }

    if (missingToolDefinition) {
      const Tool = missingToolDefinition.component;
      return (
        // Under server grading the tool must not render a verdict: it has no
        // answer key in its payload, so its own check would report "not yet"
        // for correct work. The server's result is shown below instead.
        <ToolRuntimeProvider showImmediateFeedback={showOutcomeFeedback && !serverGrading}>
          <Tool questionData={presentationQuestion} onAction={handleMissingToolAction} />
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
        return <FunctionGraphBuilder {...commonModuleProps} />;
      case 'graphAnalysis':
        return <GraphAnalysis {...commonModuleProps} />;
      case 'stepAlgebra':
        if (needsMultiRelationWorkspace(processedQuestion)) {
          return (
            <MultiRelationAlgebra
              {...commonModuleProps}
              questionRecord={record}
              onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
            />
          );
        }
        return (
          <StepByStepAlgebra
            {...commonModuleProps}
            questionRecord={record}
            onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
            maximumAttempts={resolvedMaximumAttempts}
          />
        );
      case 'algebra':
        return <EquationGrader {...commonModuleProps} />;
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
            question={literalWorkspace.question}
            questionRecord={record}
            onStepGrade={(payload) => onStepGrade?.({ ...payload, supportUsage: attemptSupportUsage() })}
            maximumAttempts={resolvedMaximumAttempts}
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
  const shouldShowSubmit = !missingToolDefinition && processedQuestion?.type !== 'modelingLab' && (processedQuestion?.type !== 'stepAlgebra' || answerState.isComplete);
  const scratchpadQuestionDetails = answerState.questionDetails || processedQuestion?.prompt || 'Show your work for this question.';
  const partialPercent = Math.max(Number(record.bestPartialCredit) || 0, Number(feedback?.partialCredit) || 0);
  const expiredAlmost = isExpired && partialPercent >= 50;
  const formulaAnchor = processedQuestion?.formulaAnchor || processedQuestion?.formulaLatex || null;
  const heldFeedbackMessage = resolvedActivityPolicy?.feedback === 'teacherRelease'
    ? 'Your response is recorded. Your teacher will release correctness feedback.'
    : 'Your response is recorded. Correctness feedback is held until the activity feedback window opens.';

  const questionContextPanel = (
    <div className="mathmaster-question-context-panel">
      <div className="mathmaster-desktop-question-anchor">
        <QuestionPrompt variant="task">{processedQuestion?.prompt || 'Complete the math task.'}</QuestionPrompt>
        {/* Which standard this is, and whether it counts toward a college,
            career or military assessment. A CCMR-aligned question inside an
            ordinary assignment used to look exactly like every other question,
            so the work a student was already doing toward those tests was
            invisible to them. Tools that lead with their own TaskCard show the
            same chip there. */}
        {questionStandardCode && (
          <StandardBadge code={questionStandardCode} style={{ margin: '0 auto 14px', maxWidth: '860px' }} />
        )}
      </div>
      <ReferenceInfoCard referenceInfo={referenceInfo} />
      {!supportPresentation.declutter && (
        <div
          role="status"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            margin: '0 auto 12px',
            padding: '12px 15px',
            maxWidth: '860px',
            borderRadius: '10px',
            border: `1px solid ${terminalFeedbackHidden ? '#c9d6e8' : record.status === 'attempted' ? '#f9ab00' : record.status === 'expired' ? '#e0b4b0' : record.status === 'correct' ? '#a8dab5' : '#d9e2f1'}`,
            background: terminalFeedbackHidden ? '#f4f7fb' : record.status === 'attempted' ? '#fef7e0' : record.status === 'expired' ? '#fce8e6' : record.status === 'correct' ? '#e6f4ea' : '#f8fbff',
            color: '#3c4043',
          }}
        >
          <strong>{terminalFeedbackHidden ? 'Response submitted' : record.status === 'correct' ? 'Question complete' : record.status === 'expired' ? 'This question is closed' : record.status === 'attempted' ? 'Question attempted' : `${resolvedMaximumAttempts} ${resolvedMaximumAttempts === 1 ? 'attempt' : 'attempts'} on this question`}</strong>
          <span>
            Variant {record.variantIndex + 1} · {terminalFeedbackHidden ? 'feedback held by activity policy' : `${remainingAttempts} of ${resolvedMaximumAttempts} attempts remaining`}
            {!terminalFeedbackHidden && record.bestPartialCredit > 0 && record.status !== 'correct' ? ` · ${record.bestPartialCredit}% partial credit` : ''}
          </span>
        </div>
      )}

      {dolMode && <div style={{ margin: '0 auto 12px', maxWidth: '860px', padding: '10px 14px', borderRadius: '10px', background: '#f3e8fd', color: '#681da8', fontWeight: 900 }}>DOL question · this question records the daily DOL grade during the active class window.</div>}

      <div aria-label="Question tools" style={{ display: 'flex', justifyContent: 'center', gap: '9px', flexWrap: 'wrap', margin: '0 auto 20px' }}>
        <button type="button" onClick={() => undoController?.onUndo?.()} disabled={!undoController?.canUndo || locked} title={undoController?.label || 'Undo the most recent response change'} style={{ padding: '9px 14px', borderRadius: '999px', border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 'bold', opacity: undoController?.canUndo && !locked ? 1 : 0.45 }}>
          ↶ Undo Last Action
        </button>
        <button type="button" onClick={openScratchpad} disabled={scratchpadLoading} style={{ padding: '9px 14px', borderRadius: '999px', border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>
          {scratchpadLoading ? 'Opening Scratchpad…' : locked ? '✎ View Scratchpad' : '✎ Open Scratchpad'}
        </button>
        {supportPresentation.textToSpeech && (
          <button type="button" onClick={() => speakText(referenceSpeechText)} style={{ padding: '9px 14px', borderRadius: '999px', border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>🔊 Read Question</button>
        )}
      </div>

      <CalculatorPanel
        policy={calculatorPolicy}
        estimationRequired={processedQuestion?.estimationRequired === true}
        onCalculatorOpened={() => setCalculatorUsed(true)}
      />

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
    <div
      className={`mathmaster-question-engine mathmaster-question-engine-has-anchor ${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      style={{ position: 'relative', padding: '10px', textAlign: 'center', fontFamily: 'sans-serif', overflow: 'hidden' }}
    >
      <MobileViewportContainer
        promptText={processedQuestion?.prompt || processedQuestion?.scenario || 'Complete the math task.'}
        contextPanel={questionContextPanel}
        toolWorkspace={(
      <div className="mathmaster-question-tool-workspace" style={{ position: 'relative' }}>
        <GuidedClassworkCoach
          question={processedQuestion}
          draftKey={draftKey}
          enabled={resolvedActivityPolicy?.hintsAllowed !== false && guidedNotesMode !== 'off' && (guidedMode || supportPresentation.visualChunking)}
          mode={guidedNotesMode}
          activeStageId={workflowGuidanceState?.currentStageId || null}
          workflowProgress={workflowGuidanceState}
          disabled={locked}
        />
        <fieldset disabled={locked || scaffoldRequired || contextScaffoldRequired || submitting} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div aria-disabled={locked || scaffoldRequired || contextScaffoldRequired || submitting ? 'true' : undefined} inert={locked || scaffoldRequired || contextScaffoldRequired || submitting ? '' : undefined} style={{ pointerEvents: locked || scaffoldRequired || contextScaffoldRequired || submitting ? 'none' : 'auto', opacity: locked ? 0.72 : scaffoldRequired || contextScaffoldRequired ? 0.5 : 1 }}>
            <QuestionModuleBoundary
              questionType={processedQuestion?.type}
              resetKey={`${generationKey}|${record.variantIndex}`}
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
        )}
        actionButtons={!locked && shouldShowSubmit ? (
        <button onClick={handleSubmit} disabled={submitDisabled} style={{ marginTop: '40px', padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', border: 'none', borderRadius: '8px', background: submitDisabled ? '#dadce0' : '#1a73e8', color: 'white', cursor: submitDisabled ? 'not-allowed' : 'pointer', boxShadow: submitDisabled ? 'none' : '0 4px 6px rgba(26, 115, 232, 0.2)' }}>
          {submitting ? 'Checking…' : processedQuestion?.type === 'stepAlgebra' ? 'Submit Solved Equation' : record.attemptCount > 0 ? 'Submit Another Attempt' : 'Submit Answer'}
        </button>
        ) : null}
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
            : feedback.expired
              ? `That was the final allowed attempt (${resolvedMaximumAttempts} total). This response is locked.${resolvedActivityPolicy?.allowReplacement ? ' Review the solution, then request a new question to continue.' : ''}`
              : `Not quite. You have ${feedback.remainingAttempts} ${feedback.remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining on this version.`)}
          {!feedback.isCorrect && Array.isArray(feedback.incorrectParts) && feedback.incorrectParts.length > 0 && (
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
            <button type="button" onClick={onContinueSection} className="mathmaster-section-completion-continue">
              <span>Continue to {continueSectionLabel || 'next section'}</span>
              <span aria-hidden="true">→</span>
            </button>
          ) : (
            <div className="mathmaster-section-completion-done">All currently available sections are complete.</div>
          )}
        </section>
      )}

      {isCorrect && showOutcomeFeedback && !sectionComplete && typeof onNextQuestion === 'function' && (
        <div role="navigation" aria-label="Continue to the next question" style={{ margin: '16px auto 6px', maxWidth: '700px', position: 'relative', zIndex: 50 }}>
          <button
            type="button"
            onClick={onNextQuestion}
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
              <span style={{ display: 'block', fontSize: '11px', fontWeight: 950, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.88 }}>You got it — keep going</span>
              <span style={{ display: 'block', marginTop: '3px', fontSize: '21px', fontWeight: 950 }}>Next Question</span>
              {(nextQuestionLabel || nextQuestionSectionLabel) && (
                <span style={{ display: 'block', marginTop: '2px', fontSize: '13px', fontWeight: 750, opacity: 0.92 }}>
                  {nextQuestionSectionLabel ? `${nextQuestionSectionLabel} · ` : ''}{nextQuestionLabel}
                </span>
              )}
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

      <ScratchpadOverlay open={scratchpadOpen} questionDetails={scratchpadQuestionDetails} initialDataUrl={scratchpadDataUrl} onSave={saveScratchpad} onClose={() => setScratchpadOpen(false)} readOnly={locked} />
    </div>
  );
}
