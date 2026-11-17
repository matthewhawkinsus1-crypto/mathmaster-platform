/*
 * ONE READ OF A STUDENT'S DRAFTS WHEN A LESSON OPENS (heldDraftRead.js).
 *
 * The reads probe (tests/browser/teacherWorkflow/sessionReadsProbe.mjs) found
 * `studentWorkspaceDrafts/<student>__<assignment>` read twice whenever a
 * lesson opened, at one version: App.jsx's read of the server copy, then the
 * first background save's transaction, which reads before it merges. The
 * opening's read is now that transaction's read, and the first save is
 * written in it. These run the real store (workspaceDraftStore.js) over an
 * in-memory Firestore whose transactions are optimistic, as the web SDK's are
 * (helpers/firestoreClientStub.mjs), and the real background save engine.
 *
 * What the draft code promises stays: the newest edit wins across devices (a
 * save is merged into what is stored when it is written: a write another
 * device made after the read is read again, not overwritten), an offline
 * device opens from what it has, a save never waits for a slow read, and the
 * merge and restore rules themselves are untouched (the browser journeys,
 * draftCrossDeviceJourneys.mjs, pin the rest).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { firestoreClient, putDocument, resetFirestoreClient } from './helpers/firestoreClientStub.mjs';

register('./helpers/firestoreClientIsolation.mjs', import.meta.url);
const { openWorkspaceDraft, writeWorkspaceDraft } = await import('../../src/platform/persistence/workspaceDraftStore.js');
const { createHeldDraftReads, holdDraftRead } = await import('../../src/platform/persistence/heldDraftRead.js');
const { createWorkspaceDraftSync } = await import('../../src/platform/persistence/workspaceDraftSync.js');
const { buildQuestionDraftKey } = await import('../../src/questionDraftStorage.js');
const { readWorkspaceDraftEntries } = await import('../../functions/shared/workspaceDraftSchema.mjs');

const STUDENT = '910101';
const ASSIGNMENT = 'a-today';
const PATH = `studentWorkspaceDrafts/${STUDENT}__${ASSIGNMENT}`;
const key = (questionIndex) => `${buildQuestionDraftKey({ studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex })}:literal`;
const draftReads = () => firestoreClient.reads.filter((read) => read.path === PATH).length;
// Every promise the in-memory Firestore, the held read and the sync have queued.
const settle = async () => { for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };
const stored = () => firestoreClient.documents.get(PATH) || null;
const entries = () => Object.fromEntries(readWorkspaceDraftEntries(stored()).map((entry) => [entry.key, entry.value]));

/** A scheduler whose timers fire only when the test says so (the 2.5 s debounce). */
const manualScheduler = () => {
  const queued = new Map();
  let next = 0;
  return {
    set: (callback) => { next += 1; queued.set(next, callback); return next; },
    clear: (handle) => queued.delete(handle),
    async runAll() {
      const callbacks = [...queued.values()];
      queued.clear();
      callbacks.forEach((callback) => callback());
      await settle();
    },
  };
};

/**
 * A lesson opening on one device, wired as App.jsx wires it: the sync, the
 * server copy read as it opens (and handed to the sync when it lands), and
 * every save through the same reads and saves.
 */
const openLesson = ({ studentId = STUDENT } = {}) => {
  const scheduler = manualScheduler();
  const drafts = createHeldDraftReads({
    open: () => openWorkspaceDraft({ studentId, assignmentId: ASSIGNMENT }),
    write: writeWorkspaceDraft,
  });
  const landed = [];
  const sync = createWorkspaceDraftSync({
    studentId,
    assignmentId: ASSIGNMENT,
    classId: 'algebra-2-p3',
    scheduler,
    flush: async ({ document }) => drafts.save(document),
  });
  const readServerCopy = () => drafts.read().then((copy) => {
    landed.push(copy);
    sync.noteServerCopy(readWorkspaceDraftEntries(copy));
  }, () => { landed.push('failed'); });
  return { scheduler, drafts, sync, landed, readServerCopy };
};

