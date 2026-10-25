/*
 * TT16 — WHO TO SEE NEXT in the Live Class monitor.
 *
 * The grid sorts raised hands first and then by severity and name, which tells a
 * teacher who is flagged but not who has waited longest. The "See next" list
 * orders the room by time without moving on, from the rows the monitor already
 * has. What this holds: raised hands first (the longest wait first); then
 * everyone working on this assignment by time since their last answer, longest
 * first, with a stuck student always on it; nobody offline, not started or
 * absent; quiet time ignored when most of the room is quiet at once; and a
 * list that names students never shown on the projector.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildLiveStatus, summarizeLiveClass } from '../../src/livePresence.js';
import { SEE_NEXT_LIMIT, minutesText, seeNextQueue } from '../../src/platform/teacher/liveSeeNext.js';
import { region } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-10-26T15:00:00Z');
const MIN = 60000;
const ASSIGNMENT = 'lesson-1';

/** A student's grade document as the monitor reads it. */
const student = (id, {
  quietMin = 0,
  attempts = 0,
  helpMinAgo = null,
  heartbeatAgoSec = 5,
  assignmentId = ASSIGNMENT,
  questionIndex = 3,
  visible = true,
  firstName = id,
  lastName = 'Test',
} = {}) => ({
  id,
  firstName,
  lastName,
  classPeriod: 'Period 3',
  liveStatus: assignmentId === null ? null : {
    ...buildLiveStatus({
      assignmentId,
      assignmentTitle: 'Lesson',
      activityRole: 'classwork',
      questionIndex,
      sectionQuestionIndex: questionIndex,
      questionCount: 10,
      questionStates: 'cccx......',
      currentAttempts: attempts,
      lastInteractionAt: NOW - quietMin * MIN,
      nowValue: NOW - heartbeatAgoSec * 1000,
      pageVisible: visible,
    }),
    ...(helpMinAgo === null ? {} : { helpRequestedAt: NOW - helpMinAgo * MIN }),
  },
});

const queueOf = (students, options = {}) => {
  const { rows, classStats } = summarizeLiveClass(students, { nowValue: NOW, assignmentId: ASSIGNMENT });
  return seeNextQueue({ rows, classStats, nowValue: NOW, ...options });
};
const ids = (queue) => queue.items.map((entry) => entry.id);

// A room of eight working students whose quiet time is short: the room is not quiet together.
const busy = (count = 6) => Array.from({ length: count }, (_, index) => student(`busy-${index}`, { quietMin: 0.2 }));

test('raised hands come first, the one that has waited longest first; then the room by time without moving on', () => {
  const room = [
    ...busy(),
    student('quiet-9', { quietMin: 9 }),
    student('quiet-3', { quietMin: 3 }),
    student('quiet-5', { quietMin: 5 }),
    student('hand-1', { quietMin: 0.1, helpMinAgo: 1 }),
    student('hand-4', { quietMin: 0.1, helpMinAgo: 4 }),
  ];
  const queue = queueOf(room);
  assert.deepEqual(ids(queue), ['hand-4', 'hand-1', 'quiet-9', 'quiet-5', 'quiet-3']);
  assert.deepEqual(queue.items.map((entry) => entry.kind), ['help', 'help', 'quiet', 'quiet', 'quiet']);
  assert.equal(queue.classwideQuiet, false);
  assert.equal(queue.total, 5);
  assert.equal(queue.items[0].reason, 'Hand raised on Q4 · waiting 4 min');
  assert.equal(queue.items[2].reason, 'Quiet for 9 min · Q4');
});

