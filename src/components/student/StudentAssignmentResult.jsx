import React from 'react';
import GradeSectionBreakdown from './GradeSectionBreakdown.jsx';
import TestCycleGradeBreakdown from './TestCycleGradeBreakdown.jsx';
import { GRADE_STATUS } from '../../platform/student/studentGradeCenterModel.js';
import { describeClassroomReceipt } from '../../platform/classroom/classroomReceiptPresentation.js';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';
import { LEVEL, resolveBack } from '../../platform/student/navigationModel.js';
import { RESULT_STEP, describeResultNextStep, tryAgainLabel } from '../../platform/student/studentResultNextStep.js';
import { formatDateTime } from '../../assignmentLifecycle';

/*
 * ONE ASSIGNMENT'S RESULT — AND WHAT TO DO NEXT.
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
 * It is also where "nothing open right now" lands (App's startAssignment opens
 * it when no question is workable this minute). So the next step comes from
 * the one "Today" rule (describeResultNextStep): Start/Continue when something
 * is open now, a section-by-section "what opens when" when nothing is, and an
 * Up next card (or Home) once this assignment asks nothing more.
 *
 * TRYING CLOSED WORK AGAIN IS AN ACTION, NOT AN ARRIVAL.
 *
 * The grade shown here is the frozen one, read from the canonical tracker. The
 * "Try it again — no credit" button starts a session against a SEPARATE
 * practice tracker, which this screen never reads. That is why retrying cannot
 * move the number above it — not because the button is careful, but because
 * the two are different data and only one of them is a grade. (It is never
 * labelled "Practice": in student copy that word means only the lesson's
 * Practice section.)
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
 *
 * When the caller hands in a `reviewPanel` (a read-only review of the
 * student's own recorded work), that panel IS the review, and the old copy
 * claiming answers are not replayed would now be false — so it is not shown.
 */

