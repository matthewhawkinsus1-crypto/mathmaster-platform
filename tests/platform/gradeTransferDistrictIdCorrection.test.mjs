// GRADE EXPORT AFTER A DISTRICT ID CORRECTION — EVERY PATH A FILE CAN TAKE.
//
// A student's MathMaster account was made with a mistyped, valid-looking
// number (111111). Grade Export took it for her district ID — there was
// nothing to flag — and sent it to TEAMS. A teacher corrects her district ID
// to 222222 (setStudentSisId). Her grades stay keyed by 111111; every file
// from now on must address 222222:
//
//   initial export, section files (Warm-Up, Classwork, Practice, DOL), a
//   whole-assignment file, the "changes only" update after a confirmed
//   upload, "export again", the snapshot each export records, and the ZIP.
//
// "Download last file" is deliberately byte-for-byte history, so it keeps the
// old number — and the teacher is told. Invalid, missing and shared district
// IDs still stop a row rather than send it anywhere.
//
// Every name and number is invented.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSING_SIS_TRANSFER_REASON,
  SHARED_SIS_TRANSFER_REASON,
  TRANSFER_STATE,
  createExportSnapshot,
  packageManifest,
  sharedSisStudentIds,
  teamsCsv,
  transferFileName,
  transferPackagePath,
  transferSnapshotId,
} from '../../src/platform/gradeTransfer/gradeTransferModel.js';
import {
  EXPORT_STATUS,
  buildExportPlan,
  buildSnapshotDownloadUnits,
  describeUnitExport,
  exportStatusLabel,
  lastFileRowsWithOutdatedDistrictId,
  rowsReidentifiedSince,
} from '../../src/platform/gradeTransfer/gradeTransferHistory.js';
import { projectGradeTransferUnits } from '../../src/platform/gradeTransfer/gradeTransferProjection.js';
import { buildGradebookZip } from '../../src/platform/gradeTransfer/gradeTransferPackage.js';

const TEACHER = 'teacher.rivera@school.example';
const ACCOUNT_ID = '111111';
const DISTRICT_ID = '222222';
const CLASSMATE = '444444';
const klass = { classId: 'class-alg1', name: 'Algebra 1 — Period 2', period: 'Period 2', teacherOfRecord: TEACHER, status: 'active' };

const record = (status) => ({ status, totalAttempts: 1, variantIndex: 0, lastSubmissionId: `s-${status}`, partialCredit: status === 'correct' ? 100 : 0 });
const LESSON = {
  id: 'lesson-7',
  schemaVersion: 5,
  title: 'Lesson 7: Slope from Two Points',
  assignedClassIds: [klass.classId],
  lateDueAt: '2020-01-01T00:00:00Z',
  sections: [
    { id: 'wu', role: 'warmup', questions: [{ questionId: 'w1', activityRole: 'warmup' }] },
    { id: 'cw', role: 'classwork', questions: [{ questionId: 'c1', activityRole: 'classwork' }] },
    { id: 'pr', role: 'practice', questions: [{ questionId: 'p1', activityRole: 'practice' }] },
    { id: 'dl', role: 'dol', questions: [{ questionId: 'd1', activityRole: 'dol' }] },
  ],
};
// A lesson that also carries a quiz exports as ONE whole-assignment file.
const QUIZ_LESSON = {
  ...LESSON,
  id: 'lesson-8',
  title: 'Lesson 8 with Quiz',
  sections: [...LESSON.sections, { id: 'qz', role: 'quiz', questions: [{ questionId: 'q1', activityRole: 'quiz' }] }],
};

const marisol = (sisStudentId) => ({
  id: ACCOUNT_ID,
  classId: klass.classId,
  firstName: 'Marisol',
  lastName: 'Testerling',
  displayName: 'Marisol Testerling',
  ...(sisStudentId === undefined ? {} : { sisStudentId }),
  gradesByAssignment: {
    'lesson-7': { 0: record('correct'), 1: record('correct'), 2: record('correct'), 3: record('expired') },
    'lesson-8': { 0: record('correct'), 1: record('correct'), 2: record('correct'), 3: record('correct'), 4: record('correct') },
  },
});
const classmate = {
  id: CLASSMATE,
  classId: klass.classId,
  displayName: 'Odile Placeholder',
  gradesByAssignment: {
    'lesson-7': { 0: record('correct'), 1: record('expired'), 2: record('correct'), 3: record('correct') },
    'lesson-8': { 0: record('correct'), 1: record('correct'), 2: record('correct'), 3: record('correct'), 4: record('expired') },
  },
};
// Before: the account was created with the typed number as its district ID.
const BEFORE = [marisol(ACCOUNT_ID), classmate];
// After setStudentSisId: only the district ID differs.
const AFTER = [marisol(DISTRICT_ID), classmate];

