/*
 * THE GRADE DOCUMENT'S TRUST BOUNDARY, ATTACKED AS A STUDENT WITH A CONSOLE.
 *
 * Run with: npm run test:rules (real Firestore emulator, real firestore.rules).
 *
 * `grades/{studentId}` holds every authoritative grade input the platform
 * acts on: the canonical question records (`gradesByAssignment`) that Google
 * Classroom passback, the Grade Center, the teacher gradebook, Grade Transfer
 * and server ingestion's attempt policy all read; the server-derived Classwork
 * completion, DOL, support-usage and passback projections; and the signals
 * that decide when a grade is released. Server grading (#412) made the
 * server's record correct. These cases prove that a student device cannot
 * then overwrite it — whatever write primitive it uses, whichever field path
 * it names, and whichever student's document it aims at.
 *
 * Every attack is made by an authenticated student holding a real student
 * claim for THEIR OWN document, because that is the case the old rule let
 * through. The positive cases at the end are the writes the architecture
 * still gives a student's device, so a rule that simply locked students out
 * of everything could not pass this suite either.
 *
 * Synthetic identities only. Own projectId: node --test runs the rules suites
 * in parallel processes against one emulator.
 */
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  FieldPath, deleteField, doc, getDoc, increment, runTransaction, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import {
  GRADE_FIELDS_EMPTY_ON_STUDENT_CREATE,
  SERVER_ONLY_GRADE_FIELDS,
  SERVER_OWNED_GRADE_FIELDS,
  STUDENT_CLIENT_OWNED_GRADE_FIELDS,
} from '../../functions/shared/gradeDocumentAuthority.mjs';

const PROJECT = 'mathmaster-grade-authority-rules';
const TEACHER_A = 'teacher.a@desotoisd.org';
const TEACHER_B = 'teacher.b@desotoisd.org';
const A = 'A1';
const DOL_DATE = '2026-10-02';

let env;

const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'STUDENT_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'STUDENT_B' }).firestore();
const studentNew = () => env.authenticatedContext('uid-snew', { role: 'student', studentId: 'STUDENT_NEW' }).firestore();
const teacherA = () => env.authenticatedContext('uid-ta', { role: 'teacher', email: TEACHER_A }).firestore();
const teacherB = () => env.authenticatedContext('uid-tb', { role: 'teacher', email: TEACHER_B }).firestore();
const rootAdmin = () => env.authenticatedContext('uid-root', {
  role: 'teacher', admin: true, rootAdmin: true, email: 'root.admin@desotoisd.org',
}).firestore();

/*
 * What the server has recorded for STUDENT_A: a Warm-Up item still open, an
 * exhausted Classwork item, an attempted DOL item, a correct Classwork item,
 * and every projection the server derives beside them.
 */
const canonicalTracker = () => ({
  0: { status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 0, bestPartialCredit: 0, lastSubmissionId: 'srv-q0-1', gradedBy: 'server' },
  1: { status: 'expired', attemptCount: 3, totalAttempts: 3, partialCredit: 0, bestPartialCredit: 0, lastSubmissionId: 'srv-q1-3', gradedBy: 'server' },
  2: {
    status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 40, bestPartialCredit: 40,
    partGrades: [{ id: 'p1', isCorrect: false, isComplete: true }, { id: 'p2', isCorrect: true, isComplete: true }],
    lastSubmissionId: 'srv-q2-1', gradedBy: 'server',
  },
  3: { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100, lastSubmissionId: 'srv-q3-1', gradedBy: 'server' },
});

const serverRecordedState = () => ({
  classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active',
  displayName: 'Student A',
  gradesByAssignment: { [A]: canonicalTracker() },
  classworkGradesByAssignment: {},
  dolGradesByAssignment: { [A]: { [DOL_DATE]: { finalized: true, score: 40, status: 'section-finalized', questionIndices: [2] } } },
  supportUsageByAssignment: { [A]: { modified: true, accommodations: ['calculator'], modifications: ['reduce-complexity'] } },
  classroomReleaseSignals: { [A]: { reason: 'persistence-reconciled', requestedAt: '2026-10-02T15:00:00.000Z' } },
  classroomSyncStatusByAssignment: { [A]: { grade: 47, stage: 'progress-75', isFinal: false, studentVisible: false } },
  classroomSectionSyncStatusByAssignment: { [A]: { dol: { grade: 40, stage: 'progress-100' } } },
  testCycleGrades: {},
  teacherGradeOverridesByAssignment: {},
  sectionRecoveryByAssignment: {},
  warmupChallengeByAssignment: {},
  assignmentActivity: { [A]: { totalTimeSeconds: 600, onTimeSeconds: 600, lateSeconds: 0 } },
});

