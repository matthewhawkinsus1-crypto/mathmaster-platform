/*
 * A MONOMIAL QUOTIENT, OR A MONOMIAL WITH A NEGATIVE EXPONENT, WRITTEN IN
 * ANOTHER ORDER (GR35a).
 *
 * The polynomial readers refuse a letter in a denominator and a negative
 * exponent (algebraicForm.mjs dividePoly / powerPoly), so these answers were
 * compared as text: `\frac{y^4}{x^4\cdot 81}` was wrong for `y^4/(81x^4)`, and
 * `y^3x^{-2}` for `x^{-2}y^3`.
 *
 * This compares them FACTOR FOR FACTOR WITH THE KEY: the same number, the same
 * letters with the same whole-number exponents, each on the same side of the
 * fraction bar, the same sign, in any order and in any spelling (`\frac` or
 * `/`, `\cdot`, `*` or nothing). It never multiplies, cancels, combines or
 * moves a factor across the bar, so an answer is right only if it holds
 * exactly the key's factors. A key in simplest form is therefore only matched
 * by an answer in simplest form: an unreduced coefficient (`2y^4/(162x^4)`),
 * a factor left to cancel (`y^8/(81x^4y^4)`), a negative exponent for a
 * positive one or the reverse (`y^4x^{-4}/81`), a power of a number (`3^4`), a
 * number or a power split in two (`9\cdot 9`, `x^2x^2`) and a written 1 are
 * all still not the key.
 *
 * Read only: one term (a leading minus, or one in the numerator, and no
 * other); one fraction bar at most, over the whole term; whole-number
 * exponents on letters. Anything else (a sum, a fraction times a factor, a
 * fraction in a denominator, a power of a bracket, a minus in a denominator)
 * is not read here and keeps the verdict it had. Only an answer with a letter
 * in a denominator or a negative exponent reaches it, so every other answer
 * keeps exactly its old reading.
 */
import { normalizeAlgebraicText } from './algebraicForm.mjs';

const tokenize = (text) => {
  const tokens = [];
  for (let index = 0; index < text.length;) {
    const rest = text.slice(index);
    const number = /^\d*\.?\d+/.exec(rest);
    if (number) {
      tokens.push({ kind: 'number', value: number[0] });
      index += number[0].length;
    } else if (/[A-Za-z]/.test(text[index])) {
      // One letter is one name, read without case as the polynomial reader does.
      tokens.push({ kind: 'name', value: text[index].toLowerCase() });
      index += 1;
    } else if ('+-*/^()'.includes(text[index])) {
      tokens.push({ kind: text[index] });
      index += 1;
    } else {
      return null;
    }
  }
  return tokens;
};

/*
 * One term as { sign, numerator: [factor], denominator: [factor] }, each
 * factor a string: a number as written (`81`), or a letter with its exponent
 * as written (`x` for x, `x^1` for x^1, `x^-4`). Null when it is not one.
 */
