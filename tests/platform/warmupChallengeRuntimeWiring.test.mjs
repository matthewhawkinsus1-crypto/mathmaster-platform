import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const gate = readFileSync(new URL('../../src/components/liveChallenge/WarmupChallengeGate.jsx', import.meta.url), 'utf8');

// Assert against code, not the comments that describe it.
const codeOf = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

const appCode = codeOf(app);
const gateCode = codeOf(gate);

test('a teacher preview is never handed into a live game', () => {
  assert.match(appCode, /const warmupChallengeDecision = preview \? null : resolveWarmupChallenge\(/);
});

test('the decision is made by the tested resolver, not re-derived in the view', () => {
  // A second implementation in a 10k-line render is exactly how the "an
  // unrelated challenge hijacked my lesson" bug would come back.
  assert.match(appCode, /resolveWarmupChallenge\(/);
  assert.doesNotMatch(appCode, /invite\?\.assignmentId\s*===/);
});

test('the join banner is no longer unconditional on a running invite', () => {
  assert.doesNotMatch(appCode, /!preview && liveChallengeInvite\?\.status === 'running' &&/);
  assert.match(appCode, /shouldShowChallengeHandoffBanner\(\{ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision \}\)/);
});

test('stepping out of the game records the room so it cannot re-trap the student', () => {
  assert.match(appCode, /onExitToAssignment=\{\(\) => setWarmupChallengePlayedRoomIds\(/);
  // And that list is what the resolver is given.
  assert.match(appCode, /playedRoomIds: warmupChallengePlayedRoomIds/);
});

test('the game only replaces the workspace when a room was actually approved', () => {
  assert.match(
    appCode,
    /warmupChallengeDecision\?\.route === WARMUP_CHALLENGE_ROUTE\.PLAY && warmupChallengeDecision\.roomId/,
  );
});

test('the gate re-points the invite at the approved room rather than trusting it', () => {
  assert.match(gateCode, /invite=\{\{ \.\.\.\(invite \|\| \{\}\), roomId: decision\.roomId \}\}/);
});

test('the gate renders nothing for every route that is not play or waiting', () => {
  assert.match(gateCode, /return null;\s*\}\s*$/);
});

test('an embedded game does not tell the student to go back to the dashboard', () => {
  assert.match(gateCode, /exitLabel="Back to Warm-Up"/);
});
