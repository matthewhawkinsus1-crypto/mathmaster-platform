/*
 * WHAT A LIVE CHALLENGE KEEPS ON THE DEVICE, READ BACK DAMAGED.
 *
 * A student's game keeps a round's result and its locked answer while the
 * answer is on its way (LiveChallengeStudent.jsx ChallengeRound), the taps
 * and lines a rush or Graph the Line has not yet sent (their queues), the
 * student's own answers for the recap (challengeOwnAnswers.js) and the last
 * round the tab saw (challengeMissedRounds.js). In Chromium, the base opened a
 * round over 326 damaged copies of its result and locked answer: every one
 * that was a record, a word, a number or a list locked the round, as answered
 * ("0% credit · +0 points", "Round complete for you") or as sent and waiting
 * ("Your answer is locked in", resent and refused), and one that String or
 * Number cannot read threw. A queued tap or line holding such a value was
 * kept and sent, and the server's own reader throws on it, failing the whole
 * batch on every retry, so the round never opened.
 *
 * Here: each store's damaged values read without throwing; a damaged result
 * or locked answer never locks a round; a queued attempt is sent only as the
 * server's own reader reads it; and everything else saved is kept.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CHALLENGE_SUBMISSION_ID, readStoredChallengeResult, readStoredPendingAnswer } from '../../src/platform/liveChallenge/challengeRoundStore.js';
import { parseStoredQueue } from '../../src/platform/liveChallenge/rushSession.js';
import { parseStoredLineQueue } from '../../src/platform/liveChallenge/lineGraphSession.js';
import { recallOwnAnswers, rememberOwnAnswer, forgetOldOwnAnswers, OWN_ANSWER_FORMAT, OWN_ANSWER_STORAGE_PREFIX } from '../../src/platform/liveChallenge/challengeOwnAnswers.js';
import { readLastSeenRound, missedRoundsStorageKey, roundsClosedWhileAway } from '../../src/platform/liveChallenge/challengeMissedRounds.js';
import { getScoringStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { normalizeRushAttempt } from '../../functions/shared/graphFeatureRush.mjs';
import { normalizeLineGraphAttempt } from '../../functions/shared/lineGraphAttempts.mjs';
import { RUSH_ATTEMPT_KIND } from '../../functions/shared/graphFeatureRushRules.mjs';
import { LINE_ATTEMPT_KIND } from '../../functions/shared/lineGraphRules.mjs';
import { damagedCopies, hostileKeys, hostileValues } from './helpers/hostileDraftValues.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const allDamage = (valid) => [...damagedCopies(valid), ...hostileValues().map(([kind, value]) => [` = ${kind}`, value])];

/* ------------------------------------------------- a round's result and locked answer */

// What the server returns for an answer, and for one it already holds (its
// receipt) (functions/index.js submitLiveChallengeResponse).
const RESULT = {
  isCorrect: true, scorePercent: 100, pointsAwarded: 940, basePoints: 700, speedBonus: 240, speedTier: 'fast', streakBonus: 0,
  comebackBonus: 0, recoveryPoints: 0, secondChance: false, totalScore: 1880, rawScore: 1880, scoringStrategyId: null,
  streak: 2, rank: null, submissionId: '9b2f3c1e-1d2a-4f5b-9c8d-7e6f5a4b3c2d', serverConfirmed: true, duplicate: false,
};
const RECEIPT = {
  receiptKind: 'response', questionIndex: 0, sequence: 3, arrivedAtMs: 1763400000000, elapsedMs: 4200, isCorrect: false, scorePercent: 50,
  scoringStrategyId: 'classic', speedInfluencePercent: 30, pointsAwarded: 210, basePoints: 210, speedBonus: 0, legacySpeedBonus: 0,
  speedTier: 'steady', streakBonus: 0, comebackBonus: 0, recoveryPoints: 0, secondChance: false, totalScore: 1300, streak: 0,
  submissionId: 'a1b2c3', roundIndex: 1, roundVersion: 2, serverConfirmed: true, duplicate: true,
};
// What the device keeps while its answer is on its way (ChallengeRound submit).
const ROUND = { roomId: 'room-7', roundIndex: 1, roundVersion: 2 };
const PENDING = {
  roomId: 'room-7', roundIndex: 1, roundVersion: 2, roundToken: 'tok-1', submissionId: '9b2f3c1e-1d2a-4f5b-9c8d-7e6f5a4b3c2d',
  responsePayload: { responses: { answer: '7' } }, humanElapsedMs: 4200, connectionQuality: 'good', timingDegraded: false, autoFinalizedAtRoundEnd: false,
};

