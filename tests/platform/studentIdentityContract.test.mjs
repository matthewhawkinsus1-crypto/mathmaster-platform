// THE STUDENT-NAME CONTRACT, END TO END.
//
// PR #314 put teacher Home, Classes, Attendance, Classroom and Live on the
// compact roster from listSignInAccess. Its grades projection dropped
// googleName (the only name some Classroom-linked legacy students have), the
// client normaliser dropped it a second time, and Live View was told to fall
// back to the id. Teachers saw '101410' where a child's name belonged, and
// several of those paths then stored the id as the student's name.
//
// Every other identity test checks one layer. These tests run the layers
// together, on synthetic records, through the REAL code at each step:
//
//   grades docs in a fake Firestore that honours select() and field masks
//     -> the listSignInAccess callable body from functions/index.js
//     -> the client normaliser (normalizeTeacherRosterSummary), in the order
//        fetchTeacherRosterSummaries applies it (pinned by
//        teacherIdentityArchitecture.test.mjs)
//     -> the identity index and the screens' helpers (formatStudentName,
//        formatStudentLabel, classifyLiveStudent, search)
//
// and, for repairs, through scripts/student-identity-repair.mjs's planner and
// writer and the setStudentName callable body.
//
// The acceptance tests are named A-E and H. F, G and I are in
// teacherIdentityArchitecture.test.mjs.
//
// Every name, id and email here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import * as identity from '../../functions/shared/studentIdentity.mjs';
import {
  STUDENT_NAME_UNAVAILABLE,
  STUDENT_SELF_NEUTRAL_LABEL,
  buildStudentIdentityIndex,
  compareStudentsByName,
  formatStudentLabel,
  formatStudentName,
  resolveRosterStudentName,
  resolveStudentDisplayName,
  studentSearchText,
} from '../../src/platform/studentName.js';
import {
  normalizeTeacherRosterSummary,
  rosterStudentLabel,
  rosterStudentNameForStorage,
} from '../../src/platform/teacher/teacherRosterSummary.js';
import { classifyLiveStudent, summarizeLiveClass } from '../../src/livePresence.js';
import { searchTeacherWorkspace } from '../../src/platform/teacher/teacherSearch.js';
import { publicStudentLabel } from '../../src/platform/liveSpotlight.js';
import {
  GRADES_COLLECTION,
  STUDENT_READ_FIELDS,
  applyIdentityUpdates,
  planIdentityRepair,
  safeStudentIdKey,
} from '../../scripts/student-identity-repair.mjs';
import { region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const authLib = require('../../functions/lib/auth.js');
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// A small Firestore stand-in. It models exactly what these paths rely on and
// is strict about it: select() and field masks return ONLY the listed fields
// (that is how the original projection lost googleName), update() on a missing
// document throws, and every read and write is recorded.
// ---------------------------------------------------------------------------

const DELETE = Object.freeze({ fieldValue: 'delete' });
const SERVER_TIME = Object.freeze({ fieldValue: 'serverTimestamp' });
const FAKE_FIELD_VALUE = Object.freeze({ delete: () => DELETE, serverTimestamp: () => SERVER_TIME });

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const project = (data, fields) => (fields
  ? Object.fromEntries(fields.filter((field) => Object.hasOwn(data, field)).map((field) => [field, clone(data[field])]))
  : clone(data));

class FakeDocRef {
  constructor(db, collection, id) {
    Object.assign(this, { db, collection, id });
  }
}

class FakeQuery {
  constructor(db, collection, fields = null) {
    Object.assign(this, { db, collection, fields });
  }

  select(...fields) {
    return new FakeQuery(this.db, this.collection, fields);
  }

  doc(id) {
    this.db.autoId += 1;
    return new FakeDocRef(this.db, this.collection, id ?? `auto-${this.db.autoId}`);
  }

  async get() {
    this.db.reads.push({ collection: this.collection, id: null, fields: this.fields, via: 'query.get' });
    return { docs: [...this.db.docsOf(this.collection).keys()].map((id) => this.db.snapshot(this.collection, id, this.fields)) };
  }
}

class FakeFirestore {
  constructor(seed = {}) {
    this.collections = new Map(Object.entries(seed).map(([name, docs]) => [
      name,
      new Map(Object.entries(docs).map(([id, data]) => [id, clone(data)])),
    ]));
    this.reads = [];
    this.writes = [];
    this.autoId = 0;
  }

  docsOf(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    return this.collections.get(name);
  }

  data(name, id) {
    return clone(this.docsOf(name).get(id));
  }

  collection(name) {
    return new FakeQuery(this, name);
  }

  snapshot(collection, id, fields) {
    const stored = this.docsOf(collection).get(id);
    return { id, exists: stored !== undefined, data: () => (stored === undefined ? undefined : project(stored, fields)) };
  }

  async runTransaction(callback) {
    const pending = [];
    const db = this;
    const transaction = {
      async get(ref) {
        db.reads.push({ collection: ref.collection, id: ref.id, fields: null, via: 'transaction.get' });
        return db.snapshot(ref.collection, ref.id, null);
      },
      async getAll(...args) {
        const options = args.length && !(args.at(-1) instanceof FakeDocRef) ? args.pop() : {};
        const fields = options?.fieldMask ? [...options.fieldMask] : null;
        return args.map((ref) => {
          db.reads.push({ collection: ref.collection, id: ref.id, fields, via: 'transaction.getAll' });
          return db.snapshot(ref.collection, ref.id, fields);
        });
      },
      update(ref, payload) {
        pending.push({ op: 'update', ref, payload });
        return transaction;
      },
      set(ref, payload) {
        pending.push({ op: 'set', ref, payload });
        return transaction;
      },
    };
    const result = await callback(transaction);
    pending.forEach((write) => this.commit(write));
    return result;
  }

  commit({ op, ref, payload }) {
    const docs = this.docsOf(ref.collection);
    this.writes.push({ op, collection: ref.collection, id: ref.id, keys: Object.keys(payload) });
    if (op === 'update') {
      assert.ok(docs.has(ref.id), `update() of missing ${ref.collection}/${ref.id} would fail in Firestore`);
      const next = { ...docs.get(ref.id) };
      Object.entries(payload).forEach(([key, value]) => {
        assert.ok(!key.includes('.'), 'dotted update paths are not modelled by this stand-in');
        if (value === DELETE) delete next[key];
        else next[key] = clone(value);
      });
      docs.set(ref.id, next);
      return;
    }
    docs.set(ref.id, Object.fromEntries(Object.entries(payload)
      .filter(([, value]) => value !== DELETE)
      .map(([key, value]) => [key, clone(value)])));
  }
}

// ---------------------------------------------------------------------------
// Running a callable from functions/index.js as written. The statement is cut
// out of the source and evaluated with its module-level collaborators supplied
// here; the real helpers it calls (callerEmail, requireTeacher, loadClasses)
// are cut out the same way, so authorization runs exactly as deployed.
// ---------------------------------------------------------------------------

const SERVER = read('functions/index.js');
const CLASS_COLLECTION = SERVER.match(/^const CLASS_COLLECTION = "([^"]+)";/m)?.[1];
class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const topLevelFunction = (name) => {
  const start = SERVER.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.notEqual(start, -1, `functions/index.js no longer defines ${name}(); update the harness in this test`);
  return SERVER.slice(start, SERVER.indexOf('\n}\n', start) + 2);
};