test('opening a lesson and its first save read the drafts once', async () => {
  resetFirestoreClient();
  putDocument(PATH, { schemaVersion: 1, documentId: `${STUDENT}__${ASSIGNMENT}`, studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [], resume: null, practice: null });
  const lesson = openLesson();
  const reading = lesson.readServerCopy();
  // As the question opens: where the student is, and this device's practice (none).
  lesson.sync.setResume({ questionIndex: 2, activityRole: 'classwork', variantIndex: 0, updatedAt: 1_000 });
  lesson.sync.setPractice(null);
  await reading;
  assert.equal(lesson.landed.length, 1, 'the server copy reached the screen');
  assert.equal(draftReads(), 1);
  // The debounce comes due: the first save.
  await lesson.scheduler.runAll();
  assert.equal(firestoreClient.commits.length, 1, 'the save was written');
  assert.equal(stored().resume.questionIndex, 2);
  assert.equal(draftReads(), 1, 'one read of the drafts for the opening and the first save');
  // The student types; that save reads before it merges, as every later save does.
  lesson.sync.record({ key: key(2), value: 'x = 4', savedAt: 2_000, edit: true });
  await lesson.scheduler.runAll();
  assert.equal(entries()[key(2)], 'x = 4');
  assert.equal(draftReads(), 2, 'a later save reads for itself');
});

test('another device\'s save between the read and the first save is read again and kept: the newest edit wins', async () => {
  resetFirestoreClient();
  const lesson = openLesson();
  await lesson.readServerCopy();
  lesson.sync.record({ key: key(1), value: 'mine', savedAt: 5_000, edit: true });
  // Another Chromebook saves question 0, and an older edit of question 1, in the meantime.
  let otherDevice = true;
  firestoreClient.beforeCommit = () => {
    if (!otherDevice) return;
    otherDevice = false;
    putDocument(PATH, {
      schemaVersion: 1,
      documentId: `${STUDENT}__${ASSIGNMENT}`,
      studentId: STUDENT,
      assignmentId: ASSIGNMENT,
      entries: [
        { key: key(0), valueJson: JSON.stringify('theirs'), savedAt: 4_000, savedAtIsEdit: true, questionIndex: 0, variantIndex: 0 },
        { key: key(1), valueJson: JSON.stringify('older'), savedAt: 3_000, savedAtIsEdit: true, questionIndex: 1, variantIndex: 0 },
      ],
    });
  };
  await lesson.scheduler.runAll();
  assert.deepEqual(entries(), { [key(0)]: 'theirs', [key(1)]: 'mine' }, 'both devices\' work, the newer edit of question 1');
  assert.equal(draftReads(), 2, 'the refused write costs the one read it needs');
  assert.equal(lesson.landed.length, 1, 'and the screen was handed the copy once');
});

test('a save never waits for a slow opening read; the copy still comes', async () => {
  resetFirestoreClient();
  let letRead = null;
  firestoreClient.readGate = (path, how) => (how === 'transaction' && !letRead ? new Promise((resolve) => { letRead = resolve; }) : null);
  const lesson = openLesson();
  const reading = lesson.readServerCopy();
  await settle();
  lesson.sync.setResume({ questionIndex: 0, activityRole: 'classwork', variantIndex: 0, updatedAt: 1_000 });
  firestoreClient.readGate = null;
  await lesson.scheduler.runAll();
  assert.equal(firestoreClient.commits.length, 1, 'saved on its own while the opening read was on its way');
  letRead();
  await reading;
  assert.equal(lesson.landed.length, 1, 'the slow copy still reached the screen');
  assert.equal(firestoreClient.commits.length, 1, 'and its transaction wrote nothing');
});

