/*
 * WHERE A STATIC GRAPH'S Y-AXIS TITLE GOES (P-3).
 *
 * GraphDisplay.jsx writes the y-axis title turned on its side at a fixed
 * x = 15 in the figure's 620-unit-wide frame, and each y tick label ends 9
 * units left of the y-axis. With the axis at the left edge of the plot, a
 * four-digit label is about 31 units wide in CI's font (DejaVu Sans, 12
 * units), so "1500" and "1000" ran under "Total sales, f(b) (dollars)" on the
 * sales graphs of Algebra I M3 T1 L3 (student walkthrough, 2026-11-06).
 *
 * The title now sits clear of the widest label. Where the frame's left margin
 * cannot hold both, it widens by just what they need; a graph with no y-axis
 * title, or labels short enough, is laid out exactly as before.
 */

/** A label's width in figure units at the labels' 12-unit size: a wide font's digit, sign and point (DejaVu Sans). */
const LABEL_CHAR = { digit: 7.7, minus: 4.4, point: 3.9 };
export const tickLabelWidth = (tick) => [...String(tick)].reduce((width, char) => (
  width + (char === '-' || char === '−' ? LABEL_CHAR.minus : char === '.' ? LABEL_CHAR.point : LABEL_CHAR.digit)
), 0);

// The title, 14 units bold, turned on its side: its letters rise to the left
// of its baseline and its descenders reach right of it.
const TITLE_ASCENT = 10.6;
const TITLE_DESCENT = 3.4;
const TITLE_X = 15;
const EDGE = 2;
const GAP = 4;
// Where a label ends: this far left of the y-axis (GraphDisplay.jsx).
const LABEL_TO_AXIS = 9;

/**
 * @param {object} input
 * @param {number} input.width       the frame's width (620)
 * @param {number} input.padding     the frame's margin on every side (48)
 * @param {number} input.axisFraction where the y-axis crosses the plot, 0 at its left edge, 1 at its right
 * @param {number} input.labelWidth  the widest y tick label shown (tickLabelWidth), 0 for none
 * @param {boolean} input.hasTitle   a y-axis title is shown
 * @returns {{ left: number, titleX: number }} the left margin and the title's baseline x
 */
export const yAxisTitleLayout = ({ width = 620, padding = 48, axisFraction = 0, labelWidth = 0, hasTitle = false } = {}) => {
  if (!hasTitle || !(labelWidth > 0)) return { left: padding, titleX: TITLE_X };
  const fraction = Math.min(1, Math.max(0, Number(axisFraction) || 0));
  // The labels' left end, for a left margin `left` (the plot narrows as it grows).
  const labelsLeft = (left) => left + fraction * (width - left - padding) - LABEL_TO_AXIS - labelWidth;
  // The title fits between the frame's edge and the labels at this baseline or left of it.
  const roomFor = (left) => labelsLeft(left) - TITLE_DESCENT - GAP;
  let left = padding;
  if (roomFor(left) < EDGE + TITLE_ASCENT && fraction < 1) {
    left = Math.ceil(padding + (EDGE + TITLE_ASCENT - roomFor(padding)) / (1 - fraction));
  }
  return { left, titleX: Math.min(TITLE_X, roomFor(left)) };
};
