/*
 * MIRRORING ONE TEAMS SECTION'S ATTENDANCE, IN THE TEACHER'S MATHMASTER TAB.
 *
 * The rules are functions/shared/teamsAttendance.mjs. This carries them out
 * with the teacher's own permissions:
 *
 *   - each mark goes through the one attendance handler
 *     (createAttendanceExtensionControls' handleRecordStudentSupportEvent,
 *     quietly), which records it and reconciles the student's deadline
 *     extensions exactly as a Live Classroom mark does;
 *   - each TEAMS tardy goes through the Discipline Tracker's own callable,
 *     under a tap id that records it once, and one TEAMS took back is undone
 *     while it waits to be sent. One already on the district form is left
 *     for the teacher, and counted so they are told.
 *
 * Every dependency is passed in, so node tests run it with fakes.
 */
import {
  TEAMS_ATTENDANCE_LIMITS, TEAMS_ATTENDANCE_SOURCE, dateKeyDaysBefore, normalizeTeamsAttendanceReport,
  planTeamsAttendanceMirror, teamsTardyTapId,
} from '../../../functions/shared/teamsAttendance.mjs';

// The marks Live Classroom takes. An excused or unexcused absence is shown
// there as absent and recorded, classified, in the history beside it.
const LIVE_MARKS = new Set(['present', 'late', 'absent']);
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

