import {
  REWARD_DEFINITIONS,
  REWARD_GRANT_STATUS,
  REWARD_SOURCE,
  effectiveGrantStatus,
  pickGrantToSpend,
} from '../../../functions/shared/rewardGrants.mjs';

/*
 * THE STUDENT'S REWARD WALLET, AS DATA.
 *
 * Everything a reward screen says — how many passes, what they do, when they
 * expire, what happened to each — is decided here from the server-written
 * records, and every screen (My Rewards, the Home summary, the use dialog, the
 * Live Challenge results card) renders this. Nothing here writes, and nothing
 * here decides whether a pass MAY be used: the redeemPracticePass callable is
 * the only authority, and src/platform/rewards/practicePassClientEligibility.js
 * only filters what to offer.
 *
 * Inputs are the records the student can read:
 *   grants        rewardGrants documents (theirs, this class)
 *   redemptions   classPointRewardRedemptions documents (theirs, this class)
 *   account       their Class Points balance
 *
 * Quantities are counted from individual grants — "Practice Pass ×2" is two
 * documents, each with its own source, expiry and history — so a count never
 * costs the record of where each one came from.
 *
 * Student words only: no ids, no "grant", no "ledger", no "redemption".
 */

export const PRACTICE_PASS = REWARD_DEFINITIONS.practicePass;
export const BADGE = REWARD_DEFINITIONS.badge;
export const CLASS_POINTS = REWARD_DEFINITIONS.classPoints;
export const PRACTICE_PASS_POINTS_PRICE = 100;
export const EXPIRING_SOON_DAYS = 3;
const DAY_MS = 86_400_000;

export const toMillis = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

/** "Sep 30" — the year only when it is not this year. */
export const formatRewardDate = (value, nowMs = Date.now()) => {
  const millis = toMillis(value);
  if (millis === null) return '';
  const date = new Date(millis);
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
};

/** "in 3 days", "tomorrow", "today" — for an expiry a student should notice. */
export const describeExpiry = (value, nowMs = Date.now()) => {
  const millis = toMillis(value);
  if (millis === null) return null;
  const days = Math.ceil((millis - nowMs) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 14) return `in ${days} days`;
  return `on ${formatRewardDate(millis, nowMs)}`;
};

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Where a reward came from, in a student's words. */
export const describeGrantSource = (grant = {}) => {
  const type = grant?.source?.type;
  if (type === REWARD_SOURCE.LIVE_CHALLENGE) return 'Earned in a Live Challenge';
  if (type === REWARD_SOURCE.RESTORED) return 'Given back by your teacher';
  if (type === REWARD_SOURCE.TEACHER) return 'From your teacher';
  return 'Reward';
};

/** The name to show for one grant: a badge's own name, otherwise its reward's. */
export const grantDisplayName = (grant = {}) => {
  const definition = REWARD_DEFINITIONS[grant?.rewardCode];
  if (grant?.rewardCode === 'badge') return String(grant.label || definition?.label || 'Badge');
  return definition?.label || String(grant.label || 'Reward');
};

/** Why the student got it — a Challenge rule's label or a teacher's note — when it adds something. */
export const grantReason = (grant = {}) => {
  const note = String(grant?.note || '').trim();
  if (note) return note;
  const reason = String(grant?.reasonLabel || '').trim();
  // "Live Challenge — Top finish" → "Top finish": the source line already says Live Challenge.
  return reason.replace(/^Live Challenge\s*[—-]\s*/i, '') || null;
};

const STATUS_LABEL = Object.freeze({
  [REWARD_GRANT_STATUS.AVAILABLE]: 'Ready to use',
  [REWARD_GRANT_STATUS.REDEEMED]: 'Used',
  [REWARD_GRANT_STATUS.REVOKED]: 'Taken back',
  [REWARD_GRANT_STATUS.EXPIRED]: 'Expired',
});

/** Status words, never a color alone. */
export const grantStatusLabel = (grant, nowMs = Date.now()) => {
  if (grant?.rewardCode === 'badge' && effectiveGrantStatus(grant, nowMs) === REWARD_GRANT_STATUS.AVAILABLE) return 'Earned';
  return STATUS_LABEL[effectiveGrantStatus(grant, nowMs)] || 'Reward';
};

const isActiveRedemption = (redemption) => Boolean(redemption)
  && String(redemption.status || 'redeemed') === 'redeemed';

/**
 * The wallet. `grants` may be only the available ones (the live inventory) or
 * all of them (history loaded); either way only usable ones are counted.
 */
