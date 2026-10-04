import React from 'react';
import { officialReferenceKindLabel, referenceLabel } from '../../platform/ccmr/assessmentStandardReferences.js';

const chip = {
  display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '3px 7px', borderRadius: 999,
  background: 'var(--mm-surface-control)', color: 'var(--mm-text)', fontSize: 10.5, fontWeight: 850,
};

export default function CcmrReferenceList({ references = [], compact = false, showSource = true, showOverlap = true }) {
  if (!Array.isArray(references) || !references.length) {
    return <p style={{ margin: 0, color: 'var(--mm-text-subtle)', fontSize: 12 }}>No more-specific official reference has been mapped yet.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: compact ? 7 : 10 }}>
      {references.map((reference) => (
        <div key={`${reference.framework}:${reference.id}`} style={{ padding: compact ? '8px 9px' : '11px 12px', borderRadius: 10, border: '1px solid var(--mm-border-soft)', background: 'var(--mm-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ color: 'var(--mm-text-strong)', fontSize: compact ? 12.5 : 13.5 }}>{referenceLabel(reference)}</strong>
            <span style={{ color: 'var(--mm-text-muted)', fontSize: 10.5, fontWeight: 750 }}>{officialReferenceKindLabel(reference)}</span>
          </div>

          {!compact && reference.descriptor && (
            <p style={{ margin: '5px 0 0', color: 'var(--mm-text)', fontSize: 12.5, lineHeight: 1.55 }}>{reference.descriptor}</p>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
            {reference.scoreRange && <span style={chip}>ACT score range {reference.scoreRange}</span>}
            {reference.domainTitle && <span style={chip}>{reference.domainTitle}</span>}
            {reference.topic && <span style={chip}>{reference.topic}</span>}
            {reference.coverage === 'partial' && <span style={{ ...chip, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>Partial overlap</span>}
          </div>

          {showOverlap && !compact && reference.overlapSummary && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', color: 'var(--mm-primary-text)', fontSize: 12, fontWeight: 850 }}>How this Texas skill ties in</summary>
              <p style={{ margin: '7px 0 0', color: 'var(--mm-text)', fontSize: 12.5, lineHeight: 1.55 }}>{reference.overlapSummary}</p>
              {reference.excludedAspects?.length > 0 && (
                <p style={{ margin: '6px 0 0', color: 'var(--mm-warning-text)', fontSize: 12, lineHeight: 1.5 }}><strong>Not part of this assessment connection:</strong> {reference.excludedAspects.join('; ')}</p>
              )}
            </details>
          )}

          {showSource && !compact && reference.sourceUrl && (
            <a href={reference.sourceUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, color: 'var(--mm-accent-text)', fontSize: 11.5, fontWeight: 850, textDecoration: 'none' }}>
              Open official source ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