test('offline: the device opens from what it has; back online, one read serves the screen and the save', async () => {
  resetFirestoreClient();
  putDocument(PATH, { schemaVersion: 1, documentId: `${STUDENT}__${ASSIGNMENT}`, studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [{ key: key(0), valueJson: JSON.stringify('from A'), savedAt: 4_000, savedAtIsEdit: true, questionIndex: 0, variantIndex: 0 }] });
  firestoreClient.failReads = 5;
  const lesson = openLesson();
  await lesson.readServerCopy();
  assert.deepEqual(lesson.landed, ['failed'], 'no server copy: the question opens from this device');
  // A workspace writing back what it read (not an edit) waits to learn what the server holds.
  lesson.sync.record({ key: key(0), value: '', savedAt: 0, edit: false });
  firestoreClient.failReads = 0;
  // Back online (App reads again on `online`), then the resume is saved.
  const before = draftReads();
  await lesson.readServerCopy();
  assert.equal(lesson.landed.at(-1)[`entries`].length, 1, 'A\'s work comes in');
  lesson.sync.setResume({ questionIndex: 0, activityRole: 'classwork', variantIndex: 0, updatedAt: 9_000 });
  await lesson.scheduler.runAll();
  assert.equal(draftReads() - before, 1, 'one read for the copy and the save');
  assert.deepEqual(entries(), { [key(0)]: 'from A' }, 'the empty boxes it opened with never reach the server copy');
});

test('a read no save takes ends without writing; a newer read lets the older go', async () => {
  resetFirestoreClient();
  const lesson = openLesson();
  await lesson.readServerCopy();
  await lesson.readServerCopy();
  lesson.drafts.release();
  await settle();
  assert.equal(firestoreClient.commits.length, 0, 'nothing written');
  assert.equal(draftReads(), 2);
});

test('the held read hands the copy over once, and its save once', async () => {
  resetFirestoreClient();
  const reference = { path: PATH };
  const { runTransaction } = await import('./helpers/firestoreClientStub.mjs');
  const writes = [];
  const held = holdDraftRead({
    transact: (update) => runTransaction(null, update),
    read: async (transaction) => { const snapshot = await transaction.get(reference); return snapshot.exists() ? snapshot.data() : null; },
    write: (transaction, existing, patch) => { writes.push({ existing, patch }); transaction.set(reference, { patch }); return ['dropped-key']; },
  });
  assert.equal(held.landed, false);
  assert.equal(await held.serverCopy, null, 'no document yet');
  assert.equal(held.landed, true);
  assert.deepEqual(await held.save({ n: 1 }), { written: true, droppedKeys: ['dropped-key'] });
  await assert.rejects(held.save({ n: 2 }), /used/, 'a held read writes once');
  assert.deepEqual(writes, [{ existing: null, patch: { n: 1 } }]);
});

/* ------------------------------------------------------------ the wiring */

const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));

test('App reads the server copy through the held read and saves through it', () => {
  assert.match(app, /import \{ openWorkspaceDraft, readLatestWorkspaceResume, writeWorkspaceDraft \} from '\.\/platform\/persistence\/workspaceDraftStore\.js';/);
  assert.match(app, /import \{ createHeldDraftReads \} from '\.\/platform\/persistence\/heldDraftRead\.js';/);
  assert.doesNotMatch(app, /readWorkspaceDraft\(/, 'no read of its own beside the held one');
  const sync = region(app, 'const activeAssignmentUsesWorkspaceDrafts = useMemo(', '}, [user?.role, user?.id, user?.classId, activeAssignmentId, isTeacherPreview, activeAssignmentUsesWorkspaceDrafts]);', 'the draft sync');
  assert.match(sync, /const drafts = createHeldDraftReads\(\{\s*open: \(\) => openWorkspaceDraft\(\{ studentId: user\.id, assignmentId: activeAssignmentId \}\),\s*write: writeWorkspaceDraft,\s*\}\);/);
  assert.match(region(sync, 'flush: async ({ document }) => {', '},', 'the flush'), /const result = await drafts\.save\(document\);[\s\S]*return result;/);
  assert.match(region(sync, 'const readServerCopy = () => {', '.catch((error) => {', 'the read'), /drafts\.read\(\)\s*\.then\(\(stored\) => \{/);
  // The assignment closing lets a read no save took go, after the last save.
  assert.match(sync, /void sync\.flushNow\(\);\s*sync\.stop\(\);\s*drafts\.release\(\);/);
});
