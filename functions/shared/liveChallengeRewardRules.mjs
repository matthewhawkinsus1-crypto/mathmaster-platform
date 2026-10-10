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
 * RECOGNITIONS AND PERSONAL BESTS (evaluateMatchAwards). Beyond the policy's
 * rules, a finished match rewards what liveChallengeRecognitions.mjs names
 * (3 Class Points and a badge per individual recognition; 2 Class Points for
 * the class-wide Team Effort) and a private personal best (3 Class Points,
 * once per match). Their rule ids are reserved — a teacher's rule can never
 * share one, so their ledger and grant ids can never collide with a policy
 * award's. A policy may switch recognitions off (`recognitions: false`).
 * Whatever a match earns, one student never receives more than
 * MAX_CLASS_POINTS_PER_MATCH Class Points from it: policy awards come first,
 * then recognitions in their fixed order, then the personal best, and a Class
 * Points award that would cross the cap is dropped — the same one, every time.
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

// Rule ids the server's own awards use (evaluateMatchAwards). A policy rule
// named like one would hash to the same ledger transaction.
export const RECOGNITION_RULE_PREFIX = 'recognition.';
export const PERSONAL_BEST_RULE_ID = 'personalBest';
export const isReservedRuleId = (ruleId) => {
  const id = String(ruleId || '');
  return id === PERSONAL_BEST_RULE_ID || id.startsWith(RECOGNITION_RULE_PREFIX);
};

const normalizeRule = (raw = {}) => {
  const ruleId = cleanText(raw?.ruleId, 60);
  if (!RULE_ID_PATTERN.test(ruleId)) fail(`"${ruleId}" is not a valid reward rule id.`);
  if (isReservedRuleId(ruleId)) fail(`"${ruleId}" is reserved for recognitions and personal bests.`);
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
  // Recognitions beyond the podium are on unless a teacher turns them off.
  recognitions: true,
});

/** Whether a (stored) policy lets a match earn recognitions. Absent means on. */
export const recognitionsEnabled = (policy) => policy?.recognitions !== false;

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
  if (raw.recognitions !== undefined && typeof raw.recognitions !== 'boolean') fail('recognitions must be true or false.');
  return Object.freeze({
    schemaVersion: REWARD_POLICY_SCHEMA_VERSION,
    rules: Object.freeze(rules),
    recognitions: raw.recognitions !== false,
  });
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

/**
 * The scheduled rounds a match actually reached: all of them, unless the
 * teacher ended the game early. `playedRoundCount` (liveChallengeResults
 * playedRoundCountAt) counts rounds that started, replays included, so it is
 * capped at the schedule; a result written before it existed reads as the
 * whole schedule, which is what it was measured against then.
 */
export const scheduledRoundsReached = (context = {}) => {
  const scheduled = typeof context.scheduledRoundCount === 'number' ? Math.max(0, context.scheduledRoundCount) : 0;
  const played = context.playedRoundCount;
  return typeof played === 'number' && Number.isFinite(played) ? Math.max(0, Math.min(scheduled, played)) : scheduled;
};

/**
 * Participation as the Finisher rule measures it — and as the teacher's reward
 * diagnostics explain it, so the two can never disagree: the scheduled rounds
 * that were played after the student arrived, and how many of them they
 * answered. A game ended after round three of ten measures everyone against
 * three rounds, never against seven that did not happen.
 */
export const participationFacts = (standing = {}, context = {}) => {
  const reached = scheduledRoundsReached(context);
  const joinedAt = typeof standing?.joinedAtRound === 'number' ? Math.max(0, standing.joinedAtRound) : 0;
  const available = Math.max(0, reached - joinedAt);
  const answered = [...integerRounds(standing?.answeredRounds)].filter((round) => round >= joinedAt && round < reached).length;
  return Object.freeze({ available, answered });
};

