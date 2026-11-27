/*
 * RADICALS AND RATIONAL EXPONENTS, AND MONOMIALS DIVIDED (WE-I): the
 * Algebra II answer-box generators for A2.7G (and the monomial quotients of
 * Dividing Polynomials, A2.7C). Each generator is
 *
 *   { id, standards, claim(question, fields) → plan | null,
 *     draw(plan, seed) → { prompt, steps: [{ show, why }], answer } | null }
 *
 * `claim` reads every answer field as a part it can work, or claims nothing.
 * `draw` works the same kinds of part with other numbers; the family keeps
 * the first draw that passes the answer guard (shared.js, firstSafe).
 *
 *   rationalExponents  b^(p/q) evaluated (the root first, then the power, a
 *                      negative exponent as a reciprocal), ⁿ√b evaluated, a
 *                      power written in radical form or a root in exponential
 *                      form, and whether a negative base to a power is real.
 *   monomialRules      a product, quotient or power of monomials simplified
 *                      with positive exponents only (whole or rational
 *                      exponents), the exponent of one base after a product,
 *                      and a term divided by a monomial.
 *   rootVocabulary     the index and the radicand of ⁿ√b, the statement that
 *                      shows a is an nth root of b, and both real even roots.
 */
import {
  MINUS,
  Q,
  firstFitting,
  intPow,
  qAdd,
  qText,
  rootOf,
  rootSign,
  signed,
  superscript,
  text,
} from './shared.js';
import {
  evaluateMonomial,
  expressionText,
  monomialSteps,
  mutateMonomial,
  parseMonomialExpression,
  positiveForm,
  sameKindOfResult,
} from './monomials.js';

const plain = (value) => text(value).replace(/\$/g, '').replace(/\\frac\{(-?\d+)\}\{(\d+)\}/g, '$1/$2').replace(/\{|\}/g, '').replace(/\s+/g, ' ').trim();
const ROOT_SIGNS = '(√|∛|∜|[⁰¹²³⁴⁵⁶⁷⁸⁹]+√)';
const indexOfSign = (sign) => (sign === '√' ? 2 : sign === '∛' ? 3 : sign === '∜' ? 4 : Number(sign.slice(0, -1).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join('')));
const exponentText = (p, q) => `^(${p < 0 ? MINUS : ''}${Math.abs(p)}/${q})`;
const joinParts = (parts) => parts.join('; ');
const articleList = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0]);

/* =================================================== rationalExponents */

export const RATIONAL_WHY = Object.freeze({
  root: 'In a rational exponent p/q the denominator q is the index of a root: b to the power one over q is the qth root of b.',
  power: 'The numerator p is a power of that root: b^(p/q) = (ᵠ√b)ᵖ. Taking the root first keeps the numbers small.',
  reciprocal: 'A negative exponent means a reciprocal: b⁻ⁿ is one over bⁿ. It never makes the number negative.',
  oddRoot: 'An odd root of a negative number is real and negative, because a negative number to an odd power is negative.',
  evenRoot: 'An even root of a negative number is not a real number: no real number to an even power is negative.',
  toRadical: 'b to the power one over n is ⁿ√b: the denominator of the exponent becomes the index of the root.',
  toExponential: 'ⁿ√b is b to the power one over n: the index of the root becomes the denominator of the exponent. A square root’s index is two, though it is not written.',
  rootValue: 'ⁿ√b is the number whose nth power is b.',
});

const gcdOf = (a, b) => (b ? gcdOf(b, a % b) : Math.abs(a));
// Perfect powers a sibling can use: b = kᵠ.
const POWERS = (() => {
  const found = [];
  const largest = { 2: 15, 3: 10, 4: 6, 5: 4, 6: 3, 7: 2 };
  for (let q = 2; q <= 7; q += 1) for (let k = 2; k <= largest[q]; k += 1) found.push({ k, q, b: intPow(k, q) });
  return found;
})();
const power = (value) => (value < 0 ? `(${signed(value)})` : String(value));

