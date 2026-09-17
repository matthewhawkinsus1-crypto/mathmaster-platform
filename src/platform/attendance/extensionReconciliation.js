/*
 * TURNING A MARKED ABSENCE INTO A STUDENT-SPECIFIC FINAL CUTOFF.
 *
 * `absencePolicy.js` knows how many meetings of extension an absence earns.
 * `classMeetings.js` knows which actual date that lands on. Neither one
 * writes anything — this module is the one place that combines them into the
 * patch a caller stores on `assignment.studentOverrides[studentId]`, which
 * `assignmentLifecycle.js` already reads for every student-facing lifecycle
 * decision (see the comment there). There is no second deadline store.
 *
 * AN ABSENCE EXTENDS THE FINAL/CREDIT CUTOFF, NOT THE ORDINARY DUE DATE.
 *
 * A class typically has two dates: an ordinary due date (on-time vs late) and
 * a final/late cutoff (credit-eligible vs closed). The ordinary due date
 * keeps deciding on-time-vs-late for every student, extended or not — that is
 * a pacing signal, not an opportunity. What an absence buys back is time
 * against the FINAL cutoff, so the extension is computed from
 * `assignment.lateDueAt || lateDueDate || dueAt || dueDate` (the class's own
 * authoritative final cutoff) and written to `studentOverrides[id].lateDueAt`
 * ONLY. Never `dueAt`: writing a per-student `dueAt` would make
 * `assignmentLifecycle.js`'s late-cutoff fallback (`override.lateDueAt ||
 * override.dueAt || ...`) pick up a date computed from the wrong baseline,
 * which is exactly the bug this rule prevents — a "due Sept 18, late Sept 25"
 * assignment with a one-meeting absence extended from Sept 18 would land the
 * final cutoff on Sept 21, SHORTENING the eight days of credit-eligibility
 * every other student already has.
 *
 * THE SAFETY RULE. Attendance is corrected in both directions: a teacher
 * fixes a mistaken Absent to Present, or adds a Present student they missed.
 * Extending is always safe — the student was not relying on a SHORTER
 * deadline. Shortening one a student may already have used is not: this
 * module never writes a final cutoff earlier than the one already on file
 * (which, by construction, is never earlier than the class's own final
 * cutoff either). When a correction implies a shorter extension than what is
 * stored, it reports `reviewNeeded: true` with both dates instead of writing,
 * so a teacher makes that call explicitly.
 *
 * The extension is always computed from the class's ORIGINAL final cutoff,
 * never from a previously-extended one — otherwise re-running reconciliation
 * after every correction would compound extensions instead of recomputing
 * the one the student has actually earned.
 */

import { extendDueByClassMeetings, localDateKeyOf } from './classMeetings.js';
import { extensionMeetingsFor, summarizeAssignmentAbsences } from './absencePolicy.js';
import { attendanceMarksForStudentRange } from './attendanceHistory.js';
import { assignmentIsForStudent } from '../../assignmentLifecycle.js';
import { attendanceCorrectionReviewIsResolved } from './returnCheckIn.js';

/** The class's own authoritative final/credit cutoff — never the ordinary due date. */
const originalFinalCutoff = (assignment) => (
  assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate || null
);

/**
 * What the extension SHOULD be for one student on one assignment, given their
 * attendance marks across the assignment's window, and whether writing it
 * would silently shorten a deadline already on file.
 */
export const resolveStudentExtension = ({
  assignment = {},
  studentId = null,
  marks = [],
  schedule = null,
  classPeriod = null,
  nonInstructionalKeys = null,
  policy = null,
} = {}) => {
  const finalCutoff = originalFinalCutoff(assignment);
  // Which absences "bear on" this assignment is still about the ordinary
  // instructional window (release through the ordinary due date) — the late
  // window is makeup time, not more instruction to be absent from.
  const fromDateKey = localDateKeyOf(assignment?.releaseAt || assignment?.releaseDate) || null;
  const toDateKey = localDateKeyOf(assignment?.dueAt || assignment?.dueDate) || localDateKeyOf(finalCutoff);
  const absences = summarizeAssignmentAbsences({ marks, fromDateKey, toDateKey });
  const extensionMeetings = extensionMeetingsFor({ absences, policy });

  const existing = assignment?.studentOverrides?.[studentId]?.extension || null;

  if (!finalCutoff || !classPeriod || extensionMeetings === 0) {
    return {
      changed: false, reviewNeeded: false, reason: 'no_extension_earned',
      absences, extensionMeetings: 0, proposed: null, existing,
    };
  }

  const extended = extendDueByClassMeetings({
    schedule, classPeriod, dueAt: finalCutoff, classMeetings: extensionMeetings, nonInstructionalKeys,
  });

  const proposed = {
    dueAt: extended.dueAt,
    dateKey: extended.dateKey,
    meetingsGranted: extended.meetingsGranted,
    meetingsRequested: extended.meetingsRequested,
    undetermined: extended.undetermined,
    resolved: extended.resolved,
    sourceAbsenceDates: [...absences.dates.excused, ...absences.dates.unexcused].sort(),
  };

  // Nothing on file yet: grant it.
  if (!existing?.dateKey) {
    return { changed: true, reviewNeeded: false, reason: 'extension_granted', absences, extensionMeetings, proposed, existing };
  }

  // The recomputed extension lands on or after what is already stored: this
  // is either the same correction re-applied, or a new absence adding more
  // relief. Either way it is safe to write.
  if (proposed.dateKey >= existing.dateKey) {
    if (proposed.dateKey === existing.dateKey) {
      return { changed: false, reviewNeeded: false, reason: 'unchanged', absences, extensionMeetings, proposed, existing };
    }
    return { changed: true, reviewNeeded: false, reason: 'extension_extended', absences, extensionMeetings, proposed, existing };
  }

  // The recomputed extension is EARLIER than what the student already has.
  // That can only happen because a correction removed an absence the earlier
  // grant was based on. Never silently take back opportunity already
  // granted — surface it for a teacher decision instead.
  return {
    changed: false, reviewNeeded: true, reason: 'would_shorten_existing_extension',
    absences, extensionMeetings, proposed, existing,
  };
};

