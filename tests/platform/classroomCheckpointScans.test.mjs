// THE CLASSROOM CHECKPOINT SCHEDULERS READ THEIR OWN PUBLICATIONS, NOT ALL OF THEM.
//
// Issue #545, Nov 11, 2026. Every 5 minutes queueClassroomGradeCheckpoints
// (functions/index.js) and queueClassroomSectionGradeCheckpoints
// (functions/classroomSectionEntry.js) each read every published
// classroomLinks document (480) and dropped the other kind themselves: the
// whole-assignment scheduler kept 35, the section one 445. The whole-assignment
// scheduler read those links in full (1.1 MB) and its 25 assignments in full
// (2.6 MB; one was 1.4 MB) to decide on four dates and a class list. One run
// of the two read 1,172 documents.
//
// Each now asks Firestore for its own kind (status == published plus
// gradePassbackEnabled == true, or publicationKind == "section"), and the
// whole-assignment scheduler reads only the link and assignment fields it
// decides on: 692 documents a run, the whole scheduler's bytes about 0.1 MB.
// The two queries now read disjoint sets, so sharing one discovery would save
// nothing more. Deadline handling, the state documents and the queue are
// unchanged; the cases below run both schedulers through each of them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkpointSchedulerFirestore } from './helpers/checkpointSchedulerFirestore.mjs';
import { region } from './helpers/sourceContract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromFunctions = createRequire(path.join(root, 'functions/index.js'));
const read = (file) => readFileSync(path.join(root, file), 'utf8');

// Both entries take getFirestore when their handlers run; the stand-in hands
// out whichever fake the running test set.
let currentDb = null;
requireFromFunctions('firebase-admin/firestore').getFirestore = () => currentDb;
const run = async (db, which) => {
  currentDb = db;
  const scheduler = which === 'section'
    ? requireFromFunctions('./classroomSectionEntry.js').cloudFunctions.queueClassroomSectionGradeCheckpoints
    : requireFromFunctions('./index.js').queueClassroomGradeCheckpoints;
  await scheduler.run({ scheduleTime: new Date().toISOString() });
  return db;
};

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const QUESTIONS = [{ prompt: 'q'.repeat(4096) }];

const linkRead = (db) => db.reads.find((r) => r.kind === 'query' && r.collection === 'classroomLinks');
const assignmentRead = (db) => db.reads.find((r) => r.kind === 'getAll');
const fieldNames = (fields) => (fields || []).map((segments) => segments.join('.')).sort();
const queuedBy = (db) => db.queued
  .map((q) => `${q.data.assignmentId} ${q.data.reason} ${q.data.studentId}`)
  .sort();

/* --- the whole-assignment scheduler ------------------------------------- */

test('the whole-assignment scheduler asks Firestore for its own publications and reads only dates and classes', async () => {
  const lateA1 = iso(-2 * DAY);
  const db = await run(checkpointSchedulerFirestore({
    classroomLinks: {
      on: { status: 'published', gradePassbackEnabled: true, courseworkId: 'cw-1', assignmentId: 'A1', launchPayload: 'x'.repeat(2048) },
      off: { status: 'published', gradePassbackEnabled: false, courseworkId: 'cw-2', assignmentId: 'A2' },
      notPosted: { status: 'published', gradePassbackEnabled: true, assignmentId: 'A3' },
      failed: { status: 'failed', gradePassbackEnabled: true, courseworkId: 'cw-4', assignmentId: 'A4' },
      section: { status: 'published', publicationKind: 'section', gradePassbackEnabled: false, sectionGradePassbackEnabled: true, courseworkId: 'cw-5', assignmentId: 'A5' },
    },
    assignments: {
      A1: { dueAt: iso(-3 * DAY), lateDueAt: lateA1, assignedClassIds: ['c1', 'c2'], questions: QUESTIONS },
      A2: { dueAt: iso(-3 * DAY), assignedClassIds: ['c1'], questions: QUESTIONS },
      A3: { dueAt: iso(-3 * DAY), assignedClassIds: ['c1'], questions: QUESTIONS },
      A4: { dueAt: iso(-3 * DAY), assignedClassIds: ['c1'], questions: QUESTIONS },
      A5: { dueAt: iso(-3 * DAY), assignedClassIds: ['c1'], questions: QUESTIONS },
    },
    grades: {
      s1: { classId: 'c1' }, s2: { classId: 'c1' }, s3: { classId: 'c2' }, s4: { classId: 'c3' },
    },
  }));

  const links = linkRead(db);
  assert.deepEqual(links.filters, [
    { field: 'status', op: '==', value: 'published' },
    { field: 'gradePassbackEnabled', op: '==', value: true },
  ]);
  assert.deepEqual(fieldNames(links.fields), ['assignmentId', 'courseworkId', 'gradePassbackEnabled']);

  const assignments = assignmentRead(db);
  assert.deepEqual(assignments.paths, ['assignments/A1']);
  assert.deepEqual(fieldNames(assignments.fields), ['assignedClassIds', 'dueAt', 'dueDate', 'lateDueAt', 'lateDueDate']);

  // The final checkpoint is still owed to every student of both classes.
  assert.deepEqual(queuedBy(db), ['A1 final-deadline s1', 'A1 final-deadline s2', 'A1 final-deadline s3']);
  const state = db.sets.find((s) => s.path === 'classroomGradeCheckpointState/A1');
  assert.equal(state.data.finalDueAt, lateA1);
  assert.equal(state.data.finalQueuedStudents, 3);
  assert.equal(state.data.reconcileVersion, 2);
});

