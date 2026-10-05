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
import { addRecoveryHoldScenario } from './recoveryFixture.js';
import { projectGradeTransferUnits } from '../../../src/platform/gradeTransfer/gradeTransferProjection.js';
import { createExportSnapshot, transferSnapshotId } from '../../../src/platform/gradeTransfer/gradeTransferModel.js';
import { buildRevisionDocument, buildSupportProjection, normalizeSupportRevisionInput } from '../../../functions/shared/supportProfileModel.mjs';
import {
  buildServiceLogEntry, buildStaffEvidenceEvent, buildStudentEvidenceEvent, engagementDocId, epochMinuteOf, utcDayOf,
} from '../../../functions/shared/supportEvidenceModel.mjs';
import { WORKSPACE_DRAFT_SCHEMA_VERSION, workspaceDraftDocumentId } from '../../../functions/shared/workspaceDraftSchema.mjs';
import {
  OVERRIDE_MIGRATION_ID,
  OVERRIDE_STORAGE_FLAG,
  PLATFORM_MIGRATIONS_COLLECTION,
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  buildOverrideEvent,
  buildStudentOverrideRecord,
  overrideAuthorizationContext,
  overrideEventId,
  studentAssignmentOverrideId,
} from '../../../functions/shared/studentAssignmentOverrides.mjs';
import { LMR_BRIDGE_QUESTION, LMR_WARMUP_QUESTIONS } from './lmrWarmupFixture.js';

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

// Each question carries its own standards metadata, as V5 lessons do (the
// Student Case Review reads skills from it, never from a title).
const ONE_VARIABLE = { primary: ['A.5A'] };
const SYSTEMS = { primary: ['A.5C'] };

// `?questions=real`: the same lesson shape with question types the student
// runtime actually renders (math fields, a multi-part answer, a system, an
// ordered pair), for the endurance journeys that type and submit. The default stays
// `freeResponse`, which the teacher journeys never open.
const realLessonSections = (id) => ([
  { id: `${id}-wu`, role: 'warmup', title: 'Warm-Up', questions: [{ questionId: `${id}-w1`, activityRole: 'warmup', type: 'literal', prompt: 'Solve 2y = 10 for y.', solveFor: 'y', acceptedAnswers: ['5'] }] },
  { id: `${id}-cw`, role: 'classwork', title: 'Classwork', questions: [
    { questionId: `${id}-c1`, activityRole: 'classwork', type: 'multiAnswer', prompt: 'Write 6/8 in lowest terms.', answerFields: [{ id: 'f', label: 'Fraction', answer: '3/4' }] },
    { questionId: `${id}-c2`, activityRole: 'classwork', type: 'multiAnswer', prompt: 'A line passes through (0, 4) and (3, 2).', answerFields: [{ id: 'm', label: 'Slope', answer: '-2/3' }, { id: 'b', label: 'y-intercept', answer: '4' }] },
  ] },
  { id: `${id}-pr`, role: 'practice', title: 'Practice', questions: [
    { questionId: `${id}-p1`, activityRole: 'practice', type: 'system', prompt: 'Solve the system x + y = 5, x − y = 1.', solution: { x: 3, y: 2 }, equationsLatex: ['x+y=5', 'x-y=1'] },
    { questionId: `${id}-p2`, activityRole: 'practice', type: 'orderedPair', prompt: 'Where do y = x + 1 and y = 3 meet?', answer: '(2,3)' },
  ] },
  { id: `${id}-dol`, role: 'dol', title: 'DOL', questions: [{ questionId: `${id}-d1`, activityRole: 'dol', type: 'literal', prompt: 'Solve 5x − 5 = 20 for x.', solveFor: 'x', acceptedAnswers: ['5'] }] },
]);

// `?questions=lmr`: today's Warm-Up is the production lmr-wu-1 / lmr-wu-2 card
// sorts (family-backed), then a Linear Multiple Representations board, so the
// Warm-Up close / reopen journeys run on the questions of the incident.
const lmrLessonSections = (id) => {
  const real = realLessonSections(id);
  return [
    {
      id: `${id}-wu`, role: 'warmup', title: 'Warm-Up', feedbackMode: 'immediate', hintsAllowed: true, attemptsAllowed: 3,
      questions: [...LMR_WARMUP_QUESTIONS, LMR_BRIDGE_QUESTION].map((question) => ({ ...JSON.parse(JSON.stringify(question)), activityRole: 'warmup' })),
    },
    ...real.slice(1),
  ];
};

