// Worked solution review for polynomialWorkshop (contract: ../toolSolutionReview.js, textOnlyReview).
//
// WHAT THE SHARED GRADER CALLS CORRECT
// (functions/shared/serverGrading/tools/polynomialWorkshop.mjs). Every view of
// the workshop has exactly one right answer, and the review reads it with the
// grader's own helpers (polynomialMath.mjs), from the question's own fields
// with the grader's own defaults for an unauthored one, for the view the
// grader resolves (the declaration's resolveMode, so a padded or unknown mode
// is the FactorZero screen the student actually saw):
//
//   factorZero        P(r) = evaluatePolynomial(coefficients, r); (x − r) is a
//                     factor exactly when |P(r)| < 1e-9.
//   multiplyArea      the four area-model products and the expanded
//                     coefficient list (polynomialMultiply).
//   factorQuadratic   the integer pair p, q with x² + bx + c = (x + p)(x + q)
//                     (integerFactorPairForMonicQuadratic), in either order.
//   division          the quotient and remainder coefficient lists
//                     (polynomialLongDivide).
//   graphConnection   crosses / touches at the target zero (its multiplicity)
//                     and the end behavior (degree parity, leading sign).
//   rationalFeatures  hole / vertical asymptote / zero / none at the target
//                     value, after cancelling common factors.
//
// Before a review is returned, the work it states is graded by that grader
// through the bytes the server reads (gradeWorkWithGrader): if it is not
// marked correct, the review is null — a review never states an answer the
// gradebook would reject.
//
// Null — never a guess — when:
//   - the question does not name the workshop or any of its fields ({});
//   - the grader cannot build a key (a coefficient list that is not a list,
//     a zero divisor, an empty root list) or a field is not a number;
//   - factorQuadratic has no integer factor pair: the grader can never mark
//     any answer right, so there is nothing true to state;
//   - a degenerate screen whose key is not the mathematics (a binomial with
//     a zero x-coefficient, a zero leading coefficient, a polynomial of
//     degree 0, a root listed twice, a multiplicity that is not a positive
//     whole number, a target value two listed roots both sit on);
//   - a number the review would print is not exact in at most 6 decimal
//     places (a coefficient list is read with Number(), so 1/3 cannot be
//     typed exactly), or the worked solution would need more steps than the
//     review panel shows.
//
// Shown only once the question is closed (QuestionEngine); pure, no React.
import polynomialWorkshopGrader from '../../../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import declaration from '../../../../functions/shared/serverGrading/declarations/polynomialWorkshop.mjs';
import { resolveToolMode } from '../../../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { OWN_CHOICES } from '../../../../functions/shared/toolMath/shared/judgmentChoices.mjs';
import { evaluatePolynomial, nearlyEqual } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  POLYNOMIAL_WORKSHOP_DEFAULTS as DEFAULTS,
  coefficientsFromRoots,
  endBehavior,
  factorBehaviorAtRoot,
  graphConnectionTargetEntry,
  integerFactorPairForMonicQuadratic,
  polynomialLongDivide,
  polynomialMultiply,
  rationalFeatureMap,
  rationalFeatureTargetValue,
  rationalFeatureTypeAt,
  trimLeadingZeros,
} from '../../../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';

export const implemented = true;

const EPSILON = 1e-9;
// The review panel keeps at most 12 steps (textOnlyReview); a solution that
// needs more is not shown cut short.
const MAX_STEPS = 12;
const MAX_DEGREE = 20;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const DECIMAL = /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i;
// A number the workshop reads with Number(): a finite number, or a string that
// is plainly one. Anything else (null, '', true, '0x10') is not a number here.
const numericValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && DECIMAL.test(value)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
};
const numericList = (list) => Array.isArray(list) && list.length > 0 && list.every((value) => numericValue(value) !== null);
const isZero = (value) => Math.abs(value) <= EPSILON;
const sameValue = (a, b, scale = 1) => Math.abs(a - b) <= EPSILON * Math.max(1, scale, Math.abs(a), Math.abs(b));
const sameList = (a, b) => a.length === b.length && a.every((value, index) => sameValue(value, b[index]));
const timesWord = (count) => (count === 1 ? '1 time' : `${count} times`);

/*
 * Numbers and polynomials as the review prints them (LaTeX inside $…$, plain
 * ASCII for what a student types). A number prints as an integer within 1e-9,
 * else to at most 6 decimal places; `exact()` turns false the moment a printed
 * number is not the value itself, and the builder then states nothing.
 */
