/*
 * LIVE CHALLENGE REWARD RULES.
 *
 * GAME PERFORMANCE -> PLACEMENT/RESULT -> REWARD RULE -> REWARD TRANSACTION
 *
 * A reward rule reads ONE final match-result standing (liveChallengeResults.mjs)
 * and decides whether that student earned something. It never reads live game
 * state, receipts or the scoreboard, and the game never reads rewards. That
 * separation is what lets a scoring strategy change without silently changing
 * who is rewarded, and lets a reward policy change without touching scoring.
 *
 * A rule is data:
 *
 *   { ruleId, ruleVersion, label,
 *     criterion: { kind, ...parameters },
 *     reward:    { kind: 'classPoints', amount }            // ledger credit
 *              | { kind: 'grant', rewardCode, badgeCode?, label?, expiresInDays? } }  // an item
 *
 * CRITERIA.
 *
 *   participation  answered at least `minRatio` of the scheduled rounds the
 *                  student was present for (and at least `minAvailableRounds`
 *                  were available). A late arrival is measured from arrival.
 *   accuracy       at least `minAnswered` scheduled rounds answered, and at
 *                  least `minRatio` of them correct. Replays never count.
 *   comeback       missed a scheduled round, then answered its second-chance
 *                  replay correctly.
 *   placement      final rank <= `maxRank` with at least `minRoundsAnswered`
 *                  rounds answered. Tied students share a rank, so a tie for
 *                  first rewards both — deterministically, never by name.
 *
 * DEFAULT POLICY. The three achievements the platform already awarded —
 * Finisher (+2), Strong Accuracy (+3), Comeback (+2) Class Points — expressed
 * as rules with their original ids. The ids matter: the ledger transaction id
 * is a hash of room + student + rule id, so an award staged by the previous
 * code and an award from this code are the SAME transaction.
 *
 * AWARD IDENTITY. `rewardAwardIdentity` is the plain text that names one award
 * — source, source id, student, rule. The server hashes it into the ledger or
 * grant document id; executing an award is "create that document if it does
 * not exist", so any number of retries, refreshes or recovery sweeps award
 * once.
 */

import { getRewardDefinition, isGrantableReward } from './rewardGrants.mjs';

export const REWARD_POLICY_SCHEMA_VERSION = 1;

export const REWARD_CRITERION = Object.freeze({
  PARTICIPATION: 'participation',
  ACCURACY: 'accuracy',
  COMEBACK: 'comeback',
  PLACEMENT: 'placement',
});

export const REWARD_KIND = Object.freeze({
  CLASS_POINTS: 'classPoints',
  GRANT: 'grant',
});

export const REWARD_SOURCE_TYPE = Object.freeze({
  LIVE_CHALLENGE: 'liveChallenge',
});

// The ids the achievements have always had. Changing one would change the
// ledger transaction id and could award an already-awarded achievement again.
export const LEGACY_ACHIEVEMENT_RULE_ID = Object.freeze({
  FINISHER: 'challengeFinisher',
  STRONG_ACCURACY: 'strongAccuracy',
  COMEBACK: 'comeback',
});

export const MAX_RULES_PER_POLICY = 8;
export const MAX_GRANT_RULES_PER_POLICY = 3;
export const MAX_CLASS_POINTS_PER_RULE = 10;
// A single match can never credit more than one ordinary manual award
// (classPoints.mjs MAX_AWARD_AMOUNT) to one student.
export const MAX_CLASS_POINTS_PER_MATCH = 20;
export const MAX_GRANT_EXPIRY_DAYS = 365;

export class RewardPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RewardPolicyError';
  }
}

const fail = (message) => { throw new RewardPolicyError(message); };

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

const ratioIn = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1) fail('A reward ratio must be greater than 0 and at most 1.');
  return numeric;
};

const intIn = (value, fallback, min, max, name) => {
  if (value === undefined || value === null) return fallback;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) fail(`${name} must be a whole number from ${min} to ${max}.`);
  return numeric;
};

