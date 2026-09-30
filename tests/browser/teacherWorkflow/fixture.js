/*
 * A synthetic school for the teacher-workflow harness. Every name, id and
 * grade here is invented; nothing is copied from production.
 *
 * The school is built RELATIVE TO NOW so the scenarios always line up:
 *   - Period 3 is in session (started 40 minutes ago, ends in 50) and TWO
 *     classes share it, the way a real class and a QA/lab section can;
 *   - today's lesson has a Warm-Up and a DOL scheduled today (the DOL opens
 *     automatically near the end of Period 3);
 *   - yesterday's lesson is still open; last week's lesson is closed and was
 *     EXPORTED on "Monday" without being marked uploaded, and a grade has
 *     changed since; a 1st-marking-period lesson was exported AND uploaded;
 *   - Period 1 has a lesson ready to export that was never exported;
 *   - Period 5 has a student whose account key is not a numeric SIS id.
 */
import { projectGradeTransferUnits } from '../../../src/platform/gradeTransfer/gradeTransferProjection.js';
import { createExportSnapshot, transferSnapshotId } from '../../../src/platform/gradeTransfer/gradeTransferModel.js';

export const TEACHER_EMAIL = 'teacher@harness.example';

const DAY = 24 * 60 * 60 * 1000;
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const endOfDay = (ms) => { const d = new Date(ms); d.setHours(23, 59, 0, 0); return d.toISOString(); };
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const hhmm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sameDay = (a, b) => dateKey(a) === dateKey(b);
const previousSchoolDay = (ms) => {
  let cursor = ms - DAY;
  while ([0, 6].includes(new Date(cursor).getDay())) cursor -= DAY;
  return cursor;
};

const FIRST = ['Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley', 'Gray', 'Harper', 'Indy', 'Jordan', 'Kai', 'Logan', 'Morgan', 'Noel', 'Oakley', 'Parker', 'Quinn', 'Reese', 'Sage', 'Tatum', 'Uri', 'Val', 'Wren', 'Yael', 'Zion'];
const LAST = ['Adler', 'Brooks', 'Castillo', 'Dunn', 'Ellis', 'Flores', 'Garza', 'Hale', 'Ibarra', 'Jensen', 'Khan', 'Lopez', 'Mercer', 'Nash', 'Ortiz', 'Price', 'Quade', 'Rios', 'Sato', 'Tran'];

const lessonSections = (id) => ([
  { id: `${id}-wu`, role: 'warmup', title: 'Warm-Up', questions: [{ questionId: `${id}-w1`, activityRole: 'warmup', type: 'freeResponse', prompt: 'Solve 2x + 3 = 11.', expected: '4' }] },
  { id: `${id}-cw`, role: 'classwork', title: 'Classwork', questions: [
    { questionId: `${id}-c1`, activityRole: 'classwork', type: 'freeResponse', prompt: 'Solve the system x + y = 5, x − y = 1. What is x?', expected: '3' },
    { questionId: `${id}-c2`, activityRole: 'classwork', type: 'freeResponse', prompt: 'What is y?', expected: '2' },
  ] },
  { id: `${id}-pr`, role: 'practice', title: 'Practice', questions: [
    { questionId: `${id}-p1`, activityRole: 'practice', type: 'freeResponse', prompt: 'Solve 3x = 12.', expected: '4' },
    { questionId: `${id}-p2`, activityRole: 'practice', type: 'freeResponse', prompt: 'Solve x/2 = 5.', expected: '10' },
  ] },
  { id: `${id}-dol`, role: 'dol', title: 'DOL', questions: [{ questionId: `${id}-d1`, activityRole: 'dol', type: 'freeResponse', prompt: 'Solve 5x − 5 = 20.', expected: '5' }] },
]);

const correct = { status: 'correct', totalAttempts: 1, timeSpent: 40 };
const missed = { status: 'expired', partialCredit: 0, totalAttempts: 3, timeSpent: 90 };
const trying = { status: 'attempted', totalAttempts: 1, timeSpent: 30 };
// One tracker per "kind" of student, over the 6-question lesson (0 WU, 1-2 CW, 3-4 PR, 5 DOL).
const TRACKERS = {
  strong: { 0: correct, 1: correct, 2: correct, 3: correct, 4: correct, 5: correct },
  solid: { 0: correct, 1: correct, 2: missed, 3: correct, 4: correct, 5: correct },
  struggling: { 0: missed, 1: correct, 2: missed, 3: missed, 4: correct, 5: missed },
  partial: { 0: correct, 1: correct, 2: trying },
  warmupOnly: { 0: correct },
};

