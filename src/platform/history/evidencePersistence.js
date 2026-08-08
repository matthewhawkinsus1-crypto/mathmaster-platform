import { collection, doc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';

export const writeImmutableEvidenceEvent = async (studentId, event) => {
  if (!studentId || !event?.eventKey) throw new Error('Evidence events require a studentId and eventKey.');
  const eventRef = doc(db, 'grades', String(studentId), 'evidenceEvents', String(event.eventKey));
  await setDoc(eventRef, event);
  return event.eventKey;
};

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
