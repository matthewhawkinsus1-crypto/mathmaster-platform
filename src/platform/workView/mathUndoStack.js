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

/*
 * A FRACTION BAR IS A KEYSTROKE TOO.
 *
 * A math field reports LaTeX, and not every key a student types lands in it as
 * an insertion. "/" turns `y=1` into `y=\frac{1}{\placeholder{}}`, the next "2"
 * makes it `y=\frac12`, and "(" adds `\left(\right)` around the caret. Compared
 * character by character neither is one contiguous edit, so typing
 * y = 1/2x − 3 into one field was three Undo steps, and the middle one handed
 * back a fraction with an empty box in it (PQ-009, the representations board).
 *
 * So contiguity is judged on the text with MathLive's structure taken out —
 * braces, backslashes and empty placeholders. Selecting a whole answer and
 * typing over it (`y=\frac12x` → `5`) is still a different act, as is a
 * swapped choice.
 */
const EMPTY_PLACEHOLDER = /\\placeholder(?:\[[^\]]*\])?\{\}/g;
export const typingText = (value) => String(value ?? '').replace(EMPTY_PLACEHOLDER, '').replace(/[{}\\]/g, '');

// One insertion or one deletion in one place — what a keystroke, a Backspace or
// a paste at the caret does. Swapping "yes" for "no", or selecting a whole
// answer and typing over it, is a different act and keeps its own Undo.
const isContiguousTextEdit = (before, after) => {
  const a = typingText(before);
  const b = typingText(after);
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
    // Typed and rubbed out again: the run is back where it began, and its entry
    // would be an Undo that changes nothing — a press the student sees do
    // nothing. The step before it is the next Undo instead.
    if (mathematicalSnapshot(nextState) === mathematicalSnapshot(current.entries[current.entries.length - 1])) {
      return { entries: current.entries.slice(0, -1) };
    }
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

/*
 * "UNDO ON GRAPH 2" IS THE SAME HISTORY, FILTERED.
 *
 * A tool with several workspaces in one answer — the representations board has
 * three graphs beside its equations and table — keeps an Undo on each
 * workspace: the student who plotted on Graph 2, typed a slope, then saw the
 * graph was wrong reaches for the graph's own Undo, not for the one that would
 * take the slope first. Two separate histories disagreed (the platform Undo
 * replayed what the graph's Undo had removed), so this is ONE history read
 * through a filter: take back the most recent change to these keys and only
 * that, keep every later change to anything else, and rewrite the entries after
 * it as if the step had never been made — the platform Undo can never replay it.
 *
 * Keys are top-level fields of a plain-object state. `current` is the live
 * state: the stack holds only the states before each change.
 */
const plainRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const filterKeys = (keys) => (Array.isArray(keys) ? keys : [keys]).filter((key) => typeof key === 'string' && key);

const keyChanged = (before, after, key) => before?.[key] !== after?.[key]
  && mathematicalSnapshot(before?.[key]) !== mathematicalSnapshot(after?.[key]);

/** The index of the entry the latest change to `keys` started from, or -1. */
export function latestMathUndoChangeIndex(stack, current, keys) {
  const wanted = filterKeys(keys);
  const entries = stack?.entries || [];
  if (!wanted.length || !plainRecord(current)) return -1;
  let after = current;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const before = entries[index];
    if (!plainRecord(before)) return -1;
    if (wanted.some((key) => keyChanged(before, after, key))) return index;
    after = before;
  }
  return -1;
}

/**
 * Take back the latest change to `keys` alone. Same result shape as
 * `undoMathUndoEntry`; `restored` is the live state with those keys put back.
 */
export function undoMathUndoChange(stack, current, keys) {
  const base = stack?.entries ? stack : EMPTY_MATH_UNDO_STACK;
  const index = latestMathUndoChangeIndex(base, current, keys);
  if (index < 0) return { stack: base, restored: undefined, changed: false };
  const wanted = filterKeys(keys);
  const from = base.entries[index];
  const putBack = (state) => {
    const next = { ...state };
    wanted.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(from, key)) next[key] = from[key];
      else delete next[key];
    });
    return next;
  };
  const restored = putBack(current);
  // Nothing after `index` changed these keys, so every later entry held them at
  // the value this step produced. Put back there too, the step is gone from the
  // history; the entry it leaves identical to its neighbour goes with it.
  const rewritten = [...base.entries.slice(0, index + 1), ...base.entries.slice(index + 1).map(putBack)];
  const entries = rewritten.filter((entry, position) => (
    position === 0 || mathematicalSnapshot(entry) !== mathematicalSnapshot(rewritten[position - 1])
  ));
  // An entry equal to where the student now is would be an Undo that changes nothing.
  if (entries.length && mathematicalSnapshot(entries[entries.length - 1]) === mathematicalSnapshot(restored)) entries.pop();
  return { stack: { entries }, restored, changed: true };
}
