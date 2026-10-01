// The legacy student-name backfill, against a real Firestore (the emulator).
//
// HOW TO RUN:
//   npx firebase emulators:exec --only firestore --project mathmaster-identity-repair \
//     --config tests/browser/emulator/firebase.json \
//     "node --test tests/integration/studentIdentity/*.test.mjs"
// or `npm run test:identity-repair:emulator`, which CI runs as its own step.
// It deliberately lives OUTSIDE the tests/integration/*.test.mjs glob that
// `npm run test:challenge-finish` runs in parallel: its extra transaction load
// tripped the emulator's "Transaction is invalid or closed" on rewardActions'
// deliberate concurrent-undo race (about 1 run in 6). It SKIPS — rather than
// fails — when FIRESTORE_EMULATOR_HOST is unset.
//
// WHY. tests/platform/studentIdentityRepairPlan.test.mjs proves the planner and
// drives the tool against an in-memory stand-in. Neither can prove what a real
// Firestore does with a projected read, a transaction getAll(fieldMask), an
// update() on a document deleted after planning, a nested serverTimestamp, or
// FieldValue.delete() — and those are exactly what decide whether a student's
// attempt history survives the repair untouched.
//
// ISOLATION. The tool reads the WHOLE grades collection. The other integration
// suites share this emulator and seed their own students, so this suite uses
// its own project id: the emulator keeps each project's data apart, and this
// suite neither sees nor writes theirs.
//
// SOURCES. A Classroom link (googleName, classroomRosterLinks) is a teacher's
// revocable match, so the tool writes a name only when a source independent of
// it agrees. Here that is the creation audit (in Firestore) or the profile of
// the student's own directory-linked Google account, read through a small
// Auth stand-in (fakeAuth): this suite runs only the Firestore emulator.
// IR-LINKONLY is named by the Classroom link alone and must never be written.
//
// Every name and id here is invented for the test.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '';
const PROJECT_ID = 'mathmaster-identity-repair';
// CI runs every integration suite in parallel against ONE emulator project
// (tests/browser/emulator/firebase.json has singleProjectMode). This suite
// scans whole collections and wipes its data, so it works in its own named
// database: it can never see, write or delete another suite's documents.
const DATABASE_ID = 'student-identity-repair';
const SKIP = EMULATOR
  ? false
  : 'FIRESTORE_EMULATOR_HOST is not set — this suite needs the Firestore emulator. Run: '
    + `npx firebase emulators:exec --only firestore --project ${PROJECT_ID} --config tests/browser/emulator/firebase.json `
    + '"node --test tests/integration/studentIdentity/*.test.mjs"';

const ACTOR = 'operator@example.test';
const FIXTURE_NAMES = [
  'Rowan', 'Exampleton', 'Quinn', 'Samplewood', 'Samplecourt', 'Avery', 'Fixtureton', 'Marlo', 'Sampleby',
  'Harper', 'Testwell', 'Sawyer', 'Mockridge', 'Ellis', 'Placeholt', 'Indigo', 'Vanishby', 'Wren', 'Draftly',
  'Finalby', 'Tatum', 'Retiredson', 'Linden', 'Classlinkby',
];
const namesIn = (value) => {
  const text = JSON.stringify(value).toLowerCase();
  return FIXTURE_NAMES.filter((name) => text.includes(name.toLowerCase()));
};

let app;
let db;
let repair;
let Timestamp;
let FieldValue;

// A record exactly as optional-name createStudentAccount left it, carrying a
// history map large enough that loading or rewriting it by accident would show.
const history = () => Object.fromEntries(Array.from({ length: 300 }, (_, index) => [
  `assignment-${String(index).padStart(3, '0')}`,
  {
    score: index % 101,
    submittedAt: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
    attempts: [
      { questionId: `q-${index}-1`, answer: `x=${index}`, correct: index % 2 === 0 },
      { questionId: `q-${index}-2`, answer: `${index}/7`, correct: index % 3 === 0 },
    ],
  },
]));
const nameless = (extra = {}) => ({
  firstName: null,
  lastName: null,
  displayName: null,
  classId: 'class-ir',
  classPeriod: 'Period 3',
  status: 'active',
  assignedTeacherEmail: 'teacher@example.test',
  profile: {},
  gradesByAssignment: history(),
  assignmentActivity: { 'assignment-000': { minutes: 12 } },
  ...extra,
});

