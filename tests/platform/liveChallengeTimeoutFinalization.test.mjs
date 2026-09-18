import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
const engine = read('../../src/QuestionEngine.jsx');
const server = read('../../functions/index.js');

test('QuestionEngine publishes the same canonical raw payload used by secure manual Submit', () => {
  const start = engine.indexOf('// Secure callers sometimes need');
  const end = engine.indexOf('const handleMissingToolAction', start);
  const secureSubmissionRegion = engine.slice(start, end);
  assert.match(secureSubmissionRegion, /onResponseStateChange\(buildRawPathResponse\(\{/);
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
  const submit = server.slice(submitStart);
  assert.match(submit, /const activeRoundMs = challenge\.normalizeRoundSeconds\([\s\S]*activeRoundSeconds/);
  assert.match(submit, /autoFinalizedAtRoundEnd === true[\s\S]*\? activeRoundMs/);
  assert.match(submit, /submissionArrivalDecision\(\{ arrivedAtMs: requestArrivedAt/);
  assert.match(submit, /scoreChallengeRound\(\{[\s\S]*gradeScore: grading\?\.score/);
  assert.doesNotMatch(submit, /gradeScore:\s*(?:request\.data\.)?(?:workingPoints|provisionalPoints)/);
});
