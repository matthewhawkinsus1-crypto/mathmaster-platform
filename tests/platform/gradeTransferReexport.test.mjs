import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTransferUnit, createExportSnapshot, gradePackageFileName, packageManifest, teamsCsv, TRANSFER_STATE, transferSnapshotId,
} from '../../src/platform/gradeTransfer/gradeTransferModel.js';
import {
  buildExportPlan, buildFullExportUnits, buildSnapshotDownloadUnits, describeUnitExport, EXPORT_STATUS, exportStatusLabel, pendingUploadIds, rowsChangedSinceExport,
} from '../../src/platform/gradeTransfer/gradeTransferHistory.js';

/*
 * "Previously exported" must never mean "not allowed to export again".
 * These are the teacher scenarios from the Grade Export audit: export Monday,
 * grades change Tuesday; the file is lost; the SIS rejected the upload; a late
 * student finishes after the export. Every one of them has to end with a file.
 */

const assignment = { id: 'a1', title: 'Linear Correlation', lateDueAt: '2026-09-16T23:00:00Z' };
const klass = { classId: 'c1', name: 'Algebra 1', period: 'P1' };
const projectScore = ({ student }) => student.gradesByAssignment.a1.score;
const student = (id, grade, extra = {}) => ({ id, displayName: `Student ${id}`, gradesByAssignment: { a1: { score: grade } }, ...extra });
const MONDAY = Date.parse('2026-09-21T15:00:00Z');
const TUESDAY = Date.parse('2026-09-22T15:00:00Z');

const unitFor = ({ students, snapshots = [], now = MONDAY, resolveStudentFinalDeadline }) => {
  const history = snapshots
    .filter((entry) => entry.classId === klass.classId && entry.assignmentId === assignment.id)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  return buildTransferUnit({
    classRecord: klass,
    assignment,
    students,
    now,
    projectCanonicalGrade: projectScore,
    resolveStudentFinalDeadline,
    confirmedSnapshots: history.filter((entry) => entry.uploadConfirmedAt),
    latestExport: history[0] || null,
  });
};

const exportSnapshot = (unit, at, extra = {}) => ({
  ...createExportSnapshot({ unit, transferId: transferSnapshotId(unit), teacherUid: 't', teacherEmail: 't@school.org', packageId: 'p' }),
  createdAt: new Date(at).toISOString(),
  ...extra,
});

test('an exported file that was never marked uploaded can be exported again', () => {
  const monday = unitFor({ students: [student('1500123', 92), student('1500456', 80)] });
  const snapshot = exportSnapshot(monday, MONDAY);
  const afterExport = unitFor({ students: [student('1500123', 92), student('1500456', 80)], snapshots: [snapshot] });

  // The state machine still records that a file went out…
  assert.equal(afterExport.state, TRANSFER_STATE.EXPORTED);
  // …but that is history, not a lock.
  const summary = describeUnitExport({ unit: afterExport, snapshots: [snapshot] });
  assert.equal(summary.status, EXPORT_STATUS.EXPORTED);
  assert.equal(summary.canExport, true);
  assert.equal(summary.canDownloadAgain, true);
  assert.deepEqual(pendingUploadIds(summary), [snapshot.transferId]);
  assert.match(exportStatusLabel(summary).label, /^Exported /);
});

test('Monday export, Tuesday grade change: the change is visible without an upload confirmation, and the full file goes again', () => {
  const monday = unitFor({ students: [student('1500123', 92), student('1500456', 80)] });
  const snapshot = exportSnapshot(monday, MONDAY);
  const tuesday = unitFor({ students: [student('1500123', 92), student('1500456', 95)], snapshots: [snapshot], now: TUESDAY });

  const summary = describeUnitExport({ unit: tuesday, snapshots: [snapshot] });
  assert.equal(summary.status, EXPORT_STATUS.CHANGED);
  assert.equal(summary.changedCount, 1);
  assert.equal(summary.canExport, true);

  const again = buildFullExportUnits({ unit: tuesday, snapshots: [snapshot] });
  assert.equal(again.length, 1);
  assert.deepEqual(again[0].rows.map((row) => [row.sisStudentId, row.grade]), [['1500123', 92], ['1500456', 95]]);
  assert.equal(again[0].reexport, true);
  // The SIS already holds Monday's grades, so the file must overwrite them.
  assert.match(packageManifest(again), /Overwrite existing grades\?”: YES/);
  assert.match(packageManifest(again), /full re-export/);
});

