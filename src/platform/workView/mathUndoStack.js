/*
 * THE MATHEMATICAL HALF OF UNDO, WITH NO REACT IN IT.
 *
 * Universal Undo has to mean one thing across eighteen tools: take back the
 * last thing the student did TO THE MATHEMATICS. Not the last thing that
 * happened on screen. A student who zooms in to place a point carefully, plots
 * it, then presses Undo expects the point gone and the zoom left alone — and if
 * Undo instead unwinds the camera they press it again, lose the point too, and
 * conclude the control is broken.
 *
 * So camera is not a kind of edit that Undo happens to skip. It is not in the
 * record at all: `mathematicalSnapshot` strips it before anything is compared,
 * which makes "pan, zoom and Fit never reach Undo" a property of the data
 * rather than a rule every tool has to remember. The same strip covers Work
 * View's own presentation state — open/closed, which drawer, the measured
 * viewport — for the same reason.
 *
 * The stack holds PREVIOUS states, not diffs. Each entry is a complete
 * mathematical state the student was in, so a sequence of undos walks straight
 * back through them and a tool restores by assignment rather than by replaying
 * inverse operations it would have to write per action type.
 */

export const MATH_UNDO_LIMIT = 60;

/*
 * Keys that describe where the student is LOOKING, never what they have
 * decided. Matched by name at any depth, so a tool that nests its camera under
 * `graph: { view }` is covered without registering anything.
 *
 * The list is deliberately short and concrete. Anything ambiguous belongs out
 * of it: a key wrongly listed here silently drops real student work out of
 * Undo, which is the failure this module exists to prevent.
 */
export const CAMERA_STATE_KEYS = Object.freeze([
  'view',
  'zoomView',
  'zoom',
  'pan',
  'camera',
  'viewWindow',
  'renderWindow',
  'viewport',
  'visualViewport',
  'usableHeight',
  'orientation',
  'workView',
  'workViewOpen',
  'enlarged',
  'drawer',
  'hoverPoint',
  'pointerPreview',
]);

const cameraKeys = new Set(CAMERA_STATE_KEYS);

/**
 * A stable, camera-free string for a tool's mathematical state.
 *
 * Stable key order matters: `{a:1,b:2}` and `{b:2,a:1}` are the same answer,
 * and a tool that rebuilds its state object each render must not be recorded as
 * having changed something because the keys came back in a different order.
 */
export function mathematicalSnapshot(value) {
  const walk = (node) => {
    if (node === null || typeof node !== 'object') {
      return Number.isNaN(node) ? 'NaN' : JSON.stringify(node ?? null);
    }
    if (Array.isArray(node)) return `[${node.map(walk).join(',')}]`;
    const keys = Object.keys(node).filter((key) => !cameraKeys.has(key)).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${walk(node[key])}`).join(',')}}`;
  };
  return walk(value);
}

export const EMPTY_MATH_UNDO_STACK = Object.freeze({ entries: Object.freeze([]) });

export const mathUndoDepth = (stack) => (stack?.entries?.length || 0);

export const canUndoMath = (stack) => mathUndoDepth(stack) > 0;

/**
 * Record `previousState` as somewhere the student can come back to.
 *
 * Returns the SAME stack object when nothing mathematical changed, so a caller
 * can test identity to decide whether anything needs re-rendering. That is what
 * keeps a camera move, a re-render with a freshly built state object, and a
 * drawer opening from all counting as edits.
 */
export function recordMathUndoEntry(stack, previousState, nextState, options = {}) {
  const current = stack?.entries ? stack : EMPTY_MATH_UNDO_STACK;
  const limit = Math.max(1, Number(options.limit) || MATH_UNDO_LIMIT);
  if (mathematicalSnapshot(previousState) === mathematicalSnapshot(nextState)) return current;
  return { entries: [...current.entries, previousState].slice(-limit) };
}

/**
 * Step one state back.
 *
 * `changed` is false on an empty stack rather than throwing, because the
 * platform Undo button is disabled from `canUndo` and a race against a
 * re-render must not take the question down.
 */
export function undoMathUndoEntry(stack) {
  const current = stack?.entries ? stack : EMPTY_MATH_UNDO_STACK;
  if (!current.entries.length) return { stack: current, restored: undefined, changed: false };
  return {
    stack: { entries: current.entries.slice(0, -1) },
    restored: current.entries[current.entries.length - 1],
    changed: true,
  };
}
