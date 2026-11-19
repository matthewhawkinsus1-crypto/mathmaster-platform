/*
 * OPENING A STUDENT'S SCRATCHPAD FOR THE TEACHER.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It runs no effects.
 */
import { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export function useTeacherScratchpad({ setTeacherScratchpadDialog, getScratchpadDocumentId, loadScratchpadRecord }) {
  const [teacherScratchpadLoading, setTeacherScratchpadLoading] = useState(false);

  const openTeacherScratchpad = async (studentId, assignmentId, questionIndex) => {
    const scratchpadId = getScratchpadDocumentId(assignmentId, questionIndex);
    setTeacherScratchpadLoading(true);
    setTeacherScratchpadDialog({
      studentId,
      assignmentId,
      questionIndex,
      dataUrl: '',
      missing: false,
    });
    try {
      // A teacher reviewing three pages of working must see three pages. Reading
      // only page one would show the first third of a solution and silently call
      // it the whole answer.
      const record = await loadScratchpadRecord(async (id) => {
        const snapshot = await getDoc(doc(db, 'grades', studentId, 'scratchpads', id));
        return snapshot.exists() ? snapshot.data() : null;
      }, scratchpadId);
      const pages = (record?.pages || []).filter(Boolean);
      setTeacherScratchpadDialog({
        studentId,
        assignmentId,
        questionIndex,
        dataUrl: pages[0] || '',
        pages,
        missing: !pages.length,
      });
    } catch (error) {
      console.error('Could not load student work:', error);
      setTeacherScratchpadDialog({
        studentId,
        assignmentId,
        questionIndex,
        dataUrl: '',
        missing: true,
        error: error.message,
      });
    } finally {
      setTeacherScratchpadLoading(false);
    }
  };
  return { teacherScratchpadLoading, openTeacherScratchpad };
}
