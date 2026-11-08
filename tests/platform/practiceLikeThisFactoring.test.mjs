/*
 * "PRACTISE ONE LIKE THIS" FOR ALGEBRA II FACTORING POLYNOMIALS (practice
 * coverage, 2026-11: 2 of the lesson's 27 Classwork and Practice items, and
 * none of its Honors twin's 25, offered one, so a student who missed a
 * factoring item's last try got the worked solution and nothing to try again).
 *
 * Its factoring items now get the item itself with new numbers
 * (src/platform/supports/workedExample/factoringVariant.js, numericVariant.js's
 * fourth kind). Every variant is checked here independently of how it was made,
 * from the item's own polynomials written out below (the lesson's text), with
 * the platform's own polynomial readers:
 *   - which items get one, and why the others do not (a step asked as a partial
 *     factoring, a substitution, the ac method's own boxes, a sort, a family
 *     slot, a word problem);
 *   - each polynomial keeps its terms, letters, exponents, signs and order; each
 *     factoring keeps the item's factors (the same kinds of factor, a 1 kept), its
 *     prime factors stay prime, and its numbers are as large;
 *   - never one of the item's answers, nor anything with a key's value;
 *   - every "=" its steps write is true, and they arrive at each key;
 *   - the item's own boxes grade every key right, and the polynomial left
 *     unfactored, a factor off by one or the item's own key wrong;
 *   - the student's answer is checked by that same box: any order of the factors
 *     or a sign moved between them is right, the polynomial expanded is not;
 *   - only after the item closes (the Hint panel offers none), in Spanish too;
 *   - and the items' own hints, back-up steps and worked solutions are exactly as
 *     they were (tests/platform/fixtures/factoringSupportSurfaces.json, saved
 *     from the commit before this kind).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  PRACTICE_LIKE_THIS_ROLES,
  PRACTICE_SOURCE,
  PRACTICE_VERDICT,
  buildPracticeLikeThis,
  checkPracticeAnswers,
  checkPracticePart,
} from '../../src/platform/supports/workedExample/practiceLikeThis.js';
import { NUMERIC_VARIANT_KIND, buildNumericVariant } from '../../src/platform/supports/workedExample/numericVariant.js';
import { readFactoringItem } from '../../src/platform/supports/workedExample/factoringVariant.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { parsePolynomial, samePolynomial } from '../../functions/shared/algebraicForm.mjs';
import { parseFactoredProduct } from '../../functions/shared/factoredPolynomialExpressionEquivalence.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import '../../functions/shared/formSpecificFieldGrading.mjs';
import { TRANSLATION_COVERAGE, loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';
import { supportSurfacesOf } from './helpers/supportSurfaces.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FACTORING = 'teacher-import-jsons/algebra2-polynomials-radicals/1_Factoring_Polynomials.json';
const FACTORING_HONORS = 'teacher-import-jsons/algebra2-polynomials-radicals-honors/1_Factoring_Polynomials_Honors.json';

/* Each varied item's polynomials, written out from the lesson, one per factoring box, in order. */
const WORK = Object.freeze({
  'fp-cw-1': ['12xy+24xy^2-30x^2y^4'],
  'fp-cw-2': ['15a-3ab+4b-20'],
  'fp-cw-3': ['x^3+5x^2-2x-10'],
  'fp-cw-7': ['49x^2+28x+4', '25a^2-36b^2'],
  'fp-p-2': ['3ab^2+15a^2b^2+27ab^3'],
  'fp-p-3': ['4xy+3y-20x-15', '-2xy-10x+3y+15'],
  'fp-p-4': ['d^3+2d^2+4d+8', 'r^2+4rs^2+2sr+8s^3'],
  'fp-p-6': ['x^2-10x+16', 'x^2+4x-5', 'x^2-5x-24'],
  'fp-p-8': ['4x^2+10x+6', '3x^2+26x+35'],
  'fp-p-9': ['x^2+12x+36', '9x^2-12x+4', '9b^4-25'],
  'fp-p-10': ['54x^5+128x^2y^3', '8c^3-g^3'],
  'fp-p-12': ['y^4-625', '256-n^4'],
  'fp-p-13': ['9x^5-36x', '5x^3+25x^2-45x-225'],
});
// Each box's name, as the practice labels it.
const LABELS = Object.freeze({
  'fp-cw-1': ['GCF =', 'Factored form ='],
  'fp-cw-2': ['First group =', 'Second group =', 'Factored form ='],
  'fp-cw-3': ['First group =', 'Second group =', 'Factored form ='],
  'fp-cw-7': ['First =', 'Second ='],
  'fp-p-2': ['Factored form ='],
  'fp-p-3': ['First =', 'Second ='],
  'fp-p-4': ['First =', 'Second ='],
  'fp-p-6': ['First =', 'Second =', 'Third ='],
  'fp-p-8': ['First =', 'Second ='],
  'fp-p-9': ['First =', 'Second =', 'Third ='],
  'fp-p-10': ['First =', 'Second ='],
  'fp-p-12': ['First =', 'Second ='],
  'fp-p-13': ['First =', 'Second ='],
});
// The lessons' other Classwork and Practice items, and why none is varied.
const NOT_VARIED = Object.freeze({
  [FACTORING]: {
    'fp-cw-4': 'the Polynomial Workshop: its family works a sibling',
    'fp-cw-5': 'the ac method asked box by box: a · c, the two numbers as a set, and a choice',
    'fp-cw-6': 'a sort: its answer is words',
    'fp-cw-8': 'the cubes asked step by step ("a =", the trinomial factor)',
    'fp-cw-9': 'a step asked as a partial factoring (the difference of squares first)',
    'fp-cw-10': 'quadratic form: what u is, and choices',
    'fp-cw-11': 'a step asked as a partial factoring (after the GCF and grouping)',
    'fp-p-1': 'a family slot',
    'fp-p-5': 'a family slot in the Polynomial Workshop: its family works a sibling',
    'fp-p-7': 'a family slot',
    'fp-p-11': 'a sort: its answer is words',
    'fp-p-14': 'a family slot',
    'fp-p-15': 'a step asked as a partial factoring (after grouping)',
    'fp-p-16': 'quadratic form: what u is, and a choice',
  },
  [FACTORING_HONORS]: {
    'fph-cw-1': 'four terms that must be rearranged before they group',
    'fph-cw-2': 'six terms, and a step asked as a partial factoring',
    'fph-cw-3': 'a substitution u = x², and zeros as a set',
    'fph-cw-4': 'a substitution, and the ac method\'s a · c box',
    'fph-cw-5': 'a substitution u = x³',
    'fph-cw-6': 'a substitution u = x + 1',
    'fph-cw-7': 'an error analysis: two first steps and a choice',
    'fph-cw-8': 'an error analysis: Jordan\'s work',
    'fph-cw-9': 'parameters: every k, as a set',
    'fph-cw-10': 'a sort: its answer is words',
    'fph-cw-11': 'a word problem (the open box)',
    'fph-p-1': 'a family slot',
    'fph-p-2': 'a family slot',
    'fph-p-3': 'read, but x⁸ − 1 has no number to change: every number in it is a 1, which stays 1',
    'fph-p-4': 'a substitution u = 2x − 1',
    'fph-p-5': 'x⁴ + 64, which these methods do not finish',
    'fph-p-6': 'a family slot',
    'fph-p-7': 'a step asked as a partial factoring (after the GCF and grouping)',
    'fph-p-8': 'a family slot',
    'fph-p-9': 'three terms and one grouped: a perfect square, then a difference of squares',
    'fph-p-10': 'parameters: every c, as a set',
    'fph-p-11': 'a word problem (the box)',
    'fph-p-12': 'a family slot',
    'fph-p-13': 'a proof: n³ − n, a choice and a number',
    'fph-p-14': 'a family slot',
  },
});

