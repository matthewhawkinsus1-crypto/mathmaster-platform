/*
 * THE IMPORT CHECK SAYS WHAT REVIEW WILL SAY FOR AN HONORS CLASS.
 *
 * scripts/check-teacher-import.mjs used to run only the standard Pre-Flight,
 * so Algebra II Honors — Dividing Polynomials was reported "valid, 0 errors,
 * 0 warnings" and then blocked the first time a teacher selected an Honors
 * class. It now also runs the Honors check for a file whose title, folder or
 * name says Honors (any file with --honors) and exits 1 when Review would
 * block it. These pin that: the verdict is Review's own blocker, a short
 * checkpoint never asks the audited bank, and the command line prints the
 * verdict and fails on it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { HONORS_AREA_HINTS, HONORS_AREA_LABELS, isHonorsImport, reviewImportForHonors } from '../../scripts/lib/honorsImportReview.mjs';
import { HONORS_DEPTH_AREAS } from '../../src/platform/rigor/courseRigor.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const LESSON = 'teacher-import-jsons/algebra2-honors-module2/L2_Dividing_Polynomials.json';
const REGULAR = 'teacher-import-jsons/algebra2-polynomials-radicals/2_Remainder_and_Factor_Theorems.json';
const lessonText = () => fs.readFileSync(path.join(ROOT, LESSON), 'utf8');
// The lesson as first written, before Exercise 32 was headed MODELING.
const asFirstWritten = () => {
  const text = lessonText().replace('"prompt": "MODELING (Exercise 32).', '"prompt": "APPLY MATH (Exercise 32).');
  assert.notEqual(text, lessonText(), 'the textbook heading is back');
  return text;
};

test('an import is an Honors file when its title, folder or name says so', () => {
  assert.equal(isHonorsImport({ filePath: 'teacher-import-jsons/algebra2-honors-module2/L2.json' }), true);
  assert.equal(isHonorsImport({ filePath: 'teacher-import-jsons/x/1_Factoring_Polynomials_Honors.json' }), true);
  assert.equal(isHonorsImport({ filePath: 'lesson.json', title: 'Algebra II Honors — Dividing Polynomials' }), true);
  assert.equal(isHonorsImport({ filePath: REGULAR, title: 'Remainder & Factor Theorems' }), false);
  assert.equal(isHonorsImport(), false);
});

test('the check names, explains and lists evidence for every depth area the rule has', () => {
  assert.deepEqual(Object.keys(HONORS_AREA_LABELS), [...HONORS_DEPTH_AREAS], 'one label per area, in the rule\'s order');
  ['coreTeks', ...HONORS_DEPTH_AREAS].forEach((key) => assert.ok(HONORS_AREA_HINTS[key], `a hint for ${key}`));
});

test("the verdict is Review's: its blocker, what counted for each depth area, and how to supply what is missing", () => {
  const verdict = reviewImportForHonors(compileTeacherImport(asFirstWritten()).model);
  assert.equal(verdict.ready, false);
  assert.equal(verdict.blockers.length, 1, verdict.blockers.join('\n'));
  assert.match(verdict.blockers[0], /^An Honors class is selected\. Honors needs 3 of the 4 depth areas, .* Add one of: multiple representations or modeling \/ application\.$/);
  assert.equal(verdict.status, 'ready', 'its audited CCMR Practice was found, so depth is the only gap');
  assert.deepEqual(verdict.evidence.justification, ['dp-pr-11']);
  assert.deepEqual(verdict.evidence.modelingApplication, []);
  assert.deepEqual(verdict.hints, [HONORS_AREA_HINTS.multipleRepresentations, HONORS_AREA_HINTS.modelingApplication]);

  const fixed = reviewImportForHonors(compileTeacherImport(lessonText()).model);
  assert.equal(fixed.ready, true, fixed.blockers.join('\n'));
  assert.deepEqual(fixed.evidence.modelingApplication, ['dp-pr-8']);
  assert.deepEqual(fixed.hints, []);
});

test('a short Warm-Up or DOL is judged without the audited bank, as Review judges it', () => {
  const raw = JSON.parse(lessonText());
  raw.sections = raw.sections.filter((section) => section.role === 'dol');
  const { model } = compileTeacherImport(JSON.stringify(raw));
  assert.equal(model.isValid, true, model.errors.join('\n'));
  const bank = { replaceDirectCcmrQuestionsWithAuditedBank() { throw new Error('a narrow checkpoint asked the audited bank'); } };
  const verdict = reviewImportForHonors(model, { bank });
  assert.equal(verdict.narrowCheckpoint, true);
  assert.equal(verdict.status, 'notRequired');
  assert.equal(verdict.ready, true, verdict.blockers.join('\n'));
});

test('a file that fails the standard Pre-Flight has no Honors verdict until it passes', () => {
  assert.equal(reviewImportForHonors({ isValid: false, errors: ['broken'] }), null);
  assert.equal(reviewImportForHonors(null), null);
});

/* ------------------------------------------------------- the command line */

const check = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/check-teacher-import.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
// One file's part of the output: from its "== <file>" line to the next.
const partFor = (stdout, file) => stdout.split(/\n== /).find((part) => part.startsWith(file)) || '';

test('the command line finds an Honors file by its title alone, prints why Review would block it, and exits 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-import-check-'));
  const file = path.join(dir, 'lesson.json');
  fs.writeFileSync(file, asFirstWritten());
  try {
    const run = check(file, REGULAR);
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const blocked = partFor(run.stdout, file);
    assert.match(blocked, /^honors: BLOCKED for an Honors class · depth 2 of 4 · audited CCMR Practice 2 of 2$/m);
    assert.match(blocked, /^ {2}HONORS {2}An Honors class is selected\. Honors needs 3 of the 4 depth areas/m);
    assert.match(blocked, /^ {2}how {5}Mark a real-world question "taskType": "modeling" or "application"/m);
    assert.match(blocked, /^ {2}explanation \/ justification\s+dp-pr-11$/m);
    assert.match(blocked, /^ {2}modeling \/ application\s+—$/m);
    // A regular lesson is checked as before: no Honors line.
    const regular = partFor(run.stdout, REGULAR);
    assert.match(regular, /^preflight: valid/m);
    assert.doesNotMatch(regular, /^honors:/m);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the command line passes an Honors file Review accepts, and --honors checks any file', () => {
  const ready = check(LESSON);
  assert.equal(ready.status, 0, ready.stdout + ready.stderr);
  assert.match(ready.stdout, /^honors: ready for an Honors class · depth 3 of 4 · audited CCMR Practice 2 of 2$/m);

  const forced = check(REGULAR, '--honors');
  const verdict = forced.stdout.match(/^honors: (ready|BLOCKED) for an Honors class/m);
  assert.ok(verdict, forced.stdout + forced.stderr);
  assert.equal(forced.status, verdict[1] === 'BLOCKED' ? 1 : 0, 'the exit code follows the verdict');
});
