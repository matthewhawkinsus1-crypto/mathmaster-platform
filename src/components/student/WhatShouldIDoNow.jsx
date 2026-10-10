import React from 'react';
import { formatDateTime } from '../../assignmentLifecycle';
import DOLCountdown from './DOLCountdown.jsx';

// The answer to the only question a student opens the app with.
//
// "The Home screen should primarily answer: what should I do now? Do not turn
// Home into a dashboard full of equally important boxes."
//
// A dashboard of six equal panels does not answer that question — it delegates
// it back to the student, who now has to work out which panel matters. The
// model has already decided (see `resolveNextAction`); this renders the one
// decision, large, with everything else demoted below it.
//
// Urgency is carried by TONE, not by alarm. A student who is behind already
// knows. Shouting at them in red produces avoidance, not work, and avoidance is
// the failure mode this whole system is built to prevent.

const TONE = {
  now: { bg: 'var(--mm-primary-subtle)', border: 'var(--mm-tint-border)', accent: 'var(--mm-primary-text)', fill: '#174ea6', eyebrow: 'Do this next' },
  late: { bg: 'var(--mm-warning-subtle)', border: 'var(--mm-warning-border-soft)', accent: 'var(--mm-warning-text)', fill: '#9a3412', eyebrow: 'Worth catching up' },
  today: { bg: 'var(--mm-primary-subtle)', border: 'var(--mm-tint-border)', accent: 'var(--mm-primary-text)', fill: '#174ea6', eyebrow: 'Due today' },
  thisWeek: { bg: 'var(--mm-primary-subtle)', border: 'var(--mm-accent-border)', accent: 'var(--mm-accent-text)', fill: '#5b21b6', eyebrow: 'This week' },
  none: { bg: 'var(--mm-success-subtle)', border: 'var(--mm-success-border)', accent: 'var(--mm-success-text)', fill: '#12633a', eyebrow: 'All clear' },
};

// The live windows whose timer this card shows. Home renders no separate
// Warm-Up or DOL card for the assignment this card names, so the countdown
// those cards carried has to live here.
const TIMED_KINDS = new Set(['dol', 'warmup']);

export default function WhatShouldIDoNow({
  nextAction,
  onStartAssignment = null,
  // A Recovery is taken from the assignment's result page, not the workspace.
  onOpenResult = null,
  onOpenMathPath = null,
  studentName = null,
  // The live Warm-Up/DOL window's end, when this card names one.
  countdownEndsAt = null,
  // supportPresentation.hideCountdowns: a student whose plan removes visible
  // timers never sees one here either.
  hideCountdowns = false,
  // { questionNumber, gradeText } when this card is the Resume action.
  resume = null,
}) {
  if (!nextAction) return null;
  const tone = TONE[nextAction.urgency] || TONE.now;
  const showCountdown = TIMED_KINDS.has(nextAction.kind) && Boolean(countdownEndsAt) && !hideCountdowns;

  const act = () => {
    if (nextAction.assignment && nextAction.opensResult && onOpenResult) {
      onOpenResult(nextAction.assignment.id);
      return;
    }
    if (nextAction.assignment && onStartAssignment) {
      onStartAssignment(nextAction.assignment, nextAction.questionIndex ?? 0);
      return;
    }
    // 'assignedSoon' and the Path kinds name no assignment: My Math Path is
    // the one thing open to them.
    onOpenMathPath?.();
  };

  return (
    <section
      aria-labelledby="what-now-heading"
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 16,
        padding: '22px 24px',
        marginBottom: 22,
        textAlign: 'left',
      }}
    >
      <div style={{
        fontSize: 10.5, fontWeight: 950, letterSpacing: '.09em',
        textTransform: 'uppercase', color: tone.accent,
      }}
      >
        {tone.eyebrow}
      </div>

      <h2
        id="what-now-heading"
        style={{ margin: '7px 0 0', fontSize: 22, color: 'var(--mm-text-strong)', lineHeight: 1.25 }}
      >
        {/* Named on the one screen where being addressed by name is worth it. */}
        {studentName && nextAction.kind === 'clear'
          ? `Nice work, ${studentName} — you are caught up`
          : nextAction.headline}
      </h2>

      <p style={{ margin: '7px 0 0', color: 'var(--mm-text)', fontSize: 15, lineHeight: 1.6 }}>
        {nextAction.detail}
      </p>

      {/* Resume: where the student lands, and what the work is worth so far.
          The work itself is saved on the server, not in this browser. */}
      {nextAction.kind === 'resume' && resume && (
        <div data-resume-detail style={{ marginTop: 8, color: 'var(--mm-text)', fontSize: 14, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 800 }}>Continue at Question {resume.questionNumber}. Your answers are kept as you go.</div>
          {resume.gradeText && (
            <div style={{ marginTop: 2, color: 'var(--mm-text-muted)', fontWeight: 800 }}>{resume.gradeText}</div>
          )}
        </div>
      )}

      {showCountdown && (
        <div data-next-action-countdown style={{ marginTop: 8, fontSize: 20, fontWeight: 950, color: tone.accent, fontVariantNumeric: 'tabular-nums' }}>
          <DOLCountdown endsAt={countdownEndsAt} /> left
        </div>
      )}

      {/* The student's own due date, resolved by the model from their
          lifecycle — never the assignment's class date, which is a day early
          for a student with an individualized due date. */}
      {/* Late work names the student's own last day (an extension included),
          never only a class due date that has already passed. */}
      {nextAction.assignment && nextAction.lateLine ? (
        <div style={{ marginTop: 6, color: 'var(--mm-text-muted)', fontSize: 13, fontWeight: 800 }}>
          Late · {nextAction.lateLine}
        </div>
      ) : nextAction.assignment && nextAction.dueAt && (
        <div style={{ marginTop: 6, color: 'var(--mm-text-muted)', fontSize: 13, fontWeight: 800 }}>
          {nextAction.individualizedDue ? 'Your due date: ' : 'Due '}{formatDateTime(nextAction.dueAt)}
        </div>
      )}

      {nextAction.actionLabel && (
        <button
          type="button"
          data-primary-action
          onClick={act}
          style={{
            appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
            marginTop: 16, padding: '13px 22px', borderRadius: 11, border: 0,
            // `fill` stays saturated in both themes so the white label keeps its
            // contrast; `accent` (text) turns light in dark mode.
            background: tone.fill, color: '#fff', fontSize: 15.5, fontWeight: 900,
            cursor: 'pointer',
            // Chromebook and phone: a target a thumb can hit without aiming.
            minHeight: 48, width: '100%', maxWidth: 340,
          }}
        >
          {nextAction.actionLabel}
        </button>
      )}
    </section>
  );
}
