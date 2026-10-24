// OP02: after each Hosting deploy the release loads the live site and fails
// when it does not start cleanly (scripts/check-live-site.mjs). The decision
// is pure and pinned here; the release wiring is read from source.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { liveSiteStartupVerdict } from '../../scripts/lib/liveSiteStartup.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const clean = { status: 200, bootFallbackGone: true, recoveryShown: false, pageErrors: [], failedAssets: [] };

test('a page that answered, replaced its boot screen and threw nothing started cleanly', () => {
  assert.deepEqual(liveSiteStartupVerdict(clean), { ok: true, problems: [] });
  assert.equal(liveSiteStartupVerdict({ ...clean, servedSha: 'abc123def456', expectedSha: 'abc123def456789' }).ok, true, 'a short and a full sha of one commit agree');
});

test('every way the start can fail is named', () => {
  const failing = (overrides) => liveSiteStartupVerdict({ ...clean, ...overrides });
  assert.match(failing({ status: 503 }).problems[0], /HTTP 503/);
  assert.match(failing({ status: null }).problems[0], /HTTP nothing/);
  assert.match(failing({ bootFallbackGone: false }).problems[0], /never replaced "Opening MathMaster…"/);
  // The recovery card says more than the stuck boot screen, so it is the one named.
  assert.deepEqual(failing({ bootFallbackGone: false, recoveryShown: true }).problems, ['the page showed "MathMaster did not finish loading"']);
  assert.match(failing({ pageErrors: ['TypeError: x is undefined'] }).problems[0], /uncaught error: TypeError/);
  assert.match(failing({ failedAssets: [{ url: 'https://x.web.app/assets/index-1.js', status: 404 }] }).problems[0], /asset failed \(404\)/);
  assert.match(failing({ servedSha: 'aaa111', expectedSha: 'bbb222' }).problems[0], /the served build is aaa111, not bbb222/);
  assert.match(failing({ servedSha: null, expectedSha: 'bbb222' }).problems[0], /unreadable/);
  // A storm of errors is summarised, not pasted.
  assert.equal(failing({ pageErrors: Array.from({ length: 20 }, (_, n) => `e${n}`) }).problems.length, 5);
});

test('the release runs it after Hosting, records it, and fails on it', () => {
  const release = executableSource(readFileSync('scripts/release-firebase.mjs', 'utf8'));
  assert.match(release, /const hostingReleased = outcome\.ok && steps\.some\(\(step\) => step\.target === RELEASE_TARGETS\.HOSTING\);/);
  assert.match(release, /spawnSync\('node', \['scripts\/check-live-site\.mjs', '--project', PROJECT, '--expect-sha', headFull\]/);
  assert.match(release, /\n  liveSite,\n/, 'the report keeps the result');
  assert.match(release, /process\.exit\(outcome\.ok && liveSite\.status !== 'failed' \? 0 : 1\);/);
  // Read-only: the check script writes and signs in to nothing.
  const check = executableSource(readFileSync('scripts/check-live-site.mjs', 'utf8'));
  assert.doesNotMatch(check, /writeFile|signIn|firestore|deploy/i);
});
