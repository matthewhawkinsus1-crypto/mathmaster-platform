/*
 * HOW THE MATRIX LAB SHOWS ITS ARITHMETIC (TL26). Presentation only: nothing
 * here is graded or sent anywhere.
 */

// How many calculator commands stay on screen: enough for [A]⁻¹ beside
// [A]⁻¹·[B], so a student copying X can still see the inverse it came from.
export const CALCULATOR_HISTORY_LENGTH = 3;

/** The command list after running `operation`: newest first, each once, bounded. */
export const nextCalculatorHistory = (history, operation) => [
  operation,
  ...(Array.isArray(history) ? history : []).filter((entry) => entry !== operation),
].slice(0, CALCULATOR_HISTORY_LENGTH);

/**
 * THE ROW-BY-COLUMN TERMS, FADING (student pass 3, R-7).
 *
 * `showExpansion: true` writes out the terms of whichever product cell has
 * focus, every time (Classwork). Practice then jumped from that to nothing.
 * `showExpansion: "fading"` keeps the first cell's terms as the worked example
 * and shows another cell's only when the student asks, so the help is there
 * while it is needed and fades as it is not. Where the activity withholds the
 * method (a DOL, quiz or test: useMethodWithheld) a fading scaffold is not
 * shown and cannot be asked for. `true` is unchanged, as it was authored.
 *
 *   authored        the question's `showExpansion`
 *   focus           { i, j } of the product cell that has focus and has terms, else null
 *   requested       { i, j } of the cell the student asked for, else null
 *   methodWithheld  useMethodWithheld()
 *
 * Returns { show, offer }: draw the focused cell's terms, and offer the button
 * that asks for them (it stays while they show, so the student can hide them).
 */
export const expansionPlan = ({ authored, focus = null, requested = null, methodWithheld = false } = {}) => {
  if (!focus) return { show: false, offer: false };
  if (authored === true) return { show: true, offer: false };
  if (authored !== 'fading' || methodWithheld) return { show: false, offer: false };
  const first = focus.i === 0 && focus.j === 0;
  const asked = Boolean(requested) && requested.i === focus.i && requested.j === focus.j;
  return { show: first || asked, offer: !first };
};

// A negative factor in a row-by-column sum is written in parentheses:
// "2(3) + (−1)(1/6)", never "+ −1(1/6)".
export const negativeInParentheses = (text) => (/^[-−]/.test(String(text)) ? `(${text})` : String(text));
