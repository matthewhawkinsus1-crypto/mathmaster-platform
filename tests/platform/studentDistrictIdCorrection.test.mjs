// A STUDENT WHOSE ACCOUNT WAS MADE WITH THE WRONG — BUT VALID-LOOKING — NUMBER.
//
// The production case: a student created her MathMaster account with a
// mistyped student number. Every digit-only number "looks valid", so Grade
// Export never offered to repair it, and every TEAMS file carried the wrong
// number. Her teacher had already matched the account to her Google Classroom
// name, and she had weeks of graded work on it.
//
// The fix must change ONE thing — the district ID grade exports use — and
// nothing keyed by her MathMaster account ID: not the account, its work, its
// Classroom link, its PIN, its Google sign-in. These tests run that whole
// story through the REAL callables in functions/index.js (cut out and run as
// written, tests/platform/helpers/serverCallableHarness.mjs), the real teacher
// roster normaliser, and the real Grade Export projection and ZIP:
//
//   MathMaster account ID   111111   (what she typed; what she signs in with)
//   real district ID        222222   (what TEAMS knows her as)
//
// Every name, number and email here is invented.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FakeFirestore,
  SERVER_TIME,
  authLib,
  clone,
  fakeAdminAuth,
  runServerCallable,
  teacherRequest,
} from './helpers/serverCallableHarness.mjs';
import * as districtIds from '../../functions/shared/studentDistrictId.mjs';
import { ROOT_ADMIN_EMAIL } from '../../functions/shared/rolePolicy.mjs';
import { normalizeTeacherRosterSummary } from '../../src/platform/teacher/teacherRosterSummary.js';
import {
  DISTRICT_ID_COPY,
  DISTRICT_ID_STATUS,
  describeStudentDistrictId,
  districtIdSavedMessage,
} from '../../src/platform/teacher/studentDistrictIdModel.js';
import { projectGradeTransferUnits } from '../../src/platform/gradeTransfer/gradeTransferProjection.js';
import { buildGradebookZip } from '../../src/platform/gradeTransfer/gradeTransferPackage.js';
import { teamsCsv, transferPackagePath } from '../../src/platform/gradeTransfer/gradeTransferModel.js';

const TEACHER = 'teacher.rivera@school.example';
const OTHER_TEACHER = 'teacher.okafor@school.example';
const CO_TEACHER = 'coteacher.lin@school.example';
const STUDENT_EMAIL = 'marisol.testerling@students.example';
const ACCOUNT_ID = '111111';
const DISTRICT_ID = '222222';
const CLASSMATE_ID = '444444';
const OTHER_CLASS_STUDENT_ID = '555555';
const PIN = '2580';
const JOIN_CODE = 'MKT4A7';

// The grades fields that ARE the student's academic, support and reward
// history. A district ID change must leave every one byte-identical.
const ACADEMIC_FIELDS = Object.freeze([
  'gradesByAssignment', 'assignmentActivity', 'supportUsageByAssignment',
  'dolGradesByAssignment', 'classworkGradesByAssignment', 'testCycleGrades', 'profile',
]);
// Her Google Classroom match and sign-in identity on the roster record.
const LINK_FIELDS = Object.freeze(['googleUserId', 'googleName', 'googleEmail', 'classroomCourseIds', 'linkedEmail']);
// The only fields setStudentSisId may change on grades/{id}.
const DISTRICT_ID_WRITE_FIELDS = Object.freeze(['sisStudentId', 'sisStudentIdVerifiedAt', 'sisStudentIdVerifiedBy', 'updatedAt']);

const record = (status) => ({ status, totalAttempts: 1, variantIndex: 0, lastSubmissionId: `submission-${status}`, partialCredit: status === 'correct' ? 100 : 0 });

