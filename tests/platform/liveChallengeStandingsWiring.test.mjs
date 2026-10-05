// The launch certification's simulated host console
// (tests/integration/support/liveChallengeSimHost.mjs) stands in for the
// standings part of LiveChallengeTeacher.jsx, which node cannot render: the
// console ranks every public row, and when what it shows changes it asks the
// server, through the standings pacer, for a fresh live snapshot for the
// students. This holds the mirror to the console, so a change to when or how
// the console asks fails here and says what to update, instead of the
// certification measuring a publisher the console no longer runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = async (relative) => executableSource(await readFile(new URL(relative, import.meta.url), 'utf8'));
const teacher = await read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
const hooks = await read('../../src/platform/liveChallenge/challengeHooks.js');
const mirror = await read('../integration/support/liveChallengeSimHost.mjs');
const publisher = region(hooks, 'export const useStandingsPublisher', 'export const useChallengeClock', 'useStandingsPublisher');

test('both rank the board the console shows: the room\'s strategy, with work in progress only while the round takes answers', () => {
  const activeRound = /const activeRound = stage === CHALLENGE_STAGE\.ROUND_ACTIVE \? Number\(room\.currentRound\) : null;/;
  assert.match(teacher, activeRound);
  assert.match(teacher, /publicLeaderboard\(players, \{ activeRound, \.\.\.leaderboardOptionsFor\(scoringStrategyId\) \}\)/);
  assert.match(teacher, /const scoringStrategyId = room\?\.scoringStrategyId \|\| null;/);
  assert.match(mirror, activeRound);
  assert.match(mirror, /publicLeaderboard\(host\.players, \{ activeRound, \.\.\.leaderboardOptionsFor\(room\.scoringStrategyId \|\| null\) \}\)/);
  // The stage comes from the room's clock in both.
  assert.match(mirror, /const stage = challengeClock\(room, Date\.now\(\)\)\.stage;/);
});

test('the console publishes through the pacer, with the callable, for its own board', () => {
  assert.match(teacher, /useStandingsPublisher\(\{ roomId, room, leaderboard, questionSetRoom, publish: publishLiveChallengeStandings \}\)/);
  assert.match(teacher, /const questionSetRoom = roomRunsQuestionSets\(room\);/);
  assert.match(publisher, /createStandingsPublishPacer\(\{ publish: \(\) => publishRef\.current\?\.\(\{ roomId \}\) \}\)/);
});

test('both ask on a change of the same signature, only while the room has live standings', () => {
  assert.match(publisher, /hostStandingsSignature\(leaderboard\)/);
  assert.match(publisher, /const live = roomPublishesLiveStandings\(room, \{ questionSetRoom \}\);/);
  assert.match(publisher, /if \(live\) pacerRef\.current\?\.changed\(\);/);
  assert.match(mirror, /const signature = hostStandingsSignature\(leaderboard\);/);
  assert.match(mirror, /!roomPublishesLiveStandings\(room, \{ questionSetRoom: roomRunsQuestionSets\(room\) \}\)\) return;\s*pacer\.changed\(\);/);
  assert.match(mirror, /call\('publishLiveChallengeStandings', \{ roomId \}\)/);
});

test('both stop asking once the match is over', () => {
  assert.match(publisher, /const ended = room\?\.status === 'finished' \|\| room\?\.status === 'cancelled';/);
  assert.match(publisher, /if \(ended\) \{ pacerRef\.current\?\.stop\(\); return; \}/);
  assert.match(mirror, /if \(room\.status === 'finished' \|\| room\.status === 'cancelled'\) \{ pacer\.stop\(\); return; \}/);
});
