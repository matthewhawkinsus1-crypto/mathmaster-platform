/*
 * DIVIDING POLYNOMIALS (A2.7C) — Recovery for the Algebra II Honors lesson
 * "Dividing Polynomials" (long division and synthetic division).
 *
 * Six platform families, one per Warm-Up and DOL question of the lesson, each
 * able to RECOGNIZE that static question (Recovery V2, recoveryContent.mjs) so
 * a student who needs a second try gets fresh, equivalent, server-graded
 * versions of it:
 *
 *   polynomials.divideMonomials      Warm-Up: two quotients of monomials, one
 *                                    in one letter, one in two (subtract the
 *                                    exponents). multiAnswer, simplest form.
 *   polynomials.distributeMonomial   Warm-Up: multiply back — a monomial
 *                                    times a trinomial, and a negative
 *                                    monomial times x + q. multiAnswer.
 *   polynomials.subtractForDivision  Warm-Up: subtract — a two-letter
 *                                    polynomial with a missing term, and the
 *                                    subtraction a round of long division
 *                                    makes (the leading terms cancel).
 *                                    multiAnswer.
 *   polynomials.divideByMonomial     DOL: a trinomial divided by a monomial
 *                                    as a sum of quotients — each quotient,
 *                                    one of them 1, then the quotient.
 *                                    multiAnswer.
 *   polynomials.longDivisionLinear   DOL: a cubic with a missing term divided
 *                                    by x − r, in the Polynomial Workshop's
 *                                    long division: every round, then the
 *                                    quotient and the remainder.
 *   polynomials.syntheticDivision    DOL: a quartic with a missing term
 *                                    divided by x − r, in the Workshop's
 *                                    synthetic division: r, every number of
 *                                    the table, then the quotient.
 *
 * Every typed polynomial asks for simplest form (answerForm
 * 'simplifiedPolynomial', simplifiedPolynomialForm.mjs). The Workshop
 * families write the work a student who divides correctly sends — the same
 * work the shared grader's own key accepts (polynomialMath.mjs
 * divisionKeyWork); recoveryPolynomialDivisionFamilies.test.mjs holds the two
 * equal for every version.
 *
 * WHAT IT NEVER DOES. A family writes a QUESTION: no hint, no step, no worked
 * solution, and no answer in a prompt. Recovery builds its versions from the
 * original's identity only, so the lesson's own hints and prompt never reach
 * a version.
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
const TEKS = ['A2.7C'];
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const superscript = (value) => String(value).split('').map((digit) => SUPERSCRIPTS[Number(digit)] ?? digit).join('');

/* ---------------------------------------------------------------------------
 * Writing terms. A term is [coefficient, [[letter, power], ...]], its letters
 * in the order written.
 * ------------------------------------------------------------------------- */

const lettersAscii = (letters) => letters.filter(([, power]) => power).map(([letter, power]) => (power === 1 ? letter : `${letter}^${power}`)).join('');
const lettersPlain = (letters) => letters.filter(([, power]) => power).map(([letter, power]) => (power === 1 ? letter : `${letter}${superscript(power)}`)).join('');
const lettersLatex = (letters) => letters.filter(([, power]) => power).map(([letter, power]) => (power === 1 ? letter : `${letter}^{${power}}`)).join('');

const magnitude = (value) => String(Number(Math.abs(value).toPrecision(10)));
// One term with `letters` written by `write` and the sign `minus`; a
// coefficient of ±1 is not written in front of letters.
const writeTerm = (coefficient, letters, write, minus) => {
  const body = write(letters);
  const unit = body && Math.abs(Math.abs(coefficient) - 1) < 1e-12;
  return `${coefficient < 0 ? minus : ''}${unit ? '' : magnitude(coefficient)}${body}`;
};
const termAscii = (coefficient, letters) => writeTerm(coefficient, letters, lettersAscii, '-');
const termPlain = (coefficient, letters) => writeTerm(coefficient, letters, lettersPlain, MINUS);
const termLatex = (coefficient, letters) => writeTerm(coefficient, letters, lettersLatex, '-');

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
const polyLatex = (terms) => joinTerms(terms, termLatex);
/** A polynomial in one letter from coefficients, highest power first. */
const descending = (letter, coefficients) => coefficients.map((coefficient, index) => [coefficient, [[letter, coefficients.length - 1 - index]]]);

/* ---------------------------------------------------------------------------
 * Reading a lesson's terms back, through the simplest-form reader.
 * ------------------------------------------------------------------------- */

