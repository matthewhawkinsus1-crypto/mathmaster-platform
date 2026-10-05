// Stands in for src/services/testCycleService.js, secureExamService.js and
// assessmentLifecycleService.js in the Test Cycle LIFECYCLE QA harness
// (tests/browser/testCycleLifecycleQa.mjs), and nowhere else.
//
// Nothing here fakes the server. Every callable is posted to a local bridge
// that runs the REAL handler (functions/platformEntry.js) against the Firestore
// emulator, under the identity this page was opened as
// (?as=student&studentId=… or ?as=teacher&email=…). So a student's Start Test
// meets the real Review gate, an answer is graded by the real secure grader, a
// release writes the real record, and every screen renders what the server
// actually returned — the same payloads production returns.
//
// The driver can take the network away (window.__mmBridgeOffline = true) to
// exercise the secure exam's offline save path.

const params = new URLSearchParams(window.location.search);
const BRIDGE = params.get('bridge') || 'http://localhost:5297';

window.__mmIdentity = params.get('as') === 'teacher'
  ? { as: 'teacher', email: params.get('email') }
  : { as: 'student', studentId: params.get('studentId') };
window.__mmBridgeCalls = [];

const call = (name) => async (payload = {}) => {
  const entry = { name, at: Date.now(), payload };
  window.__mmBridgeCalls.push(entry);
  if (window.__mmBridgeOffline) {
    const error = new Error('Simulated network outage.');
    error.code = 'functions/unavailable';
    entry.error = error.code;
    throw error;
  }
  const response = await fetch(`${BRIDGE}/call/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: window.__mmIdentity, data: payload }),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.message || name);
    error.code = `functions/${body.code || 'internal'}`;
    error.details = body.details;
    entry.error = error.code;
    throw error;
  }
  entry.ok = true;
  return body.data || {};
};

/* --- testCycleService ------------------------------------------------------ */
export const getStudentTestCycle = call('getStudentTestCycle');
export const issueTestCycleCorrectionQuestion = call('issueTestCycleCorrectionQuestion');
export const submitTestCycleCorrectionResponse = call('submitTestCycleCorrectionResponse');
export const assignTestCycleSessions = call('assignTestCycleSessions');
export const preflightTestCycleAssignment = call('preflightTestCycleAssignment');
export const preflightTestCycleCandidate = call('preflightTestCycleCandidate');
export const listTeacherTestCycleRecords = call('listTeacherTestCycleRecords');
export const getTeacherTestCyclePlans = call('getTeacherTestCyclePlans');
export const teacherTestCycleAction = call('teacherTestCycleAction');
export const releaseTestCycleResults = call('releaseTestCycleResults');
export const updateTestCyclePolicy = call('updateTestCyclePolicy');
export const previewTestCycleSecureItems = call('previewTestCycleSecureItems');
export const gradeTestCyclePreviewItem = call('gradeTestCyclePreviewItem');
export const attachTestCycleContract = call('attachTestCycleContract');

/* --- secureExamService ----------------------------------------------------- */
const submitSecureExamResponseCall = call('submitSecureExamResponse');
export const createSecureExamSession = call('createSecureExamSession');
export const listStudentSecureExamSessions = call('listStudentSecureExamSessions');
export const getStudentSecureExamReview = call('getStudentSecureExamReview');
export const startSecureExamSession = call('startSecureExamSession');
export const issueSecureExamQuestion = call('issueSecureExamQuestion');
export const saveSecureExamDraft = call('saveSecureExamDraft');
export const submitSecureExamResponse = (payload = {}) => submitSecureExamResponseCall({
  ...payload,
  submissionId: payload.submissionId || `qa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
});
export const recordSecureExamIntegrityEvent = call('recordSecureExamIntegrityEvent');
export const finalizeSecureExam = call('finalizeSecureExam');
export const listProctorExamSessions = call('listProctorExamSessions');
export const proctorExamAction = call('proctorExamAction');

/* --- assessmentLifecycleService -------------------------------------------- */
export const ASSIGNMENT_LIFECYCLE_ACTIONS = Object.freeze(['archive', 'unarchive', 'unpublish', 'publish', 'delete']);
export const getAssignmentEvidenceSummary = call('getAssignmentEvidenceSummary');
export const manageAssignmentLifecycle = call('manageAssignmentLifecycle');
