import { FieldValue } from 'firebase-admin/firestore';
import { GRANT_OUTCOME, REWARD_GRANTS_COLLECTION, planGrantTransition } from './rewardGrants.mjs';

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
 * This is the integration point a rewards wallet, a teacher's "take back" or
 * an expiry sweep calls. None of those exist yet; this is what they share.
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
