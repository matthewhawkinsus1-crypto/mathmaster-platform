/*
 * LIVE TEACHING FROM THE TEACHER'S PREVIEW: WRITING WHERE THE WALKTHROUGH IS, AND THE CLASS'S SCRATCHPADS FOR IT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by position (tests/platform/appSplitTeacherLiveData.test.mjs holds the two sides to the same names in the same order). App owns the state these fill. Its hooks keep their place among App's hooks (scripts/app-hook-ledger.mjs).
 */
import { useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { EMPTY_SCRATCHPAD_CACHE } from '../../platform/student/practiceScratchpadCache.js';
import { advanceLiveTeachingSession } from '../../platform/teacher/liveTeachingSession.js';

export function useLiveTeachingPreviewSync(
  user, liveTeachingSession, setLiveTeachingSession, walkthroughWriteRef, activeAssignmentId, setPreviewScratchpads,
  currentQuestionIndex, activeAssignmentData, isTeacherPreview, activeQuestionRole,
) {
  // As the teacher moves through the exemplar with real student navigation,
  // keep the Live Teaching session's position in sync so the room's pace
  // reference is the teacher's ACTUAL position, never a stale one.
  useEffect(() => {
    if (!isTeacherPreview || !liveTeachingSession?.active) return;
    if (String(liveTeachingSession.assignmentId) !== String(activeAssignmentId)) return;
    setLiveTeachingSession((session) => advanceLiveTeachingSession(session, {
      assignment: activeAssignmentData,
      storageQuestionIndex: currentQuestionIndex,
      activityRole: activeQuestionRole,
    }));
  }, [isTeacherPreview, liveTeachingSession?.active, liveTeachingSession?.assignmentId, activeAssignmentId, activeAssignmentData, currentQuestionIndex, activeQuestionRole]);

  // "View as Student" scratchpads are wanted only while the preview is on
  // screen, or while a Live Teaching session can resume into it
  // (resumeLiveTeaching keeps them on purpose). Once neither holds — the
  // teacher left a plain preview, or ended Live Teaching away from it — nothing
  // is meant to bring them back (a new preview starts empty), so the pages are
  // released instead of held until sign-out.
  const previewScratchpadsReachable = isTeacherPreview || Boolean(liveTeachingSession?.active);
  useEffect(() => {
    if (!previewScratchpadsReachable) setPreviewScratchpads(EMPTY_SCRATCHPAD_CACHE);
  }, [previewScratchpadsReachable]);

  // All teacher tabs observe the deterministic session document. Writes occur
  // only for commands/navigation; timer seconds are derived from startedAt.
  useEffect(() => {
    if (user?.role !== 'teacher' || !liveTeachingSession?.sessionId) return undefined;
    const sessionRef = doc(db, 'walkthroughSessions', liveTeachingSession.sessionId);
    const expected = { classId: liveTeachingSession.classId, assignmentId: liveTeachingSession.assignmentId };
    return onSnapshot(sessionRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const remote = snapshot.data();
      // The document id encodes teacher + class + assignment; a record whose
      // body names a different class or assignment is not this session.
      if (String(remote?.classId || '') !== String(expected.classId || '')
        || String(remote?.assignmentId || '') !== String(expected.assignmentId || '')) return;
      if (Number(remote.updatedAt) > Number(walkthroughWriteRef.current || 0)) {
        walkthroughWriteRef.current = Number(remote.updatedAt) || 0;
        setLiveTeachingSession(remote);
      }
    });
  }, [user?.role, liveTeachingSession?.sessionId]);
}
