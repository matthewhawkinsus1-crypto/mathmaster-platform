// THE DIGITAL SAT REFERENCE SHEET, HELD TO THE PUBLISHED ONE.
//
// A practice test that says "Reference sheet available" must show the sheet a
// student has on test day: the College Board's eleven figures with their
// formulas and three facts — not fewer (a missing sphere is a wrong answer
// waiting to happen) and not more (an extra formula is help the real test does
// not give). The data is src/platform/assessment/satReferenceSheet.js; the
// figures are drawn in src/components/assessment/SatReferenceSheet.jsx.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SAT_REFERENCE_FACTS, SAT_REFERENCE_FIGURES, SAT_REFERENCE_SHEET, SAT_REFERENCE_SHEET_ID } from '../../src/platform/assessment/satReferenceSheet.js';
import { REFERENCE_SHEETS } from '../../src/platform/assessment/secureExamTools.js';
import { EXAM_POLICIES } from '../../src/platform/policies/examPolicyResolver.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const compact = (latex) => String(latex).replace(/\\;|\s+/g, '');

const PUBLISHED = {
  circle: ['A=\\pir^2', 'C=2\\pir'],
  rectangle: ['A=\\ellw'],
  triangle: ['A=\\frac{1}{2}bh'],
  rightTriangle: ['c^2=a^2+b^2'],
  special30: ['x,x\\sqrt{3},2x'],
  special45: ['s,s,s\\sqrt{2}'],
  rectangularPrism: ['V=\\ellwh'],
  cylinder: ['V=\\pir^2h'],
  sphere: ['V=\\frac{4}{3}\\pir^3'],
  cone: ['V=\\frac{1}{3}\\pir^2h'],
  rectangularPyramid: ['V=\\frac{1}{3}\\ellwh'],
};

test('the sheet has the eleven published figures with exactly their formulas, in order', () => {
  assert.deepEqual(SAT_REFERENCE_FIGURES.map((entry) => entry.id), Object.keys(PUBLISHED));
  for (const entry of SAT_REFERENCE_FIGURES) {
    assert.deepEqual(entry.formulas.map((item) => compact(item.latex)), PUBLISHED[entry.id], entry.id);
  }
});

test('the special right triangles carry their side relationships and angles', () => {
  const byId = Object.fromEntries(SAT_REFERENCE_FIGURES.map((entry) => [entry.id, entry]));
  assert.match(byId.special30.description, /30°-60°-90°/);
  assert.match(byId.special30.description, /across from 30° is x/);
  assert.match(byId.special30.description, /2x/);
  assert.match(byId.special45.description, /45°-45°-90°/);
  assert.match(byId.special45.description, /square root of 2/);
});

test('the three published facts: 360 degrees and 2π radians in a circle, 180 degrees in a triangle', () => {
  assert.deepEqual(SAT_REFERENCE_FACTS.map((fact) => fact.text), [
    'The number of degrees of arc in a circle is 360.',
    'The number of radians of arc in a circle is 2π.',
    'The sum of the measures in degrees of the angles of a triangle is 180.',
  ]);
});

test('every formula has words for a screen reader, and the sheet is the one the SAT policy names', () => {
  for (const entry of SAT_REFERENCE_FIGURES) {
    assert.ok(entry.description.length > 10, `${entry.id} needs a figure description`);
    for (const item of entry.formulas) assert.ok(/[a-z]{2,}/.test(item.spoken) && !/\\/.test(item.spoken), `${entry.id}: ${item.spoken}`);
  }
  assert.equal(SAT_REFERENCE_SHEET.id, SAT_REFERENCE_SHEET_ID);
  assert.equal(SAT_REFERENCE_SHEET_ID, REFERENCE_SHEETS.SAT_MATH);
  assert.equal(EXAM_POLICIES.digitalSAT.formulaSheet, SAT_REFERENCE_SHEET_ID);
});