const DEFAULT_LABELS = Object.freeze({
  [REWARD_CRITERION.PARTICIPATION]: 'Live Challenge — Finisher',
  [REWARD_CRITERION.ACCURACY]: 'Live Challenge — Strong Accuracy',
  [REWARD_CRITERION.COMEBACK]: 'Live Challenge — Comeback',
  [REWARD_CRITERION.PLACEMENT]: 'Live Challenge — Top finish',
});

const normalizeCriterion = (raw = {}) => {
  const kind = cleanText(raw?.kind, 40);
  switch (kind) {
    case REWARD_CRITERION.PARTICIPATION:
      return Object.freeze({
        kind,
        minRatio: ratioIn(raw.minRatio, 0.8),
        minAvailableRounds: intIn(raw.minAvailableRounds, 2, 1, 40, 'minAvailableRounds'),
      });
    case REWARD_CRITERION.ACCURACY:
      return Object.freeze({
        kind,
        minRatio: ratioIn(raw.minRatio, 0.8),
        minAnswered: intIn(raw.minAnswered, 3, 1, 40, 'minAnswered'),
      });
    case REWARD_CRITERION.COMEBACK:
      return Object.freeze({ kind });
    case REWARD_CRITERION.PLACEMENT:
      return Object.freeze({
        kind,
        maxRank: intIn(raw.maxRank, 1, 1, 10, 'maxRank'),
        minRoundsAnswered: intIn(raw.minRoundsAnswered, 1, 1, 40, 'minRoundsAnswered'),
      });
    default:
      return fail(`"${kind}" is not a recognized reward criterion.`);
  }
};

const normalizeReward = (raw = {}) => {
  const kind = cleanText(raw?.kind, 40);
  if (kind === REWARD_KIND.CLASS_POINTS) {
    return Object.freeze({
      kind,
      amount: intIn(raw.amount, null, 1, MAX_CLASS_POINTS_PER_RULE, 'A Class Points reward amount'),
    });
  }
  if (kind === REWARD_KIND.GRANT) {
    const rewardCode = cleanText(raw.rewardCode, 40);
    if (!isGrantableReward(rewardCode)) fail(`"${rewardCode}" is not a reward that can be granted.`);
    const definition = getRewardDefinition(rewardCode);
    const expiresInDays = raw.expiresInDays == null
      ? null
      : intIn(raw.expiresInDays, null, 1, MAX_GRANT_EXPIRY_DAYS, 'expiresInDays');
    return Object.freeze({
      kind,
      rewardCode,
      badgeCode: definition.category === 'badge' ? (cleanText(raw.badgeCode, 60) || 'liveChallenge') : null,
      label: cleanText(raw.label, 80) || definition.label,
      expiresInDays,
    });
  }
  return fail(`"${kind}" is not a recognized reward kind.`);
};

const RULE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,59}$/;

const normalizeRule = (raw = {}) => {
  const ruleId = cleanText(raw?.ruleId, 60);
  if (!RULE_ID_PATTERN.test(ruleId)) fail(`"${ruleId}" is not a valid reward rule id.`);
  const criterion = normalizeCriterion(raw.criterion);
  const reward = normalizeReward(raw.reward);
  if (reward.amount === null) fail(`Reward rule "${ruleId}" needs an amount.`);
  return Object.freeze({
    ruleId,
    ruleVersion: intIn(raw.ruleVersion, 1, 1, 1000, 'ruleVersion'),
    label: cleanText(raw.label, 80) || DEFAULT_LABELS[criterion.kind],
    criterion,
    reward,
  });
};

