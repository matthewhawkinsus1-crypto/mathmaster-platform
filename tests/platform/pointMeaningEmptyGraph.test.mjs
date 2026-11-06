// THE POINT-MEANING BUILDER DRAWS NOTHING UNTIL A POINT IS TYPED
// (platform-polish-3; F-MEANING-EMPTY in the 2026-11-06 Algebra I M3 T2
// walkthrough).
//
// "Interpret a Point in Context" draws the student's entry on its graph: a
// ring, a dot, dashed guides and the label "(x, y)". Before anything was
// typed it already drew "(0, 0)": the builder read an empty box as
// Number(''), which is 0, and the graph read a missing value as Number(null),
// which is 0 too.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_POINT_MEANING, buildInterpretationGraph } from '../../functions/shared/toolMath/scenario/contextInterpretationUtils.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const BASE = { xMin: 0, xMax: 600, yMin: 0, yMax: 500, xAxisLabel: 's', yAxisLabel: 'a' };
const CONFIG = {
  responseMode: 'builder',
  target: { coordinates: [300, 150] },
  quantities: { x: { id: 's', name: 'student tickets' }, y: { id: 'a', name: 'adult tickets' } },
};
const highlightFor = (values) => buildInterpretationGraph(BASE, { ...EMPTY_POINT_MEANING, ...values }, CONFIG).interactionHighlight;

test('an empty builder draws no point, no label and no guide', () => {
  for (const values of [{}, { xValue: '', yValue: '' }, { xValue: '  ', yValue: '\t' }, { xValue: null, yValue: undefined }]) {
    const highlight = highlightFor(values);
    assert.equal(highlight.showPoint, false, JSON.stringify(values));
    assert.equal(highlight.label, '');
    assert.equal(highlight.xValue, null);
    assert.equal(highlight.yValue, null);
  }
});

test('one typed value draws its own guide only; both draw the point', () => {
  const half = highlightFor({ xValue: '300' });
  assert.deepEqual([half.xValue, half.yValue, half.showPoint, half.label], [300, null, false, '']);
  const point = highlightFor({ xValue: '300', yValue: '150' });
  assert.deepEqual([point.xValue, point.yValue, point.showPoint, point.label], [300, 150, true, '(300, 150)']);
  // A typed 0 is a value.
  const origin = highlightFor({ xValue: '0', yValue: '0' });
  assert.deepEqual([origin.showPoint, origin.label], [true, '(0, 0)']);
});

test('the graph reads a value nobody typed as no value, never as 0', () => {
  const source = executableSource(readFileSync(new URL('../../src/GraphDisplay.jsx', import.meta.url), 'utf8'));
  const reading = region(source, 'const highlightValue', 'const showHighlightX', 'the highlight reading');
  assert.match(reading, /value === null \|\| value === undefined \|\| String\(value\)\.trim\(\) === '' \? Number\.NaN : Number\(value\)/);
  assert.match(reading, /const highlightX = highlightValue\(interactionHighlight\.xValue\);/);
  assert.match(reading, /const highlightY = highlightValue\(interactionHighlight\.yValue\);/);
});
