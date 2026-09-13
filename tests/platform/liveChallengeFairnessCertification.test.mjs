import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreChallengeRound } from '../../functions/shared/liveChallenge.mjs';
import {
  acceptChallengeSnapshot,
  calibrateChallengeClock,
  challengePhaseAt,
  challengeSpeedTier,
  submissionArrivalDecision,
} from '../../functions/shared/liveChallengeParity.mjs';

test('multi-sample clock calibration resists a spike and classifies unstable links', () => {
  const sample = (sent, rtt, offset = 240) => ({ clientSentAt: sent, clientReceivedAt: sent + rtt, serverAt: sent + (rtt / 2) + offset });
  const stable = calibrateChallengeClock([sample(1000, 20), sample(2000, 22), sample(3000, 21), sample(4000, 900), sample(5000, 19)]);
  assert.equal(stable.offsetMs, 240);
  assert.equal(stable.rttMs, 21);
  assert.equal(stable.quality, 'synchronized');
  const unstable = calibrateChallengeClock([sample(1, 20), sample(2, 600), sample(3, 900), sample(4, 300), sample(5, 800)]);
  assert.equal(unstable.quality, 'delayed');
});

test('speed tier boundaries are broad, deterministic bands', () => {
  const total = 10_000;
  assert.equal(challengeSpeedTier(0, total).multiplier, 1);
  assert.equal(challengeSpeedTier(2_000, total).tier, 'instant');
  assert.equal(challengeSpeedTier(2_700, total).multiplier, 1);
  assert.equal(challengeSpeedTier(2_751, total).multiplier, .8);
  assert.equal(challengeSpeedTier(4_751, total).multiplier, .6);
  assert.equal(challengeSpeedTier(6_751, total).multiplier, .4);
  assert.equal(challengeSpeedTier(8_751, total).multiplier, .2);
  assert.equal(challengeSpeedTier(9_999, total).multiplier, .2);
  assert.equal(challengeSpeedTier(10_000, total).tier, 'expired');
  assert.equal(challengeSpeedTier(10_001, total).tier, 'expired');
});

test('pre-deadline captures get the same bounded delivery opportunity through 600ms', () => {
  const startsAtMs = 100_000;
  const endsAtMs = 130_000;
  for (const latency of [20, 75, 150, 300, 600]) {
    const decision = submissionArrivalDecision({ arrivedAtMs: startsAtMs + 29_700 + latency, startsAtMs, endsAtMs });
    assert.equal(decision.accepted, true, `${latency}ms`);
    assert.equal(challengeSpeedTier(decision.elapsedMs, 30_000).tier, 'deadline', `${latency}ms`);
  }
  assert.equal(submissionArrivalDecision({ arrivedAtMs: endsAtMs + 751, startsAtMs, endsAtMs }).accepted, false);
});

test('certification: transport arrival alone cannot change equal human placement', () => {
  const latencies = [20, 75, 150, 300, 600];
  const results = latencies.map((latency) => scoreChallengeRound({ gradeScore: 1, isCorrect: true,
    elapsedMs: submissionArrivalDecision({ arrivedAtMs: 1_000_000 + 12_000 + latency, startsAtMs: 1_000_000, endsAtMs: 1_045_000 }).elapsedMs,
    totalMs: 45_000 }));
  assert.equal(new Set(results.map(({ speedTier }) => speedTier)).size, 1);
  assert.equal(new Set(results.map(({ pointsAwarded }) => pointsAwarded)).size, 1);
  assert.ok(scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: 5_000, totalMs: 45_000 }).speedBonus
    > scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: 25_000, totalMs: 45_000 }).speedBonus);
  assert.ok(scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: 44_000, totalMs: 45_000 }).pointsAwarded
    > scoreChallengeRound({ gradeScore: .8, isCorrect: false, elapsedMs: 1, totalMs: 45_000, previousStreak: 5 }).pointsAwarded);
});

test('claimed elapsed and wall clock cannot improve the server-observed tier', () => {
  const timing = { arrivedAtMs: 118_000, startsAtMs: 100_000, endsAtMs: 145_000 };
  const honest = submissionArrivalDecision({ ...timing, humanElapsedMs: 18_000, clientWallAt: 118_000 });
  const manipulated = submissionArrivalDecision({ ...timing, humanElapsedMs: 1, clientWallAt: -9_999_999 });
  assert.deepEqual(manipulated, honest);
  assert.equal(challengeSpeedTier(manipulated.elapsedMs, 45_000).tier, 'fast');
});