const studentBState = () => ({
  classId: 'class-b', classPeriod: 'Period 2', assignedTeacherEmail: TEACHER_B, status: 'active',
  displayName: 'Student B',
  gradesByAssignment: { [A]: { 0: { status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 0 } } },
  assignmentActivity: { [A]: { totalTimeSeconds: 120 } },
});

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
    await setDoc(doc(db, 'classes/class-a'), { name: 'Algebra I — Period 1', period: 'Period 1', teacherOfRecord: TEACHER_A, status: 'active' });
    await setDoc(doc(db, 'classes/class-b'), { name: 'Algebra I — Period 2', period: 'Period 2', teacherOfRecord: TEACHER_B, status: 'active' });
    await setDoc(doc(db, `assignments/${A}`), { title: 'Grade authority', assignedClassIds: ['class-a', 'class-b'] });
  });
});

// Every case starts from exactly what the server recorded, so one case's
// (correctly refused) attempt can never be the reason the next one passes.
beforeEach(async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/STUDENT_A'), serverRecordedState());
    await setDoc(doc(db, 'grades/STUDENT_B'), studentBState());
  });
});

after(async () => {
  await env?.cleanup();
});

const readAsServer = async (studentId) => {
  let data = null;
  await env.withSecurityRulesDisabled(async (context) => {
    data = (await getDoc(doc(context.firestore(), `grades/${studentId}`))).data();
  });
  return data;
};

/*
 * One attack, every way a client can phrase it.
 *
 * `update` is the dotted-path patch `updateDoc` takes. `merge` is the same
 * intent as a nested object for `setDoc(..., { merge: true })`, which Firestore
 * merges recursively — the classic way to touch one deep field without naming
 * a path. Batches and transactions go through the same rules per document, and
 * are asserted anyway so nothing about the write primitive is assumed.
 */
const attempts = (db, path, attack) => {
  const ref = doc(db, path);
  const list = [
    ['updateDoc', () => updateDoc(ref, attack.update)],
    ['writeBatch', () => { const batch = writeBatch(db); batch.update(ref, attack.update); return batch.commit(); }],
    ['runTransaction', () => runTransaction(db, async (transaction) => {
      await transaction.get(ref);
      transaction.update(ref, attack.update);
    })],
  ];
  if (attack.merge) list.push(['setDoc merge', () => setDoc(ref, attack.merge, { merge: true })]);
  return list;
};

const assertEveryPhrasingRefused = async (db, path, attack) => {
  for (const [primitive, write] of attempts(db, path, attack)) {
    // eslint-disable-next-line no-await-in-loop
    await assertFails(write()).catch((error) => {
      throw new Error(`${attack.label} via ${primitive} was ALLOWED: ${error.message}`);
    });
  }
};

const assertServerStateIntact = async () => {
  const data = await readAsServer('STUDENT_A');
  assert.deepEqual(data, serverRecordedState(), 'a refused write must leave the server-recorded document byte-for-byte as it was');
};

const allCorrect = () => Object.fromEntries([0, 1, 2, 3].map((index) => [index, {
  status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100,
}]));

/* ==========================================================================
 * 1. A STUDENT CANNOT WRITE THEIR OWN FINAL GRADE.
 * ======================================================================== */