// What a field asks, read from its label (and its answer for a number).
const rationalPartOf = (field) => {
  const label = plain(field.label);
  let match = new RegExp(`^\\(?([−-]?\\d+)\\)?\\^\\(([−-]?\\d+)/(\\d+)\\) =$`).exec(label);
  if (match && !field.choice && Number.isFinite(Number(field.answer.replace(/−/g, '-').split('/')[0]))) {
    const base = Number(match[1].replace(/−/g, '-'));
    const p = Number(match[2].replace(/−/g, '-'));
    const q = Number(match[3]);
    if (q < 2) return null;
    return { kind: 'evaluate', shape: `${p < 0 ? 'neg' : 'pos'}-${Math.abs(p) === 1 ? 'unit' : 'power'}-${base < 0 ? 'negbase' : 'base'}`, p, q, base };
  }
  match = new RegExp(`^${ROOT_SIGNS}(\\d+) =$`).exec(label);
  if (match && !field.choice) return { kind: 'rootValue', shape: 'root', q: indexOfSign(match[1]), base: Number(match[2]) };
  match = /^\(([−-])(\d+)\)\^\(?(\d+)\/(\d+)\)? is…?$/.exec(label);
  if (match && field.choice) return { kind: 'realCheck', shape: 'real', q: Number(match[4]), base: -Number(match[2]) };
  match = /^([a-z])\^\(?1\/(\d+)\)? in radical form$/.exec(label);
  if (match && !field.choice) return { kind: 'toRadical', shape: 'radical', letter: match[1], q: Number(match[2]) };
  match = new RegExp(`^${ROOT_SIGNS}([a-z]) in exponential form$`).exec(label);
  if (match && !field.choice) return { kind: 'toExponential', shape: indexOfSign(match[1]) === 2 ? 'exponential-square' : 'exponential', letter: match[2], q: indexOfSign(match[1]) };
  return null;
};

const rationalClaim = (question, fields) => {
  if (!fields.length) return null;
  const parts = fields.map(rationalPartOf);
  if (parts.some((part) => !part)) return null;
  // One sibling part for each kind of part, in the item's order.
  const shapes = [];
  parts.forEach((part) => { if (!shapes.some((other) => other.shape === part.shape)) shapes.push(part); });
  return { shapes, items: parts };
};

const evaluateOptions = (shape) => {
  const negativeBase = shape.shape.endsWith('negbase');
  const unit = shape.shape.includes('unit');
  return POWERS.filter(({ q }) => !negativeBase || q % 2 === 1).flatMap((entry) => (unit ? [1] : [2, 3, 4, 5, 6, 7]).filter((p) => gcdOf(p, entry.q) === 1).map((p) => ({ ...entry, p })))
    .filter(({ k, p }) => intPow(k, p) <= 1500);
};

const evaluatePart = (shape, { k, q, b, p }) => {
  const negativeExponent = shape.shape.startsWith('neg');
  const negativeBase = shape.shape.endsWith('negbase');
  const base = negativeBase ? -b : b;
  const root = negativeBase ? -k : k;
  const raised = intPow(root, p);
  const signedP = negativeExponent ? -p : p;
  const asked = `${power(base)}${exponentText(signedP, q)}`;
  const steps = [{
    show: `${asked}: the denominator ${q} is the index, so take ${rootOf(q, signed(base))} first. It is ${signed(root)}, because ${power(root)}${superscript(q)} = ${signed(base)}.`,
    why: base < 0 ? `${RATIONAL_WHY.root} ${RATIONAL_WHY.oddRoot}` : RATIONAL_WHY.root,
  }];
  if (p !== 1) steps.push({ show: `The numerator ${p} is the power: ${power(root)}${superscript(p)} = ${signed(raised)}.`, why: RATIONAL_WHY.power });
  const value = negativeExponent ? (raised < 0 ? `${MINUS}1/${Math.abs(raised)}` : `1/${raised}`) : signed(raised);
  if (negativeExponent) steps.push({ show: `The exponent is negative, so take the reciprocal: ${asked} = 1/${power(base)}${exponentText(p, q)} = ${value}.`, why: RATIONAL_WHY.reciprocal });
  return { ask: `evaluate ${asked}`, steps, answer: `${asked} = ${value}`, key: b };
};

