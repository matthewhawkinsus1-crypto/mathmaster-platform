import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');

test('teacher assignment cards expose a printable PDF action', () => {
  assert.match(app, /key:\s*['"]export-pdf['"][\s\S]{0,160}label:\s*['"]Export Printable PDF['"]/);
  assert.match(app, /beginTeacherWorksheetExport\(assignment\)/);
});

test('personalized teacher exports use the student-selection dialog', () => {
  assert.match(app, /TeacherAssignmentPdfDialog/);
  assert.match(app, /teacherWorksheetDialog/);
});
