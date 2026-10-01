/*
 * firebase/functions stand-in. Callables the teacher workflow depends on are
 * implemented against the in-memory store with the same contracts the real
 * Cloud Functions enforce (Grade Transfer snapshots are immutable and
 * idempotent by transferId, upload confirmation only stamps once). Anything
 * else resolves to an empty result and is logged, so an unexpected call is
 * visible in the console instead of silently succeeding.
 */
import { deleteField, harnessStore, recordHarnessCallable, Timestamp } from './fakeFirestore.js';
import { TEACHER_EMAIL } from './fixture.js';
import {
  authorizeCaseEvidenceCaller, buildCaseEvidenceResponse, validateCaseEvidenceRequest,
} from '../../../functions/shared/caseReviewEvidence.mjs';
import { workspaceDraftDocumentId } from '../../../functions/shared/workspaceDraftSchema.mjs';
import {
  STUDENT_IDENTITY_FIELDS, TEACHER_ROSTER_SELECT_FIELDS,
  buildTeacherRosterSummaryRow, compareStudentIdentities, validateStudentNameInput,
} from '../../../functions/shared/studentIdentity.mjs';

const iso = (value) => (value instanceof Timestamp ? value.toDate().toISOString() : value || null);
const harness = (typeof window !== 'undefined' && (window.__mmHarness = window.__mmHarness || {})) || {};
// Scenario knobs: fail the next N snapshot saves; make weekly Path fail like production did.
harness.failNextPersists = harness.failNextPersists || 0;
harness.weeklyPathFails = new URLSearchParams(window.location.search).get('weeklyPath') !== 'ok';
harness.calls = [];
// The signed-in teacher is a teacher of record, not the root administrator.
// `window.__mmHarness.rootAdmin = true` widens the roster the way the real
// callable does for a root admin.
harness.rootAdmin = harness.rootAdmin === true;
// `?rosterSelect=legacy` replays the roster projection production shipped
// before the shared identity contract (PR #314's select, which had no
// googleName, and its copied row) — for reproducing the "numeric id where a
// name belongs" defect against an older client. Default: today's projection.
harness.legacyRosterSelect = new URLSearchParams(window.location.search).get('rosterSelect') === 'legacy';
const LEGACY_ROSTER_SELECT_FIELDS = ['classPeriod', 'classId', 'status', 'linkedEmail', 'assignedTeacherEmail', 'displayName', 'firstName', 'lastName', 'profile', 'sisStudentId'];
const legacyRosterRow = (studentId, data, { credential = null, linkedEmail = null } = {}) => ({
  studentId,
  firstName: data.firstName || null,
  lastName: data.lastName || null,
  displayName: data.displayName || null,
  classId: data.classId || null,
  classPeriod: data.classPeriod || 'Unassigned',
  status: data.status === 'disabled' ? 'disabled' : 'active',
  assignedTeacherEmail: data.assignedTeacherEmail || null,
  sisStudentId: data.sisStudentId || null,
  profile: data.profile && typeof data.profile === 'object' ? data.profile : {},
  hasPasscode: Boolean(credential?.hash) && credential?.resetRequired !== true,
  resetRequired: credential?.resetRequired === true,
  linkedEmail: linkedEmail || data.linkedEmail || null,
});

const callableError = (code, message) => Object.assign(new Error(message), { code: `functions/${code}` });
const lower = (value) => String(value || '').trim().toLowerCase();
// A Firestore field mask over one in-memory document: only the named fields.
const selectFields = (data, fields) => Object.fromEntries(fields.filter((field) => data?.[field] !== undefined).map((field) => [field, data[field]]));
// Roster documents only: grades/{id} has subcollections (scratchpads, support
// evidence …), and their documents are not students.
const rosterPaths = () => harnessStore.paths('grades/').filter((path) => path.split('/').length === 2);
const collectionDocs = (name) => harnessStore.paths(`${name}/`).filter((path) => path.split('/').length === 2)
  .map((path) => ({ id: path.split('/')[1], data: harnessStore.get(path) || {} }));

