import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildTransferUnit, createExportSnapshot, packageManifest, teamsCsv, TRANSFER_STATE, transferFileName, transferSnapshotId } from '../../src/platform/gradeTransfer/gradeTransferModel.js';
import { buildGradebookZip } from '../../src/platform/gradeTransfer/gradeTransferPackage.js';
import { canonicalPresentedAssignmentGrade, projectTeacherOverridesForDisplay } from '../../src/platform/grading/canonicalGradeProjection.js';
import { assignmentIsForStudent } from '../../src/assignmentLifecycle.js';
import { authorizedGradeTransferClasses, gradeTransferRoster } from '../../src/platform/gradeTransfer/gradeTransferScope.js';

const assignment = { id: 'a1', title: 'Linear Correlation', lateDueAt: '2026-09-16T23:00:00Z' };
const klass = { classId: 'c1', name: 'Algebra 1', period: 'P1' };
const score = (tracker) => tracker.score;
const projectScore = ({ student }) => score(student.gradesByAssignment.a1);
const extension = ({ student }) => student.testFinalDeadline || null;
const student = (extra = {}) => ({ id: '1500123', displayName: 'Ada Lovelace', gradesByAssignment: { a1: { score: 92 } }, ...extra });

test('TEAMS CSV is exactly two columns, no header or names, with validation', () => {
  const csv = teamsCsv([{ sisStudentId: '1500123', grade: 92 }, { sisStudentId: '1500456', grade: 100 }]);
  assert.equal(csv, '1500123,92\r\n1500456,100\r\n');
  assert.doesNotMatch(csv, /Student|Ada|"/);
  assert.throws(() => teamsCsv([{ sisStudentId: 'bad,id', grade: 90 }]));
  assert.throws(() => teamsCsv([{ sisStudentId: 'S1500123', grade: 90 }]));
  assert.throws(() => teamsCsv([{ sisStudentId: '123', grade: 101 }]));
});

test('deadline gates readiness and finalized students are included', () => {
  const waiting = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-16T20:00:00Z'), projectCanonicalGrade: projectScore });
  assert.equal(waiting.state, TRANSFER_STATE.WAITING_FOR_FINALIZATION);
  assert.equal(waiting.rows.length, 0);
  const ready = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-17T00:00:00Z'), projectCanonicalGrade: projectScore });
  assert.equal(ready.state, TRANSFER_STATE.READY_TO_EXPORT);
  assert.deepEqual(ready.rows.map((row) => [row.sisStudentId, row.grade]), [['1500123', 92]]);
});

test('active extension is withheld rather than emitted as zero, then becomes a delta', () => {
  const extended = student({ testFinalDeadline: '2026-09-20T00:00:00Z' });
  const held = buildTransferUnit({ classRecord: klass, assignment, students: [extended], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore, resolveStudentFinalDeadline: extension });
  assert.equal(held.state, TRANSFER_STATE.WAITING_ON_EXTENDED_STUDENTS); assert.equal(held.rows.length, 0); assert.equal(held.withheld.length, 1);
  const baseline = { rows: [] };
  const returned = buildTransferUnit({ classRecord: klass, assignment, students: [extended], now: Date.parse('2026-09-21'), projectCanonicalGrade: projectScore, resolveStudentFinalDeadline: extension, confirmedSnapshot: baseline });
  assert.equal(returned.state, TRANSFER_STATE.UPDATE_REQUIRED); assert.equal(returned.rows.length, 1);
});

test('confirmed initial export remains waiting while one student has an active extension', () => {
  const ordinary = student();
  const heldStudent = student({ id: '1500456', testFinalDeadline: '2026-09-20T00:00:00Z' });
  const confirmed = { rows: [{ studentId: ordinary.id, sisStudentId: ordinary.id, grade: 92, gradeVersion: 'a1:92' }] };
  const unit = buildTransferUnit({ classRecord: klass, assignment, students: [ordinary, heldStudent], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore, resolveStudentFinalDeadline: extension, confirmedSnapshot: confirmed });
  assert.equal(unit.state, TRANSFER_STATE.WAITING_ON_EXTENDED_STUDENTS);
  assert.equal(unit.extensionCount, 1);
  assert.equal(unit.rows.length, 0);
});

test('confirmed unchanged grade has no delta; changed grade emits only changed row', () => {
  const prior = { rows: [{ studentId: '1500123', sisStudentId: '1500123', grade: 92, gradeVersion: 'a1:92' }] };
  const same = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore, confirmedSnapshot: prior });
  assert.equal(same.state, TRANSFER_STATE.UPLOAD_CONFIRMED); assert.deepEqual(same.rows, []);
  const changed = buildTransferUnit({ classRecord: klass, assignment, students: [student({ gradesByAssignment: { a1: { score: 95 } } }), student({ id: '1500456', gradesByAssignment: { a1: { score: 80 } } })], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore, confirmedSnapshot: prior });
  assert.equal(changed.state, TRANSFER_STATE.UPDATE_REQUIRED);
  assert.deepEqual(changed.rows.map((row) => row.studentId), ['1500123', '1500456']);
});

