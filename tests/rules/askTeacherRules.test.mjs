import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import {
  HELP_ACKNOWLEDGEMENT_COLLECTION, TEACHER_QUESTION_COLLECTION,
} from '../../src/platform/supports/askTeacher.js';
import {
  acknowledgeHelpRequest,
  answerTeacherQuestion,
  myTeacherQuestionsQuery,
  openTeacherQuestionsQuery,
  sendTeacherQuestion,
} from '../../src/platform/supports/askTeacherStore.js';

// "Ask my teacher" that answers back (student pass 3, HELP-5, D6), through the
// real Security Rules in the Firestore emulator (`npm run test:rules`), using
// the very queries and writes the app makes (askTeacherStore.js).
//
// Proven here, by the database rather than by a screen:
//   1. only a student writes their own question, only to the teacher on their
//      roster row, about one question of a real assignment of their own class,
//      a few sentences long;
//   2. only that student and their teacher read it — by id and by the queries
//      the student's screen and Teacher Home run — and nobody else;
//   3. only the teacher answers, and the answer is all a teacher can change;
//      the student may reword a question only while it is unanswered;
//   4. the in-class "Seen" / "On my way" is written only by the student's
//      teacher, only for the hand presence is raising now, and read by that
//      student; it carries no text;
//   5. no browser deletes either.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against one emulator.

const PROJECT = 'mathmaster-ask-teacher-rules';
const ROOT_ADMIN = 'matthew.hawkins@desotoisd.org';
const TEACHER_A = 'aq.teacher.a@example.org';
const TEACHER_B = 'aq.teacher.b@example.org';
const HAND_AT = 1_790_000_000_000;

let env;
const admin = () => env.authenticatedContext('uid-admin', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'AQ_STUDENT_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'AQ_STUDENT_B' }).firestore();
const unplaced = () => env.authenticatedContext('uid-su', { role: 'student', studentId: 'AQ_UNPLACED' }).firestore();
const stranger = () => env.unauthenticatedContext().firestore();

const QUESTION_ID = 'AQ_STUDENT_A__A1__2';
const ask = (overrides = {}) => ({
  studentId: 'AQ_STUDENT_A',
  classId: 'class-a',
  teacherEmail: TEACHER_A,
  assignmentId: 'A1',
  assignmentTitle: 'Lesson 4: Slope',
  questionIndex: 2,
  questionLabel: 'Classwork · Question 3',
  text: 'I got m = 2 but it says not quite. Is the rise the change in y?',
  ...overrides,
});
// A raw create, for the shapes the app never sends.
const rawQuestion = (overrides = {}) => ({
  schemaVersion: 1,
  studentId: 'AQ_STUDENT_A',
  classId: 'class-a',
  teacherEmail: TEACHER_A,
  assignmentId: 'A1',
  assignmentTitle: 'Lesson 4: Slope',
  questionIndex: 2,
  questionLabel: 'Classwork · Question 3',
  text: 'Why?',
  status: 'open',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});
const questionRef = (db, id = QUESTION_ID) => doc(db, TEACHER_QUESTION_COLLECTION, id);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/AQ_STUDENT_A'), { displayName: 'Student A', classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active' });
    await setDoc(doc(db, 'grades/AQ_STUDENT_B'), { displayName: 'Student B', classId: 'class-b', classPeriod: 'Period 2', assignedTeacherEmail: TEACHER_B, status: 'active' });
    await setDoc(doc(db, 'grades/AQ_UNPLACED'), { displayName: 'Unplaced', classId: null, classPeriod: 'Unassigned', assignedTeacherEmail: null, status: 'active' });
    // Teacher A's student with no presence document (never opened the app).
    await setDoc(doc(db, 'grades/AQ_STUDENT_C'), { displayName: 'Student C', classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active' });
    // The assignments questions are about: A1 is class A's (and class B's,
    // for the handover below), A3 another class's.
    await setDoc(doc(db, 'assignments/A1'), { title: 'Lesson 4: Slope', assignedClassIds: ['class-a', 'class-b'] });
    await setDoc(doc(db, 'assignments/A3'), { title: 'Another class', assignedClassIds: ['class-z'] });
    // Student A's hand is raised on A1 (what the heartbeat writes).
    await setDoc(doc(db, 'presence/AQ_STUDENT_A'), { studentId: 'AQ_STUDENT_A', classId: 'class-a', assignmentId: 'A1', helpRequestedAt: HAND_AT, helpQuestionIndex: 2 });
    await setDoc(doc(db, 'presence/AQ_STUDENT_B'), { studentId: 'AQ_STUDENT_B', classId: 'class-b', assignmentId: 'A2' });
  });
});

