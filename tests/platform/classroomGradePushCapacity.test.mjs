// CLASSROOM GRADE PUSHES HAVE THE ROOM THEY NEED.
//
// Oct 14, 2026, right after #479 raised every function to 512 MiB, the six
// Google Classroom checkpoints that had been owed since Oct 7 went out. Then:
//
//   - queueClassroomSectionGradeCheckpoints no longer ran out of memory but ran
//     past its 60 s limit. It read every published assignment in full (one is
//     1.6 MB) and every grade document of each class in full (about 300 KB
//     each) only to flag those documents.
//   - The 314 flags it wrote woke syncGradeToClassroom and
//     syncSectionGradeToClassroom once per student. At 80 events an instance
//     both were killed at 512 MiB (512-537 MiB in use), dropping every event
//     the instance held.
//
// The scheduler and the teacher's "Reconcile section grades" now read only
// references and the fields they decide on. The two triggers take at most 20
// events an instance with 1 GiB.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromFunctions = createRequire(path.join(root, 'functions/classroomSectionEntry.js'));

// The entry takes getFirestore when it is first loaded (listing the deployable
// functions loads it too), so the stand-in goes in before anything else and
// hands out whichever fake the running test set.
let currentDb = null;
requireFromFunctions('firebase-admin/firestore').getFirestore = () => currentDb;

/* --- what the CLI will deploy ------------------------------------------- */

test('both Classroom grade triggers take few enough events an instance to fit their memory', () => {
  const { functions } = listDeployableFunctions();
  for (const name of ['syncGradeToClassroom', 'syncSectionGradeToClassroom']) {
    const fn = functions.find((candidate) => candidate.name === name);
    assert.ok(fn, `${name} is deployed`);
    assert.equal(fn.trigger, 'event');
    assert.ok(fn.memoryMb >= 1024, `${name} has ${fn.memoryMb} MiB`);
    assert.ok(Number.isInteger(fn.concurrency) && fn.concurrency >= 1 && fn.concurrency <= 20,
      `${name} takes ${fn.concurrency ?? 'the default 80'} events an instance`);
  }
});

test('the checkpoint scheduler has time to finish a catch-up before the next run starts', () => {
  const { functions } = listDeployableFunctions();
  const fn = functions.find((candidate) => candidate.name === 'queueClassroomSectionGradeCheckpoints');
  assert.equal(fn.trigger, 'schedule');
  assert.ok(fn.timeoutSeconds >= 300, `runs may last ${fn.timeoutSeconds ?? 'the default 60'} s`);
  assert.ok(fn.timeoutSeconds < 540, 'the 5-minute schedule still never meets a long-running run twice over');
});

/* --- a Firestore that returns only what was asked for -------------------- */

const pathSegments = (field) => (typeof field === 'string' ? field.split('.') : String(field).split('.'));

const project = (data, fields) => {
  if (fields === null) return structuredClone(data);
  const out = {};
  for (const segments of fields) {
    let from = data;
    for (const segment of segments) from = from?.[segment];
    if (from === undefined) continue;
    let to = out;
    segments.slice(0, -1).forEach((segment) => { to = (to[segment] ||= {}); });
    to[segments[segments.length - 1]] = structuredClone(from);
  }
  return out;
};