const makeWriter = () => {
  let exact = true;
  const num = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) >= 1e12) {
      exact = false;
      return '0';
    }
    const rounded = Math.abs(number - Math.round(number)) <= EPSILON ? Math.round(number) : Number(number.toFixed(6));
    if (Math.abs(rounded - number) > EPSILON * Math.max(1, Math.abs(number))) exact = false;
    const text = String(Object.is(rounded, -0) ? 0 : rounded);
    if (/e/i.test(text)) exact = false;
    return text;
  };
  // After an operator: negatives in parentheses.
  const operand = (value) => {
    const text = num(value);
    return text.startsWith('-') ? `(${text})` : text;
  };
  // For a plain-text label: the typographic minus the workshop shows.
  const plain = (value) => num(value).replace(/^-/, '−');
  const power = (exponent) => (exponent === 0 ? '' : exponent === 1 ? 'x' : `x^{${exponent}}`);
  // One signed monomial on its own ("-8x", "2x^{2}", "0").
  const monomial = (coefficient, exponent) => {
    if (isZero(coefficient)) return '0';
    const variable = power(exponent);
    if (!variable) return num(coefficient);
    if (sameValue(coefficient, 1)) return variable;
    if (sameValue(coefficient, -1)) return `-${variable}`;
    return `${num(coefficient)}${variable}`;
  };
  // Signed terms [coefficient, exponent] in the order given, NOT combined.
  const terms = (list) => {
    const pieces = [];
    list.forEach(([coefficient, exponent]) => {
      if (isZero(coefficient)) return;
      const body = monomial(Math.abs(coefficient), exponent);
      if (!pieces.length) pieces.push(coefficient < 0 ? `-${body}` : body);
      else pieces.push(`${coefficient < 0 ? '-' : '+'} ${body}`);
    });
    return pieces.length ? pieces.join(' ') : '0';
  };
  const termsOf = (coefficients) => {
    const values = trimLeadingZeros(coefficients);
    return values.map((coefficient, index) => [coefficient, values.length - 1 - index]);
  };
  const poly = (coefficients) => terms(termsOf(coefficients));
  // A sum of numbers as written out: "4 - 10 + 6".
  const sum = (values) => values.map((value, index) => {
    if (index === 0) return num(value);
    return value < 0 ? `- ${num(Math.abs(value))}` : `+ ${num(value)}`;
  }).join(' ');
  // What a student types into a coefficient box: "1, -2, -11".
  const list = (coefficients) => coefficients.map(num).join(', ');
  // The factor that is zero at x = root: "x - 2", "x + 3", "x".
  const factor = (root) => (isZero(root) ? 'x' : `x ${root < 0 ? '+' : '-'} ${num(Math.abs(root))}`);
  const factorPower = (root, exponent) => {
    const inner = factor(root);
    const base = inner === 'x' ? 'x' : `(${inner})`;
    return exponent > 1 ? `${base}^{${exponent}}` : base;
  };
  // A product of factors, the bare x first: "x(x - 2)^{2}(x + 1)".
  const product = (groups) => {
    if (!groups.length) return '1';
    if (groups.length === 1 && groups[0].exponent === 1) return factor(groups[0].root);
    return [...groups]
      .sort((a, b) => Number(!isZero(a.root)) - Number(!isZero(b.root)))
      .map(({ root, exponent }) => factorPower(root, exponent))
      .join('');
  };
  return { num, operand, plain, monomial, terms, termsOf, poly, sum, list, factor, factorPower, product, exact: () => exact };
};

// "Yes" when the grader marks this work right — through the bytes the server reads.
const acceptedByGrader = (question, work) => {
  const result = gradeWorkWithGrader({ grader: polynomialWorkshopGrader, question, work });
  return result.graded === true && result.isCorrect === true;
};

/* ------------------------------------------------------------------ */
/* factorZero                                                          */
/* ------------------------------------------------------------------ */

const buildFactorZero = (question) => {
  const coefficients = question.coefficients || DEFAULTS.factorZero.coefficients;
  if (!numericList(coefficients)) return null;
  const values = trimLeadingZeros(coefficients.map(Number));
  if (values.length < 2 || values.length - 1 > MAX_DEGREE) return null;
  const root = Number(question.candidateRoot ?? DEFAULTS.factorZero.candidateRoot);
  if (!Number.isFinite(root)) return null;
  // The grader's own evaluation and its own zero test.
  const value = evaluatePolynomial(coefficients, root);
  const isFactor = Math.abs(value) < 1e-9;

  const w = makeWriter();
  const r = w.num(root);
  const v = w.num(value);
  const P = w.poly(values);
  const used = w.termsOf(values).filter(([coefficient]) => !isZero(coefficient));
  const substituted = used.map(([coefficient, exponent], index) => {
    const magnitude = Math.abs(coefficient);
    const base = exponent === 0 ? w.num(magnitude) : `${sameValue(magnitude, 1) ? '' : w.num(magnitude)}(${r})${exponent > 1 ? `^{${exponent}}` : ''}`;
    if (index === 0) return coefficient < 0 ? `-${base}` : base;
    return `${coefficient < 0 ? '-' : '+'} ${base}`;
  }).join(' ');
  const termValues = used.map(([coefficient, exponent]) => coefficient * root ** exponent);
  const total = termValues.reduce((a, b) => a + b, 0);
  if (!sameValue(total, value, termValues.reduce((a, b) => a + Math.abs(b), 0))) return null;

  // (x − r) as the question writes it, and simplified when r is negative or 0.
  const factorText = w.factorPower(root, 1);
  const named = root < 0 || isZero(root) ? `$(x - ${w.operand(root)})$, that is $${factorText}$,` : `$${factorText}$`;
  const steps = [
    `Substitute $x = ${r}$ into $P(x) = ${P}$: $P(${r}) = ${substituted}$.`,
    used.length > 1
      ? `Work out each term and add: $P(${r}) = ${w.sum(termValues)} = ${v}$.`
      : `Work it out: $P(${r}) = ${v}$.`,
    isFactor
      ? `By the Factor Theorem, $(x - r)$ is a factor of $P(x)$ exactly when $P(r) = 0$. Here $P(${r}) = 0$, so ${named} is a factor: Yes.`
      : `By the Factor Theorem, $(x - r)$ is a factor of $P(x)$ exactly when $P(r) = 0$. Here $P(${r}) = ${v} \\neq 0$, so ${named} is not a factor: No.`,
  ];
  const label = root < 0 ? `(x + ${w.plain(Math.abs(root))})` : isZero(root) ? '(x − 0)' : `(x − ${w.plain(root)})`;
  const items = [
    { label: `P(${w.plain(root)})`, value: v },
    { label: `Is ${label} a factor?`, value: isFactor ? 'Yes' : 'No' },
  ];
  if (!w.exact()) return null;

  // The check: dividing by (x − r) leaves P(r) as the remainder.
  const generic = 'Dividing $P(x)$ by $(x - r)$ always leaves the remainder $P(r)$ (the Remainder Theorem), so $P(r) = 0$ is exactly when $(x - r)$ divides $P(x)$ with nothing left over.';
  let why = generic;
  try {
    const { quotient, remainder } = polynomialLongDivide(values, [1, -root]);
    const check = makeWriter();
    const Q = check.poly(quotient);
    const divisor = check.factorPower(root, 1);
    const remainderMatches = remainder.length === 1 && sameValue(remainder[0], value, Math.max(...values.map(Math.abs)));
    let text = null;
    if (remainderMatches && isFactor) {
      const lead = quotient.length === 1
        ? `${sameValue(quotient[0], 1) ? '' : sameValue(quotient[0], -1) ? '-' : check.num(quotient[0])}${divisor}`
        : `${divisor}(${Q})`;
      text = `Dividing $P(x)$ by $${divisor}$ leaves remainder 0, so $${check.poly(values)} = ${lead}$. The remainder of dividing by $(x - r)$ is always $P(r)$ (the Remainder Theorem), so $P(r) = 0$ is exactly when $(x - r)$ is a factor.`;
    } else if (remainderMatches) {
      text = `Dividing $P(x)$ by $${divisor}$ gives quotient $${Q}$ and remainder $${check.num(remainder[0])}$ — the same number as $P(${check.num(root)})$, as the Remainder Theorem says — so $${divisor}$ does not divide $P(x)$ evenly.`;
    }
    if (text && check.exact()) why = text;
  } catch {
    why = generic;
  }

  const work = { value: v, factorChoice: isFactor ? 'yes' : 'no' };
  return { title: 'Factor Theorem solution', items, steps, why, note: null, work };
};

