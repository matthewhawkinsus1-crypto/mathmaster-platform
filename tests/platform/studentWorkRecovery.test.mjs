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
  MAX_WORKSPACE_DRAFT_ENTRIES,
  buildWorkspaceDraftPatch,
  isSyncableDraftKey,
  mergeWorkspaceDraftDocument,
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
  const stored = mergeWorkspaceDraftDocument({
    existing: null,
    patch: buildWorkspaceDraftPatch({
      studentId: STUDENT,
      assignmentId: ASSIGNMENT,
      entries: [{ key: draftKey(0, 'literal'), value: 'A/b', savedAt: 5_000, questionIndex: 0 }],
    }),
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
  // Delivery now wraps the drain with pre/post device reports; it is still
  // launched only after local state advances and remains deliberately voided.
  assert.match(block, /void \(async \(\) => \{[\s\S]*?await reconcileAndReportStudentOutbox\(\{ successStatus: 'submitted' \}\)/);
  const capture = block.indexOf('enqueueDurableAction');
  const uiUpdate = block.indexOf('setTracker(updatedTracker)');
  const network = block.indexOf('reconcileAndReportStudentOutbox');
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

test('every new module App.jsx calls is actually imported there', () => {
  /*
   * The one failure the whole gate misses. App.jsx is .jsx, so no test imports
   * it, the build does not resolve free identifiers, and lint has no no-undef
   * here: wiring a module in without importing it is a runtime ReferenceError
   * that passes every check. See AGENTS.md.
   */
  const symbols = [
    'checkpointDocumentId', 'checkpointEligibility', 'enqueueResponseCheckpoint', 'responseFingerprint',
    'resolveAuthoritativeClose', 'createWorkspaceDraftSync', 'readWorkspaceDraft', 'writeWorkspaceDraft',
    'readLatestWorkspaceResume', 'selectRestorableDraftEntries', 'readWorkspaceDraftEntries',
    'subscribeToQuestionDrafts', 'questionDraftSavedAt', 'restoreQuestionDrafts',
  ];
  const importBlock = appSource.slice(0, appSource.indexOf('\nfunction App()'));
  const imports = importBlock.match(/import\s[\s\S]*?from\s+'[^']+';/g)?.join('\n') || '';
  for (const symbol of symbols) {
    assert.match(appSource, new RegExp(`[^\\w]${symbol}\\(`), `${symbol} is not called in App.jsx — update this list`);
    assert.match(imports, new RegExp(`\\b${symbol}\\b`), `App.jsx calls ${symbol} without importing it`);
  }
});

/* ==========================================================================
 * REVIEW FINDINGS. Each of these is a bug that was really there.
 * ======================================================================== */

test('a revision enqueued during an in-flight drain is not deleted by the drain', async () => {
  /*
   * A checkpoint's queue id is deterministic so a new revision replaces the
   * old one in place. An unconditional delete after reconciling therefore threw
   * away a revision written while the drain was running, leaving the SERVER
   * holding the stale response — the exact bug checkpoints exist to prevent.
   */
  const storage = createMemoryOutboxStorage();
  const identity = { studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 0 };
  const revisionOne = createDurableAction({
    kind: 'responseCheckpoint', actionId: 'response_checkpoint:fixed', ...identity,
    payload: { documentId: 'fixed', revision: 1, isComplete: true, response: { kind: 'scalar', value: '7' } },
  });
  await enqueueDurableAction(revisionOne, { storage });

  const reconciled = [];
  const result = await drainDurableActions({
    storage,
    studentId: STUDENT,
    reconcile: async (action) => {
      reconciled.push(action.payload.revision);
      // The student clears their answer while this reconcile is in flight.
      await enqueueDurableAction(createDurableAction({
        kind: 'responseCheckpoint', actionId: 'response_checkpoint:fixed', ...identity,
        payload: { documentId: 'fixed', revision: 2, isComplete: false, response: { kind: 'scalar', value: '' } },
      }), { storage });
      return { status: 'durable' };
    },
  });

  assert.deepEqual(reconciled, [1]);
  const remaining = await listDurableActions({ storage, studentId: STUDENT });
  assert.equal(remaining.length, 1, 'the newer revision survived the drain');
  assert.equal(remaining[0].payload.revision, 2);
  assert.equal(remaining[0].payload.isComplete, false);
  assert.equal(result.remaining, 1);
});

test('a reconciled action with no newer revision is still removed', async () => {
  const storage = createMemoryOutboxStorage();
  await enqueueDurableAction(createDurableAction({
    kind: 'ordinarySubmission', studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 1,
    payload: { previousTotalAttempts: 0, record: {} },
  }), { storage });
  const result = await drainDurableActions({ storage, studentId: STUDENT, reconcile: async () => ({ status: 'durable' }) });
  assert.equal(result.recovered, 1);
  assert.equal(result.remaining, 0);
});

test('the page-lifecycle listener is registered once, so cleanup means unmount', () => {
  /*
   * `onResponseCheckpoint` changes identity whenever the parent re-renders with
   * new grades. An effect that depended on it would be torn down and re-run on
   * ordinary state churn — and its cleanup flushes a checkpoint, turning "the
   * page is going away" into "something re-rendered".
   */
  const start = engineSource.indexOf('REGISTERED ONCE, SO THE CLEANUP MEANS UNMOUNT');
  assert.ok(start > 0, 'the page-lifecycle listener must document why it has no dependencies');
  const block = engineSource.slice(start, start + 1400);
  assert.match(block, /window\.addEventListener\('pagehide', flush\)/);
  assert.match(block, /flushCheckpointRef\.current\('page-lifecycle'\)/);
  // The subscription must not depend on the callback identity.
  assert.match(block, /\}, \[\]\);/);
  assert.doesNotMatch(block, /\}, \[onResponseCheckpoint/);
});

test('the deadline finalizer writes the projections an attempt updates, not just the record', async () => {
  /*
   * prerequisiteAccess opens the next assignment only when the prerequisite's
   * classworkGradesByAssignment score is 100. A finalizer that wrote only
   * gradesByAssignment would record a student's final classwork response and
   * still leave them locked out.
   */
  const { evaluateClassworkCompletionRule, classworkGradeProjection, mergeSupportUsage } =
    await import('../../functions/shared/assignmentProjections.mjs');
  const { prerequisiteAccess } = await import('../../src/assignmentLifecycle.js');

  const tracker = { 0: { status: 'correct' }, 1: { status: 'correct' } };
  const completion = evaluateClassworkCompletionRule({
    classworkIndices: [0, 1],
    assignmentTracker: tracker,
    totalTimeSeconds: 900,
    completionRule: {},
  });
  assert.equal(completion.met, true);
  assert.equal(completion.completionPercent, 100);

  const grade = classworkGradeProjection({ completion, existingGrade: null, recordedAt: '2026-09-14T15:10:00.000Z' });
  assert.equal(grade.score, 100);
  // The gate the student would otherwise have stayed behind.
  const gated = prerequisiteAccess({
    assignment: { prerequisiteAssignmentId: ASSIGNMENT },
    classworkGradesByAssignment: {},
  });
  assert.equal(gated.open, false);
  const opened = prerequisiteAccess({
    assignment: { prerequisiteAssignmentId: ASSIGNMENT },
    classworkGradesByAssignment: { [ASSIGNMENT]: grade },
  });
  assert.equal(opened.open, true);

  // Support usage accumulates rather than replacing.
  assert.deepEqual(
    mergeSupportUsage({ accommodations: ['calculator'] }, { accommodations: ['readAloud'], modified: true }),
    { modified: true, accommodations: ['calculator', 'readAloud'], modifications: [] },
  );
});

test('the finalization transaction persists every projection it derived', () => {
  const functionsSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const start = functionsSource.indexOf('async function finalizeOneResponseCheckpoint');
  const block = functionsSource.slice(start, functionsSource.indexOf('exports.finalizeStudentResponseCheckpoints'));
  assert.match(block, /new FieldPath\("gradesByAssignment", assignmentId, String\(checkpoint\.questionIndex\)\)/);
  assert.match(block, /new FieldPath\("supportUsageByAssignment", assignmentId\)/);
  assert.match(block, /new FieldPath\("classworkGradesByAssignment", assignmentId\)/);
  assert.match(block, /new FieldPath\("dolGradesByAssignment", assignmentId, finalization\.dolDateKey\)/);
  assert.match(block, /transaction\.update\(gradeRef, \.\.\.gradeUpdates\)/);
});

test('a deferred reconcile of revision 1 leaves revision 2 queued, and a second drain sends it', async () => {
  /*
   * The full race, driven deliberately:
   *   enqueue revision 1 → start the drain → while its reconcile is still
   *   pending, enqueue revision 2 under the SAME deterministic action id →
   *   resolve revision 1 → revision 2 must still be queued → drain again →
   *   revision 2 reconciles → nothing remains.
   */
  const storage = createMemoryOutboxStorage();
  const identity = { studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 0 };
  const checkpoint = (revision, value, isComplete) => createDurableAction({
    kind: 'responseCheckpoint',
    actionId: 'response_checkpoint:coalesced',
    ...identity,
    payload: { documentId: 'coalesced', revision, isComplete, response: { kind: 'scalar', value } },
  });

  await enqueueDurableAction(checkpoint(1, '7', true), { storage });

  let releaseFirstReconcile;
  const firstReconcileStarted = new Promise((resolve) => { releaseFirstReconcile = resolve; });
  let resolveFirst;
  const firstReconcileGate = new Promise((resolve) => { resolveFirst = resolve; });
  const reconciledRevisions = [];

  const firstDrain = drainDurableActions({
    storage,
    studentId: STUDENT,
    reconcile: async (action) => {
      reconciledRevisions.push(action.payload.revision);
      releaseFirstReconcile();
      await firstReconcileGate;
      return { status: 'durable' };
    },
  });

  await firstReconcileStarted;
  // The student clears their answer while revision 1 is still in flight.
  await enqueueDurableAction(checkpoint(2, '', false), { storage });
  resolveFirst();
  const firstResult = await firstDrain;

  assert.deepEqual(reconciledRevisions, [1]);
  assert.equal(firstResult.remaining, 1, 'revision 2 was not deleted by revision 1 finishing');
  const queued = await listDurableActions({ storage, studentId: STUDENT });
  assert.equal(queued[0].payload.revision, 2);
  assert.equal(queued[0].payload.isComplete, false);

  const secondResult = await drainDurableActions({
    storage,
    studentId: STUDENT,
    reconcile: async (action) => { reconciledRevisions.push(action.payload.revision); return { status: 'durable' }; },
  });
  assert.deepEqual(reconciledRevisions, [1, 2], 'the newest revision reconciled on the next drain');
  assert.equal(secondResult.remaining, 0);
  assert.equal((await listDurableActions({ storage, studentId: STUDENT })).length, 0);
});

test('the removal guard owns its transaction, so its handler cannot be clobbered', () => {
  /*
   * This guard exists because the first version of the fix routed through
   * `transactionRequest`, which assigns its OWN `onsuccess` to whatever request
   * it is handed. That silently replaced the read handler and the delete was
   * never issued — every row stayed queued forever. The in-memory adapter has
   * its own correct implementation, so no unit test could see it; only
   * tests/browser/durableOutboxRecovery.mjs, against real IndexedDB, caught it.
   */
  const source = readFileSync(new URL('../../src/platform/performance/durableActionOutbox.js', import.meta.url), 'utf8');
  const start = source.indexOf('const removeIfCurrentTransaction');
  assert.ok(start > 0, 'removeIfCurrent must own its own transaction');
  const block = source.slice(start, source.indexOf('export const indexedDbOutboxStorage'));
  // The read and the delete share one readwrite transaction.
  assert.match(block, /database\.transaction\(STORE_NAME, 'readwrite'\)/);
  assert.match(block, /const read = store\.get\(actionId\);/);
  assert.match(block, /store\.delete\(actionId\);/);
  // It resolves on transaction completion, not on the request's own success.
  assert.match(block, /transaction\.oncomplete = \(\) => resolve\(removed\)/);
  // And it must NOT go back through the shared helper that overwrites onsuccess.
  assert.doesNotMatch(block, /transactionRequest\(/);
  // The memory adapter mirrors the semantics so unit tests stay meaningful.
  assert.match(source, /async removeIfCurrent\(actionId, expectedCreatedOrder\) \{/);
});

test('transactionRequest assigns its own onsuccess, which is why removeIfCurrent avoids it', () => {
  // Pins the reason the guard above exists: if this helper ever stopped
  // overwriting the handler, the constraint could be relaxed deliberately
  // rather than by accident.
  const source = readFileSync(new URL('../../src/platform/performance/durableActionOutbox.js', import.meta.url), 'utf8');
  const start = source.indexOf('const transactionRequest');
  const block = source.slice(start, source.indexOf('const removeIfCurrentTransaction'));
  assert.match(block, /request\.onsuccess = \(\) => \{ result = request\.result; \};/);
});

test('a unique-id submission is still removed normally', async () => {
  // The guard must not change behaviour for actions that never coalesce.
  const storage = createMemoryOutboxStorage();
  for (const questionIndex of [0, 1, 2]) {
    await enqueueDurableAction(createDurableAction({
      kind: 'ordinarySubmission', studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex,
      payload: { previousTotalAttempts: 0, record: {} },
    }), { storage });
  }
  const result = await drainDurableActions({ storage, studentId: STUDENT, reconcile: async () => ({ status: 'durable' }) });
  assert.equal(result.recovered, 3);
  assert.equal(result.remaining, 0);
});

/* ==========================================================================
 * A BACKGROUND SAVE MERGES. IT NEVER REPLACES THE DOCUMENT.
 *
 * The bug these cover: the sync sent a whole document built only from THIS
 * session's pending edits, and the store wrote it with setDoc. A device that
 * restored ten questions and then edited one erased the other nine — for every
 * device.
 * ======================================================================== */

/** Run a patch through the same merge the Firestore transaction runs. */
const applyPatch = (existing, patch) => mergeWorkspaceDraftDocument({ existing, patch });

const entryFor = (questionIndex, value, savedAt) => ({
  key: draftKey(questionIndex, 'literal'),
  value,
  savedAt,
  questionIndex,
});

const serverWith = (entries, extra = {}) => applyPatch(null, buildWorkspaceDraftPatch({
  studentId: STUDENT, assignmentId: ASSIGNMENT, entries, ...extra,
}));

const valueOf = (document, questionIndex) => readWorkspaceDraftEntries(document)
  .find((entry) => entry.questionIndex === questionIndex)?.value;

test('a fresh device that edits one new question keeps the three it restored', () => {
  const server = serverWith([entryFor(1, 'one', 10), entryFor(2, 'two', 11), entryFor(3, 'three', 12)]);
  assert.equal(server.entries.length, 3);
  // Fresh Chromebook: it restored Q1-Q3, then the student works on Q4 only.
  const { sync, scheduler, writes } = trackingSync();
  sync.record({ key: draftKey(4, 'literal'), value: 'four', savedAt: 20 });
  scheduler.runAll();
  const merged = applyPatch(server, writes[0]);
  assert.deepEqual(readWorkspaceDraftEntries(merged).map((entry) => entry.questionIndex).sort(), [1, 2, 3, 4]);
  assert.equal(valueOf(merged, 1), 'one');
  assert.equal(valueOf(merged, 4), 'four');
});

test('editing one of ten questions leaves the other nine', () => {
  const server = serverWith(Array.from({ length: 10 }, (_, index) => entryFor(index, `q${index}`, 100 + index)));
  const { sync, scheduler, writes } = trackingSync();
  sync.record({ key: draftKey(5, 'literal'), value: 'edited', savedAt: 500 });
  scheduler.runAll();
  assert.equal(writes[0].entries.length, 1, 'only the changed entry is sent');
  const merged = applyPatch(server, writes[0]);
  assert.equal(readWorkspaceDraftEntries(merged).length, 10);
  assert.equal(valueOf(merged, 5), 'edited');
  assert.equal(valueOf(merged, 9), 'q9');
});

test('updating the resume position alone does not erase draft entries', () => {
  const server = serverWith([entryFor(0, 'kept', 10), entryFor(1, 'also kept', 11)]);
  const { sync, scheduler, writes } = trackingSync();
  sync.setResume({ questionIndex: 7, activityRole: 'classwork', variantIndex: 0, updatedAt: 900 });
  scheduler.runAll();
  assert.equal(writes[0].entries.length, 0, 'a resume update sends no draft entries');
  const merged = applyPatch(server, writes[0]);
  assert.equal(readWorkspaceDraftEntries(merged).length, 2);
  assert.equal(merged.resume.questionIndex, 7);
});

test('updating Practice Mode alone does not erase ordinary draft entries', () => {
  const server = serverWith([entryFor(0, 'kept', 10)]);
  const { sync, scheduler, writes } = trackingSync();
  sync.setPractice({ 0: { status: 'correct' } });
  scheduler.runAll();
  const merged = applyPatch(server, writes[0]);
  assert.equal(valueOf(merged, 0), 'kept');
  assert.equal(merged.practice[0].status, 'correct');
});

test('editing an ordinary question does not erase Practice Mode', () => {
  const withPractice = applyPatch(null, buildWorkspaceDraftPatch({
    studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [],
    practice: { 3: { status: 'attempted', attemptCount: 2 } }, hasPractice: true, practiceUpdatedAt: 50,
  }));
  assert.equal(withPractice.practice[3].attemptCount, 2);
  const { sync, scheduler, writes } = trackingSync();
  sync.record({ key: draftKey(0, 'literal'), value: 'ordinary work', savedAt: 60 });
  scheduler.runAll();
  const merged = applyPatch(withPractice, writes[0]);
  assert.equal(merged.practice[3].attemptCount, 2, 'Practice Mode survived a draft write');
  assert.equal(valueOf(merged, 0), 'ordinary work');
});

test('editing an ordinary question does not erase the resume position', () => {
  const withResume = applyPatch(null, buildWorkspaceDraftPatch({
    studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [],
    resume: { questionIndex: 6, activityRole: 'practice', variantIndex: 1, updatedAt: 40 }, hasResume: true,
  }));
  const { sync, scheduler, writes } = trackingSync();
  sync.record({ key: draftKey(0, 'literal'), value: 'ordinary work', savedAt: 60 });
  scheduler.runAll();
  assert.equal(writes[0].hasResume, false, 'an entries-only patch must not claim to carry a resume');
  const merged = applyPatch(withResume, writes[0]);
  assert.equal(merged.resume.questionIndex, 6, 'the resume position survived a draft write');
  assert.equal(valueOf(merged, 0), 'ordinary work');
});

test('two devices editing different questions both survive', () => {
  let server = serverWith([]);
  const deviceA = trackingSync();
  const deviceB = trackingSync();
  deviceA.sync.record({ key: draftKey(1, 'literal'), value: 'from A', savedAt: 100 });
  deviceB.sync.record({ key: draftKey(2, 'literal'), value: 'from B', savedAt: 101 });
  deviceA.scheduler.runAll();
  deviceB.scheduler.runAll();
  // Serialized by the transaction, in either order.
  server = applyPatch(server, deviceA.writes[0]);
  server = applyPatch(server, deviceB.writes[0]);
  assert.equal(valueOf(server, 1), 'from A');
  assert.equal(valueOf(server, 2), 'from B');

  const reversed = applyPatch(applyPatch(serverWith([]), deviceB.writes[0]), deviceA.writes[0]);
  assert.equal(valueOf(reversed, 1), 'from A');
  assert.equal(valueOf(reversed, 2), 'from B');
});

test('for the same key the newer save wins, and a stale device cannot wipe it', () => {
  // A per-device revision would be meaningless here: device A's revision 15
  // and device B's revision 2 say nothing about which is newer. The entry's own
  // savedAt does.
  let server = serverWith([entryFor(1, 'newer work', 5_000)]);
  const stale = buildWorkspaceDraftPatch({
    studentId: STUDENT, assignmentId: ASSIGNMENT,
    entries: [entryFor(1, 'stale work', 1_000)],
  });
  server = applyPatch(server, stale);
  assert.equal(valueOf(server, 1), 'newer work', 'the stale device did not overwrite newer work');

  const newer = buildWorkspaceDraftPatch({
    studentId: STUDENT, assignmentId: ASSIGNMENT,
    entries: [entryFor(1, 'newest work', 9_000)],
  });
  assert.equal(valueOf(applyPatch(server, newer), 1), 'newest work');
});

test('a stale resume or Practice update cannot roll back a newer one', () => {
  let server = applyPatch(null, buildWorkspaceDraftPatch({
    studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [],
    resume: { questionIndex: 9, activityRole: 'dol', variantIndex: 0, updatedAt: 5_000 }, hasResume: true,
    practice: { 1: { status: 'correct' } }, hasPractice: true, practiceUpdatedAt: 5_000,
  }));
  server = applyPatch(server, buildWorkspaceDraftPatch({
    studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [],
    resume: { questionIndex: 2, activityRole: 'warmup', variantIndex: 0, updatedAt: 1_000 }, hasResume: true,
    practice: { 1: { status: 'attempted' } }, hasPractice: true, practiceUpdatedAt: 1_000,
  }));
  assert.equal(server.resume.questionIndex, 9);
  assert.equal(server.practice[1].status, 'correct');
});

test('a failed write and its retry cannot revert a newer unrelated entry', async () => {
  const scheduler = manualScheduler();
  let attempts = 0;
  let server = serverWith([entryFor(1, 'device A work', 100)]);
  const sync = createWorkspaceDraftSync({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    scheduler,
    flush: async ({ document }) => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      server = applyPatch(server, document);
    },
  });
  sync.record({ key: draftKey(2, 'literal'), value: 'device B work', savedAt: 200 });
  scheduler.runAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 1);

  // Another device lands newer work for question 1 while this one is retrying.
  server = applyPatch(server, buildWorkspaceDraftPatch({
    studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [entryFor(1, 'device A newer', 300)],
  }));

  scheduler.runAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(valueOf(server, 1), 'device A newer', 'the retry did not revert the newer unrelated entry');
  assert.equal(valueOf(server, 2), 'device B work');
});

test('an edit made while a flush is in flight is not dropped when that flush succeeds', async () => {
  const scheduler = manualScheduler();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let server = serverWith([]);
  const sync = createWorkspaceDraftSync({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    scheduler,
    flush: async ({ document }) => { await gate; server = applyPatch(server, document); },
  });
  sync.record({ key: draftKey(0, 'literal'), value: 'first', savedAt: 10 });
  scheduler.runAll();
  // The student keeps typing while the write is in flight.
  sync.record({ key: draftKey(0, 'literal'), value: 'second', savedAt: 20 });
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(valueOf(server, 0), 'first');
  // The newer value is still pending and goes out on the next flush.
  assert.deepEqual(sync.pendingKeys(), [draftKey(0, 'literal')]);
  scheduler.runAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(valueOf(server, 0), 'second');
});

test('the store merges inside a transaction rather than replacing the document', () => {
  const storeSource = readFileSync(new URL('../../src/platform/persistence/workspaceDraftStore.js', import.meta.url), 'utf8');
  assert.match(storeSource, /runTransaction\(db, async \(transaction\) => \{/);
  assert.match(storeSource, /const snapshot = await transaction\.get\(reference\)/);
  assert.match(storeSource, /mergeWorkspaceDraftDocument\(\{/);
  // A bare setDoc of the caller's document is what caused the data loss.
  assert.doesNotMatch(storeSource, /await setDoc\(/);
});

test('the merge is bounded, keeping the newest work when the caps are reached', () => {
  const many = Array.from({ length: MAX_WORKSPACE_DRAFT_ENTRIES + 20 }, (_, index) => entryFor(index, `q${index}`, index + 1));
  const merged = serverWith(many);
  assert.equal(merged.entries.length, MAX_WORKSPACE_DRAFT_ENTRIES);
  const savedAts = merged.entries.map((entry) => entry.savedAt);
  assert.equal(Math.min(...savedAts) > 20, true, 'the oldest drafts are the ones dropped');
});
