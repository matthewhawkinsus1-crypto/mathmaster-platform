/*
 * WHAT ONE STUDENT'S RECORD MAY PUT ON A DOCUMENT EVERY STUDENT CAN READ.
 *
 * `assignments/{id}` is read by every signed-in user — every student's device
 * receives it — because it carries the assignment itself. Anything about ONE
 * student written onto it is therefore published to the whole school. Until
 * now an attendance extension stored, on that shared document, the student's
 * absence dates (`sourceAbsenceDates`), the granting teacher's email and the
 * meeting counts; a copy of an assignment (Duplicate, a content release)
 * carried every student's overrides and every class's DOL/Warm-Up runtime
 * state into the copy; and permanently deleting a student left their
 * overrides behind (platform engineering deep dive 2026-10-01, F-PRIV-1).
 *
 * The rule this file encodes:
 *
 *   - The shared document keeps only what a deadline reader needs: a
 *     student's `lateDueAt`, and an extension STUB with the cutoff's date key
 *     and grant time. Nothing in the stub says why.
 *   - Why (absences, meetings, who granted it) is kept privately, one
 *     immutable record per grant, under the student:
 *     grades/{studentId}/attendanceExtensionGrants/{grantId} — readable by the
 *     student's teacher of record and the granting teacher, never by students,
 *     written only by the Admin SDK. Each grant is kept, so the history no
 *     longer disappears when a later grant replaces the stub.
 *   - A copy of an assignment carries no instance state at all.
 *
 * Pure and shared: the callable, the migration, the Duplicate action, the
 * content release and the tests all read this one definition.
 */

export const ATTENDANCE_EXTENSION_GRANTS_COLLECTION = 'attendanceExtensionGrants';
export const ATTENDANCE_EXTENSION_GRANT_SCHEMA_VERSION = 1;

/** The only extension keys allowed on the shared assignment document. */
export const SHARED_EXTENSION_KEYS = Object.freeze(['dateKey', 'grantedAt']);

/*
 * The transition switch for class-scoped assignment reads. Old student tabs
 * list the whole collection; the rule that refuses such a list may only take
 * effect once they have reloaded, so it is read from this document rather
 * than shipped switched on (see firestore.rules, `assignments`).
 */
export const PLATFORM_FLAGS_COLLECTION = 'platformFlags';
export const ASSIGNMENT_READ_SCOPE_FLAG = 'assignmentReadScope';
export const STUDENT_LIST_SCOPED_FIELD = 'studentListScoped';

const MAX_DATE_KEYS = 120;
const MAX_MEETINGS = 180;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const cleanEmail = (value) => String(value ?? '').trim().toLowerCase();
const dateKeyOrNull = (value) => (typeof value === 'string' && DATE_KEY.test(value.trim()) ? value.trim() : null);
const dateKeyList = (value) => (Array.isArray(value)
  ? [...new Set(value.map(dateKeyOrNull).filter(Boolean))].sort().slice(0, MAX_DATE_KEYS)
  : []);
