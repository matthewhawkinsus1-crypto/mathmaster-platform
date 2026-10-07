/*
 * WHEN THE SERVER FINALIZED A QUESTION, THE BROWSER MUST AGREE WITH IT.
 *
 * Two disagreements between a deadline-finalized record and the browser,
 * found while tracing lmr-wu-1 (warmupReopenServerLifecycle.test.mjs):
 *
 *   1. THE SUBMITTED WORK LOOKED STALE. The finalizer records an auto-submit
 *      at the close; the student's own saved board — the work it submitted —
 *      was last edited before that, so it read as older than its own
 *      submission. The next mount deleted it and the server backup was
 *      refused: after the reopen, the board was empty on every device.
 *      canonicalResponseSavedAt dates a deadline attempt by its checkpoint's
 *      capture instead.
 *
 *   2. THE OPEN SESSION NEVER HEARD. The student's grades come from the server
 *      once, at sign-in. An open session kept showing an attempt the server no
 *      longer had (a Check after the reopen that ingestion refuses), and its
 *      next checkpoint carried a stale attempt count, so a second close
 *      skipped the student's newer work. adoptCanonicalAdvances takes in a
 *      server record that is AHEAD of the session's — never one behind it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CHECKPOINT_CAPTURE_WINDOW_MS,
  canonicalResponseSavedAt,
  deadlineSubmissionRevision,
} from '../../src/platform/persistence/canonicalResponseTime.js';
import { adoptCanonicalAdvances, canonicalRecordIsAhead } from '../../src/platform/persistence/canonicalTrackerReconciliation.js';
import { TOOL_DRAFT_SUPERSEDE_MARGIN_MS, toolDraftIsSuperseded, toolDraftKey } from '../../src/tools/shared/usePersistentToolState.js';
import { buildQuestionDraftKey, questionDraftSavedAt, writeQuestionDraft } from '../../src/questionDraftStorage.js';
import { checkpointSubmissionId } from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { checkpointDocumentId } from '../../functions/shared/responseCheckpointSchema.mjs';
import { selectRestorableDraftEntries } from '../../functions/shared/workspaceDraftSchema.mjs';
import { CHECKPOINT_DEBOUNCE_MS } from '../../src/platform/performance/responseCheckpoint.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const CLOSE = Date.parse('2026-10-05T08:10:00.000Z');
const CAPTURE = CLOSE - 4 * 60_000;
const documentId = checkpointDocumentId({
  studentId: 'student-a',
  assignmentId: 'lmr-prod',
  questionIndex: 0,
  questionId: 'lmr-wu-1',
  variantIndex: 0,
  generationKey: 'lmr-prod|student-a|0|variant:0',
});
const deadlineRecord = (revision = CAPTURE, overrides = {}) => ({
  status: 'expired',
  totalAttempts: 3,
  attemptCount: 3,
  variantIndex: 0,
  lastAttemptAt: new Date(CLOSE).toISOString(),
  submissionOrigin: 'deadline-auto-submit',
  lastSubmissionId: checkpointSubmissionId({ documentId, revision }),
  ...overrides,
});

/* ----------------------------------------------- 1. the submitted work */

test('a deadline attempt is dated by its checkpoint\'s capture — read from the finalizer\'s own attempt id', () => {
  // The id the real finalizer writes, read back exactly.
  assert.equal(deadlineSubmissionRevision(checkpointSubmissionId({ documentId, revision: CAPTURE })), CAPTURE);
  assert.match(documentId, /%7C|%3A/, 'the checkpoint id itself is encoded, so its last ":" is the revision\'s');
  assert.equal(canonicalResponseSavedAt(deadlineRecord()), CAPTURE - CHECKPOINT_CAPTURE_WINDOW_MS);
  assert.ok(CHECKPOINT_CAPTURE_WINDOW_MS > CHECKPOINT_DEBOUNCE_MS, 'the window covers the checkpoint debounce');

  // Everything else keeps the attempt's own time.
  const submitted = { lastAttemptAt: new Date(CAPTURE).toISOString(), submissionOrigin: 'server-ingestion', lastSubmissionId: 'student_action_1' };
  assert.equal(canonicalResponseSavedAt(submitted), CAPTURE);
  assert.equal(canonicalResponseSavedAt({}), 0, 'never answered');
  assert.equal(canonicalResponseSavedAt(null), 0);
  // A revision that claims to postdate the close it was submitted at, or none.
  assert.equal(canonicalResponseSavedAt(deadlineRecord(CLOSE + 60_000)), CLOSE);
  assert.equal(canonicalResponseSavedAt(deadlineRecord(0)), CLOSE);
  assert.equal(canonicalResponseSavedAt(deadlineRecord(CAPTURE, { lastSubmissionId: 'deadline:broken' })), CLOSE);
  assert.equal(deadlineSubmissionRevision('student_action_9:123'), 0, 'only a deadline id names a revision');
});

