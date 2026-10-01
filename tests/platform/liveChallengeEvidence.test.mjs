import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildChallengeEvidenceEvents,
  scoredRoundsForPlayer,
} from '../../functions/shared/liveChallengeEvidence.mjs';

const code = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

const standards = { 0: 'texas:A.3(C)', 1: 'texas:A.3(C)', 2: 'texas:A.3(C)', 3: 'texas:A.5(A)' };
const player = (overrides = {}) => ({ studentId: 's1', joined: true, answeredRounds: [], missedRounds: [], ...overrides });

/* ---------- aggregation ---------- */

test('a standard becomes one event carrying the proportion, not one event per round', () => {
  const events = buildChallengeEvidenceEvents({
    roomId: 'r1',
    players: [player({ answeredRounds: [0, 1, 2], missedRounds: [1] })],
    roundStandards: standards,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].performance.score, 2 / 3);
  assert.equal(events[0].performance.roundsAnswered, 3);
  assert.equal(events[0].performance.roundsCorrect, 2);
});

test('different standards produce separate events', () => {
  const events = buildChallengeEvidenceEvents({
    roomId: 'r1',
    players: [player({ answeredRounds: [0, 3] })],
    roundStandards: standards,
  });
  assert.deepEqual(events.map((e) => e.alignmentKeys[0]).sort(), ['texas:A.3(C)', 'texas:A.5(A)']);
});

/* ---------- what must not be counted ---------- */

test('a replayed question does not enter the record twice', () => {
  const withoutReplay = buildChallengeEvidenceEvents({
    roomId: 'r1',
    players: [player({ answeredRounds: [0, 1], missedRounds: [1] })],
    roundStandards: standards,
  });
  const withReplay = buildChallengeEvidenceEvents({
    roomId: 'r1',
    // Round 4 is a second chance at round 1, answered correctly this time.
    players: [player({ answeredRounds: [0, 1, 4], missedRounds: [1] })],
    roundStandards: { ...standards, 4: 'texas:A.3(C)' },
    secondChanceOf: { 4: 1 },
  });
  assert.deepEqual(
    withReplay[0].performance,
    withoutReplay[0].performance,
    'a replay must not change what the student is recorded as having shown',
  );
});

test('a round the student never answered contributes nothing, not a zero', () => {
  const events = buildChallengeEvidenceEvents({
    roomId: 'r1',
    players: [player({ answeredRounds: [0] })],
    roundStandards: standards,
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].performance.roundsAnswered, 1);
  assert.equal(events[0].performance.score, 1);
});

test('a student who never joined produces no evidence', () => {
  assert.equal(buildChallengeEvidenceEvents({
    roomId: 'r1',
    players: [player({ joined: false, answeredRounds: [0, 1, 2] })],
    roundStandards: standards,
  }).length, 0);
});

test('a round with no recorded standard is dropped rather than guessed at', () => {
  assert.equal(buildChallengeEvidenceEvents({
    roomId: 'r1',
    players: [player({ answeredRounds: [9] })],
    roundStandards: standards,
  }).length, 0);
});

test('a game with no room id produces nothing', () => {
  assert.equal(buildChallengeEvidenceEvents({ players: [player({ answeredRounds: [0] })], roundStandards: standards }).length, 0);
});

/* ---------- idempotency ---------- */

test('the event key is stable per student, standard and room', () => {
  const build = () => buildChallengeEvidenceEvents({
    roomId: 'r1',
    players: [player({ answeredRounds: [0, 1], missedRounds: [1] })],
    roundStandards: standards,
  })[0].eventKey;
  assert.equal(build(), build());
  assert.match(build(), /^liveChallenge_r1_texas:A\.3\(C\)$/);
});

test('a duplicated answered round cannot inflate the denominator', () => {
  const events = buildChallengeEvidenceEvents({
    roomId: 'r1',
    players: [player({ answeredRounds: [0, 0, 0] })],
    roundStandards: standards,
  });
  assert.equal(events[0].performance.roundsAnswered, 1);
});

/* ---------- the conditions are recorded, not hidden ---------- */

test('every event states the conditions it was earned under', () => {
  const [event] = buildChallengeEvidenceEvents({
    roomId: 'r1',
    players: [player({ answeredRounds: [0] })],
    roundStandards: standards,
  });
  assert.match(event.conditions, /Timed/);
  assert.equal(event.source.activityRole, 'liveChallenge');
  assert.equal(event.performance.isMathematicallyIndependent, true);
});

