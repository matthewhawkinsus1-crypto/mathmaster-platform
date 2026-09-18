import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { challengeCanAdvance } from '../../functions/shared/liveChallenge.mjs';

const student = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

test('Solver Race intermediate step actions do not consume attempts', () => {
  const start = student.indexOf('onStepGrade={async');
  const end = student.indexOf('onGrade={() => null}', start);
  const block = student.slice(start, end);
  assert.match(block, /countsAttempt:\s*false/);
  assert.doesNotMatch(block, /countsAttempt,\s*\n\s*statePatch/);
});

test('meaningful solver work is finalized at timeout without requiring a locally correct step', () => {
  const start = student.indexOf('const transitionedToExpired');
  const end = student.indexOf('const retryPending', start);
  const block = student.slice(start, end);
  assert.match(block, /hasMeaningfulRawPathResponse\(rawWork\)/);
  assert.doesNotMatch(block, /hasValidatedProgress/);
  assert.match(block, /submit\(\{ raw: rawWork \}, \{ atRoundEnd: true \}\)/);
});

test('the configured joined-student threshold compresses any longer timer to five seconds', () => {
  const start = server.indexOf('async function maybeCompressLiveChallengeRoundAfterThreshold');
  const end = server.indexOf('exports.submitLiveChallengeResponse', start);
  const block = server.slice(start, end);
  assert.match(block, /count\(\)\.get\(\)/);
  assert.match(block, /roundClosingDecision\(\{ joinedCount, answeredCount, threshold: roomAtCount\.roundClosingThreshold \}\)/);
  assert.match(block, /Date\.now\(\) \+ 5000/);
  assert.match(block, /currentEndsAtMs <= targetEndsAtMs/);
  assert.match(block, /roundCompressionReason:\s*`\$\{decision\.threshold\}-percent-answered`/);
  assert.match(block, /if \(latestRoom\.closingStartedAt\) return/);
});

test('round compression is best-effort after the authoritative score write', () => {
  const start = server.indexOf('exports.submitLiveChallengeResponse');
  const end = server.indexOf('// Phase 5D', start);
  const block = server.slice(start, end);
  const duplicate = block.indexOf('if (duplicateReceipt)');
  const compression = block.indexOf('maybeCompressLiveChallengeRoundAfterThreshold');
  const response = block.indexOf('return {', compression);
  assert.ok(duplicate >= 0 && compression > duplicate && response > compression);
  assert.match(block, /liveChallenge\.roundCompression\.failed/);
});


test('Pace Race without a closing deadline does not advance just because the deadline is null', () => {
  assert.equal(challengeCanAdvance({
    joinedCount: 20,
    answeredCount: 12,
    roundEndsAtMs: 0,
    nowMs: Date.now(),
  }), false);
  assert.equal(challengeCanAdvance({
    joinedCount: 20,
    answeredCount: 20,
    roundEndsAtMs: 0,
    nowMs: Date.now(),
  }), true);
});

test('Pace Race can advance after its authoritative closing deadline expires', () => {
  const now = Date.now();
  assert.equal(challengeCanAdvance({
    joinedCount: 20,
    answeredCount: 14,
    roundEndsAtMs: now - 1,
    nowMs: now,
  }), true);
  assert.equal(challengeCanAdvance({
    joinedCount: 20,
    answeredCount: 14,
    roundEndsAtMs: now + 5000,
    nowMs: now,
  }), false);
});

test('server Pace Race open-round response safely serializes a null deadline', () => {
  const start = server.indexOf('async function openLiveChallengeRound');
  const end = server.indexOf('exports.calibrateLiveChallengeClock', start);
  const block = server.slice(start, end);
  assert.match(block, /endsAt: endsAt \? endsAt\.toISOString\(\) : null/);
  assert.doesNotMatch(block, /endsAt: endsAt\.toISOString\(\)/);
});

test('advanceLiveChallenge has an authoritative readiness guard', () => {
  const start = server.indexOf('exports.advanceLiveChallenge = onCall');
  const end = server.indexOf('exports.finishLiveChallenge', start);
  const block = server.slice(start, end);
  assert.match(block, /challenge\.challengeCanAdvance\(\{ joinedCount, answeredCount, roundEndsAtMs, nowMs: Date\.now\(\) \}\)/);
  assert.match(block, /throw new HttpsError\("failed-precondition", "This round is still in progress\."\)/);
});

test('final speed scoring uses activeRoundSeconds rather than the teacher baseline', () => {
  const start = server.indexOf('exports.submitLiveChallengeResponse');
  const end = server.indexOf('// Phase 5D', start);
  const block = server.slice(start, end);
  assert.match(block, /const activeRoundMs = challenge\.normalizeRoundSeconds\([\s\S]*latestRoom\.activeRoundSeconds \|\| latestRoom\.roundSeconds/);
  assert.match(block, /totalMs: activeRoundMs/);
  assert.doesNotMatch(block, /totalMs: challenge\.normalizeRoundSeconds\(latestRoom\.roundSeconds\) \* 1000/);
});

test('teacher and projector distinguish open Pace Race from an expired round', () => {
  const teacher = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeTeacher.jsx', import.meta.url), 'utf8');
  const projector = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeArenaProjector.jsx', import.meta.url), 'utf8');
  assert.match(teacher, /const hasRoundDeadline = roundEndsAtMs > 0/);
  assert.match(teacher, /paceOpen \? 'Elapsed' : 'Time left'/);
  assert.match(projector, /const paceOpen = room\?\.timingMode === 'pace'/);
  assert.match(projector, /const roundComplete = !paceOpen && Number\(remainingMs\) <= 0/);
  assert.match(projector, /const advanceAvailable = canAdvance/);
});