// A four-section lesson whose final deadline has passed: Warm-Up, Classwork,
// Practice and DOL each export as their own TEAMS file.
const LESSON = Object.freeze({
  id: 'lesson-7',
  schemaVersion: 5,
  title: 'Lesson 7: Slope from Two Points',
  assignedClassIds: ['class-alg1'],
  lateDueAt: '2020-01-01T00:00:00Z',
  sections: [
    { id: 'wu', role: 'warmup', questions: [{ questionId: 'w1', activityRole: 'warmup' }] },
    { id: 'cw', role: 'classwork', questions: [{ questionId: 'c1', activityRole: 'classwork' }] },
    { id: 'pr', role: 'practice', questions: [{ questionId: 'p1', activityRole: 'practice' }] },
    { id: 'dl', role: 'dol', questions: [{ questionId: 'd1', activityRole: 'dol' }] },
  ],
});
const CLASS_RECORD = Object.freeze({
  classId: 'class-alg1', name: 'Algebra 1 — Period 2', period: 'Period 2', teacherOfRecord: TEACHER, status: 'active',
});

const seed = () => new FakeFirestore({
  classes: {
    'class-alg1': { name: CLASS_RECORD.name, period: CLASS_RECORD.period, teacherOfRecord: TEACHER, status: 'active' },
    'class-geo': { name: 'Geometry — Period 4', period: 'Period 4', teacherOfRecord: OTHER_TEACHER, status: 'active' },
  },
  teacherDirectory: {
    [TEACHER]: { email: TEACHER, active: true },
    [OTHER_TEACHER]: { email: OTHER_TEACHER, active: true },
    [CO_TEACHER]: { email: CO_TEACHER, active: true },
  },
  grades: {
    // The student. Created through createStudentAccount with the number she
    // typed, so her district ID was stored — and "verified" — as 111111.
    [ACCOUNT_ID]: {
      firstName: 'Marisol', lastName: 'Testerling', displayName: 'Marisol Testerling',
      sisStudentId: ACCOUNT_ID, sisStudentIdVerifiedAt: 'stamped-at-creation', sisStudentIdVerifiedBy: ROOT_ADMIN_EMAIL,
      classId: 'class-alg1', classPeriod: 'Period 2', status: 'active', assignedTeacherEmail: TEACHER,
      profile: { inclusionStatus: true, accommodations: ['text-to-speech'], modifications: [], translationLanguage: null },
      gradesByAssignment: { 'lesson-7': { 0: record('correct'), 1: record('correct'), 2: record('correct'), 3: record('expired') } },
      assignmentActivity: { 'lesson-7': { totalTimeSeconds: 1260, onTimeSeconds: 1260, lateSeconds: 0 } },
      supportUsageByAssignment: { 'lesson-7': { 'text-to-speech': 3 } },
      dolGradesByAssignment: { 'lesson-6': { '2026-09-29': { score: 75, finalized: true } } },
      classworkGradesByAssignment: { 'lesson-6': { score: 90 } },
      testCycleGrades: { 'unit-2-test': { released: true, score: 84 } },
      // The teacher's Google Classroom match, and her own Google link.
      googleUserId: 'g-118800220011', googleName: 'Marisol Testerling', googleEmail: STUDENT_EMAIL,
      classroomCourseIds: ['course-alg1-p2'], linkedEmail: STUDENT_EMAIL,
    },
    // A classmate on a legacy record: no stored district ID, so her
    // all-digit account ID is her district ID.
    [CLASSMATE_ID]: {
      firstName: 'Odile', lastName: 'Placeholder', displayName: 'Odile Placeholder',
      classId: 'class-alg1', classPeriod: 'Period 2', status: 'active', assignedTeacherEmail: TEACHER,
      gradesByAssignment: { 'lesson-7': { 0: record('correct'), 1: record('expired'), 2: record('correct'), 3: record('correct') } },
    },
    // Another teacher's student.
    [OTHER_CLASS_STUDENT_ID]: {
      firstName: 'Bram', lastName: 'Fictionale', displayName: 'Bram Fictionale', sisStudentId: OTHER_CLASS_STUDENT_ID,
      classId: 'class-geo', classPeriod: 'Period 4', status: 'active', assignedTeacherEmail: OTHER_TEACHER,
    },
  },
  // Everything else keyed by her account ID.
  studentCredentials: { [ACCOUNT_ID]: { studentIdKey: ACCOUNT_ID, ...authLib.hashPasscode(PIN, 'fixed-test-salt'), resetRequired: false } },
  studentAliases: { [ACCOUNT_ID]: { key: ACCOUNT_ID, studentId: ACCOUNT_ID } },
  studentDirectory: { [STUDENT_EMAIL]: { email: STUDENT_EMAIL, studentId: ACCOUNT_ID, uid: 'google-uid-marisol' } },
  classroomRosterLinks: {
    'course-alg1-p2__111111': {
      rosterLinkId: 'course-alg1-p2__111111', teacherUid: `uid-${TEACHER}`, classId: 'class-alg1', courseId: 'course-alg1-p2',
      studentId: ACCOUNT_ID, googleUserId: 'g-118800220011', name: 'Marisol Testerling', email: STUDENT_EMAIL,
    },
  },
  classJoinCodes: { [JOIN_CODE]: { code: JOIN_CODE, classId: 'class-alg1', classPeriod: 'Period 2', active: true } },
  classPointRewardRedemptions: {
    'redemption-1': { studentId: ACCOUNT_ID, classId: 'class-alg1', assignmentId: 'lesson-6', rewardCode: 'practicePass', status: 'redeemed' },
  },
  studentSupportEvents: { 'support-1': { studentId: ACCOUNT_ID, studentName: 'Marisol Testerling', kind: 'teacherIntervention' } },
  gradeTransferSnapshots: {
    // A file already exported — and uploaded — under the wrong number.
    'transfer_before': {
      classId: 'class-alg1', assignmentId: 'lesson-6', sectionKey: 'dol', exportKind: 'initial',
      rows: [{ studentId: ACCOUNT_ID, sisStudentId: ACCOUNT_ID, grade: 75, gradeVersion: 'lesson-6:75:dol' }],
      createdAt: '2026-09-30T15:00:00Z', uploadConfirmedAt: '2026-09-30T16:00:00Z',
    },
  },
});

