/*
 * ONLY A STUDENT'S EDIT MOVES A DRAFT FORWARD IN TIME (PQ-044).
 *
 * A draft's `savedAt` orders it against the server copy and every other
 * Chromebook: the server keeps the newer copy of each key, a restore writes the
 * server's copy only over an older local one, and a draft older than the
 * question's last submitted attempt is history. Every workspace writes its draft
 * back the moment it mounts; when that write was stamped "now", merely OPENING
 * a question made what it showed — on a fresh Chromebook, empty boxes — the
 * newest work. The server copy then lost the restore to it, and the background
 * save carried the empty boxes up over the real work.
 *
 * These are the rules that replace it, at the storage seam
 * (questionDraftStorage.js), in the background save (workspaceDraftSync.js) and
 * in the order a restore decides by (selectRestorableDraftEntries), plus the
 * wiring that hands each rule the right answer (the draft hooks, WorkflowRunner
 * and App.jsx). The browser proofs are tests/browser/draftEditTime.mjs (every
 * certified family) and tests/browser/teacherWorkflow/draftCrossDeviceJourneys.mjs
 * (the real App across devices).
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
import { createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

const DAY = 24 * 60 * 60 * 1000;
// Edit times an hour ago, n seconds apart (a draft from 1970 would expire).
const BASE = Date.now() - 60 * 60 * 1000;
const at = (seconds) => BASE + seconds * 1000;
const STUDENT = 'S-edit';
const ASSIGNMENT = 'A-edit';
const KEY = `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:2:0:student:multi-answer`;
const OTHER = `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:3:0:student:table`;

let instance = 0;
/**
 * A page: its own copy of the storage module (so its own input count and its
 * own view of what it read), its own local storage, and — unless `tracked` is
 * false — a window whose trusted input it counts.
 */
const page = async ({ tracked = true, storage = new MemoryStorage() } = {}) => {
  globalThis.window = { localStorage: storage };
  instance += 1;
  const module = await import(`../../src/questionDraftStorage.js?page=${instance}`);
  const listeners = {};
  if (tracked) module.trackStudentInput({ addEventListener: (type, listener) => { listeners[type] = listener; } });
  const events = [];
  module.subscribeToQuestionDrafts((event) => events.push(event));
  return {
    ...module,
    storage,
    events,
    // A real keystroke or tap (or, with `isTrusted: false`, a script's event).
    input: (type = 'keydown', isTrusted = true) => listeners[type]?.({ isTrusted }),
    envelope: (key) => JSON.parse(storage.getItem(key) || 'null'),
    // Another tab of this browser, or a restore: storage changed behind the page.
    storeBehind: (key, savedAt, value) => storage.setItem(key, JSON.stringify({ version: 2, savedAt, value })),
  };
};

/* ------------------------------------------------- the storage seam itself */

test('without observable input (a node test, an old harness) every write is an edit, as before', async () => {
  const p = await page({ tracked: false });
  const before = Date.now();
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, { m: '' });
  assert.ok(p.envelope(KEY).savedAt >= before);
  assert.equal(p.events.at(-1).edit, true);
  assert.equal(p.studentInputSince(p.studentInputMark()), true);
});

test('opening a question — read, then written back with no input between — is not an edit', async () => {
  const p = await page();
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, {});
  const stored = p.envelope(KEY);
  assert.equal(stored.savedAt, 0, 'never edited: no edit time at all');
  assert.deepEqual(stored.value, {}, 'the value is stored all the same');
  assert.ok(stored.touchedAt > 0, 'and the device knows when it last wrote it');
  // Offered as what it is: not an edit, and carrying no edit's time.
  assert.deepEqual(p.events.at(-1), { key: KEY, value: {}, savedAt: 0, edit: false, savedAtIsEdit: false });
  assert.equal(p.questionDraftSavedAt(KEY), 0);
});

test('the click that opened the question is not an edit of it', async () => {
  const p = await page();
  p.input('pointerdown');
  p.input('click');
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, {});
  assert.equal(p.envelope(KEY).savedAt, 0);
  assert.equal(p.events.at(-1).edit, false);
});

