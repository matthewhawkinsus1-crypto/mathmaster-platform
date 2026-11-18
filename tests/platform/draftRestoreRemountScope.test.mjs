/*
 * A SERVER READ REMOUNTS ONLY THE QUESTION WHOSE DRAFT CHANGED (issue #386, after R12).
 *
 * The server's copy of a student's drafts covers the whole assignment, and App
 * remounted the question on screen whenever its read restored or settled any
 * draft in it. Work typed on another device for ANOTHER question remounted the
 * question the student was typing in: in the browser every such read did, on
 * a Chromebook and on a phone, as the lesson opened and when the page came back
 * online. A key typed as it landed was lost, the caret went to the end of the
 * box, and a screen reader's place in the question went with the old one.
 *
 * The three paths that write the server's copy in here report the drafts they
 * changed (`changed`), and App remounts the question on screen only for one of
 * its own (draftsOfQuestionChanged). A restore of its own draft remounts it as
 * before, with the cursor put back (answerEntryUx.test.mjs). Every rule below
 * is mutation-checked.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildWorkspaceDraftPatch,
  mergeWorkspaceDraftDocument,
  readWorkspaceDraftEntries,
  selectRestorableDraftEntries,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

const BASE = Date.now() - 60 * 60 * 1000;
const at = (seconds) => BASE + seconds * 1000;
const STUDENT = 'S-remount';
const ASSIGNMENT = 'A-remount';
const OWNER = { studentId: STUDENT, assignmentId: ASSIGNMENT };
const prefix = (question) => `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:${question}:0:student`;

let instance = 0;
const page = async (storage = new MemoryStorage()) => {
  globalThis.window = { localStorage: storage };
  instance += 1;
  const module = await import(`../../src/questionDraftStorage.js?remount=${instance}`);
  return { ...module, storage, value: (key) => JSON.parse(storage.getItem(key) || 'null')?.value };
};
const held = (value, savedAt, extra = {}) => JSON.stringify({ version: 2, savedAt, value, touchedAt: savedAt, savedAtIsEdit: true, ...extra });
const serverDoc = (entries) => mergeWorkspaceDraftDocument({ existing: null, patch: buildWorkspaceDraftPatch({ ...OWNER, entries }) });

// App's read of the server copy, in its order (App.jsx readServerCopy): the
// settles first, then the whole restore of what they did not settle.
const appRead = (p, document) => {
  const entries = readWorkspaceDraftEntries(document);
  const restorable = selectRestorableDraftEntries({ entries, localSavedAt: (key) => p.questionDraftSavedAt(key) });
  const changed = new Set();
  const settled = p.reconcileToolWorkspaceDrafts(entries, { ...OWNER, changed });
  const fieldRecords = p.reconcileFieldRecordDrafts(entries, { ...OWNER, changed });
  const restored = p.restoreQuestionDrafts(restorable.filter((entry) => !fieldRecords.keys.has(entry.key)), { changed });
  return { changed, settled, restored, fieldRecords };
};

/* ------------------------------------------------------------- the restore */

const FRACTION = `${prefix(1)}:literal`;
const LINE = `${prefix(2)}:literal`;

test('another question\'s newer draft is restored here, and the question on screen is not remounted for it', async () => {
  const p = await page();
  // Question 2 is on screen; question 1 was worked on another Chromebook since.
  p.storage.setItem(FRACTION, held({ answer: '1/2' }, at(10)));
  p.storage.setItem(LINE, held({ answer: '12' }, at(20)));
  const read = appRead(p, serverDoc([
    { key: FRACTION, value: { answer: '7/8' }, savedAt: at(30), savedAtIsEdit: true },
    { key: LINE, value: { answer: '12' }, savedAt: at(20), savedAtIsEdit: true },
  ]));
  assert.equal(read.restored, 1);
  assert.deepEqual([...read.changed], [FRACTION], 'only the draft written here is reported');
  assert.equal(p.draftsOfQuestionChanged(read.changed, 2), false, 'the question the student is typing in stays mounted');
  assert.equal(p.draftsOfQuestionChanged(read.changed, 1), true, 'the restored question would be');
  assert.deepEqual(p.readQuestionDraft(FRACTION), { answer: '7/8' }, 'and opening it shows the restored work');
  assert.deepEqual(p.readQuestionDraft(LINE), { answer: '12' });
});

