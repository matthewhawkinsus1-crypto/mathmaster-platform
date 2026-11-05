// PF01: A STUDENT SCREEN'S CODE THAT "TRY AGAIN" CAN REALLY ASK FOR AGAIN.
//
// Grades, Assignments, Rewards and an assignment's result load on demand
// (src/app/lazyScreens.js), so their code can fail to arrive: the Chromebook
// went offline before Home's prefetch, or a deploy replaced the chunk. Two
// things remember that failure. React.lazy does (each attempt mounts a lazy of
// its own, lazyScreens.js), and so does the browser, for the life of the page:
// in Chromium the same import() fails again with no request, even back online.
// So the loader (src/platform/runtime/retryableChunk.js) never asks while the
// device is offline, and once a request has failed Try again loads the page
// again. The screen's boundary hands `retry()` the failure it caught and does
// what it says (lazyStudentScreens.test.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { CHUNK_RETRY, retryableChunk } from '../../src/platform/runtime/retryableChunk.js';
import { isChunkLoadError } from '../../src/platform/runtime/chunkLoadRecovery.js';

// A screen's `() => import(…)` that the test answers by hand.
const fakeImport = () => {
  const requests = [];
  const load = () => new Promise((resolve, reject) => { requests.push({ resolve, reject }); });
  return { load, requests };
};
const gradesModule = () => ({ default: function StudentGradeCenter() { return null; } });
const failedFetch = (name) => new TypeError(`Failed to fetch dynamically imported module: https://example.test/assets/${name}-abc.js`);

test('one request, shared by Home\'s prefetch and the screen; once it is here, it is handed out at once', async () => {
  const screen = fakeImport();
  const chunk = retryableChunk(screen.load, { online: () => true });
  assert.equal(chunk.loaded(), null, 'nothing before it is asked for');
  const prefetch = chunk.load();
  const open = chunk.load();
  assert.equal(screen.requests.length, 1, 'a screen opened while the prefetch is on its way shares its request');
  const module = gradesModule();
  screen.requests[0].resolve(module);
  assert.equal(await prefetch, module);
  assert.equal(await open, module);
  assert.equal(chunk.loaded(), module, 'a screen opened after the prefetch draws at once');
  assert.equal(await chunk.load(), module);
  assert.equal(screen.requests.length, 1, 'and nothing is asked for again');
});

test('code the screen loads itself failed (a lazy panel of its own): a new page, once online', async () => {
  // The result page's Review My Work is App's own lazy panel: offline, its
  // chunk fails and reaches the result screen's boundary. React.lazy and the
  // browser both keep that failure, so mounting the screen again would fail
  // the same way: Try again loads the page again, once online.
  let online = true;
  const screen = fakeImport();
  const chunk = retryableChunk(screen.load, { online: () => online });
  const loading = chunk.load();
  screen.requests[0].resolve(gradesModule());
  await loading;
  const reviewMyWork = failedFetch('ReviewMyWork');
  assert.equal(chunk.retry(reviewMyWork), CHUNK_RETRY.RELOAD);
  online = false;
  assert.equal(chunk.retry(reviewMyWork), CHUNK_RETRY.OFFLINE);
});

test('offline, nothing is asked for, so the browser remembers no failure; back online, Try again really asks', async () => {
  let online = false;
  const screen = fakeImport();
  const chunk = retryableChunk(screen.load, { online: () => online });
  const refusal = chunk.load();
  assert.equal(screen.requests.length, 0, 'no request while the device is offline');
  const refused = await refusal.then(() => null, (error) => error);
  assert.ok(isChunkLoadError(refused), 'a chunk that could not load, which the screen\'s own boundary shows');
  assert.equal(chunk.retry(refused), CHUNK_RETRY.OFFLINE, 'still offline: Try again neither asks nor reloads');
  online = true;
  assert.equal(chunk.retry(refused), CHUNK_RETRY.LOAD, 'back online: ask again, in this page');
  const loading = chunk.load();
  assert.equal(screen.requests.length, 1, 'and it does ask');
  const module = gradesModule();
  screen.requests[0].resolve(module);
  assert.equal(await loading, module);
  assert.equal(chunk.loaded(), module);
});

test('refused offline, then fetched by Home\'s prefetch once back online: Try again draws the screen, no new page', async () => {
  let online = false;
  const screen = fakeImport();
  const chunk = retryableChunk(screen.load, { online: () => online });
  const refused = await chunk.load().then(() => null, (error) => error);
  online = true;
  // The prefetch was waiting for the device to come back (studentScreenPrefetch.js).
  const prefetch = chunk.load();
  screen.requests[0].resolve(gradesModule());
  await prefetch;
  assert.equal(chunk.retry(refused), CHUNK_RETRY.LOAD, 'its code is here: mount the screen again, which draws at once');
  assert.equal(screen.requests.length, 1);
});

test('once a request has failed in this page, Try again loads the page again, but never while offline', async () => {
  let online = true;
  const screen = fakeImport();
  const chunk = retryableChunk(screen.load, { online: () => online });
  const first = chunk.load();
  const failure = failedFetch('StudentGradeCenter');
  screen.requests[0].reject(failure);
  await assert.rejects(first, failure);
  assert.equal(chunk.loaded(), null);
  // The browser answers that URL with the same failure, without a request:
  // only a new page asks again (and a deploy's new chunk comes with it).
  assert.equal(chunk.retry(failure), CHUNK_RETRY.RELOAD);
  online = false;
  assert.equal(chunk.retry(failure), CHUNK_RETRY.OFFLINE, 'a reload offline would trade MathMaster for the browser\'s error page');
  online = true;
  // The failed request is forgotten: a screen mounted again asks again rather
  // than being handed the old rejection.
  const again = chunk.load();
  assert.equal(screen.requests.length, 2);
  const module = gradesModule();
  screen.requests[1].resolve(module);
  assert.equal(await again, module);
  // A browser that does ask again, and got it: the code is here, so Try again
  // draws the screen rather than loading the page.
  assert.equal(chunk.retry(failure), CHUNK_RETRY.LOAD);
});