test('a write after the student touched the page since the read is an edit, stamped now', async () => {
  const p = await page();
  p.readQuestionDraft(KEY, {});
  const mark = p.studentInputMark();
  assert.equal(p.studentInputSince(mark), false);
  p.input('keydown');
  assert.equal(p.studentInputSince(mark), true);
  const before = Date.now();
  p.writeQuestionDraft(KEY, { m: '-2/3' });
  assert.ok(p.envelope(KEY).savedAt >= before);
  assert.equal(p.events.at(-1).edit, true);
  for (const type of ['pointerdown', 'beforeinput', 'input', 'paste', 'drop', 'touchstart', 'click', 'change']) {
    const at = p.studentInputMark();
    p.input(type);
    assert.equal(p.studentInputSince(at), true, `${type} is the student`);
  }
});

test('an event a script dispatched is not the student', async () => {
  const p = await page();
  p.readQuestionDraft(KEY, {});
  p.input('input', false);
  p.input('keydown', false);
  p.writeQuestionDraft(KEY, { m: '1' });
  assert.equal(p.envelope(KEY).savedAt, 0);
  assert.equal(p.events.at(-1).edit, false);
});

test('a write that is not an edit keeps the time of the last edit, and still stores its value', async () => {
  const p = await page();
  p.storeBehind(KEY, at(1), { m: '-2/3' });
  assert.deepEqual(p.readQuestionDraft(KEY, {}), { m: '-2/3' });
  p.writeQuestionDraft(KEY, { m: '-2/3', normalised: true });
  assert.equal(p.envelope(KEY).savedAt, at(1));
  assert.deepEqual(p.envelope(KEY).value, { m: '-2/3', normalised: true });
  assert.equal(p.events.at(-1).savedAt, at(1));
  // A writer that knows says so, whatever the input.
  p.input();
  p.writeQuestionDraft(KEY, { m: '-2/3' }, { edit: false });
  assert.equal(p.envelope(KEY).savedAt, at(1));
  const before = Date.now();
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, { m: '1/2' }, { edit: true });
  assert.ok(p.envelope(KEY).savedAt >= before, 'an explicit edit is stamped with no input at all');
});

test('a draft this page never read: input since the page loaded decides', async () => {
  const p = await page();
  p.writeQuestionDraft(KEY, { m: '' });
  assert.equal(p.envelope(KEY).savedAt, 0, 'before any input: not an edit');
  p.input('pointerdown');
  p.writeQuestionDraft(OTHER, { a: 1 });
  assert.ok(p.envelope(OTHER).savedAt > 0, 'after input: an edit');
});

test('a write that is not an edit never puts back an older copy: not over a restore, not over another tab', async () => {
  const p = await page();
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, {});
  // The server's copy arrives behind the mounted workspace.
  assert.equal(p.restoreQuestionDrafts([{ key: KEY, savedAt: at(5), value: { m: '-2/3' } }]), 1);
  assert.equal(p.writeQuestionDraft(KEY, {}), false, 'the old mount\'s write-back is dropped');
  assert.deepEqual(p.envelope(KEY), { version: 2, savedAt: at(5), value: { m: '-2/3' } });
  // The remount reads what was restored; from then on it writes as usual.
  assert.deepEqual(p.readQuestionDraft(KEY, {}), { m: '-2/3' });
  p.writeQuestionDraft(KEY, { m: '-2/3' });
  assert.equal(p.envelope(KEY).savedAt, at(5));
  // Another tab edits; this page's copy is now the older one.
  p.storeBehind(KEY, at(9), { m: '1', b: '4' });
  assert.equal(p.writeQuestionDraft(KEY, { m: '-2/3' }), false);
  assert.deepEqual(p.envelope(KEY).value, { m: '1', b: '4' });
  // The student's own edit here is still the newest thing that happened.
  p.input();
  p.writeQuestionDraft(KEY, { m: '7' });
  assert.deepEqual(p.envelope(KEY).value, { m: '7' });
  assert.ok(p.envelope(KEY).savedAt > at(9));
});

test('removing a draft forgets what the page saw of it, so the next mount writes as usual', async () => {
  const p = await page();
  p.storeBehind(KEY, at(4), { m: '1' });
  p.readQuestionDraft(KEY, {});
  p.removeQuestionDraft(KEY);
  assert.equal(p.writeQuestionDraft(KEY, {}), true);
  assert.equal(p.envelope(KEY).savedAt, 0);
});

test('a reset is the newest thing that happened to every draft of the question, input or not', async () => {
  const p = await page();
  const prefix = `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:2:0:student`;
  p.storeBehind(`${prefix}:multi-answer`, at(1), { m: '1' });
  p.storeBehind(`${prefix}:step-algebra`, at(1), { x: 1 });
  const before = Date.now();
  assert.equal(p.resetQuestionDraftFamily(prefix), 3);
  for (const key of [prefix, `${prefix}:multi-answer`, `${prefix}:step-algebra`]) {
    assert.equal(p.envelope(key).value, null);
    assert.ok(p.envelope(key).savedAt >= before, `${key} tombstoned now`);
  }
  assert.ok(p.events.every((event) => event.edit === true));
});

