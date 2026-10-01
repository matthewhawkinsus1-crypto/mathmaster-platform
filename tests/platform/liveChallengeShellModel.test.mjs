import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_STAGE,
  COUNTDOWN_STEPS,
  GO_FLASH_MS,
  HOST_COMMAND,
  ROUND_CLOSE_AFTER_ALL_DONE_MS,
  ROUND_CLOSE_AFTER_DEADLINE_MS,
  challengeClock,
  cueRemainingMs,
  formatChallengeClock,
  hostPrimaryAction,
  nextClockBoundaryMs,
  provisionalRoundFor,
  roomRunsQuestionSets,
  roundCloseDue,
  roundCounts,
  stageHasOpenRound,
  stageIsTerminal,
  studentGuidance,
} from '../../src/platform/liveChallenge/challengeShellModel.js';
import { listChallengeModes, roundStructureFor, ROUND_STRUCTURE } from '../../functions/shared/liveChallengeModes.mjs';
import { ROUND_SYNC_LEAD_MS, SUBMISSION_ARRIVAL_GRACE_MS } from '../../functions/shared/liveChallengeParity.mjs';
import { ROUND_COUNTDOWN_LEAD_MS, buildRoundTimer } from '../../functions/shared/liveChallengeTimer.mjs';
import { publicLeaderboard } from '../../functions/shared/liveChallenge.mjs';
import { RUSH_MODE_ID } from '../../functions/shared/graphFeatureRushRules.mjs';

/*
 * THE LIVE CHALLENGE SHELL, AS DATA (challengeShellModel.js).
 *
 * Every screen — the console, the projector, a student's device — reads the
 * match's stage, its clock and what happens next from these functions, so
 * they are tested here as functions: two screens at the same server instant
 * must say the same thing.
 */

const T0 = 1_000_000;
// A round opened at T0 the way the server opens one: behind the countdown lead.
const opened = (extra = {}) => {
  const timer = buildRoundTimer({ nowMs: T0, syncLeadMs: ROUND_COUNTDOWN_LEAD_MS, durationMs: 30_000 });
  return {
    roomId: 'room-1',
    status: 'running',
    roundState: 'open',
    currentRound: 0,
    roundVersion: 1,
    roundCount: 5,
    startsAt: timer.startsAtMs,
    endsAt: timer.endsAtMs,
    ...extra,
  };
};
const START = T0 + ROUND_COUNTDOWN_LEAD_MS;
const END = START + 30_000;

/* ------------------------------- the stage ------------------------------- */

test('the stage is derived from the room and the server clock — never a stored flag', () => {
  assert.equal(challengeClock({ status: 'lobby' }, T0).stage, CHALLENGE_STAGE.LOBBY);
  assert.equal(challengeClock(opened(), T0).stage, CHALLENGE_STAGE.COUNTDOWN);
  assert.equal(challengeClock(opened(), START).stage, CHALLENGE_STAGE.ROUND_ACTIVE);
  assert.equal(challengeClock(opened(), END - 1).stage, CHALLENGE_STAGE.ROUND_ACTIVE);
  assert.equal(challengeClock(opened(), END).stage, CHALLENGE_STAGE.ROUND_LOCKED, 'past the deadline, before the close');
  assert.equal(challengeClock(opened({ roundState: 'closed' }), END + 5_000).stage, CHALLENGE_STAGE.ROUND_RESULTS);
  assert.equal(challengeClock(opened({ status: 'finished' }), END).stage, CHALLENGE_STAGE.COMPLETED);
  assert.equal(challengeClock(opened({ status: 'cancelled' }), END).stage, CHALLENGE_STAGE.CANCELLED);
  // A legacy room (no roundState) with a round index is an open round.
  assert.equal(challengeClock(opened({ roundState: undefined }), START + 1).stage, CHALLENGE_STAGE.ROUND_ACTIVE);
  assert.ok(stageHasOpenRound(CHALLENGE_STAGE.ROUND_LOCKED));
  assert.ok(!stageHasOpenRound(CHALLENGE_STAGE.ROUND_RESULTS));
  assert.ok(stageIsTerminal(CHALLENGE_STAGE.COMPLETED) && stageIsTerminal(CHALLENGE_STAGE.CANCELLED));
  assert.ok(!stageIsTerminal(CHALLENGE_STAGE.ROUND_RESULTS));
});