const correct = (db, { email = TEACHER, studentId = ACCOUNT_ID, sisStudentId = DISTRICT_ID, rootAdmin = false } = {}) => runServerCallable('setStudentSisId', {
  db, request: teacherRequest(email, { studentId, sisStudentId }, { rootAdmin }),
});

const auditEntries = (db) => [...db.docsOf('adminAuditLog').values()];
const ZIP_LOCAL_HEADER = 0x04034b50;
const zipEntries = (bytes) => {
  const buffer = Buffer.from(bytes);
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === ZIP_LOCAL_HEADER) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLength);
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, buffer.toString('utf8', start, start + size));
    offset = start + size;
  }
  return entries;
};
const rosterStudents = (db) => [...db.docsOf('grades').entries()].map(([id, data]) => ({ id, ...clone(data) }));

// ---------------------------------------------------------------------------
// The scenario, verification points 1-8.
// ---------------------------------------------------------------------------

test('a teacher corrects 111111 -> 222222: only the district ID changes; account, work, links and sign-in stay', async () => {
  const db = seed();
  const before = db.dump();

  const saved = await correct(db);
  // The screen learns what changed, and from what.
  assert.deepEqual(saved, { studentId: ACCOUNT_ID, sisStudentId: DISTRICT_ID, previousSisStudentId: ACCOUNT_ID, changed: true });

  const after = db.dump();
  // 1. The internal MathMaster student ID is still 111111. No second student.
  assert.ok(after.grades[ACCOUNT_ID], 'grades/111111 still exists');
  assert.equal(after.grades[DISTRICT_ID], undefined, 'no grades/222222 was created');
  assert.deepEqual(Object.keys(after.grades).sort(), Object.keys(before.grades).sort(), 'no roster record was added or removed');

  // 4 + 5. The district ID is 222222, verified by the teacher who changed it.
  const student = after.grades[ACCOUNT_ID];
  assert.equal(student.sisStudentId, DISTRICT_ID);
  assert.equal(student.sisStudentIdVerifiedBy, TEACHER);
  assert.deepEqual(student.sisStudentIdVerifiedAt, SERVER_TIME);
  assert.deepEqual(student.updatedAt, SERVER_TIME);

  // 2. Every academic, support and reward field is byte-identical — and so is
  // every other field on the record except the district ID ones.
  ACADEMIC_FIELDS.forEach((field) => assert.deepEqual(student[field], before.grades[ACCOUNT_ID][field], `${field} unchanged`));
  Object.keys(before.grades[ACCOUNT_ID])
    .filter((field) => !DISTRICT_ID_WRITE_FIELDS.includes(field))
    .forEach((field) => assert.deepEqual(student[field], before.grades[ACCOUNT_ID][field], `${field} unchanged`));
  // 3. The Google Classroom match is untouched on the record ...
  LINK_FIELDS.forEach((field) => assert.deepEqual(student[field], before.grades[ACCOUNT_ID][field], `${field} unchanged`));
  // ... and every collection keyed by her account ID — the Classroom roster
  // link, the PIN credential, the sign-in alias, the Google directory link,
  // rewards, support events, export history — is exactly as it was, as is
  // every other student.
  Object.keys(before)
    .filter((collection) => !['grades', 'adminAuditLog'].includes(collection))
    .forEach((collection) => assert.deepEqual(after[collection], before[collection], `${collection} unchanged`));
  Object.keys(before.grades)
    .filter((id) => id !== ACCOUNT_ID)
    .forEach((id) => assert.deepEqual(after.grades[id], before.grades[id], `grades/${id} unchanged`));

  // The writes were the district ID and its audit entry — nothing else.
  assert.deepEqual(db.writes.map((write) => `${write.op} ${write.collection}/${write.collection === 'grades' ? write.id : '*'}`).sort(), [
    'set adminAuditLog/*',
    `update grades/${ACCOUNT_ID}`,
  ]);
  assert.deepEqual(db.writes.find((write) => write.collection === 'grades').keys.sort(), [...DISTRICT_ID_WRITE_FIELDS].sort());

  // No student's history was loaded to do it: every grades read is a field
  // mask or a projected query, and none names a history field.
  const gradesReads = db.reads.filter((entry) => entry.collection === 'grades');
  assert.ok(gradesReads.length >= 2);
  gradesReads.forEach((entry) => {
    assert.ok(Array.isArray(entry.fields), `${entry.via} of grades/${entry.id ?? '(query)'} must be field-masked`);
    ACADEMIC_FIELDS.forEach((field) => assert.ok(!entry.fields.includes(field), `${entry.via} must not read ${field}`));
  });

  // 5. The audit entry keeps who, when, what it was and what it became.
  const [audit] = auditEntries(db);
  assert.equal(auditEntries(db).length, 1);
  assert.equal(audit.action, 'sis_student_id_set');
  assert.equal(audit.target, ACCOUNT_ID);
  assert.equal(audit.actorEmail, TEACHER);
  assert.deepEqual(audit.createdAt, SERVER_TIME);
  assert.deepEqual(audit.details, {
    previous: { sisStudentId: ACCOUNT_ID, exportId: ACCOUNT_ID },
    next: { sisStudentId: DISTRICT_ID },
    classId: 'class-alg1',
  });

  // The confirmation the teacher reads.
  const message = districtIdSavedMessage({ studentName: 'Marisol Testerling', previousDistrictId: saved.previousSisStudentId, districtId: saved.sisStudentId });
  assert.match(message, /^District ID updated for Marisol Testerling\. The student’s MathMaster account, work, and grades were not changed\. Future grade exports will use 222222\./);
  assert.match(message, /under old district ID 111111 are not moved by MathMaster/);
});