export const buildRewardWallet = ({
  grants = [],
  redemptions = [],
  account = null,
  nowMs = Date.now(),
} = {}) => {
  const list = Array.isArray(grants) ? grants.filter(Boolean) : [];
  const usablePasses = list
    .filter((grant) => grant.rewardCode === PRACTICE_PASS.rewardCode
      && effectiveGrantStatus(grant, nowMs) === REWARD_GRANT_STATUS.AVAILABLE);
  const nextPass = pickGrantToSpend(usablePasses, PRACTICE_PASS.rewardCode, nowMs);
  const expiringSoon = usablePasses.filter((grant) => {
    const millis = toMillis(grant.expiresAt);
    return millis !== null && millis - nowMs <= EXPIRING_SOON_DAYS * DAY_MS;
  });
  const badges = list
    .filter((grant) => grant.rewardCode === BADGE.rewardCode && effectiveGrantStatus(grant, nowMs) === REWARD_GRANT_STATUS.AVAILABLE)
    .sort((a, b) => (toMillis(b.awardedAt) ?? 0) - (toMillis(a.awardedAt) ?? 0));
  const balance = Number(account?.balance) || 0;
  const excused = (Array.isArray(redemptions) ? redemptions : [])
    .filter(isActiveRedemption)
    .sort((a, b) => (toMillis(b.redeemedAt) ?? 0) - (toMillis(a.redeemedAt) ?? 0));

  return {
    practicePasses: {
      count: usablePasses.length,
      nextToUse: nextPass,
      nextExpiry: nextPass?.expiresAt || null,
      expiringSoonCount: expiringSoon.length,
      grants: [...usablePasses].sort((a, b) => (toMillis(a.expiresAt) ?? Infinity) - (toMillis(b.expiresAt) ?? Infinity)),
    },
    badges,
    classPoints: {
      balance,
      lifetimeEarned: Number(account?.lifetimeEarned) || 0,
      lifetimeSpent: Number(account?.lifetimeSpent) || 0,
      canBuyPass: balance >= PRACTICE_PASS_POINTS_PRICE,
      pointsNeeded: Math.max(0, PRACTICE_PASS_POINTS_PRICE - balance),
    },
    excusedAssignments: excused,
    // A pass held is always used before points are spent.
    payment: usablePasses.length ? 'pass' : balance >= PRACTICE_PASS_POINTS_PRICE ? 'classPoints' : null,
    hasAnything: usablePasses.length > 0 || badges.length > 0 || balance > 0 || excused.length > 0,
  };
};

/** One-line summary for Home: "2 Practice Passes · 140 Class Points". */
export const walletSummaryLine = (wallet) => {
  const parts = [];
  if (wallet.practicePasses.count) parts.push(plural(wallet.practicePasses.count, 'Practice Pass', 'Practice Passes'));
  if (wallet.badges.length) parts.push(plural(wallet.badges.length, 'badge'));
  parts.push(`${wallet.classPoints.balance} Class Points`);
  return parts.join(' · ');
};

/** What the use dialog promises will happen, before the student confirms. */
export const describePracticePassUse = ({ wallet, assignmentTitle }) => {
  const title = String(assignmentTitle || 'this assignment');
  const payingWithPass = wallet.payment === 'pass';
  const remaining = payingWithPass
    ? `You will have ${plural(wallet.practicePasses.count - 1, 'Practice Pass', 'Practice Passes')} left.`
    : `You will have ${wallet.classPoints.balance - PRACTICE_PASS_POINTS_PRICE} Class Points left.`;
  return {
    question: `Use a Practice Pass on ${title}?`,
    cost: payingWithPass ? 'Uses 1 Practice Pass.' : `Uses ${PRACTICE_PASS_POINTS_PRICE} Class Points.`,
    remaining,
    effects: [
      `The Practice section of ${title} will be marked Excused.`,
      'Excused is not 100% — Practice just will not count for or against your grade.',
      'Warm-Up, Classwork, and DOL still count.',
      'Only your teacher can undo this, so check the assignment name.',
    ],
    confirmLabel: payingWithPass ? 'Use 1 Practice Pass' : `Spend ${PRACTICE_PASS_POINTS_PRICE} points`,
  };
};

