import React, { useState } from 'react';
import { EmptyState, ProgressBar } from '../../ui/primitives';
import RecommendedSkills from './RecommendedSkills.jsx';
import AssignmentGroup from './AssignmentGroup.jsx';
import WhatShouldIDoNow from './WhatShouldIDoNow.jsx';
import StudentGlobalNav, { STUDENT_DESTINATION } from './StudentGlobalNav.jsx';
import { STUDENT_SELF_NEUTRAL_LABEL, formatStudentName } from '../../platform/studentName.js';
import BuildStamp from './BuildStamp.jsx';
import { BUCKET_LABEL, BUCKET_OPEN_BY_DEFAULT, BUCKET_ORDER } from '../../studentDashboardModel.js';
import DOLCountdown from './DOLCountdown.jsx';
import { formatDateTime, formatRemainingTime, studentDueDateLines } from '../../assignmentLifecycle';
import { SECTION_STATE, describeSectionWait } from '../../platform/student/lessonSections.js';
import { firstOpenLiveQuestionIndex } from '../../platform/student/liveSectionEntry.js';
import { describeClassroomReceipt } from '../../platform/classroom/classroomReceiptPresentation.js';
import { testCycleHasUnseenChange } from '../../platform/student/testCycleDiscovery.js';
import { RecoveryHomeSection } from './RecoveryOpportunities.jsx';

