/*
 * THE ABSENCE HOOK FOR RECOVERY.
 *
 * Recovery has two kinds — an ordinary (capped) recovery, and an excused
 * make-up that may earn full credit. Which one applies is an ATTENDANCE fact,
 * so it is decided here, from the platform's own attendance records, and the
 * Recovery code only ever receives the answer ({ excused }). No attendance
 * rule lives in assignment or grading code.
 *
 * Only an explicit teacher "excused" mark for the original instructional day
 * qualifies. A Live Classroom quick "absent" carries no excused/unexcused
 * opinion, so it gets ordinary recovery until a teacher classifies it — the
 * same conservative reading the absence policy already uses.
 *
 * Students cannot read attendance; the server resolves this when it starts
 * and records a Recovery.
 *
 * Pure: no Firestore.
 */

import { ATTENDANCE_DAY_MARK, effectiveAttendanceForStudentDay } from './attendanceDay.mjs';

export const resolveRecoveryAttendance = ({
  supportEvents = [],
  studentId = null,
  classId = null,
  classPeriod = null,
  dateKey = null,
} = {}) => {
  if (!dateKey) return { dateKey: null, mark: null, excused: false, classified: false };
  const effective = effectiveAttendanceForStudentDay({ supportEvents, studentId, classId, classPeriod, dateKey });
  return {
    dateKey,
    mark: effective.mark || null,
    excused: effective.mark === ATTENDANCE_DAY_MARK.EXCUSED,
    classified: effective.classified === true,
    markSource: effective.markSource || null,
  };
};
