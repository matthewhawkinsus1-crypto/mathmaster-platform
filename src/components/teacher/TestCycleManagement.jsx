import React, { useMemo, useState } from 'react';
import {
  audienceCandidates,
  describeLifecycleEvidence,
  describeOperation,
  gradeAdjustmentChoices,
  instantFromSchoolInput,
  schoolDateKey,
  schoolInputValue,
  validateManualGrade,
} from '../../platform/teacher/testCycleTeacherTools.js';
import { compareStudentsByName, formatStudentLabel } from '../../platform/studentName.js';

/*
 * THE SECURE TEST SCREEN'S MANAGEMENT PANELS.
 *
 * What a teacher does to a Test Cycle that is already running, beside its
 * results table (TestCycleControls):
 *
 *   TestCycleWindowsPanel     when the Test is open, in exact school-zone
 *                             times read from the bell schedule, whether
 *                             students may work from home, and extend / reopen.
 *   TestCycleAudiencePanel    who is assigned, and adding a class or a student
 *                             to this same Test.
 *   TestCycleOperationStatus  a class-wide action's progress and its account
 *                             of every student.
 *   TestCycleGradeForm        a grade set by hand, from a named source.
 *   TestCycleStudentWindowForm one student's reopened Test or longer home window.
 *   TestCycleLifecyclePanel   archive (reversible) and delete (only while no
 *                             student has worked on it).
 *
 * Presentational. Every sentence about a time comes from the server
 * (listTeacherTestCycleRecords `testSchedule`), every action is a callable the
 * parent supplies, and nothing here decides who may do what.
 */