const lessonFiles = () => {
  const files = [];
  readdirSync(join(ROOT, 'teacher-import-jsons')).forEach((folder) => readdirSync(join(ROOT, 'teacher-import-jsons', folder))
    .filter((name) => name.endsWith('.json'))
    .forEach((name) => files.push(`teacher-import-jsons/${folder}/${name}`)));
  readdirSync(join(ROOT, 'docs/assignments')).filter((name) => name.endsWith('.json')).forEach((name) => files.push(`docs/assignments/${name}`));
  files.push('SAMPLE_AUTHORING_INTENT_V5.json');
  return files;
};
const compiled = new Map();
const itemsOf = (file) => {
  if (!compiled.has(file)) {
    const lesson = compileAuthoringIntentV5(JSON.parse(readFileSync(join(ROOT, file), 'utf8')));
    compiled.set(file, lesson.package.sections.flatMap((section) => section.questions.map((question) => ({ role: section.role, question }))));
  }
  return compiled.get(file);
};
const itemById = (file, id) => {
  const found = itemsOf(file).find((entry) => entry.question.questionId === id);
  assert.ok(found, `${id} is in ${file}`);
  return found.question;
};
const factoringItem = (id) => itemById(FACTORING, id);

/* ------------------------------------------------ reading mathematics, independently */

