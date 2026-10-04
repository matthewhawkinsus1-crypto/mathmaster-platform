/*
 * ONE STUDENT'S CONTROLS ON ONE ASSIGNMENT — KEPT PRIVATE, RESOLVED ONCE.
 *
 * `assignments/{id}` is the shared lesson: every student in every class it is
 * assigned to receives the whole document. Until this module, that document
 * also carried each student's own controls, keyed by student id:
 *
 *   studentOverrides[sid].lateDueAt / .dueAt      an individual final cutoff
 *   studentOverrides[sid].extension               {dateKey, grantedAt} stub
 *   studentOverrides[sid].excused / .reopened     teacher flags
 *   excusedStudentIds[] / reopenedStudentIds[]    the same flags, array form
 *   dol.attemptGrantsByStudentId[sid]             extra DOL attempts
 *   dol.recoveryAudit[] (students scope)          who was granted what
 *
 * so a student legitimately reading their own class's lesson also received
 * every classmate's deadline, excusal and attempt grant (PR #415 I-4).
 *
 * WHERE THEY LIVE NOW. One small document per (student, assignment):
 *
 *   studentAssignmentOverrides/{len:studentId:assignmentId}
 *
 * readable by that student, their teacher of record (the record carries its
 * own `authorizedTeacherEmails`, as every teacher-readable record here does —
 * see authorizationContext.mjs) and the root administrator; written only by
 * the Admin SDK. A staff-only, immutable history of every change sits under the
 * student (grades/{sid}/assignmentOverrideEvents), and anything removed from a
 * shared document is archived verbatim first (assignmentOverrideArchives).
 *
 * THE ONE PRECEDENCE. Every reader — the student's dashboard, the Grade
 * Center, ingestion, the deadline finalizer, Recovery, Practice Pass, Grade
 * Transfer, the teacher's screens — asks this module what one student's
 * controls are (`resolveStudentOverride`) and what their deadlines are
 * (`resolveStudentDeadlines`). The inputs are kept apart on purpose:
 *
 *   assignment       the shared lesson and its class-wide configuration
 *   privateOverride  THIS student's record, read by the caller with its own
 *                    authority — never a value a browser sent
 *   support dates    derived from the student's pinned profile, in memory only
 *                    (supportDeadline.mjs); never stored here
 *   time             the caller's authoritative clock or capture time
 *
 * DUAL READ, NEVER A LOST GRANT. During the migration a student's controls can
 * exist in both places. `privateOverride === undefined` means the caller did
 * not read private storage (an older code path): the shared document is the
 * whole answer, exactly as before. Otherwise the two are merged so that no
 * grant made in either place is lost:
 *
 *   final cutoff     the newer teacher decision (extension.grantedAt) wins;
 *                    with no way to tell, the later cutoff wins
 *   excused/reopened either place set means set
 *   DOL attempts     the larger grant (grants only ever increase)
 *
 * Every server writer keeps the two places consistent in the same transaction
 * (mirroring while old clients may still read the shared copy, deleting the
 * shared copy once it is retired), so a disagreement only ever means a write
 * from an older client — newer intent, which the merge honours. Such a write
 * can only ever ADD: before this module the only writers were the extension
 * callable (which never shortens a cutoff) and the teacher's DOL grant (which
 * only increments), and nothing wrote excused/reopened at all. So the merge's
 * "either place" can never undo a removal a teacher meant — a removal is made
 * here, through the callables, which clear every shared form at once.
 *
 * Pure: no Firestore, no clock. The callables, the migration, the absorber
 * trigger, the browser and the tests all read this one definition.
 */
import { parseInstant } from './instructionalCalendar.mjs';

export const STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION = 'studentAssignmentOverrides';
/** grades/{studentId}/assignmentOverrideEvents/{eventId} — staff-only history. */
export const ASSIGNMENT_OVERRIDE_EVENTS_COLLECTION = 'assignmentOverrideEvents';
/** Verbatim copies of per-student data removed from a shared assignment. Root admin only. */
export const ASSIGNMENT_OVERRIDE_ARCHIVES_COLLECTION = 'assignmentOverrideArchives';
/** Resumable migration state. Root admin only. */
export const PLATFORM_MIGRATIONS_COLLECTION = 'platformMigrations';
export const OVERRIDE_MIGRATION_ID = 'studentAssignmentOverrides';

export const STUDENT_ASSIGNMENT_OVERRIDE_SCHEMA_VERSION = 1;
export const MAX_TEACHER_GRANTED_ATTEMPTS = 20;

/*
 * THE STORAGE SWITCH.
 *
 * platformFlags/assignmentOverrideStorage.sharedRetired
 *
 *   false (absent: how a release ships) — private storage is the authority,
 *     and every server writer ALSO mirrors the student's effective controls
 *     onto the shared document, because clients from the previous release
 *     still read them there. Legacy writes are absorbed into private storage.
 *   true — the shared copy is retired: writers stop mirroring and delete it,
 *     the absorber strips anything an older tab writes back, the migration may
 *     strip every shared document, and firestore.rules refuses client writes
 *     that would put per-student data back on an assignment.
 *
 * Flipping it back to false is the rollback (then run the `restore` pass).
 */
export const OVERRIDE_STORAGE_FLAG = 'assignmentOverrideStorage';
export const SHARED_RETIRED_FIELD = 'sharedRetired';

export const resolveOverrideStorageMode = (flagData = null) => {
  const sharedRetired = Boolean(flagData && typeof flagData === 'object' && flagData[SHARED_RETIRED_FIELD] === true);
  return Object.freeze({ sharedRetired, mirrorShared: !sharedRetired });
};

export const OVERRIDE_CHANGE = Object.freeze({
  ATTENDANCE_EXTENSION: 'attendanceExtension',
  DOL_ATTEMPTS: 'dolAttempts',
  EXCUSED: 'excused',
  REOPENED: 'reopened',
});

export const OVERRIDE_EVENT_KIND = Object.freeze({
  ...OVERRIDE_CHANGE,
  MIGRATED: 'migrated',
  LEGACY_ABSORBED: 'legacyAbsorbed',
  LEGACY_AUDIT: 'legacyAuditEntry',
});

/* ------------------------------------------------------------------ helpers */

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const cleanEmail = (value) => clean(value).toLowerCase();
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const millisOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const number = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const grantCount = (grant) => {
  const value = isObject(grant) ? grant.extraAttempts : grant;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(MAX_TEACHER_GRANTED_ATTEMPTS, Math.floor(parsed))) : 0;
};

