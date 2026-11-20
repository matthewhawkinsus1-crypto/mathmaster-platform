import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { appFactorySeam, appFactorySource, positionalHookSeam, positionalHookSource } from './helpers/appScreens.mjs';

/*
 * Live Teaching (Classroom Live, Phase 2) MUST be exactly as isolated as the
 * "View as Student" preview it reuses: no grades, no assignmentActivity, no
 * attempts consumed, no mastery evidence, no Classroom passback, no student
 * workspace drafts, no student presence. It gets that isolation for free by
 * routing through the exact same `activeView === 'teacherPreview'` state
 * that already gates every one of those writes — these tests prove that
 * routing holds and that each existing guard still covers it.
 */

const app = fs.readFileSync('src/App.jsx', 'utf8');

test('isTeacherPreview — the single flag that gates every write below — is keyed off activeView, not a separate Live Teaching flag', () => {
  assert.match(app, /const isTeacherPreview = user\?\.role === 'teacher' && activeView === 'teacherPreview';/);
});

test('teachAssignmentLive and resumeLiveTeaching both enter through activeView === teacherPreview, so they inherit isTeacherPreview automatically', () => {
  // teachAssignmentLive reuses startTeacherPreview rather than setting
  // activeView itself — that IS the "reuse the runtime" requirement, and
  // startTeacherPreview is what actually flips activeView to teacherPreview
  // (asserted by teacherPreviewFreshStart.test.mjs, and here directly).
  // Since the App split, createTeacherPreviewNavigation owns all three; App
  // builds them once (appFactorySource holds the seam, name for name).
  const navigation = appFactorySource('createTeacherPreviewNavigation');
  const teach = region(navigation, 'const teachAssignmentLive = ', 'const resumeLiveTeaching = ', 'teachAssignmentLive');
  assert.match(teach, /startTeacherPreview\(assignmentId, \{ lessonRuntime: true \}\);/);
  const startTeacherPreviewBody = region(navigation, 'const startTeacherPreview = ', 'const teachAssignmentLive = ', 'startTeacherPreview');
  assert.match(startTeacherPreviewBody, /setActiveView\('teacherPreview'\);/);

  const resume = region(navigation, 'const resumeLiveTeaching = ', '\n  return [startTeacherPreview, teachAssignmentLive, resumeLiveTeaching];', 'resumeLiveTeaching');
  assert.match(resume, /setActiveView\('teacherPreview'\)/);
});

