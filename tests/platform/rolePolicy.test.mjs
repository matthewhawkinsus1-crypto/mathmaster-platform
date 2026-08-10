import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ADMIN_ONLY_OPERATIONS, authorizeAdminOperation, authorizeRootAdmin, canReadStudent, isRootAdmin,
  isStudent, isTeacher, ownsStudentRecord,
} from '../../functions/shared/rolePolicy.mjs';

// Security is tested negatively here. Proving the administrator can act is the
// easy half; the half that matters is proving nobody else can, including by
// claiming to be someone they are not.

const ROOT = 'matthew.hawkins@desotoisd.org';
const options = { rootAdminEmail: ROOT };

const admin = { uid: 'u-admin', token: { role: 'teacher', admin: true, rootAdmin: true, email: ROOT } };
const teacher = { uid: 'u-teacher', token: { role: 'teacher', email: 'smith@desotoisd.org' } };
const otherTeacher = { uid: 'u-other', token: { role: 'teacher', email: 'jones@desotoisd.org' } };
const student = { uid: 'u-student', token: { role: 'student', studentId: 'S1' } };
const anonymous = null;

const CLASSES = [
  { classId: 'c-1', teacherOfRecord: 'smith@desotoisd.org' },
  { classId: 'c-2', teacherOfRecord: 'jones@desotoisd.org' },
];

// --- Nobody but the administrator performs an administrative operation ----------

test('every admin operation refuses a teacher, a student and a stranger', () => {
  ADMIN_ONLY_OPERATIONS.forEach((operation) => {
    assert.equal(authorizeAdminOperation(admin, { operation, ...options }).allowed, true, `${operation} must allow the root admin`);

    [['teacher', teacher], ['student', student], ['anonymous', anonymous]].forEach(([label, caller]) => {
      const decision = authorizeAdminOperation(caller, { operation, ...options });
      assert.equal(decision.allowed, false, `${operation} must refuse ${label}`);
    });
    assert.equal(authorizeAdminOperation(anonymous, { operation, ...options }).reason, 'unauthenticated');
    assert.equal(authorizeAdminOperation(teacher, { operation, ...options }).reason, 'not_root_admin');
  });
});

test('an operation nobody declared is refused rather than allowed by default', () => {
  const decision = authorizeAdminOperation(admin, { operation: 'deleteEverything', ...options });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'unknown_operation');
});

// --- Claims are necessary but never sufficient ----------------------------------

test('a teacher cannot make themselves an administrator by carrying admin claims', () => {
  // Exactly the token a compromised or mis-granted account would present.
  const forged = { uid: 'u-teacher', token: { role: 'teacher', admin: true, rootAdmin: true, email: 'smith@desotoisd.org' } };
  assert.equal(isRootAdmin(forged, options), false, 'the claims agreed; the identity did not');
  assert.equal(authorizeAdminOperation(forged, { operation: 'createStudentAccount', ...options }).allowed, false);
});

test('the root administrator still needs the claims, not just the address', () => {
  const claimless = { uid: 'u-x', token: { role: 'teacher', email: ROOT } };
  assert.equal(isRootAdmin(claimless, options), false);
  const halfway = { uid: 'u-x', token: { role: 'teacher', admin: true, email: ROOT } };
  assert.equal(isRootAdmin(halfway, options), false, 'admin without rootAdmin is not enough');
});

test('a student cannot become a teacher by asserting the role alone', () => {
  const pretender = { uid: 'u-student', token: { role: 'teacher', studentId: 'S1' } };
  // The token says teacher, so it IS a teacher — which is precisely why the
  // role lives in a server-set custom claim and never in a request body.
  assert.equal(isTeacher(pretender), true);
  // And it still buys nothing administrative.
  assert.equal(isRootAdmin(pretender, options), false);
  assert.equal(authorizeAdminOperation(pretender, { operation: 'setStudentClass', ...options }).allowed, false);
});

test('a student claim without a student id is not a student', () => {
  assert.equal(isStudent({ uid: 'u', token: { role: 'student' } }), false);
  assert.equal(isStudent({ uid: 'u', token: { role: 'student', studentId: '' } }), false);
  assert.equal(isStudent(student), true);
});

// --- A student may act only on themselves ----------------------------------------

