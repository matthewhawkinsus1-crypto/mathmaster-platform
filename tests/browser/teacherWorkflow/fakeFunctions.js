/*
 * firebase/functions stand-in. Callables the teacher workflow depends on are
 * implemented against the in-memory store with the same contracts the real
 * Cloud Functions enforce (Grade Transfer snapshots are immutable and
 * idempotent by transferId, upload confirmation only stamps once).
 *
 * ANY OTHER CALLABLE FAILS, LOUDLY. It used to resolve `{}`, which every
 * caller reads as "nothing to report" — so a screen whose callable the
 * harness never implemented looked like a screen with nothing in it, and a
 * broken path passed. Now it rejects the way Firebase does for a function
 * that is not deployed (`functions/unimplemented`), logs a console error, and
 * is recorded in `window.__mmHarness.unimplementedCalls`, which every journey
 * reports as a finding. Give the harness a fake when a journey needs one.
 */
import { deleteField, harnessStore, recordHarnessCallable, Timestamp } from './fakeFirestore.js';
import { TEACHER_EMAIL } from './fixture.js';
import {
  authorizeCaseEvidenceCaller, buildCaseEvidenceResponse, validateCaseEvidenceRequest,
} from '../../../functions/shared/caseReviewEvidence.mjs';
import { workspaceDraftDocumentId } from '../../../functions/shared/workspaceDraftSchema.mjs';
import { explainStudentChallengeRewards } from '../../../functions/shared/rewardDiagnostics.mjs';
import {
  STUDENT_IDENTITY_FIELDS, TEACHER_ROSTER_SELECT_FIELDS,
  buildTeacherRosterSummaryRow, compareStudentIdentities, validateStudentNameInput,
} from '../../../functions/shared/studentIdentity.mjs';

const iso = (value) => (value instanceof Timestamp ? value.toDate().toISOString() : value || null);
const harness = (typeof window !== 'undefined' && (window.__mmHarness = window.__mmHarness || {})) || {};
const lower = (value) => String(value ?? '').trim().toLowerCase();
const rejection = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code: `functions/${code}` });
// The signed-in student, as fakeAuth.js signs one in (`?as=student&studentId=`).
const signedInStudentId = () => {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  return params.get('as') === 'student' ? (params.get('studentId') || '910002') : null;
};
const requireStudent = () => {
  const studentId = signedInStudentId();
  if (!studentId) throw rejection('permission-denied', 'A student session is required.');
  return studentId;
};
// The class's teacher of record (the harness teacher) or a refusal, as the
// server's requireClassTeacher decides.
const requireClassTeacher = (classId) => {
  const cls = String(classId || '').trim();
  if (!cls) throw rejection('invalid-argument', 'classId is required.');
  const record = harnessStore.get(`classes/${cls}`);
  if (!record) throw rejection('not-found', 'That class no longer exists.');
  if (lower(record.teacherOfRecord) !== lower(TEACHER_EMAIL)) throw rejection('permission-denied', 'Only the teacher of record for this class can change this.');
  return cls;
};
// The documents of a top-level collection whose fields match.
const documentsWhere = (collectionName, fields) => harnessStore.paths(`${collectionName}/`)
  .filter((path) => path.split('/').length === 2)
  .map((path) => ({ id: path.split('/')[1], ...harnessStore.get(path) }))
  .filter((entry) => Object.entries(fields).every(([key, value]) => entry[key] === value));
const plainTimes = (entry) => ({ ...entry, createdAt: iso(entry.createdAt), updatedAt: iso(entry.updatedAt) });
// Scenario knobs: fail the next N snapshot saves; make weekly Path fail like production did.
harness.failNextPersists = harness.failNextPersists || 0;
harness.weeklyPathFails = new URLSearchParams(window.location.search).get('weeklyPath') !== 'ok';
harness.calls = [];
harness.unimplementedCalls = [];
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
// A Firestore field mask over one in-memory document: only the named fields.
const selectFields = (data, fields) => Object.fromEntries(fields.filter((field) => data?.[field] !== undefined).map((field) => [field, data[field]]));
// Roster documents only: grades/{id} has subcollections (scratchpads, support
// evidence …), and their documents are not students.
const rosterPaths = () => harnessStore.paths('grades/').filter((path) => path.split('/').length === 2);
const collectionDocs = (name) => harnessStore.paths(`${name}/`).filter((path) => path.split('/').length === 2)
  .map((path) => ({ id: path.split('/')[1], data: harnessStore.get(path) || {} }));

