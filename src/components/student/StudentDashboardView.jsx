import React, { useState } from 'react';
import { EmptyState, ProgressBar } from '../../ui/primitives';
import RecommendedSkills from './RecommendedSkills.jsx';
import AssignmentGroup from './AssignmentGroup.jsx';
import WhatShouldIDoNow from './WhatShouldIDoNow.jsx';
import { BUCKET_LABEL, BUCKET_OPEN_BY_DEFAULT, BUCKET_ORDER } from '../../studentDashboardModel.js';
import DOLCountdown from './DOLCountdown.jsx';
import { formatDateTime, formatRemainingTime } from '../../assignmentLifecycle';

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

const formatDueDate = (assignmentOrValue) => (
  assignmentOrValue && typeof assignmentOrValue === 'object'
    ? formatDateTime(assignmentOrValue.dueAt || assignmentOrValue.dueDate)
    : formatDateTime(assignmentOrValue)
);

const formatLateDueDate = (assignment) => formatDateTime(
  assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate,
);

const formatTime = (seconds) => {
  if (!seconds) return '0s';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`;
};

export default function StudentDashboardView({
  // Exactly what buildStudentDashboardModel returned.
  dashboard,
  // { id, displayName, classPeriod, inclusionStatus }
  student,
  supportPresentation = {},
  onStartAssignment,
  onExportAssignmentPdf = null,
  onOpenMathPath = null,
  onOpenSecureExams = null,
  // The single answer to "what should I do now?", already decided by
  // resolveNextAction. Null in contexts that render the list alone.
  nextAction = null,
  liveChallengeInvite = null,
  onOpenLiveChallenge = null,
  onLogout = null,
  // Everything Recommended for You needs, passed through rather than rebuilt.
  recommended = {},
}) {
  const {
    visibleAssignments, resumeAssignment, resumeQuestionIndex, resumeLifecycle,
    activeDols, doNowEntries, comingUpEntries, completedEntries, groups,
  } = dashboard;

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

  // A group is only worth a heading when it has something in it. Six headings
  // reading "0 items" looks like a system with nothing to offer.
  const GROUP_HINTS = {
    pastDue: 'Late work is still open and still counts.',
    practice: 'Past its due date, so it no longer changes your grade — but the practice still counts toward what you know.',
  };

  const renderAssignmentCard = ({ assignment, isAttempted, lifecycle, access, recordedGrade, activity, classwork, dol, disabled, feedbackHeld, questionsTotal, questionsDone }) => {
    const statusStyle = lifecycle.isPracticeOnly ? { border: '#5f6368', bg: '#f1f3f4', color: '#3c4043', label: 'Practice only' } : lifecycle.isLate ? { border: '#f9ab00', bg: '#fff4ce', color: '#7a4f00', label: 'Late' } : lifecycle.isScheduled ? { border: '#9aa0a6', bg: '#f1f3f4', color: '#3c4043', label: 'Scheduled' } : { border: '#d8dde6', bg: '#e6f4ea', color: '#137333', label: 'On time' };
    return (
      <article key={assignment.id} style={{ background: '#fff', padding: '21px 26px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap', border: `2px solid ${statusStyle.border}` }}>
        <div style={{ textAlign: 'left', flex: '1 1 470px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}><h3 style={{ margin: 0, color: '#202124' }}>{assignment.title}</h3><span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', padding: '4px 8px', borderRadius: '999px', background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span><span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6' }}>{assignment.assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : 'PRACTICE'}</span>{Object.keys(assignment.sectionVariantModes || {}).length > 0 ? <span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: '#f3e8fd', color: '#681da8' }}>SECTION-SPECIFIC VERSIONS</span> : assignment.variantMode === 'shared' && <span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: '#e6f4ea', color: '#137333' }}>SAME CLASS VERSION</span>}</div>
          <div style={{ color: '#5f6368', fontSize: '13px', lineHeight: 1.55 }}>Regular due: {formatDueDate(assignment)} · Final late due: {formatLateDueDate(assignment)}{lifecycle.isLate && <><br /><strong style={{ color: '#7a4f00' }}>Late work remains open for {formatRemainingTime(lifecycle.millisecondsRemaining)}.</strong></>}{!access.open && <><br /><strong style={{ color: '#a50e0e' }}>Complete the prerequisite notes/classwork first. It opens automatically at {formatDateTime(assignment.releaseAt)} if not completed.</strong></>}{assignment.assignmentType === 'notesClasswork' && <><br />Engaged: {formatTime(activity.totalTimeSeconds || 0)} · Daily grade: {classwork?.score === 100 ? '100 — prerequisite met' : 'In progress'}</>}{dol.enabled && dol.status === 'waiting' && <><br />DOL opens during the final {assignment.dol?.minutesBeforeEnd || 10} minutes of class.</>}</div>
          {questionsTotal > 0 && assignment.assignmentType !== 'notesClasswork' && (
            <div style={{ marginTop: '12px', maxWidth: '340px' }}>
              <ProgressBar
                value={questionsDone}
                max={questionsTotal}
                label={`${questionsDone} of ${questionsTotal} question${questionsTotal === 1 ? '' : 's'} finished`}
              />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isAttempted && <div style={{ textAlign: 'right', marginRight: '6px' }}><div style={{ fontSize: '11px', color: '#5f6368', textTransform: 'uppercase', fontWeight: 'bold' }}>{feedbackHeld && !lifecycle.isPracticeOnly ? 'Grade status' : lifecycle.isPracticeOnly ? 'Frozen grade' : 'Current grade'}</div><div style={{ fontSize: '19px', fontWeight: 900, color: feedbackHeld && !lifecycle.isPracticeOnly ? '#174ea6' : recordedGrade >= 70 ? '#188038' : '#202124' }}>{feedbackHeld && !lifecycle.isPracticeOnly ? 'Awaiting teacher release' : `${recordedGrade}%`}</div></div>}
          <button
            type="button"
            disabled={disabled || !onExportAssignmentPdf || exportingAssignmentId === assignment.id}
            onClick={() => exportPdf(assignment.id)}
            style={{ padding: '10px 16px', background: '#fff', color: disabled ? '#9aa0a6' : '#174ea6', border: `2px solid ${disabled ? '#dadce0' : '#aecbfa'}`, borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 900 }}
          >
            {exportingAssignmentId === assignment.id ? 'Preparing PDF…' : 'Export PDF'}
          </button>
          <button disabled={disabled} onClick={() => onStartAssignment(assignment.id)} style={{ padding: '10px 20px', background: disabled ? '#dadce0' : lifecycle.isPracticeOnly ? '#5f6368' : lifecycle.isLate ? '#8a5a00' : '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>{lifecycle.isPracticeOnly ? 'Practice — No Credit' : lifecycle.isLate ? 'Continue Late Work' : disabled ? 'Locked' : isAttempted ? 'Continue' : 'Start'}</button>
        </div>
      </article>
    );
  };

  return (
    <div className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`} style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: supportPresentation.highContrast ? '#fff' : '#f0f2f5', minHeight: '100vh', padding: '34px 20px', fontSize: supportPresentation.largeText ? '120%' : undefined }}>
      <div style={{ maxWidth: '920px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '20px 30px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '24px', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'left' }}><h1 style={{ margin: 0, color: '#1a73e8', fontSize: '25px' }}>Welcome, {student.displayName || student.id}</h1><p style={{ margin: '4px 0 0', color: '#5f6368' }}>{student.classPeriod}{student.inclusionStatus ? ' · Inclusion supports active' : ''}</p></div>
          <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onOpenMathPath?.()} style={{ padding: '9px 15px', background: '#174ea6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>My Math Path</button>
            <button type="button" onClick={() => onOpenSecureExams?.()} style={{ padding: '9px 15px', background: '#3c4043', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>Secure Exams</button>
            <button type="button" onClick={onLogout} style={{ padding: '8px 16px', background: '#f1f3f4', color: '#5f6368', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
          </div>
        </header>

        {liveChallengeInvite && ['invited', 'joined', 'running'].includes(liveChallengeInvite.status) && (
          <section style={{ marginBottom: '18px', padding: '20px 24px', borderRadius: '16px', background: '#e8f0fe', border: '3px solid #1a73e8', color: '#174ea6', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: '13px', fontWeight: 1000, textTransform: 'uppercase' }}>⚡ Live Challenge</div><h2 style={{ margin: '4px 0' }}>{liveChallengeInvite.title || 'Class Live Challenge'}</h2><p style={{ margin: 0 }}>{liveChallengeInvite.status === 'running' ? 'The challenge is running now.' : 'Your teacher opened the lobby. Join now so you are ready when Round 1 starts.'}{liveChallengeInvite.alias ? ` You will play as ${liveChallengeInvite.alias}.` : ''}</p></div>
            <button type="button" onClick={() => onOpenLiveChallenge?.()} style={{ padding: '13px 20px', border: 0, borderRadius: '10px', background: '#174ea6', color: '#fff', fontWeight: 900, fontSize: '16px' }}>{liveChallengeInvite.status === 'running' ? 'Join Challenge Now' : 'Enter Challenge Lobby'}</button>
          </section>
        )}

        {/* One answer, above everything else on the page. */}
        {nextAction && (
          <WhatShouldIDoNow
            nextAction={nextAction}
            onStartAssignment={(assignment, questionIndex) => onStartAssignment(assignment.id, questionIndex || 0)}
            onOpenMathPath={onOpenMathPath}
          />
        )}

        {activeDols.map(({ assignment, state }) => (
          <section key={assignment.id} style={{ marginBottom: '18px', padding: '22px 25px', borderRadius: '16px', background: '#f3e8fd', border: '3px solid #9334e6', color: '#4a126b', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase' }}>DOL available now</div><h2 style={{ margin: '4px 0' }}>{assignment.title} · DOL section</h2><p style={{ margin: 0 }}>Complete all {(state.questionIndices || [state.questionIndex]).length} DOL question{(state.questionIndices || [state.questionIndex]).length === 1 ? '' : 's'} before the timer reaches zero.</p>{!supportPresentation.hideCountdowns && <div style={{ marginTop: '8px', fontSize: '22px', fontWeight: 1000 }}><DOLCountdown endsAt={state.endsAt} /> remaining</div>}</div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" disabled={!onExportAssignmentPdf || exportingAssignmentId === assignment.id} onClick={() => exportPdf(assignment.id)} style={{ padding: '12px 16px', border: '2px solid #9334e6', borderRadius: '10px', background: '#fff', color: '#681da8', fontWeight: 900 }}>{exportingAssignmentId === assignment.id ? 'Preparing PDF…' : 'Export PDF'}</button>
              <button onClick={() => onStartAssignment(assignment.id, (state.questionIndices || [state.questionIndex])[0])} style={{ padding: '13px 20px', border: 0, borderRadius: '10px', background: '#681da8', color: '#fff', fontWeight: 900, fontSize: '16px' }}>Start DOL Now</button>
            </div>
          </section>
        ))}

        {resumeAssignment && (
          <section aria-label="Resume assignment" style={{ marginBottom: '28px', padding: '28px 30px', borderRadius: '18px', background: 'linear-gradient(135deg, #174ea6 0%, #1a73e8 62%, #4f8fe8 100%)', color: '#fff', boxShadow: '0 16px 38px rgba(26,115,232,0.28)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '24px', flexWrap: 'wrap', textAlign: 'left' }}>
            <div style={{ flex: '1 1 450px' }}><div style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.82, marginBottom: '7px' }}>Resume Action</div><h2 style={{ margin: 0, fontSize: 'clamp(25px, 4vw, 38px)', lineHeight: 1.12 }}>Resume {resumeAssignment.title}</h2><p style={{ margin: '10px 0 0', fontSize: '17px', lineHeight: 1.5, opacity: 0.94 }}>Continue at Question {resumeQuestionIndex + 1}. Your typed responses, plotted points, graph sketch, endpoint symbols, multipart analysis, and algebra work are restored from this browser.</p><div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 'bold', opacity: 0.88 }}>{resumeLifecycle.isClosed ? 'Permanently closed · review saved work' : resumeLifecycle.isLate ? `Late · ${formatRemainingTime(resumeLifecycle.millisecondsRemaining)} until final close` : `Due ${formatDueDate(resumeAssignment)}`}</div></div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" disabled={!onExportAssignmentPdf || exportingAssignmentId === resumeAssignment.id} onClick={() => exportPdf(resumeAssignment.id)} style={{ padding: '13px 18px', border: '2px solid rgba(255,255,255,0.76)', borderRadius: '12px', background: 'transparent', color: '#fff', fontSize: '15px', fontWeight: 900, cursor: 'pointer' }}>{exportingAssignmentId === resumeAssignment.id ? 'Preparing PDF…' : 'Export PDF'}</button>
              <button type="button" onClick={() => onStartAssignment(resumeAssignment.id, resumeQuestionIndex)} style={{ padding: '15px 24px', border: 'none', borderRadius: '12px', background: '#fff', color: '#174ea6', fontSize: '17px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>{resumeLifecycle.isClosed ? 'Review Question' : 'Resume Question'} {resumeQuestionIndex + 1} →</button>
            </div>
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

            {/* Every group empty is a real state and deserves a sentence, not a
                blank space where the work would be. */}
            {BUCKET_ORDER.every((bucket) => !((groups && groups[bucket]) || []).length) && (
              <EmptyState
                icon="✅"
                title="Nothing waiting"
                message="You have no assignments open right now. My Math Path is always there when you want to keep going."
              />
            )}
          </>
        )}

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
      </div>
    </div>
  );
}
