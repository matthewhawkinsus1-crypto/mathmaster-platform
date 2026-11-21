// The student's device writes each attempt fact once, to
// grades/{studentId}/attemptSignals/{id}, where only the student's teacher may
// read it (firestore.rules). The student's own screens never read it back, and
// no grade, attempt or mastery path does either
// (tests/platform/attemptSignalsNeverGrade.test.mjs).
//
// A failed write is dropped: a signal must never interrupt a student's work,
// and one that is missing costs a conversation, not a grade.

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { attemptSignalDocumentId, buildAttemptSignalRecord } from './attemptSignalFacts.js';

export const ATTEMPT_SIGNALS_SUBCOLLECTION = 'attemptSignals';
const FIRESTORE = { doc, setDoc, serverTimestamp };

// What this page has already sent: one fact is one document, and a second
// write of it would be refused by the rules (the first one stands).
const sent = new Set();
// How many facts this page has recorded per student and assignment: the Live
// view's heartbeat carries the count, so the teacher's tile reads the facts
// only for a student who has some (src/livePresence.js attemptSignalCount).
const counts = new Map();
const countKey = (studentId, assignmentId) => `${studentId}|${assignmentId}`;
const STORAGE_PREFIX = 'mm.attemptSignalCount.';

const storedCount = (key) => {
  try {
    return Math.max(0, Math.floor(Number(globalThis.sessionStorage?.getItem(`${STORAGE_PREFIX}${key}`)) || 0));
  } catch {
    return 0;
  }
};
const storeCount = (key, value) => {
  try {
    globalThis.sessionStorage?.setItem(`${STORAGE_PREFIX}${key}`, String(value));
  } catch {
    // A tab without storage keeps the count until it is reloaded.
  }
};

/** Facts recorded for this student on this assignment, in this tab. */
export const attemptSignalCount = (studentId, assignmentId) => {
  if (!studentId || !assignmentId) return 0;
  const key = countKey(studentId, assignmentId);
  if (!counts.has(key)) counts.set(key, storedCount(key));
  return counts.get(key);
};

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
export const recordAttemptSignal = async ({ db, studentId, assignmentId, questionIndex, activityRole = null, fact, duringClass = null, supports = null, store = FIRESTORE } = {}) => {
  const record = buildAttemptSignalRecord({ studentId, assignmentId, questionIndex, activityRole, fact, duringClass, supports });
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
  const key = countKey(record.studentId, record.assignmentId);
  const next = attemptSignalCount(record.studentId, record.assignmentId) + 1;
  counts.set(key, next);
  storeCount(key, next);
  return true;
};

/** For tests: forget what this page has sent and counted. */
export const resetAttemptSignalWriter = () => {
  sent.clear();
  counts.clear();
};
