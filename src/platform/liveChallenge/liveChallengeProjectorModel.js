import { getChallengeMode } from '../../../functions/shared/liveChallengeModes.mjs';
import {
  PODIUM_PLACES,
  PUBLIC_TOP_COUNT,
  publicStandingsLimit,
  roomShowsFullStandings,
} from '../../../functions/shared/liveChallengePrivacy.mjs';
import { CHALLENGE_STAGE } from './challengeShellModel.js';
import { SOLUTION_STATE } from './challengeSolutionModel.js';

const FAMILY_LABELS = Object.freeze({
  linearEquation: 'Linear Equations',
  literalEquation: 'Literal Equations',
  linearInequality: 'Linear Inequalities',
  absoluteValueEquation: 'Absolute Value Equations',
  absoluteValueInequality: 'Absolute Value Inequalities',
});

const DIFFICULTY_LABELS = Object.freeze({
  foundation: 'Foundation',
  developing: 'Developing',
  advanced: 'Advanced',
  challenge: 'Challenge',
});

const cleanText = (value) => String(value ?? '').trim();

export const projectorFamilyLabel = (room = {}) => {
  const family = cleanText(
    room?.currentQuestion?.challengeFamily
      || room?.currentQuestion?.tool?.challengeFamily,
  );
  if (family && FAMILY_LABELS[family]) return FAMILY_LABELS[family];

  const standard = cleanText(room?.currentQuestion?.teksCode || room?.standardCode);
  if (standard && standard !== 'mixed') return standard;

  if (room?.challengeMode === 'solverRace') {
    const focus = cleanText(room?.solverRaceFocus);
    if (focus && focus !== 'mixed' && FAMILY_LABELS[focus]) return FAMILY_LABELS[focus];
    return 'Mixed Solver Race';
  }
  return 'Mixed Review';
};

export const projectorDifficultyLabel = (room = {}) => {
  const raw = cleanText(
    room?.currentQuestion?.difficultyBand
      || room?.currentQuestion?.solverRaceStage
      || room?.currentQuestion?.tool?.difficultyBand
      || room?.currentQuestion?.tool?.solverRaceStage
      || room?.solverRaceDifficulty,
  );
  if (!raw || raw === 'ramp') return room?.challengeMode === 'solverRace' ? 'Ramp Up' : '';
  return DIFFICULTY_LABELS[raw] || raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
};

// The game mode names itself; an unknown or missing mode reads as Standard.
export const projectorGameLabel = (room = {}) => getChallengeMode(room?.challengeMode).projectorLabel;

// Only a mode with an early close has a threshold to change (a timed rush has none).
export const projectorShowsClosingThreshold = (room = {}) => getChallengeMode(room?.challengeMode).capabilities.closingThreshold === true;

export const projectorRoundCount = (room = {}) => {
  const scheduled = Math.round(Number(room?.scheduledRoundCount) || 0);
  const configured = Math.round(Number(room?.roundCount) || 0);
  const currentRound = Math.max(0, Math.round(Number(room?.currentRound) || 0) + 1);
  return Math.max(1, scheduled, configured, currentRound);
};

export const projectorCurrentRound = (room = {}) => (
  Math.max(1, Math.round(Number(room?.currentRound) || 0) + 1)
);

export const projectorAnsweredCount = (leaderboard = [], currentRound = 0) => (
  (Array.isArray(leaderboard) ? leaderboard : [])
    .filter((row) => Number(row?.answeredRound) === Number(currentRound))
    .length
);

export const projectorScore = (row = {}) => (
  Math.max(0, Math.round(Number(row?.liveScore ?? row?.score) || 0))
);

/*
 * Standing order: by rank, then by the leaderboard's own display order. The
 * sort is stable, so players who share a rank keep the deterministic order the
 * ranking gave them (liveChallengeRanking.mjs) instead of being re-sorted here
 * by a second, different rule.
 */
