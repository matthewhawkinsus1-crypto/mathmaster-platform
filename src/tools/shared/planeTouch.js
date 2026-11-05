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
 * A mouse, a pen and the keyboard keep the chip where it always was.
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
