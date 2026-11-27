/*
 * FACTORING POLYNOMIALS AND THE REMAINDER, FACTOR AND RATIONAL ZERO THEOREMS
 * (WE-I): the Algebra II answer-box generators for A2.7D and A2.7E, and the
 * polynomial-over-monomial quotients of A2.7C. Each is a generator as
 * exponents.js describes one.
 *
 *   rationalZeroChain  a cubic factored by the Rational Zero Theorem: the
 *                      possible rational zeros (or the factors p and q apart),
 *                      a zero tested (the Factor Theorem), the division by
 *                      x − r, the quotient factored, the complete
 *                      factorization and the zeros. The item's own parts only,
 *                      in its order. Its numbers are a cubic built from its
 *                      zeros, so every line checks.
 *   quadraticForm      x⁴ − bx² + c factored with u = x²: the quadratic in u,
 *                      substituted back, each difference of squares, the zeros.
 *   groupFourTerms     four terms in two letters' worth of products, grouped
 *                      in pairs, each pair's common factor, the common
 *                      binomial, and the other grouping that also works.
 *   polynomialOverMonomial  a polynomial divided by a monomial, one term at a
 *                      time, and the quotient.
 *
 * Zero is written as a word in a step ("P(2) is zero"): a lesson's own
 * answer is often 0 (f(1) = 0), and the guard reads a 0 in a sibling's step as
 * that answer.
 */
import {
  MINUS,
  divisorsOf,
  evaluate,
  firstFitting,
  linearFactorText,
  linearText,
  multiply,
  polynomialText,
  qText,
  Q,
  setText,
  signed,
  superscript,
  text,
} from './shared.js';
import { evaluateMonomial, monomialSteps, parseMonomialExpression, positiveForm } from './monomials.js';

const plain = (value) => text(value).replace(/\$/g, '').replace(/\s+/g, ' ').trim();
const stripStep = (label) => plain(label).replace(/^Step \d+ — /, '');
const joinParts = (parts) => parts.join('; ');

/* ------------------------------------------------- reading a polynomial */

/** "x^3 - 2x^2 - 5x + 6" (LaTeX) or "x³ − 2x² − 5x + 6" (text) in one letter: coefficients, highest first; or null. */
export const readPolynomial = (source, letter = 'x') => {
  const sup = { '⁰': 0, '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9 };
  let value = text(source).replace(/\s+/g, '').replace(/−/g, '-').replace(/\^\{(\d+)\}/g, '^$1')
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (run) => `^${run.split('').map((c) => sup[c]).join('')}`);
  if (!value || !/^[-+]?[\dx^+-]+$/.test(value.replaceAll(letter, 'x'))) return null;
  value = value.replaceAll(letter, 'x');
  const terms = value.match(/[+-]?[^+-]+/g);
  if (!terms) return null;
  const byPower = new Map();
  for (const term of terms) {
    const match = /^([+-]?)(\d*)(x(?:\^(\d+))?)?$/.exec(term);
    if (!match || (!match[2] && !match[3])) return null;
    const coefficient = (match[1] === '-' ? -1 : 1) * (match[2] ? Number(match[2]) : 1);
    const power = match[3] ? (match[4] ? Number(match[4]) : 1) : 0;
    if (byPower.has(power)) return null;
    byPower.set(power, coefficient);
  }
  const degree = Math.max(...byPower.keys());
  if (degree > 8) return null;
  return Array.from({ length: degree + 1 }, (_, index) => byPower.get(degree - index) || 0);
};

// The polynomials written in the prompt, in its $…$ pieces and around an "=".
const promptPolynomials = (prompt) => {
  const found = [];
  const pieces = text(prompt).match(/\$([^$]+)\$/g) || [];
  pieces.forEach((piece) => {
    piece.slice(1, -1).split(/=|\\quad|,/).forEach((side) => {
      const cleaned = side.replace(/^[A-Za-z]\(x\)$/, '').replace(/^\s*[A-Za-z]\(x\)\s*$/, '');
      const coefficients = readPolynomial(cleaned);
      if (coefficients && coefficients.length >= 3) found.push(coefficients);
    });
  });
  return found;
};

/* ====================================================== rationalZeroChain */