const maxOf = (...values) => {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.max(...finite) : null;
};

/** A stored deadline exactly as written: an ISO instant or a date key. Empty is null. */
const deadlineValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() ? value.trim() : null;
  // A Timestamp or Date from an older writer is kept as the instant it names.
  const ms = millisOrNull(value);
  return ms === null ? null : new Date(ms).toISOString();
};

/** The extension stub the shared document has held since PR #415 — no reasons. */
const extensionStub = (extension) => {
  if (!isObject(extension)) return null;
  const dateKey = typeof extension.dateKey === 'string' && DATE_KEY.test(extension.dateKey.trim())
    ? extension.dateKey.trim()
    : null;
  const grantedAt = millisOrNull(extension.grantedAt);
  if (dateKey === null && grantedAt === null) return null;
  return { dateKey, grantedAt };
};

const dolAttemptGrant = (grant) => {
  if (grant === null || grant === undefined) return null;
  const extraAttempts = grantCount(grant);
  if (!isObject(grant)) return extraAttempts > 0 ? { extraAttempts, changedAt: null, changedBy: null, reason: null } : null;
  return {
    extraAttempts,
    changedAt: grant.changedAt ? String(grant.changedAt) : null,
    changedBy: grant.changedBy ? String(grant.changedBy) : null,
    reason: grant.reason ? String(grant.reason) : null,
  };
};

/* Derived support dates ride along in memory (withStudentSupportDates); never stored. */
const SUPPORT_DERIVED_KEYS = Object.freeze(['supportDueAt', 'supportFinalAt', 'supportDeadline']);

/* -------------------------------------------------------------- storage ids */

/**
 * The private record's id. Length-prefixed (like classPoints.mjs accountId) so
 * no pair of ids can collide whatever characters they contain.
 */
export const studentAssignmentOverrideId = (studentId, assignmentId) => {
  const student = clean(studentId);
  const assignment = clean(assignmentId);
  if (!student || !assignment) return null;
  return `${student.length}:${student}:${assignment}`;
};

/** One event per record revision: a retried transaction writes the same id. */
export const overrideEventId = (assignmentId, revision) => `${clean(assignmentId)}__r${Math.max(0, Math.floor(Number(revision) || 0))}`;

/** A small stable digest (two FNV-1a passes) for deterministic ids. */
export const stableDigest = (value) => {
  const text = typeof value === 'string' ? value : stableStringify(value);
  const pass = (seed) => {
    let hash = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  return `${pass(0x811c9dc5)}${pass(0x9e3779b9)}`;
};

/** JSON with sorted keys, so equal content always digests equally. */
export const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    if (typeof value.toMillis === 'function') return JSON.stringify(value.toMillis());
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
};

export const legacyAuditEventId = (assignmentId, entry) => `legacy-audit__${clean(assignmentId)}__${stableDigest(entry)}`;

/* ---------------------------------------------------- recovery audit entries */

/** The student ids a DOL recovery audit entry names (empty for a class-scoped entry). */
export const auditEntryStudentIds = (entry) => {
  if (!isObject(entry)) return [];
  const ids = new Set();
  if (isObject(entry.scope) && Array.isArray(entry.scope.studentIds)) entry.scope.studentIds.forEach((id) => { if (clean(id)) ids.add(clean(id)); });
  ['previous', 'next'].forEach((side) => {
    if (isObject(entry[side]) && isObject(entry[side].extraAttemptsByStudent)) {
      Object.keys(entry[side].extraAttemptsByStudent).forEach((id) => { if (clean(id)) ids.add(clean(id)); });
    }
  });
  return [...ids];
};

export const isStudentScopedAuditEntry = (entry) => auditEntryStudentIds(entry).length > 0;

/**
 * One student's share of a students-scope audit entry: the other students'
 * ids and counts removed, and the entry id (which embedded every id) replaced.
 */
export const studentAuditEntryFor = (entry, studentId) => {
  const id = clean(studentId);
  const pick = (map) => (isObject(map) && id in map ? { [id]: map[id] } : {});
  const out = { ...entry };
  out.id = `legacy:${stableDigest(entry)}`;
  if (isObject(entry.scope)) out.scope = { ...entry.scope, studentIds: auditEntryStudentIds({ scope: entry.scope }).includes(id) ? [id] : [] };
  ['previous', 'next'].forEach((side) => {
    if (isObject(entry[side]) && isObject(entry[side].extraAttemptsByStudent)) {
      out[side] = { ...entry[side], extraAttemptsByStudent: pick(entry[side].extraAttemptsByStudent) };
    }
  });
  return out;
};

/* ------------------------------------------------------- the two sources */

const legacyEntryOf = (assignment, studentId) => {
  const overrides = assignment?.studentOverrides;
  return isObject(overrides) && isObject(overrides[studentId]) ? overrides[studentId] : null;
};

/** True when the shared document carries anything about this student. */
export const assignmentHasLegacyStudentData = (assignment, studentId) => {
  const id = clean(studentId);
  if (!id || !isObject(assignment)) return false;
  return Boolean(
    legacyEntryOf(assignment, id)
    || (isObject(assignment.dol?.attemptGrantsByStudentId) && id in assignment.dol.attemptGrantsByStudentId)
    || list(assignment.excusedStudentIds).map(clean).includes(id)
    || list(assignment.reopenedStudentIds).map(clean).includes(id)
    || list(assignment.dol?.recoveryAudit).some((entry) => auditEntryStudentIds(entry).includes(id)),
  );
};

/** Every student the shared document carries per-student data about. */
export const legacyStudentIds = (assignment) => {
  if (!isObject(assignment)) return [];
  const ids = new Set();
  if (isObject(assignment.studentOverrides)) Object.keys(assignment.studentOverrides).forEach((id) => ids.add(clean(id)));
  if (isObject(assignment.dol?.attemptGrantsByStudentId)) Object.keys(assignment.dol.attemptGrantsByStudentId).forEach((id) => ids.add(clean(id)));
  list(assignment.excusedStudentIds).forEach((id) => ids.add(clean(id)));
  list(assignment.reopenedStudentIds).forEach((id) => ids.add(clean(id)));
  list(assignment.dol?.recoveryAudit).forEach((entry) => auditEntryStudentIds(entry).forEach((id) => ids.add(id)));
  ids.delete('');
  return [...ids].sort();
};