/* ------------------------------------------------------------------ */
/* multiplyArea                                                        */
/* ------------------------------------------------------------------ */

const CELL_LABELS = Object.freeze(['Area cell 1 (x² term)', 'Area cell 2 (x term)', 'Area cell 3 (x term)', 'Area cell 4 (constant)']);
const CHECK_POINTS = Object.freeze([2, 1, 3, -1, -2, 4, 5]);

const buildMultiplyArea = (question) => {
  const left = question.leftBinomial || DEFAULTS.multiplyArea.leftBinomial;
  const right = question.rightBinomial || DEFAULTS.multiplyArea.rightBinomial;
  if (!numericList(left) || !numericList(right) || left.length !== 2 || right.length !== 2) return null;
  const [a, b] = left.map(Number);
  const [c, d] = right.map(Number);
  // "(0x + 3)" is not a binomial in x; the grader's trimmed product would
  // then have fewer coefficients than the area model shows.
  if (isZero(a) || isZero(c)) return null;
  // The grader's key, computed exactly as it computes it.
  const cells = [a * c, a * d, b * c, b * d];
  const product = polynomialMultiply(left, right);
  if (product.length !== 3 || !sameList(product, [cells[0], cells[1] + cells[2], cells[3]])) return null;

  const w = makeWriter();
  const L = w.terms([[a, 1], [b, 0]]);
  const R = w.terms([[c, 1], [d, 0]]);
  const rows = [w.monomial(a, 1), w.num(b)];
  const columns = [w.monomial(c, 1), w.num(d)].map((text) => (text.startsWith('-') ? `(${text})` : text));
  const cellText = cells.map((cell) => w.num(cell));
  const middle = `${w.monomial(cells[1], 1)} ${cells[2] < 0 ? `- ${w.monomial(-cells[2], 1)}` : `+ ${w.monomial(cells[2], 1)}`}`;
  const expanded = w.poly(product);
  const steps = [
    `Draw a 2-by-2 area model for $(${L})(${R})$: the rows are the terms of $${L}$ ($${rows[0]}$ and $${rows[1]}$), and the columns are the terms of $${R}$ ($${w.monomial(c, 1)}$ and $${w.num(d)}$).`,
    `Top row: $${rows[0]} \\cdot ${columns[0]} = ${w.monomial(cells[0], 2)}$ and $${rows[0]} \\cdot ${columns[1]} = ${w.monomial(cells[1], 1)}$, so cell 1 holds ${cellText[0]} and cell 2 holds ${cellText[1]}.`,
    `Bottom row: $${rows[1]} \\cdot ${columns[0]} = ${w.monomial(cells[2], 1)}$ and $${rows[1]} \\cdot ${columns[1]} = ${w.monomial(cells[3], 0)}$, so cell 3 holds ${cellText[2]} and cell 4 holds ${cellText[3]}.`,
    isZero(product[1])
      ? `Cells 2 and 3 are the like terms (both x-terms), and they cancel: $${middle} = 0$. The x coefficient is 0 — it still has to be entered to hold the x place.`
      : `Cells 2 and 3 are the like terms (both x-terms): $${middle} = ${w.monomial(product[1], 1)}$.`,
    `Add up the cells: $(${L})(${R}) = ${expanded}$. Written as coefficients from the highest degree down: ${w.list(product)}.`,
  ];
  const items = [
    ...cells.map((cell, index) => ({ label: CELL_LABELS[index], value: cellText[index] })),
    { label: 'Expanded coefficients', value: w.list(product) },
  ];

  const at = CHECK_POINTS.find((x) => !isZero(a * x + b) && !isZero(c * x + d)) ?? 2;
  const leftValue = a * at + b;
  const rightValue = c * at + d;
  const productTerms = w.termsOf(product).map(([coefficient, exponent]) => coefficient * at ** exponent);
  const productValue = evaluatePolynomial(product, at);
  if (!sameValue(leftValue * rightValue, productValue)) return null;
  const why = `Check with $x = ${w.num(at)}$: $(${L})(${R})$ is $${w.operand(leftValue)} \\cdot ${w.operand(rightValue)} = ${w.num(leftValue * rightValue)}$, and $${expanded}$ is $${w.sum(productTerms.filter((value, index) => !isZero(product[index])))} = ${w.num(productValue)}$. Equal polynomials give equal values, and these agree.`;
  if (!w.exact()) return null;

  const work = { cells: cellText, expanded: w.list(product) };
  return { title: 'Area-model solution', items, steps, why, note: null, work };
};

