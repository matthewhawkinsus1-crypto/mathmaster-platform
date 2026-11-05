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

/*
 * REVIEW MY WORK: A PANEL OF THE RESULT PAGE, WITH A BOUNDARY OF ITS OWN.
 *
 * The result page draws Review My Work once the work is closed and its
 * feedback released: App's own chunk, about 1 MB with MathLive, which Home
 * does not prefetch. Offline before it had loaded, its failure reached the
 * result screen's boundary, and the whole page said "This screen could not
 * load". It is a `studentPanel` of lazyScreens.js now: its place in the page
 * holds a boundary of its own, which says in that place that Review My Work
 * needs a connection, with Try again, and the rest of the page stays. The
 * browser half (a real import that cannot arrive, offline and back, at both
 * sizes) is tests/browser/reviewMyWork.mjs.
 */
const PANEL_TITLE = 'Review My Work needs a connection';
const reviewProps = () => ({ assignment: { id: 'asg-1' }, load: async () => ({ questions: [] }), studentProfile: null, teacherAnswers: null });

test('Review My Work has a place of its own, holding its own boundary around one visit, with App\'s props passed through', () => {
  const props = reviewProps();
  const place = screens.ReviewMyWork(props);
  assert.equal(place.type, 'div');
  assert.equal(place.props['data-student-panel'], 'review-my-work');
  const boundary = place.props.children;
  assert.equal(boundary.type, ScreenErrorBoundary, 'a boundary of its own, inside the result screen\'s');
  assert.equal(boundary.props.codeTitle, PANEL_TITLE);
  assert.equal(boundary.props.source, 'review-my-work');
  // No way out of its own: the result page around it keeps every way on.
  assert.equal(boundary.props.exitLabel, undefined);
  assert.equal(boundary.props.onExit, undefined);
  // Its own loader's answer (retryableChunk.js): a failure it did not hand
  // out needs a new page.
  assert.equal(boundary.props.retryChunk(failedChunk()), CHUNK_RETRY.RELOAD);
  assert.deepEqual(boundary.props.children.props, props, 'one visit to the panel, with exactly App\'s props');
});

test('while its code is on its way, Review My Work\'s place says so: the result page around it is not held up', async () => {
  // Offline, so the loader asks for nothing (retryableChunk.js) and the code
  // stays away: this draws the place as it is while the code would be on its way.
  const page = await freshPage('panel-loading');
  Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, get: () => false });
  try {
    const markup = renderToStaticMarkup(createElement(page.ReviewMyWork, reviewProps()));
    assert.equal(markup, '<div data-student-panel="review-my-work" style="min-width:0"><p role="status" style="margin:14px 0 0">Loading your work…</p></div>');
  } finally {
    delete globalThis.navigator.onLine;
  }
});

// The panel's boundary as the place mounts it, driven by hand.
const panelBoundary = (retry) => {
  const boundary = new ScreenErrorBoundary({ source: 'review-my-work', retryChunk: retry, codeTitle: PANEL_TITLE, children: 'the panel' });
  boundary.setState = (next) => { boundary.state = { ...boundary.state, ...next }; };
  return boundary;
};
const offlineRefusal = () => Object.assign(new Error('This device is offline, so the screen was not requested.'), { mmChunkLoad: true });

test('Review My Work\'s code cannot arrive: its own place says it needs a connection, with Try again and nothing else', () => {
  const boundary = panelBoundary(() => CHUNK_RETRY.LOAD);
  assert.equal(boundary.render(), 'the panel');
  fail(boundary, offlineRefusal());
  const markup = renderToStaticMarkup(boundary.render());
  // In the page's flow, not the screen's padded place, and as wide as the
  // panel it stands for, not a screen's message centred in it.
  assert.match(markup, /^<div data-screen-code-failed="panel" style="margin-top:14px"><section role="alert"[^>]* style="box-sizing:border-box;width:100%;max-width:none;margin:0;/);
  assert.match(markup, /<h2[^>]*>Review My Work needs a connection<\/h2>/);
  assert.doesNotMatch(markup, /This screen could not load/, 'the screen did load: only the panel did not');
  assert.match(markup, /Check that this device is connected to the internet, then try again\./);
  assert.deepEqual([...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1]), ['Try again'], 'no "Back to Home": the page keeps its own ways on');
  // A screen's own boundary keeps its words and its place.
  const screen = studentScreenBoundary(() => CHUNK_RETRY.LOAD);
  fail(screen, offlineRefusal());
  assert.match(renderToStaticMarkup(screen.render()), /^<div data-screen-code-failed="screen" style="padding:20px 14px 48px"><section role="alert"[^>]* style="box-sizing:border-box;width:100%;max-width:640px;margin:0 auto;[\s\S]*<h2[^>]*>This screen could not load<\/h2>/);
});

test('Review My Work\'s Try again: still offline it says so; back online it asks again; after a failed request, a new page', () => {
  let next = CHUNK_RETRY.OFFLINE;
  const asked = [];
  const boundary = panelBoundary((error) => { asked.push(error); return next; });
  const refusal = offlineRefusal();
  fail(boundary, refusal);
  boundary.render().props.children.props.onPrimary();
  assert.deepEqual(asked, [refusal], 'its loader is told what failed');
  assert.ok(boundary.state.error, 'nothing would arrive: the message stays');
  assert.match(renderToStaticMarkup(boundary.render()), /<h2[^>]*>Review My Work needs a connection<\/h2>[\s\S]*This device is still offline\. Connect it to the internet, then try again\./);
  next = CHUNK_RETRY.LOAD;
  boundary.render().props.children.props.onPrimary();
  assert.equal(boundary.render(), 'the panel', 'a new visit, with a lazy of its own');
  const replaced = [];
  globalThis.window = {
    location: { href: 'https://mathmaster.example/?view=assignmentResult', replace: (url) => replaced.push(url) },
    sessionStorage: { getItem: () => null, setItem: () => {} },
  };
  try {
    next = CHUNK_RETRY.RELOAD;
    fail(boundary, failedChunk());
    boundary.render().props.children.props.onPrimary();
    assert.equal(replaced.length, 1, 'the browser will not fetch that code again in this page');
  } finally {
    delete globalThis.window;
  }
});

test('any other error in Review My Work still goes on, as before it had a boundary of its own', () => {
  const boundary = panelBoundary(() => CHUNK_RETRY.LOAD);
  fail(boundary, new TypeError("Cannot read properties of undefined (reading 'questions')"));
  assert.throws(() => boundary.render(), /reading 'questions'/);
});