const plain = (math) => String(math).replace(/\\left|\\right/g, '').replace(/\\cdot/g, '*').replace(/\^\{(\d+)\}/g, '^$1')
  .replace(/[−–]/g, '-').replace(/\s+/g, '');
const valueOf = (math) => {
  const value = parsePolynomial(plain(math));
  assert.ok(value, `${math} reads as a polynomial`);
  return value;
};
const same = (left, right) => samePolynomial(valueOf(left), valueOf(right), 1e-9);
const mathOf = (line) => (String(line).match(/\$[^$]+\$/g) || []).map((piece) => piece.slice(1, -1));
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

/* A polynomial's terms as written: sign, number, and its letters' monomial key ("x^2y"). */
const termsOf = (math) => (plain(math).match(/[+-]?[^+-]+/g) || []).map((piece) => {
  const match = /^([+-]?)(\d*)(.*)$/.exec(piece);
  const letters = match[3];
  return { sign: match[1] === '-' ? -1 : 1, size: match[2] ? Number(match[2]) : 1, key: letters ? [...valueOf(letters).keys()][0] : '' };
});
/* Its layout: every term's sign and letters, in order, and whether its number is a 1. */
const layoutOf = (math) => termsOf(math).map((entry) => `${entry.sign < 0 ? '-' : '+'}${entry.size === 1 ? '1' : '#'}${entry.key || '·'}`).join(' ');

/*
 * A factored answer as the platform reads it (scalar × factors, a monomial's
 * letters one factor each). Its shape: every factor's terms (letters and signs,
 * the first term positive), the 1s among its numbers, and the scalar's sign and
 * whether it is 1 — never the other numbers.
 */
const factorsOf = (key) => {
  const product = parseFactoredProduct(plain(key));
  assert.ok(product, `${key} reads as a factored product`);
  return product;
};
const factorShape = (factor) => [...factor].map(([monomial, c]) => `${Math.sign(c) < 0 ? '-' : '+'}${Math.abs(c) === 1 ? '1' : '#'}${monomial || '·'}`).sort().join(' ');
const shapeOfKey = (key) => {
  const { scalar, factors } = factorsOf(key);
  return `${scalar < 0 ? '-' : '+'}${Math.abs(scalar) === 1 ? '1' : '#'} × ${factors.map(factorShape).sort().join(' × ')}`;
};
/* Which factors are the same polynomial: "1,1,1" for three different ones, "1,2" for (x + 4)²(x − 4). */
const repeatsOfKey = (key) => {
  const groups = [];
  factorsOf(key).factors.forEach((factor) => {
    const group = groups.find((entry) => samePolynomial(entry.factor, factor, 1e-9));
    if (group) group.count += 1;
    else groups.push({ factor, count: 1 });
  });
  return groups.map((entry) => entry.count).sort((a, b) => a - b).join(',');
};
/* The sizes of a factoring's numbers: the scalar and every factor's coefficients. */
const sizeOfKey = (key) => {
  const { scalar, factors } = factorsOf(key);
  return Math.abs(scalar) + factors.reduce((sum, factor) => sum + [...factor.values()].reduce((total, c) => total + Math.abs(c), 0), 0);
};

