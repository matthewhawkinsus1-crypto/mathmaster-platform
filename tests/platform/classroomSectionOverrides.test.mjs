// A TEACHER'S GRADE OVERRIDE REACHES THE SPLIT-SECTION CLASSROOM COLUMNS.
//
// Issue #554, item 1. A teacher corrects a grade in MathMaster: credit for one
// answer in the Response Inspector (overrideStudentResponseGrade), or a grade
// for a section or the whole assignment (overrideStudentAssignmentGrade). Each
// writes the override and a Retry. MathMaster's grade changed and the
// whole-assignment Classroom column followed, but syncSectionGradeToClassroom
// graded every question at its automatic score: the Retry woke it, and it sent
// the old Warm-Up, Classwork, Practice or DOL grade to Classroom again, with no
// error. The teacher saw the corrected grade in MathMaster and the old one in
// Classroom.
//
// Each column is now graded with the teacher's overrides by the rules the
// whole-assignment trigger and the browser use (lib/classroomSectionGrade.js),
// for the same Classroom calls and reads an override cost before. The real
// triggers run here against fakes of Firestore and of Google's HTTP layer
// (helpers/sectionPassbackHarness.mjs); the browser's numbers come from its own
// grade projection (src/platform/grading/canonicalGradeProjection.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fakeGoogle,
  passbackFirestore,
  requireFromFunctions,
  writeGrades,
} from './helpers/sectionPassbackHarness.mjs';
import {
  canonicalPresentedAssignmentGrade,
  canonicalPresentedSectionGrade,
} from '../../src/platform/grading/canonicalGradeProjection.js';

const { gradeSyncDocumentId, rosterLinkDocumentId } = requireFromFunctions('./lib/publication.js');
const { assignmentGradeProgress } = requireFromFunctions('./lib/classroomGradeRuntime.js');
const { sectionGradeEvidenceFingerprint } = requireFromFunctions('./lib/classroomSectionGradeReconciliation.js');
const sectionGrade = requireFromFunctions('./lib/classroomSectionGrade.js');
const { gradeInputFingerprint } = requireFromFunctions('./lib/retroactiveAccommodation.js');
const { buildGradeOverride } = await import('../../functions/shared/responseInspector.mjs');
const { splitIntegrityConsequence, SECTION_INTEGRITY_KEY_PREFIX } = await import('../../functions/shared/integrityOverridePrivacy.mjs');
const { workloadContentKey } = await import('../../functions/shared/workloadCorrection.mjs');

const DAY = 86_400_000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const AT = '2026-11-10T15:00:00.000Z';
const STUDENT = 's1';
const COURSE = 'course-1';
const TEACHER = { uid: 't1', name: 'Teacher' };

// Warm-Up w1 (index 0); Classwork c1, c2, c3 (1-3); due in a week.
const lesson = (extra = {}) => ({
  schemaVersion: 5, assignedClassIds: ['c1'], dueAt: iso(7 * DAY),
  sections: [
    { role: 'warmup', questions: [{ id: 'w1' }] },
    { role: 'classwork', questions: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] },
  ],
  ...extra,
});
const sectionLink = (key) => ({
  schemaVersion: 5, assignmentId: 'A1', status: 'published', publicationKind: 'section', sectionKey: key, courseId: COURSE,
  courseworkId: `cw-${key}`, teacherUid: 't1', maxPoints: 100, gradePassbackEnabled: false, sectionGradePassbackEnabled: true,
});
const wholeLink = () => ({
  schemaVersion: 2, assignmentId: 'A1', status: 'published', publicationKind: 'assignment', sectionKey: 'whole', courseId: COURSE,
  courseworkId: 'cw-whole', teacherUid: 't1', maxPoints: 100, gradePassbackEnabled: true,
});
const fixture = ({ assignment = lesson(), sections = ['warmup', 'classwork'], whole = true, grades = {} } = {}) => passbackFirestore({
  assignments: { A1: assignment },
  classroomLinks: {
    ...Object.fromEntries(sections.map((key) => [`pub-${key}`, sectionLink(key)])),
    ...(whole ? { 'pub-whole': wholeLink() } : {}),
  },
  classroomRosterLinks: { [rosterLinkDocumentId(COURSE, STUDENT)]: { googleUserId: 'g-s1' } },
  grades: { [STUDENT]: { classId: 'c1', profile: {}, gradesByAssignment: { A1: {} }, ...grades } },
});
const row = (db, key) => db.data(`classroomGradeSyncs/${gradeSyncDocumentId(`pub-${key}`, STUDENT)}`);
const gradeDoc = (db) => db.data(`grades/${STUDENT}`);

