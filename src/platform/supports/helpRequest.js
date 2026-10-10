/*
 * "ASK MY TEACHER" — THE HELP SIGNAL THE LIVE MONITOR ALREADY READS.
 *
 * The teacher's Walkthrough monitor ranks a student whose presence carries
 * `helpRequestedAt` first in Visit Next and counts "N asked for help"
 * (src/platform/teacher/walkthroughMonitor.js). Nothing wrote it. The student
 * heartbeat (App.jsx) rewrites the whole presence document every 20 seconds,
 * so the request rides IN that payload — a separate merge write would be
 * erased by the next beat.
 *
 *   helpRequestFields(request, { assignmentId }) → { helpRequestedAt, helpQuestionIndex } | {}
 *
 * A request belongs to one assignment session; on any other assignment it
 * contributes nothing, and cancelling it (or leaving the assignment, which
 * deletes presence) clears the flag on the teacher's screen. It carries a
 * time and a question position — never a response.
 */
export const helpRequestFields = (request, { assignmentId = null } = {}) => {
  if (!request || typeof request !== 'object' || !assignmentId || request.assignmentId !== assignmentId) return {};
  const at = Number(request.at);
  if (!Number.isFinite(at) || at <= 0) return {};
  const index = Number(request.questionIndex);
  return {
    helpRequestedAt: Math.floor(at),
    ...(Number.isInteger(index) && index >= 0 ? { helpQuestionIndex: index } : {}),
  };
};

/** The request a student's "Ask my teacher" toggle makes (or clears: null). */
export const nextHelpRequest = ({ requested, assignmentId, questionIndex, now = Date.now() } = {}) => (
  requested && assignmentId ? { assignmentId, questionIndex: Number.isInteger(questionIndex) ? questionIndex : null, at: now } : null
);

/*
 * A raised hand comes down when its question closes. Once that question is
 * answered correctly or out of attempts, QuestionEngine no longer offers the
 * cancel toggle, so a request left standing would keep publishing a stale
 * "Help requested" on every heartbeat (PR #462 review). Returns the request,
 * or null once the question it was raised on is closed — or once asking is
 * no longer offered at all (the assignment turned into post-due practice).
 * A question LOCKED without closing (DOL timer, a section closed by the
 * teacher, the Warm-Up window) is lowered by QuestionEngine, which is where
 * that lock is known.
 */
export const helpRequestAfterClose = (request, tracker = {}, { askingAllowed = true } = {}) => {
  if (!request || typeof request !== 'object') return null;
  if (askingAllowed === false) return null;
  const index = Number(request.questionIndex);
  if (!Number.isInteger(index)) return request;
  const status = tracker?.[index]?.status;
  return status === 'correct' || status === 'expired' ? null : request;
};
