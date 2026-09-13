import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  createDurableAction,
  createMemoryOutboxStorage,
  drainDurableActions,
  enqueueDurableAction,
} from '../src/platform/performance/durableActionOutbox.js';

const students = Array.from({ length: 30 }, (_, index) => `student-${index + 1}`);
const durations = [];
const canonical = new Map();
await Promise.all(students.map(async (studentId, index) => {
  const storage = createMemoryOutboxStorage();
  const action = createDurableAction({
    kind: 'ordinarySubmission', studentId, assignmentId: 'class-load-assignment', questionIndex: index % 5,
    actionId: `load-action-${index + 1}`,
    payload: { previousTotalAttempts: 0, record: { totalAttempts: 1 } },
  });
  const startedAt = performance.now();
  await enqueueDurableAction(action, { storage });
  await drainDurableActions({
    storage,
    studentId,
    reconcile: async (queued) => {
      assert.equal(canonical.has(queued.actionId), false);
      canonical.set(queued.actionId, queued.payload.record);
      return { status: 'durable' };
    },
  });
  durations.push(performance.now() - startedAt);
}));

const percentile = (quantile) => [...durations].sort((a, b) => a - b)[Math.ceil(durations.length * quantile) - 1];
assert.equal(canonical.size, 30);
assert.equal([...canonical.values()].every((record) => record.totalAttempts === 1), true);
console.log(JSON.stringify({ students: 30, saved: canonical.size, duplicates: 0, p50Ms: percentile(0.5), p95Ms: percentile(0.95) }, null, 2));