test('junk input never throws', () => {
  for (const bad of [undefined, {}, { players: 'no' }, { players: [null] }, { roomId: 'r', players: [{}] }]) {
    assert.doesNotThrow(() => buildChallengeEvidenceEvents(bad));
  }
  assert.doesNotThrow(() => scoredRoundsForPlayer());
});

/* ---------- the server wiring ---------- */

test('a timed round is weighted below untimed practice', () => {
  const match = code.match(/liveChallenge: ([0-9.]+) \}\[evidence\.source\?\.activityRole\]/);
  assert.ok(match, 'liveChallenge must have a role weight');
  assert.ok(Number(match[1]) < 1, 'a timed single attempt is noisier evidence than practice');
});

/*
 * Evidence used to be built from the private player records inside the finish,
 * so it had to run before those records were deleted. It is now built from the
 * durable match result, which the finishing transaction writes together with
 * the terminal room status — and the private state is deleted only after every
 * other finalization effect has settled.
 */
const between = (source, startNeedle, endNeedle) => {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `could not find ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `could not find ${endNeedle}`);
  return source.slice(start, end);
};

test('evidence is written before the private state it reads is deleted', () => {
  const writer = between(code, 'async function writeChallengeEvidenceFromResult', 'async function deliverLiveChallengeRewardsFromResult');
  assert.match(writer, /buildChallengeEvidenceEvents\(\{[\s\S]*players: result\.standings/, 'evidence reads the durable match result');
  assert.doesNotMatch(writer, /LIVE_CHALLENGE_PRIVATE|loadPrivateChallengePlayers/, 'evidence never reads private state');

  const effects = between(code, 'async function runLiveChallengeFinalizationEffects', 'async function finalizeLiveChallengeMatch');
  const effectOrder = between(code, 'const LIVE_CHALLENGE_EFFECT_ORDER', ';');
  assert.match(effectOrder, /"evidence"/);
  assert.doesNotMatch(effectOrder, /privateCleanup/, 'private cleanup is not an ordinary effect');
  const effectLoop = effects.indexOf('for (const name of LIVE_CHALLENGE_EFFECT_ORDER)');
  const cleanup = effects.indexOf('recursiveDelete(db.collection(LIVE_CHALLENGE_PRIVATE)');
  assert.ok(effectLoop > 0 && cleanup > effectLoop, 'private state is deleted after the effects that could want it');
  // …and only once every one of them has settled, or on the last attempt,
  // when the sweep gives up on whatever still fails.
  assert.match(effects, /const othersSettled = LIVE_CHALLENGE_EFFECT_ORDER\.every\(\(name\) => settled\(outcomes\[name\] \?\? recorded\[name\]\)\)/);
  assert.match(effects, /const lastAttempt = attempts >= LIVE_CHALLENGE_EFFECT_MAX_ATTEMPTS;/);
  const gate = effects.indexOf('if ((othersSettled || lastAttempt) && !settled(recorded.privateCleanup)) {');
  assert.ok(gate > effectLoop && gate < cleanup, 'private state is deleted only behind the settled gate');
  // What is still pending, and what is given up, is the results module's rule.
  assert.match(effects, /const state = results\.finalizationEffectsState\(\{ effects: merged, attempts, maxAttempts: LIVE_CHALLENGE_EFFECT_MAX_ATTEMPTS \}\);/);
  assert.match(effects, /effectsPending: state\.pending,\s*effectsAbandoned: state\.abandoned,/);
});

test('a failed evidence write cannot strand a room', () => {
  // The room is already terminal (the transaction committed) before any effect
  // runs; a failing effect is logged and left for the sweep, never thrown.
  const effects = between(code, 'async function runLiveChallengeFinalizationEffects', 'async function finalizeLiveChallengeMatch');
  assert.match(effects, /catch \(error\) \{\s*outcomes\[name\] = "failed";\s*logger\.error\("liveChallenge\.finalization\.effect\.failed"/);
  const finalize = between(code, 'async function finalizeLiveChallengeMatch', 'exports.joinLiveChallenge');
  const transaction = finalize.indexOf('db.runTransaction');
  const runner = finalize.indexOf('await runLiveChallengeFinalizationEffects(db, roomId).catch(');
  assert.ok(transaction > 0 && runner > transaction, 'effects run after the terminal transaction and never throw to the teacher');
});

test('answered rounds are recorded in the write that already happens', () => {
  const submit = code.slice(code.indexOf('exports.submitLiveChallengeResponse'));
  assert.match(submit, /answeredRounds: \[\.\.\.new Set\(\[/);
});
