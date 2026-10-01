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
  roundCompressionMayApply,
} from '../../functions/shared/liveChallenge.mjs';
import { STEP_ACTIONS, stepActionCountsAttempt } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { getChallengeMode } from '../../functions/shared/liveChallengeModes.mjs';
import { region } from './helpers/sourceContract.mjs';

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
  // An inefficient move's attempt honours the host's no-expiration policy:
  // the workspace reports it as INEFFICIENT_MOVE and asks the shared attempt
  // rule with the host's flag, and that rule spends nothing when attempts do
  // not expire (and one when they do).
  assert.match(algebra, /saveStep\(\{ move, action: STEP_ACTIONS\.INEFFICIENT_MOVE \}\)/);
  assert.match(algebra, /countsAttempt:\s*stepActionCountsAttempt\(action, \{ attemptsDoNotExpire \}\)/);
  assert.equal(stepActionCountsAttempt(STEP_ACTIONS.INEFFICIENT_MOVE, { attemptsDoNotExpire: true }), false);
  assert.equal(stepActionCountsAttempt(STEP_ACTIONS.INEFFICIENT_MOVE, { attemptsDoNotExpire: false }), true);
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
  // Closing is irreversible: a room already closing is refused from the room
  // as read, and the write is conditional on exactly that read — so a close
  // that started in between is never overwritten or re-shortened.
  assert.match(compression, /if \(!challenge\.roundCompressionMayApply\(roomAtCount, Date\.now\(\)\)\) return/);
  assert.match(compression, /\{ lastUpdateTime: roomSnapshot\.updateTime \}/);
  assert.match(compression, /currentEndsAtMs <= targetEndsAtMs/);
  const later = Date.now() + 60_000;
  assert.equal(roundCompressionMayApply({ roundClosingThreshold: 70, endsAt: new Date(later) }), true);
  assert.equal(roundCompressionMayApply({ roundClosingThreshold: 70, endsAt: new Date(later), closingStartedAt: new Date() }), false, 'a closing round is never compressed again');
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
  // Second Chance is opt-in on the server too: only an explicit "automatic"
  // turns it on, and only in a mode that has a second chance at all (a Graph
  // Feature Rush round has none). The room's decision is evaluated, not
  // matched, so rewording the expression passes and a default that turned it
  // on does not.
  const create = region(server, 'exports.createLiveChallenge', '\nexports.', 'createLiveChallenge');
  const secondChanceExpression = create.match(/const secondChanceMode = ([^;]+);/)?.[1];
  assert.ok(secondChanceExpression, 'createLiveChallenge must decide the room\'s secondChanceMode');
  const secondChanceFor = new Function('mode', 'request', `return ${secondChanceExpression};`);
  const classic = getChallengeMode('standard');
  const rush = getChallengeMode('graphFeatureRush');
  assert.equal(secondChanceFor(classic, { data: {} }), 'off');
  assert.equal(secondChanceFor(classic, { data: { secondChanceMode: 'on' } }), 'off');
  assert.equal(secondChanceFor(classic, { data: { secondChanceMode: 'automatic' } }), 'automatic');
  assert.equal(secondChanceFor(rush, { data: { secondChanceMode: 'automatic' } }), 'off');
  assert.match(teacher, /disabled=\{timingMode === 'pace'\}/);
  assert.match(teacher, /Disabled in Pace Race/);
  assert.match(teacher, /timingMode=\{timingMode\}/);

  assert.match(dryRun, /timingMode = 'timed'/);
  assert.match(dryRun, /paceMode = \(dryRun\.timingMode \|\| timingMode\) === 'pace'/);
  assert.match(dryRun, /roundEndsAt = paceMode \? null/);
  assert.match(dryRun, /timingMode: paceMode \? 'pace' : 'timed'/);
  assert.match(server, /const timingMode = challenge\.normalizeChallengeTimingMode\(request\.data\?\.timingMode\)/);
});