/** After a use, in one sentence. */
export const practicePassSuccessMessage = ({ assignmentTitle, passesLeft = null, alreadyExcused = false }) => {
  const title = String(assignmentTitle || 'this assignment');
  // A repeat of a use that already went through — most often a retry after
  // the first answer was lost on the network. Whether THIS attempt or an
  // earlier one spent the pass, the server spent exactly one; the wallet
  // above shows what is left, so this sentence does not guess.
  if (alreadyExcused) return `Practice is excused for ${title}. Your pass count above is up to date.`;
  const tail = passesLeft === null ? '' : ` You have ${plural(passesLeft, 'Practice Pass', 'Practice Passes')} left.`;
  return `Done! Practice is excused for ${title}.${tail}`;
};

/*
 * A failed use, explained. The one promise every message keeps: nothing was
 * used. A transport failure is the one case where the student cannot know
 * whether the server finished, so it says to check — trying again is safe,
 * because a repeat on the same assignment is answered "already excused".
 */
export const practicePassErrorMessage = (error) => {
  const code = String(error?.code || '').replace(/^functions\//, '');
  const message = String(error?.message || '').trim();
  if (['unavailable', 'deadline-exceeded', 'internal', 'unknown', 'cancelled'].includes(code) || /network|offline|fetch/i.test(message)) {
    return "We couldn't reach MathMaster. Check your connection and try again — trying again will never use two passes.";
  }
  if (code === 'failed-precondition' || code === 'not-found' || code === 'invalid-argument') {
    return `${message || 'That pass could not be used here.'} Nothing was used.`;
  }
  if (code === 'permission-denied' || code === 'unauthenticated') {
    return 'Your sign-in has expired. Sign in again, then try. Nothing was used.';
  }
  return `${message || 'Something went wrong.'} Nothing was used.`;
};

/*
 * HISTORY: what happened, newest first.
 *
 * Built from grants (earned, used, taken back, expired, given back) and from
 * Class Points Practice Pass purchases (which have no grant). A use a teacher
 * undid says so on the use itself.
 */
export const HISTORY_KIND = Object.freeze({
  EARNED: 'earned',
  USED: 'used',
  TAKEN_BACK: 'takenBack',
  EXPIRED: 'expired',
  UNDONE: 'undone',
});

export const HISTORY_KIND_LABEL = Object.freeze({
  [HISTORY_KIND.EARNED]: 'Earned',
  [HISTORY_KIND.USED]: 'Used',
  [HISTORY_KIND.TAKEN_BACK]: 'Taken back',
  [HISTORY_KIND.EXPIRED]: 'Expired',
  [HISTORY_KIND.UNDONE]: 'Undone by teacher',
});

export const buildRewardHistory = ({ grants = [], redemptions = [], nowMs = Date.now() } = {}) => {
  const entries = [];
  const redemptionsById = new Map((Array.isArray(redemptions) ? redemptions : [])
    .filter(Boolean).map((redemption) => [redemption.redemptionId, redemption]));

  (Array.isArray(grants) ? grants : []).filter(Boolean).forEach((grant) => {
    const name = grantDisplayName(grant);
    const id = grant.grantId || grant.id;
    entries.push({
      key: `${id}:earned`,
      kind: HISTORY_KIND.EARNED,
      at: grant.awardedAt,
      title: name,
      detail: [describeGrantSource(grant), grantReason(grant)].filter(Boolean).join(' — '),
    });
    const status = effectiveGrantStatus(grant, nowMs);
    if (status === REWARD_GRANT_STATUS.REDEEMED) {
      const redemption = redemptionsById.get(grant.redemption?.redemptionId);
      // The waiver document is shared per assignment; it was undone for THIS
      // use if the undo happened after this grant was spent.
      const undoneThisUse = redemption && (
        (redemption.status === 'reversed' && redemption.grantId === id)
        || (redemption.previousRedemptions || []).some((previous) => previous.grantId === id)
      );
      entries.push({
        key: `${id}:used`,
        kind: undoneThisUse ? HISTORY_KIND.UNDONE : HISTORY_KIND.USED,
        at: grant.redeemedAt,
        title: name,
        detail: `Used on ${grant.redemption?.targetLabel || 'an assignment'}${undoneThisUse ? ' — your teacher undid this and gave the pass back' : ''}`,
      });
    } else if (status === REWARD_GRANT_STATUS.REVOKED) {
      entries.push({
        key: `${id}:revoked`,
        kind: HISTORY_KIND.TAKEN_BACK,
        at: grant.revokedAt,
        title: name,
        detail: grant.revocation?.reason ? `Your teacher took this back: ${grant.revocation.reason}` : 'Your teacher took this back',
      });
    } else if (status === REWARD_GRANT_STATUS.EXPIRED) {
      entries.push({
        key: `${id}:expired`,
        kind: HISTORY_KIND.EXPIRED,
        at: grant.expiredAt || grant.expiresAt,
        title: name,
        detail: 'Not used before it expired',
      });
    }
  });

  // Practice Passes bought with Class Points have no grant: their record is
  // the redemption itself (and any earlier uses it keeps).
  (Array.isArray(redemptions) ? redemptions : []).filter(Boolean).forEach((redemption) => {
    const uses = [...(redemption.previousRedemptions || []), redemption];
    uses.forEach((use, index) => {
      if ((use.paidWith || 'classPoints') !== 'classPoints' || !use.redeemedAt) return;
      const undone = use === redemption ? redemption.status === 'reversed' : true;
      entries.push({
        key: `${redemption.redemptionId}:points:${index}`,
        kind: undone ? HISTORY_KIND.UNDONE : HISTORY_KIND.USED,
        at: use.redeemedAt,
        title: PRACTICE_PASS.label,
        detail: `Bought with ${PRACTICE_PASS_POINTS_PRICE} Class Points, used on ${redemption.assignmentTitle || 'an assignment'}${undone ? ' — your teacher undid this and returned the points' : ''}`,
      });
    });
  });

  return entries
    .filter((entry) => toMillis(entry.at) !== null)
    .sort((a, b) => (toMillis(b.at) - toMillis(a.at)) || (a.key < b.key ? -1 : 1));
};

/*
 * NEW-REWARD CELEBRATION.
 *
 * The first snapshot after sign-in is not news — those rewards were there
 * before. A reward is news when it appears in a LATER snapshot, or when it
 * arrived while the student was away and they have not been told yet (the
 * `seenIds` the caller keeps per student). Returns the grants to celebrate,
 * oldest first, never more than three at once.
 */
export const newlyEarnedGrants = ({ previousIds = null, grants = [], seenIds = new Set(), nowMs = Date.now(), recentMs = 2 * DAY_MS } = {}) => {
  const list = (Array.isArray(grants) ? grants : []).filter((grant) => grant && (grant.grantId || grant.id));
  const fresh = list.filter((grant) => {
    const id = grant.grantId || grant.id;
    if (seenIds.has(id)) return false;
    if (previousIds && !previousIds.has(id)) return true;
    // Arrived while away: still worth saying, if it is recent.
    const awarded = toMillis(grant.awardedAt);
    return awarded !== null && nowMs - awarded <= recentMs;
  });
  return fresh
    .sort((a, b) => (toMillis(a.awardedAt) ?? 0) - (toMillis(b.awardedAt) ?? 0))
    .slice(-3);
};

export const celebrationMessage = (grant) => {
  const definition = REWARD_DEFINITIONS[grant?.rewardCode];
  const name = grantDisplayName(grant);
  const type = grant?.source?.type;
  // A badge has its own name ("Great explainer"), which does not read as
  // "You earned a Great explainer": say it is a badge first.
  if (grant?.rewardCode === 'badge') {
    const from = type === REWARD_SOURCE.LIVE_CHALLENGE ? 'earned in a Live Challenge' : 'from your teacher';
    return `${definition?.icon || '🏅'} New badge: ${name} — ${from}!`;
  }
  const source = type === REWARD_SOURCE.LIVE_CHALLENGE ? ' in a Live Challenge'
    : type === REWARD_SOURCE.RESTORED ? ' back from your teacher'
      : ' from your teacher';
  return `${definition?.icon || '🎉'} You earned a ${name}${source}!`;
};

/** The rewards one Live Challenge gave this student, for its results screen. */
export const rewardsFromChallenge = ({ roomId, grants = [], transactions = [] } = {}) => {
  const id = String(roomId || '');
  if (!id) return { items: [], points: 0, pointReasons: [] };
  const items = (Array.isArray(grants) ? grants : [])
    .filter((grant) => grant?.source?.type === REWARD_SOURCE.LIVE_CHALLENGE && grant?.source?.id === id);
  const pointEntries = (Array.isArray(transactions) ? transactions : [])
    .filter((entry) => entry?.roomId === id && Number(entry.amount) > 0);
  return {
    items,
    points: pointEntries.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
    pointReasons: pointEntries.map((entry) => String(entry.reasonLabel || '').replace(/^Live Challenge\s*[—-]\s*/i, '')).filter(Boolean),
  };
};
