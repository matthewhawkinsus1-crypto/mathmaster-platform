import { HOST_COMMAND } from '../../platform/liveChallenge/challengeShellModel.js';
import { PRESENCE } from '../../platform/liveChallenge/challengePresenceModel.js';
import { SOLUTION_STATE, answerSummaryLabel, solutionStateMessage } from '../../platform/liveChallenge/challengeSolutionModel.js';
import MathText from '../common/MathText.jsx';
import { RoundResultsTable, StandingsBoard } from './ChallengeShellParts.jsx';

/*
 * THE TEACHER'S CONSOLE DURING A GAME.
 *
 * A teacher running a class has seconds of attention for this screen, so it
 * answers four things at a glance — where the game is, how long is left, who
 * is in, and the ONE thing to press next — and keeps everything else (the
 * names, the report, the audio) out of the way below.
 *
 * Names appear here and only here. The roster panel maps the anonymous game
 * aliases to students for the teacher; the projector, which the class sees,
 * never receives it.
 */

const card = { background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: 14, padding: 16, textAlign: 'left', color: 'var(--mm-text-strong)' };
const primaryButton = { minHeight: 48, border: 0, borderRadius: 10, padding: '12px 20px', background: 'var(--mm-primary)', color: 'var(--mm-on-primary, #fff)', fontWeight: 900, fontSize: 16, cursor: 'pointer' };
const secondaryButton = { minHeight: 44, border: '1px solid var(--mm-border)', borderRadius: 10, padding: '10px 14px', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 900, cursor: 'pointer' };

const STAGE_LABELS = Object.freeze({
  lobby: { text: 'Lobby', tone: 'info' },
  countdown: { text: 'Starting', tone: 'warning' },
  roundActive: { text: 'Round live', tone: 'success' },
  roundPaused: { text: 'Paused', tone: 'warning' },
  roundLocked: { text: 'Time!', tone: 'warning' },
  roundResults: { text: 'Results', tone: 'info' },
  completed: { text: 'Game over', tone: 'success' },
  cancelled: { text: 'Cancelled', tone: 'muted' },
});

