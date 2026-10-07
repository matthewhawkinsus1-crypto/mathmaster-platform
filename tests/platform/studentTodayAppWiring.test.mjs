import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * App.jsx WIRING FOR THE ONE "TODAY" RULE.
 *
 * Nothing imports App.jsx, so a call with no import passes every gate and
 * throws for every student at runtime. Each call below is asserted beside its
 * import (AGENTS.md, "Two things the whole gate misses").
 */
const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));

test('Recovery for every assignment is built and fed to the dashboard, with its import', () => {
  assert.match(app, /import\s*\{[^}]*\bbuildRecoverySummariesByAssignment\b[^}]*\}\s*from\s*'\.\/platform\/student\/recoveryStates\.js'/);
  assert.match(app, /import\s*\{[^}]*\brecoveryStatesFromSummaries\b[^}]*\}\s*from\s*'\.\/platform\/student\/recoveryStates\.js'/);
  assert.match(app, /useMemo\(\(\)\s*=>\s*\(user\?\.role === 'student'[\s\S]{0,40}buildRecoverySummariesByAssignment\(/);
});

test('the dashboard model receives the student, their Recovery states and the teacher section lock', () => {
  const call = region(app, 'buildStudentDashboardModel({', 'matchesSmartView: (assignment', 'the dashboard model call');
  assert.match(call, /studentId:\s*user\.id/);
  assert.match(call, /recoveryStateByAssignment:\s*recoveryStatesFromSummaries\(studentRecoverySummariesByAssignment\)/);
  assert.match(call, /\bgetSectionAccessState,/);
  assert.match(app, /import\s*\{[^}]*\bgetSectionAccessState\b/);
});

test('Start/Continue lands on the first unfinished open question, and never on a dead end', () => {
  const start = region(app, 'const startAssignment = (', 'const openStudentDashboardMode', 'startAssignment');
  const entry = region(start, 'resolveStudentAssignmentEntry({', 'safeQuestionIndex = actionableIndex', 'entry resolution');
  assert.match(entry, /isFinished:\s*options\?\.returnToResult\s*\?\s*null/);
  assert.match(entry, /\['correct', 'expired'\]\.includes\(normalizeQuestionRecord\(tracker\?\.\[assignmentId\]\?\.\[index\]\)\.status\)/);
  // With nothing open for a whole-assignment start, the student is taken to
  // the result page (what opens when), not left on a toast.
  assert.match(entry, /if \(actionableIndex === null && user\?\.role === 'student' && !scopedSectionKey\) \{\s*openStudentAssignmentResult\(assignmentId/);
});

test('Tests & Exams carries the shared student navigation, and Back names Home', () => {
  const exams = region(app, "studentDashboardMode === 'secureExams'", '<StudentSecureExamDashboard', 'Tests & Exams branch');
  assert.match(exams, /<StudentGlobalNav current=\{STUDENT_DESTINATION\.SECURE_EXAMS\} onNavigate=\{navigateStudent\}/);
  assert.match(app, /import StudentGlobalNav, \{ STUDENT_DESTINATION \} from '\.\/components\/student\/StudentGlobalNav\.jsx'/);
  const backLabel = region(app, 'const studentAssignmentBackLabel =', 'const isLiveTeachingThisAssignment', 'assignment Back label');
  assert.match(backLabel, /'Back to Home'/);
  assert.doesNotMatch(backLabel, /'Back to Dashboard'/);
});

test('What changed items are built once in App from records the student reads, with their imports', () => {
  assert.match(app, /import \{[^}]*\bbuildWhatChanged\b[^}]*\} from '\.\/platform\/student\/whatChangedModel\.js'/);
  assert.match(app, /import WhatChangedList from '\.\/components\/student\/WhatChangedList\.jsx'/);
  const memo = region(app, 'const whatChangedItems = useMemo(', '}, [user?.role, user?.id, user?.classId', 'What changed memo');
  assert.match(memo, /controlsByAssignmentId: studentAssignmentControls\?\.byAssignmentId/);
  assert.match(memo, /teacherGradeOverridesByAssignment,/);
  assert.match(memo, /return buildWhatChanged\(\{ \.\.\.input, firstSeenByKey \}\)/);
});

test('Log Out warns about unsent work on the one identity bar', () => {
  assert.match(app, /import \{ describeLogoutRisk \} from '\.\/platform\/student\/logoutGuard\.js'/);
  const bar = region(app, '<StudentIdentityBar', '/>', 'identity bar');
  assert.match(bar, /logoutRisk=\{preview \? null : describeLogoutRisk\(\{\s*outboxDepth: studentOutboxDepth,\s*pendingGradeCount: studentPendingGradeCount/);
});
