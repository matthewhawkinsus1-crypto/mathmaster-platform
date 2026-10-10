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

/*
 * THE KEYBOARD ROUTE FOR MOVING THE CALCULATOR (WCAG 2.1.1; KEYBOARD_SWEEP S7).
 * The panel can sit over the very thing a student needs to read, and dragging
 * was the only way to move it. Its "Move calculator" button moves it with the
 * arrow keys (Shift = a bigger step) and sends it to the next corner on
 * Enter/Space. Every position goes through clampCalculatorPosition, exactly as
 * a drag does, so a keyboard move can never leave the panel off screen.
 */
export const CALCULATOR_CORNERS = Object.freeze(['bottom-right', 'bottom-left', 'top-left', 'top-right']);
export const CALCULATOR_KEY_STEP = 24;
export const CALCULATOR_KEY_BIG_STEP = 96;

export const nextCalculatorCorner = (corner) => {
  const index = CALCULATOR_CORNERS.indexOf(corner);
  return CALCULATOR_CORNERS[(index + 1) % CALCULATOR_CORNERS.length];
};

export const calculatorCornerPosition = (corner, { panelWidth, panelHeight, viewportWidth, viewportHeight, margin = 8 }) => {
  const right = String(corner).endsWith('right');
  const bottom = String(corner).startsWith('bottom');
  return clampCalculatorPosition({
    // Past the far edge on purpose: the clamp pulls it back to the margin.
    x: right ? Number(viewportWidth) || 0 : 0,
    y: bottom ? Number(viewportHeight) || 0 : 0,
    panelWidth, panelHeight, viewportWidth, viewportHeight, margin,
  });
};

const ARROW_DELTAS = Object.freeze({
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
});

/** The position after an arrow key, or null for any other key. */
export const nudgeCalculatorPosition = (position, { key, shiftKey = false }, dimensions) => {
  const delta = ARROW_DELTAS[key];
  if (!delta || !position) return null;
  const step = shiftKey ? CALCULATOR_KEY_BIG_STEP : CALCULATOR_KEY_STEP;
  return clampCalculatorPosition({ ...dimensions, x: position.x + delta[0] * step, y: position.y + delta[1] * step });
};
