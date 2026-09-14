import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { region } from './helpers/sourceContract.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');

const assertPracticeGuardHonorsReopen = (source, guardName, capturedAtName) => {
  const pattern = new RegExp(
    `getAssignmentLifecycle\\(localAssignment, ${capturedAtName}\\)\\.isPracticeOnly && !${guardName}`,
  );
  assert.match(source, pattern);
  const mutant = source.replace(` && !${guardName}`, '');
  assert.throws(
    () => assert.match(mutant, pattern),
    undefined,
    'removing the reopened-Warm-Up bypass must break this contract',
  );
};

test('teacher live hub keeps stale-date Warm-Up controls visible', () => {
  const home = read('src/TeacherHome.jsx');
  assert.match(home, /state\.enabled && state\.window && state\.status !== 'ended'/);
  assert.match(home, /Open Warm-Up Today/);
  assert.match(home, /\['notToday', 'unscheduled'\]/);
});

test('class workspace exposes the same manual Warm-Up open control', () => {
  const workspace = read('src/ClassesWorkspace.jsx');
  assert.match(workspace, /Open Warm-Up Today/);
  assert.match(workspace, /\['active', 'closed', 'notToday', 'unscheduled'\]/);
});

test('manual Warm-Up open is scoped to the real class and today', () => {
  const app = read('src/App.jsx');
  assert.match(app, /instructionDatesByClassId/);
  assert.match(app, /instructionDatesByClassId\[classId\] = dateKey/);
  assert.match(app, /needsOpenToday/);
  assert.match(app, /Open Warm-Up Today/);
});

test('Warm-Up countdown is visible across teacher and student surfaces', () => {
  const home = read('src/TeacherHome.jsx');
  const workspace = read('src/ClassesWorkspace.jsx');
  const dashboard = read('src/components/student/StudentDashboardView.jsx');
  const app = read('src/App.jsx');

  assert.match(home, /DOLCountdown endsAt=\{state\.endsAt\}/);
  assert.match(workspace, /DOLCountdown endsAt=\{warmup\.endsAt\}/);
  assert.match(dashboard, /Warm-Up active now/);
  assert.match(dashboard, /DOLCountdown endsAt=\{state\.endsAt\}/);
  assert.match(app, /renderStudentWarmupBanner/);
  assert.match(app, /WARM-UP ACTIVE/);
  assert.match(app, /Warm-Up is active — start now/);
  assert.match(app, /Warm-Up reminder — timer is running/);
});

test('a reopened Warm-Up bypasses Practice Mode and reaches the canonical durable save path', () => {
  const app = read('src/App.jsx');
  const submit = region(app, 'const handleGradeSubmit', 'const handleStepGrade', 'ordinary grade submit');
  assert.match(submit, /const teacherReopenedWarmupIsActive = activeQuestionRole === 'warmup'/);
  assert.match(submit, /warmupCaptureWasActive\(timedSectionAccess, submissionCapturedAt\)/);
  assert.match(submit, /timedSectionAccess\?\.teacherTimerScheduled === true/);
  assertPracticeGuardHonorsReopen(submit, 'teacherReopenedWarmupIsActive', 'submissionCapturedAt');
  assert.ok(submit.indexOf('await enqueueDurableAction') < submit.indexOf('setTracker(updatedTracker)'));

  const step = region(app, 'const handleStepGrade', 'const handleRequestNewQuestion', 'step grade submit');
  assert.match(step, /const teacherReopenedWarmupStepIsActive = activeQuestionRole === 'warmup'/);
  assert.match(step, /warmupCaptureWasActive\(stepTimedSectionAccess, stepCapturedAt\)/);
  assert.match(step, /stepTimedSectionAccess\?\.teacherTimerScheduled === true/);
  assertPracticeGuardHonorsReopen(step, 'teacherReopenedWarmupStepIsActive', 'stepCapturedAt');
});

test('teacher-reopened Warm-Up work remains canonical even if the assignment or section closes again before sync', () => {
  const app = read('src/App.jsx');
  const submit = region(app, 'const handleGradeSubmit', 'const handleStepGrade', 'ordinary grade submit');
  const reconcile = region(app, 'const reconcileDurableStudentAction', 'const drainStudentOutbox', 'durable reconciliation');

  assert.match(submit, /createdAt: submissionCapturedAt/);
  assert.match(submit, /activityRole: activeQuestionRole,[\s\S]*timedSectionAccess,[\s\S]*record: outcome\.record/);
  assert.match(reconcile, /const timedSectionAccess = action\.payload\?\.timedSectionAccess \|\| null/);
  assert.match(reconcile, /const teacherReopenedWarmupAtCapture = warmupWasActiveAtCapture[\s\S]*timedSectionAccess\?\.teacherTimerScheduled === true/);
  assert.match(reconcile, /if \(lifecycleAtCapture\.isClosed && !teacherReopenedWarmupAtCapture\)/);

  const mutant = reconcile.replace('&& !teacherReopenedWarmupAtCapture', '');
  assert.throws(
    () => assert.match(mutant, /lifecycleAtCapture\.isClosed && !teacherReopenedWarmupAtCapture/),
    undefined,
    'removing the canonical reopen exception must break this contract',
  );
});

test('new assignments persist the ten-minute Warm-Up close default', () => {
  const app = read('src/App.jsx');
  assert.match(app, /closeMinutesAfterStart: 10/);
  assert.match(app, /manual-reopen-until-class-end/);
});
