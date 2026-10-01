/*
 * LIVE CHALLENGE STANDINGS AND RESULTS, AS A SCREEN SHOWS THEM.
 *
 * WHAT A NUMBER MEANS. A game mode and a scoring strategy together decide what
 * the score on a board is: Accuracy First banks points per answer, Correct
 * Count counts correct answers (or completed graphs), and Grand Prix turns
 * each round's PLACE into bounded championship points — so a student can
 * finish more graphs in a round than the winner of the championship and still
 * trail. A board never shows one unlabeled number that could mean either:
 * `scorePresentation` names the match total and the per-round performance
 * separately.
 *
 * RANKS ARE THE ENGINE'S. Ranking happens once, in liveChallengeRanking.mjs
 * (publicLeaderboard for the live board, the round result written when a round
 * closes, and that round's `standingsAfterRound`). Here they are only
 * labelled: a shared rank reads "T-2", never an invented 2nd and 3rd.
 *
 * MOVEMENT IS REAL. ↑2 is the difference between two ranks the engine wrote —
 * the standings after the previous round and after this one — never a guess
 * from where a row happens to sit on the screen.
 *
 * Pure: tested in node.
 */

import { getScoringStrategy, SCORE_ACCUMULATION } from '../../../functions/shared/liveChallengeScoring.mjs';

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};
const nonNegativeInt = (value) => Math.max(0, Math.round(Number(value) || 0));

export const formatPoints = (value) => nonNegativeInt(value).toLocaleString();

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export const ordinal = (value) => {
  const place = nonNegativeInt(value);
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  return `${place}${({ 1: 'st', 2: 'nd', 3: 'rd' })[place % 10] || 'th'}`;
};

/**
 * A rank as words and as a compact label. A tie is always said: two players
 * sharing 2nd are both "T-2", and the next player is 4th — the engine's
 * competition ranking, shown as it is.
 */
export const placeLabel = ({ rank, tied = false } = {}) => {
  const place = integerOr(rank, null);
  if (place === null || place < 1) return Object.freeze({ short: '—', ordinal: '—', spoken: 'not placed' });
  return Object.freeze({
    short: tied ? `T-${place}` : String(place),
    ordinal: tied ? `T-${ordinal(place)}` : ordinal(place),
    spoken: tied ? `tied for ${ordinal(place)}` : ordinal(place),
  });
};

/**
 * What the numbers on a board mean for this room.
 *
 *   total   the match score every board ranks by
 *   round   a player's own performance in one round (what they DID)
 *   placementPoints   true when a round's PLACE earns the match points
 *                     (Grand Prix): results show place and the points it
 *                     earned beside the raw performance
 */
export const scorePresentation = ({ scoringStrategyId = null, questionSet = false } = {}) => {
  const strategy = getScoringStrategy(scoringStrategyId);
  const perRound = strategy.accumulation === SCORE_ACCUMULATION.PER_ROUND;
  if (perRound) {
    return Object.freeze({
      strategyId: strategy.id,
      placementPoints: true,
      total: Object.freeze({ long: 'championship points', short: 'champ pts', one: 'championship point' }),
      round: questionSet
        ? Object.freeze({ long: 'graphs completed', short: 'graphs', one: 'graph completed' })
        : Object.freeze({ long: 'round points', short: 'round pts', one: 'round point' }),
    });
  }
  if (strategy.id === 'correctCount') {
    return Object.freeze({
      strategyId: strategy.id,
      placementPoints: false,
      total: questionSet
        ? Object.freeze({ long: 'graphs completed', short: 'graphs', one: 'graph completed' })
        : Object.freeze({ long: 'correct answers', short: 'correct', one: 'correct answer' }),
      round: questionSet
        ? Object.freeze({ long: 'graphs completed', short: 'graphs', one: 'graph completed' })
        : Object.freeze({ long: 'correct this round', short: 'correct', one: 'correct this round' }),
    });
  }
  return Object.freeze({
    strategyId: strategy.id,
    placementPoints: false,
    total: Object.freeze({ long: 'points', short: 'pts', one: 'point' }),
    round: Object.freeze({ long: 'points this round', short: 'pts', one: 'point this round' }),
  });
};

/** "12 championship points", "1 graph completed", "2,345 points". */
export const amountText = (value, unit) => {
  const amount = nonNegativeInt(value);
  return `${amount.toLocaleString()} ${amount === 1 ? unit.one : unit.long}`;
};