export const buildTeacherWorkflowFixture = ({ now = Date.now(), Timestamp } = {}) => {
  const todayKey = dateKey(now);
  const yesterday = previousSchoolDay(now);
  const fixture = {};

  // ---------------------------------------------------------------- schedule
  const clampStart = (ms) => (sameDay(ms, now) ? ms : new Date(new Date(now).setHours(0, 5, 0, 0)).getTime());
  const clampEnd = (ms) => (sameDay(ms, now) ? ms : new Date(new Date(now).setHours(23, 55, 0, 0)).getTime());
  const todayPeriods = {
    'Period 3': { enabled: true, start: hhmm(clampStart(now - 40 * 60_000)), end: hhmm(clampEnd(now + 50 * 60_000)) },
  };
  if (sameDay(now - 4 * 3600_000, now)) todayPeriods['Period 1'] = { enabled: true, start: hhmm(now - 4 * 3600_000), end: hhmm(now - 3 * 3600_000) };
  if (sameDay(now + 3 * 3600_000, now)) todayPeriods['Period 5'] = { enabled: true, start: hhmm(now + 2 * 3600_000), end: hhmm(now + 3 * 3600_000) };
  const regularDay = {
    'Period 1': { enabled: true, start: '07:30', end: '08:35' },
    'Period 3': { enabled: true, start: '10:19', end: '12:34' },
    'Period 5': { enabled: true, start: '13:00', end: '14:30' },
  };
  fixture['settings/classSchedule'] = {
    version: 2,
    periods: {},
    daySchedules: { A: { periods: regularDay }, B: { periods: regularDay } },
    weeklyDayTypes: { 0: null, 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: 'A', 6: null },
    dayTypeOverrides: {},
    modifiedSchedules: { [todayKey]: { label: 'Harness day (Period 3 in session)', periods: todayPeriods } },
  };
  fixture['settings/gradingPeriods'] = {
    periods: [
      { id: 'mp1', label: '1st Marking Period', order: 1, archived: true },
      { id: 'mp2', label: '2nd Marking Period', order: 2, archived: false },
    ],
    currentPeriodId: 'mp2',
  };
  fixture['settings/assignmentFolders'] = { paths: ['Algebra I', 'Algebra II'] };

  // ---------------------------------------------------------------- classes
  const classes = [
    { classId: 'c-alg2-p3', name: 'Algebra II — Period 3', period: 'Period 3', course: 'algebra2' },
    { classId: 'c-lab-p3', name: 'Algebra II Lab — Period 3', period: 'Period 3', course: 'algebra2' },
    { classId: 'c-alg1-p1', name: 'Algebra I — Period 1', period: 'Period 1', course: 'algebra1' },
    { classId: 'c-alg1-p5', name: 'Algebra I — Period 5', period: 'Period 5', course: 'algebra1' },
  ].map((entry) => ({ ...entry, teacherOfRecord: TEACHER_EMAIL, status: 'active', courseLevel: 'standard' }));
  classes.forEach(({ classId, ...data }) => { fixture[`classes/${classId}`] = data; });

  // ---------------------------------------------------------------- assignments
  const mp1 = { id: 'mp1', label: '1st Marking Period', order: 1 };
  const mp2 = { id: 'mp2', label: '2nd Marking Period', order: 2 };
  const lesson = ({ id, title, classIds, releaseMs, dueMs, lateMs, instructionMs, period = mp2, folder }) => ({
    id,
    title,
    schemaVersion: 5,
    assignmentType: 'notesClasswork',
    folder,
    contentVersion: 1,
    assignedClassIds: classIds,
    assignedClassPeriods: [...new Set(classIds.map((classId) => classes.find((entry) => entry.classId === classId)?.period).filter(Boolean))],
    releaseAt: releaseMs ? startOfDay(releaseMs) : null,
    dueAt: endOfDay(dueMs),
    lateDueAt: endOfDay(lateMs),
    sections: lessonSections(id),
    warmup: { enabled: true, instructionDate: instructionMs ? dateKey(instructionMs) : null, minutesBeforeStart: 7, closeMinutesAfterStart: 10 },
    dol: { enabled: true, instructionDate: instructionMs ? dateKey(instructionMs) : null, minutesBeforeEnd: 10, closeMinutesBeforeEnd: 5 },
    gradingPeriod: period,
    createdAt: new Date((releaseMs || now) - DAY).toISOString(),
  });
  const assignments = [
    lesson({ id: 'a-today', title: 'Systems of Equations — Lesson 3: Elimination', classIds: ['c-alg2-p3', 'c-lab-p3'], releaseMs: now, dueMs: now + DAY, lateMs: now + 5 * DAY, instructionMs: now, folder: 'Algebra II' }),
    lesson({ id: 'a-yesterday', title: 'Systems of Equations — Lesson 2: Substitution', classIds: ['c-alg2-p3'], releaseMs: yesterday, dueMs: now, lateMs: now + 3 * DAY, instructionMs: yesterday, folder: 'Algebra II' }),
    lesson({ id: 'a-lastweek', title: 'Linear Functions — Review', classIds: ['c-alg2-p3', 'c-alg1-p1'], releaseMs: now - 9 * DAY, dueMs: now - 7 * DAY, lateMs: now - 4 * DAY, instructionMs: now - 9 * DAY }),
    lesson({ id: 'a-mp1', title: 'Unit 1 — Test Review', classIds: ['c-alg2-p3'], releaseMs: now - 33 * DAY, dueMs: now - 30 * DAY, lateMs: now - 28 * DAY, instructionMs: now - 33 * DAY, period: mp1 }),
    lesson({ id: 'a-p1-ready', title: 'Slope Foundations', classIds: ['c-alg1-p1'], releaseMs: now - 6 * DAY, dueMs: now - 5 * DAY, lateMs: now - 2 * DAY, instructionMs: now - 6 * DAY, folder: 'Algebra I' }),
    lesson({ id: 'a-p5', title: 'Linear Equations — Lesson 5', classIds: ['c-alg1-p5'], releaseMs: now, dueMs: now + 2 * DAY, lateMs: now + 6 * DAY, instructionMs: now, folder: 'Algebra I' }),
    { ...lesson({ id: 'a-library', title: 'Quadratics — Lesson 1', classIds: [], releaseMs: null, dueMs: now + 10 * DAY, lateMs: now + 12 * DAY, instructionMs: null, folder: 'Algebra II' }), dueAt: null, lateDueAt: null },
  ];
  assignments.forEach(({ id, ...data }) => { fixture[`assignments/${id}`] = data; });

  // ---------------------------------------------------------------- students
  const kinds = ['strong', 'solid', 'struggling', 'strong', 'solid', 'partial', 'warmupOnly', null];
  const students = [];
  let serial = 1;
  const addStudents = (classRecord, count, trackersFor) => {
    for (let index = 0; index < count; index += 1) {
      const first = FIRST[(serial * 7) % FIRST.length];
      const last = LAST[(serial * 3) % LAST.length];
      const id = classRecord.classId === 'c-alg1-p5' && index === 0 ? 'wren.sample' : String(910000 + serial);
      serial += 1;
      students.push({
        id,
        firstName: first,
        lastName: last,
        displayName: `${first} ${last}`,
        classId: classRecord.classId,
        classPeriod: classRecord.period,
        assignedTeacherEmail: TEACHER_EMAIL,
        status: 'active',
        profile: {},
        gradesByAssignment: trackersFor(index),
        assignmentActivity: {},
      });
    }
  };
  const byId = Object.fromEntries(classes.map((entry) => [entry.classId, entry]));
  addStudents(byId['c-alg2-p3'], 8, (index) => ({
    'a-mp1': TRACKERS[['strong', 'solid', 'strong', 'struggling', 'solid', 'strong', 'solid', 'strong'][index]],
    'a-lastweek': TRACKERS[['strong', 'solid', 'struggling', 'strong', 'solid', 'strong', 'struggling', 'solid'][index]],
    ...(kinds[index] ? { 'a-yesterday': TRACKERS[kinds[index]] } : {}),
    ...(index < 3 ? { 'a-today': TRACKERS.warmupOnly } : {}),
  }));
  addStudents(byId['c-lab-p3'], 4, (index) => (index < 2 ? { 'a-today': TRACKERS.warmupOnly } : {}));
  addStudents(byId['c-alg1-p1'], 6, (index) => ({
    'a-lastweek': TRACKERS[['strong', 'solid', 'strong', 'struggling', 'solid', 'strong'][index]],
    'a-p1-ready': TRACKERS[['strong', 'solid', 'struggling', 'strong', 'partial', 'solid'][index]],
  }));
  addStudents(byId['c-alg1-p5'], 5, () => ({}));
  students.forEach(({ id, ...data }) => { fixture[`grades/${id}`] = data; });

  // ---------------------------------------------------------------- live presence
  const p3 = students.filter((student) => student.classId === 'c-alg2-p3');
  const presence = (student, extra) => {
    fixture[`presence/${student.id}`] = {
      assignmentId: 'a-today', assignmentTitle: 'Systems of Equations — Lesson 3: Elimination', activityRole: 'classwork',
      questionIndex: 1, questionCount: 6, sectionQuestionIndex: 0, sectionQuestionCount: 2, questionStates: 'c.....',
      currentAttempts: 0, answeredCount: 1, correctCount: 1, accuracy: 100, pageVisible: true,
      startedAt: now - 20 * 60_000, lastInteractionAt: now - 5_000, updatedAt: now, __simulated: true, ...extra,
    };
  };
  presence(p3[0], {});
  presence(p3[1], { questionIndex: 2, sectionQuestionIndex: 1, questionStates: 'cc....', answeredCount: 2, correctCount: 2 });
  presence(p3[2], { questionIndex: 1, currentAttempts: 3, questionStates: 'cx....', answeredCount: 2, correctCount: 1, accuracy: 50 });
  presence(p3[3], { assignmentId: 'a-yesterday', assignmentTitle: 'Systems of Equations — Lesson 2: Substitution', activityRole: 'practice', questionIndex: 3 });

  // ---------------------------------------------------------------- export history
  // Build the snapshots the REAL projection would have written, so the history
  // is exactly what production stores.
  const projected = projectGradeTransferUnits({
    classes,
    assignments,
    students,
    teacherEmail: TEACHER_EMAIL,
    snapshots: [],
  }).units;
  const snapshotFor = (unit, createdMs, confirmedMs = null) => {
    (unit.sectionUnits?.length ? unit.sectionUnits : [unit]).filter((part) => part.rows.length).forEach((part) => {
      const snapshot = createExportSnapshot({ unit: part, transferId: transferSnapshotId(part), teacherUid: 'harness-teacher-uid', teacherEmail: TEACHER_EMAIL, packageId: `package_seed_${createdMs}` });
      fixture[`gradeTransferSnapshots/${snapshot.transferId}`] = {
        ...snapshot,
        sectionKey: snapshot.sectionKey || null,
        createdAt: Timestamp.fromMillis(createdMs),
        ...(confirmedMs ? { uploadConfirmedAt: Timestamp.fromMillis(confirmedMs), uploadConfirmedByEmail: TEACHER_EMAIL } : {}),
      };
    });
  };
  const unitOf = (classId, assignmentId) => projected.find((unit) => unit.classId === classId && unit.assignmentId === assignmentId);
  snapshotFor(unitOf('c-alg2-p3', 'a-lastweek'), now - 2 * DAY); // "Monday" — exported, never marked uploaded
  snapshotFor(unitOf('c-alg2-p3', 'a-mp1'), now - 27 * DAY, now - 27 * DAY + 3600_000); // exported and uploaded

  // "Tuesday": one student finished a missed Classwork question after the export.
  const changed = fixture[`grades/${p3[2].id}`];
  changed.gradesByAssignment['a-lastweek'] = { ...changed.gradesByAssignment['a-lastweek'], 2: correct };

  return fixture;
};