test('every deadline path of the whole-assignment scheduler still fires through the narrower reads', async () => {
  const late = iso(-1 * DAY);
  const due = iso(-3 * DAY);
  const link = (assignmentId) => ({ status: 'published', gradePassbackEnabled: true, courseworkId: `cw-${assignmentId}`, assignmentId });
  const db = await run(checkpointSchedulerFirestore({
    classroomLinks: {
      due: link('DUE'), final: link('FINAL'), fresh: link('FRESH'), done: link('DONE'), old: link('OLD'),
    },
    assignments: {
      DUE: { dueAt: iso(-1 * HOUR), lateDueAt: iso(2 * DAY), assignedClassIds: ['c1'], questions: QUESTIONS },
      FINAL: { dueDate: iso(-3 * DAY), lateDueDate: late, assignedClassIds: ['c1'], questions: QUESTIONS },
      FRESH: { dueAt: iso(7 * DAY), assignedClassIds: ['c2'], questions: QUESTIONS },
      DONE: { dueAt: due, lateDueAt: late, assignedClassIds: ['c1'], questions: QUESTIONS },
      OLD: { dueAt: iso(-30 * DAY), lateDueAt: iso(-20 * DAY), assignedClassIds: ['c1'], questions: QUESTIONS },
    },
    classroomGradeCheckpointState: {
      // Both checkpoints already queued, at the times they were owed.
      DONE: { reconcileVersion: 2, dueQueuedAt: due, dueAt: due, finalQueuedAt: late, finalDueAt: late },
      // A student whose own final time has come, and one still waiting (H-116).
      OLD: { reconcileVersion: 2, pendingStudentFinalAt: { s1: iso(-1 * HOUR), s2: iso(1 * DAY) } },
    },
    grades: { s1: { classId: 'c1' }, s2: { classId: 'c1' }, s3: { classId: 'c2' } },
  }));

  assert.deepEqual(queuedBy(db), [
    'DUE due-checkpoint s1', 'DUE due-checkpoint s2',
    'FINAL final-deadline s1', 'FINAL final-deadline s2',
    'FRESH initial-reconcile s3',
    'OLD final-deadline s1',
  ]);
  const statePaths = db.sets.map((s) => s.path).sort();
  assert.deepEqual(statePaths, [
    'classroomGradeCheckpointState/DUE',
    'classroomGradeCheckpointState/FINAL',
    'classroomGradeCheckpointState/FRESH',
  ]);
  // The woken student's entry is retired; the one still waiting stays.
  assert.deepEqual(db.updates.filter((u) => u.path === 'classroomGradeCheckpointState/OLD').map((u) => u.field),
    ['pendingStudentFinalAt.s1']);
});

/* --- the section scheduler ---------------------------------------------- */