test('a newer copy of the question on screen still remounts it, as before', async () => {
  const p = await page();
  p.storage.setItem(LINE, held({ answer: '12' }, at(20)));
  const read = appRead(p, serverDoc([{ key: LINE, value: { answer: '125' }, savedAt: at(40), savedAtIsEdit: true }]));
  assert.deepEqual([...read.changed], [LINE]);
  assert.equal(p.draftsOfQuestionChanged(read.changed, 2), true);
  // An older or equal copy is not written, so not reported either.
  const again = appRead(p, serverDoc([{ key: LINE, value: { answer: '1' }, savedAt: at(40), savedAtIsEdit: true }]));
  assert.equal(again.changed.size, 0, 'a copy this device already holds changes nothing');
  assert.deepEqual(p.value(LINE), { answer: '125' });
});

/* ------------------------------------------------- the answer-by-answer settle */

const MULTI_FRACTION = `${prefix(1)}:multi-answer`;
const MULTI_LINE = `${prefix(2)}:multi-answer`;

test('a field-record draft is reported when the settle changed its answers, and not when it kept them', async () => {
  const p = await page();
  p.storage.setItem(MULTI_FRACTION, held({ a: '1' }, at(10), { fieldEditedAt: { a: at(10) } }));
  p.storage.setItem(MULTI_LINE, held({ a: '12' }, at(20), { fieldEditedAt: { a: at(20) } }));
  const read = appRead(p, serverDoc([
    { key: MULTI_FRACTION, value: { a: '7' }, savedAt: at(30), savedAtIsEdit: true, fieldEditedAt: { a: at(30) } },
    { key: MULTI_LINE, value: { a: '12' }, savedAt: at(20), savedAtIsEdit: true, fieldEditedAt: { a: at(20) } },
  ]));
  assert.deepEqual([...read.fieldRecords.keys].sort(), [MULTI_FRACTION, MULTI_LINE].sort(), 'both were settled here');
  assert.deepEqual([...read.changed], [MULTI_FRACTION], 'only the one whose answers changed is reported');
  assert.equal(read.fieldRecords.settled, 1);
  assert.equal(p.draftsOfQuestionChanged(read.changed, 2), false);
  assert.deepEqual(p.value(MULTI_FRACTION), { a: '7' });
});

/* ------------------------------------------------- the tool-workspace settle */

const BOARD_FRACTION = `${prefix(1)}:work:board`;
const BOARD_LINE = `${prefix(2)}:work:board`;

test('a fresh tool workspace is reported when the settle changed its fields, and not when it only stops being fresh', async () => {
  const p = await page();
  // Both begun on this device before the read landed.
  p.storage.setItem(BOARD_FRACTION, held({ expanded: false, __fresh: ['expanded'] }, at(20)));
  p.storage.setItem(BOARD_LINE, held({ featureSlope: '3', __fresh: ['featureSlope'] }, at(20)));
  const generation = p.questionDraftRestoreGeneration();
  const read = appRead(p, serverDoc([
    { key: BOARD_FRACTION, value: { slope: '2', intercept: '6' }, savedAt: at(10), savedAtIsEdit: true },
  ]));
  assert.equal(read.settled, 2, 'both are settled: neither is fresh any more');
  assert.deepEqual(p.value(BOARD_LINE), { featureSlope: '3' }, 'the server holds nothing for this one: kept as it was');
  assert.deepEqual(p.value(BOARD_FRACTION), { slope: '2', intercept: '6', expanded: false }, 'the server\'s board, with the touch on top');
  assert.deepEqual([...read.changed], [BOARD_FRACTION], 'only the workspace whose fields changed is reported');
  assert.equal(p.draftsOfQuestionChanged(read.changed, 2), false, 'the board on screen shows what it held: no remount');
  assert.notEqual(p.questionDraftRestoreGeneration(), generation, 'cached copies still read the settled records again');
});

/* ---------------------------------------------------- which question it is */

