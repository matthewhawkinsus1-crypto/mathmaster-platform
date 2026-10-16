/*
 * HOW CLOSE A FINGER MUST LAND TO PICK UP A PLOTTED POINT.
 *
 * The radius was 18 viewBox units: about 10 CSS px on a 390px phone, where the
 * plane is drawn at roughly 60% of its 560-unit viewBox. A student who pressed
 * just beside P2 to drag it plotted a new point instead (pass 3, TOOL-11).
 * The radius is now at least PICK_UP_PX CSS pixels however small the plane is
 * drawn, and never less than the 18 units a full-size plane already used.
 */
export const PICK_UP_PX = 22;
const MIN_RADIUS_UNITS = 18;
// The keyboard crosshair lands exactly on a cell: it picks up only the point
// in that cell, never a neighbour a finger's radius would reach.
export const KEYBOARD_PICK_UP_RADIUS = MIN_RADIUS_UNITS;

/** The pick-up radius in viewBox units for a plane drawn `renderedWidth` px wide. */
export const pickUpRadius = (viewBoxWidth, renderedWidth, minimumPx = PICK_UP_PX) => {
  const box = Number(viewBoxWidth);
  const rendered = Number(renderedWidth);
  if (!(box > 0) || !(rendered > 0)) return MIN_RADIUS_UNITS;
  return Math.max(MIN_RADIUS_UNITS, minimumPx * (box / rendered));
};
