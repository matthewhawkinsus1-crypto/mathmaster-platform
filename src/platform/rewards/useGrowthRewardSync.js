import { useEffect } from 'react';

/*
 * ASK THE SERVER TO PAY ANY GROWTH REWARDS THIS STUDENT HAS EARNED.
 *
 * Growth rewards (a better retest, finished corrections, a weekly Path goal
 * met on time, a skill mastered) are decided and delivered entirely on the
 * server, from records the student cannot write
 * (functions/lib/growthRewards.js). This hook only says "now is a good time to
 * check": once per browser session per student, when the student app opens.
 * New rewards then arrive through the wallet listeners that already exist.
 *
 * It is deliberately silent. A failed or refused sync costs the student
 * nothing — every award has a fixed id, so the next session's sync pays
 * exactly what this one would have — and an error banner about a background
 * check would only worry them. The session flag is set BEFORE the call, so a
 * failing server is not asked again on every re-render.
 *
 * The callable is loaded lazily so this module stays importable without a
 * Firebase app (tests read the guard below directly).
 */

export const GROWTH_SYNC_STORAGE_PREFIX = 'mm.growthRewardSync.';

const clean = (value) => String(value ?? '').trim().slice(0, 64);

const sessionStore = () => {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

/** Whether this browser session has already asked for `studentId`. */
export const growthSyncAlreadyRequested = (studentId, storage = sessionStore()) => {
  const id = clean(studentId);
  if (!id) return true;
  try {
    return Boolean(storage?.getItem(`${GROWTH_SYNC_STORAGE_PREFIX}${id}`));
  } catch {
    // Storage that throws (a private window, blocked site data) cannot
    // remember, so it would ask on every mount; the server's own throttle
    // keeps that cheap, and asking once per mount is still correct.
    return false;
  }
};

const markRequested = (studentId, storage) => {
  try {
    storage?.setItem(`${GROWTH_SYNC_STORAGE_PREFIX}${clean(studentId)}`, String(Date.now()));
  } catch {
    // See growthSyncAlreadyRequested.
  }
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
 * Request one sync for `studentId` unless this session already did. Resolves
 * to the server's answer, or null when it did not ask or the call failed.
 * Never throws.
 */
export const requestGrowthRewardSync = async ({ studentId, storage = sessionStore(), callSync = defaultCallSync } = {}) => {
  const id = clean(studentId);
  if (!id || growthSyncAlreadyRequested(id, storage)) return null;
  markRequested(id, storage);
  try {
    return await callSync();
  } catch (error) {
    console.warn('Growth rewards could not be checked this time:', error?.code || error?.message || error);
    return null;
  }
};

/**
 * Wire-up: call from the signed-in student's app shell with their verified
 * studentId. `enabled` lets the caller hold it until the student's profile has
 * loaded.
 */
export function useGrowthRewardSync(studentId, { enabled = true, callSync } = {}) {
  useEffect(() => {
    if (!enabled || !clean(studentId)) return;
    requestGrowthRewardSync({ studentId, ...(callSync ? { callSync } : {}) });
  }, [studentId, enabled, callSync]);
}
