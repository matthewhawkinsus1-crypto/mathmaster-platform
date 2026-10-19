/*
 * WHAT COUNTS AS A FINISHED WEEKLY PATH SESSION — ONE DEFINITION.
 *
 * Three screens answer "how many of this week's sessions are done": the
 * student's weekly panel, the teacher's class table and the Google Classroom
 * publisher. The last two counted a `pathSessions` document whose status is
 * "completed"; the student panel counted any session that produced one
 * finalized evidence event. A student one question into a five-question
 * session saw the slot ticked, a "Grade so far" and the 🎉 — and Classroom then
 * received a lower grade on Monday. Nobody could tell which number was real.
 *
 * Everything that turns a session document into a weekly completion now goes
 * through this module, so the three can only disagree if they are handed
 * different sessions. Pure: no Firestore, no network. `displayTeks` is passed
 * in because the canonical/display TEKS helpers live in CommonJS code.
 */

const DAY = 24 * 60 * 60 * 1000;

// One day past the UTC week. The week closes at midnight in the school's own
// timezone, which is early Monday in UTC, so a window that stopped at the UTC
// boundary would drop every session finished on Sunday evening. Sessions pulled
// in from the next week cannot be miscounted: matching is by frozen slot key
// and weekKey, not by timestamp.
export const WEEKLY_COMPLETION_WINDOW_DAYS = 8;

export const weeklyCompletionWindow = (weekKey) => {
  const start = Date.parse(`${String(weekKey || '')}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekKey || '')) || !Number.isFinite(start)) return null;
  return { start, end: start + WEEKLY_COMPLETION_WINDOW_DAYS * DAY };
};

/** A session counts toward the week only when the server marked it completed. */
export const isCountedWeeklyPathSession = (session) => session?.status === 'completed';

const accuracyOf = (summary = {}) => {
  const completed = Number(summary?.completedQuestions || 0);
  const correct = Number(summary?.correctQuestions || 0);
  return completed > 0 ? Math.max(0, Math.min(1, correct / completed)) : null;
};

const teksOf = (session, displayTeks) => {
  const key = String(session?.target?.alignmentKey || '');
  if (!key) return null;
  return typeof displayTeks === 'function' ? (displayTeks(key) || null) : key.split(':').pop();
};

/**
 * The completion record the weekly grade is computed from. Carries only
 * aggregate facts — no question payloads, no answers.
 */
export const completionFromPathSession = (sessionId, session = {}, { displayTeks } = {}) => {
  if (!isCountedWeeklyPathSession(session)) return null;
  return {
    status: 'completed',
    sessionId: String(sessionId || ''),
    completedAt: Number(session.completedAt || session.updatedAt || 0),
    teksCode: teksOf(session, displayTeks),
    accuracy: accuracyOf(session.summary),
    sessionKind: session.sessionKind || 'practice',
    assessmentFramework: session.assessmentFramework || null,
    weekKey: session.weekKey || null,
    weeklySlotKey: session.weeklySlotKey || null,
    weeklySlot: session.weeklySlot || null,
  };
};

/**
 * A weekly session the student opened and has not finished. The panel shows
 * "Resume" for it; it never counts toward the week.
 */
export const inProgressFromPathSession = (sessionId, session = {}, { displayTeks } = {}) => {
  if (session?.status !== 'active' || !session?.weeklySlotKey) return null;
  return {
    status: 'active',
    sessionId: String(sessionId || ''),
    teksCode: teksOf(session, displayTeks),
    weekKey: session.weekKey || null,
    weeklySlotKey: session.weeklySlotKey,
    weeklySlot: session.weeklySlot || null,
    answeredQuestions: Number(session.summary?.completedQuestions || 0),
    requiredQuestions: Number(session.requiredQuestions || 0) || null,
    updatedAt: Number(session.updatedAt || session.createdAt || 0),
  };
};

/**
 * Turn a student's session documents into this week's completions and
 * in-progress weekly sessions. `sessions` is [{ id, data }]. Completions are
 * those completed inside the week window; in-progress rows are those whose
 * weekKey is this week.
 */
export const collectWeeklyPathSessions = ({ sessions = [], weekKey, displayTeks } = {}) => {
  const window = weeklyCompletionWindow(weekKey);
  const seen = new Set();
  const completions = [];
  const inProgress = [];
  (Array.isArray(sessions) ? sessions : []).forEach((entry) => {
    const id = String(entry?.id || '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    const data = entry?.data || {};
    const completion = completionFromPathSession(id, data, { displayTeks });
    if (completion) {
      if (window && completion.completedAt >= window.start && completion.completedAt < window.end) completions.push(completion);
      return;
    }
    const active = inProgressFromPathSession(id, data, { displayTeks });
    if (active && active.weekKey === weekKey) inProgress.push(active);
  });
  completions.sort((a, b) => a.completedAt - b.completedAt);
  inProgress.sort((a, b) => b.updatedAt - a.updatedAt);
  return { completions, inProgress };
};
