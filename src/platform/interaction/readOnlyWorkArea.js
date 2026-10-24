/*
 * A FINISHED QUESTION'S WORK IS READ-ONLY, NOT INERT (AX01, Q-97).
 *
 * A closed question's work area used to be `inert`. That kept a finished
 * answer from being edited, and it also took the question's graph, number
 * line, 3D model and the student's own answers out of the accessibility tree:
 * a screen-reader student could not review their own work, while a sighted
 * classmate could look at it.
 *
 * So a FINISHED question (correct, out of tries, or its assignment or section
 * locked) keeps its work in the page as content a screen reader can read, and
 * still locked:
 *
 *   - its native controls stay inside the disabled <fieldset>: not focusable,
 *     not editable, and still read with their values;
 *   - nothing under the area hears an event that could change the work. This
 *     guard stops typing, deleting, pressing, pasting, cutting, dropping and
 *     clicks at the area's edge (capture phase), before any tool, math field or
 *     third-party widget below it sees them — pointer-events alone stops only
 *     the mouse, and a screen reader's "click" or an `element.click()` ignores
 *     it;
 *   - Tab and Escape pass: a student moves through the work and closes Work
 *     View from it.
 *
 * `inert` stays for the moments the work is WAITING (a submit in flight, the
 * "Let's back up" step over it, the question open in another tab): there the
 * student is meant to be somewhere else for a moment.
 *
 * The guard acts only while the area carries READ_ONLY_WORK_AREA_ATTRIBUTE, so
 * the page's own markup is the one statement of whether the work is read-only.
 */

export const READ_ONLY_WORK_AREA_ATTRIBUTE = 'data-work-read-only';
export const READ_ONLY_WORK_AREA_SELECTOR = `[${READ_ONLY_WORK_AREA_ATTRIBUTE}="true"]`;

// What a screen reader hears on entering the finished work: whose it is, and
// that it is there to read. The reason it is closed is said where the student
// lands (the attempt strip and the closed card), so it is not repeated here.
export const READ_ONLY_WORK_AREA_LABEL = 'Your work. You can read it but not change it.';

/** What the guard does with one event. */
export const READ_ONLY_EFFECT = Object.freeze({
  // Not ours: it cannot change the work (Tab, Escape, focus, scrolling).
  PASS: 'pass',
  // Nothing below hears it, but the browser still does its own thing with it
  // (an arrow key scrolls the page, Ctrl/Cmd + scales the page, Ctrl/Cmd+C copies).
  STOP: 'stop',
  // Nothing below hears it and the browser does not act on it either.
  BLOCK: 'block',
});

// Keys a student needs in read-only work: Tab moves between controls, and
// Escape closes what is open (Work View, a dialog). Neither edits anything.
const PASSING_KEYS = new Set(['Tab', 'Escape']);
// Keys whose own default action edits or presses: Enter presses and types a
// new line, Backspace and Delete delete.
const EDITING_KEYS = new Set(['Enter', 'Backspace', 'Delete']);
// With Ctrl or Cmd: paste, cut, undo and redo edit. Every other shortcut is the
// browser's (zoom, find, copy, print) and keeps working.
const EDITING_SHORTCUTS = new Set(['v', 'x', 'z', 'y']);

const characterCount = (value) => [...value].length;

/*
 * TAB IN A MATH FIELD IS THE BROWSER'S, NOT MATHLIVE'S. MathLive moves focus
 * on Tab itself, to the next control it thinks can take it, and cancels the
 * browser's Tab. It does not see a <fieldset disabled>, so in finished work it
 * "focused" a disabled button, nothing moved, and Tab never left the field: a
 * keyboard trap. Stopped at the area's edge, the Tab is the browser's own,
 * which skips what the fieldset disables.
 */
const inMathField = (target) => Boolean(target?.closest?.('math-field'));

/**
 * What a key press inside read-only work may do. A typed character (Space and
 * an Option/AltGr character included) is an edit; so is Enter, Backspace,
 * Delete and an editing shortcut. Everything else stops at the area's edge
 * with its browser default left alone.
 */
