import React, { useMemo, useState } from 'react';
import { buildStudentEvidenceTimeline, getTimelineTeksOptions } from '../../platform/history/evidenceTimelineService.js';
import { toDisplayCode } from '../../utils/teksUtils.js';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';
import {
  PRACTICE_HISTORY_EVENT_LIMIT,
  practiceHistoryCapNotice,
  studentAttemptLabel,
  studentSupportNames,
  summarizePracticeByWeek,
} from '../../platform/mastery/practiceHistoryPresentation.js';

const chipStyle = { display: 'inline-flex', alignItems: 'center', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 };

export const StudentPracticeHistory = ({
  evidenceEvents = [], availableTeks = [], loading = false, error = null,
  // How many answers the caller loaded at most. Reaching it means the list is
  // the most recent answers, not all of them, and the screen says so.
  eventLimit = PRACTICE_HISTORY_EVENT_LIMIT,
}) => {
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
  const capNotice = practiceHistoryCapNotice({ loaded: evidenceEvents.length, limit: eventLimit });
  const weeks = useMemo(
    () => summarizePracticeByWeek(report.timeline, { loadedEvents: evidenceEvents, limit: eventLimit }),
    [report.timeline, evidenceEvents, eventLimit],
  );

  if (loading) return <div style={{ padding: '50px', textAlign: 'center', color: 'var(--mm-primary-text)' }}>Loading practice history…</div>;

  return (
    <section style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 18px 42px', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: '26px' }}>Practice History</h1>
          <p style={{ margin: '5px 0 0', color: 'var(--mm-text-muted)' }}>Every answer you have checked, newest first.</p>
        </div>
        <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--mm-text)' }}>
          Skill
          <select value={teksFilter} onChange={(event) => setTeksFilter(event.target.value)} style={{ display: 'block', minWidth: '180px', maxWidth: '100%', minHeight: '44px', marginTop: '5px', padding: '9px 10px', border: '1px solid var(--mm-border)', borderRadius: '7px', background: 'var(--mm-surface)' }}>
            <option value="all">All skills</option>
            {/* The filter lists the mathematics, not the identifiers. The code
                stays as the option VALUE, which is what the filter matches on. */}
            {options.map((code) => <option key={code} value={code}>{studentLabelForTeks(code)}</option>)}
          </select>
        </label>
      </div>

      {error && <div role="alert" style={{ marginBottom: '18px', padding: '12px 14px', borderRadius: '8px', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '10px', marginBottom: '24px' }}>
        {[
          ['Answers', report.totalEvents],
          ['Correct', `${accuracy}%`],
          ['Independent', report.independentEvents],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: '14px 16px', border: '1px solid var(--mm-border)', borderRadius: '9px', background: 'var(--mm-surface)' }}>
            <div style={{ color: 'var(--mm-text-muted)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ marginTop: '3px', color: 'var(--mm-text-strong)', fontSize: '22px', fontWeight: 900 }}>{value}</div>
          </div>
        ))}
      </div>

      {capNotice && (
        <p role="status" style={{ margin: '-10px 0 18px', padding: '10px 12px', borderRadius: '8px', background: 'var(--mm-surface-tint)', color: 'var(--mm-primary-text)', fontSize: '13px', lineHeight: 1.5 }}>
          {capNotice}
        </p>
      )}

      {weeks.length > 0 && (
        <section aria-labelledby="practice-by-week" style={{ marginBottom: '26px' }}>
          <h2 id="practice-by-week" style={{ margin: '0 0 10px', fontSize: '15px', color: 'var(--mm-text)' }}>By week</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
            {weeks.map((week) => (
              <li key={week.weekKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px 14px', flexWrap: 'wrap', padding: '10px 14px', border: '1px solid var(--mm-border)', borderRadius: '9px', background: 'var(--mm-surface)' }}>
                <strong style={{ color: 'var(--mm-text-strong)' }}>{week.label}</strong>
                <span style={{ color: 'var(--mm-text)', fontSize: '13px' }}>
                  {week.answers} {week.answers === 1 ? 'answer' : 'answers'} · {week.accuracy}% correct · {week.onYourOwn} on your own
                  {week.partial && <span style={{ ...chipStyle, marginLeft: '8px', background: 'var(--mm-surface-sunken)', color: 'var(--mm-text-muted)' }}>Older answers not shown</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!report.totalEvents ? (
        <div style={{ padding: '34px', border: '1px dashed var(--mm-border)', borderRadius: '12px', background: 'var(--mm-surface)', color: 'var(--mm-text-muted)', textAlign: 'center' }}>
          No answers match this view yet. New answers appear here automatically.
        </div>
      ) : Object.entries(report.groupedByDate).map(([dateLabel, items]) => (
        <div key={dateLabel} style={{ marginBottom: '26px' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: '15px', color: 'var(--mm-text)' }}>{dateLabel}</h2>
          <div style={{ display: 'grid', gap: '10px' }}>
            {items.map((item) => (
              <article key={item.eventKey} style={{ padding: '15px 17px', border: '1px solid var(--mm-border)', borderRadius: '10px', background: 'var(--mm-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <strong style={{ color: 'var(--mm-primary-text)' }}>{studentLabelForTeks(item.primaryTeks)}</strong>
                      <span style={{ ...chipStyle, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' }}>{item.activityRoleName}</span>
                      <span style={{ ...chipStyle, background: item.classification.isIndependent ? 'var(--mm-success-bg)' : 'var(--mm-warning-soft)', color: item.classification.isIndependent ? 'var(--mm-success-text)' : 'var(--mm-warning-text)' }}>{studentAttemptLabel(item.classification)}</span>
                    </div>
                    <div style={{ marginTop: '7px', color: 'var(--mm-text-muted)', fontSize: '12px' }}>
                      {/* DOK and difficulty band are how the platform reasons
                          about a question. They tell a student nothing about
                          their own learning and read as a grade on the work. */}
                      {item.dateFormatted} · Attempt {item.attemptNumber}
                    </div>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: item.isCorrect ? 'var(--mm-success-text)' : 'var(--mm-error-text)' }}>
                    {Math.round(item.score * 100)}% {item.isCorrect ? '✓' : ''}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: '8px', marginTop: '12px', paddingTop: '11px', borderTop: '1px solid var(--mm-border-soft)', fontSize: '12px', color: 'var(--mm-text)' }}>
                  {/* Family and instance ids are database keys. What a student
                      wants from their own history is what kind of work it was
                      and what help was on the table — by the names they saw,
                      never a stored support id. */}
                  <div><strong>Tools on screen:</strong> {studentSupportNames(item.supportsPresented).join(', ') || 'None'}</div>
                  <div><strong>You used:</strong> {studentSupportNames(item.supportsUsed).join(', ') || 'None'}</div>
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
