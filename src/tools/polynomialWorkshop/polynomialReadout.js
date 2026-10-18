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
const magnitude = (value) => String(Number(Math.abs(value).toFixed(4)));

/** "x² − 5x + 6" from [1, -5, 6]; "0" when every coefficient is zero. */
export const polynomialReadoutText = (coefficients = [], variable = 'x') => {
  const list = Array.isArray(coefficients) ? coefficients.map(Number) : [];
  const terms = [];
  list.forEach((value, index) => {
    if (!Number.isFinite(value) || Math.abs(value) < 1e-12) return;
    const degree = list.length - index - 1;
    const power = degree > 1 ? `${variable}${superscript(degree)}` : degree === 1 ? variable : '';
    const unit = power && Math.abs(Math.abs(value) - 1) < 1e-12;
    const body = `${unit ? '' : magnitude(value)}${power}`;
    if (!terms.length) terms.push(`${value < 0 ? MINUS : ''}${body}`);
    else terms.push(`${value < 0 ? MINUS : '+'} ${body}`);
  });
  return terms.length ? terms.join(' ') : '0';
};
