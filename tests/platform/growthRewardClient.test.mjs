import test from 'node:test';
import assert from 'node:assert/strict';

import { describeClassPointTransaction, sourceTypeLabel } from '../../src/platform/classPointsClient.js';
import { readFileSync } from 'node:fs';
import {
  GROWTH_SYNC_INTERVAL_MS,
  growthSyncFresh,
  growthSyncKey,
  requestGrowthRewardSync,
} from '../../src/platform/rewards/useGrowthRewardSync.js';
import { clearAccountTabStorage } from '../../src/auth/accountTabStorage.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * The browser side of growth rewards: how a growth credit reads in the wallet
 * and the teacher's ledger, and the guard on the sync call: per signed-in
 * account, fresh for GROWTH_SYNC_INTERVAL_MS, cleared by sign-out, and not
 * kept after a failure the next check could get past.
 */

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    values,
  };
};

test('a growth credit reads as a growth reward, never as a teacher award', () => {
  assert.equal(sourceTypeLabel({ sourceType: 'growthReward' }), 'Growth reward');
  assert.equal(sourceTypeLabel({ sourceType: 'teacherAward' }), 'Teacher award');
  const described = describeClassPointTransaction({ amount: 15, sourceType: 'growthReward', reasonLabel: 'Raised your score on the retest' });
  assert.equal(described.kind, 'growth');
  assert.equal(described.kindLabel, 'Growth reward');
  assert.equal(described.amountLabel, '+15');
  assert.equal(described.reasonLabel, 'Raised your score on the retest');
});

test('a check is fresh for the interval, then asked again; each account and student apart', async () => {
  const storage = memoryStorage();
  const calls = [];
  const callSync = async () => { calls.push(1); return { delivered: [] }; };
  const at = 1_000_000;
  assert.deepEqual(await requestGrowthRewardSync({ uid: 'u1', studentId: 'stu-1', storage, callSync, nowMs: at }), { delivered: [] });
  assert.equal(await requestGrowthRewardSync({ uid: 'u1', studentId: 'stu-1', storage, callSync, nowMs: at + 1_000 }), null);
  assert.equal(calls.length, 1);
  // Finished corrections pay the same visit: once the check is stale it asks again.
  await requestGrowthRewardSync({ uid: 'u1', studentId: 'stu-1', storage, callSync, nowMs: at + GROWTH_SYNC_INTERVAL_MS + 1 });
  assert.equal(calls.length, 2);
  await requestGrowthRewardSync({ uid: 'u2', studentId: 'stu-2', storage, callSync, nowMs: at });
  assert.equal(calls.length, 3, 'another account on the same device gets its own check');
  assert.equal(await requestGrowthRewardSync({ uid: 'u1', studentId: '', storage, callSync, nowMs: at }), null);
  assert.equal(await requestGrowthRewardSync({ uid: '', studentId: 'stu-1', storage, callSync, nowMs: at }), null);
  assert.equal(calls.length, 3, 'no account or no student, no call');
});

test('sign-out clears the stamp, so no student id stays in a shared tab', async () => {
  const storage = memoryStorage();
  await requestGrowthRewardSync({ uid: 'u1', studentId: 'stu-1', storage, callSync: async () => ({}), nowMs: 5 });
  assert.ok(storage.values.has(growthSyncKey('u1', 'stu-1')));
  clearAccountTabStorage({ storage });
  assert.equal(storage.values.size, 0);
  assert.equal(growthSyncFresh({ uid: 'u1', studentId: 'stu-1', storage, nowMs: 6 }), false);
});

test('a transient failure is retried at the next check; a refusal waits for the interval', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const offline = async () => { calls += 1; throw Object.assign(new Error('offline'), { code: 'functions/unavailable' }); };
  const refused = async () => { calls += 1; throw Object.assign(new Error('no'), { code: 'functions/permission-denied' }); };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await requestGrowthRewardSync({ uid: 'u1', studentId: 'stu-1', storage, callSync: offline, nowMs: 10 }), null);
    assert.equal(await requestGrowthRewardSync({ uid: 'u1', studentId: 'stu-1', storage, callSync: offline, nowMs: 20 }), null);
    assert.equal(calls, 2, 'a Chromebook waking offline is asked again');
    await requestGrowthRewardSync({ uid: 'u1', studentId: 'stu-1', storage, callSync: refused, nowMs: 30 });
    await requestGrowthRewardSync({ uid: 'u1', studentId: 'stu-1', storage, callSync: refused, nowMs: 40 });
    assert.equal(calls, 3, 'a refusal is not retried until the interval passes');
  } finally {
    console.warn = originalWarn;
  }
});

test('storage that throws still allows the call', async () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(growthSyncFresh({ uid: 'u1', studentId: 'stu-1', storage: broken }), false);
  let calls = 0;
  await requestGrowthRewardSync({ uid: 'u1', studentId: 'stu-1', storage: broken, callSync: async () => { calls += 1; return {}; } });
  assert.equal(calls, 1);
});

test('the hook only ever asks through the guard', () => {
  const source = executableSource(readFileSync(new URL('../../src/platform/rewards/useGrowthRewardSync.js', import.meta.url), 'utf8'));
  const hook = region(source, 'export function useGrowthRewardSync(', '\n}\n');
  assert.match(hook, /const check = \(\) => \{ requestGrowthRewardSync\(\{ uid, studentId/);
  assert.doesNotMatch(hook, /callSync\(\)|httpsCallable|defaultCallSync/);
});
