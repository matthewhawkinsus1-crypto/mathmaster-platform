/*
 * THE SCORING CHOICE FOR THE CLASSIC GAMES (LC16).
 *
 * Graph Feature Rush and Graph the Line have always asked a teacher how a game
 * is scored. The two classic games, Standard Challenge and Solver Race, asked
 * only how much speed matters, although the server and every results screen
 * already ran them under any strategy their mode allows (Standard: Accuracy
 * First, Grand Prix, Correct Count; Solver Race: Accuracy First and Grand
 * Prix; liveChallengeModes.mjs). This is the control and the words around it.
 * Nothing here changes how a game is scored.
 *
 * WHICH CHOICES ARE OFFERED come from the mode registry, so a mode that gains
 * or loses a strategy is followed, and a choice the mode refuses is never
 * sent. WHAT A TEACHER IS TOLD is built from the code that pays (the placement
 * table is the engine's own), not typed beside it.
 *
 * SPEED INFLUENCE is Accuracy First's: Grand Prix ranks a round by how right
 * each answer was and then by speed, and Correct Count pays no speed, so the
 * control is shown for Accuracy First only. The room still stores a value, so
 * the other two send the platform's own default (never a number left behind by
 * a control the teacher can no longer see).
 *
 * SECOND CHANCE is Accuracy First's too. It replays the questions the class
 * missed and pays the students who missed them recovery points, which only
 * Accuracy First has. Grand Prix and Correct Count would treat a replay as one
 * more ordinary round, for everyone, and no test has ever played them that way,
 * so the console turns it off for them rather than offer what nothing has
 * certified. (The server accepts the combination: it is only not offered.)
 *
 * Pure: tested in node.
 */

import { getChallengeMode, resolveModeScoringStrategy } from '../../../functions/shared/liveChallengeModes.mjs';
import { DEFAULT_SPEED_INFLUENCE_PERCENT, normalizeSpeedInfluencePercent } from '../../../functions/shared/liveChallengeExperience.mjs';
import { DEFAULT_PLACEMENT_POINTS } from '../../../functions/shared/liveChallengeRanking.mjs';
import { DEFAULT_SCORING_STRATEGY_ID, SCORING_STRATEGY_ID } from '../../../functions/shared/liveChallengeScoring.mjs';

const ordinalWord = (place) => ({ 1: '1st', 2: '2nd', 3: '3rd' })[place] || `${place}th`;

/** "1st 15, 2nd 12, 3rd 10, then down to 1", from the placement table the engine pays. */
export const classicPlacementLadder = (table = DEFAULT_PLACEMENT_POINTS) => {
  const points = Array.isArray(table) && table.length ? table : DEFAULT_PLACEMENT_POINTS;
  const top = points.slice(0, 3).map((value, index) => `${ordinalWord(index + 1)} ${value}`).join(', ');
  return points.length > 3 ? `${top}, then down to ${points[points.length - 1]}` : top;
};

const WORDS = Object.freeze({
  [SCORING_STRATEGY_ID.ACCURACY_FIRST]: Object.freeze({
    label: 'Accuracy First',
    description: 'A correct answer earns up to 1,000 points, with a little extra for speed, streaks and comebacks. Points add up over the rounds.',
  }),
  [SCORING_STRATEGY_ID.GRAND_PRIX]: Object.freeze({
    label: 'Grand Prix',
    description: `Each round is its own race. Students are placed by how right they were, then how fast, and placement earns championship points (${classicPlacementLadder()}). No credit, no points.`,
  }),
  [SCORING_STRATEGY_ID.CORRECT_COUNT]: Object.freeze({
    label: 'Correct Count',
    description: 'One point for every fully correct answer, and none for speed. Simple and cumulative; accuracy breaks ties.',
  }),
});

/** The mode's id, or the standard game for anything else (what the server does). */
const modeOf = (modeId) => getChallengeMode(modeId);

/**
 * The choices for a game, in the registry's order: `[{ id, label, description }]`.
 * Empty for a game with no strategy to choose.
 */
export const classicScoringOptions = (modeId) => modeOf(modeId).scoringStrategies
  .filter((id) => WORDS[id])
  .map((id) => Object.freeze({ id, ...WORDS[id] }));

/** The strategy a game will use for a requested one: the mode's own default if it does not allow it. */
export const resolveClassicScoring = (modeId, requested) => resolveModeScoringStrategy(modeOf(modeId), requested);

/**
 * What createLiveChallenge is sent. Accuracy First, the server's default, is
 * not sent at all, so a teacher who does not use the choice sends exactly the
 * request they always did.
 */
export const classicScoringRequest = (modeId, requested) => {
  const strategyId = resolveClassicScoring(modeId, requested);
  return strategyId === DEFAULT_SCORING_STRATEGY_ID ? {} : { scoringStrategyId: strategyId };
};

/** Whether the speed influence control means anything for this strategy. */
export const classicShowsSpeedInfluence = (strategyId) => strategyId === SCORING_STRATEGY_ID.ACCURACY_FIRST;

/** The speed influence a room is configured with: the teacher's under Accuracy First, the default otherwise. */
export const classicSpeedInfluence = ({ strategyId, speedInfluencePercent }) => (
  classicShowsSpeedInfluence(strategyId) ? normalizeSpeedInfluencePercent(speedInfluencePercent) : DEFAULT_SPEED_INFLUENCE_PERCENT
);

/** Whether Second Chance may be switched on under this strategy: Accuracy First only. */
export const classicAllowsSecondChance = (strategyId) => strategyId === SCORING_STRATEGY_ID.ACCURACY_FIRST;

/** The Second Chance setting a room is created with: the teacher's under Accuracy First, off otherwise. */
export const classicSecondChanceFor = ({ strategyId, secondChanceMode }) => (
  classicAllowsSecondChance(strategyId) && secondChanceMode === 'automatic' ? 'automatic' : 'off'
);

/** Said beside the Second Chance control when the strategy does not allow it. */
export const CLASSIC_SECOND_CHANCE_NOTE = 'Second Chance gives back points a student missed, which only Accuracy First scores. It is off for Grand Prix and Correct Count.';

/**
 * The lines under the choice for a strategy other than Accuracy First (that
 * one has its own points preview): what a round pays, in a teacher's words.
 */
export const classicScoringHelp = ({ strategyId } = {}) => {
  const lines = [];
  if (strategyId === SCORING_STRATEGY_ID.GRAND_PRIX) {
    lines.push(`Each round ranks the class by how right each answer was, then by how fast. Placement earns championship points: ${classicPlacementLadder()}.`);
    lines.push('A student with no credit in a round earns nothing for it, and students who tie share a place. The scoreboard counts championship points, so one round cannot decide the game.');
  } else if (strategyId === SCORING_STRATEGY_ID.CORRECT_COUNT) {
    lines.push('One point for every fully correct answer. A partly right answer earns nothing, and there is no bonus for speed.');
    lines.push('Students with the same total are separated by accuracy: the one who answered fewer questions to get there ranks higher.');
  } else {
    return [];
  }
  return lines;
};
