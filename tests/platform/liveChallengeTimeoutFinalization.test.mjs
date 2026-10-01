import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUBMISSION_ARRIVAL_GRACE_MS } from '../../functions/shared/liveChallengeParity.mjs';
import { buildRoundTimer, timerAcceptsArrival, timerFromRoom } from '../../functions/shared/liveChallengeTimer.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
const engine = read('../../src/QuestionEngine.jsx');
const server = read('../../functions/index.js');

test('QuestionEngine publishes the same canonical raw payload used by secure manual Submit', () => {
  const start = engine.indexOf('// Secure callers sometimes need');
  const end = engine.indexOf('const handleMissingToolAction', start);
  const secureSubmissionRegion = engine.slice(start, end);
  // What the host is handed is exactly what the canonical builder produced
  // (published through a ref, and only when it changes, so the host's inline
  // callback cannot loop the engine — tests/browser/renderStability.mjs).
  assert.match(secureSubmissionRegion, /const rawWork = buildRawPathResponse\(\{[\s\S]*?onResponseStateChangeRef\.current\?\.\(rawWork\)/);
  assert.match(secureSubmissionRegion, /submitToServer\(\s*buildRawPathResponse\(\{/);
  assert.doesNotMatch(secureSubmissionRegion, /querySelector|textContent|innerText/);
});

test('deadline finalization shares the manual secure submit path and has a synchronous race lock', () => {
  const submitStart = student.indexOf('const submit = async');
  const retryStart = student.indexOf('const retryPending', submitStart);
  const region = student.slice(submitStart, retryStart);
  assert.match(region, /submissionLockRef\.current = true/);
  assert.match(region, /submit\(\{ raw: rawWork \}, \{ atRoundEnd: true \}\)/);
  assert.match(region, /if \(!hasMeaningfulRawPathResponse\(rawWork\)\) return;/);
  assert.doesNotMatch(region, /hasValidatedProgress|stepGrade\?\.isCorrect/,
    'the secure server, not a locally recognized route, decides partial credit');
  assert.match(student, /serverGrading=\{\{[\s\S]*submit: async \(rawWork\) => submit\(\{ raw: rawWork \}\)/);
  assert.doesNotMatch(region, /workingPoints|provisionalPoints/,
    'display-only progress must not enter the authoritative envelope');
});

test('auto-finalized work gets deadline timing while retaining the bounded arrival policy', () => {
  const submitStart = server.indexOf('exports.submitLiveChallengeResponse');
  const submit = server.slice(submitStart, server.indexOf('// Phase 5D', submitStart));
  assert.match(submit, /const activeRoundMs = challenge\.normalizeRoundSeconds\([\s\S]*activeRoundSeconds/);
  assert.match(submit, /autoFinalizedAtRoundEnd === true[\s\S]*\? activeRoundMs/);
  // Arrival is judged inside the transaction by the room's own timer…
  assert.match(submit, /const latestTimer = roundTimer\.timerFromRoom\(latestRoom\);/);
  assert.match(submit, /const arrival = roundTimer\.timerAcceptsArrival\(latestTimer, requestArrivedAt\);\s*if \(!arrival\.accepted\) throw/);
  // …which keeps the parity module's bounded transport grace, and no more.
  const timer = buildRoundTimer({ nowMs: 100_000, syncLeadMs: 0, durationMs: 30_000 });
  assert.equal(timerAcceptsArrival(timer, 130_000 + SUBMISSION_ARRIVAL_GRACE_MS).accepted, true);
  assert.equal(timerAcceptsArrival(timer, 130_000 + SUBMISSION_ARRIVAL_GRACE_MS + 1).accepted, false);
  // Only a Pace Race round is open-ended. A timed round that lost its deadline
  // is a broken timeline and must not accept answers indefinitely.
  assert.equal(timerAcceptsArrival(timerFromRoom({ startsAt: 100_000, timingMode: 'pace' }), 900_000).accepted, true);
  assert.equal(timerAcceptsArrival(timerFromRoom({ startsAt: 100_000, timingMode: 'timed' }), 900_000).accepted, false);
  // The server's grade, never a display-only working score, is what is scored.
  assert.match(submit, /finalScore = strategy\.scoreResponse\(\{\s*gradeScore: grading\?\.score/);
  assert.doesNotMatch(submit, /gradeScore:\s*(?:request\.data\.)?(?:workingPoints|provisionalPoints)/);
});
