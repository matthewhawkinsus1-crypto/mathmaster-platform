import { useState } from 'react';
import {
  CLASS_PERIODS,
  assignmentIsForStudent,
  formatDateTime,
  formatRemainingTime,
  getAssignmentLifecycle,
  getDOLState,
  getPeriodWindow,
} from './assignmentLifecycle';

const formatClock = (date) => date instanceof Date ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';

// A dedicated per-class landing view: pick a period, see its roster and
// what's due today without first drilling through the class-period and
// assignment dropdowns on the Grades tab. It deliberately does not
// duplicate that gradebook detail (attempts, activity breakdowns, IEP
// report generation, ...) — "View full gradebook" hands off to the
// existing Grades tab already wired for that.
export default function ClassesWorkspace({ allStudents = [], assignments = [], classSchedule, nowValue = Date.now(), onViewGradebook }) {
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  if (!selectedPeriod) {
    return (
      <div style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Classes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '14px' }}>
          {CLASS_PERIODS.map((period) => {
            const periodStudents = allStudents.filter((student) => student.classPeriod === period);
            const periodAssignments = assignments.filter((assignment) => assignmentIsForStudent(assignment, period));
            const openCount = periodAssignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen).length;
            return (
              <button
                type="button"
                key={period}
                onClick={() => setSelectedPeriod(period)}
                style={{ textAlign: 'left', padding: '18px', borderRadius: '12px', border: '1px solid #dadce0', background: '#fff', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 900, fontSize: '16px', color: '#202124' }}>{period}</div>
                <div style={{ marginTop: '8px', color: '#5f6368', fontSize: '13px' }}>{periodStudents.length} student{periodStudents.length === 1 ? '' : 's'}</div>
                <div style={{ marginTop: '3px', color: '#5f6368', fontSize: '13px' }}>{openCount} active assignment{openCount === 1 ? '' : 's'}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const periodStudents = allStudents.filter((student) => student.classPeriod === selectedPeriod);
  const periodAssignments = assignments.filter((assignment) => assignmentIsForStudent(assignment, selectedPeriod));
  const currentAssignments = periodAssignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen);
  const upcomingAssignments = periodAssignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isScheduled);
  const dolToday = periodAssignments
    .map((assignment) => ({ assignment, dol: getDOLState({ assignment, schedule: classSchedule, classPeriod: selectedPeriod, nowValue }) }))
    .filter(({ dol }) => dol.window !== null);
  const inclusionCount = periodStudents.filter((student) => student.profile?.inclusionStatus).length;
  const scheduleWindow = getPeriodWindow(classSchedule, selectedPeriod, nowValue);

  const startedCount = (assignment) => periodStudents.filter((student) => student.gradesByAssignment?.[assignment.id] !== undefined).length;

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
        <div>
          <button type="button" onClick={() => setSelectedPeriod(null)} style={{ border: 'none', background: 'transparent', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer', padding: 0, marginBottom: '6px' }}>&larr; All Classes</button>
          <h2 style={{ margin: 0 }}>{selectedPeriod}</h2>
        </div>
        <button
          type="button"
          onClick={() => onViewGradebook(selectedPeriod)}
          style={{ padding: '10px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          View Full Gradebook &rarr;
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '22px' }}>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#e8f0fe', color: '#174ea6' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Students</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{periodStudents.length}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#e6f4ea', color: '#137333' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Active now</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{currentAssignments.length}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#f3e8fd', color: '#681da8' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>DOL today</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{dolToday.length}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#fef7e0', color: '#7a4f01' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Inclusion supports</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{inclusionCount}</div>
        </div>
      </div>

      <div style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid #e0e3e7', marginBottom: '22px', color: '#3c4043', fontSize: '13px' }}>
        <strong>Today&apos;s schedule: </strong>
        {scheduleWindow ? `${formatClock(scheduleWindow.start)} – ${formatClock(scheduleWindow.end)}${scheduleWindow.modified ? ' (modified today)' : ''}` : 'No schedule set for today.'}
      </div>

      <h3 style={{ margin: '0 0 10px' }}>Current Assignments</h3>
      {currentAssignments.length === 0 ? <p style={{ color: '#80868b', fontSize: '13px' }}>Nothing currently open for {selectedPeriod}.</p> : (
        <div style={{ display: 'grid', gap: '10px', marginBottom: '22px' }}>
          {currentAssignments.map((assignment) => (
            <div key={assignment.id} style={{ padding: '12px 14px', borderRadius: '9px', border: '1px solid #e0e3e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div>
                <strong>{assignment.title}</strong>
                <div style={{ fontSize: '12px', color: '#5f6368' }}>Due {formatDateTime(assignment.dueAt || assignment.dueDate)}</div>
              </div>
              <div style={{ fontSize: '12px', color: '#5f6368' }}>{startedCount(assignment)}/{periodStudents.length} started</div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ margin: '0 0 10px' }}>Upcoming Assignments</h3>
      {upcomingAssignments.length === 0 ? <p style={{ color: '#80868b', fontSize: '13px' }}>Nothing scheduled yet for {selectedPeriod}.</p> : (
        <div style={{ display: 'grid', gap: '10px', marginBottom: '22px' }}>
          {upcomingAssignments.map((assignment) => (
            <div key={assignment.id} style={{ padding: '12px 14px', borderRadius: '9px', border: '1px solid #e0e3e7' }}>
              <strong>{assignment.title}</strong>
              <div style={{ fontSize: '12px', color: '#5f6368' }}>Opens {formatDateTime(assignment.releaseAt)}</div>
            </div>
          ))}
        </div>
      )}

      {dolToday.length > 0 && (
        <>
          <h3 style={{ margin: '0 0 10px' }}>DOL Today</h3>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '22px' }}>
            {dolToday.map(({ assignment, dol }) => (
              <div key={assignment.id} style={{ padding: '12px 14px', borderRadius: '9px', border: '1px solid #e0e3e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <strong>{assignment.title}</strong>
                <span style={{ fontSize: '12px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: dol.status === 'active' ? '#e6f4ea' : '#f1f3f4', color: dol.status === 'active' ? '#137333' : '#5f6368' }}>
                  {dol.status === 'active' ? `Active – ${formatRemainingTime(dol.millisecondsRemaining)} left` : dol.status === 'waiting' ? `Opens in ${formatRemainingTime(dol.millisecondsRemaining)}` : dol.status === 'beforeClass' ? 'Before class' : 'Ended'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 style={{ margin: '0 0 10px' }}>Roster</h3>
      {periodStudents.length === 0 ? <p style={{ color: '#80868b', fontSize: '13px' }}>No students are assigned to {selectedPeriod} yet.</p> : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {periodStudents.map((student) => (
            <div key={student.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e8eaed', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 'bold' }}>{student.id}</span>
                {student.profile?.inclusionStatus && <span style={{ fontSize: '11px', fontWeight: 900, padding: '3px 7px', borderRadius: '999px', background: '#efe4ff', color: '#6f2da8' }}>INCLUSION</span>}
              </div>
              <button type="button" onClick={() => onViewGradebook(selectedPeriod, student)} style={{ padding: '7px 12px', border: '1px solid #1a73e8', borderRadius: '7px', background: '#fff', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>View Grades</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
