/*
 * THE PUBLIC STANDINGS PROJECTION: ONE SMALL DOCUMENT A WHOLE CLASS LISTENS TO.
 *
 * WHY IT EXISTS. Every student used to listen to every other student's public
 * player row. A row changes whenever its student answers (or reports progress,
 * or a round closes under a placement strategy), and each change was delivered
 * to every screen: N students answering a round meant N × N deliveries — 4,096
 * at 64 — each one waking a Chromebook to re-rank the class while its student
 * was trying to answer. The number of standings updates a screen received grew
 * with the number of classmates answering.
 *
 * WHAT IT IS. liveChallengeRooms/{roomId}/standings/current: a sanitized,
 * self-contained snapshot of the standings — the top rows a screen shows, and
 * every joined player's rank and score in two compact lists indexed by seat
 * (`slot`, the player's position in the room's shuffled alias order). A student
 * finds their own place by their own slot. It is REPLACED, never patched: a
 * screen that missed one snapshot loses nothing, because the next one is whole.
 *
 * WHO WRITES IT, AND WHEN. Never the answer path. A student's answer commits
 * to their own private record and their own public row exactly as before, and
 * never reads or writes this document — so an answer cannot wait on it, contend
 * on it, or fail because of it.
 *
 *   live         the host console's pacer asks for one at most once a second
 *                while the standings it sees are changing, and the server
 *                writes at most one every 750 ms
 *                (publishLiveChallengeStandings); the server ranks the public
 *                rows itself, from one consistent read, with the same engine
 *                ranking the board always used (publicLeaderboard)
 *   roundClosed  written in the transaction that closes a round, from the
 *                authoritative private records: the standings the round left
 *                behind, exactly as the round's result document records them
 *   final        written in the transaction that finishes the match, from the
 *                match result itself: the final standings and podium ARE the
 *                match result's, by construction
 *
 * A live snapshot may be up to about a second stale. It can never overwrite a
 * later moment of the match (projectionMayReplace), and it decides nothing:
 * points, placements and rewards are computed on the server from the private
 * records, never from this document.
 *
 * WHAT IT CONTAINS. Only what every student in the room is already shown: a
 * game alias, a rank (and whether it is shared), a score, how many are playing,
 * and the room's round and strategy. Never a student id, an email, an answer,
 * a per-player timestamp, a diagnostic, or anything about supports.
 *
 * Pure: no Firebase. The server builds it; the student screen and the launch
 * certification decode it with the same functions.
 */

import { publicLeaderboard } from './liveChallenge.mjs';
import { leaderboardOptionsFor, getScoringStrategy } from './liveChallengeScoring.mjs';
import { timerFromRoom } from './liveChallengeTimer.mjs';

export const STANDINGS_PROJECTION_SCHEMA_VERSION = 1;
export const STANDINGS_COLLECTION = 'standings';
export const STANDINGS_DOC_ID = 'current';
// A student's board shows the top five and their own row (standingsWindow).
export const STANDINGS_TOP_ROWS = 5;
// THE BOUNDED CADENCE. The host asks for a live snapshot at most once a second
// (standingsPublishPacer.js), timed from when it SENDS; the server measures from
// when it last WROTE, which is later by the publish's own duration. A server
// floor equal to the host's second refused every other request — measured: 3 of
// 7-8 per round, so a 2 s cadence and a classmate's answer shown ~1.9 s late at
// p95 — so the server refuses only what comes within 750 ms of the last write.
// A well-paced host is never refused; a misbehaving one still cannot write
// more than four snapshots in three seconds. Firestore sustains about one write
// a second on one document; nothing else writes this one except the round and
// match transitions.
export const STANDINGS_MIN_PUBLISH_INTERVAL_MS = 750;
// A room never seats more than this; a projection that would say more is refused.
export const STANDINGS_MAX_PLAYERS = 400;

export const PROJECTION_KIND = Object.freeze({
  LIVE: 'live',
  ROUND_CLOSED: 'roundClosed',
  FINAL: 'final',
});

// Where in the match a snapshot is from. A later moment always wins.
const PHASE_RANK = Object.freeze({ lobby: 0, open: 1, closed: 2, final: 3 });

const nonNegativeInt = (value) => Math.max(0, Math.round(Number(value) || 0));
const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};
// A display name, never a control character (a name is shown, not parsed).
const cleanAlias = (value) => [...String(value || 'Player')].map((char) => (char.charCodeAt(0) < 32 ? ' ' : char)).join('').trim().slice(0, 60) || 'Player';
const cleanKey = (value) => {
  const key = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(key) ? key : null;
};

/**
 * The moment of the match a room state is at: its round version and phase.
 * A lobby is (0, lobby); a round is (version, open) then (version, closed);
 * a finished match is final.
 */