const SEED = {
  grades: {
    'IR-ROWAN': nameless({ googleName: 'Rowan Exampleton', googleUserId: 'g-rowan' }),
    'IR-QUINN': nameless(),
    'IR-AVERY': nameless(),
    'IR-MARLO': nameless({ googleName: 'Marlo Jean Sampleby' }),
    'IR-HARPER': nameless({ googleName: 'Harper Testwell' }),
    '555001': nameless({ displayName: '555001' }),
    'IR-ELLIS': nameless({ firstName: 'Ellis', lastName: 'Placeholt', displayName: 'Ellis Placeholt' }),
    'IR-GONE': nameless({ googleName: 'Indigo Vanishby' }),
    'IR-WREN': nameless({ googleName: 'Wren Draftly' }),
    'IR-DISABLED': nameless({ status: 'disabled', googleName: 'Tatum Retiredson' }),
    'IR-LINKONLY': nameless({ googleName: 'Linden Classlinkby' }),
  },
  classroomRosterLinks: {
    'course-ir__IR-QUINN': { studentId: 'IR-QUINN', name: 'Quinn Samplewood', googleUserId: 'g-quinn', courseId: 'course-ir', classId: 'class-ir' },
    'course-ir__IR-HARPER': { studentId: 'IR-HARPER', name: 'Sawyer Mockridge', googleUserId: 'g-harper', courseId: 'course-ir', classId: 'class-ir' },
    'course-ir__IR-LINKONLY': { studentId: 'IR-LINKONLY', name: 'Linden Classlinkby', googleUserId: 'g-linkonly', courseId: 'course-ir', classId: 'class-ir' },
  },
  adminAuditLog: {
    'seed-created-avery': {
      actorUid: 'uid-admin',
      actorEmail: 'admin@example.test',
      action: 'student_account_created',
      target: 'IR-AVERY',
      details: { classId: 'class-ir', firstName: 'Avery', lastName: 'Fixtureton', displayName: 'Avery Fixtureton' },
    },
    'seed-unrelated': { action: 'class_created', target: 'class-ir', details: {} },
  },
  studentAliases: { 'IR-ROWAN': { key: 'IR-ROWAN', studentId: 'IR-ROWAN' } },
  // Each student's own linked Google account. IR-LINKONLY has none.
  studentDirectory: Object.fromEntries(['rowan', 'quinn', 'marlo', 'gone', 'wren', 'disabled'].map((who) => [
    `${who}@example.test`,
    { email: `${who}@example.test`, studentId: `IR-${who.toUpperCase()}`, uid: `uid-${who}` },
  ])),
  studentCredentials: { 'IR-ROWAN': { hash: 'not-a-real-hash', resetRequired: false } },
};
const COLLECTIONS = Object.keys(SEED);

// The Auth profiles of those accounts — each agrees with its student's
// Classroom name, which is what lets the tool write it.
const GOOGLE_PROFILES = {
  'uid-rowan': 'Rowan Exampleton',
  'uid-quinn': 'Quinn Samplewood',
  'uid-marlo': 'Marlo Jean Sampleby',
  'uid-gone': 'Indigo Vanishby',
  'uid-wren': 'Wren Draftly',
  'uid-disabled': 'Tatum Retiredson',
};
const fakeAuth = {
  getUsers: async (identifiers) => ({
    users: identifiers.filter(({ uid }) => GOOGLE_PROFILES[uid]).map(({ uid }) => ({ uid, displayName: GOOGLE_PROFILES[uid] })),
    notFound: identifiers.filter(({ uid }) => !GOOGLE_PROFILES[uid]),
  }),
};

