/*
 * THE PLAN FOR ONE ROOM'S OLD CLASS-READABLE STANDINGS
 * (scripts/scrub-live-challenge-public-ranks.mjs).
 *
 * Before the class's copies existed, a room's rounds/{n} held the whole
 * anonymous table and its standings/current listed every seat's rank and
 * score — readable by every student whose invite still names the room. The
 * server now writes only the public rule's rows there. This rewrites what an
 * older room left behind into the same shapes, using the server's own
 * builders:
 *
 *   rounds/{n}         → its class copy (classCopyOfRoundSummary); the whole
 *                        table is copied to hostRounds/{n} first, if the
 *                        teacher's copy is not there yet, so the console of a
 *                        room still in play keeps its results table;
 *   standings/current  → schema 2: the public rule's rows of its top rows,
 *                        its count, and where the last group starts (the
 *                        worst rank its every-seat list held).
 *
 * Pure: no Firebase. A document already in the new shape plans nothing.
 */

import { classCopyOfRoundSummary } from '../../functions/shared/liveChallengeResults.mjs';
import { publicStandingsRows } from '../../functions/shared/liveChallengePrivacy.mjs';
import { STANDINGS_PROJECTION_SCHEMA_VERSION, STANDINGS_TOP_ROWS } from '../../functions/shared/liveChallengeStandingsProjection.mjs';

/** Whether a rounds/{n} document still holds the whole table. */
export const roundNeedsScrub = (data = null) => Boolean(data)
  && data.visibility !== 'class'
  && (Array.isArray(data.standings) || Array.isArray(data.standingsAfterRound));

/** Whether a standings/current document still lists every seat. */
export const standingsNeedScrub = (data = null) => Boolean(data)
  && (Number(data.schemaVersion) !== STANDINGS_PROJECTION_SCHEMA_VERSION || 'ranks' in data || 'scores' in data || 'slotKeys' in data);

const worstRankIn = (list) => String(list || '').split(',')
  .map((entry) => Number(entry))
  .filter((rank) => Number.isInteger(rank) && rank >= 1)
  .reduce((worst, rank) => Math.max(worst, rank), 0);

/** A schema-1 snapshot rewritten as schema 2 (null when there is nothing to keep). */
export const scrubbedStandings = (data = {}) => {
  const count = Math.max(0, Math.round(Number(data.count) || 0));
  const top = (Array.isArray(data.top) ? data.top : []).filter(Boolean).map((row, index) => ({
    playerKey: String(row.playerKey || `row-${index + 1}`),
    alias: String(row.alias || 'Player'),
    rank: Number.isInteger(Number(row.rank)) ? Number(row.rank) : null,
    tied: row.tied === true,
    score: Math.max(0, Math.round(Number(row.score) || 0)),
  }));
  // The class's last rank, as the every-seat list held it (else the worst in the top rows).
  const lastRank = worstRankIn(data.ranks) || top.reduce((worst, row) => Math.max(worst, row.rank || 0), 0) || null;
  const board = publicStandingsRows({}, top, { totalCount: count, lastRank });
  const {
    ranks: _ranks, scores: _scores, slotKeys: _slotKeys, digest: _digest, ...rest
  } = data;
  return {
    ...rest,
    schemaVersion: STANDINGS_PROJECTION_SCHEMA_VERSION,
    count,
    lastRank: board.lastRank || lastRank,
    top: board.rows.slice(0, STANDINGS_TOP_ROWS).map((row) => ({
      playerKey: row.playerKey, alias: row.alias, rank: row.rank, tied: row.tied, score: row.score,
    })),
  };
};

/**
 * One room's writes: [{ path, data, kind }] — `hostRound` (create the
 * teacher's copy only if absent), `round` (replace), `standings` (replace).
 * `rounds` are { id, data } of rounds/{n}; `hostRoundIds` the hostRounds ids
 * already present.
 */
export const planRoomScrub = ({ roomId, rounds = [], hostRoundIds = [], standings = null } = {}) => {
  const present = new Set(hostRoundIds.map(String));
  const writes = [];
  for (const { id, data } of rounds) {
    if (!roundNeedsScrub(data)) continue;
    if (!present.has(String(id))) writes.push({ kind: 'hostRound', path: `liveChallengeRooms/${roomId}/hostRounds/${id}`, data });
    const { closedAt, ...full } = data;
    writes.push({ kind: 'round', path: `liveChallengeRooms/${roomId}/rounds/${id}`, data: { ...classCopyOfRoundSummary(full), ...(closedAt ? { closedAt } : {}) } });
  }
  if (standingsNeedScrub(standings)) {
    writes.push({ kind: 'standings', path: `liveChallengeRooms/${roomId}/standings/current`, data: scrubbedStandings(standings) });
  }
  return writes;
};