/**
 * What the SHARED document says about one student, in every form it has ever
 * been written: the override entry (lateDueAt, or the older `dueAt`; the
 * extension stub; excused/reopened), the array forms of the flags, and the
 * DOL attempt grant. Null when it says nothing.
 *
 * In memory a student's own view can also carry derived support dates
 * (withStudentSupportDates) and an already-resolved `dolExtraAttempts`; both
 * are read back so a view resolves to itself.
 */
export const legacyStudentOverride = (assignment, studentId) => {
  const id = clean(studentId);
  if (!id || !isObject(assignment)) return null;
  const entry = legacyEntryOf(assignment, id);
  const rawGrant = isObject(assignment.dol?.attemptGrantsByStudentId) ? assignment.dol.attemptGrantsByStudentId[id] : undefined;
  const excusedListed = list(assignment.excusedStudentIds).map(clean).includes(id);
  const reopenedListed = list(assignment.reopenedStudentIds).map(clean).includes(id);
  if (!entry && rawGrant === undefined && !excusedListed && !reopenedListed) return null;

  const grant = dolAttemptGrant(rawGrant);
  const entryAttempts = entry ? grantCount(entry.dolExtraAttempts) : 0;
  const dolExtraAttempts = Math.max(grant?.extraAttempts || 0, entryAttempts);
  const effective = {
    // `dueAt` is what builds before the attendance-extension rewrite stored;
    // every reader has always taken it as the final cutoff when there is no
    // `lateDueAt`, never as the on-time due date.
    lateDueAt: entry ? deadlineValue(entry.lateDueAt) || deadlineValue(entry.dueAt) : null,
    extension: entry ? extensionStub(entry.extension) : null,
    excused: entry?.excused === true || excusedListed,
    reopened: entry?.reopened === true || reopenedListed,
    dolExtraAttempts,
    dolAttemptGrant: grant && grant.extraAttempts >= entryAttempts
      ? grant
      : (entry && isObject(entry.dolAttemptGrant) ? dolAttemptGrant(entry.dolAttemptGrant) : grant),
  };
  if (entry) SUPPORT_DERIVED_KEYS.forEach((key) => { if (entry[key] !== undefined) effective[key] = entry[key]; });
  return effective;
};

/**
 * A private record reduced to the controls it may carry. An allow-list: a
 * support date, a reason, a classmate's anything — none of it survives.
 */
export const normalizeStudentOverrideRecord = (record) => {
  if (!isObject(record)) return null;
  return {
    lateDueAt: deadlineValue(record.lateDueAt),
    extension: extensionStub(record.extension),
    excused: record.excused === true,
    reopened: record.reopened === true,
    dolExtraAttempts: grantCount(record.dolExtraAttempts),
    dolAttemptGrant: isObject(record.dolAttemptGrant) ? dolAttemptGrant(record.dolAttemptGrant) : null,
  };
};

/** The controls themselves, for comparing two answers. */
const controlsOf = (override) => ({
  lateDueAt: override?.lateDueAt ?? null,
  extension: override?.extension ? { dateKey: override.extension.dateKey ?? null, grantedAt: override.extension.grantedAt ?? null } : null,
  excused: override?.excused === true,
  reopened: override?.reopened === true,
  dolExtraAttempts: grantCount(override?.dolExtraAttempts),
});

export const sameStudentControls = (left, right) => stableStringify(controlsOf(left)) === stableStringify(controlsOf(right));

export const studentControlsAreEmpty = (override) => {
  const controls = controlsOf(override);
  return controls.lateDueAt === null && controls.extension === null && !controls.excused && !controls.reopened && controls.dolExtraAttempts === 0;
};

/* --------------------------------------------------------------- the merge */

const deadlineMs = (value) => parseInstant(value, { endOfDay: true });

/**
 * Which of two final-cutoff decisions stands. The newer teacher decision when
 * the grant times say which is newer; otherwise the later cutoff, which is the
 * rule every deadline reader already applied ("none can shorten another").
 */
const newerDeadline = (privateSide, legacySide) => {
  const pGranted = privateSide.extension?.grantedAt ?? null;
  const lGranted = legacySide.extension?.grantedAt ?? null;
  const pick = (side) => ({ lateDueAt: side.lateDueAt, extension: side.extension });
  if (Number.isFinite(pGranted) && Number.isFinite(lGranted) && pGranted !== lGranted) {
    return pick(pGranted > lGranted ? privateSide : legacySide);
  }
  if (Number.isFinite(pGranted) !== Number.isFinite(lGranted)) {
    // Only one side has ever been stamped by a grant: that side was written by
    // the newer writer (an un-stamped value is older than any stamped one).
    return pick(Number.isFinite(pGranted) ? privateSide : legacySide);
  }
  const pMs = deadlineMs(privateSide.lateDueAt);
  const lMs = deadlineMs(legacySide.lateDueAt);
  if (pMs === null && lMs === null) return pick(privateSide.extension ? privateSide : legacySide);
  if (pMs === null) return pick(legacySide);
  if (lMs === null) return pick(privateSide);
  return pick(lMs > pMs ? legacySide : privateSide);
};

/**
 * Merge a student's private record with what the shared document says.
 * See the module header for why each rule is the one that loses nothing.
 */
export const mergeStudentOverride = ({ privateOverride = null, legacyOverride = null } = {}) => {
  const privateSide = isObject(privateOverride) ? normalizeStudentOverrideRecord(privateOverride) : null;
  const legacySide = isObject(legacyOverride) ? legacyOverride : null;
  if (!privateSide && !legacySide) return null;
  const support = {};
  if (legacySide) SUPPORT_DERIVED_KEYS.forEach((key) => { if (legacySide[key] !== undefined) support[key] = legacySide[key]; });
  if (!legacySide) return { ...privateSide, source: 'private' };
  if (!privateSide) return { ...controlsAndGrant(legacySide), ...support, source: 'shared' };

  const deadline = newerDeadline(privateSide, legacySide);
  const legacyAttempts = grantCount(legacySide.dolExtraAttempts);
  const dolExtraAttempts = Math.max(privateSide.dolExtraAttempts, legacyAttempts);
  return {
    lateDueAt: deadline.lateDueAt ?? null,
    extension: deadline.extension ?? null,
    excused: privateSide.excused || legacySide.excused === true,
    reopened: privateSide.reopened || legacySide.reopened === true,
    dolExtraAttempts,
    dolAttemptGrant: legacyAttempts > privateSide.dolExtraAttempts
      ? (legacySide.dolAttemptGrant || null)
      : (privateSide.dolAttemptGrant || legacySide.dolAttemptGrant || null),
    ...support,
    source: 'merged',
  };
};

