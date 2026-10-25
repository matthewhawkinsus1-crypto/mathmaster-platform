import { FieldValue } from 'firebase-admin/firestore';
import {
  GRANT_OUTCOME,
  REWARD_GRANTS_COLLECTION,
  REWARD_GRANT_STATUS,
  grantExpiryTime,
  grantsDueToExpire,
  planGrantTransition,
} from './rewardGrants.mjs';

/*
 * REWARD GRANT TRANSITIONS, APPLIED (server only).
 *
 * rewardGrants.mjs decides what a redeem, revoke or expire does to a grant;
 * this applies that decision atomically. The grant is read, planned and
 * written in one transaction, so two requests to use the same Practice Pass
 * cannot both succeed, and a retried request with the same intent is answered
 * "already applied" without a second write. Nothing is ever deleted: the
 * planned document carries the grant's full history plus the new entry.
 *
 * A teacher's "take back" and a student's use are applied by
 * rewardActionStore.mjs inside their own transactions (they have more to write
 * in the same commit). This is the single-grant form, and what the lazy expiry
 * below is made of.
 */
export async function transitionRewardGrant(db, grantId, transition = {}, { nowMs = Date.now() } = {}) {
  const id = String(grantId || '').trim();
  if (!id) return Object.freeze({ outcome: GRANT_OUTCOME.REJECT, code: 'not_found', message: 'That reward was not found.' });
  const ref = db.collection(REWARD_GRANTS_COLLECTION).doc(id);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const plan = planGrantTransition(snapshot.exists ? snapshot.data() : null, transition, nowMs);
    if (plan.outcome === GRANT_OUTCOME.APPLY) {
      transaction.set(ref, { ...plan.next, updatedAt: FieldValue.serverTimestamp() });
    }
    return plan;
  });
}

// A student holds a handful of grants a term; this bounds one read's housekeeping.
export const EXPIRY_PERSIST_LIMIT = 20;

/**
 * LAZY EXPIRY: record `expired` on the grants, of those a server path already
 * holds, that are past their end date but still stored as `available`.
 *
 * A grant reads as expired the moment it passes its end date
 * (effectiveGrantStatus), so this changes what nobody can see; it makes the
 * stored status and its history agree with the clock. It is housekeeping that
 * rides on a read, so it can never fail one: every grant is settled in its own
 * transaction (a second look at the document, so a pass used a moment ago is
 * not expired over), an error on one is left for the next touch, and the
 * result says only which grants were written. The history says the grant
 * expired when its end date fell (`grantExpiryTime`), not when this ran.
 *
 * @returns {Promise<Array<object>>} the grant documents as written
 */
export async function persistExpiredGrants(db, grants = [], { nowMs = Date.now(), limit = EXPIRY_PERSIST_LIMIT } = {}) {
  const written = [];
  for (const grant of grantsDueToExpire(grants, nowMs).slice(0, Math.max(0, limit))) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const plan = await transitionRewardGrant(
        db,
        grant.grantId,
        { to: REWARD_GRANT_STATUS.EXPIRED, at: grantExpiryTime(grant) },
        { nowMs },
      );
      if (plan.outcome === GRANT_OUTCOME.APPLY) written.push(plan.next);
    } catch {
      // Left as it was: it still reads as expired, and the next touch tries again.
    }
  }
  return written;
}
