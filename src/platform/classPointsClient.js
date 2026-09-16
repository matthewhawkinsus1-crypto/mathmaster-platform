import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

export const CLASS_POINTS_HISTORY_LIMIT = 10;
export const CLASS_POINTS_ANNOUNCEMENT_LIMIT = 10;

export const classPointAccountId = (studentId, classId) => {
  const student = String(studentId || '').trim().slice(0, 64);
  const cls = String(classId || '').trim().slice(0, 120);
  return `${student.length}:${student}:${cls}`;
};

export const emptyClassPointAccount = () => ({ balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 });

export const normalizeClassPointAccount = (value) => ({
  balance: Number(value?.balance) || 0,
  lifetimeEarned: Number(value?.lifetimeEarned) || 0,
  lifetimeSpent: Number(value?.lifetimeSpent) || 0,
});

const millis = (value) => {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const activeClassPointAnnouncements = (announcements, now = Date.now()) => (
  (announcements || []).filter((announcement) => millis(announcement.expiresAt) > now)
);

export const describeClassPointTransaction = (transaction = {}) => {
  const amount = Number(transaction.amount) || 0;
  const kind = transaction.sourceType === 'teacherReversal' || transaction.isReversal
    ? 'correction'
    : transaction.sourceType === 'rewardRedemption'
      ? 'spent'
      : transaction.sourceType === 'liveChallengeAchievement'
        ? 'challenge'
        : 'earned';
  return {
    amount,
    amountLabel: `${amount >= 0 ? '+' : '−'}${Math.abs(amount)}`,
    kind,
    kindLabel: kind === 'correction' ? 'Teacher correction'
      : kind === 'spent' ? 'Reward used'
        : kind === 'challenge' ? 'Live Challenge reward'
          : 'Earned',
    reasonLabel: String(transaction.reasonLabel || '').trim(),
  };
};

/**
 * Subscribe only to one authenticated student's wallet in one real class.
 * An incomplete identity returns a no-op without constructing any Firestore query.
 */
export const subscribeToStudentClassPoints = ({ db, studentId, classId, onAccount, onHistory, onError }) => {
  const currentStudentId = String(studentId || '').trim();
  const currentClassId = String(classId || '').trim();
  if (!currentStudentId || !currentClassId) return () => {};

  const accountRef = doc(db, 'classPointAccounts', classPointAccountId(currentStudentId, currentClassId));
  const historyQuery = query(
    collection(db, 'classPointTransactions'),
    where('studentId', '==', currentStudentId),
    where('classId', '==', currentClassId),
    orderBy('createdAt', 'desc'),
    limit(CLASS_POINTS_HISTORY_LIMIT),
  );
  const unsubAccount = onSnapshot(accountRef, (snapshot) => {
    onAccount(snapshot.exists() ? normalizeClassPointAccount(snapshot.data()) : emptyClassPointAccount());
  }, onError);
  const unsubHistory = onSnapshot(historyQuery, (snapshot) => {
    onHistory(snapshot.docs.map((entry) => entry.data()));
  }, onError);
  return () => { unsubAccount(); unsubHistory(); };
};

export const subscribeToClassPointAnnouncements = ({ db, classId, onAnnouncements, onError }) => {
  const currentClassId = String(classId || '').trim();
  if (!currentClassId) return () => {};
  const announcementsQuery = query(
    collection(db, 'classes', currentClassId, 'classPointAnnouncements'),
    orderBy('createdAt', 'desc'),
    limit(CLASS_POINTS_ANNOUNCEMENT_LIMIT),
  );
  return onSnapshot(announcementsQuery, (snapshot) => {
    // These public records are rendered as stored. They are never joined to a roster.
    onAnnouncements(activeClassPointAnnouncements(snapshot.docs.map((entry) => entry.data())));
  }, onError);
};