// A label is plain Unicode ("−20m⁴n³"); the reader takes ASCII powers.
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
const isInteger = (term) => Number.isInteger(term?.coefficient);
/** The terms of a one-letter polynomial by power, when exactly the powers in `powers` are there; else null. */
const coefficientsByPower = (terms, letter, powers) => {
  if (!terms || terms.length !== powers.length) return null;
  const byPower = new Map();
  for (const term of terms) {
    const letters = lettersOf(term);
    if (letters.length > 1 || (letters.length === 1 && letters[0] !== letter)) return null;
    if (!isInteger(term)) return null;
    byPower.set(powerOf(term, letter), term.coefficient);
  }
  return powers.every((power) => byPower.has(power)) ? powers.map((power) => byPower.get(power)) : null;
};
/** The one letter a polynomial is written in, or null. */
const onlyLetter = (terms) => {
  const letters = [...new Set(list(terms).flatMap(lettersOf))];
  return letters.length === 1 ? letters[0] : null;
};
/** The coefficients of a one-letter polynomial from its degree down (0 where a power is missing), or null. */
const denseCoefficients = (terms, letter, degree) => {
  if (!terms || !terms.length || terms.some((term) => !isInteger(term))) return null;
  if (terms.some((term) => lettersOf(term).some((name) => name !== letter))) return null;
  const powers = terms.map((term) => powerOf(term, letter));
  if (Math.max(...powers) !== degree || new Set(powers).size !== powers.length) return null;
  return Array.from({ length: degree + 1 }, (_, index) => terms.find((term) => powerOf(term, letter) === degree - index)?.coefficient ?? 0);
};

// Typed polynomial answers: simplest form, with the keypad keys they need.
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
const WORKSHOP_INSTANCE_FIELDS = Object.freeze(['polynomial', 'dividend', 'divisor', 'coefficients']);

const LETTER_PAIRS = Object.freeze({ 'a/b': ['a', 'b'], 'x/y': ['x', 'y'], 'm/n': ['m', 'n'], 'p/q': ['p', 'q'] });
const pairName = (first, second) => Object.keys(LETTER_PAIRS).find((name) => LETTER_PAIRS[name][0] === first && LETTER_PAIRS[name][1] === second) || null;
const ONE_LETTER = Object.freeze(['x', 'y', 'a', 'n', 'w', 't']);

// A recognized question is one of the family's own versions: every parameter
// in its domain and no rule broken — so a binding never promises Recovery a
// shape the family does not write (a full cubic for the missing-term one).
const isOwnVersion = (params, domains, rules) => Object.entries(domains).every(([name, domain]) => domain.values.some((value) => value === params[name]))
  && rules(params).length === 0;

/* ===========================================================================
 * polynomials.divideMonomials — Warm-Up
 * ======================================================================== */

// "Divide 18x⁵ ÷ 3x²" → ['18x⁵', '3x²'].
const divideLabelParts = (label) => {
  const match = /^Divide (.+) ÷ (.+)$/.exec(clean(label));
  return match ? [match[1], match[2]] : null;
};

const monomialQuotients = ({ letter, q1, e2, de, pair, q2, k, l, dk, dl }) => {
  const [A, B] = LETTER_PAIRS[pair];
  return {
    single: termAscii(q1, [[letter, de]]),
    double: termAscii(q2, [[A, dk], [B, dl]]),
    labels: {
      // The divisor's coefficient times the quotient's is the dividend's.
      single: (c2) => `Divide ${termPlain(q1 * c2, [[letter, e2 + de]])} ÷ ${termPlain(c2, [[letter, e2]])}`,
      double: (d2) => `Divide ${termPlain(q2 * d2, [[A, k + dk], [B, l + dl]])} ÷ ${termPlain(d2, [[A, k], [B, l]])}`,
    },
  };
};

const divideMonomialsDomains = () => ({
  letter: choiceDomain(['x', 'y', 'a', 'n']),
  q1: intDomain(-9, 9, { exclude: [-1, 0, 1] }),
  c2: intDomain(2, 9),
  e2: intDomain(1, 4),
  de: intDomain(1, 4),
  pair: choiceDomain(Object.keys(LETTER_PAIRS)),
  q2: intDomain(-9, 9, { exclude: [-1, 0, 1] }),
  d2: intDomain(2, 9),
  k: intDomain(1, 3),
  l: intDomain(1, 3),
  dk: intDomain(1, 3),
  dl: intDomain(1, 3),
});
const divideMonomialsRules = ({ q1, q2 }) => {
  const issues = [];
  // A sign to keep track of, as the lesson's own has.
  if (q1 > 0 && q2 > 0) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
  return issues;
};

