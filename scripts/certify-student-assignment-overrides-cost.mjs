// WHAT MOVING A STUDENT'S CONTROLS OFF THE SHARED ASSIGNMENT COSTS — AND SAVES.
//
// Drives the REAL exported Cloud Functions against the Firestore emulator for a
// class of 30 and of 60 students and counts every document the server reads
// and writes per operation, at the SDK's own choke points (each document a
// BatchGetDocuments returns, each query result — at least one read, as
// Firestore bills it — and each write a commit carries). It also measures
// what a student's device receives: the shared assignment's bytes, and how
// many classmates' controls ride on it.
//
// HOW TO RUN (an isolated emulator project; nothing reaches a real project):
//
//   npx firebase emulators:exec --only firestore --project mathmaster-override-cost \
//     --config tests/browser/emulator/firebase.json \
//     "node scripts/certify-student-assignment-overrides-cost.mjs"
//
// BEFORE/AFTER. `--repo <checkout>` measures another checkout's functions with
// the identical scenario — e.g. a worktree of `main` (with this checkout's
// functions/node_modules linked in) for the "before" column:
//
//   git worktree add ../mm-main origin/main
//   ln -s "$PWD/functions/node_modules" ../mm-main/functions/node_modules
//   npx firebase emulators:exec ... "node scripts/certify-student-assignment-overrides-cost.mjs --repo ../mm-main"
//
// A checkout without private storage (no `migrateStudentAssignmentOverrides`
// export) is measured once, as "legacy". This one is measured twice: with the
// shared copy still kept in step for previous-release clients ("mirror",
// Stages 1-3) and after it is retired and stripped ("retired", Stage 4).
//
// This script measures the SERVER. What each device's listeners receive — the
// real client modules, as 30/60 student devices and a teacher, under the real
// rules — is measured by scripts/certify-student-controls-client-cost.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const repo = path.resolve(argValue('--repo', path.resolve(here, '..')));
const classSizes = argValue('--students', '30,60').split(',').map(Number).filter((n) => n > 0);

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run this through firebase emulators:exec — never against a real project.');

const require = createRequire(path.join(repo, 'functions/index.js'));
const harness = await import(pathToFileURL(path.join(repo, 'tests/integration/canonicalPersistenceHarness.mjs')).href);
const { db, fns, runClassroomSync, studentRequest, teacherRequest } = harness;
const { ROOT_ADMIN_EMAIL } = require('./shared/rolePolicyIdentity.cjs');
const { rosterLinkDocumentId } = require('./lib/publication.js');
const { buildDolAttemptGrant } = await import(pathToFileURL(path.join(repo, 'src/platform/assessment/assessmentRecovery.js')).href);
// The measured class and lessons are this checkout's, whichever functions run.
const { DAY, bytes, costLesson, legacyControls, withControls } = await import(pathToFileURL(path.join(here, 'lib/studentControlsCostFixtures.mjs')).href);
// Typed by the operator for a real strip (functions/shared/overrideRetirementGate.mjs);
// a checkout from before the gate ignores it.
const STRIP_CONFIRMATION = 'STRIP SHARED COPIES';

