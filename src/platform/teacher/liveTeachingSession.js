import { classworkPositionForStorageIndex } from './classworkModel.js';

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
} = {}) {
  const index = Math.max(0, Number(storageQuestionIndex) || 0);
  return {
    active: true,
    classId: classId || null,
    assignmentId: assignmentId || null,
    storageQuestionIndex: index,
    activityRole: activityRole || null,
    classworkQuestionPosition: classworkPositionForStorageIndex(assignment, index),
    startedAt: nowValue,
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
  return {
    ...session,
    storageQuestionIndex: index,
    activityRole: activityRole || null,
    classworkQuestionPosition: classworkPosition === null ? session.classworkQuestionPosition : classworkPosition,
  };
}

export function endLiveTeachingSession() {
  return null;
}
