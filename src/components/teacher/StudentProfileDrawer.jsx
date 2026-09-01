import { useEffect, useRef } from 'react';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';
import StudentLearningProfileView from './StudentLearningProfileView.jsx';
import { resolveAdaptiveRigorFromProfile } from '../../platform/rigor/courseRigor.js';
import { courseLabel, courseLevelLabel } from '../../../functions/shared/classModel.mjs';
import { SUPPORT_EVENT_LABEL, SUPPORT_STAGE_LABEL } from '../../platform/teacher/studentSupportSignals.js';

/*
 * ONE STUDENT, ONE ANSWER, FROM ANYWHERE.
 *
 * A student's name appears on eleven teacher surfaces. Before this drawer,
 * clicking it did something different on each one — nothing on most, a row
 * expansion on one, a full navigation away from the teacher's work on another.
 * And because each of those screens derived its own status, the answer a
 * teacher got depended on which name they happened to click.
 *
 * The drawer is the fix for both halves of that. It renders the SAME profile
 * from the SAME evidence regardless of where it was opened, and it opens over
 * the teacher's current work instead of replacing it — a teacher checking one
 * student mid-lesson should not lose the class monitor they were watching.
 *
 * It is deliberately read-only. Opening a student is a question, not a decision,
 * and nothing here alters a plan. The two buttons at the bottom go to the places
 * where a teacher can act, and those places ask before they change anything.
 */

const OVERLAY = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(16, 24, 22, .38)',
  zIndex: 90,
  display: 'flex',
  justifyContent: 'flex-end',
};

const PANEL = {
  width: 'min(620px, 100%)',
  height: '100%',
  background: '#fff',
  boxShadow: '-12px 0 40px rgba(0,0,0,.18)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const fact = (label, value) => (
  <div key={label}>
    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5f6368' }}>{label}</div>
    <div style={{ marginTop: 2, fontWeight: 700 }}>{value}</div>
  </div>
);

