import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  runtimeIncludedQuestionIndices,
  runtimeIncludedQuestionCount,
} = require('../../functions/lib/assignmentRuntime.js');

const read = (path) => fs.readFileSync(path, 'utf8');

test('server grade denominator excludes teacher-excluded V5 questions like the browser does', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [{
      id: 'practice',
      role: 'practice',
      questions: [
        { prompt: 'A' },
        { prompt: 'B', teacherExcluded: true },
        { prompt: 'C' },
      ],
    }],
  };
  assert.deepEqual(runtimeIncludedQuestionIndices(assignment), [0, 2]);
  assert.equal(runtimeIncludedQuestionCount(assignment), 2);
});

test('Classroom sync no longer waits for total assignment completion', () => {
  const src = read('functions/index.js');
  const start = src.indexOf('exports.syncGradeToClassroom = onDocumentWritten');
  const end = src.indexOf('// Quiz/Test grade writes happen', start);
  assert.ok(start >= 0 && end > start);
  const sync = src.slice(start, end);

  assert.match(sync, /runtimeIncludedQuestionIndices\(assignment\)/);
  assert.match(sync, /runtimeQuestionsFromAssignment\(assignment\)/);
  assert.match(sync, /assignmentGradeProgress\(assignmentTracker, questionIndices, questions\)/);
  assert.match(src, /function assignmentGradeProgress\(assignmentTracker, questionIndices, questions = \[\]\)/);
  assert.match(src, /weightedQuestionTotals\(\{/);
  assert.match(sync, /resolveClassroomGradeStage/);
  assert.doesNotMatch(sync, /isAssignmentComplete/);
  assert.match(sync, /progress\.grade/);
});

test('progress passback uses quarter checkpoints, then due and final checkpoints', () => {
  const src = read('functions/index.js');
  assert.match(src, /Math\.ceil\(indices\.length \* 0\.25\)/);
  assert.match(src, /Math\.floor\(percentAttempted \/ 25\) \* 25/);
  assert.match(src, /"progress"/);
  assert.match(src, /"late-progress"/);
  assert.match(src, /"due-checkpoint"/);
  assert.match(src, /"final-deadline"/);
  assert.match(src, /"final-complete"/);
});

test('scheduled due/final checkpoints wake only published Classroom assignments and are idempotent', () => {
  const src = read('functions/index.js');
  const start = src.indexOf('exports.queueClassroomGradeCheckpoints = onSchedule');
  const end = src.indexOf('// ---------------------------------------------------------------------------\n// --- Live Challenge', start);
  assert.ok(start >= 0 && end > start);
  const scheduler = src.slice(start, end);

  assert.match(scheduler, /schedule: "every 5 minutes"/);
  assert.match(scheduler, /classroomLinks/);
  assert.match(scheduler, /gradePassbackEnabled !== false/);
  assert.match(scheduler, /reason: "due-checkpoint"/);
  assert.match(scheduler, /reason: "final-deadline"/);
  assert.match(scheduler, /reason: "initial-reconcile"/);
  assert.match(scheduler, /reconcileVersion/);
  assert.match(scheduler, /db\.getAll/);
  assert.doesNotMatch(scheduler, /collection\("assignments"\)\.limit\(500\)/);
  assert.match(scheduler, /CLASSROOM_GRADE_CHECKPOINT_LOOKBACK_MS/);
  assert.match(scheduler, /state\.dueAt !== dueAt\.toISOString\(\)/);
  assert.match(scheduler, /state\.finalDueAt !== lateDueAt\.toISOString\(\)/);
});

test('successful Google writes create a student-visible receipt and audit the stage', () => {
  const src = read('functions/index.js');
  const start = src.indexOf('exports.syncGradeToClassroom = onDocumentWritten');
  const end = src.indexOf('// Quiz/Test grade writes happen', start);
  const sync = src.slice(start, end);

  assert.match(sync, /classroomSyncStatusByAssignment/);
  assert.match(sync, /notificationId/);
  assert.match(sync, /attempted: progress\.attempted/);
  assert.match(sync, /creditOnAttempted: progress\.creditOnAttempted/);
  assert.match(sync, /isFinal/);
  assert.match(sync, /studentVisible/);
  assert.match(sync, /returnedToStudent/);
  assert.match(sync, /successfulCourses/);
});

test('Classroom point values are scaled from MathMaster percent when max points is not 100', () => {
  const src = read('functions/index.js');
  const start = src.indexOf('exports.syncGradeToClassroom = onDocumentWritten');
  const end = src.indexOf('// Quiz/Test grade writes happen', start);
  const sync = src.slice(start, end);
  assert.match(sync, /const maxPoints =/);
  assert.match(sync, /const classroomGrade = Math\.round\(\(grade \/ 100\) \* maxPoints \* 100\) \/ 100/);
  assert.match(sync, /grade: classroomGrade/);
  assert.match(sync, /classroomGrade/);
});

test('Google progress checkpoints stay draft-only until MathMaster intentionally releases the grade', () => {
  const src = read('functions/lib/classroom.js');
  const start = src.indexOf('async function patchGrade(');
  const end = src.indexOf('async function listTopics', start);
  const patch = src.slice(start, end);
  assert.match(patch, /assignToStudent = true/);
  assert.match(patch, /updateMask: assignToStudent \? "assignedGrade,draftGrade" : "draftGrade"/);
  assert.match(patch, /if \(assignToStudent\) requestBody\.assignedGrade = grade/);
  assert.match(patch, /draftGrade: grade/);
  assert.match(patch, /async function returnSubmission/);
  assert.match(patch, /studentSubmissions\.return/);
});

test('due, completed, final, assessment-release and late grades are returned to the student', () => {
  const src = read('functions/index.js');
  assert.match(src, /function classroomGradeReleasePolicy/);
  assert.match(src, /"due-checkpoint"/);
  assert.match(src, /"final-complete"/);
  assert.match(src, /"final-deadline"/);
  assert.match(src, /"assessment-release"/);
  assert.match(src, /startsWith\("late-progress"\)/);
  assert.match(src, /returnSubmission/);
  assert.match(src, /submissionState = "RETURNED"/);
});

test('student UI watches confirmed Classroom receipts and labels progress versus final', () => {
  const app = read('src/App.jsx');
  const dashboard = read('src/components/student/StudentDashboardView.jsx');

  assert.match(app, /classroomSyncStatusByAssignment/);
  assert.match(app, /Progress checkpoint saved to Google Classroom/);
  assert.match(app, /Updated grade released to Google Classroom/);
  assert.match(app, /Final grade sent to Google Classroom/);
  assert.match(app, /Due-date grade sent to Google Classroom/);
  assert.match(app, /Google Classroom shows/);
  assert.match(app, /Classroom teacher draft/);
  assert.match(dashboard, /Current grade · if stopped now/);
  assert.match(dashboard, /Classroom teacher draft/);
  assert.match(dashboard, /Google Classroom shows/);
  assert.match(dashboard, /next checkpoint/i);
});

test('teacher assessment release and manual retry carry explicit passback reasons', () => {
  const src = read('functions/index.js');
  assert.match(src, /reason: "assessment-release"/);
  assert.match(src, /reason: "manual-retry"/);
});