const button = (tone, enabled = true) => ({
  minHeight: 40, padding: '7px 12px', borderRadius: 8, fontWeight: 800, fontSize: 'calc(13 * var(--mm-px))',
  cursor: enabled ? 'pointer' : 'not-allowed',
  border: tone === 'primary' ? 0 : '1px solid var(--mm-border-strong)',
  background: !enabled ? 'var(--mm-surface-control-strong)' : tone === 'primary' ? 'var(--mm-primary)' : 'var(--mm-surface)',
  color: !enabled ? 'var(--mm-disabled-text)' : tone === 'primary' ? 'var(--mm-on-primary)' : 'var(--mm-text)',
});
const panel = { marginTop: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--mm-border-soft)', background: 'var(--mm-surface-sunken)', display: 'grid', gap: 8, textAlign: 'left' };
const heading = { margin: 0, fontSize: 'calc(15 * var(--mm-px))', color: 'var(--mm-text-strong)' };
const muted = { margin: 0, fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-text-muted)' };
const fact = { margin: 0, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-text)' };
const field = { display: 'grid', gap: 4, fontSize: 'calc(13 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text)' };
const input = { minHeight: 40, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-input-bg)', color: 'var(--mm-input-text)', fontSize: 'calc(14 * var(--mm-px))', maxWidth: 280, boxSizing: 'border-box' };
const formRow = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' };
const card = { padding: '10px 12px', borderRadius: 9, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', display: 'grid', gap: 6 };

const STATE_TONE = {
  open: { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  upcoming: { background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)' },
  closed: { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  unset: { background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' },
  alwaysOpen: { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
};
const pill = (state) => ({ display: 'inline-block', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800, padding: '3px 9px', borderRadius: 999, ...(STATE_TONE[state] || STATE_TONE.closed) });

/** One window (the Test's, or the home window) as two sentences and a home line. */
const WindowFacts = ({ title, window }) => (
  <div style={{ display: 'grid', gap: 2 }} data-window-state={window.state}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong style={{ fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{title}</strong>
      <span style={pill(window.state)}>{window.headline}</span>
    </div>
    <p style={fact}>{window.detail}</p>
    {window.home && <p style={{ ...fact, fontWeight: 700 }}>{window.home}</p>}
  </div>
);

/*
 * WHEN THE TEST IS OPEN.
 *
 * The teacher picks a DAY from the days the class actually sits; the times are
 * the bell schedule's and are shown back exactly, in the school's zone. Typing
 * a time is only for an exception: an extension past the bell, or a reopen.
 */
export const TestCycleWindowsPanel = ({ schedule, busy, unopenedCount = 0, onChange }) => {
  const [dayByClass, setDayByClass] = useState({});
  const [exception, setException] = useState(null); // { classId, kind: 'extend' | 'reopen', opensAt, closesAt, windowId }
  const [followUp, setFollowUp] = useState(null);
  const [allFrom, setAllFrom] = useState('');
  if (!schedule) return null;
  const { timeZone } = schedule;
  const today = schoolDateKey(Date.now(), timeZone);
  const anytime = schedule.policy === 'alwaysOpen';
  const anySet = schedule.classes.some((entry) => entry.test.state !== 'unset');

  const submitException = () => {
    const closesAt = instantFromSchoolInput(exception.closesAt, timeZone);
    if (exception.kind === 'extend') {
      onChange({ action: 'extendClassWindow', classId: exception.classId, windowId: exception.windowId, closesAt }, 'Extending the Test window');
    } else {
      onChange({ action: 'reopenClassWindow', classId: exception.classId, opensAt: instantFromSchoolInput(exception.opensAt, timeZone), closesAt }, 'Reopening the Test window');
    }
    setException(null);
  };

  return (
    <section style={panel} data-test-cycle-windows="">
      <h3 style={heading}>When the Test is open</h3>
      <p style={muted}>
        Times are school time ({timeZone}), read from the bell schedule. A window says when the Test can be <em>started</em>; it is not a timer, and a student who started in time can finish.
      </p>

      {!anytime && !anySet && (
        <p role="status" style={{ ...fact, padding: '8px 10px', borderRadius: 8, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', fontWeight: 700 }}>
          No class-time window is set, so this Test can be started whenever its secure session is open, and Corrections and the Retest have no closing time. Set the Test day to limit the Test to class time.
        </p>
      )}
      {anySet && unopenedCount > 0 && (
        <p role="status" style={{ ...fact, padding: '8px 10px', borderRadius: 8, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', fontWeight: 700 }}>
          {unopenedCount} student{unopenedCount === 1 ? ' has' : 's have'} no Test session open yet. Open sessions before the window: a student with no session cannot start, and once the window closes they are sent to the Retest.
        </p>
      )}

      {!anytime && schedule.classes.some((entry) => entry.test?.needsNewDay) && (
        <p role="status" data-test-window-needs-day="" style={{ ...fact, padding: '8px 10px', borderRadius: 8, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', fontWeight: 700 }}>
          Needs a new Test day: {schedule.classes.filter((entry) => entry.test?.needsNewDay).map((entry) => entry.name).join(', ')}. Its Test day had no class time, so students who have not started cannot start until you set a new day or reopen the window.
        </p>
      )}
      {schedule.classes.length > 1 && !anytime && (
        <div style={formRow}>
          <label style={field}>First Test day for every class
            <input type="date" min={today} value={allFrom} onChange={(event) => setAllFrom(event.target.value)} style={input} />
          </label>
          <button
            type="button"
            disabled={busy || !allFrom}
            style={button(null, !(busy || !allFrom))}
            onClick={() => { onChange({ action: 'setTestDayForClasses', fromDateKey: allFrom }, 'Setting the Test day'); setAllFrom(''); }}
          >
            Set each class's first meeting from that day
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {schedule.classes.map((entry) => {
          const chosen = dayByClass[entry.classId] || '';
          const currentWindow = entry.windows[entry.windows.length - 1] || null;
          const editing = exception?.classId === entry.classId ? exception : null;
          return (
            <div key={entry.classId} style={card} data-test-window-class={entry.classId}>
              <strong style={{ color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>
                {entry.name}{entry.period && !entry.name.includes(entry.period) ? ` · ${entry.period}` : ''} · {entry.studentCount} student{entry.studentCount === 1 ? '' : 's'}
              </strong>
              <WindowFacts title="Test" window={entry.test} />
              <WindowFacts title="Corrections and Retest" window={entry.followUp} />
              {entry.windows.some((window) => !window.resolved) && (
                <p style={{ ...fact, color: 'var(--mm-warning-text)', fontWeight: 700 }}>
                  {entry.windows.filter((window) => !window.resolved).map((window) => window.label).join('; ')}
                </p>
              )}

              {!anytime && (
                <div style={formRow}>
                  <label style={field}>Test day
                    <select value={chosen} onChange={(event) => setDayByClass((current) => ({ ...current, [entry.classId]: event.target.value }))} style={input}>
                      <option value="">Choose a day this class meets…</option>
                      {entry.upcomingDays.map((day) => <option key={day.dateKey} value={day.dateKey}>{day.label}</option>)}
                      {entry.undesignatedDays.map((day) => <option key={day.dateKey} value={day.dateKey}>{day.label} (A/B day not set yet)</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy || !chosen}
                    style={button('primary', !(busy || !chosen))}
                    onClick={() => { onChange({ action: 'setClassTestDay', classId: entry.classId, dateKey: chosen }, 'Setting the Test day'); setDayByClass((current) => ({ ...current, [entry.classId]: '' })); }}
                  >
                    {entry.test.state === 'unset' ? 'Set the Test day' : 'Change the Test day'}
                  </button>
                  {currentWindow?.resolved && entry.test.state !== 'unset' && (
                    <button type="button" disabled={busy} style={button(null, !busy)} onClick={() => setException({ classId: entry.classId, kind: 'extend', windowId: currentWindow.id, closesAt: schoolInputValue(currentWindow.closesAt, timeZone) })}>
                      Extend
                    </button>
                  )}
                  <button type="button" disabled={busy} style={button(null, !busy)} onClick={() => setException({ classId: entry.classId, kind: 'reopen', opensAt: schoolInputValue(Date.now(), timeZone), closesAt: '' })}>
                    {entry.test.state === 'closed' ? 'Reopen' : 'Open between two times'}
                  </button>
                  {entry.test.state !== 'unset' && (
                    <button type="button" disabled={busy} style={button(null, !busy)} onClick={() => onChange({ action: 'clearClassWindows', classId: entry.classId }, 'Removing the Test window')}>
                      Remove window
                    </button>
                  )}
                </div>
              )}
              {!entry.hasPeriodOnSchedule && !anytime && (
                <p style={muted}>This class has no period, so the bell schedule cannot say when it meets. Use "Open between two times".</p>
              )}

              {editing && (
                <form
                  onSubmit={(event) => { event.preventDefault(); submitException(); }}
                  style={{ ...formRow, padding: 10, borderRadius: 8, background: 'var(--mm-surface-sunken)' }}
                >
                  {editing.kind === 'reopen' && (
                    <label style={field}>Opens (school time)
                      <input type="datetime-local" required value={editing.opensAt} onChange={(event) => setException((current) => ({ ...current, opensAt: event.target.value }))} style={input} />
                    </label>
                  )}
                  <label style={field}>{editing.kind === 'extend' ? 'Keep open until (school time)' : 'Closes (school time)'}
                    <input type="datetime-local" required value={editing.closesAt} onChange={(event) => setException((current) => ({ ...current, closesAt: event.target.value }))} style={input} />
                  </label>
                  <button type="submit" disabled={busy || !editing.closesAt} style={button('primary', !(busy || !editing.closesAt))}>
                    {editing.kind === 'extend' ? 'Extend the window' : 'Open the Test for this class'}
                  </button>
                  <button type="button" onClick={() => setException(null)} style={button()}>Cancel</button>
                  {editing.kind === 'reopen' && <p style={{ ...muted, flexBasis: '100%' }}>A window you set by hand is not a class period: students may take the Test from home during it.</p>}
                </form>
              )}
            </div>
          );
        })}
      </div>

      <div style={card}>
        {/* Nothing closes until a class has a Test window (or the Test is open
            at any time): saying "close: Thursday" before then reads as a
            deadline that is not in force. */}
        <strong style={{ color: 'var(--mm-text-strong)' }}>
          {anySet || anytime
            ? `Corrections and Retest close: ${schedule.followUpClose.label}`
            : `Corrections and Retest: no closing time yet. Once a Test day is set they close: ${schedule.followUpClose.label}`}
        </strong>
        <p style={muted}>
          After the Test window closes, students who took the Test and need it do Corrections and the Retest from home; a student who did not take the Test goes straight to the Retest. By default they close at the assignment's final due date
          {schedule.followUpClose.lateDueLabel ? ` (${schedule.followUpClose.lateDueLabel})` : ''}.
        </p>
        {followUp === null ? (
          <div style={formRow}>
            <button type="button" disabled={busy} style={button(null, !busy)} onClick={() => setFollowUp(schoolInputValue(schedule.followUpClose.closesAt || Date.now(), timeZone))}>Extend or reopen</button>
            {schedule.followUpClose.mode !== 'lateDue' && (
              <button type="button" disabled={busy} style={button(null, !busy)} onClick={() => onChange({ action: 'setFollowUpClose', mode: 'lateDue' }, 'Changing the closing time')}>Use the final due date</button>
            )}
            {schedule.followUpClose.mode !== 'none' && (
              <button type="button" disabled={busy} style={button(null, !busy)} onClick={() => onChange({ action: 'setFollowUpClose', mode: 'none' }, 'Changing the closing time')}>Remove the closing time</button>
            )}
          </div>
        ) : (
          <form
            style={formRow}
            onSubmit={(event) => {
              event.preventDefault();
              onChange({ action: 'setFollowUpClose', mode: 'custom', closesAt: instantFromSchoolInput(followUp, timeZone) }, 'Changing the closing time');
              setFollowUp(null);
            }}
          >
            <label style={field}>Close Corrections and the Retest at (school time)
              <input type="datetime-local" required value={followUp} onChange={(event) => setFollowUp(event.target.value)} style={input} />
            </label>
            <button type="submit" disabled={busy || !followUp} style={button('primary', !(busy || !followUp))}>Save closing time</button>
            <button type="button" onClick={() => setFollowUp(null)} style={button()}>Cancel</button>
          </form>
        )}
      </div>

      <div style={formRow}>
        {anytime ? (
          <button type="button" disabled={busy} style={button(null, !busy)} onClick={() => onChange({ action: 'setTestPolicy', policy: 'classTime' }, 'Changing when the Test is open')}>
            Limit the Test to class time again
          </button>
        ) : (
          <button type="button" disabled={busy} style={button(null, !busy)} onClick={() => onChange({ action: 'setTestPolicy', policy: 'alwaysOpen' }, 'Changing when the Test is open')}>
            Open the Test at any time instead (students may take it from home)
          </button>
        )}
      </div>
    </section>
  );
};

/*
 * WHO IS ASSIGNED, AND ADDING TO THE SAME TEST.
 */
export const TestCycleAudiencePanel = ({ listing, classes = [], students = [], rows = [], teacherEmail = '', busy, nameOf, onAdd, result }) => {
  const [addClassIds, setAddClassIds] = useState([]);
  const [addStudentId, setAddStudentId] = useState('');
  const [sitsWith, setSitsWith] = useState('');
  const audience = listing?.audience || null;
  const scheduleClasses = listing?.testSchedule?.classes || [];
  const candidates = useMemo(() => audienceCandidates({
    classes, students, audienceClassIds: audience?.classIds || [], rows, teacherEmail,
  }), [classes, students, audience?.classIds, rows, teacherEmail]);
  if (!audience) return null;
  const studentOptions = [...candidates.students].sort((left, right) => compareStudentsByName(left.student, right.student));
  const sizeOf = (classId) => scheduleClasses.find((entry) => entry.classId === classId)?.studentCount
    ?? rows.filter((row) => row.classId === classId && !row.individuallyAssigned).length;
  const defaultSitsWith = sitsWith || candidates.assignedClasses[0]?.classId || '';

  return (
    <section style={panel} data-test-cycle-audience="">
      <h3 style={heading}>Who is assigned · {audience.studentCount} student{audience.studentCount === 1 ? '' : 's'}</h3>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
        {candidates.assignedClasses.map((entry) => (
          <li key={entry.classId} style={fact} data-audience-class={entry.classId}>
            <strong>{entry.label}</strong> · {sizeOf(entry.classId)} student{sizeOf(entry.classId) === 1 ? '' : 's'}
          </li>
        ))}
        {audience.individualStudentIds.map((studentId) => (
          <li key={studentId} style={fact} data-audience-student={studentId}>
            <strong>{nameOf(studentId)}</strong> · added individually
            {rows.find((row) => row.studentId === studentId)?.sitsWithClassId ? ` · sits the Test with ${candidates.classLabel(rows.find((row) => row.studentId === studentId).sitsWithClassId)}` : ''}
          </li>
        ))}
      </ul>
      <p style={muted}>
        Adding a class or a student gives them this same Test. Nothing that exists changes: no session, score, Review answer or correction is reset, and nobody who has a Test session is given a second one. Open Test sessions afterwards for the students you add.
      </p>

      {candidates.classes.length > 0 && (
        <div style={formRow}>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 4 }}>
            <legend style={{ ...field, padding: 0 }}>Add classes</legend>
            {candidates.classes.map((entry) => (
              <label key={entry.classId} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text)', minHeight: 32 }}>
                <input
                  type="checkbox"
                  checked={addClassIds.includes(entry.classId)}
                  onChange={(event) => setAddClassIds((current) => (event.target.checked ? [...current, entry.classId] : current.filter((id) => id !== entry.classId)))}
                />
                {entry.label}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            disabled={busy || !addClassIds.length}
            style={button('primary', !(busy || !addClassIds.length))}
            onClick={() => { onAdd({ addClassIds }); setAddClassIds([]); }}
          >
            {addClassIds.length ? `Add ${addClassIds.length} class${addClassIds.length === 1 ? '' : 'es'} to this Test` : 'Add classes to this Test'}
          </button>
        </div>
      )}

      {studentOptions.length > 0 && (
        <div style={formRow}>
          <label style={field}>Add one student
            <select value={addStudentId} onChange={(event) => setAddStudentId(event.target.value)} style={input}>
              <option value="">Choose a student…</option>
              {studentOptions.map(({ studentId, student }) => (
                <option key={studentId} value={studentId}>{formatStudentLabel(student)} · {candidates.classNameOf(student) || 'Unassigned'}</option>
              ))}
            </select>
          </label>
          {candidates.assignedClasses.length > 0 && (
            <label style={field}>Sits the Test with
              <select value={defaultSitsWith} onChange={(event) => setSitsWith(event.target.value)} style={input}>
                {candidates.assignedClasses.map((entry) => <option key={entry.classId} value={entry.classId}>{entry.label}</option>)}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={busy || !addStudentId}
            style={button('primary', !(busy || !addStudentId))}
            onClick={() => { onAdd({ addStudentIds: [addStudentId], sitsWithClassId: defaultSitsWith || null }); setAddStudentId(''); }}
          >
            Add this student
          </button>
        </div>
      )}
      {!candidates.classes.length && !studentOptions.length && <p style={muted}>Every class and student you can add already has this Test.</p>}

      {/* What the server said about each thing asked for, by name. */}
      {result && (
        <ul role="status" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 3 }} data-audience-result="">
          {[...(result.classes || []).map((entry) => ({ key: `c-${entry.classId}`, name: entry.name || candidates.classLabel(entry.classId), ...entry })),
            ...(result.students || []).map((entry) => ({ key: `s-${entry.studentId}`, name: entry.studentName || nameOf(entry.studentId), ...entry }))].map((entry) => (
            <li key={entry.key} style={{ ...fact, fontWeight: 700, color: entry.outcome === 'failed' ? 'var(--mm-error-text)' : 'var(--mm-text)' }}>
              {entry.name}: {entry.outcome === 'added' ? 'added' : entry.outcome === 'alreadyAssigned' ? 'already assigned' : 'not added'}
              {entry.detail ? ` — ${entry.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/*
 * A CLASS-WIDE ACTION'S PROGRESS AND ACCOUNT.
 *
 * Green only for a clean finish. While it runs it is a progress line; with any
 * failure it is an error, and every student it did not work for is named with
 * the reason.
 */
export const TestCycleOperationStatus = ({ operation, nameOf, busy, onContinue, onDismiss }) => {
  const described = describeOperation(operation, nameOf);
  if (!described) return null;
  const tone = described.tone === 'success'
    ? { border: 'var(--mm-success-border)', background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' }
    : described.tone === 'error'
      ? { border: 'var(--mm-error-border-soft)', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)' }
      : { border: 'var(--mm-border)', background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)' };
  const counts = described.counts;
  return (
    <div
      role={described.tone === 'error' ? 'alert' : 'status'}
      data-test-cycle-operation={described.operationId}
      data-operation-tone={described.tone}
      style={{ marginTop: 10, padding: '11px 13px', borderRadius: 9, border: `1px solid ${tone.border}`, background: tone.background, textAlign: 'left', display: 'grid', gap: 6 }}
    >
      <strong style={{ color: tone.color, lineHeight: 1.45 }}>{described.headline}</strong>
      {counts && !described.finished && (
        <progress value={counts.total - counts.pending} max={counts.total || 1} aria-label={`${described.actionLabel} progress`} style={{ width: '100%' }} />
      )}
      {described.failures.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-error-text)' }} data-operation-failures="">
          {described.failures.map((entry) => <li key={entry.studentId}><strong>{entry.name}</strong>: {entry.detail}</li>)}
        </ul>
      )}
      {described.notEligible.length > 0 && (
        <details open={described.notEligible.length <= 5}>
          <summary style={{ cursor: 'pointer', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-text)' }}>{described.notEligible.length} not eligible</summary>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-text)' }}>
            {described.notEligible.map((entry) => <li key={entry.studentId}><strong>{entry.name}</strong>: {entry.detail}</li>)}
          </ul>
        </details>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {described.canContinue && onContinue && (
          <button type="button" disabled={busy} style={button('primary', !busy)} onClick={() => onContinue(operation)}>
            {busy ? 'Working…' : 'Continue this action'}
          </button>
        )}
        {described.finished && onDismiss && <button type="button" style={button()} onClick={onDismiss}>Dismiss</button>}
      </div>
    </div>
  );
};

/*
 * A GRADE SET BY HAND, FROM A NAMED SOURCE.
 */
export const TestCycleGradeForm = ({ row, name, busy, onSave, onClear, onCancel }) => {
  const { choices, adjusted, current } = gradeAdjustmentChoices(row);
  const [source, setSource] = useState(choices[0].source);
  const [grade, setGrade] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState(null);
  const chosen = choices.find((choice) => choice.source === source) || choices[0];
  const groupName = `grade-source-${row.studentId}`;
  return (
    <form
      data-test-cycle-grade-form={row.studentId}
      onSubmit={(event) => {
        event.preventDefault();
        const invalid = chosen.needsGrade ? validateManualGrade({ grade, note }) : null;
        setProblem(invalid);
        if (!invalid) onSave({ source, grade: chosen.needsGrade ? Number(grade) : null, note });
      }}
      style={{ display: 'grid', gap: 10 }}
    >
      <strong style={{ color: 'var(--mm-text-strong)' }}>Set {name}'s recorded grade</strong>
      <p style={muted}>
        The Test and Retest scores stay exactly as earned and stay on this row. This changes only the grade that is recorded, and says where it came from. Google Classroom follows the recorded grade and is never lowered automatically.
      </p>
      {current && <p style={{ ...fact, fontWeight: 700 }}>{current}</p>}
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        <legend style={{ ...field, padding: 0 }}>Where the grade comes from</legend>
        {choices.map((choice) => (
          <label key={choice.source} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text)' }}>
            <input type="radio" name={groupName} checked={source === choice.source} onChange={() => { setSource(choice.source); setProblem(null); }} />
            <span><strong>{choice.label}</strong><br /><span style={{ color: 'var(--mm-text-muted)' }}>{choice.detail}</span></span>
          </label>
        ))}
      </fieldset>
      {chosen.needsGrade && (
        <label style={field}>Grade (%)
          <input type="number" min="0" max="100" step="any" value={grade} onChange={(event) => setGrade(event.target.value)} style={{ ...input, maxWidth: 140 }} />
        </label>
      )}
      <label style={field}>{chosen.needsNote ? 'Why (required)' : 'Note (optional)'}
        <input type="text" maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} style={{ ...input, maxWidth: 520, width: '100%' }} />
      </label>
      {problem && <p role="alert" style={{ ...fact, color: 'var(--mm-error-text)', fontWeight: 700 }}>{problem}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={busy} style={button('primary', !busy)}>{busy ? 'Saving…' : 'Record this grade'}</button>
        {adjusted && <button type="button" disabled={busy} style={button(null, !busy)} onClick={onClear}>Remove my adjustment</button>}
        <button type="button" onClick={onCancel} style={button()}>Cancel</button>
      </div>
    </form>
  );
};

/*
 * ONE STUDENT'S OWN WINDOW: the Test reopened for them between two times, or
 * longer for Corrections and the Retest.
 */
export const TestCycleStudentWindowForm = ({ kind, row, name, timeZone, busy, onSave, onCancel }) => {
  const reopening = kind === 'reopenTest';
  const [opensAt, setOpensAt] = useState(() => schoolInputValue(Date.now(), timeZone));
  const [closesAt, setClosesAt] = useState(() => (reopening ? '' : schoolInputValue(row.schedule?.followUp?.closesAt || Date.now(), timeZone)));
  const [reason, setReason] = useState('');
  return (
    <form
      data-test-cycle-student-window={row.studentId}
      onSubmit={(event) => {
        event.preventDefault();
        onSave(reopening
          ? { action: 'reopenStudentTest', opensAt: instantFromSchoolInput(opensAt, timeZone), closesAt: instantFromSchoolInput(closesAt, timeZone), reason }
          : { action: 'setStudentFollowUpClose', closesAt: instantFromSchoolInput(closesAt, timeZone) });
      }}
      style={{ display: 'grid', gap: 10 }}
    >
      <strong style={{ color: 'var(--mm-text-strong)' }}>
        {reopening ? `Open the Test for ${name}` : `Corrections and Retest for ${name}`}
      </strong>
      <p style={muted}>
        {reopening
          ? 'Only this student can start the Test in this window, and they may take it from home. If they start it, a Retest that was opened in its place is closed.'
          : 'A closing time for this student only. It can only give them longer than the class has.'}
        {' '}Times are school time ({timeZone}).
      </p>
      <div style={formRow}>
        {reopening && (
          <label style={field}>Opens
            <input type="datetime-local" required value={opensAt} onChange={(event) => setOpensAt(event.target.value)} style={input} />
          </label>
        )}
        <label style={field}>{reopening ? 'Closes' : 'Open until'}
          <input type="datetime-local" required value={closesAt} onChange={(event) => setClosesAt(event.target.value)} style={input} />
        </label>
        {reopening && (
          <label style={field}>Reason (optional)
            <input type="text" maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} style={input} />
          </label>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={busy || !closesAt} style={button('primary', !(busy || !closesAt))}>{busy ? 'Saving…' : reopening ? 'Open the Test for this student' : 'Save closing time'}</button>
        <button type="button" onClick={onCancel} style={button()}>Cancel</button>
      </div>
    </form>
  );
};

/*
 * ARCHIVE, OR DELETE.
 *
 * Archive is the default and is always reversible: the Test leaves students'
 * lists, nothing can be started, and every record and grade is kept. Delete is
 * permanent, is offered only once the server has found no student work, and
 * needs the title typed back.
 */
export const TestCycleLifecyclePanel = ({ assignment, availability, busy, evidence, onCheckEvidence, onArchive, onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const archived = availability?.reason === 'archived' || assignment?.archived === true;
  const described = describeLifecycleEvidence(evidence);
  const title = String(assignment?.title || '').trim();
  const mayDelete = Boolean(described?.canDelete) && typed.trim() === title && (described.classroomPublications === 0 || acknowledged);
  return (
    <section style={panel} data-test-cycle-lifecycle="">
      <h3 style={heading}>Archive or delete this Test</h3>
      <p style={muted}>
        {archived
          ? 'This Test is archived: students cannot see or start it, and every record, answer and grade is kept. Restore it to open it again.'
          : 'Archiving hides this Test from students and stops anything being started. Every record, answer and grade is kept, and you can restore it.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} style={button(archived ? 'primary' : null, !busy)} onClick={() => onArchive(!archived)}>
          {archived ? 'Restore this Test' : 'Archive this Test'}
        </button>
        {!confirming && (
          <button type="button" disabled={busy} style={button(null, !busy)} onClick={() => { setConfirming(true); onCheckEvidence(); }}>
            Delete permanently…
          </button>
        )}
      </div>
      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby={`delete-test-${assignment.id}`}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setConfirming(false); } }}
          style={{ padding: 12, borderRadius: 9, border: '2px solid var(--mm-warning-border)', background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', display: 'grid', gap: 8 }}
        >
          <strong id={`delete-test-${assignment.id}`}>Delete "{title}" permanently?</strong>
          <p style={{ margin: 0, lineHeight: 1.5 }}>{described ? described.text : 'Checking whether any student has worked on this Test…'}</p>
          {described?.canDelete && (
            <>
              <p style={{ margin: 0, lineHeight: 1.5, fontWeight: 700 }}>This cannot be undone. Archive it instead if you might need it again.</p>
              {described.classroomPublications > 0 && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'calc(13 * var(--mm-px))' }}>
                  <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
                  I understand its Google Classroom post stays in Classroom.
                </label>
              )}
              <label style={{ ...field, color: 'inherit' }}>Type the Test's title to confirm
                <input type="text" value={typed} onChange={(event) => setTyped(event.target.value)} style={{ ...input, maxWidth: 520, width: '100%' }} autoComplete="off" />
              </label>
            </>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" autoFocus onClick={() => { setConfirming(false); setTyped(''); }} style={button()}>Cancel</button>
            {described && !described.canDelete && !archived && (
              <button type="button" disabled={busy} style={button('primary', !busy)} onClick={() => { setConfirming(false); onArchive(true); }}>Archive it instead</button>
            )}
            {described?.canDelete && (
              <button type="button" disabled={busy || !mayDelete} style={button('primary', !(busy || !mayDelete))} onClick={() => onDelete({ confirmTitle: typed.trim(), acknowledgeClassroom: acknowledged })}>
                Delete permanently
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