after(async () => {
  await env?.cleanup();
});

/* ------------------------------------------------- writing a question */

test('only the student writes their own question, to the teacher on their roster row', async () => {
  // The app's own send.
  await assertSucceeds(sendTeacherQuestion(studentA(), ask()));
  let stored = null;
  await env.withSecurityRulesDisabled(async (context) => { stored = (await getDoc(questionRef(context.firestore()))).data(); });
  assert.equal(stored.status, 'open');
  assert.equal(stored.teacherEmail, TEACHER_A);

  // Not to another teacher, not as another student, not from a teacher.
  await assertFails(setDoc(questionRef(studentA(), 'AQ_STUDENT_A__A1__3'), rawQuestion({ questionIndex: 3, teacherEmail: TEACHER_B })));
  await assertFails(setDoc(questionRef(studentA(), 'AQ_STUDENT_B__A1__3'), rawQuestion({ studentId: 'AQ_STUDENT_B', classId: 'class-b', teacherEmail: TEACHER_B, questionIndex: 3 })));
  await assertFails(setDoc(questionRef(studentB(), 'AQ_STUDENT_A__A1__3'), rawQuestion({ questionIndex: 3 })));
  await assertFails(setDoc(questionRef(teacherA(), 'AQ_STUDENT_A__A1__3'), rawQuestion({ questionIndex: 3 })));
  await assertFails(setDoc(questionRef(stranger(), 'AQ_STUDENT_A__A1__3'), rawQuestion({ questionIndex: 3 })));
  // A student nobody has placed has no teacher to ask.
  await assertFails(sendTeacherQuestion(unplaced(), ask({ studentId: 'AQ_UNPLACED', classId: null, teacherEmail: 'anyone@example.org' })));
  // Another class than the roster row's.
  await assertFails(setDoc(questionRef(studentA(), 'AQ_STUDENT_A__A1__3'), rawQuestion({ questionIndex: 3, classId: 'class-b' })));
});

test('a question is about one question of one assignment, and a few sentences long', async () => {
  const id = 'AQ_STUDENT_A__A1__4';
  // The id names the student, the assignment and the question: no second
  // question on the same item, and no free-form id.
  await assertFails(setDoc(questionRef(studentA(), 'AQ_STUDENT_A__A1__99'), rawQuestion({ questionIndex: 4 })));
  await assertFails(setDoc(questionRef(studentA(), 'free-form-id'), rawQuestion({ questionIndex: 4 })));
  await assertFails(setDoc(questionRef(studentA(), id), rawQuestion({ questionIndex: 4, text: 'x'.repeat(501) })));
  await assertFails(setDoc(questionRef(studentA(), id), rawQuestion({ questionIndex: 4, text: '' })));
  await assertFails(setDoc(questionRef(studentA(), id), rawQuestion({ questionIndex: 4, text: 42 })));
  // Born open, unanswered, with the server's time, and nothing else.
  await assertFails(setDoc(questionRef(studentA(), id), rawQuestion({ questionIndex: 4, status: 'answered' })));
  await assertFails(setDoc(questionRef(studentA(), id), rawQuestion({ questionIndex: 4, answer: 'Yes, it is.' })));
  await assertFails(setDoc(questionRef(studentA(), id), rawQuestion({ questionIndex: 4, response: 'm=2' })));
  await assertFails(setDoc(questionRef(studentA(), id), rawQuestion({ questionIndex: 4, createdAt: 1 })));
  await assertFails(setDoc(questionRef(studentA(), id), rawQuestion({ questionIndex: 4, questionLabel: 'x'.repeat(121) })));
  await assertSucceeds(setDoc(questionRef(studentA(), id), rawQuestion({ questionIndex: 4, text: 'x'.repeat(500) })));
});

