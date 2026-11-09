/*
 * P-8: AN ANSWER BOX NAMED `solution` REACHES ANOTHER DEVICE.
 *
 * The draft guard (FORBIDDEN_DRAFT_KEYS, workspaceDraftSchema.mjs) refused a
 * whole multi-answer draft when a box was named `solution`. A multi-answer
 * draft is keyed by field id, and six families (linear.twoStepEquation,
 * linear.multiStepEquation, systems.elimination, systems.substitution,
 * systems.knownValue, inequalities.contextModel) and five hand-written
 * questions (Algebra I M3 T2 L2 CW 13, PR 10 and Honors CW 13; Algebra II
 * Solving Radical Equations CW 9 and Honors CW 3) name a box `solution`. The
 * student walkthrough of 2026-11-06 met it typing in A1 M3 T1 L3 DOL 2: the
 * student saw nothing, and a Chromebook swapped mid-question lost the work.
 *
 * At the levels a draft is keyed by answer ids, an id is no longer read as a
 * key; what the guard refuses everywhere else, and inside every answer, it
 * still refuses. The stored shape does not change, so every build reads and
 * stores what every other build writes.
 */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FORBIDDEN_DRAFT_KEYS,
  buildWorkspaceDraftPatch,
  explainWorkspaceDraftRejection,
  mergeWorkspaceDraftDocument,
  mergeWorkspaceDraftDocumentReport,
  readWorkspaceDraftEntries,
  sanitizeWorkspaceDraftValue,
  selectRestorableDraftEntries,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { auditDraftWrite, clearDraftSyncRejections } from '../../src/platform/persistence/draftSyncDiagnostics.js';
import { createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';
import {
  buildQuestionDraftKey,
  readQuestionDraft,
  reconcileFieldRecordDrafts,
  restoreQuestionDrafts,
  subscribeToQuestionDrafts,
  writeQuestionDraft,
} from '../../src/questionDraftStorage.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

const STUDENT = 's-p8';
const ASSIGNMENT = 'a1-m3-t1-l3';
const draftKey = (questionIndex) => buildQuestionDraftKey({ studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex, variantIndex: 0, sessionMode: 'graded' });
// L3 DOL 2 as `inequalities.contextModel` deals it: a model choice and the inequality box.
const DOL2 = `${draftKey(40)}:multi-answer`;
const ANSWERS = Object.freeze({ model: '120 + 15w ≤ 450', solution: 'w ≤ 22' });
const MULTI = `${draftKey(2)}:multi-answer`;
const STEPS = `${draftKey(3)}:workflow-responses`;
const ALGEBRA = `${draftKey(4)}:step-algebra`;
const TOOL = `${draftKey(5)}:work:tool`;
const LITERAL = `${draftKey(6)}:literal`;

// The top-level names firestore.rules refuses on a draft document (workspaceDraftCarriesNoGrade).
const RULES_REFUSE = (() => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const list = rules.match(/function workspaceDraftCarriesNoGrade\(data\) \{\s*return !data\.keys\(\)\.hasAny\(\[([^\]]*)\]\)/)?.[1];
  assert.ok(list, 'the rules still check a draft document\'s own fields');
  return [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
})();

const previousWindow = globalThis.window;
afterEach(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});
const onDevice = (storage) => { globalThis.window = { localStorage: storage }; };

/** functions' Firestore transaction in workspaceDraftStore.js writeWorkspaceDraft: merge into what is stored. */
const serverStore = () => {
  const store = { document: null };
  store.flush = ({ document: patch }) => {
    const report = mergeWorkspaceDraftDocumentReport({ existing: store.document, patch });
    store.document = report.document;
    return Promise.resolve({ written: true, droppedKeys: report.droppedKeys });
  };
  return store;
};

/** App.jsx's server-copy read on a device: restore what is newer, settle field records answer by answer. */
const openOn = (storage, document) => {
  onDevice(storage);
  const entries = readWorkspaceDraftEntries(document);
  const restorable = selectRestorableDraftEntries({ entries, localSavedAt: () => 0, canonicalSavedAt: () => 0 });
  const fieldRecords = reconcileFieldRecordDrafts(entries, { studentId: STUDENT, assignmentId: ASSIGNMENT, canonicalSavedAt: () => 0 });
  restoreQuestionDrafts(restorable.filter((entry) => !fieldRecords.keys.has(entry.key)));
};

