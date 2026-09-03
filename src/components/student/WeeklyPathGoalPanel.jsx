import React, { useState } from 'react';
import { PURPOSE } from '../../platform/path/recommendationV2.js';
import { describeSlotChoice } from '../../platform/path/weeklyPathChoice.js';
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

/**
 * The week as one bar.
 *
 * This replaces a row of dots. Dots stop reading as progress somewhere around
 * five, and they cannot show a partly finished session at all — a student who
 * had done most of the week saw the same shape as one who had done none of it.
 * The bar is also the only number on this screen a student should never have to
 * hunt for, so it carries its own text rather than relying on the copy above it.
 */
export function WeeklyProgressBar({ required, completed, compact = false }) {
  const total = Math.max(0, Number(required) || 0);
  const done = Math.min(Math.max(0, Number(completed) || 0), total);
  const percent = total ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done >= total;

  return (
    <div style={{ display: 'grid', gap: 5, minWidth: compact ? 150 : 210 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <strong style={{ color: complete ? '#12633a' : '#174ea6', fontSize: compact ? 12.5 : 13.5 }}>
          {done} of {total} done
        </strong>
        <span style={{ color: complete ? '#12633a' : '#5f6368', fontSize: 12, fontWeight: 800 }}>{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${done} of ${total} weekly sessions complete`}
        style={{
          height: compact ? 9 : 11,
          borderRadius: 999,
          background: '#e8eaed',
          overflow: 'hidden',
        }}
      >
        <div style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: 999,
          background: complete ? 'linear-gradient(90deg,#34a853,#0f9d58)' : 'linear-gradient(90deg,#4285f4,#174ea6)',
          transition: 'width .35s ease',
        }} />
      </div>
    </div>
  );
}

/**
 * The choice control for one slot.
 *
 * Collapsed by default. A student who is happy with the recommendation should
 * not have to read three options to start working, and a student who wants
 * something else should not have to ask a teacher for permission.
 */
function SlotChoice({ session, onChoose, disabled }) {
  const [open, setOpen] = useState(false);
  const choice = describeSlotChoice(session);
  if (!choice.canChoose) return null;

  const options = [
    {
      skillId: session.recommendedSkillId || session.skillId,
      studentLabel: session.recommendedLabel || session.studentLabel,
      swapReason: 'MathMaster picked this one for you.',
      recommended: true,
    },
    ...(session.alternatives || []),
  ];

  return (
    <div style={{ marginTop: 2 }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        style={{
          appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
          border: '1px solid #c9daf8', borderRadius: 9, background: '#f8fbff',
          color: '#174ea6', fontWeight: 800, fontSize: 12.5, padding: '8px 11px',
          minHeight: 44, cursor: 'pointer', width: '100%', textAlign: 'left',
        }}
      >
        {open
          ? 'Hide the other options'
          : `Want something else? ${choice.optionCount} other ${choice.optionCount === 1 ? 'option' : 'options'} for this slot`}
      </button>

      {open && (
        <ul style={{ margin: '9px 0 0', padding: 0, display: 'grid', gap: 7 }}>
          {options.map((option) => {
            const active = String(session.skillId) === String(option.skillId);
            return (
              <li key={option.skillId} style={{ listStyle: 'none' }}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChoose?.(session, option.recommended ? null : option.skillId); setOpen(false); }}
                  style={{
                    appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
                    display: 'block', width: '100%', textAlign: 'left',
                    border: active ? '2px solid #174ea6' : '1px solid #e3e6eb',
                    borderRadius: 10, background: active ? '#f8fbff' : '#fff',
                    padding: '10px 12px', minHeight: 44, cursor: disabled ? 'default' : 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14, color: '#202124' }}>{option.studentLabel}</strong>
                    {option.recommended && (
                      <span style={{ fontSize: 10.5, fontWeight: 900, color: '#174ea6', background: '#eef3fb', border: '1px solid #c9daf8', borderRadius: 999, padding: '2px 7px' }}>
                        RECOMMENDED
                      </span>
                    )}
                    {active && <span style={{ fontSize: 11, fontWeight: 900, color: '#12633a' }}>✓ chosen</span>}
                  </span>
                  <span style={{ ...MUTED, display: 'block', marginTop: 3, fontSize: 12.5 }}>{option.swapReason}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SessionCard({ session, done, onStart, onChoose, disabled, total }) {
  const tone = PURPOSE_TONE[session.purpose] || PURPOSE_TONE[PURPOSE.CURRENT_LEARNING];
  const choice = describeSlotChoice(session);
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

        <div style={{ fontSize: 11.5, fontWeight: 800, color: choice.chose ? '#12633a' : '#5f6368' }}>
          {choice.chose ? `You chose this instead of ${choice.recommendedLabel}` : 'Recommended for you'}
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

        {!done && <SlotChoice session={session} onChoose={onChoose} disabled={disabled} />}
      </div>
    </li>
  );
}

export default function WeeklyPathGoalPanel({
  goal = null,
  progress = null,
  completedSlots = [],
  onStartSession = null,
  onChooseAlternative = null,
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
            {complete ? 'Anything else you practise this week is extra.' : 'Do them in any order, and you can swap a skill on any card.'}
          </span>
        </div>
        <WeeklyProgressBar required={required} completed={completed} />
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
            {!complete && (
              <p style={{ ...MUTED, margin: '5px 0 0', fontSize: 13 }}>
                MathMaster picked these for you and says why. Do them in any order — and if a
                different skill would help you more, swap it on any card below.
              </p>
            )}
          </div>
          <WeeklyProgressBar required={required} completed={completed} />
        </div>

        <div style={{ ...MUTED, fontSize: complete ? 15 : 14, color: complete ? '#245c33' : MUTED.color, fontWeight: complete ? 700 : 400 }}>
          {complete
            ? `You completed all ${required} of ${required} Path sessions this week. Anything else you do now is extra practice.`
            : `${completed} of ${required} weekly sessions done — ${remaining} to go. Practising anything else on your Path is always open; these are the ones that count toward the week.`}
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
            onChoose={onChooseAlternative}
            disabled={busy}
            total={required}
          />
        ))}
      </ul>
    </section>
  );
}
