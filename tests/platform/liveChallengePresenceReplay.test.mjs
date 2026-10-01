import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONNECTION_QUALITIES,
  MAX_REMEMBERED_SESSIONS,
  PRESENCE_FRESH_MS,
  SESSION_MEMORY_MS,
  cleanSessionId,
  nextConnectionReport,
} from '../../functions/shared/liveChallengePresence.mjs';
import {
  PRESENCE,
  RECONNECT_NEWS_MS,
  STUDENT_CONNECTION,
  agoText,
  hostRoster,
  presenceOf,
  studentConnectionState,
} from '../../src/platform/liveChallenge/challengePresenceModel.js';
import { replayExperienceFromRoom, replayRequestFromRoom, replaySummary } from '../../src/platform/liveChallenge/challengeReplayModel.js';
import { RUSH_MODE_ID } from '../../functions/shared/graphFeatureRushRules.mjs';

/*
 * WHO IS HERE, AND PLAYING AGAIN.
 *
 * Presence is what the server last HEARD from a student's game screen (its
 * ~30-second clock calibration), never a guess that they left — a browser
 * cannot say it closed. Play Again is a FRESH match with the same settings.
 */

const NOW = 5_000_000;

/* ------------------------- the server's heartbeat row ------------------------- */

test('a heartbeat records the screen, its tab, and a return after a silence', () => {
  assert.equal(cleanSessionId('tab-1234'), 'tab-1234');
  assert.equal(cleanSessionId(' 0f8a3c1e-9b2d-4c6e-8a1f-2b3c4d5e6f70 '), '0f8a3c1e-9b2d-4c6e-8a1f-2b3c4d5e6f70');
  for (const bad of ['', 'abc', '../../x', 'a b c d e f', 'x'.repeat(65), null, undefined, { id: 'tab-1234' }]) {
    assert.equal(cleanSessionId(bad), null, `${JSON.stringify(bad)} is not a session id`);
  }
  const first = nextConnectionReport({ quality: 'synchronized', sessionId: 'tab-aaaa', nowMs: NOW });
  assert.equal(first.connectionStatus, 'synchronized');
  assert.equal(first.connectionRttCategory, 'normal');
  assert.deepEqual(first.sessions, { 'tab-aaaa': NOW });
  assert.equal('reconnectedAt' in first, false, 'a first report is not a reconnect');
  // A second tab: both kept, newest first.
  const second = nextConnectionReport({ previousHeardMs: NOW, previousSessions: first.sessions, quality: 'delayed', sessionId: 'tab-bbbb', nowMs: NOW + 10_000 });
  assert.deepEqual(Object.keys(second.sessions), ['tab-bbbb', 'tab-aaaa']);
  assert.equal(second.connectionRttCategory, 'elevated');
  // Heard again inside the window: not a reconnect.
  assert.equal('reconnectedAt' in nextConnectionReport({ previousHeardMs: NOW, quality: 'synchronized', nowMs: NOW + PRESENCE_FRESH_MS }), false);
  // Silent past the window, then heard: back.
  assert.equal(nextConnectionReport({ previousHeardMs: NOW, quality: 'synchronized', nowMs: NOW + PRESENCE_FRESH_MS + 1 }).reconnectedAt, NOW + PRESENCE_FRESH_MS + 1);
  // Old sessions age out; the map never grows past its bound; junk is dropped.
  const crowded = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`tab-${index}000`, NOW - index * 1_000]));
  crowded['tab-stale'] = NOW - SESSION_MEMORY_MS - 1;
  crowded['../evil'] = NOW;
  const pruned = nextConnectionReport({ previousHeardMs: NOW, previousSessions: crowded, quality: 'synchronized', sessionId: 'tab-new1', nowMs: NOW });
  assert.equal(Object.keys(pruned.sessions).length, MAX_REMEMBERED_SESSIONS);
  assert.equal(Object.keys(pruned.sessions)[0], 'tab-new1');
  assert.ok(!('tab-stale' in pruned.sessions) && !('../evil' in pruned.sessions));
  // A screen not heard from in five minutes has really left the map.
  const aged = nextConnectionReport({ previousHeardMs: NOW, previousSessions: { 'tab-gone': NOW - SESSION_MEMORY_MS - 1, 'tab-here': NOW - 1_000 }, quality: 'synchronized', sessionId: 'tab-aaaa', nowMs: NOW });
  assert.deepEqual(Object.keys(aged.sessions).sort(), ['tab-aaaa', 'tab-here']);
  // An unknown quality is "delayed", never trusted text.
  assert.equal(nextConnectionReport({ quality: '<script>', nowMs: NOW }).connectionStatus, 'delayed');
  assert.deepEqual([...CONNECTION_QUALITIES], ['synchronized', 'delayed', 'reconnecting', 'degraded']);
  // An old client (no session id) still reports.
  assert.deepEqual(nextConnectionReport({ quality: 'synchronized', nowMs: NOW }).sessions, {});
});