const controlsAndGrant = (side) => ({
  lateDueAt: side.lateDueAt ?? null,
  extension: side.extension ?? null,
  excused: side.excused === true,
  reopened: side.reopened === true,
  dolExtraAttempts: grantCount(side.dolExtraAttempts),
  dolAttemptGrant: side.dolAttemptGrant || null,
});

/**
 * THE question: what are this student's controls on this assignment?
 *
 * `privateOverride`:
 *   undefined — the caller did not read private storage; the shared document
 *               is the whole answer (exactly the pre-migration behaviour).
 *   null      — the caller read it and there is no record.
 *   a record  — the student's private record, as stored.
 *
 * Returns null when the student has no controls at all.
 */
export const resolveStudentOverride = ({ assignment = null, studentId = null, privateOverride = undefined } = {}) => {
  const id = clean(studentId);
  if (!id) return null;
  const legacy = legacyStudentOverride(assignment, id);
  if (privateOverride === undefined) return legacy ? { ...legacy, source: 'shared' } : null;
  return mergeStudentOverride({ privateOverride, legacyOverride: legacy });
};

/* ------------------------------------------------------- deadlines, attempts */

/**
 * THE DEADLINE PRECEDENCE, pinned (tests/platform/studentAssignmentOverrides.test.mjs):
 *
 *   on-time due   = max(class due, individualized extra-time due)
 *                   — an attendance extension never moves it: it buys back
 *                   credit time, not on-time status;
 *   final cutoff  = max(class final (late window, else due),
 *                       the student's individual extension,
 *                       individualized extra-time final)
 *                   — none can shorten another;
 *   excused / reopened change no date: excused takes the assignment out of the
 *                   grade, reopened holds an export; neither opens a closed
 *                   assignment (only an extension does);
 *   Warm-Up / DOL class windows and a teacher's manual section close are
 *                   class-wide and are resolved in sectionDeadline.mjs; this
 *                   cutoff only replaces their "no window today" fallback.
 *
 * `override` is the RESOLVED override (resolveStudentOverride), optionally
 * carrying in-memory support dates. `timeZone` is passed through unchanged
 * from each caller, so a date-only class date parses exactly as it did.
 */
export const resolveStudentDeadlines = ({ assignment = null, override = null, timeZone = null } = {}) => {
  const classDueAtMs = parseInstant(assignment?.dueAt || assignment?.dueDate, { endOfDay: true, timeZone });
  const classFinalAtMs = parseInstant(
    assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate,
    { endOfDay: true, timeZone },
  );
  const releaseAtMs = parseInstant(assignment?.releaseAt || assignment?.releaseDate, { timeZone });
  const extensionFinalAtMs = parseInstant(override?.lateDueAt, { endOfDay: true, timeZone });
  // Instants written by withStudentSupportDates, never date keys.
  const supportDueAtMs = parseInstant(override?.supportDueAt, { timeZone });
  const supportFinalAtMs = parseInstant(override?.supportFinalAt, { timeZone });
  return {
    releaseAtMs,
    classDueAtMs,
    classFinalAtMs,
    extensionFinalAtMs,
    supportDueAtMs,
    supportFinalAtMs,
    dueAtMs: maxOf(classDueAtMs, supportDueAtMs),
    finalCloseAtMs: maxOf(classFinalAtMs, extensionFinalAtMs, supportFinalAtMs),
    excused: override?.excused === true,
    reopened: override?.reopened === true,
  };
};

/**
 * Extra DOL attempts a teacher granted: the class grant plus this student's
 * own, capped together. The class grant stays on the shared document (it is
 * about the class); the student's comes from the resolved override.
 */
export const resolveStudentDolExtraAttempts = ({ assignment = null, classId = null, studentId = null, privateOverride = undefined } = {}) => {
  const classGrant = classId ? grantCount(assignment?.dol?.attemptGrantsByClassId?.[classId]) : 0;
  const resolved = studentId ? resolveStudentOverride({ assignment, studentId, privateOverride }) : null;
  const studentGrant = grantCount(resolved?.dolExtraAttempts);
  return {
    classGrant,
    studentGrant,
    total: Math.max(0, Math.min(MAX_TEACHER_GRANTED_ATTEMPTS, classGrant + studentGrant)),
  };
};

/* ------------------------------------------------------ in-memory projections */

/** The override as the shared document's entry shape, for code that still reads it. */
export const overrideEntryFor = (override) => {
  if (!override) return null;
  const entry = {};
  if (override.lateDueAt) entry.lateDueAt = override.lateDueAt;
  if (override.extension) entry.extension = { ...override.extension };
  if (override.excused === true) entry.excused = true;
  if (override.reopened === true) entry.reopened = true;
  if (grantCount(override.dolExtraAttempts) > 0) {
    entry.dolExtraAttempts = grantCount(override.dolExtraAttempts);
    if (override.dolAttemptGrant) entry.dolAttemptGrant = { ...override.dolAttemptGrant };
  }
  SUPPORT_DERIVED_KEYS.forEach((key) => { if (override[key] !== undefined) entry[key] = override[key]; });
  return Object.keys(entry).length ? entry : null;
};

/**
 * ONE STUDENT'S VIEW of a shared assignment: every classmate's entry gone,
 * this student's resolved controls in the places the runtime reads them.
 *
 * Safe to build on a student's device and nowhere else: students cannot write
 * assignments, so nothing here can be written back. A teacher's in-memory copy
 * must use teacherAssignmentView, which never touches `dol` (teacher DOL
 * actions write the whole `dol` map back from memory).
 */
