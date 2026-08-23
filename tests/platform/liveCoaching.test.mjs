// WHAT TO SAY WHEN YOU GET TO THE DESK — AND WHAT NEVER TO SAY.
//
// The governing rule of the whole platform is the one this module is most
// tempted to break: "Adapt instruction and improve access without doing the
// mathematics for the student." A coaching line that contains a hint has done
// the thinking for the child, and it does it invisibly, one desk at a time.
//
// So the first test here is a blanket assertion over every suggestion the
// module can produce, and it is the most important test in the file.

import test from 'node:test';
import assert from 'node:assert/strict';

import { LIVE_FLAGS } from '../../src/livePresence.js';
import { MOVE, suggestMove, suggestMovesForClass } from '../../src/platform/teacher/liveCoaching.js';

const row = (flags, id = 's1') => ({ id, flags, severity: 'alert' });

const profile = (overrides = {}) => ({
  baseline: { established: true, events: 16 },
  instructionalBand: 'on',
  dokProfile: {},
  ...overrides,
});

const CAN_COMPUTE_CANNOT_REASON = profile({
  dokProfile: {
    1: { attempts: 12, accuracy: 0.92, confident: true },
    2: { attempts: 9, accuracy: 0.33, confident: true },
  },
});

const EVERY_CASE = [
  { row: row([LIVE_FLAGS.NOT_STARTED]), profile: null },
  { row: row([LIVE_FLAGS.STUCK]), profile: CAN_COMPUTE_CANNOT_REASON },
  { row: row([LIVE_FLAGS.STUCK]), profile: profile() },
  { row: row([LIVE_FLAGS.STRUGGLING]), profile: profile({ instructionalBand: 'above' }) },
  { row: row([LIVE_FLAGS.STRUGGLING]), profile: profile() },
  { row: row([LIVE_FLAGS.IDLE]), profile: profile() },
  { row: row([LIVE_FLAGS.BEHIND_PACE]), profile: profile() },
];

// --- the rule that governs everything ------------------------------------------

test('no suggestion anywhere contains mathematics', () => {
  // A coaching line with a hint in it has done the student's thinking, quietly,
  // one desk at a time. This is a blanket check over every branch the module
  // can reach — if a future suggestion smuggles in an operation or a number to
  // try, this fails before it ships.
  const forbidden = [
    /\bsolve\b/i, /\bmultiply\b/i, /\bdivide\b/i, /\bsubtract\b/i,
    /\btry\s+\d/i, /\bthe answer\b/i, /=/, /\bx\s*=/i, /\bslope\b/i,
    /\bplug in\b/i, /\bstart with\s+\d/i,
  ];
  EVERY_CASE.forEach((entry) => {
    const suggestion = suggestMove(entry);
    if (!suggestion) return;
    const text = `${suggestion.headline} ${suggestion.why}`;
    forbidden.forEach((pattern) => {
      assert.ok(!pattern.test(text), `"${text}" matched ${pattern}`);
    });
  });
});

test('every suggestion names the evidence it combined', () => {
  // A teacher must be able to disagree with a suggestion on the evidence rather
  // than on faith. This is the same reason nothing here says "AI recommended".
  EVERY_CASE.forEach((entry) => {
    const suggestion = suggestMove(entry);
    if (!suggestion) return;
    assert.ok(suggestion.why && suggestion.why.length > 40, `${suggestion.move} gives no reason`);
  });
});

// --- restraint -----------------------------------------------------------------

test('a student working steadily gets no coaching line at all', () => {
  // "Keep going" is not advice, and a line on every tile is a line a teacher
  // stops reading.
  assert.equal(suggestMove({ row: row([]), profile: profile() }), null);
});

test('a student who is not in the room is not a teaching problem', () => {
  assert.equal(suggestMove({ row: row([LIVE_FLAGS.OFFLINE, LIVE_FLAGS.STUCK]), profile: profile() }), null);
});

test('the class map is sparse, so an empty line cannot be rendered under a fine student', () => {
  const moves = suggestMovesForClass({
    rows: [row([], 'ok1'), row([LIVE_FLAGS.STUCK], 'stuck1'), row([], 'ok2')],
    profilesByStudentId: { stuck1: profile() },
  });
  assert.deepEqual(Object.keys(moves), ['stuck1']);
});

// --- the distinction that matters at the desk ----------------------------------

test('a student who can compute and is stuck is not handed an easier question', () => {
  // Handing them a smaller number teaches them that being stuck means waiting.
  const suggestion = suggestMove({ row: row([LIVE_FLAGS.STUCK]), profile: CAN_COMPUTE_CANNOT_REASON });
  assert.equal(suggestion.move, MOVE.ASK_TO_EXPLAIN);
  assert.match(suggestion.why, /procedure but not yet on reasoning/);
});

test('without that evidence, the fallback changes the representation rather than the difficulty', () => {
  const suggestion = suggestMove({ row: row([LIVE_FLAGS.STUCK]), profile: profile() });
  assert.equal(suggestion.move, MOVE.CHANGE_REPRESENTATION);
  assert.match(suggestion.headline, /not a smaller number/);
  assert.match(suggestion.why, /without shortening the thinking/);
});

test('a strong student having a bad session is protected from a lowered assignment', () => {
  const suggestion = suggestMove({
    row: row([LIVE_FLAGS.STRUGGLING]),
    profile: profile({ instructionalBand: 'above' }),
  });
  assert.equal(suggestion.move, MOVE.PROTECT_STRETCH);
  assert.match(suggestion.why, /One rough session is not a reason to lower their work/);
});

test('an unestablished profile cannot trigger a profile-dependent suggestion', () => {
  // The thin-evidence rule, again. A student with four answered questions has
  // not earned a diagnosis at their desk any more than on the alert queue.
  const thin = { baseline: { established: false, events: 4 }, dokProfile: { 1: { attempts: 12, accuracy: 0.95, confident: true } } };
  const suggestion = suggestMove({ row: row([LIVE_FLAGS.STUCK]), profile: thin });
  assert.equal(suggestion.move, MOVE.CHANGE_REPRESENTATION, 'falls back rather than diagnosing');
});

test('quiet is described as quiet, not as difficulty', () => {
  const suggestion = suggestMove({ row: row([LIVE_FLAGS.IDLE]), profile: profile() });
  assert.match(suggestion.why, /bathroom pass|thinking time|device/i);
  assert.match(suggestion.headline, /a look, not an intervention/);
});

test('behind on questions is not stated as behind on understanding', () => {
  const suggestion = suggestMove({ row: row([LIVE_FLAGS.BEHIND_PACE]), profile: profile() });
  assert.match(suggestion.headline, /not necessarily on understanding/);
});

test('not started is checked as access before it is treated as mathematics', () => {
  const suggestion = suggestMove({ row: row([LIVE_FLAGS.NOT_STARTED]), profile: null });
  assert.equal(suggestion.move, MOVE.RESTART_ACCESS);
  assert.match(suggestion.why, /device and the sign-in/);
});