const memoryStorage = () => {
  const values = new Map();
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
};
const onDevice = (run) => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: memoryStorage(), addEventListener() {} };
  try { return run(); } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};
const at = (ms, run) => {
  const realNow = Date.now;
  Date.now = () => ms;
  try { return run(); } finally { Date.now = realNow; }
};

test('the board the deadline submitted is restored on the device that made it; older work still yields', () => onDevice(() => {
  const draftKey = buildQuestionDraftKey({ studentId: 'student-a', assignmentId: 'lmr-prod', questionIndex: 0, variantIndex: 0 });
  const key = toolDraftKey(draftKey);
  const record = deadlineRecord();

  // The last placement, then the checkpoint a debounce later: the submitted work.
  at(CAPTURE - CHECKPOINT_DEBOUNCE_MS - 300, () => writeQuestionDraft(key, { linearAssignments: { 'line-a:graph': 0 } }, { edit: true }));
  assert.equal(toolDraftIsSuperseded(key, canonicalResponseSavedAt(record)), false, 'kept: it is the submitted sort');
  assert.equal(toolDraftIsSuperseded(key, Date.parse(record.lastAttemptAt)), true, 'which the close time used to retire');

  // Work from well before the captured revision is older than the submission.
  at(CAPTURE - CHECKPOINT_CAPTURE_WINDOW_MS - TOOL_DRAFT_SUPERSEDE_MARGIN_MS - 60_000, () => writeQuestionDraft(key, { linearAssignments: {} }, { edit: true }));
  assert.equal(toolDraftIsSuperseded(key, canonicalResponseSavedAt(record)), true, 'an older draft still yields to the submitted answer');

  // Newer work after the reopen is newer.
  at(CLOSE + 86_400_000, () => writeQuestionDraft(key, { linearAssignments: { 'line-b:graph': 1 } }, { edit: true }));
  assert.equal(toolDraftIsSuperseded(key, canonicalResponseSavedAt(record)), false);
  assert.ok(questionDraftSavedAt(key) > CLOSE);
}));

test('another Chromebook restores the server\'s backup of the submitted board, and still refuses an older one', () => {
  const record = deadlineRecord();
  const entry = (savedAt) => ({ key: 'k', questionIndex: 0, savedAt, savedAtIsEdit: true, value: {} });
  const select = (savedAt) => selectRestorableDraftEntries({
    entries: [entry(savedAt)],
    localSavedAt: () => 0,
    canonicalSavedAt: () => canonicalResponseSavedAt(record),
  });
  assert.equal(select(CAPTURE - CHECKPOINT_DEBOUNCE_MS - 300).length, 1, 'the submitted work comes back');
  assert.equal(select(CAPTURE - CHECKPOINT_CAPTURE_WINDOW_MS - 1).length, 0, 'work older than the capture does not');
  // Before: compared with the close, the submitted work never came back.
  assert.equal(selectRestorableDraftEntries({ entries: [entry(CAPTURE - CHECKPOINT_DEBOUNCE_MS - 300)], canonicalSavedAt: () => CLOSE }).length, 0);
});

/* ------------------------------------------- 2. the open session hears */

const attempted = (totalAttempts, extra = {}) => ({ status: 'attempted', attemptCount: totalAttempts, totalAttempts, variantIndex: 0, ...extra });

