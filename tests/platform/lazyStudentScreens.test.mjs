// PF01: GRADES, ASSIGNMENTS, REWARDS AND THE RESULT PAGE LOAD ON DEMAND,
// AND A STUDENT IS NEVER LEFT WITH A BLANK SCREEN.
//
// The four screens left the first load (firstLoadStudentScreens.test.mjs) and
// are fetched while Home is idle (studentScreenPrefetch.test.mjs). Each is a
// `studentScreen` of src/app/lazyScreens.js, which App renders with the same
// JSX as before. Rendered here through Vite (node cannot import .jsx):
//
//   - before its code is here: a calm "Opening …" status in the screen's
//     place, marked busy, the screen's full height (no jump when it lands);
//   - once it is here (after Home's prefetch): exactly the screen, at once;
//   - code that cannot load: a short message, Try again and the way Home in
//     the screen's place (ScreenErrorBoundary), never AppErrorBoundary's
//     app-wide panel; Try again does what src/platform/runtime/retryableChunk.js
//     says can work: ask again, load the page again, or say it is still offline.
//
// Node cannot fail a real import under React's lazy and Suspense, so the rest
// was checked by hand in Chromium, on a production build of the App harness
// (tests/browser/teacherWorkflow), offline and back: a failed load reaches the
// boundary, Try again mounts a fresh visit with a lazy of its own (React.lazy
// keeps a rejected import), and after Home's prefetch each screen opens offline.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { buildScreens } from './fixtures/studentTodayScreens.mjs';
import { CHUNK_RETRY } from '../../src/platform/runtime/retryableChunk.js';
import { CHUNK_RELOAD_GUARD_KEY } from '../../src/platform/runtime/chunkLoadRecovery.js';

const SCREENS = {
  StudentGradeCenter: { file: '/src/components/student/StudentGradeCenter.jsx', opening: 'Opening your grades…' },
  StudentAssignmentsCenter: { file: '/src/components/student/StudentAssignmentsCenter.jsx', opening: 'Opening your assignments…' },
  StudentRewardsCenter: { file: '/src/components/student/rewards/StudentRewardsCenter.jsx', opening: 'Opening your rewards…' },
  StudentAssignmentResult: { file: '/src/components/student/StudentAssignmentResult.jsx', opening: 'Opening your result…' },
};

let server;
let screens;
let ScreenErrorBoundary;
test.before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  screens = await server.ssrLoadModule('/src/app/lazyScreens.js');
  ({ default: ScreenErrorBoundary } = await server.ssrLoadModule('/src/components/common/ScreenErrorBoundary.jsx'));
});
test.after(async () => {
  await server?.close();
});

// A page of its own: lazyScreens.js evaluated afresh (the query makes it a
// module of its own; what it imports is shared), so none of its screens has
// been drawn or fetched yet. Drawing a screen starts its import (React calls
// the lazy's loader), so a screen drawn by another test may already be here.
const freshPage = (name) => server.ssrLoadModule(`/src/app/lazyScreens.js?${name}`);

test('before its code is here, each screen shows a calm, busy "Opening …" in its place, at the screen\'s height', async () => {
  const page = await freshPage('opening');
  for (const [name, { opening }] of Object.entries(SCREENS)) {
    const markup = renderToStaticMarkup(createElement(page[name], {}));
    const frame = markup.match(/^<div aria-busy="true" data-student-screen-opening="" style="([^"]*)"><p role="status"[^>]*>([^<]*)<\/p><\/div>$/);
    assert.ok(frame, `${name}: ${markup.slice(0, 200)}`);
    assert.equal(frame[2], opening);
    assert.match(frame[1], /min-height:100vh/, 'the screen area keeps its height while the code arrives');
  }
});

