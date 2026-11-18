/*
 * A STUDENT'S WEEK OF MY MATH PATH: ONE PAGE'S ANSWERS FOR HOME AND MY MATH
 * PATH (studentWeeklyPath.js).
 *
 * The reads probe (tests/browser/teacherWorkflow/sessionReadsProbe.mjs) counted
 * getMyWeeklyPathCompletions and getStudentWeeklyPathGoalSnapshot on every
 * Home visit, and getMyWeeklyPathCompletions and resolveWeeklyPathGoalSnapshot
 * on every visit to My Math Path. These pin the rule that replaced them: an
 * answer is used again for a minute, for the same student, class and week,
 * and never after the student's own Path work; a frozen week is asked for once
 * a page; one call on its way serves every screen; nothing is asked while the
 * page is hidden; and a failure is said, held by no one and asked again.
 *
 * The first part drives the controller with a clock, timers and a page of its
 * own. The second runs the real page week (pathStore.js) and the real live
 * Path runtime (pathSessionService.js) over the in-memory callables of
 * helpers/firestoreClientStub.mjs: a weekly session the student finishes is
 * on the next screen they open. The last pins how App.jsx and My Math Path use
 * it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { firestoreClient, resetFirestoreClient } from './helpers/firestoreClientStub.mjs';

register('./helpers/firestoreClientIsolation.mjs', import.meta.url);
register('./helpers/livePathRuntimeIsolation.mjs', import.meta.url);
const { STUDENT_WEEKLY_PATH_FRESH_MS, createStudentWeeklyPath } = await import('../../src/platform/path/studentWeeklyPath.js');
const { studentWeeklyPath } = await import('../../src/platform/path/pathStore.js');
const { fetchNextSanitizedQuestion, startOrResumePathSession, submitStudentResponse } = await import('../../src/services/pathSessionService.js');

const MINUTE = STUDENT_WEEKLY_PATH_FRESH_MS;
const WEEK = '2026-11-16';
const FROZEN = Object.freeze({ weekKey: WEEK, studentId: 's1', sessions: [{ slot: 1, weeklySlotKey: 'slot-1' }, { slot: 2, weeklySlotKey: 'slot-2' }], assignmentState: 'assigned' });
const settle = async () => { for (let turn = 0; turn < 6; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

/**
 * One page: a student's week on a server of its own, a clock, timers that run
 * when the test says, and a page that can be hidden and shown.
 */
const onePage = ({ goal = FROZEN } = {}) => {
  let clock = 5_000_000;
  const timers = new Map();
  let nextTimer = 0;
  const listeners = new Set();
  const page = {
    visibilityState: 'visible',
    addEventListener: (type, listener) => { if (type === 'visibilitychange') listeners.add(listener); },
    removeEventListener: (type, listener) => listeners.delete(listener),
  };
  const server = { goal, completions: [], inProgress: [], weeks: [], fail: new Set(), gates: {} };
  const calls = [];
  // The server answers with what it holds when it is asked; a gate holds the
  // answer back on its way.
  const answer = async (name, value) => {
    calls.push(name);
    const failing = server.fail.has(name);
    const answered = failing ? null : value();
    if (server.gates[name]) await server.gates[name].promise;
    if (failing) throw Object.assign(new Error(`${name} failed (test)`), { code: 'functions/unavailable' });
    return answered;
  };
  const client = {
    goal: () => answer('goal', () => server.goal),
    resolve: (proposed) => answer('resolve', () => {
      server.goal ||= { ...proposed, assignmentState: 'assigned' };
      return server.goal;
    }),
    completions: () => answer('completions', () => ({ completions: [...server.completions], inProgress: [...server.inProgress], truncated: false })),
    history: () => answer('history', () => ({ weeks: [...server.weeks], weeksHit: server.weeks.length })),
  };
  const week = createStudentWeeklyPath({
    client,
    now: () => clock,
    page,
    timers: {
      set: (callback, delay) => { nextTimer += 1; timers.set(nextTimer, { callback, at: clock + delay }); return nextTimer; },
      clear: (handle) => timers.delete(handle),
    },
  });
  return {
    week,
    server,
    calls,
    student: week.forStudent({ studentId: 's1', classId: 'algebra-1-p2' }),
    later: (ms) => { clock += ms; },
    async runDueTimers() {
      [...timers].filter(([, timer]) => timer.at <= clock).forEach(([handle, timer]) => { timers.delete(handle); timer.callback(); });
      await settle();
    },
    timersPending: () => timers.size,
    hide: () => { page.visibilityState = 'hidden'; listeners.forEach((listener) => listener()); },
    show: () => { page.visibilityState = 'visible'; listeners.forEach((listener) => listener()); },
  };
};

