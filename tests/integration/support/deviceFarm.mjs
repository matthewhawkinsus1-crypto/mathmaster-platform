/*
 * THE LAUNCH CERTIFICATION'S DEVICE FARM: a class's simulated student devices
 * spread over worker threads (deviceFarmWorker.mjs), driven from the test.
 *
 * Each worker hosts its share of devices and its own copy of the callables.
 * The test addresses a device by student id; the farm forwards the call to
 * the worker that holds it and returns plain data (a device's `view()`).
 */
import { Worker } from 'node:worker_threads';
import os from 'node:os';

const WORKER_URL = new URL('./deviceFarmWorker.mjs', import.meta.url);

export async function createDeviceFarm({ workers = Math.max(2, Math.min(4, os.availableParallelism?.() || os.cpus().length)) } = {}) {
  const pool = await Promise.all(Array.from({ length: workers }, () => new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_URL, { env: process.env });
    const pending = new Map();
    let seq = 0;
    worker.on('message', (message) => {
      if (message.ready) { resolve(handle); return; }
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.ok) waiter.resolve(message.result);
      else waiter.reject(new Error(message.error));
    });
    worker.on('error', (error) => {
      reject(error);
      pending.forEach((waiter) => waiter.reject(error));
      pending.clear();
    });
    const handle = {
      worker,
      rpc: (op, payload = {}) => new Promise((done, fail) => {
        seq += 1;
        pending.set(seq, { resolve: done, reject: fail });
        worker.postMessage({ id: seq, op, ...payload });
      }),
    };
  })));

  const home = new Map(); // studentId -> worker handle
  let next = 0;
  const workerOf = (studentId) => {
    const handle = home.get(studentId);
    if (!handle) throw new Error(`No device for ${studentId}.`);
    return handle;
  };
  const invoke = (studentId, method, ...args) => workerOf(studentId).rpc('invoke', { studentId, method, args });
  const everyWorker = (op, payload) => Promise.all(pool.map((handle) => handle.rpc(op, payload)));

  return {
    workers,
    /** A new device for a student, with a profile (plain data). */
    async add(studentId, profile = {}) {
      const handle = pool[next % pool.length];
      next += 1;
      home.set(studentId, handle);
      await handle.rpc('create', { studentId, profile });
      return this.device(studentId);
    },
    device(studentId) {
      return {
        studentId,
        open: (invite) => invoke(studentId, 'open', invite),
        followInvites: () => invoke(studentId, 'followInvites'),
        goOffline: () => invoke(studentId, 'goOffline'),
        goOnline: () => invoke(studentId, 'goOnline'),
        freeze: () => invoke(studentId, 'freeze'),
        thaw: () => invoke(studentId, 'thaw'),
        refresh: () => invoke(studentId, 'refresh'),
      };
    },
    /** Every device's view, by student id. */
    async views() {
      const lists = await everyWorker('views', {});
      return new Map(lists.flat().map((view) => [view.studentId, view]));
    },
    async listeners() {
      const counts = await everyWorker('listeners', {});
      return counts.reduce((sum, count) => ({
        room: sum.room + count.room, players: sum.players + count.players, invite: sum.invite + count.invite, total: sum.total + count.total,
      }), { room: 0, players: 0, invite: 0, total: 0 });
    },
    /** Heap used across the farm's workers after a forced GC, in MB. */
    async heapMb() {
      const bytes = await everyWorker('heap', {});
      return Math.round(bytes.reduce((sum, value) => sum + value, 0) / 1e5) / 10;
    },
    async invocations() {
      return Object.assign({}, ...(await everyWorker('invocations', {})));
    },
    /** Each worker's event loop since its last sample: how busy the harness itself was. */
    async load() {
      return everyWorker('load', {});
    },
    /** Every device's standings/answer trace (devices with `trace` in their profile). */
    async traces(studentIds = null) {
      return (await everyWorker('traces', { studentIds })).flat();
    },
    /** What each worker's copy of the server read and wrote since `sinceMs`. */
    async accounting(sinceMs = 0) {
      const parts = await everyWorker('accounting', { sinceMs });
      return { events: parts.flatMap((part) => part.events), calls: parts.flatMap((part) => part.calls), commits: parts.flatMap((part) => part.commits) };
    },
    async resetAccounting() {
      await everyWorker('resetAccounting', {});
    },
    /** Close devices (all of them by default): their listeners, timers and connections. */
    async shutdown(studentIds = null) {
      await everyWorker('shutdown', { studentIds });
      (studentIds || [...home.keys()]).forEach((id) => home.delete(id));
    },
    async close() {
      await this.shutdown().catch(() => {});
      await Promise.all(pool.map((handle) => handle.worker.terminate()));
    },
  };
}
