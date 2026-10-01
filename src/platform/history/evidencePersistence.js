import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase.js';

// Evidence events are written only by the Admin SDK (see firestore.rules,
// grades/{studentId}/evidenceEvents). This module only reads them.

export const fetchStudentEvidenceEvents = async (studentId, { maxEvents = 300 } = {}) => {
  if (!studentId) return [];
  const eventQuery = query(
    collection(db, 'grades', String(studentId), 'evidenceEvents'),
    orderBy('occurredAt', 'desc'),
    limit(Math.max(1, Math.min(1000, Number(maxEvents) || 300))),
  );
  const snapshot = await getDocs(eventQuery);
  return snapshot.docs.map((eventDoc) => ({
    ...eventDoc.data(),
    eventKey: eventDoc.data()?.eventKey || eventDoc.id,
  }));
};
