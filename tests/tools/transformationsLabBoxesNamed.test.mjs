/*
 * THE TRANSFORMATIONS LAB NAMES ONLY THE BOXES IT SHOWS
 * (student walkthrough 2026-11-06, Algebra II Honors module 1, part 2, P-4).
 *
 * An item keeps b = 1 unless it asks for a horizontal scale, and then the lab
 * shows three boxes: a, h and k. After a miss on L2 Day 2 CW 1, CW 4 and PR 1
 * it said "Compare one parameter at a time. Change only a, then b, then h,
 * then k", and its task, steps and hints sent the student to a b box that was
 * not there ("Enter all four"). Without a b box they name a, h and k only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { resolveTransformationsQuestion } from '../../functions/shared/toolMath/transformations/transformationsMath.mjs';
import {
  HINTS, MODE_STEPS, MODE_TASKS, labGuidanceFor, labTaskFor, parameterKeysFor, parameterMissMessage,
} from '../../src/tools/transformations/transformationsGuidance.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

// A b box named, "all four" boxes, or the model written with b.
const NAMES_B = /\bb\b|\bfour\b|f\(b\(/;
const words = (...parts) => parts.flat().join(' ');

test('without a b box, a miss names a, h and k, one at a time', () => {
  assert.equal(parameterMissMessage({ showB: false }), 'Compare one parameter at a time. Change only a, then h, then k, and watch what each one changes.');
  assert.deepEqual(parameterKeysFor({ showB: false }), ['a', 'h', 'k']);
  // With a b box, the message and the boxes are as they were.
  assert.equal(parameterMissMessage({ showB: true }), 'Compare one parameter at a time. Change only a, then b, then h, then k, and watch what each one changes.');
  assert.deepEqual(parameterKeysFor({ showB: true }), ['a', 'b', 'h', 'k']);
});

test('without a b box, the task, steps and hints of match and identify name no b', () => {
  for (const family of ['quadratic', 'absolute', 'exponential', 'rational', 'linear']) {
    const withB = labGuidanceFor(family);
    const { steps, hints } = labGuidanceFor(family, { showB: false });
    for (const mode of ['match', 'identify']) {
      const text = words(labTaskFor(mode, { showB: false }), steps[mode], hints[mode]);
      assert.doesNotMatch(text, NAMES_B, `${family} ${mode}: ${text}`);
      assert.equal(steps[mode].length, withB.steps[mode].length, `${family} ${mode}: as many steps`);
      assert.equal(hints[mode].length, withB.hints[mode].length, `${family} ${mode}: as many hints`);
    }
    assert.equal(steps.identify.at(-1), 'Enter all three, then press {action}.', family);
    // The other modes have no parameter boxes, and keep their words.
    for (const mode of ['pointMap', 'plotTransform', 'describe', 'anchor']) {
      assert.deepEqual([steps[mode], hints[mode]], [withB.steps[mode], withB.hints[mode]], `${family} ${mode}`);
    }
  }
  // A line is still read from any point, with its slope as a.
  assert.match(words(labGuidanceFor('linear', { showB: false }).steps.identify), /any point on it can be \(h, k\)/);
  // With a b box, every word is as it was.
  assert.deepEqual(labGuidanceFor('quadratic', { showB: true }), { steps: MODE_STEPS, hints: HINTS });
  assert.equal(labTaskFor('match', { showB: true }), MODE_TASKS.match);
  assert.equal(labTaskFor('identify', { showB: true }), MODE_TASKS.identify);
  assert.match(MODE_STEPS.identify.at(-1), /^Enter all four/);
});

test('the walkthrough\'s items show three boxes, and a miss names those three', () => {
  const lesson = new URL('../../teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json', import.meta.url);
  const items = parseAssignmentBlueprintText(readFileSync(lesson, 'utf8')).questions
    .filter((question) => question.type === 'transformationsLab' && ['match', 'identify'].includes(question.mode));
  assert.ok(items.length >= 3, `${items.length} match and identify items (CW 1, CW 4, PR 1, the exit ticket's)`);
  for (const item of items) {
    const resolved = resolveTransformationsQuestion(item);
    assert.equal(resolved.showB, false, item.prompt);
    const message = parameterMissMessage(resolved);
    for (const key of ['a', 'h', 'k']) assert.match(message, new RegExp(`\\b${key}\\b`), `${item.prompt}: names ${key}`);
    assert.doesNotMatch(message, NAMES_B, item.prompt);
  }
});

test('the lab draws, names and asks for the boxes from the same answer', () => {
  const lab = executableSource(readFileSync(new URL('../../src/tools/transformations/TransformationsLab.jsx', import.meta.url), 'utf8'));
  const component = region(lab, 'export default function TransformationsLab(', '\n}\n', 'TransformationsLab');
  assert.match(component, /const parameterKeys = parameterKeysFor\(\{ showB \}\);/, 'the boxes drawn');
  assert.match(component, /const modeTask = labTaskFor\(mode, \{ showB \}\);/, 'the task line');
  assert.match(component, /<TaskCard question=\{questionData\} task=\{modeTask\}/);
  const miss = region(component, 'const feedbackMessage = () => {', '\n  };', 'the miss message');
  assert.match(miss, /return parameterMissMessage\(\{ showB \}\);\s*$/, 'a miss on match or identify');
  assert.doesNotMatch(lab, /then b, then h|a, b, h and k/, 'no copy of the four-box words in the component');
});

// The lab as it renders (on the server, as tests/platform/toolDirectionsSplit
// renders it), for the walkthrough's own item: L2 Day 2 CW 1, identify.
test('rendered, L2 Day 2 CW 1 shows three boxes and its directions name those three', async () => {
  const lesson = new URL('../../teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json', import.meta.url);
  const item = parseAssignmentBlueprintText(readFileSync(lesson, 'utf8')).questions
    .find((question) => question.type === 'transformationsLab' && question.mode === 'identify' && question.activityRole === 'classwork');
  assert.ok(item, 'L2 Day 2 CW 1 compiles');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const hadWindow = 'window' in globalThis;
  const before = globalThis.window;
  // The card's fold remembers that it was open, so every step is in the markup.
  globalThis.window = { localStorage: { getItem: () => 'open', setItem() {} } };
  try {
    const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
    const Lab = (await server.ssrLoadModule('/src/tools/transformations/TransformationsLab.jsx')).default;
    const html = renderToStaticMarkup(React.createElement(ToolRuntimeProvider, { hintsAllowed: true, verdictsWithheld: false }, React.createElement(Lab, { questionData: item })));
    const boxes = [...html.matchAll(/<label><strong>([a-z])<\/strong><input type="number"/g)].map((match) => match[1]);
    assert.deepEqual(boxes, ['a', 'h', 'k'], 'three boxes');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
    assert.match(text, /Read the graph and recover the values of a, h and k that produced it\./);
    assert.match(text, /Use one or more additional points to recover a\./);
    assert.match(text, /Enter all three, then press Check parameters\./);
    assert.doesNotMatch(text, /all four|a, b, h and k|recover a and b/);
  } finally {
    if (hadWindow) globalThis.window = before;
    else delete globalThis.window;
    await server.close();
  }
});
