/*
 * FRACTION QUESTIONS: WHAT THE AUTHOR WROTE, AND HOW A NUMBER IS WRITTEN.
 *
 * The `fraction` question type is touched by the generator
 * (src/problemGenerator.js), the grader (ordinaryResponseGrading.mjs), the
 * screen (src/FractionGrader.jsx), the solution review, the authoring
 * validator (src/assignmentBlueprint.js) and the "can this question vary"
 * rules (questionVariability.mjs). They must agree on two things, so both are
 * decided here and nowhere else.
 *
 * 1. WHAT KIND OF FRACTION QUESTION IS THIS?  `fractionQuestionShape`
 *
 *      operands         the author wrote the sum: n1/d1 + n2/d2.
 *      authored-answer  the author wrote the answer (`answer`,
 *                       `acceptedAnswers`, or `ansNum`/`ansDen`), and the
 *                       prompt says what to do.
 *      drill            the author wrote neither; each student gets a random
 *                       sum to add.
 *
 *    Only a drill may draw numbers. Generation used to draw a random sum for
 *    EVERY fraction question, overwriting the author's numbers: a student was
 *    shown the authored prompt beside a random "a/b + c/d =" and graded on the
 *    random sum, while the authored answer was ignored.
 *
 * 2. HOW IS THIS NUMBER WRITTEN?  `parseWrittenNumber`, `isWrittenInLowestTerms`
 *
 *    The type's catalog promise is "a fraction in lowest terms". The shared
 *    value comparison (answerUtils.compareMathAnswer) decides whether two
 *    answers are the same NUMBER and deliberately forgets how each was
 *    written, so it cannot tell 3/4 from 6/8 or 0.75. This reads the written
 *    form, in every spelling a student or the math editor produces for one
 *    signed number: 3/4, -3/4, (-3)/4, \frac{3}{4}, \dfrac / \tfrac, MathLive's
 *    compact \frac34, -\frac{3}{4}, \frac{-3}{4}, \left( \right) brackets, a
 *    typographic minus, integers and decimals. Anything else — a letter, an
 *    operator other than one fraction bar, a zero denominator, a mixed number —
 *    is not read at all (null), never guessed at.
 *
 * Pure: no mathjs, no DOM, no clock. Imported by src/ and functions/.
 */

