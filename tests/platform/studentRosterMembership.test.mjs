/*
 * ASK MY TEACHER FOLLOWS THE CLASS, NOT ONLY THE TEACHER (the November build's section 6, teacher features).
 *
 * A student moved to another class while signed in saw the change only after a reload. Their screens kept the class
 * they left: its lessons, its period's bell times and DOL windows, its course and level, and the class and teacher a
 * question for the teacher or support evidence was sent to, which firestore.rules refused, since the roster row named
 * the new class (the rules read the row; tests/rules/assignmentPrivacyRules.test.mjs proves the reads the new class
 * needs). A class handed to another teacher was already followed (teacher features walk, item 10). Now what the
 * student's screens read about their class follows the roster row while they stay signed in
 * (src/platform/student/rosterMembership.js), as a fresh load reads it:
 *   - a handover moves the teacher only; a move takes the new class whole, its teacher with it, never one without the
 *     other;
 *   - sign-in and the move read the class the same way (studentClassFields), so a moved session is the session a fresh
 *     load would give;
 *   - the class left's lessons the student has work on stay, as prior work, and its other lessons go
 *     (studentAssignmentScope.js priorWorkFromClassLeft);
 *   - a support revision keeps the course and level the class sets: before, it took them with it, so the Path and the
 *     lessons' rigor fell back to Algebra I standard until a reload.
 * Node cannot render App.jsx: the model is run here, and the wiring read as source. The browser proof is
 * tests/browser/teacherWorkflow/askMyTeacherJourneys.mjs, journey T2.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  followRosterClass, followSupportProfile, rosterMembershipOf, sameRosterMembership, studentClassFields,
} from '../../src/platform/student/rosterMembership.js';
import { priorWorkFromClassLeft } from '../../src/platform/assignments/studentAssignmentScope.js';
import { buildTeacherQuestion } from '../../src/platform/supports/askTeacher.js';
import { membershipFieldsFor } from '../../functions/shared/classModel.mjs';

const T3 = 'teacher.three@district.example';
const T5 = 'teacher.five@district.example';
const CLASSES = {
  'c-alg2-p3': { classId: 'c-alg2-p3', name: 'Algebra II — Period 3', period: 'Period 3', course: 'algebra2', courseLevel: 'honors', teacherOfRecord: T3 },
  'c-alg1-p5': { classId: 'c-alg1-p5', name: 'Algebra I — Period 5', period: 'Period 5', course: 'algebra1', courseLevel: 'standard', teacherOfRecord: T5 },
};
const COURSE_PROFILES = { 'Period 7': { course: 'algebra2', courseLevel: 'standard' } };
// The row as the server writes it for a class (setStudentClass: membershipFieldsFor), beside the student's own fields.
const rowIn = (classId) => ({ firstName: 'Ana', gradesByAssignment: {}, profile: {}, ...membershipFieldsFor(classId ? CLASSES[classId] : null) });
const SUPPORTS = { inclusionStatus: false, accommodations: ['text-to-speech'], modifications: [], translationLanguage: null };
// The session sign-in builds from a row (App.jsx hydrateSession: studentClassFields, the profile's supports, then the
// course and level the class sets).
const signedIn = (row) => {
  const { course, courseLevel, ...fields } = studentClassFields({ rosterRow: row, classesById: CLASSES, courseProfiles: COURSE_PROFILES });
  return { id: '910021', uid: 'uid-910021', role: 'student', displayName: 'Ana D.', ...fields, profile: { ...SUPPORTS, course, courseLevel }, timingProfile: null };
};

test('the row\'s membership is its class, period and teacher, and the same membership is the same', () => {
  assert.deepEqual(rosterMembershipOf(rowIn('c-alg1-p5')), { classId: 'c-alg1-p5', classPeriod: 'Period 5', assignedTeacherEmail: T5 });
  assert.deepEqual(rosterMembershipOf(rowIn(null)), { classId: null, classPeriod: 'Unassigned', assignedTeacherEmail: null });
  assert.deepEqual(rosterMembershipOf(undefined), { classId: null, classPeriod: null, assignedTeacherEmail: null });
  assert.equal(sameRosterMembership(rosterMembershipOf(rowIn('c-alg1-p5')), rosterMembershipOf({ ...rowIn('c-alg1-p5'), gradesByAssignment: { a: {} } })), true, 'an answer saved is no change');
  assert.equal(sameRosterMembership(rosterMembershipOf(rowIn('c-alg1-p5')), rosterMembershipOf(rowIn('c-alg2-p3'))), false);
  assert.equal(sameRosterMembership(rosterMembershipOf(rowIn('c-alg1-p5')), { ...rosterMembershipOf(rowIn('c-alg1-p5')), assignedTeacherEmail: T3 }), false, 'a handover is a change');
  assert.equal(sameRosterMembership(null, rosterMembershipOf(rowIn('c-alg1-p5'))), false, 'the first snapshot is one');
});

test('a session reads its class from the row and the class\'s record, the row\'s teacher verbatim', () => {
  assert.deepEqual(studentClassFields({ rosterRow: rowIn('c-alg2-p3'), classesById: CLASSES }), {
    classId: 'c-alg2-p3', className: 'Algebra II — Period 3', classPeriod: 'Period 3', teacherOfRecord: T3,
    assignedTeacherEmail: T3, course: 'algebra2', courseLevel: 'honors',
  });
  // The rules compare the row's teacher, so it is kept as written, even where the class's record says another.
  assert.equal(studentClassFields({ rosterRow: { ...rowIn('c-alg2-p3'), assignedTeacherEmail: 'Teacher.Three@District.example' }, classesById: CLASSES }).assignedTeacherEmail, 'Teacher.Three@District.example');
  // A student no class has: the period's course setting, as before.
  assert.deepEqual(studentClassFields({ rosterRow: { classId: null, classPeriod: 'Period 7', assignedTeacherEmail: null }, classesById: CLASSES, courseProfiles: COURSE_PROFILES }), {
    classId: null, className: null, classPeriod: 'Period 7', teacherOfRecord: null, assignedTeacherEmail: null, course: 'algebra2', courseLevel: 'standard',
  });
});

test('a move while signed in takes the new class whole, as a fresh load reads it, and nothing else about the student', () => {
  const before = signedIn(rowIn('c-alg1-p5'));
  const moved = followRosterClass(before, rowIn('c-alg2-p3'), { classesById: CLASSES, courseProfiles: COURSE_PROFILES });
  // The session a fresh load after the move would give: the class, its name, period, teachers, course and level.
  assert.deepEqual(moved, signedIn(rowIn('c-alg2-p3')));
  assert.deepEqual([moved.classId, moved.classPeriod, moved.assignedTeacherEmail, moved.profile.course, moved.profile.courseLevel], ['c-alg2-p3', 'Period 3', T3, 'algebra2', 'honors']);
  assert.deepEqual(moved.profile.accommodations, ['text-to-speech'], 'the student\'s own supports stay');
  assert.equal(moved.displayName, before.displayName);
  // The pair the rules check a question against: the new class and its teacher, together.
  const question = buildTeacherQuestion({ studentId: moved.id, classId: moved.classId, teacherEmail: moved.assignedTeacherEmail, assignmentId: 'a-today', questionIndex: 0, text: 'Do I subtract first?', timestamp: 1 });
  assert.deepEqual([question.data.classId, question.data.teacherEmail], ['c-alg2-p3', T3]);
  // Taken out of every class: no class and no teacher (nobody to send to), and the period's course setting.
  const unplaced = followRosterClass(before, { ...rowIn(null), classPeriod: 'Period 7' }, { classesById: CLASSES, courseProfiles: COURSE_PROFILES });
  assert.deepEqual([unplaced.classId, unplaced.className, unplaced.assignedTeacherEmail, unplaced.profile.course], [null, null, null, 'algebra2']);
  // A class this session has no record of (App.jsx reads the classes once first): the row's class and teacher, as a
  // sign-in that cannot read the class has them.
  const unread = followRosterClass(before, { classId: 'c-new', classPeriod: 'Period 7', assignedTeacherEmail: T3 }, { classesById: CLASSES, courseProfiles: COURSE_PROFILES });
  assert.deepEqual([unread.classId, unread.className, unread.classPeriod, unread.assignedTeacherEmail], ['c-new', null, 'Period 7', T3]);
});

test('a handover moves only the teacher, and nothing that changed nothing gives a new user', () => {
  const student = signedIn(rowIn('c-alg1-p5'));
  assert.equal(followRosterClass(student, rowIn('c-alg1-p5'), { classesById: CLASSES }), student, 'the row as sign-in read it: React keeps its render');
  const handedOver = followRosterClass(student, { ...rowIn('c-alg1-p5'), assignedTeacherEmail: T3 }, { classesById: CLASSES });
  assert.deepEqual(handedOver, { ...student, assignedTeacherEmail: T3 });
  assert.equal(followRosterClass(null, rowIn('c-alg2-p3')), null, 'nobody signed in');
  assert.equal(followRosterClass(student, undefined), student, 'no row yet');
});

test('a support revision keeps the course and level the class sets', () => {
  const student = signedIn(rowIn('c-alg2-p3'));
  assert.equal(followSupportProfile(student, { ...SUPPORTS }), student, 'the same supports: nothing moves');
  const revised = followSupportProfile(student, { ...SUPPORTS, accommodations: ['text-to-speech', 'extra-time'] });
  assert.deepEqual(revised.profile, { ...SUPPORTS, accommodations: ['text-to-speech', 'extra-time'], course: 'algebra2', courseLevel: 'honors' });
  assert.equal(followSupportProfile(null, SUPPORTS), null);
});

test('after a move, the class left\'s lessons with the student\'s work stay as prior work, and its other lessons go', () => {
  const left = [
    { id: 'a-p5', assignedClassIds: ['c-alg1-p5'] },
    { id: 'a-p5-unworked', assignedClassIds: ['c-alg1-p5'] },
    { id: 'a-both', assignedClassIds: ['c-alg1-p5', 'c-alg2-p3'] },
  ];
  const worked = ['a-p5', 'a-both', 'a-elsewhere', ''];
  assert.deepEqual(priorWorkFromClassLeft({ classAssignments: left, classId: 'c-alg2-p3', workedIds: worked }).map((entry) => entry.id), ['a-p5'], 'not the unworked one; not one the new class has too, which comes with it');
  // The same class's own lessons are never "left": an ordinary snapshot keeps nothing aside.
  assert.deepEqual(priorWorkFromClassLeft({ classAssignments: left, classId: 'c-alg1-p5', workedIds: worked }), []);
  // Taken out of every class: every worked lesson of the class left stays.
  assert.deepEqual(priorWorkFromClassLeft({ classAssignments: left, classId: null, workedIds: worked }).map((entry) => entry.id), ['a-p5', 'a-both']);
  assert.deepEqual(priorWorkFromClassLeft({}), []);
});

test('the app follows the row: sign-in and the listener read the class the same way, and the class listener keeps the work', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /^import \{ followRosterClass, followSupportProfile, rosterMembershipOf, sameRosterMembership, studentClassFields \} from '\.\/platform\/student\/rosterMembership\.js';$/m);
  // Sign-in: the class fields from the row, and the course and level into the profile.
  const hydrate = region(app, 'const hydrateSession = async', 'hydrateSession();', 'hydrateSession');
  assert.match(hydrate, /const \{ course: classCourse, courseLevel: classCourseLevel, \.\.\.classFields \} = studentClassFields\(\{\s*rosterRow: studentData,/);
  assert.match(hydrate, /\.\.\.classFields,\s*profile: \{\s*\.\.\.studentProfile,\s*course: classCourse,\s*courseLevel: classCourseLevel,\s*\},/);
  // The grade document's listener: each snapshot's membership, and supports through followSupportProfile.
  const listener = region(app, "doc(db, 'grades', user.id),", 'Object.entries(next).forEach', 'the grade document listener');
  assert.match(listener, /setUser\(\(current\) => followSupportProfile\(current, liveProfile\)\);/);
  assert.match(listener, /const membership = rosterMembershipOf\(snapshot\.data\(\)\);\s*setStudentRosterMembership\(\(current\) => \(sameRosterMembership\(current, membership\) \? current : membership\)\);/);
  // Forgotten whenever the listener opens or closes: another account's row is never followed into this one's session.
  const opens = region(app, 'const [studentRosterMembership, setStudentRosterMembership] = useState(null);', 'return onSnapshot(', 'the grade document listener\'s opening');
  assert.match(opens, /useEffect\(\(\) => \{\s*if \(user\?\.role !== 'student' \|\| !user\.id\) \{\s*setStudentRosterMembership\(null\);[\s\S]*return undefined;\s*\}\s*setStudentRosterMembership\(null\);\s*$/);
  const listenerEffect = region(app, 'const [studentRosterMembership, setStudentRosterMembership] = useState(null);', 'const classReadForRosterRef = useRef(null);', 'the grade document listener');
  assert.match(listenerEffect, /\}, \[user\?\.role, user\?\.id, toastSuccess\]\);\s*$/, 'the listener opens again for each account');
  // The follower: a class the session has, or the student's own, at once; another read once first, then followed.
  const follower = region(app, 'const classReadForRosterRef = useRef(null);', '\n  }, [user?.role, user?.classId, studentRosterMembership, classesById, courseProfiles]);', 'the roster row\'s follower');
  assert.match(follower, /const follow = \(byId\) => setUser\(\(current\) => followRosterClass\(current, studentRosterMembership, \{ classesById: byId, courseProfiles \}\)\);/);
  assert.match(follower, /if \(!classId \|\| classId === \(user\.classId \|\| null\) \|\| classesById\[classId\] \|\| classReadForRosterRef\.current === classId\) \{\s*follow\(classesById\);/);
  assert.match(follower, /classReadForRosterRef\.current = classId;[\s\S]*fetchClasses\(\)\.then\(\(loaded\) => \{ if \(!cancelled\) follow\(/);
  // The class listener follows user.classId, and on each snapshot keeps the class left's worked lessons as prior work.
  const classListener = region(app, "if (user.role === 'student') {\n      return subscribeStudentClassAssignments({", '(error) =>', 'the class listener');
  assert.match(classListener, /classId: user\.classId,/);
  assert.match(classListener, /const keptFromClassLeft = priorWorkFromClassLeft\(\{ classAssignments: studentClassAssignmentsRef\.current, classId: user\.classId, workedIds: studentWorkedIds \}\);\s*if \(keptFromClassLeft\.length\) studentPriorWorkAssignmentsRef\.current = mergeStudentAssignments\(studentPriorWorkAssignmentsRef\.current, keptFromClassLeft\);\s*studentClassAssignmentsRef\.current = classAssignments;/);
  assert.match(app, /const studentWorkedIds = user\.role === 'student' \? workedAssignmentKey\(tracker, individuallyAssignedTestCycleIds\(testCycleGrades\)\)\.split\('\|'\) : \[\];/);
  assert.match(app, /\}, \[user\?\.role, user\?\.id, user\?\.classId\]\);/, 'the listener opens again for the new class');
});
