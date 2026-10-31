/*
 * GRAPH FEATURE RUSH: THE SERVER HOLDS EVERY PLAYER TO THEIR DEVICE'S PACE (SI08).
 *
 * The student's device holds the screen after each answer — the completion
 * flash, the skip pause, the cooldown from the second miss in a row — and a
 * person needs a moment to see a new graph. A scripted client can read a
 * graph's targets from its own response and skip all of that
 * (docs/qa/live-challenge-hardening-2026-10-01.md §9). The server now requires
 * the pauses a student's recorded attempts imply to fit in the round's elapsed
 * time on its own clock (graphFeatureRush.mjs rushRoundPace; RUSH_PACING).
 *
 * Proven here: an honest device, driven through the real device session
 * (src/platform/liveChallenge/rushSession.js) at the fastest pace it allows,
 * is never refused — and the server's model of its pace matches the device's
 * clock to the millisecond; a script that skips the completion flash, or a
 * sweeper that skips the miss cooldown, is held to that pace; and a refused
 * attempt is not recorded, costs nothing, and is taken when time allows.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUSH_AUTO_SKIP_MISSES,
  RUSH_COMPLETE_FLASH_MS,
  RUSH_PACING,
  RUSH_VERDICT,
  applyRushAttempts,
  rushRoundPace,
  rushLockoutMs,
} from '../../functions/shared/graphFeatureRush.mjs';
import { correctCountStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import {
  RUSH_INPUT,
  acknowledge,
  createRushSession,
  currentQuestion,
  inputState,
  nextBatch,
  recordDoesNotExist,
  recordSkip,
  recordTap,
  settle,
} from '../../src/platform/liveChallenge/rushSession.js';

const VIEW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, xStep: 2, yStep: 2 });
const ZEROS = Object.freeze([{ id: 'x1', x: -4, y: 0 }, { id: 'x2', x: 1, y: 0 }, { id: 'x3', x: 5, y: 0 }]);
const question = (questionIndex, targets) => ({
  questionIndex, feature: 'xIntercept', family: 'cubic', tier: 'standard', view: VIEW, targets, targetCount: Math.max(1, targets.length),
});
// One, two or three targets, and every sixth graph has none ("Does Not Exist").
const GRAPHS = Array.from({ length: 150 }, (_, index) => question(index, index % 6 === 5 ? [] : ZEROS.slice(0, 1 + (index % 3))));
const SINGLE = Array.from({ length: 150 }, (_, index) => question(index, ZEROS.slice(0, 1)));
const FAR = Object.freeze({ x: 8, y: 8 });

const submit = (player, attempts, { arrivalElapsedMs, questions = GRAPHS }) => {
  const outcome = applyRushAttempts({
    player,
    roundIndex: 0,
    roundVersion: 1,
    attempts,
    questionFor: (index) => questions[index] || null,
    arrivedAtMs: 1_000_000 + arrivalElapsedMs,
    arrivalElapsedMs,
    roundDurationMs: 600_000,
    strategy: correctCountStrategy,
    poolSize: questions.length,
  });
  return { outcome, player: { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence } };
};

// What a student does on each graph: answer it; or miss twice first; or skip
// it; or miss it eight times (the automatic skip).
const planFor = (graph) => {
  const index = graph.questionIndex;
  if (index % 11 === 4) return Array.from({ length: RUSH_AUTO_SKIP_MISSES }, () => ({ kind: 'miss' }));
  if (index % 7 === 3) return [{ kind: 'skip' }];
  const misses = index % 5 === 1 ? [{ kind: 'miss' }, { kind: 'miss' }] : [];
  const answers = graph.targets.length ? graph.targets.map((target) => ({ kind: 'tap', x: target.x, y: target.y })) : [{ kind: 'dne' }];
  return [...misses, ...answers];
};

/*
 * An honest player on a real device session. `now` is the device's clock from
 * GO, which is also the server's (no skew, no latency): every input is made at
 * the first moment the device takes it — and the first on each graph
 * `reactionMs` after the graph appears — and sent at once.
 */
