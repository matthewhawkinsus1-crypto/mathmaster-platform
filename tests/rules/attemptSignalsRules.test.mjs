import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

import {
  ATTEMPT_SIGNAL_KIND, attemptSignalDocumentId, buildAttemptSignalRecord,
} from '../../src/platform/signals/attemptSignalFacts.js';
import { buildLiveStatus } from '../../src/livePresence.js';

// grades/{studentId}/attemptSignals/{signalId} — the teacher signals
// (docs/platform/SHOWING_THE_PROCESS.md, section 7), through the real Security
// Rules in the Firestore emulator (`npm run test:rules`). Proven by the
// database, not by a screen:
//   * a student's client writes the record the app builds, once, for itself;
//   * the record is facts only: any key a response, a pasted text, a
//     keystroke log or a screenshot could ride in under is refused;
//   * only the teacher who teaches the student reads it: not the student, not
//     a classmate, not another teacher, not a signed-out browser;
//   * nobody edits or deletes a fact; that teacher may dismiss it, as
//     themselves and at the server's time, and change nothing else;
//   * the heartbeat's count is a small whole number;
//   * the context beside a fact is a yes or no for class time and catalog
//     support ids, nothing else;
//   * a fact names a real assignment given to the student, and one of its
//     questions: made-up ids and positions cannot flood a record;
//   * a review is who, when and an optional short note, once.
//
// Synthetic identities only. Own projectId: rules suites run in parallel.

const PROJECT = 'mathmaster-attempt-signals-rules';
const TEACHER_A = 'teacher.a@example.test';
const TEACHER_B = 'teacher.b@example.test';

let env;
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const root = () => env.authenticatedContext('uid-root', { role: 'teacher', admin: true, rootAdmin: true, email: 'root.admin@example.test' }).firestore();
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'S_B' }).firestore();
const studentGone = () => env.authenticatedContext('uid-sg', { role: 'student', studentId: 'S_GONE' }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const FACTS = {
  leftThenRight: { kind: ATTEMPT_SIGNAL_KIND.LEFT_THEN_RIGHT, partCount: 3, awaySeconds: 45, attemptNumber: 1 },
  pasted: { kind: ATTEMPT_SIGNAL_KIND.PASTED, partIndex: 2, attemptNumber: 2 },
  hardFirstTry: { kind: ATTEMPT_SIGNAL_KIND.HARD_FIRST_TRY, difficultyBand: 4, partCount: 4, attemptNumber: 1 },
};
// Exactly what attemptSignalWriter.js writes.
const recordFor = (kind, { studentId = 'S_A', assignmentId = 'a-1', questionIndex = 3, context = {} } = {}) => {
  const record = buildAttemptSignalRecord({ studentId, assignmentId, questionIndex, activityRole: 'classwork', fact: FACTS[kind], ...context });
  return { id: attemptSignalDocumentId(record), data: { ...record, recordedAt: serverTimestamp() } };
};
const signalRef = (db, studentId, id) => doc(db, 'grades', studentId, 'attemptSignals', id);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/S_A'), { classId: 'class-a', status: 'active', assignedTeacherEmail: TEACHER_A });
    await setDoc(doc(db, 'grades/S_B'), { classId: 'class-a', status: 'active', assignedTeacherEmail: TEACHER_A });
    // The assignment the signals name: a signal needs a real one.
    // Seventy questions, given to class-a (and to class-m, for the teacher
    // whose address has capitals).
    await setDoc(doc(db, 'assignments/a-1'), { title: 'Slope and intercept', assignedClassIds: ['class-a', 'class-m'], questions: Array.from({ length: 70 }, (unused, index) => ({ questionId: `q-${index}` })) });
    // A v5 assignment: its questions are its sections' (three in all).
    await setDoc(doc(db, 'assignments/a-v5'), { schemaVersion: 5, assignedClassIds: ['class-a'], sections: [{ questions: [{ questionId: 'w1' }] }, { questions: [{ questionId: 'c1' }, { questionId: 'c2' }] }] });
    // Given to another class, and to a student individually.
    await setDoc(doc(db, 'assignments/a-other'), { assignedClassIds: ['class-z'], questions: [{ questionId: 'q' }, { questionId: 'q2' }] });
    await setDoc(doc(db, 'assignments/a-individual'), { assignedToStudentIndividually: true, assignedClassIds: [], questions: [{ questionId: 'q' }, { questionId: 'q2' }] });
    // A signal already on file, for the read, edit and dismissal cases.
    const seeded = recordFor('pasted', { questionIndex: 7 });
    await setDoc(signalRef(db, 'S_A', seeded.id), { ...seeded.data, recordedAt: new Date() });
  });
});

