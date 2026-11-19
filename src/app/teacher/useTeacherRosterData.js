/*
 * A TEACHER'S ROSTER, LIVE: EVERY STUDENT'S PROFILE AND GRADES, AND THE SEATS A GENERATED ASSIGNMENT NEEDS.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by position (tests/platform/appSplitTeacherLiveData.test.mjs holds the two sides to the same names in the same order). App owns the state these fill. Its hooks keep their place among App's hooks (scripts/app-hook-ledger.mjs).
 */
import { useEffect, useRef } from 'react';
import { doc, FieldPath, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { needsResponseDetail, subscribeResponseDetailRoster, withResponseDetail } from '../../platform/grades/responseDetailStore.js';
import { GENERATION_SEATS_VERSION, generationSeatPlanSignature, planGenerationSeatWrites } from '../../platform/generation/generationSeatReconciler.js';
import { TEACHER_FULL_STUDENT_DATA_TABS } from '../screenScopes.js';

export function useTeacherRosterData(
  user, teacherPreviewRuntimeActive, teacherTab, teacherWorkspaceMode, teacherGraderRepairRanRef, assignments,
  assignmentsRef, allStudents, setAllStudents, teacherRosterSummaries, setTeacherStudentDataMode,
  persistCurrentGraderCreditRepairs, collectStudentGradeSnapshot, studentGradeSourceForViewer,
) {
  useEffect(() => {
    if (user?.role !== 'teacher') return undefined;

    const needsFullStudentData = teacherWorkspaceMode === 'teacher'
      && TEACHER_FULL_STUDENT_DATA_TABS.has(teacherTab)
      && !teacherPreviewRuntimeActive;

    if (!needsFullStudentData) {
      setAllStudents(teacherRosterSummaries);
      setTeacherStudentDataMode('summary');
      return undefined;
    }

    const viewer = { email: user.email || null, isRootAdmin: user.isRootAdmin === true };
    setTeacherStudentDataMode('loading-full');
    // Each record's detail (parts, steps, last response, support flags) is
    // stored beside its student's grades document (gradeEntryStorage.mjs):
    // every student whose records are stored that way is followed there too,
    // and the gradebook sees each grades document joined to it.
    // The roster's detail listeners follow the roster itself (not who has
    // split records yet), so they restart only when a student joins or leaves.
    let latestStudents = null;
    let detailFailed = false;
    let detailByStudent = new Map();
    let rosterKey = '';
    let stopDetailRoster = () => {};
    const publish = () => {
      if (!latestStudents) return;
      const waiting = latestStudents.filter((student) => needsResponseDetail(student) && !detailByStudent.has(String(student.id)));
      const studentData = latestStudents.map((student) => {
        const detail = detailByStudent.get(String(student.id));
        return detail ? withResponseDetail(student, detail) : student;
      });
      setAllStudents(studentData);
      setTeacherStudentDataMode('full');

      // The repair re-grades stored responses, so it waits until every
      // student's detail has arrived; it never runs on a summary alone.
      if (teacherTab === 'grades' && !teacherGraderRepairRanRef.current && !waiting.length && !detailFailed) {
        teacherGraderRepairRanRef.current = true;
        persistCurrentGraderCreditRepairs(studentData, assignmentsRef.current)
          .catch((error) => {
            teacherGraderRepairRanRef.current = false;
            console.error('Could not apply deferred current-grader credit repairs:', error);
          });
      }
    };
    const stopGrades = onSnapshot(
      studentGradeSourceForViewer(viewer),
      (snapshot) => {
        latestStudents = collectStudentGradeSnapshot(snapshot);
        const ids = latestStudents.map((student) => String(student.id)).sort();
        const key = ids.join('|');
        if (key !== rosterKey) {
          rosterKey = key;
          stopDetailRoster();
          detailByStudent = new Map();
          stopDetailRoster = subscribeResponseDetailRoster(db, ids, (loaded) => {
            detailByStudent = loaded;
            publish();
          }, (error) => {
            detailFailed = true;
            console.error('Could not follow students\' saved work detail:', error);
          });
        }
        publish();
      },
      (error) => {
        console.error('Could not watch live student grades:', error);
        setAllStudents(teacherRosterSummaries);
        setTeacherStudentDataMode('summary');
      },
    );
    return () => {
      stopGrades();
      stopDetailRoster();
    };
  // NOT `assignments`: the repair above runs once and reads the ref. Listing
  // the array tore this listener down on every write to ANY assignment —
  // another teacher's edit, a DOL unlock, a question-family seat — flipped the
  // gradebook to loading and re-read every student's grades document.
  }, [
    user?.role, user?.email, user?.isRootAdmin, teacherTab, teacherWorkspaceMode,
    teacherPreviewRuntimeActive, teacherRosterSummaries,
  ]);

  /*
   * SEATS FOR UNIQUE QUESTIONS, WRITTEN WITHOUT THE TEACHER DOING ANYTHING.
   *
   * An assignment whose family-backed questions vary per student needs every
   * student in each assigned class to hold a distinct seat
   * (functions/shared/questionGenerationIdentity.mjs). Only this app knows the
   * roster, so whenever it sees such an assignment with students missing a
   * seat, it appends their seats — inside a transaction that re-plans against
   * the freshly read document, so two teacher tabs cannot hand out one seat
   * twice. Seats are append-only and keyed by opaque learner tokens; no student
   * id is ever written to the assignment. Assignments without question
   * families are never touched.
   */
  const generationSeatSignaturesRef = useRef(new Map());
  useEffect(() => {
    if (user?.role !== 'teacher' || teacherPreviewRuntimeActive || !allStudents.length || !assignments.length) return;
    assignments.forEach((assignment) => {
      const signature = generationSeatPlanSignature({ assignment, students: allStudents });
      if (!signature || generationSeatSignaturesRef.current.get(assignment.id) === signature) return;
      generationSeatSignaturesRef.current.set(assignment.id, signature);
      if (!planGenerationSeatWrites({ assignment, students: allStudents }).length) return;
      const assignmentRef = doc(db, 'assignments', assignment.id);
      runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(assignmentRef);
        if (!snapshot.exists()) return;
        const fresh = { id: snapshot.id, ...snapshot.data() };
        const writes = planGenerationSeatWrites({ assignment: fresh, students: allStudents });
        if (!writes.length) return;
        const fieldsAndValues = [new FieldPath('generationSeats', 'version'), GENERATION_SEATS_VERSION];
        writes.forEach(({ classId, token, seat }) => {
          fieldsAndValues.push(new FieldPath('generationSeats', 'byClassId', classId, token), seat);
        });
        transaction.update(assignmentRef, ...fieldsAndValues);
      }).catch((error) => {
        // Not fatal: unseated students get provisional seats above every
        // taken seat, and the next roster or assignment change retries.
        generationSeatSignaturesRef.current.delete(assignment.id);
        console.warn('Could not seat students for unique questions:', error);
      });
    });
  }, [user?.role, teacherPreviewRuntimeActive, allStudents, assignments]);
}
