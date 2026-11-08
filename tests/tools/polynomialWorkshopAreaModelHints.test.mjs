/*
 * THE POLYNOMIAL WORKSHOP'S AREA MODEL HINTS SPEAK TO THE ITEM (display and
 * reading polish; the Add & Subtract hints did the same first:
 * polynomialWorkshopAddSubtractHints.test.mjs).
 *
 * The area model showed the same fixed hints on every item. Its second, "a² ·
 * 3a = 3a³, because a² · a = a³", filled in Operations on Polynomials CW 10's
 * first cell before the last hint, and spoke of a on items in x, y and m; the
 * binomial view opened with "An area model is just organised distribution" on
 * Algebra II Honors L4 CW 3 and PR 2, which have no hints of their own. Now
 * (areaModelHints.js), on every item the lessons and the Recovery family give,
 * and on the shapes a teacher can write, in both views:
 *   - the hints are written with the item's own factors;
 *   - the first asks a question;
 *   - no hint but the last gives a cell's or a box's answer (a cell, the
 *     product, the expanded coefficients) or does the step: before the last,
 *     a hint writes a cell only as the cell's own label does;
 *   - the last works one cell out and says which cells combine;
 *   - the platform's ladder shows them all, reads them aloud in words, and,
 *     as for every tool's hints until the Spanish review (AX07), Translate
 *     says it has no Spanish for them, as for the old ones.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { areaModelKey, polynomialTermsLatex, polynomialTermsPlainText, termLatex, termPlainText } from '../../src/tools/polynomialWorkshop/polynomialMath.js';
import { areaProductText, binomialProductText, binomialTermTexts, polynomialReadoutText } from '../../src/tools/polynomialWorkshop/polynomialReadout.js';
import { areaModelHints, coefficientAreaHints } from '../../src/tools/polynomialWorkshop/areaModelHints.js';
import { questionHintAudit } from '../../src/platform/supports/hints/questionHints.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { TRANSLATION_COVERAGE, TRANSLATION_GAP, resolveTranslation } from '../../src/platform/language/translationProviders.js';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import { polynomialMultiply } from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';
import { answersStated, stepsDone } from '../platform/helpers/polynomialStepsStated.mjs';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const lesson = (file) => compileTeacherImport(readFileSync(new URL(`../../teacher-import-jsons/${file}`, import.meta.url), 'utf8')).questions
  .filter((question) => question.type === 'polynomialWorkshop' && question.mode === 'multiplyArea');
const LESSONS = [
  ...lesson('algebra2-honors-module2/L1_Operations_on_Polynomials.json'),
  ...lesson('algebra2-honors-module1/L4_Operations_on_Functions_Composition.json'),
  ...lesson('algebra2-polynomials-radicals/1_Factoring_Polynomials.json'),
];
const writesFactors = (question) => typeof question.leftFactor === 'string' || typeof question.rightFactor === 'string';
const byId = (id) => LESSONS.find((question) => question.questionId === id);

/* ------------------------------------------- the view with written factors */

// The Recovery family behind the lesson's exit ticket 2: none of its versions has a hint of its own.
const familyItems = (() => {
  const family = getPlatformQuestionFamily('polynomials.multiplyTrinomialBinomial');
  const { values } = resolveFamilyConstraints(family, {});
  const sequence = createFamilyInstanceSequence(family, values, 'workshop-area-model-hints');
  return Array.from({ length: 120 }, (_, index) => sequence.instanceAt(index)).filter(Boolean)
    .map((instance) => buildFamilyQuestion({ family, instance, constraintValues: values, authored: { questionId: `family-${instance.fingerprint}` }, tool: family.defaultTool }));
})();

