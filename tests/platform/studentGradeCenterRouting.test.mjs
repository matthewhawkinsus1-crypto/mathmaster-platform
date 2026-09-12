import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  classroomLaunchTarget,
  parseClassroomLaunchSearch,
} from '../../src/platform/classroom/classroomLaunchRoute.js';
import {
  STUDENT_ROUTE_STATE_KEY,
  normalizeStudentRoute,
  readStudentRouteState,
  studentRouteKey,
} from '../../src/platform/student/browserHistory.js';
import { assertCapability, region } from './helpers/sourceContract.mjs';

const app = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const gradeCenter = fs.readFileSync(
  new URL('../../src/components/student/StudentGradeCenter.jsx', import.meta.url),
  'utf8',
);
const resultScreen = fs.readFileSync(
  new URL('../../src/components/student/StudentAssignmentResult.jsx', import.meta.url),
  'utf8',
);
const dashboard = fs.readFileSync(
  new URL('../../src/components/student/StudentDashboardView.jsx', import.meta.url),
  'utf8',
);

const assignment = {
  id: 'lesson-1',
  schemaVersion: 5,
  dueAt: '2026-09-01T12:00:00.000Z',
  lateDueAt: '2026-09-02T12:00:00.000Z',
  sections: [
    { id: 'warmup', role: 'warmup', questions: [{ id: 'w1' }] },
    { id: 'classwork', role: 'classwork', questions: [{ id: 'c1' }] },
    { id: 'dol', role: 'dol', questions: [{ id: 'd1' }] },
  ],
};

const OPEN = Date.parse('2026-09-01T09:00:00.000Z');
const CLOSED = Date.parse('2026-09-05T09:00:00.000Z');

/* 4. A CLOSED CLASSROOM LINK LANDS ON THE RESULT, NOT A DEAD WORK SCREEN. */

test('a closed whole-assignment Classroom link stops on the recorded result', () => {
  const target = classroomLaunchTarget({
    assignment,
    launch: parseClassroomLaunchSearch('?launch=lesson-1&classroomCourse=course-7&classroomPublication=pub-9'),
    nowValue: CLOSED,
  });

  assert.equal(target.showFrozenReportFirst, true, 'a closed link must not open the editable workspace');
  assert.equal(target.practiceAvailable, true);
  // A whole-assignment post has no section to confine practice to.
  assert.equal(target.sectionKey, 'whole');
  assert.equal(target.isSectionLaunch, false);
  // The Classroom launch target is preserved for the result screen.
  assert.equal(target.courseId, 'course-7');
  assert.equal(target.publicationId, 'pub-9');
  assert.equal(target.assignmentId, 'lesson-1');
});

test('a closed split-section Classroom link stops on the result and keeps section-only practice', () => {
  const target = classroomLaunchTarget({
    assignment,
    launch: parseClassroomLaunchSearch('?launch=lesson-1&classroomSection=dol'),
    nowValue: CLOSED,
  });

  assert.equal(target.showFrozenReportFirst, true);
  assert.equal(target.sectionKey, 'dol');
  assert.equal(target.isSectionLaunch, true);
  assert.deepEqual(target.questionIndices, [2]);
});

/* 5. AN OPEN LINK STILL GOES STRAIGHT TO WORK. */

test('an open Classroom link still routes into the work screen at the requested section', () => {
  const whole = classroomLaunchTarget({
    assignment,
    launch: parseClassroomLaunchSearch('?launch=lesson-1'),
    nowValue: OPEN,
  });
  assert.equal(whole.showFrozenReportFirst, false);
  assert.equal(whole.practiceAvailable, false);

  const section = classroomLaunchTarget({
    assignment,
    launch: parseClassroomLaunchSearch('?launch=lesson-1&classroomSection=dol'),
    nowValue: OPEN,
  });
  assert.equal(section.showFrozenReportFirst, false);
  assert.equal(section.questionIndex, 2, 'the link still opens at its own section');
  // An open section link is an entrance, not a cage: the workspace is not
  // hard-filtered while the assignment is still live.
  assert.equal(section.isSectionLaunch, false);
});

