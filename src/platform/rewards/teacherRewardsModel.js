import {
  REWARD_DEFINITIONS,
  REWARD_GRANT_STATUS,
  REWARD_SOURCE,
  effectiveGrantStatus,
} from '../../../functions/shared/rewardGrants.mjs';
import { formatRewardDate, grantDisplayName, toMillis } from './rewardWallet.js';

/*
 * ONE STUDENT'S REWARDS, FOR THEIR TEACHER.
 *
 * Built from the getStudentRewards callable's one-time read. Where the
 * student wallet hides machinery, this keeps enough of it to troubleshoot:
 * which match or which teacher a reward came from, which rule, when it was
 * used and on what, how it was paid for, who undid or took back what and why.
 * Still no raw ids on screen.
 */

const byNewest = (field) => (a, b) => (toMillis(b[field]) ?? 0) - (toMillis(a[field]) ?? 0);

export const PAYMENT_LABEL = Object.freeze({ pass: 'Paid with a Practice Pass', classPoints: 'Paid with 100 Class Points' });

export const teacherSourceLabel = (grant = {}, challengeTitles = new Map()) => {
  const source = grant.source || {};
  if (source.type === REWARD_SOURCE.LIVE_CHALLENGE) {
    const title = challengeTitles.get(source.id);
    const rule = String(grant.reasonLabel || '').replace(/^Live Challenge\s*[—-]\s*/i, '');
    return `Live Challenge${title ? ` “${title}”` : ''}${rule ? ` — ${rule}` : ''}`;
  }
  if (source.type === REWARD_SOURCE.RESTORED) return 'Returned when a use was undone';
  if (source.type === REWARD_SOURCE.TEACHER) return `Given by ${source.id || 'a teacher'}`;
  return 'Reward';
};

export const buildTeacherRewardsView = (data = {}, nowMs = Date.now()) => {
  const grants = Array.isArray(data.grants) ? data.grants : [];
  const redemptions = Array.isArray(data.redemptions) ? data.redemptions : [];
  const challenges = Array.isArray(data.challenges) ? data.challenges : [];
  const titles = new Map(challenges.map((match) => [match.roomId, match.title]));
  const grantsById = new Map(grants.map((grant) => [grant.grantId || grant.id, grant]));

  const describeGrant = (grant) => ({
    grantId: grant.grantId || grant.id,
    rewardCode: grant.rewardCode,
    name: grantDisplayName(grant),
    icon: REWARD_DEFINITIONS[grant.rewardCode]?.icon || '🎁',
    status: effectiveGrantStatus(grant, nowMs),
    source: teacherSourceLabel(grant, titles),
    note: grant.note || null,
    awardedAt: grant.awardedAt,
    awardedLabel: formatRewardDate(grant.awardedAt, nowMs),
    expiresLabel: grant.expiresAt ? formatRewardDate(grant.expiresAt, nowMs) : null,
    revocation: grant.revocation || null,
    revokedLabel: grant.revokedAt ? formatRewardDate(grant.revokedAt, nowMs) : null,
    usedOn: grant.redemption?.targetLabel || null,
    usedLabel: grant.redeemedAt ? formatRewardDate(grant.redeemedAt, nowMs) : null,
  });

  const available = grants
    .filter((grant) => effectiveGrantStatus(grant, nowMs) === REWARD_GRANT_STATUS.AVAILABLE)
    .sort(byNewest('awardedAt'))
    .map(describeGrant);
  const closed = grants
    .filter((grant) => [REWARD_GRANT_STATUS.REVOKED, REWARD_GRANT_STATUS.EXPIRED].includes(effectiveGrantStatus(grant, nowMs)))
    .sort(byNewest('awardedAt'))
    .map(describeGrant);

  const uses = redemptions
    .slice()
    .sort(byNewest('redeemedAt'))
    .map((redemption) => {
      const paidWithPass = redemption.paidWith === 'pass';
      const grant = paidWithPass ? grantsById.get(redemption.grantId) : null;
      const active = String(redemption.status || 'redeemed') === 'redeemed';
      return {
        redemptionId: redemption.redemptionId || redemption.id,
        assignmentId: redemption.assignmentId,
        assignmentTitle: redemption.assignmentTitle || 'Assignment',
        usedLabel: formatRewardDate(redemption.redeemedAt, nowMs),
        payment: paidWithPass
          ? `${PAYMENT_LABEL.pass}${grant ? ` (${teacherSourceLabel(grant, titles)})` : ''}`
          : PAYMENT_LABEL.classPoints,
        active,
        undoneLabel: !active && redemption.reversedAt ? formatRewardDate(redemption.reversedAt, nowMs) : null,
        undoReason: redemption.reversal?.reason || null,
        undoneBy: redemption.reversal?.actorEmail || null,
        refund: !active ? (redemption.refund?.kind === 'pass' ? 'Pass returned to the student' : 'Points refunded to the student') : null,
        earlierUses: Array.isArray(redemption.previousRedemptions) ? redemption.previousRedemptions.length : 0,
      };
    });

  const passesReady = available.filter((grant) => grant.rewardCode === 'practicePass').length;
  const badges = available.filter((grant) => grant.rewardCode === 'badge').length;
  const balance = Number(data.account?.balance) || 0;
  return {
    summary: [
      `${passesReady} Practice Pass${passesReady === 1 ? '' : 'es'} ready`,
      ...(badges ? [`${badges} badge${badges === 1 ? '' : 's'}`] : []),
      `${balance} Class Points`,
    ].join(' · '),
    available,
    closed,
    uses,
    excusedAssignmentIds: new Set(uses.filter((use) => use.active).map((use) => use.assignmentId)),
    challenges,
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
  };
};

/** Teacher-facing words for a failed reward action. */
export const teacherRewardErrorMessage = (error) => {
  const code = String(error?.code || '').replace(/^functions\//, '');
  if (['unavailable', 'deadline-exceeded', 'internal', 'unknown'].includes(code)) {
    return 'MathMaster could not be reached. Nothing changed. Try again — a retry never repeats the action.';
  }
  return String(error?.message || 'That did not work. Nothing changed.');
};

/** The reward guide a teacher reads in the panel, from the one catalog. */
export const rewardGuide = () => Object.values(REWARD_DEFINITIONS).map((definition) => ({
  rewardCode: definition.rewardCode,
  label: definition.label,
  icon: definition.icon,
  description: definition.teacherDescription,
  gradeEffect: definition.gradeEffect,
  teacherAwardable: definition.teacherAwardable === true,
}));