test('3 · 2 · 1 · GO is read off the round\'s own start, on every screen alike', () => {
  assert.equal(COUNTDOWN_STEPS, 3);
  assert.ok(ROUND_COUNTDOWN_LEAD_MS >= COUNTDOWN_STEPS * 1000, 'the lead is long enough to show every step');
  assert.ok(ROUND_COUNTDOWN_LEAD_MS >= ROUND_SYNC_LEAD_MS);
  const steps = [];
  for (let at = T0; at < START; at += 250) steps.push(challengeClock(opened(), at).countdownStep);
  // The steps only ever count down, through 3, 2 and 1.
  assert.deepEqual([...new Set(steps)], [3, 2, 1]);
  assert.equal(challengeClock(opened(), START - 1).countdownStep, 1);
  assert.equal(challengeClock(opened(), START - 1_001).countdownStep, 2);
  // GO for a moment after the start, then the round.
  assert.equal(challengeClock(opened(), START).showGo, true);
  assert.equal(challengeClock(opened(), START + GO_FLASH_MS - 1).showGo, true);
  assert.equal(challengeClock(opened(), START + GO_FLASH_MS).showGo, false);
  assert.equal(challengeClock(opened(), START).countdownStep, null);
  // Two devices that opened at different moments agree at the same instant.
  const instant = START - 1_500;
  assert.deepEqual(challengeClock(opened(), instant), challengeClock({ ...opened() }, instant));
});

test('the clock\'s next boundary is exactly when the stage, the step or GO changes', () => {
  // A screen re-derives at these instants instead of re-rendering on a timer.
  const visited = [];
  let at = T0;
  for (let guard = 0; guard < 20; guard += 1) {
    const next = nextClockBoundaryMs(opened(), at);
    if (next === null) break;
    assert.ok(next > at, 'always in the future');
    visited.push(next - START);
    at = next;
  }
  assert.deepEqual(visited, [-2_000, -1_000, 0, GO_FLASH_MS, 30_000]);
  assert.equal(nextClockBoundaryMs(opened(), END + 1), null, 'nothing scheduled after the deadline');
  assert.equal(nextClockBoundaryMs(opened({ roundState: 'closed' }), END), null);
  assert.equal(nextClockBoundaryMs({ status: 'lobby' }, T0), null);
  // Between boundaries the stage really is constant.
  for (let index = 0; index < visited.length - 1; index += 1) {
    const from = START + visited[index];
    const to = START + visited[index + 1];
    const reading = challengeClock(opened(), from);
    const later = challengeClock(opened(), to - 1);
    assert.equal(later.stage, reading.stage);
    assert.equal(later.countdownStep, reading.countdownStep);
    assert.equal(later.showGo, reading.showGo);
  }
});

test('time left counts from the start, and an open Pace Race shows elapsed time', () => {
  assert.equal(challengeClock(opened(), T0).remainingMs, 30_000, 'the countdown never eats the round');
  assert.equal(challengeClock(opened(), START + 10_000).remainingMs, 20_000);
  assert.equal(challengeClock(opened(), END + 50).remainingMs, 0);
  assert.equal(challengeClock(opened({ roundState: 'closed' }), END).remainingMs, null, 'a closed round has no time left to show');
  const pace = opened({ timingMode: 'pace', endsAt: null });
  assert.equal(challengeClock(pace, START + 12_000).openEnded, true);
  assert.equal(challengeClock(pace, START + 12_000).remainingMs, null);
  assert.equal(challengeClock(pace, START + 12_000).elapsedMs, 12_000);
  assert.equal(formatChallengeClock(61_000), '1:01');
  assert.equal(formatChallengeClock(400), '0:01', 'rounds up: 0:00 means time is really up');
  assert.equal(formatChallengeClock(0), '0:00');
  assert.equal(formatChallengeClock(-5), '0:00');
});