test('a student cannot act on another student\'s record', () => {
  assert.equal(ownsStudentRecord(student, 'S1'), true);
  assert.equal(ownsStudentRecord(student, 'S2'), false, 'this is how self-enrolment in someone else\'s class is prevented');
  assert.equal(ownsStudentRecord(teacher, 'S1'), false, 'a teacher is not the owner of a student record');
});

// --- A teacher sees their own students, and only their own -----------------------

test('a teacher reads the students in the classes they teach', () => {
  const mine = { studentId: 'S1', classId: 'c-1' };
  const theirs = { studentId: 'S2', classId: 'c-2' };
  assert.equal(canReadStudent(teacher, { student: mine, classes: CLASSES, ...options }), true);
  assert.equal(canReadStudent(teacher, { student: theirs, classes: CLASSES, ...options }), false);
  assert.equal(canReadStudent(otherTeacher, { student: theirs, classes: CLASSES, ...options }), true);
});

test('a student with no class belongs to no teacher', () => {
  const orphan = { studentId: 'S9', classId: null };
  assert.equal(canReadStudent(teacher, { student: orphan, classes: CLASSES, ...options }), false);
  assert.equal(canReadStudent(otherTeacher, { student: orphan, classes: CLASSES, ...options }), false);
  // The administrator can, which is what makes them resolvable.
  assert.equal(canReadStudent(admin, { student: orphan, classes: CLASSES, ...options }), true);
});

test('a class pointing at a teacher who is not the caller does not open the record', () => {
  const student2 = { studentId: 'S2', classId: 'c-2' };
  assert.equal(canReadStudent(teacher, { student: student2, classes: CLASSES, ...options }), false);
  // Nor does a dangling classId.
  assert.equal(canReadStudent(teacher, { student: { studentId: 'S3', classId: 'c-gone' }, classes: CLASSES, ...options }), false);
});

test('a student reads their own record and nobody else\'s', () => {
  assert.equal(canReadStudent(student, { student: { studentId: 'S1', classId: 'c-1' }, classes: CLASSES, ...options }), true);
  assert.equal(canReadStudent(student, { student: { studentId: 'S2', classId: 'c-2' }, classes: CLASSES, ...options }), false);
});

test('an anonymous caller reads nothing', () => {
  assert.equal(canReadStudent(anonymous, { student: { studentId: 'S1', classId: 'c-1' }, classes: CLASSES, ...options }), false);
  assert.equal(isTeacher(anonymous), false);
  assert.equal(isStudent(anonymous), false);
  assert.equal(isRootAdmin(anonymous, options), false);
});

// --- The guard the server actually runs -------------------------------------------

test('the named-operation check and the plain guard agree', () => {
  // index.js calls `authorizeRootAdmin`; the tests above exercise
  // `authorizeAdminOperation`. If those two ever disagreed, this whole file
  // would be testing something the server does not do.
  ADMIN_ONLY_OPERATIONS.forEach((operation) => {
    [admin, teacher, student, anonymous].forEach((caller) => {
      assert.equal(
        authorizeAdminOperation(caller, { operation, ...options }).allowed,
        authorizeRootAdmin(caller, options).allowed,
        `${operation} disagreed for ${caller?.uid || 'anonymous'}`,
      );
    });
  });
});

test('every root-admin callable in the server is declared administrative', async () => {
  // A new privileged callable added without listing it here would be invisible
  // to every negative test above, so the source is checked directly.
  const source = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const guarded = [...source.matchAll(/exports\.(\w+)\s*=\s*onCall\((?:\{[^}]*\},\s*)?async \(request\) => \{\s*(?:const \w+ = )?await requireRootAdmin/g)]
    .map((match) => match[1]);

  assert.ok(guarded.length >= 8, `expected the admin callables to be found, saw ${guarded.length}`);
  guarded.forEach((name) => {
    assert.ok(
      ADMIN_ONLY_OPERATIONS.includes(name),
      `${name} is root-admin guarded in functions/index.js but missing from ADMIN_ONLY_OPERATIONS`,
    );
  });
});

test('email comparison does not care about spelling case or padding', () => {
  const shouty = { uid: 'u', token: { role: 'teacher', admin: true, rootAdmin: true, email: ` ${ROOT.toUpperCase()} ` } };
  assert.equal(isRootAdmin(shouty, options), true);
  const upperTeacher = { uid: 'u', token: { role: 'teacher', email: 'SMITH@desotoisd.org' } };
  assert.equal(canReadStudent(upperTeacher, { student: { studentId: 'S1', classId: 'c-1' }, classes: CLASSES, ...options }), true);
});