export const studentAssignmentView = (assignment, { studentId = null, privateOverride = undefined } = {}) => {
  if (!isObject(assignment)) return assignment;
  const id = clean(studentId);
  const resolved = id ? resolveStudentOverride({ assignment, studentId: id, privateOverride }) : null;
  const entry = overrideEntryFor(resolved);
  const view = { ...assignment };
  delete view.studentOverrides;
  delete view.excusedStudentIds;
  delete view.reopenedStudentIds;
  if (entry) view.studentOverrides = { [id]: entry };
  if (isObject(view.dol)) {
    const dol = { ...view.dol };
    delete dol.attemptGrantsByStudentId;
    if (entry?.dolExtraAttempts) dol.attemptGrantsByStudentId = { [id]: entry.dolAttemptGrant || { extraAttempts: entry.dolExtraAttempts } };
    if (Array.isArray(dol.recoveryAudit)) dol.recoveryAudit = dol.recoveryAudit.filter((auditEntry) => !isStudentScopedAuditEntry(auditEntry));
    view.dol = dol;
  }
  return view;
};

/**
 * The entry a STAFF screen reads for one student: the resolved controls, and —
 * when the shared copy's extension is the very grant that resolved (same date
 * key and grant time) — that extension verbatim, because an extension written
 * before PR #415 still carries its reasons (meetings, absence dates) there, and
 * the case review shows them when the private grant history is not loaded.
 * Never used for a student's own view, which carries the stub only.
 */
export const staffOverrideEntryFor = (assignment, studentId, privateOverride = undefined) => {
  const id = clean(studentId);
  if (!id) return null;
  const entry = overrideEntryFor(resolveStudentOverride({ assignment, studentId: id, privateOverride }));
  const shared = legacyEntryOf(assignment, id)?.extension;
  if (entry?.extension && isObject(shared)) {
    const stub = extensionStub(shared);
    if (stub && stub.dateKey === entry.extension.dateKey && stub.grantedAt === entry.extension.grantedAt) {
      entry.extension = { ...shared };
    }
  }
  return entry;
};

/**
 * A TEACHER'S VIEW: the shared assignment with `studentOverrides` replaced by
 * every student's resolved controls (private records merged over the shared
 * copy). Only `studentOverrides` changes — a field no client may write
 * (firestore.rules) and no teacher write carries — so a teacher action that
 * writes `dol`, `warmup` or `sectionAccess` from this copy writes exactly what
 * it read from the shared document, never a private value.
 *
 * `privateByStudentId` undefined means private storage was not read (the
 * shared document is the answer); an object means it was, and a student
 * absent from it has no private record.
 */
export const teacherAssignmentView = (assignment, privateByStudentId = undefined) => {
  if (!isObject(assignment)) return assignment;
  const privateMap = isObject(privateByStudentId) ? privateByStudentId : null;
  const ids = new Set(legacyStudentIds(assignment));
  if (privateMap) Object.keys(privateMap).forEach((id) => ids.add(clean(id)));
  const studentOverrides = {};
  [...ids].filter(Boolean).forEach((id) => {
    const entry = staffOverrideEntryFor(assignment, id, privateMap ? (privateMap[id] ?? null) : undefined);
    if (entry) studentOverrides[id] = entry;
  });
  const view = { ...assignment };
  if (Object.keys(studentOverrides).length) view.studentOverrides = studentOverrides;
  else delete view.studentOverrides;
  return view;
};

/* ------------------------------------------------------------ the record */

const uniqueEmails = (values) => [...new Set(list(values).map(cleanEmail).filter((email) => email.includes('@')))].sort();

/**
 * The authorization context for a record (authorizationContext.mjs fields):
 * the student's class and teacher of record now, plus the teacher who was
 * accountable when the record was first written.
 */
export const overrideAuthorizationContext = ({ existing = null, studentId, classRecord = null, student = null } = {}) => {
  const classId = clean(classRecord?.classId ?? student?.classId) || null;
  const teacher = cleanEmail(classRecord?.teacherOfRecord ?? student?.assignedTeacherEmail) || null;
  const originTeacherEmail = existing?.originTeacherEmail !== undefined ? (existing.originTeacherEmail || null) : teacher;
  const originClassId = existing?.originClassId !== undefined ? (existing.originClassId || null) : classId;
  return {
    studentId: clean(studentId),
    classId,
    originClassId,
    originTeacherEmail,
    authorizedTeacherEmails: uniqueEmails([originTeacherEmail, teacher]),
  };
};

/**
 * The private record as it is stored. Only the controls and their authority:
 * a student reads their own record, so no reason, no email and no support
 * data is ever put on it (the staff-only event carries who and why).
 */
export const buildStudentOverrideRecord = ({
  studentId,
  assignmentId,
  override,
  authorization,
  revision = 1,
  source = 'server',
  updatedBy = null,
} = {}) => {
  const controls = controlsOf(override);
  return {
    schemaVersion: STUDENT_ASSIGNMENT_OVERRIDE_SCHEMA_VERSION,
    studentId: clean(studentId),
    assignmentId: clean(assignmentId),
    classId: authorization?.classId ?? null,
    originClassId: authorization?.originClassId ?? null,
    originTeacherEmail: authorization?.originTeacherEmail ?? null,
    authorizedTeacherEmails: uniqueEmails(authorization?.authorizedTeacherEmails),
    lateDueAt: controls.lateDueAt,
    extension: controls.extension,
    excused: controls.excused,
    reopened: controls.reopened,
    dolExtraAttempts: controls.dolExtraAttempts,
    dolAttemptGrant: controls.dolExtraAttempts > 0 && override?.dolAttemptGrant ? dolAttemptGrant(override.dolAttemptGrant) : null,
    revision: Math.max(1, Math.floor(Number(revision) || 1)),
    source: clean(source) || 'server',
    updatedBy: updatedBy ? clean(updatedBy) : null,
  };
};

/** The staff-only history entry for one revision. */
export const buildOverrideEvent = ({
  kind,
  studentId,
  assignmentId,
  authorization,
  before = null,
  after = null,
  revision,
  actorEmail = null,
  actorUid = null,
  actorRole = 'system',
  source = 'server',
  legacy = null,
  reason = null,
  migrationRunId = null,
} = {}) => ({
  schemaVersion: STUDENT_ASSIGNMENT_OVERRIDE_SCHEMA_VERSION,
  kind: clean(kind),
  studentId: clean(studentId),
  assignmentId: clean(assignmentId),
  classId: authorization?.classId ?? null,
  originClassId: authorization?.originClassId ?? null,
  originTeacherEmail: authorization?.originTeacherEmail ?? null,
  authorizedTeacherEmails: uniqueEmails(authorization?.authorizedTeacherEmails),
  revision: Math.max(0, Math.floor(Number(revision) || 0)),
  before: before ? controlsOf(before) : null,
  after: after ? controlsOf(after) : null,
  actorEmail: actorEmail ? cleanEmail(actorEmail) : null,
  actorUid: actorUid ? clean(actorUid) : null,
  actorRole: clean(actorRole) || 'system',
  source: clean(source) || 'server',
  reason: reason ? clean(reason).slice(0, 300) : null,
  legacy: legacy === null || legacy === undefined ? null : legacy,
  migrationRunId: migrationRunId ? clean(migrationRunId) : null,
});

