/*
 * THE POLYNOMIAL WORKSHOP'S ADD & SUBTRACT HINTS SPEAK TO THE ITEM (the module 2
 * walk, 2026-11-06).
 *
 * The panel showed the same fixed hints on every add and subtract item: "The
 * opposite of a³ is −a³, the opposite of −3a is +3a, and the opposite of 2 is
 * −2." filled in all three of Operations on Polynomials CW 3's "Its opposite"
 * boxes before the last hint, and spoke of a³ on items in t or x. Now
 * (addSubtractHints.js), on every item the lessons and the Recovery family
 * give, and on the shapes a teacher can write:
 *   - the hints are written with the item's own polynomials;
 *   - the first asks a question;
 *   - no hint but the last gives a box's answer (an opposite, a combined
 *     column, the result) or does the step: before the last, a hint writes
 *     only what the problem shows;
 *   - the last shows the step;
 *   - the platform's ladder shows them all, reads them aloud in words, and,
 *     as for every tool's hints until the Spanish review (AX07), Translate
 *     says it has no Spanish for them, as for the old ones.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { addSubtractKey, polynomialTermsLatex, polynomialTermsPlainText, termLatex } from '../../src/tools/polynomialWorkshop/polynomialMath.js';
import { addSubtractHints } from '../../src/tools/polynomialWorkshop/addSubtractHints.js';
import { questionHintAudit } from '../../src/platform/supports/hints/questionHints.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { TRANSLATION_COVERAGE, TRANSLATION_GAP, resolveTranslation } from '../../src/platform/language/translationProviders.js';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { buildFamilyQuestion, createFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import { simplifiedPolynomialTerms } from '../../functions/shared/simplifiedPolynomialForm.mjs';
import { unicodeSuperscriptsToMathMarkup } from '../../src/mathDisplayFormat.js';
import { answersStated, stepsDone } from '../platform/helpers/polynomialStepsStated.mjs';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const LESSON = compileTeacherImport(readFileSync(new URL('../../teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json', import.meta.url), 'utf8')).questions;
const lessonItems = LESSON.filter((question) => question.type === 'polynomialWorkshop' && question.mode === 'addSubtract');
const byId = (id) => lessonItems.find((question) => question.questionId === id);

// The Recovery family behind the lesson's exit ticket 1: none of its versions has a hint of its own.
const familyItems = (() => {
  const family = getPlatformQuestionFamily('polynomials.subtractMissingTerm');
  const { values } = resolveFamilyConstraints(family, {});
  const sequence = createFamilyInstanceSequence(family, values, 'workshop-add-subtract-hints');
  return Array.from({ length: 120 }, (_, index) => sequence.instanceAt(index)).filter(Boolean)
    .map((instance) => buildFamilyQuestion({ family, instance, constraintValues: values, authored: { questionId: `family-${instance.fingerprint}` }, tool: family.defaultTool }));
})();

// The shapes a teacher can write that the lessons do not: a term with nothing
// like it, a column that cancels, only the constants alike, one term
// subtracted, two letters, decimals.
const written = (operation, firstPolynomial, secondPolynomial) => ({ questionId: `${firstPolynomial} ${operation} ${secondPolynomial}`, type: 'polynomialWorkshop', mode: 'addSubtract', operation, firstPolynomial, secondPolynomial });
const shapes = [
  written('add', 'x^2+1', '3x'),
  written('add', '4x^2+x', '-4x^2+2x'),
  written('add', 'x^2+3', '2x-5'),
  written('subtract', '5x^2+3', '2x'),
  written('add', '3xy-2y', 'xy+5y'),
  written('subtract', '0.5x+1.2', '0.3x-0.4'),
  written('subtract', '-y^3+2y', '4y^3-y^2-7'),
];

const items = [...lessonItems, ...familyItems, ...shapes];
const modelOf = (question) => addSubtractKey(question);
const hintsOf = (question) => addSubtractHints(modelOf(question));

// The Workshop's own boxes, as answer fields the step readers understand: each
// "Its opposite" box (subtracting), each column's "Combined" box, the result.
// A number box is read by the leak guard, so what the student reads includes
// the problem the board draws above its columns.
const workshopBoxes = (model) => [
  ...(model.operation === 'subtract' ? model.added.flatMap((term, index) => (term ? [{ id: `opposite-${index + 1}`, answer: termLatex(term) }] : [])) : []),
  ...model.sums.map((term, index) => ({ id: `sum-${index + 1}`, answer: termLatex(term) })),
  { id: 'result', answer: polynomialTermsLatex(model.result) },
];
const boardProblem = (model) => `(${polynomialTermsPlainText(model.first)}) ${model.operation === 'subtract' ? '−' : '+'} (${polynomialTermsPlainText(model.second)})`;
const withBoxes = (question) => {
  const model = modelOf(question);
  return { ...question, prompt: [question.prompt, boardProblem(model)].filter(Boolean).join('\n'), answerFields: workshopBoxes(model) };
};
const workOf = (question) => [`(${question.firstPolynomial})${question.operation === 'subtract' ? '-' : '+'}(${question.secondPolynomial})`];
// One term as a hint writes it ("5n²", "−1"), read the way the Workshop reads a typed term.
const readTerm = (text) => simplifiedPolynomialTerms(unicodeSuperscriptsToMathMarkup(text, 'latex').replace(/−/g, '-'))?.[0] || null;

test('every item the hints are read on can be drawn, and each gets three', () => {
  assert.deepEqual(lessonItems.map((question) => `${question.questionId} ${question.operation}`), ['opp-cw-3 subtract', 'opp-cw-4 add', 'opp-pr-6 subtract', 'opp-dol-1 subtract']);
  assert.equal(familyItems.length, 120);
  items.forEach((question) => assert.equal(hintsOf(question).length, 3, question.questionId));
  assert.deepEqual(addSubtractHints(null), []);
});

test('the hints are written with the item\'s own polynomials, never the old a³ example', () => {
  items.forEach((question) => {
    const model = modelOf(question);
    const [first] = hintsOf(question);
    assert.ok(first.includes(polynomialTermsPlainText(model.second)), `${question.questionId}: "${first}" names the polynomial on screen`);
    if (!/a/.test(`${question.firstPolynomial}${question.secondPolynomial}`)) {
      hintsOf(question).forEach((hint) => assert.doesNotMatch(hint, /a³|−3a|\+3a/, `${question.questionId}: "${hint}"`));
    }
  });
  // The walk's items, read whole.
  assert.deepEqual(hintsOf(byId('opp-cw-3')), [
    'What does the minus sign in front of (a³ − 3a + 2) do to each of its terms: change only the first one, or every one?',
    'What is the opposite of −3a? Write the opposite of every term of a³ − 3a + 2, each in its own column, then add down each column.',
    'Every term of a³ − 3a + 2 changes sign, so its opposites are −a³, 3a and −2. Now add down each column.',
  ]);
  assert.deepEqual(hintsOf(byId('opp-cw-4')), [
    'Which terms of 4x² − 9x + 3 and −2x² − 5x − 6 are like terms, with the same letters and the same exponents?',
    'In the x² column, do you add the coefficients of 4x² and −2x², or their exponents? Will their sum be positive or negative?',
    'Keep the letters and the exponents, and add the coefficients, watching the signs: 4x² + (−2x²) = 2x². Combine each other column the same way.',
  ]);
  assert.match(hintsOf(byId('opp-pr-6'))[1], /^What is the opposite of −16t²\?/);
});

test('a hint asks before it tells: the first is a question', () => {
  items.forEach((question) => assert.match(hintsOf(question)[0], /\?$/, question.questionId));
});

test('no hint but the last gives a box\'s answer or does the step', () => {
  const problems = [];
  let read = 0;
  items.forEach((question) => hintsOf(question).slice(0, -1).forEach((hint, index) => {
    read += 1;
    const stated = answersStated(hint, withBoxes(question));
    const done = stepsDone(hint, question, workOf(question));
    if (stated.length || done.length) problems.push(`${question.questionId} hint ${index + 1} ("${hint}") states ${stated.join(', ')} and writes ${done.join(', ')}`);
  }));
  assert.deepEqual(problems, []);
  assert.equal(read, items.length * 2);
  // What the readers count: the old second hint gives CW 3 every opposite.
  const cw3 = byId('opp-cw-3');
  const old = 'The opposite of a³ is −a³, the opposite of −3a is +3a, and the opposite of 2 is −2.';
  assert.deepEqual(answersStated(old, withBoxes(cw3)), ['opposite-1 (-a^{3})', 'opposite-2 (3a)', 'opposite-3 (-2)']);
});

test('the last hint shows the step: every opposite when subtracting, one column combined when adding', () => {
  items.forEach((question) => {
    const model = modelOf(question);
    const last = hintsOf(question)[2];
    const stated = answersStated(last, withBoxes(question));
    if (model.operation === 'subtract') {
      // Every opposite, by value: the list after "opposite(s) … is/are", term by term.
      const [, list = ''] = /opposites? (?:of \S+ )?(?:is|are) (.+?)\. Now/.exec(last) || [];
      const given = list.split(/, | and /).map(readTerm);
      model.second.forEach((term) => assert.ok(given.some((read) => read && read.signature === term.signature && Math.abs(read.coefficient + term.coefficient) < 1e-9),
        `${question.questionId}: "${last}" gives the opposite of ${polynomialTermsPlainText([term])}`));
    } else if (model.columns.some((_, index) => model.firstByColumn[index] && model.secondByColumn[index])) {
      assert.equal(stated.filter((box) => box.startsWith('sum-')).length >= 1, true, `${question.questionId}: "${last}" combines a column`);
    } else {
      assert.match(last, /stays as it is/, `${question.questionId}: with nothing alike, the last says nothing combines`);
    }
  });
});

test('the platform ladder shows every one of them, after the lesson\'s own hints', () => {
  items.forEach((question) => {
    const audit = questionHintAudit(question, { toolHints: hintsOf(question) });
    const tool = audit.filter((hint) => hint.source === 'tool');
    assert.deepEqual(tool.map((hint) => hint.shown), [true, true, true], `${question.questionId}: ${JSON.stringify(tool.filter((hint) => !hint.shown))}`);
  });
});

test('read aloud says every hint in words, and Translate treats them as it did the old ones', async () => {
  const OLD = [
    'Subtracting a polynomial is adding its opposite. The minus sign in front of the parentheses changes the sign of every term inside.',
    'Adding polynomials means combining like terms.',
  ];
  const spoken = speechTextFor(hintsOf(byId('opp-cw-3'))[0]);
  assert.match(spoken, /the quantity a cubed minus 3a plus 2/);
  items.slice(0, 12).concat(shapes).forEach((question) => hintsOf(question).forEach((hint) => {
    assert.doesNotMatch(speechTextFor(hint), /[−⁰¹²³⁴⁵⁶⁷⁸⁹^]/, `read aloud leaves no symbol raw: ${hint}`);
  }));
  for (const text of [...OLD, ...hintsOf(byId('opp-cw-3')), ...hintsOf(byId('opp-cw-4'))]) {
    const result = await resolveTranslation({ text, language: 'es' });
    assert.deepEqual([result.coverage, result.reason], [TRANSLATION_COVERAGE.NONE, TRANSLATION_GAP.NO_RESOURCE], `English until the Spanish review (AX07): ${text}`);
  }
});

test('the Add & Subtract view hands its item\'s hints to the panel, which reports each one used', () => {
  const source = executableSource(readFileSync(new URL('../../src/tools/polynomialWorkshop/PolynomialWorkshop.jsx', import.meta.url), 'utf8'));
  const view = region(source, 'function AddSubtract(', 'function FactorQuadratic(', 'the Add & Subtract view');
  assert.match(view, /const hints = useMemo\(\(\) => addSubtractHints\(model\), \[model\]\);/);
  assert.match(view, /<HintPanel hints=\{hints\} onHintUsed=\{\(\) => onAction\?\.\("HINT_USED"\)\} \/>/);
  assert.doesNotMatch(view, /The opposite of a³|Adding polynomials means combining/);
});
