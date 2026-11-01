import { useRef } from 'react';
import { challengeClock, formatChallengeClock, stageHasOpenRound } from '../../platform/liveChallenge/challengeShellModel.js';
import { usePrefersReducedMotion, useTicker } from '../../platform/liveChallenge/challengeHooks.js';
import { formatPoints, standingsWindow } from '../../platform/liveChallenge/challengeStandingsModel.js';
import { SHELL_CSS } from './challengeShellCss.js';
import StartLights from './StartLights.jsx';
import Dialog from '../../ui/Dialog.jsx';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';

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
    size: 'calc(15 * var(--mm-px))',
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
    size: 'clamp(calc(16 * var(--mm-px)), calc(1.7vw * var(--mm-text-scale, 1)), calc(24 * var(--mm-px)))',
    rowHeight: 'clamp(40px, 6vh, 56px)',
    // Two tables in the space of one (the projector's results beside a worked
    // solution, LC03): still readable from the back of a classroom, a
    // fifth smaller, and the same text scale a teacher chose.
    compactSize: 'clamp(calc(15 * var(--mm-px)), calc(1.45vw * var(--mm-text-scale, 1)), calc(21 * var(--mm-px)))',
    compactRowHeight: 'clamp(32px, 4.8vh, 44px)',
  }),
  // The Grand Prix's race night (grandPrixTheme.js): a student's own row in
  // magenta light, gold for the leader and the countdown's title.
  student: Object.freeze({
    text: '#eef2ff',
    muted: '#b8c4ef',
    row: 'rgba(20,28,84,.6)',
    rowBorder: 'rgba(53,227,255,.16)',
    self: 'rgba(255,63,209,.2)',
    selfBorder: '#ff7ae0',
    accent: '#ffd23f',
    good: '#45ff8a',
    up: '#45ff8a',
    down: '#ff8fa3',
    gold: '#ffd23f',
    size: 'calc(15 * var(--mm-px))',
    rowHeight: 40,
  }),
});

const lookOf = (look) => SHELL_LOOKS[look] || SHELL_LOOKS.console;

// The line under a board that leaves players off ("and 3 more players · …"):
// a little smaller and tighter in compact rows, where it is one of two.
const moreLineStyle = (look, style, compact) => ({
  color: style.muted,
  fontWeight: 800,
  fontSize: look !== 'projector'
    ? 'calc(13 * var(--mm-px))'
    : compact
      ? 'clamp(calc(13 * var(--mm-px)), calc(1.15vw * var(--mm-text-scale, 1)), calc(17 * var(--mm-px)))'
      : 'clamp(calc(14 * var(--mm-px)), calc(1.4vw * var(--mm-text-scale, 1)), calc(20 * var(--mm-px)))',
  lineHeight: compact ? 1.25 : undefined,
  paddingLeft: 4,
});

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

// A student's countdown number, in the Grand Prix's neon: offset shadows, no
// blur (a new number is drawn every second).
const STUDENT_COUNT_GLOW = Object.freeze({ fontStyle: 'italic', textShadow: '4px 4px 0 rgba(255,63,209,.7), 0 7px 0 rgba(10,16,52,.9)' });

/**
 * 3 · 2 · 1 · GO, from the round's authoritative start. `clock` is a
 * useChallengeClock reading: the number changes exactly on the second, on
 * every screen at once, and a screen that wakes mid-countdown shows the step
 * the server clock is on — there is no local countdown to drift. A student's
 * device adds the start lights, lit off the same step.
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
      {title && <div style={{ fontSize: look === 'projector' ? 'clamp(calc(20 * var(--mm-px)), calc(2.6vw * var(--mm-text-scale, 1)), calc(34 * var(--mm-px)))' : 'calc(18 * var(--mm-px))', fontWeight: 900, color: style.accent, letterSpacing: '.04em', textTransform: 'uppercase' }}>{title}</div>}
      {look === 'student' && <div style={{ margin: '12px 0 4px' }}><StartLights step={step} go={go} /></div>}
      <div key={text} className="mm-shell-count-number" aria-hidden="true" style={{ fontSize, color: go ? style.good : style.text, ...(look === 'student' ? STUDENT_COUNT_GLOW : null) }}>{text}</div>
      <div aria-live="polite" style={{ fontSize: look === 'projector' ? 'clamp(calc(18 * var(--mm-px)), calc(2vw * var(--mm-text-scale, 1)), calc(28 * var(--mm-px)))' : 'calc(16 * var(--mm-px))', fontWeight: 800, color: style.muted }}>
        {go ? 'Go!' : `Get ready… ${step}`}{detail ? ` · ${detail}` : ''}
      </div>
    </div>
  );
}

/**
 * A row's rank: "1", "T-2" — with words for a screen reader. The words are a
 * hidden span's: a label on a bare <strong> is not read (AX18).
 */