const lessonSections = (id) => ([
  { id: `${id}-wu`, role: 'warmup', title: 'Warm-Up', questions: [{ questionId: `${id}-w1`, activityRole: 'warmup', type: 'freeResponse', prompt: 'Solve 2x + 3 = 11.', expected: '4', standards: ONE_VARIABLE }] },
  { id: `${id}-cw`, role: 'classwork', title: 'Classwork', questions: [
    { questionId: `${id}-c1`, activityRole: 'classwork', type: 'freeResponse', prompt: 'Solve the system x + y = 5, x − y = 1. What is x?', expected: '3', standards: SYSTEMS },
    { questionId: `${id}-c2`, activityRole: 'classwork', type: 'freeResponse', prompt: 'What is y?', expected: '2', standards: SYSTEMS },
  ] },
  { id: `${id}-pr`, role: 'practice', title: 'Practice', questions: [
    { questionId: `${id}-p1`, activityRole: 'practice', type: 'freeResponse', prompt: 'Solve 3x = 12.', expected: '4', standards: ONE_VARIABLE },
    { questionId: `${id}-p2`, activityRole: 'practice', type: 'freeResponse', prompt: 'Solve x/2 = 5.', expected: '10', standards: ONE_VARIABLE },
  ] },
  { id: `${id}-dol`, role: 'dol', title: 'DOL', questions: [{ questionId: `${id}-d1`, activityRole: 'dol', type: 'freeResponse', prompt: 'Solve 5x − 5 = 20.', expected: '5', standards: ONE_VARIABLE }] },
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

/*
 * STUDENT IDENTITY EDGE CASES — invented names only. The shapes legacy roster
 * records really have (see functions/shared/studentIdentity.mjs):
 *   910090  Classroom-linked, created nameless: googleName is the ONLY name
 *   910091  no name field at all — the teacher must see "Name unavailable"
 *   910092  displayName equal to its own id (an old writer's fallback)
 *   910093  two different students who share one full name; they must stay
 *   910094  two tiles/rows, never merged
 * All in the Lab section of Period 3 (in session), working on today's lesson.
 */
export const IDENTITY_EDGE_STUDENTS = Object.freeze([
  { id: '910090', names: { googleName: 'Rowan Exampleton' } },
  { id: '910091', names: {} },
  { id: '910092', names: { displayName: '910092' } },
  { id: '910093', names: { firstName: 'Juniper', lastName: 'Samplewood', displayName: 'Juniper Samplewood' } },
  { id: '910094', names: { firstName: 'Juniper', lastName: 'Samplewood', displayName: 'Juniper Samplewood' } },
]);
export const IDENTITY_EDGE_IDS = IDENTITY_EDGE_STUDENTS.map((entry) => entry.id);
// The name studentNameJourneys.mjs adds for 910091 through Sign-in Access.
export const IDENTITY_NAME_TO_ADD = Object.freeze({ firstName: 'Ellery', lastName: 'Mockingworth' });

export const buildTeacherWorkflowFixture = ({ now = Date.now(), Timestamp, params = null } = {}) => {
  const questionSet = params?.get?.('questions');
  const sectionsFor = questionSet === 'real' ? realLessonSections : questionSet === 'lmr' ? lmrLessonSections : lessonSections;
  // `?p3StartMin=<n>`: Period 3 began n minutes ago (default 40). Under 10, the
  // Warm-Up is still inside its default ten-minute window.
  const p3StartMin = Number(params?.get?.('p3StartMin'));
  const p3StartMs = now - (Number.isFinite(p3StartMin) && p3StartMin >= 0 ? p3StartMin : 40) * 60_000;
  const todayKey = dateKey(now);
  const yesterday = previousSchoolDay(now);
  const fixture = {};

  // ---------------------------------------------------------------- schedule
  const clampStart = (ms) => (sameDay(ms, now) ? ms : new Date(new Date(now).setHours(0, 5, 0, 0)).getTime());
  const clampEnd = (ms) => (sameDay(ms, now) ? ms : new Date(new Date(now).setHours(23, 55, 0, 0)).getTime());
  const todayPeriods = {
    'Period 3': { enabled: true, start: hhmm(clampStart(p3StartMs)), end: hhmm(clampEnd(now + 50 * 60_000)) },
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
    sections: sectionsFor(id),
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
  // Identity edge cases (studentNameJourneys.mjs), pushed AFTER every serial
  // student so no existing id or p3[] index moves. All invented.
  IDENTITY_EDGE_STUDENTS.forEach(({ id, names }) => {
    students.push({
      id,
      ...names,
      classId: 'c-lab-p3',
      classPeriod: byId['c-lab-p3'].period,
      assignedTeacherEmail: TEACHER_EMAIL,
      status: 'active',
      profile: {},
      gradesByAssignment: {},
      assignmentActivity: {},
    });
  });
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
  // The identity edge students are working in the Lab section, so each one is
  // a Live Class tile. Presence carries no name: the tile must take it from the roster.
  students.filter((student) => IDENTITY_EDGE_IDS.includes(student.id)).forEach((student) => presence(student, {
    questionIndex: 0, sectionQuestionIndex: 0, questionStates: '......', answeredCount: 0, correctCount: 0, accuracy: null,
  }));

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

  addSupportEvidence({ fixture, now, Timestamp, supported: p3[1], legacy: p3[4] });
  addCaseReviewEvidence({ fixture, now, Timestamp, student: p3[1] });
  // Opt-in (`&reduced=1`) so every other journey sees the school unchanged.
  if (params?.get?.('reduced') === '1') addReducedWorkloadScenario({ fixture, now, Timestamp, classRecord: byId['c-alg1-p5'] });
  if (params?.get?.('eb') === '1') addLanguageSupportScenario({ fixture, now, Timestamp, classRecord: byId['c-alg1-p5'] });
  // Opt-in (`&recovery=p0`): Recoveries MathMaster could not fully grade
  // (recoveryHoldJourneys.mjs), built by the real shared server code.
  if (params?.get?.('recovery') === 'p0') addRecoveryHoldScenario({ fixture, now, teacherEmail: TEACHER_EMAIL });
  const controls = params?.get?.('controls');
  if (controls === 'mirror' || controls === 'retired') addPrivateControlsScenario({ fixture, now, mode: controls, classRecord: byId['c-alg2-p3'] });
  return fixture;
};

/*
 * STUDENTS' PRIVATE ASSIGNMENT CONTROLS (privateControlsJourneys.mjs) — synthetic.
 *
 * `?controls=mirror`: the private records exist and the shared lessons still
 * mirror every student's controls, as during Stages 1-3 (a previous-release
 * screen reads them there). `?controls=retired`: Stage 4 — retired and
 * stripped; the private records alone carry the controls.
 *
 *   910001  an attendance extension on last week's lesson, which is closed
 *           for the class: open again for them alone, to nine days out (the
 *           dashboard says "Your last day to turn in"); and a reopen of
 *           today's lesson
 *   910003  two extra DOL attempts of their own on today's lesson (and the
 *           recovery-log entry naming them, mirror only)
 *   910006  excused from today's lesson
 *   910004  nothing: the next student on the shared Chromebook
 *
 * The private records are built with the server's own record builder, and
 * each has its staff-only history entry.
 */
export const PRIVATE_CONTROLS = Object.freeze({ extended: '910001', granted: '910003', excused: '910006', plain: '910004' });
const addPrivateControlsScenario = ({ fixture, now, mode, classRecord }) => {
  const at = new Date(now - DAY).toISOString();
  const extendedTo = endOfDay(now + 9 * DAY);
  const extension = { dateKey: dateKey(now + 9 * DAY), grantedAt: now - DAY };
  const grant = { extraAttempts: 2, changedAt: at, changedBy: 'harness-teacher-uid', reason: 'teacher-dol-recovery' };
  const controls = [
    [PRIVATE_CONTROLS.extended, 'a-lastweek', { lateDueAt: extendedTo, extension }],
    [PRIVATE_CONTROLS.extended, 'a-today', { reopened: true }],
    [PRIVATE_CONTROLS.granted, 'a-today', { dolExtraAttempts: 2, dolAttemptGrant: grant }],
    [PRIVATE_CONTROLS.excused, 'a-today', { excused: true }],
  ];
  controls.forEach(([studentId, assignmentId, override]) => {
    const authorization = overrideAuthorizationContext({
      studentId,
      classRecord: { classId: classRecord.classId, teacherOfRecord: TEACHER_EMAIL },
      student: { classId: classRecord.classId, assignedTeacherEmail: TEACHER_EMAIL },
    });
    fixture[`${STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION}/${studentAssignmentOverrideId(studentId, assignmentId)}`] = buildStudentOverrideRecord({
      studentId, assignmentId, override, authorization, revision: 1, source: 'harness', updatedBy: 'teacher',
    });
    fixture[`grades/${studentId}/assignmentOverrideEvents/${overrideEventId(assignmentId, 1)}`] = {
      ...buildOverrideEvent({
        kind: override.dolExtraAttempts ? 'dolAttempts' : override.extension ? 'attendanceExtension' : override.excused ? 'excused' : 'reopened',
        studentId, assignmentId, authorization, before: null, after: override, revision: 1,
        actorEmail: TEACHER_EMAIL, actorUid: 'harness-teacher-uid', actorRole: 'teacher', source: 'callable',
      }),
      at,
    };
  });
  fixture[`platformFlags/${OVERRIDE_STORAGE_FLAG}`] = { sharedRetired: mode === 'retired' };
  fixture[`${PLATFORM_MIGRATIONS_COLLECTION}/${OVERRIDE_MIGRATION_ID}`] = {};
  if (mode === 'retired') return;
  // The mirror: each student's controls on the shared lessons, in the forms
  // previous releases wrote them.
  const today = fixture['assignments/a-today'];
  fixture['assignments/a-today'] = {
    ...today,
    studentOverrides: { [PRIVATE_CONTROLS.excused]: { excused: true } },
    excusedStudentIds: [PRIVATE_CONTROLS.excused],
    reopenedStudentIds: [PRIVATE_CONTROLS.extended],
    dol: {
      ...today.dol,
      attemptGrantsByStudentId: { [PRIVATE_CONTROLS.granted]: grant },
      recoveryAudit: [{
        id: `grantAttempts:students:${PRIVATE_CONTROLS.granted}:${at}`, action: 'grantAttempts', section: 'dol',
        scope: { type: 'students', studentIds: [PRIVATE_CONTROLS.granted], classId: classRecord.classId },
        previous: { extraAttemptsByStudent: { [PRIVATE_CONTROLS.granted]: 0 } }, next: { extraAttemptsByStudent: { [PRIVATE_CONTROLS.granted]: 2 } },
        teacherId: 'harness-teacher-uid', reason: 'teacher-dol-recovery', at,
      }],
    },
  };
  fixture['assignments/a-lastweek'] = {
    ...fixture['assignments/a-lastweek'],
    studentOverrides: { [PRIVATE_CONTROLS.extended]: { lateDueAt: extendedTo, extension } },
  };
};

/*
 * LANGUAGE SUPPORTS — synthetic (supportEvidenceJourneys.mjs S3/T8).
 *
 * `910960` ("Example, Sam") has one versioned revision: language Spanish
 * (translation follows from it), Vocabulary, Break it down, Help me say it,
 * Read aloud — and 25% fewer items, so both supports run together. `a-eb` is
 * four Classwork items on one TEKS whose directions the built-in Spanish pack
 * translates fully, so the student is assigned three.
 */
export const LANGUAGE_STUDENT_ID = '910960';
export const LANGUAGE_ASSIGNMENT_ID = 'a-eb';
const addLanguageSupportScenario = ({ fixture, now, Timestamp, classRecord }) => {
  fixture[`assignments/${LANGUAGE_ASSIGNMENT_ID}`] = {
    title: 'One-Variable Equations — Explain Your Thinking',
    schemaVersion: 5,
    assignmentType: 'practice',
    contentVersion: 1,
    assignedClassIds: [classRecord.classId],
    assignedClassPeriods: [classRecord.period],
    releaseAt: startOfDay(now),
    dueAt: endOfDay(now + 2 * DAY),
    lateDueAt: endOfDay(now + 6 * DAY),
    gradingPeriod: { id: 'mp2', label: '2nd Marking Period', order: 2 },
    createdAt: new Date(now - DAY).toISOString(),
    sections: [{
      id: 'eb-cw', role: 'classwork', title: 'Classwork',
      questions: [2, 3, 4, 5].map((coefficient, index) => ({
        questionId: `eb-c${index + 1}`,
        activityRole: 'classwork',
        type: 'literal',
        prompt: `Solve ${coefficient}x = ${2 * coefficient} for x. Explain how you know.`,
        solveFor: 'x',
        acceptedAnswers: ['2'],
        standards: ONE_VARIABLE,
      })),
    }],
  };
  const revision = normalizeSupportRevisionInput({
    effectiveStart: dateKey(now - 20 * DAY),
    sourceLabel: 'Language support plan (synthetic)',
    translationLanguage: 'es',
    accommodations: [
      { id: 'glossary-lookup' }, { id: 'chunked-directions' }, { id: 'sentence-frames' }, { id: 'text-to-speech' },
      { id: 'reduced-item-count-same-rigor', params: { itemReduction: { mode: 'percent', value: 25 } } },
    ],
  }).revision;
  const document = {
    ...buildRevisionDocument({ revision, studentId: LANGUAGE_STUDENT_ID, classId: classRecord.classId, revisionNumber: 1, createdByEmail: TEACHER_EMAIL }),
    createdAt: Timestamp.fromMillis(now - 20 * DAY),
  };
  fixture[`grades/${LANGUAGE_STUDENT_ID}/supportProfileRevisions/rev-eb-1`] = document;
  fixture[`grades/${LANGUAGE_STUDENT_ID}`] = {
    firstName: 'Sam',
    lastName: 'Example',
    displayName: 'Sam Example',
    classId: classRecord.classId,
    classPeriod: classRecord.period,
    assignedTeacherEmail: TEACHER_EMAIL,
    status: 'active',
    profile: buildSupportProjection({
      revisions: [{ ...document, id: 'rev-eb-1', revisionId: 'rev-eb-1', createdAtMs: now - 20 * DAY }],
      todayKey: dateKey(now),
      updatedAt: new Date(now - 20 * DAY).toISOString(),
    }),
    gradesByAssignment: {},
    assignmentActivity: {},
  };
};

/*
 * REDUCED NUMBER OF ITEMS — synthetic (supportEvidenceJourneys.mjs S2/T7).
 *
 * `910950` ("Sample, Rory") has a versioned profile with the reduced item
 * count set to 25%, and `a-reduced` is a 12-item practice set on one TEKS, so
 * the student is assigned 9 and three are omitted. A classmate keeps all 12.
 */
export const REDUCED_STUDENT_ID = '910950';
export const REDUCED_ASSIGNMENT_ID = 'a-reduced';
const addReducedWorkloadScenario = ({ fixture, now, Timestamp, classRecord }) => {
  fixture[`assignments/${REDUCED_ASSIGNMENT_ID}`] = {
    title: 'Two-Step Equations — Practice Set',
    schemaVersion: 5,
    assignmentType: 'practice',
    contentVersion: 1,
    assignedClassIds: [classRecord.classId],
    assignedClassPeriods: [classRecord.period],
    releaseAt: startOfDay(now),
    dueAt: endOfDay(now + 2 * DAY),
    lateDueAt: endOfDay(now + 6 * DAY),
    gradingPeriod: { id: 'mp2', label: '2nd Marking Period', order: 2 },
    createdAt: new Date(now - DAY).toISOString(),
    sections: [{
      id: 'reduced-pr', role: 'practice', title: 'Practice',
      questions: Array.from({ length: 12 }, (_, index) => ({
        questionId: `reduced-p${index + 1}`,
        activityRole: 'practice',
        type: 'literal',
        prompt: `Item ${index + 1}: solve ${index + 2}x = ${2 * (index + 2)} for x.`,
        solveFor: 'x',
        acceptedAnswers: ['2'],
        standards: ONE_VARIABLE,
      })),
    }],
  };
  const revision = normalizeSupportRevisionInput({
    effectiveStart: dateKey(now - 20 * DAY),
    sourceLabel: 'IEP annual review (synthetic)',
    accommodations: [{ id: 'reduced-item-count-same-rigor', params: { itemReduction: { mode: 'percent', value: 25 } } }],
  }).revision;
  const document = {
    ...buildRevisionDocument({ revision, studentId: REDUCED_STUDENT_ID, classId: classRecord.classId, revisionNumber: 1, createdByEmail: TEACHER_EMAIL }),
    createdAt: Timestamp.fromMillis(now - 20 * DAY),
  };
  fixture[`grades/${REDUCED_STUDENT_ID}/supportProfileRevisions/rev-reduced-1`] = document;
  fixture[`grades/${REDUCED_STUDENT_ID}`] = {
    firstName: 'Rory',
    lastName: 'Sample',
    displayName: 'Rory Sample',
    classId: classRecord.classId,
    classPeriod: classRecord.period,
    assignedTeacherEmail: TEACHER_EMAIL,
    status: 'active',
    profile: buildSupportProjection({
      revisions: [{ ...document, id: 'rev-reduced-1', revisionId: 'rev-reduced-1', createdAtMs: now - 20 * DAY }],
      todayKey: dateKey(now),
      updatedAt: new Date(now - 20 * DAY).toISOString(),
    }),
    gradesByAssignment: {},
    assignmentActivity: {},
  };
};

/*
 * IEP / STUDENT SUPPORT EVIDENCE — synthetic.
 *
 * `supported` has a versioned profile (two dated revisions; extra time up to
 * the next school day, read aloud, calculator, a teacher check for
 * understanding, one modification, 100 min/week of inclusion support) and a
 * little of every kind of evidence: tools made available and used, a teacher
 * record, a mis-click withdrawn by a correction, server-timed active minutes,
 * and service minutes. `legacy` has a pre-versioning flat profile and graded
 * work with no timing — the "0 min" case the old report showed.
 */
const addSupportEvidence = ({ fixture, now, Timestamp, supported, legacy }) => {
  const at = (ms) => Timestamp.fromMillis(ms);
  const base = `grades/${supported.id}`;
  const revisionInput = (effectiveStart, withExtraTime) => normalizeSupportRevisionInput({
    effectiveStart,
    sourceLabel: withExtraTime ? 'IEP amendment (synthetic)' : 'IEP annual review (synthetic)',
    sourceNote: 'Synthetic harness record.',
    inclusionStatus: false,
    accommodations: [
      { id: 'text-to-speech' },
      { id: 'calculator' },
      { id: 'check-for-understanding' },
      ...(withExtraTime ? [{ id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 1 } } }] : []),
    ],
    modifications: [{ id: 'reduce-complexity' }],
    serviceExpectations: [{ serviceType: 'inclusion-support', minutesPerWeek: 100 }],
  }).revision;
  const r1Recorded = now - 60 * DAY;
  const r2Recorded = now - 12 * DAY;
  const r1 = { ...buildRevisionDocument({ revision: revisionInput(dateKey(now - 60 * DAY), false), studentId: supported.id, classId: supported.classId, revisionNumber: 1, createdByEmail: TEACHER_EMAIL }), createdAt: at(r1Recorded) };
  const r2 = { ...buildRevisionDocument({ revision: revisionInput(dateKey(now - 12 * DAY), true), studentId: supported.id, classId: supported.classId, revisionNumber: 2, supersedesRevisionId: 'rev-1', createdByEmail: TEACHER_EMAIL }), createdAt: at(r2Recorded) };
  fixture[`${base}/supportProfileRevisions/rev-1`] = r1;
  fixture[`${base}/supportProfileRevisions/rev-2`] = r2;
  fixture[base].profile = buildSupportProjection({
    revisions: [{ ...r1, id: 'rev-1', revisionId: 'rev-1', createdAtMs: r1Recorded }, { ...r2, id: 'rev-2', revisionId: 'rev-2', createdAtMs: r2Recorded }],
    todayKey: dateKey(now),
    updatedAt: new Date(r2Recorded).toISOString(),
  });

  // Last week's lesson: done under revision 2, with the evidence to show it.
  const lessonDay = now - 8 * DAY;
  const student = (supportId, eventType, offsetMinutes, extra = {}) => ({
    ...buildStudentEvidenceEvent({ studentId: supported.id, classId: supported.classId, assignmentId: 'a-lastweek', activityRole: 'classwork', questionIndex: 1, supportId, eventType, profileRevisionId: 'rev-2', assignedTeacherEmail: TEACHER_EMAIL, ...extra }).payload,
    occurredAt: at(lessonDay + offsetMinutes * 60_000),
  });
  const staff = (supportId, offsetMinutes, extra = {}) => ({
    ...buildStaffEvidenceEvent({ studentId: supported.id, classId: supported.classId, assignmentId: 'a-lastweek', supportId, actorEmail: TEACHER_EMAIL, profileRevisionId: 'rev-2', ...extra }).payload,
    occurredAt: at(lessonDay + offsetMinutes * 60_000),
  });
  fixture[`${base}/supportEvidence/avail__a-lastweek__rev-2__text-to-speech`] = student('text-to-speech', 'available', 1);
  fixture[`${base}/supportEvidence/avail__a-lastweek__rev-2__calculator`] = student('calculator', 'available', 1);
  fixture[`${base}/supportEvidence/avail__a-lastweek__rev-2__extra-time`] = student('extra-time', 'provided', 1);
  fixture[`${base}/supportEvidence/ev-tts-1`] = student('text-to-speech', 'used', 4);
  fixture[`${base}/supportEvidence/ev-tts-2`] = student('text-to-speech', 'used', 9, { questionIndex: 2 });
  fixture[`${base}/supportEvidence/ev-calc-1`] = student('calculator', 'used', 12);
  fixture[`${base}/supportEvidence/ev-check-1`] = { ...staff('check-for-understanding', 15), note: 'Restated the elimination step; student explained it back.', noteAddedAt: at(lessonDay + 17 * 60_000) };
  fixture[`${base}/supportEvidence/ev-misclick`] = staff('on-task-prompt', 20);
  fixture[`${base}/supportEvidence/ev-misclick-fix`] = staff('on-task-prompt', 21, { voidsEventId: 'ev-misclick', note: 'Entered in error' });
  const firstMinute = epochMinuteOf(lessonDay + 2 * 60_000);
  fixture[`${base}/engagementMinutes/${engagementDocId('a-lastweek', utcDayOf(lessonDay + 2 * 60_000))}`] = {
    schemaVersion: 1, studentId: supported.id, assignmentId: 'a-lastweek', utcDay: utcDayOf(lessonDay + 2 * 60_000),
    minutes: Array.from({ length: 26 }, (_, index) => firstMinute + index), lastRecordedAt: at(lessonDay + 30 * 60_000),
  };
  const service = (offsetDays, minutes, extra = {}) => ({
    ...buildServiceLogEntry({ studentId: supported.id, classId: supported.classId, dateKey: dateKey(now - offsetDays * DAY), minutes, serviceType: 'inclusion-support', providerRole: 'inclusion-teacher', providerLabel: 'Inclusion teacher (synthetic)', topic: 'Systems of equations', createdByEmail: TEACHER_EMAIL, ...extra }).payload,
    createdAt: at(now - offsetDays * DAY),
  });
  fixture[`${base}/supportServiceLog/svc-1`] = service(8, 45, { assignmentId: 'a-lastweek' });
  fixture[`${base}/supportServiceLog/svc-2`] = service(6, 40);
  fixture[`${base}/supportServiceLog/svc-3`] = service(1, 30);

  // A pre-versioning profile with graded work and no timing recorded.
  fixture[`grades/${legacy.id}`].profile = { inclusionStatus: true, accommodations: ['text-to-speech', 'extra-time'], modifications: [], translationLanguage: null };
  fixture[`grades/${legacy.id}`].assignmentActivity = { 'a-lastweek': { totalTimeSeconds: 0, onTimeSeconds: 0, lateSeconds: 0 } };
};

/*
 * STUDENT CASE REVIEW — synthetic per-attempt history for the supported
 * student (`910002`), as the server records it: one evidence event per graded
 * attempt on last week's and yesterday's lessons (retries that end correct, a
 * question whose attempts ran out), Practice Mode after a lesson closed, an
 * answer that arrived after the final cutoff and was not counted, and
 * class-session summaries. The question records carry the same attempts with
 * the same statuses and credit, so every grade — and the export history built
 * from them above — is unchanged.
 */
const QUESTIONS = [
  { suffix: 'w1', role: 'warmup', code: 'A.5A' },
  { suffix: 'c1', role: 'classwork', code: 'A.5C' },
  { suffix: 'c2', role: 'classwork', code: 'A.5C' },
  { suffix: 'p1', role: 'practice', code: 'A.5A' },
  { suffix: 'p2', role: 'practice', code: 'A.5A' },
  { suffix: 'd1', role: 'dol', code: 'A.5A' },
];
const addCaseReviewEvidence = ({ fixture, now, Timestamp, student }) => {
  const at = (ms) => Timestamp.fromMillis(ms);
  const base = `grades/${student.id}`;
  const lessons = [
    // Attempt results per question: true = correct. Same outcomes as the 'solid' tracker.
    { assignmentId: 'a-lastweek', startMs: now - 8 * DAY + 2 * 60_000, plan: [[true], [true], [false, false, false], [false, true], [true], [true]] },
    { assignmentId: 'a-yesterday', startMs: previousSchoolDay(now) - 45 * 60_000, plan: [[true], [false, false, true], [false, false, false], [true], [true], [true]] },
  ];
  // A Section Recovery item last week, graded wrong by the server, whose
  // answer the substitution classifier named — stored the way the Recovery
  // callable stores one (functions/shared/misconceptionEvidenceSites.mjs):
  // server-only, codes and provenance, no score. With yesterday's question it
  // makes the pattern RECURRING. Beside it, a record a client forged (no
  // server provenance), which the case review must not count.
  const recoveryFinding = (source) => ({
    registryVersion: 1, source, classifier: 'family:systems.substitution@1', classifierVersion: 1,
    findings: [{ code: 'system-point-on-one-line-only', codeVersion: 1, parts: ['system-x', 'system-y'] }],
  });
  [['case-recovery-r1', 'server-grading', 'r1'], ['case-recovery-forged', 'browser', 'r2']].forEach(([key, source, itemId]) => {
    fixture[`${base}/misconceptionEvidence/${key}`] = {
      schemaVersion: 1,
      eventKey: key,
      studentId: student.id,
      occurredAt: at(now - 7 * DAY),
      source: { kind: 'sectionRecovery', assignmentId: 'a-lastweek', section: 'dol', opportunity: 1, itemId, storageIndex: 5 },
      questionSnapshot: { questionId: 'a-lastweek-d1', familyId: 'systems.substitution', familyVersion: 1, instanceFingerprint: `fixture:${key}` },
      performance: { misconceptionCodes: ['system-point-on-one-line-only'], misconceptionEvidence: recoveryFinding(source) },
    };
  });
  lessons.forEach(({ assignmentId, startMs, plan }) => {
    let minute = 1;
    const tracker = { ...fixture[base].gradesByAssignment[assignmentId] };
    plan.forEach((results, questionIndex) => {
      const { suffix, role, code } = QUESTIONS[questionIndex];
      // One question carries a misconception code, stored the way the server
      // stores one (functions/shared/misconceptionCodes.mjs): on that attempt's
      // evidence event, with the classifier's provenance. The question record
      // also carries a code on its part, as a modified client could write it —
      // the case review must ignore that one and name exactly the server's.
      const misconceptionCode = assignmentId === 'a-yesterday' && questionIndex === 2 ? 'system-point-on-one-line-only' : null;
      let lastMs = null;
      results.forEach((isCorrect, attemptIndex) => {
        lastMs = startMs + minute * 60_000;
        minute += 2;
        const attemptNumber = attemptIndex + 1;
        fixture[`${base}/evidenceEvents/case-${assignmentId}-${questionIndex}-${attemptNumber}`] = {
          schemaVersion: 1,
          eventKey: `case-${assignmentId}-${questionIndex}-${attemptNumber}`,
          studentId: student.id,
          occurredAt: at(lastMs),
          alignmentKeys: [`texas:${code}`],
          questionSnapshot: { questionId: `${assignmentId}-${suffix}`, questionType: 'freeResponse', variantIndex: 0 },
          source: { kind: 'assignment', assignmentId, activityRole: role, questionIndex },
          performance: {
            attemptNumber, isCorrect, partialCredit: isCorrect ? 100 : 0, status: isCorrect ? 'correct' : (attemptNumber === results.length ? 'expired' : 'attempted'),
            ...(misconceptionCode && attemptNumber === results.length ? {
              misconceptionCodes: [misconceptionCode],
              misconceptionEvidence: {
                registryVersion: 1,
                source: 'server-grading',
                classifier: 'family:systems.substitution@1',
                classifierVersion: 1,
                findings: [{ code: misconceptionCode, codeVersion: 1, parts: ['system-x', 'system-y'] }],
              },
            } : {}),
          },
          supportUsage: { calculatorUsed: assignmentId === 'a-lastweek' && questionIndex === 3 },
        };
      });
      const iso = new Date(lastMs).toISOString();
      tracker[questionIndex] = {
        ...tracker[questionIndex],
        attemptCount: results.length,
        totalAttempts: results.length,
        variantIndex: 0,
        lastAttemptAt: iso,
        academicOccurredAt: iso,
        submissionOrigin: 'server-ingestion',
        ...(misconceptionCode ? {
          partGrades: [{ id: 'system', label: 'Solution of the system', isComplete: true, isCorrect: false, graded: true, weight: 1, credit: 0, response: '', misconceptionCode: 'ordered-pair-reversed' }],
        } : {}),
      };
    });
    fixture[base].gradesByAssignment = { ...fixture[base].gradesByAssignment, [assignmentId]: tracker };
    fixture[`studentSessionSummaries/case-${student.id}-${assignmentId}`] = {
      studentId: student.id,
      classId: student.classId,
      assignmentId,
      assignmentTitle: fixture[`assignments/${assignmentId}`]?.title || assignmentId,
      startedAt: startMs,
      endedAt: startMs + (minute + 2) * 60_000,
      activeSeconds: minute * 60,
      answered: plan.length,
      correct: plan.filter((results) => results[results.length - 1]).length,
      accuracy: Math.round((100 * plan.filter((results) => results[results.length - 1]).length) / plan.length),
      focusLossCount: 0,
      authorizedTeacherEmails: [TEACHER_EMAIL],
      createdAt: at(startMs + (minute + 2) * 60_000),
    };
  });

  // Practice Mode on the closed 1st-marking-period lesson (device clock), and
  // one answer that arrived after its final cutoff and was not counted.
  const practiceMs = now - 26 * DAY;
  fixture[`studentWorkspaceDrafts/${workspaceDraftDocumentId({ studentId: student.id, assignmentId: 'a-mp1' })}`] = {
    schemaVersion: WORKSPACE_DRAFT_SCHEMA_VERSION,
    studentId: student.id,
    assignmentId: 'a-mp1',
    entries: {},
    practice: {
      2: { status: 'correct', totalAttempts: 2, lastAttemptAt: new Date(practiceMs).toISOString() },
      5: { status: 'attempted', totalAttempts: 1, lastAttemptAt: new Date(practiceMs + 4 * 60_000).toISOString() },
    },
    practiceUpdatedAt: at(practiceMs + 5 * 60_000),
    updatedAt: at(practiceMs + 5 * 60_000),
  };
  fixture[`studentSubmissionReceipts/case-${student.id}-a-mp1-after-close`] = {
    studentId: student.id,
    assignmentId: 'a-mp1',
    questionIndex: 2,
    disposition: 'not-counted',
    reason: 'assignment-closed-at-capture',
    academicOccurredAt: at(now - 27 * DAY),
    issuedAt: at(now - 27 * DAY),
  };
};
