import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRESENCE_FLUSH_MS, applyKeyedChanges, createKeyedUpdateBuffer } from '../../src/platform/performance/coalescedKeyedUpdates.js';
import { HEARTBEAT_INTERVAL_MS } from '../../src/livePresence.js';
import { region } from './helpers/sourceContract.mjs';

// ONE DASHBOARD RENDER PER SECOND, NOT ONE PER HEARTBEAT (Job 5).
//
// The teacher dashboard subscribes to one presence document per rostered
// student and each device heartbeats every 20 s. Every snapshot re-rendered the
// root App. These tests MEASURE the render count for a simulated room, before
// and after, on a deterministic clock.

const simulateRoom = ({ students, seconds, coalesce }) => {
  let clock = 0;
  const timers = [];
  const setTimer = (callback, ms) => { const handle = { at: clock + ms, callback }; timers.push(handle); return handle; };
  const clearTimer = (handle) => { const index = timers.indexOf(handle); if (index >= 0) timers.splice(index, 1); };
  let state = {};
  let renders = 0;
  const commit = (updater) => {
    const next = updater(state);
    if (next !== state) renders += 1;
    state = next;
  };
  const buffer = coalesce
    ? createKeyedUpdateBuffer({ flushMs: PRESENCE_FLUSH_MS, onFlush: (changes) => commit((current) => applyKeyedChanges(current, changes)), setTimer, clearTimer, now: () => clock })
    : null;
  const deliver = (studentId, value) => {
    if (buffer) buffer.set(studentId, value);
    else commit((current) => ({ ...current, [studentId]: value }));
  };
  // Initial snapshots arrive together; then each student heartbeats on its own phase.
  const events = [];
  for (let student = 0; student < students; student += 1) {
    events.push({ at: 5 * student, student });
    for (let at = (student * 137) % HEARTBEAT_INTERVAL_MS; at < seconds * 1000; at += HEARTBEAT_INTERVAL_MS) events.push({ at, student });
  }
  events.sort((a, b) => a.at - b.at);
  let beat = 0;
  for (const event of events) {
    while (timers.length && Math.min(...timers.map((timer) => timer.at)) <= event.at) {
      const due = timers.reduce((first, timer) => (timer.at < first.at ? timer : first));
      clock = due.at;
      clearTimer(due);
      due.callback();
    }
    clock = event.at;
    beat += 1;
    deliver(`s${event.student}`, { lastSeen: event.at, beat });
  }
  while (timers.length) { const due = timers.shift(); clock = due.at; due.callback(); }
  return { renders, state, snapshots: events.length };
};

test('150 students for one minute: renders drop from one per snapshot to at most one per second', () => {
  const before = simulateRoom({ students: 150, seconds: 60, coalesce: false });
  const after = simulateRoom({ students: 150, seconds: 60, coalesce: true });
  assert.equal(before.renders, before.snapshots, 'before: every snapshot rendered the dashboard');
  assert.ok(before.renders >= 600, `before: ${before.renders} renders`);
  assert.ok(after.renders <= 62, `after: ${after.renders} renders in 60 s`);
  assert.deepEqual(after.state, before.state, 'no presence update is lost — the room ends in exactly the same state');
  console.log(`presence renders per minute, 150 students: before ${before.renders}, after ${after.renders}`);
});

test('30 students (one class): the first flush is immediate and the room is complete', () => {
  const after = simulateRoom({ students: 30, seconds: 60, coalesce: true });
  assert.equal(Object.keys(after.state).length, 30);
  assert.ok(after.renders <= 62);
});

test('unchanged batches keep identity; a missing document removes the student; cancel stops everything', () => {
  const current = { s1: { lastSeen: 1 } };
  assert.equal(applyKeyedChanges(current, new Map([['s1', current.s1]])), current);
  assert.equal(applyKeyedChanges(current, new Map([['s2', null]])), current);
  assert.deepEqual(applyKeyedChanges(current, new Map([['s1', null]])), {});

  const flushed = [];
  let pendingTimer = null;
  const buffer = createKeyedUpdateBuffer({
    flushMs: 1000,
    onFlush: (changes) => flushed.push(changes),
    setTimer: (callback) => { pendingTimer = callback; return 1; },
    clearTimer: () => { pendingTimer = null; },
    now: () => 0,
  });
  buffer.set('s1', { a: 1 });
  buffer.set('s2', { a: 2 });
  assert.equal(flushed.length, 1, 'the first snapshot flushes at once');
  buffer.cancel();
  pendingTimer?.();
  assert.equal(flushed.length, 1, 'nothing flushes after the effect is torn down');
});

test('the teacher presence effect batches snapshots and tears the buffer down with the listeners', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(app, /import \{ PRESENCE_FLUSH_MS, applyKeyedChanges, createKeyedUpdateBuffer \} from '\.\/platform\/performance\/coalescedKeyedUpdates\.js'/);
  const effect = region(app, 'const presenceBuffer = createKeyedUpdateBuffer({', '}, [user?.role, teacherTab, allStudents, teacherPreviewRuntimeActive]);', 'the presence effect');
  assert.match(effect, /presenceBuffer\.set\(studentId, snapshot\.exists\(\) \? snapshot\.data\(\) : null\)/);
  assert.doesNotMatch(effect.slice(0, effect.indexOf('return () =>')), /setPresenceById\(\(current\) => \{/, 'no per-snapshot state update');
  assert.match(effect, /presenceBuffer\.cancel\(\);\s*unsubs\.forEach/);
});