test('round counts name a Second Chance round as one, never "round 7 of 5"', () => {
  assert.deepEqual(
    { ...roundCounts(opened({ currentRound: 2 })) },
    { roundIndex: 2, roundNumber: 3, scheduledRoundCount: 5, roundCount: 5, isReplay: false, replayNumber: null, hasAdditionalReplay: false, isLastScheduledRound: false },
  );
  assert.equal(roundCounts(opened({ currentRound: 4 })).isLastScheduledRound, true);
  const replay = roundCounts(opened({ currentRound: 6, scheduledRoundCount: 5, secondChanceOf: 1, finalRoundNumber: 2 }));
  assert.equal(replay.isReplay, true);
  assert.equal(replay.replayNumber, 2);
  assert.equal(replay.isLastScheduledRound, false);
  assert.equal(replay.roundCount, 7, 'a count never below the round on screen');
});

/* ------------------------- what the boards may show ------------------------ */

test('working points belong on the board only while the round takes answers', () => {
  assert.equal(provisionalRoundFor(opened(), T0), null, 'not during the countdown');
  assert.equal(provisionalRoundFor(opened(), START + 1), 0);
  assert.equal(provisionalRoundFor(opened(), END), null, 'not after the buzzer: the board is what was banked');
  assert.equal(provisionalRoundFor(opened({ roundState: 'closed' }), END), null);
  // The root cause of phantom points after the deadline: a student still
  // "working" at the buzzer kept their estimate on every board.
  const players = [
    { playerKey: 'a', alias: 'Ada', joined: true, score: 500, provisionalRound: 0, provisionalPoints: 300 },
    { playerKey: 'b', alias: 'Bo', joined: true, score: 600 },
  ];
  const during = publicLeaderboard(players, { activeRound: provisionalRoundFor(opened(), START + 1) });
  assert.equal(during.find((row) => row.playerKey === 'a').liveScore, 800);
  const after = publicLeaderboard(players, { activeRound: provisionalRoundFor(opened(), END + 1) });
  assert.equal(after.find((row) => row.playerKey === 'a').liveScore, 500);
  assert.deepEqual(after.map((row) => row.playerKey), ['b', 'a']);
});

test('sound cues hear no time left from the buzzer through the results', () => {
  assert.equal(cueRemainingMs(opened(), START + 5_000), 25_000);
  assert.equal(cueRemainingMs(opened(), END + 10), 0);
  assert.equal(cueRemainingMs(opened({ roundState: 'closed' }), END + 60_000), 0);
  assert.equal(cueRemainingMs(opened({ timingMode: 'pace', endsAt: null }), START + 5_000), undefined);
});

/* ------------------------------- round pacing ------------------------------ */

test('a round ends once: at the deadline (after the arrival grace) or when everyone has answered', () => {
  assert.ok(ROUND_CLOSE_AFTER_DEADLINE_MS > SUBMISSION_ARRIVAL_GRACE_MS, 'closing never refuses an answer the server would still accept');
  assert.equal(roundCloseDue({ room: opened(), joinedCount: 3, finishedCount: 1 }).dueAtMs, END + ROUND_CLOSE_AFTER_DEADLINE_MS);
  // Everyone answered early: a moment for the last answer's feedback, then close.
  const early = roundCloseDue({ room: opened(), joinedCount: 3, finishedCount: 3, allFinishedSinceMs: START + 8_000 });
  assert.deepEqual({ ...early }, { dueAtMs: START + 8_000 + ROUND_CLOSE_AFTER_ALL_DONE_MS, reason: 'allFinished' });
  // Finishing during the countdown is measured from the start.
  const instant = roundCloseDue({ room: opened(), joinedCount: 1, finishedCount: 1, allFinishedSinceMs: T0 });
  assert.equal(instant.dueAtMs, START + ROUND_CLOSE_AFTER_ALL_DONE_MS);
  // Nothing to close: no round, a closed one, a paused one, nobody joined.
  assert.equal(roundCloseDue({ room: { status: 'lobby' } }), null);
  assert.equal(roundCloseDue({ room: opened({ roundState: 'closed' }), joinedCount: 2, finishedCount: 2, allFinishedSinceMs: START }), null);
  assert.equal(roundCloseDue({ room: opened({ pausedAt: START + 1_000, pausedRemainingMs: 29_000 }), joinedCount: 2, finishedCount: 2, allFinishedSinceMs: START }), null);
  assert.equal(roundCloseDue({ room: opened({ endsAt: null, timingMode: 'pace' }), joinedCount: 0, finishedCount: 0, allFinishedSinceMs: START }), null);
  // Without a remembered "everyone finished" instant there is no early close.
  assert.equal(roundCloseDue({ room: opened(), joinedCount: 2, finishedCount: 2 }).reason, 'deadline');
});