test('once Home\'s prefetch has fetched its code, a screen draws at once, exactly as the screen itself', async () => {
  // Nothing drawn before the prefetch: only prefetch() can have fetched it.
  const page = await freshPage('prefetched');
  const { buildRewardWallet } = await server.ssrLoadModule('/src/platform/rewards/rewardWallet.js');
  const week = buildScreens();
  const props = {
    StudentGradeCenter: { gradeCenter: week.gradeCenter },
    StudentAssignmentsCenter: { dashboard: week.dashboard, gradeCenter: week.gradeCenter },
    StudentRewardsCenter: { student: { firstName: 'Ada' }, wallet: buildRewardWallet({}), classPoints: null, classRewards: null, nowMs: 0 },
    StudentAssignmentResult: { entry: week.gradeEntryOf('finished'), todayEntry: week.todayEntryOf('finished'), upNext: week.upNextAfter('finished'), nowValue: 0 },
  };
  for (const [name, { file, opening }] of Object.entries(SCREENS)) {
    await page[name].prefetch();
    const { default: Screen } = await server.ssrLoadModule(file);
    const markup = renderToStaticMarkup(createElement(page[name], props[name]));
    assert.doesNotMatch(markup, new RegExp(`aria-busy="true"|${opening}`), `${name} still shows its loading state`);
    assert.match(markup, /<h1[^>]*>[^<]+<\/h1>/);
    // Nothing of the wrapper reaches the page: the same screen as a static import drew.
    assert.equal(markup, renderToStaticMarkup(createElement(Screen, props[name])), `${name} draws differently through lazyScreens.js`);
  }
});

test('each screen wraps itself in its own boundary, with its retry and its way Home, and passes every prop through', () => {
  const went = [];
  const props = { onNavigate: (to) => went.push(to), gradeCenter: { periodGroups: [] }, onLogout: () => {} };
  for (const name of ['StudentGradeCenter', 'StudentAssignmentsCenter', 'StudentRewardsCenter']) {
    const boundary = screens[name](props);
    assert.equal(boundary.type, ScreenErrorBoundary, `${name} has its own boundary`);
    // Its own loader's answer: a failure that is not its code's (something
    // the screen loads itself) needs a new page (retryableChunk.test.mjs).
    assert.equal(boundary.props.retryChunk(failedChunk()), CHUNK_RETRY.RELOAD);
    assert.equal(boundary.props.exitLabel, 'Back to Home');
    boundary.props.onExit();
    // Inside it, one visit to the screen, with exactly App's props.
    const visit = boundary.props.children;
    assert.deepEqual(visit.props, props, `${name} passes App's props through unchanged`);
  }
  assert.deepEqual(went, ['home', 'home', 'home'], 'Grades, Assignments and Rewards go Home through their own nav');
  // The result page has no nav: its own "Back to Home".
  const backToHome = () => {};
  assert.equal(screens.StudentAssignmentResult({ onBackToHome: backToHome }).props.onExit, backToHome);
});

// The boundary as a screen mounts it, driven by hand (as RC09's test does).
const studentScreenBoundary = (retry, { onExit = () => {} } = {}) => {
  const boundary = new ScreenErrorBoundary({ source: 'student-screen', retryChunk: retry, exitLabel: 'Back to Home', onExit, children: 'the screen' });
  boundary.setState = (next) => { boundary.state = { ...boundary.state, ...next }; };
  return boundary;
};
const failedChunk = () => new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/StudentGradeCenter-abc.js');
const fail = (boundary, error) => { boundary.state = { ...boundary.state, ...ScreenErrorBoundary.getDerivedStateFromError(error) }; };

test('code that cannot load: a short message, Try again and the way Home, in the screen\'s place', () => {
  let exited = 0;
  const boundary = studentScreenBoundary(() => CHUNK_RETRY.LOAD, { onExit: () => { exited += 1; } });
  assert.equal(boundary.render(), 'the screen');
  fail(boundary, failedChunk());
  // Not thrown on to AppErrorBoundary, whose panel replaces the whole app.
  const shown = boundary.render();
  const markup = renderToStaticMarkup(shown);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /<h2[^>]*>This screen could not load<\/h2>/);
  assert.match(markup, /Check that this device is connected to the internet, then try again\./);
  assert.deepEqual([...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1]), ['Try again', 'Back to Home']);
  assert.doesNotMatch(markup, /Failed to fetch|StudentGradeCenter-abc/, 'no technical message on the student\'s screen');
  const panel = shown.props.children;
  panel.props.onSecondary();
  assert.equal(exited, 1, 'Back to Home goes Home');
});

