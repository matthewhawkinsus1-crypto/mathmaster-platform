/*
 * ONE STUDENT'S DOL ATTEMPTS IN THE GRADEBOOK'S STUDENT DETAIL.
 *
 * How many teacher-granted attempts this student has on each DOL question
 * (the class grant plus their own — summarizeStudentRecovery, the resolver
 * ingestion counts with), the "+1" for this student, and, on request, the
 * history of their grants: read once from the staff-only history under the
 * student (platform/teacher/studentOverrideHistory.js), never from the shared
 * assignment and never by the student.
 */
import { useState } from 'react';
import { summarizeStudentRecovery } from '../../platform/assessment/assessmentRecovery.js';
import { fetchStudentOverrideHistory } from '../../platform/teacher/studentOverrideHistory.js';

const timeOf = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time not recorded');

export default function StudentDolRecoveryRow({
  db,
  assignment,
  student,
  classId = null,
  viewer = {},
  busy = false,
  onGrant = null,
}) {
  const [history, setHistory] = useState({ status: 'closed', entries: [], error: null });
  if (!assignment?.dol?.enabled || !student?.id) return null;
  const recovery = summarizeStudentRecovery({ assignment, classId, studentId: student.id });

  const toggleHistory = async () => {
    if (history.status === 'open' || history.status === 'loading') {
      setHistory({ status: 'closed', entries: [], error: null });
      return;
    }
    setHistory({ status: 'loading', entries: [], error: null });
    try {
      const entries = await fetchStudentOverrideHistory({
        db,
        studentId: student.id,
        assignmentId: assignment.id,
        email: viewer.email || '',
        isRootAdmin: viewer.isRootAdmin === true,
      });
      setHistory({ status: 'open', entries, error: null });
    } catch (error) {
      setHistory({ status: 'open', entries: [], error: error?.message || 'The history could not be loaded.' });
    }
  };

  return (
    <div data-dol-student-recovery={student.id} style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 12.5, color: 'var(--mm-text)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span>Teacher-granted DOL attempts: <strong>{recovery.extraAttempts}</strong>{recovery.studentExtraAttempts ? ` (${recovery.studentExtraAttempts} for this student)` : ''}</span>
        <button type="button" disabled={busy} onClick={() => onGrant?.()} style={{ padding: '6px 10px', border: '1px solid #1a73e8', borderRadius: 6, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Granting…' : 'Grant +1 DOL attempt'}</button>
        <button type="button" data-dol-grant-history-toggle={student.id} aria-expanded={history.status === 'open'} onClick={toggleHistory} style={{ padding: '6px 10px', border: '1px solid var(--mm-border)', borderRadius: 6, background: 'var(--mm-surface)', color: 'var(--mm-text)', fontWeight: 700, cursor: 'pointer' }}>
          {history.status === 'loading' ? 'Loading history…' : history.status === 'open' ? 'Hide grant history' : 'Grant history'}
        </button>
      </div>
      {history.status === 'open' && (
        <section data-dol-grant-history={student.id} aria-label="Grant history" style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', display: 'grid', gap: 4 }}>
          {history.error && <div role="alert" style={{ color: 'var(--mm-error-text)' }}>{history.error}</div>}
          {!history.error && !history.entries.length && <div style={{ color: 'var(--mm-text-muted)' }}>No individual changes are recorded for this student on this assignment.</div>}
          {history.entries.map((entry) => (
            <div key={entry.id} data-dol-grant-history-entry={entry.kind} style={{ display: 'grid', gap: 1 }}>
              <div><strong style={{ color: 'var(--mm-text-strong)' }}>{entry.label}</strong> <span style={{ color: 'var(--mm-text-muted)' }}>· {timeOf(entry.atMs)} · {entry.actor}</span></div>
              <div style={{ color: 'var(--mm-text-muted)' }}>{entry.summary}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
