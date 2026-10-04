/*
 * THE FIRESTORE SIDE OF A STUDENT'S PRIVATE ASSIGNMENT CONTROLS.
 *
 * Every write to `studentAssignmentOverrides` goes through here (or through
 * `applyStudentAttendanceExtension`, which uses the same planner), with Admin
 * SDK credentials, inside a transaction that also reads what it is changing:
 *
 *   applyStudentControlsChange   a teacher of record grants DOL attempts,
 *                                excuses or reopens selected students;
 *   runOverrideMigration         the root administrator's staged migration —
 *                                backfill, strip, restore — dry run first,
 *                                resumable from a cursor, bounded per call;
 *   absorbSharedStudentControls  the trigger that moves anything a client of
 *                                the previous release writes onto a shared
 *                                assignment into private storage (and, once
 *                                the shared copy is retired, removes it).
 *
 * The decisions — what to write, and that nothing is lost — are the pure
 * planners in studentAssignmentOverrides.mjs; this file only reads, applies
 * and counts. Errors are StudentControlsError with an HttpsError code.
 */
import { FieldPath, FieldValue } from 'firebase-admin/firestore';

import {
  ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION,
  ASSIGNMENT_OVERRIDE_EVENTS_COLLECTION,
  OVERRIDE_CHANGE,
  OVERRIDE_MIGRATION_ID,
  OVERRIDE_STORAGE_FLAG,
  PLATFORM_MIGRATIONS_COLLECTION,
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  buildAssignmentOverrideArchive,
  legacyStudentIds,
  legacyStudentOverride,
  overrideAuthorizationContext,
  perStudentSharedDataChanged,
  planSharedAssignmentStrip,
  planSharedCopyWrites,
  planStudentAbsorption,
  planStudentOverrideChange,
  resolveOverrideStorageMode,
  resolveStudentOverride,
  sharedAssignmentFullyAbsorbed,
  sharedAssignmentIsClean,
  studentAssignmentOverrideId,
} from './studentAssignmentOverrides.mjs';
import { authorizeAttendanceExtensionActor } from './attendanceExtensionAuthorization.mjs';
import {
  ATTENDANCE_EXTENSION_GRANTS_COLLECTION,
  legacyExtensionGrantId,
  planAssignmentPrivacyMigration,
} from './assignmentPrivacy.mjs';

export const MAX_STUDENTS_PER_CHANGE = 60;
/** Students absorbed per transaction: a record, an event and possibly an extension grant each. */
export const ABSORB_CHUNK = 100;
export const MIGRATION_PAGE_DEFAULT = 100;
export const MIGRATION_PAGE_MAX = 300;
export const MIGRATION_MODES = Object.freeze(['backfill', 'strip', 'restore']);

export class StudentControlsError extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.name = 'StudentControlsError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, message, detail = null) => { throw new StudentControlsError(code, message, detail); };
const clean = (value) => String(value ?? '').trim();
const unique = (values) => [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];

const overridesCollection = (db) => db.collection(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION);
const overrideRef = (db, studentId, assignmentId) => overridesCollection(db).doc(studentAssignmentOverrideId(studentId, assignmentId));
const eventRef = (db, studentId, eventId) => db.collection('grades').doc(clean(studentId))
  .collection(ASSIGNMENT_OVERRIDE_EVENTS_COLLECTION).doc(clean(eventId));
const flagRef = (db) => db.collection('platformFlags').doc(OVERRIDE_STORAGE_FLAG);
const progressRef = (db) => db.collection(PLATFORM_MIGRATIONS_COLLECTION).doc(OVERRIDE_MIGRATION_ID);

/**
 * Many planners' shared-copy writes as ONE dotted-path update: several
 * students' `arrayRemove`s on the same list become one call, because a field
 * path may appear only once in an update.
 */
export const sharedWriteArguments = (writes = []) => {
  const removals = new Map();
  const args = [];
  writes.forEach(({ op, path, value }) => {
    if (op === 'arrayRemove') {
      const key = path.join('\u0000');
      if (!removals.has(key)) removals.set(key, { path, values: [] });
      removals.get(key).values.push(value);
      return;
    }
    args.push(new FieldPath(...path), op === 'delete' ? FieldValue.delete() : value);
  });
  removals.forEach(({ path, values }) => args.push(new FieldPath(...path), FieldValue.arrayRemove(...values)));
  return args;
};

const applySharedWrites = (transaction, ref, writes) => {
  const args = sharedWriteArguments(writes);
  if (args.length) transaction.update(ref, ...args);
  return args.length / 2;
};

