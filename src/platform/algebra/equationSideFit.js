/*
 * HOW BIG ONE SIDE OF A STEP ALGEBRA EQUATION IS DRAWN, AND WHEN IT SCROLLS.
 *
 * The board (StepByStepAlgebraCore.jsx AutoFitEquationExpression) measures a
 * side and asks this module for its size. Sizes are in units of --mm-px (one
 * CSS pixel at the default text size), so the equation grows with the
 * student's text-size setting (WCAG 1.4.4).
 *
 * The width an expression takes is proportional to its size, so one
 * measurement at any size says how wide it is per unit (`widthPerUnit`), and
 * the size that fits follows from that alone. Deriving it from the current
 * size and a fresh ratio instead made the size chase its own width (the
 * "pulsing" students saw near the fit boundary).
 *
 * P-6 (student walkthrough, 2026-11-06): on a 390-px phone a long side was cut
 * off with nothing to scroll to. A phone draws a side at most 20 units
 * (`cap`, from App.css), fitting wins over size down to a 17-px floor, and a
 * side still too wide at the floor scrolls (`scrolls`) instead of being cut.
 */

/** Fitting wins over size, but not past this: 17 CSS pixels at any text size. */
export const EQUATION_FIT_FLOOR_PX = 17;

/** The share of the room a fitted side takes, leaving a little air at its ends. */
const FIT_SHARE = 0.975;

const positive = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

/**
 * The size to draw a side at.
 *
 * @param {object} input
 * @param {number} input.available the width the side may take, in CSS px
 * @param {number} input.rendered  the side's width now, in CSS px
 * @param {number} input.units     the size it is drawn at now (units of --mm-px)
 * @param {number} input.base      the largest size for this side (by its length)
 * @param {number} [input.cap]     a smaller largest size where the screen sets one (a phone: 20)
 * @param {number} [input.pxPerUnit] CSS px per unit at the student's text size
 * @param {boolean} [input.wraps]  the side is laid out to the room's width and
 *   wraps its tokens (an open structure tool on a phone, StepByStepAlgebra.css)
 * @param {number} [input.box]     the width of the box the side is drawn in;
 *   the fit aims a little inside it (`available`), and the side scrolls only
 *   when it is wider than the box itself (defaults to `available`)
 * @returns {{ size: number, scrolls: boolean, widthPerUnit: number }}
 *   `size` in units; `scrolls` when the side is wider than its box even at the
 *   floor; `widthPerUnit` the measured width per unit of size.
 */
export const fitEquationSide = ({ available, rendered, units, base, cap = null, pxPerUnit = 1, wraps = false, box = null } = {}) => {
  const room = positive(available, 1);
  const widthPerUnit = positive(rendered, 1) / positive(units, 1);
  const top = Math.min(positive(base, 34), positive(cap, Infinity));
  // Wrapped tokens fit by wrapping: its width is the room's, whatever its
  // size, so shrinking it would only make the tokens smaller.
  if (wraps) return { size: top, scrolls: false, widthPerUnit };
  const floor = EQUATION_FIT_FLOOR_PX / positive(pxPerUnit, 1);
  const size = Math.max(floor, Math.min(top, (room / widthPerUnit) * FIT_SHARE));
  return { size, scrolls: sideScrolls({ widthPerUnit, size, box: positive(box, room) }), widthPerUnit };
};

/** Is a side drawn at `size` wider than its box? Then it scrolls (a pixel of rounding aside). */
export const sideScrolls = ({ widthPerUnit, size, box }) => widthPerUnit * size > box + 1;

/*
 * THE FIT WATCHES THE EXPRESSION, NOT ITS OWN SIZE.
 *
 * A side's mathematics (MathLive's <math-span>) is typeset only once it comes
 * on screen, and its fonts may load later still. On a phone the board starts
 * below the fold, so the fit measured a side with no mathematics in it and
 * never measured again: the side was drawn as if it were empty and cut off.
 * So the fit watches the expression's width too, and fits again when the width
 * per unit of size has changed: the expression itself changed. A change of the
 * fit's own making keeps it (the width follows the size), so watching cannot
 * set off a loop. `tolerance` absorbs the few fixed pixels a side has (gaps
 * and borders that do not scale with the size).
 */
export const expressionWidthChanged = ({ fittedWidthPerUnit, rendered, units, tolerance = 0.02 } = {}) => {
  const fitted = Number(fittedWidthPerUnit);
  if (!Number.isFinite(fitted) || fitted <= 0) return true;
  const now = positive(rendered, 1) / positive(units, 1);
  return Math.abs(now - fitted) / fitted > tolerance;
};

/*
 * HOW MUCH OF A PHONE'S BOARD EACH SIDE TAKES.
 *
 * Each side used to get half, so a long side was cut beside a short one with
 * room to spare. Shares in proportion to the sides' lengths shrink both sides
 * by the same factor, which is the largest size that fits them both; a side
 * never takes more than 2.4 times the other's share, so the shorter side (and
 * its "left side" label) keeps room. A laptop keeps its own, gentler rule.
 */
export const phoneSideColumnWeight = (length, otherLength) => {
  const own = Math.max(4, Number(length) || 0);
  const other = Math.max(4, Number(otherLength) || 0);
  return Math.max(1, Math.min(2.4, own / Math.min(own, other)));
};
