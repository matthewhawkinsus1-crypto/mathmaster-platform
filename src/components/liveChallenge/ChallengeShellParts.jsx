import { useEffect, useRef } from 'react';
import { challengeClock, formatChallengeClock, stageHasOpenRound } from '../../platform/liveChallenge/challengeShellModel.js';
import { useLatest, usePrefersReducedMotion, useTicker } from '../../platform/liveChallenge/challengeHooks.js';
import { formatPoints, standingsWindow } from '../../platform/liveChallenge/challengeStandingsModel.js';
import { SHELL_CSS } from './challengeShellCss.js';

/*
 * THE SHARED LIVE CHALLENGE SHELL: pieces every screen uses.
 *
 * The teacher's console, the projector and a student's device show the same
 * game in three looks. These components take their numbers from the shell
 * models (challengeShellModel, challengeStandingsModel), so a countdown, a
 * clock, a rank or a tie reads the same on all three — and a score is always
 * the score, never an animation frame on its way to it.
 */

export const SHELL_LOOKS = Object.freeze({
  console: Object.freeze({
    text: 'var(--mm-text-strong)',
    muted: 'var(--mm-text-muted)',
    row: 'var(--mm-surface-muted)',
    rowBorder: 'var(--mm-border)',
    self: 'var(--mm-info-bg)',
    selfBorder: 'var(--mm-primary)',
    accent: 'var(--mm-primary)',
    good: 'var(--mm-success-text)',
    up: 'var(--mm-success-text)',
    down: 'var(--mm-error-text)',
    gold: '#b06000',
    size: 15,
    rowHeight: 40,
  }),
  projector: Object.freeze({
    text: '#f7f9ff',
    muted: 'rgba(236,241,255,.7)',
    row: 'rgba(255,255,255,.055)',
    rowBorder: 'rgba(255,255,255,.1)',
    self: 'rgba(138,180,248,.18)',
    selfBorder: '#8ab4f8',
    accent: '#9cb8ff',
    good: '#8df7c9',
    up: '#8df7c9',
    down: '#ffb4ab',
    gold: '#ffd166',
    size: 'clamp(16px, 1.7vw, 24px)',
    rowHeight: 'clamp(40px, 6vh, 56px)',
  }),
  student: Object.freeze({
    text: '#eef1f6',
    muted: '#b9c4d8',
    row: 'rgba(255,255,255,.07)',
    rowBorder: 'rgba(255,255,255,.12)',
    self: 'rgba(66,133,244,.30)',
    selfBorder: '#8ab4f8',
    accent: '#fdd663',
    good: '#81c995',
    up: '#81c995',
    down: '#ffb4ab',
    gold: '#fdd663',
    size: 15,
    rowHeight: 40,
  }),
});

const lookOf = (look) => SHELL_LOOKS[look] || SHELL_LOOKS.console;

export function ChallengeShellStyles() {
  return <style>{SHELL_CSS}</style>;
}

/**
 * The round's time, ticking on its own: the digits redraw four times a second
 * and nothing around them does. `clockOffsetMs` is the screen's calibrated
 * offset to server time. Open-ended (Pace Race) rounds show elapsed time.
 */
export function ChallengeClockText({ room, clockOffsetMs = 0, style = null, className = '' }) {
  const probe = challengeClock(room || {}, Date.now() + clockOffsetMs);
  const ticking = stageHasOpenRound(probe.stage);
  const now = useTicker(250, ticking);
  const clock = challengeClock(room || {}, now + clockOffsetMs);
  const counting = clock.stage === 'countdown';
  const value = counting
    ? formatChallengeClock(clock.endsAtMs && clock.startsAtMs ? clock.endsAtMs - clock.startsAtMs : 0)
    : clock.openEnded ? formatChallengeClock(clock.elapsedMs) : formatChallengeClock(clock.remainingMs ?? 0);
  const label = counting
    ? `Round starts in ${Math.max(1, Math.ceil(clock.untilStartMs / 1000))} seconds`
    : clock.openEnded ? `${Math.floor(clock.elapsedMs / 1000)} seconds elapsed` : `${Math.ceil((clock.remainingMs ?? 0) / 1000)} seconds left`;
  return <span role="timer" aria-label={label} className={className} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{value}</span>;
}

/** True while the round's time left is at most `thresholdMs` (for urgency styling). */
export function useLowTime(room, clockOffsetMs = 0, thresholdMs = 10_000) {
  const probe = challengeClock(room || {}, Date.now() + clockOffsetMs);
  const active = probe.stage === 'roundActive' && probe.remainingMs !== null;
  const now = useTicker(500, active);
  const clock = challengeClock(room || {}, now + clockOffsetMs);
  return clock.stage === 'roundActive' && clock.remainingMs !== null && clock.remainingMs <= thresholdMs;
}

