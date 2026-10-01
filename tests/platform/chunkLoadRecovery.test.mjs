// A TAB THAT OUTLIVED A DEPLOY, AND WHAT IT TELLS THE STUDENT.
//
// Firebase Hosting serves one release; with the SPA rewrite an old chunk comes
// back as index.html, so a long-open tab's next lazy import fails. These pin
// that every browser's spelling of that failure is recognised, that the reload
// it triggers cannot loop, that both boundaries route it to "updated" rather
// than "broken question" / "could not start", and that the client diagnostic
// log keeps nothing identifying.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.match(app, /chunk && !reloadedRecently[\s\S]*?MathMaster was just updated[\s\S]*?onPrimary=\{\(\) => reloadForCurrentBuild\(\)\}/);
  assert.doesNotMatch(app, /error\?\.stack/, 'no stack trace on a student\'s screen');
  const main = readFileSync(new URL('../../src/main.jsx', import.meta.url), 'utf8');
  assert.match(main, /import AppErrorBoundary from '\.\/components\/common\/AppErrorBoundary\.jsx';/);
  assert.match(main, /<AppErrorBoundary>/);
  assert.match(main, /installClientDiagnostics\(window\)/);
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
