/*
 * EACH STUDENT'S OWN PLACE: ONE SUMMARY ONLY THEY (AND THEIR TEACHER) READ.
 *
 * The class's documents (standings/current, rounds/{n}) carry only the rows
 * the public rule shows the whole class (liveChallengePrivacy.mjs,
 * classStandingsRows): the top few, never anyone tied with last. A student
 * reading Firestore directly therefore cannot see where a classmate placed.
 * They still see their OWN place on their own screen — from this document:
 *
 *   liveChallengeRooms/{room}/playerSummaries/{studentId}
 *
 * Readable by that student, the room's teacher and a root admin; written only
 * by the server (firestore.rules). Keyed by the student's id, so it can only
 * ever be about the student reading it.
 *
 * WHAT IT HOLDS — the student's own facts, at the moments their screen shows
 * a place, written in the same commit as the class's documents for that
 * moment:
 *
 *   rounds.{n}   at round n's close: their place in the round's table (the
 *                table's own ranking, roundTableRows), what they did in it,
 *                and their standing in the match after it (rank, score, of
 *                how many). The recap-level per-round result, and how a
 *                reconnecting screen knows which rounds closed without an
 *                answer from them.
 *   final        at the finish: their final place, score and correct answers,
 *                of how many — the match result's own standing.
 *
 * No live (mid-round) place: a student never sees a rank under the question.
 *
 * Pure: no Firebase. The server builds entries; the student screen decodes
 * them with the same module.
 */

import { finalPlaceIsHeadline, roundTableRows } from './liveChallengePrivacy.mjs';

export const PLAYER_SUMMARY_COLLECTION = 'playerSummaries';
export const PLAYER_SUMMARY_SCHEMA_VERSION = 1;

const nonNegativeInt = (value) => Math.max(0, Math.round(Number(value) || 0));
const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};
const rankOrNull = (value) => {
  const rank = integerOr(value, null);
  return rank !== null && rank >= 1 ? rank : null;
};

/** A match standing as the summary stores it (null without a rank). */
const standingEntry = (standing, count) => (standing && rankOrNull(standing.rank) !== null
  ? {
    rank: rankOrNull(standing.rank),
    tied: standing.tied === true,
    score: nonNegativeInt(standing.score),
    correctCount: nonNegativeInt(standing.correctCount),
    roundsAnswered: nonNegativeInt(standing.roundsAnswered),
    count: nonNegativeInt(count),
  }
  : null);

/**
 * Every joined player's entry for one closed round. `roundResult` is the
 * private round result (buildRoundResult: rows carry each studentId),
 * `summary` its anonymous copy (publicRoundSummary, for the per-row facts),
 * `standingsAfterRound` the match standings it left (matchStandingsAfterRound)
 * and `byPoints` how the round's table ranks (roundTableByPoints).
 *
 * @returns {Array<{ studentId, playerKey, alias, roundIndex, entry }>}
 */
export const roundSummaryEntries = ({ roundResult = {}, summary = {}, standingsAfterRound = null, byPoints = false } = {}) => {
  const table = new Map(roundTableRows(summary.standings, { byPoints }).map((row) => [row.playerKey, row]));
  const after = Array.isArray(standingsAfterRound) ? standingsAfterRound : [];
  const standingByKey = new Map(after.map((row) => [String(row.playerKey), row]));
  const roundIndex = integerOr(roundResult.roundIndex, -1);
  return (Array.isArray(roundResult.standings) ? roundResult.standings : [])
    .filter((standing) => standing?.studentId && standing.playerKey)
    .map((standing) => {
      const key = String(standing.playerKey);
      const row = table.get(key) || {};
      const participated = row.participated === true;
      return {
        studentId: String(standing.studentId),
        playerKey: key,
        alias: String(standing.alias || 'Player'),
        roundIndex,
        entry: {
          roundIndex,
          roundVersion: nonNegativeInt(roundResult.roundVersion),
          isSecondChance: roundResult.isSecondChance === true,
          fieldSize: nonNegativeInt(roundResult.fieldSize),
          participated,
          rank: participated ? rankOrNull(row.rank) : null,
          tied: participated && row.tied === true,
          roundPoints: nonNegativeInt(row.roundPoints),
          matchPointsAwarded: nonNegativeInt(row.matchPointsAwarded),
          completed: row.completed === undefined || row.completed === null ? null : nonNegativeInt(row.completed),
          accuracyPercent: Number.isFinite(Number(row.accuracyPercent)) && row.accuracyPercent !== null && row.accuracyPercent !== undefined
            ? Math.round(Number(row.accuracyPercent))
            : null,
          standing: standingEntry(standingByKey.get(key), after.length),
        },
      };
    });
};

/**
 * Every ranked player's final entry, from the match result's standings
 * (buildMatchResult: rows carry each studentId). Players who never joined
 * have no place and get none.
 *
 * @returns {Array<{ studentId, playerKey, alias, entry }>}
 */
export const finalSummaryEntries = ({ standings = [] } = {}) => {
  const ranked = (Array.isArray(standings) ? standings : [])
    .filter((standing) => standing?.studentId && standing.playerKey && standing.joined !== false && rankOrNull(standing.rank) !== null);
  // The class's last place, which only this whole list knows: a place tied
  // with it is never a headline (finalPlaceIsHeadline). Each player is told
  // only their own answer.
  const lastRank = ranked.reduce((last, standing) => Math.max(last, rankOrNull(standing.rank)), 0) || null;
  return ranked.map((standing) => ({
    studentId: String(standing.studentId),
    playerKey: String(standing.playerKey),
    alias: String(standing.alias || 'Player'),
    entry: { ...standingEntry(standing, ranked.length), headline: finalPlaceIsHeadline(standing.rank, { lastRank }) },
  }));
};

/*
 * ON THE STUDENT'S SCREEN.
 */

/** The summary, if it is a current one for this room. */
const usable = (summary, roomId) => Boolean(summary)
  && typeof summary === 'object'
  && Number(summary.schemaVersion) === PLAYER_SUMMARY_SCHEMA_VERSION
  && (!roomId || !summary.roomId || String(summary.roomId) === String(roomId));

/** This student's entry for round `roundIndex`, or null. */
export const summaryRound = (summary = null, roundIndex, { roomId = null } = {}) => {
  if (!usable(summary, roomId)) return null;
  const index = integerOr(roundIndex, null);
  if (index === null || index < 0) return null;
  const entry = summary.rounds && typeof summary.rounds === 'object' ? summary.rounds[String(index)] : null;
  return entry && typeof entry === 'object' ? entry : null;
};

/** This student's final standing, or null (not finished, or never placed). */
export const summaryFinal = (summary = null, { roomId = null } = {}) => {
  if (!usable(summary, roomId)) return null;
  return summary.final && typeof summary.final === 'object' && rankOrNull(summary.final.rank) !== null ? summary.final : null;
};

/**
 * Of `rounds`, the ones this student was in but did not answer: their own
 * entry says `participated: false`. A round with no entry (they had not
 * joined yet, or it has not closed) is not missed.
 */
export const summaryUnansweredRounds = (summary = null, rounds = [], { roomId = null } = {}) => (
  (Array.isArray(rounds) ? rounds : [])
    .filter((roundIndex) => {
      const entry = summaryRound(summary, roundIndex, { roomId });
      return Boolean(entry) && entry.participated !== true;
    })
    .sort((left, right) => left - right)
);
