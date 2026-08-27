import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MATH_PATH_ROUTE_STATE_KEY,
  STUDENT_ROUTE_STATE_KEY,
  mathPathRouteKey,
  normalizeMathPathRoute,
  normalizeStudentRoute,
  readMathPathRouteState,
  readStudentRouteState,
  studentRouteKey,
} from '../../src/platform/student/browserHistory.js';

test('student route keys distinguish dashboard modes and assignment questions', () => {
  assert.equal(studentRouteKey({ surface: 'dashboard', dashboardMode: 'assignments' }), 'dashboard:assignments');
  assert.equal(studentRouteKey({ surface: 'dashboard', dashboardMode: 'mathPath' }), 'dashboard:mathPath');
  assert.equal(studentRouteKey({ surface: 'assignment', assignmentId: 'a1', questionIndex: 4 }), 'assignment:a1:4');
});

test('student history state round-trips normalized routes', () => {
  const state = {
    [STUDENT_ROUTE_STATE_KEY]: {
      surface: 'assignment',
      assignmentId: ' unit-1 ',
      questionIndex: '3',
    },
  };
  assert.deepEqual(readStudentRouteState(state), {
    surface: 'assignment',
    assignmentId: 'unit-1',
    questionIndex: 3,
  });
  assert.deepEqual(normalizeStudentRoute({ surface: 'dashboard' }), {
    surface: 'dashboard',
    dashboardMode: 'assignments',
  });
});

test('My Math Path route keys distinguish tabs and secure session context', () => {
  assert.equal(mathPathRouteKey({ tab: 'path' }), 'mathPath:path');
  assert.equal(mathPathRouteKey({ tab: 'history' }), 'mathPath:history');
  assert.equal(
    mathPathRouteKey({
      tab: 'session',
      sessionConfig: {
        targetAlignmentKey: 'A2.2B',
        sessionKind: 'practice',
        assessmentFramework: null,
        weeklySlotKey: 'slot-2',
      },
    }),
    'mathPath:session:A2.2B:practice:course:slot-2',
  );
});

test('My Math Path history state preserves enough session config for browser Forward', () => {
  const sessionConfig = {
    targetAlignmentKey: 'A2.2B',
    sessionKind: 'practice',
    requiredQuestions: 5,
    weeklySlotKey: null,
  };
  const state = {
    [MATH_PATH_ROUTE_STATE_KEY]: {
      tab: 'session',
      sessionConfig,
    },
  };
  assert.deepEqual(readMathPathRouteState(state), normalizeMathPathRoute({ tab: 'session', sessionConfig }));
});

test('App wires browser popstate to the student surface instead of leaving the SPA', () => {
  const source = readFileSync('src/App.jsx', 'utf8');
  assert.match(source, /readStudentRouteState\(event\.state\)/);
  assert.match(source, /window\.addEventListener\('popstate', restoreFromBrowserHistory\)/);
  assert.match(source, /writeStudentRouteState\(studentBrowserRoute/);
  assert.match(source, /setCurrentQuestionIndex\(route\.questionIndex \|\| 0\)/);
});

test('My Math Path wires Back and Forward to tabs and sessions', () => {
  const source = readFileSync('src/components/student/MyMathPathApp.jsx', 'utf8');
  assert.match(source, /readMathPathRouteState\(event\.state\)/);
  assert.match(source, /window\.addEventListener\('popstate', restoreMathPathHistory\)/);
  assert.match(source, /writeMathPathRouteState\(mathPathBrowserRoute/);
  assert.match(source, /setSessionConfig\(route\.sessionConfig\)/);
  assert.match(source, /setActiveTab\('session'\)/);
});
