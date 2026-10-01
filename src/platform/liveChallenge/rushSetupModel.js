/*
 * GRAPH FEATURE RUSH SETUP, AS DATA.
 *
 * What the teacher's setup holds, how a preset fills it in, and what
 * createLiveChallenge receives. Light on purpose — presets and limits only
 * (graphFeatureRushConfig.mjs) — so the teacher console carries it for every
 * game type, while the setup panel itself loads only when a rush is chosen.
 * Rewards are not here: a rush uses the same Rewards choice as every Live
 * Challenge (ChallengeRewardSettings, challengeRewardPolicy.js). Pure: tested
 * in node.
 */

import { DEFAULT_FIELD_PLACEMENT, fieldPlacementPoints } from '../../../functions/shared/liveChallengeRanking.mjs';
import { defaultRushPresetFor, getRushPreset } from '../../../functions/shared/graphFeatureRushConfig.mjs';
import { RUSH_MODE_ID } from '../../../functions/shared/graphFeatureRushRules.mjs';

export const RUSH_SCORING_OPTIONS = Object.freeze([
  Object.freeze({ id: 'grandPrix', label: 'Grand Prix', description: 'Each round ranks the class; placement earns championship points (1st 12, last 3), so every round is a fresh race and comebacks are real.' }),
  Object.freeze({ id: 'correctCount', label: 'Correct Count', description: 'One point for every graph completed. Simple and cumulative; accuracy breaks ties.' }),
]);

/** A full setup from a preset. */
export const rushSetupFromPreset = (preset) => ({
  presetId: preset.id,
  families: [...preset.families],
  features: [...preset.features],
  difficulty: preset.difficulty,
  roundCount: preset.roundCount,
  roundSeconds: preset.roundSeconds,
  scoringStrategyId: preset.scoringStrategyId,
});

/** The setup a class of this course starts from. */
export const defaultRushSetup = (courseId) => rushSetupFromPreset(defaultRushPresetFor(courseId));

const sameMembers = (left = [], right = []) => [...left].sort().join() === [...right].sort().join();

/**
 * A change to the setup. The preset stays named only while the question
 * settings still match it — exactly the server's rule — so "Quick Algebra I"
 * is never shown over settings it no longer describes.
 */
export const changeRushSetup = (setup, patch) => {
  const next = { ...setup, ...patch };
  const preset = getRushPreset(setup.presetId);
  const matches = preset
    && preset.difficulty === next.difficulty
    && sameMembers(preset.families, next.families)
    && sameMembers(preset.features, next.features);
  return { ...next, presetId: matches ? preset.id : 'custom' };
};

/**
 * What createLiveChallenge receives. `rewardPolicy` is the teacher's Rewards
 * choice as a policy (buildChallengeRewardPolicy); null means the default.
 */
export const rushCreateRequest = (setup, { rewardPolicy = null } = {}) => ({
  challengeMode: RUSH_MODE_ID,
  graphFeatureRush: {
    presetId: setup.presetId,
    families: [...setup.families],
    features: [...setup.features],
    difficulty: setup.difficulty,
  },
  roundCount: setup.roundCount,
  roundSeconds: setup.roundSeconds,
  scoringStrategyId: setup.scoringStrategyId,
  ...(rewardPolicy ? { rewardPolicy } : {}),
});

/** Grand Prix placement points for a field of `players`, as a teacher reads them. */
export const grandPrixLadder = (players) => {
  const size = Math.max(2, Math.round(Number(players) || 0));
  const places = size <= 6
    ? Array.from({ length: size }, (_, index) => index + 1)
    : [1, 2, 3, Math.ceil(size / 2), size];
  return places.map((place) => ({ place, points: fieldPlacementPoints(place, size, DEFAULT_FIELD_PLACEMENT) }));
};
