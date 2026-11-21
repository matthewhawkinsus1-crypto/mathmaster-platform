// The teacher's reads of a student's attempt facts, and the one write a
// teacher may make to one: dismissing it (firestore.rules attemptSignals).
// Teacher code: the student's device has only the writer
// (src/platform/signals/attemptSignalWriter.js).

import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { ATTEMPT_SIGNALS_SUBCOLLECTION } from '../signals/attemptSignalWriter.js';

const clean = (value) => String(value ?? '').trim();

export const ASSIGNMENT_SIGNAL_LIMIT = 60;
export const STUDENT_SIGNAL_LIMIT = 200;

/**
 * Watch one student's signals, optionally for one assignment. Calls
 * `onChange(signals)` with plain records ({ id, ...fields }); a read that is
 * refused or fails empties the list and is reported through `onError`, so the
 * screen can say so and not "nothing is waiting".
 */
export const watchAttemptSignals = ({ db, studentId, assignmentId = null, onChange, onError = null } = {}) => {
  const student = clean(studentId);
  if (!db || !student || typeof onChange !== 'function') return () => {};
  const signals = collection(db, 'grades', student, ATTEMPT_SIGNALS_SUBCOLLECTION);
  // Bounded either way. One assignment's facts: at most a few per question.
  // Every assignment's: the newest, by the server's time (a single-field
  // order, so no index beyond the automatic one).
  const target = clean(assignmentId)
    ? query(signals, where('assignmentId', '==', clean(assignmentId)), limit(ASSIGNMENT_SIGNAL_LIMIT))
    : query(signals, orderBy('recordedAt', 'desc'), limit(STUDENT_SIGNAL_LIMIT));
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
  // As signed in, unchanged: the rules compare it with the token's own email.
  const email = clean(teacherEmail);
  if (!db || !student || !id) throw new Error('A signal and its student are needed to dismiss it.');
  if (!email) throw new Error('A signed-in teacher email is required to dismiss a signal.');
  await updateDoc(doc(db, 'grades', student, ATTEMPT_SIGNALS_SUBCOLLECTION, id), {
    dismissedAt: serverTimestamp(),
    dismissedByEmail: email,
  });
};