test('1. a student cannot author a final grade by any route', async () => {
  const attacks = [
    {
      label: 'replace the canonical tracker with an all-correct one',
      update: { [`gradesByAssignment.${A}`]: allCorrect() },
      merge: { gradesByAssignment: { [A]: allCorrect() } },
    },
    {
      label: 'force a final-deadline Classroom release',
      update: { [`classroomReleaseSignals.${A}`]: { reason: 'final-deadline', requestedAt: '2026-10-03T00:00:00.000Z' } },
      merge: { classroomReleaseSignals: { [A]: { reason: 'final-deadline' } } },
    },
    {
      label: 'forge a teacher assignment-grade override of 100',
      update: { [`teacherGradeOverridesByAssignment.${A}.__assignment`]: { active: true, score: 100 } },
      merge: { teacherGradeOverridesByAssignment: { [A]: { __assignment: { active: true, score: 100 } } } },
    },
    {
      label: 'forge a recorded Test Cycle grade',
      update: { [`testCycleGrades.${A}`]: { recordedGrade: 100, originalTestGrade: 100 } },
      merge: { testCycleGrades: { [A]: { recordedGrade: 100 } } },
    },
    {
      label: 'forge the Classroom receipt that says a final grade was posted',
      update: { [`classroomSyncStatusByAssignment.${A}`]: { grade: 100, stage: 'final-complete', isFinal: true } },
      merge: { classroomSyncStatusByAssignment: { [A]: { grade: 100, stage: 'final-complete', isFinal: true } } },
    },
    {
      label: 'inject a top-level final score no reader expects yet',
      update: { finalGradeByAssignment: { [A]: 100 } },
      merge: { finalGradeByAssignment: { [A]: 100 } },
    },
  ];
  for (const attack of attacks) {
    // eslint-disable-next-line no-await-in-loop
    await assertEveryPhrasingRefused(studentA(), 'grades/STUDENT_A', attack);
  }
  await assertServerStateIntact();
});

/* ==========================================================================
 * 2. A STUDENT CANNOT CHANGE ONE SECTION'S GRADE COMPONENT.
 * ======================================================================== */

test('2. a student cannot change a single Warm-Up, Classwork, DOL or Recovery component', async () => {
  const attacks = [
    {
      label: 'raise the Warm-Up item credit',
      update: { [`gradesByAssignment.${A}.0.partialCredit`]: 90, [`gradesByAssignment.${A}.0.bestPartialCredit`]: 90 },
      merge: { gradesByAssignment: { [A]: { 0: { partialCredit: 90, bestPartialCredit: 90 } } } },
    },
    {
      label: 'mark Classwork complete',
      update: { [`classworkGradesByAssignment.${A}`]: { score: 100, metAt: '2026-10-02T15:00:00.000Z' } },
      merge: { classworkGradesByAssignment: { [A]: { score: 100 } } },
    },
    {
      label: 'raise one day of the DOL projection',
      update: { [`dolGradesByAssignment.${A}.${DOL_DATE}.score`]: 100 },
      merge: { dolGradesByAssignment: { [A]: { [DOL_DATE]: { score: 100 } } } },
    },
    {
      label: 'write a completed Recovery for the DOL',
      update: { [`sectionRecoveryByAssignment.${A}.dol`]: { status: 'completed', rawScore: 100, cap: 100 } },
      merge: { sectionRecoveryByAssignment: { [A]: { dol: { status: 'completed', rawScore: 100 } } } },
    },
    {
      label: 'claim Live Challenge Warm-Up credit',
      update: { [`warmupChallengeByAssignment.${A}`]: { answered: 5, correct: 5, roundsAvailable: 5 } },
      merge: { warmupChallengeByAssignment: { [A]: { correct: 5 } } },
    },
    {
      label: 'erase the modification flag the gradebook marks a grade with',
      update: { [`supportUsageByAssignment.${A}`]: { modified: false, accommodations: [], modifications: [] } },
      merge: { supportUsageByAssignment: { [A]: { modified: false, modifications: [] } } },
    },
  ];
  for (const attack of attacks) {
    // eslint-disable-next-line no-await-in-loop
    await assertEveryPhrasingRefused(studentA(), 'grades/STUDENT_A', attack);
  }
  await assertServerStateIntact();
});

/* ==========================================================================
 * 3. A STUDENT CANNOT CHANGE CORRECTNESS OR STATUS.
 * ======================================================================== */