const rootValuePart = ({ k, q, b }) => {
  const sign = rootOf(q, String(b));
  return { ask: `evaluate ${sign}`, steps: [{ show: `${sign} = ${k}, because ${k}${superscript(q)} = ${b}.`, why: RATIONAL_WHY.rootValue }], answer: `${sign} = ${k}`, key: b };
};

// Whether a negative base to a rational power is real: the sibling's case is
// drawn from the seed alone, never from the item's, so it says nothing of the item's.
const realCheckPart = (even, { k, q, b, p }) => {
  const expression = `(${MINUS}${b})${exponentText(p, q)}`;
  if (even) {
    return {
      ask: `decide whether ${expression} is a real number`,
      steps: [{ show: `${expression}: the denominator ${q} is even, so it asks for an even root of ${MINUS}${b}. That is not a real number.`, why: RATIONAL_WHY.evenRoot }],
      answer: `${expression} is not a real number`,
      key: b,
    };
  }
  const value = intPow(-k, p);
  return {
    ask: `decide whether ${expression} is a real number`,
    steps: [{ show: `${expression}: the denominator ${q} is odd, so ${rootOf(q, `${MINUS}${b}`)} = ${MINUS}${k} is real.${p === 1 ? '' : ` Then (${MINUS}${k})${superscript(p)} = ${signed(value)}.`}`, why: RATIONAL_WHY.oddRoot }],
    answer: `${expression} = ${signed(value)}, a real number`,
    key: b,
  };
};

const LETTERS = Object.freeze(['m', 'p', 'k', 't', 'u', 'v', 'g', 'h']);
const toRadicalPart = ({ letter, q }) => ({
  ask: `write ${letter}^(1/${q}) in radical form`,
  steps: [{ show: `${letter}^(1/${q}) has denominator ${q}, so it is the root with index ${q}: ${rootOf(q, letter)}.`, why: RATIONAL_WHY.toRadical }],
  answer: `${letter}^(1/${q}) = ${rootOf(q, letter)}`,
  key: letter,
});
const toExponentialPart = ({ letter, q }) => ({
  ask: `write ${rootOf(q, letter)} in exponential form`,
  steps: [{ show: `${rootOf(q, letter)} has index ${q}${q === 2 ? ' (a square root’s index is not written)' : ''}, so it is ${letter}^(1/${q}).`, why: RATIONAL_WHY.toExponential }],
  answer: `${rootOf(q, letter)} = ${letter}^(1/${q})`,
  key: letter,
});

const rationalPart = (shape, seed, used, ok) => {
  if (shape.kind === 'evaluate') return firstFitting(evaluateOptions(shape).filter(({ b }) => !used.has(b)), seed, (option) => evaluatePart(shape, option), ok);
  // The item's own index first (∛ stays a cube root), then any other.
  if (shape.kind === 'rootValue') return firstFitting(POWERS.filter(({ q, b }) => q === shape.q && !used.has(b)), seed, rootValuePart, ok) || firstFitting(POWERS.filter(({ b }) => !used.has(b)), seed, rootValuePart, ok);
  if (shape.kind === 'realCheck') {
    const even = Math.floor(Number(seed) / 3) % 2 === 0;
    const options = POWERS.filter(({ q, b }) => (even ? q % 2 === 0 : q % 2 === 1) && !used.has(b)).flatMap((entry) => [1, 3].filter((p) => gcdOf(p, entry.q) === 1).map((p) => ({ ...entry, p })));
    return firstFitting(options, seed, (option) => realCheckPart(even, option), ok);
  }
  const letters = LETTERS.filter((letter) => letter !== shape.letter && !used.has(letter));
  if (shape.kind === 'toRadical') return firstFitting(letters.flatMap((letter) => [3, 4, 5, 6, 8, 9].filter((q) => q !== shape.q).map((q) => ({ letter, q }))), seed, toRadicalPart, ok);
  if (shape.kind === 'toExponential') {
    const indexes = shape.shape === 'exponential-square' ? [2] : [3, 4, 5, 6, 7].filter((q) => q !== shape.q);
    return firstFitting(letters.flatMap((letter) => indexes.map((q) => ({ letter, q }))), seed, toExponentialPart, ok);
  }
  return null;
};

