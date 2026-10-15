import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  adjustTestCycleGrade,
  assignTestCycleSessions,
  getTeacherTestCyclePlans,
  listTeacherTestCycleRecords,
  preflightTestCycleAssignment,
  releaseTestCycleAnswers,
  releaseTestCycleResults,
  runTestCycleBulkAction,
  teacherTestCycleAction,
  updateTestCycleAudience,
  updateTestCycleAvailability,
  updateTestCyclePolicy,
} from '../../services/testCycleService.js';
import { proctorExamAction } from '../../services/secureExamService.js';
import { getAssignmentEvidenceSummary, manageAssignmentLifecycle } from '../../services/assessmentLifecycleService.js';
import { GRADE_REPLACEMENT } from '../../platform/assessment/testCycle.js';
import { TEACHER_BUCKET_LABEL, TEACHER_BUCKET_ORDER, describeTeacherRow, teacherActionsForRow } from '../../platform/teacher/testCycleTeacherRows.js';
import { describeTestCycleCallError } from '../../platform/teacher/testCycleCallErrors.js';
import {
  BULK_ACTION,
  describeBulkPlan,
  describeAudienceAddition,
  describeReviewSummary,
  driveBulkOperation,
  newBulkOperationId,
  planBulkAction,
} from '../../platform/teacher/testCycleTeacherTools.js';
import {
  TestCycleAudiencePanel,
  TestCycleGradeForm,
  TestCycleLifecyclePanel,
  TestCycleOperationStatus,
  TestCycleStudentWindowForm,
  TestCycleWindowsPanel,
} from './TestCycleManagement.jsx';
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
 *   5. MANAGE (TestCycleManagement.jsx). When the Test is open, in exact
 *      school-zone times from the bell schedule; who is assigned, and adding a
 *      class or a student to this same Test; class-wide Waive Review and Open
 *      Test sessions as one server operation with every student's outcome; a
 *      grade set by hand from a named source; archive and delete.
 *
 * Presentational. Nothing here computes a grade or decides a stage.
 */

// The roster name, or "Name unavailable · ID x" so two nameless students stay
// distinguishable — never the bare id standing in for a name.
const rosterStudentLabel = (studentId, students, historicalName = '') => {
  const name = resolveRosterStudentName({ studentId, students, historicalName });
  return name === STUDENT_NAME_UNAVAILABLE ? formatStudentLabel(String(studentId ?? '')) : name;
};

