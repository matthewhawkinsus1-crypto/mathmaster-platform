/*
 * THE WEEKLY PATH COMPLETIONS CALLABLE: ONLY FOR A CLASS ON SCREEN, NOT
 * AGAIN WITHIN ITS MINUTE, NEVER WHILE THE PAGE IS HIDDEN, AND STILL FRESH
 * WITHIN A MINUTE WHILE A TEACHER WATCHES (weeklyPathProgressRefresh.js).
 *
 * The reads probe (tests/browser/teacherWorkflow/sessionReadsProbe.mjs)
 * counted getTeacherWeeklyPathCompletions six times in a teacher's Home,
 * Grades, Live view, review and Home again, two of them for Grades alone (the
 * first class while none was chosen, then the chosen one), and App's
 * 60-second interval ran whether or not anyone could see the page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  WEEKLY_PATH_PROGRESS_FRESH_MS,
  createWeeklyPathProgressRefresh,
  weeklyPathProgressClassId,
} from '../../src/platform/path/weeklyPathProgressRefresh.js';
import { register } from 'node:module';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { firestoreClient, resetFirestoreClient } from './helpers/firestoreClientStub.mjs';

const MINUTE = WEEKLY_PATH_PROGRESS_FRESH_MS;

// A clock, its timers and a page whose visibility the test sets.
const world = () => {
  let clock = 1_000_000;
  let sequence = 0;
  const pending = new Map();
  const listeners = new Set();
  const page = {
    visibilityState: 'visible',
    addEventListener: (type, listener) => { if (type === 'visibilitychange') listeners.add(listener); },
    removeEventListener: (type, listener) => { if (type === 'visibilitychange') listeners.delete(listener); },
  };
  const settle = async () => { for (let turn = 0; turn < 10; turn += 1) await Promise.resolve(); };
  const w = {
    page,
    now: () => clock,
    timers: {
      set: (callback, delay) => { sequence += 1; pending.set(sequence, { at: clock + delay, callback }); return sequence; },
      clear: (handle) => pending.delete(handle),
    },
    timersPending: () => pending.size,
    settle,
    // Time passes: each timer that falls due runs, in order, with its effects.
    async advance(ms) {
      const end = clock + ms;
      for (;;) {
        const next = [...pending.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        pending.delete(next[0]);
        clock = next[1].at;
        next[1].callback();
        await settle();
      }
      clock = end;
      await settle();
    },
    async setHidden(hidden) {
      page.visibilityState = hidden ? 'hidden' : 'visible';
      [...listeners].forEach((listener) => listener({ type: 'visibilitychange' }));
      await settle();
    },
  };
  return w;
};

// One class on screen, as App.jsx shows it: what was asked, what it shows.
const screenFor = (w, classId, { week = () => '2026-W47', answers = null } = {}) => {
  const screen = {
    asked: [],
    shows: null,
    failures: 0,
    loadingLine: [],
    id: `teacher-1|${classId}`,
    period: week,
    fetch: (period) => {
      screen.asked.push({ period, at: w.now() });
      return answers ? answers() : Promise.resolve({ classId, period, at: w.now() });
    },
    apply: (result) => { screen.shows = result; },
    fail: () => { screen.failures += 1; screen.shows = null; },
    loading: (on) => { screen.loadingLine.push(on); },
  };
  return screen;
};

const refreshIn = (w) => createWeeklyPathProgressRefresh({ now: w.now, timers: w.timers, page: w.page });

test('the class the screen shows, and none where a screen shows no class', () => {
  const classes = [{ classId: 'first' }, { classId: 'period-3' }];
  // Grades with no class chosen shows the class chooser, and no weekly Path grade.
  assert.equal(weeklyPathProgressClassId({ teacherTab: 'grades', activeClassId: null, classes }), null);
  // Home counts completion only for a chosen class (its panel says so).
  assert.equal(weeklyPathProgressClassId({ teacherTab: 'home', activeClassId: null, classes }), null);
  assert.equal(weeklyPathProgressClassId({ teacherTab: 'grades', activeClassId: 'period-3', classes }), 'period-3');
  assert.equal(weeklyPathProgressClassId({ teacherTab: 'home', activeClassId: 'period-3', classes }), 'period-3');
  // The Weekly Path tab's own selector shows the first class until one is chosen.
  assert.equal(weeklyPathProgressClassId({ teacherTab: 'weeklyPath', activeClassId: null, classes }), 'first');
  assert.equal(weeklyPathProgressClassId({ teacherTab: 'weeklyPath', activeClassId: 'period-3', classes }), 'period-3');
  assert.equal(weeklyPathProgressClassId({ teacherTab: 'weeklyPath', activeClassId: null, classes: [] }), null);
  assert.equal(weeklyPathProgressClassId({ teacherTab: 'students', activeClassId: 'period-3', classes }), null);
});

test('an entry asks once; entries within the minute ask nothing; the minute still refreshes it', async () => {
  const w = world();
  const refresh = refreshIn(w);
  // Every screen's calls, in one list: Home, Grades, Live view... in turn.
  const calls = [];
  const enter = () => {
    const screen = screenFor(w, 'period-3');
    const fetch = screen.fetch;
    screen.fetch = (period) => { calls.push(w.now()); return fetch(period); };
    return refresh.watch(screen);
  };
  let stop = enter();
  await w.settle();
  assert.equal(calls.length, 1, 'the first entry asks');

  // Home -> Grades -> Live view -> Grades -> Home, same class, 40 seconds.
  for (let step = 0; step < 4; step += 1) {
    await w.advance(10_000);
    stop();
    stop = enter();
    await w.settle();
  }
  assert.equal(calls.length, 1, 'no entry inside the minute asks again');
  // A minute after it was asked, it is asked again, whichever screen is up.
  await w.advance(MINUTE - 40_000 - 1);
  assert.equal(calls.length, 1);
  await w.advance(1);
  assert.deepEqual(calls.map((at) => at - calls[0]), [0, MINUTE]);
  stop();

  // Seen from a fresh screen: one ask per minute while it is up.
  const w2 = world();
  const refresh2 = refreshIn(w2);
  const watched = screenFor(w2, 'period-3');
  const stopWatching = refresh2.watch(watched);
  await w2.settle();
  await w2.advance(MINUTE * 3);
  assert.deepEqual(watched.asked.map((entry) => entry.at - watched.asked[0].at), [0, MINUTE, MINUTE * 2, MINUTE * 3],
    'a completion shows within a minute while the teacher watches');
  stopWatching();
  await w2.advance(MINUTE * 3);
  assert.equal(watched.asked.length, 4, 'nothing is asked once the screen is gone');
});

test('the minute runs from the last ask across screens, and a stale entry asks at once', async () => {
  const w = world();
  const refresh = refreshIn(w);
  const asked = [];
  const screen = () => {
    const entry = screenFor(w, 'period-3');
    const fetch = entry.fetch;
    entry.fetch = (period) => { asked.push(w.now()); return fetch(period); };
    return entry;
  };
  let stop = refresh.watch(screen());
  await w.settle();
  await w.advance(30_000);
  stop();
  stop = refresh.watch(screen());
  await w.settle();
  assert.equal(asked.length, 1, 'thirty seconds later: the answer held is fresh');
  await w.advance(30_000);
  assert.equal(asked.length, 2, 'asked again a minute after the first ask, not a minute after the entry');
  stop();
  await w.advance(MINUTE + 5_000);
  stop = refresh.watch(screen());
  await w.settle();
  assert.equal(asked.length, 3, 'an entry after the minute asks at once');
  stop();
});

test('nothing is asked while the page is hidden; shown again, a stale answer is asked for once', async () => {
  const w = world();
  const refresh = refreshIn(w);
  const screen = screenFor(w, 'period-3');
  const stop = refresh.watch(screen);
  await w.settle();
  await w.advance(10_000);
  await w.setHidden(true);
  assert.equal(w.timersPending(), 0, 'the timer stops while the page is hidden');
  await w.advance(MINUTE * 5);
  assert.equal(screen.asked.length, 1, 'five minutes hidden: nothing asked');
  await w.setHidden(false);
  assert.equal(screen.asked.length, 2, 'shown again: asked once, at once');
  await w.advance(MINUTE - 1);
  assert.equal(screen.asked.length, 2);
  await w.advance(1);
  assert.equal(screen.asked.length, 3, 'and the minute runs from that catch-up');
  // Hidden and shown again inside the minute: nothing more until it is due.
  await w.advance(20_000);
  await w.setHidden(true);
  await w.setHidden(false);
  assert.equal(screen.asked.length, 3, 'a short hide asks nothing on its own');
  await w.advance(MINUTE - 20_000);
  assert.equal(screen.asked.length, 4, 'the minute comes due as before');
  stop();
});

test('no answer is applied for a class the screen no longer shows', async () => {
  const w = world();
  const refresh = refreshIn(w);
  let release = null;
  const slow = screenFor(w, 'period-1', { answers: () => new Promise((resolve) => { release = () => resolve({ classId: 'period-1' }); }) });
  let stop = refresh.watch(slow);
  await w.settle();
  assert.equal(slow.asked.length, 1);
  // The teacher chose another class before the first answered.
  stop();
  const chosen = screenFor(w, 'period-3');
  stop = refresh.watch(chosen);
  await w.settle();
  assert.equal(chosen.asked.length, 1, 'the class on screen is asked for');
  release();
  await w.settle();
  assert.equal(slow.shows, null, 'the other class\'s answer is not shown');
  assert.equal(chosen.shows.classId, 'period-3');
  stop();
});

test('an entry while the same class is on its way waits for that answer, and asks nothing', async () => {
  const w = world();
  const refresh = refreshIn(w);
  let release = null;
  const first = screenFor(w, 'period-3', { answers: () => new Promise((resolve) => { release = () => resolve({ classId: 'period-3' }); }) });
  let stop = refresh.watch(first);
  await w.settle();
  stop();
  const again = screenFor(w, 'period-3');
  stop = refresh.watch(again);
  await w.settle();
  assert.equal(first.asked.length + again.asked.length, 1, 'one call');
  release();
  await w.settle();
  assert.deepEqual(first.shows, { classId: 'period-3' }, 'its answer is the screen\'s');
  await w.advance(MINUTE - 1);
  assert.equal(first.asked.length + again.asked.length, 1);
  await w.advance(1);
  assert.equal(again.asked.length, 1, 'and the minute comes from that one call');
  stop();
});

test('a failed call is no answer: the next entry asks, and the minute retries it, not sooner', async () => {
  const w = world();
  const refresh = refreshIn(w);
  let failing = true;
  const answers = () => (failing ? Promise.reject(new Error('internal')) : Promise.resolve({ ok: true }));
  const screen = screenFor(w, 'period-3', { answers });
  let stop = refresh.watch(screen);
  await w.settle();
  assert.equal(screen.failures, 1);
  await w.advance(MINUTE - 1);
  assert.equal(screen.asked.length, 1, 'not retried at once');
  await w.advance(1);
  assert.equal(screen.asked.length, 2, 'retried a minute later');
  stop();
  failing = false;
  const next = screenFor(w, 'period-3', { answers });
  stop = refresh.watch(next);
  await w.settle();
  assert.equal(next.asked.length, 1, 'an entry with no answer held asks at once');
  assert.deepEqual(next.shows, { ok: true });
  stop();
});

test('a new week, or another account, is not the answer held', async () => {
  const w = world();
  const refresh = refreshIn(w);
  let week = '2026-W47';
  const screen = () => screenFor(w, 'period-3', { week: () => week });
  let current = screen();
  let stop = refresh.watch(current);
  await w.settle();
  stop();
  week = '2026-W48';
  current = screen();
  stop = refresh.watch(current);
  await w.settle();
  assert.deepEqual(current.asked.map((entry) => entry.period), ['2026-W48'], 'Monday: the new week is asked for at once');
  stop();
  refresh.forget();
  current = screen();
  stop = refresh.watch(current);
  await w.settle();
  assert.equal(current.asked.length, 1, 'after a change of account nothing held is used');
  stop();
});

test('the loading line is the entry\'s: on while it asks, off when it answers, never for the minute\'s', async () => {
  const w = world();
  const refresh = refreshIn(w);
  const screen = screenFor(w, 'period-3');
  const stop = refresh.watch(screen);
  await w.settle();
  assert.deepEqual(screen.loadingLine, [true, false]);
  await w.advance(MINUTE);
  assert.equal(screen.asked.length, 2);
  assert.deepEqual(screen.loadingLine, [true, false], 'a refresh in the background shows no loading line');
  stop();
});

/* ------------------------------------------- what the teacher kit does with it */

