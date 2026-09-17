/*
 * RETURN-TO-CLASS CHECK-IN, AND THE ATTENDANCE-CORRECTION REVIEW QUEUE.
 *
 * Both are ACTION ITEMS in the sense Teacher Operations will eventually want
 * a hub for, and both are built the way `studentSupportSignals.js` already
 * builds every other derived list in this codebase: computed fresh from the
 * source of truth (attendance history, assignment overrides) rather than
 * maintained as a separate mutable "open" record. There is nothing to go
 * stale, because nothing is stored until a teacher actually acts — at which
 * point the action itself (`returnFromAbsence` / `attendanceCorrectionReview`
 * check-in or dismissal) is the one thing persisted, append-only, in the same
 * `studentSupportEvents` stream every other support record uses.
 *
 * "Open" therefore means: the underlying condition (an absence just followed
 * by a present/late return; a correction that would shorten a stored
 * extension) still holds, AND no completing action for that exact condition
 * has been recorded yet. That is enough for a Teacher Operations hub to query
 * later without inventing a second, driftable status field.
 */

import { MEETING_STATUS, classifySchoolDay, previousActualMeetingDateKey } from './classMeetings.js';
import { attendanceHistoryMarkIsAbsent, effectiveAttendanceForStudentDay } from './attendanceHistory.js';
import { SUPPORT_EVENT_KIND, SUPPORT_EVENT_STAGE } from '../teacher/studentSupportSignals.js';
import { assignmentIsForStudent, getDOLInstructionDateKey, getWarmupInstructionDateKey } from '../../assignmentLifecycle.js';

const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

const studentIdOf = (student) => clean(student?.id || student?.studentId);
const studentNameOf = (student) => clean(student?.displayName || student?.name || student?.studentName) || studentIdOf(student);

const returnCheckInKey = ({ studentId, classId, classPeriod, lastMissedDateKey }) => (
  [clean(studentId), clean(classId) || clean(classPeriod), clean(lastMissedDateKey)].join('|')
);

/** Assignments actually taught/assigned to this class on one missed date. */
const assignmentsForMeetingDate = ({ assignments = [], classId, classPeriod, dateKey }) => (
  list(assignments)
    .filter((assignment) => assignmentIsForStudent(assignment, { classId, classPeriod }))
    .filter((assignment) => (
      getWarmupInstructionDateKey(assignment, classPeriod, classId) === dateKey
      || getDOLInstructionDateKey(assignment, classPeriod, classId) === dateKey
    ))
    .map((assignment) => ({ assignmentId: assignment.id, title: assignment.title || 'Untitled', dateKey }))
);

/** The consecutive run of missed meetings ending the day before `todayDateKey`. */
const consecutiveMissedMeetings = ({
  supportEvents, studentId, classId, classPeriod, schedule, nonInstructionalKeys, todayDateKey, maxLookbackMeetings,
}) => {
  const missed = [];
  let cursor = todayDateKey;
  for (let step = 0; step < Math.max(1, maxLookbackMeetings); step += 1) {
    const previous = previousActualMeetingDateKey({ schedule, classPeriod, fromDateKey: cursor, nonInstructionalKeys });
    if (!previous) break;
    const effective = effectiveAttendanceForStudentDay({
      supportEvents, studentId, classId, classPeriod, dateKey: previous,
    });
    if (!attendanceHistoryMarkIsAbsent(effective.mark)) break;
    missed.unshift(previous);
    cursor = previous;
  }
  return missed;
};

const findCompletion = ({ supportEvents, studentId, classId, classPeriod, key }) => (
  list(supportEvents)
    .filter((event) => event?.kind === SUPPORT_EVENT_KIND.RETURN_FROM_ABSENCE)
    .filter((event) => clean(event?.studentId) === clean(studentId))
    .filter((event) => (classId ? clean(event?.classId) === clean(classId) : clean(event?.classPeriod) === clean(classPeriod)))
    .filter((event) => clean(event?.evidence?.checkInKey) === key)
    .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0))[0] || null
);

/**
 * One candidate per roster student who was absent at their previous actual
 * class meeting and is present/late today — "today" meaning `todayDateKey`,
 * which the caller must already know is itself an actual meeting.
 */
export const resolveReturnCheckIns = ({
  roster = [],
  supportEvents = [],
  assignments = [],
  classId = null,
  classPeriod = null,
  schedule = null,
  nonInstructionalKeys = null,
  todayDateKey = null,
  maxLookbackMeetings = 10,
} = {}) => {
  if (!clean(todayDateKey) || !classPeriod) return [];

  return list(roster).map((student) => {
    const studentId = studentIdOf(student);
    if (!studentId) return null;

    const todayEffective = effectiveAttendanceForStudentDay({
      supportEvents, studentId, classId, classPeriod, dateKey: todayDateKey,
    });
    // Only an explicit present/late counts as "back". Still absent, or simply
    // unmarked, is never treated as a return.
    if (!['present', 'late'].includes(todayEffective.mark)) return null;

    const missedMeetingDates = consecutiveMissedMeetings({
      supportEvents, studentId, classId, classPeriod, schedule, nonInstructionalKeys, todayDateKey, maxLookbackMeetings,
    });
    if (!missedMeetingDates.length) return null;

    const lastMissedDateKey = missedMeetingDates[missedMeetingDates.length - 1];
    const key = returnCheckInKey({ studentId, classId, classPeriod, lastMissedDateKey });

    const missedWork = missedMeetingDates.flatMap((dateKey) => (
      assignmentsForMeetingDate({ assignments, classId, classPeriod, dateKey })
    )).filter((entry, index, all) => all.findIndex((other) => other.assignmentId === entry.assignmentId) === index);

    const extensions = missedWork
      .map((entry) => {
        const assignment = list(assignments).find((candidate) => candidate.id === entry.assignmentId);
        const extension = assignment?.studentOverrides?.[studentId]?.extension || null;
        return extension ? { assignmentId: entry.assignmentId, title: entry.title, dateKey: extension.dateKey } : null;
      })
      .filter(Boolean);

    const completion = findCompletion({ supportEvents, studentId, classId, classPeriod, key });

    return {
      key,
      studentId,
      studentName: studentNameOf(student),
      classId: classId || null,
      classPeriod: classPeriod || null,
      returnDateKey: todayDateKey,
      returnMark: todayEffective.mark,
      missedMeetingDates,
      meetingsMissed: missedMeetingDates.length,
      lastMissedDateKey,
      missedWork,
      extensions,
      status: completion
        ? (completion.stage === SUPPORT_EVENT_STAGE.DISMISSED ? 'dismissed' : 'completed')
        : 'open',
      completedByEmail: completion?.createdByEmail || null,
      completedAt: completion?.createdAt || null,
      note: completion?.note || null,
    };
  }).filter(Boolean);
};

