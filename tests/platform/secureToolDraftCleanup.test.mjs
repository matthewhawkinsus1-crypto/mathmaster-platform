/*
 * RECORDED AND PREVIEWED CONSTRUCTIONS DO NOT COME BACK FROM THE TOOL CACHE.
 *
 * A registry tool keeps a parsed copy of its workspace in memory
 * (usePersistentToolState's cache) as well as in storage. Clearing storage
 * alone was not enough:
 *   - after a secure item is recorded, QuestionEngine stamps the submitted work
 *     back to storage FROM THAT CACHE — so every recorded Graphing, Systems,
 *     Number Line, Mapping or Data Modeling construction reappeared on the
 *     device the moment the container removed it;
 *   - a teacher's preview reuses its draft keys (draw 1, item 1), so a cached
 *     record showed the teacher's earlier construction on a fresh Retest item.
 * forgetToolDraftFamily drops the cache for a whole family; the container and
 * the preview call it wherever they clear storage.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region } from './helpers/sourceContract.mjs';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}
const storage = new MemoryStorage();
globalThis.window = { localStorage: storage };

const drafts = await import('../../src/questionDraftStorage.js');
const tools = await import('../../src/tools/shared/usePersistentToolState.js');
const { secureItemDraftKey } = await import('../../functions/shared/secureItemDraftKey.mjs');

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const keysUnder = (prefix) => [...storage.values.keys()].filter((key) => key === prefix || key.startsWith(`${prefix}:`));

const SESSION = 'session-1';
const family = `mm-secure-work:exam:${SESSION}`;
const itemKey = (id) => secureItemDraftKey({ surface: 'exam', sessionId: SESSION, questionInstanceId: id });

/** A tool that has worked on the item: its construction stored and cached. */
const workOn = (key, points) => {
  drafts.writeQuestionDraft(tools.toolDraftKey(key), { points }, { edit: true });
  assert.deepEqual(tools.readToolDraftRecord(key).points, points, 'the tool has read (and cached) its workspace');
};

test('recording an item: storage cleared, cache forgotten — the engine\'s stamp writes nothing back', () => {
  const item = itemKey('q1');
  workOn(item, [[1, 2], [3, 4]]);
  // What SecureExamContainer.submitResponse does once the server recorded it…
  drafts.removeQuestionDraftFamily(item);
  tools.forgetToolDraftFamily(item);
  // …and what QuestionEngine does when the submit returns.
  tools.stampToolDraftSubmission(item);
  assert.deepEqual(keysUnder(item), [], 'no construction is left on the device');
});

test('a session\'s whole family is forgotten at once (finishing a Test, a preview\'s new draw)', () => {
  workOn(itemKey('q2'), [[0, 1]]);
  workOn(itemKey('q3'), [[2, 5]]);
  drafts.removeQuestionDraftFamily(family);
  assert.equal(tools.forgetToolDraftFamily(family), 2, 'both items\' cached workspaces');
  tools.stampToolDraftSubmission(itemKey('q2'));
  tools.stampToolDraftSubmission(itemKey('q3'));
  assert.deepEqual(keysUnder(family), []);
  // A fresh mount under the same key starts empty, not from the cache.
  assert.equal(tools.readToolDraftRecord(itemKey('q2')).points, undefined);
});

test('a family prefix never reaches past its own boundary', () => {
  workOn(itemKey('q4'), [[9, 9]]);
  const other = secureItemDraftKey({ surface: 'exam', sessionId: `${SESSION}0`, questionInstanceId: 'q4' });
  workOn(other, [[8, 8]]);
  tools.forgetToolDraftFamily(family);
  // `session-10` is not inside `session-1`.
  assert.deepEqual(tools.readToolDraftRecord(other).points, [[8, 8]]);
});

test('the secure container and the preview forget the cache wherever they clear storage', () => {
  const container = read('src/components/assessment/SecureExamContainer.jsx');
  const clear = region(container, 'const clearLocalDrafts = (', 'const SAVE_LABEL', 'session cleanup');
  assert.match(clear, /removeQuestionDraftFamily\(sessionDraftFamily\(examSessionId\)\);\s*forgetToolDraftFamily\(sessionDraftFamily\(examSessionId\)\);/);
  // Nothing is recorded question by question any more, so that is the only
  // place the container removes stored drafts — and it forgets the cache too.
  assert.equal(container.split('removeQuestionDraftFamily(').length - 1, 1, 'every removal of stored drafts goes through clearLocalDrafts');
  const preview = read('src/components/teacher/TestCyclePreview.jsx');
  const previewClear = region(preview, 'const clearPreviewDrafts = (', 'const DEVICE_WORDS', 'preview clear');
  assert.match(previewClear, /removeQuestionDraftFamily\(family\);[\s\S]*forgetToolDraftFamily\(family\)/);
});