/* ------------------------------------------------ the shared-copy writes */

/**
 * What to write on the shared document for one student so it agrees with
 * their resolved controls.
 *
 *   mirrorShared — the shared copy is still read by previous-release clients:
 *                  make it say exactly what private storage says.
 *   retired      — delete every shared form of this student's controls.
 *
 * Returns [{ op: 'set'|'delete'|'arrayRemove', path: [...segments], value }],
 * only for what would actually change, so an unchanged student costs no
 * assignment write.
 */
export const planSharedCopyWrites = ({ assignment = null, studentId, override = null, storageMode } = {}) => {
  const id = clean(studentId);
  if (!id || !isObject(assignment)) return [];
  const mode = storageMode || resolveOverrideStorageMode(null);
  const writes = [];
  const entry = legacyEntryOf(assignment, id);
  const grants = isObject(assignment.dol?.attemptGrantsByStudentId) ? assignment.dol.attemptGrantsByStudentId : null;
  const excusedListed = list(assignment.excusedStudentIds).map(clean).includes(id);
  const reopenedListed = list(assignment.reopenedStudentIds).map(clean).includes(id);

  if (!mode.mirrorShared) {
    if (entry) writes.push({ op: 'delete', path: ['studentOverrides', id] });
    if (grants && id in grants) writes.push({ op: 'delete', path: ['dol', 'attemptGrantsByStudentId', id] });
    if (excusedListed) writes.push({ op: 'arrayRemove', path: ['excusedStudentIds'], value: id });
    if (reopenedListed) writes.push({ op: 'arrayRemove', path: ['reopenedStudentIds'], value: id });
    return writes;
  }

  const target = controlsOf(override);
  // Compared as the shared copy RESOLVES (every form it has been written in),
  // so a value it already says — a reopen in `reopenedStudentIds`, a cutoff in
  // the older `dueAt` — costs no write.
  const currentControls = controlsOf(legacyStudentOverride(assignment, id));
  // The final cutoff and its stub travel together, as the callable always wrote them.
  if (target.lateDueAt !== null && currentControls.lateDueAt !== target.lateDueAt) {
    writes.push({ op: 'set', path: ['studentOverrides', id, 'lateDueAt'], value: target.lateDueAt });
  }
  if (target.extension !== null && stableStringify(currentControls.extension) !== stableStringify(target.extension)) {
    writes.push({ op: 'set', path: ['studentOverrides', id, 'extension'], value: target.extension });
  }
  ['excused', 'reopened'].forEach((flag) => {
    const listed = flag === 'excused' ? excusedListed : reopenedListed;
    if (target[flag]) {
      if (!currentControls[flag]) writes.push({ op: 'set', path: ['studentOverrides', id, flag], value: true });
    } else if (currentControls[flag]) {
      if (entry && flag in entry) writes.push({ op: 'delete', path: ['studentOverrides', id, flag] });
      if (listed) writes.push({ op: 'arrayRemove', path: [`${flag}StudentIds`], value: id });
    }
  });
  const currentGrant = grants && id in grants ? grantCount(grants[id]) : null;
  if (target.dolExtraAttempts > 0 && currentGrant !== target.dolExtraAttempts) {
    const grant = override?.dolAttemptGrant
      ? { ...dolAttemptGrant(override.dolAttemptGrant), extraAttempts: target.dolExtraAttempts }
      : { extraAttempts: target.dolExtraAttempts, changedAt: null, changedBy: null, reason: null };
    writes.push({ op: 'set', path: ['dol', 'attemptGrantsByStudentId', id], value: grant });
  } else if (target.dolExtraAttempts === 0 && currentGrant !== null) {
    writes.push({ op: 'delete', path: ['dol', 'attemptGrantsByStudentId', id] });
  }
  return writes;
};

/* ----------------------------------------------------- a teacher's change */

const iso = (ms) => new Date(ms).toISOString();

const applyChange = ({ base, change, actorUid, nowMs }) => {
  const next = { ...controlsAndGrant(base || {}) };
  switch (change?.kind) {
    case OVERRIDE_CHANGE.ATTENDANCE_EXTENSION: {
      next.lateDueAt = deadlineValue(change.lateDueAt);
      next.extension = extensionStub({ dateKey: change.dateKey, grantedAt: change.grantedAtMs ?? nowMs });
      return next;
    }
    case OVERRIDE_CHANGE.DOL_ATTEMPTS: {
      const step = Math.max(1, Math.min(MAX_TEACHER_GRANTED_ATTEMPTS, Math.floor(Number(change.increment) || 1)));
      const extraAttempts = Math.min(MAX_TEACHER_GRANTED_ATTEMPTS, grantCount(next.dolExtraAttempts) + step);
      next.dolExtraAttempts = extraAttempts;
      next.dolAttemptGrant = {
        extraAttempts,
        changedAt: iso(nowMs),
        // Never an email: the shared copy of a grant is readable by the class.
        changedBy: clean(actorUid) || 'teacher',
        reason: clean(change.reason) || 'teacher-dol-recovery',
      };
      return next;
    }
    case OVERRIDE_CHANGE.EXCUSED:
      next.excused = change.value === true;
      return next;
    case OVERRIDE_CHANGE.REOPENED:
      next.reopened = change.value === true;
      return next;
    default:
      throw new Error(`Unknown override change: ${change?.kind}`);
  }
};

/**
 * Plan ONE change to one student's controls, from authoritative state the
 * caller read in its transaction. The base is the RESOLVED override — private
 * merged with shared — so a write can never drop a grant that so far existed
 * only on the shared copy.
 */
