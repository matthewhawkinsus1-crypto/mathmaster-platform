import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { buildGradebookZip } from '../../src/platform/gradeTransfer/gradeTransferPackage.js';
import { projectGradeTransferUnits } from '../../src/platform/gradeTransfer/gradeTransferProjection.js';
import {
  SECTION_TRANSFER_LABELS,
  TRANSFER_STATE,
  transferPackagePath,
  transferSnapshotId,
} from '../../src/platform/gradeTransfer/gradeTransferModel.js';

const klass = {
  classId: 'c1',
  name: 'Algebra II Honors',
  period: 'P1',
  teacherOfRecord: 'teacher@school.org',
};

const assignment = {
  id: 'a1',
  schemaVersion: 5,
  title: 'Systems of Inequalities',
  assignedClassIds: ['c1'],
  lateDueAt: '2020-01-01T00:00:00Z',
  sections: [
    { id: 'warmup', role: 'warmup', questions: [{ questionId: 'w1', activityRole: 'warmup' }] },
    { id: 'classwork', role: 'classwork', questions: [{ questionId: 'c1', activityRole: 'classwork' }] },
    { id: 'practice', role: 'practice', questions: [{ questionId: 'p1', activityRole: 'practice' }] },
    { id: 'dol', role: 'dol', questions: [{ questionId: 'd1', activityRole: 'dol' }] },
  ],
};

const record = (status) => ({
  status,
  totalAttempts: 1,
  variantIndex: 0,
  lastSubmissionId: 'submission-1',
  partialCredit: status === 'correct' ? 100 : 0,
});

const students = [
  {
    id: '1500123',
    classId: 'c1',
    displayName: 'Ada Lovelace',
    gradesByAssignment: {
      a1: {
        0: record('correct'),
        1: record('correct'),
        2: record('correct'),
        3: record('correct'),
      },
    },
  },
  {
    id: '1500456',
    classId: 'c1',
    displayName: 'Grace Hopper',
    gradesByAssignment: {
      a1: {
        0: record('correct'),
        1: record('expired'),
        2: record('correct'),
        3: record('expired'),
      },
    },
  },
];

const projection = (overrides = {}) => projectGradeTransferUnits({
  classes: [klass],
  assignments: [assignment],
  students,
  teacherEmail: 'teacher@school.org',
  ...overrides,
});

test('lesson Grade Transfer projects one assignment container with four section grade units', () => {
  const { units } = projection();
  assert.equal(units.length, 1);

  const [unit] = units;
  assert.equal(unit.key, 'c1__a1');
  assert.equal(unit.state, TRANSFER_STATE.READY_TO_EXPORT);
  assert.deepEqual(unit.sectionUnits.map((section) => section.sectionKey), ['warmup', 'classwork', 'practice', 'dol']);
  assert.deepEqual(unit.sectionUnits.map((section) => section.sectionLabel), [
    SECTION_TRANSFER_LABELS.warmup,
    SECTION_TRANSFER_LABELS.classwork,
    SECTION_TRANSFER_LABELS.practice,
    SECTION_TRANSFER_LABELS.dol,
  ]);

  const bySection = Object.fromEntries(unit.sectionUnits.map((section) => [section.sectionKey, section]));
  assert.deepEqual(bySection.warmup.rows.map((row) => row.grade), [100, 100]);
  assert.deepEqual(bySection.classwork.rows.map((row) => row.grade), [100, 0]);
  assert.deepEqual(bySection.practice.rows.map((row) => row.grade), [100, 100]);
  assert.deepEqual(bySection.dol.rows.map((row) => row.grade), [100, 0]);
});

