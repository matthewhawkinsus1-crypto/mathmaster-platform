/*
 * A SAVE THAT FAILS IS NEVER SILENT (Batch 3).
 *
 * Three ways unfinished work stopped being saved with nothing but a console
 * line (PR #458, "Not in this PR"): local storage full, the server backup's
 * guard refusing a record, and the backup document at its caps (120 drafts,
 * 400 KB), where the oldest drafts silently stop reaching the server. The
 * guards stay exactly as strict (draftSyncDiagnostics still names the field
 * for a developer); the student now reads one plain sentence saying where the
 * work is and what to do, until it is saved again (draftSaveHealth.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  DRAFT_SAVE_PROBLEM,
  DRAFT_SAVE_PROBLEM_TEXT,
  clearDraftSaveProblems,
  currentDraftSaveProblems,
  describeDraftSaveProblems,
  draftSaveProblemsFor,
  reportDraftSaveProblem,
} from '../../src/platform/persistence/draftSaveHealth.js';
import {
  MAX_WORKSPACE_DRAFT_ENTRIES,
  buildWorkspaceDraftPatch,
  mergeWorkspaceDraftDocument,
  mergeWorkspaceDraftDocumentReport,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const STUDENT = 'S-save';
const ASSIGNMENT = 'A-save';
const key = (question, suffix = 'literal') => `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:${question}:0:student:${suffix}`;
const mine = () => draftSaveProblemsFor({ studentId: STUDENT, assignmentId: ASSIGNMENT });

class MemoryStorage {
  constructor() { this.values = new Map(); this.full = false; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(name) { return this.values.has(name) ? this.values.get(name) : null; }
  setItem(name, value) {
    if (this.full) throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
    this.values.set(String(name), String(value));
  }
  removeItem(name) { this.values.delete(String(name)); }
}

let instance = 0;
const storageModule = async (storage) => {
  globalThis.window = { localStorage: storage };
  instance += 1;
  return import(`../../src/questionDraftStorage.js?save=${instance}`);
};

const quietly = async (run) => {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try { return await run(); } finally { console.warn = warn; console.error = error; }
};

test('the student is told plainly, the worst first, and only about this assignment', () => {
  clearDraftSaveProblems();
  assert.equal(describeDraftSaveProblems(mine()), null, 'nothing wrong: nothing shown');
  reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.BACKUP_FULL, key(1));
  assert.equal(describeDraftSaveProblems(mine()).kind, DRAFT_SAVE_PROBLEM.BACKUP_FULL);
  reportDraftSaveProblem(DRAFT_SAVE_PROBLEM.DEVICE_FULL, key(2));
  assert.deepEqual(describeDraftSaveProblems(mine()), { kind: DRAFT_SAVE_PROBLEM.DEVICE_FULL, text: DRAFT_SAVE_PROBLEM_TEXT[DRAFT_SAVE_PROBLEM.DEVICE_FULL] },
    'work this device does not hold comes first');
  assert.equal(describeDraftSaveProblems(draftSaveProblemsFor({ studentId: STUDENT, assignmentId: 'another' })), null);
  assert.equal(describeDraftSaveProblems(draftSaveProblemsFor({ studentId: 'someone-else', assignmentId: ASSIGNMENT })), null);
  for (const text of Object.values(DRAFT_SAVE_PROBLEM_TEXT)) {
    assert.doesNotMatch(text, /mathmaster:draft|isCorrect|forbidden|quota|localStorage/i, 'no key, field path or jargon');
    assert.match(text, /device/, 'it says where the work is');
  }
  clearDraftSaveProblems();
  assert.deepEqual(currentDraftSaveProblems(), { 'device-full': 0, 'backup-refused': 0, 'backup-full': 0 });
});

test('storage full: the draft write reports it, and the next save that lands clears it', async () => {
  clearDraftSaveProblems();
  const storage = new MemoryStorage();
  const drafts = await storageModule(storage);
  const offered = [];
  drafts.subscribeToQuestionDrafts((event) => offered.push(event.key));
  storage.full = true;
  const saved = await quietly(() => drafts.writeQuestionDraft(key(1), 'x=4', { edit: true }));
  assert.equal(saved, false);
  assert.deepEqual(offered, [key(1)], 'the background save is still offered the work');
  assert.equal(mine()[DRAFT_SAVE_PROBLEM.DEVICE_FULL], 1);
  assert.equal(describeDraftSaveProblems(mine()).kind, DRAFT_SAVE_PROBLEM.DEVICE_FULL);
  storage.full = false;
  assert.equal(drafts.writeQuestionDraft(key(1), 'x=4', { edit: true }), true);
  assert.equal(mine()[DRAFT_SAVE_PROBLEM.DEVICE_FULL], 0);
  assert.equal(describeDraftSaveProblems(mine()), null);
});

test('a record the backup refuses is reported, and cleared once that draft is accepted', async () => {
  clearDraftSaveProblems();
  const sync = createWorkspaceDraftSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, flush: () => {}, scheduler: { set: () => 1, clear: () => {} } });
  const board = key(3, 'work:board');
  await quietly(() => sync.record({ key: board, value: { cardChecks: { a: { isCorrect: true } } }, savedAt: 10, edit: true }));
  assert.equal(mine()[DRAFT_SAVE_PROBLEM.BACKUP_REFUSED], 1);
  assert.equal(describeDraftSaveProblems(mine()).kind, DRAFT_SAVE_PROBLEM.BACKUP_REFUSED);
  sync.record({ key: board, value: { slope: '2' }, savedAt: 20, edit: true });
  assert.equal(mine()[DRAFT_SAVE_PROBLEM.BACKUP_REFUSED], 0);
  // A draft that is simply out of scope (a preview) is not a refusal.
  sync.record({ key: `mathmaster:draft:v2::${STUDENT}:${ASSIGNMENT}:3:0:preview:literal`, value: 'x', savedAt: 30, edit: true });
  assert.equal(describeDraftSaveProblems(mine()), null);
});

test('past the caps the merge names what it left out, and the sync tells the student', async () => {
  clearDraftSaveProblems();
  const entries = Array.from({ length: MAX_WORKSPACE_DRAFT_ENTRIES + 3 }, (_, index) => ({ key: key(index), value: `answer ${index}`, savedAt: 1_000 + index, savedAtIsEdit: true }));
  const patch = buildWorkspaceDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries });
  const report = mergeWorkspaceDraftDocumentReport({ existing: null, patch });
  assert.deepEqual(report.droppedKeys.sort(), [key(0), key(1), key(2)].sort(), 'the oldest three no longer reach the server');
  assert.equal(report.document.entries.length, MAX_WORKSPACE_DRAFT_ENTRIES);
  assert.deepEqual(report.document, mergeWorkspaceDraftDocument({ existing: null, patch }), 'the stored document is unchanged by the report');
  assert.equal('droppedKeys' in report.document, false, 'and nothing about the report is stored');

  let answer = { written: true, droppedKeys: report.droppedKeys };
  const sync = createWorkspaceDraftSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, flush: async () => answer, scheduler: { set: () => 1, clear: () => {} } });
  sync.record({ key: key(200), value: 'new', savedAt: 5_000, edit: true });
  await sync.flushNow();
  assert.equal(mine()[DRAFT_SAVE_PROBLEM.BACKUP_FULL], 3);
  assert.equal(describeDraftSaveProblems(mine()).kind, DRAFT_SAVE_PROBLEM.BACKUP_FULL);
  // A later save that keeps everything (older drafts retired) clears it.
  answer = { written: true, droppedKeys: [] };
  sync.record({ key: key(201), value: 'newer', savedAt: 6_000, edit: true });
  await sync.flushNow();
  assert.equal(describeDraftSaveProblems(mine()), null);
});

test('the store hands back what the caps left out', () => {
  const store = executableSource(readFileSync(new URL('../../src/platform/persistence/workspaceDraftStore.js', import.meta.url), 'utf8'));
  const writer = region(store, 'export const writeWorkspaceDraft', '\n};');
  assert.match(writer, /droppedKeys = report\.droppedKeys;/);
  assert.match(writer, /return \{ written: true, droppedKeys \};/);
  // App passes the store's answer through to the sync.
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(region(app, 'flush: async ({ document }) => {', '},'), /const result = await writeWorkspaceDraft\(document\);[\s\S]*return result;/);
});

test('App.jsx shows the notice on the assignment screen, for this student and assignment', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /import \{[^}]*\bdescribeDraftSaveProblems\b[^}]*\bdraftSaveProblemsFor\b[^}]*\bsubscribeDraftSaveHealth\b[^}]*\} from '\.\/platform\/persistence\/draftSaveHealth\.js';/,
    'imported next to its use');
  assert.match(app, /useEffect\(\(\) => subscribeDraftSaveHealth\(\(\) => setDraftSaveHealthVersion\(\(value\) => value \+ 1\)\), \[\]\);/);
  const notice = region(app, '{!preview && draftSaveHealthVersion >= 0 && (() => {', '})()}');
  assert.match(notice, /describeDraftSaveProblems\(draftSaveProblemsFor\(\{ studentId: user\?\.id, assignmentId: activeAssignmentId \}\)\)/);
  assert.match(notice, /<p role="alert" data-draft-save-problem=\{problem\.kind\}[^>]*>\s*\{problem\.text\}\s*<\/p>/);
  // Not gated on the outbox status: a draft can fail while nothing is queued.
  assert.doesNotMatch(notice, /studentPersistenceStatus/);
  assert.match(app, /useEffect\(\(\) => \(\) => \{ clearDraftSaveProblems\(\); \}, \[user\?\.id\]\);/, 'a shared Chromebook\'s next student starts clean');
});
