import { classworkPositionForStorageIndex } from './classworkModel.js';

export const WALKTHROUGH_TIMER_STATUS = Object.freeze({
  IDLE: 'idle', RUNNING: 'running', PAUSED: 'paused', EXPIRED: 'expired',
});

const cleanSeconds = (value, fallback = 0) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
};

const questionAt = (assignment, index) => {
  const questions = Array.isArray(assignment?.questions)
    ? assignment.questions
    : (Array.isArray(assignment?.sections) ? assignment.sections.flatMap((section) => section?.questions || []) : []);
  return questions[index] || null;
};

export const walkthroughSessionId = ({ teacherUid, classId, assignmentId } = {}) => (
  [teacherUid, classId, assignmentId]
    .map((part) => encodeURIComponent(String(part || 'missing')))
    .join('__')
);

export const createWalkthroughTimer = (durationSeconds = 0) => ({
  durationSeconds: cleanSeconds(durationSeconds),
  remainingSeconds: cleanSeconds(durationSeconds),
  status: WALKTHROUGH_TIMER_STATUS.IDLE,
  startedAt: null,
});

export function walkthroughTimerRemaining(timer, nowValue = Date.now()) {
  if (!timer) return 0;
  const remaining = cleanSeconds(timer.remainingSeconds, cleanSeconds(timer.durationSeconds));
  if (timer.status !== WALKTHROUGH_TIMER_STATUS.RUNNING || !timer.startedAt) return remaining;
  return Math.max(0, remaining - Math.floor((nowValue - Number(timer.startedAt)) / 1000));
}

export function updateWalkthroughTimer(timer, action, { nowValue = Date.now(), durationSeconds } = {}) {
  const current = timer || createWalkthroughTimer(durationSeconds);
  const remaining = walkthroughTimerRemaining(current, nowValue);
  switch (action) {
    case 'start':
    case 'resume':
      return remaining <= 0
        ? { ...current, remainingSeconds: 0, startedAt: null, status: WALKTHROUGH_TIMER_STATUS.EXPIRED }
        : { ...current, remainingSeconds: remaining, startedAt: nowValue, status: WALKTHROUGH_TIMER_STATUS.RUNNING };
    case 'pause':
      return { ...current, remainingSeconds: remaining, startedAt: null, status: remaining ? WALKTHROUGH_TIMER_STATUS.PAUSED : WALKTHROUGH_TIMER_STATUS.EXPIRED };
    case 'tick':
      return remaining ? current : { ...current, remainingSeconds: 0, startedAt: null, status: WALKTHROUGH_TIMER_STATUS.EXPIRED };
    case 'extend': {
      const added = cleanSeconds(durationSeconds);
      const nextRemaining = remaining + added;
      return { ...current, durationSeconds: cleanSeconds(current.durationSeconds) + added, remainingSeconds: nextRemaining,
        startedAt: current.status === WALKTHROUGH_TIMER_STATUS.RUNNING ? nowValue : null,
        status: current.status === WALKTHROUGH_TIMER_STATUS.EXPIRED ? WALKTHROUGH_TIMER_STATUS.PAUSED : current.status };
    }
    case 'reset': {
      const resetDuration = durationSeconds == null ? cleanSeconds(current.durationSeconds) : cleanSeconds(durationSeconds);
      return createWalkthroughTimer(resetDuration);
    }
    default: return current;
  }
}

// Projectors receive only this allow-listed projection. Roster rows, names,
// grades, support signals, and demo answers can never cross this boundary.
export const buildProjectorState = (session) => ({
  active: Boolean(session?.active),
  storageQuestionIndex: Math.max(0, Number(session?.storageQuestionIndex) || 0),
  activityRole: session?.activityRole || null,
  classworkQuestionPosition: Number.isInteger(session?.classworkQuestionPosition) ? session.classworkQuestionPosition : null,
  instructionalPhase: session?.projectorState?.showInstructionalPhase ? session?.instructionalPhase || null : null,
  timer: session?.projectorState?.showTimer ? session?.timer || null : null,
  reviewVisible: Boolean(session?.projectorState?.showReview),
});

/**
 * Teacher-only Live Teaching session state (Classroom Live, Phase 2).
 *
 * This tracks where the TEACHER actually is inside the student-preview
 * runtime while teaching an exemplar, so the room's pace reference is the
 * teacher's real position instead of a disconnected manual counter. It is
 * intentionally small and holds no student response data, grades,
 * assignmentActivity, evidence, or presence.
 *
 * Shape:
 *   active                     boolean
 *   classId                    string | null
 *   assignmentId                string | null
 *   storageQuestionIndex        number   — raw index into the assignment's question array
 *   activityRole                string | null — the role of that storage question (warmup/classwork/practice/dol/...)
 *   classworkQuestionPosition   number | null — 0-based position within Classwork only; the pace reference
 *   startedAt                   number   — epoch ms
 */

export function startLiveTeachingSession({
  classId,
  assignmentId,
  assignment = null,
  storageQuestionIndex = 0,
  activityRole = null,
  nowValue = Date.now(),
  teacherUid = null,
  teacherEmail = null,
  suggestedWorkSeconds = 0,
} = {}) {
  const index = Math.max(0, Number(storageQuestionIndex) || 0);
  const sessionId = walkthroughSessionId({ teacherUid: teacherUid || teacherEmail, classId, assignmentId });
  return {
    sessionId,
    ownerUid: teacherUid || null,
    teacherEmail: teacherEmail || null,
    active: true,
    classId: classId || null,
    assignmentId: assignmentId || null,
    storageQuestionIndex: index,
    activityRole: activityRole || null,
    classworkQuestionPosition: classworkPositionForStorageIndex(assignment, index),
    startedAt: nowValue,
    instructionalPhase: questionAt(assignment, index)?.instructionalPhase || null,
    timer: createWalkthroughTimer(suggestedWorkSeconds || questionAt(assignment, index)?.suggestedWorkSeconds),
    projectorState: { showInstructionalPhase: true, showTimer: true, showReview: false },
    updatedAt: nowValue,
  };
}

/**
 * Called as the teacher moves through the exemplar using real student
 * navigation. Classwork is the only pace-bearing section: when the teacher's
 * current storage index does not map to a Classwork question (they are
 * viewing Warm-Up, Practice, or DOL), the most recent valid Classwork
 * position is kept rather than letting the room think students fell behind
 * because of an unrelated index system.
 */
export function advanceLiveTeachingSession(session, { assignment = null, storageQuestionIndex, activityRole = null } = {}) {
  if (!session?.active) return session;
  const index = Math.max(0, Number(storageQuestionIndex) || 0);
  const classworkPosition = classworkPositionForStorageIndex(assignment, index);
  const nextActivityRole = activityRole || null;
  const nextClassworkPosition = classworkPosition === null ? session.classworkQuestionPosition : classworkPosition;
  const nextInstructionalPhase = questionAt(assignment, index)?.instructionalPhase || null;

  // Assignment snapshots can replace the assignment object without the teacher
  // moving. Returning the existing object here prevents a meaningless React
  // update and a redundant Firestore walkthrough write for that case.
  if (
    session.storageQuestionIndex === index
    && session.activityRole === nextActivityRole
    && session.classworkQuestionPosition === nextClassworkPosition
    && session.instructionalPhase === nextInstructionalPhase
  ) return session;

  return {
    ...session,
    storageQuestionIndex: index,
    activityRole: nextActivityRole,
    classworkQuestionPosition: nextClassworkPosition,
    instructionalPhase: nextInstructionalPhase,
    updatedAt: Date.now(),
  };
}

export function endLiveTeachingSession() {
  return null;
}
