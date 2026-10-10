/*
 * DON'T LET LOG OUT THROW AWAY WORK THAT HASN'T BEEN SENT.
 *
 * A student's answers are written to this device's queue first and sent from
 * there. Logging out while the queue still holds something can strand it (the
 * next account on a shared Chromebook does not send another student's work),
 * so Log Out asks first. Nothing here blocks logging out: the student can
 * always choose "Log out anyway".
 *
 * Returns null when there is nothing at risk.
 */

export const LOGOUT_RISK_MESSAGE = "You have work that hasn't been sent yet. If you log out now, it may be lost.";

const count = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);

const PENDING_STATUSES = new Set(['capturing', 'queued', 'syncing', 'offline']);
const HIGH_STATUSES = new Set(['needs-review', 'volatile']);

export const describeLogoutRisk = ({
  outboxDepth = 0,
  pendingGradeCount = 0,
  needsReviewCount = 0,
  persistenceStatus = 'idle',
} = {}) => {
  const status = String(persistenceStatus || 'idle');
  const queued = count(outboxDepth);
  const grades = count(pendingGradeCount);
  const review = count(needsReviewCount);
  if (!queued && !grades && !review && !PENDING_STATUSES.has(status) && !HIGH_STATUSES.has(status)) return null;
  // Graded work (a Submit, not a draft checkpoint) or work the server has not
  // recorded is the kind a student would lose a grade over.
  const severity = grades > 0 || review > 0 || HIGH_STATUSES.has(status) ? 'high' : 'low';
  return { message: LOGOUT_RISK_MESSAGE, severity };
};
