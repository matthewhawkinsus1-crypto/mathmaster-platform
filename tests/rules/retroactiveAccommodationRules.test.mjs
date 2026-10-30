import test, { before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

let env;
const email = 'correction.teacher@example.test';
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8181').split(':');
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-accommodation-rules', firestore: { host, port: Number(port), rules: await readFile(process.env.ACCOMMODATION_RULES_PATH || new URL('../../firestore.rules', import.meta.url), 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'grades/synthetic-a'), { assignedTeacherEmail: email, classId: 'synthetic-class', profile: { workloadCorrections: { a: { active: true, eventId: 'synthetic-event' } } } });
    await setDoc(doc(db, 'grades/synthetic-b'), { assignedTeacherEmail: 'other.teacher@example.test', profile: {} });
    await setDoc(doc(db, 'grades/synthetic-a/accommodationAdjustments/synthetic-event'), { kind: 'retroactive-grade-correction', sourceDescriptor: 'Private teacher reference' });
  });
});
after(async () => { await env?.cleanup(); });
const teacher = () => env.authenticatedContext('teacher', { role: 'teacher', email }).firestore();
const student = () => env.authenticatedContext('student-a', { role: 'student', studentId: 'synthetic-a' }).firestore();
test('teacher may read immutable audit, students/families/other accounts may not', async () => {
  const path = 'grades/synthetic-a/accommodationAdjustments/synthetic-event';
  await assertSucceeds(getDoc(doc(teacher(), path)));
  for (const db of [student(), env.authenticatedContext('parent', { role: 'parent', studentId: 'synthetic-a' }).firestore(), env.authenticatedContext('other', { role: 'student', studentId: 'synthetic-b' }).firestore(), env.authenticatedContext('other-teacher', { role: 'teacher', email: 'other.teacher@example.test' }).firestore(), env.unauthenticatedContext().firestore()]) await assertFails(getDoc(doc(db, path)));
});
test('no browser may write correction projections or create, change or delete audit events', async () => {
  for (const db of [teacher(), student()]) {
    await assertFails(updateDoc(doc(db, 'grades/synthetic-a'), { 'profile.workloadCorrections.a.active': false }));
    await assertFails(setDoc(doc(db, 'grades/synthetic-new'), { assignedTeacherEmail: email, profile: { workloadCorrections: { a: { active: true } } } }));
    await assertFails(setDoc(doc(db, 'grades/synthetic-a/accommodationAdjustments/new-event'), { action: 'approve' }));
    await assertFails(updateDoc(doc(db, 'grades/synthetic-a/accommodationAdjustments/synthetic-event'), { action: 'reverse' }));
    await assertFails(deleteDoc(doc(db, 'grades/synthetic-a/accommodationAdjustments/synthetic-event')));
  }
});
test('ordinary teacher profile edits preserve corrections, student receipts remain private to owner', async () => {
  await assertSucceeds(updateDoc(doc(teacher(), 'grades/synthetic-a'), { 'profile.translationLanguage': 'es' }));
  await assertSucceeds(getDoc(doc(student(), 'grades/synthetic-a')));
  await assertFails(getDoc(doc(student(), 'grades/synthetic-b')));
});
