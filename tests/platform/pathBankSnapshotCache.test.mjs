/*
 * THE PATH SIMULATOR'S BANK SNAPSHOT: REUSED FOR 60 SECONDS, THEN LET GO
 * (deep dive 2026-10-01, smaller items).
 *
 * The snapshot holds every active pathQuestionBank document, answer keys
 * included. These tests drive the cache with a fake clock and fake timers,
 * and use the garbage collector itself to show that an expired snapshot is
 * unreachable — which is the whole finding: before, it stayed referenced for
 * the rest of the teacher's session.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  PATH_BANK_SNAPSHOT_TTL_MS,
  createPathBankSnapshotCache,
} from '../../src/platform/path/pathBankSnapshotCache.js';

// This file runs in its own process (node --test isolates files), so exposing
// the collector here affects nothing else.
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const collectGarbage = async () => {
  // A WeakRef target stays alive until the job that touched it ends.
  for (let round = 0; round < 3; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    gc();
  }
};

const T0 = 1_000_000;

/** Timers that never fire on their own. `cancels: false` models a host that cannot cancel one. */
const fakeTimers = ({ cancels = true, handle = (id) => ({ id, unrefCalled: false, unref() { this.unrefCalled = true; } }) } = {}) => {
  const pending = new Map();
  const scheduled = [];
  let next = 0;
  return {
    setTimer: (callback, delayMs) => {
      next += 1;
      const timer = handle(next);
      pending.set(timer, callback);
      scheduled.push({ timer, delayMs });
      return timer;
    },
    clearTimer: (timer) => { if (cancels) pending.delete(timer); },
    fire: () => {
      const due = [...pending.entries()];
      pending.clear();
      due.forEach(([, callback]) => callback());
    },
    pending,
    scheduled,
  };
};