// A Test Cycle's pill, by the tone its stage description gives it.
const TEST_CYCLE_TONE = {
  notStarted: { border: 'var(--mm-border)', bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  inProgress: { border: 'var(--mm-primary-border)', bg: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' },
  pending: { border: 'var(--mm-border-strong)', bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
  complete: { border: 'var(--mm-success-border)', bg: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  locked: { border: 'var(--mm-border-strong)', bg: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
};
import ClassPointsCelebrations from './ClassPointsCelebrations.jsx';
import RewardsSummaryCard from './rewards/RewardsSummaryCard.jsx';
import { questionAddressLabel } from '../../app/routes/questionAddress.js';

// The student's assignment dashboard, as a component.
//
// It was inline in App.jsx, which meant the Teacher Path Simulator could not
// show a teacher what a student sees without copying it -- and two copies of a
// dashboard drift apart within a term. Everything it needs now arrives as
// props: the computed model from `studentDashboardModel`, the student's own
// display details, and the handlers.
//
// Presentational only. No Firestore, no lifecycle computation, no clock. That
// is what lets one set of components serve a real student reading live data and
// a simulated learner reading synthetic data.


// A clock time for a Date-ish value ("2:15 PM"), for a DOL whose window opens
// later today. Formatting only; the time itself comes from the model.
const formatClock = (value) => {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// Next-action kinds whose assignment Home would otherwise ALSO show as its own
// big card (the live DOL, the live Warm-Up, Resume). The next-action card is
// the single primary action, so that second card is not rendered.
const CARRIED_BY_NEXT_ACTION = new Set(['dol', 'warmup', 'resume']);

// "Nothing waiting" is only true when the next action is not assigned work.
const NOTHING_ASSIGNED_KINDS = new Set(['clear', 'weeklyPath', 'weeklyPathStatus']);

const SAVE_TONE = {
  saved: { color: 'var(--mm-success-text)', icon: '✓' },
  saving: { color: 'var(--mm-text-muted)', icon: '…' },
  offline: { color: 'var(--mm-warning-text)', icon: '○' },
  attention: { color: 'var(--mm-warning-text)', icon: '!' },
};

const CHIP = { fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', whiteSpace: 'nowrap' };

/*
 * ONE SECTION'S PROGRESS, AS A SHORT CHIP: "Classwork 2/3", "Classwork 3/3 ✓",
 * "DOL opens at 2:15 PM", "Practice — Excused". Read from the section state
 * the one "Today" rule decided (lessonSections.js); nothing is re-decided here.
 */
const sectionChip = (section, { waitText = null, nextOpening = null } = {}) => {
  const { label, state, doneCount = 0, total = 0 } = section;
  switch (state) {
    case SECTION_STATE.DONE:
      return { text: `${label} ${doneCount}/${total} ✓`, tone: 'done' };
    case SECTION_STATE.EXCUSED:
      return { text: `${label} — Excused`, tone: 'muted' };
    case SECTION_STATE.OPEN:
      return { text: `${label} ${doneCount}/${total}`, tone: 'open' };
    case SECTION_STATE.RECOVERY:
      return { text: `${label} — Recovery ready`, tone: 'open' };
    case SECTION_STATE.OPENS_LATER:
      // The model already worded the lesson's next opening against its own
      // clock; reuse it so the chip and the status line say the same time.
      return { text: (nextOpening === section && waitText) || describeSectionWait(section) || `${label} opens later`, tone: 'muted' };
    case SECTION_STATE.LOCKED:
      return { text: section.reason === 'prerequisite' ? `${label} — after earlier classwork` : `${label} — opens in class`, tone: 'muted' };
    case SECTION_STATE.CLOSED:
      return { text: `${label} — Closed`, tone: 'muted' };
    default:
      return { text: label, tone: 'muted' };
  }
};

const CHIP_TONE = {
  done: { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' },
  open: { background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' },
  muted: { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' },
};

export default function StudentDashboardView({
  // Exactly what buildStudentDashboardModel returned.
  dashboard,
  // { id, displayName, classPeriod }. Support-plan details are never shown on
  // Home: a classmate can read this screen over a shoulder.
  student,
  supportPresentation = {},
  onStartAssignment,
  // The assignment's result page: finished work, a closed lesson, a Recovery.
  onOpenResult = null,
  onExportAssignmentPdf = null,
  // Still its own prop because "What should I do now?" can recommend Path work
  // directly, which is a recommendation rather than a navigation choice.
  onOpenMathPath = null,
  // The shared student destinations, so Home teaches the same navigation
  // pattern every other student screen uses. Grades and Secure Exams no longer
  // need their own props: they are destinations like any other.
  onNavigate = null,
  // The single answer to "what should I do now?", already decided by
  // resolveNextAction. Null in contexts that render the list alone.
  nextAction = null,
  liveChallengeInvite = null,
  onOpenLiveChallenge = null,
  onLogout = null,
  classroomSyncStatusByAssignment = {},
  // Everything Recommended for You needs, passed through rather than rebuilt.
  recommended = {},
  classPoints = null,
  // The reward wallet (rewardWallet.js), summarized here; everything else
  // about rewards — using a Practice Pass included — lives on My Rewards.
  rewardWallet = null,
  hasNewRewards = false,
  onOpenRewards = null,
  // { tone: 'saved'|'saving'|'offline'|'attention', text } — one polite line.
  saveStatus = null,
  // The read-only "What changed" list, rendered after the assignment groups.
  whatChangedPanel = null,
  // { count } ways to raise a grade (Recoveries, retests). The link opens
  // Grades through the shared onNavigate — Home owns no per-destination
  // props (studentGlobalNavigation.test.mjs).
  waysToRaise = null,
  // Every Warm-Up/DOL Recovery this student can act on now
  // (buildStudentRecoveryDiscovery), and the handler that opens one. Absent
  // where there is no signed-in student (the Teacher Path Simulator).
  recoveryOpportunities = [],
  onOpenRecovery = null,
}) {
  const {
    visibleAssignments, resumeAssignment, resumeQuestionIndex, resumeQuestionAddress = null, resumeLifecycle,
    resumeRecordedGrade, resumeQuestionsAttempted, resumeFeedbackHeld,
    activeDols = [], activeWarmups = [], groups,
  } = dashboard;
  const hideCountdowns = Boolean(supportPresentation.hideCountdowns);
  // The workspace's own numbering ("Classwork Question 2"), the same address
  // the question's URL carries — not its position in storage.
  const resumeQuestionLabel = questionAddressLabel(resumeQuestionAddress) || `Question ${(resumeQuestionIndex ?? 0) + 1}`;

  // Finished work, a closed lesson and a Recovery open the result page. A
  // caller without that page falls back to Start, which lands on the result
  // when nothing is open.
  const openResult = (assignmentId) => {
    if (onOpenResult) onOpenResult(assignmentId);
    else onStartAssignment?.(assignmentId);
  };

  const [exportingAssignmentId, setExportingAssignmentId] = useState(null);
  const exportPdf = async (assignmentId) => {
    if (!onExportAssignmentPdf || !assignmentId || exportingAssignmentId) return;
    setExportingAssignmentId(assignmentId);
    try {
      await onExportAssignmentPdf(assignmentId);
    } finally {
      setExportingAssignmentId(null);
    }
  };

  /*
   * EACH ACTION APPEARS ONCE.
   *
   * When the next action IS the live DOL, the live Warm-Up or Resume, the
   * next-action card carries it (countdown, "Continue at Question N", grade
   * so far) and that assignment's own big card is not rendered. Any OTHER
   * live DOL/Warm-Up/Resume still shows, as a compact secondary card.
   */
  const carriedAssignmentId = nextAction && CARRIED_BY_NEXT_ACTION.has(nextAction.kind)
    ? nextAction.assignment?.id ?? null
    : null;
  const secondaryWarmups = activeWarmups.filter(({ assignment }) => assignment.id !== carriedAssignmentId);
  const secondaryDols = activeDols.filter(({ assignment }) => assignment.id !== carriedAssignmentId);
  const showResumeCard = Boolean(resumeAssignment) && resumeAssignment.id !== carriedAssignmentId;

  const resumeGradeText = resumeAssignment && resumeQuestionsAttempted > 0
    ? (resumeFeedbackHeld && !resumeLifecycle?.isClosed ? 'Grade: waiting for your teacher' : `Grade so far: ${resumeRecordedGrade}%`)
    : null;

  // The window the next-action card counts down, from the same live state the
  // separate card used to read.
  const nextActionEndsAt = (() => {
    if (!nextAction?.assignment) return null;
    const pool = nextAction.kind === 'dol' ? activeDols : nextAction.kind === 'warmup' ? activeWarmups : [];
    return pool.find(({ assignment }) => assignment.id === nextAction.assignment.id)?.state?.endsAt ?? null;
  })();

  // A group is only worth a heading when it has something in it. Six headings
  // reading "0 items" looks like a system with nothing to offer.
  const GROUP_HINTS = {
    pastDue: 'Late work is still open and still counts.',
    practice: 'These are closed. Trying them again is for practice and does not change your grade.',
  };

  /*
   * A TEST CYCLE'S CARD SAYS WHERE THE STUDENT IS IN IT.
   *
   * Its stage label ("Test ready", "Corrections · 1 of 3", "Test submitted"),
   * what happens next, and a recorded grade only once the teacher has released
   * one — never a "current grade if stopped now" computed from the Review,
   * which was a number that did not count. "New" marks a stage change the
   * student has not opened yet: the unlock or release they should notice.
   */
  const renderTestCycleCard = ({ assignment, lifecycle, disabled, testCycle }) => {
    const tone = TEST_CYCLE_TONE[testCycle.tone] || TEST_CYCLE_TONE.notStarted;
    const isNew = testCycleHasUnseenChange(student?.id, assignment.id, testCycle.stageChangedAt);
    const dates = studentDueDateLines(assignment, lifecycle);
    return (
      <article key={assignment.id} data-test-cycle-discovery={testCycle.key} style={{ background: 'var(--mm-surface)', padding: 'clamp(16px, 3vw, 21px) clamp(16px, 3vw, 26px)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', border: `2px solid ${tone.border}` }}>
        <div style={{ textAlign: 'left', flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <h3 style={{ margin: 0, color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{assignment.title}</h3>
            <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', padding: '4px 8px', borderRadius: '999px', background: tone.bg, color: tone.color }}>{testCycle.label}</span>
            <span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)' }}>TEST CYCLE</span>
            {isNew && <span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>NEW</span>}
          </div>
          <div style={{ color: 'var(--mm-text)', fontSize: '14px', lineHeight: 1.5 }}>{testCycle.detail}</div>
          <div style={{ color: 'var(--mm-text-muted)', fontSize: '13px', lineHeight: 1.55, marginTop: 4 }}>{dates.dueLabel}: {dates.dueText}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {testCycle.recordedGrade !== null && (
            <div style={{ textAlign: 'right', marginRight: '6px' }}>
              <div style={{ fontSize: '11px', color: 'var(--mm-text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Recorded grade</div>
              <div style={{ fontSize: '19px', fontWeight: 900, color: 'var(--mm-text-strong)' }}>{testCycle.recordedGrade}%</div>
            </div>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onStartAssignment(assignment.id)}
            style={{ minHeight: 44, padding: '10px 20px', background: disabled ? 'var(--mm-surface-control-strong)' : testCycle.actionRequired ? 'var(--mm-primary)' : 'var(--mm-surface)', color: disabled ? 'var(--mm-disabled-text)' : testCycle.actionRequired ? 'var(--mm-on-primary)' : 'var(--mm-primary-text)', border: testCycle.actionRequired || disabled ? 'none' : '2px solid var(--mm-primary-border)', borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 900 }}
          >
            {testCycle.actionLabel}
          </button>
        </div>
      </article>
    );
  };

  /*
   * AN ASSIGNMENT CARD SAYS ONLY WHAT IS TRUE FOR THIS STUDENT NOW.
   *
   * Finished work is never "Late" and never offers "Continue Late Work". A
   * Start/Continue button only appears on work the student can do this minute
   * (entry.actionable, the one "Today" rule) and lands on the question the
   * model chose. Work that is waiting says what it is waiting for instead of a
   * dead "Locked" button. The lesson's real sections are listed with their
   * progress — the retired `assignmentType` field never decides a label.
   */
  const renderAssignmentCard = (entry) => {
    if (entry.testCycle) return renderTestCycleCard(entry);
    const {
      assignment, lifecycle, access = {}, recordedGrade, dol = {}, lesson = null,
      feedbackHeld, questionsTotal, questionsDone, questionsAttempted = 0, bucket,
    } = entry;
    const excused = entry.excused === true;
    const closed = bucket === 'practice';
    const finished = excused || closed || entry.finished === true || bucket === 'completed';
    // An entry from an older caller has no `actionable`; its `disabled` is the
    // same rule spelled the old way.
    const actionable = !finished && (entry.actionable ?? !entry.disabled) === true;
    const waiting = !finished && !actionable;
    const isRecovery = actionable && entry.action === 'recovery';
    const late = !finished && Boolean(lifecycle.isLate);

    const status = excused
      ? { border: 'var(--mm-border)', bg: 'var(--mm-surface-control)', color: 'var(--mm-text)', label: 'Excused' }
      : closed
        ? { border: 'var(--mm-border)', bg: 'var(--mm-surface-control)', color: 'var(--mm-text)', label: 'Closed' }
        : finished
          ? { border: 'var(--mm-success-border)', bg: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', label: 'Finished' }
          : late
            ? { border: '#f9ab00', bg: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', label: 'Late' }
            : waiting
              ? { border: 'var(--mm-border-strong)', bg: 'var(--mm-surface-control)', color: 'var(--mm-text)', label: 'Not open yet' }
              : { border: 'var(--mm-border)', bg: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', label: 'Open now' };

    // What the card is waiting for, in the student's words. Never "Locked"
    // alone: the reason is the whole point.
    const waitLine = waiting
      ? entry.waitText
        || (access.open === false ? `Opens after you finish the earlier classwork, or on ${formatDateTime(assignment.releaseAt)}.` : 'Not open yet — your teacher will open it.')
      : null;
    // A lesson with no section list still says when its DOL really opens.
    const dolOpensAt = !lesson?.sections?.length && dol.enabled && ['waiting', 'beforeClass'].includes(dol.status)
      ? formatClock(dol.opensAt)
      : null;

    const sections = lesson?.sections || [];
    const classroomReceipt = classroomSyncStatusByAssignment?.[assignment.id] || null;
    // The shared reader decides whether the student can see this receipt in
    // Google Classroom; only then is it worth a line here.
    const receipt = describeClassroomReceipt({ receipt: classroomReceipt, mathMasterGrade: recordedGrade });
    const showClassroomGrade = !feedbackHeld && Boolean(classroomReceipt) && receipt.studentVisible && receipt.grade != null;
    const showGrade = !excused && questionsAttempted > 0;
    const dates = studentDueDateLines(assignment, lifecycle);

    const primaryButton = (label, onClick, key) => (
      <button key={key} type="button" onClick={onClick} style={{ minHeight: 44, padding: '10px 18px', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', border: '2px solid var(--mm-primary-border)', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>{label}</button>
    );

    return (
      <article key={assignment.id} data-assignment-card={assignment.id} data-card-status={status.label} style={{ background: 'var(--mm-surface)', padding: 'clamp(14px, 3vw, 21px) clamp(14px, 3vw, 24px)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', border: `2px solid ${status.border}` }}>
        <div style={{ textAlign: 'left', flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <h3 style={{ margin: 0, color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{assignment.title}</h3>
            <span data-status-chip style={{ ...CHIP, textTransform: 'uppercase', background: status.bg, color: status.color }}>{status.label}</span>
          </div>
          {sections.length > 0 && (
            <>
              <div data-section-makeup style={{ color: 'var(--mm-text-muted)', fontSize: '12.5px', fontWeight: 800 }}>
                {sections.map((section) => section.label).join(' · ')}
              </div>
              <ul aria-label="Sections" style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {sections.map((section) => {
                  const chip = sectionChip(section, { waitText: entry.waitText, nextOpening: lesson?.nextOpening });
                  return <li key={section.role} data-section-chip={section.state} style={{ ...CHIP, ...CHIP_TONE[chip.tone], whiteSpace: 'normal' }}>{chip.text}</li>;
                })}
              </ul>
            </>
          )}
          <div style={{ color: 'var(--mm-text-muted)', fontSize: '13px', lineHeight: 1.55, marginTop: 6 }}>
            {waitLine && <strong data-wait-line style={{ display: 'block', color: 'var(--mm-text)' }}>{waitLine}</strong>}
            {!finished && <>{dates.dueLabel}: {dates.dueText} · {dates.finalLabel}: {dates.finalText}</>}
            {finished && !excused && <>{dates.dueLabel}: {dates.dueText}</>}
            {late && <><br /><strong style={{ color: 'var(--mm-warning-text)' }}>Late work is still open for {formatRemainingTime(lifecycle.millisecondsRemaining)}.</strong></>}
            {dolOpensAt && !waitLine && <><br />DOL opens at {dolOpensAt}.</>}
          </div>
          {questionsTotal > 0 && !finished && (
            <div style={{ marginTop: '10px', maxWidth: '340px' }}>
              <ProgressBar
                value={questionsDone}
                max={questionsTotal}
                label={`${questionsDone} of ${questionsTotal} question${questionsTotal === 1 ? '' : 's'} finished`}
              />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {showGrade && (
            <div data-grade-line style={{ textAlign: 'right', marginRight: '6px' }}>
              <div style={{ fontSize: '11px', color: 'var(--mm-text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                {feedbackHeld && !finished ? 'Grade' : finished ? 'Your grade' : 'Grade so far'}
              </div>
              <div style={{ fontSize: '19px', fontWeight: 900, color: feedbackHeld && !finished ? 'var(--mm-primary-text)' : 'var(--mm-text-strong)' }}>
                {feedbackHeld && !finished ? 'Waiting for your teacher' : `${recordedGrade}%`}
              </div>
              {showClassroomGrade && (
                <div style={{ marginTop: 4, fontSize: 11.5, color: 'var(--mm-text-muted)', fontWeight: 800 }}>
                  Google Classroom shows {receipt.grade}%
                </div>
              )}
            </div>
          )}
          {onExportAssignmentPdf && !waiting && (
            <button
              type="button"
              disabled={exportingAssignmentId === assignment.id}
              onClick={() => exportPdf(assignment.id)}
              style={{ minHeight: 44, padding: '10px 14px', background: 'var(--mm-surface)', color: 'var(--mm-text)', border: '1px solid var(--mm-border-strong)', borderRadius: '8px', cursor: 'pointer', fontWeight: 800 }}
            >
              {exportingAssignmentId === assignment.id ? 'Preparing PDF…' : 'Export PDF'}
            </button>
          )}
          {finished && primaryButton('See results', () => openResult(assignment.id), 'results')}
          {closed && primaryButton('Try it again — no credit', () => onStartAssignment?.(assignment.id), 'again')}
          {isRecovery && primaryButton('Open Recovery', () => openResult(assignment.id), 'recovery')}
          {actionable && !isRecovery && primaryButton(
            questionsAttempted > 0 ? 'Continue' : 'Start',
            () => onStartAssignment?.(assignment.id, entry.nextQuestionIndex ?? 0),
            'start',
          )}
        </div>
      </article>
    );
  };

  const nothingElseToDo = !resumeAssignment && !activeDols.length && !activeWarmups.length
    && (!nextAction || NOTHING_ASSIGNED_KINDS.has(nextAction.kind));
  const saveTone = saveStatus ? SAVE_TONE[saveStatus.tone] || SAVE_TONE.saved : null;
  const openGrades = onNavigate ? () => onNavigate(STUDENT_DESTINATION.GRADES) : null;
  const raiseCount = Number(waysToRaise?.count) || 0;

  return (
    <div className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`} style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: supportPresentation.highContrast ? 'var(--mm-surface)' : 'var(--mm-surface-control)', minHeight: '100vh', padding: 'clamp(16px, 4vw, 34px) clamp(12px, 3vw, 20px)', fontSize: supportPresentation.largeText ? '120%' : undefined }}>
      <div style={{ maxWidth: '920px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mm-surface)', padding: 'clamp(14px, 3vw, 20px) clamp(14px, 3vw, 30px)', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: saveStatus ? '8px' : '20px', gap: '16px', flexWrap: 'wrap' }}>
          {/* Name and class period only. Nothing about a support plan is ever
              shown here: Home is the screen most often read over a shoulder. */}
          <div style={{ textAlign: 'left' }}><h1 style={{ margin: 0, color: 'var(--mm-primary)', fontSize: '25px' }}>Welcome, {formatStudentName(student, { lastFirst: false, neutralLabel: STUDENT_SELF_NEUTRAL_LABEL })}</h1><p style={{ margin: '4px 0 0', color: 'var(--mm-text-muted)' }}>{student.classPeriod}</p></div>
          {/*
            One navigation, shared with Assignments, Grades and My Math Path.
            These were four independently written buttons, which is how My Math
            Path ended up with an "Assignments" control that went to Home.
          */}
          <StudentGlobalNav
            current={STUDENT_DESTINATION.HOME}
            onNavigate={onNavigate}
            onLogout={onLogout}
            dense
          />
        </header>

        {saveStatus && saveStatus.text && (
          <p role="status" aria-live="polite" data-save-tone={saveStatus.tone} style={{ margin: '0 0 16px', padding: '0 4px', textAlign: 'left', fontSize: 13, fontWeight: 800, color: saveTone.color }}>
            <span aria-hidden="true">{saveTone.icon} </span>{saveStatus.text}
          </p>
        )}

        {/* Time-critical: the class is starting it now, so it stays on top. */}
        {liveChallengeInvite && ['invited', 'joined', 'running'].includes(liveChallengeInvite.status) && (
          <section style={{ marginBottom: '18px', padding: '20px 24px', borderRadius: '16px', background: 'var(--mm-primary-soft)', border: '3px solid #1a73e8', color: 'var(--mm-primary-text)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: '13px', fontWeight: 1000, textTransform: 'uppercase' }}>⚡ Live Challenge</div><h2 style={{ margin: '4px 0' }}>{liveChallengeInvite.title || 'Class Live Challenge'}</h2><p style={{ margin: 0 }}>{liveChallengeInvite.status === 'running' ? 'The challenge is running now.' : 'Your teacher opened the lobby. Join now so you are ready when Round 1 starts.'}{liveChallengeInvite.alias ? ` You will play as ${liveChallengeInvite.alias}.` : ''}</p></div>
            <button type="button" onClick={() => onOpenLiveChallenge?.()} style={{ minHeight: 44, padding: '13px 20px', border: 0, borderRadius: '10px', background: '#174ea6', color: '#fff', fontWeight: 900, fontSize: '16px' }}>{liveChallengeInvite.status === 'running' ? 'Join Challenge Now' : 'Enter Challenge Lobby'}</button>
          </section>
        )}

        {/* One answer, first on the page: the single primary action. */}
        {nextAction && (
          <WhatShouldIDoNow
            nextAction={nextAction}
            onStartAssignment={(assignment, questionIndex) => onStartAssignment(assignment.id, questionIndex || 0)}
            onOpenResult={openResult}
            onOpenMathPath={onOpenMathPath}
            countdownEndsAt={nextActionEndsAt}
            hideCountdowns={hideCountdowns}
            resume={nextAction.kind === 'resume' && resumeAssignment
              ? { questionLabel: resumeQuestionLabel, gradeText: resumeGradeText }
              : null}
          />
        )}

        {raiseCount > 0 && openGrades && (
          <button type="button" data-ways-to-raise onClick={openGrades} style={{ display: 'block', minHeight: 44, margin: '-10px 0 18px', padding: '8px 4px', border: 0, background: 'transparent', color: 'var(--mm-primary-text)', fontWeight: 900, fontSize: 14.5, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            {raiseCount} {raiseCount === 1 ? 'way' : 'ways'} to raise your grade →
          </button>
        )}

        {/* Other live work — never the one the card above already names. */}
        {secondaryWarmups.map(({ assignment, state, questionIndices = [], records = [] }) => (
          <section key={`warmup-${assignment.id}`} data-secondary-live="warmup" style={{ marginBottom: '14px', padding: '14px 18px', borderRadius: '12px', background: 'var(--mm-warning-bg)', border: '2px solid #f9ab00', color: 'var(--mm-warning-text)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>Warm-Up active now</div>
              <div style={{ fontWeight: 900, overflowWrap: 'anywhere' }}>{assignment.title}</div>
              {!hideCountdowns && <div style={{ fontWeight: 900 }}><DOLCountdown endsAt={state.endsAt} /> left</div>}
            </div>
            <button type="button" onClick={() => onStartAssignment(assignment.id, firstOpenLiveQuestionIndex({ indices: questionIndices, records, section: 'warmup' }) ?? 0)} style={{ minHeight: 44, padding: '10px 16px', border: '2px solid #b06000', borderRadius: '10px', background: 'var(--mm-surface)', color: 'var(--mm-warning-text)', fontWeight: 900 }}>Start Warm-Up</button>
          </section>
        ))}

        {secondaryDols.map(({ assignment, state, records = [] }) => (
          <section key={`dol-${assignment.id}`} data-secondary-live="dol" style={{ marginBottom: '14px', padding: '14px 18px', borderRadius: '12px', background: 'var(--mm-accent-soft)', border: '2px solid #9334e6', color: 'var(--mm-text)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>DOL open now</div>
              <div style={{ fontWeight: 900, overflowWrap: 'anywhere' }}>{assignment.title}</div>
              {!hideCountdowns && <div style={{ fontWeight: 900 }}><DOLCountdown endsAt={state.endsAt} /> left</div>}
            </div>
            <button type="button" onClick={() => onStartAssignment(assignment.id, firstOpenLiveQuestionIndex({ indices: state.questionIndices || [state.questionIndex], records, section: 'dol' }) ?? 0)} style={{ minHeight: 44, padding: '10px 16px', border: '2px solid #681da8', borderRadius: '10px', background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Start DOL</button>
          </section>
        ))}

        {/* A closed Warm-Up or DOL with a second try open. Below the live,
            timed cards (they close first) and above everything that waits:
            it was reachable only from View Results, and students missed it. */}
        {/* Each action appears once: a Recovery that is already the "Do
            this next" action is not listed again here. */}
        <RecoveryHomeSection
          opportunities={(recoveryOpportunities || []).filter((opportunity) => !(
            nextAction?.opensResult && opportunity.assignmentId === nextAction.assignment?.id
          ))}
          studentId={student?.id || null}
          onOpen={onOpenRecovery}
        />

        {showResumeCard && (
          <section aria-label="Resume assignment" data-secondary-live="resume" style={{ marginBottom: '14px', padding: '14px 18px', borderRadius: '12px', background: 'var(--mm-surface)', border: '2px solid var(--mm-primary-border)', color: 'var(--mm-text)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', color: 'var(--mm-primary-text)' }}>Pick up where you left off</div>
              <div style={{ fontWeight: 900, overflowWrap: 'anywhere' }}>{resumeAssignment.title}</div>
              <div style={{ fontSize: 13, color: 'var(--mm-text-muted)' }}>
                Continue at {resumeQuestionLabel}. Your answers are kept as you go.
                {resumeGradeText ? ` ${resumeGradeText}.` : ''}
                {' '}{resumeLifecycle.isLate ? `Late · ${formatRemainingTime(resumeLifecycle.millisecondsRemaining)} until it closes` : `Due ${studentDueDateLines(resumeAssignment, resumeLifecycle).dueText}`}
              </div>
            </div>
            <button type="button" onClick={() => onStartAssignment(resumeAssignment.id, resumeQuestionIndex)} style={{ minHeight: 44, padding: '10px 16px', border: '2px solid var(--mm-primary-border)', borderRadius: '10px', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 900 }}>Continue</button>
          </section>
        )}

        {visibleAssignments.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="Nothing assigned yet"
            message={`No assignments have been given to ${student.classPeriod} yet. Anything your teacher publishes will show up here automatically.`}
          />
        ) : (
          <>
            {/* GROUPS, NOT ONE LONG LIST.
                Three headings works at four assignments and stops working at
                twenty-two, which is a normal amount of work by November. The
                ones a student must act on are open; the rest show their count
                and open on one press. */}
            {BUCKET_ORDER.map((bucket) => (
              <AssignmentGroup
                key={bucket}
                bucket={bucket}
                label={BUCKET_LABEL[bucket]}
                entries={(groups && groups[bucket]) || []}
                defaultOpen={BUCKET_OPEN_BY_DEFAULT[bucket]}
                hint={GROUP_HINTS[bucket] || null}
                renderEntry={renderAssignmentCard}
              />
            ))}

            {/* Every group empty AND nothing assigned to do now: a real state
                that deserves a sentence. Never under a Resume or a live card. */}
            {nothingElseToDo && BUCKET_ORDER.every((bucket) => !((groups && groups[bucket]) || []).length) && (
              <EmptyState
                icon="✅"
                title="Nothing waiting"
                message="You have no assignments open right now. My Math Path is always there when you want to keep going."
              />
            )}
          </>
        )}

        {whatChangedPanel}

        {/* Rewards come after the work, never between the student and it. */}
        {rewardWallet && onOpenRewards && (
          <RewardsSummaryCard wallet={rewardWallet} hasNew={hasNewRewards} onOpen={onOpenRewards} />
        )}
        {classPoints && <ClassPointsCelebrations announcements={classPoints.announcements} />}

        {/* Below the assigned work, never above it: teacher assignments are
            the classroom contract, this is the student's own time. */}
        <RecommendedSkills
          student={recommended.student}
          assignments={recommended.assignments}
          courseId={recommended.courseId}
          pacing={recommended.pacing}
          pathOptions={recommended.pathOptions}
          onChooseSkill={recommended.onChooseSkill}
        />

        <BuildStamp />
      </div>
    </div>
  );
}
