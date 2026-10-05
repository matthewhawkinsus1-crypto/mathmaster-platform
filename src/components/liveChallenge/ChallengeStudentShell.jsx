import { RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';
import { amountText, ordinal, rewardSummaryLines, roundPlacementSentence } from '../../platform/liveChallenge/challengeStandingsModel.js';
import { RoundResultsTable, StandingsBoard } from './ChallengeShellParts.jsx';

/*
 * A STUDENT'S LIVE CHALLENGE, AROUND THE GAME ITSELF.
 *
 * The game mode owns the round (a question, a graph). These cards own
 * everything around it, and each answers "what do I do now?" in words: you
 * are in and waiting; get ready; you finished, the others are still going;
 * here is how your round went and what comes next; the challenge is over and
 * here is how you finished.
 *
 * A student's own place and points come from the round's result document —
 * written once, when the round closed — so what they read here is exactly
 * what the projector shows, also after a refresh.
 */

const card = {
  padding: 'clamp(18px, 4vw, 28px)',
  borderRadius: 18,
  background: 'linear-gradient(135deg,#1d3a6e,#25508f)',
  border: '1px solid rgba(174,203,250,.35)',
  textAlign: 'center',
  color: '#eef1f6',
};
const eyebrow = { fontSize: 13, fontWeight: 900, color: '#aecbfa', textTransform: 'uppercase', letterSpacing: '.08em' };
const quietPanel = { padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', textAlign: 'left', color: '#eef1f6' };

function Stat({ value, label }) {
  return (
    <div style={{ minWidth: 92 }}>
      <div style={{ fontSize: 'clamp(30px, 8vw, 40px)', fontWeight: 1000, color: '#f7f9ff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: '#c3d2ea' }}>{label}</div>
    </div>
  );
}

/** One plain sentence: what is happening and what to do. */
export function StudentGuidance({ guidance, compact = false }) {
  if (!guidance) return null;
  return (
    <div aria-live="polite" data-mm-guidance={guidance.tone} style={{ padding: compact ? '10px 14px' : '14px 18px', borderRadius: 12, background: 'rgba(23,54,95,.85)', border: '1px solid rgba(138,180,248,.35)', color: '#dbeafe', textAlign: 'left' }}>
      <strong style={{ display: 'block', fontSize: compact ? 16 : 18, color: '#fff' }}>{guidance.headline}</strong>
      {guidance.detail && <span style={{ display: 'block', marginTop: 3, fontWeight: 700 }}>{guidance.detail}</span>}
    </div>
  );
}

/** The lobby: who you are, who is here, what the game is, and that the teacher starts it. */
export function StudentLobbyCard({ room, alias, joining = false, playerCount = 0 }) {
  const rush = room?.challengeMode === RUSH_MODE_ID;
  const rewards = rewardSummaryLines(room?.rewardSummary);
  const rounds = Number(room?.roundCount) || 0;
  return (
    <section data-mm-student-lobby="1" style={{ ...card, padding: 30 }}>
      <div style={eyebrow}>You are in as</div>
      <div style={{ marginTop: 8, fontSize: 'clamp(28px, 8vw, 38px)', fontWeight: 1000, color: '#fff', overflowWrap: 'anywhere' }}>{alias || 'Player'}</div>
      <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 16px', borderRadius: 999, background: 'rgba(0,0,0,.28)' }}>
        <span aria-hidden="true" className="mm-shell-pulse" style={{ width: 9, height: 9, borderRadius: '50%', background: '#81c995' }} />
        <span style={{ fontSize: 17, fontWeight: 800 }}>{joining ? 'Joining…' : `${playerCount} ${playerCount === 1 ? 'player' : 'players'} in`}</span>
      </div>
      <p style={{ margin: '18px 0 0', color: '#e8f0fe', fontWeight: 800, fontSize: 18 }}>Waiting for your teacher to start. Keep this screen open.</p>
      <p style={{ margin: '8px 0 0', color: '#c3d2ea' }}>
        {rush ? 'Graph Feature Rush — tap the features on your own graphs' : room?.challengeMode === 'solverRace' ? 'Solver Race' : 'Live Challenge'}
        {rounds ? ` · ${rounds} round${rounds === 1 ? '' : 's'}` : ''}
        {room?.timingMode === 'pace' ? ' · Pace Race' : room?.roundSeconds ? ` · ${rush ? '' : 'about '}${room.roundSeconds}s each` : ''}
      </p>
      {rewards.length > 0 && <p style={{ margin: '10px 0 0', color: '#fdd663', fontWeight: 900 }}>🏆 {rewards.join(' · ')}</p>}
    </section>
  );
}

/**
 * The results moment on a student's device: their place in the round, what
 * they did, the points it earned, and where they stand now — then what comes
 * next. Read from the round's result document (`view`).
 */
export function StudentRoundResultsCard({ view, presentation, guidance, rushRound = false }) {
  if (!view) {
    return (
      <section aria-live="polite" style={card}>
        <div style={eyebrow}>{guidance?.headline || 'Round complete'}</div>
        <p style={{ margin: '14px 0 0', color: '#dbe6f7', fontWeight: 800 }}>Tallying the round…</p>
      </section>
    );
  }
  const self = view.self;
  const standing = view.selfStanding;
  const participated = Boolean(self?.participated);
  // In a rush every joined student has their own graphs: one who never
  // completed one is told so in graphs, not "no answer".
  const completed = self ? (self.completed ?? 0) : null;
  const headline = rushRound && self && !participated
    ? 'No graphs completed this round.'
    : roundPlacementSentence(self, view.fieldSize);
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section aria-live="polite" data-mm-student-results={participated ? 'played' : 'none'} style={card}>
        <div style={eyebrow}>{guidance?.headline || 'Round results'}</div>
        <div style={{ marginTop: 10, fontSize: 'clamp(22px, 6vw, 30px)', fontWeight: 1000, color: '#fff' }}>{headline}</div>
        {self && (participated || rushRound) && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 26, flexWrap: 'wrap' }}>
            {rushRound || self.completed !== null
              ? <Stat value={completed} label={completed === 1 ? 'graph completed' : 'graphs completed'} />
              : <Stat value={presentation.strategyId === 'correctCount' ? (self.roundPoints > 0 ? '✓' : '✗') : `+${self.roundPoints.toLocaleString()}`} label={presentation.strategyId === 'correctCount' ? (self.roundPoints > 0 ? 'correct' : 'not correct') : 'points this round'} />}
            {participated && self.accuracyPercent !== null && <Stat value={`${self.accuracyPercent}%`} label="accuracy" />}
            {participated && <Stat value={self.place.short === '—' ? '—' : self.place.ordinal} label={`of ${view.fieldSize} this round`} />}
          </div>
        )}
        {presentation.placementPoints && self && (
          <div style={{ marginTop: 16, fontSize: 20, fontWeight: 1000, color: '#fdd663' }}>
            {self.matchPointsAwarded > 0 ? `+${self.matchPointsAwarded} championship points` : 'No championship points this round'}
          </div>
        )}
        {/* A rush round ranks work, and a target found on a graph left
            unfinished is part of it: say so beside "0 graphs completed". */}
        {rushRound && self && completed === 0 && self.matchPointsAwarded > 0 && (
          <p style={{ margin: '8px 0 0', color: '#c3d2ea' }}>Targets you found on a graph you did not finish still count toward your place.</p>
        )}
        {standing && (
          <div style={{ marginTop: 12, fontWeight: 900, color: '#eef1f6' }}>
            Overall: {standing.place.spoken} · {amountText(standing.score, presentation.total)}
            {standing.movement && standing.movement.direction !== 'same' && <span aria-label={standing.movement.spoken} style={{ marginLeft: 8, color: standing.movement.direction === 'up' ? '#81c995' : '#ffb4ab' }}>{standing.movement.text}</span>}
          </div>
        )}
        {self && !participated && rushRound && <p style={{ margin: '12px 0 0', color: '#c3d2ea' }}>Tap the features on your graphs to earn points.</p>}
        {guidance?.detail && <p style={{ margin: '14px 0 0', color: '#c3d2ea' }}>{guidance.detail}</p>}
      </section>
      <section style={quietPanel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <strong>{presentation.placementPoints ? 'Championship' : 'Standings'}</strong>
          <span style={{ color: '#9fb0cc', fontSize: 13 }}>{presentation.total.long}</span>
        </div>
        {view.standings
          ? <StandingsBoard rows={view.standings} presentation={presentation} look="student" limit={5} selfKey={standing?.playerKey || null} label="Standings after this round" />
          : <RoundResultsTable view={view} presentation={presentation} look="student" limit={5} selfKey={self?.playerKey || null} />}
      </section>
    </div>
  );
}

/** The end: how you finished, your game, what reached your wallet, and the top of the class. */
export function StudentFinalCard({ selfRow, presentation, totalPlayers = 0, rows = [], selfKey = null, rewardsSlot = null, rush = false, loading = false }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section data-mm-student-final="1" style={{ ...card, background: 'linear-gradient(135deg,#14532d,#1c7a44)', border: '1px solid rgba(129,201,149,.4)' }}>
        <div style={{ ...eyebrow, color: '#b7e4c7' }}>Challenge complete</div>
        {selfRow ? (
          <div style={{ margin: '10px 0 4px' }}>
            <div style={{ fontSize: 'clamp(40px, 12vw, 56px)', fontWeight: 1000, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{selfRow.place.ordinal}</div>
            <div style={{ marginTop: 4, color: '#d7f5e1', fontWeight: 800 }}>
              {selfRow.tied ? `tied for ${ordinal(selfRow.rank)} ` : ''}of {totalPlayers} {totalPlayers === 1 ? 'player' : 'players'}
            </div>
            <div style={{ marginTop: 10, fontSize: 19, fontWeight: 900, color: '#fdd663' }}>
              {amountText(selfRow.score, presentation.total)}
              {presentation.placementPoints || presentation.strategyId !== 'correctCount'
                ? ` · ${selfRow.correctCount} ${rush ? (selfRow.correctCount === 1 ? 'graph' : 'graphs') : 'correct'}`
                : ''}
            </div>
          </div>
        ) : (
          // Until the standings arrive (a refresh on the podium) there is no
          // row to find yet — not a student who missed the game.
          <p data-mm-final-loading={loading ? '1' : undefined} style={{ margin: '10px 0 0', color: '#d7f5e1' }}>
            {loading ? 'Loading your final place…' : 'You joined after the last round.'}
          </p>
        )}
        <h2 style={{ margin: '12px 0 6px', fontSize: 22, color: '#fff' }}>Final Standings</h2>
        <p style={{ margin: 0, color: '#c9e7d4' }}>Your game score is practice feedback. It does not change your assignment grade.</p>
      </section>
      {rewardsSlot}
      <section style={quietPanel}>
        <StandingsBoard rows={rows} presentation={presentation} look="student" limit={5} selfKey={selfKey} showMovement={false} label="Final standings" totalCount={totalPlayers || null} />
      </section>
    </div>
  );
}