/* ----------------------------- the console's view ----------------------------- */

test('presence is what the server last heard — connected, quiet, back, or on two devices', () => {
  assert.equal(presenceOf({ publicRow: null, nowMs: NOW }).state, PRESENCE.NOT_JOINED);
  assert.equal(presenceOf({ publicRow: { joined: false }, nowMs: NOW }).state, PRESENCE.NOT_JOINED);
  assert.equal(presenceOf({ publicRow: { joined: true }, nowMs: NOW }).state, PRESENCE.JOINED, 'joined, no report yet');
  const connected = presenceOf({ publicRow: { joined: true }, diagnostic: { connectionUpdatedAt: NOW - 20_000, connectionStatus: 'synchronized' }, nowMs: NOW });
  assert.equal(connected.state, PRESENCE.CONNECTED);
  assert.equal(connected.label, 'Connected');
  // A rush tap or a working-points report is also hearing from them.
  assert.equal(presenceOf({ publicRow: { joined: true, rushActiveAt: NOW - 1_000 }, diagnostic: { connectionUpdatedAt: NOW - 500_000 }, nowMs: NOW }).state, PRESENCE.CONNECTED);
  const quiet = presenceOf({ publicRow: { joined: true }, diagnostic: { connectionUpdatedAt: NOW - 150_000 }, nowMs: NOW });
  assert.equal(quiet.state, PRESENCE.NO_SIGNAL);
  assert.equal(quiet.label, 'No signal 2 min', 'a fact, not a guess that they left');
  const back = presenceOf({ publicRow: { joined: true }, diagnostic: { connectionUpdatedAt: NOW - 5_000, reconnectedAt: NOW - 60_000 }, nowMs: NOW });
  assert.equal(back.label, 'Reconnected');
  assert.equal(presenceOf({ publicRow: { joined: true }, diagnostic: { connectionUpdatedAt: NOW - 5_000, reconnectedAt: NOW - RECONNECT_NEWS_MS - 1 }, nowMs: NOW }).label, 'Connected', 'old news fades');
  const twoDevices = presenceOf({ publicRow: { joined: true }, diagnostic: { connectionUpdatedAt: NOW, sessions: { 'tab-aaaa': NOW - 10_000, 'tab-bbbb': NOW - 20_000, 'tab-cccc': NOW - PRESENCE_FRESH_MS - 1 } }, nowMs: NOW });
  assert.equal(twoDevices.devices, 2, 'two screens heard within the window');
  assert.deepEqual(['just now', '40 s ago', '2 min ago'], [agoText(3_000), agoText(40_000), agoText(150_000)]);
});

test('the console roster: every invited student by name, joined or not, finished or working', () => {
  const roster = hostRoster({
    roster: [
      { playerKey: 'k3', name: 'Cruz, Ana', alias: 'Old Alias' },
      { playerKey: 'k1', name: 'Ben Ito', alias: 'Nova' },
      { playerKey: 'k2', name: 'ana Diaz', alias: 'Comet' },
    ],
    players: [
      { playerKey: 'k1', alias: 'Nova', joined: true },
      { playerKey: 'k3', alias: 'Atlas', joined: true },
    ],
    diagnostics: [{ playerKey: 'k1', connectionUpdatedAt: NOW - 1_000, sessions: { 'tab-aaaa': NOW, 'tab-bbbb': NOW } }],
    roundIndex: 0,
    finishedKeys: new Set(['k1']),
    nowMs: NOW,
  });
  assert.deepEqual(roster.entries.map((entry) => entry.name), ['ana Diaz', 'Ben Ito', 'Cruz, Ana'], 'by name, case-insensitively — never by score');
  assert.equal(roster.entries.find((entry) => entry.playerKey === 'k3').alias, 'Atlas', 'the public row\'s current alias wins');
  assert.equal(roster.entries.find((entry) => entry.playerKey === 'k1').finishedRound, true);
  assert.equal(roster.entries.find((entry) => entry.playerKey === 'k3').finishedRound, false);
  assert.deepEqual({ ...roster.summary }, { invited: 3, joined: 2, connected: 1, noSignal: 0, multiDevice: 1, reconnected: 0, notJoined: ['ana Diaz'] });
  assert.equal(roster.hasNames, true);
  // Before the names arrive (or after a finished room's private state is
  // gone) the console still lists who is in — by game alias.
  const aliases = hostRoster({ roster: null, players: [{ playerKey: 'k1', alias: 'Nova', joined: true }], nowMs: NOW });
  assert.equal(aliases.hasNames, false);
  assert.deepEqual(aliases.entries.map((entry) => entry.name), ['Nova']);
  assert.equal(aliases.entries[0].finishedRound, null, 'outside a round there is no "finished"');
});

