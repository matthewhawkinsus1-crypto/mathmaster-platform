/*
 * THE CLASS POINTS A GRAPH FEATURE RUSH AWARDS.
 *
 * A teacher's reward choice, as a policy for the platform's existing reward
 * rules (liveChallengeRewardRules.mjs) — validated again by the server when
 * the room is created. Nothing here changes how rewards are recorded or paid;
 * "podium" only adds a placement rule beside the standard achievements.
 *
 * Loaded when a rush lobby is created, not with the console.
 */

import {
  DEFAULT_LIVE_CHALLENGE_REWARD_RULES,
  REWARD_CRITERION,
  REWARD_KIND,
  normalizeRewardPolicy,
} from '../../../functions/shared/liveChallengeRewardRules.mjs';

export const RUSH_PODIUM_RULE = Object.freeze({
  ruleId: 'graphFeatureRushPodium',
  label: 'Graph Feature Rush — Podium',
  criterion: Object.freeze({ kind: REWARD_CRITERION.PLACEMENT, maxRank: 3, minRoundsAnswered: 1 }),
  reward: Object.freeze({ kind: REWARD_KIND.CLASS_POINTS, amount: 2 }),
});

/** The policy a choice sends; null means the platform's default rules. */
export const rushRewardPolicy = (choice) => {
  if (choice === 'off') return normalizeRewardPolicy({ rules: [] });
  if (choice === 'podium') return normalizeRewardPolicy({ rules: [...DEFAULT_LIVE_CHALLENGE_REWARD_RULES, RUSH_PODIUM_RULE] });
  return null;
};