const capitalised = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const rationalDraw = (plan, seed, ok = null) => {
  const used = new Set(plan.items.map((item) => Math.abs(Number(item.base) || 0)).filter(Boolean));
  const parts = [];
  for (const shape of plan.shapes) {
    const part = rationalPart(shape, seed + parts.length * 5, used, ok);
    if (!part) return null;
    used.add(part.key);
    parts.push(part);
  }
  return {
    prompt: `${capitalised(articleList(parts.map((part) => part.ask)))}.`,
    steps: parts.flatMap((part) => part.steps),
    answer: joinParts(parts.map((part) => part.answer)),
    problems: parts.map((part) => part.answer.split(' = ')[0]),
  };
};

export const rationalExponents = Object.freeze({ id: 'rationalExponents', standards: ['A2.7G'], claim: rationalClaim, draw: rationalDraw });

/* ======================================================== monomialRules */

// "(a⁻³)(a²b⁴)(c⁻¹) =", "n²/n¹⁰ =", "5a²b ÷ 5ab": an expression to simplify;
// "In the first expression, the exponent of a is −3 + 2 =": one base's exponent after it.
const monomialPartOf = (field) => {
  if (field.choice) return null;
  const label = plain(field.label);
  const exponent = /^In the first expression, the exponent of ([a-z]) is .+ =$/.exec(label);
  if (exponent) return { kind: 'exponentOf', letter: exponent[1] };
  const source = label.replace(/\s*=$/, '');
  const tree = parseMonomialExpression(source);
  if (!tree || tree.t === 'var' || tree.t === 'num') return null;
  const value = evaluateMonomial(tree);
  if (!value) return null;
  // A negative fractional exponent is simplified by rationalizing (x^(−2/3) =
  // x^(1/3)/x), not by moving it down: not a part this generator works.
  if (Object.values(value.v).some((exponent) => exponent.n < 0 && exponent.d !== 1)) return null;
  // Something to do: a product, a quotient or a power, not a monomial already simplified.
  if (!/[·÷/()]|\^/.test(source) && !(tree.t === 'prod' && tree.items.some((item) => item.paren))) return null;
  return { kind: 'simplify', tree, value };
};

const monomialClaim = (question, fields) => {
  if (!fields.length) return null;
  const parts = fields.map(monomialPartOf);
  if (parts.some((part) => !part)) return null;
  const expressions = parts.filter((part) => part.kind === 'simplify');
  if (!expressions.length) return null;
  // An exponent field names a base of the expression after it.
  if (parts.some((part, index) => part.kind === 'exponentOf' && parts[index + 1]?.kind !== 'simplify')) return null;
  return { parts };
};

const exponentsOfIn = (tree, letter) => {
  if (tree.t !== 'prod') return [];
  return tree.items.map(evaluateMonomial).map((part) => part?.v?.[letter]).filter(Boolean);
};

const signedSum = (values) => values.map((value, at) => (at === 0 ? qText(value) : value.n < 0 ? `${MINUS} ${qText(Q(-value.n, value.d))}` : `+ ${qText(value)}`)).join(' ');

