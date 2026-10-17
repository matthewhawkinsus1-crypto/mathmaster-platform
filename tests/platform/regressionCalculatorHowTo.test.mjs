/*
 * THE REGRESSION CALCULATOR SAYS HOW TO USE IT, AND ITS ZOOM WORKS
 * (pass 3, TOOL-9 in docs/qa/student-experience-pass-3/04-tools-and-accessibility.md).
 *
 * A first-time student met a desktop-style calculator with no steps
 * (`steps={[]}`) and ＋/− glyphs in the graph's corner that were aria-hidden
 * drawings: pressing them did nothing. Node cannot render the tool, so the
 * wiring is read from source, bound to the TaskCard and to the student's graph;
 * the rendered steps and a zoom that changes the axes are driven in
 * tests/browser/toolFocusAndUndo.mjs (scene "regressionCalculator how-to and zoom").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const source = executableSource(readFileSync(new URL('../../src/tools/regressionCalculator/RegressionCalculator.jsx', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../../src/tools/regressionCalculator/RegressionCalculator.css', import.meta.url), 'utf8');

test('the how-to names the three things a student does: table, regression, read r', () => {
  const card = region(source, '<TaskCard', '/>', 'the TaskCard');
  assert.doesNotMatch(card, /steps=\{\[\]\}/, 'no empty how-to');
  const steps = region(card, 'steps={[', ']}', 'the steps');
  assert.match(steps, /choose table/);
  assert.match(steps, /curve button/);
  assert.match(steps, /Read r/);
});

test('the student graph zooms through the plane\'s own controls, and no drawn controls are left', () => {
  const graph = region(source, 'data-regression-graph', '</section>', 'the student graph');
  const plane = region(graph, '<CoordinatePlane', '/>', 'its plane');
  assert.match(plane, /\n\s*panZoom\n/, 'the plane draws its working Zoom in / Zoom out / Reset view');
  assert.doesNotMatch(graph, /aria-hidden="true">\s*<span>＋/, 'no decorative ＋/− that do nothing');
  assert.doesNotMatch(source + css, /regression-graph-controls/);
});
