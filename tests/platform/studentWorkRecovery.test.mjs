/*
 * STUDENT WORK SURVIVES THE DEVICE.
 *
 * Students were losing Classwork and Practice progress after turning a
 * Chromebook off. There are four different kinds of state behind that one
 * complaint, and they fail for different reasons:
 *
 *   1. submitted work        — canonical in grades/{studentId}; restored at
 *                              sign-in, plus whatever the durable outbox still
 *                              owes the server;
 *   2. unfinished workspaces — local-first drafts with a coalesced server copy;
 *   3. the resume position   — server-backed so a different Chromebook works;
 *   4. Practice Mode         — persisted, and kept away from grades entirely.
 *
 * The other half of this file is the performance contract. All of the above is
 * worth nothing if it puts a network round trip in front of a keystroke.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildWorkspaceDraftDocument,
  isSyncableDraftKey,
  readWorkspaceDraftEntries,
  sanitizeWorkspaceDraftValue,
  selectRestorableDraftEntries,
  workspaceDraftDocumentId,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import {
  createDurableAction,
  createMemoryOutboxStorage,
  drainDurableActions,
  enqueueDurableAction,
  listDurableActions,
  overlayDurableActionsOnGrades,
} from '../../src/platform/performance/durableActionOutbox.js';
import { normalizeQuestionRecord, recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';

const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const draftStorageSource = readFileSync(new URL('../../src/questionDraftStorage.js', import.meta.url), 'utf8');
const syncSource = readFileSync(new URL('../../src/platform/persistence/workspaceDraftSync.js', import.meta.url), 'utf8');
const engineSource = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

const STUDENT = 'S1042';
const ASSIGNMENT = 'A1';

const draftKey = (questionIndex, suffix, { sessionMode = 'graded', variantIndex = 0 } = {}) => (
  `${buildQuestionDraftKey({ studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex, variantIndex, sessionMode })}:${suffix}`
);

/** A scheduler whose timers only fire when the test says so. */
const manualScheduler = () => {
  const queued = new Map();
  let nextHandle = 1;
  return {
    set: (callback) => { const handle = nextHandle += 1; queued.set(handle, callback); return handle; },
    clear: (handle) => queued.delete(handle),
    runAll() {
      const callbacks = [...queued.values()];
      queued.clear();
      callbacks.forEach((callback) => callback());
      return callbacks.length;
    },
    pending: () => queued.size,
  };
};

const trackingSync = (overrides = {}) => {
  const writes = [];
  const scheduler = manualScheduler();
  const sync = createWorkspaceDraftSync({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    classId: 'class-a',
    scheduler,
    flush: async ({ document }) => { writes.push(document); },
    ...overrides,
  });
  return { sync, scheduler, writes };
};

/* ==========================================================================
 * 1-3. SUBMITTED WORK SURVIVES A FRESH APPLICATION SESSION.
 * ======================================================================== */

/**
 * A fresh sign-in, the way App.jsx does it: the canonical grades document is
 * the tracker, and anything the durable outbox still owes the server is
 * overlaid on top so the student sees their own score before the network
 * catches up.
 */
const hydrateFreshSession = async ({ canonicalGrades, storage }) => {
  const queued = await listDurableActions({ storage, studentId: STUDENT });
  return overlayDurableActionsOnGrades(canonicalGrades, queued);
};

const submitAttempt = (record, isCorrect) => recordQuestionAttempt({
  record,
  isCorrect,
  questionDetails: 'question',
  responseKey: isCorrect ? 'right' : 'wrong',
  maximumAttempts: 3,
});

test('submitted Classwork survives a fresh application session', async () => {
  const canonical = { [ASSIGNMENT]: { 0: submitAttempt(null, true).record } };
  const restored = await hydrateFreshSession({ canonicalGrades: canonical, storage: createMemoryOutboxStorage() });
  const record = normalizeQuestionRecord(restored[ASSIGNMENT][0]);
  assert.equal(record.status, 'correct');
  assert.equal(record.attemptCount, 1);
  assert.equal(record.totalAttempts, 1);
  assert.equal(record.partialCredit, 100);
});

