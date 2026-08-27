import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentNeedsStudentForWorksheet,
  buildTeacherAssignmentWorksheetModel,
  eligibleStudentsForTeacherWorksheet,
} from '../../src/platform/resources/teacherAssignmentWorksheetExport.js';
import { PRINT_OUTPUT_MODES, worksheetFileName } from '../../src/platform/resources/assignmentWorksheetPdfModel.js';

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

const assignmentWithQuestions = ({
  id,
  title,
  variantMode = 'shared',
  sectionVariantModes = {},
  questions,
  role = 'practice',
}) => ({
  id,
  schemaVersion: 5,
  title,
  variantMode,
  sectionVariantModes,
  sections: [{
    id: role,
    role,
    title: role === 'practice' ? 'Practice' : role,
    questions,
  }],
});

test('shared student worksheet exports directly without a student and never leaks answers', () => {
  const assignment = assignmentWithQuestions({
    id: 'shared-1',
    title: 'Shared Functions Practice',
    variantMode: 'shared',
    questions: [question()],
  });
  assert.equal(assignmentNeedsStudentForWorksheet(assignment), false);
  const model = buildTeacherAssignmentWorksheetModel({ assignment });
  assert.equal(model.studentName, '');
  assert.equal(model.sections.length, 1);
  assert.equal(JSON.stringify(model).includes('Subtract 3'), false);
  assert.equal(JSON.stringify(model).includes('"expected"'), false);
});


test('teacher copy and answer key use the same resolved shared question while exposing only requested key data', () => {
  const assignment = assignmentWithQuestions({
    id: 'shared-key-1',
    title: 'Shared Key Practice',
    variantMode: 'shared',
    questions: [question()],
  });

  const teacherModel = buildTeacherAssignmentWorksheetModel({
    assignment,
    outputMode: PRINT_OUTPUT_MODES.TEACHER,
  });
  const keyModel = buildTeacherAssignmentWorksheetModel({
    assignment,
    outputMode: PRINT_OUTPUT_MODES.ANSWER_KEY,
  });

  assert.equal(teacherModel.outputMode, PRINT_OUTPUT_MODES.TEACHER);
  assert.equal(keyModel.outputMode, PRINT_OUTPUT_MODES.ANSWER_KEY);
  assert.ok(teacherModel.sections[0].questions[0].answerLines.some((line) => /4/.test(line)));
  assert.deepEqual(
    teacherModel.sections[0].questions[0].solutionLines,
    ['Subtract 3', 'Divide by 2'],
  );
  assert.ok(keyModel.sections[0].questions[0].answerLines.some((line) => /4/.test(line)));
  assert.equal('solutionLines' in keyModel.sections[0].questions[0], false);
});

test('personalized teacher worksheet requires a student and carries that student name', () => {
  const assignment = assignmentWithQuestions({
    id: 'personal-1',
    title: 'Personalized Practice',
    variantMode: 'personalized',
    questions: [question()],
  });
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
  const assignment = assignmentWithQuestions({
    id: 'section-1',
    title: 'Mixed Sections',
    variantMode: 'shared',
    sectionVariantModes: { practice: 'personalized' },
    questions: [question({ activityRole: 'practice' })],
  });
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

test('personalized teacher key retains the selected student version in its filename', () => {
  assert.equal(
    worksheetFileName({
      assignmentTitle: 'Lesson 2 Functions',
      studentName: 'Student Seventeen',
      outputMode: PRINT_OUTPUT_MODES.ANSWER_KEY,
    }),
    'Lesson_2_Functions-Answer_Key-Student_Seventeen.pdf',
  );
});