// One answer, as ingestion records it.
const answered = (n, status, { attempts = 1, credit = 0 } = {}) => ({
  status, totalAttempts: attempts, attemptCount: attempts, variantIndex: 0,
  lastSubmissionId: `submit-${n}-${attempts}`, lastAttemptAt: AT, partialCredit: credit, bestPartialCredit: credit,
});
// The Warm-Up answered wrong, out of tries (finished); Classwork c1 right,
// c2 wrong with tries left, c3 not answered.
const WORK = {
  0: answered(0, 'expired', { attempts: 3 }),
  1: answered(1, 'correct'),
  2: answered(2, 'attempted'),
};
const withWork = (work) => (grades) => ({ ...grades, gradesByAssignment: { ...grades.gradesByAssignment, A1: structuredClone(work) } });

// The override the Response Inspector stores, from its own builder.
const correction = (record, score) => buildGradeOverride({
  record, score, reason: 'Equivalent answer accepted by teacher', actor: TEACHER, at: AT, source: 'teacher-override',
}).override;
// What the override callables write: the override and a Retry. Each Retry a
// moment apart: one identical to the last is no change, and the fake answers
// so fast that two in a row can fall in the same millisecond.
let retriesSent = 0;
const retry = (source) => ({ requestedAt: new Date(Date.now() + (retriesSent += 1)).toISOString(), reason: 'manual-retry', source });
const overrideWrite = (overridesFor, { signal = true } = {}) => (grades) => ({
  ...grades,
  teacherGradeOverridesByAssignment: { ...grades.teacherGradeOverridesByAssignment, A1: overridesFor(grades.gradesByAssignment.A1, grades.teacherGradeOverridesByAssignment?.A1 || {}) },
  ...(signal ? { classroomReleaseSignals: { ...grades.classroomReleaseSignals, A1: retry('teacher-grade-override') } } : {}),
});
const creditFor = (index, score) => overrideWrite((tracker, current) => ({ ...current, [index]: correction(tracker[index], score) }));
const bareRetry = (grades) => ({ ...grades, classroomReleaseSignals: { ...grades.classroomReleaseSignals, A1: retry('teacher-retry') } });

// The browser's grade for each column, read from the same grade document.
const browserGrades = (db, assignment, sections = ['warmup', 'classwork']) => {
  const student = gradeDoc(db);
  const subject = { id: 'A1', ...assignment };
  return {
    ...Object.fromEntries(sections.map((key) => [key, canonicalPresentedSectionGrade({ student, assignment: subject, sectionKey: key })])),
    whole: canonicalPresentedAssignmentGrade({ student, assignment: subject }),
  };
};
const classroomGrades = (db, sections = ['warmup', 'classwork'], whole = true) => ({
  ...Object.fromEntries(sections.map((key) => [key, row(db, key)?.grade])),
  ...(whole ? { whole: row(db, 'whole')?.grade } : {}),
});

const started = async (options = {}) => {
  const db = fixture(options);
  const google = fakeGoogle();
  await writeGrades({ db, google, studentId: STUDENT, change: withWork(options.work || WORK), triggers: ['section', 'whole'] });
  google.calls.length = 0;
  return { db, google };
};
const patchesOf = (google, courseWorkId) => google.calls.filter((call) => call.step === 'patch' && call.courseWorkId === courseWorkId).map((call) => call.body);

/* --- the report ------------------------------------------------------------ */

