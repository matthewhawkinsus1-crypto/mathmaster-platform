import { useEffect, useMemo, useRef, useState } from 'react';
import QuestionEngine from '../../QuestionEngine.jsx';
import MathText from '../common/MathText.jsx';
import { publicLeaderboard, LIVE_PROVISIONAL_MAX_POINTS } from '../../../functions/shared/liveChallenge.mjs';
import { calculateStepPartialCredit, emptyQuestionRecord, recordQuestionStep } from '../../attemptPolicy.js';
import { questionFromToolPayload } from '../../platform/path/pathToolResponses.js';
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

/*
 * A BOARD THAT MOVES WHILE PEOPLE ARE STILL WORKING.
 *
 * Two things make it feel live rather than merely correct. Rows are keyed by
 * player and positioned by transform, so React reuses the same node when the
 * order changes and the row slides instead of blinking into a new place. And
 * the number counts up to its target rather than snapping, so a jump of 400
 * points reads as a surge instead of a repaint.
 *
 * Points still being earned are shown separately from points already banked,
 * because they are not the same promise: one is decided, one is in progress.
 */
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
      // Ease out, so the number decelerates into place instead of stopping dead.
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
        background: isSelf ? '#e8f0fe' : working > 0 ? '#fff7e0' : '#f8f9fa',
        border: isSelf ? '2px solid #1a73e8' : working > 0 ? '1px solid #f9ab00' : '1px solid #e1e5ea',
      }}
    >
      <strong>#{row.rank}</strong>
      <span style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.alias}
        {working > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 900, color: '#7a4f00' }}>working…</span>}
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
      {/* Through MathText, like every other prompt on the platform. Rendered
          raw, an authored `$7(x-9)=63$` reached the screen as those literal
          characters — during a timed round, where a student has thirty seconds
          and no way to ask what the dollar signs mean. Found by rendering a
          real seed-bank question in a browser; the payload tests could not see
          it because the payload was correct. */}
      <MathText as="h2" style={{ margin: '8px 0 18px', whiteSpace: 'pre-wrap', lineHeight: 1.45, fontSize: 22 }}>
        {question?.prompt}
      </MathText>
      <div style={{ display: 'grid', gap: 12 }}>
        {fields.map((field, fieldIndex) => (
          <label key={field.id} style={{ fontWeight: 800 }}>
            {/* Field labels carry math too — "Solve for $x$" is a label, not a
                prompt, and leaked the same way. */}
            <MathText as="span">{`${field.label || 'Answer'}${field.unit ? ` (${field.unit})` : ''}`}</MathText>
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

/*
 * Exported so a teacher's dry run plays the same round a student plays.
 *
 * `submitResponse` is injectable for that reason and no other: a rehearsal is
 * graded by a callable that writes nothing, while a game is graded by the one
 * that scores. Everything else — the countdown, the question renderer, the
 * result panel, the disabled states — is shared, because a rehearsal that used
 * a lookalike would reassure a teacher about something students never see.
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
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState('');
  // The solver already grades each step and already de-duplicates a step that
  // is undone and redone (attemptPolicy's stepCreditVersion 2). Holding the
  // same record shape here means the running total inherits that integrity
  // instead of re-deriving it and getting it subtly wrong.
  const [stepRecord, setStepRecord] = useState(() => emptyQuestionRecord());
  const stepRecordRef = useRef(stepRecord);
  const workingPoints = useMemo(
    () => Math.round((LIVE_PROVISIONAL_MAX_POINTS * clampPercent(calculateStepPartialCredit(stepRecord.stepGrades, stepRecord.variantIndex))) / 100),
    [stepRecord],
  );
  const secureQuestion = useMemo(
    () => questionFromToolPayload(question),
    // The round's instance id is the reset boundary for the real math tool.
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

  /*
   * PUBLISHING THE RUNNING TOTAL, ON A LEASH.
   *
   * One write per second at most, and only when the number actually changed, so
   * a student clicking quickly does not turn into a write per click. The write
   * lands on that student's own player document, so twenty-four students are
   * twenty-four documents rather than one contended one.
   *
   * Failures are swallowed on purpose. This is decoration on a leaderboard; a
   * dropped report costs a moment of staleness, and surfacing an error for it
   * mid-round would interrupt a student who is answering correctly.
   */
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
        <FieldQuestion question={question} disabled={Boolean(result) || expired} onSubmit={submit} />
      )}

      {submitError && <div role="alert" style={{ padding: 11, borderRadius: 9, background: '#fff4ce', color: '#7a4f00' }}>{submitError}</div>}
      {expired && !result && <div aria-live="polite" style={{ padding: 15, borderRadius: 11, background: '#f1f3f4', color: '#3c4043', fontWeight: 900 }}>Time is up. Wait for your teacher to start the next round.</div>}
      {result && (
        <section aria-live="polite" style={{ padding: 16, borderRadius: 12, background: result.isCorrect ? '#e6f4ea' : '#fff4ce', color: result.isCorrect ? '#137333' : '#7a4f00', textAlign: 'left' }}>
          <div style={{ fontSize: 22, fontWeight: 1000 }}>{result.isCorrect ? 'Correct!' : `${Number(result.scorePercent) || 0}% credit`}</div>
          {/* The comeback is named before the total, because the point of
              paying for it is that the student notices it happened. */}
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
          {/* Read defensively. The server always sends these, but this block
              renders mid-round under a countdown: one absent number here throws
              inside the round and the student is left on a blank screen with no
              way to answer, for this round and every one after it. A missing
              total is worth showing as 0; it is not worth losing the game over. */}
          <div style={{ marginTop: 5, fontWeight: 800 }}>+{Number(result.pointsAwarded) || 0} points · Total {(Number(result.totalScore) || 0).toLocaleString()}{result.rank ? ` · Rank #${result.rank}` : ''}</div>
          {!result.secondChance && (result.speedBonus > 0 || result.streakBonus > 0) && <div style={{ marginTop: 4, fontSize: 13 }}>Accuracy base {Number(result.basePoints) || 0} · Speed +{Number(result.speedBonus) || 0} · Streak +{Number(result.streakBonus) || 0}</div>}
        </section>
      )}

      {showLeaderboard && (
        <section style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #d8dde6', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 10 }}><strong>Top 5</strong>{currentSelf && <span style={{ color: '#5f6368', fontSize: 13 }}>You: #{currentSelf.rank} · {(currentSelf.liveScore ?? currentSelf.score).toLocaleString()}</span>}</div>
          <MiniLeaderboard rows={leaderboard} playerKey={playerKey} />
        </section>
      )}
    </div>
  );
}

