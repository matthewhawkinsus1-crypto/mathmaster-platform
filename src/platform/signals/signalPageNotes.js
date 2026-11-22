// THE TWO THINGS THE APP TELLS THE TEACHER SIGNALS BEFORE THEIR CODE LOADS.
//
// The recorder (attemptSignalFacts.js, attemptSignalWriter.js) arrives with
// the question engine, not with a student's first load
// (scripts/check-first-load-budget.mjs). This module is what App and the
// assignment screen need at once, and it is a few lines:
//
//   - how many facts this tab has recorded per student and assignment, for
//     the Live heartbeat (a count, never a fact);
//   - when the platform last opened one of its own links in a new tab (a
//     study sheet, a reteach resource), so the absence that follows is not
//     taken for the student leaving the page.
//
// It holds no response and reads no grade, and nothing that grades reads it.

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

/** Facts recorded for this student on this assignment, in this tab. */
export const attemptSignalCount = (studentId, assignmentId) => {
  if (!studentId || !assignmentId) return 0;
  const key = countKey(studentId, assignmentId);
  if (!counts.has(key)) counts.set(key, storedCount(key));
  return counts.get(key);
};

/** One more fact was written (attemptSignalWriter.js, when its write lands). */
export const countAttemptSignal = (studentId, assignmentId) => {
  const key = countKey(studentId, assignmentId);
  const next = attemptSignalCount(studentId, assignmentId) + 1;
  counts.set(key, next);
  try {
    globalThis.sessionStorage?.setItem(`${STORAGE_PREFIX}${key}`, String(next));
  } catch {
    // A tab without storage keeps the count until it is reloaded.
  }
  return next;
};

let platformLinkAt = 0;
/** The platform opened one of its own links in a new tab, now. */
export const notePlatformLinkOpened = (nowValue = Date.now()) => { platformLinkAt = Number(nowValue) || 0; };
/** When it last did (0: never), for the page clock. */
export const lastPlatformLinkAt = () => platformLinkAt;

/** For tests: forget the counts and the link. */
export const resetSignalPageNotes = () => { counts.clear(); platformLinkAt = 0; };