test('Try again asks again when nothing failed that the browser remembers: the screen mounts afresh', () => {
  const asked = [];
  const boundary = studentScreenBoundary((error) => { asked.push(error); return CHUNK_RETRY.LOAD; });
  const failure = failedChunk();
  fail(boundary, failure);
  boundary.render().props.children.props.onPrimary();
  assert.deepEqual(asked, [failure], 'what can work depends on what failed: the screen\'s own code, or something inside it');
  assert.equal(boundary.state.error, null);
  assert.equal(boundary.render(), 'the screen', 'its children render again: a new attempt, with a lazy of its own');
});

test('Try again while the device is still offline stays, and says so; online again, it asks again', () => {
  let next = CHUNK_RETRY.OFFLINE;
  const boundary = studentScreenBoundary(() => next);
  fail(boundary, failedChunk());
  boundary.render().props.children.props.onPrimary();
  assert.ok(boundary.state.error, 'nothing would arrive: the message stays');
  assert.match(renderToStaticMarkup(boundary.render()), /This device is still offline\. Connect it to the internet, then try again\./);
  next = CHUNK_RETRY.LOAD;
  boundary.render().props.children.props.onPrimary();
  assert.equal(boundary.render(), 'the screen');
  // A later failure starts from the plain message again.
  fail(boundary, failedChunk());
  assert.match(renderToStaticMarkup(boundary.render()), /Check that this device is connected/);
});

test('Try again after a request failed in this page loads the page again, at the same address', () => {
  const values = new Map();
  const replaced = [];
  globalThis.window = {
    location: { href: 'https://mathmaster.example/grades', replace: (url) => replaced.push(url) },
    sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) },
  };
  try {
    const boundary = studentScreenBoundary(() => CHUNK_RETRY.RELOAD);
    fail(boundary, failedChunk());
    boundary.render().props.children.props.onPrimary();
    assert.equal(replaced.length, 1, 'the browser will not fetch that code again in this page');
    const url = new URL(replaced[0]);
    assert.equal(url.pathname, '/grades', 'the student comes back to the screen they asked for');
    assert.ok(url.searchParams.has('_mm_reload'));
    assert.ok(values.has(CHUNK_RELOAD_GUARD_KEY));
  } finally {
    delete globalThis.window;
  }
});

test('any other error in a student screen still goes on to AppErrorBoundary, as before it loaded on demand', () => {
  const boundary = studentScreenBoundary(() => CHUNK_RETRY.LOAD);
  fail(boundary, new TypeError("Cannot read properties of undefined (reading 'map')"));
  assert.throws(() => boundary.render(), /reading 'map'/);
});

test('the device\'s report keeps each failure once: the screen\'s own code here, anything it passes on there', async () => {
  const { readClientDiagnostics } = await server.ssrLoadModule('/src/platform/runtime/clientDiagnostics.js');
  const values = new Map();
  globalThis.window = {
    location: { pathname: '/grades' },
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) },
  };
  try {
    const boundary = studentScreenBoundary(() => CHUNK_RETRY.LOAD);
    boundary.componentDidCatch(failedChunk(), {});
    // Thrown on in render: AppErrorBoundary records it, as it always did.
    boundary.componentDidCatch(new TypeError("Cannot read properties of undefined (reading 'map')"), {});
    assert.deepEqual(readClientDiagnostics().map(({ kind, source }) => [kind, source]), [['chunk-load', 'student-screen']]);
  } finally {
    delete globalThis.window;
  }
});