test('a Live Teaching exemplar cannot write a grade — handleGradeSubmit short-circuits to the local preview tracker under isTeacherPreview', () => {
  // Since the App split handleGradeSubmit is createGradingControls', which App
  // calls once and hands its own isTeacherPreview and the preview tracker
  // (appFactorySource holds App's arguments to the factory's parameters, name
  // for name).
  const grading = appFactorySource('createGradingControls');
  const { parameters } = appFactorySeam('createGradingControls');
  for (const input of ['isTeacherPreview', 'previewTracker', 'setPreviewTracker']) {
    assert.ok(parameters.includes(input), `App hands createGradingControls ${input}`);
  }
  const start = grading.indexOf('const handleGradeSubmit = async');
  assert.ok(start >= 0, 'handleGradeSubmit is in createGradingControls');
  const guard = grading.indexOf('if (isTeacherPreview) {', start);
  assert.ok(guard > start, 'handleGradeSubmit must check isTeacherPreview before any student-role grade path');
  assert.ok(guard < grading.indexOf('const handleStepGrade = async'), 'the check is inside handleGradeSubmit');
  const guardBody = region(grading, 'if (isTeacherPreview) {\n      const outcome = applyAttempt(previewTracker[currentQuestionIndex]);', 'if (user?.role !== \'student\') return null;', 'handleGradeSubmit preview branch');
  assert.match(guardBody, /setPreviewTracker\(/);
  assert.doesNotMatch(guardBody, /setDoc|updateDoc|writeBatch|runTransaction/, 'the preview branch must never touch Firestore');
});

test('a Live Teaching exemplar cannot create mastery evidence or trigger a Classroom passback checkpoint', () => {
  const guard = region(app, 'const handleResponseCheckpoint = useCallback(async (answerState) => {', 'const assignment = assignments.find((item) => item.id === activeAssignmentId);', 'handleResponseCheckpoint guard');
  assert.match(guard, /isTeacherPreview/);
});

test('a Live Teaching exemplar cannot create a student workspace draft', () => {
  const start = app.indexOf('if (user?.role !== \'student\' || !user.id || !activeAssignmentId || isTeacherPreview) return undefined;');
  assert.ok(start >= 0, 'the workspace draft sync effect must bail out under isTeacherPreview');
});

test('a Live Teaching exemplar never appears in student live presence — presence publishing is a student-role-only effect', () => {
  const presenceEffect = region(app, "useEffect(() => {\n    if (\n      user?.role !== 'student'", 'livePresencePayloadRef.current = payload;', 'live presence payload effect');
  assert.match(presenceEffect, /user\?\.role !== 'student'/);

  const heartbeatEffect = region(app, "const presenceRef = doc(db, 'presence', user.id);", 'startPresence();', 'presence heartbeat effect');
  // The heartbeat only ever writes/deletes presence/{user.id}; a teacher's
  // own presence document is never touched because the effect above it
  // returns before this point for any non-student role.
  assert.match(heartbeatEffect, /setDoc\(presenceRef, \{[\s\S]*\.\.\.payload,[\s\S]*pageVisible:[\s\S]*updatedAt: Date\.now\(\)/);
});

test('the Live Teaching session record itself holds no student response data — only teacher position fields', () => {
  const liveTeachingSession = executableSource(fs.readFileSync('src/platform/teacher/liveTeachingSession.js', 'utf8'));
  assert.doesNotMatch(liveTeachingSession, /grade|assignmentActivity|evidence|studentId|response|attempt/i);
});

test('Teacher Preview suspends high-churn teacher reads while keeping cached dashboard state intact', () => {
  assert.match(app, /const teacherPreviewRuntimeActive = user\?\.role === 'teacher' && activeView === 'teacherPreview';/);

  // Since the App split, three hooks own these reads. App calls each once and
  // hands it the same flag (positionalHookSource holds App's arguments to the
  // hook's parameters, name for name): useTeacherRosterData the grade stream,
  // useTeacherPresence the presence listeners, useTeacherActionCenterData the
  // support, parent-contact and session-summary streams.
  const hookThatPausesInPreview = (hookName) => {
    const source = positionalHookSource(hookName);
    assert.ok(
      positionalHookSeam(hookName).parameters.includes('teacherPreviewRuntimeActive'),
      `App hands ${hookName} teacherPreviewRuntimeActive`,
    );
    return source;
  };

  // In App the region ran to the comment that followed the roster effects;
  // in the hook they run to the end of the module.
  const gradeStream = region(
    hookThatPausesInPreview('useTeacherRosterData'),
    "const needsFullStudentData = teacherWorkspaceMode === 'teacher'",
    null,
    'teacher live grade stream',
  );
  assert.match(gradeStream, /&& !teacherPreviewRuntimeActive/);
  assert.match(gradeStream, /onSnapshot\(/);

  // The presence effect is the last thing in its hook (in App it ended at
  // the useStudentGradeDocument call that still follows the hook's call).
  const livePresence = region(
    hookThatPausesInPreview('useTeacherPresence'),
    '// Teachers stream presence only while the live grid is on screen.',
    null,
    'teacher live presence subscriptions',
  );
  assert.match(livePresence, /if \(teacherPreviewRuntimeActive\) return undefined;/);
  // Cleanup releases every presence listener (and the batch buffer, so no
  // late flush lands after teardown) — nothing else.
  const cleanup = region(livePresence, 'return () => {', '};', 'presence cleanup');
  assert.match(cleanup, /unsubs\.forEach\(\(unsubscribe\) => unsubscribe\(\)\);/);
  assert.match(cleanup, /presenceBuffer\.cancel\(\);/);
  assert.doesNotMatch(
    livePresence,
    /return \(\) => \{[\s\S]*unsubs\.forEach[\s\S]*setPresenceById\(\{\}\)/,
    'entering Preview should unsubscribe without erasing the cached room snapshot',
  );

  for (const marker of [
    'subscribeStudentSupportEvents',
    'subscribeParentContacts',
    'subscribeStudentSessionSummaries',
  ]) {
    const actionCenterData = hookThatPausesInPreview('useTeacherActionCenterData');
    const at = actionCenterData.lastIndexOf(marker);
    assert.ok(at >= 0, marker + ' must remain wired');
    const before = actionCenterData.slice(Math.max(0, at - 450), at);
    assert.match(before, /teacherPreviewRuntimeActive/, marker + ' must pause during Teacher Preview');
  }
});
