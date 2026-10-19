import test, { after, before } from 'node:test';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFile } from 'node:fs/promises';
import {
  deleteDoc, doc, getDoc, setDoc, updateDoc,
} from 'firebase/firestore';

// Every record a growth reward is paid from, through the real Security Rules
// in the Firestore emulator (`npm run test:rules`).
//
// functions/shared/growthRewardRules.mjs mints Class Points and badges from
// these documents, so a client that could write one could mint. Proven here:
//
//   1. studentMasteryProfiles: nobody writes it from a client — not the
//      student, not the current teacher, not a FORMER teacher still in
//      authorizedTeacherEmails, not the root administrator. (It used to be
//      teacher-writable: a former teacher could write 200 made-up Mastered
//      skills, 1,000 Class Points.) Reads are unchanged.
//   2. testCycleRecords, weeklyPathGoalSnapshots, pathSessions,
//      growthRewardState, the ledger and rewardGrants: no client writes.
//   3. grades/{id}: the class of record (classId, classPeriod,
//      assignedTeacherEmail) cannot be changed by a teacher or the student.
//   4. assignments: a teacher cannot change the assessment policy the retest
//      rule reads.
//
// Synthetic identities only. Own projectId: node --test runs rules suites in
// parallel against one emulator.

const PROJECT = 'mathmaster-growth-sources-rules';
const ROOT_ADMIN = 'matthew.hawkins@desotoisd.org';
const TEACHER_NOW = 'gs.teacher.now@example.org';
const TEACHER_FORMER = 'gs.teacher.former@example.org';
const STUDENT = 'GS_STUDENT';

let env;
const admin = () => env.authenticatedContext('uid-admin', { role: 'teacher', admin: true, rootAdmin: true, email: ROOT_ADMIN }).firestore();
const teacherNow = () => env.authenticatedContext('uid-now', { role: 'teacher', email: TEACHER_NOW }).firestore();
const teacherFormer = () => env.authenticatedContext('uid-former', { role: 'teacher', email: TEACHER_FORMER }).firestore();
const student = () => env.authenticatedContext('uid-student', { role: 'student', studentId: STUDENT }).firestore();

const ACCESS = { authorizedTeacherEmails: [TEACHER_FORMER, TEACHER_NOW], originTeacherEmail: TEACHER_FORMER };
const forgedSkill = (code) => ({
  teksCode: code,
  mastery: { estimate: 100, observedPerformance: 100, status: 'Mastered', confidence: 'High' },
  dimensions: { eligibleGradeLevelEvents: 4, modifiedEvidenceEvents: 0, independentSuccesses: 4, dokRepresented: [3], familiesRepresented: [] },
  accumulator: { effectiveWeight: 4, weightedScoreSum: 4, eligibleEvents: 4, modifiedEvents: 0, independentSuccesses: 4 },
  updatedAt: Date.now(),
});
const forgedProfiles = Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`A.${index % 99 + 1}${'ABC'[Math.floor(index / 99)]}`, forgedSkill(`A.${index % 99 + 1}${'ABC'[Math.floor(index / 99)]}`)]));

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
});

after(async () => {
  await env?.cleanup();
});

const seed = () => env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await setDoc(doc(db, 'classes/gs-class'), { teacherOfRecord: TEACHER_NOW, status: 'active' });
  await setDoc(doc(db, 'classes/gs-old-class'), { teacherOfRecord: TEACHER_FORMER, status: 'active' });
  await setDoc(doc(db, `grades/${STUDENT}`), { classId: 'gs-class', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER_NOW, displayName: 'Growth Student' });
  await setDoc(doc(db, `studentMasteryProfiles/${STUDENT}`), {
    studentId: STUDENT, classId: 'gs-class', profiles: { 'A.5A': { teksCode: 'A.5A', mastery: { status: 'Secure' } } }, ...ACCESS,
  });
  await setDoc(doc(db, 'assignments/gs-test'), {
    title: 'Unit 3 Test', assignedClassIds: ['gs-class'], teacherEmail: TEACHER_NOW,
    assessmentPolicy: { mode: 'testCycle', passingScore: 70 },
  });
});

