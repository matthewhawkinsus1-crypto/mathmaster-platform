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
import { arrayRemove, deleteField, harnessStore, recordHarnessCallable, Timestamp } from './fakeFirestore.js';
import { TEACHER_EMAIL } from './fixture.js';
import {
  ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION,
  OVERRIDE_CHANGE,
  OVERRIDE_MIGRATION_ID,
  OVERRIDE_STORAGE_FLAG,
  PLATFORM_MIGRATIONS_COLLECTION,
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  buildAssignmentOverrideArchive,
  legacyStudentIds,
  overrideAuthorizationContext,
  planSharedAssignmentStrip,
  planSharedCopyWrites,
  planStudentAbsorption,
  planStudentOverrideChange,
  resolveOverrideStorageMode,
  resolveStudentOverride,
  studentAssignmentOverrideId,
} from '../../../functions/shared/studentAssignmentOverrides.mjs';
import {
  RESTORE_CONFIRMATION,
  STRIP_CONFIRMATION,
  evaluateRetirementReadiness,
  hostingCutoverEvidence,
  retirementRefusal,
} from '../../../functions/shared/overrideRetirementGate.mjs';
import {
  authorizeCaseEvidenceCaller, buildCaseEvidenceResponse, validateCaseEvidenceRequest,
} from '../../../functions/shared/caseReviewEvidence.mjs';
import { workspaceDraftDocumentId } from '../../../functions/shared/workspaceDraftSchema.mjs';
import { explainStudentChallengeRewards } from '../../../functions/shared/rewardDiagnostics.mjs';
import {
  STUDENT_IDENTITY_FIELDS, TEACHER_ROSTER_SELECT_FIELDS,
  buildTeacherRosterSummaryRow, compareStudentIdentities, validateStudentNameInput,
} from '../../../functions/shared/studentIdentity.mjs';
import {
  districtIdChangeRecord, districtStudentIdVariants, findDistrictStudentIdConflict,
  mayChangeStudentDistrictId, validateDistrictStudentIdInput,
} from '../../../functions/shared/studentDistrictId.mjs';
import { runSectionRecoveryAction } from '../../../functions/shared/sectionRecoveryActions.mjs';
import {
  HELD_RECOVERY_ACTION, applyHeldRecoveryResolution, heldRecoveryActionsFor, heldRecoveryItemIds, isHeldRecoveryAction,
} from '../../../functions/shared/sectionRecoveryResolution.mjs';
import { buildRecoveryReplacementItems } from '../../../functions/shared/sectionRecoveryPlan.mjs';
import { recoveryContextFor } from './recoveryFixture.js';
import { ingestStudentSubmissions as ingestLikeTheServer } from './fakeServer.js';

const iso = (value) => (value instanceof Timestamp ? value.toDate().toISOString() : value || null);
const harness = (typeof window !== 'undefined' && (window.__mmHarness = window.__mmHarness || {})) || {};
const lower = (value) => String(value ?? '').trim().toLowerCase();
const rejection = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code: `functions/${code}` });
// The signed-in student, as fakeAuth.js signs one in (`?as=student&studentId=`,
// or the next account on a shared device, __mmHarnessAuth.signInStudent).
const signedInStudentId = () => {
  const auth = typeof window !== 'undefined' ? window.__mmHarnessAuth : null;
  if (auth) return auth.currentStudentId();
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
harness.rootAdmin = harness.rootAdmin === true
  || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('rootAdmin') === '1');
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

/*
 * PRACTICE-BASED RECOVERY, AS THE TWO CALLABLES DECIDE IT.
 *
 * Both run the REAL shared modules the Cloud Functions run
 * (sectionRecoveryActions.mjs, sectionRecoveryResolution.mjs,
 * sectionRecoveryPlan.mjs) against the in-memory grades and assignment, with
 * the context built the way advanceSectionRecovery builds it (the harness has
 * no attendance events, so no excused make-up). The callables themselves —
 * authorization, transactions, the audit row — are certified against the
 * Firestore emulator in tests/integration/sectionRecoveryPlatformFailure.test.mjs.
 */
