import { useCallback, useEffect, useMemo, useState } from 'react';
import MultiRelationAlgebraCore from './MultiRelationAlgebraCore';
import EnlargeableFigure from './components/common/EnlargeableFigure';
import MathDisplay from './MathDisplay';
import { withPromptRelationSource } from './stepAlgebraRelationRouting.js';

export * from './MultiRelationAlgebraCore';

const appendHistory = (current, value) => {
  const next = String(value || '').trim();
  if (!next || current[current.length - 1] === next) return current;
  if (current.length > 1 && current[current.length - 2] === next) return current.slice(0, -1);
  if (current.length && current[0] === next) return [next];
  return [...current, next].slice(-24);
};

export default function MultiRelationAlgebra(props) {
  const { question = {}, onStateChange } = props;
  const relationQuestion = useMemo(() => withPromptRelationSource(question), [question]);
  const denseWorkspace = props.workspaceMode !== 'normal';
  const workspaceKey = useMemo(() => [
    props.draftKey,
    relationQuestion.id,
    relationQuestion.questionId,
    relationQuestion.equationLatex,
    relationQuestion.equationAscii,
    typeof relationQuestion.equation === 'string' ? relationQuestion.equation : '',
    relationQuestion.prompt,
  ].filter(Boolean).join('|') || 'multi-relation-algebra', [props.draftKey, relationQuestion]);
  const [workHistory, setWorkHistory] = useState([]);

  useEffect(() => setWorkHistory([]), [workspaceKey]);

  const handleStateChange = useCallback((payload) => {
    onStateChange?.(payload);
  }, [onStateChange]);
  // History shows classroom math — |2x − 3| ≤ 7, not the solver's
  // `abs(2 x - 3) <= 7` — so it is fed the LaTeX the workspace draws.
  const handleRelationDisplayChange = useCallback((relationLatex) => {
    if (relationLatex) setWorkHistory((current) => appendHistory(current, relationLatex));
  }, []);

  const focusPanel = (
    <div className="solver-work-history">
      <h3>Work history</h3>
      <p>Each committed relation state stays visible while you solve, including split absolute-value branches.</p>
      {workHistory.length ? (
        <ol>
          {workHistory.map((relation, index) => (
            <li key={`${index}-${relation}`}>
              <MathDisplay value={relation} format="latex" />
            </li>
          ))}
        </ol>
      ) : <p>Your first relation will appear as soon as the solver is ready.</p>}
    </div>
  );

  return (
    <EnlargeableFigure
      label="Equation and inequality solver"
      taskText={relationQuestion.prompt || 'Solve the equation or inequality.'}
      enlargeLabel="Enlarge relation workspace"
      style={{ width: '100%' }}
      capabilities={{
        equationInput: { label: 'Equation, branch, and rewrite controls', studentState: true },
        numericControls: { label: 'Relation operation controls', studentState: true },
        instruction: { text: relationQuestion.prompt || 'Transform the relation while preserving its solution set.' },
        task: { text: relationQuestion.prompt || 'Solve the equation or inequality.' },
        help: { content: focusPanel },
      }}
    >
      <MultiRelationAlgebraCore
        {...props}
        question={relationQuestion}
        denseWorkspace={denseWorkspace}
        onStateChange={handleStateChange}
        onRelationDisplayChange={handleRelationDisplayChange}
      />
    </EnlargeableFigure>
  );
}