test('3. a student cannot flip correctness or status on a recorded question', async () => {
  const attacks = [
    {
      label: 'mark an attempted question correct',
      update: { [`gradesByAssignment.${A}.0.status`]: 'correct' },
      merge: { gradesByAssignment: { [A]: { 0: { status: 'correct' } } } },
    },
    {
      label: 'add an isCorrect verdict to a record',
      update: { [`gradesByAssignment.${A}.0.isCorrect`]: true },
      merge: { gradesByAssignment: { [A]: { 0: { isCorrect: true } } } },
    },
    {
      label: 'mark a wrong part correct',
      update: {
        [`gradesByAssignment.${A}.2.partGrades`]: [
          { id: 'p1', isCorrect: true, isComplete: true }, { id: 'p2', isCorrect: true, isComplete: true },
        ],
      },
    },
  ];
  for (const attack of attacks) {
    // eslint-disable-next-line no-await-in-loop
    await assertEveryPhrasingRefused(studentA(), 'grades/STUDENT_A', attack);
  }
  await assertServerStateIntact();
});

/* ==========================================================================
 * 4. A STUDENT CANNOT CHANGE THEIR ATTEMPT COUNT.
 * ======================================================================== */

test('4. a student cannot lower, reset or decrement an attempt count', async () => {
  const attacks = [
    {
      label: 'reset an exhausted question to zero attempts',
      update: { [`gradesByAssignment.${A}.1.attemptCount`]: 0, [`gradesByAssignment.${A}.1.totalAttempts`]: 0 },
      merge: { gradesByAssignment: { [A]: { 1: { attemptCount: 0, totalAttempts: 0 } } } },
    },
    {
      label: 'decrement attempts with a server-side increment',
      update: { [`gradesByAssignment.${A}.1.attemptCount`]: increment(-2) },
    },
    {
      label: 'reopen an exhausted question',
      update: { [`gradesByAssignment.${A}.1.status`]: 'attempted' },
      merge: { gradesByAssignment: { [A]: { 1: { status: 'attempted' } } } },
    },
    {
      label: 'move lastSubmissionId so a replay reads as new',
      update: { [`gradesByAssignment.${A}.1.lastSubmissionId`]: 'forged' },
    },
  ];
  for (const attack of attacks) {
    // eslint-disable-next-line no-await-in-loop
    await assertEveryPhrasingRefused(studentA(), 'grades/STUDENT_A', attack);
  }
  await assertServerStateIntact();
});

/* ==========================================================================
 * 10. A SUBMITTED OR TERMINAL RESULT CANNOT BE WEAKENED OR REPLACED.
 * ======================================================================== */

test('10. a terminal record, a finalized DOL and the whole tracker cannot be weakened, replaced or erased', async () => {
  const attacks = [
    {
      label: 'downgrade a correct question',
      update: { [`gradesByAssignment.${A}.3.status`]: 'attempted', [`gradesByAssignment.${A}.3.partialCredit`]: 0 },
    },
    { label: 'delete a correct question record', update: { [`gradesByAssignment.${A}.3`]: deleteField() } },
    { label: 'delete an exhausted question record to start over', update: { [`gradesByAssignment.${A}.1`]: deleteField() } },
    { label: "delete the assignment's whole tracker", update: { [`gradesByAssignment.${A}`]: deleteField() } },
    { label: 'delete every canonical record', update: { gradesByAssignment: deleteField() } },
    { label: 'un-finalize a closed DOL', update: { [`dolGradesByAssignment.${A}.${DOL_DATE}.finalized`]: false } },
    { label: 'delete the release signal history', update: { classroomReleaseSignals: deleteField() } },
  ];
  for (const attack of attacks) {
    // eslint-disable-next-line no-await-in-loop
    await assertEveryPhrasingRefused(studentA(), 'grades/STUDENT_A', attack);
  }

  // A whole-document rewrite that keeps the roster fields and drops the grades.
  const { gradesByAssignment: _dropped, ...withoutGrades } = serverRecordedState();
  await assertFails(setDoc(doc(studentA(), 'grades/STUDENT_A'), withoutGrades));
  // A whole-document rewrite that swaps in a better tracker.
  await assertFails(setDoc(doc(studentA(), 'grades/STUDENT_A'), {
    ...serverRecordedState(), gradesByAssignment: { [A]: allCorrect() },
  }));
  await assertServerStateIntact();
});

