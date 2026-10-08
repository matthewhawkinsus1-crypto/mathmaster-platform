import React, { useMemo, useState } from 'react';
import ProctorLiveMonitor from './ProctorLiveMonitor.jsx';
import TestCycleControls from '../teacher/TestCycleControls.jsx';
import { createSecureExamSession } from '../../services/secureExamService.js';
import { EXAM_TYPES } from '../../platform/assessment/examDomainRegistry.js';
import { getExamPolicy } from '../../platform/policies/examPolicyResolver.js';
import { describePracticeTestTime } from '../../platform/assessment/secureExamResultsModel.js';
import { compareStudentsByName, formatStudentLabel } from '../../platform/studentName.js';

const fieldLabel = { fontWeight: 800, fontSize: 13, color: 'var(--mm-text)' };
const fieldControl = { display: 'block', width: '100%', minHeight: 44, marginTop: 5, boxSizing: 'border-box' };

/*
 * The teacher side of "Tests & Exams" holds the same two things the student
 * side does: their own course Test Cycles, and the College & Career
 * simulations. Both run on this one secure runtime, so both are administered
 * from one screen rather than from two that could drift apart.
 */
export const TeacherSecureExamDashboard = ({ students = [], testCycleAssignments = [], classId = null, focusedTestCycleAssignmentId = null, onPreviewTestCycle = null }) => {
  /*
   * WHICH TEST CYCLES, AND WHICH ONE OPEN.
   *
   * This listed every Test Cycle ever created, archived ones included, each
   * fully expanded and each running a secure preflight on load. Archived
   * cycles are now behind a toggle; the selected class's cycles come first;
   * and only one panel opens by itself — the one a teacher arrived for from an
   * assignment card, or else the most relevant — so the rest load on demand.
   */
  const [showArchivedCycles, setShowArchivedCycles] = useState(false);
  const orderedCycles = useMemo(() => {
    const active = testCycleAssignments.filter((assignment) => showArchivedCycles || !assignment.archived);
    const rank = (assignment) => (
      assignment.id === focusedTestCycleAssignmentId ? 0
        : classId && (assignment.assignedClassIds || []).includes(classId) ? 1 : 2
    );
    return [...active].sort((left, right) => rank(left) - rank(right)
      || String(right.dueAt || right.dueDate || '').localeCompare(String(left.dueAt || left.dueDate || '')));
  }, [testCycleAssignments, showArchivedCycles, focusedTestCycleAssignmentId, classId]);
  const archivedCount = testCycleAssignments.filter((assignment) => assignment.archived).length;
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [examType, setExamType] = useState(EXAM_TYPES.DIGITAL_SAT);
  const [questionCount, setQuestionCount] = useState(10);
  const [accommodationsConfirmed, setAccommodationsConfirmed] = useState(false);
  // A practice test's results (score, answers, worked solutions) go to the
  // student the moment they submit unless the teacher chooses to hold them.
  const [releaseAutomatically, setReleaseAutomatically] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [monitorKey, setMonitorKey] = useState(0);
  const policy = getExamPolicy(examType);
  // The question count the server will create, and the clock it will set for
  // it — the real test's pace (a mirror of the server rule, parity-tested).
  // An empty box is no count (questionCount null): the server would read it
  // as the full-length test, so nothing is created until a number is typed.
  const timing = describePracticeTestTime(examType, questionCount);
  const canCreate = Boolean(studentId) && timing.questionCount !== null && !creating;
  // Picker options and the confirmation name each student, or say
  // "Name unavailable · ID x" so two nameless students are told apart.
  const pickerStudents = useMemo(() => [...students].sort(compareStudentsByName), [students]);
  const create = async (event) => {
    event.preventDefault();
    if (!canCreate) return;
    setCreating(true); setMessage('');
    try {
      const result = await createSecureExamSession({
        studentId,
        examType,
        accommodationsConfirmed,
        questionCount: timing.questionCount,
        releasePolicy: releaseAutomatically ? 'automatic' : 'teacher',
      });
      const student = students.find((entry) => String(entry.id) === String(studentId));
      setMessage(`Secure session created for ${formatStudentLabel(student || studentId, { lastFirst: false })}: ${result.session.examSessionId}`);
      setMonitorKey((value) => value + 1);
    } catch (error) { setMessage(error.message || 'Could not create the secure exam session.'); }
    finally { setCreating(false); }
  };
  return (
    <div>
      {testCycleAssignments.length > 0 && <section style={{ marginBottom: 28, display: 'grid', gap: 18 }}><div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><h2 style={{ margin: 0 }}>My Course Tests</h2>{archivedCount > 0 && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--mm-text)' }}><input type="checkbox" checked={showArchivedCycles} onChange={(event) => setShowArchivedCycles(event.target.checked)} />Show {archivedCount} archived</label>}</div>{orderedCycles.map((testCycleAssignment, index) => <TestCycleControls key={testCycleAssignment.id} assignment={testCycleAssignment} classId={classId} students={students} onPreview={onPreviewTestCycle} defaultOpen={focusedTestCycleAssignmentId ? testCycleAssignment.id === focusedTestCycleAssignmentId : index === 0} />)}</section>}
      <h2 style={{ marginTop: 0 }}>College &amp; Career Simulations</h2>
      <section style={{ padding: 'clamp(14px, 3vw, 20px)', border: '1px solid var(--mm-border)', borderRadius: 12, background: 'var(--mm-surface-sunken)', marginBottom: 28, textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Create a practice test</h2>
        <p style={{ color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>Answers are checked on the server. Students can skip, flag and change answers until they submit; the timer submits for them when time runs out; leaving the test window is logged, and a third time pauses the test for you to review.</p>
        <form onSubmit={create} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 180px),1fr))', gap: 12, alignItems: 'end' }}>
          <label style={fieldLabel}>Student<select value={studentId} onChange={(event) => setStudentId(event.target.value)} style={fieldControl}><option value="">Choose student…</option>{pickerStudents.map((student) => <option value={student.id} key={student.id}>{formatStudentLabel(student)} · {student.classPeriod || 'Unassigned'}</option>)}</select></label>
          <label style={fieldLabel}>Simulation<select value={examType} onChange={(event) => { setExamType(event.target.value); setQuestionCount(Math.min(10, getExamPolicy(event.target.value).totalQuestions)); }} style={fieldControl}>{Object.values(EXAM_TYPES).map((type) => <option value={type} key={type}>{getExamPolicy(type).title}</option>)}</select></label>
          <label style={fieldLabel}>Question count<input type="number" required min="1" max={policy.totalQuestions} value={questionCount} onChange={(event) => setQuestionCount(event.target.value)} style={fieldControl} /></label>
          <button disabled={!canCreate} type="submit" style={{ minHeight: 44, border: 0, borderRadius: 8, background: canCreate ? 'var(--mm-primary)' : 'var(--mm-surface-control-strong)', color: canCreate ? 'var(--mm-on-primary)' : 'var(--mm-disabled-text)', fontWeight: 900, cursor: canCreate ? 'pointer' : 'not-allowed' }}>{creating ? 'Creating…' : 'Create session'}</button>
        </form>
        <p data-practice-test-time="" style={{ margin: '12px 0 0', color: 'var(--mm-text)', fontSize: 13, lineHeight: 1.5 }}>
          <strong>Time: </strong>{timing.text}
          {timing.seconds !== null && ' Students with extended time in their support plan get it added when they start.'}
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 13, color: 'var(--mm-text)', fontSize: 13 }}>
          <input type="checkbox" checked={releaseAutomatically} onChange={(event) => setReleaseAutomatically(event.target.checked)} />
          <span><strong>Release results automatically when the student submits.</strong> {releaseAutomatically ? 'The student sees their score, answers and worked solutions as soon as they finish.' : 'Results wait until you choose Release feedback in the monitor below.'}</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 13, color: 'var(--mm-text)', fontSize: 13 }}><input type="checkbox" checked={accommodationsConfirmed} onChange={(event) => setAccommodationsConfirmed(event.target.checked)} /><span><strong>Teacher/proctor confirms documented exam accommodations.</strong> This explicit confirmation is required before MathMaster applies a support-plan calculator that would deviate from the base simulation policy.</span></label>
        {message && <p role="status" style={{ color: message.startsWith('Secure session') ? 'var(--mm-success-text)' : 'var(--mm-error-text)', fontWeight: 700 }}>{message}</p>}
      </section>
      <ProctorLiveMonitor key={monitorKey} students={students} />
    </div>
  );
};

export default TeacherSecureExamDashboard;
