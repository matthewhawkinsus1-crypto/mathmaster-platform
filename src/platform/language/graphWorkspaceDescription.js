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
 *
 * IN THE READER'S LANGUAGE (AX05): each sentence is a message (./figureSay.js)
 * said from GRAPH_WORKSPACE_WORDS in English, and from ./packs/esFigures.js in
 * Spanish under an authored Spanish translation, with the same numbers. The
 * window, a labelled point and a graph end are the sentences the shared plane
 * and the number line already say (the same messages), and a point's label is
 * the item's own words, said as written.
 */
import { formatNumber, GRAPH_WORDS } from './graphDescription.js';
import { NUMBER_LINE_WORDS } from './numberLineDescription.js';
import { itemWords, say, sayFigure } from './figureSay.js';

const pair = (point) => `(${formatNumber(point[0])}, ${formatNumber(point[1])})`;
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
// A graph end the student marked, by the message the number line says it with.
const MARKER_SAYS = { open: 'openDot', closed: 'closedDot', arrow: 'arrowAt' };

/** The workspace's own sentences, by message id, in English (./packs/esFigures.js: Spanish). */
export const GRAPH_WORKSPACE_WORDS = Object.freeze({
  givenGraphDrawn: () => 'A graph is drawn. Positions on it are not read out while this question can be answered.',
  youPlaced: (marks) => `You placed ${plural(marks.length, 'point')}: ${marks.join('; ')}.`,
  curveThroughYourPoints: () => 'Your curve is drawn through your points.',
  youDrewStrokes: (count) => `You drew ${plural(count, 'stroke')}.`,
  graphEndsMarked: (marks) => `Graph ends you marked: ${marks.join('; ')}.`,
  arrowAt: (at) => `an arrow at ${at}`,
  youSelected: (pairs) => `You selected ${plural(pairs.length, 'point')}: ${pairs.join('; ')}.`,
  nothingPlacedYet: () => 'Nothing is placed yet.',
});

// The English of every message the reading says: its own, and the plane's and
// the number line's it shares.
const ENGLISH = Object.freeze({
  window: GRAPH_WORDS.window,
  pointAt: GRAPH_WORDS.pointAt,
  openDot: NUMBER_LINE_WORDS.openDot,
  closedDot: NUMBER_LINE_WORDS.closedDot,
  ...GRAPH_WORKSPACE_WORDS,
});

/**
 * graphWorkspaceReading({ window, givenGraph, placedPoints, strokeCount, curveDrawn, markers, selectedPoints }) → { text, say }
 *
 *   placedPoints    [{ label, point: [x, y] }]
 *   markers         [{ type: 'open' | 'closed' | 'arrow', point: [x, y] }]
 *   selectedPoints  [[x, y]]
 *
 * `text` is the English; `say` the same sentences as messages (AX05).
 */
export const graphWorkspaceReading = ({
  window = {},
  givenGraph = false,
  placedPoints = [],
  strokeCount = 0,
  curveDrawn = false,
  markers = [],
  selectedPoints = [],
} = {}) => {
  const says = [say('window', formatNumber(window.xMin ?? -10), formatNumber(window.xMax ?? 10), formatNumber(window.yMin ?? -10), formatNumber(window.yMax ?? 10))];
  if (givenGraph) says.push(say('givenGraphDrawn'));
  const placed = placedPoints.filter((entry) => Array.isArray(entry?.point));
  if (placed.length) says.push(say('youPlaced', placed.map((entry) => (entry.label ? say('pointAt', itemWords(entry.label), pair(entry.point)) : pair(entry.point)))));
  if (curveDrawn) says.push(say('curveThroughYourPoints'));
  else if (strokeCount > 0) says.push(say('youDrewStrokes', strokeCount));
  const ends = markers.filter((entry) => entry && Array.isArray(entry.point) && MARKER_SAYS[entry.type]);
  if (ends.length) says.push(say('graphEndsMarked', ends.map((entry) => say(MARKER_SAYS[entry.type], pair(entry.point)))));
  const selected = selectedPoints.filter(Array.isArray);
  if (selected.length) says.push(say('youSelected', selected.map(pair)));
  if (says.length === 1) says.push(say('nothingPlacedYet'));
  return { text: sayFigure(says, ENGLISH, { english: true }), say: says };
};

export const describeGraphWorkspace = (input) => graphWorkspaceReading(input).text;