test('the section scheduler asks Firestore for section publications and still owes every checkpoint', async () => {
  const link = (assignmentId, extra = {}) => ({
    status: 'published', publicationKind: 'section', gradePassbackEnabled: false,
    sectionGradePassbackEnabled: true, courseworkId: `cw-${assignmentId}`, assignmentId, ...extra,
  });
  const db = await run(checkpointSchedulerFirestore({
    classroomLinks: {
      due: link('DUE'), final: link('FINAL'), release: link('REL'), old: link('OLD'),
      whole: { status: 'published', gradePassbackEnabled: true, courseworkId: 'cw-w', assignmentId: 'WHOLE' },
    },
    assignments: {
      DUE: { dueAt: iso(-1 * HOUR), lateDueAt: iso(2 * DAY), assignedClassIds: ['c1'], questions: QUESTIONS },
      FINAL: { dueAt: iso(-3 * DAY), lateDueAt: iso(-1 * DAY), assignedClassIds: ['c1'], questions: QUESTIONS },
      REL: { releaseAt: iso(-1 * HOUR), dueAt: iso(5 * DAY), assignedClassIds: ['c2'], questions: QUESTIONS },
      OLD: { dueAt: iso(-30 * DAY), lateDueAt: iso(-20 * DAY), assignedClassIds: ['c1'], questions: QUESTIONS },
      WHOLE: { dueAt: iso(-1 * HOUR), assignedClassIds: ['c1'], questions: QUESTIONS },
    },
    classroomSectionGradeCheckpointState: {
      OLD: { pendingStudentDueAt: { s2: iso(-1 * HOUR) } },
    },
    grades: { s1: { classId: 'c1' }, s2: { classId: 'c1' }, s3: { classId: 'c2' } },
  }), 'section');

  assert.deepEqual(linkRead(db).filters, [
    { field: 'status', op: '==', value: 'published' },
    { field: 'publicationKind', op: '==', value: 'section' },
  ]);
  assert.deepEqual(assignmentRead(db).paths.sort(),
    ['assignments/DUE', 'assignments/FINAL', 'assignments/OLD', 'assignments/REL']);
  assert.deepEqual(queuedBy(db), [
    'DUE due-checkpoint s1', 'DUE due-checkpoint s2',
    'FINAL final-deadline s1', 'FINAL final-deadline s2',
    'OLD due-checkpoint s2',
    'REL initial-reconcile s3',
  ]);
});

/* --- the same publications as the filters they replace ------------------ */

// Every combination of the fields the two filters read, with the flags as the
// writers store them (below): each scheduler picks out exactly the
// publications its old in-code filter kept from all published links.
const combinations = () => {
  const links = {};
  const assignments = {};
  let n = 0;
  for (const status of ['published', 'failed', 'removed', 'publishing']) {
    for (const publicationKind of [undefined, 'section']) {
      for (const gradePassbackEnabled of [true, false]) {
        for (const sectionGradePassbackEnabled of [undefined, true, false]) {
          for (const courseworkId of [undefined, 'cw']) {
            n += 1;
            const assignmentId = `A${n}`;
            links[`link${n}`] = Object.fromEntries(Object.entries({
              status, publicationKind, gradePassbackEnabled, sectionGradePassbackEnabled, courseworkId, assignmentId,
            }).filter(([, value]) => value !== undefined));
            assignments[assignmentId] = { dueAt: iso(7 * DAY), assignedClassIds: ['c1'] };
          }
        }
      }
    }
  }
  return { links, assignments };
};

test('each scheduler keeps exactly the publications its old in-code filter kept', async () => {
  const { links, assignments } = combinations();
  const published = Object.values(links).filter((link) => link.status === 'published');
  const oldWhole = published
    .filter((link) => link.courseworkId && link.gradePassbackEnabled !== false)
    .map((link) => `assignments/${link.assignmentId}`).sort();
  const oldSection = published
    .filter((link) => link.publicationKind === 'section' && link.courseworkId && link.sectionGradePassbackEnabled !== false)
    .map((link) => `assignments/${link.assignmentId}`).sort();
  assert.ok(oldWhole.length > 0 && oldSection.length > 0);

  const whole = await run(checkpointSchedulerFirestore({ classroomLinks: links, assignments, grades: {} }));
  assert.deepEqual(assignmentRead(whole).paths.sort(), oldWhole);
  const section = await run(checkpointSchedulerFirestore({ classroomLinks: links, assignments, grades: {} }), 'section');
  assert.deepEqual(assignmentRead(section).paths.sort(), oldSection);
});

