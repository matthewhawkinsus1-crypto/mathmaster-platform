/*
 * RECOGNITION BEYOND THE PODIUM.
 *
 * A podium celebrates three students. The rest of the class — including the
 * student who missed the first four questions and then got the next four —
 * walked away with nothing to point at. These recognitions name what a match
 * showed about effort and growth, not just speed and placement:
 *
 *   mostImproved   the largest rise in correct rate from the first half of the
 *                  scheduled rounds a player was present for to the second
 *                  half. Needs at least MIN_IMPROVEMENT_ROUNDS rounds and a
 *                  real rise (MIN_IMPROVEMENT_RISE), never a rounding wobble.
 *   steadiest      answered every scheduled round available to them (at least
 *                  MIN_STEADY_ROUNDS) and got at least one right; among those,
 *                  the longest correct streak. The copy promises "a run of right
 *                  answers", so a student with none cannot be named for it.
 *   bestComeback   the most comebacks plus second-chance recoveries (>= 1).
 *   firstToAnswer  the most scheduled rounds where they gave the fastest
 *                  CORRECT first answer (>= 1). A fast wrong answer never
 *                  counts. Not in modes where every player has their own
 *                  questions — there is no shared question to be first to.
 *   teamEffort     class-wide: when at least TEAM_EFFORT_RATIO of the joined
 *                  players answered at least TEAM_EFFORT_RATIO of the rounds
 *                  available to them, every joined player who answered at
 *                  least one round earns it. The class did it together.
 *
 * BEYOND THE PODIUM. For an individual recognition, when a player outside the
 * top three qualifies exactly as well as one on the podium, the recognition
 * goes to the player outside it: the podium already had its moment. Ties
 * otherwise share. Everything is deterministic — the same match result always
 * produces the same recognitions in the same order.
 *
 * WHAT IS WRITTEN. A recognition names aliases and player keys — the same
 * game identity every screen already shows — never a student id. The rewards
 * effect maps player keys back to students from the match result's standings,
 * on the server. Pure: reads a match result (liveChallengeResults.mjs), writes
 * nothing.
 */

import { participationFacts, rewardContextFor, scheduledRoundsReached } from './liveChallengeRewardRules.mjs';
import { QUESTION_ISSUE, getChallengeMode } from './liveChallengeModes.mjs';

export const RECOGNITION_ID = Object.freeze({
  MOST_IMPROVED: 'mostImproved',
  STEADIEST: 'steadiest',
  BEST_COMEBACK: 'bestComeback',
  FIRST_TO_ANSWER: 'firstToAnswer',
  TEAM_EFFORT: 'teamEffort',
});

// The order recognitions are listed (and rewarded) in.
export const RECOGNITION_ORDER = Object.freeze([
  RECOGNITION_ID.MOST_IMPROVED,
  RECOGNITION_ID.STEADIEST,
  RECOGNITION_ID.BEST_COMEBACK,
  RECOGNITION_ID.FIRST_TO_ANSWER,
  RECOGNITION_ID.TEAM_EFFORT,
]);

export const MIN_IMPROVEMENT_ROUNDS = 4;
// A quarter of a half's rounds: with two rounds a half, one more right; with
// five, two more. Anything smaller is noise, not growth.
export const MIN_IMPROVEMENT_RISE = 0.25;
export const MIN_STEADY_ROUNDS = 3;
export const TEAM_EFFORT_RATIO = 0.8;
// The podium places a recognition looks past when someone else qualifies equally.
export const PODIUM_RANKS = 3;

/*
 * The words. `detail` is what a projector says under the recognition (it is
 * about the class's game, never addressed to one reader); `personalDetail` is
 * what the student who earned it reads on their own screen.
 */