// The kit's follower (app/teacher/weeklyPathProgress.js), handed App's real
// Path client as App hands it, over the in-memory Firebase
// (helpers/firestoreClientStub.mjs).
register('./helpers/firestoreClientIsolation.mjs', import.meta.url);
const { followWeeklyPathProgress } = await import('../../src/app/teacher/weeklyPathProgress.js');
const { fetchTeacherWeeklyPathCompletions, storedWeeklyGoalForClassContext } = await import('../../src/platform/path/pathStore.js');
const { weekKeyFor } = await import('../../src/platform/path/weeklyPathGoal.js');
const PATH_CLIENT = { completions: fetchTeacherWeeklyPathCompletions, weeklyGoalFor: storedWeeklyGoalForClassContext, weekKeyFor };

const CLASSES = [{ classId: 'first', period: '1' }, { classId: 'period-3', period: '3' }];
// What App holds, as the follower sets it, and every screen it was asked to watch.
const follow = (screen) => {
  const held = { completions: undefined, goals: undefined, truncated: undefined, loadedFor: undefined, loading: [] };
  const set = {
    completions: (value) => { held.completions = value; },
    goals: (value) => { held.goals = value; },
    truncated: (value) => { held.truncated = value; },
    loadedFor: (value) => { held.loadedFor = value; },
    loading: (on) => { held.loading.push(on); },
  };
  const watched = [];
  const refresh = { watch: (watch) => { watched.push(watch); return () => {}; } };
  const stop = followWeeklyPathProgress(refresh, { uid: 'teacher-1', classes: CLASSES, weeklyGoalsByClass: {}, path: PATH_CLIENT, ...screen, set });
  return { held, watched, stop };
};

