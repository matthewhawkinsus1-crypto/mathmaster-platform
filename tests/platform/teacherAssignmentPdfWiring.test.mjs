import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const dialog = fs.readFileSync('src/components/teacher/TeacherAssignmentPdfDialog.jsx', 'utf8');

test('teacher assignment cards expose one print and answer-key action', () => {
  assert.match(app, /key:\s*['"]export-pdf['"][\s\S]{0,180}label:\s*['"]Print \/ Answer Key['"]/);
  assert.match(app, /beginTeacherWorksheetExport\(assignment\)/);
});

test('teacher print dialog offers all three resolved-question output modes', () => {
  assert.match(dialog, /Student Worksheet/);
  assert.match(dialog, /Teacher Copy/);
  assert.match(dialog, /Answer Key/);
  assert.match(dialog, /PRINT_OUTPUT_MODES\.STUDENT/);
  assert.match(dialog, /PRINT_OUTPUT_MODES\.TEACHER/);
  assert.match(dialog, /PRINT_OUTPUT_MODES\.ANSWER_KEY/);
  assert.match(app, /onExport=\{\(student, outputMode\) => exportTeacherAssignmentWorksheetPdf\(assignment, student, outputMode\)\}/);
});

test('personalized teacher and key exports require an exact roster student', () => {
  assert.match(app, /requiresStudent = assignmentNeedsStudentForWorksheet\(assignment\)/);
  assert.match(dialog, /requiresStudent/);
  assert.match(dialog, /exact MathMaster version/i);
});