after(async () => { await env?.cleanup(); });

test('a student records each kind of fact about their own attempt, as the app builds it', async () => {
  for (const kind of Object.keys(FACTS)) {
    const { id, data } = recordFor(kind);
    await assertSucceeds(setDoc(signalRef(studentA(), 'S_A', id), data));
  }
  // Without the optional section name too.
  const { id, data } = recordFor('hardFirstTry', { questionIndex: 9 });
  const { activityRole: _role, ...withoutRole } = data;
  await assertSucceeds(setDoc(signalRef(studentA(), 'S_A', id), withoutRole));
});

test('the first record of a fact stands: the student cannot write it again, change it or delete it', async () => {
  const { id, data } = recordFor('leftThenRight', { questionIndex: 11 });
  await assertSucceeds(setDoc(signalRef(studentA(), 'S_A', id), data));
  await assertFails(setDoc(signalRef(studentA(), 'S_A', id), data));
  await assertFails(updateDoc(signalRef(studentA(), 'S_A', id), { partCount: 2 }));
  await assertFails(deleteDoc(signalRef(studentA(), 'S_A', id)));
});

test('facts only: a response, a pasted text, a keystroke log, a screenshot or any other key is refused', async () => {
  for (const extra of [
    { text: 'x = 4' }, { pastedText: 'y = -2x + 3' }, { response: '4' }, { answer: '4' }, { clipboard: 'abc' },
    { keystrokes: ['4'] }, { screenshot: 'data:image/png;base64,AAAA' }, { url: 'https://example.test' },
    { note: 'anything' }, { partId: 'slope' }, { dismissedAt: serverTimestamp() }, { dismissedByEmail: TEACHER_A },
  ]) {
    const { id, data } = recordFor('pasted', { questionIndex: 20 });
    await assertFails(setDoc(signalRef(studentA(), 'S_A', id), { ...data, ...extra }));
  }
  // A field of another kind does not ride on this one.
  const pasted = recordFor('pasted', { questionIndex: 21 });
  await assertFails(setDoc(signalRef(studentA(), 'S_A', pasted.id), { ...pasted.data, awaySeconds: 30 }));
  const hard = recordFor('hardFirstTry', { questionIndex: 21 });
  await assertFails(setDoc(signalRef(studentA(), 'S_A', hard.id), { ...hard.data, partIndex: 1 }));
});

test('every value is a bounded whole number or a known word, and the time is the server\'s', async () => {
  const write = (kind, change, questionIndex = 30) => {
    const { id, data } = recordFor(kind, { questionIndex });
    return setDoc(signalRef(studentA(), 'S_A', id), { ...data, ...change });
  };
  await assertFails(write('pasted', { partIndex: 'slope' }));
  await assertFails(write('pasted', { partIndex: 50 }));
  await assertFails(write('pasted', { partIndex: -1 }));
  await assertFails(write('pasted', { attemptNumber: 0 }));
  await assertFails(write('pasted', { kind: 'keystroke' }));
  await assertFails(write('pasted', { schemaVersion: 2 }));
  await assertFails(write('pasted', { activityRole: 'typed by the student' }));
  await assertFails(write('pasted', { recordedAt: new Date(Date.now() - 86400000) }));
  await assertFails(write('pasted', { assignmentId: 'x'.repeat(201) }));
  await assertFails(write('leftThenRight', { partCount: 1 }));
  await assertFails(write('leftThenRight', { awaySeconds: 301 }));
  await assertFails(write('leftThenRight', { awaySeconds: 'a long time' }));
  await assertFails(write('hardFirstTry', { difficultyBand: 2 }));
  await assertFails(write('hardFirstTry', { attemptNumber: 2 }));
  // A required field left out.
  const { id, data } = recordFor('leftThenRight', { questionIndex: 31 });
  const { awaySeconds: _away, ...missing } = data;
  await assertFails(setDoc(signalRef(studentA(), 'S_A', id), missing));
});

test('the document id is the fact\'s own position: one per question and kind, a paste per part', async () => {
  const { data } = recordFor('pasted', { questionIndex: 40 });
  await assertFails(setDoc(signalRef(studentA(), 'S_A', 'anything-else'), data));
  await assertFails(setDoc(signalRef(studentA(), 'S_A', 'a-1__40__pasted'), data));
  await assertFails(setDoc(signalRef(studentA(), 'S_A', 'a-1__41__pasted__2'), data));
  await assertFails(setDoc(signalRef(studentA(), 'S_A', 'a-1__40__hardFirstTry'), data));
  await assertSucceeds(setDoc(signalRef(studentA(), 'S_A', 'a-1__40__pasted__2'), data));
});