export const RECOGNITION_COPY = Object.freeze({
  [RECOGNITION_ID.MOST_IMPROVED]: Object.freeze({
    label: 'Most improved',
    detail: 'The biggest jump from the first half of the game to the second.',
    personalDetail: 'Most improved — your second half beat your first.',
  }),
  [RECOGNITION_ID.STEADIEST]: Object.freeze({
    label: 'Steadiest',
    detail: 'Answered every round, with the longest run of right answers.',
    personalDetail: 'Steadiest — you answered every round and kept a run of right answers going.',
  }),
  [RECOGNITION_ID.BEST_COMEBACK]: Object.freeze({
    label: 'Best comeback',
    detail: 'Got right what they had missed, more than anyone else.',
    personalDetail: 'Best comeback — after a miss, you came back and got it right.',
  }),
  [RECOGNITION_ID.FIRST_TO_ANSWER]: Object.freeze({
    label: 'First to answer',
    detail: 'The first right answer in the most rounds.',
    personalDetail: 'First to answer — you gave the first right answer in a round.',
  }),
  [RECOGNITION_ID.TEAM_EFFORT]: Object.freeze({
    label: 'Team effort',
    detail: 'Almost everyone answered almost every round. The whole class earned this.',
    personalDetail: 'Team effort — your class answered almost every round together, and you were part of it.',
  }),
});

const list = (value) => (Array.isArray(value) ? value : []);
const isInt = (value) => typeof value === 'number' && Number.isInteger(value);
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const joinedAt = (standing) => (isInt(standing?.joinedAtRound) ? Math.max(0, standing.joinedAtRound) : 0);

/** The scheduled rounds (not replays) a player was present for, ascending. */
const presentRounds = (standing, reached) => {
  const rounds = [];
  for (let round = joinedAt(standing); round < reached; round += 1) rounds.push(round);
  return rounds;
};

/** Each scheduled round's FIRST-time outcome (never a replay), by round. */
const firstOutcomes = (standing, reached) => {
  const byRound = new Map();
  list(standing?.roundOutcomes).forEach((outcome) => {
    const round = outcome?.roundIndex;
    if (!isInt(round) || round < 0 || round >= reached || outcome.secondChance === true) return;
    if (!byRound.has(round)) byRound.set(round, outcome);
  });
  return byRound;
};

const correctIn = (rounds, outcomes) => rounds.filter((round) => outcomes.get(round)?.isCorrect === true).length;

/**
 * The improvement a player showed: correct rate in the second half of the
 * rounds they were present for, less the first. With an odd count the middle
 * round belongs to neither half, so both halves are the same size.
 */
export const improvementOf = (standing = {}, reached = 0) => {
  const rounds = presentRounds(standing, reached);
  if (rounds.length < MIN_IMPROVEMENT_ROUNDS) return null;
  const half = Math.floor(rounds.length / 2);
  const outcomes = firstOutcomes(standing, reached);
  const first = correctIn(rounds.slice(0, half), outcomes) / half;
  const second = correctIn(rounds.slice(rounds.length - half), outcomes) / half;
  return second - first;
};

/** Fastest correct first answers, counted per player key (synchronized rounds only). */
const firstCorrectCounts = (players, reached) => {
  const counts = new Map();
  for (let round = 0; round < reached; round += 1) {
    let best = null;
    let leaders = [];
    players.forEach((standing) => {
      const outcome = firstOutcomes(standing, reached).get(round);
      const elapsed = Number(outcome?.elapsedMs);
      if (outcome?.isCorrect !== true || outcome.elapsedMs === null || !Number.isFinite(elapsed)) return;
      if (best === null || elapsed < best) { best = elapsed; leaders = [standing]; } else if (elapsed === best) leaders.push(standing);
    });
    leaders.forEach((standing) => counts.set(standing.playerKey, (counts.get(standing.playerKey) || 0) + 1));
  }
  return counts;
};

const onPodium = (standing) => isInt(standing?.rank) && standing.rank >= 1 && standing.rank <= PODIUM_RANKS;

/**
 * The winners of one individual recognition: the best qualifying value, ties
 * shared — and when anyone off the podium has that value, only them.
 */
const pickWinners = (candidates) => {
  if (!candidates.length) return [];
  const best = Math.max(...candidates.map((entry) => entry.value));
  const top = candidates.filter((entry) => entry.value === best);
  const offPodium = top.filter((entry) => !onPodium(entry.standing));
  return (offPodium.length ? offPodium : top).map((entry) => entry.standing);
};

const recognition = (id, winners, { classWide = false } = {}) => {
  const ordered = [...winners].sort((a, b) => byKey(String(a.alias), String(b.alias)) || byKey(a.playerKey, b.playerKey));
  return Object.freeze({
    id,
    label: RECOGNITION_COPY[id].label,
    detail: RECOGNITION_COPY[id].detail,
    aliases: Object.freeze(ordered.map((standing) => String(standing.alias || 'Player'))),
    playerKeys: Object.freeze(ordered.map((standing) => String(standing.playerKey))),
    classWide,
  });
};

