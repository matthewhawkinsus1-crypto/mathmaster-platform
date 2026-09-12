import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  LEVEL,
  STUDENT_DESTINATION,
  STUDENT_DESTINATION_LABEL,
  STUDENT_DESTINATION_ORDER,
  resolveBack,
} from '../../src/platform/student/navigationModel.js';
import { normalizeStudentRoute, studentRouteKey } from '../../src/platform/student/browserHistory.js';
import { assertCapability, region } from './helpers/sourceContract.mjs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');

const app = read('../../src/App.jsx');
const nav = read('../../src/components/student/StudentGlobalNav.jsx');
const home = read('../../src/components/student/StudentDashboardView.jsx');
const mathPath = read('../../src/components/student/MyMathPathApp.jsx');
const gradeCenter = read('../../src/components/student/StudentGradeCenter.jsx');
const assignmentsCenter = read('../../src/components/student/StudentAssignmentsCenter.jsx');
const resultScreen = read('../../src/components/student/StudentAssignmentResult.jsx');

/* 1. ONE NAVIGATION, FIVE DESTINATIONS, REACHABLE FROM HOME. */

test('the shared student navigation offers Home, Assignments, Grades, My Math Path and Secure Exams', () => {
  assert.deepEqual(STUDENT_DESTINATION_ORDER, [
    STUDENT_DESTINATION.HOME,
    STUDENT_DESTINATION.ASSIGNMENTS,
    STUDENT_DESTINATION.GRADES,
    STUDENT_DESTINATION.MATH_PATH,
    STUDENT_DESTINATION.SECURE_EXAMS,
  ]);
  assert.deepEqual(
    STUDENT_DESTINATION_ORDER.map((destination) => STUDENT_DESTINATION_LABEL[destination]),
    ['Home', 'Assignments', 'Grades', 'My Math Path', 'Secure Exams'],
  );
  // Where am I? has to be answerable without pressing anything.
  assert.match(nav, /aria-current=\{active \? 'page' : undefined\}/);
  // Log Out is offered where it belongs and suppressed where the screen is
  // embedded in someone else's shell.
  assert.match(nav, /showLogout/);
});

test('Home renders the shared navigation instead of its own four buttons', () => {
  assertCapability(home, [/<StudentGlobalNav/], 'Home must render the shared student navigation.');
  assert.match(home, /current=\{STUDENT_DESTINATION\.HOME\}/);
  // The per-destination props Home used to own are gone: a second set of
  // buttons is how the navigation drifted apart in the first place.
  assert.doesNotMatch(home, /onOpenGrades|onOpenSecureExams/);

  const dashboardRender = region(app, '<StudentDashboardView', '/>', 'Home render');
  assert.match(dashboardRender, /onNavigate=\{navigateStudent\}/);
});

test('every student surface routes through one navigate handler', () => {
  const navigate = region(app, 'const navigateStudent = ', 'const openStudentAssignmentResult', 'navigateStudent');
  for (const [destination, opener] of [
    ['ASSIGNMENTS', 'openStudentAssignmentsCenter'],
    ['GRADES', 'openStudentGradeCenter'],
    ['MATH_PATH', "openStudentDashboardMode\\('mathPath'\\)"],
    ['SECURE_EXAMS', "openStudentDashboardMode\\('secureExams'\\)"],
  ]) {
    assert.match(
      navigate,
      new RegExp(`STUDENT_DESTINATION\\.${destination}[^\\n]*${opener}`),
      `${destination} must have a destination in navigateStudent`,
    );
  }
  // A free identifier in App.jsx is a runtime ReferenceError that lint, the
  // build and the rest of this suite all miss.
  assert.match(app, /STUDENT_DESTINATION[\s\S]{0,200}?from '\.\/components\/student\/StudentGlobalNav\.jsx'/);
});

/* 2. MY MATH PATH'S "ASSIGNMENTS" MUST BE ASSIGNMENTS. */

test('My Math Path routes to the Assignments Center rather than exiting to Home', () => {
  assertCapability(mathPath, [/<StudentGlobalNav/], 'My Math Path must offer the shared destinations.');
  assert.match(mathPath, /current=\{STUDENT_DESTINATION\.MATH_PATH\}/);

  // The defect being fixed: a control labelled "Assignments" that called
  // onExit, which returns the student to HOME. The exit control remains, and
  // now says where it actually goes.
  const header = region(mathPath, 'aria-label="My Math Path navigation"', '</div>', 'My Math Path header');
  assert.doesNotMatch(header, /'Assignments'/, 'the exit button must not claim to be Assignments');
  assert.match(header, /readOnly \? 'Back to student' : 'Home'/);

  const pathRender = region(app, '<MyMathPathApp', '/>', 'My Math Path render');
  assert.match(pathRender, /onNavigate=\{navigateStudent\}/);

  // A teacher inspecting a student read-only is inside the teacher shell and
  // must not be handed a student's global navigation.
  assert.match(mathPath, /!readOnly && onNavigate &&/);
});

/* 3. THE ASSIGNMENTS CENTER IS ITS OWN SURFACE. */

test('the Assignments Center is a distinct dashboard mode, not an overload of Home', () => {
  assert.match(app, /studentDashboardMode === 'assignmentsCenter'/);
  assert.notEqual(
    studentRouteKey({ surface: 'dashboard', dashboardMode: 'assignmentsCenter' }),
    studentRouteKey({ surface: 'dashboard', dashboardMode: 'assignments' }),
    'Home and the Assignments Center must be different browser entries',
  );

  const centerRender = region(app, '<StudentAssignmentsCenter', '/>', 'Assignments Center render');
  // Both models are handed in; the screen builds neither.
  assert.match(centerRender, /dashboard=\{studentDashboard\}/);
  assert.match(centerRender, /gradeCenter=\{studentGradeCenter\}/);
  assert.match(centerRender, /origin: 'assignments'/);
});

