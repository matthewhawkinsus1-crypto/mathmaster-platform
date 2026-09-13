import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreChallengeRound } from '../../functions/shared/liveChallenge.mjs';
import {
  acceptChallengeSnapshot,
  authoritativeElapsed,
  calibrateChallengeClock,
  challengeSpeedTier,
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
  assert.equal(challengeSpeedTier(2_001, total).multiplier, .8);
  assert.equal(challengeSpeedTier(4_001, total).multiplier, .6);
  assert.equal(challengeSpeedTier(6_001, total).multiplier, .4);
  assert.equal(challengeSpeedTier(8_001, total).multiplier, .2);
  assert.equal(challengeSpeedTier(9_999, total).multiplier, .2);
  assert.equal(challengeSpeedTier(10_000, total).tier, 'expired');
  assert.equal(challengeSpeedTier(10_001, total).tier, 'expired');
});

test('authoritative elapsed compensates realistic arrival delay but rejects impossible claims', () => {
  const startsAtMs = 100_000;
  const totalMs = 45_000;
  for (const latency of [20, 75, 150, 300, 600]) {
    const elapsed = authoritativeElapsed({ humanElapsedMs: 12_000, arrivedAtMs: startsAtMs + 12_000 + latency, startsAtMs, totalMs });
    assert.equal(challengeSpeedTier(elapsed, totalMs).tier, 'fast', `${latency}ms`);
  }
  assert.equal(authoritativeElapsed({ humanElapsedMs: 1, arrivedAtMs: startsAtMs + 12_000, startsAtMs, totalMs }), 10_500);
});

test('certification: transport arrival alone cannot change equal human placement', () => {
  const latencies = [20, 75, 150, 300, 600];
  const results = latencies.map((latency) => scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: authoritativeElapsed({
    humanElapsedMs: 12_000, arrivedAtMs: 1_000_000 + 12_000 + latency, startsAtMs: 1_000_000, totalMs: 45_000,
  }), totalMs: 45_000 }));
  assert.equal(new Set(results.map(({ speedTier }) => speedTier)).size, 1);
  assert.equal(new Set(results.map(({ pointsAwarded }) => pointsAwarded)).size, 1);
  assert.ok(scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: 5_000, totalMs: 45_000 }).speedBonus
    > scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: 25_000, totalMs: 45_000 }).speedBonus);
  assert.ok(scoreChallengeRound({ gradeScore: 1, isCorrect: true, elapsedMs: 44_000, totalMs: 45_000 }).pointsAwarded
    > scoreChallengeRound({ gradeScore: .8, isCorrect: false, elapsedMs: 1, totalMs: 45_000, previousStreak: 5 }).pointsAwarded);
});

test('state versions reject stale/out-of-order snapshots and reconnect catches up', () => {
  const current = { currentRound: 4, roundVersion: 8, roundToken: 'r5', phase: 'answering', endsAt: 112_000 };
  assert.equal(acceptChallengeSnapshot(current, { currentRound: 3, roundVersion: 99, phase: 'answering' }), current);
  assert.equal(acceptChallengeSnapshot(current, { ...current, roundVersion: 7, phase: 'leaderboard' }), current);
  assert.equal(acceptChallengeSnapshot(current, { ...current, phase: 'countdown' }), current);
  const caughtUp = acceptChallengeSnapshot(current, { currentRound: 5, roundVersion: 9, roundToken: 'r6', phase: 'answering', endsAt: 124_000 });
  assert.equal(caughtUp.currentRound, 5);
  assert.equal(Math.ceil((caughtUp.endsAt - 112_000) / 1000), 12);
});

test('30 clients converge through latency, jitter, disconnect, retry and simultaneous submission', () => {
  const latencies = [20, 75, 150, 300, 600];
  const receipts = new Map();
  const clients = Array.from({ length: 30 }, (_, index) => ({ id: `student-${index}`, latency: latencies[index % latencies.length], elapsed: 18_000 }));
  const submit = (client, submissionId) => {
    const key = `${client.id}:round-token-4`;
    if (receipts.has(key)) return { ...receipts.get(key), duplicate: true };
    const elapsedMs = authoritativeElapsed({ humanElapsedMs: client.elapsed, arrivedAtMs: 500_000 + client.elapsed + client.latency, startsAtMs: 500_000, totalMs: 45_000 });
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
  assert.match(rules, /match \/diagnostics\/\{playerKey\}[\s\S]*teacher\(\)/);
  assert.doesNotMatch(rules.match(/match \/diagnostics\/\{playerKey\}[\s\S]*?\n      \}/)?.[0] || '', /role == 'student'/);
});
