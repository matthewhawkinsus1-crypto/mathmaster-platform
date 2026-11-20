// A STALE ROOM'S CLEANUP WRITES ONLY THE INVITES THAT STILL POINT AT IT
// (functions/liveChallengeFunctions.js updateLiveChallengeInvitesByRoom).
//
// Three cleanups mark a room's invites cancelled with no roster at hand: a
// stale room found when a teacher creates a game, a room retired before play,
// and the cancel of a room whose private state is gone. They find the invites
// by a query on the room, and they used to write them in a batch. So a newer
// game that re-invited a student between the query and the write had its
// invite marked cancelled, and that student was shown no lobby invite for it
// (src/platform/liveChallenge/warmupChallengeLink.js
// shouldShowChallengeLobbyInvite). Each invite is now written through
// updateLiveChallengeInvitesForRoom, which reads it again in a transaction and
// writes it only if it still points at the room, as a finished game's own
// invites already were.
//
// The race cannot be timed against the emulator, so the wiring is read as
// source here; tests/integration/liveChallengeHardening.test.mjs cancels a
// stale room against a real Firestore.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region } from './helpers/sourceContract.mjs';

const server = readFileSync(new URL('../../functions/liveChallengeFunctions.js', import.meta.url), 'utf8');
const byRoom = region(server, 'async function updateLiveChallengeInvitesByRoom(', '\n}\n', 'the by-room cleanup');
const forRoom = region(server, 'async function updateLiveChallengeInvitesForRoom(', '\n}\n', 'the for-room update');

test('the by-room cleanup finds this teacher\'s invites by a query and writes them only through the for-room update', () => {
  assert.match(byRoom, /\.where\("roomId", "==", roomId\)\.get\(\)/);
  assert.match(byRoom, /invite\.data\(\)\?\.teacherEmail === teacherEmail/, 'only the invites this teacher sent');
  assert.match(byRoom, /await updateLiveChallengeInvitesForRoom\(db, \{ roomId, studentIds, fields \}\);/);
  assert.doesNotMatch(byRoom, /batch|\.set\(|\.update\(|\.delete\(/, 'it writes nothing itself');
});

test('the for-room update reads each invite again in a transaction and writes it only if it still points at the room', () => {
  assert.match(forRoom, /await db\.runTransaction\(async \(transaction\) => \{/);
  assert.match(forRoom, /const snapshots = await transaction\.getAll\(\.\.\.refs\);/);
  assert.match(forRoom, /if \(snapshot\.exists && snapshot\.data\(\)\?\.roomId === roomId\) transaction\.set\(snapshot\.ref, fields, \{ merge: true \}\);/);
  assert.equal((forRoom.match(/transaction\.set\(/g) || []).length, 1, 'no other write');
});

test('the three cleanups with no roster at hand use it, and only the create writes invites in a batch', () => {
  assert.equal((server.match(/await updateLiveChallengeInvitesByRoom\(db, \{/g) || []).length, 3);
  // The create writes the new game's own invites, in the batch with its seats.
  assert.equal((server.match(/batch\.set\(db\.collection\(LIVE_CHALLENGE_INVITES\)/g) || []).length, 1);
});
