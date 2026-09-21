import React, { useMemo, useState } from 'react';
import { evaluate } from 'mathjs';
import {
  applyBalancedOperationToRelation,
  parseRelationSource,
  relationStateToText,
  reverseRelation,
} from '../../algebraRelationFoundation.js';

const control = { padding:'9px 10px', border:'1px solid #cfd8e6', borderRadius:8, background:'#fff', minHeight:40 };
const flip = (relation) => reverseRelation(relation);

const affineCoefficients = (expression) => {
  try {
    const at = (x, y) => Number(evaluate(expression, { x, y }));
    const c = at(0, 0);
    const a = at(1, 0) - c;
    const b = at(0, 1) - c;
    if (![a, b, c].every(Number.isFinite)) return null;
    // Reject nonlinear expressions instead of mistaking three samples for a line.
    if (Math.abs(at(2, 3) - (2 * a + 3 * b + c)) > 1e-7) return null;
    return { a, b, c };
  } catch { return null; }
};

export const graphableConstraintFromRelation = (text) => {
  try {
    const state = parseRelationSource(text, 'y');
    const branch = state.branches?.[0];
    if (state.branches?.length !== 1 || branch?.expressions?.length !== 2 || branch.relations?.length !== 1) return null;
    const left = affineCoefficients(branch.expressions[0]);
    const right = affineCoefficients(branch.expressions[1]);
    if (!left || !right) return null;
    // A graphable result must visibly isolate y; equivalence alone is not enough.
    if (Math.abs(left.a) > 1e-7 || Math.abs(left.b - 1) > 1e-7 || Math.abs(left.c) > 1e-7 || Math.abs(right.b) > 1e-7) return null;
    return { A:left.a-right.a, B:left.b-right.b, C:left.c-right.c, relation:branch.relations[0] };
  } catch { return null; }
};

const sameConstraint = (actual, expected, tolerance = 1e-7) => {
  if (!actual || !expected) return false;
  const a = [actual.A, actual.B, actual.C];
  const e = [expected.A, expected.B, expected.C].map(Number);
  const pivot = e.findIndex((value) => Math.abs(value) > tolerance);
  if (pivot < 0) return false;
  const scale = a[pivot] / e[pivot];
  if (!Number.isFinite(scale) || Math.abs(scale) <= tolerance) return false;
  if (!a.every((value, index) => Math.abs(value - scale * e[index]) <= tolerance * Math.max(1, Math.abs(value)))) return false;
  return actual.relation === (scale < 0 ? flip(expected.relation) : expected.relation);
};

/** A shell-free relation workspace for use inside another tool's Work View. */
export default function EmbeddedInequalityRewrite({ source, expectedConstraint, value, onChange }) {
  const initial = useMemo(() => parseRelationSource(source, 'y'), [source]);
  const [operation, setOperation] = useState('subtract');
  const [operand, setOperand] = useState('');
  const [draft, setDraft] = useState(value?.verifiedText || relationStateToText(initial));
  const [pendingFlip, setPendingFlip] = useState(null);
  const [message, setMessage] = useState('Use balanced operations, then rewrite/simplify the result with y isolated.');

  const applyOperation = () => {
    try {
      const currentText = value?.steps?.at(-1)?.result || source;
      const current = parseRelationSource(currentText, 'y');
      const result = applyBalancedOperationToRelation(current, operation, operand);
      const resultText = relationStateToText(result.state);
      const step = { operation, operand, result:resultText };
      onChange({ ...value, source, steps:[...(value?.steps || []), step], verifiedText:'', verifiedConstraint:null });
      setDraft(resultText);
      setPendingFlip(result.requiresInequalityFlip ? result.expectedRelations?.[0] : null);
      setMessage(result.requiresInequalityFlip
        ? 'A negative operation was applied. Choose the equivalent inequality direction before continuing.'
        : 'Balanced operation recorded. Simplify the relation yourself when ready.');
    } catch (error) { setMessage(error?.message || 'That operation could not be applied.'); }
  };

  const confirmFlip = (relation) => {
    if (relation !== pendingFlip) { setMessage('That direction does not preserve the inequality after the negative operation.'); return; }
    const state = parseRelationSource(draft, 'y');
    state.branches[0].relations[0] = relation;
    const result = relationStateToText(state);
    const steps = [...(value?.steps || [])];
    steps[steps.length - 1] = { ...steps.at(-1), result, relationHandled:true };
    onChange({ ...value, source, steps });
    setDraft(result);
    setPendingFlip(null);
    setMessage('Correct inequality direction. Continue isolating y.');
  };

  const verify = () => {
    if (!(value?.steps || []).length || pendingFlip) { setMessage('Record the algebra operations—and finish any required sign reversal—before checking the rewrite.'); return; }
    const candidate = graphableConstraintFromRelation(draft);
    if (!candidate || !sameConstraint(candidate, expectedConstraint)) {
      setMessage('Not yet. Keep the inequality equivalent and isolate y in slope-intercept form.'); return;
    }
    onChange({ ...value, source, verifiedText:draft, verifiedConstraint:candidate });
    setMessage('Rewrite verified. Use your result to construct the graph.');
  };

  return <div style={{ padding:12, border:'1px solid #b8cdf0', borderRadius:10, background:'#f8fbff' }}>
    <strong>Rewrite for graphing</strong>
    <p style={{ margin:'6px 0' }}>Original: <b>{source}</b></p>
    <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
      <select aria-label="Balanced operation" value={operation} onChange={(e)=>setOperation(e.target.value)} style={control}>
        <option value="add">Add</option><option value="subtract">Subtract</option><option value="multiply">Multiply</option><option value="divide">Divide</option>
      </select>
      <input aria-label="Operation value" value={operand} onChange={(e)=>setOperand(e.target.value)} style={control} />
      <button type="button" onClick={applyOperation} style={control}>Apply to both sides</button>
    </div>
    {pendingFlip ? <div style={{ marginTop:8 }}>
      <span>Choose the new relation: </span>{['<','<=','>','>='].map((relation)=><button type="button" key={relation} onClick={()=>confirmFlip(relation)} style={{ ...control, marginRight:5 }}>{relation}</button>)}
    </div> : null}
    <label style={{ display:'block', marginTop:10, fontWeight:700 }}>Your simplified, graphable inequality
      <input value={draft} disabled={Boolean(pendingFlip)} onChange={(e)=>setDraft(e.target.value)} style={{ ...control, display:'block', width:'100%', boxSizing:'border-box', marginTop:5 }} />
    </label>
    <button type="button" onClick={verify} style={{ ...control, marginTop:8, background:'#1a73e8', color:'#fff', fontWeight:800 }}>Verify rewrite</button>
    <p role="status" style={{ margin:'8px 0 0', fontSize:13 }}>{message}</p>
  </div>;
}