/* ------------------------------------------------------------------ */
/* factorQuadratic                                                     */
/* ------------------------------------------------------------------ */

// Every unordered integer pair with product c (c ≠ 0).
const integerPairsWithProduct = (c) => {
  const n = Math.abs(c);
  const pairs = [];
  const seen = new Set();
  for (let divisor = 1; divisor * divisor <= n; divisor += 1) {
    if (n % divisor) continue;
    [[divisor, c / divisor], [-divisor, -c / divisor]].forEach((pair) => {
      const key = [...pair].sort((x, y) => x - y).join(',');
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push(pair);
    });
  }
  return pairs;
};

const buildFactorQuadratic = (question) => {
  const coefficients = question.coefficients || DEFAULTS.factorQuadratic.coefficients;
  if (!numericList(coefficients)) return null;
  // The grader's key: null when x² + bx + c has no integer factor pair, and
  // then no answer is ever marked right — the review states nothing.
  const pair = integerFactorPairForMonicQuadratic(coefficients);
  if (!pair) return null;
  const values = trimLeadingZeros(coefficients.map(Number));
  if (values.length !== 3) return null;
  const [, b, c] = values;
  // Stated smaller size first, as the pair list below meets it (either order is right).
  const [p, q] = [...pair].sort((x, y) => Math.abs(x) - Math.abs(y) || x - y);
  if (p + q !== b || p * q !== c) return null;

  const w = makeWriter();
  const P = w.poly(values);
  // (x + p)(x + q): the factor that is zero at x = −p, the bare x first.
  const factoredForm = p === q
    ? w.factorPower(-p, 2)
    : w.product([{ root: -p, exponent: 1 }, { root: -q, exponent: 1 }]);
  const steps = [
    `Writing $${P} = (x + p)(x + q)$ and expanding the right side gives $x^{2} + (p + q)x + pq$, so p and q must multiply to the constant term $${w.num(c)}$ and add to the x-coefficient $${w.num(b)}$.`,
  ];
  if (c === 0) {
    steps.push(`The product must be 0, so one of the numbers is 0; the other must then add to $${w.num(b)}$ by itself, so it is $${w.num(b)}$.`);
  } else {
    const pairs = integerPairsWithProduct(c);
    if (pairs.length <= 8) {
      const listed = pairs.map(([x, y]) => `$${w.num(x)}$ and $${w.num(y)}$ (sum $${w.num(x + y)}$)`).join('; ');
      steps.push(`List the integer pairs with product $${w.num(c)}$ and add each pair: ${listed}. Only one pair adds to $${w.num(b)}$.`);
    } else {
      steps.push(`Go through the integer factor pairs of $${w.num(c)}$ and look for the one whose sum is $${w.num(b)}$.`);
    }
  }
  steps.push(`$${w.num(p)}$ and $${w.num(q)}$ work: $${w.num(p)} \\cdot ${w.operand(q)} = ${w.num(c)}$ and $${w.num(p)} + ${w.operand(q)} = ${w.num(b)}$. So $p = ${w.num(p)}$ and $q = ${w.num(q)}$ (in either order), and $${P} = ${factoredForm}$.`);
  const items = [
    { label: 'p', value: w.num(p) },
    { label: 'q', value: w.num(q) },
    { label: 'Factored form', value: `$${factoredForm}$` },
  ];
  const foil = w.terms([[1, 2], [q, 1], [p, 1], [p * q, 0]]);
  const why = foil === P
    ? `Multiply the factors back: $${factoredForm} = ${P}$, the original quadratic.`
    : `Multiply the factors back: $${factoredForm} = ${foil} = ${P}$, the original quadratic.`;
  const zeros = p === q ? `at $x = ${w.num(-p)}$` : `at $x = ${w.num(-p)}$ and $x = ${w.num(-q)}$`;
  const note = `p and q are the numbers added to x inside the factors, so they are the opposites of the zeros: $${P} = 0$ ${zeros}.`;
  if (!w.exact()) return null;

  const work = { p: w.num(p), q: w.num(q) };
  return { title: 'Factoring solution', items, steps, why, note, work };
};

/* ------------------------------------------------------------------ */
/* division                                                            */
/* ------------------------------------------------------------------ */

const shifted = (coefficients, zeros) => [...coefficients, ...Array(Math.max(0, zeros)).fill(0)];
const cleaned = (values) => values.map((value) => (Math.abs(value) < 1e-10 ? 0 : value));

