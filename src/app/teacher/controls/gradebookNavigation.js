/*
 * OPENING THE GRADEBOOK, AN ASSIGNMENT'S HUB, LIVE AND THE GRADE EXPORT FOR A CLASS, AND LOADING WHAT THEY SHOW.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It holds no state and runs no effects: App keeps the busy flags and hands their setters in. It reaches App through the teacher kit (teacherKit.js), so it loads for a teacher and never with a student's Home.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { joinResponseDetail } from '../../../platform/grades/responseDetailStore.js';
import { normalizeStudentProfile } from '../../../studentSupport';
import { fetchStudentEvidenceEvents } from '../../../platform/history/evidencePersistence.js';
import { studentsInClass } from '../../../../functions/shared/classModel.mjs';

export function createGradebookNavigation(
  setTeacherTab, classes, activeClass, setActiveClass, allStudents, setAssignmentHubTarget, setGradeExportScope,
  setLiveFocus, setGradebookProgressFilter, setClassEvidenceByStudentId, classEvidenceLoading,
  setClassEvidenceLoading, setGradebookFilter,
) {
  const handleViewClassGradebook = (classOrPeriod, student = null) => {
    const studentClassId = student?.classId || '';
    const classRecord = classes.find((entry) => entry.classId === studentClassId)
      || classes.find((entry) => entry.classId === classOrPeriod)
      || classes.find((entry) => entry.period === classOrPeriod)
      || null;
    const resolvedClassId = classRecord?.classId || studentClassId || '';
    const resolvedPeriod = classRecord?.period || student?.classPeriod || String(classOrPeriod || '');
    setGradebookFilter({
      classId: resolvedClassId,
      classPeriod: resolvedPeriod,
      assignmentId: null,
      student,
    });
    // Opening a class's gradebook IS choosing that class. Leaving the workspace
    // context pointed somewhere else would put the class bar and the table it
    // sits above in open disagreement.
    if (resolvedClassId) setActiveClass({ classId: resolvedClassId, classPeriod: resolvedPeriod || null });
    setTeacherTab('grades');
  };

  /*
   * THE ASSIGNMENT'S WORLD IS ONE CLICK FROM ANYWHERE IT APPEARS.
   * Each hand-off below arrives with its context already chosen: the class,
   * the assignment, the student. Nothing asks the teacher to choose again.
   */
  const openAssignmentHub = (assignmentId, classId = null) => {
    if (!assignmentId) return;
    setAssignmentHubTarget({ assignmentId, classId: classId || activeClass.classId || null });
  };

  /*
   * Home and the class page run on the lightweight live roster (no grade
   * records) so they stay fast during class. When a teacher asks an
   * assignment's hub "who has finished?", read just that class's grade
   * documents once — the same per-student documents, and the same teacher-of-
   * record rule, the Gradebook's live query uses — instead of sending them to
   * the Gradebook. Read-only.
   */
  const loadClassGradeRecords = async (classId) => {
    const roster = studentsInClass({ students: allStudents, classes, classId });
    const snapshots = await Promise.all(roster.map((student) => getDoc(doc(db, 'grades', student.id))));
    // Whole records: each record's detail is stored apart (gradeEntryStorage.mjs).
    const records = await Promise.all(snapshots
      .filter((snapshot) => snapshot.exists())
      .map(async (snapshot) => ({ id: snapshot.id, data: await joinResponseDetail(db, snapshot.id, snapshot.data() || {}) })));
    return records.map(({ id, data }) => ({ id, ...data, profile: normalizeStudentProfile(data?.profile || data) }));
  };

  const openGradeExport = ({ classIds = [], assignmentId = null } = {}) => {
    setGradeExportScope({ classIds: (classIds || []).filter(Boolean), assignmentId: assignmentId || null, nonce: Date.now() });
    setAssignmentHubTarget(null);
    setTeacherTab('gradeTransfer');
  };

  const openGradebookFor = (classId, assignmentId = null, studentId = null) => {
    const classRecord = classes.find((entry) => entry.classId === classId) || null;
    const student = studentId ? allStudents.find((entry) => entry.id === studentId) || { id: studentId } : null;
    setGradebookFilter({
      classId: classRecord?.classId || classId || '',
      classPeriod: classRecord?.period || '',
      assignmentId: assignmentId || null,
      student,
    });
    if (classRecord?.classId) setActiveClass({ classId: classRecord.classId, classPeriod: classRecord.period || null });
    setGradebookProgressFilter('all');
    setAssignmentHubTarget(null);
    setTeacherTab('grades');
  };

  const openLiveFor = (classContext, assignmentId = null) => {
    if (classContext?.classId) setActiveClass({ classId: classContext.classId, classPeriod: classContext.classPeriod || null });
    setLiveFocus({ classId: classContext?.classId || null, classPeriod: classContext?.classPeriod || null, assignmentId: assignmentId || null, nonce: Date.now() });
    setAssignmentHubTarget(null);
    setTeacherTab('home');
  };

  const handleLoadDeliveredRigor = async (studentIds = []) => {
    const ids = (Array.isArray(studentIds) ? studentIds : []).filter(Boolean);
    if (!ids.length || classEvidenceLoading) return;
    setClassEvidenceLoading(true);
    try {
      // Settled, not all: one student with an unreadable history must not cost
      // the teacher the answer for the other twenty-nine.
      const results = await Promise.allSettled(ids.map((id) => fetchStudentEvidenceEvents(id)));
      setClassEvidenceByStudentId(Object.fromEntries(results.map((result, index) => [
        ids[index],
        result.status === 'fulfilled' ? result.value : [],
      ])));
    } finally {
      setClassEvidenceLoading(false);
    }
  };
  return [
    handleViewClassGradebook, openAssignmentHub, loadClassGradeRecords, openGradeExport, openGradebookFor,
    openLiveFor, handleLoadDeliveredRigor,
  ];
}