export const finalStandingRows = (leaderboard = []) => (
  [...(Array.isArray(leaderboard) ? leaderboard : [])]
    .filter(Boolean)
    .sort((left, right) => (
      (Number(left?.rank) || Number.MAX_SAFE_INTEGER) - (Number(right?.rank) || Number.MAX_SAFE_INTEGER)
    ))
);

/*
 * The three podium steps, filled in standing order. Tied players share a rank,
 * so looking places up by rank number would put one of them on two steps and
 * leave the other off the podium; each step shows its player's own rank.
 */
export const podiumRows = (leaderboard = []) => {
  const [first = null, second = null, third = null] = finalStandingRows(leaderboard);
  return { first, second, third };
};

/** Everyone after the three podium steps, in standing order. */
export const belowPodiumRows = (leaderboard = []) => finalStandingRows(leaderboard).slice(3);

/*
 * NOBODY IS EVER PUBLICLY LAST (functions/shared/liveChallengePrivacy.mjs).
 *
 * Every board the whole class sees — the live board during a round, a round's
 * results table, the standings after it and the rows under the final podium —
 * shows the top few by default and says how many more are playing. A student
 * finds their own place on their own device. A teacher who opted the room into
 * full standings (`standingsDisplay: 'full'`) gets as many rows as the screen
 * has room for, which is how the projector behaved before.
 *
 * Bounded by the space first, so a zoomed projector never asks for rows it
 * cannot draw; then by the room's choice.
 */
export const PROJECTOR_MORE_NOTE = 'everyone sees their own place on their device';

// How many rows a class-wide board shows: the room's choice within the space.
// By default a board also stops before the last player, so a small group (an
// intervention table of four or five) never has its last place projected
// either. A lone player is first as well as last, so they stay. Full standings
// (the teacher's opt-in) show everyone who fits.
const upToLastButOne = (playerCount) => {
  const count = Math.floor(Number(playerCount));
  return Number.isFinite(count) && count > 1 ? count - 1 : Infinity;
};
export const projectorBoardLimit = (room = {}, spaceForRows = PUBLIC_TOP_COUNT, playerCount = null) => {
  const limit = publicStandingsLimit(room, spaceForRows);
  return roomShowsFullStandings(room) ? limit : Math.min(limit, upToLastButOne(playerCount));
};

/**
 * One class-wide board: the rows it shows, how many it leaves off, and the
 * line under it ("and 3 more players · everyone sees their own place on their
 * device"; full standings that ran out of space say only how many more).
 */
export const projectorBoard = (room = {}, rows = [], spaceForRows = PUBLIC_TOP_COUNT) => {
  const all = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const limit = projectorBoardLimit(room, spaceForRows, all.length);
  const shown = all.slice(0, limit);
  const hiddenCount = Math.max(0, all.length - shown.length);
  return Object.freeze({
    rows: shown,
    limit,
    hiddenCount,
    moreText: projectorMoreText(room, hiddenCount),
  });
};

/** "and 3 more players · everyone sees their own place on their device" — or '' when nobody is left off. */
export const projectorMoreText = (room = {}, hiddenCount = 0) => {
  const count = Math.max(0, Math.floor(Number(hiddenCount) || 0));
  if (!count) return '';
  const more = `and ${count} more ${count === 1 ? 'player' : 'players'}`;
  return roomShowsFullStandings(room) ? more : `${more} · ${PROJECTOR_MORE_NOTE}`;
};

/*
 * How many standings rows may sit under the final podium. The podium is the
 * top three; by default the board under it only completes the top few
 * (PUBLIC_TOP_COUNT − PODIUM_PLACES), so 6th and below are never projected.
 * Full standings keep the old rule: as many as fit, at most nine.
 */
export const FINAL_BOARD_MAX_ROWS = 9;
export const belowPodiumLimit = (room = {}, spaceForRows = PUBLIC_TOP_COUNT, playerCount = null) => {
  const space = Math.max(0, Math.floor(Number(spaceForRows) || 0) - 1);
  if (roomShowsFullStandings(room)) return Math.min(FINAL_BOARD_MAX_ROWS, space);
  // Stop before the last player too: in a class of four or five the last one
  // is not listed under the podium. (A class of three or fewer is all podium.)
  const beforeLast = Math.max(0, upToLastButOne(playerCount) - PODIUM_PLACES);
  return Math.min(space, Math.max(0, PUBLIC_TOP_COUNT - PODIUM_PLACES), beforeLast);
};

