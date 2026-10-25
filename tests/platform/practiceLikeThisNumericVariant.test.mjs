/*
 * FB19: "PRACTISE ONE LIKE THIS" FOR AN ITEM WHOSE FAMILY HAS NO SIBLING —
 * THE ITEM ITSELF, WITH NEW NUMBERS (src/platform/supports/workedExample/numericVariant.js).
 *
 * D3 is "always offer an unscored practise one like this after the last miss";
 * a sibling came only from a question family, and 102 of the 220 real
 * Classwork/Practice items the decision was measured on had none. The first
 * kind of variant is a 3×3 linear system solved by hand. Measured the same
 * way (afterLastMiss.test.mjs: every real lesson, Classwork and Practice
 * sections, buildPracticeLikeThis at seed 0): 118 → 129 of those 220, and
 * 234 → 246 of the 859 in the lessons as they are now.
 *
 * Every variant is checked here independently of how it was made: the layout
 * and the ease of eliminating by hand against the item's, the solution against
 * the item's, the tool's own grader (the full Check path a student's work
 * takes), and every equation the worked solution writes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { create, all } from 'mathjs';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import {
  PRACTICE_LIKE_THIS_ROLES,
  PRACTICE_SOURCE,
  PRACTICE_VERDICT,
  buildPracticeLikeThis,
  checkPracticeAnswers,
} from '../../src/platform/supports/workedExample/practiceLikeThis.js';
import { buildNumericVariant } from '../../src/platform/supports/workedExample/numericVariant.js';
import { buildSimilarWorkedExample, questionHasSimilarExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { classifyLinearSystem, linearEquationForm } from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const math = create(all);

const DOL2 = 'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json';
const DAY1 = 'docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json';
const DAY2 = 'docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5.json';
const DAY2_FINAL = 'docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json';
const MATRICES = 'teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json';

// Every real Classwork/Practice item that gets a numeric variant, by name (a
// dropped item, or one gained without review, fails the first test).
const VARIED = [
  [DOL2, 'dol2r-cw-10'],
  [DAY1, '3x3-d1-cw-2'],
  [DAY1, '3x3-d1-pr-1'],
  [DAY1, '3x3-d1-pr-2'],
  [DAY1, '3x3-d1-pr-3'],
  [DAY1, '3x3-d1-pr-5'],
  [DAY2, '3x3-d2-cw-3'],
  [DAY2, '3x3-d2-pr-1'],
  [DAY2, '3x3-d2-pr-6'],
  [DAY2_FINAL, '3x3-d2-cw-3'],
  [DAY2_FINAL, '3x3-d2-pr-1'],
  [DAY2_FINAL, '3x3-d2-pr-6'],
];
// 3×3 items that are NOT varied, and why.
const NOT_VARIED = [
  [DAY2_FINAL, '3x3-d2-cw-1', 'infinitely many solutions: any variant has the same answer'],
  [DAY2_FINAL, '3x3-d2-pr-2', 'no solution: any variant has the same answer'],
  [DAY1, '3x3-d1-cw-1', 'the 3D model: a choice about what a solution means'],
  [DOL2, 'dol2r-pr-16', 'a family slot: its other instances are classmates\' questions'],
  [DOL2, 'dol2r-cw-9', 'a word problem, solved with the matrix calculator'],
  [DOL2, 'dol2r-cw-11', 'an error analysis that quotes the system in its text'],
  [MATRICES, 'l3m-cw-9', 'solved with the matrix calculator'],
  [MATRICES, 'l3m-pr-6', 'solved with the matrix calculator, not in whole numbers'],
];

const lessonFiles = () => {
  const files = [];
  readdirSync(join(ROOT, 'teacher-import-jsons')).forEach((folder) => readdirSync(join(ROOT, 'teacher-import-jsons', folder))
    .filter((name) => name.endsWith('.json'))
    .forEach((name) => files.push(`teacher-import-jsons/${folder}/${name}`)));
  readdirSync(join(ROOT, 'docs/assignments')).filter((name) => name.endsWith('.json')).forEach((name) => files.push(`docs/assignments/${name}`));
  files.push('SAMPLE_AUTHORING_INTENT_V5.json');
  return files;
};
const compiledItems = new Map();
const itemsOf = (file) => {
  if (!compiledItems.has(file)) {
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(join(ROOT, file), 'utf8')));
    compiledItems.set(file, compiled.package.sections.flatMap((section) => section.questions.map((question) => ({ role: section.role, question }))));
  }
  return compiledItems.get(file);
};
const lessonItem = (file, id) => {
  const found = itemsOf(file).find((entry) => entry.question.questionId === id);
  assert.ok(found, `${id} is in ${file}`);
  return found;
};

/* ------------------------------------------------- reading a system, independently */

