import { httpsCallable } from 'firebase/functions';
import {
  collection, limit as fsLimit, onSnapshot, orderBy, query, where,
} from 'firebase/firestore';
import { functions } from '../firebase.js';

// Class Points teacher-side seam: query/callable plumbing for the reward
// ledger PR #253 already built server-side. See functions/shared/
// classPoints.mjs for the domain model this mirrors.
//
// MAX_AWARD_AMOUNT and REASON_CODES below cannot be IMPORTED from
// functions/shared/classPoints.mjs, because that file pulls in node:crypto
// for classPointIdempotencyKey and cannot be bundled for the browser (the way
// functions/shared/classModel.mjs already is, elsewhere in this app). Values
// this module cares about are duplicated instead — MAX_AWARD_AMOUNT exactly,
// and REASON_CODES as the teacher-choosable SUBSET of the server's full set
// (it deliberately excludes `liveChallengeAchievement`, which is reserved for
// a future automated bonus and is never a manual teacher choice here).
// tests/platform/classPointsClient.test.mjs asserts REASON_CODES stays a
// subset of the server's list and MAX_AWARD_AMOUNT stays equal to it, so
// server-side drift cannot silently strand this UI.
//
// This module never writes classPointAccounts/classPointTransactions/
// classPointAnnouncements directly — firestore.rules forbids it outright, and
// the two callables below are the only door. It never reads or writes
// grades, presence, mastery/evidence, or Google Classroom state.

export const REASON_CODES = Object.freeze([
  'participation',
  'explanation',
  'demonstration',
  'helpedClass',
  'perseverance',
  'teacherBonus',
  'custom',
]);

const REASON_CODE_SET = new Set(REASON_CODES);

export const DEFAULT_REASON_LABELS = Object.freeze({
  participation: 'Participation',
  explanation: 'Great explanation',
  demonstration: 'Demonstrated it for the class',
  helpedClass: 'Helped the class',
  perseverance: 'Perseverance',
  teacherBonus: 'Teacher bonus',
  custom: 'Custom',
});

export const MAX_AWARD_AMOUNT = 20;
export const QUICK_AWARD_AMOUNTS = Object.freeze([1, 2, 3, 5]);
export const DEFAULT_REVERSAL_REASON = 'Teacher corrected an accidental award';
export const CLASS_POINTS_HISTORY_LIMIT = 40;

const CLASS_POINT_ACCOUNTS_COLLECTION = 'classPointAccounts';
const CLASS_POINT_TRANSACTIONS_COLLECTION = 'classPointTransactions';

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

export const createClassPointsRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * One requestId per INTENDED action (an award, or a reversal), independent of
 * how many times the callable is actually invoked for it.
 *
 * `next()` returns the current id, minting one only the first time it is
 * called — so a retry after an uncertain failure (`resolveSuccess` never
 * ran) reuses the exact same id, and a double click while a request is
 * already pending gets the same id too. Only `resolveSuccess()`, called once
 * a callable definitely returns success, clears it so the NEXT intended
 * action mints a fresh one. `reset()` is for a teacher who changes what they
 * are choosing (a different amount, a different student) before submitting —
 * that is a different intended action, not a retry of the old one.
 */
export const createRequestIdController = (generateId = createClassPointsRequestId) => {
  let currentId = null;
  return {
    next: () => {
      if (!currentId) currentId = generateId();
      return currentId;
    },
    peek: () => currentId,
    resolveSuccess: () => { currentId = null; },
    reset: () => { currentId = null; },
  };
};

/** Validate and shape one `awardClassPoints` callable payload. Throws a plain Error with a teacher-facing message. */
export function buildAwardPayload({
  studentId, classId, amount, reasonCode, reasonLabel, requestId, announce = false,
} = {}) {
  const student = cleanText(studentId, 64);
  if (!student) throw new Error('Choose a student before awarding Class Points.');

  const cls = cleanText(classId, 120);
  if (!cls) throw new Error('Choose an active class before awarding Class Points.');

  const amountNumber = Number(amount);
  if (!Number.isInteger(amountNumber) || amountNumber <= 0) {
    throw new Error('Choose a whole-number amount to award.');
  }
  if (amountNumber > MAX_AWARD_AMOUNT) {
    throw new Error(`A single award cannot exceed ${MAX_AWARD_AMOUNT} Class Points.`);
  }

  const code = cleanText(reasonCode, 40);
  if (!REASON_CODE_SET.has(code)) throw new Error('Choose a reason for this award.');

  const label = cleanText(reasonLabel, 140) || (code === 'custom' ? '' : DEFAULT_REASON_LABELS[code]);
  if (!label) throw new Error('Add a short reason for a custom award.');

  const id = cleanText(requestId, 200);
  if (!id) throw new Error('Missing a request id for this award — this is a bug, not a teacher-fixable problem.');

  return {
    studentId: student,
    classId: cls,
    amount: amountNumber,
    reasonCode: code,
    reasonLabel: label,
    requestId: id,
    announce: Boolean(announce),
  };
}

/** Validate and shape one `reverseClassPointAward` callable payload. */
export function buildReversalPayload({ transactionId, requestId, reason = DEFAULT_REVERSAL_REASON } = {}) {
  const txId = cleanText(transactionId, 200);
  if (!txId) throw new Error('Missing the award to reverse.');

  const id = cleanText(requestId, 200);
  if (!id) throw new Error('Missing a request id for this reversal — this is a bug, not a teacher-fixable problem.');

  return {
    transactionId: txId,
    requestId: id,
    reason: cleanText(reason, 300) || DEFAULT_REVERSAL_REASON,
  };
}

