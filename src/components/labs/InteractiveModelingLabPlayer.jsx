import React, { useMemo, useRef, useState } from 'react';
import { normalizeLabDefinition } from '../../platform/labs/labDefinitionSchema.js';
import { submitModelingLab } from '../../services/modelingLabService.js';

const wordCount = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).length;

export const InteractiveModelingLabPlayer = ({
  rawLabSpec,
  assignmentId = null,
  executionScope = 'student',
  supportUsage = {},
  disabled = false,
  onServerGraded,
}) => {
  const lab = useMemo(() => normalizeLabDefinition(rawLabSpec || {}), [rawLabSpec]);
  const [paramValues, setParamValues] = useState(() => Object.fromEntries(lab.parameters.map((parameter) => [parameter.id, parameter.defaultValue])));
  const [hypothesis, setHypothesis] = useState('');
  const [justification, setJustification] = useState('');
  const [trialHistory, setTrialHistory] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pendingSubmissionId = useRef(null);

  const recordTrial = () => setTrialHistory((current) => [...current, {
    trialNumber: current.length + 1,
    recordedAt: Date.now(),
    parameters: { ...paramValues },
  }]);

  const handleSubmit = async () => {
    if (busy || disabled || !trialHistory.length || !justification.trim()) return;
    setBusy(true);
    setError(null);
    if (!pendingSubmissionId.current) pendingSubmissionId.current = `lab_${lab.labId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    try {
      const result = await submitModelingLab({
        assignmentId,
        labDefinition: lab,
        submissionId: pendingSubmissionId.current,
        executionScope,
        submission: {
          studentHypothesis: hypothesis,
          trialHistory,
          finalParameterValues: paramValues,
          studentJustification: justification,
          supportUsage,
        },
      });
      pendingSubmissionId.current = null;
      setEvaluation(result.evaluation);
      await onServerGraded?.(result.evaluation, result);
    } catch (caught) {
      setError(`Lab submission was not confirmed. Retry will reuse the same submission ID. ${caught.message || ''}`.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mathmaster-interactive-lab" style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: 'clamp(14px, 3vw, 24px)', boxSizing: 'border-box', textAlign: 'left', background: '#fff', borderRadius: 12, border: '1px solid #dadce0', touchAction: 'pan-y' }}>
      <header style={{ borderBottom: '2px solid #1a73e8', paddingBottom: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><span style={{ background: '#e8f0fe', color: '#174ea6', padding: '4px 9px', borderRadius: 999, fontSize: 12, fontWeight: 900 }}>DOK {lab.dokLevel} · MODELING LAB</span><span style={{ fontSize: 12, color: '#5f6368' }}>{lab.teksAlignments.length ? `TEKS ${lab.teksAlignments.join(', ')}` : 'No TEKS alignment'}</span></div>
        <h2 style={{ margin: '9px 0 5px' }}>{lab.title}</h2>
        <p style={{ margin: 0, color: '#3c4043', lineHeight: 1.5 }}>{lab.scenarioDescription}</p>
      </header>

      <div style={{ padding: 15, marginBottom: 18, background: '#f8fbff', border: '1px solid #c5d5ef', borderRadius: 9 }}>
        <strong style={{ color: '#174ea6' }}>Guiding question</strong><div style={{ margin: '5px 0 12px', fontWeight: 650 }}>{lab.guidingQuestion}</div>
        <label style={{ display: 'block', fontWeight: 800, fontSize: 13 }}>Initial hypothesis<input disabled={disabled || Boolean(evaluation)} value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} placeholder="State what you predict and why…" style={{ width: '100%', boxSizing: 'border-box', padding: 10, marginTop: 5, border: '1px solid #bdc1c6', borderRadius: 7 }} /></label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 18, marginBottom: 20 }}>
        <div style={{ padding: 17, borderRadius: 9, background: '#f8f9fa', border: '1px solid #e0e0e0' }}>
          <h3 style={{ marginTop: 0, fontSize: 16 }}>System parameters</h3>
          {lab.parameters.map((parameter) => <label key={parameter.id} style={{ display: 'block', marginBottom: 17, fontSize: 13, fontWeight: 700 }}><span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{parameter.label} ({parameter.symbol})</span><strong style={{ color: '#174ea6' }}>{paramValues[parameter.id]} {parameter.unit}</strong></span><input disabled={disabled || Boolean(evaluation)} type="range" min={parameter.min} max={parameter.max} step={parameter.step} value={paramValues[parameter.id]} onChange={(event) => setParamValues((current) => ({ ...current, [parameter.id]: Number(event.target.value) }))} style={{ width: '100%', minHeight: 32 }} /><small style={{ color: '#5f6368' }}>{parameter.description}</small></label>)}
          <button type="button" disabled={disabled || Boolean(evaluation)} onClick={recordTrial} style={{ minHeight: 44, width: '100%', border: 0, borderRadius: 7, background: '#137333', color: '#fff', fontWeight: 900 }}>Record Trial #{trialHistory.length + 1}</button>
        </div>
        <div style={{ padding: 17, borderRadius: 9, background: '#fff', border: '1px solid #e0e0e0', minWidth: 0 }}>
          <h3 style={{ marginTop: 0, fontSize: 16 }}>Experimental trial history ({trialHistory.length})</h3>
          {!trialHistory.length ? <p style={{ color: '#5f6368', fontSize: 13 }}>Adjust the parameters and record at least one trial. Your full trial sequence is submitted as evidence.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr style={{ background: '#f1f3f4' }}><th style={{ padding: 8 }}>Trial</th><th style={{ padding: 8 }}>Parameters</th></tr></thead><tbody>{trialHistory.map((trial) => <tr key={trial.trialNumber} style={{ borderBottom: '1px solid #eee' }}><td style={{ padding: 8, fontWeight: 800 }}>#{trial.trialNumber}</td><td style={{ padding: 8 }}>{Object.entries(trial.parameters).map(([key, value]) => `${key}: ${value}`).join(' · ')}</td></tr>)}</tbody></table></div>}
          {lab.constraints.length > 0 && <aside style={{ marginTop: 14, padding: 11, borderRadius: 7, background: '#fff4ce', color: '#5f4400' }}><strong>Model constraints</strong><ul style={{ margin: '7px 0 0', paddingLeft: 20 }}>{lab.constraints.map((constraint) => <li key={constraint.id}>{constraint.label}: <code>{constraint.expression}</code></li>)}</ul></aside>}
        </div>
      </div>

      <label style={{ display: 'block', fontWeight: 800, fontSize: 13 }}>Mathematical justification<textarea disabled={disabled || Boolean(evaluation)} rows={5} value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Use your trial evidence and mathematical constraints to justify the final model…" style={{ width: '100%', boxSizing: 'border-box', marginTop: 5, padding: 11, border: '1px solid #bdc1c6', borderRadius: 7, font: 'inherit' }} /></label>
      <div style={{ margin: '5px 0 14px', color: '#5f6368', fontSize: 12 }}>{wordCount(justification)} words · target at least {lab.rubric.minimumJustificationWords} for a complete written explanation.</div>

      {error && <div role="alert" style={{ padding: 11, marginBottom: 12, borderRadius: 7, background: '#fce8e6', color: '#a50e0e' }}>{error}</div>}
      {evaluation ? <div role="status" style={{ padding: 16, borderRadius: 9, background: evaluation.isMastered ? '#e6f4ea' : '#fff4ce', color: '#3c4043' }}><strong>{evaluation.provisional ? 'Sandbox evaluation' : 'Server-graded modeling result'} · {Math.round(Number(evaluation.compositeScore || 0) * 100)}%</strong><p style={{ margin: '6px 0 0' }}>{evaluation.feedback}</p></div> : <button type="button" disabled={disabled || busy || !trialHistory.length || !justification.trim()} onClick={handleSubmit} style={{ width: '100%', minHeight: 48, border: 0, borderRadius: 8, background: disabled || busy || !trialHistory.length || !justification.trim() ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 900 }}>{busy ? 'Submitting securely…' : 'Submit Modeling Lab'}</button>}
    </section>
  );
};

export default InteractiveModelingLabPlayer;