const clearProject = async () => {
  const response = await fetch(
    `http://${EMULATOR}/emulator/v1/projects/${app.options.projectId}/databases/${DATABASE_ID}/documents`,
    { method: 'DELETE' },
  );
  assert.ok(response.ok, `could not clear the emulator project (${response.status})`);
};

const seed = async () => {
  const batch = db.batch();
  Object.entries(SEED).forEach(([collection, docs]) => {
    Object.entries(docs).forEach(([id, data]) => batch.set(db.collection(collection).doc(String(id)), data));
  });
  await batch.commit();
};

/** path -> { updateTime, data } for every document the suite seeded or the tool wrote. */
const snapshotAll = async () => {
  const entries = [];
  for (const collection of COLLECTIONS) {
    const snapshot = await db.collection(collection).get();
    snapshot.docs.forEach((doc) => entries.push([
      `${collection}/${doc.id}`,
      { updateTime: `${doc.updateTime.seconds}.${doc.updateTime.nanoseconds}`, data: JSON.stringify(doc.data()) },
    ]));
  }
  return new Map(entries.sort(([a], [b]) => a.localeCompare(b)));
};

const student = async (id) => {
  const snapshot = await db.collection('grades').doc(id).get();
  return snapshot.exists ? snapshot.data() : null;
};

let historyAsStored = null;
let runId = null;

before(async () => {
  if (SKIP) return;
  const resolveFromFunctions = (specifier) => require(require.resolve(specifier, { paths: [path.join(repo, 'functions')] }));
  const admin = resolveFromFunctions('firebase-admin');
  const firestoreModule = resolveFromFunctions('firebase-admin/firestore');
  ({ Timestamp, FieldValue } = firestoreModule);
  // A named app: other suites in the same process tree own the default one.
  app = admin.initializeApp({ projectId: PROJECT_ID }, 'student-identity-repair-integration');
  db = firestoreModule.getFirestore(app, DATABASE_ID);
  repair = await import(path.join(repo, 'scripts/student-identity-repair.mjs'));
  await clearProject();
  await seed();
  historyAsStored = JSON.stringify((await student('IR-ROWAN')).gradesByAssignment);
});

after(async () => {
  if (app) await app.delete();
});

test('the dry run reads everything it needs and writes nothing', { skip: SKIP }, async () => {
  const before = await snapshotAll();
  const report = await repair.runStudentIdentityRepair({ db, auth: fakeAuth, mode: 'audit', actor: ACTOR });
  const withoutProfiles = await repair.runStudentIdentityRepair({ db, mode: 'audit', actor: ACTOR });
  const after = await snapshotAll();
  assert.deepEqual([...after.entries()], [...before.entries()], 'a dry run must not change a single document');

  assert.equal(report.dryRun, true);
  assert.equal(report.runId, null);
  assert.equal(report.sources.students, 11);
  assert.equal(report.sources.accountCreationAudits, 1);
  assert.deepEqual(report.sources.googleProfiles, { linkedAccounts: 6, withDisplayName: 6, accountsNotFound: 0 });
  assert.equal(report.counts.plannedUpdates, 7);
  assert.equal(report.counts.plannedUpdatesBySource.googleName, 5);
  assert.equal(report.counts.plannedUpdatesBySource.classroomRosterLink, 1);
  assert.equal(report.counts.plannedUpdatesBySource.accountCreationAudit, 1);
  assert.deepEqual(report.counts.unresolved, { total: 2, noAuthoritativeSource: 1, conflictingSources: 1 });
  // IR-MARLO (three words) and IR-LINKONLY (Classroom link only).
  assert.equal(report.counts.needsStructuredNameConfirmation, 2);
  assert.equal(report.counts.active.classroomNameAwaitingConfirmation, 1);
  assert.equal(report.counts.disabledStudents, 1);
  assert.deepEqual(namesIn(report), [], 'the default report holds counts only');

  // Without the Google profiles, every googleName/roster-link student is
  // Classroom-only: only the creation-audit student is planned.
  assert.equal(withoutProfiles.sources.googleProfiles, 'skipped');
  assert.equal(withoutProfiles.counts.plannedUpdates, 1);
  assert.equal(withoutProfiles.counts.plannedUpdatesBySource.accountCreationAudit, 1);
  // ROWAN, QUINN, MARLO, GONE, WREN, LINKONLY (the disabled one is not tallied as active).
  assert.equal(withoutProfiles.counts.active.classroomNameAwaitingConfirmation, 6);
});

