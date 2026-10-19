/*
 * THE LEGACY GRAPH WORKSPACE, IN WORDS (WCAG 2.1 1.1.1; student pass 3, Q-8).
 *
 * InteractiveGraphWorkspace (function graphs, graph analysis) draws its own
 * plane, outside CoordinatePlane, and was named by its key commands only:
 * "Coordinate plane. Use the arrow keys to move the cursor…". A screen-reader
 * student could not hear which points they had placed, whether their curve
 * was drawn, or which graph ends they had marked. Pure: no React, no DOM.
 *
 * WHAT IT MAY SAY.
 *
 *   - The student's own work, exactly as placed: each point by the label the
 *     plane draws beside it and its coordinates, the strokes they drew, the
 *     graph-end markers they put down, the points they selected. It is their
 *     work; reading it back reveals nothing they did not do.
 *   - A given graph (analysis mode) only as "a graph is drawn": its shape is
 *     what the questions beside it ask about, the same rule the shared plane
 *     keeps while a question can be answered (graphDescription.js, 'kinds').
 *   - Never whether anything is right.
 */
import { formatNumber } from './graphDescription.js';

const pair = (point) => `(${formatNumber(point[0])}, ${formatNumber(point[1])})`;
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const MARKER_WORDS = { open: 'an open dot', closed: 'a closed dot', arrow: 'an arrow' };

/**
 * describeGraphWorkspace({ window, givenGraph, placedPoints, strokeCount, curveDrawn, markers, selectedPoints })
 *
 *   placedPoints    [{ label, point: [x, y] }]
 *   markers         [{ type: 'open' | 'closed' | 'arrow', point: [x, y] }]
 *   selectedPoints  [[x, y]]
 */
export const describeGraphWorkspace = ({
  window = {},
  givenGraph = false,
  placedPoints = [],
  strokeCount = 0,
  curveDrawn = false,
  markers = [],
  selectedPoints = [],
} = {}) => {
  const sentences = [`x from ${formatNumber(window.xMin ?? -10)} to ${formatNumber(window.xMax ?? 10)}, y from ${formatNumber(window.yMin ?? -10)} to ${formatNumber(window.yMax ?? 10)}.`];
  if (givenGraph) sentences.push('A graph is drawn. Positions on it are not read out while this question can be answered.');
  const placed = placedPoints.filter((entry) => Array.isArray(entry?.point));
  if (placed.length) {
    sentences.push(`You placed ${plural(placed.length, 'point')}: ${placed.map((entry) => `${entry.label ? `${entry.label} at ` : ''}${pair(entry.point)}`).join('; ')}.`);
  }
  if (curveDrawn) sentences.push('Your curve is drawn through your points.');
  else if (strokeCount > 0) sentences.push(`You drew ${plural(strokeCount, 'stroke')}.`);
  const ends = markers.filter((entry) => entry && Array.isArray(entry.point) && MARKER_WORDS[entry.type]);
  if (ends.length) sentences.push(`Graph ends you marked: ${ends.map((entry) => `${MARKER_WORDS[entry.type]} at ${pair(entry.point)}`).join('; ')}.`);
  const selected = selectedPoints.filter(Array.isArray);
  if (selected.length) sentences.push(`You selected ${plural(selected.length, 'point')}: ${selected.map(pair).join('; ')}.`);
  if (sentences.length === 1) sentences.push('Nothing is placed yet.');
  return sentences.join(' ');
};