test('a draft lives 45 days from the last time this device wrote it, edit or not (as before)', async () => {
  const p = await page();
  const now = Date.now();
  p.storage.setItem(KEY, JSON.stringify({ version: 2, savedAt: now - 46 * DAY, value: { m: '1' }, touchedAt: now - DAY }));
  assert.deepEqual(p.readQuestionDraft(KEY, null), { m: '1' }, 'opened yesterday: kept');
  p.storage.setItem(OTHER, JSON.stringify({ version: 2, savedAt: now - 46 * DAY, value: { a: 1 } }));
  assert.equal(p.readQuestionDraft(OTHER, 'gone'), 'gone', 'an envelope from before touchedAt expires from savedAt');
  assert.equal(p.storage.getItem(OTHER), null);
  p.storage.setItem(OTHER, JSON.stringify({ version: 2, savedAt: 0, value: { a: 1 }, touchedAt: now - 46 * DAY }));
  assert.equal(p.readQuestionDraft(OTHER, 'gone'), 'gone', 'never edited and not opened for 46 days: expired');
});

/* -------------------------------------------------- what a restore decides */

const restorable = (p, entries, canonical = 0) => selectRestorableDraftEntries({
  entries,
  localSavedAt: (key) => p.questionDraftSavedAt(key),
  canonicalSavedAt: () => canonical,
});

test('a fresh Chromebook that opened the question first still takes the server copy', async () => {
  const p = await page();
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, {});
  assert.deepEqual(restorable(p, [{ key: KEY, savedAt: at(1), value: { m: '-2/3' } }]).map((entry) => entry.key), [KEY]);
});

test('this device\'s own newer edit is never replaced; an older one is, however recently it was opened', async () => {
  const p = await page();
  p.storeBehind(KEY, at(5), { m: '7' });
  for (let open = 0; open < 3; open += 1) {
    p.readQuestionDraft(KEY, {});
    p.writeQuestionDraft(KEY, { m: '7' });
  }
  assert.equal(p.questionDraftSavedAt(KEY), at(5), 'opening it three times did not make it newer');
  // Entries this build saved: their times are edits' (the edit-time marker).
  assert.deepEqual(restorable(p, [{ key: KEY, savedAt: at(4), value: { m: 'older' }, savedAtIsEdit: true }]), []);
  assert.equal(restorable(p, [{ key: KEY, savedAt: at(6), value: { m: 'B edited it' }, savedAtIsEdit: true }]).length, 1);
});

test('canonical attempts still beat drafts', async () => {
  const p = await page();
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, {});
  assert.deepEqual(restorable(p, [{ key: KEY, savedAt: at(3), value: { m: '1' } }], at(4)), []);
  assert.equal(restorable(p, [{ key: KEY, savedAt: at(5), value: { m: '1' } }], at(4)).length, 1);
});

/* --------------------------------------------------- the background save */

const manualScheduler = () => {
  const queued = new Map();
  let next = 1;
  return {
    set: (callback) => { next += 1; queued.set(next, callback); return next; },
    clear: (handle) => queued.delete(handle),
    runAll() { const callbacks = [...queued.values()]; queued.clear(); callbacks.forEach((callback) => callback()); },
  };
};
const syncFor = ({ now = () => 99_999 } = {}) => {
  const writes = [];
  const scheduler = manualScheduler();
  const sync = createWorkspaceDraftSync({
    studentId: STUDENT, assignmentId: ASSIGNMENT, scheduler, now,
    flush: async ({ document }) => { writes.push(document); },
  });
  const pending = () => Object.fromEntries(sync.snapshotPatch().entries.map((entry) => [entry.key, entry.savedAt]));
  return { sync, writes, scheduler, pending };
};

test('a write that was never an edit anywhere is never offered to the server', () => {
  const { sync, pending } = syncFor();
  assert.equal(sync.record({ key: KEY, value: {}, savedAt: 0, edit: false }), false);
  sync.noteServerCopy([]);
  assert.deepEqual(pending(), {});
  assert.equal(sync.stats().unedited, 1);
});

