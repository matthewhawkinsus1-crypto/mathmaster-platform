import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SUBMISSION_DISPOSITION,
  classifyCapturedSubmission,
} from '../../functions/shared/studentSubmissionDisposition.mjs';
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
  const reconcile = region(app, 'const buildSubmissionEnvelopeForAction', 'const drainStudentOutbox', 'durable reconciliation');

  assert.match(submit, /createdAt: submissionCapturedAt/);
  assert.match(submit, /activityRole: activeQuestionRole,[\s\S]*timedSectionAccess,[\s\S]*record: outcome\.record/);
  // The capture proof travels in the ingestion envelope. The server is now the
  // only grade authority and applies the shared capture-time classifier there.
  assert.match(reconcile, /timedSectionAccess: payload\.timedSectionAccess \|\| null/);
  assert.match(reconcile, /capturedSectionAccess: payload\.capturedSectionAccess \|\| null/);
  assert.match(reconcile, /await ingestOneSubmission\(buildSubmissionEnvelopeForAction\(action\)\)/);
  assert.doesNotMatch(reconcile, /lastSubmissionId: action\.actionId/);
});

/*
 * THE SAME RULE, EXERCISED RATHER THAN SPELLED.
 *
 * The exception used to be an inline expression in App.jsx that only a regex
 * could see. It is a shared, importable decision now, so this runs it: work
 * captured inside a teacher-reopened Warm-Up survives the assignment closing
 * again, and without the exception it would not.
 */
test('a Warm-Up the teacher reopened keeps credit when the assignment closes again before the queue drains', () => {
  const captured = {
    actionId: 'warmup-attempt',
    kind: 'ordinarySubmission',
    activityRole: 'warmup',
    capturedAt: 1_700_000_000_000,
    previousTotalAttempts: 0,
    canonicalRecord: { totalAttempts: 0 },
    assignmentExists: true,
    gradeRecordExists: true,
    authorizedForClass: true,
    // The assignment's own cutoff had already passed at capture time.
    assignmentClosedAtCapture: true,
    sectionOpenAtCapture: true,
  };

  assert.equal(
    classifyCapturedSubmission({ ...captured, teacherReopenedWarmupAtCapture: true }).disposition,
    SUBMISSION_DISPOSITION.ACCEPTED,
  );
  // Remove the reopen and the same capture is correctly refused: the exception
  // is doing the work, not a permissive default.
  assert.equal(
    classifyCapturedSubmission({ ...captured, teacherReopenedWarmupAtCapture: false }).disposition,
    SUBMISSION_DISPOSITION.PERMANENTLY_INVALID,
  );
  assert.equal(
    classifyCapturedSubmission({ ...captured, teacherReopenedWarmupAtCapture: false }).reason,
    'assignment-closed-at-capture',
  );
});

test('new assignments persist the ten-minute Warm-Up close default', () => {
  const app = read('src/App.jsx');
  assert.match(app, /closeMinutesAfterStart: 10/);
  assert.match(app, /manual-reopen-until-class-end/);
});
