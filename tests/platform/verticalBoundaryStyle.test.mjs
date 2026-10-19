// A VERTICAL BOUNDARY IS DRAWN THE WAY ITS KEY SAYS (PR #480, "found, not fixed").
//
// On a live Test the "Read a feasible region" item drew x = 5 of x ≤ 5 dashed
// while its key expected "solid": an authored vertical line reached
// CoordinatePlane's `verticalLines` as a bare number, and every vertical line
// was drawn as a dashed guide. A vertical boundary now keeps its style; a bare
// number is still a guide and looks exactly as before.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDARY_DASH,
  GUIDE_DASH,
  boundaryDash,
  verticalLineDrawing,
  verticalLineDrawings,
} from '../../src/platform/graph/verticalLineStyle.js';
import { describeCoordinatePlane } from '../../src/platform/language/graphDescription.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

test('an inclusive vertical boundary is solid, a strict one dashed — as for any other boundary', () => {
  assert.equal(verticalLineDrawing({ x: 5, boundaryStyle: 'solid' }).dash, undefined);
  assert.equal(verticalLineDrawing({ x: 5, boundaryStyle: 'dashed' }).dash, BOUNDARY_DASH);
  for (const relation of ['<=', '>=', '≤', '≥']) assert.equal(verticalLineDrawing({ x: 5, relation }).dash, undefined, relation);
  for (const relation of ['<', '>']) assert.equal(verticalLineDrawing({ x: 5, relation }).dash, BOUNDARY_DASH, relation);
  // The author's chosen style wins over a relation that disagrees with it.
  assert.equal(verticalLineDrawing({ x: 5, boundaryStyle: 'solid', relation: '<' }).dash, undefined);
  // A boundary with no style is solid, as an unstyled `lines` entry is.
  assert.equal(verticalLineDrawing({ x: 5 }).dash, undefined);
  // An explicit dash (the `lines` contract) is used as given.
  assert.equal(verticalLineDrawing({ x: 5, dash: '2 2' }).dash, '2 2');
});

test('a bare number is a decorative guide and keeps today\'s dashed look', () => {
  assert.deepEqual(verticalLineDrawing(3), { x: 3, dash: GUIDE_DASH, stroke: '#8a3ffc', strokeWidth: 2, boundary: false });
  assert.equal(GUIDE_DASH, '7 5');
  assert.deepEqual(verticalLineDrawings([3, 'x', { x: 'no' }, { x: 5, boundaryStyle: 'solid' }]).map((line) => line.x), [3, 5]);
});

test('the dash rule non-vertical boundaries use is the same function', () => {
  assert.equal(boundaryDash({ boundaryStyle: 'dashed' }), BOUNDARY_DASH);
  assert.equal(boundaryDash({ boundaryStyle: 'solid' }), undefined);
  assert.equal(boundaryDash({}), undefined);
});

test('a screen reader hears the style that is drawn', () => {
  const features = describeCoordinatePlane({
    detail: 'features', minorGridDrawn: true,
    verticalLines: [{ x: 5, boundaryStyle: 'solid' }, 3],
  });
  assert.match(features.description, /Solid vertical line through 5 on the x-axis\./);
  assert.match(features.description, /Dashed vertical line through 3 on the x-axis\./);
  const kinds = describeCoordinatePlane({
    detail: 'kinds', xMin: -10, xMax: 10, yMin: -10, yMax: 10,
    verticalLines: [{ x: 5, relation: '<=' }],
  });
  assert.match(kinds.description, /1 solid vertical line\./);
  assert.doesNotMatch(kinds.description, /dashed vertical/);
});

test('the plane draws each vertical line from its drawing, and the stimulus hands a vertical boundary its style', () => {
  const plane = executableSource(componentSource('src/tools/shared/CoordinatePlane.jsx'));
  const verticalDraw = region(plane, 'verticalLineDrawings(verticalLines).map(', 'horizontalLines.map(', 'vertical line drawing');
  assert.match(verticalDraw, /strokeDasharray=\{line\.dash\}/);
  assert.doesNotMatch(verticalDraw, /strokeDasharray="/, 'a literal dash would draw every vertical line the same');

  const stimulus = executableSource(componentSource('src/components/student/PathQuestionStimulus.jsx'));
  const verticals = region(stimulus, 'const verticalLines = resolvedLines', 'const points =', 'stimulus vertical lines');
  assert.match(verticals, /boundaryStyle:\s*line\.entry\?\.boundaryStyle/);
  assert.match(region(stimulus, '<CoordinatePlane', '/>', 'stimulus plane'), /verticalLines=\{verticalLines\}/);
});