// What the round reads of a kept result as it draws it.
const drawResult = (result) => {
  getScoringStrategy(result.scoringStrategyId || null);
  for (const field of ['scorePercent', 'pointsAwarded', 'totalScore', 'basePoints', 'speedBonus', 'streakBonus']) {
    assert.equal(typeof (Number(result[field]) || 0).toLocaleString(), 'string', field);
  }
  for (const field of ['comebackBonus', 'recoveryPoints', 'speedBonus', 'streakBonus']) assert.equal(typeof (result[field] > 0), 'boolean', field);
  assert.equal(typeof result.isCorrect, 'boolean');
};

test('a result or locked answer the round wrote comes back as the very object saved', () => {
  for (const result of [RESULT, RECEIPT]) {
    const stored = JSON.parse(JSON.stringify(result));
    assert.deepEqual(readStoredChallengeResult(stored), { value: stored, issues: [] });
    assert.equal(readStoredChallengeResult(stored).value, stored);
  }
  const stored = JSON.parse(JSON.stringify(PENDING));
  assert.equal(readStoredPendingAnswer(stored, ROUND).value, stored);
  assert.deepEqual(readStoredPendingAnswer(stored, ROUND).issues, []);
  assert.ok(CHALLENGE_SUBMISSION_ID.test(PENDING.submissionId));
  // Nothing kept is nothing to read.
  assert.deepEqual(readStoredChallengeResult(null), { value: null, issues: [] });
  assert.deepEqual(readStoredPendingAnswer(null, ROUND), { value: null, issues: [] });
});

test('a damaged result never locks a round it does not describe, and never throws as the round draws it', () => {
  let cases = 0;
  let locked = 0;
  for (const valid of [RESULT, RECEIPT]) {
    for (const [damage, value] of allDamage(valid)) {
      cases += 1;
      const { value: kept } = readStoredChallengeResult(value);
      if (!kept) continue;
      locked += 1;
      assert.equal(typeof kept.isCorrect, 'boolean', damage);
      drawResult(kept);
    }
  }
  // Every hostile value as a whole is no result: the base locked the round on
  // each that is truthy.
  for (const [kind, value] of hostileValues()) assert.equal(readStoredChallengeResult(value).value, null, kind);
  assert.ok(cases > 150 && locked > 0 && locked < cases, `${locked} of ${cases}`);
});

test('a damaged locked answer is resent only when it is this round\'s, carries a submission id the server takes and a response', () => {
  let cases = 0;
  let kept = 0;
  for (const [damage, value] of allDamage(PENDING)) {
    cases += 1;
    const { value: pending } = readStoredPendingAnswer(value, ROUND);
    if (!pending) continue;
    kept += 1;
    assert.equal(pending.roomId, ROUND.roomId, damage);
    assert.equal(pending.roundIndex, ROUND.roundIndex, damage);
    assert.ok(CHALLENGE_SUBMISSION_ID.test(pending.submissionId), damage);
    assert.ok(pending.responsePayload && typeof pending.responsePayload === 'object' && !Array.isArray(pending.responsePayload), damage);
    assert.ok(pending.responsePayload.raw !== undefined || (pending.responsePayload.responses && typeof pending.responsePayload.responses === 'object'), damage);
    // What the server reads of it (submitLiveChallengeResponse): numbers and words.
    assert.equal(typeof String(pending.roomId), 'string');
    assert.ok(pending.roundVersion === undefined || pending.roundVersion === ROUND.roundVersion, damage);
    for (const field of ['humanElapsedMs']) assert.ok(pending[field] === undefined || Number.isFinite(pending[field]), damage);
    for (const field of ['roundToken', 'connectionQuality']) assert.ok(pending[field] === undefined || typeof pending[field] === 'string', damage);
  }
  for (const [kind, value] of hostileValues()) assert.equal(readStoredPendingAnswer(value, ROUND).value, null, kind);
  // Another round's or room's answer is never sent for this one.
  assert.equal(readStoredPendingAnswer({ ...PENDING, roundIndex: 2 }, ROUND).value, null);
  assert.equal(readStoredPendingAnswer({ ...PENDING, roomId: 'room-8' }, ROUND).value, null);
  assert.equal(readStoredPendingAnswer({ ...PENDING, submissionId: 'milestone:2:1' }, ROUND).value, null);
  // An engine question's locked work is kept as sent; a payload that is no response is not.
  const engine = { ...PENDING, responsePayload: { raw: { equation: { left: 'x', right: '7' } } } };
  assert.equal(readStoredPendingAnswer(engine, ROUND).value, engine);
  assert.equal(readStoredPendingAnswer({ ...PENDING, responsePayload: {} }, ROUND).value, null);
  assert.ok(cases > 100 && kept > 0 && kept < cases, `${kept} of ${cases}`);
});