export const ZERO_WHY = Object.freeze({
  candidates: 'The Rational Zero Theorem: a rational zero p/q of a polynomial with whole-number coefficients has p a factor of the constant term and q a factor of the leading coefficient.',
  pList: 'Every possible numerator p is a factor of the constant term, positive or negative.',
  qList: 'Every possible denominator q is a factor of the leading coefficient, positive or negative.',
  test: 'The Factor Theorem: x − r is a factor exactly when P(r) is zero. So a candidate is tested by putting it in.',
  divide: 'Dividing by the factor x − r leaves a polynomial one degree lower; synthetic division does it with the coefficients.',
  factorQuadratic: 'The quotient is a quadratic, which factors the usual way. Multiplying the factors back checks them.',
  factored: 'The polynomial is the factor found times the quotient, and the quotient is now factored too.',
  zeros: 'The zero product property: the product is zero exactly when one factor is, so each factor gives one zero.',
});

const chainPartOf = (field, polynomial) => {
  const label = stripStep(field.label);
  if (field.choice) return null;
  if (/^Factors p of the constant term (−?\d+)$/.test(label)) return { kind: 'pList' };
  if (/^Factors q of the leading coefficient (\d+)$/.test(label)) return { kind: 'qList' };
  if (/^All possible rational zeros p\/q$/i.test(label) || /^Possible rational zeros(?: p\/q)?(?:, as a set)?$/i.test(label) || /^possible rational zeros$/i.test(label)) return { kind: 'candidates' };
  let match = /^[fP]\((−?\d+)\) =$/.exec(label);
  if (match) return { kind: 'test', root: Number(match[1].replace('−', '-')) };
  match = /^\((.+)\) ÷ \(x ([−+]) (\d+)\) =$/.exec(label);
  if (match) return { kind: 'quotient', root: (match[2] === '−' ? 1 : -1) * Number(match[3]) };
  if (/^(?:Completely factored form|.*completely factored)$/i.test(label)) return { kind: 'factored' };
  if (/^Zeros(?: of .+)?, as a set$/.test(label)) return { kind: 'zeros' };
  match = /^(.+) =$/.exec(label);
  if (match) {
    const written = readPolynomial(match[1]);
    if (written && written.length === 3) return { kind: 'depressed' };
    if (written && polynomial && written.length === polynomial.length && written.every((value, index) => value === polynomial[index])) return { kind: 'factored' };
  }
  return null;
};

const chainClaim = (question, fields) => {
  const polynomials = promptPolynomials(question?.prompt);
  const polynomial = polynomials.find((coefficients) => coefficients.length >= 4) || null;
  if (!polynomial) return null;
  const parts = fields.map((field) => chainPartOf(field, polynomial));
  if (parts.some((part) => !part)) return null;
  const kinds = parts.map((part) => part.kind);
  const listsOnly = kinds.every((kind) => ['pList', 'qList', 'candidates'].includes(kind));
  // A chain that factors needs a cubic; a list of candidates reads any degree.
  if (!listsOnly && polynomial.length !== 4) return null;
  if (polynomial[polynomial.length - 1] === 0 || polynomial[0] <= 0) return null;
  return { parts, kinds, degree: polynomial.length - 1, leading: polynomial[0], listsOnly, polynomial };
};

const candidateList = (constant, leading) => {
  const values = [];
  divisorsOf(leading).forEach((q) => divisorsOf(constant).forEach((p) => {
    const value = Q(p, q);
    if (!values.some((other) => other.n === value.n && other.d === value.d)) values.push(value);
  }));
  // Whole numbers first, then fractions, as the lessons list them.
  return values.sort((a, b) => (a.d - b.d) || (a.n / a.d - b.n / b.d));
};
const plusMinusSet = (values) => `{${values.map((value) => `±${typeof value === 'object' ? qText(value) : value}`).join(', ')}}`;

// A cubic from its zeros: (x − r)(x − s)(x − t), or (x − r)(ax − b)(x − t).
const CUBIC_ROOTS = Object.freeze([[1, -2, 3], [2, -1, -3], [-1, 3, 4], [1, 2, -4], [3, -2, -4], [2, -3, 5], [1, -4, 5], [-2, 3, 1], [4, -1, 2], [-3, 1, 2], [5, -1, -2], [3, 1, -5]]);
const SLOPED = Object.freeze([[2, 1], [2, -1], [2, 3], [3, 1], [3, -2], [2, -3], [3, 2]]);