const fakeFirestore = (collections) => {
  const reads = [];
  const updates = [];
  const sets = [];
  const ref = (docPath) => {
    const [collection, id] = docPath.split('/');
    return {
      path: docPath,
      id,
      async get() {
        reads.push({ kind: 'doc', path: docPath, fields: null });
        const data = collections[collection]?.[id];
        return { id, ref: ref(docPath), exists: Boolean(data), data: () => (data ? structuredClone(data) : undefined) };
      },
      async set(data, options) { sets.push({ path: docPath, data, options }); },
    };
  };
  const query = (collection, state = { filters: [], fields: null, limit: null }) => ({
    where: (field, op, value) => query(collection, { ...state, filters: [...state.filters, { field, op, value }] }),
    select: (...fields) => query(collection, { ...state, fields: fields.map(pathSegments) }),
    limit: (limit) => query(collection, { ...state, limit }),
    doc: (id) => ref(`${collection}/${id}`),
    async get() {
      reads.push({ kind: 'query', collection, filters: state.filters, fields: state.fields });
      const docs = Object.entries(collections[collection] || {})
        .filter(([, data]) => state.filters.every(({ field, op, value }) => {
          assert.equal(op, '==', 'the fake supports equality only');
          return data[field] === value;
        }))
        .slice(0, state.limit ?? undefined)
        .map(([id, data]) => ({ id, ref: ref(`${collection}/${id}`), exists: true, data: () => project(data, state.fields) }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  return {
    reads,
    updates,
    sets,
    collection: (name) => query(name),
    doc: ref,
    async getAll(...args) {
      const options = args.length && !args[args.length - 1]?.path ? args.pop() : null;
      const fields = options?.fieldMask ? options.fieldMask.map(pathSegments) : null;
      reads.push({ kind: 'getAll', paths: args.map((r) => r.path), fields });
      return args.map((r) => {
        const [collection, id] = r.path.split('/');
        const data = collections[collection]?.[id];
        return { id, ref: r, exists: Boolean(data), data: () => (data ? project(data, fields) : undefined) };
      });
    },
    batch() {
      const pending = [];
      return {
        update(docRef, fieldPath, value) { pending.push({ path: docRef.path, field: String(fieldPath), value }); },
        async commit() { updates.push(...pending); },
      };
    },
  };
};

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

const seed = () => ({
  classroomLinks: {
    pubA: { status: 'published', publicationKind: 'section', courseworkId: 'cw-a', assignmentId: 'asg1', teacherUid: 't1', sectionKey: 's1', launchPayload: 'x'.repeat(2048) },
    pubB: { status: 'published', publicationKind: 'section', courseworkId: 'cw-b', assignmentId: 'asg2', teacherUid: 't1' },
    pubWhole: { status: 'published', publicationKind: 'assignment', courseworkId: 'cw-w', assignmentId: 'asg3', teacherUid: 't1' },
  },
  assignments: {
    // Closed two days ago: the final-deadline checkpoint is owed.
    asg1: { dueAt: iso(-3 * DAY), lateDueAt: iso(-2 * DAY), assignedClassIds: ['c1', 'c2'], questions: [{ prompt: 'q'.repeat(4096) }] },
    // Due next week: nothing owed.
    asg2: { dueAt: iso(7 * DAY), assignedClassIds: ['c3'], questions: [] },
    asg3: { dueAt: iso(-2 * DAY), assignedClassIds: ['c1'], questions: [] },
  },
  grades: {
    s1: { classId: 'c1', gradesByAssignment: { asg1: { answers: [1] }, other: { answers: [2] } }, evidence: 'e'.repeat(8192) },
    s2: { classId: 'c1', gradesByAssignment: { other: { answers: [3] } } },
    s3: { classId: 'c2', gradesByAssignment: { asg1: { answers: [4] } } },
    s4: { classId: 'c3', gradesByAssignment: { asg1: { answers: [5] } } },
  },
});

const loadEntry = (db) => {
  currentDb = db;
  return requireFromFunctions('./classroomSectionEntry.js').cloudFunctions;
};

/* --- the scheduler and the reconcile, run ------------------------------- */

test('the checkpoint scheduler reads references and dates, and still flags every student the checkpoint is owed to', async () => {
  const data = seed();
  const db = fakeFirestore(data);
  const { queueClassroomSectionGradeCheckpoints } = loadEntry(db);
  await queueClassroomSectionGradeCheckpoints.run({ scheduleTime: new Date().toISOString() });

  const links = db.reads.find((read) => read.kind === 'query' && read.collection === 'classroomLinks');
  assert.deepEqual(links.fields?.map((segments) => segments.join('.')).sort(),
    ['assignmentId', 'courseworkId', 'publicationKind', 'sectionGradePassbackEnabled']);

  const assignments = db.reads.find((read) => read.kind === 'getAll');
  assert.deepEqual(assignments.paths.sort(), ['assignments/asg1', 'assignments/asg2'], 'section publications only');
  assert.ok(assignments.fields, 'the assignments are read with a field mask');
  const masked = assignments.fields.map((segments) => segments.join('.'));
  assert.ok(!masked.includes('questions'), 'not the questions');
  for (const field of ['dueAt', 'lateDueAt', 'releaseAt', 'assignedClassIds']) assert.ok(masked.includes(field), `reads ${field}`);

  const gradeReads = db.reads.filter((read) => read.kind === 'query' && read.collection === 'grades');
  assert.deepEqual(gradeReads.map((read) => read.filters[0].value).sort(), ['c1', 'c2']);
  for (const read of gradeReads) assert.deepEqual(read.fields, [], 'grade documents are read as references only');

  // Every student of both assigned classes is flagged, with or without saved work.
  assert.deepEqual(db.updates.map((u) => u.path).sort(), ['grades/s1', 'grades/s2', 'grades/s3']);
  for (const u of db.updates) {
    assert.equal(u.field, 'classroomReleaseSignals.asg1');
    assert.equal(u.value.reason, 'final-deadline');
  }
  const state = db.sets.find((s) => s.path === 'classroomSectionGradeCheckpointState/asg1');
  assert.equal(state.data.queuedStudents, 3);
  assert.equal(state.data.finalDueAt, data.assignments.asg1.lateDueAt);
  assert.equal(db.sets.length, 1, 'nothing is owed for the assignment due next week');
});

test('a teacher\'s reconcile reads only whether each student has saved work for that one assignment', async () => {
  const db = fakeFirestore(seed());
  const { reconcileClassroomSectionGrades } = loadEntry(db);
  const result = await reconcileClassroomSectionGrades.run({
    auth: { uid: 't1', token: { role: 'teacher' } },
    data: { assignmentId: 'asg1' },
  });

  const gradeReads = db.reads.filter((read) => read.kind === 'query' && read.collection === 'grades');
  assert.equal(gradeReads.length, 2);
  for (const read of gradeReads) {
    assert.deepEqual(read.fields?.map((segments) => segments.join('.')), ['gradesByAssignment.asg1']);
  }
  // s2 has saved work only for another assignment; s4 is in a class not assigned.
  assert.deepEqual(db.updates.map((u) => u.path).sort(), ['grades/s1', 'grades/s3']);
  assert.ok(db.updates.every((u) => u.value.reason === 'section-grade-reconcile'));
  assert.equal(result.queuedStudents, 2);
});
