// The Live Challenge shell QA's `reconnect` scenario raced itself (PR #415,
// I-11): it force-closed round 1 on the line after a student's "Lock In
// Answer" click, and when the student's request reached the server second the
// server refused it — correctly — so Chrome logged a 400 and the scenario's
// console check failed while every functional check passed.
//
// These tests model that race with a transport whose latency the test sets,
// then hold the harness's fix (tests/browser/support/submissionSettled.mjs) to
// two things: the round is never moved before the answer settles, and every
// way an answer can genuinely fail still fails the harness.
//
// The browser reproduction is the QA itself: the scenario slows that
// student's transport to 400 ms, which made the old ordering fail on every run.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { awaitSettledSubmission, SUBMIT_CALLABLE, SubmissionNotSettled } from '../browser/support/submissionSettled.mjs';
import { region } from './helpers/sourceContract.mjs';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/*
 * One student page, one bridge, one room. `click()` records the call on the
 * page (as liveChallengeBridgeService.js does) and returns at once, like a
 * Playwright click; the request reaches the server `latencyMs` later. The
 * server refuses a submit for a closed round, exactly as
 * submitLiveChallengeResponse does.
 */
const classroom = ({ latencyMs = 0, refuseWhileOpen = null, hang = false, neverSend = false, dropServerRecord = false } = {}) => {
  const clientCalls = [];
  const serverCalls = [];
  const room = { roundState: 'open' };
  let seq = 0;
  const handle = () => {
    if (room.roundState !== 'open') return { ok: false, code: 'failed-precondition', message: 'That Live Challenge round is no longer active.' };
    if (refuseWhileOpen) return { ok: false, code: refuseWhileOpen };
    return { ok: true, result: { isCorrect: true, pointsAwarded: 100 } };
  };
  const click = () => {
    if (neverSend) return;
    const entry = { name: SUBMIT_CALLABLE, at: Date.now(), payload: { submissionId: `sub-${(seq += 1)}` } };
    clientCalls.push(entry);
    if (hang) return;
    void sleep(latencyMs).then(() => {
      const outcome = handle();
      if (!dropServerRecord) serverCalls.push({ name: SUBMIT_CALLABLE, identity: { studentId: 's2' }, data: entry.payload, ok: outcome.ok, code: outcome.code });
      if (outcome.ok) entry.ok = true;
      else entry.error = `functions/${outcome.code}`;
    });
  };
  const forceClose = () => { room.roundState = 'closed'; };
  const refusals = () => serverCalls.filter((call) => !call.ok);
  return { clientCalls, serverCalls, click, forceClose, refusals, room };
};

const gate = (world, extra = {}) => awaitSettledSubmission({
  readClientCalls: async () => world.clientCalls,
  serverCalls: world.serverCalls,
  studentId: 's2',
  fromIndex: 0,
  timeoutMs: 600,
  pollMs: 5,
  ...extra,
});

test('the race: closing on the line after the click refuses an answer the student sent while the round was open', async () => {
  const world = classroom({ latencyMs: 40 });
  world.click();
  world.forceClose(); // the old harness's next line
  await sleep(80);
  assert.equal(world.refusals().length, 1, 'the slower request reaches a closed round');
  assert.equal(world.clientCalls[0].error, 'functions/failed-precondition', 'the page sees the 400 Chrome logs');
});

test('waiting for the answer to settle before the close: accepted at every latency, never refused', async () => {
  for (const latencyMs of [0, 1, 15, 40, 120, 400]) {
    const world = classroom({ latencyMs });
    world.click();
    // eslint-disable-next-line no-await-in-loop
    const settled = await gate(world);
    world.forceClose();
    assert.equal(settled.server.ok, true, `${latencyMs} ms: the server accepted it`);
    assert.equal(settled.client.payload.submissionId, settled.server.data.submissionId, 'the same answer on both sides');
    assert.equal(world.refusals().length, 0, `${latencyMs} ms: nothing refused`);
  }
});

const rejection = async (promise) => promise.then(() => assert.fail('the gate passed an answer that did not go through'), (error) => error);

test('the gate still fails when the screen never sends the answer', async () => {
  const world = classroom({ neverSend: true });
  world.click();
  const error = await rejection(gate(world));
  assert.ok(error instanceof SubmissionNotSettled);
  assert.equal(error.reason, 'never-sent');
});

test('the gate still fails when the submission hangs', async () => {
  const world = classroom({ hang: true });
  world.click();
  const error = await rejection(gate(world));
  assert.equal(error.reason, 'hung');
});

test('the gate still fails when the server refuses while the round is legitimately open', async () => {
  for (const code of ['failed-precondition', 'permission-denied', 'internal']) {
    const world = classroom({ refuseWhileOpen: code, latencyMs: 10 });
    world.click();
    // eslint-disable-next-line no-await-in-loop
    const error = await rejection(gate(world));
    assert.equal(error.reason, 'refused');
    assert.match(error.message, new RegExp(code));
    assert.equal(world.room.roundState, 'open', 'refused before the harness touched the round');
  }
});

test('the gate fails when the page says settled but the server has no record of that answer', async () => {
  const world = classroom({ latencyMs: 5, dropServerRecord: true });
  world.click();
  const error = await rejection(gate(world));
  assert.equal(error.reason, 'unrecorded');
});

test('the gate reads only calls made after the click it is waiting on', async () => {
  const world = classroom({ latencyMs: 5 });
  world.click();
  await gate(world);
  const fromIndex = world.clientCalls.length;
  const error = await rejection(gate(world, { fromIndex, timeoutMs: 60 }));
  assert.equal(error.reason, 'never-sent', 'an earlier settled answer does not satisfy a later wait');
});

test('the QA waits for the answer to settle before it force-closes the reconnect round, and does not hide 400s', async () => {
  const source = await readFile(new URL('../browser/liveChallengeShellQa.mjs', import.meta.url), 'utf8');
  const scenario = region(source, "await run('reconnect'", "await run('big-class'");
  const answer = scenario.indexOf('await answerInBrowser(s2, roomId');
  const settle = scenario.indexOf('await submissionSettled(s2', answer);
  const close = scenario.indexOf("teacherCall('closeLiveChallengeRound'", answer);
  assert.ok(answer > 0 && close > answer, 'the scenario answers, then force-closes');
  assert.ok(settle > answer && settle < close, 'the settle gate sits between the click and the force-close');
  // The console check still runs over the student who answered.
  assert.match(scenario, /consoleErrors\(S, \[[^\]]*\bs2\b[^\]]*\]\)/);
  // No 400 or "Failed to load resource" is ignorable anywhere in the QA.
  const ignorable = source.match(/const IGNORABLE_CONSOLE = (\/.*\/[a-z]*);/)?.[1] || '';
  assert.ok(ignorable, 'the QA declares what console text it ignores');
  assert.doesNotMatch(ignorable, /400|Bad Request|Failed to load resource/i);
});