export const projectionPosition = ({ status = null, roundVersion = 0, roundState = null, kind = null } = {}) => {
  const version = nonNegativeInt(roundVersion);
  if (kind === PROJECTION_KIND.FINAL || status === 'finished' || status === 'cancelled') return Object.freeze({ version, phase: 'final' });
  if (status !== 'running') return Object.freeze({ version, phase: 'lobby' });
  return Object.freeze({ version, phase: roundState === 'closed' ? 'closed' : 'open' });
};

/** Negative when `left` is an earlier moment than `right`, 0 when the same. */
export const comparePositions = (left = {}, right = {}) => (
  (nonNegativeInt(left.version) - nonNegativeInt(right.version))
  || ((PHASE_RANK[left.phase] ?? 0) - (PHASE_RANK[right.phase] ?? 0))
);

/*
 * THE COMPACT LISTS. One comma-separated string per measure, one entry per
 * slot, empty where that seat is not ranked (never joined). A list of integers
 * in the browser's wire format costs about twenty bytes an entry; this costs
 * two to six.
 */
export const encodeSlotList = (values = []) => (Array.isArray(values) ? values : [])
  .map((value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? '' : String(Math.round(Number(value)))))
  .join(',');

export const decodeSlotList = (text = '') => (typeof text === 'string' && text.length
  ? text.split(',').map((entry) => (entry === '' ? null : (Number.isFinite(Number(entry)) ? Number(entry) : null)))
  : []);

/**
 * The slot of every ranked player. A room created with seats gives each player
 * theirs (`slot`, fixed at creation). A room from before seats existed has
 * none, so its players are seated by player key, and the projection then names
 * the key of each seat (`slotKeys`) for a screen to find its own.
 */
const seatPlayers = (entries = []) => {
  const seated = entries.every((entry) => Number.isInteger(entry.slot) && entry.slot >= 0 && entry.slot < STANDINGS_MAX_PLAYERS);
  const unique = seated && new Set(entries.map((entry) => entry.slot)).size === entries.length;
  if (unique) return { entries, slotKeys: null };
  const keys = [...new Set(entries.map((entry) => entry.playerKey).filter(Boolean))].sort();
  const slotOf = new Map(keys.map((key, index) => [key, index]));
  return {
    entries: entries.map((entry) => ({ ...entry, slot: slotOf.get(entry.playerKey) ?? null })),
    slotKeys: keys,
  };
};

/**
 * Build a projection document (without its server timestamps, which the
 * writer adds) from ranked entries: [{ playerKey, slot, alias, rank, tied,
 * position, score }] in display order.
 */
export const buildStandingsProjection = ({
  roomId,
  kind = PROJECTION_KIND.LIVE,
  status = null,
  roundIndex = -1,
  roundVersion = 0,
  roundState = null,
  scoringStrategyId = null,
  includesWorkInProgress = false,
  ranked = [],
} = {}) => {
  const exact = kind === PROJECTION_KIND.ROUND_CLOSED || kind === PROJECTION_KIND.FINAL;
  const rows = (Array.isArray(ranked) ? ranked : [])
    .filter((entry) => entry && cleanKey(entry.playerKey) && Number.isInteger(Number(entry.rank)) && Number(entry.rank) >= 1)
    .slice(0, STANDINGS_MAX_PLAYERS)
    .map((entry, index) => ({
      playerKey: cleanKey(entry.playerKey),
      slot: Number.isInteger(Number(entry.slot)) ? Number(entry.slot) : null,
      alias: cleanAlias(entry.alias),
      rank: integerOr(entry.rank, null),
      tied: entry.tied === true,
      position: integerOr(entry.position, index + 1),
      score: nonNegativeInt(entry.score),
    }))
    .sort((left, right) => left.position - right.position);
  const { entries, slotKeys } = seatPlayers(rows);
  const width = entries.reduce((max, entry) => Math.max(max, (entry.slot ?? -1) + 1), 0);
  const ranks = Array.from({ length: width }, () => null);
  const scores = Array.from({ length: width }, () => null);
  entries.forEach((entry) => {
    if (entry.slot === null) return;
    ranks[entry.slot] = entry.rank;
    scores[entry.slot] = entry.score;
  });
  const position = projectionPosition({ status, roundVersion, roundState, kind });
  return {
    schemaVersion: STANDINGS_PROJECTION_SCHEMA_VERSION,
    roomId: String(roomId || ''),
    kind,
    exact,
    status: status || null,
    roundIndex: integerOr(roundIndex, -1),
    roundVersion: nonNegativeInt(roundVersion),
    phase: position.phase,
    scoringStrategyId: getScoringStrategy(scoringStrategyId).id,
    includesWorkInProgress: includesWorkInProgress === true,
    count: entries.length,
    top: entries.slice(0, STANDINGS_TOP_ROWS).map((entry) => ({
      playerKey: entry.playerKey,
      slot: entry.slot,
      alias: entry.alias,
      rank: entry.rank,
      tied: entry.tied,
      score: entry.score,
    })),
    ranks: encodeSlotList(ranks),
    scores: encodeSlotList(scores),
    ...(slotKeys ? { slotKeys: slotKeys.join(',') } : {}),
  };
};

