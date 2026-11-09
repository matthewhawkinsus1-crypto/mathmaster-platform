/*
 * "PRACTISE ONE LIKE THIS" FOR THE MATRICES LESSON (Algebra II Honors module 1,
 * Solving Systems with Matrices; 2026-11-06 walkthrough: none of its
 * Classwork and Practice items offered one).
 *
 * Its printed systems solved with the Matrix Lab now get the system with new
 * numbers (src/platform/supports/workedExample/matrixSystemVariant.js,
 * numericVariant.js's third kind). Checked here independently of how each was
 * made, from the item's own equations:
 *   - which items, and why the others are not varied;
 *   - the same layout (a missing variable stays missing, ±1 kept, signs kept),
 *     never easier, and a solution of the item's kind, variable by variable;
 *   - never the item's solution;
 *   - the lab's own grader marks the variant's key right, through its Check;
 *   - every equation the steps write is true, and they end at the answer;
 *   - each variable in its own box, checked by value (a fraction or a decimal);
 *   - only once the item has closed, and in Spanish too.
 * The item's own hints, back-up step and worked solution, and the Warm-Up's
 * Recovery, are untouched (practiceLikeThisPolynomials.test.mjs holds the
 * first; recoveryMatricesFamilies.test.mjs and
 * matricesArrayRecordTotalsVersions.test.mjs the second).
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
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { classifyLinearSystem, linearEquationForm } from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { readMatrixLabQuestion } from '../../functions/shared/toolMath/matrixLab/matrixLabModel.mjs';
import { formatRational } from '../../functions/shared/toolMath/matrixLab/matrixMath.mjs';
import matrixLabGrader from '../../functions/shared/serverGrading/tools/matrixLab.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { TRANSLATION_COVERAGE, loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MATRICES = 'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json';
const DOL2 = 'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json';
const VARIABLES = ['x', 'y', 'z'];

// Each varied item's system and solution (the lesson's own; each solution worked by hand).
const VARIED = Object.freeze({
  'l3m-cw-9': { equations: ['2x - 3y = 7', 'y + z = -5', 'x + 2y + 4z = -17'], solution: [5, 1, -6] },
  'l3m-pr-5': { equations: ['2x + 2z = 2', '5x + 3y = 4', '3y - 4z = 4'], solution: [-4, 8, 5] },
  'l3m-pr-6': { equations: ['x - 4y + 3z = -7', '2x + 3y - 5z = 19', '4x + y - z = 17'], solution: [7 / 2, 3 / 2, -3 / 2] },
  'l3m-pr-7': { equations: ['2x - 3z = 4', '2x + y - 5z = -1', '3y - 4z = 2'], solution: [59 / 4, 12, 17 / 2] },
});
const NOT_VARIED = Object.freeze({
  'l3m-cw-1': 'locating elements of a store\'s inventory',
  'l3m-cw-2': 'locating elements of a store\'s inventory',
  'l3m-cw-3': 'the sprinters\' scores: a product in a story',
  'l3m-cw-4': 'a sort: its answer is words',
  'l3m-cw-5': 'Jackson\'s claim: an error analysis',
  'l3m-cw-6': 'are G and H inverses: a product and a yes or no',
  'l3m-cw-7': 'writing the matrix equation: matrices, not values',
  'l3m-cw-8': 'Nicky\'s error: an error analysis',
  'l3m-cw-10': 'a singular system: every variant has the same answer, in words',
  'l3m-pr-1': 'a product of matrices: a matrix is not a value a box can check',
  'l3m-pr-2': 'are A and B inverses: a product and a yes or no',
  'l3m-pr-3': 'are M and N inverses: a product and a yes or no',
  'l3m-pr-4': 'writing the matrix equation: matrices, not values',
  'l3m-pr-8': 'a singular system: every variant has the same answer, in words',
  'l3m-pr-9': 'designing third equations: many right answers',
  'l3m-pr-10': 'a word problem (the Key Club\'s baskets)',
  'l3m-pr-11': 'a word problem (the theater\'s tickets)',
  'l3m-pr-12-ccmr': 'exam practice with given matrices',
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
const matricesItem = (id) => {
  const found = itemsOf(MATRICES).find((entry) => entry.question.questionId === id);
  assert.ok(found, `${id} is in the matrices lesson`);
  return found.question;
};

/* ------------------------------------------- reading a system, independently */