export const DEFAULT_LIVE_CHALLENGE_REWARD_RULES = Object.freeze([
  normalizeRule({
    ruleId: LEGACY_ACHIEVEMENT_RULE_ID.FINISHER,
    label: 'Live Challenge — Finisher',
    criterion: { kind: REWARD_CRITERION.PARTICIPATION, minRatio: 0.8, minAvailableRounds: 2 },
    reward: { kind: REWARD_KIND.CLASS_POINTS, amount: 2 },
  }),
  normalizeRule({
    ruleId: LEGACY_ACHIEVEMENT_RULE_ID.STRONG_ACCURACY,
    label: 'Live Challenge — Strong Accuracy',
    criterion: { kind: REWARD_CRITERION.ACCURACY, minRatio: 0.8, minAnswered: 3 },
    reward: { kind: REWARD_KIND.CLASS_POINTS, amount: 3 },
  }),
  normalizeRule({
    ruleId: LEGACY_ACHIEVEMENT_RULE_ID.COMEBACK,
    label: 'Live Challenge — Comeback',
    criterion: { kind: REWARD_CRITERION.COMEBACK },
    reward: { kind: REWARD_KIND.CLASS_POINTS, amount: 2 },
  }),
]);

export const DEFAULT_LIVE_CHALLENGE_REWARD_POLICY = Object.freeze({
  schemaVersion: REWARD_POLICY_SCHEMA_VERSION,
  rules: DEFAULT_LIVE_CHALLENGE_REWARD_RULES,
});

/**
 * Validate a policy a teacher configured. Absent means the default policy.
 * Anything malformed throws RewardPolicyError rather than being quietly
 * dropped, so a misconfigured reward surfaces when the challenge is created,
 * not when a class finds out nobody was rewarded.
 */
export const normalizeRewardPolicy = (raw) => {
  if (raw === undefined || raw === null) return DEFAULT_LIVE_CHALLENGE_REWARD_POLICY;
  if (typeof raw !== 'object' || !Array.isArray(raw.rules)) fail('A reward policy needs a list of rules.');
  if (raw.rules.length > MAX_RULES_PER_POLICY) fail(`A reward policy can have at most ${MAX_RULES_PER_POLICY} rules.`);
  const rules = raw.rules.map(normalizeRule);
  const ids = new Set();
  rules.forEach((rule) => {
    if (ids.has(rule.ruleId)) fail(`Reward rule "${rule.ruleId}" appears twice.`);
    ids.add(rule.ruleId);
  });
  const grantRules = rules.filter((rule) => rule.reward.kind === REWARD_KIND.GRANT).length;
  if (grantRules > MAX_GRANT_RULES_PER_POLICY) fail(`A reward policy can issue at most ${MAX_GRANT_RULES_PER_POLICY} item rewards.`);
  const pointsTotal = rules
    .filter((rule) => rule.reward.kind === REWARD_KIND.CLASS_POINTS)
    .reduce((sum, rule) => sum + rule.reward.amount, 0);
  if (pointsTotal > MAX_CLASS_POINTS_PER_MATCH) {
    fail(`A reward policy can credit at most ${MAX_CLASS_POINTS_PER_MATCH} Class Points to one student per match.`);
  }
  return Object.freeze({ schemaVersion: REWARD_POLICY_SCHEMA_VERSION, rules: Object.freeze(rules) });
};

/** A stored policy, tolerant of rooms created before policies were stored. */
export const storedRewardPolicy = (raw) => {
  try {
    return normalizeRewardPolicy(raw);
  } catch {
    // A stored policy was validated when it was written; one that no longer
    // validates is treated as absent rather than rewarding by a broken rule.
    return DEFAULT_LIVE_CHALLENGE_REWARD_POLICY;
  }
};

const integerRounds = (values) => new Set((Array.isArray(values) ? values : [])
  .filter((value) => typeof value === 'number' && Number.isInteger(value)));

/*
 * Criterion evaluation. `context` carries the match facts every criterion may
 * need: { scheduledRoundCount, secondChanceOf }.
 */