test('a write that is not an edit waits for the server copy, and goes only if the server lacks that edit', () => {
  const held = syncFor();
  held.sync.record({ key: KEY, value: { m: '7' }, savedAt: 1_000, edit: false });
  assert.deepEqual(held.pending(), {}, 'nothing is known of the server yet');
  held.sync.noteServerCopy([]);
  assert.deepEqual(held.pending(), { [KEY]: 1_000 }, 'an edit the server never got goes, at its own time — never the sync\'s clock');

  const same = syncFor();
  same.sync.record({ key: KEY, value: { m: 'derived from it' }, savedAt: 1_000, edit: false });
  same.sync.noteServerCopy([{ key: KEY, savedAt: 1_000 }]);
  assert.deepEqual(same.pending(), {}, 'the server holds that edit: a copy derived from it never replaces it');

  const newer = syncFor();
  newer.sync.noteServerCopy([{ key: KEY, savedAt: 2_000 }]);
  newer.sync.record({ key: KEY, value: { m: 'older' }, savedAt: 1_000, edit: false });
  assert.deepEqual(newer.pending(), {}, 'nor an older copy, once the server is known');
  newer.sync.record({ key: OTHER, value: { a: 1 }, savedAt: 1_500, edit: false });
  assert.deepEqual(newer.pending(), { [OTHER]: 1_500 }, 'a draft the server lacks goes at once');
});

test('an edit goes at once with its own time, and supersedes a write waiting for the server', () => {
  const { sync, pending } = syncFor();
  sync.record({ key: KEY, value: { m: 'old' }, savedAt: 1_000, edit: false });
  sync.record({ key: KEY, value: { m: 'typed' }, savedAt: 3_000, edit: true });
  assert.deepEqual(pending(), { [KEY]: 3_000 });
  sync.noteServerCopy([]);
  assert.deepEqual(pending(), { [KEY]: 3_000 });
  assert.equal(sync.snapshotPatch().entries[0].valueJson, JSON.stringify({ m: 'typed' }));
});

test('what this device saved is what the server holds: writing it back afterwards sends nothing', async () => {
  const { sync, scheduler, writes, pending } = syncFor();
  sync.noteServerCopy([]);
  sync.record({ key: KEY, value: { m: 'typed' }, savedAt: 3_000, edit: true });
  scheduler.runAll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes.length, 1);
  sync.record({ key: KEY, value: { m: 'typed' }, savedAt: 3_000, edit: false });
  assert.deepEqual(pending(), {});
});

test('callers that say nothing about edits are saved as before', () => {
  const { sync, pending } = syncFor({ now: () => 42 });
  sync.record({ key: KEY, value: { m: '1' }, savedAt: 7 });
  sync.record({ key: OTHER, value: { a: 1 } });
  assert.deepEqual(pending(), { [KEY]: 7, [OTHER]: 42 });
});

/* ---------------------------------------- two Chromebooks and one server */

test('A works, B opens and edits, A comes back: the newest edit wins and opening never overwrites', async () => {
  let server = null;
  const save = async (sync, scheduler) => {
    scheduler.runAll();
    await new Promise((resolve) => setImmediate(resolve));
    return sync;
  };
  const device = async () => {
    const p = await page();
    const scheduler = manualScheduler();
    const sync = createWorkspaceDraftSync({
      studentId: STUDENT, assignmentId: ASSIGNMENT, scheduler,
      flush: async ({ document }) => { server = mergeWorkspaceDraftDocument({ existing: server, patch: document }); },
    });
    p.subscribeToQuestionDrafts((event) => sync.record(event));
    // App.jsx: the question mounts, then the read lands.
    const open = () => {
      const shown = p.readQuestionDraft(KEY, {});
      p.writeQuestionDraft(KEY, shown);
      const entries = readWorkspaceDraftEntries(server);
      const restored = p.restoreQuestionDrafts(restorable(p, entries));
      sync.noteServerCopy(entries);
      return restored ? p.readQuestionDraft(KEY, {}) : shown;
    };
    return { p, sync, scheduler, open };
  };
  const serverValue = () => readWorkspaceDraftEntries(server).find((entry) => entry.key === KEY);

  const a = await device();
  assert.deepEqual(a.open(), {});
  a.p.input();
  a.p.writeQuestionDraft(KEY, { m: '-2/3' });
  await save(a.sync, a.scheduler);
  const afterA = serverValue();
  assert.deepEqual(afterA.value, { m: '-2/3' });

  const b = await device();
  assert.deepEqual(b.open(), { m: '-2/3' }, 'B shows A\'s work');
  await save(b.sync, b.scheduler);
  assert.deepEqual(serverValue(), afterA, 'B opening it changed nothing on the server');
  await new Promise((resolve) => setTimeout(resolve, 5));
  b.p.input();
  b.p.writeQuestionDraft(KEY, { m: '-2/3', b: '4' });
  await save(b.sync, b.scheduler);
  assert.deepEqual(serverValue().value, { m: '-2/3', b: '4' });
  const afterB = serverValue();

  // A comes back: same storage, a new page.
  globalThis.window = { localStorage: a.p.storage };
  const back = await device();
  back.p.storage.values = new Map(a.p.storage.values);
  assert.deepEqual(back.open(), { m: '-2/3', b: '4' }, 'A sees B\'s newer edit, not its own older copy');
  await save(back.sync, back.scheduler);
  assert.deepEqual(serverValue(), afterB, 'coming back changed nothing on the server');
});

