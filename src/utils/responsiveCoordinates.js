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
}) => {
  const viewPoint = clientPointToViewBox({ clientX, clientY, rect, viewBoxWidth, viewBoxHeight });
  if (!viewPoint) return null;
  const innerWidth = viewBoxWidth - padding * 2;
  const innerHeight = viewBoxHeight - padding * 2;
  if (viewPoint.x < padding || viewPoint.x > viewBoxWidth - padding || viewPoint.y < padding || viewPoint.y > viewBoxHeight - padding) return null;
  return {
    x: xMin + ((viewPoint.x - padding) / innerWidth) * (xMax - xMin),
    y: yMin + ((viewBoxHeight - padding - viewPoint.y) / innerHeight) * (yMax - yMin),
  };
};
