/*
 * A SYSTEM'S LINES, NAMED BY THEIR EQUATIONS (WCAG 1.4.1; src/platform/graph/systemLineNames.js).
 *
 * The Systems of Equations question lists its equations beside swatches of their lines' colours, and draws the two
 * lines in those colours: the colour was all that paired an equation with its line. Each line whose equation the
 * list shows is named by it on the graph; the question names nothing it does not show, and the system generator's
 * question itself does not change (legacy assignments are held to what they generated before:
 * questionFamilyGeneration.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { generateQuestion } from '../../src/problemGenerator.js';
import { nameSystemLines, slopeInterceptOf } from '../../src/platform/graph/systemLineNames.js';

// The formatting guide's system question, as four students' keys generate it.
const SYSTEM = {
  questionId: 'q-system', type: 'system', prompt: 'Solve the system. Enter the solution as an ordered pair.', showEquations: true, showGraph: true,
  generator: { kind: 'linearSystem', xRange: [-10, 10], yRange: [-10, 10], slopeChoices: [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5] },
};
const KEYS = ['asg|student-a|3|variant:0', 'asg|student-a|3|variant:1', 'asg|student-b|3|variant:0', 'asg|shared|5|variant:2'];
// As the list shows an equation, with a minus sign for its hyphen.
const shown = (equation) => equation.replace(/-/g, '−');

test('an equation is read as its line only in the form the system generator writes it', () => {
  assert.deepEqual(slopeInterceptOf('y = -4x - 15'), { m: -4, b: -15 });
  assert.deepEqual(slopeInterceptOf('y = -x'), { m: -1, b: 0 });
  assert.deepEqual(slopeInterceptOf('y = x + 2'), { m: 1, b: 2 });
  assert.deepEqual(slopeInterceptOf('y = 4'), { m: 0, b: 4 });
  assert.deepEqual(slopeInterceptOf('y = −3x + 2'), { m: -3, b: 2 }, 'a minus sign as a hyphen');
  for (const other of ['2x + y = 5', 'y = 1/2x + 3', 'x = 3', 'y = 2x + 3 + 1', '', null]) assert.equal(slopeInterceptOf(other), null, String(other));
});

test('every generated system names each of its lines by the equation listed for it', () => {
  for (const key of KEYS) {
    const question = generateQuestion(SYSTEM, key);
    const graph = nameSystemLines({ graph: question.graph, equations: question.equationsLatex, showEquations: true });
    assert.deepEqual(graph.functions.map((spec) => spec.label), question.equationsLatex.map(shown), key);
    // Each name is its own line's equation, not the other's.
    for (const spec of graph.functions) assert.deepEqual(slopeInterceptOf(spec.label), { m: spec.m, b: spec.b }, `${key}: ${spec.label}`);
    // The generated question is unchanged: the names are the grader's, at render time.
    assert.ok(question.graph.functions.every((spec) => !('label' in spec)), `${key}: the question carries no names`);
  }
});

test('nothing the question does not show is named, and an author\'s own name is kept', () => {
  const question = generateQuestion(SYSTEM, KEYS[0]);
  assert.equal(nameSystemLines({ graph: question.graph, equations: question.equationsLatex, showEquations: false }), question.graph, 'equations not shown: no names');
  assert.equal(nameSystemLines({ graph: question.graph, equations: [], showEquations: true }), question.graph, 'no equations: no names');
  const authored = { functions: [{ type: 'line', m: -2, b: 5 }, { type: 'line', m: 1, b: 2, label: 'g' }, { type: 'quadratic', a: 1, b: 0, c: 0 }] };
  // Listed another way, an equation names nothing; a line its author named keeps that name.
  assert.equal(nameSystemLines({ graph: authored, equations: ['2x + y = 5', 'y = x + 2'] }), authored);
  // A listed equation names only its own line, whatever the order of the list.
  assert.deepEqual(nameSystemLines({ graph: authored, equations: ['y = -2x + 5', 'y = 3x'] }).functions.map((spec) => spec.label), ['y = −2x + 5', 'g', undefined]);
  const twoLines = { functions: [{ type: 'line', m: 1, b: 2 }, { type: 'line', m: -2, b: 5 }] };
  assert.deepEqual(nameSystemLines({ graph: twoLines, equations: ['y = -2x + 5', 'y = x + 2'] }).functions.map((spec) => spec.label), ['y = x + 2', 'y = −2x + 5']);
  // A line given without b is drawn through b = 0, and named so.
  assert.equal(nameSystemLines({ graph: { functions: [{ type: 'line', m: 2 }] }, equations: ['y = 2x'] }).functions[0].label, 'y = 2x');
});

test('the Systems of Equations question draws each line\'s name on its graph', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent', cacheDir: join(tmpdir(), 'mm-vite-system-line-names') });
  try {
    const { default: SystemGrader } = await server.ssrLoadModule('/src/SystemGrader.jsx');
    const render = (question) => renderToStaticMarkup(React.createElement(SystemGrader, { question, onStateChange: () => {}, onUndoStateChange: () => {}, feedback: null, draftKey: null }));
    const names = (markup) => [...markup.matchAll(/data-curve-label="([^"]*)"/g)].map((match) => match[1]);
    for (const key of KEYS) {
      const question = generateQuestion(SYSTEM, key);
      assert.deepEqual(names(render(question)).sort(), question.equationsLatex.map(shown).sort(), key);
      assert.deepEqual(names(render({ ...question, showEquations: false })), [], `${key}: equations not shown, no names`);
    }
  } finally {
    await server.close();
  }
});
