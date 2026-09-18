import { useEffect, useRef, useState } from 'react';
import MathText from '../common/MathText.jsx';
import {
  finalStandingRows,
  podiumRows,
  projectorAnsweredCount,
  projectorCurrentRound,
  projectorDifficultyLabel,
  projectorFamilyLabel,
  projectorGameLabel,
  projectorRoundCount,
  projectorScore,
} from '../../platform/liveChallenge/liveChallengeProjectorModel.js';

const FAMILY_ACCENTS = Object.freeze({
  linearEquation: '#5ee7ff',
  literalEquation: '#8df7c9',
  linearInequality: '#ffd166',
  absoluteValueEquation: '#c9a7ff',
  absoluteValueInequality: '#ff8fb1',
});

const arenaButton = {
  border: '1px solid rgba(255,255,255,.22)',
  borderRadius: 12,
  padding: '10px 14px',
  background: 'rgba(12,18,42,.72)',
  color: '#f7f9ff',
  fontWeight: 900,
  cursor: 'pointer',
  backdropFilter: 'blur(8px)',
};

const glassPanel = {
  background: 'linear-gradient(145deg, rgba(18,28,62,.88), rgba(11,18,42,.9))',
  border: '1px solid rgba(163,185,255,.22)',
  boxShadow: '0 20px 50px rgba(0,0,0,.25), inset 0 1px rgba(255,255,255,.04)',
  borderRadius: 22,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 1000,
  letterSpacing: '.11em',
  textTransform: 'uppercase',
};

const scoreText = (row) => projectorScore(row).toLocaleString();

const familyAccent = (room) => FAMILY_ACCENTS[room?.currentQuestion?.challengeFamily] || '#7aa8ff';

function ArenaBadge({ children, accent = '#7aa8ff' }) {
  if (!children) return null;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 28,
      padding: '4px 10px',
      borderRadius: 999,
      border: `1px solid ${accent}66`,
      background: `${accent}18`,
      color: '#f7f9ff',
      fontSize: 12,
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
              height: active ? 10 : 7,
              flex: 1,
              minWidth: 4,
              borderRadius: 999,
              alignSelf: 'center',
              background: complete
                ? `linear-gradient(90deg, ${accent}, #b8c8ff)`
                : active
                  ? '#fff'
                  : 'rgba(255,255,255,.14)',
              boxShadow: active ? `0 0 18px ${accent}` : 'none',
              opacity: complete ? .82 : 1,
              transition: 'height 160ms ease, background 160ms ease',
            }}
          />
        );
      })}
    </div>
  );
}