const TONES = Object.freeze({
  info: { background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', border: 'var(--mm-info-border)' },
  success: { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', border: 'var(--mm-success-border)' },
  warning: { background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: 'var(--mm-warning-border)' },
  muted: { background: 'var(--mm-surface-muted)', color: 'var(--mm-text-muted)', border: 'var(--mm-border)' },
});

/** The stage, as a pill a teacher can read across the room. */
export function StagePill({ stage }) {
  const label = STAGE_LABELS[stage] || { text: 'Loading', tone: 'muted' };
  const tone = TONES[label.tone];
  return (
    <span data-mm-stage={stage || 'loading'} className="mm-shell-pill" style={{ background: tone.background, color: tone.color, border: `1px solid ${tone.border}` }}>
      {stage === 'roundActive' && <span className="mm-shell-dot mm-shell-pulse" style={{ background: tone.color }} />}
      {label.text}
    </span>
  );
}

/**
 * The one control to press now, with why — and the secondary controls the
 * stage allows. Every lifecycle button is disabled while any command is in
 * flight (the console's single command lock); destructive ones confirm first.
 */
export function HostControlBar({
  action,
  busy = '',
  controlBusy = false,
  onPrimary,
  secondary = [],
}) {
  // The primary button names its own work while its command is in flight.
  const workingLabel = ({ [HOST_COMMAND.START]: busy === 'start' && 'Starting…', [HOST_COMMAND.ADVANCE]: busy === 'advance' && 'Loading…', [HOST_COMMAND.PLAY_AGAIN]: busy === 'replay' && 'Creating the lobby…' })[action?.command] || null;
  return (
    <div data-mm-host-controls="1" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {action?.command && (
        <button
          type="button"
          data-mm-primary-action={action.command}
          disabled={action.disabled || controlBusy || busy === 'replay'}
          onClick={onPrimary}
          className="mm-shell-button"
          style={{ ...primaryButton, opacity: action.disabled || controlBusy ? 0.55 : 1, cursor: action.disabled || controlBusy ? 'not-allowed' : 'pointer' }}
        >
          {workingLabel || action.label}
        </button>
      )}
      {secondary.filter(Boolean).map((control) => (
        <button
          key={control.key}
          type="button"
          disabled={control.disabled || controlBusy}
          onClick={control.onClick}
          className="mm-shell-button"
          style={{ ...secondaryButton, color: control.danger ? 'var(--mm-error-text)' : secondaryButton.color, opacity: control.disabled || controlBusy ? 0.55 : 1 }}
        >
          {busy === control.key && control.busyLabel ? control.busyLabel : control.label}
        </button>
      ))}
      {action?.hint && <span style={{ flex: '1 1 260px', color: 'var(--mm-text-muted)', fontSize: 14, lineHeight: 1.45 }}>{action.hint}</span>}
    </div>
  );
}

const presenceColor = (presence) => (presence.state === PRESENCE.CONNECTED ? 'var(--mm-success-text)'
  : presence.state === PRESENCE.NO_SIGNAL ? 'var(--mm-error-text)'
    : presence.state === PRESENCE.JOINED ? 'var(--mm-info-text)'
      : 'var(--mm-text-muted)');

/**
 * Who is in, by name. Joined or not, connected or quiet ("no signal 2 min" —
 * what the server last heard, not a guess that they left), back after a drop,
 * on two devices, and — during a round — finished or still working.
 */
export function HostRosterPanel({ roster, stage, showAliases = false, onToggleAliases = null, title = 'Students' }) {
  if (!roster) return null;
  const { entries, summary, hasNames } = roster;
  const inRound = ['countdown', 'roundActive', 'roundLocked', 'roundPaused'].includes(stage);
  return (
    <section aria-label="Class roster" style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
        <div style={{ color: 'var(--mm-text-muted)', fontSize: 13, fontWeight: 800 }}>
          {summary.joined} of {summary.invited} joined
          {summary.noSignal > 0 ? ` · ${summary.noSignal} no signal` : ''}
          {summary.multiDevice > 0 ? ` · ${summary.multiDevice} on 2+ devices` : ''}
        </div>
      </div>
      {!hasNames && <p style={{ margin: '0 0 8px', color: 'var(--mm-text-muted)', fontSize: 13 }}>Showing game names; student names load in a moment.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', gap: 6 }}>
        {entries.map((entry) => {
          const { presence } = entry;
          return (
            <li
              key={entry.playerKey}
              data-mm-roster={presence.state}
              style={{
                display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', gap: 8, alignItems: 'center',
                padding: '7px 10px', borderRadius: 9, background: presence.state === PRESENCE.NOT_JOINED ? 'transparent' : 'var(--mm-surface-muted)',
                border: `1px ${presence.state === PRESENCE.NOT_JOINED ? 'dashed' : 'solid'} var(--mm-border)`, fontSize: 14,
              }}
            >
              <span className="mm-shell-dot" aria-hidden="true" style={{ background: presenceColor(presence) }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: presence.state === PRESENCE.NOT_JOINED ? 'var(--mm-text-muted)' : 'var(--mm-text-strong)' }}>{entry.name}</span>
                <span style={{ display: 'block', fontSize: 12, color: presenceColor(presence) }}>
                  {presence.label}
                  {presence.devices > 1 ? ` · ${presence.devices} devices` : ''}
                  {showAliases && entry.alias && hasNames ? ` · ${entry.alias}` : ''}
                </span>
              </span>
              {inRound && presence.state !== PRESENCE.NOT_JOINED && (
                <span style={{ fontSize: 12, fontWeight: 900, color: entry.finishedRound ? 'var(--mm-success-text)' : 'var(--mm-text-muted)' }}>
                  {entry.finishedRound ? '✓ done' : 'working'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {typeof onToggleAliases === 'function' && hasNames && (
        <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13, color: 'var(--mm-text-muted)' }}>
          <input type="checkbox" checked={showAliases} onChange={(event) => onToggleAliases(event.target.checked)} />
          Show each student&apos;s game name (keep off while this screen is projected)
        </label>
      )}
    </section>
  );
}

/** "Not joined: Ana R., Ben T." — the lobby question, answered by name. */
export function NotJoinedLine({ roster }) {
  const names = roster?.summary?.notJoined || [];
  if (!roster?.hasNames || !names.length) return null;
  return (
    <p style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 14 }}>
      <strong style={{ color: 'var(--mm-text-strong)' }}>Not joined yet:</strong> {names.slice(0, 12).join(', ')}{names.length > 12 ? ` and ${names.length - 12} more` : ''}
    </p>
  );
}

/** A closed round on the console: its table and the standings it left. */
export function HostRoundResultsPanel({ view, presentation, roundNumber, fallbackRows = [] }) {
  // The standings arrive with the round's result. A round closed before
  // results carried standings shows the live board instead.
  const standings = view ? (view.standings || fallbackRows) : null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14 }}>
      <section style={card} aria-label={`Round ${roundNumber} results`}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Round {roundNumber} results{presentation?.placementPoints ? ' · championship points' : ''}</div>
        <RoundResultsTable view={view} presentation={presentation} look="console" limit={10} />
      </section>
      <section style={card} aria-label="Standings after this round">
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>{presentation?.placementPoints ? 'Championship' : 'Standings'} after round {roundNumber}</div>
        {standings
          ? <StandingsBoard rows={standings} presentation={presentation} look="console" limit={10} showCorrect={!presentation?.placementPoints} label="Standings after this round" />
          : <p style={{ margin: 0, color: 'var(--mm-text-muted)' }}>Tallying the round…</p>}
      </section>
    </div>
  );
}

/**
 * A closed round's worked solution on the console, so the teacher can talk it
 * through. The console reads it (useRoundSolution) only once the server has
 * published it, and renders this only on the results screen; a held round
 * says it comes after the Second Chance rounds.
 */
export function HostSolutionPanel({ solution = null, state = SOLUTION_STATE.NONE }) {
  if (!state || state === SOLUTION_STATE.NONE) return null;
  const review = state === SOLUTION_STATE.READY ? solution?.solutionReview || {} : null;
  const steps = review && Array.isArray(review.reasoning) ? review.reasoning.filter(Boolean) : [];
  return (
    <section aria-label="Worked solution" data-mm-host-solution={state} style={card}>
      <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Worked solution</div>
      {!review && <p style={{ margin: 0, color: 'var(--mm-text-muted)' }}>{solutionStateMessage(state)}</p>}
      {review && (
        <div style={{ display: 'grid', gap: 8, lineHeight: 1.5 }}>
          {solution?.prompt && <MathText as="div" style={{ whiteSpace: 'pre-wrap', color: 'var(--mm-text-muted)' }}>{solution.prompt}</MathText>}
          {review.headline && <MathText as="div" style={{ fontWeight: 900, fontSize: 17 }}>{review.headline}</MathText>}
          {steps.length > 0 && <ol style={{ margin: 0, paddingLeft: 22 }}>{steps.map((step, index) => <li key={index}><MathText>{step}</MathText></li>)}</ol>}
          {review.answerSummary && <div><strong>{answerSummaryLabel(review.answerSummary)}:</strong> <MathText>{review.answerSummary}</MathText></div>}
          {review.commonError && <div><strong>Watch out:</strong> <MathText>{review.commonError}</MathText></div>}
          {review.connection && <div style={{ color: 'var(--mm-text-muted)' }}><MathText>{review.connection}</MathText></div>}
        </div>
      )}
    </section>
  );
}
