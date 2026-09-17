import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase.js';

export const listTeacherTransferSnapshots = async ({ teacherUid, classIds = [], isRootAdmin = false }) => {
  const snapshots = await Promise.all([...new Set(classIds.filter(Boolean))].map((classId) => getDocs(query(
    collection(db, 'gradeTransferSnapshots'),
    where('classId', '==', classId),
    ...(isRootAdmin ? [] : [where('teacherUid', '==', teacherUid)]),
  ))));
  const byId = new Map();
  snapshots.flatMap((snapshot) => snapshot.docs).forEach((entry) => byId.set(entry.id, { id: entry.id, ...entry.data() }));
  return [...byId.values()];
};

export const persistTransferSnapshot = async (snapshot) => {
  const ref = doc(db, 'gradeTransferSnapshots', snapshot.transferId);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) {
      if (JSON.stringify(existing.data().rows) !== JSON.stringify(snapshot.rows)) throw new Error('Transfer id already belongs to a different immutable snapshot.');
      return;
    }
    transaction.set(ref, { ...snapshot, createdAt: serverTimestamp() });
  });
  return snapshot.transferId;
};

/** One bounded query per authorized class, never one read per roster row. */
export const listTeacherPracticePassRedemptions = async (classIds = []) => {
  const snapshots = await Promise.all([...new Set(classIds.filter(Boolean))].map((classId) => getDocs(query(
    collection(db, 'classPointRewardRedemptions'), where('classId', '==', classId),
  ))));
  const result = new Set();
  snapshots.flatMap((snapshot) => snapshot.docs).forEach((entry) => {
    const value = entry.data();
    if (value.rewardCode === 'practicePass' && value.status === 'redeemed') {
      result.add(`${value.studentId}__${value.classId}__${value.assignmentId}`);
    }
  });
  return result;
};

export const confirmTransferUploaded = async ({ transferId, actorUid, actorEmail }) => {
  const ref = doc(db, 'gradeTransferSnapshots', transferId);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists()) throw new Error('Export snapshot was not found.');
    const data = existing.data();
    if (data.teacherUid !== actorUid) throw new Error('Only the exporting teacher may confirm this upload.');
    if (data.uploadConfirmedAt) return;
    transaction.update(ref, { uploadConfirmedAt: serverTimestamp(), uploadConfirmedByUid: actorUid, uploadConfirmedByEmail: actorEmail });
  });
};