/*
 * Is a factor prime over the integers? Read independently: a factor linear in one
 * of its letters (a·t + R) is prime when a and R share no factor; one of the form
 * αu² + βuv + γv² (u, v monomials, v possibly 1) is prime when β² − 4αγ is not a
 * perfect square. Any other factor is not one this test can read (fails).
 */
const isSquare = (value) => value >= 0 && Math.round(Math.sqrt(value)) ** 2 === value;
const powersOf = (monomial) => Object.fromEntries([...monomial.matchAll(/([a-z])(?:\^(\d+))?/g)].map(([, letter, power]) => [letter, power ? Number(power) : 1]));
const isPrimeFactor = (factor) => {
  const entries = [...factor].map(([monomial, c]) => ({ powers: powersOf(monomial), c }));
  if (entries.length === 1) return Object.values(entries[0].powers).reduce((sum, power) => sum + power, 0) === 1;
  const content = entries.reduce((g, entry) => gcd(g, entry.c), 0);
  if (content !== 1) return false;
  const letters = [...new Set(entries.flatMap((entry) => Object.keys(entry.powers)))];
  // Linear in a letter: the terms with it (power 1) and the rest share no factor.
  for (const letter of letters) {
    if (!entries.every((entry) => (entry.powers[letter] || 0) <= 1)) continue;
    const withLetter = entries.filter((entry) => entry.powers[letter] === 1);
    const without = entries.filter((entry) => !entry.powers[letter]);
    if (withLetter.length !== 1 || !without.length) continue;
    const others = withLetter.concat(without);
    const shared = Object.keys(withLetter[0].powers).filter((name) => name !== letter && without.every((entry) => entry.powers[name]));
    return gcd(withLetter[0].c, without.reduce((g, entry) => gcd(g, entry.c), 0)) === 1 && shared.length === 0 && others.length >= 2;
  }
  // α u² + β uv + γ v²: three terms (or two, β = 0) whose letters' exponents are a square's.
  if (entries.length <= 3) {
    const byDegree = [...entries].sort((a, b) => Object.values(b.powers).reduce((s, p) => s + p, 0) - Object.values(a.powers).reduce((s, p) => s + p, 0));
    const [high, ...rest] = byDegree;
    const low = rest.at(-1);
    const middle = rest.length === 2 ? rest[0] : null;
    const even = (entry) => Object.values(entry.powers).every((power) => power % 2 === 0);
    if (even(high) && even(low)) {
      const alpha = high.c;
      const gamma = low.c;
      const beta = middle ? middle.c : 0;
      return !isSquare(beta * beta - 4 * alpha * gamma);
    }
  }
  assert.fail(`a factor this test cannot read: ${JSON.stringify([...factor])}`);
  return false;
};

/* The item's own keys, box by box. */
const keysOf = (question) => question.answerFields.filter((field) => field.type !== 'choice').map((field) => field.answer);

const SEEDS = 12;
const practicesOf = (question) => {
  const all = [];
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const practice = buildPracticeLikeThis(question, { seed });
    if (practice) all.push(practice);
  }
  return all;
};
const inTurn = (question, count = 3) => {
  const seen = [];
  for (let index = 0; index < count; index += 1) {
    const practice = buildPracticeLikeThis(question, { seed: 0, avoidPrompts: seen.map((entry) => entry.prompt) });
    if (!practice) break;
    seen.push(practice);
  }
  return seen;
};
/* The polynomials a variant asks about, in box order: its prompt's mathematics. */
const askedOf = (practice) => mathOf(practice.prompt);
/* The factoring boxes' keys of a practice (not the GCF's or a group's). */
const factorKeysOf = (practice) => practice.parts.filter((part) => !/^(?:GCF|First group|Second group) =$/.test(part.label)).map((part) => part.field.answer);