test('a changed grade after a CONFIRMED upload still offers the changes-only update and a full re-export', () => {
  const monday = unitFor({ students: [student('1500123', 92), student('1500456', 80)] });
  const confirmed = exportSnapshot(monday, MONDAY, { uploadConfirmedAt: new Date(MONDAY + 60_000).toISOString() });
  const tuesday = unitFor({ students: [student('1500123', 92), student('1500456', 95)], snapshots: [confirmed], now: TUESDAY });

  assert.equal(tuesday.state, TRANSFER_STATE.UPDATE_REQUIRED);
  assert.deepEqual(tuesday.rows.map((row) => row.studentId), ['1500456']);
  const summary = describeUnitExport({ unit: tuesday, snapshots: [confirmed] });
  assert.equal(summary.status, EXPORT_STATUS.CHANGED);
  assert.equal(summary.canExportChanges, true);
  assert.equal(buildFullExportUnits({ unit: tuesday, snapshots: [confirmed] })[0].rows.length, 2);
});

test('an uploaded, unchanged assignment can still be exported again (SIS rejected it, wrong class, lost file)', () => {
  const monday = unitFor({ students: [student('1500123', 92)] });
  const confirmed = exportSnapshot(monday, MONDAY, { uploadConfirmedAt: new Date(MONDAY + 60_000).toISOString() });
  const later = unitFor({ students: [student('1500123', 92)], snapshots: [confirmed], now: TUESDAY });

  assert.equal(later.state, TRANSFER_STATE.UPLOAD_CONFIRMED);
  const summary = describeUnitExport({ unit: later, snapshots: [confirmed] });
  assert.equal(summary.status, EXPORT_STATUS.UPLOADED);
  assert.equal(summary.canExport, true);
  const again = buildFullExportUnits({ unit: later, snapshots: [confirmed] });
  assert.deepEqual(again[0].rows.map((row) => row.grade), [92]);
});

test('re-exporting unchanged grades is idempotent on the server: same rows, same immutable snapshot id', () => {
  const monday = unitFor({ students: [student('1500123', 92), student('1500456', 80)] });
  const original = exportSnapshot(monday, MONDAY);
  const later = unitFor({ students: [student('1500123', 92), student('1500456', 80)], snapshots: [original], now: TUESDAY });
  const [again] = buildFullExportUnits({ unit: later, snapshots: [original] });
  assert.equal(transferSnapshotId(again), original.transferId);
});

test('a lost export is reproduced byte-for-byte from its snapshot without writing anything', () => {
  const monday = unitFor({ students: [student('1500123', 92), student('1500456', 80)] });
  const original = exportSnapshot(monday, MONDAY);
  // Grades moved on since; "download again" is about the file that was sent.
  const today = unitFor({ students: [student('1500123', 50), student('1500456', 80)], snapshots: [original], now: TUESDAY });
  const [copy] = buildSnapshotDownloadUnits({ unit: today, snapshots: [original] });
  assert.equal(teamsCsv(copy.rows), teamsCsv(monday.rows));
  assert.equal(copy.downloadedFromSnapshot, original.transferId);
});

test('late work finalized after the export counts as a change, not as something already sent', () => {
  const extension = ({ student: entry }) => entry.finalDeadline || null;
  const ontime = student('1500123', 92);
  const extended = student('1500456', 88, { finalDeadline: '2026-09-21T23:00:00Z' });
  const monday = unitFor({ students: [ontime, extended], resolveStudentFinalDeadline: extension });
  assert.equal(monday.withheld.length, 1);
  const snapshot = exportSnapshot(monday, MONDAY);

  const tuesday = unitFor({ students: [ontime, extended], snapshots: [snapshot], now: TUESDAY, resolveStudentFinalDeadline: extension });
  assert.deepEqual(rowsChangedSinceExport(tuesday, [snapshot]).map((row) => row.studentId), ['1500456']);
  assert.equal(describeUnitExport({ unit: tuesday, snapshots: [snapshot] }).status, EXPORT_STATUS.CHANGED);
});

test('a missing SIS number is the thing that blocks an export — never a previous export', () => {
  const unit = unitFor({ students: [student('1500123', 92), student('ada.account', 80)] });
  assert.equal(unit.state, TRANSFER_STATE.ROSTER_ID_PROBLEM);
  const summary = describeUnitExport({ unit, snapshots: [] });
  assert.equal(summary.status, EXPORT_STATUS.ID_PROBLEM);
  assert.equal(summary.canExport, false);
});

