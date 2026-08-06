import { useCallback, useEffect, useMemo, useState } from 'react';
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
import ScratchpadOverlay from './ScratchpadOverlay';
import SolutionReview from './SolutionReview';
import GuidedClassworkCoach from './GuidedClassworkCoach';
import RelationshipModel from './RelationshipModel';
import GraphScenarioMatch from './GraphScenarioMatch';
import GraphComparison from './GraphComparison';
import GraphStory from './GraphStory';
import MathDisplay from './MathDisplay';
import { generateQuestion } from './problemGenerator';
import { buildSupportUsage, getStudentSupportPresentation } from './studentSupport';
import { removeQuestionDraftFamily } from './questionDraftStorage';
import {
  getAttemptsRemaining,
  MAX_ATTEMPTS_PER_QUESTION,
  normalizeQuestionRecord,
} from './attemptPolicy';

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
]);

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
  maximumAttempts = MAX_ATTEMPTS_PER_QUESTION,
  draftKey = null,
  studentProfile = null,
  guidedMode = false,
  assignmentLocked = false,
  replacementWarning = '',
  dolMode = false,
}) {
  const processedQuestion = useMemo(
    () => generateQuestion(question, generationKey, studentProfile),
    [question, generationKey, studentProfile],
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
  const [scratchpadDataUrl, setScratchpadDataUrl] = useState('');
  const [unchangedConfirmOpen, setUnchangedConfirmOpen] = useState(false);
  const [scaffoldComplete, setScaffoldComplete] = useState(false);
  const [scaffoldMessage, setScaffoldMessage] = useState('');

  const supportPresentation = useMemo(
    () => processedQuestion?.supportPresentation || getStudentSupportPresentation(studentProfile),
    [processedQuestion, studentProfile],
  );
  const supportUsage = useMemo(
    () => buildSupportUsage(studentProfile, question),
    [studentProfile, question],
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

  const remainingAttempts = getAttemptsRemaining(record, maximumAttempts);
  const isCorrect = record.status === 'correct' || feedback?.status === 'correct';
  const isExpired = record.status === 'expired' || feedback?.expired;
  const locked = Boolean(isCorrect || isExpired || assignmentLocked);
  const sameIncorrectResponse =
    record.status === 'attempted' &&
    Boolean(answerState.responseKey) &&
    answerState.responseKey === (record.lastResponseKey || lastSubmittedResponseKey);
  const isMultipart = MULTIPART_TYPES.has(processedQuestion?.type) || (answerState.parts || []).length > 1;
  const scaffoldRequired = Boolean(supportPresentation.inclusion && record.status === 'attempted' && record.attemptCount >= 2 && !locked && !scaffoldComplete);
  const scaffold = processedQuestion?.scaffold || (processedQuestion?.type === 'stepAlgebra'
    ? { prompt: 'Let’s back up. What operation undoes multiplication?', options: ['Add', 'Divide'], correct: 'Divide' }
    : processedQuestion?.type === 'functionGraph' || processedQuestion?.type === 'functionInvestigation'
      ? { prompt: 'Before continuing, must a plotted point match both its x-coordinate and y-coordinate?', options: ['Yes', 'No'], correct: 'Yes' }
      : { prompt: 'Before continuing, should you revise the specific parts identified in the feedback?', options: ['Yes', 'No'], correct: 'Yes' });

  const performSubmit = async () => {
    if (!answerState.isComplete || submitting || locked) return;
    setSubmitting(true);
    setUnchangedConfirmOpen(false);
    setLastSubmittedResponseKey(answerState.responseKey ?? '');
    try {
      const result = await onGrade(
        answerState.isCorrect,
        answerState.questionDetails,
        answerState.parts || [],
        supportUsage,
        answerState.responseKey ?? '',
      );
      setFeedback(
        result || {
          isCorrect: answerState.isCorrect,
          status: answerState.isCorrect ? 'correct' : 'attempted',
          attemptCount: record.attemptCount + 1,
          remainingAttempts: Math.max(0, maximumAttempts - record.attemptCount - 1),
          expired: !answerState.isCorrect && record.attemptCount + 1 >= maximumAttempts,
          incorrectParts: (answerState.parts || []).filter((part) => !part.isCorrect).map((part) => part.label),
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

  const handleRequestNewQuestion = async () => {
    if (!onRequestNewQuestion || requesting) return;
    if (replacementWarning && !window.confirm(replacementWarning)) return;
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
    question: processedQuestion,
    onStateChange: setAnswerState,
    onUndoStateChange: registerUndo,
    feedback,
    draftKey,
    disabled: locked || scaffoldRequired,
  };

  const renderModule = () => {
    if (!processedQuestion) return null;
    switch (processedQuestion.type) {
      case 'graphing':
        return <GraphLine {...commonModuleProps} />;
      case 'functionGraph':
      case 'functionInvestigation':
        return <FunctionGraphBuilder {...commonModuleProps} />;
      case 'graphAnalysis':
        return <GraphAnalysis {...commonModuleProps} />;
      case 'stepAlgebra':
        return (
          <StepByStepAlgebra
            {...commonModuleProps}
            questionRecord={record}
            onStepGrade={onStepGrade}
            maximumAttempts={maximumAttempts}
          />
        );
      case 'algebra':
        return <EquationGrader {...commonModuleProps} />;
      case 'numberLine':
        return <NumberLine {...commonModuleProps} />;
      case 'fraction':
        return <FractionGrader {...commonModuleProps} />;
      case 'literal':
        return <LiteralGrader {...commonModuleProps} />;
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
      default:
        return <div>Unknown question type: {processedQuestion.type}</div>;
    }
  };

  const submitDisabled = !answerState.isComplete || submitting || locked || scaffoldRequired;
  const shouldShowSubmit = processedQuestion?.type !== 'stepAlgebra' || answerState.isComplete;
  const scratchpadQuestionDetails = answerState.questionDetails || processedQuestion?.prompt || 'Show your work for this question.';
  const partialPercent = Math.max(Number(record.bestPartialCredit) || 0, Number(feedback?.partialCredit) || 0);
  const expiredAlmost = isExpired && partialPercent >= 50;
  const formulaAnchor = processedQuestion?.formulaAnchor || processedQuestion?.formulaLatex || null;

  return (
    <div
      className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      style={{ position: 'relative', padding: '10px', textAlign: 'center', fontFamily: 'sans-serif', overflow: 'hidden' }}
    >
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
            border: `1px solid ${record.status === 'attempted' ? '#f9ab00' : record.status === 'expired' ? '#e0b4b0' : record.status === 'correct' ? '#a8dab5' : '#d9e2f1'}`,
            background: record.status === 'attempted' ? '#fef7e0' : record.status === 'expired' ? '#fce8e6' : record.status === 'correct' ? '#e6f4ea' : '#f8fbff',
            color: '#3c4043',
          }}
        >
          <strong>{record.status === 'correct' ? 'Question complete' : record.status === 'expired' ? 'This question has expired' : record.status === 'attempted' ? 'Question attempted' : 'Three attempts on this question'}</strong>
          <span>
            Variant {record.variantIndex + 1} · {remainingAttempts} of {maximumAttempts} attempts remaining
            {record.bestPartialCredit > 0 && record.status !== 'correct' ? ` · ${record.bestPartialCredit}% partial credit` : ''}
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
          <button type="button" onClick={() => speakText(processedQuestion?.prompt)} style={{ padding: '9px 14px', borderRadius: '999px', border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>🔊 Read Question</button>
        )}
      </div>

      {formulaAnchor && supportPresentation.inclusion && (
        <aside style={{ position: 'sticky', top: '8px', zIndex: 4, margin: '0 0 12px auto', width: 'fit-content', maxWidth: '100%', padding: '10px 14px', borderRadius: '10px', background: '#fff4ce', border: '1px solid #f9ab00', color: '#5f4400', boxShadow: '0 4px 12px rgba(95,68,0,0.12)' }}>
          <strong style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>Formula anchor</strong>
          <MathDisplay value={formulaAnchor} format="latex" />
        </aside>
      )}

      <GuidedClassworkCoach
        question={processedQuestion}
        draftKey={draftKey}
        enabled={guidedMode || supportPresentation.visualChunking}
        oneStepReveal={supportPresentation.visualChunking}
        disabled={locked}
      />

      <div style={{ position: 'relative' }}>
        <fieldset disabled={locked || scaffoldRequired} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div aria-disabled={locked || scaffoldRequired ? 'true' : undefined} inert={locked || scaffoldRequired ? '' : undefined} style={{ pointerEvents: locked || scaffoldRequired ? 'none' : 'auto', opacity: locked ? 0.72 : scaffoldRequired ? 0.5 : 1 }}>
            {renderModule()}
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

        {isCorrect && (
          <div aria-label="Correct answer" role="status" style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'rgba(230,244,234,0.18)' }}>
            <div style={{ transform: 'rotate(-8deg)', textAlign: 'center', color: 'rgba(24,128,56,0.24)', textShadow: '0 2px 18px rgba(24,128,56,0.12)' }}>
              <div style={{ fontSize: 'clamp(120px, 24vw, 250px)', fontWeight: 900, lineHeight: 0.72 }}>✓</div>
              <div style={{ fontSize: 'clamp(42px, 8vw, 92px)', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Correct</div>
            </div>
          </div>
        )}

        {isExpired && (
          <div aria-label={expiredAlmost ? 'Almost, try again' : 'Incorrect, try again'} role="status" style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: expiredAlmost ? 'rgba(255,248,225,0.24)' : 'rgba(252,232,230,0.22)' }}>
            <div style={{ transform: 'rotate(-6deg)', textAlign: 'center', color: expiredAlmost ? 'rgba(249,171,0,0.29)' : 'rgba(197,34,31,0.25)', textShadow: '0 3px 18px rgba(0,0,0,0.08)' }}>
              {expiredAlmost ? (
                <div style={{ fontSize: 'clamp(150px, 28vw, 300px)', fontWeight: 900, lineHeight: 0.55 }}>−</div>
              ) : (
                <div style={{ width: 'clamp(170px, 29vw, 310px)', height: 'clamp(170px, 29vw, 310px)', margin: '0 auto', border: 'clamp(12px, 2vw, 24px) solid currentColor', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(120px, 22vw, 245px)', fontWeight: 900, lineHeight: 1 }}>×</div>
              )}
              <div style={{ marginTop: expiredAlmost ? '-8px' : '8px', fontSize: 'clamp(38px, 7vw, 82px)', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{expiredAlmost ? 'Almost' : 'Incorrect'}</div>
              <div style={{ fontSize: 'clamp(58px, 10vw, 122px)', fontWeight: 1000, lineHeight: 0.95, textTransform: 'uppercase' }}>Try Again</div>
            </div>
          </div>
        )}
      </div>

      {!locked && shouldShowSubmit && (
        <button onClick={handleSubmit} disabled={submitDisabled} style={{ marginTop: '40px', padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', border: 'none', borderRadius: '8px', background: submitDisabled ? '#dadce0' : '#1a73e8', color: 'white', cursor: submitDisabled ? 'not-allowed' : 'pointer', boxShadow: submitDisabled ? 'none' : '0 4px 6px rgba(26, 115, 232, 0.2)' }}>
          {submitting ? 'Checking…' : processedQuestion?.type === 'stepAlgebra' ? 'Submit Solved Equation' : record.attemptCount > 0 ? 'Submit Another Attempt' : 'Submit Answer'}
        </button>
      )}

      {sameIncorrectResponse && !isMultipart && !locked && (
        <p style={{ marginTop: '10px', color: '#5f6368', fontWeight: 'bold' }}>You may submit the same response again. No answer change is required.</p>
      )}

      {feedback && (
        <div style={{ margin: '25px auto 0', padding: '15px', maxWidth: '700px', borderRadius: '8px', backgroundColor: feedback.isCorrect ? '#e6f4ea' : '#fce8e6', color: feedback.isCorrect ? '#137333' : '#c5221f', fontSize: '16px', fontWeight: 'bold' }}>
          {feedback.isCorrect ? 'Correct! This question is complete.' : feedback.expired ? 'That was the third unsuccessful attempt. This version is locked; review the solution and request a new question to continue.' : `Not quite. You have ${feedback.remainingAttempts} ${feedback.remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining on this version.`}
          {!feedback.isCorrect && Array.isArray(feedback.incorrectParts) && feedback.incorrectParts.length > 0 && (
            <div style={{ marginTop: '9px', paddingTop: '9px', borderTop: '1px solid rgba(197,34,31,0.24)' }}>Focus on: {feedback.incorrectParts.join(', ')}.</div>
          )}
        </div>
      )}

      {assignmentLocked && !isCorrect && !isExpired && (
        <div style={{ margin: '25px auto 0', padding: '18px', maxWidth: '700px', borderRadius: '10px', border: '2px solid #5f6368', background: '#f1f3f4', color: '#3c4043' }}><strong>This assignment is permanently closed.</strong> The saved response is available for review, but no changes or submissions are allowed.</div>
      )}

      {isExpired && (
        <div style={{ margin: '25px auto 0', padding: '18px', maxWidth: '700px', borderRadius: '10px', border: `2px solid ${expiredAlmost ? '#f9ab00' : '#d93025'}`, background: expiredAlmost ? '#fff8e1' : '#fce8e6', color: expiredAlmost ? '#6b5200' : '#5f2120', position: 'relative', zIndex: 45 }}>
          <strong>This question version is closed after three attempts.</strong>
          <p style={{ margin: '8px 0 14px' }}>Review the correct solution below, then request a new problem at the same difficulty. The new version clears the frozen submission screen.</p>
          <SolutionReview question={processedQuestion} />
          <button type="button" onClick={handleRequestNewQuestion} disabled={requesting || assignmentLocked} style={{ padding: '11px 18px', border: 'none', borderRadius: '8px', background: requesting || assignmentLocked ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 'bold', cursor: requesting || assignmentLocked ? 'not-allowed' : 'pointer' }}>
            {requesting ? 'Creating New Question…' : 'Request New Question'}
          </button>
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
