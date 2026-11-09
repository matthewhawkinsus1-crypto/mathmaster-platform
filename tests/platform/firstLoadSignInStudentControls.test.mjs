// THE STUDENTS'-CONTROLS MIGRATION IS NOT ON THE SIGN-IN PATH (PF01, the
// sign-in path).
//
// authService.js is the sign-in screen's own module (the sign-ins, the login
// hints, the error sentences). Its teacherAdmin table also ran the root
// administrator's students'-controls migration, a paged pass, and importing
// that pass put src/platform/admin/studentControlsMigration.js and what it
// reads (the override report combiner, the retirement gate, the school-year
// calendars, 7.9 KB gzip in six files) in front of every sign-in screen.
//
// teacherAdmin now offers the pass's two callables, and the administrator's
// card, which imports the pass anyway, runs it with them: the same requests
// in the same order and the same report, started in the same click with no
// load in between (privateControlsJourneys.mjs P5 reads the stage right after
// the click that starts a pass).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { chainTo, repo, signInGraph } from './helpers/firstLoadGraph.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

register('./helpers/authServiceIsolation.mjs', import.meta.url);
const { teacherAdmin } = await import('../../src/auth/authService.js');
const { runStudentControlsMigrationPass } = await import('../../src/platform/admin/studentControlsMigration.js');

const file = (name) => path.join(repo, name);
const read = (name) => readFileSync(file(name), 'utf8');
const signIn = signInGraph();

test('the walker reaches authService.js on the sign-in path', () => {
  assert.ok(signIn.has(file('src/auth/authService.js')), 'authService.js is no longer on the sign-in path: the walk or the wiring changed, so the absences below prove nothing');
});

test('the migration pass and the modules under it are not on the sign-in path', () => {
  for (const name of [
    'src/platform/admin/studentControlsMigration.js',
    'functions/shared/overrideRetirementGate.mjs',
    'functions/shared/studentAssignmentOverrides.mjs',
    'src/curriculum/calendars/schoolYear2026-2027.js',
    'src/platform/path/curriculumCalendar.js',
  ]) {
    const key = file(name);
    // A module that was renamed or deleted is in no graph at all: say so.
    assert.ok(existsSync(key), `${name} no longer exists: point this test at the module that took its place`);
    assert.ok(!signIn.has(key), `${name} is on the sign-in path: ${signIn.has(key) ? chainTo(signIn, key) : ''}`);
  }
});

test('authService holds the callables only: it never imports or loads the pass', () => {
  assert.doesNotMatch(executableSource(read('src/auth/authService.js')), /studentControlsMigration/);
  assert.equal(typeof teacherAdmin.migrateStudentAssignmentOverrides, 'function');
  assert.equal(typeof teacherAdmin.readStudentControlsMigrationProgress, 'function');
});

test('the card runs the pass with those two callables, passing what it was asked', () => {
  const card = executableSource(read('src/components/admin/StudentControlsMigrationCard.jsx'));
  assert.match(card, /^import \{[^}]*\brunStudentControlsMigrationPass\b[^}]*\} from '\.\.\/\.\.\/platform\/admin\/studentControlsMigration\.js';$/m);
  const pass = region(card, 'const runPass = (key, { mode, dryRun, confirm = \'\' }, setReport, describe) => run(key, async () => {', '}, describe);', 'the card\'s pass');
  const call = pass.match(/const report = await runStudentControlsMigrationPass\(\{([\s\S]*?)\}\);/);
  assert.ok(call, 'the card awaits the pass itself, started in the click');
  const fields = call[1].split(',').map((field) => field.trim()).filter(Boolean).sort();
  assert.deepEqual(fields, [
    'confirm',
    'dryRun',
    'migrate: teacherAdmin.migrateStudentAssignmentOverrides',
    'mode',
    'onPage: setReport',
    'readProgress: teacherAdmin.readStudentControlsMigrationProgress',
  ]);
});

// The behaviour, through the real authService with its callables answered here
// (helpers/authServiceIsolation.mjs): the pass composed as the card composes
// it sends the requests teacherAdmin.runStudentControlsMigration sent before.
const progress = { strip: { done: false, cursor: 'student-0420' } };
const pages = {
  'student-0420': { mode: 'strip', dryRun: false, startAfter: 'student-0420', nextCursor: 'student-0840', copied: 12, failures: [] },
  'student-0840': { mode: 'strip', dryRun: false, startAfter: 'student-0840', nextCursor: null, done: true, copied: 3, failures: [], pass: 'pass-7' },
  '': { mode: 'backfill', dryRun: true, startAfter: null, nextCursor: null, done: true, copied: 15, failures: [], pass: 'dry-1' },
};
const answer = (name, data) => {
  if (name === 'setAssignmentOverrideStorage' && data?.action === 'status') return { migration: progress };
  if (name === 'migrateStudentAssignmentOverrides') return pages[data?.startAfter || ''];
  throw new Error(`unexpected callable ${name}`);
};
const asTheCardDoes = ({ mode, dryRun, confirm = '', onPage = null }) => runStudentControlsMigrationPass({
  mode, dryRun, confirm, onPage,
  migrate: teacherAdmin.migrateStudentAssignmentOverrides,
  readProgress: teacherAdmin.readStudentControlsMigrationProgress,
});
const callsDuring = async (run) => {
  globalThis.__authServiceCalls = [];
  globalThis.__authServiceAnswer = answer;
  const result = await run();
  return { result, calls: globalThis.__authServiceCalls };
};

test('a real strip resumes from the server\'s cursor, with the typed confirmation, and reports each page', async () => {
  const seen = [];
  const { result, calls } = await callsDuring(() => asTheCardDoes({
    mode: 'strip', dryRun: false, confirm: 'STRIP SHARED CONTROLS', onPage: (report) => seen.push(report.pages),
  }));
  assert.deepEqual(calls, [
    { name: 'setAssignmentOverrideStorage', data: { action: 'status' } },
    { name: 'migrateStudentAssignmentOverrides', data: { mode: 'strip', dryRun: false, confirm: 'STRIP SHARED CONTROLS', startAfter: 'student-0420' } },
    { name: 'migrateStudentAssignmentOverrides', data: { mode: 'strip', dryRun: false, confirm: 'STRIP SHARED CONTROLS', startAfter: 'student-0840' } },
  ]);
  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.resumedFrom, 'student-0420');
  assert.equal(result.pass, 'pass-7');
  assert.equal(result.copied, 15);
  // The same report as the callables' answers give the pass directly: the
  // callables return each answer's data, and progress is the status's migration.
  const direct = await runStudentControlsMigrationPass({
    mode: 'strip', dryRun: false, confirm: 'STRIP SHARED CONTROLS',
    migrate: async (request) => answer('migrateStudentAssignmentOverrides', request),
    readProgress: async () => progress,
  });
  assert.deepEqual(result, direct);
});

test('a dry run reads from the beginning, reads no progress and sends no confirmation', async () => {
  const { result, calls } = await callsDuring(() => asTheCardDoes({ mode: 'backfill', dryRun: true }));
  assert.deepEqual(calls, [{ name: 'migrateStudentAssignmentOverrides', data: { mode: 'backfill', dryRun: true } }]);
  assert.equal(result.pass, 'dry-1');
  assert.equal(result.resumedFrom, null);
});
