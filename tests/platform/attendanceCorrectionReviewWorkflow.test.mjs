import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { functionsBackendSource } from './helpers/functionsBackendSource.mjs';
import { teacherControlsSource } from './helpers/appScreens.mjs';

/*
 * THE REAL "WOULD SHORTEN" REVIEW WORKFLOW.
 *
 * A teacher must be able to explicitly choose KEEP or APPLY SHORTER for an
 * open attendance-correction review, and only that explicit action may ever
 * shorten a deadline already granted. These are source-contract tests over
 * the actual wiring (App.jsx, the panel, and the Cloud Function) because the
 * pure decision logic itself (openAttendanceCorrectionReviewsForStudent,
 * validateProposedFinalCutoff) already has direct unit tests elsewhere.
 */
const appSource = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const panelSource = fs.readFileSync(new URL('../../src/components/teacher/AttendanceHistoryPanel.jsx', import.meta.url), 'utf8');
const functionsSource = functionsBackendSource();
// Since the App split KEEP and APPLY SHORTER are createAttendanceExtensionControls',
// which App calls through the teacher kit (the helper holds that seam), and
// App hands both to the teacher's screen by name.
const attendanceControls = () => teacherControlsSource('createAttendanceExtensionControls');
const between = (source, startNeedle, endNeedle) => {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + 1);
  assert.ok(start >= 0 && end > start, `could not find ${startNeedle} … ${endNeedle}`);
  return source.slice(start, end);
};

test('Attendance History surfaces an open review with both explicit actions, discoverable without hunting', () => {
  assert.match(panelSource, /openAttendanceCorrectionReviewsForStudent/);
  assert.match(panelSource, /Keep Current Extension/);
  assert.match(panelSource, /Apply Shorter Extension/);
  assert.match(panelSource, /onKeepExtension\?\.\(/);
  assert.match(panelSource, /onApplyShorterExtension\?\.\(/);
});

test('KEEP records an auditable resolution and writes nothing to the assignment', () => {
  const region = between(attendanceControls(), 'const handleKeepAttendanceExtension', 'const handleApplyShorterAttendanceExtension');
  assert.match(appSource, /\n {8}handleKeepAttendanceExtension=\{handleKeepAttendanceExtension\}\n/);
  assert.match(region, /resolution: 'kept'/);
  assert.match(region, /recordStudentSupportEvent\(/);
  assert.doesNotMatch(region, /applyStudentAttendanceExtension\(/);
});

test('APPLY SHORTER records the resolution event BEFORE calling the callable, and marks the request explicitly', () => {
  const region = between(attendanceControls(), 'const handleApplyShorterAttendanceExtension', 'const ATTENDANCE_EVENT_KINDS');
  assert.match(appSource, /\n {8}handleApplyShorterAttendanceExtension=\{handleApplyShorterAttendanceExtension\}\n/);
  const resolutionIndex = region.indexOf("resolution: 'shortened'");
  const callableIndex = region.indexOf('applyStudentAttendanceExtension({');
  assert.ok(resolutionIndex >= 0 && callableIndex >= 0 && resolutionIndex < callableIndex,
    'the review-resolution event must be recorded before the callable is invoked');
  assert.match(region, /allowShorten: true/);
  assert.match(region, /existingDateKey: resolution\.existing\?\.dateKey/);
  assert.match(region, /proposedDateKey: resolution\.proposed\?\.dateKey/);
});

test('the callable never trusts allowShorten alone — it independently re-verifies a matching recorded review', () => {
  const region = functionsSource.slice(
    functionsSource.indexOf('exports.applyStudentAttendanceExtension'),
    functionsSource.indexOf('function trustedResponseInspectionEvidence'),
  );
  assert.match(region, /const allowShorten = data\.allowShorten === true;/);
  assert.match(region, /where\("kind", "==", "attendanceCorrectionReview"\)/);
  assert.match(region, /where\("evidence\.resolution", "==", "shortened"\)/);
  assert.match(region, /where\("evidence\.proposedDateKey", "==", proposedDateKey\)/);
  assert.match(region, /const matchingReview = reviewSnap\.docs\.find/);
  assert.match(region, /String\(review\.studentId \|\| ""\) === studentId/);
  assert.match(region, /String\(review\.classId \|\| ""\) === classId/);
  assert.match(region, /if \(!matchingReview\)/);
  assert.match(region, /allowShorten && validity\.reason === "failed-precondition"/);
  assert.match(region, /if \(!validity\.valid && !reviewedShortening\) throw new HttpsError/);
});
