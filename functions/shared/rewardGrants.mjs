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
 * Growth rules (functions/shared/growthRewardRules.mjs) issue badges the same
 * way, from a student's own released tests, corrections, weekly Path goals and
 * mastery, delivered by functions/lib/growthRewards.js.
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
 *
 * The copy here is the ONE description of each reward, shared by the student
 * wallet, the teacher's reward guide and the docs, so a reward cannot mean one
 * thing on one screen and another elsewhere. Student copy is written for a
 * ninth grader: what it is, what it does, what it does not do.
 *
 *   studentDescription  one sentence, shown on the wallet card
 *   studentHowToUse     how a student uses it (null when it is not used)
 *   teacherDescription  what a teacher needs to know, including grade effect
 *   gradeEffect         the exact effect on grades and completion, or null
 *   teacherAwardable    a teacher may hand one out directly
 */
export const REWARD_DEFINITIONS = Object.freeze({
  classPoints: Object.freeze({
    rewardCode: 'classPoints',
    category: REWARD_CATEGORY.CURRENCY,
    label: 'Class Points',
    icon: '⭐',
    grantable: false,
    redeemable: false,
    teacherAwardable: false,
    studentDescription: 'Points your teacher gives for great classwork, explaining, and helping. Save 100 to trade for a Practice Pass.',
    studentHowToUse: null,
    teacherDescription: 'A participation currency. Awarding or spending points never changes a grade or mastery.',
    gradeEffect: null,
  }),
  practicePass: Object.freeze({
    rewardCode: 'practicePass',
    category: REWARD_CATEGORY.PASS,
    label: 'Practice Pass',
    icon: '🎟️',
    grantable: true,
    redeemable: true,
    teacherAwardable: true,
    // What a redemption must name. Mirrors the Practice Pass waiver that
    // classPointRewards.mjs already grants when points are spent.
    redeemsAgainst: 'assignmentPracticeSection',
    studentDescription: 'Skip the Practice (homework) section of one assignment you have not started yet.',
    studentHowToUse: 'Pick an assignment. Its Practice section is marked Excused. Warm-Up, Classwork, and DOL still count.',
    teacherDescription: 'Excuses the Practice section of one eligible assignment for one student.',
    gradeEffect: 'Practice is excused, not scored: it is removed from the assignment grade and from completion, '
      + 'sent to Google Classroom without Practice, and shown as Excused (Practice Pass) in Grade Transfer. '
      + 'Warm-Up, Classwork and DOL are unchanged. It is never counted as a correct answer or as mastery.',
  }),
  badge: Object.freeze({
    rewardCode: 'badge',
    category: REWARD_CATEGORY.BADGE,
    label: 'Badge',
    icon: '🏅',
    grantable: true,
    redeemable: false,
    teacherAwardable: true,
    studentDescription: 'A badge to keep. It shows what you achieved.',
    studentHowToUse: null,
    teacherDescription: 'Recognition only. A badge is kept, never spent.',
    gradeEffect: null,
  }),
});

/*
 * Where a grant came from. Stored on `source.type`. A grant's source is fixed
 * when it is issued and is never rewritten.
 *
 *   liveChallenge  a reward rule consuming a finished match result
 *   teacher        a teacher handed it out directly (awardRewardGrant)
 *   restored       a teacher undid a redemption; this grant gives the pass back
 *                  (the original grant stays redeemed — terminal states never
 *                  change — and this one points at it)
 */
export const REWARD_SOURCE = Object.freeze({
  LIVE_CHALLENGE: 'liveChallenge',
  TEACHER: 'teacher',
  RESTORED: 'restored',
  // A growth rule (functions/shared/growthRewardRules.mjs): a better retest,
  // finished corrections, a run of weekly Path goals, skills mastered.
  GROWTH: 'growth',
});

/*
 * BADGES A STUDENT CAN SEE BY NAME.
 *
 * A badge grant stores a free-text `badgeCode` (a teacher's or a Live
 * Challenge rule's), and grants issued before this catalog existed keep
 * whatever code they were given. The catalog is display copy only — a label,
 * an icon and one plain sentence — for the codes the platform itself issues,
 * so the wallet can say "Comeback on the retest" instead of "Badge". Nothing
 * reads it to decide whether a badge is valid; `badgeDisplay` falls back to
 * the grant's own label for any code it does not know.
 */
