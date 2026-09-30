import { useEffect, useMemo, useRef, useState } from 'react';
import { assignmentIsForStudent, formatDateTime, getAssignmentLifecycle } from '../../assignmentLifecycle.js';
import { studentsInClass } from '../../../functions/shared/classModel.mjs';
import { formatStudentName } from '../../platform/studentName.js';
import { projectCurrentAssignmentContent } from '../../platform/assignments/currentContentProjection.js';
import { resolveAssignmentGradingPeriod } from '../../platform/student/gradingPeriods.js';
import { describeClassLesson } from '../../platform/teacher/classLessonControls.js';
import { classGradeProgress, classLiveProgress, PASSING_DISPLAY_THRESHOLD } from '../../platform/teacher/assignmentProgress.js';
import { AssignmentLessonRows } from './ClassLessonControls.jsx';
import './teacherWorkspace.css';

/*
 * ONE ASSIGNMENT, FROM ANYWHERE.
 *
 * An assignment appears on Home, a class page, the Assignment list, the
 * Library, the Gradebook, Live Class, Grade Export, the Action Center and the
 * Find palette. Before this drawer each of those showed a different slice and
 * the rest of the assignment lived somewhere else: the ⋮ menu on an assignment
 * card had no route to its grades, its live room, its DOL or its export.
 *
 * The hub is the assignment's world, opened over whatever the teacher was
 * doing (like the student profile drawer), in progressive layers:
 *
 *   1. what it is — status, dates, sections, marking period, classes;
 *   2. where to go — Grades, Live view, Export, student preview, setup;
 *   3. right now in this class — the same Warm-Up/Classwork/Practice/DOL
 *      controls Home uses, for just this assignment;
 *   4. students — live now, and (where grades are loaded) progress and scores,
 *      each name one click from the student and their work.
 *
 * It computes nothing new: controls come from classLessonControls.js, progress
 * from assignmentProgress.js, and every change goes through the same App.jsx
 * handlers (which confirm first).
 */

const SECTION_ORDER = [['warmup', 'Warm-Up'], ['classwork', 'Classwork'], ['practice', 'Practice'], ['dol', 'DOL'], ['quiz', 'Quiz'], ['test', 'Test']];

const statusPill = (lifecycle, assigned) => {
  if (!assigned) return { label: 'Not assigned', tone: 'neutral' };
  if (lifecycle.isScheduled) return { label: 'Scheduled', tone: 'primary' };
  if (lifecycle.isLate) return { label: 'Late window', tone: 'warning' };
  if (lifecycle.isClosed) return { label: 'Closed · practice only', tone: 'neutral' };
  return { label: 'Open', tone: 'success' };
};

function NameList({ rows, onOpenStudent, onOpenStudentWork, detail }) {
  if (!rows.length) return <div className="tw-small tw-muted">Nobody.</div>;
  return (
    <ul className="tw-small" style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
      {rows.map((row) => (
        <li key={row.id} className="tw-row" style={{ gap: 6 }}>
          {onOpenStudent ? <button type="button" className="tw-link" onClick={() => onOpenStudent(row.id)}>{row.name}</button> : <span>{row.name}</span>}
          {detail && <span className="tw-muted">{detail(row)}</span>}
          {onOpenStudentWork && <button type="button" className="tw-btn tw-btn--sm tw-btn--quiet" onClick={() => onOpenStudentWork(row.id)}>Work</button>}
        </li>
      ))}
    </ul>
  );
}

function StatGroup({ items, openKey, setOpenKey, label }) {
  return (
    <div className="tw-stats" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="tw-stat"
          data-tone={item.tone}
          aria-pressed={openKey === item.key}
          aria-expanded={openKey === item.key}
          onClick={() => setOpenKey(openKey === item.key ? null : item.key)}
        >
          <div className="tw-stat__value">{item.value}</div>
          <div className="tw-stat__label">{item.label}</div>
        </button>
      ))}
    </div>
  );
}

