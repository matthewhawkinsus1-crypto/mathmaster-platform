// The legacy student-name backfill: what it plans, what it refuses, and what
// the tool around it reads and writes.
//
// WHY. Classroom-linked legacy students were created with no name on the
// canonical roster record; their only name lived in googleName, a Classroom
// roster link or the account-creation audit. The repair copies that name onto
// grades/{studentId} — and must never guess, never take an id/email/
// placeholder as a name, never overwrite a stored name, never merge two
// students, never print a name in its counts, and be safe to re-run and to
// roll back.
//
// The first half drives the pure planner (functions/shared/studentIdentity.mjs).
// The second half drives scripts/student-identity-repair.mjs against a small
// in-memory Firestore stand-in, so the suite proves the dry run writes nothing,
// every read is projected, writes are update()-only and the report is redacted
// without needing the emulator. tests/integration/studentIdentityRepair.test.mjs
// runs the same tool against the real Firestore emulator.
//
// Every name and id in this file is invented for the test.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTeacherRosterSummaryRow,
  planStudentIdentityRepair,
  planStudentIdentityRollback,
} from '../../functions/shared/studentIdentity.mjs';
import {
  BACKFILL_AUDIT_ACTION,
  ROLLBACK_AUDIT_ACTION,
  STUDENT_READ_FIELDS,
  defaultRunId,
  parseRepairArgs,
  runStudentIdentityRepair,
  safeStudentIdKey,
} from '../../scripts/student-identity-repair.mjs';

const FIXTURE_NAMES = [
  'Rowan', 'Exampleton', 'Quinn', 'Samplewood', 'Avery', 'Fixtureton', 'Harper', 'Testwell',
  'Sawyer', 'Mockridge', 'Morgan', 'Duplicaton', 'Marlo', 'Sampleby', 'Ellis', 'Placeholt',
  'Robin', 'Mockford', 'Sage', 'Testfield', 'Tatum', 'Retiredson', 'Different', 'Learner',
];
const containsAnyFixtureName = (value) => {
  const text = JSON.stringify(value).toLowerCase();
  return FIXTURE_NAMES.filter((name) => text.includes(name.toLowerCase()));
};

// A legacy record exactly as optional-name createStudentAccount left it.
const nameless = (extra = {}) => ({
  firstName: null,
  lastName: null,
  displayName: null,
  classPeriod: 'Period 2',
  status: 'active',
  ...extra,
});

const applyPlanInMemory = (students, updates) => {
  const byId = new Map(updates.map((update) => [update.studentId, update]));
  return students.map(({ studentId, data }) => ({
    studentId,
    data: byId.has(studentId) ? { ...data, ...byId.get(studentId).set } : data,
  }));
};

/* ------------------------------------------------------------------------- */
/* The planner                                                               */
/* ------------------------------------------------------------------------- */

test('Test B: a nameless record recovers its name from googleName, the roster link or the creation audit — and re-planning writes nothing', () => {
  const students = [
    { studentId: 'S-101', data: nameless({ googleName: 'Rowan Exampleton' }) },
    { studentId: 'S-102', data: nameless() },
    { studentId: 'S-103', data: nameless() },
  ];
  const inputs = {
    students,
    rosterLinks: [{ studentId: 'S-102', name: 'Quinn Samplewood', googleUserId: 'g-102', courseId: 'course-1' }],
    creationAudits: [{ studentId: 'S-103', firstName: 'Avery', lastName: 'Fixtureton', displayName: 'Avery Fixtureton' }],
  };

  // Before: the roster link and audit names reach no teacher screen at all.
  assert.equal(buildTeacherRosterSummaryRow('S-102', students[1].data).nameMissing, true);
  assert.equal(buildTeacherRosterSummaryRow('S-103', students[2].data).nameMissing, true);

  const plan = planStudentIdentityRepair(inputs);
  const byId = Object.fromEntries(plan.updates.map((update) => [update.studentId, update]));
  assert.deepEqual(Object.keys(byId).sort(), ['S-101', 'S-102', 'S-103']);
  assert.equal(byId['S-101'].source, 'googleName');
  assert.equal(byId['S-101'].split, 'twoPartName');
  assert.deepEqual(byId['S-101'].set, { displayName: 'Rowan Exampleton', firstName: 'Rowan', lastName: 'Exampleton' });
  assert.equal(byId['S-102'].source, 'classroomRosterLink');
  assert.deepEqual(byId['S-102'].set, { displayName: 'Quinn Samplewood', firstName: 'Quinn', lastName: 'Samplewood' });
  // The audit already knows first from last, so no split is needed.
  assert.equal(byId['S-103'].source, 'accountCreationAudit');
  assert.equal(byId['S-103'].split, null);
  assert.deepEqual(byId['S-103'].set, { displayName: 'Avery Fixtureton', firstName: 'Avery', lastName: 'Fixtureton' });
  for (const update of plan.updates) {
    assert.deepEqual(update.filledFields.sort(), ['displayName', 'firstName', 'lastName']);
  }
  assert.equal(plan.counts.plannedUpdates, 3);
  assert.equal(plan.counts.plannedUpdatesBySource.googleName, 1);
  assert.equal(plan.counts.plannedUpdatesBySource.classroomRosterLink, 1);
  assert.equal(plan.counts.plannedUpdatesBySource.accountCreationAudit, 1);
  assert.equal(plan.counts.active.recoverableElsewhere, 3);
  assert.equal(plan.counts.unresolved.total, 0);

  const repaired = applyPlanInMemory(students, plan.updates);
  const again = planStudentIdentityRepair({ ...inputs, students: repaired });
  assert.deepEqual(again.updates, [], 'applying the plan and planning again must write nothing');
  assert.equal(again.counts.active.completeCanonicalNames, 3);

  const row = buildTeacherRosterSummaryRow('S-102', repaired[1].data);
  assert.equal(row.nameMissing, false);
  assert.equal(row.firstName, 'Quinn');
  assert.equal(row.lastName, 'Samplewood');
  assert.equal(row.displayName, 'Quinn Samplewood');
  assert.equal(row.nameSource, 'structured');
});