test('a question is about a real assignment of the student\'s own class — not an id made up to fill a teacher\'s list', async () => {
  // An assignment that does not exist, at any position.
  await assertFails(setDoc(questionRef(studentA(), 'AQ_STUDENT_A__NO_SUCH__0'), rawQuestion({ assignmentId: 'NO_SUCH', questionIndex: 0 })));
  await assertFails(setDoc(questionRef(studentA(), 'AQ_STUDENT_A__junk7__999'), rawQuestion({ assignmentId: 'junk7', questionIndex: 999 })));
  // A real assignment, but another class's.
  await assertFails(setDoc(questionRef(studentA(), 'AQ_STUDENT_A__A3__0'), rawQuestion({ assignmentId: 'A3', questionIndex: 0 })));
  // A student with no class on their roster row has no class assignment.
  await assertFails(setDoc(questionRef(unplaced(), 'AQ_UNPLACED__A1__0'), rawQuestion({ studentId: 'AQ_UNPLACED', classId: null, teacherEmail: null, questionIndex: 0 })));
  // The teacher's waiting list holds none of them.
  const inbox = await getDocs(openTeacherQuestionsQuery(teacherA(), { teacherEmail: TEACHER_A }));
  assert.equal(inbox.docs.some((entry) => /NO_SUCH|junk7|__A3__/.test(entry.id)), false);
});

/* ------------------------------------------------- reading a question */

test('only that student and their teacher read it — by id and by the queries the app runs', async () => {
  await assertSucceeds(getDoc(questionRef(studentA())));
  const own = await assertSucceeds(getDocs(myTeacherQuestionsQuery(studentA(), { studentId: 'AQ_STUDENT_A', assignmentId: 'A1' })));
  assert.ok(own.docs.some((entry) => entry.id === QUESTION_ID));
  await assertSucceeds(getDoc(questionRef(teacherA())));
  const inbox = await assertSucceeds(getDocs(openTeacherQuestionsQuery(teacherA(), { teacherEmail: TEACHER_A })));
  assert.ok(inbox.docs.some((entry) => entry.id === QUESTION_ID), 'Teacher Home lists it');
  await assertSucceeds(getDoc(questionRef(admin())));

  // A classmate, another teacher, nobody signed in.
  await assertFails(getDoc(questionRef(studentB())));
  await assertFails(getDocs(myTeacherQuestionsQuery(studentB(), { studentId: 'AQ_STUDENT_A', assignmentId: 'A1' })));
  await assertFails(getDoc(questionRef(teacherB())));
  await assertFails(getDocs(openTeacherQuestionsQuery(teacherB(), { teacherEmail: TEACHER_A })));
  const otherInbox = await assertSucceeds(getDocs(openTeacherQuestionsQuery(teacherB(), { teacherEmail: TEACHER_B })));
  assert.equal(otherInbox.docs.some((entry) => entry.id === QUESTION_ID), false);
  await assertFails(getDoc(questionRef(stranger())));

  // Queries no screen runs, which would reach past those two parties: a
  // teacher by another teacher's student, a teacher or student listing
  // everything, a student by assignment alone.
  const questions = (db) => collection(db, TEACHER_QUESTION_COLLECTION);
  await assertFails(getDocs(query(questions(teacherA()), where('studentId', '==', 'AQ_STUDENT_B'))));
  await assertFails(getDocs(questions(teacherA())));
  await assertFails(getDocs(questions(studentA())));
  await assertFails(getDocs(query(questions(studentA()), where('assignmentId', '==', 'A1'))));
  await assertFails(getDocs(query(questions(studentB()), where('teacherEmail', '==', TEACHER_A))));
});

/* --------------------------------------------- rewording and answering */