/**
 * Which round's work in progress a live snapshot taken at `nowMs` includes:
 * the open round between its start and its deadline, exactly as a screen's
 * live board does (stage roundActive); none otherwise.
 */
export const liveProjectionActiveRound = (room = {}, nowMs = Date.now()) => {
  if (room?.status !== 'running' || room?.roundState === 'closed') return null;
  const { startsAtMs, endsAtMs } = timerFromRoom(room);
  if (startsAtMs && nowMs < startsAtMs) return null;
  if (endsAtMs && nowMs >= endsAtMs) return null;
  const round = Number(room.currentRound);
  return Number.isInteger(round) && round >= 0 ? round : null;
};

/**
 * A LIVE snapshot from the public player rows, ranked exactly as the host's
 * board and every screen ranked them before (publicLeaderboard with the room's
 * strategy options).
 */
export const liveProjectionFromPublicRows = ({ roomId, room = {}, rows = [], nowMs = Date.now() } = {}) => {
  const activeRound = liveProjectionActiveRound(room, nowMs);
  const slotByKey = new Map((Array.isArray(rows) ? rows : [])
    .filter((row) => row?.playerKey)
    .map((row) => [String(row.playerKey), Number.isInteger(Number(row.slot)) && row.slot !== null && row.slot !== undefined ? Number(row.slot) : null]));
  const board = publicLeaderboard(rows, { activeRound, ...leaderboardOptionsFor(room.scoringStrategyId || null) });
  return buildStandingsProjection({
    roomId,
    kind: PROJECTION_KIND.LIVE,
    status: room.status || null,
    roundIndex: integerOr(room.currentRound, -1),
    roundVersion: room.roundVersion,
    roundState: room.roundState || null,
    scoringStrategyId: room.scoringStrategyId || null,
    includesWorkInProgress: activeRound !== null && leaderboardOptionsFor(room.scoringStrategyId || null).includeProvisional === true,
    ranked: board.map((row) => ({
      playerKey: row.playerKey,
      slot: slotByKey.get(String(row.playerKey)) ?? null,
      alias: row.alias,
      rank: row.rank,
      tied: row.tied,
      position: row.position,
      score: row.liveScore ?? row.score,
    })),
  });
};

/**
 * An EXACT snapshot from standings the engine wrote: a round's
 * standingsAfterRound (matchStandingsAfterRound) or a match result's
 * standings (buildMatchResult). `players` are the private records the
 * transaction read, for each player's slot. Players without a rank (never
 * joined) are not on it.
 */
export const exactProjectionFromStandings = ({ roomId, room = {}, kind, standings = [], players = [], status = null } = {}) => {
  const slotByKey = new Map((Array.isArray(players) ? players : [])
    .filter((player) => player?.playerKey)
    .map((player) => [String(player.playerKey), Number.isInteger(Number(player.slot)) && player.slot !== null && player.slot !== undefined ? Number(player.slot) : null]));
  return buildStandingsProjection({
    roomId,
    kind,
    status: status || room.status || null,
    roundIndex: integerOr(room.currentRound, -1),
    roundVersion: room.roundVersion,
    roundState: kind === PROJECTION_KIND.ROUND_CLOSED ? 'closed' : room.roundState || null,
    scoringStrategyId: room.scoringStrategyId || null,
    includesWorkInProgress: false,
    ranked: (Array.isArray(standings) ? standings : [])
      .filter((standing) => standing?.playerKey && standing.rank !== null && standing.rank !== undefined && standing.joined !== false)
      .map((standing) => ({
        playerKey: standing.playerKey,
        slot: slotByKey.get(String(standing.playerKey)) ?? null,
        alias: standing.alias,
        rank: standing.rank,
        tied: standing.tied,
        position: standing.position,
        score: standing.score,
      })),
  });
};

// A 53-bit string hash (cyrb53): small and pure, so the snapshot carries a
// 14-character digest instead of a second copy of itself, and the module stays
// free of node-only imports (screens import it too).
const hash53 = (text) => {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first = Math.imul(first ^ (first >>> 16), 2246822507) ^ Math.imul(second ^ (second >>> 13), 3266489909);
  second = Math.imul(second ^ (second >>> 16), 2246822507) ^ Math.imul(first ^ (first >>> 13), 3266489909);
  return (4294967296 * (2097151 & second) + (first >>> 0)).toString(36);
};

