// INDIVIDUALIZED DEADLINES FROM A SUPPORT PROFILE — derived, never stored.
//
// An extra-time accommodation has to move a student's real deadline: the one
// the student's dashboard shows, the one ingestion uses to decide whether a
// submission earns credit, the one the checkpoint finalizer closes work at, and
// the one Grade Export waits for before it sends a grade. Those four readers
// already agree on one per-student field shape — `assignment.studentOverrides
// [studentId]` — so this module does not invent a fifth deadline store.
//
// WHY NOT WRITE IT ONTO THE ASSIGNMENT. Every signed-in user can read
// `assignments/*` (firestore.rules). An extended date on another student's
// entry there would tell classmates who has an accommodation. So the date is
// DERIVED where both inputs are already in hand — the assignment, and the
// student's own pinned `grades/{id}.profile` — and injected in memory only
// (`withStudentSupportDates`). Nothing here is ever persisted.
//
// RULES THIS MODULE GUARANTEES
//   * never earlier: the individualized due is later than the class due, and
//     the individualized final cutoff is max(class final, individualized due);
//   * attendance extensions keep their own field (`lateDueAt`) and the
//     resolvers take the max of everything, so neither can shorten the other;
//   * a legacy `extra-time` box with no configured extension changes nothing
//     (it has only ever disabled the idle prompt);
//   * the governing profile is the one in effect on the CLASS DUE DATE, so a
//     later profile change does not rewrite past work.
import { parseInstant, zonedDateKey, zonedInstant } from './instructionalCalendar.mjs';

/** The school's wall clock (same value as sectionDeadline.mjs SCHOOL_TIME_ZONE). */
export const SUPPORT_DEADLINE_TIME_ZONE = 'America/Chicago';

export const DUE_DATE_EXTENSION_MODE = Object.freeze({
  NONE: 'none',
  SCHOOL_DAYS: 'school-days',
  HOURS: 'hours',
});

export const MAX_EXTENSION_SCHOOL_DAYS = 5;
export const MAX_EXTENSION_HOURS = 72;

/** Support ids that carry a due-date extension. */
export const DEADLINE_SUPPORT_IDS = Object.freeze(['extra-time', 'extra-time-written-response']);

/** Activity roles whose deadline is the assignment's own due date. */
const ASSIGNMENT_DATED_ROLES = Object.freeze(['classwork', 'practice', 'quiz', 'test']);

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A clean `{mode, value}`; anything malformed is "no extension". */
export const normalizeDueDateExtension = (raw) => {
  const mode = String(raw?.mode || '').trim().toLowerCase();
  const value = Math.trunc(Number(raw?.value));
  if (mode === DUE_DATE_EXTENSION_MODE.SCHOOL_DAYS && Number.isFinite(value) && value >= 1) {
    return { mode, value: Math.min(MAX_EXTENSION_SCHOOL_DAYS, value) };
  }
  if (mode === DUE_DATE_EXTENSION_MODE.HOURS && Number.isFinite(value) && value >= 1) {
    return { mode, value: Math.min(MAX_EXTENSION_HOURS, value) };
  }
  return { mode: DUE_DATE_EXTENSION_MODE.NONE, value: 0 };
};

export const describeDueDateExtension = (raw) => {
  const extension = normalizeDueDateExtension(raw);
  if (extension.mode === DUE_DATE_EXTENSION_MODE.SCHOOL_DAYS) {
    return extension.value === 1 ? 'until the end of the next school day' : `until the end of ${extension.value} school days later`;
  }
  if (extension.mode === DUE_DATE_EXTENSION_MODE.HOURS) return `${extension.value} hour${extension.value === 1 ? '' : 's'} after the class due time`;
  return 'no due-date change';
};

