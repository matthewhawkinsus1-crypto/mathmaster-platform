/*
 * "PUBLISHED ASSIGNMENTS" AND THE GRADE PASSBACK MONITOR: EVERY ONE OF A
 * TEACHER'S POSTS AND ROWS, ONLY THEIRS, FOR THE READS OF THEIRS.
 *
 * HOW TO RUN: npm run test:callable-boundaries:emulator
 *
 * listPublishedAssignments read any 500 classroomLinks documents, and
 * listClassroomGradeSyncs any 2,000, of every teacher's, unordered, and kept
 * the caller's. There were 480 published links on Nov 11, 2026 (#545): past
 * 500 a teacher's own posts dropped off the list without a sign, and every
 * call billed the reads of everyone's. Both now read the caller's own links by
 * `teacherUid`, a page of 500 at a time (functions/lib/classroomLinkOwnership.js).
 *
 * The monitor then read the school's newest 500 grade passback rows
 * (classroomGradeSyncs) and kept the caller's, so a teacher whose rows were
 * not among them saw part of their monitor, or none of it. It now reads the
 * rows of the caller's own posts, 30 post ids a query
 * (functions/lib/classroomGradeSyncRows.js), and answers the newest 500 of
 * them, newest first.
 *
 * Here 600 posts belong to 20 teachers, 30 each, with ids hashed as
 * publicationDocumentId makes them, so each teacher's are spread across the
 * collection; one more teacher has 520, more than a page. Each of the 20 has
 * 60 rows, two students a post, but one, who has 600, twenty a post; the
 * teacher with 520 posts has 60 rows, on their newest 30. One teacher's rows
 * are the oldest in the school, and everyone else's are interleaved. Three of
 * them sign in for real (callableHost.mjs). Each gets every post of their own,
 * newest first, and every row of their own (the newest 500 of the teacher who
 * has 600), and nothing of anyone else's, and each call reads exactly their
 * posts and rows, counted as Firestore bills them
 * (tests/integration/support/firestoreAccounting.mjs).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const {
  NOTHING_CHANGED, changesBetween, db, deleteDocuments, googleCallsSince, googleMark, projectSnapshot, repo, shutdown,
  signedIn, writeDocuments,
} = await import('./callableHost.mjs');
const accounting = await import(pathToFileURL(path.join(repo, 'tests/integration/support/firestoreAccounting.mjs')).href);
accounting.installFirestoreAccounting();
const requireFromRepo = createRequire(path.join(repo, 'package.json'));
const { publicationDocumentId, gradeSyncDocumentId } = requireFromRepo('./functions/lib/publication.js');

const SECTIONS = ['whole', 'warmup', 'classwork', 'practice', 'dol'];
// Synthetic addresses on a reserved domain: nobody's real account. `rows` is
// how many students have a row on each of the teacher's newest `rowPosts`
// posts (all of them, unless named).
const REAL = {
  // The oldest rows in the school.
  first: { label: 'lists-teacher-first', email: 'first.teacher@district-four.test', posts: 30, rows: 2 },
  // 600 rows: more than the monitor's 500, and more than a page of one query.
  second: { label: 'lists-teacher-second', email: 'second.teacher@district-four.test', posts: 30, rows: 20 },
  // More posts than a page, and than 30 a query: 18 queries for 60 rows.
  big: { label: 'lists-teacher-big', email: 'big.teacher@district-four.test', posts: 520, rows: 2, rowPosts: 30 },
};
const SYNTHETIC_TEACHERS = 18;
// What the monitor answers with, as it always has: the newest 500.
const MONITOR_LIMIT = 500;

const accounts = {};
const postsOf = new Map();
// Each signed-in teacher's rows, oldest first: [{ id, data }].
const rowsOf = new Map();
const written = [];
let clock = Date.parse('2026-10-01T12:00:00.000Z');

function postsFor(teacherUid, count, tag) {
  const posts = [];
  for (let index = 0; index < count; index += 1) {
    const assignmentId = `lists-${tag}-assignment-${Math.floor(index / SECTIONS.length)}`;
    const sectionKey = SECTIONS[index % SECTIONS.length];
    const courseId = `lists-${tag}-course`;
    const id = publicationDocumentId(assignmentId, courseId, sectionKey);
    clock += 60_000;
    posts.push({
      id,
      data: {
        schemaVersion: sectionKey === 'whole' ? 3 : 5, publicationId: id, teacherUid, assignmentId, courseId,
        courseName: `Course ${tag}`, sectionKey, ...(sectionKey === 'whole' ? {} : { publicationKind: 'section' }),
        status: 'published', courseworkId: `cw-${id}`, gradePassbackEnabled: sectionKey === 'whole',
        publishedAt: new Date(clock).toISOString(), materials: [{ title: 'Notes', url: 'https://example.test/notes' }],
      },
    });
  }
  return posts;
}

/** One student's row on one post, as the triggers write it, written at `at`. */
const syncRow = (post, studentId, at) => ({
  syncId: gradeSyncDocumentId(post.id, studentId), publicationId: post.id, studentId,
  assignmentId: post.data.assignmentId, courseId: post.data.courseId, courseworkId: post.data.courseworkId,
  sectionKey: post.data.sectionKey, status: 'synced', stage: 'progress', grade: 80, attempted: 4, total: 5,
  isFinal: false, studentVisible: false, returnedToStudent: false, syncedAt: at, updatedAt: at,
});

