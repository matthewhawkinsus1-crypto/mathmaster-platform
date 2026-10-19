/*
 * EQUAL UNITS ON AN INTERACTIVE PLANE (student pass 3, R-1).
 *
 * CoordinatePlane draws its window in a 560 x 380 box, so a square window drew
 * a unit of y about two thirds as tall as a unit of x. Where the angle is the
 * point (perpendicular lines), an author turns on `equalUnits` and the plane's
 * height follows the window instead. The window, the snap and every plotted
 * coordinate stay exactly as they were.
 */
// A tall window would make the plane taller than a laptop screen: the height
// is kept between a third and one and a half widths of plot, and outside
// that range the units are as near equal as fits.
export const equalUnitPlaneHeight = ({ width, pad, xMin, xMax, yMin, yMax, fallback }) => {
  const xSpan = Number(xMax) - Number(xMin);
  const ySpan = Number(yMax) - Number(yMin);
  if (!(xSpan > 0) || !(ySpan > 0)) return fallback;
  const plotWidth = width - pad * 2;
  const plotHeight = Math.min(plotWidth * 1.5, Math.max(plotWidth / 3, plotWidth * (ySpan / xSpan)));
  return Math.round(plotHeight + pad * 2);
};
