import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CLASS_PERIODS,
  assignmentIsForStudent,
  getAssignmentLifecycle,
  getPeriodWindow,
} from './assignmentLifecycle';
import LiveClassMonitor from './components/teacher/LiveClassMonitor';
import NeedsAttentionQueue from './components/teacher/NeedsAttentionQueue';
import StudentSupportDashboard from './components/teacher/StudentSupportDashboard';
import StudentPersistenceRecoveryPanel from './components/teacher/StudentPersistenceRecoveryPanel.jsx';
import ClassLessonControls from './components/teacher/ClassLessonControls.jsx';
import { projectClassLessons } from './platform/teacher/classLessonControls.js';
import { classIdsForTeacher, studentsInClass } from '../functions/shared/classModel.mjs';
import { buildStudentIdentityIndex } from './platform/studentName.js';
import './components/teacher/teacherWorkspace.css';

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
export default function TeacherHome({ allStudents = [], studentIdentityIndex = null, assignments = [], classSchedule, nowValue = Date.now(), presenceById = {}, onSelectPeriod, onOpenStudent, onUnlockDOL = null, dolUnlockBusyKey = null, onGrantDOLAttempt = null, dolAttemptGrantBusyKey = null, onToggleWarmup = null, warmupControlBusyKey = null, onToggleSectionAccess = null, sectionAccessBusyKey = null, needsAttention = [], needsAttentionCompletionCoverage = true, needsAttentionAcademicCoverage = true, onOpenWeeklyPath = null, onOpenAdministration = null, learningProfilesByStudentId = {}, activeClassId = null, classes = [], teacherUid = '', teacherEmail = '', teacherLabel = 'Your teacher', isRootAdmin = false, studentSupportEvents = [], studentSessionSummaries = [], onRecordStudentSupportEvent = null, onRecommendPersonalPath = null, pathInterventionBusyStudentId = null, liveTeachingSession = null, onTeachAssignment = null, onResumeTeaching = null, onEndLiveTeaching = null, onDolControl = null, dolControlBusyKey = null, onOpenAssignment = null, onSelectClass = null, liveFocus = null, gradingPeriodSettings = null, onLiveClassChange = null }) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const [recoveryClassId, setRecoveryClassId] = useState('');
  const [recoveryAssignmentId, setRecoveryAssignmentId] = useState('');

  const classOptions = classes.length
    ? classes.filter((entry) => entry?.status !== 'archived')
    : CLASS_PERIODS.map((period) => ({ classId: null, name: period, period }));

  // Recovery is a grade-writing surface, so its selector mirrors the server's
  // teacher-of-record boundary instead of listing every class the client can read.
  // Root administration retains school-wide recovery access.
  const recoveryAllowedClassIds = isRootAdmin
    ? null
    : new Set(classIdsForTeacher(classOptions, teacherEmail));
  const recoveryClassOptions = classOptions.filter((entry) => (
    Boolean(entry?.classId)
    && (isRootAdmin || recoveryAllowedClassIds.has(entry.classId))
  ));
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
  //
  // "Live view" from an assignment asks for one class by name; that request
  // wins for this visit, even for a class that is not in session (homework
  // monitoring, a class that meets later today).
  const focusRecord = liveFocus?.classId
    ? classOptions.find((entry) => entry.classId === liveFocus.classId) || null
    : null;
  const focusedClass = focusRecord
    ? todaysClasses.find((entry) => entry.classId === focusRecord.classId) || {
      ...focusRecord,
      period: focusRecord.period,
      window: getPeriodWindow(classSchedule, focusRecord.period, nowValue),
      studentCount: studentsInClass({ students: allStudents, classes, classId: focusRecord.classId }).length,
      openCount: 0,
      isNow: false,
    }
    : null;
  const classesInSession = todaysClasses.filter((entry) => entry.isNow);
  const currentClass = focusedClass
    || todaysClasses.find((entry) => entry.isNow && entry.classId === activeClassId)
    || todaysClasses.find((entry) => entry.isNow)
    || null;
  const periodInSession = currentClass?.period || 'all';
  const classIdInSession = currentClass?.classId || null;
  const classContextInSession = currentClass
    ? { classId: classIdInSession, classPeriod: periodInSession }
    : null;
  const liveClassLabel = currentClass?.name || periodInSession;

  // Live Classroom can show a class other than the one the teacher is working
  // in (the class in session, or a "Live view" focus). Its students' own
  // controls ("Extension through …") are read for that class too
  // (platform/teacher/teacherClassControls.js).
  useEffect(() => {
    if (typeof onLiveClassChange === 'function') onLiveClassChange(classIdInSession);
  }, [classIdInSession, onLiveClassChange]);
  useEffect(() => () => {
    if (typeof onLiveClassChange === 'function') onLiveClassChange(null);
  }, [onLiveClassChange]);

  // The live period is a useful default, not an access requirement. Once a
  // teacher chooses a class, keep that choice for this Teacher Home session.
  const currentClassCanUseRecovery = Boolean(
    currentClass?.classId
    && recoveryClassOptions.some((entry) => entry.classId === currentClass.classId),
  );

  useEffect(() => {
    if (currentClassCanUseRecovery) {
      setRecoveryClassId((selected) => selected || currentClass.classId);
    }
  }, [currentClass?.classId, currentClassCanUseRecovery]);

  const recoveryClass = recoveryClassOptions.find((entry) => entry.classId === recoveryClassId) || null;
  const recoveryAssignments = recoveryClass
    ? assignments.filter((assignment) => assignmentIsForStudent(assignment, { classId: recoveryClassId }))
    : [];

  const selectRecoveryClass = (classId) => {
    setRecoveryClassId(classId);
    setRecoveryAssignmentId('');
  };

  // The roster is the source of truth for who is in the class; presence only
  // says what they are doing right now. Joining here means a student with no
  // presence document still appears, as "Not started".
  // Memoized so the identity lookups below (studentIdentityIndexFor caches one
  // index per roster array) are not rebuilt on renders that changed nothing.
  const monitoredStudents = useMemo(() => allStudents.map((student) => ({
    ...student,
    liveStatus: presenceById[student.id] || null,
  })), [allStudents, presenceById]);
  const hasClassInSession = Boolean(currentClass);
  const supportRoster = useMemo(() => (hasClassInSession
    ? studentsInClass({
      students: monitoredStudents,
      classes,
      classId: classIdInSession,
      classPeriod: periodInSession,
    })
    : []), [hasClassInSession, monitoredStudents, classes, classIdInSession, periodInSession]);
  // studentId -> roster row, for screens that name a student from a stored id
  // (Submission recovery). App hands down the one it builds from the compact
  // roster; otherwise one is built here from the roster already in hand.
  const identityIndex = useMemo(() => (
    studentIdentityIndex instanceof Map ? studentIdentityIndex : buildStudentIdentityIndex(allStudents)
  ), [studentIdentityIndex, allStudents]);

  // One projection of today's Warm-Up / Classwork / Practice / DOL for the class
  // in session — the same one the class page and the Assignment Hub render —
  // grouped today first, with earlier lessons folded away but still reachable.
  const classLessons = classContextInSession
    ? projectClassLessons({ assignments, classContext: classContextInSession, schedule: classSchedule, nowValue })
    : null;
  const liveRef = useRef(null);
  useEffect(() => {
    if (liveFocus?.nonce && liveRef.current?.scrollIntoView) liveRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [liveFocus?.nonce]);

  const timeRange = (window) => (window ? `${formatClock(window.start)} – ${formatClock(window.end)}` : 'Not meeting today');
  const attentionQueue = (
    <NeedsAttentionQueue
      queue={needsAttention}
      completionCoverage={needsAttentionCompletionCoverage}
      academicCoverage={needsAttentionAcademicCoverage}
      onOpenStudent={onOpenStudent}
      onOpenWeeklyPath={onOpenWeeklyPath}
      onOpenAdministration={onOpenAdministration}
    />
  );
  // Teaching right now: the class and its live room lead the page.
  const teachingNow = Boolean(currentClass?.isNow);

  return (
    <div style={{ textAlign: 'left' }}>
      <div className="tw-row" style={{ justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{greetingFor(now)}</h2>
        <span className="tw-muted" style={{ fontSize: 14 }}>
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {todaysClasses.length} class{todaysClasses.length === 1 ? '' : 'es'} today
        </span>
      </div>

      {/*
        TODAY'S CLASSES FIRST, AS A STRIP. The class a teacher is standing in
        front of is the first thing on the page, and every other class of the
        day is one click from its own page. (This list used to be the last
        thing on a page several thousand pixels long.)
      */}
      {todaysClasses.length > 0 && (
        <nav aria-label="Today's classes" className="tw-row" style={{ gap: 6, marginBottom: 14 }}>
          {todaysClasses.map(({ classId, name, period, window, studentCount, isNow }) => (
            <button
              type="button"
              key={classId || period}
              className="tw-chip"
              aria-pressed={Boolean(currentClass && (currentClass.classId || currentClass.period) === (classId || period))}
              onClick={() => onSelectPeriod({ classId: classId || null, classPeriod: period })}
              title={`${name || period} · ${studentCount} student${studentCount === 1 ? '' : 's'} · open the class page`}
            >
              {isNow && <span className="tw-pill" data-tone="primary">NOW</span>}
              <span>{name || period}</span>
              <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{formatClock(window.start)}</span>
            </button>
          ))}
        </nav>
      )}

      {/*
        WHAT NEEDS ATTENTION, BEFORE THE COUNTS. A teacher sitting down asks
        "what needs my attention right now?", not "how many students do I
        have?". While a class is IN SESSION the answer is that class — its
        lesson controls and the live room come first, and this queue follows
        them (in the light live roster it holds only non-academic alerts).
      */}
      {!teachingNow && attentionQueue}

      {currentClass ? (
        <section aria-labelledby="home-class-now" className="tw-card" style={{ marginBottom: 16, padding: '14px 16px' }}>
          <div className="tw-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div className="tw-small tw-muted" style={{ fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {currentClass.isNow ? 'In session now' : 'Viewing'}
              </div>
              <h2 id="home-class-now" style={{ margin: 0, fontSize: 20 }}>
                <button type="button" className="tw-link" style={{ fontSize: 20 }} onClick={() => onSelectPeriod({ classId: currentClass.classId || null, classPeriod: currentClass.period })}>{liveClassLabel}</button>
              </h2>
              <div className="tw-small tw-muted">{timeRange(currentClass.window)} · {currentClass.studentCount} student{currentClass.studentCount === 1 ? '' : 's'}</div>
            </div>
            {/*
              Two classes can share a period (a real class and a QA class, or
              a split section). Home used to pick one silently; now the teacher
              sees both and chooses.
            */}
            {(classesInSession.length > 1 || (focusedClass && !focusedClass.isNow && classesInSession.length > 0)) && onSelectClass && (
              <div className="tw-row" role="group" aria-label="Classes in session">
                <span className="tw-small tw-muted">In session:</span>
                {classesInSession.map((entry) => (
                  <button
                    key={entry.classId || entry.period}
                    type="button"
                    className="tw-chip"
                    aria-pressed={(entry.classId || entry.period) === (currentClass.classId || currentClass.period)}
                    onClick={() => onSelectClass({ classId: entry.classId || null, classPeriod: entry.period })}
                  >
                    {entry.name || entry.period}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ClassLessonControls
            lessons={classLessons}
            classContext={classContextInSession}
            classLabel={liveClassLabel}
            schedule={classSchedule}
            nowValue={nowValue}
            onOpenAssignment={onOpenAssignment}
            handlers={{
              onToggleWarmup,
              onToggleSectionAccess,
              onUnlockDOL,
              onGrantDOLAttempt,
              onDolControl,
            }}
            busy={{
              warmup: warmupControlBusyKey,
              section: sectionAccessBusyKey,
              dolUnlock: dolUnlockBusyKey,
              dolGrant: dolAttemptGrantBusyKey,
              dolControl: dolControlBusyKey,
            }}
          />
        </section>
      ) : (
        <div className="tw-card tw-card--muted" style={{ marginBottom: 16 }}>
          <strong>No class is in session right now.</strong>
          <div className="tw-small tw-muted">Choose a class above to open its page, or pick one in the class bar to see its lessons and live room here.</div>
        </div>
      )}

      {/* Live tiles sit directly under today's lesson controls: during a
          period this is the thing the teacher is actually looking at. An
          assignment's "Live view" lands here, scrolled into view and focused. */}
      <div ref={liveRef} id="home-live-class" style={{ scrollMarginTop: 12 }}>
        <LiveClassMonitor
          students={monitoredStudents}
          assignments={assignments.filter((assignment) => getAssignmentLifecycle(assignment, nowValue).isOpen)}
          timerAssignments={assignments}
          classPeriods={CLASS_PERIODS}
          initialClassPeriod={periodInSession}
          nowValue={nowValue}
          onOpenStudent={onOpenStudent}
          learningProfilesByStudentId={learningProfilesByStudentId}
          activeClassId={classIdInSession}
          classes={classes}
          classSchedule={classSchedule}
          supportEvents={studentSupportEvents}
          onRecordSupportEvent={onRecordStudentSupportEvent}
          onRecommendPersonalPath={onRecommendPersonalPath}
          pathInterventionBusyStudentId={pathInterventionBusyStudentId}
          onOpenWeeklyPath={onOpenWeeklyPath}
          teacherUid={teacherUid}
          teacherEmail={teacherEmail}
          teacherLabel={teacherLabel}
          gradingPeriodSettings={gradingPeriodSettings}
          liveTeachingSession={liveTeachingSession}
          onTeachAssignment={onTeachAssignment}
          onResumeTeaching={onResumeTeaching}
          onEndLiveTeaching={onEndLiveTeaching}
          focusAssignmentId={liveFocus?.assignmentId || null}
          focusKey={liveFocus?.nonce || null}
        />
      </div>

      {teachingNow && attentionQueue}

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

      {/* Recovery is permanent teacher work, not a live-period control. The
          selected IDs remain server-authorized by each recovery callable. */}
      <details className="tw-disclosure" style={{ marginBottom: 16 }}>
        <summary>Submission recovery <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>restore a student&apos;s saved work for any active class</span></summary>
        <div className="tw-disclosure__body">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: 'var(--mm-text-muted)' }}>
            Class
            <select
              value={recoveryClassId}
              onChange={(event) => selectRecoveryClass(event.target.value)}
              style={{ minHeight: 40, minWidth: 220, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--mm-border)', fontWeight: 700 }}
            >
              <option value="">Select a class…</option>
              {recoveryClassOptions.map((entry) => (
                <option key={entry.classId} value={entry.classId}>{entry.name || entry.period || entry.classId}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 900, color: 'var(--mm-text-muted)' }}>
            Assignment
            <select
              value={recoveryAssignmentId}
              disabled={!recoveryClassId}
              onChange={(event) => setRecoveryAssignmentId(event.target.value)}
              style={{ minHeight: 40, minWidth: 260, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--mm-border)', fontWeight: 700 }}
            >
              <option value="">Select an assignment…</option>
              {recoveryAssignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>{assignment.title || assignment.id}</option>
              ))}
            </select>
          </label>
        </div>
        {recoveryAssignmentId && (
          <StudentPersistenceRecoveryPanel
            key={`${recoveryClassId}::${recoveryAssignmentId}`}
            assignmentId={recoveryAssignmentId}
            classId={recoveryClassId}
            assignmentTitle={recoveryAssignments.find((assignment) => assignment.id === recoveryAssignmentId)?.title || ''}
            className={recoveryClass?.name || recoveryClass?.period || ''}
            studentIdentityIndex={identityIndex}
          />
        )}
        </div>
      </details>
    </div>
  );
}