const project = ({ students, snapshots = [], assignments = [LESSON] }) => projectGradeTransferUnits({
  classes: [klass], assignments, students, teacherEmail: TEACHER, snapshots,
}).units;
const lessonUnit = (args) => project(args).find((unit) => unit.assignmentId === 'lesson-7');
const sections = (unit) => Object.fromEntries(unit.sectionUnits.map((part) => [part.sectionKey, part]));
const rowOf = (part, studentId = ACCOUNT_ID) => (part.allRows || part.rows).find((row) => row.studentId === studentId);
const csvLines = (rows) => teamsCsv(rows).trim().split(/\r\n/).filter(Boolean);

// Every section file exported on Monday and confirmed uploaded — under the
// mistyped number.
const MONDAY = '2026-09-28T15:00:00Z';
const confirmedMondayExport = () => lessonUnit({ students: BEFORE }).sectionUnits.map((part) => ({
  ...createExportSnapshot({ unit: part, transferId: transferSnapshotId(part), teacherUid: 't', teacherEmail: TEACHER, packageId: 'package-monday' }),
  createdAt: MONDAY,
  uploadConfirmedAt: MONDAY,
}));

const ZIP_LOCAL_HEADER = 0x04034b50;
const zipEntries = (bytes) => {
  const buffer = Buffer.from(bytes);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === ZIP_LOCAL_HEADER) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, buffer.toString('utf8', start, start + size));
    offset = start + size;
  }
  return entries;
};

test('the defect: a mistyped but valid-looking number exported as the district ID with nothing to flag', () => {
  const unit = lessonUnit({ students: BEFORE });
  assert.equal(unit.state, TRANSFER_STATE.READY_TO_EXPORT, 'no roster-ID problem — the number looks valid');
  assert.deepEqual(unit.problems, []);
  unit.sectionUnits.forEach((part) => assert.equal(rowOf(part).sisStudentId, ACCOUNT_ID));
});

test('initial export: every section file carries 222222 and never 111111; the ZIP and manifest agree', () => {
  const unit = lessonUnit({ students: AFTER });
  assert.equal(unit.state, TRANSFER_STATE.READY_TO_EXPORT);
  const bySection = sections(unit);
  const expected = { warmup: 100, classwork: 100, practice: 100, dol: 0 };
  Object.entries(expected).forEach(([sectionKey, grade]) => {
    assert.deepEqual(csvLines(bySection[sectionKey].rows).filter((line) => !line.startsWith(`${CLASSMATE},`)), [`${DISTRICT_ID},${grade}`], sectionKey);
  });

  const plan = buildExportPlan({ entries: [{ unit, mode: 'full' }] });
  assert.deepEqual(plan.reidentified, [], 'a first export has nothing to re-address');
  const zip = zipEntries(buildGradebookZip(plan.packageUnits));
  unit.sectionUnits.forEach((part) => {
    const body = zip.get(transferPackagePath(part));
    assert.ok(body.includes(`${DISTRICT_ID},${expected[part.sectionKey]}\r\n`), `${part.sectionLabel}.csv`);
    assert.ok(!body.includes(`${ACCOUNT_ID},`), `${part.sectionLabel}.csv never addresses 111111`);
  });
  // MathMaster account IDs never appear in a TEAMS file; the manifest names no ID here.
  assert.ok(!zip.get('MANIFEST.txt').includes(ACCOUNT_ID));
});

test('whole-assignment export (a lesson with a quiz) uses 222222 too', () => {
  const unit = project({ students: AFTER, assignments: [QUIZ_LESSON] })[0];
  assert.equal(unit.sectionUnits, undefined, 'one whole-assignment file');
  assert.equal(rowOf(unit).sisStudentId, DISTRICT_ID);
  assert.ok(csvLines(unit.rows).every((line) => !line.startsWith(`${ACCOUNT_ID},`)));
  assert.ok(csvLines(unit.rows).includes(`${DISTRICT_ID},100`));
});