const chainOptions = (plan) => {
  const options = [];
  CUBIC_ROOTS.forEach(([r, s, t]) => {
    if (plan.leading === 1) options.push({ r, factors: [[1, -s], [1, -t]], zeros: [Q(r), Q(s), Q(t)] });
    else SLOPED.filter(([a]) => a === plan.leading || plan.leading % a === 0).forEach(([a, b]) => {
      if (a !== plan.leading) return;
      options.push({ r, factors: [[a, -b], [1, -t]], zeros: [Q(r), Q(b, a), Q(t)] });
    });
  });
  return options;
};

const factorText = ([a, c]) => `(${linearText(a, c)})`;

const chainPart = (plan, option) => {
  const { r, factors } = option;
  const quadratic = multiply(factors[0], factors[1]);
  const cubic = multiply([1, -r], quadratic);
  if (cubic[3] === 0 || cubic.some((value) => Math.abs(value) > 60) || quadratic.some((value) => value === 0)) return null;
  if (cubic.length === plan.polynomial.length && cubic.every((value, index) => value === plan.polynomial[index])) return null;
  const pText = polynomialText(cubic);
  const steps = [];
  const answers = [];
  const has = (kind) => plan.kinds.includes(kind);
  const leading = cubic[0];
  const constant = cubic[3];
  if (has('pList')) {
    steps.push({ show: `The constant term is ${signed(constant)}. Its factors p are ${plusMinusSet(divisorsOf(constant))}.`, why: ZERO_WHY.pList });
    answers.push(`factors p = ${plusMinusSet(divisorsOf(constant))}`);
  }
  if (has('qList')) {
    steps.push({ show: `The leading coefficient is ${leading}. Its factors q are ${plusMinusSet(divisorsOf(leading))}.`, why: ZERO_WHY.qList });
    answers.push(`factors q = ${plusMinusSet(divisorsOf(leading))}`);
  }
  if (has('candidates')) {
    const list = plusMinusSet(candidateList(constant, leading));
    steps.push({ show: `Each p/q, with p a factor of ${signed(constant)} and q a factor of ${leading}: the possible rational zeros are ${list}.`, why: ZERO_WHY.candidates });
    answers.push(`possible rational zeros = ${list}`);
  }
  const value = evaluate(cubic, r);
  if (value !== 0) return null;
  if (has('test')) {
    const terms = cubic.map((coefficient, index) => coefficient * r ** (3 - index));
    steps.push({ show: `Test x = ${signed(r)}: P(${signed(r)}) = ${terms.map((term, index) => (index === 0 ? signed(term) : term < 0 ? `${MINUS} ${Math.abs(term)}` : `+ ${term}`)).join(' ')}, which is zero. So ${linearFactorText(r)} is a factor.`, why: ZERO_WHY.test });
    answers.push(`P(${signed(r)}) is zero`);
  }
  if (has('quotient') || has('depressed') || has('factored') || has('zeros')) {
    if (has('quotient')) {
      steps.push({ show: `Divide ${pText} by ${linearFactorText(r)} with synthetic division by ${signed(r)}: the bottom row is ${quadratic.map(signed).join(', ')} with remainder zero, so the quotient is ${polynomialText(quadratic)}.`, why: ZERO_WHY.divide });
      answers.push(`quotient = ${polynomialText(quadratic)}`);
    }
    if (has('depressed') || has('factored') || has('zeros')) {
      steps.push({ show: `Factor the quotient: ${polynomialText(quadratic)} = ${factors.map(factorText).join('')}. Multiplying back gives ${polynomialText(quadratic)}.`, why: ZERO_WHY.factorQuadratic });
      if (has('depressed')) answers.push(`${polynomialText(quadratic)} = ${factors.map(factorText).join('')}`);
    }
    if (has('factored') || has('zeros')) {
      const product = `(${linearFactorText(r)})${factors.map(factorText).join('')}`;
      steps.push({ show: `So ${pText} = ${product}.`, why: ZERO_WHY.factored });
      if (has('factored')) answers.push(`${pText} = ${product}`);
    }
    if (has('zeros')) {
      const zeros = setText(option.zeros);
      steps.push({ show: `Set each factor equal to zero: the zeros are ${zeros}.`, why: ZERO_WHY.zeros });
      answers.push(`zeros = ${zeros}`);
    }
  }
  const asks = [];
  if (has('pList') || has('qList') || has('candidates')) asks.push('list the possible rational zeros');
  if (has('test')) asks.push(`test x = ${signed(r)}`);
  if (has('quotient')) asks.push(`divide by ${linearFactorText(r)}`);
  if (has('depressed') && !has('quotient')) asks.push(`factor the quotient ${polynomialText(quadratic)}`);
  if (has('factored')) asks.push('factor it completely');
  if (has('zeros')) asks.push('list its zeros');
  const intro = has('depressed') && !has('quotient') ? `${pText} = (${linearFactorText(r)})(${polynomialText(quadratic)}).` : `P(x) = ${pText}.`;
  return {
    prompt: `${intro} ${asks.map((ask, index) => (index === 0 ? ask.charAt(0).toUpperCase() + ask.slice(1) : ask)).join(', ')}.`,
    steps,
    answer: joinParts(answers),
    problems: [pText],
  };
};