const storageModeFrom = (snapshot) => resolveOverrideStorageMode(snapshot?.exists ? snapshot.data() : null);

/* ---------------------------------------------------------- teacher changes */

const ACTION_LABELS = Object.freeze({
  [OVERRIDE_CHANGE.DOL_ATTEMPTS]: 'an extra DOL attempt',
  [OVERRIDE_CHANGE.EXCUSED]: 'an excusal',
  [OVERRIDE_CHANGE.REOPENED]: 'a reopen',
});

/**
 * A teacher of record (or the root administrator) changes one control for
 * selected students in one class: extra DOL attempts, excused, reopened.
 * All-or-nothing: if any student is not theirs to change, nothing is written.
 */
export const applyStudentControlsChange = async ({
  db,
  actor = {},
  isRootAdmin = false,
  assignmentId,
  classId,
  studentIds = [],
  change = {},
  nowMs = Date.now(),
} = {}) => {
  const aid = clean(assignmentId);
  const cid = clean(classId);
  const ids = unique(studentIds);
  const kind = clean(change?.kind);
  if (!aid || !cid) fail('invalid-argument', 'An assignment and a class are required.');
  if (!ids.length) fail('invalid-argument', 'Choose at least one student.');
  if (ids.length > MAX_STUDENTS_PER_CHANGE) fail('invalid-argument', `At most ${MAX_STUDENTS_PER_CHANGE} students can be changed at once.`);
  if (!ACTION_LABELS[kind]) fail('invalid-argument', 'Unknown change. Attendance extensions use applyStudentAttendanceExtension.');
  if ((kind === OVERRIDE_CHANGE.EXCUSED || kind === OVERRIDE_CHANGE.REOPENED) && typeof change.value !== 'boolean') {
    fail('invalid-argument', 'Say whether the students should be excused/reopened (true) or not (false).');
  }
  const teacherEmail = clean(actor.email).toLowerCase();
  if (!teacherEmail && !isRootAdmin) fail('permission-denied', 'A verified teacher email is required.');

  const assignmentRef = db.collection('assignments').doc(aid);
  const classRef = db.collection('classes').doc(cid);
  const gradeRefs = ids.map((id) => db.collection('grades').doc(id));
  const overrideRefs = ids.map((id) => overrideRef(db, id, aid));

  return db.runTransaction(async (transaction) => {
    const [assignmentSnap, classSnap, flagSnap, ...rest] = await Promise.all([
      transaction.get(assignmentRef),
      transaction.get(classRef),
      transaction.get(flagRef(db)),
      ...gradeRefs.map((ref) => transaction.get(ref)),
      ...overrideRefs.map((ref) => transaction.get(ref)),
    ]);
    const gradeSnaps = rest.slice(0, ids.length);
    const overrideSnaps = rest.slice(ids.length);
    const assignment = assignmentSnap.exists ? { id: assignmentSnap.id, ...assignmentSnap.data() } : null;
    const classRecord = classSnap.exists ? { classId: classSnap.id, ...classSnap.data() } : null;
    const storageMode = storageModeFrom(flagSnap);

    ids.forEach((id, index) => {
      const decision = authorizeAttendanceExtensionActor({
        isRootAdmin,
        teacherEmail,
        classRecord,
        studentRecord: gradeSnaps[index].exists ? gradeSnaps[index].data() : null,
        assignment,
        requestedClassId: cid,
        actionLabel: ACTION_LABELS[kind],
      });
      if (!decision.authorized) fail(decision.reason, decision.message, { studentId: id });
    });

    // Plan every student before writing anything (reads precede writes). Each
    // student's shared-copy writes touch only that student's paths.
    const sharedWrites = [];
    const results = ids.map((id, index) => {
      const existingPrivate = overrideSnaps[index].exists ? overrideSnaps[index].data() : null;
      const plan = planStudentOverrideChange({
        assignmentId: aid,
        assignment,
        studentId: id,
        existingPrivate,
        change: { kind, value: change.value, increment: change.increment, reason: change.reason },
        authorization: overrideAuthorizationContext({
          existing: existingPrivate,
          studentId: id,
          classRecord,
          student: gradeSnaps[index].data(),
        }),
        actor: { email: teacherEmail, uid: actor.uid, role: isRootAdmin ? 'rootAdmin' : 'teacher' },
        nowMs,
        storageMode,
      });
      sharedWrites.push(...plan.sharedWrites);
      return { id, index, plan };
    });

    results.forEach(({ id, index, plan }) => {
      transaction.set(overrideRefs[index], { ...plan.record, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(eventRef(db, id, plan.eventId), { ...plan.event, at: FieldValue.serverTimestamp() });
    });
    applySharedWrites(transaction, assignmentRef, sharedWrites);

    return {
      assignmentId: aid,
      classId: cid,
      kind,
      sharedRetired: storageMode.sharedRetired,
      students: results.map(({ id, plan }) => ({
        studentId: id,
        changed: plan.changed,
        revision: plan.revision,
        excused: plan.after.excused,
        reopened: plan.after.reopened,
        dolExtraAttempts: plan.after.dolExtraAttempts,
      })),
    };
  });
};

/* ---------------------------------------------- absorbing one shared document */

/** What the roster says about a student, for a record's authorization context. */
const rosterStudent = (snapshot) => (snapshot?.exists ? { id: snapshot.id, ...snapshot.data() } : null);

/**
 * Bring every student a shared assignment names into private storage, in
 * chunks of ABSORB_CHUNK per transaction. Each chunk re-reads the assignment
 * and its students' records and re-plans, so a teacher change racing it is
 * never overwritten. Also moves an extension's legacy reasons (absence dates,
 * meetings, the granting teacher) into the private grant record, as the
 * PR #415 migration did, before anything else changes.
 */
export const absorbAssignment = async ({ db, assignmentId, dryRun = false, migrationRunId = null, source = 'migration' } = {}) => {
  const aid = clean(assignmentId);
  const assignmentRef = db.collection('assignments').doc(aid);
  const counts = {
    legacyStudents: 0, created: 0, updated: 0, unchanged: 0, auditCopies: 0, extensionDetailsMoved: 0, derivedFieldsIgnored: 0,
  };
  const first = await assignmentRef.get();
  if (!first.exists) return counts;
  const ids = legacyStudentIds(first.data() || {});
  counts.legacyStudents = ids.length;
  for (let start = 0; start < ids.length; start += ABSORB_CHUNK) {
    const chunk = ids.slice(start, start + ABSORB_CHUNK);
    // eslint-disable-next-line no-await-in-loop
    const outcome = await absorbChunk({ db, assignmentRef, aid, chunk, dryRun, migrationRunId, source });
    Object.keys(outcome).forEach((key) => { counts[key] = (counts[key] || 0) + outcome[key]; });
  }
  return counts;
};

const absorbChunk = async ({ db, assignmentRef, aid, chunk, dryRun, migrationRunId, source }) => {
  const plan = async (read) => {
    const assignmentSnap = await read(assignmentRef);
    const assignment = assignmentSnap.exists ? { id: assignmentSnap.id, ...assignmentSnap.data() } : null;
    if (!assignment) return { assignment: null, entries: [] };
    const privateSnaps = await Promise.all(chunk.map((id) => read(overrideRef(db, id, aid))));
    const rosterSnaps = await Promise.all(chunk.map((id) => read(db.collection('grades').doc(id))));
    const entries = chunk.map((id, index) => {
      const existingPrivate = privateSnaps[index].exists ? privateSnaps[index].data() : null;
      const absorption = planStudentAbsorption({
        assignmentId: aid,
        assignment,
        studentId: id,
        existingPrivate,
        authorization: overrideAuthorizationContext({ existing: existingPrivate, studentId: id, student: rosterStudent(rosterSnaps[index]) }),
        migrationRunId,
        source,
      });
      return { id, absorption, roster: rosterStudent(rosterSnaps[index]) };
    });
    return { assignment, entries };
  };

  const tally = (entries, auditExisting, extensionPlan) => {
    const counts = { created: 0, updated: 0, unchanged: 0, auditCopies: 0, extensionDetailsMoved: 0, derivedFieldsIgnored: 0 };
    entries.forEach(({ absorption }) => {
      if (absorption.action === 'create') counts.created += 1;
      else if (absorption.action === 'update') counts.updated += 1;
      else if (absorption.action === 'unchanged') counts.unchanged += 1;
    });
    counts.auditCopies = auditExisting.filter((exists) => !exists).length;
    counts.extensionDetailsMoved = extensionPlan ? extensionPlan.minimize.filter((item) => chunkIncludes(item.studentId)).length : 0;
    return counts;
  };
  const chunkSet = new Set(chunk);
  const chunkIncludes = (id) => chunkSet.has(id);

  if (dryRun) {
    const { assignment, entries } = await plan((ref) => ref.get());
    if (!assignment) return {};
    const audit = entries.flatMap(({ id, absorption }) => absorption.auditCopies.map((copy) => ({ id, copy })));
    const auditExisting = await Promise.all(audit.map(({ id, copy }) => eventRef(db, id, copy.eventId).get().then((snap) => snap.exists)));
    const extensionPlan = planAssignmentPrivacyMigration({ assignmentId: aid, assignment, studentsById: Object.fromEntries(entries.map(({ id, roster }) => [id, roster || {}])) });
    const counts = tally(entries, auditExisting, extensionPlan);
    counts.derivedFieldsIgnored = derivedFieldsStored(assignment, chunk);
    return counts;
  }

  return db.runTransaction(async (transaction) => {
    const { assignment, entries } = await plan((ref) => transaction.get(ref));
    if (!assignment) return {};
    const audit = entries.flatMap(({ id, absorption }) => absorption.auditCopies.map((copy) => ({ id, copy })));
    const auditSnaps = await Promise.all(audit.map(({ id, copy }) => transaction.get(eventRef(db, id, copy.eventId))));
    // Legacy extension details (pre-#415) go into the private grant record
    // first, exactly as migrateAssignmentPrivacy does, and the shared stub is
    // reduced in the same transaction.
    const extensionPlan = planAssignmentPrivacyMigration({
      assignmentId: aid,
      assignment,
      studentsById: Object.fromEntries(entries.map(({ id, roster }) => [id, roster || {}])),
    });
    const extensionItems = extensionPlan.minimize.filter((item) => chunkIncludes(item.studentId));
    const grantSnaps = await Promise.all(extensionItems.map((item) => transaction.get(
      db.collection('grades').doc(item.studentId).collection(ATTENDANCE_EXTENSION_GRANTS_COLLECTION).doc(legacyExtensionGrantId(aid)),
    )));

    entries.forEach(({ id, absorption }) => {
      if (absorption.action === 'create' || absorption.action === 'update') {
        transaction.set(overrideRef(db, id, aid), { ...absorption.record, updatedAt: FieldValue.serverTimestamp() });
        transaction.set(eventRef(db, id, absorption.eventId), { ...absorption.event, at: FieldValue.serverTimestamp() });
      }
    });
    audit.forEach(({ id, copy }, index) => {
      if (!auditSnaps[index].exists) transaction.set(eventRef(db, id, copy.eventId), { ...copy.event, at: FieldValue.serverTimestamp() });
    });
    const stubWrites = [];
    extensionItems.forEach((item, index) => {
      if (!grantSnaps[index].exists) {
        transaction.set(
          db.collection('grades').doc(item.studentId).collection(ATTENDANCE_EXTENSION_GRANTS_COLLECTION).doc(item.grantId),
          { ...item.grantRecord, migratedAt: FieldValue.serverTimestamp() },
        );
      }
      stubWrites.push({ op: 'set', path: ['studentOverrides', item.studentId, 'extension'], value: item.stub });
    });
    applySharedWrites(transaction, assignmentRef, stubWrites);
    const counts = tally(entries, auditSnaps.map((snap) => snap.exists), extensionPlan);
    counts.derivedFieldsIgnored = derivedFieldsStored(assignment, chunk);
    return counts;
  });
};

/** Support dates are derived from a profile and never stored; count any an old writer persisted. */
const derivedFieldsStored = (assignment, ids) => ids.filter((id) => {
  const entry = assignment?.studentOverrides?.[id];
  return entry && typeof entry === 'object' && ['supportDueAt', 'supportFinalAt', 'supportDeadline'].some((key) => key in entry);
}).length;

/**
 * Remove a shared assignment's per-student data — only after every student it
 * names is represented exactly in private storage, checked in the same
 * transaction that removes it, with the removed data archived verbatim first.
 */
export const stripAssignment = async ({ db, assignmentId, dryRun = false, migrationRunId = null } = {}) => {
  const aid = clean(assignmentId);
  const assignmentRef = db.collection('assignments').doc(aid);
  const read = async (getter) => {
    const snap = await getter(assignmentRef);
    if (!snap.exists) return { assignment: null };
    const assignment = { id: snap.id, ...snap.data() };
    const ids = legacyStudentIds(assignment);
    const privateSnaps = await Promise.all(ids.map((id) => getter(overrideRef(db, id, aid))));
    const privateById = Object.fromEntries(ids.map((id, index) => [id, privateSnaps[index].exists ? privateSnaps[index].data() : null]));
    return { assignment, privateById };
  };
  if (dryRun) {
    const { assignment, privateById } = await read((ref) => ref.get());
    if (!assignment) return { stripped: false, alreadyClean: false, missing: true };
    if (sharedAssignmentIsClean(assignment)) return { stripped: false, alreadyClean: true };
    const absorbed = sharedAssignmentFullyAbsorbed({ assignment, privateById });
    // What the real strip would archive (one verbatim archive per assignment,
    // unless that exact content was archived before) — read, never written.
    const { archiveId } = buildAssignmentOverrideArchive({ assignmentId: aid, assignment, migrationRunId });
    const archiveExists = (await db.collection(ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION).doc(archiveId).get()).exists;
    return {
      stripped: false,
      alreadyClean: false,
      wouldStrip: true,
      pendingAbsorption: absorbed.pending.length,
      archiveId,
      archiveWouldBeWritten: !archiveExists,
    };
  }
  return db.runTransaction(async (transaction) => {
    const { assignment, privateById } = await read((ref) => transaction.get(ref));
    if (!assignment) return { stripped: false, missing: true };
    if (sharedAssignmentIsClean(assignment)) return { stripped: false, alreadyClean: true };
    const absorbed = sharedAssignmentFullyAbsorbed({ assignment, privateById });
    if (!absorbed.absorbed) return { stripped: false, notAbsorbed: absorbed.pending };
    const { archiveId, archive } = buildAssignmentOverrideArchive({ assignmentId: aid, assignment, migrationRunId });
    const archiveRef = db.collection(ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION).doc(archiveId);
    const existingArchive = await transaction.get(archiveRef);
    if (!existingArchive.exists) transaction.set(archiveRef, { ...archive, archivedAt: FieldValue.serverTimestamp() });
    applySharedWrites(transaction, assignmentRef, planSharedAssignmentStrip(assignment));
    return { stripped: true, archiveId, archiveCreated: !existingArchive.exists, students: Object.keys(privateById).length };
  });
};

/**
 * Rollback of a strip: write every student's private controls back onto the
 * shared document (mirror form), so a previous-release client reads them again.
 * Private storage stays the authority; nothing in it changes.
 */
export const restoreAssignment = async ({ db, assignmentId, dryRun = false } = {}) => {
  const aid = clean(assignmentId);
  const assignmentRef = db.collection('assignments').doc(aid);
  const records = await overridesCollection(db).where('assignmentId', '==', aid).get();
  if (records.empty) return { restoredStudents: 0, sharedWrites: 0 };
  const mirror = resolveOverrideStorageMode(null);
  const planWrites = (assignment, docs) => docs.flatMap((doc) => {
    const data = doc.data() || {};
    const studentId = clean(data.studentId);
    const resolved = resolveStudentOverride({ assignment, studentId, privateOverride: data });
    return planSharedCopyWrites({ assignment, studentId, override: resolved, storageMode: mirror });
  });
  if (dryRun) {
    const snap = await assignmentRef.get();
    if (!snap.exists) return { restoredStudents: 0, sharedWrites: 0, missing: true };
    const writes = planWrites({ id: snap.id, ...snap.data() }, records.docs);
    return { restoredStudents: records.size, sharedWrites: writes.length };
  }
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(assignmentRef);
    if (!snap.exists) return { restoredStudents: 0, sharedWrites: 0, missing: true };
    const fresh = await Promise.all(records.docs.map((doc) => transaction.get(doc.ref)));
    const writes = planWrites({ id: snap.id, ...snap.data() }, fresh.filter((doc) => doc.exists));
    applySharedWrites(transaction, assignmentRef, writes);
    return { restoredStudents: fresh.length, sharedWrites: writes.length };
  });
};

