// A TEACHER'S LIVE CORRECTION IS ONE TRANSACTION OVER THE CLASS
// (src/app/teacher/TeacherWorkspace.jsx): it reads the assignment and every
// student's grades document, joining a tracker stored split to its detail, then
// writes each student's tracker and the assignment.
//
// Firestore rules allow 20 document lookups (get/exists) in one transaction.
// A responseDetail document costs one per student, whether written or read:
// its rules read that student's grades document (teachesPresenceStudent), and
// a transaction checks every document it read and did not write again when it
// commits. So the correction reads each detail beside the transaction
// (responseDetailStore.js joinTrackerOutsideTransaction) and writes every
// record whole on the grades document (writeTrackerWhole). Either way round,
// a class past 20 would refuse the whole correction.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, runTransaction, setDoc } from 'firebase/firestore';
import {
  joinTrackerOutsideTransaction,
  responseDetailDoc,
  withResponseDetail,
  writeTrackerSplit,
  writeTrackerWhole,
} from '../../src/platform/grades/responseDetailStore.js';

const PROJECT = 'mathmaster-live-correction-class-rules';
const TEACHER = 'teacher.a@example.test';
const CLASS = Array.from({ length: 25 }, (_, index) => `S${String(index + 1).padStart(2, '0')}`);
let env;

const teacher = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER }).firestore();

// One question record stored split: its summary on the grades document, its
// detail in responseDetail/a1 (functions/shared/gradeEntryStorage.mjs).
const summary = (studentId) => ({
  status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 50, bestPartialCredit: 50,
  variantIndex: 0, detailRef: `ref-${studentId}`,
});
const detail = (studentId) => ({
  detailRef: `ref-${studentId}`,
  partGrades: [{ id: 'm', label: 'slope', isComplete: true, isCorrect: false }],
  lastResponseKey: '{"m":"3"}',
  questionDetails: 'y = 2x - 1',
  supportUsage: { hintUsed: false, isMathematicallyIndependent: true, accommodations: [] },
});

// A student's work as the server saves it: summary and detail together.
const saveSplit = async (db, studentId, ref, record = summary(studentId), questionDetail = detail(studentId)) => {
  await setDoc(doc(db, `grades/${studentId}`), {
    classId: 'class-a', assignedTeacherEmail: TEACHER, status: 'active',
    gradesByAssignment: { a1: { 0: { ...record, detailRef: ref } } },
  });
  await setDoc(doc(db, `grades/${studentId}/responseDetail/a1`), {
    studentId, assignmentId: 'a1', questions: { 0: { ...questionDetail, detailRef: ref } },
  });
};

const seedClass = async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'assignments/a1'), { title: 'Lines', classId: 'class-a', updatedAt: 't0' });
    for (const studentId of CLASS) {
      // eslint-disable-next-line no-await-in-loop
      await saveSplit(db, studentId, `ref-${studentId}`);
    }
  });
};

// How the tracker is joined: beside the transaction, as TeacherWorkspace does,
// or in it (a transaction.get of the detail document).
const joinOutside = ({ db, studentId, gradeData }) => joinTrackerOutsideTransaction(db, studentId, gradeData, 'a1');
const joinInside = async ({ db, transaction, studentId, gradeData }) => {
  const snapshot = await transaction.get(responseDetailDoc(db, studentId, 'a1'));
  return withResponseDetail(gradeData, { a1: snapshot.exists() ? snapshot.data() : null });
};

// The correction as TeacherWorkspace runs it: every read first, then each
// student's corrected tracker through `write`, then the assignment's audit.
// `afterRead(studentId, attempt)` runs once a student's grades document is read.
// The transaction runs as TeacherWorkspace runs it, with the SDK's own retries.
const correct = (students, write, { join = joinOutside, afterRead = async () => {} } = {}) => {
  const db = teacher();
  let attempt = 0;
  return runTransaction(db, async (transaction) => {
    attempt += 1;
    await transaction.get(doc(db, 'assignments/a1'));
    const joined = [];
    for (const studentId of students) {
      // eslint-disable-next-line no-await-in-loop
      const snapshot = await transaction.get(doc(db, `grades/${studentId}`));
      // eslint-disable-next-line no-await-in-loop
      await afterRead(studentId, attempt);
      // eslint-disable-next-line no-await-in-loop
      joined.push([studentId, await join({ db, transaction, studentId, gradeData: snapshot.data() })]);
    }
    for (const [studentId, gradeData] of joined) {
      const record = gradeData.gradesByAssignment.a1[0];
      write({
        db,
        writer: transaction,
        studentId,
        assignmentId: 'a1',
        tracker: { 0: { ...record, status: 'correct', partialCredit: 100, bestPartialCredit: 100, liveCorrectionHistory: [{ correctedAt: 't1' }] } },
      });
    }
    transaction.update(doc(db, 'assignments/a1'), {
      updatedAt: 't1',
      liveRepairHistory: [{ kind: 'response-entry-repair', questionId: 'q1', questionIndex: 0, correctedAt: 't1' }],
    });
  });
};
const writeSplit = (args) => writeTrackerSplit({ ...args, splitAll: true });

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
});

