/*
 * GRAPH FEATURE RUSH: WHAT THE SCREENS SAY ABOUT A ROUND.
 *
 * Read from the public player rows the server writes — counts and ranks keyed
 * by alias, never a student id and never a graph:
 *
 *   rushRound / rushRoundCompleted   graphs a player has completed in the
 *                                    round now running (written with each
 *                                    batch of their taps)
 *   lastRound                        their facts for the round that just
 *                                    closed: completed, accuracy, rank in the
 *                                    field, championship points it earned
 *
 * publicLeaderboard() ranks the match and drops these fields, so the rush
 * screens read the rows directly. Pure: tested in node.
 */

const integerOr = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};

const byAlias = (left, right) => String(left.alias || '').localeCompare(String(right.alias || ''), undefined, { numeric: true });

const joinedRows = (players) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player && player.joined !== false && player.playerKey);

/** Graphs completed in the running round, most first; ties by alias. */
export const rushRaceRows = (players, roundIndex) => joinedRows(players)
  .map((player) => ({
    playerKey: String(player.playerKey),
    alias: String(player.alias || 'Player'),
    completed: integerOr(player.rushRound) === integerOr(roundIndex) ? Math.max(0, integerOr(player.rushRoundCompleted, 0)) : 0,
    playing: integerOr(player.rushRound) === integerOr(roundIndex),
    score: Math.max(0, Math.round(Number(player.score) || 0)),
  }))
  .sort((left, right) => right.completed - left.completed || byAlias(left, right));

/** How many joined players have made a recorded attempt in the running round. */
export const rushPlayingCount = (players, roundIndex) => rushRaceRows(players, roundIndex).filter((row) => row.playing).length;

/** One player's facts for a closed round, or null if the row has none for it. */
export const rushRoundFacts = (players, playerKey, roundIndex) => {
  const row = joinedRows(players).find((player) => String(player.playerKey) === String(playerKey));
  const last = row?.lastRound;
  if (!last || integerOr(last.roundIndex) !== integerOr(roundIndex)) return null;
  return Object.freeze({
    roundIndex: integerOr(last.roundIndex),
    participated: last.participated === true,
    completed: Math.max(0, integerOr(last.completed, 0)),
    accuracyPercent: Number.isFinite(Number(last.accuracyPercent)) && last.accuracyPercent !== null ? Math.round(Number(last.accuracyPercent)) : null,
    rank: last.participated === true ? integerOr(last.rank) : null,
    fieldSize: integerOr(last.fieldSize),
    matchPointsAwarded: Math.max(0, integerOr(last.matchPointsAwarded, 0)),
  });
};

/** Every joined player's closed-round facts, by round rank (non-players last). */
export const rushRoundResultRows = (players, roundIndex) => joinedRows(players)
  .map((player) => ({ playerKey: String(player.playerKey), alias: String(player.alias || 'Player'), facts: rushRoundFacts([player], player.playerKey, roundIndex) }))
  .filter((row) => row.facts)
  .sort((left, right) => (left.facts.rank ?? Number.MAX_SAFE_INTEGER) - (right.facts.rank ?? Number.MAX_SAFE_INTEGER) || byAlias(left, right));

/** How a strategy's match score reads on screen. */
export const rushScoreUnit = (scoringStrategyId) => (scoringStrategyId === 'grandPrix'
  ? Object.freeze({ short: 'pts', long: 'championship points', placement: true })
  : Object.freeze({ short: 'graphs', long: 'graphs completed', placement: false }));
