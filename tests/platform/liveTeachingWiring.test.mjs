import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { region } from './helpers/sourceContract.mjs';

/*
 * Classroom Live, Phase 2 (Live Teaching / Teacher Exemplar) is wired across
 * App.jsx (the actual preview runtime + Live Teaching session state) and
 * LiveClassMonitor.jsx (the Live Classroom screen). Nothing here renders
 * React, so these assert the wiring as source text — see
 * docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md for the read-as-text rationale.
 */

const app = fs.readFileSync('src/App.jsx', 'utf8');
const monitor = fs.readFileSync('src/components/teacher/LiveClassMonitor.jsx', 'utf8');
const teacherHome = fs.readFileSync('src/TeacherHome.jsx', 'utf8');

test('teaching a lesson reuses the existing student-preview runtime, not a second renderer', () => {
  const start = app.indexOf('const teachAssignmentLive = ');
  const end = app.indexOf('const resumeLiveTeaching = ', start);
  assert.ok(start >= 0 && end > start, 'teachAssignmentLive must exist above resumeLiveTeaching');
  const body = app.slice(start, end);

  // Reuses the exact preview entry point instead of building a parallel one.
  assert.match(body, /startTeacherPreview\(assignmentId\)/);
  // Creates the Live Teaching session record, separate from the runtime.
  assert.match(body, /setLiveTeachingSession\(startLiveTeachingSession\(/);
});

test('Walkthrough launch gives resume lookup only a tiny budget and falls back to a fresh local preview', () => {
  const teach = region(app, 'const teachAssignmentLive = ', 'const resumeLiveTeaching = ', 'teachAssignmentLive');
  assert.match(teach, /Promise\.race\(\[/);
  assert.match(teach, /window\.setTimeout\(\(\) => resolve\(null\), 180\)/);
  assert.match(teach, /catch \(error\) \{[\s\S]*starting fresh/);
  assert.match(teach, /startFresh\(\);/);
});

test('Restart Fresh bypasses resume lookup and explicitly requests a clean session', () => {
  const teach = region(app, 'const teachAssignmentLive = ', 'const resumeLiveTeaching = ', 'teachAssignmentLive');
  assert.match(teach, /if \(forceRestart\) \{\s*startFresh\(\);\s*return;/);
  assert.match(monitor, /onTeach\(liveTeachingAssignmentId, \{ forceRestart: true, classId: activeClassId \}\)/);
});

test('Live Classroom launches with the class that is actually in session even when the global class bar is unset', () => {
  const teach = region(app, 'const teachAssignmentLive = ', 'const resumeLiveTeaching = ', 'teachAssignmentLive');
  assert.match(teach, /classId: requestedClassId = null/);
  assert.match(teach, /const classId = requestedClassId \|\| activeClass\?\.classId \|\| null/);
  assert.match(monitor, /onTeach\(choiceId, \{ classId: activeClassId \}\)/);
  assert.match(monitor, /onTeach\(liveTeachingAssignmentId, \{ forceRestart: true, classId: activeClassId \}\)/);
});

test('resuming teaching re-enters the runtime WITHOUT resetting the tracker, scratchpads, or preview session', () => {
  const region_ = region(app, 'const resumeLiveTeaching = ', 'const endLiveTeaching = ', 'resumeLiveTeaching');
  assert.doesNotMatch(region_, /setPreviewTracker/, 'Resume must not reset the exemplar tracker — that would look like a fresh start');
  assert.doesNotMatch(region_, /setPreviewScratchpads/);
  assert.doesNotMatch(region_, /setPreviewSessionId/);
  assert.match(region_, /setCurrentQuestionIndex\(liveTeachingSession\.storageQuestionIndex\)/);
  assert.match(region_, /setActiveView\('teacherPreview'\)/);
});

test('ending Live Teaching clears the session', () => {
  const region_ = region(app, 'const endLiveTeaching = ', 'const getScratchpadDocumentId', 'endLiveTeaching');
  assert.match(region_, /setLiveTeachingSession\(endLiveTeachingSession\(\)\)/);
});

test('navigating the exemplar keeps the Live Teaching session synced to the REAL current question, not a manual counter', () => {
  const start = app.indexOf("// As the teacher moves through the exemplar with real student navigation");
  const end = app.indexOf('useEffect(', app.indexOf('useEffect(', start) + 1);
  assert.ok(start >= 0);
  const body = app.slice(start, end);
  assert.match(body, /if \(!isTeacherPreview \|\| !liveTeachingSession\?\.active\) return;/);
  assert.match(body, /advanceLiveTeachingSession\(session, \{/);
  assert.match(body, /storageQuestionIndex: currentQuestionIndex,/);
  assert.match(body, /activityRole: activeQuestionRole,/);
});

test('Restart Fresh inside the exemplar preserves the live session class context', () => {
  assert.match(app, /teachAssignmentLive\(assignment\.id, \{ forceRestart: true, classId: liveTeachingSession\?\.classId \|\| activeClass\?\.classId \|\| null \}\)/);
});

test('returning to Live Classroom from a live-taught exemplar preserves the exemplar position (routes home, not to Assignments)', () => {
  const region_ = region(app, 'const isLiveTeachingThisAssignment = ', 'const leaveAssignment = ', 'isLiveTeachingThisAssignment');
  assert.match(region_, /liveTeachingSession\?\.active/);
  assert.match(region_, /String\(liveTeachingSession\.assignmentId\) === String\(assignment\.id\)/);

  const leave = region(app, 'const leaveAssignment = () => {', 'setActiveView(\'dashboard\');\n      setActiveAssignmentId(null);', 'leaveAssignment');
  assert.match(leave, /setTeacherTab\(isLiveTeachingThisAssignment \? 'home' : 'assignments'\)/);
});

test('a thin Live Teaching control bar is shown inside the exemplar itself, identifying it as the teacher exemplar', () => {
  assert.match(app, /LIVE TEACHING/);
  assert.match(app, /isLiveTeachingThisAssignment && \(/);
  assert.match(app, /describeClassworkPace\(\{ assignment, classworkQuestionPosition: liveTeachingSession\?\.classworkQuestionPosition/);
});

test('the "Restart Preview Fresh" header control defers to the Live Teaching bar\'s own restart while a live session owns this assignment', () => {
  assert.match(app, /preview && !isLiveTeachingThisAssignment && \(/);
});

test('App.jsx wires the Live Teaching session, actions, and pace helper through imports', () => {
  const sessionImport = region(app, "import {\n  advanceLiveTeachingSession,", "} from './platform/teacher/liveTeachingSession.js';", 'Live Teaching imports');
  for (const capability of ['advanceLiveTeachingSession', 'endLiveTeachingSession', 'startLiveTeachingSession']) {
    assert.match(sessionImport, new RegExp(`\\b${capability}\\b`));
  }
  assert.match(app, /import \{ describeClassworkPace \} from '\.\/platform\/teacher\/classworkModel\.js';/);
});

test('TeacherHome forwards the Live Teaching session and actions down to Live Classroom, without owning any of the logic itself', () => {
  assert.match(teacherHome, /liveTeachingSession = null, onTeachAssignment = null, onResumeTeaching = null, onEndLiveTeaching = null/);
  const liveClassMonitorCall = region(teacherHome, '<LiveClassMonitor', '/>', 'LiveClassMonitor render');
  assert.match(liveClassMonitorCall, /liveTeachingSession=\{liveTeachingSession\}/);
  assert.match(liveClassMonitorCall, /onTeachAssignment=\{onTeachAssignment\}/);
  assert.match(liveClassMonitorCall, /onResumeTeaching=\{onResumeTeaching\}/);
  assert.match(liveClassMonitorCall, /onEndLiveTeaching=\{onEndLiveTeaching\}/);
});

test('Live Classroom only offers lessons actually assigned to the active class', () => {
  const region_ = region(monitor, 'const teachableAssignments = useMemo(', '}, [assignments, activeClassId]);', 'teachableAssignments');
  assert.match(region_, /if \(!activeClassId\) return \[\];/);
  assert.match(region_, /assignmentIsForStudent\(assignment, \{ classId: activeClassId \}\)/);
});

test('Live Classroom UI names the exemplar assignment and its Classwork pace, and offers Resume/Restart/End', () => {
  assert.match(monitor, /Teach This Lesson/);
  assert.match(monitor, /Teaching: \{teachingAssignmentTitle/);
  assert.match(monitor, /Teacher exemplar: \{classworkPositionLabel\}/);
  assert.match(monitor, /Resume Teaching/);
  assert.match(monitor, /Restart Fresh/);
  assert.match(monitor, /End Teaching/);
});

test('Walkthrough pace follows the Live Teaching session only after the teacher actually reaches Classwork', () => {
  const region_ = region(monitor, 'const liveTeachingPaceReady = ', 'const liveTeachingSessionKey', 'live teaching pace selection');
  assert.match(region_, /Number\.isInteger\(liveTeachingSession\?\.classworkQuestionPosition\)/);
  assert.match(region_, /const effectiveTeacherQuestionIndex = liveTeachingActiveForClass/);
  assert.match(region_, /: teacherQuestionIndex;/);
  assert.doesNotMatch(
    region_,
    /liveTeachingActiveForClass && liveTeachingSession\.classworkQuestionPosition !== null[\s\S]*: teacherQuestionIndex/,
    'the manual counter must never become the fallback pace for an active exemplar that has not reached Classwork',
  );

  const walkthroughCall = region(monitor, 'const walkthrough = useMemo(() => {', 'const { rows, classStats, counts }', 'buildWalkthroughMonitor call');
  assert.match(walkthroughCall, /if \(!liveTeachingPaceReady\)/);
  assert.match(walkthroughCall, /teacherQuestionIndex: effectiveTeacherQuestionIndex,/);
  assert.match(monitor, /Classwork pace has not started yet\./);
});

test('the assignment being walked through follows the Live Teaching session while active, and the manual dropdown is locked', () => {
  const region_ = region(monitor, 'const displayAssignmentId = ', 'const selectedClasswork', 'displayAssignmentId');
  assert.match(region_, /liveTeachingActiveForClass \? liveTeachingSession\.assignmentId : assignmentId/);
  assert.match(monitor, /disabled=\{liveTeachingActiveForClass\}/);
});
