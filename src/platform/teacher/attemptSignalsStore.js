// The teacher's reads of a student's attempt facts, and the one write a
// teacher may make to one: marking it reviewed (firestore.rules attemptSignals).
// Teacher code: the student's device has only the writer
// (src/platform/signals/attemptSignalWriter.js).

import { collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { ATTEMPT_SIGNALS_SUBCOLLECTION } from '../signals/attemptSignalWriter.js';
import { REVIEW_NOTE_MAX } from './attemptSignalsView.js';

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

/**
 * The teacher has reviewed this fact: who, when and, if they wrote one, a
 * short note. The fact is kept (firestore.rules allows no delete and one
 * review); it leaves "needs attention" and stays in the record.
 */
export const reviewAttemptSignal = async ({ db, studentId, signalId, teacherEmail, note = '' } = {}) => {
  const student = clean(studentId);
  const id = clean(signalId);
  // As signed in, unchanged: the rules compare it with the token's own email.
  const email = clean(teacherEmail);
  if (!db || !student || !id) throw new Error('A signal and its student are needed to mark it reviewed.');
  if (!email) throw new Error('A signed-in teacher email is required to mark a signal reviewed.');
  const words = clean(note).slice(0, REVIEW_NOTE_MAX);
  await updateDoc(doc(db, 'grades', student, ATTEMPT_SIGNALS_SUBCOLLECTION, id), {
    dismissedAt: serverTimestamp(),
    dismissedByEmail: email,
    ...(words ? { reviewNote: words } : {}),
  });
};

/*
 * ONE LISTENER PER STUDENT AND ASSIGNMENT, HOWEVER MANY PLACES READ IT.
 *
 * An assignment's results show a student's signals beside each question: a
 * dozen small notes on one screen, all reading the same few documents. They
 * share one watch here, started by the first reader and stopped with the last.
 */
const shared = new Map();
const EMPTY = Object.freeze({ signals: Object.freeze([]), failed: false, loaded: false });

export const sharedAttemptSignals = ({ db, studentId, assignmentId }) => {
  const key = `${clean(studentId)}|${clean(assignmentId)}`;
  const entry = () => shared.get(key);
  return {
    subscribe(listener) {
      if (!clean(studentId)) return () => {};
      if (!shared.has(key)) {
        const created = { state: EMPTY, listeners: new Set(), stop: null };
        shared.set(key, created);
        const publish = (state) => { created.state = state; created.listeners.forEach((each) => each()); };
        created.stop = watchAttemptSignals({
          db, studentId, assignmentId,
          onChange: (signals) => publish({ signals, failed: false, loaded: true }),
          onError: () => publish({ signals: [], failed: true, loaded: true }),
        });
      }
      entry().listeners.add(listener);
      return () => {
        const current = entry();
        if (!current) return;
        current.listeners.delete(listener);
        if (!current.listeners.size) { current.stop?.(); shared.delete(key); }
      };
    },
    read: () => entry()?.state || EMPTY,
  };
};
