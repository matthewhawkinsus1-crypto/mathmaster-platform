/*
 * NO TWO LINES ON A PLANE ARE TOLD APART BY COLOUR ALONE (WCAG 1.4.1).
 *
 * These planes drew two lines in the same style, told apart only by colour, in every theme, so a contrast theme drew
 * them alike: the Systems Workspace's two non-strict boundaries, the Transformations Lab's source and image in plot
 * mode, y = x against a solid f in the Inverse & Composition Lab and the Exponential ↔ Log Bridge, a curve and its
 * inverse in the graph workspace, two authored solid functions in a static figure, and Graph the Line's "method"
 * line, which had no badge. Each now carries a cue that is not colour, and no line's style changed: a dash still says
 * < or >, f⁻¹ or an asymptote. Rendered here as each screen renders it (server-side, through Vite).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

let server;
test.before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'silent', cacheDir: join(tmpdir(), 'mm-vite-plane-line-names') });
});
test.after(async () => { await server?.close(); });

const render = async (file, props, name = 'default') => {
  const module = await server.ssrLoadModule(file);
  return renderToStaticMarkup(React.createElement(module[name], props));
};
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
// The names a plane draws on its curves.
const names = (markup) => [...markup.matchAll(/data-curve-label="([^"]+)"/g)].map((match) => match[1]);
const sampleSpec = async (toolId) => (await server.ssrLoadModule('/src/dev/MathToolsLab.jsx')).SAMPLE_SPECS[toolId];

test('the Inverse & Composition Lab names f, f⁻¹ and y = x, and the mirror line stays solid', async () => {
  const markup = await render('/src/tools/inverseComposition/InverseCompositionLab.jsx', { questionData: await sampleSpec('inverseCompositionLab'), onAction: () => {} });
  assert.deepEqual(names(markup).sort(), ['f', 'f⁻¹', 'y = x']);
  // y = x is the plane's one line: solid, a dash here says f⁻¹.
  const mirror = [...markup.matchAll(/<line [^>]*stroke="#667085"[^>]*>/g)].map(([tag]) => attributes(tag));
  assert.equal(mirror.length, 1);
  assert.equal(mirror[0]['stroke-dasharray'], undefined, 'y = x is not dashed');
});

test('the Exponential ↔ Log Bridge names f, f⁻¹ and y = x, and keeps its dashes for the asymptotes', async () => {
  const markup = await render('/src/tools/exponentialLog/ExponentialLogBridge.jsx', { questionData: await sampleSpec('exponentialLogBridge'), onAction: () => {} });
  assert.deepEqual(names(markup).sort(), ['f', 'f⁻¹', 'y = x']);
  const mirror = [...markup.matchAll(/<line [^>]*stroke="#667085"[^>]*>/g)].map(([tag]) => attributes(tag));
  assert.equal(mirror.length, 1);
  assert.equal(mirror[0]['stroke-dasharray'], undefined, 'y = x is not dashed: a dash here says an asymptote');
});

// A boundary's dash is its relation's: solid for ≤ and ≥, dashed for < and >. Never the other way, to tell two apart.
const boundaryLines = (markup, colours) => [...markup.matchAll(/<line [^>]*>/g)].map(([tag]) => attributes(tag))
  .filter((line) => colours.includes(line.stroke) && line['data-mm-plane-part'] === 'line');
const CONSTRAINT_COLOURS = ['#1a73e8', '#d93025', '#00838f'];

test('the Systems Workspace numbers each boundary on the plane, and a non-strict boundary is never dashed', async () => {
  for (const [relations, dashed] of [[['>=', '<='], [false, false]], [['>', '<'], [true, true]], [['>=', '<'], [false, true]]]) {
    const inequalities = [{ m: 1, b: 1, relation: relations[0] }, { m: -0.5, b: 6, relation: relations[1] }];
    const markup = await render('/src/tools/systemsWorkspace/SystemsWorkspace.jsx', { questionData: { mode: 'inequalities', inequalities }, onAction: () => {} });
    const lines = boundaryLines(markup, CONSTRAINT_COLOURS);
    assert.equal(lines.length, 2, `${relations}: two boundaries`);
    lines.forEach((line, index) => assert.equal(Boolean(line['stroke-dasharray']), dashed[index], `${relations[index]}: ${dashed[index] ? 'dashed' : 'solid'}`));
    // Each in a ring of its own colour, with its constraint's number: the cards and the key say "Inequality 1", "Inequality 2".
    const tags = [...markup.matchAll(/<g data-curve-label="(\d)"[^>]*>\s*<circle ([^>]*?)\/?>/g)].map(([, label, circle]) => ({ label, ring: attributes(circle) }));
    assert.deepEqual(tags.map((tag) => tag.label), ['1', '2'], `${relations}: numbered`);
    tags.forEach((tag, index) => {
      assert.equal(tag.ring.stroke, CONSTRAINT_COLOURS[index]);
      assert.equal(tag.ring['data-mm-plane-part'], 'chip', 'a chip under a contrast theme');
    });
  }
});

test('the student-build workspace numbers each boundary it draws, and keeps the relation\'s style', async () => {
  const markup = await render('/src/tools/systemsWorkspace/SystemsWorkspace.jsx', { questionData: { mode: 'inequalities', studentBuild: { shading: true } }, onAction: () => {} });
  const lines = [...markup.matchAll(/<line [^>]*data-constraint-line="\d"[^>]*>/g)].map(([tag]) => attributes(tag));
  assert.equal(lines.length, 2, 'the two given boundaries are drawn');
  // The defaults: y ≥ x + 1 and y ≤ −0.5x + 6, both non-strict, so both solid.
  lines.forEach((line) => assert.equal(line['stroke-dasharray'], undefined, 'a boundary of ≤ or ≥ is solid'));
  assert.deepEqual(names(markup), ['1', '2']);
});

test('the Transformations Lab draws the source\'s points as squares and the student\'s as dots', async () => {
  const spec = await sampleSpec('transformationsLab');
  const markup = await render('/src/tools/transformations/TransformationsLab.jsx', { questionData: spec, onAction: () => {} });
  const squares = [...markup.matchAll(/<rect [^>]*data-point-shape="square"[^>]*>/g)];
  assert.equal(squares.length, spec.sourcePoints.length, 'every source point is a square');
  // The lab's own code: the source's points are squares, the plotted ones keep the plane's dots.
  const plot = region(executableSource(read('src/tools/transformations/TransformationsLab.jsx')), "mode === 'plotTransform' ? <>", '/>', 'plot mode');
  assert.match(plot, /label: `S\$\{index \+ 1\}`, fill: '#5f6b7a', shape: 'square'/);
  assert.match(plot, /\.\.\.plottedPoints\.map\(\(point, index\) => \(\{ x: point\[0\], y: point\[1\], label: `P\$\{index \+ 1\}` \}\)\)/);
  assert.match(markup, /its points squares and yours dots/, 'and says so');
});

test('the graph workspace names a curve f and its inverse f⁻¹, each beside its own', async () => {
  const { inverseCurveNames } = await server.ssrLoadModule('/src/InteractiveGraphWorkspace.jsx');
  // f(x) = 2x + 1 and its inverse on the workspace's 760 × 540 board, x and y from −10 to 10, with y = x.
  const to = (x, y) => [56 + ((x + 10) / 20) * 648, 56 + ((10 - y) / 20) * 428];
  const sample = (fn) => [Array.from({ length: 41 }, (_, i) => -10 + i / 2).map((x) => [x, fn(x)]).filter(([, y]) => y >= -10 && y <= 10).map(([x, y]) => to(x, y))];
  const original = sample((x) => 2 * x + 1);
  const inverse = sample((x) => (x - 1) / 2);
  const placed = inverseCurveNames({
    naming: true, original, inverse, mirror: [to(-10, -10), to(10, 10)], axes: [[to(-10, 0), to(10, 0)], [to(0, -10), to(0, 10)]], dots: [], avoid: [],
  });
  assert.deepEqual(placed.map((name) => name.label), ['f', 'f⁻¹']);
  const distance = ([px, py], runs) => Math.min(...runs[0].slice(1).map((b, i) => {
    const a = runs[0][i];
    const t = Math.max(0, Math.min(1, ((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
    return Math.hypot(px - (a[0] + t * (b[0] - a[0])), py - (a[1] + t * (b[1] - a[1])));
  }));
  const [f, g] = placed;
  assert.ok(distance([f.spot.cx, f.spot.cy], original) < distance([f.spot.cx, f.spot.cy], inverse), 'f is beside f');
  assert.ok(distance([g.spot.cx, g.spot.cy], inverse) < distance([g.spot.cx, g.spot.cy], original), 'f⁻¹ is beside its inverse');
  assert.deepEqual(inverseCurveNames({ naming: false, original, inverse, mirror: null, axes: [], dots: [], avoid: [] }), [], 'only while building the inverse');
  // And the board draws them, on a plate (Canvas under a contrast theme), over every curve.
  const board = executableSource(read('src/InteractiveGraphWorkspace.jsx'));
  const drawn = region(board, '{curveNames.map(({ label, ink, spot }) => (', '))}', 'the names on the board');
  assert.match(drawn, /data-curve-label=\{label\}/);
  assert.match(drawn, /data-mm-plane-part="plate" \/>/);
  assert.match(board, /naming: stage === 'analysis' && inverseReflectionEnabled,/);
});

test('a static figure names each curve its author named, and makes up no name', async () => {
  const graph = { xMin: -6, xMax: 6, yMin: -6, yMax: 6, functions: [{ type: 'line', m: 0.5, b: 1, label: 'f' }, { type: 'exponential', a: 0.5, b: 1.5, h: 0, k: -3, label: 'g' }] };
  const named = await render('/src/GraphDisplay.jsx', { graph, enlargeable: false });
  assert.deepEqual(names(named), ['f', 'g']);
  const unnamed = await render('/src/GraphDisplay.jsx', { graph: { ...graph, functions: graph.functions.map(({ label: _name, ...spec }) => spec) }, enlargeable: false });
  assert.deepEqual(names(unnamed), [], 'a figure that names none is drawn as it was');
  // Both curves stay solid.
  const curves = [...named.matchAll(/<path [^>]*data-mm-plane-part="line"[^>]*>/g)].map(([tag]) => attributes(tag));
  assert.ok(curves.length >= 2 && curves.every((curve) => !curve['stroke-dasharray']));
});

test('Graph the Line marks a line drawn without the method with its own badge: not a ✓, not a ✗', async () => {
  const props = { line: { a: 1, b: -2, c: -2 }, points: [{ x: 0, y: 1 }, { x: 2, y: 2 }], view: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, side: 300 };
  const marks = {};
  for (const kind of ['correct', 'wrong', 'method']) {
    const markup = await render('/src/components/liveChallenge/LineGraphCanvas.jsx', { ...props, kind }, 'VerdictBadge');
    const badge = /data-verdict-mark="(\w+)"/.exec(markup)?.[1];
    assert.ok(badge, `${kind}: a badge`);
    // The glyph's strokes, about the badge's centre: its shape, wherever the badge sits.
    const circle = attributes(/<circle [^>]*>/.exec(markup)[0]);
    const glyph = [...markup.matchAll(/<path [^>]*d="([^"]+)"/g)].map((match) => match[1].replace(/([\d.-]+) ([\d.-]+)/g, (_, x, y) => `${(Number(x) - Number(circle.cx)).toFixed(1)},${(Number(y) - Number(circle.cy)).toFixed(1)}`));
    assert.equal(glyph.length, 1, `${kind}: one glyph`);
    marks[kind] = { badge, glyph: glyph[0] };
  }
  assert.equal(new Set(Object.values(marks).map((mark) => mark.badge)).size, 3, JSON.stringify(marks));
  assert.equal(new Set(Object.values(marks).map((mark) => mark.glyph)).size, 3, 'three different shapes');
  // The canvas draws the badge for every judged line, the method's too.
  const canvas = executableSource(read('src/components/liveChallenge/LineGraphCanvas.jsx'));
  assert.match(canvas, /\{drawing && studentLine && judged && !answerLine && \(\s*<VerdictBadge [^>]*kind=\{judged\} \/>/);
});