test('a server record AHEAD of the session is adopted; one level with it or behind it never is', () => {
  const session = { lmr: { 0: attempted(2), 1: attempted(1) }, other: { 0: attempted(1) } };
  const frozen = JSON.parse(JSON.stringify(session));

  // The deadline auto-submitted Q1's third attempt; Q2 is level; `other` is behind.
  const server = { lmr: { 0: { ...attempted(3), status: 'expired', submissionOrigin: 'deadline-auto-submit' }, 1: attempted(1) }, other: { 0: {} } };
  const { grades, adopted } = adoptCanonicalAdvances(session, server);
  assert.deepEqual(adopted, [{ assignmentId: 'lmr', questionIndex: 0, totalAttempts: 3, variantIndex: 0 }]);
  assert.equal(grades.lmr[0].status, 'expired');
  assert.equal(grades.lmr[1], session.lmr[1], 'a level record is the session\'s own, untouched');
  assert.equal(grades.other, session.other, 'a session ahead of the server is never rolled back');
  assert.deepEqual(session, frozen, 'the session object itself is not mutated');

  // Nothing ahead: the same object back, so React does not re-render.
  const unchanged = adoptCanonicalAdvances(grades, server);
  assert.equal(unchanged.grades, grades);
  assert.deepEqual(unchanged.adopted, []);
});

test('ahead means more attempts on the same variant, or a later variant', () => {
  assert.equal(canonicalRecordIsAhead(attempted(1), attempted(2)), true);
  assert.equal(canonicalRecordIsAhead(attempted(2), attempted(2)), false);
  assert.equal(canonicalRecordIsAhead(attempted(3), attempted(2)), false, 'a queued local attempt is not rolled back');
  assert.equal(canonicalRecordIsAhead(attempted(3), { ...attempted(0), variantIndex: 1 }), true, 'replaced on another device');
  assert.equal(canonicalRecordIsAhead({ ...attempted(0), variantIndex: 1 }, attempted(3)), false);
  assert.equal(canonicalRecordIsAhead(undefined, attempted(1)), true, 'a question the session has no record of');
  assert.equal(canonicalRecordIsAhead(attempted(1), null), false);
  assert.equal(canonicalRecordIsAhead(undefined, { totalAttempts: 1 }), true, 'a minimal record with an attempt');
  // A legacy status-only string has no attempt count to be ahead with; sign-in
  // already loaded whatever it says.
  assert.equal(canonicalRecordIsAhead(undefined, 'attempted'), false);
});

/* ------------------------------------------------------------ the wiring */

const app = read('src/App.jsx');
const appCode = executableSource(app);
const engineCode = executableSource(read('src/QuestionEngine.jsx'));

test('App.jsx imports what it calls (a call with no import passes every other check)', () => {
  assert.match(appCode, /import \{ canonicalResponseSavedAt \} from '\.\/platform\/persistence\/canonicalResponseTime\.js';/);
  assert.match(appCode, /import \{ adoptCanonicalAdvances \} from '\.\/platform\/persistence\/canonicalTrackerReconciliation\.js';/);
});

test('the student\'s live grade listener adopts the server\'s records ahead of the session', () => {
  const listener = region(appCode, "doc(db, 'grades', user.id),\n      (snapshot) => {", 'classroomSyncStatusByAssignment || {};', 'the student grade listener');
  assert.match(listener, /const serverGrades = snapshot\.data\(\)\?\.gradesByAssignment \|\| \{\};/);
  assert.match(listener, /setTracker\(\(current\) => \{[\s\S]*adoptCanonicalAdvances\(current, serverGrades\)[\s\S]*return grades;/);
  // Server attempts are not counted as this session's (rapid-correctness baseline).
  assert.match(listener, /liveSessionAttemptBaselineRef\.current/);
});

test('both draft readers date the recorded answer the same way', () => {
  const restore = region(appCode, 'const restorable = selectRestorableDraftEntries({', '});', 'the server draft restore');
  assert.match(restore, /canonicalSavedAt: \(entry\) => canonicalResponseSavedAt\(normalizeQuestionRecord\(assignmentGrades\[entry\?\.questionIndex\]\)\)/);
  assert.doesNotMatch(restore, /lastAttemptAt/);
  assert.match(engineCode, /const canonicalAnswerSavedAt = canonicalResponseSavedAt\(record\);/);
  assert.match(engineCode, /<ToolDraftScopeProvider draftKey=\{draftKey\} canonicalSavedAt=\{canonicalAnswerSavedAt\}>/);
  assert.match(engineCode, /canonicalSavedAt=\{canonicalAnswerSavedAt\}\n\s*showPrompt=\{false\}/, 'composed questions (WorkflowRunner) too');
  assert.match(engineCode, /import \{ canonicalResponseSavedAt \} from '\.\/platform\/persistence\/canonicalResponseTime\.js';/);
});
