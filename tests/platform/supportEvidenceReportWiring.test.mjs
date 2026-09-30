// The new Student Support Evidence Report replaces the pop-up "IEP Support
// Report" at every entry point, loads through the same rules-guarded readers
// as the rest of the teacher workspace, and prints only itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region, executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const view = read('src/components/teacher/SupportEvidenceReportView.jsx');
const css = read('src/components/teacher/supportEvidence.css');

test('every entry point opens the new report; the old pop-up generator is gone', () => {
  assert.doesNotMatch(executableSource(app), /buildIEPReportHtml|reportWindow\.document\.write/);
  assert.doesNotMatch(executableSource(read('src/studentSupport.js')), /buildIEPReportHtml/);
  assert.match(region(app, 'const openIEPReport = (student) => {', '\n  };', 'openIEPReport'), /setSupportReportStudentId\(student\.id\);/);
  const drawerMount = executableSource(region(app, '<StudentProfileDrawer', '/>', 'drawer mount'));
  assert.match(drawerMount, /onOpenSupportReport=\{\(studentId\) => setSupportReportStudentId\(studentId\)\}/);
  // Gradebook and roster keep calling openIEPReport.
  assert.match(app, /onClick=\{\(\) => openIEPReport\(student\)\}/);
  assert.match(app, /onGenerateIEPReport=\{openIEPReport\}/);
});

test('the report view is imported, mounted above the drawer, and closes to it', () => {
  assert.match(app, /import SupportEvidenceReportView from '\.\/components\/teacher\/SupportEvidenceReportView\.jsx';/);
  assert.ok(app.indexOf('<SupportEvidenceReportView') > app.indexOf('<StudentProfileDrawer'), 'renders after the drawer so it stacks on top');
  const mount = region(app, '<SupportEvidenceReportView', '/>', 'report mount');
  assert.match(mount, /onClose=\{\(\) => setSupportReportStudentId\(null\)\}/);
  assert.match(mount, /teacherEmail=\{user\?\.email \|\| ''\}/);
});

test('the report loads through the rules-guarded readers and degrades rather than guesses', () => {
  const generate = region(view, 'const generate = async () => {', '\n  };', 'generate');
  assert.match(generate, /fetchStudentGradeRecord\(\{ db, studentId: student\.id \}\)/);
  assert.match(generate, /loadStudentSupportRecords\(\{/);
  assert.match(generate, /fetchStudentSupportHistory\(\{ db, teacherEmail, studentId: student\.id/);
  // Export history comes from the same callable Grade Export uses; if it
  // fails, export status reads "not loaded" instead of "not exported".
  assert.match(generate, /loadTeacherGradeTransferState\(\{ classIds: \[fullStudent\.classId\] \}\)\.catch\(\(\) => null\)/);
  assert.match(generate, /exportSnapshots: exportState \? exportState\.snapshots : null,/);
  assert.match(generate, /buildSupportEvidenceReport\(\{/);
});

test('printing expands every section and prints only the report', () => {
  assert.match(region(view, 'const printReport = () => {', '\n  };', 'printReport'), /setExpanded\(true\);\n    setTimeout\(\(\) => window\.print\(\), 150\);/);
  const print = region(css, '@media print {', '\n}\n', 'print css');
  assert.match(print, /body \* \{ visibility: hidden !important; \}/);
  assert.match(print, /\.se-report, \.se-report \* \{ visibility: visible !important; \}/);
  assert.match(print, /\.se-report__controls, \.se-report \[data-screen-only\] \{ display: none !important; \}/);
  assert.match(view, /<details className="se-report__card" open=\{expanded \|\| undefined\}/);
});

test('downloads use the model\'s own serialisers', () => {
  assert.match(view, /download\(supportReportCsv\(report\), supportReportFileName\(report, 'csv'\), 'text\/csv'\)/);
  assert.match(view, /download\(supportReportJson\(report\), supportReportFileName\(report, 'json'\), 'application\/json'\)/);
});