export const BADGE_CATALOG = Object.freeze({
  'growth-retest': Object.freeze({
    badgeCode: 'growth-retest',
    label: 'Comeback on the retest',
    icon: '📈',
    studentDescription: 'You came back and did better on a retest.',
  }),
  'growth-corrections': Object.freeze({
    badgeCode: 'growth-corrections',
    label: 'Fixed my mistakes',
    icon: '🛠️',
    studentDescription: 'You finished every correction on a test.',
  }),
  'growth-path-streak': Object.freeze({
    badgeCode: 'growth-path-streak',
    label: 'Three weeks on track',
    icon: '🔥',
    studentDescription: 'You met your My Math Path goal on time three weeks in a row.',
  }),
  'mastery-5': Object.freeze({
    badgeCode: 'mastery-5',
    label: '5 skills mastered',
    icon: '🌟',
    studentDescription: 'Five skills reached Mastered.',
  }),
  'mastery-10': Object.freeze({
    badgeCode: 'mastery-10',
    label: '10 skills mastered',
    icon: '🏆',
    studentDescription: 'Ten skills reached Mastered.',
  }),
});

/** The label and icon to show for a badge grant. Unknown codes keep the grant's own label. */
export const badgeDisplay = (grant = {}) => {
  const entry = BADGE_CATALOG[String(grant?.badgeCode || '')] || null;
  if (entry) return { label: entry.label, icon: entry.icon, description: entry.studentDescription };
  return {
    label: cleanText(grant?.label, 80) || REWARD_DEFINITIONS.badge.label,
    icon: REWARD_DEFINITIONS.badge.icon,
    description: REWARD_DEFINITIONS.badge.studentDescription,
  };
};

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
  // Who issued it, for the first history entry. A rule-issued grant is the
  // system's; a teacher's award names the teacher.
  actor = null,
  // A teacher's short reason ("Helped a classmate all period"), shown to the
  // student with the reward. Rule-issued grants carry the rule's label instead.
  note = null,
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
      // Only on a pass a teacher gave back by undoing a use: the grant it replaces.
      ...(cleanText(source.restoresGrantId, 200) ? { restoresGrantId: cleanText(source.restoresGrantId, 200) } : {}),
    },
    note: cleanText(note, 140) || null,
    awardedAt: at,
    expiresAt: expiresAt || null,
    redeemedAt: null,
    redemption: null,
    revokedAt: null,
    revocation: null,
    expiredAt: null,
    history: [{
      status: REWARD_GRANT_STATUS.AVAILABLE,
      at,
      actorType: cleanText(actor?.type, 20) || 'system',
      ...(cleanText(actor?.email, 200) ? { actorEmail: cleanText(actor.email, 200) } : {}),
      reason: cleanText(source.type, 40) === REWARD_SOURCE.RESTORED ? 'restored' : 'awarded',
    }],
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

/**
 * Which of a student's passes to spend: the usable one that expires soonest,
 * so nothing is wasted. A pass that never expires is spent last. Ties go to
 * the oldest award, then the id, so two screens always agree on the choice.
 */
export const pickGrantToSpend = (grants = [], rewardCode, nowMs = Date.now()) => {
  const usable = (Array.isArray(grants) ? grants : []).filter((grant) => grant
    && grant.rewardCode === rewardCode
    && effectiveGrantStatus(grant, nowMs) === REWARD_GRANT_STATUS.AVAILABLE);
  const expiry = (grant) => {
    const value = toMillis(grant.expiresAt);
    return value === null ? Number.POSITIVE_INFINITY : value;
  };
  usable.sort((a, b) => (expiry(a) - expiry(b))
    || ((toMillis(a.awardedAt) ?? 0) - (toMillis(b.awardedAt) ?? 0))
    || (String(a.grantId) < String(b.grantId) ? -1 : String(a.grantId) > String(b.grantId) ? 1 : 0));
  return usable[0] || null;
};