const buildDivision = (question) => {
  const dividend = question.dividend || DEFAULTS.division.dividend;
  const divisor = question.divisor || DEFAULTS.division.divisor;
  if (!numericList(dividend) || !numericList(divisor)) return null;
  // The grader's key; it throws for a zero divisor.
  let result;
  try {
    result = polynomialLongDivide(dividend, divisor);
  } catch {
    return null;
  }
  const N = trimLeadingZeros(dividend.map(Number));
  const D = trimLeadingZeros(divisor.map(Number));
  if (N.length - 1 > MAX_DEGREE || isZero(D[0])) return null;
  const quotientLength = N.length - D.length + 1;
  if (quotientLength + 2 > MAX_STEPS) return null;

  const w = makeWriter();
  const dividendText = w.poly(N);
  const divisorText = w.poly(D);
  const divisorLead = w.monomial(D[0], D.length - 1);
  const steps = [];
  let quotient;
  let remainder;
  if (quotientLength < 1) {
    quotient = [0];
    remainder = N;
    steps.push(`The dividend $${dividendText}$ has a lower degree than the divisor $${divisorText}$, so the divisor does not go in at all: the quotient is 0 and the whole dividend is the remainder.`);
  } else {
    steps.push(`Divide $${dividendText}$ by $${divisorText}$, working from the highest power of x down: each round divides the leading terms, multiplies back and subtracts.`);
    const working = [...N];
    quotient = Array(quotientLength).fill(0);
    for (let index = 0; index < quotientLength; index += 1) {
      const degree = N.length - 1 - index;
      const quotientDegree = degree - (D.length - 1);
      const current = cleaned(working.slice(index));
      const factor = working[index] / D[0];
      quotient[index] = factor;
      for (let offset = 0; offset < D.length; offset += 1) working[index + offset] -= factor * D[offset];
      if (isZero(factor)) {
        steps.push(`What is left, $${w.poly(current)}$, has no ${degree === 1 ? 'x' : `$x^{${degree}}$`} term, so the next quotient term is 0 (it still holds its place in the quotient list).`);
        continue;
      }
      const term = w.monomial(factor, quotientDegree);
      const back = shifted(D.map((value) => value * factor), quotientDegree);
      const left = cleaned(working.slice(index + 1));
      steps.push(`Divide the leading terms: $${w.monomial(current[0], degree)} \\div ${divisorLead.startsWith('-') ? `(${divisorLead})` : divisorLead} = ${term}$. Multiply back: $${term === '1' ? '' : term === '-1' ? '-' : term}(${divisorText}) = ${w.poly(back)}$. Subtract: $(${w.poly(current)}) - (${w.poly(back)}) = ${w.poly(left.length ? left : [0])}$.`);
    }
    remainder = trimLeadingZeros(cleaned(working.slice(quotientLength)).length ? cleaned(working.slice(quotientLength)) : [0]);
  }
  // The steps must reach exactly the grader's quotient and remainder.
  if (!sameList(trimLeadingZeros(quotient), result.quotient) || !sameList(remainder, result.remainder)) return null;
  const Q = w.poly(result.quotient);
  const Rm = w.poly(result.remainder);
  const exact = result.remainder.every(isZero);
  steps.push(quotientLength < 1
    ? `As coefficient lists from the highest degree down: quotient ${w.list(result.quotient)}, remainder ${w.list(result.remainder)}.`
    : exact
      ? `Nothing is left over, so the remainder is 0: the quotient is $${Q}$. As coefficient lists from the highest degree down (a 0 for any missing power): quotient ${w.list(result.quotient)}, remainder ${w.list(result.remainder)}.`
      : `What is left, $${Rm}$, has a lower degree than the divisor, so it is the remainder: the quotient is $${Q}$. As coefficient lists from the highest degree down (a 0 for any missing power): quotient ${w.list(result.quotient)}, remainder ${w.list(result.remainder)}.`);
  const items = [
    { label: 'Quotient coefficients', value: w.list(result.quotient) },
    { label: 'Remainder coefficients', value: w.list(result.remainder) },
  ];

  // The check: divisor × quotient + remainder gives back the dividend.
  const back = polynomialMultiply(D, result.quotient);
  const length = Math.max(back.length, result.remainder.length);
  const rebuilt = Array.from({ length }, (_, index) => (back[index - (length - back.length)] ?? 0)
    + (result.remainder[index - (length - result.remainder.length)] ?? 0));
  const size = Math.max(1, ...N.map(Math.abs));
  if (!sameList(trimLeadingZeros(rebuilt).map((value) => value / size), N.map((value) => value / size))) return null;
  const backText = quotientLength < 1 ? '0' : w.poly(back);
  let why = exact
    ? `Check: divisor × quotient must give back the dividend: $(${divisorText})(${Q}) = ${backText}$, which is the dividend.`
    : `Check: divisor × quotient + remainder must give back the dividend: $(${divisorText})(${Q}) + ${Rm.startsWith('-') || Rm.includes(' ') ? `(${Rm})` : Rm} = ${backText} ${Rm.startsWith('-') ? `- ${Rm.slice(1)}` : `+ ${Rm}`} = ${dividendText}$.`;
  if (!w.exact()) return null;
  if (D.length === 2) {
    // A linear divisor is 0 at one x; the remainder is the dividend's value there.
    const theorem = makeWriter();
    const zero = -D[1] / D[0];
    const atZero = evaluatePolynomial(N, zero);
    if (result.remainder.length === 1 && sameValue(atZero, result.remainder[0], size)) {
      const sentence = ` The divisor is 0 at $x = ${theorem.num(zero)}$, and the dividend's value there is $${theorem.num(atZero)}$ — the remainder again (the Remainder Theorem).`;
      if (theorem.exact()) why += sentence;
    }
  }

  const work = { quotient: w.list(result.quotient), remainder: w.list(result.remainder) };
  return { title: 'Long-division solution', items, steps, why, note: null, work };
};

/* ------------------------------------------------------------------ */
/* graphConnection                                                     */
/* ------------------------------------------------------------------ */

const BEHAVIOR_TEXT = Object.freeze({ crosses: 'crosses the x-axis', touches: 'touches and turns' });