/** `perPost` students' rows on each of the newest `count` of `posts`. */
const rowSlotsFor = (owner, posts, perPost, count = posts.length) => posts.slice(-count).flatMap((post) => (
  Array.from({ length: perPost }, (_, student) => ({ owner, post, studentId: `lists-student-${student}` }))
));
const hashed = (value) => createHash('sha256').update(value).digest('hex');

before(async () => {
  for (const [key, teacher] of Object.entries(REAL)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('teacherDirectory').doc(teacher.email).set({ email: teacher.email, active: true });
    // eslint-disable-next-line no-await-in-loop
    accounts[key] = await signedIn({ label: teacher.label, email: teacher.email });
  }
  const entries = [];
  const slots = [];
  for (let index = 0; index < SYNTHETIC_TEACHERS; index += 1) {
    const posts = postsFor(`lists-synthetic-${index}`, 30, `synthetic-${index}`);
    posts.forEach((post) => entries.push([`classroomLinks/${post.id}`, post.data]));
    slots.push(...rowSlotsFor(`synthetic-${index}`, posts, 2));
  }
  for (const [key, teacher] of Object.entries(REAL)) {
    const posts = postsFor(accounts[key].uid, teacher.posts, key);
    postsOf.set(key, posts);
    rowsOf.set(key, []);
    posts.forEach((post) => entries.push([`classroomLinks/${post.id}`, post.data]));
    slots.push(...rowSlotsFor(key, posts, teacher.rows, teacher.rowPosts));
  }
  // The first teacher's rows are the oldest in the school; everyone else's are
  // interleaved, in an order fixed by their ids.
  const first = slots.filter((slot) => slot.owner === 'first');
  const rest = slots.filter((slot) => slot.owner !== 'first')
    .sort((a, b) => (hashed(`${a.post.id}/${a.studentId}`) < hashed(`${b.post.id}/${b.studentId}`) ? -1 : 1));
  const rowsStart = clock + 86_400_000;
  [...first, ...rest].forEach((slot, index) => {
    const data = syncRow(slot.post, slot.studentId, new Date(rowsStart + index * 1000));
    entries.push([`classroomGradeSyncs/${data.syncId}`, data]);
    rowsOf.get(slot.owner)?.push({ id: data.syncId, data });
  });
  written.push(...entries.map(([docPath]) => docPath), ...Object.values(REAL).map((teacher) => `teacherDirectory/${teacher.email}`));
  await writeDocuments(entries);
});

// The files after this one share the emulator: leave it as this file found it.
after(async () => {
  await deleteDocuments(written);
  await shutdown();
});

/** One call: its answer, its reads by collection, and that it wrote nothing and never reached Google. */
async function called(caller, name) {
  const before = await projectSnapshot();
  const mark = googleMark();
  const since = accounting.accountingSince(0).events.length;
  const result = await caller.call(name, {});
  const reads = accounting.summarizeAccounting(accounting.accountingSince(0).events.slice(since), { includeHarness: true }).reads;
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED, `${caller.label} calling ${name} wrote nothing`);
  assert.deepEqual(googleCallsSince(mark), [], `${caller.label} calling ${name} never reached Google Classroom`);
  return { result, reads };
}

test('the fixture: more than a page of posts, and each teacher\'s spread past the 500th', async () => {
  const ids = (await db.collection('classroomLinks').select().get()).docs.map((doc) => doc.id).sort();
  assert.ok(ids.length >= SYNTHETIC_TEACHERS * 30 + 30 + 30 + 520, `${ids.length} posts`);
  const past500 = new Set(ids.slice(500));
  for (const key of Object.keys(REAL)) {
    assert.ok(postsOf.get(key).some((post) => past500.has(post.id)), `${key} has posts an unordered limit(500) would not reach`);
  }
});

