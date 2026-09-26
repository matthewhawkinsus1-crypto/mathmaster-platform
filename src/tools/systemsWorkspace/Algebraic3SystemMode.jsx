/*
 * 3×3 ALGEBRAIC SYSTEMS — METHOD DISPATCH (#359).
 *
 * A 3×3 system now supports substitution AND elimination, exactly like the
 * 2×2 workspace. `method:"studentChoice"` must let the STUDENT pick, the
 * same way the 2×2 AlgebraicSystemMode already offers a Substitution /
 * Elimination choice for method:"studentChoice" — it must never silently
 * default to substitution.
 */
import React, { useCallback, useMemo } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { questionUndoResetKey, useActiveUndoOwner } from '../../platform/workView/useMathUndoHistory.js';
import { Panel } from '../shared/ToolShell';
import { normalizeAlgebraicSystemConfig } from './algebraicSystemsEngine.js';
import SubstitutionReductionMode from './SubstitutionReductionMode.jsx';
import EliminationReductionMode from './EliminationReductionMode.jsx';

const choiceButtonStyle = { padding: '11px 18px', border: 0, borderRadius: 9, background: '#eef4ff', color: '#174ea6', fontWeight: 800, cursor: 'pointer', minHeight: 44, fontSize: 14 };
const changeMethodButtonStyle = { padding: '7px 14px', border: '1px solid #b8cdf0', borderRadius: 8, background: '#fff', color: '#174ea6', fontWeight: 700, cursor: 'pointer', minHeight: 36, fontSize: 13 };

/*
 * The method choice is the student's own strategic decision, so it must be
 * changeable — a wrong or reconsidered pick is not a dead end. Each method's
 * own work is stored under its own key ('reduction' vs 'elimination'),
 * so switching back and forth never clears the other method's progress:
 * whichever one the student returns to reopens exactly where they left it.
 */
export default function Algebraic3SystemMode({ questionData = {}, onAction, draftKey = null }) {
  const config = useMemo(() => normalizeAlgebraicSystemConfig(questionData), [questionData]);
  const [method, setMethod] = usePersistentToolState('method3', config.method === 'studentChoice' ? '' : config.method);
  const effectiveMethod = config.method === 'studentChoice' ? method : config.method;
  const isStudentChoice = config.method === 'studentChoice';

  // A minimal, real Undo history over the method choice itself, so "change
  // method" is a registered, reversible edit rather than a side door around
  // Undo. It only becomes the active Undo target when the mounted method's
  // own (higher-priority) history has nothing left to undo.
  const methodHistoryState = useMemo(() => ({ method }), [method]);
  const restoreMethod = useCallback((value) => setMethod(value?.method ?? ''), [setMethod]);
  const methodUndo = useMathUndoHistory({
    label: 'Undo the method choice',
    state: methodHistoryState,
    onRestore: restoreMethod,
    resetKey: questionUndoResetKey(questionData),
    ownerId: 'algebraic3-method-choice',
    priority: 20,
    enabled: isStudentChoice,
  });
  const methodUndoController = useMemo(
    () => ({ canUndo: methodUndo.canUndo, onUndo: methodUndo.undo, label: 'Undo the method choice' }),
    [methodUndo.canUndo, methodUndo.undo],
  );
  useActiveUndoOwner({
    id: 'algebraic3-method-choice',
    active: isStudentChoice,
    priority: 20,
    controller: methodUndoController,
  });
  const chooseMethod = useCallback((next) => setMethod(next), [setMethod]);

  if (isStudentChoice && !effectiveMethod) {
    return (
      <EnlargeableFigure label="3×3 algebraic systems workspace" enlargeLabel="Enlarge 3×3 algebraic systems workspace" style={{ width: '100%' }}>
        <Panel title="3×3 algebraic systems">
          <p className="mathmaster-systems-substitution-direction">How will you solve this system?</p>
          <div className="mathmaster-reduction-button-row">
            <button type="button" onClick={() => chooseMethod('substitution')} style={choiceButtonStyle}>Substitution</button>
            <button type="button" onClick={() => chooseMethod('elimination')} style={choiceButtonStyle}>Elimination</button>
          </div>
        </Panel>
      </EnlargeableFigure>
    );
  }

  return (
    <div className="mathmaster-algebraic3-mode">
      {isStudentChoice ? (
        <div className="mathmaster-algebraic3-method-bar">
          <span className="mathmaster-algebraic3-method-label">Method: {effectiveMethod === 'elimination' ? 'Elimination' : 'Substitution'}</span>
          <button type="button" onClick={() => setMethod('')} style={changeMethodButtonStyle}>Change method</button>
        </div>
      ) : null}
      {effectiveMethod === 'elimination'
        ? <EliminationReductionMode questionData={questionData} onAction={onAction} draftKey={draftKey} />
        : <SubstitutionReductionMode questionData={questionData} onAction={onAction} draftKey={draftKey} />}
    </div>
  );
}
