// Reading and saving a student's CCMR plan (studentCcmrPlans/{studentId}).
//
// The plan is server state. It is read live, so a goal chosen on one
// Chromebook is there on the next, and a teacher's read-only view shows the
// student's own plan. It is written only through the setMyCcmrPlan callable —
// the Firestore rules refuse every browser write — which validates it with
// functions/shared/ccmrPlan.mjs.
//
// THE OLD BROWSER COPY. Goals used to be kept in localStorage under
// `mathmaster:ccmrGoals:<studentId>`. This module can still READ that key and
// REMOVE it, so My Math Path can move a student's earlier choice to the server
// once. Nothing writes it any more.

import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase.js';
import {
  CCMR_PLAN_COLLECTION, isCcmrFramework, normalizeStoredCcmrPlan,
} from '../../../functions/shared/ccmrPlan.mjs';

export const LEGACY_CCMR_GOAL_STORAGE_PREFIX = 'mathmaster:ccmrGoals:';

/**
 * Calls onChange with { plan, exists, fromCache } — `plan` is null when the
 * student has not saved one. Metadata changes are included so a reply first
 * served from the offline cache is followed by the server's confirmation:
 * only the server can say "there is no plan", and the migration waits for it.
 */
export const subscribeStudentCcmrPlan = ({ studentId, onChange, onError } = {}) => {
  if (!studentId || typeof onChange !== 'function') return () => {};
  return onSnapshot(
    doc(db, CCMR_PLAN_COLLECTION, String(studentId)),
    { includeMetadataChanges: true },
    (snapshot) => onChange({
      plan: snapshot.exists() ? normalizeStoredCcmrPlan(snapshot.data()) : null,
      exists: snapshot.exists(),
      fromCache: snapshot.metadata?.fromCache === true,
    }),
    (error) => onError?.(error),
  );
};

/** Save the signed-in student's plan. Resolves to the plan the server stored. */
export const saveMyCcmrPlan = async (request) => {
  const call = httpsCallable(functions, 'setMyCcmrPlan');
  const result = await call(request);
  return normalizeStoredCcmrPlan(result?.data?.plan);
};

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Private browsing and blocked storage throw on access rather than
    // returning null; neither is a reason to break the screen.
    return null;
  }
};

/** Goals an older MathMaster kept in this browser for this student, if any. */
export const readLegacyCcmrGoals = (studentId) => {
  if (!studentId) return [];
  try {
    const raw = storage()?.getItem(`${LEGACY_CCMR_GOAL_STORAGE_PREFIX}${studentId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isCcmrFramework) : [];
  } catch {
    return [];
  }
};

/** Forget the browser copy, once the server holds the plan. */
export const clearLegacyCcmrGoals = (studentId) => {
  if (!studentId) return;
  try {
    storage()?.removeItem(`${LEGACY_CCMR_GOAL_STORAGE_PREFIX}${studentId}`);
  } catch {
    // Storage that cannot be read cannot hold a stale copy either.
  }
};