test('a signal names a real assignment, by an id that cannot be mistaken for another position', async () => {
  // An assignment that does not exist: a made-up id cannot fill the record.
  const made = recordFor('pasted', { assignmentId: 'no-such-assignment', questionIndex: 1 });
  await assertFails(setDoc(signalRef(studentA(), 'S_A', made.id), made.data));
  for (const assignmentId of ['a__1', '_a-1', 'a-1_']) {
    // Even if such an assignment existed, its id could spell another fact's position.
    await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), 'assignments', assignmentId), { title: 'x', assignedClassIds: ['class-a'], questions: [{ questionId: 'q' }, { questionId: 'q2' }] }));
    const odd = recordFor('pasted', { assignmentId, questionIndex: 1 });
    await assertFails(setDoc(signalRef(studentA(), 'S_A', odd.id), odd.data));
  }
  const real = recordFor('pasted', { questionIndex: 60 });
  await assertSucceeds(setDoc(signalRef(studentA(), 'S_A', real.id), real.data));
});

test('only the student whose attempt it was writes it, and only while they are on a roster', async () => {
  const { id, data } = recordFor('pasted', { questionIndex: 50 });
  await assertFails(setDoc(signalRef(studentB(), 'S_A', id), data));
  await assertFails(setDoc(signalRef(studentB(), 'S_B', id), data), 'a record naming another student');
  await assertFails(setDoc(signalRef(teacherA(), 'S_A', id), data));
  await assertFails(setDoc(signalRef(anonymous(), 'S_A', id), data));
  const gone = recordFor('pasted', { studentId: 'S_GONE', questionIndex: 50 });
  await assertFails(setDoc(signalRef(studentGone(), 'S_GONE', gone.id), gone.data));
});

test('teachers only: the student\'s own teacher reads the signals; the student, a classmate and another teacher do not', async () => {
  const seeded = recordFor('pasted', { questionIndex: 7 });
  await assertSucceeds(getDoc(signalRef(teacherA(), 'S_A', seeded.id)));
  await assertSucceeds(getDocs(collection(teacherA(), 'grades', 'S_A', 'attemptSignals')));
  await assertSucceeds(getDocs(query(collection(teacherA(), 'grades', 'S_A', 'attemptSignals'), where('assignmentId', '==', 'a-1'))));
  // The two bounded reads the teacher's screens make (attemptSignalsStore.js).
  await assertSucceeds(getDocs(query(collection(teacherA(), 'grades', 'S_A', 'attemptSignals'), where('assignmentId', '==', 'a-1'), limit(60))));
  await assertSucceeds(getDocs(query(collection(teacherA(), 'grades', 'S_A', 'attemptSignals'), orderBy('recordedAt', 'desc'), limit(200))));
  await assertSucceeds(getDoc(signalRef(root(), 'S_A', seeded.id)));
  await assertFails(getDoc(signalRef(studentA(), 'S_A', seeded.id)));
  await assertFails(getDocs(collection(studentA(), 'grades', 'S_A', 'attemptSignals')));
  await assertFails(getDoc(signalRef(studentB(), 'S_A', seeded.id)));
  await assertFails(getDoc(signalRef(teacherB(), 'S_A', seeded.id)));
  await assertFails(getDocs(collection(teacherB(), 'grades', 'S_A', 'attemptSignals')));
  await assertFails(getDoc(signalRef(anonymous(), 'S_A', seeded.id)));
});