const equationsOf = (prompt) => (String(prompt).match(/\$[^$]+\$/g) || []).map((math) => math.slice(1, -1));
// The layout of an equation: its numbers blanked, the sign of the right side ignored.
const shapeOf = (equation) => equation.replace(/=\s*-?\d+\s*$/, '= #').replace(/\d+/g, '#');
const coefficientsOf = (equations, variables) => equations.map((equation) => {
  const form = linearEquationForm(equation, variables);
  assert.ok(form, `${equation} is linear in ${variables.join(', ')}`);
  return { coefficients: variables.map((name) => form.coefficients[name]), constant: form.constant };
});
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
// How hard eliminating by hand is, counted the plain way.
const difficulty = (rows) => {
  let effort = 0;
  let noScaling = 0;
  let twoAtOnce = 0;
  for (let first = 0; first < 3; first += 1) {
    for (let second = first + 1; second < 3; second += 1) {
      const [a, b] = [rows[first].coefficients, rows[second].coefficients];
      a.forEach((value, index) => {
        const [p, q] = [Math.abs(value), Math.abs(b[index])];
        const step = p === q ? 0 : (p % q === 0 || q % p === 0 ? 1 : 2);
        effort += step;
        if (!step) noScaling += 1;
      });
      [[0, 1], [0, 2], [1, 2]].forEach(([p, q]) => { if (a[p] * b[q] === a[q] * b[p]) twoAtOnce += 1; });
    }
  }
  return {
    effort,
    noScaling,
    twoAtOnce,
    divides: rows.map((row) => row.coefficients.reduce((g, c) => gcd(g, c), row.constant) > 1),
    size: rows.flatMap((row) => row.coefficients).filter((c) => Math.abs(c) > 1).reduce((sum, c) => sum + Math.abs(c), 0),
  };
};
const answerOf = (answer, variables) => {
  const values = Object.fromEntries(String(answer).split(/,\s*/).map((piece) => piece.split('=').map((side) => side.trim())).map(([name, value]) => [name, Number(value)]));
  return variables.map((name) => values[name]);
};
const workFor = (rows, variables, values) => ({
  dimension: 3,
  method: 'elimination',
  values: Object.fromEntries(variables.map((name, index) => [name, values[index]])),
  verification: Object.fromEntries(rows.map((row, at) => [`E${at + 1}`, { left: String(row.coefficients.reduce((sum, c, index) => sum + c * values[index], 0)), right: String(row.constant) }])),
});

/* ------------------------------------------------------------------- tests */