test('submitted Practice-section work survives a fresh application session', async () => {
  // Practice inside an open graded assignment is canonical exactly like
  // Classwork. Only POST-deadline Practice Mode is the separate structure.
  const first = submitAttempt(null, false);
  const second = submitAttempt(first.record, true);
  const canonical = { [ASSIGNMENT]: { 3: second.record } };
  const restored = await hydrateFreshSession({ canonicalGrades: canonical, storage: createMemoryOutboxStorage() });
  const record = normalizeQuestionRecord(restored[ASSIGNMENT][3]);
  assert.equal(record.status, 'correct');
  assert.equal(record.totalAttempts, 2);
});

test('several submitted questions keep their statuses, attempt counts and variants', async () => {
  const wrongTwice = submitAttempt(submitAttempt(null, false).record, false);
  const canonical = {
    [ASSIGNMENT]: {
      0: submitAttempt(null, true).record,
      1: wrongTwice.record,
      2: { ...submitAttempt(null, false).record, variantIndex: 2, bestPartialCredit: 60 },
    },
  };
  const restored = await hydrateFreshSession({ canonicalGrades: canonical, storage: createMemoryOutboxStorage() });
  assert.equal(normalizeQuestionRecord(restored[ASSIGNMENT][0]).status, 'correct');
  assert.equal(normalizeQuestionRecord(restored[ASSIGNMENT][1]).attemptCount, 2);
  assert.equal(normalizeQuestionRecord(restored[ASSIGNMENT][1]).status, 'attempted');
  assert.equal(normalizeQuestionRecord(restored[ASSIGNMENT][2]).variantIndex, 2);
  assert.equal(normalizeQuestionRecord(restored[ASSIGNMENT][2]).bestPartialCredit, 60);
});

test('work submitted while offline is still there after a restart, and reconciles', async () => {
  // The Chromebook was turned off before the network came back. The envelope is
  // in IndexedDB, so a fresh session shows the score AND still owes the server.
  const storage = createMemoryOutboxStorage();
  const outcome = submitAttempt(null, true);
  await enqueueDurableAction(createDurableAction({
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: 4,
    payload: { previousTotalAttempts: 0, activityRole: 'classwork', record: outcome.record },
  }), { storage });

  const restored = await hydrateFreshSession({ canonicalGrades: {}, storage });
  assert.equal(normalizeQuestionRecord(restored[ASSIGNMENT][4]).status, 'correct');

  const reconciled = [];
  const result = await drainDurableActions({
    storage,
    studentId: STUDENT,
    reconcile: async (action) => { reconciled.push(action); return { status: 'durable' }; },
  });
  assert.equal(result.recovered, 1);
  assert.equal(result.remaining, 0);
  assert.equal(reconciled[0].questionIndex, 4);
});

/* ==========================================================================
 * 4-7. UNFINISHED WORKSPACES SURVIVE, AND NEVER BEAT NEWER WORK.
 * ======================================================================== */

test('a partially completed Work View is captured for every draft-backed tool', () => {
  const { sync, scheduler, writes } = trackingSync();
  // One of each shape a real tool stores: a typed expression, a map of table
  // cells, plotted points, and a workflow stage.
  sync.record({ key: draftKey(0, 'literal'), value: 'A/b', savedAt: 10 });
  sync.record({ key: draftKey(1, 'table'), value: { 'x=1': '5', 'x=2': '9' }, savedAt: 11 });
  sync.record({ key: draftKey(2, 'line'), value: { slope: '3', intercept: '-2' }, savedAt: 12 });
  sync.record({ key: draftKey(3, 'workflow'), value: { stage: 2, responses: { a: 'yes' } }, savedAt: 13 });
  scheduler.runAll();

  assert.equal(writes.length, 1, 'four edits, one write');
  assert.equal(writes[0].entries.length, 4);
  assert.deepEqual(writes[0].entries.map((entry) => entry.questionIndex), [0, 1, 2, 3]);
  const restored = readWorkspaceDraftEntries(writes[0]);
  assert.deepEqual(restored[1].value, { 'x=1': '5', 'x=2': '9' });
  assert.deepEqual(restored[2].value, { slope: '3', intercept: '-2' });
  assert.deepEqual(restored[3].value, { stage: 2, responses: { a: 'yes' } });
});