test('the kit asks for no class where the screen shows none, and for the class it shows', () => {
  for (const teacherTab of ['home', 'grades']) {
    const none = follow({ teacherTab, activeClassId: null });
    assert.equal(none.stop, undefined, `${teacherTab} with no class chosen: nothing followed`);
    assert.equal(none.watched.length, 0);
    assert.equal(none.held.loadedFor, undefined, 'and what is held is left alone');
  }
  assert.equal(follow({ teacherTab: 'students', activeClassId: 'period-3' }).watched.length, 0, 'a screen without weekly completion');
  const chosen = follow({ teacherTab: 'grades', activeClassId: 'period-3' });
  assert.equal(chosen.watched.length, 1);
  assert.equal(chosen.watched[0].id, 'teacher-1|period-3');
  assert.equal(typeof chosen.stop, 'function');
  const weekly = follow({ teacherTab: 'weeklyPath', activeClassId: null });
  assert.equal(weekly.watched[0].id, 'teacher-1|first', 'the Weekly Path tab shows the first class until one is chosen');
  // A teacher with no class at all holds nothing, as before.
  const empty = follow({ teacherTab: 'home', activeClassId: null, classes: [] });
  assert.deepEqual([empty.held.completions, empty.held.goals, empty.held.loadedFor], [{}, {}, null]);
  assert.equal(empty.watched.length, 0);
});