const commit = (() => {
  try { return execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
})();
const privateStorage = typeof fns.migrateStudentAssignmentOverrides?.run === 'function';

/* --- counting at the SDK's choke points ----------------------------------- */

const sdkRoot = path.dirname(require.resolve('@google-cloud/firestore/package.json'));
const { DocumentReader } = require(path.join(sdkRoot, 'build/src/document-reader.js'));
const { Query } = require(path.join(sdkRoot, 'build/src/reference/query.js'));
const { WriteBatch } = require(path.join(sdkRoot, 'build/src/write-batch.js'));

const counts = { reads: 0, writes: 0, readsByCollection: {}, writesByCollection: {} };
const collectionOf = (docPath) => {
  const segments = String(docPath).split('/');
  // grades/{id}/assignmentOverrideEvents/{id} → grades/*/assignmentOverrideEvents
  return segments.length > 2 ? `${segments[0]}/*/${segments[2]}` : segments[0];
};
const bump = (bucket, key, by) => { bucket[key] = (bucket[key] || 0) + by; };

const originalReaderGet = DocumentReader.prototype._get;
DocumentReader.prototype._get = function countedReaderGet(...args) {
  const names = new Set(this.allDocuments.map((ref) => ref.formattedName));
  counts.reads += names.size;
  this.allDocuments.forEach((ref) => bump(counts.readsByCollection, collectionOf(ref.path), 1));
  return originalReaderGet.apply(this, args);
};
const originalQueryResponse = Query.prototype._getResponse;
Query.prototype._getResponse = function countedQuery(...args) {
  return originalQueryResponse.apply(this, args).then((response) => {
    const size = response?.result?.size ?? 0;
    counts.reads += Math.max(1, size);
    bump(counts.readsByCollection, `${this._queryOptions?.collectionId || 'query'} (query)`, Math.max(1, size));
    return response;
  });
};
const originalCommit = WriteBatch.prototype._commit;
WriteBatch.prototype._commit = function countedCommit(...args) {
  counts.writes += this._ops.length;
  this._ops.forEach((op) => bump(counts.writesByCollection, collectionOf(op.docPath), 1));
  return originalCommit.apply(this, args);
};

const measure = async (label, run) => {
  counts.reads = 0; counts.writes = 0; counts.readsByCollection = {}; counts.writesByCollection = {};
  const outcome = await run();
  return {
    label, reads: counts.reads, writes: counts.writes,
    readsByCollection: { ...counts.readsByCollection }, writesByCollection: { ...counts.writesByCollection },
    ...(outcome && typeof outcome === 'object' && !Array.isArray(outcome) ? { outcome } : {}),
  };
};

/* --- a realistic class and lesson (scripts/lib/studentControlsCostFixtures.mjs) */

const NOW = Date.now();
const TEACHER = 'cost.teacher@desotoisd.org';
const lesson = (id, classId, { closed }) => costLesson(id, classId, { closed, now: NOW });

const rootRequest = (data) => ({
  auth: { uid: 'cost-root', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN_EMAIL, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});

const envelope = ({ actionId, assignmentId, questionIndex, activityRole = 'classwork', value, previousTotalAttempts = 0 }) => ({
  schemaVersion: 1, actionId, kind: 'ordinarySubmission', assignmentId, questionIndex, questionId: `${assignmentId}-q${questionIndex}`,
  variantIndex: 0, activityRole, capturedAt: Date.now(), previousTotalAttempts,
  record: { totalAttempts: previousTotalAttempts + 1, attemptCount: previousTotalAttempts + 1, status: 'attempted' },
  response: { kind: 'scalar', type: 'literal', value, fields: [] }, capturedSectionAccess: null,
  hasClassworkGrade: activityRole === 'classwork', hasDolGrade: activityRole === 'dol',
});

const setStorageFlag = async (sharedRetired) => {
  if (!privateStorage) return;
  await db.collection('platformFlags').doc('assignmentOverrideStorage').set({ sharedRetired }, { merge: true });
};

/* --- one class size, one storage mode ------------------------------------ */

const scenario = async (classSize, mode) => {
  // Same-length ids in every mode, so the byte figures compare exactly.
  const p = `cost-${classSize}-${mode.slice(0, 1)}`;
  const classId = `${p}-class`;
  const closed = `${p}-closed`;
  const open = `${p}-open`;
  const studentIds = Array.from({ length: classSize }, (_, n) => `${p}-s${String(n).padStart(2, '0')}`);
  const extended = studentIds[0]; // has an extension in the legacy controls
  const plain = studentIds[Math.floor(classSize / 2)]; // has no control at all

  await setStorageFlag(false);
  await db.collection('classes').doc(classId).set({ name: `${p} class`, period: 'Period 1', teacherOfRecord: TEACHER, status: 'active', course: 'algebra1' });
  for (let start = 0; start < studentIds.length; start += 400) {
    const batch = db.batch();
    studentIds.slice(start, start + 400).forEach((id) => batch.set(db.collection('grades').doc(id), {
      displayName: id, classId, classPeriod: 'Period 1', assignedTeacherEmail: TEACHER, status: 'active',
      gradesByAssignment: {}, assignmentActivity: { [closed]: { totalTimeSeconds: 1800 } },
    }));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  const controls = legacyControls(studentIds, { now: NOW });
  await db.collection('assignments').doc(closed).set(withControls(lesson(closed, classId, { closed: true }), controls));
  await db.collection('assignments').doc(open).set(withControls(lesson(open, classId, { closed: false }), controls));

  const migration = {};
  if (privateStorage) {
    migration.backfill = await measure('backfill (two lessons, the whole class)', () => fns.migrateStudentAssignmentOverrides.run(rootRequest({ mode: 'backfill', dryRun: false, assignmentIdPrefix: p })));
    if (mode === 'retired') {
      // The switch itself is measured nowhere here: the retirement gate is the
      // operator's (rehearse-student-assignment-overrides-migration.mjs).
      await setStorageFlag(true);
      migration.stripDryRun = await measure('strip dry run (two lessons)', () => fns.migrateStudentAssignmentOverrides.run(rootRequest({ mode: 'strip', assignmentIdPrefix: p })));
      migration.strip = await measure('strip (two lessons)', () => fns.migrateStudentAssignmentOverrides.run(rootRequest({ mode: 'strip', dryRun: false, confirm: STRIP_CONFIRMATION, assignmentIdPrefix: p })));
    }
  }

  /* what a device receives */
  const shared = (await db.collection('assignments').doc(closed).get()).data();
  const content = { ...shared };
  delete content.studentOverrides; delete content.excusedStudentIds; delete content.reopenedStudentIds;
  content.dol = { ...content.dol };
  delete content.dol.attemptGrantsByStudentId;
  content.dol.recoveryAudit = (content.dol.recoveryAudit || []).filter((entry) => entry?.scope?.type !== 'students');
  const studentsOnSharedDoc = new Set([
    ...Object.keys(shared.studentOverrides || {}),
    ...Object.keys(shared.dol?.attemptGrantsByStudentId || {}),
    ...(shared.excusedStudentIds || []),
    ...(shared.reopenedStudentIds || []),
  ]);
  const records = privateStorage
    ? (await db.collection('studentAssignmentOverrides').where('assignmentId', '==', closed).get()).docs.map((doc) => doc.data())
    : [];
  const recordBytes = records.map(bytes);
  const payload = {
    sharedAssignmentBytes: bytes(shared),
    lessonContentBytes: bytes(content),
    perStudentBytesOnSharedAssignment: bytes(shared) - bytes(content),
    studentsWhoseControlsRideOnTheSharedAssignment: studentsOnSharedDoc.size,
    classmatesVisibleToOneStudent: Math.max(0, studentsOnSharedDoc.size - (studentsOnSharedDoc.has(extended) ? 1 : 0)),
    privateRecordsForThisLesson: records.length,
    averagePrivateRecordBytes: recordBytes.length ? Math.round(recordBytes.reduce((a, b) => a + b, 0) / recordBytes.length) : 0,
  };

  /* the server's operations */
  const ops = [];
  ops.push(await measure('ingest one late submission (student with an extension)', async () => {
    const { receipts } = await fns.ingestStudentSubmissions.run(studentRequest(extended, { submissions: [envelope({ actionId: `${p}-late-1`, assignmentId: closed, questionIndex: 3, value: '3' })] }));
    assert.equal(receipts[0].disposition, 'accepted', `${p}: the extension must be honoured (${JSON.stringify(receipts[0])})`);
    return { disposition: receipts[0].disposition };
  }));
  ops.push(await measure('ingest a batch of five submissions (same student, same lesson)', async () => {
    const submissions = [4, 5, 6, 7, 8].map((questionIndex) => envelope({ actionId: `${p}-batch-${questionIndex}`, assignmentId: closed, questionIndex, value: `${questionIndex}` }));
    const { receipts } = await fns.ingestStudentSubmissions.run(studentRequest(extended, { submissions }));
    return { accepted: receipts.filter((receipt) => receipt.disposition === 'accepted').length };
  }));
  ops.push(await measure('Recovery status (student with an extension)', async () => {
    const status = await fns.advanceSectionRecovery.run(studentRequest(extended, { assignmentId: closed, section: 'dol', action: 'status' }));
    return { endsAtMs: status?.eligibility?.endsAtMs ?? null };
  }));
  // One outstanding DOL answer per student, captured inside the late window.
  const dolIndex = 25;
  for (let start = 0; start < studentIds.length; start += 400) {
    const batch = db.batch();
    studentIds.slice(start, start + 400).forEach((studentId) => batch.set(db.collection('studentResponseCheckpoints').doc(`${p}-cp-${studentId}`), {
      schemaVersion: 2, documentId: `${p}-cp-${studentId}`, studentId, assignmentId: closed, classId, questionIndex: dolIndex,
      questionId: `${closed}-q${dolIndex}`, variantIndex: 0, activityRole: 'dol', revision: 1,
      response: { kind: 'scalar', type: 'literal', value: `${dolIndex}`, fields: [] }, isComplete: true, previousTotalAttempts: 0,
      candidateFinalizeAt: null, serverAcknowledgedAt: new Date(NOW - 1.5 * DAY), status: 'active', secure: false,
    }));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  ops.push(await measure(`deadline finalizer sweep (${classSize} outstanding answers)`, async () => {
    const sweep = await fns.sweepStudentResponseCheckpoints.run(teacherRequest({ assignmentId: closed, classId }, TEACHER));
    return { examined: sweep.examined, rescheduled: sweep.outcomes?.rescheduled || 0, finalized: sweep.outcomes?.finalized || 0 };
  }));
  ops.push(await measure('grant an attendance extension (one student)', async () => {
    const result = await fns.applyStudentAttendanceExtension.run(teacherRequest({
      classId, studentId: plain, assignmentId: closed, proposedLateDueAtMs: NOW + 3 * DAY, extension: { dateKey: '2026-10-07' },
    }, TEACHER));
    return { lateDueAt: result.lateDueAt };
  }));
  const grantDol = async (ids) => {
    if (privateStorage) {
      await fns.setStudentAssignmentControls.run(teacherRequest({ assignmentId: open, classId, studentIds: ids, change: { kind: 'dolAttempts', increment: 1 } }, TEACHER));
      return { via: 'setStudentAssignmentControls' };
    }
    // The previous release: the teacher's browser writes the whole `dol` map
    // back from the copy it already holds (no server read).
    const current = (await db.collection('assignments').doc(open).get()).data();
    const { dol } = buildDolAttemptGrant({ assignment: current, scope: { type: 'students', studentIds: ids, classId }, increment: 1, teacherId: 'uid-teacher' });
    counts.reads = 0; counts.readsByCollection = {};
    await db.collection('assignments').doc(open).update({ dol });
    return { via: 'teacher browser writes the shared assignment' };
  };
  ops.push(await measure('grant one extra DOL attempt (one student)', () => grantDol([plain])));
  ops.push(await measure('grant one extra DOL attempt (five students)', () => grantDol(studentIds.slice(-6, -1))));
  // Classroom passback for one student whose grade changed.
  await db.collection('classroomLinks').doc(`${p}-publication`).set({
    schemaVersion: 2, publicationId: `${p}-publication`, assignmentId: closed, courseId: `${p}-course`, courseName: p,
    courseworkId: `${p}-coursework`, teacherUid: `uid-${TEACHER}`, status: 'published', maxPoints: 100, sectionKey: 'whole',
  });
  await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(`${p}-course`, extended)).set({ courseId: `${p}-course`, studentId: extended, googleUserId: `google-${extended}` });
  await db.collection('studentResponseCheckpoints').doc(`${p}-cp-${extended}`).delete();
  // Enough answered work for a grade to go to Classroom at all.
  await fns.ingestStudentSubmissions.run(studentRequest(extended, {
    submissions: [9, 10, 11, 12, 13, 14].map((questionIndex) => envelope({ actionId: `${p}-more-${questionIndex}`, assignmentId: closed, questionIndex, value: `${questionIndex}` })),
  }));
  const passback = await measure('Classroom passback (one student)', () => runClassroomSync(extended, {}));
  const synced = (await db.collection('classroomGradeSyncs').where('studentId', '==', extended).get()).docs
    .map((doc) => doc.data()).find((data) => data.publicationId === `${p}-publication`);
  assert.ok(synced, `${p}: the passback must reach Classroom for the measurement to mean anything`);
  ops.push({ ...passback, outcome: { stage: synced.stage } });
  if (privateStorage) {
    const before = await db.collection('assignments').doc(open).get();
    await db.collection('assignments').doc(open).update({ title: 'Renamed lesson' });
    const after = await db.collection('assignments').doc(open).get();
    ops.push(await measure('absorber on an ordinary assignment edit', () => fns.absorbSharedStudentControls.run({ params: { assignmentId: open }, data: { before, after } })));
  }

  return { classSize, mode, payload, migration, operations: ops };
};

/* --- the report ------------------------------------------------------------ */

const modes = privateStorage ? ['mirror', 'retired'] : ['legacy'];
const results = [];
for (const classSize of classSizes) {
  for (const mode of modes) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await scenario(classSize, mode));
  }
}
await setStorageFlag(false);

// The design's per-device listener counts and the fan-out of one student's
// control change, from the measured document sizes.
const fanOut = (result) => {
  const listenersOnLesson = result.classSize + 1; // every student device in the class, plus the teacher
  const { sharedAssignmentBytes, averagePrivateRecordBytes } = result.payload;
  if (result.mode === 'legacy') return { documentsDelivered: listenersOnLesson, bytesDelivered: listenersOnLesson * sharedAssignmentBytes };
  if (result.mode === 'mirror') return { documentsDelivered: listenersOnLesson + 2, bytesDelivered: listenersOnLesson * sharedAssignmentBytes + 2 * averagePrivateRecordBytes };
  return { documentsDelivered: 2, bytesDelivered: 2 * averagePrivateRecordBytes };
};

console.log(JSON.stringify({
  repo, commit, privateStorage,
  listenersPerDevice: privateStorage
    ? { student: 'assignments + 1 (their own controls, every lesson)', teacher: 'assignments + 1 (their students\' controls)', growsWithClassSize: false }
    : { student: 'assignments', teacher: 'assignments', growsWithClassSize: false },
  results: results.map((result) => ({ ...result, oneStudentsControlChange: fanOut(result) })),
}, null, 2));
process.exit(0);