const recoveryRefusal = (error) => (error?.name === 'RecoveryTransitionError'
  ? Object.assign(new Error(error.message || error.code), { code: 'functions/failed-precondition', details: { code: error.code } })
  : error);
const writeRecoveryRecord = ({ studentId, assignmentId, section, record }) => {
  const path = `grades/${studentId}`;
  const grade = harnessStore.get(path) || {};
  const byAssignment = { ...grade.sectionRecoveryByAssignment };
  byAssignment[assignmentId] = { ...byAssignment[assignmentId], [section]: record };
  harnessStore.set(path, { ...grade, sectionRecoveryByAssignment: byAssignment });
};
const harnessRecoveryContext = ({ studentId, assignmentId, section }) => {
  const stored = harnessStore.get(`assignments/${assignmentId}`);
  if (!stored) throw rejection('not-found', 'That assignment is no longer available.');
  const gradeData = harnessStore.get(`grades/${studentId}`) || {};
  return recoveryContextFor({
    assignment: { id: assignmentId, ...stored },
    gradeData,
    studentId,
    section,
    schedule: harnessStore.get('settings/classSchedule') || null,
    nowValue: Date.now(),
  });
};

/*
 * STUDENTS' PRIVATE ASSIGNMENT CONTROLS (privateControlsJourneys.mjs), on the
 * server's own pure planners (functions/shared/studentAssignmentOverrides.mjs)
 * and retirement gate (overrideRetirementGate.mjs): the same records, history
 * entries, shared-copy writes and refusals the callables in functions/index.js
 * produce — which tests/integration/studentAssignmentOverrides.test.mjs runs
 * against Firestore. `?controlsCallMs=<ms>` makes each change take that long,
 * so a second click can land while the first is on its way.
 */
const controlsCallMs = Math.max(0, Number(new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('controlsCallMs')) || 0);
const FLAG_PATH = `platformFlags/${OVERRIDE_STORAGE_FLAG}`;
const PROGRESS_PATH = `${PLATFORM_MIGRATIONS_COLLECTION}/${OVERRIDE_MIGRATION_ID}`;
const recordPath = (studentId, assignmentId) => `${STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION}/${studentAssignmentOverrideId(studentId, assignmentId)}`;
const storageMode = () => resolveOverrideStorageMode(harnessStore.get(FLAG_PATH) || null);
const requireRootAdmin = () => {
  if (harness.rootAdmin !== true) throw rejection('permission-denied', 'Only the root administrator can do this.');
};
// The server's shared-copy write plan, applied the way its transaction applies it.
const applySharedWrites = (assignmentId, writes = []) => {
  if (!writes.length) return 0;
  const patch = {};
  writes.forEach((write) => {
    const key = write.path.join('.');
    if (write.op === 'delete') patch[key] = deleteField();
    else if (write.op === 'arrayRemove') patch[key] = arrayRemove(write.value);
    else patch[key] = write.value;
  });
  harnessStore.update(`assignments/${assignmentId}`, patch);
  return writes.length;
};
const authorizationFor = (studentId, existing = null) => {
  const student = harnessStore.get(`grades/${studentId}`) || {};
  const classRecord = student.classId ? { classId: student.classId, ...harnessStore.get(`classes/${student.classId}`) } : null;
  return overrideAuthorizationContext({ existing, studentId, classRecord, student });
};
const MIGRATION_COUNTERS = [
  'assignmentsScanned', 'assignmentsWithSharedStudentData', 'sharedStudentEntries', 'recordsCreated', 'recordsUpdated',
  'recordsUnchanged', 'recordsConfirmedPrivate', 'auditCopiesCreated', 'assignmentsStripped', 'assignmentsAlreadyClean',
  'assignmentsAwaitingAbsorption', 'studentsAwaitingAbsorption', 'archivesToWrite', 'archivesWritten',
  'assignmentsRestored', 'sharedWritesRestored',
];

