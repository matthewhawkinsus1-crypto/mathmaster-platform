import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentNeedsStudentForWorksheet,
  buildTeacherAssignmentWorksheetModel,
  eligibleStudentsForTeacherWorksheet,
} from '../../src/platform/resources/teacherAssignmentWorksheetExport.js';
import { worksheetFileName } from '../../src/platform/resources/assignmentWorksheetPdfModel.js';

const question = (overrides = {}) => ({
  type: 'algebra',
  prompt: 'Solve $2x+3=11$.',
  activityRole: 'practice',
  expected: '4',
  accepted: ['4'],
  solution: ['Subtract 3', 'Divide by 2'],
  generator: { solutionRange: [4, 4], coefficientRange: [2, 2], constantRange: [3, 3] },
  ...overrides,
});

test('shared teacher worksheet exports directly without a student and never leaks answers', () => {
  const assignment = {
    id: 'shared-1',
    title: 'Shared Functions Practice',
    variantMode: 'shared',
    questions: [question()],
  };
  assert.equal(assignmentNeedsStudentForWorksheet(assignment), false);
  const model = buildTeacherAssignmentWorksheetModel({ assignment });
  assert.equal(model.studentName, '');
  assert.equal(model.sections.length, 1);
  assert.equal(JSON.stringify(model).includes('Subtract 3'), false);
  assert.equal(JSON.stringify(model).includes('"expected"'), false);
});

test('personalized teacher worksheet requires a student and carries that student name', () => {
  const assignment = {
    id: 'personal-1',
    title: 'Personalized Practice',
    variantMode: 'personalized',
    questions: [question()],
  };
  assert.equal(assignmentNeedsStudentForWorksheet(assignment), true);
  assert.throws(
    () => buildTeacherAssignmentWorksheetModel({ assignment }),
    /Choose a student/,
  );
  const student = {
    id: 's-17',
    displayName: 'Student Seventeen',
    classPeriod: '3rd Period',
    profile: {},
    gradesByAssignment: { 'personal-1': { 0: { variantIndex: 2 } } },
  };
  const model = buildTeacherAssignmentWorksheetModel({ assignment, student, studentProfile: student.profile });
  assert.equal(model.studentName, 'Student Seventeen');
  assert.equal(model.classPeriod, '3rd Period');
  assert.equal(model.sections[0].questions.length, 1);
});

test('section-specific personalized mode is enough to require a student', () => {
  const assignment = {
    id: 'section-1',
    title: 'Mixed Sections',
    variantMode: 'shared',
    sectionVariantModes: { practice: 'personalized' },
    questions: [question({ activityRole: 'practice' })],
  };
  assert.equal(assignmentNeedsStudentForWorksheet(assignment), true);
});

test('teacher student picker is scoped to the assignment audience, but library items can use any roster student', () => {
  const students = [
    { id: 'a', classId: 'c1', classPeriod: '1st Period' },
    { id: 'b', classId: 'c2', classPeriod: '2nd Period' },
  ];
  const assigned = { assignedClassIds: ['c1'], assignedClassPeriods: ['1st Period'] };
  assert.deepEqual(eligibleStudentsForTeacherWorksheet(assigned, students).map((student) => student.id), ['a']);
  assert.deepEqual(eligibleStudentsForTeacherWorksheet({}, students).map((student) => student.id), ['a', 'b']);
});

test('teacher blank worksheet file names say Printable instead of Student', () => {
  assert.equal(
    worksheetFileName({ assignmentTitle: 'Lesson 2 Functions', studentName: '' }),
    'Lesson_2_Functions-Printable.pdf',
  );
});