test('update export after a confirmed upload: only the corrected student is resent, under 222222, and it overwrites', () => {
  const snapshots = confirmedMondayExport();
  // Nothing changed yet: the confirmed upload is the whole story.
  assert.equal(lessonUnit({ students: BEFORE, snapshots }).state, TRANSFER_STATE.UPLOAD_CONFIRMED);

  const unit = lessonUnit({ students: AFTER, snapshots });
  assert.equal(unit.state, TRANSFER_STATE.UPDATE_REQUIRED);
  unit.sectionUnits.forEach((part) => {
    assert.equal(part.state, TRANSFER_STATE.UPDATE_REQUIRED, `${part.sectionKey} needs an update`);
    assert.equal(part.exportKind, 'delta');
    // The grade did not move; the destination did. Only she is resent.
    assert.deepEqual(part.rows.map((row) => [row.studentId, row.sisStudentId]), [[ACCOUNT_ID, DISTRICT_ID]]);
    assert.match(transferFileName(part), /_UPDATE\.csv$/);
  });

  const plan = buildExportPlan({ entries: [{ unit, mode: 'changes' }], snapshots });
  assert.equal(plan.overwrite, true);
  assert.deepEqual(plan.reidentified, [{ studentId: ACCOUNT_ID, previousSisStudentId: ACCOUNT_ID, sisStudentId: DISTRICT_ID }]);
  plan.packageUnits.forEach((part) => assert.deepEqual(part.reidentified, plan.reidentified));
  const zip = zipEntries(buildGradebookZip(plan.packageUnits));
  plan.packageUnits.forEach((part) => assert.deepEqual(zip.get(transferPackagePath(part)).trim().split(/\r\n/), [`${DISTRICT_ID},${rowOf(part).grade}`]));
  const manifest = zip.get('MANIFEST.txt');
  assert.match(manifest, /TEAMS “Overwrite existing grades\?”: YES/);
  assert.match(manifest, /District ID corrected since the last export: 111111 → 222222\. This file uses the corrected ID\./);
  assert.equal((manifest.match(/District ID corrected/g) || []).length, 4, 'one line per section file');

  // The row's status says WHY it changed — and does not call an unchanged
  // grade a changed one: four section rows moved, no grade did.
  const summary = describeUnitExport({ unit, snapshots });
  assert.equal(summary.status, EXPORT_STATUS.CHANGED);
  assert.equal(summary.changedCount, 4);
  assert.equal(summary.idOnlyChangedCount, 4);
  assert.equal(summary.reidentifiedCount, 1);
  const status = exportStatusLabel(summary);
  assert.equal(status.label, 'Changed since export · 4');
  assert.match(status.detail, /^District ID corrected for 1 student since .+ — export again so TEAMS gets their grades under the corrected ID\.$/);
  assert.doesNotMatch(status.detail, /grades? changed/);

  // A grade that ALSO moved is reported as a changed grade, beside the correction.
  const regraded = AFTER.map((student) => (student.id === ACCOUNT_ID
    ? { ...student, gradesByAssignment: { ...student.gradesByAssignment, 'lesson-7': { ...student.gradesByAssignment['lesson-7'], 3: record('correct') } } }
    : student));
  const both = describeUnitExport({ unit: lessonUnit({ students: regraded, snapshots }), snapshots });
  assert.equal(both.idOnlyChangedCount, 3);
  assert.match(exportStatusLabel(both).detail, /^1 grade changed or newly finalized since .+\. District ID corrected for 1 student since then — export again/);
});

test('export again (a full re-export) sends every current grade under 222222 and says to overwrite', () => {
  const snapshots = confirmedMondayExport();
  const unit = lessonUnit({ students: AFTER, snapshots });
  const plan = buildExportPlan({ entries: [{ unit, mode: 'full' }], snapshots });
  assert.equal(plan.fileCount, 4);
  plan.packageUnits.forEach((part) => {
    assert.equal(part.reexport, true);
    assert.equal(part.exportKind, 'initial');
    assert.equal(rowOf(part).sisStudentId, DISTRICT_ID);
    assert.equal(rowOf(part, CLASSMATE).sisStudentId, CLASSMATE, 'the classmate is unchanged');
  });
  const zip = zipEntries(buildGradebookZip(plan.packageUnits));
  assert.ok([...zip.entries()].filter(([name]) => name.endsWith('.csv')).every(([, body]) => !body.includes(`${ACCOUNT_ID},`)));
  assert.match(zip.get('MANIFEST.txt'), /Export: full re-export of current grades/);
  assert.match(zip.get('MANIFEST.txt'), /111111 → 222222/);
});

