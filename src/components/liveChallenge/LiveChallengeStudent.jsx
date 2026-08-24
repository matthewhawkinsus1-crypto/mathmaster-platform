import { useEffect, useMemo, useState } from 'react';
import QuestionEngine from '../../QuestionEngine.jsx';
import { publicLeaderboard } from '../../../functions/shared/liveChallenge.mjs';
import { questionFromToolPayload } from '../../platform/path/pathToolResponses.js';
import {
  joinLiveChallenge,
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

const formatClock = (milliseconds) => {
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

function MiniLeaderboard({ rows = [], playerKey }) {
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {rows.slice(0, 5).map((row) => (
        <div key={row.playerKey || row.alias} style={{ display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 9, background: row.playerKey === playerKey ? '#e8f0fe' : '#f8f9fa', border: row.playerKey === playerKey ? '2px solid #1a73e8' : '1px solid #e1e5ea' }}>
          <strong>#{row.rank}</strong><span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.alias}</span><strong>{row.score.toLocaleString()}</strong>
        </div>
      ))}
    </div>
  );
}

function FieldQuestion({ question, disabled, onSubmit }) {
  const fields = question?.responseFields?.length ? question.responseFields : [{ id: 'answer', label: 'Answer', inputProfile: 'text' }];
  const [responses, setResponses] = useState({});
  const [busy, setBusy] = useState(false);
  const complete = fields.every((field) => String(responses[field.id] ?? '').trim() !== '');

  useEffect(() => setResponses({}), [question?.questionInstanceId]);

  const submit = async () => {
    if (!complete || disabled || busy) return;
    setBusy(true);
    try { await onSubmit({ responses }); }
    finally { setBusy(false); }
  };

  return (
    <section style={{ padding: 20, borderRadius: 14, background: '#fff', border: '1px solid #d8dde6', textAlign: 'left' }}>
      <div style={{ color: '#174ea6', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{question?.teksCode || 'Live Challenge'}</div>
      <h2 style={{ margin: '8px 0 18px', whiteSpace: 'pre-wrap', lineHeight: 1.45, fontSize: 22 }}>{question?.prompt}</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        {fields.map((field, fieldIndex) => (
          <label key={field.id} style={{ fontWeight: 800 }}>{field.label || 'Answer'}{field.unit ? ` (${field.unit})` : ''}
            <input
              autoFocus={fieldIndex === 0}
              type={['number', 'numeric'].includes(field.inputProfile) ? 'number' : 'text'}
              inputMode={['number', 'numeric'].includes(field.inputProfile) ? 'decimal' : undefined}
              value={responses[field.id] ?? ''}
              disabled={disabled || busy}
              onChange={(event) => setResponses((current) => ({ ...current, [field.id]: event.target.value }))}
              onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
              style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: 12, border: '2px solid #c7ccd1', borderRadius: 8, fontSize: 18 }}
            />
          </label>
        ))}
      </div>
      <button type="button" disabled={!complete || disabled || busy} onClick={submit} style={{ marginTop: 16, padding: '11px 18px', border: 0, borderRadius: 9, background: !complete || disabled || busy ? '#dadce0' : '#1a73e8', color: '#fff', fontWeight: 900 }}>{busy ? 'Checking…' : 'Lock In Answer'}</button>
    </section>
  );
}

function ChallengeRound({ room, alias, playerKey, leaderboard, studentProfile, onResult }) {
  const question = room.currentQuestion;
  const roundIndex = Number(room.currentRound) || 0;
  const now = useNow(true);
  const endsAtMs = timestampMillis(room.roundEndsAt);
  const remainingMs = Math.max(0, endsAtMs - now);
  const expired = endsAtMs > 0 && remainingMs <= 0;
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const secureQuestion = useMemo(
    () => questionFromToolPayload(question),
    // The round's instance id is the reset boundary for the real math tool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.questionInstanceId, question?.pathToolId],
  );

  useEffect(() => { setResult(null); setSubmitError(''); }, [roundIndex, question?.questionInstanceId]);

  const submit = async (responsePayload) => {
    if (result || expired) return null;
    setSubmitError('');
    try {
      const grading = await submitLiveChallengeResponse({ roomId: room.roomId, roundIndex, responsePayload });
      setResult(grading);
      onResult?.(grading);
      return {
        isCorrect: grading.isCorrect,
        status: grading.isCorrect ? 'correct' : 'attempted',
        attemptCount: 1,
        remainingAttempts: 0,
        expired: false,
        message: grading.isCorrect ? `Correct · +${grading.pointsAwarded} points` : `${grading.scorePercent}% credit · +${grading.pointsAwarded} points`,
      };
    } catch (error) {
      setSubmitError(error?.message || 'Your answer could not be submitted.');
      return null;
    }
  };

  const currentSelf = leaderboard.find((entry) => entry.playerKey === playerKey);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '14px 17px', borderRadius: 12, background: remainingMs <= 10000 ? '#fce8e6' : '#e8f0fe', color: remainingMs <= 10000 ? '#a50e0e' : '#174ea6' }}>
        <div><strong>Round {roundIndex + 1} of {room.roundCount}</strong><div style={{ marginTop: 3, fontSize: 13 }}>{question?.teksCode || 'Mixed review'} · {alias}</div></div>
        <div style={{ fontSize: 32, fontWeight: 1000 }}>{formatClock(remainingMs)}</div>
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
            onGrade={() => null}
          />
        </section>
      ) : (
        <FieldQuestion question={question} disabled={Boolean(result) || expired} onSubmit={submit} />
      )}

      {submitError && <div role="alert" style={{ padding: 11, borderRadius: 9, background: '#fff4ce', color: '#7a4f00' }}>{submitError}</div>}
      {expired && !result && <div aria-live="polite" style={{ padding: 15, borderRadius: 11, background: '#f1f3f4', color: '#3c4043', fontWeight: 900 }}>Time is up. Wait for your teacher to start the next round.</div>}
      {result && (
        <section aria-live="polite" style={{ padding: 16, borderRadius: 12, background: result.isCorrect ? '#e6f4ea' : '#fff4ce', color: result.isCorrect ? '#137333' : '#7a4f00', textAlign: 'left' }}>
          <div style={{ fontSize: 22, fontWeight: 1000 }}>{result.isCorrect ? 'Correct!' : `${result.scorePercent}% credit`}</div>
          <div style={{ marginTop: 5, fontWeight: 800 }}>+{result.pointsAwarded} points · Total {result.totalScore.toLocaleString()}{result.rank ? ` · Rank #${result.rank}` : ''}</div>
          {(result.speedBonus > 0 || result.streakBonus > 0) && <div style={{ marginTop: 4, fontSize: 13 }}>Accuracy base {result.basePoints} · Speed +{result.speedBonus} · Streak +{result.streakBonus}</div>}
        </section>
      )}

      <section style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #d8dde6', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}><strong>Top 5</strong>{currentSelf && <span style={{ color: '#5f6368', fontSize: 13 }}>You: #{currentSelf.rank} · {currentSelf.score.toLocaleString()}</span>}</div>
        <MiniLeaderboard rows={leaderboard} playerKey={playerKey} />
      </section>
    </div>
  );
}