test('the teacher dismisses a signal as themselves, at the server\'s time, and changes nothing else', async () => {
  const seeded = recordFor('pasted', { questionIndex: 7 });
  const ref = (db) => signalRef(db, 'S_A', seeded.id);
  // Not another teacher, not the student, not under another name or time.
  await assertFails(updateDoc(ref(teacherB()), { dismissedAt: serverTimestamp(), dismissedByEmail: TEACHER_B }));
  await assertFails(updateDoc(ref(studentA()), { dismissedAt: serverTimestamp(), dismissedByEmail: TEACHER_A }));
  await assertFails(updateDoc(ref(teacherA()), { dismissedAt: serverTimestamp(), dismissedByEmail: TEACHER_B }));
  await assertFails(updateDoc(ref(teacherA()), { dismissedAt: new Date(0), dismissedByEmail: TEACHER_A }));
  // Not with a note, and not by rewriting the fact.
  await assertFails(updateDoc(ref(teacherA()), { dismissedAt: serverTimestamp(), dismissedByEmail: TEACHER_A, note: 'copied it' }));
  await assertFails(updateDoc(ref(teacherA()), { dismissedAt: serverTimestamp(), dismissedByEmail: TEACHER_A, partIndex: 0 }));
  await assertFails(updateDoc(ref(teacherA()), { kind: 'hardFirstTry' }));
  await assertSucceeds(updateDoc(ref(teacherA()), { dismissedAt: serverTimestamp(), dismissedByEmail: TEACHER_A }));
  // Once dismissed it stays as dismissed: nobody re-stamps it with their own name or a later time.
  await assertFails(updateDoc(ref(teacherA()), { dismissedAt: serverTimestamp(), dismissedByEmail: TEACHER_A }));
  await assertFails(updateDoc(ref(root()), { dismissedAt: serverTimestamp(), dismissedByEmail: 'root.admin@example.test' }));
  // The root administrator, who can read a signal, can dismiss one that is still open.
  const open = recordFor('pasted', { questionIndex: 8 });
  await env.withSecurityRulesDisabled((context) => setDoc(signalRef(context.firestore(), 'S_A', open.id), { ...open.data, recordedAt: new Date() }));
  await assertFails(updateDoc(signalRef(root(), 'S_A', open.id), { dismissedAt: serverTimestamp(), dismissedByEmail: TEACHER_A }));
  await assertSucceeds(updateDoc(signalRef(root(), 'S_A', open.id), { dismissedAt: serverTimestamp(), dismissedByEmail: 'root.admin@example.test' }));
  // The email is compared as signed in: a teacher whose address has capitals dismisses under it, unchanged.
  const mixed = env.authenticatedContext('uid-tm', { role: 'teacher', email: 'Teacher.Mixed@Example.test' }).firestore();
  await env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), 'grades/S_M'), { classId: 'class-m', status: 'active', assignedTeacherEmail: 'Teacher.Mixed@Example.test' }));
  const theirs = recordFor('pasted', { studentId: 'S_M', questionIndex: 1 });
  await env.withSecurityRulesDisabled((context) => setDoc(signalRef(context.firestore(), 'S_M', theirs.id), { ...theirs.data, recordedAt: new Date() }));
  await assertFails(updateDoc(signalRef(mixed, 'S_M', theirs.id), { dismissedAt: serverTimestamp(), dismissedByEmail: 'teacher.mixed@example.test' }));
  await assertSucceeds(updateDoc(signalRef(mixed, 'S_M', theirs.id), { dismissedAt: serverTimestamp(), dismissedByEmail: 'Teacher.Mixed@Example.test' }));
  // And nobody deletes one, the teacher and the root administrator included.
  await assertFails(deleteDoc(ref(teacherA())));
  await assertFails(deleteDoc(ref(root())));
});

test('the heartbeat carries how many, as a small whole number', async () => {
  const presence = (extra) => ({ studentId: 'S_A', name: null, classId: 'class-a', classPeriod: '3', currentTeksCode: null, ...buildLiveStatus({ assignmentId: 'a-1', ...extra }) });
  await assertSucceeds(setDoc(doc(studentA(), 'presence/S_A'), presence({ attemptSignalCount: 2 })));
  await assertSucceeds(setDoc(doc(studentA(), 'presence/S_A'), presence({})));
  await assertFails(setDoc(doc(studentA(), 'presence/S_A'), { ...presence({}), attemptSignalCount: 'pasted y = 2x' }));
  await assertFails(setDoc(doc(studentA(), 'presence/S_A'), { ...presence({}), attemptSignalCount: 1000 }));
  await assertFails(setDoc(doc(studentA(), 'presence/S_A'), { ...presence({}), attemptSignals: [{ kind: 'pasted' }] }));
});

