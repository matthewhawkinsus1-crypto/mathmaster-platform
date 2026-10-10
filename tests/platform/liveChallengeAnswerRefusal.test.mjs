// AN ANSWER THAT ARRIVES BEFORE GO IS NOT A CLOSED ROUND.
//
// A device whose synced clock runs a little ahead of the server's shows GO
// first. A student who answers at that GO can reach the server before the
// round has started there, and the server refuses the answer (it must: nothing
// counts before GO). The screen used to treat that refusal like a closed
// round: it threw the locked answer away and said "That round has closed",
// and the student had no answer for the round. In the launch certification
// the same happened to a simulated device, so the round never closed.
//
// The rule (src/platform/liveChallenge/challengeAnswerRefusal.js) is pinned
// here as behaviour. The screen and the simulated device both use it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  REFUSAL_OUTCOME,
  RESEND_AT_GO_MARGIN_MS,
  RESEND_AT_GO_MAX,
  ROUND_NOT_STARTED,
  classifyAnswerRefusal,
  refusedBeforeGo,
  resendAtGoDelayMs,
} from '../../src/platform/liveChallenge/challengeAnswerRefusal.js';
import { buildRoundTimer, timerAcceptsArrival } from '../../functions/shared/liveChallengeTimer.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const server = executableSource(await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8'));
const refusalSource = region(server, 'const liveChallengeArrivalRefusal', ';\n', 'the arrival refusal');
const [notStartedMessage, timeUpMessage] = [...refusalSource.matchAll(/"([^"]+\.)"/g)].map((match) => match[1]);

// What httpsCallable throws for an HttpsError: code `functions/<code>`, the
// server's message, and its details, untouched.
const callableError = (code, message, details) => Object.assign(new Error(message), { code: `functions/${code}`, details });
// What the server throws for an arrival outside the round (liveChallengeArrivalRefusal).
const serverRefusal = (arrival) => callableError('deadline-exceeded', arrival.reason === ROUND_NOT_STARTED ? notStartedMessage : timeUpMessage, { reason: arrival.reason || null });

