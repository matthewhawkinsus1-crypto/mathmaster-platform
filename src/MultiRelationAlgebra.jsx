import { useCallback, useEffect, useMemo, useState } from 'react';
import MultiRelationAlgebraCore from './MultiRelationAlgebraCore';
import SolverWorkspaceFrame from './components/common/SolverWorkspaceFrame';
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
    const relation = payload?.parts?.find((part) => part?.id === 'relation-work')?.response;
    if (relation) setWorkHistory((current) => appendHistory(current, relation));
    onStateChange?.(payload);
  }, [onStateChange]);

  const focusPanel = (
    <div className="solver-work-history">
      <h3>Work history</h3>
      <p>Each committed relation state stays visible while you solve, including split absolute-value branches.</p>
      {workHistory.length ? (
        <ol>
          {workHistory.map((relation, index) => (
            <li key={`${index}-${relation}`}>
              <span className="solver-work-history__math-text">{relation}</span>
            </li>
          ))}
        </ol>
      ) : <p>Your first relation will appear as soon as the solver is ready.</p>}
    </div>
  );

  return (
    <SolverWorkspaceFrame
      label="Equation and inequality solver"
      taskText={relationQuestion.prompt || 'Solve the equation or inequality.'}
      workspaceKey={workspaceKey}
      workspaceKind="relation"
      focusPanel={focusPanel}
      workspaceActions={props.workspaceActions}
      onWorkspaceModeChange={props.onWorkspaceModeChange}
    >
      <MultiRelationAlgebraCore
        {...props}
        question={relationQuestion}
        denseWorkspace={denseWorkspace}
        onStateChange={handleStateChange}
      />
    </SolverWorkspaceFrame>
  );
}
