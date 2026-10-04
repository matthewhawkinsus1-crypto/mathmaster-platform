// The launch certification (tests/integration/liveChallengeLaunch/
// liveChallengeLaunchCertification.test.mjs) runs every decision a student device makes through the same pure
// modules the student screen uses, but a few behaviours live inline in
// LiveChallengeStudent.jsx, which node cannot render. The certification's
// simulated device (tests/integration/support/liveChallengeSimStudent.mjs)
// MIRRORS those. This holds the mirror to the screen, behaviour by behaviour,
// so a change to how the screen launches fails here and says what to update —
// instead of the certification quietly certifying a screen that no longer
// exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { executableSource, region } from './helpers/sourceContract.mjs';

const screen = executableSource(await readFile(new URL('../../src/components/liveChallenge/LiveChallengeStudent.jsx', import.meta.url), 'utf8'));
const mirror = executableSource(await readFile(new URL('../integration/support/liveChallengeSimStudent.mjs', import.meta.url), 'utf8'));
const screenRoot = region(screen, 'export default function LiveChallengeStudent', null, 'the student screen');

test('both listen to the room with metadata changes, so cache and reconnect are visible', () => {
  assert.match(region(screenRoot, 'return watchLiveChallengeRoom(roomId', '}, [roomId]);'), /\{ includeMetadataChanges: true \}/);
  assert.match(region(mirror, 'watchLiveChallengeRoom(roomId', 'syncPlayersListener();'), /\{ includeMetadataChanges: true \}/);
});

test('both keep a snapshot only through acceptChallengeSnapshot, with the phase at calibrated server time', () => {
  const pattern = /challengePhaseAt\(\{\s*\.\.\.next,\s*roundEndsAtMs:[^}]*\},\s*Date\.now\(\) \+ [\w.]*(?:clockOffsetRef\.current|clock\.offsetMs)\)/;
  assert.match(screenRoot, pattern);
  assert.match(mirror, pattern);
  assert.match(screenRoot, /setRoom\(\(current\) => acceptChallengeSnapshot\(current, next \? \{ \.\.\.next, phase \} : null\)\)/);
  assert.match(mirror, /device\.room = acceptChallengeSnapshot\(device\.room, next \? \{ \.\.\.next, phase \} : null\)/);
});

test('both calibrate with five samples and then heartbeat every 30 s', () => {
  const screenCalibration = region(screenRoot, 'const sample = async () => {', 'sample();');
  assert.match(screenCalibration, /index < 5/);
  assert.match(screenCalibration, /setTimeout\(sample, 30000\)/);
  assert.match(region(mirror, 'const sample = async () => {', 'sample();'), /index < 5/);
  assert.match(mirror, /heartbeatMs: 30_000/);
});

test('both count the clock ready the same way, and put the round on screen only when it is open with a ready clock at roundActive', () => {
  assert.match(screenRoot, /const clockReady = clock\.sampleCount > 0 \|\| clock\.quality === 'degraded';/);
  assert.match(mirror, /const clockReady = \(\) => device\.clock\.sampleCount > 0 \|\| device\.clock\.quality === 'degraded';/);
  assert.match(screenRoot, /room\.status === 'running' && room\.currentQuestion && roundOpen && clockReady/);
  assert.match(region(screenRoot, "if (room?.status !== 'running' || stage !== CHALLENGE_STAGE.ROUND_ACTIVE)", '}, [room?.status'), /collectLaunchEvent\('game_mounted', room\)/);
  const mounted = region(mirror, 'const render = () => {', 'let tickTimer');
  assert.match(mounted, /const playable = roundOpen && room\.currentQuestion && clockReady\(\) && current === CHALLENGE_STAGE\.ROUND_ACTIVE;/);
  assert.match(mounted, /collectLaunchEvent\('game_mounted', room\)/);
});

test('both send launch milestones as one best-effort batch a second after the game mounts', () => {
  assert.match(region(screenRoot, "collectLaunchEvent('game_mounted', room);", '}, [room?.status'), /setTimeout\(\(\) => \{ sendLaunchDiagnostics\(\)\.catch\(\(\) => \{\}\); \}, 1_000\)/);
  assert.match(region(mirror, "collectLaunchEvent('game_mounted', room);", 'if (room.challengeMode'), /later\(\(\) => \{ sendLaunchDiagnostics\(\)\.catch\(\(\) => \{\}\); \}, 1_000\)/);
  // One entry per event: the first observation, never re-collected once sent.
  const firstOnly = /if \([\w.]*milestones\[(?:launchEvent|event)\] \|\| [\w.]*reported\[(?:launchEvent|event)\]\) return;/;
  assert.match(region(screenRoot, 'const collectLaunchEvent', 'const sendLaunchDiagnostics'), firstOnly);
  assert.match(region(mirror, 'const collectLaunchEvent', 'const calibrate'), firstOnly);
});

test('both join unless the board already has this student, and stop only on a refusal', () => {
  assert.match(screenRoot, /leaderboard\.some\(\(entry\) => entry\.playerKey === invite\?\.playerKey\)/);
  assert.match(mirror, /leaderboard\(\)\.some\(\(entry\) => entry\.playerKey === device\.invite\?\.playerKey\)/);
  const refusal = /permission-denied\|failed-precondition\|not-found\|invalid-argument/;
  assert.match(region(screenRoot, 'joinLiveChallenge({ roomId })', '.finally('), refusal);
  assert.match(region(mirror, "request('joinLiveChallenge'", '.finally('), refusal);
});

test('both resend a locked answer with its own submission id, never a new one', () => {
  assert.match(region(screen, 'const retryPending = async () => {', 'useEffect('), /await submitResponse\(pending\)/);
  assert.match(region(mirror, 'const retryPending = () => {', 'const answerRound'), /sendAnswer\(capture, 'resend'\)/);
});
