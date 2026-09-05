import { useEffect, useMemo, useRef, useState } from 'react';
import QuestionEngine from '../../QuestionEngine.jsx';
import { publicLeaderboard, LIVE_PROVISIONAL_MAX_POINTS } from '../../../functions/shared/liveChallenge.mjs';
import { calculateStepPartialCredit, emptyQuestionRecord, recordQuestionStep } from '../../attemptPolicy.js';
import { questionFromToolPayload } from '../../platform/path/pathToolResponses.js';
import LiveChallengeFieldQuestion from './LiveChallengeFieldQuestion.jsx';
import {
  joinLiveChallenge,
  reportLiveChallengeProgress,
  submitLiveChallengeResponse,
  timestampMillis,
  watchLiveChallengePlayers,
  watchLiveChallengeRoom,
} from '../../platform/liveChallenge/liveChallengeService.js';

function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

const formatClock = (milliseconds) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const ROW_HEIGHT = 44;

function useCountUp(target, durationMs = 420) {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return undefined;
    let raf = 0;
    const started = performance.now();
    const tick = (nowTs) => {
      const t = Math.min(1, (nowTs - started) / durationMs);
      const eased = 1 - ((1 - t) ** 3);
      setShown(Math.round(from + ((target - from) * eased)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  useEffect(() => { fromRef.current = shown; }, [shown]);
  return shown;
}

function LeaderRow({ row, index, isSelf }) {
  const shown = useCountUp(row.liveScore ?? row.score);
  const working = Number(row.provisionalPoints) || 0;
  return (
    <div
      style={{
        position: 'absolute',
        insetInline: 0,
        transform: `translateY(${index * ROW_HEIGHT}px)`,
        transition: 'transform .38s cubic-bezier(.2,.8,.2,1), background .3s',
        display: 'grid',
        gridTemplateColumns: '34px minmax(0,1fr) auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 10px',
        height: ROW_HEIGHT - 8,
        boxSizing: 'border-box',
        borderRadius: 9,
        background: isSelf ? 'rgba(66,133,244,.30)' : working > 0 ? 'rgba(249,171,0,.22)' : 'rgba(255,255,255,.07)',
        border: isSelf ? '2px solid #8ab4f8' : working > 0 ? '1px solid #f9ab00' : '1px solid rgba(255,255,255,.12)',
        color: '#eef1f6',
      }}
    >
      <strong>#{row.rank}</strong>
      <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.alias}
        {working > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 900, color: '#fdd663' }}>working…</span>}
      </span>
      <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{shown.toLocaleString()}</strong>
    </div>
  );
}

function MiniLeaderboard({ rows = [], playerKey }) {
  const visible = rows.slice(0, 5);
  return (
    <div style={{ position: 'relative', height: Math.max(1, visible.length) * ROW_HEIGHT }}>
      {visible.map((row, index) => (
        <LeaderRow key={row.playerKey || row.alias} row={row} index={index} isSelf={row.playerKey === playerKey} />
      ))}
    </div>
  );
}

/*
 * Exported so a teacher's dry run plays the same round a student plays.
 * `submitResponse` is injectable so rehearsal can grade without writing game
 * score while preserving the exact student renderer and countdown behavior.
 */
