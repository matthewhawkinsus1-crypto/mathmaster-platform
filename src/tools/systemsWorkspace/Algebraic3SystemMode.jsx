/*
 * 3×3 ALGEBRAIC SYSTEMS — METHOD DISPATCH (#359).
 *
 * A 3×3 system now supports substitution AND elimination, exactly like the
 * 2×2 workspace. `method:"studentChoice"` must let the STUDENT pick, the
 * same way the 2×2 AlgebraicSystemMode already offers a Substitution /
 * Elimination choice for method:"studentChoice" — it must never silently
 * default to substitution.
 */
import React, { useMemo } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { Panel } from '../shared/ToolShell';
import { normalizeAlgebraicSystemConfig } from './algebraicSystemsEngine.js';
import SubstitutionReductionMode from './SubstitutionReductionMode.jsx';
import EliminationReductionMode from './EliminationReductionMode.jsx';

const choiceButtonStyle = { padding: '11px 18px', border: 0, borderRadius: 9, background: '#eef4ff', color: '#174ea6', fontWeight: 800, cursor: 'pointer', minHeight: 44, fontSize: 14 };

export default function Algebraic3SystemMode({ questionData = {}, onAction, draftKey = null }) {
  const config = useMemo(() => normalizeAlgebraicSystemConfig(questionData), [questionData]);
  const [method, setMethod] = usePersistentToolState('method3', config.method === 'studentChoice' ? '' : config.method);
  const effectiveMethod = config.method === 'studentChoice' ? method : config.method;

  if (config.method === 'studentChoice' && !effectiveMethod) {
    return (
      <EnlargeableFigure label="3×3 algebraic systems workspace" enlargeLabel="Enlarge 3×3 algebraic systems workspace" style={{ width: '100%' }}>
        <Panel title="3×3 algebraic systems">
          <p className="mathmaster-systems-substitution-direction">How will you solve this system?</p>
          <div className="mathmaster-reduction-button-row">
            <button type="button" onClick={() => setMethod('substitution')} style={choiceButtonStyle}>Substitution</button>
            <button type="button" onClick={() => setMethod('elimination')} style={choiceButtonStyle}>Elimination</button>
          </div>
        </Panel>
      </EnlargeableFigure>
    );
  }

  return effectiveMethod === 'elimination'
    ? <EliminationReductionMode questionData={questionData} onAction={onAction} draftKey={draftKey} />
    : <SubstitutionReductionMode questionData={questionData} onAction={onAction} draftKey={draftKey} />;
}
