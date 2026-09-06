// What a student can currently SEE of a plotting workspace's plane.
//
// Split out of InteractiveGraphWorkspace.jsx so the arithmetic that decides
// what is on screen can be tested without a browser, the same way figureMatch.js
// and choicePreview.js sit beside their components.

/**
 * The window a zoom step lands on.
 *
 * Two clamps, and both are load-bearing:
 *
 *   NEVER TIGHTER than two grid steps. Below that the axis numbers collide and
 *   there is nothing left to count, which is the only reason to zoom in.
 *
 *   NEVER WIDER, AND NEVER OUTSIDE, the authored window. The view is a window
 *   ONTO the question's domain, never a replacement for it: a student who could
 *   zoom out past the axes could place a point somewhere the question never
 *   offered, and a student who could pan off the end would lose the graph.
 *
 * Pure, so the arithmetic that decides what a student can see is testable
 * without a browser.
 */
export const zoomedWindow = ({ from, authored, factor, xStep = 1, yStep = 1 }) => {
  const span = (low, high, step, authoredSpan) => Math.min(
    Math.max((high - low) * factor, Math.abs(step) * 2),
    authoredSpan,
  );
  const fit = (centre, width, lo, hi) => {
    let min = centre - width / 2;
    if (min < lo) min = lo;
    if (min + width > hi) min = hi - width;
    return [min, min + width];
  };
  const xSpan = span(from.xMin, from.xMax, xStep, authored.xMax - authored.xMin);
  const ySpan = span(from.yMin, from.yMax, yStep, authored.yMax - authored.yMin);
  const [xMin, xMax] = fit((from.xMin + from.xMax) / 2, xSpan, authored.xMin, authored.xMax);
  const [yMin, yMax] = fit((from.yMin + from.yMax) / 2, ySpan, authored.yMin, authored.yMax);
  return { ...authored, xMin, xMax, yMin, yMax };
};

