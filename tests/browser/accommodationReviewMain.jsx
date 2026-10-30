import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RetroactiveAccommodationReview from '../../src/components/teacher/RetroactiveAccommodationReview.jsx';
import WorkloadReceipt from '../../src/components/student/WorkloadReceipt.jsx';
import StudentGradeCenter from '../../src/components/student/StudentGradeCenter.jsx';
import StudentAssignmentsCenter from '../../src/components/student/StudentAssignmentsCenter.jsx';
import { buildStudentGradeCenter } from '../../src/platform/student/studentGradeCenterModel.js';
import { workloadReceiptForStudent } from '../../src/platform/student/workloadReceipt.js';
import '../../src/index.css';
import '../../src/components/teacher/teacherWorkspace.css';
import '../../src/components/teacher/supportEvidence.css';

const bridge = 'http://127.0.0.1:5197';
function Harness() {
  const [state, setState] = useState(null);
  const [view, setView] = useState('Teacher review');
  const refresh = async () => setState(await (await fetch(`${bridge}/state`)).json());
  useEffect(() => { refresh(); }, []);
  if (!state) return <p>Loading synthetic records</p>;
  const { student, assignments } = state;
  const gradeCenter = buildStudentGradeCenter({ studentId: student.id, classId: student.classId, assignments, tracker: student.gradesByAssignment, supportProfile: student.profile });
  // Exercise the same held-feedback provider boundary as App, while the
  // historical assignment is still inside its late-work window.
  const heldGradeCenter = buildStudentGradeCenter({ studentId: student.id, classId: student.classId,
    assignments: assignments.map((assignment) => ({ ...assignment, lateDueAt: '2026-09-30T18:00:00Z' })),
    tracker: student.gradesByAssignment, supportProfile: student.profile, nowValue: Date.parse('2026-09-16T18:00:00Z'),
    providers: { assignmentHasHeldTeacherFeedback: () => true } });
  const dashboard = { allEntries: gradeCenter.entries.map((entry) => ({ assignment: entry.assignment, lifecycle: entry.lifecycle, workloadReceipt: entry.workloadReceipt, bucket: entry.lifecycle.isPracticeOnly ? 'practice' : 'comingUp', questionsTotal: entry.overall.total, questionsDone: entry.overall.attempted, questionsAttempted: entry.overall.attempted })) };
  const service = async (data) => {
    const response = await fetch(`${bridge}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    await refresh(); return result;
  };
  return <main data-ready style={{ maxWidth: 950, margin: 'auto', padding: 12 }}>
    <h1>Synthetic workload review</h1>
    <nav aria-label="Journey role">{['Teacher review', 'Student assignments', 'Student grades', 'Student held grades', 'Family summary'].map((label) => <button key={label} style={{ minHeight: 44, margin: 4 }} onClick={() => setView(label)}>{label}</button>)}</nav>
    {view === 'Teacher review' && <RetroactiveAccommodationReview student={student} assignments={assignments} service={service} />}
    {view === 'Student assignments' && <StudentAssignmentsCenter studentId={student.id} dashboard={dashboard} gradeCenter={gradeCenter} />}
    {view === 'Student grades' && <StudentGradeCenter gradeCenter={gradeCenter} />}
    {view === 'Student held grades' && <StudentGradeCenter gradeCenter={heldGradeCenter} />}
    {view === 'Family summary' && <WorkloadReceipt receipt={workloadReceiptForStudent({ student, assignment: assignments[0] })} assignment={assignments[0]} family />}
  </main>;
}
createRoot(document.getElementById('root')).render(<Harness />);
