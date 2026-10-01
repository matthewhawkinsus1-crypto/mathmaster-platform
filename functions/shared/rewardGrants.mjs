/*
 * REWARD DEFINITIONS AND REWARD GRANTS.
 *
 * Two kinds of reward exist, and they need different records:
 *
 *   CURRENCY  Class Points. A balance a student accumulates and spends. It
 *             already has a proper ledger — an immutable transaction per
 *             change and an account projection — in classPoints.mjs. Nothing
 *             here replaces it.
 *
 *   ITEM      A Practice Pass, a badge: one discrete thing a student holds.
 *             A counter ("passes: 2") cannot say where each pass came from,
 *             when it expires, what it was used on, or that a teacher took one
 *             back — and decrementing it on use deletes the history. So each
 *             item is its own GRANT document with its own lifecycle.
 *
 * A grant's lifecycle:
 *
 *   available --redeem--> redeemed   (used against an assignment; terminal)
 *   available --revoke--> revoked    (teacher/admin reversal; terminal)
 *   available --expire--> expired    (past expiresAt; terminal)
 *
 * Terminal states never change again, and a transition never deletes
 * anything: it sets the new status, records who/when/why/against-what, and
 * appends to the grant's history. A retried transition with the same intent
 * is "already applied", not a second use.
 *
 * WHERE GRANTS COME FROM. A grant is issued by a reward rule consuming a final
 * match result (liveChallengeRewardRules.mjs). Its document id is derived from
 * a deterministic award identity — source + source id + student + rule — so
 * issuing the same award twice lands on the same document. See
 * functions/shared/liveChallengeClassPoints.mjs for the issuing transaction.
 *
 * Pure: no Firebase and no node:crypto, so a student wallet can import these
 * definitions and status rules directly.
 */

export const REWARD_GRANT_SCHEMA_VERSION = 1;

// rewardGrants/{grantId}. Students read their own; teachers read their class's
// (firestore.rules). Only the server writes.
export const REWARD_GRANTS_COLLECTION = 'rewardGrants';