const actionStyle = (primary) => ({
  appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
  minHeight: MIN_TOUCH_TARGET_PX, padding: '12px 18px', borderRadius: 10,
  fontWeight: 900, fontSize: 15, cursor: 'pointer', flex: '1 1 180px',
  border: primary ? 0 : '2px solid var(--mm-border)',
  background: primary ? '#174ea6' : 'var(--mm-surface)',
  color: primary ? '#fff' : 'var(--mm-text)',
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
  // Practice-based Recovery for a closed Warm-Up/DOL, when the student has
  // one (SectionRecoveryPanel). Null for everyone else.
  recoveryPanel = null,
  // The dashboard entry for this assignment (the one "Today" rule): whether
  // anything is open now, where Continue lands, what a wait is waiting for,
  // and each section's state. Null when the dashboard does not list it.
  todayEntry = null,
  // Start/Continue: (assignmentId, questionIndex) — lands on
  // todayEntry.nextQuestionIndex.
  onContinue = null,
  // resolveUpNext({ dashboard, assignmentId }): the next piece of work once
  // this one asks nothing more, or null.
  upNext = null,
  onUpNext = null,
  // A read-only review of the student's recorded work, built elsewhere. When
  // present it replaces "Review My Work" and the frozen "not replayed" copy.
  reviewPanel = null,
  // For tests and the browser harness; the page otherwise reads the clock.
  nowValue = undefined,
}) {
  const cameFromGrades = origin === LEVEL.GRADES;
  // The label comes from the navigation model, which owns the rule that a Back
  // control names its destination rather than its direction.
  const back = resolveBack(LEVEL.ASSIGNMENT_RESULT, { origin });
  // "← Assignments" / "← Grades": the destination's name, as the global nav
  // spells it.
  const backLabel = `← ${back?.navLabel || back?.shortLabel || 'Back'}`;
  const onBackToOrigin = cameFromGrades ? onViewAllGrades : onViewAllAssignments;
  if (!entry) {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--mm-surface-control)', padding: '28px 16px', fontFamily: '"Segoe UI", sans-serif' }}>
        <section style={{ maxWidth: 680, margin: '0 auto', padding: 22, borderRadius: 14, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', textAlign: 'left' }}>
          <h1 style={{ marginTop: 0, fontSize: 21, color: 'var(--mm-text-strong)' }}>That assignment is not available</h1>
          <p style={{ color: 'var(--mm-text-muted)', lineHeight: 1.55 }}>
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

  const step = describeResultNextStep({
    entry,
    todayEntry,
    upNext,
    ...(nowValue !== undefined ? { nowValue } : {}),
  });
  const hasPrimaryHere = step.kind === RESULT_STEP.CONTINUE;

  const statusLine = entry.frozen
    ? `Assignment closed ${formatDateTime(entry.lateDueAt)}`
    : entry.lifecycle?.isLate
      ? `Late work open until ${formatDateTime(entry.lateDueAt)}`
      : `Due ${formatDateTime(entry.dueAt)}`;

  return (
    <main
      className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
      style={{
        minHeight: '100vh', background: supportPresentation.highContrast ? 'var(--mm-surface)' : 'var(--mm-surface-control)',
        padding: '20px 14px 48px', fontFamily: '"Segoe UI", sans-serif',
        fontSize: supportPresentation.largeText ? '120%' : undefined,
      }}
    >
      <section
        aria-label="Assignment result"
        style={{
          maxWidth: 760, margin: '0 auto', padding: '20px 18px', borderRadius: 14,
          background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', textAlign: 'left', minWidth: 0,
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
            borderRadius: 10, border: '2px solid var(--mm-border)', background: 'var(--mm-surface)',
            color: 'var(--mm-text)', fontWeight: 900, fontSize: 14, cursor: 'pointer',
          }}
        >
          {backLabel}
        </button>

        <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>
          {entry.frozen ? 'Recorded MathMaster result' : 'MathMaster result so far'}
          {sectionLabel ? ` · ${sectionLabel}` : ''}
        </div>
        <h1 style={{ margin: '8px 0 4px', fontSize: 'clamp(20px, 6vw, 26px)', color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>
          {entry.title}
        </h1>
        <div style={{ fontSize: 13, color: 'var(--mm-text-muted)' }}>{statusLine}</div>

        <div style={{ marginTop: 16, padding: '16px 16px 14px', borderRadius: 12, background: 'var(--mm-primary-soft)' }}>
          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--mm-primary-text)' }}>
            {entry.frozen ? 'Your grade · frozen' : 'Your grade'}
          </div>
          <div style={{ marginTop: 4, fontSize: 'clamp(28px, 9vw, 40px)', fontWeight: 1000, lineHeight: 1.05, color: 'var(--mm-primary-text)', overflowWrap: 'anywhere' }}>
            {gradeHeadline}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800, color: 'var(--mm-primary-text)' }}>{entry.statusLabel}</div>
          {entry.exclusionText && (
            <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--mm-text)' }}>{entry.exclusionText}</p>
          )}
        </div>

        {/* WHAT TO DO NOW, from the one "Today" rule. */}
        {step.kind === RESULT_STEP.CONTINUE && (
          <div data-result-next="continue" style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, border: '2px solid var(--mm-primary)', background: 'var(--mm-surface)' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--mm-text-strong)' }}>This assignment is open — you can work on it now.</div>
            <button
              type="button"
              style={{ ...actionStyle(true), marginTop: 10, width: '100%' }}
              onClick={() => onContinue?.(entry.assignmentId, step.questionIndex ?? undefined)}
            >
              {step.continueLabel}
            </button>
          </div>
        )}
        {step.kind === RESULT_STEP.RECOVERY && (
          <p data-result-next="recovery" style={{ margin: '16px 0 0', padding: '12px 14px', borderRadius: 10, background: 'var(--mm-primary-soft)', fontSize: 14, fontWeight: 800, lineHeight: 1.5, color: 'var(--mm-primary-text)' }}>
            A Recovery is ready{todayEntry?.lesson?.recoverySection?.label ? ` for ${todayEntry.lesson.recoverySection.label}` : ''}. Start it from the Recovery panel on this page.
          </p>
        )}
        {step.kind === RESULT_STEP.WAITING && (
          <div data-result-next="waiting" style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border-soft)' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--mm-text-strong)' }}>Nothing here is open right now</div>
            {step.waitText && (
              <p data-result-wait style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 800, lineHeight: 1.5, color: 'var(--mm-text)' }}>{step.waitText}.</p>
            )}
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--mm-text-muted)' }}>
              {step.upNext ? 'Until then, Up next below is open now.' : 'Until then, Home shows what is open now, including My Math Path.'}
            </p>
          </div>
        )}
        {step.sections.length > 0 && (
          <ul data-result-sections aria-label="Each part of this assignment" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}>
            {step.sections.map((section) => (
              <li
                key={section.role}
                data-section-state={section.state}
                style={{
                  padding: '8px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere',
                  background: section.open ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
                  border: '1px solid var(--mm-border-soft)', color: 'var(--mm-text)',
                }}
              >
                <strong>{section.label}</strong> — {section.text}
              </li>
            ))}
          </ul>
        )}

        <GradeSectionBreakdown sections={entry.sections} />
        <TestCycleGradeBreakdown entry={entry} />
        {recoveryPanel}

        {/* Feedback/release state, said plainly, because "no number yet" and
            "you scored nothing" are opposite messages. */}
        {entry.feedbackHeld && (
          <p style={{ margin: '14px 0 0', padding: '12px 14px', borderRadius: 10, background: 'var(--mm-warning-bg)', border: '1px solid #f9ab00', fontSize: 13, lineHeight: 1.55, color: 'var(--mm-warning-text)' }}>
            Your teacher is holding feedback on this assignment. Your work is recorded — the grade appears here as soon as it is released, and it is not counted as a zero in the meantime.
          </p>
        )}

        {receipt.present && receipt.grade !== null && (
          <p style={{ margin: '14px 0 0', padding: '12px 14px', borderRadius: 10, background: 'var(--mm-surface-sunken)', border: '1px solid var(--mm-border-soft)', fontSize: 13, lineHeight: 1.55, color: 'var(--mm-text)' }}>
            {receipt.studentVisible ? 'Google Classroom shows' : 'Classroom teacher draft'}: {receipt.grade}% · {receipt.label}
            {!receipt.isFinal && !receipt.matchesMathMaster && (
              <> Your MathMaster grade has changed; Classroom updates at the next checkpoint.</>
            )}
          </p>
        )}

        {entry.frozen && !reviewPanel && (
          <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--mm-text-muted)' }}>
            This assignment is past its final deadline, so the grade above can no longer change. Opening it again gives you every question with full solutions — your recorded answers are not replayed, and the scores above are the record. Nothing you do there changes this grade, your evidence, your mastery, or your Google Classroom score.
          </p>
        )}
        {entry.frozen && reviewPanel && (
          <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--mm-text-muted)' }}>
            This assignment is past its final deadline, so the grade above can no longer change. Trying it again changes nothing here — not this grade, your mastery, or your Google Classroom score.
          </p>
        )}

        {/* The review of the student's own recorded work, when the caller has
            one, sits where the "Review My Work" button was and replaces it. */}
        {reviewPanel && <div data-result-review-panel style={{ marginTop: 14, minWidth: 0 }}>{reviewPanel}</div>}

        {/* UP NEXT: once this assignment asks nothing more (or nothing in it is
            open now), the next piece of work the "Today" rule would put on
            Home — never back to the assignment just left. */}
        {step.upNext && (
          <div
            data-result-up-next
            style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, border: '2px solid var(--mm-primary)', background: 'var(--mm-primary-soft)', minWidth: 0 }}
          >
            <h2 style={{ margin: 0, fontSize: 12, fontWeight: 950, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mm-primary-text)' }}>Up next</h2>
            <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900, color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>
              {step.upNext.assignment?.title || step.upNext.headline}
            </div>
            {step.upNext.headline && (
              <div style={{ marginTop: 2, fontSize: 13, lineHeight: 1.45, color: 'var(--mm-text)', overflowWrap: 'anywhere' }}>{step.upNext.headline}</div>
            )}
            <button
              type="button"
              style={{ ...actionStyle(!hasPrimaryHere), marginTop: 10, width: '100%' }}
              onClick={() => onUpNext?.(step.upNext)}
            >
              {step.upNext.actionLabel || 'Open'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          {step.offerHome && (
            <button type="button" style={actionStyle(true)} onClick={() => onBackToHome?.()}>
              Back to Home
            </button>
          )}
          {entry.reviewAvailable && !reviewPanel && (
            <button type="button" style={actionStyle(false)} onClick={() => onReviewWork?.(entry.assignmentId)}>
              Review My Work
            </button>
          )}
          {entry.practiceAvailable && step.kind !== RESULT_STEP.EXCUSED && (
            <button type="button" style={actionStyle(!step.offerHome && !step.upNext)} onClick={() => onPractice?.(entry.assignmentId)}>
              {tryAgainLabel(sectionLabel)}
            </button>
          )}
          {/* The other list. The Back control above already names the list the
              student came from, so it is not offered twice; a Google
              Classroom deep link still reaches both lists. */}
          {cameFromGrades ? (
            <button type="button" style={actionStyle(false)} onClick={() => onViewAllAssignments?.()}>
              All Assignments
            </button>
          ) : (
            <button type="button" style={actionStyle(false)} onClick={() => onViewAllGrades?.()}>
              View All Grades
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
