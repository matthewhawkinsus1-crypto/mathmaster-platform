import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { EXECUTION_MODES, getExecutionMode } from '../config/executionMode.js';

/*
 * THE TEST CYCLE CALLABLES.
 *
 * Everything a Test Cycle decides — which stage a student may enter, what the
 * recorded grade is, which correction they owe, what the retest asks — is
 * decided on the server. This file asks and renders; it never computes a stage
 * or a grade, because a browser that could work out its own stage could work
 * out that it is allowed into a retest.
 *
 * The sandbox branch exists so the local demo mode has something to show. It
 * deliberately cannot grade: `MOCK_LOCAL` returns a fixed, obviously-sandbox
 * card rather than a plausible score.
 */

const call = (name, data) => httpsCallable(functions, name)(data).then((response) => response.data);
const isSandbox = () => getExecutionMode() === EXECUTION_MODES.MOCK_LOCAL;

const sandboxCard = (assignmentId) => ({
  success: true,
  assignmentId,
  title: 'Test Cycle (sandbox)',
  stage: 'review',
  secure: false,
  hintsAllowed: true,
  canEnter: true,
  actionLabel: 'Start Review',
  statusLabel: 'Review',
  detail: 'Sandbox mode. Secure delivery, grading and Classroom passback are server-side and are not simulated here.',
  examSessionId: null,
  grade: { rows: [], simple: true, recordedGrade: null },
  corrections: null,
});

/** The student's one card for this assessment. */
export const getStudentTestCycle = async ({ assignmentId }) => {
  if (isSandbox()) return sandboxCard(assignmentId);
  return call('getStudentTestCycle', { assignmentId });
};

/** One instructional correction question. Hints and three attempts allowed. */
export const issueTestCycleCorrectionQuestion = async ({ assignmentId, correctionId }) => {
  if (isSandbox()) throw new Error('Corrections are generated on the server and are not available in sandbox mode.');
  return call('issueTestCycleCorrectionQuestion', { assignmentId, correctionId });
};

export const submitTestCycleCorrectionResponse = async ({
  assignmentId, correctionId, questionInstanceId, responsePayload,
}) => {
  if (isSandbox()) throw new Error('Corrections are graded on the server and are not available in sandbox mode.');
  return call('submitTestCycleCorrectionResponse', { assignmentId, correctionId, questionInstanceId, responsePayload });
};

/** Teacher: open secure Test sessions for a class in one action. */
export const assignTestCycleSessions = async ({ assignmentId, classId = null, studentIds = [] }) => {
  if (isSandbox()) return { success: true, assignmentId, createdSessions: 0, reusedSessions: 0, students: [] };
  return call('assignTestCycleSessions', { assignmentId, classId, studentIds });
};

export const preflightTestCycleAssignment = async ({ assignmentId }) => {
  if (isSandbox()) return { success: true, preflight: { errors: [], warnings: [], checks: [], blocked: false } };
  return call('preflightTestCycleAssignment', { assignmentId });
};

export const listTeacherTestCycleRecords = async ({ assignmentId }) => {
  if (isSandbox()) return { success: true, assignmentId, rows: [] };
  return call('listTeacherTestCycleRecords', { assignmentId });
};

export const getTeacherTestCyclePlans = async ({ assignmentId, studentId }) => {
  if (isSandbox()) return { success: true, studentId, record: null, corrections: null, retest: null };
  return call('getTeacherTestCyclePlans', { assignmentId, studentId });
};

/** Teacher overrides: require/waive corrections, unlock/disable retest, reset. */
export const teacherTestCycleAction = async ({ assignmentId, studentId, action, stage = 'test' }) => {
  if (isSandbox()) return { success: true, action, studentId, teacherControls: {}, retestOpened: false };
  return call('teacherTestCycleAction', { assignmentId, studentId, action, stage });
};