test('full credit on a Warm-Up answer reaches the Warm-Up column, assigned, as MathMaster shows it', async () => {
  const { db, google } = await started();
  assert.equal(row(db, 'warmup').grade, 0, 'the student\'s own answer: wrong, out of tries');
  assert.equal(row(db, 'warmup').stage, 'final-complete');

  await writeGrades({ db, google, studentId: STUDENT, change: creditFor(0, 100), triggers: ['section', 'whole'] });
  assert.deepEqual(patchesOf(google, 'cw-warmup'), [{ draftGrade: 100, assignedGrade: 100 }], 'the teacher\'s grade, not the automatic 0 again');
  const warmup = row(db, 'warmup');
  assert.equal(warmup.grade, 100);
  assert.equal(warmup.status, 'synced');
  assert.equal(warmup.stage, 'final-complete');
  assert.equal(warmup.studentVisible, true);
  assert.equal(gradeDoc(db).classroomSectionSyncStatusByAssignment.A1.warmup.grade, 100, 'the student\'s receipt says what Classroom holds');
  assert.deepEqual(classroomGrades(db), browserGrades(db, lesson()), 'every column is the grade MathMaster shows');
  assert.deepEqual(classroomGrades(db), { warmup: 100, classwork: 33, whole: 50 });
});

test('an override costs what the Retry it comes with cost: the same Classroom calls and reads, the right grade in them', async () => {
  const measure = async (change) => {
    const { db, google } = await started();
    const readsBefore = db.reads.length;
    await writeGrades({ db, google, studentId: STUDENT, change, triggers: ['section', 'whole'] });
    return { calls: google.calls.map((call) => `${call.step} ${call.courseWorkId}`), reads: db.reads.length - readsBefore, db, google };
  };
  const retried = await measure(bareRetry);
  const overridden = await measure(creditFor(0, 100));
  // A teacher's grade change is sent as a Retry is: every column again, the
  // finished Warm-Up already returned so not returned again.
  assert.deepEqual(overridden.calls, retried.calls);
  assert.deepEqual(overridden.calls, ['list cw-classwork', 'patch cw-classwork', 'list cw-warmup', 'patch cw-warmup', 'list cw-whole', 'patch cw-whole']);
  assert.equal(overridden.reads, retried.reads, 'no read more than the Retry alone');
  assert.deepEqual(patchesOf(retried.google, 'cw-warmup'), [{ draftGrade: 0, assignedGrade: 0 }]);
  assert.deepEqual(patchesOf(overridden.google, 'cw-warmup'), [{ draftGrade: 100, assignedGrade: 100 }]);
});

test('an override written without a Retry still reaches the column, and only the column it moved', async () => {
  const { db, google } = await started();
  await writeGrades({ db, google, studentId: STUDENT, change: overrideWrite((tracker) => ({ 0: correction(tracker[0], 100) }), { signal: false }), triggers: ['section', 'whole'] });
  assert.deepEqual(google.steps('cw-warmup'), ['list', 'patch']);
  assert.deepEqual(google.steps('cw-classwork'), [], 'the Classwork column did not move: nothing is sent to it');
  assert.equal(row(db, 'warmup').grade, 100);
});

/* --- the same rules as the whole-assignment column and the browser -------- */

const integrity = (scope) => splitIntegrityConsequence({
  scope, reasonCode: 'academicDishonesty', reasonLabel: 'Unauthorized assistance / cheating', sectionRole: scope === 'section' ? 'classwork' : null,
  participantRole: 'individual', note: '', actor: TEACHER, incidentId: 'incident-1', at: AT,
}).studentOverride;
const RULES = [
  ['no override: the automatic grades', () => ({}), { warmup: 0, classwork: 33, whole: 25 }],
  ['full credit on a finished wrong answer', (t) => ({ 0: correction(t[0], 100) }), { warmup: 100, classwork: 33, whole: 50 }],
  ['part credit on an answer with tries left', (t) => ({ 2: correction(t[2], 60) }), { warmup: 0, classwork: 53, whole: 40 }],
  ['a correct answer lowered', (t) => ({ 1: correction(t[1], 40) }), { warmup: 0, classwork: 13, whole: 10 }],
  ['a confirmed Classwork consequence', () => ({
    1: integrity('section'), 2: integrity('section'), 3: integrity('section'),
    [`${SECTION_INTEGRITY_KEY_PREFIX}classwork`]: { active: true, incidentId: 'incident-1', sectionRole: 'classwork', previousOverridesByQuestion: { 1: null, 2: null, 3: null } },
  }), { warmup: 0, classwork: 0, whole: 0 }],
  ['an assignment zero', () => ({ __assignment: integrity('assignment') }), { warmup: 0, classwork: 0, whole: 0 }],
  ['an assignment grade', () => ({ __assignment: { ...integrity('assignment'), score: 85 } }), { warmup: 85, classwork: 85, whole: 85 }],
];

