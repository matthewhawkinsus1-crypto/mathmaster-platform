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
  assert.match(region(mirror, 'watchLiveChallengeRoom(roomId', 'syncStandingsListeners();'), /\{ includeMetadataChanges: true \}/);
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

test('both join unless their own row says they already have, and stop only on a refusal', () => {
  assert.match(region(screenRoot, 'joinRefusedForRef.current === roomId || joinedRoomRef.current === roomId', 'setJoining(true)'), /const alreadyJoined = selfRow\?\.joined === true;/);
  assert.match(region(mirror, 'const alreadyJoined = () =>', 'const maybeJoin'), /device\.selfRow\?\.joined === true/);
  assert.match(region(mirror, 'const maybeJoin = () => {', "request('joinLiveChallenge'"), /if \(alreadyJoined\(\)\) return;/);
  const refusal = /permission-denied\|failed-precondition\|not-found\|invalid-argument/;
  assert.match(region(screenRoot, 'joinLiveChallenge({ roomId })', '.finally('), refusal);
  assert.match(region(mirror, "request('joinLiveChallenge'", '.finally('), refusal);
});

test('both resend a locked answer with its own submission id, never a new one', () => {
  assert.match(region(screen, 'const retryPending = async () => {', 'useEffect('), /await submitResponse\(pending\)/);
  assert.match(region(mirror, 'const retryPending = () => {', 'const answerRound'), /sendAnswer\(capture, 'resend'\)/);
});

// The certification failed on CI because the device mirrored a screen that
// threw away an answer refused before GO. Both now keep it and resend it at
// GO, through the one rule (challengeAnswerRefusal.js) — the device no
// better than the screen, and no worse.
test('both resend an answer refused before GO, at GO, by the same rule, as the same envelope', () => {
  const rule = /import \{ REFUSAL_OUTCOME, classifyAnswerRefusal, resendAtGoDelayMs \} from '[./]+(?:src\/)?platform\/liveChallenge\/challengeAnswerRefusal\.js';/;
  assert.match(screen, rule);
  assert.match(mirror, rule);
  // A refusal before GO goes to the resend, not to the closed-round path.
  assert.match(region(screen, 'const retryPending = async () => {', 'useEffect('), /else if \(outcome === REFUSAL_OUTCOME\.RETRY_AT_GO\) holdForGo\(\);/);
  assert.match(region(screen, 'const submit = async', 'const retryPending'), /else if \(outcome === REFUSAL_OUTCOME\.RETRY_AT_GO\) holdForGo\(\);/);
  const refused = region(mirror, '    } catch (error) {\n      if (timing && timing.ok === null)', 'const resendAtGo = async', 'the device\'s refusal');
  const toResend = refused.indexOf("classifyAnswerRefusal(error) === REFUSAL_OUTCOME.RETRY_AT_GO) return resendAtGo(capture);");
  assert.ok(toResend > -1, 'the device sends a refusal before GO to its resend');
  assert.ok(toResend < refused.indexOf('storage.delete(pendingKey('), '...before any refusal settles the envelope');
  // When: the rule's delay, from this device's server time, the round's GO
  // and its deadline, counting the resends so far. Neither has a margin,
  // bound or deadline check of its own.
  const hold = region(screen, 'const holdForGo = () => {', '\n  };');
  const mirrorHold = region(mirror, 'const resendAtGo = async (capture) => {', '\n  };');
  assert.match(hold, /resendAtGoDelayMs\(\{\s*serverNowMs: [^,]+,\s*startsAtMs,\s*endsAtMs,\s*resendsSoFar: resendsAtGoRef\.current,\s*\}\)/);
  assert.match(mirrorHold, /resendAtGoDelayMs\(\{\s*serverNowMs: Date\.now\(\) \+ device\.clock\.offsetMs,\s*startsAtMs: [^,]+,\s*endsAtMs: [^,]+,\s*resendsSoFar,\s*\}\)/);
  for (const source of [hold, mirrorHold]) assert.doesNotMatch(source, /\b\d{3,}\b|RESEND_AT_GO_(?:MARGIN_MS|MAX)/, 'the margin and the bound are the rule\'s');
  // What: the same envelope again, never a new answer; kept while it waits.
  assert.match(mirrorHold, /return sendAnswer\(capture, 'resend'\);/);
  assert.doesNotMatch(mirrorHold, /storage\.delete|randomUUID/);
  assert.match(mirrorHold, /resendsAtGo\.set\(capture\.submissionId, resendsSoFar \+ 1\);/);
  // On the page's own timer, which dies with the page, as the screen's does.
  assert.match(mirrorHold, /await pageTimer\(delayMs\)/);
  assert.match(region(mirror, 'async shutdown() {', '\n    },'), /pageWaits\.forEach\(\(resolve\) => resolve\(false\)\);/);
});