const playHonestly = ({ reactionMs, untilMs }) => {
  let session = createRushSession({ roundIndex: 0, questions: GRAPHS, poolSize: GRAPHS.length });
  let player = {};
  let now = 0;
  let shownIndex = 0;
  let shownAt = 0;
  let plan = null;
  let attemptNumber = 0;
  let lastInputAt = 0;
  const verdicts = [];
  while (now < untilMs) {
    session = settle(session, now);
    if (session.cursor !== shownIndex) {
      shownIndex = session.cursor;
      shownAt = now;
      plan = null;
    }
    const input = inputState(session, now);
    if (input === RUSH_INPUT.TRANSITION) { now = session.transition.until; continue; }
    if (input === RUSH_INPUT.LOCKED) { now = session.lockedUntil; continue; }
    assert.equal(input, RUSH_INPUT.READY, `the device takes input at ${now} ms`);
    if (plan === null && now < shownAt + reactionMs) { now = shownAt + reactionMs; continue; }
    plan ||= planFor(currentQuestion(session));
    const step = plan.shift();
    assert.ok(step, `graph ${session.cursor} still takes input after its plan`);
    attemptNumber += 1;
    const common = { nowMs: now, elapsedMs: now, attemptId: `honest-${attemptNumber}` };
    const made = step.kind === 'skip' ? recordSkip(session, common)
      : step.kind === 'dne' ? recordDoesNotExist(session, common)
        : recordTap(session, { ...common, ...(step.kind === 'miss' ? FAR : step), tolerance: { x: 0.8, y: 0.8 }, pointer: 'touch' });
    assert.ok(made.attempt, `the device made attempt ${attemptNumber}`);
    session = made.session;
    lastInputAt = now;
    const batch = nextBatch(session);
    const reply = submit(player, batch, { arrivalElapsedMs: now });
    player = reply.player;
    verdicts.push(...reply.outcome.verdicts);
    session = acknowledge(session, { sent: batch, reply: { state: reply.outcome.state } }).session;
  }
  return { verdicts, player, lastInputAt, completed: completedGraphs(player) };
};
const completedGraphs = (player) => Object.values(player.submissionReceipts || {}).filter((receipt) => receipt.completesQuestion === true).length;

test('an honest device at the fastest pace it allows is never refused, and the server counts its pauses exactly', () => {
  // A student who looks at each new graph for exactly the floor, then answers
  // as fast as the device lets them: misses, cooldowns, skips, eighth-miss
  // skips and "Does Not Exist" included.
  const fastest = playHonestly({ reactionMs: RUSH_PACING.firstLookMs, untilMs: 90_000 });
  assert.equal(fastest.verdicts.filter((row) => row.verdict === RUSH_VERDICT.TOO_FAST).length, 0);
  // (An eighth-miss graph alone costs 18 s of cooldowns and the skip pause.)
  assert.ok(fastest.completed >= 20, `${fastest.completed} graphs completed`);
  assert.ok(fastest.verdicts.some((row) => row.autoSkipped), 'an eighth miss skipped a graph');
  assert.ok(fastest.verdicts.some((row) => row.verdict === RUSH_VERDICT.SKIPPED), 'a student skipped one');
  // Not one millisecond of slack used: the server's model of the device's
  // pauses is the device's own clock.
  assert.equal(rushRoundPace({ receipts: fastest.player.submissionReceipts, roundIndex: 0 }).requiredMs, fastest.lastInputAt);

  // A slower, more human student is nowhere near the line.
  const careful = playHonestly({ reactionMs: 1_500, untilMs: 90_000 });
  assert.equal(careful.verdicts.filter((row) => row.verdict === RUSH_VERDICT.TOO_FAST).length, 0);
  assert.ok(rushRoundPace({ receipts: careful.player.submissionReceipts, roundIndex: 0 }).requiredMs <= careful.lastInputAt);
});

