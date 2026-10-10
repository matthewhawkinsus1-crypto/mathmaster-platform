/*
 * The override records (private extensions, reopens, excusals) of EVERY class
 * an assignment is assigned to, read once when the teacher releases its
 * feedback. The screens' own listener holds only the classes on screen
 * (teacherClassControls.js); a release opens solutions everywhere, so it
 * reads everywhere it can. The query is the listener's own (rules-scoped to
 * this teacher), in groups of the listener's class limit.
 *
 * Resolves to student id -> record, or null when any read fails (the release
 * confirm then says those classes could not be checked).
 */
import { getDocs } from 'firebase/firestore';
import {
  MAX_TEACHER_CONTROLS_CLASSES,
  controlsByAssignment,
  normalizeControlsClassIds,
  teacherClassControlsQuery,
} from '../../platform/teacher/teacherClassControls.js';

export const readReleaseControls = async ({
  db, assignment, email = '', isRootAdmin = false, read = getDocs, buildQuery = teacherClassControlsQuery,
}) => {
  const classIds = normalizeControlsClassIds(assignment?.assignedClassIds || []);
  const all = [...new Set((assignment?.assignedClassIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (all.length > classIds.length) {
    // normalizeControlsClassIds caps at the listener limit; read the rest too.
    classIds.push(...all.filter((id) => !classIds.includes(id)));
  }
  const records = {};
  try {
    for (let start = 0; start < classIds.length; start += MAX_TEACHER_CONTROLS_CLASSES) {
      const group = classIds.slice(start, start + MAX_TEACHER_CONTROLS_CLASSES);
      const snapshot = await read(buildQuery(db, { email, isRootAdmin, classIds: group }));
      Object.assign(records, controlsByAssignment(snapshot.docs, group).byAssignment[assignment.id] || {});
    }
  } catch (error) {
    console.error('Could not read students’ extensions for the feedback release:', error);
    return null;
  }
  return records;
};