/** A screen showing the week: Home (with the frozen goal) or My Math Path. */
const screen = (student, { goal = false, weekKey = WEEK } = {}) => {
  const shown = [];
  const failed = [];
  const stop = student.follow(weekKey, { goal, apply: (answer) => shown.push(answer), fail: (error) => failed.push(error) });
  return { shown, failed, stop, last: () => shown.at(-1) || null };
};
const done = (answer) => answer?.facts?.completions?.length ?? null;

/* ------------------------------------------------------------ the rule */

test('Home, then My Math Path and Home again within a minute: the week is asked for once', async () => {
  const page = onePage();
  const home = screen(page.student, { goal: true });
  await settle();
  assert.deepEqual(page.calls, ['goal', 'completions'], 'Home asks for the frozen goal and the completions');
  assert.equal(home.last().goal, FROZEN);
  assert.equal(done(home.last()), 0);
  home.stop();

  page.later(30_000);
  const path = screen(page.student);
  assert.equal(path.shown.length, 1, 'My Math Path has the week in the same render');
  page.later(29_999);
  const homeAgain = screen(page.student, { goal: true });
  assert.equal(homeAgain.shown.length, 1);
  assert.equal(homeAgain.last().goal, FROZEN);
  assert.deepEqual(page.calls, ['goal', 'completions'], 'nothing more within the minute of the answer held');

  page.later(1);
  screen(page.student, { goal: true });
  await settle();
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions'], 'a minute on, the completions again; the frozen week never');
});

test('a session the student finishes is on the next screen: what was held before Path work is not used after it', async () => {
  const page = onePage();
  screen(page.student, { goal: true }).stop();
  await settle();
  // My Math Path: a weekly session starts, its questions are answered, it is
  // completed on the server (pathSessionService.js notes each call).
  page.later(5_000);
  page.week.noteWork();
  page.server.inProgress.push({ sessionId: 'p1', weeklySlotKey: 'slot-1' });
  page.week.noteWork();
  page.week.noteWork();
  page.server.inProgress.length = 0;
  page.server.completions.push({ sessionId: 'p1', weeklySlotKey: 'slot-1' });
  page.week.noteWork();
  // The end screen's reload asks; it is not handed what Home held.
  const ending = screen(page.student);
  assert.equal(ending.shown.length, 0, 'not the answer from before the session');
  await settle();
  assert.equal(done(ending.last()), 1);
  // Back on Home within the minute: the answer from after the session.
  page.later(10_000);
  const home = screen(page.student, { goal: true });
  assert.equal(done(home.last()), 1, 'Home shows the finished session at once');
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions']);
});

test('an answer asked for before Path work serves the screen that asked, and no other', async () => {
  const page = onePage();
  page.server.gates.completions = deferred();
  const home = screen(page.student, { goal: true });
  await settle();
  // A session finishes while Home's answer is on its way.
  page.week.noteWork();
  page.server.completions.push({ sessionId: 'p1' });
  const path = screen(page.student);
  await settle();
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions'], 'the next screen does not wait for the older call: it asks');
  page.server.gates.completions.resolve();
  await settle();
  assert.equal(done(home.last()), 0, 'the screen that asked has the answer it asked for');
  assert.equal(done(path.last()), 1);
  const homeAgain = screen(page.student, { goal: true });
  assert.equal(done(homeAgain.last()), 1, 'what is held is the answer from after the session');
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions']);
});