/**
 * 3 · 2 · 1 · GO, from the round's authoritative start. `clock` is a
 * useChallengeClock reading: the number changes exactly on the second, on
 * every screen at once, and a screen that wakes mid-countdown shows the step
 * the server clock is on — there is no local countdown to drift.
 */
export function ChallengeCountdown({ clock, look = 'projector', title = '', detail = '', size = null }) {
  const style = lookOf(look);
  const go = clock?.showGo === true;
  const step = clock?.countdownStep;
  if (!go && !step) return null;
  const text = go ? 'GO!' : String(step);
  const fontSize = size || (look === 'projector' ? 'clamp(120px, 28vh, 260px)' : look === 'student' ? 'clamp(88px, 22vw, 150px)' : 96);
  return (
    <div className="mm-shell-count" data-mm-countdown={go ? 'go' : String(step)} style={{ color: style.text, padding: look === 'console' ? 12 : 20 }}>
      {title && <div style={{ fontSize: look === 'projector' ? 'clamp(20px, 2.6vw, 34px)' : 18, fontWeight: 900, color: style.accent, letterSpacing: '.04em', textTransform: 'uppercase' }}>{title}</div>}
      <div key={text} className="mm-shell-count-number" aria-hidden="true" style={{ fontSize, color: go ? style.good : style.text }}>{text}</div>
      <div aria-live="polite" style={{ fontSize: look === 'projector' ? 'clamp(18px, 2vw, 28px)' : 16, fontWeight: 800, color: style.muted }}>
        {go ? 'Go!' : `Get ready… ${step}`}{detail ? ` · ${detail}` : ''}
      </div>
    </div>
  );
}

/** A row's rank: "1", "T-2" — with words for a screen reader. */
function RankCell({ row, style, look }) {
  const medal = look !== 'console' && row.rank === 1 ? style.gold : null;
  return (
    <strong aria-label={row.place.spoken} style={{ textAlign: 'center', color: medal || style.text, fontVariantNumeric: 'tabular-nums' }}>
      {row.place.short}
    </strong>
  );
}

/**
 * The scoreboard. `rows` come from challengeStandingsModel.standingsRows —
 * ranked by the engine, ties labelled — and every number shown is the row's
 * real value. A changed score flashes once (CSS, off under reduced motion);
 * it never counts up through values the student did not have.
 *
 * Large classes: the top `limit` rows, then "and N more"; a student's own row
 * is added on their own device only (`selfKey`).
 */