// `exitLabel` exists because this component is no longer only reached from the
// dashboard. Played inside an assignment's Warm-Up, "Back to Dashboard" would
// send a student somewhere they did not come from.
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

  // Ranking on liveScore is what makes the board move while people are still
  // working. Outside a running round activeRound is null and this is exactly
  // the old banked-score board.
  const activeRound = room?.status === 'running' ? Number(room.currentRound) : null;
  const leaderboard = useMemo(() => publicLeaderboard(players, { activeRound }), [players, activeRound]);

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
    return <div style={{ padding: 40, textAlign: 'center' }}><h2>No Live Challenge is waiting.</h2><button type="button" onClick={onExit}>{exitLabel}</button></div>;
  }

  if (!room) {
    return <div style={{ minHeight: '100vh', padding: 40, background: '#f0f2f5', textAlign: 'center' }}><h2>Opening {invite.title || 'Live Challenge'}…</h2>{error && <p style={{ color: '#a50e0e' }}>{error}</p>}</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: '20px 14px 50px', fontFamily: '"Segoe UI", sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ textAlign: 'left' }}><div style={{ color: '#174ea6', fontSize: 12, fontWeight: 1000, textTransform: 'uppercase' }}>MathMaster Live Challenge</div><h1 style={{ margin: '4px 0 0', fontSize: 25 }}>{room.title}</h1></div>
          <button type="button" onClick={onExit} style={{ padding: '9px 14px', border: '1px solid #b7bec8', borderRadius: 8, background: '#fff', fontWeight: 900 }}>{exitLabel}</button>
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

        {room.status === 'cancelled' && <section style={{ padding: 24, borderRadius: 14, background: '#fff', border: '1px solid #d8dde6', textAlign: 'center' }}><h2>This challenge was cancelled.</h2><button type="button" onClick={onExit}>{exitLabel}</button></section>}
      </div>
    </div>
  );
}
