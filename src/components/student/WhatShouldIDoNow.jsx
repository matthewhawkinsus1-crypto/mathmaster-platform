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
  now: { bg: '#eef3fb', border: '#c9daf8', accent: '#174ea6', eyebrow: 'Do this next' },
  late: { bg: '#fff8ed', border: '#f6ddc4', accent: '#9a3412', eyebrow: 'Worth catching up' },
  today: { bg: '#eef3fb', border: '#c9daf8', accent: '#174ea6', eyebrow: 'Due today' },
  thisWeek: { bg: '#f5f3ff', border: '#ded1f7', accent: '#5b21b6', eyebrow: 'This week' },
  none: { bg: '#f0fdf6', border: '#c3e8d1', accent: '#12633a', eyebrow: 'All clear' },
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
        style={{ margin: '7px 0 0', fontSize: 22, color: '#202124', lineHeight: 1.25 }}
      >
        {/* Named on the one screen where being addressed by name is worth it. */}
        {studentName && nextAction.kind === 'clear'
          ? `Nice work, ${studentName} — you are caught up`
          : nextAction.headline}
      </h2>

      <p style={{ margin: '7px 0 0', color: '#3c4043', fontSize: 15, lineHeight: 1.6 }}>
        {nextAction.detail}
      </p>

      {nextAction.assignment && (nextAction.assignment.dueAt || nextAction.assignment.dueDate) && (
        <div style={{ marginTop: 6, color: '#5f6368', fontSize: 13, fontWeight: 800 }}>
          Due {formatDateTime(nextAction.assignment.dueAt || nextAction.assignment.dueDate)}
        </div>
      )}

      {nextAction.actionLabel && (
        <button
          type="button"
          onClick={act}
          style={{
            appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
            marginTop: 16, padding: '13px 22px', borderRadius: 11, border: 0,
            background: tone.accent, color: '#fff', fontSize: 15.5, fontWeight: 900,
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
