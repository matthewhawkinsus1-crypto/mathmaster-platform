import { useCallback, useEffect, useState } from 'react';
import { ChallengeRound } from './LiveChallengeStudent.jsx';
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
 * The round below is the STUDENT's round component, not a copy of it. Only the
 * grader differs: a rehearsal is graded by a callable that writes nothing. A
 * lookalike would reassure a teacher about a screen students never see.
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

export default function ChallengeDryRun({ courseId, standardCode, roundCount, roundSeconds, onClose }) {
  const [dryRun, setDryRun] = useState(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // The clock is restarted per round rather than run from a server timestamp,
  // because there is no server round here to start one.
  const [roundStartedAt, setRoundStartedAt] = useState(() => Date.now());

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
        <button type="button" onClick={close}>Back</button>
      </section>
    );
  }

  if (!dryRun) {
    return <section style={panel}><h3 style={{ marginTop: 0 }}>Building your dry run…</h3></section>;
  }

  const round = dryRun.rounds[roundIndex];
  const isLast = roundIndex >= dryRun.rounds.length - 1;

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
          <button
            type="button"
            onClick={() => { setRoundIndex((current) => current + 1); setRoundStartedAt(Date.now()); }}
            disabled={isLast}
            style={{ ...dryRunButton, opacity: isLast ? 0.5 : 1 }}
          >
            Next round
          </button>
          <button type="button" onClick={close} style={{ ...dryRunButton, border: 0, background: '#174ea6', color: '#fff' }}>
            Done
          </button>
        </div>
      </div>
      {error && <p role="alert" style={{ color: '#a50e0e', marginBottom: 0 }}>{error}</p>}
    </section>
  );

  return (
    <ChallengeRound
      key={`${dryRun.dryRunId}-${roundIndex}-${round?.question?.questionInstanceId}`}
      room={{
        roomId: dryRun.dryRunId,
        roundCount: dryRun.rounds.length,
        currentRound: roundIndex,
        currentQuestion: round?.question || null,
        roundEndsAt: roundStartedAt + (dryRun.roundSeconds * 1000),
      }}
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
