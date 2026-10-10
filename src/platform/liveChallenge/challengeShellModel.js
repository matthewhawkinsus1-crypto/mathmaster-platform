/*
 * THE LIVE CHALLENGE SHELL: WHERE THE GAME IS, AS DATA.
 *
 * Every Live Challenge screen — the teacher's console, the projector, a
 * student's device — answers the same three questions many times a second:
 * what stage is the match in, what does the clock say, and what happens next.
 * They used to answer them separately, from local booleans
 * (`started && !expired && …`), and disagreed at the edges: a projector
 * showing "Round complete" over a round the server still had open, a student
 * told "time is up" with no results ever coming, phantom "working…" points on
 * the board after the buzzer.
 *
 * This module is the one answer, derived from the authoritative room:
 *
 *   stage      deriveMatchState (liveChallengeLifecycle.mjs): lobby,
 *              countdown, roundActive, roundPaused, roundLocked, roundResults,
 *              completed, cancelled. Never a stored flag.
 *   clock      startsAt / endsAt (liveChallengeTimer.mjs) read at the caller's
 *              calibrated server time: the 3-2-1 countdown, time left, GO.
 *   pacing     when the host closes a finished round, and what its one
 *              primary control is now.
 *   guidance   what a student should be doing right now, in words.
 *
 * Pure: no React, no Firebase. Tested in node.
 */

import { MATCH_STATE, deriveMatchState, roomRoundState } from '../../../functions/shared/liveChallengeLifecycle.mjs';
import { timerElapsedMs, timerFromRoom } from '../../../functions/shared/liveChallengeTimer.mjs';
import { RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';
import { personalRoundTimer, storedTimeMultiplier } from '../../../functions/shared/liveChallengeAccommodations.mjs';

export const CHALLENGE_STAGE = MATCH_STATE;

// The countdown shows 3, 2, 1 from the round's authoritative start, then GO
// for a moment after it. Nothing here starts a timer of its own: a device
// that wakes mid-countdown shows the number the server clock says.
export const COUNTDOWN_STEPS = 3;
export const GO_FLASH_MS = 800;

// THE HOST CLOSES A FINISHED ROUND. After the deadline it waits out the
// arrival grace (a buzzer submission sent at 0:00 is still accepted) plus a
// margin, so closing never refuses work the server would have taken. When
// everyone has finished early it waits a moment, so the last student sees
// their own answer's feedback before the results replace it.
export const ROUND_CLOSE_AFTER_DEADLINE_MS = 1_500;
export const ROUND_CLOSE_AFTER_ALL_DONE_MS = 1_200;

// Modes whose rounds hold many questions per player. Read from the room's mode
// id because the student bundle does not carry the mode registry
// (liveChallengeModes.mjs brings Solver Race and the rush catalog with it); a
// test holds this set to the registry's question-set modes.
const QUESTION_SET_MODES = new Set([RUSH_MODE_ID]);
export const roomRunsQuestionSets = (room = {}) => QUESTION_SET_MODES.has(String(room?.challengeMode || ''));

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};

const STAGES_WITH_OPEN_ROUND = new Set([
  MATCH_STATE.COUNTDOWN, MATCH_STATE.ROUND_ACTIVE, MATCH_STATE.ROUND_PAUSED, MATCH_STATE.ROUND_LOCKED,
]);
export const stageHasOpenRound = (stage) => STAGES_WITH_OPEN_ROUND.has(stage);
export const stageIsTerminal = (stage) => stage === MATCH_STATE.COMPLETED || stage === MATCH_STATE.CANCELLED;