export const readOnlyKeyEffect = (event) => {
  const key = String(event?.key ?? '');
  if (key === 'Tab' && inMathField(event?.target)) return READ_ONLY_EFFECT.STOP;
  if (PASSING_KEYS.has(key)) return READ_ONLY_EFFECT.PASS;
  const shortcut = Boolean(event?.ctrlKey || event?.metaKey);
  const edits = EDITING_KEYS.has(key)
    || (!shortcut && characterCount(key) === 1)
    || (shortcut && EDITING_SHORTCUTS.has(key.toLowerCase()));
  return edits ? READ_ONLY_EFFECT.BLOCK : READ_ONLY_EFFECT.STOP;
};

const KEY_EVENTS = new Set(['keydown', 'keypress', 'keyup']);

/*
 * Every event that can change the work, and what happens to it. Touch is only
 * stopped: its default is the page scrolling under a finger, and the click it
 * becomes is blocked anyway. Focus, hover, wheel, selection and copy are not
 * listed: reading and moving around never change anything.
 */
const EVENT_EFFECTS = Object.freeze({
  beforeinput: READ_ONLY_EFFECT.BLOCK,
  input: READ_ONLY_EFFECT.STOP,
  change: READ_ONLY_EFFECT.STOP,
  compositionstart: READ_ONLY_EFFECT.STOP,
  compositionupdate: READ_ONLY_EFFECT.STOP,
  compositionend: READ_ONLY_EFFECT.STOP,
  paste: READ_ONLY_EFFECT.BLOCK,
  cut: READ_ONLY_EFFECT.BLOCK,
  drop: READ_ONLY_EFFECT.BLOCK,
  dragstart: READ_ONLY_EFFECT.BLOCK,
  pointerdown: READ_ONLY_EFFECT.BLOCK,
  pointerup: READ_ONLY_EFFECT.BLOCK,
  mousedown: READ_ONLY_EFFECT.BLOCK,
  mouseup: READ_ONLY_EFFECT.BLOCK,
  click: READ_ONLY_EFFECT.BLOCK,
  dblclick: READ_ONLY_EFFECT.BLOCK,
  auxclick: READ_ONLY_EFFECT.BLOCK,
  touchstart: READ_ONLY_EFFECT.STOP,
  touchend: READ_ONLY_EFFECT.STOP,
});

/** The events the guard listens for (capture phase, on the work area). */
export const READ_ONLY_GUARDED_EVENTS = Object.freeze([...KEY_EVENTS, ...Object.keys(EVENT_EFFECTS)]);

/** What the guard does with `event` inside read-only work. */
export const readOnlyEventEffect = (event) => {
  const type = String(event?.type ?? '');
  if (KEY_EVENTS.has(type)) return readOnlyKeyEffect(event);
  return EVENT_EFFECTS[type] || READ_ONLY_EFFECT.PASS;
};

/** Is this element read-only work right now? */
export const isReadOnlyWorkArea = (element) => element?.getAttribute?.(READ_ONLY_WORK_AREA_ATTRIBUTE) === 'true';

/**
 * The listener: applies the effect, but only while the area it is bound to is
 * marked read-only. Returns the effect it applied.
 */
export const guardReadOnlyEvent = (event) => {
  if (!isReadOnlyWorkArea(event?.currentTarget)) return READ_ONLY_EFFECT.PASS;
  const effect = readOnlyEventEffect(event);
  if (effect === READ_ONLY_EFFECT.PASS) return effect;
  event.stopPropagation();
  if (effect === READ_ONLY_EFFECT.BLOCK && event.cancelable !== false) event.preventDefault();
  return effect;
};

const PASSIVE_EVENTS = new Set(['touchstart', 'touchend']);
const listenerOptions = (type) => (PASSIVE_EVENTS.has(type) ? { capture: true, passive: true } : true);

/**
 * Guard an element for its lifetime: a React 19 callback ref (it returns its
 * own cleanup). The guard does nothing until the element is marked read-only.
 */
export const bindReadOnlyWorkArea = (element) => {
  if (!element || typeof element.addEventListener !== 'function') return undefined;
  READ_ONLY_GUARDED_EVENTS.forEach((type) => element.addEventListener(type, guardReadOnlyEvent, listenerOptions(type)));
  return () => {
    READ_ONLY_GUARDED_EVENTS.forEach((type) => element.removeEventListener(type, guardReadOnlyEvent, listenerOptions(type)));
  };
};

export default bindReadOnlyWorkArea;