for (const [name, overridesFor, expected] of RULES) {
  test(`same grade as the whole-assignment column and the browser: ${name}`, async () => {
    const { db, google } = await started();
    await writeGrades({ db, google, studentId: STUDENT, change: overrideWrite((tracker) => overridesFor(tracker)), triggers: ['section', 'whole'] });
    assert.deepEqual(classroomGrades(db), expected, 'Classroom');
    assert.deepEqual(browserGrades(db, lesson()), expected, 'MathMaster');
  });
}

test('an override issued for one attempt stops counting when the student answers again, in Classroom as in MathMaster', async () => {
  const { db, google } = await started();
  await writeGrades({ db, google, studentId: STUDENT, change: creditFor(2, 100), triggers: ['section', 'whole'] });
  assert.equal(row(db, 'classwork').grade, 67);
  await writeGrades({ db, google, studentId: STUDENT, change: (grades) => ({ ...grades, gradesByAssignment: { A1: { ...grades.gradesByAssignment.A1, 2: answered(2, 'attempted', { attempts: 2, credit: 20 }) } } }), triggers: ['section', 'whole'] });
  assert.deepEqual(classroomGrades(db), { warmup: 0, classwork: 40, whole: 30 });
  assert.deepEqual(classroomGrades(db), browserGrades(db, lesson()));
});

test('an assignment-level grade is final in every column: assigned and returned, as the whole assignment\'s is', async () => {
  const { db, google } = await started();
  await writeGrades({ db, google, studentId: STUDENT, change: overrideWrite(() => ({ __assignment: integrity('assignment') })), triggers: ['section', 'whole'] });
  for (const key of ['warmup', 'classwork', 'whole']) {
    const column = row(db, key);
    assert.deepEqual([column.grade, column.stage, column.studentVisible, column.returnedToStudent], [0, 'final-complete', true, true], key);
  }
  assert.deepEqual(google.steps('cw-classwork'), ['list', 'patch', 'return']);
});

/* --- draft and assigned ---------------------------------------------------- */

test('lowering a correct answer leaves a finished column finished: the new grade is assigned, not left as a draft', async () => {
  const { db, google } = await started({ work: { ...WORK, 0: answered(0, 'correct') } });
  assert.deepEqual([row(db, 'warmup').grade, row(db, 'warmup').stage], [100, 'final-complete']);
  await writeGrades({ db, google, studentId: STUDENT, change: creditFor(0, 40), triggers: ['section', 'whole'] });
  assert.deepEqual(patchesOf(google, 'cw-warmup'), [{ draftGrade: 40, assignedGrade: 40 }], 'the student sees the corrected grade');
  assert.deepEqual([row(db, 'warmup').grade, row(db, 'warmup').stage, row(db, 'warmup').studentVisible], [40, 'final-complete', true]);
});

test('full credit on an answer with tries left does not finish an open column: it stays a draft, as the whole column does', async () => {
  const { db, google } = await started();
  await writeGrades({ db, google, studentId: STUDENT, change: creditFor(2, 100), triggers: ['section', 'whole'] });
  assert.deepEqual(patchesOf(google, 'cw-classwork'), [{ draftGrade: 67 }]);
  assert.deepEqual(patchesOf(google, 'cw-whole'), [{ draftGrade: 50 }]);
  assert.deepEqual([row(db, 'classwork').stage, row(db, 'classwork').studentVisible], ['manual-retry', false]);
  assert.deepEqual([row(db, 'whole').stage, row(db, 'whole').studentVisible], ['manual-retry', false]);
});