test('an answer asked for before Path work and landing after it is held for no later screen', async () => {
  const page = onePage();
  page.server.gates.completions = deferred();
  const home = screen(page.student, { goal: true });
  await settle();
  page.week.noteWork();
  page.server.completions.push({ sessionId: 'p1' });
  page.server.gates.completions.resolve();
  await settle();
  assert.equal(done(home.last()), 0, 'the screen that asked has its answer');
  const path = screen(page.student);
  assert.equal(path.shown.length, 0, 'the next screen asks again');
  await settle();
  assert.equal(done(path.last()), 1);
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions']);
});

test('one call on its way serves every screen that wants it', async () => {
  const page = onePage();
  page.server.gates.completions = deferred();
  const home = screen(page.student, { goal: true });
  const path = screen(page.student);
  page.server.gates.completions.resolve();
  await settle();
  assert.deepEqual(page.calls, ['goal', 'completions']);
  assert.equal(done(home.last()), 0);
  assert.equal(done(path.last()), 0);
});

/* ------------------------------------------------------------ the frozen week */

test('a frozen week is asked for once a page: Home\'s read serves My Math Path\'s freeze', async () => {
  const page = onePage();
  screen(page.student, { goal: true }).stop();
  await settle();
  assert.equal(page.student.frozenGoal(WEEK), FROZEN, 'My Math Path finds the week already frozen');
  assert.equal(await page.student.resolve({ weekKey: WEEK, proposed: true }), FROZEN);
  page.later(10 * MINUTE);
  const home = screen(page.student, { goal: true });
  await settle();
  assert.equal(home.last().goal, FROZEN);
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions'], 'no freeze, and no second read of the frozen week');
});

test('My Math Path freezes the week once a page, and Home uses what it froze', async () => {
  const page = onePage({ goal: null });
  const proposed = { weekKey: WEEK, sessions: [] };
  const frozen = await page.student.resolve(proposed);
  assert.equal(frozen.assignmentState, 'assigned');
  assert.equal(await page.student.resolve(proposed), frozen, 'a second visit does not ask again');
  const home = screen(page.student, { goal: true });
  await settle();
  assert.equal(home.last().goal, frozen);
  assert.deepEqual(page.calls, ['resolve', 'completions']);
});

test('"not frozen yet" is held for a minute, and not past an attempt to freeze the week', async () => {
  const page = onePage({ goal: null });
  screen(page.student, { goal: true }).stop();
  await settle();
  const home = screen(page.student, { goal: true });
  assert.equal(home.last().goal, null, 'Home within the minute: still no frozen week, nothing asked');
  assert.deepEqual(page.calls, ['goal', 'completions']);
  // My Math Path tries to freeze it, and the answer is lost.
  page.server.fail.add('resolve');
  await assert.rejects(page.student.resolve({ weekKey: WEEK }), /resolve failed/);
  page.server.fail.delete('resolve');
  const homeAgain = screen(page.student, { goal: true });
  await settle();
  assert.deepEqual(page.calls, ['goal', 'completions', 'resolve', 'goal'], 'the server may have frozen it: Home asks');
  assert.equal(homeAgain.last().goal, null);
  page.later(MINUTE);
  screen(page.student, { goal: true });
  await settle();
  assert.deepEqual(page.calls.slice(4), ['goal', 'completions'], 'a minute on, both again');
});

/* ------------------------------------------------------------ hidden, failed */