const rankMapOf = (standings) => {
  const map = new Map();
  (Array.isArray(standings) ? standings : []).forEach((row) => {
    const key = row?.playerKey ? String(row.playerKey) : null;
    const rank = integerOr(row?.rank, null);
    if (key && rank !== null) map.set(key, rank);
  });
  return map;
};

/**
 * Places gained (positive) or lost (negative) between two engine standings,
 * by player key. A player missing from the earlier standings has no movement
 * (they arrived since); equal ranks are 0.
 */
export const movementBetween = (previousStandings, currentStandings) => {
  const before = rankMapOf(previousStandings);
  const movement = new Map();
  (Array.isArray(currentStandings) ? currentStandings : []).forEach((row) => {
    const key = row?.playerKey ? String(row.playerKey) : null;
    const now = integerOr(row?.rank, null);
    if (!key || now === null || !before.has(key)) return;
    movement.set(key, before.get(key) - now);
  });
  return movement;
};

/** ↑2 / ↓1 / – as text, with words for a screen reader. Null when unknown. */
export const movementLabel = (delta) => {
  if (delta === null || delta === undefined || !Number.isFinite(Number(delta))) return null;
  const change = Math.round(Number(delta));
  if (change > 0) return Object.freeze({ direction: 'up', text: `↑${change}`, spoken: `up ${change} ${change === 1 ? 'place' : 'places'}` });
  if (change < 0) return Object.freeze({ direction: 'down', text: `↓${-change}`, spoken: `down ${-change} ${change === -1 ? 'place' : 'places'}` });
  return Object.freeze({ direction: 'same', text: '–', spoken: 'no change' });
};

/**
 * Board rows from an engine ranking (publicLeaderboard output, or a round's
 * standingsAfterRound): rank, tie, the score in this room's unit, movement
 * when an earlier standing is known, and which row is the viewer's own.
 */
export const standingsRows = (standings = [], { movement = null, selfKey = null } = {}) => (
  (Array.isArray(standings) ? standings : [])
    .filter(Boolean)
    .map((row, index) => {
      const playerKey = row.playerKey ? String(row.playerKey) : null;
      const delta = movement && playerKey && movement.has(playerKey) ? movement.get(playerKey) : null;
      return Object.freeze({
        playerKey,
        alias: String(row.alias || 'Player'),
        rank: integerOr(row.rank, null),
        tied: row.tied === true,
        position: integerOr(row.position, index),
        score: nonNegativeInt(row.liveScore ?? row.score),
        bankedScore: nonNegativeInt(row.score),
        provisionalPoints: nonNegativeInt(row.provisionalPoints),
        correctCount: nonNegativeInt(row.correctCount),
        roundWins: nonNegativeInt(row.roundWins),
        roundsAnswered: nonNegativeInt(row.roundsAnswered),
        place: placeLabel({ rank: row.rank, tied: row.tied === true }),
        movement: movementLabel(delta),
        isSelf: Boolean(selfKey) && playerKey === String(selfKey),
      });
    })
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) || left.position - right.position)
);

/** "4th", "T-2nd": a place short enough for a header. Null when unranked. */
export const shortPlaceText = (row) => {
  const rank = integerOr(row?.rank, null);
  return rank !== null && rank > 0 ? `${row.tied === true ? 'T-' : ''}${ordinal(rank)}` : null;
};

/**
 * A board too big for the room. The projector shows the top of the standings
 * and how many more are playing; it never singles out the bottom. A student's
 * own row is added below the top when they are outside it — on their own
 * device only.
 */
export const standingsWindow = (rows = [], { limit = 8, selfKey = null } = {}) => {
  const all = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Math.floor(Number(limit) || 8));
  const top = all.slice(0, size);
  const self = selfKey ? all.find((row) => row.playerKey === String(selfKey)) || null : null;
  const selfOutside = Boolean(self) && !top.some((row) => row.playerKey === self.playerKey);
  return Object.freeze({
    top,
    self: selfOutside ? self : null,
    hiddenCount: Math.max(0, all.length - top.length),
    total: all.length,
  });
};

/**
 * One closed round, from its anonymous result document
 * (liveChallengeRooms/{room}/rounds/{round}): every player's place in the
 * round, what they did in it, and the match points their place earned.
 * Non-participants sort last and have no place.
 */
