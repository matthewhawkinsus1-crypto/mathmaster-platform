import { RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';
import { amountText, ordinal, rewardSummaryLines, roundPlacementSentence } from '../../platform/liveChallenge/challengeStandingsModel.js';
import { finalPlaceIsPrivate, gameGradeSentence, recapHasContent, RESULT_TONE } from '../../platform/liveChallenge/challengeRecapModel.js';
import { publicStandingsRows } from '../../platform/liveChallenge/liveChallengeProjectorModel.js';
import { RoundResultsTable, StandingsBoard } from './ChallengeShellParts.jsx';
import { RoundSolutionCard } from './ChallengeSolutionParts.jsx';

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
 *
 * `solutionSlot` is the round's worked solution (ChallengeSolutionParts), which
 * the caller renders only for this closed round; it sits between how the round
 * went and the standings, where the class talks the question through.
 */
// Classmates' rows follow the projector's rule for `room`
// (liveChallengeProjectorModel.publicStandingsRows): the top few, never a
// place tied with the class's last, never one classmate left unnamed. A
// student's own row is always shown.
export function StudentRoundResultsCard({ view, presentation, guidance, rushRound = false, solutionSlot = null, room = null }) {
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
      {solutionSlot}
      <section style={quietPanel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <strong>{presentation.placementPoints ? 'Championship' : 'Standings'}</strong>
          <span style={{ color: '#9fb0cc', fontSize: 13 }}>{presentation.total.long}</span>
        </div>
        {/* The class's copy lists only the public rows; the view says where
            the class's last group starts and how many play, so the student's
            own row is placed without the rule naming anyone else. */}
        {view.standings
          ? <StandingsBoard board={publicStandingsRows(room, view.standings, { selfKey: standing?.playerKey || null, ...view.standingsBoard })} presentation={presentation} look="student" label="Standings after this round" />
          : <RoundResultsTable view={view} board={publicStandingsRows(room, view.rows, { selfKey: self?.playerKey || null, ...view.tableBoard })} presentation={presentation} look="student" />}
      </section>
    </div>
  );
}

/**
 * The end: how you finished, what reached your wallet, then the top of the
 * class (with your own row when you are outside it).
 *
 * NOBODY IS PUBLICLY LAST (liveChallengePrivacy.mjs). The card leads with the
 * place only for a podium finish. Any other finish leads with what the student
 * did — their points, their correct answers, what they earned or beat — and
 * their place is one quiet line that says it is theirs alone. Being 18th of 24
 * is information; making it the headline is a verdict.
 *
 * What the game counts for is said truthfully: a Warm-Up game's accuracy is
 * the student's Warm-Up grade (warmupChallengeGrade.mjs) and its points are
 * not; a standalone game changes no grade.
 */
// `rows` are the snapshot's top of the class and this student; `lastRank` is
// the class's last place (the snapshot's every-seat rank list) and
// `totalPlayers` how many played, so the rule sees the whole class.
// `headline` is the server's word, from this student's own summary, that
// their place may lead the card (finalPlaceIsHeadline: a podium finish that
// does not tie the class's last place). Absent means no.
export function StudentFinalCard({ selfRow, presentation, totalPlayers = 0, rows = [], selfKey = null, rewardsSlot = null, rush = false, loading = false, warmup = false, highlights = [], fullStandings = false, room = null, lastRank = null, headline = false }) {
  const podium = Boolean(selfRow) && headline === true;
  // "Only you see this" is said only when no class-wide board shows the row.
  const placeIsPrivate = Boolean(selfRow) && finalPlaceIsPrivate({ rank: selfRow.rank, fullStandings });
  const placeWords = selfRow && selfRow.rank !== null
    ? `${selfRow.tied ? `tied for ${ordinal(selfRow.rank)}` : ordinal(selfRow.rank)} of ${totalPlayers}`
    : null;
  const didLine = selfRow
    ? `${amountText(selfRow.score, presentation.total)}${presentation.placementPoints || presentation.strategyId !== 'correctCount'
      ? ` · ${selfRow.correctCount} ${rush ? (selfRow.correctCount === 1 ? 'graph' : 'graphs') : 'correct'}`
      : ''}`
    : '';
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section data-mm-student-final={podium ? 'podium' : '1'} style={{ ...card, background: 'linear-gradient(135deg,#14532d,#1c7a44)', border: '1px solid rgba(129,201,149,.4)' }}>
        <div style={{ ...eyebrow, color: '#b7e4c7' }}>Challenge complete</div>
        {selfRow && podium && (
          <div data-mm-final-headline="place" style={{ margin: '10px 0 4px' }}>
            <div style={{ fontSize: 'clamp(40px, 12vw, 56px)', fontWeight: 1000, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{selfRow.place.ordinal}</div>
            <div style={{ marginTop: 4, color: '#d7f5e1', fontWeight: 800 }}>
              {selfRow.tied ? `tied for ${ordinal(selfRow.rank)} ` : ''}of {totalPlayers} {totalPlayers === 1 ? 'player' : 'players'}
            </div>
            <div style={{ marginTop: 10, fontSize: 19, fontWeight: 900, color: '#fdd663' }}>{didLine}</div>
          </div>
        )}
        {selfRow && !podium && (
          <div data-mm-final-headline="effort" style={{ margin: '10px 0 4px' }}>
            <div style={{ fontSize: 'clamp(30px, 9vw, 44px)', fontWeight: 1000, color: '#fff', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{didLine}</div>
            {highlights.length > 0 && (
              <ul data-mm-final-highlights="1" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}>
                {highlights.map((line) => (
                  <li key={`${line.kind}-${line.id}`} style={{ color: '#fdd663', fontWeight: 900 }}>
                    {line.kind === 'recognition' ? '🏅 ' : '⭐ '}{line.label}
                    {line.detail && <span style={{ display: 'block', color: '#d7f5e1', fontWeight: 700 }}>{line.detail}</span>}
                  </li>
                ))}
              </ul>
            )}
            {placeWords && (
              <p data-mm-final-private-place="1" style={{ margin: '12px 0 0', color: '#c9e7d4', fontSize: 14 }}>
                Your place: {placeWords}{placeIsPrivate ? ' — only you see this' : ''}
              </p>
            )}
          </div>
        )}
        {!selfRow && (
          // Until the standings arrive (a refresh on the podium) there is no
          // row to find yet — not a student who missed the game.
          <p data-mm-final-loading={loading ? '1' : undefined} style={{ margin: '10px 0 0', color: '#d7f5e1' }}>
            {loading ? 'Loading your final place…' : 'You joined after the last round.'}
          </p>
        )}
        <h2 style={{ margin: '12px 0 6px', fontSize: 22, color: '#fff' }}>Final Standings</h2>
        <p data-mm-final-grade-note={warmup ? 'warmup' : 'game'} style={{ margin: 0, color: '#c9e7d4' }}>{gameGradeSentence({ warmup })}</p>
      </section>
      {rewardsSlot}
      <section style={quietPanel}>
        <StandingsBoard board={publicStandingsRows(room, rows, { selfKey, lastRank, totalCount: totalPlayers || null })} presentation={presentation} look="student" showMovement={false} label="Final standings" />
      </section>
    </div>
  );
}

const RESULT_COLOURS = {
  [RESULT_TONE.CORRECT]: { background: 'rgba(129,201,149,.18)', color: '#b7f0c8' },
  [RESULT_TONE.PARTIAL]: { background: 'rgba(253,214,99,.16)', color: '#fde49b' },
  [RESULT_TONE.MISSED]: { background: 'rgba(255,255,255,.08)', color: '#dbe6f7' },
  [RESULT_TONE.NONE]: { background: 'rgba(255,255,255,.08)', color: '#c3d2ea' },
};

/**
 * THE STUDENT'S OWN RECAP of a finished game (challengeRecapModel.js): what
 * they beat of their own record, what they earned, and each round they could
 * play — how their answer went and the worked solution, now that no round can
 * be answered. Only their own facts; nothing here names anyone else. With no
 * recap (the server has not answered, or cannot) it shows nothing at all.
 */
export function StudentMatchRecap({ recap = null }) {
  if (!recapHasContent(recap)) return null;
  return (
    <section data-mm-student-recap="1" aria-label="Your game recap" style={{ ...quietPanel, display: 'grid', gap: 14 }}>
      <div>
        <strong style={{ fontSize: 19, color: '#fff' }}>Your game</strong>
        <span style={{ display: 'block', marginTop: 2, color: '#9fb0cc', fontSize: 13 }}>Only you see this.</span>
      </div>
      {recap.personalBests.length > 0 && (
        <div data-mm-recap-personal-bests="1">
          <div style={{ ...eyebrow, textAlign: 'left' }}>Your best yet</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 4 }}>
            {recap.personalBests.map((line) => (
              <li key={line.id}><strong>{line.label}</strong>{line.detail ? ` — ${line.detail}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
      {recap.recognitions.length > 0 && (
        <div data-mm-recap-recognitions="1">
          <div style={{ ...eyebrow, textAlign: 'left' }}>You earned</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 4 }}>
            {recap.recognitions.map((line) => (
              <li key={line.id}><strong>{line.label}</strong>{line.detail ? ` — ${line.detail}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
      {recap.solutionsWithheld && (
        <p data-mm-recap-solutions-withheld="1" style={{ margin: 0, color: '#c3d2ea' }}>
          The worked solutions come back when the game you are in now ends.
        </p>
      )}
      {recap.rounds.length > 0 && (
        <ol data-mm-recap-rounds="1" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {recap.rounds.map((round) => (
            <li key={round.roundIndex} data-mm-recap-round={round.result.tone} style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <strong>
                  {round.label}
                  {round.replayOf && <span style={{ marginLeft: 6, color: '#9fb0cc', fontWeight: 700 }}>({round.replayOf})</span>}
                </strong>
                <span style={{ padding: '3px 10px', borderRadius: 999, fontWeight: 900, ...RESULT_COLOURS[round.result.tone] }}>{round.result.text}</span>
              </div>
              {round.solutionReview && <RoundSolutionCard compact review={round.solutionReview} prompt={round.prompt} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
