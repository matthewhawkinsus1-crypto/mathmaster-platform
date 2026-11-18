// THE SECTION GRADE TRIGGER READS ONLY THE PUBLICATION FIELDS IT USES, AND NOTHING MORE OFTEN.
//
// Issue #545, item 2. syncSectionGradeToClassroom runs on every write to
// grades/{studentId}. For each assignment the write changed, it reads the
// assignment, re-reads the student's grade document for the correction guard,
// and queries classroomLinks for the assignment's columns. That query returned
// each link in full, launch URL, materials and title included, to use ten
// fields of it.
//
// The query now selects those ten fields. It runs where it did, for the same
// assignments, and returns the same documents, so Firestore reads exactly as
// many as before and every Classroom call and row is unchanged. The scenario
// table below passes unchanged on the code before this change and after it.
// The real trigger runs against fakes of Firestore and of Google's HTTP layer
// (helpers/sectionPassbackHarness.mjs).
//
// Reading the links before the assignment, to skip the assignment for one with
// no section column, is not done: for an assignment whose feedback is held, or
// a write the correction guard refuses, it would read the links where the
// trigger stops today after one read. Skipping needs a marker of the
// assignment's publications on the assignment itself, which is a migration.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fakeGoogle, passbackFirestore, requireFromFunctions, writeGrades } from './helpers/sectionPassbackHarness.mjs';
import { region } from './helpers/sourceContract.mjs';

const { rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const STUDENT = 's1';
const COURSE = 'course-1';

const assignment = (extra = {}) => ({
  schemaVersion: 5, assignedClassIds: ['c1'], dueAt: iso(7 * DAY),
  sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }, { role: 'classwork', questions: [{ id: 'c1' }, { id: 'c2' }] }],
  ...extra,
});
const sectionLink = (assignmentId, sectionKey, extra = {}) => ({
  assignmentId, status: 'published', publicationKind: 'section', sectionKey, sectionLabel: `${sectionKey} column`,
  courseId: COURSE, courseworkId: `${assignmentId}-${sectionKey}`, teacherUid: 't1', maxPoints: 50,
  gradePassbackEnabled: false, sectionGradePassbackEnabled: true,
  title: 'Lesson', launchUrl: `https://example.test/launch?token=${'x'.repeat(300)}`, materials: [{ title: 'Notes', url: 'https://example.test/n' }],
  ...extra,
});
const wholeLink = (assignmentId) => ({
  assignmentId, status: 'published', publicationKind: 'assignment', sectionKey: 'whole',
  courseId: COURSE, courseworkId: `${assignmentId}-whole`, teacherUid: 't1', maxPoints: 100, gradePassbackEnabled: true,
});
const linked = { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } };
const completeWarmup = (assignmentId) => (grades) => ({
  ...grades,
  gradesByAssignment: { ...grades.gradesByAssignment, [assignmentId]: { 0: { status: 'correct', totalAttempts: 1 } } },
});

// What one write sent to Classroom and recorded, rows keyed by publication.
async function runScenario({ assignments, links, rosterLinks = linked, grades = {}, change }) {
  const db = passbackFirestore({
    assignments,
    classroomLinks: links,
    classroomRosterLinks: rosterLinks,
    grades: { [STUDENT]: { classId: 'c1', profile: {}, gradesByAssignment: {}, ...grades } },
  });
  // Google accepts every call: the table is about what is sent, not refusals.
  const google = fakeGoogle({ states: Object.fromEntries(Object.values(links).map((link) => [link.courseworkId, 'TURNED_IN'])) });
  await writeGrades({ db, google, studentId: STUDENT, change });
  const rows = Object.fromEntries([...db.store.keys()]
    .filter((key) => key.startsWith('classroomGradeSyncs/'))
    .map((key) => db.data(key))
    .map((row) => [row.publicationId, [row.status, row.stage, row.grade, row.classroomGrade, row.returnedToStudent, row.sectionLabel ?? null]]));
  const readOf = (prefix) => db.reads.filter((read) => read.kind === 'doc' && read.path.startsWith(prefix)).map((read) => read.path);
  return {
    calls: google.calls.map((call) => `${call.step} ${call.courseWorkId}`),
    rows,
    receipt: db.data(`grades/${STUDENT}`).classroomSectionSyncStatusByAssignment ?? null,
    assignmentReads: [...new Set(readOf('assignments/'))].sort(),
    gradeReads: readOf(`grades/${STUDENT}`).length,
    linkQueries: db.reads.filter((read) => read.kind === 'query' && read.collection === 'classroomLinks'),
  };
}

