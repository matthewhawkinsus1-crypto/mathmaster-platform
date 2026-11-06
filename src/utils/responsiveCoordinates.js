/*
 * WHERE A TAP LANDS IN THE DRAWING, NOT IN THE BOX.
 *
 * Every MathMaster plane draws with preserveAspectRatio="xMidYMid meet" (also
 * the SVG default): the drawing is scaled uniformly to fit its box and
 * centred. While the box has the viewBox's own aspect ratio a straight
 * box-to-viewBox stretch is the same thing, which is why this used to be one.
 * It stops being true the moment a cap shortens the box — the app-wide
 * "never taller than 70dvh" rule on .mathmaster-responsive-canvas does exactly
 * that on a 1366x768 Chromebook — and then the drawing sits in the middle of a
 * wider box and a straight stretch misplaces every tap by up to the empty band.
 * Measured: the embedded plotting plane at 1366x768 put a click on (6, 10) at
 * (5.5, 10); phone-landscape Work View put (-6, 2) at (-4.5, 2).
 *
 * Uniform scale plus centring offsets is exact for `meet`, and reduces to the
 * old stretch whenever the aspect ratios match.
 */
export const clientPointToViewBox = ({ clientX, clientY, rect, viewBoxWidth, viewBoxHeight }) => {
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  const left = Number(rect?.left) || 0;
  const top = Number(rect?.top) || 0;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (!(viewBoxWidth > 0) || !(viewBoxHeight > 0)) return null;
  const scale = Math.min(width / viewBoxWidth, height / viewBoxHeight);
  const offsetX = (width - viewBoxWidth * scale) / 2;
  const offsetY = (height - viewBoxHeight * scale) / 2;
  return {
    x: (clientX - left - offsetX) / scale,
    y: (clientY - top - offsetY) / scale,
  };
};

/** CSS pixels per viewBox unit for a `meet` drawing in this box. */
export const viewBoxRenderScale = ({ rect, viewBoxWidth, viewBoxHeight }) => {
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  if (!(width > 0) || !(height > 0) || !(viewBoxWidth > 0) || !(viewBoxHeight > 0)) return 1;
  return Math.min(width / viewBoxWidth, height / viewBoxHeight);
};

/*
 * `reach` (viewBox units, 0 by default): how far outside the plotted region a
 * press still counts, moved onto the region's edge. A finger aimed at a point
 * on the grid's edge lands about as often just outside it as just inside
 * (CoordinatePlane, N60). Without it, outside the region is outside.
 */
export const clientPointToGraphCoordinate = ({
  clientX,
  clientY,
  rect,
  viewBoxWidth,
  viewBoxHeight,
  padding,
  xMin,
  xMax,
  yMin,
  yMax,
  reach = 0,
}) => {
  const viewPoint = clientPointToViewBox({ clientX, clientY, rect, viewBoxWidth, viewBoxHeight });
  if (!viewPoint) return null;
  const innerWidth = viewBoxWidth - padding * 2;
  const innerHeight = viewBoxHeight - padding * 2;
  const slack = Number(reach) > 0 ? Number(reach) : 0;
  if (viewPoint.x < padding - slack || viewPoint.x > viewBoxWidth - padding + slack || viewPoint.y < padding - slack || viewPoint.y > viewBoxHeight - padding + slack) return null;
  const x = Math.min(viewBoxWidth - padding, Math.max(padding, viewPoint.x));
  const y = Math.min(viewBoxHeight - padding, Math.max(padding, viewPoint.y));
  return {
    x: xMin + ((x - padding) / innerWidth) * (xMax - xMin),
    y: yMin + ((viewBoxHeight - padding - y) / innerHeight) * (yMax - yMin),
  };
};