test('execute fills the missing names, stamps them, leaves history untouched, and respects changes made after planning', { skip: SKIP }, async () => {
  const before = await snapshotAll();
  const report = await repair.runStudentIdentityRepair({
    db,
    auth: fakeAuth,
    mode: 'execute',
    actor: ACTOR,
    now: new Date('2026-10-01T12:00:00Z'),
    chunkSize: 3,
    // After planning, before the first write: a student is deleted and a
    // teacher names another one. Neither may be overwritten or recreated.
    confirm: async ({ counts }) => {
      assert.equal(counts.plannedUpdates, 7);
      await db.collection('grades').doc('IR-GONE').delete();
      await db.collection('grades').doc('IR-WREN').update({
        firstName: 'Wren', lastName: 'Finalby', displayName: 'Wren Finalby', identityBackfill: FieldValue.delete(),
      });
      return true;
    },
  });
  runId = report.runId;
  assert.equal(runId, 'identity-20261001T120000Z');
  assert.equal(report.execution.applied, 5);
  assert.deepEqual(report.execution.skipped, { deleted: 1, noLongerNeeded: 1, planChanged: 0 });
  assert.equal(report.execution.transactions, 3, '7 planned updates in chunks of 3');

  assert.equal(await student('IR-GONE'), null, 'update() never recreates a deleted student');
  const wren = await student('IR-WREN');
  assert.equal(wren.displayName, 'Wren Finalby', 'the teacher\'s name wins');
  assert.equal(wren.identityBackfill, undefined);

  const rowan = await student('IR-ROWAN');
  assert.equal(rowan.firstName, 'Rowan');
  assert.equal(rowan.lastName, 'Exampleton');
  assert.equal(rowan.displayName, 'Rowan Exampleton');
  assert.equal(rowan.googleName, 'Rowan Exampleton');
  assert.equal(JSON.stringify(rowan.gradesByAssignment), historyAsStored, 'attempt history byte-identical');
  assert.deepEqual(rowan.assignmentActivity, { 'assignment-000': { minutes: 12 } });
  assert.ok(rowan.identityBackfill.at instanceof Timestamp, 'the stamp time is the server\'s');
  assert.deepEqual({ ...rowan.identityBackfill, at: null }, {
    runId, at: null, source: 'googleName', split: 'twoPartName', filledFields: ['displayName', 'firstName', 'lastName'], version: 1,
  });

  assert.deepEqual(
    (({ firstName, lastName, displayName }) => ({ firstName, lastName, displayName }))(await student('IR-QUINN')),
    { firstName: 'Quinn', lastName: 'Samplewood', displayName: 'Quinn Samplewood' },
  );
  assert.equal((await student('IR-AVERY')).identityBackfill.source, 'accountCreationAudit');
  const marlo = await student('IR-MARLO');
  assert.equal(marlo.displayName, 'Marlo Jean Sampleby');
  assert.equal(marlo.firstName, null, 'an ambiguous split is never written');
  assert.deepEqual(marlo.identityBackfill.filledFields, ['displayName']);

  const after = await snapshotAll();
  for (const untouched of ['grades/IR-ELLIS', 'grades/IR-HARPER', 'grades/555001', 'grades/IR-LINKONLY', 'classroomRosterLinks/course-ir__IR-QUINN', 'adminAuditLog/seed-created-avery']) {
    assert.deepEqual(after.get(untouched), before.get(untouched), `${untouched} must not be written`);
  }
  const linkOnly = await student('IR-LINKONLY');
  assert.deepEqual([linkOnly.firstName, linkOnly.lastName, linkOnly.displayName], [null, null, null],
    'a Classroom-only name is never made canonical');
  assert.equal(linkOnly.googleName, 'Linden Classlinkby');

  const audits = await db.collection('adminAuditLog').where('action', '==', repair.BACKFILL_AUDIT_ACTION).get();
  assert.equal(audits.size, 1);
  const audit = audits.docs[0].data();
  assert.equal(audit.target, runId);
  assert.equal(audit.actorEmail, ACTOR);
  assert.equal(audit.actorUid, null);
  assert.equal(audit.details.applied, 5);
  assert.deepEqual(namesIn(audit), [], 'the audit entry holds counts, not names');
});

