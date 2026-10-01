import { useEffect, useMemo, useState } from 'react';
import GraphFeatureRushRound from './GraphFeatureRushRound.jsx';
import { applyRushAttempts, rushRoundState } from '../../../functions/shared/graphFeatureRush.mjs';
import { correctCountStrategy } from '../../../functions/shared/liveChallengeScoring.mjs';
import { previewGraphFeatureRush } from '../../platform/liveChallenge/liveChallengeService.js';

/*
 * "TRY IT YOURSELF FIRST" FOR A RUSH.
 *
 * The server generates sample graphs for the teacher's settings (a fresh seed
 * each time, nothing stored); the teacher plays them on the student's own
 * screen. Taps are graded on this device by the server's grading function —
 * the same verdicts a class gets — and nothing is sent or recorded.
 */

const PRACTICE_GRAPHS = 18;
const START_DELAY_MS = 2_000;

export const practiceServices = ({ questions, startsAtMs, roundSeconds }) => {
  let player = {};
  const poolSize = questions.length;
  const questionFor = (index) => questions[index] || null;
  return Object.freeze({
    getRound: async ({ fromIndex, count = 6 } = {}) => {
      const state = rushRoundState({ receipts: player.submissionReceipts || {}, roundIndex: 0, poolSize });
      const from = Number.isInteger(fromIndex) ? fromIndex : state.cursor;
      return { roundOpen: true, joined: true, poolSize, state, questions: questions.slice(from, from + count) };
    },
    submitAttempts: async ({ attempts }) => {
      const outcome = applyRushAttempts({
        player,
        roundIndex: 0,
        roundVersion: 0,
        attempts,
        questionFor,
        arrivedAtMs: Date.now(),
        arrivalElapsedMs: Math.max(0, Date.now() - startsAtMs),
        roundDurationMs: roundSeconds * 1000,
        strategy: correctCountStrategy,
        poolSize,
      });
      player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
      return { verdicts: outcome.verdicts, state: outcome.state };
    },
  });
};

export default function GraphFeatureRushPractice({ config, roundSeconds = 60, onClose }) {
  const [play, setPlay] = useState(0);
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');
  const configKey = JSON.stringify(config || {});

  useEffect(() => {
    let alive = true;
    setQuestions(null);
    setError('');
    previewGraphFeatureRush({ graphFeatureRush: JSON.parse(configKey), count: PRACTICE_GRAPHS })
      .then((reply) => { if (alive) setQuestions(Array.isArray(reply?.questions) ? reply.questions : []); })
      .catch((previewError) => { if (alive) setError(previewError?.message || 'Practice graphs could not be loaded.'); });
    return () => { alive = false; };
  }, [configKey, play]);

  const session = useMemo(() => {
    if (!questions?.length) return null;
    const now = Date.now();
    const startsAtMs = now + START_DELAY_MS;
    return {
      room: {
        roomId: `practice-${play}`,
        currentRound: 0,
        roundVersion: 0,
        roundToken: 'practice',
        roundCount: 1,
        roundState: 'open',
        startsAt: startsAtMs,
        roundEndsAt: startsAtMs + roundSeconds * 1000,
        serverNowAtRender: now,
      },
      services: practiceServices({ questions, startsAtMs, roundSeconds }),
    };
  }, [questions, play, roundSeconds]);

  if (error) {
    return (
      <div role="alert" style={{ padding: 16, borderRadius: 12, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)' }}>
        <strong>{error}</strong>
        <div style={{ marginTop: 10 }}><button type="button" onClick={onClose}>Back to setup</button></div>
      </div>
    );
  }
  if (!session) return <p aria-live="polite" style={{ color: 'var(--mm-text-muted)' }}>Generating practice graphs…</p>;
  return (
    <GraphFeatureRushRound
      key={session.room.roomId}
      room={session.room}
      services={session.services}
      persist={false}
      practice
      onExit={onClose}
      exitLabel="Close practice"
      onPracticeAgain={() => setPlay((value) => value + 1)}
    />
  );
}
