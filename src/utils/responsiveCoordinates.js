export const clientPointToViewBox = ({ clientX, clientY, rect, viewBoxWidth, viewBoxHeight }) => {
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  const left = Number(rect?.left) || 0;
  const top = Number(rect?.top) || 0;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    x: ((clientX - left) / width) * viewBoxWidth,
    y: ((clientY - top) / height) * viewBoxHeight,
  };
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