/* ==========================================================================
 * NESTED-FIELD TRICKS.
 * ======================================================================== */

test('a literal dotted field name or a lookalike top-level field is not a way around the boundary', async () => {
  // `new FieldPath('gradesByAssignment.A1')` names ONE top-level field whose
  // name contains a dot — not the nested path. It must not slip past a rule
  // that only pins the real `gradesByAssignment` map.
  const ref = doc(studentA(), 'grades/STUDENT_A');
  await assertFails(updateDoc(ref, new FieldPath(`gradesByAssignment.${A}`), allCorrect()));
  await assertFails(updateDoc(ref, new FieldPath('gradesByAssignment', A, '0', 'status'), 'correct'));
  await assertFails(updateDoc(ref, { gradesbyassignment: { [A]: allCorrect() } }));
  await assertFails(updateDoc(ref, { 'classworkGradesByAssignment ': { [A]: { score: 100 } } }));
  await assertServerStateIntact();
});

test('one forged field poisons the whole write, even beside a legitimate one', async () => {
  const db = studentA();
  const ref = doc(db, 'grades/STUDENT_A');
  await assertFails(updateDoc(ref, {
    [`assignmentActivity.${A}`]: { totalTimeSeconds: 660, onTimeSeconds: 660, lateSeconds: 0 },
    [`gradesByAssignment.${A}.0.status`]: 'correct',
  }));
  const batch = writeBatch(db);
  batch.update(ref, { [`assignmentActivity.${A}`]: { totalTimeSeconds: 660 } });
  batch.update(ref, { [`classworkGradesByAssignment.${A}`]: { score: 100 } });
  await assertFails(batch.commit());
  await assertServerStateIntact();
});

/* ==========================================================================
 * CREATE: A ROW CANNOT BE BORN WITH GRADES IN IT.
 * ======================================================================== */

test('a student cannot create their own grades row with any grade state already in it', async () => {
  const roster = {
    classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_A, status: 'active', gradesByAssignment: {},
  };
  const forgedMaps = {
    gradesByAssignment: { [A]: allCorrect() },
    classworkGradesByAssignment: { [A]: { score: 100 } },
    dolGradesByAssignment: { [A]: { [DOL_DATE]: { finalized: true, score: 100 } } },
    supportUsageByAssignment: { [A]: { modified: false } },
    classroomReleaseSignals: { [A]: { reason: 'final-deadline' } },
    classroomSyncStatusByAssignment: { [A]: { grade: 100, isFinal: true } },
    classroomSectionSyncStatusByAssignment: { [A]: { dol: { grade: 100 } } },
  };
  // Every field the authority module says must be empty on a student's create
  // is attacked, including any added to it after this test was written.
  for (const field of GRADE_FIELDS_EMPTY_ON_STUDENT_CREATE) {
    const value = forgedMaps[field] || { [A]: { forged: true, score: 100 } };
    // eslint-disable-next-line no-await-in-loop
    await assertFails(setDoc(doc(studentNew(), 'grades/STUDENT_NEW'), { ...roster, [field]: value }))
      .catch((error) => { throw new Error(`create with forged ${field} was ALLOWED: ${error.message}`); });
  }
  // Create is an allow-list as well: a field nothing reads yet is refused too.
  await assertFails(setDoc(doc(studentNew(), 'grades/STUDENT_NEW'), { ...roster, finalGradeByAssignment: { [A]: 100 } }));
  await assertFails(setDoc(doc(studentNew(), 'grades/STUDENT_NEW'), { ...roster, 'gradesByAssignment.A1': allCorrect() }));
  // A row carrying no grade state still creates, as it did before — with every
  // grade map present and empty, and its own engagement time.
  await assertSucceeds(setDoc(doc(studentNew(), 'grades/STUDENT_NEW'), {
    ...roster,
    ...Object.fromEntries(GRADE_FIELDS_EMPTY_ON_STUDENT_CREATE.map((field) => [field, {}])),
    assignmentActivity: { [A]: { totalTimeSeconds: 5 } },
    profile: {},
  }));
});