test('assignment ZIP folder contains separate Warm-Up, Classwork, Practice, and DOL CSVs', () => {
  const [unit] = projection().units;
  const paths = unit.sectionUnits.map(transferPackagePath);
  const folders = new Set(paths.map((path) => path.split('/')[0]));

  assert.equal(folders.size, 1);
  assert.match(paths[0], /\/Warm-Up\.csv$/);
  assert.match(paths[1], /\/Classwork\.csv$/);
  assert.match(paths[2], /\/Practice\.csv$/);
  assert.match(paths[3], /\/DOL\.csv$/);

  const zipText = new TextDecoder().decode(buildGradebookZip(unit.sectionUnits));
  assert.match(zipText, /\/Warm-Up\.csv/);
  assert.match(zipText, /\/Classwork\.csv/);
  assert.match(zipText, /\/Practice\.csv/);
  assert.match(zipText, /\/DOL\.csv/);
  assert.match(zipText, /MANIFEST\.txt/);
});

test('section snapshot identities cannot collide inside one assignment', () => {
  const [unit] = projection().units;
  const ids = unit.sectionUnits.map(transferSnapshotId);
  assert.equal(new Set(ids).size, 4);
});

test('confirmed history is isolated by section so one changed DOL does not resend other section files', () => {
  const [initial] = projection().units;
  const snapshots = initial.sectionUnits.map((section) => ({
    classId: section.classId,
    assignmentId: section.assignmentId,
    sectionKey: section.sectionKey,
    exportKind: 'initial',
    uploadConfirmedAt: '2026-09-20T00:00:00Z',
    rows: section.rows.map((row) => ({ ...row })),
  }));

  const changedStudents = structuredClone(students);
  changedStudents[1].gradesByAssignment.a1[3] = record('correct');
  const [updated] = projectGradeTransferUnits({
    classes: [klass],
    assignments: [assignment],
    students: changedStudents,
    teacherEmail: 'teacher@school.org',
    snapshots,
  }).units;

  const bySection = Object.fromEntries(updated.sectionUnits.map((section) => [section.sectionKey, section]));
  assert.equal(bySection.warmup.state, TRANSFER_STATE.UPLOAD_CONFIRMED);
  assert.equal(bySection.classwork.state, TRANSFER_STATE.UPLOAD_CONFIRMED);
  assert.equal(bySection.practice.state, TRANSFER_STATE.UPLOAD_CONFIRMED);
  assert.equal(bySection.dol.state, TRANSFER_STATE.UPDATE_REQUIRED);
  assert.deepEqual(bySection.dol.rows.map((row) => [row.sisStudentId, row.grade]), [['1500456', 100]]);
});

test('Practice Pass stays excused and never invents a numeric Practice grade', () => {
  const practicePasses = new Set([
    '1500123__c1__a1',
    '1500456__c1__a1',
  ]);
  const [unit] = projection({ practicePasses }).units;
  const practice = unit.sectionUnits.find((section) => section.sectionKey === 'practice');

  assert.equal(practice.state, TRANSFER_STATE.NO_TRANSFER_REQUIRED);
  assert.equal(practice.rows.length, 0);
  assert.equal(practice.excused.length, 2);
  assert.equal(new TextDecoder().decode(buildGradebookZip(unit.sectionUnits)).includes('/Practice.csv'), true);
});

test('students with no assignment tracker remain review-required instead of receiving invented section zeros', () => {
  const noEvidence = [{ id: '1500999', classId: 'c1', displayName: 'No Evidence', gradesByAssignment: {} }];
  const [unit] = projectGradeTransferUnits({
    classes: [klass],
    assignments: [assignment],
    students: noEvidence,
    teacherEmail: 'teacher@school.org',
  }).units;

  assert.equal(unit.state, TRANSFER_STATE.REVIEW_REQUIRED);
  unit.sectionUnits.forEach((section) => {
    assert.equal(section.rows.length, 0);
    assert.match(section.problems[0]?.reason || '', /No finalized canonical grade/);
  });
});

test('server persists and validates section identity on immutable Grade Transfer snapshots', () => {
  const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(server, /const sectionKey = String\(input\.sectionKey \|\| ""\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(server, /\["warmup", "classwork", "practice", "dol"\]\.includes\(sectionKey\)/);
  assert.match(server, /sectionKey: sectionKey \|\| null/);
  assert.match(server, /String\(data\.sectionKey \|\| ""\) !== sectionKey/);
});