const monomialDraw = (plan, seed, ok = null) => {
  const asks = [];
  const steps = [];
  const answers = [];
  const avoidLetters = [];
  for (let index = 0; index < plan.parts.length; index += 1) {
    const part = plan.parts[index];
    if (part.kind !== 'simplify') continue;
    const asked = plan.parts[index - 1]?.kind === 'exponentOf' ? plan.parts[index - 1] : null;
    let sibling = null;
    for (let turn = 0; turn < 40 && !sibling; turn += 1) {
      const mutated = mutateMonomial(part.tree, Number(seed) * 40 + turn + index * 3, { avoidLetters });
      if (!mutated) continue;
      const worked = monomialSteps(mutated);
      if (!worked || !sameKindOfResult(part.value, worked.value)) continue;
      const expression = expressionText(mutated);
      const extra = [];
      let extraAnswer = null;
      if (asked) {
        // The base that appears more than once, where the item names one.
        const named = Object.keys(evaluateMonomial(mutated)?.v || {}).concat(['m', 'p', 'k', 'r', 's', 't', 'u', 'w', 'v', 'g', 'h', 'd'])
          .find((letter) => exponentsOfIn(mutated, letter).length > 1);
        if (!named) continue;
        const exponents = exponentsOfIn(mutated, named);
        extra.push({ show: `In ${expression}, the base ${named} appears more than once. Its exponent is ${signedSum(exponents)} = ${qText(exponents.reduce(qAdd))}.`, why: 'Factors with the same base multiply by adding their exponents, so that base’s exponents are added first.' });
        extraAnswer = `exponent of ${named} = ${qText(exponents.reduce(qAdd))}`;
      }
      const answer = `${expression} = ${positiveForm(worked.value)}`;
      const partSteps = [...extra, ...worked.steps];
      if (ok && !ok([...partSteps.flatMap((step) => [step.show, step.why]), answer, extraAnswer].filter(Boolean))) continue;
      sibling = { expression, steps: partSteps, answers: [extraAnswer, answer].filter(Boolean), tree: mutated };
    }
    if (!sibling) return null;
    asks.push(sibling.expression);
    steps.push(...sibling.steps);
    answers.push(...sibling.answers);
    Object.keys(evaluateMonomial(sibling.tree)?.v || {}).forEach((letter) => avoidLetters.push(letter));
  }
  if (!asks.length) return null;
  return {
    prompt: `Simplify ${articleList(asks)}. Write each answer with positive exponents only. Assume no variable equals 0.`,
    steps,
    answer: joinParts(answers),
    problems: asks,
  };
};

export const monomialRules = Object.freeze({ id: 'monomialRules', standards: ['A2.7G', 'A2.7C'], claim: monomialClaim, draw: monomialDraw });

/* ======================================================== rootVocabulary */

