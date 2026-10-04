// A FULL REHEARSAL OF THE STAGED MIGRATION — THE OPERATOR'S OWN SEQUENCE, ON EVERY REAL LEGACY SHAPE.
//
// Seeds the legacy fixtures (tests/fixtures/studentAssignmentOverrideLegacyFixtures.mjs:
// one assignment carrying every per-student control shape the platform has
// written, V1-V8, plus a classmate with none), a lesson with nothing
// per-student and a few filler lessons, then runs the REAL root-admin
// callables in the order the admin card (StudentControlsMigrationCard) runs
// them — each paged pass driven by the card's own pass runner
// (src/platform/admin/studentControlsMigration.js) — printing each report:
//
//   1. status: every retirement gate fails, the stage is "Backfill incomplete";
//   2. a dry run of the backfill (writes nothing);
//   3. a real backfill "interrupted" after one page, resumed by the card from
//      the server's cursor: ONE pass, counted by the server;
//   4. retire refused: the client cutover is not recorded;
//   5. the client cutover recorded (the emulator cannot read the live build,
//      so the deployment is attested — as the card asks for it);
//   6. retire refused: the release has not been live for a full school day;
//   7. THE ONE FIXTURE: the cutover record back-dated a week (a rehearsal
//      cannot wait a school day; production waits for real);
//   8. retire refused without the typed phrase, and without the school-day
//      attestation; then retired;
//   9. the strip refused before its own dry run; the dry run (the six numbers
//      the card shows); the typed strip; a second strip that finds nothing;
//  10. the 30-day clock, started by that clean full strip;
//  11. the rollback: restore refused while retired; the switch off (never
//      gated; the cutover record is set aside, so retiring again starts
//      over); a restore dry run; the typed restore — and a previous-release
//      client, reading only the shared copy, sees the same access again.
//
// After every stage it recomputes every student's effective access — final
// cutoff, extra DOL attempts, excused, reopened — the way the server does, and
// checks it equals what the legacy document gave before anything ran.
//
// FULL passes (no id prefix): this emulator project holds only the
// rehearsal's documents. The integration suite shares one database between
// files, so it runs canaries there and pins the full-pass gate with fixtures.
//
// HOW TO RUN (an isolated emulator project):
//
//   npx firebase emulators:exec --only firestore --project mathmaster-override-rehearsal \
//     --config tests/browser/emulator/firebase.json \
//     "node scripts/rehearse-student-assignment-overrides-migration.mjs"
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALL_STUDENTS, CLASS_ID, TEACHER, legacyAssignment,
} from '../tests/fixtures/studentAssignmentOverrideLegacyFixtures.mjs';
import { db, fns } from '../tests/integration/canonicalPersistenceHarness.mjs';
import {
  ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION,
  OVERRIDE_MIGRATION_ID,
  PLATFORM_MIGRATIONS_COLLECTION,
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  resolveStudentOverride,
  sharedAssignmentIsClean,
  studentAssignmentOverrideId,
} from '../functions/shared/studentAssignmentOverrides.mjs';
import {
  OVERRIDE_MIGRATION_STAGE,
  RESTORE_CONFIRMATION,
  RETIRE_CONFIRMATION,
  STRIP_CONFIRMATION,
} from '../functions/shared/overrideRetirementGate.mjs';
import { assignmentFinalCloseAt } from '../functions/shared/sectionDeadline.mjs';
import { resolveTeacherGrantedExtraAttempts } from '../functions/shared/attemptPolicy.mjs';
import { runStudentControlsMigrationPass, stripReportRows } from '../src/platform/admin/studentControlsMigration.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { ROOT_ADMIN_EMAIL } = require(path.join(here, '../functions/shared/rolePolicyIdentity.cjs'));

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run this through firebase emulators:exec — never against a real project.');