/* --- a Recovery, a workload correction, a held quiz ------------------------ */

const withDol = () => lesson({
  sections: [...lesson().sections, { role: 'dol', questions: [{ id: 'd1' }, { id: 'd2' }] }],
});

test('a DOL Recovery is weighed against the original as the teacher corrected it, as in MathMaster', async () => {
  const assignment = withDol();
  const work = { ...WORK, 4: answered(4, 'expired', { attempts: 1 }), 5: answered(5, 'expired', { attempts: 1 }) };
  const { db, google } = await started({
    assignment, sections: ['warmup', 'classwork', 'dol'], work,
    grades: { sectionRecoveryByAssignment: { A1: { dol: { status: 'completed', rawScore: 70, cap: 80, type: 'recovery' } } } },
  });
  assert.equal(row(db, 'dol').grade, 70, 'the Recovery beats the original 0');
  // The teacher accepts both DOL answers: the original is now 100, and it beats the Recovery.
  await writeGrades({ db, google, studentId: STUDENT, change: overrideWrite((t) => ({ 4: correction(t[4], 100), 5: correction(t[5], 100) })), triggers: ['section', 'whole'] });
  assert.equal(row(db, 'dol').grade, 100);
  assert.deepEqual(classroomGrades(db, ['warmup', 'classwork', 'dol']), browserGrades(db, assignment, ['warmup', 'classwork', 'dol']));
});

test('a held DOL Recovery keeps its own column waiting; an assignment-level grade reaches every other column', async () => {
  const assignment = withDol();
  const work = { ...WORK, 4: answered(4, 'expired', { attempts: 1 }), 5: answered(5, 'expired', { attempts: 1 }) };
  const { db, google } = await started({
    assignment, sections: ['warmup', 'classwork', 'dol'], work,
    grades: { sectionRecoveryByAssignment: { A1: { dol: { status: 'held' } } } },
  });
  assert.equal(row(db, 'dol').status, 'recovery-held');
  // A per-question correction does not settle a held Recovery.
  await writeGrades({ db, google, studentId: STUDENT, change: creditFor(4, 100), triggers: ['section', 'whole'] });
  assert.equal(row(db, 'dol').status, 'recovery-held');
  assert.deepEqual(google.steps('cw-dol'), []);
  // Nor does a grade for the whole assignment: the Recovery is still the
  // teacher's to resolve (tests/integration/sectionRecoveryPlatformFailure.test.mjs).
  // It decides the whole-assignment column and every column not held.
  google.calls.length = 0;
  await writeGrades({ db, google, studentId: STUDENT, change: overrideWrite(() => ({ __assignment: integrity('assignment') })), triggers: ['section', 'whole'] });
  assert.deepEqual(google.steps('cw-dol'), []);
  assert.deepEqual([row(db, 'dol').status, row(db, 'dol').grade], ['recovery-held', null]);
  for (const key of ['warmup', 'classwork', 'whole']) {
    assert.deepEqual([row(db, key).status, row(db, key).grade, row(db, key).stage], ['synced', 0, 'final-complete'], key);
  }
});

