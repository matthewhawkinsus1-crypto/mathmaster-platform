import { httpsCallable } from 'firebase/functions';
import {
  collection, doc, onSnapshot, query, where,
} from 'firebase/firestore';
import { functions } from '../../firebase.js';
import {
  CLASS_REWARD_CATALOGS_COLLECTION,
  CLASS_REWARD_REQUESTS_COLLECTION,
} from '../../../functions/shared/classRewardCatalog.mjs';

/*
 * CLASS REWARDS: THE FIRESTORE AND CALLABLE SEAM.
 *
 * A teacher's own non-academic redeemables (functions/shared/
 * classRewardCatalog.mjs). Reads are scoped exactly as firestore.rules allow
 * them, so a missing identity is a no-op, never a broad query:
 *
 *   catalog            one document, the student's or teacher's class
 *   student requests   this student, this class (theirs only)
 *   teacher pending    this class's PENDING requests, through the same
 *                      authorizedTeacherEmails field the ledger uses
 *
 * Every write is a callable (functions/lib/classRewardStore.js). The rules
 * forbid any client write to either collection, so a hidden button is never
 * the only thing stopping a student.
 */

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const withId = (entry) => ({ requestDocId: entry.id, ...entry.data() });

export const subscribeToClassRewardCatalog = ({ db, classId, onCatalog, onError = () => {} }) => {
  const cls = clean(classId, 120);
  if (!db || !cls) {
    onCatalog?.(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, CLASS_REWARD_CATALOGS_COLLECTION, cls),
    (snapshot) => onCatalog(snapshot.exists() ? snapshot.data() : null),
    onError,
  );
};

/** Every class reward request this student made in this class, newest first. */
export const subscribeToStudentClassRewardRequests = ({ db, studentId, classId, onRequests, onError = () => {} }) => {
  const student = clean(studentId, 64);
  const cls = clean(classId, 120);
  if (!db || !student || !cls) {
    onRequests?.([]);
    return () => {};
  }
  return onSnapshot(
    query(collection(db, CLASS_REWARD_REQUESTS_COLLECTION), where('studentId', '==', student), where('classId', '==', cls)),
    (snapshot) => onRequests(snapshot.docs.map(withId)),
    onError,
  );
};

/**
 * The class's pending requests, for its teacher. Equality filters only (no
 * orderBy), so it needs no composite index; the panel sorts them.
 */
export const subscribeToPendingClassRewardRequests = ({ db, classId, teacherEmail, onRequests, onError = () => {} }) => {
  const cls = clean(classId, 120);
  // As the token carries it: the rules compare this value to the token's email.
  const email = clean(teacherEmail, 320);
  if (!db || !cls || !email) {
    onRequests?.([]);
    return () => {};
  }
  return onSnapshot(
    query(
      collection(db, CLASS_REWARD_REQUESTS_COLLECTION),
      where('authorizedTeacherEmails', 'array-contains', email),
      where('classId', '==', cls),
      where('status', '==', 'pending'),
    ),
    (snapshot) => onRequests(snapshot.docs.map(withId)),
    onError,
  );
};

const call = (name) => {
  const callable = httpsCallable(functions, name);
  return async (payload) => (await callable(payload)).data || {};
};

const saveCatalogCallable = call('saveClassRewardCatalog');
const redeemCallable = call('redeemClassReward');
const resolveCallable = call('resolveClassRewardRequest');

/** One id per press of "Use N points", reused by every retry of that press. */
export const newClassRewardRequestId = () => {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `cr-${random}`;
};

export const saveClassRewardCatalog = ({ classId, items, baseRevision = null }) => saveCatalogCallable({
  classId: clean(classId, 120), items, baseRevision,
});

export const redeemClassReward = ({ itemId, requestId, expectedCost = null }) => redeemCallable({
  itemId: clean(itemId, 40), requestId: clean(requestId), expectedCost,
});

export const resolveClassRewardRequest = ({ requestDocId, resolution, reason = null }) => resolveCallable({
  requestDocId: clean(requestDocId), resolution, reason,
});
