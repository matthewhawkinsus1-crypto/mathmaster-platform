import { useCallback, useEffect, useMemo, useState } from 'react';
import MathDisplay from './MathDisplay';
import MultiRelationAlgebra from './MultiRelationAlgebra';
import StepByStepAlgebraCore from './StepByStepAlgebraCore';
import EnlargeableFigure from './components/common/EnlargeableFigure';
import { needsMultiRelationWorkspace } from './algebraRelationFoundation';
import { withPromptRelationSource } from './stepAlgebraRelationRouting';

export * from './StepByStepAlgebraCore';

const appendHistory = (current, value) => {
  const next = String(value || '').trim();
  if (!next || current[current.length - 1] === next) return current;
  if (current.length > 1 && current[current.length - 2] === next) return current.slice(0, -1);
  if (current.length && current[0] === next) return [next];
  return [...current, next].slice(-24);
};

export default function StepByStepAlgebra(props) {
  const { question = {}, onStateChange } = props;
  const relationQuestion = useMemo(() => withPromptRelationSource(question), [question]);
  const shouldUseRelationWorkspace = useMemo(
    () => needsMultiRelationWorkspace(relationQuestion),
    [relationQuestion],
  );
  const workspaceKey = useMemo(() => [
    props.draftKey,
    question.id,
    question.questionId,
    question.equationLatex,
    typeof question.equation === 'string' ? question.equation : '',
    question.formula,
    question.prompt,
  ].filter(Boolean).join('|') || 'step-algebra', [props.draftKey, question]);
  const [workHistory, setWorkHistory] = useState([]);

  useEffect(() => setWorkHistory([]), [workspaceKey]);

  const handleStateChange = useCallback((payload) => {
    const equation = payload?.parts?.find((part) => part?.id === 'algebra-objective')?.response;
    if (equation) setWorkHistory((current) => appendHistory(current, equation));
    onStateChange?.(payload);
  }, [onStateChange]);

  const focusPanel = (
    <div className="solver-work-history">
      <h3>Work history</h3>
      <p>Your valid equation states stay visible here while you solve. Undo removes the most recent state from this route.</p>
      {workHistory.length ? (
        <ol>
          {workHistory.map((equation, index) => (
            <li key={`${index}-${equation}`}>
              <MathDisplay value={equation} format="latex" />
            </li>
          ))}
        </ol>
      ) : <p>Your first equation will appear as soon as the solver is ready.</p>}
    </div>
  );

  // Legacy assignments often authored the entire inequality only in `prompt`.
  // QuestionEngine cannot identify those before choosing this host, so keep a
  // second, conservative handoff here. The enriched question gives the
  // relation-aware workspace the exact expression it needs without rewriting
  // or special-casing the assignment itself.
  if (shouldUseRelationWorkspace) {
    return <MultiRelationAlgebra {...props} question={relationQuestion} />;
  }

  return (
    <EnlargeableFigure
      label="Step-by-step algebra solver"
      taskText={question.prompt || 'Solve the equation by keeping both sides balanced.'}
      enlargeLabel="Enlarge algebra workspace"
      style={{ width: '100%' }}
      capabilities={{
        equationInput: { label: 'Equation and rewrite controls', studentState: true },
        numericControls: { label: 'Balanced operation controls', studentState: true },
        instruction: { text: question.prompt || 'Keep both sides balanced and simplify each committed step.' },
        task: { text: question.prompt || 'Solve the equation by keeping both sides balanced.' },
        help: { content: focusPanel },
      }}
    >
      <StepByStepAlgebraCore {...props} onStateChange={handleStateChange} />
    </EnlargeableFigure>
  );
}
