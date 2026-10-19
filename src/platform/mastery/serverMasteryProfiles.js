// The student's server mastery document (studentMasteryProfiles/{studentId}),
// live. The background trigger rewrites it a moment after each answer, so a
// subscription is what lets the Path map, Recommended and the session recap
// show a skill moving when the update lands rather than on the next reload.

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase.js';

export const STUDENT_MASTERY_PROFILES_COLLECTION = 'studentMasteryProfiles';

/** Calls onChange with the `profiles` map ({} when the document is absent). */
export const subscribeStudentServerMasteryProfiles = ({ studentId, onChange, onError } = {}) => {
  if (!studentId || typeof onChange !== 'function') return () => {};
  return onSnapshot(
    doc(db, STUDENT_MASTERY_PROFILES_COLLECTION, String(studentId)),
    (snapshot) => onChange(snapshot.exists() ? (snapshot.data()?.profiles || {}) : {}),
    (error) => onError?.(error),
  );
};