/* ------------------------------------------------------------- the migration */

/*
 * Every count a page reports (and a pass adds up). For the strip:
 *   recordsConfirmedPrivate     students whose private record already says
 *                               exactly what the shared copy says;
 *   studentsAwaitingAbsorption  students the shared copy still holds that
 *                               private storage does not say exactly — a real
 *                               strip copies them in first (a dry run only
 *                               counts them);
 *   assignmentsAwaitingAbsorption  assignments with any such student (dry
 *                               run), or that changed under a real strip and
 *                               must be run again;
 *   archivesToWrite / archivesWritten  verbatim archives the strip would write
 *                               / wrote.
 */
export const MIGRATION_COUNTERS = Object.freeze([
  'assignmentsScanned',
  'assignmentsWithSharedStudentData',
  'sharedStudentEntries',
  'recordsCreated',
  'recordsUpdated',
  'recordsUnchanged',
  'recordsConfirmedPrivate',
  'auditCopiesCreated',
  'extensionDetailsMoved',
  'derivedFieldsIgnored',
  'assignmentsStripped',
  'assignmentsAlreadyClean',
  'assignmentsAwaitingAbsorption',
  'studentsAwaitingAbsorption',
  'archivesToWrite',
  'archivesWritten',
  'assignmentsRestored',
  'sharedWritesRestored',
]);