export default function AssignmentHub({
  open = false,
  assignment = null,
  initialClassId = null,
  classes = [],
  students = [],
  presenceById = {},
  classSchedule,
  nowValue = Date.now(),
  gradingPeriodSettings = null,
  hasGradeRecords = false,
  // (classId) => Promise<student grade records>. Lets the hub show progress on
  // the lightweight live screens without sending the teacher to Grades.
  onLoadClassGrades = null,
  handlers = {},
  busy = {},
  onClose,
  onOpenGrades = null,
  onOpenStudentWork = null,
  onOpenLive = null,
  onOpenExport = null,
  onOpenStudent = null,
  onPreview = null,
  onPrint = null,
  onEditDates = null,
  onEditSetup = null,
  onEditQuestions = null,
  onOpenClass = null,
}) {
  const closeRef = useRef(null);
  const assignedClasses = useMemo(() => (classes || [])
    .filter((entry) => entry?.status !== 'archived' && entry?.classId)
    .filter((entry) => assignmentIsForStudent(assignment, { classId: entry.classId })), [classes, assignment]);
  const [classId, setClassId] = useState(null);
  const [liveKey, setLiveKey] = useState(null);
  const [gradeKey, setGradeKey] = useState(null);
  // Grade records fetched on request, per class: { students, at, loading, error }.
  const [loadedGrades, setLoadedGrades] = useState({});

  // Reset only when a DIFFERENT assignment or class is asked for. Live data
  // refreshes hand this drawer new object identities every few seconds; keying
  // on ids keeps the teacher's chosen class and open lists where they are.
  const assignedClassKey = assignedClasses.map((entry) => entry.classId).join('|');
  useEffect(() => {
    if (!open) return;
    const preferred = assignedClasses.find((entry) => entry.classId === initialClassId) || assignedClasses[0] || null;
    setClassId(preferred?.classId || null);
    setLiveKey(null);
    setGradeKey(null);
  }, [open, assignment?.id, initialClassId, assignedClassKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !assignment) return null;

  const classRecord = assignedClasses.find((entry) => entry.classId === classId) || null;
  const classContext = classRecord ? { classId: classRecord.classId, classPeriod: classRecord.period || null } : null;
  const classLabel = classRecord ? (classRecord.name || classRecord.period) : '';
  const lifecycle = getAssignmentLifecycle(assignment, nowValue);
  const status = statusPill(lifecycle, assignedClasses.length > 0);
  const period = resolveAssignmentGradingPeriod(assignment, gradingPeriodSettings || {});
  const roleCounts = projectCurrentAssignmentContent(assignment).entries.reduce((counts, entry) => ({ ...counts, [entry.logicalRole]: (counts[entry.logicalRole] || 0) + 1 }), {});
  const sections = SECTION_ORDER.filter(([key]) => roleCounts[key]).map(([key, label]) => `${label} ${roleCounts[key]}`);
  const lesson = classContext ? describeClassLesson({ assignment, classContext, schedule: classSchedule, nowValue }) : null;
  const roster = classContext ? studentsInClass({ students, classes, classId: classContext.classId }) : [];
  const nameOf = (student) => formatStudentName(student);
  const live = classContext ? classLiveProgress({ assignment, roster, presenceById, nowValue, nameOf }) : null;
  const fetched = classContext ? loadedGrades[classContext.classId] || null : null;
  const grades = !classContext
    ? null
    : hasGradeRecords
      ? classGradeProgress({ assignment, roster, hasGradeRecords, nameOf })
      : fetched?.students
        ? classGradeProgress({ assignment, roster: fetched.students, hasGradeRecords: true, nameOf })
        : null;
  const loadGrades = async () => {
    if (!onLoadClassGrades || !classContext) return;
    const key = classContext.classId;
    setLoadedGrades((current) => ({ ...current, [key]: { ...current[key], loading: true, error: null } }));
    try {
      const students = await onLoadClassGrades(key);
      setLoadedGrades((current) => ({ ...current, [key]: { students, at: Date.now(), loading: false, error: null } }));
    } catch (error) {
      setLoadedGrades((current) => ({ ...current, [key]: { ...current[key], loading: false, error: error?.message || 'Could not load grades.' } }));
    }
  };
  // A lesson whose final deadline has passed is visited for its grades, work
  // and export; re-opening its Warm-Up or DOL today is the exception, so it
  // folds below the grades instead of leading the drawer.
  const pastLesson = lifecycle.isClosed;
  const clock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const openWork = onOpenStudentWork && classContext ? (studentId) => onOpenStudentWork(classContext.classId, assignment.id, studentId) : null;

  const liveItems = live ? [
    { key: 'working', label: 'Working now', value: live.workingHere.length, tone: live.workingHere.length ? 'success' : undefined, rows: live.workingHere, detail: (row) => (row.question ? `${String(row.role || '').replace('warmup', 'Warm-Up')} · Q${row.question}` : '') },
    { key: 'stuck', label: 'Stuck (3+ tries)', value: live.stuck.length, tone: live.stuck.length ? 'danger' : undefined, rows: live.stuck, detail: (row) => (row.question ? `Q${row.question}` : '') },
    { key: 'elsewhere', label: 'On other work', value: live.elsewhere.length, rows: live.elsewhere },
    { key: 'offline', label: 'Not signed in', value: live.notConnected.length + live.away.length, rows: [...live.notConnected, ...live.away] },
  ] : [];
  const gradeItems = grades ? [
    { key: 'notStarted', label: 'Not started', value: grades.notStarted.length, tone: grades.notStarted.length ? 'warning' : undefined, rows: grades.notStarted },
    { key: 'inProgress', label: 'In progress', value: grades.inProgress.length, rows: grades.inProgress, detail: (row) => `${row.attempted}/${row.total} answered` },
    { key: 'complete', label: 'Complete', value: grades.complete.length, tone: 'success', rows: grades.complete, detail: (row) => (row.score === null ? '' : `${row.score}%`) },
    { key: 'below', label: `Below ${PASSING_DISPLAY_THRESHOLD}%`, value: grades.belowThreshold.length, tone: grades.belowThreshold.length ? 'danger' : undefined, rows: grades.belowThreshold, detail: (row) => (row.state === 'complete' ? `${row.score}%` : `${row.creditOnAttempted}% on ${row.attempted} answered`) },
  ] : [];
  const openLive = liveItems.find((item) => item.key === liveKey);
  const openGrade = gradeItems.find((item) => item.key === gradeKey);

  return (
    <div className="tw-drawer-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <aside className="tw-drawer" role="dialog" aria-modal="true" aria-labelledby="assignment-hub-title" data-assignment-hub={assignment.id}>
        <header className="tw-drawer__header">
          <div className="tw-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0, flex: '1 1 auto' }}>
              <div className="tw-small tw-muted" style={{ fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Assignment</div>
              <h2 id="assignment-hub-title" className="tw-drawer__title">{assignment.title || 'Untitled assignment'}</h2>
            </div>
            <button ref={closeRef} type="button" className="tw-btn tw-btn--sm" onClick={onClose} aria-label="Close assignment details">Close</button>
          </div>
          <div className="tw-row" style={{ gap: 6 }}>
            <span className="tw-pill" data-tone={status.tone}>{status.label}</span>
            <span className="tw-pill" data-tone={period.isCurrent ? 'primary' : 'neutral'}>{period.isCurrent ? period.label : `Previous: ${period.label}`}</span>
            {sections.length > 0 && <span className="tw-small tw-muted">{sections.join(' · ')}</span>}
          </div>
          <div className="tw-small tw-muted">
            {lifecycle.releaseAt ? `Opens ${formatDateTime(assignment.releaseAt || assignment.releaseDate)} · ` : ''}
            Due {formatDateTime(assignment.dueAt || assignment.dueDate)}
            {lifecycle.lateDueAt && lifecycle.dueAt && lifecycle.lateDueAt.getTime() !== lifecycle.dueAt.getTime() ? ` · Late until ${formatDateTime(assignment.lateDueAt || assignment.lateDueDate)}` : ''}
          </div>
          {assignedClasses.length > 1 && (
            <div className="tw-row" role="group" aria-label="Class">
              {assignedClasses.map((entry) => (
                <button key={entry.classId} type="button" className="tw-chip" aria-pressed={entry.classId === classId} onClick={() => { setClassId(entry.classId); setLiveKey(null); setGradeKey(null); }}>
                  {entry.name || entry.period}
                </button>
              ))}
            </div>
          )}
          {assignedClasses.length === 1 && classRecord && (
            <div className="tw-small">
              Class: {onOpenClass
                ? <button type="button" className="tw-link" onClick={() => onOpenClass({ classId: classRecord.classId, classPeriod: classRecord.period || null })}>{classLabel}</button>
                : <strong>{classLabel}</strong>}
            </div>
          )}
        </header>

        <div className="tw-drawer__body">
          <nav className="tw-row" aria-label="Go to">
            {onOpenGrades && classContext && <button type="button" className="tw-btn tw-btn--primary" onClick={() => onOpenGrades(classContext.classId, assignment.id)}>Grades{assignedClasses.length > 1 ? ` · ${classLabel}` : ''}</button>}
            {onOpenLive && classContext && <button type="button" className="tw-btn" onClick={() => onOpenLive(classContext, assignment.id)}>Live view</button>}
            {onOpenExport && assignedClasses.length > 0 && <button type="button" className="tw-btn" onClick={() => onOpenExport({ classIds: classContext ? [classContext.classId] : [], assignmentId: assignment.id })}>Export grades</button>}
            {onPreview && <button type="button" className="tw-btn" onClick={() => onPreview(assignment)}>View as student</button>}
            <details className="tw-row" style={{ position: 'relative' }}>
              <summary className="tw-btn" style={{ listStyle: 'none' }}>More…</summary>
              <div className="tw-card" style={{ position: 'absolute', zIndex: 5, marginTop: 6, display: 'grid', gap: 6, minWidth: 220, right: 0 }}>
                {onEditDates && <button type="button" className="tw-btn tw-btn--sm" onClick={() => onEditDates(assignment)}>Dates &amp; classes</button>}
                {onPrint && <button type="button" className="tw-btn tw-btn--sm" onClick={() => onPrint(assignment)}>Print / answer key</button>}
                {onEditSetup && <button type="button" className="tw-btn tw-btn--sm" onClick={() => onEditSetup(assignment)}>Review / edit setup</button>}
                {onEditQuestions && <button type="button" className="tw-btn tw-btn--sm" onClick={() => onEditQuestions(assignment)}>Edit questions</button>}
              </div>
            </details>
          </nav>

          {!assignedClasses.length && (
            <div className="tw-notice">This is a Library copy — it is not assigned to a class yet, so there are no students, grades or live activity. Use “Dates &amp; classes” to assign it.</div>
          )}

          {(() => {
            const controls = classContext && (pastLesson ? (
              <details className="tw-disclosure" aria-label={`Open ${assignment.title} again today`}>
                <summary>Use it again today <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>open its Warm-Up or DOL for {classLabel}</span></summary>
                <div className="tw-disclosure__body">
                  <AssignmentLessonRows lesson={lesson} classContext={classContext} classLabel={classLabel} schedule={classSchedule} nowValue={nowValue} handlers={handlers} busy={busy} />
                </div>
              </details>
            ) : (
              <section className="tw-stack" style={{ gap: 8 }} aria-labelledby="assignment-hub-now">
                <h3 id="assignment-hub-now" className="tw-card__title">Right now in {classLabel}</h3>
                <AssignmentLessonRows lesson={lesson} classContext={classContext} classLabel={classLabel} schedule={classSchedule} nowValue={nowValue} handlers={handlers} busy={busy} />
              </section>
            ));

            const liveSection = live && (!pastLesson || live.workingHere.length > 0) && (
              <section className="tw-stack" style={{ gap: 8 }} aria-labelledby="assignment-hub-live">
                <h3 id="assignment-hub-live" className="tw-card__title">Students · live now <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{live.total} in class</span></h3>
                <StatGroup items={liveItems} openKey={liveKey} setOpenKey={setLiveKey} label="Live student counts" />
                {openLive && <div className="tw-card tw-card--muted"><NameList rows={openLive.rows} detail={openLive.detail} onOpenStudent={onOpenStudent} /></div>}
              </section>
            );

            const progressSection = classContext && (
              <section className="tw-stack" style={{ gap: 8 }} aria-labelledby="assignment-hub-progress">
                <h3 id="assignment-hub-progress" className="tw-card__title">
                  Progress &amp; grades
                  {grades?.average !== null && grades?.average !== undefined && <span className="tw-small tw-muted" style={{ fontWeight: 600 }}> · average {grades.average}% for the {grades.averageOf} who finished</span>}
                </h3>
                {grades ? (
                  <>
                    <StatGroup items={gradeItems} openKey={gradeKey} setOpenKey={setGradeKey} label="Assignment progress counts" />
                    {openGrade && <div className="tw-card tw-card--muted"><NameList rows={openGrade.rows} detail={openGrade.detail} onOpenStudent={onOpenStudent} onOpenStudentWork={openWork} /></div>}
                    {!hasGradeRecords && fetched?.at && (
                      <div className="tw-small tw-muted">
                        As of {clock(fetched.at)} · <button type="button" className="tw-link" disabled={fetched.loading} onClick={loadGrades}>{fetched.loading ? 'Refreshing…' : 'Refresh'}</button>
                      </div>
                    )}
                  </>
                ) : onLoadClassGrades ? (
                  <div className="tw-notice">
                    <div>This live screen keeps grades out of memory so it stays fast during class. Load them for {classLabel} when you need them.</div>
                    <div className="tw-row" style={{ marginTop: 8 }}>
                      <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" disabled={Boolean(fetched?.loading)} onClick={loadGrades}>
                        {fetched?.loading ? 'Loading…' : `Show progress for ${classLabel}`}
                      </button>
                      {fetched?.error && <span className="tw-small" role="alert">Could not load: {fetched.error}</span>}
                    </div>
                  </div>
                ) : (
                  <div className="tw-notice">
                    Completion and scores load with the gradebook, so this live screen stays fast during class.
                    {onOpenGrades && <> <button type="button" className="tw-link" onClick={() => onOpenGrades(classContext.classId, assignment.id)}>Open grades for {classLabel}</button></>}
                  </div>
                )}
              </section>
            );

            return pastLesson
              ? <>{progressSection}{liveSection}{controls}</>
              : <>{controls}{liveSection}{progressSection}</>;
          })()}
        </div>
      </aside>
    </div>
  );
}