test('the student rewords only an unanswered question; only the teacher answers, and only the answer', async () => {
  const open = { id: QUESTION_ID, status: 'open' };
  await assertSucceeds(sendTeacherQuestion(studentA(), ask({ existing: open, text: 'Is the rise the change in y or in x?' })));
  await assertFails(updateDoc(questionRef(studentB()), { text: 'Hijacked', updatedAt: serverTimestamp() }));
  // A student cannot answer their own question or mark it answered.
  await assertFails(updateDoc(questionRef(studentA()), { status: 'answered', answer: 'self', answeredBy: 'x', answeredAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(questionRef(studentA()), { teacherEmail: TEACHER_B, updatedAt: serverTimestamp() }));
  // Where it was asked and by whom stay as created.
  for (const change of [{ assignmentId: 'A3' }, { questionIndex: 7 }, { classId: 'class-b' }, { assignmentTitle: 'MESSAGE FROM THE PRINCIPAL' }, { questionLabel: 'Call home' }, { studentId: 'AQ_STUDENT_B' }]) {
    await assertFails(updateDoc(questionRef(studentA()), { ...change, updatedAt: serverTimestamp() }));
  }

  // Another teacher cannot answer it.
  await assertFails(answerTeacherQuestion(teacherB(), { questionId: QUESTION_ID, answer: 'Not my student.', teacherEmail: TEACHER_B }));
  // The teacher's answer is the answer — not the student's words, not someone else's name.
  await assertFails(updateDoc(questionRef(teacherA()), { text: 'Rewritten by teacher', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(questionRef(teacherA()), { status: 'answered', answer: 'Yes.', answeredBy: TEACHER_B, answeredAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(questionRef(teacherA()), { status: 'answered', answer: 'y'.repeat(1001), answeredBy: TEACHER_A, answeredAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(questionRef(teacherA()), { status: 'answered', answer: 'Yes.', answeredBy: TEACHER_A, answeredAt: 5, updatedAt: serverTimestamp() }));
  // Answering moves nothing else: not whose question it is, not to whom, not where.
  const answer = { status: 'answered', answer: 'Yes.', answeredBy: TEACHER_A, answeredAt: serverTimestamp(), updatedAt: serverTimestamp() };
  for (const change of [{ studentId: 'AQ_STUDENT_B' }, { teacherEmail: TEACHER_B }, { assignmentId: 'A3' }, { questionIndex: 7 }]) {
    await assertFails(updateDoc(questionRef(teacherA()), { ...answer, ...change }));
  }
  await assertSucceeds(answerTeacherQuestion(teacherA(), { questionId: QUESTION_ID, answer: 'Yes: rise is the change in y. Count it from the first point to the second.', teacherEmail: TEACHER_A }));

  // The student reads the answer; an answered question is not reworded.
  const answered = (await getDoc(questionRef(studentA()))).data();
  assert.equal(answered.status, 'answered');
  assert.match(answered.answer, /rise is the change in y/);
  await assertFails(sendTeacherQuestion(studentA(), ask({ existing: { id: QUESTION_ID, status: 'open' }, text: 'One more thing' })));
  // Nor re-created over, nor reopened by the teacher.
  await assertFails(setDoc(questionRef(studentA()), rawQuestion()));
  await assertFails(updateDoc(questionRef(teacherA()), { status: 'open', updatedAt: serverTimestamp() }));
  // It left the teacher's waiting list.
  const inbox = await getDocs(openTeacherQuestionsQuery(teacherA(), { teacherEmail: TEACHER_A }));
  assert.equal(inbox.docs.some((entry) => entry.id === QUESTION_ID), false);
});

test('no browser deletes a question', async () => {
  await assertFails(deleteDoc(questionRef(studentA())));
  await assertFails(deleteDoc(questionRef(teacherA())));
  await assertFails(deleteDoc(questionRef(admin())));
});

/* -------------------------------------------------- "Seen / on my way" */

const ackRef = (db, studentId = 'AQ_STUDENT_A') => doc(db, HELP_ACKNOWLEDGEMENT_COLLECTION, studentId);
const rawAck = (overrides = {}) => ({
  studentId: 'AQ_STUDENT_A', assignmentId: 'A1', helpRequestedAt: HAND_AT, status: 'seen', teacherEmail: TEACHER_A, acknowledgedAt: serverTimestamp(), ...overrides,
});

test('only the student\'s teacher answers a raised hand, only the hand raised now, with one of two words', async () => {
  await assertSucceeds(acknowledgeHelpRequest(teacherA(), { studentId: 'AQ_STUDENT_A', assignmentId: 'A1', helpRequestedAt: HAND_AT, status: 'onMyWay', teacherEmail: TEACHER_A }));
  // Another teacher, the student, a classmate.
  await assertFails(setDoc(ackRef(teacherB()), rawAck({ teacherEmail: TEACHER_B })));
  await assertFails(setDoc(ackRef(studentA()), rawAck()));
  await assertFails(setDoc(ackRef(studentB()), rawAck()));
  // A hand that is not up: another time, another assignment, a student with no hand.
  await assertFails(setDoc(ackRef(teacherA()), rawAck({ helpRequestedAt: HAND_AT - 60000 })));
  await assertFails(setDoc(ackRef(teacherA()), rawAck({ assignmentId: 'A9' })));
  await assertFails(setDoc(ackRef(teacherB(), 'AQ_STUDENT_B'), rawAck({ studentId: 'AQ_STUDENT_B', assignmentId: 'A2', teacherEmail: TEACHER_B })));
  // Their own student with no presence document at all.
  await assertFails(setDoc(ackRef(teacherA(), 'AQ_STUDENT_C'), rawAck({ studentId: 'AQ_STUDENT_C' })));
  // Words and names the platform does not send.
  await assertFails(setDoc(ackRef(teacherA()), rawAck({ status: 'come to my desk now' })));
  await assertFails(setDoc(ackRef(teacherA()), rawAck({ message: 'Hi' })));
  await assertFails(setDoc(ackRef(teacherA()), rawAck({ teacherEmail: TEACHER_B })));
  await assertFails(setDoc(ackRef(teacherA()), rawAck({ acknowledgedAt: 1 })));
  await assertFails(setDoc(ackRef(teacherA()), rawAck({ studentId: 'AQ_STUDENT_B' })));
});

test('the student reads the answer to their hand; a classmate and another teacher do not; nobody deletes it', async () => {
  const seen = await assertSucceeds(getDoc(ackRef(studentA())));
  assert.equal(seen.data().status, 'onMyWay');
  await assertSucceeds(getDoc(ackRef(teacherA())));
  await assertFails(getDoc(ackRef(studentB())));
  await assertFails(getDoc(ackRef(teacherB())));
  await assertFails(getDoc(ackRef(stranger())));
  // A student with no acknowledgement yet can still listen for one.
  await assertSucceeds(getDoc(ackRef(studentB(), 'AQ_STUDENT_B')));
  await assertFails(deleteDoc(ackRef(teacherA())));
  await assertFails(deleteDoc(ackRef(studentA())));
});

/* ------------------------------------------- the class changed hands */

test('after the class changes hands, the student\'s current teacher reads and answers; the previous one still reads what was sent to them', async () => {
  const id = 'AQ_STUDENT_A__A1__4';
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'grades/AQ_STUDENT_A'), { assignedTeacherEmail: TEACHER_B, classId: 'class-b' });
  });
  await assertSucceeds(getDoc(questionRef(teacherB(), id)));
  await assertSucceeds(answerTeacherQuestion(teacherB(), { questionId: id, answer: 'I am your teacher now — let us go over it tomorrow.', teacherEmail: TEACHER_B }));
  await assertSucceeds(getDoc(questionRef(teacherA(), id)));
  // The previous teacher no longer answers the student's raised hand.
  await assertFails(setDoc(ackRef(teacherA()), rawAck()));
  // A new question now goes to the new teacher only.
  await assertFails(sendTeacherQuestion(studentA(), ask({ questionIndex: 5, classId: 'class-b', teacherEmail: TEACHER_A })));
  await assertSucceeds(sendTeacherQuestion(studentA(), ask({ questionIndex: 5, classId: 'class-b', teacherEmail: TEACHER_B })));
});
