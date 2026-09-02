import { useState } from 'react';
import {
  CLASS_PERIODS,
  assignmentIsForStudent,
  formatDateTime,
  formatRemainingTime,
  getAssignmentLifecycle,
  getDOLState,
  getWarmupState,
  getSectionAccessState,
  getPeriodWindow,
} from './assignmentLifecycle';
import { OFFLINE_AFTER_MS } from './livePresence';
import { compareStudentsByName, formatStudentName } from './platform/studentName';
import { studentsInClass } from '../functions/shared/classModel.mjs';
import ClassOverviewPanel from './components/teacher/ClassOverviewPanel.jsx';
import DOLCountdown from './components/student/DOLCountdown.jsx';

const formatClock = (date) => date instanceof Date ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';

// A dedicated per-class landing view: pick a period, see its roster and
// what's due today without first drilling through the class-period and
// assignment dropdowns on the Grades tab. It deliberately does not
// duplicate that gradebook detail (attempts, activity breakdowns, IEP
// report generation, ...) — "View full gradebook" hands off to the
// existing Grades tab already wired for that.
export default function ClassesWorkspace({ classes = [], allStudents = [], assignments = [], classSchedule, nowValue = Date.now(), presenceById = {}, onViewGradebook, onUnlockDOL = null, dolUnlockBusyKey = null, onToggleWarmup = null, warmupControlBusyKey = null, onToggleSectionAccess = null, sectionAccessBusyKey = null, initialPeriod = null, initialClassId = null, onSelectClass = null,
  learningProfilesByStudentId = {}, masteryProfilesByStudentId = {}, evidenceByStudentId = {},
  needsAttentionCount = 0, onOpenStudent = null,
  onLoadDeliveredRigor = null, rigorLoading = false }) {
  const classOptions = classes.length
    ? classes.filter((entry) => entry?.status !== 'archived').map((entry) => ({ ...entry, key: entry.classId }))
    : CLASS_PERIODS.map((period) => ({ key: period, classId: '', name: period, period }));
  const initialKey = initialClassId
    || classOptions.find((entry) => entry.period === initialPeriod)?.key
    || null;
  const [selectedClassKey, setSelectedClassKey] = useState(() => initialKey);
  const selectedClass = classOptions.find((entry) => entry.key === selectedClassKey) || null;
  // The choice is lifted, not just held here. This component unmounts whenever
  // the teacher visits another tab, so a class kept only in local state is a
  // class the teacher has to pick again every single time they come back — the
  // reason class context did not persist anywhere in the teacher experience.
  const chooseClass = (key) => {
    setSelectedClassKey(key);
    const record = classOptions.find((entry) => entry.key === key) || null;
    onSelectClass?.(record ? { classId: record.classId || null, classPeriod: record.period || null } : { classId: null, classPeriod: null });
  };
  const selectedPeriod = selectedClass?.period || null;
  const [warmupTimerMinutesByKey, setWarmupTimerMinutesByKey] = useState({});

  if (!selectedClass) {
    return (
      <div style={{ textAlign: 'left' }}>
        <h2 style={{ marginTop: 0 }}>Classes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '14px' }}>
          {classOptions.map((classRecord) => {
            const period = classRecord.period;
            const periodStudents = studentsInClass({ students: allStudents, classes, classId: classRecord.classId || null, classPeriod: period });
            const periodAssignments = assignments.filter((assignment) => assignmentIsForStudent(assignment, { classId: classRecord.classId || null, classPeriod: period }));
            const openCount = periodAssignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen).length;
            return (
              <button
                type="button"
                key={classRecord.key}
                onClick={() => chooseClass(classRecord.key)}
                style={{ textAlign: 'left', padding: '18px', borderRadius: '12px', border: '1px solid #dadce0', background: '#fff', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 900, fontSize: '16px', color: '#202124' }}>{classRecord.name || period}</div><div style={{ marginTop: 2, color: '#5f6368', fontSize: 12 }}>{period}</div>
                <div style={{ marginTop: '8px', color: '#5f6368', fontSize: '13px' }}>{periodStudents.length} student{periodStudents.length === 1 ? '' : 's'}</div>
                <div style={{ marginTop: '3px', color: '#5f6368', fontSize: '13px' }}>{openCount} active assignment{openCount === 1 ? '' : 's'}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // One shared membership rule. This file used to carry its own copy, which
  // matched a student on period even when they HAD a classId — putting a
  // recently-moved student on two rosters at once.
  const periodStudents = studentsInClass({
    students: allStudents, classes, classId: selectedClass.classId || null, classPeriod: selectedPeriod,
  }).slice().sort(compareStudentsByName);
  const periodAssignments = assignments.filter((assignment) => assignmentIsForStudent(assignment, { classId: selectedClass.classId || null, classPeriod: selectedPeriod }));
  const currentAssignments = periodAssignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen);
  const upcomingAssignments = periodAssignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isScheduled);
  const dolToday = periodAssignments
    .map((assignment) => ({ assignment, dol: getDOLState({ assignment, schedule: classSchedule, classId: selectedClass.classId || null, classPeriod: selectedPeriod, nowValue }) }))
    .filter(({ dol }) => dol.window !== null);
  const warmupsToday = periodAssignments
    .map((assignment) => ({ assignment, warmup: getWarmupState({ assignment, schedule: classSchedule, classId: selectedClass.classId || null, classPeriod: selectedPeriod, nowValue }) }))
    .filter(({ warmup }) => warmup.window !== null);
  const sectionAccessControls = currentAssignments
    .flatMap((assignment) => ['classwork', 'practice'].map((role) => ({
      assignment,
      role,
      state: getSectionAccessState({ assignment, activityRole: role, classId: selectedClass.classId || null, classPeriod: selectedPeriod, nowValue }),
    })))
    .filter(({ state }) => state.enabled && !state.practiceOnly);
  const inclusionCount = periodStudents.filter((student) => student.profile?.inclusionStatus).length;
  const scheduleWindow = getPeriodWindow(classSchedule, selectedPeriod, nowValue);
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  const studentIsActive = (student) => {
    const presence = presenceById?.[student.id];
    const updatedAt = Number(presence?.updatedAt || 0);
    return Boolean(presence?.assignmentId && updatedAt && nowMs - updatedAt <= OFFLINE_AFTER_MS);
  };
  const activeStudentCount = periodStudents.filter(studentIsActive).length;

  const startedCount = (assignment) => periodStudents.filter((student) => student.gradesByAssignment?.[assignment.id] !== undefined).length;

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
        <div>
          <button type="button" onClick={() => chooseClass(null)} style={{ border: 'none', background: 'transparent', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer', padding: 0, marginBottom: '6px' }}>&larr; All Classes</button>
          <h2 style={{ margin: 0 }}>{selectedClass.name || selectedPeriod}</h2><div style={{ marginTop: 3, color: '#5f6368', fontSize: 12 }}>{selectedPeriod}</div>
        </div>
        <button
          type="button"
          onClick={() => onViewGradebook(selectedClass.classId || selectedPeriod)}
          style={{ padding: '10px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          View Full Gradebook &rarr;
        </button>
      </div>

      {/*
        BEFORE THE TILES. The tiles below are counts — orientation. This is the
        answer, and a teacher who reads only the first sentence of it has still
        learned the most useful thing on the page.
      */}
      <ClassOverviewPanel
        className={selectedClass.name || selectedPeriod}
        students={periodStudents.map((student) => ({ ...student, displayName: formatStudentName(student) }))}
        profilesByStudentId={learningProfilesByStudentId}
        masteryProfilesByStudentId={masteryProfilesByStudentId}
        evidenceByStudentId={evidenceByStudentId}
        openAssignments={currentAssignments.length}
        needsAttentionCount={needsAttentionCount}
        onOpenStudent={onOpenStudent}
        onLoadDeliveredRigor={onLoadDeliveredRigor ? () => onLoadDeliveredRigor(periodStudents.map((student) => student.id)) : null}
        rigorLoading={rigorLoading}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '22px' }}>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#e8f0fe', color: '#174ea6' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Students</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{periodStudents.length}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#e6f4ea', color: '#137333' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Students active now</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{activeStudentCount}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#fff4ce', color: '#7a4f00' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Warm-Ups today</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{warmupsToday.length}</div>
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

      {warmupsToday.length > 0 && (
        <>
          <h3 style={{ margin: '0 0 10px' }}>Warm-Up Today</h3>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '22px' }}>
            {warmupsToday.map(({ assignment, warmup }) => {
              const busyKey = `${assignment.id}:${selectedClass.classId || selectedPeriod}`;
              const needsOpenToday = ['notToday', 'unscheduled'].includes(warmup.status);
              const canToggle = ['active', 'closed', 'notToday', 'unscheduled'].includes(warmup.status);
              const timerMinutes = Number(warmupTimerMinutesByKey[busyKey] || 5);
              const classContext = { classId: selectedClass.classId || null, classPeriod: selectedPeriod };
              return (
                <div key={assignment.id} style={{ padding: '12px 14px', borderRadius: '9px', border: '1px solid #e0e3e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{assignment.title}</strong>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#5f6368' }}>
                      {warmup.status === 'active'
                        ? 'Open now · closes automatically when the timer reaches zero'
                        : warmup.status === 'closed'
                          ? 'Closed by teacher or timer · review only'
                          : warmup.status === 'notToday'
                            ? `Scheduled for ${warmup.instructionDateKey || 'another date'} · teacher can open it for this class today`
                            : warmup.status === 'unscheduled'
                              ? 'No instructional date saved · teacher can open it for this class today'
                              : warmup.status === 'waiting'
                                ? `Locked · opens ${warmup.minutesBeforeStart} minutes before class`
                                : 'Class window ended'}
                      {warmup.status === 'active' && (
                        <div style={{ marginTop: 5, fontSize: 18, fontWeight: 1000, color: '#8a4b00' }}>
                          <DOLCountdown endsAt={warmup.endsAt} /> remaining
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: warmup.status === 'active' ? '#e6f4ea' : '#f1f3f4', color: warmup.status === 'active' ? '#137333' : '#5f6368' }}>
                      {warmup.status === 'active' ? 'OPEN' : warmup.status === 'closed' ? 'CLOSED' : needsOpenToday ? 'NOT OPEN TODAY' : 'LOCKED'}
                    </span>
                    {canToggle && (
                      <>
                        <button
                          type="button"
                          disabled={warmupControlBusyKey === busyKey}
                          onClick={() => onToggleWarmup?.(
                            assignment,
                            classContext,
                            needsOpenToday || warmup.status === 'closed' ? { action: 'reopen' } : { action: 'close' },
                          )}
                          style={{ padding: '8px 12px', border: 0, borderRadius: 7, background: needsOpenToday || warmup.status === 'closed' ? '#188038' : '#b06000', color: '#fff', fontWeight: 900, cursor: warmupControlBusyKey === busyKey ? 'wait' : 'pointer' }}
                        >
                          {warmupControlBusyKey === busyKey
                            ? 'Saving…'
                            : needsOpenToday
                              ? 'Open Warm-Up Today'
                              : warmup.status === 'closed'
                                ? 'Reopen Warm-Up'
                                : 'Close Warm-Up'}
                        </button>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800 }}>
                          Timer
                          <select
                            value={timerMinutes}
                            disabled={warmupControlBusyKey === busyKey}
                            onChange={(event) => setWarmupTimerMinutesByKey((current) => ({ ...current, [busyKey]: Number(event.target.value) }))}
                            style={{ minHeight: 36, borderRadius: 7, border: '1px solid #dadce0', background: '#fff', padding: '0 7px', fontWeight: 800 }}
                          >
                            {[3, 5, 7, 10, 15, 20].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={warmupControlBusyKey === busyKey}
                          onClick={() => onToggleWarmup?.(assignment, classContext, { action: 'timer', autoCloseMinutes: timerMinutes })}
                          style={{ padding: '8px 12px', border: '1px solid #188038', borderRadius: 7, background: '#fff', color: '#137333', fontWeight: 900, cursor: warmupControlBusyKey === busyKey ? 'wait' : 'pointer' }}
                        >
                          {needsOpenToday
                            ? `Open for ${timerMinutes} min`
                            : warmup.status === 'closed'
                              ? `Reopen for ${timerMinutes} min`
                              : warmup.teacherTimerScheduled
                                ? `Reset to ${timerMinutes} min`
                                : `Close in ${timerMinutes} min`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {sectionAccessControls.length > 0 && (
        <>
          <h3 style={{ margin: '0 0 10px' }}>Classwork &amp; Practice Access</h3>
          <div style={{ padding: '10px 12px', borderRadius: 9, background: '#eef4ff', color: '#3c4043', fontSize: 12, marginBottom: 10 }}>Open or close either section for {selectedClass.name || selectedPeriod} only. Closing a section preserves saved work and prevents new graded submissions until you reopen it.</div>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '22px' }}>
            {sectionAccessControls.map(({ assignment, role, state }) => {
              const busyKey = `${assignment.id}:${selectedClass.classId || selectedPeriod}:${role}`;
              const label = role === 'practice' ? 'Practice' : 'Classwork';
              return (
                <div key={`${assignment.id}:${role}`} style={{ padding: '12px 14px', borderRadius: '9px', border: '1px solid #c5d5ef', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{assignment.title}</strong>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#5f6368' }}><strong>{label}:</strong> {state.isOpen ? 'open for new responses' : state.override?.state === 'closed' ? 'closed by teacher · review only' : 'starts locked · waiting for teacher'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 900, padding: '4px 8px', borderRadius: 999, background: state.isOpen ? '#e6f4ea' : '#f1f3f4', color: state.isOpen ? '#137333' : '#5f6368' }}>{state.isOpen ? 'OPEN' : 'CLOSED'}</span>
                    <button type="button" disabled={sectionAccessBusyKey === busyKey} onClick={() => onToggleSectionAccess?.(assignment, { classId: selectedClass.classId || null, classPeriod: selectedPeriod }, role)} style={{ padding: '8px 12px', border: 0, borderRadius: 7, background: state.isOpen ? '#b06000' : '#188038', color: '#fff', fontWeight: 900, cursor: sectionAccessBusyKey === busyKey ? 'wait' : 'pointer' }}>
                      {sectionAccessBusyKey === busyKey ? 'Saving…' : state.isOpen ? `Close ${label}` : `Open ${label}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {dolToday.length > 0 && (
        <>
          <h3 style={{ margin: '0 0 10px' }}>DOL Today</h3>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '22px' }}>
            {dolToday.map(({ assignment, dol }) => {
              const busyKey = `${assignment.id}:${selectedClass.classId || selectedPeriod}`;
              return (
                <div key={assignment.id} style={{ padding: '12px 14px', borderRadius: '9px', border: '1px solid #e0e3e7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <strong>{assignment.title}</strong>
                    <div style={{ marginTop: 4, fontSize: 12, color: '#5f6368' }}>
                      {dol.status === 'active'
                        ? `${dol.earlyUnlocked ? 'Unlocked early · ' : ''}${formatRemainingTime(dol.millisecondsRemaining)} left`
                        : dol.status === 'waiting'
                          ? `Locked · opens in ${formatRemainingTime(dol.millisecondsRemaining)}`
                          : dol.status === 'beforeClass' ? 'Locked until class begins / normal DOL window' : 'Ended'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: dol.status === 'active' ? '#e6f4ea' : '#f1f3f4', color: dol.status === 'active' ? '#137333' : '#5f6368' }}>
                      {dol.status === 'active' ? 'OPEN NOW' : dol.status === 'ended' ? 'ENDED' : 'LOCKED'}
                    </span>
                    {['waiting', 'beforeClass'].includes(dol.status) && (
                      <button type="button" disabled={dolUnlockBusyKey === busyKey} onClick={() => onUnlockDOL?.(assignment, { classId: selectedClass.classId || null, classPeriod: selectedPeriod })} style={{ padding: '8px 12px', border: 0, borderRadius: 7, background: '#681da8', color: '#fff', fontWeight: 900, cursor: dolUnlockBusyKey === busyKey ? 'wait' : 'pointer' }}>
                        {dolUnlockBusyKey === busyKey ? 'Unlocking…' : 'Unlock DOL Early'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h3 style={{ margin: '0 0 10px' }}>Roster</h3>
      {periodStudents.length === 0 ? <p style={{ color: '#80868b', fontSize: '13px' }}>No students are assigned to {selectedPeriod} yet.</p> : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {periodStudents.map((student) => {
            const presence = presenceById?.[student.id];
            const active = studentIsActive(student);
            return (
              <div key={student.id} style={{ padding: '10px 14px', borderRadius: '8px', border: `1px solid ${active ? '#81c995' : '#e8eaed'}`, background: active ? '#f6fff8' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 'bold' }}>{formatStudentName(student)}</span><span style={{ color: '#5f6368', fontSize: 12 }}>ID {student.id}</span>
                    <span style={{ fontSize: '11px', fontWeight: 900, padding: '3px 7px', borderRadius: '999px', background: active ? '#e6f4ea' : '#f1f3f4', color: active ? '#137333' : '#5f6368' }}>{active ? 'ACTIVE' : 'NOT ACTIVE'}</span>
                    {student.profile?.inclusionStatus && <span style={{ fontSize: '11px', fontWeight: 900, padding: '3px 7px', borderRadius: '999px', background: '#efe4ff', color: '#6f2da8' }}>INCLUSION</span>}
                  </div>
                  {active && <div style={{ marginTop: 4, fontSize: 12, color: '#5f6368' }}>{presence.assignmentTitle || 'Assignment'} · {String(presence.activityRole || 'activity').toUpperCase()} · Q{Number(presence.sectionQuestionIndex ?? presence.questionIndex ?? 0) + 1}</div>}
                </div>
                <button type="button" onClick={() => onViewGradebook(selectedClass.classId || selectedPeriod, student)} style={{ padding: '7px 12px', border: '1px solid #1a73e8', borderRadius: '7px', background: '#fff', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>View Grades</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