export function ChallengeRound({
  room,
  alias,
  playerKey,
  leaderboard,
  studentProfile,
  onResult,
  submitResponse = submitLiveChallengeResponse,
  reportProgress = reportLiveChallengeProgress,
  showLeaderboard = true,
  beforeQuestion = null,
}) {
  const question = room.currentQuestion;
  const roundIndex = Number(room.currentRound) || 0;
  const now = useNow(true);
  const endsAtMs = timestampMillis(room.roundEndsAt);
  const remainingMs = Math.max(0, endsAtMs - now);
  const expired = endsAtMs > 0 && remainingMs <= 0;
  const urgent = !expired && remainingMs <= 10000;
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [stepRecord, setStepRecord] = useState(() => emptyQuestionRecord());
  const stepRecordRef = useRef(stepRecord);
  const workingPoints = useMemo(
    () => Math.round((LIVE_PROVISIONAL_MAX_POINTS * clampPercent(calculateStepPartialCredit(stepRecord.stepGrades, stepRecord.variantIndex))) / 100),
    [stepRecord],
  );
  const secureQuestion = useMemo(
    () => questionFromToolPayload(question),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.questionInstanceId, question?.pathToolId],
  );

  useEffect(() => {
    setResult(null);
    setSubmitError('');
    const fresh = emptyQuestionRecord();
    stepRecordRef.current = fresh;
    setStepRecord(fresh);
  }, [roundIndex, question?.questionInstanceId]);

  const reportedRef = useRef(-1);
  useEffect(() => {
    if (result || expired || !room?.roomId) return undefined;
    if (workingPoints === reportedRef.current) return undefined;
    const timer = window.setTimeout(() => {
      reportedRef.current = workingPoints;
      Promise.resolve(reportProgress({ roomId: room.roomId, roundIndex, provisionalPoints: workingPoints })).catch(() => {});
    }, 900);
    return () => window.clearTimeout(timer);
  }, [workingPoints, result, expired, room?.roomId, roundIndex, reportProgress]);

  const submit = async (responsePayload) => {
    if (result || expired) return null;
    setSubmitError('');
    try {
      const grading = await submitResponse({ roomId: room.roomId, roundIndex, responsePayload });
      setResult(grading);
      onResult?.(grading);
      return {
        isCorrect: grading.isCorrect,
        status: grading.isCorrect ? 'correct' : 'attempted',
        attemptCount: 1,
        remainingAttempts: 0,
        expired: false,
        message: grading.isCorrect
          ? `${grading.comebackBonus > 0 ? 'Comeback! ' : grading.secondChance ? 'Second chance · ' : ''}Correct · +${grading.pointsAwarded} points`
          : `${Number(grading.scorePercent) || 0}% credit · +${Number(grading.pointsAwarded) || 0} points`,
      };
    } catch (error) {
      setSubmitError(error?.message || 'Your answer could not be submitted.');
      return null;
    }
  };

  const currentSelf = leaderboard.find((entry) => entry.playerKey === playerKey);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {beforeQuestion}
      <section
        style={{
          display: 'grid',
          gap: 10,
          padding: '14px 17px',
          borderRadius: 14,
          background: urgent ? 'linear-gradient(135deg,#7f1d1d,#a50e0e)' : 'linear-gradient(135deg,#174ea6,#1a73e8)',
          color: '#fff',
          transition: 'background .5s',
          boxShadow: '0 2px 10px rgba(23,78,166,.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,.18)', fontWeight: 900, fontSize: 13 }}>{alias}</span>
            <span style={{ fontWeight: 900, fontSize: 15 }}>Round {roundIndex + 1} of {room.roundCount}</span>
            <span style={{ opacity: .82, fontSize: 13 }}>{question?.teksCode || 'Mixed review'}</span>
          </div>
          <div
            aria-label={`${Math.ceil(remainingMs / 1000)} seconds left`}
            style={{
              fontSize: 40,
              fontWeight: 1000,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              animation: urgent ? 'challengePulse .9s ease-in-out infinite' : 'none',
            }}
          >
            {formatClock(remainingMs)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 5 }} aria-hidden="true">
          {Array.from({ length: Math.max(1, Number(room.roundCount) || 1) }).map((_, pip) => (
            <span
              key={pip}
              style={{
                flex: 1,
                height: 5,
                borderRadius: 999,
                background: pip < roundIndex ? 'rgba(255,255,255,.85)' : pip === roundIndex ? '#fdd663' : 'rgba(255,255,255,.25)',
                transition: 'background .3s',
              }}
            />
          ))}
        </div>

        {workingPoints > 0 && !result && (
          <div aria-live="polite" style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontWeight: 900 }}>
            <span style={{ fontSize: 13, opacity: .85 }}>Points banked this round</span>
            <span style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums', color: '#fdd663' }}>+{workingPoints.toLocaleString()}</span>
            <span style={{ fontSize: 12, opacity: .8 }}>keep going — every correct step adds more</span>
          </div>
        )}
      </section>

      {secureQuestion ? (
        <section style={{ background: '#fff', borderRadius: 14, border: '1px solid #d8dde6', overflow: 'hidden' }}>
          <QuestionEngine
            key={question?.questionInstanceId}
            question={secureQuestion}
            questionRecord={{ status: result?.isCorrect ? 'correct' : result ? 'attempted' : 'unattempted', attemptCount: result ? 1 : 0 }}
            studentProfile={studentProfile}
            maximumAttempts={1}
            activityRole="practice"
            assignmentLocked={Boolean(result) || expired}
            assignmentLockedMessage={expired && !result ? 'Time is up for this Live Challenge round.' : 'Your answer is locked in for this round.'}
            draftKey={`live-challenge-${room.roomId}-${roundIndex}`}
            serverGrading={{
              pathToolId: question.pathToolId,
              submit: async (rawWork) => submit({ raw: rawWork }),
            }}
            onStepGrade={async ({ stepGrade, countsAttempt, statePatch, supportUsage = null }) => {
              const outcome = recordQuestionStep({
                record: stepRecordRef.current,
                stepGrade,
                countsAttempt,
                statePatch,
                supportUsage,
                maximumAttempts: 1,
              });
              stepRecordRef.current = outcome.record;
              setStepRecord(outcome.record);
              return outcome.result;
            }}
            onGrade={() => null}
          />
        </section>
      ) : (
        <LiveChallengeFieldQuestion question={question} disabled={Boolean(result) || expired} onSubmit={submit} />
      )}

      {submitError && <div role="alert" style={{ padding: 11, borderRadius: 9, background: '#4a3708', color: '#ffe9a8', border: '1px solid #f9ab00' }}>{submitError}</div>}
      {expired && !result && <div aria-live="polite" style={{ padding: 15, borderRadius: 11, background: 'rgba(255,255,255,.08)', color: '#eef1f6', border: '1px solid rgba(255,255,255,.16)', fontWeight: 900 }}>Time is up. Wait for your teacher to start the next round.</div>}
      {result && (
        <section aria-live="polite" style={{ padding: 16, borderRadius: 12, background: result.isCorrect ? '#e6f4ea' : '#fff4ce', color: result.isCorrect ? '#137333' : '#7a4f00', textAlign: 'left' }}>
          <div style={{ fontSize: 22, fontWeight: 1000 }}>{result.isCorrect ? 'Correct!' : `${Number(result.scorePercent) || 0}% credit`}</div>
          {result.comebackBonus > 0 && (
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 900 }}>
              Comeback! You missed the last one and got this one. +{result.comebackBonus}
            </div>
          )}
          {result.secondChance && result.recoveryPoints > 0 && (
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 900 }}>
              Second chance — you got points back on this one. +{result.recoveryPoints}
            </div>
          )}
          <div style={{ marginTop: 5, fontWeight: 800 }}>+{Number(result.pointsAwarded) || 0} points · Total {(Number(result.totalScore) || 0).toLocaleString()}{result.rank ? ` · Rank #${result.rank}` : ''}</div>
          {!result.secondChance && (result.speedBonus > 0 || result.streakBonus > 0) && <div style={{ marginTop: 4, fontSize: 13 }}>Accuracy base {Number(result.basePoints) || 0} · Speed +{Number(result.speedBonus) || 0} · Streak +{Number(result.streakBonus) || 0}</div>}
        </section>
      )}

      {showLeaderboard && (
        <section style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', textAlign: 'left', color: '#eef1f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}><strong>Top 5</strong>{currentSelf && <span style={{ color: '#9fb0cc', fontSize: 13 }}>You: #{currentSelf.rank} · {(currentSelf.liveScore ?? currentSelf.score).toLocaleString()}</span>}</div>
          <MiniLeaderboard rows={leaderboard} playerKey={playerKey} />
        </section>
      )}
    </div>
  );
}