/**
 * What a snapshot SAYS, for "did anything change": the moment, the count, the
 * top rows and every rank and score. A live publish whose digest equals the
 * stored one writes nothing, so no screen is woken for it.
 */
export const projectionDigest = (projection = {}) => hash53(JSON.stringify([
  projection.kind, projection.status, projection.roundIndex, projection.roundVersion, projection.phase,
  projection.includesWorkInProgress === true, projection.count,
  (projection.top || []).map((row) => [row.playerKey, row.slot, row.alias, row.rank, row.tied, row.score]),
  projection.ranks || '', projection.scores || '', projection.slotKeys || '',
]));

/**
 * May `next` replace `stored`? A final snapshot is never replaced. A snapshot
 * from an earlier moment of the match never replaces a later one. At the same
 * moment, an exact snapshot replaces a live one, and a live one replaces
 * another only if it was read later (`sourceReadMs`, on Firestore's clock).
 */
export const projectionMayReplace = (stored = null, next = {}) => {
  if (!stored) return true;
  if (stored.kind === PROJECTION_KIND.FINAL) return false;
  const order = comparePositions(
    { version: next.roundVersion, phase: next.phase },
    { version: stored.roundVersion, phase: stored.phase },
  );
  if (order !== 0) return order > 0;
  if (next.exact === true) return true;
  if (stored.exact === true) return false;
  return Number(next.sourceReadMs) > Number(stored.sourceReadMs || 0);
};

/*
 * ON A SCREEN. A student's view of a snapshot: the top rows in the shape the
 * standings model expects (standingsRows), and their own place.
 */

/** This screen's slot in `projection`: its own seat, or — in a room from before seats — its key's. */
export const projectionSlotFor = (projection = null, { slot = null, playerKey = null } = {}) => {
  if (!projection) return null;
  if (typeof projection.slotKeys === 'string' && projection.slotKeys) {
    const index = projection.slotKeys.split(',').indexOf(String(playerKey || ''));
    return index >= 0 ? index : null;
  }
  return Number.isInteger(Number(slot)) && slot !== null && slot !== undefined ? Number(slot) : null;
};

/**
 * Decode a snapshot for one screen. `self` is null when the student is not on
 * it (not joined yet, or a seat the snapshot does not rank).
 */
export const standingsFromProjection = (projection = null, { roomId = null, slot = null, playerKey = null } = {}) => {
  if (!projection || typeof projection !== 'object') return null;
  if (roomId && projection.roomId && String(projection.roomId) !== String(roomId)) return null;
  if (Number(projection.schemaVersion) !== STANDINGS_PROJECTION_SCHEMA_VERSION) return null;
  const ranks = decodeSlotList(projection.ranks);
  const scores = decodeSlotList(projection.scores);
  const mine = projectionSlotFor(projection, { slot, playerKey });
  const myRank = mine !== null ? ranks[mine] ?? null : null;
  const shared = myRank !== null ? ranks.filter((rank) => rank === myRank).length > 1 : false;
  const top = (Array.isArray(projection.top) ? projection.top : []).map((row, index) => ({
    playerKey: cleanKey(row.playerKey) || `slot-${row.slot}`,
    alias: cleanAlias(row.alias),
    rank: integerOr(row.rank, null),
    tied: row.tied === true,
    position: index + 1,
    score: nonNegativeInt(row.score),
    liveScore: nonNegativeInt(row.score),
    slot: Number.isInteger(Number(row.slot)) ? Number(row.slot) : null,
  }));
  return Object.freeze({
    kind: projection.kind,
    exact: projection.exact === true,
    status: projection.status || null,
    roundIndex: integerOr(projection.roundIndex, -1),
    roundVersion: nonNegativeInt(projection.roundVersion),
    phase: projection.phase || null,
    includesWorkInProgress: projection.includesWorkInProgress === true,
    count: nonNegativeInt(projection.count),
    top,
    self: myRank === null ? null : Object.freeze({
      slot: mine,
      rank: myRank,
      tied: shared,
      score: nonNegativeInt(scores[mine]),
    }),
  });
};

/** Every ranked seat, as { slot, rank, score }: what the certification compares. */
export const projectionRankTable = (projection = null) => {
  if (!projection) return [];
  const ranks = decodeSlotList(projection.ranks);
  const scores = decodeSlotList(projection.scores);
  return ranks.map((rank, slot) => ({ slot, rank, score: scores[slot] ?? null })).filter((entry) => entry.rank !== null);
};