/** Round counts as a screen shows them; a second-chance replay adds rounds past the schedule. */
export const roundCounts = (room = {}) => {
  const roundIndex = integerOr(room?.currentRound, -1);
  const configured = Math.max(0, integerOr(room?.roundCount, 0));
  const scheduled = Math.max(0, integerOr(room?.scheduledRoundCount, 0)) || configured;
  const isReplay = room?.secondChanceOf !== undefined && room?.secondChanceOf !== null;
  return Object.freeze({
    roundIndex,
    roundNumber: Math.max(1, roundIndex + 1),
    scheduledRoundCount: Math.max(1, scheduled),
    roundCount: Math.max(1, scheduled, configured, roundIndex + 1),
    isReplay,
    replayNumber: isReplay ? Math.max(1, integerOr(room?.finalRoundNumber, roundIndex - scheduled + 1)) : null,
    hasAdditionalReplay: room?.hasAdditionalReplay === true,
    // The last round the schedule has. Replays may still follow it when the
    // room plays Second Chance; the server decides that when it advances.
    isLastScheduledRound: !isReplay && roundIndex >= 0 && roundIndex + 1 >= Math.max(1, scheduled),
  });
};

/**
 * Everything a screen needs from the room's clock at one instant.
 *
 * `nowMs` is the CALLER'S CALIBRATED SERVER TIME (Date.now() + offset). The
 * stage is the lifecycle's; the countdown step, GO and time left are read off
 * the same timestamps, so two screens at the same instant say the same thing.
 */
export const challengeClock = (room = {}, nowMs = Date.now()) => {
  const now = Number(nowMs);
  const stage = deriveMatchState(room || {}, now);
  const timer = timerFromRoom(room || {});
  const counts = roundCounts(room || {});
  const open = stageHasOpenRound(stage);
  const startsAtMs = timer.startsAtMs || null;
  const endsAtMs = timer.endsAtMs || null;
  const untilStartMs = open && startsAtMs ? Math.max(0, startsAtMs - now) : 0;
  const sinceStartMs = open && startsAtMs && now >= startsAtMs ? now - startsAtMs : null;
  return Object.freeze({
    stage,
    ...counts,
    startsAtMs,
    endsAtMs,
    // A Pace Race round has no deadline until its closing threshold sets one.
    openEnded: open && !endsAtMs,
    untilStartMs,
    countdownStep: stage === MATCH_STATE.COUNTDOWN
      ? Math.min(COUNTDOWN_STEPS, Math.max(1, Math.ceil(untilStartMs / 1000)))
      : null,
    showGo: stage === MATCH_STATE.ROUND_ACTIVE && sinceStartMs !== null && sinceStartMs < GO_FLASH_MS,
    remainingMs: !open
      ? null
      : (timer.pausedAtMs ? timer.pausedRemainingMs : (endsAtMs ? Math.max(0, endsAtMs - Math.max(now, startsAtMs || now)) : null)),
    elapsedMs: open ? timerElapsedMs(timer, now) : 0,
  });
};

/**
 * The next instant the stage, the countdown step or GO changes — so a screen
 * can re-derive exactly then instead of polling. Null when nothing is
 * scheduled (a lobby, results, a finished match). Time-left digits tick in
 * their own small component; they are not stage changes.
 */
export const nextClockBoundaryMs = (room = {}, nowMs = Date.now()) => {
  const now = Number(nowMs);
  const clock = challengeClock(room, now);
  if (!stageHasOpenRound(clock.stage) || clock.stage === MATCH_STATE.ROUND_PAUSED) return null;
  const candidates = [];
  if (clock.startsAtMs) {
    for (let step = COUNTDOWN_STEPS - 1; step >= 1; step -= 1) candidates.push(clock.startsAtMs - step * 1000);
    candidates.push(clock.startsAtMs, clock.startsAtMs + GO_FLASH_MS);
  }
  if (clock.endsAtMs) candidates.push(clock.endsAtMs);
  const upcoming = candidates.filter((at) => at > now);
  return upcoming.length ? Math.min(...upcoming) : null;
};

/**
 * Time left as the room's sound cues hear it (the audio director's
 * `remainingMs`): zero once the round is over — at the buzzer and through its
 * results, so the music stays down while the class talks the round through —
 * and undefined for an open-ended (Pace Race) round.
 */
