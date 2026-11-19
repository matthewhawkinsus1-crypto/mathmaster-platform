import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource as executableSourceOf } from './helpers/sourceContract.mjs';
import { functionsBackendSource } from './helpers/functionsBackendSource.mjs';
import { appSurfaceSource, teacherControlsSource } from './helpers/appScreens.mjs';

/*
 * ONE RECONCILIATION TRIGGER, NOT TWO.
 *
 * Live Classroom's same-day quick-mark and an Attendance History correction
 * both end up calling `onRecordStudentSupportEvent`
 * (LiveClassMonitor -> TeacherHome -> App.jsx) / `onRecordCorrection`
 * (AttendanceHistoryPanel -> App.jsx). Both props must resolve to the SAME
 * App.jsx function, and that function must be the one place attendance
 * extension reconciliation runs — a second, parallel reconciliation path
 * would let the two surfaces disagree about a student's deadline.
 */
const appSource = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
// The two surfaces are mounted by the teacher's screen, its own module since
// G2. App hands it the one handler by name.
const teacherWorkspace = fs.readFileSync(new URL('../../src/app/teacher/TeacherWorkspace.jsx', import.meta.url), 'utf8');
// Since the App split the one handler and the reconciliation it runs are
// createAttendanceExtensionControls', which App calls through the teacher kit
// (the helper holds that seam) for the handler it hands the teacher's screen.
const attendanceControls = () => teacherControlsSource('createAttendanceExtensionControls');
const between = (source, startNeedle, endNeedle) => {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + 1);
  assert.ok(start >= 0 && end > start, `could not find ${startNeedle} … ${endNeedle}`);
  return source.slice(start, end);
};

test('both attendance surfaces are wired to the same App.jsx handler', () => {
  assert.match(teacherWorkspace, /onRecordStudentSupportEvent=\{handleRecordStudentSupportEvent\}/);
  assert.match(teacherWorkspace, /onRecordCorrection=\{handleRecordStudentSupportEvent\}/);
  // …and that name is App's one handler, passed through unchanged.
  assert.match(teacherWorkspace, /^export default function TeacherWorkspace\(\{[^)]*\n {2}handleRecordStudentSupportEvent,\n/m);
  assert.match(appSource, /<TeacherWorkspace[^>]*\n {8}handleRecordStudentSupportEvent=\{handleRecordStudentSupportEvent\}\n/);
  assert.doesNotMatch(executableSourceOf(teacherWorkspace), /const handleRecordStudentSupportEvent|const handleRecordAttendanceCorrection/);
  // The old, separate handler must be gone — not just unused, but removed,
  // so nobody can accidentally wire a surface back to a divergent copy.
  assert.doesNotMatch(appSource, /const handleRecordAttendanceCorrection/);
});

test('the shared handler recognizes both attendance event kinds and reconciles extensions for both', () => {
  const controls = attendanceControls();
  assert.match(controls, /const ATTENDANCE_EVENT_KINDS = \[LIVE_ATTENDANCE_EVENT_KIND, ATTENDANCE_HISTORY_EVENT_KIND\];/);
  assert.match(controls, /const isAttendanceEvent = ATTENDANCE_EVENT_KINDS\.includes\(event\?\.kind\);/);
  // (The last handler of the factory: it runs to the factory's return.)
  const handler = between(controls, 'const handleRecordStudentSupportEvent', '\n  return [');
  assert.match(handler, /if \(isAttendanceEvent\) \{/);
  assert.match(handler, /reviewCount = await reconcileAttendanceExtensions\(event, record\);/);
});

test('reconciliation reads indexed class/date attendance history instead of the capped support feed', () => {
  const region = between(attendanceControls(), 'const reconcileAttendanceExtensions', 'const handleKeepAttendanceExtension');
  assert.match(region, /fetchAttendanceForClassDateRange\(\{/);
  assert.match(region, /supportEvents: attendanceHistory/);
  assert.doesNotMatch(region, /supportEvents: \[\.\.\.studentSupportEvents, record\]/);
});

test('a saved attendance record reports and persists a retry audit when reconciliation fails', () => {
  const region = between(attendanceControls(), 'const handleRecordStudentSupportEvent', '\n  return [');
  assert.match(region, /ATTENDANCE_EXTENSION_RECONCILIATION_PENDING/);
  assert.match(region, /retryable: true/);
  assert.match(region, /Attendance saved; extension update pending/);
  assert.match(region, /return record;/);
});

test('there is exactly one function that calls reconcileAssignmentExtensionsForCorrection', () => {
  // Counted across App and every module its code moved into: the one call
  // is createAttendanceExtensionControls' since the App split.
  const occurrences = appSurfaceSource().match(/reconcileAssignmentExtensionsForCorrection\(/g) || [];
  assert.match(between(attendanceControls(), 'const reconcileAttendanceExtensions', 'const handleKeepAttendanceExtension'), /reconcileAssignmentExtensionsForCorrection\(/);
  assert.equal(occurrences.length, 1);
});

test('a per-student extension is written only through the audited callable, never a direct client update', () => {
  const controls = attendanceControls();
  assert.match(controls, /applyStudentAttendanceExtension\(\{/);
  assert.match(controls, /import \{ applyStudentAttendanceExtension \} from '\.\.\/\.\.\/\.\.\/platform\/attendance\/extensionClient\.js';/);
  // Never `updateDoc(doc(db, 'assignments', ...), patch)` — that would both
  // replace the whole studentOverrides map from a possibly-stale snapshot
  // AND be rejected by firestore.rules, which blocks this field entirely
  // from a direct client write.
  // (Refused in every module App's code moved into by appSplitForbiddenPatterns.test.mjs.)
  assert.doesNotMatch(appSource, /updateDoc\(doc\(db, 'assignments', assignment\.id\), patch\)/);
});

test('firestore.rules blocks a direct client write to studentOverrides on the assignments collection', () => {
  const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const match = rules.match(/match \/assignments\/\{assignmentId\} \{([\s\S]*?)\n {4}\}/);
  assert.ok(match, 'assignments rule block must exist');
  assert.match(match[1], /affectedKeys\(\)\.hasAny\(\['studentOverrides'\]\)/);
});

test('the applyStudentAttendanceExtension callable exists and re-verifies authorization and the never-shorten rule server-side', () => {
  const functionsSource = functionsBackendSource();
  assert.match(functionsSource, /exports\.applyStudentAttendanceExtension = onCall/);
  assert.match(functionsSource, /authorizeAttendanceExtensionActor\(\{/);
  assert.match(functionsSource, /validateProposedFinalCutoff\(\{/);
});
