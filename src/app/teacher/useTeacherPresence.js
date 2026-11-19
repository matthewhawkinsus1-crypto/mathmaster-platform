/*
 * WHICH STUDENTS ARE HERE NOW, FOR THE TEACHER SCREENS THAT SHOW IT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by position (tests/platform/appSplitTeacherLiveData.test.mjs holds the two sides to the same names in the same order). App owns the state these fill. Its hooks keep their place among App's hooks (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { PRESENCE_FLUSH_MS, applyKeyedChanges, createKeyedUpdateBuffer } from '../../platform/performance/coalescedKeyedUpdates.js';

export function useTeacherPresence(user, teacherPreviewRuntimeActive, teacherTab, allStudents, setPresenceById) {
  // Teachers stream presence only while the live grid is on screen. Subscribe
  // to roster-owned documents individually rather than the whole collection:
  // Firestore rules can then enforce that a teacher reads only students they
  // currently teach. Presence should never become a school-wide teacher feed.
  //
  // The listeners follow WHO is on the roster, as a value, and whether a
  // screen that shows presence is open — not the `allStudents` array itself.
  // Leaving Grades hands Home a new array of the same students (the compact
  // roster again in place of the grade records), and Home and Classes are both
  // presence screens: each of those closed every student's listener and opened
  // it again.
  const presenceRosterKey = useMemo(() => JSON.stringify([...new Set(
    (Array.isArray(allStudents) ? allStudents : [])
      .map((student) => String(student?.id || '').trim())
      .filter(Boolean),
  )]), [allStudents]);
  const teacherPresenceScreen = ['home', 'classesWorkspace'].includes(teacherTab);
  useEffect(() => {
    if (user?.role !== 'teacher' || !teacherPresenceScreen) {
      setPresenceById({});
      return undefined;
    }
    // Keep the last room snapshot in memory while Preview is open, but stop
    // every per-student listener. This prevents heartbeat traffic from making
    // the full interactive exemplar rerender during instruction.
    if (teacherPreviewRuntimeActive) return undefined;

    const rosterIds = JSON.parse(presenceRosterKey);

    if (!rosterIds.length) {
      setPresenceById({});
      return undefined;
    }

    // One render per second at most, however many students heartbeat: every
    // snapshot used to re-render the whole dashboard (about 7.5 renders a
    // second for 150 students). See coalescedKeyedUpdates.js.
    const presenceBuffer = createKeyedUpdateBuffer({
      flushMs: PRESENCE_FLUSH_MS,
      onFlush: (changes) => setPresenceById((current) => applyKeyedChanges(current, changes)),
    });
    const unsubs = rosterIds.map((studentId) => onSnapshot(
      doc(db, 'presence', studentId),
      (snapshot) => {
        presenceBuffer.set(studentId, snapshot.exists() ? snapshot.data() : null);
      },
      (error) => {
        // One stale/reassigned roster row should not take the rest of the live
        // room down. The scoped roster refresh will remove it on the next load.
        console.error(`Live class update failed for ${studentId}:`, error);
      },
    ));

    return () => {
      presenceBuffer.cancel();
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [user?.role, teacherPresenceScreen, presenceRosterKey, teacherPreviewRuntimeActive]);
}
