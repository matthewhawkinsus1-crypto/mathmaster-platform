import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase.js';
import { measurePerformanceOperation } from '../platform/performance/performanceTelemetry.js';
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

const call = (name, data) => measurePerformanceOperation(
  'callable_request_ms',
  () => httpsCallable(functions, name)(data).then((response) => response.data),
  { flow: name },
);
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
  phases: [
    { id: 'review', label: 'Review', status: 'available' },
    { id: 'test', label: 'Test', status: 'locked', secure: true, reason: 'Complete Review to unlock Test.' },
    { id: 'corrections', label: 'Corrections', status: 'pending' },
    { id: 'retest', label: 'Retest', status: 'pending', secure: true },
  ],
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
export const assignTestCycleSessions = async ({ assignmentId, classId = null, studentIds = [], originalScores = null }) => {
  if (isSandbox()) return { success: true, assignmentId, createdSessions: 0, reusedSessions: 0, students: [] };
  return call('assignTestCycleSessions', { assignmentId, classId, studentIds, ...(originalScores ? { originalScores } : {}) });
};

export const preflightTestCycleAssignment = async ({ assignmentId }) => {
  if (isSandbox()) return { success: true, preflight: { errors: [], warnings: [], checks: [], blocked: false } };
  return call('preflightTestCycleAssignment', { assignmentId });
};

/** Authoritative pre-save validation for an assignment not in Firestore yet. */
export const preflightTestCycleCandidate = async ({ assignment }) => {
  if (isSandbox()) return { success: true, testCycle: true, preflight: { errors: [], warnings: [], checks: [], blocked: false } };
  return call('preflightTestCycleCandidate', { assignment });
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

/*
 * TEACHER LIFECYCLE ACTIONS. Each is decided on the server, by the teacher of
 * record: release results for a whole class, change the retest policy (locked
 * once results it would contradict are released), preview real secure items
 * (nothing is written), and attach a Test Cycle's contract before any session
 * exists. The sandbox cannot do any of them, and says so instead of pretending.
 */
const sandboxRefusal = (what) => () => { throw new Error(`${what} runs on the server and is not available in sandbox mode.`); };

export const releaseTestCycleResults = async ({ assignmentId, stage = 'test', studentIds = [] }) => {
  if (isSandbox()) return sandboxRefusal('Releasing results')();
  return call('releaseTestCycleResults', { assignmentId, stage, studentIds });
};

// Open the correct answers and worked solutions of a released Test or Retest
// before every student assigned to it has submitted (they open on their own
// once everyone has).
// `confirmed`: the coverage keys (student and attempts) of the students the
// confirm named as still testing. The release covers exactly them, and is
// refused if anyone else is still testing, or an attempt changed since.
export const releaseTestCycleAnswers = async ({ assignmentId, stage = 'test', confirmed = [] }) => {
  if (isSandbox()) return sandboxRefusal('Releasing answers')();
  return call('releaseTestCycleAnswers', { assignmentId, stage, confirmed });
};

export const updateTestCyclePolicy = async ({ assignmentId, policy }) => {
  if (isSandbox()) return sandboxRefusal('Changing the retest policy')();
  return call('updateTestCyclePolicy', { assignmentId, policy });
};

// `stage` picks the capability policy the server stamps on each previewed
// item: 'test' (default) and 'retest' are secure, 'corrections' instructional.
// `candidate` previews a Test Cycle that is not saved yet (the review screen):
// the server is sent its contract (testCycleCandidateContract), never an id.
export const previewTestCycleSecureItems = async ({ assignmentId = null, candidate = null, draw = 1, stage = 'test' }) => {
  if (isSandbox()) return sandboxRefusal('Previewing secure items')();
  return call('previewTestCycleSecureItems', candidate ? { assignment: candidate, draw, stage } : { assignmentId, draw, stage });
};

// A candidate's item is checked against the same candidate it was issued from.
export const gradeTestCyclePreviewItem = async ({ previewItemId, responsePayload, candidate = null }) => {
  if (isSandbox()) return sandboxRefusal('Checking a preview answer')();
  return call('gradeTestCyclePreviewItem', { previewItemId, responsePayload, ...(candidate ? { assignment: candidate } : {}) });
};

export const attachTestCycleContract = async ({ assignmentId, assessmentPolicy, testBlueprint = null, secureTestReference = null }) => {
  if (isSandbox()) return sandboxRefusal('Saving a Test Cycle contract')();
  return call('attachTestCycleContract', { assignmentId, assessmentPolicy, testBlueprint, secureTestReference });
};