test('the snapshot an export records carries 222222 — a new immutable snapshot, never a rewrite of Monday’s', () => {
  const snapshots = confirmedMondayExport();
  const unit = lessonUnit({ students: AFTER, snapshots });
  const [plannedPart] = buildExportPlan({ entries: [{ unit, mode: 'changes' }], snapshots }).packageUnits;
  const snapshot = createExportSnapshot({ unit: plannedPart, transferId: transferSnapshotId(plannedPart), teacherUid: 't', teacherEmail: TEACHER, packageId: 'package-tuesday' });
  assert.deepEqual(snapshot.rows.map((row) => [row.studentId, row.sisStudentId]), [[ACCOUNT_ID, DISTRICT_ID]]);
  // The persisted shape is unchanged: the plan's annotation does not leak in.
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'assignmentId', 'assignmentTitle', 'classId', 'exportKind', 'fileName', 'packageId', 'rows', 'schemaVersion',
    'sectionKey', 'sectionLabel', 'teacherEmail', 'teacherUid', 'transferId', 'withheld',
  ]);
  // A different file, so a different immutable id: Monday's snapshot stays as it was.
  const mondayIds = new Set(snapshots.map((entry) => entry.transferId));
  assert.ok(!mondayIds.has(snapshot.transferId));
  // Re-exporting the same corrected grades again hashes to the same snapshot.
  assert.equal(transferSnapshotId(plannedPart), snapshot.transferId);
});

test('"Download last file" is history: it still says 111111, and the teacher is told before relying on it', () => {
  const snapshots = confirmedMondayExport();
  const unit = lessonUnit({ students: AFTER, snapshots });
  const copies = buildSnapshotDownloadUnits({ unit, snapshots });
  assert.equal(copies.length, 4);
  // The file is written from `rows` — the snapshot's, byte for byte.
  const zip = zipEntries(buildGradebookZip(copies));
  copies.forEach((copy) => {
    assert.equal(copy.rows.find((row) => row.studentId === ACCOUNT_ID).sisStudentId, ACCOUNT_ID, 'an exact copy of what was sent');
    assert.ok(zip.get(transferPackagePath(copy)).includes(`${ACCOUNT_ID},`));
  });
  const outdated = lastFileRowsWithOutdatedDistrictId({ unit, snapshots });
  assert.deepEqual(outdated, [{ studentId: ACCOUNT_ID, previousSisStudentId: ACCOUNT_ID, sisStudentId: DISTRICT_ID }]);
  // With nothing corrected, nothing is flagged.
  assert.deepEqual(lastFileRowsWithOutdatedDistrictId({ unit: lessonUnit({ students: BEFORE, snapshots }), snapshots }), []);
  assert.deepEqual(rowsReidentifiedSince(lessonUnit({ students: BEFORE, snapshots }).sectionUnits[0].allRows, snapshots), []);
});

test('an invalid or missing district ID still holds the row back as a roster-ID problem', () => {
  for (const [label, student] of [
    ['letters', { ...marisol('22222A') }],
    ['an email-style account with none on file', { ...marisol(undefined), id: 'marisol.legacy@students.example' }],
  ]) {
    const unit = lessonUnit({ students: [student, classmate] });
    assert.equal(unit.state, TRANSFER_STATE.ROSTER_ID_PROBLEM, label);
    unit.sectionUnits.forEach((part) => {
      assert.ok(part.allRows.every((row) => row.studentId === CLASSMATE), `${label}: no row leaves for her`);
      assert.deepEqual(part.problems.map((problem) => problem.reason), [MISSING_SIS_TRANSFER_REASON]);
    });
  }
});

test('two students under one district ID: both are held back, never sent to one TEAMS record', () => {
  // Legacy data: the classmate's account ID IS her district ID 444444, and a
  // record whose stored district ID is the same number with a leading zero.
  const twin = { ...marisol('0444444') };
  assert.deepEqual([...sharedSisStudentIds([twin, classmate])], [CLASSMATE]);
  const unit = lessonUnit({ students: [twin, classmate] });
  assert.equal(unit.state, TRANSFER_STATE.ROSTER_ID_PROBLEM);
  unit.sectionUnits.forEach((part) => {
    assert.deepEqual(part.allRows, [], 'neither student is exported');
    assert.deepEqual(part.problems.map((problem) => [problem.studentId, problem.reason]).sort(), [
      [ACCOUNT_ID, SHARED_SIS_TRANSFER_REASON],
      [CLASSMATE, SHARED_SIS_TRANSFER_REASON],
    ]);
  });
  const summary = describeUnitExport({ unit, snapshots: [] });
  assert.equal(summary.status, EXPORT_STATUS.ID_PROBLEM);
  assert.equal(summary.canExport, false);

  // Correcting one of them releases both.
  const fixed = lessonUnit({ students: [marisol(DISTRICT_ID), classmate] });
  assert.equal(fixed.state, TRANSFER_STATE.READY_TO_EXPORT);
  assert.equal(packageManifest(fixed.sectionUnits).includes('District ID corrected'), false);
});
