/*
 * A SET STEP'S EMPTY BOX SHOWS ITS BRACES (F-SET-NOTATION-UNSAID, student
 * walkthrough 2026-11-06, Algebra II Honors module 1, part 1).
 *
 * A step keyed as a braced set refuses a plain list ("-1, 5" for {-1, 5}):
 * writing a set as a set is part of what it assesses (answerUtils.mjs). Yet the
 * discrete domain and range steps (L1 Day 2 CW 5 and PR 4, the District DOL 1
 * review's CW 2 and CW 13) showed the bare word "set", their notation's name,
 * where WorkflowRunner meant `{ }`. Every typed set step now shows `{ }`, which
 * holds no value and so says nothing about the answer; an author's own
 * placeholder still wins. A miss written as a plain list says why
 * (composedWorkflow.mjs, tests/tools/composedStageReasonAllowlist.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { typedStagePlaceholder, typedStageToolProfile } from '../../src/platform/workflow/workflowPresentation.js';
import { region } from './helpers/sourceContract.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LESSONS = join(ROOT, 'teacher-import-jsons');
const TYPED = new Set(['valueSet', 'domainInput', 'rangeInput', 'intervalInput']);

const lessonFiles = (dir) => readdirSync(dir).sort().flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return lessonFiles(path);
  return name.endsWith('.json') ? [path] : [];
});

test('a typed set step shows { } and gets the set keypad; an author\'s placeholder still wins', () => {
  assert.equal(typedStagePlaceholder({ kind: 'domainInput', notation: 'set' }), '{ }', 'was "set"');
  assert.equal(typedStagePlaceholder({ kind: 'rangeInput', notation: 'set' }), '{ }');
  assert.equal(typedStagePlaceholder({ kind: 'valueSet' }), '{ }');
  assert.equal(typedStagePlaceholder({ kind: 'valueSet', notation: 'set' }), '{ }');
  assert.equal(typedStagePlaceholder({ kind: 'domainInput', notation: 'set', placeholder: 'the ages, in braces' }), 'the ages, in braces');
  assert.equal(typedStageToolProfile({ kind: 'domainInput', notation: 'set' }), 'set');
  assert.equal(typedStageToolProfile({ kind: 'valueSet' }), 'set');
  // Interval and inequality boxes are as they were.
  assert.equal(typedStagePlaceholder({ kind: 'domainInput', notation: 'interval' }), 'interval');
  assert.equal(typedStagePlaceholder({ kind: 'rangeInput', notation: 'inequality' }), 'inequality');
  assert.equal(typedStagePlaceholder({ kind: 'intervalInput' }), 'interval notation');
  assert.equal(typedStageToolProfile({ kind: 'rangeInput', notation: 'inequality' }), 'inequality');
  assert.equal(typedStageToolProfile({ kind: 'domainInput' }), 'interval');
});

test('every typed set step of every teacher-import lesson shows braces and no value', () => {
  const seen = [];
  for (const path of lessonFiles(LESSONS)) {
    let questions;
    try { questions = parseAssignmentBlueprintText(readFileSync(path, 'utf8')).questions; } catch { continue; } // not a lesson document
    questions.forEach((question) => {
      const { composed, workflow } = readComposedQuestion(question);
      if (!composed) return;
      workflow
        .filter((stage) => TYPED.has(stage.kind) && !(Array.isArray(stage.choices) && stage.choices.length))
        .filter((stage) => typedStageToolProfile(stage) === 'set')
        .forEach((stage) => {
          const shown = typedStagePlaceholder(stage);
          seen.push(`${path.split('/').pop()} ${stage.id}`);
          assert.match(shown, /\{.*\}/, `${path} ${stage.id}: "${shown}"`);
          assert.doesNotMatch(shown, /\d/, `${path} ${stage.id}: an example with a number could be a key`);
        });
    });
  }
  // The walkthrough's boxes: L1 Day 2 CW 5 (domain and range) and PR 4, the
  // District review's discrete domains and its zeros.
  const day2 = seen.filter((entry) => entry.startsWith('L1_Day2_Function_Attributes_Relations.json'));
  const district = seen.filter((entry) => entry.startsWith('District_DOL1_Technology_Graph_Analysis_Review.json'));
  assert.ok(day2.includes('L1_Day2_Function_Attributes_Relations.json domainDiscrete'), day2.join('\n'));
  assert.ok(day2.includes('L1_Day2_Function_Attributes_Relations.json rangeDiscrete'), day2.join('\n'));
  assert.ok(district.filter((entry) => entry.endsWith(' zeros')).length >= 8, district.join('\n'));
  assert.ok(district.some((entry) => entry.endsWith(' domainDiscrete')), district.join('\n'));
});

test('WorkflowRunner draws a typed step\'s box with that keypad and that placeholder', () => {
  const source = readFileSync(join(ROOT, 'src/platform/workflow/WorkflowRunner.jsx'), 'utf8');
  const box = region(source, "case 'valueSet':", "case 'graphFeatureSelect':", 'the typed domain, range and values step');
  assert.match(box, /<MathInput[\s\S]*?toolProfile=\{typedStageToolProfile\(stage\)\}[\s\S]*?placeholder=\{typedStagePlaceholder\(stage\)\}/);
});