test('every field the authority module calls server-owned is refused to its own student, whole and nested', async () => {
  assert.deepEqual(STUDENT_CLIENT_OWNED_GRADE_FIELDS, ['assignmentActivity'], 'this suite assumes one client-owned field');
  for (const field of [...SERVER_OWNED_GRADE_FIELDS, ...SERVER_ONLY_GRADE_FIELDS]) {
    // eslint-disable-next-line no-await-in-loop
    await assertEveryPhrasingRefused(studentA(), 'grades/STUDENT_A', {
      label: `nested write into ${field}`,
      update: { [`${field}.${A}.forged`]: true },
      merge: { [field]: { [A]: { forged: true } } },
    });
    // eslint-disable-next-line no-await-in-loop
    await assertFails(updateDoc(doc(studentA(), 'grades/STUDENT_A'), { [field]: deleteField() }))
      .catch((error) => { throw new Error(`deleting ${field} was ALLOWED: ${error.message}`); });
  }
  await assertServerStateIntact();
});

/* ==========================================================================
 * 12 & 13. ANOTHER STUDENT, ANOTHER CLASS.
 * ======================================================================== */

test("12. student A cannot alter student B's grade document, not even B's client-owned fields", async () => {
  const attacks = [
    { label: "mark B's question correct", update: { [`gradesByAssignment.${A}.0.status`]: 'correct' } },
    { label: "zero B's question", update: { [`gradesByAssignment.${A}.0`]: { status: 'expired', attemptCount: 3, totalAttempts: 3 } } },
    { label: "touch B's engagement time", update: { [`assignmentActivity.${A}`]: { totalTimeSeconds: 0 } } },
  ];
  for (const attack of attacks) {
    // eslint-disable-next-line no-await-in-loop
    await assertEveryPhrasingRefused(studentA(), 'grades/STUDENT_B', attack);
  }
  assert.deepEqual(await readAsServer('STUDENT_B'), studentBState());
});

test('13. a student cannot move themselves to another class or teacher to reach other grades', async () => {
  const ref = doc(studentA(), 'grades/STUDENT_A');
  await assertFails(updateDoc(ref, { classId: 'class-b' }));
  await assertFails(updateDoc(ref, { assignedTeacherEmail: TEACHER_B }));
  await assertFails(updateDoc(ref, { classPeriod: 'Period 2' }));
  await assertServerStateIntact();
});

/* ==========================================================================
 * WHAT A STUDENT'S DEVICE MAY STILL WRITE.
 *
 * Local-first persistence depends on these, so a rule that closed the grade
 * fields by closing the document would be caught here.
 * ======================================================================== */

test('a student may still save their own engagement time, the one client-owned field on the document', async () => {
  const ref = doc(studentA(), 'grades/STUDENT_A');
  await assertSucceeds(updateDoc(ref, new FieldPath('assignmentActivity', A), {
    totalTimeSeconds: 660, onTimeSeconds: 660, lateSeconds: 0, lastActiveAt: '2026-10-03T15:00:00.000Z',
  }));
  await assertSucceeds(setDoc(ref, { assignmentActivity: { 'A2': { totalTimeSeconds: 30 } } }, { merge: true }));
  // Re-sending a value the document already holds is not a change.
  await assertSucceeds(setDoc(ref, { classPeriod: 'Period 1', displayName: 'Student A' }, { merge: true }));
  const data = await readAsServer('STUDENT_A');
  assert.equal(data.assignmentActivity[A].totalTimeSeconds, 660);
  assert.deepEqual(data.gradesByAssignment, serverRecordedState().gradesByAssignment, 'canonical records untouched');
});