const listOnlyPart = (plan, [leading, constant, middle]) => {
  const coefficients = [leading, ...Array(Math.max(0, plan.degree - 2)).fill(0), middle, constant].slice(0, plan.degree + 1);
  const steps = [];
  const answers = [];
  if (plan.kinds.includes('pList')) {
    steps.push({ show: `The constant term is ${signed(constant)}. Its factors p are ${plusMinusSet(divisorsOf(constant))}.`, why: ZERO_WHY.pList });
    answers.push(`factors p = ${plusMinusSet(divisorsOf(constant))}`);
  }
  if (plan.kinds.includes('qList')) {
    steps.push({ show: `The leading coefficient is ${leading}. Its factors q are ${plusMinusSet(divisorsOf(leading))}.`, why: ZERO_WHY.qList });
    answers.push(`factors q = ${plusMinusSet(divisorsOf(leading))}`);
  }
  if (plan.kinds.includes('candidates')) {
    const list = plusMinusSet(candidateList(constant, leading));
    steps.push({ show: `Each p/q: the possible rational zeros are ${list}.`, why: ZERO_WHY.candidates });
    answers.push(`possible rational zeros = ${list}`);
  }
  return { prompt: `List all of the possible rational zeros of f(x) = ${polynomialText(coefficients)}.`, steps, answer: joinParts(answers), problems: [polynomialText(coefficients)] };
};

const chainDraw = (plan, seed, ok = null) => {
  if (plan.listsOnly) {
    const options = [];
    const leadings = plan.leading === 1 ? [1] : [2, 3, 4, 5].filter((value) => value !== plan.leading).concat([plan.leading]);
    leadings.forEach((leading) => [6, 9, 10, 8, 12, 15, 14].forEach((constant) => [1, -2, 3].forEach((middle) => options.push([leading, constant * (middle < 0 ? -1 : 1), middle]))));
    return firstFitting(options, seed, (option) => listOnlyPart(plan, option), ok);
  }
  return firstFitting(chainOptions(plan), seed, (option) => chainPart(plan, option), ok);
};

export const rationalZeroChain = Object.freeze({ id: 'rationalZeroChain', standards: ['A2.7D'], claim: chainClaim, draw: chainDraw });

/* ========================================================= quadraticForm */

export const QUADRATIC_FORM_WHY = Object.freeze({
  substitute: 'x⁴ is (x²)², so with u = x² the polynomial is a quadratic in u, which factors the usual way.',
  back: 'Put x² back in place of u in each factor.',
  squares: 'Each factor x² − k² is a difference of squares: x² − k² = (x − k)(x + k).',
  zeros: 'The zero product property: each linear factor gives one zero.',
});

const quadraticFormPartOf = (field) => {
  if (field.choice) return null;
  const label = plain(field.label);
  if (/^With u = x²: u² [−+] \d+u [−+] \d+ =$/.test(label)) return { kind: 'inU' };
  if (/^Substitute back: x⁴ [−+] \d+x² [−+] \d+ =$/.test(label)) return { kind: 'back' };
  if (/^Completely factored form$/.test(label)) return { kind: 'factored' };
  if (/^Zeros(?: of f)?, as a set$/.test(label)) return { kind: 'zeros' };
  return null;
};

