// The student's device writes each attempt fact once, to
// grades/{studentId}/attemptSignals/{id}, where only the student's teacher may
// read it (firestore.rules). The student's own screens never read it back, and
// no grade, attempt or mastery path does either
// (tests/platform/attemptSignalsNeverGrade.test.mjs).
//
// A failed write is dropped: a signal must never interrupt a student's work,
// and one that is missing costs a conversation, not a grade.

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { attemptSignalDocumentId, buildAttemptSignalRecord, supportsInEffect } from './attemptSignalFacts.js';
import { attemptSignalCount, countAttemptSignal, resetSignalPageNotes } from './signalPageNotes.js';

// The count for the Live heartbeat lives in signalPageNotes.js, which App
// reads before this module has loaded.
export { attemptSignalCount };

export const ATTEMPT_SIGNALS_SUBCOLLECTION = 'attemptSignals';
const FIRESTORE = { doc, setDoc, serverTimestamp };

// What this page has already sent: one fact is one document, and a second
// write of it would be refused by the rules (the first one stands).
const sent = new Set();
/**
 * Record one fact. Resolves true when it was written; false when it was a
 * repeat, could not be built, or the write failed.
 *
 * The count moves only when the write lands. A write the rules refuse is the
 * fact already on file from an earlier visit (the first one stands): it is
 * not sent again. Any other failure leaves the fact free to be sent the next
 * time it is raised.
 */
// `store` is Firestore's own doc, setDoc and serverTimestamp; a test passes its own.
// `profile` (the student's support profile) gives the supports in effect when
// `supports` is not given outright.
export const recordAttemptSignal = async ({ db, studentId, assignmentId, questionIndex, activityRole = null, fact, duringClass = null, supports = null, profile = undefined, store = FIRESTORE } = {}) => {
  const record = buildAttemptSignalRecord({ studentId, assignmentId, questionIndex, activityRole, fact, duringClass, supports: supports ?? (profile === undefined ? null : supportsInEffect(profile)) });
  if (!db || !record) return false;
  const id = attemptSignalDocumentId(record);
  const sentKey = `${record.studentId}|${id}`;
  if (sent.has(sentKey)) return false;
  sent.add(sentKey);
  try {
    await store.setDoc(store.doc(db, 'grades', record.studentId, ATTEMPT_SIGNALS_SUBCOLLECTION, id), { ...record, recordedAt: store.serverTimestamp() });
  } catch (error) {
    if (error?.code !== 'permission-denied') sent.delete(sentKey);
    return false;
  }
  countAttemptSignal(record.studentId, record.assignmentId);
  return true;
};

/** For tests: forget what this page has sent and counted. */
export const resetAttemptSignalWriter = () => {
  sent.clear();
  resetSignalPageNotes();
};