test('a student under two minutes quiet is not on it; a stuck student always is, ranked by their own quiet time', () => {
  const queue = queueOf([
    ...busy(),
    student('recent', { quietMin: 1.5 }),
    student('quiet-6', { quietMin: 6 }),
    student('stuck-typing', { quietMin: 0.3, attempts: 4 }),
    student('stuck-quiet', { quietMin: 4, attempts: 3 }),
  ]);
  assert.deepEqual(ids(queue), ['quiet-6', 'stuck-quiet', 'stuck-typing']);
  assert.deepEqual(queue.items.map((entry) => entry.kind), ['quiet', 'stuck', 'stuck']);
  assert.equal(queue.items[1].reason, 'Stuck on Q4 · 3 tries · quiet 4 min');
  assert.equal(queue.items[2].reason, 'Stuck on Q4 · 4 tries', 'a student still typing is not described as quiet');
});

test('nobody who is offline, has not started, or is working something else is on it', () => {
  const queue = queueOf([
    ...busy(),
    student('closed-laptop', { quietMin: 20, heartbeatAgoSec: 300 }),
    student('not-started', { assignmentId: null }),
    student('other-work', { quietMin: 15, assignmentId: 'another-lesson' }),
    student('real-one', { quietMin: 7 }),
  ]);
  assert.deepEqual(ids(queue), ['real-one']);
  // A closed laptop with a raised hand is not a student waiting for the teacher either.
  const stale = queueOf([...busy(), student('hand-offline', { helpMinAgo: 5, heartbeatAgoSec: 300 })]);
  assert.deepEqual(ids(stale), []);
});

test('the list is limited, and says how many more there are', () => {
  const many = Array.from({ length: 8 }, (_, index) => student(`quiet-${index}`, { quietMin: 3 + index }));
  const queue = queueOf([...busy(10), ...many]);
  assert.equal(SEE_NEXT_LIMIT, 5);
  assert.deepEqual(ids(queue), ['quiet-7', 'quiet-6', 'quiet-5', 'quiet-4', 'quiet-3']);
  assert.equal(queue.total, 8);
  assert.deepEqual(ids(queueOf([...busy(10), ...many], { limit: 2 })), ['quiet-7', 'quiet-6']);
});

test('equal waits fall back to the name (named students before one with no name on file), then the id, whatever order the rows arrive in', () => {
  const { rows, classStats } = summarizeLiveClass([
    ...busy(),
    student('c', { quietMin: 5, firstName: 'Avery' }),
    student('b', { quietMin: 5, firstName: 'Blake' }),
    student('a', { quietMin: 5, firstName: 'Avery' }),
    student('no-name', { quietMin: 5, firstName: '', lastName: '' }),
    student('zed', { quietMin: 5, firstName: 'Zed' }),
  ], { nowValue: NOW, assignmentId: ASSIGNMENT });
  const order = (input) => seeNextQueue({ rows: input, classStats, nowValue: NOW, limit: 10 });
  // "Name unavailable" would sort between Blake and Zed by spelling; it is placed after both.
  const expected = ['a', 'c', 'b', 'zed', 'no-name'];
  assert.deepEqual(ids(order(rows)), expected);
  assert.deepEqual(ids(order([...rows].reverse())), expected);
  assert.deepEqual(ids(order([...rows.slice(4), ...rows.slice(0, 4)])), expected);
  const unnamed = order(rows).items.find((entry) => entry.id === 'no-name');
  assert.equal(unnamed.nameMissing, true);
  assert.match(unnamed.idLabel, /no-name/, 'a student with no name on file carries the labelled id the panel shows beside it');
});

test('a row with no student id is never listed (it could not be opened)', () => {
  const { rows, classStats } = summarizeLiveClass([...busy(), student('real', { quietMin: 5 })], { nowValue: NOW, assignmentId: ASSIGNMENT });
  const real = rows.find((row) => row.id === 'real');
  assert.deepEqual(ids(seeNextQueue({ rows: [real], classStats, nowValue: NOW })), ['real']);
  assert.deepEqual(ids(seeNextQueue({ rows: [{ ...real, id: '' }], classStats, nowValue: NOW })), []);
});

test('a student who is both stuck and has a hand up is listed once, as a hand', () => {
  const queue = queueOf([...busy(), student('both', { quietMin: 6, attempts: 5, helpMinAgo: 3 })]);
  assert.deepEqual(ids(queue), ['both']);
  assert.equal(queue.items[0].kind, 'help');
  assert.equal(queue.total, 1);
});