test('5. the student paths that feed server ingestion stay open and carry no grade', async () => {
  // A response checkpoint (what the deadline finalizer grades on the server).
  await assertSucceeds(setDoc(doc(studentA(), 'studentResponseCheckpoints/STUDENT_A__A1__0'), {
    documentId: 'STUDENT_A__A1__0', studentId: 'STUDENT_A', assignmentId: A, questionIndex: 0,
    questionId: 'q0', variantIndex: 0, generationKey: null, activityRole: 'warmup',
    secure: false, schemaVersion: 2, serverAcknowledgedAt: serverTimestamp(), status: 'active',
    candidateFinalizeAt: null, isComplete: true, revision: 1, previousTotalAttempts: 1,
    answerState: { value: '2x+1' },
  }));
  // ...which still may not smuggle a verdict.
  await assertFails(setDoc(doc(studentA(), 'studentResponseCheckpoints/STUDENT_A__A1__1'), {
    documentId: 'STUDENT_A__A1__1', studentId: 'STUDENT_A', assignmentId: A, questionIndex: 1,
    questionId: 'q1', variantIndex: 0, generationKey: null, activityRole: 'classwork',
    secure: false, schemaVersion: 2, serverAcknowledgedAt: serverTimestamp(), status: 'active',
    candidateFinalizeAt: null, isComplete: true, revision: 1, previousTotalAttempts: 3,
    isCorrect: true,
  }));
  // A workspace draft (unfinished work; never a grade).
  await assertSucceeds(setDoc(doc(studentA(), 'studentWorkspaceDrafts/STUDENT_A__A1'), {
    documentId: 'STUDENT_A__A1', studentId: 'STUDENT_A', assignmentId: A, secure: false,
    schemaVersion: 1, updatedAt: serverTimestamp(), entries: {},
  }));
  // A scratchpad.
  await assertSucceeds(setDoc(doc(studentA(), 'grades/STUDENT_A/scratchpads/A1__question_0'), { dataUrl: 'data:,x' }));
  // And the submission receipt the device retires its queue against is still
  // the server's alone.
  await assertFails(setDoc(doc(studentA(), 'studentSubmissionReceipts/STUDENT_A__forged'), {
    studentId: 'STUDENT_A', actionId: 'forged', disposition: 'accepted',
  }));
});

/* ==========================================================================
 * 11. AUTHORITY THAT MUST NOT CHANGE: TEACHER, ROOT ADMINISTRATOR, SERVER.
 * ======================================================================== */

test("11. the teacher of record and the root administrator keep their grade-document authority; another teacher does not gain any", async () => {
  // The repair flows a teacher's client runs today (current-grader credit,
  // live corrections, Repair from Library) write canonical records.
  await assertSucceeds(updateDoc(doc(teacherA(), 'grades/STUDENT_A'), {
    [`gradesByAssignment.${A}.1`]: { status: 'unattempted', attemptCount: 0, totalAttempts: 0 },
    [`classworkGradesByAssignment.${A}`]: deleteField(),
  }));
  await assertSucceeds(updateDoc(doc(rootAdmin(), 'grades/STUDENT_A'), {
    [`classroomReleaseSignals.${A}`]: { reason: 'manual-retry', source: 'question-weight-change' },
  }));
  await assertFails(updateDoc(doc(teacherB(), 'grades/STUDENT_A'), { [`gradesByAssignment.${A}.0.status`]: 'correct' }));
  // The audited override map stays server-only for every client, teachers included.
  await assertFails(updateDoc(doc(teacherA(), 'grades/STUDENT_A'), {
    [`teacherGradeOverridesByAssignment.${A}.0`]: { active: true, score: 100 },
  }));
});

test('the server (Admin SDK, rules bypassed) still records grades and overrides', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const ref = doc(context.firestore(), 'grades/STUDENT_A');
    await assertSucceeds(updateDoc(ref, {
      [`gradesByAssignment.${A}.0`]: { status: 'correct', attemptCount: 2, totalAttempts: 2, partialCredit: 100, lastSubmissionId: 'srv-q0-2' },
      [`teacherGradeOverridesByAssignment.${A}.2`]: { active: true, score: 80, actor: { email: TEACHER_A } },
    }));
  });
  const data = await readAsServer('STUDENT_A');
  assert.equal(data.gradesByAssignment[A]['0'].status, 'correct');
  assert.equal(data.teacherGradeOverridesByAssignment[A]['2'].score, 80);
});