test('6. Grade Export sends 222222,<grade> — never 111111 — in every section file of the ZIP', async () => {
  const db = seed();
  const project = () => projectGradeTransferUnits({
    classes: [CLASS_RECORD], assignments: [LESSON], students: rosterStudents(db), teacherEmail: TEACHER,
  }).units;

  // Before the correction, the mistyped number is what TEAMS would receive.
  const [beforeUnit] = project();
  const marisolBefore = beforeUnit.sectionUnits.flatMap((section) => section.allRows).filter((row) => row.studentId === ACCOUNT_ID);
  assert.ok(marisolBefore.length === 4 && marisolBefore.every((row) => row.sisStudentId === ACCOUNT_ID), 'the defect: 111111 exported as her district ID');

  await correct(db);
  const [unit] = project();
  const bySection = Object.fromEntries(unit.sectionUnits.map((section) => [section.sectionKey, section]));
  const expected = { warmup: 100, classwork: 100, practice: 100, dol: 0 };
  Object.entries(expected).forEach(([sectionKey, grade]) => {
    const row = bySection[sectionKey].allRows.find((entry) => entry.studentId === ACCOUNT_ID);
    assert.deepEqual([row.sisStudentId, row.grade], [DISTRICT_ID, grade], `${sectionKey} row`);
    // The row still belongs to her account: grades stay attached to 111111.
    assert.equal(row.studentId, ACCOUNT_ID);
  });

  const zip = zipEntries(buildGradebookZip(unit.sectionUnits));
  unit.sectionUnits.forEach((section) => {
    const lines = zip.get(transferPackagePath(section)).trim().split(/\r\n/);
    assert.ok(lines.includes(`${DISTRICT_ID},${expected[section.sectionKey]}`), `${section.sectionLabel}.csv carries 222222`);
    assert.ok(!lines.some((line) => line.startsWith(`${ACCOUNT_ID},`)), `${section.sectionLabel}.csv never carries 111111`);
    // The classmate keeps exporting under her own (legacy) number.
    assert.ok(lines.some((line) => line.startsWith(`${CLASSMATE_ID},`)));
  });
  assert.equal(teamsCsv(bySection.dol.rows.filter((row) => row.studentId === ACCOUNT_ID)), `${DISTRICT_ID},0\r\n`);
});

