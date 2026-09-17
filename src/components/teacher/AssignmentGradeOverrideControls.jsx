import { useEffect, useState } from 'react';
import { assignmentGradeOverrideFor } from '../../platform/grading/canonicalGradeProjection.js';
import { overrideStudentAssignmentGrade } from '../../services/responseInspectorService.js';

const ZERO_REASONS = [
  { code: 'cellPhoneUse', label: 'Cell phone use' },
  { code: 'academicDishonesty', label: 'Academic dishonesty' },
];

export default function AssignmentGradeOverrideControls({ student, assignment, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [override, setOverride] = useState(() => assignmentGradeOverrideFor(student, assignment?.id));

  useEffect(() => {
    setOverride(assignmentGradeOverrideFor(student, assignment?.id));
  }, [student, assignment?.id]);

  const act = async ({ action, reasonCode = null }) => {
    const studentName = student?.displayName || student?.name || student?.id || 'this student';
    const assignmentTitle = assignment?.title || 'this assignment';
    const prompt = action === 'issueZero'
      ? `Assign a 0 for ${studentName} on ${assignmentTitle}? This changes the canonical assignment grade and is audit logged.`
      : `Restore the automatic MathMaster grade for ${studentName} on ${assignmentTitle}?`;
    if (!window.confirm(prompt)) return;

    setBusy(true);
    setMessage('');
    try {
      const result = await overrideStudentAssignmentGrade({
        studentId: student?.id || student?.studentId,
        assignmentId: assignment?.id,
        action,
        reasonCode,
        note: note.trim(),
      });
      setOverride(result?.override || null);
      setNote('');
      setMessage(action === 'issueZero' ? 'Teacher-issued zero recorded.' : 'Automatic grade restored.');
      onChanged?.();
    } catch (error) {
      setMessage(error?.message || 'The assignment grade could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  if (override) {
    return <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#fce8e6', border: '1px solid #f6aea9' }}>
      <div style={{ fontWeight: 900, color: '#b3261e' }}>Teacher assignment override · {override.score}%</div>
      <div style={{ marginTop: 3, fontSize: 12, color: '#5f6368' }}>{override.reason || override.reasonCode || 'Teacher-issued grade'}</div>
      {override.note && <div style={{ marginTop: 3, fontSize: 12, color: '#5f6368' }}>Note: {override.note}</div>}
      <button type="button" disabled={busy} onClick={() => act({ action: 'restoreAutomatic' })} style={{ marginTop: 8 }}>Restore automatic grade</button>
      {message && <div role="status" style={{ marginTop: 6, fontSize: 12 }}>{message}</div>}
    </div>;
  }

  return <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid #dadce0' }}>
    <div style={{ fontSize: 12, fontWeight: 900 }}>Assignment grade action</div>
    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {ZERO_REASONS.map((reason) => <button
        key={reason.code}
        type="button"
        disabled={busy}
        onClick={() => act({ action: 'issueZero', reasonCode: reason.code })}
        style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #b3261e', background: '#fff', color: '#b3261e', fontWeight: 800 }}
      >
        Assign 0 · {reason.label}
      </button>)}
    </div>
    <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
      Optional note
      <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} style={{ display: 'block', width: '100%', marginTop: 4 }} />
    </label>
    {message && <div role="status" style={{ marginTop: 6, fontSize: 12 }}>{message}</div>}
  </div>;
}