const equationsOf = (prompt) => (String(prompt).match(/\$[^$]+\$/g) || []).map((math) => math.slice(1, -1));
// The layout of an equation: its numbers blanked (a ±1 stays unwritten), the sign of the right side ignored.
const layoutOf = (equation) => equation.replace(/[−–]/g, '-').replace(/=\s*-?\d+\s*$/, '= #').replace(/\d+/g, '#');
const rowsOf = (equations) => equations.map((equation) => {
  const form = linearEquationForm(equation, VARIABLES);
  assert.ok(form, `${equation} is linear in x, y, z`);
  return { coefficients: VARIABLES.map((name) => form.coefficients[name]), constant: form.constant };
});
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const divides = (row) => row.coefficients.reduce((g, c) => gcd(g, c), row.constant) > 1;
const solve = (equations) => {
  const solved = classifyLinearSystem(equations.map((equation) => linearEquationForm(equation, VARIABLES)), VARIABLES);
  assert.equal(solved.type, 'unique', `${equations.join(', ')} has one solution`);
  return VARIABLES.map((name) => solved.solution[name]);
};
const numberOf = (text) => {
  const fraction = /^(-?\d+)\/(\d+)$/.exec(String(text).trim());
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(text);
};
const valuesOf = (answer) => Object.fromEntries(String(answer).split(/,\s*/).map((piece) => piece.split('=').map((side) => side.trim()))
  .map(([name, value]) => [name, numberOf(value)]));
const denominatorOf = (value) => [1, 2, 4].find((d) => Number.isInteger(Math.round(value * d * 1e9) / 1e9)) || null;

const SEEDS = 10;
const practicesOf = (question) => {
  const all = [];
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const practice = buildPracticeLikeThis(question, { seed });
    if (practice) all.push(practice);
  }
  return all;
};

/* ------------------------------------------------------------------- tests */

test('the matrices lesson: exactly its printed systems with one solution get a matrix variant, in no other lesson', () => {
  const varied = [];
  lessonFiles().forEach((file) => itemsOf(file).forEach(({ role, question }) => {
    if (!PRACTICE_LIKE_THIS_ROLES.includes(role)) return;
    if (buildNumericVariant(question, { seed: 0 })?.kind === NUMERIC_VARIANT_KIND.MATRIX_SYSTEM) varied.push(`${file}::${question.questionId}`);
  }));
  assert.deepEqual(varied.sort(), Object.keys(VARIED).map((id) => `${MATRICES}::${id}`).sort());
  Object.entries(VARIED).forEach(([id, { equations, solution }]) => {
    const question = matricesItem(id);
    assert.deepEqual(question.equations, equations, `${id}: the system written out here is the item's`);
    assert.deepEqual(solve(equations), solution, `${id}: its solution`);
    const practice = buildPracticeLikeThis(question, { seed: 0 });
    assert.equal(practice?.source, PRACTICE_SOURCE.NUMERIC_VARIANT);
    assert.equal(practice.kind, NUMERIC_VARIANT_KIND.MATRIX_SYSTEM);
  });
  Object.entries(NOT_VARIED).forEach(([id, why]) => assert.equal(buildPracticeLikeThis(matricesItem(id), { seed: 0 }), null, `${id}: ${why}`));
  const lessonIds = itemsOf(MATRICES).filter(({ role }) => PRACTICE_LIKE_THIS_ROLES.includes(role)).map(({ question }) => question.questionId).sort();
  assert.deepEqual(lessonIds, [...Object.keys(VARIED), ...Object.keys(NOT_VARIED)].sort());
  // The DOL #2 review's matrix items are a story, an error analysis or a family slot.
  ['dol2r-cw-9', 'dol2r-cw-11', 'dol2r-pr-14', 'dol2r-pr-17'].forEach((id) => {
    const { question } = itemsOf(DOL2).find((entry) => entry.question.questionId === id);
    assert.notEqual(buildNumericVariant(question, { seed: 0 })?.kind, NUMERIC_VARIANT_KIND.MATRIX_SYSTEM, id);
  });
});