export const criterionMet = (criterion = {}, standing = {}, context = {}) => {
  if (!standing || standing.joined !== true) return false;
  const scheduled = typeof context.scheduledRoundCount === 'number' ? context.scheduledRoundCount : 0;

  switch (criterion.kind) {
    case REWARD_CRITERION.PARTICIPATION: {
      const joinedAt = typeof standing.joinedAtRound === 'number' ? Math.max(0, standing.joinedAtRound) : 0;
      const available = Math.max(0, scheduled - joinedAt);
      if (available < criterion.minAvailableRounds) return false;
      const answered = [...integerRounds(standing.answeredRounds)].filter((round) => round >= joinedAt && round < scheduled);
      return answered.length / available >= criterion.minRatio;
    }
    case REWARD_CRITERION.ACCURACY: {
      const firstByRound = new Map();
      (Array.isArray(standing.roundOutcomes) ? standing.roundOutcomes : []).forEach((outcome) => {
        const round = outcome?.roundIndex;
        if (typeof round !== 'number' || !Number.isInteger(round) || round < 0 || round >= scheduled) return;
        if (outcome.secondChance === true) return;
        if (!firstByRound.has(round)) firstByRound.set(round, outcome);
      });
      if (firstByRound.size < criterion.minAnswered) return false;
      const correct = [...firstByRound.values()].filter((outcome) => outcome.isCorrect === true).length;
      return correct / firstByRound.size >= criterion.minRatio;
    }
    case REWARD_CRITERION.COMEBACK: {
      const missed = integerRounds(standing.missedRounds);
      const outcomes = Array.isArray(standing.roundOutcomes) ? standing.roundOutcomes : [];
      return Object.entries(context.secondChanceOf || {}).some(([replayKey, originalValue]) => {
        const replay = Number(replayKey);
        const original = typeof originalValue === 'number' ? originalValue : Number(originalValue);
        if (!Number.isInteger(replay) || !Number.isInteger(original) || !missed.has(original)) return false;
        return outcomes.some((outcome) => outcome?.roundIndex === replay && outcome.isCorrect === true);
      });
    }
    case REWARD_CRITERION.PLACEMENT: {
      const rank = Number(standing.rank);
      return Number.isInteger(rank)
        && rank >= 1
        && rank <= criterion.maxRank
        && Number(standing.roundsAnswered) >= criterion.minRoundsAnswered;
    }
    default:
      return false;
  }
};

/** The plain-text identity of one award. Hashed server-side into a document id. */
export const rewardAwardIdentity = ({ sourceType = REWARD_SOURCE_TYPE.LIVE_CHALLENGE, sourceId, studentId, ruleId } = {}) => {
  const parts = [sourceType, sourceId, studentId, ruleId].map((part) => cleanText(part, 200));
  if (parts.some((part) => !part)) throw new TypeError('An award identity needs a source, a student and a rule.');
  return parts.join('\u0000');
};

/**
 * Every award a finished match earns under a policy. Deterministic: the same
 * result and policy always produce the same awards in the same order.
 */
export const evaluateRewardPolicy = ({ matchResult = {}, policy = DEFAULT_LIVE_CHALLENGE_REWARD_POLICY } = {}) => {
  const normalized = storedRewardPolicy(policy);
  const context = {
    scheduledRoundCount: typeof matchResult.scheduledRoundCount === 'number' ? matchResult.scheduledRoundCount : 0,
    secondChanceOf: matchResult.secondChanceOf || {},
  };
  const sourceId = String(matchResult.roomId || '');
  const awards = [];
  const standings = [...(Array.isArray(matchResult.standings) ? matchResult.standings : [])]
    .filter((standing) => standing?.studentId)
    .sort((a, b) => (a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0));

  standings.forEach((standing) => {
    normalized.rules.forEach((rule) => {
      if (!criterionMet(rule.criterion, standing, context)) return;
      awards.push(Object.freeze({
        identity: rewardAwardIdentity({ sourceId, studentId: standing.studentId, ruleId: rule.ruleId }),
        sourceType: REWARD_SOURCE_TYPE.LIVE_CHALLENGE,
        sourceId,
        studentId: standing.studentId,
        ruleId: rule.ruleId,
        ruleVersion: rule.ruleVersion,
        reasonLabel: rule.label,
        reward: rule.reward,
      }));
    });
  });
  return awards;
};
