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

/*
 * THE STUDENT TYPES "-2, 1, 3"; ONE UNDO TAKES IT BACK.
 *
 * Every keystroke in a field is a new state, and recording each one made Undo
 * take back a single character per press — eight presses for "-2, 1, 3" in
 * Relation Mapping — while the typing spent the 60-entry limit and pushed the
 * student's earlier arrows and points out of reach.
 *
 * So a run of typing in ONE field is one entry: a change whose only difference
 * is one text value, at the same place as the entry before it, within
 * MATH_UNDO_TYPING_IDLE_MS of the previous keystroke, joins that entry. A pause,
 * another field, or any non-text edit (a point, an arrow, a choice of a
 * different kind) starts a new one. Decided from the data, so no tool has to
 * say which of its values are typed.
 */
export const MATH_UNDO_TYPING_IDLE_MS = 1000;

const TEXT_DIFF_LIMIT = 2;

// One insertion or one deletion in one place — what a keystroke, a Backspace or
// a paste at the caret does. Swapping "yes" for "no", or selecting a whole
// answer and typing over it, is a different act and keeps its own Undo.
const isContiguousTextEdit = (before, after) => {
  const a = String(before ?? '');
  const b = String(after ?? '');
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix
    && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;
  return prefix + suffix === Math.min(a.length, b.length);
};

/**
 * The path of the one text value that differs between two states, or null when
 * they differ anywhere else, in more than one place, or not at all. Camera keys
 * are ignored, as everywhere in Undo.
 */
export function singleTextEditPath(previousState, nextState) {
  const diffs = [];
  const visit = (before, after, path) => {
    if (diffs.length >= TEXT_DIFF_LIMIT) return;
    const beforeIsObject = before !== null && typeof before === 'object';
    const afterIsObject = after !== null && typeof after === 'object';
    if (beforeIsObject && afterIsObject && Array.isArray(before) === Array.isArray(after)) {
      const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key of keys) {
        if (cameraKeys.has(key)) continue;
        visit(before[key], after[key], `${path}/${key}`);
        if (diffs.length >= TEXT_DIFF_LIMIT) return;
      }
      return;
    }
    if (mathematicalSnapshot(before) === mathematicalSnapshot(after)) return;
    diffs.push({ path, before, after });
  };
  visit(previousState, nextState, '');
  if (diffs.length !== 1) return null;
  const [{ path, before, after }] = diffs;
  // Typing into a field that was empty or never set is still typing; clearing
  // a field to nothing is not (it is its own action, and its own Undo).
  const typed = typeof after === 'string'
    && (typeof before === 'string' || before === undefined || before === null)
    && isContiguousTextEdit(before, after);
  return typed ? path : null;
}

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
  // Typing runs are grouped only when the caller says what time it is; without
  // a clock every change is its own entry, exactly as before.
  const at = Number(options.now);
  const textPath = Number.isFinite(at) ? singleTextEditPath(previousState, nextState) : null;
  const idleMs = Number.isFinite(Number(options.typingIdleMs)) ? Number(options.typingIdleMs) : MATH_UNDO_TYPING_IDLE_MS;
  const last = current.typing;
  if (textPath !== null && last && last.path === textPath && at - last.at <= idleMs && current.entries.length) {
    // Same field, still typing: the entry already holds the state from before
    // the run began, which is where one Undo should go back to.
    return { entries: current.entries, typing: { path: textPath, at } };
  }
  const entries = [...current.entries, previousState].slice(-limit);
  return textPath !== null ? { entries, typing: { path: textPath, at } } : { entries };
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