/* ------------------------------------------------------------------- tests */

test('Factoring Polynomials: exactly its factoring items get a factoring variant, in no other lesson', () => {
  const varied = [];
  let read = 0;
  lessonFiles().forEach((file) => itemsOf(file).forEach(({ role, question }) => {
    if (!PRACTICE_LIKE_THIS_ROLES.includes(role)) return;
    read += 1;
    if (buildNumericVariant(question, { seed: 0 })?.kind === NUMERIC_VARIANT_KIND.FACTORING) varied.push(`${file}::${question.questionId}`);
  }));
  assert.ok(read >= 1024, `the real lessons are read (${read})`);
  assert.deepEqual(varied.sort(), Object.keys(WORK).map((id) => `${FACTORING}::${id}`).sort());
  // The practice a closed item offers is that variant (no family sibling comes first).
  Object.keys(WORK).forEach((id) => {
    const practice = buildPracticeLikeThis(factoringItem(id), { seed: 0 });
    assert.equal(practice?.source, PRACTICE_SOURCE.NUMERIC_VARIANT, `${id}: a variant of the item`);
    assert.equal(practice.kind, NUMERIC_VARIANT_KIND.FACTORING);
  });
  // Every other Classwork and Practice item of both lessons, and why none is varied.
  [FACTORING, FACTORING_HONORS].forEach((file) => {
    const ids = itemsOf(file).filter(({ role }) => PRACTICE_LIKE_THIS_ROLES.includes(role)).map(({ question }) => question.questionId).sort();
    const listed = [...(file === FACTORING ? Object.keys(WORK) : []), ...Object.keys(NOT_VARIED[file])].sort();
    assert.deepEqual(ids, listed, `${file}: every item is varied or says why not`);
    Object.entries(NOT_VARIED[file]).forEach(([id, why]) => assert.equal(buildNumericVariant(itemById(file, id), { seed: 0 }), null, `${id}: ${why}`));
  });
  // fph-p-3 is read as factoring work, but every number of x⁸ − 1 is a 1: there is no variant of it.
  assert.ok(readFactoringItem(itemById(FACTORING_HONORS, 'fph-p-3')), 'fph-p-3 reads as factoring work');
  assert.equal(buildPracticeLikeThis(itemById(FACTORING_HONORS, 'fph-p-3'), { seed: 0 }), null);
});

test('the work written out here is the item\'s: each polynomial is its box\'s key multiplied out', () => {
  Object.entries(WORK).forEach(([id, polynomials]) => {
    const question = factoringItem(id);
    const factorFields = question.answerFields.filter((field) => field.gradingMode === 'factoredForm' && !/group/i.test(field.label));
    assert.equal(factorFields.length, polynomials.length, `${id}: one polynomial per factoring box`);
    factorFields.forEach((field, index) => assert.ok(same(field.answer, polynomials[index]), `${id}: ${field.answer} multiplies out to ${polynomials[index]}`));
  });
});