const quadraticFormClaim = (question, fields) => {
  const parts = fields.map(quadraticFormPartOf);
  if (!parts.length || parts.some((part) => !part) || !parts.some((part) => part.kind === 'inU')) return null;
  const polynomial = promptPolynomials(question?.prompt).find((coefficients) => coefficients.length === 5);
  // x⁴ − bx² + c with c > 0: two differences of squares.
  if (!polynomial || polynomial[0] !== 1 || polynomial[1] !== 0 || polynomial[3] !== 0 || !(polynomial[2] < 0) || !(polynomial[4] > 0)) return null;
  return { kinds: parts.map((part) => part.kind) };
};

const PAIRS = Object.freeze([[1, 3], [1, 4], [2, 5], [1, 5], [3, 4], [2, 3], [1, 2], [3, 5], [2, 4]]);
const quadraticFormPart = (plan, [a, b]) => {
  const A = a * a;
  const B = b * b;
  const middle = A + B;
  const product = A * B;
  const poly = `x⁴ ${MINUS} ${middle}x² + ${product}`;
  const steps = [
    { show: `Let u = x². Then ${poly} is u² ${MINUS} ${middle}u + ${product} = (u ${MINUS} ${A})(u ${MINUS} ${B}): ${A} and ${B} multiply to ${product} and add to ${middle}.`, why: QUADRATIC_FORM_WHY.substitute },
    { show: `Substitute back: ${poly} = (x² ${MINUS} ${A})(x² ${MINUS} ${B}).`, why: QUADRATIC_FORM_WHY.back },
  ];
  const linear = [`(x ${MINUS} ${a})`, `(x + ${a})`, `(x ${MINUS} ${b})`, `(x + ${b})`].join('').replace('(x − 1)', '(x − 1)');
  if (plan.kinds.includes('factored') || plan.kinds.includes('zeros')) steps.push({ show: `Each factor is a difference of squares: x² ${MINUS} ${A} = (x ${MINUS} ${a})(x + ${a}) and x² ${MINUS} ${B} = (x ${MINUS} ${b})(x + ${b}). So ${poly} = ${linear}.`, why: QUADRATIC_FORM_WHY.squares });
  const zeros = setText([-b, -a, a, b]);
  if (plan.kinds.includes('zeros')) steps.push({ show: `Set each factor equal to zero: the zeros are ${zeros}.`, why: QUADRATIC_FORM_WHY.zeros });
  const answers = [`u² ${MINUS} ${middle}u + ${product} = (u ${MINUS} ${A})(u ${MINUS} ${B})`];
  if (plan.kinds.includes('back')) answers.push(`(x² ${MINUS} ${A})(x² ${MINUS} ${B})`);
  if (plan.kinds.includes('factored')) answers.push(linear);
  if (plan.kinds.includes('zeros')) answers.push(`zeros = ${zeros}`);
  return { prompt: `Factor f(x) = ${poly} completely with u = x², then list its zeros.`, steps, answer: joinParts(answers), problems: [poly] };
};

export const quadraticForm = Object.freeze({
  id: 'quadraticForm',
  standards: ['A2.7D', 'A2.7E'],
  claim: quadraticFormClaim,
  draw: (plan, seed, ok = null) => firstFitting(PAIRS, seed, (pair) => quadraticFormPart(plan, pair), ok),
});

/* ======================================================== groupFourTerms */

export const GROUPING_WHY = Object.freeze({
  rearrange: 'Factoring by grouping needs each pair of terms to share a factor. Terms can be added in any order, so they are moved next to a partner first.',
  pair: 'Take out the factor the two terms share; what is left in brackets is the same for both pairs.',
  binomial: 'Both groups now hold the same binomial, so it is a common factor of the whole expression.',
  other: 'Any pairing in which each pair shares a factor works, and gives the same factors.',
});