export function StandingsBoard({
  rows = [],
  presentation,
  look = 'console',
  limit = 8,
  selfKey = null,
  showMovement = true,
  showCorrect = false,
  rewardsByKey = null,
  // Player key -> student name: the teacher's console only, never a projector
  // or a student's device (they are not handed names at all).
  namesByKey = null,
  emptyText = 'Players appear here as they join.',
  label = 'Standings',
  // How many are playing, when `rows` is only the top of the class and the
  // viewer's own row (a student's standings snapshot).
  totalCount = null,
  // (hidden) -> the line under a board that leaves players off. A class-wide
  // board (the projector) says everyone sees their own place on their device
  // (liveChallengeProjectorModel.projectorMoreText); default "and N more players".
  describeMore = null,
  // A public list already decided (liveChallengeProjectorModel.publicStandingsRows:
  // never a place tied with the last, never one player left unnamed). When
  // given, it is drawn as it is: its rows, the viewer's own row, its note.
  board = null,
}) {
  const style = lookOf(look);
  const visible = board
    ? { top: board.rows, self: board.self, hiddenCount: board.hiddenCount + (board.self ? 1 : 0), total: board.totalCount }
    : standingsWindow(rows, { limit, selfKey, total: totalCount });
  const unseen = visible.hiddenCount - (visible.self ? 1 : 0);
  if (!visible.total) return <p style={{ margin: 0, color: style.muted }}>{emptyText}</p>;
  const unit = presentation?.total?.short || 'pts';
  const renderRow = (row) => {
    const rewards = rewardsByKey?.get(row.playerKey) || null;
    return (
      <li
        key={row.playerKey || `${row.rank}-${row.alias}`}
        data-mm-standing={row.playerKey || ''}
        style={{
          display: 'grid',
          gridTemplateColumns: `${look === 'projector' ? '3.2em' : '42px'} minmax(0,1fr) auto auto`,
          gap: 10,
          alignItems: 'center',
          minHeight: style.rowHeight,
          padding: '6px 12px',
          boxSizing: 'border-box',
          borderRadius: 10,
          background: row.isSelf ? style.self : style.row,
          border: `${row.isSelf ? 2 : 1}px solid ${row.isSelf ? style.selfBorder : style.rowBorder}`,
          color: style.text,
          fontSize: style.size,
        }}
      >
        <RankCell row={row} style={style} look={look} />
        <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.alias}</span>
          {namesByKey?.get(row.playerKey) && (
            <span data-mm-standing-name="1" style={{ fontSize: '.85em', fontWeight: 700, color: style.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{namesByKey.get(row.playerKey)}</span>
          )}
          {row.isSelf && <span style={{ fontSize: '.75em', fontWeight: 900, color: style.accent }}>you</span>}
          {rewards && rewards.map((reward) => (
            <span key={reward.rewardCode} title={reward.label} style={{ fontSize: '.72em', fontWeight: 900, padding: '2px 7px', borderRadius: 999, background: 'rgba(253,214,99,.18)', color: style.gold, whiteSpace: 'nowrap' }}>
              {reward.rewardCode === 'practicePass' ? '🎟' : reward.rewardCode === 'badge' ? '🏅' : '⭐'} {reward.label}
            </span>
          ))}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: style.muted, fontSize: '.85em', whiteSpace: 'nowrap' }}>
          {showCorrect && <span>{row.correctCount} ✓</span>}
          {showMovement && row.movement && row.movement.direction !== 'same' && (
            <span aria-label={row.movement.spoken} style={{ fontWeight: 900, color: row.movement.direction === 'up' ? style.up : style.down }}>{row.movement.text}</span>
          )}
        </span>
        <strong key={row.score} className="mm-shell-bump" style={{ fontVariantNumeric: 'tabular-nums', padding: '0 4px', textAlign: 'right' }}>
          {formatPoints(row.score)}{look !== 'projector' && <span style={{ fontSize: '.75em', fontWeight: 800, color: style.muted }}> {unit}</span>}
        </strong>
      </li>
    );
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <ol aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {visible.top.map(renderRow)}
      </ol>
      {visible.self && (
        <ol aria-label="Your place" start={visible.self.rank || undefined} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {renderRow(visible.self)}
        </ol>
      )}
      {unseen > 0 && (
        <div data-mm-board-more={unseen} style={{ color: style.muted, fontWeight: 800, fontSize: look === 'projector' ? 'clamp(14px, 1.4vw, 20px)' : 13, paddingLeft: 4 }}>
          {typeof describeMore === 'function' ? describeMore(unseen) : board?.moreText || `and ${unseen} more ${unseen === 1 ? 'player' : 'players'}`}
        </div>
      )}
    </div>
  );
}

/** What one player did in a round, in this room's terms. */
export const roundPerformanceText = (row, presentation) => {
  if (!row?.participated) return 'no answer';
  if (row.completed !== null && row.completed !== undefined) {
    const graphs = `${row.completed} graph${row.completed === 1 ? '' : 's'}`;
    return row.accuracyPercent === null ? graphs : `${graphs} · ${row.accuracyPercent}%`;
  }
  if (presentation?.strategyId === 'correctCount') return row.roundPoints > 0 ? 'correct' : 'not correct';
  return `${formatPoints(row.roundPoints)} pts`;
};

/**
 * One round's results: place in the round, what each player did, and — when
 * a round's place earns the match points (Grand Prix) — the points it earned.
 */
