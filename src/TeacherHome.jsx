import {
  CLASS_PERIODS,
  assignmentIsForStudent,
  getAssignmentLifecycle,
  getDOLState,
  getWarmupState,
  getSectionAccessState,
  getPeriodWindow,
} from './assignmentLifecycle';
import LiveClassMonitor from './components/teacher/LiveClassMonitor';
import NeedsAttentionQueue from './components/teacher/NeedsAttentionQueue';
import StudentSupportDashboard from './components/teacher/StudentSupportDashboard';
import { studentsInClass } from '../functions/shared/classModel.mjs';

const formatClock = (date) => date instanceof Date ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';

const greetingFor = (date) => {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

// Landing tab for teachers: today's classes at a glance, so a period's
// status and roster are one click away instead of hunting through the
// class-period dropdown on Grades or scrolling the full Classes grid.
export default function TeacherHome({ allStudents = [], assignments = [], classSchedule, nowValue = Date.now(), presenceById = {}, onSelectPeriod, onOpenStudent, onUnlockDOL = null, dolUnlockBusyKey = null, onToggleWarmup = null, warmupControlBusyKey = null, onToggleSectionAccess = null, sectionAccessBusyKey = null, needsAttention = [], needsAttentionCompletionCoverage = true, onOpenWeeklyPath = null, onOpenAdministration = null, learningProfilesByStudentId = {}, activeClassId = null, classes = [], studentSupportEvents = [], studentSessionSummaries = [], onRecordStudentSupportEvent = null }) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);

  const classOptions = classes.length
    ? classes.filter((entry) => entry?.status !== 'archived')
    : CLASS_PERIODS.map((period) => ({ classId: null, name: period, period }));
  const todaysClasses = classOptions
    .map((classRecord) => {
      const period = classRecord.period;
      const window = getPeriodWindow(classSchedule, period, nowValue);
      if (!window) return null;
      const context = { classId: classRecord.classId || null, classPeriod: period };
      const classStudents = studentsInClass({ students: allStudents, classes, ...context });
      const classAssignments = assignments.filter((assignment) => assignmentIsForStudent(assignment, context));
      const openCount = classAssignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen).length;
      const isNow = now >= window.start && now <= window.end;
      return { ...classRecord, period, window, studentCount: classStudents.length, openCount, isNow };
    })
    .filter(Boolean)
    .sort((a, b) => a.window.start.getTime() - b.window.start.getTime()
      || String(a.name || a.period).localeCompare(String(b.name || b.period)));

  // A real class entity is authoritative. When two classes share a period, the
  // selected class stays isolated instead of treating the period label as identity.
  const currentClass = todaysClasses.find((entry) => entry.isNow && entry.classId === activeClassId)
    || todaysClasses.find((entry) => entry.isNow)
    || null;
  const periodInSession = currentClass?.period || 'all';
  const classIdInSession = currentClass?.classId || null;
  const classContextInSession = currentClass
    ? { classId: classIdInSession, classPeriod: periodInSession }
    : null;
  const liveClassLabel = currentClass?.name || periodInSession;

  // The roster is the source of truth for who is in the class; presence only
  // says what they are doing right now. Joining here means a student with no
  // presence document still appears, as "Not started".
  const monitoredStudents = allStudents.map((student) => ({
    ...student,
    liveStatus: presenceById[student.id] || null,
  }));
  const supportRoster = currentClass
    ? studentsInClass({
      students: monitoredStudents,
      classes,
      classId: classIdInSession,
      classPeriod: periodInSession,
    })
    : [];

  const totalOpen = assignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen).length;
  const totalStudents = allStudents.length;
  const liveDOLControls = periodInSession === 'all' ? [] : assignments
    .filter((assignment) => assignmentIsForStudent(assignment, classContextInSession))
    .map((assignment) => ({
      assignment,
      state: getDOLState({ assignment, schedule: classSchedule, classId: classIdInSession, classPeriod: periodInSession, nowValue }),
    }))
    .filter(({ state }) => ['waiting', 'active'].includes(state.status));

  const liveWarmupControls = periodInSession === 'all' ? [] : assignments
    .filter((assignment) => assignmentIsForStudent(assignment, classContextInSession))
    .map((assignment) => ({
      assignment,
      state: getWarmupState({ assignment, schedule: classSchedule, classId: classIdInSession, classPeriod: periodInSession, nowValue }),
    }))
    .filter(({ state }) => ['active', 'closed'].includes(state.status));

  const liveSectionControls = periodInSession === 'all' ? [] : assignments
    .filter((assignment) => assignmentIsForStudent(assignment, classContextInSession) && getAssignmentLifecycle(assignment, nowValue).isOpen)
    .flatMap((assignment) => ['classwork', 'practice'].map((role) => ({
      assignment,
      role,
      state: getSectionAccessState({ assignment, activityRole: role, classId: classIdInSession, classPeriod: periodInSession, nowValue }),
    })))
    .filter(({ state }) => state.enabled && !state.practiceOnly);

  return (
    <div style={{ textAlign: 'left' }}>
      <h2 style={{ marginTop: 0 }}>{greetingFor(now)}</h2>
      <p style={{ color: '#5f6368', marginTop: '-6px' }}>
        {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {/*
        FIRST, BEFORE THE COUNTS. A teacher sitting down asks "what needs my
        attention right now?", not "how many students do I have?". The tiles
        below are orientation; this is the answer, so it comes first.
      */}
      <NeedsAttentionQueue
        queue={needsAttention}
        completionCoverage={needsAttentionCompletionCoverage}
        onOpenStudent={onOpenStudent}
        onOpenWeeklyPath={onOpenWeeklyPath}
        onOpenAdministration={onOpenAdministration}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '26px' }}>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#e8f0fe', color: '#174ea6' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Classes today</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{todaysClasses.length}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#e6f4ea', color: '#137333' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Open assignments</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{totalOpen}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#fef7e0', color: '#7a4f01' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>Students</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{totalStudents}</div>
        </div>
      </div>

      {liveWarmupControls.length > 0 && (
        <section style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, border: '2px solid #f9ab00', background: '#fff8df', color: '#6a4900' }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Warm-Up controls · {liveClassLabel}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {liveWarmupControls.map(({ assignment, state }) => {
              const busyKey = `${assignment.id}:${classIdInSession || periodInSession}`;
              const closed = state.status === 'closed';
              return (
                <div key={assignment.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 11px', borderRadius: 9, background: '#fff' }}>
                  <div>
                    <strong>{assignment.title}</strong>
                    <div style={{ marginTop: 3, fontSize: 12 }}>{closed ? 'Closed for new responses · saved work remains visible' : 'Open now · students can begin immediately'}</div>
                  </div>
                  <button type="button" disabled={warmupControlBusyKey === busyKey} onClick={() => onToggleWarmup?.(assignment, classContextInSession)} style={{ minHeight: 40, padding: '8px 13px', border: 0, borderRadius: 8, background: closed ? '#188038' : '#b06000', color: '#fff', fontWeight: 900, cursor: warmupControlBusyKey === busyKey ? 'wait' : 'pointer' }}>
                    {warmupControlBusyKey === busyKey ? 'Saving…' : closed ? 'Reopen Warm-Up' : 'Close Warm-Up'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {liveSectionControls.length > 0 && (
        <section style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, border: '2px solid #1a73e8', background: '#eef4ff', color: '#174ea6' }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Classwork / Practice access · {liveClassLabel}</div>
          <div style={{ fontSize: 12, marginBottom: 10, color: '#3c4043' }}>Use these controls to pace the room without changing other class periods. Closing a section preserves saved work but blocks new graded submissions.</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {liveSectionControls.map(({ assignment, role, state }) => {
              const busyKey = `${assignment.id}:${classIdInSession || periodInSession}:${role}`;
              const label = role === 'practice' ? 'Practice' : 'Classwork';
              return (
                <div key={`${assignment.id}:${role}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 11px', borderRadius: 9, background: '#fff' }}>
                  <div>
                    <strong>{assignment.title}</strong>
                    <div style={{ marginTop: 3, fontSize: 12 }}><strong>{label}:</strong> {state.isOpen ? 'open for new responses' : state.override?.state === 'closed' ? 'closed by teacher · saved work remains visible' : 'starts locked · waiting for teacher'}</div>
                  </div>
                  <button type="button" disabled={sectionAccessBusyKey === busyKey} onClick={() => onToggleSectionAccess?.(assignment, classContextInSession, role)} style={{ minHeight: 40, padding: '8px 13px', border: 0, borderRadius: 8, background: state.isOpen ? '#b06000' : '#188038', color: '#fff', fontWeight: 900, cursor: sectionAccessBusyKey === busyKey ? 'wait' : 'pointer' }}>
                    {sectionAccessBusyKey === busyKey ? 'Saving…' : state.isOpen ? `Close ${label}` : `Open ${label}`}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {liveDOLControls.length > 0 && (
        <section style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, border: '2px solid #9334e6', background: '#f8f0fc', color: '#4a126b' }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>DOL controls · {liveClassLabel}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {liveDOLControls.map(({ assignment, state }) => {
              const busyKey = `${assignment.id}:${classIdInSession || periodInSession}`;
              return (
                <div key={assignment.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 11px', borderRadius: 9, background: '#fff' }}>
                  <div>
                    <strong>{assignment.title}</strong>
                    <div style={{ marginTop: 3, fontSize: 12 }}>
                      {state.status === 'active'
                        ? `${state.earlyUnlocked ? 'Unlocked early · ' : ''}${Math.max(0, Math.ceil(state.millisecondsRemaining / 60000))} min left`
                        : `Locked · opens in ${Math.max(0, Math.ceil(state.millisecondsRemaining / 60000))} min`}
                    </div>
                  </div>
                  {state.status === 'waiting' ? (
                    <button type="button" disabled={dolUnlockBusyKey === busyKey} onClick={() => onUnlockDOL?.(assignment, classContextInSession)} style={{ minHeight: 40, padding: '8px 13px', border: 0, borderRadius: 8, background: '#681da8', color: '#fff', fontWeight: 900, cursor: dolUnlockBusyKey === busyKey ? 'wait' : 'pointer' }}>
                      {dolUnlockBusyKey === busyKey ? 'Unlocking…' : 'Unlock DOL Early'}
                    </button>
                  ) : (
                    <span style={{ padding: '5px 9px', borderRadius: 999, background: '#e6f4ea', color: '#137333', fontSize: 11, fontWeight: 900 }}>OPEN NOW</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Live tiles sit above the day's schedule: during a period this is the
          thing the teacher is actually looking at. */}
      <LiveClassMonitor
        students={monitoredStudents}
        assignments={assignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen)}
        classPeriods={CLASS_PERIODS}
        initialClassPeriod={periodInSession}
        nowValue={nowValue}
        onOpenStudent={onOpenStudent}
        learningProfilesByStudentId={learningProfilesByStudentId}
        activeClassId={activeClassId}
        classes={classes}
        supportEvents={studentSupportEvents}
        onRecordSupportEvent={onRecordStudentSupportEvent}
      />

      {currentClass && (
        <StudentSupportDashboard
          students={supportRoster}
          profilesByStudentId={learningProfilesByStudentId}
          needsAttention={needsAttention}
          supportEvents={studentSupportEvents}
          sessionSummaries={studentSessionSummaries}
          classId={classIdInSession}
          classPeriod={periodInSession}
          nowValue={nowValue}
          onOpenStudent={onOpenStudent}
          onRecordEvent={onRecordStudentSupportEvent}
        />
      )}

      <h3 style={{ margin: '0 0 10px' }}>Today&apos;s Classes</h3>
      {todaysClasses.length === 0 ? (
        <p style={{ color: '#80868b', fontSize: '13px' }}>No classes are scheduled for today.</p>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {todaysClasses.map(({ classId, name, period, window, studentCount, openCount, isNow }) => (
            <button
              type="button"
              key={classId || period}
              onClick={() => onSelectPeriod({ classId: classId || null, classPeriod: period })}
              style={{
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '14px',
                flexWrap: 'wrap',
                padding: '14px 16px',
                borderRadius: '10px',
                border: isNow ? '2px solid #1a73e8' : '1px solid #dadce0',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <strong style={{ fontSize: '15px', color: '#202124' }}>{name || period}</strong>{name && name !== period ? <span style={{ fontSize: '12px', color: '#80868b' }}>{period}</span> : null}
                {isNow && (
                  <span style={{ fontSize: '11px', fontWeight: 900, padding: '3px 8px', borderRadius: '999px', background: '#1a73e8', color: '#fff' }}>
                    NOW
                  </span>
                )}
                <span style={{ fontSize: '13px', color: '#5f6368' }}>{formatClock(window.start)} &ndash; {formatClock(window.end)}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#5f6368' }}>
                <span>{studentCount} student{studentCount === 1 ? '' : 's'}</span>
                <span>{openCount} open assignment{openCount === 1 ? '' : 's'}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