const handlers = {
  advanceSectionRecovery: ({ assignmentId, section, action = 'status', payload = {} } = {}) => {
    const studentId = requireStudent();
    const context = harnessRecoveryContext({ studentId, assignmentId, section });
    let outcome;
    try {
      outcome = runSectionRecoveryAction({ context, action, payload: payload || {}, at: Date.now() });
    } catch (error) {
      throw recoveryRefusal(error);
    }
    if (outcome.changed) writeRecoveryRecord({ studentId, assignmentId, section, record: outcome.record });
    return { action, section, state: context.eligibility.state, reason: context.eligibility.reason, record: outcome.record, ...outcome.response };
  },
  resolveHeldSectionRecovery: ({ studentId, assignmentId, section, action, note = '' } = {}) => {
    if (signedInStudentId()) throw rejection('permission-denied', 'Only a teacher can make this change.');
    const grade = harnessStore.get(`grades/${studentId}`);
    if (!grade) throw rejection('not-found', 'The student or assignment was not found.');
    requireClassTeacher(grade.classId);
    if (!isHeldRecoveryAction(action)) throw rejection('invalid-argument', 'Choose how to resolve this Recovery.');
    const context = harnessRecoveryContext({ studentId, assignmentId, section });
    const allowed = heldRecoveryActionsFor(context.record, section);
    if (!allowed.length) throw rejection('failed-precondition', 'This Recovery is not waiting for a teacher.');
    if (!allowed.includes(action)) throw rejection('failed-precondition', 'That is not available for this Recovery.');
    let replacements = null;
    if (action === HELD_RECOVERY_ACTION.ISSUE_REPLACEMENT) {
      const built = buildRecoveryReplacementItems({
        assignmentId,
        section,
        record: context.record,
        itemIds: heldRecoveryItemIds(context.record),
        questionsByIndex: context.questionsByIndex,
        seatInfo: context.seatInfo,
        seenFingerprints: context.seenFingerprints,
        issuedAt: new Date().toISOString(),
        issueReasonFor: (itemId) => context.record.results?.[itemId]?.classification || null,
      });
      if (built.error) throw Object.assign(rejection('failed-precondition', 'MathMaster cannot make a replacement for this question until the question itself is fixed.'), { details: { code: built.error, classification: built.classification } });
      replacements = built.items;
    }
    let applied;
    try {
      applied = applyHeldRecoveryResolution({
        record: context.record,
        section,
        action,
        actor: { uid: 'harness-teacher-uid', email: TEACHER_EMAIL, name: 'Harness Teacher' },
        note,
        replacements,
        policy: context.policy,
        originalScore: context.sectionOriginal?.score ?? null,
        originalAttempted: Number(context.sectionOriginal?.attempted) > 0,
        at: Date.now(),
      });
    } catch (error) {
      throw recoveryRefusal(error);
    }
    writeRecoveryRecord({ studentId, assignmentId, section, record: applied.record });
    harnessStore.set(`grades/${studentId}/gradeOverrideAudits/recovery-${Date.now()}`, {
      scope: 'sectionRecovery', sectionRole: section, assignmentId, action, note: note || null,
      actor: { email: TEACHER_EMAIL }, at: new Date().toISOString(), statusAfter: applied.record.status,
    });
    return {
      status: applied.record.status,
      rawScore: applied.record.rawScore ?? null,
      recordedScore: applied.gradeState?.recordedScore ?? null,
      replacements: (replacements || []).map((item) => ({ from: item.replaces, to: item.itemId })),
    };
  },
  resolveSignedInRole: () => ({ role: 'teacher' }),
  setStudentAssignmentControls: async ({ assignmentId, classId, studentIds = [], change = {} } = {}) => {
    if (controlsCallMs) await new Promise((resolve) => { setTimeout(resolve, controlsCallMs); });
    const cls = harness.rootAdmin === true ? String(classId || '').trim() : requireClassTeacher(classId);
    const aid = String(assignmentId || '').trim();
    const assignment = harnessStore.get(`assignments/${aid}`);
    if (!assignment) throw rejection('not-found', 'That assignment was not found.');
    const ids = [...new Set((studentIds || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) throw rejection('invalid-argument', 'Choose at least one student.');
    if (ids.length > 60) throw rejection('invalid-argument', 'At most 60 students can be changed at once.');
    if (![OVERRIDE_CHANGE.DOL_ATTEMPTS, OVERRIDE_CHANGE.EXCUSED, OVERRIDE_CHANGE.REOPENED].includes(change.kind)) {
      throw rejection('invalid-argument', 'Unknown change. Attendance extensions use applyStudentAttendanceExtension.');
    }
    if (!(assignment.assignedClassIds || []).includes(cls)) throw rejection('failed-precondition', 'That assignment is not assigned to this class.');
    ids.forEach((id) => {
      if ((harnessStore.get(`grades/${id}`) || {}).classId !== cls) throw rejection('failed-precondition', 'This student does not currently belong to that class.');
    });
    const mode = storageMode();
    // All-or-nothing: every student planned before anything is written.
    const plans = ids.map((id) => {
      const existing = harnessStore.get(recordPath(id, aid)) || null;
      return {
        id,
        plan: planStudentOverrideChange({
          assignmentId: aid,
          assignment: { id: aid, ...assignment },
          studentId: id,
          existingPrivate: existing,
          change: { kind: change.kind, value: change.value, increment: change.increment, reason: change.reason },
          authorization: authorizationFor(id, existing),
          actor: { email: TEACHER_EMAIL, uid: 'harness-teacher-uid', role: harness.rootAdmin === true ? 'rootAdmin' : 'teacher' },
          nowMs: Date.now(),
          storageMode: mode,
        }),
      };
    });
    plans.forEach(({ id, plan }) => {
      harnessStore.set(recordPath(id, aid), { ...plan.record, updatedAt: Timestamp.now() });
      harnessStore.set(`grades/${id}/assignmentOverrideEvents/${plan.eventId}`, { ...plan.event, at: Timestamp.now() });
    });
    applySharedWrites(aid, plans.flatMap(({ plan }) => plan.sharedWrites));
    return {
      assignmentId: aid,
      classId: cls,
      kind: change.kind,
      sharedRetired: mode.sharedRetired,
      students: plans.map(({ id, plan }) => ({
        studentId: id, changed: plan.changed, revision: plan.revision,
        excused: plan.after.excused, reopened: plan.after.reopened, dolExtraAttempts: plan.after.dolExtraAttempts,
      })),
    };
  },
  // The storage switch and its cutover record. The harness cannot read a live
  // build, so the deployment is always "unverified" and needs the attestation.
  setAssignmentOverrideStorage: (data = {}) => {
    requireRootAdmin();
    const action = typeof data.action === 'string' && data.action
      ? data.action
      : typeof data.sharedRetired === 'boolean' ? (data.sharedRetired ? 'retire' : 'mirror') : 'status';
    const nowMs = Date.now();
    const hosting = { checked: false, reason: 'harness' };
    const read = () => ({ storage: harnessStore.get(FLAG_PATH) || null, migration: harnessStore.get(PROGRESS_PATH) || {} });
    const report = (changed) => {
      const { storage, migration } = read();
      return { ...resolveOverrideStorageMode(storage), changed, migration, readiness: evaluateRetirementReadiness({ storage, migration, hosting, nowMs }) };
    };
    if (action === 'status') return report(false);
    if (action === 'confirmClientCutover') {
      if (data.attestHostingDeployed !== true) throw rejection('invalid-argument', 'MathMaster could not read the live build (harness). Confirm that this release\'s Hosting is deployed and live for everyone.');
      const { storage, migration } = read();
      if (storage?.sharedRetired === true) throw rejection('failed-precondition', 'The shared copy is already retired.');
      harnessStore.set(PROGRESS_PATH, {
        ...migration,
        cutover: {
          confirmedAtMs: nowMs, confirmedByEmail: TEACHER_EMAIL, hosting: hostingCutoverEvidence(hosting),
          hostingVerified: false, hostingAttested: true, clientBuild: data.clientBuild || null,
          previousConfirmedAtMs: Number(migration.cutover?.confirmedAtMs) || null,
        },
      });
      return report(true);
    }
    if (action === 'retire') {
      const { storage, migration } = read();
      if (storage?.sharedRetired === true) return report(false);
      const readiness = evaluateRetirementReadiness({ storage, migration, hosting, nowMs });
      const refusal = retirementRefusal({ readiness, confirmation: data.confirmation, attestFullSchoolDay: data.attestFullSchoolDay === true });
      if (refusal) throw Object.assign(rejection(refusal.code, refusal.message), { details: { gates: readiness.gates.map(({ id, ok, detail }) => ({ id, ok, detail })) } });
      harnessStore.set(FLAG_PATH, { sharedRetired: true });
      harnessStore.set(PROGRESS_PATH, {
        ...migration,
        retirement: { retiredAtMs: nowMs, retiredByEmail: TEACHER_EMAIL, attestedFullSchoolDay: true, cutoverConfirmedAtMs: readiness.confirmedAtMs, mirroredAgainAtMs: null },
      });
      return report(true);
    }
    if (action === 'mirror') {
      const { storage, migration } = read();
      harnessStore.set(FLAG_PATH, { sharedRetired: false });
      if (storage?.sharedRetired === true) {
        harnessStore.set(PROGRESS_PATH, {
          ...migration,
          ...(migration.retirement ? { retirement: { ...migration.retirement, mirroredAgainAtMs: nowMs } } : {}),
          ...(migration.cutover ? { previousCutover: { ...migration.cutover, supersededAtMs: nowMs }, cutover: null } : {}),
        });
      }
      return report(true);
    }
    throw rejection('invalid-argument', 'Unknown action. Use status, confirmClientCutover, retire or mirror.');
  },
  // One whole pass in one page (the harness school is small), with the
  // server's preconditions and its pass record.
  migrateStudentAssignmentOverrides: ({ mode = 'backfill', dryRun, confirm = '' } = {}) => {
    requireRootAdmin();
    const dry = dryRun !== false;
    if (!['backfill', 'strip', 'restore'].includes(mode)) throw rejection('invalid-argument', 'Unknown migration mode.');
    if (!dry && mode === 'strip' && confirm !== STRIP_CONFIRMATION) throw rejection('invalid-argument', `Type "${STRIP_CONFIRMATION}" to strip the shared copies. Run the dry run first.`);
    if (!dry && mode === 'restore' && confirm !== RESTORE_CONFIRMATION) throw rejection('invalid-argument', `Type "${RESTORE_CONFIRMATION}" to write the shared copies back.`);
    const progress = harnessStore.get(PROGRESS_PATH) || {};
    if (!dry && mode === 'strip') {
      const dryPass = progress.strip?.lastCompletedDryRunPass || null;
      if (!dryPass || Number(dryPass.failureCount) > 0 || (Number(dryPass.completedAtMs) || 0) < (Number(progress.retirement?.retiredAtMs) || 0)) {
        throw rejection('failed-precondition', 'Run the strip\'s dry run to the end first — after retiring the shared copy, with no failures.');
      }
    }
    const { sharedRetired } = storageMode();
    if (!dry && mode === 'strip' && !sharedRetired) throw rejection('failed-precondition', 'Turn on "shared copy retired" first.');
    if (!dry && mode === 'restore' && sharedRetired) throw rejection('failed-precondition', 'Turn "shared copy retired" off first.');
    const totals = { ...Object.fromEntries(MIGRATION_COUNTERS.map((key) => [key, 0])), failures: [] };
    harnessStore.paths('assignments/').filter((path) => path.split('/').length === 2).sort().forEach((path) => {
      const aid = path.split('/')[1];
      const assignment = { id: aid, ...harnessStore.get(path) };
      const ids = legacyStudentIds(assignment);
      totals.assignmentsScanned += 1;
      if (ids.length) {
        totals.assignmentsWithSharedStudentData += 1;
        totals.sharedStudentEntries += ids.length;
      }
      if (mode === 'backfill' || mode === 'strip') {
        let pending = 0;
        ids.forEach((id) => {
          const existing = harnessStore.get(recordPath(id, aid)) || null;
          const plan = planStudentAbsorption({ assignmentId: aid, assignment, studentId: id, existingPrivate: existing, authorization: authorizationFor(id, existing) });
          if (plan.action === 'unchanged') { totals.recordsUnchanged += 1; totals.recordsConfirmedPrivate += 1; return; }
          if (plan.action !== 'create' && plan.action !== 'update') return;
          pending += 1;
          totals[plan.action === 'create' ? 'recordsCreated' : 'recordsUpdated'] += 1;
          if (dry) return;
          harnessStore.set(recordPath(id, aid), { ...plan.record, updatedAt: Timestamp.now() });
          harnessStore.set(`grades/${id}/assignmentOverrideEvents/${plan.eventId}`, { ...plan.event, at: Timestamp.now() });
        });
        if (mode === 'strip') {
          if (dry && pending) { totals.assignmentsAwaitingAbsorption += 1; totals.studentsAwaitingAbsorption += pending; }
          const writes = planSharedAssignmentStrip(assignment);
          if (!writes.length) totals.assignmentsAlreadyClean += 1;
          else {
            totals.assignmentsStripped += 1;
            const { archiveId, archive } = buildAssignmentOverrideArchive({ assignmentId: aid, assignment });
            const archived = Boolean(harnessStore.get(`${ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION}/${archiveId}`));
            if (dry) totals.archivesToWrite += archived ? 0 : 1;
            else {
              if (!archived) { harnessStore.set(`${ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION}/${archiveId}`, archive); totals.archivesWritten += 1; }
              applySharedWrites(aid, writes);
            }
          }
        }
      }
      if (mode === 'restore') {
        const writes = harnessStore.paths(`${STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION}/`)
          .map((recordAt) => harnessStore.get(recordAt))
          .filter((record) => record?.assignmentId === aid)
          .flatMap((record) => planSharedCopyWrites({
            assignment, studentId: record.studentId,
            override: resolveStudentOverride({ assignment, studentId: record.studentId, privateOverride: record }),
            storageMode: resolveOverrideStorageMode(null),
          }));
        if (writes.length) { totals.assignmentsRestored += 1; totals.sharedWritesRestored += writes.length; }
        if (!dry) applySharedWrites(aid, writes);
      }
    });
    const nowMs = Date.now();
    const pass = { passId: `pass-${nowMs}`, startedAtMs: nowMs, completedAtMs: nowMs, pages: 1, nextCursor: null, failureCount: 0, failures: [], ...Object.fromEntries(MIGRATION_COUNTERS.map((key) => [key, totals[key]])) };
    const modeState = { ...progress[mode], [dry ? 'dryRunPass' : 'pass']: pass, [dry ? 'lastCompletedDryRunPass' : 'lastCompletedPass']: pass };
    if (!dry) Object.assign(modeState, { cursor: null, done: true, lastRealRunAtMs: nowMs });
    harnessStore.set(PROGRESS_PATH, { ...harnessStore.get(PROGRESS_PATH), [mode]: modeState });
    return {
      mode, dryRun: dry, startAfter: null, nextCursor: null, done: true, sharedRetired, ...totals,
      pass: { passId: pass.passId, pages: 1, completed: true, failureCount: 0 },
    };
  },
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
  // Setting or correcting a district (SIS) ID, with the REAL rules the
  // callable runs (functions/shared/studentDistrictId.mjs): digits only; the
  // teacher of record or the root administrator; refused when another student
  // already answers to the number — as a stored district ID or as an account
  // ID, leading zeros ignored; and an audit entry keeping the previous value.
  // Only the district ID fields change: never the account ID or the work.
  setStudentSisId: ({ studentId: rawId, sisStudentId: rawDistrictId } = {}) => {
    const studentId = String(rawId || '').trim();
    if (!studentId || studentId.length > 180 || studentId.includes('/')) throw callableError('invalid-argument', 'studentId is required.');
    const checked = validateDistrictStudentIdInput(rawDistrictId);
    if (!checked.ok) throw callableError('invalid-argument', checked.error);
    const path = `grades/${studentId}`;
    const stored = harnessStore.get(path);
    if (!stored) throw callableError('not-found', 'That student is not on the MathMaster roster.');
    const student = selectFields(stored, ['assignedTeacherEmail', 'classId', 'sisStudentId']);
    const classRecord = student.classId ? harnessStore.get(`classes/${student.classId}`) || null : null;
    if (!mayChangeStudentDistrictId({ callerEmail: TEACHER_EMAIL, isRootAdmin: harness.rootAdmin === true, student, classRecord })) {
      throw callableError('permission-denied', "Only this student's teacher of record can change the student's district ID.");
    }
    const variants = new Set(districtStudentIdVariants(checked.value));
    const roster = rosterPaths().map((rosterPath) => ({ id: rosterPath.split('/')[1], data: harnessStore.get(rosterPath) || {} }));
    const conflict = findDistrictStudentIdConflict({
      studentId,
      districtId: checked.value,
      districtIdHolders: roster.filter(({ data }) => variants.has(String(data.sisStudentId ?? '').trim())).map(({ id }) => id),
      accountIdHolders: roster.filter(({ id }) => variants.has(id)).map(({ id }) => id),
    });
    if (conflict) throw callableError('already-exists', conflict.message);
    const change = districtIdChangeRecord({ studentId, student, districtId: checked.value, classId: student.classId || null });
    harnessStore.update(path, {
      sisStudentId: checked.value,
      sisStudentIdVerifiedAt: Timestamp.now(),
      sisStudentIdVerifiedBy: TEACHER_EMAIL,
      updatedAt: Timestamp.now(),
    });
    harnessStore.set(`adminAuditLog/sis_${studentId}_${Date.now()}`, {
      actorUid: 'harness-teacher-uid', actorEmail: TEACHER_EMAIL, action: 'sis_student_id_set', target: studentId,
      details: change.details, createdAt: Timestamp.now(),
    });
    return change.response;
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
    // Recovery / Recovery Practice misconception evidence (server-only).
    const misconceptionRecords = harnessStore.paths(`grades/${studentId}/misconceptionEvidence/`)
      .map((path) => ({ id: path.split('/').pop(), data: harnessStore.get(path) }))
      .filter((entry) => wanted.has(entry.data?.source?.assignmentId));
    return buildCaseEvidenceResponse({ request: validation.request, events, receipts, drafts, audits, misconceptionRecords, nowMs: Date.now() });
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
  // Growth rewards (functions/lib/growthRewards.js): a signed-in student's app
  // asks once per session for awards earned since the last visit. The harness
  // has no records that earn one, so it answers like a sync with nothing new.
  syncStudentGrowthRewards: () => ({ delivered: [], alreadyDelivered: 0, skipped: [] }),
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
// `?server=1`: the harness runs server ingestion (fakeServer.js — the shared
// modules functions/index.js runs), so a Submit becomes a canonical attempt
// instead of staying queued. Off by default: the journeys written before it
// read "submitted" from the device's own queue, and still do.
harness.serverIngestion = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('server') === '1';
if (harness.serverIngestion) {
  handlers.ingestStudentSubmissions = ({ submissions = [] } = {}) => ingestLikeTheServer({ studentId: requireStudent(), submissions });
}

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