export default function StudentProfileDrawer({
  open = false,
  studentName = '',
  studentId = null,
  profile = null,
  plan = null,
  classRecord = null,
  courseContext = null,
  supportEvents = [],
  sessionSummaries = [],
  onClose = null,
  onOpenFullRecord = null,
  onOpenGradebook = null,
}) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    // Focus lands on the close control so a keyboard user is inside the drawer,
    // not still tabbing through the page behind it.
    closeRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const level = courseContext?.courseLevel || classRecord?.courseLevel || 'standard';
  const course = courseContext?.courseId || classRecord?.course || 'algebra1';
  const posture = resolveAdaptiveRigorFromProfile({ courseLevel: level, profile });

  return (
    <div
      style={OVERLAY}
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <aside style={PANEL} role="dialog" aria-modal="true" aria-label={`Learning profile for ${studentName}`}>
        <header style={{ padding: '18px 22px 14px', borderBottom: '1px solid #eef0f2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{studentName}</h2>
              <div style={{ marginTop: 5, color: '#5f6368', fontSize: 13 }}>
                {classRecord?.name || courseContext?.classPeriod || 'No class'} · {courseLabel(course)} · {courseLevelLabel(level)}
                {studentId ? ` · ID ${studentId}` : ''}
              </div>
            </div>
            <button
              type="button"
              ref={closeRef}
              onClick={() => onClose?.()}
              aria-label="Close student profile"
              style={{ padding: '7px 12px', border: '1px solid #dadce0', borderRadius: 8, background: '#fff', fontWeight: 900, cursor: 'pointer' }}
            >
              Close
            </button>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <StudentPerformanceBadge profile={profile} studentName={studentName} />
          </div>

          {courseContext?.source === 'periodFallback' && (
            <p style={{ margin: '12px 0 0', padding: '8px 10px', borderRadius: 8, background: '#fff4ce', color: '#6b4c00', fontSize: 12.5 }}>
              This student has no class record, so their course was inferred from their class period. Give them a class in Administration and this becomes authoritative.
            </p>
          )}
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 26px' }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 20 }}>
            {fact('Adaptive posture', posture.label)}
            {fact('Skills with evidence', profile?.skillsWithEvidence ?? 0)}
            {fact('Classifying evidence', profile?.baseline?.events ?? 0)}
          </section>

          <StudentLearningProfileView studentName={studentName} profile={profile} plan={plan} />

          <section style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #eef0f2' }}>
            <h3 style={{ margin: '0 0 5px', fontSize: 16 }}>Support & intervention history</h3>
            <p style={{ margin: '0 0 10px', color: '#5f6368', fontSize: 12.5 }}>
              System signals, teacher confirmations, dismissals and actions remain separate in this append-only history.
            </p>
            {supportEvents.length ? (
              <div style={{ display: 'grid', gap: 7 }}>
                {supportEvents.slice(0, 20).map((event) => {
                  const date = new Date(event.createdAt || '');
                  const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
                  return (
                    <div key={event.id} style={{ padding: '9px 10px', borderRadius: 8, background: '#f8f9fa', border: '1px solid #eef0f2' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 12.5 }}>{SUPPORT_EVENT_LABEL[event.kind] || event.kind}</strong>
                        <span style={{ fontSize: 11, color: '#80868b' }}>{when}</span>
                      </div>
                      <div style={{ marginTop: 2, fontSize: 11.5, color: '#5f6368' }}>
                        {SUPPORT_STAGE_LABEL[event.stage] || event.stage}{event.source ? ` · ${event.source}` : ''}
                      </div>
                      {event.summary && <div style={{ marginTop: 4, fontSize: 12, color: '#3c4043', lineHeight: 1.4 }}>{event.summary}</div>}
                      {event.note && <div style={{ marginTop: 4, fontSize: 12, color: '#3c4043', lineHeight: 1.4 }}><strong>Teacher note:</strong> {event.note}</div>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#80868b', fontSize: 12.5 }}>No stored support/intervention events for this student yet.</div>
            )}
          </section>

          <section style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #eef0f2' }}>
            <h3 style={{ margin: '0 0 5px', fontSize: 16 }}>Recent class-session summaries</h3>
            <p style={{ margin: '0 0 10px', color: '#5f6368', fontSize: 12.5 }}>
              Objective platform counts only. These summaries are supporting context, not behavior or integrity findings unless a teacher separately confirms a concern above.
            </p>
            {sessionSummaries.length ? (
              <div style={{ display: 'grid', gap: 7 }}>
                {sessionSummaries.slice(0, 8).map((summary) => {
                  const ended = new Date(Number(summary.endedAt) || 0);
                  const when = Number.isNaN(ended.getTime()) ? '' : ended.toLocaleString();
                  const elapsedMinutes = Math.max(0, Math.round(((Number(summary.endedAt) || 0) - (Number(summary.startedAt) || 0)) / 60000));
                  const activeMinutes = Math.max(0, Math.round((Number(summary.activeSeconds) || 0) / 60));
                  return (
                    <div key={summary.id} style={{ padding: '9px 10px', borderRadius: 8, background: '#fff', border: '1px solid #eef0f2' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 12.5 }}>{summary.assignmentTitle || 'Assignment session'}</strong>
                        <span style={{ fontSize: 11, color: '#80868b' }}>{when}</span>
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11.5, color: '#5f6368', lineHeight: 1.45 }}>
                        {activeMinutes} active min of {elapsedMinutes} elapsed · {Number(summary.answered) || 0} answered
                        {summary.accuracy != null ? ` · ${summary.accuracy}% correct` : ''}
                        {Number(summary.focusLossCount) > 0 ? ` · ${summary.focusLossCount} focus-loss event${Number(summary.focusLossCount) === 1 ? '' : 's'}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#80868b', fontSize: 12.5 }}>No archived class-session summaries yet.</div>
            )}
          </section>
        </div>

        <footer style={{ display: 'flex', gap: 9, padding: '13px 22px', borderTop: '1px solid #eef0f2', background: '#f8f9fa', flexWrap: 'wrap' }}>
          {/*
            Ways OUT of the drawer, not actions taken inside it. Opening an alert
            or a name must never change a student's plan by itself.
          */}
          {onOpenFullRecord && (
            <button
              type="button"
              onClick={() => onOpenFullRecord(studentId)}
              style={{ padding: '9px 13px', border: '1px solid #1a73e8', borderRadius: 8, background: '#fff', color: '#174ea6', fontWeight: 900, cursor: 'pointer' }}
            >
              Open full student record
            </button>
          )}
          {onOpenGradebook && (
            <button
              type="button"
              onClick={() => onOpenGradebook(studentId)}
              style={{ padding: '9px 13px', border: '1px solid #dadce0', borderRadius: 8, background: '#fff', color: '#3c4043', fontWeight: 900, cursor: 'pointer' }}
            >
              Open grades
            </button>
          )}
          <span style={{ marginLeft: 'auto', alignSelf: 'center', color: '#5f6368', fontSize: 12 }}>
            Read-only. Nothing here changes this student&apos;s plan.
          </span>
        </footer>
      </aside>
    </div>
  );
}
