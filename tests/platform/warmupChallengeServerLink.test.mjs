import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeWarmupChallengeConfig } from '../../functions/shared/warmupChallenge.mjs';

const source = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

// Assert against code, never against the comments that describe it — a comment
// claiming a rule is not the rule.
const codeOf = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

const code = codeOf(source);

const createLiveChallengeBody = () => {
  const start = code.indexOf('exports.createLiveChallenge');
  assert.ok(start > -1, 'createLiveChallenge must exist');
  const end = code.indexOf('exports.', start + 20);
  return code.slice(start, end === -1 ? undefined : end);
};

test('a room may be linked to an assignment', () => {
  assert.match(createLiveChallengeBody(), /assignmentId/);
});

test('the link is refused unless that assignment enabled the Warm-Up challenge', () => {
  const body = createLiveChallengeBody();
  // It must consult the assignment's own config, not trust the caller.
  assert.match(body, /normalizeWarmupChallengeConfig/);
  // And it must throw on a disabled one rather than quietly dropping the link,
  // which would produce a room no Warm-Up can ever find.
  assert.match(body, /if\s*\(!warmupChallengeConfig\.enabled\)[\s\S]{0,220}throw new HttpsError/);
});

test('a missing assignment is rejected, not treated as standalone', () => {
  assert.match(
    createLiveChallengeBody(),
    /assignmentSnapshot\.exists\)\s*throw new HttpsError\("not-found"/,
  );
});

test('the assignment id reaches the student invite', () => {
  // The invite is the only challenge document a student can read before
  // joining, so the link has to be on it or the Warm-Up can never resolve.
  const inviteWrite = code.slice(
    code.indexOf('batch.set(db.collection(LIVE_CHALLENGE_INVITES).doc(player.studentId)'),
  ).slice(0, 700);
  assert.match(inviteWrite, /assignmentId/);
});

test('the room records the link as null rather than omitting it', () => {
  const roomWrite = code.slice(code.indexOf('rootBatch.set(roomRef, {')).slice(0, 700);
  assert.match(roomWrite, /assignmentId,/);
});

test('a standalone launch still works with no assignment id', () => {
  const body = createLiveChallengeBody();
  // The whole assignment branch must be conditional; an unconditional read
  // would break every standalone challenge the teacher launches today.
  assert.match(body, /if\s*\(assignmentId\)\s*\{/);
});

test('the assignment config supplies round settings when the caller omits them', () => {
  const body = createLiveChallengeBody();
  assert.match(body, /warmupChallengeConfig\?\.roundCount/);
  assert.match(body, /warmupChallengeConfig\?\.roundSeconds/);
  assert.match(body, /warmupChallengeConfig\?\.standardCode/);
});

test('an assignment cannot opt in by accident', () => {
  // The shape the server trusts: enabled must be exactly true.
  assert.equal(normalizeWarmupChallengeConfig({ warmup: { liveChallenge: {} } }).enabled, false);
  assert.equal(normalizeWarmupChallengeConfig({ warmup: { liveChallenge: { enabled: 'yes' } } }).enabled, false);
  assert.equal(normalizeWarmupChallengeConfig({ warmup: { liveChallenge: { enabled: 1 } } }).enabled, false);
  assert.equal(normalizeWarmupChallengeConfig({ warmup: { liveChallenge: { enabled: true } } }).enabled, true);
  assert.equal(normalizeWarmupChallengeConfig(null).enabled, false);
});
