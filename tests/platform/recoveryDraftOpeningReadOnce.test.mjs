/*
 * ONE READ OF A RECOVERY'S SAVED ANSWERS WHEN IT OPENS AND SAVES (heldDraftRead.js).
 *
 * A Recovery's saved answers (studentWorkspaceDrafts/<student>__<assignment>-recovery)
 * were read with a getDoc as the Recovery opened (useRecoveryAnswerDrafts.js)
 * and again by the first save's transaction, which reads before it merges
 * (recoveryAnswerDraftStore.js): two reads of one document, nearly always at
 * one version. The opening's read is now that transaction's read, held for the
 * first save, as a lesson's drafts are (draftOpeningReadOnce.test.mjs).
 *
 * These run the real store and the real answer sync (recoveryAnswerDrafts.js),
 * wired as the hook wires them, over an in-memory Firestore whose transactions
 * are optimistic, as the web SDK's are (helpers/firestoreClientStub.mjs). What
 * the drafts promised stays: a write another Chromebook made between the read
 * and the save is read again and merged into, never overwritten; a device that
 * cannot reach the server opens from its own copy, says so, and syncs when it
 * can; a read that lands late never overwrites what the student saved since.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { firestoreClient, putDocument, resetFirestoreClient } from './helpers/firestoreClientStub.mjs';

register('./helpers/firestoreClientIsolation.mjs', import.meta.url);
const { openRecoveryAnswerDraft, writeRecoveryAnswerDraft } = await import('../../src/platform/recovery/recoveryAnswerDraftStore.js');
const { createHeldDraftReads } = await import('../../src/platform/persistence/heldDraftRead.js');
const {
  RECOVERY_ANSWER_SAVED_WHERE,
  buildRecoveryAnswerValue,
  buildRecoveryDraftPatch,
  createRecoveryAnswerSync,
  mergeRecoveryDraftDocument,
  readRecoveryDraftEntries,
  recoveryAnswerKey,
  recoveryDraftDocumentId,
} = await import('../../src/platform/recovery/recoveryAnswerDrafts.js');

const STUDENT = '910975';
const ASSIGNMENT = 'a-recovery';
const PATH = `studentWorkspaceDrafts/${recoveryDraftDocumentId({ studentId: STUDENT, assignmentId: ASSIGNMENT })}`;
const key = (itemId) => recoveryAnswerKey({ section: 'dol', opportunity: 1, itemId });
const answer = (itemId, text) => buildRecoveryAnswerValue({ itemId, fingerprint: `fp-${itemId}`, response: { kind: 'scalar', type: 'literal', value: text, fields: [] } });
const draftReads = () => firestoreClient.reads.filter((read) => read.path === PATH).length;
const settle = async () => { for (let turn = 0; turn < 8; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };
const storedAnswers = () => Object.fromEntries(readRecoveryDraftEntries(firestoreClient.documents.get(PATH) || null)
  .map((entry) => [entry.key, entry.value.response?.value]));
// What another Chromebook's save leaves on the server.
const otherDeviceSaves = (entries) => putDocument(PATH, mergeRecoveryDraftDocument({
  existing: firestoreClient.documents.get(PATH) || null,
  patch: buildRecoveryDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries }),
}));

/**
 * A Recovery opening on one device, wired as useRecoveryAnswerDrafts.js wires
 * it: this device's copy first, the server copy read as it opens and held for
 * the next save, every save through the same reads, `online` sending what is
 * pending and reading again.
 */
const openRecovery = ({ local = {}, now = () => 10_000 } = {}) => {
  const retries = [];
  const drafts = createHeldDraftReads({
    open: () => openRecoveryAnswerDraft({ studentId: STUDENT, assignmentId: ASSIGNMENT }),
    write: writeRecoveryAnswerDraft,
  });
  let persisted = {};
  const sync = createRecoveryAnswerSync({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    writer: 'this-chromebook',
    now,
    scheduler: { set: (callback) => { retries.push(callback); return retries.length; }, clear: () => {} },
    flush: (patch) => drafts.save(patch),
    persist: (snapshot) => { persisted = snapshot; },
  });
  sync.hydrate(local);
  let reading = null;
  const read = () => {
    if (reading) return reading;
    reading = drafts.read()
      .then((stored) => { sync.noteServerCopy(readRecoveryDraftEntries(stored)); return true; })
      .catch(() => false)
      .finally(() => { reading = null; });
    return reading;
  };
  return {
    drafts,
    sync,
    read,
    persisted: () => persisted,
    online: () => { sync.retry(); return read(); },
    close: () => { sync.stop(); drafts.release(); },
  };
};

