import React from 'react';
import GradeSectionBreakdown from './GradeSectionBreakdown.jsx';
import TestCycleGradeBreakdown from './TestCycleGradeBreakdown.jsx';
import { GRADE_STATUS } from '../../platform/student/studentGradeCenterModel.js';
import { describeClassroomReceipt } from '../../platform/classroom/classroomReceiptPresentation.js';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import { LEVEL, resolveBack } from '../../platform/student/navigationModel.js';
import { formatDateTime } from '../../assignmentLifecycle';

/*
 * ONE ASSIGNMENT'S RESULT.
 *
 * This is where a closed Google Classroom link lands. Before it existed, a
 * student who tapped a Classroom post for work that had already closed arrived
 * on the work screen with every control disabled: no grade, no explanation, and
 * no route anywhere else in MathMaster. The deep link was a dead end, and the
 * one number the student opened it for was the one thing not on the page.
 *
 * So this screen answers, in order: what did I get, on which parts, is it final,
 * what does Google Classroom show, and what can I still do?
 *
 * PRACTICE IS AN ACTION, NOT AN ARRIVAL.
 *
 * The grade shown here is the frozen one, read from the canonical tracker. The
 * Practice button starts a session against a SEPARATE practice tracker, which
 * this screen never reads. That is why practising cannot move the number above
 * it — not because the button is careful, but because the two are different
 * data and only one of them is a grade.
 *
 * WHAT "REVIEW MY WORK" HONESTLY IS, ON A CLOSED ASSIGNMENT.
 *
 * MathMaster has no read-only replay of a student's recorded keystrokes, and
 * after the final deadline the workspace opens in Practice Mode with a fresh
 * tracker. So Review reopens every question WITH its solutions — which is a
 * real thing to do and the thing a student asks for — and the copy beside it
 * says plainly that their old answers are not replayed and that the section
 * scores above are the record. A button promising a replay that does not exist
 * would be the same dishonesty as a fake zero, wearing different clothes.
 */

const actionStyle = (primary) => ({
  appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
  minHeight: MIN_TOUCH_TARGET_PX, padding: '12px 18px', borderRadius: 10,
  fontWeight: 900, fontSize: 15, cursor: 'pointer', flex: '1 1 180px',
  border: primary ? 0 : '2px solid #c9ced6',
  background: primary ? '#174ea6' : '#fff',
  color: primary ? '#fff' : '#3c4043',
});