const WRITERS = { student, teacherNow, teacherFormer, admin };

test('studentMasteryProfiles: reads as before, but no client can write it', async () => {
  await seed();
  const path = `studentMasteryProfiles/${STUDENT}`;
  await assertSucceeds(getDoc(doc(student(), path)));
  await assertSucceeds(getDoc(doc(teacherNow(), path)));
  await assertSucceeds(getDoc(doc(teacherFormer(), path)));
  await assertSucceeds(getDoc(doc(admin(), path)));

  for (const [who, firestore] of Object.entries(WRITERS)) {
    // The exploit: a former teacher merging 200 Mastered skills.
    await assertFails(setDoc(doc(firestore(), path), { profiles: forgedProfiles }, { merge: true }), `${who} merge`);
    await assertFails(updateDoc(doc(firestore(), path), { 'profiles.A.1A': forgedSkill('A.1A') }), `${who} update`);
    await assertFails(setDoc(doc(firestore(), path), { studentId: STUDENT, classId: 'gs-class', profiles: forgedProfiles, ...ACCESS }), `${who} overwrite`);
    await assertFails(deleteDoc(doc(firestore(), path)), `${who} delete`);
    // Nor create one for a student who has none yet.
    await assertFails(setDoc(doc(firestore(), 'studentMasteryProfiles/GS_NEW_STUDENT'), { studentId: 'GS_NEW_STUDENT', profiles: forgedProfiles, ...ACCESS }), `${who} create`);
  }
});

test('the other records growth rewards pay from: no client writes any of them', async () => {
  await seed();
  const records = {
    [`testCycleRecords/gs-test__${STUDENT}`]: {
      assignmentId: 'gs-test', studentId: STUDENT, classId: 'gs-class',
      test: { state: 'released', rawScore: 10, releasedAt: Date.now() },
      retest: { state: 'released', rawScore: 100, releasedAt: Date.now() },
    },
    [`weeklyPathGoalSnapshots/${STUDENT}__2026-10-12`]: { studentId: STUDENT, classId: 'gs-class', weekKey: '2026-10-12', goalSessions: 1 },
    'pathSessions/gs-forged-session': { studentId: STUDENT, status: 'completed', weekKey: '2026-10-12', completedAt: Date.now() },
    [`growthRewardState/${STUDENT}`]: { studentId: STUDENT, masteryBaseline: { skills: [] } },
    'classPointTransactions/gra_forged': { studentId: STUDENT, classId: 'gs-class', amount: 20, sourceType: 'growthReward', ...ACCESS },
    'rewardGrants/grg_forged': { studentId: STUDENT, classId: 'gs-class', rewardCode: 'badge', status: 'available', ...ACCESS },
  };
  for (const [path, data] of Object.entries(records)) {
    for (const [who, firestore] of Object.entries(WRITERS)) {
      await assertFails(setDoc(doc(firestore(), path), data), `${who} ${path}`);
    }
  }
});

test('grades: nobody moves the class of record a reward is paid into', async () => {
  await seed();
  const path = `grades/${STUDENT}`;
  for (const [who, firestore] of Object.entries({ student, teacherNow, teacherFormer })) {
    await assertFails(updateDoc(doc(firestore(), path), { classId: 'gs-old-class' }), `${who} classId`);
    await assertFails(updateDoc(doc(firestore(), path), { assignedTeacherEmail: TEACHER_FORMER }), `${who} teacher of record`);
  }
});

test('assignments: a teacher cannot change the assessment policy the retest reward reads', async () => {
  await seed();
  for (const firestore of [teacherNow, teacherFormer]) {
    await assertFails(updateDoc(doc(firestore(), 'assignments/gs-test'), { 'assessmentPolicy.passingScore': 0 }));
    await assertFails(updateDoc(doc(firestore(), 'assignments/gs-test'), {
      assessmentPolicy: { mode: 'testCycle', passingScore: 70, externalAssessment: true },
    }));
  }
});
