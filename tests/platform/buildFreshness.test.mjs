import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BUILD_FRESHNESS_STATUS,
  CANONICAL_ORIGIN,
  compareRunningBuild,
} from '../../src/platform/runtime/buildFreshness.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// A TAB THAT NEVER RECEIVED THE DEPLOY (Job 1 root cause, client side).
//
// A deploy reaches a browser only on reload. A Chromebook left on an
// assignment keeps yesterday's bundle, so a shipped fix "disappears" for that
// student; the retired Vercel copy never receives a Firebase deploy at all.

const running = { gitSha: '14625bd70298', builtAt: '2026-09-24T16:17:00Z' };

test('the same commit is current; a different served commit is a newer build', () => {
  assert.equal(compareRunningBuild({ running, live: { gitSha: '14625bd70298' }, hostname: 'mathmaster-aleks.web.app' }).status, BUILD_FRESHNESS_STATUS.CURRENT);
  const newer = compareRunningBuild({ running, live: { gitSha: '2f9de415aad6' }, hostname: 'mathmaster-aleks.web.app' });
  assert.equal(newer.status, BUILD_FRESHNESS_STATUS.NEWER_BUILD_AVAILABLE);
  assert.equal(newer.liveSha, '2f9de41');
  assert.match(newer.message, /updated/i);
});

test('a short and a full sha of the same commit are the same build', () => {
  assert.equal(compareRunningBuild({ running: { gitSha: '14625bd' }, live: { gitSha: '14625bd70298' } }).status, BUILD_FRESHNESS_STATUS.CURRENT);
});

test('a build with no sha (dev server, test harness) or no manifest says nothing', () => {
  assert.equal(compareRunningBuild({ running: { gitSha: 'unknown' }, live: { gitSha: 'abc' } }).status, BUILD_FRESHNESS_STATUS.UNKNOWN);
  assert.equal(compareRunningBuild({ running, live: null }).status, BUILD_FRESHNESS_STATUS.UNKNOWN);
});

test('the retired Vercel copy is flagged whatever it is running', () => {
  const retired = compareRunningBuild({ running, live: { gitSha: '14625bd70298' }, hostname: 'mathmaster-platform.vercel.app' });
  assert.equal(retired.status, BUILD_FRESHNESS_STATUS.RETIRED_HOST);
  assert.equal(retired.canonicalOrigin, CANONICAL_ORIGIN);
});

test('the notice is mounted at the app root and never reloads on its own', () => {
  const main = fs.readFileSync('src/main.jsx', 'utf8');
  assert.match(main, /import BuildFreshnessNotice from '\.\/components\/common\/BuildFreshnessNotice\.jsx'/);
  assert.match(region(main, 'createRoot(rootElement).render(', ');', 'the root render'), /<BuildFreshnessNotice \/>/);

  const hook = fs.readFileSync('src/platform/runtime/useBuildFreshness.js', 'utf8');
  assert.match(hook, /addEventListener\('vite:preloadError', onPreloadError\)/, 'a failed lazy chunk triggers an immediate check');
  assert.match(hook, /removeEventListener\('vite:preloadError', onPreloadError\)/, 'and the listener is cleaned up');
  assert.match(hook, /window\.clearInterval\(timer\)/);
  assert.match(hook, /cache: 'no-store'/);
  assert.doesNotMatch(executableSource(hook), /location\.reload/, 'the hook must never reload a student mid-step');

  const notice = fs.readFileSync('src/components/common/BuildFreshnessNotice.jsx', 'utf8');
  const reloadButton = region(notice, 'onClick={() => window.location.reload()}', '</button>', 'the reload button');
  assert.match(reloadButton, /Reload/, 'reload happens only when the person presses Reload');
  assert.match(notice, /role="status"/);
});