export default function StudentAssignmentResult({
  entry,
  // The Classroom section a split link arrived through, when there was one.
  sectionLabel = null,
  supportPresentation = {},
  onReviewWork = null,
  onPractice = null,
  onViewAllGrades = null,
  onViewAllAssignments = null,
  onBackToHome = null,
  /*
   * WHICH LIST SENT THE STUDENT HERE.
   *
   * The same result is reachable from Assignments, from Grades, and from a
   * Google Classroom link. Browser Back pops to whichever of those preceded it
   * for free; the visible Back control has to be told, or it picks one and is
   * wrong for half of the students who arrive.
   */
  origin = LEVEL.ASSIGNMENTS,
}) {
  const cameFromGrades = origin === LEVEL.GRADES;
  // The label comes from the navigation model, which owns the rule that a Back
  // control names its destination rather than its direction.
  const back = resolveBack(LEVEL.ASSIGNMENT_RESULT, { origin });
  const backLabel = `← ${back?.label || 'Back'}`;
  const onBackToOrigin = cameFromGrades ? onViewAllGrades : onViewAllAssignments;
  if (!entry) {
    return (
      <main style={{ minHeight: '100vh', background: '#f0f2f5', padding: '28px 16px', fontFamily: '"Segoe UI", sans-serif' }}>
        <section style={{ maxWidth: 680, margin: '0 auto', padding: 22, borderRadius: 14, background: '#fff', border: '1px solid #d8dde6', textAlign: 'left' }}>
          <h1 style={{ marginTop: 0, fontSize: 21, color: '#202124' }}>That assignment is not available</h1>
          <p style={{ color: '#5f6368', lineHeight: 1.55 }}>
            This assignment is not assigned to your MathMaster class, or it has been removed. Your other grades are still here.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button type="button" style={actionStyle(true)} onClick={() => onViewAllAssignments?.()}>View All Assignments</button>
            <button type="button" style={actionStyle(false)} onClick={() => onViewAllGrades?.()}>View All Grades</button>
            <button type="button" style={actionStyle(false)} onClick={() => onBackToHome?.()}>Back to Home</button>
          </div>
        </section>
      </main>
    );
  }

  const receipt = describeClassroomReceipt({
    receipt: entry.classroomReceipt,
    mathMasterGrade: entry.overall?.score,
  });

  const gradeHeadline = entry.status === GRADE_STATUS.PENDING_GRADE
    ? 'Awaiting teacher release'
    : entry.displayGrade === null
      ? 'No recorded grade'
      : `${entry.displayGrade}%`;

  const statusLine = entry.frozen
    ? `Assignment closed ${formatDateTime(entry.lateDueAt)}`
    : entry.lifecycle?.isLate
      ? `Late work open until ${formatDateTime(entry.lateDueAt)}`
      : `Due ${formatDateTime(entry.dueAt)}`;

  return (
    <main
      className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      style={{
        minHeight: '100vh', background: supportPresentation.highContrast ? '#fff' : '#f0f2f5',
        padding: '20px 14px 48px', fontFamily: '"Segoe UI", sans-serif',
        fontSize: supportPresentation.largeText ? '120%' : undefined,
      }}
    >
      <section
        aria-label="Assignment result"
        style={{
          maxWidth: 760, margin: '0 auto', padding: '20px 18px', borderRadius: 14,
          background: '#fff', border: '1px solid #d8dde6', textAlign: 'left', minWidth: 0,
        }}
      >
        {/*
          The visible Back goes wherever browser Back goes. A student who opened
          this from Grades and is returned to Assignments has been told their
          own navigation lied to them, which is how a student stops using it.
        */}
        <button
          type="button"
          onClick={() => onBackToOrigin?.()}
          style={{
            appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
            minHeight: MIN_TOUCH_TARGET_PX, padding: '10px 14px', marginBottom: 12,
            borderRadius: 10, border: '2px solid #c9ced6', background: '#fff',
            color: '#3c4043', fontWeight: 900, fontSize: 14, cursor: 'pointer',
          }}
        >
          {backLabel}
        </button>

        <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5f6368' }}>
          {entry.frozen ? 'Recorded MathMaster result' : 'MathMaster result so far'}
          {sectionLabel ? ` · ${sectionLabel}` : ''}
        </div>
        <h1 style={{ margin: '8px 0 4px', fontSize: 'clamp(20px, 6vw, 26px)', color: '#202124', overflowWrap: 'anywhere' }}>
          {entry.title}
        </h1>
        <div style={{ fontSize: 13, color: '#5f6368' }}>{statusLine}</div>

        <div style={{ marginTop: 16, padding: '16px 16px 14px', borderRadius: 12, background: '#e8f0fe' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.05em', textTransform: 'uppercase', color: '#174ea6' }}>
            {entry.frozen ? 'Your grade · frozen' : 'Your grade'}
          </div>
          <div style={{ marginTop: 4, fontSize: 'clamp(28px, 9vw, 40px)', fontWeight: 1000, lineHeight: 1.05, color: '#174ea6', overflowWrap: 'anywhere' }}>
            {gradeHeadline}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: '#174ea6' }}>{entry.statusLabel}</div>
          {entry.exclusionText && (
            <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: '#3c4043' }}>{entry.exclusionText}</p>
          )}
        </div>

        <GradeSectionBreakdown sections={entry.sections} />
        <TestCycleGradeBreakdown entry={entry} />

        {/* Feedback/release state, said plainly, because "no number yet" and
            "you scored nothing" are opposite messages. */}
        {entry.feedbackHeld && (
          <p style={{ margin: '14px 0 0', padding: '12px 14px', borderRadius: 10, background: '#fff8df', border: '1px solid #f9ab00', fontSize: 13, lineHeight: 1.55, color: '#5f4400' }}>
            Your teacher is holding feedback on this assignment. Your work is recorded — the grade appears here as soon as it is released, and it is not counted as a zero in the meantime.
          </p>
        )}

        {receipt.present && receipt.grade !== null && (
          <p style={{ margin: '14px 0 0', padding: '12px 14px', borderRadius: 10, background: '#f8f9fa', border: '1px solid #e4e7ec', fontSize: 13, lineHeight: 1.55, color: '#3c4043' }}>
            {receipt.studentVisible ? 'Google Classroom shows' : 'Classroom teacher draft'}: {receipt.grade}% · {receipt.label}
            {!receipt.isFinal && !receipt.matchesMathMaster && (
              <> Your MathMaster grade has changed; Classroom updates at the next checkpoint.</>
            )}
          </p>
        )}

        {entry.frozen && (
          <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.55, color: '#5f6368' }}>
            This assignment is past its final deadline, so the grade above can no longer change. Opening it again gives you every question with full solutions — your recorded answers are not replayed, and the scores above are the record. Nothing you do there changes this grade, your evidence, your mastery, or your Google Classroom score.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          {entry.reviewAvailable && (
            <button type="button" style={actionStyle(false)} onClick={() => onReviewWork?.(entry.assignmentId)}>
              Review My Work
            </button>
          )}
          {entry.practiceAvailable && (
            <button type="button" style={actionStyle(true)} onClick={() => onPractice?.(entry.assignmentId)}>
              {sectionLabel ? `Practice ${sectionLabel}` : 'Practice This Skill'}
            </button>
          )}
          {/* Both lists, always. A Google Classroom deep link arrives with no
              origin a student chose, and either answer may be the one they
              want next. */}
          <button type="button" style={actionStyle(false)} onClick={() => onViewAllAssignments?.()}>
            All Assignments
          </button>
          <button type="button" style={actionStyle(false)} onClick={() => onViewAllGrades?.()}>
            View All Grades
          </button>
        </div>
      </section>
    </main>
  );
}