test('Home keeps its action-oriented job and does not become the archive', () => {
  // Home still answers "what should I do now?" — the resume card, the live
  // banners, and grouped lists — and still reads the model's filtered view.
  assert.match(home, /<WhatShouldIDoNow/);
  assert.match(home, /aria-label="Resume assignment"/);
  assert.match(home, /BUCKET_ORDER\.map/);
  const dashboardRender = region(app, '<StudentDashboardView', '/>', 'Home render');
  assert.doesNotMatch(dashboardRender, /allEntries/, 'Home renders entries, not the full archive');
});

/* 8-9. BACK PRESERVES ORIGIN, AND THE TWO LISTS LINK TO EACH OTHER. */

test('a result remembers which list opened it, in state and in browser history', () => {
  assert.equal(normalizeStudentRoute({ surface: 'assignmentResult', assignmentId: 'a1' }).origin, 'assignments');
  assert.equal(
    normalizeStudentRoute({ surface: 'assignmentResult', assignmentId: 'a1', origin: 'grades' }).origin,
    'grades',
  );
  assert.notEqual(
    studentRouteKey({ surface: 'assignmentResult', assignmentId: 'a1', origin: 'grades' }),
    studentRouteKey({ surface: 'assignmentResult', assignmentId: 'a1', origin: 'assignments' }),
    'the same assignment reached from two lists is two places to press Back from',
  );

  // The route memo and the popstate restore both carry it, so a Back out of
  // practice lands on a result that still knows where it came from.
  const routeMemo = region(app, 'const studentBrowserRoute = useMemo(', 'useEffect(', 'student browser route');
  assert.match(routeMemo, /origin: assignmentResultRoute\?\.origin \|\| 'assignments'/);
  const restore = region(app, 'const restoreFromBrowserHistory', "window.addEventListener('popstate'", 'popstate restore');
  assert.match(restore, /origin: route\.origin \|\| 'assignments'/);
});

test('the visible Back control follows the same destination as browser Back', () => {
  // Named by the navigation model, which owns the rule that a Back button
  // names its destination rather than its direction.
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_RESULT).level, LEVEL.ASSIGNMENTS);
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_RESULT, { origin: LEVEL.GRADES }).level, LEVEL.GRADES);
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_RESULT, { origin: LEVEL.GRADES }).label, 'Back to My grades');
  // A stale or hostile origin cannot invent a level to jump to.
  assert.equal(resolveBack(LEVEL.ASSIGNMENT_RESULT, { origin: LEVEL.PATH_SESSION }).level, LEVEL.ASSIGNMENTS);

  assert.match(resultScreen, /resolveBack\(LEVEL\.ASSIGNMENT_RESULT, \{ origin \}\)/);
  assert.match(resultScreen, /onBackToOrigin = cameFromGrades \? onViewAllGrades : onViewAllAssignments/);

  const resultRender = region(app, '<StudentAssignmentResult', '/>', 'Assignment Result render');
  assert.match(resultRender, /origin=\{assignmentResultRoute\.origin/);
});

test('Assignments and Grades each offer a route to the other', () => {
  // A student who checks a grade and then wants the assignment behind it must
  // not have to go up to Home and back down.
  assertCapability(gradeCenter, [/<StudentGlobalNav/], 'The Grade Center must offer the shared destinations.');
  assert.match(gradeCenter, /current=\{STUDENT_DESTINATION\.GRADES\}/);
  assertCapability(assignmentsCenter, [/<StudentGlobalNav/], 'The Assignments Center must offer the shared destinations.');
  assert.match(assignmentsCenter, /current=\{STUDENT_DESTINATION\.ASSIGNMENTS\}/);

  // And the result screen reaches both lists whichever way it was opened —
  // a Google Classroom deep link arrives with no origin the student chose.
  assertCapability(resultScreen, [/All Assignments/], 'A result must reach the Assignments Center.');
  assertCapability(resultScreen, [/View All Grades/], 'A result must reach the Grade Center.');
  const resultRender = region(app, '<StudentAssignmentResult', '/>', 'Assignment Result render');
  assert.match(resultRender, /onViewAllAssignments=\{openStudentAssignmentsCenter\}/);
  assert.match(resultRender, /onViewAllGrades=\{openStudentGradeCenter\}/);
});

test('leaving an assignment names the list it returns to', () => {
  const leave = region(app, 'const studentAssignmentBackLabel = ', 'const leaveAssignment', 'assignment back label');
  assert.match(leave, /'Back to Results'/);
  assert.match(leave, /'Back to Assignments'/);
  assert.match(leave, /'Back to Grades'/);
});

/* 11. WHICH BUILD IS THIS DEVICE RUNNING? */

test('a build identifier is visible to a teacher and in the student footer', () => {
  const buildStamp = read('../../src/components/student/BuildStamp.jsx');
  const sidebar = read('../../src/TeacherSidebar.jsx');

  assert.match(buildStamp, /formatBuildStamp/);
  assert.match(buildStamp, /data-mathmaster-build/);
  // Teacher diagnostic surface: present on every teacher screen.
  assert.match(sidebar, /formatBuildStamp/);
  assert.match(sidebar, /data-mathmaster-build/);
  // Student footer, on each of the three student list surfaces.
  for (const [name, source] of [['Home', home], ['Assignments Center', assignmentsCenter], ['Grade Center', gradeCenter]]) {
    assert.match(source, /<BuildStamp/, `${name} must carry the build stamp`);
  }
  // Nothing about the environment beyond a commit id and a timestamp.
  assert.doesNotMatch(buildStamp, /apiKey|token|secret|projectId/i);
});
