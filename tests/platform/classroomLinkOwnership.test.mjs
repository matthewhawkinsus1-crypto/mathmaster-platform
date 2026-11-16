// WHOSE CLASSROOM PUBLICATION A TEACHER MAY SEE AND ACT ON: THE ONE RULE.
//
// functions/lib/classroomLinkOwnership.js decides it for the six publication
// callables in functions/index.js. A link that records a teacher is theirs
// alone; one that records none is the caller's only when they manage its
// assignment. The callables themselves are called for real, with real tokens,
// in tests/integration/callableBoundaries/classroomPublicationOwnership.test.mjs.

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
