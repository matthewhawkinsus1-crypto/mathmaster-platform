// MathMaster -> Frontline TEAMS gradebook sync, browser side (issues #612, #613).
//
// The engine itself is shared with the backend: functions/shared/teamsSyncEngine.mjs.
// What stays here turns Grade Transfer's units into sync targets.

import { isTestCycleAssignment } from '../assessment/testCycle.js';
import {
  MISSING_SIS_TRANSFER_REASON,
  SECTION_TRANSFER_LABELS,
  SHARED_SIS_TRANSFER_REASON,
  authoritativeSisStudentId,
} from './gradeTransferModel.js';
import { projectGradeTransferUnits } from './gradeTransferProjection.js';
import { normalizeGradingPeriodSettings, resolveAssignmentGradingPeriod } from '../student/gradingPeriods.js';
import { teacherAssignmentView } from '../../../functions/shared/studentAssignmentOverrides.mjs';
import { teamsAssignmentName, teamsDay } from '../../../functions/shared/teamsSyncEngine.mjs';

export * from '../../../functions/shared/teamsSyncEngine.mjs';

const text = (value) => String(value ?? '').trim();
const ROSTER_ID_REASONS = new Set([MISSING_SIS_TRANSFER_REASON, SHARED_SIS_TRANSFER_REASON]);

/**
 * One sync target from a Grade Transfer section unit (buildTransferUnit),
 * so the sync posts exactly the grades the export already would: the same
 * finality, extension, Recovery-hold, excusal and district-ID rules.
 * `provisionalRows` are open-lesson scores; they are used only while the
 * unit is not final yet.
 */
export const teamsTargetFromTransferUnit = ({
  unit, assignment = {}, teamsSectionRef = '', teamsSectionRefs = null, students = [], provisionalRows = [], now = Date.now(),
  timeZone = 'America/Chicago', category = null, countedWeight = 1,
}) => {
  // The same district-ID rule as every export (a stored ID wins; an all-digit
  // legacy account ID stands in only when none is stored).
  const sisOf = new Map((students || []).map((student) => [text(student.id), text(authoritativeSisStudentId(student))]));
  const person = (row) => ({ studentId: row.studentId, sisStudentId: row.sisStudentId || sisOf.get(text(row.studentId)) || '', reason: row.reason });
  const closed = unit.ordinaryDeadline !== null && unit.ordinaryDeadline !== undefined && now >= unit.ordinaryDeadline;
  const label = unit.sectionLabel || SECTION_TRANSFER_LABELS[unit.sectionKey] || '';
  return {
    key: unit.key,
    classId: unit.classId,
    // Every TEAMS section the class is linked to (an inclusion class is two);
    // the engine routes each student by the TEAMS roster.
    teamsSectionRefs: Array.isArray(teamsSectionRefs) ? teamsSectionRefs : [teamsSectionRef].filter(Boolean),
    name: teamsAssignmentName(unit.assignmentTitle, label),
    category: category || (isTestCycleAssignment(assignment) ? 'Test' : 'Daily'),
    assignedDate: teamsDay(assignment.assignedAt || assignment.startAt || assignment.createdAt, timeZone),
    dueDate: teamsDay(assignment.dueAt || assignment.dueDate || unit.ordinaryDeadline, timeZone),
    closed,
    countedWeight,
    rows: (closed ? unit.allRows : provisionalRows || []).map((row) => ({
      studentId: row.studentId,
      sisStudentId: text(row.sisStudentId),
      grade: Math.max(0, Math.min(100, Math.round(Number(row.grade)))),
    })),
    withheld: closed ? (unit.withheld || []).map(person) : [],
    excused: (unit.excused || []).map(person),
    // Recovery held, no finalized grade, needs review. A district-ID problem
    // is left out: its ID cannot address a TEAMS row safely.
    unresolved: closed
      ? (unit.problems || []).filter((row) => !ROSTER_ID_REASONS.has(row.reason)).map(person)
      : [],
  };
};

// A moment after every deadline: "the grade if it were final now". Used only
// for open-lesson scores posted at #Count 0, never as a final grade.
const PROVISIONAL_NOW = Date.UTC(9999, 0, 1);

/**
 * Every TEAMS sync target for one class: one per lesson section (Warm-Up,
 * Classwork, Practice, DOL) or whole assignment, built from the same
 * projection Grade Transfer exports from. Closed lessons carry final grades;
 * open lessons carry each student's current grade as a provisional row.
 * `dueOnOrAfter` (YYYY-MM-DD) keeps the set to the current marking period.
 * The server checks every row against the class roster again before keeping
 * it (functions/shared/teamsSyncServer.mjs normalizeTeamsTargets).
 */