export const planStudentOverrideChange = ({
  assignmentId,
  assignment,
  studentId,
  existingPrivate = null,
  change,
  authorization,
  actor = {},
  nowMs,
  storageMode,
} = {}) => {
  const before = resolveStudentOverride({ assignment, studentId, privateOverride: existingPrivate ?? null });
  const after = applyChange({ base: before, change, actorUid: actor.uid, nowMs });
  const revision = Math.max(0, Math.floor(Number(existingPrivate?.revision) || 0)) + 1;
  const record = buildStudentOverrideRecord({
    studentId, assignmentId, override: after, authorization, revision,
    source: `change:${change.kind}`,
    updatedBy: actor.uid || actor.role || 'teacher',
  });
  return {
    before,
    after,
    changed: !sameStudentControls(before, after) || !existingPrivate,
    revision,
    record,
    sharedWrites: planSharedCopyWrites({ assignment, studentId, override: after, storageMode }),
    eventId: overrideEventId(assignmentId, revision),
    event: buildOverrideEvent({
      kind: change.kind,
      studentId,
      assignmentId,
      authorization,
      before,
      after,
      revision,
      actorEmail: actor.email,
      actorUid: actor.uid,
      actorRole: actor.role || 'teacher',
      source: 'callable',
      reason: change.reason || null,
    }),
  };
};

/* ------------------------------------- absorbing the shared copy (migration) */

/** The verbatim shared-document data about one student, for the history. */
export const legacySnapshotFor = (assignment, studentId) => {
  const id = clean(studentId);
  const entry = legacyEntryOf(assignment, id);
  const grants = assignment?.dol?.attemptGrantsByStudentId;
  return {
    studentOverridesEntry: entry ? { ...entry } : null,
    attemptGrant: isObject(grants) && id in grants ? grants[id] : null,
    excusedListed: list(assignment?.excusedStudentIds).map(clean).includes(id),
    reopenedListed: list(assignment?.reopenedStudentIds).map(clean).includes(id),
  };
};

/**
 * Bring one student's private record up to what the shared document says.
 *
 * `existingPrivate` null → the record is created from the shared copy.
 * A record whose controls already equal the merge → nothing to do.
 * Otherwise → the merge is written (a write an older client made to the
 * shared copy, absorbed).
 *
 * Also returns the student's share of every students-scope DOL recovery audit
 * entry, to be kept in their history under a deterministic id.
 */
export const planStudentAbsorption = ({
  assignmentId,
  assignment,
  studentId,
  existingPrivate = null,
  authorization,
  migrationRunId = null,
  source = 'migration',
} = {}) => {
  const id = clean(studentId);
  const legacy = legacyStudentOverride(assignment, id);
  const auditEntries = list(assignment?.dol?.recoveryAudit).filter((entry) => auditEntryStudentIds(entry).includes(id));
  const auditCopies = auditEntries.map((entry) => ({
    eventId: legacyAuditEventId(assignmentId, entry),
    event: buildOverrideEvent({
      kind: OVERRIDE_EVENT_KIND.LEGACY_AUDIT,
      studentId: id,
      assignmentId,
      authorization,
      revision: 0,
      source,
      legacy: { recoveryAuditEntry: studentAuditEntryFor(entry, id) },
      migrationRunId,
    }),
  }));
  if (!legacy) return { studentId: id, action: 'none', auditCopies, legacy: null };

  const existing = existingPrivate ? normalizeStudentOverrideRecord(existingPrivate) : null;
  const merged = resolveStudentOverride({ assignment, studentId: id, privateOverride: existingPrivate ?? null });
  if (existing && sameStudentControls(existing, merged)) {
    return { studentId: id, action: 'unchanged', auditCopies, legacy, merged };
  }
  // A shared entry that says nothing (an empty object left by an old writer)
  // creates no record.
  if (!existing && studentControlsAreEmpty(merged)) {
    return { studentId: id, action: 'none', auditCopies, legacy, merged };
  }
  const revision = Math.max(0, Math.floor(Number(existingPrivate?.revision) || 0)) + 1;
  const kind = existing ? OVERRIDE_EVENT_KIND.LEGACY_ABSORBED : OVERRIDE_EVENT_KIND.MIGRATED;
  return {
    studentId: id,
    action: existing ? 'update' : 'create',
    auditCopies,
    legacy,
    merged,
    revision,
    record: buildStudentOverrideRecord({
      studentId: id, assignmentId, override: merged, authorization, revision, source, updatedBy: source,
    }),
    eventId: overrideEventId(assignmentId, revision),
    event: buildOverrideEvent({
      kind,
      studentId: id,
      assignmentId,
      authorization,
      before: existing,
      after: merged,
      revision,
      source,
      legacy: legacySnapshotFor(assignment, id),
      migrationRunId,
    }),
  };
};

/**
 * The verbatim copy of everything per-student a strip removes from one
 * shared assignment. Kept before the shared document changes; never edited.
 * `studentIds` lets a permanent deletion find and scrub a student's part.
 */
export const buildAssignmentOverrideArchive = ({ assignmentId, assignment, migrationRunId = null, reason = 'strip' } = {}) => {
  const removedAudit = list(assignment?.dol?.recoveryAudit).filter(isStudentScopedAuditEntry);
  const content = {
    studentOverrides: isObject(assignment?.studentOverrides) ? assignment.studentOverrides : null,
    attemptGrantsByStudentId: isObject(assignment?.dol?.attemptGrantsByStudentId) ? assignment.dol.attemptGrantsByStudentId : null,
    excusedStudentIds: Array.isArray(assignment?.excusedStudentIds) ? assignment.excusedStudentIds : null,
    reopenedStudentIds: Array.isArray(assignment?.reopenedStudentIds) ? assignment.reopenedStudentIds : null,
    recoveryAuditStudentEntries: removedAudit.length ? removedAudit : null,
  };
  const digest = stableDigest(content);
  return {
    archiveId: `${clean(assignmentId)}__${digest}`,
    archive: {
      schemaVersion: STUDENT_ASSIGNMENT_OVERRIDE_SCHEMA_VERSION,
      assignmentId: clean(assignmentId),
      studentIds: legacyStudentIds(assignment),
      digest,
      reason: clean(reason) || 'strip',
      migrationRunId: migrationRunId ? clean(migrationRunId) : null,
      content,
    },
  };
};

/**
 * An archive with one (permanently deleted) student's part removed: their
 * entries are dropped and any id of theirs inside a recovery audit entry is
 * replaced by the deletion receipt, exactly as the deletion treats the live
 * audit (assignmentPrivacy.mjs). Everyone else's part is untouched.
 */
