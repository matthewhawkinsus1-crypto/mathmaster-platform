import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  WARMUP_CHALLENGE_ROUTE,
  resolveWarmupChallenge,
  shouldShowWarmupWaitingPanel,
} from '../../src/platform/liveChallenge/warmupChallengeLink.js';

// The browser harness (tests/browser/warmupChallengeRender.mjs) records what it
// found into this fixture. Asserting it is empty here means a rendering
// regression fails the normal suite, without every run needing a browser.
test('the Warm-Up challenge renders clean in a real browser', () => {
  const findings = JSON.parse(readFileSync(
    new URL('./fixtures/warmupChallengeRenderFindings.json', import.meta.url),
    'utf8',
  ));
  assert.deepEqual(findings, [], `render check found problems:\n${JSON.stringify(findings, null, 2)}`);
});

/* ---------- the contradiction the browser check exposed ---------- */

const challengeAssignment = {
  id: 'assignment-a',
  warmup: { enabled: true, liveChallenge: { enabled: true } },
};
const activeWarmup = { enabled: true, status: 'active' };

const decisionFor = (invite) => resolveWarmupChallenge({
  assignment: challengeAssignment,
  assignmentId: 'assignment-a',
  warmupState: activeWarmup,
  invite,
});

test('a student is never told to stay put and to join at the same time', () => {
  // A standalone challenge is running. The banner offers it. The waiting panel
  // must not simultaneously say "stay on this screen".
  const invite = { roomId: 'r1', status: 'running' };
  const decision = decisionFor(invite);
  assert.equal(decision.route, WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER);
  assert.equal(shouldShowWarmupWaitingPanel({ decision, invite }), false);
});

test('the same applies to a live game belonging to another assignment', () => {
  const invite = { roomId: 'r1', status: 'running', assignmentId: 'assignment-b' };
  assert.equal(shouldShowWarmupWaitingPanel({ decision: decisionFor(invite), invite }), false);
});

test('with no competing game the waiting panel is shown', () => {
  const decision = decisionFor(null);
  assert.equal(decision.route, WARMUP_CHALLENGE_ROUTE.WAITING_FOR_TEACHER);
  assert.equal(shouldShowWarmupWaitingPanel({ decision, invite: null }), true);
});

test('a room still in the lobby does not suppress the panel', () => {
  // An invited-but-not-started room raises no banner, so there is no conflict.
  const invite = { roomId: 'r1', status: 'invited' };
  assert.equal(shouldShowWarmupWaitingPanel({ decision: decisionFor(invite), invite }), true);
});

test('the panel never shows on any other route', () => {
  for (const route of ['none', 'play', 'continue']) {
    assert.equal(shouldShowWarmupWaitingPanel({ decision: { route }, invite: null }), false, route);
  }
  assert.equal(shouldShowWarmupWaitingPanel(), false);
});

test('App.jsx uses the rule rather than the raw route', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /shouldShowWarmupWaitingPanel\(\{ decision: warmupChallengeDecision, invite: liveChallengeInvite \}\)/);
});

test('the harness cannot reach anything but localhost', () => {
  // LiveChallengeStudent auto-joins on mount and this repo ships live Firebase
  // config, so an unblocked harness would call joinLiveChallenge against the
  // real project. That guarantee is enforced, not assumed.
  const runner = readFileSync(new URL('../browser/warmupChallengeRender.mjs', import.meta.url), 'utf8');
  assert.match(runner, /context\.route\('\*\*\/\*'/);
  assert.match(runner, /route\.abort\(\)/);
});
