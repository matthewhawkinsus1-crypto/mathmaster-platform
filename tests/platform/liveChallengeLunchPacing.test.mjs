import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