function ArenaLeaderboard({ rows = [], limit = 8, compact = false }) {
  const shown = finalStandingRows(rows).slice(0, limit);
  if (!shown.length) {
    return <div style={{ color: 'rgba(235,240,255,.68)', padding: '14px 0' }}>Players will appear here as they join.</div>;
  }
  return (
    <div style={{ display: 'grid', gap: compact ? 7 : 9 }}>
      {shown.map((row) => {
        const topThree = Number(row.rank) <= 3;
        const rankAccent = row.rank === 1 ? '#ffd166' : row.rank === 2 ? '#cbd5e1' : row.rank === 3 ? '#d99562' : '#8ca5d9';
        return (
          <div
            key={row.playerKey || `${row.rank}-${row.alias}`}
            style={{
              display: 'grid',
              gridTemplateColumns: compact ? '34px minmax(0,1fr) auto' : '42px minmax(0,1fr) auto auto',
              gap: 10,
              alignItems: 'center',
              minHeight: compact ? 42 : 50,
              padding: compact ? '7px 10px' : '9px 12px',
              borderRadius: 14,
              background: topThree ? `linear-gradient(90deg, ${rankAccent}18, rgba(255,255,255,.055))` : 'rgba(255,255,255,.045)',
              border: `1px solid ${topThree ? rankAccent + '45' : 'rgba(255,255,255,.08)'}`,
            }}
          >
            <strong style={{ textAlign: 'center', color: rankAccent, fontSize: compact ? 14 : 16 }}>#{row.rank}</strong>
            <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#f7f9ff' }}>{row.alias}</span>
            {!compact && <span style={{ color: 'rgba(235,240,255,.65)', fontSize: 13 }}>{row.correctCount} ✓</span>}
            <strong style={{ fontVariantNumeric: 'tabular-nums', color: '#fff' }}>{scoreText(row)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function PodiumPlace({ row, place, accent, height, revealDelay, title }) {
  if (!row) return <div />;
  const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉';
  return (
    <div className="mm-arena-podium-place" style={{ animationDelay: `${revealDelay}ms`, alignSelf: 'end' }}>
      <div style={{
        padding: place === 1 ? '18px 16px 16px' : '14px 14px 13px',
        borderRadius: '20px 20px 10px 10px',
        textAlign: 'center',
        background: `linear-gradient(160deg, ${accent}28, rgba(255,255,255,.055))`,
        border: `1px solid ${accent}70`,
        boxShadow: place === 1 ? `0 0 38px ${accent}25` : '0 16px 30px rgba(0,0,0,.2)',
      }}>
        <div aria-hidden="true" style={{ fontSize: place === 1 ? 42 : 32, lineHeight: 1 }}>{medal}</div>
        <div style={{ ...labelStyle, marginTop: 7, color: accent }}>{title}</div>
        <div style={{ marginTop: 6, fontWeight: 1000, fontSize: place === 1 ? 23 : 18, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.alias}</div>
        <div style={{ marginTop: 5, color: 'rgba(240,244,255,.74)', fontWeight: 800 }}>{scoreText(row)} pts</div>
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
        fontSize: place === 1 ? 38 : 29,
        fontWeight: 1000,
        textShadow: '0 3px 12px rgba(0,0,0,.35)',
      }}>
        {place}
      </div>
    </div>
  );
}

function FinalPodium({ leaderboard = [] }) {
  const podium = podiumRows(leaderboard);
  const standings = finalStandingRows(leaderboard);
  const remaining = standings.filter((row) => Number(row.rank) > 3).slice(0, 9);

  return (
    <div className="mm-arena-finish" style={{ display: 'grid', gap: 24 }}>
      <div style={{ textAlign: 'center', paddingTop: 6 }}>
        <div style={{ ...labelStyle, color: '#9cb8ff' }}>Challenge Complete</div>
        <h2 style={{ margin: '6px 0 0', fontSize: 'clamp(32px, 5vw, 58px)', lineHeight: 1, letterSpacing: '-.025em' }}>Final Podium</h2>
        <div style={{ marginTop: 8, color: 'rgba(236,241,255,.66)', fontWeight: 800 }}>Top finishers take the arena.</div>
      </div>

      <div style={{
        maxWidth: 900,
        width: '100%',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.12fr) minmax(0,1fr)',
        gap: 14,
        alignItems: 'end',
      }}>
        <PodiumPlace row={podium.second} place={2} accent="#cbd5e1" height={72} revealDelay={80} title="2nd Place" />
        <PodiumPlace row={podium.first} place={1} accent="#ffd166" height={112} revealDelay={620} title="Champion" />
        <PodiumPlace row={podium.third} place={3} accent="#d99562" height={52} revealDelay={350} title="3rd Place" />
      </div>

      {remaining.length > 0 && (
        <section style={{ ...glassPanel, padding: 18, maxWidth: 820, width: '100%', margin: '0 auto' }}>
          <div style={{ ...labelStyle, color: '#9cb8ff', marginBottom: 10 }}>Final Standings</div>
          <ArenaLeaderboard rows={remaining} limit={9} compact />
        </section>
      )}
    </div>
  );
}

function LobbyView({ room, leaderboard, joinedCount, busy, onStart }) {
  const eligible = Math.max(0, Number(room?.eligibleCount) || 0);
  const players = finalStandingRows(leaderboard).slice(0, 14);
  return (
    <div className="mm-arena-lobby-grid" style={{ minHeight: '62vh', display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(300px,.85fr)', gap: 22, alignItems: 'stretch' }}>
      <section style={{ ...glassPanel, padding: 'clamp(24px, 5vw, 58px)', display: 'grid', alignContent: 'center', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div className="mm-arena-orb mm-arena-orb-a" />
        <div className="mm-arena-orb mm-arena-orb-b" />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ ...labelStyle, color: '#8fb2ff' }}>Arena Lobby</div>
          <div style={{ marginTop: 10, fontSize: 'clamp(76px, 12vw, 150px)', lineHeight: .85, fontWeight: 1000, letterSpacing: '-.06em' }}>{joinedCount}</div>
          <div style={{ marginTop: 12, fontSize: 24, fontWeight: 900 }}>students ready</div>
          {eligible > 0 && <div style={{ marginTop: 6, color: 'rgba(236,241,255,.6)', fontWeight: 700 }}>{joinedCount} of {eligible} invited</div>}
          <div style={{ marginTop: 28, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 999, background: 'rgba(99,226,255,.1)', border: '1px solid rgba(99,226,255,.28)', color: '#c8f6ff', fontWeight: 900 }}>
            <span className="mm-arena-pulse" /> Waiting for teacher to start
          </div>
          {typeof onStart === 'function' && <div style={{ marginTop: 24 }}>
            <button type="button" disabled={joinedCount < 1 || busy === 'start'} onClick={onStart} style={{ ...arenaButton, padding: '15px 28px', fontSize: 18, background: 'linear-gradient(135deg, #536dfe, #8c52ff)', opacity: joinedCount < 1 || busy === 'start' ? .5 : 1 }}>
              {busy === 'start' ? 'Starting Challenge…' : 'Start Challenge'}
            </button>
          </div>}
        </div>
      </section>

      <section style={{ ...glassPanel, padding: 20 }}>
        <div style={{ ...labelStyle, color: '#9cb8ff', marginBottom: 12 }}>Contestants</div>
        {players.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {players.map((row) => (
              <span key={row.playerKey || row.alias} style={{ padding: '9px 12px', borderRadius: 999, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.09)', fontWeight: 900 }}>
                {row.alias}
              </span>
            ))}
          </div>
        ) : <div style={{ color: 'rgba(236,241,255,.62)' }}>Players appear here as they join.</div>}
      </section>
    </div>
  );
}

function RunningView({ room, leaderboard, joinedCount, remainingMs, canAdvance, busy, onAdvance }) {
  const round = projectorCurrentRound(room);
  const roundCount = projectorRoundCount(room);
  const answered = projectorAnsweredCount(leaderboard, Number(room?.currentRound) || 0);
  const family = projectorFamilyLabel(room);
  const difficulty = projectorDifficultyLabel(room);
  const accent = familyAccent(room);
  const lowTime = Number(remainingMs) <= 10000;
  const roundComplete = Number(remainingMs) <= 0;
  const advanceAvailable = roundComplete || canAdvance;
  const finalRound = Number(room?.currentRound) + 1 >= projectorRoundCount(room);
  const replay = room?.secondChanceOf != null;
  const replayOrdinal = Math.max(1, Number(room?.finalRoundNumber) || 1);

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <RoundProgress currentRound={round} roundCount={roundCount} accent={accent} />
      <div className="mm-arena-running-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.42fr) minmax(300px,.78fr)', gap: 20, alignItems: 'stretch' }}>
        <section style={{ ...glassPanel, padding: 'clamp(20px, 3vw, 34px)', display: 'grid', alignContent: 'space-between', minHeight: '58vh' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <ArenaBadge accent={accent}>{replay ? `FINAL ROUND ${replayOrdinal}` : `Round ${round} / ${roundCount}`}</ArenaBadge>
              {replay && <ArenaBadge accent="#ffd166">SECOND CHANCE</ArenaBadge>}
              <ArenaBadge accent={accent}>{family}</ArenaBadge>
              {difficulty && <ArenaBadge accent="#b79cff">{difficulty}</ArenaBadge>}
            </div>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
              <div>
                <div style={{ ...labelStyle, color: 'rgba(236,241,255,.54)' }}>Solve Now</div>
                <MathText
                  as="div"
                  style={{ marginTop: 12, whiteSpace: 'pre-wrap', fontSize: 'clamp(25px, 3vw, 40px)', lineHeight: 1.38, fontWeight: 900, color: '#fff' }}
                >
                  {room?.currentQuestion?.prompt}
                </MathText>
              </div>
              <div className={lowTime ? 'mm-arena-timer mm-arena-timer-low' : 'mm-arena-timer'} style={{
                minWidth: 170,
                padding: '15px 18px',
                textAlign: 'center',
                borderRadius: 18,
                background: lowTime ? 'rgba(255,87,120,.13)' : 'rgba(95,145,255,.12)',
                border: `1px solid ${lowTime ? 'rgba(255,105,135,.46)' : 'rgba(130,165,255,.36)'}`,
              }}>
                <div style={{ ...labelStyle, color: lowTime ? '#ff9bb0' : '#a8c2ff' }}>{roundComplete ? 'Round Complete' : 'Time Left'}</div>
                <div style={{ marginTop: 3, fontSize: 'clamp(45px, 6vw, 78px)', fontWeight: 1000, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.05em' }}>
                  {formatArenaClock(remainingMs)}
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 220, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, fontWeight: 900, color: 'rgba(236,241,255,.68)' }}>
                <span>Locked in</span><span>{answered} / {joinedCount}</span>
              </div>
              <div style={{ height: 10, marginTop: 7, background: 'rgba(255,255,255,.08)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${joinedCount > 0 ? Math.min(100, Math.round(answered / joinedCount * 100)) : 0}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${accent}, #b8c8ff)`, transition: 'width 200ms ease' }} />
              </div>
            </div>
            <div style={{ color: 'rgba(236,241,255,.54)', fontSize: 12, fontWeight: 800 }}>Scores update as answers lock.</div>
          </div>
        </section>

        <section style={{ ...glassPanel, padding: 18, minHeight: '58vh' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: 12 }}>
            <div style={{ ...labelStyle, color: '#9cb8ff' }}>Live Standings</div>
            <div style={{ color: 'rgba(236,241,255,.5)', fontSize: 12, fontWeight: 800 }}>{joinedCount} playing</div>
          </div>
          <ArenaLeaderboard rows={leaderboard} limit={8} />
        </section>
      </div>
      {advanceAvailable && typeof onAdvance === 'function' && (
        <section aria-label="Round controls" style={{ ...glassPanel, padding: 18, display: 'flex', justifyContent: 'center' }}>
          <button type="button" disabled={busy === 'advance'} onClick={onAdvance} style={{ ...arenaButton, padding: '16px 30px', fontSize: 19, background: 'linear-gradient(135deg, #536dfe, #8c52ff)', boxShadow: '0 0 28px rgba(112,104,255,.3)', opacity: busy === 'advance' ? .55 : 1 }}>
            {busy === 'advance' ? 'Loading Next Round…' : replay ? (room.hasAdditionalReplay ? 'Next Final Round' : 'Finish & Show Final Standings') : finalRound ? 'Finish & Show Final Standings' : 'Next Round'}
          </button>
        </section>
      )}
    </div>
  );
}

export const formatArenaClock = (milliseconds) => {
  const total = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export default function LiveChallengeArenaProjector({
  room = {},
  leaderboard = [],
  joinedCount = 0,
  remainingMs = 0,
  canAdvance = false,
  busy = '',
  error = '',
  audioReady = false,
  onEnableAudio,
  onStart,
  onAdvance,
  onThresholdChange,
  onExit,
}) {
  const shellRef = useRef(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
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
  const gameLabel = projectorGameLabel(room);
  const accent = familyAccent(room);
  const title = room?.title || 'MathMaster Live Challenge';

  return (
    <div ref={shellRef} className="mm-arena-shell" style={{
      width: '100vw',
      height: '100dvh',
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      overflow: 'hidden',
      overflowY: 'auto',
      borderRadius: 0,
      boxSizing: 'border-box',
      padding: 'clamp(18px, 2.8vw, 34px)',
      color: '#f7f9ff',
      background: 'radial-gradient(circle at 12% 12%, rgba(74,103,255,.24), transparent 34%), radial-gradient(circle at 88% 4%, rgba(174,83,255,.2), transparent 31%), radial-gradient(circle at 74% 90%, rgba(0,206,209,.12), transparent 36%), linear-gradient(145deg, #111831 0%, #091128 48%, #12142e 100%)',
      boxShadow: 'none',
    }}>
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
        .mm-arena-shell::after {
          content: "";
          position: absolute;
          inset: -1px;
          pointer-events: none;
          border-radius: 26px;
          border: 1px solid rgba(160,182,255,.18);
          box-shadow: inset 0 0 60px rgba(91,113,255,.08);
        }
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
        .mm-arena-finish::before {
          content: "✦   ✧   ✦";
          display: block;
          text-align: center;
          color: rgba(255,215,102,.75);
          letter-spacing: 1.2em;
          font-size: 18px;
          margin-bottom: -8px;
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

      <div style={{ position: 'relative', zIndex: 1, display: 'grid', gap: 22 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              <span style={{ ...labelStyle, color: '#9cb8ff' }}>MathMaster Arena</span>
              <ArenaBadge accent={accent}>{gameLabel}</ArenaBadge>
            </div>
            <h1 style={{ margin: '5px 0 0', fontSize: 'clamp(27px, 3.4vw, 46px)', lineHeight: 1.03, letterSpacing: '-.025em', overflowWrap: 'anywhere' }}>{title}</h1>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            <label style={{ fontSize: 12, fontWeight: 900 }}>Round closing threshold
              <select aria-label="Round closing threshold" value={room.roundClosingThreshold ?? 'off'} onChange={(event) => onThresholdChange?.(event.target.value)} style={{ ...arenaButton, marginLeft: 7 }}>
                <option value="off">Off</option>{[60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
              </select>
            </label>
            {!audioReady && typeof onEnableAudio === 'function' && <button type="button" onClick={onEnableAudio} style={arenaButton}>Enable Audio</button>}
            <button type="button" onClick={nativeFullscreen ? exitFullscreen : enterFullscreen} style={arenaButton}>{nativeFullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}</button>
            <button type="button" onClick={onExit} style={arenaButton}>Exit Projector View</button>
          </div>
        </header>

        {error && <div role="alert" style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,87,120,.16)', border: '1px solid rgba(255,105,135,.5)', color: '#ffd9e1', fontWeight: 800 }}>{error}</div>}
        {room?.status === 'lobby' && <LobbyView room={room} leaderboard={leaderboard} joinedCount={joinedCount} busy={busy} onStart={onStart} />}
        {room?.status === 'running' && <RunningView room={room} leaderboard={leaderboard} joinedCount={joinedCount} remainingMs={remainingMs} canAdvance={canAdvance} busy={busy} onAdvance={onAdvance} />}
        {room?.status === 'finished' && <FinalPodium leaderboard={leaderboard} />}
      </div>
    </div>
  );
}
