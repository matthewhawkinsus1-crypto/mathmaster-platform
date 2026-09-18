import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyProductiveMilestoneAward,
  authoritativeReceiptTotal,
  milestoneSpeedTotalForRound,
  recordValidatedSpeedMilestone,
} from '../../functions/shared/liveChallenge.mjs';
import { SOLVER_RACE_CATALOG } from '../../functions/shared/solverRace.mjs';
import { buildPrivateToolGrading, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';

const milestone = (overrides = {}) => ({
  validated: true,
  productiveDepth: 1,
  expectedDepth: 4,
  stateHash: 'server-state-a',
  elapsedMs: 5_000,
  totalMs: 40_000,
  ...overrides,
});

const apply = (player = {}, secureMilestone = milestone(), overrides = {}) => applyProductiveMilestoneAward({
  player, roundIndex: 2, roundVersion: 7, secureMilestone, ...overrides,
});

test('production Solver Race grading independently validates and derives productive depth', () => {
  const question = SOLVER_RACE_CATALOG.find((entry) => entry.id.includes('linearEquation_two_step'));
  const privateGrading = buildPrivateToolGrading(question);
  const progress = gradePathResponse({ privateGrading, raw: { finalEquation: '3*x = 15' } });
  assert.equal(progress.rejected, false);
  assert.equal(progress.isCorrect, false);
  assert.equal(progress.productiveDepth, 1);
  const wrong = gradePathResponse({ privateGrading, raw: { finalEquation: '3*x = 14' } });
  assert.equal(wrong.productiveDepth, 0);

  const deepQuestion = SOLVER_RACE_CATALOG.find((entry) => entry.id.includes('linearEquation_multi_operation'));
  const deepGrading = buildPrivateToolGrading(deepQuestion);
  assert.equal(gradePathResponse({ privateGrading: deepGrading, raw: { finalEquation: '8*x-7 = 3*x+18' } }).productiveDepth, 2);
  assert.equal(gradePathResponse({ privateGrading: deepGrading, raw: { finalEquation: '5*x-7 = 18' } }).productiveDepth, 3);
});

test('a validated depth receives fine-grained speed points and earlier beats later', () => {
  const early = recordValidatedSpeedMilestone({ milestones: [], ...milestone({ elapsedMs: 4_000 }) });
  const late = recordValidatedSpeedMilestone({ milestones: [], ...milestone({ elapsedMs: 24_000 }) });
  assert.equal(early.accepted, true);
  assert.ok(early.speedPoints > late.speedPoints);
});

test('same state, alternate hash at the same depth, undo, redo, and restart cannot farm', () => {
  const first = apply();
  assert.equal(first.accepted, true);
  const persisted = {
    submissionReceipts: first.submissionReceipts,
    challengeMilestoneProgress: first.challengeMilestoneProgress,
  };
  assert.equal(apply(persisted).speedPoints, 0, 'same request is idempotent');
  assert.equal(apply(persisted, milestone({ stateHash: 'same-depth-different-hash' })).speedPoints, 0);
  assert.equal(apply(persisted, milestone({ productiveDepth: 0, stateHash: 'restart' })).speedPoints, 0);
  assert.equal(apply(persisted, milestone({ productiveDepth: 1, stateHash: 'redo' })).speedPoints, 0);
});

test('invalid progress and Second Chance rounds earn no milestone speed', () => {
  assert.equal(apply({}, milestone({ validated: false })).speedPoints, 0);
  assert.equal(apply({}, milestone(), { secondChance: true }).speedPoints, 0);
});

test('refresh preserves rewarded depths and receipt totals include each milestone once', () => {
  const first = apply();
  const refreshedPlayer = JSON.parse(JSON.stringify({
    submissionReceipts: first.submissionReceipts,
    challengeMilestoneProgress: first.challengeMilestoneProgress,
  }));
  const second = apply(refreshedPlayer, milestone({ productiveDepth: 2, stateHash: 'server-state-b', elapsedMs: 9_000 }));
  assert.equal(second.accepted, true);
  assert.equal(authoritativeReceiptTotal(second.submissionReceipts), first.speedPoints + second.speedPoints);
  assert.equal(milestoneSpeedTotalForRound(second.submissionReceipts, 2, 7), first.speedPoints + second.speedPoints);
  assert.equal(apply({ submissionReceipts: second.submissionReceipts, challengeMilestoneProgress: second.challengeMilestoneProgress }, milestone({ productiveDepth: 2, stateHash: 'retry' })).speedPoints, 0);
});

test('a securely proven depth jump banks every newly crossed milestone slice', () => {
  const jumped = apply({}, milestone({ productiveDepth: 3 }));
  assert.equal(jumped.accepted, true);
  assert.equal(jumped.receiptIds.length, 3);
  assert.equal(Object.values(jumped.submissionReceipts).filter((receipt) => receipt.receiptKind === 'productiveSpeedMilestone').length, 3);
});

test('the production progress callable enforces round identity and writes receipt-derived scores', () => {
  const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = server.indexOf('exports.reportLiveChallengeProgress');
  const end = server.indexOf('async function maybeCompressLiveChallengeRoundAfterThreshold', start);
  const block = server.slice(start, end);
  assert.match(block, /roundVersion[\s\S]*roundToken/);
  assert.match(block, /gradePathToolResponse/);
  assert.match(block, /grading\?\.productiveDepth/);
  assert.match(block, /applyProductiveMilestoneAward/);
  assert.match(block, /submissionReceipts: milestone\.submissionReceipts/);
  assert.match(block, /transaction\.set\(publicPlayerRef,[\s\S]*score: milestone\.totalScore/);
  assert.doesNotMatch(block, /request\.data\?\.productiveDepth|request\.data\?\.speedPoints/);
});

test('final scoring consumes banked milestone speed without double-paying it', () => {
  const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = server.indexOf('exports.submitLiveChallengeResponse');
  const block = server.slice(start, server.indexOf('// Phase 5D', start));
  assert.match(block, /milestoneSpeedTotalForRound/);
  assert.match(block, /finalScore\.speedBonus - bankedMilestoneSpeed/);
  assert.match(block, /isSecondChance \? 0/);
  assert.match(block, /authoritativeReceiptTotal\(submissionReceipts\)/);
});

test('challenge-only attempt policy remains isolated from ordinary assignments', () => {
  const challenge = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8');
  const ordinary = readFileSync(new URL('../../src/components/student/PathSessionPlayer.jsx', import.meta.url), 'utf8');
  assert.match(challenge, /<QuestionEngine[\s\S]*attemptsDoNotExpire/);
  assert.match(challenge, /countsAttempt:\s*false/);
  assert.match(ordinary, /maximumAttempts=\{questionInstance\.attemptsAllowed\}/);
  assert.doesNotMatch(ordinary, /attemptsDoNotExpire/);
});
