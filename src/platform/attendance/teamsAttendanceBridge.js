// What MathMaster offers the MathMaster TEAMS extension for attendance
// (extensions/teams-sync): `window.mathmasterTeamsAttendance`, present on
// every teacher screen, so TEAMS attendance reaches MathMaster while the
// teacher is in Live Classroom, not only on Grade Transfer.
//
// The extension has no MathMaster sign-in of its own. It runs these calls in
// the teacher's MathMaster tab, so every mark is recorded with the teacher's
// own permissions (the firestore.rules teacher-of-record checks) and through
// the one attendance handler; every tardy goes through the Discipline
// Tracker's callable, which checks the class's teacher of record again.
// The rules are functions/shared/teamsAttendance.mjs; the mirror itself
// teamsAttendanceMirror.js.

import { classIdsForTeacher } from '../../../functions/shared/classModel.mjs';

export const TEAMS_ATTENDANCE_BRIDGE_VERSION = 1;

// Loaded on the extension's first call, so a teacher's first load carries none of it.
const loadMirror = () => import('./teamsAttendanceMirror.js');
const loadSyncStore = () => import('../gradeTransfer/teamsSyncStore.js');
const loadDisciplineStore = () => import('../teacher/disciplineStore.js');

const text = (value) => String(value ?? '').trim();

/**
 * `getContext()` returns the teacher's current state: { ready, teacherEmail,
 * classes: [{ classId, name?, period?, teacherOfRecord? }], students (every
 * student they hold, each with classId and sisStudentId), fetchRecords,
 * recordAttendance }. Only the classes they teach are offered: attendance is
 * recorded by a student's own teacher (firestore.rules), so the root
 * administrator's view of every class is no wider here.
 */
// `codes`: the TEAMS code table; DeSoto's (functions/shared/teamsAttendance.mjs) unless a test gives one.
export const createTeamsAttendanceBridge = ({
  getContext, api = null, mirror = null, discipline = null, now = () => Date.now(), codes = undefined,
}) => {
  const loaded = { sync: api, mirror, discipline };
  const load = async (key, loader) => { loaded[key] = loaded[key] || await loader(); return loaded[key]; };
  // The teacher's own active classes: gradeTransferScope.js authorizedGradeTransferClasses
  // for a teacher (a test holds them together), without the grade code.
  const ownClasses = (context) => {
    const active = (context.classes || []).filter((entry) => entry?.status !== 'archived' && entry?.classId);
    const own = new Set(classIdsForTeacher(active, context.teacherEmail));
    return active.filter((entry) => own.has(entry.classId));
  };
  const classOf = (classId) => {
    const id = text(classId);
    const entry = ownClasses(getContext()).find((item) => item.classId === id);
    if (!entry) throw new Error('That class is not one of yours in MathMaster.');
    return entry;
  };
  const labelOf = (entry) => String(entry.name || entry.period || entry.classId).slice(0, 80);
  const sectionsOf = async (classId) => (await (await load('sync', loadSyncStore)).getTeamsSyncState({ classId })).sections || [];

  return Object.freeze({
    version: TEAMS_ATTENDANCE_BRIDGE_VERSION,

    /** The teacher's classes, with the TEAMS section(s) each is linked to (Grade Export → TEAMS). */
    async listClasses() {
      const context = getContext();
      if (!context.ready) throw new Error('MathMaster is still loading your classes. Try again in a moment.');
      return Promise.all(ownClasses(context).map(async (entry) => ({
        classId: entry.classId,
        label: labelOf(entry),
        period: entry.period || null,
        sections: await sectionsOf(entry.classId),
      })));
    },

    /**
     * Mirror one TEAMS section's attendance for one day into its MathMaster
     * class: { classId, sectionRef, dateKey, taken, marks: [{ districtId, code }] }.
     */
    async mirror(report = {}) {
      const context = getContext();
      if (!context.ready) throw new Error('MathMaster is still loading your classes. Try again in a moment.');
      const classRecord = classOf(report.classId);
      const sectionRef = text(report.sectionRef);
      if (!(await sectionsOf(classRecord.classId)).some((section) => section.sectionRef === sectionRef)) {
        throw new Error(`TEAMS section ${sectionRef || '(none)'} is not linked to ${labelOf(classRecord)}. Link it in Grade Export → TEAMS.`);
      }
      const store = await load('discipline', loadDisciplineStore);
      const students = context.students || [];
      return (await load('mirror', loadMirror)).mirrorTeamsAttendance({
        report,
        classRecord,
        roster: students.filter((student) => student.classId === classRecord.classId),
        sharedWith: students,
        teacherEmail: context.teacherEmail,
        nameOf: context.nameOf,
        nowValue: now(),
        ...(codes ? { codes } : {}),
        fetchRecords: context.fetchRecords,
        recordAttendance: context.recordAttendance,
        recordTardy: ({ classId, studentId, tapId }) => store.recordDisciplineIncident({ classId, studentId, type: 'tardy', tapId, source: 'teams' }),
        listIncidents: async ({ classId, dateKey }) => (await store.listDisciplineIncidents({ fromDateKey: dateKey, toDateKey: dateKey, classId })).incidents || [],
        voidTardy: ({ incidentId, reason }) => store.voidDisciplineIncident({ incidentId, reason }),
      });
    },
  });
};

/** Expose the bridge on `target` (the window); returns the undo. */
export const installTeamsAttendanceBridge = (bridge, target = globalThis) => {
  target.mathmasterTeamsAttendance = bridge;
  return () => {
    if (target.mathmasterTeamsAttendance === bridge) delete target.mathmasterTeamsAttendance;
  };
};
