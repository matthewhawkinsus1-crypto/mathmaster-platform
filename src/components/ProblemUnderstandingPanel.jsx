import React, { useEffect, useMemo, useState } from 'react';

export const ProblemUnderstandingPanel = ({ context, onScaffoldComplete }) => {
  const quantities = useMemo(() => (Array.isArray(context?.quantities) ? context.quantities : []), [context]);
  const unknowns = useMemo(() => quantities.filter((quantity) => quantity.isUnknown), [quantities]);
  const givens = useMemo(() => quantities.filter((quantity) => quantity.isGiven), [quantities]);
  const [step, setStep] = useState(1);
  const [selectedUnknown, setSelectedUnknown] = useState('');

  useEffect(() => {
    setStep(1);
    setSelectedUnknown(unknowns.length === 1 ? unknowns[0].id : '');
  }, [context, unknowns]);

  if (!context?.scenario || context?.scaffold?.enabled === false) return null;
  const showQuantitiesStep = context.scaffold?.showQuantitiesStep !== false;
  const showRelationshipStep = context.scaffold?.showRelationshipStep !== false;
  const hasSecondStep = showRelationshipStep;

  const finish = () => onScaffoldComplete?.({ selectedUnknown: selectedUnknown || null, contextScaffoldUsed: true });
  const advanceOrFinish = () => hasSecondStep ? setStep(2) : finish();

  return (
    <section className="problem-understanding-scaffold" style={{ background: '#f8fbff', border: '1px solid #c5d5ef', borderRadius: '8px', padding: '16px', margin: '0 auto 20px', maxWidth: '860px', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <strong style={{ color: '#174ea6', fontSize: '13px', textTransform: 'uppercase' }}>📖 Problem Understanding Scaffold</strong>
        <span style={{ fontSize: '12px', color: '#5f6368' }}>Context support · does not reduce math-independence evidence</span>
      </div>
      <p style={{ fontSize: '15px', lineHeight: 1.5, margin: '0 0 12px', color: '#202124' }}>{context.scenario}</p>

      {step === 1 && (
        <div>
          {showQuantitiesStep && unknowns.length > 0 && (
            <>
              <label style={{ display: 'block', fontWeight: 'bold', fontSize: '14px', marginBottom: '6px' }}>What quantity are you asked to find?</label>
              <select value={selectedUnknown} onChange={(event) => setSelectedUnknown(event.target.value)} style={{ padding: '8px', borderRadius: '4px', width: '100%', marginBottom: '12px' }}>
                <option value="">Choose the target quantity...</option>
                {unknowns.map((quantity) => <option key={quantity.id} value={quantity.id}>{quantity.name} ({quantity.unit || 'no unit'})</option>)}
              </select>
            </>
          )}
          {showQuantitiesStep && unknowns.length === 0 && <p style={{ color: '#5f6368', fontSize: '13px' }}>No authored target quantity was supplied; continue after reading the scenario.</p>}
          <button type="button" disabled={unknowns.length > 0 && !selectedUnknown} onClick={advanceOrFinish} style={{ padding: '8px 16px', background: unknowns.length > 0 && !selectedUnknown ? '#ccc' : '#1a73e8', color: '#fff', border: 'none', borderRadius: '4px', cursor: unknowns.length > 0 && !selectedUnknown ? 'not-allowed' : 'pointer' }}>
            {hasSecondStep ? 'Next: Review Given Information' : 'Understand Problem & Continue'}
          </button>
        </div>
      )}

      {step === 2 && hasSecondStep && (
        <div>
          <strong style={{ fontSize: '13px', color: '#3c4043', display: 'block', marginBottom: '6px' }}>Given values in this situation:</strong>
          {givens.length ? (
            <ul style={{ margin: '0 0 12px', paddingLeft: '20px', fontSize: '14px' }}>
              {givens.map((quantity) => <li key={quantity.id}><strong>{quantity.name}:</strong> {String(quantity.givenValue ?? 'not supplied')} {quantity.unit}</li>)}
            </ul>
          ) : <p style={{ margin: '0 0 12px', color: '#5f6368', fontSize: '13px' }}>No separate given-value list was authored. Use the information in the scenario.</p>}
          <button type="button" onClick={finish} style={{ padding: '8px 16px', background: '#137333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✓ Understand Problem & Continue to Workspace</button>
        </div>
      )}
    </section>
  );
};

export default ProblemUnderstandingPanel;
