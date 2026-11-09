/*
 * THE STATIC FIGURE DRAWS A LINE'S STYLE AND AN INEQUALITY'S SHADED SIDE, AND
 * SAYS SO (N38, F-GRAPH-IN-WORDS; CT04).
 *
 * The question graph (GraphDisplay, drawn through QuestionVisual) drew only
 * solid curves and no shading, so "write the inequality this graph shows"
 * described its graph in a sentence. It now draws, from fields on the graph:
 *
 *   functions[i].dashed / segments[i].dashed   a dashed curve, line or segment
 *   verticalLines: [{ x, dashed? }]            a vertical line (x < 3's boundary)
 *   shading: [inequality | { inequalities }]   the side where it holds, or a
 *                                              system's overlap, clipped to
 *                                              the plot, under the grid
 *
 * and a figure sort's shared window may carry `referenceLine` (L3 PR 9:
 * "parallel to the reference line, perpendicular to it, or neither?").
 * Every place a figure is described says what is drawn: the screen reader's
 * description, Read aloud's reading in English and Spanish, and the printed
 * worksheet draws the same marks. While a question can be answered no
 * position is said; a figure without the new fields is drawn as before.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import { readShadingBoundary, shadingPolygon, shadingRegions } from '../../src/platform/graph/halfPlaneShading.js';
import { describeCoordinatePlane, GRAPH_WORDS } from '../../src/platform/language/graphDescription.js';
import { sayFigure } from '../../src/platform/language/figureSay.js';
import esFigures from '../../src/platform/language/packs/esFigures.js';
import { auditStaticGraphViewport } from '../../src/graphSpecUtils.js';
import { renderWorksheetVisual } from '../../src/platform/resources/assignmentWorksheetVisuals.js';
import { printableVisualsFromResolvedQuestion } from '../../src/platform/resources/assignmentWorksheetPdfModel.js';
import { figureCaptureServer } from './helpers/figureCapture.mjs';

let capture = null;
before(async () => { capture = await figureCaptureServer(); });
after(async () => { await capture?.close(); });

const WINDOW = { xMin: -10, xMax: 10, yMin: -10, yMax: 10, equalUnits: true };
const DASHED_BELOW = { ...WINDOW, functions: [{ type: 'line', m: 4, b: 2, dashed: true }], shading: [{ m: 4, b: 2, relation: '<' }] };
const VERTICAL_LEFT = { ...WINDOW, verticalLines: [{ x: 3, dashed: true }], shading: [{ orientation: 'vertical', x: 3, relation: '<' }] };
const OVERLAP_BELOW = {
  ...WINDOW,
  functions: [{ type: 'line', m: 0.6, b: 3, dashed: true }, { type: 'line', m: -0.6, b: 3, dashed: true }],
  shading: [{ inequalities: [{ m: 0.6, b: 3, relation: '<' }, { m: -0.6, b: 3, relation: '<' }] }],
};
const TWO_SIDES = {
  ...WINDOW,
  functions: [{ type: 'line', m: 1, b: 2 }, { type: 'line', m: -1, b: 5, dashed: true, stroke: '#d93025' }],
  shading: [{ m: 1, b: 2, relation: '>=' }, { m: -1, b: 5, relation: '<' }],
};

/* --------------------------------------------------------------- the geometry */

test('a shading entry is read from its inequality: the side and the strictness come from the relation', () => {
  assert.deepEqual(['side', 'strict', 'm', 'b'].map((key) => readShadingBoundary({ m: 4, b: 2, relation: '<' })[key]), ['below', true, 4, 2]);
  assert.equal(readShadingBoundary({ m: 0, b: -2, relation: '≥' }).side, 'above');
  // Standard form: dividing by the negative y-coefficient reverses the side.
  assert.equal(readShadingBoundary({ A: 2, B: -1, C: -4, relation: '<' }).side, 'above', '2x − y − 4 < 0 is y > 2x − 4');
  assert.deepEqual(['vertical', 'x', 'side'].map((key) => readShadingBoundary({ orientation: 'vertical', x: 3, relation: '<' })[key]), [true, 3, 'left']);
  assert.equal(readShadingBoundary({ A: -1, B: 0, C: 3, relation: '<' }).side, 'right', '−x + 3 < 0 is x > 3');
  // No relation, no side: never a guess. Nor anything that is not linear.
  assert.equal(readShadingBoundary({ m: 1, b: 0 }), null);
  assert.equal(readShadingBoundary({ relation: '<' }), null);
  assert.equal(shadingRegions([{ inequalities: [{ m: 1, b: 0, relation: '<' }, { m: 1, b: 0 }] }]).length, 0, 'a region with any unreadable inequality is left out whole');
  // The polygon lies on the side where the inequality holds, inside the window.
  const window = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const [below] = shadingRegions(DASHED_BELOW.shading);
  const polygon = shadingPolygon(below, window);
  assert.ok(polygon.length >= 3);
  polygon.forEach(([x, y]) => {
    assert.ok(y <= 4 * x + 2 + 1e-9, `(${x}, ${y}) is on or below y = 4x + 2`);
    assert.ok(x >= -10 - 1e-9 && x <= 10 + 1e-9 && y >= -10 - 1e-9 && y <= 10 + 1e-9, 'inside the window');
  });
  assert.deepEqual(shadingPolygon(shadingRegions([{ m: 0, b: 20, relation: '>' }])[0], window), [], 'a side the window does not show draws nothing');
});

