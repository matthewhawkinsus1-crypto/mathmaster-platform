import { useRef } from 'react';
import Dialog from '../../ui/Dialog.jsx';
import { STUDENT_NAME_UNAVAILABLE, formatStudentLabel, resolveRosterStudentName } from '../../platform/studentName.js';

/*
 * WHAT WOULD BE SENT, BEFORE ANYTHING IS SENT.
 *
 * This sheet shows the exact payload and stops. It has no publish button, and
 * that is not an oversight to be filled in later — it is the honest state of the
 * system. MathMaster's Classroom grade passback runs through the existing
 * publication and grade-sync path, which is where a teacher's linked courses,
 * their permissions and the audit record live. Putting a second, simpler
 * "Publish" button here would create a way to push grades to parents that
 * bypasses all three.
 *
 * A button that appears to publish and does not is worse than no button. A
 * teacher who clicks it will believe the grades went out.
 */

// The roster name, or "Name unavailable · ID x" so two nameless students stay
// distinguishable — never the bare id standing in for a name.
const rosterStudentLabel = (studentId, students, historicalName = '') => {
  const name = resolveRosterStudentName({ studentId, students, historicalName });
  return name === STUDENT_NAME_UNAVAILABLE ? formatStudentLabel(String(studentId ?? '')) : name;
};

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(16, 24, 22, .42)', zIndex: 95,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};

const SHEET = {
  width: 'min(720px, 100%)', maxHeight: '86vh', background: 'var(--mm-surface)', borderRadius: 14,
  boxShadow: '0 24px 60px rgba(0,0,0,.28)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
};

export default function ClassroomSyncReview({ proposal = null, students = [], onClose = null }) {
  const closeRef = useRef(null);

  if (!proposal) return null;

  const download = () => {
    // A file the teacher owns, rather than a transmission MathMaster performs.
    const blob = new Blob([JSON.stringify(proposal, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `weekly-path-grades-${proposal.classId || 'class'}-${proposal.weekKey || 'week'}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={OVERLAY} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <Dialog style={SHEET} onClose={onClose} initialFocusRef={closeRef} aria-label="Review weekly Path grades before publishing">
        <header style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--mm-border-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 19 }}>Weekly Path grades · week of {proposal.weekKey}</h2>
              <p style={{ margin: '5px 0 0', color: 'var(--mm-text-muted)', fontSize: 13 }}>
                {proposal.grades.length} student{proposal.grades.length === 1 ? '' : 's'} · {proposal.policy.description}
              </p>
            </div>
            <button
              type="button"
              ref={closeRef}
              onClick={() => onClose?.()}
              style={{ padding: '7px 12px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', fontWeight: 900, cursor: 'pointer' }}
            >
              Close
            </button>
          </div>

          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 9, background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', fontSize: 12.5, lineHeight: 1.5 }}>
            <strong>Nothing has been sent.</strong> These grades stay in MathMaster until you publish them through
            your existing Google Classroom publication flow, which is where your linked courses, your permissions
            and the audit record live. This screen exists so you can see the exact numbers first.
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--mm-surface-sunken)', textAlign: 'left' }}>
                <th style={{ padding: '10px 22px' }}>Student</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Sessions</th>
                <th style={{ padding: '10px 22px', textAlign: 'right' }}>Grade</th>
              </tr>
            </thead>
            <tbody>
              {proposal.grades.map((grade) => (
                <tr key={grade.studentId} style={{ borderTop: '1px solid var(--mm-border-soft)' }}>
                  <td style={{ padding: '9px 22px' }}>{rosterStudentLabel(grade.studentId, students, grade.studentName)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--mm-text-muted)' }}>
                    {grade.completed} / {grade.required}
                  </td>
                  <td style={{ padding: '9px 22px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 900, color: grade.passing ? 'var(--mm-success-text)' : 'var(--mm-warning-text)' }}>
                    {grade.score == null ? '—' : `${grade.score}%`} / {grade.outOf}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer style={{ display: 'flex', gap: 9, padding: '13px 22px', borderTop: '1px solid var(--mm-border-soft)', background: 'var(--mm-surface-sunken)', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={download}
            style={{ padding: '9px 13px', border: '1px solid #1a73e8', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 900, cursor: 'pointer' }}
          >
            Download these grades
          </button>
          <span style={{ color: 'var(--mm-text-muted)', fontSize: 12, flex: 1, minWidth: 200 }}>
            Includes the grading policy, so the numbers can be explained later.
          </span>
        </footer>
      </Dialog>
    </div>
  );
}
