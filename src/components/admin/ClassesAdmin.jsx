import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { describeAuthError, teacherAdmin } from '../../auth/authService';
import {
  COURSES, COURSE_LEVELS, DEFAULT_PERIODS, REMOVAL_KINDS,
  courseLabel, courseLevelLabel, describeRemovalKinds,
} from '../../../functions/shared/classModel.mjs';

// Where an administrator establishes the school: classes, who teaches them,
// what course they are, and who is in them.
//
// This screen exists because the platform previously had no way to say
// "Ms. Smith's Algebra I, third period". Everything below writes through the
// audited admin callables — the browser cannot touch the classes collection
// directly, so what is rendered here is what the server agreed to.

const card = { border: '1px solid #d8dde6', borderRadius: 12, padding: '20px 22px', marginBottom: 20, textAlign: 'left', background: '#fff' };
const input = { minHeight: 42, padding: '0 12px', border: '1px solid #c7cdd6', borderRadius: 8, fontSize: 15, minWidth: 0, boxSizing: 'border-box' };
const primary = { minHeight: 42, padding: '0 16px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const quiet = { minHeight: 38, padding: '0 13px', border: '1px solid #c7cdd6', borderRadius: 8, background: '#fff', color: '#3c4043', fontWeight: 700, cursor: 'pointer' };
const danger = { ...quiet, color: '#c5221f', borderColor: '#f0b4b2' };
const pill = (background, color) => ({ display: 'inline-block', padding: '3px 9px', borderRadius: 999, background, color, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em' });
const field = { fontSize: 11, fontWeight: 900, color: '#5f6368', display: 'block' };

const EMPTY_CLASS = { classId: '', name: '', course: 'algebra1', courseLevel: 'standard', period: 'Period 1', teacherOfRecord: '' };

export default function ClassesAdmin() {
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [draft, setDraft] = useState(EMPTY_CLASS);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [confirming, setConfirming] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const access = await teacherAdmin.listSignInAccess();
      setClasses(access.classes || []);
      setStudents(access.students || []);
      setTeachers((access.teachers || []).filter((entry) => entry.active !== false).map((entry) => entry.email));
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (key, action, message) => {
    setBusy(key);
    setError(null);
    setStatus(null);
    try {
      const result = await action();
      setStatus(typeof message === 'function' ? message(result) : message);
      await refresh();
      return result;
    } catch (caught) {
      setError(describeAuthError(caught));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const visibleClasses = useMemo(
    () => classes.filter((entry) => showArchived || entry.status !== 'archived'),
    [classes, showArchived],
  );

  const countsByClass = useMemo(() => {
    const counts = {};
    students.forEach((student) => {
      if (student.classId) counts[student.classId] = (counts[student.classId] || 0) + 1;
    });
    return counts;
  }, [students]);

  // Students with no class at all. An administrator has to be able to find
  // these: a student nobody put in a class gets no assignments and no course.
  const unassigned = useMemo(() => students.filter((student) => !student.classId), [students]);

  const selectedClass = classes.find((entry) => entry.classId === selectedClassId) || null;
  const roster = useMemo(
    () => students.filter((student) => student.classId === selectedClassId),
    [students, selectedClassId],
  );

  const editClass = (record) => setDraft({
    classId: record.classId,
    name: record.name || '',
    course: record.course || 'algebra1',
    courseLevel: record.courseLevel || 'standard',
    period: record.period || 'Unassigned',
    teacherOfRecord: record.teacherOfRecord || '',
  });

  const saveDraft = () => run(
    'save-class',
    () => teacherAdmin.saveClass(draft),
    (result) => `${result.name} saved.${result.rostersUpdated ? ` ${result.rostersUpdated} student record${result.rostersUpdated === 1 ? '' : 's'} moved with it.` : ''}`,
  ).then((result) => { if (result) setDraft(EMPTY_CLASS); });

  const removalKinds = describeRemovalKinds();

  return (
    <div>
      {error && <div role="alert" style={{ ...card, background: '#fce8e6', borderColor: '#f0b4b2', color: '#a50e0e', marginBottom: 14 }}>{error}</div>}
      {status && <div role="status" style={{ ...card, background: '#e6f4ea', borderColor: '#a8d5b5', color: '#137333', marginBottom: 14 }}>{status}</div>}

      {/* One-time migration, offered only while it would still do something. */}
      {!loading && classes.length === 0 && (
        <section style={{ ...card, background: '#fef7e0', borderColor: '#f9ab00' }}>
          <h3 style={{ margin: 0, color: '#7a4f00' }}>No classes exist yet</h3>
          <p style={{ margin: '8px 0 14px', color: '#7a4f00', lineHeight: 1.55 }}>
            MathMaster previously organised students by period alone. Create one class per existing period and place every
            student who already has a period into it — nothing is deleted, and you can rename, re-course and reassign each
            class afterwards.
          </p>
          <button type="button" style={primary} disabled={busy === 'migrate'} onClick={() => run(
            'migrate',
            () => teacherAdmin.migrateClassesFromPeriods(),
            (result) => `${result.classesCreated} classes created · ${result.studentsPlaced} students placed${result.studentsUnplaced ? ` · ${result.studentsUnplaced} still need a class` : ''}.`,
          )}>
            {busy === 'migrate' ? 'Working…' : 'Create classes from existing periods'}
          </button>
        </section>
      )}

      {/* --- Create / edit a class ------------------------------------------- */}
      <section style={card}>
        <h3 style={{ margin: '0 0 4px' }}>{draft.classId ? 'Edit class' : 'Create a class'}</h3>
        <p style={{ margin: '0 0 16px', color: '#5f6368', fontSize: 13, lineHeight: 1.55 }}>
          The class decides the course and rigor its students learn under, and the teacher who sees them. Two teachers may
          each have a third-period class — the period is a schedule label, not the class's identity.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, alignItems: 'end' }}>
          <label style={field}>CLASS NAME
            <input style={{ ...input, width: '100%', marginTop: 4 }} value={draft.name} placeholder="Algebra I — 3rd Period" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label style={field}>COURSE
            <select style={{ ...input, width: '100%', marginTop: 4 }} value={draft.course} onChange={(event) => setDraft({ ...draft, course: event.target.value })}>
              {COURSES.map((course) => <option key={course.id} value={course.id}>{course.label}</option>)}
            </select>
          </label>
          <label style={field}>COURSE LEVEL
            <select style={{ ...input, width: '100%', marginTop: 4 }} value={draft.courseLevel} onChange={(event) => setDraft({ ...draft, courseLevel: event.target.value })}>
              {COURSE_LEVELS.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
            </select>
          </label>
          <label style={field}>PERIOD
            <select style={{ ...input, width: '100%', marginTop: 4 }} value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value })}>
              {DEFAULT_PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}
              <option value="Unassigned">Unassigned</option>
            </select>
          </label>
          <label style={field}>TEACHER OF RECORD
            <select style={{ ...input, width: '100%', marginTop: 4 }} value={draft.teacherOfRecord} onChange={(event) => setDraft({ ...draft, teacherOfRecord: event.target.value })}>
              <option value="">No teacher yet</option>
              {teachers.map((email) => <option key={email} value={email}>{email}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 9, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" style={{ ...primary, opacity: busy === 'save-class' ? 0.6 : 1 }} disabled={busy === 'save-class'} onClick={saveDraft}>
            {busy === 'save-class' ? 'Saving…' : draft.classId ? 'Save changes' : 'Create class'}
          </button>
          {draft.classId && <button type="button" style={quiet} onClick={() => setDraft(EMPTY_CLASS)}>Cancel</button>}
          {!teachers.length && <span style={{ alignSelf: 'center', color: '#7a4f00', fontSize: 13 }}>Add a teacher under Sign-in access before assigning one.</span>}
        </div>
      </section>

      {/* --- The classes ------------------------------------------------------ */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Classes</h3>
          <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13, color: '#3c4043', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              Show archived
            </label>
            <button type="button" style={quiet} onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </div>

        {loading && <p style={{ color: '#5f6368' }}>Loading classes…</p>}
        {!loading && visibleClasses.length === 0 && <p style={{ color: '#5f6368' }}>No classes yet. Create one above.</p>}

        <div style={{ display: 'grid', gap: 10 }}>
          {visibleClasses.map((entry) => {
            const count = countsByClass[entry.classId] || 0;
            const archived = entry.status === 'archived';
            return (
              <div key={entry.classId} style={{ padding: '13px 15px', border: `1px solid ${selectedClassId === entry.classId ? '#1a73e8' : '#e0e4ea'}`, borderRadius: 10, background: archived ? '#f8f9fa' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 16 }}>{entry.name}</strong>
                    <div style={{ color: '#5f6368', fontSize: 13, marginTop: 3 }}>
                      {courseLabel(entry.course)} · {courseLevelLabel(entry.courseLevel)} · {entry.period} ·{' '}
                      {entry.teacherOfRecord || <span style={{ color: '#a50e0e' }}>no teacher of record</span>} · {count} student{count === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                    {archived && <span style={pill('#f1f3f4', '#3c4043')}>Archived</span>}
                    {entry.courseLevel === 'honors' && <span style={pill('#f3e8fd', '#6f2da8')}>Honors</span>}
                    <button type="button" style={quiet} onClick={() => setSelectedClassId(selectedClassId === entry.classId ? '' : entry.classId)}>
                      {selectedClassId === entry.classId ? 'Hide roster' : 'Manage roster'}
                    </button>
                    <button type="button" style={quiet} onClick={() => editClass(entry)}>Edit</button>
                    {archived
                      ? <button type="button" style={quiet} disabled={busy === `status:${entry.classId}`} onClick={() => run(`status:${entry.classId}`, () => teacherAdmin.setClassStatus(entry.classId, 'restore'), `${entry.name} restored.`)}>Restore</button>
                      : <button type="button" style={quiet} disabled={busy === `status:${entry.classId}`} onClick={() => run(`status:${entry.classId}`, () => teacherAdmin.setClassStatus(entry.classId, 'archive'), `${entry.name} archived. Its roster and history are kept.`)}>Archive</button>}
                    <button type="button" style={danger} disabled={busy === `status:${entry.classId}`} onClick={() => run(`status:${entry.classId}`, () => teacherAdmin.setClassStatus(entry.classId, 'delete'), `${entry.name} deleted.`)}>Delete</button>
                  </div>
                </div>

                {selectedClassId === entry.classId && (
                  <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid #e8eaed' }}>
                    <h4 style={{ margin: '0 0 9px', fontSize: 14 }}>Roster · {entry.name}</h4>
                    {roster.length === 0 && <p style={{ color: '#5f6368', fontSize: 13 }}>No students in this class yet. Add one from the unassigned list below, or move one from another class.</p>}
                    <div style={{ display: 'grid', gap: 7 }}>
                      {roster.map((student) => (
                        <StudentRow
                          key={student.studentId}
                          student={student}
                          classes={visibleClasses}
                          busy={busy}
                          removalKinds={removalKinds}
                          confirming={confirming}
                          setConfirming={setConfirming}
                          onMove={(classId) => run(`move:${student.studentId}`, () => teacherAdmin.setStudentClass({ studentId: student.studentId, classId }), (result) => `${student.studentId} is now in ${classes.find((c) => c.classId === result.classId)?.name || 'no class'}.`)}
                          onRemove={() => run(`move:${student.studentId}`, () => teacherAdmin.setStudentClass({ studentId: student.studentId, classId: '' }), `${student.studentId} was removed from ${entry.name}. The account and all of its work are untouched.`)}
                          onSetActive={(active) => run(`status:${student.studentId}`, () => teacherAdmin.setStudentAccountStatus({ studentId: student.studentId, active }), active ? `${student.studentId} can sign in again.` : `${student.studentId} is deactivated. Records kept.`)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* --- Students nobody has placed --------------------------------------- */}
      <section style={card}>
        <h3 style={{ margin: '0 0 4px' }}>Students without a class{unassigned.length ? ` (${unassigned.length})` : ''}</h3>
        <p style={{ margin: '0 0 14px', color: '#5f6368', fontSize: 13, lineHeight: 1.55 }}>
          A student with no class receives no assignments and has no course, so My Math Path cannot tell whether they are an
          Algebra I or Algebra II learner. These need resolving.
        </p>
        {unassigned.length === 0 && <p style={{ color: '#137333', fontWeight: 700 }}>Every student is in a class.</p>}
        <div style={{ display: 'grid', gap: 7 }}>
          {unassigned.map((student) => (
            <StudentRow
              key={student.studentId}
              student={student}
              classes={visibleClasses.filter((entry) => entry.status !== 'archived')}
              busy={busy}
              removalKinds={removalKinds}
              confirming={confirming}
              setConfirming={setConfirming}
              onMove={(classId) => run(`move:${student.studentId}`, () => teacherAdmin.setStudentClass({ studentId: student.studentId, classId }), (result) => `${student.studentId} added to ${classes.find((c) => c.classId === result.classId)?.name || 'a class'}.`)}
              onRemove={null}
              onSetActive={(active) => run(`status:${student.studentId}`, () => teacherAdmin.setStudentAccountStatus({ studentId: student.studentId, active }), active ? `${student.studentId} can sign in again.` : `${student.studentId} is deactivated. Records kept.`)}
            />
          ))}
        </div>
      </section>

      {/* What each removal actually costs, stated once rather than in a dialog
          nobody reads. */}
      <section style={{ ...card, background: '#f8f9fa' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>What each removal means</h3>
        <div style={{ display: 'grid', gap: 9 }}>
          {removalKinds.map((kind) => (
            <div key={kind.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ minWidth: 150 }}>{kind.label}</strong>
              <span style={{ color: '#3c4043', fontSize: 13, flex: '1 1 320px', lineHeight: 1.5 }}>{kind.summary}</span>
              {kind.destroysHistory
                ? <span style={pill('#fce8e6', '#a50e0e')}>Cannot be undone</span>
                : <span style={pill('#e6f4ea', '#137333')}>Reversible</span>}
            </div>
          ))}
        </div>
        <p style={{ margin: '12px 0 0', color: '#5f6368', fontSize: 13 }}>
          Permanent deletion lives with the student account under Sign-in access, and asks for the student ID to be typed.
        </p>
      </section>
    </div>
  );
}

function StudentRow({ student, classes, busy, onMove, onRemove, onSetActive, confirming, setConfirming }) {
  const moving = busy === `move:${student.studentId}`;
  const changing = busy === `status:${student.studentId}`;
  const disabled = student.status === 'disabled';
  const confirmKey = `deactivate:${student.studentId}`;
  return (
    <div data-student-row={student.studentId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', border: '1px solid #e0e4ea', borderRadius: 9, background: disabled ? '#f8f9fa' : '#fff' }}>
      <div style={{ minWidth: 0 }}>
        <strong>{student.displayName ? `${student.displayName} · ${student.studentId}` : student.studentId}</strong>
        {disabled && <span style={{ ...pill('#f1f3f4', '#3c4043'), marginLeft: 8 }}>Deactivated</span>}
        <div style={{ color: '#5f6368', fontSize: 12, marginTop: 2 }}>{student.classPeriod}{student.assignedTeacherEmail ? ` · ${student.assignedTeacherEmail}` : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ ...field, fontSize: 10 }}>MOVE TO
          <select
            style={{ ...input, minHeight: 34, fontSize: 12, marginTop: 3, display: 'block', minWidth: 190 }}
            value={student.classId || ''}
            disabled={moving}
            onChange={(event) => event.target.value && onMove(event.target.value)}
          >
            <option value="">Choose a class…</option>
            {classes.map((entry) => <option key={entry.classId} value={entry.classId}>{entry.name}</option>)}
          </select>
        </label>
        {onRemove && <button type="button" style={{ ...quiet, minHeight: 34 }} disabled={moving} onClick={onRemove}>Remove from class</button>}
        {/* Deactivation is reversible, but it does stop a child signing in, so
            it asks once rather than firing on a single stray click. */}
        {disabled ? (
          <button type="button" style={{ ...quiet, minHeight: 34, color: '#137333' }} disabled={changing} onClick={() => onSetActive(true)}>Reactivate</button>
        ) : confirming === confirmKey ? (
          <>
            <button type="button" style={{ ...danger, minHeight: 34 }} disabled={changing} onClick={() => { setConfirming(null); onSetActive(false); }}>Confirm deactivate</button>
            <button type="button" style={{ ...quiet, minHeight: 34 }} onClick={() => setConfirming(null)}>Cancel</button>
          </>
        ) : (
          <button type="button" style={{ ...quiet, minHeight: 34 }} disabled={changing} onClick={() => setConfirming(confirmKey)}>Deactivate</button>
        )}
      </div>
    </div>
  );
}

export { REMOVAL_KINDS };