export const cueRemainingMs = (room = {}, nowMs = Date.now()) => {
  const reading = challengeClock(room, nowMs);
  if (reading.stage === MATCH_STATE.ROUND_RESULTS) return 0;
  return reading.remainingMs ?? undefined;
};

/**
 * The round whose in-progress ("working…") points may be shown on a board.
 *
 * Provisional points are a student's running estimate, never banked. They
 * belong on the board only while the round is still taking answers: after the
 * deadline whatever was really earned arrives as a graded response, and a
 * closed round's board is its banked result. Passing the round on regardless
 * left a student who never submitted showing points on every screen after the
 * buzzer, which then vanished when the next round opened.
 */
export const provisionalRoundFor = (room = {}, nowMs = Date.now()) => (
  deriveMatchState(room || {}, nowMs) === MATCH_STATE.ROUND_ACTIVE ? integerOr(room?.currentRound, null) : null
);

/**
 * When the host should close the open round, or null.
 *
 * `finishedCount` is how many joined players have completed this round (a
 * classic round: answered it). `allFinishedSinceMs` is when the host first saw
 * everyone finished — the caller remembers it. Question-set rounds (every
 * player their own questions against the clock) close on the deadline.
 * Closing early is the same idempotent close command the teacher can press;
 * the server checks readiness again inside its transaction.
 */
export const roundCloseDue = ({
  room = {},
  joinedCount = 0,
  finishedCount = 0,
  allFinishedSinceMs = null,
} = {}) => {
  if (room?.status !== 'running' || roomRoundState(room) !== 'open') return null;
  const timer = timerFromRoom(room);
  if (timer.pausedAtMs) return null;
  const options = [];
  if (timer.endsAtMs) options.push({ dueAtMs: timer.endsAtMs + ROUND_CLOSE_AFTER_DEADLINE_MS, reason: 'deadline' });
  // A question-set round (a rush) is played against the clock: nobody is ever
  // "finished" before it, so only the deadline closes it.
  const everyoneDone = !roomRunsQuestionSets(room) && Number(joinedCount) > 0 && Number(finishedCount) >= Number(joinedCount);
  if (everyoneDone && Number.isFinite(Number(allFinishedSinceMs)) && Number(allFinishedSinceMs) > 0) {
    options.push({
      dueAtMs: Math.max(Number(allFinishedSinceMs), timer.startsAtMs || 0) + ROUND_CLOSE_AFTER_ALL_DONE_MS,
      reason: 'allFinished',
    });
  }
  if (!options.length) return null;
  return Object.freeze(options.reduce((best, option) => (option.dueAtMs < best.dueAtMs ? option : best)));
};

/*
 * THE HOST'S NEXT MOVE. One primary control per stage, so a teacher glancing
 * at the room always sees the single thing to press — or why there is
 * nothing to press yet.
 */
export const HOST_COMMAND = Object.freeze({
  START: 'start',
  ADVANCE: 'advance',
  FINISH: 'finish',
  CLOSE: 'close',
  CANCEL: 'cancel',
  PLAY_AGAIN: 'playAgain',
  NEW_CHALLENGE: 'newChallenge',
});