export const scrubStudentFromArchive = (archive, studentId, replacement) => {
  const id = clean(studentId);
  if (!isObject(archive) || !id) return archive;
  const content = isObject(archive.content) ? { ...archive.content } : {};
  const withoutKey = (map) => {
    if (!isObject(map) || !(id in map)) return map ?? null;
    const { [id]: _removed, ...rest } = map;
    return rest;
  };
  content.studentOverrides = withoutKey(content.studentOverrides);
  content.attemptGrantsByStudentId = withoutKey(content.attemptGrantsByStudentId);
  ['excusedStudentIds', 'reopenedStudentIds'].forEach((field) => {
    if (Array.isArray(content[field])) content[field] = content[field].filter((entry) => clean(entry) !== id);
  });
  if (Array.isArray(content.recoveryAuditStudentEntries)) {
    const swap = (value) => (clean(value) === id ? replacement : value);
    content.recoveryAuditStudentEntries = content.recoveryAuditStudentEntries.map((entry) => {
      if (!isObject(entry)) return entry;
      const out = { ...entry };
      if (typeof out.id === 'string') out.id = out.id.split(':').map((part) => part.split('+').map(swap).join('+')).join(':');
      if (isObject(out.scope) && Array.isArray(out.scope.studentIds)) out.scope = { ...out.scope, studentIds: out.scope.studentIds.map(swap) };
      ['previous', 'next'].forEach((side) => {
        if (isObject(out[side]) && isObject(out[side].extraAttemptsByStudent) && id in out[side].extraAttemptsByStudent) {
          const { [id]: value, ...rest } = out[side].extraAttemptsByStudent;
          out[side] = { ...out[side], extraAttemptsByStudent: { ...rest, [replacement]: value } };
        }
      });
      return out;
    });
  }
  return {
    ...archive,
    content,
    studentIds: list(archive.studentIds).filter((entry) => clean(entry) !== id),
    scrubbedFor: [...list(archive.scrubbedFor), replacement],
  };
};

/**
 * Remove every per-student field from a shared assignment, keeping the
 * class-wide ones: the class DOL grant, windows, recovery, the class-scoped
 * recovery audit entries. Returns [{ op, path, value }] (empty when clean).
 */
export const planSharedAssignmentStrip = (assignment) => {
  if (!isObject(assignment)) return [];
  const writes = [];
  if (assignment.studentOverrides !== undefined) writes.push({ op: 'delete', path: ['studentOverrides'] });
  if (assignment.excusedStudentIds !== undefined) writes.push({ op: 'delete', path: ['excusedStudentIds'] });
  if (assignment.reopenedStudentIds !== undefined) writes.push({ op: 'delete', path: ['reopenedStudentIds'] });
  if (isObject(assignment.dol) && assignment.dol.attemptGrantsByStudentId !== undefined) {
    writes.push({ op: 'delete', path: ['dol', 'attemptGrantsByStudentId'] });
  }
  const audit = list(assignment.dol?.recoveryAudit);
  if (audit.some(isStudentScopedAuditEntry)) {
    writes.push({ op: 'set', path: ['dol', 'recoveryAudit'], value: audit.filter((entry) => !isStudentScopedAuditEntry(entry)) });
  }
  return writes;
};

/** True when a shared assignment carries no per-student data. */
export const sharedAssignmentIsClean = (assignment) => planSharedAssignmentStrip(assignment).length === 0;

/**
 * Is every student the shared document names already represented, exactly,
 * in private storage? The strip proceeds only when this holds, inside the
 * same transaction, so nothing leaves the shared copy before its private
 * record says the same thing.
 */
export const sharedAssignmentFullyAbsorbed = ({ assignment, privateById = {} } = {}) => {
  const pending = legacyStudentIds(assignment).filter((id) => {
    const legacy = legacyStudentOverride(assignment, id);
    if (!legacy) return false; // audit-only students: kept by the archive and their history copy
    const existing = privateById[id] ? normalizeStudentOverrideRecord(privateById[id]) : null;
    if (!existing) return !studentControlsAreEmpty(legacy);
    return !sameStudentControls(existing, mergeStudentOverride({ privateOverride: privateById[id], legacyOverride: legacy }));
  });
  return { absorbed: pending.length === 0, pending };
};

/**
 * Did a write change the per-student data on a shared assignment? The
 * absorber trigger runs only when it did.
 */
export const perStudentSharedDataChanged = (before, after) => {
  const project = (doc) => ({
    studentOverrides: isObject(doc?.studentOverrides) ? doc.studentOverrides : null,
    attemptGrantsByStudentId: isObject(doc?.dol?.attemptGrantsByStudentId) ? doc.dol.attemptGrantsByStudentId : null,
    excusedStudentIds: Array.isArray(doc?.excusedStudentIds) ? doc.excusedStudentIds : null,
    reopenedStudentIds: Array.isArray(doc?.reopenedStudentIds) ? doc.reopenedStudentIds : null,
    audit: list(doc?.dol?.recoveryAudit).filter(isStudentScopedAuditEntry),
  });
  return stableStringify(project(before)) !== stableStringify(project(after));
};

/**
 * One migration pass that took several pages (each callable call is one
 * bounded page; the admin screen calls again with `nextCursor` until `done`)
 * as one report: the counts add up, the failures collect, and the cursor and
 * `done` are the last page's.
 */
export const combineOverrideMigrationReports = (reports = []) => {
  const pages = list(reports).filter(isObject);
  if (!pages.length) return null;
  const first = pages[0];
  const last = pages[pages.length - 1];
  const combined = {
    mode: first.mode ?? null,
    dryRun: first.dryRun !== false,
    startAfter: first.startAfter ?? null,
    nextCursor: last.nextCursor ?? null,
    done: last.done === true,
    sharedRetired: last.sharedRetired === true,
    pages: pages.length,
    failures: pages.flatMap((page) => list(page.failures)),
  };
  const fixed = new Set(Object.keys(combined));
  pages.forEach((page) => Object.entries(page).forEach(([key, value]) => {
    if (fixed.has(key) || typeof value !== 'number' || !Number.isFinite(value)) return;
    combined[key] = (combined[key] || 0) + value;
  }));
  return combined;
};

export default resolveStudentOverride;
