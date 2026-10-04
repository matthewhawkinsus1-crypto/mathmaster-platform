import { stableStringify } from '../../../functions/shared/studentAssignmentOverrides.mjs';

/*
 * A TEACHER'S DOL ACTIONS FROM THE BROWSER — WHAT IT MAY WRITE, AND WHAT IT
 * ASKS THE SERVER TO DO INSTEAD.
 *
 * ONE MORE ATTEMPT FOR SELECTED STUDENTS is a student's own control. It lives
 * in the student's private record (studentAssignmentOverrides) and changes
 * only through the `setStudentAssignmentControls` callable, which, in one
 * transaction per call, checks the caller teaches the class and every named
 * student is in it, increments from the AUTHORITATIVE count (private merged
 * with any shared copy — never this tab's), caps it, writes the staff-only
 * history entry, and keeps the shared copy as the storage stage requires
 * (functions/shared/studentAssignmentOverrideStore.mjs). So a stale tab adds
 * to what the server holds, two teachers granting at once both land, and the
 * browser never authors `dol.attemptGrantsByStudentId`.
 *
 * The callable takes one class and at most MAX_STUDENTS_PER_CONTROLS_CALL
 * students per call (all-or-nothing). planStudentControlsCalls groups the
 * chosen students by their OWN class and splits larger groups.
 *
 * EVERY CLASS-LEVEL DOL ACTION (open, close, +time, move day, back to
 * schedule, the class +1 attempt, the setup and date editors) still writes the
 * class's controls on the lesson — but only the `dol` fields it changed, as
 * dotted paths (classDolFieldPatch). Writing the whole `dol` map back from the
 * tab's copy used to carry `attemptGrantsByStudentId` with it: a stale tab
 * could republish an older grant (and, once the shared copy is retired, every
 * classmate's). A class action can now never touch a student's grant.
 */

/** Mirrors MAX_STUDENTS_PER_CHANGE in functions/shared/studentAssignmentOverrideStore.mjs. */
export const MAX_STUDENTS_PER_CONTROLS_CALL = 60;

export const STUDENT_DOL_GRANT_FIELD = 'attemptGrantsByStudentId';

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * The callable requests for one change to `students` on one assignment: one
 * per class, at most MAX_STUDENTS_PER_CONTROLS_CALL students each, in a stable
 * order. A student with no class of their own is attributed to
 * `fallbackClassId` (the class the teacher is working in) — the server still
 * refuses them unless they belong to it. With neither, they are `unplaced`.
 */
export const planStudentControlsCalls = ({
  assignmentId,
  students = [],
  fallbackClassId = null,
  change,
  maxPerCall = MAX_STUDENTS_PER_CONTROLS_CALL,
} = {}) => {
  const aid = clean(assignmentId);
  const byClass = new Map();
  const unplaced = [];
  const seen = new Set();
  (Array.isArray(students) ? students : []).forEach((student) => {
    const studentId = clean(typeof student === 'string' ? student : student?.id);
    if (!studentId || seen.has(studentId)) return;
    seen.add(studentId);
    const classId = clean(typeof student === 'object' ? student?.classId : '') || clean(fallbackClassId);
    if (!classId) {
      unplaced.push(studentId);
      return;
    }
    if (!byClass.has(classId)) byClass.set(classId, []);
    byClass.get(classId).push(studentId);
  });
  const size = Math.max(1, Math.min(MAX_STUDENTS_PER_CONTROLS_CALL, Math.floor(Number(maxPerCall) || MAX_STUDENTS_PER_CONTROLS_CALL)));
  const calls = [];
  [...byClass.keys()].sort().forEach((classId) => {
    const ids = byClass.get(classId);
    for (let start = 0; start < ids.length; start += size) {
      calls.push({ assignmentId: aid, classId, studentIds: ids.slice(start, start + size), change: { ...change } });
    }
  });
  return { calls, unplaced };
};

