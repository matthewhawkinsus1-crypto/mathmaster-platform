// A FULL REHEARSAL OF THE STAGED MIGRATION, ON EVERY REAL LEGACY SHAPE.
//
// Seeds the legacy fixtures (tests/fixtures/studentAssignmentOverrideLegacyFixtures.mjs:
// one assignment carrying every per-student control shape the platform has
// written, V1-V8, plus a classmate with none) and a lesson with nothing
// per-student, then runs the REAL root-admin callables exactly as the runbook
// does, printing each report:
//
//   1. dry run of the backfill (writes nothing);
//   2. a real backfill "interrupted" after one page, resumed from its cursor;
//   3. a second backfill (writes nothing);
//   4. the strip refused while the shared copy is kept in step;
//   5. the switch turned to retired, a dry-run strip, the strip, a second strip;
//   6. the rollback: restore refused while retired, then the switch off and a restore.
//
// After every stage it recomputes every student's effective access — final
// cutoff, extra DOL attempts, excused, reopened — the way the server does, and
// checks it equals what the legacy document gave before anything ran.
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
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  resolveStudentOverride,
  sharedAssignmentIsClean,
  studentAssignmentOverrideId,
} from '../functions/shared/studentAssignmentOverrides.mjs';
import { assignmentFinalCloseAt } from '../functions/shared/sectionDeadline.mjs';
import { resolveTeacherGrantedExtraAttempts } from '../functions/shared/attemptPolicy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { ROOT_ADMIN_EMAIL } = require(path.join(here, '../functions/shared/rolePolicyIdentity.cjs'));

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run this through firebase emulators:exec — never against a real project.');

const PREFIX = 'rehearsal-';
const LEGACY = `${PREFIX}a1`;
const PLAIN = `${PREFIX}a2`;
const root = (data) => ({
  auth: { uid: 'rehearsal-root', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const migrate = (data) => fns.migrateStudentAssignmentOverrides.run(root({ assignmentIdPrefix: PREFIX, ...data }));
const setRetired = (sharedRetired) => fns.setAssignmentOverrideStorage.run(root({ sharedRetired }));
const refusalCode = (promise) => promise.then(() => null, (error) => error?.code || String(error));

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
    'dryRun', 'startAfter', 'nextCursor', 'done', 'sharedRetired', 'assignmentsScanned', 'assignmentsWithSharedStudentData',
    'sharedStudentEntries', 'recordsCreated', 'recordsUpdated', 'recordsUnchanged', 'auditCopiesCreated', 'extensionDetailsMoved',
    'derivedFieldsIgnored', 'assignmentsStripped', 'assignmentsAlreadyClean', 'assignmentsAwaitingAbsorption', 'archivesWritten',
    'assignmentsRestored', 'sharedWritesRestored', 'failures',
  ];
  return Object.fromEntries(keep.filter((key) => key in report).map((key) => [key, report[key]]));
};

/* --- the legacy world --------------------------------------------------- */

await db.collection('platformFlags').doc('assignmentOverrideStorage').delete().catch(() => {});
await db.collection('classes').doc(CLASS_ID).set({ name: 'Rehearsal class', period: 'Period 1', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
for (const studentId of ALL_STUDENTS) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('grades').doc(studentId).set({ displayName: studentId, classId: CLASS_ID, assignedTeacherEmail: TEACHER, status: 'active', gradesByAssignment: {} });
}
const { id: _fixtureId, ...legacy } = legacyAssignment();
await db.collection('assignments').doc(LEGACY).set(legacy);
await db.collection('assignments').doc(PLAIN).set({ title: 'Nothing per-student', assignedClassIds: [CLASS_ID], dueAt: '2026-09-18T23:59:59.000Z' });

const before = await effectiveAccess({ readPrivate: false });
const stages = [];
const check = async (stage, report, { readPrivate = true } = {}) => {
  const access = await effectiveAccess({ readPrivate });
  const same = JSON.stringify(access) === JSON.stringify(before);
  stages.push({ stage, report: report ? brief(report) : null, everyStudentsAccessUnchanged: same });
  assert.equal(same, true, `${stage}: a student's effective access changed`);
};

/* 1 */ await check('dry-run backfill', await migrate({ mode: 'backfill' }), { readPrivate: false });
/* 2 */ const firstPage = await migrate({ mode: 'backfill', dryRun: false, maxAssignments: 1 });
await check('backfill, first page only (interrupted)', firstPage);
let cursor = firstPage.nextCursor;
while (cursor) {
  // eslint-disable-next-line no-await-in-loop
  const page = await migrate({ mode: 'backfill', dryRun: false, maxAssignments: 1, startAfter: cursor });
  // eslint-disable-next-line no-await-in-loop
  await check(`backfill resumed after ${cursor}`, page);
  cursor = page.nextCursor;
}
/* 3 */ await check('second backfill', await migrate({ mode: 'backfill', dryRun: false }));
/* 4 */ stages.push({ stage: 'strip while the shared copy is kept in step', refused: await refusalCode(migrate({ mode: 'strip', dryRun: false })) });
/* 5 */ stages.push({ stage: 'switch: retire the shared copy', report: await setRetired(true) });
await check('dry-run strip', await migrate({ mode: 'strip' }));
await check('strip', await migrate({ mode: 'strip', dryRun: false }));
await check('second strip', await migrate({ mode: 'strip', dryRun: false }));
const shared = (await db.collection('assignments').doc(LEGACY).get()).data();
const archives = await db.collection(ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION).where('assignmentId', '==', LEGACY).get();
/* 6 */ stages.push({ stage: 'restore while retired', refused: await refusalCode(migrate({ mode: 'restore', dryRun: false })) });
stages.push({ stage: 'switch: keep the shared copy in step again', report: await setRetired(false) });
const restore = await migrate({ mode: 'restore', dryRun: false });
// A previous-release client reads only the shared copy: after the restore it must see the same access again.
await check('restore (read as a previous-release client: shared copy only)', restore, { readPrivate: false });

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
  privateRecords: records.docs.map((doc) => {
    const data = doc.data();
    return { id: doc.id, lateDueAt: data.lateDueAt, extension: data.extension, excused: data.excused, reopened: data.reopened, dolExtraAttempts: data.dolExtraAttempts, source: data.source, revision: data.revision };
  }),
}, null, 2));
process.exit(0);