test('Test C: no trustworthy source means no write — ids, emails, id labels and placeholders are not sources', () => {
  const students = [
    {
      studentId: '555001',
      data: nameless({
        displayName: '555001',
        googleName: '555001',
        name: 'Student 555001',
        studentName: 'Name unavailable',
        sisStudentId: '777001',
        profile: { displayName: '777001' },
      }),
    },
    // An opaque Google id with letters is still an id: it equals googleUserId.
    { studentId: '555002', data: nameless({ googleUserId: 'gx7Kq2', googleName: 'gx7Kq2' }) },
    { studentId: '555003', data: nameless() },
  ];
  const plan = planStudentIdentityRepair({
    students,
    rosterLinks: [{ studentId: '555003', name: 'learner555003@example.test', googleUserId: 'g-3', courseId: 'course-1' }],
    googleProfiles: [{ studentId: '555003', displayName: '555003' }],
    creationAudits: [{ studentId: '555003', firstName: null, lastName: null, displayName: 'Student' }],
  });
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(
    plan.unresolved.map(({ studentId, reason }) => [studentId, reason]),
    [['555001', 'noAuthoritativeSource'], ['555002', 'noAuthoritativeSource'], ['555003', 'noAuthoritativeSource']],
  );
  assert.equal(plan.counts.unresolved.noAuthoritativeSource, 3);
  assert.equal(plan.counts.active.notRecoverableAutomatically, 3);
  assert.equal(plan.counts.active.noUsableHumanName, 3);
  // The stored '555001' displayName is counted as an id-like stored name.
  assert.equal(plan.counts.active.idLikeStoredName, 1);
});

test('conflicting sources are reported and left alone; agreeing sources in different forms are one name', () => {
  const plan = planStudentIdentityRepair({
    students: [
      { studentId: 'S-301', data: nameless({ googleName: 'Harper Testwell' }) },
      { studentId: 'S-302', data: nameless({ googleName: 'Testwell, Harper' }) },
    ],
    rosterLinks: [
      { studentId: 'S-301', name: 'Sawyer Mockridge', googleUserId: 'g-301', courseId: 'course-1' },
      { studentId: 'S-302', name: 'harper testwell', googleUserId: 'g-302', courseId: 'course-1' },
    ],
  });
  assert.deepEqual(plan.conflicts, [{ studentId: 'S-301', sources: ['googleName', 'classroomRosterLink'] }]);
  assert.deepEqual(plan.unresolved, [{ studentId: 'S-301', reason: 'conflictingSources' }]);
  assert.equal(plan.counts.unresolved.conflictingSources, 1);
  assert.deepEqual(plan.updates.map((update) => update.studentId), ['S-302'], 'no write for the conflicting student');
  assert.equal(plan.updates[0].split, 'commaName');
  assert.deepEqual(plan.updates[0].set, { displayName: 'Harper Testwell', firstName: 'Harper', lastName: 'Testwell' });
});

test('Test D: two students with the same name stay two students — counted, never merged', () => {
  const plan = planStudentIdentityRepair({
    students: [
      { studentId: 'S-401', data: nameless({ googleName: 'Morgan Duplicaton' }) },
      { studentId: 'S-402', data: nameless({ googleName: 'Morgan Duplicaton' }) },
      { studentId: 'S-403', data: { firstName: 'Ellis', lastName: 'Placeholt', displayName: 'Ellis Placeholt', status: 'active' } },
    ],
  });
  assert.deepEqual(plan.updates.map((update) => update.studentId), ['S-401', 'S-402']);
  for (const update of plan.updates) {
    assert.deepEqual(Object.keys(update.set).sort(), ['displayName', 'firstName', 'lastName'],
      'each record is filled on its own id; nothing points one student at another');
  }
  assert.deepEqual(plan.counts.duplicateHumanNames, { groups: 1, students: 2 });
  assert.equal(plan.counts.totalStudents, 3);
});