test('a question-set round (a rush) closes on its deadline only', () => {
  assert.equal(roomRunsQuestionSets({ challengeMode: RUSH_MODE_ID }), true);
  assert.equal(roomRunsQuestionSets({ challengeMode: 'standard' }), false);
  // The student bundle cannot carry the mode registry, so the set is local;
  // it must match the registry exactly.
  for (const mode of listChallengeModes()) {
    assert.equal(
      roomRunsQuestionSets({ challengeMode: mode.id }),
      roundStructureFor(mode).id === ROUND_STRUCTURE.QUESTION_SET,
      `${mode.id} round structure`,
    );
  }
  const rush = opened({ challengeMode: RUSH_MODE_ID });
  const due = roundCloseDue({ room: rush, joinedCount: 4, finishedCount: 4, allFinishedSinceMs: START + 1_000 });
  assert.equal(due.reason, 'deadline');
});

/* ------------------------------ the host's move ----------------------------- */

test('the host has one primary control per stage — or a reason there is none', () => {
  const lobby = hostPrimaryAction({ room: { status: 'lobby', roundCount: 5 }, stage: CHALLENGE_STAGE.LOBBY, joinedCount: 0 });
  assert.equal(lobby.command, HOST_COMMAND.START);
  assert.equal(lobby.disabled, true, 'nobody to play with yet');
  assert.match(lobby.hint, /first student/);
  assert.equal(hostPrimaryAction({ room: { status: 'lobby' }, stage: CHALLENGE_STAGE.LOBBY, joinedCount: 2 }).disabled, false);
  for (const stage of [CHALLENGE_STAGE.COUNTDOWN, CHALLENGE_STAGE.ROUND_ACTIVE, CHALLENGE_STAGE.ROUND_PAUSED, CHALLENGE_STAGE.ROUND_LOCKED]) {
    const action = hostPrimaryAction({ room: opened(), stage, joinedCount: 3, finishedCount: 1 });
    assert.equal(action.command, null, `${stage}: rounds end on their own — no Next to press`);
    assert.ok(action.hint, `${stage} says what is happening`);
  }
  assert.match(hostPrimaryAction({ room: opened(), stage: CHALLENGE_STAGE.ROUND_ACTIVE, joinedCount: 3, finishedCount: 3 }).hint, /Everyone has finished/);
  // A Graph Feature Rush round ends on the clock: the hint never promises an
  // early end for "everyone answered", whatever the counts say.
  for (const finishedCount of [0, 3]) {
    const rush = hostPrimaryAction({ room: opened({ challengeMode: RUSH_MODE_ID }), stage: CHALLENGE_STAGE.ROUND_ACTIVE, joinedCount: 3, finishedCount });
    assert.equal(rush.command, null);
    assert.match(rush.hint, /until time runs out/);
    assert.doesNotMatch(rush.hint, /everyone|Everyone/);
  }
  const results = hostPrimaryAction({ room: opened({ roundState: 'closed', currentRound: 1 }), stage: CHALLENGE_STAGE.ROUND_RESULTS });
  assert.deepEqual([results.command, results.label], [HOST_COMMAND.ADVANCE, 'Next Round']);
  assert.match(results.hint, /round 3/);
  const last = hostPrimaryAction({ room: opened({ roundState: 'closed', currentRound: 4 }), stage: CHALLENGE_STAGE.ROUND_RESULTS });
  assert.equal(last.label, 'Finish & Show Final Standings');
  const secondChance = hostPrimaryAction({ room: opened({ roundState: 'closed', currentRound: 4, secondChanceMode: 'automatic' }), stage: CHALLENGE_STAGE.ROUND_RESULTS });
  assert.equal(secondChance.label, 'Continue', 'Second Chance may follow; the server decides');
  const replayMore = hostPrimaryAction({ room: opened({ roundState: 'closed', currentRound: 5, scheduledRoundCount: 5, secondChanceOf: 0, hasAdditionalReplay: true }), stage: CHALLENGE_STAGE.ROUND_RESULTS });
  assert.equal(replayMore.label, 'Next Final Round');
  assert.equal(hostPrimaryAction({ room: opened({ status: 'finished' }), stage: CHALLENGE_STAGE.COMPLETED }).command, HOST_COMMAND.PLAY_AGAIN);
  assert.equal(hostPrimaryAction({ room: opened({ status: 'cancelled' }), stage: CHALLENGE_STAGE.CANCELLED }).command, HOST_COMMAND.NEW_CHALLENGE);
});