export const divideMonomialsFamily = defineQuestionFamily({
  id: 'polynomials.divideMonomials',
  version: 1,
  title: 'Divide monomials',
  skill: {
    objective: 'Divide monomials: divide the coefficients and subtract the exponents of the same letter (the quotient of powers), in one letter and in two, and write the quotient in simplest form — the first move of every round of polynomial division.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => divideMonomialsDomains(),
  derive: () => ({}),
  rules: divideMonomialsRules,
  fingerprint: ({ letter, q1, c2, e2, de, pair, q2, d2, k, l, dk, dl }) => fingerprintOf('polynomials.divideMonomials', [letter, q1, c2, e2, de, pair, q2, d2, k, l, dk, dl]),
  answer: (values) => {
    const { single, double } = monomialQuotients(values);
    return { kind: 'fields', value: { single, double }, display: `${single}; ${double}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { letter, pair, c2, d2 } = values;
      const quotients = monomialQuotients(values);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: 'Divide. Divide the coefficients and subtract the exponents of the same letter. Write each quotient in simplest form.',
        }),
        answerFields: [
          polynomialField('single', quotients.labels.single(c2), quotients.single, [letter]),
          polynomialField('double', quotients.labels.double(d2), quotients.double, LETTER_PAIRS[pair]),
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
    const parts = fields.map((field) => divideLabelParts(field?.label));
    if (parts.some((entry) => !entry)) return null;
    const [[s1, s2], [t1, t2]] = parts.map((entry) => entry.map(readTerm));
    if (![s1, s2, t1, t2].every((term) => term && isInteger(term))) return null;
    const letter = onlyLetter([s1, s2]);
    if (!letter || lettersOf(s1).length !== 1 || lettersOf(s2).length !== 1) return null;
    const letters = [...new Set([...lettersOf(t1), ...lettersOf(t2)])].sort();
    if (letters.length !== 2 || lettersOf(t1).length !== 2 || lettersOf(t2).length !== 2) return null;
    const pair = pairName(letters[0], letters[1]);
    if (!pair) return null;
    const [A, B] = LETTER_PAIRS[pair];
    if (s1.coefficient % s2.coefficient !== 0 || t1.coefficient % t2.coefficient !== 0) return null;
    const params = {
      letter,
      q1: s1.coefficient / s2.coefficient,
      c2: s2.coefficient,
      e2: powerOf(s2, letter),
      de: powerOf(s1, letter) - powerOf(s2, letter),
      pair,
      q2: t1.coefficient / t2.coefficient,
      d2: t2.coefficient,
      k: powerOf(t2, A),
      l: powerOf(t2, B),
      dk: powerOf(t1, A) - powerOf(t2, A),
      dl: powerOf(t1, B) - powerOf(t2, B),
    };
    // The lesson's own keys are this family's keys.
    const quotients = monomialQuotients(params);
    if (clean(fields[0].answer) !== quotients.single || clean(fields[1].answer) !== quotients.double) return null;
    if (!isOwnVersion(params, divideMonomialsDomains(), divideMonomialsRules)) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.distributeMonomial — Warm-Up
 * ======================================================================== */

// "Multiply 7w(2w² + 8w − 5)" → ['7w', '2w² + 8w − 5'].
const multiplyLabelParts = (label) => {
  const match = /^Multiply ([^()]+)\(([^()]+)\)$/.exec(clean(label));
  return match ? [match[1], match[2]] : null;
};

const distributeAnswers = ({ L, m, b, c, d, X, t, p, q }) => ({
  trinomial: polyAscii(descending(L, [m * b, m * c, m * d, 0])),
  binomial: polyAscii([[t, [[X, p + 1]]], [t * q, [[X, p]]]]),
});

const distributeMonomialDomains = () => ({
  L: choiceDomain(['w', 'x', 'y', 'a', 'n']),
  m: intDomain(2, 9),
  b: intDomain(1, 5),
  c: intDomain(-9, 9, { exclude: [0] }),
  d: intDomain(-9, 9, { exclude: [0] }),
  X: choiceDomain(['x', 'y', 'a', 't']),
  t: intDomain(-9, -2),
  p: intDomain(1, 2),
  q: intDomain(-9, 9, { exclude: [0] }),
});
const distributeMonomialRules = ({ c, d }) => {
  const issues = [];
  // Both signs inside the trinomial, so every sign rule is used.
  if ((c > 0) === (d > 0)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
  return issues;
};

export const distributeMonomialFamily = defineQuestionFamily({
  id: 'polynomials.distributeMonomial',
  version: 1,
  title: 'Multiply back: a monomial times a polynomial',
  skill: {
    objective: 'Multiply a polynomial by a monomial — the outside term times EVERY term inside, multiplying the numbers and adding the exponents — as each round of long division multiplies a quotient term by the whole divisor; write the product in simplest form.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => distributeMonomialDomains(),
  derive: () => ({}),
  rules: distributeMonomialRules,
  fingerprint: ({ L, m, b, c, d, X, t, p, q }) => fingerprintOf('polynomials.distributeMonomial', [L, m, b, c, d, X, t, p, q]),
  answer: (values) => {
    const value = distributeAnswers(values);
    return { kind: 'fields', value, display: `${value.trinomial}; ${value.binomial}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { L, m, b, c, d, X, t, p, q } = values;
      const answers = distributeAnswers(values);
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: 'Multiply. Multiply the outside term by every term inside the parentheses, and write each product in simplest form.',
        }),
        answerFields: [
          polynomialField('trinomial', `Multiply ${termPlain(m, [[L, 1]])}(${polyPlain(descending(L, [b, c, d]))})`, answers.trinomial, [L]),
          polynomialField('binomial', `Multiply ${termPlain(t, [[X, p]])}(${polyPlain([[1, [[X, 1]]], [q, []]])})`, answers.binomial, [X]),
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
    const parts = fields.map((field) => multiplyLabelParts(field?.label));
    if (parts.some((entry) => !entry)) return null;
    const [[outer1, inner1], [outer2, inner2]] = parts;
    const first = readTerm(outer1);
    const second = readTerm(outer2);
    if (!first || !second || !isInteger(first) || !isInteger(second)) return null;
    const L = onlyLetter([first]);
    const X = onlyLetter([second]);
    if (!L || !X || powerOf(first, L) !== 1) return null;
    const trinomial = coefficientsByPower(readTerms(inner1), L, [2, 1, 0]);
    const binomial = coefficientsByPower(readTerms(inner2), X, [1, 0]);
    if (!trinomial || !binomial || binomial[0] !== 1) return null;
    const params = { L, m: first.coefficient, b: trinomial[0], c: trinomial[1], d: trinomial[2], X, t: second.coefficient, p: powerOf(second, X), q: binomial[1] };
    const answers = distributeAnswers(params);
    if (clean(fields[0].answer) !== answers.trinomial || clean(fields[1].answer) !== answers.binomial) return null;
    if (!isOwnVersion(params, distributeMonomialDomains(), distributeMonomialRules)) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.subtractForDivision — Warm-Up
 * ======================================================================== */

// "Subtract (10a² − 6ab + b²) − (5a² − 2b²)" → ['10a² − 6ab + b²', '5a² − 2b²'].
const subtractLabelParts = (label) => {
  const match = /^Subtract \(([^()]+)\) [−-] \(([^()]+)\)$/.exec(clean(label));
  return match ? [match[1], match[2]] : null;
};

const generalTerms = ({ pair, p, q, r, s, u }) => {
  const [A, B] = LETTER_PAIRS[pair];
  return {
    first: [[p, [[A, 2]]], [q, [[A, 1], [B, 1]]], [r, [[B, 2]]]],
    second: [[s, [[A, 2]]], [u, [[B, 2]]]],
    difference: [[p - s, [[A, 2]]], [q, [[A, 1], [B, 1]]], [r - u, [[B, 2]]]],
  };
};
const subtractAnswers = (values) => ({
  general: polyAscii(generalTerms(values).difference),
  division: termAscii(values.v - values.w, [[values.X, 1]]),
});

// The two differences vary independently, so each range is kept to what the
// space of versions can permute (MAX_PERMUTABLE_SPACE, 2³⁰).
const subtractForDivisionDomains = () => ({
  pair: choiceDomain(['a/b', 'x/y', 'm/n']),
  p: intDomain(2, 10),
  q: intDomain(-8, 8, { exclude: [0] }),
  r: intDomain(-6, 6, { exclude: [0] }),
  s: intDomain(1, 9),
  u: intDomain(-9, -1),
  X: choiceDomain(['x', 'y']),
  m: intDomain(-6, 6, { exclude: [-1, 0, 1] }),
  v: intDomain(-6, 6, { exclude: [0] }),
  w: intDomain(-9, -1),
});
const subtractForDivisionRules = ({ p, r, s, u, v, w }) => {
  const issues = [];
  // Nothing cancels in the answer, so every column shows.
  if (p === s || r === u || v === w) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
  return issues;
};

export const subtractForDivisionFamily = defineQuestionFamily({
  id: 'polynomials.subtractForDivision',
  version: 1,
  title: 'Subtract polynomials, as long division does',
  skill: {
    objective: 'Subtract polynomials by changing the sign of EVERY term subtracted and combining like terms — a two-letter polynomial with a missing term, and the subtraction a round of long division makes, where the leading terms cancel and subtracting a negative adds.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 1, dok: 1 },
  constraints: {},
  parameters: () => subtractForDivisionDomains(),
  derive: () => ({}),
  rules: subtractForDivisionRules,
  fingerprint: ({ pair, p, q, r, s, u, X, m, v, w }) => fingerprintOf('polynomials.subtractForDivision', [pair, p, q, r, s, u, X, m, v, w]),
  answer: (values) => {
    const value = subtractAnswers(values);
    return { kind: 'fields', value, display: `${value.general}; ${value.division}` };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { pair, X, m, v, w } = values;
      const { first, second } = generalTerms(values);
      const answers = subtractAnswers(values);
      const line = (coefficient) => [[m, [[X, 2]]], [coefficient, [[X, 1]]]];
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: 'Subtract. Change the sign of every term you subtract, and write each difference in simplest form.',
        }),
        answerFields: [
          polynomialField('general', `Subtract (${polyPlain(first)}) ${MINUS} (${polyPlain(second)})`, answers.general, LETTER_PAIRS[pair]),
          polynomialField('division', `Subtract (${polyPlain(line(v))}) ${MINUS} (${polyPlain(line(w))})`, answers.division, [X]),
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
    const parts = fields.map((field) => subtractLabelParts(field?.label));
    if (parts.some((entry) => !entry)) return null;
    const [[general1, general2], [line1, line2]] = parts.map((entry) => entry.map(readTerms));
    if (!general1 || !general2 || general1.length !== 3 || general2.length !== 2) return null;
    if (![...general1, ...general2].every(isInteger)) return null;
    const letters = [...new Set([...general1, ...general2].flatMap(lettersOf))].sort();
    if (letters.length !== 2) return null;
    const pair = pairName(letters[0], letters[1]);
    if (!pair) return null;
    const [A, B] = LETTER_PAIRS[pair];
    const bySignature = (terms, powers) => terms.find((term) => term.signature === Object.entries(powers).map(([name, power]) => `${name}^${power}`).join(''))?.coefficient;
    const p = bySignature(general1, { [A]: 2 });
    const q = bySignature(general1, { [A]: 1, [B]: 1 });
    const r = bySignature(general1, { [B]: 2 });
    const s = bySignature(general2, { [A]: 2 });
    const u = bySignature(general2, { [B]: 2 });
    if ([p, q, r, s, u].some((value) => value === undefined)) return null;
    const X = onlyLetter([...list(line1), ...list(line2)]);
    const first = coefficientsByPower(line1, X, [2, 1]);
    const second = coefficientsByPower(line2, X, [2, 1]);
    if (!X || !first || !second || first[0] !== second[0]) return null;
    const params = { pair, p, q, r, s, u, X, m: first[0], v: first[1], w: second[1] };
    const answers = subtractAnswers(params);
    if (clean(fields[0].answer) !== answers.general || clean(fields[1].answer) !== answers.division) return null;
    if (!isOwnVersion(params, subtractForDivisionDomains(), subtractForDivisionRules)) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.divideByMonomial — DOL
 * ======================================================================== */

const SECOND_SHAPES = Object.freeze({ A: [1, 0], B: [0, 1] });
const monomialDivision = ({ pair, d, a, b, q1, i1, j1, q2, second, q3 }) => {
  const [A, B] = LETTER_PAIRS[pair];
  const [i2, j2] = SECOND_SHAPES[second];
  const divisor = [d, [[A, a], [B, b]]];
  const quotients = [[q1, [[A, i1], [B, j1]]], [q2, [[A, i2], [B, j2]]], [q3, []]];
  const numerator = quotients.map(([coefficient, letters]) => [coefficient * d, letters.map(([letter, power]) => [letter, power + (letter === A ? a : b)])]);
  // A constant quotient's term is the divisor itself (times ±1).
  numerator[2] = [q3 * d, [[A, a], [B, b]]];
  return { A, B, divisor, quotients, numerator };
};
const divideByMonomialAnswers = (values) => {
  const { quotients } = monomialDivision(values);
  return {
    t1: termAscii(...quotients[0]),
    t2: termAscii(...quotients[1]),
    t3: termAscii(...quotients[2]),
    quotient: polyAscii(quotients),
  };
};

const divideByMonomialDomains = () => ({
  pair: choiceDomain(['x/y', 'a/b', 'm/n']),
  d: intDomain(2, 9),
  a: intDomain(1, 2),
  b: intDomain(1, 2),
  q1: intDomain(2, 5),
  i1: intDomain(1, 2),
  j1: intDomain(1, 2),
  q2: intDomain(-9, -2),
  second: choiceDomain(Object.keys(SECOND_SHAPES)),
  q3: choiceDomain([1, -1]),
});
const divideByMonomialRules = ({ d, q1, q2 }) => {
  const issues = [];
  // Coefficients a student divides on paper.
  if (Math.abs(q1 * d) > 60 || Math.abs(q2 * d) > 60) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
  return issues;
};

export const divideByMonomialFamily = defineQuestionFamily({
  id: 'polynomials.divideByMonomial',
  version: 1,
  title: 'Divide a polynomial by a monomial',
  skill: {
    objective: 'Divide a polynomial by a monomial as a sum of quotients: divide EVERY term of the numerator by the monomial (divide the coefficients, subtract the exponents) — a term equal to the divisor leaves 1, not 0 — and write the quotient in simplest form.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  parameters: () => divideByMonomialDomains(),
  derive: () => ({}),
  rules: divideByMonomialRules,
  fingerprint: ({ pair, d, a, b, q1, i1, j1, q2, second, q3 }) => fingerprintOf('polynomials.divideByMonomial', [pair, d, a, b, q1, i1, j1, q2, second, q3]),
  answer: (values) => {
    const value = divideByMonomialAnswers(values);
    return { kind: 'fields', value, display: value.quotient };
  },
  tools: {
    multiAnswer: (values, { authored }) => {
      const { A, B, divisor, numerator } = monomialDivision(values);
      const answers = divideByMonomialAnswers(values);
      const letters = [A, B];
      const label = (index) => `${termPlain(...numerator[index])} ÷ ${termPlain(...divisor)}`;
      return {
        type: 'multiAnswer',
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: `Simplify $\\frac{${polyLatex(numerator)}}{${termLatex(...divisor)}}$. Write the fraction as a sum of quotients, divide each one, then write the quotient in simplest form.`,
        }),
        answerFields: [
          polynomialField('t1', label(0), answers.t1, letters),
          polynomialField('t2', label(1), answers.t2, letters),
          polynomialField('t3', label(2), answers.t3, letters),
          polynomialField('quotient', 'The quotient in simplest form', answers.quotient, letters),
        ],
      };
    },
  },
  defaultTool: 'multiAnswer',
  instanceFields: [...MULTI_ANSWER_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'multiAnswer') return null;
    const fields = list(question?.answerFields);
    if (fields.length !== 4 || !/^The quotient in simplest form$/.test(clean(fields[3]?.label))) return null;
    const parts = fields.slice(0, 3).map((field) => /^(.+) ÷ (.+)$/.exec(clean(field?.label)));
    if (parts.some((entry) => !entry)) return null;
    const read = parts.map((entry) => [readTerm(entry[1]), readTerm(entry[2])]);
    if (read.some(([top, bottom]) => !top || !bottom || !isInteger(top) || !isInteger(bottom))) return null;
    const divisor = read[0][1];
    if (read.some(([, bottom]) => bottom.signature !== divisor.signature || bottom.coefficient !== divisor.coefficient)) return null;
    const letters = lettersOf(divisor);
    if (letters.length !== 2) return null;
    const pair = pairName(letters[0], letters[1]);
    if (!pair) return null;
    const [A, B] = LETTER_PAIRS[pair];
    const quotient = (top) => (top.coefficient % divisor.coefficient === 0 ? {
      coefficient: top.coefficient / divisor.coefficient,
      i: powerOf(top, A) - powerOf(divisor, A),
      j: powerOf(top, B) - powerOf(divisor, B),
    } : null);
    const [first, second, third] = read.map(([top]) => quotient(top));
    if (!first || !second || !third || third.i !== 0 || third.j !== 0) return null;
    const shape = Object.keys(SECOND_SHAPES).find((name) => SECOND_SHAPES[name][0] === second.i && SECOND_SHAPES[name][1] === second.j);
    if (!shape) return null;
    const params = {
      pair,
      d: divisor.coefficient,
      a: powerOf(divisor, A),
      b: powerOf(divisor, B),
      q1: first.coefficient,
      i1: first.i,
      j1: first.j,
      q2: second.coefficient,
      second: shape,
      q3: third.coefficient,
    };
    const answers = divideByMonomialAnswers(params);
    if (['t1', 't2', 't3', 'quotient'].some((id, index) => clean(fields[index].answer) !== answers[id])) return null;
    if (!isOwnVersion(params, divideByMonomialDomains(), divideByMonomialRules)) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.longDivisionLinear — DOL (Polynomial Workshop, long division)
 * ======================================================================== */

// The rounds of (a3 x³ + a2 x² + a1 x + a0) ÷ (x − r): the work the
// workshop's Check sends, each line bringing down one term as on paper.
const cubicDivision = ({ a3, a2, a1, a0, r }) => {
  const q2 = a3;
  const q1 = a2 + r * q2;
  const q0 = a1 + r * q1;
  const remainder = a0 + r * q0;
  return { q2, q1, q0, remainder };
};
const longDivisionWork = (values) => {
  const { letter, a1, a0, r } = values;
  const { q2, q1, q0, remainder } = cubicDivision(values);
  const term = (coefficient, power) => termAscii(coefficient, power ? [[letter, power]] : []);
  return {
    terms: [term(q2, 2), term(q1, 1), term(q0, 0)],
    products: [polyAscii(descending(letter, [q2, -r * q2, 0, 0])), polyAscii(descending(letter, [q1, -r * q1, 0])), polyAscii(descending(letter, [q0, -r * q0]))],
    differences: [polyAscii(descending(letter, [q1, a1, 0])), polyAscii(descending(letter, [q0, a0])), String(remainder)],
    quotient: polyAscii(descending(letter, [q2, q1, q0])),
    remainder: String(remainder),
  };
};

const longDivisionLinearDomains = () => ({
  letter: choiceDomain([...ONE_LETTER]),
  a3: intDomain(1, 4),
  a2: intDomain(-9, 9),
  a1: intDomain(-9, 9),
  a0: intDomain(-9, 9, { exclude: [0] }),
  r: intDomain(-5, 5, { exclude: [0] }),
});
const longDivisionLinearRules = (values) => {
  const issues = [];
  const { a2, a1 } = values;
  // Exactly one power is missing: the placeholder is the point.
  if ((a2 === 0) === (a1 === 0)) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
  const { q1, q0, remainder } = cubicDivision(values);
  // Three rounds and a remainder, as the lesson's own has.
  if (q1 === 0 || q0 === 0 || remainder === 0) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
  if ([q1, q0, remainder].some((value) => Math.abs(value) > 60)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
  return issues;
};

export const longDivisionLinearFamily = defineQuestionFamily({
  id: 'polynomials.longDivisionLinear',
  version: 1,
  title: 'Long division of a cubic by x − r (a missing term)',
  skill: {
    objective: 'Divide a cubic polynomial with a missing term by x − r with long division: hold the missing power\'s place with a 0, and in every round divide the leading terms, multiply back, subtract and bring down the next term; then write the quotient and the remainder.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  parameters: () => longDivisionLinearDomains(),
  derive: () => ({}),
  rules: longDivisionLinearRules,
  fingerprint: ({ letter, a3, a2, a1, a0, r }) => fingerprintOf('polynomials.longDivisionLinear', [letter, a3, a2, a1, a0, r]),
  answer: (values) => {
    const value = longDivisionWork(values);
    return { kind: 'polynomialWorkshop', value, display: `${value.quotient} R ${value.remainder}` };
  },
  tools: {
    polynomialWorkshop: (values, { authored }) => {
      const { letter, a3, a2, a1, a0, r } = values;
      const dividend = descending(letter, [a3, a2, a1, a0]);
      const divisor = [[1, [[letter, 1]]], [-r, []]];
      return {
        type: 'polynomialWorkshop',
        mode: 'longDivision',
        dividend: polyAscii(dividend),
        divisor: polyAscii(divisor),
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: `Use long division to find $(${polyLatex(dividend)}) \\div (${polyLatex(divisor)})$. Show every round, then write the quotient and the remainder.`,
        }),
      };
    },
  },
  defaultTool: 'polynomialWorkshop',
  instanceFields: [...WORKSHOP_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'polynomialWorkshop' || clean(question?.mode) !== 'longDivision') return null;
    const dividendTerms = readTerms(question.dividend);
    const divisorTerms = readTerms(question.divisor);
    const letter = onlyLetter([...list(dividendTerms), ...list(divisorTerms)]);
    if (!letter) return null;
    const dividend = denseCoefficients(dividendTerms, letter, 3);
    const divisor = coefficientsByPower(divisorTerms, letter, [1, 0]);
    if (!dividend || !divisor || divisor[0] !== 1) return null;
    const [a3, a2, a1, a0] = dividend;
    const params = { letter, a3, a2, a1, a0, r: -divisor[1] };
    if (!isOwnVersion(params, longDivisionLinearDomains(), longDivisionLinearRules)) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

/* ===========================================================================
 * polynomials.syntheticDivision — DOL (Polynomial Workshop, synthetic division)
 * ======================================================================== */

const quarticTable = ({ a4, a3, a2, a1, a0, r }) => {
  const coefficients = [a4, a3, a2, a1, a0];
  const sums = [a4];
  const products = [];
  for (let index = 1; index < coefficients.length; index += 1) {
    products.push(r * sums[index - 1]);
    sums.push(coefficients[index] + products[index - 1]);
  }
  return { coefficients, products, sums };
};
const syntheticWork = (values) => {
  const { coefficients, products, sums } = quarticTable(values);
  return {
    r: String(values.r),
    coefficients: coefficients.map(String),
    products: products.map(String),
    sums: sums.map(String),
    quotient: polyAscii(descending(values.letter, sums.slice(0, 4))),
  };
};

const syntheticDivisionDomains = () => ({
  letter: choiceDomain([...ONE_LETTER]),
  a4: intDomain(1, 3),
  a3: intDomain(-9, 9),
  a2: intDomain(-9, 9),
  a1: intDomain(-9, 9),
  a0: intDomain(-9, 9, { exclude: [0] }),
  r: intDomain(-4, 4, { exclude: [0, 1] }),
});
const syntheticDivisionRules = (values) => {
  const issues = [];
  const { a3, a2, a1 } = values;
  // Exactly one of x³, x², x is missing: its 0 holds a column.
  if ([a3, a2, a1].filter((value) => value === 0).length !== 1) issues.push(FAMILY_ISSUE.TRIVIAL_INSTANCE);
  const { sums } = quarticTable(values);
  // A remainder to read, and numbers a student adds on paper.
  if (sums[4] === 0) issues.push(FAMILY_ISSUE.DEGENERATE_INSTANCE);
  if (sums.some((value) => Math.abs(value) > 99)) issues.push(FAMILY_ISSUE.VALUE_OUT_OF_RANGE);
  return issues;
};

export const syntheticDivisionFamily = defineQuestionFamily({
  id: 'polynomials.syntheticDivision',
  version: 1,
  title: 'Synthetic division of a quartic by x − r (a missing term)',
  skill: {
    objective: 'Divide a quartic polynomial with a missing term by x − r with synthetic division: find r from the divisor, write every coefficient with a 0 for the missing power, then bring down, multiply by r and add column by column; read the quotient (one degree lower) and the remainder from the bottom row.',
    alignments: TEKS,
    strand: STRAND,
  },
  difficulty: { band: 2, dok: 2 },
  constraints: {},
  parameters: () => syntheticDivisionDomains(),
  derive: () => ({}),
  rules: syntheticDivisionRules,
  fingerprint: ({ letter, a4, a3, a2, a1, a0, r }) => fingerprintOf('polynomials.syntheticDivision', [letter, a4, a3, a2, a1, a0, r]),
  answer: (values) => {
    const value = syntheticWork(values);
    return { kind: 'polynomialWorkshop', value, display: `${value.quotient} R ${value.sums[4]}` };
  },
  tools: {
    polynomialWorkshop: (values, { authored }) => {
      const { letter, a4, a3, a2, a1, a0, r } = values;
      const dividend = descending(letter, [a4, a3, a2, a1, a0]);
      const divisor = [[1, [[letter, 1]]], [-r, []]];
      return {
        type: 'polynomialWorkshop',
        mode: 'syntheticDivision',
        dividend: polyAscii(dividend),
        divisor: polyAscii(divisor),
        prompt: composeFamilyPrompt({
          authored: authored?.prompt,
          fallback: `Use synthetic division to find $(${polyLatex(dividend)}) \\div (${polyLatex(divisor)})$. Fill in r and every number of the synthetic division, then write the quotient.`,
        }),
      };
    },
  },
  defaultTool: 'polynomialWorkshop',
  instanceFields: [...WORKSHOP_INSTANCE_FIELDS],
  recognize: (question) => {
    if (clean(question?.type) !== 'polynomialWorkshop' || clean(question?.mode) !== 'syntheticDivision') return null;
    const dividendTerms = readTerms(question.dividend);
    const divisorTerms = readTerms(question.divisor);
    const letter = onlyLetter([...list(dividendTerms), ...list(divisorTerms)]);
    if (!letter) return null;
    const dividend = denseCoefficients(dividendTerms, letter, 4);
    const divisor = coefficientsByPower(divisorTerms, letter, [1, 0]);
    if (!dividend || !divisor || divisor[0] !== 1) return null;
    const [a4, a3, a2, a1, a0] = dividend;
    const params = { letter, a4, a3, a2, a1, a0, r: -divisor[1] };
    if (!isOwnVersion(params, syntheticDivisionDomains(), syntheticDivisionRules)) return null;
    return { params, constraints: {} };
  },
  recovery: { eligible: true },
});

export const POLYNOMIAL_DIVISION_FAMILIES = Object.freeze([
  divideMonomialsFamily,
  distributeMonomialFamily,
  subtractForDivisionFamily,
  divideByMonomialFamily,
  longDivisionLinearFamily,
  syntheticDivisionFamily,
]);

export default POLYNOMIAL_DIVISION_FAMILIES;