test('a three-word name fills displayName only and asks a person to confirm first/last', () => {
  const students = [{ studentId: 'S-501', data: nameless({ googleName: 'Marlo Jean Sampleby' }) }];
  const plan = planStudentIdentityRepair({ students });
  assert.equal(plan.updates.length, 1);
  assert.deepEqual(plan.updates[0].set, { displayName: 'Marlo Jean Sampleby' });
  assert.deepEqual(plan.updates[0].filledFields, ['displayName']);
  assert.equal(plan.updates[0].split, null);
  assert.deepEqual(plan.needsStructuredName, [{ studentId: 'S-501', reason: 'recoveredNameNotSplittable' }]);
  assert.equal(plan.counts.needsStructuredNameConfirmation, 1);
  assert.deepEqual(plan.counts.plannedFirstLastSplits, { twoPartName: 0, commaName: 0 });

  const again = planStudentIdentityRepair({ students: applyPlanInMemory(students, plan.updates) });
  assert.deepEqual(again.updates, [], 'the guess is never made on a later run either');
  assert.deepEqual(again.needsStructuredName, [{ studentId: 'S-501', reason: 'displayNameNotSplittable' }]);
});

test('"Last, First" splits as last-then-first, from a source and from a stored displayName', () => {
  const plan = planStudentIdentityRepair({
    students: [
      { studentId: 'S-601', data: nameless({ googleName: 'Exampleton, Rowan' }) },
      { studentId: 'S-602', data: nameless({ displayName: 'Samplewood, Quinn' }) },
    ],
  });
  const byId = Object.fromEntries(plan.updates.map((update) => [update.studentId, update]));
  assert.equal(byId['S-601'].split, 'commaName');
  assert.deepEqual(byId['S-601'].set, { displayName: 'Rowan Exampleton', firstName: 'Rowan', lastName: 'Exampleton' });
  // The stored displayName is kept exactly as stored; only the parts are added.
  assert.equal(byId['S-602'].source, 'storedDisplayName');
  assert.equal(byId['S-602'].split, 'commaName');
  assert.deepEqual(byId['S-602'].set, { firstName: 'Quinn', lastName: 'Samplewood' });
  assert.deepEqual(plan.counts.plannedFirstLastSplits, { twoPartName: 0, commaName: 2 });
});

test('a valid stored name is never overwritten by another source', () => {
  const plan = planStudentIdentityRepair({
    students: [
      { studentId: 'S-701', data: { firstName: 'Ellis', lastName: 'Placeholt', displayName: 'Ellis Placeholt', googleName: 'Different Learner', status: 'active' } },
      { studentId: 'S-702', data: nameless({ displayName: 'Ellis Placeholt', googleName: 'Different Learner' }) },
      { studentId: 'S-703', data: nameless({ firstName: 'Robin', lastName: 'Mockford', googleName: 'Different Learner' }) },
      { studentId: 'S-704', data: nameless({ firstName: 'Sage', googleName: 'Sage Testfield' }) },
    ],
    rosterLinks: [{ studentId: 'S-701', name: 'Different Learner', googleUserId: 'g-701', courseId: 'course-1' }],
  });
  const byId = Object.fromEntries(plan.updates.map((update) => [update.studentId, update]));
  assert.equal(byId['S-701'], undefined, 'a complete record is left alone');
  assert.equal(plan.counts.active.completeCanonicalNames, 1);
  // Stored displayName wins over googleName: only its own parts are added.
  assert.deepEqual(byId['S-702'].set, { firstName: 'Ellis', lastName: 'Placeholt' });
  // Stored first/last win: displayName is built from them.
  assert.equal(byId['S-703'].source, 'storedStructured');
  assert.deepEqual(byId['S-703'].set, { displayName: 'Robin Mockford' });
  // A lone stored first name is not combined with an outside full name.
  assert.equal(byId['S-704'], undefined);
  assert.deepEqual(plan.needsStructuredName, [{ studentId: 'S-704', reason: 'partialStructuredName' }]);
  assert.deepEqual(containsAnyFixtureName(plan.updates.map((update) => update.set)).filter((name) => ['Different', 'Learner'].includes(name)), []);
});

test('disabled students are counted separately from active ones', () => {
  const plan = planStudentIdentityRepair({
    students: [
      { studentId: 'S-801', data: nameless({ status: 'disabled', googleName: 'Tatum Retiredson' }) },
      { studentId: 'S-802', data: nameless({ googleName: 'Rowan Exampleton' }) },
      { studentId: 'S-803', data: nameless({ status: 'disabled' }) },
    ],
  });
  assert.equal(plan.counts.totalStudents, 3);
  assert.equal(plan.counts.activeStudents, 1);
  assert.equal(plan.counts.disabledStudents, 2);
  assert.equal(plan.counts.active.missingAllNameFields, 1, 'only the active nameless student is tallied under active');
  assert.equal(plan.counts.active.recoverableElsewhere, 1);
});

