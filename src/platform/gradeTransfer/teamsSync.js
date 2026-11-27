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
