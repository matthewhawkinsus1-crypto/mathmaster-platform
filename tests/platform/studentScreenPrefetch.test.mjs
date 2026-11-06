// PF01: THE STUDENT'S OTHER SCREENS, FETCHED WHILE HOME IS IDLE.
//
// Grades, Assignments, Rewards and an assignment's result left the student's
// first load (src/app/lazyScreens.js). So that opening one is still instant,
// App asks src/app/student/studentScreenPrefetch.js for their code once Home
// has rendered: fetched when the browser is next idle, once per page, never
// when the device asks to save data, and not while it is offline (a failed
// request would be remembered for the page: retryableChunk.test.mjs). Here
// against a fake window whose idle time, timers and network the test drives.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  IDLE_TIMEOUT_MS,
  NO_IDLE_CALLBACK_DELAY_MS,
  createIdlePrefetch,
  prefetchStudentScreens,
  savesData,
} from '../../src/app/student/studentScreenPrefetch.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const fakeWindow = ({ idle = true, onLine = true, saveData = false } = {}) => {
  const idleCallbacks = new Map();
  const timers = new Map();
  const listeners = new Map();
  let nextId = 1;
  const win = {
    navigator: { onLine, connection: { saveData } },
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    addEventListener: (type, fn) => { listeners.set(type, [...(listeners.get(type) || []), fn]); },
    removeEventListener: (type, fn) => { listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== fn)); },
  };
  if (idle) {
    win.requestIdleCallback = (fn, options) => { const id = nextId++; idleCallbacks.set(id, { fn, options }); return id; };
    win.cancelIdleCallback = (id) => { idleCallbacks.delete(id); };
  }
  const runAll = (map) => { const due = [...map.values()]; map.clear(); due.forEach(({ fn }) => fn()); };
  return {
    win,
    idleCallbacks,
    timers,
    listening: (type) => (listeners.get(type) || []).length,
    goIdle: () => runAll(idleCallbacks),
    runTimers: () => runAll(timers),
    // Each listener was added { once: true }: firing removes it.
    fire: (type) => { const due = listeners.get(type) || []; listeners.set(type, []); due.forEach((fn) => fn()); },
  };
};

const SCREENS = ['grades', 'assignments', 'rewards', 'result'];
const fourScreens = () => {
  const fetched = [];
  return { fetched, screens: SCREENS.map((name) => ({ prefetch: () => { fetched.push(name); } })) };
};

test('nothing is fetched while Home draws; at the next idle moment all four are, and only once per page', () => {
  const page = fakeWindow();
  const { fetched, screens } = fourScreens();
  const prefetch = createIdlePrefetch();
  prefetch(screens, page.win);
  assert.deepEqual(fetched, [], 'not before the browser is idle');
  assert.deepEqual([...page.idleCallbacks.values()].map(({ options }) => options.timeout), [IDLE_TIMEOUT_MS]);
  page.goIdle();
  assert.deepEqual(fetched, SCREENS);
  // Home again (a later visit, or the next student on this Chromebook): the
  // code is already in the page, so nothing is asked for.
  prefetch(screens, page.win);
  assert.equal(page.idleCallbacks.size + page.timers.size, 0);
  page.goIdle();
  assert.deepEqual(fetched, SCREENS);
});

test('leaving Home before the browser is idle fetches nothing; the next visit to Home asks again', () => {
  const page = fakeWindow();
  const { fetched, screens } = fourScreens();
  const prefetch = createIdlePrefetch();
  const cancel = prefetch(screens, page.win);
  cancel();
  assert.equal(page.idleCallbacks.size, 0);
  page.goIdle();
  assert.deepEqual(fetched, []);
  prefetch(screens, page.win);
  page.goIdle();
  assert.deepEqual(fetched, SCREENS, 'still once: it had not run');
});

test('a device that asks to save data fetches nothing ahead: each screen loads when it is opened', () => {
  const page = fakeWindow({ saveData: true });
  const { fetched, screens } = fourScreens();
  createIdlePrefetch()(screens, page.win);
  assert.equal(page.idleCallbacks.size + page.timers.size, 0, 'nothing is even scheduled');
  page.goIdle();
  page.runTimers();
  assert.deepEqual(fetched, []);
  assert.equal(savesData(page.win), true);
  assert.equal(savesData({ navigator: {} }), false, 'no Network Information API: an ordinary device');
});

test('offline when the browser is idle: it waits for the device to be back online, then for an idle moment', () => {
  const page = fakeWindow({ onLine: false });
  const { fetched, screens } = fourScreens();
  createIdlePrefetch()(screens, page.win);
  page.goIdle();
  assert.deepEqual(fetched, [], 'nothing is asked for offline');
  assert.equal(page.listening('online'), 1);
  page.win.navigator.onLine = true;
  page.fire('online');
  assert.deepEqual(fetched, [], 'back online, it waits for the browser to be idle again');
  page.goIdle();
  assert.deepEqual(fetched, SCREENS);
  // Leaving Home while it waits for the network stops the wait.
  const away = fakeWindow({ onLine: false });
  const cancel = createIdlePrefetch()(fourScreens().screens, away.win);
  away.goIdle();
  assert.equal(away.listening('online'), 1);
  cancel();
  assert.equal(away.listening('online'), 0);
});

test('a browser with no idle callback waits two seconds instead', () => {
  const page = fakeWindow({ idle: false });
  const { fetched, screens } = fourScreens();
  const cancel = createIdlePrefetch()(screens, page.win);
  assert.deepEqual([...page.timers.values()].map(({ ms }) => ms), [NO_IDLE_CALLBACK_DELAY_MS]);
  page.runTimers();
  assert.deepEqual(fetched, SCREENS);
  cancel();
});

test('App asks for it once a student\'s Home has rendered, for the four screens, through the once-per-page prefetch', () => {
  assert.equal(typeof prefetchStudentScreens, 'function');
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /^import \{ prefetchStudentScreens \} from '\.\/app\/student\/studentScreenPrefetch\.js';$/m);
  const effect = region(app, 'return prefetchStudentScreens(', '}, [user?.role, activeView, studentDashboardMode]);', 'the student screens prefetch');
  assert.match(effect, /^return prefetchStudentScreens\(\[StudentGradeCenter, StudentAssignmentsCenter, StudentRewardsCenter, StudentAssignmentResult\]\);/);
  // After Home has rendered (an effect), only on Home (dashboard mode
  // 'assignments'), only for a student; the cleanup is the cancel.
  const start = app.lastIndexOf('useEffect(() => {', app.indexOf('return prefetchStudentScreens('));
  const guard = app.slice(start, app.indexOf('return prefetchStudentScreens('));
  assert.match(guard, /^useEffect\(\(\) => \{\s*if \(user\?\.role !== 'student' \|\| activeView !== 'dashboard' \|\| studentDashboardMode !== 'assignments'\) return undefined;\s*$/);
});