test('7. she keeps signing in to the same account — PIN and Google — and 222222 is not a sign-in ID', async () => {
  const db = seed();
  await correct(db);

  // Student ID + PIN, exactly as before: the same account, the same work.
  const auth = fakeAdminAuth();
  const signedIn = await runServerCallable('studentSignIn', { db, auth, request: { data: { studentId: ACCOUNT_ID, passcode: PIN } } });
  assert.equal(signedIn.studentId, ACCOUNT_ID);
  assert.equal(signedIn.firstTimeSetup, false);
  assert.deepEqual(auth.claims.get(`student:${ACCOUNT_ID}`), { role: 'student', studentId: ACCOUNT_ID });

  // Her linked Google account resolves to the same account.
  const google = await runServerCallable('resolveSignedInRole', {
    db,
    auth,
    request: { auth: { uid: 'google-uid-marisol', token: { email: STUDENT_EMAIL, email_verified: true } }, data: {} },
  });
  assert.deepEqual(google, { role: 'student', studentId: ACCOUNT_ID, classPeriod: 'Period 2' });

  // The district ID did not become a second way in: 222222 is not on the
  // roster as a sign-in ID, so first-time setup under it is refused.
  await assert.rejects(
    runServerCallable('studentSignIn', { db, auth, request: { data: { studentId: DISTRICT_ID, passcode: '8642', classCode: JOIN_CODE } } }),
    (error) => error.code === 'failed-precondition' && /not on the MathMaster roster/.test(error.message),
  );
  assert.equal(db.data('studentCredentials', DISTRICT_ID), undefined, 'no credential was created for 222222');
});

test('8. reloading the teacher roster shows 222222, with the calm "they differ" note — not a warning', async () => {
  const db = seed();
  await correct(db);

  const response = await runServerCallable('listSignInAccess', { db, request: teacherRequest(TEACHER) });
  const row = response.students.find((entry) => entry.studentId === ACCOUNT_ID);
  assert.equal(row.sisStudentId, DISTRICT_ID);
  const client = normalizeTeacherRosterSummary(row);
  assert.equal(client.id, ACCOUNT_ID);
  assert.equal(client.sisStudentId, DISTRICT_ID);

  const shown = describeStudentDistrictId(client);
  assert.equal(shown.accountId, ACCOUNT_ID);
  assert.equal(shown.districtId, DISTRICT_ID);
  assert.equal(shown.status, DISTRICT_ID_STATUS.DIFFERS);
  assert.equal(shown.note, DISTRICT_ID_COPY.differsNote);
  assert.equal(shown.tone, 'info');
  assert.equal(shown.exportable, true);

  // The classmate's legacy record reads "same as the MathMaster account ID".
  const classmate = describeStudentDistrictId(normalizeTeacherRosterSummary(response.students.find((entry) => entry.studentId === CLASSMATE_ID)));
  assert.deepEqual([classmate.status, classmate.districtId, classmate.tone], [DISTRICT_ID_STATUS.SAME, CLASSMATE_ID, 'neutral']);
});

