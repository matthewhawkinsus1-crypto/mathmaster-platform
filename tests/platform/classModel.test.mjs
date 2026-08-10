import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_STATUS, CLASS_STATUS, ClassInputError, DEFAULT_PERIODS, REMOVAL_KINDS,
  buildMigrationClasses, classIdsForTeacher, describeRemovalKinds, membershipFieldsFor,
  normalizeClassInput, periodClassId, planPeriodMigration, resolveStudentCourseContext, studentsForTeacher,
} from '../../functions/shared/classModel.mjs';

// --- What an administrator types ------------------------------------------------

test('a class needs a name, a real course and a real level', () => {
  const good = normalizeClassInput({ name: '  Algebra II — 5th  ', course: 'algebra2', courseLevel: 'honors', period: 'Period 5' });
  assert.equal(good.name, 'Algebra II — 5th');
  assert.equal(good.course, 'algebra2');
  assert.equal(good.courseLevel, 'honors');
  assert.equal(good.status, CLASS_STATUS.ACTIVE);

  assert.throws(() => normalizeClassInput({ name: '   ' }), ClassInputError);
  // Quietly defaulting here would route a whole class through the wrong course.
  assert.throws(() => normalizeClassInput({ name: 'X', course: 'geometry' }), /not a MathMaster course/);
  assert.throws(() => normalizeClassInput({ name: 'X', courseLevel: 'AP' }), /not a course level/);
});

test('an edit keeps what it does not mention', () => {
  const existing = { name: 'Algebra I — 3rd', course: 'algebra1', courseLevel: 'standard', period: 'Period 3', teacherOfRecord: 'a@b.org', status: 'active' };
  const renamed = normalizeClassInput({ name: 'Algebra I — Third' }, { existing });
  assert.equal(renamed.course, 'algebra1');
  assert.equal(renamed.teacherOfRecord, 'a@b.org', 'an edit that did not mention the teacher must not clear it');

  // But an explicit null does clear it.
  assert.equal(normalizeClassInput({ teacherOfRecord: '' }, { existing }).teacherOfRecord, null);
});

test('teacher emails are stored one way, so two spellings are one teacher', () => {
  const record = normalizeClassInput({ name: 'X', teacherOfRecord: '  Ms.Smith@District.ORG ' });
  assert.equal(record.teacherOfRecord, 'ms.smith@district.org');
});

test('two teachers may both teach third period', () => {
  const a = normalizeClassInput({ name: 'Algebra I — 3rd', period: 'Period 3', teacherOfRecord: 'smith@d.org' });
  const b = normalizeClassInput({ name: 'Algebra II — 3rd', course: 'algebra2', period: 'Period 3', teacherOfRecord: 'jones@d.org' });
  assert.equal(a.period, b.period, 'the period is a schedule label, not an identity');
  assert.notEqual(a.course, b.course);
});

// --- Migrating the eight periods -------------------------------------------------

test('the existing eight periods become eight classes, carrying their course settings', () => {
  const classes = buildMigrationClasses({
    courseProfiles: { 'Period 2': { course: 'algebra2', courseLevel: 'honors' } },
  });
  assert.equal(classes.length, 8);
  const second = classes.find((entry) => entry.period === 'Period 2');
  assert.equal(second.course, 'algebra2');
  assert.equal(second.courseLevel, 'honors');
  assert.equal(second.name, 'Algebra II — Period 2');
  assert.equal(second.classId, periodClassId('Period 2'));

  const first = classes.find((entry) => entry.period === 'Period 1');
  assert.equal(first.course, 'algebra1', 'a period with no profile is a standard Algebra I class');
});

test('migration is safe to run twice', () => {
  const once = buildMigrationClasses({});
  const twice = buildMigrationClasses({ existingClasses: once });
  assert.equal(twice.length, 0, 'a period that already has a class is left alone');
});

