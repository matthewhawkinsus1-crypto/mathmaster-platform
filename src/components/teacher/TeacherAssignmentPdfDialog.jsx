import { useMemo, useState } from 'react';

const studentName = (student) => {
  const direct = String(student?.displayName || student?.name || '').trim();
  if (direct) return direct;
  return [student?.firstName, student?.lastName].map((value) => String(value || '').trim()).filter(Boolean).join(' ')
    || String(student?.id || 'Student');
};

export default function TeacherAssignmentPdfDialog({
  assignment,
  students = [],
  busy = false,
  onCancel,
  onExport,
}) {
  const sortedStudents = useMemo(() => [...students].sort((left, right) => (
    studentName(left).localeCompare(studentName(right))
  )), [students]);
  const [selectedStudentId, setSelectedStudentId] = useState(sortedStudents[0]?.id || '');
  const selectedStudent = sortedStudents.find((student) => student.id === selectedStudentId) || null;

  return (
    <div
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10020, background: 'rgba(32,33,36,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-assignment-pdf-title"
        style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,.28)', overflow: 'hidden', textAlign: 'left' }}
      >
        <div style={{ padding: '22px 24px', borderBottom: '1px solid #e8eaed' }}>
          <div style={{ color: '#174ea6', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Printable student worksheet</div>
          <h2 id="teacher-assignment-pdf-title" style={{ margin: '5px 0 0', color: '#202124' }}>{assignment?.title || 'Assignment'}</h2>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ marginTop: 0, color: '#3c4043', lineHeight: 1.55 }}>
            This assignment contains personalized or adaptive sections. Choose the student whose exact MathMaster version you want to print.
          </p>
          <label style={{ display: 'block', fontWeight: 800, color: '#3c4043' }}>
            Student version
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              disabled={busy}
              style={{ display: 'block', width: '100%', marginTop: 7, minHeight: 44, padding: '9px 11px', border: '1px solid #bdc7d6', borderRadius: 8, background: '#fff', fontSize: 15 }}
            >
              {sortedStudents.map((student) => (
                <option key={student.id} value={student.id}>{studentName(student)}{student.classPeriod ? ` · ${student.classPeriod}` : ''}</option>
              ))}
            </select>
          </label>
          <div style={{ marginTop: 15, padding: '11px 13px', borderRadius: 9, background: '#f8f9fa', color: '#5f6368', fontSize: 12.5, lineHeight: 1.5 }}>
            The PDF contains questions and workspace only. Answers, solutions, grading keys, generator internals, and teacher-only data are not exported.
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '17px 24px', borderTop: '1px solid #e8eaed', background: '#f8f9fa' }}>
          <button type="button" onClick={() => onCancel?.()} disabled={busy} style={{ padding: '10px 16px', border: '1px solid #bdc7d6', borderRadius: 8, background: '#fff', color: '#3c4043', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>Cancel</button>
          <button type="button" onClick={() => selectedStudent && onExport?.(selectedStudent)} disabled={!selectedStudent || busy} style={{ padding: '10px 17px', border: 0, borderRadius: 8, background: !selectedStudent || busy ? '#dadce0' : '#174ea6', color: '#fff', fontWeight: 900, cursor: !selectedStudent || busy ? 'wait' : 'pointer' }}>
            {busy ? 'Building PDF…' : 'Export Student Version'}
          </button>
        </div>
      </section>
    </div>
  );
}