const harness = ({ timerOptions, loadMs = 0, failNext = false } = {}) => {
  const state = { clock: T0, loads: 0, failNext };
  const timers = fakeTimers(timerOptions);
  const cache = createPathBankSnapshotCache({
    load: async () => {
      state.clock += loadMs;
      if (state.failNext) {
        state.failNext = false;
        throw new Error('bank unavailable');
      }
      state.loads += 1;
      // A fresh snapshot each time, holding nothing the test keeps.
      return [{ id: `bank-${state.loads}`, answerKey: 'x'.repeat(2048) }];
    },
    now: () => state.clock,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  return { state, timers, cache };
};

test('the snapshot is reused for 60 seconds, as before', async () => {
  assert.equal(PATH_BANK_SNAPSHOT_TTL_MS, 60_000);
  const { state, cache } = harness();
  const first = await cache.fetch();
  state.clock = T0 + 59_999;
  assert.equal(await cache.fetch(), first, 'a remount inside the 60 seconds reuses the read');
  assert.equal(state.loads, 1);
  state.clock = T0 + 60_000;
  const second = await cache.fetch();
  assert.notEqual(second, first);
  assert.equal(state.loads, 2, 'after the 60 seconds the bank is read again');
});

test('when the 60 seconds end the snapshot is let go, even if nothing reads it again', async () => {
  const { state, timers, cache } = harness();
  await cache.fetch();
  assert.equal(cache.holdsSnapshot(), true);
  assert.deepEqual(timers.scheduled.map((entry) => entry.delayMs), [60_000]);
  state.clock = T0 + 60_000;
  timers.fire();
  assert.equal(cache.holdsSnapshot(), false, 'the expiry dropped the reference');
  await cache.fetch();
  assert.equal(state.loads, 2);
});

test('a late timer cannot keep an expired snapshot: the next read drops it instead of serving it', async () => {
  // Background tabs throttle timers; the clock is the authority.
  const { state, timers, cache } = harness();
  await cache.fetch();
  state.clock = T0 + 60_000;
  assert.equal(cache.read(), null);
  assert.equal(cache.holdsSnapshot(), false);
  assert.equal(timers.pending.size, 0, 'and its pending expiry is cancelled');
});

test('the 60 seconds count from when the read that filled the cache began', async () => {
  const { state, timers, cache } = harness({ loadMs: 5000 });
  const first = await cache.fetch();
  assert.deepEqual(timers.scheduled.map((entry) => entry.delayMs), [55_000], 'a 5 s read leaves 55 s of reuse');
  state.clock = T0 + 59_999;
  assert.equal(await cache.fetch(), first);
  state.clock = T0 + 60_000;
  await cache.fetch();
  assert.equal(state.loads, 2);
});

test('force always reads the bank, and the fresh read gets its own 60 seconds', async () => {
  const { state, timers, cache } = harness();
  await cache.fetch();
  state.clock = T0 + 10_000;
  const forced = await cache.fetch({ force: true });
  assert.equal(state.loads, 2);
  assert.equal(timers.pending.size, 1, 'the earlier expiry was replaced, not left to fire');
  state.clock = T0 + 65_000;
  assert.equal(await cache.fetch(), forced, '55 s after the forced read it is still reused');
  assert.equal(state.loads, 2);
});

test('clearing drops the snapshot and its pending expiry, and the next fetch reads the bank', async () => {
  const { state, timers, cache } = harness();
  await cache.fetch();
  cache.clear();
  assert.equal(cache.holdsSnapshot(), false);
  assert.equal(timers.pending.size, 0);
  await cache.fetch();
  assert.equal(state.loads, 2);
});

test('an expiry left over from an earlier snapshot never drops a newer one', async () => {
  // A host that cannot cancel leaves the first snapshot's expiry queued.
  const { state, timers, cache } = harness({ timerOptions: { cancels: false } });
  await cache.fetch();
  const [staleExpiry] = timers.pending.values();
  cache.clear();
  state.clock = T0 + 1000;
  const newer = await cache.fetch();
  staleExpiry();
  assert.equal(cache.read(), newer, 'the stale expiry left the newer snapshot alone');
});

test('a failed read caches nothing, and the next fetch tries again', async () => {
  const { state, cache } = harness({ failNext: true });
  await assert.rejects(cache.fetch(), /bank unavailable/);
  assert.equal(cache.holdsSnapshot(), false);
  await cache.fetch();
  assert.equal(state.loads, 1);
  assert.equal(cache.holdsSnapshot(), true);
});

test('unref is used only where the timer has it', async () => {
  const withUnref = harness();
  await withUnref.cache.fetch();
  assert.equal(withUnref.timers.scheduled[0].timer.unrefCalled, true);
  // A browser timer is a number: no unref, and no error for lacking one.
  const browserLike = harness({ timerOptions: { handle: (id) => id } });
  await browserLike.cache.fetch();
  assert.equal(browserLike.cache.holdsSnapshot(), true);
});

test('with the real timers, a pending expiry does not hold a node process open', async () => {
  const realSetTimeout = globalThis.setTimeout;
  const handles = [];
  globalThis.setTimeout = (callback, delayMs) => {
    const timer = realSetTimeout(callback, delayMs);
    handles.push(timer);
    return timer;
  };
  try {
    const cache = createPathBankSnapshotCache({ load: async () => [{ id: 'bank-1' }] });
    await cache.fetch();
    assert.equal(handles.length, 1);
    assert.equal(handles[0].hasRef(), false);
    cache.clear();
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

/* ------------------------------------------- reachability, by the collector */

// The snapshot as the simulator receives it, held only through a WeakRef.
const fetchWeakly = async (cache) => new WeakRef(await cache.fetch());

test('an expired snapshot is unreachable once its 60 seconds end', async () => {
  const { state, timers, cache } = harness();
  const snapshot = await fetchWeakly(cache);
  await collectGarbage();
  assert.ok(snapshot.deref(), 'within the 60 seconds the cache keeps it');
  state.clock = T0 + 60_000;
  timers.fire();
  await collectGarbage();
  assert.equal(snapshot.deref(), undefined, 'after expiry nothing references the bank');
});

test('an expired snapshot is unreachable after a late read, even while its expiry timer is still pending', async () => {
  // A host that cannot cancel: the expiry callback stays queued. It must not
  // be what keeps the answer keys alive.
  const { state, timers, cache } = harness({ timerOptions: { cancels: false } });
  const snapshot = await fetchWeakly(cache);
  state.clock = T0 + 60_000;
  assert.equal(cache.read(), null);
  assert.equal(timers.pending.size, 1, 'the expiry is still queued');
  await collectGarbage();
  assert.equal(snapshot.deref(), undefined);
});

test('clearing makes the snapshot unreachable', async () => {
  const { cache } = harness();
  const snapshot = await fetchWeakly(cache);
  cache.clear();
  await collectGarbage();
  assert.equal(snapshot.deref(), undefined);
});

/* ------------------------------------------------------- the service wiring */

const service = executableSource(readFileSync(new URL('../../src/platform/path/pathBankSimulationService.js', import.meta.url), 'utf8'));

test('the simulator service reads the bank through the expiring cache, with the 60 second default', () => {
  assert.match(service, /import \{ createPathBankSnapshotCache \} from '\.\/pathBankSnapshotCache\.js';/);
  assert.match(service, /^const bankSnapshot = createPathBankSnapshotCache\(\{ load: loadActivePathBank \}\);$/m);
  assert.match(service, /^export const fetchTeacherPathBankSnapshot = \(\{ force = false \} = \{\}\) => bankSnapshot\.fetch\(\{ force \}\);$/m);
  assert.match(service, /^export const clearTeacherPathBankSnapshotCache = \(\) => bankSnapshot\.clear\(\);$/m);
  const loader = region(service, 'const loadActivePathBank = async () => {', '};', 'bank loader');
  assert.match(loader, /getDocs\(collection\(db, 'pathQuestionBank'\)\)/);
  assert.match(loader, /\.filter\(\(entry\) => entry\.active !== false\)/);
  // No snapshot held anywhere else in the module.
  assert.doesNotMatch(service, /^let /m, 'the service keeps no module-level snapshot of its own');
});