test('identity-record mismatches are counted, and an id the sign-in validator rejects does not abort the audit', () => {
  const students = [
    { studentId: 'S-901', data: nameless({ googleName: 'Rowan Exampleton' }) },
    { studentId: 'S-902', data: nameless({ googleName: 'Quinn Samplewood' }) },
    // One character: functions/lib/auth.js studentIdKey would throw on it.
    { studentId: 'x', data: nameless() },
  ];
  const plan = planStudentIdentityRepair({
    students,
    aliases: [
      { key: 'S-901', studentId: 'S-901' },
      { key: 'GHOST-1', studentId: 'GHOST-1' },
      { key: 'WRONG-KEY', studentId: 'S-902' },
      { key: 'X', studentId: 'x' },
    ],
    directory: [{ email: 'linked@example.test', studentId: 'GHOST-2' }],
    rosterLinks: [
      { studentId: 'GHOST-3', name: null, googleUserId: 'g-ghost', courseId: 'course-1' },
      { studentId: 'S-901', name: null, googleUserId: 'g-shared', courseId: 'course-1' },
      { studentId: 'S-902', name: null, googleUserId: 'g-shared', courseId: 'course-1' },
    ],
    credentialKeys: ['S-901', 'GHOST-1', 'GHOST-4'],
    studentIdKey: safeStudentIdKey,
  });
  assert.deepEqual(plan.counts.identityRecordMismatches, {
    aliasesWithoutRoster: 1,
    aliasKeyMismatch: 1,
    directoryLinksWithoutRoster: 1,
    rosterLinksWithoutRoster: 1,
    credentialsWithoutRoster: 1,
    googleAccountsLinkedToSeveralStudents: 1,
  });
  assert.equal(safeStudentIdKey('ab-12'), 'AB-12');
  assert.equal(safeStudentIdKey('x'), 'X');
});

test('counts hold numbers only: no student name and no student id', () => {
  const students = [
    { studentId: 'S-101', data: nameless({ googleName: 'Rowan Exampleton' }) },
    { studentId: 'S-301', data: nameless({ googleName: 'Harper Testwell' }) },
    { studentId: 'S-401', data: nameless({ googleName: 'Morgan Duplicaton' }) },
    { studentId: 'S-402', data: nameless({ googleName: 'Morgan Duplicaton' }) },
    { studentId: 'S-501', data: nameless({ googleName: 'Marlo Jean Sampleby' }) },
    { studentId: 'S-703', data: nameless({ firstName: 'Robin', lastName: 'Mockford' }) },
    { studentId: '555001', data: nameless() },
  ];
  const plan = planStudentIdentityRepair({
    students,
    rosterLinks: [{ studentId: 'S-301', name: 'Sawyer Mockridge', googleUserId: 'g-1', courseId: 'course-1' }],
    creationAudits: [{ studentId: 'S-101', firstName: 'Rowan', lastName: 'Exampleton', displayName: null }],
  });
  assert.ok(plan.updates.length >= 4, 'the fixture exercises real updates');
  assert.deepEqual(containsAnyFixtureName(plan.counts), []);
  const countsText = JSON.stringify(plan.counts);
  for (const { studentId } of students) assert.ok(!countsText.includes(`"${studentId}"`), `counts must not name ${studentId}`);
  const leaves = [];
  const walk = (value) => (value && typeof value === 'object' ? Object.values(value).forEach(walk) : leaves.push(value));
  walk(plan.counts);
  assert.ok(leaves.every((value) => typeof value === 'number'), 'every leaf of counts is a number');
});

test('rollback removes exactly the fields a run filled, plus its stamp, and only where that run\'s stamp remains', () => {
  const stamp = (runId, filledFields) => ({ runId, filledFields, source: 'googleName', version: 1 });
  const plan = planStudentIdentityRollback({
    runId: 'identity-20261001T120000Z',
    students: [
      { studentId: 'S-101', data: { identityBackfill: stamp('identity-20261001T120000Z', ['displayName', 'firstName', 'lastName']) } },
      { studentId: 'S-102', data: { identityBackfill: stamp('identity-20261001T120000Z', ['displayName']) } },
      { studentId: 'S-103', data: { identityBackfill: stamp('identity-20260930T080000Z', ['displayName']) } },
      // A teacher corrected the name with setStudentName, which deletes the stamp.
      { studentId: 'S-104', data: { firstName: 'Quinn', lastName: 'Samplewood', displayName: 'Quinn Samplewood' } },
      // A damaged stamp cannot widen the rollback past the three name fields.
      { studentId: 'S-105', data: { identityBackfill: stamp('identity-20261001T120000Z', ['displayName', 'gradesByAssignment', 'classId']) } },
    ],
  });
  assert.deepEqual(plan, [
    { studentId: 'S-101', deleteFields: ['displayName', 'firstName', 'lastName', 'identityBackfill'] },
    { studentId: 'S-102', deleteFields: ['displayName', 'identityBackfill'] },
    { studentId: 'S-105', deleteFields: ['displayName', 'identityBackfill'] },
  ]);
  assert.deepEqual(planStudentIdentityRollback({ runId: '', students: [{ studentId: 'S-101', data: { identityBackfill: stamp('', []) } }] }), []);
});