const runServerCallable = async (name, { db, request }) => {
  const statement = `${region(SERVER, `exports.${name} = onCall(`, '\n});\n', name)}\n});`;
  const collaborators = {
    onCall: (handler) => handler,
    HttpsError,
    authLib,
    FieldValue: FAKE_FIELD_VALUE,
    getFirestore: () => db,
    studentIdentity: async () => identity,
    CLASS_COLLECTION,
    serializableDate: (value) => value ?? null,
  };
  const helpers = ['callerEmail', 'requireTeacher', 'loadClasses'].map(topLevelFunction).join('\n');
  const factory = new Function(
    ...Object.keys(collaborators),
    `"use strict";\n${helpers}\nconst exports = {};\n${statement}\nreturn exports.${name};`,
  );
  try {
    return await factory(...Object.values(collaborators))(request);
  } catch (error) {
    if (error instanceof ReferenceError) {
      throw new Error(`${name} now depends on something this harness does not supply (${error.message}). Add it to runServerCallable.`);
    }
    throw error;
  }
};

const TEACHER = 'teacher.one@example.test';
const OTHER_TEACHER = 'teacher.two@example.test';
const teacherRequest = (email = TEACHER, data = {}) => ({
  auth: { uid: `uid-${email}`, token: { role: 'teacher', email, email_verified: true } },
  data,
});

// What fetchTeacherRosterSummaries (src/App.jsx) does with the response.
// teacherIdentityArchitecture.test.mjs pins App.jsx to these same steps.
const clientRoster = (response) => (Array.isArray(response?.students) ? response.students : [])
  .map(normalizeTeacherRosterSummary)
  .filter((student) => student.id)
  .sort(compareStudentsByName);

const loadTeacherRoster = async (db, email = TEACHER) => {
  const response = await runServerCallable('listSignInAccess', { db, request: teacherRequest(email) });
  return { response, roster: clientRoster(response) };
};

// The grades fields only the student's history holds. None may reach the
// teacher roster, and no name change or repair may touch them.
const HISTORY_FIELDS = Object.freeze([
  'gradesByAssignment', 'assignmentActivity', 'supportUsageByAssignment',
  'dolGradesByAssignment', 'classworkGradesByAssignment', 'teacherGradeOverridesByAssignment',
  'testCycleGrades', 'sectionRecoveryByAssignment', 'classroomSyncStatusByAssignment',
]);
const ROSTER_ROW_KEYS = Object.freeze([
  'studentId', 'firstName', 'lastName', 'displayName', 'nameSource', 'nameMissing', 'classId', 'classPeriod',
  'status', 'assignedTeacherEmail', 'sisStudentId', 'profile', 'hasPasscode', 'resetRequired', 'linkedEmail',
]);

const history = (seed) => ({
  gradesByAssignment: { [`assignment-${seed}`]: { 0: { status: 'correct', totalAttempts: 1 }, 1: { status: 'attempted' } } },
  assignmentActivity: { [`assignment-${seed}`]: { totalTimeSeconds: 640, lateSeconds: 0 } },
  dolGradesByAssignment: { [`assignment-${seed}`]: { '2026-09-01': { score: 80, finalized: true } } },
  testCycleGrades: { [`test-${seed}`]: { released: true, score: 91 } },
});

const CLASS_ID = 'class-identity-contract';
const enrolled = (extra = {}) => ({
  classId: CLASS_ID,
  classPeriod: 'Period 4',
  status: 'active',
  assignedTeacherEmail: TEACHER,
  ...extra,
});
const CLASSES = { [CLASS_ID]: { name: 'Algebra 1', period: 'Period 4', teacherOfRecord: TEACHER } };

const NOW = Date.parse('2026-09-15T15:00:00.000Z');
const liveStatus = (overrides = {}) => ({
  assignmentId: 'assignment-live', assignmentTitle: 'Slope practice', activityRole: 'classwork',
  questionIndex: 1, questionCount: 6, questionStates: 'ca....', currentAttempts: 0,
  updatedAt: NOW - 2_000, lastInteractionAt: NOW - 2_000, startedAt: NOW - 300_000, pageVisible: true,
  ...overrides,
});

const byId = (rows, id) => rows.find((row) => String(row.studentId ?? row.id) === id);

/** A displayed name is a name: never the id, never a bare number, never an unlabelled id. */
const assertShowsNoBareId = (text, id, where) => {
  const value = String(text ?? '');
  assert.notEqual(value.trim(), id, `${where}: the id ${id} was shown as the name`);
  assert.doesNotMatch(value, /^\s*(?:Student\s*)?\d+\s*$/, `${where}: "${value}" is an id, not a name`);
  if (value.includes(id)) assert.ok(value.includes(`ID ${id}`), `${where}: "${value}" shows the id without labelling it`);
};

// ---------------------------------------------------------------------------
// Test A — a normal student, and the Classroom-linked legacy student whose
// only name is googleName (the defect).
// ---------------------------------------------------------------------------

test('Test A: a teacher sees the human name — server projection, client roster, Live tile, labels', async () => {
  const db = new FakeFirestore({
    grades: {
      730101: enrolled({ firstName: 'Juniper', lastName: 'Placeholdia', displayName: 'Juniper Placeholdia', sisStudentId: '5550101', ...history('a') }),
      // The defect: googleName is the ONLY name on file.
      730102: enrolled({ firstName: null, lastName: null, displayName: null, googleName: 'Wren Specimenson', googleUserId: '118800220033', ...history('b') }),
      // Another teacher's student never reaches this teacher.
      730199: enrolled({ firstName: 'Orrin', lastName: 'Elsewhereby', assignedTeacherEmail: OTHER_TEACHER }),
    },
    classes: CLASSES,
  });
  const { response, roster } = await loadTeacherRoster(db);

  // ONE roster read for the whole class: projected to the shared field list,
  // with no attempt history, and no per-student document reads at all.
  const gradesReads = db.reads.filter((entry) => entry.collection === GRADES_COLLECTION);
  assert.equal(gradesReads.length, 1, 'the teacher roster is one projected query');
  assert.equal(gradesReads[0].id, null);
  assert.deepEqual(gradesReads[0].fields, [...identity.TEACHER_ROSTER_SELECT_FIELDS]);
  HISTORY_FIELDS.forEach((field) => assert.ok(!gradesReads[0].fields.includes(field), `the roster must not select ${field}`));

  assert.deepEqual(response.students.map((row) => row.studentId).sort(), ['730101', '730102'], 'teacher scoping is unchanged');
  response.students.forEach((row) => {
    assert.deepEqual(Object.keys(row).sort(), [...ROSTER_ROW_KEYS].sort(), 'a roster row carries identity and account state only');
  });

  // Structured name, all the way through.
  const normal = byId(roster, '730101');
  assert.deepEqual(
    [normal.firstName, normal.lastName, normal.displayName, normal.nameSource, normal.nameMissing],
    ['Juniper', 'Placeholdia', 'Juniper Placeholdia', 'structured', false],
  );
  assert.equal(formatStudentName(normal), 'Placeholdia, Juniper');
  assert.equal(formatStudentName(normal, { lastFirst: false }), 'Juniper Placeholdia');
  assert.equal(formatStudentLabel(normal), 'Placeholdia, Juniper');
  assert.equal(formatStudentLabel(normal, { includeId: true }), 'Placeholdia, Juniper · ID 730101');
  const tile = classifyLiveStudent({ ...normal, liveStatus: liveStatus() }, { nowValue: NOW });
  assert.deepEqual([tile.name, tile.nameMissing, tile.idLabel, tile.id], ['Juniper Placeholdia', false, 'ID 730101', '730101']);

  // The Classroom-linked legacy student keeps the Google name at every step.
  const legacyRow = byId(response.students, '730102');
  assert.deepEqual([legacyRow.displayName, legacyRow.nameSource, legacyRow.nameMissing], ['Wren Specimenson', 'googleName', false]);
  const legacy = byId(roster, '730102');
  assert.deepEqual([legacy.displayName, legacy.nameSource, legacy.nameMissing], ['Wren Specimenson', 'googleName', false]);
  assert.equal(legacy.firstName, null, 'a single full name is not guessed into stored parts');
  assert.equal(formatStudentName(legacy), 'Specimenson, Wren');
  assert.equal(formatStudentLabel(legacy), 'Specimenson, Wren');
  const legacyTile = classifyLiveStudent({ ...legacy, liveStatus: liveStatus() }, { nowValue: NOW });
  assert.deepEqual([legacyTile.name, legacyTile.nameMissing], ['Wren Specimenson', false]);
  assert.equal(publicStudentLabel(legacy), 'Wren S.');

  // Live View for the class: both tiles named, neither by id.
  const live = summarizeLiveClass(roster.map((student) => ({ ...student, liveStatus: liveStatus() })), { nowValue: NOW });
  assert.equal(live.rows.length, 2);
  live.rows.forEach((row) => assertShowsNoBareId(row.name, row.id, 'Live tile'));
});

// ---------------------------------------------------------------------------
// Test B — a legacy student repaired by the backfill tool.
//
// A Classroom link (googleName, a classroomRosterLinks entry) is a teacher's
// revocable match, so the tool writes a name only when a source independent of
// that link agrees (the creation audit, the student's own Google profile, a
// legacy field). A name vouched for only by the link stays on screen through
// the roster projection and waits for the teacher to confirm it with
// setStudentName (Sign-in Access, "Add name" / "Edit name").
// ---------------------------------------------------------------------------

const projectForRepair = (db) => [...db.docsOf(GRADES_COLLECTION).entries()]
  .map(([studentId, data]) => ({ studentId, data: project(data, [...STUDENT_READ_FIELDS]) }));

test('Test B: the repair tool names legacy students on the teacher roster, and a re-run plans nothing', async () => {
  const legacy = (extra) => enrolled({ firstName: null, lastName: null, displayName: null, ...extra });
  const db = new FakeFirestore({
    grades: {
      730201: legacy({ googleName: 'Cass Mockingworth', ...history('c') }),
      730202: legacy({ ...history('d') }), // named only by its Classroom roster link
      730203: legacy({ ...history('e') }), // named only by the account-creation audit
      730204: enrolled({ displayName: 'Indigo Fakerly', ...history('f') }), // display name, no parts
      730205: enrolled({ firstName: 'Tamsin', lastName: 'Proofwell', displayName: 'Tamsin Proofwell' }),
      // Named ONLY by the Classroom link: shown, never copied by the tool.
      730206: legacy({ googleName: 'Calla Linkwright', ...history('i') }),
    },
    classes: CLASSES,
  });
  const inputs = {
    students: projectForRepair(db),
    creationAudits: [{ studentId: '730203', firstName: 'Bram', lastName: 'Prototypo', displayName: 'Bram Prototypo' }],
    rosterLinks: [
      { studentId: '730202', name: 'Ember Draftwell', googleUserId: '119900330044', courseId: 'course-1' },
      { studentId: '730206', name: 'Calla Linkwright', googleUserId: '119900330066', courseId: 'course-1' },
    ],
    // The Auth profile of each student's own linked Google account: the source
    // independent of the Classroom match, agreeing with it.
    googleProfiles: [
      { studentId: '730201', displayName: 'Cass Mockingworth' },
      { studentId: '730202', displayName: 'Ember Draftwell' },
    ],
    aliases: [],
    directory: [],
    credentialKeys: [],
    studentIdKey: safeStudentIdKey,
  };
  const before = (await loadTeacherRoster(db)).roster;
  assert.equal(byId(before, '730202').nameMissing, true, 'before the repair, the roster-link-only student has no name on file');
  assert.equal(formatStudentLabel(byId(before, '730202')), `${STUDENT_NAME_UNAVAILABLE} · ID 730202`);

  // Dry run: the plan identifies each legacy student and its source.
  const plan = planIdentityRepair(inputs);
  const planned = Object.fromEntries(plan.updates.map((update) => [update.studentId, update]));
  assert.deepEqual(Object.keys(planned).sort(), ['730201', '730202', '730203', '730204']);
  assert.equal(planned['730201'].source, 'googleName');
  assert.equal(planned['730202'].source, 'classroomRosterLink');
  assert.equal(planned['730203'].source, 'accountCreationAudit');
  assert.equal(planned['730204'].source, 'storedDisplayName');
  // The Classroom-only student: no write, awaiting a person, and counted.
  assert.equal(planned['730206'], undefined, 'a Classroom-only name is never made canonical');
  assert.deepEqual(plan.needsStructuredName, [{ studentId: '730206', reason: 'classroomOnlySource' }]);
  assert.equal(plan.counts.active.classroomNameAwaitingConfirmation, 1);
  assert.equal(plan.counts.active.recoverableElsewhere, 4, '730201-730203 written, 730206 awaiting confirmation');
  plan.updates.forEach((update) => {
    Object.keys(update.set).forEach((field) => assert.ok(['firstName', 'lastName', 'displayName'].includes(field)));
  });
  assert.equal(db.writes.length, 0, 'planning writes nothing');
  const historyBefore = Object.fromEntries([...db.docsOf(GRADES_COLLECTION).entries()]
    .map(([id, data]) => [id, project(data, HISTORY_FIELDS)]));

  // Execute with the tool's own writer.
  const outcome = await applyIdentityUpdates({ db, FieldValue: FAKE_FIELD_VALUE, inputs, plan, runId: 'identity-contract-run' });
  assert.equal(outcome.applied, 4);
  db.writes.forEach((write) => {
    assert.equal(write.op, 'update', 'the backfill only updates');
    write.keys.forEach((key) => assert.ok(identity.SERVER_OWNED_IDENTITY_FIELDS.includes(key), `the backfill wrote ${key}`));
  });
  Object.entries(historyBefore).forEach(([id, fields]) => {
    assert.deepEqual(project(db.data(GRADES_COLLECTION, id), HISTORY_FIELDS), fields, `${id}: history untouched`);
  });

  // The same server projection and client roster now show every name.
  const { response, roster } = await loadTeacherRoster(db);
  const expected = {
    730201: ['Cass', 'Mockingworth'],
    730202: ['Ember', 'Draftwell'],
    730203: ['Bram', 'Prototypo'],
    730204: ['Indigo', 'Fakerly'],
    730205: ['Tamsin', 'Proofwell'],
  };
  Object.entries(expected).forEach(([id, [first, last]]) => {
    const row = byId(roster, id);
    assert.deepEqual([row.firstName, row.lastName, row.nameSource, row.nameMissing], [first, last, 'structured', false], id);
    assert.equal(formatStudentName(row), `${last}, ${first}`);
    assert.equal(classifyLiveStudent({ ...row, liveStatus: liveStatus() }, { nowValue: NOW }).name, `${first} ${last}`);
    assert.equal('identityBackfill' in byId(response.students, id), false, 'the provenance stamp is not roster data');
  });

  // The Classroom-only student is untouched by the tool, yet still named on
  // every screen: the roster projection resolves googleName at read time.
  assert.deepEqual(
    project(db.data(GRADES_COLLECTION, '730206'), ['firstName', 'lastName', 'displayName', 'identityBackfill']),
    { firstName: null, lastName: null, displayName: null },
  );
  const awaiting = byId(roster, '730206');
  assert.deepEqual([awaiting.displayName, awaiting.nameSource, awaiting.nameMissing, awaiting.firstName], ['Calla Linkwright', 'googleName', false, null]);
  assert.equal(formatStudentName(awaiting), 'Linkwright, Calla');
  assert.equal(classifyLiveStudent({ ...awaiting, liveStatus: liveStatus() }, { nowValue: NOW }).name, 'Calla Linkwright');

  // Idempotent: re-planning the repaired records changes nothing.
  const replan = planIdentityRepair({ ...inputs, students: projectForRepair(db) });
  assert.deepEqual(replan.updates, []);
  assert.equal(replan.counts.active.completeCanonicalNames, 5);
  assert.deepEqual(replan.needsStructuredName, [{ studentId: '730206', reason: 'classroomOnlySource' }]);

  // The teacher confirms the name (setStudentName); then it is canonical and
  // the planner has nothing left to ask about.
  await runServerCallable('setStudentName', {
    db, request: teacherRequest(TEACHER, { studentId: '730206', firstName: 'Calla', lastName: 'Linkwright' }),
  });
  const confirmed = byId((await loadTeacherRoster(db)).roster, '730206');
  assert.deepEqual([confirmed.firstName, confirmed.lastName, confirmed.nameSource], ['Calla', 'Linkwright', 'structured']);
  const afterConfirm = planIdentityRepair({ ...inputs, students: projectForRepair(db) });
  assert.deepEqual(afterConfirm.updates, []);
  assert.deepEqual(afterConfirm.needsStructuredName, []);
  assert.equal(afterConfirm.counts.active.classroomNameAwaitingConfirmation, 0);
  assert.equal(afterConfirm.counts.active.completeCanonicalNames, 6);
});

// ---------------------------------------------------------------------------
// Test C — no authoritative name anywhere.
// ---------------------------------------------------------------------------

test('Test C: with no authoritative name, nothing invents one — "Name unavailable", the id labelled, nothing written', async () => {
  const id = '730301';
  // Every field a name could live in holds something that is NOT a name.
  const junk = enrolled({
    firstName: '5550301', // the SIS id
    lastName: null,
    displayName: id,
    googleName: 'learner730301@example.test',
    name: 'Student',
    studentName: 'Name unavailable',
    sisStudentId: '5550301',
    googleUserId: '117700110022',
    profile: { displayName: `ID ${id}`, name: `Student ${id}` },
    ...history('g'),
  });
  const db = new FakeFirestore({ grades: { [id]: junk }, classes: CLASSES });
  const { response, roster } = await loadTeacherRoster(db);

  const row = byId(response.students, id);
  assert.deepEqual([row.firstName, row.lastName, row.displayName, row.nameSource, row.nameMissing], [null, null, null, null, true]);
  const student = byId(roster, id);
  assert.deepEqual([student.displayName, student.nameMissing], [null, true]);

  const index = buildStudentIdentityIndex(roster);
  const shown = {
    formatStudentName: formatStudentName(student),
    formatStudentNameNatural: formatStudentName(student, { lastFirst: false }),
    formatStudentLabel: formatStudentLabel(student),
    rosterStudentLabel: rosterStudentLabel({ studentId: id, index, historicalName: id }),
    resolveRosterStudentName: resolveRosterStudentName({ studentId: id, index, historicalName: 'Student' }),
    liveTile: classifyLiveStudent({ ...student, liveStatus: liveStatus() }, { nowValue: NOW }).name,
    spotlight: publicStudentLabel(student),
    ownScreen: resolveStudentDisplayName({ rosterStudent: junk, sessionDisplayName: id, studentId: id }),
  };
  assert.deepEqual(shown, {
    formatStudentName: STUDENT_NAME_UNAVAILABLE,
    formatStudentNameNatural: STUDENT_NAME_UNAVAILABLE,
    formatStudentLabel: `${STUDENT_NAME_UNAVAILABLE} · ID ${id}`,
    rosterStudentLabel: `${STUDENT_NAME_UNAVAILABLE} · ID ${id}`,
    resolveRosterStudentName: STUDENT_NAME_UNAVAILABLE,
    liveTile: STUDENT_NAME_UNAVAILABLE,
    spotlight: STUDENT_SELF_NEUTRAL_LABEL,
    ownScreen: STUDENT_SELF_NEUTRAL_LABEL,
  });
  Object.entries(shown).forEach(([where, text]) => assertShowsNoBareId(text, id, where));
  assert.equal(classifyLiveStudent({ ...student, liveStatus: liveStatus() }, { nowValue: NOW }).idLabel, `ID ${id}`);

  // What a teacher action would store: no name at all, never a stand-in.
  assert.equal(identity.studentNameForStorage({ ...junk, studentId: id }), null);
  assert.equal(rosterStudentNameForStorage({ studentId: id, index, historicalName: id }), null);
  assert.equal(rosterStudentNameForStorage({ studentId: id, index, historicalName: STUDENT_NAME_UNAVAILABLE }), null);

  // The planner reports it unresolved and plans no write, even when every
  // outside source offers an id, an email or a placeholder.
  const plan = planIdentityRepair({
    students: projectForRepair(db),
    creationAudits: [{ studentId: id, firstName: '', lastName: '', displayName: id }],
    rosterLinks: [{ studentId: id, name: 'learner730301@example.test', googleUserId: '117700110022', courseId: 'course-1' }],
    googleProfiles: [{ studentId: id, displayName: 'Student' }],
    studentIdKey: safeStudentIdKey,
  });
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.unresolved, [{ studentId: id, reason: 'noAuthoritativeSource' }]);
  assert.equal(plan.counts.unresolved.noAuthoritativeSource, 1);
  assert.equal(db.writes.length, 0);
});

