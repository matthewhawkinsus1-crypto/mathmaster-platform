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
  accountChangeClearsDraftProblems,
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
import { draftHealthAccountEffect, replayAccounts } from './helpers/draftHealthAccountEffect.mjs';

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

test('a shared Chromebook: the next student starts clean, and a reload keeps this student\'s notice', () => {
  assert.equal(accountChangeClearsDraftProblems('stu-a', 'stu-b'), true, 'another student signs in');
  assert.equal(accountChangeClearsDraftProblems('stu-a', null), true, 'sign-out');
  assert.equal(accountChangeClearsDraftProblems('stu-a', undefined), true, 'signed out (no id)');
  assert.equal(accountChangeClearsDraftProblems(null, 'stu-a'), false, 'the account loading after a reload');
  assert.equal(accountChangeClearsDraftProblems('stu-a', 'stu-a'), false, 'the same student');
  assert.equal(accountChangeClearsDraftProblems(null, null), false);
});

test('App.jsx shows the notice on the assignment screen, for this student and assignment', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /import \{[^}]*\bdescribeDraftSaveProblems\b[^}]*\bdraftSaveProblemsFor\b[^}]*\bsubscribeDraftSaveHealth\b[^}]*\} from '\.\/platform\/persistence\/draftSaveHealth\.js';/,
    'imported next to its use');
  assert.match(app, /useEffect\(\(\) => subscribeDraftSaveHealth\(\(\) => setDraftSaveHealthVersion\(\(value\) => value \+ 1\)\), \[\]\);/);
  // The problem is read once per render (re-read on every health change) and
  // shared by the notice and the save line (saveLineIsAboutDrafts, below).
  const problem = region(app, 'const studentDraftSaveProblem = ', ';\n');
  assert.match(problem, /= draftSaveHealthVersion >= 0\s*\? describeDraftSaveProblems\(draftSaveProblemsFor\(\{ studentId: user\?\.id, assignmentId: activeAssignmentId \}\)\)\s*: null$/);
  const notice = region(app, '{!preview && studentDraftSaveProblem && (', '</p>');
  assert.match(notice, /<p role="alert" data-draft-save-problem=\{studentDraftSaveProblem\.kind\}[^>]*>\s*\{studentDraftSaveProblem\.text\}\s*$/);
  // Not gated on the outbox status: a draft can fail while nothing is queued.
  assert.doesNotMatch(notice, /studentPersistenceStatus/);
  assert.doesNotMatch(problem, /studentPersistenceStatus/);
  // A shared Chromebook's next student starts clean, and a reload of the same
  // student keeps it (pass 3, wave 7): the effect is run, not only read.
  const { rule, run } = draftHealthAccountEffect(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(rule, /useEffect\(\(\) => \{/, 'an effect body, not a cleanup');
  assert.doesNotMatch(app, /useEffect\(\(\) => \(\) => \{ clearDraftSaveProblems\(\); \}, \[user\?\.id\]\)/, 'the old cleanup is gone');
  const ref = { current: null };
  assert.deepEqual(replayAccounts(run, [null, 'stu-a'], ref), [0, 0], 'null → A: a reload keeps the notice');
  assert.deepEqual(replayAccounts(run, ['stu-a'], ref), [0], 'A → A: a re-render');
  assert.deepEqual(replayAccounts(run, ['stu-b'], ref), [1], 'A → B: another student');
  assert.deepEqual(replayAccounts(run, [null], ref), [1], 'B → signed out');
  assert.deepEqual(replayAccounts(run, ['stu-b'], ref), [0], 'null → B after that sign-out');
  assert.deepEqual(replayAccounts(run, ['stu-a']), [0], 'a fresh page: null → A');
  assert.match(app, /^import \{[^}]*\baccountChangeClearsDraftProblems\b[^}]*\} from '\.\/platform\/persistence\/draftSaveHealth\.js';$/m);
});

/*
 * BATCH 3 INTO PASS 3: THE SAVE LINES AGREE WITH THE NOTICE.
 *
 * Session B's line under a question says "Draft saved on this device" about
 * the student's progress in the device queue; Home says "All work saved".
 * Beside the notice above ("Your work is not being saved on this device") a
 * student read both at once. The notice is the honest one: while it stands, a
 * line about drafts is not shown, and Home says the work needs attention.
 */
