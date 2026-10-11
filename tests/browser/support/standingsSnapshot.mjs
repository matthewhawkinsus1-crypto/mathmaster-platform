/*
 * THE SERVER'S STANDINGS SNAPSHOT, WRITTEN FOR THE STUB HARNESSES.
 *
 * A student's screen ranks nobody itself any more: it reads one snapshot,
 * liveChallengeRooms/{roomId}/standings/current
 * (functions/shared/liveChallengeStandingsProjection.mjs). In the stub
 * harnesses (liveChallengeGame.mjs, liveChallengeRepeatedMatches.mjs) the
 * driver plays the server, so it also writes that snapshot at the moments the
 * server does — a live one where the host console's pacer would ask for it,
 * and the final one together with the finish — built by the real projection
 * functions from the rows the driver seeded. Nothing here invents a shape.
 *
 * The snapshot holds only the class's public rows, so an exact one is written
 * with what the server writes beside it: each invited player's own summary
 * (liveChallengeRooms/{roomId}/playerSummaries/{studentId},
 * functions/shared/liveChallengePlayerSummary.mjs), where the student's screen
 * reads its own final place.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const projection = await import(path.join(repo, 'functions/shared/liveChallengeStandingsProjection.mjs'));
const { publicLeaderboard } = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const { leaderboardOptionsFor } = await import(path.join(repo, 'functions/shared/liveChallengeScoring.mjs'));
const playerSummary = await import(path.join(repo, 'functions/shared/liveChallengePlayerSummary.mjs'));

/**
 * Write the room's snapshot from its current room document and public rows:
 * `live` as publishLiveChallengeStandings builds it, `final` (or
 * `roundClosed`) as the finish (or a round close) does, from the standings
 * those rows rank to.
 */
export async function writeStandingsSnapshot(db, roomId, { kind = projection.PROJECTION_KIND.LIVE } = {}) {
  const roomRef = db.collection('liveChallengeRooms').doc(roomId);
  const [roomSnap, playersSnap] = await Promise.all([roomRef.get(), roomRef.collection('players').get()]);
  const room = roomSnap.data() || {};
  const rows = playersSnap.docs.map((doc) => ({ playerKey: doc.id, ...doc.data() }));
  const nowMs = Date.now();
  const standings = publicLeaderboard(rows, leaderboardOptionsFor(room.scoringStrategyId || null));
  const built = kind === projection.PROJECTION_KIND.LIVE
    ? projection.liveProjectionFromPublicRows({ roomId, room, rows, nowMs })
    : projection.exactProjectionFromStandings({ roomId, room, kind, standings });
  if (kind === projection.PROJECTION_KIND.FINAL) {
    // Who each row is: the invites that point at this room name their player.
    const invites = await db.collection('liveChallengeInvites').where('roomId', '==', roomId).get();
    const studentOf = new Map(invites.docs.map((doc) => [String(doc.data()?.playerKey || ''), doc.id]));
    const named = standings.map((row) => ({ ...row, studentId: studentOf.get(String(row.playerKey)) || null, joined: true }));
    await Promise.all(playerSummary.finalSummaryEntries({ standings: named }).map((item) => roomRef
      .collection(playerSummary.PLAYER_SUMMARY_COLLECTION).doc(item.studentId).set({
        schemaVersion: playerSummary.PLAYER_SUMMARY_SCHEMA_VERSION, roomId, playerKey: item.playerKey, alias: item.alias, status: 'finished', final: item.entry,
      }, { merge: true })));
  }
  await roomRef.collection(projection.STANDINGS_COLLECTION).doc(projection.STANDINGS_DOC_ID).set({
    ...built,
    digest: projection.projectionDigest(built),
    source: 'harness',
    sourceReadMs: nowMs,
    publishedAtMs: nowMs,
  });
  return built;
}

export const { PROJECTION_KIND } = projection;