const emptyTotals = () => ({
  ...Object.fromEntries(MIGRATION_COUNTERS.map((key) => [key, 0])),
  failures: [],
});

/*
 * ONE PASS, ACROSS PAGES — WHAT THE RETIREMENT GATE COUNTS.
 *
 * Each callable call is one bounded page, so "a full backfill finished with
 * zero failures" is a statement about a sequence of pages, and only the server
 * may make it. A page with no `startAfter` starts a pass; a page whose
 * `startAfter` is the pass's own `nextCursor` continues it; the page that
 * reaches the end completes it. Its counts and failures are the sums over
 * every page of the pass. A page that starts anywhere else belongs to no pass,
 * and an unfinished pass never counts as complete. Canary runs (an id prefix)
 * never form a pass.
 */
const PASS_FAILURE_LIMIT = 50;

export const advanceMigrationPass = ({ previous = null, report, nowMs, passId = null } = {}) => {
  if (!report || typeof report !== 'object') return null;
  const startAfter = clean(report.startAfter);
  const continues = Boolean(startAfter)
    && previous && typeof previous === 'object'
    && (previous.completedAtMs === null || previous.completedAtMs === undefined)
    && clean(previous.nextCursor) === startAfter;
  if (startAfter && !continues) return null;
  const base = continues ? previous : {
    passId: clean(passId) || `pass-${nowMs}`,
    startedAtMs: nowMs,
    pages: 0,
    failureCount: 0,
    failures: [],
    ...Object.fromEntries(MIGRATION_COUNTERS.map((key) => [key, 0])),
  };
  const failures = Array.isArray(report.failures) ? report.failures : [];
  const next = {
    ...base,
    pages: (Number(base.pages) || 0) + 1,
    nextCursor: report.nextCursor ?? null,
    completedAtMs: report.done === true ? nowMs : null,
    failureCount: (Number(base.failureCount) || 0) + failures.length,
    failures: [...(Array.isArray(base.failures) ? base.failures : []), ...failures].slice(0, PASS_FAILURE_LIMIT),
  };
  MIGRATION_COUNTERS.forEach((key) => { next[key] = (Number(base[key]) || 0) + (Number(report[key]) || 0); });
  return next;
};

