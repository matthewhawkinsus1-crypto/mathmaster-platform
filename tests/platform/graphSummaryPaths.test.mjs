/*
 * A CURVE DRAWN IN MANY PIECES IS ONE CONNECTED PATH TO A SCREEN READER (AX27).
 *
 * The checked graph of a relationship model draws its curve as 64 short pieces
 * (WorkflowRunner's sampleModelSegments). GraphDisplay handed each to the
 * graph description as a path of its own, and the summary said "64 connected
 * paths. 6 points." (Algebra 1 DOL 3 walkthrough, F-A11Y-64-PATHS); once the
 * question closed it went on to give 64 sentences and 64 table blocks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describeCoordinatePlane, joinSegmentPaths } from '../../src/platform/language/graphDescription.js';

// 64 pieces end to end, as sampleModelSegments draws a curve: each piece starts
// where the one before it ended.
const SAMPLES = Array.from({ length: 65 }, (_, index) => [index / 8, (index / 8) ** 2 / 4]);
const pieces = SAMPLES.slice(1).map((end, index) => [SAMPLES[index], end]);

test('pieces drawn end to end join into one path, in order', () => {
  const paths = joinSegmentPaths(pieces);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].length, 65, 'every sample is on the path');
  assert.deepEqual(paths[0][0], SAMPLES[0]);
  assert.deepEqual(paths[0][64], SAMPLES[64]);
});

test('a gap, or a piece that does not start where the last ended, starts a new path', () => {
  assert.equal(joinSegmentPaths([[[0, 0], [1, 1]], [[1, 1], [2, 0]], [[5, 5], [6, 6]]]).length, 2);
  // The curve has a hole in it (an undefined sample): two paths, not one.
  assert.equal(joinSegmentPaths([...pieces.slice(0, 10), ...pieces.slice(12)]).length, 2);
  assert.equal(joinSegmentPaths([[[0, 0], [1, 1]], [[0, 0], [1, 1]]]).length, 2, 'the same piece twice is not a continuation');
});

test('only pieces with two readable ends are paths; nothing is a path', () => {
  assert.deepEqual(joinSegmentPaths(), []);
  assert.deepEqual(joinSegmentPaths([]), []);
  assert.deepEqual(joinSegmentPaths([[[0, 0]], [null, [1, 1]], 'x', [[0, 0], [Number.NaN, 1]]]), []);
  // Points may be pairs or {x, y}, as the plane reads them.
  assert.equal(joinSegmentPaths([[{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 2, y: 4 }]]).length, 1);
});

test('the description says one path, however many pieces drew it', () => {
  const open = describeCoordinatePlane({ xMin: -2, xMax: 10, yMin: -2, yMax: 20, polylines: joinSegmentPaths(pieces), points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  assert.match(open.description, /1 connected path\./);
  assert.doesNotMatch(open.description, /64|connected paths/);
  const closed = describeCoordinatePlane({ xMin: -2, xMax: 10, yMin: -2, yMax: 20, detail: 'features', polylines: joinSegmentPaths(pieces) });
  assert.equal((closed.description.match(/Connected path \d+ through/g) || []).length, 1, closed.description);
  assert.match(closed.description, /Connected path 1 through .* 53 more\./, 'a long path lists its first corners and says how many more');
  assert.equal(closed.tables.filter((table) => /paths/.test(table.caption)).length, 1);
});

test('the real graph display describes a curve of 64 pieces as one path (open and closed)', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: GraphDisplay } = await server.ssrLoadModule('/src/GraphDisplay.jsx');
    const { QuestionLifecycleProvider } = await server.ssrLoadModule('/src/platform/question/QuestionLifecycleContext.jsx');
    const describe = (lifecycle) => {
      const graph = {
        xMin: -2, xMax: 10, yMin: -2, yMax: 20,
        segments: pieces.map(([from, to]) => ({ from, to })),
        points: [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: x })),
      };
      const figure = React.createElement(GraphDisplay, { graph, enlargeable: false });
      const html = renderToStaticMarkup(lifecycle ? React.createElement(QuestionLifecycleProvider, lifecycle, figure) : figure);
      const text = html.match(/<p id="[^"]*" data-graph-description=""[^>]*>([^<]*)<\/p>/);
      assert.ok(text, 'the graph has its description paragraph');
      return text[1].replace(/&#x27;/g, "'");
    };
    const open = describe(null);
    assert.match(open, /1 connected path\. 6 points\./, open);
    assert.doesNotMatch(open, /64/);
    const closed = describe({ terminal: true, positionsReadable: true });
    assert.equal((closed.match(/Connected path \d+ through/g) || []).length, 1, closed);
  } finally {
    await server.close();
  }
});