// The item: (x + m)(ky + z) multiplied out, its four terms out of order.
const groupingClaim = (question, fields) => {
  if (fields.length < 3) return null;
  const labels = fields.map((field) => plain(field.label));
  const choice = fields.findIndex((field) => field.choice);
  if (choice >= 0 && !/different grouping also works/i.test(labels[choice])) return null;
  if (fields.filter((field) => field.choice).length > 1) return null;
  const sums = labels.filter((label, index) => index !== choice);
  if (!sums.every((label) => /^[\dxyz +−-]+ =$/.test(label))) return null;
  const prompt = text(question?.prompt);
  if (!/by grouping/i.test(prompt)) return null;
  const match = /\$(\d*)xy \+ (\d+)z \+ (\d+)y \+ xz\$/.exec(prompt);
  if (!match) return null;
  return { k: Number(match[1] || 1), m: Number(match[2]), withChoice: choice >= 0 };
};

const groupingPart = (plan, [k, m]) => {
  const km = k * m;
  const kText = k === 1 ? '' : String(k);
  const expression = `${kText}xy + ${m}z + ${km}y + xz`;
  const steps = [
    { show: `${kText}xy and ${m}z share no factor, so put the terms in the order ${kText}xy + ${km}y + xz + ${m}z and group them in pairs: (${kText}xy + ${km}y) + (xz + ${m}z).`, why: GROUPING_WHY.rearrange },
    { show: `${kText}xy + ${km}y = ${kText}y(x + ${m}), and xz + ${m}z = z(x + ${m}).`, why: GROUPING_WHY.pair },
    { show: `So ${expression} = ${kText}y(x + ${m}) + z(x + ${m}) = (x + ${m})(${kText}y + z).`, why: GROUPING_WHY.binomial },
  ];
  const answers = [`${kText}xy + ${km}y = ${kText}y(x + ${m})`, `xz + ${m}z = z(x + ${m})`, `(x + ${m})(${kText}y + z)`];
  if (plan.withChoice) {
    steps.push({ show: `Pairing (${kText}xy + xz) + (${km}y + ${m}z) works too: x(${kText}y + z) + ${m}(${kText}y + z) = (x + ${m})(${kText}y + z).`, why: GROUPING_WHY.other });
    answers.push(`also (${kText}xy + xz) + (${km}y + ${m}z)`);
  }
  return { prompt: `Factor ${expression} by grouping. Rearrange the terms first if a pair shares no factor.`, steps, answer: joinParts(answers), problems: [expression] };
};

export const groupFourTerms = Object.freeze({
  id: 'groupFourTerms',
  standards: ['A2.7E'],
  claim: groupingClaim,
  draw: (plan, seed, ok = null) => firstFitting([[3, 4], [4, 5], [5, 2], [2, 5], [3, 5], [4, 7], [5, 3], [2, 7], [3, 2], [6, 5]].filter(([k, m]) => k !== plan.k || m !== plan.m), seed, (pair) => groupingPart(plan, pair), ok),
});

/* ================================================= polynomialOverMonomial */

const latexMonomials = (latex) => text(latex).replace(/\s+/g, '').replace(/\^\{?(\d+)\}?/g, (match, power) => superscript(power));

const overMonomialClaim = (question, fields) => {
  const match = /\\frac\{([^{}]+)\}\{([^{}]+)\}/.exec(text(question?.prompt));
  if (!match) return null;
  const numerator = latexMonomials(match[1]).match(/[+-]?[^+-]+/g);
  const denominator = parseMonomialExpression(latexMonomials(match[2]));
  if (!numerator || numerator.length < 2 || !denominator) return null;
  const terms = numerator.map((term) => parseMonomialExpression(term.replace(/^\+/, '')));
  if (terms.some((term) => !term || !evaluateMonomial(term))) return null;
  const parts = fields.map((field) => {
    if (field.choice) return null;
    const label = plain(field.label);
    if (/^The quotient in simplest form$/.test(label)) return { kind: 'quotient' };
    const division = /^(.+) ÷ (.+)$/.exec(label);
    if (division && parseMonomialExpression(division[1]) && parseMonomialExpression(division[2])) return { kind: 'term' };
    return null;
  });
  if (!parts.length || parts.some((part) => !part) || !parts.some((part) => part.kind === 'quotient')) return null;
  return { terms, denominator, kinds: parts.map((part) => part.kind) };
};

const LETTER_POOL = Object.freeze(['m', 'p', 'r', 's', 't', 'u', 'w', 'k', 'g', 'h']);
// A monomial written as the lessons write one: "−3m²p", "4p³".
const writeMonomial = (c, v) => {
  const letters = Object.keys(v).sort().filter((letter) => v[letter] !== 0).map((letter) => `${letter}${v[letter] === 1 ? '' : superscript(v[letter])}`).join('');
  if (!letters) return signed(c);
  return `${c === -1 ? MINUS : c === 1 ? '' : signed(c)}${letters}`;
};

