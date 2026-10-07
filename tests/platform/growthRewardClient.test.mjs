import test from 'node:test';
import assert from 'node:assert/strict';

import { describeClassPointTransaction, sourceTypeLabel } from '../../src/platform/classPointsClient.js';
import {
  GROWTH_SYNC_STORAGE_PREFIX,
  growthSyncAlreadyRequested,
  requestGrowthRewardSync,
} from '../../src/platform/rewards/useGrowthRewardSync.js';

/*
 * The browser side of growth rewards: how a growth credit reads in the wallet
 * and the teacher's ledger, and the once-per-session guard on the sync call.
 */

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
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

test('the sync is asked for once per session per student', async () => {
  const storage = memoryStorage();
  const calls = [];
  const callSync = async () => { calls.push(1); return { delivered: [] }; };

  assert.deepEqual(await requestGrowthRewardSync({ studentId: 'stu-1', storage, callSync }), { delivered: [] });
  assert.equal(await requestGrowthRewardSync({ studentId: 'stu-1', storage, callSync }), null);
  assert.equal(calls.length, 1);
  assert.ok(storage.values.has(`${GROWTH_SYNC_STORAGE_PREFIX}stu-1`));

  await requestGrowthRewardSync({ studentId: 'stu-2', storage, callSync });
  assert.equal(calls.length, 2, 'a second student on the same device gets their own sync');
  assert.equal(await requestGrowthRewardSync({ studentId: '', storage, callSync }), null);
  assert.equal(calls.length, 2, 'no student, no call');
});

test('a failed sync is silent and is not retried within the session', async () => {
  const storage = memoryStorage();
  let calls = 0;
  const failing = async () => { calls += 1; throw Object.assign(new Error('offline'), { code: 'unavailable' }); };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await requestGrowthRewardSync({ studentId: 'stu-1', storage, callSync: failing }), null);
    assert.equal(await requestGrowthRewardSync({ studentId: 'stu-1', storage, callSync: failing }), null);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(calls, 1);
});

test('storage that throws still allows the call', async () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(growthSyncAlreadyRequested('stu-1', broken), false);
  let calls = 0;
  await requestGrowthRewardSync({ studentId: 'stu-1', storage: broken, callSync: async () => { calls += 1; return {}; } });
  assert.equal(calls, 1);
});
