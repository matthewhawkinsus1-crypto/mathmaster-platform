/*
 * ONE ASSIGNMENT, FROM ANYWHERE — AND EVERY ROUTE OUT ARRIVES WITH ITS CONTEXT.
 *
 * The Assignment Hub (components/teacher/AssignmentHub.jsx) is the teacher's
 * way into an assignment's world from every screen an assignment appears on.
 * Nothing renders React here, so these are source contracts: they pin that the
 * screens are wired to the hub, that the hub's controls go through the same
 * App.jsx handlers every other surface uses (which confirm before writing),
 * and that each hand-off carries the class and assignment it came from.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = read('src/App.jsx');
const hub = executableSource(read('src/components/teacher/AssignmentHub.jsx'));

test('App renders the hub, imported, with the shared audited handlers', () => {
  assert.match(app, /import AssignmentHub from '\.\/components\/teacher\/AssignmentHub\.jsx';/);
  const mount = executableSource(region(app, '<AssignmentHub', '/>', 'AssignmentHub mount'));
  for (const [prop, handler] of [
    ['onToggleWarmup', 'handleToggleWarmupForClass'],
    ['onToggleSectionAccess', 'handleToggleSectionAccessForClass'],
    ['onUnlockDOL', 'handleUnlockDOLForClass'],
    ['onGrantDOLAttempt', 'handleGrantDOLAttemptForClass'],
    ['onDolControl', 'handleDolControlForClass'],
  ]) assert.match(mount, new RegExp(`${prop}: ${handler}`), `${prop} goes through ${handler}`);
  assert.match(mount, /onOpenExport=\{\(scope\) => openGradeExport\(scope\)\}/);
  assert.match(mount, /onOpenGrades=\{\(classId, assignmentId\) => openGradebookFor\(classId, assignmentId\)\}/);
  assert.match(mount, /onOpenLive=\{\(classContext, assignmentId\) => openLiveFor\(classContext, assignmentId\)\}/);
});

test('every screen an assignment appears on can open its hub', () => {
  // Assignment cards: the title and the ⋮ menu.
  assert.match(app, /onClick=\{\(\) => openAssignmentHub\(assignment\.id\)\}>\{assignment\.title\}<\/button>/);
  assert.match(app, /\{ key: 'details', label: 'Open assignment details', onClick: \(\) => openAssignmentHub\(assignment\.id\) \}/);
  // Find palette: an assignment result opens the hub for its class.
  assert.match(app, /openAssignmentHub\(result\.payload\.assignmentId, result\.payload\.classId \|\| null\)/);
  // Home, the class page, the student page, the gradebook bar and Grade Export.
  for (const [screen, wiring] of [
    ['TeacherHome', /onOpenAssignment=\{openAssignmentHub\}/],
    ['StudentsRoster', /onOpenAssignment=\{openAssignmentHub\}/],
    ['GradebookAssignmentBar', /onOpenAssignment=\{\(assignmentId\) => openAssignmentHub\(assignmentId, gradebookFilter\.classId \|\| null\)\}/],
    ['GradeTransferCenter', /onOpenAssignment=\{\(assignmentId, classId\) => openAssignmentHub\(assignmentId, classId\)\}/],
  ]) {
    const mount = region(app, `<${screen}`, '/>', `${screen} mount`);
    assert.match(mount, wiring, `${screen} opens the hub`);
  }
});

test('Export grades from the hub arrives scoped to this class and this assignment', () => {
  assert.match(hub, /onOpenExport\(\{ classIds: classContext \? \[classContext\.classId\] : \[\], assignmentId: assignment\.id \}\)/);
  const openExport = executableSource(region(app, 'const openGradeExport = (', 'const openGradebookFor', 'openGradeExport'));
  assert.match(openExport, /setGradeExportScope\(\{ classIds: \(classIds \|\| \[\]\)\.filter\(Boolean\), assignmentId: assignmentId \|\| null, nonce: Date\.now\(\) \}\)/);
  assert.match(openExport, /setTeacherTab\('gradeTransfer'\)/);
});

test('on the live screens the hub loads this class\'s progress on request instead of showing zeros', () => {
  // Without grade records the hub never reports a class of zeros…
  assert.match(hub, /hasGradeRecords\s*\?\s*classGradeProgress\(\{ assignment, roster, hasGradeRecords, nameOf \}\)\s*:\s*fetched\?\.students\s*\?\s*classGradeProgress\(\{ assignment, roster: fetched\.students, hasGradeRecords: true, nameOf \}\)\s*:\s*null/);
  // …it offers to load them, and says how fresh they are once loaded.
  assert.match(hub, /onClick=\{loadGrades\}/);
  assert.match(hub, /const students = await onLoadClassGrades\(key\);/);
  assert.match(hub, /As of \{clock\(fetched\.at\)\}/);
});

test('a closed lesson leads with its grades; opening it again today is folded, not removed', () => {
  assert.match(hub, /const pastLesson = lifecycle\.isClosed;/);
  assert.match(hub, /return pastLesson\s*\?\s*<>\{progressSection\}\{liveSection\}\{controls\}<\/>\s*:\s*<>\{controls\}\{liveSection\}\{progressSection\}<\/>;/);
  const controls = region(hub, 'const controls = classContext && (pastLesson ? (', 'const liveSection', 'hub controls');
  assert.match(controls, /<details className="tw-disclosure"[\s\S]*<AssignmentLessonRows[\s\S]*<\/details>/);
});
