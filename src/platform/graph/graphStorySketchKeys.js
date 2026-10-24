/*
 * THE GRAPH STORY SKETCH BY KEYBOARD: POINTS JOINED IN ORDER (AX14).
 *
 * The sketch was freehand and pointer-only (VPAT 2.1.1, 2.5.1), so a
 * keyboard-only or switch student could not finish a Graph Story item. Rather
 * than lean on WCAG's path-dependent exception, the sketch has a keyboard
 * route: the arrow keys move a crosshair over the grid one square at a time
 * (Shift for five), Enter or Space places a point, and the points placed one
 * after another join, in order, into one line — a stroke like any drawn one,
 * graded by the same rule (three points make a sketch, graphStoryMath.mjs).
 * Escape finishes the line, so the next point starts a new one.
 *
 * Positions are said in grid squares from the corner where the axes meet:
 * the sketch has axis names but no numbers.
 *
 * Pure: no React, no DOM.
 */

/** The squares the crosshair moves over: whole grid squares from the axes' corner. */
export const sketchKeyGrid = ({ width, height, pad, step }) => ({
  left: pad,
  bottom: height - pad,
  step,
  columns: Math.floor((width - pad * 2) / step),
  rows: Math.floor((height - pad * 2) / step),
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const MOVES = Object.freeze({
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
});

/** What a key does on the sketch: 'move', 'place', 'finish' or null (not ours). */
export const sketchKeyAction = (event) => {
  if (!event || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (MOVES[event.key]) return 'move';
  if (event.key === 'Enter' || event.key === ' ') return 'place';
  if (event.key === 'Escape') return 'finish';
  return null;
};

/** Where the crosshair starts: the corner where the axes meet. */
export const SKETCH_START = Object.freeze({ column: 0, row: 0 });

/** The crosshair after an arrow key: one square, five with Shift, never off the grid. */
export const moveSketchCursor = (cursor, event, grid) => {
  const [dx, dy] = MOVES[event?.key] || [0, 0];
  const by = event?.shiftKey ? 5 : 1;
  const from = cursor || SKETCH_START;
  return {
    column: clamp(from.column + dx * by, 0, grid.columns),
    row: clamp(from.row + dy * by, 0, grid.rows),
  };
};

/** The crosshair in the drawing's own coordinates. */
export const sketchCursorPoint = (cursor, grid) => ({
  x: grid.left + (cursor?.column ?? 0) * grid.step,
  y: grid.bottom - (cursor?.row ?? 0) * grid.step,
});

/**
 * Place a point. It joins the line being placed when that line is still the
 * last stroke (Undo, a drawn stroke or Clear graph end it); otherwise it
 * starts a new one. Returns the strokes, the line's index and its point count.
 */
export const placeSketchPoint = (strokes, lineIndex, point) => {
  const list = Array.isArray(strokes) ? strokes : [];
  const continuing = Number.isInteger(lineIndex) && lineIndex === list.length - 1 && Array.isArray(list[lineIndex]);
  if (continuing) {
    const line = [...list[lineIndex], point];
    return { strokes: [...list.slice(0, lineIndex), line], lineIndex, count: line.length };
  }
  return { strokes: [...list, [point]], lineIndex: list.length, count: 1 };
};

/** How many points the line being placed has, or 0 when no line is being placed. */
export const sketchLineCount = (strokes, lineIndex) => (
  Number.isInteger(lineIndex) && Array.isArray(strokes) && lineIndex === strokes.length - 1 && Array.isArray(strokes[lineIndex])
    ? strokes[lineIndex].length
    : 0
);

export const sketchCursorWords = (cursor) => `${cursor?.column ?? 0} right, ${cursor?.row ?? 0} up`;

const points = (count) => `${count} ${count === 1 ? 'point' : 'points'}`;

/** What is said when a point is placed. */
export const sketchPlacedWords = (count, cursor) => `Point ${count} placed at ${sketchCursorWords(cursor)}. The line has ${points(count)}.`;

/** What is said when Escape finishes a line. */
export const sketchFinishedWords = (count) => `Line finished with ${points(count)}. The next point starts a new line.`;

/** The keyboard route in words, for a screen reader and for a student who tabs to the sketch. */
export const SKETCH_KEYBOARD_HELP = 'Arrow keys move the crosshair one square (Shift for five). Enter places a point; points join in order into a line. Escape finishes the line.';
