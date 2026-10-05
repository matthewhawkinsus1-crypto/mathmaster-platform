// WHEN THE HOST ASKS FOR A LIVE STANDINGS SNAPSHOT
// (src/platform/liveChallenge/standingsPublishPacer.js), on a fake clock: a
// lone change goes out at once, a burst rides one request per interval, the
// last change of a burst is never left behind, and the server's "too soon"
// and a failure are both waited out.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDINGS_PUBLISH_COALESCE_MS,
  STANDINGS_PUBLISH_INTERVAL_MS,
  STANDINGS_PUBLISH_RETRY_MS,
  createStandingsPublishPacer,
  hostStandingsSignature,
  roomPublishesLiveStandings,
} from '../../src/platform/liveChallenge/standingsPublishPacer.js';
import { STANDINGS_MIN_PUBLISH_INTERVAL_MS } from '../../functions/shared/liveChallengeStandingsProjection.mjs';

// A clock and timer queue the test advances by hand.
const fakeTime = () => {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const flush = async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve(); };
  return {
    now: () => now,
    setTimer: (fn, ms) => { seq += 1; timers.set(seq, { at: now + Math.max(0, ms), fn }); return seq; },
    clearTimer: (id) => { timers.delete(id); },
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        // eslint-disable-next-line no-await-in-loop
        await flush();
      }
      now = until;
      await flush();
    },
  };
};

