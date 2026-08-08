import React from 'react';

export const RetentionQuickCheckBanner = ({ pendingProbes = [], onLaunchQuickCheck }) => {
  if (!pendingProbes.length) return null;
  const primary = pendingProbes[0];
  const concern = primary.priority === 1;
  return (
    <section style={{ marginBottom: '20px', padding: '15px 18px', borderRadius: '9px', border: `1px solid ${concern ? '#fad2cf' : '#fdd663'}`, borderLeft: `6px solid ${concern ? '#d93025' : '#f29900'}`, background: concern ? '#fce8e6' : '#fff4ce', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', textAlign: 'left' }}>
      <div style={{ flex: '1 1 420px' }}>
        <div style={{ fontWeight: 900, color: concern ? '#a50e0e' : '#7a4f00' }}>{concern ? 'Retention concern' : 'Quick retention check due'}{pendingProbes.length > 1 ? ` · +${pendingProbes.length - 1} more` : ''}</div>
        <div style={{ marginTop: '4px', color: '#3c4043', fontSize: '13px' }}><strong>TEKS {primary.teksCode}:</strong> {primary.reason}</div>
      </div>
      <button type="button" onClick={() => onLaunchQuickCheck?.(primary.teksCode, { sessionKind: 'retentionProbe', requiredQuestions: 2 })} style={{ padding: '10px 16px', border: 0, borderRadius: '7px', background: concern ? '#d93025' : '#b06000', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Verify now · 2 questions</button>
    </section>
  );
};

export default RetentionQuickCheckBanner;