// The shapes a teacher can write that the lessons do not: two binomials, a
// square, a number times a binomial, decimals, two letters with a monomial,
// and like terms that cancel.
const written = (leftFactor, rightFactor) => ({ questionId: `(${leftFactor})(${rightFactor})`, type: 'polynomialWorkshop', mode: 'multiplyArea', leftFactor, rightFactor });
const shapes = [
  written('2x+3', 'x-4'),
  written('x+1', 'x+1'),
  written('3', 'x+2'),
  written('0.5x+2', '4x-6'),
  written('-2a^2b', '3ab^2-a'),
  written('x-2', 'x+2'),
  written('-t-3', '-t+5'),
];
const factorItems = [...LESSONS.filter(writesFactors), ...familyItems, ...shapes];
const modelOf = (question) => areaModelKey(question);
const hintsOf = (question) => areaModelHints(modelOf(question));

// Each cell's label as the board draws it: a negative factor in brackets.
const factorText = (term) => (term.coefficient < 0 ? `(${termPlainText(term)})` : termPlainText(term));
const cellLabels = (model) => model.rows.flatMap((row) => model.columns.map((column) => `${factorText(row)} · ${factorText(column)}`));
// The Workshop's own boxes, as answer fields the step readers understand: each
// cell, then the product. What the student reads includes the board: the
// factors above the grid and each cell's label.
const factorBoxes = (model) => [
  ...model.cells.map((cell, index) => ({ id: `term-${Math.floor(index / model.columns.length) + 1}-${(index % model.columns.length) + 1}`, answer: termLatex(cell) })),
  { id: 'product', answer: polynomialTermsLatex(model.product) },
];
const factorBoard = (model) => [`(${polynomialTermsPlainText(model.rows)})(${polynomialTermsPlainText(model.columns)})`, ...cellLabels(model)].join('\n');
const withFactorBoxes = (question) => {
  const model = modelOf(question);
  return { ...question, prompt: [question.prompt, factorBoard(model)].filter(Boolean).join('\n'), answerFields: factorBoxes(model) };
};
const factorWork = (question) => [`(${question.leftFactor})(${question.rightFactor})`];

/* ------------------------------------------------- the binomial view */

// Algebra II Honors L4 CW 3 and PR 2, and Factoring Polynomials' Warm-Up 2 as dealt.
const dealtWarmups = (() => {
  const template = byId('fp-wu-2');
  return Array.from({ length: 12 }, (_, index) => generateQuestion(template, `area-model-hints|${index}`)).filter(Boolean);
})();
// A teacher's own binomials, named in the prompt as every lesson's are: a
// middle term that cancels, a negative leading term, no negatives, two.
const binomialShapes = [[[1, 2], [1, -2]], [[-1, 3], [2, -5]], [[3, 1], [1, 4]], [[-2, -1], [1, -3]]]
  .map(([leftBinomial, rightBinomial]) => ({
    questionId: binomialProductText(leftBinomial, rightBinomial),
    type: 'polynomialWorkshop',
    mode: 'multiplyArea',
    prompt: `Use the area model to multiply ${binomialProductText(leftBinomial, rightBinomial)}.`,
    leftBinomial,
    rightBinomial,
  }));
const binomialItems = [...LESSONS.filter((question) => !writesFactors(question) && question.leftBinomial.every(Number.isFinite)), ...dealtWarmups, ...binomialShapes];
const binomialHintsOf = (question) => coefficientAreaHints(question.leftBinomial, question.rightBinomial);
const asNumbers = (question) => [question.leftBinomial.map(Number), question.rightBinomial.map(Number)];
const binomialLabels = (left, right) => {
  const [rows, columns] = [binomialTermTexts(left), binomialTermTexts(right)];
  return rows.flatMap((row) => columns.map((column) => areaProductText(row, column)));
};
// The four cells hold numbers; the expanded box is the product, read as a
// polynomial and as its numbers one by one.
const binomialBoxes = (left, right) => {
  const [a, b] = left;
  const [c, d] = right;
  const product = polynomialMultiply(left, right);
  return [
    ...[a * c, a * d, b * c, b * d].map((value, index) => ({ id: `cell-${index + 1}`, answer: String(value), inputProfile: 'number' })),
    { id: 'expanded', answer: polynomialReadoutText(product) },
    ...product.map((value, index) => ({ id: `expanded-${index + 1}`, answer: String(value), inputProfile: 'number' })),
  ];
};
const withBinomialBoxes = (question) => {
  const [left, right] = asNumbers(question);
  const board = [binomialProductText(left, right), ...binomialTermTexts(left), ...binomialTermTexts(right), ...binomialLabels(left, right)].join('\n');
  return { ...question, prompt: [question.prompt, board].filter(Boolean).join('\n'), answerFields: binomialBoxes(left, right) };
};
const binomialWork = (question) => {
  const [left, right] = asNumbers(question).map((pair) => polynomialReadoutText(pair).replace(/−/g, '-').replace(/\s+/g, ''));
  return [`(${left})(${right})`];
};