test('draftsOfQuestionChanged matches a question by its own drafts, whatever the draft', async () => {
  const p = await page();
  const changed = new Set([`${prefix(3)}:stage-solve:step-algebra`, `${prefix(0)}:work:board`, 'not a draft key']);
  assert.equal(p.draftsOfQuestionChanged(changed, 3), true, 'a composed question\'s step');
  assert.equal(p.draftsOfQuestionChanged(changed, 0), true, 'the first question is a question');
  assert.equal(p.draftsOfQuestionChanged(changed, 30), false, 'not a prefix match');
  assert.equal(p.draftsOfQuestionChanged(new Set([`mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:13:0:student`]), 1), false);
  assert.equal(p.draftsOfQuestionChanged(changed, 2), false);
  assert.equal(p.draftsOfQuestionChanged(new Set(), 3), false, 'nothing changed');
  assert.equal(p.draftsOfQuestionChanged(null, 3), false);
  assert.equal(p.draftsOfQuestionChanged(changed, null), false, 'no question on screen');
  assert.equal(p.draftsOfQuestionChanged(changed, '3'), false);
});

/* ------------------------------------------------------------- App's read */

test('App\'s server read remounts the question on screen only for a draft of its own that the read changed', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /import \{[^}]*\bdraftsOfQuestionChanged\b[^}]*\} from '\.\/questionDraftStorage';/, 'imported next to its call');
  const read = region(app, 'const readServerCopy = () => {', '.catch((error) => {');
  // One Set, filled by each of the three paths that write the server's copy in.
  const declared = read.match(/const (\w+) = new Set\(\);/);
  assert.ok(declared, 'the read collects the drafts it changed');
  const changed = declared[1];
  for (const call of ['reconcileToolWorkspaceDrafts', 'reconcileFieldRecordDrafts']) {
    assert.match(read, new RegExp(`${call}\\(entries, \\{[^}]*\\b${changed}\\b[^}]*\\}\\)`), `${call} reports what it changed`);
  }
  assert.match(read, new RegExp(`restoreQuestionDrafts\\(restorable\\b[^;]*\\{ ${changed} \\}\\);`), 'and so does the restore');
  // The read's one remount, for the question on screen, after all three.
  assert.equal(read.split('setWorkspaceDraftGeneration(').length - 1, 1, 'one remount in the read');
  assert.match(
    read,
    new RegExp(`if \\(draftsOfQuestionChanged\\(${changed}, currentQuestionIndexRef\\.current\\)\\) \\{\\s*setDraftRestoreFocus\\(\\{[\\s\\S]*?\\}\\);\\s*setWorkspaceDraftGeneration\\(\\(value\\) => value \\+ 1\\);\\s*\\}`),
    'only when one of the changed drafts is its own',
  );
  assert.ok(read.indexOf('restoreQuestionDrafts(') < read.indexOf('draftsOfQuestionChanged('), 'decided once everything is written in');
});

/*
 * THE REF THE READ DECIDES WITH NAMES THE QUESTION THE LAST COMMIT PUT ON SCREEN.
 *
 * The next question reads its drafts while it renders, and a Next (set after an
 * await, a default update) commits in one task and runs its passive effects in
 * a later one. With the ref set in a passive effect, a read landing between the
 * two decided for the question the student had left: the next question's newer
 * copy from another Chromebook went into storage, the stale copy stayed on
 * screen, and the student's next key saved it over the other Chromebook's work
 * (review r1). A layout effect runs in the commit's own task: a read lands
 * before the next question rendered, which then reads what was restored, or
 * after the ref names it, which is then remounted. draftCrossDeviceJourneys.mjs
 * `next` lands the read in that gap in the browser.
 */
test('App sets the question its read decides for once, in a layout effect of the commit that shows it', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  const writes = app.match(/currentQuestionIndexRef\.current\s*=(?!=)/g) || [];
  assert.equal(writes.length, 1, 'one place moves the ref');
  assert.match(app, /useLayoutEffect\(\(\) => \{\s*currentQuestionIndexRef\.current = currentQuestionIndex;\s*\}, \[currentQuestionIndex\]\);/, 'a layout effect, on the question that is shown');
  // The cursor a restore recorded for the question left is still dropped as
  // any question opens, after the commit, where it was.
  assert.match(app, /useEffect\(\(\) => \{\s*setDraftRestoreFocus\(null\);\s*\}, \[currentQuestionIndex, activeAssignmentId\]\);/);
  // And the read still decides with it.
  const read = region(app, 'const readServerCopy = () => {', '.catch((error) => {');
  assert.match(read, /draftsOfQuestionChanged\(\w+, currentQuestionIndexRef\.current\)/);
});