/** Persisted the moment a teacher completes (or dismisses) the follow-up. */
export const buildReturnCheckInEvent = ({
  candidate = null,
  note = '',
  actorEmail = null,
  nowValue = Date.now(),
  dismissed = false,
} = {}) => {
  if (!candidate?.studentId || !candidate?.key) throw new Error('A return check-in needs a resolved candidate.');
  const stage = dismissed ? SUPPORT_EVENT_STAGE.DISMISSED : SUPPORT_EVENT_STAGE.ACTION_TAKEN;
  const summary = dismissed
    ? `Teacher dismissed the return-from-absence follow-up for ${candidate.studentName}.`
    : `Teacher checked in with ${candidate.studentName} after ${candidate.meetingsMissed} missed class meeting${candidate.meetingsMissed === 1 ? '' : 's'}.`;

  return {
    kind: SUPPORT_EVENT_KIND.RETURN_FROM_ABSENCE,
    stage,
    studentId: candidate.studentId,
    studentName: candidate.studentName,
    classId: candidate.classId,
    classPeriod: candidate.classPeriod,
    assignmentId: null,
    assignmentTitle: null,
    source: 'returnCheckIn',
    summary,
    note: clean(note),
    evidence: {
      checkInKey: candidate.key,
      absenceSpan: {
        missedMeetingDates: candidate.missedMeetingDates,
        lastMissedDateKey: candidate.lastMissedDateKey,
        returnDateKey: candidate.returnDateKey,
        meetingsMissed: candidate.meetingsMissed,
      },
      relatedAssignmentIds: candidate.missedWork.map((entry) => entry.assignmentId),
      checkedInByEmail: actorEmail ? clean(actorEmail).toLowerCase() : null,
      checkedInAt: Number(nowValue),
    },
  };
};

/**
 * An open attendance-correction review: a correction that would shorten a
 * previously granted extension. Same derive-then-persist-only-the-resolution
 * pattern as the return check-in above.
 */
export const buildAttendanceCorrectionReviewKey = ({ studentId, assignmentId, existingDateKey }) => (
  [clean(studentId), clean(assignmentId), clean(existingDateKey)].join('|')
);

export const buildAttendanceCorrectionReviewEvent = ({
  studentId,
  studentName = null,
  assignmentId,
  assignmentTitle = null,
  classId = null,
  classPeriod = null,
  existing = null,
  proposed = null,
  resolution = 'kept', // 'kept' | 'shortened'
  note = '',
  actorEmail = null,
  nowValue = Date.now(),
} = {}) => {
  const key = buildAttendanceCorrectionReviewKey({ studentId, assignmentId, existingDateKey: existing?.dateKey });
  const summary = resolution === 'shortened'
    ? `Teacher confirmed shortening the extension for ${studentName || studentId} after an attendance correction.`
    : `Teacher kept the existing extension for ${studentName || studentId} after reviewing an attendance correction.`;

  return {
    kind: SUPPORT_EVENT_KIND.ATTENDANCE_CORRECTION_REVIEW,
    stage: SUPPORT_EVENT_STAGE.RESOLVED,
    studentId: clean(studentId),
    studentName: clean(studentName) || clean(studentId),
    classId: classId || null,
    classPeriod: classPeriod || null,
    assignmentId: assignmentId || null,
    assignmentTitle,
    source: 'attendanceCorrectionReview',
    summary,
    note: clean(note),
    evidence: {
      reviewKey: key,
      resolution,
      existingDateKey: existing?.dateKey || null,
      proposedDateKey: proposed?.dateKey || null,
      resolvedByEmail: actorEmail ? clean(actorEmail).toLowerCase() : null,
      resolvedAt: Number(nowValue),
    },
  };
};

export const attendanceCorrectionReviewIsResolved = ({ supportEvents = [], studentId, assignmentId, existingDateKey }) => {
  const key = buildAttendanceCorrectionReviewKey({ studentId, assignmentId, existingDateKey });
  return list(supportEvents).some((event) => (
    event?.kind === SUPPORT_EVENT_KIND.ATTENDANCE_CORRECTION_REVIEW && clean(event?.evidence?.reviewKey) === key
  ));
};

export const classMeetsToday = ({ schedule, classPeriod, dateKey, nonInstructionalKeys }) => (
  classifySchoolDay({ schedule, classPeriod, dateKey, nonInstructionalKeys }).status === MEETING_STATUS.MEETS
);

export default resolveReturnCheckIns;