const endLabelFor = (degree, leading) => {
  const even = degree % 2 === 0;
  if (even) return leading > 0 ? 'both ends rise' : 'both ends fall';
  return leading > 0 ? 'left falls, right rises' : 'left rises, right falls';
};

const buildGraphConnection = (question) => {
  const roots = question.roots || DEFAULTS.graphConnection.roots;
  if (!Array.isArray(roots) || !roots.length) return null;
  const entries = roots.map((entry) => {
    if (!isPlainObject(entry)) return null;
    const root = numericValue(entry.root);
    const multiplicity = entry.multiplicity === undefined ? 1 : numericValue(entry.multiplicity);
    if (root === null || multiplicity === null || !Number.isInteger(multiplicity) || multiplicity < 1) return null;
    return { root, multiplicity };
  });
  if (entries.some((entry) => !entry)) return null;
  // A root listed twice has the multiplicity of both entries together; the
  // grader reads one of them, so its key is not the graph's behavior.
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) if (nearlyEqual(entries[i].root, entries[j].root)) return null;
  }
  const degree = entries.reduce((total, entry) => total + entry.multiplicity, 0);
  if (degree > MAX_DEGREE) return null;
  const leading = Number(question.leadingCoefficient ?? DEFAULTS.graphConnection.leadingCoefficient);
  if (!Number.isFinite(leading) || nearlyEqual(leading, 0)) return null;

  // The grader's key, from its own helpers.
  const coefficients = coefficientsFromRoots(roots, leading);
  const target = graphConnectionTargetEntry(roots, question.targetRoot);
  const behavior = factorBehaviorAtRoot(target.multiplicity);
  const end = endBehavior(coefficients).label;
  const targetIndex = roots.indexOf(target);
  if (targetIndex < 0) return null;
  const { root, multiplicity } = entries[targetIndex];
  if (behavior !== (multiplicity % 2 === 0 ? 'touches' : 'crosses') || end !== endLabelFor(degree, leading)) return null;

  const w = makeWriter();
  const t = w.num(root);
  const lead = sameValue(leading, 1) ? '' : sameValue(leading, -1) ? '-' : w.num(leading);
  // A lone factor is written bare ("x - 2"); after a leading coefficient it
  // needs its parentheses: 2(x + 1), not 2x + 1.
  const factors = w.product(entries.map((entry) => ({ root: entry.root, exponent: entry.multiplicity })));
  const P = `${lead}${lead && factors.includes(' ') && !factors.includes('(') ? `(${factors})` : factors}`;
  const targetFactor = w.factorPower(root, multiplicity);
  const even = multiplicity % 2 === 0;
  const degreeEven = degree % 2 === 0;
  const steps = [
    `From its zeros and leading coefficient, $P(x) = ${P}$.`,
    `The target zero is $x = ${t}$. Its factor $${w.factorPower(root, 1)}$ appears ${timesWord(multiplicity)}, so the zero has multiplicity ${multiplicity}, an ${even ? 'even' : 'odd'} number.`,
    even
      ? `Near $x = ${t}$ the factor $${targetFactor}$ is never negative, so $P(x)$ keeps the same sign on both sides: the graph touches the x-axis at $x = ${t}$ and turns back.`
      : `The factor $${targetFactor}$ changes sign as x passes ${t}, so $P(x)$ changes sign there: the graph crosses the x-axis at $x = ${t}$.`,
    entries.length > 1
      ? `The degree is the total of the multiplicities: $${entries.map((entry) => entry.multiplicity).join(' + ')} = ${degree}$, which is ${degreeEven ? 'even' : 'odd'}.`
      : `The degree is the multiplicity of the only zero, ${degree}, which is ${degreeEven ? 'even' : 'odd'}.`,
    `The leading coefficient is $${w.num(leading)}$, which is ${leading > 0 ? 'positive' : 'negative'}. ${degreeEven ? 'Even' : 'Odd'} degree with a ${leading > 0 ? 'positive' : 'negative'} leading coefficient: ${end}.`,
  ];
  const items = [
    { label: `At the target zero x = ${w.plain(root)}`, value: BEHAVIOR_TEXT[behavior] },
    { label: 'End behavior', value: end },
  ];
  if (!w.exact()) return null;

  // The check: the sign of P just either side of the target zero, and the
  // leading term far from every zero.
  const leadingTerm = w.monomial(leading, degree);
  const farLeft = leading * (degreeEven ? 1 : -1) > 0 ? 'positive' : 'negative';
  const farRight = leading > 0 ? 'positive' : 'negative';
  let why = `Far from the zeros the leading term $${leadingTerm}$ takes over: it is ${farLeft} when x is large and negative, and ${farRight} when x is large and positive.`;
  const others = entries.filter((entry, index) => index !== targetIndex).map((entry) => Math.abs(entry.root - root));
  const step = Math.min(0.5, ...others.map((gap) => gap / 2));
  const check = makeWriter();
  const before = evaluatePolynomial(coefficients, root - step);
  const after = evaluatePolynomial(coefficients, root + step);
  if (Math.abs(before) > EPSILON && Math.abs(after) > EPSILON) {
    const sameSign = (before > 0) === (after > 0);
    if (sameSign !== even) return null;
    const sign = (value) => (value > 0 ? 'positive' : 'negative');
    const sentence = sameSign
      ? `Test either side of $x = ${check.num(root)}$: $P(${check.num(root - step)})$ and $P(${check.num(root + step)})$ are both ${sign(before)}, so the graph meets the axis there without crossing it. `
      : `Test either side of $x = ${check.num(root)}$: $P(${check.num(root - step)})$ is ${sign(before)} and $P(${check.num(root + step)})$ is ${sign(after)}, so the graph passes through the axis there. `;
    if (check.exact()) why = `${sentence}${why}`;
  }

  const work = { behavior, end, ...OWN_CHOICES };
  return { title: 'Zeros and end-behavior solution', items, steps, why, note: null, work };
};