export const hostPrimaryAction = ({
  room = {},
  stage,
  joinedCount = 0,
  finishedCount = 0,
  secondChanceAutomatic = room?.secondChanceMode === 'automatic',
} = {}) => {
  const counts = roundCounts(room);
  switch (stage) {
    case MATCH_STATE.LOBBY:
      return Object.freeze({
        command: HOST_COMMAND.START,
        label: 'Start Challenge',
        disabled: Number(joinedCount) < 1,
        hint: Number(joinedCount) < 1
          ? 'Waiting for the first student to join.'
          : `${joinedCount} ${Number(joinedCount) === 1 ? 'student is' : 'students are'} in. Start when the class is ready — a 3-second countdown runs first.`,
      });
    case MATCH_STATE.COUNTDOWN:
      return Object.freeze({ command: null, label: null, disabled: true, hint: `Round ${counts.roundNumber} is about to start.` });
    case MATCH_STATE.ROUND_ACTIVE:
    case MATCH_STATE.ROUND_PAUSED: {
      // A question-set round (Graph Feature Rush) has more graphs than anyone
      // can finish: it ends on the clock, never because everyone answered.
      if (roomRunsQuestionSets(room)) {
        return Object.freeze({ command: null, label: null, disabled: true, hint: 'Students solve as many graphs as they can until time runs out. Results show automatically.' });
      }
      return Object.freeze({
        command: null,
        label: null,
        disabled: true,
        hint: Number(joinedCount) > 0 && Number(finishedCount) >= Number(joinedCount)
          ? 'Everyone has finished. Results are coming up.'
          : 'The round ends when time runs out or everyone has answered. Results show automatically.',
      });
    }
    case MATCH_STATE.ROUND_LOCKED:
      return Object.freeze({ command: null, label: null, disabled: true, hint: 'Time! Collecting the last answers, then the results.' });
    case MATCH_STATE.ROUND_RESULTS: {
      if (counts.isReplay) {
        return counts.hasAdditionalReplay
          ? Object.freeze({ command: HOST_COMMAND.ADVANCE, label: 'Next Final Round', disabled: false, hint: 'Another Second Chance round is ready.' })
          : Object.freeze({ command: HOST_COMMAND.ADVANCE, label: 'Finish & Show Final Standings', disabled: false, hint: 'That was the last round.' });
      }
      if (!counts.isLastScheduledRound) {
        return Object.freeze({
          command: HOST_COMMAND.ADVANCE,
          label: 'Next Round',
          disabled: false,
          hint: `Talk through the results, then start round ${counts.roundNumber + 1} when the class is ready. A 3-second countdown runs first.`,
        });
      }
      return secondChanceAutomatic
        ? Object.freeze({ command: HOST_COMMAND.ADVANCE, label: 'Continue', disabled: false, hint: 'Second Chance rounds follow if the class missed questions; otherwise the final standings.' })
        : Object.freeze({ command: HOST_COMMAND.ADVANCE, label: 'Finish & Show Final Standings', disabled: false, hint: 'That was the last round.' });
    }
    case MATCH_STATE.COMPLETED:
      return Object.freeze({ command: HOST_COMMAND.PLAY_AGAIN, label: 'Play Again', disabled: false, hint: 'Same class and settings, a fresh game. Students move into the new lobby automatically.' });
    case MATCH_STATE.CANCELLED:
      return Object.freeze({ command: HOST_COMMAND.NEW_CHALLENGE, label: 'New Challenge', disabled: false, hint: 'This game was cancelled. Nothing from it is recorded.' });
    default:
      return Object.freeze({ command: null, label: null, disabled: true, hint: '' });
  }
};

/*
 * WHAT A STUDENT SHOULD DO NOW. Every stage answers it in words — never a
 * blank screen or a bare spinner.
 */