// ---------------------------------------------------------------------------
// Verification points 9 and 10, and the rest of the refusal surface. Every
// refusal writes nothing.
// ---------------------------------------------------------------------------

test('9. a second student cannot be given 222222 — by correction or by a new account — and nothing is written', async () => {
  const db = seed();
  await correct(db);
  const settled = db.dump();
  db.writes.length = 0;

  for (const sisStudentId of [DISTRICT_ID, '0222222', '00000000000000222222']) {
    await assert.rejects(
      correct(db, { studentId: CLASSMATE_ID, sisStudentId }),
      (error) => error.code === 'already-exists'
        && error.message === districtIds.districtIdInUseMessage(sisStudentId)
        && !error.message.includes(ACCOUNT_ID) && !error.message.includes('Marisol'),
      `${sisStudentId} is the same district number as 222222`,
    );
  }

  // A root administrator cannot create a new account under 222222 either:
  // its account ID would become a second district ID 222222.
  await assert.rejects(
    runServerCallable('createStudentAccount', {
      db,
      request: teacherRequest(ROOT_ADMIN_EMAIL, { studentId: DISTRICT_ID, firstName: 'Second', lastName: 'Student', classId: 'class-alg1' }, { rootAdmin: true }),
    }),
    (error) => error.code === 'already-exists' && error.message === districtIds.districtIdInUseMessage(DISTRICT_ID, { creating: true }),
  );
  assert.deepEqual(db.writes, []);
  assert.deepEqual(db.dump(), settled);

  // ... while a genuinely new number still creates an account as before.
  const created = await runServerCallable('createStudentAccount', {
    db,
    request: teacherRequest(ROOT_ADMIN_EMAIL, { studentId: '777777', firstName: 'Third', lastName: 'Student', classId: 'class-alg1' }, { rootAdmin: true }),
  });
  assert.equal(created.studentId, '777777');
  assert.equal(db.data('grades', '777777').sisStudentId, '777777');
});

test('the mistyped number is refused for anyone else while it is still her account ID, and she can be corrected back', async () => {
  const db = seed();
  await correct(db);
  db.writes.length = 0;

  // 111111 is no longer her district ID, but it is still the number she signs
  // in with — and every file sent before the correction carries it. Giving it
  // to another student needs a person to look at both, so it is refused.
  await assert.rejects(
    correct(db, { studentId: CLASSMATE_ID, sisStudentId: ACCOUNT_ID }),
    (error) => error.code === 'already-exists' && error.message === districtIds.accountIdInUseMessage(ACCOUNT_ID),
  );
  // A legacy record's account ID is its district ID: refused the same way.
  await assert.rejects(
    correct(db, { studentId: ACCOUNT_ID, sisStudentId: CLASSMATE_ID }),
    (error) => error.code === 'already-exists' && error.message === districtIds.accountIdInUseMessage(CLASSMATE_ID),
  );
  assert.deepEqual(db.writes, []);

  // A mistaken correction can be undone: her own account ID is hers to use.
  const undone = await correct(db, { sisStudentId: ACCOUNT_ID });
  assert.deepEqual(undone, { studentId: ACCOUNT_ID, sisStudentId: ACCOUNT_ID, previousSisStudentId: DISTRICT_ID, changed: true });
  const lastAudit = auditEntries(db).at(-1);
  assert.deepEqual(lastAudit.details.previous, { sisStudentId: DISTRICT_ID, exportId: DISTRICT_ID });
});

