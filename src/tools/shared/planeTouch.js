/*
 * HOW CLOSE A FINGER MUST LAND TO PICK UP A PLOTTED POINT.
 *
 * The radius was 18 viewBox units: about 10 CSS px on a 390px phone, where the
 * plane is drawn at roughly 60% of its 560-unit viewBox. A student who pressed
 * just beside P2 to drag it plotted a new point instead (pass 3, TOOL-11).
 * The radius grows toward PICK_UP_PX CSS pixels, but never past 45% of a snap
 * cell: a press in the next cell is a new point there (the Systems tool plots
 * boundary points one cell apart), not a move of its neighbour. It is never
 * less than the 18 units a full-size plane already used. On a dense phone grid
 * that leaves it at 18; a missed drag there is caught by Graphing replacing
 * the nearest point instead of restarting the line (placePoint.js).
 */
export const PICK_UP_PX = 22;
const MIN_RADIUS_UNITS = 18;
// The keyboard crosshair lands exactly on a cell: it picks up only the point
// in that cell, never a neighbour a finger's radius would reach.
export const KEYBOARD_PICK_UP_RADIUS = MIN_RADIUS_UNITS;

/**
 * The pick-up radius in viewBox units for a plane drawn `renderedWidth` px wide
 * whose snap cells are `cellUnits` viewBox units apart.
 */
export const pickUpRadius = (viewBoxWidth, renderedWidth, cellUnits = Infinity, minimumPx = PICK_UP_PX) => {
  const box = Number(viewBoxWidth);
  const rendered = Number(renderedWidth);
  if (!(box > 0) || !(rendered > 0)) return MIN_RADIUS_UNITS;
  const cell = Number(cellUnits) > 0 ? Number(cellUnits) : Infinity;
  return Math.max(MIN_RADIUS_UNITS, Math.min(minimumPx * (box / rendered), 0.45 * cell));
};
