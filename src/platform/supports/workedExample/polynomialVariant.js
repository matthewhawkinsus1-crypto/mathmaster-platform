/*
 * "PRACTISE ONE LIKE THIS" FOR POLYNOMIAL ARITHMETIC (numericVariant.js's
 * second kind): THE ITEM ITSELF, WITH NEW NUMBERS.
 *
 *   buildPolynomialVariant(question, { seed }) → { prompt, steps, answer, kind } | null
 *   readPolynomialItem(question)               → the item's polynomial work, or null
 *
 * Algebra II Honors Operations on Polynomials (the 2026-11-06 walkthrough):
 * none of its Classwork and Practice items had a question family, so a
 * student who missed an item's last try got the worked solution and nothing
 * to try again. Its arithmetic items have a shape a variant can keep exactly:
 *
 *   a sum or a difference            (2a³ + 5a − 7) − (a³ − 3a + 2)
 *   a monomial times a polynomial    −y(4y² + 2y − 3), 3p(np − z)
 *   a product of polynomials         (n − 9)(n + 7), (x − y)(x² + 2xy + y²)
 *   a square or a cube               (4n − 5)², (4n − 5)³
 *   distributed, then combined       4(a² + 5a − 6) − 3(2a³ + 4a − 5)
 *
 * WHERE THE WORK IS READ. A Polynomial Workshop item (add and subtract, or the
 * area model) names its polynomials in its own fields, and its prompt must
 * write the whole operation as mathematics. A multi-answer item's box names
 * its expression in its label ("Simplify (3x² + 2x − 3) − (4x² + x − 5)",
 * "Step 1: (4n − 5)², in simplest form"), or, when it is the item's one box
 * and its label is only words ("Simplified expression"), in the prompt's one
 * piece of mathematics. A box is read only when it asks for a polynomial in
 * simplest form and the expression read has exactly its key's value, with
 * the key's letters: the key confirms the reading. Every typed box must be
 * read. A choice is left out: CW 11's "How many products?" has the same
 * answer, 6, for every problem of its shape, so asking it again would ask
 * the item's own answer.
 *
 * NOT VARIED: a word problem or an error analysis (a prompt with numbers
 * outside its mathematics, or one that names its polynomials one at a time
 * and the operation in words, like PR 6's two balls: new numbers would
 * contradict the story), a family slot, a decimal or a fraction, a box that
 * asks for a number, a degree or only a choice, and Dividing Polynomials
 * (each of its boxes divides, or is words).
 *
 * THE SAME SHAPE, NEVER EASIER. Every polynomial keeps its terms, letters and
 * exponents in its order, and every coefficient its sign. A coefficient 1
 * that leads a polynomial or multiplies one (the x² of x² − 5x + 2, the −y of
 * −y(…)) stays 1; a later 1 may become 1 to 4; any other coefficient moves at
 * most one down or two up, never below 2. Their sizes add up to at least the
 * item's, and a polynomial whose coefficients share a factor appears only
 * where the item's does. Each answer has exactly the item's terms, with the
 * item's signs: what cancels in the item cancels in the variant (PR 7's
 * (m² − m + 1)(m + 1) = m³ + 1 becomes (m² − 2m + 4)(m + 2) = m³ + 8), and
 * nothing else does. Its coefficients stay within twice the item's largest, or
 * 20 more. A polynomial the item writes twice is one polynomial in the variant
 * too: both of CW 5's differences subtract 4x² + x − 5, and PR 12 squares and
 * then cubes 4n − 5.
 *
 * NEVER A GIVE-AWAY. No answer of the variant equals a key of the item, and no
 * piece of mathematics it writes (prompt, steps, answer) has a key's value,
 * however it is spelled. The guard every family sibling passes
 * (similarExampleIsSafe) runs too.
 *
 * VERIFIED. Each answer is computed exactly, then checked three ways: the
 * expression as the prompt writes it, read back by the platform's own reader
 * (parsePolynomial), has the answer's value; a Workshop item's own key for the
 * new polynomials (addSubtractKey, areaModelKey) is the answer; and a typed
 * box's own grader (gradeMultiAnswerResponse, its simplest-form rule
 * included) marks the answer right, and the answer with its constant term
 * moved by one, or the item's own key, wrong.
 *
 * THE ITEM'S METHOD. The steps write the opposite of every term subtracted,
 * every product of the area model, every distribution, and the like terms
 * grouped before they combine. Every "=" in them is true
 * (tests/platform/practiceLikeThisPolynomials.test.mjs reads each one).
 *
 * NOTHING HERE IS RECORDED. It returns values, like numericVariant.js.
 */
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { isFamilyBackedQuestion } from '../../../../functions/shared/questionFamilySlot.mjs';
import { parsePolynomial, samePolynomial } from '../../../../functions/shared/algebraicForm.mjs';
import { gradeMultiAnswerResponse } from '../../../../functions/shared/ordinaryResponseGrading.mjs';
import { addSubtractKey, areaModelKey } from '../../../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { questionAnswerValues } from '../hints/questionHints.js';
import { similarExampleIsSafe } from './similarProblem.js';

