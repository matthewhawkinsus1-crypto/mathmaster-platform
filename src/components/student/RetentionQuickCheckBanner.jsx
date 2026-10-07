import React from 'react';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';
import {
  RETENTION_CHECK_ACTION_LABEL,
  retentionCheckLaunchOptions,
} from '../../platform/path/pathSessionLaunch.js';

export const RetentionQuickCheckBanner = ({ pendingProbes = [], onLaunchQuickCheck }) => {
  if (!pendingProbes.length) return null;
  const primary = pendingProbes[0];
  const concern = primary.priority === 1;
  return (
    <section style={{ marginBottom: '20px', padding: '15px 18px', borderRadius: '9px', border: `1px solid ${concern ? 'var(--mm-error-border-soft)' : '#fdd663'}`, borderLeft: `6px solid ${concern ? '#d93025' : '#f29900'}`, background: concern ? 'var(--mm-error-bg)' : 'var(--mm-warning-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', textAlign: 'left' }}>
      <div style={{ flex: '1 1 420px' }}>
        <div style={{ fontWeight: 900, color: concern ? 'var(--mm-error-text)' : 'var(--mm-warning-text)' }}>{concern ? 'Retention concern' : 'Quick retention check due'}{pendingProbes.length > 1 ? ` · +${pendingProbes.length - 1} more` : ''}</div>
        <div style={{ marginTop: '4px', color: 'var(--mm-text)', fontSize: '13px' }}><strong>{studentLabelForTeks(primary.teksCode)}:</strong> {primary.reason}</div>
      </div>
      {/* The same launch as every other retention entry point: a two-question
          retentionProbe, the only session that moves the retention schedule. */}
      <button type="button" onClick={() => onLaunchQuickCheck?.(primary.teksCode, retentionCheckLaunchOptions())} style={{ minHeight: 44, padding: '10px 16px', border: 0, borderRadius: '7px', background: concern ? '#d93025' : '#b06000', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>{RETENTION_CHECK_ACTION_LABEL}</button>
    </section>
  );
};

export default RetentionQuickCheckBanner;