test('a workspace whose shape Firestore would reject still round-trips', () => {
  // Plotted strokes are arrays of arrays of points, which Firestore refuses to
  // store directly. The draft is serialized, so the tool gets its own shape
  // back exactly.
  const value = { strokes: [[{ x: 1, y: 2 }, { x: 3, y: 4 }], []], chosenXValues: { t1: '5' } };
  const { sync, scheduler, writes } = trackingSync();
  sync.record({ key: draftKey(0, 'graph-story'), value, savedAt: 1 });
  scheduler.runAll();
  assert.equal(typeof writes[0].entries[0].valueJson, 'string');
  assert.deepEqual(readWorkspaceDraftEntries(writes[0])[0].value, value);
});

test('a server-backed draft restores on a different device', () => {
  const stored = buildWorkspaceDraftDocument({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    entries: [{ key: draftKey(0, 'literal'), value: 'A/b', savedAt: 5_000, questionIndex: 0 }],
  });
  // The second Chromebook has never seen this assignment.
  const restorable = selectRestorableDraftEntries({
    entries: readWorkspaceDraftEntries(stored),
    localSavedAt: () => 0,
    canonicalSavedAt: () => 0,
  });
  assert.equal(restorable.length, 1);
  assert.equal(restorable[0].value, 'A/b');
  assert.equal(workspaceDraftDocumentId({ studentId: STUDENT, assignmentId: ASSIGNMENT }), 'S1042__A1');
});

test('an older draft cannot overwrite newer submitted work', () => {
  const entries = [{ key: draftKey(0, 'literal'), value: 'half-finished', savedAt: 1_000, questionIndex: 0 }];
  // The student submitted question 0 from another device AFTER this draft.
  const restorable = selectRestorableDraftEntries({
    entries,
    localSavedAt: () => 0,
    canonicalSavedAt: () => 2_000,
  });
  assert.equal(restorable.length, 0);
});

test('a draft this device already has a newer copy of is left alone', () => {
  const entries = [{ key: draftKey(0, 'literal'), value: 'stale', savedAt: 1_000, questionIndex: 0 }];
  assert.equal(selectRestorableDraftEntries({ entries, localSavedAt: () => 4_000, canonicalSavedAt: () => 0 }).length, 0);
  assert.equal(selectRestorableDraftEntries({ entries, localSavedAt: () => 100, canonicalSavedAt: () => 0 }).length, 1);
});

test('the latest incomplete draft restores without becoming an attempt', () => {
  const { sync, scheduler, writes } = trackingSync();
  sync.record({ key: draftKey(0, 'literal'), value: 'A/', savedAt: 20 });
  scheduler.runAll();
  const document = writes[0];
  // A workspace document carries work, never a result.
  for (const forbidden of ['gradesByAssignment', 'isCorrect', 'score', 'record', 'attemptCount', 'totalAttempts', 'evidenceEvent']) {
    assert.ok(!Object.hasOwn(document, forbidden), `a workspace draft must not carry ${forbidden}`);
  }
  assert.equal(readWorkspaceDraftEntries(document)[0].value, 'A/');
});