const overMonomialDraw = (plan, seed, ok = null) => {
  const bottom = evaluateMonomial(plan.denominator);
  const quotients = plan.terms.map((term) => evaluateMonomial({ t: 'div', a: term, b: plan.denominator }));
  if (!bottom || quotients.some((value) => !value || value.c.d !== 1 || Object.values(value.v).some((exponent) => exponent.d !== 1 || exponent.n < 0))) return null;
  const itemLetters = [...new Set([...Object.keys(bottom.v), ...quotients.flatMap((value) => Object.keys(value.v))])].sort();
  for (let turn = 0; turn < 40; turn += 1) {
    const draw = (options, at) => options[((Number(seed) * 40 + turn) * 7 + at * 13) % options.length];
    const pool = LETTER_POOL.filter((letter) => !itemLetters.includes(letter));
    const rename = Object.fromEntries(itemLetters.map((letter, index) => [letter, pool[(Number(seed) + turn + index) % pool.length]]));
    if (new Set(Object.values(rename)).size !== itemLetters.length) continue;
    // The divisor: the item's letters, each to a power of the same kind (1 stays 1); a whole number in front.
    const divisorC = bottom.c.n === 1 ? 1 : draw([2, 3, 4, 5, 6], 1);
    const divisorV = Object.fromEntries(Object.entries(bottom.v).map(([letter, exponent], index) => [rename[letter], exponent.n === 1 ? 1 : draw([2, 3], 2 + index)]));
    const pieces = quotients.map((value, index) => {
      const c = Math.abs(value.c.n) === 1 ? value.c.n : Math.sign(value.c.n) * draw([2, 3, 4, 5, 6, 7], 5 + index);
      const v = Object.fromEntries(Object.entries(value.v).map(([letter, exponent], at) => [rename[letter], exponent.n === 1 ? 1 : draw([2, 3, 4], 9 + index * 3 + at)]));
      const termV = { ...v };
      Object.entries(divisorV).forEach(([letter, exponent]) => { termV[letter] = (termV[letter] || 0) + exponent; });
      return { quotient: writeMonomial(c, v), term: writeMonomial(c * divisorC, termV) };
    });
    const down = writeMonomial(divisorC, divisorV);
    const numerator = pieces.map((piece, index) => (index === 0 ? piece.term : piece.term.startsWith(MINUS) ? `${MINUS} ${piece.term.slice(1)}` : `+ ${piece.term}`)).join(' ');
    const steps = [{ show: `Write (${numerator})/(${down}) as one fraction for each term of the numerator, each over ${down}.`, why: 'Dividing the sum by one monomial divides each of its terms by that monomial.' }];
    let failed = false;
    pieces.forEach((piece) => {
      const tree = parseMonomialExpression(`${piece.term} ÷ ${down}`);
      const worked = tree && monomialSteps(tree);
      if (!worked || positiveForm(worked.value) !== piece.quotient) failed = true;
      else steps.push(...worked.steps);
    });
    if (failed) continue;
    const quotient = pieces.map((piece, index) => (index === 0 ? piece.quotient : piece.quotient.startsWith(MINUS) ? `${MINUS} ${piece.quotient.slice(1)}` : `+ ${piece.quotient}`)).join(' ');
    steps.push({ show: `Add the quotients: ${quotient}.`, why: 'The quotient is the sum of the terms’ quotients, each in simplest form.' });
    const example = { prompt: `Simplify (${numerator})/(${down}).`, steps, answer: `Quotient = ${quotient}`, problems: [numerator] };
    if (!ok || ok([...steps.flatMap((step) => [step.show, step.why]), example.answer])) return example;
  }
  return null;
};

export const polynomialOverMonomial = Object.freeze({ id: 'polynomialOverMonomial', standards: ['A2.7C'], claim: overMonomialClaim, draw: overMonomialDraw });

export const POLYNOMIAL_GENERATORS = Object.freeze([rationalZeroChain, quadraticForm, groupFourTerms, polynomialOverMonomial]);
