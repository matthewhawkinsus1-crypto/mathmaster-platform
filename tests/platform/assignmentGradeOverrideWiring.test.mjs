import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ASSIGNMENT_GRADE_OVERRIDE_KEY,
  assignmentGradeOverrideFor,
} from '../../src/platform/grading/canonicalGradeProjection.js';

test('assignment override helper accepts only active numeric server projection', () => {
  const student = {
    teacherGradeOverridesByAssignment: {
      a1: {
        [ASSIGNMENT_GRADE_OVERRIDE_KEY]: {
          active: true,
          score: 0,
          reasonCode: 'cellPhoneUse',
        },
      },
    },
  };
  assert.equal(assignmentGradeOverrideFor(student, 'a1')?.score, 0);
  assert.equal(assignmentGradeOverrideFor({
    teacherGradeOverridesByAssignment: { a1: { [ASSIGNMENT_GRADE_OVERRIDE_KEY]: { active: false, score: 0 } } },
  }, 'a1'), null);
  assert.equal(assignmentGradeOverrideFor({
    teacherGradeOverridesByAssignment: { a1: { [ASSIGNMENT_GRADE_OVERRIDE_KEY]: { active: true, score: 'not-a-grade' } } },
  }, 'a1'), null);
});

test('Grade Center exposes the two explicit zero reasons and a restore path', () => {
  const controls = readFileSync(new URL('../../src/components/teacher/AssignmentGradeOverrideControls.jsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(controls, /cellPhoneUse/);
  assert.match(controls, /academicDishonesty/);
  assert.match(controls, /restoreAutomatic/);
  assert.match(controls, /overrideStudentAssignmentGrade/);
  assert.match(app, /<AssignmentGradeOverrideControls/);
  assert.match(app, /assignmentGradeOverrideFor\(student, selectedAssignment\.id\)/);
});

test('server callable owns assignment zero writes, audits them, and wakes Classroom passback', () => {
  const functions = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = functions.indexOf('exports.overrideStudentAssignmentGrade = onCall');
  assert.notEqual(start, -1);
  const block = functions.slice(start, functions.indexOf('// ---------------------------------------------------------------------------\n// Class Points:', start));
  assert.match(block, /requireTeacher\(request\)/);
  assert.match(block, /Only this student's teacher of record/);
  assert.match(block, /studentMatchesAssignmentAudience/);
  assert.match(block, /ASSIGNMENT_GRADE_OVERRIDE_KEY/);
  assert.match(block, /gradeOverrideAudits/);
  assert.match(block, /teacher-assignment-grade-override/);
});

test('Classroom passback uses the assignment zero and bypasses test-cycle anti-lowering only for that explicit override', () => {
  const functions = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(functions, /const assignmentGradeOverride = activeAssignmentGradeOverride\(authoritativeOverrides\)/);
  assert.match(functions, /grade: assignmentGradeOverride\.score/);
  assert.match(functions, /isTestCycleAssignment && priorAudit\.status === "synced" && !assignmentGradeOverride/);
});