test('every default period produces a usable id', () => {
  DEFAULT_PERIODS.forEach((period) => {
    assert.match(periodClassId(period), /^period-\d+$/);
  });
});

// --- The migration is the deployment gate ------------------------------------------

const migrationInput = (students, classes = []) => ({
  students,
  classes,
  courseProfiles: { 'Period 1': { course: 'algebra1', courseLevel: 'standard' } },
});

test('the migration reports what it found, not just what it did', () => {
  const { report } = planPeriodMigration(migrationInput([
    { id: 'S1', classPeriod: 'Period 1', status: 'active' },
    { id: 'S2', classPeriod: 'Unassigned', status: 'active' },
    { id: 'S3', classPeriod: 'Period 2', status: 'disabled' },
  ]));
  assert.equal(report.studentsScanned, 3);
  assert.equal(report.activeStudentsScanned, 2);
  assert.equal(report.classesCreated, 8);
  assert.equal(report.studentsAssigned, 2, 'the two with a real period get a class; "Unassigned" is not a period');
  // S2 has no period to place from; S1 and S3 land in migrated classes that
  // nobody teaches yet. Both are reasons an administrator must resolve.
  assert.deepEqual(
    report.unresolvedStudents.map((entry) => [entry.studentId, entry.reason]).sort(),
    [['S1', 'class_has_no_teacher_of_record'], ['S2', 'no_class_and_no_period'], ['S3', 'class_has_no_teacher_of_record']],
  );
  // Migrated classes have no teacher of record yet, so nobody can see anyone —
  // which is precisely what must block the scoped rule.
  assert.equal(report.readyForScopedRule, false);
  assert.deepEqual(report.activeStudentsMissingTeacherAfterMigration.sort(), ['S1', 'S2']);
});

test('a student whose period has no class is reported unresolved, not guessed at', () => {
  const { report, studentUpdates } = planPeriodMigration({
    students: [{ id: 'S1', classPeriod: 'Zero Hour', status: 'active' }],
    classes: [],
    periods: ['Period 1'],
  });
  assert.equal(studentUpdates.length, 0);
  assert.deepEqual(report.unresolvedStudents, [{ studentId: 'S1', reason: 'no_class_for_period' }]);
});

test('a classId pointing nowhere is a conflict, never silently re-placed by period', () => {
  const { report, studentUpdates } = planPeriodMigration({
    students: [{ id: 'S1', classId: 'deleted-class', classPeriod: 'Period 1', status: 'active' }],
    classes: [{ classId: 'c-real', period: 'Period 1', teacherOfRecord: 'a@d.org' }],
    periods: ['Period 1'],
  });
  assert.equal(studentUpdates.length, 0, 'guessing could put the student in the wrong course');
  assert.equal(report.conflicts[0].reason, 'class_missing');
  assert.equal(report.readyForScopedRule, false);
});

test('a record whose denormalized teacher has gone stale is reported and repaired', () => {
  const { report, studentUpdates } = planPeriodMigration({
    students: [{ id: 'S1', classId: 'c-1', classPeriod: 'Period 9', assignedTeacherEmail: 'old@d.org', status: 'active' }],
    classes: [{ classId: 'c-1', period: 'Period 1', teacherOfRecord: 'new@d.org' }],
    periods: ['Period 1'],
  });
  assert.equal(report.conflicts[0].reason, 'stale_denormalized_fields');
  assert.deepEqual(report.conflicts[0].was, { classPeriod: 'Period 9', assignedTeacherEmail: 'old@d.org' });
  assert.deepEqual(studentUpdates[0].fields, { classId: 'c-1', classPeriod: 'Period 1', assignedTeacherEmail: 'new@d.org' });
  assert.equal(report.readyForScopedRule, true);
});