/** The pass a page belonged to, as the report carries it. */
const passSummary = (pass) => (pass ? {
  passId: pass.passId,
  pages: pass.pages,
  completed: pass.completedAtMs !== null && pass.completedAtMs !== undefined,
  failureCount: pass.failureCount,
} : null);

/**
 * One bounded pass of the staged migration (see docs/architecture/
 * student-assignment-overrides.md for the stages and when each may run).
 *
 *   backfill  copy every shared per-student control into private storage
 *             (idempotent; a second run writes nothing);
 *   strip     remove them from the shared documents — refused unless the
 *             storage switch says the shared copy is retired;
 *   restore   the rollback of a strip — refused while it is retired.
 *
 * Pages through `assignments` by document id from `startAfter`, at most
 * `maxAssignments` per call; returns `nextCursor` (null when done). Each
 * assignment commits on its own, so an interruption leaves every document
 * either untouched or finished, and a rerun from any cursor is safe.
 */
export const runOverrideMigration = async ({
  db,
  mode = 'backfill',
  dryRun = true,
  startAfter = null,
  maxAssignments = MIGRATION_PAGE_DEFAULT,
  migrationRunId = null,
  actor = null,
  // A canary run: only assignments whose id starts with this (the operator's
  // first run, and the emulator tests, which share one database).
  assignmentIdPrefix = null,
  nowMs = Date.now(),
} = {}) => {
  if (!MIGRATION_MODES.includes(mode)) fail('invalid-argument', `Unknown migration mode. Use one of: ${MIGRATION_MODES.join(', ')}.`);
  const storageMode = storageModeFrom(await flagRef(db).get());
  if (!dryRun && mode === 'strip' && !storageMode.sharedRetired) {
    fail('failed-precondition', 'Turn on "shared copy retired" first: stripping while previous-release clients still read the shared copy would hide their extensions from them.');
  }
  if (!dryRun && mode === 'restore' && storageMode.sharedRetired) {
    fail('failed-precondition', 'Turn "shared copy retired" off first: a restore writes the shared copy back for previous-release clients.');
  }
  const pageSize = Math.max(1, Math.min(MIGRATION_PAGE_MAX, Math.floor(Number(maxAssignments) || MIGRATION_PAGE_DEFAULT)));
  const prefix = clean(assignmentIdPrefix);
  let query = db.collection('assignments');
  if (prefix) {
    query = query.where(FieldPath.documentId(), '>=', prefix).where(FieldPath.documentId(), '<', `${prefix}\uf8ff`);
  }
  query = query.orderBy(FieldPath.documentId()).limit(pageSize);
  if (clean(startAfter)) query = query.startAfter(clean(startAfter));
  const page = await query.get();
  const totals = emptyTotals();

  for (const doc of page.docs) {
    totals.assignmentsScanned += 1;
    const data = doc.data() || {};
    const ids = legacyStudentIds(data);
    if (ids.length) {
      totals.assignmentsWithSharedStudentData += 1;
      totals.sharedStudentEntries += ids.length;
    }
    try {
      if (mode === 'backfill' || mode === 'strip') {
        if (ids.length) {
          // eslint-disable-next-line no-await-in-loop
          const counts = await absorbAssignment({ db, assignmentId: doc.id, dryRun, migrationRunId, source: 'migration' });
          totals.recordsCreated += counts.created || 0;
          totals.recordsUpdated += counts.updated || 0;
          totals.recordsUnchanged += counts.unchanged || 0;
          totals.recordsConfirmedPrivate += counts.unchanged || 0;
          totals.auditCopiesCreated += counts.auditCopies || 0;
          totals.extensionDetailsMoved += counts.extensionDetailsMoved || 0;
          totals.derivedFieldsIgnored += counts.derivedFieldsIgnored || 0;
        }
      }
      if (mode === 'strip') {
        // eslint-disable-next-line no-await-in-loop
        const outcome = await stripAssignment({ db, assignmentId: doc.id, dryRun, migrationRunId });
        if (outcome.alreadyClean) totals.assignmentsAlreadyClean += 1;
        if (outcome.stripped) totals.assignmentsStripped += 1;
        if (outcome.archiveCreated) totals.archivesWritten += 1;
        if (outcome.wouldStrip) totals.assignmentsStripped += 1;
        if (outcome.archiveWouldBeWritten) totals.archivesToWrite += 1;
        if (outcome.pendingAbsorption) {
          // Dry run: the real strip copies these into private records first.
          totals.assignmentsAwaitingAbsorption += 1;
          totals.studentsAwaitingAbsorption += outcome.pendingAbsorption;
        }
        if (outcome.notAbsorbed) {
          totals.assignmentsAwaitingAbsorption += 1;
          totals.studentsAwaitingAbsorption += outcome.notAbsorbed.length;
          totals.failures.push({ assignmentId: doc.id, reason: `changed while stripping (${outcome.notAbsorbed.length} students) — run again` });
        }
      }
      if (mode === 'restore') {
        // eslint-disable-next-line no-await-in-loop
        const outcome = await restoreAssignment({ db, assignmentId: doc.id, dryRun });
        if (outcome.sharedWrites) totals.assignmentsRestored += 1;
        totals.sharedWritesRestored += outcome.sharedWrites || 0;
      }
    } catch (error) {
      totals.failures.push({ assignmentId: doc.id, reason: String(error?.message || error).slice(0, 200) });
    }
  }

  const nextCursor = page.size === pageSize ? page.docs[page.docs.length - 1].id : null;
  const report = {
    mode,
    dryRun,
    migrationRunId: migrationRunId || null,
    assignmentIdPrefix: prefix || null,
    startAfter: clean(startAfter) || null,
    nextCursor,
    done: nextCursor === null,
    sharedRetired: storageMode.sharedRetired,
    ...totals,
  };
  // The cursor is kept server-side too, so an interrupted run resumes from it,
  // and every full (unprefixed) page advances its pass (advanceMigrationPass),
  // in one transaction with what it read — the retirement gate counts passes.
  const key = prefix ? `${mode}Canary` : mode;
  const pass = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(progressRef(db));
    const current = snapshot.exists ? snapshot.data() || {} : {};
    const modeState = { ...(current[key] && typeof current[key] === 'object' ? current[key] : {}) };
    modeState[dryRun ? 'lastDryRun' : 'lastRun'] = {
      ...report,
      failures: report.failures.slice(0, 50),
      actorEmail: actor?.email || null,
      at: FieldValue.serverTimestamp(),
    };
    // Only a full real run moves the resume cursor.
    if (!prefix && !dryRun) {
      modeState.cursor = nextCursor;
      modeState.done = report.done && report.failures.length === 0;
      modeState.lastRealRunAtMs = nowMs;
    }
    // A full run's passes are what the retirement gate reads. A canary run
    // keeps its own, per prefix (canaryPasses), which the gate never reads —
    // so a rehearsal on a few assignments can be checked the same way.
    const canaryPasses = { ...(current.canaryPasses && typeof current.canaryPasses === 'object' ? current.canaryPasses : {}) };
    const canaryMode = { ...(canaryPasses[mode] && typeof canaryPasses[mode] === 'object' ? canaryPasses[mode] : {}) };
    const passState = prefix ? { ...(canaryMode[prefix] && typeof canaryMode[prefix] === 'object' ? canaryMode[prefix] : {}) } : modeState;
    const passKey = dryRun ? 'dryRunPass' : 'pass';
    const advanced = advanceMigrationPass({ previous: passState[passKey] || null, report, nowMs, passId: migrationRunId });
    if (advanced) {
      passState[passKey] = advanced;
      if (advanced.completedAtMs !== null) passState[dryRun ? 'lastCompletedDryRunPass' : 'lastCompletedPass'] = advanced;
    }
    const next = { ...current, [key]: modeState };
    if (prefix) next.canaryPasses = { ...canaryPasses, [mode]: { ...canaryMode, [prefix]: passState } };
    // The whole document, from what this transaction read: nested pass maps
    // are replaced, never merged key by key with an older pass.
    transaction.set(progressRef(db), next);
    return advanced;
  });
  return { ...report, pass: passSummary(pass) };
};

