import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('student assignment dashboard exposes the printable worksheet action', () => {
  const source = fs.readFileSync('src/components/student/StudentDashboardView.jsx', 'utf8');
  assert.match(source, /onExportAssignmentPdf/);
  assert.match(source, /Export PDF/);
  assert.match(source, /Preparing PDF/);
});

test('student dashboard wires worksheet export through the same assignment runtime', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /exportAssignmentWorksheetPdf/);
  assert.match(source, /generationStudentKey/);
  assert.match(source, /resolveDeliveredQuestionMetadata/);
  assert.match(source, /generateQuestion/);
  assert.match(source, /getWarmupState/);
  assert.match(source, /getDOLState/);
  assert.match(source, /getSectionAccessState/);
  assert.match(source, /onExportAssignmentPdf=\{exportAssignmentWorksheetPdf\}/);
});