test('a variant keeps the item\'s layout, is never easier, and has a solution of the item\'s kind', () => {
  Object.entries(VARIED).forEach(([id, { equations, solution }]) => {
    const question = matricesItem(id);
    const item = rowsOf(equations);
    const itemSize = item.flatMap((row) => row.coefficients).reduce((sum, c) => sum + Math.abs(c), 0);
    const practices = practicesOf(question);
    assert.ok(practices.length >= 3, `${id}: variants`);
    practices.forEach((practice) => {
      const written = equationsOf(practice.prompt);
      assert.deepEqual(written.map(layoutOf), equations.map(layoutOf), `${id}: ${written.join(', ')} is laid out as ${equations.join(', ')}`);
      const rows = rowsOf(written);
      assert.ok(rows.flatMap((row) => row.coefficients).reduce((sum, c) => sum + Math.abs(c), 0) >= itemSize, `${id}: coefficients as large overall`);
      rows.forEach((row, at) => assert.ok(!divides(row) || divides(item[at]), `${id}: ${written[at]} does not divide down`));
      assert.ok(rows.filter((row) => row.constant === 0).length <= item.filter((row) => row.constant === 0).length);
      const values = solve(written);
      const answered = valuesOf(practice.answer);
      values.forEach((value, index) => {
        const own = solution[index];
        assert.ok(Math.abs(answered[VARIABLES[index]] - value) < 1e-9, `${id}: the answer is the system's solution`);
        assert.notEqual(value, own, `${id}: ${VARIABLES[index]} is not the item's`);
        assert.equal(denominatorOf(value), denominatorOf(own), `${id}: ${VARIABLES[index]} = ${value} is of the kind of ${own}`);
        if (Math.abs(own) < 10) assert.ok(value !== 0 && Math.abs(value) <= Math.max(6, Math.ceil(Math.abs(own))), `${id}: ${value} stays small`);
        else assert.ok(Math.sign(value) === Math.sign(own) && Math.abs(value) >= 10 && Math.abs(value) <= Math.ceil(Math.abs(own)) + 10, `${id}: ${value} is two digits like ${own}`);
      });
      assert.ok(values.filter((value) => value < 0).length >= solution.filter((value) => value < 0).length, `${id}: at least as many negatives`);
      if (values.some((value) => !Number.isInteger(value))) assert.match(practice.prompt, /Give exact answers\.$/);
    });
  });
});

test('the Matrix Lab\'s own Check marks a variant\'s key right, and the item\'s solution wrong', () => {
  Object.entries(VARIED).forEach(([id, { solution }]) => {
    const question = matricesItem(id);
    practicesOf(question).forEach((practice) => {
      const asked = { ...question, equations: equationsOf(practice.prompt) };
      const model = readMatrixLabQuestion(asked);
      const answered = valuesOf(practice.answer);
      const work = (values) => ({
        A: model.keyA.map((row) => row.map(formatRational)),
        B: model.keyB.map((row) => formatRational(row[0])),
        ...(model.askInverse ? { inverse: model.keyInverse.map((row) => row.map(formatRational)) } : {}),
        classification: 'one',
        values: values.map(String),
      });
      const key = VARIABLES.map((name) => answered[name]);
      assert.equal(gradeToolCheck(matrixLabGrader, asked, work(key)).isCorrect, true, `${id}: ${practice.answer} by the lab's Check`);
      assert.equal(gradeToolCheck(matrixLabGrader, asked, work(key.map((value, index) => (index === 1 ? value + 1 : value)))).isCorrect, false, `${id}: off by one`);
      assert.equal(gradeToolCheck(matrixLabGrader, asked, work(solution)).isCorrect, false, `${id}: the item's own solution`);
      // The item's solution is never written in it.
      const itemWritten = VARIABLES.map((name, index) => `${name} = ${solution[index]}`).join(', ');
      assert.ok(![practice.prompt, ...practice.steps, practice.answer].join('\n').replace(/−/g, '-').includes(itemWritten), `${id}: ${itemWritten} is not written`);
    });
  });
});