test('provenance-only rewrite does not resend an unchanged TEAMS grade', () => {
  const current = student({ canonicalGradeVersions: { a1: 'finalization-v2' } });
  const prior = { rows: [{ studentId: '1500123', sisStudentId: '1500123', grade: 92, gradeVersion: 'finalization-v1' }] };
  const unit = buildTransferUnit({ classRecord: klass, assignment, students: [current], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore, confirmedSnapshot: prior });
  assert.equal(unit.state, TRANSFER_STATE.UPLOAD_CONFIRMED); assert.deepEqual(unit.rows, []);
});

test('finalized count is unique for unchanged, changed, new, and mixed deltas', () => {
  const first = student();
  const second = student({ id: '1500456', gradesByAssignment: { a1: { score: 81 } } });
  const baselineBoth = { rows: [
    { studentId: first.id, sisStudentId: first.id, grade: 92 },
    { studentId: second.id, sisStudentId: second.id, grade: 81 },
  ] };
  const unchanged = buildTransferUnit({ classRecord: klass, assignment, students: [first, second], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore, confirmedSnapshot: baselineBoth });
  assert.equal(unchanged.finalizedCount, 2);
  const changed = buildTransferUnit({ classRecord: klass, assignment, students: [student({ gradesByAssignment: { a1: { score: 95 } } }), second], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore, confirmedSnapshot: baselineBoth });
  assert.equal(changed.finalizedCount, 2);
  const baselineOne = { rows: [baselineBoth.rows[0]] };
  const newlyFinalized = buildTransferUnit({ classRecord: klass, assignment, students: [first, second], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore, confirmedSnapshot: baselineOne });
  assert.equal(newlyFinalized.finalizedCount, 2);
  const mixed = buildTransferUnit({ classRecord: klass, assignment, students: [student({ gradesByAssignment: { a1: { score: 95 } } }), second], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore, confirmedSnapshot: baselineOne });
  assert.equal(mixed.finalizedCount, 2);
  assert.equal(mixed.rows.length, 2);
});

test('V5 assignment audience uses assignedClassIds and never same-period identity', () => {
  const v5 = { ...assignment, assignedClassIds: ['class-a'] };
  assert.equal(assignmentIsForStudent(v5, { classId: 'class-a', classPeriod: 'P1' }), true);
  assert.equal(assignmentIsForStudent(v5, { classId: 'class-b', classPeriod: 'P1' }), false);
  assert.equal(assignmentIsForStudent({ ...assignment, classPeriod: 'P1' }, { classId: 'class-b', classPeriod: 'P1' }), false);
});

test('Grade Transfer class scope follows teacher-of-record and root-admin policy', () => {
  const classes = [
    { classId: 'class-a', period: 'Period 3', teacherOfRecord: 'a@school.org' },
    { classId: 'class-b', period: 'Period 3', teacherOfRecord: 'b@school.org' },
    { classId: 'archived', period: 'Period 4', teacherOfRecord: 'a@school.org', status: 'archived' },
  ];
  assert.deepEqual(authorizedGradeTransferClasses({ classes, teacherEmail: 'A@school.org' }).map((entry) => entry.classId), ['class-a']);
  assert.deepEqual(authorizedGradeTransferClasses({ classes, teacherEmail: 'a@school.org', isRootAdmin: true }).map((entry) => entry.classId), ['class-a', 'class-b']);
});

