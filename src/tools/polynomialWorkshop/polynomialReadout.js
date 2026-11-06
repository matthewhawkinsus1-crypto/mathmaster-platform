/*
 * HOW POLYNOMIAL WORKSHOP WRITES A POLYNOMIAL FOR THE STUDENT TO READ.
 *
 * It printed the coefficient list as it came: "P(x) = 1x^2 -5x +6", a 1 no
 * teacher writes, a caret, a hyphen for a minus and a sign stuck to its number
 * (pass 3, TOOL-7). This writes it the way Graphing writes a line
 * (../graphing2/lineReadout.js): "x² − 5x + 6" — no 1 or 0 coefficient, no
 * "+ 0" term, a true minus sign with a space either side. Display only: the
 * coefficient lists the grader reads are unchanged.
 */
const MINUS = '−';
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';

const superscript = (value) => String(value).split('').map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? digit).join('');
// Ten significant figures: 1.00001 is not printed as 1 (review N7).
const magnitude = (value) => String(Number(Math.abs(value).toPrecision(10)));

/**
 * "x² − 5x + 6" from [1, -5, 6]; "0" when every coefficient is zero.
 * `keepZeros` writes a zero coefficient as a term, "x³ + 0x² + 0x − 8", for a
 * screen that asks for the coefficient list (division: "1, 0, 0, -8").
 */
export const polynomialReadoutText = (coefficients = [], { variable = 'x', keepZeros = false } = {}) => {
  const list = Array.isArray(coefficients) ? coefficients.map(Number) : [];
  const terms = [];
  list.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const zero = Math.abs(value) < 1e-12;
    // A leading zero is never a term; an inner one is, only when kept.
    if (zero && (!keepZeros || !terms.length)) return;
    const degree = list.length - index - 1;
    const power = degree > 1 ? `${variable}${superscript(degree)}` : degree === 1 ? variable : '';
    const unit = power && Math.abs(Math.abs(value) - 1) < 1e-12;
    const body = `${unit ? '' : zero ? '0' : magnitude(value)}${power}`;
    if (!terms.length) terms.push(`${value < 0 ? MINUS : ''}${body}`);
    else terms.push(`${value < 0 ? MINUS : '+'} ${body}`);
  });
  return terms.length ? terms.join(' ') : '0';
};

/*
 * THE AREA MODEL'S FACTORS, AS THE PROMPT WRITES THEM (walkthrough
 * 2026-11-06, P-5). Its header printed the binomials' coefficients as they
 * came: Algebra II Honors L4 CW 3's (2x + 3)(x − 4) read "(2x +3)(1x -4)", with
 * a "1x" column head, and L4 PR 2 "(1x +5)(2x -3)". The header and the row and
 * column heads now write each factor and each term the way the workshop
 * writes any polynomial.
 */
/** "(2x + 3)(x − 4)" from [2, 3] and [1, -4]. */
export const binomialProductText = (left = [], right = []) => `(${polynomialReadoutText(left)})(${polynomialReadoutText(right)})`;

/** A binomial's two terms as the area model heads its row or column: "x" and "−4" from [1, -4]. */
export const binomialTermTexts = ([coefficient, constant] = []) => [polynomialReadoutText([coefficient, 0]), polynomialReadoutText([constant])];