test('the panel draws a figure for every entry, and renders every entry and fact from the data', () => {
  const source = readFileSync(new URL('../../src/components/assessment/SatReferenceSheet.jsx', import.meta.url), 'utf8');
  const figures = region(source, 'const FIGURES = {', '\n};', 'the figure drawings');
  for (const entry of SAT_REFERENCE_FIGURES) {
    assert.match(figures, new RegExp(`\\n  ${entry.id}: \\(`), `${entry.id} has no drawing: its card would be blank`);
  }
  const content = region(source, 'export function SatReferenceSheetContent', '\n}\n', 'the sheet content');
  assert.match(content, /SAT_REFERENCE_SHEET\.figures\.map\(/);
  assert.match(content, /SAT_REFERENCE_SHEET\.facts\.map\(/);
  assert.match(content, /<MathDisplay value=\{item\.latex\} format="latex" inline ariaLabel=\{item\.spoken\}/, 'formulas are typeset with the platform renderer and named for a screen reader');
  // Static content only: nothing about a question reaches the sheet.
  assert.doesNotMatch(executableSource(source), /question|prompt|answer|solution/i);
});

test('the sheet is a labelled dialog that closes on Escape and gives focus back to its button', () => {
  const source = readFileSync(new URL('../../src/components/assessment/SatReferenceSheet.jsx', import.meta.url), 'utf8');
  const dialog = region(source, 'export function SatReferenceSheetDialog', '\n}\n', 'the dialog');
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /<h2 id=\{titleId\}/);
  const escape = region(dialog, 'onKeyDown={(event) => {', '}}', 'the Escape handler');
  assert.match(escape, /event\.key !== 'Escape'/);
  assert.match(escape, /onClose\?\.\(\)/);
  const launcher = region(source, 'export default function SatReferenceSheet', '\n}\n', 'the launcher');
  const close = region(launcher, 'const close = () => {', '};', 'close');
  assert.match(close, /setOpen\(false\)/);
  assert.match(close, /launcherRef\.current\?\.focus/);
  assert.match(launcher, /<SatReferenceSheetDialog open=\{open\} onClose=\{close\}/);
});

/*
 * THE LABELS ARE ON THE RIGHT SIDES. A drawing with x√3 on the short leg is a
 * wrong reference sheet that every test above would pass, so this reads each
 * triangle's drawing as geometry: the vertices of its polygon, which vertex
 * each angle label (or the right-angle mark) sits at, and which side each
 * length label sits beside.
 */
const FIGURE_SOURCE = readFileSync(new URL('../../src/components/assessment/SatReferenceSheet.jsx', import.meta.url), 'utf8');
const drawing = (id) => {
  const figures = region(FIGURE_SOURCE, 'const FIGURES = {', '\n};', 'the figure drawings');
  const start = figures.indexOf(`\n  ${id}: (`);
  const body = figures.slice(start, figures.indexOf('\n  ),', start));
  const vertices = body.match(/<polygon points="([^"]+)"/)[1].trim().split(/\s+/).map((pair) => pair.split(',').map(Number));
  // A label's (x, y) is its text baseline; its middle is about a third of the
  // font size above (Label: 10px small, 14px otherwise).
  const labels = [...body.matchAll(/<Label x="([\d.]+)" y="([\d.]+)"( small)?>([^<]+)<\/Label>/g)]
    .map((match) => ({ x: Number(match[1]), y: Number(match[2]) - (match[3] ? 10 : 14) / 3, small: Boolean(match[3]), text: match[4] }));
  const mark = body.match(/<polyline points="([^"]+)" \/>/);
  const markPoints = mark ? mark[1].trim().split(/\s+/).map((pair) => pair.split(',').map(Number)) : [];
  return { vertices, labels, markPoints };
};
const toSegment = (point, [a, b]) => {
  const [px, py] = point; const [ax, ay] = a; const [bx, by] = b;
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
};
// The vertex whose corner a point sits in: its largest barycentric weight. An
// angle label sits inside its angle's wedge, which can be nearer in plain
// distance to the next vertex along a long, thin side.
const nearestVertex = (vertices, [px, py]) => {
  const [[ax, ay], [bx, by], [cx, cy]] = vertices;
  const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
  const weightB = ((px - ax) * (cy - ay) - (cx - ax) * (py - ay)) / area;
  const weightC = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)) / area;
  const weights = [1 - weightB - weightC, weightB, weightC];
  return weights.indexOf(Math.max(...weights));
};
// The side opposite vertex i, labelled by whichever length label sits nearest it.
const sideLabel = (figure, oppositeOf) => {
  const others = figure.vertices.filter((unused, index) => index !== oppositeOf);
  const lengths = figure.labels.filter((label) => !label.small);
  return lengths.reduce((best, label) => (toSegment([label.x, label.y], others) < toSegment([best.x, best.y], others) ? label : best)).text;
};
const rightAngleVertex = (figure) => {
  const [sx, sy] = figure.markPoints.reduce(([x, y], [px, py]) => [x + px / figure.markPoints.length, y + py / figure.markPoints.length], [0, 0]);
  return nearestVertex(figure.vertices, [sx, sy]);
};

test('the 30°-60°-90° triangle: x across from 30°, x√3 across from 60°, 2x across from the right angle', () => {
  const figure = drawing('special30');
  const at = (text) => nearestVertex(figure.vertices, (({ x, y }) => [x, y])(figure.labels.find((label) => label.text === text)));
  const thirty = at('30°');
  const sixty = at('60°');
  const right = rightAngleVertex(figure);
  assert.equal(new Set([thirty, sixty, right]).size, 3, 'each angle at its own vertex');
  assert.equal(sideLabel(figure, thirty), 'x');
  assert.equal(sideLabel(figure, sixty), 'x√3');
  assert.equal(sideLabel(figure, right), '2x');
});

test('the 45°-45°-90° triangle: s on both legs, s√2 across from the right angle', () => {
  const figure = drawing('special45');
  const right = rightAngleVertex(figure);
  const legs = [0, 1, 2].filter((index) => index !== right);
  for (const leg of legs) assert.equal(sideLabel(figure, leg), 's');
  assert.equal(sideLabel(figure, right), 's√2');
  const angles = figure.labels.filter((label) => label.text === '45°').map(({ x, y }) => nearestVertex(figure.vertices, [x, y])).sort();
  assert.deepEqual(angles, [...legs].sort(), 'the 45° marks sit at the two acute angles');
});

test('the right triangle: c across from the right angle, a and b on the legs', () => {
  const figure = drawing('rightTriangle');
  const right = rightAngleVertex(figure);
  assert.equal(sideLabel(figure, right), 'c');
  assert.deepEqual([0, 1, 2].filter((index) => index !== right).map((index) => sideLabel(figure, index)).sort(), ['a', 'b']);
});