export default function LiveChallengeStudent({ invite, studentProfile = {}, onExit, exitLabel = 'Back to Dashboard' }) {
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const roomId = invite?.roomId || null;

  useEffect(() => {
    if (!roomId) { setRoom(null); return undefined; }
    return watchLiveChallengeRoom(roomId, setRoom, (watchError) => setError(watchError?.message || 'Could not load the Live Challenge.'));
  }, [roomId]);

  useEffect(() => {
    if (!roomId) { setPlayers([]); return undefined; }
    return watchLiveChallengePlayers(roomId, setPlayers, (watchError) => setError(watchError?.message || 'Could not load Live Challenge standings.'));
  }, [roomId]);

  const activeRound = room?.status === 'running' ? Number(room.currentRound) : null;
  const leaderboard = useMemo(() => publicLeaderboard(players, { activeRound }), [players, activeRound]);

  useEffect(() => {
    if (!roomId || joining || !room || !['lobby', 'running'].includes(room.status)) return;
    const alreadyJoined = leaderboard.some((entry) => entry.playerKey === invite?.playerKey);
    if (alreadyJoined) return;
    setJoining(true);
    joinLiveChallenge({ roomId })
      .catch((joinError) => setError(joinError?.message || 'Could not join the Live Challenge.'))
      .finally(() => setJoining(false));
  }, [roomId, room?.status, invite?.playerKey, joining, leaderboard]);

  if (!invite || !roomId) {
    return <div style={{ padding: 40, textAlign: 'center' }}><h2>No Live Challenge is waiting.</h2><button type="button" onClick={onExit}>{exitLabel}</button></div>;
  }

  if (!room) {
    return (
      <div style={{ minHeight: '100vh', padding: 40, background: 'radial-gradient(120% 90% at 50% 0%, #1f2a44 0%, #131722 55%, #0d1017 100%)', color: '#eef1f6', textAlign: 'center', fontFamily: '"Segoe UI", sans-serif' }}>
        <h2 style={{ color: '#fff' }}>Opening {invite.title || 'Live Challenge'}…</h2>
        {error && <p style={{ color: '#ffb4ab' }}>{error}</p>}
      </div>
    );
  }

  const selfRow = leaderboard.find((entry) => entry.playerKey === invite.playerKey);

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(120% 90% at 50% 0%, #1f2a44 0%, #131722 55%, #0d1017 100%)', padding: '20px 14px 50px', fontFamily: '"Segoe UI", sans-serif', color: '#eef1f6' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ color: '#fdd663', fontSize: 12, fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '.08em' }}>MathMaster Live Challenge</div>
            <h1 style={{ margin: '4px 0 0', fontSize: 25, color: '#fff' }}>{room.title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {selfRow && room.status === 'running' && (
              <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: '#9fb0cc', fontWeight: 900 }}>Your score</div>
                <div style={{ fontSize: 22, fontWeight: 1000, fontVariantNumeric: 'tabular-nums', color: '#fdd663' }}>
                  {(selfRow.liveScore ?? selfRow.score).toLocaleString()}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onExit}
              style={{ minHeight: 44, padding: '9px 14px', border: '1px solid rgba(255,255,255,.35)', borderRadius: 8, background: 'transparent', color: '#eef1f6', fontWeight: 900, cursor: 'pointer' }}
            >
              {exitLabel}
            </button>
          </div>
        </header>
        {error && <div role="alert" style={{ marginBottom: 14, padding: 11, borderRadius: 9, background: '#4a3708', color: '#ffe9a8', border: '1px solid #f9ab00' }}>{error}</div>}

        {room.status === 'lobby' && (
          <section style={{ padding: 30, borderRadius: 18, background: 'linear-gradient(135deg,#1d3a6e,#25508f)', border: '1px solid rgba(174,203,250,.35)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#aecbfa', textTransform: 'uppercase', letterSpacing: '.08em' }}>You are in as</div>
            <div style={{ marginTop: 8, fontSize: 38, fontWeight: 1000, color: '#fff' }}>{invite.alias || 'Player'}</div>
            <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 9, padding: '8px 16px', borderRadius: 999, background: 'rgba(0,0,0,.28)' }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: '#81c995', animation: 'challengePulse 1.6s ease-in-out infinite' }} />
              <span style={{ fontSize: 17, fontWeight: 800 }}>{joining ? 'Joining…' : `${leaderboard.length} ${leaderboard.length === 1 ? 'player' : 'players'} in`}</span>
            </div>
            <p style={{ margin: '18px 0 0', color: '#c3d2ea' }}>Keep this screen open. Your teacher starts Round 1.</p>
          </section>
        )}

        {room.status === 'running' && room.currentQuestion && (
          <ChallengeRound key={`${room.roomId}-${room.currentRound}`} room={room} alias={invite.alias} playerKey={invite.playerKey} leaderboard={leaderboard} studentProfile={studentProfile} />
        )}

        {room.status === 'finished' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <section style={{ padding: 26, borderRadius: 18, background: 'linear-gradient(135deg,#14532d,#1c7a44)', border: '1px solid rgba(129,201,149,.4)', textAlign: 'center' }}>
              <div style={{ color: '#b7e4c7', fontWeight: 1000, textTransform: 'uppercase', letterSpacing: '.08em', fontSize: 13 }}>Challenge complete</div>
              {selfRow && (
                <div style={{ margin: '10px 0 4px' }}>
                  <div style={{ fontSize: 52, fontWeight: 1000, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>#{selfRow.rank}</div>
                  <div style={{ marginTop: 6, fontSize: 19, fontWeight: 900, color: '#fdd663' }}>{selfRow.score.toLocaleString()} points · {selfRow.correctCount} correct</div>
                </div>
              )}
              <h2 style={{ margin: '12px 0 6px', color: '#fff' }}>Final Standings</h2>
              <p style={{ margin: 0, color: '#c9e7d4' }}>Your game score is practice feedback. It does not change your assignment grade.</p>
            </section>
            <section style={{ padding: 18, borderRadius: 16, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)' }}>
              <MiniLeaderboard rows={leaderboard} playerKey={invite.playerKey} />
            </section>
            <button type="button" onClick={onExit} style={{ justifySelf: 'center', minHeight: 44, padding: '11px 20px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>{exitLabel}</button>
          </div>
        )}

        {room.status === 'cancelled' && (
          <section style={{ padding: 26, borderRadius: 16, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, color: '#fff' }}>This challenge was cancelled.</h2>
            <button type="button" onClick={onExit} style={{ minHeight: 44, padding: '11px 20px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>{exitLabel}</button>
          </section>
        )}
      </div>
    </div>
  );
}
