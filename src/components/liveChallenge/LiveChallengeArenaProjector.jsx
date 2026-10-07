import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import MathText from '../common/MathText.jsx';
import { RushRaceBoard, rushSettingsLine } from './GraphFeatureRushHost.jsx';
import {
  ChallengeClockText,
  ChallengeCountdown,
  ChallengeShellStyles,
  Confetti,
  RoundResultsTable,
  StandingsBoard,
  useLowTime,
} from './ChallengeShellParts.jsx';
import { getGraphFeature } from '../../../functions/shared/graphFeatureRegistry.mjs';
import { RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';
import { rushPlayingCount, rushRaceRows } from '../../platform/liveChallenge/rushStandingsModel.js';
import { CHALLENGE_STAGE, HOST_COMMAND, formatChallengeClock } from '../../platform/liveChallenge/challengeShellModel.js';
import { useChallengeClock } from '../../platform/liveChallenge/challengeHooks.js';
import { amountText, rewardSummaryLines, scorePresentation, standingsRows } from '../../platform/liveChallenge/challengeStandingsModel.js';
import {
  EXTENDED_TIME_MESSAGE,
  finalBoardRows,
  podiumRecognitionRows,
  podiumRows,
  projectorBoardLimit,
  projectorDifficultyLabel,
  projectorFamilyLabel,
  projectorGameLabel,
  projectorMoreText,
  projectorShowsClosingThreshold,
  projectorShowsSolution,
  roundWaitingOnExtendedTime,
} from '../../platform/liveChallenge/liveChallengeProjectorModel.js';
import { SOLUTION_STATE, solutionStateMessage } from '../../platform/liveChallenge/challengeSolutionModel.js';

/*
 * THE PROJECTOR: THE GAME AS THE WHOLE CLASS SEES IT.
 *
 * Built to be read from the back of a classroom on a 1366×768 projector with
 * nothing scrolling during a round: the stage fills the screen, the clock is
 * the biggest thing on it, and standings show the top of the class plus how
 * many more are playing — never the bottom of the class by name.
 *
 * NOBODY IS EVER PUBLICLY LAST. Every board here shows the top few
 * (PUBLIC_TOP_COUNT) and "and N more players · everyone sees their own place
 * on their device", unless the teacher opted the room into full standings
 * (room.standingsDisplay, liveChallengeProjectorModel.projectorBoard). The
 * podium's three steps are the only places named beyond that.
 *
 * WHAT IT NEVER SHOWS. A correct answer, a graph, a target, a coordinate, a
 * student's own response, or a real name the teacher did not choose to show
 * (it receives the anonymous game aliases only). Classic rounds show the
 * shared question — everyone is answering it — and only from GO.
 *
 * THE WORKED SOLUTION arrives as a prop (`solution`, `solutionState`): the
 * console reads it once the server has published it, and this screen draws it
 * only on a closed round's results — never in a countdown or an open round.
 * The projector stays presentation-only: no Firebase, no callables.
 *
 * Every view derives from the room's lifecycle (useChallengeClock):
 * lobby → countdown → round → Time! → results → … → final standings. The
 * host's controls sit in a strip at the bottom, inside the full-screen
 * element, so a teacher presenting full screen never has to leave it.
 */

const FAMILY_ACCENTS = Object.freeze({
  linearEquation: '#5ee7ff',
  literalEquation: '#8df7c9',
  linearInequality: '#ffd166',
  absoluteValueEquation: '#c9a7ff',
  absoluteValueInequality: '#ff8fb1',
});

const arenaButton = {
  minHeight: 40,
  border: '1px solid rgba(255,255,255,.22)',
  borderRadius: 12,
  padding: '8px 14px',
  background: 'rgba(12,18,42,.72)',
  color: '#f7f9ff',
  fontWeight: 900,
  cursor: 'pointer',
};

const bigButton = {
  ...arenaButton,
  minHeight: 54,
  padding: '13px 30px',
  fontSize: 'clamp(17px, 1.6vw, 22px)',
  border: 0,
  background: 'linear-gradient(135deg, #536dfe, #8c52ff)',
  boxShadow: '0 0 28px rgba(112,104,255,.3)',
};

const glassPanel = {
  background: 'linear-gradient(145deg, rgba(18,28,62,.88), rgba(11,18,42,.9))',
  border: '1px solid rgba(163,185,255,.22)',
  boxShadow: '0 20px 50px rgba(0,0,0,.25), inset 0 1px rgba(255,255,255,.04)',
  borderRadius: 22,
  minHeight: 0,
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: 'clamp(12px, 1.1vw, 15px)',
  fontWeight: 1000,
  letterSpacing: '.11em',
  textTransform: 'uppercase',
  color: '#9cb8ff',
};

const familyAccent = (room) => FAMILY_ACCENTS[room?.currentQuestion?.challengeFamily] || '#7aa8ff';

/** How many standings rows the screen has room for without scrolling. */
function useViewportRows() {
  const measure = () => {
    const height = typeof window === 'undefined' ? 900 : window.innerHeight;
    if (height >= 1000) return 10;
    if (height >= 860) return 8;
    if (height >= 700) return 6;
    // A small or zoomed projector (1366×768 at 150% is 911×512): fewer, still
    // full-size rows, with room left for "and N more".
    if (height >= 600) return 5;
    if (height >= 500) return 4;
    return 3;
  };
  const [rows, setRows] = useState(measure);
  useEffect(() => {
    const changed = () => setRows(measure());
    window.addEventListener('resize', changed);
    return () => window.removeEventListener('resize', changed);
  }, []);
  return rows;
}

function ArenaBadge({ children, accent = '#7aa8ff' }) {
  if (!children) return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 28,
      padding: '4px 12px',
      borderRadius: 999,
      border: `1px solid ${accent}66`,
      background: `${accent}18`,
      color: '#f7f9ff',
      fontSize: 'clamp(12px, 1.1vw, 16px)',
      fontWeight: 900,
      letterSpacing: '.035em',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function RoundProgress({ currentRound, roundCount, accent }) {
  const count = Math.max(1, Math.min(30, roundCount));
  return (
    <div aria-label={`Round ${currentRound} of ${roundCount}`} style={{ display: 'flex', gap: count > 16 ? 4 : 6, width: '100%' }}>
      {Array.from({ length: count }, (_, index) => {
        const round = index + 1;
        const complete = round < currentRound;
        const active = round === currentRound;
        return (
          <span
            key={round}
            title={`Round ${round}`}
            style={{
              height: active ? 9 : 6,
              flex: 1,
              minWidth: 4,
              borderRadius: 999,
              alignSelf: 'center',
              background: complete ? `linear-gradient(90deg, ${accent}, var(--mm-primary-soft))` : active ? 'var(--mm-surface)' : 'rgba(255,255,255,.14)',
              boxShadow: active ? `0 0 18px ${accent}` : 'none',
              opacity: complete ? 0.82 : 1,
              transition: 'height 160ms ease, background 160ms ease',
            }}
          />
        );
      })}
    </div>
  );
}

/** The round clock, as big as the screen allows. Time left; "Time!" at zero; elapsed in an open Pace Race. */
function ArenaClock({ room, clock, clockOffsetMs, extendedTime = false }) {
  const low = useLowTime(room, clockOffsetMs);
  const locked = clock.stage === CHALLENGE_STAGE.ROUND_LOCKED;
  const paceOpen = clock.openEnded;
  // Past the class's deadline while students with extended time finish: not a
  // frozen "Time!" (which would tell them to stop), and never who.
  if (extendedTime) {
    return (
      <div className="mm-arena-timer" data-mm-arena-clock="extendedTime" role="status" style={{
        padding: 'clamp(10px, 1.6vh, 18px) clamp(14px, 1.6vw, 24px)',
        textAlign: 'center',
        borderRadius: 18,
        background: 'rgba(95,145,255,.12)',
        border: '1px solid rgba(130,165,255,.36)',
      }}>
        <div style={{ ...labelStyle, color: '#a8c2ff' }}>Almost there</div>
        <div style={{ marginTop: 6, fontSize: 'clamp(20px, 3.4vh, 32px)', fontWeight: 1000, lineHeight: 1.2, color: '#fff' }}>{EXTENDED_TIME_MESSAGE}</div>
      </div>
    );
  }
  const label = locked ? 'Time!' : paceOpen ? 'Elapsed' : room?.timingMode === 'pace' ? 'Round closes in' : 'Time left';
  return (
    <div className={low || locked ? 'mm-arena-timer mm-arena-timer-low' : 'mm-arena-timer'} data-mm-arena-clock={clock.stage} style={{
      padding: 'clamp(10px, 1.6vh, 18px) clamp(14px, 1.6vw, 24px)',
      textAlign: 'center',
      borderRadius: 18,
      background: low || locked ? 'rgba(255,87,120,.15)' : 'rgba(95,145,255,.12)',
      border: `1px solid ${low || locked ? 'rgba(255,105,135,.5)' : 'rgba(130,165,255,.36)'}`,
    }}>
      <div style={{ ...labelStyle, color: low || locked ? '#ff9bb0' : '#a8c2ff' }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 'clamp(54px, 11vh, 120px)', fontWeight: 1000, lineHeight: 1, letterSpacing: '-.04em', color: '#fff' }}>
        {locked ? '0:00' : <ChallengeClockText room={room} clockOffsetMs={clockOffsetMs} />}
      </div>
    </div>
  );
}

const PODIUM_RANKS = Object.freeze({
  1: { medal: '🥇', title: 'Champion', accent: '#ffd166' },
  2: { medal: '🥈', title: '2nd Place', accent: '#cbd5e1' },
  3: { medal: '🥉', title: '3rd Place', accent: '#d99562' },
});

function PodiumPlace({ row, place, height, revealDelay, presentation, rewards = null }) {
  if (!row) return <div />;
  // The step's height and position come from its place; the medal, title and
  // number come from the player's rank, which tied players share.
  const rank = Math.max(1, Math.min(3, Number(row.rank) || place));
  const { medal, accent } = PODIUM_RANKS[rank];
  const title = `${PODIUM_RANKS[rank].title}${row.tied ? ' · Tied' : ''}`;
  return (
    <div className="mm-arena-podium-place" data-mm-podium={place} style={{ animationDelay: `${revealDelay}ms`, alignSelf: 'end', minWidth: 0 }}>
      <div style={{
        padding: place === 1 ? '16px 14px 14px' : '12px 12px 11px',
        borderRadius: '20px 20px 10px 10px',
        textAlign: 'center',
        background: `linear-gradient(160deg, ${accent}28, rgba(255,255,255,.055))`,
        border: `1px solid ${accent}70`,
        boxShadow: place === 1 ? `0 0 38px ${accent}25` : '0 16px 30px rgba(0,0,0,.2)',
      }}>
        <div aria-hidden="true" style={{ fontSize: place === 1 ? 'clamp(34px, 5vh, 46px)' : 'clamp(28px, 4vh, 36px)', lineHeight: 1 }}>{medal}</div>
        <div style={{ ...labelStyle, marginTop: 6, color: accent }}>{title}</div>
        <div style={{ marginTop: 5, fontWeight: 1000, fontSize: place === 1 ? 'clamp(22px, 2.4vw, 32px)' : 'clamp(18px, 1.9vw, 26px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>{row.alias}</div>
        <div style={{ marginTop: 4, color: 'rgba(240,244,255,.8)', fontWeight: 800, fontSize: 'clamp(14px, 1.3vw, 18px)' }}>{amountText(row.score, presentation.total)}</div>
        {rewards && rewards.map((reward) => (
          <div key={reward.rewardCode} style={{ marginTop: 6, fontWeight: 900, color: '#ffd166', fontSize: 'clamp(13px, 1.2vw, 16px)' }}>
            {reward.rewardCode === 'practicePass' ? '🎟' : reward.rewardCode === 'badge' ? '🏅' : '⭐'} {reward.label}
          </div>
        ))}
      </div>
      <div style={{
        height,
        display: 'grid',
        placeItems: 'center',
        borderRadius: '0 0 18px 18px',
        background: `linear-gradient(180deg, ${accent}38, ${accent}12)`,
        border: `1px solid ${accent}55`,
        borderTop: 0,
        color: '#fff',
        fontSize: place === 1 ? 'clamp(30px, 4.5vh, 40px)' : 'clamp(24px, 3.5vh, 30px)',
        fontWeight: 1000,
        textShadow: '0 3px 12px rgba(0,0,0,.35)',
      }}>
        {rank}
      </div>
    </div>
  );
}

/*
 * How many standings rows fit WHOLE in the box `ref` points at (a box that
 * fills the space it is given), up to `wanted`, with room left for a one-line
 * note under them — and whether even the note fits (`room`). The viewport's
 * row budget cannot know how tall the podium above came out: at 1366×768 it
 * asked for five rows where three fit, and the last ones, with "Everyone sees
 * their own final place", were cut off; at 150% zoom nothing fits at all.
 */
const FINAL_NOTE_PX = 30;
const FINAL_PANEL_CHROME_PX = 34;
function useRowsThatFit(ref, wanted) {
  const [fit, setFit] = useState({ rows: wanted, room: true });
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    const measure = () => {
      const panel = box.firstElementChild;
      let chrome = FINAL_PANEL_CHROME_PX;
      if (panel) {
        const styles = window.getComputedStyle(panel);
        chrome = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
          .reduce((sum, key) => sum + (parseFloat(styles[key]) || 0), 0);
      }
      const row = panel?.querySelector('li');
      const rowHeight = (row ? row.getBoundingClientRect().height : 56) + 6;
      const space = box.clientHeight - chrome;
      const rows = Math.max(0, Math.min(wanted, Math.floor((space - FINAL_NOTE_PX + 6) / rowHeight)));
      const room = space >= FINAL_NOTE_PX;
      setFit((current) => (current.rows === rows && current.room === room ? current : { rows, room }));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [ref, wanted]);
  return { rows: Math.min(fit.rows, wanted), room: fit.room };
}

/*
 * Recognitions under the podium: growth, steadiness, comebacks and the class's
 * own effort, by game alias — "Most improved: Nova Panther 90". Positive and
 * public; a room without them (recognitions off, or finished before they
 * existed) shows nothing.
 */
function PodiumRecognitions({ room }) {
  const recognitions = podiumRecognitionRows(room);
  if (!recognitions.length) return null;
  return (
    <ul data-mm-recognitions={recognitions.length} aria-label="Recognitions" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 'clamp(6px, 1vw, 10px)', maxWidth: 1100, width: '100%', justifySelf: 'center' }}>
      {recognitions.map((entry) => (
        <li key={entry.id} data-mm-recognition={entry.id} title={entry.detail || undefined} style={{
          padding: '7px 14px',
          borderRadius: 999,
          background: entry.classWide ? 'rgba(141,247,201,.14)' : 'rgba(255,209,102,.13)',
          border: `1px solid ${entry.classWide ? 'rgba(141,247,201,.45)' : 'rgba(255,209,102,.42)'}`,
          color: '#f7f9ff',
          fontWeight: 900,
          fontSize: 'clamp(14px, 1.45vw, 20px)',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          <span aria-hidden="true">{entry.classWide ? '🤝' : '⭐'} </span>
          <span style={{ color: entry.classWide ? '#8df7c9' : '#ffd166' }}>{entry.label}</span>
          {entry.classWide ? ` — ${entry.who}` : `: ${entry.who}`}
        </li>
      ))}
    </ul>
  );
}

function FinalPodium({ room = null, leaderboard = [], presentation, rewardsByKey = null, rewardSummary = null, rows = 6 }) {
  const podium = podiumRows(leaderboard);
  // The rows under the podium only complete the top few by default; full
  // standings (the teacher's opt-in) fill the space as before.
  const board = finalBoardRows(room, leaderboard, rows);
  const remaining = board.rows;
  const boardRef = useRef(null);
  const fit = useRowsThatFit(boardRef, remaining.length);
  const shownBelow = fit.room ? remaining.slice(0, fit.rows) : [];
  const unseenCount = board.hiddenCount + (remaining.length - shownBelow.length);
  const someoneUnseen = unseenCount > 0;
  const lines = rewardSummaryLines(rewardSummary);
  const hasRecognitions = podiumRecognitionRows(room).length > 0;
  return (
    <div className="mm-arena-finish" style={{ display: 'grid', gridTemplateRows: hasRecognitions ? 'auto auto auto minmax(0,1fr)' : 'auto auto minmax(0,1fr)', gap: 'clamp(10px, 1.8vh, 20px)', minHeight: 0, height: '100%' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={labelStyle}>Challenge Complete</div>
        {/* Its own colour: the global h2 rule (index.css) would paint it dark on the arena. */}
        <h2 style={{ margin: '4px 0 0', fontSize: 'clamp(32px, 6vh, 58px)', lineHeight: 1, letterSpacing: '-.025em', color: '#f7f9ff', fontWeight: 1000 }}>Final Podium</h2>
        <div style={{ marginTop: 6, color: 'rgba(236,241,255,.72)', fontWeight: 800, fontSize: 'clamp(14px, 1.4vw, 19px)' }}>
          {presentation.placementPoints ? 'Ranked by championship points.' : `Ranked by ${presentation.total.long}.`}{lines.length ? ` Rewards: ${lines.join(' · ')}.` : ''}
          {/* No room under the podium (a small or zoomed projector): the note moves up here. */}
          {!fit.room && someoneUnseen && <span data-mm-final-more="header"> Everyone sees their own final place on their device.</span>}
        </div>
      </div>
      <div style={{ maxWidth: 940, width: '100%', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.12fr) minmax(0,1fr)', gap: 14, alignItems: 'end' }}>
        <PodiumPlace row={podium.second} place={2} height="clamp(44px, 8vh, 72px)" revealDelay={80} presentation={presentation} rewards={rewardsByKey?.get(podium.second?.playerKey) || null} />
        <PodiumPlace row={podium.first} place={1} height="clamp(70px, 12vh, 112px)" revealDelay={620} presentation={presentation} rewards={rewardsByKey?.get(podium.first?.playerKey) || null} />
        <PodiumPlace row={podium.third} place={3} height="clamp(32px, 6vh, 52px)" revealDelay={350} presentation={presentation} rewards={rewardsByKey?.get(podium.third?.playerKey) || null} />
      </div>
      <PodiumRecognitions room={room} />
      {(remaining.length > 0 || someoneUnseen) && (
        <div ref={boardRef} style={{ minHeight: 0, overflow: 'hidden', display: 'grid', alignContent: 'start' }}>
          {fit.room && (
            <section data-mm-final-board={shownBelow.length} style={{ ...glassPanel, padding: 'clamp(10px, 1.6vh, 16px)', maxWidth: 860, width: '100%', margin: '0 auto', overflow: 'hidden', boxSizing: 'border-box' }}>
              {shownBelow.length > 0 && (
                <StandingsBoard rows={standingsRows(shownBelow)} presentation={presentation} look="projector" limit={shownBelow.length} showMovement={false} rewardsByKey={rewardsByKey} label="Final standings" />
              )}
              {someoneUnseen && (
                <div data-mm-final-more="1" style={{ marginTop: shownBelow.length ? 6 : 0, color: 'rgba(236,241,255,.7)', fontWeight: 800 }}>
                  {unseenCount === 1 ? 'And 1 more player.' : `And ${unseenCount} more players.`} Everyone sees their own final place on their device.
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function LobbyView({ room, leaderboard, joinedCount, busy, onStart }) {
  const eligible = Math.max(0, Number(room?.eligibleCount) || 0);
  const names = leaderboard.map((row) => ({ key: row.playerKey, alias: row.alias }));
  // Every name that fits; a big class shrinks the chips before it hides anyone.
  const shown = names.slice(0, 48);
  const dense = names.length > 24;
  const lines = rewardSummaryLines(room?.rewardSummary);
  return (
    <div className="mm-arena-lobby-grid" style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(min(100%, 320px),1.15fr)', gap: 'clamp(12px, 1.6vw, 22px)' }}>
      <section style={{ ...glassPanel, padding: 'clamp(18px, 3vw, 44px)', display: 'grid', alignContent: 'center', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div className="mm-arena-orb mm-arena-orb-a" />
        <div className="mm-arena-orb mm-arena-orb-b" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={labelStyle}>Arena Lobby</div>
          <div data-mm-lobby-count={joinedCount} style={{ marginTop: 8, fontSize: 'clamp(76px, 17vh, 150px)', lineHeight: 0.85, fontWeight: 1000, letterSpacing: '-.06em' }}>{joinedCount}</div>
          <div style={{ marginTop: 10, fontSize: 'clamp(20px, 2.2vw, 28px)', fontWeight: 900 }}>{joinedCount === 1 ? 'student ready' : 'students ready'}</div>
          {eligible > 0 && <div style={{ marginTop: 4, color: 'rgba(236,241,255,.65)', fontWeight: 700 }}>{joinedCount} of {eligible} invited</div>}
          <div style={{ marginTop: 18, color: '#dbe6ff', fontWeight: 800, fontSize: 'clamp(15px, 1.5vw, 20px)', lineHeight: 1.4 }}>
            Open MathMaster and tap <strong>Live Challenge</strong> on your dashboard.
          </div>
          {lines.length > 0 && <div style={{ marginTop: 10, color: '#ffd166', fontWeight: 900, fontSize: 'clamp(15px, 1.5vw, 20px)' }}>🏆 {lines.join(' · ')}</div>}
          <div style={{ marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 999, background: 'rgba(99,226,255,.1)', border: '1px solid rgba(99,226,255,.28)', color: '#c8f6ff', fontWeight: 900 }}>
            <span className="mm-arena-pulse" /> Waiting for teacher to start
          </div>
          {typeof onStart === 'function' && <div style={{ marginTop: 18 }}>
            <button type="button" disabled={joinedCount < 1 || busy === 'start'} onClick={onStart} style={{ ...bigButton, opacity: joinedCount < 1 || busy === 'start' ? 0.5 : 1 }}>
              {busy === 'start' ? 'Starting Challenge…' : 'Start Challenge'}
            </button>
          </div>}
        </div>
      </section>

      <section style={{ ...glassPanel, padding: 'clamp(14px, 1.6vw, 22px)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', gap: 12 }}>
        <div style={labelStyle}>Contestants</div>
        {shown.length ? (
          <div style={{ display: 'flex', gap: dense ? 6 : 9, flexWrap: 'wrap', alignContent: 'flex-start', overflow: 'hidden' }}>
            {shown.map(({ key, alias }) => (
              <span key={key || alias} style={{ padding: dense ? '6px 10px' : '9px 13px', borderRadius: 999, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', fontWeight: 900, fontSize: dense ? 'clamp(13px, 1.2vw, 16px)' : 'clamp(15px, 1.5vw, 20px)' }}>
                {alias}
              </span>
            ))}
            {names.length > shown.length && <span style={{ padding: '6px 10px', color: 'rgba(236,241,255,.7)', fontWeight: 900 }}>+{names.length - shown.length} more</span>}
          </div>
        ) : <div style={{ color: 'rgba(236,241,255,.62)', fontSize: 'clamp(15px, 1.5vw, 20px)' }}>Players appear here as they join.</div>}
      </section>
    </div>
  );
}

function CountdownView({ room, clock }) {
  const rush = room?.challengeMode === RUSH_MODE_ID;
  return (
    <section style={{ ...glassPanel, height: '100%', display: 'grid', placeItems: 'center' }}>
      <ChallengeCountdown
        clock={clock}
        look="projector"
        title={clock.isReplay ? `Second Chance · Final round ${clock.replayNumber}` : `Round ${clock.roundNumber} of ${clock.roundCount}`}
        detail={rush ? 'Everyone gets their own graphs' : 'Eyes on your own screen'}
      />
    </section>
  );
}

/** A classic round: the shared question (from GO), the clock, who has locked in, the live board. */
function RunningView({ room, clock, clockOffsetMs, leaderboard, presentation, joinedCount, answeredCount, rows }) {
  const family = projectorFamilyLabel(room);
  const difficulty = projectorDifficultyLabel(room);
  const accent = familyAccent(room);
  const locked = clock.stage === CHALLENGE_STAGE.ROUND_LOCKED;
  const extendedTime = roundWaitingOnExtendedTime({ room, locked, joinedCount, answeredCount });
  const liveRows = standingsRows(leaderboard);
  const prompt = String(room?.currentQuestion?.prompt || '');
  const promptSize = prompt.length > 220 ? 'clamp(20px, 3vh, 30px)' : prompt.length > 120 ? 'clamp(24px, 3.8vh, 38px)' : 'clamp(28px, 5vh, 48px)';
  const answeredShare = joinedCount > 0 ? Math.min(100, Math.round((answeredCount / joinedCount) * 100)) : 0;
  return (
    <div className="mm-arena-running-grid" style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1.45fr) minmax(min(100%, 320px),.85fr)', gap: 'clamp(12px, 1.6vw, 20px)' }}>
      <section style={{ ...glassPanel, padding: 'clamp(16px, 2.4vw, 32px)', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto', gap: 'clamp(10px, 1.6vh, 18px)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <ArenaBadge accent={accent}>{clock.isReplay ? `FINAL ROUND ${clock.replayNumber}` : `Round ${clock.roundNumber} / ${clock.roundCount}`}</ArenaBadge>
          {clock.isReplay && <ArenaBadge accent="#ffd166">SECOND CHANCE</ArenaBadge>}
          <ArenaBadge accent={accent}>{family}</ArenaBadge>
          {difficulty && <ArenaBadge accent="#b79cff">{difficulty}</ArenaBadge>}
        </div>
        <div style={{ minHeight: 0, overflow: 'auto' }}>
          <div style={labelStyle}>{extendedTime ? 'Finishing up' : locked ? 'Time is up' : 'Solve now'}</div>
          <MathText
            as="div"
            style={{ marginTop: 10, whiteSpace: 'pre-wrap', fontSize: promptSize, lineHeight: 1.32, fontWeight: 900, color: '#fff' }}
          >
            {room?.currentQuestion?.prompt}
          </MathText>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 'clamp(14px, 1.4vw, 19px)', fontWeight: 900, color: 'rgba(236,241,255,.78)' }}>
            <span>Locked in</span><span data-mm-locked-in={answeredCount}>{answeredCount} / {joinedCount}</span>
          </div>
          <div style={{ height: 12, marginTop: 7, background: 'rgba(255,255,255,.08)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${answeredShare}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${accent}, var(--mm-primary-soft))`, transition: 'width 200ms ease' }} />
          </div>
          <div style={{ marginTop: 8, color: 'rgba(236,241,255,.6)', fontSize: 'clamp(12px, 1.1vw, 15px)', fontWeight: 800 }}>
            {extendedTime ? `${EXTENDED_TIME_MESSAGE}.` : locked ? 'Collecting the last answers — results next.' : 'Scores update as answers lock.'}
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', gap: 'clamp(10px, 1.4vh, 16px)', minHeight: 0 }}>
        <ArenaClock room={room} clock={clock} clockOffsetMs={clockOffsetMs} extendedTime={extendedTime} />
        <div style={{ ...glassPanel, padding: 'clamp(10px, 1.4vw, 18px)', overflow: 'hidden' }}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>{presentation.placementPoints ? 'Championship' : 'Live standings'}</div>
          <StandingsBoard rows={liveRows} presentation={presentation} look="projector" limit={projectorBoardLimit(room, rows, liveRows.length)} describeMore={(hidden) => projectorMoreText(room, hidden)} showMovement={false} label="Live standings" />
        </div>
      </section>
    </div>
  );
}

/*
 * GRAPH FEATURE RUSH ON THE PROJECTOR. Every student has their own graphs, so
 * the room sees the race — graphs completed this round — and never a graph or
 * an answer.
 */
function RushRunningView({ room, clock, clockOffsetMs, players, joinedCount, rows }) {
  const roundIndex = Number(room?.currentRound) || 0;
  const locked = clock.stage === CHALLENGE_STAGE.ROUND_LOCKED;
  const playing = rushPlayingCount(players, roundIndex);
  const graphs = rushRaceRows(players, roundIndex).reduce((sum, row) => sum + row.completed, 0);
  const features = (room?.graphFeatureRush?.config?.features || []).map((id) => getGraphFeature(id)?.shortLabel || id);
  const racerCount = rushRaceRows(players, roundIndex).length;
  const boardLimit = projectorBoardLimit(room, rows, racerCount);
  const racersMore = projectorMoreText(room, racerCount - boardLimit);
  return (
    <div className="mm-arena-running-grid" style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(min(100%, 320px),1fr)', gap: 'clamp(12px, 1.6vw, 20px)' }}>
      <section style={{ ...glassPanel, padding: 'clamp(16px, 2.4vw, 32px)', display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto', gap: 14, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <ArenaBadge accent="#5ee7ff">{`Round ${clock.roundNumber} / ${clock.roundCount}`}</ArenaBadge>
          {features.map((feature) => <ArenaBadge key={feature} accent="#b79cff">{feature}</ArenaBadge>)}
        </div>
        <div style={{ alignSelf: 'center' }}>
          <div style={labelStyle}>{locked ? 'Time is up' : 'Find the features'}</div>
          <div style={{ marginTop: 10, fontSize: 'clamp(28px, 5vh, 48px)', lineHeight: 1.2, fontWeight: 900, color: '#f7f9ff' }}>
            {locked ? 'Saving the last taps — results next.' : 'Everyone has their own graphs. Tap the features. Go!'}
          </div>
          <div style={{ marginTop: 10, color: 'rgba(236,241,255,.68)', fontWeight: 800, fontSize: 'clamp(14px, 1.4vw, 19px)' }}>{rushSettingsLine(room)}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', color: 'rgba(236,241,255,.78)', fontWeight: 900, fontSize: 'clamp(15px, 1.5vw, 20px)' }}>
          <span>{playing} of {joinedCount} racing</span>
          <span>{graphs} {graphs === 1 ? 'graph' : 'graphs'} completed</span>
        </div>
      </section>
      <section style={{ display: 'grid', gridTemplateRows: 'auto minmax(0,1fr)', gap: 'clamp(10px, 1.4vh, 16px)', minHeight: 0 }}>
        <ArenaClock room={room} clock={clock} clockOffsetMs={clockOffsetMs} />
        <div style={{ ...glassPanel, padding: 'clamp(10px, 1.4vw, 18px)', overflow: 'hidden' }}>
          <div style={{ ...labelStyle, marginBottom: 10 }}>Live race · graphs this round</div>
          <RushRaceBoard players={players} roundIndex={roundIndex} limit={boardLimit} look="projector" />
          {/* RushRaceBoard lists only its rows; how many more are racing is said here. */}
          {racersMore && (
            <div data-mm-board-more="rush" style={{ marginTop: 6, paddingLeft: 4, color: 'rgba(236,241,255,.7)', fontWeight: 800, fontSize: 'clamp(14px, 1.4vw, 20px)' }}>{racersMore}</div>
          )}
        </div>
      </section>
    </div>
  );
}

/*
 * THE WORKED SOLUTION, as the class reads it from the back of the room: the
 * question, the key idea, the steps and the answer, in MathText. Only ever
 * rendered by ResultsView (a closed round), from the console's prop.
 */
function ProjectorSolution({ solution, state }) {
  if (state !== SOLUTION_STATE.READY) {
    return (
      <section data-mm-projector-solution={state} style={{ ...glassPanel, padding: 'clamp(12px, 1.6vw, 20px)', display: 'grid', alignContent: 'center' }}>
        <div style={labelStyle}>Worked solution</div>
        <div style={{ marginTop: 6, color: '#dbe6ff', fontWeight: 800, fontSize: 'clamp(17px, 2.2vh, 24px)', lineHeight: 1.4 }}>{solutionStateMessage(state)}</div>
      </section>
    );
  }
  const review = solution?.solutionReview || {};
  const steps = (Array.isArray(review.reasoning) ? review.reasoning : []).filter(Boolean).slice(0, 5);
  return (
    <section data-mm-projector-solution="ready" aria-label="Worked solution" style={{ ...glassPanel, padding: 'clamp(14px, 2vw, 26px)', overflow: 'auto', minHeight: 0, display: 'grid', alignContent: 'start', gap: 'clamp(8px, 1.4vh, 14px)' }}>
      <div style={labelStyle}>Worked solution</div>
      {solution?.prompt && (
        <MathText as="div" style={{ whiteSpace: 'pre-wrap', color: 'rgba(236,241,255,.82)', fontWeight: 800, fontSize: 'clamp(17px, 2.5vh, 24px)', lineHeight: 1.35 }}>{solution.prompt}</MathText>
      )}
      {review.headline && <MathText as="div" style={{ color: '#fff', fontWeight: 1000, fontSize: 'clamp(22px, 3.4vh, 32px)', lineHeight: 1.25 }}>{review.headline}</MathText>}
      {steps.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: '1.4em', display: 'grid', gap: 6, color: '#f7f9ff', fontWeight: 800, fontSize: 'clamp(18px, 2.7vh, 26px)', lineHeight: 1.35 }}>
          {steps.map((step, index) => <li key={index}><MathText>{step}</MathText></li>)}
        </ol>
      )}
      {review.answerSummary && (
        <div style={{ padding: '8px 14px', borderRadius: 12, background: 'rgba(141,247,201,.12)', border: '1px solid rgba(141,247,201,.4)', color: '#f7f9ff', fontWeight: 900, fontSize: 'clamp(19px, 2.9vh, 28px)' }}>
          <span style={{ color: '#8df7c9' }}>Answer: </span><MathText>{review.answerSummary}</MathText>
        </div>
      )}
      {review.commonError && (
        <div style={{ color: '#ffd9a8', fontWeight: 800, fontSize: 'clamp(16px, 2.3vh, 22px)', lineHeight: 1.35 }}>
          <span style={{ fontWeight: 1000 }}>Watch out: </span><MathText>{review.commonError}</MathText>
        </div>
      )}
    </section>
  );
}

/** A closed round: its own table, and the standings it left (with movement since the round before). */
function ResultsView({ room, clock, roundView, presentation, leaderboard, rows, solution = null, solutionState = SOLUTION_STATE.NONE, solutionHidden = false }) {
  // The standings arrive with the round's result, written when it closed —
  // never the live board's rows from before it. A round closed before results
  // carried standings shows the live board.
  const standings = roundView ? (roundView.standings || standingsRows(leaderboard)) : null;
  const describeMore = (hidden) => projectorMoreText(room, hidden);
  const showSolution = !solutionHidden && projectorShowsSolution({ stage: clock.stage, solutionState });
  // A ready solution takes the left of the screen (the round's table steps
  // aside; the standings after it stay). A held or missing one is a line.
  const solutionFills = showSolution && solutionState === SOLUTION_STATE.READY;
  const standingsPanel = (
    <section style={{ ...glassPanel, padding: 'clamp(14px, 2vw, 26px)', overflow: 'hidden' }}>
      <div style={labelStyle}>{presentation.placementPoints ? 'Championship' : 'Standings'}</div>
      <div style={{ margin: '4px 0 12px', fontSize: 'clamp(26px, 4.6vh, 42px)', fontWeight: 1000, color: '#fff' }}>After round {clock.roundNumber}</div>
      {standings
        ? <StandingsBoard rows={standings} presentation={presentation} look="projector" limit={projectorBoardLimit(room, rows, standings.length)} describeMore={describeMore} showMovement label="Standings after this round" />
        : <p style={{ margin: 0, color: 'rgba(236,241,255,.7)', fontSize: 'clamp(16px, 1.7vw, 24px)' }}>Tallying the round…</p>}
    </section>
  );
  if (solutionFills) {
    return (
      <div className="mm-arena-running-grid" data-mm-results-layout="solution" style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 'clamp(12px, 1.6vw, 20px)' }}>
        <ProjectorSolution solution={solution} state={solutionState} />
        {standingsPanel}
      </div>
    );
  }
  return (
    <div style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: showSolution ? 'auto minmax(0,1fr)' : 'minmax(0,1fr)', gap: 'clamp(10px, 1.4vh, 16px)' }}>
      {showSolution && <ProjectorSolution solution={solution} state={solutionState} />}
      <div className="mm-arena-running-grid" data-mm-results-layout="tables" style={{ minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'clamp(12px, 1.6vw, 20px)' }}>
        <section style={{ ...glassPanel, padding: 'clamp(14px, 2vw, 26px)', overflow: 'hidden' }}>
          <div style={labelStyle}>{clock.isReplay ? `Second Chance round ${clock.replayNumber}` : `Round ${clock.roundNumber} of ${clock.roundCount}`}</div>
          <div style={{ margin: '4px 0 12px', fontSize: 'clamp(26px, 4.6vh, 42px)', fontWeight: 1000, color: '#fff' }}>Round results{presentation.placementPoints ? ' · championship points' : ''}</div>
          <RoundResultsTable view={roundView} presentation={presentation} look="projector" limit={projectorBoardLimit(room, Math.max(3, rows - 1), roundView?.rows?.length)} describeMore={describeMore} />
        </section>
        {standingsPanel}
      </div>
    </div>
  );
}

/** Host controls along the bottom: the one thing to press, plus what the stage allows. */
function HostStrip({ room, stage, primaryAction, busy, controlBusy, extendedTime = false, solutionToggle = null, onStart, onAdvance, onPlayAgain, onNewChallenge, onRequestEndGame, onRequestEndRound, onThresholdChange }) {
  const openRound = [CHALLENGE_STAGE.COUNTDOWN, CHALLENGE_STAGE.ROUND_ACTIVE, CHALLENGE_STAGE.ROUND_LOCKED].includes(stage);
  // Ending a round early is for a round in play: not one still counting down,
  // and not one past its buzzer, which closes itself in a moment — unless it
  // is waiting on students with extended time, which the teacher may cut short.
  const endableRound = stage === CHALLENGE_STAGE.ROUND_ACTIVE || stage === CHALLENGE_STAGE.ROUND_PAUSED || extendedTime;
  const handlers = {
    [HOST_COMMAND.START]: onStart,
    [HOST_COMMAND.ADVANCE]: onAdvance,
    [HOST_COMMAND.PLAY_AGAIN]: onPlayAgain,
    [HOST_COMMAND.NEW_CHALLENGE]: onNewChallenge,
  };
  const primary = primaryAction?.command && stage !== CHALLENGE_STAGE.LOBBY ? primaryAction : null;
  const primaryHandler = primary ? handlers[primary.command] : null;
  const working = busy === 'advance' ? 'Loading…' : busy === 'replay' ? 'Creating the lobby…' : null;
  return (
    <footer data-mm-arena-host="1" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 54 }}>
      {primary && typeof primaryHandler === 'function' && (
        <button type="button" data-mm-primary-action={primary.command} disabled={primary.disabled || controlBusy || busy === 'replay'} onClick={primaryHandler} style={{ ...bigButton, opacity: primary.disabled || controlBusy ? 0.55 : 1 }}>
          {(primary.command === HOST_COMMAND.ADVANCE && busy === 'advance') || (primary.command === HOST_COMMAND.PLAY_AGAIN && busy === 'replay') ? working : primary.label}
        </button>
      )}
      {stage === CHALLENGE_STAGE.COMPLETED && typeof onNewChallenge === 'function' && <button type="button" onClick={onNewChallenge} style={arenaButton}>New Challenge</button>}
      {endableRound && typeof onRequestEndRound === 'function' && <button type="button" disabled={controlBusy} onClick={onRequestEndRound} style={{ ...arenaButton, opacity: controlBusy ? 0.55 : 1 }}>End Round Now</button>}
      {solutionToggle && (
        <button type="button" data-mm-solution-toggle={solutionToggle.hidden ? 'show' : 'hide'} aria-pressed={!solutionToggle.hidden} onClick={solutionToggle.onToggle} style={arenaButton}>
          {solutionToggle.hidden ? 'Show solution' : 'Hide solution'}
        </button>
      )}
      {(openRound || stage === CHALLENGE_STAGE.ROUND_RESULTS) && typeof onRequestEndGame === 'function' && <button type="button" disabled={controlBusy} onClick={onRequestEndGame} style={{ ...arenaButton, color: '#ffb4ab', opacity: controlBusy ? 0.55 : 1 }}>End Game</button>}
      {projectorShowsClosingThreshold(room) && typeof onThresholdChange === 'function' && stage !== CHALLENGE_STAGE.COMPLETED && <label style={{ fontSize: 13, fontWeight: 900, color: 'rgba(236,241,255,.75)' }}>Round closing threshold
        <select aria-label="Round closing threshold" value={room.roundClosingThreshold ?? 'off'} onChange={(event) => onThresholdChange(event.target.value)} style={{ ...arenaButton, WebkitTextFillColor: arenaButton.color, marginLeft: 7, minHeight: 36 }}>
          <option value="off">Off</option>{[60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
        </select>
      </label>}
      {(extendedTime || primaryAction?.hint) && stage !== CHALLENGE_STAGE.LOBBY && <span style={{ flex: '1 1 260px', color: 'rgba(236,241,255,.6)', fontWeight: 700, fontSize: 'clamp(12px, 1.1vw, 15px)' }}>{extendedTime ? 'The round waits for students with extended time. End Round Now still works.' : primaryAction.hint}</span>}
    </footer>
  );
}

export const formatArenaClock = (milliseconds) => formatChallengeClock(milliseconds);

export default function LiveChallengeArenaProjector({
  room = null,
  loading = false,
  leaderboard = [],
  players = [],
  joinedCount = 0,
  answeredCount = 0,
  clockOffsetMs = 0,
  roundView = null,
  // The closed round's worked solution, read by the console (useRoundSolution)
  // and its state (challengeSolutionModel.roundSolutionState). Drawn only on
  // the results screen.
  solution = null,
  solutionState = SOLUTION_STATE.NONE,
  presentation: presentationProp = null,
  rewardsByKey = null,
  primaryAction = null,
  busy = '',
  controlBusy = false,
  error = '',
  audioReady = false,
  audioMuted = false,
  onToggleMute,
  onEnableAudio,
  onStart,
  onAdvance,
  onPlayAgain,
  onNewChallenge,
  onRequestEndGame,
  onRequestEndRound,
  onThresholdChange,
  onExit,
  dialog = null,
}) {
  const shellRef = useRef(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const clock = useChallengeClock(room, clockOffsetMs);
  const rows = useViewportRows();
  // The teacher may hide the worked solution (to talk it through first, or to
  // see the round's table). It shows again on the next round's results.
  const [solutionHiddenFor, setSolutionHiddenFor] = useState(null);
  const roundKey = room ? `${room.roomId || room.id || ''}:${room.currentRound}:${room.roundVersion || 0}` : null;
  const solutionHidden = solutionHiddenFor !== null && solutionHiddenFor === roundKey;
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const changed = () => setNativeFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => { document.body.style.overflow = previous; document.removeEventListener('fullscreenchange', changed); };
  }, []);
  const enterFullscreen = async () => {
    try { await shellRef.current?.requestFullscreen?.(); } catch { setNativeFullscreen(false); }
  };
  const exitFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen?.(); } catch { /* CSS viewport remains active */ }
  };
  const stage = room ? clock.stage : null;
  const presentation = presentationProp || scorePresentation({ scoringStrategyId: room?.scoringStrategyId, questionSet: room?.challengeMode === RUSH_MODE_ID });
  const gameLabel = room ? projectorGameLabel(room) : 'Live Challenge';
  const accent = familyAccent(room);
  const title = room?.title || 'MathMaster Live Challenge';
  const openRound = [CHALLENGE_STAGE.ROUND_ACTIVE, CHALLENGE_STAGE.ROUND_LOCKED, CHALLENGE_STAGE.ROUND_PAUSED].includes(stage);
  const showProgress = room && room.status === 'running';
  const extendedTime = roundWaitingOnExtendedTime({ room, locked: stage === CHALLENGE_STAGE.ROUND_LOCKED, joinedCount, answeredCount });
  const solutionOnScreen = projectorShowsSolution({ stage, solutionState });

  return (
    <div ref={shellRef} className="mm-arena-shell" data-mm-arena-stage={loading ? 'loading' : stage || 'none'} style={{
      width: '100vw',
      height: '100dvh',
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      overflow: 'hidden',
      borderRadius: 0,
      boxSizing: 'border-box',
      padding: 'clamp(12px, 2vw, 28px)',
      display: 'grid',
      gridTemplateRows: 'auto minmax(0,1fr) auto',
      gap: 'clamp(8px, 1.4vh, 16px)',
      color: '#f7f9ff',
      colorScheme: 'dark',
      background: 'radial-gradient(circle at 12% 12%, rgba(74,103,255,.24), transparent 34%), radial-gradient(circle at 88% 4%, rgba(174,83,255,.2), transparent 31%), radial-gradient(circle at 74% 90%, rgba(0,206,209,.12), transparent 36%), linear-gradient(145deg, #111831 0%, #091128 48%, #12142e 100%)',
      boxShadow: 'none',
    }}>
      <ChallengeShellStyles />
      <style>{`
        .mm-arena-shell::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .2;
          background-image:
            linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
          background-size: 42px 42px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,.8), transparent 85%);
        }
        .mm-arena-shell > * { position: relative; z-index: 1; min-width: 0; }
        .mm-arena-shell button:focus-visible, .mm-arena-shell select:focus-visible { outline: 3px solid #8ab4f8; outline-offset: 2px; }
        .mm-arena-pulse {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #72f1ff;
          box-shadow: 0 0 0 0 rgba(114,241,255,.45);
          animation: mmArenaPulse 1.6s infinite;
        }
        .mm-arena-orb {
          position: absolute;
          width: 240px;
          height: 240px;
          border-radius: 50%;
          filter: blur(6px);
          opacity: .23;
          pointer-events: none;
        }
        .mm-arena-orb-a { left: -90px; top: -100px; background: #536dfe; }
        .mm-arena-orb-b { right: -80px; bottom: -110px; background: #8c52ff; }
        .mm-arena-timer-low { animation: mmArenaTimerPulse .85s ease-in-out infinite alternate; }
        .mm-arena-podium-place {
          opacity: 0;
          transform: translateY(22px) scale(.98);
          animation: mmArenaPodiumReveal 520ms cubic-bezier(.2,.75,.25,1) forwards;
        }
        @keyframes mmArenaPulse {
          70% { box-shadow: 0 0 0 9px rgba(114,241,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(114,241,255,0); }
        }
        @keyframes mmArenaTimerPulse {
          from { box-shadow: 0 0 0 rgba(255,92,125,0); }
          to { box-shadow: 0 0 26px rgba(255,92,125,.2); }
        }
        @keyframes mmArenaPodiumReveal {
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (max-width: 900px) {
          .mm-arena-running-grid,
          .mm-arena-lobby-grid {
            grid-template-columns: 1fr !important;
            overflow-y: auto;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .mm-arena-pulse,
          .mm-arena-timer-low,
          .mm-arena-podium-place {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .mm-arena-shell * {
            transition-duration: 0.001ms !important;
          }
        }
      `}</style>

      <header style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center' }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span style={labelStyle}>MathMaster Arena</span>
                <ArenaBadge accent={accent}>{gameLabel}</ArenaBadge>
              </div>
              {/* Its own colour: the global h1 rule (index.css) would paint it dark on the arena. */}
              <h1 style={{ margin: '4px 0 0', fontSize: 'clamp(22px, 3vw, 40px)', lineHeight: 1.05, letterSpacing: '-.02em', color: '#f7f9ff', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!audioReady && typeof onEnableAudio === 'function' && <button type="button" onClick={onEnableAudio} style={arenaButton}>Enable Audio</button>}
            {audioReady && typeof onToggleMute === 'function' && <button type="button" aria-pressed={audioMuted} onClick={onToggleMute} style={arenaButton}>{audioMuted ? 'Unmute' : 'Mute'}</button>}
            <button type="button" onClick={nativeFullscreen ? exitFullscreen : enterFullscreen} style={arenaButton}>{nativeFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}</button>
            <button type="button" onClick={onExit} style={arenaButton}>Exit Projector View</button>
          </div>
        </div>
        {showProgress && <RoundProgress currentRound={clock.roundNumber} roundCount={clock.roundCount} accent={accent} />}
      </header>

      <main style={{ minHeight: 0, display: 'grid', gridTemplateRows: error ? 'auto minmax(0,1fr)' : 'minmax(0,1fr)', gap: 10 }}>
        {error && <div role="alert" style={{ padding: '10px 16px', borderRadius: 12, background: 'rgba(255,87,120,.16)', border: '1px solid rgba(255,105,135,.5)', color: '#ffd9e1', fontWeight: 800 }}>{error}</div>}
        <div style={{ minHeight: 0 }}>
          {loading && <section style={{ ...glassPanel, height: '100%', display: 'grid', placeItems: 'center', fontSize: 'clamp(24px, 4vh, 40px)', fontWeight: 900 }} aria-busy="true">Opening the new lobby…</section>}
          {!loading && stage === CHALLENGE_STAGE.LOBBY && <LobbyView room={room} leaderboard={leaderboard} joinedCount={joinedCount} busy={busy} onStart={onStart} />}
          {!loading && stage === CHALLENGE_STAGE.COUNTDOWN && <CountdownView room={room} clock={clock} />}
          {!loading && openRound && room?.challengeMode === RUSH_MODE_ID && <RushRunningView room={room} clock={clock} clockOffsetMs={clockOffsetMs} players={players} joinedCount={joinedCount} rows={rows} />}
          {!loading && openRound && room?.challengeMode !== RUSH_MODE_ID && <RunningView room={room} clock={clock} clockOffsetMs={clockOffsetMs} leaderboard={leaderboard} presentation={presentation} joinedCount={joinedCount} answeredCount={answeredCount} rows={rows} />}
          {!loading && stage === CHALLENGE_STAGE.ROUND_RESULTS && <ResultsView room={room} clock={clock} roundView={roundView} presentation={presentation} leaderboard={leaderboard} rows={rows} solution={solution} solutionState={solutionState} solutionHidden={solutionHidden} />}
          {!loading && stage === CHALLENGE_STAGE.COMPLETED && (
            <>
              <Confetti />
              <FinalPodium room={room} leaderboard={leaderboard} presentation={presentation} rewardsByKey={rewardsByKey} rewardSummary={room?.rewardSummary} rows={rows} />
            </>
          )}
        </div>
      </main>

      {!loading && room && (
        <HostStrip
          room={room}
          stage={stage}
          primaryAction={primaryAction}
          busy={busy}
          controlBusy={controlBusy}
          extendedTime={extendedTime}
          solutionToggle={solutionOnScreen ? { hidden: solutionHidden, onToggle: () => setSolutionHiddenFor(solutionHidden ? null : roundKey) } : null}
          onStart={onStart}
          onAdvance={onAdvance}
          onPlayAgain={onPlayAgain}
          onNewChallenge={onNewChallenge}
          onRequestEndGame={onRequestEndGame}
          onRequestEndRound={onRequestEndRound}
          onThresholdChange={onThresholdChange}
        />
      )}
      {dialog}
    </div>
  );
}