const allHints = () => [...factorItems.map((question) => [question, hintsOf(question)]), ...binomialItems.map((question) => [question, binomialHintsOf(question)])];

test('every item the hints are read on can be drawn, and each gets three', () => {
  assert.deepEqual(LESSONS.filter(writesFactors).map((question) => question.questionId), ['opp-cw-7', 'opp-cw-10', 'opp-pr-7', 'opp-pr-11', 'opp-dol-2']);
  assert.deepEqual(binomialItems.slice(0, 2).map((question) => question.questionId), ['q_classwork-2_2_3', 'q_practice-3_3_2']);
  assert.equal(familyItems.length, 120);
  assert.equal(dealtWarmups.length, 12);
  allHints().forEach(([question, hints]) => assert.equal(hints.length, 3, question.questionId));
  assert.deepEqual(areaModelHints(null), []);
  assert.deepEqual(coefficientAreaHints([1, '{{m}}'], [1, 2]), [], 'a template not yet dealt has no hints to write');
});

test('the hints are written with the item\'s own factors, never the old a² example', () => {
  factorItems.forEach((question) => {
    const model = modelOf(question);
    const [first] = hintsOf(question);
    assert.ok(first.includes(polynomialTermsPlainText(model.rows)) && first.includes(polynomialTermsPlainText(model.columns)), `${question.questionId}: "${first}" names the factors on screen`);
    if (!/a/.test(`${question.leftFactor}${question.rightFactor}`)) hintsOf(question).forEach((hint) => assert.doesNotMatch(hint, /a²|3a/, `${question.questionId}: "${hint}"`));
  });
  binomialItems.forEach((question) => {
    const [left, right] = asNumbers(question);
    const [first] = binomialHintsOf(question);
    assert.ok(first.includes(polynomialReadoutText(left)) && first.includes(polynomialReadoutText(right)), `${question.questionId}: "${first}"`);
    binomialHintsOf(question).forEach((hint) => assert.doesNotMatch(hint, /organised distribution|FOIL|diagonal/, `${question.questionId}: "${hint}"`));
  });
  // The walk's item, and L4 CW 3, read whole.
  assert.deepEqual(hintsOf(byId('opp-cw-10')), [
    'Each cell multiplies a term of a² + 3a − 4 by a term of a + 2. Do you multiply or add their coefficients, and do you multiply or add the exponents of a?',
    'What power of a does 3a · a have, and what number is in front of it? Once every cell is filled in, which cells have the same letters with the same exponents?',
    '3a · a = 3a²: multiply the coefficients and add the exponents of a. Then add the cells that are like terms, the a² cells and the a cells, and keep each other cell as it is.',
  ]);
  assert.deepEqual(binomialHintsOf(byId('q_classwork-2_2_3')), [
    'Each cell multiplies a term of 2x + 3 by a term of x − 4, and its box holds that product\'s signed coefficient. Do you add or multiply the two terms\' coefficients?',
    'Which cells multiply by a negative term, and what sign does each of those products have? Which two cells hold x terms? Their coefficients add to make the expanded polynomial\'s middle number.',
    'The x² cell multiplies the two x terms, the constant cell the two numbers, and each x cell an x term by a number: multiply their coefficients, and a negative times a positive is negative. Then add the two x cells\' coefficients for the middle number, and list the numbers from x² down to the constant, with a zero for any power that cancels.',
  ]);
  // A sign to watch is asked about first: CW 7's −y, DOL 2's −3x.
  assert.match(hintsOf(byId('opp-cw-7'))[1], /^Is \(−y\) · 4y² positive or negative/);
  assert.match(hintsOf(byId('opp-dol-2'))[1], /^Is \(−3x\) · x positive or negative/);
});