test('the question is named the way the tile names it: the number within its section', () => {
  const inSection = student('in-section', { quietMin: 5, questionIndex: 13 });
  inSection.liveStatus.sectionQuestionIndex = 3; // Q14 of the assignment, Q4 of Classwork
  const olderPayload = student('older-payload', { quietMin: 4, questionIndex: 6 });
  delete olderPayload.liveStatus.sectionQuestionIndex; // a heartbeat from before sections were written
  const queue = queueOf([...busy(), inSection, olderPayload]);
  assert.deepEqual(queue.items.map((entry) => [entry.id, entry.reason]), [
    ['in-section', 'Quiet for 5 min · Q4'],
    ['older-payload', 'Quiet for 4 min · Q7'],
  ]);
});

test('when most of the room is quiet at once, quiet time ranks no one; hands and stuck students still do', () => {
  const room = [
    student('q1', { quietMin: 6 }), student('q2', { quietMin: 7 }), student('q3', { quietMin: 8 }), student('q4', { quietMin: 9 }),
    student('typing', { quietMin: 0.2 }),
    student('hand', { quietMin: 6, helpMinAgo: 2 }),
    student('stuck', { quietMin: 5, attempts: 3 }),
  ];
  const queue = queueOf(room);
  assert.equal(queue.classwideQuiet, true);
  assert.deepEqual(ids(queue), ['hand', 'stuck']);
  // With only three students working, all of them quiet proves nothing about "the room" (the
  // monitor's own floor is four working students), so they are ranked like anyone else.
  const small = queueOf([student('x', { quietMin: 8 }), student('y', { quietMin: 9 }), student('z', { quietMin: 10 })]);
  assert.equal(small.classwideQuiet, false);
  assert.deepEqual(ids(small), ['z', 'y', 'x']);
});

test('minutes are said plainly', () => {
  assert.equal(minutesText(0), 'under a minute');
  assert.equal(minutesText(59_000), 'under a minute');
  assert.equal(minutesText(60_000), '1 min');
  assert.equal(minutesText(7 * MIN + 30_000), '7 min');
  assert.equal(minutesText(undefined), 'under a minute');
});

test('nothing in, nothing out', () => {
  assert.deepEqual(seeNextQueue(), { items: [], classwideQuiet: false, total: 0 });
  assert.deepEqual(seeNextQueue({ rows: [null, {}, { id: 'x' }] }).items, []);
});

test('the monitor shows it in the Room and Attention views, never in Walkthrough and never on the projector', () => {
  const monitor = readFileSync(new URL('../../src/components/teacher/LiveClassMonitor.jsx', import.meta.url), 'utf8');
  assert.match(monitor, /import \{ seeNextQueue \} from '\.\.\/\.\.\/platform\/teacher\/liveSeeNext\.js';/);
  assert.match(monitor, /const seeNext = useMemo\(\(\) => seeNextQueue\(\{ rows, classStats, nowValue \}\), \[rows, classStats, nowValue\]\);/);
  const panel = region(monitor, "{mode !== 'walkthrough' && !projecting && (seeNext.items.length > 0 || seeNext.classwideQuiet) && (", "{mode === 'walkthrough' ? (", 'the See next panel');
  assert.match(panel, /aria-label="Who to see next"/);
  assert.match(panel, /onClick=\{\(\) => onOpenStudent\?\.\(entry\.id\)\}/, 'a name opens that student, like a tile');
  assert.match(panel, /seeNext\.items\.map\(/);
  assert.match(panel, /entry\.nameMissing && entry\.idLabel/, 'a student with no name on file shows their labelled id, never the id as a name');
  assert.match(panel, /seeNext\.classwideQuiet && \(/, 'and says why quiet time was not used');
  // `projecting` is the Large room tiles: the same flag that hides student ids elsewhere.
  assert.match(monitor, /const projecting = mode === 'room' && roomMode;/);
});