const pacerWith = (clock, reply = async () => ({ published: true })) => {
  const sent = [];
  const pacer = createStandingsPublishPacer({
    publish: () => { sent.push(clock.now()); return reply(clock.now()); },
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  return { pacer, sent };
};

test('a lone change is published after the short coalescing window', async () => {
  const clock = fakeTime();
  const { pacer, sent } = pacerWith(clock);
  await clock.advance(5_000);
  pacer.changed();
  await clock.advance(STANDINGS_PUBLISH_COALESCE_MS - 1);
  assert.deepEqual(sent, [], 'not before the window');
  await clock.advance(1);
  assert.deepEqual(sent, [5_000 + STANDINGS_PUBLISH_COALESCE_MS]);
  await clock.advance(10_000);
  assert.equal(sent.length, 1, 'nothing more without a change');
});

test('a burst of changes rides at most one request per interval, and the last change is never left behind', async () => {
  const clock = fakeTime();
  const { pacer, sent } = pacerWith(clock);
  // A class answering for ten seconds: a change every 50 ms.
  for (let at = 0; at < 10_000; at += 50) {
    pacer.changed();
    // eslint-disable-next-line no-await-in-loop
    await clock.advance(50);
  }
  await clock.advance(5_000);
  for (let index = 1; index < sent.length; index += 1) assert.ok(sent[index] - sent[index - 1] >= STANDINGS_PUBLISH_INTERVAL_MS, `requests ${sent[index - 1]} and ${sent[index]} are closer than the interval`);
  assert.ok(sent.length <= Math.ceil(10_000 / STANDINGS_PUBLISH_INTERVAL_MS) + 1, `${sent.length} requests for ten seconds`);
  assert.ok(sent.at(-1) >= 9_950, `the last change (at 9,950 ms) was published at ${sent.at(-1)}`);
});

test('a change while a request is in flight earns exactly one more', async () => {
  const clock = fakeTime();
  let release;
  const { pacer, sent } = pacerWith(clock, () => new Promise((resolve) => { release = () => resolve({ published: true }); }));
  pacer.changed();
  await clock.advance(STANDINGS_PUBLISH_COALESCE_MS);
  assert.equal(sent.length, 1);
  pacer.changed();
  pacer.changed();
  await clock.advance(5_000);
  assert.equal(sent.length, 1, 'nothing is sent while one is in flight');
  release();
  await clock.advance(0);
  await clock.advance(STANDINGS_PUBLISH_INTERVAL_MS);
  assert.equal(sent.length, 2, 'one follow-up for the changes it missed');
  release();
  await clock.advance(10_000);
  assert.equal(sent.length, 2);
});

test('the server\'s "too soon" is waited out even when it is longer than the pacer\'s own interval', async () => {
  // Another console (a second tab) published a moment ago: the server names
  // the wait, and this console keeps to it rather than to its own clock.
  const clock = fakeTime();
  const replies = [{ published: false, reason: 'too-soon', retryAfterMs: 2_500 }, { published: true }];
  const { pacer, sent } = pacerWith(clock, () => Promise.resolve(replies.shift()));
  pacer.changed();
  await clock.advance(STANDINGS_PUBLISH_COALESCE_MS);
  assert.equal(sent.length, 1);
  await clock.advance(2_499);
  assert.equal(sent.length, 1, 'not before the server\'s wait, though the interval passed');
  await clock.advance(1);
  assert.equal(sent.length, 2);
  assert.equal(sent[1] - sent[0], 2_500);
});

test('"too soon" from the server is waited out and no longer, and a failure is retried no faster than the retry delay', async () => {
  const clock = fakeTime();
  const replies = [{ published: false, retryAfterMs: 700 }, Promise.reject(new Error('offline')), { published: true }];
  const { pacer, sent } = pacerWith(clock, () => {
    const next = replies.shift();
    return next instanceof Promise ? next : Promise.resolve(next);
  });
  replies[1].catch(() => {});
  pacer.changed();
  await clock.advance(STANDINGS_PUBLISH_COALESCE_MS);
  assert.equal(sent.length, 1);
  await clock.advance(699);
  assert.equal(sent.length, 1, 'not before the server\'s wait');
  await clock.advance(1);
  assert.equal(sent.length, 2, 'retried when the server said — a refused request does not start a whole new interval');
  assert.equal(sent[1] - sent[0], 700);
  await clock.advance(STANDINGS_PUBLISH_RETRY_MS - 1);
  assert.equal(sent.length, 2, 'a failure waits the retry delay');
  await clock.advance(1);
  assert.equal(sent.length, 3);
  assert.equal(sent[2] - sent[1], STANDINGS_PUBLISH_RETRY_MS);
  await clock.advance(10_000);
  assert.equal(sent.length, 3, 'published: nothing more is owed');
});

test('a host paced at its interval against a server floor below it is never refused, whatever each publish takes', async () => {
  // The server measures from its own write, the publish's duration after the
  // send; its floor sits below the host's interval so steady pacing is never
  // refused (a floor equal to the interval refused every other request).
  const clock = fakeTime();
  let lastWriteAt = -Infinity;
  const refused = [];
  const durationMs = 220;
  const { pacer, sent } = pacerWith(clock, async (sentAt) => {
    // The server's check runs early in the call; its write lands durationMs after the send.
    const sinceWrite = sentAt + 30 - lastWriteAt;
    if (sinceWrite < STANDINGS_MIN_PUBLISH_INTERVAL_MS) { refused.push(sentAt); return { published: false, reason: 'too-soon', retryAfterMs: Math.ceil(STANDINGS_MIN_PUBLISH_INTERVAL_MS - sinceWrite) }; }
    lastWriteAt = sentAt + durationMs;
    return { published: true };
  });
  for (let at = 0; at < 10_000; at += 50) {
    pacer.changed();
    // eslint-disable-next-line no-await-in-loop
    await clock.advance(50);
  }
  await clock.advance(5_000);
  assert.deepEqual(refused, [], 'no request was refused');
  for (let index = 1; index < sent.length; index += 1) assert.equal(sent[index] - sent[index - 1], STANDINGS_PUBLISH_INTERVAL_MS);
});

test('a stopped pacer sends nothing more', async () => {
  const clock = fakeTime();
  const { pacer, sent } = pacerWith(clock);
  pacer.changed();
  pacer.stop();
  pacer.changed();
  await clock.advance(10_000);
  assert.deepEqual(sent, []);
});

test('the host\'s signature moves with ranks, scores, names and arrivals — not with the clock', () => {
  const board = [{ playerKey: 'a', rank: 1, liveScore: 900, alias: 'A' }, { playerKey: 'b', rank: 2, liveScore: 400, alias: 'B' }];
  const same = hostStandingsSignature(board);
  assert.equal(hostStandingsSignature(board.map((row) => ({ ...row, streak: 3 }))), same);
  assert.notEqual(hostStandingsSignature([board[0], { ...board[1], liveScore: 401 }]), same);
  assert.notEqual(hostStandingsSignature([board[0], { ...board[1], rank: 1 }]), same);
  assert.notEqual(hostStandingsSignature([...board, { playerKey: 'c', rank: 3, liveScore: 0, alias: 'C' }]), same);
  assert.notEqual(hostStandingsSignature([board[0], { ...board[1], alias: 'Ben R.' }]), same);
});

test('live standings exist in the lobby and a running match — not in an open rush round, not after the end', () => {
  assert.equal(roomPublishesLiveStandings(null), false);
  assert.equal(roomPublishesLiveStandings({ status: 'lobby' }), true);
  assert.equal(roomPublishesLiveStandings({ status: 'running', roundState: 'open' }), true);
  assert.equal(roomPublishesLiveStandings({ status: 'running', roundState: 'open' }, { questionSetRoom: true }), false);
  assert.equal(roomPublishesLiveStandings({ status: 'running', roundState: 'closed' }, { questionSetRoom: true }), true);
  assert.equal(roomPublishesLiveStandings({ status: 'finished' }), false);
  assert.equal(roomPublishesLiveStandings({ status: 'cancelled' }), false);
});