// The whole-assignment query's `gradePassbackEnabled == true` is the old
// `!== false` only while every publication stores the flag as a boolean, as all
// 488 links did on Nov 11, 2026. A writer that left it out would make the
// scheduler skip that publication's checkpoints without a sign.
test('every writer of a Classroom publication stores gradePassbackEnabled as a boolean', () => {
  const index = read('functions/index.js');
  const publish = region(index, 'async function publishOneCourse({', 'const claim = await claimPublication(linkRef, baseRecord);', 'publishOneCourse');
  assert.match(publish, /const baseRecord = \{[^}]*\bgradePassbackEnabled: gradePassbackEnabled !== false,/);
  // The claim writes that record before finishPublication can mark it published.
  const claim = region(index, 'async function claimPublication(ref, baseRecord) {', 'async function finishPublication(', 'claimPublication');
  assert.match(claim, /const patch = \{\s*\.\.\.baseRecord,/);
  const force = region(index, 'exports.forceRepublishAssignmentToClassrooms = onCall(', 'status: "published",', 'forceRepublishAssignmentToClassrooms');
  assert.match(force, /const gradePassbackEnabled = request\.data\?\.gradePassbackEnabled !== false\s*&& classroomPackage\?\.gradePassback\?\.enabled !== false;/);
  assert.match(force, /const update = \{[^}]*\n\s*gradePassbackEnabled,\n/);

  const section = read('functions/classroomSectionEntry.js');
  const sectionPublish = region(section, 'async function publishOneSection({', 'sectionKey: target.sectionKey,', 'publishOneSection');
  assert.match(sectionPublish, /publicationKind: "section",/);
  assert.match(sectionPublish, /gradePassbackEnabled: false,\s*sectionGradePassbackEnabled: gradePassbackEnabled !== false,/);
});

/* --- every link, a page at a time (lib/classroomCheckpointScan.js) ------- */

// The section scheduler read its links through one unordered limit(1000), so
// past 1,000 links (445 on Nov 11, 2026) it would have dropped classes'
// checkpoints without a sign. It reads them in document-id order, 1,000 a page,
// and says so in the log when a run nears its limits.
const scan = requireFromFunctions('./lib/classroomCheckpointScan.js');
const logger = requireFromFunctions('firebase-functions/logger');
const logs = [];
for (const level of ['warn', 'error']) logger[level] = (message, fields) => logs.push({ level, message, fields });
const sectionLink = (assignmentId) => ({
  status: 'published', publicationKind: 'section', gradePassbackEnabled: false,
  sectionGradePassbackEnabled: true, courseworkId: `cw-${assignmentId}`, assignmentId,
});
// Stored out of id order, so any order the scheduler reads in is its own.
const shuffled = (entries) => Object.fromEntries(entries.map((entry, index) => [index * 7919 % entries.length, entry]).sort(([a], [b]) => a - b).map(([, entry]) => entry));
const linkQueries = (db) => db.reads.filter((r) => r.kind === 'query' && r.collection === 'classroomLinks');

test('past 1,000 links the section scheduler still reads every one, in document-id order, and owes every class its checkpoint', async () => {
  logs.length = 0;
  const count = 1203;
  const ids = Array.from({ length: count }, (_, n) => `A${String(n).padStart(4, '0')}`);
  const db = await run(checkpointSchedulerFirestore({
    classroomLinks: shuffled([
      ...ids.map((assignmentId) => [`link-${assignmentId}`, sectionLink(assignmentId)]),
      ['link-whole', { status: 'published', gradePassbackEnabled: true, courseworkId: 'cw-w', assignmentId: 'WHOLE' }],
    ]),
    assignments: Object.fromEntries(ids.map((assignmentId) => [assignmentId, { dueAt: iso(-1 * HOUR), lateDueAt: iso(2 * DAY), assignedClassIds: ['c1'] }])),
    grades: { s1: { classId: 'c1' } },
  }), 'section');

  const pages = linkQueries(db);
  assert.deepEqual(pages.map((page) => [page.orderBy, page.limit, page.startAfter]), [
    ['__name__', 1000, null],
    ['__name__', 1000, 'link-A0999'],
  ]);
  for (const page of pages) {
    assert.deepEqual(page.filters, [
      { field: 'status', op: '==', value: 'published' },
      { field: 'publicationKind', op: '==', value: 'section' },
    ]);
  }
  const read = db.reads.filter((r) => r.kind === 'getAll' && r.paths[0]?.startsWith('assignments/'));
  assert.deepEqual(read.flatMap((r) => r.paths).sort(), ids.map((id) => `assignments/${id}`));
  assert.ok(read.every((r) => r.paths.length <= 100 && fieldNames(r.fields).includes('dueAt')), 'a hundred at a time, dates only');
  assert.equal(db.queued.length, count);
  assert.ok(db.queued.every((q) => q.data.reason === 'due-checkpoint' && q.data.studentId === 's1'));
  assert.deepEqual(logs, [], '1,203 links are not near the limits');
});

// No more reads than the single limit(1000) query it replaced, for every count
// that query served: one query, the same links.
test('below 1,000 links a run is still one query, reading exactly the links it read', async () => {
  for (const count of [0, 445, 999]) {
    const db = await run(checkpointSchedulerFirestore({
      classroomLinks: Object.fromEntries(Array.from({ length: count }, (_, n) => [`link-${String(n).padStart(4, '0')}`, sectionLink('A1')])),
      assignments: { A1: { dueAt: iso(7 * DAY), assignedClassIds: ['c1'] } },
      grades: {},
    }), 'section');
    assert.deepEqual(linkQueries(db).map((page) => [page.limit, page.startAfter]), [[1000, null]], `${count} links`);
  }
  // An exact multiple of a page costs one more query, which finds nothing.
  const full = await run(checkpointSchedulerFirestore({
    classroomLinks: Object.fromEntries(Array.from({ length: 1000 }, (_, n) => [`link-${String(n).padStart(4, '0')}`, sectionLink('A1')])),
    assignments: { A1: { dueAt: iso(7 * DAY), assignedClassIds: ['c1'] } },
    grades: {},
  }), 'section');
  assert.deepEqual(linkQueries(full).map((page) => page.startAfter), [null, 'link-0999']);
});

test('a run past 2,000 links warns, and one that stops at the page limit logs an error and still serves what it read', async () => {
  logs.length = 0;
  const many = (count, assignmentId) => Object.fromEntries(Array.from({ length: count }, (_, n) => [`link-${String(n).padStart(5, '0')}`, sectionLink(assignmentId)]));
  await run(checkpointSchedulerFirestore({
    classroomLinks: many(scan.CHECKPOINT_LINK_WARN_AT, 'BIG'),
    assignments: { BIG: { dueAt: iso(7 * DAY), assignedClassIds: ['c1'] } },
    grades: {},
  }), 'section');
  assert.deepEqual(logs.map((entry) => [entry.level, entry.message, entry.fields.links, entry.fields.concerns]), [
    ['warn', 'Section checkpoint scan is near its limits', scan.CHECKPOINT_LINK_WARN_AT, ['many-links']],
  ]);

  logs.length = 0;
  const limit = scan.CHECKPOINT_LINK_PAGE_SIZE * scan.CHECKPOINT_LINK_MAX_PAGES;
  const db = await run(checkpointSchedulerFirestore({
    classroomLinks: many(limit + 1, 'BIG'),
    assignments: { BIG: { dueAt: iso(-1 * HOUR), lateDueAt: iso(2 * DAY), assignedClassIds: ['c1'] } },
    grades: { s1: { classId: 'c1' } },
  }), 'section');
  assert.equal(linkQueries(db).length, scan.CHECKPOINT_LINK_MAX_PAGES);
  assert.deepEqual(logs.map((entry) => [entry.level, entry.message, entry.fields.links, entry.fields.pages, entry.fields.concerns]), [
    ['error', 'Section checkpoint scan stopped at its limit', limit, scan.CHECKPOINT_LINK_MAX_PAGES, ['stopped-at-page-limit']],
  ]);
  assert.deepEqual(queuedBy(db), ['BIG due-checkpoint s1'], 'what it read is still served');
});

test('a run that takes most of its time says so', async () => {
  logs.length = 0;
  const db = checkpointSchedulerFirestore({
    classroomLinks: { only: sectionLink('A1') },
    assignments: { A1: { dueAt: iso(7 * DAY), assignedClassIds: ['c1'] } },
    grades: {},
  });
  const realNow = Date.now;
  let first = true;
  // Every clock read after the scheduler's first is two minutes later.
  Date.now = () => {
    const value = realNow() + (first ? 0 : scan.CHECKPOINT_SLOW_RUN_MS);
    first = false;
    return value;
  };
  try {
    await run(db, 'section');
  } finally {
    Date.now = realNow;
  }
  assert.deepEqual(logs.map((entry) => [entry.level, entry.message, entry.fields.concerns]), [
    ['warn', 'Section checkpoint scan is near its limits', ['slow-run']],
  ]);
  assert.ok(logs[0].fields.elapsedMs >= scan.CHECKPOINT_SLOW_RUN_MS);
});

test('a page scan is complete unless it stopped at its last page with that page full', async () => {
  const links = (count) => Object.fromEntries(Array.from({ length: count }, (_, n) => [`l${String(n).padStart(3, '0')}`, { status: 'published', assignmentId: `A${n}` }]));
  const scanOf = async (count, maxPages) => scan.scanPublishedLinks(checkpointSchedulerFirestore({ classroomLinks: links(count) }), {
    filters: [['status', 'published']], fields: ['assignmentId'], pageSize: 10, maxPages,
  });
  const exact = await scanOf(20, 3);
  assert.deepEqual([exact.docs.length, exact.pages, exact.complete], [20, 3, true], 'a full last page is followed by an empty one');
  const cut = await scanOf(31, 3);
  assert.deepEqual([cut.docs.length, cut.pages, cut.complete], [30, 3, false]);
  assert.deepEqual(cut.docs.map((doc) => doc.id), Object.keys(links(30)), 'in document-id order, each once');
  assert.deepEqual(scan.checkpointScanConcerns({ links: 30, complete: false }), ['stopped-at-page-limit']);
  assert.deepEqual(scan.checkpointScanConcerns({ links: scan.CHECKPOINT_LINK_WARN_AT - 1, complete: true }), []);
});

test('getAll in batches reads every reference once, in order, with the field mask', async () => {
  const db = checkpointSchedulerFirestore({ assignments: Object.fromEntries(Array.from({ length: 250 }, (_, n) => [`A${n}`, { dueAt: 'x', questions: QUESTIONS }])) });
  const refs = Array.from({ length: 250 }, (_, n) => db.doc(`assignments/A${n}`));
  const snapshots = await scan.getAllInBatches(db, refs, { fieldMask: ['dueAt'] });
  assert.deepEqual(snapshots.map((snapshot) => snapshot.id), refs.map((ref) => ref.id));
  assert.deepEqual(db.reads.map((r) => r.paths.length), [100, 100, 50]);
  assert.deepEqual(snapshots[0].data(), { dueAt: 'x' }, 'the mask is applied');
  assert.deepEqual(await scan.getAllInBatches(db, []), [], 'nothing to read, nothing asked');
});

// The section scheduler read its ~81 state documents one at a time, most of a
// run's 3.5 s. It reads them a hundred at a time, up front: a run writes only
// each assignment's own state, so it decides exactly as before.
test('the section scheduler reads its state documents a hundred at a time, and decides as before', async () => {
  const ids = Array.from({ length: 150 }, (_, n) => `S${String(n).padStart(3, '0')}`);
  const due = iso(-1 * HOUR);
  const db = await run(checkpointSchedulerFirestore({
    classroomLinks: {
      ...Object.fromEntries(ids.map((id) => [`link-${id}`, sectionLink(id)])),
      'link-GONE': sectionLink('GONE'),
    },
    assignments: Object.fromEntries(ids.map((id) => [id, { dueAt: due, lateDueAt: iso(2 * DAY), assignedClassIds: ['c1'] }])),
    // Half of them had their due checkpoint queued already, at this due time.
    classroomSectionGradeCheckpointState: Object.fromEntries(ids.filter((_, n) => n % 2 === 0).map((id) => [id, { dueQueuedAt: due, dueAt: due }])),
    grades: { s1: { classId: 'c1' } },
  }), 'section');

  const statePath = (id) => `classroomSectionGradeCheckpointState/${id}`;
  const stateReads = db.reads.filter((r) => String(r.path || r.paths?.[0] || '').startsWith('classroomSectionGradeCheckpointState/'));
  assert.deepEqual(stateReads.map((r) => [r.kind, r.paths?.length]), [['getAll', 100], ['getAll', 50]], 'never one at a time');
  assert.deepEqual(stateReads.flatMap((r) => r.paths).sort(), ids.map(statePath), 'each once; none for an assignment that is gone');
  assert.deepEqual(queuedBy(db), ids.filter((_, n) => n % 2 === 1).map((id) => `${id} due-checkpoint s1`).sort(),
    'only the half not queued before is owed its checkpoint');
  assert.deepEqual(db.sets.map((s) => s.path).sort(), ids.filter((_, n) => n % 2 === 1).map(statePath));
});

/* --- the whole-assignment scheduler, the same way ------------------------ */

// queueClassroomGradeCheckpoints had the same unordered limit(1000) (35 links
// on Nov 11, 2026) and read its state documents one at a time (25). It now
// reads its links with the same paged scan and the same warnings, and its
// assignments and state documents a hundred at a time. It reads the same
// documents and decides as before: the whole-assignment tests above pass
// unchanged.
const wholeLink = (assignmentId) => ({ status: 'published', gradePassbackEnabled: true, courseworkId: `cw-${assignmentId}`, assignmentId });
const WHOLE_FILTERS = [
  { field: 'status', op: '==', value: 'published' },
  { field: 'gradePassbackEnabled', op: '==', value: true },
];
const stateReadsOf = (db) => db.reads.filter((r) => String(r.path || r.paths?.[0] || '').startsWith('classroomGradeCheckpointState/'));
// What Firestore bills: a document fetched, or each document a query returns
// (one for a query that returns none).
const billedReads = (db, collection) => db.reads
  .filter((r) => (r.collection || String(r.path || r.paths?.[0] || '').split('/')[0]) === collection)
  .reduce((total, r) => total + (r.kind === 'getAll' ? r.paths.length : r.kind === 'doc' ? 1 : Math.max(1, r.returned)), 0);

test('past 1,000 links the whole-assignment scheduler still reads every one, in document-id order, and owes every class its checkpoint', async () => {
  logs.length = 0;
  const count = 1203;
  const ids = Array.from({ length: count }, (_, n) => `A${String(n).padStart(4, '0')}`);
  const db = await run(checkpointSchedulerFirestore({
    classroomLinks: shuffled([
      ...ids.map((assignmentId) => [`link-${assignmentId}`, wholeLink(assignmentId)]),
      ['link-section', sectionLink('SECTION')],
    ]),
    assignments: Object.fromEntries(ids.map((assignmentId) => [assignmentId, { dueAt: iso(-1 * HOUR), lateDueAt: iso(2 * DAY), assignedClassIds: ['c1'] }])),
    grades: { s1: { classId: 'c1' } },
  }));

  const pages = linkQueries(db);
  assert.deepEqual(pages.map((page) => [page.orderBy, page.limit, page.startAfter]), [
    ['__name__', 1000, null],
    ['__name__', 1000, 'link-A0999'],
  ]);
  for (const page of pages) {
    assert.deepEqual(page.filters, WHOLE_FILTERS);
    assert.deepEqual(fieldNames(page.fields), ['assignmentId', 'courseworkId', 'gradePassbackEnabled']);
  }
  const read = db.reads.filter((r) => r.kind === 'getAll' && r.paths[0]?.startsWith('assignments/'));
  assert.deepEqual(read.flatMap((r) => r.paths).sort(), ids.map((id) => `assignments/${id}`));
  assert.ok(read.every((r) => r.paths.length <= 100), 'a hundred at a time');
  assert.ok(read.every((r) => fieldNames(r.fields).join() === 'assignedClassIds,dueAt,dueDate,lateDueAt,lateDueDate'), 'dates and classes only');
  assert.equal(db.queued.length, count);
  assert.ok(db.queued.every((q) => q.data.reason === 'due-checkpoint' && q.data.studentId === 's1'));
  assert.deepEqual(logs, [], '1,203 links are not near the limits');
});

// No more reads than the single limit(1000) query it replaced, for every count
// that query served: one query, the same links.
test('below 1,000 links the whole-assignment scheduler still makes one query, reading exactly the links it read', async () => {
  for (const count of [0, 35, 999]) {
    const db = await run(checkpointSchedulerFirestore({
      classroomLinks: Object.fromEntries(Array.from({ length: count }, (_, n) => [`link-${String(n).padStart(4, '0')}`, wholeLink('A1')])),
      assignments: { A1: { dueAt: iso(7 * DAY), assignedClassIds: ['c1'] } },
      grades: {},
    }));
    assert.deepEqual(linkQueries(db).map((page) => [page.limit, page.startAfter]), [[1000, null]], `${count} links`);
    assert.equal(billedReads(db, 'classroomLinks'), Math.max(1, count), `${count} links`);
  }
  // An exact multiple of a page costs one more query, which finds nothing.
  const full = await run(checkpointSchedulerFirestore({
    classroomLinks: Object.fromEntries(Array.from({ length: 1000 }, (_, n) => [`link-${String(n).padStart(4, '0')}`, wholeLink('A1')])),
    assignments: { A1: { dueAt: iso(7 * DAY), assignedClassIds: ['c1'] } },
    grades: {},
  }));
  assert.deepEqual(linkQueries(full).map((page) => page.startAfter), [null, 'link-0999']);
});

test('a whole-assignment run past 2,000 links warns, and one that stops at the page limit logs an error and still serves what it read', async () => {
  logs.length = 0;
  const many = (count, assignmentId) => Object.fromEntries(Array.from({ length: count }, (_, n) => [`link-${String(n).padStart(5, '0')}`, wholeLink(assignmentId)]));
  await run(checkpointSchedulerFirestore({
    classroomLinks: many(scan.CHECKPOINT_LINK_WARN_AT, 'BIG'),
    assignments: { BIG: { dueAt: iso(7 * DAY), assignedClassIds: ['c1'] } },
    grades: {},
  }));
  assert.deepEqual(logs.map((entry) => [entry.level, entry.message, entry.fields.links, entry.fields.concerns]), [
    ['warn', 'Whole-assignment checkpoint scan is near its limits', scan.CHECKPOINT_LINK_WARN_AT, ['many-links']],
  ]);

  logs.length = 0;
  const limit = scan.CHECKPOINT_LINK_PAGE_SIZE * scan.CHECKPOINT_LINK_MAX_PAGES;
  const db = await run(checkpointSchedulerFirestore({
    classroomLinks: many(limit + 1, 'BIG'),
    assignments: { BIG: { dueAt: iso(-1 * HOUR), lateDueAt: iso(2 * DAY), assignedClassIds: ['c1'] } },
    grades: { s1: { classId: 'c1' } },
  }));
  assert.equal(linkQueries(db).length, scan.CHECKPOINT_LINK_MAX_PAGES);
  assert.deepEqual(logs.map((entry) => [entry.level, entry.message, entry.fields.links, entry.fields.pages, entry.fields.concerns]), [
    ['error', 'Whole-assignment checkpoint scan stopped at its limit', limit, scan.CHECKPOINT_LINK_MAX_PAGES, ['stopped-at-page-limit']],
  ]);
  assert.deepEqual(queuedBy(db), ['BIG due-checkpoint s1'], 'what it read is still served');
});

// The whole-assignment scheduler has the 60 s default timeout, so it warns at
// two fifths of it, as the section scheduler warns at 120 s of its 300 s.
const WHOLE_SLOW_RUN_MS = 24_000;
test('a whole-assignment run that takes two fifths of its time says so, and a shorter one does not', async () => {
  const runFor = async (elapsedMs) => {
    logs.length = 0;
    const db = checkpointSchedulerFirestore({
      classroomLinks: { only: wholeLink('A1') },
      assignments: { A1: { dueAt: iso(7 * DAY), assignedClassIds: ['c1'] } },
      grades: {},
    });
    const realNow = Date.now;
    let first = true;
    // Every clock read after the scheduler's first is `elapsedMs` later.
    Date.now = () => {
      const value = realNow() + (first ? 0 : elapsedMs);
      first = false;
      return value;
    };
    try {
      await run(db);
    } finally {
      Date.now = realNow;
    }
    return logs.map((entry) => [entry.level, entry.message, entry.fields.concerns]);
  };
  assert.deepEqual(await runFor(WHOLE_SLOW_RUN_MS), [['warn', 'Whole-assignment checkpoint scan is near its limits', ['slow-run']]]);
  assert.ok(logs[0].fields.elapsedMs >= WHOLE_SLOW_RUN_MS);
  assert.deepEqual(await runFor(WHOLE_SLOW_RUN_MS - 1000), []);
});

// It read the state document of each assignment it could owe a checkpoint,
// one at a time: one that exists, with a class and a due or final time. It
// reads exactly those a hundred at a time, up front: a run writes only each
// assignment's own state, so it decides exactly as before.
test('the whole-assignment scheduler reads its state documents a hundred at a time, the same ones, and decides as before', async () => {
  const ids = Array.from({ length: 150 }, (_, n) => `W${String(n).padStart(3, '0')}`);
  const due = iso(-1 * HOUR);
  const db = await run(checkpointSchedulerFirestore({
    classroomLinks: {
      ...Object.fromEntries(ids.map((id) => [`link-${id}`, wholeLink(id)])),
      // Gone, with no class, with no due or final time: no checkpoint, no state read.
      'link-GONE': wholeLink('GONE'),
      'link-NOCLASS': wholeLink('NOCLASS'),
      'link-NODATE': wholeLink('NODATE'),
    },
    assignments: {
      ...Object.fromEntries(ids.map((id) => [id, { dueAt: due, lateDueAt: iso(2 * DAY), assignedClassIds: ['c1'] }])),
      NOCLASS: { dueAt: due, assignedClassIds: [] },
      NODATE: { assignedClassIds: ['c1'] },
    },
    // Half of them had their due checkpoint queued already, at this due time.
    classroomGradeCheckpointState: Object.fromEntries(ids.filter((_, n) => n % 2 === 0).map((id) => [id, { reconcileVersion: 2, dueQueuedAt: due, dueAt: due }])),
    grades: { s1: { classId: 'c1' } },
  }));

  const statePath = (id) => `classroomGradeCheckpointState/${id}`;
  const stateReads = stateReadsOf(db);
  assert.deepEqual(stateReads.map((r) => [r.kind, r.paths?.length]), [['getAll', 100], ['getAll', 50]], 'never one at a time');
  assert.deepEqual(stateReads.flatMap((r) => r.paths).sort(), ids.map(statePath), 'each once, and only where a checkpoint can be owed');
  assert.equal(billedReads(db, 'classroomGradeCheckpointState'), ids.length);
  assert.equal(billedReads(db, 'assignments'), ids.length + 3, 'each linked assignment once');
  assert.deepEqual(queuedBy(db), ids.filter((_, n) => n % 2 === 1).map((id) => `${id} due-checkpoint s1`).sort(),
    'only the half not queued before is owed its checkpoint');
  assert.deepEqual(db.sets.map((s) => s.path).sort(), ids.filter((_, n) => n % 2 === 1).map(statePath));
});
