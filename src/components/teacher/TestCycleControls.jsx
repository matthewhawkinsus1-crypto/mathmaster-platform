import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assignTestCycleSessions,
  getTeacherTestCyclePlans,
  listTeacherTestCycleRecords,
  preflightTestCycleAssignment,
  releaseTestCycleResults,
  teacherTestCycleAction,
  updateTestCyclePolicy,
} from '../../services/testCycleService.js';
import { proctorExamAction } from '../../services/secureExamService.js';
import { GRADE_REPLACEMENT } from '../../platform/assessment/testCycle.js';
import { TEACHER_BUCKET_LABEL, TEACHER_BUCKET_ORDER, describeTeacherRow, teacherActionsForRow } from '../../platform/teacher/testCycleTeacherRows.js';
import { STUDENT_NAME_UNAVAILABLE, formatStudentLabel, resolveRosterStudentName, studentIdOf } from '../../platform/studentName.js';

/*
 * THE TEACHER'S VIEW OF A TEST CYCLE — ONE PLACE FOR ITS WHOLE LIFE.
 *
 * Four jobs, in the order a teacher actually does them:
 *
 *   1. ASSIGN. One action opens a secure Test session for every eligible
 *      student in the assignment's classes. Preflight is shown first, because
 *      a Test Cycle that cannot issue equivalent secure coverage must not reach
 *      a classroom.
 *
 *   2. WATCH. A count of where the class is ("3 submitted — release needed",
 *      "5 still in Review") and one row per student: Review progress, the
 *      Test's state (in progress 12/25, submitted, released), corrections
 *      progress, the retest, and the five canonical numbers — original Test,
 *      retest raw, retest capped, recorded. Every number comes from the
 *      server's canonical record, so this table, the student's Grade Center and
 *      Google Classroom cannot disagree.
 *
 *   3. RELEASE. Scores are held until the teacher releases them. That used to
 *      be a per-session button in the simulation proctor monitor, further down
 *      the page; it is now one action here, for everyone who has submitted.
 *
 *   4. ADJUST. The retest policy with its numbers and a worked example, and
 *      per-student overrides offered only when they apply, each saying what it
 *      will do — and asking first when it throws work away.
 *
 * Presentational. Nothing here computes a grade or decides a stage.
 */

// The roster name, or "Name unavailable · ID x" so two nameless students stay
// distinguishable — never the bare id standing in for a name.
const rosterStudentLabel = (studentId, students, historicalName = '') => {
  const name = resolveRosterStudentName({ studentId, students, historicalName });
  return name === STUDENT_NAME_UNAVAILABLE ? formatStudentLabel(String(studentId ?? '')) : name;
};

const cell = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--mm-border-soft)', textAlign: 'left', verticalAlign: 'top', color: 'var(--mm-text)' };
// The table scrolls sideways on an iPad or phone; the name stays put so the
// grades and actions at the far end still say whose they are.
const stickyCell = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--mm-surface)' };
const button = (tone, enabled = true) => ({
  minHeight: 40, padding: '7px 12px', borderRadius: 8, fontWeight: 800, fontSize: 13,
  cursor: enabled ? 'pointer' : 'not-allowed',
  border: tone === 'primary' ? 0 : '1px solid var(--mm-border-strong)',
  background: !enabled ? 'var(--mm-surface-control-strong)' : tone === 'primary' ? 'var(--mm-primary)' : 'var(--mm-surface)',
  color: !enabled ? 'var(--mm-disabled-text)' : tone === 'primary' ? 'var(--mm-on-primary)' : 'var(--mm-text)',
});
const percent = (value) => (value === null || value === undefined ? '—' : `${Number(Number(value).toFixed(2))}%`);

