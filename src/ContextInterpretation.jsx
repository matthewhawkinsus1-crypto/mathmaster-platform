import { useEffect, useMemo } from 'react';
import QuestionPrompt from './QuestionPrompt';
import PointMeaningBuilder from './PointMeaningBuilder';
import useUndoHistory from './useUndoHistory';
import {
  buildNaturalMeaning,
  EMPTY_POINT_MEANING,
} from './contextInterpretationUtils';
import contextInterpretationGrader from '../functions/shared/serverGrading/tools/contextInterpretation.mjs';
import { pointMeaningWork } from '../functions/shared/toolMath/scenario/scenarioWork.mjs';
import { gradeToolCheck } from './tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from './platform/grading/sharedAnswerState.js';

export default function ContextInterpretation({
  question,
  onStateChange,
  onUndoStateChange,
  feedback,
  draftKey,
  disabled = false,
}) {
  const history = useUndoHistory(EMPTY_POINT_MEANING, 80, draftKey ? `${draftKey}:context-interpretation` : null);
  const values = history.value || EMPTY_POINT_MEANING;
  // The student's raw work (the seven point-meaning entries). The verdict comes
  // ONLY from the shared grader the server also runs
  // (serverGrading/tools/contextInterpretation.mjs).
  const work = useMemo(() => pointMeaningWork(values), [values]);
  const grading = useMemo(() => gradeToolCheck(contextInterpretationGrader, question, work), [question, work]);
  const natural = buildNaturalMeaning(values, question);
  const questionDetails = `${question.prompt || 'Interpret the point.'} Response: ${natural || values.openText || JSON.stringify(values)}`;

  useEffect(() => {
    onStateChange(answerStateFromSharedGrading(grading, { questionDetails }));
  }, [grading, questionDetails, onStateChange]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo && !disabled, onUndo: history.undo, label: 'Undo the last point-meaning entry' });
    return () => onUndoStateChange?.(null);
  }, [disabled, history.canUndo, history.undo, onUndoStateChange]);

  return (
    <div style={{ textAlign: 'left', maxWidth: '920px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, textAlign: 'center' }}>Interpret a Point in Context</h2>
      <QuestionPrompt>{question.prompt || 'Interpret the highlighted point in this situation.'}</QuestionPrompt>
      {question.scenario && !question.suppressScenarioDisplay && <div style={{ padding: '18px', borderRadius: '12px', background: 'var(--mm-surface-tint)', border: '1px solid var(--mm-tint-border)', lineHeight: 1.6, fontSize: '17px' }}>{question.scenario}</div>}
      <PointMeaningBuilder
        config={question}
        values={values}
        onChange={(next) => history.setValue(next)}
        graph={question.graph}
        feedback={feedback}
        prefix="meaning"
        disabled={disabled}
        showGraph={question.showGraph !== false}
        quantityChoices={question.quantityChoices || []}
      />
    </div>
  );
}
