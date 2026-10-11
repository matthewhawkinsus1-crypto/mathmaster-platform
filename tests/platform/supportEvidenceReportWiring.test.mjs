// The new Student Support Evidence Report replaces the pop-up "IEP Support
// Report" at every entry point, loads through the same rules-guarded readers
// as the rest of the teacher workspace, and prints only itself.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region, executableSource } from './helpers/sourceContract.mjs';
import { importsComponent } from './helpers/componentImport.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
// The teacher's screen (drawer, gradebook, roster, report mount) is its own
// module since G2; App keeps openIEPReport and hands it over by name.
const teacherWorkspace = read('src/app/teacher/TeacherWorkspace.jsx');
const view = read('src/components/teacher/SupportEvidenceReportView.jsx');
const css = read('src/components/teacher/supportEvidence.css');

test('every entry point opens the new report; the old pop-up generator is gone', () => {
  assert.doesNotMatch(executableSource(app), /buildIEPReportHtml|reportWindow\.document\.write/);
  assert.doesNotMatch(executableSource(teacherWorkspace), /buildIEPReportHtml|reportWindow\.document\.write/);
  assert.doesNotMatch(executableSource(read('src/studentSupport.js')), /buildIEPReportHtml/);
  assert.match(region(app, 'const openIEPReport = (student) => {', '\n  };', 'openIEPReport'), /setSupportReportStudentId\(student\.id\);/);
  const drawerMount = executableSource(region(teacherWorkspace, '<StudentProfileDrawer', '/>', 'drawer mount'));
  assert.match(drawerMount, /onOpenSupportReport=\{\(studentId\) => setSupportReportStudentId\(studentId\)\}/);
  // Gradebook and roster keep calling openIEPReport, App's.
  assert.match(teacherWorkspace, /onClick=\{\(\) => openIEPReport\(student\)\}/);
  assert.match(teacherWorkspace, /onGenerateIEPReport=\{openIEPReport\}/);
  assert.match(app, /\n {8}openIEPReport=\{openIEPReport\}\n/);
});

test('the report view is imported, mounted above the drawer, and closes to it', () => {
  // (G2: a teacher-only panel may come from lazyScreens.js, loaded on demand)
  assert.ok(importsComponent('src/app/teacher/TeacherWorkspace.jsx', 'SupportEvidenceReportView', 'src/components/teacher/SupportEvidenceReportView.jsx'));
  assert.ok(teacherWorkspace.indexOf('<SupportEvidenceReportView') > teacherWorkspace.indexOf('<StudentProfileDrawer'), 'renders after the drawer so it stacks on top');
  const mount = region(teacherWorkspace, '<SupportEvidenceReportView', '/>', 'report mount');
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
