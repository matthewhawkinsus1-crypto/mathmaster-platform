import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  SPOTLIGHT_FRAME_DEBOUNCE_MS,
  buildSpotlightFrame,
  createSpotlightPublisher,
  isActiveSpotlightRequest,
  publicStudentLabel,
  scheduleSpotlightExpiry,
  SPOTLIGHT_MAX_FRAME_BYTES,
} from '../../src/platform/liveSpotlight.js';

const require = createRequire(import.meta.url);
const spotlightCleanup = require('../../functions/lib/liveSpotlight.js');

test('Spotlight frame contains current sanitized work but no grading secrets or URLs', () => {
  const frame = buildSpotlightFrame({
    assignmentId: 'A1', assignmentTitle: 'Linear Functions', questionIndex: 2,
    studentLabel: 'Jordan H.',
    question: { type: 'graph', prompt: 'Graph y=2x+1', answerKey: 'secret', solution: 'secret', url: 'https://other-tab.example', graph: { points: [[0, 1]], expectedPoints: [[2, 5]] } },
    answerState: { response: 'y=2x+1', isCorrect: true, score: 100, parts: [{ id: 'line', value: 'y=2x+1', correctAnswer: 'secret' }], questionDetails: { plottedPoints: [[0, 1]], browserHistory: ['private'] } },
  });
  const serialized = JSON.stringify(frame);
  assert.match(serialized, /Graph y=2x\+1/);
  assert.match(serialized, /plottedPoints/);
  assert.doesNotMatch(serialized, /secret|other-tab|browserHistory|isCorrect|score|expectedPoints/);
  assert.equal(frame.studentLabel, 'Jordan H.');
});

test('final Spotlight payload remains within the byte cap for huge permitted table and graph data', () => {
  const huge = 'x'.repeat(4000);
  const frame = buildSpotlightFrame({
    assignmentId: 'A1', assignmentTitle: 'Large representations', questionIndex: 0, studentLabel: 'Jordan H.',
    question: {
      prompt: huge,
      directions: huge,
      table: Array.from({ length: 20 }, (_, row) => Array.from({ length: 10 }, (_, column) => `${row}:${column}:${huge}`)),
      graph: { functions: Array.from({ length: 20 }, (_, index) => ({ label: huge, expression: `${index}x+${huge}` })) },
    },
    answerState: { questionDetails: { points: Array.from({ length: 120 }, (_, index) => [index, huge]) } },
  });
  assert.ok(new TextEncoder().encode(JSON.stringify(frame)).length <= SPOTLIGHT_MAX_FRAME_BYTES);
  assert.equal(frame.schemaVersion, 1);
  assert.equal(frame.assignmentId, 'A1');
  assert.equal(frame.truncated, true);
});

test('every Spotlight session requires a current accepted request', () => {
  const accepted = { status: 'accepted', expiresAtMs: 2000 };
  assert.equal(isActiveSpotlightRequest(accepted, 1000), true);
  assert.equal(isActiveSpotlightRequest({ ...accepted, status: 'requested' }, 1000), false);
  assert.equal(isActiveSpotlightRequest({ ...accepted, status: 'declined' }, 1000), false);
  assert.equal(isActiveSpotlightRequest({ ...accepted, status: 'stopped' }, 1000), false);
  assert.equal(isActiveSpotlightRequest(accepted, 2000), false);
  assert.equal(isActiveSpotlightRequest({ status: 'accepted' }, 1000), false);
});

test('publisher coalesces typing and the typing path does not await Firestore', async () => {
  const timers = [];
  const writes = [];
  const publisher = createSpotlightPublisher({
    publish: async (value) => writes.push(value),
    setTimer: (callback, delay) => { timers.push({ callback, delay, cleared: false }); return timers.length; },
    clearTimer: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
  });
  assert.equal(publisher.schedule({ text: 'a' }), undefined);
  assert.equal(publisher.schedule({ text: 'ab' }), undefined);
  assert.equal(publisher.schedule({ text: 'abc' }), undefined);
  assert.equal(timers.at(-1).delay, SPOTLIGHT_FRAME_DEBOUNCE_MS);
  assert.equal(writes.length, 0);
  timers.at(-1).callback();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(writes, [{ text: 'abc' }]);
  publisher.stop();
  publisher.schedule({ text: 'must not publish' });
  assert.equal(writes.length, 1);
});

