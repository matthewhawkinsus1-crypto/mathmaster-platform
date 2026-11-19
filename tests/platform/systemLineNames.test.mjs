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

let server;
test.before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent', cacheDir: join(tmpdir(), 'mm-vite-system-line-names') });
});
test.after(async () => { await server?.close(); });
const renderGrader = async (question) => {
  const { default: SystemGrader } = await server.ssrLoadModule('/src/SystemGrader.jsx');
  return renderToStaticMarkup(React.createElement(SystemGrader, { question, onStateChange: () => {}, onUndoStateChange: () => {}, feedback: null, draftKey: null }));
};

test('the Systems of Equations question draws each line\'s name on its graph', async () => {
  const names = (markup) => [...markup.matchAll(/data-curve-label="([^"]*)"/g)].map((match) => match[1]);
  for (const key of KEYS) {
    const question = generateQuestion(SYSTEM, key);
    assert.deepEqual(names(await renderGrader(question)).sort(), question.equationsLatex.map(shown).sort(), key);
    assert.deepEqual(names(await renderGrader({ ...question, showEquations: false })), [], `${key}: equations not shown, no names`);
  }
});

/*
 * EACH NAME IS READ AS ITS OWN LINE'S. Two steep lines that cross by an axis leave a long name ("y = 3x + 4") no
 * place clear of every other line, and every such place cost alike, so the first in order won: beside the crossing,
 * nearer the other line. The review's keys at the colour-alone page's settings (25) and at the generator's defaults
 * (60) drew 3 and 7 such names; and 13 with a line or an axis between a name and its own line. Kept off those, a name
 * must not take an axis number instead ("y = 2x + 4" over "−10", review|student|45 at the defaults). The figure places its
 * names in its own units, whatever its size: at 1366x768 and at 390x844 the browser places each of these 85 graphs
 * exactly as here, with nothing over them (colourAloneCues.mjs reads such systems at every size).
 */
const COLOUR_CUE_GENERATOR = { kind: 'linearSystem', xRange: [-5, 5], yRange: [-5, 5], slopeChoices: [-3, -2, -1, 1, 2, 3] };
const attributesOf = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
const pointsOf = (d) => [...d.matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
const nearestOn = ([px, py], runs) => {
  let nearest = null;
  for (const run of runs) {
    run.slice(1).forEach((b, i) => {
      const a = run[i];
      const t = Math.max(0, Math.min(1, ((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1)));
      const at = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      const away = Math.hypot(px - at[0], py - at[1]);
      if (!nearest || away < nearest.away) nearest = { at, away };
    });
  }
  return nearest;
};
const turn = (u, v, w) => Math.sign((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]));
const crossed = (p, q, runs) => runs.some((run) => run.slice(1).some((b, i) => turn(p, q, run[i]) * turn(p, q, b) < 0 && turn(run[i], b, p) * turn(run[i], b, q) < 0));

test('every equation\'s name sits nearer its own line than the other, with no line between and on no axis number, in the generated systems at both settings', async () => {
  let names = 0;
  for (const [setting, generator, count] of [['the colour-alone page\'s settings', COLOUR_CUE_GENERATOR, 25], ['the generator\'s defaults', { kind: 'linearSystem' }, 60]]) {
    for (let n = 1; n <= count; n += 1) {
      const key = `review|student|${n}|variant:0`;
      const question = generateQuestion({ ...SYSTEM, generator }, key);
      const markup = await renderGrader(question);
      const paths = [...markup.matchAll(/<path [^>]*data-mm-plane-part="line"[^>]*>/g)].map(([tag]) => attributesOf(tag));
      // Each line as drawn, in its own colour; the axes as drawn.
      const lines = question.graph.functions.map((spec) => paths.filter((path) => path.stroke === spec.stroke).map((path) => pointsOf(path.d)));
      const axes = [...markup.matchAll(/<line [^>]*stroke-width="2" data-mm-plane-part="axis"[^>]*>/g)].map(([tag]) => attributesOf(tag))
        .map((line) => [[Number(line.x1), Number(line.y1)], [Number(line.x2), Number(line.y2)]]);
      assert.equal(axes.length, 2, `${key}: both axes drawn`);
      const drawn = [...markup.matchAll(/<text [^>]*data-curve-label="[^"]*"[^>]*>([^<]*)<\/text>/g)].map(([tag, text]) => ({ ...attributesOf(tag), text }));
      assert.equal(drawn.length, 2, `${setting}, ${key}: both lines named`);
      // The axes' numbers as drawn, each a box of its text (0.55em a figure, from its anchor), and a name's the same way.
      const textBox = ({ x, y, size, length, anchor }) => {
        const width = length * 0.55 * size;
        const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
        return { left, right: left + width, top: y - 0.72 * size, bottom: y + 0.2 * size };
      };
      const numbers = [...markup.matchAll(/<text ([^>]*)>([−-]?\d+(?:\.\d+)?)<\/text>/g)].map(([, tag, text]) => {
        const at = attributesOf(`<text ${tag}>`);
        return { text, box: textBox({ x: Number(at.x), y: Number(at.y), size: Number(at['font-size'] || 12), length: text.length, anchor: at['text-anchor'] }) };
      });
      assert.ok(numbers.length >= 4, `${key}: the axes' numbers read (${numbers.length})`);
      for (const text of drawn) {
        names += 1;
        const own = question.equationsLatex.map(shown).indexOf(text['data-curve-label']);
        // The middle of the name: its baseline less 0.29em, at the figure's 14-unit text (curveLabels.js).
        const middle = [Number(text.x), Number(text.y) - 0.29 * 14];
        const toOwn = nearestOn(middle, lines[own]);
        const toOther = nearestOn(middle, lines[1 - own]).away;
        const label = `${setting}, ${key}: "${text['data-curve-label']}"`;
        assert.ok(toOwn.away < toOther, `${label} is ${toOwn.away.toFixed(1)} from its own line and ${toOther.toFixed(1)} from the other`);
        assert.ok(!crossed(middle, toOwn.at, [...lines[1 - own], ...axes]), `${label}: a line or an axis between it and its own line`);
        const name = textBox({ x: Number(text.x), y: Number(text.y), size: 14, length: text.text.length, anchor: 'middle' });
        for (const number of numbers) {
          const across = Math.min(name.right, number.box.right) - Math.max(name.left, number.box.left);
          const down = Math.min(name.bottom, number.box.bottom) - Math.max(name.top, number.box.top);
          assert.ok(!(across > 0 && down > 0), `${label} covers the axis number ${number.text}`);
        }
      }
    }
  }
  assert.equal(names, 170);
});