test('a hint asks before it tells: the first is a question', () => {
  allHints().forEach(([question, hints]) => assert.match(hints[0], /\?$/, question.questionId));
});

test('no hint but the last gives a cell\'s or a box\'s answer, or does the step', () => {
  const problems = [];
  let read = 0;
  const check = (question, hints, boxed, work) => hints.slice(0, -1).forEach((hint, index) => {
    read += 1;
    const stated = answersStated(hint, boxed);
    const done = stepsDone(hint, boxed, work);
    if (stated.length || done.length) problems.push(`${question.questionId} hint ${index + 1} ("${hint}") states ${stated.join(', ')} and writes ${done.join(', ')}`);
  });
  factorItems.forEach((question) => check(question, hintsOf(question), withFactorBoxes(question), factorWork(question)));
  binomialItems.forEach((question) => check(question, binomialHintsOf(question), withBinomialBoxes(question), binomialWork(question)));
  assert.deepEqual(problems, []);
  assert.equal(read, (factorItems.length + binomialItems.length) * 2);
  // What the readers count: the old second hint gives CW 10 its first cell.
  const cw10 = byId('opp-cw-10');
  const old = 'Multiply the numbers and keep the letters: a² · 3a = 3a³, because a² · a = a³ (add the exponents).';
  assert.ok(answersStated(old, withFactorBoxes(cw10)).includes('term-1-1 (a^{3})'), answersStated(old, withFactorBoxes(cw10)).join(', '));
});

test('the last hint works one cell out and says which cells combine; the binomial view\'s says the step in words', () => {
  factorItems.forEach((question) => {
    const model = modelOf(question);
    const last = hintsOf(question)[2];
    const stated = answersStated(last, withFactorBoxes(question));
    assert.ok(stated.some((box) => box.startsWith('term-')), `${question.questionId}: "${last}" works a cell out (${stated.join(', ')})`);
    assert.ok(!stated.some((box) => box.startsWith('product')), `${question.questionId}: "${last}" leaves the product to the student`);
    const kinds = new Map();
    model.cells.forEach((cell) => kinds.set(cell.signature, (kinds.get(cell.signature) || 0) + 1));
    const alike = model.cells.filter((cell, index) => kinds.get(cell.signature) > 1 && model.cells.findIndex((other) => other.signature === cell.signature) === index);
    if (!alike.length) assert.match(last, /No two cells are like terms/, question.questionId);
    alike.forEach((cell) => assert.ok(last.includes(`the ${cell.signature ? termPlainText({ ...cell, coefficient: 1 }) : 'constant'} cells`), `${question.questionId}: "${last}" names the ${termPlainText(cell)} cells`));
  });
  // PR 7's like terms cancel, and the last says so.
  assert.match(hintsOf(byId('opp-pr-7'))[2], /add to 0 drop out/);
  // In the binomial view every cell and the expanded list are numbers the
  // platform's leak guard reads as answers, so the last says the step in
  // words: what each cell multiplies, the item's own sign rules, and how the
  // list is written. It states no box (the ladder test below shows it).
  binomialItems.forEach((question) => {
    const [left, right] = asNumbers(question);
    const last = binomialHintsOf(question)[2];
    assert.deepEqual(answersStated(last, withBinomialBoxes(question)), [], `${question.questionId}: "${last}"`);
    assert.match(last, /The x² cell multiplies the two x terms, the constant cell the two numbers, and each x cell an x term by a number/);
    const pairs = [[left[0], right[0]], [left[0], right[1]], [left[1], right[0]], [left[1], right[1]]];
    assert.equal(/a negative times a positive is negative/.test(last), pairs.some(([row, column]) => (row < 0) !== (column < 0)), `${question.questionId}: "${last}"`);
    assert.equal(/a negative times a negative is positive/.test(last), pairs.some(([row, column]) => row < 0 && column < 0), `${question.questionId}: "${last}"`);
  });
});