test('the round reads its kept result and locked answer only through their checks', () => {
  const source = executableSource(readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8'));
  const round = region(source, 'export function ChallengeRound({', '\nfunction StudentRoundResults(', 'challenge round');
  assert.match(round, /useState\(\(\) => readStoredResult\(resultKey\)\)/);
  assert.match(round, /useState\(\(\) => readStoredPending\(pendingKey, \{ roomId: room\.roomId, roundIndex, roundVersion: room\.roundVersion \}\)\)/);
  assert.match(round, /const stored = readStoredResult\(resultKey\);/);
  assert.doesNotMatch(round, /readStoredJson\(/);
  const results = region(source, 'const readStoredResult = (key) => {', '\n};', 'result read');
  assert.match(results, /readStoredChallengeResult\(readStoredJson\(key\)\)/);
  const pending = region(source, 'const readStoredPending = (key, round) => {', '\n};', 'locked answer read');
  assert.match(pending, /readStoredPendingAnswer\(readStoredJson\(key\), round\)/);
});

/* -------------------------------------------------------------- the queues */

const RUSH_ATTEMPTS = [
  { attemptId: 'f4d1c2b3-0a9e-4c7d-8b6a-5e4f3d2c1b0a', questionIndex: 0, kind: RUSH_ATTEMPT_KIND.TAP, x: 2, y: -3.5, tolerance: { x: 0.4, y: 0.4 }, pointer: 'touch', clientElapsedMs: 1830 },
  { attemptId: 'b2', questionIndex: 1, kind: RUSH_ATTEMPT_KIND.DOES_NOT_EXIST, clientElapsedMs: 2900 },
  { attemptId: 'c3', questionIndex: 2, kind: RUSH_ATTEMPT_KIND.SKIP, clientElapsedMs: 4100 },
  { attemptId: 'd4', questionIndex: 3, kind: RUSH_ATTEMPT_KIND.CHECK, drawing: { points: [{ value: -4, closed: false }], left: false, right: true }, clientElapsedMs: 5200 },
  { attemptId: 'e5', questionIndex: 4, kind: RUSH_ATTEMPT_KIND.OFF_SCREEN, clientElapsedMs: 6000 },
];
const LINE_ATTEMPTS = [
  { attemptId: 'a1', questionIndex: 0, kind: LINE_ATTEMPT_KIND.LINE, points: [{ x: 0, y: 1 }, { x: 2, y: 5 }], clientElapsedMs: 3100 },
  { attemptId: 'b2', questionIndex: 1, kind: LINE_ATTEMPT_KIND.CHOICE, choice: 'c', clientElapsedMs: 4200 },
  { attemptId: 'c3', questionIndex: 2, kind: LINE_ATTEMPT_KIND.EQUATION, fields: { m: '2', b: '-1' }, clientElapsedMs: 5300 },
  { attemptId: 'd4', questionIndex: 3, kind: LINE_ATTEMPT_KIND.SKIP, clientElapsedMs: 6400 },
];

const queueCases = (attempts, parse, serverReads, label) => {
  // Every attempt the device writes is one the server reads.
  attempts.forEach((attempt) => assert.ok(serverReads(attempt), `${label} ${attempt.kind}`));
  const stored = JSON.parse(JSON.stringify(attempts));
  const parsed = parse(JSON.stringify(stored));
  assert.deepEqual(parsed, stored, `${label}: a valid queue is resent as stored`);
  let cases = 0;
  for (const [index, valid] of attempts.entries()) {
    for (const [damage, value] of allDamage(valid)) {
      cases += 1;
      const queue = attempts.map((attempt, at) => (at === index ? value : attempt));
      let kept;
      assert.doesNotThrow(() => { kept = parse(JSON.stringify(queue)); }, `${label} ${valid.kind}${damage}`);
      // Every attempt sent is one the server's own reader reads without throwing.
      kept.forEach((attempt) => assert.doesNotThrow(() => serverReads(attempt), `${label} ${valid.kind}${damage}: ${JSON.stringify(attempt).slice(0, 120)}`));
      // The other attempts go as they were queued.
      attempts.forEach((attempt, at) => {
        if (at !== index) assert.ok(kept.some((entry) => JSON.stringify(entry) === JSON.stringify(attempt)), `${label} ${valid.kind}${damage}: attempt ${at} kept`);
      });
    }
  }
  for (const [kind, value] of hostileValues()) assert.deepEqual(parse(JSON.stringify(value)), [], `${label}: whole queue ${kind}`);
  assert.deepEqual(parse('[{"attemptId":"a"'), [], `${label}: truncated`);
  return cases;
};

test('a queued tap, press, skip or check is sent only as the server reads it, and a damaged one never holds back the others', () => {
  const cases = queueCases(RUSH_ATTEMPTS, parseStoredQueue, normalizeRushAttempt, 'rush');
  assert.ok(cases > 150, `${cases}`);
  // The case that held a round closed: a tap whose point is a record the
  // server's Number cannot read.
  const unprintable = hostileKeys();
  assert.throws(() => normalizeRushAttempt({ ...RUSH_ATTEMPTS[0], x: unprintable }));
  assert.deepEqual(parseStoredQueue(JSON.stringify([{ ...RUSH_ATTEMPTS[0], x: unprintable }, RUSH_ATTEMPTS[1]])), [RUSH_ATTEMPTS[1]]);
  const timed = parseStoredQueue(JSON.stringify([{ ...RUSH_ATTEMPTS[1], clientElapsedMs: unprintable }]));
  assert.deepEqual(timed, [{ attemptId: 'b2', questionIndex: 1, kind: RUSH_ATTEMPT_KIND.DOES_NOT_EXIST }]);
});

test('a queued line, choice or equation is sent only as the server reads it, and a damaged one never holds back the others', () => {
  const cases = queueCases(LINE_ATTEMPTS, parseStoredLineQueue, normalizeLineGraphAttempt, 'line');
  assert.ok(cases > 100, `${cases}`);
  const unprintable = hostileKeys();
  assert.throws(() => normalizeLineGraphAttempt({ ...LINE_ATTEMPTS[1], choice: unprintable }));
  const boxes = parseStoredLineQueue(JSON.stringify([{ ...LINE_ATTEMPTS[2], fields: { m: '2', b: unprintable } }]));
  assert.deepEqual(boxes, [{ attemptId: 'c3', questionIndex: 2, kind: LINE_ATTEMPT_KIND.EQUATION, fields: { m: '2' }, clientElapsedMs: 5300 }]);
});

/* ------------------------------------------------- the recap's answers, the last round seen */

const memoryStorage = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    has: (key) => values.has(key),
  };
};

