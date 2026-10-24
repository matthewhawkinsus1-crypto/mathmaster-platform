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

// A negative factor in a row-by-column sum is written in parentheses:
// "2(3) + (−1)(1/6)", never "+ −1(1/6)".
export const negativeInParentheses = (text) => (/^[-−]/.test(String(text)) ? `(${text})` : String(text));
