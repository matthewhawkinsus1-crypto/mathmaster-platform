/*
 * WHAT A TYPED `sqrt` MEANS (F-RADICAL-TYPING).
 *
 * MathLive turns the letters `sqrt` into a square root and `cbrt` into a cube
 * root (its inline shortcuts), with the caret in the empty radicand. From
 * there the root keeps everything typed after it, as a fraction keeps its
 * denominator (typedFractionEntry.js), and MathInput's space bar moves out of
 * it. So the natural keyboard spellings of a radicals answer built other
 * expressions:
 *
 *     typed  x^3 sqrt x       became  x³√□ x       the space left the root empty
 *     typed  y^4sqrt(x)/x^4   became  y⁴√(x/x⁴)    `)` closed the bracket only
 *     typed  sqrt(x)sqrt(y)   became  √((x)√(y))
 *
 * The box showed what it built, but a right answer typed this way cost a try.
 *
 * THE CONTRACT, as for a typed slash: the characters build what they mean as
 * written text.
 *
 *   - A space straight after `sqrt` or `cbrt` keeps the root open for its
 *     radicand: x^3 sqrt x is x³√x.
 *   - A bracket typed straight after it is the root's own, and the `)` that
 *     matches it closes the root: the next character goes after the root, so
 *     y^4sqrt(x)/x^4 is (y⁴√(x))/x⁴ and sqrt(x)sqrt(y) is √(x)√(y). Brackets
 *     typed inside are counted (sqrt((x+1)/2) closes at the last one), and a
 *     space inside the root's bracket does not leave it: the `)` says where
 *     the root ends. A space deeper in (in a power inside the root) still
 *     moves out of that, as anywhere.
 *   - The bracket stays in the radicand as typed, √(x), and it is MathLive's
 *     own `)` that closes it. So whenever the watch ends early — an arrow,
 *     Backspace, a click, a keypad action, any key this module does not
 *     follow — the field is exactly what it was without this module: the old
 *     behaviour is the fallback, never a guess.
 *
 * Only a root opened by TYPING `sqrt` or `cbrt` is watched. A keypad √ or ⁿ√
 * has a visible box the student fills deliberately and leaves with "move out";
 * MathLive's `nthroot` opens two boxes, index first, and is left as it builds
 * it.
 *
 * Pure: the field wiring (MathInput) passes each key, the field's latex and the
 * caret's depth (MathLive's getElementInfo, 0 at the top level), and performs
 * what this asks for BEFORE MathLive inserts the key: swallow it, or climb out
 * of groups until the caret is no deeper than `climbTo` (climbToDepth below).
 */

const IDLE = null;

// Keys that never change what the field contains, and so never end the watch:
// Shift to type `(` must not forget the root.
const PASSIVE_KEYS = new Set(['Shift', 'CapsLock', 'NumLock']);
const LETTER = /^[A-Za-z]$/;

// MathLive 0.110's inline shortcuts that build a root with the caret in an
// empty radicand, and how that radicand reads in the field's latex.
const ROOT_SHORTCUTS = Object.freeze({
  sqrt: '\\sqrt{\\placeholder{}}',
  cbrt: '\\sqrt[3]{\\placeholder{}}',
});
const SHORTCUT_NAMES = Object.freeze(Object.keys(ROOT_SHORTCUTS));
const KEPT_LETTERS = Math.max(...SHORTCUT_NAMES.map((name) => name.length)) - 1;

const PLACEHOLDER = /\\placeholder\{\}/g;

const hasModifier = (event) => Boolean(event?.ctrlKey || event?.metaKey || event?.altKey);
const isDepth = (depth) => Number.isInteger(depth) && depth >= 0;

/**
 * The field's latex says the caret is in the empty radicand the `name`
 * shortcut just built: that radicand is the field's only empty box. (MathLive
 * leaves it selected, so the next printable key replaces it.)
 */
export const inEmptyTypedRoot = (name, value) => {
  const latex = String(value ?? '');
  return Object.hasOwn(ROOT_SHORTCUTS, name)
    && (latex.match(PLACEHOLDER)?.length || 0) === 1
    && latex.includes(ROOT_SHORTCUTS[name]);
};

const step = (state, { swallow = false, climbTo = null } = {}) => ({ state, swallow, climbTo });

// No root is open: follow the run of letters, which may complete a shortcut.
const letterRun = (incoming, key) => {
  if (!LETTER.test(key)) return IDLE;
  const text = `${incoming?.phase === 'letters' ? incoming.text : ''}${key}`;
  const name = SHORTCUT_NAMES.find((candidate) => text.endsWith(candidate));
  if (name) return Object.freeze({ phase: 'opening', name });
  return Object.freeze({ phase: 'letters', text: text.slice(-KEPT_LETTERS) });
};