after(async () => {
  await env?.cleanup();
});

test('a correction over a class of 25, every record stored split, commits with each record written whole', async () => {
  await seedClass();
  await assertSucceeds(correct(CLASS, writeTrackerWhole));
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const studentId of CLASS) {
      // eslint-disable-next-line no-await-in-loop
      const record = (await getDoc(doc(db, `grades/${studentId}`))).data().gradesByAssignment.a1[0];
      assert.equal(record.status, 'correct', studentId);
      assert.equal(record.partialCredit, 100);
      assert.equal(Object.prototype.hasOwnProperty.call(record, 'detailRef'), false, 'whole: no stored detail is joined to it again');
      assert.deepEqual(record.partGrades, detail(studentId).partGrades, 'its parts came with it, joined from its detail');
      assert.equal(record.lastResponseKey, '{"m":"3"}');
      assert.deepEqual(record.liveCorrectionHistory, [{ correctedAt: 't1' }]);
    }
    const assignment = (await getDoc(doc(db, 'assignments/a1'))).data();
    assert.equal(assignment.updatedAt, 't1');
  });
});

const nothingWritten = async () => env.withSecurityRulesDisabled(async (context) => {
  const record = (await getDoc(doc(context.firestore(), `grades/${CLASS[0]}`))).data().gradesByAssignment.a1[0];
  assert.equal(record.status, 'attempted', 'nothing was written for anyone');
});

test('written split, the same correction is refused for the class, though a few students pass', async () => {
  await seedClass();
  await assertFails(correct(CLASS, writeSplit));
  await nothingWritten();

  await seedClass();
  await assertSucceeds(correct(CLASS.slice(0, 5), writeSplit));
});

test('with each detail read in the transaction, the class is refused too, though nothing of it is written', async () => {
  await seedClass();
  await assertFails(correct(CLASS, writeTrackerWhole, { join: joinInside }));
  await nothingWritten();

  await seedClass();
  await assertSucceeds(correct(CLASS.slice(0, 5), writeTrackerWhole, { join: joinInside }));
});

test('a record split with nothing in its detail is corrected, not taken for work still loading', async () => {
  // The split as #561 shipped split every record, one with no detail field too:
  // its detail entry carries the summary's detailRef and nothing else.
  await seedClass();
  const [first] = CLASS;
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `grades/${first}`), {
      classId: 'class-a', assignedTeacherEmail: TEACHER, status: 'active',
      gradesByAssignment: { a1: { 0: { status: 'attempted', attemptCount: 1, partialCredit: 50, detailRef: 'ref-bare' } } },
    });
    await setDoc(doc(db, `grades/${first}/responseDetail/a1`), { studentId: first, assignmentId: 'a1', questions: { 0: { detailRef: 'ref-bare' } } });
  });
  await assertSucceeds(correct(CLASS, writeTrackerWhole));
  await env.withSecurityRulesDisabled(async (context) => {
    const record = (await getDoc(doc(context.firestore(), `grades/${first}`))).data().gradesByAssignment.a1[0];
    assert.equal(record.status, 'correct');
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'detailRef'), false);
    assert.deepEqual(record.liveCorrectionHistory, [{ correctedAt: 't1' }]);
  });
});

test('work a student saves while the correction is prepared: it runs again, and corrects the newer work', async () => {
  await seedClass();
  const [first] = CLASS;
  const newer = { ...detail(first), lastResponseKey: '{"m":"2"}', partGrades: [{ id: 'm', label: 'slope', isComplete: true, isCorrect: true }] };
  // Saved after the transaction read the student's grades document, before
  // their detail is read beside it: the summary just read no longer matches.
  const afterRead = async (studentId, attempt) => {
    if (studentId !== first || attempt !== 1) return;
    await env.withSecurityRulesDisabled(async (context) => {
      await saveSplit(context.firestore(), first, 'ref-newer', { ...summary(first), attemptCount: 2, totalAttempts: 2 }, newer);
    });
  };
  await assertSucceeds(correct(CLASS, writeTrackerWhole, { afterRead }));
  await env.withSecurityRulesDisabled(async (context) => {
    const record = (await getDoc(doc(context.firestore(), `grades/${first}`))).data().gradesByAssignment.a1[0];
    assert.equal(record.status, 'correct');
    assert.equal(record.attemptCount, 2, 'the newer summary');
    assert.equal(record.lastResponseKey, '{"m":"2"}', 'joined to the newer detail');
    assert.deepEqual(record.partGrades, newer.partGrades);
  });
});
