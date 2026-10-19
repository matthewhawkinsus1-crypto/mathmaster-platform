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
 *   - the same projector standings choice (top few, or full standings): a
 *     teacher who opted one class into full standings keeps it, and a class
 *     on the default is never moved onto a full board by a replay;
 *   - NOT the assignment Warm-Up link. A Warm-Up records one result per
 *     assignment; a second game would overwrite the first. A replay of a
 *     Warm-Up game is a standalone game.
 *
 * The reward policy is not on the room (it is private); the caller passes the
 * teacher's current Rewards choice, which is what the create panel would send.
 *
 * Pure: tested in node.
 */

import { lineGraphFormatOfMode } from '../../../functions/shared/lineGraphRules.mjs';
import { normalizeStandingsDisplay } from '../../../functions/shared/liveChallengePrivacy.mjs';
import { QUESTION_SET_GAME, questionSetGameOf } from './challengeShellModel.js';

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
    // A room created before the choice existed has no field: the server's
    // default (top few) applies.
    standingsDisplay: room.standingsDisplay === undefined || room.standingsDisplay === null ? undefined : normalizeStandingsDisplay(room.standingsDisplay),
  };
  const game = questionSetGameOf(room);
  if (game === QUESTION_SET_GAME.GRAPH_FEATURE_RUSH) {
    const config = room.graphFeatureRush?.config;
    if (!config) return null;
    request.graphFeatureRush = {
      presetId: text(config.presetId) || 'custom',
      families: Array.isArray(config.families) ? [...config.families] : [],
      features: Array.isArray(config.features) ? [...config.features] : [],
      difficulty: text(config.difficulty),
    };
  } else if (game === QUESTION_SET_GAME.LINE_GRAPH) {
    // The room's own question settings, as the server normalized them; the
    // format is the mode's, so it rides on challengeMode, not here.
    const config = room.lineGraph?.config;
    if (!config) return null;
    request.lineGraph = {
      presetId: text(config.presetId) || 'custom',
      itemTypes: Array.isArray(config.itemTypes) ? [...config.itemTypes] : [],
      forms: Array.isArray(config.forms) ? [...config.forms] : [],
      specialLines: config.specialLines === true,
      difficulty: text(config.difficulty),
      nameStyle: text(config.nameStyle),
      // Absent, never null: the server reads a null tries as 0, "until right".
      ...(Number.isInteger(config.triesPerItem) ? { triesPerItem: config.triesPerItem } : {}),
      ...(Number.isInteger(config.sprintLength) ? { sprintLength: config.sprintLength } : {}),
      sameEquations: config.sameEquations === true,
      showMethod: config.showMethod === true,
      slopeHelper: config.slopeHelper === true,
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
  // A question-set game has no speed setting.
  speedInfluencePercent: questionSetGameOf(room) ? 0 : integerOr(room.speedInfluencePercent, 20),
  playerDisplayMode: text(room.playerDisplayMode) || 'codeName',
});

/** One line saying what "Play again" will run. */
export const replaySummary = (room = {}) => {
  const rounds = integerOr(room.requestedRoundCount, integerOr(room.roundCount, 0));
  const game = questionSetGameOf(room);
  const LINE_FORMAT_WORDS = { classic: 'Graph the Line (Classic)', sprint: 'Graph the Line Sprint', rush: 'Graph the Line Rush' };
  let label = room.challengeMode === 'solverRace' ? 'Solver Race' : 'Standard Challenge';
  if (game === QUESTION_SET_GAME.GRAPH_FEATURE_RUSH) label = 'Graph Feature Rush';
  else if (game === QUESTION_SET_GAME.LINE_GRAPH) label = LINE_FORMAT_WORDS[lineGraphFormatOfMode(room.challengeMode)] || 'Graph the Line';
  const parts = [
    label,
    rounds ? `${rounds} round${rounds === 1 ? '' : 's'}` : null,
    room.timingMode === 'pace' ? 'Pace Race' : (integerOr(room.roundSeconds, 0) ? `${room.roundSeconds}s each` : null),
    room.scoringStrategyId === 'grandPrix' ? 'Grand Prix' : room.scoringStrategyId === 'correctCount' ? 'Correct Count' : null,
  ];
  return parts.filter(Boolean).join(' · ');
};
