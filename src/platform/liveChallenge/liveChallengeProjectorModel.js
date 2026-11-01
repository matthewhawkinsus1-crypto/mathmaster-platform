import { getChallengeMode } from '../../../functions/shared/liveChallengeModes.mjs';
import { EXTENDED_TIME_RULE, extendedTimeRuleFor } from '../../../functions/shared/liveChallengeAccommodations.mjs';
import {
  PODIUM_PLACES,
  PUBLIC_TOP_COUNT,
  publicStandingsRows,
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
 * NOBODY IS EVER PUBLICLY LAST: the one rule every class-wide list goes
 * through (publicStandingsRows) lives beside the policy it enforces, in
 * functions/shared/liveChallengePrivacy.mjs, because the server applies it
 * too — to every standings document a student can read — before the screens
 * apply it again with the viewer's own row. Re-exported here for the screens.
 */
export { PROJECTOR_MORE_NOTE, lastRankOf, projectorMoreText, publicStandingsRows } from '../../../functions/shared/liveChallengePrivacy.mjs';

/**
 * The live race (rushStandingsModel.rushRaceRows: most points this round
 * first) with a place on each row: equal points share one, so the rule above
 * can tell who sits at the bottom. The order is the race board's own.
 */
const racePoints = (row) => Number(row?.points ?? row?.completed) || 0;
export const rushRaceRanked = (raceRows = []) => {
  const rows = (Array.isArray(raceRows) ? raceRows : []).filter(Boolean);
  return rows.map((row) => ({
    ...row,
    rank: 1 + rows.filter((other) => racePoints(other) > racePoints(row)).length,
  }));
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
 * students are still finishing", not a frozen "Time!". A synchronized
 * question round is extended, and so is a race with a set to finish (Graph
 * the Line's Classic and Sprint, whose extra time comes after the buzzer and
 * never counts in the race) — never an "as many as you can" race (Graph
 * Feature Rush, Graph the Line's Rush). Once everyone has answered (or
 * finished their set) there is nobody left to wait for.
 */
export const EXTENDED_TIME_MESSAGE = 'A few students are still finishing — results in a moment';
export const roundWaitingOnExtendedTime = ({ room = {}, locked = false, joinedCount = 0, answeredCount = 0 } = {}) => (
  locked === true
  && extendedTimeRuleFor(getChallengeMode(room?.challengeMode)) !== EXTENDED_TIME_RULE.NONE
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

/*
 * TWO LISTS IN ONE COLUMN (LC03). With a worked solution on the left, the
 * round's table and the standings share the right-hand column, one above the
 * other, in the projector's compact rows, so each shows fewer rows than it
 * would alone.
 *
 * How many is MEASURED, never read off the screen's height. The first version
 * keyed a table to the viewport and was right in the font it was measured in
 * and cut off in the one a classroom's machine has. Both lists start at the
 * most they may show (stackedResultsPlan: the public rule's top few, or the
 * screen's rows for full standings) and, while either panel's content runs
 * past its bottom edge, one of them gives up a row (fitStackedStep); a new
 * round, a resize or a zoom starts again from the top. publicStandingsRows
 * still decides which rows those are and says what is left unshown.
 *
 * WHICH LIST GIVES UP THE ROW. The standings keep their top three
 * (STACKED_STANDINGS_FLOOR) for as long as the round's table has a row to
 * give: in halves, as LC03 first drew them, a 1366x768 projector at 125% zoom
 * showed two standings rows and at 150% one, where the shell QA's big class
 * wants three. Above three the two take turns, the round's table first; with
 * full standings, the point of that choice, the round's table gives all its
 * rows but one before the standings give any. When even three standings rows
 * and one round row do not fit (150% zoom on 1366x768), the round's table
 * steps aside and the standings have the column: it waits behind "Hide
 * solution", as it did before LC03.
 */
export const FIT_TOLERANCE_PX = 1;
export const STACKED_STANDINGS_FLOOR = 3;

export const stackedResultsPlan = (room = {}, screenRows = PUBLIC_TOP_COUNT) => {
  if (!roomShowsFullStandings(room)) return Object.freeze({ rowCeiling: PUBLIC_TOP_COUNT, standingsFirst: false });
  const rows = Math.floor(Number(screenRows));
  return Object.freeze({ rowCeiling: Number.isFinite(rows) && rows >= 1 ? rows : PUBLIC_TOP_COUNT, standingsFirst: true });
};

/**
 * One step of fitting the two lists. Both panels fit: nothing changes.
 * Otherwise one row fewer for the list whose turn it is (never fewer than
 * one), and once the round's table is down to one row and the standings to
 * their floor, the round's table steps aside and the standings start again
 * from `standingsCeiling`, alone in the column.
 */
export const fitStackedStep = ({ round, standings, roundShown = true, overflowPx, standingsCeiling = PUBLIC_TOP_COUNT, standingsFirst = false } = {}) => {
  const rowsOf = (value) => Math.max(1, Math.floor(Number(value)) || 1);
  const have = { round: rowsOf(round), standings: rowsOf(standings), roundShown: roundShown !== false };
  if (!(Number(overflowPx) > FIT_TOLERANCE_PX)) return have;
  if (!have.roundShown) return { ...have, standings: Math.max(1, have.standings - 1) };
  if (have.round > 1 && (standingsFirst || have.standings <= STACKED_STANDINGS_FLOOR || have.round >= have.standings)) return { ...have, round: have.round - 1 };
  if (have.standings > STACKED_STANDINGS_FLOOR) return { ...have, standings: have.standings - 1 };
  return { round: 1, standings: rowsOf(standingsCeiling), roundShown: false };
};
