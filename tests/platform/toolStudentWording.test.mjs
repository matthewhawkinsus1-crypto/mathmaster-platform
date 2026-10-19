import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { executableSource, region } from './helpers/sourceContract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(repo, relative), 'utf8');
const jsxUnder = (relative) => readdirSync(path.join(repo, relative)).flatMap((entry) => {
  const child = path.join(relative, entry);
  if (statSync(path.join(repo, child)).isDirectory()) return jsxUnder(child);
  return entry.endsWith('.jsx') ? [child] : [];
});

/*
 * "WORKFLOW" IS OUR WORD, NOT THE STUDENT'S (platform quirks audit PQ-029).
 *
 * Regression Calculator's button said "Submit workflow" and its success line
 * "Workflow complete."; a composed question's Undo said "Undo the last workflow
 * response". To the platform a workflow is a sequence of stages. To a student
 * it is nothing — they are submitting their regression, undoing their answer.
 *
 * Read as text, the rendered words are JSX text and string literals. "workflow"
 * standing as a WORD (space or punctuation around it) is what a student would
 * read; `workflow-stage`, `workflow-focus__step` and `:workflow-responses` are
 * class names and keys, joined by `-`, `_` or `:`, and are left alone.
 */
const WORD = /(^|[\s(“"'`>])workflow(?=$|[\s.,!?;:)”"'`<])/i;
const renderedStrings = (source) => {
  const code = executableSource(source);
  const found = [];
  for (const match of code.matchAll(/>([^<>{}]+)</g)) found.push(match[1].trim());
  for (const match of code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) found.push((match[1] ?? match[2] ?? match[3]).trim());
  return found.filter((text) => WORD.test(` ${text} `));
};

// Nothing is tolerated any more: the Systems Workspace's panel titles said
// "3×3 substitution workflow" and "<method> workflow" and now say "steps".
const TOLERATED = new Set();

test('no registry tool or composed-question stage shows a student the word "workflow"', () => {
  const files = [...jsxUnder('src/tools'), ...jsxUnder('src/platform/workflow')];
  assert.ok(files.length > 30, `expected the tool and workflow components, found ${files.length}`);
  const offenders = files.flatMap((file) => renderedStrings(read(file))
    .filter((text) => !TOLERATED.has(`${file}|${text}`))
    .map((text) => `${file}: "${text}"`));
  assert.deepEqual(offenders, [], 'student-facing text should name what the student does ("Submit my regression"), not the platform\'s "workflow"');
});

test('Regression Calculator submits "my regression" and says so when it is complete', () => {
  const source = executableSource(read('src/tools/regressionCalculator/RegressionCalculator.jsx'));
  // The button that calls check() is the one with the student's wording.
  const button = region(source, 'className="regression-submit"', '</button>', 'the regression submit button');
  assert.match(button, /onClick=\{check\}/);
  // The label is the student's wording unless a secure host renames the final
  // action ("Record answer", ToolRuntimeContext useSubmitLabel).
  assert.match(button, />\s*\{submitActionLabel\}\s*$/);
  assert.match(source, /const submitActionLabel = useSubmitLabel\('Submit my regression'\);/);
  const verdict = region(source, 'const feedbackText', ');', 'the regression verdict text');
  assert.match(verdict, /'Regression complete\.'/);
});