const handlers = {
  resolveSignedInRole: () => ({ role: 'teacher' }),
  // listSignInAccess (functions/index.js) as deployed: grades read through
  // .select(...TEACHER_ROSTER_SELECT_FIELDS) — names (googleName included),
  // class membership, account state, the support profile, never the attempt
  // history — then the credential / Google-link joins, the teacher-of-record
  // filter, the shared row builder and the shared roster order.
  listSignInAccess: () => {
    const caller = lower(TEACHER_EMAIL);
    const isRootAdmin = harness.rootAdmin === true;
    const canonicalByKey = Object.fromEntries(collectionDocs('studentAliases').map(({ id, data }) => [id, data.studentId || id]));
    const emailByStudent = {};
    collectionDocs('studentDirectory').forEach(({ id, data }) => { if (data.studentId) emailByStudent[data.studentId] = id; });
    const credentialByStudent = {};
    collectionDocs('studentCredentials').forEach(({ id, data }) => { credentialByStudent[canonicalByKey[id] || id] = data; });
    const legacy = harness.legacyRosterSelect === true;
    const students = rosterPaths()
      .map((path) => ({ id: path.split('/')[1], data: selectFields(harnessStore.get(path), legacy ? LEGACY_ROSTER_SELECT_FIELDS : TEACHER_ROSTER_SELECT_FIELDS) }))
      .filter(({ id }) => id !== 'test_connection')
      .filter(({ data }) => isRootAdmin || lower(data.assignedTeacherEmail) === caller)
      .map(({ id, data }) => (legacy ? legacyRosterRow : buildTeacherRosterSummaryRow)(id, data, {
        credential: credentialByStudent[id],
        linkedEmail: emailByStudent[id],
      }))
      .sort(compareStudentIdentities);
    const classes = collectionDocs('classes')
      .map(({ id, data }) => ({ classId: id, ...data }))
      .filter((entry) => isRootAdmin || lower(entry.teacherOfRecord) === caller)
      .sort((a, b) => String(a.period || '').localeCompare(String(b.period || ''), undefined, { numeric: true })
        || String(a.name || '').localeCompare(String(b.name || '')));
    return {
      students,
      classes,
      authority: { accessLevel: isRootAdmin ? 'rootAdmin' : 'teacher', isRootAdmin, email: TEACHER_EMAIL },
      teachers: [],
      bootstrapTeachers: [],
    };
  },
  // setStudentName (functions/index.js): the same authorization (root admin,
  // the roster teacher, or the class's teacher of record), the same field-mask
  // read, the same validation against both ids, and the same write — the three
  // name fields and their provenance only, identityBackfill removed — plus the
  // audit entry. Grades, history and every other field are never touched.
  setStudentName: ({ studentId: rawId, firstName, lastName } = {}) => {
    const studentId = String(rawId || '').trim();
    if (!studentId || studentId.length > 180 || studentId.includes('/')) throw callableError('invalid-argument', 'studentId is required.');
    const path = `grades/${studentId}`;
    const stored = harnessStore.get(path);
    if (!stored) throw callableError('not-found', 'That student is not on the MathMaster roster.');
    const student = selectFields(stored, [...STUDENT_IDENTITY_FIELDS, 'assignedTeacherEmail', 'classId', 'sisStudentId', 'status']);
    const caller = lower(TEACHER_EMAIL);
    const classRecord = student.classId ? harnessStore.get(`classes/${student.classId}`) : null;
    const authorized = harness.rootAdmin === true
      || lower(student.assignedTeacherEmail) === caller
      || (classRecord && lower(classRecord.teacherOfRecord) === caller);
    if (!authorized) throw callableError('permission-denied', "Only this student's teacher of record can change the student's name.");
    const validated = validateStudentNameInput({ firstName, lastName }, { studentId, sisStudentId: student.sisStudentId || '' });
    if (!validated.ok) throw callableError('invalid-argument', validated.error);
    const next = { firstName: validated.firstName, lastName: validated.lastName, displayName: validated.displayName };
    const storedText = (value) => (typeof value === 'string' ? value : null);
    const previous = { firstName: storedText(student.firstName), lastName: storedText(student.lastName), displayName: storedText(student.displayName) };
    harnessStore.update(path, { ...next, nameUpdatedAt: Timestamp.now(), nameUpdatedBy: TEACHER_EMAIL, identityBackfill: deleteField() });
    harnessStore.set(`adminAuditLog/name_${studentId}_${Date.now()}`, {
      actorUid: 'harness-teacher-uid', actorEmail: TEACHER_EMAIL, action: 'student_name_set', target: studentId,
      details: { previous, next }, createdAt: Timestamp.now(),
    });
    return { studentId, ...next };
  },
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
// Every call is counted (harnessStore.stats().callables) with the JSON size of
// what it returned (callableBytes), so a probe can see the roster payload.
const responseBytes = (value) => { try { return JSON.stringify(value ?? {}).length; } catch { return null; } };
export const httpsCallable = (_functions, name) => async (data) => {
  harness.calls.push({ name, at: Date.now() });
  const handler = handlers[name];
  if (!handler) {
    recordHarnessCallable(name, 2);
    console.info(`[teacher harness] callable "${name}" has no fake; returning {}`);
    return { data: {} };
  }
  try {
    const result = await handler(data || {});
    recordHarnessCallable(name, responseBytes(result));
    return { data: result };
  } catch (error) {
    recordHarnessCallable(name, null);
    throw error;
  }
};
