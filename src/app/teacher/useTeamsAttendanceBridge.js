/*
 * THE TEAMS ATTENDANCE BRIDGE, ON EVERY TEACHER SCREEN.
 *
 * Installs `window.mathmasterTeamsAttendance`
 * (platform/attendance/teamsAttendanceBridge.js) while a teacher is signed
 * in, so the MathMaster extension can mirror TEAMS attendance whichever
 * screen is open. Every mark goes through `recordAttendance`, App's one
 * attendance handler (createAttendanceExtensionControls'
 * handleRecordStudentSupportEvent), quietly: the same record and the same
 * deadline reconciliation as a mark taken in Live Classroom.
 *
 * The bridge and everything it uses load after the workspace has drawn, so a
 * teacher's first load carries none of it.
 */
import { useEffect, useRef } from 'react';
import { db } from '../../firebase';
import { formatStudentName } from '../../platform/studentName';

export default function useTeamsAttendanceBridge({ user, classes, students, recordAttendance }) {
  const context = useRef(null);
  useEffect(() => {
    const teacherEmail = user?.role === 'teacher' ? String(user.email || '').trim().toLowerCase() : '';
    context.current = {
      ready: Boolean(teacherEmail) && typeof recordAttendance === 'function',
      teacherEmail,
      classes: classes || [],
      students: students || [],
      fetchRecords: async ({ classId, fromDateKey, toDateKey }) => (await import('../../platform/teacher/studentSupportStore.js'))
        .fetchAttendanceForClassDateRange({ db, teacherEmail, classId, fromDateKey, toDateKey }),
      recordAttendance: (event) => recordAttendance(event, { quiet: true }),
      // As the attendance builders name a student on a record.
      nameOf: (student) => formatStudentName(student, { lastFirst: false, fallbackToNeutral: false }) || null,
    };
  });
  useEffect(() => {
    let undo = () => {};
    let closed = false;
    import('../../platform/attendance/teamsAttendanceBridge.js').then(({ createTeamsAttendanceBridge, installTeamsAttendanceBridge }) => {
      if (!closed) undo = installTeamsAttendanceBridge(createTeamsAttendanceBridge({ getContext: () => context.current || { ready: false } }));
    }).catch(() => {});
    return () => { closed = true; undo(); };
  }, []);
}