test('the server refuses an early answer with a reason this rule reads, and a message it can fall back on', () => {
  // The refusal carries the timer's own reason in its details.
  assert.match(refusalSource, /new HttpsError\("deadline-exceeded",/);
  assert.match(refusalSource, /\{ reason: arrival\?\.reason \|\| null \}/);
  assert.ok(notStartedMessage && timeUpMessage, 'both refusal messages were found');
  // The reason the server's timer gives an answer that arrived before GO is
  // the one this rule treats as "send it again at GO"; a late one is not.
  const timer = buildRoundTimer({ nowMs: 100_000, syncLeadMs: 3_500, durationMs: 30_000 });
  assert.equal(timerAcceptsArrival(timer, timer.startsAtMs - 1).reason, ROUND_NOT_STARTED);
  assert.notEqual(timerAcceptsArrival(timer, timer.endsAtMs + 60_000).reason, ROUND_NOT_STARTED);
  // The fallback, for a refusal that arrives without details, knows the
  // server's words for each case.
  assert.equal(refusedBeforeGo({ code: 'functions/deadline-exceeded', message: notStartedMessage }), true);
  assert.equal(refusedBeforeGo({ code: 'functions/deadline-exceeded', message: timeUpMessage }), false);
});

test('a refusal before GO is retried at GO; a closed, late or missing round is closed', () => {
  const timer = buildRoundTimer({ nowMs: 100_000, syncLeadMs: 3_500, durationMs: 30_000 });
  const early = serverRefusal(timerAcceptsArrival(timer, timer.startsAtMs - 20));
  const late = serverRefusal(timerAcceptsArrival(timer, timer.endsAtMs + 60_000));
  assert.equal(classifyAnswerRefusal(early), REFUSAL_OUTCOME.RETRY_AT_GO);
  assert.equal(classifyAnswerRefusal(late), REFUSAL_OUTCOME.CLOSED);
  // Every other way the server says the round is over for this answer.
  assert.equal(classifyAnswerRefusal(callableError('deadline-exceeded', timeUpMessage, { reason: 'round_paused' })), REFUSAL_OUTCOME.CLOSED);
  assert.equal(classifyAnswerRefusal(callableError('failed-precondition', 'This round is closed.')), REFUSAL_OUTCOME.CLOSED);
  assert.equal(classifyAnswerRefusal(callableError('not-found', 'That Live Challenge is no longer available.')), REFUSAL_OUTCOME.CLOSED);
  // "The challenge has not started" (a lobby) is a different refusal from a
  // round that has not reached GO: nothing is waiting to start for that answer.
  assert.equal(classifyAnswerRefusal(callableError('failed-precondition', 'The challenge has not started.')), REFUSAL_OUTCOME.CLOSED);
  // The round already holds this student's answer.
  assert.equal(classifyAnswerRefusal(callableError('already-exists', 'You already answered this round.')), REFUSAL_OUTCOME.ALREADY_RECORDED);
  // A dropped connection or a server hiccup keeps the envelope for a retry.
  for (const code of ['unavailable', 'internal', 'permission-denied', 'invalid-argument']) {
    assert.equal(classifyAnswerRefusal(callableError(code, 'x')), REFUSAL_OUTCOME.TRANSIENT, code);
  }
  assert.equal(classifyAnswerRefusal(new Error('Failed to fetch')), REFUSAL_OUTCOME.TRANSIENT);
  assert.equal(classifyAnswerRefusal(null), REFUSAL_OUTCOME.TRANSIENT);
});

test('the reason decides; the message is only a fallback', () => {
  // Without details (an older server, or a wrapper that dropped them), the
  // server's words for an early answer still mean "at GO".
  assert.equal(classifyAnswerRefusal(callableError('deadline-exceeded', notStartedMessage)), REFUSAL_OUTCOME.RETRY_AT_GO);
  // With a reason, the reason wins over the message, either way.
  assert.equal(classifyAnswerRefusal(callableError('deadline-exceeded', notStartedMessage, { reason: 'arrival_window_expired' })), REFUSAL_OUTCOME.CLOSED);
  assert.equal(classifyAnswerRefusal(callableError('deadline-exceeded', 'deadline-exceeded', { reason: ROUND_NOT_STARTED })), REFUSAL_OUTCOME.RETRY_AT_GO);
  // A client-side timeout (httpsCallable's own deadline-exceeded) is what it
  // always was: it says nothing about GO.
  assert.equal(classifyAnswerRefusal(callableError('deadline-exceeded', 'deadline-exceeded')), REFUSAL_OUTCOME.CLOSED);
  // Only a deadline-exceeded refusal can mean "before GO".
  assert.equal(classifyAnswerRefusal(callableError('failed-precondition', notStartedMessage, { reason: ROUND_NOT_STARTED })), REFUSAL_OUTCOME.CLOSED);
  // The simulated device's own wrapper uses the same code shape without a prefix too.
  assert.equal(classifyAnswerRefusal({ code: 'deadline-exceeded', details: { reason: ROUND_NOT_STARTED } }), REFUSAL_OUTCOME.RETRY_AT_GO);
});

test('the resend goes after GO plus the margin, never at or after the deadline, a few times at most', () => {
  const go = 1_000_000;
  const end = go + 30_000;
  // Never before GO plus the margin, on this device's server time.
  for (const serverNowMs of [go - 3_000, go - 1, go, go + 40, go + 249, go + 600]) {
    const delayMs = resendAtGoDelayMs({ serverNowMs, startsAtMs: go, endsAtMs: end, resendsSoFar: 0 });
    assert.ok(delayMs >= 0, `a delay for ${serverNowMs - go}`);
    assert.ok(serverNowMs + delayMs >= go + RESEND_AT_GO_MARGIN_MS, `${serverNowMs - go} ms after GO: resent at ${serverNowMs + delayMs - go}`);
  }
  // A refusal that comes back during the countdown waits for GO itself.
  assert.equal(resendAtGoDelayMs({ serverNowMs: go - 3_000, startsAtMs: go, endsAtMs: end }), 3_000 + RESEND_AT_GO_MARGIN_MS);
  // Each further refusal waits longer: a clock further ahead than the margin
  // gets spaced tries, not a burst.
  assert.deepEqual(
    [0, 1, 2].map((resendsSoFar) => resendAtGoDelayMs({ serverNowMs: go + 400, startsAtMs: go, endsAtMs: end, resendsSoFar })),
    [RESEND_AT_GO_MARGIN_MS, RESEND_AT_GO_MARGIN_MS * 2, RESEND_AT_GO_MARGIN_MS * 4],
  );
  // Bounded.
  assert.equal(resendAtGoDelayMs({ serverNowMs: go + 400, startsAtMs: go, endsAtMs: end, resendsSoFar: RESEND_AT_GO_MAX }), null);
  assert.equal(RESEND_AT_GO_MAX, 3);
  // Never at or after the student's deadline: a resend cannot buy time.
  assert.equal(resendAtGoDelayMs({ serverNowMs: end - 200, startsAtMs: go, endsAtMs: end }), null);
  assert.equal(resendAtGoDelayMs({ serverNowMs: end - RESEND_AT_GO_MARGIN_MS, startsAtMs: go, endsAtMs: end }), null);
  assert.equal(resendAtGoDelayMs({ serverNowMs: end - RESEND_AT_GO_MARGIN_MS - 1, startsAtMs: go, endsAtMs: end }), RESEND_AT_GO_MARGIN_MS);
  assert.equal(resendAtGoDelayMs({ serverNowMs: go, startsAtMs: go, endsAtMs: go + RESEND_AT_GO_MARGIN_MS }), null, 'a round shorter than the margin');
  // A round with no deadline (a Pace Race) is bounded by the count alone.
  assert.equal(resendAtGoDelayMs({ serverNowMs: go + 400, startsAtMs: go, endsAtMs: 0 }), RESEND_AT_GO_MARGIN_MS);
  // Without a known GO there is nothing to wait for: no automatic resend.
  for (const startsAtMs of [0, null, undefined, Number.NaN]) {
    assert.equal(resendAtGoDelayMs({ serverNowMs: go, startsAtMs, endsAtMs: end }), null, String(startsAtMs));
  }
  assert.equal(resendAtGoDelayMs({ serverNowMs: Number.NaN, startsAtMs: go, endsAtMs: end }), null);
});

// The whole exchange, on the server's own arrival rule: a device whose clock
// runs ahead answers at its GO, is refused, resends the same answer at GO,
// and that resend is accepted inside the round.
const playEarlyAnswer = ({ aheadMs, transitMs = 30, answeredAfterLocalGoMs = 11 }) => {
  const timer = buildRoundTimer({ nowMs: 100_000, syncLeadMs: 3_500, durationMs: 30_000 });
  const deviceServerNow = (realMs) => realMs + aheadMs;
  let sentAt = timer.startsAtMs - aheadMs + answeredAfterLocalGoMs;
  const sends = [];
  for (let resendsSoFar = 0; ; resendsSoFar += 1) {
    const arrival = timerAcceptsArrival(timer, sentAt + transitMs);
    sends.push({ arrivedAtMs: sentAt + transitMs, accepted: arrival.accepted });
    if (arrival.accepted) return { timer, sends };
    const outcome = classifyAnswerRefusal(serverRefusal(arrival));
    if (outcome !== REFUSAL_OUTCOME.RETRY_AT_GO) return { timer, sends, outcome };
    const refusedAt = sentAt + 2 * transitMs;
    const delayMs = resendAtGoDelayMs({ serverNowMs: deviceServerNow(refusedAt), startsAtMs: timer.startsAtMs, endsAtMs: timer.endsAtMs, resendsSoFar });
    if (delayMs === null) return { timer, sends, outcome: 'gave up' };
    sentAt = refusedAt + delayMs;
  }
};

test('a device 200 ms ahead: refused before GO, resent once, accepted just after GO', () => {
  const { timer, sends, outcome } = playEarlyAnswer({ aheadMs: 200 });
  assert.equal(outcome, undefined);
  assert.deepEqual(sends.map((send) => send.accepted), [false, true]);
  assert.ok(sends[0].arrivedAtMs < timer.startsAtMs, 'the first send really arrived before GO');
  assert.ok(sends[1].arrivedAtMs >= timer.startsAtMs && sends[1].arrivedAtMs - timer.startsAtMs < 1_000, `the resend arrived ${sends[1].arrivedAtMs - timer.startsAtMs} ms after GO`);
});

test('a clock up to a second ahead is still answered inside the bound; a device behind is never refused', () => {
  const second = playEarlyAnswer({ aheadMs: 1_000 });
  assert.equal(second.sends.at(-1).accepted, true, JSON.stringify(second));
  assert.ok(second.sends.length <= 1 + RESEND_AT_GO_MAX);
  assert.ok(second.sends.every((send) => send.arrivedAtMs < second.timer.endsAtMs), 'every send went inside the round');
  const behind = playEarlyAnswer({ aheadMs: -200 });
  assert.deepEqual(behind.sends.map((send) => send.accepted), [true]);
  // Far beyond what a calibrated clock gets wrong, it stops and keeps the
  // answer for the student's Retry rather than sending forever.
  assert.equal(playEarlyAnswer({ aheadMs: 10_000 }).outcome, 'gave up');
});
