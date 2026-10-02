/*
 * "WHY DID (OR DIDN'T) THIS STUDENT GET A REWARD?" — FOR A TEACHER.
 *
 * Pure. Given one finished match result, its award job (if any) and a
 * student, explain every rule in the match's reward policy in plain words:
 * whether the student met it, what they actually did, and — when they met
 * it — whether the reward reached them. It re-evaluates the SAME criteria the
 * delivery pipeline used (liveChallengeRewardRules.mjs criterionMet), from the
 * same durable standings, so the explanation cannot disagree with what was
 * awarded.
 *
 * Game score and placement are reported separately from rewards: a teacher
 * should be able to see "finished 2nd" and "earned a Practice Pass" as two
 * different facts, because they are.
 */

import {
  REWARD_CRITERION,
  REWARD_KIND,
  criterionMet,
  participationFacts,
  rewardContextFor,
  storedRewardPolicy,
} from './liveChallengeRewardRules.mjs';
import { getRewardDefinition } from './rewardGrants.mjs';

const ordinal = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${n}${suffix}`;
};

export const placementLabel = (rank) => (ordinal(rank) ? `${ordinal(rank)} place` : 'No placement');

/** What a rule pays, in teacher words. */
export const describeRuleReward = (reward = {}) => {
  if (reward.kind === REWARD_KIND.CLASS_POINTS) return `+${Number(reward.amount) || 0} Class Points`;
  const definition = getRewardDefinition(reward.rewardCode);
  return reward.label || definition?.label || 'Reward';
};

/** What a rule asks for, in teacher words. */
export const describeCriterion = (criterion = {}) => {
  switch (criterion.kind) {
    case REWARD_CRITERION.PARTICIPATION:
      return `Answer at least ${Math.round((criterion.minRatio ?? 0.8) * 100)}% of the rounds after joining`;
    case REWARD_CRITERION.ACCURACY:
      return `Answer at least ${criterion.minAnswered ?? 3} rounds with ${Math.round((criterion.minRatio ?? 0.8) * 100)}% correct`;
    case REWARD_CRITERION.COMEBACK:
      return 'Miss a round, then get its second-chance question right';
    case REWARD_CRITERION.PLACEMENT:
      return criterion.maxRank === 1
        ? '1st place (ties share it)'
        : `Top ${criterion.maxRank} finish (ties share a place)`;
    default:
      return 'Rule';
  }
};

const integerRounds = (values) => (Array.isArray(values) ? values : []).filter((value) => Number.isInteger(value));

/** What the student actually did, measured the way the criterion measures it. */
export const describeStudentAgainst = (criterion = {}, standing = null, context = {}) => {
  if (!standing || standing.joined !== true) return 'Did not join this match';
  const scheduled = Number(context.scheduledRoundCount) || 0;
  switch (criterion.kind) {
    case REWARD_CRITERION.PARTICIPATION: {
      // The rule's own measure (rounds actually played after joining).
      const { available, answered } = participationFacts(standing, context);
      return `Answered ${answered} of ${available} round${available === 1 ? '' : 's'}`;
    }
    case REWARD_CRITERION.ACCURACY: {
      const first = new Map();
      (Array.isArray(standing.roundOutcomes) ? standing.roundOutcomes : []).forEach((outcome) => {
        if (!Number.isInteger(outcome?.roundIndex) || outcome.secondChance === true) return;
        if (outcome.roundIndex < 0 || outcome.roundIndex >= scheduled) return;
        if (!first.has(outcome.roundIndex)) first.set(outcome.roundIndex, outcome);
      });
      const correct = [...first.values()].filter((outcome) => outcome.isCorrect === true).length;
      return `${correct} of ${first.size} answered correctly`;
    }
    case REWARD_CRITERION.COMEBACK:
      return integerRounds(standing.missedRounds).length ? 'Missed a round; its second chance was not answered correctly' : 'Did not miss a round';
    case REWARD_CRITERION.PLACEMENT:
      return `Finished ${placementLabel(standing.rank).replace(' place', '')}${Number(standing.roundsAnswered) ? '' : ' with no rounds answered'}`;
    default:
      return '';
  }
};

const SKIP_REASONS = Object.freeze({
  grade_not_found: 'the student record was missing',
  grade_class_mismatch: 'the student had moved to a different class',
  teacher_mismatch_or_missing: "the class roster's teacher did not match the class",
  class_not_found: 'the class was not found',
  class_archived: 'the class was archived',
  missing_teacher_of_record: 'the class had no teacher of record',
  missing_class_id: 'the match was not linked to a class',
  missing_ids: 'the match was not linked to a class',
});

export const skipReasonLabel = (reason) => SKIP_REASONS[String(reason || '')] || 'it could not be delivered';

/** Where one award stands, from its job record. */
export const describeDelivery = (award = null) => {
  if (!award) return { state: 'notRecorded', label: 'No delivery record' };
  if (award.processed !== true) {
    return { state: 'pending', label: Number(award.attempts) > 0 ? 'Still being delivered (retrying automatically)' : 'Being delivered' };
  }
  switch (award.outcome) {
    case 'awarded':
    case 'alreadyAwarded':
      return { state: 'delivered', label: 'Delivered' };
    case 'skipped':
      return { state: 'skipped', label: `Not delivered: ${skipReasonLabel(award.skipReason)}` };
    case 'failed':
      return { state: 'failed', label: 'Delivery failed after several tries. Contact support with this match.' };
    default:
      // The earliest delivery code marked awards processed without an outcome.
      return { state: 'delivered', label: 'Delivered' };
  }
};

/**
 * One student's reward story for one match.
 *
 * `matchResult` is the stored liveChallengeMatchResults document; `job` the
 * liveChallengeAchievementJobs document or null.
 */
export const explainStudentChallengeRewards = ({ matchResult = {}, job = null, studentId } = {}) => {
  const standing = (matchResult.standings || []).find((entry) => entry?.studentId === studentId) || null;
  const policy = storedRewardPolicy(matchResult.rewardPolicy);
  // The same context the delivery evaluated, so "met" here is what was paid.
  const context = rewardContextFor({ ...matchResult, scheduledRoundCount: Number(matchResult.scheduledRoundCount) || 0 });
  const awards = (Array.isArray(job?.awards) ? job.awards : []).filter((award) => award?.studentId === studentId);

  const rules = policy.rules.map((rule) => {
    const met = criterionMet(rule.criterion, standing, context);
    const award = awards.find((entry) => (entry.ruleId || entry.achievementCode) === rule.ruleId) || null;
    return {
      ruleId: rule.ruleId,
      label: rule.label,
      requirement: describeCriterion(rule.criterion),
      reward: describeRuleReward(rule.reward),
      rewardKind: rule.reward.kind,
      met,
      measured: describeStudentAgainst(rule.criterion, standing, context),
      delivery: met ? describeDelivery(award) : null,
    };
  });

  let matchNote = null;
  if (matchResult.status !== 'finished') matchNote = 'This match was cancelled, so it gave no rewards.';
  else if (matchResult.rewardsSkipReason) matchNote = `No rewards were given for this match: ${skipReasonLabel(matchResult.rewardsSkipReason)}.`;
  else if (matchResult.effects?.rewards === 'failed') matchNote = 'Reward delivery hit an error and is retried automatically every 15 minutes.';
  else if (matchResult.effects?.rewards === 'pending') matchNote = 'Rewards for this match are still being delivered.';

  return {
    roomId: matchResult.roomId || null,
    title: matchResult.title || 'Live Challenge',
    finishedAtMs: matchResult.finalizedAtMs ?? null,
    joined: standing?.joined === true,
    placement: standing?.joined === true ? placementLabel(standing.rank) : 'Did not join',
    rank: standing?.joined === true ? (standing.rank ?? null) : null,
    playedCount: Number(matchResult.playedCount) || 0,
    score: standing?.joined === true ? Number(standing.score) || 0 : null,
    usesDefaultPolicy: !matchResult.rewardPolicy,
    matchNote,
    rules,
    earnedCount: rules.filter((rule) => rule.met).length,
  };
};
