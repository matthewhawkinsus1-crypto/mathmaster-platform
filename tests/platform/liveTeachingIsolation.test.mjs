import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

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
  const teach = region(app, 'const teachAssignmentLive = ', 'const resumeLiveTeaching = ', 'teachAssignmentLive');
  assert.match(teach, /startTeacherPreview\(assignmentId\);/);
  const startTeacherPreviewBody = region(app, 'const startTeacherPreview = ', 'const teachAssignmentLive = ', 'startTeacherPreview');
  assert.match(startTeacherPreviewBody, /setActiveView\('teacherPreview'\);/);

  const resume = region(app, 'const resumeLiveTeaching = ', 'const endLiveTeaching = ', 'resumeLiveTeaching');
  assert.match(resume, /setActiveView\('teacherPreview'\)/);
});

test('a Live Teaching exemplar cannot write a grade — handleGradeSubmit short-circuits to the local preview tracker under isTeacherPreview', () => {
  const start = app.indexOf('const handleGradeSubmit = async');
  const guard = app.indexOf('if (isTeacherPreview) {', start);
  assert.ok(guard > start, 'handleGradeSubmit must check isTeacherPreview before any student-role grade path');
  const guardBody = region(app, 'if (isTeacherPreview) {\n      const outcome = applyAttempt(previewTracker[currentQuestionIndex]);', 'if (user?.role !== \'student\') return null;', 'handleGradeSubmit preview branch');
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