test('running execute again changes nothing', { skip: SKIP }, async () => {
  const before = await snapshotAll();
  const report = await repair.runStudentIdentityRepair({ db, auth: fakeAuth, mode: 'execute', actor: ACTOR, now: new Date('2026-10-01T13:00:00Z') });
  assert.equal(report.execution.attempted, 0);
  assert.equal(report.execution.applied, 0);
  const after = await snapshotAll();
  const changed = [...after.keys()].filter((key) => JSON.stringify(after.get(key)) !== JSON.stringify(before.get(key)));
  assert.equal(changed.length, 1, `only the run's own audit entry is new: ${changed.join(', ')}`);
  assert.match(changed[0], /^adminAuditLog\//);
});

test('rollback removes exactly what the run filled; a teacher\'s later correction and all academic data survive', { skip: SKIP }, async () => {
  assert.ok(runId, 'the execute test ran first');
  // setStudentName after the backfill: a new name, and the stamp deleted.
  await db.collection('grades').doc('IR-QUINN').update({
    firstName: 'Quinn', lastName: 'Samplecourt', displayName: 'Quinn Samplecourt', identityBackfill: FieldValue.delete(),
  });
  const before = await snapshotAll();

  const report = await repair.runStudentIdentityRepair({ db, mode: 'rollback', runId, actor: ACTOR });
  assert.equal(report.rollback.stampedStudents, 4);
  assert.equal(report.rollback.rolledBack, 4);
  assert.deepEqual(report.rollback.fieldsRemoved, { firstName: 3, lastName: 3, displayName: 4 });

  const rowan = await student('IR-ROWAN');
  for (const field of ['firstName', 'lastName', 'displayName', 'identityBackfill']) {
    assert.equal(field in rowan, false, `${field} is removed`);
  }
  assert.equal(rowan.googleName, 'Rowan Exampleton', 'the source the name came from is never touched');
  assert.equal(JSON.stringify(rowan.gradesByAssignment), historyAsStored, 'attempt history byte-identical after rollback');
  assert.equal(rowan.classId, 'class-ir');

  const marlo = await student('IR-MARLO');
  assert.equal('displayName' in marlo, false);
  assert.equal(marlo.firstName, null, 'a field the run did not fill is left exactly as it was');

  assert.equal((await student('IR-QUINN')).displayName, 'Quinn Samplecourt', 'a person\'s correction is never rolled back');
  assert.equal((await student('IR-WREN')).displayName, 'Wren Finalby');
  assert.equal(await student('IR-GONE'), null);

  const after = await snapshotAll();
  for (const untouched of ['grades/IR-QUINN', 'grades/IR-WREN', 'grades/IR-ELLIS', 'grades/IR-HARPER', 'grades/555001', 'grades/IR-LINKONLY']) {
    assert.deepEqual(after.get(untouched), before.get(untouched), `${untouched} must not be written by the rollback`);
  }
  const audits = await db.collection('adminAuditLog').where('action', '==', repair.ROLLBACK_AUDIT_ACTION).get();
  assert.equal(audits.size, 1);
  assert.equal(audits.docs[0].data().target, runId);
  assert.deepEqual(namesIn(audits.docs[0].data()), []);

  const again = await repair.runStudentIdentityRepair({ db, mode: 'rollback', runId, actor: ACTOR });
  assert.equal(again.rollback.rolledBack, 0, 'a second rollback finds nothing stamped');
});