/** The DOL +N request for selected students. */
export const planStudentDolGrant = ({ assignmentId, students, fallbackClassId = null, increment = 1, reason = 'teacher-dol-recovery' } = {}) => planStudentControlsCalls({
  assignmentId,
  students,
  fallbackClassId,
  change: { kind: 'dolAttempts', increment: Math.max(1, Math.floor(Number(increment) || 1)), reason },
});

/**
 * Send the planned calls, one after another (each is its own transaction on
 * the server, all-or-nothing for its students). Returns what each student now
 * has, and which groups the server refused and why — a refusal for one class
 * never hides what was granted in another.
 */
export const runStudentControlsCalls = async ({ call, calls = [] } = {}) => {
  if (typeof call !== 'function') throw new Error('A callable is required.');
  const students = [];
  const failures = [];
  for (const request of calls) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await call(request);
      (Array.isArray(result?.students) ? result.students : []).forEach((row) => students.push({ ...row, classId: request.classId }));
    } catch (error) {
      failures.push({
        classId: request.classId,
        studentIds: [...request.studentIds],
        code: clean(error?.code).replace(/^functions\//, '') || 'unknown',
        message: clean(error?.message) || 'The server refused the change.',
      });
    }
  }
  return { students, failures };
};

/** A stable key for "this change to these students on this assignment". */
export const controlsRequestKey = ({ assignmentId, studentIds = [], kind = '' } = {}) => (
  `${clean(assignmentId)}:${clean(kind)}:${[...new Set((studentIds || []).map(clean).filter(Boolean))].sort().join('+')}`
);

/**
 * At most one request per key in flight. A second click (a double-click, a
 * tap that registered twice, a re-render that fired the handler again) while
 * the first is still on its way returns the SAME promise instead of granting
 * a second attempt. Once it settles, a new click is a new grant.
 */
export const createControlsRequestGate = () => {
  const inFlight = new Map();
  return {
    run: (key, start) => {
      if (inFlight.has(key)) return { duplicate: true, promise: inFlight.get(key) };
      const promise = Promise.resolve().then(start).finally(() => { inFlight.delete(key); });
      inFlight.set(key, promise);
      return { duplicate: false, promise };
    },
    pending: (key) => inFlight.has(key),
    size: () => inFlight.size,
  };
};

const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * A class-level DOL action as the dotted `dol.<field>` updates it made —
 * nothing it did not change, and never a student's grant.
 *
 * `deleteValue` is Firestore's deleteField() (passed in so this stays pure).
 * Throws if the action changed `attemptGrantsByStudentId`: a student's grant
 * moves only through setStudentAssignmentControls.
 */
export const classDolFieldPatch = (previousDol = {}, nextDol = {}, { deleteValue } = {}) => {
  const before = isObject(previousDol) ? previousDol : {};
  const after = isObject(nextDol) ? nextDol : {};
  if (stableStringify(before[STUDENT_DOL_GRANT_FIELD] ?? null) !== stableStringify(after[STUDENT_DOL_GRANT_FIELD] ?? null)) {
    throw new Error('A student’s DOL attempts change only through setStudentAssignmentControls, never in a class DOL write.');
  }
  const patch = {};
  new Set([...Object.keys(before), ...Object.keys(after)]).forEach((field) => {
    if (field === STUDENT_DOL_GRANT_FIELD) return;
    if (!FIELD_NAME.test(field)) throw new Error(`Unexpected DOL field name: ${field}`);
    if (!(field in after) || after[field] === undefined) {
      if (field in before && before[field] !== undefined) {
        if (deleteValue === undefined) throw new Error('classDolFieldPatch needs deleteValue to remove a field.');
        patch[`dol.${field}`] = deleteValue;
      }
      return;
    }
    if (stableStringify(before[field] ?? null) !== stableStringify(after[field])) patch[`dol.${field}`] = after[field];
  });
  return patch;
};
