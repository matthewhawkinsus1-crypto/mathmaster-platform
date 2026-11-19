/*
 * THE ASSIGNMENTS A SIGNED-IN ACCOUNT SEES, LIVE.
 *
 * A student's device listens to its own class, and reads once any assignment
 * it has work on from a class it left; a teacher's listens to the collection.
 * A change to the profile or to private controls projects the lessons again
 * without reopening a listener. App owns the published list and the refs these
 * fill. Moved verbatim from App.jsx, which calls this where the code was and
 * passes what it reads by name. Its effects keep their place among App's
 * effects (scripts/app-hook-ledger.mjs).
 */
import { useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  fetchAssignmentsById, individuallyAssignedTestCycleIds, markIndividuallyAssigned, mergeStudentAssignments,
  priorWorkAssignmentIds, priorWorkFromClassLeft, subscribeStudentClassAssignments, workedAssignmentKey,
} from '../../platform/assignments/studentAssignmentScope.js';

export function useAssignmentListeners({
  user, tracker, setNow, testCycleGrades, studentAssignmentControls, studentClassAssignmentsRef,
  studentPriorWorkAssignmentsRef, studentViewerRef, publishStudentAssignments, teacherClassControls,
  teacherSharedAssignmentsRef, publishTeacherAssignments,
}) {
  // A changed control, a newly read scope, or a profile revision re-projects
  // the lessons already held: no listener is re-opened for it.
  useEffect(() => {
    if (user?.role === 'student' && user.id) {
      studentViewerRef.current = { studentId: user.id, profile: user.profile || null, timingProfile: user.timingProfile || null };
      publishStudentAssignments();
    } else if (user?.role === 'teacher') {
      publishTeacherAssignments();
    }
    // The publishers read refs; these are what change their answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id, user?.profile, user?.timingProfile, studentAssignmentControls, teacherClassControls]);

  useEffect(() => {
    if (!user?.role || !user.id) return undefined;
    // What this student has work on when the listener opens: after a move, the
    // lessons of the class left that it keeps.
    const studentWorkedIds = user.role === 'student' ? workedAssignmentKey(tracker, individuallyAssignedTestCycleIds(testCycleGrades)).split('|') : [];

    if (user.role === 'student') {
      return subscribeStudentClassAssignments({
        db,
        studentId: user.id,
        classId: user.classId,
        onChange: (classAssignments) => {
          // A move to another class while signed in (rosterMembership.js): as
          // the new class's lessons come, the lessons of the class left that
          // this student has work on stay, as prior work, as a fresh load reads
          // them; the class left's other lessons go.
          const keptFromClassLeft = priorWorkFromClassLeft({ classAssignments: studentClassAssignmentsRef.current, classId: user.classId, workedIds: studentWorkedIds });
          if (keptFromClassLeft.length) studentPriorWorkAssignmentsRef.current = mergeStudentAssignments(studentPriorWorkAssignmentsRef.current, keptFromClassLeft);
          studentClassAssignmentsRef.current = classAssignments;
          publishStudentAssignments();
          // A teacher DOL unlock is an assignment update; see below.
          setNow(Date.now());
        },
        onError: (error) => console.error('Assignment live update failed:', error),
      });
    }

    const unsubscribe = onSnapshot(
      collection(db, 'assignments'),
      (snapshot) => {
        const liveAssignments = snapshot.docs.map((assignmentDoc) => ({
          id: assignmentDoc.id,
          ...assignmentDoc.data(),
        }));
        liveAssignments.sort((a, b) =>
          String(a.dueAt || a.dueDate || '').localeCompare(String(b.dueAt || b.dueDate || '')),
        );
        teacherSharedAssignmentsRef.current = liveAssignments;
        publishTeacherAssignments();
        // A teacher DOL unlock is an assignment update. Refresh the logical
        // clock with the snapshot so students do not wait for the next 30s
        // lifecycle tick before seeing an early release.
        setNow(Date.now());
      },
      (error) => console.error('Assignment live update failed:', error),
    );

    return unsubscribe;
    // Who is signed in and their class decide the listener; a profile
    // revision re-projects (above) without re-opening it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id, user?.classId]);

  // Work a student did under an earlier class: read once per change in the
  // SET of assignments they have work on (not on every answer), by id.
  // A Test the student was added to on their own is one of them too, from the
  // moment the server says so and before they have done anything on it.
  const studentIndividualTestIds = user?.role === 'student' ? individuallyAssignedTestCycleIds(testCycleGrades) : [];
  const studentIndividualTestKey = studentIndividualTestIds.join('|');
  const studentWorkedAssignmentKey = user?.role === 'student' ? workedAssignmentKey(tracker, studentIndividualTestIds) : '';
  useEffect(() => {
    if (user?.role !== 'student' || !studentWorkedAssignmentKey) return undefined;
    let cancelled = false;
    const loadedIds = [
      ...studentClassAssignmentsRef.current,
      ...studentPriorWorkAssignmentsRef.current,
    ].map((assignment) => assignment.id);
    const missing = priorWorkAssignmentIds({
      gradesByAssignment: Object.fromEntries(studentWorkedAssignmentKey.split('|').map((id) => [id, true])),
      loadedIds,
    });
    if (!missing.length) return undefined;
    fetchAssignmentsById(db, missing, { studentId: user.id })
      .then((fetched) => {
        if (cancelled || !fetched.length) return;
        studentPriorWorkAssignmentsRef.current = mergeStudentAssignments(
          studentPriorWorkAssignmentsRef.current,
          markIndividuallyAssigned(fetched, studentIndividualTestKey ? studentIndividualTestKey.split('|') : []),
        );
        publishStudentAssignments();
      })
      .catch((error) => console.warn('Could not load earlier-class assignments:', error));
    return () => { cancelled = true; };
    // publishStudentAssignments reads refs and the current user; the key is
    // what decides whether there is anything new to read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id, studentWorkedAssignmentKey]);
}
