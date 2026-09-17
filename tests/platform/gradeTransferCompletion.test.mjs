import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { buildTransferUnit, TRANSFER_STATE } from '../../src/platform/gradeTransfer/gradeTransferModel.js';
import { canonicalPresentedAssignmentGrade } from '../../src/platform/grading/canonicalGradeProjection.js';

const klass = { classId: 'c1', name: 'Algebra 1', period: 'P1' };
const assignment = { id: 'a1', title: 'Linear Correlation', lateDueAt: '2026-09-16T23:00:00Z' };
const now = Date.parse('2026-09-17T00:00:00Z');
const score = ({ student }) => student.gradesByAssignment.a1.score;
const student = (id, grade) => ({ id, displayName: id, gradesByAssignment: { a1: { score: grade } } });

test('Grade Transfer uses the canonical recorded Test Cycle grade instead of the ordinary tracker', () => {
  const cycleAssignment = {
    ...assignment,
    assessmentPolicy: { mode: 'testCycle', passingScore: 70, retest: { maxRecordedGrade: 70 } },
  };
  const cycleStudent = {
    id: '1500123',
    gradesByAssignment: { a1: { score: 52 } },
    testCycleGrades: { a1: { originalTestGrade: 52, rawRetestGrade: 84 } },
  };

  assert.equal(canonicalPresentedAssignmentGrade({ student: cycleStudent, assignment: cycleAssignment }), 70);
});

test('Grade Transfer keeps a cumulative baseline across confirmed initial and delta uploads', () => {
  const first = student('1500123', 85);
  const second = student('1500456', 90);
  const initial = {
    createdAt: '2026-09-17T00:01:00Z',
    uploadConfirmedAt: '2026-09-17T00:02:00Z',
    rows: [
      { studentId: first.id, sisStudentId: first.id, grade: 80 },
      { studentId: second.id, sisStudentId: second.id, grade: 90 },
    ],
  };
  const delta = {
    createdAt: '2026-09-17T01:01:00Z',
    uploadConfirmedAt: '2026-09-17T01:02:00Z',
    rows: [{ studentId: first.id, sisStudentId: first.id, grade: 85 }],
  };

  const unit = buildTransferUnit({
    classRecord: klass,
    assignment,
    students: [first, second],
    now,
    projectCanonicalGrade: score,
    confirmedSnapshots: [delta, initial],
  });

  assert.equal(unit.exportKind, 'delta');
  assert.equal(unit.state, TRANSFER_STATE.UPLOAD_CONFIRMED);
  assert.deepEqual(unit.rows, []);
});

test('an explicitly reopened student is withheld after the ordinary final cutoff', () => {
  const reopened = student('1500123', 92);
  const unit = buildTransferUnit({
    classRecord: klass,
    assignment,
    students: [reopened],
    now,
    projectCanonicalGrade: score,
    resolveStudentFinalDeadline: () => ({ deadline: null, reopened: true }),
  });

  assert.equal(unit.state, TRANSFER_STATE.WAITING_ON_EXTENDED_STUDENTS);
  assert.equal(unit.rows.length, 0);
  assert.equal(unit.withheld.length, 1);
  assert.match(unit.withheld[0].reason, /reopen/i);
});

test('a stale student override can never shorten the ordinary class final cutoff', () => {
  const laterAssignment = { ...assignment, lateDueAt: '2026-09-20T00:00:00Z' };
  const unit = buildTransferUnit({
    classRecord: klass,
    assignment: laterAssignment,
    students: [student('1500123', 92)],
    now: Date.parse('2026-09-19T00:00:00Z'),
    projectCanonicalGrade: score,
    resolveStudentFinalDeadline: () => ({ deadline: '2026-09-18T00:00:00Z', reopened: false }),
  });

  assert.equal(unit.state, TRANSFER_STATE.WAITING_FOR_FINALIZATION);
  assert.equal(unit.rows.length, 0);
});

test('Grade Transfer production wiring consumes assignment student override deadlines and reopen state', () => {
  const resolverSource = readFileSync(new URL('../../src/platform/gradeTransfer/studentDeadlineResolver.js', import.meta.url), 'utf8');
  const centerSource = readFileSync(new URL('../../src/components/teacher/GradeTransferCenter.jsx', import.meta.url), 'utf8');

  assert.match(resolverSource, /studentOverrides/);
  assert.match(resolverSource, /reopenedStudentIds/);
  assert.match(resolverSource, /lateDueAt/);
  assert.match(centerSource, /resolveStudentFinalDeadlineFromAssignment/);
  assert.doesNotMatch(centerSource, /resolveStudentFinalDeadline = noStudentSpecificFinalDeadline/);
});
