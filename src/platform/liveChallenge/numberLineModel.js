/*
 * AN INEQUALITY'S NUMBER LINE, AS GEOMETRY (Inequality Graphing Rush).
 *
 * Where each number sits on a line drawn `width` CSS pixels wide, which
 * numbers get a label at that width, which number a tap or a keyboard cursor
 * lands on, and what a drawing (numberLineSets.mjs) puts on the line: shaded
 * pieces, dots and "keeps going" arrows. Pure, so the screen
 * (InequalityNumberLine.jsx) only paints, and node tests hold the geometry.
 */

import { drawingSet } from '../../../functions/shared/numberLineSets.mjs';

// Room at each end for the line's own arrowheads, past the first and last tick.
const END_ROOM_MIN = 26;
const END_ROOM_MAX = 44;
// The narrowest gap between labels that still reads (a label like "−10").
const LABEL_ROOM = 27;

const round6 = (value) => {
  const clean = Math.round(value * 1e6) / 1e6;
  return clean === 0 ? 0 : clean;
};

/** Where each number sits, for a line `width` px wide. */
export const numberLineLayout = (line, width) => {
  const min = Number(line?.min ?? -10);
  const max = Number(line?.max ?? 10);
  const step = Number(line?.step) > 0 ? Number(line.step) : 1;
  const pad = Math.max(END_ROOM_MIN, Math.min(END_ROOM_MAX, width * 0.05));
  const usable = Math.max(1, width - 2 * pad);
  const xOf = (value) => pad + ((value - min) / (max - min)) * usable;
  const valueAt = (px) => min + ((px - pad) / usable) * (max - min);
  const count = Math.round((max - min) / step);
  const spacing = usable / Math.max(1, count);
  // Every number when the labels fit, else every second, else every fifth.
  const labelEvery = [1, 2, 5, 10].find((every) => spacing * every >= LABEL_ROOM) || 10;
  const ticks = Array.from({ length: count + 1 }, (_, index) => {
    const value = round6(min + index * step);
    return Object.freeze({ value, x: xOf(value), labeled: index % labelEvery === 0 || value === 0 });
  });
  return Object.freeze({ min, max, step, pad, usable, xOf, valueAt, ticks: Object.freeze(ticks), left: 4, right: width - 4 });
};

/** The number a tap `px` from the line's left edge lands on: the nearest tick on the line. */
export const numberAtPixel = (line, width, px) => {
  const layout = numberLineLayout(line, width);
  const raw = layout.valueAt(Number(px));
  if (!Number.isFinite(raw)) return null;
  const snapped = round6(Math.round(raw / layout.step) * layout.step);
  return Math.max(layout.min, Math.min(layout.max, snapped));
};

/** The keyboard cursor moved by a key: ←/→ a tick (Shift: five), Home/End the ends. */
export const moveLineCursor = (line, value, key, { large = false } = {}) => {
  const min = Number(line?.min ?? -10);
  const max = Number(line?.max ?? 10);
  const step = Number(line?.step) > 0 ? Number(line.step) : 1;
  const by = (large ? 5 : 1) * step;
  let next = Number(value) || 0;
  if (key === 'ArrowLeft' || key === 'ArrowDown') next -= by;
  else if (key === 'ArrowRight' || key === 'ArrowUp') next += by;
  else if (key === 'Home') next = min;
  else if (key === 'End') next = max;
  return round6(Math.max(min, Math.min(max, next)));
};

export const isLineCursorKey = (key) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key);

const MINUS = '−';
export const formatLineNumber = (value) => (value < 0 ? `${MINUS}${Math.abs(value)}` : String(value));

/** What a screen reader hears at the cursor: the number, and the dot on it. */
export const describeLineCursor = (drawing, value) => {
  const dot = (drawing?.points || []).find((point) => point.value === value);
  if (!dot) return formatLineNumber(value);
  return `${formatLineNumber(value)}, ${dot.closed ? 'closed dot' : 'open dot'}`;
};

/**
 * What a drawing puts on the line, in px: the shaded pieces of the set it
 * means (an end at infinity runs to the line's end), its dots, and the
 * arrows it has on — shown even before the drawing names a set, so a pressed
 * ◀ is visible at once.
 */
export const numberLineMarks = (line, width, drawing) => {
  if (!drawing) return null;
  const layout = numberLineLayout(line, width);
  const set = drawingSet(drawing) || [];
  return Object.freeze({
    bands: Object.freeze(set.map((piece) => {
      const from = piece.lo === null ? layout.left : layout.xOf(piece.lo.n / piece.lo.d);
      const to = piece.hi === null ? layout.right : layout.xOf(piece.hi.n / piece.hi.d);
      return Object.freeze({ from, to, single: piece.lo !== null && piece.hi !== null && piece.lo.n * piece.hi.d === piece.hi.n * piece.lo.d });
    })),
    dots: Object.freeze((drawing.points || []).map((point) => Object.freeze({ x: layout.xOf(point.value), value: point.value, closed: point.closed === true }))),
    arrows: Object.freeze({ left: drawing.left === true ? layout.left : null, right: drawing.right === true ? layout.right : null }),
  });
};
