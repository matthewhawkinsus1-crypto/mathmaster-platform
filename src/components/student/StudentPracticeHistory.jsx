import React, { useMemo, useState } from 'react';
import { buildStudentEvidenceTimeline, getTimelineTeksOptions } from '../../platform/history/evidenceTimelineService.js';
import { toDisplayCode } from '../../utils/teksUtils.js';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';

const chipStyle = { display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 };

export const StudentPracticeHistory = ({ evidenceEvents = [], availableTeks = [], loading = false, error = null }) => {
  const [teksFilter, setTeksFilter] = useState('all');
  const options = useMemo(() => [...new Set([
    ...availableTeks.map(toDisplayCode),
    ...getTimelineTeksOptions(evidenceEvents),
  ].filter(Boolean))].sort(), [availableTeks, evidenceEvents]);
  const report = useMemo(
    () => buildStudentEvidenceTimeline(evidenceEvents, teksFilter === 'all' ? null : teksFilter),
    [evidenceEvents, teksFilter],
  );
  const accuracy = report.totalEvents ? Math.round((report.correctEvents / report.totalEvents) * 100) : 0;

  if (loading) return <div style={{ padding: '50px', textAlign: 'center', color: '#174ea6' }}>Loading practice history…</div>;

  return (
    <section style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 18px 42px', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, color: '#202124', fontSize: '26px' }}>Practice History</h1>
          <p style={{ margin: '5px 0 0', color: '#5f6368' }}>A chronological record of your MathMaster learning evidence.</p>
        </div>
        <label style={{ fontSize: '12px', fontWeight: 800, color: '#3c4043' }}>
          Skill
          <select value={teksFilter} onChange={(event) => setTeksFilter(event.target.value)} style={{ display: 'block', minWidth: '180px', marginTop: '5px', padding: '9px 10px', border: '1px solid #bdc1c6', borderRadius: '7px', background: '#fff' }}>
            <option value="all">All skills</option>
            {options.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </label>
      </div>

      {error && <div role="alert" style={{ marginBottom: '18px', padding: '12px 14px', borderRadius: '8px', background: '#fce8e6', color: '#a50e0e' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '24px' }}>
        {[
          ['Evidence events', report.totalEvents],
          ['Correct', `${accuracy}%`],
          ['Independent', report.independentEvents],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: '14px 16px', border: '1px solid #dadce0', borderRadius: '9px', background: '#fff' }}>
            <div style={{ color: '#5f6368', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ marginTop: '3px', color: '#202124', fontSize: '22px', fontWeight: 900 }}>{value}</div>
          </div>
        ))}
      </div>

      {!report.totalEvents ? (
        <div style={{ padding: '34px', border: '1px dashed #bdc1c6', borderRadius: '12px', background: '#fff', color: '#5f6368', textAlign: 'center' }}>
          No practice evidence matches this view yet. New attempts will appear here automatically.
        </div>
      ) : Object.entries(report.groupedByDate).map(([dateLabel, items]) => (
        <div key={dateLabel} style={{ marginBottom: '26px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '15px', color: '#3c4043' }}>{dateLabel}</h2>
          <div style={{ display: 'grid', gap: '10px' }}>
            {items.map((item) => (
              <article key={item.eventKey} style={{ padding: '15px 17px', border: '1px solid #dadce0', borderRadius: '10px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <strong style={{ color: '#174ea6' }}>{studentLabelForTeks(item.primaryTeks)}</strong>
                      <span style={{ ...chipStyle, background: '#e8f0fe', color: '#174ea6' }}>{item.activityRoleName}</span>
                      <span style={{ ...chipStyle, background: item.classification.isIndependent ? '#e6f4ea' : '#fff4ce', color: item.classification.isIndependent ? '#137333' : '#7a4f00' }}>{item.classification.label}</span>
                    </div>
                    <div style={{ marginTop: '7px', color: '#5f6368', fontSize: '12px' }}>
                      {item.dateFormatted} · Attempt {item.attemptNumber}{item.dok ? ` · DOK ${item.dok}` : ''}{item.difficultyBand ? ` · Band ${item.difficultyBand}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: item.isCorrect ? '#137333' : '#b3261e' }}>
                    {Math.round(item.score * 100)}% {item.isCorrect ? '✓' : ''}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '8px', marginTop: '12px', paddingTop: '11px', borderTop: '1px solid #f1f3f4', fontSize: '12px', color: '#3c4043' }}>
                  <div><strong>Question family:</strong> {item.familyId || 'Legacy assignment question'}</div>
                  <div><strong>Question instance:</strong> {item.questionInstanceId || '—'}</div>
                  <div><strong>Supports presented:</strong> {item.supportsPresented.join(', ') || 'None recorded'}</div>
                  <div><strong>Supports used:</strong> {item.supportsUsed.join(', ') || 'None recorded'}</div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};

export default StudentPracticeHistory;
