/*
 * SYSTEMS OF EQUATIONS RUSH SETUP, AS DATA.
 *
 * What the teacher's setup holds, how a preset (a level) fills it in, and
 * what createLiveChallenge receives — Inequality Graphing Rush's setup model
 * (inequalitySetupModel.js) for this game. Scoring is the rush's: Grand Prix
 * or Correct Count, with the same descriptions. Pure: tested in node.
 */

import { defaultSystemsPresetFor, getSystemsPreset, systemsConfigProblem } from '../../../functions/shared/systemsRush.mjs';
import { SYSTEMS_RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';

/** A full setup from a preset. */
export const systemsSetupFromPreset = (preset) => ({
  presetId: preset.id,
  questions: [...preset.questions],
  kinds: [...preset.kinds],
  difficulty: preset.difficulty,
  roundCount: preset.roundCount,
  roundSeconds: preset.roundSeconds,
  scoringStrategyId: preset.scoringStrategyId,
});

/** The setup a class of this course starts from. */
export const defaultSystemsSetup = (courseId) => systemsSetupFromPreset(defaultSystemsPresetFor(courseId));

const sameMembers = (left = [], right = []) => [...left].sort().join() === [...right].sort().join();

/**
 * A change to the setup. The preset stays named only while the question
 * settings still match it — the server's rule — so a preset is never shown
 * over settings it no longer describes.
 */
export const changeSystemsSetup = (setup, patch) => {
  const next = { ...setup, ...patch };
  const preset = getSystemsPreset(setup.presetId);
  const matches = preset
    && preset.difficulty === next.difficulty
    && sameMembers(preset.questions, next.questions)
    && sameMembers(preset.kinds, next.kinds);
  return { ...next, presetId: matches ? preset.id : 'custom' };
};

/** The problem with a setup, in a teacher's words, or null. */
export const systemsSetupProblem = (setup) => systemsConfigProblem({ questions: setup.questions, kinds: setup.kinds, difficulty: setup.difficulty });

/**
 * What createLiveChallenge receives. `rewardPolicy` is the teacher's Rewards
 * choice as a policy (buildChallengeRewardPolicy); null means the default.
 */
export const systemsCreateRequest = (setup, { rewardPolicy = null } = {}) => ({
  challengeMode: SYSTEMS_RUSH_MODE_ID,
  systemsRush: {
    presetId: setup.presetId,
    questions: [...setup.questions],
    kinds: [...setup.kinds],
    difficulty: setup.difficulty,
  },
  roundCount: setup.roundCount,
  roundSeconds: setup.roundSeconds,
  scoringStrategyId: setup.scoringStrategyId,
  ...(rewardPolicy ? { rewardPolicy } : {}),
});
