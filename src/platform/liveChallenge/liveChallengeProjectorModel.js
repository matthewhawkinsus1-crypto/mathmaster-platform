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
 * Every list the whole class sees — the live board during a round, a round's
 * results table, the standings after it, the final podium and the rows under
 * it — and the classmates' rows on a student's own result and final cards go
 * through ONE rule, publicStandingsRows:
 *
 *   1. never a row whose rank ties the LAST rank of the whole class (not just
 *      the rows in hand: a student's snapshot carries only the top, so the
 *      caller passes the class's last rank). A round where 2 of 24 were right
 *      ranks 22 players tied for last: none of them is listed. A player with no
 *      rank (no answer this round) is never listed either;
 *   2. never exactly ONE player unshown when anyone is shown: the lobby listed
 *      every alias, so the one missing name would be the last one. The last
 *      shown group of tied players steps off with them (hide two or more, or
 *      show nobody);
 *   3. at most the top few (PUBLIC_TOP_COUNT), within the space the screen has.
 *
 * So two players project no ranking, three project 1st only, and a class all
 * tied projects none. A student still always sees their OWN row on their own
 * device (`selfKey`); it never counts as unshown. A teacher who opted the room
 * into full standings (`standingsDisplay: 'full'`) is exempt: as many rows as
 * the screen has room for.
 */
export const PROJECTOR_MORE_NOTE = 'everyone sees their own place on their device';

const rankOf = (row) => {
  const rank = Number(row?.rank);
  return Number.isInteger(rank) && rank >= 1 ? rank : Infinity;
};

/** The class's last rank: the worst rank any of `rows` holds; null when none is ranked. */
export const lastRankOf = (rows = []) => {
  const ranks = (Array.isArray(rows) ? rows : []).map(rankOf).filter(Number.isFinite);
  return ranks.length ? Math.max(...ranks) : null;
};

/**
 * The rank where a list's last group starts. A row with no rank (no answer
 * this round) is in it. When the rows say what each player earned this round
 * (`roundPoints`, a round's table), the ranked rows that earned nothing join
 * it, and a class that all earned something stays above it, so a round in
 * which every answer tied is still projected. Without points, the last
 * ranked group is assumed to have earned no more than a non-answer.
 */
const lastGroupRank = (rows) => {
  const worst = lastRankOf(rows);
  if (worst === null) return 0;
  const ranked = rows.filter((row) => Number.isFinite(rankOf(row)));
  if (ranked.length === rows.length) return worst;
  if (!ranked.every((row) => Number.isFinite(Number(row?.roundPoints)) && row.roundPoints !== null)) return worst;
  const earnedNothing = ranked.filter((row) => Number(row.roundPoints) <= 0).map(rankOf);
  return earnedNothing.length ? Math.min(...earnedNothing) : worst + 1;
};

/**
 * One public list. `rows` are in standing order (the engine's). Returns the
 * classmates' rows it may show (in order; a student's own row stays where it
 * falls), the viewer's own row when it falls outside them, how many players
 * are left unshown, and the line under the list.
 *
 *   lastRank      the class's last rank, when `rows` are not every player
 *   totalCount    how many are playing, when `rows` are not every player
 *   spaceForRows  how many rows the screen has room for
 *   selfKey       the viewer's own player key (a student's device)
 */
export const publicStandingsRows = (room = {}, rows = [], {
  lastRank = null,
  totalCount = null,
  spaceForRows = PUBLIC_TOP_COUNT,
  selfKey = null,
} = {}) => {
  const all = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const isSelf = (row) => Boolean(selfKey) && row?.playerKey !== null && row?.playerKey !== undefined && String(row.playerKey) === String(selfKey);
  const total = Math.max(all.length, Number.isInteger(Number(totalCount)) && totalCount !== null ? Number(totalCount) : 0);
  const limit = publicStandingsLimit(room, spaceForRows);
  let shown;
  if (roomShowsFullStandings(room)) {
    shown = all.slice(0, limit);
  } else {
    // The last rank is the class's, whichever is worse: the caller's (the
    // whole class) or the rows in hand. A row with no rank (no answer this
    // round) sits with the last group: it earned no more than they did.
    const given = Number(lastRank);
    const last = Math.max(lastGroupRank(all), Number.isInteger(given) && given >= 1 ? given : 0);
    // Rule 1, then rule 3: the standing order is by rank, so the rows above
    // the last rank are a prefix.
    shown = [];
    for (const row of all) {
      if (shown.length >= limit || rankOf(row) >= last) break;
      shown.push(row);
    }
    // Rule 2: one unshown player would be named by elimination.
    const visibleSelf = () => (all.some(isSelf) ? 1 : 0) - (shown.some(isSelf) ? 1 : 0);
    const unshown = () => total - shown.length - visibleSelf();
    while (unshown() === 1 && shown.some((row) => !isSelf(row))) {
      const lastShown = [...shown].reverse().find((row) => !isSelf(row));
      const rank = rankOf(lastShown);
      shown = shown.filter((row) => isSelf(row) || rankOf(row) !== rank);
    }
  }
  const self = all.find((row) => isSelf(row) && !shown.includes(row)) || null;
  const hiddenCount = Math.max(0, total - shown.length - (self ? 1 : 0));
  return Object.freeze({
    rows: Object.freeze(shown),
    self,
    hiddenCount,
    totalCount: total,
    moreText: projectorMoreText(room, hiddenCount, shown.length + (self ? 1 : 0)),
  });
};

/**
 * The live race (rushStandingsModel.rushRaceRows: most graphs this round
 * first) with a place on each row: equal counts share one, so the rule above
 * can tell who sits at the bottom. The order is the race board's own.
 */
export const rushRaceRanked = (raceRows = []) => {
  const rows = (Array.isArray(raceRows) ? raceRows : []).filter(Boolean);
  return rows.map((row) => ({
    ...row,
    rank: 1 + rows.filter((other) => Number(other.completed) > Number(row.completed)).length,
  }));
};

/**
 * "and 3 more players · everyone sees their own place on their device" — or
 * '' when nobody is left off. A list that shows nobody says how many play.
 */
export const projectorMoreText = (room = {}, hiddenCount = 0, shownCount = 1) => {
  const count = Math.max(0, Math.floor(Number(hiddenCount) || 0));
  if (!count) return '';
  const players = `${count} ${count === 1 ? 'player' : 'players'}`;
  const more = Number(shownCount) > 0 ? `and ${count} more ${count === 1 ? 'player' : 'players'}` : players;
  return roomShowsFullStandings(room) ? more : `${more} · ${PROJECTOR_MORE_NOTE}`;
};

/*
 * THE FINAL PODIUM AND THE ROWS UNDER IT: one public list (the rule above),
 * its first three on the steps and the rest below. By default that is the top
 * few at most; full standings keep the old rule (the podium, then as many as
 * fit, at most nine).
 */
export const FINAL_BOARD_MAX_ROWS = 9;
export const finalBoardRows = (room = {}, leaderboard = [], spaceForRows = PUBLIC_TOP_COUNT) => {
  const below = Math.max(0, Math.floor(Number(spaceForRows) || 0) - 1);
  const space = PODIUM_PLACES + (roomShowsFullStandings(room) ? Math.min(FINAL_BOARD_MAX_ROWS, below) : below);
  const board = publicStandingsRows(room, finalStandingRows(leaderboard), { spaceForRows: space });
  const [first = null, second = null, third = null] = board.rows;
  return Object.freeze({
    podium: Object.freeze({ first, second, third }),
    rows: board.rows.slice(PODIUM_PLACES),
    hiddenCount: board.hiddenCount,
    totalCount: board.totalCount,
  });
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
 * time (`extendedTimeInPlay`, set when the round opened, or by the host's
 * refused close when a student with it joined mid-round — never who) — and so do the screens: "A few
 * students are still finishing", not a frozen "Time!". Only a synchronized
 * question round is extended (never a Graph Feature Rush), and once everyone
 * has answered there is nobody left to wait for.
 */
export const EXTENDED_TIME_MESSAGE = 'A few students are still finishing — results in a moment';
export const roundWaitingOnExtendedTime = ({ room = {}, locked = false, joinedCount = 0, answeredCount = 0 } = {}) => (
  locked === true
  && room?.challengeMode !== 'graphFeatureRush'
  && room?.extendedTimeInPlay === true
  && Number(joinedCount) > Number(answeredCount)
);
// The TEACHER'S OWN CONSOLE only (never projected) says why the round waits.
export const EXTENDED_TIME_HOST_HINT = 'Time is up for the class. The round waits for students with extended time, then shows the results automatically. End Round Now still works if you need to move on.';

/*
 * THE PROJECTOR'S WORDS FOR THE SAME MOMENT. The whole class reads the
 * projector — including its host strip, which sits inside the full-screen
 * element — so it says only that answers are still coming. Never "extended
 * time": beside "Locked in 23 / 24" that names the student still typing as
 * the one with an accommodation. The projector imports only these names.
 */
export const STILL_FINISHING_MESSAGE = EXTENDED_TIME_MESSAGE;
export const STILL_FINISHING_HOST_HINT = 'Waiting for the last answers. End Round Now still works.';
export const roundStillFinishing = (state = {}) => roundWaitingOnExtendedTime(state);

/*
 * THE WORKED SOLUTION BETWEEN ROUNDS. The console reads it
 * (useRoundSolution, only for a round the server has published) and hands it
 * to the projector; the projector draws it only on a closed round's results.
 * Never during a countdown or an open round, whatever the prop holds.
 */
export const projectorShowsSolution = ({ stage = null, solutionState = null } = {}) => (
  stage === CHALLENGE_STAGE.ROUND_RESULTS && Boolean(solutionState) && solutionState !== SOLUTION_STATE.NONE
);