test('a box named solution survives a draft round trip to another Chromebook', async () => {
  const server = serverStore();
  const sync = createWorkspaceDraftSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, flush: server.flush, scheduler: { set: () => 1, clear: () => {} } });
  const stop = subscribeToQuestionDrafts((event) => sync.record(event));
  try {
    // Chromebook A: the student types (MultiAnswerGrader's undo history writes the draft).
    onDevice(new MemoryStorage());
    writeQuestionDraft(DOL2, { ...ANSWERS }, { edit: true });
    assert.deepEqual(sync.pendingKeys(), [DOL2], 'the draft is queued for the server, not refused');
    assert.deepEqual(sync.stats().rejected, {});
    await sync.flushNow();
  } finally {
    stop();
  }
  const stored = readWorkspaceDraftEntries(server.document).find((entry) => entry.key === DOL2);
  assert.ok(stored, 'the server holds it');
  assert.deepEqual(stored.value, ANSWERS);

  // Chromebook B, which never saw this work, opens the question.
  const chromebookB = new MemoryStorage();
  openOn(chromebookB, server.document);
  assert.deepEqual(readQuestionDraft(DOL2), ANSWERS, 'both boxes are back on the other Chromebook');
});

test('two Chromebooks editing different boxes keep both, solution included', () => {
  const save = (existing, entries) => mergeWorkspaceDraftDocument({
    existing,
    patch: buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries }),
  });
  const first = save(null, [{ key: DOL2, value: { model: '120 + 15w ≤ 450', solution: '' }, savedAt: 1000, savedAtIsEdit: true, fieldEditedAt: { model: 1000 } }]);
  const both = save(first, [{ key: DOL2, value: { model: '', solution: 'w ≤ 22' }, savedAt: 2000, savedAtIsEdit: true, fieldEditedAt: { solution: 2000 }, fieldsFresh: true }]);
  assert.deepEqual(readWorkspaceDraftEntries(both).find((entry) => entry.key === DOL2).value, ANSWERS, 'merged answer by answer');
});

test('a field id is never read as a forbidden key, in every draft keyed by answer ids', () => {
  for (const name of FORBIDDEN_DRAFT_KEYS) {
    assert.equal(sanitizeWorkspaceDraftValue({ [name]: 'x > 2', other: '4' }, { key: MULTI }).ok, true, `a multi-answer box named ${name}`);
    assert.equal(sanitizeWorkspaceDraftValue({ [name]: { response: 'x > 2' } }, { key: STEPS }).ok, true, `a composed step named ${name}`);
    assert.equal(sanitizeWorkspaceDraftValue({ equation: { left: 'x', right: '3' }, promptAnswers: { [name]: '2x + 1' } }, { key: ALGEBRA }).ok, true, `a Step Algebra prompt named ${name}`);
  }
  // A cleared box, and a composed question's multi-answer stage.
  assert.equal(sanitizeWorkspaceDraftValue({ solution: null }, { key: MULTI }).ok, true);
  assert.equal(sanitizeWorkspaceDraftValue(ANSWERS, { key: `${draftKey(7)}:stage-a:multi-answer` }).ok, true);
});

test('what the guard refuses is still refused', () => {
  const refused = (value, key, why) => assert.equal(sanitizeWorkspaceDraftValue(value, { key }).ok, false, why);
  // Not keyed by answer ids: every key is read, as before (and with no key at all).
  refused({ solution: 'x = 3' }, TOOL, 'a tool workspace');
  refused({ solution: 'x = 3' }, LITERAL, 'a single-answer draft');
  refused({ solution: 'x = 3' }, undefined, 'no key');
  refused({ acceptedAnswers: ['3'] }, `${MULTI}:undo:owner`, 'an undo history is not an answer record');
  // Inside an answer, every key is read.
  refused({ s1: { isCorrect: true } }, MULTI, 'a verdict inside a box');
  refused({ solution: { response: 'x', isCorrect: false } }, STEPS, 'a verdict inside a step');
  refused({ promptAnswers: { solution: { score: 1 } } }, ALGEBRA, 'a score inside a prompt answer');
  refused({ s1: 'x', nested: [{ grading: {} }] }, MULTI, 'a grading contract under an id');
  // A listed name at an id level that holds no answer: a verdict, a score, a key list, a worked solution.
  refused({ isCorrect: true }, MULTI, 'a verdict beside the boxes');
  refused({ score: 0.8 }, MULTI, 'a score beside the boxes');
  refused({ acceptedAnswers: ['w ≤ 22'] }, MULTI, 'a key list beside the boxes');
  refused({ solution: { steps: ['w ≤ 22'] } }, MULTI, 'a worked solution beside the boxes');
  refused({ solution: true }, STEPS, 'a verdict beside the steps');
  refused({ promptAnswers: { solution: ['2x + 1'] } }, ALGEBRA, 'a key list among the prompt answers');
  // Step Algebra's own fields are not ids: only its prompt answers are.
  refused({ equation: { left: 'x', right: '3' }, solution: 'x = 3' }, ALGEBRA, 'a solution beside the equation');
  refused({ workSteps: [{ isCorrect: true }] }, ALGEBRA, 'a verdict in the steps');
});