test('with a workload correction the override is applied once: a finished column stays finished at the corrected grade', async () => {
  // Classwork only, four items; the student answered the first three right,
  // and the teacher lowered the first.
  const assignment = lesson({ sections: [{ role: 'classwork', questions: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }] }] });
  const work = { 0: answered(0, 'correct'), 1: answered(1, 'correct'), 2: answered(2, 'correct') };
  const db = fixture({ assignment, sections: ['classwork'], grades: { gradesByAssignment: { A1: work }, teacherGradeOverridesByAssignment: { A1: { 0: correction(work[0], 40) } } } });
  const google = fakeGoogle();
  // The teacher approves a correction that omits the fourth item, and sends it
  // to Classroom: the three items the student owes are finished.
  const corrected = { active: true, eventId: 'correction-1', contentKey: workloadContentKey({ id: 'A1', ...assignment }), omittedIndices: [3], percent: 25 };
  const current = gradeDoc(db);
  // The teacher's sync authorizes exactly these inputs (correctionSyncAllowed).
  const inputFingerprint = await gradeInputFingerprint({
    assignment: { ...assignment, id: 'A1' }, gradeData: { ...current, profile: { ...current.profile, workloadCorrections: { A1: corrected } } }, practiceWaived: [],
  });
  await writeGrades({
    db, google, studentId: STUDENT, triggers: ['section', 'whole'],
    change: (grades) => ({
      ...grades,
      profile: { ...grades.profile, workloadCorrections: { A1: { ...corrected, syncAuthorization: { eventId: 'correction-1', inputFingerprint, at: AT } } } },
      classroomReleaseSignals: { A1: { ...retry('retroactive-accommodation'), correctionEventId: 'correction-1' } },
    }),
  });
  const classwork = row(db, 'classwork');
  assert.deepEqual([classwork.grade, classwork.stage, classwork.studentVisible, classwork.correctionEventId], [80, 'final-complete', true, 'correction-1']);
  assert.deepEqual(patchesOf(google, 'cw-classwork'), [{ draftGrade: 80, assignedGrade: 80 }]);
  assert.equal(row(db, 'whole').grade, 80, 'the whole-assignment column, over the same items');
  assert.equal(browserGrades(db, assignment, ['classwork']).classwork, 80, 'and MathMaster');
});

test('an override on a quiz whose grades are held sends nothing until the teacher releases them', async () => {
  const held = lesson({ activityRole: 'quiz' });
  const { db, google } = await started({ assignment: held });
  assert.deepEqual([...db.store.keys()].filter((key) => key.startsWith('classroomGradeSyncs/')), [], 'the student\'s own answers were held too');
  await writeGrades({ db, google, studentId: STUDENT, change: creditFor(0, 100), triggers: ['section', 'whole'] });
  assert.deepEqual(google.calls, [], 'a held quiz grade does not leave MathMaster because a teacher corrected it');
  assert.equal(row(db, 'warmup'), undefined);
  // Released: the queue wakes every student with "assessment-release".
  db.store.set('assignments/A1', { ...held, feedbackReleased: true });
  await writeGrades({ db, google, studentId: STUDENT, change: (grades) => ({ ...grades, classroomReleaseSignals: { A1: { requestedAt: new Date().toISOString(), reason: 'assessment-release', source: 'classroom-push-queue' } } }), triggers: ['section', 'whole'] });
  assert.deepEqual([row(db, 'warmup').grade, row(db, 'warmup').studentVisible], [100, true]);
  assert.deepEqual(classroomGrades(db), browserGrades(db, held));
});

/* --- what does not move ---------------------------------------------------- */

test('a column with no override keeps its evidence: nothing is sent again because overrides are now read', async () => {
  const { db } = await started();
  const assignment = lesson();
  const questions = assignment.sections.flatMap((section) => section.questions);
  for (const [key, indices] of [['warmup', [0]], ['classwork', [1, 2, 3]]]) {
    // What the trigger computed before overrides were read.
    const progress = assignmentGradeProgress(WORK, indices, questions);
    const column = row(db, key);
    const before = sectionGradeEvidenceFingerprint({
      assignmentId: 'A1', publicationId: `pub-${key}`, sectionKey: key, questionIndices: indices, tracker: WORK,
      grade: progress.grade, classroomGrade: progress.grade, maxPoints: 100, stage: column.stage, studentVisible: column.studentVisible,
    });
    assert.equal(column.evidenceFingerprint, before, `${key}: the same fingerprint, so the row is still current`);
  }
});

test('with no override that applies, the column\'s progress is assignmentGradeProgress\'s own', () => {
  const questions = lesson().sections.flatMap((section) => section.questions);
  const stale = { 2: { ...correction(WORK[2], 100), submissionId: 'an-earlier-submission' } };
  for (const overrides of [{}, stale, { __assignment: { active: true, score: 0 } }]) {
    assert.deepEqual(sectionGrade.gradeProgressWithTeacherOverrides(WORK, [1, 2, 3], questions, overrides), assignmentGradeProgress(WORK, [1, 2, 3], questions));
  }
});
