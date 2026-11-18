/*
 * A STUDENT MOVED TO ANOTHER CLASS ON THE ROSTER FOLLOWS IT WITHOUT SIGNING IN AGAIN.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes
 * what it reads by name. Its effects keep their place among App's effects
 * (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useRef } from 'react';
import { followRosterClass } from '../../platform/student/rosterMembership.js';

export function useRosterClassFollow({ setUser, user, courseProfiles, classesById, fetchStudentClass, studentRosterMembership }) {
  /*
   * WHAT THE STUDENT'S SCREENS READ ABOUT THEIR CLASS FOLLOWS THEIR ROSTER ROW
   * (platform/student/rosterMembership.js). A class handed to another teacher
   * moves the teacher their next question goes to; a move to another class
   * takes the new class whole, as a fresh load reads it: its lessons (the class
   * listener follows user.classId), its bell times, its course and level, and
   * the class and teacher a question or support evidence names. A class made
   * after this student signed in is read first, once, and followed with what
   * that read gave (as sign-in does when it cannot read the class).
   */
  const classReadForRosterRef = useRef(null);
  useEffect(() => {
    if (user?.role !== 'student' || !studentRosterMembership) return undefined;
    const { classId } = studentRosterMembership;
    const follow = (byId) => setUser((current) => followRosterClass(current, studentRosterMembership, { classesById: byId, courseProfiles }));
    if (!classId || classId === (user.classId || null) || classesById[classId] || classReadForRosterRef.current === classId) {
      follow(classesById);
      return undefined;
    }
    classReadForRosterRef.current = classId;
    let cancelled = false;
    fetchStudentClass(classId).then((loaded) => { if (!cancelled) follow(Object.fromEntries(loaded.map((entry) => [entry.classId, entry]))); });
    return () => { cancelled = true; };
    // fetchStudentClass is the component's own loader; the row, the class read and the course settings decide the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.classId, studentRosterMembership, classesById, courseProfiles]);
}
