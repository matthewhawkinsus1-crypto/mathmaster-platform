import { useState } from 'react';
import {
  CLASS_PERIODS,
  assignmentIsForStudent,
  formatDateTime,
  getAssignmentLifecycle,
  getPeriodWindow,
} from './assignmentLifecycle';
import { OFFLINE_AFTER_MS } from './livePresence';
import { compareStudentsByName, formatStudentName } from './platform/studentName';
import { studentsInClass } from '../functions/shared/classModel.mjs';
import ClassOverviewPanel from './components/teacher/ClassOverviewPanel.jsx';
import ClassLessonControls from './components/teacher/ClassLessonControls.jsx';
import { projectClassLessons } from './platform/teacher/classLessonControls.js';
import { groupAssignmentList } from './platform/teacher/assignmentListGroups.js';
import './components/teacher/teacherWorkspace.css';

const formatClock = (date) => date instanceof Date ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';

// A dedicated per-class landing view: pick a period, see its roster and
// what's due today without first drilling through the class-period and
// assignment dropdowns on the Grades tab. It deliberately does not
// duplicate that gradebook detail (attempts, activity breakdowns, IEP
// report generation, ...) — "View full gradebook" hands off to the
// existing Grades tab already wired for that.
export default function ClassesWorkspace({ classes = [], allStudents = [], assignments = [], classSchedule, nowValue = Date.now(), presenceById = {}, onViewGradebook, onUnlockDOL = null, dolUnlockBusyKey = null, onGrantDOLAttempt = null, dolAttemptGrantBusyKey = null, onToggleWarmup = null, warmupControlBusyKey = null, onToggleSectionAccess = null, sectionAccessBusyKey = null, onDolControl = null, dolControlBusyKey = null,
  onOpenAssignment = null, onOpenLive = null, onOpenExport = null, initialPeriod = null, initialClassId = null, onSelectClass = null, gradingPeriodSettings = null,
  learningProfilesByStudentId = {}, masteryProfilesByStudentId = {}, evidenceByStudentId = {},
  needsAttentionCount = 0, onOpenStudent = null,
  onLoadDeliveredRigor = null, rigorLoading = false, academicDataLoaded = true }) {
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
                style={{ textAlign: 'left', padding: '18px', borderRadius: '12px', border: '1px solid #dadce0', background: 'var(--mm-surface)', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--mm-text-strong)' }}>{classRecord.name || period}</div><div style={{ marginTop: 2, color: '#5f6368', fontSize: 12 }}>{period}</div>
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
  // Library copies are never "for" a class, so the groups are current,
  // scheduled and closed-by-marking-period.
  const assignmentGroups = groupAssignmentList({ assignments: periodAssignments, nowValue, gradingPeriodSettings });
  // Today's Warm-Up/DOL/section controls come from the one shared projection.
  // "Warm-Ups today" and "DOL today" now count only lessons whose Warm-Up or
  // DOL belongs to TODAY — they used to count every lesson the class ever had.
  const classContext = { classId: selectedClass.classId || null, classPeriod: selectedPeriod };
  const classLessons = projectClassLessons({ assignments: periodAssignments, classContext, schedule: classSchedule, nowValue });
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
  const activeOnAssignmentCount = (assignment) => periodStudents.filter((student) => {
    const presence = presenceById?.[student.id];
    const updatedAt = Number(presence?.updatedAt || 0);
    return Boolean(
      presence?.assignmentId === assignment.id
      && updatedAt
      && nowMs - updatedAt <= OFFLINE_AFTER_MS
    );
  }).length;

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
        <div>
          <button type="button" onClick={() => chooseClass(null)} style={{ border: 'none', background: 'transparent', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer', padding: 0, marginBottom: '6px' }}>&larr; All Classes</button>
          <h2 style={{ margin: 0 }}>{selectedClass.name || selectedPeriod}</h2><div style={{ marginTop: 3, color: '#5f6368', fontSize: 12 }}>{selectedPeriod}</div>
        </div>
        <div className="tw-row">
          {onOpenLive && <button type="button" className="tw-btn" onClick={() => onOpenLive(classContext)}>Live view</button>}
          {onOpenExport && selectedClass.classId && <button type="button" className="tw-btn" onClick={() => onOpenExport(selectedClass.classId)}>Export grades</button>}
          <button
            type="button"
            className="tw-btn tw-btn--primary"
            onClick={() => onViewGradebook(selectedClass.classId || selectedPeriod)}
          >
            View Full Gradebook &rarr;
          </button>
        </div>
      </div>

      {/*
        BEFORE THE TILES. The tiles below are counts — orientation. This is the
        answer, and a teacher who reads only the first sentence of it has still
        learned the most useful thing on the page.
      */}
      {academicDataLoaded ? (
        <ClassOverviewPanel
          className={selectedClass.name || selectedPeriod}
          // classOverview resolves each name itself (first/last, googleName,
          // legacy fields). Overwriting displayName with a formatted label here
          // turned "Name unavailable" into a stored-looking name and rebuilt
          // every student object on each render.
          students={periodStudents}
          profilesByStudentId={learningProfilesByStudentId}
          masteryProfilesByStudentId={masteryProfilesByStudentId}
          evidenceByStudentId={evidenceByStudentId}
          openAssignments={currentAssignments.length}
          needsAttentionCount={needsAttentionCount}
          onOpenStudent={onOpenStudent}
          onLoadDeliveredRigor={onLoadDeliveredRigor ? () => onLoadDeliveredRigor(periodStudents.map((student) => student.id)) : null}
          rigorLoading={rigorLoading}
        />
      ) : (
        <section style={{ border: '1px solid #d8dde6', borderRadius: 11, background: '#f8f9fa', marginBottom: 20, padding: '14px 16px' }}>
          <strong>Live class mode</strong>
          <p style={{ margin: '5px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.5 }}>
            This screen stays lightweight during class and does not keep every student&apos;s historical grade record in memory.
            Live presence and class controls are current. Open the full Gradebook for academic-history analysis.
          </p>
        </section>
      )}

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
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{classLessons.counts.warmupsToday}</div>
        </div>
        <div style={{ padding: '14px', borderRadius: '10px', background: '#f3e8fd', color: '#681da8' }}>
          <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>DOL today</div>
          <div style={{ fontSize: '22px', fontWeight: 900 }}>{classLessons.counts.dolsToday}</div>
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

      <h3 style={{ margin: '0 0 10px' }}>Today&apos;s lessons</h3>
      <div style={{ marginBottom: 22 }}>
        <ClassLessonControls
          lessons={classLessons}
          classContext={classContext}
          classLabel={selectedClass.name || selectedPeriod}
          schedule={classSchedule}
          nowValue={nowValue}
          onOpenAssignment={onOpenAssignment}
          handlers={{ onToggleWarmup, onToggleSectionAccess, onUnlockDOL, onGrantDOLAttempt, onDolControl }}
          busy={{ warmup: warmupControlBusyKey, section: sectionAccessBusyKey, dolUnlock: dolUnlockBusyKey, dolGrant: dolAttemptGrantBusyKey, dolControl: dolControlBusyKey }}
        />
      </div>
      {/*
        THIS CLASS'S ASSIGNMENTS, CURRENT FIRST (the Assignments tab's grouping).
        Open work due soonest first, then scheduled; this marking period's
        closed work and earlier periods are folded — reachable for grades and
        export, never in the way.
      */}
      <h3 style={{ margin: '0 0 10px' }}>Assignments</h3>
      {assignmentGroups.length === 0 ? <p style={{ color: '#80868b', fontSize: '13px', marginBottom: 22 }}>Nothing is assigned to {selectedClass.name || selectedPeriod} yet.</p> : (
        <div className="tw-stack" style={{ gap: 10, marginBottom: 22 }}>
          {assignmentGroups.map((group) => {
            const rows = (
              <div style={{ display: 'grid', gap: '10px' }}>
                {group.assignments.map((assignment) => {
                  const lifecycle = getAssignmentLifecycle(assignment, nowValue);
                  return (
                    <div key={assignment.id} style={{ padding: '12px 14px', borderRadius: '9px', border: '1px solid var(--mm-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div>
                        {onOpenAssignment
                          ? <button type="button" className="tw-link" onClick={() => onOpenAssignment(assignment.id, selectedClass.classId || null)}>{assignment.title}</button>
                          : <strong>{assignment.title}</strong>}
                        <div style={{ fontSize: '12px', color: '#5f6368' }}>
                          {lifecycle.isScheduled
                            ? `Opens ${formatDateTime(assignment.releaseAt)}`
                            : lifecycle.isClosed
                              ? `Closed ${formatDateTime(assignment.lateDueAt || assignment.dueAt || assignment.dueDate)}`
                              : lifecycle.isLate
                                ? `Late window until ${formatDateTime(assignment.lateDueAt)}`
                                : `Due ${formatDateTime(assignment.dueAt || assignment.dueDate)}`}
                        </div>
                      </div>
                      {!lifecycle.isScheduled && (
                        <div style={{ fontSize: '12px', color: '#5f6368' }}>
                          {academicDataLoaded
                            ? `${startedCount(assignment)}/${periodStudents.length} started`
                            : lifecycle.isOpen ? `${activeOnAssignmentCount(assignment)}/${periodStudents.length} active now` : ''}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
            return group.folded ? (
              <details key={group.id} className="tw-disclosure">
                <summary>{group.label} <span className="tw-pill">{group.assignments.length}</span><span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{group.hint}</span></summary>
                <div className="tw-disclosure__body">{rows}</div>
              </details>
            ) : (
              <section key={group.id} aria-label={`${group.label} assignments`}>
                <div className="tw-small tw-strong" style={{ marginBottom: 6 }}>{group.label} <span className="tw-pill">{group.assignments.length}</span></div>
                {rows}
              </section>
            );
          })}
        </div>
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
                <button type="button" onClick={() => onViewGradebook(selectedClass.classId || selectedPeriod, student)} style={{ padding: '7px 12px', border: '1px solid #1a73e8', borderRadius: '7px', background: 'var(--mm-surface)', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>View Grades</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
