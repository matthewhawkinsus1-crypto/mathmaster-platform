/*
 * DOES THIS HINT STATE AN ANSWER, OR DO THE STEP? (2026-11-06 walkthrough of
 * Algebra II Honors module 2, "hints that hand over a step", for Operations on
 * Polynomials.)
 *
 *   answersStated(sentence, question)          → ['box (key)', …]
 *   stepsDone(sentence, question, work)        → ['result', …]
 *   writesMathematics(sentence, question)      → true when it writes an expression with a letter, or a card
 *   stepResults(work)                          → { polynomials, monomials }
 *
 * boxesStated.mjs reads a box by the radicals grader and inequalityAnswersStated.mjs
 * by the inequality grader. Every box of this lesson is a polynomial, a number or a
 * choice:
 *   - a polynomial box is stated by any expression the sentence writes with the
 *     key's value that the problem does not show: "12x + 11(15 − x)" states
 *     x + 165, unsimplified;
 *   - a number box is read as the leak guard reads it;
 *   - a choice is stated when the sentence writes its right option: by value when
 *     the option is mathematics ("7p(3p − 4)(2p²)" states 42p⁴ − 56p³), by the
 *     leak guard when it is a number, by its words otherwise.
 *
 * A step is done when the sentence writes one of the step's results that the
 * problem does not show. The results come from `work`, the expressions the item
 * asks the student to work, written out from the problem (never from a key):
 * the opposite of a polynomial subtracted, a product distributed, each product
 * of two terms and its letters, and the answer and its terms. A result counts as
 * written only in simplest form, as a whole or as one term of what the sentence
 * writes, so "What is 5c · 2c²?" asks and "10c³" tells; "7n − 9n" tells both
 * middle products. A lone letter is a name, and a number is read only by the
 * box rules above.
 *
 * Whatever the problem shows is quoted, not stated: the prompt, the labels and a
 * Workshop's own polynomials, read whole and with their signs ("3a" is not
 * quoted by "−3a"). Test code only.
 */
import { expandLatexShorthand, parsePolynomial, samePolynomial } from '../../../functions/shared/algebraicForm.mjs';
import { isSimplifiedPolynomial } from '../../../functions/shared/simplifiedPolynomialForm.mjs';
import { unicodeSuperscriptsToMathMarkup } from '../../../src/mathDisplayFormat.js';
import { statedAnswers } from '../../../src/platform/supports/hints/hintLeakGuard.js';
import { questionDisplayText, questionVisibleText } from '../../../src/platform/supports/hints/questionHints.js';

const list = (value) => (Array.isArray(value) ? value : []);

/* ------------------------------------------------- reading the mathematics */

// Mathematics as these checks read it: superscripts as powers, no LaTeX
// delimiters, one minus sign, one multiplication sign, a one-character power
// without braces ("x^{2}" and "x²" are both x^2).
const asMath = (text) => expandLatexShorthand(unicodeSuperscriptsToMathMarkup(String(text ?? ''), 'latex'))
  .replace(/\$/g, '')
  .replace(/\\left|\\right/g, '')
  .replace(/[−–]/g, '-')
  .replace(/·|×|\\cdot|\\times/g, '*')
  .replace(/\^\{([0-9A-Za-z])\}/g, '^$1');

// A word is mathematics when it is one letter, or holds a digit, an operator or
// a bracket, is made of nothing else, and has no word of three letters in it.
const isMathToken = (token) => {
  if (/^[A-Za-z]$/.test(token)) return true;
  return /^[0-9A-Za-z.^(){}*/=+-]+$/.test(token) && /[0-9^(){}*/=+-]/.test(token) && !/[A-Za-z]{3}/.test(token);
};

/**
 * The runs of mathematics a text writes, each without its spaces. Punctuation
 * after a word ends a run, and so do two operands with no operator between
 * them: in "Is √(m − 7) a polynomial?" the article "a" is not a factor of 7.
 */
