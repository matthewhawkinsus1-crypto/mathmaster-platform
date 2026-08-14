import { useEffect } from 'react';
import QuestionPrompt from './QuestionPrompt';
import PointMeaningBuilder from './PointMeaningBuilder';
import useUndoHistory from './useUndoHistory';
import {
  buildContextInterpretationParts,
  buildNaturalMeaning,
  EMPTY_POINT_MEANING,
} from './contextInterpretationUtils';
import { stableStringify } from './scenarioResponseUtils';

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
  const parts = buildContextInterpretationParts(values, question, { prefix: 'meaning' });
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  const isCorrect = isComplete && parts.every((part) => part.isCorrect);
  const natural = buildNaturalMeaning(values, question);

  useEffect(() => {
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: stableStringify(values),
      questionDetails: `${question.prompt || 'Interpret the point.'} Response: ${natural || values.openText || JSON.stringify(values)}`,
      parts,
    });
  }, [history.value, isComplete, isCorrect, natural, onStateChange, question.prompt]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo && !disabled, onUndo: history.undo, label: 'Undo the last point-meaning entry' });
    return () => onUndoStateChange?.(null);
  }, [disabled, history.canUndo, history.undo, onUndoStateChange]);

  return (
    <div style={{ textAlign: 'left', maxWidth: '920px', margin: '0 auto' }}>
      <h2 style={{ marginTop: 0, textAlign: 'center' }}>Interpret a Point in Context</h2>
      <QuestionPrompt>{question.prompt || 'Interpret the highlighted point in this situation.'}</QuestionPrompt>
      {question.scenario && !question.suppressScenarioDisplay && <div style={{ padding: '18px', borderRadius: '12px', background: '#f8fbff', border: '1px solid #cbd9ec', lineHeight: 1.6, fontSize: '17px' }}>{question.scenario}</div>}
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
