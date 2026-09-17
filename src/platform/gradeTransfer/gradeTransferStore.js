import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase.js';

export const listTeacherTransferSnapshots = async (teacherUid) => {
  const result = await getDocs(query(collection(db, 'gradeTransferSnapshots'), where('teacherUid', '==', teacherUid)));
  return result.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
};

export const persistTransferSnapshot = async (snapshot) => {
  const ref = doc(db, 'gradeTransferSnapshots', snapshot.transferId);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) {
      if (JSON.stringify(existing.data().rows) !== JSON.stringify(snapshot.rows)) throw new Error('Transfer id already belongs to a different immutable snapshot.');
      return;
    }
    transaction.set(ref, snapshot);
  });
  return snapshot.transferId;
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
