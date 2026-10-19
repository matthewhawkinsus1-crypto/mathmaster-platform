import { useEffect, useMemo, useState } from 'react';
import LineGraphRound from './LineGraphRound.jsx';
import { applyLineGraphAttempts, lineRoundState } from '../../../functions/shared/lineGraphAttempts.mjs';
import { LINE_GRAPH_FORMAT, lineGraphModeOfFormat } from '../../../functions/shared/lineGraphRules.mjs';
import { correctCountStrategy } from '../../../functions/shared/liveChallengeScoring.mjs';
import { previewLineGraph } from '../../platform/liveChallenge/liveChallengeService.js';
import { lineSetupConfig } from '../../platform/liveChallenge/lineGraphSetupModel.js';
import { studentErrorSentence } from '../../platform/student/studentErrorWords.js';

/*
 * "TRY IT YOURSELF FIRST" FOR GRAPH THE LINE.
 *
 * The server generates sample items for the teacher's settings (a fresh seed
 * each time, nothing stored); the teacher plays them on the student's own
 * screen. Answers are checked on this device by the server's own attempt
 * pipeline (lineGraphAttempts.mjs) — the same verdicts, tries and shown
 * answers a class gets — and nothing is sent or recorded.
 *
 * A Classic game is one line a round; its practice is its first six lines in
 * a row, so a teacher sees the whole mix without waiting between rounds.
 */

const START_DELAY_MS = 2_000;
const CLASSIC_PRACTICE_ITEMS = 6;
const RUSH_PRACTICE_ITEMS = 18;

const practicePlan = (setup) => {
  if (setup.format === LINE_GRAPH_FORMAT.SPRINT) return { items: setup.sprintLength, seconds: setup.roundSeconds };
  if (setup.format === LINE_GRAPH_FORMAT.RUSH) return { items: RUSH_PRACTICE_ITEMS, seconds: setup.roundSeconds };
  return { items: CLASSIC_PRACTICE_ITEMS, seconds: Math.min(300, setup.roundSeconds * CLASSIC_PRACTICE_ITEMS) };
};

export const linePracticeServices = ({ questions, config, startsAtMs, roundSeconds }) => {
  let player = {};
  const poolSize = questions.length;
  const questionFor = (index) => questions[index] || null;
  return Object.freeze({
    getRound: async ({ fromIndex, count = 6 } = {}) => {
      const state = lineRoundState({ receipts: player.submissionReceipts || {}, roundIndex: 0, poolSize });
      const from = Number.isInteger(fromIndex) ? fromIndex : state.cursor;
      return { roundOpen: true, joined: true, poolSize, state, questions: questions.slice(from, from + count) };
    },
    submitAttempts: async ({ attempts }) => {
      const outcome = applyLineGraphAttempts({
        player,
        roundIndex: 0,
        roundVersion: 0,
        attempts,
        questionFor,
        config,
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

export default function LineGraphPractice({ setup, onClose }) {
  const [play, setPlay] = useState(0);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const plan = practicePlan(setup);
  const requestKey = JSON.stringify({ config: lineSetupConfig(setup), format: setup.format, count: plan.items });

  useEffect(() => {
    let alive = true;
    setPreview(null);
    setError('');
    const { config, format, count } = JSON.parse(requestKey);
    previewLineGraph({ format, lineGraph: config, count })
      .then((reply) => {
        if (!alive) return;
        // A Classic preview runs across rounds; here its lines play in a row.
        const questions = (Array.isArray(reply?.questions) ? reply.questions : []).map((question, index) => ({ ...question, questionIndex: index }));
        setPreview({ questions, config: reply?.config || config });
      })
      .catch((previewError) => {
        console.error('Practice lines could not be loaded:', previewError);
        if (alive) setError(studentErrorSentence(previewError, 'Practice lines could not be loaded.'));
      });
    return () => { alive = false; };
  }, [requestKey, play]);

  const session = useMemo(() => {
    if (!preview?.questions?.length) return null;
    const now = Date.now();
    const startsAtMs = now + START_DELAY_MS;
    // Classic practice plays as a set in a row, with Skip.
    const format = setup.format === LINE_GRAPH_FORMAT.CLASSIC ? LINE_GRAPH_FORMAT.SPRINT : setup.format;
    return {
      room: {
        roomId: `line-practice-${play}`,
        challengeMode: lineGraphModeOfFormat(format),
        lineGraph: { config: preview.config },
        currentRound: 0,
        roundVersion: 0,
        roundToken: 'practice',
        roundCount: 1,
        roundState: 'open',
        startsAt: startsAtMs,
        roundEndsAt: startsAtMs + plan.seconds * 1000,
        serverNowAtRender: now,
      },
      services: linePracticeServices({ questions: preview.questions, config: preview.config, startsAtMs, roundSeconds: plan.seconds }),
    };
  }, [preview, play, plan.seconds, setup.format]);

  if (error) {
    return (
      <div role="alert" style={{ padding: 16, borderRadius: 12, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)' }}>
        <strong>{error}</strong>
        <div style={{ marginTop: 10 }}><button type="button" onClick={onClose}>Back to setup</button></div>
      </div>
    );
  }
  if (!session) return <p aria-live="polite" style={{ color: 'var(--mm-text-muted)' }}>Generating practice lines…</p>;
  return (
    <LineGraphRound
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