/** The match facts every criterion may need, read from a match result. */
export const rewardContextFor = (matchResult = {}) => Object.freeze({
  scheduledRoundCount: typeof matchResult.scheduledRoundCount === 'number' ? matchResult.scheduledRoundCount : 0,
  playedRoundCount: typeof matchResult.playedRoundCount === 'number' ? matchResult.playedRoundCount : null,
  secondChanceOf: matchResult.secondChanceOf || {},
});

/*
 * Criterion evaluation. `context` carries the match facts every criterion may
 * need: { scheduledRoundCount, playedRoundCount, secondChanceOf }.
 */
export const criterionMet = (criterion = {}, standing = {}, context = {}) => {
  if (!standing || standing.joined !== true) return false;
  const scheduled = typeof context.scheduledRoundCount === 'number' ? context.scheduledRoundCount : 0;

  switch (criterion.kind) {
    case REWARD_CRITERION.PARTICIPATION: {
      const { available, answered } = participationFacts(standing, context);
      if (available < criterion.minAvailableRounds) return false;
      return answered / available >= criterion.minRatio;
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

/**
 * What a room's policy can earn, in public words: the PLACEMENT rewards (a
 * Practice Pass for the top three, a Champion badge) with the rule a final
 * standing must meet, and whether Class Points achievements are on. Stored on
 * the public room when it is created, so a lobby can say "Top 3: Practice
 * Pass" and a final screen can show it against the final standings. It names
 * rewards, never a student, and delivers nothing: rewards are still issued
 * once, by the server, from the durable match result.
 */
export const publicRewardSummary = (policy) => {
  const normalized = storedRewardPolicy(policy);
  const placement = normalized.rules
    .filter((rule) => rule.criterion.kind === REWARD_CRITERION.PLACEMENT)
    .map((rule) => Object.freeze({
      ruleId: rule.ruleId,
      maxRank: rule.criterion.maxRank,
      minRoundsAnswered: rule.criterion.minRoundsAnswered,
      rewardKind: rule.reward.kind,
      rewardCode: rule.reward.kind === REWARD_KIND.GRANT ? rule.reward.rewardCode : REWARD_KIND.CLASS_POINTS,
      label: rule.reward.kind === REWARD_KIND.GRANT ? rule.reward.label : `${rule.reward.amount} Class Points`,
    }));
  return Object.freeze({
    schemaVersion: REWARD_POLICY_SCHEMA_VERSION,
    placement: Object.freeze(placement),
    classPoints: normalized.rules.some((rule) => rule.criterion.kind !== REWARD_CRITERION.PLACEMENT
      && rule.reward.kind === REWARD_KIND.CLASS_POINTS),
    // Whether the end of the game names recognitions beyond the podium.
    recognitions: recognitionsEnabled(normalized),
  });
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
  const context = rewardContextFor(matchResult);
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

/*
 * RECOGNITION AND PERSONAL-BEST AWARDS. See the header. The match result's
 * `recognitions` (written in the finishing transaction, player keys only) is
 * also the marker that a match was finished by code that knows about them: a
 * result from before has no such field and earns exactly what it always did,
 * so a sweep re-staging an old match never hands out something new.
 */
export const RECOGNITION_POINTS = 3;
export const TEAM_RECOGNITION_POINTS = 2;
export const PERSONAL_BEST_POINTS = 3;
export const recognitionRuleId = (id) => `${RECOGNITION_RULE_PREFIX}${id}`;
export const recognitionBadgeRuleId = (id) => `${RECOGNITION_RULE_PREFIX}${id}.badge`;

const serverAward = ({ sourceId, studentId, ruleId, reasonLabel, reward }) => Object.freeze({
  identity: rewardAwardIdentity({ sourceId, studentId, ruleId }),
  sourceType: REWARD_SOURCE_TYPE.LIVE_CHALLENGE,
  sourceId,
  studentId,
  ruleId,
  ruleVersion: 1,
  reasonLabel,
  reward: Object.freeze(reward),
});

/** Recognition awards, from the result's recognitions and its standings. */
export const recognitionAwards = (matchResult = {}) => {
  if (!Array.isArray(matchResult.recognitions)) return [];
  const sourceId = String(matchResult.roomId || '');
  const studentByKey = new Map((Array.isArray(matchResult.standings) ? matchResult.standings : [])
    .filter((standing) => standing?.joined === true && standing.playerKey && standing.studentId)
    .map((standing) => [String(standing.playerKey), standing.studentId]));
  const awards = [];
  matchResult.recognitions.forEach((entry) => {
    const id = cleanText(entry?.id, 40);
    if (!id) return;
    const label = cleanText(entry.label, 60) || id;
    const classWide = entry.classWide === true;
    const studentIds = [...new Set((Array.isArray(entry.playerKeys) ? entry.playerKeys : [])
      .map((key) => studentByKey.get(String(key)))
      .filter(Boolean))].sort();
    studentIds.forEach((studentId) => {
      awards.push(serverAward({
        sourceId,
        studentId,
        ruleId: recognitionRuleId(id),
        reasonLabel: `Live Challenge — ${label}`,
        reward: { kind: REWARD_KIND.CLASS_POINTS, amount: classWide ? TEAM_RECOGNITION_POINTS : RECOGNITION_POINTS },
      }));
      if (classWide) return;
      awards.push(serverAward({
        sourceId,
        studentId,
        ruleId: recognitionBadgeRuleId(id),
        reasonLabel: `Live Challenge — ${label}`,
        reward: {
          kind: REWARD_KIND.GRANT,
          rewardCode: 'badge',
          badgeCode: `lc-${id}`,
          label,
          expiresInDays: null,
        },
      }));
    });
  });
  return awards;
};

/**
 * Keep every award but drop, per student, a Class Points award that would
 * take them past MAX_CLASS_POINTS_PER_MATCH. Order decides what is dropped,
 * and the order is fixed, so the same awards are dropped on every run.
 */
export const capMatchClassPoints = (awards = [], cap = MAX_CLASS_POINTS_PER_MATCH) => {
  const credited = new Map();
  return awards.filter((award) => {
    if (award?.reward?.kind !== REWARD_KIND.CLASS_POINTS) return true;
    const sum = (credited.get(award.studentId) || 0) + Number(award.reward.amount || 0);
    if (sum > cap) return false;
    credited.set(award.studentId, sum);
    return true;
  });
};

/**
 * Everything a finished match earns: the policy's awards, then recognitions
 * (unless the policy turned them off), then a personal best for each student
 * in `personalBestStudentIds` — capped per student. The personal bests are
 * decided by the caller (they need the student's earlier results), from
 * results finalized before this one.
 */
export const evaluateMatchAwards = ({
  matchResult = {},
  policy = DEFAULT_LIVE_CHALLENGE_REWARD_POLICY,
  personalBestStudentIds = [],
} = {}) => {
  const normalized = storedRewardPolicy(policy);
  const awards = [...evaluateRewardPolicy({ matchResult, policy: normalized })];
  if (!Array.isArray(matchResult.recognitions)) return awards;
  if (recognitionsEnabled(normalized)) awards.push(...recognitionAwards(matchResult));
  const sourceId = String(matchResult.roomId || '');
  const joined = new Set((Array.isArray(matchResult.standings) ? matchResult.standings : [])
    .filter((standing) => standing?.joined === true && standing.studentId)
    .map((standing) => standing.studentId));
  [...new Set((Array.isArray(personalBestStudentIds) ? personalBestStudentIds : []).map(String))]
    .filter((studentId) => joined.has(studentId))
    .sort()
    .forEach((studentId) => awards.push(serverAward({
      sourceId,
      studentId,
      ruleId: PERSONAL_BEST_RULE_ID,
      reasonLabel: 'Live Challenge — Personal best',
      reward: { kind: REWARD_KIND.CLASS_POINTS, amount: PERSONAL_BEST_POINTS },
    })));
  return capMatchClassPoints(awards);
};