test('nothing is asked while the page is hidden; shown again, what came due is asked for once', async () => {
  const page = onePage();
  screen(page.student, { goal: true }).stop();
  await settle();
  page.hide();
  // Held and fresh: shown even while hidden, with nothing asked.
  assert.equal(screen(page.student).shown.length, 1);
  page.later(2 * MINUTE);
  const home = screen(page.student, { goal: true });
  const path = screen(page.student);
  const freezing = page.student.resolve({ weekKey: '2026-11-23' });
  await settle();
  assert.deepEqual(page.calls, ['goal', 'completions'], 'nothing while hidden');
  assert.equal(home.shown.length + path.shown.length, 0);
  page.show();
  await settle();
  await freezing;
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions', 'resolve'], 'one call for both screens, and the freeze');
  assert.equal(done(home.last()), 0);
  assert.equal(done(path.last()), 0);
});

test('a failure is said, held by no one, and asked again a minute later while the screen is there', async () => {
  const page = onePage();
  page.server.fail.add('completions');
  const home = screen(page.student, { goal: true });
  await settle();
  assert.equal(home.shown.length, 0, 'a failure is never shown as sessions done or not done');
  assert.equal(home.failed.length, 1);
  // Nothing was held: the next screen asks.
  const path = screen(page.student);
  await settle();
  assert.equal(path.failed.length, 1);
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions'], 'the frozen goal was held; the completions were not');
  assert.equal(page.timersPending(), 2, 'each screen there asks again in a minute');
  path.stop();
  assert.equal(page.timersPending(), 1, 'a screen gone leaves no retry behind');
  page.server.fail.delete('completions');
  page.later(MINUTE - 1);
  await page.runDueTimers();
  assert.equal(home.shown.length, 0);
  page.later(1);
  await page.runDueTimers();
  assert.equal(done(home.last()), 0, 'a minute on, Home has its answer');
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions', 'completions'], 'and only the screen still there asked');
  home.stop();
  assert.equal(page.timersPending(), 0);
});

test('an answer the screen cannot use is a failure too: said, never thrown at the screen, and asked again', async () => {
  const page = onePage();
  const unusable = (student) => {
    const failed = [];
    const stop = student.follow(WEEK, { goal: true, apply: () => { throw new Error('a goal this build cannot read'); }, fail: (error) => failed.push(error) });
    return { failed, stop };
  };
  const first = unusable(page.student);
  await settle();
  assert.equal(first.failed.length, 1, 'as Home\'s own catch said it');
  first.stop();
  // Held now: the next entry is handed it in its own render, and fails there.
  const second = unusable(page.student);
  assert.equal(second.failed.length, 1);
  assert.equal(page.timersPending(), 1, 'and it is asked for again in a minute');
  second.stop();
});

test('a failure while hidden waits for the page to be shown before it is asked again', async () => {
  const page = onePage();
  page.server.fail.add('completions');
  const home = screen(page.student, { goal: true });
  await settle();
  page.server.fail.delete('completions');
  page.hide();
  page.later(MINUTE);
  await page.runDueTimers();
  assert.deepEqual(page.calls, ['goal', 'completions']);
  page.show();
  await settle();
  assert.deepEqual(page.calls, ['goal', 'completions', 'completions']);
  assert.equal(done(home.last()), 0);
});

test('another student, class or week is asked for; another account forgets everything', async () => {
  const page = onePage();
  screen(page.student, { goal: true }).stop();
  await settle();
  screen(page.week.forStudent({ studentId: 's2', classId: 'algebra-1-p2' }), { goal: true });
  screen(page.week.forStudent({ studentId: 's1', classId: 'algebra-1-p4' }));
  screen(page.student, { weekKey: '2026-11-23' });
  await settle();
  assert.deepEqual(page.calls, ['goal', 'completions', 'goal', 'completions', 'completions', 'completions']);
  page.week.forget();
  screen(page.student, { goal: true });
  await settle();
  assert.deepEqual(page.calls.slice(6), ['goal', 'completions']);
  assert.equal(page.student.frozenGoal(WEEK), FROZEN);
});

/* --------------------------------------- the real page week and Path runtime */

