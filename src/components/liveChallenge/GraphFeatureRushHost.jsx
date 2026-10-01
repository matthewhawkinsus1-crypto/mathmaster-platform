import { graphFamilyLabel } from '../../../functions/shared/graphFeatureCatalog.mjs';
import { getGraphFeature } from '../../../functions/shared/graphFeatureRegistry.mjs';
import { rushPlayingCount, rushRaceRows, rushRoundResultRows, rushScoreUnit } from '../../platform/liveChallenge/rushStandingsModel.js';

/*
 * GRAPH FEATURE RUSH ON THE TEACHER'S SCREENS.
 *
 * The host sees the race — how many graphs each student has completed this
 * round — and, when a round closes, its results. Never a graph and never an
 * answer: every student has their own graphs, and the projector is for the
 * whole room. Two looks: `console` (the teacher's light panels) and
 * `projector` (the dark arena).
 */

const formatClock = (milliseconds) => {
  const total = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const ordinal = (place) => {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${({ 1: 'st', 2: 'nd', 3: 'rd' })[place % 10] || 'th'}`;
};

const LOOKS = Object.freeze({
  console: Object.freeze({
    text: 'var(--mm-text-strong)',
    muted: 'var(--mm-text-muted)',
    row: 'var(--mm-surface-muted)',
    rowBorder: 'var(--mm-border)',
    track: 'var(--mm-divider)',
    bar: 'linear-gradient(90deg, #1a73e8, #8ab4f8)',
    accent: 'var(--mm-primary)',
    good: 'var(--mm-success-text)',
    size: 14,
  }),
  projector: Object.freeze({
    text: '#f7f9ff',
    muted: 'rgba(236,241,255,.66)',
    row: 'rgba(255,255,255,.05)',
    rowBorder: 'rgba(255,255,255,.09)',
    track: 'rgba(255,255,255,.08)',
    bar: 'linear-gradient(90deg, #5ee7ff, #b8c8ff)',
    accent: '#9cb8ff',
    good: '#8df7c9',
    size: 18,
  }),
});

/** The settings a rush room runs with, in one line. */
export function rushSettingsLine(room = {}) {
  const config = room.graphFeatureRush?.config || {};
  const features = (config.features || []).map((id) => getGraphFeature(id)?.shortLabel || id);
  const difficulty = config.difficulty ? `${config.difficulty[0].toUpperCase()}${config.difficulty.slice(1)}` : null;
  return [
    `${room.roundCount || 1} round${Number(room.roundCount) === 1 ? '' : 's'}`,
    `${room.roundSeconds || 60}s each`,
    room.scoringStrategyId === 'grandPrix' ? 'Grand Prix' : 'Correct Count',
    difficulty,
    features.length ? features.join(', ') : null,
  ].filter(Boolean).join(' · ');
}

/** Graphs completed this round, as bars. */
export function RushRaceBoard({ players = [], roundIndex = 0, limit = 10, look = 'console' }) {
  const style = LOOKS[look] || LOOKS.console;
  const rows = rushRaceRows(players, roundIndex).slice(0, limit);
  const top = Math.max(1, ...rows.map((row) => row.completed));
  if (!rows.length) return <p style={{ margin: 0, color: style.muted }}>Players appear here as they join.</p>;
  return (
    <ol aria-label="Graphs completed this round" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7, textAlign: 'left' }}>
      {rows.map((row) => (
        <li key={row.playerKey} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 4, padding: '7px 10px', borderRadius: 10, background: style.row, border: `1px solid ${style.rowBorder}`, color: style.text, fontSize: style.size }}>
          <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.alias}</span>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{row.completed}</strong>
          <span aria-hidden="true" style={{ gridColumn: '1 / -1', height: 6, borderRadius: 999, background: style.track, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.round((row.completed / top) * 100)}%`, background: style.bar, transition: 'width 300ms ease' }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A closed round: place, graphs, accuracy and the points the place earned. */
export function RushRoundResultsBoard({ players = [], roundIndex = 0, scoringStrategyId = null, limit = 10, look = 'console' }) {
  const style = LOOKS[look] || LOOKS.console;
  const unit = rushScoreUnit(scoringStrategyId);
  const rows = rushRoundResultRows(players, roundIndex).slice(0, limit);
  if (!rows.length) return <p style={{ margin: 0, color: style.muted }}>Results appear when the round closes.</p>;
  return (
    <ol aria-label={`Round ${roundIndex + 1} results`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7, textAlign: 'left' }}>
      {rows.map(({ playerKey, alias, facts }) => (
        <li key={playerKey} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto auto', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: style.row, border: `1px solid ${style.rowBorder}`, color: style.text, fontSize: style.size }}>
          <strong style={{ textAlign: 'center' }}>{facts.rank != null ? ordinal(facts.rank) : '—'}</strong>
          <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alias}</span>
          <span style={{ color: style.muted, fontVariantNumeric: 'tabular-nums' }}>{facts.completed} graph{facts.completed === 1 ? '' : 's'}{facts.accuracyPercent != null ? ` · ${facts.accuracyPercent}%` : ''}</span>
          <strong style={{ color: style.good, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'right' }}>{unit.placement ? (facts.matchPointsAwarded ? `+${facts.matchPointsAwarded}` : '0') : ''}</strong>
        </li>
      ))}
    </ol>
  );
}