/**
 * Every recognition a FINISHED match earns. A cancelled match earns none.
 * Only joined players with a player key can be recognised: the key is how a
 * screen (and the rewards effect) finds them.
 */
export const matchRecognitions = (matchResult = {}) => {
  if (matchResult?.status !== 'finished') return [];
  const context = rewardContextFor(matchResult);
  const reached = scheduledRoundsReached(context);
  const players = list(matchResult.standings)
    .filter((standing) => standing?.joined === true && standing.playerKey)
    .sort((a, b) => byKey(String(a.playerKey), String(b.playerKey)));
  if (!players.length) return [];
  const facts = new Map(players.map((standing) => [standing.playerKey, participationFacts(standing, context)]));
  const result = [];

  // Most improved.
  const improved = pickWinners(players
    .map((standing) => ({ standing, value: improvementOf(standing, reached) }))
    .filter((entry) => entry.value !== null && entry.value >= MIN_IMPROVEMENT_RISE - 1e-9));
  if (improved.length) result.push(recognition(RECOGNITION_ID.MOST_IMPROVED, improved));

  // Steadiest.
  const steady = pickWinners(players
    .filter((standing) => {
      const { available, answered } = facts.get(standing.playerKey);
      return available >= MIN_STEADY_ROUNDS && answered >= available;
    })
    .map((standing) => ({ standing, value: Math.max(0, Number(standing.bestStreak) || 0) }))
    // "kept a run of right answers going" must be true of everyone named.
    .filter((entry) => entry.value >= 1));
  if (steady.length) result.push(recognition(RECOGNITION_ID.STEADIEST, steady));

  // Best comeback.
  const comeback = pickWinners(players
    .map((standing) => ({
      standing,
      value: Math.max(0, Number(standing.comebackCount) || 0) + Math.max(0, Number(standing.recoveryCount) || 0),
    }))
    .filter((entry) => entry.value >= 1));
  if (comeback.length) result.push(recognition(RECOGNITION_ID.BEST_COMEBACK, comeback));

  // First to answer — a shared question only.
  if (getChallengeMode(matchResult.modeId).questionIssue !== QUESTION_ISSUE.PER_PLAYER) {
    const counts = firstCorrectCounts(players, reached);
    const first = pickWinners(players
      .map((standing) => ({ standing, value: counts.get(standing.playerKey) || 0 }))
      .filter((entry) => entry.value >= 1));
    if (first.length) result.push(recognition(RECOGNITION_ID.FIRST_TO_ANSWER, first));
  }

  // Team effort — measured over the players who had a round to answer.
  const measured = players.filter((standing) => facts.get(standing.playerKey).available > 0);
  const kept = measured.filter((standing) => {
    const { available, answered } = facts.get(standing.playerKey);
    return answered / available >= TEAM_EFFORT_RATIO;
  });
  if (measured.length && kept.length >= TEAM_EFFORT_RATIO * measured.length - 1e-9) {
    const earners = players.filter((standing) => facts.get(standing.playerKey).answered >= 1);
    if (earners.length) result.push(recognition(RECOGNITION_ID.TEAM_EFFORT, earners, { classWide: true }));
  }

  return Object.freeze(result);
};

/** The room's copy: exactly the contract fields, nothing else. */
export const publicRecognitions = (recognitions = []) => list(recognitions).map((entry) => ({
  id: String(entry.id),
  label: String(entry.label),
  detail: String(entry.detail),
  aliases: list(entry.aliases).map(String),
  playerKeys: list(entry.playerKeys).map(String),
  classWide: entry.classWide === true,
}));

/** The recognitions one player key earned, in the words they read themselves. */
export const recognitionsForPlayer = (recognitions = [], playerKey = null) => {
  if (!playerKey) return [];
  return list(recognitions)
    .filter((entry) => RECOGNITION_COPY[entry?.id] && list(entry.playerKeys).includes(String(playerKey)))
    .map((entry) => Object.freeze({
      id: entry.id,
      label: RECOGNITION_COPY[entry.id].label,
      detail: RECOGNITION_COPY[entry.id].personalDetail,
    }));
};