test('a weekly session finished in My Math Path is on Home at once, and nothing more is asked within the minute', async () => {
  resetFirestoreClient();
  studentWeeklyPath.forget();
  const sessions = new Map();
  const weekFacts = () => ({
    success: true,
    weekKey: WEEK,
    completions: [...sessions.values()].filter((session) => session.status === 'completed').map((session) => ({ sessionId: session.sessionId, weeklySlotKey: session.weeklySlotKey })),
    inProgress: [...sessions.values()].filter((session) => session.status === 'active').map((session) => ({ sessionId: session.sessionId, weeklySlotKey: session.weeklySlotKey })),
    truncated: false,
  });
  Object.assign(firestoreClient.answers, {
    getStudentWeeklyPathGoalSnapshot: () => ({ success: true, goal: FROZEN }),
    getMyWeeklyPathCompletions: weekFacts,
    startMyMathPathSession: ({ weeklySlotKey }) => {
      sessions.set('p1', { sessionId: 'p1', status: 'active', weeklySlotKey });
      return { success: true, session: sessions.get('p1') };
    },
    issueNextQuestion: () => ({ questionInstance: { questionInstanceId: 'q1' } }),
    submitPathResponse: () => {
      sessions.get('p1').status = 'completed';
      return { success: true, session: sessions.get('p1') };
    },
  });
  const names = () => firestoreClient.calls.map((call) => call.name);
  const weekCalls = () => names().filter((name) => /Weekly/.test(name));
  const student = studentWeeklyPath.forStudent({ studentId: 's1', classId: 'algebra-1-p2' });

  const home = screen(student, { goal: true });
  await settle();
  assert.equal(done(home.last()), 0);
  home.stop();
  const path = screen(student);
  assert.equal(path.shown.length, 1, 'My Math Path opens on Home\'s answer');
  path.stop();
  assert.deepEqual(weekCalls(), ['getStudentWeeklyPathGoalSnapshot', 'getMyWeeklyPathCompletions']);

  // The student starts slot 1, is issued its question and answers it: the
  // server completes the session.
  const { session } = await startOrResumePathSession({ targetAlignmentKey: 'A.5A', weekKey: WEEK, weeklySlotKey: 'slot-1' });
  await fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  const submitted = await submitStudentResponse({ sessionId: session.sessionId, questionInstanceId: 'q1', responsePayload: { responses: { answer: '4' } } });
  assert.equal(submitted.session.status, 'completed');

  // The end screen's reload asks the server; Home, opened next, shows it.
  const ending = screen(student);
  await settle();
  assert.equal(done(ending.last()), 1, 'the end screen counts the finished session');
  ending.stop();
  const homeAgain = screen(student, { goal: true });
  assert.equal(done(homeAgain.last()), 1, 'Home shows it in its first render');
  assert.deepEqual(weekCalls(), ['getStudentWeeklyPathGoalSnapshot', 'getMyWeeklyPathCompletions', 'getMyWeeklyPathCompletions']);
});

test('a Path call that fails is Path work too: the server may have done it', async () => {
  resetFirestoreClient();
  studentWeeklyPath.forget();
  let completed = false;
  Object.assign(firestoreClient.answers, {
    getStudentWeeklyPathGoalSnapshot: () => ({ success: true, goal: FROZEN }),
    getMyWeeklyPathCompletions: () => ({ success: true, weekKey: WEEK, completions: completed ? [{ sessionId: 'p1' }] : [], inProgress: [], truncated: false }),
    submitPathResponse: () => {
      completed = true;
      throw Object.assign(new Error('deadline exceeded'), { code: 'functions/deadline-exceeded' });
    },
  });
  const student = studentWeeklyPath.forStudent({ studentId: 's1', classId: 'algebra-1-p2' });
  screen(student, { goal: true }).stop();
  await settle();
  await assert.rejects(submitStudentResponse({ sessionId: 'p1', questionInstanceId: 'q1', responsePayload: {} }));
  const home = screen(student, { goal: true });
  await settle();
  assert.equal(done(home.last()), 1, 'asked again: the answer was recorded although the call failed');
});

