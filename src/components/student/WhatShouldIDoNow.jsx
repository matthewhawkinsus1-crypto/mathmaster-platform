import React from 'react';
import { formatDateTime } from '../../assignmentLifecycle';

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

export default function WhatShouldIDoNow({
  nextAction,
  onStartAssignment = null,
  onOpenMathPath = null,
  studentName = null,
}) {
  if (!nextAction) return null;
  const tone = TONE[nextAction.urgency] || TONE.now;

  const act = () => {
    if (nextAction.assignment && onStartAssignment) {
      onStartAssignment(nextAction.assignment, nextAction.questionIndex ?? 0);
      return;
    }
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

      {/* The student's own due date, resolved by the model from their
          lifecycle — never the assignment's class date, which is a day early
          for a student with an individualized due date. */}
      {nextAction.assignment && nextAction.dueAt && (
        <div style={{ marginTop: 6, color: 'var(--mm-text-muted)', fontSize: 13, fontWeight: 800 }}>
          Due {formatDateTime(nextAction.dueAt)}
        </div>
      )}

      {nextAction.actionLabel && (
        <button
          type="button"
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