/* ------------------------------ the student's words ----------------------------- */

test('a student is always told what is happening and what to do', () => {
  const stages = Object.values(CHALLENGE_STAGE);
  for (const stage of stages) {
    const guidance = studentGuidance({ room: opened(), stage });
    assert.ok(guidance.headline && guidance.detail, `${stage} has words`);
  }
  assert.match(studentGuidance({ room: opened(), stage: CHALLENGE_STAGE.COUNTDOWN }).detail, /Round 1 of 5/);
  assert.equal(studentGuidance({ room: opened(), stage: CHALLENGE_STAGE.ROUND_ACTIVE }).headline, 'Go!');
  assert.equal(studentGuidance({ room: opened(), stage: CHALLENGE_STAGE.ROUND_ACTIVE, answered: true }).headline, 'Answer locked in');
  assert.equal(studentGuidance({ room: opened(), stage: CHALLENGE_STAGE.ROUND_ACTIVE, finishedEarly: true }).headline, 'Round complete');
  assert.match(studentGuidance({ room: opened(), stage: CHALLENGE_STAGE.ROUND_LOCKED }).detail, /results are coming/);
  assert.match(studentGuidance({ room: opened({ roundState: 'closed' }), stage: CHALLENGE_STAGE.ROUND_RESULTS }).detail, /Round 2 starts when your teacher is ready/);
  assert.match(studentGuidance({ room: opened({ roundState: 'closed', currentRound: 4 }), stage: CHALLENGE_STAGE.ROUND_RESULTS }).detail, /Final standings are next/);
  assert.match(studentGuidance({ room: opened({ roundState: 'closed', currentRound: 4, secondChanceMode: 'automatic' }), stage: CHALLENGE_STAGE.ROUND_RESULTS }).detail, /Second Chance round may follow/);
  // LATE JOIN: a student who walked in on a round is told they are in from here.
  const late = studentGuidance({ room: opened({ currentRound: 2 }), stage: CHALLENGE_STAGE.ROUND_ACTIVE, joinedAtRound: 2 });
  assert.equal(late.headline, 'You joined during round 3');
  assert.equal(studentGuidance({ room: opened({ currentRound: 0 }), stage: CHALLENGE_STAGE.ROUND_ACTIVE, joinedAtRound: 0 }).headline, 'You joined during round 1', 'the first round counts too');
  assert.equal(studentGuidance({ room: opened({ currentRound: 3 }), stage: CHALLENGE_STAGE.ROUND_ACTIVE, joinedAtRound: 2 }).headline, 'Go!', 'only the round they walked in on');
  assert.match(studentGuidance({ room: opened({ status: 'cancelled' }), stage: CHALLENGE_STAGE.CANCELLED }).detail, /Nothing from it is recorded/);
});
