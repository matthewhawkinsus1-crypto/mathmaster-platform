// A TAB THAT OUTLIVED A DEPLOY, AND WHAT IT TELLS THE STUDENT.
//
// Firebase Hosting serves one release; with the SPA rewrite an old chunk comes
// back as index.html, so a long-open tab's next lazy import fails. These pin
// that every browser's spelling of that failure is recognised, that the reload
// it triggers cannot loop, that both boundaries route it to "updated" rather
// than "broken question" / "could not start", that offline AppErrorBoundary
// says to check the connection and does not reload into the browser's own
// error page, and that the client diagnostic log keeps nothing identifying.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import {
  CHUNK_RELOAD_COOLDOWN_MS,
  CHUNK_RELOAD_GUARD_KEY,
  isChunkLoadError,
  recentlyReloadedForChunk,
  reloadForCurrentBuild,
} from '../../src/platform/runtime/chunkLoadRecovery.js';
import { executableSource } from './helpers/sourceContract.mjs';

const memoryStore = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

test('every browser spelling of a failed chunk is recognised', () => {
  const messages = [
    'Failed to fetch dynamically imported module: https://mathmaster-aleks.web.app/assets/SystemsWorkspace-CRcqz1cn.js', // Chrome
    'error loading dynamically imported module: https://mathmaster-aleks.web.app/assets/Graphing2-x.js', // Firefox
    'Importing a module script failed.', // Safari
    "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\".",
    'Unable to preload CSS for /assets/EnlargeableFigure-Cboe2swI.css', // Vite
  ];
  for (const message of messages) assert.ok(isChunkLoadError(new TypeError(message)), message);
  const named = new Error('x');
  named.name = 'ChunkLoadError';
  assert.ok(isChunkLoadError(named));
});

test('an ordinary runtime error is not mistaken for a stale tab', () => {
  for (const message of [
    "Cannot read properties of undefined (reading 'map')",
    'activeSkillCode is not defined',
    'Maximum update depth exceeded.',
    'Network request failed',
  ]) assert.equal(isChunkLoadError(new TypeError(message)), false, message);
  assert.equal(isChunkLoadError(null), false);
});

test('reloading for the current build busts the shell cache and cannot loop', () => {
  const store = memoryStore();
  const replaced = [];
  const location = { href: 'https://mathmaster-aleks.web.app/?assignment=abc', replace: (url) => replaced.push(url) };
  assert.equal(recentlyReloadedForChunk({ store, now: 1_000_000 }), false);
  reloadForCurrentBuild({ store, location, now: 1_000_000 });
  assert.equal(replaced.length, 1);
  const url = new URL(replaced[0]);
  assert.equal(url.searchParams.get('_mm_reload'), '1000000');
  assert.equal(url.searchParams.get('assignment'), 'abc', 'the screen the student was on is kept');
  assert.equal(store.getItem(CHUNK_RELOAD_GUARD_KEY), '1000000');
  // The same failure straight after that reload is not a stale tab: the panel
  // must offer "Try again", not reload on its own again.
  assert.equal(recentlyReloadedForChunk({ store, now: 1_000_000 + 5_000 }), true);
  assert.equal(recentlyReloadedForChunk({ store, now: 1_000_000 + CHUNK_RELOAD_COOLDOWN_MS + 1 }), false);
});

test('both boundaries route a failed chunk to the update panel, never to "broken question"', () => {
  const question = executableSource(readFileSync(new URL('../../src/QuestionModuleBoundary.jsx', import.meta.url), 'utf8'));
  const chunkBranch = question.indexOf('if (isChunkLoadError(this.state.error))');
  const contentBlame = question.indexOf('Something in how this question was set up');
  assert.ok(chunkBranch > 0 && contentBlame > chunkBranch, 'the stale-tab case returns before the content-error message');
  assert.match(question, /reloadForCurrentBuild\(\)/);

  const app = executableSource(readFileSync(new URL('../../src/components/common/AppErrorBoundary.jsx', import.meta.url), 'utf8'));
  assert.match(app, /const chunk = isChunkLoadError\(error\)/);
  // The update panel's button reloads for the current build, unless the
  // device is offline (rendered below).
  assert.match(app, /const reload = \(\) => \{ if \(!offline\(\)\) reloadForCurrentBuild\(\); \};/);
  assert.match(app, /chunk && !reloadedRecently && !offline\(\)[\s\S]*?MathMaster was just updated[\s\S]*?onPrimary=\{reload\}/);
  assert.doesNotMatch(app, /error\?\.stack/, 'no stack trace on a student\'s screen');
  const main = readFileSync(new URL('../../src/main.jsx', import.meta.url), 'utf8');
  assert.match(main, /import AppErrorBoundary from '\.\/components\/common\/AppErrorBoundary\.jsx';/);
  assert.match(main, /<AppErrorBoundary>/);
  assert.match(main, /installClientDiagnostics\(window\)/);
});