test('the recap\'s kept answers, damaged: nothing throws, nothing is shown that the device did not write, and the other rounds are kept', () => {
  const NOW = 1_763_400_000_000;
  const rows = (value) => [{ label: '', value, format: OWN_ANSWER_FORMAT.TEXT }];
  const game = { version: 1, savedAt: NOW - 1000, rounds: { 0: rows('7'), 1: rows('x = 3') } };
  const key = `${OWN_ANSWER_STORAGE_PREFIX}/s-1/room-7`;
  let cases = 0;
  for (const [damage, value] of allDamage(game)) {
    cases += 1;
    const storage = memoryStorage({ [key]: JSON.stringify(value) });
    let recalled;
    assert.doesNotThrow(() => { recalled = recallOwnAnswers({ storage, studentId: 's-1', roomId: 'room-7' }); }, damage);
    Object.values(recalled).forEach((kept) => kept.forEach((row) => {
      assert.equal(typeof row.value, 'string', damage);
      assert.ok(Object.values(OWN_ANSWER_FORMAT).includes(row.format), damage);
    }));
    // A round damaged on its own never hides the other.
    if (damage.startsWith('.rounds.1')) assert.deepEqual(recalled[0], rows('7'), damage);
    assert.doesNotThrow(() => rememberOwnAnswer({ storage, studentId: 's-1', roomId: 'room-7', roundIndex: 2, rows: rows('5'), nowMs: NOW }), damage);
    assert.doesNotThrow(() => forgetOldOwnAnswers({ storage, studentId: 's-1', nowMs: NOW }), damage);
  }
  assert.ok(cases > 50, `${cases}`);
});

test('the last round a tab saw, damaged: never a missed round the tab did not see close', () => {
  for (const [damage, value] of allDamage({ roundIndex: 2, closed: true })) {
    const storage = memoryStorage({ [missedRoundsStorageKey('room-7')]: JSON.stringify(value) });
    let seen;
    assert.doesNotThrow(() => { seen = readLastSeenRound(storage, 'room-7'); }, damage);
    if (seen === null) continue;
    assert.ok(Number.isInteger(seen.roundIndex) && seen.roundIndex >= 0, damage);
    assert.equal(typeof seen.closed, 'boolean', damage);
    assert.ok(Array.isArray(roundsClosedWhileAway({ lastSeen: seen, now: { roundIndex: 4, closed: false } })), damage);
  }
});