test('reads of the Path that change nothing are not Path work', async () => {
  const service = executableSource(readFileSync(new URL('../../src/services/pathSessionService.js', import.meta.url), 'utf8'));
  assert.match(service, /const PATH_WORK = new Set\(\['startMyMathPathSession', 'issueNextQuestion', 'submitPathResponse'\]\);/);
  const invoke = region(service, 'const invokePathCallable = async (name, payload) => {', '\n};', 'the live callable');
  assert.match(invoke, /const work = PATH_WORK\.has\(name\);\s*if \(work\) studentWeeklyPath\.noteWork\(\);\s*try \{/, 'noted as the call goes out');
  assert.match(invoke, /\} finally \{\s*if \(work\) studentWeeklyPath\.noteWork\(\);\s*\}/, 'and once it has landed, whatever it answered');
});

/* ------------------------------------------------------------ the wiring */

const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
const path = executableSource(readFileSync(new URL('../../src/components/student/MyMathPathApp.jsx', import.meta.url), 'utf8'));

test('My Progress\'s recent weeks: asked for once a minute, again after Path work, never held from a failure or for another account', async () => {
  const page = onePage();
  page.server.weeks = [{ weekKey: '2026-11-09', hit: true }];
  const first = await page.student.history();
  assert.deepEqual(page.calls, ['history'], 'the first visit asks');
  assert.equal(first.weeksHit, 1);

  page.later(MINUTE - 1);
  assert.equal(await page.student.history(), first, 'a visit within the minute is answered from the page');
  assert.deepEqual(page.calls, ['history']);

  page.week.noteWork();
  page.server.weeks.push({ weekKey: '2026-11-16', hit: true });
  assert.equal((await page.student.history()).weeksHit, 2, 'Path work since: asked again, and the new week is there');
  assert.deepEqual(page.calls, ['history', 'history']);

  page.later(MINUTE);
  await page.student.history();
  assert.deepEqual(page.calls, ['history', 'history', 'history'], 'a minute on: asked again');

  // One call on its way serves every visit.
  page.later(MINUTE);
  page.server.gates.history = deferred();
  const a = page.student.history();
  const b = page.student.history();
  page.server.gates.history.resolve();
  assert.equal(await a, await b);
  assert.equal(page.calls.length, 4);
  delete page.server.gates.history;

  // An answer asked for before Path work and landing after it is held for no later visit.
  page.later(MINUTE);
  page.server.gates.history = deferred();
  const before = page.student.history();
  page.week.noteWork();
  page.server.gates.history.resolve();
  await before;
  delete page.server.gates.history;
  await page.student.history();
  assert.equal(page.calls.length, 6, 'what landed after the work was not kept');

  // A failure holds nothing: Try again asks again.
  page.later(MINUTE);
  page.server.fail.add('history');
  await assert.rejects(page.student.history(), /history failed/);
  page.server.fail.delete('history');
  await page.student.history();
  assert.equal(page.calls.length, 8, 'Try again after a failure asks the server');

  // Another student is asked for; another account forgets.
  await page.week.forStudent({ studentId: 's2', classId: 'algebra-1-p2' }).history();
  assert.equal(page.calls.length, 9);
  page.week.forget();
  await page.student.history();
  assert.equal(page.calls.length, 10, 'nothing held past another account');
});

