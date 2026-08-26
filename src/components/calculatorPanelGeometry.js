const finiteOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** Keep the draggable calculator panel inside the visible viewport. */
export const clampCalculatorPosition = ({
  x,
  y,
  panelWidth,
  panelHeight,
  viewportWidth,
  viewportHeight,
  margin = 8,
}) => {
  const safeMargin = Math.max(0, finiteOr(margin, 8));
  const width = Math.max(0, finiteOr(panelWidth, 0));
  const height = Math.max(0, finiteOr(panelHeight, 0));
  const viewportW = Math.max(0, finiteOr(viewportWidth, width + safeMargin * 2));
  const viewportH = Math.max(0, finiteOr(viewportHeight, height + safeMargin * 2));
  const maxX = Math.max(safeMargin, viewportW - width - safeMargin);
  const maxY = Math.max(safeMargin, viewportH - height - safeMargin);

  return {
    x: Math.min(maxX, Math.max(safeMargin, finiteOr(x, safeMargin))),
    y: Math.min(maxY, Math.max(safeMargin, finiteOr(y, safeMargin))),
  };
};
