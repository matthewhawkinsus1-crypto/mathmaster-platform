// WHOSE CLASSROOM PUBLICATION A TEACHER MAY SEE AND ACT ON: THE ONE RULE.
//
// functions/lib/classroomLinkOwnership.js decides it for the six publication
// callables in functions/index.js. A link that records a teacher is theirs
// alone; one that records none is the caller's only when they manage its
// assignment. The two lists read a teacher's own links by uid, a page at a
// time, and nothing else. The callables themselves are called for real, with
// real tokens, in tests/integration/callableBoundaries/
// (classroomPublicationOwnership and classroomPublicationLists).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { linkTeacherUid, linksForTeacher } = require('../../functions/lib/classroomLinkOwnership.js');

const links = [
  { id: 'mine', teacherUid: 't-me', assignmentId: 'A1' },
  { id: 'theirs', teacherUid: 't-them', assignmentId: 'A1' },
  { id: 'legacy-a1', assignmentId: 'A1' },
  { id: 'legacy-a2', assignmentId: 'A2' },
  { id: 'legacy-a1-again', teacherUid: '', assignmentId: 'A1' },
  { id: 'legacy-no-assignment' },
  { id: 'mine-padded', teacherUid: ' t-me ', assignmentId: 'A3' },
];
const ids = (entries) => entries.map((entry) => entry.id);

/** A managesAssignment that answers from `managed` and records what it was asked. */
const manager = (managed) => {
  const asked = [];
  return { asked, managesAssignment: async (assignmentId) => { asked.push(assignmentId); return managed.includes(assignmentId); } };
};

test('a link that records a teacher is that teacher\'s alone, whoever manages its assignment', async () => {
  const { managesAssignment } = manager(['A1', 'A2', 'A3']);
  assert.deepEqual(ids(await linksForTeacher(links, { teacherUid: 't-me', managesAssignment })).filter((id) => !id.startsWith('legacy')), ['mine', 'mine-padded']);
  const them = await linksForTeacher(links, { teacherUid: 't-them', managesAssignment: async () => false });
  assert.deepEqual(ids(them), ['theirs']);
});

test('a link that records no teacher is kept only for a caller who manages its assignment', async () => {
  assert.deepEqual(ids(await linksForTeacher(links, { teacherUid: 't-other', ...manager([]) })), []);
  assert.deepEqual(ids(await linksForTeacher(links, { teacherUid: 't-other', ...manager(['A2']) })), ['legacy-a2']);
  assert.deepEqual(
    ids(await linksForTeacher(links, { teacherUid: 't-me', ...manager(['A1']) })),
    ['mine', 'legacy-a1', 'legacy-a1-again', 'mine-padded'],
    'in the order given',
  );
});

test('only a true answer counts as managing the assignment', async () => {
  for (const answer of [undefined, null, 1, 'yes', {}, false]) {
    // eslint-disable-next-line no-await-in-loop
    const kept = await linksForTeacher(links, { teacherUid: 't-other', managesAssignment: async () => answer });
    assert.deepEqual(ids(kept), [], JSON.stringify(answer));
  }
});

test('the assignment is asked about once, and only for a link that records no teacher', async () => {
  const { asked, managesAssignment } = manager(['A1']);
  await linksForTeacher(links, { teacherUid: 't-me', managesAssignment });
  assert.deepEqual(asked, ['A1', 'A2'], 'never for a link with a teacher, never twice, never without an assignment');

  const own = manager([]);
  await linksForTeacher(links.filter((link) => link.teacherUid), { teacherUid: 't-me', managesAssignment: own.managesAssignment });
  assert.deepEqual(own.asked, [], 'a teacher\'s own links cost no reads');
});

test('a link with no teacher and no assignment is nobody\'s, and a caller with no uid gets nothing', async () => {
  assert.deepEqual(ids(await linksForTeacher([{ id: 'stub' }], { teacherUid: 't-me', managesAssignment: async () => true })), []);
  assert.deepEqual(ids(await linksForTeacher(links, { teacherUid: '', managesAssignment: async () => true })), []);
  assert.deepEqual(ids(await linksForTeacher(links, { teacherUid: '  ', managesAssignment: async () => true })), []);
});

test('linkOf reads an entry\'s link, as the callables pass references with their data', async () => {
  const entries = links.map((link) => ({ id: link.id, data: link }));
  const kept = await linksForTeacher(entries, { teacherUid: 't-me', linkOf: (entry) => entry.data, ...manager(['A2']) });
  assert.deepEqual(ids(kept), ['mine', 'legacy-a2', 'mine-padded']);
  assert.equal(linkTeacherUid({ teacherUid: ' t-me ' }), 't-me');
  assert.equal(linkTeacherUid({}), '');
  assert.equal(linkTeacherUid(null), '');
});