/* ------------------------------------------------------------------------- */
/* The tool, against an in-memory Firestore stand-in                         */
/* ------------------------------------------------------------------------- */

const DELETE = Symbol('FieldValue.delete');
const SERVER_TIMESTAMP = Symbol('FieldValue.serverTimestamp');
const FakeFieldValue = { delete: () => DELETE, serverTimestamp: () => SERVER_TIMESTAMP };

const clone = (value) => (value === undefined ? undefined : structuredClone(value));
const readPath = (data, dotted) => dotted.split('.').reduce((value, key) => (value && typeof value === 'object' ? value[key] : undefined), data);
const resolveSentinels = (value) => {
  if (value === SERVER_TIMESTAMP) return '<serverTimestamp>';
  if (Array.isArray(value)) return value.map(resolveSentinels);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, resolveSentinels(inner)]));
  return value;
};
const projectFields = (data, fields) => {
  if (data === undefined) return undefined;
  if (!fields) return clone(data);
  return Object.fromEntries(fields.filter((field) => field in data).map((field) => [field, clone(data[field])]));
};

/**
 * Just enough of the Admin Firestore API for the tool: projected collection
 * reads, equality filters, transactions with getAll(fieldMask), update() that
 * fails on a missing document exactly as Firestore does, and add().
 */
const createFakeFirestore = (seed = {}) => {
  const collections = new Map(Object.entries(seed).map(([name, docs]) => [name, new Map(Object.entries(clone(docs)))]));
  const coll = (name) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  };
  const reads = [];
  const writes = [];
  let autoId = 0;
  const snapshot = (name, id, data) => ({
    id,
    exists: data !== undefined,
    data: () => clone(data),
    get: (field) => readPath(data, field),
  });
  const docRef = (name, id) => ({ id, path: `${name}/${id}`, collectionName: name });
  const query = (name, state = { filters: [], select: null, limit: null }) => ({
    where: (field, op, value) => {
      assert.equal(op, '==');
      return query(name, { ...state, filters: [...state.filters, [field, value]] });
    },
    select: (...fields) => query(name, { ...state, select: fields }),
    limit: (count) => query(name, { ...state, limit: count }),
    doc: (id) => docRef(name, id),
    get: async () => {
      reads.push({ collection: name, select: state.select, filters: state.filters });
      const docs = [...coll(name).entries()]
        .filter(([, data]) => state.filters.every(([field, value]) => readPath(data, field) === value))
        .map(([id, data]) => snapshot(name, id, projectFields(data, state.select)))
        .slice(0, state.limit ?? undefined);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    add: async (data) => {
      autoId += 1;
      const id = `auto-${autoId}`;
      coll(name).set(id, resolveSentinels(data));
      writes.push({ type: 'add', path: `${name}/${id}`, data: resolveSentinels(data) });
      return docRef(name, id);
    },
  });
  const db = {
    collection: (name) => query(name),
    runTransaction: async (callback) => {
      const pending = [];
      const transaction = {
        getAll: async (...args) => {
          const options = args.length && !args.at(-1)?.path ? args.pop() : {};
          reads.push({ transaction: true, fieldMask: options.fieldMask || null, documents: args.length });
          return args.map((ref) => snapshot(ref.collectionName, ref.id, projectFields(coll(ref.collectionName).get(ref.id), options.fieldMask)));
        },
        update: (ref, data) => pending.push({ type: 'update', ref, data }),
        set: (ref, data, options) => pending.push({ type: 'set', ref, data, options }),
      };
      const result = await callback(transaction);
      for (const write of pending) {
        const docs = coll(write.ref.collectionName);
        if (write.type === 'update') {
          if (!docs.has(write.ref.id)) throw new Error(`NOT_FOUND: no document to update: ${write.ref.path}`);
          const next = docs.get(write.ref.id);
          Object.entries(write.data).forEach(([key, value]) => {
            if (value === DELETE) delete next[key];
            else next[key] = resolveSentinels(value);
          });
        } else {
          docs.set(write.ref.id, resolveSentinels(write.data));
        }
        writes.push({ type: write.type, path: write.ref.path, keys: Object.keys(write.data) });
      }
      return result;
    },
  };
  return { db, reads, writes, doc: (name, id) => clone(coll(name).get(id)), remove: (name, id) => coll(name).delete(id), put: (name, id, data) => coll(name).set(id, clone(data)) };
};