/** The teacher console's live panel for a rush round. */
export function RushHostStatus({ room, players = [], remainingMs = 0, joinedCount = 0, closing = false }) {
  const roundIndex = Number(room.currentRound) || 0;
  const closed = room.roundState === 'closed';
  const playing = rushPlayingCount(players, roundIndex);
  const graphs = rushRaceRows(players, roundIndex).reduce((sum, row) => sum + row.completed, 0);
  const low = !closed && remainingMs <= 10_000;
  return (
    <section style={{ background: 'var(--mm-surface)', border: '2px solid #1a73e8', borderRadius: 14, padding: 20, textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: 'var(--mm-primary)', fontSize: 12, fontWeight: 1000, textTransform: 'uppercase' }}>Round {roundIndex + 1} of {room.roundCount} · Graph Feature Rush</div>
          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 800, color: 'var(--mm-text-strong)' }}>{closed ? `Round ${roundIndex + 1} results` : 'Students are finding features on their own graphs.'}</div>
          <div style={{ marginTop: 6, color: 'var(--mm-text-muted)' }}>{rushSettingsLine(room)}</div>
        </div>
        <div style={{ minWidth: 150, textAlign: 'center', padding: 12, borderRadius: 12, background: low ? 'var(--mm-error-bg)' : 'var(--mm-info-bg)', color: low ? 'var(--mm-error-text)' : 'var(--mm-info-text)' }}>
          <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{closed ? 'Round closed' : closing ? 'Closing…' : 'Time left'}</div>
          <div style={{ fontSize: 38, fontWeight: 1000, fontVariantNumeric: 'tabular-nums' }}>{closed ? '—' : formatClock(remainingMs)}</div>
        </div>
      </div>
      {!closed && <div style={{ marginTop: 14, fontWeight: 800, color: 'var(--mm-text-muted)' }}>{playing} of {joinedCount} playing · {graphs} graph{graphs === 1 ? '' : 's'} completed this round</div>}
    </section>
  );
}

const pct = (value) => (value == null ? '—' : `${value}%`);

/** The after-game breakdown for a rush: by feature, by family, by student. */
export function RushReport({ report }) {
  const rush = report?.graphFeatureRush;
  if (!rush) return null;
  const table = (rows, title) => (
    <div>
      <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--mm-text-muted)', marginBottom: 6 }}>{title}</div>
      {rows.map((row) => (
        <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--mm-divider)', fontSize: 14 }}>
          <span>{row.label}</span>
          <span style={{ color: 'var(--mm-text-muted)' }}>{row.completed}/{row.questions} completed · {pct(row.accuracyPercent)} of taps right</span>
        </div>
      ))}
    </div>
  );
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14, color: 'var(--mm-text)' }}>
        <span><strong>{rush.graphsCompleted}</strong> graphs completed</span>
        <span>Tap accuracy <strong>{pct(rush.accuracyPercent)}</strong></span>
        <span><strong>{rush.skipped}</strong> skipped</span>
        <span>"Does Not Exist" right <strong>{pct(rush.doesNotExist?.accuracyPercent)}</strong> of {rush.doesNotExist?.presses || 0} presses</span>
      </div>
      {rush.byFeature?.length > 0 && table(rush.byFeature, 'By feature, hardest first')}
      {rush.byFamily?.length > 0 && table(rush.byFamily.map((row) => ({ ...row, label: graphFamilyLabel(row.key) || row.label })), 'By kind of graph, hardest first')}
    </section>
  );
}
