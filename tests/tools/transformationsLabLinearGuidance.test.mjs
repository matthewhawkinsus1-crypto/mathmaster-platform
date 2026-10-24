import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { HINTS, MODE_STEPS, labGuidanceFor } from '../../src/tools/transformations/transformationsGuidance.js';
import { region } from '../platform/helpers/sourceContract.mjs';

/*
 * A LINE IN THE TRANSFORMATIONS LAB'S IDENTIFY AND DESCRIBE MODES (TL20, R-6).
 *
 * The lab's steps and hints for those modes start from the family's defining
 * feature — "Find the defining feature of the graph — that gives you h and k".
 * A line has none: every point of it can be (h, k), and a is its slope. A
 * line's guidance says that instead; every other family, and a line's other
 * modes, keep the lab's own words.
 */

const words = (list) => list.join(' ');

test('a line\'s identify and describe guidance reads any point as (h, k) and the slope as a', () => {
  const line = labGuidanceFor('linear');
  for (const mode of ['identify', 'describe']) {
    for (const [kind, text] of [['steps', words(line.steps[mode])], ['hints', words(line.hints[mode])]]) {
      assert.doesNotMatch(text, /defining feature|the vertex, the corner|that gives you h and k/, `${mode} ${kind}: no feature to find on a line`);
      assert.match(text, /any point on (?:it|the line) can be \(h, k\)/i, `${mode} ${kind}: any point is (h, k)`);
      assert.match(text, /slope/, `${mode} ${kind}: a is the slope`);
    }
  }
  assert.match(words(line.hints.describe), /"left 3" and "up 3" can draw the same line/);
  // The last identify step still names the final button (D9).
  assert.match(line.steps.identify.at(-1), /\{action\}/);
  assert.equal(line.steps.identify.length, MODE_STEPS.identify.length);
  assert.equal(line.hints.describe.length, HINTS.describe.length);
});

test('every other family, and a line\'s other modes, keep the lab\'s own guidance', () => {
  for (const family of ['quadratic', 'absolute', 'cubic', 'squareRoot', 'rational', 'exponential', 'logarithmic', undefined]) {
    assert.deepEqual(labGuidanceFor(family), { steps: MODE_STEPS, hints: HINTS }, String(family));
  }
  assert.match(MODE_STEPS.identify[0], /defining feature/, 'a parabola is still read from its vertex');
  const line = labGuidanceFor('linear');
  for (const mode of ['match', 'pointMap', 'plotTransform', 'anchor']) {
    assert.equal(line.steps[mode], MODE_STEPS[mode], `${mode} steps`);
    assert.equal(line.hints[mode], HINTS[mode], `${mode} hints`);
  }
});

test('the lab shows the guidance for the family it draws', () => {
  const lab = readFileSync(new URL('../../src/tools/transformations/TransformationsLab.jsx', import.meta.url), 'utf8');
  const component = region(lab, 'export default function TransformationsLab(', '\n}\n', 'TransformationsLab');
  // The family is the one the lab draws and the grader marks (resolveTransformationsQuestion).
  assert.match(component, /\} = resolveTransformationsQuestion\(questionData\);\s*\/\/[^\n]*\n\s*const \{ steps: MODE_STEPS, hints: HINTS \} = labGuidanceFor\(family\);/);
  assert.doesNotMatch(lab, /^const (?:MODE_STEPS|HINTS) = /m, 'no second copy of the guidance in the component file');
  assert.match(component, /steps=\{stepsNamingAction\(MODE_STEPS\[mode\] \|\| MODE_STEPS\.match, finishActionName\)\}/);
  assert.equal((component.match(/<HintPanel hints=\{HINTS\[mode\] \|\| HINTS\.match\}/g) || []).length, 2, 'the panel and Work View Help');
});
