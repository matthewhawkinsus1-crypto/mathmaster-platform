/*
 * HOW GRAPHING WRITES A LINE FOR THE STUDENT TO READ.
 *
 * The readout used formatLine, written for the grader's stored record: a
 * student who plotted (0, 2) and (3, 4) read "Your line: y = 0.66666667x + 2",
 * and through (0, 0) and (1, 1) "y = 1x + 0" — math the platform's own solver
 * refuses to show (pass 3, TOOL-7). These write it as a teacher would: exact
 * fractions, no 1 or 0 coefficient, no "+ 0", a true minus sign.
 *
 * Display only. formatLine stays as it is: the server stores its text as the
 * response, and grading never reads these strings.
 */
const MINUS = '−';
const EPSILON = 1e-9;

// lineFromPoints rounds to 8 places (0.66666667), so the fraction is found
// within that rounding: 2/3, not 0.6667. A value no small fraction matches
// keeps four decimal places.
const fraction = (value) => {
  const magnitude = Math.abs(Number(value));
  for (let denominator = 1; denominator <= 1000; denominator += 1) {
    const numerator = Math.round(magnitude * denominator);
    if (Math.abs(magnitude - numerator / denominator) <= 1e-7) {
      return denominator === 1 ? { whole: String(numerator) } : { numerator: String(numerator), denominator: String(denominator) };
    }
  }
  return { whole: String(Number(magnitude.toFixed(4))) };
};

const coefficientLatex = (value) => {
  const magnitude = Math.abs(value);
  if (Math.abs(magnitude - 1) <= EPSILON) return '';
  const part = fraction(magnitude);
  return part.whole ?? `\\frac{${part.numerator}}{${part.denominator}}`;
};

const numberLatex = (value) => {
  const part = fraction(value);
  return part.whole ?? `\\frac{${part.numerator}}{${part.denominator}}`;
};

const coefficientText = (value) => {
  const magnitude = Math.abs(value);
  if (Math.abs(magnitude - 1) <= EPSILON) return '';
  const part = fraction(magnitude);
  return part.whole ?? `(${part.numerator}/${part.denominator})`;
};

const numberText = (value) => {
  const part = fraction(value);
  return part.whole ?? `${part.numerator}/${part.denominator}`;
};

const write = (line, { coefficient, number, minus }) => {
  if (!line) return null;
  if (line.kind === 'vertical') {
    const x = Number(line.x);
    return `x = ${x < -EPSILON ? minus : ''}${number(x)}`;
  }
  const m = Number(line.m);
  const b = Number(line.b);
  if (!Number.isFinite(m) || !Number.isFinite(b)) return null;
  const hasX = Math.abs(m) > EPSILON;
  const hasB = Math.abs(b) > EPSILON;
  const xTerm = hasX ? `${m < 0 ? minus : ''}${coefficient(m)}x` : '';
  if (!hasX) return `y = ${hasB && b < 0 ? minus : ''}${hasB ? number(b) : '0'}`;
  if (!hasB) return `y = ${xTerm}`;
  return `y = ${xTerm} ${b < 0 ? minus : '+'} ${number(b)}`;
};

/** "y = (2/3)x + 2", "y = x", "y = −x − 4", "x = 3": for plain-text places. */
export const lineReadoutText = (line) => write(line, { coefficient: coefficientText, number: numberText, minus: MINUS });

/** The same line as LaTeX for MathDisplay: "y = \frac{2}{3}x + 2". */
export const lineReadoutLatex = (line) => write(line, { coefficient: coefficientLatex, number: numberLatex, minus: '-' });