test('nothing is exportable before the final deadline', () => {
  const early = unitFor({ students: [student('1500123', 92)], now: Date.parse('2026-09-15T12:00:00Z') });
  const summary = describeUnitExport({ unit: early, snapshots: [] });
  assert.equal(summary.status, EXPORT_STATUS.NOT_DUE);
  assert.equal(summary.canExport, false);
});

test('ZIP names say which class, which assignment and when — never an opaque package id', () => {
  const unit = unitFor({ students: [student('1500123', 92)] });
  const name = gradePackageFileName([unit], Date.parse('2026-09-22T15:04:00'));
  // The class NAME a teacher sees everywhere else, readable in Downloads.
  assert.match(name, /^MathMaster-grades_Algebra-1_Linear-Correlation_2026-09-22_1504\.zip$/);
  const other = { ...unit, classId: 'c2', classLabel: 'Geometry', classPeriod: 'P2', assignmentId: 'a2', assignmentTitle: 'Other' };
  assert.match(gradePackageFileName([unit, other], Date.parse('2026-09-22T15:04:00')), /_2-classes_2-assignments_/);
  assert.match(gradePackageFileName([{ ...unit, reexport: true }], Date.parse('2026-09-22T15:04:00')), /_REEXPORT\.zip$/);
});

test('two classes that share a period are two classes, each named by its own name', () => {
  const unit = unitFor({ students: [student('1500123', 92)] });
  const main = { ...unit, classId: 'c-p3', classLabel: 'Algebra II — Period 3', classPeriod: 'Period 3' };
  const lab = { ...unit, classId: 'c-lab', classLabel: 'Algebra II Lab — Period 3', classPeriod: 'Period 3' };
  const at = Date.parse('2026-09-22T15:04:00');
  assert.match(gradePackageFileName([lab], at), /^MathMaster-grades_Algebra-II-Lab-Period-3_/);
  assert.notEqual(gradePackageFileName([main], at), gradePackageFileName([lab], at));
  assert.match(gradePackageFileName([main, lab], at), /_2-classes_/);
});

test('"exported N times" counts exports, not the section files inside one export', () => {
  const sections = ['warmup', 'classwork', 'practice', 'dol'].map((sectionKey) => ({ ...unitFor({ students: [student('1500123', 92)] }), sectionKey }));
  const lesson = { ...sections[0], sectionKey: null, sectionUnits: sections };
  const once = sections.map((part) => ({ ...exportSnapshot(part, MONDAY), transferId: `t-${part.sectionKey}`, sectionKey: part.sectionKey, packageId: 'monday' }));
  assert.equal(describeUnitExport({ unit: lesson, snapshots: once }).exportCount, 1);
  const again = [...once, { ...once[1], transferId: 't-classwork-2', packageId: 'tuesday', createdAt: new Date(TUESDAY).toISOString() }];
  assert.equal(describeUnitExport({ unit: lesson, snapshots: again }).exportCount, 2);
});

test('a package that mixes re-exported and first-time files says how many of each need "overwrite"', () => {
  const monday = unitFor({ students: [student('1500123', 92)] });
  const sent = exportSnapshot(monday, MONDAY);
  const later = unitFor({ students: [student('1500123', 92)], snapshots: [sent], now: TUESDAY });
  const fresh = { ...unitFor({ students: [student('1500123', 92)] }), classId: 'c2', classLabel: 'Geometry', key: 'c2:a1' };
  const plan = buildExportPlan({ entries: [{ unit: later, mode: 'full' }, { unit: fresh, mode: 'full' }], snapshots: [sent] });
  assert.equal(plan.fileCount, 2);
  assert.equal(plan.overwriteFileCount, 1);
  assert.equal(plan.overwrite, true);
});

test('a retry after a partial save failure is the same export, not a second one', async () => {
  const { readFileSync } = await import('node:fs');
  const { executableSource, region } = await import('./helpers/sourceContract.mjs');
  const center = executableSource(readFileSync(new URL('../../src/components/teacher/GradeTransferCenter.jsx', import.meta.url), 'utf8'));
  // The package id is minted when the review opens…
  assert.match(region(center, 'const openReview = (', 'const runExport', 'openReview'), /setPlan\(\{ \.\.\.built, title, packageId: id\('package'\) \}\)/);
  // …and every attempt to save that reviewed export reuses it.
  const run = region(center, 'const runExport = async', 'const downloadAgain', 'runExport');
  assert.match(run, /const packageId = plan\.packageId \|\| id\('package'\);/);
  assert.doesNotMatch(run, /const packageId = id\('package'\);/);
});