/* ------------------------------------------------- the edit-time marker */

/*
 * Server copies an older build saved carry the time of the last write of any
 * kind — opening a question included — and nothing in them says which. This
 * build marks every entry whose time is an edit's (`savedAtIsEdit`), and a
 * restore lets an unmarked entry replace only a device with nothing dated of
 * its own (workspaceDraftSchema.mjs). An older build's copy, here or there,
 * is simulated as what it wrote: an envelope or an entry without the marker.
 */
const olderBuildEnvelope = (savedAt, value) => JSON.stringify({ version: 2, savedAt, value });
const THIRD = `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:4:0:student:graph`;

test('a copy says whether its time is an edit\'s: an edit\'s is, and a write that is not an edit keeps what the copy said', async () => {
  const p = await page();
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, {});
  assert.equal(Object.hasOwn(p.envelope(KEY), 'savedAtIsEdit'), false, 'never edited: nothing to mark');
  p.input();
  p.writeQuestionDraft(KEY, { m: '-2/3' });
  assert.equal(p.envelope(KEY).savedAtIsEdit, true);
  assert.equal(p.events.at(-1).savedAtIsEdit, true);
  // Opened again: written back, not an edit, and still the edit's time.
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, { m: '-2/3' });
  assert.equal(p.envelope(KEY).savedAtIsEdit, true);
  assert.deepEqual([p.events.at(-1).edit, p.events.at(-1).savedAtIsEdit], [false, true]);
  // A copy an older build dated may carry an opening's time: it stays unmarked.
  p.storage.setItem(OTHER, olderBuildEnvelope(at(2), { a: 1 }));
  p.readQuestionDraft(OTHER, {});
  p.writeQuestionDraft(OTHER, { a: 1 });
  assert.equal(p.envelope(OTHER).savedAt, at(2));
  assert.equal(Object.hasOwn(p.envelope(OTHER), 'savedAtIsEdit'), false);
  assert.deepEqual([p.events.at(-1).savedAt, p.events.at(-1).savedAtIsEdit], [at(2), false]);
  // Until the student edits it here.
  p.input();
  p.writeQuestionDraft(OTHER, { a: 2 });
  assert.equal(p.envelope(OTHER).savedAtIsEdit, true);
});

test('a restored copy carries the server entry\'s marker, or its lack of one', async () => {
  const p = await page();
  assert.equal(p.restoreQuestionDrafts([
    { key: KEY, savedAt: at(3), value: { m: '1' }, savedAtIsEdit: true },
    { key: OTHER, savedAt: at(3), value: { a: 1 }, savedAtIsEdit: false },
  ]), 2);
  assert.equal(p.envelope(KEY).savedAtIsEdit, true);
  assert.equal(Object.hasOwn(p.envelope(OTHER), 'savedAtIsEdit'), false);
  p.readQuestionDraft(KEY, {});
  p.writeQuestionDraft(KEY, { m: '1' });
  p.readQuestionDraft(OTHER, {});
  p.writeQuestionDraft(OTHER, { a: 1 });
  assert.deepEqual(p.events.map((event) => [event.key, event.savedAtIsEdit]), [[KEY, true], [OTHER, false]]);
});

