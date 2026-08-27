import { useMemo, useState } from 'react';
import { PRINT_OUTPUT_MODES } from '../../platform/resources/assignmentWorksheetPdfModel.js';

const studentName = (student) => {
  const direct = String(student?.displayName || student?.name || '').trim();
  if (direct) return direct;
  return [student?.firstName, student?.lastName].map((value) => String(value || '').trim()).filter(Boolean).join(' ')
    || String(student?.id || 'Student');
};

const MODE_OPTIONS = [
  {
    id: PRINT_OUTPUT_MODES.STUDENT,
    title: 'Student Worksheet',
    note: 'Questions and workspace only. No answers or teacher-only data.',
  },
  {
    id: PRINT_OUTPUT_MODES.TEACHER,
    title: 'Teacher Copy',
    note: 'Same questions with answers, available solution/explanation steps, and workspace.',
  },
  {
    id: PRINT_OUTPUT_MODES.ANSWER_KEY,
    title: 'Answer Key',
    note: 'Compact question-and-answer pages without blank student workspace.',
  },
];

export default function TeacherAssignmentPdfDialog({
  assignment,
  students = [],
  requiresStudent = false,
  busy = false,
  onCancel,
  onExport,
}) {
  const sortedStudents = useMemo(() => [...students].sort((left, right) => (
    studentName(left).localeCompare(studentName(right))
  )), [students]);
  const [selectedStudentId, setSelectedStudentId] = useState(requiresStudent ? (sortedStudents[0]?.id || '') : '');
  const [outputMode, setOutputMode] = useState(PRINT_OUTPUT_MODES.STUDENT);
  const selectedStudent = sortedStudents.find((student) => student.id === selectedStudentId) || null;
  const canExport = !busy && (!requiresStudent || Boolean(selectedStudent));
  const selectedMode = MODE_OPTIONS.find((entry) => entry.id === outputMode) || MODE_OPTIONS[0];

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
        style={{ width: '100%', maxWidth: 620, background: '#fff', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,.28)', overflow: 'hidden', textAlign: 'left' }}
      >
        <div style={{ padding: '22px 24px', borderBottom: '1px solid #e8eaed' }}>
          <div style={{ color: '#174ea6', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Print Assignment</div>
          <h2 id="teacher-assignment-pdf-title" style={{ margin: '5px 0 0', color: '#202124' }}>{assignment?.title || 'Assignment'}</h2>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ fontWeight: 900, color: '#202124', marginBottom: 9 }}>Choose output</div>
          <div style={{ display: 'grid', gap: 9 }}>
            {MODE_OPTIONS.map((mode) => {
              const selected = outputMode === mode.id;
              return (
                <label
                  key={mode.id}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px',
                    border: selected ? '2px solid #1a73e8' : '1px solid #d8dde6',
                    borderRadius: 10, background: selected ? '#f1f7ff' : '#fff', cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="assignment-pdf-mode"
                    value={mode.id}
                    checked={selected}
                    disabled={busy}
                    onChange={() => setOutputMode(mode.id)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong style={{ color: '#202124' }}>{mode.title}</strong>
                    <span style={{ display: 'block', marginTop: 2, color: '#5f6368', fontSize: 12.5, lineHeight: 1.45 }}>{mode.note}</span>
                  </span>
                </label>
              );
            })}
          </div>

          <label style={{ display: 'block', marginTop: 18, fontWeight: 800, color: '#3c4043' }}>
            {requiresStudent ? 'Exact student version' : 'Student name/version (optional)'}
            <select
              value={selectedStudentId}
              onChange={(event) => setSelectedStudentId(event.target.value)}
              disabled={busy}
              style={{ display: 'block', width: '100%', marginTop: 7, minHeight: 44, padding: '9px 11px', border: '1px solid #bdc7d6', borderRadius: 8, background: '#fff', fontSize: 15 }}
            >
              {!requiresStudent && <option value="">Shared version / blank student fields</option>}
              {sortedStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {studentName(student)}{student.classPeriod ? ' · ' + student.classPeriod : ''}
                </option>
              ))}
            </select>
          </label>

          <div style={{ marginTop: 15, padding: '11px 13px', borderRadius: 9, background: requiresStudent ? '#fff8e1' : '#f8f9fa', color: '#5f6368', fontSize: 12.5, lineHeight: 1.5 }}>
            {requiresStudent
              ? 'This assignment contains personalized or adaptive sections. Select a student so the printed questions and the teacher answer/key data are generated from that exact MathMaster version.'
              : 'This assignment is shared. You may print a blank shared version or attach a student name; the mathematical questions stay the same.'}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '17px 24px', borderTop: '1px solid #e8eaed', background: '#f8f9fa' }}>
          <button type="button" onClick={() => onCancel?.()} disabled={busy} style={{ padding: '10px 16px', border: '1px solid #bdc7d6', borderRadius: 8, background: '#fff', color: '#3c4043', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>Cancel</button>
          <button
            type="button"
            onClick={() => onExport?.(selectedStudent, outputMode)}
            disabled={!canExport}
            style={{ padding: '10px 17px', border: 0, borderRadius: 8, background: canExport ? '#174ea6' : '#dadce0', color: '#fff', fontWeight: 900, cursor: canExport ? 'pointer' : 'wait' }}
          >
            {busy ? 'Building PDF…' : 'Export ' + selectedMode.title}
          </button>
        </div>
      </section>
    </div>
  );
}