/** Today as Live Classroom keeps it (liveAttendance.js localAttendanceDateKey): the browser's own date. */
export const browserDateKey = (value = Date.now()) => {
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * The attendance record(s) for one planned mark, labelled as from TEAMS with
 * the code TEAMS showed. Today's is Live Classroom's record (a liveAttendance
 * one), so Live Classroom shows it; an earlier day's, and the classification
 * of today's absence, is a history record. They are the records
 * liveAttendance.js buildLiveAttendanceEvent and attendanceHistory.js
 * buildAttendanceHistoryEvent build, field for field (a test holds them to
 * it), built here so the attendance code a teacher's browser loads first
 * does not grow. Not known from TEAMS, so never made up: the time the student
 * arrived.
 */
export const teamsAttendanceEvents = ({
  entry, student, classRecord, sectionRef, dateKey, teacherEmail, nowValue, nameOf = () => null,
}) => {
  const studentId = text(student?.id ?? student?.studentId ?? entry.studentId);
  const reason = `From TEAMS: ${entry.label}`;
  const base = {
    stage: 'teacherConfirmed',
    studentId,
    // The name or null, never the id: readers resolve a null name against the roster.
    studentName: nameOf(student) || null,
    classId: text(classRecord.classId) || null,
    classPeriod: text(classRecord.period) || null,
    assignmentId: null,
    assignmentTitle: null,
    source: TEAMS_ATTENDANCE_SOURCE,
    summary: `${entry.label}${entry.code ? ` (TEAMS code ${entry.code})` : ''} in TEAMS for ${dateKey}.`,
    dateKey,
  };
  const teams = { teamsCode: entry.code, teamsSection: sectionRef };
  const events = [];
  if (entry.today) {
    events.push({
      kind: 'liveAttendance',
      ...base,
      evidence: { dateKey, attendanceMark: LIVE_MARKS.has(entry.mark) ? entry.mark : 'absent', arrivedAt: null, markedAt: Number(nowValue), ...teams },
    });
  }
  if (!entry.today || !LIVE_MARKS.has(entry.mark)) {
    const at = Number(nowValue) + events.length;
    events.push({
      kind: 'attendanceHistory',
      ...base,
      note: reason,
      evidence: {
        dateKey,
        mark: entry.mark,
        priorMark: null,
        priorMarkSource: null,
        reason,
        correctedByEmail: text(teacherEmail).toLowerCase() || null,
        correctedAt: at,
        markedAt: at,
        ...teams,
      },
    });
  }
  return events;
};

/** What a mirror did, for the extension's log and the teacher. */
const emptyResult = (report) => ({
  sectionRef: report.sectionRef,
  dateKey: report.dateKey,
  taken: report.taken,
  recorded: 0,
  unchanged: 0,
  notOnRoster: 0,
  unknownCodes: [],
  tardies: 0,
  tardiesUndone: 0,
  tardiesOnForm: 0,
  failed: 0,
});

/**
 * Mirror one section's report into one MathMaster class.
 *
 *   fetchRecords({ classId, fromDateKey, toDateKey })  the class's attendance records
 *   recordAttendance(event)                           the one attendance handler; null when it failed
 *   recordTardy({ classId, studentId, tapId })         the tracker's recordDisciplineIncident
 *   listIncidents({ classId, dateKey })                the tracker's records for the class that day
 *   voidTardy({ incidentId })                          the tracker's undo
 */
export const mirrorTeamsAttendance = async ({
  report: raw, classRecord, roster = [], sharedWith = [], codes, teacherEmail = '', nowValue = Date.now(),
  // Today as Live Classroom keeps it, so a mark mirrored today is the one it shows.
  todayKey = browserDateKey(nowValue),
  nameOf = () => null,
  fetchRecords, recordAttendance, recordTardy, listIncidents, voidTardy,
} = {}) => {
  const report = normalizeTeamsAttendanceReport(raw, { todayKey });
  const result = emptyResult(report);
  if (!report.taken) return result;
  const classId = classRecord.classId;
  const records = list(await fetchRecords({
    classId, fromDateKey: dateKeyDaysBefore(report.dateKey, TEAMS_ATTENDANCE_LIMITS.lookbackDays), toDateKey: report.dateKey,
  }));
  const plan = planTeamsAttendanceMirror({
    report, classId, classPeriod: classRecord.period || null, roster, sharedWith, records, todayKey, ...(codes ? { codes } : {}),
  });
  Object.assign(result, { unchanged: plan.unchanged, notOnRoster: plan.notOnRoster, unknownCodes: plan.unknownCodes, tardies: plan.tardies.length });

  const studentsById = new Map(list(roster).map((student) => [String(student.id), student]));
  let clock = Number(nowValue);
  // One at a time: each one reconciles that student's extensions.
  for (const entry of plan.marks) {
    const events = teamsAttendanceEvents({
      entry, student: studentsById.get(entry.studentId), classRecord, sectionRef: report.sectionRef, dateKey: report.dateKey, teacherEmail, nowValue: clock, nameOf,
    });
    clock += events.length;
    let saved = true;
    for (const event of events) {
      // eslint-disable-next-line no-await-in-loop
      if (!await recordAttendance(event)) { saved = false; break; }
    }
    if (saved) result.recorded += 1; else result.failed += 1;
  }

  for (const studentId of plan.tardies) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await recordTardy({ classId, studentId, tapId: teamsTardyTapId({ dateKey: report.dateKey, studentId }) });
    } catch {
      result.failed += 1;
    }
  }
  if (plan.notTardy.length) {
    const incidents = new Map(list(await listIncidents({ classId, dateKey: report.dateKey })).map((incident) => [incident.id, incident]));
    for (const studentId of plan.notTardy) {
      const incident = incidents.get(`${classId}_${teamsTardyTapId({ dateKey: report.dateKey, studentId })}`);
      if (!incident || incident.voidedAtMs) continue;
      const state = incident.form?.state || 'pending';
      // On the district form, or it may be: the teacher decides.
      if (state === 'submitted' || state === 'unknown') { result.tardiesOnForm += 1; continue; }
      // Being sent right now: the next read undoes it if it is still waiting.
      if (state === 'sending') continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await voidTardy({ incidentId: incident.id, reason: 'TEAMS no longer shows this tardy' });
        result.tardiesUndone += 1;
      } catch {
        result.failed += 1;
      }
    }
  }
  return result;
};