export const roundResultRows = (summary = null, { selfKey = null } = {}) => {
  if (!summary || !Array.isArray(summary.standings)) return [];
  return summary.standings
    .map((row, index) => {
      const participated = row.participated === true;
      const rank = participated ? integerOr(row.rank, null) : null;
      return Object.freeze({
        playerKey: row.playerKey ? String(row.playerKey) : null,
        alias: String(row.alias || 'Player'),
        participated,
        rank,
        tied: participated && row.tied === true,
        position: integerOr(row.position, index),
        place: placeLabel({ rank, tied: participated && row.tied === true }),
        roundPoints: nonNegativeInt(row.roundPoints),
        matchPointsAwarded: nonNegativeInt(row.matchPointsAwarded),
        completed: row.completed === undefined ? null : nonNegativeInt(row.completed),
        accuracyPercent: Number.isFinite(Number(row.accuracyPercent)) && row.accuracyPercent !== null ? Math.round(Number(row.accuracyPercent)) : null,
        isSelf: Boolean(selfKey) && String(row.playerKey) === String(selfKey),
      });
    })
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) || left.position - right.position);
};

/**
 * The results moment for one round: the round's own table, the standings it
 * left behind (with movement since the round before), and the viewer's row in
 * each. `previousSummary` is the round before's result document, when there
 * is one. Rooms closed before standingsAfterRound existed return null
 * standings; a screen then falls back to the live board without movement.
 */
export const roundResultsView = ({ summary = null, previousSummary = null, selfKey = null } = {}) => {
  if (!summary) return null;
  const rows = roundResultRows(summary, { selfKey });
  const after = Array.isArray(summary.standingsAfterRound) ? summary.standingsAfterRound : null;
  const before = Array.isArray(previousSummary?.standingsAfterRound) ? previousSummary.standingsAfterRound : null;
  const standings = after ? standingsRows(after, { movement: before ? movementBetween(before, after) : null, selfKey }) : null;
  const fieldSize = integerOr(summary.fieldSize, rows.filter((row) => row.participated).length);
  return Object.freeze({
    roundIndex: integerOr(summary.roundIndex, null),
    isSecondChance: summary.isSecondChance === true,
    fieldSize,
    participantCount: rows.length,
    rows,
    self: selfKey ? rows.find((row) => row.isSelf) || null : null,
    standings,
    selfStanding: selfKey && standings ? standings.find((row) => row.isSelf) || null : null,
  });
};

/** "You placed 4th of 22" / "You tied for 2nd of 22" / "No answer this round". */
export const roundPlacementSentence = (row, fieldSize) => {
  if (!row) return 'You will play from the next round.';
  if (!row.participated || row.rank === null) return 'No answer this round.';
  const of = Number(fieldSize) > 0 ? ` of ${fieldSize}` : '';
  return row.tied ? `You tied for ${ordinal(row.rank)}${of}` : `You placed ${ordinal(row.rank)}${of}`;
};

/*
 * REWARDS ON THE BOARD. A room's public reward summary (written at create from
 * the validated policy) says what placements earn. The final screens show it
 * against the final standings: the same ranks the match result rewards from,
 * with the same minimum rounds answered. This is DISPLAY ONLY — rewards are
 * delivered once by the server from the durable match result; a student's own
 * device shows what actually reached their wallet.
 */
export const placementRewardsFor = (rows = [], rewardSummary = null) => {
  const rules = Array.isArray(rewardSummary?.placement) ? rewardSummary.placement : [];
  const awards = new Map();
  if (!rules.length) return awards;
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const rank = integerOr(row?.rank, null);
    if (rank === null || !row?.playerKey) return;
    const earned = rules
      .filter((rule) => rank <= integerOr(rule.maxRank, 0) && nonNegativeInt(row.roundsAnswered) >= Math.max(0, integerOr(rule.minRoundsAnswered, 1)))
      .map((rule) => Object.freeze({ rewardCode: String(rule.rewardCode || ''), label: String(rule.label || rule.rewardCode || 'Reward') }));
    if (earned.length) awards.set(String(row.playerKey), Object.freeze(earned));
  });
  return awards;
};

const placesText = (maxRank) => {
  const places = integerOr(maxRank, 0);
  if (places <= 1) return '1st place';
  return `Top ${places}`;
};

/** The room's rewards in plain sentences, for the lobby and the final screen. */
export const rewardSummaryLines = (rewardSummary = null) => {
  if (!rewardSummary || typeof rewardSummary !== 'object') return [];
  const lines = [];
  (Array.isArray(rewardSummary.placement) ? rewardSummary.placement : []).forEach((rule) => {
    lines.push(`${placesText(rule.maxRank)}: ${String(rule.label || 'a reward')}${Number(rule.maxRank) > 1 ? ' each' : ''}`);
  });
  if (rewardSummary.classPoints === true) lines.push('Class Points for finishing, accuracy and comebacks');
  return lines;
};
