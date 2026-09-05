import { useCallback, useEffect, useState } from 'react';
import { ChallengeRound } from './LiveChallengeStudent.jsx';
import { ChallengeLiveStatus, ChallengeProjector, Leaderboard } from './LiveChallengeTeacher.jsx';
import {
  createChallengeDryRun,
  discardChallengeDryRun,
  gradeChallengeDryRunResponse,
  swapChallengeDryRunRound,
} from '../../platform/liveChallenge/liveChallengeService.js';

/*
 * PLAYING YOUR OWN CHALLENGE BEFORE A CLASS DOES.
 *
 * The point is question review, not a tour of the interface. Since the bank is
 * now drawn from end to end rather than its first page, what comes up is
 * genuinely less predictable, and nothing yet stops a mixed game opening with a
 * modelling question under a thirty-second clock. This is where a teacher finds
 * that — and swaps it — instead of twenty-four students finding it at once.
 *
 * THREE VIEWS, ALL REAL COMPONENTS. The round below is the STUDENT's round
 * component; the status panel and the projector board are the TEACHER's, the
 * same ones the live game renders. Only two things differ from a real game: the
 * grader is a callable that writes nothing, and the players on the leaderboard
 * are openly labelled samples. A lookalike would reassure a teacher about a
 * screen nobody ever sees.
 */

const dryRunButton = {
  minHeight: 44,
  padding: '9px 14px',
  borderRadius: 8,
  border: '1px solid #b7bec8',
  background: '#fff',
  fontWeight: 900,
  cursor: 'pointer',
};

const panel = {
  padding: 18,
  borderRadius: 14,
  background: '#fff',
  border: '1px solid #d8dde6',
  textAlign: 'left',
};

const VIEWS = [
  ['student', 'Student view'],
  ['teacher', 'Your control screen'],
  ['projector', 'Projector'],
];

/*
 * Openly fake, and named so nobody mistakes them for a class. They exist because
 * an empty leaderboard cannot show a teacher what the ranked board looks like
 * with a full room on it — which is most of what they are checking.
 */
const SAMPLE_PLAYERS = [
  { playerKey: 's1', alias: 'Sample · Falcon', rank: 1, correctCount: 4, score: 3820 },
  { playerKey: 's2', alias: 'Sample · Comet', rank: 2, correctCount: 4, score: 3610 },
  { playerKey: 's3', alias: 'Sample · Jade', rank: 3, correctCount: 3, score: 2940 },
  { playerKey: 's4', alias: 'Sample · Harbor', rank: 4, correctCount: 3, score: 2755 },
  { playerKey: 's5', alias: 'Sample · Willow', rank: 5, correctCount: 2, score: 1980 },
];