export const FRACTION_QUESTION_SHAPES = Object.freeze({
  OPERANDS: 'operands',
  AUTHORED_ANSWER: 'authored-answer',
  DRILL: 'drill',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const list = (value) => (Array.isArray(value) ? value : []);

const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

/* ---------------------------------------------------------------------------
 * Written numbers.
 * ------------------------------------------------------------------------- */

// Invisible characters an editor or IME can leave between visible tokens.
const INVISIBLE = /[​-‏‪-‮⁠-⁯﻿]/g;
// Typographic minus signs: the same set answerEquivalence.mjs reads as '-'.
const MINUS_SIGNS = /[−–—]/g;

const prepare = (text) => text
  .replace(INVISIBLE, '')
  .replace(MINUS_SIGNS, '-')
  .replace(/\\lparen/g, '(')
  .replace(/\\rparen/g, ')')
  // `\left(` and `\right)` size a bracket; they are not part of the number.
  .replace(/\\(?:left|right)(?=\s*[()])/g, '')
  // LaTeX spacing commands are typography, not mathematics.
  .replace(/\\[,;:! ]/g, ' ');

const TOKEN_RULES = [
  { pattern: /^\s+/, token: null },
  { pattern: /^\\[dt]?frac(?![A-Za-z])/, token: () => ({ kind: 'frac' }) },
  { pattern: /^(?:\d+(?:\.\d+)?|\.\d+)/, token: (text) => ({ kind: 'number', text }) },
  { pattern: /^[-/(){}]/, token: (text) => ({ kind: text }) },
];

const tokenize = (text) => {
  const tokens = [];
  let rest = text;
  while (rest) {
    let matched = null;
    for (const rule of TOKEN_RULES) {
      const match = rule.pattern.exec(rest);
      if (match) {
        matched = match[0];
        if (rule.token) tokens.push(rule.token(matched));
        break;
      }
    }
    // A letter, another operator, a LaTeX command this does not read.
    if (!matched) return null;
    rest = rest.slice(matched.length);
  }
  return tokens;
};

const DIGITS = /^\d+$/;

/*
 * One recursive-descent pass over the tokens. A written number is
 *
 *   value    := '-'? ( '(' value ')' | \frac arg arg | number ) ( '/' integer )?
 *   integer  := '-'? ( digits | '(' integer ')' )
 *   arg      := '{' integer '}' | one digit            (`\frac34` is 3 over 4)
 *
 * where only a whole number may stand over a fraction bar, and the numerator
 * side carries at most one sign (`-(-3)/4` is not a form anyone writes).
 */
const readWrittenNumber = (tokens) => {
  let index = 0;
  const peek = () => tokens[index];
  const accept = (kind) => (tokens[index]?.kind === kind ? tokens[index++] : null);

  const integer = () => {
    const minus = Boolean(accept('-'));
    if (accept('(')) {
      const inner = integer();
      if (!inner || !accept(')') || (minus && inner.negative)) return null;
      return { magnitude: inner.magnitude, negative: minus || inner.negative };
    }
    const token = accept('number');
    if (!token || !DIGITS.test(token.text)) return null;
    return { magnitude: Number(token.text), negative: minus };
  };

  // One argument of \frac: braced, or — as MathLive writes single digits,
  // `\frac34` — exactly one character, because that is how LaTeX reads it.
  const fracArgument = () => {
    if (accept('{')) {
      const inner = integer();
      return inner && accept('}') ? inner : null;
    }
    const token = peek();
    if (token?.kind !== 'number' || !DIGITS.test(token.text)) return null;
    if (token.text.length === 1) index += 1;
    else tokens[index] = { kind: 'number', text: token.text.slice(1) };
    return { magnitude: Number(token.text[0]), negative: false };
  };

  const value = () => {
    const minus = Boolean(accept('-'));
    let written;
    if (accept('(')) {
      written = value();
      if (!written || !accept(')')) return null;
    } else if (accept('frac')) {
      const numerator = fracArgument();
      const denominator = numerator && fracArgument();
      if (!denominator) return null;
      written = { form: 'fraction', numerator, denominator };
    } else {
      const token = accept('number');
      if (!token) return null;
      if (DIGITS.test(token.text)) {
        written = { form: 'integer', numerator: { magnitude: Number(token.text), negative: false }, denominator: { magnitude: 1, negative: false } };
      } else {
        const [whole, places] = token.text.split('.');
        written = {
          form: 'decimal',
          text: whole ? token.text : `0${token.text}`,
          numerator: { magnitude: Number(`${whole}${places}`), negative: false },
          denominator: { magnitude: 10 ** places.length, negative: false },
        };
      }
    }
    if (minus) {
      if (written.numerator.negative) return null;
      written = { ...written, numerator: { ...written.numerator, negative: true } };
    }
    if (peek()?.kind === '/') {
      if (written.form !== 'integer') return null;
      index += 1;
      const denominator = integer();
      if (!denominator) return null;
      written = { form: 'fraction', numerator: written.numerator, denominator };
    }
    return written;
  };

  const written = value();
  return written && index === tokens.length ? written : null;
};

/**
 * Read one written number.
 *
 * Returns null for anything that is not exactly one signed integer, decimal or
 * fraction. Otherwise:
 *
 *   value        the exact rational it is worth, reduced, `d` > 0: {n, d}
 *   form         'integer' | 'fraction' | 'decimal'
 *   numerator    as written; a sign in front of the whole fraction is the
 *                numerator's (-3/4, -\frac{3}{4} and \frac{-3}{4} all read -3)
 *   denominator  as written, sign included (3/-4 reads -4); 1 for an integer,
 *                a power of ten for a decimal
 *   latex        the same number as display LaTeX, a fraction stacked
 */
export const parseWrittenNumber = (raw) => {
  if (typeof raw !== 'string' && !isNumber(raw)) return null;
  const tokens = tokenize(prepare(String(raw)));
  if (!tokens?.length) return null;
  const written = readWrittenNumber(tokens);
  if (!written) return null;

  const { numerator, denominator } = written;
  if (!Number.isSafeInteger(numerator.magnitude) || !Number.isSafeInteger(denominator.magnitude)) return null;
  if (denominator.magnitude === 0) return null;

  const signedNumerator = numerator.negative && numerator.magnitude !== 0 ? -numerator.magnitude : numerator.magnitude;
  const signedDenominator = denominator.negative ? -denominator.magnitude : denominator.magnitude;
  const divisor = gcd(signedNumerator, signedDenominator);
  const negative = signedNumerator !== 0 && (signedNumerator < 0) !== (signedDenominator < 0);
  const sign = signedNumerator < 0 ? '-' : '';
  let latex = String(signedNumerator);
  if (written.form === 'fraction') latex = `${sign}\\frac{${Math.abs(signedNumerator)}}{${signedDenominator}}`;
  else if (written.form === 'decimal') latex = `${sign}${written.text}`;

  return {
    value: {
      n: negative ? -(Math.abs(signedNumerator) / divisor) : Math.abs(signedNumerator) / divisor,
      d: Math.abs(signedDenominator) / divisor,
    },
    form: written.form,
    numerator: signedNumerator,
    denominator: signedDenominator,
    latex,
  };
};

/**
 * Is this written the way "a fraction in lowest terms" asks?
 *
 * An integer is (3 is the lowest-terms form of 6/2). A fraction is when its
 * denominator is greater than one, shares no factor with its numerator, and
 * carries no sign — the sign belongs in front or on the numerator. So 6/8
 * (reducible), 4/1 (a whole number over one), 3/-4 (a signed denominator)
 * and every decimal are not.
 */
export const isWrittenInLowestTerms = (raw) => {
  const written = parseWrittenNumber(raw);
  if (!written) return false;
  if (written.form === 'integer') return true;
  return written.form === 'fraction'
    && written.denominator > 1
    && gcd(written.numerator, written.denominator) === 1;
};

/**
 * The same number written the same way, up to spelling: 6/8, \frac{6}{8},
 * \frac68 and (6)/(8) are one written form; 3/4 is a different one. A sign in
 * front and a sign on the numerator are the same form, a signed denominator
 * is not. Decimals and integers compare by value.
 */
export const sameWrittenNumber = (left, right) => {
  const a = parseWrittenNumber(left);
  const b = parseWrittenNumber(right);
  if (!a || !b || a.form !== b.form) return false;
  if (a.form === 'fraction') return a.numerator === b.numerator && a.denominator === b.denominator;
  return a.value.n === b.value.n && a.value.d === b.value.d;
};

/** Display LaTeX for an authored answer; text that is not a number passes through. */
export const writtenNumberLatex = (raw) => parseWrittenNumber(raw)?.latex ?? String(raw ?? '').trim();

/* ---------------------------------------------------------------------------
 * Fraction questions.
 * ------------------------------------------------------------------------- */

/** All four operands of an authored sum n1/d1 + n2/d2, as usable numbers. */
export const hasFractionOperands = (question) => isObject(question)
  && [question.n1, question.d1, question.n2, question.d2].every(isNumber)
  && question.d1 !== 0
  && question.d2 !== 0;

const hasAnswerKeyNumbers = (question) => isObject(question)
  && isNumber(question.ansNum)
  && isNumber(question.ansDen)
  && question.ansDen !== 0;

const isAuthoredValue = (value) => (typeof value === 'string' && value.trim() !== '') || isNumber(value);

/**
 * Every answer the author wrote, primary first: `answer`, then
 * `acceptedAnswers`, then `ansNum`/`ansDen` as a stacked fraction.
 */
export const fractionAnswerCandidates = (question) => {
  if (!isObject(question)) return [];
  const candidates = [question.answer, ...list(question.acceptedAnswers)]
    .filter(isAuthoredValue)
    .map((value) => String(value).trim());
  if (hasAnswerKeyNumbers(question)) candidates.push(`\\frac{${question.ansNum}}{${question.ansDen}}`);
  return [...new Set(candidates)];
};

export const fractionQuestionShape = (question) => {
  if (hasFractionOperands(question)) return FRACTION_QUESTION_SHAPES.OPERANDS;
  if (fractionAnswerCandidates(question).length) return FRACTION_QUESTION_SHAPES.AUTHORED_ANSWER;
  return FRACTION_QUESTION_SHAPES.DRILL;
};

/**
 * The key of an authored sum: the author's `ansNum`/`ansDen` when they gave a
 * usable pair, otherwise n1/d1 + n2/d2 over the common denominator d1·d2 —
 * exactly what a drill computes for its own random operands.
 */
export const fractionSumAnswerKey = (question) => (hasAnswerKeyNumbers(question)
  ? { ansNum: question.ansNum, ansDen: question.ansDen }
  : { ansNum: question.n1 * question.d2 + question.n2 * question.d1, ansDen: question.d1 * question.d2 });

/**
 * Must the student's answer be written in lowest terms?
 *
 * Only when the author's own primary answer is: an author who wrote 3/4 for
 * "simplify" asked for it, an author who wrote 6/8 (or 0.75) did not. A
 * drill keeps its long-standing rule — any answer worth the sum.
 */
export const fractionAnswerRequiresLowestTerms = (question) => (
  fractionQuestionShape(question) === FRACTION_QUESTION_SHAPES.AUTHORED_ANSWER
  && isWrittenInLowestTerms(fractionAnswerCandidates(question)[0])
);

/**
 * Will generation draw random numbers for this fraction question?
 *
 * Only a drill does. With variants, generation first picks one and merges it
 * over the question, so any variant that is still a drill can.
 */
export const fractionQuestionDrawsNumbers = (question) => {
  if (!isObject(question)) return false;
  const variants = list(question.variants).filter(isObject);
  if (!variants.length) return fractionQuestionShape(question) === FRACTION_QUESTION_SHAPES.DRILL;
  const { variants: _variants, ...base } = question;
  return variants.some((variant) => fractionQuestionShape({ ...base, ...variant }) === FRACTION_QUESTION_SHAPES.DRILL);
};
