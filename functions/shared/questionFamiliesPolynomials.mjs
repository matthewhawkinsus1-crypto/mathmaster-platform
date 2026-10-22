/*
 * OPERATIONS ON POLYNOMIALS (A2.7B) — Recovery for the Algebra II Honors
 * lesson "Operations on Polynomials" (add, subtract and multiply).
 *
 * Six platform families, one per Warm-Up and DOL question of the lesson, each
 * able to RECOGNIZE that static question (Recovery V2, recoveryContent.mjs) so
 * a student who needs a second try gets fresh, equivalent, server-graded
 * versions of it:
 *
 *   polynomials.multiplyMonomials       Warm-Up: two products of monomials,
 *                                       one in one letter, one in two.
 *                                       multiAnswer, simplest form.
 *   polynomials.oppositeAndLikeTerms    Warm-Up: the opposite of a polynomial,
 *                                       and two pairs of like terms combined.
 *                                       multiAnswer, simplest form.
 *   polynomials.likeTermPairs           Warm-Up: three pairs of terms — like
 *                                       terms, or not, and why (the exponents
 *                                       differ, or the letters do).
 *                                       multiAnswer, choices.
 *   polynomials.subtractMissingTerm     DOL: a cubic with a missing term minus
 *                                       a full cubic, in the Polynomial
 *                                       Workshop's add & subtract mode: the
 *                                       opposite of every term, each column,
 *                                       the result.
 *   polynomials.multiplyTrinomialBinomial  DOL: a trinomial times a binomial
 *                                       in the Workshop's area model: every
 *                                       cell, then the product.
 *   polynomials.profitModel             DOL: profit = revenue − cost from a
 *                                       quadratic cost; which expression is
 *                                       the profit, the profit polynomial in
 *                                       simplest form, and its value.
 *                                       multiAnswer.
 *
 * Every typed polynomial asks for simplest form (answerForm
 * 'simplifiedPolynomial', simplifiedPolynomialForm.mjs): the skill is
 * simplifying, so an unsimplified answer with the right value is not one.
 * Keys never pass total degree 8, the largest the value comparison reads
 * (expandedPolynomialExpressionEquivalence.mjs).
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt. Recovery builds its versions from the
 * original's identity only, so the lesson's own hints never reach a version.
 *
 * Pure: no Firestore, no clock. The registry loads it in the browser, so it
 * imports no tool mathematics — only the simplest-form reader the typed-answer
 * grader already loads.
 */

import {
  FAMILY_ISSUE,
  choiceDomain,
  composeFamilyPrompt,
  defineQuestionFamily,
  fingerprintOf,
  intDomain,
} from './questionFamilyContract.mjs';
import { SIMPLIFIED_POLYNOMIAL_FORM, readTypedPolynomial } from './simplifiedPolynomialForm.mjs';

const MINUS = '−';
const STRAND = 'polynomials';
const TEKS = ['A2.7B'];
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (value) => String(value).split('').map((digit) => SUPERSCRIPTS[Number(digit)] ?? digit).join('');

/** A deterministic rotation of a choice list, so the key is not always first. */
const rotate = (options, offset) => {
  const count = options.length;
  const shift = ((Math.round(Number(offset) || 0) % count) + count) % count;
  return [...options.slice(shift), ...options.slice(0, shift)];
};

/* ---------------------------------------------------------------------------
 * Writing terms. A term is [coefficient, [[letter, power], ...]] with its
 * letters in the order written (3x²y and −5yx² are the same term written two
 * ways — the like-terms Warm-Up depends on it).
 * ------------------------------------------------------------------------- */

const lettersAscii = (letters) => letters.filter(([, power]) => power).map(([letter, power]) => (power === 1 ? letter : `${letter}^${power}`)).join('');
const lettersPlain = (letters) => letters.filter(([, power]) => power).map(([letter, power]) => (power === 1 ? letter : `${letter}${superscript(power)}`)).join('');

const magnitude = (value) => String(Number(Math.abs(value).toPrecision(10)));
// One term, written with `letters` and the sign `minus`; a coefficient of ±1
// is not written in front of letters.
const writeTerm = (coefficient, letters, write, minus) => {
  const body = write(letters);
  const unit = body && Math.abs(Math.abs(coefficient) - 1) < 1e-12;
  return `${coefficient < 0 ? minus : ''}${unit ? '' : magnitude(coefficient)}${body}`;
};
const termAscii = (coefficient, letters) => writeTerm(coefficient, letters, lettersAscii, '-');
const termPlain = (coefficient, letters) => writeTerm(coefficient, letters, lettersPlain, MINUS);

