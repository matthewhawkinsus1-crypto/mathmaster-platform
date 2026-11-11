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