function RankCell({ row, style, look }) {
  const medal = look !== 'console' && row.rank === 1 ? style.gold : null;
  return (
    <strong style={{ textAlign: 'center', color: medal || style.text, fontVariantNumeric: 'tabular-nums' }}>
      <span aria-hidden="true">{row.place.short}</span>
      <span style={SR_ONLY_STYLE}>{row.place.spoken}</span>
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
  // Smaller rows, for two lists sharing one column (the projector's results
  // beside a worked solution). A look with no compact size draws as usual.
  compact = false,
}) {
  const style = lookOf(look);
  const rowHeight = compact && style.compactRowHeight ? style.compactRowHeight : style.rowHeight;
  const rowSize = compact && style.compactSize ? style.compactSize : style.size;
  const rowGap = compact ? 4 : 6;
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
          minHeight: rowHeight,
          padding: compact ? '3px 12px' : '6px 12px',
          boxSizing: 'border-box',
          borderRadius: 10,
          background: row.isSelf ? style.self : style.row,
          border: `${row.isSelf ? 2 : 1}px solid ${row.isSelf ? style.selfBorder : style.rowBorder}`,
          color: style.text,
          fontSize: rowSize,
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
            <span style={{ fontWeight: 900, color: row.movement.direction === 'up' ? style.up : style.down }}>
              <span aria-hidden="true">{row.movement.text}</span>
              <span style={SR_ONLY_STYLE}>{row.movement.spoken}</span>
            </span>
          )}
        </span>
        <strong key={row.score} className="mm-shell-bump" style={{ fontVariantNumeric: 'tabular-nums', padding: '0 4px', textAlign: 'right' }}>
          {formatPoints(row.score)}{look !== 'projector' && <span style={{ fontSize: '.75em', fontWeight: 800, color: style.muted }}> {unit}</span>}
        </strong>
      </li>
    );
  };
  return (
    <div style={{ display: 'grid', gap: rowGap }}>
      <ol aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: rowGap }}>
        {visible.top.map(renderRow)}
      </ol>
      {visible.self && (
        <ol aria-label="Your place" start={visible.self.rank || undefined} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: rowGap }}>
          {renderRow(visible.self)}
        </ol>
      )}
      {unseen > 0 && (
        <div data-mm-board-more={unseen} style={moreLineStyle(look, style, compact)}>
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
export function RoundResultsTable({ view, presentation, look = 'console', limit = 6, selfKey = null, describeMore = null, board = null, compact = false }) {
  const style = lookOf(look);
  const rowHeight = compact && style.compactRowHeight ? style.compactRowHeight : style.rowHeight;
  const rowSize = compact && style.compactSize ? style.compactSize : style.size;
  const rowGap = compact ? 4 : 6;
  if (!view) return <p style={{ margin: 0, color: style.muted }}>Tallying the round…</p>;
  const rows = view.rows || [];
  if (!rows.length) return <p style={{ margin: 0, color: style.muted }}>Nobody played this round.</p>;
  const shown = board ? board.rows : rows.slice(0, limit);
  const self = board ? board.self : selfKey ? rows.find((row) => row.isSelf && !shown.includes(row)) : null;
  const unseen = board ? board.hiddenCount : rows.length - shown.length - (self ? 1 : 0);
  const renderRow = (row) => (
    <li key={row.playerKey || row.alias} data-mm-round-result={row.playerKey || ''} style={{
      display: 'grid', gridTemplateColumns: `${look === 'projector' ? '3.4em' : '52px'} minmax(0,1fr) auto auto`, gap: 10, alignItems: 'center',
      minHeight: rowHeight, padding: compact ? '3px 12px' : '6px 12px', boxSizing: 'border-box', borderRadius: 10,
      background: row.isSelf ? style.self : style.row, border: `${row.isSelf ? 2 : 1}px solid ${row.isSelf ? style.selfBorder : style.rowBorder}`,
      color: style.text, fontSize: rowSize,
    }}>
      <strong style={{ textAlign: 'center' }}>
        <span aria-hidden="true">{row.place.ordinal}</span>
        <span style={SR_ONLY_STYLE}>{row.place.spoken}</span>
      </strong>
      <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.alias}</span>
      <span style={{ color: style.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{roundPerformanceText(row, presentation)}</span>
      <strong style={{ color: style.good, fontVariantNumeric: 'tabular-nums', minWidth: 40, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {presentation?.placementPoints ? `+${row.matchPointsAwarded}` : ''}
      </strong>
    </li>
  );
  return (
    <div style={{ display: 'grid', gap: rowGap }}>
      <ol aria-label="Round results" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: rowGap }}>{shown.map(renderRow)}</ol>
      {self && <ol aria-label="Your round result" style={{ listStyle: 'none', margin: 0, padding: 0 }}>{renderRow(self)}</ol>}
      {unseen > 0 && (
        <div data-mm-board-more={unseen} style={moreLineStyle(look, style, compact)}>
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
  const cancelRef = useRef(null);
  // Dialog focuses "Keep playing", traps Tab, cancels on Escape and returns
  // focus. It reads onCancel through a ref and focuses once per opening: the
  // console re-renders with a new onCancel every time a student's progress
  // arrives, and that must not pull focus from under a teacher's keyboard.
  if (!open) return null;
  return (
    <div className="mm-shell-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel?.(); }}>
      <Dialog role="alertdialog" onClose={onCancel} initialFocusRef={cancelRef} aria-labelledby="mm-shell-dialog-title" aria-describedby="mm-shell-dialog-body" className="mm-shell-dialog">
        <div id="mm-shell-dialog-title" style={{ fontSize: 'calc(20 * var(--mm-px))', fontWeight: 900, marginBottom: 8 }}>{title}</div>
        <div id="mm-shell-dialog-body" style={{ color: 'var(--mm-text)', lineHeight: 1.5 }}>{body}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 18 }}>
          <button ref={cancelRef} type="button" className="mm-shell-button" onClick={onCancel} style={{ minHeight: 44, padding: '10px 16px', borderRadius: 9, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 900, cursor: 'pointer' }}>{cancelLabel}</button>
          <button type="button" className="mm-shell-button" disabled={busy} onClick={onConfirm} style={{ minHeight: 44, padding: '10px 16px', borderRadius: 9, border: 0, background: '#b3261e', color: '#fff', fontWeight: 900, cursor: busy ? 'progress' : 'pointer', opacity: busy ? 0.6 : 1 }}>{confirmLabel}</button>
        </div>
      </Dialog>
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