/* ------------------------------------------------------------------ */
/* rationalFeatures                                                    */
/* ------------------------------------------------------------------ */

const FEATURE_TEXT = Object.freeze({
  hole: 'Hole',
  verticalAsymptote: 'Vertical asymptote',
  zero: 'Zero / x-intercept',
  none: 'None of these',
});

// Distinct roots with how often each is listed, in the order first listed.
const groupRoots = (roots) => {
  const groups = [];
  roots.map(Number).forEach((root) => {
    const found = groups.find((group) => group.root === root);
    if (found) found.exponent += 1;
    else groups.push({ root, exponent: 1 });
  });
  return groups;
};
const valueAt = (groups, x) => groups.reduce((total, { root, exponent }) => total * (x - root) ** exponent, 1);
const wholeGcd = (a, b) => (b ? wholeGcd(b, a % b) : Math.abs(a));
const fractionText = (numerator, denominator) => (denominator === '1' ? numerator : `\\frac{${numerator}}{${denominator}}`);

const buildRationalFeatures = (question) => {
  const numeratorRoots = question.numeratorRoots || DEFAULTS.rationalFeatures.numeratorRoots;
  const denominatorRoots = question.denominatorRoots || DEFAULTS.rationalFeatures.denominatorRoots;
  if (!Array.isArray(numeratorRoots) || !numericList(denominatorRoots)) return null;
  if (!numeratorRoots.every((value) => numericValue(value) !== null)) return null;
  if (numeratorRoots.length + denominatorRoots.length > MAX_DEGREE * 2) return null;

  // The grader's key, from its own helpers.
  const features = rationalFeatureMap({ numeratorRoots, denominatorRoots });
  const target = rationalFeatureTargetValue(features, question.targetValue);
  if (!Number.isFinite(target)) return null;
  const expected = rationalFeatureTypeAt(features, target);
  // Two listed roots a hair apart are one factor to the eye and two to the
  // grader's cancellation; the review does not pick between them.
  for (let i = 0; i < features.length; i += 1) {
    for (let j = i + 1; j < features.length; j += 1) if (nearlyEqual(features[i].root, features[j].root)) return null;
  }
  const at = features.find((feature) => nearlyEqual(feature.root, target)) || null;
  if ((at?.type ?? 'none') !== expected) return null;

  const w = makeWriter();
  const t = w.num(target);
  const numeratorGroups = groupRoots(numeratorRoots);
  const denominatorGroups = groupRoots(denominatorRoots);
  const original = fractionText(w.product(numeratorGroups), w.product(denominatorGroups));
  const simplifiedNumerator = features.filter((f) => f.remainingNumeratorMultiplicity > 0).map((f) => ({ root: f.root, exponent: f.remainingNumeratorMultiplicity }));
  const simplifiedDenominator = features.filter((f) => f.remainingDenominatorMultiplicity > 0).map((f) => ({ root: f.root, exponent: f.remainingDenominatorMultiplicity }));
  const simplified = fractionText(w.product(simplifiedNumerator), w.product(simplifiedDenominator));
  const cancelled = at?.cancelledMultiplicity ?? 0;
  const inNumerator = cancelled + (at?.remainingNumeratorMultiplicity ?? 0);
  const inDenominator = cancelled + (at?.remainingDenominatorMultiplicity ?? 0);
  const factor = `$${w.factor(target).includes(' ') ? `(${w.factor(target)})` : w.factor(target)}$`;

  const steps = [`Write each root as a factor: $f(x) = ${original}$.`];
  if (inNumerator && inDenominator) {
    steps.push(`At $x = ${t}$ the factor ${factor} is in both the numerator (${timesWord(inNumerator)}) and the denominator (${timesWord(inDenominator)}), so ${cancelled === 1 ? '1 copy cancels' : `${cancelled} copies cancel`}: $f(x) = ${simplified}$ for every $x \\neq ${t}$.`);
  } else if (inNumerator) {
    steps.push(`At $x = ${t}$ the factor ${factor} is in the numerator (${timesWord(inNumerator)}) but not in the denominator, so nothing cancels there.`);
  } else if (inDenominator) {
    steps.push(`At $x = ${t}$ the factor ${factor} is in the denominator (${timesWord(inDenominator)}) but not in the numerator, so nothing cancels there.`);
  } else {
    steps.push(`At $x = ${t}$ neither the numerator nor the denominator has the factor ${factor}: no listed root is ${t}.`);
  }
  if (expected === 'hole') {
    steps.push(`After cancelling, no factor ${factor} is left in the denominator, so the graph does not blow up near $x = ${t}$. But $x = ${t}$ makes the original denominator 0, so it is still excluded from the domain: a hole.${at.remainingNumeratorMultiplicity > 0 ? ` The factor left in the numerator would make the simplified function 0 there, but a point outside the domain cannot be an x-intercept — it is still a hole.` : ''}`);
  } else if (expected === 'verticalAsymptote') {
    steps.push(cancelled
      ? `After cancelling, ${factor} is still in the denominator (${timesWord(at.remainingDenominatorMultiplicity)}) and no longer in the numerator, so near $x = ${t}$ the denominator approaches 0 while the numerator does not: a vertical asymptote.`
      : `The denominator is 0 at $x = ${t}$ and the numerator is not, so the values of $f(x)$ grow without bound near $x = ${t}$: a vertical asymptote.`);
  } else if (expected === 'zero') {
    steps.push(`The numerator is 0 at $x = ${t}$ and the denominator is not, so $f(${t}) = 0$: the graph meets the x-axis there — a zero (x-intercept).`);
  } else {
    steps.push(`So $f(${t})$ is defined and not 0: none of these features happens at $x = ${t}$.`);
  }
  const items = [{ label: `Feature at x = ${w.plain(target)}`, value: FEATURE_TEXT[expected] }];
  if (!w.exact()) return null;

  // The check: substitute the target value.
  const check = makeWriter();
  let why = null;
  if (expected === 'hole') {
    const top = valueAt(simplifiedNumerator, target);
    const bottom = valueAt(simplifiedDenominator, target);
    if (isZero(bottom)) return null;
    const height = top / bottom;
    const tail = simplifiedDenominator.length
      ? `$${simplified}$ gives $\\frac{${check.num(top)}}{${check.num(bottom)}} = ${check.num(height)}$`
      : `$${simplified}$ gives $${check.num(height)}$`;
    const sentence = `Substituting $x = ${check.num(target)}$ into the original gives $\\frac{0}{0}$, which is undefined, while the cancelled form ${tail}: the graph follows that curve but skips the single point $(${check.num(target)}, ${check.num(height)})$.`;
    why = check.exact() ? sentence : `Substituting $x = ${t}$ into the original gives $\\frac{0}{0}$, which is undefined, while the cancelled form has a finite value there: exactly one point of the graph is missing.`;
  } else if (expected === 'verticalAsymptote') {
    // Nothing cancelled at the target: the original numerator is not 0 there.
    // Something did: after cancelling, the simplified one is not.
    const top = valueAt(cancelled ? simplifiedNumerator : numeratorGroups, target);
    if (isZero(top)) return null;
    const which = cancelled ? 'after cancelling, the denominator is still 0 but the numerator' : 'the denominator is 0 but the numerator';
    const sentence = `Substituting $x = ${check.num(target)}$: ${which} is $${check.num(top)}$, not 0. A nonzero number divided by numbers closer and closer to 0 grows without bound.`;
    why = check.exact() ? sentence : `Substituting $x = ${t}$: ${which} is not 0, and a nonzero number divided by numbers closer and closer to 0 grows without bound.`;
  } else if (expected === 'zero') {
    const bottom = valueAt(denominatorGroups, target);
    if (isZero(bottom)) return null;
    const sentence = `Substituting $x = ${check.num(target)}$: the numerator is 0 and the denominator is $${check.num(bottom)}$, not 0, so $f(${check.num(target)}) = \\frac{0}{${check.num(bottom)}} = 0$.`;
    why = check.exact() ? sentence : `Substituting $x = ${t}$: the numerator is 0 and the denominator is not, so $f(${t}) = 0$.`;
  } else {
    const top = valueAt(numeratorGroups, target);
    const bottom = valueAt(denominatorGroups, target);
    if (isZero(top) || isZero(bottom)) return null;
    // The quotient too, when it terminates: f(5) = 20/4 = 5, not 20/4 left as is.
    // Else, between whole numbers, in lowest terms: 18/27 = 2/3.
    const quotient = makeWriter();
    const quotientText = quotient.num(top / bottom);
    let value = quotient.exact() && !sameValue(bottom, 1) ? ` = ${quotientText}` : '';
    if (!value && Number.isInteger(top) && Number.isInteger(bottom)) {
      const divisor = wholeGcd(top, bottom);
      const [n, d] = [Math.abs(top) / divisor, Math.abs(bottom) / divisor];
      if (divisor !== 1 || bottom < 0) value = ` = ${top * bottom < 0 ? '-' : ''}\\frac{${n}}{${d}}`;
    }
    const sentence = `Substituting $x = ${check.num(target)}$: $f(${check.num(target)}) = \\frac{${check.num(top)}}{${check.num(bottom)}}${value}$, a defined number that is not 0.`;
    why = check.exact() ? sentence : `Substituting $x = ${t}$: neither the numerator nor the denominator is 0, so $f(${t})$ is a defined number that is not 0.`;
  }

  const work = { choice: expected, ...OWN_CHOICES };
  return { title: 'Rational-function feature solution', items, steps, why, note: null, work };
};