// Offline, code that did not load is the connection, not an update, and a
// reload would trade MathMaster for the browser's own error page. A teacher's
// panels opened offline wait for the connection (app/teacher/onDemandCode.js);
// what still reaches AppErrorBoundary offline (a teacher screen's chunk, the
// authoring code) gets the connection panel, whose button reloads only once
// the device is back online, as a student screen's Try again does
// (retryableChunk.js). teacherCodeRecovery.mjs C10 drives it in the real App.
test('offline, AppErrorBoundary says to check the connection and reloads only once the device is back online', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const was = { window: globalThis.window, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') };
  try {
    const { default: AppErrorBoundary } = await server.ssrLoadModule('/src/components/common/AppErrorBoundary.jsx');
    const failed = new TypeError('Failed to fetch dynamically imported module: https://example.test/assets/ClassesWorkspace-abc.js');
    const device = { onLine: true };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, get: () => device });
    const replaced = [];
    const stored = new Map();
    globalThis.window = {
      location: { href: 'https://example.test/', replace: (url) => replaced.push(url) },
      sessionStorage: { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) },
    };
    const failedIn = () => {
      const boundary = new AppErrorBoundary({ children: 'the app' });
      boundary.state = { ...boundary.state, ...AppErrorBoundary.getDerivedStateFromError(failed) };
      return boundary.render();
    };
    // Online, the failure is a tab that outlived a deploy, as before.
    assert.match(renderToStaticMarkup(failedIn()), /MathMaster was just updated/);
    device.onLine = false;
    const shown = failedIn();
    const markup = renderToStaticMarkup(shown);
    assert.match(markup, /MathMaster could not load this screen/);
    assert.match(markup, /Check that this device is connected to the internet, then try again\./);
    assert.doesNotMatch(markup, /was just updated/);
    const panel = shown.props.children;
    panel.props.onPrimary();
    assert.equal(replaced.length, 0, 'no reload while the device is offline');
    device.onLine = true;
    panel.props.onPrimary();
    assert.equal(replaced.length, 1, 'back online, its button loads the page again');
    assert.match(replaced[0], /_mm_reload=/);
  } finally {
    globalThis.window = was.window;
    if (was.navigator) Object.defineProperty(globalThis, 'navigator', was.navigator);
    await server.close();
  }
});

test('the client diagnostic log keeps no email, id, query string or long message', async () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (values.has(key) ? values.get(key) : null),
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
    location: { pathname: '/student/jane.doe@school.org/assignments' },
  };
  try {
    const diagnostics = await import('../../src/platform/runtime/clientDiagnostics.js');
    diagnostics.clearClientDiagnostics();
    const entry = diagnostics.recordClientDiagnostic({
      kind: 'render-error',
      source: 'app',
      message: `Failed for student 4417829931 (jane.doe@school.org) at https://x.web.app/a?token=SECRET ${'x'.repeat(400)}`,
    });
    assert.doesNotMatch(JSON.stringify(entry), /jane\.doe|4417829931|SECRET|token=/);
    assert.ok(entry.message.length <= 240);
    assert.match(entry.screen, /\[email\]/);
    for (let index = 0; index < 40; index += 1) diagnostics.recordClientDiagnostic({ kind: 'render-error', message: `n${index}` });
    assert.equal(diagnostics.readClientDiagnostics().length, diagnostics.CLIENT_DIAGNOSTICS_LIMIT);
    const report = diagnostics.formatClientDiagnostics();
    assert.match(report, /^MathMaster build /);
    assert.match(report, /n39/);
  } finally {
    delete globalThis.window;
  }
});