// A history map large enough that loading it by accident would matter.
const bigHistory = () => Object.fromEntries(Array.from({ length: 60 }, (_, index) => [
  `assignment-${index}`,
  { score: index, attempts: [{ answer: `x=${index}`, correct: index % 2 === 0 }] },
]));

const legacySeed = () => ({
  grades: {
    'S-101': nameless({ googleName: 'Rowan Exampleton', gradesByAssignment: bigHistory() }),
    'S-102': nameless({ gradesByAssignment: bigHistory() }),
    'S-103': nameless(),
    'S-301': nameless({ googleName: 'Harper Testwell' }),
    'S-501': nameless({ googleName: 'Marlo Jean Sampleby' }),
    'S-701': { firstName: 'Ellis', lastName: 'Placeholt', displayName: 'Ellis Placeholt', status: 'active', gradesByAssignment: bigHistory() },
    '555001': nameless({ displayName: '555001' }),
  },
  classroomRosterLinks: {
    'course-1__S-102': { studentId: 'S-102', name: 'Quinn Samplewood', googleUserId: 'g-102', courseId: 'course-1', email: 'quinn@example.test' },
    'course-1__S-301': { studentId: 'S-301', name: 'Sawyer Mockridge', googleUserId: 'g-301', courseId: 'course-1' },
  },
  adminAuditLog: {
    'audit-1': {
      action: 'student_account_created',
      target: 'S-103',
      actorEmail: 'admin@example.test',
      details: { firstName: 'Avery', lastName: 'Fixtureton', displayName: 'Avery Fixtureton', classId: 'class-1' },
    },
    'audit-2': { action: 'student_name_set', target: 'S-701', details: { next: { displayName: 'Robin Mockford' } } },
  },
  studentAliases: { 'S-101': { key: 'S-101', studentId: 'S-101' } },
  studentDirectory: { 'linked@example.test': { studentId: 'S-101', uid: 'uid-101', email: 'linked@example.test' } },
  studentCredentials: { 'S-101': { hash: 'not-a-real-hash', resetRequired: false } },
});

const NOW = new Date('2026-10-01T12:00:00Z');

test('the dry run reads only projected fields and writes nothing; the default report holds no names and no ids', async () => {
  const fake = createFakeFirestore(legacySeed());
  const report = await runStudentIdentityRepair({ db: fake.db, mode: 'audit', now: NOW, FieldValue: FakeFieldValue });
  assert.deepEqual(fake.writes, [], 'a dry run performs zero writes');
  assert.equal(report.dryRun, true);
  assert.equal(report.counts.plannedUpdates, 4);
  assert.equal(report.counts.unresolved.conflictingSources, 1);
  assert.equal(report.counts.unresolved.noAuthoritativeSource, 1);
  assert.equal(report.sources.googleProfiles, 'skipped');

  // Performance contract: every collection read is projected, and the roster
  // read never asks for a history map.
  for (const read of fake.reads) assert.ok(Array.isArray(read.select), `${read.collection} must be read through select()`);
  const gradesRead = fake.reads.find((read) => read.collection === 'grades');
  assert.deepEqual(gradesRead.select, [...STUDENT_READ_FIELDS]);
  assert.ok(!STUDENT_READ_FIELDS.some((field) => /ByAssignment|Activity|attempt/i.test(field)));
  assert.deepEqual(fake.reads.find((read) => read.collection === 'studentCredentials').select, [], 'credentials: ids only');
  assert.deepEqual(fake.reads.find((read) => read.collection === 'adminAuditLog').filters, [['action', 'student_account_created']]);

  assert.deepEqual(containsAnyFixtureName(report), []);
  const text = JSON.stringify(report);
  for (const id of ['S-101', 'S-102', 'S-103', 'S-301', 'S-501', 'S-701', '555001']) {
    assert.ok(!text.includes(id), `the default report must not list ${id}`);
  }
  assert.equal(report.containsStudentIds, false);
  assert.equal(report.containsStudentNames, false);
});

test('--list-ids adds ids but no names; --include-names is the only way a name reaches the report', async () => {
  const withIds = await runStudentIdentityRepair({ db: createFakeFirestore(legacySeed()).db, mode: 'audit', now: NOW, includeStudentIds: true });
  assert.deepEqual(withIds.studentIds.unresolved.map((entry) => entry.studentId).sort(), ['555001', 'S-301']);
  assert.deepEqual(withIds.studentIds.conflicts.map((entry) => entry.studentId), ['S-301']);
  assert.deepEqual(withIds.studentIds.needsStructuredNameConfirmation.map((entry) => entry.studentId), ['S-501']);
  assert.deepEqual(containsAnyFixtureName(withIds), [], '--list-ids never adds a name');

  const withNames = await runStudentIdentityRepair({ db: createFakeFirestore(legacySeed()).db, mode: 'audit', now: NOW, includeNames: true });
  assert.equal(withNames.containsStudentNames, true);
  assert.ok(containsAnyFixtureName(withNames.proposedNames).includes('Exampleton'));
});