test('the gate opens only when every ACTIVE student has a teacher', () => {
  const classes = [{ classId: 'c-1', period: 'Period 1', teacherOfRecord: 'a@d.org' }];
  const ready = planPeriodMigration({
    students: [
      { id: 'S1', classPeriod: 'Period 1', status: 'active' },
      // A deactivated student with no class must not hold the deployment.
      { id: 'S2', classPeriod: 'Unassigned', status: 'disabled' },
    ],
    classes,
    periods: ['Period 1'],
  });
  assert.equal(ready.report.readyForScopedRule, true);
  assert.deepEqual(ready.report.activeStudentsMissingTeacherAfterMigration, []);

  const notReady = planPeriodMigration({
    students: [{ id: 'S3', classPeriod: 'Unassigned', status: 'active' }],
    classes,
    periods: ['Period 1'],
  });
  assert.equal(notReady.report.readyForScopedRule, false, 'an active student nobody can see must block the rule');
});

test('running the migration again does nothing', () => {
  const classes = [{ classId: 'c-1', period: 'Period 1', teacherOfRecord: 'a@d.org' }];
  const first = planPeriodMigration({
    students: [{ id: 'S1', classPeriod: 'Period 1', status: 'active' }],
    classes,
    periods: ['Period 1'],
  });
  assert.equal(first.studentUpdates.length, 1);

  // Apply the plan, then re-plan over the result.
  const migrated = [{ id: 'S1', status: 'active', ...first.studentUpdates[0].fields }];
  const second = planPeriodMigration({ students: migrated, classes, periods: ['Period 1'] });
  assert.equal(second.classesToCreate.length, 0);
  assert.equal(second.studentUpdates.length, 0, 'a second run must be a no-op');
  assert.equal(second.report.conflicts.length, 0);
  assert.equal(second.report.readyForScopedRule, true);
});

// --- The course My Math Path runs in ---------------------------------------------

test('the class decides the course, not the period', () => {
  const classesById = {
    'c-1': { classId: 'c-1', name: 'Algebra I — 3rd', course: 'algebra1', courseLevel: 'standard', period: 'Period 3', teacherOfRecord: 'smith@d.org' },
    'c-2': { classId: 'c-2', name: 'Algebra II Honors — 3rd', course: 'algebra2', courseLevel: 'honors', period: 'Period 3', teacherOfRecord: 'jones@d.org' },
  };
  // Same period, two students, two genuinely different courses. This is the
  // question the old period-keyed lookup could not answer at all.
  const a = resolveStudentCourseContext({ student: { classId: 'c-1', classPeriod: 'Period 3' }, classesById });
  const b = resolveStudentCourseContext({ student: { classId: 'c-2', classPeriod: 'Period 3' }, classesById });
  assert.equal(a.courseId, 'algebra1');
  assert.equal(a.courseLevel, 'standard');
  assert.equal(b.courseId, 'algebra2');
  assert.equal(b.courseLevel, 'honors');
  assert.equal(b.teacherOfRecord, 'jones@d.org');
  assert.equal(b.source, 'class');
});

test('a student with no class yet still resolves, and says so', () => {
  const legacy = resolveStudentCourseContext({
    student: { classPeriod: 'Period 4' },
    courseProfiles: { 'Period 4': { course: 'algebra2', courseLevel: 'honors' } },
  });
  assert.equal(legacy.courseId, 'algebra2');
  assert.equal(legacy.source, 'periodFallback', 'a screen can tell an admin this student needs a real class');

  const nobody = resolveStudentCourseContext({ student: { classPeriod: 'Unassigned' } });
  assert.equal(nobody.courseId, 'algebra1');
  assert.equal(nobody.source, 'unassigned');
});

test('membership keeps the period label in step with the class', () => {
  assert.deepEqual(
    membershipFieldsFor({ classId: 'c-9', period: 'Period 6', teacherOfRecord: 'a@d.org' }),
    { classId: 'c-9', classPeriod: 'Period 6', assignedTeacherEmail: 'a@d.org' },
  );
  assert.deepEqual(membershipFieldsFor(null), { classId: null, classPeriod: 'Unassigned', assignedTeacherEmail: null });
  // A class with nobody teaching it hands the student no teacher, which is
  // what the migration gate looks for.
  assert.equal(membershipFieldsFor({ classId: 'c-9', period: 'Period 6' }).assignedTeacherEmail, null);
});