test('the background save sends each entry with its marker: an edit\'s, and an offered copy\'s own', () => {
  const marks = (sync) => Object.fromEntries(sync.snapshotPatch().entries.map((entry) => [entry.key, entry.savedAtIsEdit === true]));
  const { sync } = syncFor();
  sync.record({ key: KEY, value: { m: '1' }, savedAt: 3_000, edit: true });
  sync.record({ key: OTHER, value: { a: 1 }, savedAt: 1_000, edit: false, savedAtIsEdit: true });
  sync.record({ key: THIRD, value: { p: [] }, savedAt: 2_000, edit: false, savedAtIsEdit: false });
  sync.noteServerCopy([]);
  assert.deepEqual(marks(sync), { [KEY]: true, [OTHER]: true, [THIRD]: false },
    'an edit; an edit made offline, offered once the server is known; a copy an older build dated');
  const callers = syncFor();
  callers.sync.record({ key: KEY, value: { m: '1' }, savedAt: 7 });
  assert.deepEqual(marks(callers.sync), { [KEY]: true }, 'a caller that says nothing about edits is an edit, as before');
});

test('the server copy keeps each entry\'s marker: stored, merged and read back with it', () => {
  const patch = (entries) => buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries });
  const marks = (document) => Object.fromEntries(readWorkspaceDraftEntries(document).map((entry) => [entry.key, [entry.savedAt, entry.savedAtIsEdit]]));
  let server = mergeWorkspaceDraftDocument({ existing: null, patch: patch([
    { key: KEY, value: { m: '1' }, savedAt: 2_000, savedAtIsEdit: true },
    { key: OTHER, value: { a: 1 }, savedAt: 2_000 },
  ]) });
  assert.deepEqual(marks(server), { [KEY]: [2_000, true], [OTHER]: [2_000, false] });
  assert.equal(Object.hasOwn(server.entries.find((entry) => entry.key === OTHER), 'savedAtIsEdit'), false,
    'an unmarked entry is stored exactly as an older build stores one');
  // A save of another question leaves both as they were.
  server = mergeWorkspaceDraftDocument({ existing: server, patch: patch([{ key: THIRD, value: { p: [] }, savedAt: 2_500, savedAtIsEdit: true }]) });
  assert.deepEqual(marks(server), { [KEY]: [2_000, true], [OTHER]: [2_000, false], [THIRD]: [2_500, true] });
  // The copy that wins brings its marker — or its lack of one — with it.
  server = mergeWorkspaceDraftDocument({ existing: server, patch: patch([
    { key: KEY, value: { m: '2' }, savedAt: 3_000 },
    { key: OTHER, value: { a: 2 }, savedAt: 3_000, savedAtIsEdit: true },
    { key: THIRD, value: { p: [1] }, savedAt: 1_000 },
  ]) });
  assert.deepEqual(marks(server), { [KEY]: [3_000, false], [OTHER]: [3_000, true], [THIRD]: [2_500, true] });
  // An older build saving to the same document rewrites its entries with the
  // fields it knows: every marker goes, and every entry reads as legacy.
  const olderBuildSave = {
    ...server,
    entries: server.entries.map(({ key, valueJson, savedAt, questionIndex, variantIndex }) => ({ key, valueJson, savedAt, questionIndex, variantIndex })),
  };
  assert.ok(readWorkspaceDraftEntries(olderBuildSave).every((entry) => entry.savedAtIsEdit === false));
});

test('an entry an older build saved replaces only a device with nothing dated of its own', async () => {
  // An older build opened the question on another Chromebook: empty boxes,
  // dated after the work (after the edit below, too).
  const openedLater = Date.now() + 60_000;
  const legacy = { key: KEY, savedAt: openedLater, value: {} };
  // A fresh Chromebook — before and after the question opened there — has nothing else.
  const fresh = await page();
  assert.equal(restorable(fresh, [legacy]).length, 1);
  fresh.readQuestionDraft(KEY, {});
  fresh.writeQuestionDraft(KEY, {});
  assert.equal(restorable(fresh, [legacy]).length, 1);
  assert.deepEqual(restorable(fresh, [legacy], openedLater + 1_000), [], 'a newer submission still beats it');
  // This device's own edit is kept...
  const own = await page();
  own.readQuestionDraft(KEY, {});
  own.input();
  own.writeQuestionDraft(KEY, { m: '-2/3' });
  assert.deepEqual(restorable(own, [legacy]), []);
  // ...unless the newer entry is an edit: the student cleared it elsewhere, later.
  assert.equal(restorable(own, [{ ...legacy, savedAtIsEdit: true }]).length, 1);
  // A copy an older build wrote here, and one restored from the server, are
  // kept too: an older build kept every copy a device had.
  const older = await page();
  older.storage.setItem(KEY, olderBuildEnvelope(at(1), { m: '-2/3' }));
  assert.deepEqual(restorable(older, [legacy]), []);
  const restored = await page();
  restored.restoreQuestionDrafts([{ key: KEY, savedAt: at(2), value: { m: '-2/3' }, savedAtIsEdit: true }]);
  assert.deepEqual(restorable(restored, [legacy]), []);
  assert.equal(restorable(restored, [{ ...legacy, savedAtIsEdit: true }]).length, 1);
});