test('the fixture: the school\'s newest 500 rows, all the monitor read, hold none of the oldest teacher\'s rows and part of the others\'', async (t) => {
  const rows = await db.collection('classroomGradeSyncs').select().get();
  assert.equal(rows.size, SYNTHETIC_TEACHERS * 60 + 60 + 600 + 60, '1,800 rows');
  const newest = new Set((await db.collection('classroomGradeSyncs').orderBy('updatedAt', 'desc').limit(MONITOR_LIMIT).select().get())
    .docs.map((doc) => doc.id));
  const seen = Object.fromEntries(Object.keys(REAL).map((key) => [key, rowsOf.get(key).filter((row) => newest.has(row.id)).length]));
  t.diagnostic(`the old read, the newest ${MONITOR_LIMIT} of the school's rows, held ${Object.entries(seen).map(([key, count]) => `${key} ${count} of ${rowsOf.get(key).length}`).join(', ')}`);
  assert.equal(seen.first, 0, 'the teacher with the oldest rows saw none of theirs');
  assert.ok(seen.second < MONITOR_LIMIT, 'the teacher with 600 rows did not see their newest 500');
  assert.ok(seen.big < 60, 'the teacher with 520 posts saw part of their 60 rows');
});

test('"Published assignments" lists every one of a teacher\'s posts, newest first, for the reads of their posts alone', async () => {
  for (const key of ['first', 'second']) {
    // eslint-disable-next-line no-await-in-loop
    const { result, reads } = await called(accounts[key], 'listPublishedAssignments');
    const expected = [...postsOf.get(key)].reverse();
    assert.deepEqual(result.links.map((link) => link.id), expected.map((post) => post.id), `${key}: all 30, newest first`);
    assert.deepEqual(result.links[0], { id: expected[0].id, ...expected[0].data }, `${key}: each post as it is stored`);
    assert.deepEqual(reads, { classroomLinks: 30 }, `${key}: 30 reads, where the list read 500 of everyone's`);
  }
});

test('a teacher with more than a page of posts gets every one, in two pages', async () => {
  const { result, reads } = await called(accounts.big, 'listPublishedAssignments');
  assert.equal(result.links.length, 520);
  assert.deepEqual(new Set(result.links.map((link) => link.id)), new Set(postsOf.get('big').map((post) => post.id)));
  assert.deepEqual(result.links.map((link) => link.id), [...postsOf.get('big')].reverse().map((post) => post.id), 'newest first');
  assert.deepEqual(reads, { classroomLinks: 520 }, 'a page of 500 and a page of 20');
});

/*
 * What the monitor's row read is billed: its posts in document-id order, 30 a
 * query, each query's rows a page of 500 at a time. A query is billed its
 * rows, or one read when it finds none, and a page that comes back full is
 * followed by one more.
 */
function billedRowReads(key) {
  const ids = postsOf.get(key).map((post) => post.id).sort();
  let reads = 0;
  for (let start = 0; start < ids.length; start += 30) {
    const chunk = new Set(ids.slice(start, start + 30));
    const rows = rowsOf.get(key).filter((row) => chunk.has(row.data.publicationId)).length;
    reads += Math.floor(rows / 500) * 500 + Math.max(1, rows % 500);
  }
  return reads;
}

test('the grade passback monitor shows a teacher every row of their own, newest first, the school\'s oldest too, and no one else\'s', async (t) => {
  for (const key of Object.keys(REAL)) {
    // eslint-disable-next-line no-await-in-loop
    const { result, reads } = await called(accounts[key], 'listClassroomGradeSyncs');
    const own = rowsOf.get(key);
    t.diagnostic(`${key}: shown ${result.syncs.length} of their ${own.length} rows; read ${JSON.stringify(reads)}`);
    const posts = new Set(postsOf.get(key).map((post) => post.id));
    assert.ok(result.syncs.every((row) => posts.has(row.publicationId)), `${key}: no row of another teacher's`);
    const expected = [...own].reverse().slice(0, MONITOR_LIMIT);
    assert.deepEqual(result.syncs.map((row) => row.id), expected.map((row) => row.id), `${key}: their newest ${Math.min(own.length, MONITOR_LIMIT)} of ${own.length}, newest first`);
    const [newest] = expected;
    assert.deepEqual(result.syncs[0], {
      id: newest.id, ...newest.data, queued: false, updatedAt: newest.data.updatedAt.toISOString(), syncedAt: newest.data.syncedAt.toISOString(),
    }, `${key}: each row as it is stored, with its times as text and whether it is queued`);
    assert.deepEqual(result.pushQueue, { waiting: 0 });
    assert.equal(reads.classroomLinks, REAL[key].posts, `${key}: their posts' ids alone, where the monitor read up to 2,000 of everyone's`);
    assert.equal(reads.classroomGradeSyncs, billedRowReads(key), `${key}: their own rows, where the monitor read the school's newest 500`);
    assert.equal(reads.classroomPushQueue, 1, `${key}: the push queue, as before`);
  }
  assert.equal(billedRowReads('first'), 60, 'one query, their 60 rows');
  assert.equal(billedRowReads('second'), 600, 'one query, in a page of 500 and a page of 100');
});