test('FB19: exactly the static 3×3 systems solved by hand get a variant — no other real Classwork/Practice item, and none of the 3×3 items that must not', () => {
  const varied = [];
  let classworkAndPractice = 0;
  lessonFiles().forEach((file) => itemsOf(file).forEach(({ role, question }) => {
    if (!PRACTICE_LIKE_THIS_ROLES.includes(role)) return;
    classworkAndPractice += 1;
    const practice = buildPracticeLikeThis(question, { seed: 0 });
    if (practice?.source === PRACTICE_SOURCE.NUMERIC_VARIANT) varied.push(`${file}::${question.questionId}`);
  }));
  assert.ok(classworkAndPractice >= 859, `the real lessons are read (${classworkAndPractice})`);
  assert.deepEqual(varied.sort(), VARIED.map(([file, id]) => `${file}::${id}`).sort());
  VARIED.forEach(([file, id]) => assert.ok(PRACTICE_LIKE_THIS_ROLES.includes(lessonItem(file, id).role), `${id} is Classwork or Practice`));
  NOT_VARIED.forEach(([file, id, why]) => {
    const { question } = lessonItem(file, id);
    assert.equal(buildNumericVariant(question, { seed: 0 }), null, `${id}: ${why}`);
  });
  // The family slot as a student is shown it — a generated instance with whole-number equations — is still not varied.
  const slot = lessonItem(DOL2, 'dol2r-pr-16').question;
  const shown = generateQuestion(slot, 'fb19-check|student-a|0|variant:0');
  assert.equal(shown.equations.length, 3, 'the instance is a 3×3 system');
  assert.equal(buildNumericVariant(shown, { seed: 0 }), null, 'a family instance is never varied');
});

const SEEDS = 20;

test('FB19: a variant keeps the item\'s layout and is never easier to eliminate by hand', () => {
  VARIED.forEach(([file, id]) => {
    const { question } = lessonItem(file, id);
    const variables = question.variables || ['x', 'y', 'z'];
    const item = coefficientsOf(question.equations, variables);
    const itemSolution = variables.map((name) => classifyLinearSystem(question.equations.map((equation) => linearEquationForm(equation, variables)), variables).solution[name]);
    const hard = difficulty(item);
    const smallest = Math.max(6, ...itemSolution.filter((value) => Math.abs(value) < 10).map(Math.abs));
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const variant = buildPracticeLikeThis(question, { seed });
      assert.equal(variant?.source, PRACTICE_SOURCE.NUMERIC_VARIANT, `${id} seed ${seed}: a variant`);
      const equations = equationsOf(variant.prompt);
      assert.equal(equations.length, 3, `${id}: the prompt shows the three equations — ${variant.prompt}`);
      assert.deepEqual(equations.map(shapeOf), question.equations.map(shapeOf), `${id}: the same layout, ±1 kept, signs kept — ${equations.join(' | ')}`);
      if (question.method === 'elimination') assert.match(variant.prompt, /^Solve the system by elimination: /);
      const rows = coefficientsOf(equations, variables);
      const values = answerOf(variant.answer, variables);
      const easy = difficulty(rows);
      assert.ok(easy.effort >= hard.effort, `${id}: as much scaling (${easy.effort} ≥ ${hard.effort})`);
      assert.ok(easy.noScaling <= hard.noScaling, `${id}: no more pairs without scaling`);
      assert.ok(easy.twoAtOnce <= hard.twoAtOnce, `${id}: no more pairs that cancel two variables at once`);
      easy.divides.forEach((divides, at) => assert.ok(!divides || hard.divides[at], `${id}: equation ${at + 1} does not divide down unless the item's does — ${equations[at]}`));
      assert.ok(easy.size >= hard.size, `${id}: coefficients as large overall`);
      assert.ok(rows.every((row) => row.constant !== 0) || item.some((row) => row.constant === 0), `${id}: no 0 on the right that the item does not have`);
      // The solution: whole numbers of the item's size, never 0, at least as many negatives.
      values.forEach((value, index) => {
        const own = itemSolution[index];
        assert.ok(Number.isInteger(value) && value !== 0, `${id}: ${variables[index]} = ${value} is a whole number, not 0`);
        if (Math.abs(own) < 10) assert.ok(Math.abs(value) <= smallest, `${id}: ${variables[index]} = ${value} stays small`);
        else assert.ok(Math.sign(value) === Math.sign(own) && Math.abs(value) >= 10 && Math.abs(Math.abs(value) - Math.abs(own)) <= 10, `${id}: ${variables[index]} = ${value} is two digits like ${own}`);
      });
      assert.ok(values.filter((value) => value < 0).length >= itemSolution.filter((value) => value < 0).length, `${id}: at least as many negatives`);
    }
  });
});