test("a student's own device says Reconnecting only when it has really lost the game", () => {
  assert.equal(studentConnectionState({ online: true, fromCache: false, everInSync: true }), STUDENT_CONNECTION.ONLINE);
  assert.equal(studentConnectionState({ online: false, fromCache: false, everInSync: true }), STUDENT_CONNECTION.OFFLINE);
  assert.equal(studentConnectionState({ online: true, fromCache: true, everInSync: true }), STUDENT_CONNECTION.RECONNECTING);
  assert.equal(studentConnectionState({ online: true, fromCache: true, everInSync: false }), STUDENT_CONNECTION.ONLINE, 'a first paint from the device cache is not a lost connection');
  assert.equal(studentConnectionState(), STUDENT_CONNECTION.ONLINE);
});

/* -------------------------------- Play Again -------------------------------- */

const classicRoom = {
  roomId: 'old-room',
  classId: 'class-1',
  classPeriod: '3',
  courseId: 'algebra1',
  title: 'Period 3 Live Challenge',
  challengeMode: 'standard',
  standardCode: 'A.5A',
  questionStyle: 'noTools',
  roundCount: 6,
  requestedRoundCount: 8,
  roundSeconds: 45,
  timingMode: 'pace',
  roundClosingThreshold: null,
  secondChanceMode: 'automatic',
  scoringStrategyId: 'correctCount',
  speedInfluencePercent: 30,
  playerDisplayMode: 'firstName',
  assignmentId: 'warmup-assignment-1',
  status: 'finished',
  currentRound: 5,
};

test('Play Again asks for the same game as a new match — never the old room, never a second Warm-Up', () => {
  const policy = { rules: [] };
  const request = replayRequestFromRoom(classicRoom, { rewardPolicy: policy });
  assert.deepEqual({ ...request }, {
    classId: 'class-1',
    classPeriod: '3',
    courseId: 'algebra1',
    title: 'Period 3 Live Challenge',
    challengeMode: 'standard',
    roundCount: 8,
    roundSeconds: 45,
    scoringStrategyId: 'correctCount',
    rewardPolicy: policy,
    standardCode: 'A.5A',
    questionStyle: 'noTools',
    timingMode: 'pace',
    roundClosingThreshold: null,
    secondChanceMode: 'automatic',
    assignmentId: null,
  });
  assert.equal('roomId' in request, false, 'a fresh room id is the server\'s');
  for (const carried of ['currentRound', 'status', 'roundVersion', 'roundToken', 'startsAt']) assert.equal(carried in request, false);
  assert.deepEqual({ ...replayExperienceFromRoom(classicRoom) }, { speedInfluencePercent: 30, playerDisplayMode: 'firstName' });
  assert.equal(replaySummary(classicRoom), 'Standard Challenge · 8 rounds · Pace Race · Correct Count');
  // Settings the room never had are left to the server's defaults.
  const sparse = replayRequestFromRoom({ classId: 'c', challengeMode: 'standard' });
  assert.equal('roundSeconds' in sparse, false);
  assert.equal('solverRaceFocus' in sparse, false);
  assert.equal(sparse.rewardPolicy, null, 'no choice on this device: the server default');
  assert.equal(replayRequestFromRoom({ challengeMode: 'standard' }), null, 'a room without a class cannot be replayed');
});

test('Play Again for a Graph Feature Rush carries its features, not its seed', () => {
  const rush = {
    classId: 'class-2',
    courseId: 'algebra1',
    challengeMode: RUSH_MODE_ID,
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    graphFeatureRush: { config: { presetId: 'intercepts', families: ['linear', 'quadratic'], features: ['xIntercept', 'yIntercept'], difficulty: 'standard' }, seed: 'secret' },
  };
  const request = replayRequestFromRoom(rush);
  assert.deepEqual(request.graphFeatureRush, { presetId: 'intercepts', families: ['linear', 'quadratic'], features: ['xIntercept', 'yIntercept'], difficulty: 'standard' });
  assert.equal(JSON.stringify(request).includes('secret'), false);
  assert.equal('standardCode' in request, false, 'no bank settings for a rush');
  assert.equal(replayExperienceFromRoom(rush).speedInfluencePercent, 0, 'a rush never scores speed');
  assert.equal(replayRequestFromRoom({ ...rush, graphFeatureRush: null }), null, 'a rush without its settings cannot be replayed');
});