test('hard expiry fires without a Firestore event and cancellation disarms stale sessions', () => {
  const timers = [];
  const cleared = [];
  let expired = 0;
  const cancel = scheduleSpotlightExpiry({
    request: { expiresAtMs: 1500 }, nowValue: 1000,
    onExpire: () => { expired += 1; },
    setTimer: (callback, delay) => { timers.push({ callback, delay }); return 41; },
    clearTimer: (id) => cleared.push(id),
  });
  assert.equal(timers[0].delay, 500);
  assert.equal(expired, 0);
  timers[0].callback();
  assert.equal(expired, 1);
  cancel();
  assert.deepEqual(cleared, [41]);

  const staleTimers = [];
  let staleExpired = false;
  const cancelStale = scheduleSpotlightExpiry({
    request: { expiresAtMs: 2000 }, nowValue: 1000,
    onExpire: () => { staleExpired = true; },
    setTimer: (callback) => { staleTimers.push(callback); return 9; },
    clearTimer: () => staleTimers.splice(0),
  });
  cancelStale();
  assert.equal(staleTimers.length, 0);
  assert.equal(staleExpired, false);
});

test('projector label defaults to first name and last initial', () => {
  assert.equal(publicStudentLabel({ firstName: 'Jordan', lastName: 'Hawkins' }), 'Jordan H.');
  assert.equal(publicStudentLabel({ displayName: 'Jordan Hawkins' }), 'Jordan H.');
});

test('Spotlight wiring remains separate from presence, drafts, grades, attempts, and evidence', async () => {
  const [app, presence, rules, monitor, viewer] = await Promise.all([
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/livePresence.js', import.meta.url), 'utf8'),
    readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../../src/components/teacher/LiveClassMonitor.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/components/teacher/StudentSpotlightView.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /from '\.\/platform\/liveSpotlight\.js'/);
  assert.match(app, /onSpotlightFrame=\{preview \? null : publishSpotlightWork\}/);
  assert.match(app, /Present Now/);
  assert.match(app, /Stop Presenting/);
  assert.doesNotMatch(presence, /liveSpotlightFrames|studentWorkspaceDrafts/);
  assert.match(rules, /match \/liveSpotlightFrames\/\{requestId\}/);
  assert.match(rules, /match \/studentWorkspaceDrafts\/\{draftId\}[\s\S]*allow read: if rootAdmin\(\) \|\| ownsStudent/);
  assert.doesNotMatch(app.slice(app.indexOf('publishSpotlightWork'), app.indexOf('// Persistent support/intervention')), /gradesByAssignment|assignmentActivity|evidence|passback|attemptCount/);
  assert.match(monitor, /activeTeacherSpotlightQueries\(db, \{[\s\S]*teacherEmail, classId: activeClassId, studentIds: spotlightStudentIds/);
  assert.match(monitor, /entry\.classId === activeClassId/);
  assert.match(monitor, /!row\.live\?\.assignmentId/);
  assert.doesNotMatch(viewer, /JSON\.stringify|QuestionEngine/);
});

test('active-class selection cannot project a Spotlight from another class', () => {
  const requests = [
    { id: 'a', classId: 'class-a', status: 'accepted', expiresAt: { toMillis: () => 3000 } },
    { id: 'b', classId: 'class-b', status: 'accepted', expiresAt: { toMillis: () => 4000 } },
  ];
  const select = (activeClassId) => requests.filter((entry) => entry.classId === activeClassId && entry.expiresAt.toMillis() > 2000);
  assert.deepEqual(select('class-a').map((entry) => entry.id), ['a']);
  assert.deepEqual(select('class-b').map((entry) => entry.id), ['b']);
});

test('expired frames alone are eligible for server cleanup', () => {
  assert.equal(spotlightCleanup.expiredSpotlightFrame({ expiresAt: { toMillis: () => 999 } }, 1000), true);
  assert.equal(spotlightCleanup.expiredSpotlightFrame({ expiresAt: { toMillis: () => 1001 } }, 1000), false);
  assert.equal(spotlightCleanup.expiredSpotlightFrame({}, 1000), false);
});

test('Spotlight subscriptions have the required bounded-query indexes', async () => {
  const indexes = JSON.parse(await readFile(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'));
  const spotlight = indexes.indexes.filter((entry) => entry.collectionGroup === 'liveSpotlightRequests');
  const signatures = spotlight.map((entry) => entry.fields.map((field) => field.fieldPath).join(','));
  assert.ok(signatures.includes('teacherEmail,classId,studentId,status,expiresAt'));
  assert.ok(signatures.includes('studentId,status,expiresAt'));
});
