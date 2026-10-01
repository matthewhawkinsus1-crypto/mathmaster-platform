import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { challengeCanAdvance, roundCompressionMayApply } from '../../functions/shared/liveChallenge.mjs';
import { MATCH_STATE, planLifecycleCommand } from '../../functions/shared/liveChallengeLifecycle.mjs';
import { buildRoundTimer } from '../../functions/shared/liveChallengeTimer.mjs';
import { challengeClock, roundCloseDue } from '../../src/platform/liveChallenge/challengeShellModel.js';

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
  // Once: a room already closing is refused, and the one write is conditional
  // on the room as read (the answers that cross together do not all write).
  assert.match(block, /if \(!challenge\.roundCompressionMayApply\(roomAtCount, Date\.now\(\)\)\) return/);
  assert.match(block, /\{ lastUpdateTime: roomSnapshot\.updateTime \}/);
});

/*
 * ONLY AN ANSWER THAT COULD START THE CLOSING COUNTDOWN COUNTS THE CLASS. The
 * student's feedback waits on this check, and it used to run — two count
 * queries and a transaction on the room every answer in flight reads — for
 * every answer: 20 answers at once took 2.4-3.9 s with the threshold on.
 */
test('the closing check runs only when an answer could start the closing countdown', () => {
  const now = 1_700_000_000_000;
  const timed = { roundClosingThreshold: 70, timingMode: 'timed', endsAt: new Date(now + 30_000) };
  assert.equal(roundCompressionMayApply(timed, now), true);
  assert.equal(roundCompressionMayApply({ ...timed, roundClosingThreshold: null }, now), false, 'threshold off');
  assert.equal(roundCompressionMayApply({ ...timed, closingStartedAt: new Date(now - 1_000) }, now), false, 'already closing');
  assert.equal(roundCompressionMayApply({ ...timed, endsAt: new Date(now + 4_000) }, now), false, 'nothing left to shorten');
  assert.equal(roundCompressionMayApply({ roundClosingThreshold: 70, timingMode: 'pace' }, now), true, 'a Pace Race gets its first deadline');
  // A room created before thresholds were stored keeps the platform default.
  assert.equal(roundCompressionMayApply({ endsAt: new Date(now + 30_000) }, now), true);
  // The submit path asks before counting, from the room its own transaction read.
  const submit = server.slice(server.indexOf('exports.submitLiveChallengeResponse'), server.indexOf('// Phase 5D'));
  assert.match(submit, /roomAtSubmit = latestRoom;/);
  assert.match(submit, /if \(challenge\.roundCompressionMayApply\(roomAtSubmit, Date\.now\(\)\)\) \{\s*await maybeCompressLiveChallengeRoundAfterThreshold\(/);
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
  const start = server.indexOf('function applyLiveChallengeRoundOpening(');
  assert.ok(start > 0, 'the round-opening step must be locatable');
  const block = server.slice(start, server.indexOf('\n}\n', start));
  // Pace Race opens with no deadline at all…
  assert.match(block, /durationMs: timingMode === "pace" \? null : opening\.roundSeconds \* 1000/);
  assert.equal(buildRoundTimer({ nowMs: 1_000_000, durationMs: null }).endsAtMs, null);
  // …and the response must say so rather than throw on a null date.
  assert.match(block, /endsAt: endsAt \? endsAt\.toISOString\(\) : null/);
  assert.doesNotMatch(block, /endsAt: endsAt\.toISOString\(\)/);
});

test('advanceLiveChallenge has an authoritative readiness guard', () => {
  const start = server.indexOf('exports.advanceLiveChallenge = onCall');
  const end = server.indexOf('exports.finishLiveChallenge', start);
  const block = server.slice(start, end);
  // Readiness is decided inside the transaction, from the players it read.
  const transaction = block.slice(block.indexOf('db.runTransaction'));
  assert.match(transaction, /const counts = liveChallengeRoundCompletion\(engine, currentRoom, players\)/);
  assert.match(transaction, /planLifecycleCommand\(\{\s*command: lifecycle\.LIFECYCLE_COMMAND\.ADVANCE,[\s\S]{0,120}joinedCount: counts\.joinedCount,\s*completedCount: counts\.completedCount,\s*nowMs,\s*\}\)/);
  assert.match(transaction, /if \(plan\.outcome === lifecycle\.LIFECYCLE_OUTCOME\.REJECT\) throw lifecycleHttpsError\(plan\)/);
  // Only the cheap early check outside the transaction skips readiness.
  assert.equal((block.match(/force: true/g) || []).length, 1);
  assert.ok(block.indexOf('force: true') < block.indexOf('db.runTransaction'));

  // And the rule itself: everyone answered, or the deadline passed.
  const room = { status: 'running', currentRound: 2, roundVersion: 3, roundState: 'open', startsAt: 1_000, endsAt: 0 };
  const waiting = planLifecycleCommand({ command: 'advance', room, joinedCount: 20, completedCount: 12, nowMs: 50_000 });
  assert.equal(waiting.outcome, 'reject');
  assert.equal(waiting.message, 'This round is still in progress.');
  assert.equal(planLifecycleCommand({ command: 'advance', room, joinedCount: 20, completedCount: 20, nowMs: 50_000 }).outcome, 'apply');
  assert.equal(planLifecycleCommand({ command: 'advance', room: { ...room, endsAt: 40_000 }, joinedCount: 20, completedCount: 12, nowMs: 50_000 }).outcome, 'apply');
});

test('a round command that raced Finish is told the match finished, not that its state is missing', () => {
  // A finished match's effects delete its private state. A Next Round or a
  // Close press already on its way must still get "already finished" — the
  // answer the room gives — rather than a not-found error.
  const callable = (name, nextName) => {
    const start = server.indexOf(name);
    assert.ok(start > 0, `${name} must be locatable`);
    return server.slice(start, server.indexOf(nextName, start));
  };
  for (const block of [
    callable('exports.closeLiveChallengeRound = onCall', 'exports.advanceLiveChallenge'),
    callable('exports.advanceLiveChallenge = onCall', 'exports.finishLiveChallenge'),
  ]) {
    const transaction = block.slice(block.indexOf('db.runTransaction'));
    const answered = transaction.indexOf('if (plan.outcome === lifecycle.LIFECYCLE_OUTCOME.ALREADY_APPLIED) return { alreadyApplied: true, room: currentRoom };');
    const required = transaction.indexOf('if (!latestPrivate.exists) throw new HttpsError("not-found"');
    assert.ok(answered > 0 && required > answered, 'the room answers before the private state is required');
  }
  const advance = callable('exports.advanceLiveChallenge = onCall', 'exports.finishLiveChallenge');
  assert.doesNotMatch(advance.slice(0, advance.indexOf('db.runTransaction')), /private challenge state is missing/, 'the draft read is not the judge');
  // What the room answers: a finished match has already done what was asked.
  for (const command of ['advance', 'closeRound']) {
    assert.equal(planLifecycleCommand({ command, room: { status: 'finished', currentRound: 2, roundState: 'closed' }, expected: { roundIndex: 2 } }).outcome, 'alreadyApplied');
  }
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
  // An open Pace Race round has no deadline until its closing threshold sets
  // one. Read off the room's clock it is playing — elapsed time, no time left,
  // never "Time!" — and nothing closes it on a clock it does not have. Once
  // the threshold sets a deadline it counts down and locks like any round.
  const pace = { status: 'running', roundState: 'open', currentRound: 0, roundCount: 4, timingMode: 'pace', startsAt: 10_000, endsAt: null };
  const open = challengeClock(pace, 70_000);
  assert.equal(open.stage, MATCH_STATE.ROUND_ACTIVE);
  assert.equal(open.openEnded, true);
  assert.equal(open.remainingMs, null, 'no time left to show');
  assert.equal(open.elapsedMs, 60_000);
  assert.equal(roundCloseDue({ room: pace, joinedCount: 5, finishedCount: 2 }), null, 'an open Pace Race is never closed on a clock');
  const closing = { ...pace, endsAt: 75_000 };
  assert.equal(challengeClock(closing, 70_000).openEnded, false);
  assert.equal(challengeClock(closing, 70_000).remainingMs, 5_000);
  assert.equal(challengeClock(closing, 76_000).stage, MATCH_STATE.ROUND_LOCKED, 'past the threshold deadline the round is over');
  assert.equal(roundCloseDue({ room: closing, joinedCount: 5, finishedCount: 2 }).reason, 'deadline');
  // Both host screens label the clock from that reading — and the digits
  // themselves (ChallengeClockText) show elapsed time for an open round.
  const teacher = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeTeacher.jsx', import.meta.url), 'utf8');
  const projector = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeArenaProjector.jsx', import.meta.url), 'utf8');
  const parts = readFileSync(new URL('../../src/components/liveChallenge/ChallengeShellParts.jsx', import.meta.url), 'utf8');
  const status = teacher.slice(teacher.indexOf('export function ChallengeLiveStatus('), teacher.indexOf('export function ChallengeProjector('));
  assert.match(status, /const paceOpen = clock\.openEnded;/);
  assert.match(status, /paceOpen \? 'Elapsed' : 'Time left'/);
  const arenaClock = projector.slice(projector.indexOf('function ArenaClock('), projector.indexOf('const PODIUM_RANKS'));
  assert.match(arenaClock, /const paceOpen = clock\.openEnded;/);
  assert.match(arenaClock, /paceOpen \? 'Elapsed'/);
  const digits = parts.slice(parts.indexOf('export function ChallengeClockText('), parts.indexOf('export function useLowTime('));
  assert.match(digits, /clock\.openEnded \? formatChallengeClock\(clock\.elapsedMs\)/);
});