const AVAILABILITY_PILL = {
  open: { label: 'Open to students', bg: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  scheduled: { label: 'Scheduled', bg: 'var(--mm-info-bg)', color: 'var(--mm-info-text)' },
  unpublished: { label: 'Paused — hidden from students', bg: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' },
  archived: { label: 'Archived', bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
};

const PolicyEditor = ({ policy, busy, onSave, onCancel }) => {
  const [draft, setDraft] = useState(() => ({
    passingScore: policy.passingScore,
    maxRecordedGrade: policy.maxRecordedGrade,
    gradeReplacement: policy.gradeReplacement,
    reviewRequired: policy.reviewRequired,
    correctionsRequiredForRetest: policy.correctionsRequiredForRetest,
  }));
  const locks = policy.locks || {};
  const field = { display: 'grid', gap: 4, fontSize: 13, fontWeight: 800, color: 'var(--mm-text)' };
  const input = { minHeight: 40, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-input-bg)', color: 'var(--mm-input-text)', fontSize: 14, maxWidth: 220 };
  const lockNote = (key) => locks[key] && <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--mm-text-muted)' }}>Locked: {locks[key]}</span>;
  return (
    <form
      onSubmit={(event) => { event.preventDefault(); onSave(draft); }}
      style={{ display: 'grid', gap: 12, padding: 14, borderRadius: 10, border: '1px solid var(--mm-border)', background: 'var(--mm-surface-sunken)' }}
    >
      <label style={field}>Passing score (%)
        <input type="number" min="1" max="100" disabled={Boolean(locks.passingScore)} value={draft.passingScore} onChange={(event) => setDraft((current) => ({ ...current, passingScore: event.target.value }))} style={input} />
        {lockNote('passingScore')}
      </label>
      <label style={field}>Highest grade a retest can record (%)
        <input type="number" min="0" max="100" disabled={Boolean(locks.maxRecordedGrade)} value={draft.maxRecordedGrade} onChange={(event) => setDraft((current) => ({ ...current, maxRecordedGrade: event.target.value }))} style={input} />
        {lockNote('maxRecordedGrade')}
      </label>
      <label style={field}>How a retest replaces the Test grade
        <select disabled={Boolean(locks.gradeReplacement)} value={draft.gradeReplacement} onChange={(event) => setDraft((current) => ({ ...current, gradeReplacement: event.target.value }))} style={{ ...input, maxWidth: 360 }}>
          <option value={GRADE_REPLACEMENT.REPLACE_IF_HIGHER_CAPPED}>Retest replaces the Test, only if higher (up to the cap)</option>
          <option value={GRADE_REPLACEMENT.AVERAGE_IF_HIGHER_CAPPED}>Average Test and retest, only if higher (up to the cap)</option>
        </select>
        {lockNote('gradeReplacement')}
      </label>
      <label style={{ ...field, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" disabled={Boolean(locks.reviewRequired)} checked={draft.reviewRequired} onChange={(event) => setDraft((current) => ({ ...current, reviewRequired: event.target.checked }))} />
        Review must be finished before the Test
      </label>
      {lockNote('reviewRequired')}
      <label style={{ ...field, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" disabled={Boolean(locks.correctionsRequiredForRetest)} checked={draft.correctionsRequiredForRetest} onChange={(event) => setDraft((current) => ({ ...current, correctionsRequiredForRetest: event.target.checked }))} />
        Corrections must be finished before the retest
      </label>
      {lockNote('correctionsRequiredForRetest')}
      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>
        Whatever you choose, a retest can only raise a recorded grade — never lower it.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={busy} style={button('primary', !busy)}>{busy ? 'Saving…' : 'Save policy'}</button>
        <button type="button" onClick={onCancel} style={button()}>Cancel</button>
      </div>
    </form>
  );
};

export const TestCycleControls = ({ assignment, classId = null, students = [], onPreview = null, defaultOpen = true }) => {
  const assignmentId = assignment?.id || null;
  const [open, setOpen] = useState(defaultOpen);
  const [rows, setRows] = useState([]);
  const [listing, setListing] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [plans, setPlans] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [bucketFilter, setBucketFilter] = useState('all');

  const audienceClassIds = useMemo(() => (Array.isArray(assignment?.assignedClassIds) ? assignment.assignedClassIds : []), [assignment?.assignedClassIds]);
  // The class bar's class only when it IS one of this cycle's classes; the
  // server refuses any other, and "for this class" must mean this cycle's.
  const targetClassId = classId && audienceClassIds.includes(classId) ? classId : null;
  const [originalScores, setOriginalScores] = useState({});
  const external = Boolean(assignment?.assessmentPolicy?.externalAssessment);
  const scoreSource = assignment?.assessmentPolicy?.externalAssessment?.source || 'District';
  // An external-original cycle's one secure session is the retest.
  const noun = external ? 'Retest' : 'Test';

  const load = useCallback(async () => {
    if (!assignmentId) return;
    try {
      const [records, checks] = await Promise.all([
        listTeacherTestCycleRecords({ assignmentId }),
        preflightTestCycleAssignment({ assignmentId }),
      ]);
      setRows(records.rows || []);
      setListing(records);
      setPreflight(checks.preflight || null);
    } catch (error) {
      setMessage(error.message || 'The Test Cycle could not be loaded.');
    }
  }, [assignmentId]);

  useEffect(() => { if (open) load(); }, [load, open]);

  if (!assignmentId) return null;

  const run = async (work, successText) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await work();
      setMessage(typeof successText === 'function' ? successText(result) : successText);
      await load();
    } catch (error) {
      setMessage(error.message || 'That action did not complete.');
    } finally {
      setBusy(false);
    }
  };

  const blocked = preflight?.blocked === true;
  const summary = listing?.summary || {};
  const policy = listing?.policy || null;
  const delivery = listing?.delivery || null;
  const availability = listing?.availability || null;
  const pill = AVAILABILITY_PILL[availability?.reason] || null;
  const readyToRelease = listing?.readyToRelease || { test: 0, retest: 0 };
  const sessionsOpened = rows.some((row) => row.test?.examSessionId);
  const visibleRows = bucketFilter === 'all' ? rows : rows.filter((row) => row.bucket === bucketFilter);
  const sortedRows = [...visibleRows].sort((left, right) => (
    TEACHER_BUCKET_ORDER.indexOf(left.bucket) - TEACHER_BUCKET_ORDER.indexOf(right.bucket)
    || rosterStudentLabel(left.studentId, students, left.studentName).localeCompare(rosterStudentLabel(right.studentId, students, right.studentName))
  ));

  const applyRowAction = (row, item) => {
    const name = rosterStudentLabel(row.studentId, students, row.studentName);
    if (item.kind === 'plans') {
      run(async () => setPlans(await getTeacherTestCyclePlans({ assignmentId, studentId: row.studentId })), '');
      return;
    }
    if (item.kind === 'unlock') {
      run(() => proctorExamAction({ examSessionId: item.examSessionId, action: 'unlock' }), `${item.label} done for ${name}.`);
      return;
    }
    if (item.kind === 'release') {
      run(() => releaseTestCycleResults({ assignmentId, stage: item.stage, studentIds: [row.studentId] }), `${item.label} done for ${name}.`);
      return;
    }
    const { action, stage = 'test' } = item;
    run(
      () => teacherTestCycleAction({ assignmentId, studentId: row.studentId, action, stage }),
      `${item.label} applied for ${name}.`,
    );
  };

  return (
    <section data-test-cycle-teacher={assignmentId} style={{ padding: 'clamp(14px, 3vw, 18px)', border: '1px solid var(--mm-border)', borderRadius: 12, background: 'var(--mm-surface)', color: 'var(--mm-text)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(17px, 3vw, 21px)', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>Test Cycle · {assignment.title}</h2>
          {pill && <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, background: pill.bg, color: pill.color }}>{pill.label}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onPreview && <button type="button" onClick={() => onPreview(assignment)} style={button()}>Preview as student</button>}
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={button()}>{open ? 'Hide results' : 'Show results'}</button>
        </div>
      </div>

      {open && (
        <>
          <p style={{ color: 'var(--mm-text-muted)', lineHeight: 1.5, margin: '10px 0 0' }}>
            {external
              ? `Original test in ${scoreSource} → Review → secure Retest. Enter original scores below ${policy?.passingScore ?? 70}% to open retesting. `
              : 'Review → secure Test → Corrections → secure Retest, as one assignment and one Google Classroom grade item. '}
            Scores stay hidden from students until you release them.
          </p>

          {/* An external-original cycle starts from scores entered here. A
              student without one (or with a passing one) gets no session. */}
          {external && (
            <fieldset style={{ margin: '12px 0', border: '1px solid var(--mm-border)', borderRadius: 8, textAlign: 'left' }}>
              <legend style={{ fontWeight: 800 }}>Original {scoreSource} scores (%)</legend>
              <p style={{ fontSize: 13, margin: '0 0 8px' }}>Blank scores stay unassigned. Scores of {policy?.passingScore ?? 70} or higher are not eligible. An original score is kept once its session is opened.</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {students.map((student) => {
                  const id = studentIdOf(student);
                  if (!id) return null;
                  const existing = rows.find((row) => row.studentId === id && row.test?.examSessionId);
                  const label = rosterStudentLabel(id, students);
                  return (
                    <label key={id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{label}</span>
                      <input
                        type="number" min="0" max="100" step="any"
                        disabled={busy || Boolean(existing)}
                        aria-label={`Original score for ${label}`}
                        value={existing ? existing.originalTestGrade ?? '' : originalScores[id] ?? ''}
                        onChange={(event) => setOriginalScores((current) => ({ ...current, [id]: event.target.value }))}
                        style={{ minHeight: 40, width: 100, boxSizing: 'border-box' }}
                      />
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {/* The rule, with numbers, before any table that depends on it. */}
          {policy && (
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--mm-border-soft)', background: 'var(--mm-surface-sunken)', display: 'grid', gap: 6 }}>
              <strong style={{ color: 'var(--mm-text-strong)' }}>Retest policy · {policy.ruleLabel}</strong>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>{policy.summary}</span>
              {policy.example && <span style={{ fontSize: 13, color: 'var(--mm-text-muted)' }}>Example: {policy.example.sentence}</span>}
              {delivery && (
                <span style={{ fontSize: 13, color: 'var(--mm-text-muted)' }}>
                  {delivery.timed ? `Timed: ${delivery.timeLimitMinutes} minutes, enforced by the server.` : `Not timed. No clock runs during the ${noun}.`}
                  {delivery.questionCount ? ` ${delivery.questionCount} secure questions per student, randomized from approved families.` : ''}
                  {` Review ${policy.reviewRequired ? `must be finished before the ${noun}` : 'is optional'}${policy.reviewMinimumMastery !== null && policy.reviewMinimumMastery !== undefined ? `, with at least ${policy.reviewMinimumMastery}% mastery` : ''}.`}
                </span>
              )}
              {!editingPolicy && <button type="button" onClick={() => setEditingPolicy(true)} style={{ ...button(), justifySelf: 'start' }}>Change retest policy</button>}
              {editingPolicy && (
                <PolicyEditor
                  policy={policy}
                  busy={busy}
                  onCancel={() => setEditingPolicy(false)}
                  onSave={(draft) => run(async () => {
                    const result = await updateTestCyclePolicy({ assignmentId, policy: draft });
                    setEditingPolicy(false);
                    return result;
                  }, (result) => (result?.changed ? 'Retest policy saved.' : 'Nothing changed.'))}
                />
              )}
            </div>
          )}

          {/* Preflight is shown before the assign button, because a Test Cycle that
              cannot issue equivalent secure coverage must not reach a classroom. */}
          {preflight && (
            <div style={{ margin: '12px 0', padding: '11px 13px', borderRadius: 9, textAlign: 'left', background: blocked ? 'var(--mm-error-bg)' : 'var(--mm-success-bg)', border: `1px solid ${blocked ? 'var(--mm-error-border-soft)' : 'var(--mm-success-border)'}` }}>
              <strong style={{ fontSize: 13, color: blocked ? 'var(--mm-error-text)' : 'var(--mm-success-text)' }}>
                {blocked ? 'Cannot be assigned securely yet' : 'Secure preflight passed'}
              </strong>
              {/* The ✓ / ✗ is the bullet: list markers beside centred text read as a stray column. */}
              <ul style={{ margin: '7px 0 0', padding: 0, listStyle: 'none', fontSize: 12.5, lineHeight: 1.5 }}>
                {(preflight.checks || []).map((check) => (
                  <li key={check.id} style={{ color: check.passed ? 'var(--mm-text)' : 'var(--mm-error-text)' }}>
                    {check.passed ? '✓' : '✗'} {check.label}
                  </li>
                ))}
              </ul>
              {(preflight.errors || []).map((error) => (
                <p key={error} style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--mm-error-text)' }}>{error}</p>
              ))}
              {(preflight.warnings || []).map((warning) => (
                <p key={warning} style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--mm-warning-text)' }}>{warning}</p>
              ))}
              {/* THE BLUEPRINT'S SECURE RENDERING CONTRACT. Not only standards and
                  counts: which MathMaster tool each target is answered with, and
                  whether that tool is certified for every mode it will meet —
                  so a problem is found here, not on Question 7. Stacked rows,
                  never a wide table: no sideways scrolling on a phone. */}
              {Array.isArray(preflight.secureRendering) && preflight.secureRendering.length > 0 && (
                <details style={{ marginTop: 9 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 800, color: 'var(--mm-text)' }}>
                    Blueprint targets and their tools ({preflight.secureRendering.length})
                  </summary>
                  <ul style={{ margin: '7px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                    {preflight.secureRendering.map((target) => {
                      const certified = Object.values(target.modes || {}).every(Boolean);
                      return (
                        <li key={target.targetId} data-blueprint-target={target.targetId} style={{ padding: '7px 9px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--mm-text)', overflowWrap: 'anywhere' }}>
                          <strong>{target.alignmentKey || target.targetId}</strong> · {target.questionCount} question{target.questionCount === 1 ? '' : 's'} · DOK {target.dok} · difficulty {target.difficultyBand} · {target.representation}
                          <div>
                            Tool: {(target.toolLabels || []).join(', ') || '—'}
                            {target.requiredToolLabel ? ` (required: ${target.requiredToolLabel})` : ''}
                          </div>
                          <div style={{ color: certified ? 'var(--mm-success-text)' : 'var(--mm-error-text)' }}>
                            {certified ? '✓' : '✗'} {Object.entries(target.modes || {}).map(([mode, ok]) => `${{ secureTest: 'Test', secureRetest: 'Retest', corrections: 'Corrections' }[mode] || mode} ${ok ? '✓' : '✗'}`).join(' · ')}
                            {' · '}{['chromebook', 'ipad', 'phone'].map((device) => `${{ chromebook: 'Chromebook', ipad: 'iPad', phone: 'Phone' }[device]} ${target.devices?.[device] ? '✓' : '—'}`).join(' · ')}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              disabled={busy || blocked}
              style={{ ...button('primary', !(busy || blocked)), minHeight: 44 }}
              onClick={() => run(
                () => assignTestCycleSessions({
                  assignmentId,
                  classId: targetClassId,
                  ...(external ? { originalScores: Object.fromEntries(Object.entries(originalScores).filter(([, value]) => String(value).trim() !== '')) } : {}),
                }),
                (result) => `Secure ${noun} sessions: ${result?.createdSessions || 0} opened, ${result?.reusedSessions || 0} already open.${external ? ` ${(result?.skippedStudents || []).length} skipped for a missing or passing original score.` : ''}`,
              )}
            >
              {busy ? 'Working…' : targetClassId || audienceClassIds.length <= 1
                ? (sessionsOpened ? 'Open sessions for students who joined since' : `Open secure ${noun} sessions for this class`)
                : (sessionsOpened ? 'Open sessions for students who joined since' : `Open secure ${noun} sessions for all assigned classes`)}
            </button>
            {readyToRelease.test > 0 && (
              <button
                type="button"
                disabled={busy}
                style={{ ...button('primary', !busy), minHeight: 44 }}
                onClick={() => setPendingConfirm({
                  title: `Release ${readyToRelease.test} ${noun} result${readyToRelease.test === 1 ? '' : 's'}?`,
                  body: external
                    ? 'Recorded grades update under the retest policy above: the higher of the original and the capped retest. A released score cannot be hidden again.'
                    : 'Students will see their score and question review. Students below passing will get corrections, and their retest path opens. A released score cannot be hidden again.',
                  confirmLabel: `Release ${noun} results`,
                  work: () => releaseTestCycleResults({ assignmentId, stage: 'test' }),
                  done: (result) => `Released ${result?.released || 0} ${noun} result${result?.released === 1 ? '' : 's'}.`,
                })}
              >
                Release {readyToRelease.test} {noun} result{readyToRelease.test === 1 ? '' : 's'}
              </button>
            )}
            {readyToRelease.retest > 0 && (
              <button
                type="button"
                disabled={busy}
                style={{ ...button('primary', !busy), minHeight: 44 }}
                onClick={() => setPendingConfirm({
                  title: `Release ${readyToRelease.retest} retest result${readyToRelease.retest === 1 ? '' : 's'}?`,
                  body: 'Recorded grades update under the retest policy above, and Google Classroom is updated on the same grade item. A retest never lowers a grade.',
                  confirmLabel: 'Release retest results',
                  work: () => releaseTestCycleResults({ assignmentId, stage: 'retest' }),
                  done: (result) => `Released ${result?.released || 0} retest result${result?.released === 1 ? '' : 's'}.`,
                })}
              >
                Release {readyToRelease.retest} retest result{readyToRelease.retest === 1 ? '' : 's'}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => { setMessage(''); load(); }} style={button()}>Refresh</button>
          </div>

          {message && <p role="status" style={{ fontSize: 13, fontWeight: 700, color: 'var(--mm-primary-text)' }}>{message}</p>}

          {pendingConfirm && (
            <div role="alertdialog" aria-modal="true" aria-labelledby="test-cycle-confirm-title" style={{ margin: '12px 0', padding: 14, borderRadius: 10, border: '2px solid var(--mm-warning-border)', background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>
              <strong id="test-cycle-confirm-title">{pendingConfirm.title}</strong>
              <p style={{ margin: '6px 0 10px', lineHeight: 1.5 }}>{pendingConfirm.body}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" autoFocus onClick={() => setPendingConfirm(null)} style={button()}>Cancel</button>
                <button
                  type="button"
                  disabled={busy}
                  style={button('primary', !busy)}
                  onClick={() => { const pending = pendingConfirm; setPendingConfirm(null); run(pending.work, pending.done); }}
                >
                  {pendingConfirm.confirmLabel}
                </button>
              </div>
            </div>
          )}

          {/* Where the class is, at a glance — and a filter to the students in
              that state. "Submitted — release needed" is first because it is
              the one that waits on the teacher. */}
          {rows.length > 0 && (
            <div role="group" aria-label="Filter students by stage" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" aria-pressed={bucketFilter === 'all'} onClick={() => setBucketFilter('all')} style={{ ...button(bucketFilter === 'all' ? 'primary' : null), minHeight: 34, fontSize: 12 }}>All · {rows.length}</button>
              {TEACHER_BUCKET_ORDER.filter((bucket) => summary[bucket] > 0).map((bucket) => (
                <button key={bucket} type="button" aria-pressed={bucketFilter === bucket} onClick={() => setBucketFilter(bucket)} style={{ ...button(bucketFilter === bucket ? 'primary' : null), minHeight: 34, fontSize: 12 }}>
                  {(external ? describeTeacherRow({ bucket }, { external }).bucketLabel : TEACHER_BUCKET_LABEL[bucket])} · {summary[bucket]}
                </button>
              ))}
            </div>
          )}

          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
              <thead>
                <tr>
                  {['Student', 'Where they are', 'Review', external ? 'Original' : 'Test', 'Corrections', 'Retest', external ? `Original (${scoreSource})` : 'Original Test', 'Retest raw', 'Retest capped', 'Recorded', 'Actions'].map((heading) => (
                    <th key={heading} scope="col" style={{ ...cell, ...(heading === 'Student' ? stickyCell : null), fontSize: 11, textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const described = describeTeacherRow(row, { external });
                  const actions = teacherActionsForRow(row, { external });
                  return (
                    <tr key={row.studentId} data-teacher-bucket={row.bucket}>
                      <th scope="row" style={{ ...cell, ...stickyCell, fontWeight: 800 }}>{rosterStudentLabel(row.studentId, students, row.studentName)}</th>
                      <td style={{ ...cell, fontWeight: described.needsRelease ? 900 : 600, color: described.needsRelease ? 'var(--mm-warning-text)' : 'var(--mm-text)' }}>{described.bucketLabel}</td>
                      <td style={cell}>{described.reviewText}</td>
                      <td style={cell}>{described.testText}</td>
                      <td style={cell}>{described.correctionsText}</td>
                      <td style={cell}>{described.retestText}</td>
                      <td style={cell}>{percent(row.originalTestGrade)}</td>
                      <td style={cell}>{percent(row.rawRetestGrade)}</td>
                      <td style={cell}>{percent(row.retestCappedContribution)}</td>
                      <td style={{ ...cell, fontWeight: 900 }} title={row.gradeReason || ''}>{percent(row.recordedGrade)}</td>
                      <td style={cell}>
                        {actions.length === 0 ? <span style={{ color: 'var(--mm-text-muted)' }}>—</span> : (
                          <details>
                            <summary style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--mm-primary-text)', minHeight: 32 }}>Actions</summary>
                            <div style={{ display: 'grid', gap: 6, marginTop: 6, minWidth: 220 }}>
                              {/*
                                Reset names its stage. One "Reset session" button had to
                                pick a default, and the default was the Test — so a
                                teacher resetting a student's Retest would instead have
                                force-submitted the Test and cleared its released score.
                                Which session is being thrown away is not something a
                                button should decide on a teacher's behalf.
                              */}
                              {actions.map((item) => (
                                <button
                                  key={item.key}
                                  type="button"
                                  disabled={busy}
                                  title={item.detail || ''}
                                  style={{ ...button(item.kind === 'release' ? 'primary' : null, !busy), textAlign: 'left' }}
                                  onClick={() => (item.confirm
                                    ? setPendingConfirm({
                                      title: `${item.label} for ${rosterStudentLabel(row.studentId, students, row.studentName)}?`,
                                      body: item.detail,
                                      confirmLabel: item.label,
                                      work: () => teacherTestCycleAction({ assignmentId, studentId: row.studentId, action: item.action, stage: item.stage || 'test' }),
                                      done: () => `${item.label} applied for ${rosterStudentLabel(row.studentId, students, row.studentName)}.`,
                                    })
                                    : applyRowAction(row, item))}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr><td style={cell} colSpan={11}>No students are assigned this Test Cycle yet. Assign it to a class, then open secure Test sessions.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* The generated plans, before or after unlock. "Why is this student
              answering three questions about A.5A?" needs an answer that is not
              "the algorithm decided". */}
          {plans && (
            <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border-soft)' }}>
              <h3 style={{ marginTop: 0, fontSize: 15 }}>Generated plans · {rosterStudentLabel(plans.studentId, students, plans.studentName)}</h3>
              {plans.corrections ? (
                <>
                  <h4 style={{ marginBottom: 4, fontSize: 13 }}>Corrections, mapped to the failed Test evidence</h4>
                  {plans.corrections.targets.map((target) => (
                    <div key={target.correctionId} style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 7 }}>
                      <strong>{target.label}</strong> · {target.diagnosisDetail}
                      <div style={{ color: 'var(--mm-text-muted)' }}>
                        Missed {target.missed} of {target.attempted} · {target.correctResponses || 0}/{target.requiredCorrectResponses} corrected
                      </div>
                    </div>
                  ))}
                </>
              ) : <p style={{ fontSize: 12.5, color: 'var(--mm-text-muted)' }}>No correction plan — this student did not fail the Test.</p>}
              {plans.retest ? (
                <>
                  <h4 style={{ marginBottom: 4, fontSize: 13 }}>Retest targeting</h4>
                  <p style={{ fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
                    {plans.retest.audit.questionCount} questions ({plans.retest.audit.targetedQuestionCount} targeted at weak
                    skills, {plans.retest.audit.anchorQuestionCount} anchor coverage —{' '}
                    {Math.round(plans.retest.audit.actualWeakShare * 100)}% / {Math.round(plans.retest.audit.actualAnchorShare * 100)}%),
                    against {plans.retest.audit.originalQuestionCount} on the original Test.
                  </p>
                </>
              ) : <p style={{ fontSize: 12.5, color: 'var(--mm-text-muted)' }}>No retest plan has been generated yet.</p>}
              <button type="button" onClick={() => setPlans(null)} style={{ ...button(), marginTop: 10 }}>Close plans</button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default TestCycleControls;
