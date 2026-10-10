/*
 * THREE-PLANE MODEL: POINTER AND KEYBOARD, ONE MAPPING.
 *
 * Pure helpers shared by ThreePlaneWorkspace.jsx so a keyboard route cannot
 * drift from the pointer route it stands in for:
 *
 *   - dragCamera: the drag's own camera mapping (0.01 rad per pixel, pitch
 *     clamped to ±1.3 rad). The pointer handler calls it; the arrow keys call
 *     it with the drag that the key stands for, so a key press clamps exactly
 *     as a drag does. The camera is view state only — it is never part of the
 *     work the shared grader reads.
 *   - choiceKeyTarget / choiceTabStop / recordChoice: the radiogroup pattern
 *     for the interpretation choices. Selection follows focus, and an arrow
 *     key records the option through the same recordChoice a click uses.
 */

export const DRAG_RADIANS_PER_PIXEL = 0.01;
export const MIN_ELEVATION = -1.3;
export const MAX_ELEVATION = 1.3;
/** One arrow press = a 10 px drag (0.1 rad); with Shift, a 45 px drag (0.45 rad). */
export const KEY_ROTATE_PIXELS = 10;
export const KEY_ROTATE_PIXELS_LARGE = 45;

/** The camera after dragging (dx, dy) screen pixels from `start`. */
export function dragCamera(start, dx, dy) {
  return {
    azimuth: start.azimuth + dx * DRAG_RADIANS_PER_PIXEL,
    elevation: Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, start.elevation - dy * DRAG_RADIANS_PER_PIXEL)),
  };
}

/**
 * The drag an arrow key stands for: ArrowLeft/Right = dragging the pointer
 * left/right (yaw), ArrowUp/Down = dragging it up/down (pitch). Any other key
 * is not a rotation (null).
 */
export function keyRotationDrag(key, shiftKey = false) {
  const step = shiftKey ? KEY_ROTATE_PIXELS_LARGE : KEY_ROTATE_PIXELS;
  switch (key) {
    case 'ArrowLeft': return { dx: -step, dy: 0 };
    case 'ArrowRight': return { dx: step, dy: 0 };
    case 'ArrowUp': return { dx: 0, dy: -step };
    case 'ArrowDown': return { dx: 0, dy: step };
    default: return null;
  }
}

/** The camera after an arrow key, or null when the key does not rotate. */
export function keyRotateCamera(camera, key, shiftKey = false) {
  const drag = keyRotationDrag(key, shiftKey);
  return drag ? dragCamera(camera, drag.dx, drag.dy) : null;
}

/**
 * Radiogroup arrow keys: ArrowDown/ArrowRight → next, ArrowUp/ArrowLeft →
 * previous, wrapping at both ends; Home/End → first/last. Null for any other
 * key or an empty group.
 */
export function choiceKeyTarget(key, index, count) {
  if (!(count > 0)) return null;
  const from = Number.isInteger(index) && index >= 0 && index < count ? index : 0;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight': return (from + 1) % count;
    case 'ArrowUp':
    case 'ArrowLeft': return (from - 1 + count) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/** The one option that is a Tab stop: the checked one, else the first. */
export function choiceTabStop(options, selected) {
  const index = Array.isArray(options) ? options.indexOf(selected) : -1;
  return index >= 0 ? index : 0;
}

/** The interpretation responses after choosing `option` for `fieldId` — by click or by key. */
export function recordChoice(responses, fieldId, option) {
  return { ...responses, [fieldId]: option };
}

/**
 * What the polite status says after a keyboard rotation: the view angle only
 * (whole degrees), never anything about the planes or the answer.
 */
export function viewAngleText(camera) {
  const degrees = (radians) => Math.round((Number(radians) || 0) * 180 / Math.PI);
  let turn = degrees(camera?.azimuth) % 360;
  if (turn > 180) turn -= 360;
  if (turn <= -180) turn += 360;
  const sign = (value) => (value < 0 ? `\u2212${-value}` : String(value));
  return `View turned ${sign(turn)} degrees, tilted ${sign(degrees(camera?.elevation))} degrees.`;
}