export default function LiveChallengeStudent({ invite, studentProfile = {}, onExit }) {
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

  const leaderboard = useMemo(() => publicLeaderboard(players), [players]);

  // Opening the challenge is the student's join action. No code to type and no
  // second account identity to reconcile with the class roster.
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
    return <div style={{ padding: 40, textAlign: 'center' }}><h2>No Live Challenge is waiting.</h2><button type="button" onClick={onExit}>Back to Dashboard</button></div>;
  }

  if (!room) {
    return <div style={{ minHeight: '100vh', padding: 40, background: '#f0f2f5', textAlign: 'center' }}><h2>Opening {invite.title || 'Live Challenge'}…</h2>{error && <p style={{ color: '#a50e0e' }}>{error}</p>}</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '20px 14px 50px', fontFamily: '"Segoe UI", sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ textAlign: 'left' }}><div style={{ color: '#174ea6', fontSize: 12, fontWeight: 1000, textTransform: 'uppercase' }}>MathMaster Live Challenge</div><h1 style={{ margin: '4px 0 0', fontSize: 25 }}>{room.title}</h1></div>
          <button type="button" onClick={onExit} style={{ padding: '9px 14px', border: '1px solid #b7bec8', borderRadius: 8, background: '#fff', fontWeight: 900 }}>Back to Dashboard</button>
        </header>
        {error && <div role="alert" style={{ marginBottom: 14, padding: 11, borderRadius: 9, background: '#fff4ce', color: '#7a4f00' }}>{error}</div>}

        {room.status === 'lobby' && (
          <section style={{ padding: 30, borderRadius: 16, background: '#e8f0fe', border: '2px solid #aecbfa', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#174ea6', textTransform: 'uppercase' }}>You are in the lobby as</div>
            <div style={{ marginTop: 8, fontSize: 32, fontWeight: 1000 }}>{invite.alias || 'Player'}</div>
            <div style={{ marginTop: 14, fontSize: 18 }}>{joining ? 'Joining…' : `${leaderboard.length} students joined`}</div>
            <p style={{ marginBottom: 0, color: '#5f6368' }}>Keep this screen open. Your teacher will start Round 1.</p>
          </section>
        )}

        {room.status === 'running' && room.currentQuestion && (
          <ChallengeRound key={`${room.roomId}-${room.currentRound}`} room={room} alias={invite.alias} playerKey={invite.playerKey} leaderboard={leaderboard} studentProfile={studentProfile} />
        )}

        {room.status === 'finished' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <section style={{ padding: 24, borderRadius: 15, background: '#e6f4ea', border: '2px solid #9bd2aa', textAlign: 'center' }}><div style={{ color: '#137333', fontWeight: 1000, textTransform: 'uppercase' }}>Challenge complete</div><h2 style={{ margin: '6px 0' }}>Final Standings</h2><p style={{ margin: 0, color: '#5f6368' }}>Your game score is practice feedback; it does not change your assignment grade.</p></section>
            <section style={{ padding: 18, borderRadius: 14, background: '#fff', border: '1px solid #d8dde6' }}><MiniLeaderboard rows={leaderboard} playerKey={invite.playerKey} /></section>
          </div>
        )}

        {room.status === 'cancelled' && <section style={{ padding: 24, borderRadius: 14, background: '#fff', border: '1px solid #d8dde6', textAlign: 'center' }}><h2>This challenge was cancelled.</h2><button type="button" onClick={onExit}>Back to Dashboard</button></section>}
      </div>
    </div>
  );
}