test('authoritative lifecycle has only real phases and permits forward transitions', () => {
  assert.equal(challengePhaseAt({ status: 'lobby' }, 100), 'lobby');
  assert.equal(challengePhaseAt({ status: 'running', roundEndsAtMs: 200 }, 100), 'answering');
  assert.equal(challengePhaseAt({ status: 'running', roundEndsAtMs: 200 }, 200), 'locked');
  assert.equal(challengePhaseAt({ status: 'finished' }, 100), 'finished');
  const answering = { currentRound: 4, roundVersion: 8, roundToken: 'r5', phase: 'answering' };
  const locked = acceptChallengeSnapshot(answering, { ...answering, phase: 'locked' });
  assert.equal(locked.phase, 'locked');
  assert.equal(acceptChallengeSnapshot(locked, answering), locked);
});

test('state versions reject stale snapshots and new rounds roll identity', () => {
  const current = { currentRound: 4, roundVersion: 8, roundToken: 'r5', phase: 'answering', endsAt: 112_000 };
  assert.equal(acceptChallengeSnapshot(current, { currentRound: 3, roundVersion: 99, phase: 'answering' }), current);
  assert.equal(acceptChallengeSnapshot(current, { ...current, roundVersion: 7, phase: 'leaderboard' }), current);
  assert.equal(acceptChallengeSnapshot({ ...current, phase: 'locked' }, current).phase, 'locked');
  const caughtUp = acceptChallengeSnapshot(current, { currentRound: 5, roundVersion: 9, roundToken: 'r6', phase: 'answering', endsAt: 124_000 });
  assert.equal(caughtUp.currentRound, 5);
  assert.equal(Math.ceil((caughtUp.endsAt - 112_000) / 1000), 12);
  const stream = [current, { ...current, phase: 'locked' }, caughtUp];
  const teacher = stream.reduce(acceptChallengeSnapshot, null);
  const student = [stream[1], stream[0], stream[2]].reduce(acceptChallengeSnapshot, null);
  assert.deepEqual(student, teacher, 'teacher and delayed student converge on the same version/token');
  assert.notEqual(caughtUp.roundToken, current.roundToken);
});

test('30 clients converge through latency, jitter, disconnect, retry and simultaneous submission', () => {
  const latencies = [20, 75, 150, 300, 600];
  const receipts = new Map();
  const clients = Array.from({ length: 30 }, (_, index) => ({ id: `student-${index}`, latency: latencies[index % latencies.length], elapsed: 18_000 }));
  const submit = (client, submissionId) => {
    const key = `${client.id}:round-token-4`;
    if (receipts.has(key)) return { ...receipts.get(key), duplicate: true };
    const elapsedMs = submissionArrivalDecision({ arrivedAtMs: 500_000 + client.elapsed + client.latency, startsAtMs: 500_000, endsAtMs: 545_000 }).elapsedMs;
    const score = scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs, totalMs: 45_000 });
    const receipt = { submissionId, speedTier: score.speedTier, points: score.pointsAwarded, duplicate: false };
    receipts.set(key, receipt);
    return receipt;
  };
  const first = clients.map((client, index) => submit(client, `submission-${index}`));
  assert.equal(new Set(first.map(({ speedTier }) => speedTier)).size, 1);
  assert.equal(new Set(first.map(({ points }) => points)).size, 1);
  assert.equal(receipts.size, 30);
  assert.equal(submit(clients[7], 'retry-after-disconnect').duplicate, true);
  assert.equal(receipts.size, 30);
});

test('server and student contracts include idempotency, immediate lock, trust boundary, and private diagnostics', () => {
  const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const student = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(server, /submissionReceipts\?\.\[submissionId\]/);
  assert.match(server, /roundVersion/);
  assert.match(server, /roundToken/);
  assert.match(server, /gradePathToolResponse/);
  assert.match(student, /setPending\(capture\)[\s\S]{0,180}await submitResponse\(capture\)/);
  assert.match(student, /performance\.now\(\) - roundOriginMonoRef\.current/);
  assert.match(student, /Retry locked answer/);
  assert.match(student, /addEventListener\('online', recover\)/);
  assert.match(student, /JSON\.parse\(window\.localStorage\.getItem\(pendingKey\)/);
  assert.match(student, /const recover = \(\) => retryPending\(\)/);
  assert.match(student, /submitResponse\(pending\)/);
  assert.match(rules, /match \/diagnostics\/\{playerKey\}[\s\S]*teacher\(\)/);
  assert.doesNotMatch(rules.match(/match \/diagnostics\/\{playerKey\}[\s\S]*?\n      \}/)?.[0] || '', /role == 'student'/);
});