/** `YYYY-MM-DD` plus N weekdays. Weekends are skipped; holidays are not known here. */
export const addSchoolDays = (dateKey, count) => {
  const match = String(dateKey || '').match(DATE_KEY);
  if (!match) return null;
  let cursor = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  let remaining = Math.max(0, Math.trunc(Number(count) || 0));
  while (remaining > 0) {
    cursor += 86400000;
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  const moved = new Date(cursor);
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, '0')}-${String(moved.getUTCDate()).padStart(2, '0')}`;
};

/** The individualized due instant for a class due instant, or null. */
export const extendDueInstant = ({ classDueAtMs, extension, timeZone = SUPPORT_DEADLINE_TIME_ZONE } = {}) => {
  const due = Number(classDueAtMs);
  if (!Number.isFinite(due)) return null;
  const normalized = normalizeDueDateExtension(extension);
  if (normalized.mode === DUE_DATE_EXTENSION_MODE.HOURS) return due + normalized.value * 3600000;
  if (normalized.mode === DUE_DATE_EXTENSION_MODE.SCHOOL_DAYS) {
    const target = addSchoolDays(zonedDateKey(due, timeZone), normalized.value);
    const match = String(target || '').match(DATE_KEY);
    if (!match) return null;
    return zonedInstant({
      year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
      hour: 23, minute: 59, second: 59, millisecond: 999,
    }, timeZone);
  }
  return null;
};

const windowsOf = (profile) => {
  const windows = profile?.supportPlan?.windows;
  return Array.isArray(windows) ? windows.filter((entry) => entry && typeof entry === 'object') : [];
};

/**
 * The plan window in effect on a school date: the latest effective start on or
 * before it (a null start means "in effect before versioning"), ties going to
 * the higher revision number. Mirrors supportProfileModel.mjs
 * `revisionEffectiveOn`, which cannot be imported here without a cycle.
 */
export const planWindowOn = (profile, dateKey) => {
  let best = null;
  windowsOf(profile).forEach((window) => {
    const start = window.effectiveStart && DATE_KEY.test(window.effectiveStart) ? window.effectiveStart : '';
    if (start && dateKey && start > dateKey) return;
    if (!best) { best = window; return; }
    const bestStart = best.effectiveStart && DATE_KEY.test(best.effectiveStart) ? best.effectiveStart : '';
    if (start > bestStart || (start === bestStart && Number(window.revision) > Number(best.revision))) best = window;
  });
  return best;
};

const questionsOf = (assignment) => {
  if (Array.isArray(assignment?.questions)) return assignment.questions;
  return [];
};

/*
 * Written-response items: the student composes text rather than selecting or
 * computing. Detected from the item's declared response mode first, then from
 * the question types MathMaster uses for written explanations.
 */
const WRITTEN_RESPONSE_TYPES = new Set([
  'openresponse', 'writtenresponse', 'constructedresponse', 'explain', 'explanation', 'justification', 'shortanswer', 'essay',
]);
export const assignmentHasWrittenResponse = (assignment) => questionsOf(assignment).some((question) => {
  const mode = String(question?.responseMode || question?.response?.mode || '').toLowerCase();
  if (mode === 'written' || mode === 'text') return true;
  return WRITTEN_RESPONSE_TYPES.has(String(question?.type || '').replace(/[^a-z]/gi, '').toLowerCase());
});

const appliesToAssignmentDates = (appliesTo) => {
  const roles = Array.isArray(appliesTo) ? appliesTo.map((role) => String(role).toLowerCase()) : [];
  return !roles.length || roles.some((role) => ASSIGNMENT_DATED_ROLES.includes(role));
};

/**
 * The individualized deadline one student has on one assignment, or null.
 *
 * `profile` is the student's `grades/{id}.profile` (the pinned projection).
 */
export const resolveStudentSupportDeadline = ({
  assignment,
  profile,
  timeZone = SUPPORT_DEADLINE_TIME_ZONE,
} = {}) => {
  if (!assignment || !profile) return null;
  const classDueAtMs = parseInstant(assignment.dueAt || assignment.dueDate, { endOfDay: true, timeZone });
  if (classDueAtMs === null) return null;
  const window = planWindowOn(profile, zonedDateKey(classDueAtMs, timeZone));
  if (!window || String(window.status || 'active') !== 'active') return null;

  const accommodations = Array.isArray(window.accommodations) ? window.accommodations : [];
  const candidates = accommodations.filter((entry) => DEADLINE_SUPPORT_IDS.includes(String(entry?.id || '')))
    .filter((entry) => entry.id !== 'extra-time-written-response' || assignmentHasWrittenResponse(assignment))
    .filter((entry) => appliesToAssignmentDates(entry.appliesTo))
    .map((entry) => ({
      entry,
      extension: normalizeDueDateExtension(entry?.params?.dueDateExtension),
    }))
    .filter(({ extension }) => extension.mode !== DUE_DATE_EXTENSION_MODE.NONE)
    .map(({ entry, extension }) => ({
      entry,
      extension,
      supportDueAtMs: extendDueInstant({ classDueAtMs, extension, timeZone }),
    }))
    .filter(({ supportDueAtMs }) => Number.isFinite(supportDueAtMs) && supportDueAtMs > classDueAtMs);
  if (!candidates.length) return null;
  // Two extra-time entries (general + written response) never stack: the
  // student gets the more generous one.
  const chosen = candidates.reduce((best, next) => (next.supportDueAtMs > best.supportDueAtMs ? next : best));

  const classFinalAtMs = parseInstant(
    assignment.lateDueAt || assignment.lateDueDate || assignment.dueAt || assignment.dueDate,
    { endOfDay: true, timeZone },
  );
  const supportFinalAtMs = Math.max(Number.isFinite(classFinalAtMs) ? classFinalAtMs : chosen.supportDueAtMs, chosen.supportDueAtMs);
  return {
    supportId: chosen.entry.id,
    revisionId: window.revisionId || null,
    extension: chosen.extension,
    classDueAtMs,
    classFinalAtMs: Number.isFinite(classFinalAtMs) ? classFinalAtMs : null,
    supportDueAtMs: chosen.supportDueAtMs,
    supportFinalAtMs,
  };
};

/**
 * The assignment as this student experiences it: identical, except that the
 * student's override entry carries `supportDueAt` / `supportFinalAt` when an
 * individualized deadline applies. In memory only — the returned object must
 * never be written back to Firestore (students cannot write assignments, and
 * teacher code that saves assignments uses its own stored copy).
 */
export const withStudentSupportDates = (assignment, studentId, profile, { timeZone = SUPPORT_DEADLINE_TIME_ZONE } = {}) => {
  const id = String(studentId || '').trim();
  if (!assignment || !id) return assignment;
  const deadline = resolveStudentSupportDeadline({ assignment, profile, timeZone });
  if (!deadline) return assignment;
  const existing = assignment.studentOverrides && typeof assignment.studentOverrides === 'object'
    ? assignment.studentOverrides
    : {};
  const current = existing[id] && typeof existing[id] === 'object' ? existing[id] : {};
  return {
    ...assignment,
    studentOverrides: {
      ...existing,
      [id]: {
        ...current,
        supportDueAt: new Date(deadline.supportDueAtMs).toISOString(),
        supportFinalAt: new Date(deadline.supportFinalAtMs).toISOString(),
        supportDeadline: {
          supportId: deadline.supportId,
          revisionId: deadline.revisionId,
          extension: deadline.extension,
        },
      },
    },
  };
};

/** Read the injected dates back (null when none). */
export const supportDatesFromOverride = (override) => {
  if (!override || typeof override !== 'object') return null;
  const dueAtMs = parseInstant(override.supportDueAt);
  const finalAtMs = parseInstant(override.supportFinalAt);
  if (dueAtMs === null && finalAtMs === null) return null;
  return { dueAtMs, finalAtMs, supportDeadline: override.supportDeadline || null };
};

export default resolveStudentSupportDeadline;