test('every equation the steps write is true, and the steps end at the answer', () => {
  Object.keys(VARIED).forEach((id) => {
    const question = matricesItem(id);
    practicesOf(question).forEach((practice) => {
      const answered = valuesOf(practice.answer);
      const [first, coefficients, ...rest] = practice.steps;
      // "Write each equation in standard form: …; …; …." — the prompt's equations, each true at the answer.
      const standard = first.replace(/^Write each equation in standard form: /, '').replace(/\.$/, '').split('; ').map((equation) => equation.replace(/−/g, '-'));
      assert.deepEqual(standard, equationsOf(practice.prompt), `${id}: ${first}`);
      rowsOf(standard).forEach((row, at) => {
        const left = row.coefficients.reduce((sum, c, index) => sum + c * answered[VARIABLES[index]], 0);
        assert.ok(Math.abs(left - row.constant) < 1e-9, `${id}: ${standard[at]} at ${practice.answer}`);
      });
      // A and B are those equations' coefficients and constants, 0 for a missing variable.
      const rows = rowsOf(standard);
      const A = `[${rows.map((row) => row.coefficients.join(', ')).join('; ')}]`.replace(/-/g, '−');
      const B = `[${rows.map((row) => row.constant).join('; ')}]`.replace(/-/g, '−');
      assert.ok(coefficients.includes(`A = ${A}`) && coefficients.includes(`B = ${B}`), `${id}: ${coefficients}`);
      const solved = rest.find((step) => step.startsWith('X = A⁻¹B = '));
      assert.ok(solved?.endsWith(`so ${practice.answer.replace(/-/g, '−')}.`), `${id}: ${solved}`);
      assert.equal(rest.at(-1), `Check: substitute ${practice.answer.replace(/-/g, '−')} into each original equation; every one is true.`);
      if (question.askInverse) assert.ok(rest.some((step) => step.startsWith('The calculator gives A⁻¹ = [')), `${id}: the inverse it asks for`);
    });
  });
});

test('each variable in its own box, checked by value: a fraction, a decimal or a mixed number is right', () => {
  const practice = buildPracticeLikeThis(matricesItem('l3m-pr-7'), { seed: 0 });
  assert.deepEqual(practice.parts.map((part) => [part.label, part.checkable]), [['x =', true], ['y =', true], ['z =', true]]);
  const answered = valuesOf(practice.answer);
  const [x, y, z] = practice.parts;
  const asText = (value) => String(value);
  assert.equal(checkPracticePart(x, x.expected), PRACTICE_VERDICT.CORRECT, `x = ${x.expected}`);
  assert.equal(checkPracticePart(x, asText(answered.x)), PRACTICE_VERDICT.CORRECT, `x as a decimal, ${answered.x}`);
  assert.equal(checkPracticePart(x, `\\frac{${x.expected.split('/')[0]}}{${x.expected.split('/')[1]}}`), PRACTICE_VERDICT.CORRECT, 'x as MathLive writes a fraction');
  const [top, bottom] = x.expected.split('/').map(Number);
  assert.equal(checkPracticePart(x, `${Math.floor(top / bottom)}\\frac{${top % bottom}}{${bottom}}`), PRACTICE_VERDICT.CORRECT, 'x as a mixed number');
  assert.equal(checkPracticePart(x, asText(answered.x + 0.25)), PRACTICE_VERDICT.INCORRECT);
  assert.equal(checkPracticePart(y, asText(answered.y)), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(z, `z=${z.expected}`), PRACTICE_VERDICT.CORRECT, 'with its variable in front');
  // The item's own solution is wrong in every box.
  const result = checkPracticeAnswers(practice, { [x.id]: '59/4', [y.id]: '12', [z.id]: '17/2' });
  assert.deepEqual(result.parts.map((part) => part.verdict), [PRACTICE_VERDICT.INCORRECT, PRACTICE_VERDICT.INCORRECT, PRACTICE_VERDICT.INCORRECT]);
});

test('only once the item has closed: no "Try a similar one" while it is open, and "another one" is a new system', () => {
  Object.keys(VARIED).forEach((id) => {
    const question = matricesItem(id);
    assert.equal(familyFor(question), null, `${id}: no question family speaks to it`);
    assert.equal(buildSimilarWorkedExample(question), null, `${id}: no sibling while it is open`);
  });
  const question = matricesItem('l3m-cw-9');
  const seen = [];
  for (let index = 0; index < 3; index += 1) seen.push(buildPracticeLikeThis(question, { seed: 0, avoidPrompts: seen.map((practice) => practice.prompt) }));
  assert.equal(new Set(seen.map((practice) => practice.prompt)).size, 3, 'another one, and another');
});

test('a matrices practice reads in Spanish, every sentence of it', async () => {
  const pack = await loadLanguagePack('es');
  let texts = 0;
  Object.keys(VARIED).forEach((id) => practicesOf(matricesItem(id)).slice(0, 3).forEach((practice) => {
    [practice.prompt, ...practice.steps, `Answer: ${practice.answer}`].forEach((text) => {
      const result = translateWithPack(text, pack);
      assert.equal(result.coverage, TRANSLATION_COVERAGE.FULL, `${id}: ${text}\n→ ${result.sentences.filter((sentence) => !sentence.translated && !sentence.mathOnly).map((sentence) => sentence.source).join(' | ')}`);
      texts += 1;
    });
  }));
  assert.ok(texts >= 60, `${texts} texts`);
});
