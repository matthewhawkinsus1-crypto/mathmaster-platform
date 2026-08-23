import React from 'react';
import { PURPOSE } from '../../platform/path/recommendationV2.js';

// The student's week.
//
// WHAT THIS SCREEN IS FOR. A student opening MathMaster asks one question:
// "what should I do now?" Everything else — the wheel, the standards list, the
// mastery percentages — answers questions they did not ask. This panel answers
// theirs, in order, with a reason attached to each item.
//
// WHAT IT DELIBERATELY DOES NOT SHOW. No level label. No projection. No
// "Below Level" anywhere on a student's own screen. Those exist so a TEACHER
// can adapt instruction; handing them to a fourteen-year-old as a verdict about
// themselves does no instructional work and a great deal of harm. The student
// sees the work and the reason for it.

const PURPOSE_TONE = {
  [PURPOSE.CURRENT_LEARNING]: { bg: '#eef3fb', fg: '#174ea6', border: '#c9daf8' },
  [PURPOSE.RESPONSIVE_REVIEW]: { bg: '#f5f3ff', fg: '#5b21b6', border: '#ded1f7' },
  [PURPOSE.FOUNDATION_BRIDGE]: { bg: '#fff8ed', fg: '#9a3412', border: '#f6ddc4' },
  [PURPOSE.RETENTION]: { bg: '#f0fdf6', fg: '#12633a', border: '#c3e8d1' },
  [PURPOSE.TRANSFER]: { bg: '#f7f2fd', fg: '#5b21b6', border: '#ddcff3' },
  [PURPOSE.EXTENSION]: { bg: '#eefaf1', fg: '#12633a', border: '#c3e8d1' },
};

const CARD = { border: '1px solid #e3e6eb', borderRadius: 16, background: '#fff', padding: 18 };
const MUTED = { color: '#5f6368', fontSize: 13, lineHeight: 1.6 };

function ProgressDots({ required, completed }) {
  return (
    <div style={{ display: 'flex', gap: 6 }} role="img" aria-label={`${completed} of ${required} sessions complete`}>
      {Array.from({ length: required }, (_, index) => (
        <span
          key={index}
          style={{
            width: 11, height: 11, borderRadius: 999,
            background: index < completed ? '#12633a' : '#e3e6eb',
          }}
        />
      ))}
    </div>
  );
}

function SessionCard({ session, done, onStart, disabled }) {
  const tone = PURPOSE_TONE[session.purpose] || PURPOSE_TONE[PURPOSE.CURRENT_LEARNING];
  return (
    <li style={{ listStyle: 'none' }}>
      <div style={{
        ...CARD,
        padding: 15,
        opacity: done ? 0.62 : 1,
        display: 'grid',
        gap: 9,
      }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 900, letterSpacing: '.02em',
            background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
          }}
          >
            {session.purposeLabel}
          </span>
          {done && <span style={{ fontSize: 12, fontWeight: 900, color: '#12633a' }}>Done ✓</span>}
        </div>

        <div style={{ fontSize: 15.5, fontWeight: 800, color: '#202124', lineHeight: 1.45 }}>
          {session.studentLabel || session.teksCode}
        </div>

        {/* The reason. Every session carries one, in the student's own terms —
            never "score 0.82" and never a difficulty band number. */}
        <div style={MUTED}>{session.studentExplanation}</div>

        {!done && (
          <button
            type="button"
            onClick={() => onStart?.(session)}
            disabled={disabled}
            style={{
              appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
              marginTop: 2, padding: '11px 16px', borderRadius: 11, border: 0,
              background: disabled ? '#c7ccd4' : '#174ea6', color: '#fff',
              fontSize: 14.5, fontWeight: 900, cursor: disabled ? 'default' : 'pointer',
              // Chromebook and phone: a target a thumb can actually hit.
              minHeight: 44, width: '100%',
            }}
          >
            Start
          </button>
        )}
      </div>
    </li>
  );
}

export default function WeeklyPathGoalPanel({
  goal = null,
  progress = null,
  completedSlots = [],
  onStartSession = null,
  busy = false,
}) {
  if (!goal || !goal.sessions?.length) {
    return (
      <section style={CARD}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#202124' }}>Your week</h2>
        <p style={{ ...MUTED, marginTop: 8 }}>
          MathMaster is putting this week&apos;s Path together. Check back in a moment — and if it
          stays like this, tell your teacher, because that is not supposed to happen.
        </p>
      </section>
    );
  }

  const done = new Set(completedSlots.map(Number));
  const required = progress?.required ?? goal.goalSessions;
  const completed = progress?.completed ?? done.size;
  const remaining = Math.max(0, required - completed);
  const next = goal.sessions.find((session) => !done.has(session.slot));

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <header style={{ ...CARD, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 19, color: '#202124' }}>Your week</h2>
          <ProgressDots required={required} completed={completed} />
        </div>
        <div style={{ ...MUTED, fontSize: 14 }}>
          {remaining === 0
            ? 'That is this week done. Anything else you do now is extra — and it still counts toward what you know.'
            : `${completed} of ${required} done. ${remaining} to go.`}
        </div>
        {progress?.daysLeft != null && remaining > 0 && progress.daysLeft >= 0 && (
          <div style={{ ...MUTED, fontSize: 12.5 }}>
            {progress.daysLeft === 0 ? 'Due today.' : `${progress.daysLeft} day${progress.daysLeft === 1 ? '' : 's'} left.`}
          </div>
        )}
        {progress?.overdue && (
          // Overdue is stated plainly and without alarm. Late work still counts,
          // and a student who believes it does not simply stops.
          <div style={{ ...MUTED, fontSize: 12.5, color: '#854d0e' }}>
            This week&apos;s goal is past its due date. You can still do it — the practice still counts
            toward what you know.
          </div>
        )}
      </header>

      {next && (
        <div style={{ ...CARD, background: '#f8fbff', borderColor: '#c9daf8' }}>
          <div style={{ fontSize: 10.5, fontWeight: 950, letterSpacing: '.08em', textTransform: 'uppercase', color: '#174ea6' }}>
            Do this next
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#202124', marginTop: 5 }}>
            {next.studentLabel || next.teksCode}
          </div>
          <div style={{ ...MUTED, marginTop: 4 }}>{next.studentExplanation}</div>
          <button
            type="button"
            onClick={() => onStartSession?.(next)}
            disabled={busy}
            style={{
              appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
              marginTop: 12, padding: '12px 18px', borderRadius: 11, border: 0,
              background: busy ? '#c7ccd4' : '#174ea6', color: '#fff',
              fontSize: 15, fontWeight: 900, cursor: busy ? 'default' : 'pointer',
              minHeight: 46, width: '100%',
            }}
          >
            {busy ? 'Starting…' : 'Start'}
          </button>
        </div>
      )}

      <ul style={{ margin: 0, padding: 0, display: 'grid', gap: 11 }}>
        {goal.sessions.map((session) => (
          <SessionCard
            key={session.slot}
            session={session}
            done={done.has(session.slot)}
            onStart={onStartSession}
            disabled={busy}
          />
        ))}
      </ul>
    </section>
  );
}