test('the platform ladder shows every one of them, after the lesson\'s own hints', () => {
  allHints().forEach(([question, hints]) => {
    const audit = questionHintAudit(question, { toolHints: hints });
    const tool = audit.filter((hint) => hint.source === 'tool');
    assert.deepEqual(tool.map((hint) => hint.shown), [true, true, true], `${question.questionId}: ${JSON.stringify(tool.filter((hint) => !hint.shown))}`);
  });
});

test('read aloud says every hint in words, and Translate treats them as it did the old ones', async () => {
  const OLD = [
    'Every term of the first factor multiplies every term of the second — that is what the area model shows: one cell for each pair.',
    'An area model is just organised distribution — every cell is one of the products you would get from FOIL.',
  ];
  assert.match(speechTextFor(hintsOf(byId('opp-cw-10'))[1]), /What power of a does 3a times a have/);
  assert.match(speechTextFor(binomialHintsOf(byId('q_classwork-2_2_3'))[0]), /a term of 2x plus 3 by a term of x minus 4/);
  [...LESSONS.filter(writesFactors), ...familyItems.slice(0, 12), ...shapes].forEach((question) => hintsOf(question).forEach((hint) => {
    assert.doesNotMatch(speechTextFor(hint), /[−·⁰¹²³⁴⁵⁶⁷⁸⁹^]/, `read aloud leaves no symbol raw: ${hint}`);
  }));
  binomialItems.forEach((question) => binomialHintsOf(question).forEach((hint) => {
    assert.doesNotMatch(speechTextFor(hint), /[−·⁰¹²³⁴⁵⁶⁷⁸⁹^]/, `read aloud leaves no symbol raw: ${hint}`);
  }));
  for (const text of [...OLD, ...hintsOf(byId('opp-cw-10')), ...binomialHintsOf(byId('q_classwork-2_2_3'))]) {
    const result = await resolveTranslation({ text, language: 'es' });
    assert.deepEqual([result.coverage, result.reason], [TRANSLATION_COVERAGE.NONE, TRANSLATION_GAP.NO_RESOURCE], `English until the Spanish review (AX07): ${text}`);
  }
});

test('both area model views hand their item\'s hints to the panel, which reports each one used', () => {
  const source = executableSource(readFileSync(new URL('../../src/tools/polynomialWorkshop/PolynomialWorkshop.jsx', import.meta.url), 'utf8'));
  const binomial = region(source, 'function MultiplyArea(', 'const writesFactors', 'the binomial view');
  assert.match(binomial, /const hints = useMemo\(\(\) => coefficientAreaHints\(left, right\), \[left, right\]\);/);
  assert.match(binomial, /<HintPanel hints=\{hints\} onHintUsed=\{\(\) => onAction\?\.\("HINT_USED"\)\} \/>/);
  const factors = region(source, 'function MultiplyFactors(', 'function AddSubtract(', 'the written-factors view');
  assert.match(factors, /const hints = useMemo\(\(\) => areaModelHints\(model\), \[model\]\);/);
  assert.match(factors, /<HintPanel hints=\{hints\} onHintUsed=\{\(\) => onAction\?\.\("HINT_USED"\)\} \/>/);
  assert.doesNotMatch(`${binomial}${factors}`, /a² · a = a³|organised distribution|same diagonal/);
});
