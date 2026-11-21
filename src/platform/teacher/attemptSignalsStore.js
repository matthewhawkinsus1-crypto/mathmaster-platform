// The teacher's reads of a student's attempt facts, and the one write a
// teacher may make to one: dismissing it (firestore.rules attemptSignals).
// Teacher code: the student's device has only the writer
// (src/platform/signals/attemptSignalWriter.js).

import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { ATTEMPT_SIGNALS_SUBCOLLECTION } from '../signals/attemptSignalWriter.js';

const clean = (value) => String(value ?? '').trim();

/**
 * Watch one student's signals, optionally for one assignment. Calls
 * `onChange(signals)` with plain records ({ id, ...fields }); a read that is
 * refused or fails reports an empty list through `onError`.
 */
export const watchAttemptSignals = ({ db, studentId, assignmentId = null, onChange, onError = null } = {}) => {
  const student = clean(studentId);
  if (!db || !student || typeof onChange !== 'function') return () => {};
  const signals = collection(db, 'grades', student, ATTEMPT_SIGNALS_SUBCOLLECTION);
  const target = clean(assignmentId) ? query(signals, where('assignmentId', '==', clean(assignmentId))) : signals;
  return onSnapshot(
    target,
    (snapshot) => onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))),
    (error) => {
      onChange([]);
      onError?.(error);
    },
  );
};

/** The teacher has seen this fact and does not need it again. */
export const dismissAttemptSignal = async ({ db, studentId, signalId, teacherEmail } = {}) => {
  const student = clean(studentId);
  const id = clean(signalId);
  const email = clean(teacherEmail).toLowerCase();
  if (!db || !student || !id) throw new Error('A signal and its student are needed to dismiss it.');
  if (!email) throw new Error('A signed-in teacher email is required to dismiss a signal.');
  await updateDoc(doc(db, 'grades', student, ATTEMPT_SIGNALS_SUBCOLLECTION, id), {
    dismissedAt: serverTimestamp(),
    dismissedByEmail: email,
  });
};