const countOrNull = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= MAX_MEETINGS ? number : null;
};
const millisOrNull = (value) => {
  if (value == null || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const number = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/**
 * The extension details a teacher's browser computed, reduced to known keys
 * and types. The callable used to store whatever object arrived; this is the
 * allow-list, and anything else is dropped rather than published.
 */
export const sanitizeExtensionDetails = (raw = {}) => {
  const source = isObject(raw) ? raw : {};
  return {
    dateKey: dateKeyOrNull(source.dateKey),
    meetingsGranted: countOrNull(source.meetingsGranted),
    meetingsRequested: countOrNull(source.meetingsRequested),
    undetermined: dateKeyList(source.undetermined),
    // `resolved` is a boolean on a grant; the zero-meeting proposal sends [].
    resolved: source.resolved === true,
    sourceAbsenceDates: dateKeyList(source.sourceAbsenceDates),
  };
};

/** The extension object written onto the shared assignment document. */
export const sharedExtensionStub = ({ dateKey = null, grantedAt = null } = {}) => ({
  dateKey: dateKeyOrNull(dateKey),
  grantedAt: millisOrNull(grantedAt),
});

/** True when a stored extension carries anything beyond the stub. */
export const extensionNeedsMinimizing = (extension) => isObject(extension)
  && Object.keys(extension).some((key) => !SHARED_EXTENSION_KEYS.includes(key));

const authorizedEmails = (...emails) => [...new Set(emails.map(cleanEmail).filter((email) => email.includes('@')))];

/**
 * One grant, as it is kept privately under the student. Immutable: a later
 * grant is a new record, so the history of a student's extensions survives.
 */
export const buildExtensionGrantRecord = ({
  studentId,
  classId = null,
  assignmentId,
  details = {},
  lateDueAt = null,
  previousCutoffMs = null,
  grantedByEmail = null,
  teacherOfRecordEmail = null,
  grantedAtMs = null,
  shortenedAfterReview = false,
  source = 'applyStudentAttendanceExtension',
} = {}) => {
  const clean = sanitizeExtensionDetails(details);
  return {
    schemaVersion: ATTENDANCE_EXTENSION_GRANT_SCHEMA_VERSION,
    studentId: String(studentId || ''),
    classId: classId ? String(classId) : null,
    assignmentId: String(assignmentId || ''),
    lateDueAt: lateDueAt ? String(lateDueAt) : null,
    previousCutoffMs: millisOrNull(previousCutoffMs),
    ...clean,
    shortenedAfterReview: shortenedAfterReview === true,
    grantedByEmail: cleanEmail(grantedByEmail) || null,
    grantedAtMs: millisOrNull(grantedAtMs),
    source: String(source || 'applyStudentAttendanceExtension'),
    authorizedTeacherEmails: authorizedEmails(grantedByEmail, teacherOfRecordEmail),
  };
};

/** Deterministic id for a grant recovered from an assignment document, so a re-run never duplicates it. */
export const legacyExtensionGrantId = (assignmentId) => `legacy__${String(assignmentId || '').replace(/\//g, '_')}`;

/*
 * WHAT A COPY OF AN ASSIGNMENT MUST NOT CARRY.
 *
 * Duplicate and the content-release callable both start from the stored
 * document. Per-student state (overrides, the excused/reopened lists,
 * unique-question seats) and every class's DOL/Warm-Up runtime state
 * (closures, early unlocks, moved dates, attempt grants, the recovery audit,
 * section-access overrides) belong to that one assigned instance. Carried
 * into a copy they publish students' records again, and the copy, once
 * assigned to the same class, would open closed or on the wrong day.
 * Authored configuration (minutes, instruction dates per period, Live
 * Challenge settings, section-access defaults) is kept.
 *
 * A student's controls now live in their own private record keyed by the
 * ASSIGNMENT id (studentAssignmentOverrides.mjs), so a copy — a new id — can
 * never inherit one; these fields cover the shared copy still on older
 * documents.
 */
export const PER_STUDENT_ASSIGNMENT_FIELDS = Object.freeze([
  'studentOverrides', 'excusedStudentIds', 'reopenedStudentIds', 'generationSeats',
]);

export const SECTION_RUNTIME_STATE_FIELDS = Object.freeze({
  dol: Object.freeze([
    'attemptGrantsByStudentId', 'attemptGrantsByClassId', 'recoveryAudit', 'recoveryByClassId',
    'earlyUnlocksByClassId', 'earlyUnlocks', 'closedByClassId', 'closedByClassPeriod',
    'instructionDatesByClassId', 'scheduledInstructionDatesByClassId',
  ]),
  warmup: Object.freeze([
    'closedByClassId', 'closedByClassPeriod', 'autoCloseByClassId',
    'instructionDatesByClassId', 'scheduledInstructionDatesByClassId',
  ]),
});

const SECTION_ACCESS_OVERRIDE_FIELDS = Object.freeze(['overridesByClassId', 'overridesByClassPeriod']);

/**
 * The same assignment with no instance state. Values are not cloned, so a
 * Firestore Timestamp in authored content survives untouched.
 */
export const stripAssignmentInstanceState = (assignment) => {
  if (!isObject(assignment)) return assignment;
  const next = { ...assignment };
  PER_STUDENT_ASSIGNMENT_FIELDS.forEach((field) => { delete next[field]; });
  Object.entries(SECTION_RUNTIME_STATE_FIELDS).forEach(([section, fields]) => {
    if (!isObject(next[section])) return;
    const kept = { ...next[section] };
    fields.forEach((field) => { delete kept[field]; });
    next[section] = kept;
  });
  if (isObject(next.sectionAccess)) {
    const access = { ...next.sectionAccess };
    Object.entries(access).forEach(([section, value]) => {
      if (!isObject(value)) return;
      const kept = { ...value };
      SECTION_ACCESS_OVERRIDE_FIELDS.forEach((field) => { if (field in kept) kept[field] = {}; });
      access[section] = kept;
    });
    next.sectionAccess = access;
  }
  return next;
};

/** Every instance-state path still present on an assignment (empty means clean). */
export const assignmentInstanceStatePaths = (assignment) => {
  if (!isObject(assignment)) return [];
  const paths = PER_STUDENT_ASSIGNMENT_FIELDS.filter((field) => assignment[field] !== undefined);
  Object.entries(SECTION_RUNTIME_STATE_FIELDS).forEach(([section, fields]) => {
    fields.forEach((field) => {
      if (isObject(assignment[section]) && assignment[section][field] !== undefined) paths.push(`${section}.${field}`);
    });
  });
  if (isObject(assignment.sectionAccess)) {
    Object.entries(assignment.sectionAccess).forEach(([section, value]) => {
      SECTION_ACCESS_OVERRIDE_FIELDS.forEach((field) => {
        if (isObject(value?.[field]) && Object.keys(value[field]).length) paths.push(`sectionAccess.${section}.${field}`);
      });
    });
  }
  return paths;
};

/*
 * THE ONE-TIME CLEAN-UP OF EXTENSIONS ALREADY ON FILE.
 *
 * For every student whose stored extension carries more than the stub, the
 * whole stored extension (every key, verbatim, plus the student's lateDueAt)
 * becomes a private grant record FIRST, then the shared copy is reduced to the
 * stub. Nothing is discarded: every key that leaves the shared document is in
 * the private record. A student whose extension is already a stub is left
 * alone, so a second run plans nothing.
 */
export const planAssignmentPrivacyMigration = ({ assignmentId, assignment, studentsById = {}, existingGrantIds = new Set() } = {}) => {
  const overrides = isObject(assignment?.studentOverrides) ? assignment.studentOverrides : {};
  const minimize = [];
  let alreadyMinimal = 0;
  Object.entries(overrides).forEach(([studentId, entry]) => {
    const extension = isObject(entry) ? entry.extension : null;
    if (!isObject(extension)) return;
    if (!extensionNeedsMinimizing(extension)) { alreadyMinimal += 1; return; }
    const student = studentsById[studentId] || {};
    const grantId = legacyExtensionGrantId(assignmentId);
    const grantedAtMs = millisOrNull(extension.grantedAt);
    const record = {
      ...buildExtensionGrantRecord({
        studentId,
        classId: student.classId || null,
        assignmentId,
        details: extension,
        lateDueAt: entry.lateDueAt || entry.dueAt || null,
        grantedByEmail: extension.grantedByEmail || null,
        teacherOfRecordEmail: student.assignedTeacherEmail || null,
        grantedAtMs,
        source: 'migrated-from-assignment',
      }),
      // Verbatim, so nothing that leaves the shared document is lost — even a
      // key this version does not know about.
      legacyExtension: { ...extension },
    };
    minimize.push({
      studentId,
      grantId,
      createGrant: !existingGrantIds.has(`${studentId}/${grantId}`),
      grantRecord: record,
      stub: sharedExtensionStub({ dateKey: extension.dateKey, grantedAt: extension.grantedAt }),
    });
  });
  return { assignmentId, minimize, alreadyMinimal };
};

/*
 * WHAT PERMANENTLY DELETING A STUDENT MUST ALSO REMOVE FROM SHARED DOCUMENTS.
 *
 * The deletion callable erased grades/{id} and every per-student collection,
 * but an assignment kept `studentOverrides[id]` (an extension's absence dates
 * and dates), the DOL attempt grant for them, and their id in the DOL recovery
 * audit. The audit entry is kept — it records a teacher action — with the id
 * replaced by the deletion receipt, the same way the admin audit records a
 * deleted student.
 */
export const planStudentRemovalFromAssignment = ({ assignment, studentId, receipt }) => {
  const id = String(studentId || '');
  if (!id || !isObject(assignment)) return { deletePaths: [], recoveryAudit: null, arrayRemovals: [] };
  const deletePaths = [];
  if (isObject(assignment.studentOverrides) && id in assignment.studentOverrides) deletePaths.push(['studentOverrides', id]);
  if (isObject(assignment.dol?.attemptGrantsByStudentId) && id in assignment.dol.attemptGrantsByStudentId) {
    deletePaths.push(['dol', 'attemptGrantsByStudentId', id]);
  }
  // The array forms of excused/reopened name the student too.
  const arrayRemovals = ['excusedStudentIds', 'reopenedStudentIds']
    .filter((field) => Array.isArray(assignment[field]) && assignment[field].map((entry) => String(entry ?? '').trim()).includes(id));
  let recoveryAudit = null;
  const audit = Array.isArray(assignment.dol?.recoveryAudit) ? assignment.dol.recoveryAudit : null;
  if (audit) {
    const replacement = `deleted-student:${receipt}`;
    let changed = false;
    const swapIds = (ids) => (Array.isArray(ids) ? ids.map((entry) => {
      if (String(entry) !== id) return entry;
      changed = true;
      return replacement;
    }) : ids);
    const swapKeys = (map) => {
      if (!isObject(map) || !(id in map)) return map;
      changed = true;
      const { [id]: value, ...rest } = map;
      return { ...rest, [replacement]: value };
    };
    // Only keys that are present are rewritten: Firestore refuses `undefined`.
    const next = audit.map((entry) => {
      if (!isObject(entry)) return entry;
      const out = { ...entry };
      // A students-scope entry's id was built from the ids it named
      // (`grantAttempts:students:<id>+<id>:<time>`), so the id is scrubbed too.
      if (typeof out.id === 'string' && out.id.split(/[:+]/).includes(id)) {
        changed = true;
        out.id = out.id.split(':').map((part) => part.split('+').map((piece) => (piece === id ? replacement : piece)).join('+')).join(':');
      }
      if (isObject(out.scope) && Array.isArray(out.scope.studentIds)) {
        out.scope = { ...out.scope, studentIds: swapIds(out.scope.studentIds) };
      }
      ['previous', 'next'].forEach((side) => {
        if (isObject(out[side]) && isObject(out[side].extraAttemptsByStudent)) {
          out[side] = { ...out[side], extraAttemptsByStudent: swapKeys(out[side].extraAttemptsByStudent) };
        }
      });
      return out;
    });
    if (changed) recoveryAudit = next;
  }
  return { deletePaths, recoveryAudit, arrayRemovals };
};