/* ------------------------------------------------------------------ */

const BUILDERS = Object.freeze({
  factorZero: buildFactorZero,
  multiplyArea: buildMultiplyArea,
  factorQuadratic: buildFactorQuadratic,
  division: buildDivision,
  graphConnection: buildGraphConnection,
  rationalFeatures: buildRationalFeatures,
});

// The fields the workshop reads. A question that names neither the tool nor
// any of them ({}) is not a workshop question, even though the screen would
// fall back to its demonstration problem.
const WORKSHOP_FIELDS = Object.freeze([
  'mode', 'coefficients', 'candidateRoot', 'leftBinomial', 'rightBinomial', 'dividend', 'divisor',
  'roots', 'leadingCoefficient', 'targetRoot', 'numeratorRoots', 'denominatorRoots', 'targetValue',
]);
const namesTheWorkshop = (question) => question.toolId === 'polynomialWorkshop'
  || question.type === 'polynomialWorkshop'
  || WORKSHOP_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(question, field));

export const buildPolynomialWorkshopReview = (question) => {
  try {
    if (!isPlainObject(question) || !namesTheWorkshop(question)) return null;
    const mode = resolveToolMode(declaration, question);
    const build = Object.prototype.hasOwnProperty.call(BUILDERS, mode) ? BUILDERS[mode] : null;
    const review = build ? build(question) : null;
    if (!review || review.steps.length > MAX_STEPS) return null;
    const { work, ...model } = review;
    return acceptedByGrader(question, work) ? model : null;
  } catch {
    return null;
  }
};

export default buildPolynomialWorkshopReview;
