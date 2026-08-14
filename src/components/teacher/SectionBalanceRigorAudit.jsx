import React, { useMemo } from 'react';
import { analyzeSectionBalanceRigor } from '../../platform/quality/sectionBalanceRigor.js';

const statusTone = {
  pass: { bg: '#e6f4ea', border: '#81c995', color: '#137333', label: 'PASS' },
  suggestion: { bg: '#fff8e1', border: '#f6c453', color: '#7a4f01', label: 'REVIEW' },
  warning: { bg: '#fef7e0', border: '#f9ab00', color: '#8a4b08', label: 'NEEDS BALANCE' },
  'not-applicable': { bg: '#f8f9fa', border: '#dadce0', color: '#5f6368', label: 'N/A' },
};

const metricBox = (label, value, note = '') => (
  <div style={{ padding: '10px 12px', border: '1px solid #e0e3e7', borderRadius: 9, background: '#fff', minWidth: 0 }}>
    <div style={{ fontSize: 11, fontWeight: 900, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ marginTop: 3, fontWeight: 900, fontSize: 18, color: '#202124' }}>{value}</div>
    {note && <div style={{ marginTop: 2, color: '#5f6368', fontSize: 11 }}>{note}</div>}
  </div>
);

export default function SectionBalanceRigorAudit({ lessonBundle }) {
  const report = useMemo(() => analyzeSectionBalanceRigor(lessonBundle), [lessonBundle]);
  const tone = statusTone[report.status] || statusTone['not-applicable'];
  const warnings = report.issues.filter((entry) => entry.severity === 'warning');
  const suggestions = report.issues.filter((entry) => entry.severity !== 'warning');

  if (!report.classwork.count && !report.practice.count) return null;

  return (
    <section aria-label="Section balance and rigor" style={{ marginBottom: 16, padding: 14, border: `2px solid ${tone.border}`, borderRadius: 11, background: tone.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15, color: '#202124' }}>Section Balance & Rigor</div>
          <div style={{ marginTop: 3, fontSize: 12, color: '#5f6368', lineHeight: 1.45 }}>
            Classwork should teach deeply with support. Practice should independently revisit the same objectives with comparable rigor and enough volume.
          </div>
        </div>
        <span style={{ padding: '5px 9px', borderRadius: 999, background: '#fff', border: `1px solid ${tone.border}`, color: tone.color, fontSize: 11, fontWeight: 900 }}>{tone.label}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginTop: 12 }}>
        {metricBox('Classwork', report.classwork.count, `${report.classwork.opportunityUnits} weighted opportunities`)}
        {metricBox('Practice', report.practice.count, `${report.practice.opportunityUnits} weighted opportunities`)}
        {metricBox('Average DOK', `${report.classwork.averageDok || '—'} → ${report.practice.averageDok || '—'}`, 'Classwork → Practice')}
        {metricBox('Rich tools', `${Math.round(report.classwork.richShare * 100)}% → ${Math.round(report.practice.richShare * 100)}%`, 'Classwork → Practice')}
      </div>

      {report.metrics && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#3c4043' }}>
          <strong>Independent coverage:</strong> {Math.round(report.metrics.standardCoverage * 100)}% of Classwork standards · {Math.round(report.metrics.familyCoverage * 100)}% of Classwork experience types
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: 12, background: '#fff', border: '1px solid #f6c453', borderRadius: 9, padding: '10px 12px' }}>
          <strong style={{ color: '#8a4b08' }}>Quality warnings</strong>
          <ul style={{ margin: '7px 0 0', paddingLeft: 20, lineHeight: 1.5 }}>
            {warnings.map((entry) => <li key={entry.id}><strong>{entry.title}.</strong> {entry.message}</li>)}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#5f6368' }}>{suggestions.length} additional authoring suggestion{suggestions.length === 1 ? '' : 's'}</summary>
          <ul style={{ margin: '7px 0 0', paddingLeft: 20, lineHeight: 1.5, fontSize: 12 }}>
            {suggestions.map((entry) => <li key={entry.id}><strong>{entry.title}.</strong> {entry.message}</li>)}
          </ul>
        </details>
      )}

      {report.status === 'pass' && (
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: '#137333' }}>
          ✓ Practice maintains the lesson's coverage and rigor while providing an appropriate independent follow-through.
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 11, color: '#5f6368' }}>
        Advisory only: these balance warnings do not block teacher publishing. Instructional-scope violations remain separate hard guardrails.
      </div>
    </section>
  );
}