test('the kit asks for the class\'s own week, applies the answer for that class, and clears on a failure', async () => {
  resetFirestoreClient();
  const wednesday = { 'period-3': { weekStartsOn: 3 } };
  const { held, watched } = follow({ teacherTab: 'home', activeClassId: 'period-3', weeklyGoalsByClass: wednesday });
  const [screen] = watched;
  assert.equal(screen.period(), weekKeyFor(Date.now(), 3), 'the class\'s week, as of the call');
  firestoreClient.answers.getTeacherWeeklyPathCompletions = () => ({ byStudentId: { s1: [{ id: 'x' }] }, goalsByStudentId: { s1: { goalSessions: 4 } }, truncated: false });
  const answer = await screen.fetch(screen.period());
  assert.deepEqual(firestoreClient.calls, [{ name: 'getTeacherWeeklyPathCompletions', data: { classId: 'period-3', weekKey: screen.period() } }]);
  screen.apply(answer);
  assert.deepEqual(held.completions, { s1: [{ id: 'x' }] });
  assert.deepEqual(held.goals, { s1: { goalSessions: 4 } });
  assert.equal(held.truncated, false);
  assert.equal(held.loadedFor, 'period-3');
  const quiet = console.error;
  console.error = () => {};
  try { screen.fail(new Error('internal')); } finally { console.error = quiet; }
  assert.deepEqual([held.completions, held.goals, held.truncated, held.loadedFor], [{}, {}, false, null], 'no answer is not zero completions');
  screen.loading(true);
  assert.deepEqual(held.loading, [true]);
});

