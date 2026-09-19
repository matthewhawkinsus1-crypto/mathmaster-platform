import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  complexityAdjustedRoundSeconds,
  authoritativeReceiptTotal,
  DEFAULT_ROUND_CLOSING_THRESHOLD,
  normalizeRoundClosingThreshold,
  recordValidatedSpeedMilestone,
  roundClosingDecision,
} from '../../functions/shared/liveChallenge.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('closing threshold defaults to 70 and supports every teacher option', () => {
  assert.equal(DEFAULT_ROUND_CLOSING_THRESHOLD, 70);
  assert.equal(normalizeRoundClosingThreshold(undefined), 70);
  for (const threshold of [60, 70, 80, 90, 100]) assert.equal(normalizeRoundClosingThreshold(threshold), threshold);
  assert.equal(normalizeRoundClosingThreshold('off'), null);
});

test('closing counts joined players, uses ceiling, and supports live lowering', () => {
  assert.equal(roundClosingDecision({ joinedCount: 20, answeredCount: 13, threshold: 70 }).shouldClose, false);
  assert.deepEqual(roundClosingDecision({ joinedCount: 20, answeredCount: 14, threshold: 70 }), {
    shouldClose: true, threshold: 70, thresholdCount: 14, joinedCount: 20, answeredCount: 14,
  });
  assert.equal(roundClosingDecision({ joinedCount: 20, answeredCount: 12, threshold: 80 }).shouldClose, false);
  assert.equal(roundClosingDecision({ joinedCount: 20, answeredCount: 12, threshold: 60 }).shouldClose, true);
  assert.equal(roundClosingDecision({ joinedCount: 20, answeredCount: 20, threshold: null }).shouldClose, false);
});

test('server complexity metadata adjusts a teacher baseline', () => {
  const one = complexityAdjustedRoundSeconds({ baselineSeconds: 45, question: { solutionDepth: 1 } });
  const four = complexityAdjustedRoundSeconds({ baselineSeconds: 45, question: { solutionDepth: 4 } });
  const literal = complexityAdjustedRoundSeconds({ baselineSeconds: 45, question: { solutionDepth: 2, challengeFamily: 'literalEquation' } });
  assert.ok(one < four);
  assert.ok(literal >= four);
});

test('validated milestone speed cannot be farmed by duplicates, undo, or restart', () => {
  const first = recordValidatedSpeedMilestone({ validated: true, stateHash: 'a', productiveDepth: 1, expectedDepth: 4, elapsedMs: 5_000, totalMs: 40_000 });
  assert.equal(first.accepted, true);
  assert.ok(first.speedPoints <= 25);
  for (const candidate of [
    { validated: true, stateHash: 'a', productiveDepth: 2 },
    { validated: true, stateHash: 'undo', productiveDepth: 0 },
    { validated: true, stateHash: 'restart', productiveDepth: 1 },
    { validated: false, stateHash: 'wrong', productiveDepth: 2 },
  ]) {
    assert.equal(recordValidatedSpeedMilestone({ milestones: first.milestones, expectedDepth: 4, ...candidate }).accepted, false);
  }
});

test('Live Challenge opts rich tools into a real no-expiration policy only in the challenge host', () => {
  const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
  const engine = read('../../src/QuestionEngine.jsx');
  const algebra = read('../../src/StepByStepAlgebraCore.jsx');
  const ordinary = read('../../src/components/student/PathSessionPlayer.jsx');
  assert.match(student, /<QuestionEngine[\s\S]*attemptsDoNotExpire/);
  assert.doesNotMatch(student, /maximumAttempts=\{1\}/);
  assert.match(engine, /attemptsDoNotExpire=\{attemptsDoNotExpire\}/);
  assert.match(algebra, /countsAttempt: !attemptsDoNotExpire/);
  assert.match(algebra, /Live Challenge work does not expire from intermediate moves/);
  assert.match(ordinary, /maximumAttempts=\{questionInstance\.attemptsAllowed\}/,
    'ordinary assignment attempt limits remain unchanged');
});

test('score adjustment reconciles its authoritative receipt and both stored totals', () => {
  const entry = read('../../functions/entry.js');
  assert.match(entry, /reconciledReceipt = receipt \? \{[\s\S]*pointsAwarded:[\s\S]*totalScore: nextScore/);
  assert.match(entry, /submissionReceipts: reconciledReceipts/);
  assert.match(entry, /transaction\.set\(publicRef, \{ score: nextScore/);
});

test('authoritative total is exactly the sum of accepted receipts and ignores retries', () => {
  const receipts = {
    normal: { serverConfirmed: true, pointsAwarded: 1_100 },
    partial: { serverConfirmed: true, pointsAwarded: 500 },
    streakComeback: { serverConfirmed: true, pointsAwarded: 1_250 },
    recovery: { serverConfirmed: true, pointsAwarded: 750 },
    confirmation: { serverConfirmed: true, pointsAwarded: 250 },
    timeout: { serverConfirmed: true, pointsAwarded: 400 },
    pendingRetry: { serverConfirmed: false, pointsAwarded: 1_100 },
  };
  assert.equal(authoritativeReceiptTotal(receipts), 4_250);
  assert.equal(authoritativeReceiptTotal({ ...receipts, normal: receipts.normal }), 4_250,
    'idempotent retry replaces the same receipt key instead of adding a second one');
});

test('teacher pacing changes are server-owned and closing is irreversible', () => {
  const server = read('../../functions/index.js');
  const update = server.slice(server.indexOf('exports.updateLiveChallengePacing'), server.indexOf('exports.submitLiveChallengeResponse'));
  assert.match(update, /requireOwnedChallenge/);
  assert.match(update, /roundClosingThreshold/);
  assert.match(update, /maybeCompressLiveChallengeRoundAfterThreshold/);
  const compression = server.slice(server.indexOf('async function maybeCompressLiveChallengeRoundAfterThreshold'), server.indexOf('exports.updateLiveChallengePacing'));
  assert.match(compression, /if \(latestRoom\.closingStartedAt\) return/);
  assert.match(compression, /currentEndsAtMs <= targetEndsAtMs/);
});


test('Live Challenge lobby creation has enough memory for the secure planner', () => {
  const server = read('../../functions/index.js');
  assert.match(
    server,
    /exports\.createLiveChallenge = onCall\(\{ memory: "512MiB" \}, async \(request\) => \{/,
  );
});

test('Pace Race is mutually exclusive with the visible round timer and Second Chance is opt-in', () => {
  const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
  const dryRun = read('../../src/components/liveChallenge/ChallengeDryRun.jsx');
  const server = read('../../functions/index.js');

  assert.match(teacher, /const \[secondChanceMode, setSecondChanceMode\] = useState\('off'\)/);
  assert.match(server, /secondChanceMode = request\.data\?\.secondChanceMode === "automatic" \? "automatic" : "off"/);
  assert.match(teacher, /disabled=\{timingMode === 'pace'\}/);
  assert.match(teacher, /Disabled in Pace Race/);
  assert.match(teacher, /timingMode=\{timingMode\}/);

  assert.match(dryRun, /timingMode = 'timed'/);
  assert.match(dryRun, /paceMode = \(dryRun\.timingMode \|\| timingMode\) === 'pace'/);
  assert.match(dryRun, /roundEndsAt = paceMode \? null/);
  assert.match(dryRun, /timingMode: paceMode \? 'pace' : 'timed'/);
  assert.match(server, /const timingMode = challenge\.normalizeChallengeTimingMode\(request\.data\?\.timingMode\)/);
});