function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export default function ChallengeDryRun({ courseId, standardCode, roundCount, roundSeconds, title, onClose }) {
  const [dryRun, setDryRun] = useState(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState('student');
  // The clock is restarted per round rather than run from a server timestamp,
  // because there is no server round here to start one.
  const [roundStartedAt, setRoundStartedAt] = useState(() => Date.now());
  const now = useNow(true);

  useEffect(() => {
    let cancelled = false;
    setBusy('create');
    setError('');
    createChallengeDryRun({ courseId, standardCode, roundCount, roundSeconds })
      .then((result) => {
        if (cancelled) return;
        setDryRun(result);
        setRoundIndex(0);
        setRoundStartedAt(Date.now());
      })
      .catch((createError) => {
        if (!cancelled) setError(createError?.message || 'The dry run could not be started.');
      })
      .finally(() => { if (!cancelled) setBusy(''); });
    return () => { cancelled = true; };
  }, [courseId, standardCode, roundCount, roundSeconds]);

  // Leaving without discarding would leave the rehearsal's question list behind.
  const close = useCallback(() => {
    if (dryRun?.dryRunId) discardChallengeDryRun({ dryRunId: dryRun.dryRunId }).catch(() => {});
    onClose?.();
  }, [dryRun, onClose]);

  const swap = async () => {
    if (!dryRun) return;
    setBusy('swap');
    setError('');
    try {
      const result = await swapChallengeDryRunRound({ dryRunId: dryRun.dryRunId, roundIndex });
      setDryRun((current) => ({
        ...current,
        rounds: current.rounds.map((round) => (round.roundIndex === roundIndex ? result : round)),
      }));
      setRoundStartedAt(Date.now());
    } catch (swapError) {
      setError(swapError?.message || 'That round could not be swapped.');
    } finally {
      setBusy('');
    }
  };

  const submitResponse = useCallback(
    ({ responsePayload }) => gradeChallengeDryRunResponse({ dryRunId: dryRun?.dryRunId, roundIndex, responsePayload }),
    [dryRun, roundIndex],
  );

  if (error && !dryRun) {
    return (
      <section style={panel}>
        <h3 style={{ marginTop: 0 }}>Dry run</h3>
        <p role="alert" style={{ color: '#a50e0e' }}>{error}</p>
        <button type="button" onClick={close} style={dryRunButton}>Back</button>
      </section>
    );
  }

  if (!dryRun) {
    return <section style={panel}><h3 style={{ marginTop: 0 }}>Building your dry run…</h3></section>;
  }

  const round = dryRun.rounds[roundIndex];
  const isLast = roundIndex >= dryRun.rounds.length - 1;
  const roundEndsAt = roundStartedAt + (dryRun.roundSeconds * 1000);
  const remainingMs = Math.max(0, roundEndsAt - now);

  // One synthetic room, shared by all three views, so the student screen and the
  // teacher screen are demonstrably showing the same round.
  const room = {
    roomId: dryRun.dryRunId,
    title: title || 'Dry run',
    status: 'running',
    roundCount: dryRun.rounds.length,
    currentRound: roundIndex,
    currentQuestion: round?.question || null,
    roundEndsAt,
  };

  const advance = () => { setRoundIndex((current) => current + 1); setRoundStartedAt(Date.now()); };

  const controls = (
    <section style={{ ...panel, background: '#fef7e0', border: '2px solid #f9ab00' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ display: 'block', fontSize: 17 }}>Dry run — no students are in this</strong>
          <span style={{ color: '#5f4400' }}>
            Nothing here is invited, scored or recorded. Swap any round you would not want a class to see.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={swap} disabled={busy === 'swap'} style={dryRunButton}>
            {busy === 'swap' ? 'Swapping…' : 'Swap this question'}
          </button>
          {/* The clock is real, so it runs out on a teacher reading the question
              the way it runs out on a class answering it. Without this, an
              expired last round is a dead end. */}
          <button type="button" onClick={() => setRoundStartedAt(Date.now())} style={dryRunButton}>
            Restart timer
          </button>
          <button type="button" onClick={advance} disabled={isLast} style={{ ...dryRunButton, opacity: isLast ? 0.5 : 1 }}>
            Next round
          </button>
          <button type="button" onClick={close} style={{ ...dryRunButton, border: 0, background: '#174ea6', color: '#fff' }}>
            Done
          </button>
        </div>
      </div>

      <div role="group" aria-label="Dry run view" style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            style={{
              ...dryRunButton,
              background: view === id ? '#174ea6' : '#fff',
              color: view === id ? '#fff' : '#3c4043',
              border: view === id ? 0 : '1px solid #b7bec8',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <p role="alert" style={{ color: '#a50e0e', marginBottom: 0 }}>{error}</p>}
    </section>
  );

  if (view === 'projector') {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        {controls}
        <ChallengeProjector
          room={room}
          leaderboard={SAMPLE_PLAYERS}
          joinedCount={SAMPLE_PLAYERS.length}
          remainingMs={remainingMs}
          onExit={() => setView('teacher')}
        />
      </div>
    );
  }

  if (view === 'teacher') {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        {controls}
        <ChallengeLiveStatus
          room={room}
          remainingMs={remainingMs}
          answeredCount={3}
          joinedCount={SAMPLE_PLAYERS.length}
        />
        <section style={panel}>
          <h3 style={{ marginTop: 0 }}>Leaderboard</h3>
          <p style={{ margin: '0 0 10px', color: '#7a4f00', fontWeight: 700 }}>
            These five are made up, so you can see the shape of a full board. Nobody has joined a dry run.
          </p>
          <Leaderboard rows={SAMPLE_PLAYERS} />
        </section>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={advance} disabled={isLast} style={{ ...dryRunButton, border: 0, background: '#1a73e8', color: '#fff', opacity: isLast ? 0.5 : 1 }}>
            {isLast ? 'Finish & Show Final Standings' : 'Next Round'}
          </button>
          <button type="button" onClick={close} style={{ ...dryRunButton, color: '#a50e0e' }}>End Challenge Early</button>
        </div>
        <p style={{ margin: 0, color: '#5f6368', fontSize: 13 }}>
          In a real game Next Round stays locked until everyone who joined has answered or the timer
          reaches zero. Here it is always available, because there is nobody to wait for.
        </p>
      </div>
    );
  }

  return (
    <ChallengeRound
      key={`${dryRun.dryRunId}-${roundIndex}-${round?.question?.questionInstanceId}`}
      room={room}
      alias="You"
      playerKey="dry-run"
      leaderboard={[]}
      studentProfile={{}}
      submitResponse={submitResponse}
      showLeaderboard={false}
      beforeQuestion={controls}
    />
  );
}
