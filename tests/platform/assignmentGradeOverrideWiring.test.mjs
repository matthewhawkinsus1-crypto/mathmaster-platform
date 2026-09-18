import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ASSIGNMENT_GRADE_OVERRIDE_KEY,
  assignmentGradeOverrideFor,
} from '../../src/platform/grading/canonicalGradeProjection.js';
import { region } from './helpers/sourceContract.mjs';

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


test('integrity controls cover section scope, confirmed roles, third reason, and deliberate teacher confirmation', () => {
  const controls = readFileSync(new URL('../../src/components/teacher/AssignmentGradeOverrideControls.jsx', import.meta.url), 'utf8');
  assert.match(controls, /accountSwitching/);
  assert.match(controls, /Prohibited cellphone use/);
  assert.match(controls, /Unauthorized assistance \/ cheating/);
  assert.match(controls, /Account or laptop switching/);
  assert.match(controls, /received/);
  assert.match(controls, /supplied/);
  assert.match(controls, /Whole assignment/);
  assert.match(controls, /This section/);
  assert.match(controls, /I personally confirm this incident/);
  assert.match(controls, /Apply 0% Integrity Consequence/);
  assert.match(controls, /restoreSectionZero/);
  const submission = region(controls, 'const academicIntegrityConsequence = {', 'setOverride(', 'integrity submission');
  assert.match(submission, /scope,/);
  assert.match(submission, /sectionRole:/);
  assert.match(submission, /participantRole,/);
  assert.match(submission, /teacherConfirmed,/);
  assert.match(submission, /academicIntegrityConsequence,/);
});

test('assignment and section integrity actions are accepted only for their matching scope', () => {
  const functions = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = functions.indexOf('exports.overrideStudentAssignmentGrade = onCall');
  const end = functions.indexOf('// ---------------------------------------------------------------------------\n// Class Points:', start);
  assert.ok(start >= 0 && end > start);
  const block = functions.slice(start, end);
  assert.match(block, /const actionMatchesScope = scope === "section"[\s\S]*\["issueZero", "restoreSectionZero"\]\.includes\(action\)[\s\S]*\["issueZero", "restoreAutomatic"\]\.includes\(action\)/);
  assert.match(block, /if \(!actionMatchesScope\)/);
});

test('server enforces confirmed section zeros, preserves prior corrections, updates DOL, and creates parent follow-up', () => {
  const functions = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = functions.indexOf('exports.overrideStudentAssignmentGrade = onCall');
  const end = functions.indexOf('// ---------------------------------------------------------------------------\n// Class Points:', start);
  assert.ok(start >= 0 && end > start);
  const block = functions.slice(start, end);
  assert.match(block, /teacherConfirmed/);
  assert.match(block, /runtimeIncludedQuestionIndicesForSection/);
  assert.match(block, /previousOverridesByQuestion/);
  assert.match(block, /persistent:\s*true/);
  assert.match(block, /source:\s*["']teacher-section-zero["']/);
  assert.match(block, /runtimeIncludedQuestionIndicesForSection\(assignment, sectionRole\)/);
  assert.match(block, /kind:\s*["']academicIntegrityIncident["']/);
  assert.match(block, /kind:\s*["']parentFollowUp["']/);
  assert.match(block, /stage:\s*["']teacherConfirmed["']/);
  assert.match(functions, /accountSwitching:\s*["']Account or laptop switching["']/);
  assert.match(block, /participantRole/);
  assert.match(block, /triggerType === ["']SYSTEM_SIGNAL["'][\s\S]*throw new HttpsError/);
});

test('teacher support history labels confirmed academic-integrity incidents separately from automated review signals', () => {
  const support = readFileSync(new URL('../../src/platform/teacher/studentSupportSignals.js', import.meta.url), 'utf8');
  assert.match(support, /ACADEMIC_INTEGRITY_INCIDENT:\s*['"]academicIntegrityIncident['"]/);
  assert.match(support, /Academic Integrity Incident/);
});