test('App routes by the launch decision rather than re-deciding it at the call site', () => {
  const launchEffect = region(
    app,
    'const target = classroomLaunchTarget({',
    'setPendingClassroomLaunch(null)',
    'Classroom launch effect',
  );
  assert.match(launchEffect, /if \(target\.showFrozenReportFirst\)/);
  assert.match(launchEffect, /setActiveView\('assignmentResult'\)/);
  assert.match(launchEffect, /startAssignment\(target\.assignmentId/);
});

/* 6. THE BACK STACK: HOME -> GRADES -> RESULT -> PRACTICE. */

test('every student grade surface is its own browser history entry', () => {
  const home = { surface: 'dashboard', dashboardMode: 'assignments' };
  const grades = { surface: 'dashboard', dashboardMode: 'grades' };
  const result = { surface: 'assignmentResult', assignmentId: 'lesson-1', sectionKey: 'dol' };
  const practice = { surface: 'assignment', assignmentId: 'lesson-1', questionIndex: 2 };

  const keys = [home, grades, result, practice].map(studentRouteKey);
  assert.equal(new Set(keys).size, 4, 'four screens must produce four distinct history entries');
  assert.deepEqual(keys, [
    'dashboard:assignments',
    'dashboard:grades',
    'assignmentResult:lesson-1:dol',
    'assignment:lesson-1:2',
  ]);
});

test('an assignment-result history entry round-trips its assignment and Classroom section', () => {
  assert.deepEqual(
    normalizeStudentRoute({ surface: 'assignmentResult', assignmentId: ' lesson-1 ', sectionKey: 'DOL' }),
    { surface: 'assignmentResult', assignmentId: 'lesson-1', sectionKey: 'DOL' },
  );
  assert.deepEqual(
    readStudentRouteState({
      [STUDENT_ROUTE_STATE_KEY]: { surface: 'assignmentResult', assignmentId: 'lesson-1', sectionKey: '' },
    }),
    { surface: 'assignmentResult', assignmentId: 'lesson-1', sectionKey: '' },
  );
  // An unknown surface must degrade to the dashboard rather than throwing a
  // student out of the app on a stale history entry.
  assert.equal(normalizeStudentRoute({ surface: 'nonsense' }).surface, 'dashboard');
});

test('App pushes and restores the assignment-result entry on Back and Forward', () => {
  const routeMemo = region(app, 'const studentBrowserRoute = useMemo(', 'useEffect(', 'student browser route');
  assert.match(routeMemo, /surface: 'assignmentResult'/);
  assert.match(routeMemo, /activeView === 'assignmentResult'/);

  const restore = region(app, 'const restoreFromBrowserHistory', "window.addEventListener('popstate'", 'popstate restore');
  assert.match(restore, /route\.surface === 'assignmentResult'/);
  assert.match(restore, /setActiveView\('assignmentResult'\)/);
  assert.match(restore, /setActiveClassroomSectionKey\(route\.sectionKey/);
});

test('Grades is reachable from Home, and Home is reachable from Grades', () => {
  assertCapability(
    dashboard,
    [/onOpenGrades\?\.\(\)/],
    'The student header must offer a route into the Grade Center.',
  );
  assert.match(app, /onOpenGrades=\{openStudentGradeCenter\}/);

  const openGradeCenter = region(app, 'const openStudentGradeCenter = ', 'const openStudentAssignmentResult', 'openStudentGradeCenter');
  assert.match(openGradeCenter, /setStudentDashboardMode\('grades'\)/);
  assert.match(openGradeCenter, /setActiveView\('dashboard'\)/);

  assertCapability(
    gradeCenter,
    [/onBackToHome\?\.\(\)/],
    'The Grade Center must offer a route back to Home.',
  );
});

test('the Assignment Result screen can always reach the full Grade Center', () => {
  assertCapability(
    resultScreen,
    [/View All Grades/],
    'A closed Classroom deep link must not strand a student on one assignment.',
  );
  assert.match(resultScreen, /onViewAllGrades\?\.\(\)/);
  const appResult = region(app, '<StudentAssignmentResult', '/>', 'Assignment Result render');
  assert.match(appResult, /onViewAllGrades=\{openStudentGradeCenter\}/);
});

test('the result screen reads the Grade Center entry rather than recomputing a grade', () => {
  const appResult = region(app, "activeView === 'assignmentResult'", '<StudentAssignmentResult', 'result branch');
  assert.match(appResult, /findGradeCenterEntry\(studentGradeCenter, assignmentResultRoute\.assignmentId\)/);
  // The screen renders what it was handed; it imports no grade math.
  assert.doesNotMatch(resultScreen, /splitGrade|calculateGrade|weightedQuestionTotals/);
});

test('App imports every student grade module it calls', () => {
  // A free identifier in App.jsx is a runtime ReferenceError that lint, the
  // build and every other test in this suite would miss.
  for (const [identifier, from] of [
    ['buildStudentGradeCenter', 'platform/student/studentGradeCenterModel.js'],
    ['findGradeCenterEntry', 'platform/student/studentGradeCenterModel.js'],
    ['normalizeGradingPeriodSettings', 'platform/student/gradingPeriods.js'],
    ['gradingPeriodAssignmentPatch', 'platform/student/gradingPeriods.js'],
    ['GRADING_PERIOD_SETTINGS_DOC', 'platform/student/gradingPeriods.js'],
    ['StudentGradeCenter', 'components/student/StudentGradeCenter.jsx'],
    ['StudentAssignmentResult', 'components/student/StudentAssignmentResult.jsx'],
    ['MarkingPeriodSettings', 'components/teacher/MarkingPeriodSettings.jsx'],
  ]) {
    assert.match(app, new RegExp(`${identifier}[\\s\\S]{0,400}?from '\\./${from.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'`), `${identifier} must be imported from ${from}`);
    assert.match(app, new RegExp(`<${identifier}[\\s>]|${identifier}\\(|${identifier}\\)`), `${identifier} must actually be used`);
  }
});
