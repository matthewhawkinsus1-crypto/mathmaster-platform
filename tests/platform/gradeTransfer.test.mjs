import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTransferUnit, createExportSnapshot, packageManifest, teamsCsv, TRANSFER_STATE, transferFileName } from '../../src/platform/gradeTransfer/gradeTransferModel.js';
import { buildGradebookZip } from '../../src/platform/gradeTransfer/gradeTransferPackage.js';

const assignment = { id: 'a1', title: 'Linear Correlation', lateDueAt: '2026-09-16T23:00:00Z' };
const klass = { classId: 'c1', name: 'Algebra 1', period: 'P1' };
const score = (tracker) => tracker.score;
const student = (extra = {}) => ({ id: '1500123', displayName: 'Ada Lovelace', gradesByAssignment: { a1: { score: 92 } }, ...extra });

test('TEAMS CSV is exactly two columns, no header or names, with validation', () => {
  const csv = teamsCsv([{ sisStudentId: '1500123', grade: 92 }, { sisStudentId: '1500456', grade: 100 }]);
  assert.equal(csv, '1500123,92\r\n1500456,100\r\n');
  assert.doesNotMatch(csv, /Student|Ada|"/);
  assert.throws(() => teamsCsv([{ sisStudentId: 'bad,id', grade: 90 }]));
  assert.throws(() => teamsCsv([{ sisStudentId: '123', grade: 101 }]));
});

test('deadline gates readiness and finalized students are included', () => {
  const waiting = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-16T20:00:00Z'), calculateCanonicalGrade: score });
  assert.equal(waiting.state, TRANSFER_STATE.WAITING_FOR_FINALIZATION);
  assert.equal(waiting.rows.length, 0);
  const ready = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-17T00:00:00Z'), calculateCanonicalGrade: score });
  assert.equal(ready.state, TRANSFER_STATE.READY_TO_EXPORT);
  assert.deepEqual(ready.rows.map((row) => [row.sisStudentId, row.grade]), [['1500123', 92]]);
});

test('active extension is withheld rather than emitted as zero, then becomes a delta', () => {
  const extended = student({ finalDeadlinesByAssignment: { a1: '2026-09-20T00:00:00Z' } });
  const held = buildTransferUnit({ classRecord: klass, assignment, students: [extended], now: Date.parse('2026-09-17'), calculateCanonicalGrade: score });
  assert.equal(held.state, TRANSFER_STATE.WAITING_ON_EXTENDED_STUDENTS); assert.equal(held.rows.length, 0); assert.equal(held.withheld.length, 1);
  const baseline = { rows: [] };
  const returned = buildTransferUnit({ classRecord: klass, assignment, students: [extended], now: Date.parse('2026-09-21'), calculateCanonicalGrade: score, confirmedSnapshot: baseline });
  assert.equal(returned.state, TRANSFER_STATE.UPDATE_REQUIRED); assert.equal(returned.rows.length, 1);
});

test('confirmed unchanged grade has no delta; changed grade emits only changed row', () => {
  const prior = { rows: [{ studentId: '1500123', sisStudentId: '1500123', grade: 92, gradeVersion: 'a1:92' }] };
  const same = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-17'), calculateCanonicalGrade: score, confirmedSnapshot: prior });
  assert.equal(same.state, TRANSFER_STATE.UPLOAD_CONFIRMED); assert.deepEqual(same.rows, []);
  const changed = buildTransferUnit({ classRecord: klass, assignment, students: [student({ gradesByAssignment: { a1: { score: 95 } } }), student({ id: '1500456', gradesByAssignment: { a1: { score: 80 } } })], now: Date.parse('2026-09-17'), calculateCanonicalGrade: score, confirmedSnapshot: prior });
  assert.equal(changed.state, TRANSFER_STATE.UPDATE_REQUIRED);
  assert.deepEqual(changed.rows.map((row) => row.studentId), ['1500123', '1500456']);
});

test('provenance-only rewrite does not resend an unchanged TEAMS grade', () => {
  const current = student({ canonicalGradeVersions: { a1: 'finalization-v2' } });
  const prior = { rows: [{ studentId: '1500123', sisStudentId: '1500123', grade: 92, gradeVersion: 'finalization-v1' }] };
  const unit = buildTransferUnit({ classRecord: klass, assignment, students: [current], now: Date.parse('2026-09-17'), calculateCanonicalGrade: score, confirmedSnapshot: prior });
  assert.equal(unit.state, TRANSFER_STATE.UPLOAD_CONFIRMED); assert.deepEqual(unit.rows, []);
});

test('missing SIS id blocks only that row and names remain teacher-facing', () => {
  const unit = buildTransferUnit({ classRecord: klass, assignment, students: [student(), student({ id: '', sisStudentId: '', displayName: 'Needs ID' })], now: Date.parse('2026-09-17'), calculateCanonicalGrade: score });
  assert.equal(unit.state, TRANSFER_STATE.ROSTER_ID_PROBLEM); assert.equal(unit.rows.length, 1); assert.equal(unit.problems[0].name, 'Needs ID');
  assert.doesNotMatch(teamsCsv(unit.rows), /Ada|Needs ID/);
});

test('manifest and package preserve one file per class-assignment', () => {
  const first = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-17'), calculateCanonicalGrade: score });
  const second = { ...first, key: 'c1__a2', assignmentId: 'a2', assignmentTitle: 'Slope', exportKind: 'delta' };
  const manifest = packageManifest([first, second]);
  assert.match(manifest, /Overwrite existing grades\?”: NO/); assert.match(manifest, /Overwrite existing grades\?”: YES/);
  assert.notEqual(transferFileName(first), transferFileName(second));
  const zipText = new TextDecoder().decode(buildGradebookZip([first, second]));
  assert.match(zipText, /P1_LinearCorrelation.csv/); assert.match(zipText, /P1_Slope_UPDATE.csv/); assert.match(zipText, /MANIFEST.txt/);
});

test('snapshot contains immutable audit inputs and no answer content', () => {
  const unit = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-17'), calculateCanonicalGrade: score });
  const snapshot = createExportSnapshot({ unit, transferId: 't1', teacherUid: 'teacher1', teacherEmail: 'teacher@example.org', packageId: 'p1' });
  assert.equal(snapshot.rows[0].grade, 92); assert.equal(snapshot.classId, 'c1'); assert.equal(snapshot.assignmentId, 'a1');
  assert.doesNotMatch(JSON.stringify(snapshot), /answer/i);
});