const call = (name) => {
  const callable = httpsCallable(functions, name);
  return async (payload) => (await callable(payload)).data || {};
};

export const awardClassPoints = call('awardClassPoints');
export const reverseClassPointAward = call('reverseClassPointAward');

/** The bounded, indexed query a teacher's own class-scoped balances live at (see firestore.indexes.json). */
export const classPointAccountsQuery = (firestore, { teacherEmail, classId }) => query(
  collection(firestore, CLASS_POINT_ACCOUNTS_COLLECTION),
  where('authorizedTeacherEmails', 'array-contains', teacherEmail),
  where('classId', '==', classId),
);

/** The bounded, indexed query a teacher's recent class-scoped ledger activity lives at (see firestore.indexes.json). */
export const classPointHistoryQuery = (firestore, { teacherEmail, classId, historyLimit = CLASS_POINTS_HISTORY_LIMIT }) => query(
  collection(firestore, CLASS_POINT_TRANSACTIONS_COLLECTION),
  where('authorizedTeacherEmails', 'array-contains', teacherEmail),
  where('classId', '==', classId),
  orderBy('createdAt', 'desc'),
  fsLimit(historyLimit),
);

/**
 * studentId -> balance, from a `classPointAccounts` snapshot's docs. A
 * student who has never been awarded anything has no document at all, so
 * this map deliberately omits them — `classPointsBalanceFor` is what turns a
 * missing entry into the required "⭐ 0 pts" display, rather than this
 * function inventing a zero entry for every roster student it was never
 * handed.
 */
export function accountDocsToBalanceMap(docs = []) {
  const map = {};
  (docs || []).forEach((entry) => {
    const data = typeof entry?.data === 'function' ? entry.data() : (entry?.data || entry);
    const studentId = cleanText(data?.studentId, 64);
    if (!studentId) return;
    map[studentId] = {
      balance: Number.isInteger(data?.balance) ? data.balance : 0,
      updatedAt: data?.updatedAt || null,
    };
  });
  return map;
}

/** A student's authoritative live balance — 0 when no account document exists yet. Never sum history to compute this. */
export function classPointsBalanceFor(balancesByStudentId, studentId) {
  const entry = balancesByStudentId?.[cleanText(studentId, 64)];
  return Number.isInteger(entry?.balance) ? entry.balance : 0;
}

/**
 * Subscribe to the active class's live balances. A Class Points read failure
 * must never break Live Classroom, so a subscription error is reported to
 * `onError` (the caller shows "unavailable") rather than thrown, and a
 * missing teacherEmail/classId is a silent no-op rather than an invalid query.
 */
export function watchClassPointAccounts(firestore, { teacherEmail, classId }, onValue, onError = () => {}) {
  if (!firestore || !teacherEmail || !classId) {
    onValue({});
    return () => {};
  }
  return onSnapshot(
    classPointAccountsQuery(firestore, { teacherEmail, classId }),
    (snapshot) => onValue(accountDocsToBalanceMap(snapshot.docs)),
    onError,
  );
}

/** Transaction docs, id attached, in the query's own (newest-first) order. */
export function historyDocsToTransactions(docs = []) {
  return (docs || []).map((entry) => ({
    id: entry.id,
    ...(typeof entry.data === 'function' ? entry.data() : (entry.data || entry)),
  }));
}

/**
 * The transactionIds that already have a live compensating reversal visible
 * in this bounded window. A teacher award is reversible only while its id is
 * absent from this set — see `isReversibleTeacherAward`.
 */
export function reversedAwardTransactionIds(transactions = []) {
  const ids = new Set();
  (transactions || []).forEach((entry) => {
    if (entry?.sourceType === 'teacherReversal' && entry?.reversalOf) ids.add(String(entry.reversalOf));
  });
  return ids;
}

/** Whether `transaction` is presently offerable for "Reverse award" — a live teacher award not already reversed in this window. */
export function isReversibleTeacherAward(transaction, reversedIds) {
  return transaction?.sourceType === 'teacherAward' && !reversedIds?.has(String(transaction?.id));
}

/** Subscribe to the active class's recent, bounded Class Points ledger activity. Same never-throw contract as `watchClassPointAccounts`. */
export function watchClassPointHistory(firestore, { teacherEmail, classId, historyLimit }, onValue, onError = () => {}) {
  if (!firestore || !teacherEmail || !classId) {
    onValue([]);
    return () => {};
  }
  return onSnapshot(
    classPointHistoryQuery(firestore, { teacherEmail, classId, historyLimit }),
    (snapshot) => onValue(historyDocsToTransactions(snapshot.docs)),
    onError,
  );
}

export const reasonLabelFor = (reasonCode, reasonLabel) => (
  cleanText(reasonLabel, 140) || DEFAULT_REASON_LABELS[reasonCode] || 'Class Points award'
);

/** A short, teacher-facing label for where a ledger entry came from — never the raw sourceType enum. */
export const sourceTypeLabel = (transaction = {}) => {
  switch (transaction.sourceType) {
    case 'teacherReversal': return 'Reversal';
    case 'liveChallengeAchievement': return 'Live Challenge';
    case 'rewardRedemption': return 'Reward redeemed';
    default: return 'Teacher award';
  }
};

/** Millisecond epoch from a Firestore Timestamp, an ISO string, or a plain number — never throws on a weird shape. */
export const classPointsTimestampMillis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};