// `board`: a public list already decided (publicStandingsRows), drawn as it is.
export function RoundResultsTable({ view, presentation, look = 'console', limit = 6, selfKey = null, describeMore = null, board = null }) {
  const style = lookOf(look);
  if (!view) return <p style={{ margin: 0, color: style.muted }}>Tallying the round…</p>;
  const rows = view.rows || [];
  if (!rows.length) return <p style={{ margin: 0, color: style.muted }}>Nobody played this round.</p>;
  const shown = board ? board.rows : rows.slice(0, limit);
  const self = board ? board.self : selfKey ? rows.find((row) => row.isSelf && !shown.includes(row)) : null;
  const unseen = board ? board.hiddenCount : rows.length - shown.length - (self ? 1 : 0);
  const renderRow = (row) => (
    <li key={row.playerKey || row.alias} data-mm-round-result={row.playerKey || ''} style={{
      display: 'grid', gridTemplateColumns: `${look === 'projector' ? '3.4em' : '52px'} minmax(0,1fr) auto auto`, gap: 10, alignItems: 'center',
      minHeight: style.rowHeight, padding: '6px 12px', boxSizing: 'border-box', borderRadius: 10,
      background: row.isSelf ? style.self : style.row, border: `${row.isSelf ? 2 : 1}px solid ${row.isSelf ? style.selfBorder : style.rowBorder}`,
      color: style.text, fontSize: style.size,
    }}>
      <strong aria-label={row.place.spoken} style={{ textAlign: 'center' }}>{row.place.ordinal}</strong>
      <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.alias}</span>
      <span style={{ color: style.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{roundPerformanceText(row, presentation)}</span>
      <strong style={{ color: style.good, fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {presentation?.placementPoints ? `+${row.matchPointsAwarded}` : ''}
      </strong>
    </li>
  );
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <ol aria-label="Round results" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>{shown.map(renderRow)}</ol>
      {self && <ol aria-label="Your round result" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{renderRow(self)}</ol>}
      {unseen > 0 && (
        <div data-mm-board-more={unseen} style={{ color: style.muted, fontWeight: 800, fontSize: look === 'projector' ? 'clamp(14px, 1.4vw, 20px)' : 13, paddingLeft: 4 }}>
          {typeof describeMore === 'function' ? describeMore(unseen) : board?.moreText || `and ${unseen} more`}
        </div>
      )}
    </div>
  );
}

/**
 * A destructive action, asked once. Focus moves into the dialog (to the safe
 * choice), Escape and the backdrop cancel, and focus returns to the control
 * that opened it. Harmless controls never ask.
 */
export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', cancelLabel = 'Keep playing', onConfirm, onCancel, busy = false }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const openerRef = useRef(null);
  // Read through a ref: the console re-renders with a new onCancel every time
  // a student's progress arrives, and re-running the effect on each one would
  // pull focus back to "Keep playing" from under a teacher's keyboard.
  const onCancelRef = useLatest(onCancel);
  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onCancelRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      // A modal dialog keeps Tab inside it.
      const buttons = [...(dialogRef.current?.querySelectorAll('button:not([disabled])') || [])];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const inside = dialogRef.current.contains(document.activeElement);
      if (!inside || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openerRef.current?.focus?.();
    };
  }, [open, onCancelRef]);
  if (!open) return null;
  return (
    <div className="mm-shell-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel?.(); }}>
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="mm-shell-dialog-title" aria-describedby="mm-shell-dialog-body" className="mm-shell-dialog">
        <div id="mm-shell-dialog-title" style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>{title}</div>
        <div id="mm-shell-dialog-body" style={{ color: 'var(--mm-text)', lineHeight: 1.5 }}>{body}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 18 }}>
          <button ref={cancelRef} type="button" className="mm-shell-button" onClick={onCancel} style={{ minHeight: 44, padding: '10px 16px', borderRadius: 9, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 900, cursor: 'pointer' }}>{cancelLabel}</button>
          <button type="button" className="mm-shell-button" disabled={busy} onClick={onConfirm} style={{ minHeight: 44, padding: '10px 16px', borderRadius: 9, border: 0, background: '#b3261e', color: '#fff', fontWeight: 900, cursor: busy ? 'progress' : 'pointer', opacity: busy ? 0.6 : 1 }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ['#ffd166', '#5ee7ff', '#8df7c9', '#ff8fb1', '#c9a7ff', '#ffffff'];

/** A short burst for the final standings. Nothing under reduced motion; never blocks a control. */
export function Confetti({ pieces = 36 }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return null;
  return (
    <div className="mm-shell-confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, index) => (
        <span
          key={index}
          style={{
            left: `${(index * 37) % 100}%`,
            background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
            animationDuration: `${2200 + ((index * 131) % 1600)}ms`,
            animationDelay: `${(index * 53) % 900}ms`,
            transform: `rotate(${(index * 47) % 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/** "Reconnecting…" while a device is not in sync with the server. */
export function ConnectionPill({ state = 'online', look = 'student' }) {
  if (state === 'online') return null;
  const style = lookOf(look);
  const offline = state === 'offline';
  return (
    <span role="status" className="mm-shell-pill" style={{ background: offline ? 'rgba(255,180,171,.16)' : 'rgba(253,214,99,.16)', color: offline ? style.down : style.gold, border: `1px solid ${offline ? style.down : style.gold}` }}>
      <span className="mm-shell-dot mm-shell-pulse" style={{ background: offline ? style.down : style.gold }} />
      {offline ? 'Offline — reconnecting…' : 'Reconnecting…'}
    </span>
  );
}
