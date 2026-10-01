/*
 * firebase/functions stand-in. Callables the teacher workflow depends on are
 * implemented against the in-memory store with the same contracts the real
 * Cloud Functions enforce (Grade Transfer snapshots are immutable and
 * idempotent by transferId, upload confirmation only stamps once). Anything
 * else resolves to an empty result and is logged, so an unexpected call is
 * visible in the console instead of silently succeeding.
 */
import { harnessStore, Timestamp } from './fakeFirestore.js';
import { TEACHER_EMAIL } from './fixture.js';
import {
  authorizeCaseEvidenceCaller, buildCaseEvidenceResponse, validateCaseEvidenceRequest,
} from '../../../functions/shared/caseReviewEvidence.mjs';
import { workspaceDraftDocumentId } from '../../../functions/shared/workspaceDraftSchema.mjs';

const iso = (value) => (value instanceof Timestamp ? value.toDate().toISOString() : value || null);
const harness = (typeof window !== 'undefined' && (window.__mmHarness = window.__mmHarness || {})) || {};
// Scenario knobs: fail the next N snapshot saves; make weekly Path fail like production did.
harness.failNextPersists = harness.failNextPersists || 0;
harness.weeklyPathFails = new URLSearchParams(window.location.search).get('weeklyPath') !== 'ok';
harness.calls = [];

const handlers = {
  resolveSignedInRole: () => ({ role: 'teacher' }),
  listSignInAccess: () => ({
    // Roster rows only: grades/{id} has subcollections (scratchpads, support
    // evidence …), and their documents are not students.
    students: harnessStore.paths('grades/').filter((path) => path.split('/').length === 2).map((path) => {
      const data = harnessStore.get(path);
      return { studentId: path.split('/')[1], ...data, gradesByAssignment: undefined };
    }),
  }),
  listGradeTransferState: ({ classIds = [] } = {}) => ({
    snapshots: harnessStore.paths('gradeTransferSnapshots/')
      .map((path) => ({ id: path.split('/')[1], ...harnessStore.get(path) }))
      .filter((snapshot) => classIds.includes(snapshot.classId))
      .map((snapshot) => ({ ...snapshot, createdAt: iso(snapshot.createdAt), uploadConfirmedAt: iso(snapshot.uploadConfirmedAt) })),
    practicePassKeys: [],
  }),
  persistGradeTransferSnapshot: ({ snapshot }) => {
    if (harness.failNextPersists > 0) {
      harness.failNextPersists -= 1;
      throw Object.assign(new Error('deadline-exceeded: the save timed out (simulated)'), { code: 'functions/deadline-exceeded' });
    }
    const path = `gradeTransferSnapshots/${snapshot.transferId}`;
    const existing = harnessStore.get(path);
    if (existing) {
      if (JSON.stringify(existing.rows) !== JSON.stringify(snapshot.rows)) throw new Error('already-exists: Transfer id already belongs to a different immutable snapshot.');
      return { transferId: snapshot.transferId };
    }
    harnessStore.set(path, { ...snapshot, teacherEmail: TEACHER_EMAIL, sectionKey: snapshot.sectionKey || null, createdAt: Timestamp.now() });
    return { transferId: snapshot.transferId };
  },
  confirmGradeTransferUploaded: ({ transferId }) => {
    const path = `gradeTransferSnapshots/${transferId}`;
    const existing = harnessStore.get(path);
    if (!existing) throw new Error('not-found: Export snapshot was not found.');
    if (!existing.uploadConfirmedAt) harnessStore.update(path, { uploadConfirmedAt: Timestamp.now(), uploadConfirmedByEmail: TEACHER_EMAIL });
    return { transferId, confirmed: true };
  },
  setStudentSisId: ({ studentId, sisStudentId }) => {
    harnessStore.update(`grades/${studentId}`, { sisStudentId });
    return { studentId, sisStudentId };
  },
  // The Student Case Review's read-only callable, with the real request
  // validation, teacher-of-record decision and response projection
  // (functions/shared/caseReviewEvidence.mjs) over the in-memory store.
  loadStudentCaseEvidence: (data) => {
    const validation = validateCaseEvidenceRequest(data);
    if (!validation.ok) throw Object.assign(new Error(`invalid-argument: ${validation.errors.join(' ')}`), { code: 'functions/invalid-argument' });
    const { studentId, assignmentIds } = validation.request;
    const student = harnessStore.get(`grades/${studentId}`) || null;
    const classRecord = student?.classId ? harnessStore.get(`classes/${student.classId}`) || null : null;
    const decision = authorizeCaseEvidenceCaller({ callerEmail: TEACHER_EMAIL, callerRole: 'teacher', student, classRecord });
    if (!decision.allowed) {
      throw Object.assign(new Error('permission-denied: Only this student\'s teacher may load case review evidence.'), { code: decision.reason === 'student-not-found' ? 'functions/not-found' : 'functions/permission-denied' });
    }
    const wanted = new Set(assignmentIds);
    const events = harnessStore.paths(`grades/${studentId}/evidenceEvents/`)
      .map((path) => ({ id: path.split('/').pop(), data: harnessStore.get(path) }))
      .filter((entry) => wanted.has(entry.data?.source?.assignmentId));
    const receipts = harnessStore.paths('studentSubmissionReceipts/').map((path) => harnessStore.get(path))
      .filter((receipt) => receipt?.studentId === studentId && wanted.has(receipt?.assignmentId));
    const drafts = {};
    assignmentIds.forEach((assignmentId) => {
      const draft = harnessStore.get(`studentWorkspaceDrafts/${workspaceDraftDocumentId({ studentId, assignmentId })}`);
      // The real callable reads these three fields only (a Firestore field mask).
      if (draft) drafts[assignmentId] = { practice: draft.practice, practiceUpdatedAt: draft.practiceUpdatedAt, updatedAt: draft.updatedAt };
    });
    const audits = harnessStore.paths(`grades/${studentId}/gradeOverrideAudits/`).map((path) => harnessStore.get(path));
    return buildCaseEvidenceResponse({ request: validation.request, events, receipts, drafts, audits, nowMs: Date.now() });
  },
  // The Response Inspector reads the live record server-side; the in-memory
  // harness has no grader to replay, so it says so instead of rendering {}.
  inspectStudentResponse: () => {
    throw Object.assign(new Error('The Response Inspector is not available in the in-memory harness.'), { code: 'functions/failed-precondition' });
  },
  getTeacherWeeklyPathCompletions: () => {
    if (harness.weeklyPathFails) throw Object.assign(new Error('internal'), { code: 'functions/internal' });
    return { byStudentId: {}, goalsByStudentId: {}, truncated: false };
  },
};

export const getFunctions = () => ({ region: 'harness' });
export const connectFunctionsEmulator = () => {};
export const httpsCallable = (_functions, name) => async (data) => {
  harness.calls.push({ name, at: Date.now() });
  const handler = handlers[name];
  if (!handler) {
    console.info(`[teacher harness] callable "${name}" has no fake; returning {}`);
    return { data: {} };
  }
  return { data: await handler(data || {}) };
};
