// The student's weekly mastery snapshots (studentMasteryHistory/{studentId}),
// read once when My Progress opens.
//
// Written only by the mastery trigger, in the same transaction as the profile
// (functions/shared/masteryHistory.mjs), and readable exactly as the profile
// is: the student, an authorized teacher, the root admin (firestore.rules).
// One-shot rather than live: the document changes after every answer, and
// nobody is answering questions while looking at their progress.

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { MASTERY_HISTORY_COLLECTION } from '../../../functions/shared/masteryHistory.mjs';

/** The history document, or null when the student has none yet. */
export const fetchStudentMasteryHistory = async (studentId) => {
  const id = String(studentId || '').trim();
  if (!id) return null;
  const snapshot = await getDoc(doc(db, MASTERY_HISTORY_COLLECTION, id));
  return snapshot.exists() ? snapshot.data() : null;
};
