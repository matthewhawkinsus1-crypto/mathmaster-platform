import {
  CLASS_PERIODS,
  assignmentIsForStudent,
  getAssignmentLifecycle,
  getPeriodWindow,
} from './assignmentLifecycle';
import LiveClassMonitor from './components/teacher/LiveClassMonitor';

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
export default function TeacherHome({ allStudents = [], assignments = [], classSchedule, nowValue = Date.now(), presenceById = {}, onSelectPeriod, onOpenStudent }) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);

  const todaysClasses = CLASS_PERIODS
    .map((period) => {
      const window = getPeriodWindow(classSchedule, period, nowValue);
      if (!window) return null;
      const periodStudents = allStudents.filter((student) => student.classPeriod === period);
      const periodAssignments = assignments.filter((assignment) => assignmentIsForStudent(assignment, period));
      const openCount = periodAssignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen).length;
      const isNow = now >= window.start && now <= window.end;
      return { period, window, studentCount: periodStudents.length, openCount, isNow };
    })
    .filter(Boolean)
    .sort((a, b) => a.window.start.getTime() - b.window.start.getTime());

  // The period happening right now, so the live grid opens on the class in
  // front of the teacher instead of on every student in the building.
  const periodInSession = todaysClasses.find((entry) => entry.isNow)?.period || 'all';

  // The roster is the source of truth for who is in the class; presence only
  // says what they are doing right now. Joining here means a student with no
  // presence document still appears, as "Not started".
  const monitoredStudents = allStudents.map((student) => ({
    ...student,
    liveStatus: presenceById[student.id] || null,
  }));

  const totalOpen = assignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen).length;
  const totalStudents = allStudents.length;

  return (
    <div style={{ textAlign: 'left' }}>
      <h2 style={{ marginTop: 0 }}>{greetingFor(now)}</h2>
      <p style={{ color: '#5f6368', marginTop: '-6px' }}>
        {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

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

      {/* Live tiles sit above the day's schedule: during a period this is the
          thing the teacher is actually looking at. */}
      <LiveClassMonitor
        students={monitoredStudents}
        assignments={assignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen)}
        classPeriods={CLASS_PERIODS}
        initialClassPeriod={periodInSession}
        nowValue={nowValue}
        onOpenStudent={onOpenStudent}
      />

      <h3 style={{ margin: '0 0 10px' }}>Today&apos;s Classes</h3>
      {todaysClasses.length === 0 ? (
        <p style={{ color: '#80868b', fontSize: '13px' }}>No classes are scheduled for today.</p>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {todaysClasses.map(({ period, window, studentCount, openCount, isNow }) => (
            <button
              type="button"
              key={period}
              onClick={() => onSelectPeriod(period)}
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
                <strong style={{ fontSize: '15px', color: '#202124' }}>{period}</strong>
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