test('an older build opens the question after A worked: A keeps its work, a fresh device gets what was saved, and A\'s next edit wins everywhere', async () => {
  let server = null;
  const save = async (scheduler) => {
    scheduler.runAll();
    await new Promise((resolve) => setImmediate(resolve));
  };
  const device = async (storage) => {
    const p = await page(storage ? { storage } : {});
    const scheduler = manualScheduler();
    const sync = createWorkspaceDraftSync({
      studentId: STUDENT, assignmentId: ASSIGNMENT, scheduler,
      flush: async ({ document }) => { server = mergeWorkspaceDraftDocument({ existing: server, patch: document }); },
    });
    p.subscribeToQuestionDrafts((event) => sync.record(event));
    const open = () => {
      globalThis.window = { localStorage: p.storage };
      const shown = p.readQuestionDraft(KEY, {});
      p.writeQuestionDraft(KEY, shown);
      const entries = readWorkspaceDraftEntries(server);
      const restored = p.restoreQuestionDrafts(restorable(p, entries));
      sync.noteServerCopy(entries);
      return restored ? p.readQuestionDraft(KEY, {}) : shown;
    };
    return { p, scheduler, open };
  };
  const serverEntry = () => readWorkspaceDraftEntries(server).find((entry) => entry.key === KEY);

  const a = await device();
  a.open();
  a.p.input();
  a.p.writeQuestionDraft(KEY, { m: '-2/3' });
  await save(a.scheduler);
  assert.deepEqual([serverEntry().value, serverEntry().savedAtIsEdit], [{ m: '-2/3' }, true]);

  // The older build merely opens it: its write-back, dated now, over A's
  // work, saved with the fields that build knows.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const openedAt = Date.now();
  server = {
    ...server,
    entries: server.entries.map((entry) => (entry.key === KEY
      ? { key: KEY, valueJson: '{}', savedAt: openedAt, questionIndex: 2, variantIndex: 0 }
      : { key: entry.key, valueJson: entry.valueJson, savedAt: entry.savedAt, questionIndex: entry.questionIndex, variantIndex: entry.variantIndex })),
  };
  const legacy = serverEntry();

  // A comes back: its own work, and nothing sent over what the server holds.
  const back = await device(a.p.storage);
  assert.deepEqual(back.open(), { m: '-2/3' }, 'A keeps the work it typed');
  await save(back.scheduler);
  assert.deepEqual(serverEntry(), legacy, 'coming back sends nothing: its copy is older than what the server holds');

  // A fresh Chromebook gets what the server holds, as an older build would.
  const fresh = await device();
  assert.deepEqual(fresh.open(), {});

  // A's next edit is the newest, and marked: it wins on the server and on the
  // fresh device when it reads again.
  globalThis.window = { localStorage: back.p.storage };
  back.p.input();
  back.p.writeQuestionDraft(KEY, { m: '-1/2' });
  await save(back.scheduler);
  assert.deepEqual([serverEntry().value, serverEntry().savedAtIsEdit], [{ m: '-1/2' }, true]);
  assert.deepEqual(fresh.open(), { m: '-1/2' });
});