/**
 * The Firestore patch for `resolveStudentExtension`'s `changed: true` case,
 * merged onto whatever `studentOverrides` the assignment already carries so a
 * write for one student never touches another's excused/reopened/extension
 * state.
 */
export const buildStudentExtensionPatch = ({
  assignment = {}, studentId = null, resolution = null, actorEmail = null, nowValue = Date.now(),
} = {}) => {
  if (!resolution?.changed || !studentId) return null;
  const currentOverrides = assignment?.studentOverrides && typeof assignment.studentOverrides === 'object'
    ? assignment.studentOverrides : {};
  const currentEntry = currentOverrides[studentId] && typeof currentOverrides[studentId] === 'object'
    ? currentOverrides[studentId] : {};

  return {
    studentOverrides: {
      ...currentOverrides,
      [studentId]: {
        ...currentEntry,
        // Only the FINAL cutoff moves. The ordinary `dueAt` is never
        // overridden here, so on-time-vs-late status is unaffected — see the
        // module header for why writing `dueAt` would be the bug.
        lateDueAt: resolution.proposed.dueAt,
        extension: {
          dateKey: resolution.proposed.dateKey,
          meetingsGranted: resolution.proposed.meetingsGranted,
          meetingsRequested: resolution.proposed.meetingsRequested,
          undetermined: resolution.proposed.undetermined,
          resolved: resolution.proposed.resolved,
          sourceAbsenceDates: resolution.proposed.sourceAbsenceDates,
          grantedByEmail: actorEmail ? String(actorEmail).trim().toLowerCase() : null,
          grantedAt: Number(nowValue),
        },
      },
    },
  };
};

/**
 * Every assignment a fresh attendance mark on `correctionDateKey` bears on,
 * re-resolved end to end — this is "historical corrections trigger the same
 * reconciliation" from a single call. A live quick-mark for today goes
 * through this exact same path (it is just another attendance event), so
 * there is one reconciliation trigger, not two.
 */
export const reconcileAssignmentExtensionsForCorrection = ({
  assignments = [],
  studentId = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  nonInstructionalKeys = null,
  supportEvents = [],
  correctionDateKey = null,
  policy = null,
} = {}) => (
  (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => assignmentIsForStudent(assignment, { classId }))
    .filter((assignment) => {
      const dueDateKey = localDateKeyOf(assignment?.dueAt || assignment?.dueDate);
      const releaseDateKey = localDateKeyOf(assignment?.releaseAt || assignment?.releaseDate) || '0000-00-00';
      // A correction on a date outside this assignment's own instructional
      // window has nothing to do with it.
      return dueDateKey && correctionDateKey >= releaseDateKey && correctionDateKey <= dueDateKey;
    })
    .map((assignment) => {
      const marks = attendanceMarksForStudentRange({
        supportEvents,
        studentId,
        classId,
        classPeriod,
        schedule,
        fromDateKey: localDateKeyOf(assignment?.releaseAt || assignment?.releaseDate) || correctionDateKey,
        toDateKey: localDateKeyOf(assignment?.dueAt || assignment?.dueDate),
        nonInstructionalKeys,
      });
      const resolution = resolveStudentExtension({
        assignment, studentId, marks, schedule, classPeriod, nonInstructionalKeys, policy,
      });
      return { assignment, resolution };
    })
    .filter(({ resolution }) => resolution.changed || resolution.reviewNeeded)
);

/**
 * Every OPEN attendance-correction review for one student right now —
 * derived fresh from current attendance history and every assignment
 * assigned to their class, the same way `resolveReturnCheckIns` derives open
 * return check-ins. "Open" means `resolveStudentExtension` still says
 * `reviewNeeded` AND no teacher has recorded a resolution for that exact
 * existing/proposed cutoff pair yet (`attendanceCorrectionReviewIsResolved`,
 * returnCheckIn.js) — so this never drifts out of sync with a later
 * correction the way a separately-maintained "open" flag could.
 */
export const openAttendanceCorrectionReviewsForStudent = ({
  assignments = [],
  studentId = null,
  classId = null,
  classPeriod = null,
  schedule = null,
  nonInstructionalKeys = null,
  supportEvents = [],
  policy = null,
} = {}) => (
  (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => assignmentIsForStudent(assignment, { classId }))
    .map((assignment) => {
      const marks = attendanceMarksForStudentRange({
        supportEvents,
        studentId,
        classId,
        classPeriod,
        schedule,
        fromDateKey: localDateKeyOf(assignment?.releaseAt || assignment?.releaseDate),
        toDateKey: localDateKeyOf(assignment?.dueAt || assignment?.dueDate),
        nonInstructionalKeys,
      });
      const resolution = resolveStudentExtension({
        assignment, studentId, marks, schedule, classPeriod, nonInstructionalKeys, policy,
      });
      return { assignment, resolution };
    })
    .filter(({ assignment, resolution }) => (
      resolution.reviewNeeded
      && !attendanceCorrectionReviewIsResolved({
        supportEvents, studentId, assignmentId: assignment.id, existingDateKey: resolution.existing?.dateKey,
      })
    ))
);

export default resolveStudentExtension;
