/*
 * A TEACHER CHANGES A STUDENT'S OWN ASSIGNMENT CONTROLS — ON THE SERVER.
 *
 * Extra DOL attempts, excuse and reopen for selected students go to the
 * `setStudentAssignmentControls` callable (functions/index.js →
 * functions/shared/studentAssignmentOverrideStore.mjs), the only writer of a
 * student's private record besides the attendance-extension callable. The
 * browser sends the request; the server decides the result from what it holds
 * and returns each student's new controls.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';

/** `{ assignmentId, classId, studentIds, change }` → `{ students: [{ studentId, dolExtraAttempts, … }] }`. */
export const setStudentAssignmentControls = async (request) => {
  const response = await httpsCallable(functions, 'setStudentAssignmentControls')(request);
  return response?.data || {};
};

export default setStudentAssignmentControls;