test('a variant keeps the item\'s polynomials and factorings, its prime factors stay prime, and it is never easier', () => {
  Object.entries(WORK).forEach(([id, polynomials]) => {
    const question = factoringItem(id);
    const ownKeys = question.answerFields.filter((field) => field.gradingMode === 'factoredForm' && !/group/i.test(field.label)).map((field) => field.answer);
    const practices = practicesOf(question);
    assert.ok(practices.length >= 1, `${id}: a variant`);
    practices.forEach((practice) => {
      const asked = askedOf(practice);
      assert.equal(asked.length, polynomials.length, `${id}: the prompt writes one polynomial per box — ${practice.prompt}`);
      const keys = factorKeysOf(practice);
      asked.forEach((math, index) => {
        const own = polynomials[index];
        assert.equal(layoutOf(math), layoutOf(own), `${id}: ${math} is laid out as ${own}`);
        assert.ok(!same(math, own), `${id}: new numbers`);
        // The answer is that polynomial factored, as the item's is: the same kinds of factor, its 1s kept.
        assert.ok(same(keys[index], math), `${id}: ${keys[index]} multiplies out to ${math}`);
        assert.equal(shapeOfKey(keys[index]), shapeOfKey(ownKeys[index]), `${id}: ${keys[index]} is factored as ${ownKeys[index]} is`);
        assert.equal(repeatsOfKey(keys[index]), repeatsOfKey(ownKeys[index]), `${id}: ${keys[index]} repeats a factor exactly where ${ownKeys[index]} does`);
        factorsOf(keys[index]).factors.forEach((factor) => assert.ok(isPrimeFactor(factor), `${id}: every factor of ${keys[index]} is prime`));
        assert.ok(sizeOfKey(keys[index]) >= sizeOfKey(ownKeys[index]), `${id}: ${keys[index]}'s numbers are as large as ${ownKeys[index]}'s`);
      });
    });
  });
});

test('a variant never gives the item away', () => {
  Object.keys(WORK).forEach((id) => {
    const question = factoringItem(id);
    const keys = keysOf(question);
    practicesOf(question).forEach((practice) => {
      practice.parts.forEach((part) => keys.forEach((key) => assert.ok(!same(part.expected, key), `${id}: ${part.expected} is not the item's ${key}`)));
      // Nothing the variant writes — prompt, step or answer — has the value of one of the item's keys.
      [practice.prompt, ...practice.steps, practice.answer].flatMap(mathOf).flatMap((math) => math.split('='))
        .filter((side) => parsePolynomial(plain(side)))
        .forEach((side) => keys.forEach((key) => assert.ok(!same(side, key), `${id}: "${side}" is not ${key}`)));
      // Nor is a key written anywhere, spaced or not.
      const everything = [practice.prompt, ...practice.steps, practice.answer].join('\n').replace(/\s+/g, '');
      keys.forEach((key) => assert.ok(!everything.includes(plain(key)), `${id}: ${key} is not written`));
    });
  });
});

test('every "=" in a variant\'s worked solution is true, and the steps arrive at each key', () => {
  Object.keys(WORK).forEach((id) => {
    const question = factoringItem(id);
    practicesOf(question).forEach((practice) => {
      let equations = 0;
      practice.steps.forEach((step) => mathOf(step).filter((math) => math.includes('=')).forEach((chain) => {
        const sides = chain.split('=');
        sides.slice(1).forEach((side) => assert.ok(same(sides[0], side), `${id}: "${chain}" in "${step}"`));
        equations += 1;
      }));
      assert.ok(equations >= practice.parts.length, `${id}: it writes its work (${equations} equations)`);
      // Each answer is where an equation of the steps ends (a common factor is named as it is found).
      practice.parts.forEach((part) => {
        const arrives = practice.steps.some((step) => mathOf(step).some((math) => (math.includes('=') ? plain(math.split('=').at(-1)) : plain(math)) === plain(part.expected)));
        assert.ok(arrives, `${id}: the steps arrive at ${part.label} ${part.expected}`);
      });
    });
  });
});