test('10. only her teacher of record (or the root administrator) may change it; anyone else writes nothing', async () => {
  const db = seed();
  const before = db.dump();

  // Another school teacher, and a signed-in student, are refused.
  await assert.rejects(correct(db, { email: OTHER_TEACHER }), (error) => error.code === 'permission-denied');
  await assert.rejects(
    runServerCallable('setStudentSisId', {
      db,
      request: { auth: { uid: `student:${ACCOUNT_ID}`, token: { role: 'student', studentId: ACCOUNT_ID } }, data: { studentId: ACCOUNT_ID, sisStudentId: DISTRICT_ID } },
    }),
    (error) => error.code === 'permission-denied',
  );
  // A teacher token that merely CLAIMS root admin is still refused.
  await assert.rejects(correct(db, { email: OTHER_TEACHER, rootAdmin: true }), (error) => error.code === 'permission-denied');
  await assert.rejects(runServerCallable('setStudentSisId', { db, request: { data: { studentId: ACCOUNT_ID, sisStudentId: DISTRICT_ID } } }), (error) => error.code === 'unauthenticated');
  assert.deepEqual(db.writes, []);
  assert.deepEqual(db.dump(), before);

  // The teacher of record of her CLASS may, even when the roster teacher
  // field names someone else.
  const coTaught = seed();
  coTaught.docsOf('classes').set('class-alg1', { ...coTaught.data('classes', 'class-alg1'), teacherOfRecord: CO_TEACHER });
  assert.equal((await correct(coTaught, { email: CO_TEACHER })).sisStudentId, DISTRICT_ID);
  // So may the root administrator.
  const admin = seed();
  assert.equal((await correct(admin, { email: ROOT_ADMIN_EMAIL, rootAdmin: true })).sisStudentId, DISTRICT_ID);
  assert.equal(admin.data('grades', ACCOUNT_ID).sisStudentIdVerifiedBy, ROOT_ADMIN_EMAIL);
});

test('only a 1-20 digit district ID for a student on the roster is accepted; anything else writes nothing', async () => {
  const db = seed();
  for (const sisStudentId of ['', '   ', '22222a', '222 222', '222-222', '-222222', '2.5', '１２３４５', '1'.repeat(21), null, undefined, 222222.5]) {
    await assert.rejects(
      runServerCallable('setStudentSisId', { db, request: teacherRequest(TEACHER, { studentId: ACCOUNT_ID, sisStudentId }) }),
      (error) => error.code === 'invalid-argument' && [districtIds.DISTRICT_ID_FORMAT_ERROR, districtIds.DISTRICT_ID_REQUIRED_ERROR].includes(error.message),
      `refuses ${JSON.stringify(sisStudentId)}`,
    );
  }
  await assert.rejects(correct(db, { studentId: '999999' }), (error) => error.code === 'not-found');
  await assert.rejects(correct(db, { studentId: 'grades/111111' }), (error) => error.code === 'invalid-argument');
  await assert.rejects(correct(db, { studentId: '' }), (error) => error.code === 'invalid-argument');
  assert.deepEqual(db.writes, []);

  // Surrounding spaces are not part of the number.
  assert.equal((await correct(db, { sisStudentId: ` ${DISTRICT_ID} ` })).sisStudentId, DISTRICT_ID);
});

test('a legacy record with no stored district ID is confirmed or corrected the same way', async () => {
  const db = seed();
  // Confirming the number it already exports under stores it, and says so.
  const confirmed = await correct(db, { studentId: CLASSMATE_ID, sisStudentId: CLASSMATE_ID });
  assert.deepEqual(confirmed, { studentId: CLASSMATE_ID, sisStudentId: CLASSMATE_ID, previousSisStudentId: CLASSMATE_ID, changed: false });
  assert.deepEqual(auditEntries(db).at(-1).details.previous, { sisStudentId: null, exportId: CLASSMATE_ID });
  assert.equal(db.data('grades', CLASSMATE_ID).sisStudentId, CLASSMATE_ID);
  assert.equal(db.data('grades', CLASSMATE_ID).firstName, 'Odile');
});

