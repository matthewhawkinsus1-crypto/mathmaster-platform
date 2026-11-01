/*
 * INEQUALITY GRAPHING RUSH SETUP, AS DATA.
 *
 * What the teacher's setup holds, how a preset fills it in, and what
 * createLiveChallenge receives — Graph Feature Rush's setup model
 * (rushSetupModel.js) for this game. Scoring is the rush's: Grand Prix or
 * Correct Count, with the same descriptions. Pure: tested in node.
 */

import { defaultInequalityPresetFor, getInequalityPreset, inequalityConfigProblem } from '../../../functions/shared/inequalityRush.mjs';
import { INEQUALITY_RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';

/** A full setup from a preset. */
export const inequalitySetupFromPreset = (preset) => ({
  presetId: preset.id,
  itemTypes: [...preset.itemTypes],
  difficulty: preset.difficulty,
  roundCount: preset.roundCount,
  roundSeconds: preset.roundSeconds,
  scoringStrategyId: preset.scoringStrategyId,
});

/** The setup a class of this course starts from. */
export const defaultInequalitySetup = (courseId) => inequalitySetupFromPreset(defaultInequalityPresetFor(courseId));

const sameMembers = (left = [], right = []) => [...left].sort().join() === [...right].sort().join();

/**
 * A change to the setup. The preset stays named only while the question
 * settings still match it — the server's rule — so a preset is never shown
 * over settings it no longer describes.
 */
export const changeInequalitySetup = (setup, patch) => {
  const next = { ...setup, ...patch };
  const preset = getInequalityPreset(setup.presetId);
  const matches = preset && preset.difficulty === next.difficulty && sameMembers(preset.itemTypes, next.itemTypes);
  return { ...next, presetId: matches ? preset.id : 'custom' };
};

/** The problem with a setup, in a teacher's words, or null. */
export const inequalitySetupProblem = (setup) => inequalityConfigProblem({ itemTypes: setup.itemTypes, difficulty: setup.difficulty });

/**
 * What createLiveChallenge receives. `rewardPolicy` is the teacher's Rewards
 * choice as a policy (buildChallengeRewardPolicy); null means the default.
 */
export const inequalityCreateRequest = (setup, { rewardPolicy = null } = {}) => ({
  challengeMode: INEQUALITY_RUSH_MODE_ID,
  inequalityRush: {
    presetId: setup.presetId,
    itemTypes: [...setup.itemTypes],
    difficulty: setup.difficulty,
  },
  roundCount: setup.roundCount,
  roundSeconds: setup.roundSeconds,
  scoringStrategyId: setup.scoringStrategyId,
  ...(rewardPolicy ? { rewardPolicy } : {}),
});
