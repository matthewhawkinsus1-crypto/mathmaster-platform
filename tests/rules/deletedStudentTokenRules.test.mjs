/*
 * A DELETED STUDENT'S TOKEN RE-CREATES NOTHING (SI06, C1-68).
 *
 * Run with: npm run test:rules (real Firestore emulator, real firestore.rules).
 *
 * permanentlyDeleteStudent revokes the student's refresh tokens and deletes
 * their roster row, but an ID token already issued stays valid for up to an
 * hour, and rules cannot see a revocation. A student permanently deleted while
 * their tab is open would otherwise keep writing: the presence heartbeat every
 * 20 seconds, engagement minutes, a scratchpad, a checkpoint, a draft, their
 * Path history — each a record of a student the deletion just erased. Every
 * one of those writes now needs the roster row, so the deletion is final the
 * moment the row is gone.
 *
 * Both ways round: a rostered student's own writes still work, and the same
 * writes from the same token fail once the row is deleted.
 *
 * Synthetic identities only. Own projectId: node --test runs the rules suites
 * in parallel processes against one emulator.
 */
import test, { after, before, beforeEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT = 'mathmaster-deleted-student-token-rules';
const TEACHER = 'teacher.a@desotoisd.org';
const STUDENT = 'S_GONE';
const ASSIGNMENT = 'A1';

let env;

const student = () => env.authenticatedContext('uid-gone', { role: 'student', studentId: STUDENT }).firestore();
const asServer = (work) => env.withSecurityRulesDisabled((context) => work(context.firestore()));

const rosterRow = () => ({
  classId: 'class-a', classPeriod: 'Period 1', assignedTeacherEmail: TEACHER, status: 'active', displayName: 'Student Gone',
});

const heartbeat = () => ({
  studentId: STUDENT, name: 'Student Gone', classId: 'class-a', assignmentId: ASSIGNMENT,
  activityRole: 'classwork', questionIndex: 0, pageVisible: true, updatedAt: Date.now(),
});

const engagementLedger = () => {
  const minute = Math.floor(Date.now() / 60000);
  const utcDay = Math.floor(Date.now() / 86400000);
  return {
    id: `${ASSIGNMENT}__${utcDay}`,
    data: { schemaVersion: 1, studentId: STUDENT, assignmentId: ASSIGNMENT, utcDay, minutes: [minute], lastRecordedAt: serverTimestamp() },
  };
};

const checkpoint = (questionIndex) => ({
  documentId: `${STUDENT}__${ASSIGNMENT}__${questionIndex}`, studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex,
  questionId: `q${questionIndex}`, variantIndex: 0, generationKey: null, activityRole: 'classwork',
  secure: false, schemaVersion: 2, serverAcknowledgedAt: serverTimestamp(), status: 'active',
  candidateFinalizeAt: null, isComplete: true, revision: 1, previousTotalAttempts: 0, answerState: { value: '2x+1' },
});

const draft = (assignmentId) => ({
  documentId: `${STUDENT}__${assignmentId}`, studentId: STUDENT, assignmentId, secure: false,
  schemaVersion: 1, updatedAt: serverTimestamp(), entries: {},
});

// Everything a signed-in student's own app writes without a callable, and
// whose rule did not already read the roster row.
const ownWrites = (db) => {
  const ledger = engagementLedger();
  return {
    presence: () => setDoc(doc(db, `presence/${STUDENT}`), heartbeat()),
    engagementMinutes: () => setDoc(doc(db, `grades/${STUDENT}/engagementMinutes/${ledger.id}`), ledger.data),
    scratchpad: () => setDoc(doc(db, `grades/${STUDENT}/scratchpads/${ASSIGNMENT}__question_1`), { dataUrl: 'data:,x' }),
    pathHistory: () => setDoc(doc(db, `pathHistory/${STUDENT}`), { entries: [] }),
    checkpointCreate: () => setDoc(doc(db, `studentResponseCheckpoints/${STUDENT}__${ASSIGNMENT}__1`), checkpoint(1)),
    checkpointUpdate: () => updateDoc(doc(db, `studentResponseCheckpoints/${STUDENT}__${ASSIGNMENT}__0`), {
      revision: 2, serverAcknowledgedAt: serverTimestamp(), answerState: { value: '2x+2' },
    }),
    draftCreate: () => setDoc(doc(db, `studentWorkspaceDrafts/${STUDENT}__A2`), draft('A2')),
    draftUpdate: () => setDoc(doc(db, `studentWorkspaceDrafts/${STUDENT}__${ASSIGNMENT}`), { ...draft(ASSIGNMENT), entries: { 0: { value: 'x' } } }),
  };
};

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8181,
    },
  });
});

// Each case starts from a rostered student mid-lesson: a heartbeat, a
// checkpoint and a draft already on the server.
beforeEach(async () => {
  await env.clearFirestore();
  await asServer(async (db) => {
    await setDoc(doc(db, `grades/${STUDENT}`), rosterRow());
    await setDoc(doc(db, `presence/${STUDENT}`), heartbeat());
    await setDoc(doc(db, `studentResponseCheckpoints/${STUDENT}__${ASSIGNMENT}__0`), { ...checkpoint(0), serverAcknowledgedAt: new Date() });
    await setDoc(doc(db, `studentWorkspaceDrafts/${STUDENT}__${ASSIGNMENT}`), { ...draft(ASSIGNMENT), updatedAt: new Date() });
  });
});

after(async () => {
  await env?.cleanup();
});

// Every write, each named in the failure, so one case names the path that broke.
const expectEach = async (writes, expectation) => {
  for (const [name, write] of Object.entries(writes)) {
    try {
      await expectation(write());
    } catch (error) {
      throw new Error(`${name}: ${error.message}`);
    }
  }
};

test('a rostered student still writes their own heartbeat, minutes, scratchpad, Path history, checkpoints and drafts', async () => {
  await expectEach(ownWrites(student()), assertSucceeds);
});

test('once permanent deletion removes the roster row, the same unexpired token writes none of them', async () => {
  // permanentlyDeleteStudent's order: tokens revoked, then the row deleted
  // (Admin SDK). Their open tab still holds an ID token.
  await asServer((db) => deleteDoc(doc(db, `grades/${STUDENT}`)));
  await expectEach(ownWrites(student()), assertFails);
});
