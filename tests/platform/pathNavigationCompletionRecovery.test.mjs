import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MATH_PATH_ROUTE_STATE_KEY,
  mathPathRouteKey,
  readMathPathRouteState,
  writeMathPathRouteState,
} from '../../src/platform/student/browserHistory.js';

test('browser history gives an active Path session its own recoverable route', () => {
  const route = {
    tab: 'session',
    sessionConfig: {
      targetAlignmentKey: 'A2.6C',
      sessionKind: 'practice',
      assessmentFramework: null,
      weeklySlotKey: 'week-1-slot-2',
    },
  };
  assert.equal(
    mathPathRouteKey(route),
    'mathPath:session:A2.6C:practice:course:week-1-slot-2',
  );
  assert.deepEqual(readMathPathRouteState({ [MATH_PATH_ROUTE_STATE_KEY]: route }), route);
});

test('Path history writes preserve the outer student route and distinguish replace from push', () => {
  const originalWindow = global.window;
  const calls = [];
  global.window = {
    location: { href: 'https://mathmaster.local/student' },
    history: {
      state: { outerSurface: 'myMathPath' },
      replaceState(next) {
        calls.push(['replace', next]);
        this.state = next;
      },
      pushState(next) {
        calls.push(['push', next]);
        this.state = next;
      },
    },
  };

  try {
    writeMathPathRouteState({ tab: 'path' }, { replace: true });
    writeMathPathRouteState({
      tab: 'session',
      sessionConfig: { targetAlignmentKey: 'A2.6C', sessionKind: 'practice' },
    });

    assert.equal(calls[0][0], 'replace');
    assert.equal(calls[1][0], 'push');
    assert.equal(calls[1][1].outerSurface, 'myMathPath');
    assert.equal(readMathPathRouteState(calls[1][1]).tab, 'session');
  } finally {
    if (originalWindow === undefined) delete global.window;
    else global.window = originalWindow;
  }
});

test('live My Math Path restores internal Back navigation instead of abandoning the app', () => {
  const source = readFileSync('src/components/student/MyMathPathApp.jsx', 'utf8');
  assert.match(source, /window\.addEventListener\('popstate', restoreMathPathHistory\)/);
  assert.match(source, /if \(route\.tab === 'session' && route\.sessionConfig\)[\s\S]{0,260}setActiveTab\('session'\)/);
  assert.match(source, /setSessionConfig\(null\);[\s\S]{0,120}setActiveTab\(route\.tab \|\| 'path'\)/);
});

test('active work, completion, and unavailable-next-level states all expose a safe exit', () => {
  const player = readFileSync('src/components/student/PathSessionPlayer.jsx', 'utf8');
  const container = readFileSync('src/components/student/MyMathPathProductionContainer.jsx', 'utf8');

  assert.match(player, /onClick=\{onExit\}[\s\S]{0,320}Back to My Math Path/);
  assert.match(container, /const sessionOver = session\?\.status === 'completed'/);
  assert.match(container, /Level \$\{coursePassLevel\} complete/);
  assert.match(container, /Path Pass \{coursePassLevel\} complete/);
  assert.match(container, /Your completed pass is saved/);
  assert.match(container, /Your earlier Path pass is still complete/);
  assert.match(container, /Back to My Math Path/);
});

test('completed-session re-entry stops cleanly instead of fetching another question forever', () => {
  const container = readFileSync('src/components/student/MyMathPathProductionContainer.jsx', 'utf8');

  assert.match(
    container,
    /if \(result\.session\.status === 'active'\)[\s\S]{0,700}else \{[\s\S]{0,180}setSession\(result\.session\);[\s\S]{0,120}setCurrentQuestion\(null\)/,
  );
  assert.match(container, /completedSessionError = \/session is already complete\|session is already completed\/i/);
  assert.match(container, /This Path pass is already complete/);
});

test('Teacher Simulator uses the same student Path experience and completion/recovery UI', () => {
  const simulator = readFileSync('src/components/teacher/SimulatedStudentExperience.jsx', 'utf8');

  assert.match(simulator, /import \{ MyMathPathExperience \} from '\.\.\/student\/MyMathPathApp\.jsx'/);
  assert.match(simulator, /<MyMathPathExperience[\s\S]{0,1000}sessionProvider=\{runtime\}/);
  assert.match(simulator, /<MyMathPathExperience[\s\S]{0,1300}onExit=/);
});
