import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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

test('both attendance surfaces are wired to the same App.jsx handler', () => {
  assert.match(appSource, /onRecordStudentSupportEvent=\{handleRecordStudentSupportEvent\}/);
  assert.match(appSource, /onRecordCorrection=\{handleRecordStudentSupportEvent\}/);
  // The old, separate handler must be gone — not just unused, but removed,
  // so nobody can accidentally wire a surface back to a divergent copy.
  assert.doesNotMatch(appSource, /const handleRecordAttendanceCorrection/);
});

test('the shared handler recognizes both attendance event kinds and reconciles extensions for both', () => {
  assert.match(appSource, /const ATTENDANCE_EVENT_KINDS = \[LIVE_ATTENDANCE_EVENT_KIND, ATTENDANCE_HISTORY_EVENT_KIND\];/);
  assert.match(appSource, /const isAttendanceEvent = ATTENDANCE_EVENT_KINDS\.includes\(event\?\.kind\);/);
  const handler = appSource.slice(
    appSource.indexOf('const handleRecordStudentSupportEvent'),
    appSource.indexOf('// Teachers stream presence'),
  );
  assert.match(handler, /if \(isAttendanceEvent\) \{/);
  assert.match(handler, /reviewCount = await reconcileAttendanceExtensions\(event, record\);/);
});

test('reconciliation reads indexed class/date attendance history instead of the capped support feed', () => {
  const region = appSource.slice(
    appSource.indexOf('const reconcileAttendanceExtensions'),
    appSource.indexOf('const [attendanceReviewBusyKey'),
  );
  assert.match(region, /fetchAttendanceForClassDateRange\(\{/);
  assert.match(region, /supportEvents: attendanceHistory/);
  assert.doesNotMatch(region, /supportEvents: \[\.\.\.studentSupportEvents, record\]/);
});

test('a saved attendance record reports and persists a retry audit when reconciliation fails', () => {
  const region = appSource.slice(
    appSource.indexOf('const handleRecordStudentSupportEvent'),
    appSource.indexOf('// Teachers stream presence'),
  );
  assert.match(region, /ATTENDANCE_EXTENSION_RECONCILIATION_PENDING/);
  assert.match(region, /retryable: true/);
  assert.match(region, /Attendance saved; extension update pending/);
  assert.match(region, /return record;/);
});

test('there is exactly one function that calls reconcileAssignmentExtensionsForCorrection', () => {
  const occurrences = appSource.match(/reconcileAssignmentExtensionsForCorrection\(/g) || [];
  assert.equal(occurrences.length, 1);
});

test('a per-student extension is written only through the audited callable, never a direct client update', () => {
  assert.match(appSource, /applyStudentAttendanceExtension\(\{/);
  assert.match(appSource, /import \{ applyStudentAttendanceExtension \} from '\.\/platform\/attendance\/extensionClient\.js';/);
  // Never `updateDoc(doc(db, 'assignments', ...), patch)` — that would both
  // replace the whole studentOverrides map from a possibly-stale snapshot
  // AND be rejected by firestore.rules, which blocks this field entirely
  // from a direct client write.
  assert.doesNotMatch(appSource, /updateDoc\(doc\(db, 'assignments', assignment\.id\), patch\)/);
});

test('firestore.rules blocks a direct client write to studentOverrides on the assignments collection', () => {
  const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const match = rules.match(/match \/assignments\/\{assignmentId\} \{([\s\S]*?)\n {4}\}/);
  assert.ok(match, 'assignments rule block must exist');
  assert.match(match[1], /affectedKeys\(\)\.hasAny\(\['studentOverrides'\]\)/);
});

test('the applyStudentAttendanceExtension callable exists and re-verifies authorization and the never-shorten rule server-side', () => {
  const functionsSource = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(functionsSource, /exports\.applyStudentAttendanceExtension = onCall/);
  assert.match(functionsSource, /authorizeAttendanceExtensionActor\(\{/);
  assert.match(functionsSource, /validateProposedFinalCutoff\(\{/);
});
