import React from 'react';
import { EmptyState, ProgressBar, StatCard } from '../../ui/primitives';
import RecommendedSkills from './RecommendedSkills.jsx';
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
  // { id, classPeriod, inclusionStatus }
  student,
  supportPresentation = {},
  onStartAssignment,
  onOpenMathPath = null,
  onOpenSecureExams = null,
  onLogout = null,
  // Everything Recommended for You needs, passed through rather than rebuilt.
  recommended = {},
}) {
  const {
    visibleAssignments, resumeAssignment, resumeQuestionIndex, resumeLifecycle,
    activeDols, doNowEntries, comingUpEntries, completedEntries,
  } = dashboard;

  const renderAssignmentCard = ({ assignment, isAttempted, lifecycle, access, recordedGrade, activity, classwork, dol, disabled, feedbackHeld, questionsTotal, questionsDone }) => {
    const statusStyle = lifecycle.isPracticeOnly ? { border: '#5f6368', bg: '#f1f3f4', color: '#3c4043', label: 'Practice only' } : lifecycle.isLate ? { border: '#f9ab00', bg: '#fff4ce', color: '#7a4f00', label: 'Late' } : lifecycle.isScheduled ? { border: '#9aa0a6', bg: '#f1f3f4', color: '#3c4043', label: 'Scheduled' } : { border: '#d8dde6', bg: '#e6f4ea', color: '#137333', label: 'On time' };
    return (
      <article key={assignment.id} style={{ background: '#fff', padding: '21px 26px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap', border: `2px solid ${statusStyle.border}` }}>
        <div style={{ textAlign: 'left', flex: '1 1 470px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}><h3 style={{ margin: 0, color: '#202124' }}>{assignment.title}</h3><span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', padding: '4px 8px', borderRadius: '999px', background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span><span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6' }}>{assignment.assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : 'PRACTICE'}</span>{assignment.variantMode === 'shared' && <span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: '#e6f4ea', color: '#137333' }}>SAME CLASS VERSION</span>}</div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
          {isAttempted && <div style={{ textAlign: 'right' }}><div style={{ fontSize: '11px', color: '#5f6368', textTransform: 'uppercase', fontWeight: 'bold' }}>{feedbackHeld && !lifecycle.isPracticeOnly ? 'Grade status' : lifecycle.isPracticeOnly ? 'Frozen grade' : 'Current grade'}</div><div style={{ fontSize: '19px', fontWeight: 900, color: feedbackHeld && !lifecycle.isPracticeOnly ? '#174ea6' : recordedGrade >= 70 ? '#188038' : '#202124' }}>{feedbackHeld && !lifecycle.isPracticeOnly ? 'Awaiting teacher release' : `${recordedGrade}%`}</div></div>}
          <button disabled={disabled} onClick={() => onStartAssignment(assignment.id)} style={{ padding: '10px 20px', background: disabled ? '#dadce0' : lifecycle.isPracticeOnly ? '#5f6368' : lifecycle.isLate ? '#8a5a00' : '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>{lifecycle.isPracticeOnly ? 'Practice — No Credit' : lifecycle.isLate ? 'Continue Late Work' : disabled ? 'Locked' : isAttempted ? 'Continue' : 'Start'}</button>
        </div>
      </article>
    );
  };

  return (
    <div className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`} style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: supportPresentation.highContrast ? '#fff' : '#f0f2f5', minHeight: '100vh', padding: '34px 20px', fontSize: supportPresentation.largeText ? '120%' : undefined }}>
      <div style={{ maxWidth: '920px', margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '20px 30px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '24px', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'left' }}><h1 style={{ margin: 0, color: '#1a73e8', fontSize: '25px' }}>Welcome, {student.id}</h1><p style={{ margin: '4px 0 0', color: '#5f6368' }}>{student.classPeriod}{student.inclusionStatus ? ' · Inclusion supports active' : ''}</p></div>
          <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onOpenMathPath?.()} style={{ padding: '9px 15px', background: '#174ea6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>My Math Path</button>
            <button type="button" onClick={() => onOpenSecureExams?.()} style={{ padding: '9px 15px', background: '#3c4043', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>Secure Exams</button>
            <button type="button" onClick={onLogout} style={{ padding: '8px 16px', background: '#f1f3f4', color: '#5f6368', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
          </div>
        </header>

        {activeDols.map(({ assignment, state }) => (
          <section key={assignment.id} style={{ marginBottom: '18px', padding: '22px 25px', borderRadius: '16px', background: '#f3e8fd', border: '3px solid #9334e6', color: '#4a126b', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase' }}>DOL available now</div><h2 style={{ margin: '4px 0' }}>{assignment.title} · Question {state.questionIndex + 1}</h2><p style={{ margin: 0 }}>Submit this question before class ends for today&apos;s DOL grade.</p>{!supportPresentation.hideCountdowns && <div style={{ marginTop: '8px', fontSize: '22px', fontWeight: 1000 }}>{formatRemainingTime(state.millisecondsRemaining)} remaining</div>}</div>
            <button onClick={() => onStartAssignment(assignment.id, state.questionIndex)} style={{ padding: '13px 20px', border: 0, borderRadius: '10px', background: '#681da8', color: '#fff', fontWeight: 900, fontSize: '16px' }}>Open DOL</button>
          </section>
        ))}

        {resumeAssignment && (
          <section aria-label="Resume assignment" style={{ marginBottom: '28px', padding: '28px 30px', borderRadius: '18px', background: 'linear-gradient(135deg, #174ea6 0%, #1a73e8 62%, #4f8fe8 100%)', color: '#fff', boxShadow: '0 16px 38px rgba(26,115,232,0.28)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '24px', flexWrap: 'wrap', textAlign: 'left' }}>
            <div style={{ flex: '1 1 450px' }}><div style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.82, marginBottom: '7px' }}>Resume Action</div><h2 style={{ margin: 0, fontSize: 'clamp(25px, 4vw, 38px)', lineHeight: 1.12 }}>Resume {resumeAssignment.title}</h2><p style={{ margin: '10px 0 0', fontSize: '17px', lineHeight: 1.5, opacity: 0.94 }}>Continue at Question {resumeQuestionIndex + 1}. Your typed responses, plotted points, graph sketch, endpoint symbols, multipart analysis, and algebra work are restored from this browser.</p><div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 'bold', opacity: 0.88 }}>{resumeLifecycle.isClosed ? 'Permanently closed · review saved work' : resumeLifecycle.isLate ? `Late · ${formatRemainingTime(resumeLifecycle.millisecondsRemaining)} until final close` : `Due ${formatDueDate(resumeAssignment)}`}</div></div>
            <button type="button" onClick={() => onStartAssignment(resumeAssignment.id, resumeQuestionIndex)} style={{ padding: '15px 24px', border: 'none', borderRadius: '12px', background: '#fff', color: '#174ea6', fontSize: '17px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>{resumeLifecycle.isClosed ? 'Review Question' : 'Resume Question'} {resumeQuestionIndex + 1} →</button>
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
            {/* At-a-glance counts, so a student can see what is waiting
                without reading three lists first. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '26px' }}>
              <StatCard label="Do now" value={doNowEntries.length} tone={doNowEntries.length > 0 ? 'warning' : 'success'} hint={doNowEntries.length ? 'Needs attention' : 'All caught up'} />
              <StatCard label="Coming up" value={comingUpEntries.length} tone="primary" />
              <StatCard label="Completed" value={completedEntries.length} tone="success" />
            </div>

            <h2 style={{ color: '#202124', textAlign: 'left' }}>Do Now</h2>
            {doNowEntries.length === 0 ? (
              <EmptyState icon="✅" title="All caught up" message="Nothing needs your attention right now. Check Coming Up for what's next." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '10px' }}>{doNowEntries.map(renderAssignmentCard)}</div>
            )}

            <h2 style={{ color: '#202124', textAlign: 'left', marginTop: '30px' }}>Coming Up</h2>
            {comingUpEntries.length === 0 ? (
              <EmptyState icon="📅" title="Nothing else scheduled" message="When your teacher schedules more work, it will appear here before it opens." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '10px' }}>{comingUpEntries.map(renderAssignmentCard)}</div>
            )}

            {completedEntries.length > 0 && (
              <details style={{ marginTop: '30px', textAlign: 'left' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 900, fontSize: '19px', color: '#202124', padding: '4px 0' }}>Completed ({completedEntries.length})</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>{completedEntries.map(renderAssignmentCard)}</div>
              </details>
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