const PREFIX = 'rehearsal-';
const LEGACY = `${PREFIX}a1`;
const PLAIN = `${PREFIX}a2`;
const FILLERS = Array.from({ length: 4 }, (_, index) => `${PREFIX}filler-${index}`);
const DAY = 86_400_000;
const root = (data) => ({
  auth: { uid: 'rehearsal-root', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const migrateCallable = (data) => fns.migrateStudentAssignmentOverrides.run(root(data));
const storage = (data) => fns.setAssignmentOverrideStorage.run(root(data));
const refusalCode = (promise) => promise.then(() => null, (error) => error?.code || String(error));
/** One whole pass, as the admin card runs it (paged, resumed from the server's cursor). */
const cardPass = (request) => runStudentControlsMigrationPass({
  ...request,
  migrate: migrateCallable,
  readProgress: async () => (await storage({ action: 'status' })).migration,
});
const progressRef = db.collection(PLATFORM_MIGRATIONS_COLLECTION).doc(OVERRIDE_MIGRATION_ID);

/** Every student's effective access, the way the server answers it. */
const effectiveAccess = async ({ readPrivate }) => {
  const assignment = { id: LEGACY, ...(await db.collection('assignments').doc(LEGACY).get()).data() };
  const out = {};
  for (const studentId of ALL_STUDENTS) {
    // eslint-disable-next-line no-await-in-loop
    const privateOverride = readPrivate
      ? ((await db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).doc(studentAssignmentOverrideId(studentId, LEGACY)).get()).data() || null)
      : undefined;
    const controls = resolveStudentOverride({ assignment, studentId, privateOverride });
    out[studentId] = {
      finalCloseAt: new Date(assignmentFinalCloseAt(assignment, 'America/Chicago', studentId, null, { privateOverride })).toISOString(),
      dolExtraAttempts: resolveTeacherGrantedExtraAttempts({ assignment, activityRole: 'dol', classId: CLASS_ID, studentId, privateOverride }),
      excused: controls?.excused === true,
      reopened: controls?.reopened === true,
    };
  }
  return out;
};

const brief = (report) => {
  const keep = [
    'dryRun', 'startAfter', 'nextCursor', 'done', 'sharedRetired', 'pages', 'resumedFrom', 'pass', 'assignmentsScanned',
    'assignmentsWithSharedStudentData', 'sharedStudentEntries', 'recordsCreated', 'recordsUpdated', 'recordsUnchanged',
    'recordsConfirmedPrivate', 'auditCopiesCreated', 'extensionDetailsMoved', 'derivedFieldsIgnored', 'assignmentsStripped',
    'assignmentsAlreadyClean', 'assignmentsAwaitingAbsorption', 'studentsAwaitingAbsorption', 'archivesToWrite',
    'archivesWritten', 'assignmentsRestored', 'sharedWritesRestored', 'failures',
  ];
  return Object.fromEntries(keep.filter((key) => key in report).map((key) => [key, report[key]]));
};
const gateSummary = (readiness) => ({
  stage: readiness.stage,
  canRetire: readiness.canRetire,
  failing: readiness.gates.filter((gate) => !gate.ok).map((gate) => gate.id),
});

/* --- the legacy world --------------------------------------------------- */

await db.collection('platformFlags').doc('assignmentOverrideStorage').delete().catch(() => {});
await progressRef.delete().catch(() => {});
await db.collection('classes').doc(CLASS_ID).set({ name: 'Rehearsal class', period: 'Period 1', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
for (const studentId of ALL_STUDENTS) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(studentId).set({ displayName: studentId, classId: CLASS_ID, assignedTeacherEmail: TEACHER, status: 'active', gradesByAssignment: {} });
}
const { id: _fixtureId, ...legacy } = legacyAssignment();
await db.collection('assignments').doc(LEGACY).set(legacy);
await db.collection('assignments').doc(PLAIN).set({ title: 'Nothing per-student', assignedClassIds: [CLASS_ID], dueAt: '2026-09-18T23:59:59.000Z' });
for (const id of FILLERS) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('assignments').doc(id).set({ title: id, assignedClassIds: [CLASS_ID], dueAt: '2026-09-18T23:59:59.000Z' });
}

const before = await effectiveAccess({ readPrivate: false });
const stages = [];
const check = async (stage, report, { readPrivate = true, extra = {} } = {}) => {
  const access = await effectiveAccess({ readPrivate });
  const same = JSON.stringify(access) === JSON.stringify(before);
  stages.push({ stage, report: report ? brief(report) : null, everyStudentsAccessUnchanged: same, ...extra });
  assert.equal(same, true, `${stage}: a student's effective access changed`);
};
const record = (stage, value) => { stages.push({ stage, ...value }); return value; };

/* 1 */ const initial = await storage({ action: 'status' });
assert.equal(initial.readiness.stage, OVERRIDE_MIGRATION_STAGE.BACKFILL_INCOMPLETE);
assert.equal(initial.readiness.gates.every((gate) => !gate.ok), true);
record('status before anything ran', { gates: gateSummary(initial.readiness) });

/* 2 */ await check('dry-run backfill (the card: "Dry run")', await cardPass({ mode: 'backfill', dryRun: true }), { readPrivate: false });

/* 3 */ const firstPage = await migrateCallable({ mode: 'backfill', dryRun: false, maxAssignments: 1 });
assert.equal(firstPage.done, false);
await check('backfill, first page only (the operator\'s browser closed)', firstPage);
const resumed = await cardPass({ mode: 'backfill', dryRun: false });
assert.equal(resumed.resumedFrom, firstPage.nextCursor, 'the card resumed from the server\'s cursor');
assert.equal(resumed.pass.completed, true);
assert.equal(resumed.pass.pages, 2, 'one pass: the interrupted page and the rest');
assert.equal(resumed.pass.failureCount, 0);
await check('backfill resumed by the card to the end', resumed);
const afterBackfill = await storage({ action: 'status' });
record('status after the full backfill', { gates: gateSummary(afterBackfill.readiness) });
assert.deepEqual(gateSummary(afterBackfill.readiness).failing, ['clientCutoverDeployed', 'liveOneFullSchoolDay']);

/* 4 */ record('retire before the cutover is recorded', {
  refused: await refusalCode(storage({ action: 'retire', confirmation: RETIRE_CONFIRMATION, attestFullSchoolDay: true })),
});

/* 5 */ record('record the cutover without attesting (the server cannot read the live build here)', {
  refused: await refusalCode(storage({ action: 'confirmClientCutover' })),
});
const confirmed = await storage({ action: 'confirmClientCutover', attestHostingDeployed: true });
record('client cutover recorded (attested)', { gates: gateSummary(confirmed.readiness), hosting: confirmed.readiness.hosting });

/* 6 */ record('retire the same day', {
  refused: await refusalCode(storage({ action: 'retire', confirmation: RETIRE_CONFIRMATION, attestFullSchoolDay: true })),
  gates: gateSummary((await storage({ action: 'status' })).readiness),
});

/* 7 */ const progress = (await progressRef.get()).data();
await progressRef.set({ ...progress, cutover: { ...progress.cutover, confirmedAtMs: progress.cutover.confirmedAtMs - 7 * DAY } });
const waited = await storage({ action: 'status' });
assert.equal(waited.readiness.stage, OVERRIDE_MIGRATION_STAGE.READY_TO_RETIRE);
record('FIXTURE: the cutover record back-dated a week (a rehearsal cannot wait a school day)', { gates: gateSummary(waited.readiness) });

/* 8 */ record('retire without the typed phrase', { refused: await refusalCode(storage({ action: 'retire', attestFullSchoolDay: true })) });
record('retire without the school-day attestation', { refused: await refusalCode(storage({ action: 'retire', confirmation: RETIRE_CONFIRMATION })) });
const retired = await storage({ action: 'retire', confirmation: RETIRE_CONFIRMATION, attestFullSchoolDay: true });
assert.equal(retired.sharedRetired, true);
await check('retired (typed phrase + attestation)', null, { extra: { gates: gateSummary(retired.readiness) } });

/* 9 */ record('strip before its own dry run', {
  refused: await refusalCode(migrateCallable({ mode: 'strip', dryRun: false, confirm: STRIP_CONFIRMATION })),
});
const dryStrip = await cardPass({ mode: 'strip', dryRun: true });
await check('dry-run strip (the card\'s six numbers below)', dryStrip, { extra: { cardRows: stripReportRows(dryStrip) } });
assert.equal(sharedAssignmentIsClean((await db.collection('assignments').doc(LEGACY).get()).data()), false, 'the dry run stripped nothing');
const strip = await cardPass({ mode: 'strip', dryRun: false, confirm: STRIP_CONFIRMATION });
await check('strip (typed)', strip, { extra: { cardRows: stripReportRows(strip) } });
const secondStrip = await cardPass({ mode: 'strip', dryRun: false, confirm: STRIP_CONFIRMATION });
assert.equal(secondStrip.assignmentsStripped, 0);
await check('second strip', secondStrip);
const shared = (await db.collection('assignments').doc(LEGACY).get()).data();
const archives = await db.collection(ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION).where('assignmentId', '==', LEGACY).get();

/* 10 */ const clean = await storage({ action: 'status' });
assert.equal(typeof clean.readiness.legacyIgnore.cleanSinceMs, 'number');
record('the 30-day legacy-ignore clock', { legacyIgnore: clean.readiness.legacyIgnore });

/* 11 */ record('restore while retired', {
  refused: await refusalCode(migrateCallable({ mode: 'restore', dryRun: false, confirm: RESTORE_CONFIRMATION })),
});
const mirrored = await storage({ action: 'mirror' });
assert.equal(mirrored.sharedRetired, false);
record('switch: keep the shared copy in step again (never gated)', { report: { sharedRetired: mirrored.sharedRetired, mirrorShared: mirrored.mirrorShared } });
await check('restore dry run', await cardPass({ mode: 'restore', dryRun: true }));
const restore = await cardPass({ mode: 'restore', dryRun: false, confirm: RESTORE_CONFIRMATION });
// A previous-release client reads only the shared copy: after the restore it must see the same access again.
await check('restore (read as a previous-release client: shared copy only)', restore, { readPrivate: false });
const afterRestore = await storage({ action: 'status' });
assert.equal(afterRestore.readiness.legacyIgnore.cleanSinceMs, null, 'a restore resets the 30-day clock');
assert.deepEqual(gateSummary(afterRestore.readiness).failing, ['clientCutoverDeployed', 'liveOneFullSchoolDay'], 'retiring again starts over');
record('status after the rollback', { gates: gateSummary(afterRestore.readiness), legacyIgnore: afterRestore.readiness.legacyIgnore });

const audit = await db.collection('adminAuditLog').where('action', '>=', 'student_assignment_overrides_').where('action', '<', 'student_assignment_overrides_~').get();
const records = await db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION).where('assignmentId', '==', LEGACY).get();
console.log(JSON.stringify({
  fixtureStudents: ALL_STUDENTS,
  effectiveAccessBefore: before,
  stages,
  afterStrip: {
    sharedDocumentClean: sharedAssignmentIsClean(shared),
    classWideControlsKept: { attemptGrantsByClassId: shared.dol?.attemptGrantsByClassId, recoveryAuditEntries: (shared.dol?.recoveryAudit || []).length },
    archives: archives.size,
  },
  adminAudit: audit.docs.map((doc) => doc.data().action).sort(),
  privateRecords: records.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, lateDueAt: data.lateDueAt, extension: data.extension, excused: data.excused, reopened: data.reopened, dolExtraAttempts: data.dolExtraAttempts, source: data.source, revision: data.revision };
  }),
}, null, 2));
process.exit(0);
