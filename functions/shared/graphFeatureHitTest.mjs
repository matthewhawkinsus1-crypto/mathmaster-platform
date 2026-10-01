/*
 * DID THAT TAP FIND A FEATURE?
 *
 * A student points at an x-intercept with a finger on a phone, a Chromebook
 * touchpad, a mouse or a stylus. Being two pixels off is not a mathematical
 * error, so the tolerance is measured on the SCREEN — a fingertip is a
 * fingertip whether the graph spans 300 pixels or 900 — and only then
 * converted into graph units for the axis scales of that graph.
 *
 *   radius (CSS px)   by pointer: touch 26, pen 18, mouse/touchpad 18,
 *                     keyboard cursor 22 (it moves in whole grid steps)
 *   tolerance          radius ÷ pixels-per-unit, separately for x and y
 *   clamp              between 0.5% and 7% of the axis span, so a device
 *                      claiming absurd pixel sizes can never turn random
 *                      tapping into hits
 *
 * A tap resolves to the NEAREST target, measured in those tolerance units
 * (an ellipse in graph space, a circle on screen):
 *
 *   inside the nearest target's radius, not yet found   → hit
 *   inside the nearest target's radius, already found   → alreadyFound
 *                                                         (neither credit nor
 *                                                          a penalty)
 *   inside nobody's radius                              → miss
 *
 * Generated questions keep targets at least 15% of the view apart, so at
 * the maximum tolerance two targets' circles cannot overlap; nearest-target
 * resolution still decides correctly if a device's scale makes them touch.
 *
 * The student's device and the server run exactly this function on exactly
 * the same numbers: the device clamps before it sends, the server clamps
 * again on receipt (a no-op for an honest device). Their verdicts agree by
 * construction, which is what lets the device give feedback instantly while
 * the server alone decides what counts.
 *
 * Pure: shared by Cloud Functions, the student device and tests.
 */

export const POINTER_KIND = Object.freeze({
  TOUCH: 'touch',
  PEN: 'pen',
  MOUSE: 'mouse',
  KEYBOARD: 'keyboard',
});

export const POINTER_RADIUS_PX = Object.freeze({
  [POINTER_KIND.TOUCH]: 26,
  [POINTER_KIND.PEN]: 18,
  [POINTER_KIND.MOUSE]: 18,
  [POINTER_KIND.KEYBOARD]: 22,
});

export const MIN_TOLERANCE_FRACTION = 0.005;
export const MAX_TOLERANCE_FRACTION = 0.07;

export const TAP_RESULT = Object.freeze({
  HIT: 'hit',
  ALREADY_FOUND: 'alreadyFound',
  MISS: 'miss',
});

export const normalizePointerKind = (value) => (
  Object.values(POINTER_KIND).includes(value) ? value : POINTER_KIND.MOUSE
);

const finite = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const spanOf = (view = {}) => ({
  x: Math.max(1e-9, finite(view.xMax, 10) - finite(view.xMin, -10)),
  y: Math.max(1e-9, finite(view.yMax, 10) - finite(view.yMin, -10)),
});

/** Clamp a tolerance (graph units) into the band the view allows. */
export const clampTolerance = (tolerance = {}, view = {}) => {
  const span = spanOf(view);
  const clampAxis = (value, axisSpan) => {
    const numeric = finite(value, MAX_TOLERANCE_FRACTION * axisSpan);
    return Math.min(MAX_TOLERANCE_FRACTION * axisSpan, Math.max(MIN_TOLERANCE_FRACTION * axisSpan, numeric));
  };
  return Object.freeze({ x: clampAxis(tolerance.x, span.x), y: clampAxis(tolerance.y, span.y) });
};

/**
 * The tolerance for a tap on a rendered graph: the pointer's radius in CSS
 * pixels, divided by the rendered pixels per graph unit on each axis.
 */
export const toleranceForPointer = ({ pointer = POINTER_KIND.MOUSE, pxPerUnitX, pxPerUnitY, view } = {}) => {
  const radius = POINTER_RADIUS_PX[normalizePointerKind(pointer)];
  const perX = finite(pxPerUnitX, 0);
  const perY = finite(pxPerUnitY, 0);
  return clampTolerance({
    x: perX > 0 ? radius / perX : Number.NaN,
    y: perY > 0 ? radius / perY : Number.NaN,
  }, view);
};

/**
 * Resolve one tap against a question's targets.
 *
 * @param {object}   input
 * @param {Array}    input.targets    [{ id, x, y }]
 * @param {string[]} input.found      ids already found on this question
 * @param {object}   input.tap        { x, y } in graph units
 * @param {object}   input.tolerance  { x, y } in graph units (clamped here)
 * @param {object}   input.view       the question's view
 */
export const resolveTap = ({ targets = [], found = [], tap = {}, tolerance = {}, view = {} } = {}) => {
  const x = finite(tap.x);
  const y = finite(tap.y);
  if (x === null || y === null) return Object.freeze({ result: TAP_RESULT.MISS, targetId: null, distance: null });
  const limits = clampTolerance(tolerance, view);
  let nearest = null;
  (Array.isArray(targets) ? targets : []).forEach((target) => {
    const tx = finite(target?.x);
    const ty = finite(target?.y);
    if (tx === null || ty === null) return;
    const distance = Math.hypot((x - tx) / limits.x, (y - ty) / limits.y);
    // Ties go to the target listed first (left to right), deterministically.
    if (!nearest || distance < nearest.distance) nearest = { id: String(target.id), distance };
  });
  if (!nearest || nearest.distance > 1) return Object.freeze({ result: TAP_RESULT.MISS, targetId: null, distance: nearest?.distance ?? null });
  const already = (Array.isArray(found) ? found : []).map(String).includes(nearest.id);
  return Object.freeze({
    result: already ? TAP_RESULT.ALREADY_FOUND : TAP_RESULT.HIT,
    targetId: nearest.id,
    distance: nearest.distance,
  });
};
