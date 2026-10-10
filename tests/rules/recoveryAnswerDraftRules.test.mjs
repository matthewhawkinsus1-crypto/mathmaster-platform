import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';

import {
  applyRecoveryAnswerPatch,
  buildRecoveryAnswerValue,
  buildRecoveryDraftPatch,
  readRecoveryDraftEntries,
  recoveryAnswerKey,
  recoveryDraftDocumentId,
} from '../../src/platform/recovery/recoveryAnswerDrafts.js';

// studentWorkspaceDrafts/{studentId}__{assignmentId}-recovery — a student's
// saved Recovery answers (src/platform/recovery/recoveryAnswerDrafts.js),
// through the real Security Rules in the Firestore emulator. No rule changed
// for it: the browser's exact transaction (read first, then a server-stamped
// set) must be allowed by the rules every assignment draft already has, for
// the student who owns it, both when the document does not exist yet and when
// it does; and refused for anyone else and for a grade-bearing field.
//
// Synthetic identities only. Own projectId: rules suites run in parallel.

const PROJECT = 'mathmaster-recovery-answer-draft-rules';
let env;
const studentA = () => env.authenticatedContext('uid-sa', { role: 'student', studentId: 'S_A' }).firestore();
const studentB = () => env.authenticatedContext('uid-sb', { role: 'student', studentId: 'S_B' }).firestore();
const teacher = () => env.authenticatedContext('uid-t', { role: 'teacher', email: 'teacher.a@example.test' }).firestore();

const ASSIGNMENT = 'a-1';
const DOC_ID = recoveryDraftDocumentId({ studentId: 'S_A', assignmentId: ASSIGNMENT });
const answer = (itemId, value) => buildRecoveryAnswerValue({ itemId, fingerprint: `fp-${itemId}`, response: { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'solution', value, isComplete: true }] } });
const patchOf = (entries) => buildRecoveryDraftPatch({ studentId: 'S_A', assignmentId: ASSIGNMENT, entries });
const entry = (itemId, value, savedAt) => ({ key: recoveryAnswerKey({ section: 'dol', opportunity: 1, itemId }), value: answer(itemId, value), savedAt, writer: 'page', revision: savedAt });

// recoveryAnswerDraftStore.js's write, on this context's client SDK.
const save = (db, patch, docId = patch.documentId) => runTransaction(db, (transaction) => applyRecoveryAnswerPatch({
  read: async () => {
    const snapshot = await transaction.get(doc(db, 'studentWorkspaceDrafts', docId));
    return snapshot.exists() ? snapshot.data() : null;
  },
  write: (merged) => { transaction.set(doc(db, 'studentWorkspaceDrafts', docId), { ...merged, updatedAt: serverTimestamp() }); },
}, patch));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8181 },
  });
  await env.clearFirestore();
});

after(async () => {
  await env?.cleanup();
});

test('the student creates and then updates their own Recovery answer draft through the browser\'s transaction', async () => {
  assert.equal(DOC_ID, 'S_A__a-1-recovery');
  await assertSucceeds(save(studentA(), patchOf([entry('r1', 'x=3', 1)])));
  await assertSucceeds(save(studentA(), patchOf([entry('r2', '(2, 0)', 2)])));
  const snapshot = await assertSucceeds(getDoc(doc(studentA(), 'studentWorkspaceDrafts', DOC_ID)));
  const values = Object.fromEntries(readRecoveryDraftEntries(snapshot.data()).map((stored) => [stored.value.itemId, stored.value.response.fields[0].value]));
  assert.deepEqual(values, { r1: 'x=3', r2: '(2, 0)' }, 'both saves survive: merged, never replaced');
});

test('no other student, and no teacher through the client, reads or writes it', async () => {
  await assertFails(getDoc(doc(studentB(), 'studentWorkspaceDrafts', DOC_ID)));
  await assertFails(save(studentB(), patchOf([entry('r1', 'x=99', 9)])));
  await assertFails(getDoc(doc(teacher(), 'studentWorkspaceDrafts', DOC_ID)));
  await assertFails(save(teacher(), patchOf([entry('r1', 'x=99', 9)])));
});

test('a grade-bearing field, a secure flag or a client clock is refused on it', async () => {
  const ref = doc(studentA(), 'studentWorkspaceDrafts', DOC_ID);
  const current = (await getDoc(ref)).data();
  await assertFails(setDoc(ref, { ...current, isCorrect: true, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref, { ...current, solution: 'x=3', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref, { ...current, secure: true, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(ref, { ...current, updatedAt: new Date(Date.now() + 86_400_000) }));
});

test('nobody creates a draft under another student\'s id, which would lock that student out of it', async () => {
  const otherDoc = recoveryDraftDocumentId({ studentId: 'S_A', assignmentId: 'a-2' });
  const forged = { ...buildRecoveryDraftPatch({ studentId: 'S_B', assignmentId: 'a-2', entries: [entry('r1', 'x=1', 1)] }), documentId: otherDoc };
  // A blind write (no read first, so the read rule never stops it).
  const { mergeRecoveryDraftDocument } = await import('../../src/platform/recovery/recoveryAnswerDrafts.js');
  await assertFails(setDoc(doc(studentB(), 'studentWorkspaceDrafts', otherDoc), { ...mergeRecoveryDraftDocument({ patch: forged }), studentId: 'S_B', updatedAt: serverTimestamp() }));
  // So the real owner's first backup still goes through.
  await assertSucceeds(save(studentA(), buildRecoveryDraftPatch({ studentId: 'S_A', assignmentId: 'a-2', entries: [entry('r1', 'x=3', 1)] })));
});
