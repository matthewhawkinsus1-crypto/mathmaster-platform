import { useEffect } from 'react';
import { accountTabStorageKey, tabStorage } from '../../auth/accountTabStorage.js';

/*
 * ASK THE SERVER TO PAY ANY GROWTH REWARDS THIS STUDENT HAS EARNED.
 *
 * Growth rewards (a better retest, finished corrections, a weekly Path goal
 * met on time, a skill mastered) are decided and delivered entirely on the
 * server, from records the student cannot write
 * (functions/lib/growthRewards.js). This hook only says "now is a good time to
 * check": when the student app opens, again once the last check is
 * GROWTH_SYNC_INTERVAL_MS old (on a timer and whenever the tab comes back into
 * view), so finished corrections or a met weekly goal pay the same visit —
 * not only in a brand-new tab. New rewards arrive through the wallet
 * listeners that already exist.
 *
 * It is deliberately silent. A failed or refused sync costs the student
 * nothing — every award has a fixed id, so the next session's sync pays
 * exactly what this one would have — and an error banner about a background
 * check would only worry them. The "asked at" stamp is set BEFORE the call, so
 * concurrent mounts ask once; a transient failure (offline, unavailable,
 * internal, timeout) clears it so the next check retries. The stamp lives
 * under the signed-in account's tab-storage key (accountTabStorage.js), so
 * sign-out clears it with everything else — no student id stays in the tab
 * for the next person on a shared device.
 *
 * The callable is loaded lazily so this module stays importable without a
 * Firebase app (tests read the guard below directly).
 */


// How old a check may be before the next one: rewards earned while the app
// is open pay within this long. The server keeps its own throttle.
export const GROWTH_SYNC_INTERVAL_MS = 45 * 60 * 1000;
const SYNC_NAME = 'growthRewardSync';

const clean = (value) => String(value ?? '').trim().slice(0, 64);

/** The tab-storage key for one signed-in account's student (null without both). */
export const growthSyncKey = (uid, studentId) => accountTabStorageKey(uid, SYNC_NAME, studentId);

/** Whether a check for this account's student is still fresh. */
export const growthSyncFresh = ({ uid, studentId, storage = tabStorage(), nowMs = Date.now() } = {}) => {
  const key = growthSyncKey(uid, studentId);
  if (!key) return true; // no account or student named: never ask
  try {
    const at = Number(storage?.getItem(key));
    return Number.isFinite(at) && at > 0 && nowMs - at < GROWTH_SYNC_INTERVAL_MS;
  } catch {
    // Storage that throws cannot remember, so it asks on every check; the
    // server's own throttle keeps that cheap.
    return false;
  }
};

const stamp = (key, storage, nowMs) => {
  try { storage?.setItem(key, String(nowMs)); } catch { /* see growthSyncFresh */ }
};
const unstamp = (key, storage) => {
  try { storage?.removeItem(key); } catch { /* see growthSyncFresh */ }
};

/** A failure worth retrying at the next check (the device, not the request). */
export const growthSyncRetryable = (error) => {
  const code = String(error?.code || '').replace(/^functions\//, '');
  return ['unavailable', 'internal', 'deadline-exceeded', 'unknown', 'resource-exhausted', 'aborted', ''].includes(code);
};

const defaultCallSync = async () => {
  const [{ httpsCallable }, { functions }] = await Promise.all([
    import('firebase/functions'),
    import('../../firebase.js'),
  ]);
  const result = await httpsCallable(functions, 'syncStudentGrowthRewards')({});
  return result?.data || {};
};

/**
 * Ask for a sync unless the last check is still fresh. Resolves to the
 * server's answer, or null when it did not ask or the call failed. Never
 * throws.
 */
export const requestGrowthRewardSync = async ({
  uid, studentId, storage = tabStorage(), callSync = defaultCallSync, nowMs = Date.now(),
} = {}) => {
  const key = growthSyncKey(uid, clean(studentId));
  if (!key || growthSyncFresh({ uid, studentId, storage, nowMs })) return null;
  stamp(key, storage, nowMs);
  try {
    return await callSync();
  } catch (error) {
    // Offline at sign-in (a Chromebook waking up) must not cost the visit its
    // rewards: clear the stamp so the next check asks again.
    if (growthSyncRetryable(error)) unstamp(key, storage);
    console.warn('Growth rewards could not be checked this time:', error?.code || error?.message || error);
    return null;
  }
};

// How often an open app looks at the stamp (cheap: a storage read).
const CHECK_EVERY_MS = 5 * 60 * 1000;

/**
 * Wire-up: call from the signed-in student's app shell with their auth uid
 * and verified studentId.
 */
export function useGrowthRewardSync(studentId, { uid = null, enabled = true, callSync } = {}) {
  useEffect(() => {
    if (!enabled || !clean(studentId) || !clean(uid)) return undefined;
    const check = () => { requestGrowthRewardSync({ uid, studentId, ...(callSync ? { callSync } : {}) }); };
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [studentId, uid, enabled, callSync]);
}