/** The final board under the podium: the rows it may show and everyone after them. */
export const finalBoardRows = (room = {}, leaderboard = [], spaceForRows = PUBLIC_TOP_COUNT) => {
  const below = belowPodiumRows(leaderboard);
  const rows = below.slice(0, belowPodiumLimit(room, spaceForRows, finalStandingRows(leaderboard).length));
  return Object.freeze({ rows, hiddenCount: below.length - rows.length });
};

/*
 * RECOGNITIONS ON THE FINAL PODIUM (room.recognitions, written by the server
 * when a match finishes). Positive, public, and by game alias only: a line
 * reads "Most improved: Nova Panther 90", and a class-wide one "Team effort —
 * the whole class". Player keys are never displayed. A room finished before
 * recognitions existed (no field) shows nothing.
 */
const RECOGNITION_LIMIT = 5;
const RECOGNITION_ALIAS_LIMIT = 3;
export const podiumRecognitionRows = (room = {}) => {
  const entries = Array.isArray(room?.recognitions) ? room.recognitions : [];
  return entries
    .filter((entry) => entry && cleanText(entry.id) && cleanText(entry.label))
    .map((entry) => {
      const label = cleanText(entry.label);
      if (entry.classWide === true) {
        return Object.freeze({ id: cleanText(entry.id), label, who: 'the whole class', text: `${label} — the whole class`, detail: cleanText(entry.detail), classWide: true });
      }
      const aliases = (Array.isArray(entry.aliases) ? entry.aliases : []).map(cleanText).filter(Boolean);
      if (!aliases.length) return null;
      const named = aliases.slice(0, RECOGNITION_ALIAS_LIMIT);
      const extra = aliases.length - named.length;
      const who = `${named.join(', ')}${extra > 0 ? ` and ${extra} more` : ''}`;
      return Object.freeze({ id: cleanText(entry.id), label, who, text: `${label}: ${who}`, detail: cleanText(entry.detail), classWide: false });
    })
    .filter(Boolean)
    .slice(0, RECOGNITION_LIMIT);
};

/*
 * EXTENDED TIME (functions/shared/liveChallengeAccommodations.mjs). The class's
 * deadline has passed but the round is still open because a student with
 * extended time has not finished. The room says only that someone has more
 * time (`extendedTimeInPlay`, set when the round opened — never who) — and so do the screens: "A few
 * students are still finishing", not a frozen "Time!". Only a synchronized
 * question round is extended (never a Graph Feature Rush), and once everyone
 * has answered there is nobody left to wait for.
 */
export const EXTENDED_TIME_MESSAGE = 'A few students are still finishing — results in a moment';
export const EXTENDED_TIME_HOST_HINT = 'Time is up for the class. The round waits for students with extended time, then shows the results automatically. End Round Now still works if you need to move on.';
export const roundWaitingOnExtendedTime = ({ room = {}, locked = false, joinedCount = 0, answeredCount = 0 } = {}) => (
  locked === true
  && room?.challengeMode !== 'graphFeatureRush'
  && room?.extendedTimeInPlay === true
  && Number(joinedCount) > Number(answeredCount)
);

/*
 * THE WORKED SOLUTION BETWEEN ROUNDS. The console reads it
 * (useRoundSolution, only for a round the server has published) and hands it
 * to the projector; the projector draws it only on a closed round's results.
 * Never during a countdown or an open round, whatever the prop holds.
 */
export const projectorShowsSolution = ({ stage = null, solutionState = null } = {}) => (
  stage === CHALLENGE_STAGE.ROUND_RESULTS && Boolean(solutionState) && solutionState !== SOLUTION_STATE.NONE
);