export const POLYNOMIAL_VARIANT_KIND = 'polynomial';

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

/* ------------------------------------------------------ seeded randomness */

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const randomFrom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const integer = (random, low, high) => low + Math.floor(random() * (high - low + 1));

/* ---------------------------------------------------- exact polynomials */

// A term is { c, powers: { x: 2, y: 1 } }: a whole-number coefficient and the
// exponent of each letter. A polynomial being worked on is a Map from the
// term's letters (keyOf) to its term.
const keyOf = (powers) => Object.keys(powers).filter((letter) => powers[letter] > 0).sort()
  .map((letter) => `${letter}${powers[letter]}`).join('');
const degreeOf = (powers) => Object.values(powers).reduce((sum, power) => sum + power, 0);

const termTimes = (left, right) => {
  const powers = { ...left.powers };
  Object.entries(right.powers).forEach(([letter, power]) => { powers[letter] = (powers[letter] || 0) + power; });
  return { c: left.c * right.c, powers };
};

/** The terms combined: a Map key → term, no zero term. */
const combine = (terms) => {
  const out = new Map();
  terms.forEach((term) => {
    const key = keyOf(term.powers);
    const before = out.get(key);
    out.set(key, { c: (before?.c || 0) + term.c, powers: { ...term.powers } });
  });
  [...out].forEach(([key, term]) => { if (term.c === 0) out.delete(key); });
  return out;
};

const productTerms = (left, right) => left.flatMap((a) => right.map((b) => termTimes(a, b)));

/** Standard order: the highest degree first; among equal degrees, alphabetical by letter, higher powers first. */
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const ordered = (terms) => [...terms].sort((a, b) => {
  const degree = degreeOf(b.powers) - degreeOf(a.powers);
  if (degree) return degree;
  for (const letter of LETTERS) {
    const difference = (b.powers[letter] || 0) - (a.powers[letter] || 0);
    if (difference) return difference;
  }
  return 0;
});
const standard = (map) => ordered([...map.values()]);

/* --------------------------------------------------------------- writing */

const lettersLatex = (powers) => Object.keys(powers).filter((letter) => powers[letter] > 0).sort()
  .map((letter) => (powers[letter] === 1 ? letter : `${letter}^${powers[letter] > 9 ? `{${powers[letter]}}` : powers[letter]}`)).join('');
const lettersTyped = (powers) => Object.keys(powers).filter((letter) => powers[letter] > 0).sort()
  .map((letter) => (powers[letter] === 1 ? letter : `${letter}^${powers[letter]}`)).join('');

/** A term without its sign: "4y^2", "y", "3". */
const sizeLatex = (term, letters = lettersLatex) => {
  const shown = letters(term.powers);
  const size = Math.abs(term.c);
  return shown ? `${size === 1 ? '' : size}${shown}` : String(size);
};
/** One term on its own, sign and all: "-4y^3". */
const termLatex = (term) => `${term.c < 0 ? '-' : ''}${sizeLatex(term)}`;
/** A term as a factor after "\cdot": a negative one in brackets. */
const factorLatex = (term) => (term.c < 0 ? `(${termLatex(term)})` : termLatex(term));
/** Terms in the order given, "4y^2 + 2y - 3". */
const polyLatex = (terms) => (terms.length ? terms.map((term, index) => (index === 0
  ? termLatex(term)
  : `${term.c < 0 ? ' - ' : ' + '}${sizeLatex(term)}`)).join('') : '0');
/** As a student types it into a box: "-4y^3-2y^2+3y". */
const polyTyped = (terms) => (terms.length ? terms.map((term, index) => `${term.c < 0 ? '-' : index === 0 ? '' : '+'}${sizeLatex(term, lettersTyped)}`).join('') : '0');

/* ------------------------------------------------- reading the item's math */

const SUPERSCRIPT_DIGITS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };

