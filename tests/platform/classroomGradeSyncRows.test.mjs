// THE GRADE PASSBACK MONITOR'S ROWS: A TEACHER'S OWN, READ BY THEIR OWN POSTS.
//
// listClassroomGradeSyncs read the newest 500 classroomGradeSyncs rows of the
// whole school and kept the caller's, so a teacher whose rows were not among
// the school's newest 500 saw part of their monitor or none of it (#545).
// functions/lib/classroomGradeSyncRows.js now reads the rows of the posts it
// is given, 30 post ids a query, a page of 500 at a time, and answers the
// newest 500, newest first. Here it runs against the Firestore fake, which
// bills a query as Firestore does; the callable itself is called for real,
// with real tokens and real queries, in
// tests/integration/callableBoundaries/classroomPublicationLists.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { passbackFirestore, requireFromFunctions } = await import('./helpers/sectionPassbackHarness.mjs');
const require = createRequire(import.meta.url);
const {
  GRADE_SYNC_MAX_ROWS, GRADE_SYNC_MONITOR_LIMIT, GRADE_SYNC_PAGE_SIZE, GRADE_SYNC_POSTS_PER_QUERY, GRADE_SYNC_WARN_AT,
  gradeSyncReadConcerns, gradeSyncTimeMs, newestGradeSyncs, readPublicationGradeSyncs,
} = require('../../functions/lib/classroomGradeSyncRows.js');

const START = Date.parse('2026-10-01T12:00:00.000Z');

/**
 * `perPost` rows on each of `posts` posts of the caller's, and the same on as
 * many posts of another teacher's, their row ids interleaved with the
 * caller's so that any read not filtered by post would reach them.
 */
const rowStore = ({ posts, perPost = 1 }) => {
  const classroomGradeSyncs = {};
  const own = [];
  let clock = START;
  for (let post = 0; post < posts; post += 1) {
    const key = String(post).padStart(4, '0');
    own.push(`pub-${key}-mine`);
    for (let student = 0; student < perPost; student += 1) {
      for (const whose of ['mine', 'theirs']) {
        const publicationId = `pub-${key}-${whose}`;
        clock += 1000;
        classroomGradeSyncs[`sync-${key}-${String(student).padStart(4, '0')}-${whose}`] = {
          publicationId, studentId: `student-${student}`, assignmentId: `assignment-${key}`, status: 'synced', updatedAt: new Date(clock),
        };
      }
    }
  }
  return { db: passbackFirestore({ classroomGradeSyncs }), own };
};
// Firestore bills a query by the documents it returns, and one read when it returns none.
const billed = (db) => db.reads.reduce((sum, read) => sum + Math.max(1, read.returned.length), 0);

test('a teacher\'s rows are read by their posts\' ids, 30 a query, and no other teacher\'s row is read', async () => {
  for (const [posts, queries] of [[1, 1], [29, 1], [30, 1], [31, 2], [60, 2], [61, 3]]) {
    const { db, own } = rowStore({ posts, perPost: 2 });
    // eslint-disable-next-line no-await-in-loop
    const read = await readPublicationGradeSyncs(db, own);
    assert.equal(read.docs.length, posts * 2, `${posts} posts: all their rows`);
    assert.ok(read.docs.every((doc) => doc.data().publicationId.endsWith('-mine')), `${posts} posts: only the caller's rows`);
    assert.deepEqual([read.queries, read.complete], [queries, true], `${posts} posts`);
    assert.equal(billed(db), posts * 2, `${posts} posts: as many reads as their rows`);
    assert.equal(db.reads.length, queries);
    for (const query of db.reads) {
      assert.deepEqual(query.filters.map(({ field, op }) => [field, op]), [['publicationId', 'in']], 'one in filter, on the post id');
      assert.ok(query.filters[0].value.length <= GRADE_SYNC_POSTS_PER_QUERY);
      assert.ok(query.filters[0].value.every((id) => own.includes(id)), 'asking only for the caller\'s posts');
    }
    assert.deepEqual(db.reads.flatMap((query) => query.filters[0].value).sort(), [...own].sort(), 'each post asked for once');
  }
  assert.equal(GRADE_SYNC_POSTS_PER_QUERY, 30, 'Firestore\'s limit on an in filter');
});

test('a query with more than a page of rows is read in pages, each row once', async () => {
  for (const [perPost, queries, reads] of [[499, 1, 499], [500, 2, 501], [501, 2, 501], [1001, 3, 1001]]) {
    const { db, own } = rowStore({ posts: 1, perPost });
    // eslint-disable-next-line no-await-in-loop
    const read = await readPublicationGradeSyncs(db, own);
    assert.equal(read.docs.length, perPost);
    assert.equal(new Set(read.docs.map((doc) => doc.id)).size, perPost, 'no page repeats a row');
    assert.deepEqual(read.docs.map((doc) => doc.id), read.docs.map((doc) => doc.id).sort(), 'in document-id order');
    assert.deepEqual([read.queries, read.complete], [queries, true], `${perPost} rows`);
    assert.equal(billed(db), reads, `${perPost} rows: ${reads} reads (an exact page costs one more query, which finds nothing)`);
  }
  assert.equal(GRADE_SYNC_PAGE_SIZE, 500, 'the size of the read the monitor replaced');
});