export const studentGuidance = ({
  room = {},
  stage,
  answered = false,
  finishedEarly = false,
  joinedAtRound = null,
} = {}) => {
  const counts = roundCounts(room);
  // `joinedAtRound` is set only for a student who joined after the game began:
  // the round they walked in on, which they play from.
  const lateJoin = Number.isInteger(joinedAtRound) && joinedAtRound >= 0 && joinedAtRound === counts.roundIndex;
  switch (stage) {
    case MATCH_STATE.LOBBY:
      return Object.freeze({ tone: 'waiting', headline: 'You’re in!', detail: 'Waiting for your teacher to start the challenge. Keep this screen open.' });
    case MATCH_STATE.COUNTDOWN:
      return Object.freeze({
        tone: 'ready',
        headline: 'Get ready',
        detail: counts.isReplay ? `Second Chance round ${counts.replayNumber} is about to start.` : `Round ${counts.roundNumber} of ${counts.roundCount} is about to start.`,
      });
    case MATCH_STATE.ROUND_ACTIVE:
      if (answered || finishedEarly) {
        return Object.freeze({ tone: 'done', headline: finishedEarly ? 'Round complete' : 'Answer locked in', detail: 'Waiting for the others. The results show when the round ends.' });
      }
      return Object.freeze({
        tone: 'play',
        headline: lateJoin ? `You joined during round ${counts.roundNumber}` : 'Go!',
        detail: lateJoin ? 'You’re in for the rest of the game — answer before the timer runs out.' : 'Answer before the timer runs out.',
      });
    case MATCH_STATE.ROUND_PAUSED:
      return Object.freeze({ tone: 'waiting', headline: 'Paused', detail: 'Your teacher paused the round. The clock is stopped.' });
    case MATCH_STATE.ROUND_LOCKED:
      return Object.freeze({ tone: 'done', headline: 'Time’s up!', detail: 'Your work is locked in. The results are coming.' });
    case MATCH_STATE.ROUND_RESULTS:
      return Object.freeze({
        tone: 'results',
        headline: counts.isReplay ? `Second Chance round ${counts.replayNumber} results` : `Round ${counts.roundNumber} results`,
        detail: counts.isReplay
          ? (counts.hasAdditionalReplay ? 'Another Second Chance round is next.' : 'Final standings are next.')
          : counts.isLastScheduledRound
            ? (room?.secondChanceMode === 'automatic'
              ? 'Your teacher continues next — a Second Chance round may follow.'
              : 'Final standings are next. Your teacher will show them.')
            : `Round ${counts.roundNumber + 1} starts when your teacher is ready.`,
      });
    case MATCH_STATE.COMPLETED:
      return Object.freeze({ tone: 'final', headline: 'Challenge complete', detail: 'Here is how you finished.' });
    case MATCH_STATE.CANCELLED:
      return Object.freeze({ tone: 'final', headline: 'Challenge ended', detail: 'Your teacher cancelled this challenge. Nothing from it is recorded.' });
    default:
      return Object.freeze({ tone: 'waiting', headline: 'Loading…', detail: '' });
  }
};

/** m:ss, rounding up so 0:00 means time is really up. */
export const formatChallengeClock = (milliseconds) => {
  const total = Math.max(0, Math.ceil((Number(milliseconds) || 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/*
 * A STUDENT'S OWN ROUND CLOCK. A student with extended time on their plan
 * (liveChallengeAccommodations.mjs) answers against their own deadline: the
 * same start, the round's length times their multiplier. The server judges
 * their answer against exactly that deadline and keeps the round open for
 * them, so their screen must count down to it — not to the class's — and its
 * buzzer must fire there. Everyone else's clock is the room's, unchanged.
 *
 * `timeMultiplier` is the student's own (their invite), never the room's
 * largest: the room only knows that someone has more time, not who.
 */
export const personalRoundClock = ({ startsAtMs = 0, endsAtMs = 0, timeMultiplier = 1, fullDurationMs = 0 } = {}) => {
  const start = Number(startsAtMs) || 0;
  const end = Number(endsAtMs) || 0;
  // From the round's full length (the server's rule): a class that answered
  // quickly shortens the class's deadline, never this student's extra time.
  const personal = personalRoundTimer({ startsAtMs: start, endsAtMs: end }, storedTimeMultiplier(timeMultiplier), { fullDurationMs });
  const personalEndsAtMs = Number(personal?.endsAtMs) || end;
  return Object.freeze({
    startsAtMs: start,
    classEndsAtMs: end,
    endsAtMs: personalEndsAtMs,
    // How long this student's round lasts, from GO. 0: an open-ended round.
    durationMs: end > start ? personalEndsAtMs - start : 0,
    extended: personalEndsAtMs > end && end > start,
  });
};