// The one-line label formatStudentLabel prints for a nameless student is a
// display string, not a name: the core resolver (isIdentifierLikeName) rejects
// it, so a label that ever reached a storage path is stored as null.
test('Test C: the "Name unavailable · ID x" label is never accepted or stored as a name', () => {
  const id = '730301';
  const label = formatStudentLabel({ studentId: id });
  assert.equal(label, `${STUDENT_NAME_UNAVAILABLE} · ID ${id}`);
  assert.equal(identity.acceptStudentName(label, { studentId: id }), '');
  assert.equal(rosterStudentNameForStorage({ studentId: id, index: new Map(), historicalName: label }), null);
  assert.equal(identity.studentNameForStorage({ studentId: id, displayName: label }), null);
});

// ---------------------------------------------------------------------------
// Test D — two students, one name.
// ---------------------------------------------------------------------------

test('Test D: two students with the same name stay two students on every layer; the id tells them apart', async () => {
  const db = new FakeFirestore({
    grades: {
      730402: enrolled({ firstName: 'Lark', lastName: 'Testington', displayName: 'Lark Testington' }),
      730401: enrolled({ firstName: 'Lark', lastName: 'Testington', displayName: 'Lark Testington' }),
      // Same name again, but only as a legacy googleName: repaired separately, never merged.
      730403: enrolled({ firstName: null, lastName: null, displayName: null, googleName: 'Lark Testington' }),
    },
    classes: CLASSES,
  });
  const { response, roster } = await loadTeacherRoster(db);
  const twins = ['730401', '730402', '730403'];

  assert.deepEqual(response.students.map((row) => row.studentId), ['730401', '730402', '730403'], 'one row each, ordered by id within the name');
  assert.deepEqual(roster.map((row) => row.id), twins);
  const index = buildStudentIdentityIndex(roster);
  assert.equal(index.size, 3);
  twins.forEach((id) => assert.equal(index.get(id), byId(roster, id), `${id}: its own index entry`));

  const live = summarizeLiveClass(roster.map((student) => ({ ...student, liveStatus: liveStatus() })), { nowValue: NOW });
  assert.deepEqual(live.rows.map((row) => row.id).sort(), twins);
  live.rows.forEach((row) => assert.equal(row.name, 'Lark Testington'));

  // The one-line label with includeId is what tells them apart on an admin screen.
  assert.equal(new Set(roster.map((student) => formatStudentLabel(student, { includeId: true }))).size, 3);

  // Searching the id finds exactly that student first.
  twins.forEach((id) => {
    const [first] = searchTeacherWorkspace({ query: id, students: roster });
    assert.equal(first.payload.studentId, id);
    assert.equal(first.subtitle.startsWith(`ID ${id}`), true);
    twins.filter((other) => other !== id).forEach((other) => assert.ok(!studentSearchText(byId(roster, other)).includes(id)));
  });

  // The planner reports the duplicate and touches only the legacy record's own
  // fields. 730403's own Google profile agrees with its googleName, so the name
  // has a source independent of the Classroom link and may be written.
  const plan = planIdentityRepair({
    students: projectForRepair(db),
    googleProfiles: [{ studentId: '730403', displayName: 'Lark Testington' }],
    studentIdKey: safeStudentIdKey,
  });
  assert.deepEqual(plan.counts.duplicateHumanNames, { groups: 1, students: 3 });
  assert.deepEqual(plan.updates.map((update) => update.studentId), ['730403']);
  assert.deepEqual(plan.updates[0].set, { displayName: 'Lark Testington', firstName: 'Lark', lastName: 'Testington' });

  // With only the Classroom link vouching for it, the same record is not
  // written — it waits for the teacher — and the twins are still never merged.
  const classroomOnly = planIdentityRepair({ students: projectForRepair(db), studentIdKey: safeStudentIdKey });
  assert.deepEqual(classroomOnly.updates, []);
  assert.deepEqual(classroomOnly.needsStructuredName, [{ studentId: '730403', reason: 'classroomOnlySource' }]);
  assert.equal(classroomOnly.counts.active.classroomNameAwaitingConfirmation, 1);
  assert.equal(classroomOnly.counts.totalStudents, 3);
});