test('an error deciding who manages the assignment is not taken for "no"', async () => {
  await assert.rejects(
    linksForTeacher(links, { teacherUid: 't-me', managesAssignment: async () => { throw new Error('read failed'); } }),
    /read failed/,
  );
});

/* --- the lists: a teacher's own links, a page at a time ------------------- */

const { passbackFirestore } = await import('./helpers/sectionPassbackHarness.mjs');
const {
  TEACHER_LINK_MAX_PAGES, TEACHER_LINK_PAGE_SIZE, TEACHER_LINK_WARN_AT, readTeacherLinks, teacherLinkReadConcerns,
} = require('../../functions/lib/classroomLinkOwnership.js');

/** `own` links of t-me, interleaved by id with another teacher's and with links that record no teacher. */
const linkStore = (own) => {
  const classroomLinks = {};
  for (let index = 0; index < own; index += 1) {
    const key = String(index).padStart(5, '0');
    classroomLinks[`link-${key}-a`] = { teacherUid: 't-me', assignmentId: `A${index % 7}`, courseId: 'C1', materials: ['big'] };
    classroomLinks[`link-${key}-b`] = { teacherUid: 't-them', assignmentId: 'A1' };
    if (index % 50 === 0) classroomLinks[`link-${key}-c`] = { assignmentId: 'A1' };
  }
  return passbackFirestore({ classroomLinks });
};
// Firestore bills a query by the documents it returns, and one read when it returns none.
const billed = (db) => db.reads.reduce((sum, read) => sum + Math.max(1, read.returned.length), 0);

test('a teacher\'s links are read by their uid, in pages, and nothing else is read', async () => {
  for (const [own, queries, reads] of [[0, 1, 1], [1, 1, 1], [499, 1, 499], [500, 2, 501], [501, 2, 501], [1001, 3, 1001]]) {
    const db = linkStore(own);
    // eslint-disable-next-line no-await-in-loop
    const read = await readTeacherLinks(db, 't-me');
    assert.equal(read.docs.length, own, `${own} links`);
    assert.ok(read.docs.every((doc) => doc.data().teacherUid === 't-me'), 'only the teacher\'s own');
    assert.deepEqual(read.docs.map((doc) => doc.id), read.docs.map((doc) => doc.id).sort(), 'in document-id order');
    assert.equal(new Set(read.docs.map((doc) => doc.id)).size, own, 'no page repeats a link');
    assert.deepEqual([read.pages, read.complete], [queries, true]);
    assert.equal(db.reads.length, queries, `${own} links: ${queries} queries`);
    assert.equal(billed(db), reads, `${own} links: ${reads} reads`);
    assert.ok(db.reads.every((query) => query.filters.length === 1 && query.filters[0].field === 'teacherUid' && query.filters[0].value === 't-me'));
  }
  assert.equal(TEACHER_LINK_PAGE_SIZE, 500, 'the size of the read the lists replaced');
});

test('fields, when given, are all a page carries', async () => {
  const db = linkStore(3);
  const read = await readTeacherLinks(db, 't-me', { fields: ['assignmentId'] });
  assert.deepEqual(read.docs.map((doc) => Object.keys(doc.data())), [['assignmentId'], ['assignmentId'], ['assignmentId']]);
  assert.deepEqual(db.reads[0].fields, [['assignmentId']]);
  const whole = await readTeacherLinks(linkStore(1), 't-me');
  assert.deepEqual(Object.keys(whole.docs[0].data()).sort(), ['assignmentId', 'courseId', 'materials', 'teacherUid'], 'the whole link otherwise');
});

test('a read stops at its page limit and says it is not complete', async () => {
  const db = linkStore(1200);
  const read = await readTeacherLinks(db, 't-me', { pageSize: 100, maxPages: 3 });
  assert.deepEqual([read.docs.length, read.pages, read.complete], [300, 3, false]);
  assert.deepEqual(teacherLinkReadConcerns({ links: read.docs.length, complete: read.complete }), ['stopped-at-page-limit']);
  assert.deepEqual(teacherLinkReadConcerns({ links: TEACHER_LINK_WARN_AT - 1, complete: true }), []);
  assert.deepEqual(teacherLinkReadConcerns({ links: TEACHER_LINK_WARN_AT, complete: true }), ['many-links']);
  assert.equal(TEACHER_LINK_MAX_PAGES * TEACHER_LINK_PAGE_SIZE, 10_000);
});

test('a caller with no uid reads nothing', async () => {
  const db = linkStore(5);
  assert.deepEqual(await readTeacherLinks(db, '  '), { docs: [], pages: 0, complete: true });
  assert.deepEqual(db.reads, []);
});