test('FB19: a variant never gives the item away, and the tool\'s own grader agrees with its key', () => {
  VARIED.forEach(([file, id]) => {
    const { question } = lessonItem(file, id);
    const variables = question.variables || ['x', 'y', 'z'];
    const itemRows = coefficientsOf(question.equations, variables);
    const itemSolution = variables.map((name) => classifyLinearSystem(question.equations.map((equation) => linearEquationForm(equation, variables)), variables).solution[name]);
    const itemWritten = [`(${itemSolution.join(', ')})`, `(${itemSolution.join(',')})`, variables.map((name, index) => `${name} = ${itemSolution[index]}`).join(', ')];
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const variant = buildPracticeLikeThis(question, { seed });
      const equations = equationsOf(variant.prompt);
      const values = answerOf(variant.answer, variables);
      values.forEach((value, index) => assert.notEqual(value, itemSolution[index], `${id}: ${variables[index]} differs from the item's`));
      const everything = [variant.prompt, ...variant.steps, variant.answer].join('\n');
      itemWritten.forEach((written) => assert.ok(!everything.includes(written), `${id}: the item's answer ${written} appears nowhere`));
      assert.notDeepEqual(equations, question.equations);
      // The variant's solution is the system's one solution …
      const solved = classifyLinearSystem(equations.map((equation) => linearEquationForm(equation, variables)), variables);
      assert.equal(solved.type, 'unique');
      assert.deepEqual(variables.map((name) => solved.solution[name]), values);
      // … and the Systems Workspace grader, through the tool's own Check path and the item's rubric, says so.
      const asQuestion = { ...question, equations };
      const rows = coefficientsOf(equations, variables);
      assert.equal(gradeToolCheck(systemsWorkspaceGrader, asQuestion, workFor(rows, variables, values)).isCorrect, true, `${id}: its key is graded right`);
      assert.equal(gradeToolCheck(systemsWorkspaceGrader, asQuestion, workFor(rows, variables, values.map((value, index) => (index === 0 ? value + 1 : value)))).isCorrect, false, `${id}: off by one is graded wrong`);
      assert.equal(gradeToolCheck(systemsWorkspaceGrader, asQuestion, workFor(rows, variables, itemSolution)).isCorrect, false, `${id}: the item's own answer does not answer it`);
      assert.equal(gradeToolCheck(systemsWorkspaceGrader, question, workFor(itemRows, variables, itemSolution)).isCorrect, true, `${id}: (the item's key, for comparison)`);
    }
  });
});

test('FB19: every equation the worked solution writes is true, and it ends by checking all three', () => {
  VARIED.forEach(([file, id]) => {
    const { question } = lessonItem(file, id);
    const variables = question.variables || ['x', 'y', 'z'];
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const variant = buildPracticeLikeThis(question, { seed });
      const values = answerOf(variant.answer, variables);
      const scope = Object.fromEntries(variables.map((name, index) => [name, values[index]]));
      assert.ok(variant.steps.length >= 4, `${id}: a worked solution`);
      let written = 0;
      variant.steps.forEach((step) => equationsOf(step).filter((math) => math.includes('=')).forEach((equation) => {
        const [left, right] = equation.split('=');
        // (+ 0: mathjs reads "-(0)" as -0.)
        assert.equal(math.evaluate(left, scope) + 0, math.evaluate(right, scope) + 0, `${id}: "${equation}" in "${step}"`);
        written += 1;
      }));
      assert.ok(written >= 8, `${id}: it writes its work (${written} equations)`);
      const last = variant.steps.at(-1);
      assert.match(last, /^Check in all three original equations: /);
      assert.equal(equationsOf(last).length, 3);
      // Each check substitutes the answer (no letter left).
      equationsOf(last).forEach((check) => assert.doesNotMatch(check, /[a-z]/i, `${id}: ${check}`));
    }
  });
});

