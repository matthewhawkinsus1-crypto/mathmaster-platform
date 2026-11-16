/*
 * THE DEVICE'S SIDE OF CRASH REPORTING (src/platform/runtime/crashReporter.js).
 *
 * What these protect:
 *   - nothing about a failure leaves until the server has said reporting is on;
 *   - with reporting off, a device asks at most once a day and keeps no queue;
 *   - what leaves is the closed bucket shape, never the diagnostic's message;
 *   - a crash loop is one small batch, and a day has a hard request cap;
 *   - none of this is on the first load or on a path a healthy session runs.
 * Synthetic values only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRASH_REPORT_STORAGE_KEY,
  FIRST_SEND_DELAY_MS,
  MAX_CALLS_PER_DAY,
  MODE_TTL_MS,
  createCrashReporter,
} from '../../src/platform/runtime/crashReporter.js';
import { CRASH_REPORT_LIMITS } from '../../functions/shared/crashReport.mjs';
import { componentSource, executableSource } from './helpers/sourceContract.mjs';

const harness = ({ mode = 'family', signedIn = true, fail = false } = {}) => {
  const data = new Map();
  const storage = { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)) };
  const state = { now: Date.parse('2026-11-16T15:00:00Z'), mode, signedIn, fail };
  const calls = [];
  const timers = [];
  const reporter = createCrashReporter({
    storage,
    now: () => state.now,
    transport: async (payload) => {
      if (!state.signedIn) return null;
      calls.push(JSON.parse(JSON.stringify(payload)));
      if (state.fail) throw new Error('unavailable');
      return { mode: state.mode, accepted: payload.buckets?.length || 0 };
    },
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimer: (id) => { timers[id - 1] = null; },
  });
  // Run the timers that are due, advancing the clock to each.
  const run = async () => {
    for (let guard = 0; guard < 50; guard += 1) {
      const index = timers.findIndex(Boolean);
      if (index < 0) return;
      const { fn, ms } = timers[index];
      timers[index] = null;
      state.now += ms;
      await fn();
    }
  };
  const stored = () => JSON.parse(data.get(CRASH_REPORT_STORAGE_KEY) || '{}');
  return { reporter, calls, timers, run, state, stored };
};

const crash = (overrides = {}) => ({
  kind: 'question-module-error', source: 'question', build: 'bad3df73a1b2',
  screen: '/assignments/abc123XYZassignment/warm-up/3',
  message: "TypeError: Cannot read properties of undefined (reading 'Quillfeather') for rowan.example@school.example 4417829931",
  family: 'radical-step', questionType: 'StepByStepAlgebra', assignmentId: 'abc123XYZassignment', questionId: 'lmr-wu-1',
  ...overrides,
});

test('the first request is an empty probe; the failure is sent only after the server says reporting is on', async () => {
  const { reporter, calls, run, timers } = harness({ mode: 'family' });
  assert.equal(reporter.reportCrash(crash()), true);
  assert.deepEqual(calls, [], 'nothing is sent synchronously');
  assert.equal(timers[0].ms, FIRST_SEND_DELAY_MS);
  await run();
  assert.deepEqual(calls[0], { probe: true }, 'the first request carries nothing about the failure');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].buckets, [{
    build: 'bad3df73a1b2', kind: 'question-module-error', source: 'question', screen: '/assignments/:id/:id/:id',
    family: 'radical-step', questionType: 'StepByStepAlgebra', signature: 'typeerror: cannot read properties of undefined (reading _) for _ #', count: 1,
  }]);
});

test('with reporting off the probe is all that leaves, the queue is dropped, and the device does not ask again for a day', async () => {
  const { reporter, calls, run, stored, state } = harness({ mode: 'off' });
  reporter.reportCrash(crash());
  await run();
  assert.deepEqual(calls, [{ probe: true }]);
  assert.deepEqual(stored().queue, {});
  for (let index = 0; index < 30; index += 1) assert.equal(reporter.reportCrash(crash({ family: `f${index}` })), false, 'not even queued');
  await run();
  assert.equal(calls.length, 1);
  assert.deepEqual(stored().queue, {});
  state.now += MODE_TTL_MS + 1;
  reporter.reportCrash(crash());
  await run();
  assert.deepEqual(calls, [{ probe: true }, { probe: true }], 'one more question a day later, and still nothing about the failure');
});

test('family mode drops the question; question mode names it by content id only', async () => {
  const family = harness({ mode: 'family' });
  family.reporter.reportCrash(crash());
  await family.run();
  assert.doesNotMatch(JSON.stringify(family.calls), /abc123XYZassignment|lmr-wu-1/);
  const question = harness({ mode: 'question' });
  question.reporter.reportCrash(crash());
  await question.run();
  assert.equal(question.calls[1].buckets[0].assignmentId, 'abc123XYZassignment');
  assert.equal(question.calls[1].buckets[0].questionId, 'lmr-wu-1');
});

test('nothing identifying is in any request, whatever the diagnostic held', async () => {
  for (const mode of ['family', 'question']) {
    const { reporter, calls, run } = harness({ mode });
    reporter.reportCrash(crash({
      source: 'rowan.example@school.example', family: 'Rowan Example', questionType: 'S_4417829931',
      assignmentId: 'rowan.example@school.example', questionId: 'Rowan Example',
      screen: '/student/rowan.example@school.example/4417829931',
      message: "Unexpected token '\\frac{3}{\\sqrt{7}}' in Rowan Quillfeather's answer 3x+7=22 https://x.web.app/a?token=SECRETTOKEN",
      studentId: 'S_48213', answer: 'x=5',
    }));
    await run();
    const sent = JSON.stringify(calls);
    assert.doesNotMatch(sent, /rowan|example|quillfeather|4417829931|48213|frac|sqrt|3x|x=5|SECRETTOKEN|web\.app|@/i);
    assert.doesNotMatch(sent, /"role"/, 'the server takes the role from the sign-in');
  }
});

test('a crash loop is one bounded batch: counts are merged and capped', async () => {
  const { reporter, calls, run } = harness({ mode: 'family' });
  for (let index = 0; index < 500; index += 1) reporter.reportCrash(crash());
  await run();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].buckets.length, 1);
  assert.equal(calls[1].buckets[0].count, CRASH_REPORT_LIMITS.countPerBucketPerCall);
});

test('a day has a hard cap on requests, with a growing gap between them', async () => {
  const { reporter, calls, run, state, timers } = harness({ mode: 'family' });
  const gaps = [];
  for (let round = 0; round < 40; round += 1) {
    reporter.reportCrash(crash({ family: `family-${round}` }));
    const pending = timers.filter(Boolean).at(-1);
    if (pending) gaps.push(pending.ms);
    // Stay inside one UTC day: only the cap, not a new day, limits this.
    const before = state.now;
    await run();
    state.now = Math.min(state.now, before + 60 * 1000);
  }
  assert.equal(calls.length, MAX_CALLS_PER_DAY);
  assert.ok(Math.max(...gaps) > FIRST_SEND_DELAY_MS * 10, 'later batches wait longer than the first');
  // The next day starts a new allowance.
  state.now += 24 * 60 * 60 * 1000;
  reporter.reportCrash(crash());
  await run();
  assert.ok(calls.length > MAX_CALLS_PER_DAY);
});

test('signed out: nothing is sent and nothing is counted; a failed request is counted, not retried in a loop', async () => {
  const out = harness({ signedIn: false });
  out.reporter.reportCrash(crash());
  await out.run();
  assert.deepEqual(out.calls, []);
  assert.equal(out.stored().calls, 0);
  assert.equal(Object.keys(out.stored().queue).length, 1, 'kept for when someone is signed in');

  const failing = harness({ fail: true });
  failing.reporter.reportCrash(crash());
  await failing.run();
  assert.equal(failing.calls.length, 1);
  assert.equal(failing.stored().calls, 1);
});

test('a kind that is not a crash is never reported, and the queue is bounded', async () => {
  const { reporter, calls, run, stored } = harness({ mode: 'question' });
  assert.equal(reporter.reportCrash(crash({ kind: 'draft-repaired' })), false);
  assert.equal(reporter.reportCrash({}), false);
  await run();
  assert.deepEqual(calls, []);
  for (let index = 0; index < 100; index += 1) reporter.reportCrash(crash({ family: `family-${index}` }));
  assert.equal(Object.keys(stored().queue).length, CRASH_REPORT_LIMITS.bucketsPerReporterPerDay);
});

test('more distinct failures than one request holds: the rest stay queued and go in the next request', async () => {
  const { reporter, calls, run, stored, timers } = harness({ mode: 'family' });
  const total = CRASH_REPORT_LIMITS.bucketsPerReporterPerDay;
  for (let index = 0; index < total; index += 1) reporter.reportCrash(crash({ family: `family-${index}` }));
  // The first timer only: the probe and the first batch.
  const first = timers.findIndex(Boolean);
  const { fn } = timers[first];
  timers[first] = null;
  await fn();
  assert.equal(calls[1].buckets.length, CRASH_REPORT_LIMITS.bucketsPerCall);
  assert.equal(Object.keys(stored().queue).length, total - CRASH_REPORT_LIMITS.bucketsPerCall, 'what did not fit is kept');
  await run();
  const sent = calls.slice(1).flatMap((call) => call.buckets.map((entry) => entry.family));
  assert.equal(new Set(sent).size, total, 'every failure was sent exactly once');
  assert.equal(sent.length, total);
  assert.deepEqual(stored().queue, {});
});

test('a queue left by an earlier page is sent on resume', async () => {
  const first = harness({ mode: 'family' });
  first.reporter.reportCrash(crash());
  const { reporter, run, calls } = first;
  first.timers.length = 0; // the page reloaded before the timer fired
  reporter.resume();
  await run();
  assert.equal(calls.length, 2);
});

test('the reporter is off the first load and off every healthy path: clientDiagnostics imports it lazily, after a failure', () => {
  const source = executableSource(componentSource('src/platform/runtime/clientDiagnostics.js'));
  assert.doesNotMatch(source, /import\s[^;]*from\s+['"]\.\/crashReporter\.js['"]/, 'a static import would put the reporter in the first load');
  assert.match(source, /import\(\s*['"]\.\/crashReporter\.js['"]\s*\)/);
  assert.doesNotMatch(source, /firebase/, 'the diagnostics log itself never touches Firebase');
  const reporter = executableSource(componentSource('src/platform/runtime/crashReporter.js'));
  assert.doesNotMatch(reporter, /firebase\/firestore|getDoc|onSnapshot|\bdb\b/, 'the reporter reads no Firestore document');
  assert.match(reporter, /httpsCallable\(functions, 'reportClientCrashes'\)/);
});

test('offline, or for a chunk that would not load, the reporter chunk is not fetched at all', () => {
  // The reporter is a lazy chunk: asking for it while offline, or from a tab
  // that outlived a deploy, is a second failed request on a recovering screen
  // (tests/browser/reviewMyWork.mjs, the offline scene, fails on it).
  const source = executableSource(componentSource('src/platform/runtime/clientDiagnostics.js'));
  const reached = source.indexOf('crashReporter().then((module) => module.reportCrash');
  assert.ok(reached > 0);
  const guard = source.slice(source.lastIndexOf('if (typeof window', reached), reached).split('\n')[0];
  assert.match(guard, /entry\.online !== false/);
  assert.match(guard, /kind !== 'chunk-load'/);
});

test('recording a diagnostic hands the reporter fields, and the reporter is not reached without a window', async () => {
  const diagnostics = await import('../../src/platform/runtime/clientDiagnostics.js');
  assert.equal(typeof globalThis.window, 'undefined');
  const entry = diagnostics.recordClientDiagnostic({ kind: 'render-error', message: 'x', report: { error: 'y', family: 'f' } });
  assert.equal(entry.message, 'x', 'the report fields never enter the local log');
  assert.equal('report' in entry, false);
});