const mathRuns = (text) => {
  const runs = [];
  let run = [];
  const close = () => {
    if (run.length) runs.push(run.join(''));
    run = [];
  };
  asMath(text).split(/\s+/).filter(Boolean).forEach((word) => {
    const token = word.replace(/[.,;:?!"”’]+$/, '').replace(/^["“‘]+/, '');
    if (!token || !isMathToken(token)) { close(); return; }
    const previous = run[run.length - 1];
    if (previous && !/[(*/=+^-]$/.test(previous) && !/^[)*/=+^-]/.test(token)) close();
    run.push(token);
    if (token !== word.replace(/^["“‘]+/, '')) close();
  });
  close();
  return runs.map((value) => value.replace(/^[+*/=]+|[+*/=-]+$/g, '')).filter(Boolean);
};

/** Split at the + and − that join terms: not inside brackets, not a power's or a factor's sign. */
const topLevelTerms = (side) => {
  const terms = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < side.length; index += 1) {
    const char = side[index];
    if (char === '(' || char === '{') depth += 1;
    else if (char === ')' || char === '}') depth -= 1;
    else if ((char === '+' || char === '-') && depth === 0 && index > start && !/[\^*/]/.test(side[index - 1])) {
      terms.push(side.slice(start, index));
      start = index;
    }
  }
  terms.push(side.slice(start));
  return terms.map((term) => term.replace(/^\+/, '')).filter(Boolean);
};

const hasLetter = (text) => /[A-Za-z]/.test(text);
const isLoneLetter = (text) => /^[A-Za-z]$/.test(text);
const readPolynomial = (text) => {
  try {
    return parsePolynomial(text);
  } catch {
    return null;
  }
};
const inSimplestForm = (text) => {
  try {
    return isSimplifiedPolynomial(text);
  } catch {
    return false;
  }
};

/**
 * What a sentence writes: each side of each equation in it, with its value,
 * whether it follows an "=", and each of its terms. A lone letter is a name,
 * not an expression.
 */
const writtenIn = (sentence) => mathRuns(sentence)
  .flatMap((run) => run.split('=').map((side, index) => ({ side: side.replace(/^\+/, ''), afterEquals: index > 0 })))
  .filter(({ side }) => side && !isLoneLetter(side))
  .map(({ side, afterEquals }) => ({
    text: side,
    afterEquals,
    value: readPolynomial(side),
    simplest: inSimplestForm(side),
    terms: topLevelTerms(side)
      .filter((term) => hasLetter(term) && !isLoneLetter(term) && inSimplestForm(term))
      .map((term) => ({ text: term, value: readPolynomial(term) }))
      .filter((term) => term.value),
  }));

/* ------------------------------------------------ what the problem shows */

const workshopText = (question) => ['firstPolynomial', 'secondPolynomial', 'leftFactor', 'rightFactor']
  .map((key) => question[key]).filter((value) => typeof value === 'string');
const shownRuns = (question) => mathRuns([questionVisibleText(question), questionDisplayText(question), ...workshopText(question)].join('\n'));

const BEFORE = /[0-9A-Za-z^.\\]/;
const AFTER = /[0-9A-Za-z^.({]/;
/** `piece` is written whole in `run`, with its own sign: "3a" is not in "-3a", "x^2" not in "3x^2". */
const writesWhole = (run, piece) => {
  for (let at = run.indexOf(piece); at !== -1; at = run.indexOf(piece, at + 1)) {
    const before = run[at - 1] || '';
    const after = run[at + piece.length] || '';
    if (!/^[-+]/.test(piece) && (before === '-' || BEFORE.test(before))) continue;
    if (AFTER.test(after)) continue;
    return true;
  }
  return false;
};
const quotedBy = (question) => {
  const shown = shownRuns(question);
  return (piece) => shown.some((run) => writesWhole(run, piece));
};

/* ------------------------------------------------------------ the steps */

const constant = (value) => new Map(value === 0 ? [] : [['', value]]);
const add = (left, right) => {
  const out = new Map(left);
  right.forEach((value, key) => out.set(key, (out.get(key) || 0) + value));
  [...out].forEach(([key, value]) => { if (Math.abs(value) < 1e-9) out.delete(key); });
  return out;
};
const multiply = (left, right) => readPolynomial(`(${polynomialText(left)})*(${polynomialText(right)})`);
const termsOf = (polynomial) => [...polynomial].map(([key, value]) => new Map([[key, value]]));
const hasLetters = (polynomial) => [...polynomial.keys()].some(Boolean);
const polynomialText = (polynomial) => (polynomial.size
  ? [...polynomial].map(([key, value]) => (key ? `(${value})*${key}` : `(${value})`)).join('+')
  : '0');
// The letters of a term: −12x⁷ has x⁷; −10a⁴b³ has a⁴b³, a⁴ and b³.
const lettersOf = (term) => {
  const [[key]] = [...term];
  if (!key) return [];
  const powers = [...key.matchAll(/([a-z])(\^\d+)?/g)].map(([whole]) => whole);
  return [key, ...(powers.length > 1 ? powers : [])].map((letters) => new Map([[letters, 1]]));
};

/** "4(a^2+5a-6)-3(2a^3+4a-5)" → its signed products, each a list of factors as text (a power repeats its base). */
const productsOf = (expression) => topLevelTerms(expression.replace(/\s+/g, '')).map((term) => {
  const negative = term.startsWith('-');
  const body = term.replace(/^-/, '');
  const factors = [];
  for (let index = 0; index < body.length;) {
    let factor;
    if (body[index] === '(') {
      let depth = 0;
      let end = index;
      for (; end < body.length; end += 1) {
        if (body[end] === '(') depth += 1;
        if (body[end] === ')') depth -= 1;
        if (depth === 0) break;
      }
      factor = body.slice(index, end + 1);
      index = end + 1;
    } else {
      const match = /^[0-9.]*(?:[a-z](?:\^\d+)?)*/.exec(body.slice(index));
      if (!match[0]) throw new Error(`cannot read the factor at "${body.slice(index)}" of ${expression}`);
      factor = match[0];
      index += match[0].length;
    }
    const power = /^\^(\d+)/.exec(body.slice(index));
    if (power) index += power[0].length;
    for (let count = 0; count < (power ? Number(power[1]) : 1); count += 1) factors.push(factor);
  }
  if (!negative) return factors;
  // A minus before a bracket is a product by −1 (its result is the opposite);
  // before a number or a term it is that factor's own sign.
  return factors[0].startsWith('(') ? ['-1', ...factors] : [`-${factors[0]}`, ...factors.slice(1)];
});

/**
 * Every result of working these expressions: each product of two terms and its
 * letters, each product distributed (left to right), each opposite (a product
 * by −1), each term's value and the sum, and every term of those.
 */
export const stepResults = (work = []) => {
  const polynomials = [];
  const monomials = [];
  list(work).forEach((expression) => {
    let total = constant(0);
    productsOf(expression).forEach((factors) => {
      const values = factors.map((factor) => {
        const value = readPolynomial(factor);
        if (!value) throw new Error(`cannot read ${factor} in ${expression}`);
        return value;
      });
      let running = values[0];
      values.slice(1).forEach((next) => {
        termsOf(running).forEach((left) => termsOf(next).forEach((right) => {
          const product = multiply(left, right);
          monomials.push(product);
          // Letters combine only when both terms have some: x² · x⁵ makes x⁷,
          // but −1 · 4x² leaves x² as it was.
          if (hasLetters(left) && hasLetters(right)) monomials.push(...lettersOf(product));
        }));
        running = multiply(running, next);
        polynomials.push(running);
      });
      total = add(total, running);
    });
    polynomials.push(total);
  });
  polynomials.forEach((polynomial) => monomials.push(...termsOf(polynomial)));
  const withLetters = (entries) => entries.filter((entry) => [...entry.keys()].some(Boolean));
  return { polynomials: withLetters(polynomials), monomials: withLetters(monomials) };
};

/* ------------------------------------------------------------- verdicts */

const same = (left, right) => Boolean(left && right) && samePolynomial(left, right);
// A choice is mathematics when every word of it is ("42p⁴ − 56p³", "6"); words otherwise.
const isMathematics = (text) => String(text).trim().split(/\s+/).every((word) => isMathToken(asMath(word)));
const words = (text) => asMath(text).toLowerCase().replace(/\s+/g, ' ').trim();

/** The boxes whose answer this sentence states, as 'id (key)'. */
export const answersStated = (sentence, question) => {
  const quoted = quotedBy(question);
  const written = writtenIn(sentence).filter((piece) => piece.value && !quoted(piece.text));
  const leakGuardStates = (value) => statedAnswers(sentence, {
    answers: [value],
    visibleText: questionVisibleText(question),
    displayText: questionDisplayText(question),
  }).length > 0;
  return list(question.answerFields).filter((field) => {
    const key = String(field.answer);
    const keyValue = readPolynomial(asMath(key));
    if (field.type === 'choice') {
      if (!isMathematics(key) || !keyValue) return words(sentence).includes(words(key));
      return hasLetter(key) ? written.some((piece) => same(piece.value, keyValue)) : leakGuardStates(key);
    }
    if (field.inputProfile === 'number' || !hasLetter(key)) return leakGuardStates(key);
    return written.some((piece) => same(piece.value, keyValue));
  }).map((field) => `${field.id} (${field.answer})`);
};

// Bare letters with no number ("x²", "a⁴b³") are how a sentence names a kind of
// term ("the x² terms"); they state a result only after an "=" ("a³ · a = a⁴").
const bareLetters = (value) => value.size === 1 && [...value].every(([key, coefficient]) => key && coefficient === 1);

/** The results of the item's steps that this sentence writes and the problem does not show. */
export const stepsDone = (sentence, question, work = []) => {
  const quoted = quotedBy(question);
  const { polynomials, monomials } = stepResults(work);
  const results = [...polynomials, ...monomials];
  const found = new Set();
  writtenIn(sentence).forEach((piece) => {
    if (!piece.value || quoted(piece.text)) return;
    if (piece.simplest) {
      // Written as a result: the whole of it ("−6a³ − 12a + 15", "x³", "−4y³").
      if (hasLetter(piece.text) && (piece.afterEquals || !bareLetters(piece.value))
        && results.some((result) => same(result, piece.value))) found.add(piece.text);
      return;
    }
    // Left uncombined, each term is one already worked out ("7n − 9n").
    piece.terms.filter((term) => !quoted(term.text) && !bareLetters(term.value)
      && monomials.some((result) => same(result, term.value)))
      .forEach((term) => found.add(term.text));
  });
  return [...found];
};

/** Does this sentence write mathematics with a letter in it, or one of the sort's cards? */
export const writesMathematics = (sentence, cards = []) => {
  if (writtenIn(sentence).some((piece) => hasLetter(piece.text))) return true;
  const flat = (text) => asMath(text).replace(/\s+/g, '');
  return list(cards).filter((card) => /[A-Za-z+-]/.test(flat(card)))
    .some((card) => flat(sentence).includes(flat(card)));
};