// 5px at the sides, not 10: the columns share about 790px on a teacher's
// laptop, and at 10px the padding alone took 200px of it.
const cell = { padding: '8px 5px', fontSize: 'calc(13 * var(--mm-px))', borderBottom: '1px solid var(--mm-border-soft)', textAlign: 'left', verticalAlign: 'top', color: 'var(--mm-text)' };
// The table scrolls sideways on an iPad or phone; the name stays put so the
// grades and actions at the far end still say whose they are.
const stickyCell = { position: 'sticky', left: 0, zIndex: 1, background: 'var(--mm-surface)' };
const button = (tone, enabled = true) => ({
  minHeight: 40, padding: '7px 12px', borderRadius: 8, fontWeight: 800, fontSize: 'calc(13 * var(--mm-px))',
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
  const field = { display: 'grid', gap: 4, fontSize: 'calc(13 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text)' };
  const input = { minHeight: 40, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--mm-border-strong)', background: 'var(--mm-input-bg)', color: 'var(--mm-input-text)', fontSize: 'calc(14 * var(--mm-px))', maxWidth: 220 };
  const lockNote = (key) => locks[key] && <span style={{ fontWeight: 600, fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>Locked: {locks[key]}</span>;
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
      <p style={{ margin: 0, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.5 }}>
        Whatever you choose, a retest can only raise a recorded grade — never lower it.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={busy} style={button('primary', !busy)}>{busy ? 'Saving…' : 'Save policy'}</button>
        <button type="button" onClick={onCancel} style={button()}>Cancel</button>
      </div>
    </form>
  );
};

export const TestCycleControls = ({ assignment, classId = null, students = [], classes = [], teacherEmail = '', onPreview = null, defaultOpen = true }) => {
  const assignmentId = assignment?.id || null;
  const [open, setOpen] = useState(defaultOpen);
  // Students ticked for a class-wide action; none ticked means everyone.
  const [selected, setSelected] = useState(() => new Set());
  // The class-wide operation under way or just finished, as the server reports it.
  const [operation, setOperation] = useState(null);
  // A form open in a student's panel: { studentId, kind } for a grade or a window.
  const [rowForm, setRowForm] = useState(null);
  const [managing, setManaging] = useState(null); // 'audience' | 'lifecycle'
  const [audienceResult, setAudienceResult] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [rows, setRows] = useState([]);
  const [listing, setListing] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [plans, setPlans] = useState(null);
  const [busy, setBusy] = useState(false);
  // { text, tone: 'success' | 'error' }. An error is shown as one, not in the
  // same blue as "Released 3 results."
  const [message, setMessage] = useState(null);
  // A row action's outcome belongs on that row, where the teacher pressed it,
  // not at the top of a 40-student table.
  const [rowOutcome, setRowOutcome] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [bucketFilter, setBucketFilter] = useState('all');
  const [openActionsFor, setOpenActionsFor] = useState(null);

  /*
   * THE ACTIONS PANEL STAYS ON SCREEN.
   *
   * The actions used to open inside the last table cell, a 220px stack that
   * widened a table already at its minimum width: on a laptop with the sidebar
   * open, "Waive Review" was cut off at the panel's edge and anything below or
   * beside it could not be seen. The panel is now a full-width row under the
   * student, pinned to the left of the scrolling area and exactly as wide as
   * the part of the table that is visible, so every button and its
   * explanation are in view however far the table is scrolled.
   */
  const scrollerRef = useRef(null);
  const [visibleTableWidth, setVisibleTableWidth] = useState(null);
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return undefined;
    const measure = () => setVisibleTableWidth(node.clientWidth || null);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, openActionsFor]);

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
      setMessage({
        tone: 'error',
        text: describeTestCycleCallError(error, {
          action: 'Loading this Test Cycle',
          callable: 'listTeacherTestCycleRecords / preflightTestCycleAssignment',
        }),
      });
    }
  }, [assignmentId]);

  useEffect(() => { if (open) load(); }, [load, open]);

  if (!assignmentId) return null;

  /*
   * `context` names what was pressed and which callable carries it, so a
   * failure says "Waive Review did not go through" instead of the client's
   * bare "internal"; with a studentId the outcome is shown on that row.
   */
  const run = async (work, successText, { action = 'That action', callable = '', studentId = null } = {}) => {
    setBusy(true);
    setMessage(null);
    setRowOutcome(null);
    const report = (outcome) => {
      if (!outcome.text) return;
      if (studentId) setRowOutcome({ ...outcome, studentId });
      else setMessage(outcome);
    };
    try {
      const result = await work();
      report({ tone: 'success', text: typeof successText === 'function' ? successText(result) : successText });
      await load();
    } catch (error) {
      report({ tone: 'error', text: describeTestCycleCallError(error, { action, callable }) });
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (studentId) => rosterStudentLabel(studentId, students, rows.find((row) => row.studentId === studentId)?.studentName);

  /*
   * A CLASS-WIDE ACTION IS ONE SERVER OPERATION, WATCHED TO ITS END.
   *
   * Not one request per student. The server resolves who it applies to, works
   * a few students at a time and hands back; this asks again with the same
   * operation id until every student has an outcome, showing the tally as it
   * moves. If a call fails, what was done is kept on the server and "Continue"
   * resumes that same operation. Only a clean finish is reported as a success.
   */
  const runBulk = ({ action, scope, operationId = newBulkOperationId(action), label, summarize = null }) => run(
    async () => {
      const final = await driveBulkOperation({
        step: () => runTestCycleBulkAction({ assignmentId, action, operationId, scope }),
        onProgress: setOperation,
      });
      if (final?.finished) setSelected(new Set());
      return final;
    },
    // The operation's own box carries the account; the status line adds the
    // familiar one-line summary only for a clean finish.
    (final) => (final?.tone === 'success' && summarize ? summarize(final) : ''),
    { action: label, callable: 'runTestCycleBulkAction' },
  );
  const continueOperation = (view) => runBulk({ action: view.action, scope: view.scope || { kind: 'all' }, operationId: view.operationId, label: view.actionLabel || 'That action' });

  const changeAvailability = (change, label, studentId = null) => run(
    () => updateTestCycleAvailability({ assignmentId, ...change }),
    (result) => result?.label || (result?.notes || []).join(' ') || 'Saved.',
    { action: label, callable: 'updateTestCycleAvailability', studentId },
  );

  const blocked = preflight?.blocked === true;
  // Archived: students cannot see or start it, and the server refuses to open
  // or waive anything on it, so the class-wide buttons are not offered.
  const archived = listing?.availability?.reason === 'archived' || assignment?.archived === true;
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
    const context = (callable) => ({ action: item.label, callable, studentId: row.studentId });
    // A grade or a window needs something typed first: the form opens in the
    // student's own panel, and nothing is sent until it is submitted.
    if (['adjustGrade', 'reopenTest', 'extendHome'].includes(item.kind)) {
      setRowForm({ studentId: row.studentId, kind: item.kind });
      return;
    }
    if (item.kind === 'plans') {
      run(async () => setPlans(await getTeacherTestCyclePlans({ assignmentId, studentId: row.studentId })), '', context('getTeacherTestCyclePlans'));
      return;
    }
    if (item.kind === 'unlock') {
      run(() => proctorExamAction({ examSessionId: item.examSessionId, action: 'unlock' }), `${item.label} done for ${name}.`, context('proctorExamAction'));
      return;
    }
    if (item.kind === 'release') {
      run(() => releaseTestCycleResults({ assignmentId, stage: item.stage, studentIds: [row.studentId] }), `${item.label} done for ${name}.`, context('releaseTestCycleResults'));
      return;
    }
    if (item.kind === 'openSession') {
      // The class-wide callable, for this one student. The server re-checks
      // that they are in the assignment's audience and re-runs preflight.
      run(
        () => assignTestCycleSessions({ assignmentId, classId: targetClassId, studentIds: [row.studentId] }),
        (result) => (result?.createdSessions ? `Test session opened for ${name}.` : `${name} already has a Test session.`),
        context('assignTestCycleSessions'),
      );
      return;
    }
    const { action, stage = 'test' } = item;
    run(
      () => teacherTestCycleAction({ assignmentId, studentId: row.studentId, action, stage }),
      `${item.label} applied for ${name}.${item.doneNote ? ` ${item.doneNote}` : ''}`,
      context('teacherTestCycleAction'),
    );
  };

  // The students a class-wide action would reach: the ticked ones, or everyone.
  const selectedIds = [...selected].filter((studentId) => rows.some((row) => row.studentId === studentId));
  const waivePlan = planBulkAction({ action: BULK_ACTION.WAIVE_REVIEW, rows, selectedIds });
  const openPlan = planBulkAction({ action: BULK_ACTION.OPEN_TEST_SESSIONS, rows, selectedIds });
  const confirmBulk = (plan) => {
    const words = describeBulkPlan(plan, { external });
    setPendingConfirm({
      title: words.title,
      body: words.body,
      confirmLabel: words.confirmLabel,
      // `bulk` runs through runBulk (its own progress and account), not `run`.
      bulk: { action: plan.action, scope: plan.scope, label: plan.label },
    });
  };
  const testSchedule = listing?.testSchedule || null;
  const unopenedCount = openPlan ? planBulkAction({ action: BULK_ACTION.OPEN_TEST_SESSIONS, rows }).willChangeCount : 0;
  // An unfinished operation from an earlier visit is shown so it can be finished.
  const unfinishedOperation = !operation ? (listing?.operations || []).find((entry) => !entry.finished) || null : null;

  const columns = ['Student', 'Where they are', 'Review', external ? 'Original' : 'Test', 'Corrections', 'Retest', external ? `Original (${scoreSource})` : 'Original Test', 'Retest raw', 'Retest capped', 'Recorded'];
  // A row's outcome is shown in its open panel; if that row is filtered out or
  // its panel closed, the outcome is shown at the top instead of being lost.
  const rowOutcomeOnRow = Boolean(rowOutcome)
    && openActionsFor === rowOutcome.studentId
    && sortedRows.some((row) => row.studentId === rowOutcome.studentId);
  const statusMessage = message || (rowOutcome && !rowOutcomeOnRow ? rowOutcome : null);
  const statusLine = (outcome) => (
    <p
      role={outcome.tone === 'error' ? 'alert' : 'status'}
      style={{ margin: '8px 0 0', fontSize: 'calc(13 * var(--mm-px))', fontWeight: 700, lineHeight: 1.5, color: outcome.tone === 'error' ? 'var(--mm-error-text)' : 'var(--mm-primary-text)' }}
    >
      {outcome.text}
    </p>
  );
  const confirmBox = (pending) => (
    // Inline, not modal (no backdrop): the page stays reachable, so no
    // aria-modal. Escape cancels this confirm before it can reach a dialog
    // around it (the assignment hub), which ignores a handled Escape.
    <div
      role="alertdialog"
      aria-labelledby="test-cycle-confirm-title"
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setPendingConfirm(null); } }}
      style={{ margin: '12px 0', padding: 14, borderRadius: 10, border: '2px solid var(--mm-warning-border)', background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>
      <strong id="test-cycle-confirm-title">{pending.title}</strong>
      <p style={{ margin: '6px 0 10px', lineHeight: 1.5 }}>{pending.body}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" autoFocus onClick={() => setPendingConfirm(null)} style={button()}>Cancel</button>
        <button
          type="button"
          disabled={busy}
          style={button('primary', !busy)}
          onClick={() => {
            setPendingConfirm(null);
            if (pending.bulk) runBulk(pending.bulk);
            else run(pending.work, pending.done, pending.context);
          }}
        >
          {pending.confirmLabel}
        </button>
      </div>
    </div>
  );

  return (
    <section data-test-cycle-teacher={assignmentId} style={{ minWidth: 0, padding: 'clamp(14px, 3vw, 18px)', border: '1px solid var(--mm-border)', borderRadius: 12, background: 'var(--mm-surface)', color: 'var(--mm-text)' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(calc(17 * var(--mm-px)), 3vw, calc(21 * var(--mm-px)))', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>Test Cycle · {assignment.title}</h2>
          {pill && <span style={{ display: 'inline-block', marginTop: 6, fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, background: pill.bg, color: pill.color }}>{pill.label}</span>}
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
              <p style={{ fontSize: 'calc(13 * var(--mm-px))', margin: '0 0 8px' }}>Blank scores stay unassigned. Scores of {policy?.passingScore ?? 70} or higher are not eligible. An original score is kept once its session is opened.</p>
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
              <span style={{ fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.5 }}>{policy.summary}</span>
              {policy.example && <span style={{ fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>Example: {policy.example.sentence}</span>}
              {delivery && (
                <span style={{ fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
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
                  }, (result) => (result?.changed ? 'Retest policy saved.' : 'Nothing changed.'), { action: 'Saving the retest policy', callable: 'updateTestCyclePolicy' })}
                />
              )}
            </div>
          )}

          {/* Preflight is shown before the assign button, because a Test Cycle that
              cannot issue equivalent secure coverage must not reach a classroom. */}
          {preflight && (
            <div style={{ margin: '12px 0', padding: '11px 13px', borderRadius: 9, textAlign: 'left', background: blocked ? 'var(--mm-error-bg)' : 'var(--mm-success-bg)', border: `1px solid ${blocked ? 'var(--mm-error-border-soft)' : 'var(--mm-success-border)'}` }}>
              <strong style={{ fontSize: 'calc(13 * var(--mm-px))', color: blocked ? 'var(--mm-error-text)' : 'var(--mm-success-text)' }}>
                {blocked ? 'Cannot be assigned securely yet' : 'Secure preflight passed'}
              </strong>
              {/* The ✓ / ✗ is the bullet: list markers beside centred text read as a stray column. */}
              <ul style={{ margin: '7px 0 0', padding: 0, listStyle: 'none', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5 }}>
                {(preflight.checks || []).map((check) => (
                  <li key={check.id} style={{ color: check.passed ? 'var(--mm-text)' : 'var(--mm-error-text)' }}>
                    {check.passed ? '✓' : '✗'} {check.label}
                  </li>
                ))}
              </ul>
              {(preflight.errors || []).map((error) => (
                <p key={error} style={{ margin: '6px 0 0', fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-error-text)' }}>{error}</p>
              ))}
              {(preflight.warnings || []).map((warning) => (
                <p key={warning} style={{ margin: '6px 0 0', fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-warning-text)' }}>{warning}</p>
              ))}
              {/* THE BLUEPRINT'S SECURE RENDERING CONTRACT. Not only standards and
                  counts: which MathMaster tool each target is answered with, and
                  whether that tool is certified for every mode it will meet —
                  so a problem is found here, not on Question 7. Stacked rows,
                  never a wide table: no sideways scrolling on a phone. */}
              {Array.isArray(preflight.secureRendering) && preflight.secureRendering.length > 0 && (
                <details style={{ marginTop: 9 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text)' }}>
                    Blueprint targets and their tools ({preflight.secureRendering.length})
                  </summary>
                  <ul style={{ margin: '7px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                    {preflight.secureRendering.map((target) => {
                      const certified = Object.values(target.modes || {}).every(Boolean);
                      return (
                        <li key={target.targetId} data-blueprint-target={target.targetId} style={{ padding: '7px 9px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-text)', overflowWrap: 'anywhere' }}>
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
              onClick={() => (external
                // An external-original retest opens from the scores entered above.
                ? run(
                  () => assignTestCycleSessions({
                    assignmentId,
                    classId: targetClassId,
                    originalScores: Object.fromEntries(Object.entries(originalScores).filter(([, value]) => String(value).trim() !== '')),
                  }),
                  (result) => `Secure ${noun} sessions: ${result?.createdSessions || 0} opened, ${result?.reusedSessions || 0} already open. ${(result?.skippedStudents || []).length} skipped for a missing or passing original score.`,
                  { action: `Opening secure ${noun} sessions`, callable: 'assignTestCycleSessions' },
                )
                // A standard cycle: one server operation for the class, with
                // every student's outcome, safe to repeat.
                : runBulk({
                  action: BULK_ACTION.OPEN_TEST_SESSIONS,
                  scope: targetClassId ? { kind: 'class', classId: targetClassId } : { kind: 'all' },
                  label: `Opening secure ${noun} sessions`,
                  summarize: (final) => `Secure ${noun} sessions: ${final.counts.succeeded} opened, ${final.counts.alreadyComplete} already open.`,
                }))}
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
                    : `Students will see their score and, for each question, their own answer and whether it was right. The correct answers and worked solutions stay closed until every student this ${noun} is assigned to, in every class, has submitted it${listing?.answersRelease?.test?.stillTesting ? ` (not yet submitted: ${listing.answersRelease.test.stillTesting})` : ''}, or until you release them. Students below passing will get corrections, and their retest path opens. A released score cannot be hidden again.`,
                  confirmLabel: `Release ${noun} results`,
                  work: () => releaseTestCycleResults({ assignmentId, stage: 'test' }),
                  done: (result) => `Released ${result?.released || 0} ${noun} result${result?.released === 1 ? '' : 's'}.`,
                  context: { action: `Releasing ${noun} results`, callable: 'releaseTestCycleResults' },
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
                  body: `Recorded grades update under the retest policy above, and Google Classroom is updated on the same grade item. A retest never lowers a grade. Students will see their score and their own answers. The correct answers and worked solutions stay closed while any student can still take this retest, counting students in Corrections or yet to take the ${noun}${listing?.answersRelease?.retest?.stillTesting ? ` (right now: ${listing.answersRelease.retest.stillTesting})` : ''}, or until you release them.`,
                  confirmLabel: 'Release retest results',
                  work: () => releaseTestCycleResults({ assignmentId, stage: 'retest' }),
                  done: (result) => `Released ${result?.released || 0} retest result${result?.released === 1 ? '' : 's'}.`,
                  context: { action: 'Releasing retest results', callable: 'releaseTestCycleResults' },
                })}
              >
                Release {readyToRelease.retest} retest result{readyToRelease.retest === 1 ? '' : 's'}
              </button>
            )}
            {/* Answers and worked solutions wait until no one who can still sit the stage is left; the teacher can open them sooner,
                told who is still testing. The names are the server's list (the whole roster, a student with no session included),
                and the release covers exactly the students, at the attempts, that list held (its confirm keys). */}
            {!external && ['test', 'retest'].map((stage) => {
              const held = listing?.answersRelease?.[stage];
              if (!held || held.released || !rows.some((row) => row[stage]?.state === 'released')) return null;
              const stillTestingIds = Array.isArray(held.stillTestingIds) ? held.stillTestingIds : [];
              const stillTesting = stillTestingIds.map((studentId) => (
                rosterStudentLabel(studentId, students, rows.find((row) => row.studentId === studentId)?.studentName)
              ));
              const stageNoun = stage === 'retest' ? 'retest' : noun;
              return (
                <button
                  key={`answers-${stage}`}
                  type="button"
                  data-release-answers={stage}
                  disabled={busy}
                  style={{ ...button(null, !busy), minHeight: 44 }}
                  onClick={() => setPendingConfirm({
                    title: `Release ${stageNoun} answers and worked solutions now?`,
                    body: `${stage === 'retest' ? 'Can still take the retest' : 'Still testing'} (${stillTesting.length}): ${stillTesting.join(', ')}. Every student whose result is released will see the correct answers and worked solutions now, before these students finish. If a student joins later, or you reset a student's attempt, they close again until that student finishes.`,
                    confirmLabel: 'Release answers and worked solutions',
                    work: () => releaseTestCycleAnswers({ assignmentId, stage, confirmed: Array.isArray(held.confirmKeys) ? held.confirmKeys : [] }),
                    done: () => `Released the ${stageNoun} answers and worked solutions.`,
                    context: { action: `Releasing ${stageNoun} answers`, callable: 'releaseTestCycleAnswers' },
                  })}
                >
                  Release {stageNoun} answers and worked solutions
                </button>
              );
            })}
            <button type="button" disabled={busy} onClick={() => { setMessage(null); setRowOutcome(null); load(); }} style={button()}>Refresh</button>
          </div>

          {statusMessage && statusLine(statusMessage)}

          {/* A class-wide action's progress and its account of every student.
              Green only for a clean finish; a partial failure names who and why. */}
          {(operation || unfinishedOperation) && (
            <TestCycleOperationStatus
              operation={operation || unfinishedOperation}
              nameOf={nameOf}
              busy={busy}
              onContinue={continueOperation}
              onDismiss={() => setOperation(null)}
            />
          )}

          {/* Class-wide confirmations here, beside the buttons that raise them;
              a student's are in that student's actions panel. */}
          {pendingConfirm && !pendingConfirm.studentId && confirmBox(pendingConfirm)}

          {/* The exact times each class's Test is open, and whether students may
              work from home. Not shown for an external-original cycle. */}
          {testSchedule && (
            <TestCycleWindowsPanel
              schedule={testSchedule}
              busy={busy}
              unopenedCount={unopenedCount}
              onChange={(change, label) => changeAvailability(change, label)}
            />
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" aria-expanded={managing === 'audience'} onClick={() => setManaging((current) => (current === 'audience' ? null : 'audience'))} style={button(managing === 'audience' ? 'primary' : null)}>
              Who is assigned · {listing?.audience?.studentCount ?? rows.length}
            </button>
            <button type="button" aria-expanded={managing === 'lifecycle'} onClick={() => setManaging((current) => (current === 'lifecycle' ? null : 'lifecycle'))} style={button(managing === 'lifecycle' ? 'primary' : null)}>
              Archive or delete
            </button>
          </div>
          {managing === 'audience' && (
            <TestCycleAudiencePanel
              listing={listing}
              classes={classes}
              students={students}
              rows={rows}
              teacherEmail={teacherEmail}
              busy={busy}
              nameOf={nameOf}
              result={audienceResult}
              onAdd={(addition) => run(
                async () => {
                  const result = await updateTestCycleAudience({ assignmentId, ...addition });
                  setAudienceResult(result);
                  // Nothing added out of what was asked is not a success.
                  if (result.counts.failed > 0 && result.counts.classesAdded + result.counts.studentsAdded === 0) {
                    throw new Error('Nothing was added. Each reason is listed under "Who is assigned".');
                  }
                  return result;
                },
                (result) => describeAudienceAddition(result.counts, { noun }),
                { action: 'Adding to this Test', callable: 'updateTestCycleAudience' },
              )}
            />
          )}
          {managing === 'lifecycle' && (
            <TestCycleLifecyclePanel
              assignment={assignment}
              availability={availability}
              busy={busy}
              evidence={evidence}
              onCheckEvidence={() => {
                setEvidence(null);
                getAssignmentEvidenceSummary({ assignmentId })
                  .then(setEvidence)
                  .catch((error) => setMessage({ tone: 'error', text: describeTestCycleCallError(error, { action: 'Checking this Test for student work', callable: 'getAssignmentEvidenceSummary' }) }));
              }}
              onArchive={(archive) => run(
                () => manageAssignmentLifecycle({ assignmentId, action: archive ? 'archive' : 'unarchive' }),
                archive ? 'Archived. Students can no longer see or start this Test; everything is kept.' : 'Restored. This Test is open to students again.',
                { action: archive ? 'Archiving this Test' : 'Restoring this Test', callable: 'manageAssignmentLifecycle' },
              )}
              onDelete={(confirmation) => run(
                () => manageAssignmentLifecycle({ assignmentId, action: 'delete', ...confirmation }),
                'Deleted. This Test and every session opened for it are gone.',
                { action: 'Deleting this Test', callable: 'manageAssignmentLifecycle' },
              )}
            />
          )}

          {/* Class-wide actions: for the students ticked below, or for everyone
              when none is ticked. Each is one server operation. */}
          {!external && !archived && rows.length > 0 && (
            <div role="group" aria-label="Class-wide actions" data-test-cycle-bulk="" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
              <strong style={{ fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>
                {selectedIds.length ? `${selectedIds.length} selected:` : 'Whole class:'}
              </strong>
              {[waivePlan, openPlan].map((plan) => {
                const words = describeBulkPlan(plan, { external });
                return (
                  <button
                    key={plan.action}
                    type="button"
                    data-bulk-action={plan.action}
                    disabled={busy || words.disabled || blocked}
                    style={button(null, !(busy || words.disabled || blocked))}
                    onClick={() => confirmBulk(plan)}
                  >
                    {words.button}
                  </button>
                );
              })}
              {selectedIds.length > 0 && <button type="button" style={button()} onClick={() => setSelected(new Set())}>Clear selection</button>}
              {/* The server refuses both on a Test that fails its preflight, so
                  the reason is here rather than in an error after pressing. */}
              {blocked && <span style={{ flexBasis: '100%', fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>Not available until this Test passes the secure preflight above.</span>}
            </div>
          )}

          {/* Where the class is, at a glance — and a filter to the students in
              that state. "Submitted — release needed" is first because it is
              the one that waits on the teacher. */}
          {rows.length > 0 && (
            <div role="group" aria-label="Filter students by stage" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" aria-pressed={bucketFilter === 'all'} onClick={() => setBucketFilter('all')} style={{ ...button(bucketFilter === 'all' ? 'primary' : null), minHeight: 34, fontSize: 'calc(12 * var(--mm-px))' }}>All · {rows.length}</button>
              {TEACHER_BUCKET_ORDER.filter((bucket) => summary[bucket] > 0).map((bucket) => (
                <button key={bucket} type="button" aria-pressed={bucketFilter === bucket} onClick={() => setBucketFilter(bucket)} style={{ ...button(bucketFilter === bucket ? 'primary' : null), minHeight: 34, fontSize: 'calc(12 * var(--mm-px))' }}>
                  {(external ? describeTeacherRow({ bucket }, { external }).bucketLabel : TEACHER_BUCKET_LABEL[bucket])} · {summary[bucket]}
                </button>
              ))}
            </div>
          )}

          {/* 8px into the card's own padding on each side: the columns need the
              room, and the cells' padding keeps the text clear of the border. */}
          <div ref={scrollerRef} style={{ overflowX: 'auto', margin: '12px -8px 0' }}>
            {/* On a teacher's laptop the page is 1126px wide whatever the
                screen, and with the sidebar open this box is 790px. The ten
                columns are kept to that: a wider table hides Recorded, the
                last column, behind a sideways scroll. The floor is only for
                a phone, where the table scrolls inside this box and the name
                column stays put. */}
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
              <thead>
                {/* Sentence case: in capitals "CORRECTIONS" and "RECORDED" are the
                    widest words in their columns, and the table has none to spare. */}
                <tr>
                  {columns.map((heading) => (
                    <th key={heading} scope="col" style={{ ...cell, ...(heading === 'Student' ? stickyCell : null), fontSize: 'calc(11 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
                      {heading === 'Student' && !external ? (
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            aria-label="Select every student shown"
                            checked={sortedRows.length > 0 && sortedRows.every((row) => selected.has(row.studentId))}
                            onChange={(event) => setSelected((current) => {
                              const next = new Set(current);
                              sortedRows.forEach((row) => (event.target.checked ? next.add(row.studentId) : next.delete(row.studentId)));
                              return next;
                            })}
                          />
                          {heading}
                        </label>
                      ) : heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const described = describeTeacherRow(row, { external });
                  const actions = teacherActionsForRow(row, { external });
                  const name = rosterStudentLabel(row.studentId, students, row.studentName);
                  const actionsOpen = openActionsFor === row.studentId && actions.length > 0;
                  const panelId = `test-cycle-actions-${row.studentId}`;
                  // A mastery-gated Review's first line is already a percent
                  // ("3/12 · 40% of 80%"); the Review score then goes below it.
                  const masteryGated = row.review?.minimumMastery !== undefined && row.review?.minimumMastery !== null;
                  const reviewFacts = describeReviewSummary(row.review, { percentWithProgress: masteryGated });
                  const formOpen = rowForm?.studentId === row.studentId ? rowForm : null;
                  return (
                    <React.Fragment key={row.studentId}>
                      <tr data-teacher-bucket={row.bucket} data-student-row={row.studentId}>
                        {/* The student's own cell holds what is theirs: the tick box,
                            the name, how they came to have this Test, and the
                            toggle for their actions. The toggle used to be a column
                            of its own; eleven columns do not fit the teacher's
                            card, and here it stays on screen with the name
                            however far the table is scrolled sideways. */}
                        <th scope="row" style={{ ...cell, ...stickyCell, fontWeight: 800 }}>
                          {external ? name : (
                            <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                              <input
                                type="checkbox"
                                aria-label={`Select ${name}`}
                                checked={selected.has(row.studentId)}
                                onChange={(event) => setSelected((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(row.studentId); else next.delete(row.studentId);
                                  return next;
                                })}
                              />
                              <span>{name}</span>
                            </label>
                          )}
                          {row.individuallyAssigned && <div style={{ fontSize: 'calc(11.5 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-text-muted)' }}>Added individually</div>}
                          {actions.length > 0 && (
                            <button
                              type="button"
                              data-row-actions-toggle=""
                              aria-expanded={actionsOpen}
                              aria-controls={panelId}
                              onClick={() => {
                                // A student's unanswered confirmation goes with their panel;
                                // a class-wide one stays where it was raised.
                                setPendingConfirm((current) => (current?.studentId ? null : current));
                                if (actionsOpen) setRowOutcome((current) => (current?.studentId === row.studentId ? null : current));
                                setOpenActionsFor(actionsOpen ? null : row.studentId);
                              }}
                              style={{ ...button(actionsOpen ? 'primary' : null), display: 'block', minHeight: 34, marginTop: 6, padding: '5px 8px', whiteSpace: 'nowrap' }}
                            >
                              {actionsOpen ? 'Close ▴' : 'Actions ▾'}
                            </button>
                          )}
                        </th>
                        <td style={{ ...cell, fontWeight: described.needsRelease ? 900 : 600, color: described.needsRelease ? 'var(--mm-warning-text)' : 'var(--mm-text)' }}>
                          {described.bucketLabel}
                        </td>
                        {/* The Review as a grade: progress, points, percent and when
                            it was last saved, from the student's saved Review work.
                            Kept apart from the secure scores further along the row. */}
                        <td style={cell} data-review-summary="" title={Number(row.review?.total) > 0 ? `${reviewFacts.line}${reviewFacts.saved ? ` · saved ${reviewFacts.saved}` : ''}` : undefined}>
                          {described.reviewText}
                          {!masteryGated && reviewFacts.percent !== null && <> <span style={{ whiteSpace: 'nowrap' }}>· {reviewFacts.percent}%</span></>}
                          {/* Short lines of whole facts (describeReviewSummary): a
                              line wraps between facts, never inside one. */}
                          {reviewFacts.lines.length > 0 && (
                            <div style={{ fontSize: 'calc(11.5 * var(--mm-px))', lineHeight: 1.4, minWidth: 88, color: 'var(--mm-text-muted)' }}>
                              {reviewFacts.lines.map((facts) => (
                                <div key={facts.join(' ')}>
                                  {facts.map((fact, index) => <React.Fragment key={fact}>{index > 0 ? ' ' : ''}<span style={{ whiteSpace: 'nowrap' }}>{fact}</span></React.Fragment>)}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={cell}>{described.testText}</td>
                        <td style={cell}>{described.correctionsText}</td>
                        <td style={cell}>{described.retestText}</td>
                        <td style={cell}>{row.retestWithoutOriginal && row.originalTestGrade === null ? 'Not taken' : percent(row.originalTestGrade)}</td>
                        <td style={cell}>{percent(row.rawRetestGrade)}</td>
                        <td style={cell}>{percent(row.retestCappedContribution)}</td>
                        {/* The recorded grade says where it came from when it is not the rule's. */}
                        <td style={{ ...cell, fontWeight: 900 }} title={row.gradeReason || ''} data-recorded-grade="">
                          {percent(row.recordedGrade)}
                          {row.gradeAdjustment && <div style={{ fontSize: 'calc(11.5 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-warning-text)' }}>Set by teacher</div>}
                        </td>
                      </tr>
                      {actionsOpen && (
                        <tr data-test-cycle-actions-for={row.studentId}>
                          <td colSpan={columns.length} style={{ padding: 0, borderBottom: '1px solid var(--mm-border)', background: 'var(--mm-surface-sunken)' }}>
                            <div
                              id={panelId}
                              role="group"
                              aria-label={`Actions for ${name}`}
                              style={{ position: 'sticky', left: 0, boxSizing: 'border-box', width: visibleTableWidth ? `${visibleTableWidth}px` : '100%', maxWidth: '100%', padding: '12px 14px', display: 'grid', gap: 10, textAlign: 'left', overflowWrap: 'anywhere' }}
                            >
                              <strong style={{ color: 'var(--mm-text-strong)' }}>Actions for {name}</strong>
                              {rowOutcomeOnRow && rowOutcome.studentId === row.studentId && statusLine(rowOutcome)}
                              {row.gradeReason && (row.gradeAdjustment || row.retestWithoutOriginal) && (
                                <p style={{ margin: 0, fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.5, color: 'var(--mm-text)' }}>{row.gradeReason}</p>
                              )}
                              {formOpen?.kind === 'adjustGrade' ? (
                                <TestCycleGradeForm
                                  row={row}
                                  name={name}
                                  busy={busy}
                                  onCancel={() => setRowForm(null)}
                                  onSave={(adjustment) => {
                                    setRowForm(null);
                                    run(
                                      () => adjustTestCycleGrade({ assignmentId, studentId: row.studentId, ...adjustment }),
                                      (result) => `Recorded grade for ${name} set to ${percent(result?.recordedGrade)}. ${result?.reason || ''}`,
                                      { action: 'Setting this grade', callable: 'adjustTestCycleGrade', studentId: row.studentId },
                                    );
                                  }}
                                  onClear={() => {
                                    setRowForm(null);
                                    run(
                                      () => adjustTestCycleGrade({ assignmentId, studentId: row.studentId, clear: true }),
                                      (result) => `Your adjustment for ${name} was removed. ${result?.reason || ''}`,
                                      { action: 'Removing the grade you set', callable: 'adjustTestCycleGrade', studentId: row.studentId },
                                    );
                                  }}
                                />
                              ) : formOpen ? (
                                <TestCycleStudentWindowForm
                                  kind={formOpen.kind}
                                  row={row}
                                  name={name}
                                  timeZone={testSchedule?.timeZone || null}
                                  busy={busy}
                                  onCancel={() => setRowForm(null)}
                                  onSave={(change) => {
                                    setRowForm(null);
                                    changeAvailability({ ...change, studentId: row.studentId }, formOpen.kind === 'reopenTest' ? 'Opening the Test for this student' : 'Changing this student\'s closing time', row.studentId);
                                  }}
                                />
                              ) : pendingConfirm?.studentId === row.studentId ? confirmBox(pendingConfirm) : (
                                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                                  {/*
                                    Reset names its stage. One "Reset session" button had to
                                    pick a default, and the default was the Test — so a
                                    teacher resetting a student's Retest would instead have
                                    force-submitted the Test and cleared its released score.
                                    Which session is being thrown away is not something a
                                    button should decide on a teacher's behalf.

                                    Each action says what it does in words beside it, not
                                    only in a hover tooltip a Chromebook or iPad never shows.
                                  */}
                                  {actions.map((item) => (
                                    <li key={item.key} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        style={{ ...button(item.kind === 'release' || item.kind === 'openSession' ? 'primary' : null, !busy), textAlign: 'left' }}
                                        onClick={() => (item.confirm
                                          ? setPendingConfirm({
                                            studentId: row.studentId,
                                            title: `${item.label} for ${name}?`,
                                            body: item.detail,
                                            confirmLabel: item.label,
                                            work: () => teacherTestCycleAction({ assignmentId, studentId: row.studentId, action: item.action, stage: item.stage || 'test' }),
                                            done: () => `${item.label} applied for ${name}.`,
                                            context: { action: item.label, callable: 'teacherTestCycleAction', studentId: row.studentId },
                                          })
                                          : applyRowAction(row, item))}
                                      >
                                        {item.label}
                                      </button>
                                      {item.detail && <span style={{ flex: '1 1 240px', fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.45, color: 'var(--mm-text-muted)' }}>{item.detail}</span>}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!rows.length && (
                  <tr><td style={cell} colSpan={columns.length}>No students are assigned this Test Cycle yet. Assign it to a class, then open secure Test sessions.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* The generated plans, before or after unlock. "Why is this student
              answering three questions about A.5A?" needs an answer that is not
              "the algorithm decided". */}
          {plans && (
            <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border-soft)' }}>
              <h3 style={{ marginTop: 0, fontSize: 'calc(15 * var(--mm-px))' }}>Generated plans · {rosterStudentLabel(plans.studentId, students, plans.studentName)}</h3>
              {plans.corrections ? (
                <>
                  <h4 style={{ marginBottom: 4, fontSize: 'calc(13 * var(--mm-px))' }}>Corrections, mapped to the failed Test evidence</h4>
                  {plans.corrections.targets.map((target) => (
                    <div key={target.correctionId} style={{ fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.55, marginBottom: 7 }}>
                      <strong>{target.label}</strong> · {target.diagnosisDetail}
                      <div style={{ color: 'var(--mm-text-muted)' }}>
                        Missed {target.missed} of {target.attempted} · {target.correctResponses || 0}/{target.requiredCorrectResponses} corrected
                      </div>
                    </div>
                  ))}
                </>
              ) : <p style={{ fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>No correction plan — this student did not fail the Test.</p>}
              {plans.retest ? (
                <>
                  <h4 style={{ marginBottom: 4, fontSize: 'calc(13 * var(--mm-px))' }}>Retest targeting</h4>
                  <p style={{ fontSize: 'calc(12.5 * var(--mm-px))', lineHeight: 1.55, margin: 0 }}>
                    {plans.retest.audit.questionCount} questions ({plans.retest.audit.targetedQuestionCount} targeted at weak
                    skills, {plans.retest.audit.anchorQuestionCount} anchor coverage —{' '}
                    {Math.round(plans.retest.audit.actualWeakShare * 100)}% / {Math.round(plans.retest.audit.actualAnchorShare * 100)}%),
                    against {plans.retest.audit.originalQuestionCount} on the original Test.
                  </p>
                </>
              ) : <p style={{ fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>No retest plan has been generated yet.</p>}
              <button type="button" onClick={() => setPlans(null)} style={{ ...button(), marginTop: 10 }}>Close plans</button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default TestCycleControls;
