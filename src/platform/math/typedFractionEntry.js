/*
 * WHAT A TYPED SLASH MEANS.
 *
 * A math field is structural: `/` opens a fraction, puts what came before it in
 * the numerator, and leaves the cursor in the denominator — where it keeps
 * everything typed afterwards. On a keyboard that turned the most common
 * slope-intercept answer there is into a different expression:
 *
 *     typed  y=-2/3x+4      became  y = −2 / (3x + 4)     (PQ-040)
 *     typed  6/3+1          became  6 / (3 + 1)           (calculator: 1.5)
 *     typed  (1/2,3)        became  (1 / (2,3))
 *
 * The student can see the fraction bar spanning "3x + 4", but nothing tells
 * them it is wrong until it is graded wrong.
 *
 * THE CONTRACT. Characters typed into a math field build the expression those
 * same characters mean as written text, under ordinary precedence — the
 * reading every MathMaster grader already applies to `y=-2/3x+4` (`3/2x` is
 * (3/2)x in algebraicForm, stackDivisions and mathjs alike). So:
 *
 *   - once the denominator holds a plain number (3, 12, 0.5, −2), a letter, an
 *     operator, a relation, a comma or a closing bracket starts AFTER the
 *     fraction: 2/3x → (2/3)x, 6/3+1 → (6/3) + 1, (1/2,3) → (1/2, 3);
 *   - anything else is left exactly as MathLive builds it. A denominator that
 *     starts with a letter or a bracket is the student building it on purpose
 *     (1/x−2, 1/(2x)); an empty denominator takes a sign (1/−2) or a letter
 *     (1/x); `^` raises the denominator itself (1/2^3); and any key this module
 *     does not understand — arrows, Backspace, a click, a shortcut — ends the
 *     watch, so the old behaviour is the fallback, never a guess.
 *
 * Only a fraction the student OPENED BY TYPING `/` is watched. A fraction built
 * from a keypad template (`\frac{#0}{#?}`) has visible boxes the student fills
 * deliberately and leaves with "↷ out"; that is not rewritten.
 *
 * Pure: the field wiring (MathInput, CalculatorPanel) feeds keys and values in
 * and performs the one action this asks for — `moveAfterParent` BEFORE MathLive
 * inserts the key, exactly as the existing `=` rule does.
 */

const IDLE = null;
const OPENING = Object.freeze({ phase: 'opening' });

// Keys that never change what the field contains, and so never end the watch:
// pressing Shift to type `+` or `X` must not forget the denominator.
const PASSIVE_KEYS = new Set(['Shift', 'CapsLock', 'NumLock']);

const DENOMINATOR_CHARACTER = /^[0-9.]$/;
// Begins the next term, factor, side or list item.
const AFTER_FRACTION_KEY = /^(?:[A-Za-z+\-*×·=<>≤≥≠,;)\]|]|−)$/;
const PLAIN_NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

const PLACEHOLDER = /\\placeholder\{\}/g;

/** A denominator that is a plain number and nothing else: 3, 12, 0.5, −2. */
export const isPlainNumberDenominator = (text) => PLAIN_NUMBER.test(String(text ?? ''));

const hasModifier = (event) => Boolean(event?.ctrlKey || event?.metaKey || event?.altKey);

/**
 * The next watch state after a physical key reaches a math field, and whether
 * the cursor must leave the fraction BEFORE the field inserts that key.
 *
 * `value` is the field's latex as the key arrives. MathLive applies a key to
 * its value at once but dispatches the host's `input` event later, in a batch,
 * so the keydown that follows a `/` is the first reliable moment to see what
 * the slash built.
 *
 * @param {null|{phase:string,text?:string}} state
 * @param {{key:string, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean, isComposing?:boolean}} event
 * @param {string} [value]
 * @returns {{ state: null|object, leaveFraction: boolean }}
 */
export const typedFractionKeyStep = (incoming, event, value) => {
  const key = String(event?.key ?? '');
  const state = incoming?.phase === 'opening' && value !== undefined
    ? typedFractionValueStep(incoming, value)
    : incoming;
  if (PASSIVE_KEYS.has(key)) return { state, leaveFraction: false };
  if (event?.isComposing || hasModifier(event)) return { state: IDLE, leaveFraction: false };

  if (key === '/' || key === '÷') {
    // Never leaves: after a fraction MathLive's `/` will not take the fraction
    // as its numerator, so 2/3/4 would become 2/3 beside an empty fraction.
    // The nested 2/(3/4) it builds instead is at least a whole expression.
    return { state: OPENING, leaveFraction: false };
  }
  if (state?.phase !== 'denominator') return { state: IDLE, leaveFraction: false };

  if (DENOMINATOR_CHARACTER.test(key)) {
    return { state: { phase: 'denominator', text: `${state.text}${key}` }, leaveFraction: false };
  }
  // A sign before any digit is a negative denominator: 1/−2x is (1/−2)x.
  if ((key === '-' || key === '−') && state.text === '') {
    return { state: { phase: 'denominator', text: '-' }, leaveFraction: false };
  }
  if (AFTER_FRACTION_KEY.test(key) && isPlainNumberDenominator(state.text)) {
    return { state: IDLE, leaveFraction: true };
  }
  return { state: IDLE, leaveFraction: false };
};

/**
 * The field reported its new value. After a typed `/` this is where we learn
 * whether the cursor really is in an empty denominator: MathLive puts it there
 * only when something before the slash became the numerator. With nothing
 * before it (`/2`, `y=/3`) BOTH boxes are empty and the cursor waits in the
 * numerator, which must not be treated as a denominator.
 */
export const typedFractionValueStep = (state, value) => {
  if (state?.phase !== 'opening') return state;
  const latex = String(value ?? '');
  const placeholders = latex.match(PLACEHOLDER)?.length || 0;
  const openedWithNumerator = placeholders === 1 && latex.includes('}{\\placeholder{}}');
  return openedWithNumerator ? { phase: 'denominator', text: '' } : IDLE;
};

const COMMAND_AS_KEY = new Map([
  ['\\times', '*'], ['\\cdot', '*'], ['\\div', '/'],
  ['\\le', '<'], ['\\leq', '<'], ['\\ge', '>'], ['\\geq', '>'], ['\\ne', '<'], ['\\neq', '<'],
  ['\\pi', 'p'], ['\\theta', 'p'],
]);

/**
 * An on-screen keypad press. A single character behaves as if typed; a known
 * operator or constant command maps to the key it stands for; anything that
 * builds structure (a template with #0/#?/#@) ends the watch.
 */
export const typedFractionCommandStep = (state, command, fieldValue) => {
  const value = String(command ?? '').trim();
  if (/#0|#\?|#@/.test(value)) return { state: IDLE, leaveFraction: false };
  if (value.length === 1) return typedFractionKeyStep(state, { key: value }, fieldValue);
  if (COMMAND_AS_KEY.has(value)) return typedFractionKeyStep(state, { key: COMMAND_AS_KEY.get(value) }, fieldValue);
  return { state: IDLE, leaveFraction: false };
};

export const TYPED_FRACTION_IDLE = IDLE;