const handlers = {
  resolveSignedInRole: () => ({ role: 'teacher' }),
  // listClassJoinCodes (functions/index.js) as deployed: the ACTIVE codes in
  // classJoinCodes, each only for a class the caller is teacher of record of;
  // a code with no class only for a root admin. Sign-in Access loads it with
  // listSignInAccess, so without it that whole screen fails to load.
  listClassJoinCodes: () => {
    const caller = lower(TEACHER_EMAIL);
    const isRootAdmin = harness.rootAdmin === true;
    const visibleClassIds = new Set(collectionDocs('classes')
      .map(({ id, data }) => ({ classId: id, ...data }))
      .filter((entry) => isRootAdmin || lower(entry.teacherOfRecord) === caller)
      .map((entry) => String(entry.classId)));
    return {
      codes: collectionDocs('classJoinCodes')
        .filter(({ data }) => data.active === true)
        .map(({ id, data }) => ({ code: id, ...data }))
        .filter((entry) => (entry.classId ? visibleClassIds.has(String(entry.classId)) : isRootAdmin))
        .map((entry) => ({
          code: entry.code,
          classId: entry.classId || null,
          className: entry.className || null,
          classPeriod: entry.classPeriod || 'Unassigned',
        })),
    };
  },
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
  // A class's weekly Path auto-publish setting (functions/index.js
  // getWeeklyPathClassroomSync / setWeeklyPathClassroomSync): the class's
  // teacher of record only; off at 100 points until a teacher turns it on.
  getWeeklyPathClassroomSync: ({ classId } = {}) => {
    const cls = requireClassTeacher(classId);
    const config = harnessStore.get(`weeklyPathClassroomConfig/${cls}`) || null;
    return {
      classId: cls,
      enabled: config?.enabled === true,
      maxPoints: Number(config?.maxPoints) || 100,
      updatedAt: iso(config?.updatedAt),
      updatedByEmail: config?.updatedByEmail || null,
    };
  },
  setWeeklyPathClassroomSync: ({ classId, enabled, maxPoints } = {}) => {
    const cls = requireClassTeacher(classId);
    const requested = Number(maxPoints);
    const points = Number.isFinite(requested) ? Math.max(1, Math.min(1000, Math.round(requested))) : 100;
    harnessStore.set(`weeklyPathClassroomConfig/${cls}`, {
      ...harnessStore.get(`weeklyPathClassroomConfig/${cls}`),
      classId: cls, enabled: enabled === true, maxPoints: points, updatedByEmail: TEACHER_EMAIL, updatedAt: Timestamp.now(),
    });
    return { classId: cls, enabled: enabled === true, maxPoints: points };
  },
  // A teacher's read of one student's rewards, as
  // functions/shared/rewardActionStore.mjs loadStudentRewardsForTeacher does it
  // (that module imports node:crypto, so its reads are mirrored here): the
  // class's teacher of record only, the student in that class, then the
  // student's grants, redemptions, latest Class Points and Live Challenge
  // reward explanations for the class.
  getStudentRewards: ({ studentId, classId } = {}) => {
    const student = String(studentId || '').trim();
    const cls = String(classId || '').trim();
    if (!student || !cls) throw rejection('invalid-argument', 'Choose a student and a class.');
    const classRecord = harnessStore.get(`classes/${cls}`) || null;
    const studentRecord = harnessStore.get(`grades/${student}`) || null;
    if (!classRecord || !studentRecord) throw rejection('not-found', 'That class or student was not found.');
    if (String(studentRecord.classId || '') !== cls) throw rejection('failed-precondition', 'This student does not currently belong to that class.');
    if (lower(classRecord.teacherOfRecord) !== lower(TEACHER_EMAIL) || lower(studentRecord.assignedTeacherEmail) !== lower(classRecord.teacherOfRecord)) {
      throw rejection('permission-denied', "Only this class's teacher of record may do that.");
    }
    const account = harnessStore.get(`classPointAccounts/${student.length}:${student}:${cls}`) || {};
    const matches = harnessStore.paths('liveChallengeMatchResults/')
      .map((path) => ({ roomId: path.split('/')[1], ...harnessStore.get(path) }))
      .filter((match) => Array.isArray(match.studentIds) && match.studentIds.includes(student) && match.classId === cls)
      .sort((a, b) => (Number(b.finalizedAtMs) || 0) - (Number(a.finalizedAtMs) || 0))
      .slice(0, 6);
    return {
      studentId: student,
      classId: cls,
      account: { balance: Number(account.balance) || 0, lifetimeEarned: Number(account.lifetimeEarned) || 0, lifetimeSpent: Number(account.lifetimeSpent) || 0 },
      grants: documentsWhere('rewardGrants', { studentId: student, classId: cls }).map(plainTimes),
      redemptions: documentsWhere('classPointRewardRedemptions', { studentId: student, classId: cls }).map(plainTimes),
      transactions: documentsWhere('classPointTransactions', { studentId: student, classId: cls })
        .sort((a, b) => (Number(new Date(iso(b.createdAt) || 0)) || 0) - (Number(new Date(iso(a.createdAt) || 0)) || 0))
        .slice(0, 30)
        .map(plainTimes),
      challenges: matches.map((match) => explainStudentChallengeRewards({
        matchResult: match, job: harnessStore.get(`liveChallengeAchievementJobs/${match.roomId}`) || null, studentId: student,
      })),
    };
  },
  // The signed-in student's frozen weekly Path commitment, if one exists
  // (functions/index.js getStudentWeeklyPathGoalSnapshot).
  getStudentWeeklyPathGoalSnapshot: ({ weekKey } = {}) => {
    const studentId = requireStudent();
    const key = String(weekKey || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(Date.parse(`${key}T00:00:00Z`))) {
      throw rejection('invalid-argument', 'A valid weekly Path weekKey is required.');
    }
    return { success: true, goal: harnessStore.get(`weeklyPathGoalSnapshots/${studentId}__${key}`) || null };
  },
  // A student device's report of what its durable queue still holds
  // (functions/index.js reportStudentDeviceQueue): counts only, written as a
  // whole snapshot, and only when strictly newer than the stored report.
  reportStudentDeviceQueue: ({ deviceId, reportGeneration, summary } = {}) => {
    const studentId = requireStudent();
    const device = String(deviceId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (!device) throw rejection('invalid-argument', 'A device id is required.');
    const report = summary && typeof summary === 'object' ? summary : {};
    const number = (value) => Math.max(0, Math.min(100_000, Number(value) || 0));
    const counts = (value, encodeKeys = false) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {})
      .slice(0, 40).map(([key, count]) => [encodeKeys ? encodeURIComponent(String(key)).slice(0, 300) : String(key).slice(0, 80), number(count)]));
    const generation = Math.max(0, Number(reportGeneration) || 0);
    const summarySchemaVersion = Math.max(1, Number(report.summarySchemaVersion) || 1);
    const path = `studentDevicePersistenceReports/${encodeURIComponent(studentId)}__${device}`;
    const previous = harnessStore.get(path) || {};
    const stored = Math.max(0, Number(previous.reportGeneration) || 0);
    if (!(generation === 0 && stored === 0) && generation <= stored) {
      return { success: true, applied: false, ignored: true, reason: 'superseded-by-newer-report', reportGeneration: generation, storedReportGeneration: stored, summarySchemaVersion };
    }
    harnessStore.set(path, {
      studentId,
      deviceId: device,
      summarySchemaVersion,
      reportGeneration: generation,
      classId: harnessStore.get(`grades/${studentId}`)?.classId || null,
      queued: number(report.queued),
      queuedGradeBearing: number(report.queuedGradeBearing),
      queuedByKind: counts(report.queuedByKind),
      queuedByAssignment: counts(report.queuedByAssignment, true),
      queuedGradeBearingByAssignment: counts(report.queuedGradeBearingByAssignment, true),
      needsReview: number(report.needsReview),
      retired: number(report.retired),
      firstReportedAt: previous.firstReportedAt || Timestamp.now(),
      reportedAt: Timestamp.now(),
    });
    return { success: true, applied: true, ignored: false, reportGeneration: generation, summarySchemaVersion };
  },
};

export const getFunctions = () => ({ region: 'harness' });
export const connectFunctionsEmulator = () => {};
export const unimplementedCallableError = (name) => Object.assign(
  new Error(`The teacher harness has no fake for the callable "${name}" (functions/unimplemented). Add one to tests/browser/teacherWorkflow/fakeFunctions.js if a journey needs it.`),
  { code: 'functions/unimplemented', details: { callable: name } },
);

// Every call is counted (harnessStore.stats().callables) with the JSON size of
// what it returned (callableBytes), so a probe can see the roster payload.
const responseBytes = (value) => { try { return JSON.stringify(value ?? {}).length; } catch { return null; } };
export const httpsCallable = (_functions, name) => async (data) => {
  harness.calls.push({ name, at: Date.now() });
  const handler = handlers[name];
  if (!handler) {
    harness.unimplementedCalls.push(name);
    recordHarnessCallable(name, null);
    console.error(`[teacher harness] callable "${name}" is not implemented in the harness; the call fails as an undeployed function would.`);
    throw unimplementedCallableError(name);
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