/** Math as written (Unicode, LaTeX or typed) → "(3x^2+2x-3)-(4x^2+x-5)", or null for anything else. */
const normalizeMath = (raw) => {
  const value = text(raw)
    .replace(/\\left|\\right/g, '')
    .replace(/\^\{(\d+)\}/g, '^$1')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((digit) => SUPERSCRIPT_DIGITS[digit]).join('')}`)
    .replace(/[−–]/g, '-')
    .replace(/\s+/g, '');
  return /^[A-Za-z0-9^+\-()]+$/.test(value) ? value : null;
};

const tokenize = (value) => (value.match(/\d+|[A-Za-z]|[\^+\-()]/g) || []);

/*
 * The expression grammar. A polynomial (a "literal") is monomials joined by
 * + and −, each a whole number and/or letters with exponents, no letter twice
 * and no two like terms. An expression is products joined by + and −; a
 * product is an optional monomial in front, then one or more bracketed
 * polynomials, each with an optional exponent 2 or 3. Anything else — a
 * division, a decimal, a bare term outside brackets — is not read.
 */
const parseExpressionText = (raw) => {
  const normalized = normalizeMath(raw);
  if (!normalized) return null;
  const tokens = tokenize(normalized);
  let at = 0;
  const peek = () => tokens[at];
  const isNumber = (token) => /^\d+$/.test(token || '');
  const isLetter = (token) => /^[A-Za-z]$/.test(token || '');

  const monomial = () => {
    let c = 1;
    let read = false;
    if (isNumber(peek())) { c = Number(tokens[at]); at += 1; read = true; }
    const powers = {};
    while (isLetter(peek())) {
      const letter = tokens[at];
      at += 1;
      let power = 1;
      if (peek() === '^') {
        at += 1;
        if (!isNumber(peek())) return null;
        power = Number(tokens[at]);
        at += 1;
      }
      if (powers[letter] || power < 1) return null;
      powers[letter] = power;
      read = true;
    }
    return read && Number.isSafeInteger(c) && c > 0 ? { c, powers } : null;
  };

  const literal = () => {
    const terms = [];
    let sign = 1;
    if (peek() === '-' || peek() === '+') { sign = peek() === '-' ? -1 : 1; at += 1; }
    for (;;) {
      const term = monomial();
      if (!term) return null;
      terms.push({ c: sign * term.c, powers: term.powers });
      if (peek() !== '-' && peek() !== '+') break;
      sign = peek() === '-' ? -1 : 1;
      at += 1;
    }
    const keys = terms.map((term) => keyOf(term.powers));
    return new Set(keys).size === keys.length ? terms : null;
  };

  const products = [];
  let sign = 1;
  if (peek() === '-' || peek() === '+') { sign = peek() === '-' ? -1 : 1; at += 1; }
  for (;;) {
    let multiplier = null;
    if (peek() !== '(') {
      multiplier = monomial();
      if (!multiplier) return null;
    }
    const factors = [];
    while (peek() === '(') {
      at += 1;
      const terms = literal();
      if (!terms || peek() !== ')') return null;
      at += 1;
      let power = 1;
      if (peek() === '^') {
        at += 1;
        if (!isNumber(peek())) return null;
        power = Number(tokens[at]);
        at += 1;
        if (power !== 2 && power !== 3) return null;
      }
      factors.push({ terms, power });
    }
    if (!factors.length) return null;
    // The sign belongs to the monomial in front: −3(…) distributes −3.
    const front = multiplier ? { c: sign * multiplier.c, powers: multiplier.powers } : (sign < 0 ? { c: -1, powers: {} } : null);
    products.push({ multiplier: front, factors });
    if (at >= tokens.length) break;
    if (peek() !== '-' && peek() !== '+') return null;
    sign = peek() === '-' ? -1 : 1;
    at += 1;
  }
  return products.length ? products : null;
};

/** A Workshop polynomial ("2a^3+5a-7", "-y"): its terms in order, or null. */
const parseLiteralText = (raw) => {
  const products = parseExpressionText(`(${text(raw)})`);
  return products?.length === 1 && !products[0].multiplier && products[0].factors.length === 1 && products[0].factors[0].power === 1
    ? products[0].factors[0].terms
    : null;
};

/*
 * What kind of work an expression is, from its shape:
 *   difference / sum   (A) − (B), (A) + (B)
 *   monomial           M(P)
 *   product            (P)(Q)
 *   power              (P)², (P)³
 *   combination        M₁(P₁) ± M₂(P₂) …, each M a number or a monomial
 * Null for any other shape.
 */
const isUnit = (multiplier) => !multiplier || (Math.abs(multiplier.c) === 1 && !keyOf(multiplier.powers));
const kindOf = (products) => {
  const single = products.every((product) => product.factors.length === 1 && product.factors[0].power === 1);
  if (products.length === 2 && single && products.every((product, index) => (index === 0 ? !product.multiplier : isUnit(product.multiplier)))) {
    return products[1].multiplier?.c === -1 ? 'difference' : 'sum';
  }
  if (products.length === 1) {
    const [{ multiplier, factors }] = products;
    if (factors.length === 1 && factors[0].power > 1 && !multiplier) return 'power';
    // −x(…) is one too: its 1 is a letter's, so it is not a unit.
    if (factors.length === 1 && factors[0].power === 1 && multiplier && !isUnit(multiplier)) return 'monomial';
    if (factors.length === 2 && factors.every((factor) => factor.power === 1) && !multiplier) return 'product';
    return null;
  }
  if (products.length >= 2 && single && products.every((product) => product.multiplier && !isUnit(product.multiplier))) return 'combination';
  return null;
};

/** The value of products → a Map of terms. */
const valueOf = (products) => combine(products.flatMap(({ multiplier, factors }) => {
  let terms = multiplier ? [multiplier] : [{ c: 1, powers: {} }];
  factors.forEach(({ terms: factorTerms, power }) => {
    for (let index = 0; index < power; index += 1) terms = productTerms(terms, factorTerms);
  });
  return terms;
}));

const lettersOfMap = (map) => new Set([...map.values()].flatMap((term) => Object.keys(term.powers).filter((letter) => term.powers[letter] > 0)));
const sameLetters = (left, right) => left.size === right.size && [...left].every((letter) => right.has(letter));

/** The platform's own reading of a key or an expression, as a polynomial (algebraicForm.mjs). */
const platformValue = (raw) => {
  try {
    return parsePolynomial(String(raw ?? '').replace(/[−–]/g, '-'));
  } catch {
    return null;
  }
};
const mapAsPlatform = (map) => parsePolynomial(polyTyped(standard(map)));

/** Does my reading have exactly this key's value, with the key's letters? */
const confirmedBy = (products, key) => {
  const expected = platformValue(key);
  if (!expected || !products) return false;
  const value = valueOf(products);
  const keyLetters = new Set([...expected.keys()].join('').match(/[a-z]/gi) || []);
  return sameLetters(lettersOfMap(value), keyLetters) && samePolynomial(mapAsPlatform(value), expected, 1e-9);
};

// "Simplify (…) − (…)", "Multiply (n − 9)(n + 7)", "Step 1: (4n − 5)², in simplest form".
const LABEL_LEAD = /^(?:(?:simplify|multiply|find|expand|add|subtract)\s*:?\s+|step\s+\d+\s*:\s*)/i;
const LABEL_TAIL = /\s*(?:,\s*)?(?:in\s+simplest\s+form)?\s*[.:]?\s*$/i;
const labelMath = (label) => text(label).replace(LABEL_LEAD, '').replace(LABEL_TAIL, '');

const mathPieces = (prompt) => (text(prompt).match(/\$[^$]+\$/g) || []).map((piece) => piece.slice(1, -1));
const outsideMath = (prompt) => text(prompt).replace(/\$[^$]+\$/g, ' ');

/*
 * A prompt this kind may set aside: every piece of mathematics in it is a
 * polynomial expression, and it quotes no number outside them. A story's
 * numbers (prices, hours, Jordan's wrong line with its "=") keep it the item's.
 */
const promptIsOnlyThisMath = (prompt) => {
  if (/\d/.test(outsideMath(prompt))) return false;
  return mathPieces(prompt).every((piece) => !/=/.test(piece) && Boolean(platformValue(piece)));
};

const isChoiceField = (field) => /choice|select|dropdown|radio/i.test(String(field?.type || field?.inputType || '')) || list(field?.options).length > 0;

/**
 * The item as polynomial work: { parts: [{ products, kind, field? }], workshop }
 * or null. Each part is one answer box (a Workshop item has one).
 */
export const readPolynomialItem = (question) => {
  if (!question || typeof question !== 'object') return null;
  if (isFamilyBackedQuestion(question) || question.familyDelivery || question.generator || question.context) return null;
  const prompt = text(question.prompt);
  if (!promptIsOnlyThisMath(prompt)) return null;

  if (question.type === 'polynomialWorkshop') {
    let products = null;
    if (question.mode === 'addSubtract' && ['add', 'subtract'].includes(question.operation)) {
      const first = parseLiteralText(question.firstPolynomial);
      const second = parseLiteralText(question.secondPolynomial);
      if (!first || !second) return null;
      products = [
        { multiplier: null, factors: [{ terms: first, power: 1 }] },
        { multiplier: question.operation === 'subtract' ? { c: -1, powers: {} } : null, factors: [{ terms: second, power: 1 }] },
      ];
    } else if (question.mode === 'multiplyArea') {
      const left = parseLiteralText(question.leftFactor);
      const right = parseLiteralText(question.rightFactor);
      if (!left || !right) return null;
      products = left.length === 1
        ? [{ multiplier: left[0], factors: [{ terms: right, power: 1 }] }]
        : [{ multiplier: null, factors: [{ terms: left, power: 1 }, { terms: right, power: 1 }] }];
    }
    const kind = products ? kindOf(products) : null;
    if (!kind) return null;
    // The prompt writes the whole operation as one piece of mathematics.
    // PR 6 names its two polynomials apart and says "subtract" in a story.
    const value = mapAsPlatform(valueOf(products));
    if (!mathPieces(prompt).some((piece) => samePolynomial(platformValue(piece), value, 1e-9))) return null;
    return { workshop: question.mode, parts: [{ products, kind }] };
  }

  if (question.type !== 'multiAnswer') return null;
  const fields = list(question.answerFields).filter((field) => text(field?.id));
  const typed = fields.filter((field) => !isChoiceField(field));
  if (!typed.length || typed.length > 4) return null;
  const parts = [];
  for (const field of typed) {
    if (field.answerForm !== 'simplifiedPolynomial' || typeof field.answer !== 'string') return null;
    let products = parseExpressionText(labelMath(field.label));
    if (!products && typed.length === 1) {
      const pieces = mathPieces(prompt);
      if (pieces.length === 1) products = parseExpressionText(pieces[0]);
    }
    const kind = products ? kindOf(products) : null;
    if (!kind || !confirmedBy(products, field.answer)) return null;
    parts.push({ products, kind, field });
  }
  return { workshop: null, parts };
};

/* ------------------------------------------------------------ the variant */

const ORDINALS = ['First', 'Second', 'Third', 'Fourth'];
const KIND_WORD = Object.freeze({ difference: 'difference', sum: 'sum', monomial: 'product', product: 'product', combination: 'simplified expression' });
const kindWord = (part) => (part.kind === 'power' ? (part.products[0].factors[0].power === 2 ? 'square' : 'cube') : KIND_WORD[part.kind]);
const capitalise = (value) => value.charAt(0).toUpperCase() + value.slice(1);

/** Each part's label: "Difference", or "First difference" when two parts are the same kind of work. */
const labelsOf = (parts) => {
  const words = parts.map(kindWord);
  const seen = new Map();
  return words.map((word) => {
    if (words.filter((other) => other === word).length === 1) return capitalise(word);
    const index = seen.get(word) || 0;
    seen.set(word, index + 1);
    return `${ORDINALS[index]} ${word}`;
  });
};

/** What stands in front of a product's brackets: "", " - ", "-3", " + 2c". */
const frontLatex = (multiplier, index) => {
  if (!multiplier) return index === 0 ? '' : ' + ';
  const sign = multiplier.c < 0 ? (index === 0 ? '-' : ' - ') : (index === 0 ? '' : ' + ');
  return isUnit(multiplier) ? sign : `${sign}${sizeLatex(multiplier)}`;
};
/** The expression as LaTeX: "(3x^2 + 2x - 3) - (4x^2 + x - 5)", "4(a^2 + 5a - 6) - 3(2a^3 + 4a - 5)". */
const expressionLatex = (products) => products.map(({ multiplier, factors }, index) => (
  `${frontLatex(multiplier, index)}${factors.map(({ terms, power }) => `(${polyLatex(terms)})${power > 1 ? `^${power}` : ''}`).join('')}`
)).join('');

const productsList = (left, right) => left.flatMap((a) => right.map((b) => `${termLatex(a)} \\cdot ${factorLatex(b)} = ${termLatex(termTimes(a, b))}`)).join(', \\; ');

/** "(5y^2 - 2y^2) + (-2y + 6y) + (4 - 1)": the terms of each like kind together, in the answer's order. */
const groupedLatex = (terms) => {
  const groups = new Map();
  terms.forEach((term) => {
    const key = keyOf(term.powers);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(term);
  });
  const order = ordered([...groups.values()].map((group) => group[0]));
  return order.map((first, index) => {
    const group = groups.get(keyOf(first.powers));
    const inside = polyLatex(group);
    if (group.length === 1) return index === 0 ? inside : `${group[0].c < 0 ? ' - ' : ' + '}${sizeLatex(group[0])}`;
    return `${index === 0 ? '' : ' + '}(${inside})`;
  }).join('');
};

/** The steps of one part, in the item's method. `known` holds a square already worked (for a cube). */
const stepsFor = (part, known) => {
  const { products, kind } = part;
  const steps = [];
  const answer = standard(valueOf(products));
  const result = polyLatex(answer);
  const whole = expressionLatex(products);
  if (kind === 'difference' || kind === 'sum') {
    const [first, second] = products.map((product) => product.factors[0].terms);
    if (kind === 'difference') {
      const opposite = second.map((term) => ({ ...term, c: -term.c }));
      steps.push(`Subtracting a polynomial means adding its opposite: the opposite of $${polyLatex(second)}$ is $${polyLatex(opposite)}$.`);
      steps.push(`Add the opposite to the first polynomial: $${whole} = ${polyLatex([...first, ...opposite])}$.`);
      steps.push(`Group like terms and combine them: $${groupedLatex([...first, ...opposite])} = ${result}$.`);
    } else {
      steps.push(`Group like terms and combine them: $${whole} = ${groupedLatex([...first, ...second])} = ${result}$.`);
    }
  } else if (kind === 'monomial') {
    const [{ multiplier, factors: [{ terms }] }] = products;
    steps.push(`Multiply $${termLatex(multiplier)}$ by each term of $${polyLatex(terms)}$: $${productsList([multiplier], terms)}$.`);
    steps.push(`No two of the products are like terms, so $${whole} = ${result}$.`);
  } else if (kind === 'product' || kind === 'power') {
    let [left, right] = kind === 'product' ? products[0].factors.map((factor) => factor.terms) : [products[0].factors[0].terms, products[0].factors[0].terms];
    const base = products[0].factors[0].terms;
    if (kind === 'power') {
      const power = products[0].factors[0].power;
      if (power === 2) {
        steps.push(`Write the square as a product: $(${polyLatex(base)})^2 = (${polyLatex(base)})(${polyLatex(base)})$.`);
      } else {
        const square = known.get(polyLatex(base)) || standard(combine(productTerms(base, base)));
        steps.push(`Write the cube as the square times $${polyLatex(base)}$: $(${polyLatex(base)})^3 = (${polyLatex(base)})^2(${polyLatex(base)}) = (${polyLatex(square)})(${polyLatex(base)})$.`);
        left = square;
        right = base;
      }
    }
    const all = productTerms(left, right);
    steps.push(`Multiply each term of $${polyLatex(left)}$ by each term of $${polyLatex(right)}$: $${productsList(left, right)}$.`);
    const start = kind === 'product' ? whole : `(${polyLatex(left)})(${polyLatex(right)})`;
    const likeTerms = combine(all).size < all.length;
    steps.push(likeTerms
      ? `Add the products and combine like terms: $${start} = ${polyLatex(all)} = ${result}$.`
      : `No two of the products are like terms, so $${start} = ${result}$.`);
    if (kind === 'power' && products[0].factors[0].power === 2) known.set(polyLatex(base), answer);
  } else if (kind === 'combination') {
    const expanded = [];
    products.forEach(({ multiplier, factors: [{ terms }] }) => {
      const each = terms.map((term) => termTimes(multiplier, term));
      expanded.push(...each);
      steps.push(`Distribute $${termLatex(multiplier)}$: $${termLatex(multiplier)}(${polyLatex(terms)}) = ${polyLatex(each)}$.`);
    });
    steps.push(`Group like terms and combine them: $${groupedLatex(expanded)} = ${result}$.`);
  }
  return { steps, answer };
};

/* The coefficient a slot may take: its sign kept; a leading 1 stays 1. */
const drawCoefficient = (random, c, leads) => {
  const size = Math.abs(c);
  if (size === 1) return leads ? c : Math.sign(c) * integer(random, 1, 4);
  return Math.sign(c) * integer(random, Math.max(2, size - 1), size + 2);
};

const contentOf = (terms) => terms.reduce((g, term) => gcd(g, term.c), 0);
const literalKey = (terms) => polyLatex(terms);
const signature = (map) => [...map.entries()].map(([key, term]) => `${key}:${Math.sign(term.c)}`).sort().join('|');
const largest = (map) => Math.max(0, ...[...map.values()].map((term) => Math.abs(term.c)));

/** Every polynomial and multiplier of the item, each polynomial once however often it is written. */
const slotsOf = (item) => {
  const literals = new Map();
  const multipliers = [];
  item.parts.forEach((part) => part.products.forEach((product) => {
    if (product.multiplier && !isUnit(product.multiplier)) multipliers.push(product.multiplier);
    product.factors.forEach((factor) => {
      const key = literalKey(factor.terms);
      if (!literals.has(key)) literals.set(key, factor.terms);
    });
  }));
  return { literals, multipliers };
};

/** The item's parts with each polynomial and multiplier replaced by its new one. */
const rebuild = (item, newLiterals, newMultipliers) => {
  const multipliersLeft = [...newMultipliers];
  return item.parts.map((part) => ({
    ...part,
    products: part.products.map((product) => ({
      multiplier: product.multiplier && !isUnit(product.multiplier) ? multipliersLeft.shift() : product.multiplier,
      factors: product.factors.map((factor) => ({ terms: newLiterals.get(literalKey(factor.terms)), power: factor.power })),
    })),
  }));
};

/** The grader that grades each box, about the variant's key. */
const boxesAgree = (question, item, parts, answers) => {
  try {
    // The box as authored (its simplest-form rule, its input), keyed to the
    // variant: any alternate answer the author listed was the item's.
    const fields = item.parts.map((part, index) => ({
      ...part.field,
      answer: polyTyped(answers[index]),
      acceptedAnswers: undefined,
      accepted: undefined,
      expected: undefined,
    }));
    const asked = { ...question, answerFields: fields };
    const grade = (typedAnswers) => gradeMultiAnswerResponse(asked, Object.fromEntries(fields.map((field, index) => [field.id, typedAnswers[index]]))).parts;
    const right = grade(answers.map(polyTyped));
    if (!right.every((part) => part.isCorrect === true)) return false;
    // Each box's answer with its constant term moved by one, and the item's own key: wrong.
    return answers.every((terms, index) => {
      const moved = combine([...terms, { c: 1, powers: {} }]);
      const typedMoved = answers.map((other, at) => polyTyped(at === index ? standard(moved) : other));
      const typedItem = answers.map((other, at) => (at === index ? text(item.parts[index].field.answer) : polyTyped(other)));
      return grade(typedMoved)[index].isCorrect === false && grade(typedItem)[index].isCorrect === false;
    });
  } catch {
    return false;
  }
};

/** The Workshop's own key for the new polynomials. */
const workshopAgrees = (question, item, parts, answers) => {
  try {
    const [{ products }] = parts;
    const typed = (terms) => polyTyped(terms);
    let key = null;
    if (item.workshop === 'addSubtract') {
      key = addSubtractKey({ ...question, firstPolynomial: typed(products[0].factors[0].terms), secondPolynomial: typed(products[1].factors[0].terms) })?.result;
    } else {
      const [{ multiplier, factors }] = products;
      const [leftFactor, rightFactor] = multiplier ? [typed([multiplier]), typed(factors[0].terms)] : factors.map((factor) => typed(factor.terms));
      key = areaModelKey({ ...question, leftFactor, rightFactor })?.product;
    }
    if (!Array.isArray(key) || !key.every((term) => Number.isInteger(term.coefficient))) return false;
    const fromTool = combine(key.map((term) => ({ c: term.coefficient, powers: { ...term.powers } })));
    return samePolynomial(mapAsPlatform(fromTool), mapAsPlatform(combine(answers[0])), 1e-9);
  } catch {
    return false;
  }
};

/** Every piece of mathematics written: each $…$, and each side of each "=" in it. */
const writtenMath = (variant) => [variant.prompt, ...variant.steps, variant.answer]
  .flatMap((line) => (String(line).match(/\$[^$]+\$/g) || []).map((piece) => piece.slice(1, -1)))
  .flatMap((piece) => piece.split(/,\s*\\;\s*/))
  .flatMap((piece) => piece.split('='))
  .map((side) => side.replace(/\\cdot/g, '*').trim())
  .filter(Boolean);

const ATTEMPTS = 600;

const variantOf = (question, item, seed) => {
  const { literals, multipliers } = slotsOf(item);
  const itemValues = item.parts.map((part) => valueOf(part.products));
  const itemKeys = item.parts.map((part, index) => part.field?.answer || polyTyped(standard(itemValues[index])));
  const itemPlatform = itemKeys.map(platformValue).filter(Boolean);
  const itemSize = [...literals.values()].flat().reduce((sum, term) => sum + Math.abs(term.c), 0)
    + multipliers.reduce((sum, term) => sum + Math.abs(term.c), 0);
  const random = randomFrom(hashText(`${Number(seed) || 0}|${POLYNOMIAL_VARIANT_KIND}|${[...literals.keys()].join('|')}|${multipliers.map(termLatex).join('|')}`));
  const answersAnywhere = [...itemKeys, ...questionAnswerValues(question)];

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const newLiterals = new Map([...literals].map(([key, terms]) => [key, terms.map((term, index) => ({ c: drawCoefficient(random, term.c, index === 0), powers: term.powers }))]));
    const newMultipliers = multipliers.map((term) => ({ c: drawCoefficient(random, term.c, true), powers: term.powers }));
    const size = [...newLiterals.values()].flat().reduce((sum, term) => sum + Math.abs(term.c), 0) + newMultipliers.reduce((sum, term) => sum + Math.abs(term.c), 0);
    if (size < itemSize) continue;
    // The same polynomials stay apart, and none divides by a common factor unless the item's does.
    const written = [...newLiterals.values()].map(literalKey);
    if (new Set(written).size !== written.length) continue;
    if ([...literals].some(([key, terms]) => contentOf(newLiterals.get(key)) > 1 && contentOf(terms) === 1)) continue;
    const parts = rebuild(item, newLiterals, newMultipliers);
    const values = parts.map((part) => valueOf(part.products));
    // The item's terms with the item's signs, of a size like the item's.
    if (values.some((value, index) => signature(value) !== signature(itemValues[index]))) continue;
    if (values.some((value, index) => largest(value) > Math.max(2 * largest(itemValues[index]), largest(itemValues[index]) + 20))) continue;
    // Never one of the item's answers.
    if (values.some((value) => itemPlatform.some((key) => samePolynomial(mapAsPlatform(value), key, 1e-9)))) continue;

    const labels = labelsOf(parts);
    const lines = parts.map((part) => `$${expressionLatex(part.products)}$`);
    let prompt;
    if (parts.length === 1) {
      prompt = ['monomial', 'product'].includes(parts[0].kind)
        ? `Multiply ${lines[0]}. Write the product in simplest form.`
        : `Simplify ${lines[0]}. Write the answer in simplest form.`;
    } else {
      const words = new Set(parts.map(kindWord));
      const lead = words.size > 1 ? 'Simplify each expression. Write each answer in simplest form.'
        : words.has('product') ? 'Multiply. Write each product in simplest form.'
          : words.has('difference') ? 'Simplify each difference. Write each answer in simplest form.'
            : 'Simplify each expression. Write each answer in simplest form.';
      prompt = [lead, ...parts.map((part, index) => `${labels[index]}: ${lines[index]}.`)].join(' ');
    }
    const known = new Map();
    const worked = parts.map((part) => stepsFor(part, known));
    const answers = worked.map((entry) => entry.answer);
    const variant = {
      prompt,
      steps: worked.flatMap((entry) => entry.steps),
      answer: parts.map((part, index) => `${labels[index]} = $${polyLatex(answers[index])}$`).join('; '),
      kind: POLYNOMIAL_VARIANT_KIND,
    };
    // Read back: each expression as the prompt writes it has its answer's value.
    if (!parts.every((part, index) => samePolynomial(platformValue(expressionLatex(part.products)), mapAsPlatform(combine(answers[index])), 1e-9))) continue;
    // No piece of mathematics it writes has the value of one of the item's keys.
    if (writtenMath(variant).some((piece) => {
      const value = platformValue(piece);
      return value && itemPlatform.some((key) => samePolynomial(value, key, 1e-9));
    })) continue;
    if (hintRevealsAnswer([variant.prompt, ...variant.steps, variant.answer].join('\n'), answersAnywhere)) continue;
    if (!similarExampleIsSafe(question, variant)) continue;
    if (item.workshop ? !workshopAgrees(question, item, parts, answers) : !boxesAgree(question, item, parts, answers)) continue;
    return variant;
  }
  return null;
};

export const buildPolynomialVariant = (question, { seed = 0 } = {}) => {
  try {
    const item = readPolynomialItem(question);
    return item ? variantOf(question, item, seed) : null;
  } catch {
    return null;
  }
};