test('restoring drafts is the last step, after canonical grades and the outbox', () => {
  const start = appSource.indexOf('SERVER-BACKED WORKING DRAFTS');
  const block = appSource.slice(start, appSource.indexOf('const assignmentOpenSpanRef', start));
  assert.match(block, /readWorkspaceDraft\(\{ studentId: user\.id, assignmentId: activeAssignmentId \}\)/);
  assert.match(block, /selectRestorableDraftEntries\(\{/);
  assert.match(block, /localSavedAt: \(key\) => questionDraftSavedAt\(key\)/);
  assert.match(block, /canonicalSavedAt:/);
  assert.match(block, /record\.lastAttemptAt/);
});

/* ==========================================================================
 * 8-11. RESUME POSITION AND PRACTICE MODE.
 * ======================================================================== */

test('the resume position is written to the server, not only to this browser', () => {
  const { sync, scheduler, writes } = trackingSync();
  sync.setResume({ questionIndex: 4, activityRole: 'classwork', variantIndex: 1, updatedAt: 99 });
  scheduler.runAll();
  assert.deepEqual(writes[0].resume, { questionIndex: 4, activityRole: 'classwork', variantIndex: 1, updatedAt: 99 });
  assert.match(appSource, /workspaceDraftSyncRef\.current\?\.setResume\(\{/);
  assert.match(appSource, /readLatestWorkspaceResume\(studentId\)/);
});

test('post-deadline Practice Mode survives a fresh session', () => {
  const { sync, scheduler, writes } = trackingSync();
  sync.setPractice({ 0: { status: 'correct', attemptCount: 1 }, 1: { status: 'attempted', attemptCount: 2 } });
  scheduler.runAll();
  assert.equal(writes[0].practice[0].status, 'correct');
  assert.equal(writes[0].practice[1].attemptCount, 2);
  assert.match(appSource, /sync\.setPractice\(practiceTracker\[activeAssignmentId\] \|\| null\)/);
});

test('Practice Mode persistence cannot change a canonical grade or wake Classroom', () => {
  const { sync, scheduler, writes } = trackingSync();
  sync.setPractice({ 0: { status: 'correct' } });
  scheduler.runAll();
  // It is a different collection from grades/{studentId}, which is the only
  // document the Classroom passback trigger watches.
  assert.equal(writes[0].documentId, 'S1042__A1');
  assert.ok(!Object.hasOwn(writes[0], 'gradesByAssignment'));
  const start = appSource.indexOf('POST-DEADLINE PRACTICE MODE IS NOT A GRADE');
  const block = appSource.slice(start, appSource.indexOf('const assignmentOpenSpanRef', start));
  assert.doesNotMatch(block, /updateDoc\(doc\(db, 'grades'/);
  assert.doesNotMatch(block, /setTracker\(/);
});

test('practising after the deadline never overwrites the graded workspace', () => {
  const graded = draftKey(2, 'literal', { sessionMode: 'graded' });
  const practice = draftKey(2, 'literal', { sessionMode: 'post-deadline-practice' });
  assert.notEqual(graded, practice);
  const { sync, scheduler, writes } = trackingSync();
  sync.record({ key: graded, value: 'submitted work', savedAt: 1 });
  sync.record({ key: practice, value: 'practice attempt', savedAt: 2 });
  scheduler.runAll();
  assert.equal(writes[0].entries.length, 2, 'both survive, in their own buckets');
});

/* ==========================================================================
 * 12-14. THE INTERACTION PATH NEVER WAITS ON THE NETWORK.
 * ======================================================================== */

test('saving a draft does not block the interaction critical path', () => {
  let flushed = 0;
  const scheduler = manualScheduler();
  const sync = createWorkspaceDraftSync({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    scheduler,
    // A flush that never settles: a dead network, a hung request.
    flush: () => new Promise(() => { flushed += 1; }),
  });
  // Every one of these returns synchronously.
  for (let index = 0; index < 50; index += 1) {
    assert.equal(sync.record({ key: draftKey(0, 'literal'), value: `x${index}`, savedAt: index }), true);
  }
  assert.equal(flushed, 0, 'nothing is written while the student is still typing');
  scheduler.runAll();
  assert.equal(flushed, 1);
  // And the student can keep working against a request that never returns.
  assert.equal(sync.record({ key: draftKey(0, 'literal'), value: 'still typing', savedAt: 999 }), true);
});

test('high-frequency answer changes are coalesced instead of written per keystroke', () => {
  const { sync, scheduler, writes } = trackingSync();
  'A/b'.split('').forEach((character, index) => {
    sync.record({ key: draftKey(0, 'literal'), value: 'A/b'.slice(0, index + 1), savedAt: index });
  });
  assert.equal(writes.length, 0);
  assert.equal(scheduler.pending(), 1, 'one pending flush, not one per character');
  scheduler.runAll();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].entries.length, 1);
  assert.equal(readWorkspaceDraftEntries(writes[0])[0].value, 'A/b', 'the newest value wins');
});

test('the local draft write is synchronous and only then offers a background save', () => {
  const start = draftStorageSource.indexOf('export const writeQuestionDraft');
  const block = draftStorageSource.slice(start, draftStorageSource.indexOf('export const questionDraftSavedAt'));
  assert.doesNotMatch(block, /await|async/);
  assert.match(block, /notifyDraftWritten\(key, value, savedAt\)/);
  assert.match(block, /window\.localStorage\.setItem/);
  // Subscribers cannot break the keystroke.
  assert.match(draftStorageSource, /try \{\s*\n\s*listener\(\{ key, value, savedAt \}\);\s*\n\s*\} catch/);
});

test('temporary network loss leaves the work locally durable and retries later', async () => {
  const scheduler = manualScheduler();
  let attempts = 0;
  const writes = [];
  const sync = createWorkspaceDraftSync({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    scheduler,
    flush: async ({ document }) => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      writes.push(document);
    },
  });
  sync.record({ key: draftKey(0, 'literal'), value: 'A/b', savedAt: 1 });
  scheduler.runAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 1);
  assert.equal(writes.length, 0, 'the first flush failed');
  // The failure re-armed the flush rather than dropping the work.
  assert.equal(scheduler.pending(), 1);
  scheduler.runAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.length, 1);
  assert.equal(readWorkspaceDraftEntries(writes[0])[0].value, 'A/b');
});

test('the submission path still captures durably first and reconciles in the background', () => {
  const start = appSource.indexOf('const handleGradeSubmit = async (');
  const block = appSource.slice(start, appSource.indexOf('const handleStepGrade', start));
  // The student's click waits on IndexedDB, never on Firestore.
  assert.match(block, /queuedAction = await enqueueDurableAction\(createDurableAction\(\{/);
  assert.match(block, /void \(async \(\) => \{[\s\S]*?await drainStudentOutbox\(\{ successStatus: 'submitted' \}\)/);
  const capture = block.indexOf('enqueueDurableAction');
  const uiUpdate = block.indexOf('setTracker(updatedTracker)');
  const network = block.indexOf('drainStudentOutbox');
  assert.ok(capture < uiUpdate && uiUpdate < network, 'capture, then UI, then network');
});

test('response checkpointing is debounced and hands off to the outbox, never awaited by a tool', () => {
  const start = engineSource.indexOf('DEADLINE RESPONSE CHECKPOINTING');
  const block = engineSource.slice(start, engineSource.indexOf('const isMultipart', start));
  assert.match(block, /window\.setTimeout\(\s*\n?\s*\(\) => flushResponseCheckpoint\('debounce'\),\s*\n?\s*CHECKPOINT_DEBOUNCE_MS/);
  assert.doesNotMatch(block, /await /);
  const handlerStart = appSource.indexOf('const handleResponseCheckpoint = useCallback');
  const handler = appSource.slice(handlerStart, appSource.indexOf('const handleGradeSubmit', handlerStart));
  assert.match(handler, /void drainStudentOutbox\(\)/);
  // A response that has not changed does not queue a write at all.
  assert.match(handler, /if \(checkpointFingerprintRef\.current\.get\(documentId\) === fingerprint\) return;/);
});

/* ==========================================================================
 * 15. SECURE AND PRIVATE STATE NEVER USES ORDINARY DRAFT PERSISTENCE.
 * ======================================================================== */

test('secure Test Cycle and private Path state never reach ordinary draft persistence', () => {
  assert.equal(isSyncableDraftKey('mathmaster:draft:v2::S1:A1:0:0:student:literal'), true);
  assert.equal(isSyncableDraftKey('mathmaster:draft:v2::S1:A1:0:0:preview:literal'), false);
  assert.equal(isSyncableDraftKey('mathmaster:draft:v2::S1:A1:0:0:student:test-cycle'), false);
  assert.equal(isSyncableDraftKey('mathmaster:draft:v2::S1:A1:0:0:student:secure-exam'), false);
  assert.equal(isSyncableDraftKey('mathmaster:draft:v2::S1:A1:0:0:student:path-session'), false);

  // A teacher preview is not a student's work and never syncs.
  const { sync, scheduler, writes } = trackingSync();
  assert.equal(sync.record({ key: draftKey(0, 'literal', { sessionMode: 'preview' }), value: 'x', savedAt: 1 }), false);
  scheduler.runAll();
  assert.equal(writes.length, 0);

  // Test Cycle assignments are excluded at the App level as well.
  const start = appSource.indexOf('SERVER-BACKED WORKING DRAFTS');
  const block = appSource.slice(start, appSource.indexOf('const assignmentOpenSpanRef', start));
  assert.match(block, /if \(!assignment \|\| isTestCycleAssignment\(assignment\)\) return undefined;/);
});

test('an answer key can never be stored in a workspace draft', () => {
  assert.equal(sanitizeWorkspaceDraftValue({ answer: '3' }).ok, true, 'a student typing "answer" is fine');
  assert.equal(sanitizeWorkspaceDraftValue({ acceptedAnswers: ['3'] }).ok, false);
  assert.equal(sanitizeWorkspaceDraftValue({ nested: { solution: [2, 5] } }).ok, false);
  assert.equal(sanitizeWorkspaceDraftValue({ isCorrect: true }).ok, false);
  assert.equal(sanitizeWorkspaceDraftValue({ seed: 42 }).ok, false);
  assert.equal(sanitizeWorkspaceDraftValue('x'.repeat(20_000)).ok, false, 'oversized values are dropped');

  const { sync, scheduler, writes } = trackingSync();
  assert.equal(sync.record({ key: draftKey(0, 'literal'), value: { acceptedAnswers: ['A/b'] }, savedAt: 1 }), false);
  sync.record({ key: draftKey(0, 'literal'), value: 'A/b', savedAt: 2 });
  scheduler.runAll();
  assert.equal(writes[0].entries.length, 1);
  assert.equal(readWorkspaceDraftEntries(writes[0])[0].value, 'A/b');
});

test('another student or another assignment can never be written through this sync', () => {
  const { sync } = trackingSync();
  const otherStudent = `${buildQuestionDraftKey({ studentId: 'S2000', assignmentId: ASSIGNMENT, questionIndex: 0, variantIndex: 0 })}:literal`;
  const otherAssignment = `${buildQuestionDraftKey({ studentId: STUDENT, assignmentId: 'A9', questionIndex: 0, variantIndex: 0 })}:literal`;
  assert.equal(sync.record({ key: otherStudent, value: 'x', savedAt: 1 }), false);
  assert.equal(sync.record({ key: otherAssignment, value: 'x', savedAt: 1 }), false);
});

test('the sync layer is injected with its writer, so nothing in it reaches Firestore directly', () => {
  assert.doesNotMatch(syncSource, /firebase\/firestore/);
  assert.doesNotMatch(syncSource, /from '\.\.\/\.\.\/firebase'/);
  assert.match(syncSource, /flush\(\{ document \}\)/);
});