test('FB19: the student answers each variable in its own box, checked like any practice box', () => {
  const { question } = lessonItem(DAY1, '3x3-d1-pr-5');
  const variant = buildPracticeLikeThis(question, { seed: 0 });
  assert.deepEqual(variant.parts.map((part) => [part.label, part.checkable]), [['x =', true], ['y =', true], ['z =', true]]);
  const values = answerOf(variant.answer, ['x', 'y', 'z']);
  const responses = (list) => Object.fromEntries(variant.parts.map((part, index) => [part.id, list[index]]));
  // As MathLive sends them, and with the variable written in front.
  const right = checkPracticeAnswers(variant, responses([String(values[0]), `y=${values[1]}`, String(values[2])]));
  assert.equal(right.allCorrect, true);
  const oneWrong = checkPracticeAnswers(variant, responses([String(values[0]), String(values[1] + 1), String(values[2])]));
  assert.deepEqual(oneWrong.parts.map((part) => part.verdict), [PRACTICE_VERDICT.CORRECT, PRACTICE_VERDICT.INCORRECT, PRACTICE_VERDICT.CORRECT]);
  assert.equal(oneWrong.allCorrect, false);
  // The item's own answer, typed into the variant, is wrong in every box.
  const itemSolution = [2, -1, 3];
  assert.deepEqual(checkPracticeAnswers(variant, responses(itemSolution.map(String))).parts.map((part) => part.verdict), [PRACTICE_VERDICT.INCORRECT, PRACTICE_VERDICT.INCORRECT, PRACTICE_VERDICT.INCORRECT]);
  // Other variables, in the item's order.
  const triangle = buildPracticeLikeThis(lessonItem(DAY2, '3x3-d2-pr-6').question, { seed: 0 });
  assert.deepEqual(triangle.parts.map((part) => part.label), ['s =', 'm =', 'l =']);
});

test('FB19: only after the item has closed — the Hint panel never offers a variant, and "another one" is a new system', () => {
  VARIED.forEach(([file, id]) => {
    const { question } = lessonItem(file, id);
    assert.equal(buildSimilarWorkedExample(question), null, `${id}: no "Try a similar one" while the item is open`);
    assert.equal(questionHasSimilarExample(question), false);
  });
  const { question } = lessonItem(DAY1, '3x3-d1-pr-3');
  const first = buildPracticeLikeThis(question, { seed: 4 });
  assert.deepEqual(buildPracticeLikeThis(question, { seed: 4 }), first, 'the same seed, the same problem (a re-render never swaps it)');
  const second = buildPracticeLikeThis(question, { seed: 4, avoidPrompts: [first.prompt] });
  const third = buildPracticeLikeThis(question, { seed: 4, avoidPrompts: [first.prompt, second.prompt] });
  assert.equal(new Set([first.prompt, second.prompt, third.prompt]).size, 3, 'another one, and another');
});

test('FB19: what is not varied — a word problem, a family slot, substitution, a term on the right, a solution that is not whole', () => {
  const { question } = lessonItem(DAY1, '3x3-d1-pr-5');
  assert.ok(buildNumericVariant(question, { seed: 0 }), 'the item as authored is varied');
  const not = (changed, why) => assert.equal(buildNumericVariant({ ...question, ...changed }, { seed: 0 }), null, why);
  not({ prompt: 'Three friends spent 4 dollars in all. Solve the system.' }, 'a prompt that quotes a number');
  not({ context: { scenario: 'Three friends buy tickets.', quantities: [] } }, 'a word problem\'s context');
  not({ questionFamily: { scope: 'assignment' } }, 'a family slot');
  not({ method: 'substitution' }, 'substitution is not worked here');
  not({ equations: ['x + y = 4 - z', '2x - y + z = 8', '3x + 2y - z = 1'] }, 'a term on the right');
  not({ equations: ['x + y + z = 4', '2x - y + z = 8', '3x + 2y - z = 2'] }, 'a solution that is not whole numbers');
  not({ equations: ['x + y = 4', '2x - y + z = 8', '3x + 2y - z = 1'] }, 'a variable missing from an equation');
  not({ type: 'matrixLab', mode: 'solve' }, 'the matrix calculator');
});
