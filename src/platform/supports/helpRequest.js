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

/*
 * A RELOAD DOES NOT LOWER THE HAND (student pass 3, HELP-5). The request lived
 * only in React state, so a reload published presence without it and the
 * teacher's "Hand raised" quietly went out. This tab keeps its own request
 * (sessionStorage: this tab, this sign-in — a time, an assignment and a
 * question position, never anything the student wrote) and restores it when
 * the same assignment opens again. Leaving the assignment still lowers it.
 *
 * A stored hand is restored only while it is recent: a class period, not the
 * next day (and well inside the presence rule's one-day window).
 */
export const HELP_REQUEST_RESTORE_MS = 90 * 60 * 1000;
const STORAGE_PREFIX = 'mathmaster.helpRequest.v1:';

const validRequest = (request) => Boolean(request && typeof request === 'object'
  && typeof request.assignmentId === 'string' && request.assignmentId
  && Number.isFinite(Number(request.at)) && Number(request.at) > 0);

export const readStoredHelpRequest = (storage, studentId) => {
  if (!storage || !studentId) return null;
  try {
    const parsed = JSON.parse(storage.getItem(`${STORAGE_PREFIX}${studentId}`) || 'null');
    return validRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const storeHelpRequest = (storage, studentId, request) => {
  if (!storage || !studentId) return;
  try {
    if (validRequest(request)) {
      storage.setItem(`${STORAGE_PREFIX}${studentId}`, JSON.stringify({
        assignmentId: request.assignmentId,
        questionIndex: Number.isInteger(request.questionIndex) ? request.questionIndex : null,
        at: Math.floor(Number(request.at)),
      }));
    } else {
      storage.removeItem(`${STORAGE_PREFIX}${studentId}`);
    }
  } catch {
    /* storage refused (private mode, quota): the hand simply is not restored */
  }
};

/** The stored request, when it belongs to this assignment and is still recent. */
export const restoreHelpRequest = (stored, { assignmentId = null, now = Date.now() } = {}) => {
  if (!validRequest(stored) || !assignmentId || stored.assignmentId !== assignmentId) return null;
  const at = Number(stored.at);
  if (at > now + 60000 || now - at > HELP_REQUEST_RESTORE_MS) return null;
  return { assignmentId: stored.assignmentId, questionIndex: Number.isInteger(stored.questionIndex) ? stored.questionIndex : null, at };
};