/** Where an interrupted run left off, and how the last runs went. */
export const readOverrideMigrationProgress = async ({ db } = {}) => {
  const snap = await progressRef(db).get();
  return snap.exists ? snap.data() : {};
};

/* -------------------------------------------------------------- the absorber */

/**
 * A write to a shared assignment changed its per-student data. That can only
 * be a client from the previous release (current clients and every server
 * writer go through private storage) or a stale tab: absorb what it wrote
 * into private storage, then either keep the shared copy agreeing with the
 * merge (mirror) or — once it is retired — remove it again.
 */
export const absorbSharedStudentControls = async ({ db, assignmentId, before = null, after = null } = {}) => {
  if (!after) return { skipped: 'deleted' };
  if (!perStudentSharedDataChanged(before, after)) return { skipped: 'no-per-student-change' };
  if (!legacyStudentIds(after).length) return { skipped: 'nothing-shared' };
  const counts = await absorbAssignment({ db, assignmentId, source: 'absorber' });
  const storageMode = storageModeFrom(await flagRef(db).get());
  if (storageMode.sharedRetired) {
    const stripped = await stripAssignment({ db, assignmentId });
    return { absorbed: counts, stripped };
  }
  // Mirror: make the shared copy say what the merge says (a stale tab can
  // write an older, smaller grant back; the merge kept the larger one).
  const repaired = await db.runTransaction(async (transaction) => {
    const ref = db.collection('assignments').doc(clean(assignmentId));
    const snap = await transaction.get(ref);
    if (!snap.exists) return 0;
    const assignment = { id: snap.id, ...snap.data() };
    const ids = legacyStudentIds(assignment);
    const privateSnaps = await Promise.all(ids.map((id) => transaction.get(overrideRef(db, id, assignment.id))));
    const writes = ids.flatMap((id, index) => {
      const resolved = resolveStudentOverride({
        assignment,
        studentId: id,
        privateOverride: privateSnaps[index].exists ? privateSnaps[index].data() : null,
      });
      if (!legacyStudentOverride(assignment, id)) return [];
      return planSharedCopyWrites({ assignment, studentId: id, override: resolved, storageMode });
    });
    return applySharedWrites(transaction, ref, writes);
  });
  return { absorbed: counts, repairedSharedFields: repaired };
};

export default applyStudentControlsChange;