test('Grade Transfer roster requires canonical classId even when periods match', () => {
  const classes = [
    { classId: 'class-a', period: 'Period 3' },
    { classId: 'class-b', period: 'Period 3' },
  ];
  const students = [
    { id: 'a', classId: 'class-a', classPeriod: 'Period 3' },
    { id: 'b', classId: 'class-b', classPeriod: 'Period 3' },
    { id: 'legacy', classPeriod: 'Period 3' },
  ];
  assert.deepEqual(gradeTransferRoster({ students, classes, classId: 'class-a' }).map((entry) => entry.id), ['a']);
  assert.deepEqual(gradeTransferRoster({ students, classes, classId: 'class-b' }).map((entry) => entry.id), ['b']);
});

test('Grade Transfer Center delegates audience decisions to the canonical helper', () => {
  const source = readFileSync(new URL('../../src/components/teacher/GradeTransferCenter.jsx', import.meta.url), 'utf8');
  const projection = readFileSync(new URL('../../src/platform/gradeTransfer/gradeTransferProjection.js', import.meta.url), 'utf8');
  assert.match(source, /projectGradeTransferUnits\(\{/);
  assert.match(source, /students: projectedStudents/);
  assert.match(projection, /\.filter\(\(assignment\) => assignmentIsForStudent\(assignment, \{ classId: classRecord\.classId, classPeriod: classRecord\.period \}\)\)/);
  assert.doesNotMatch(projection, /assignment\.classIds|assignment\.classPeriod\s*===/);
});

test('teacher override and Practice Pass share the legitimate platform grade projection', () => {
  const gradeAssignment = {
    id: 'a1',
    sections: [
      { id: 'core', role: 'classwork', questions: [{ id: 'q1', activityRole: 'classwork' }] },
      { id: 'practice', role: 'practice', questions: [{ id: 'q2', activityRole: 'practice' }] },
    ],
  };
  const base = {
    id: '1500123',
    gradesByAssignment: { a1: {
      0: { status: 'correct', totalAttempts: 1, variantIndex: 0, lastSubmissionId: 's1' },
      1: { status: 'expired', totalAttempts: 1, variantIndex: 0, lastSubmissionId: 's2', partialCredit: 0 },
    } },
  };
  assert.equal(canonicalPresentedAssignmentGrade({ student: base, assignment: gradeAssignment }), 50);
  const corrected = { ...base, teacherGradeOverridesByAssignment: { a1: { 1: { active: true, score: 100, totalAttempts: 1, variantIndex: 0, submissionId: 's2' } } } };
  assert.equal(canonicalPresentedAssignmentGrade({ student: corrected, assignment: gradeAssignment }), 100);
  assert.equal(canonicalPresentedAssignmentGrade({ student: base, assignment: gradeAssignment, practicePassRedeemed: true }), 100);
  // Google Classroom excludes exactly the current-content Practice indices;
  // splitGrade is that same tested denominator authority on the client.
  assert.equal(canonicalPresentedAssignmentGrade({ student: corrected, assignment: gradeAssignment, practicePassRedeemed: true }), 100);
});

test('Grade Transfer state crosses the Firestore boundary through an authenticated callable', () => {
  const store = readFileSync(new URL('../../src/platform/gradeTransfer/gradeTransferStore.js', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(store, /callable\('listGradeTransferState'\)/);
  assert.doesNotMatch(store, /firebase\/firestore/);
  assert.match(server, /exports\.listGradeTransferState = onCall/);
  assert.match(server, /gradeTransferClassAuthority/);
  assert.match(server, /collection\("gradeTransferSnapshots"\)\.where\("classId", "==", classId\)/);
  assert.match(server, /collection\("classPointRewardRedemptions"\)\.where\("classId", "==", classId\)/);
  assert.doesNotMatch(store, /where\('studentId'/);
});

test('Grade Transfer writes and upload confirmation are server-authorized instead of client-rule dependent', () => {
  const store = readFileSync(new URL('../../src/platform/gradeTransfer/gradeTransferStore.js', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(store, /callable\('persistGradeTransferSnapshot'\)/);
  assert.match(store, /callable\('confirmGradeTransferUploaded'\)/);
  assert.match(server, /exports\.persistGradeTransferSnapshot = onCall/);
  assert.match(server, /exports\.confirmGradeTransferUploaded = onCall/);
  assert.match(server, /teacherOfRecord/);
});

test('legacy email/alphanumeric account keys require a separate numeric SIS id for TEAMS', () => {
  const legacy = student({ id: 'ada.school.account', sisStudentId: '', displayName: 'Needs ID' });
  const unit = buildTransferUnit({ classRecord: klass, assignment, students: [student(), legacy], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore });
  assert.equal(unit.state, TRANSFER_STATE.ROSTER_ID_PROBLEM);
  assert.equal(unit.rows.length, 1);
  assert.equal(unit.problems[0].name, 'Needs ID');
  assert.doesNotMatch(teamsCsv(unit.rows), /Ada|Needs ID|ada\.school/);

  const repaired = buildTransferUnit({
    classRecord: klass,
    assignment,
    students: [student({ id: 'ada.school.account', sisStudentId: '1500456' })],
    now: Date.parse('2026-09-17'),
    projectCanonicalGrade: projectScore,
  });
  assert.deepEqual(repaired.rows.map((row) => [row.studentId, row.sisStudentId]), [['ada.school.account', '1500456']]);
});

test('explicit SIS ids must be digits only even when the MathMaster account key is valid', () => {
  const unit = buildTransferUnit({
    classRecord: klass,
    assignment,
    students: [student({ sisStudentId: 'S1500123' })],
    now: Date.parse('2026-09-17'),
    projectCanonicalGrade: projectScore,
  });
  assert.equal(unit.state, TRANSFER_STATE.ROSTER_ID_PROBLEM);
  assert.equal(unit.rows.length, 0);
});

test('manifest and package preserve one file per class-assignment', () => {
  const first = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore });
  const second = { ...first, key: 'c1__a2', assignmentId: 'a2', assignmentTitle: 'Slope', exportKind: 'delta' };
  const manifest = packageManifest([first, second]);
  assert.match(manifest, /Overwrite existing grades\?”: NO/); assert.match(manifest, /Overwrite existing grades\?”: YES/);
  assert.notEqual(transferFileName(first), transferFileName(second));
  const zipText = new TextDecoder().decode(buildGradebookZip([first, second]));
  assert.match(zipText, /P1_LinearCorrelation_2026-09-16_a1-/); assert.match(zipText, /P1_Slope_2026-09-16_a2-.*_UPDATE.csv/); assert.match(zipText, /MANIFEST.txt/);
});

test('duplicate assignment titles still receive unique deterministic filenames', () => {
  const shared = { classPeriod: 'P1', classLabel: 'P1', assignmentTitle: 'Same Title', ordinaryDeadline: Date.parse('2026-09-16'), exportKind: 'initial' };
  const first = transferFileName({ ...shared, assignmentId: 'assignment-one' });
  const second = transferFileName({ ...shared, assignmentId: 'assignment-two' });
  assert.notEqual(first, second);
  assert.equal(first, transferFileName({ ...shared, assignmentId: 'assignment-one' }));
  assert.match(first, /^P1_SameTitle_2026-09-16_[A-Za-z0-9_-]+\.csv$/);
});

test('snapshot contains immutable audit inputs and no answer content', () => {
  const unit = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore });
  const snapshot = createExportSnapshot({ unit, transferId: 't1', teacherUid: 'teacher1', teacherEmail: 'teacher@example.org', packageId: 'p1' });
  assert.equal(snapshot.rows[0].grade, 92); assert.equal(snapshot.classId, 'c1'); assert.equal(snapshot.assignmentId, 'a1');
  assert.doesNotMatch(JSON.stringify(snapshot), /answer/i);
});

test('identical export retries use the same snapshot identity', () => {
  const unit = buildTransferUnit({ classRecord: klass, assignment, students: [student()], now: Date.parse('2026-09-17'), projectCanonicalGrade: projectScore });
  assert.equal(transferSnapshotId(unit), transferSnapshotId(structuredClone(unit)));
  assert.notEqual(transferSnapshotId(unit), transferSnapshotId({ ...unit, rows: [{ ...unit.rows[0], grade: 93 }] }));
});


test('assignment-level teacher zero overrides the automatic canonical grade and TEAMS export', () => {
  const gradeAssignment = {
    id: 'a1',
    lateDueAt: '2026-09-16T23:00:00Z',
    sections: [{ id: 'core', role: 'classwork', questions: [{ id: 'q1', activityRole: 'classwork' }] }],
  };
  const disciplined = {
    id: '1500123',
    displayName: 'Ada Lovelace',
    gradesByAssignment: {
      a1: { 0: { status: 'correct', totalAttempts: 1, variantIndex: 0, lastSubmissionId: 's1' } },
    },
    teacherGradeOverridesByAssignment: {
      a1: {
        __assignment: {
          active: true,
          score: 0,
          reasonCode: 'cellPhoneUse',
          reason: 'Cell phone use',
          source: 'teacher-assignment-zero',
        },
      },
    },
  };
  assert.equal(canonicalPresentedAssignmentGrade({ student: disciplined, assignment: gradeAssignment }), 0);
  const unit = buildTransferUnit({
    classRecord: klass,
    assignment: gradeAssignment,
    students: [disciplined],
    now: Date.parse('2026-09-17T00:00:00Z'),
    projectCanonicalGrade: canonicalPresentedAssignmentGrade,
  });
  assert.deepEqual(unit.rows.map((row) => [row.sisStudentId, row.grade]), [['1500123', 0]]);
});

test('assignment-level teacher zero is canonical even when no automatic tracker exists', () => {
  const gradeAssignment = { id: 'a1', sections: [{ id: 'core', role: 'classwork', questions: [{ id: 'q1', activityRole: 'classwork' }] }] };
  const disciplined = {
    id: '1500123',
    gradesByAssignment: {},
    teacherGradeOverridesByAssignment: {
      a1: {
        __assignment: {
          active: true,
          score: 0,
          reasonCode: 'academicDishonesty',
          reason: 'Academic dishonesty',
          source: 'teacher-assignment-zero',
        },
      },
    },
  };
  assert.equal(canonicalPresentedAssignmentGrade({ student: disciplined, assignment: gradeAssignment }), 0);
});

test('inactive assignment-level override never changes the canonical grade', () => {
  const gradeAssignment = {
    id: 'a1',
    sections: [{ id: 'core', role: 'classwork', questions: [{ id: 'q1', activityRole: 'classwork' }] }],
  };
  const ordinary = {
    id: '1500123',
    gradesByAssignment: { a1: { 0: { status: 'correct', totalAttempts: 1, variantIndex: 0, lastSubmissionId: 's1' } } },
    teacherGradeOverridesByAssignment: {
      a1: { __assignment: { active: false, score: 0, reasonCode: 'cellPhoneUse' } },
    },
  };
  assert.equal(canonicalPresentedAssignmentGrade({ student: ordinary, assignment: gradeAssignment }), 100);
});


test('section integrity zero persists across later attempts and becomes a TEAMS delta', () => {
  const gradeAssignment = {
    id: 'section-zero-a1',
    lateDueAt: '2026-09-16T23:00:00Z',
    sections: [
      { id: 'cw', role: 'classwork', questions: [{ id: 'q1', activityRole: 'classwork' }] },
      { id: 'practice', role: 'practice', questions: [{ id: 'q2', activityRole: 'practice' }] },
    ],
  };
  const current = {
    id: '1500123',
    displayName: 'Ada Lovelace',
    gradesByAssignment: {
      'section-zero-a1': {
        0: { status: 'correct', totalAttempts: 2, variantIndex: 1, lastSubmissionId: 'later-cw' },
        1: { status: 'correct', totalAttempts: 1, variantIndex: 0, lastSubmissionId: 'practice-1' },
      },
    },
    teacherGradeOverridesByAssignment: {
      'section-zero-a1': {
        0: {
          active: true,
          score: 0,
          persistent: true,
          source: 'teacher-section-zero',
          incidentId: 'integrity-section-1',
          sectionRole: 'classwork',
          totalAttempts: 1,
          variantIndex: 0,
          submissionId: 'earlier-cw',
        },
      },
    },
  };

  const projected = projectTeacherOverridesForDisplay(
    current.gradesByAssignment,
    current.teacherGradeOverridesByAssignment,
  );
  assert.equal(projected['section-zero-a1'][0].partialCredit, 0);
  assert.equal(canonicalPresentedAssignmentGrade({ student: current, assignment: gradeAssignment }), 50);

  const prior = {
    rows: [{ studentId: current.id, sisStudentId: current.id, grade: 100, gradeVersion: 'before-section-zero' }],
  };
  const unit = buildTransferUnit({
    classRecord: klass,
    assignment: gradeAssignment,
    students: [current],
    now: Date.parse('2026-09-17T00:00:00Z'),
    projectCanonicalGrade: canonicalPresentedAssignmentGrade,
    confirmedSnapshot: prior,
  });
  assert.equal(unit.state, TRANSFER_STATE.UPDATE_REQUIRED);
  assert.deepEqual(unit.rows.map((row) => [row.studentId, row.grade]), [[current.id, 50]]);
});