test('execute writes only the missing name fields and the stamp, with update(); a second run writes nothing', async () => {
  const fake = createFakeFirestore(legacySeed());
  const historyBefore = JSON.stringify(fake.doc('grades', 'S-101').gradesByAssignment);
  const report = await runStudentIdentityRepair({
    db: fake.db, mode: 'execute', now: NOW, actor: 'operator@example.test', FieldValue: FakeFieldValue,
  });
  assert.equal(report.runId, defaultRunId(NOW));
  assert.equal(report.runId, 'identity-20261001T120000Z');
  assert.equal(report.execution.applied, 4);
  assert.deepEqual(report.execution.skipped, { deleted: 0, noLongerNeeded: 0, planChanged: 0 });

  const gradeWrites = fake.writes.filter((write) => write.path.startsWith('grades/'));
  assert.ok(gradeWrites.every((write) => write.type === 'update'), 'never set()/merge: a deleted student cannot be recreated');
  for (const write of gradeWrites) {
    assert.ok(write.keys.every((key) => ['firstName', 'lastName', 'displayName', 'identityBackfill'].includes(key)), write.keys.join());
  }
  assert.ok(!gradeWrites.some((write) => ['grades/S-701', 'grades/S-301', 'grades/555001'].includes(write.path)));

  const repaired = fake.doc('grades', 'S-101');
  assert.equal(repaired.displayName, 'Rowan Exampleton');
  assert.equal(repaired.firstName, 'Rowan');
  assert.equal(repaired.lastName, 'Exampleton');
  assert.equal(JSON.stringify(repaired.gradesByAssignment), historyBefore, 'academic data untouched');
  assert.deepEqual(repaired.identityBackfill, {
    runId: 'identity-20261001T120000Z',
    at: '<serverTimestamp>',
    source: 'googleName',
    split: 'twoPartName',
    filledFields: ['displayName', 'firstName', 'lastName'],
    version: 1,
  });
  assert.equal(fake.doc('grades', 'S-501').displayName, 'Marlo Jean Sampleby');
  assert.equal(fake.doc('grades', 'S-501').firstName, null, 'an ambiguous split is never written');

  const audits = fake.writes.filter((write) => write.type === 'add');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].data.action, BACKFILL_AUDIT_ACTION);
  assert.equal(audits[0].data.target, 'identity-20261001T120000Z');
  assert.equal(audits[0].data.actorEmail, 'operator@example.test');
  assert.equal(audits[0].data.actorUid, null);
  assert.equal(audits[0].data.details.applied, 4);
  assert.deepEqual(containsAnyFixtureName(audits[0].data), [], 'the audit log holds counts, not names');

  const writesBefore = fake.writes.length;
  const second = await runStudentIdentityRepair({
    db: fake.db, mode: 'execute', now: new Date('2026-10-01T13:00:00Z'), actor: 'operator@example.test', FieldValue: FakeFieldValue,
  });
  assert.equal(second.execution.applied, 0, 'idempotent');
  assert.deepEqual(fake.writes.slice(writesBefore).map((write) => write.type), ['add'], 'only the run\'s own audit entry');
});

test('execute re-checks inside the transaction: a deleted student is not recreated, a teacher\'s edit wins, and chunks stay small', async () => {
  const fake = createFakeFirestore(legacySeed());
  const report = await runStudentIdentityRepair({
    db: fake.db,
    mode: 'execute',
    now: NOW,
    actor: 'operator@example.test',
    FieldValue: FakeFieldValue,
    chunkSize: 2,
    // Runs after planning, before the first write — the window a concurrent
    // change lands in.
    confirm: async ({ counts }) => {
      assert.equal(counts.plannedUpdates, 4);
      fake.remove('grades', 'S-102');
      fake.put('grades', 'S-103', { ...fake.doc('grades', 'S-103'), firstName: 'Robin', lastName: 'Mockford', displayName: 'Robin Mockford' });
      return true;
    },
  });
  assert.equal(report.execution.applied, 2);
  assert.deepEqual(report.execution.skipped, { deleted: 1, noLongerNeeded: 1, planChanged: 0 });
  assert.equal(report.execution.transactions, 2, '4 planned updates in chunks of 2');
  assert.equal(fake.doc('grades', 'S-102'), undefined, 'a deleted student stays deleted');
  assert.equal(fake.doc('grades', 'S-103').displayName, 'Robin Mockford');
  assert.equal(fake.doc('grades', 'S-103').identityBackfill, undefined);

  const masks = fake.reads.filter((read) => read.transaction).map((read) => read.fieldMask);
  assert.ok(masks.every((mask) => JSON.stringify(mask) === JSON.stringify([...STUDENT_READ_FIELDS])), 'transaction reads are projected');
  assert.ok(fake.reads.filter((read) => read.transaction).every((read) => read.documents <= 2));
});

