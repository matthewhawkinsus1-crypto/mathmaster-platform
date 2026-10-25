/*
 * THE TEST OPEN IN TESTS & EXAMS (NV14, finding A1-10).
 *
 * The address names the list (/tests), never one test: a secure-exam session
 * never goes in a URL (app/routes/appUrl.js). So a reload mid-test landed on
 * the list, and the student had to find their test again. Which test was open
 * is kept IN THE LIST'S OWN HISTORY ENTRY instead, and the list shows that
 * test first with its button focused: one key press or tap resumes it. Never
 * by itself: the test's full screen needs the student's own tap
 * (SecureExamContainer), and a reload ends the secure exam's hold on Back
 * (secureExamPresence.js) until they press it.
 *
 * Entry-only (browserHistory.js), written only while the current entry IS
 * Tests & Exams, stamped with the student and read back only for that
 * student, like Assignments' view (assignmentsCenterMemory.js). Nothing is
 * kept but the session's id.
 */
import { SECURE_EXAMS_VIEW_STATE_KEY, readStudentRouteState } from './browserHistory.js';

const MAX_ID = 128;

const browserHistory = () => {
  try { return typeof window !== 'undefined' && window.history ? window.history : null; } catch { return null; }
};

const clean = (value) => String(value ?? '').trim().slice(0, MAX_ID);
const isTestsEntry = (state) => {
  const route = readStudentRouteState(state);
  return route?.surface === 'dashboard' && route.dashboardMode === 'secureExams';
};

/** The id of the test this entry says was open, or null. */
export const readOpenSecureExam = (studentId, history = browserHistory()) => {
  const id = clean(studentId);
  const state = history?.state;
  if (!id || !state || typeof state !== 'object' || !isTestsEntry(state)) return null;
  const open = state[SECURE_EXAMS_VIEW_STATE_KEY];
  if (!open || typeof open !== 'object' || Array.isArray(open) || open.studentId !== id) return null;
  return clean(open.examSessionId) || null;
};

/** Remember the test the student opened from the list; null forgets it. */
export const writeOpenSecureExam = (studentId, examSessionId, history = browserHistory(), href = null) => {
  const id = clean(studentId);
  const state = history?.state;
  if (!id || !history || !state || typeof state !== 'object' || !isTestsEntry(state)) return;
  const next = { ...state };
  const session = clean(examSessionId);
  if (session) next[SECURE_EXAMS_VIEW_STATE_KEY] = { studentId: id, examSessionId: session };
  else delete next[SECURE_EXAMS_VIEW_STATE_KEY];
  try {
    history.replaceState(next, '', href ?? (typeof window !== 'undefined' ? window.location.href : undefined));
  } catch { /* best effort */ }
};

/** The list's rows with that test first; every other row keeps its place. */
export const withOpenTestFirst = (sessions = [], examSessionId = null) => {
  const rows = Array.isArray(sessions) ? sessions : [];
  const at = examSessionId ? rows.findIndex((session) => session?.examSessionId === examSessionId) : -1;
  if (at <= 0) return rows;
  return [rows[at], ...rows.slice(0, at), ...rows.slice(at + 1)];
};