test('Home follows the page\'s week, with the frozen goal, and says when it has no answer', () => {
  assert.match(app, /const studentWeeklyPathFacts = useMemo\(\(\) => \(\s*user\?\.role === 'student' && user\.id \? studentWeeklyPath\.forStudent\(\{ studentId: user\.id, classId: user\.classId \|\| null \}\) : null\s*\), \[user\?\.role, user\?\.id, user\?\.classId\]\);/);
  const effect = region(app, 'if (studentDashboardMode !== \'assignments\' || !studentWeeklyPathFacts) return undefined;', 'studentDashboardMode, Math.floor(now / 3_600_000),', 'Home weekly status');
  const unsettle = effect.indexOf('setStudentWeeklyPathProgress(null);');
  const follow = effect.indexOf('return studentWeeklyPathFacts.follow(currentWeekKey, {');
  assert.ok(unsettle > -1 && follow > unsettle, 'nothing shown until the week is known, then the answer');
  assert.match(effect, /goal: true,\s*apply: \(\{ goal, facts: weeklyFacts \}\) => \{/);
  assert.match(region(effect, 'fail: (error) => {', '},', 'the failure'), /setStudentWeeklyPathProgress\(null\);/, 'no answer, never a zero');
  assert.match(app, /user\?\.role, user\?\.id, user\?\.profile\?\.courseLevel, studentWeeklyGoalConfig, studentWeeklyPathFacts,/);
  assert.doesNotMatch(app, /fetchMyWeeklyPathCompletions\(|fetchStudentWeeklyPathGoalSnapshot\(/, 'no call of its own beside the page\'s week');
  // Another account: nothing held is used.
  assert.match(app, /if \(hydratedSessionUidRef\.current !== session\.uid\) \{\s*forgetSessionPathCoverage\(\);\s*studentWeeklyPath\.forget\(\);\s*\}/);
  assert.match(region(app, '<MyMathPathApp', '/>', 'My Math Path'), /weeklyPathFacts=\{studentWeeklyPathFacts\}/);
});

test('My Math Path uses the page\'s week for the live student only, for its facts and its freeze', () => {
  assert.match(path, /const liveWeek = weeklyPathFacts && !sessionProvider && !readOnly \? weeklyPathFacts : null;/);
  const freeze = region(path, 'const [assignedWeeklyGoal, setAssignedWeeklyGoal]', 'const weeklyGoal = ', 'weekly freeze effect');
  const known = freeze.indexOf('liveWeek.frozenGoal(proposedWeeklyGoal.weekKey)');
  const reuse = freeze.indexOf('if (frozen && frozen.weekKey === proposedWeeklyGoal.weekKey) {');
  assert.ok(known > -1 && reuse > known, 'a week the page knows frozen is used before the server is asked');
  assert.match(freeze, /const weekAlreadyFrozen = liveWeek \? liveWeek\.frozenGoal\(proposedWeeklyGoal\.weekKey\) : null;\s*if \(weekAlreadyFrozen\) frozenWeeklySnapshotRef\.current = \{ weekKey: weekAlreadyFrozen\.weekKey \|\| proposedWeeklyGoal\.weekKey, snapshot: weekAlreadyFrozen \};\s*const frozen = frozenWeeklySnapshotRef\.current;/);
  assert.match(freeze, /\(liveWeek \? liveWeek\.resolve\(proposedWeeklyGoal\) : resolveWeeklyPathGoalSnapshot\(proposedWeeklyGoal\)\)/);
  assert.match(freeze, /\}, \[proposedWeeklyGoal, sessionProvider, liveWeek\]\);/);
  const facts = region(path, 'const [weeklySessionFacts, setWeeklySessionFacts]', 'const weeklyProgress = useMemo(', 'weekly session facts');
  const live = region(facts, 'if (liveWeek) {', 'const load = sessionProvider', 'the live week');
  assert.match(live, /const stop = liveWeek\.follow\(weeklyGoalWeekKey, \{ apply: \(\{ facts \}\) => ready\(facts\), fail: failed \}\);/);
  assert.match(live, /return \(\) => \{\s*cancelled = true;\s*stop\(\);\s*\};/);
  // A finished session, a return from one and Try again re-run the effect;
  // the session's own calls made what was held stale, so it asks.
  assert.match(path, /onSessionComplete=\{\(finished\) => \{ setFinishedSession\(finished \|\| null\); setWeeklyRefreshKey\(\(value\) => value \+ 1\); onReload\?\.\(\); \}\}/);
  assert.match(facts, /\}, \[weeklyGoalWeekKey, sessionProvider, readOnly, studentId, studentRecord\?\.classId, studentProfile\?\.classId, weeklyRefreshKey, evidenceEvents, liveWeek\]\);/);
});