// ---------------------------------------------------------------------------
// Test E — a teacher corrects a name.
// ---------------------------------------------------------------------------

test('Test E: setStudentName changes the name everywhere by studentId, writes only identity fields, rewrites no record', async () => {
  const id = '730501';
  const db = new FakeFirestore({
    grades: {
      // Backfilled earlier from googleName; the teacher now corrects it.
      [id]: enrolled({
        googleName: 'Pip Sampleworth',
        firstName: 'Pip',
        lastName: 'Sampleworth',
        displayName: 'Pip Sampleworth',
        identityBackfill: identity.identityBackfillStamp({
          runId: 'identity-earlier-run', at: 'stamp-time', source: 'googleName', split: 'twoPartName',
          filledFields: ['displayName', 'firstName', 'lastName'],
        }),
        ...history('h'),
      }),
    },
    classes: CLASSES,
    // Records written before the correction, keyed by studentId: one with no
    // name, one with the old name, one from a build that stored the id.
    studentSupportEvents: {
      e1: { studentId: id, studentName: null, kind: 'watchPractice' },
      e2: { studentId: id, studentName: 'Pip Sampleworth', kind: 'teacherIntervention' },
      e3: { studentId: id, studentName: id, kind: 'liveIntegrity' },
    },
  });
  const gradesBefore = db.data(GRADES_COLLECTION, id);
  const eventsBefore = [...db.docsOf('studentSupportEvents').entries()].map(([key, data]) => [key, clone(data)]);

  // A different teacher may not, and a non-name is refused — neither writes.
  await assert.rejects(
    runServerCallable('setStudentName', { db, request: teacherRequest(OTHER_TEACHER, { studentId: id, firstName: 'Pippa', lastName: 'Sampleworth' }) }),
    (error) => error.code === 'permission-denied',
  );
  await assert.rejects(
    runServerCallable('setStudentName', { db, request: teacherRequest(TEACHER, { studentId: id, firstName: id, lastName: 'Sampleworth' }) }),
    (error) => error.code === 'invalid-argument',
  );
  assert.equal(db.writes.length, 0);
  db.reads.length = 0;

  const saved = await runServerCallable('setStudentName', {
    db, request: teacherRequest(TEACHER, { studentId: id, firstName: ' Pippa ', lastName: 'Sampleworth' }),
  });
  assert.deepEqual(saved, { studentId: id, firstName: 'Pippa', lastName: 'Sampleworth', displayName: 'Pippa Sampleworth' });

  // The read was a field mask without history; the writes were the name and its audit.
  const gradesRead = db.reads.filter((entry) => entry.collection === GRADES_COLLECTION);
  assert.equal(gradesRead.length, 1);
  assert.ok(gradesRead[0].fields, 'the grades document is read through a field mask');
  HISTORY_FIELDS.forEach((field) => assert.ok(!gradesRead[0].fields.includes(field), `setStudentName must not read ${field}`));
  assert.deepEqual(db.writes.map((write) => `${write.op} ${write.collection}`).sort(), ['set adminAuditLog', `update ${GRADES_COLLECTION}`]);
  const nameWrite = db.writes.find((write) => write.collection === GRADES_COLLECTION);
  nameWrite.keys.forEach((key) => {
    assert.ok(identity.SERVER_OWNED_IDENTITY_FIELDS.includes(key), `setStudentName may write identity fields only, not ${key}`);
  });
  assert.ok(nameWrite.keys.includes('identityBackfill'), 'the correction clears the backfill stamp');

  // History and every derived record are exactly as they were.
  const gradesAfter = db.data(GRADES_COLLECTION, id);
  assert.deepEqual(project(gradesAfter, HISTORY_FIELDS), project(gradesBefore, HISTORY_FIELDS));
  Object.keys(gradesBefore)
    .filter((field) => !identity.SERVER_OWNED_IDENTITY_FIELDS.includes(field))
    .forEach((field) => assert.deepEqual(gradesAfter[field], gradesBefore[field], `${field} unchanged`));
  assert.deepEqual([...db.docsOf('studentSupportEvents').entries()], eventsBefore, 'no event is rewritten');

  // The refreshed roster and index name every id-keyed record by the new name.
  const { roster } = await loadTeacherRoster(db);
  const index = buildStudentIdentityIndex(roster);
  eventsBefore.forEach(([key, event]) => {
    assert.equal(resolveRosterStudentName({ studentId: event.studentId, index, historicalName: event.studentName }), 'Pippa Sampleworth', key);
    assert.equal(rosterStudentLabel({ studentId: event.studentId, index, historicalName: event.studentName }), 'Pippa Sampleworth', key);
  });
  assert.equal(formatStudentName(index.get(id)), 'Sampleworth, Pippa');
  // A presence document still carrying the old name does not name the tile.
  const tile = classifyLiveStudent({ ...index.get(id), liveStatus: liveStatus({ name: 'Pip Sampleworth' }) }, { nowValue: NOW });
  assert.equal(tile.name, 'Pippa Sampleworth');

  // Rolling back the earlier backfill run can no longer undo the teacher's correction.
  const rollback = identity.planStudentIdentityRollback({
    students: [...db.docsOf(GRADES_COLLECTION).entries()].map(([studentId, data]) => ({ studentId, data })),
    runId: 'identity-earlier-run',
  });
  assert.deepEqual(rollback, []);
});