/* ---------------------------------- the wiring that hands each rule its answer */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('the draft hooks write back what they hold as not an edit, and judge their setters from where they read', () => {
  for (const [file, key] of [['src/useLocalDraftState.js', 'storageKey'], ['src/useUndoHistory.js', 'persistenceKey']]) {
    const source = stripComments(read(file));
    assert.match(source, new RegExp(`useEffect\\(\\(\\) => \\{[\\s\\S]*?writeQuestionDraft\\(${key}, value, \\{ edit: false \\}\\);\\s*\\}, \\[${key}, value\\]\\)`),
      `${file}: the write-back effect is not an edit`);
    const marks = source.match(/inputMarkRef\.current = studentInputMark\(\);/g) || [];
    assert.equal(marks.length, 2, `${file}: the mark is taken where the draft is read — on mount and on a key change`);
    assert.match(source, /useState\(\(\) => \{[\s\S]*?inputMarkRef\.current = studentInputMark\(\);[\s\S]*?readQuestionDraft\(/);
    assert.doesNotMatch(source, /writeQuestionDraft\((storageKey|persistenceKey), (value|saved)\);/, `${file}: no write leaves the question unanswered`);
  }
  // A setter is an edit once the student has touched the page since that read,
  // unless its caller says otherwise.
  const local = stripComments(read('src/useLocalDraftState.js'));
  assert.match(local, /const edit = typeof options\?\.edit === 'boolean' \? options\.edit : studentInputSince\(inputMarkRef\.current\);\s*writeQuestionDraft\(storageKey, saved, \{ edit \}\);/);
  const undo = stripComments(read('src/useUndoHistory.js'));
  assert.match(undo, /writeQuestionDraft\(persistenceKey, saved, \{ edit: typeof options\.edit === 'boolean' \? options\.edit : studentInputSince\(inputMarkRef\.current\) \}\);/);
  assert.equal((undo.match(/writeQuestionDraft\(persistenceKey, saved, \{ edit: studentInputSince\(inputMarkRef\.current\) \}\);/g) || []).length, 2, 'undo and reset');
});

test('a registry tool\'s field judges its writes from when it mounted, and a submission stamps its work', () => {
  const source = stripComments(read('src/tools/shared/usePersistentToolState.js'));
  assert.match(source, /useState\(\(\) => \{\s*inputMarkRef\.current = studentInputMark\(\);\s*return restoreField\(/);
  assert.match(source, /keyRef\.current = key;\s*inputMarkRef\.current = studentInputMark\(\);/);
  assert.match(source, /commitField\(keyRef\.current, field, resolved, coalesceMs, studentInputSince\(inputMarkRef\.current\)\)/);
  // What is written is the store's record — with its fresh marker while it
  // has one (a workspace this device started from nothing) — and each write
  // says whether it is the student's edit.
  assert.match(source, /const storedRecord = \(store\) => \(store\.fresh\s*\? \{ \.\.\.store\.record, \[TOOL_WORKSPACE_FRESH_FIELD\]: \[\.\.\.store\.fresh\] \}\s*: store\.record\);/);
  assert.match(source, /writeQuestionDraft\(key, storedRecord\(store\), \{ edit: edit \|\| coalescedEdit \}\)/);
  assert.match(source, /store\.pendingEdit = store\.pendingEdit === true \|\| edit;/);
  assert.match(source, /const edit = store\.pendingEdit === true;[\s\S]*?writeQuestionDraft\(store\.key, storedRecord\(store\), \{ edit \}\)/);
  assert.match(source, /stampToolDraftSubmission[\s\S]*?writeQuestionDraft\(key, storedRecord\(store\), \{ edit: true \}\)/);
});

test('a composed question\'s step reports an edit only when the student touched the page after the step appeared', () => {
  const source = stripComments(read('src/platform/workflow/WorkflowRunner.jsx'));
  const body = source.slice(source.indexOf('function StageBody('), source.indexOf('const delegate = DELEGATES[stage.kind];'));
  assert.match(body, /const \[inputMark\] = useState\(studentInputMark\);/);
  assert.match(body, /const onChange = \(next\) => onReport\(next, \{ edit: studentInputSince\(inputMark\) \}\);/);
  assert.match(source, /onReport=\{\(value, options\) => setResponse\(stage\.id, [\s\S]*?, options\)\}/);
  assert.match(source, /const setResponse = useCallback\(\(stageId, value, options\) => \{[\s\S]*?setResponses\(\(current\) => \{[\s\S]*?\}, options\);/);
});

test('App tells the sync what the server holds, and reads again when the device is back', () => {
  const app = stripComments(read('src/App.jsx'));
  const effect = app.slice(app.indexOf('const sync = createWorkspaceDraftSync({'), app.indexOf('sync.stop();'));
  assert.match(effect, /const entries = readWorkspaceDraftEntries\(stored\);[\s\S]*?restoreQuestionDrafts\(restorable\)[\s\S]*?sync\.noteServerCopy\(entries\);/);
  assert.doesNotMatch(effect, /if \(cancelled \|\| !stored\) return;/, 'no server document is still an answer: the server holds nothing');
  assert.match(effect, /window\.addEventListener\('online', readServerCopy\);/);
  assert.match(effect, /window\.removeEventListener\('online', readServerCopy\);/);
  assert.match(effect, /Date\.now\(\) - hiddenAt >= WORKSPACE_DRAFT_REREAD_AFTER_HIDDEN_MS\) readServerCopy\(\);/);
  assert.match(effect, /if \(cancelled \|\| reading\) return;/, 'one read at a time');
});