test('a script that answers graph after graph without the completion flash is held to the device\'s pace', () => {
  // Every graph's target, twelve to a request, all arriving three seconds in.
  const script = SINGLE.slice(0, 40).map((graph) => ({
    attemptId: `bot-${graph.questionIndex}`, questionIndex: graph.questionIndex, kind: 'tap', x: -4, y: 0, tolerance: { x: 0.8, y: 0.8 }, pointer: 'touch', clientElapsedMs: 3_000,
  }));
  let player = {};
  const verdicts = [];
  for (let start = 0; start < script.length; start += 12) {
    const step = submit(player, script.slice(start, start + 12), { arrivalElapsedMs: 3_000, questions: SINGLE });
    player = step.player;
    verdicts.push(...step.outcome.verdicts);
  }
  // A graph every flash plus a look: (3,000 + slack − look) / (flash + look) + 1.
  const allowed = Math.floor((3_000 + RUSH_PACING.slackMs - RUSH_PACING.firstLookMs) / (RUSH_COMPLETE_FLASH_MS + RUSH_PACING.firstLookMs)) + 1;
  assert.equal(completedGraphs(player), allowed, `${allowed} graphs in three seconds, not 40`);
  assert.equal(verdicts.filter((row) => row.verdict === RUSH_VERDICT.HIT).length, allowed);
  assert.ok(verdicts.filter((row) => row.verdict === RUSH_VERDICT.TOO_FAST).length > 0);
  // The first refused one is the next graph in order; later ones are out of
  // order behind it, exactly as for any graph the server has not taken.
  assert.equal(verdicts[allowed].verdict, RUSH_VERDICT.TOO_FAST);
});

test('a sweeper that skips the miss cooldown is held to it', () => {
  const sweep = Array.from({ length: RUSH_AUTO_SKIP_MISSES }, (_, index) => ({
    attemptId: `sweep-${index}`, questionIndex: 0, kind: 'tap', x: -10 + index, y: 8, tolerance: { x: 0.8, y: 0.8 }, pointer: 'touch', clientElapsedMs: 1_000,
  }));
  const { outcome } = submit({}, sweep, { arrivalElapsedMs: 1_000, questions: SINGLE });
  // Look (100) + no pause after the first miss + 1 s + 2 s fit in 1 s + 5 s
  // slack; the fifth miss would need 3 s more.
  const allowed = [0, 0, rushLockoutMs(2), rushLockoutMs(3), rushLockoutMs(4)].reduce((sum, pause, index) => {
    const next = sum.total + pause + (index === 0 ? RUSH_PACING.firstLookMs : 0);
    return next <= 1_000 + RUSH_PACING.slackMs ? { total: next, count: sum.count + 1 } : sum;
  }, { total: 0, count: 0 }).count;
  assert.equal(allowed, 4);
  assert.deepEqual(outcome.verdicts.map((row) => row.verdict), [
    ...Array(allowed).fill(RUSH_VERDICT.MISS), ...Array(RUSH_AUTO_SKIP_MISSES - allowed).fill(RUSH_VERDICT.TOO_FAST),
  ]);
  assert.equal(outcome.recorded, allowed);
  assert.ok(outcome.verdicts.every((row) => row.autoSkipped !== true), 'eight misses in a second never reach the skip');
});

test('a refused attempt is not recorded, costs nothing, and is taken once the time has passed', () => {
  const taps = SINGLE.slice(0, 20).map((graph) => ({
    attemptId: `late-${graph.questionIndex}`, questionIndex: graph.questionIndex, kind: 'tap', x: -4, y: 0, tolerance: { x: 0.8, y: 0.8 }, pointer: 'touch', clientElapsedMs: 500,
  }));
  const first = submit({}, taps.slice(0, 12), { arrivalElapsedMs: 0, questions: SINGLE });
  const refused = first.outcome.verdicts.filter((row) => row.verdict === RUSH_VERDICT.TOO_FAST);
  assert.ok(refused.length > 0);
  assert.equal(Object.keys(first.outcome.receipts).length, first.outcome.recorded, 'only what was taken is on the record');
  assert.ok(refused.every((row) => !first.outcome.receipts[row.attemptId]), 'no receipt, so no credit and no penalty');
  assert.equal(first.outcome.paceRefused, refused.length);
  // Sent again a minute later (the device resynchronizes and the student taps
  // again): taken, and not mistaken for a replay.
  const again = submit(first.player, taps.slice(first.outcome.recorded, 12), { arrivalElapsedMs: 60_000, questions: SINGLE });
  assert.ok(again.outcome.verdicts.every((row) => row.verdict === RUSH_VERDICT.HIT && row.replay !== true));
});
