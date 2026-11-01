import { useEffect, useMemo, useState } from 'react';
import GraphFeatureRushRound from './GraphFeatureRushRound.jsx';
import { applyRushAttempts, rushRoundState } from '../../../functions/shared/graphFeatureRush.mjs';
import { INEQUALITY_RUSH_MODE_ID, RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';
import { correctCountStrategy } from '../../../functions/shared/liveChallengeScoring.mjs';
import { previewGraphFeatureRush, previewInequalityRush } from '../../platform/liveChallenge/liveChallengeService.js';
import { studentErrorSentence } from '../../platform/student/studentErrorWords.js';

/*
 * "TRY IT YOURSELF FIRST" FOR A RUSH.
 *
 * The server generates sample graphs for the teacher's settings (a fresh seed
 * each time, nothing stored); the teacher plays them on the student's own
 * screen. Taps are graded on this device by the server's grading function —
 * the same verdicts a class gets — and nothing is sent or recorded.
 *
 * Inequality Graphing Rush practises the same way (`game`): sample
 * inequalities from its own preview, on the same screen.
 */

// Each game's preview call, and where its room carries its settings.
const PRACTICE_GAMES = Object.freeze({
  [RUSH_MODE_ID]: Object.freeze({ key: 'graphFeatureRush', preview: (config, count) => previewGraphFeatureRush({ graphFeatureRush: config, count }), noun: 'graphs' }),
  [INEQUALITY_RUSH_MODE_ID]: Object.freeze({ key: 'inequalityRush', preview: (config, count) => previewInequalityRush({ inequalityRush: config, count }), noun: 'inequalities' }),
});

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

export default function GraphFeatureRushPractice({ config, roundSeconds = 60, onClose, game = RUSH_MODE_ID }) {
  const [play, setPlay] = useState(0);
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState('');
  const configKey = JSON.stringify(config || {});
  const practiceGame = PRACTICE_GAMES[game] || PRACTICE_GAMES[RUSH_MODE_ID];

  useEffect(() => {
    let alive = true;
    setQuestions(null);
    setError('');
    practiceGame.preview(JSON.parse(configKey), PRACTICE_GRAPHS)
      .then((reply) => { if (alive) setQuestions(Array.isArray(reply?.questions) ? reply.questions : []); })
      .catch((previewError) => {
        console.error('Practice questions could not be loaded:', previewError);
        if (alive) setError(studentErrorSentence(previewError, 'Practice questions could not be loaded.'));
      });
    return () => { alive = false; };
  }, [configKey, play, practiceGame]);

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
        // The game and its settings, as a room carries them: the round offers
        // "Off screen" from them, and speaks of inequalities in that game,
        // exactly as in a live game.
        challengeMode: game in PRACTICE_GAMES ? game : RUSH_MODE_ID,
        [practiceGame.key]: { config: JSON.parse(configKey) },
      },
      services: practiceServices({ questions, startsAtMs, roundSeconds }),
    };
  }, [questions, play, roundSeconds, configKey, game, practiceGame]);

  if (error) {
    return (
      <div role="alert" style={{ padding: 16, borderRadius: 12, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)' }}>
        <strong>{error}</strong>
        <div style={{ marginTop: 10 }}><button type="button" onClick={onClose}>Back to setup</button></div>
      </div>
    );
  }
  if (!session) return <p aria-live="polite" style={{ color: 'var(--mm-text-muted)' }}>Generating practice {practiceGame.noun}…</p>;
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