/* ----------------------------------------------------------- the real figure */

const describedText = (markup) => /<p id="[^"]*" data-graph-description=""[^>]*>([^<]*)<\/p>/.exec(markup)?.[1].replace(/&#x27;/g, "'");
const svgPolygons = (markup) => [...markup.matchAll(/<polygon data-shaded-region="" points="([^"]+)"[^>]*fill="([^"]+)"[^>]*fill-opacity="([^"]+)"/g)]
  .map(([, points, fill, opacity]) => ({ points: points.split(' ').map((pair) => pair.split(',').map(Number)), fill, opacity: Number(opacity) }));
// The drawn curves, as SVG paths: their dash and their screen points.
const svgPaths = (markup) => [...markup.matchAll(/<path clip-path="[^"]*" d="([^"]+)"([^>]*)>/g)]
  .map(([, d, rest]) => ({ points: [...d.matchAll(/[ML] ([-\d.]+) ([-\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]), dash: /stroke-dasharray="([^"]+)"/.exec(rest)?.[1] || null, cap: /stroke-linecap="([^"]+)"/.exec(rest)?.[1], stroke: /stroke="([^"]+)"/.exec(rest)?.[1] }));
const lineScreenY = (path, sx) => {
  const [[x1, y1], [x2, y2]] = [path.points[0], path.points[path.points.length - 1]];
  return y1 + ((sx - x1) * (y2 - y1)) / (x2 - x1);
};

const renderGraph = async (graph, lifecycle = null) => {
  const { default: GraphDisplay } = await capture.load('/src/GraphDisplay.jsx');
  const { QuestionLifecycleProvider } = await capture.load('/src/platform/question/QuestionLifecycleContext.jsx');
  const figure = React.createElement(GraphDisplay, { graph, enlargeable: false, title: 'Question graph' });
  return capture.render(lifecycle ? React.createElement(QuestionLifecycleProvider, lifecycle, figure) : figure);
};

test('a dashed boundary is drawn dashed, and its shading below it, over the grid and under the lines, in the line\'s colour', async () => {
  const { markup, entries } = await renderGraph(DASHED_BELOW);
  const [path] = svgPaths(markup);
  assert.equal(path.dash, '10 6', 'the Systems Workspace\'s boundary dash');
  assert.equal(path.cap, 'butt', 'round caps would close the gaps');
  const [shade] = svgPolygons(markup);
  assert.ok(shade, 'one shaded region');
  assert.equal(shade.fill, '#1a73e8', 'the line\'s own colour');
  assert.equal(shade.opacity, 0.16, 'the Systems Workspace\'s shading strength');
  // Screen y grows downward: "below the line" is every vertex at or under it.
  shade.points.forEach(([sx, sy]) => assert.ok(sy >= lineScreenY(path, sx) - 0.5, `(${sx}, ${sy}) is under the line`));
  // Over the gridlines (tinted with the region, they keep their contrast in
  // it), under the axes, the line and its arrowheads.
  assert.ok(markup.lastIndexOf('stroke="var(--mm-graph-grid)"') < markup.indexOf('data-shaded-region'), 'shading after the gridlines');
  assert.ok(markup.indexOf('data-shaded-region') < markup.indexOf('stroke="var(--mm-graph-axis)" stroke-width="2"'), 'shading before the axes');
  assert.ok(markup.indexOf('data-shaded-region') < markup.indexOf('<path clip-path'), 'shading before the line');
  // Said as drawn, with no position while the question can be answered.
  assert.equal(describedText(markup), 'x from about −15.7 to about 15.7, y from −10 to 10. 1 dashed line, shaded below. 2 arrowheads. Positions are not read out while this question can be answered.');
  const [reading] = entries;
  assert.equal(sayFigure(reading.say, GRAPH_WORDS, { english: true }), reading.text, 'Read aloud says the same, from the same messages');
  assert.equal(sayFigure(reading.say, esFigures.words), 'El eje x va de aproximadamente −15.7 a aproximadamente 15.7 y el eje y, de −10 a 10. 1 recta discontinua, sombreada por debajo. 2 puntas de flecha. Las posiciones no se leen mientras se pueda responder esta pregunta.');
  // Closed: the line's features, and the shaded side said with the line.
  const closed = describedText((await renderGraph(DASHED_BELOW, { terminal: true, positionsReadable: true })).markup);
  assert.match(closed, /Line 1 \(dashed\) rises from left to right, crosses the y-axis at 2, crosses the x-axis between −1 and 0, and passes through \(0, 2\) and \(1, 6\)\. Shaded below line 1\./, closed);
  // An exit ticket's locked graph still gives no position away.
  const locked = describedText((await renderGraph(DASHED_BELOW, { terminal: true })).markup);
  assert.match(locked, /1 dashed line, shaded below\. 2 arrowheads\. Positions are not read out on this question\.$/, locked);
  assert.doesNotMatch(locked, /\(\s*[−-]?\d|crosses|through/);
});

test('a vertical boundary is a vertical line, dashed, with the side to its left shaded', async () => {
  const { markup } = await renderGraph(VERTICAL_LEFT);
  const vertical = /<line data-vertical-line="" x1="([-\d.]+)"[^>]*stroke-dasharray="10 6"/.exec(markup);
  assert.ok(vertical, 'a dashed vertical line');
  const [shade] = svgPolygons(markup);
  shade.points.forEach(([sx]) => assert.ok(sx <= Number(vertical[1]) + 0.5, 'shaded to its left'));
  assert.equal((markup.match(/<polygon points="14,0 -7,-9 -7,9"/g) || []).length, 2, 'an arrowhead where it leaves, top and bottom');
  assert.match(describedText(markup), /1 dashed vertical line, shaded to the left\. 2 arrowheads\./);
  assert.match(describedText((await renderGraph(VERTICAL_LEFT, { terminal: true, positionsReadable: true })).markup), /Dashed vertical line through 3 on the x-axis\. Shaded to the left of the vertical line through 3\./);
});

test('a system\'s overlap is one region, and two shaded sides are each said with their line', async () => {
  const overlap = await renderGraph(OVERLAP_BELOW);
  assert.equal(svgPolygons(overlap.markup).length, 1, 'only the region below both lines');
  assert.match(describedText(overlap.markup), /2 dashed lines\. The region below both lines is shaded\./);
  assert.equal(sayFigure(overlap.entries[0].say, esFigures.words).includes('2 rectas discontinuas. La región por debajo de las dos rectas está sombreada.'), true);
  assert.match(describedText((await renderGraph(OVERLAP_BELOW, { terminal: true, positionsReadable: true })).markup), /The region below line 1 and below line 2 is shaded\./);
  // Between a rising and a falling line, the two regions are told apart by
  // the way each line goes, as the picture shows them, and by nothing else.
  const between = (rising, falling) => ({ ...OVERLAP_BELOW, shading: [{ inequalities: [{ m: 0.6, b: 3, relation: rising }, { m: -0.6, b: 3, relation: falling }] }] });
  const left = await renderGraph(between('>', '<'));
  assert.match(describedText(left.markup), /2 dashed lines\. The region above the rising line and below the falling line is shaded\./);
  assert.equal(sayFigure(left.entries[0].say, esFigures.words).includes('La región por encima de la recta que sube y por debajo de la que baja está sombreada.'), true);
  assert.match(describedText((await renderGraph(between('<', '>'))).markup), /The region below the rising line and above the falling line is shaded\./);

  const sides = await renderGraph(TWO_SIDES);
  const shades = svgPolygons(sides.markup);
  assert.deepEqual(shades.map((shade) => shade.fill), ['#1a73e8', '#d93025'], 'each side in its own line\'s colour');
  assert.match(describedText(sides.markup), /1 solid line, shaded above\. 1 dashed line, shaded below\./);
  // An arrowhead is its own line's colour.
  assert.equal((sides.markup.match(/<polygon points="14,0 -7,-9 -7,9" fill="#d93025"/g) || []).length, 2);
});

test('a figure with none of the new fields is drawn and said as before', async () => {
  const plain = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [{ type: 'line', m: 1, b: 0 }], segments: [{ from: [0, 0], to: [2, 1] }] };
  const { markup } = await renderGraph(plain);
  assert.doesNotMatch(markup, /data-shaded-region|data-vertical-line|stroke-dasharray="10 6"/);
  const [path] = svgPaths(markup);
  assert.equal(path.cap, 'round');
  assert.equal(path.stroke, '#1a73e8');
  assert.match(markup, /<polygon points="14,0 -7,-9 -7,9" fill="#1a73e8"/);
  // (A drawn segment frames the figure with equal units, as it always has.)
  assert.equal(describedText(markup), 'x from about −7.8 to about 7.8, y from −5 to 5. 1 line. 1 connected path. 2 arrowheads. Positions are not read out while this question can be answered.');
  // Solid: no dash anywhere in its tag (it also names its part for a contrast theme, data-mm-plane-part).
  assert.match(markup, /<line x1="[^"]+" y1="[^"]+" x2="[^"]+" y2="[^"]+" stroke="#9334e6" stroke-width="3"(?![^>]*stroke-dasharray)[^>]*><\/line>/, 'the segment, solid');
});

test('a dashed curve and a dashed segment are drawn and said dashed', async () => {
  const graph = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, functions: [{ type: 'quadratic', a: 1, h: 0, k: -2 }, { type: 'quadratic', a: -1, h: 0, k: 3, dashed: true }], segments: [{ from: [-4, -4], to: [-2, -4], dashed: true }] };
  const { markup } = await renderGraph(graph);
  const paths = svgPaths(markup);
  assert.deepEqual([...new Set(paths.map((path) => path.dash))], [null, '10 6']);
  assert.match(markup, /<line x1="[^"]+" y1="[^"]+" x2="[^"]+" y2="[^"]+" stroke="#9334e6" stroke-width="3" stroke-dasharray="10 6"/, 'the dashed segment');
  assert.match(describedText(markup), /1 solid curve\. 1 dashed curve\. 1 dashed connected path\./);
});

/* --------------------------------------------------------- the words, alone */

test('the reading names each line\'s style and shaded side, never a position, and counts a lone solid vertical line', () => {
  const base = { xMin: -6, xMax: 6, yMin: -6, yMax: 6, xTickStep: 1, yTickStep: 1 };
  const open = describeCoordinatePlane({ ...base, lines: [{ m: 1, b: 2 }, { m: 0.5, b: -1, dash: '10 6' }], halfPlanes: [{ sides: [{ side: 'above', line: 0 }] }] });
  assert.equal(open.description, 'x from −6 to 6, y from −6 to 6. 1 solid line, shaded above. 1 dashed line. Positions are not read out while this question can be answered.');
  assert.doesNotMatch(open.description, /\(|crosses|through|rises|falls/);
  // A region whose boundary is not drawn is a shaded region.
  assert.match(describeCoordinatePlane({ ...base, halfPlanes: [{ sides: [{ side: 'below' }], polygon: [[-6, -6], [6, -6], [6, 0]] }] }).description, /1 shaded region\./);
  // Before: "1 solid vertical line. Nothing is plotted." and no withheld sentence.
  assert.equal(describeCoordinatePlane({ ...base, verticalLines: [{ x: 2, boundaryStyle: 'solid' }] }).description, 'x from −6 to 6, y from −6 to 6. 1 solid vertical line. Positions are not read out while this question can be answered.');
  // Unstyled lines keep their old words.
  assert.equal(describeCoordinatePlane({ ...base, lines: [{ m: 1, b: 2 }] }).description, 'x from −6 to 6, y from −6 to 6. 1 line. Positions are not read out while this question can be answered.');
});

/* ------------------------------------------------- Pre-Flight and the page */

test('Pre-Flight reads a vertical boundary and a shaded side as drawings, and refuses a side it cannot read', () => {
  assert.deepEqual(auditStaticGraphViewport(VERTICAL_LEFT).errors, []);
  assert.deepEqual(auditStaticGraphViewport({ ...WINDOW }).errors, ['graph contains no drawable function, points, or segments']);
  const unread = auditStaticGraphViewport({ ...DASHED_BELOW, shading: [{ m: 4, b: 2 }] }).errors;
  assert.equal(unread.length, 1);
  assert.match(unread[0], /graph\.shading\[0\] must be a linear inequality with a relation/);
});

const fakeDocument = () => {
  const element = (tag) => ({
    tag, attributes: {}, children: [], style: {}, textContent: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
  });
  return { createElement: element, createElementNS: (_ns, tag) => element(tag), createTextNode: (text) => ({ tag: '#text', textContent: text, children: [] }) };
};
const findAll = (node, tag, found = []) => {
  if (!node) return found;
  if (node.tag === tag) found.push(node);
  (node.children || []).forEach((child) => findAll(child, tag, found));
  return found;
};

test('the printed worksheet draws the same dashes, vertical lines and shading, and a typed question\'s named graphs', () => {
  const previous = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    const printed = renderWorksheetVisual({ kind: 'graph', graph: TWO_SIDES, label: 'Graph' });
    assert.equal(findAll(printed, 'polygon').filter((node) => node.attributes['data-shaded-region'] === '').length, 2, 'both shaded sides');
    const dashes = findAll(printed, 'path').map((node) => node.attributes['stroke-dasharray'] ?? null);
    assert.deepEqual(dashes, [null, '7 4'], 'the solid line solid, the dashed line dashed');
    const vertical = renderWorksheetVisual({ kind: 'graph', graph: VERTICAL_LEFT, label: 'Graph' });
    assert.ok(findAll(vertical, 'line').some((node) => node.attributes['stroke-dasharray'] === '7 4'), 'the dashed vertical boundary');
  } finally {
    globalThis.document = previous;
  }
  const visuals = printableVisualsFromResolvedQuestion({
    type: 'multiAnswer',
    candidateGraphs: [{ id: 'a', label: 'Graph a', graph: DASHED_BELOW }, { id: 'b', label: 'Graph b', graph: VERTICAL_LEFT }],
    candidateGraphsInOrder: true,
  });
  assert.deepEqual(visuals.find((visual) => visual.kind === 'graphChoices')?.graphs.map((graph) => graph.label), ['Graph a', 'Graph b']);
});

/* ------------------------------------------------ the sort's reference line */

test('a figure sort draws its reference line on every graph, says it is one, and names it above the cards', async () => {
  const { default: FigureMatchStage } = await capture.load('/src/platform/workflow/FigureMatchStage.jsx');
  const window = { xMin: -6, xMax: 6, yMin: -6, yMax: 6, equalUnits: true, referenceLine: { m: 2, b: 1, label: 'y = 2x + 1' } };
  const stage = {
    id: 'sort',
    kind: 'figureMatch',
    items: [{ id: 'f1', graph: { ...window, model: '2*x - 4' } }, { id: 'f2', graph: { ...window, model: '-0.5*x + 3' } }, { id: 'f4', math: '2y = −x + 8' }],
    categories: [{ id: 'par', label: 'Parallel to y = 2x + 1' }, { id: 'perp', label: 'Perpendicular to y = 2x + 1' }, { id: 'neither', label: 'Neither' }],
  };
  const { markup, entries } = capture.render(React.createElement(FigureMatchStage, { stage, value: null, onChange: () => {} }));
  // (The key's own swatch is drawn the same way, from x = 1 to 33.)
  const references = [...markup.matchAll(/<line x1="([^"]+)" y1="[^"]+" x2="[^"]+" y2="[^"]+" stroke="#8a3ffc" stroke-width="3" stroke-dasharray="7 5"/g)]
    .filter(([, x1]) => x1 !== '1');
  assert.equal(references.length, 2, 'one reference line on each graph, none on the equation card');
  assert.match(markup, /<p data-reference-line-key=""[^>]*>[\s\S]*?The dashed line on each graph is the reference line, y = 2x \+ 1\.<\/span><\/p>/);
  const graphs = entries.filter((entry) => /^Figure \d/.test(entry.label));
  assert.equal(graphs.length, 2);
  graphs.forEach((entry) => {
    assert.match(entry.text, /1 reference line\. 1 curve\./, entry.text);
    assert.equal(sayFigure(entry.say, esFigures.words).includes('1 recta de referencia.'), true);
  });
  // Without one, the figures are drawn as before.
  const plain = capture.render(React.createElement(FigureMatchStage, { stage: { ...stage, items: stage.items.map((item) => (item.graph ? { ...item, graph: { ...item.graph, referenceLine: undefined } } : item)) }, value: null, onChange: () => {} }));
  assert.doesNotMatch(plain.markup, /stroke="#8a3ffc"|data-reference-line-key/);
});