const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
const kit = executableSource(readFileSync(new URL('../../src/app/teacher/teacherKit.js', import.meta.url), 'utf8'));

test('App keeps one refresh from the teacher kit and follows the screen through it', () => {
  // Teacher-only: from the kit, never in a student's first load.
  assert.match(kit, /export \{ createWeeklyPathProgressRefresh \} from '\.\.\/\.\.\/platform\/path\/weeklyPathProgressRefresh\.js';/);
  assert.match(kit, /export \{ followWeeklyPathProgress \} from '\.\/weeklyPathProgress\.js';/);
  assert.doesNotMatch(app, /weeklyPathProgressRefresh\.js'|app\/teacher\/weeklyPathProgress\.js'/, 'App imports neither');
  assert.match(app, /const weeklyPathProgress = useMemo\(\(\) => \(teacherKit \? teacherKit\.createWeeklyPathProgressRefresh\(\) : null\), \[teacherKit\]\);/);
  // A change of account (or none) forgets what the last one was shown.
  assert.match(app, /useEffect\(\(\) => \(\) => weeklyPathProgress\?\.forget\(\), \[weeklyPathProgress, user\?\.uid\]\);/);
  const effect = region(app, "if (user?.role !== 'teacher' || teacherPreviewRuntimeActive || !weeklyPathProgress) return undefined;", '}, [user?.role, user?.uid, teacherTab, activeClass.classId, classes, weeklyGoalsByClass, teacherPreviewRuntimeActive, weeklyPathProgress, teacherKit]);', 'the weekly Path completion effect');
  assert.match(effect, /return teacherKit\.followWeeklyPathProgress\(weeklyPathProgress, \{\s*uid: user\.uid,\s*teacherTab,\s*activeClassId: activeClass\.classId,\s*classes,\s*weeklyGoalsByClass,/);
  // App's own Path client, which the kit uses and does not import (a first-load split).
  assert.match(effect, /path: \{ completions: fetchTeacherWeeklyPathCompletions, weeklyGoalFor: storedWeeklyGoalForClassContext, weekKeyFor \},/);
  assert.match(effect, /completions: setWeeklyPathCompletionsByStudent,\s*goals: setWeeklyPathGoalSnapshotsByStudent,\s*truncated: setWeeklyPathTruncated,\s*loadedFor: setWeeklyPathProgressLoadedFor,\s*loading: setWeeklyPathProgressLoading,/);
  assert.doesNotMatch(readFileSync(new URL('../../src/app/teacher/weeklyPathProgress.js', import.meta.url), 'utf8'), /^import .*(pathStore|weeklyPathGoal)\.js';$/m);
  // No interval of its own: the refresh keeps the minute and the page's visibility.
  assert.doesNotMatch(app, /loadProgress/);
  assert.doesNotMatch(effect, /setInterval\(/);
});