test('a post with no rows costs its query one read, and no posts read nothing', async () => {
  const { db, own } = rowStore({ posts: 31, perPost: 1 });
  const read = await readPublicationGradeSyncs(db, [...own.slice(0, 30), 'pub-without-rows']);
  assert.deepEqual([read.docs.length, read.queries], [30, 2]);
  assert.equal(billed(db), 31, 'the query that found nothing is billed one read');

  const empty = rowStore({ posts: 3 });
  assert.deepEqual(await readPublicationGradeSyncs(empty.db, []), { docs: [], queries: 0, complete: true });
  assert.deepEqual(await readPublicationGradeSyncs(empty.db, ['', null, undefined]), { docs: [], queries: 0, complete: true });
  assert.deepEqual(empty.db.reads, []);
  // A post named twice is asked for once.
  const twice = rowStore({ posts: 2 });
  assert.equal((await readPublicationGradeSyncs(twice.db, [...twice.own, ...twice.own])).docs.length, 2);
  assert.equal(twice.db.reads[0].filters[0].value.length, 2);
});

test('a read stops at its row limit and says it is not complete', async () => {
  const { db, own } = rowStore({ posts: 60, perPost: 10 });
  const read = await readPublicationGradeSyncs(db, own, { pageSize: 100, maxRows: 300 });
  assert.deepEqual([read.docs.length, read.queries, read.complete], [300, 3, false]);
  assert.deepEqual(gradeSyncReadConcerns({ rows: read.docs.length, complete: read.complete }), ['stopped-at-row-limit']);
  // Exactly the limit, with nothing left to read, is complete.
  const exact = rowStore({ posts: 30, perPost: 10 });
  const all = await readPublicationGradeSyncs(exact.db, exact.own, { pageSize: 400, maxRows: 300 });
  assert.deepEqual([all.docs.length, all.complete], [300, true]);
  assert.deepEqual(gradeSyncReadConcerns({ rows: GRADE_SYNC_WARN_AT - 1, complete: true }), []);
  assert.deepEqual(gradeSyncReadConcerns({ rows: GRADE_SYNC_WARN_AT, complete: true }), ['many-rows']);
  assert.equal(GRADE_SYNC_MAX_ROWS, 10_000);
});

/* --- the newest 500, newest first ------------------------------------------ */

const at = (offsetMs) => new Date(START + offsetMs);
// A Firestore Timestamp as the Admin SDK reads one: microseconds kept.
const { Timestamp } = requireFromFunctions('firebase-admin/firestore');

test('the monitor gets the newest 500 of a teacher\'s rows, newest first', async () => {
  const shuffled = Array.from({ length: 600 }, (_, index) => ({ id: `row-${String((index * 7919) % 600).padStart(3, '0')}`, updatedAt: null }))
    .map((row) => ({ ...row, updatedAt: at(Number(row.id.slice(4)) * 1000) }));
  const newest = newestGradeSyncs(shuffled);
  assert.equal(newest.length, 500);
  assert.equal(GRADE_SYNC_MONITOR_LIMIT, 500);
  assert.deepEqual(newest.map((row) => row.id), Array.from({ length: 500 }, (_, index) => `row-${String(599 - index).padStart(3, '0')}`));
  assert.deepEqual(newestGradeSyncs(shuffled, { limit: 3 }).map((row) => row.id), ['row-599', 'row-598', 'row-597']);
});

test('rows are ordered as the old orderBy("updatedAt", "desc") ordered them, and a row with no time is still shown, last', async () => {
  const rows = [
    { id: 'b-tied', updatedAt: at(5000) },
    { id: 'a-tied', updatedAt: at(5000) },
    { id: 'no-time' },
    { id: 'synced-only', syncedAt: at(3000) },
    { id: 'micro-later', updatedAt: new Timestamp(Math.floor((START + 4000) / 1000), 2000) },
    { id: 'micro-earlier', updatedAt: new Timestamp(Math.floor((START + 4000) / 1000), 1000) },
    { id: 'iso-string', updatedAt: at(1000).toISOString() },
    { id: 'unreadable', updatedAt: 'not a time' },
    { id: 'newest', updatedAt: at(9000), syncedAt: at(1) },
  ];
  assert.deepEqual(newestGradeSyncs(rows).map((row) => row.id), [
    'newest', 'b-tied', 'a-tied', 'micro-later', 'micro-earlier', 'synced-only', 'iso-string', 'unreadable', 'no-time',
  ], 'updatedAt, else syncedAt, newest first; ties by id, last first; no time last');
  assert.equal(gradeSyncTimeMs({ updatedAt: new Timestamp(1, 500_000) }), 1000.5);
  assert.equal(gradeSyncTimeMs({}), null);
  assert.deepEqual(newestGradeSyncs(undefined), []);
});