test('a runId is used once, so one rollback can never undo two runs', async () => {
  const fake = createFakeFirestore(legacySeed());
  const first = await runStudentIdentityRepair({ db: fake.db, mode: 'execute', now: NOW, actor: 'operator@example.test', FieldValue: FakeFieldValue });
  fake.put('grades', 'S-900', nameless({ googleName: 'Tatum Retiredson' }));
  const writesBefore = fake.writes.length;
  await assert.rejects(
    runStudentIdentityRepair({ db: fake.db, mode: 'execute', runId: first.runId, now: NOW, actor: 'operator@example.test', FieldValue: FakeFieldValue }),
    /already stamped/,
  );
  assert.equal(fake.writes.length, writesBefore, 'refused before any write');
});

test('a declined confirmation writes nothing', async () => {
  const fake = createFakeFirestore(legacySeed());
  const report = await runStudentIdentityRepair({
    db: fake.db, mode: 'execute', now: NOW, actor: 'operator@example.test', FieldValue: FakeFieldValue, confirm: async () => false,
  });
  assert.equal(report.aborted, true);
  assert.deepEqual(fake.writes, []);
});

test('rollback removes exactly what the run filled and leaves a teacher\'s later correction alone', async () => {
  const fake = createFakeFirestore(legacySeed());
  const run = await runStudentIdentityRepair({ db: fake.db, mode: 'execute', now: NOW, actor: 'operator@example.test', FieldValue: FakeFieldValue });
  // setStudentName after the backfill: new name, stamp deleted.
  const corrected = fake.doc('grades', 'S-102');
  delete corrected.identityBackfill;
  fake.put('grades', 'S-102', { ...corrected, firstName: 'Sage', lastName: 'Testfield', displayName: 'Sage Testfield' });

  const report = await runStudentIdentityRepair({
    db: fake.db, mode: 'rollback', runId: run.runId, now: NOW, actor: 'operator@example.test', FieldValue: FakeFieldValue,
  });
  assert.equal(report.rollback.stampedStudents, 3);
  assert.equal(report.rollback.rolledBack, 3);
  assert.deepEqual(report.rollback.fieldsRemoved, { firstName: 2, lastName: 2, displayName: 3 });

  const restored = fake.doc('grades', 'S-101');
  assert.equal('displayName' in restored, false);
  assert.equal('firstName' in restored, false);
  assert.equal('identityBackfill' in restored, false);
  assert.equal(restored.googleName, 'Rowan Exampleton', 'sources are never touched');
  assert.equal(fake.doc('grades', 'S-102').displayName, 'Sage Testfield', 'a person\'s correction is never rolled back');
  assert.equal(fake.doc('grades', 'S-701').displayName, 'Ellis Placeholt');
  // S-501 kept its stored null first/last: rollback deletes only what was filled.
  assert.equal(fake.doc('grades', 'S-501').firstName, null);
  assert.equal('displayName' in fake.doc('grades', 'S-501'), false);

  const audit = fake.writes.filter((write) => write.type === 'add').at(-1).data;
  assert.equal(audit.action, ROLLBACK_AUDIT_ACTION);
  assert.equal(audit.target, run.runId);
  assert.deepEqual(containsAnyFixtureName(audit), []);
});

test('the command line requires a project, dry-runs by default, and refuses ambiguous flags', () => {
  assert.throws(() => parseRepairArgs([]), /--project <id> is required/);
  const dry = parseRepairArgs(['--project', 'demo-project']);
  assert.equal(dry.mode, 'audit');
  assert.equal(dry.includeStudentIds, false);
  assert.equal(dry.includeNames, false);
  assert.throws(() => parseRepairArgs(['--project', 'demo-project', '--execute']), /--actor <email> is required/);
  assert.equal(parseRepairArgs(['--project', 'demo-project', '--execute', '--actor', 'operator@example.test']).mode, 'execute');
  assert.equal(parseRepairArgs(['--project=demo-project', '--rollback=identity-x', '--actor=operator@example.test']).rollbackRunId, 'identity-x');
  assert.throws(() => parseRepairArgs(['--project', 'demo-project', '--execute', '--rollback', 'identity-x', '--actor', 'a@example.test']), /cannot be combined/);
  assert.throws(() => parseRepairArgs(['--project', 'demo-project', '--exectue']), /Unknown option/);
  assert.throws(() => parseRepairArgs(['--project']), /needs a value/);
  assert.equal(parseRepairArgs(['--help']).help, true);
});