test('the item\'s own boxes grade every key right, and the polynomial unfactored, a factor off by one or the item\'s key wrong', () => {
  Object.keys(WORK).forEach((id) => {
    const question = factoringItem(id);
    const typedBoxes = question.answerFields.filter((field) => field.type !== 'choice');
    practicesOf(question).forEach((practice) => {
      // The practice asks the item's own boxes, keyed to the variant: the answer it shows is the key its box grades,
      // and a factoring box's key multiplies out to the polynomial the prompt asks about.
      assert.deepEqual(practice.parts.map((part) => [part.field.id, part.field.gradingMode || null]), typedBoxes.map((field) => [field.id, field.gradingMode || null]));
      practice.parts.forEach((part) => assert.equal(plain(part.expected), plain(part.field.answer), `${id}: ${part.label} shows the key its box grades`));
      factorKeysOf(practice).forEach((key, index) => assert.ok(same(key, askedOf(practice)[index]), `${id}: ${key} is ${askedOf(practice)[index]} factored`));
      const fields = typedBoxes.map((field, index) => ({ ...field, answer: practice.parts[index].field.answer }));
      const asked = { ...question, answerFields: fields };
      const grade = (answers) => gradeMultiAnswerResponse(asked, Object.fromEntries(fields.map((field, index) => [field.id, answers[index]]))).parts;
      const keys = fields.map((field) => field.answer);
      assert.ok(grade(keys).every((part) => part.isCorrect), `${id}: its keys are graded right`);
      const asks = askedOf(practice);
      practice.parts.forEach((part, index) => {
        // The item's own key; the key with its first number (not an exponent) one more.
        const nearMiss = plain(part.expected).replace(/(?<![\^\d])(\d+)/, (digits) => String(Number(digits) + 1));
        assert.notEqual(nearMiss, plain(part.expected), `${id}: a near miss of ${part.expected}`);
        const wrong = [keysOf(question)[index], nearMiss];
        // A factoring box: the polynomial left unfactored.
        if (!/^(?:GCF|First group|Second group) =$/.test(part.label)) wrong.push(plain(asks[factorKeysOf(practice).indexOf(part.field.answer)]));
        wrong.forEach((answer) => assert.equal(grade(keys.map((key, at) => (at === index ? answer : key)))[index].isCorrect, false, `${id}: ${part.label} ${answer} is wrong`));
      });
    });
  });
});

test('the student answers each box, checked by the item\'s own box: any order of the factors is right, the polynomial expanded is not', () => {
  Object.keys(WORK).forEach((id) => {
    const question = factoringItem(id);
    const practice = buildPracticeLikeThis(question, { seed: 0 });
    assert.deepEqual(practice.parts.map((part) => part.label), LABELS[id], `${id}: the boxes`);
    const asks = askedOf(practice);
    practice.parts.forEach((part) => {
      assert.equal(part.checkable, true, `${id}: ${part.label} is checked`);
      const written = plain(part.expected);
      const mathLive = written.replace(/\(/g, '\\left(').replace(/\)/g, '\\right)').replace(/\^(\d+)/g, '^{$1}');
      assert.equal(checkPracticePart(part, part.expected), PRACTICE_VERDICT.CORRECT, `${id}: ${part.expected} as written`);
      assert.equal(checkPracticePart(part, mathLive), PRACTICE_VERDICT.CORRECT, `${id}: ${mathLive}, as MathLive sends it`);
      const brackets = written.match(/\([^()]+\)(?:\^\d)?/g) || [];
      if (brackets.length >= 2) {
        const front = written.slice(0, written.indexOf('('));
        const reversed = `${front}${[...brackets].reverse().join('')}`;
        assert.equal(checkPracticePart(part, reversed), PRACTICE_VERDICT.CORRECT, `${id}: ${reversed}, the factors in another order`);
      }
      if (!/^(?:GCF|First group|Second group) =$/.test(part.label)) {
        const expanded = plain(asks[factorKeysOf(practice).indexOf(part.field.answer)]);
        assert.equal(checkPracticePart(part, expanded), PRACTICE_VERDICT.INCORRECT, `${id}: ${expanded}, the polynomial unfactored, is not a factoring`);
      }
    });
    // The item's own answers, typed into the variant, are wrong in every box.
    const keys = keysOf(question);
    const result = checkPracticeAnswers(practice, Object.fromEntries(practice.parts.map((part, index) => [part.id, keys[index]])));
    assert.deepEqual(result.parts.map((part) => part.verdict), practice.parts.map(() => PRACTICE_VERDICT.INCORRECT), `${id}: the item's answers do not answer it`);
  });
  // A sign moved between factors is the same factoring (the item's own comparator).
  const [first] = buildPracticeLikeThis(factoringItem('fp-p-6'), { seed: 0 }).parts;
  const [, a, b] = /^\(x - (\d+)\)\(x - (\d+)\)$/.exec(first.expected) || [];
  assert.ok(a && b, `fp-p-6's first key is (x − a)(x − b): ${first.expected}`);
  assert.equal(checkPracticePart(first, `(${a}-x)(${b}-x)`), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(first, `-(x-${a})(${b}-x)`), PRACTICE_VERDICT.CORRECT);
});