const quietly = async (run) => {
  const warn = console.warn;
  console.warn = () => {};
  try { return await run(); } finally { console.warn = warn; }
};

test('opening a Recovery and saving its first answer read the saved answers once', async () => {
  resetFirestoreClient();
  otherDeviceSaves([{ key: key('r1'), value: answer('r1', '5'), savedAt: 1_000, writer: 'chromebook-1', revision: 1 }]);
  const recovery = openRecovery();
  assert.equal(await recovery.read(), true, 'the server copy reached the screen');
  assert.equal(recovery.sync.entry(key('r1')).value.response.value, '5', 'with the answer saved on the other Chromebook');
  assert.equal(draftReads(), 1);
  recovery.sync.save(key('r2'), answer('r2', '4'));
  assert.equal(await recovery.sync.whenIdle(), true);
  assert.equal(recovery.sync.savedWhere(key('r2')), RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT, '"saved to your account" once the server has it');
  assert.deepEqual(storedAnswers(), { [key('r1')]: '5', [key('r2')]: '4' });
  assert.equal(firestoreClient.commits.length, 1);
  assert.equal(draftReads(), 1, 'one read for the opening and the first save');
  // A later save reads for itself, as every save after the first does.
  recovery.sync.save(key('r3'), answer('r3', '9'));
  await recovery.sync.whenIdle();
  assert.equal(draftReads(), 2);
  recovery.close();
});

test('another Chromebook\'s save between the read and the first save is read again and merged into', async () => {
  resetFirestoreClient();
  const recovery = openRecovery({ now: () => 50_000 });
  await recovery.read();
  // Another Chromebook saves r1, and an older answer to r2, in the meantime.
  let otherDevice = true;
  firestoreClient.beforeCommit = () => {
    if (!otherDevice) return;
    otherDevice = false;
    otherDeviceSaves([
      { key: key('r1'), value: answer('r1', 'theirs'), savedAt: 40_000, writer: 'chromebook-2', revision: 1 },
      { key: key('r2'), value: answer('r2', 'older'), savedAt: 30_000, writer: 'chromebook-2', revision: 1 },
    ]);
  };
  recovery.sync.save(key('r2'), answer('r2', 'mine'));
  await recovery.sync.whenIdle();
  assert.deepEqual(storedAnswers(), { [key('r1')]: 'theirs', [key('r2')]: 'mine' }, 'both Chromebooks\' answers, the newer one to r2');
  assert.equal(draftReads(), 2, 'the refused write costs the one read it needs');
  assert.equal(recovery.sync.savedWhere(key('r2')), RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT);
  recovery.close();
});

test('a read that lands late never overwrites what the student saved since; the save did not wait for it', async () => {
  resetFirestoreClient();
  otherDeviceSaves([{ key: key('r1'), value: answer('r1', 'older, other Chromebook'), savedAt: 1_000, writer: 'chromebook-2', revision: 1 }]);
  // The server answers the opening read at once; its answer is slow to arrive.
  let letRead = null;
  firestoreClient.readAnswersLate = true;
  firestoreClient.readGate = (path, how) => (how === 'transaction' && !letRead ? new Promise((resolve) => { letRead = resolve; }) : null);
  const recovery = openRecovery({ now: () => 60_000 });
  const reading = recovery.read();
  await settle();
  firestoreClient.readGate = null;
  // The student answers r1 before the opening read has come back.
  recovery.sync.save(key('r1'), answer('r1', 'typed here'));
  await recovery.sync.whenIdle();
  assert.equal(firestoreClient.commits.length, 1, 'saved on its own while the opening read was on its way');
  letRead();
  assert.equal(await reading, true, 'the slow copy still reached the screen');
  await settle();
  assert.equal(recovery.sync.entry(key('r1')).value.response.value, 'typed here', 'the late copy, with the other Chromebook\'s older answer, did not overwrite it');
  assert.equal(recovery.sync.savedWhere(key('r1')), RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT);
  assert.deepEqual(storedAnswers(), { [key('r1')]: 'typed here' });
  assert.equal(firestoreClient.commits.length, 1, 'and the late read\'s transaction wrote nothing');
  recovery.close();
});

