import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appFactorySource } from './helpers/appScreens.mjs';
import { region } from './helpers/sourceContract.mjs';

test('student assignment dashboard exposes the printable worksheet action', () => {
  const source = fs.readFileSync('src/components/student/StudentDashboardView.jsx', 'utf8');
  assert.match(source, /onExportAssignmentPdf/);
  assert.match(source, /Export PDF/);
  assert.match(source, /Preparing PDF/);
});

test('student dashboard wires worksheet export through the same assignment runtime', () => {
  const source = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /exportAssignmentWorksheetPdf/);
  // Since the App split the export is createStudentWorksheetExport's, which App
  // calls once and takes exportAssignmentWorksheetPdf from (the helper holds
  // App's arguments and the name it takes to the factory's, name for name).
  const worksheetExport = region(appFactorySource('createStudentWorksheetExport'), 'const exportAssignmentWorksheetPdf = async', '\n  return [', 'the student worksheet export');
  assert.match(worksheetExport, /generationStudentKey/);
  assert.match(worksheetExport, /resolveDeliveredQuestionMetadata/);
  assert.match(worksheetExport, /generateQuestion/);
  assert.match(worksheetExport, /getWarmupState/);
  assert.match(worksheetExport, /getDOLState/);
  assert.match(worksheetExport, /getSectionAccessState/);
  assert.match(source, /onExportAssignmentPdf=\{exportAssignmentWorksheetPdf\}/);
});