const sent = (assignmentId, sectionKey) => [`list ${assignmentId}-${sectionKey}`, `patch ${assignmentId}-${sectionKey}`];
const returned = (assignmentId, sectionKey) => [...sent(assignmentId, sectionKey), `return ${assignmentId}-${sectionKey}`];

/* --- the same pushes, before and after ------------------------------------ */

const scenarios = [
  {
    name: 'a section column, the student linked: the completed Warm-Up is sent and returned',
    assignments: { A1: assignment() },
    links: { 'A1-warmup': sectionLink('A1', 'warmup'), 'A1-classwork': sectionLink('A1', 'classwork') },
    change: completeWarmup('A1'),
    calls: returned('A1', 'warmup'),
    rows: { 'A1-warmup': ['synced', 'final-complete', 100, 50, true, 'Warm-Up'] },
    receipt: ['A1'],
    assignmentReads: ['assignments/A1'],
  },
  {
    name: 'a section column, the student not linked to the course: nothing is sent and the row says why',
    assignments: { A1: assignment() },
    links: { 'A1-warmup': sectionLink('A1', 'warmup') },
    rosterLinks: {},
    change: completeWarmup('A1'),
    calls: [],
    rows: { 'A1-warmup': ['skipped-unlinked', 'final-complete', 100, 50, false, 'Warm-Up'] },
    receipt: [],
    assignmentReads: ['assignments/A1'],
  },
  {
    name: 'a whole-assignment publication only: the section trigger sends nothing',
    assignments: { A2: assignment() },
    links: { 'A2-whole': wholeLink('A2') },
    change: completeWarmup('A2'),
    calls: [],
    rows: {},
    receipt: [],
    assignmentReads: ['assignments/A2'],
  },
  {
    name: 'an assignment not published to Classroom: nothing is sent',
    assignments: { A3: assignment() },
    links: {},
    change: completeWarmup('A3'),
    calls: [],
    rows: {},
    receipt: [],
    assignmentReads: ['assignments/A3'],
  },
  {
    name: 'a section column with passback turned off: nothing is sent',
    assignments: { A4: assignment() },
    links: { 'A4-warmup': sectionLink('A4', 'warmup', { sectionGradePassbackEnabled: false }) },
    change: completeWarmup('A4'),
    calls: [],
    rows: {},
    receipt: [],
    assignmentReads: ['assignments/A4'],
  },
  {
    name: 'a section column Classroom has not released yet: nothing is sent',
    assignments: { A5: assignment() },
    links: { 'A5-warmup': sectionLink('A5', 'warmup', { publishAt: iso(2 * DAY) }) },
    change: completeWarmup('A5'),
    calls: [],
    rows: {},
    receipt: [],
    assignmentReads: ['assignments/A5'],
  },
  {
    name: 'a section column whose section has no questions: the row says so, with the column\'s own label',
    assignments: { A6: assignment() },
    links: { 'A6-practice': sectionLink('A6', 'practice') },
    change: completeWarmup('A6'),
    calls: [],
    rows: { 'A6-practice': ['invalid-section-publication', undefined, undefined, undefined, undefined, 'practice column'] },
    receipt: [],
    assignmentReads: ['assignments/A6'],
  },
  {
    name: 'links to an assignment that is gone: nothing is sent',
    assignments: {},
    links: { 'A7-warmup': sectionLink('A7', 'warmup') },
    change: completeWarmup('A7'),
    calls: [],
    rows: {},
    receipt: [],
    assignmentReads: ['assignments/A7'],
  },
  {
    name: 'a write that changes no grade: nothing is read or sent',
    assignments: { A1: assignment() },
    links: { 'A1-warmup': sectionLink('A1', 'warmup') },
    grades: { gradesByAssignment: { A1: { 0: { status: 'correct', totalAttempts: 1 } } } },
    change: (grades) => ({ ...grades, lastSeenAt: 'now', gradesByAssignment: structuredClone(grades.gradesByAssignment) }),
    calls: [],
    rows: {},
    receipt: [],
    assignmentReads: [],
  },
  {
    name: 'several assignments in one write: each is read and sent as before',
    assignments: { A1: assignment(), A2: assignment(), A3: assignment(), A8: assignment() },
    links: {
      'A1-warmup': sectionLink('A1', 'warmup'),
      'A2-whole': wholeLink('A2'),
      'A8-warmup': sectionLink('A8', 'warmup', { courseworkId: 'A8-warmup', maxPoints: 10 }),
    },
    change: (grades) => [completeWarmup('A1'), completeWarmup('A2'), completeWarmup('A3'), completeWarmup('A8')]
      .reduce((data, step) => step(data), grades),
    calls: [...returned('A1', 'warmup'), ...returned('A8', 'warmup')],
    rows: {
      'A1-warmup': ['synced', 'final-complete', 100, 50, true, 'Warm-Up'],
      'A8-warmup': ['synced', 'final-complete', 100, 10, true, 'Warm-Up'],
    },
    receipt: ['A1', 'A8'],
    assignmentReads: ['assignments/A1', 'assignments/A2', 'assignments/A3', 'assignments/A8'],
  },
];

