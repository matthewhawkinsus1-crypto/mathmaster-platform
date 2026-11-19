import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { teacherControlsSource } from './helpers/appScreens.mjs';

const dialog = fs.readFileSync('src/components/teacher/TeacherAssignmentPdfDialog.jsx', 'utf8');
// The assignment cards and the dialog mount are the teacher's screen, its own
// module since G2; App keeps the export handlers.
const teacherWorkspace = fs.readFileSync('src/app/teacher/TeacherWorkspace.jsx', 'utf8');

test('teacher assignment cards expose one print and answer-key action', () => {
  assert.match(teacherWorkspace, /key:\s*['"]export-pdf['"][\s\S]{0,180}label:\s*['"]Print \/ Answer Key['"]/);
  assert.match(teacherWorkspace, /beginTeacherWorksheetExport\(assignment\)/);
});

test('teacher print dialog offers all three resolved-question output modes', () => {
  assert.match(dialog, /Student Worksheet/);
  assert.match(dialog, /Teacher Copy/);
  assert.match(dialog, /Answer Key/);
  assert.match(dialog, /PRINT_OUTPUT_MODES\.STUDENT/);
  assert.match(dialog, /PRINT_OUTPUT_MODES\.TEACHER/);
  assert.match(dialog, /PRINT_OUTPUT_MODES\.ANSWER_KEY/);
  assert.match(teacherWorkspace, /onExport=\{\(student, outputMode\) => exportTeacherAssignmentWorksheetPdf\(assignment, student, outputMode\)\}/);
});

test('personalized teacher and key exports require an exact roster student', () => {
  // Since the App split, createTeacherWorksheetControls (the teacher kit) owns the export
  // handlers; teacherControlsSource checks App calls it and passes each parameter by name.
  const worksheetControls = teacherControlsSource('createTeacherWorksheetControls');
  assert.match(worksheetControls, /export function createTeacherWorksheetControls\([^)]*[(,\s]requireTeacherKit[,\s)]/);
  assert.match(worksheetControls, /requiresStudent = requireTeacherKit\(\)\.assignmentNeedsStudentForWorksheet\(assignment\)/);
  assert.match(dialog, /requiresStudent/);
  assert.match(dialog, /exact MathMaster version/i);
});