test('a refusal still names its path, and agrees with the guard', () => {
  const explained = explainWorkspaceDraftRejection({ solution: 'w ≤ 22', model: { score: 1 } }, { key: MULTI });
  assert.equal(explained.ok, false);
  assert.equal(explained.path, 'model.score', 'the id is passed over; the score inside an answer is named');
  assert.equal(explainWorkspaceDraftRejection({ promptAnswers: { a: 'x', solution: [1] } }, { key: ALGEBRA }).path, 'promptAnswers.solution');
  assert.equal(explainWorkspaceDraftRejection({ steps: [{ ok: 1 }, { accepted: true }] }).path, 'steps[1].accepted');
  assert.equal(explainWorkspaceDraftRejection(ANSWERS, { key: MULTI }).ok, true);
  // The development build's write audit judges with the key too: no false alarm.
  clearDraftSyncRejections();
  assert.equal(auditDraftWrite(DOL2, ANSWERS), null);
  assert.equal(auditDraftWrite(TOOL, { solution: 'w ≤ 22' })?.path, 'solution');
  for (const [value, key] of [[ANSWERS, MULTI], [ANSWERS, TOOL], [{ isCorrect: true }, MULTI], [{ promptAnswers: { seed: '1' } }, ALGEBRA]]) {
    assert.equal(explainWorkspaceDraftRejection(value, { key }).ok, sanitizeWorkspaceDraftValue(value, { key }).ok);
  }
});

test('the server takes the drafts today\'s builds send and the new ones, in either order', () => {
  // Today's build sends a multi-answer draft only when no box is named on the
  // list; this build sends the `solution` one too. Neither changes shape.
  const today = { key: MULTI, value: { s1: 't ≥ 100', s2: 'T > 40' }, savedAt: 1000, savedAtIsEdit: true, questionIndex: 2, variantIndex: 0 };
  const now = { key: DOL2, value: { ...ANSWERS }, savedAt: 2000, savedAtIsEdit: true, fieldEditedAt: { model: 1900, solution: 2000 }, questionIndex: 40, variantIndex: 0 };
  const patch = (entry) => buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [entry] });
  for (const order of [[today, now], [now, today]]) {
    const document = order.reduce((existing, entry) => mergeWorkspaceDraftDocument({ existing, patch: patch(entry) }), null);
    const entries = readWorkspaceDraftEntries(document);
    assert.deepEqual(entries.find((entry) => entry.key === MULTI).value, today.value);
    assert.deepEqual(entries.find((entry) => entry.key === DOL2).value, ANSWERS);
    // The Security Rules read the document's own fields, never an entry's
    // text: the stored document carries none of the names they refuse.
    assert.deepEqual(Object.keys(document).filter((field) => RULES_REFUSE.includes(field)), []);
  }
  // A stored entry is kept as stored text whenever another draft is merged in,
  // whatever the merging build's guard says of it: an older build saving a
  // different question does not drop the `solution` entry.
  const stored = mergeWorkspaceDraftDocument({ existing: null, patch: patch(now) });
  const storedEntry = stored.entries.find((entry) => entry.key === DOL2);
  const after = mergeWorkspaceDraftDocument({ existing: stored, patch: patch({ key: LITERAL, value: '3', savedAt: 3000, savedAtIsEdit: true, questionIndex: 6, variantIndex: 0 }) });
  assert.deepEqual(after.entries.find((entry) => entry.key === DOL2), storedEntry);
});
