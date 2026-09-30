/*
 * A NUMBER BOX A STUDENT CAN ACTUALLY TYPE THE ANSWER INTO.
 *
 * `inputMode="decimal"` asks the device for a decimal keypad. That is right for
 * a price and wrong for most answers in an algebra course:
 *
 *   iPhone decimal pad       digits and "." — no minus sign, no slash
 *   Android tablet decimal   digits, ".", "-" — no slash
 *
 * Inside a question a phone never sees those pads — MobileViewportContainer
 * swaps any decimal/numeric box for MathMaster's own keypad, which has ± — but
 * that keypad had no fraction key either. So a slope of −2/3, which the tools
 * grade exactly (parseNumericAnswer accepts "a/b"), could not be typed on a
 * phone at all: 0.667 is not −2/3 within the tools' 1e-6 tolerance. Student UX
 * pass, R-6, measured on Linear Table Workbench at 390×844.
 *
 * FRACTION_ENTRY_PROPS is for a box whose parser accepts a fraction (signed
 * integers and decimals too). It asks for a text keyboard wherever the device
 * keyboard is used (a tablet: its number layer has "-" and "/"), and it marks
 * the box so a phone gets MathMaster's keypad WITH the fraction key.
 *
 * Do not use it on `type="number"` boxes or on boxes parsed with Number():
 * "3/4" would be rejected or turned into NaN. Those keep their own inputMode —
 * the phone keypad's ± already covers negatives.
 */
export const NUMBER_ENTRY_ATTRIBUTE = 'data-mm-number-entry';

export const FRACTION_ENTRY_PROPS = Object.freeze({
  type: 'text',
  inputMode: 'text',
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  'data-mathmaster-mobile-keypad': 'true',
  [NUMBER_ENTRY_ATTRIBUTE]: 'fraction',
});

/** Does this box take fractions (so the phone keypad offers "/")? */
export const acceptsFractionEntry = (element) => element?.getAttribute?.(NUMBER_ENTRY_ATTRIBUTE) === 'fraction';

/**
 * The phone keypad's edit for one key, as a pure function of the box's text.
 * Returns the next text, or the same text when the key would make it invalid.
 */
export const applyNumberKey = (current, key, { fraction = false, bareMinus = true } = {}) => {
  const text = String(current ?? '');
  if (key === 'clear') return '';
  if (key === 'backspace') return text.slice(0, -1);
  if (key === '±') {
    // On an empty text box, ± starts a negative number. A `type="number"` box
    // cannot hold a lone "-" (the browser clears it), so there ± waits for a
    // digit — never the old "0", which turned "±, 3" into "03".
    if (!text) return bareMinus ? '-' : text;
    return text.startsWith('-') ? text.slice(1) : `-${text}`;
  }
  if (key === '/') {
    // One fraction bar, after a numerator.
    if (!fraction || text.includes('/') || !/\d/.test(text)) return text;
    return `${text}/`;
  }
  if (key === '.') {
    // One decimal point per number: the part after "/" is its own number.
    const part = fraction && text.includes('/') ? text.slice(text.indexOf('/') + 1) : text;
    if (part.includes('.')) return text;
  }
  return `${text}${key}`;
};

export default FRACTION_ENTRY_PROPS;
