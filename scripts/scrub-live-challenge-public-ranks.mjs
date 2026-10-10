#!/usr/bin/env node
/*
 * ONE-OFF: REWRITE OLD LIVE CHALLENGE ROOMS' CLASS-READABLE STANDINGS.
 *
 * Rooms played before the class's copies existed left rounds/{n} documents
 * holding every player's place and standings/current snapshots listing every
 * seat's rank and score, readable by any student whose invite still names the
 * room (firestore.rules). This rewrites them into what the server writes now
 * — only the public rule's rows — copying each whole round table to the
 * teacher-only hostRounds/{n} first. Player rows need nothing: the rules now
 * let a student read only their own. The plan is
 * scripts/lib/liveChallengeRankScrub.mjs (unit-tested in
 * tests/platform/liveChallengeRankScrub.test.mjs); this file only reads,
 * prints counts, and — with --execute and a typed project id — writes.
 *
 *   node scripts/scrub-live-challenge-public-ranks.mjs --project <id>             # DRY RUN (default): counts only
 *   node scripts/scrub-live-challenge-public-ranks.mjs --project <id> --execute   # asks for the project id, then writes
 *
 * Run it only after the functions that write the class's copies, the rules and
 * Hosting are live (a screen from before them reads rounds/{n} for its own row).
 * Output is counts only: no alias, key or student id is printed.
 */

import { createRequire } from 'node:module';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { planRoomScrub } from './lib/liveChallengeRankScrub.mjs';

const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));

const ROOMS = 'liveChallengeRooms';
const BATCH_WRITES = 200;

export const parseArgs = (argv = []) => {
  const options = { project: null, execute: false, room: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project') options.project = argv[++index] || null;
    else if (arg === '--execute') options.execute = true;
    else if (arg === '--room') options.room = argv[++index] || null;
    else throw new Error(`Unknown option ${arg}`);
  }
  return options;
};

/** Plan (and with `execute`, apply) every room's scrub. Returns counts. */
export async function scrubLiveChallengePublicRanks(db, { execute = false, room = null } = {}) {
  const counts = { rooms: 0, roomsChanged: 0, hostRound: 0, round: 0, standings: 0 };
  const roomRefs = room ? [db.collection(ROOMS).doc(room)] : await db.collection(ROOMS).listDocuments();
  for (const roomRef of roomRefs) {
    counts.rooms += 1;
    // eslint-disable-next-line no-await-in-loop
    const [rounds, hostRounds, standings] = await Promise.all([
      roomRef.collection('rounds').get(),
      roomRef.collection('hostRounds').listDocuments(),
      roomRef.collection('standings').doc('current').get(),
    ]);
    const writes = planRoomScrub({
      roomId: roomRef.id,
      rounds: rounds.docs.map((doc) => ({ id: doc.id, data: doc.data() })),
      hostRoundIds: hostRounds.map((ref) => ref.id),
      standings: standings.exists ? standings.data() : null,
    });
    if (!writes.length) continue;
    counts.roomsChanged += 1;
    writes.forEach((write) => { counts[write.kind] += 1; });
    if (!execute) continue;
    for (let start = 0; start < writes.length; start += BATCH_WRITES) {
      const batch = db.batch();
      writes.slice(start, start + BATCH_WRITES).forEach((write) => {
        const ref = db.doc(write.path);
        // The teacher's copy is created only where none exists (never overwritten).
        if (write.kind === 'hostRound') batch.create(ref, write.data);
        else batch.set(ref, write.data);
      });
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
    }
  }
  return counts;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.project) throw new Error('--project <id> is required. Nothing has been read.');
  const admin = functionsRequire('firebase-admin');
  const app = admin.initializeApp({ projectId: options.project }, 'scrub-live-challenge-public-ranks');
  const db = app.firestore();
  const planned = await scrubLiveChallengePublicRanks(db, { execute: false, room: options.room });
  console.log(`Plan for ${options.project}:`, JSON.stringify(planned));
  if (!options.execute) {
    console.log('DRY RUN: nothing was written. Re-run with --execute to apply.');
    return;
  }
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await prompt.question(`Type the project id (${options.project}) to write: `)).trim();
  prompt.close();
  if (typed !== options.project) {
    console.log('Not confirmed; nothing was written.');
    return;
  }
  const applied = await scrubLiveChallengePublicRanks(db, { execute: true, room: options.room });
  console.log('Applied:', JSON.stringify(applied));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