test('offline: the Recovery opens from this device\'s copy and says so; back online it syncs', async () => {
  resetFirestoreClient();
  otherDeviceSaves([{ key: key('r2'), value: answer('r2', 'from chromebook 2'), savedAt: 2_000, writer: 'chromebook-2', revision: 1 }]);
  firestoreClient.failReads = 1_000;
  const local = { [key('r1')]: { key: key('r1'), value: answer('r1', 'kept here'), savedAt: 3_000, writer: 'this-chromebook', revision: 1, synced: false } };
  const recovery = openRecovery({ local, now: () => 70_000 });
  await quietly(async () => {
    assert.equal(await recovery.read(), false, 'no server copy');
    await recovery.sync.whenIdle();
  });
  assert.equal(recovery.sync.entry(key('r1')).value.response.value, 'kept here', 'the Recovery opens from what this device has');
  assert.equal(recovery.sync.savedWhere(key('r1')), RECOVERY_ANSWER_SAVED_WHERE.DEVICE, '"saved on this device only"');
  assert.equal(recovery.persisted()[key('r1')].synced, false);
  firestoreClient.failReads = 0;
  // Back online.
  await recovery.online();
  await recovery.sync.whenIdle();
  assert.equal(recovery.sync.savedWhere(key('r1')), RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT);
  assert.equal(recovery.sync.entry(key('r2')).value.response.value, 'from chromebook 2', 'and the other Chromebook\'s answer comes in');
  assert.deepEqual(storedAnswers(), { [key('r1')]: 'kept here', [key('r2')]: 'from chromebook 2' });
  recovery.close();
});

test('a read no save takes ends without writing; a newer read lets the older go', async () => {
  resetFirestoreClient();
  const recovery = openRecovery();
  await recovery.read();
  await recovery.read();
  recovery.close();
  await settle();
  assert.equal(firestoreClient.commits.length, 0, 'nothing written');
  assert.equal(draftReads(), 2);
});

/* ------------------------------------------------------------ the wiring */

test('the Recovery reads its saved answers only through the held read, and saves through it', () => {
  const hook = executableSource(readFileSync(new URL('../../src/components/student/useRecoveryAnswerDrafts.js', import.meta.url), 'utf8'));
  assert.match(hook, /import \{ openRecoveryAnswerDraft, writeRecoveryAnswerDraft \} from '\.\.\/\.\.\/platform\/recovery\/recoveryAnswerDraftStore\.js';/);
  assert.match(hook, /import \{ createHeldDraftReads \} from '\.\.\/\.\.\/platform\/persistence\/heldDraftRead\.js';/);
  const effect = region(hook, 'useEffect(() => {', '}, [studentId, assignmentId, section, opportunity, localKey, legacyKey, writer]);', 'the drafts effect');
  assert.match(effect, /const drafts = createHeldDraftReads\(\{\s*open: \(\) => openRecoveryAnswerDraft\(\{ studentId, assignmentId \}\),\s*write: writeRecoveryAnswerDraft,\s*\}\);/);
  assert.match(effect, /flush: \(patch\) => drafts\.save\(patch\),/);
  // Every read of the server copy (opening, back online, back to the tab,
  // before Submit) is the held one, handed to the sync as answers.
  assert.match(region(effect, 'const read = () => {', 'sync.read = read;', 'the read'), /reading = drafts\.read\(\)\s*\.then\(\(stored\) => \{\s*if \(cancelled\) return false;\s*sync\.noteServerCopy\(readRecoveryDraftEntries\(stored\)\);/);
  // The Recovery closing lets a read no save took go, after the sync stopped.
  assert.match(effect, /sync\.stop\(\);\s*drafts\.release\(\);/);
  const store = executableSource(readFileSync(new URL('../../src/platform/recovery/recoveryAnswerDraftStore.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(store, /getDoc/, 'no read of its own beside the held one');
  assert.doesNotMatch(hook, /readRecoveryAnswerDraft\(/);
});
