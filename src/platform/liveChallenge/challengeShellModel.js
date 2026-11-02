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
import { INEQUALITY_RUSH_MODE_ID, RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';
import { LINE_GRAPH_MODE_ID, LINE_GRAPH_MODE_IDS } from '../../../functions/shared/lineGraphRules.mjs';
import { personalRoundTimer, storedTimeMultiplier } from '../../../functions/shared/liveChallengeAccommodations.mjs';
import { HOST_AWAY_ENDED_BY, HOST_AWAY_FINISH_MS } from '../../../functions/shared/liveChallengeServerSweep.mjs';

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
/*
 * A LONG WAIT FOR RESULTS SAYS SO (LC20). With a teacher screen open a round
 * closes a moment after its deadline. With none, the server's sweep closes it,
 * which can take up to about 70 seconds, and "The results are coming." read as
 * a frozen game. After this long locked, the words say it can take a minute.
 */
export const LOCKED_WAIT_NOTICE_MS = 10_000;
export const LOCKED_LONG_DETAIL = 'Your work is locked in. Still counting everyone’s answers — this can take up to a minute. Keep this screen open.';
export const ROUND_CLOSE_AFTER_ALL_DONE_MS = 1_200;

// Modes whose rounds hold many questions per player. Read from the room's mode
// id because the student bundle does not carry the mode registry
// (liveChallengeModes.mjs brings Solver Race and the rush catalog with it); a
// test holds this set to the registry's question-set modes.
const QUESTION_SET_MODES = new Set([RUSH_MODE_ID, INEQUALITY_RUSH_MODE_ID, ...LINE_GRAPH_MODE_IDS]);
export const roomRunsQuestionSets = (room = {}) => QUESTION_SET_MODES.has(String(room?.challengeMode || ''));

/*
 * THE GAME A QUESTION-SET ROOM PLAYS on a student's device — each its own
 * full-screen surface, loaded only for its rooms. The one place the client
 * names these modes; every screen asks here rather than comparing ids.
 */
export const QUESTION_SET_GAME = Object.freeze({
  GRAPH_FEATURE_RUSH: 'graphFeatureRush',
  INEQUALITY_RUSH: 'inequalityRush',
  LINE_GRAPH: 'lineGraph',
});

export const questionSetGameOf = (room = {}) => {
  const modeId = String(room?.challengeMode || '');
  if (modeId === RUSH_MODE_ID) return QUESTION_SET_GAME.GRAPH_FEATURE_RUSH;
  if (modeId === INEQUALITY_RUSH_MODE_ID) return QUESTION_SET_GAME.INEQUALITY_RUSH;
  if (LINE_GRAPH_MODE_IDS.includes(modeId)) return QUESTION_SET_GAME.LINE_GRAPH;
  return null;
};

/*
 * The games played on Graph Feature Rush's round screen and attempts: the
 * rush itself, and Inequality Graphing Rush (its items graphed on a number
 * line). Their host views, race boards and reports are the rush's.
 */
export const isRushGame = (game) => game === QUESTION_SET_GAME.GRAPH_FEATURE_RUSH || game === QUESTION_SET_GAME.INEQUALITY_RUSH;

const RUSH_WORDS = Object.freeze({
  [QUESTION_SET_GAME.GRAPH_FEATURE_RUSH]: Object.freeze({
    game: 'Graph Feature Rush',
    one: 'graph',
    many: 'graphs',
    task: 'Find the features',
    working: 'Students are finding features on their own graphs.',
    go: 'Everyone has their own graphs. Tap the features. Go!',
    countdown: 'Everyone gets their own graphs',
    lobby: 'Graph Feature Rush — tap the features on your own graphs',
    earn: 'Tap the features on your graphs to earn points.',
  }),
  [QUESTION_SET_GAME.INEQUALITY_RUSH]: Object.freeze({
    game: 'Inequality Graphing Rush',
    one: 'inequality',
    many: 'inequalities',
    task: 'Graph the inequalities',
    working: 'Students are graphing their own inequalities.',
    go: 'Everyone has their own inequalities. Graph each on the number line. Go!',
    countdown: 'Everyone gets their own inequalities',
    lobby: 'Inequality Graphing Rush — graph your own inequalities on a number line',
    earn: 'Graph the inequalities on your number line to earn points.',
  }),
});

/** How a rush room's screens name the game and what students work through. */
export const rushGameWords = (room = {}) => RUSH_WORDS[questionSetGameOf(room)] || RUSH_WORDS[QUESTION_SET_GAME.GRAPH_FEATURE_RUSH];

/*
 * THE RACE'S NAME AND TAGLINE, as the student's lobby writes them in the Grand
 * Prix look (grandPrixTheme.js): the game's name, then three short calls —
 * what to do, earn points, race to the podium. Words only: the lobby's plain
 * line (lobbyGameWords) still says how the game plays.
 */
const ARENA_LINE_TITLES = Object.freeze({
  [LINE_GRAPH_MODE_ID.CLASSIC]: 'Graph the Line',
  [LINE_GRAPH_MODE_ID.SPRINT]: 'Graph the Line Sprint',
  [LINE_GRAPH_MODE_ID.RUSH]: 'Graph the Line Rush',
});
const ARENA_TASKS = Object.freeze({
  [QUESTION_SET_GAME.GRAPH_FEATURE_RUSH]: 'Find the features',
  [QUESTION_SET_GAME.INEQUALITY_RUSH]: 'Graph the solutions',
  [QUESTION_SET_GAME.LINE_GRAPH]: 'Graph the lines',
});
export const arenaGameTitle = (room = {}) => {
  const game = questionSetGameOf(room);
  if (isRushGame(game)) return rushGameWords(room).game;
  if (game === QUESTION_SET_GAME.LINE_GRAPH) return ARENA_LINE_TITLES[String(room?.challengeMode)] || 'Graph the Line';
  return room?.challengeMode === 'solverRace' ? 'Solver Race' : 'Live Challenge';
};
export const arenaTagline = (room = {}) => Object.freeze([
  ARENA_TASKS[questionSetGameOf(room)] || (room?.challengeMode === 'solverRace' ? 'Solve it fast' : 'Answer fast'),
  'Earn points',
  'Race to the podium',
]);

/*
 * Question-set rounds that hold more than anyone finishes — Graph Feature
 * Rush, Inequality Graphing Rush and Graph the Line's Rush — end on the
 * clock alone. A Classic or
 * Sprint round of Graph the Line is over for a student who has worked
 * through it, and closes early once everyone has (the server agrees:
 * liveChallengeRoundCompletion reads the same receipts). A test holds this
 * set to the registry: the question-set modes whose pool is the engine's
 * largest.
 */
const CLOCK_ONLY_MODES = new Set([RUSH_MODE_ID, INEQUALITY_RUSH_MODE_ID, LINE_GRAPH_MODE_ID.RUSH]);
export const roomRoundsEndOnTheClock = (room = {}) => CLOCK_ONLY_MODES.has(String(room?.challengeMode || ''));

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

/** The 3-2-1 step every screen shows before a round opens, for the host's countdown sound (LC16); null otherwise. */
export const cueCountdownStep = (room = {}, nowMs = Date.now()) => challengeClock(room, nowMs).countdownStep;

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
 * classic round: answered it; a Classic or Sprint round of Graph the Line:
 * worked through every item). `allFinishedSinceMs` is when the host first saw
 * everyone finished — the caller remembers it. A round played against the
 * clock (a rush) closes on the deadline only. Closing early is the same
 * idempotent close command the teacher can press; the server checks
 * readiness again inside its transaction.
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
  // A rush is played against the clock: nobody is ever "finished" before it,
  // so only the deadline closes it.
  const everyoneDone = !roomRoundsEndOnTheClock(room) && Number(joinedCount) > 0 && Number(finishedCount) >= Number(joinedCount);
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
      // A rush has more graphs than anyone can finish: it ends on the clock,
      // never because everyone answered.
      if (roomRoundsEndOnTheClock(room)) {
        return Object.freeze({ command: null, label: null, disabled: true, hint: 'Students solve as many graphs as they can until time runs out. Results show automatically.' });
      }
      // Every student works through their own set (a Sprint) or line (Classic).
      if (roomRunsQuestionSets(room)) {
        return Object.freeze({
          command: null,
          label: null,
          disabled: true,
          hint: Number(joinedCount) > 0 && Number(finishedCount) >= Number(joinedCount)
            ? 'Everyone has finished. Results are coming up.'
            : 'The round ends when time runs out or everyone has finished. Results show automatically.',
        });
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
 * WHY A FINISHED GAME ENDED, FOR THE TEACHER WHO COMES BACK TO IT (LC05).
 *
 * The server ends a game whose results stood HOST_AWAY_FINISH_MS with no
 * teacher screen open (liveChallengeServerSweep.mjs; never a Warm-Up, whose
 * result is a grade). The console reopens the last game it hosted, so the
 * teacher reads why it is over instead of finding it finished with no reason.
 * Null for a game the teacher ended.
 */
export const hostEndedNote = (room = {}) => (
  room?.endedBy === HOST_AWAY_ENDED_BY
    ? `MathMaster ended this game because no teacher screen was open for ${Math.round(HOST_AWAY_FINISH_MS / 60_000)} minutes after the last results. Answers students gave still count.`
    : null
);

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
  // How long the round has sat locked waiting for its results (LC20).
  lockedForMs = 0,
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
      return Object.freeze({
        tone: 'done',
        headline: 'Time’s up!',
        detail: Number(lockedForMs) >= LOCKED_WAIT_NOTICE_MS ? LOCKED_LONG_DETAIL : 'Your work is locked in. The results are coming.',
      });
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

/*
 * THE LINE UNDER A ROUND WHILE A LOCKED ANSWER IS ON ITS WAY (AX21).
 *
 * It says the answer is locked in — and, when the server refused it for now,
 * why it has not been sent: GO has not come, or the teacher paused the round.
 *
 * `announce` is whether a screen reader is told by a live region. A field
 * question's Lock In press moves focus to its own "Your answer is locked in."
 * note (LiveChallengeFieldQuestion), which a screen reader reads. This line
 * said the same thing from an assertive live region in the same breath, so a
 * student heard two announcements. The plain lock is now announced here only
 * where nothing else says it — an engine question, or a screen that opened
 * with the answer already locked. A lock that has become a wait is news the
 * note cannot know, so it is always announced.
 */
export const LOCKED_ANSWER_WORDS = Object.freeze({
  checking: 'Answer locked in · checking it…',
  waitingForGo: 'Your answer is locked in and will send at GO.',
  waitingForResume: 'The round is paused. Your answer is locked in and will send when it resumes.',
});

export const lockedAnswerLine = ({ waitingForGo = false, waitingForResume = false, noteHasFocus = false } = {}) => {
  if (waitingForGo) return Object.freeze({ text: LOCKED_ANSWER_WORDS.waitingForGo, announce: true });
  if (waitingForResume) return Object.freeze({ text: LOCKED_ANSWER_WORDS.waitingForResume, announce: true });
  return Object.freeze({ text: LOCKED_ANSWER_WORDS.checking, announce: !noteHasFocus });
};

/*
 * THE ROUND BANNER'S COLOURS (AX22). The banner over a student's question is
 * white text on a gradient. Its light end was once #1a73e8: white on it is
 * 4.51:1, one rounding from failing AA, and the small lines on the banner
 * ("Points banked", "Your extra time is on") are drawn at 80-90% white, which
 * was 3.5 to 4.0:1 there. Both ends keep 80% white, and the gold points, above
 * 4.5:1 (tests/platform/liveChallengeRoundBanner.test.mjs). Calm, it is the
 * Grand Prix's race night (purple into blue, grandPrixTheme.js); the last ten
 * seconds turn it red.
 */
export const ROUND_BANNER_COLORS = Object.freeze({
  calm: Object.freeze(['#2b1278', '#1442b0']),
  urgent: Object.freeze(['#7f1d1d', '#a50e0e']),
});
export const roundBannerBackground = (urgent = false) => (
  `linear-gradient(135deg,${(urgent ? ROUND_BANNER_COLORS.urgent : ROUND_BANNER_COLORS.calm).join(',')})`
);

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