// THE STANDINGS. A screen hears the class through two single documents — its
// own public row and the room's standings snapshot — never every classmate's
// row (each answer used to reach every screen: N x N per round). The
// certification's device must listen exactly the same way, or it certifies a
// cost the screen no longer has (or misses one it does).
test('both listen to their own row and the standings snapshot, and never to the class\'s rows', () => {
  assert.match(screenRoot, /watchLiveChallengePlayer\(roomId, playerKey,/);
  assert.match(screenRoot, /watchLiveChallengeStandings\(roomId,/);
  assert.doesNotMatch(screen, /watchLiveChallengePlayers\b/, 'the student screen listens to every player row');
  const listeners = region(mirror, 'const syncStandingsListeners = () => {', 'const alreadyJoined');
  assert.match(listeners, /device\.service\.watchLiveChallengeStandings\(wantedRoom,/);
  assert.match(listeners, /device\.service\.watchLiveChallengePlayer\(wantedRoom, key,/);
  assert.match(mirror, /standingsClient: 'projection'/, "the device's default is the screen's way");
});

test('both pause both standings listeners while a rush round is open', () => {
  const pause = /rushRoundOpen = [\w?.]*(?:challengeMode|rushRoom)[^;]*roundState !== 'closed'/;
  assert.match(screenRoot, /const rushRoundOpen = rushRoom && room\?\.status === 'running' && room\?\.roundState !== 'closed';/);
  assert.match(region(screenRoot, 'useEffect(() => {\n    setSelfFresh(false);', '}, [roomId, playerKey, rushRoundOpen]);'), /if \(rushRoundOpen\) return undefined;/);
  assert.match(region(screenRoot, 'useEffect(() => {\n    setProjectionFresh(false);', '}, [roomId, rushRoundOpen]);'), /if \(rushRoundOpen\) return undefined;/);
  const listeners = region(mirror, 'const syncStandingsListeners = () => {', 'const alreadyJoined');
  assert.match(listeners, pause);
  assert.match(listeners, /const wantedRoom = device\.roomId && !rushRoundOpen \? device\.roomId : null;/);
});

test('both know their answer is on the server from their own row, never from the snapshot', () => {
  assert.match(screen, /const answeredOnServer = Number\(selfEntry\?\.answeredRound\) === roundIndex;/);
  assert.match(region(mirror, 'const answerRoundNow = async (room) => {', 'const capture = {'), /profile\.standingsClient === 'projection' \? device\.selfRow :/);
});

test('both decode the snapshot with the same functions and seat themselves the same way', () => {
  assert.match(screenRoot, /standingsFromProjection\(projection, \{ roomId, slot: selfSlot, playerKey \}\)/);
  assert.match(screenRoot, /const selfSlot = Number\.isInteger\(selfRow\?\.slot\) \? selfRow\.slot : \(Number\.isInteger\(invite\?\.slot\) \? invite\.slot : null\);/);
  const derive = region(mirror, 'const deriveStandings = () => {', 'const delivered');
  assert.match(derive, /const slot = Number\.isInteger\(device\.selfRow\?\.slot\) \? device\.selfRow\.slot : \(Number\.isInteger\(device\.invite\?\.slot\) \? device\.invite\.slot : null\);/);
  assert.match(derive, /standingsFromProjection\(device\.projection, \{ roomId: device\.roomId, slot, playerKey: myKey\(\) \}\)/);
});