const readTerm = (value) => {
  // A typed exponent that opens with a minus or a bracket, before a `/`, is
  // read as drawn: `10^-3/2` is 10^(-3/2) and `x^(2)/3` is x^(2/3)
  // (answerEquivalence, N2 and the H-13 review), while the polynomial text
  // below would unbrace it into (10^-3)/2. Not read here.
  if (/\^\s*[-−–(]/.test(String(value ?? '')) && String(value ?? '').includes('/')) return null;
  const text = normalizeAlgebraicText(value);
  if (!text || text.includes('=')) return null;
  const tokens = tokenize(text);
  if (!tokens || !tokens.length) return null;
  let position = 0;
  let minusSigns = 0;
  const peek = () => tokens[position] || null;

  // `^4`, `^-4`, `^(4)`, `^(-4)`: a whole number, as text.
  const readExponent = () => {
    const open = peek()?.kind === '(';
    if (open) position += 1;
    const negative = peek()?.kind === '-';
    if (negative) position += 1;
    const token = peek();
    if (token?.kind !== 'number' || !/^\d+$/.test(token.value)) return null;
    position += 1;
    if (open) {
      if (peek()?.kind !== ')') return null;
      position += 1;
    }
    return `${negative ? '-' : ''}${Number(token.value)}`;
  };

  // A product of factors, until a `)`, a `/` or the end. Brackets round a
  // product are only grouping. A minus may open the numerator, or the bracket
  // that starts it (`\frac{-2x^3}{y^2}`), and nowhere else: `allowSign`.
  let readProduct;
  const readFactor = (into, { allowSign = false } = {}) => {
    const token = peek();
    if (!token) return false;
    if (token.kind === 'number') {
      position += 1;
      if (peek()?.kind === '^') {
        position += 1;
        const exponent = readExponent();
        if (exponent === null) return false;
        into.push(`${Number(token.value)}^${exponent}`);
      } else into.push(String(Number(token.value)));
      return true;
    }
    if (token.kind === 'name') {
      position += 1;
      if (peek()?.kind === '^') {
        position += 1;
        const exponent = readExponent();
        if (exponent === null) return false;
        into.push(`${token.value}^${exponent}`);
      } else into.push(token.value);
      return true;
    }
    if (token.kind === '(') {
      position += 1;
      if (!readProduct(into, { allowSign })) return false;
      if (peek()?.kind !== ')') return false;
      position += 1;
      // A power of a bracket is not a product of factors.
      return peek()?.kind !== '^';
    }
    return false;
  };
  readProduct = (into, { allowSign }) => {
    if (allowSign && peek()?.kind === '-') { minusSigns += 1; position += 1; }
    if (!readFactor(into, { allowSign })) return false;
    // Then `*` and a factor, or a factor straight after (`3x`, `2(x)`).
    for (;;) {
      const token = peek();
      if (token?.kind === '*') position += 1;
      else if (!token || !['number', 'name', '('].includes(token.kind)) return true;
      if (!readFactor(into)) return false;
    }
  };

  // The whole term, or one bracketed fraction (`\frac` is `((a)/(b))`).
  const readFraction = () => {
    const numerator = [];
    const denominator = [];
    if (!readProduct(numerator, { allowSign: true })) return null;
    if (peek()?.kind === '/') {
      position += 1;
      if (peek()?.kind === '-') return null;
      if (!readFactor(denominator)) return null;
    }
    return { numerator, denominator };
  };

  if (peek()?.kind === '-') { minusSigns += 1; position += 1; }
  let term = null;
  // `((a)/(b))`: the editor's fraction, one bracket round the whole term.
  if (peek()?.kind === '(') {
    const [start, signs] = [position, minusSigns];
    position += 1;
    term = readFraction();
    if (term && peek()?.kind === ')' && position + 1 === tokens.length) position += 1;
    else [position, minusSigns, term] = [start, signs, null];
  }
  if (!term) term = readFraction();
  if (!term || position !== tokens.length || minusSigns > 1) return null;
  return {
    sign: minusSigns ? -1 : 1,
    numerator: [...term.numerator].sort(),
    denominator: [...term.denominator].sort(),
  };
};

const hasLetter = (factors) => factors.some((factor) => /[A-Za-z]/.test(factor));
const hasNegativeExponent = (factors) => factors.some((factor) => /\^-/.test(factor));
// The answers no other reader can compare: a letter below the bar, or a negative exponent.
const outsidePolynomials = (term) => hasLetter(term.denominator) || hasNegativeExponent([...term.numerator, ...term.denominator]);
const sameFactors = (left, right) => left.length === right.length && left.every((factor, index) => factor === right[index]);

export const sameMonomialQuotient = (left, right) => {
  const a = readTerm(left);
  const b = readTerm(right);
  if (!a || !b || !(outsidePolynomials(a) || outsidePolynomials(b))) return false;
  return a.sign === b.sign && sameFactors(a.numerator, b.numerator) && sameFactors(a.denominator, b.denominator);
};

export default sameMonomialQuotient;