// Terms joined with signs between them; zero terms dropped; "0" for none.
const joinTerms = (terms, write, { minus = '-', spaced = false } = {}) => {
  const shown = terms.filter(([coefficient]) => coefficient !== 0);
  if (!shown.length) return '0';
  return shown.map(([coefficient, letters], index) => {
    const body = write(Math.abs(coefficient), letters);
    if (index === 0) return coefficient < 0 ? `${minus}${body}` : body;
    const sign = coefficient < 0 ? minus : '+';
    return spaced ? `${sign} ${body}` : `${sign}${body}`;
  }).join(spaced ? ' ' : '');
};
const polyAscii = (terms) => joinTerms(terms, termAscii);
const polyPlain = (terms) => joinTerms(terms, termPlain, { minus: MINUS, spaced: true });
/** A polynomial in one letter from coefficients, highest power first. */
const descending = (letter, coefficients) => coefficients.map((coefficient, index) => [coefficient, [[letter, coefficients.length - 1 - index]]]);

/* ---------------------------------------------------------------------------
 * Reading a lesson's terms back. Every reading goes through the simplest-form
 * reader, so a recognized question is one whose polynomials are simplified.
 * ------------------------------------------------------------------------- */

// A label is plain Unicode ("(3x²)(−4x⁵)"); the reader takes ASCII powers.
const asciiPowers = (text) => String(text ?? '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${digits.split('').map((digit) => SUPERSCRIPTS.indexOf(digit)).join('')}`);

/** One simplified term: { coefficient, powers }, or null. */
const readTerm = (text) => {
  const read = readTypedPolynomial(asciiPowers(text));
  return !read.problem && read.terms.length === 1 ? read.terms[0] : null;
};
/** A simplified polynomial's terms, in the order written, or null. */
const readTerms = (text) => {
  const read = readTypedPolynomial(asciiPowers(text));
  return read.problem ? null : read.terms;
};
const lettersOf = (term) => Object.keys(term.powers).sort();
const powerOf = (term, letter) => term.powers[letter] || 0;
/** The terms of a one-letter polynomial by power, when every power in `powers` is there once; else null. */
const coefficientsByPower = (terms, letter, powers) => {
  if (!terms || terms.length !== powers.length) return null;
  const byPower = new Map();
  for (const term of terms) {
    const letters = lettersOf(term);
    if (letters.length > 1 || (letters.length === 1 && letters[0] !== letter)) return null;
    if (!Number.isInteger(term.coefficient)) return null;
    byPower.set(powerOf(term, letter), term.coefficient);
  }
  return powers.every((power) => byPower.has(power)) ? powers.map((power) => byPower.get(power)) : null;
};
/** The one letter a polynomial is written in, or null. */
const onlyLetter = (terms) => {
  const letters = [...new Set(list(terms).flatMap(lettersOf))];
  return letters.length === 1 ? letters[0] : null;
};

// "Multiply (3x²)(−4x⁵)" → ['3x²', '−4x⁵'].
const productLabelParts = (label) => {
  const match = /^Multiply \(([^()]+)\)\(([^()]+)\)$/.exec(clean(label));
  return match ? [match[1], match[2]] : null;
};

// Typed polynomial answers: simplest form, with the keypad keys they need.
// Labels are plain Unicode text, as every answer label is.
const polynomialField = (id, label, answer, letters) => {
  const requiredSymbols = [...new Set([...letters, 'xⁿ'])];
  return {
    id,
    label,
    answer,
    answerForm: SIMPLIFIED_POLYNOMIAL_FORM,
    inputProfile: 'expression',
    answerFormat: 'expression',
    requiredSymbols,
    inputContract: { format: 'expression', requiredSymbols },
  };
};

// What a static multiAnswer question carries that an instance writes anew.
const MULTI_ANSWER_INSTANCE_FIELDS = Object.freeze(['answerFields', 'responses']);
// What a static Polynomial Workshop question carries that an instance writes anew.
const WORKSHOP_INSTANCE_FIELDS = Object.freeze([
  'polynomial', 'leftFactor', 'rightFactor', 'leftBinomial', 'rightBinomial',
  'operation', 'firstPolynomial', 'secondPolynomial', 'coefficients',
]);

const LETTERS = Object.freeze(['x', 'y', 'a', 'n', 't']);
const LETTER_PAIRS = Object.freeze({ 'a/b': ['a', 'b'], 'x/y': ['x', 'y'], 'm/n': ['m', 'n'], 'p/q': ['p', 'q'] });
const pairName = (first, second) => Object.keys(LETTER_PAIRS).find((name) => LETTER_PAIRS[name][0] === first && LETTER_PAIRS[name][1] === second) || null;

/* ===========================================================================
 * polynomials.multiplyMonomials — Warm-Up
 * ======================================================================== */

const monomialAnswers = ({ letter, c1, e1, c2, e2, pair, d1, d2, i, j, k, l }) => {
  const [A, B] = LETTER_PAIRS[pair];
  return {
    single: termAscii(c1 * c2, [[letter, e1 + e2]]),
    double: termAscii(d1 * d2, [[A, i + k], [B, j + l]]),
  };
};

export const multiplyMonomialsFamily = defineQuestionFamily({
  id: 'polynomials.multiplyMonomials',
  version: 1,
  title: 'Multiply monomials',
  skill: {
    objective: 'Multiply monomials: multiply the coefficients and add the exponents of the same letter (the product of powers), in one letter and in two, and write the product in simplest form.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({
    letter: choiceDomain(['x', 'y', 'm', 'n']),
    c1: intDomain(-9, 9, { exclude: [-1, 0, 1] }),
    e1: intDomain(2, 5),
    c2: intDomain(-9, 9, { exclude: [-1, 0, 1] }),
    e2: intDomain(2, 5),
    pair: choiceDomain(Object.keys(LETTER_PAIRS)),
    d1: intDomain(-6, 6, { exclude: [-1, 0, 1] }),
    d2: intDomain(-6, 6, { exclude: [-1, 0, 1] }),
    i: intDomain(1, 3),
    j: intDomain(1, 3),
    k: intDomain(1, 3),
    l: intDomain(1, 3),
  }),
  derive: () => ({}),
  rules: ({ c1, e1, c2, e2, d1, d2, i, j, k, l }) => {
    const issues = [];
    // A total degree the value comparison reads (at most 8).
    if (e1 + e2 > 8 || i + j + k + l > 8) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    // A sign to keep track of in each product, as the lesson's own have.
    if (c1 > 0 && c2 > 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (d1 > 0 && d2 > 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // Each two-letter factor has a power to add, not just a bare letter.
    if (i + j < 3 || k + l < 3) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    return issues;
  },
  fingerprint: ({ letter, c1, e1, c2, e2, pair, d1, d2, i, j, k, l }) => fingerprintOf('polynomials.multiplyMonomials', [letter, c1, e1, c2, e2, pair, d1, d2, i, j, k, l]),
  answer: (values) => {
    const value = monomialAnswers(values);
    return { kind: 'fields', value, display: `${value.single}; ${value.double}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { letter, c1, e1, c2, e2, pair, d1, d2, i, j, k, l } = values;
      const [A, B] = LETTER_PAIRS[pair];
      const answers = monomialAnswers(values);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: 'Multiply. Multiply the coefficients and add the exponents of the same letter. Write each product in simplest form.',
        }),
        answerFields: [
          polynomialField('single', `Multiply (${termPlain(c1, [[letter, e1]])})(${termPlain(c2, [[letter, e2]])})`, answers.single, [letter]),
          polynomialField('double', `Multiply (${termPlain(d1, [[A, i], [B, j]])})(${termPlain(d2, [[A, k], [B, l]])})`, answers.double, [A, B]),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...MULTI_ANSWER_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = list(question?.answerFields);
    if (fields.length !== 2) return null;
    const parts = fields.map((field) => productLabelParts(field?.label));
    if (parts.some((entry) => !entry)) return null;
    const [[s1, s2], [t1, t2]] = parts.map((entry) => entry.map(readTerm));
    if (![s1, s2, t1, t2].every(Boolean)) return null;
    // The first product is in one letter, the second in two.
    const letter = onlyLetter([s1, s2]);
    const letters = [...new Set([...lettersOf(t1), ...lettersOf(t2)])].sort();
    if (!letter || lettersOf(s1).length !== 1 || lettersOf(s2).length !== 1 || letters.length !== 2) return null;
    const pair = pairName(letters[0], letters[1]);
    if (!pair) return null;
    const [A, B] = LETTER_PAIRS[pair];
    const params = {
      letter,
      c1: s1.coefficient,
      e1: powerOf(s1, letter),
      c2: s2.coefficient,
      e2: powerOf(s2, letter),
      pair,
      d1: t1.coefficient,
      d2: t2.coefficient,
      i: powerOf(t1, A),
      j: powerOf(t1, B),
      k: powerOf(t2, A),
      l: powerOf(t2, B),
    };
    if (![params.c1, params.c2, params.d1, params.d2].every(Number.isInteger)) return null;
    // The lesson's own keys are this family's keys.
    const answers = monomialAnswers(params);
    if (clean(fields[0].answer) !== answers.single || clean(fields[1].answer) !== answers.double) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.oppositeAndLikeTerms — Warm-Up
 * ======================================================================== */

const oppositeTerms = ({ letter, p3, p1, p0 }) => [[p3, [[letter, 3]]], [p1, [[letter, 1]]], [p0, []]];
const combineTerms = ({ letter, c2, c1, d2, d1 }) => [[c2, [[letter, 2]]], [c1, [[letter, 1]]], [d2, [[letter, 2]]], [d1, [[letter, 1]]]];
const oppositeAnswers = (values) => ({
  opposite: polyAscii(oppositeTerms(values).map(([coefficient, letters]) => [-coefficient, letters])),
  combine: polyAscii([[values.c2 + values.d2, [[values.letter, 2]]], [values.c1 + values.d1, [[values.letter, 1]]]]),
});

export const oppositeAndLikeTermsFamily = defineQuestionFamily({
  id: 'polynomials.oppositeAndLikeTerms',
  version: 1,
  title: 'The opposite of a polynomial, and combining like terms',
  skill: {
    objective: 'Write the opposite of a polynomial by changing the sign of every term, and combine like terms (same letter, same exponent) to write a polynomial in simplest form — the two moves subtracting polynomials is made of.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({
    letter: choiceDomain(['a', 'x', 'y', 'n']),
    p3: intDomain(1, 5),
    p1: intDomain(-9, 9, { exclude: [0] }),
    p0: intDomain(-9, 9, { exclude: [0] }),
    c2: intDomain(2, 9),
    c1: intDomain(-9, 9, { exclude: [0] }),
    d2: intDomain(-9, 9, { exclude: [0] }),
    d1: intDomain(-9, 9, { exclude: [0] }),
  }),
  derive: () => ({}),
  rules: ({ p1, p0, c2, c1, d2, d1 }) => {
    const issues = [];
    // Both signs inside the parentheses, so "change every sign" is the work.
    if ((p1 > 0) === (p0 > 0)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // Two pairs that combine to two terms, with a subtraction among them.
    if (c2 + d2 === 0 || c1 + d1 === 0) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (d2 > 0 && d1 > 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    return issues;
  },
  fingerprint: ({ letter, p3, p1, p0, c2, c1, d2, d1 }) => fingerprintOf('polynomials.oppositeAndLikeTerms', [letter, p3, p1, p0, c2, c1, d2, d1]),
  answer: (values) => {
    const value = oppositeAnswers(values);
    return { kind: 'fields', value, display: `${value.opposite}; ${value.combine}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const answers = oppositeAnswers(values);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: 'Simplify each expression. Write each answer in simplest form.',
        }),
        answerFields: [
          polynomialField('opposite', `The opposite: ${MINUS}(${polyPlain(oppositeTerms(values))})`, answers.opposite, [values.letter]),
          polynomialField('combine', `Combine like terms: ${polyPlain(combineTerms(values))}`, answers.combine, [values.letter]),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...MULTI_ANSWER_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = list(question?.answerFields);
    if (fields.length !== 2) return null;
    // "The opposite: −(a³ − 3a + 2)" and "Combine like terms: 4a² + 3a − a² − 5a"
    const opposite = /^The opposite: [−-]\(([^()]+)\)$/.exec(clean(fields[0]?.label));
    const combine = /^Combine like terms: ([^()=]+)$/.exec(clean(fields[1]?.label));
    if (!opposite || !combine) return null;
    const inside = readTerms(opposite[1]);
    const letter = onlyLetter(inside);
    if (!letter) return null;
    const cubic = coefficientsByPower(inside, letter, [3, 1, 0]);
    // Two pairs of like terms, written x², x, x², x: read term by term, not
    // simplified (that is the question).
    const pieces = clean(combine[1]).replace(/[−–]/g, '-').replace(/\s+/g, '').match(/[+-]?[^+-]+/g) || [];
    const terms = pieces.map(readTerm);
    if (!cubic || terms.length !== 4 || terms.some((term) => !term) || onlyLetter(terms) !== letter) return null;
    const powers = terms.map((term) => powerOf(term, letter));
    if (powers.join(',') !== '2,1,2,1' || !terms.every((term) => Number.isInteger(term.coefficient))) return null;
    const params = { letter, p3: cubic[0], p1: cubic[1], p0: cubic[2], c2: terms[0].coefficient, c1: terms[1].coefficient, d2: terms[2].coefficient, d1: terms[3].coefficient };
    const answers = oppositeAnswers(params);
    if (clean(fields[0].answer) !== answers.opposite || clean(fields[1].answer) !== answers.combine) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.likeTermPairs — Warm-Up
 * ======================================================================== */

export const LIKE_TERM_OPTIONS = Object.freeze({
  like: 'Like terms — same letters, same exponents',
  exponent: 'Not like terms — the exponents are different',
  letter: 'Not like terms — the letters are different',
});
const KIND_ORDERS = Object.freeze(['LEX', 'LXE', 'ELX', 'EXL', 'XLE', 'XEL']);
const KIND_BY_CODE = Object.freeze({ L: 'like', E: 'exponent', X: 'letter' });
const LIKE_PAIRS = Object.freeze({ 'x/y': ['x', 'y'], 'a/b': ['a', 'b'], 'm/n': ['m', 'n'] });
const EXPONENT_LETTERS = Object.freeze(['a', 'x', 't']);
const DIFFERENT_LETTERS = Object.freeze({ 'm/n': ['m', 'n'], 'p/q': ['p', 'q'], 'r/s': ['r', 's'] });

// The two terms of each kind, letters in the order written.
const likeTermPairTerms = (values) => {
  const [A, B] = LIKE_PAIRS[values.likePair];
  const [M, N] = DIFFERENT_LETTERS[values.letterPair];
  return {
    // 3x²y and −5yx²: the same letters and exponents, written in another order.
    like: [[values.likeC, [[A, values.likeP], [B, values.likeQ]]], [values.likeD, [[B, values.likeQ], [A, values.likeP]]]],
    // 4a³ and 4a²: the same coefficient and letter, different exponents.
    exponent: [[values.expC, [[values.expLetter, values.expP]]], [values.expC, [[values.expLetter, values.expQ]]]],
    // 6m² and 6n²: the same coefficient and exponent, different letters.
    letter: [[values.letterC, [[M, values.letterP]]], [values.letterC, [[N, values.letterP]]]],
  };
};
const pairKinds = (order) => order.split('').map((code) => KIND_BY_CODE[code]);
const likeTermAnswers = (values) => Object.fromEntries(pairKinds(values.order).map((kind, index) => [`pair${index + 1}`, LIKE_TERM_OPTIONS[kind]]));

export const likeTermPairsFamily = defineQuestionFamily({
  id: 'polynomials.likeTermPairs',
  version: 1,
  title: 'Like terms, or not — and why',
  skill: {
    objective: 'Decide whether two terms are like terms — the same letters raised to the same exponents, whatever order the letters are written in — and say why two terms are not: the exponents differ, or the letters do.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => ({
    order: choiceDomain([...KIND_ORDERS]),
    likePair: choiceDomain(Object.keys(LIKE_PAIRS)),
    likeC: intDomain(2, 9),
    likeD: intDomain(-9, -2),
    likeP: intDomain(2, 3),
    likeQ: intDomain(1, 2),
    expLetter: choiceDomain([...EXPONENT_LETTERS]),
    expC: intDomain(2, 9),
    expP: intDomain(1, 4),
    expQ: intDomain(1, 4),
    letterPair: choiceDomain(Object.keys(DIFFERENT_LETTERS)),
    letterC: intDomain(2, 9),
    letterP: intDomain(1, 3),
  }),
  derive: () => ({}),
  rules: ({ expP, expQ }) => (expP === expQ ? [FAMILY_ISSUE.DEGENERATE_INSTANCE] : []),
  fingerprint: (values) => fingerprintOf('polynomials.likeTermPairs', [
    values.order, values.likePair, values.likeC, values.likeD, values.likeP, values.likeQ,
    values.expLetter, values.expC, values.expP, values.expQ, values.letterPair, values.letterC, values.letterP,
  ]),
  answer: (values) => {
    const value = likeTermAnswers(values);
    return { kind: 'fields', value, display: Object.values(value).join('; ') };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const terms = likeTermPairTerms(values);
      const answers = likeTermAnswers(values);
      const options = Object.values(LIKE_TERM_OPTIONS);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: 'Each box shows two terms. Are they like terms? If they are not, say why.',
        }),
        answerFields: pairKinds(values.order).map((kind, index) => {
          const [first, second] = terms[kind];
          return {
            id: `pair${index + 1}`,
            label: `${termPlain(...first)} and ${termPlain(...second)}`,
            type: 'choice',
            options: rotate([...options], values.likeC + values.expC + index),
            answer: answers[`pair${index + 1}`],
            inputProfile: 'choice',
          };
        }),
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...MULTI_ANSWER_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = list(question?.answerFields);
    const options = Object.values(LIKE_TERM_OPTIONS);
    if (fields.length !== 3) return null;
    if (!fields.every((field) => list(field?.options).length === options.length && options.every((option) => list(field.options).includes(option)))) return null;
    const read = fields.map((field) => {
      const parts = clean(field?.label).split(' and ');
      if (parts.length !== 2) return null;
      const terms = parts.map(readTerm);
      if (terms.some((term) => !term || !Number.isInteger(term.coefficient))) return null;
      // The order the letters are written in (readTerm sorts them).
      const written = parts.map((part) => (clean(part).match(/[a-z]/g) || []).join(''));
      const kind = Object.entries(LIKE_TERM_OPTIONS).find(([, option]) => option === clean(field.answer))?.[0];
      return kind ? { terms, written, kind } : null;
    });
    if (read.some((entry) => !entry)) return null;
    const byKind = Object.fromEntries(read.map((entry) => [entry.kind, entry]));
    if (Object.keys(byKind).length !== 3) return null;
    const order = read.map((entry) => Object.keys(KIND_BY_CODE).find((code) => KIND_BY_CODE[code] === entry.kind)).join('');

    const like = byKind.like;
    const [A, B] = like.written[0].split('');
    const likePair = Object.keys(LIKE_PAIRS).find((name) => LIKE_PAIRS[name][0] === A && LIKE_PAIRS[name][1] === B);
    if (!likePair || like.written[1] !== `${B}${A}`) return null;
    const [likeFirst, likeSecond] = like.terms;
    if (powerOf(likeFirst, A) !== powerOf(likeSecond, A) || powerOf(likeFirst, B) !== powerOf(likeSecond, B)) return null;

    const exponent = byKind.exponent;
    const expLetter = onlyLetter(exponent.terms);
    if (!expLetter || exponent.terms[0].coefficient !== exponent.terms[1].coefficient) return null;

    const letter = byKind.letter;
    const [M, N] = letter.written;
    const letterPair = Object.keys(DIFFERENT_LETTERS).find((name) => DIFFERENT_LETTERS[name][0] === M && DIFFERENT_LETTERS[name][1] === N);
    if (!letterPair || letter.terms[0].coefficient !== letter.terms[1].coefficient || powerOf(letter.terms[0], M) !== powerOf(letter.terms[1], N)) return null;

    const params = {
      order,
      likePair,
      likeC: likeFirst.coefficient,
      likeD: likeSecond.coefficient,
      likeP: powerOf(likeFirst, A),
      likeQ: powerOf(likeFirst, B),
      expLetter,
      expC: exponent.terms[0].coefficient,
      expP: powerOf(exponent.terms[0], expLetter),
      expQ: powerOf(exponent.terms[1], expLetter),
      letterPair,
      letterC: letter.terms[0].coefficient,
      letterP: powerOf(letter.terms[0], M),
    };
    if (params.expP === params.expQ) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.subtractMissingTerm — DOL (Polynomial Workshop, add & subtract)
 * ======================================================================== */

const subtractTerms = ({ letter, a3, a2, a0, b3, b2, b1, b0 }) => ({
  first: [[a3, [[letter, 3]]], [a2, [[letter, 2]]], [a0, []]],
  second: descending(letter, [b3, b2, b1, b0]),
});

// The workshop's columns are x³, x², x, constant; its Check sends a typed
// term per column.
const subtractWork = (values) => {
  const { letter, a3, a2, a0, b3, b2, b1, b0 } = values;
  const powers = [3, 2, 1, 0];
  const term = (coefficient, power) => (coefficient === 0 ? '0' : termAscii(coefficient, power ? [[letter, power]] : []));
  const sums = [a3 - b3, a2 - b2, -b1, a0 - b0];
  return {
    opposites: [-b3, -b2, -b1, -b0].map((coefficient, index) => term(coefficient, powers[index])),
    sums: sums.map((coefficient, index) => term(coefficient, powers[index])),
    result: polyAscii(descending(letter, sums)),
  };
};

export const subtractMissingTermFamily = defineQuestionFamily({
  id: 'polynomials.subtractMissingTerm',
  version: 1,
  title: 'Subtract polynomials (a missing term)',
  skill: {
    objective: 'Subtract a cubic polynomial from a cubic with a missing term: add the opposite of EVERY term of the polynomial being subtracted, line up like terms (a missing term has nothing to combine with), and combine them.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  parameters: () => ({
    letter: choiceDomain([...LETTERS]),
    a3: intDomain(2, 9),
    a2: intDomain(-9, 9, { exclude: [0] }),
    a0: intDomain(-9, 9, { exclude: [0] }),
    b3: intDomain(1, 9),
    b2: intDomain(-9, 9, { exclude: [0] }),
    b1: intDomain(-9, 9, { exclude: [0] }),
    b0: intDomain(-9, 9, { exclude: [0] }),
  }),
  derive: () => ({}),
  rules: ({ a3, a2, a0, b3, b2, b1, b0 }) => {
    const issues = [];
    // Nothing cancels: every column of the result has a term.
    if (a3 === b3 || a2 === b2 || a0 === b0) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    // Signs both ways after the leading term, so changing only the first sign shows.
    const rest = [b2, b1, b0];
    if (!rest.some((value) => value < 0) || !rest.some((value) => value > 0)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    return issues;
  },
  fingerprint: ({ letter, a3, a2, a0, b3, b2, b1, b0 }) => fingerprintOf('polynomials.subtractMissingTerm', [letter, a3, a2, a0, b3, b2, b1, b0]),
  answer: (values) => {
    const value = subtractWork(values);
    return { kind: 'polynomialWorkshop', value, display: value.result };
  },
  tools: {
    polynomialWorkshop: (values, { authored }) => {
      const { first, second } = subtractTerms(values);
      return {
        type: 'polynomialWorkshop',
        mode: 'addSubtract',
        operation: 'subtract',
        firstPolynomial: polyAscii(first),
        secondPolynomial: polyAscii(second),
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: `Subtract: (${polyPlain(first)}) ${MINUS} (${polyPlain(second)}). Write the opposite of every term you subtract, combine each column of like terms, and write the result in simplest form.`,
        }),
      };
    },
  },
  defaultTool: 'polynomialWorkshop',
  instanceFields: [...WORKSHOP_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'polynomialWorkshop' || clean(question?.mode) !== 'addSubtract' || clean(question?.operation) !== 'subtract') return null;
    const first = readTerms(question.firstPolynomial);
    const second = readTerms(question.secondPolynomial);
    const letter = onlyLetter([...list(first), ...list(second)]);
    if (!letter) return null;
    const a = coefficientsByPower(first, letter, [3, 2, 0]);
    const b = coefficientsByPower(second, letter, [3, 2, 1, 0]);
    if (!a || !b) return null;
    return { params: { letter, a3: a[0], a2: a[1], a0: a[2], b3: b[0], b2: b[1], b1: b[2], b0: b[3] }, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.multiplyTrinomialBinomial — DOL (Polynomial Workshop, area model)
 * ======================================================================== */

const trinomialBinomialProduct = ({ t2, t1, t0, b1, b0 }) => [t2 * b1, t2 * b0 + t1 * b1, t1 * b0 + t0 * b1, t0 * b0];

// Rows are the trinomial's terms, columns the binomial's: the cells row by row.
const areaWork = (values) => {
  const { letter, t2, t1, t0, b1, b0 } = values;
  const rows = [[t2, 2], [t1, 1], [t0, 0]];
  const columns = [[b1, 1], [b0, 0]];
  const terms = rows.flatMap(([rc, rp]) => columns.map(([cc, cp]) => termAscii(rc * cc, rp + cp ? [[letter, rp + cp]] : [])));
  return { terms, product: polyAscii(descending(letter, trinomialBinomialProduct(values))) };
};

export const multiplyTrinomialBinomialFamily = defineQuestionFamily({
  id: 'polynomials.multiplyTrinomialBinomial',
  version: 1,
  title: 'Multiply a trinomial by a binomial (area model)',
  skill: {
    objective: 'Multiply a trinomial by a binomial with an area model: every term of one factor times every term of the other, each product written as one term, then like terms combined into the product in simplest form.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  parameters: () => ({
    letter: choiceDomain([...LETTERS]),
    t2: intDomain(1, 5),
    t1: intDomain(-9, 9, { exclude: [0] }),
    t0: intDomain(-9, 9, { exclude: [0] }),
    b1: intDomain(1, 3),
    b0: intDomain(-9, 9, { exclude: [0] }),
  }),
  derive: () => ({}),
  rules: (values) => {
    const issues = [];
    const product = trinomialBinomialProduct(values);
    // No like terms cancel, and the product stays a size worked on paper.
    if (product.some((coefficient) => coefficient === 0)) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
    if (product.some((coefficient) => Math.abs(coefficient) > 60)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    // Negative terms to keep track of, as the lesson's own factors have.
    if ([values.t1, values.t0, values.b0].filter((value) => value < 0).length < 1) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    if (values.t2 === 1 && values.b1 === 1) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    return issues;
  },
  fingerprint: ({ letter, t2, t1, t0, b1, b0 }) => fingerprintOf('polynomials.multiplyTrinomialBinomial', [letter, t2, t1, t0, b1, b0]),
  answer: (values) => {
    const value = areaWork(values);
    return { kind: 'polynomialWorkshop', value, display: value.product };
  },
  tools: {
    polynomialWorkshop: (values, { authored }) => {
      const { letter, t2, t1, t0, b1, b0 } = values;
      const left = descending(letter, [t2, t1, t0]);
      const right = descending(letter, [b1, b0]);
      return {
        type: 'polynomialWorkshop',
        mode: 'multiplyArea',
        leftFactor: polyAscii(left),
        rightFactor: polyAscii(right),
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: `Multiply (${polyPlain(left)})(${polyPlain(right)}). Fill in every cell of the area model, then write the product in simplest form.`,
        }),
      };
    },
  },
  defaultTool: 'polynomialWorkshop',
  instanceFields: [...WORKSHOP_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'polynomialWorkshop' || clean(question?.mode) !== 'multiplyArea') return null;
    const left = readTerms(question.leftFactor);
    const right = readTerms(question.rightFactor);
    const letter = onlyLetter([...list(left), ...list(right)]);
    if (!letter) return null;
    const t = coefficientsByPower(left, letter, [2, 1, 0]);
    const b = coefficientsByPower(right, letter, [1, 0]);
    if (!t || !b) return null;
    return { params: { letter, t2: t[0], t1: t[1], t0: t[2], b1: b[0], b0: b[1] }, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.profitModel — DOL
 * ======================================================================== */

// The cost's x² coefficient in thousandths: 0.001 to 0.005.
const decimal = (thousandths) => String(Number((thousandths / 1000).toFixed(3)));
const costPlain = ({ a, b, c }) => `${decimal(a)}x² + ${b}x + ${c}`;
const profitOptions = (values) => {
  const { r } = values;
  const cost = costPlain(values);
  return {
    right: `${r}x ${MINUS} (${cost})`,
    // Subtracted only the first term of the cost.
    firstOnly: `${r}x ${MINUS} ${cost}`,
    reversed: `(${cost}) ${MINUS} ${r}x`,
    added: `${r}x + (${cost})`,
  };
};
const profitValue = ({ a, b, c, r, n }) => Math.round((-a * n * n) / 1000 + (r - b) * n - c);
const profitAnswers = (values) => {
  const { a, b, c, r } = values;
  return {
    setup: profitOptions(values).right,
    profit: polyAscii([[-a / 1000, [['x', 2]]], [r - b, [['x', 1]]], [-c, []]]),
    value: String(profitValue(values)),
  };
};
const ITEMS = Object.freeze(['items', 'units', 'phone cases', 'water bottles']);

export const profitModelFamily = defineQuestionFamily({
  id: 'polynomials.profitModel',
  version: 1,
  title: 'Profit = revenue − cost with a quadratic cost',
  skill: {
    objective: 'Write a polynomial for profit as revenue minus cost, subtracting EVERY term of the cost, simplify it, and evaluate it in context.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 3, dok: 3 },
  constraints: {},
  parameters: () => ({
    a: intDomain(1, 5),
    b: intDomain(2, 9),
    c: intDomain(100, 900, { step: 50 }),
    r: intDomain(6, 20),
    n: intDomain(100, 1000, { step: 100 }),
    item: choiceDomain([...ITEMS]),
  }),
  derive: () => ({}),
  rules: (values) => {
    const issues = [];
    if (values.r - values.b < 2) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
    // A sale that makes money: a profit worth reporting.
    if (profitValue(values) <= 0) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
    return issues;
  },
  // The noun is presentation.
  fingerprint: ({ a, b, c, r, n }) => fingerprintOf('polynomials.profitModel', [a, b, c, r, n]),
  answer: (values) => {
    const value = profitAnswers(values);
    return { kind: 'fields', value, display: `${value.profit}; ${value.value}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const answers = profitAnswers(values);
      const options = profitOptions(values);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: `A company's cost to make x ${values.item} is C(x) = ${costPlain(values)} dollars, and its revenue from selling them is R(x) = ${values.r}x dollars. Profit is revenue minus cost.`,
        }),
        answerFields: [
          {
            id: 'setup',
            label: 'Which expression is the profit P(x) = R(x) − C(x)?',
            type: 'choice',
            options: rotate([options.right, options.firstOnly, options.reversed, options.added], values.r + values.n / 100),
            answer: answers.setup,
            inputProfile: 'choice',
          },
          polynomialField('profit', 'The profit P(x) in simplest form', answers.profit, ['x']),
          {
            id: 'value',
            label: `The profit, in dollars, when ${values.n} ${values.item} are sold`,
            answer: answers.value,
            inputProfile: 'number',
            answerFormat: 'number',
            inputContract: { format: 'number' },
          },
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...MULTI_ANSWER_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = list(question?.answerFields);
    const setup = fields.find((field) => /^Which expression is the profit/i.test(clean(field?.label)));
    const profit = fields.find((field) => /^The profit P\(x\) in simplest form$/i.test(clean(field?.label)));
    const value = fields.find((field) => /^The profit, in dollars, when \d+ .+ are sold$/i.test(clean(field?.label)));
    if (fields.length !== 3 || !setup || !profit || !value) return null;
    // "12x − (0.002x² + 4x + 350)"
    const match = /^(\d+)x [−-] \((0\.00[1-9])x² \+ (\d+)x \+ (\d+)\)$/.exec(clean(setup.answer));
    const sold = /when (\d+) (.+) are sold$/i.exec(clean(value.label));
    if (!match || !sold) return null;
    const params = {
      r: Number(match[1]),
      a: Math.round(Number(match[2]) * 1000),
      b: Number(match[3]),
      c: Number(match[4]),
      n: Number(sold[1]),
      item: ITEMS.includes(sold[2]) ? sold[2] : 'items',
    };
    const answers = profitAnswers(params);
    if (clean(profit.answer) !== answers.profit || clean(value.answer) !== answers.value) return null;
    if (!list(setup.options).includes(answers.setup)) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

export const POLYNOMIAL_FAMILIES = Object.freeze([
  multiplyMonomialsFamily,
  oppositeAndLikeTermsFamily,
  likeTermPairsFamily,
  subtractMissingTermFamily,
  multiplyTrinomialBinomialFamily,
  profitModelFamily,
]);

export default POLYNOMIAL_FAMILIES;
