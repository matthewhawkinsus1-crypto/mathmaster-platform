import {
  DEFAULT_LIVE_CHALLENGE_REWARD_RULES,
  REWARD_CRITERION,
  REWARD_KIND,
  normalizeRewardPolicy,
} from '../../../functions/shared/liveChallengeRewardRules.mjs';

/*
 * THE TEACHER'S LIVE CHALLENGE REWARD CHOICE, AS A REWARD POLICY.
 *
 * The Challenge foundation already accepts a per-room `rewardPolicy` at
 * create and validates it (liveChallengeRewardRules.mjs normalizeRewardPolicy);
 * nothing let a teacher choose one, so every match used the default Class
 * Points achievements and no Challenge ever gave a Practice Pass. This turns
 * three plain choices into that policy:
 *
 *   Practice Pass for   nobody | 1st place | top 2 | top 3   (ties share a place)
 *   Pass expires after  7 | 14 | 30 days | never
 *   Champion badge      for 1st place, or not
 *   Recognition awards  on (default) or off — most improved, steadiest, best
 *                       comeback, first to answer, team effort: named on the
 *                       final podium and rewarded by the server
 *                       (liveChallengeRecognitions.mjs). Off sends
 *                       `recognitions: false` in the policy.
 *
 * The default achievements (Finisher, Strong Accuracy, Comeback) are always
 * kept under their original rule ids, so choosing a pass never takes Class
 * Points away. Choosing nothing (no pass, no badge, recognitions left on)
 * sends no policy at all: the server's default is exactly that.
 *
 * Placement comes from the match's final ranking; nothing here touches how a
 * match is scored or ranked.
 */

export const PASS_PLACE_OPTIONS = Object.freeze([
  { value: 0, label: 'Nobody (Class Points only)' },
  { value: 1, label: '1st place' },
  { value: 2, label: 'Top 2' },
  { value: 3, label: 'Top 3' },
]);

export const PASS_EXPIRY_OPTIONS = Object.freeze([
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 0, label: 'Never' },
]);

export const DEFAULT_CHALLENGE_REWARD_CHOICE = Object.freeze({ passPlaces: 0, passExpiryDays: 14, championBadge: false, recognitions: true });

export const RECOGNITIONS_LABEL = 'Recognition awards (most improved, steadiest, best comeback, first to answer, team effort)';

// Stable within a room: the award identity hashes room + student + rule id.
export const PASS_RULE_ID = 'placementPracticePass';
export const CHAMPION_RULE_ID = 'championBadge';
export const CHAMPION_BADGE_LABEL = 'Live Challenge Champion';

const clampChoice = (choice = {}) => ({
  passPlaces: [0, 1, 2, 3].includes(Number(choice.passPlaces)) ? Number(choice.passPlaces) : 0,
  passExpiryDays: [0, 7, 14, 30].includes(Number(choice.passExpiryDays)) ? Number(choice.passExpiryDays) : 14,
  championBadge: choice.championBadge === true,
  // On unless explicitly turned off: a choice saved before this setting
  // existed keeps the server's default (on).
  recognitions: choice.recognitions !== false,
});

export const normalizeChallengeRewardChoice = clampChoice;

const placeLabel = (places) => (places === 1 ? '1st place' : `Top ${places}`);

/** The policy to send with createLiveChallenge, or null for the server default. */
export const buildChallengeRewardPolicy = (rawChoice = DEFAULT_CHALLENGE_REWARD_CHOICE) => {
  const choice = clampChoice(rawChoice);
  if (!choice.passPlaces && !choice.championBadge && choice.recognitions) return null;
  const rules = DEFAULT_LIVE_CHALLENGE_REWARD_RULES.map((rule) => ({
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    label: rule.label,
    criterion: { ...rule.criterion },
    reward: { ...rule.reward },
  }));
  if (choice.passPlaces) {
    rules.push({
      ruleId: PASS_RULE_ID,
      ruleVersion: 1,
      label: `Live Challenge — ${placeLabel(choice.passPlaces)}`,
      criterion: { kind: REWARD_CRITERION.PLACEMENT, maxRank: choice.passPlaces, minRoundsAnswered: 1 },
      reward: { kind: REWARD_KIND.GRANT, rewardCode: 'practicePass', ...(choice.passExpiryDays ? { expiresInDays: choice.passExpiryDays } : {}) },
    });
  }
  if (choice.championBadge) {
    rules.push({
      ruleId: CHAMPION_RULE_ID,
      ruleVersion: 1,
      label: 'Live Challenge — Champion',
      criterion: { kind: REWARD_CRITERION.PLACEMENT, maxRank: 1, minRoundsAnswered: 1 },
      reward: { kind: REWARD_KIND.GRANT, rewardCode: 'badge', badgeCode: 'champion', label: CHAMPION_BADGE_LABEL },
    });
  }
  // Only an explicit off is sent; absent means on (recognitionsEnabled).
  const policy = choice.recognitions ? { rules } : { rules, recognitions: false };
  // The same validation the server runs, so a bad choice fails here first.
  normalizeRewardPolicy(policy);
  return policy;
};

/** What the teacher's choice will do, in sentences for the create panel. */
export const describeChallengeRewardChoice = (rawChoice = DEFAULT_CHALLENGE_REWARD_CHOICE) => {
  const choice = clampChoice(rawChoice);
  const lines = ['Everyone who plays can earn Class Points: Finisher +2, Strong Accuracy +3, Comeback +2.'];
  if (choice.passPlaces) {
    lines.push(`${placeLabel(choice.passPlaces)} earn${choice.passPlaces === 1 ? 's' : ''} a Practice Pass${choice.passExpiryDays ? ` (expires after ${choice.passExpiryDays} days)` : ''}. Ties share a place, so tied players all earn it.`);
  }
  if (choice.championBadge) lines.push(`1st place earns the “${CHAMPION_BADGE_LABEL}” badge.`);
  lines.push(choice.recognitions
    ? 'Recognition awards name the most improved, steadiest, best comeback and first to answer on the final podium (game names only), plus a team effort award when almost the whole class answers almost every round.'
    : 'Recognition awards are off: the final podium shows places only.');
  lines.push('Rewards are given once, after the match ends. Game points decide placement; they are not a grade.');
  return lines;
};