test('only once the item has closed: the Hint panel offers no sibling, and "another one" is a new problem', () => {
  Object.keys(WORK).forEach((id) => {
    const question = factoringItem(id);
    assert.equal(familyFor(question), null, `${id}: no question family speaks to it`);
    assert.equal(buildSimilarWorkedExample(question), null, `${id}: no "Try a similar one" while it is open`);
  });
  const question = factoringItem('fp-p-6');
  const first = buildPracticeLikeThis(question, { seed: 3 });
  assert.deepEqual(buildPracticeLikeThis(question, { seed: 3 }), first, 'the same seed, the same problem');
  assert.equal(new Set(inTurn(question).map((practice) => practice.prompt)).size, 3, 'another one, and another');
  // fp-p-12's numbers can only grow: y⁴ − 625 and 256 − n⁴ have one variant whose numbers stay in range.
  const [only, ...rest] = inTurn(factoringItem('fp-p-12'));
  assert.deepEqual(askedOf(only).map(plain), ['y^4-1296', '625-n^4']);
  assert.deepEqual(rest, []);
});

test('a variant reads in Spanish, every sentence of it', async () => {
  const pack = await loadLanguagePack('es');
  let texts = 0;
  Object.keys(WORK).forEach((id) => inTurn(factoringItem(id)).forEach((practice) => {
    [practice.prompt, ...practice.steps, `Answer: ${practice.answer}`].forEach((text) => {
      const result = translateWithPack(text, pack);
      assert.equal(result.coverage, TRANSLATION_COVERAGE.FULL, `${id}: ${text}\n→ ${result.sentences.filter((sentence) => !sentence.translated && !sentence.mathOnly).map((sentence) => sentence.source).join(' | ')}`);
      texts += 1;
    });
  }));
  assert.ok(texts > 200, `${texts} texts`);
  const [practice] = inTurn(factoringItem('fp-p-6'));
  assert.match(translateWithPack(practice.steps[0], pack).text, /^Halla dos números cuyo producto sea \$/);
});

test('the hints, back-up steps and worked solutions of both factoring lessons are exactly as they were', () => {
  const before = JSON.parse(readFileSync(join(ROOT, 'tests/platform/fixtures/factoringSupportSurfaces.json'), 'utf8'));
  const files = [FACTORING, FACTORING_HONORS];
  assert.deepEqual(Object.keys(before), files);
  files.forEach((file) => {
    const now = supportSurfacesOf(file);
    assert.equal(now.length, before[file].length, `${file}: every item`);
    now.forEach((row, index) => assert.deepEqual(row, before[file][index], `${file} ${row.questionId} (${row.instance})`));
  });
  // The saved copy holds what it says: every varied item's authored hints and its worked solution.
  const rows = before[FACTORING];
  Object.keys(WORK).forEach((id) => {
    const row = rows.find((entry) => entry.questionId === id && entry.instance === 'template');
    assert.ok(row.hints.length >= 1 && row.hints.every((hint) => hint.startsWith('authored: ')), `${id}: its authored hint ladder`);
    assert.ok(row.review?.reasoning?.length >= 1, `${id}: its worked solution`);
  });
  assert.ok(before[FACTORING_HONORS].some((row) => row.instance === 'dealt'), 'a family item is read as it is dealt too');
});