// ---------------------------------------------------------------------------
// Test H — search.
// ---------------------------------------------------------------------------

test('Test H: a teacher finds a student by first, last, full or "Last, First" name and by id — Google-only names included', async () => {
  const db = new FakeFirestore({
    grades: {
      730601: enrolled({ firstName: 'Saffron', lastName: 'Mockley', displayName: 'Saffron Mockley', sisStudentId: '5550601' }),
      730602: enrolled({ firstName: null, lastName: null, displayName: null, googleName: 'Thorne Examplar' }),
      730603: enrolled({ firstName: 'Odell', lastName: 'Specimenti', displayName: 'Odell Specimenti' }),
    },
    classes: CLASSES,
  });
  const { response, roster } = await loadTeacherRoster(db);
  // Every shape a teacher screen searches: the server row (Student Access
  // filters these directly), the client roster (Home, Students), the
  // quick-search copy App.jsx makes (displayName replaced by
  // formatStudentName) and a full grades document (full-data tabs). The ranked
  // quick search only ever receives the client-side shapes, which carry `id`.
  const shapes = {
    serverRow: { quickSearch: false, studentFor: (id) => byId(response.students, id) },
    clientRoster: { quickSearch: true, studentFor: (id) => byId(roster, id) },
    quickSearchCopy: { quickSearch: true, studentFor: (id) => ({ ...byId(roster, id), displayName: formatStudentName(byId(roster, id)) }) },
    gradesDocument: { quickSearch: true, studentFor: (id) => ({ id, ...db.data(GRADES_COLLECTION, id) }) },
  };
  const queries = {
    730601: ['Saffron', 'mockley', 'Saffron Mockley', 'Mockley, Saffron', '730601', '5550601'],
    730602: ['Thorne', 'examplar', 'Thorne Examplar', 'Examplar, Thorne', '730602'],
  };

  Object.entries(shapes).forEach(([shape, { quickSearch, studentFor }]) => {
    const students = Object.keys(queries).concat('730603').map(studentFor);
    Object.entries(queries).forEach(([id, terms]) => {
      terms.forEach((term) => {
        const needle = term.trim().toLowerCase();
        // Student Access and the Students tab filter on studentSearchText.
        assert.ok(studentSearchText(studentFor(id)).includes(needle), `${shape}: "${term}" must find ${id}`);
        assert.ok(!studentSearchText(studentFor('730603')).includes(needle), `${shape}: "${term}" must not find 730603`);
        if (!quickSearch) return;
        // The quick search ranks; the student is the top result.
        const [top] = searchTeacherWorkspace({ query: term, students });
        assert.equal(top?.payload?.studentId, id, `${shape}: quick search "${term}"`);
        assertShowsNoBareId(top.title, id, `${shape}: quick search title`);
      });
    });
  });
});