test('the context beside a fact: in class time or not, and the supports in effect, as catalog ids', async () => {
  const withContext = (context, questionIndex) => recordFor('pasted', { questionIndex, context });
  let made = withContext({ duringClass: true, supports: ['extra-time', 'text-to-speech'] }, 61);
  await assertSucceeds(setDoc(signalRef(studentA(), 'S_A', made.id), made.data));
  made = withContext({ duringClass: false, supports: [] }, 62);
  await assertSucceeds(setDoc(signalRef(studentA(), 'S_A', made.id), made.data));
  // Anything else in those fields is refused.
  const base = withContext({}, 63);
  const write = (extra) => setDoc(signalRef(studentA(), 'S_A', base.id), { ...base.data, ...extra });
  await assertFails(write({ duringClass: 'at home, on a phone' }));
  await assertFails(write({ duringClass: 1 }));
  await assertFails(write({ supports: 'extra-time' }));
  await assertFails(write({ supports: ['extra-time', 'has an IEP for reading'] }));
  await assertFails(write({ supports: [{ id: 'extra-time' }] }));
  await assertFails(write({ supports: Array.from({ length: 41 }, () => 'extra-time') }));
  await assertFails(write({ location: 'home' }));
  await assertFails(write({ ipAddress: '203.0.113.9' }));
  await assertSucceeds(write({ duringClass: true, supports: ['every-part-at-once'] }));
});

test('a fact names an assignment given to this student, and one of its own questions: no flooding with made-up places', async () => {
  // Another class's assignment.
  const other = recordFor('pasted', { assignmentId: 'a-other', questionIndex: 0 });
  await assertFails(setDoc(signalRef(studentA(), 'S_A', other.id), other.data));
  // One given to students individually.
  const individual = recordFor('pasted', { assignmentId: 'a-individual', questionIndex: 1 });
  await assertSucceeds(setDoc(signalRef(studentA(), 'S_A', individual.id), individual.data));
  // A position past the assignment's last question, on a legacy and a v5 assignment.
  for (const [assignmentId, questionIndex, ok] of [['a-1', 69, true], ['a-1', 70, false], ['a-1', 999, false], ['a-v5', 2, true], ['a-v5', 3, false], ['a-individual', 2, false]]) {
    const placed = recordFor('hardFirstTry', { assignmentId, questionIndex });
    const attempt = setDoc(signalRef(studentA(), 'S_A', placed.id), placed.data);
    await (ok ? assertSucceeds(attempt) : assertFails(attempt));
  }
  // So one assignment holds at most its questions times the kinds (a paste per
  // part): a client that walks every id it can name is refused past that.
  let accepted = 0;
  for (let questionIndex = 0; questionIndex < 8; questionIndex += 1) {
    const placed = recordFor('leftThenRight', { assignmentId: 'a-v5', questionIndex });
    try { await setDoc(signalRef(studentA(), 'S_A', placed.id), placed.data); accepted += 1; } catch { /* refused */ }
  }
  assert.equal(accepted, 3, 'three questions, three facts of this kind, however many are tried');
});

test('a review may carry a short note; it is still once, and still changes nothing else', async () => {
  const open = async (questionIndex) => {
    const made = recordFor('pasted', { questionIndex });
    await env.withSecurityRulesDisabled((context) => setDoc(signalRef(context.firestore(), 'S_A', made.id), { ...made.data, recordedAt: new Date() }));
    return made.id;
  };
  const review = (db, id, extra = {}) => updateDoc(signalRef(db, 'S_A', id), { dismissedAt: serverTimestamp(), dismissedByEmail: TEACHER_A, ...extra });
  let id = await open(64);
  await assertFails(review(teacherA(), id, { reviewNote: '' }));
  await assertFails(review(teacherA(), id, { reviewNote: 'x'.repeat(501) }));
  await assertFails(review(teacherA(), id, { reviewNote: ['a list'] }));
  await assertFails(review(teacherA(), id, { reviewNote: 'Talked with her', finding: 'cheated' }));
  // A note without the review itself is not a review.
  await assertFails(updateDoc(signalRef(teacherA(), 'S_A', id), { reviewNote: 'Talked with her' }));
  await assertSucceeds(review(teacherA(), id, { reviewNote: 'Talked with her; she used the prompt\'s own numbers.' }));
  // Reviewed: the note cannot be added to, replaced or removed, and the fact is still there.
  await assertFails(updateDoc(signalRef(teacherA(), 'S_A', id), { reviewNote: 'changed my mind' }));
  await assertFails(review(teacherA(), id, { reviewNote: 'again' }));
  await assertFails(deleteDoc(signalRef(teacherA(), 'S_A', id)));
  await assertSucceeds(getDoc(signalRef(teacherA(), 'S_A', id)));
  // The student writes no review and no note.
  id = await open(65);
  await assertFails(review(studentA(), id));
  await assertFails(updateDoc(signalRef(studentA(), 'S_A', id), { reviewNote: 'nothing to see' }));
  const seeded = recordFor('pasted', { questionIndex: 66 });
  await assertFails(setDoc(signalRef(studentA(), 'S_A', seeded.id), { ...seeded.data, reviewNote: 'pre-reviewed' }));
});