const ORDINAL = Object.freeze({ 2: 'square', 3: 'cube', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh' });
const ORDINAL_INDEX = Object.freeze(Object.fromEntries(Object.entries(ORDINAL).map(([index, name]) => [name, Number(index)])));

export const VOCABULARY_WHY = Object.freeze({
  index: 'In ⁿ√b the small number n written in the crook of the root sign is the index: it says which root.',
  radicand: 'The number under the root sign is the radicand.',
  proof: 'a is an nth root of b exactly when aⁿ = b, so the statement that shows it raises a to the nth power.',
  principal: 'An even root of a positive number has two real values, one positive and one negative. The positive one is the principal root.',
  other: 'The other real root is the opposite of the principal root, because a negative number to an even power is positive.',
});

const vocabularyPartOf = (field) => {
  const label = plain(field.label);
  let match = new RegExp(`^Index of ${ROOT_SIGNS}(\\d+)$`).exec(label);
  if (match && !field.choice) return { kind: 'index', q: indexOfSign(match[1]), base: Number(match[2]) };
  match = new RegExp(`^Radicand of ${ROOT_SIGNS}(\\d+)$`).exec(label);
  if (match && !field.choice) return { kind: 'radicand', q: indexOfSign(match[1]), base: Number(match[2]) };
  match = /^Which statement shows that (\d+) is an? (\w+) root of (\d+)\?$/.exec(label);
  if (match && field.choice && ORDINAL_INDEX[match[2]]) return { kind: 'proof', q: ORDINAL_INDEX[match[2]], base: Number(match[3]) };
  match = /^The principal (\w+) root of (\d+)$/.exec(label);
  if (match && !field.choice && ORDINAL_INDEX[match[1]] % 2 === 0) return { kind: 'principal', q: ORDINAL_INDEX[match[1]], base: Number(match[2]) };
  match = /^The other real (\w+) root of (\d+)$/.exec(label);
  if (match && !field.choice && ORDINAL_INDEX[match[1]] % 2 === 0) return { kind: 'other', q: ORDINAL_INDEX[match[1]], base: Number(match[2]) };
  return null;
};

const vocabularyClaim = (question, fields) => {
  if (!fields.length) return null;
  const parts = fields.map(vocabularyPartOf);
  if (parts.some((part) => !part)) return null;
  const named = parts.find((part) => part.kind === 'index' || part.kind === 'radicand' || part.kind === 'proof');
  const even = parts.find((part) => part.kind === 'principal' || part.kind === 'other');
  return { parts, named, even };
};

const vocabularyDraw = (plan, seed, ok = null) => {
  const avoid = new Set(plan.parts.map((part) => part.base));
  const steps = [];
  const answers = [];
  const asks = [];
  const has = (kind) => plan.parts.some((part) => part.kind === kind);
  if (plan.named) {
    const named = firstFitting(POWERS.filter(({ q, b }) => q >= 3 && q !== plan.named.q && !avoid.has(b)), seed, ({ k, q, b }) => {
      const sign = rootOf(q, String(b));
      const partSteps = [];
      const partAnswers = [];
      if (has('index')) {
        partSteps.push({ show: `In ${sign} the index is ${q}: it is the ${ORDINAL[q] || `${q}th`} root.`, why: VOCABULARY_WHY.index });
        partAnswers.push(`index = ${q}`);
      }
      if (has('radicand')) {
        partSteps.push({ show: `The radicand is ${b}, the number under the root sign.`, why: VOCABULARY_WHY.radicand });
        partAnswers.push(`radicand = ${b}`);
      }
      if (has('proof')) {
        partSteps.push({ show: `${k} is ${ORDINAL[q] ? `a ${ORDINAL[q]}` : `an ${q}th`} root of ${b} because ${k}${superscript(q)} = ${b}.`, why: VOCABULARY_WHY.proof });
        partAnswers.push(`${k}${superscript(q)} = ${b}`);
      }
      return { ask: `name the parts of ${sign}`, steps: partSteps, answer: partAnswers.join('; '), key: b };
    }, ok);
    if (!named) return null;
    avoid.add(named.key);
    asks.push(named.ask);
    steps.push(...named.steps);
    answers.push(named.answer);
  }
  if (plan.even) {
    const even = firstFitting(POWERS.filter(({ q, b }) => q % 2 === 0 && !avoid.has(b) && b !== plan.even.base), seed + 3, ({ k, q, b }) => {
      const name = ORDINAL[q];
      const partSteps = [];
      const partAnswers = [];
      if (has('principal')) {
        partSteps.push({ show: `${k}${superscript(q)} = ${b}, so the principal ${name} root of ${b} is ${rootOf(q, String(b))} = ${k}.`, why: VOCABULARY_WHY.principal });
        partAnswers.push(`principal ${name} root = ${k}`);
      }
      if (has('other')) {
        partSteps.push({ show: `(${MINUS}${k})${superscript(q)} = ${b} too, so the other real ${name} root is ${MINUS}${rootSign(q)}${b} = ${MINUS}${k}.`, why: VOCABULARY_WHY.other });
        partAnswers.push(`other real ${name} root = ${MINUS}${k}`);
      }
      return { ask: `find both real ${name} roots of ${b}`, steps: partSteps, answer: partAnswers.join('; ') };
    }, ok);
    if (!even) return null;
    asks.push(even.ask);
    steps.push(...even.steps);
    answers.push(even.answer);
  }
  if (!steps.length) return null;
  return { prompt: `${asks.map((ask, index) => (index === 0 ? capitalised(ask) : ask)).join(', and then ')}.`, steps, answer: joinParts(answers) };
};

export const rootVocabulary = Object.freeze({ id: 'rootVocabulary', standards: ['A2.7G'], claim: vocabularyClaim, draw: vocabularyDraw });

export const EXPONENT_GENERATORS = Object.freeze([rationalExponents, monomialRules, rootVocabulary]);
