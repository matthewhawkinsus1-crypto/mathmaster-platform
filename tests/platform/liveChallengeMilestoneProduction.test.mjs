import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyProductiveMilestoneAward,
  authoritativeReceiptTotal,
  legacyMilestoneSpeedTotalForRound,
  milestoneSpeedTotalForRound,
  recordValidatedSpeedMilestone,
} from '../../functions/shared/liveChallenge.mjs';
import { accuracyFirstStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
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
  // The receipt-derived total reaches the public board: as the match score for
  // a per-response strategy, as raw round performance under a placement one.
  assert.match(block, /\? \{ rawScore: milestone\.totalScore \} : \{ score: milestone\.totalScore, rawScore: milestone\.totalScore \}/);
  assert.match(block, /transaction\.set\(publicPlayerRef, \{[\s\S]{0,120}\.\.\.scoreFields,/);
  assert.match(block, /speedInfluencePercent,\s*\}\);/, 'milestone speed honours the room setting');
  assert.doesNotMatch(block, /request\.data\?\.productiveDepth|request\.data\?\.speedPoints/);
});

test('final scoring consumes banked milestone speed without double-paying it', () => {
  const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = server.indexOf('exports.submitLiveChallengeResponse');
  const block = server.slice(start, server.indexOf('// Phase 5D', start));
  // Banked speed is handed to the strategy on the mature 100-point scale…
  assert.match(block, /bankedLegacyMilestoneSpeed: isSecondChance \? 0 : challenge\.legacyMilestoneSpeedTotalForRound\(/);
  assert.match(block, /authoritativeReceiptTotal\(submissionReceipts\)/);

  // …which pays only the remainder. Milestones plus the final answer add up
  // to one round's speed, at the room's setting, never more.
  const player = {};
  const banked = apply(player, milestone({ productiveDepth: 2, elapsedMs: 2_000 }), { speedInfluencePercent: 20 });
  const bankedLegacy = legacyMilestoneSpeedTotalForRound(banked.submissionReceipts, 2, 7);
  const paidMilestones = milestoneSpeedTotalForRound(banked.submissionReceipts, 2, 7);
  assert.ok(bankedLegacy > 0);
  assert.equal(paidMilestones, Object.values(banked.submissionReceipts).reduce((sum, receipt) => sum + receipt.speedBonus, 0));
  const final = accuracyFirstStrategy.scoreResponse({
    gradeScore: 1, isCorrect: true, elapsedMs: 2_000, totalMs: 40_000,
    speedInfluencePercent: 20, bankedLegacyMilestoneSpeed: bankedLegacy,
  });
  const unbanked = accuracyFirstStrategy.scoreResponse({
    gradeScore: 1, isCorrect: true, elapsedMs: 2_000, totalMs: 40_000, speedInfluencePercent: 20,
  });
  assert.equal(final.legacySpeedBonus, unbanked.legacySpeedBonus - bankedLegacy);
  assert.ok(Math.abs((paidMilestones + final.speedBonus) - unbanked.speedBonus) <= 2, 'rounding aside, speed is paid once');
  assert.equal(accuracyFirstStrategy.scoreResponse({
    gradeScore: 1, isCorrect: true, elapsedMs: 2_000, totalMs: 40_000, secondChance: true, missedOriginally: true,
    speedInfluencePercent: 20, bankedLegacyMilestoneSpeed: 0,
  }).speedBonus, 0, 'a replay pays no speed');
});

test('milestone speed honours the room speed setting, including Off', () => {
  // The teacher's 0% "Off" setting used to leave Solver Race milestone speed
  // unscaled — speed was still paid in a room that had switched it off.
  const off = apply({}, milestone({ productiveDepth: 2 }), { speedInfluencePercent: 0 });
  assert.equal(off.accepted, true, 'the depth is still banked');
  assert.equal(off.speedPoints, 0);
  assert.equal(milestoneSpeedTotalForRound(off.submissionReceipts, 2, 7), 0);
  assert.ok(legacyMilestoneSpeedTotalForRound(off.submissionReceipts, 2, 7) > 0, 'the mature-scale amount is kept for the final subtraction');
  const standard = apply({}, milestone({ productiveDepth: 2 }), { speedInfluencePercent: 20 });
  const legacy = apply({}, milestone({ productiveDepth: 2 }));
  assert.equal(standard.speedPoints, legacy.speedPoints * 2, 'Standard 20% is twice the mature 10% scale');
});

test('challenge-only attempt policy remains isolated from ordinary assignments', () => {
  const challenge = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8');
  const ordinary = readFileSync(new URL('../../src/components/student/PathSessionPlayer.jsx', import.meta.url), 'utf8');
  assert.match(challenge, /<QuestionEngine[\s\S]*attemptsDoNotExpire/);
  assert.match(challenge, /countsAttempt:\s*false/);
  assert.match(ordinary, /maximumAttempts=\{questionInstance\.attemptsAllowed\}/);
  assert.doesNotMatch(ordinary, /attemptsDoNotExpire/);
});