test('the shared district ID rules: effective ID, leading zeros, superseded account IDs and match keys', () => {
  const corrected = { id: ACCOUNT_ID, sisStudentId: DISTRICT_ID };
  const legacy = { id: CLASSMATE_ID };
  const emailKey = { id: 'ada.school.account' };
  assert.equal(districtIds.effectiveDistrictStudentId(corrected), DISTRICT_ID);
  assert.equal(districtIds.effectiveDistrictStudentId(legacy), CLASSMATE_ID);
  assert.equal(districtIds.effectiveDistrictStudentId(emailKey), '');
  // A stored but invalid value is a problem to repair, never a reason to fall
  // back to the account ID.
  assert.equal(districtIds.effectiveDistrictStudentId({ id: ACCOUNT_ID, sisStudentId: 'S-111' }), 'S-111');
  assert.equal(districtIds.districtStudentIdSource({ id: ACCOUNT_ID, sisStudentId: 'S-111' }), districtIds.DISTRICT_ID_SOURCE.INVALID);

  assert.equal(districtIds.accountIdIsSupersededDistrictId(corrected), true);
  assert.equal(districtIds.accountIdIsSupersededDistrictId(legacy), false);
  assert.equal(districtIds.accountIdIsSupersededDistrictId({ id: '0222222', sisStudentId: DISTRICT_ID }), false, 'leading zeros are the same number');
  assert.deepEqual(districtIds.districtIdMatchKeys(corrected), [DISTRICT_ID], 'the mistyped number never matches a district row');
  assert.deepEqual(districtIds.districtIdMatchKeys(legacy), [CLASSMATE_ID]);
  assert.deepEqual(districtIds.districtIdMatchKeys({ id: 'ada.school.account', sisStudentId: '1500456' }), ['1500456', 'ada.school.account']);

  assert.equal(districtIds.canonicalDistrictStudentId('000222222'), DISTRICT_ID);
  assert.equal(districtIds.canonicalDistrictStudentId('0000'), '0');
  assert.equal(districtIds.sameDistrictStudentId('0222222', DISTRICT_ID), true);
  assert.equal(districtIds.sameDistrictStudentId('2222220', DISTRICT_ID), false);
  const variants = districtIds.districtStudentIdVariants(DISTRICT_ID);
  assert.equal(variants.length, 15);
  assert.ok(variants.length <= 30, 'one Firestore `in` query');
  assert.deepEqual([variants[0], variants.at(-1)], [DISTRICT_ID, DISTRICT_ID.padStart(20, '0')]);
  assert.deepEqual(districtIds.districtStudentIdVariants('12345678901234567890'), ['12345678901234567890']);
  assert.deepEqual(districtIds.districtStudentIdVariants('12a'), []);

  assert.equal(districtIds.findDistrictStudentIdConflict({ studentId: ACCOUNT_ID, districtId: DISTRICT_ID, districtIdHolders: [ACCOUNT_ID], accountIdHolders: [ACCOUNT_ID] }), null, 'a student never conflicts with itself');
  assert.equal(districtIds.findDistrictStudentIdConflict({ studentId: ACCOUNT_ID, districtId: DISTRICT_ID, districtIdHolders: ['x'] }).kind, districtIds.DISTRICT_ID_CONFLICT.DISTRICT_ID_IN_USE);
  assert.equal(districtIds.findDistrictStudentIdConflict({ studentId: ACCOUNT_ID, districtId: DISTRICT_ID, accountIdHolders: ['y'] }).kind, districtIds.DISTRICT_ID_CONFLICT.ACCOUNT_ID_IN_USE);

  assert.equal(districtIds.mayChangeStudentDistrictId({ callerEmail: TEACHER.toUpperCase(), student: { assignedTeacherEmail: TEACHER } }), true);
  assert.equal(districtIds.mayChangeStudentDistrictId({ callerEmail: OTHER_TEACHER, student: { assignedTeacherEmail: TEACHER } }), false);
  assert.equal(districtIds.mayChangeStudentDistrictId({ callerEmail: OTHER_TEACHER, student: {}, classRecord: { teacherOfRecord: OTHER_TEACHER } }), true);
  assert.equal(districtIds.mayChangeStudentDistrictId({ callerEmail: '', student: { assignedTeacherEmail: '' } }), false, 'no email never matches an empty teacher');
  assert.equal(districtIds.mayChangeStudentDistrictId({ isRootAdmin: true }), true);
});
