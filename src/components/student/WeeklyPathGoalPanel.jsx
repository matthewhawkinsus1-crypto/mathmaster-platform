import React from 'react';
import { PURPOSE } from '../../platform/path/recommendationV2.js';
import { FRAMEWORK_LABELS } from '../../platform/ccmr/assessmentCrosswalk.js';

// The student's week is a commitment the platform can count, not a vague list
// of topics. This panel is intentionally shared by Path and Mastery Overview so
// a student never sees two different stories about whether their week is done.

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

const weeklyPurposeLabel = (session = {}) => {
  if (session.purpose !== PURPOSE.TRANSFER) return session.purposeLabel || 'Path practice';
  const framework = String(session.context || session.assessmentFramework || '').trim();
  const frameworkLabel = FRAMEWORK_LABELS[framework] || '';
  return frameworkLabel ? `${frameworkLabel} transfer` : (session.purposeLabel || 'CCMR transfer');
};

function ProgressDots({ required, completed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }} role="img" aria-label={`${completed} of ${required} weekly sessions complete`}>
      <strong style={{ color: completed >= required ? '#12633a' : '#174ea6', fontSize: 13 }}>{completed}/{required}</strong>
      <div style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: required }, (_, index) => (
          <span
            key={index}
            style={{
              width: 12, height: 12, borderRadius: 999,
              background: index < completed ? '#12633a' : '#e3e6eb',
              boxShadow: index < completed ? '0 0 0 2px #d7f2df' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SessionCard({ session, done, onStart, disabled, total }) {
  const tone = PURPOSE_TONE[session.purpose] || PURPOSE_TONE[PURPOSE.CURRENT_LEARNING];
  return (
    <li style={{ listStyle: 'none' }}>
      <div style={{
        ...CARD,
        padding: 15,
        display: 'grid',
        gap: 9,
        border: done ? '2px solid #b7dfc3' : CARD.border,
        background: done ? '#f0fdf6' : '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
              fontSize: 11, fontWeight: 900, letterSpacing: '.02em',
              background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`,
            }}>
              {weeklyPurposeLabel(session)}
            </span>
            <span style={{ color: '#5f6368', fontSize: 11.5, fontWeight: 800 }}>
              Weekly session {session.slot} of {total}
            </span>
          </div>
          {done && (
            <span style={{ padding: '4px 9px', borderRadius: 999, background: '#d7f2df', color: '#12633a', fontSize: 12, fontWeight: 950 }}>
              Completed ✓
            </span>
          )}
        </div>

        <div style={{ fontSize: 15.5, fontWeight: 800, color: '#202124', lineHeight: 1.45 }}>
          {session.studentLabel || session.teksCode}
        </div>

        <div style={MUTED}>{session.studentExplanation}</div>

        {done ? (
          <div style={{ color: '#12633a', fontSize: 12.5, fontWeight: 800 }}>
            This session counted toward your weekly target.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onStart?.(session)}
            disabled={disabled}
            style={{
              appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
              marginTop: 2, padding: '11px 16px', borderRadius: 11, border: 0,
              background: disabled ? '#c7ccd4' : '#174ea6', color: '#fff',
              fontSize: 14.5, fontWeight: 900, cursor: disabled ? 'default' : 'pointer',
              minHeight: 44, width: '100%',
            }}
          >
            Start weekly session
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
  compact = false,
}) {
  if (!goal || !goal.sessions?.length) {
    return (
      <section style={CARD}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#202124' }}>Your weekly target</h2>
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
  const complete = remaining === 0;
  const next = goal.sessions.find((session) => !done.has(session.slot));

  if (compact) {
    return (
      <section style={{
        ...CARD,
        border: complete ? '2px solid #8fd2a2' : '2px solid #c9daf8',
        background: complete ? '#effbf2' : '#f8fbff',
        display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: '.07em', textTransform: 'uppercase', color: complete ? '#12633a' : '#174ea6' }}>
            {complete ? 'Weekly target complete' : 'Your weekly target'}
          </div>
          <strong style={{ display: 'block', marginTop: 4, fontSize: 17, color: '#202124' }}>
            {complete ? `You hit all ${required} sessions.` : `${completed} of ${required} sessions complete · ${remaining} to go`}
          </strong>
          <span style={{ ...MUTED, display: 'block', marginTop: 3 }}>
            {complete ? 'Free-choice Path practice is unlocked for the rest of the week.' : 'Each completed weekly session unlocks more of your Path.'}
          </span>
        </div>
        <ProgressDots required={required} completed={completed} />
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <header style={{
        ...CARD,
        display: 'grid',
        gap: 11,
        border: complete ? '3px solid #58a96b' : '2px solid #c9daf8',
        background: complete ? 'linear-gradient(135deg, #e6f4ea 0%, #fff8d8 100%)' : '#fff',
        boxShadow: complete ? '0 10px 30px rgba(19,115,51,.14)' : 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 950, textTransform: 'uppercase', letterSpacing: '.08em', color: complete ? '#12633a' : '#174ea6' }}>
              {complete ? '🎉 Goal hit' : 'This week'}
            </div>
            <h2 style={{ margin: '3px 0 0', fontSize: complete ? 24 : 19, color: complete ? '#12633a' : '#202124' }}>
              {complete ? 'Weekly target complete!' : 'Your Weekly Math Path'}
            </h2>
          </div>
          <ProgressDots required={required} completed={completed} />
        </div>

        <div style={{ ...MUTED, fontSize: complete ? 15 : 14, color: complete ? '#245c33' : MUTED.color, fontWeight: complete ? 700 : 400 }}>
          {complete
            ? `You completed all ${required} of ${required} assigned Path sessions. Free-choice paths are now unlocked — anything else you do this week is extra practice.`
            : `${completed} of ${required} weekly sessions done. ${remaining} ${remaining === 1 ? 'session' : 'sessions'} to go before free-choice paths unlock.`}
        </div>
        {progress?.daysLeft != null && remaining > 0 && progress.daysLeft >= 0 && (
          <div style={{ ...MUTED, fontSize: 12.5 }}>
            {progress.daysLeft === 0 ? 'Due today.' : `${progress.daysLeft} day${progress.daysLeft === 1 ? '' : 's'} left.`}
          </div>
        )}
        {progress?.overdue && (
          <div style={{ ...MUTED, fontSize: 12.5, color: '#854d0e' }}>
            This week&apos;s goal is past its due date. You can still finish it — the practice still counts toward what you know.
          </div>
        )}
      </header>

      {next && (
        <div style={{ ...CARD, background: '#f8fbff', borderColor: '#c9daf8' }}>
          <div style={{ fontSize: 10.5, fontWeight: 950, letterSpacing: '.08em', textTransform: 'uppercase', color: '#174ea6' }}>
            Do this next · weekly session {next.slot} of {required}
          </div>
          <div style={{ marginTop: 7 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
              fontSize: 11, fontWeight: 900, letterSpacing: '.02em',
              background: (PURPOSE_TONE[next.purpose] || PURPOSE_TONE[PURPOSE.CURRENT_LEARNING]).bg,
              color: (PURPOSE_TONE[next.purpose] || PURPOSE_TONE[PURPOSE.CURRENT_LEARNING]).fg,
              border: `1px solid ${(PURPOSE_TONE[next.purpose] || PURPOSE_TONE[PURPOSE.CURRENT_LEARNING]).border}`,
            }}>
              {weeklyPurposeLabel(next)}
            </span>
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
            {busy ? 'Starting…' : `Start session ${next.slot} of ${required}`}
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
            total={required}
          />
        ))}
      </ul>
    </section>
  );
}
