/*
 * EVERY HONORS IMPORT FILE CAN BE ASSIGNED TO AN HONORS CLASS AS WRITTEN.
 *
 * Algebra II Honors — Dividing Polynomials passed the import check ("valid, 0
 * errors, 0 warnings") and its own tests, then was blocked the first time a
 * teacher selected an Honors class in Review. Those checks ran the standard
 * Pre-Flight only, and whether a lesson's own test also asserted the Honors
 * contract was up to its author.
 *
 * This asks, for every file in teacher-import-jsons/ whose title, folder or
 * name says Honors, what Review will say when an Honors class is selected
 * (scripts/lib/honorsImportReview.mjs: the Honors version with its audited
 * CCMR Practice, judged by Review's own blocker code, the same verdict
 * check-teacher-import.mjs prints), and fails when Review would block it.
 *
 * KNOWN_BLOCKED is the baseline: the files that were already blocked when this
 * test was written. As in the other ratchets here, a blocked file the baseline
 * has never seen fails, and a listed file that now passes fails until it is
 * removed, so the list only shrinks. Do not add a file to it to make this
 * test pass. Fix the file: `node scripts/check-teacher-import.mjs <file>`
 * says what is missing and how to supply it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { isHonorsImport, reviewImportForHonors } from '../../scripts/lib/honorsImportReview.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const IMPORTS = path.resolve(here, '../../teacher-import-jsons');

// Blocked for an Honors class before this test existed (2026-11-04). Each is
// short of the Honors depth rule: 3 of the 4 depth areas, one of them
// higher-order reasoning.
const KNOWN_BLOCKED = Object.freeze({
  'algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json': 'depth 1 of 4: add two of multiple representations, justification, modeling / application',
  'algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json': 'depth 1 of 4: add two of multiple representations, justification, modeling / application',
  'algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json': 'depth 1 of 4: add two of multiple representations, justification, modeling / application',
  'algebra2-honors-module1/L2_Day2_Transformations.json': 'depth 2 of 4: add multiple representations or justification',
  'algebra2-honors-module1/L3_Inverse_Linear_Functions.json': 'depth 1 of 4: add two of multiple representations, justification, modeling / application',
  'algebra2-honors-module1/L4_Operations_on_Functions_Composition.json': 'depth 2 of 4: add multiple representations or justification',
  'algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json': 'depth 1 of 4, and no audited CCMR Practice item passes for it',
});

const jsonFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return jsonFiles(full);
  return entry.name.endsWith('.json') ? [full] : [];
});

// Parsing is enough to read a title; only Honors files are compiled.
const HONORS_FILES = jsonFiles(IMPORTS).sort().flatMap((file) => {
  const relative = path.relative(IMPORTS, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  const title = parseAssignmentBlueprintText(text).assignmentV5?.assignment?.title || '';
  return isHonorsImport({ filePath: relative, title }) ? [{ relative, text }] : [];
});

test('the Honors files are found: the lesson that was blocked, a whole Honors folder, and every known-blocked file', () => {
  const found = new Set(HONORS_FILES.map((entry) => entry.relative));
  // Each named file is found by a different route: a folder, a file name, a title.
  [
    'algebra2-honors-module2/L2_Dividing_Polynomials.json',
    'algebra2-polynomials-radicals-honors/2_Remainder_and_Factor_Theorems_Honors.json',
    'algebra1-module3/T1_L1_Solving_Linear_Equations_Honors.json',
    ...Object.keys(KNOWN_BLOCKED),
  ].forEach((relative) => assert.ok(found.has(relative), `${relative} is checked as an Honors file`));
  // The regular lesson of the same name is not an Honors file.
  assert.equal(found.has('algebra2-polynomials-radicals/2_Remainder_and_Factor_Theorems.json'), false);
});

for (const { relative, text } of HONORS_FILES) {
  const known = KNOWN_BLOCKED[relative];
  test(`${relative}: ${known ? 'still blocked for an Honors class (known)' : 'can be assigned to an Honors class as written'}`, () => {
    const { model } = compileTeacherImport(text);
    assert.equal(model.isValid, true, `the standard Pre-Flight comes first:\n${model.errors.join('\n')}`);
    const verdict = reviewImportForHonors(model);
    if (known) {
      assert.equal(verdict.ready, false, `${relative} now passes for an Honors class. Remove it from KNOWN_BLOCKED (it was: ${known}).`);
      return;
    }
    assert.deepEqual(verdict.blockers, [], [
      `Review would block ${relative} for an Honors class:`,
      ...verdict.blockers.map((message) => `  ${message}`),
      ...verdict.hints.map((hint) => `  how: ${hint}`),
      `Run: node scripts/check-teacher-import.mjs teacher-import-jsons/${relative}`,
    ].join('\n'));
    assert.equal(verdict.ready, true);
  });
}