// Inside the root's bracket. `bracketDepth` is where the caret went when the
// `(` was inserted (one deeper than the radicand when MathLive builds bracket
// groups, the radicand itself when a field types brackets as characters);
// it is read at the first key after the `(`.
const bracketStep = (state, key, depth) => {
  const bracketDepth = state.bracketDepth ?? depth;
  // The caret left the bracket some way this module did not see (MathInput's
  // `=` leaves every group): stop watching, change nothing.
  if (!isDepth(depth) || !isDepth(bracketDepth) || depth < bracketDepth) return step(IDLE);
  const watching = (open) => Object.freeze({ ...state, bracketDepth, open });
  if (key === '(') return step(watching(state.open + 1));
  if (key === ')') {
    if (state.open > 0) return step(watching(state.open - 1));
    // The bracket that opened the root closes here. From inside a power or a
    // fraction in it, the caret first climbs back to the bracket's level, so
    // MathLive's `)` closes the bracket rather than landing in the power; the
    // next character then leaves the root (phase 'closing').
    return step(Object.freeze({ phase: 'closing', rootDepth: state.rootDepth }), { climbTo: bracketDepth });
  }
  if (key === ' ' && depth === bracketDepth) return step(watching(state.open), { swallow: true });
  return step(watching(state.open));
};

/**
 * The next watch state after a physical key reaches a math field, and what
 * must happen before the field inserts that key.
 *
 * @param {null|{phase:string}} incoming
 * @param {{key:string, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean, isComposing?:boolean}} event
 * @param {{value?:string, depth?:number}} [field] the field's latex and the caret's depth as the key arrives
 * @returns {{ state: null|object, swallow: boolean, climbTo: null|number }}
 */
export const typedRootKeyStep = (incoming, event, field = {}) => {
  const key = String(event?.key ?? '');
  if (PASSIVE_KEYS.has(key)) return step(incoming);
  // A shortcut, a composition, or a key that is not one character (an arrow,
  // Backspace, Delete, Enter, Tab) ends the watch where the caret stands.
  if (event?.isComposing || hasModifier(event) || [...key].length !== 1) return step(IDLE);

  // The root's bracket was closed by the last key. A character now goes after
  // the root: the caret climbs out of it first.
  if (incoming?.phase === 'closing') return step(letterRun(null, key), { climbTo: incoming.rootDepth - 1 });

  if (incoming?.phase === 'opening' && inEmptyTypedRoot(incoming.name, field.value)) {
    // x^3 sqrt x: the space would have moved out and left the root empty.
    if (key === ' ') return step(incoming, { swallow: true });
    // sqrt( : the bracket is the root's own. MathLive puts it in the radicand.
    if (key === '(' && isDepth(field.depth)) {
      return step(Object.freeze({ phase: 'bracketed', rootDepth: field.depth, bracketDepth: null, open: 0 }));
    }
  }

  if (incoming?.phase === 'bracketed') return bracketStep(incoming, key, field.depth);

  return step(letterRun(incoming, key));
};

/**
 * An on-screen keypad press. A single character behaves as if typed. Inside
 * the root's bracket, a template (x², a fraction) or a symbol builds where the
 * caret is and the watch goes on; straight after the root's `)` the caret
 * leaves the root first, so x² squares the root. Anything else ends the watch.
 */
export const typedRootCommandStep = (state, command, field = {}) => {
  const value = String(command ?? '').trim();
  if ([...value].length === 1) return typedRootKeyStep(state, { key: value }, field);
  if (state?.phase === 'closing') return step(IDLE, { climbTo: state.rootDepth - 1 });
  if (state?.phase === 'bracketed') return bracketStep(state, value, field.depth);
  return step(IDLE);
};

export const TYPED_ROOT_IDLE = IDLE;

/**
 * Climb out of groups (MathLive's moveAfterParent) until the caret is no
 * deeper than `depth`. Stops if the caret stops moving or its depth cannot be
 * read. `field` is a MathfieldElement, or anything with its `position`,
 * `getElementInfo` and `executeCommand`.
 */
export const climbToDepth = (field, depth) => {
  if (!field || !isDepth(depth)) return;
  for (let guard = 0; guard < 12; guard += 1) {
    const current = field.getElementInfo?.(field.position)?.depth;
    if (!isDepth(current) || current <= depth) return;
    const before = field.position;
    field.executeCommand('moveAfterParent');
    if (field.position === before) return;
  }
};
