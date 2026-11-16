/*
 * "PUBLISHED ASSIGNMENTS" AND THE GRADE PASSBACK MONITOR: EVERY ONE OF A
 * TEACHER'S POSTS, ONLY THEIRS, FOR THE READS OF THEIRS.
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
 * Here 600 posts belong to 20 teachers, 30 each, with ids hashed as
 * publicationDocumentId makes them, so each teacher's are spread across the
 * collection; one more teacher has 520, more than a page. Three of them sign in
 * for real (callableHost.mjs). Each gets every post of their own, newest
 * first, and nothing of anyone else's, and the call reads exactly their posts,
 * counted as Firestore bills them (tests/integration/support/firestoreAccounting.mjs).
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const {
  NOTHING_CHANGED, changesBetween, db, googleCallsSince, googleMark, projectSnapshot, repo, shutdown, signedIn,
} = await import('./callableHost.mjs');
const accounting = await import(pathToFileURL(path.join(repo, 'tests/integration/support/firestoreAccounting.mjs')).href);
accounting.installFirestoreAccounting();
const requireFromRepo = createRequire(path.join(repo, 'package.json'));
const { publicationDocumentId, gradeSyncDocumentId } = requireFromRepo('./functions/lib/publication.js');

const SECTIONS = ['whole', 'warmup', 'classwork', 'practice', 'dol'];
// Synthetic addresses on a reserved domain: nobody's real account.
const REAL = {
  first: { label: 'lists-teacher-first', email: 'first.teacher@district-four.test', posts: 30 },
  second: { label: 'lists-teacher-second', email: 'second.teacher@district-four.test', posts: 30 },
  big: { label: 'lists-teacher-big', email: 'big.teacher@district-four.test', posts: 520 },
};
const SYNTHETIC_TEACHERS = 18;

const accounts = {};
const postsOf = new Map();
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

async function writeAll(entries) {
  for (let start = 0; start < entries.length; start += 400) {
    const batch = db.batch();
    entries.slice(start, start + 400).forEach(([docPath, data]) => batch.set(db.doc(docPath), data));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

before(async () => {
  for (const [key, teacher] of Object.entries(REAL)) {
    // eslint-disable-next-line no-await-in-loop
    await db.collection('teacherDirectory').doc(teacher.email).set({ email: teacher.email, active: true });
    // eslint-disable-next-line no-await-in-loop
    accounts[key] = await signedIn({ label: teacher.label, email: teacher.email });
  }
  const entries = [];
  for (let index = 0; index < SYNTHETIC_TEACHERS; index += 1) {
    postsFor(`lists-synthetic-${index}`, 30, `synthetic-${index}`).forEach((post) => entries.push([`classroomLinks/${post.id}`, post.data]));
  }
  for (const [key, teacher] of Object.entries(REAL)) {
    const posts = postsFor(accounts[key].uid, teacher.posts, key);
    postsOf.set(key, posts);
    posts.forEach((post) => entries.push([`classroomLinks/${post.id}`, post.data]));
    // The monitor's rows: the newest three of this teacher's posts.
    posts.slice(-3).forEach((post) => entries.push([`classroomGradeSyncs/${gradeSyncDocumentId(post.id, `student-${key}`)}`, {
      publicationId: post.id, assignmentId: post.data.assignmentId, studentId: `student-${key}`, status: 'synced',
      updatedAt: new Date(Date.parse(post.data.publishedAt)),
    }]));
  }
  await writeAll(entries);
});

after(shutdown);

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

test('the grade passback monitor reads a teacher\'s own posts and shows their rows', async () => {
  for (const key of Object.keys(REAL)) {
    // eslint-disable-next-line no-await-in-loop
    const { result, reads } = await called(accounts[key], 'listClassroomGradeSyncs');
    assert.deepEqual(
      result.syncs.map((row) => row.publicationId).sort(),
      postsOf.get(key).slice(-3).map((post) => post.id).sort(),
      `${key}: their own rows`,
    );
    assert.deepEqual(result.pushQueue, { waiting: 0 });
    assert.equal(reads.classroomLinks, REAL[key].posts, `${key}: their posts' ids alone, where the monitor read up to 2,000 of everyone's`);
  }
});