test('while a draft is not being saved, no line says drafts are saved', async () => {
  const { saveLineIsAboutDrafts, describeSaveStatus, initialSaveSubject, nextSaveSubject } = await import('../../src/platform/student/saveStatusModel.js');
  const draft = initialSaveSubject();
  const answer = nextSaveSubject(draft, { type: 'answer-sent' });
  const recordedAnswer = nextSaveSubject(answer, { type: 'status', status: 'durable' });
  for (const status of ['capturing', 'queued', 'syncing', 'durable', 'submitted']) {
    assert.equal(saveLineIsAboutDrafts({ persistenceStatus: status, subject: draft }), true, `${status}: a draft line`);
  }
  for (const status of ['capturing', 'queued', 'syncing']) {
    assert.equal(saveLineIsAboutDrafts({ persistenceStatus: status, subject: answer }), false, `${status}: an answer on its way stays`);
  }
  for (const status of ['durable', 'submitted']) {
    assert.equal(saveLineIsAboutDrafts({ persistenceStatus: status, subject: recordedAnswer }), false, `${status}: "Answer recorded" stays`);
  }
  assert.equal(saveLineIsAboutDrafts({ persistenceStatus: 'queued', subject: draft, pendingGradeCount: 1 }), false, 'answers still owed are answers');
  for (const status of ['idle', 'offline', 'needs-review', 'rejected', 'volatile']) {
    assert.equal(saveLineIsAboutDrafts({ persistenceStatus: status, subject: draft }), false, `${status} asks something of the student and stays`);
  }

  // Home: never "All work saved" while a draft is not being saved.
  assert.equal(describeSaveStatus({ persistenceStatus: 'submitted', draftsUnsaved: true }).tone, 'attention');
  assert.equal(describeSaveStatus({ persistenceStatus: 'idle', draftsUnsaved: true }).tone, 'attention');
  assert.equal(describeSaveStatus({ persistenceStatus: 'offline', draftsUnsaved: true }).tone, 'attention', 'not "saved on this device" either');
  assert.match(describeSaveStatus({ persistenceStatus: 'rejected', draftsUnsaved: true }).text, /assignment has closed/, 'the closed assignment keeps its own words');
  assert.equal(describeSaveStatus({ persistenceStatus: 'submitted' }).tone, 'saved');
});

test('Home reads one student\'s problems on any assignment', async () => {
  const health = await import('../../src/platform/persistence/draftSaveHealth.js');
  health.clearDraftSaveProblems();
  health.reportDraftSaveProblem(health.DRAFT_SAVE_PROBLEM.DEVICE_FULL, 'mathmaster:draft:v2::s1:a2:q:0');
  assert.equal(health.draftSaveProblemsForStudent('s1')['device-full'], 1);
  health.reportDraftSaveProblem(health.DRAFT_SAVE_PROBLEM.BACKUP_FULL, 'mathmaster:draft:v2::s10:a1:q:0');
  assert.equal(health.draftSaveProblemsForStudent('s1')['backup-full'], 0, 'student s10 is not student s1');
  assert.equal(health.draftSaveProblemsForStudent('s10')['backup-full'], 1);
  assert.equal(health.draftSaveProblemsForStudent('s2')['device-full'], 0);
  assert.equal(health.draftSaveProblemsForStudent('')['device-full'], 0);
  health.clearDraftSaveProblems();
});

test('App: the save line gives way to the notice, and Home is told', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /import \{[^}]*\bsaveLineIsAboutDrafts\b[^}]*\} from '\.\/platform\/student\/saveStatusModel\.js';/);
  assert.match(app, /import \{[^}]*\bdraftSaveProblemsForStudent\b[^}]*\} from '\.\/platform\/persistence\/draftSaveHealth\.js';/);
  const shown = region(app, 'const studentSaveLineShown = ', ';\n');
  assert.match(shown, /^const studentSaveLineShown = studentPersistenceStatus !== 'idle'\s*&& !\(studentDraftSaveProblem && saveLineIsAboutDrafts\(\{ persistenceStatus: studentPersistenceStatus, subject: studentSaveSubject, pendingGradeCount: studentPendingGradeCount \}\)\)$/);
  assert.match(app, /\{!preview && studentSaveLineShown && \(\s*<p data-save-line=""/);
  // Home and the pack-up line read one save status (NAV-24 review B2).
  assert.match(app, /saveStatus=\{studentSaveStatusNow\(\)\}/);
  const home = region(app, 'const studentSaveStatusNow = () => describeSaveStatus({', '});');
  assert.match(home, /draftsUnsaved: draftSaveHealthVersion >= 0 && Boolean\(describeDraftSaveProblems\(draftSaveProblemsForStudent\(user\?\.id\)\)\)/);
});