export const REWARD_GRANT_STATUS = Object.freeze({
  AVAILABLE: 'available',
  REDEEMED: 'redeemed',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

export const REWARD_CATEGORY = Object.freeze({
  CURRENCY: 'currency',
  PASS: 'pass',
  BADGE: 'badge',
});

export const GRANT_OUTCOME = Object.freeze({
  APPLY: 'apply',
  ALREADY_APPLIED: 'alreadyApplied',
  REJECT: 'reject',
});

/*
 * The catalog. `grantable` means a reward rule may issue it as an item grant;
 * Class Points are never an item — they go through their ledger.
 */
export const REWARD_DEFINITIONS = Object.freeze({
  classPoints: Object.freeze({
    rewardCode: 'classPoints',
    category: REWARD_CATEGORY.CURRENCY,
    label: 'Class Points',
    grantable: false,
    redeemable: false,
  }),
  practicePass: Object.freeze({
    rewardCode: 'practicePass',
    category: REWARD_CATEGORY.PASS,
    label: 'Practice Pass',
    grantable: true,
    redeemable: true,
    // What a redemption must name. Mirrors the Practice Pass waiver that
    // classPointRewards.mjs already grants when points are spent.
    redeemsAgainst: 'assignmentPracticeSection',
  }),
  badge: Object.freeze({
    rewardCode: 'badge',
    category: REWARD_CATEGORY.BADGE,
    label: 'Badge',
    grantable: true,
    redeemable: false,
  }),
});

export const getRewardDefinition = (rewardCode) => REWARD_DEFINITIONS[String(rewardCode || '')] || null;

export const isGrantableReward = (rewardCode) => getRewardDefinition(rewardCode)?.grantable === true;

const TERMINAL = new Set([REWARD_GRANT_STATUS.REDEEMED, REWARD_GRANT_STATUS.EXPIRED, REWARD_GRANT_STATUS.REVOKED]);

export const isTerminalGrantStatus = (status) => TERMINAL.has(String(status || ''));

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

const toMillis = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

/** The status a grant is really in at `nowMs`: an available grant past its expiry is expired. */
export const effectiveGrantStatus = (grant = {}, nowMs = Date.now()) => {
  const status = String(grant?.status || '');
  if (status !== REWARD_GRANT_STATUS.AVAILABLE) return status || null;
  const expiresAt = toMillis(grant?.expiresAt);
  return expiresAt !== null && Number(nowMs) >= expiresAt ? REWARD_GRANT_STATUS.EXPIRED : status;
};

/**
 * A new grant document. `identity` is the plain-text award identity the
 * grant id was hashed from, kept so an audit can see exactly what it is.
 */
export const buildRewardGrant = ({
  grantId,
  rewardCode,
  badgeCode = null,
  label = null,
  studentId,
  classId,
  source = {},
  awardedAt,
  expiresAt = null,
  originTeacherEmail = null,
  authorizedTeacherEmails = [],
} = {}) => {
  const definition = getRewardDefinition(rewardCode);
  if (!definition?.grantable) throw new TypeError(`"${rewardCode}" is not an item reward that can be granted.`);
  if (!cleanText(grantId, 200)) throw new TypeError('A grant needs its deterministic id.');
  if (!cleanText(studentId, 64) || !cleanText(classId, 120)) throw new TypeError('A grant needs a student and a class.');
  const at = awardedAt || new Date().toISOString();
  return {
    schemaVersion: REWARD_GRANT_SCHEMA_VERSION,
    grantId: cleanText(grantId, 200),
    rewardCode: definition.rewardCode,
    category: definition.category,
    badgeCode: definition.category === REWARD_CATEGORY.BADGE ? cleanText(badgeCode, 60) || null : null,
    label: cleanText(label, 80) || definition.label,
    studentId: cleanText(studentId, 64),
    classId: cleanText(classId, 120),
    status: REWARD_GRANT_STATUS.AVAILABLE,
    source: {
      type: cleanText(source.type, 40) || null,
      id: cleanText(source.id, 200) || null,
      ruleId: cleanText(source.ruleId, 60) || null,
      ruleVersion: Number.isInteger(Number(source.ruleVersion)) ? Number(source.ruleVersion) : null,
      identity: cleanText(source.identity, 400) || null,
    },
    awardedAt: at,
    expiresAt: expiresAt || null,
    redeemedAt: null,
    redemption: null,
    revokedAt: null,
    revocation: null,
    expiredAt: null,
    history: [{ status: REWARD_GRANT_STATUS.AVAILABLE, at, actorType: 'system', reason: 'awarded' }],
    originTeacherEmail: originTeacherEmail || null,
    authorizedTeacherEmails: Array.isArray(authorizedTeacherEmails) ? [...authorizedTeacherEmails] : [],
  };
};

const apply = (next) => Object.freeze({ outcome: GRANT_OUTCOME.APPLY, next });
const alreadyApplied = () => Object.freeze({ outcome: GRANT_OUTCOME.ALREADY_APPLIED });
const reject = (code, message) => Object.freeze({ outcome: GRANT_OUTCOME.REJECT, code, message });

const appendHistory = (grant, entry) => [...(Array.isArray(grant.history) ? grant.history : []), entry];

/**
 * Plan a lifecycle transition. Returns the complete next document on APPLY;
 * the caller writes it inside the same transaction that read `grant`.
 *
 *   redeem: { to: 'redeemed', redemption: { redemptionId, targetKind, targetId, targetLabel }, actor }
 *   revoke: { to: 'revoked', reason, actor: { type: 'teacher'|'admin', email } }
 *   expire: { to: 'expired' }            (only once expiresAt has passed)
 */
export const planGrantTransition = (grant, { to, at = null, actor = {}, reason = '', redemption = null } = {}, nowMs = Date.now()) => {
  if (!grant || !grant.grantId) return reject('not_found', 'That reward was not found.');
  const definition = getRewardDefinition(grant.rewardCode);
  const current = String(grant.status || '');
  const when = at || new Date(Number(nowMs)).toISOString();
  const actorType = cleanText(actor?.type, 20) || 'system';
  const actorEmail = cleanText(actor?.email, 200) || null;

  if (to === REWARD_GRANT_STATUS.REDEEMED) {
    const redemptionId = cleanText(redemption?.redemptionId, 200);
    if (!redemptionId) return reject('redemption_required', 'A redemption must name what the reward is used on.');
    if (current === REWARD_GRANT_STATUS.REDEEMED) {
      return grant.redemption?.redemptionId === redemptionId
        ? alreadyApplied()
        : reject('already_redeemed', 'This reward has already been used.');
    }
    if (current !== REWARD_GRANT_STATUS.AVAILABLE) return reject(`already_${current}`, `This reward is ${current}.`);
    if (!definition?.redeemable) return reject('not_redeemable', 'This reward cannot be redeemed.');
    if (effectiveGrantStatus(grant, nowMs) === REWARD_GRANT_STATUS.EXPIRED) return reject('expired', 'This reward has expired.');
    const targetKind = cleanText(redemption?.targetKind, 60);
    if (definition.redeemsAgainst && targetKind !== definition.redeemsAgainst) {
      return reject('wrong_target', `A ${definition.label} is redeemed against ${definition.redeemsAgainst}.`);
    }
    return apply({
      ...grant,
      status: REWARD_GRANT_STATUS.REDEEMED,
      redeemedAt: when,
      redemption: {
        redemptionId,
        targetKind,
        targetId: cleanText(redemption?.targetId, 200) || null,
        targetLabel: cleanText(redemption?.targetLabel, 140) || null,
      },
      history: appendHistory(grant, { status: REWARD_GRANT_STATUS.REDEEMED, at: when, actorType, actorEmail, reason: 'redeemed' }),
    });
  }

  if (to === REWARD_GRANT_STATUS.REVOKED) {
    if (current === REWARD_GRANT_STATUS.REVOKED) return alreadyApplied();
    if (current !== REWARD_GRANT_STATUS.AVAILABLE) return reject(`already_${current}`, `A ${current} reward cannot be revoked.`);
    const cleanReason = cleanText(reason, 300);
    if (!cleanReason) return reject('reason_required', 'Say why the reward is being taken back.');
    return apply({
      ...grant,
      status: REWARD_GRANT_STATUS.REVOKED,
      revokedAt: when,
      revocation: { actorType, actorEmail, reason: cleanReason },
      history: appendHistory(grant, { status: REWARD_GRANT_STATUS.REVOKED, at: when, actorType, actorEmail, reason: cleanReason }),
    });
  }

  if (to === REWARD_GRANT_STATUS.EXPIRED) {
    if (current === REWARD_GRANT_STATUS.EXPIRED) return alreadyApplied();
    if (current !== REWARD_GRANT_STATUS.AVAILABLE) return reject(`already_${current}`, `A ${current} reward cannot expire.`);
    if (effectiveGrantStatus(grant, nowMs) !== REWARD_GRANT_STATUS.EXPIRED) return reject('not_expired', 'This reward has not reached its expiry.');
    return apply({
      ...grant,
      status: REWARD_GRANT_STATUS.EXPIRED,
      expiredAt: when,
      history: appendHistory(grant, { status: REWARD_GRANT_STATUS.EXPIRED, at: when, actorType: 'system', reason: 'expired' }),
    });
  }

  return reject('unknown_transition', `Unknown reward transition "${String(to)}".`);
};
