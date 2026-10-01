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

/**
 * The position to store after a re-clamp: `current` itself when the clamp
 * moved nothing, so a state update with it is a no-op instead of a re-render
 * (and, in an effect that depends on the position, another re-clamp).
 */
export const settleCalculatorPosition = (current, next) => {
  if (!current || !next) return next ?? current;
  return Math.abs(current.x - next.x) < 0.5 && Math.abs(current.y - next.y) < 0.5 ? current : next;
};
