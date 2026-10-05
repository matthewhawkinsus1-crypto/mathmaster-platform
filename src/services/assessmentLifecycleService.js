import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { EXECUTION_MODES, getExecutionMode } from '../config/executionMode.js';

/*
 * ARCHIVE, PAUSE, OR DELETE AN ASSIGNMENT — THROUGH THE SERVER.
 *
 * These used to be direct Firestore writes from the teacher's browser: archive
 * was a client toggle the server never read, and delete read every grade
 * document in the school, which the rules refuse for an ordinary teacher (so
 * delete failed) and which, for the administrator, erased student evidence.
 *
 * Now each is a decision the server makes for the teacher of record: archive
 * and pause are always allowed and reversible; delete is allowed only while no
 * student has worked on the assignment, and the summary call says, before the
 * teacher confirms, which of those is true.
 */
const call = (name, data) => httpsCallable(functions, name)(data).then((response) => response.data);
const isSandbox = () => getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL;

export const ASSIGNMENT_LIFECYCLE_ACTIONS = Object.freeze(['archive', 'unarchive', 'unpublish', 'publish', 'delete']);

export const getAssignmentEvidenceSummary = async ({ assignmentId }) => {
  if (isSandbox()) {
    return { success: true, assignmentId, studentsWithWork: 0, testCycleRecords: 0, secureSessions: 0, startedSecureSessions: 0, classroomPublications: 0, canDelete: true };
  }
  return call('getAssignmentEvidenceSummary', { assignmentId });
};

export const manageAssignmentLifecycle = async ({ assignmentId, action, confirmTitle = '', acknowledgeClassroom = false }) => {
  if (!ASSIGNMENT_LIFECYCLE_ACTIONS.includes(action)) throw new Error(`Unsupported assignment action: ${action}`);
  if (isSandbox()) throw new Error('Archiving, pausing and deleting run on the server and are not available in sandbox mode.');
  return call('manageAssignmentLifecycle', { assignmentId, action, confirmTitle, acknowledgeClassroom });
};
