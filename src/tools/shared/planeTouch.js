/*
 * HOW THE PLANE MEETS A FINGER (N60).
 *
 * Measured on a 390x844 phone, on the Systems Workspace's −10 to 10 grid
 * (Algebra I M3 T2 L4 and L5): the plane is drawn 302x206 CSS px, so a unit
 * is 12.8 px across and 8.0 px up, and a tap gives the point it aims at only
 * within 6.4 px and 4.0 px of it, under a fingertip several times that size.
 *
 * The plane already shows, while a finger is down, the point a lift will give
 * (the crosshair, the ring and the coordinate chip), and the student can slide
 * to correct it before lifting. But the chip was placed for a mouse: 12 units
 * right of the cursor and 8 above, so on a phone its near end sat 6 px from
 * the finger, under the fingertip. Under a finger it goes ABOVE the fingertip
 * instead, and the lift lands the point it showed (CoordinatePlane.jsx).
 *
 * Where a finger's tap lands is snapped to the grid as a mouse's is, with two
 * differences. It reaches a little past the grid's edge: a press on the 22 px
 * border round a phone's grid used to do nothing, so half the presses aimed at
 * an edge point were lost. And it is always a point inside the window drawn:
 * once zoomed in, a window can end between grid lines, and rounding a press at
 * its edge gave a point outside the grid, where the student could not see it.
 *
 * A mouse and a pen keep what they had. The keyboard's crosshair keeps its one
 * step a key, and stands only on a grid point inside the window (below).
 */

/*
 * How far above the point the chip's lower edge sits under a finger, in CSS
 * px: about the half-width of a fingertip on a phone (5 mm is about 30 CSS px),
 * with a little to spare for the point being up to half a unit from the finger.
 */
export const FINGER_CLEARANCE_PX = 36;

// Kept inside the plane's own box, as the mouse chip is.
const EDGE = 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/*
 * Where the coordinate chip goes, in the plane's own (viewBox) units, for a
 * cursor drawn at (cx, cy).
 *
 * A mouse: beside the cursor, up and to the right, flipped to the other side
 * near the right or top edge (the placement the plane has always used).
 *
 * A finger: centred over the point, its lower edge FINGER_CLEARANCE_PX above
 * it. Where the top rows leave no room above, it goes beside the fingertip on
 * the side with more room, never below it: the hand is below.
 *
 * `scale` is CSS px per viewBox unit (how wide the plane is drawn over its
 * viewBox width); unknown, the clearance is taken in viewBox units.
 */
export const readoutChipSpot = ({ cx, cy, chipWidth, chipHeight, planeWidth, planeHeight, touch = false, scale = 1 }) => {
  if (!touch) {
    const left = cx + 12 + chipWidth > planeWidth - 4 ? cx - 12 - chipWidth : cx + 12;
    const top = cy - 8 - chipHeight < 4 ? cy + 14 : cy - 8 - chipHeight;
    return { left, top };
  }
  const clearance = FINGER_CLEARANCE_PX / (Number(scale) > 0 ? Number(scale) : 1);
  const above = cy - clearance - chipHeight;
  if (above >= EDGE) {
    return { left: clamp(cx - chipWidth / 2, EDGE, planeWidth - EDGE - chipWidth), top: above };
  }
  const roomRight = planeWidth - EDGE - (cx + clearance);
  const roomLeft = cx - clearance - EDGE;
  return {
    left: roomRight >= roomLeft ? cx + clearance : cx - clearance - chipWidth,
    top: clamp(cy - chipHeight, EDGE, planeHeight - EDGE - chipHeight),
  };
};

/*
 * How far outside the grid a finger's press still counts, in CSS px: half the
 * 44 px touch minimum the plane's own buttons keep. It lands on the edge.
 */
export const FINGER_REACH_PX = 22;

const tidy = (value) => Number(Number(value).toFixed(6));

/*
 * The grid value nearest `value` among those inside the window [low, high]:
 * plain rounding wherever the window ends on a grid line (the authored −10 to
 * 10 does), the last line inside where it ends between two (−3.64 to 3.64,
 * three presses of Zoom in). With no grid line inside, plain rounding: the
 * zoom never makes a window narrower than four steps.
 */
export const snapInsideWindow = (value, step, low, high) => {
  if (!Number.isFinite(value)) return null;
  const size = Number(step);
  if (!Number.isFinite(size) || size <= 0) return tidy(value);
  const first = Math.ceil(low / size - 1e-9);
  const last = Math.floor(high / size + 1e-9);
  const nearest = Math.round(value / size);
  return tidy((first <= last ? clamp(nearest, first, last) : nearest) * size);
};

/*
 * WHERE THE KEYBOARD'S CROSSHAIR STANDS (found by N60, on laptops too).
 *
 * The arrow keys move it one grid step at a time. Zoomed in, a window can end
 * between grid lines (the Systems Workspace's −6 to 8 after two presses of Zoom
 * in ends at x = 4.571429), and the crosshair stopped at the edge itself,
 * where Enter plotted "Point 1 (4.571429, 0)". It now stands only on a grid
 * point inside the window drawn, so at an edge it stops at the last grid line
 * inside. It is held to the authored graph as well, as a press is: zoomed out,
 * the window shows more than the question asks about, and a press there lands
 * on the authored edge (CoordinatePlane.jsx).
 */
export const keyboardGridPoint = ([x, y], step, view, domain = view) => [
  snapInsideWindow(x, step, Math.max(view.xMin, domain.xMin), Math.min(view.xMax, domain.xMax)),
  snapInsideWindow(y, step, Math.max(view.yMin, domain.yMin), Math.min(view.yMax, domain.yMax)),
];

/*
 * WHICH PLACED POINT A PRESS PICKS UP (found by N60, on laptops too).
 *
 * A press is snapped to the grid before it is asked about (a finger's and a
 * mouse's alike; the keyboard's crosshair stands on the grid), so this is a
 * question about grid points. A press picks a placed point up only when it
 * landed on that point's own grid point, or, for a point between grid lines,
 * on a grid point nearest it. A press on any other grid point places a new
 * point there. It used to pick up any point within 18 drawing units, and on a
 * −10 to 10 grid a row is 14.8, so a press on the grid point just above or
 * below a placed point picked that point up and moved it there.
 *
 * The target that picks a point up is therefore its whole grid cell, every
 * press the plane shows on that grid point: as large as the grid allows, and
 * at least the 44 px touch minimum wherever a cell is that large (a zoomed-in
 * plane). `step` is the plane's grid step (its drawn grid when it does not
 * snap, where a press is not snapped either).
 */
export const pressPicksUpPoint = ([pressX, pressY], [pointX, pointY], step) => {
  const size = Number(step) > 0 ? Number(step) : 1;
  const half = size / 2 + size * 1e-6;
  return Math.abs(pressX - pointX) <= half && Math.abs(pressY - pointY) <= half;
};