export const buildTeamsSyncTargets = ({
  classId, classes = [], assignments = [], students = [], teacherEmail = '', isRootAdmin = false,
  snapshots = [], practicePasses = new Set(), now = Date.now(), dueOnOrAfter = '', timeZone = 'America/Chicago',
  resolveStudentFinalDeadline,
  // (assignment) => boolean: e.g. "in the current marking period". Absent: all.
  includeAssignment = null,
} = {}) => {
  const options = { classes, assignments, students, teacherEmail, isRootAdmin, snapshots, practicePasses, ...(resolveStudentFinalDeadline ? { resolveStudentFinalDeadline } : {}) };
  const current = projectGradeTransferUnits({ ...options, now }).units.filter((unit) => unit.classId === classId);
  const provisional = new Map(projectGradeTransferUnits({ ...options, now: PROVISIONAL_NOW }).units
    .filter((unit) => unit.classId === classId)
    .flatMap((unit) => (unit.sectionUnits || [unit]).map((part) => [part.key, part])));
  const byId = new Map((assignments || []).map((assignment) => [assignment.id, assignment]));
  return current
    .flatMap((unit) => unit.sectionUnits || [unit])
    .filter((part) => part.ordinaryDeadline !== null && part.ordinaryDeadline !== undefined)
    .filter((part) => typeof includeAssignment !== 'function' || includeAssignment(byId.get(part.assignmentId) || null))
    .map((part) => teamsTargetFromTransferUnit({
      unit: part,
      assignment: byId.get(part.assignmentId) || {},
      students,
      provisionalRows: provisional.get(part.key)?.allRows || [],
      now,
      timeZone,
    }))
    .filter((target) => !dueOnOrAfter || target.dueDate >= dueOnOrAfter)
    // The server links the TEAMS sections; a target names none of its own.
    .map(({ teamsSectionRefs: _sections, ...target }) => target);
};

/**
 * The same targets, built on the server from the records Grade Export reads
 * in the browser (the scheduled publish, functions/lib/teamsSyncScheduledTargets.js).
 * Each input is assembled the way the teacher's screen assembles it, so a
 * scheduled publish sends what pressing "Send now" would:
 *
 *   assignments    this class's, with each student's private controls merged
 *                  in (teacherClassControls.js projectTeacherAssignments)
 *   students       grades/{id} records of the class
 *   snapshots      Grade Transfer's export history (listGradeTransferState)
 *   practicePasses redeemed Practice Pass rewards (listGradeTransferState)
 *   marking period the current one (settings/gradingPeriods)
 */
export const buildTeamsSyncTargetsFromRecords = ({
  classId, classRecord = {}, assignmentDocs = [], studentDocs = [], snapshotDocs = [], redemptionDocs = [],
  controlDocs = [], gradingPeriodSettings = {}, now = Date.now(),
} = {}) => {
  const byAssignment = {};
  (controlDocs || []).forEach((record) => {
    const assignmentId = text(record?.assignmentId);
    const studentId = text(record?.studentId);
    if (!assignmentId || !studentId || text(record?.classId) !== classId) return;
    (byAssignment[assignmentId] ||= {})[studentId] = record;
  });
  const assignments = (assignmentDocs || []).filter((entry) => entry?.id).map((entry) => teacherAssignmentView(entry, byAssignment[entry.id] || {}));
  const practicePasses = new Set((redemptionDocs || [])
    .filter((entry) => entry?.rewardCode === 'practicePass' && entry?.status === 'redeemed')
    .map((entry) => `${text(entry.studentId)}__${text(entry.classId)}__${text(entry.assignmentId)}`)
    .filter((key) => !key.startsWith('__')));
  const settings = normalizeGradingPeriodSettings(gradingPeriodSettings || {});
  return buildTeamsSyncTargets({
    classId,
    classes: [{ ...classRecord, classId }],
    assignments,
    students: studentDocs || [],
    teacherEmail: text(classRecord.teacherOfRecord).toLowerCase(),
    snapshots: snapshotDocs || [],
    practicePasses,
    now,
    includeAssignment: (assignment) => resolveAssignmentGradingPeriod(assignment, settings).isCurrent,
  });
};