// --- Who a teacher may see --------------------------------------------------------

const CLASSES = [
  { classId: 'c-1', period: 'Period 3', teacherOfRecord: 'smith@d.org' },
  { classId: 'c-2', period: 'Period 3', teacherOfRecord: 'jones@d.org' },
  { classId: 'c-3', period: 'Period 4', teacherOfRecord: 'SMITH@d.org' },
];
const STUDENTS = [
  { id: 'S1', classId: 'c-1' },
  { id: 'S2', classId: 'c-2' },
  { id: 'S3', classId: 'c-3' },
  { id: 'S4', classId: null },
];

test('a teacher\'s roster is the students in the classes they teach', () => {
  assert.deepEqual(classIdsForTeacher(CLASSES, 'smith@d.org').sort(), ['c-1', 'c-3']);
  assert.deepEqual(
    studentsForTeacher({ students: STUDENTS, classes: CLASSES, teacherEmail: 'smith@d.org' }).map((s) => s.id),
    ['S1', 'S3'],
  );
  // And nobody else's.
  assert.deepEqual(
    studentsForTeacher({ students: STUDENTS, classes: CLASSES, teacherEmail: 'jones@d.org' }).map((s) => s.id),
    ['S2'],
  );
});

test('an unknown teacher sees nobody, rather than everybody', () => {
  assert.deepEqual(classIdsForTeacher(CLASSES, ''), []);
  assert.deepEqual(studentsForTeacher({ students: STUDENTS, classes: CLASSES, teacherEmail: null }), []);
});

test('unassigned students are visible only when a screen asks for them', () => {
  const withUnassigned = studentsForTeacher({ students: STUDENTS, classes: CLASSES, teacherEmail: 'smith@d.org', includeUnassigned: true });
  assert.deepEqual(withUnassigned.map((s) => s.id), ['S1', 'S3', 'S4']);
});

// --- Three different actions, not three degrees of one -----------------------------

test('removal kinds are distinct, and only one of them destroys history', () => {
  const kinds = describeRemovalKinds();
  assert.deepEqual(kinds.map((kind) => kind.id), [
    REMOVAL_KINDS.REMOVE_FROM_CLASS,
    REMOVAL_KINDS.DISABLE_ACCOUNT,
    REMOVAL_KINDS.PERMANENT_DELETE,
  ]);

  const destructive = kinds.filter((kind) => kind.destroysHistory);
  assert.equal(destructive.length, 1, 'exactly one of these erases instructional history');
  assert.equal(destructive[0].id, REMOVAL_KINDS.PERMANENT_DELETE);
  assert.equal(destructive[0].requiresTypedConfirmation, true);

  // The two routine ones must be reversible and must not ask for a scary
  // typed confirmation, or administrators will avoid them and delete instead.
  kinds.filter((kind) => !kind.destroysHistory).forEach((kind) => {
    assert.equal(kind.reversible, true, `${kind.id} should be reversible`);
    assert.equal(kind.requiresTypedConfirmation, false, `${kind.id} should not demand typed confirmation`);
  });

  kinds.forEach((kind) => {
    assert.ok(kind.summary.length > 40, `${kind.id} must say what it actually costs`);
  });
});

test('account status is a separate axis from class membership', () => {
  assert.notEqual(ACCOUNT_STATUS.DISABLED, CLASS_STATUS.ARCHIVED);
  // Disabling an account says nothing about the class, and archiving a class
  // says nothing about the accounts in it.
  const disabled = { ...STUDENTS[0], status: ACCOUNT_STATUS.DISABLED };
  assert.equal(disabled.classId, 'c-1', 'a deactivated student is still on the roster');
});