for (const scenario of scenarios) {
  test(`same pushes: ${scenario.name}`, async () => {
    const result = await runScenario(scenario);
    assert.deepEqual(result.calls, scenario.calls, 'the Classroom calls');
    assert.deepEqual(result.rows, scenario.rows, 'the rows written');
    assert.deepEqual(Object.keys(result.receipt || {}).sort(), scenario.receipt, 'the student\'s receipt');
  });
}

/* --- what is read --------------------------------------------------------- */

test('reads: the same assignments as before, and one link query per assignment, returning the same links', async () => {
  for (const scenario of scenarios) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runScenario(scenario);
    assert.deepEqual(result.assignmentReads, scenario.assignmentReads, `${scenario.name}: the assignments read`);
    // Asked once for every assignment the trigger got as far as asking about,
    // and answered with every link of that assignment, as before.
    for (const query of result.linkQueries) {
      const assignmentId = query.filters[0].value;
      assert.deepEqual(query.filters, [{ field: 'assignmentId', value: assignmentId }]);
      const links = Object.entries(scenario.links).filter(([, link]) => link.assignmentId === assignmentId).map(([id]) => id).sort();
      assert.deepEqual(query.returned, links, `${scenario.name}: the links returned for ${assignmentId}`);
    }
    assert.equal(new Set(result.linkQueries.map((query) => query.filters[0].value)).size, result.linkQueries.length, 'one query per assignment');
  }
});

test('reads: the link query selects only the fields the trigger reads, and every field it reads', async () => {
  const several = scenarios.find((scenario) => scenario.name.startsWith('several assignments'));
  const result = await runScenario(several);
  assert.deepEqual(result.linkQueries.map((query) => query.filters[0].value), ['A1', 'A2', 'A3', 'A8']);
  const selected = result.linkQueries[0].fields.map((segments) => segments.join('.')).sort();
  assert.ok(!selected.includes('launchUrl') && !selected.includes('materials') && !selected.includes('title'), 'not the launch link, materials or title');

  // The trigger reads a publication as `publication.<field>`, and so do the
  // two helpers that take one.
  const section = readFileSync(new URL('../../functions/classroomSectionEntry.js', import.meta.url), 'utf8');
  const readers = [
    region(section, 'const syncSectionGradeToClassroom = onDocumentWritten(', 'const queueClassroomSectionGradeCheckpoints', 'section passback'),
    region(section, 'function sectionPublicationReleased(', '\n}\n', 'sectionPublicationReleased'),
    readFileSync(new URL('../../functions/lib/classroomSectionGrade.js', import.meta.url), 'utf8'),
  ];
  const used = [...new Set(readers.flatMap((text) => [...text.matchAll(/\bpublication\??\.(\w+)/g)].map((match) => match[1])))].sort();
  assert.ok(used.length >= 10, `found the fields the trigger reads: ${used.join(', ')}`);
  assert.deepEqual(used.filter((field) => !selected.includes(field)), [], 'a field read but not selected would be read as missing');
  assert.deepEqual(selected.filter((field) => !used.includes(field)), [], 'and nothing is selected that is not read');
});
