/*
 * THE STUDENT'S OWN GRADE DOCUMENT, LIVE.
 *
 * One listener on grades/{id}: records the server is ahead on are adopted into
 * the tracker, and the grade, sync, Recovery and profile fields App shows are
 * kept from it. App owns that state and hands its setters in. Moved verbatim
 * from App.jsx, which calls this where the code was and passes what it reads
 * by name. Its effects keep their place among App's effects (scripts/app-hook-
 * ledger.mjs).
 */
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { needsResponseDetail, serverTrackersForAdoption, subscribeResponseDetail } from '../../platform/grades/responseDetailStore.js';
import { adoptCanonicalAdvances } from '../../platform/persistence/canonicalTrackerReconciliation.js';
import { sameTimingProfile } from '../../platform/assignments/studentAssignmentControls.js';
import { followSupportProfile, rosterMembershipOf, sameRosterMembership } from '../../platform/student/rosterMembership.js';
import { normalizeStudentProfile } from '../../studentSupport';
import { keepSame } from '../../platform/performance/renderStability.js';

export function useStudentGradeDocument({
  toastSuccess, setUser, user, assignmentsRef, setTracker, setDolGradesByAssignment, setClassworkGradesByAssignment,
  setClassroomSyncStatusByAssignment, setTestCycleGrades, setTeacherGradeOverridesByAssignment,
  setSectionRecoveryByAssignment, setWarmupChallengeByAssignment, liveSessionAttemptBaselineRef,
  classroomSyncNoticeRef,
}) {
  // The server writes one compact receipt only after Google Classroom accepts
  // a grade patch. Listening to that receipt gives students confirmation from
  // the authoritative passback result rather than assuming a network request
  // worked. The local assignment tracker is NOT replaced from this snapshot:
  // the student's own answers move it through the normal save path, and a
  // snapshot from before an ingestion lands must never roll them back. A
  // record the server holds AHEAD of this session is the exception, adopted
  // below (canonicalTrackerReconciliation.js): an attempt this device never
  // made — the Warm-Up or DOL deadline's auto-submit, or another Chromebook's.
  // The same listener hears the roster row's class and teacher change: see
  // studentRosterMembership below.
  const [studentRosterMembership, setStudentRosterMembership] = useState(null);
  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setStudentRosterMembership(null);
      setClassroomSyncStatusByAssignment({});
      setTestCycleGrades({});
      setTeacherGradeOverridesByAssignment({});
      setSectionRecoveryByAssignment({});
      setWarmupChallengeByAssignment({});
      setDolGradesByAssignment({});
      setClassworkGradesByAssignment({});
      classroomSyncNoticeRef.current = {};
      return undefined;
    }

    // Whoever is signed in now, their row is followed from its first snapshot.
    setStudentRosterMembership(null);
    // A record's detail (parts, steps, last response) is stored beside the
    // grades document (gradeEntryStorage.mjs): the server's trackers are
    // adopted joined to it, from either snapshot, whichever arrives last.
    let latestServerGrades = null;
    let latestDetail = null;
    let stopDetail = null;
    const adoptServerGrades = () => {
      if (!latestServerGrades) return;
      const serverGrades = serverTrackersForAdoption(latestServerGrades, latestDetail);
      setTracker((current) => {
        const { grades, adopted } = adoptCanonicalAdvances(current, serverGrades);
        // Attempts the server made are not this session's attempts.
        adopted.forEach(({ assignmentId, questionIndex, totalAttempts }) => {
          const baseline = liveSessionAttemptBaselineRef.current;
          if (baseline.assignmentId === assignmentId) {
            baseline.totalAttemptsByIndex = { ...baseline.totalAttemptsByIndex, [questionIndex]: totalAttempts };
          }
        });
        return grades;
      });
    };
    const stopGrades = onSnapshot(
      doc(db, 'grades', user.id),
      (snapshot) => {
        if (!snapshot.exists()) return;
        // An attempt the server recorded without this device — the deadline
        // finalizer's auto-submit above all — reaches the open question now,
        // not at the next sign-in: a closed question shows as closed, and the
        // next checkpoint carries the attempt count the server really has.
        latestServerGrades = snapshot.data()?.gradesByAssignment || {};
        if (!stopDetail && needsResponseDetail({ gradesByAssignment: latestServerGrades })) {
          stopDetail = subscribeResponseDetail(
            db,
            user.id,
            (detail) => { latestDetail = detail; adoptServerGrades(); },
            (error) => console.error('Could not follow saved work detail:', error),
          );
        }
        adoptServerGrades();
        const next = snapshot.data()?.classroomSyncStatusByAssignment || {};
        // Each map is kept while the snapshot says the same (keepSame,
        // renderStability.js). Every Submit and Next brings two snapshots, the
        // record and the time on task, whose maps say what they said: as new
        // objects they drew App again and worked out again everything read
        // from them (the grades, the Recoveries, the sections' locks).
        setClassroomSyncStatusByAssignment(keepSame(next));
        // A teacher releasing a secure Test or Retest changes this map, and the
        // student's card and Grade Center have to follow without a reload.
        setTestCycleGrades(keepSame(snapshot.data()?.testCycleGrades || {}));
        setTeacherGradeOverridesByAssignment(keepSame(snapshot.data()?.teacherGradeOverridesByAssignment || {}));
        // A Recovery the server just recorded must reach the student's grade
        // and Recovery panel without a reload.
        setSectionRecoveryByAssignment(keepSame(snapshot.data()?.sectionRecoveryByAssignment || {}));
        setWarmupChallengeByAssignment(keepSame(snapshot.data()?.warmupChallengeByAssignment || {}));
        setDolGradesByAssignment(keepSame(snapshot.data()?.dolGradesByAssignment || {}));
        setClassworkGradesByAssignment(keepSame(snapshot.data()?.classworkGradesByAssignment || {}));
        // The profile the server grades with: a revision a teacher saves while
        // this student is working reaches their required items now, not at
        // the next sign-in.
        const liveProfile = normalizeStudentProfile(snapshot.data()?.profile || snapshot.data());
        // Supports only: the course and level the class sets stay (rosterMembership.js).
        setUser((current) => followSupportProfile(current, liveProfile));
        // The DOL window's source (D7): the grade document's own `profile`
        // field, updated on its own so nothing else about the user changes.
        const liveTimingProfile = snapshot.data()?.profile || null;
        setUser((current) => (current && !sameTimingProfile(current.timingProfile, liveTimingProfile) ? { ...current, timingProfile: liveTimingProfile } : current));
        // The class and its teacher, as a fresh load reads them: a class handed
        // to another teacher, or this student moved to another class, while they
        // work (followed below; teacher features walk, item 10).
        const membership = rosterMembershipOf(snapshot.data());
        setStudentRosterMembership((current) => (sameRosterMembership(current, membership) ? current : membership));

        Object.entries(next).forEach(([assignmentId, receipt]) => {
          const notificationId = receipt?.notificationId;
          if (!notificationId) return;
          if (classroomSyncNoticeRef.current[assignmentId] === notificationId) return;
          classroomSyncNoticeRef.current[assignmentId] = notificationId;

          const assignment = assignmentsRef.current.find((item) => item.id === assignmentId);
          const title = assignment?.title || 'Your assignment';
          const grade = Number.isFinite(Number(receipt?.grade)) ? Number(receipt.grade) : null;
          const gradeText = grade == null ? 'Your grade' : `${grade}%`;
          const stage = String(receipt?.stage || '');
          const final = receipt?.isFinal === true || stage.startsWith('final-');
          const studentVisible = receipt?.studentVisible === true;

          if (final) {
            toastSuccess(
              'Final grade sent to Google Classroom',
              `${title}: ${gradeText} was released to you in Google Classroom as the final MathMaster grade.`,
            );
            return;
          }

          if (stage === 'due-checkpoint') {
            toastSuccess(
              'Due-date grade sent to Google Classroom',
              `${title}: ${gradeText} was released to you in Google Classroom at the regular due date. Late work can still improve it before the final cutoff.`,
            );
            return;
          }

          if (stage === 'assessment-release') {
            toastSuccess(
              'Released grade sent to Google Classroom',
              `${title}: ${gradeText} was released to you in Google Classroom after your teacher released the assessment grade.`,
            );
            return;
          }

          if (studentVisible) {
            toastSuccess(
              'Updated grade released to Google Classroom',
              `${title}: your current ${gradeText} is visible in Google Classroom. It is not final—late work can still improve it.`,
            );
            return;
          }

          // A draft the teacher has not released is invisible to the student
          // in Classroom; announcing it only added sync jargon. No toast.
        });
      },
      (error) => console.error('Could not watch Google Classroom grade receipts:', error),
    );
    return () => {
      stopGrades();
      if (stopDetail) stopDetail();
    };
  }, [user?.role, user?.id, toastSuccess]);
  return { studentRosterMembership };
}
