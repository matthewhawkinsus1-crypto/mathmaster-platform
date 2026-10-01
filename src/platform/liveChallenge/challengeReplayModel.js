/*
 * PLAY AGAIN: THE SAME GAME, AS A NEW MATCH.
 *
 * A class often plays two or three games in a period. "Play again" creates a
 * FRESH room with the finished room's settings — never reopens the old one:
 *
 *   - a new room id, so a new match: new receipts, rounds, clock, round
 *     tokens, match result and reward identities (award ids hash the room id),
 *     and nothing from the last game can be scored into this one;
 *   - the same class, so createLiveChallenge re-invites the same students and
 *     their screens follow their invite into the new lobby;
 *   - the same game settings, read from the room's public fields, so a replay
 *     works after a refresh or from another device too;
 *   - NOT the assignment Warm-Up link. A Warm-Up records one result per
 *     assignment; a second game would overwrite the first. A replay of a
 *     Warm-Up game is a standalone game.
 *
 * The reward policy is not on the room (it is private); the caller passes the
 * teacher's current Rewards choice, which is what the create panel would send.
 *
 * Pure: tested in node.
 */

import { RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};
const text = (value) => (value === undefined || value === null ? null : String(value));

/** The createLiveChallenge request that replays this room, or null if it cannot be replayed. */
export const replayRequestFromRoom = (room = {}, { rewardPolicy = null } = {}) => {
  if (!room || !room.classId) return null;
  const request = {
    classId: String(room.classId),
    classPeriod: text(room.classPeriod),
    courseId: text(room.courseId) || 'algebra1',
    title: text(room.title),
    challengeMode: text(room.challengeMode) || 'standard',
    // The teacher asked for this many; the bank may have shortened the last game.
    roundCount: integerOr(room.requestedRoundCount, integerOr(room.roundCount, null)),
    roundSeconds: integerOr(room.roundSeconds, null),
    scoringStrategyId: text(room.scoringStrategyId),
    rewardPolicy: rewardPolicy || null,
  };
  if (room.challengeMode === RUSH_MODE_ID) {
    const config = room.graphFeatureRush?.config;
    if (!config) return null;
    request.graphFeatureRush = {
      presetId: text(config.presetId) || 'custom',
      families: Array.isArray(config.families) ? [...config.families] : [],
      features: Array.isArray(config.features) ? [...config.features] : [],
      difficulty: text(config.difficulty),
    };
  } else {
    Object.assign(request, {
      standardCode: text(room.standardCode) || 'mixed',
      questionStyle: text(room.questionStyle) || 'any',
      solverRaceFocus: text(room.solverRaceFocus),
      solverRaceDifficulty: text(room.solverRaceDifficulty),
      timingMode: text(room.timingMode) || 'timed',
      // Null is the teacher's "Off"; a room without the field keeps the server default.
      roundClosingThreshold: room.roundClosingThreshold,
      secondChanceMode: room.secondChanceMode === 'automatic' ? 'automatic' : 'off',
      // Deliberately no Warm-Up link: see the header.
      assignmentId: null,
    });
  }
  // Settings the room never had are left to the server's defaults.
  return Object.freeze(Object.fromEntries(Object.entries(request).filter(([key, value]) => value !== undefined
    && (value !== null || key === 'assignmentId' || key === 'roundClosingThreshold' || key === 'rewardPolicy'))));
};

/** The display settings configureLiveChallengeExperience secures after create. */
export const replayExperienceFromRoom = (room = {}) => Object.freeze({
  speedInfluencePercent: room.challengeMode === RUSH_MODE_ID ? 0 : integerOr(room.speedInfluencePercent, 20),
  playerDisplayMode: text(room.playerDisplayMode) || 'codeName',
});

/** One line saying what "Play again" will run. */
export const replaySummary = (room = {}) => {
  const rounds = integerOr(room.requestedRoundCount, integerOr(room.roundCount, 0));
  const parts = [
    room.challengeMode === RUSH_MODE_ID ? 'Graph Feature Rush' : room.challengeMode === 'solverRace' ? 'Solver Race' : 'Standard Challenge',
    rounds ? `${rounds} round${rounds === 1 ? '' : 's'}` : null,
    room.timingMode === 'pace' ? 'Pace Race' : (integerOr(room.roundSeconds, 0) ? `${room.roundSeconds}s each` : null),
    room.scoringStrategyId === 'grandPrix' ? 'Grand Prix' : room.scoringStrategyId === 'correctCount' ? 'Correct Count' : null,
  ];
  return parts.filter(Boolean).join(' · ');
};
