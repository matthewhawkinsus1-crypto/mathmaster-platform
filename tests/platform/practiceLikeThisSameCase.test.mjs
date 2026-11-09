/*
 * "PRACTISE ONE LIKE THIS" IN THE ITEM'S OWN CASE (2026-11-06 walkthrough of
 * Algebra I M3 T1, docs/qa/2026-11-06-a1-m3-t1-walkthrough/walkthrough.md:
 * "the student who missed the special case never practises it").
 *
 * After the last miss on L1 CW 11 or PR 14 (no solution), CW 13 (every real
 * number) or their Honors twins, the practice was a one-solution equation
 * ("Solve x + 8(x + 11) = 6x + 2(x + 3) + 79", x = −3) whose prompt dropped
 * "If no value of x makes the equation true, or every value does, say so":
 * the linear-equations family's sibling skipped equal coefficients and special
 * last moves. Now, once the item has closed, the practice is in the item's own
 * case, keeps its shape and its "say so" instruction, and is worked step by
 * step, every step keeping the case; it is never the item in disguise. While
 * the item is open, "Try a similar one" still works a one-solution equation,
 * so it never tells a relation-workspace student which case they drew.
 *
 * Every case and every value here is worked out again with mathjs in exact
 * fraction arithmetic from the equation the sibling shows, never read from
 * the family.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { compiled, readRepoFile, versionsOf } from './helpers/lessonFileChecks.mjs';
import { PRACTICE_VERDICT, buildPracticeLikeThis, checkPracticeAnswers, checkPracticePart, practiceCheckMessage, readPracticeAnswer } from '../../src/platform/supports/workedExample/practiceLikeThis.js';
import { buildSimilarWorkedExample, similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import * as linearEquations from '../../src/platform/supports/families/linearEquations.js';
import { latexToExpression } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const toMath = (side) => latexToExpression(String(side).trim());

/** left = right in `variable`: { case: 'one', value } | { case: 'none' } | { case: 'every' }, exactly. */
const solve = (left, right, variable) => {
  const node = math.parse(`(${toMath(left)}) - (${toMath(right)})`);
  const at = (value) => F(node.evaluate({ [variable]: F(value) }));
  const b = at(0);
  const a = math.subtract(at(1), b);
  assert.ok(math.equal(at(5), math.add(math.multiply(a, 5), b)), `${left} = ${right} is linear in ${variable}`);
  if (math.equal(a, 0)) return { case: math.equal(b, 0) ? 'every' : 'none' };
  return { case: 'one', value: math.divide(math.unaryMinus(b), a) };
};
const sidesOf = (equation) => equation.split('=').map((side) => side.trim());
const CASE_OF_ANSWER = { 'No solution': 'none', 'All real numbers': 'every' };

const DIR = 'teacher-import-jsons/algebra1-module3';
const lesson = (file) => compiled(readRepoFile(`${DIR}/${file}`)).questions;
const L1 = lesson('T1_L1_Solving_Linear_Equations.json');
const L1H = lesson('T1_L1_Solving_Linear_Equations_Honors.json');
const byId = (questions, id) => questions.find((question) => question.questionId === id);

/**
 * The item's case and the sibling's, read from their equations; every worked
 * step that shows an equation keeps the sibling's case; the answer says it;
 * the prompt asks to say so; the sibling is not the item.
 */
const verifySameCase = (question, practice) => {
  const label = `${question.questionId}: ${practice.prompt}`;
  const variable = question.solveFor || 'x';
  const item = solve(...sidesOf(question.equationLatex), variable);
  const prompt = /^Solve \$(.+)\$ for \$([A-Za-z])\$\. If no value of \$([A-Za-z])\$ makes the equation true, or every value does, say so\.$/.exec(practice.prompt);
  assert.ok(prompt, `${label}: a "solve" prompt that asks to say so`);
  assert.equal(prompt[2], variable, label);
  const sibling = solve(...sidesOf(prompt[1]), variable);
  assert.equal(sibling.case, item.case, `${label}: the item's own case`);
  assert.equal(CASE_OF_ANSWER[practice.answer], item.case, `${label}: its answer, ${practice.answer}`);
  // Not the item in disguise: another equation, with other sides.
  assert.notEqual(prompt[1].replace(/\s+/g, ''), question.equationLatex.replace(/\s+/g, ''), label);
  // Each step that reaches an equation keeps the case; the last step checks it at a value.
  practice.steps.slice(0, -1).forEach((step) => {
    const shown = /\$([^$]*=[^$]*)\$/.exec(step);
    if (!shown) return;
    const reached = solve(...sidesOf(shown[1]), variable);
    assert.equal(reached.case, item.case, `${label}: "${step}" keeps the case`);
  });
  const check = practice.steps.at(-1);
  const at = /^Check: with \$([A-Za-z]) = 1\$, (?:both sides of \$([^$]+)\$ equal \$([^$]+)\$|the left side of \$([^$]+)\$ is \$([^$]+)\$ and the right side is \$([^$]+)\$)/.exec(check);
  assert.ok(at, `${label}: "${check}"`);
  const [left, right] = sidesOf(at[2] || at[4]);
  const valueOf = (side) => F(math.evaluate(toMath(side), { [variable]: F(1) }));
  const number = (shown) => F(math.evaluate(toMath(shown)));
  if (item.case === 'every') assert.ok(math.equal(valueOf(left), number(at[3])) && math.equal(valueOf(right), number(at[3])), `${label}: the check`);
  else assert.ok(math.equal(valueOf(left), number(at[5])) && math.equal(valueOf(right), number(at[6])) && !math.equal(number(at[5]), number(at[6])), `${label}: the check`);
  return prompt[1];
};

test('L1 CW 11, CW 13 and PR 14, and Honors CW 11 and CW 12: the practice is in the item\'s own case, and asks to say so', () => {
  const ITEMS = [[L1, 'm3l1-cw-11', 'none'], [L1, 'm3l1-cw-13', 'every'], [L1, 'm3l1-pr-14', 'none'], [L1H, 'm3l1h-cw-11', 'none'], [L1H, 'm3l1h-cw-12', 'every']];
  ITEMS.forEach(([questions, id, expected]) => {
    const question = byId(questions, id);
    assert.equal(solve(...sidesOf(question.equationLatex), question.solveFor).case, expected, `${id} is the case the walkthrough named`);
    // The first two, as "Another one like this" deals them: different problems, both in the case.
    const first = buildPracticeLikeThis(question, { seed: 0 });
    const second = buildPracticeLikeThis(question, { seed: 0, avoidPrompts: [first.prompt] });
    assert.notEqual(first.prompt, second.prompt);
    [first, second].forEach((practice) => verifySameCase(question, practice));
  });
});

test('every version of the slots that deal a special case: its practice is in its own case', () => {
  let special = 0;
  let kept = 0;
  const fallback = [];
  [[L1, ['m3l1-pr-5', 'm3l1-pr-6']], [L1H, ['m3l1h-pr-3', 'm3l1h-pr-4']]].forEach(([questions, ids]) => ids.forEach((id) => {
    versionsOf(byId(questions, id)).forEach((version) => {
      const shown = version.equationLatex || version.equation;
      const [left, right] = sidesOf(shown);
      const item = solve(left, right, 'x');
      const practice = buildPracticeLikeThis(version, { seed: 0 });
      assert.ok(practice, `${id}: ${shown} offers a practice`);
      if (item.case === 'one') return;
      special += 1;
      if (CASE_OF_ANSWER[practice.answer]) {
        verifySameCase({ ...version, equationLatex: shown, solveFor: 'x' }, practice);
        kept += 1;
      } else {
        // A shape no same-case draw fits keeps the one-solution sibling it had.
        fallback.push(`${id}: ${shown}`);
      }
    });
  }));
  assert.ok(special >= 60, `${special} special-case versions`);
  assert.ok(fallback.length <= 2, `at most two keep the one-solution sibling: ${fallback.join(' | ')}`);
  assert.equal(kept + fallback.length, special);
});

test('while the item is open, "Try a similar one" still works one solution: it never tells which case the item is', () => {
  ['m3l1-cw-11', 'm3l1-cw-12', 'm3l1-cw-13', 'm3l1-pr-14'].forEach((id) => {
    const question = byId(L1, id);
    const open = buildSimilarWorkedExample(question, { seed: 0 });
    const prompt = /^Solve \$(.+)\$ for \$([A-Za-z])\$\.$/.exec(open.prompt);
    assert.ok(prompt, `${id}: ${open.prompt}`);
    assert.equal(solve(...sidesOf(prompt[1]), prompt[2]).case, 'one', `${id}: one solution while open`);
  });
});

test('a one-solution item that asks to say so keeps the instruction in its practice', () => {
  const question = byId(L1, 'm3l1-cw-12');
  const practice = buildPracticeLikeThis(question, { seed: 0 });
  const prompt = /^Solve \$(.+)\$ for \$x\$\. If no value of \$x\$ makes the equation true, or every value does, say so\.$/.exec(practice.prompt);
  assert.ok(prompt, practice.prompt);
  const sibling = solve(...sidesOf(prompt[1]), 'x');
  assert.equal(sibling.case, 'one');
  assert.ok(math.equal(F(math.evaluate(toMath(practice.answer.replace(/\$/g, '').split('=')[1]))), sibling.value), practice.answer);
});

test('the platform\'s safety checks hold: the case words are shared only when the practice asks for the item\'s case', () => {
  const question = byId(L1, 'm3l1-cw-11');
  const sibling = linearEquations.similarProblem(question, { seed: 0, keepCase: true });
  assert.equal(sibling.answer, 'No solution');
  assert.equal(similarExampleIsSafe(question, sibling, { keepCase: true }), true);
  // Asked for while the item is open, the same sibling is refused: its answer is this item's.
  assert.equal(similarExampleIsSafe(question, sibling), false);
  // Only words are ever shared: a value named as a case is still this item's answer.
  const one = byId(L1, 'm3l1-cw-12');
  const worked = linearEquations.similarProblem(one, { seed: 0 });
  assert.equal(similarExampleIsSafe(one, worked, { keepCase: true }), true);
  assert.equal(similarExampleIsSafe(one, { ...worked, answer: 'x = 3', caseAnswers: ['x = 3', '3'] }, { keepCase: true }), false, 'x = 3 is CW 12\'s answer');
  // Never the item's own statement once the variable cancels (3 = −1 for CW 11).
  for (let seed = 0; seed < 12; seed += 1) {
    const practice = linearEquations.similarProblem(question, { seed, keepCase: true });
    assert.ok(practice.steps.every((step) => !/\$3 = -1\$/.test(step)), practice.prompt);
  }
});

test('every sentence of a same-case practice has Spanish', async () => {
  const pack = await loadLanguagePack('es');
  const missing = new Set();
  [[L1, 'm3l1-cw-11'], [L1, 'm3l1-cw-13'], [L1, 'm3l1-pr-14'], [L1, 'm3l1-cw-12']].forEach(([questions, id]) => {
    const practice = buildPracticeLikeThis(byId(questions, id), { seed: 0 });
    [practice.prompt, ...practice.steps, `Answer: ${practice.answer}`].forEach((text) => translateWithPack(text, pack).sentences
      .filter((sentence) => !sentence.translated && !sentence.mathOnly).forEach((sentence) => missing.add(sentence.source)));
  });
  assert.deepEqual([...missing], []);
});

/*
 * The practice's answer is a case, a closed pair, so it is read in that shape
 * (CT13's rule, practiceLikeThis.js): every way a student writes the case
 * matches, the other case or a single value does not, and words the reader
 * does not know are compared, never marked wrong.
 */
test('a case answer is checked as a case: right in any spelling, wrong only on a complete reading', () => {
  const [none] = readPracticeAnswer('No solution').parts;
  const [every] = readPracticeAnswer('All real numbers').parts;
  assert.deepEqual([none.kind, none.checkable, every.kind, every.checkable], ['case', true, 'case', true]);
  ['no solution', 'nosolution', 'No solutions', 'none', '∅', '\\varnothing', '\\emptyset', '\\{\\}']
    .forEach((typed) => assert.deepEqual([checkPracticePart(none, typed), checkPracticePart(every, typed)], [PRACTICE_VERDICT.CORRECT, PRACTICE_VERDICT.INCORRECT], typed));
  ['all real numbers', 'allrealnumbers', 'every real number', 'infinitely many solutions', '\\mathbb{R}']
    .forEach((typed) => assert.deepEqual([checkPracticePart(none, typed), checkPracticePart(every, typed)], [PRACTICE_VERDICT.INCORRECT, PRACTICE_VERDICT.CORRECT], typed));
  // One value is one solution: not either case.
  ['x=3', '-2/5', '\\frac{2}{5}'].forEach((typed) => assert.equal(checkPracticePart(none, typed), PRACTICE_VERDICT.INCORRECT, typed));
  // Words the reader does not know are compared, not judged.
  ['no', 'it has none at all'].forEach((typed) => assert.equal(checkPracticePart(none, typed), PRACTICE_VERDICT.COMPARE, typed));
  // The practice says so after Check.
  const practice = buildPracticeLikeThis(byId(L1, 'm3l1-cw-11'), { seed: 0 });
  assert.equal(practiceCheckMessage(checkPracticeAnswers(practice, { 'part-1': 'no solution' })), 'That matches. Nice work.');
});

/*
 * The model builder (L3 CW 1 and CW 12, Honors CW 1 and CW 10): its practice
 * was proportional and growing ("W(t) = 15t", "M(x) = 7x") for a rule with a
 * starting amount, f(b) = 3.75b + 25, or one that goes down, h(m) = 4800 − 20m.
 * Now the practice has the item's form, read again here from the sibling's own
 * rule and checked against every row of its table, its domain and its range.
 * While the item is open, "Try a similar one" is still the proportional one.
 */
const L3 = lesson('T1_L3_Modeling_and_Solving_Linear_Inequalities.json');
const L3H = lesson('T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json');
/** "P(t) = 5t + 80" in an answer line → { name, variable, at(x) }. */
const ruleIn = (answer) => {
  const match = /([A-Z])\(([a-z])\) = ([^;]+)/.exec(answer);
  assert.ok(match, `a rule in "${answer}"`);
  const node = math.parse(toMath(match[3]));
  return { name: match[1], variable: match[2], at: (x) => F(node.evaluate({ [match[2]]: F(x) })) };
};
const formOf = (at) => {
  const start = at(0);
  const slope = math.subtract(at(1), start);
  if (math.smaller(slope, 0) && math.larger(start, 0)) return 'decreasing';
  if (math.larger(slope, 0) && math.larger(start, 0)) return 'starting';
  return math.equal(start, 0) ? 'proportional' : 'other';
};

test('the model builder practises a model in its own form: a starting amount, or one that goes down to zero', () => {
  [[L3, 'm3l3-cw-1', 'starting'], [L3, 'm3l3-cw-12', 'decreasing'], [L3H, 'm3l3h-cw-1', 'starting'], [L3H, 'm3l3h-cw-10', 'decreasing']].forEach(([questions, id, expected]) => {
    const question = byId(questions, id);
    // The item's own form, from the rule a student is graded on.
    const [, itemRule] = question.correctEquation.split('=');
    const variable = /\(([a-z])\)/.exec(question.correctEquation)[1];
    const itemAt = (x) => F(math.evaluate(toMath(itemRule), { [variable]: F(x) }));
    assert.equal(formOf(itemAt), expected, `${id} is ${expected}`);
    const first = buildPracticeLikeThis(question, { seed: 0 });
    const second = buildPracticeLikeThis(question, { seed: 0, avoidPrompts: [first.prompt] });
    assert.notEqual(first.prompt, second.prompt);
    [first, second].forEach((practice) => {
      const rule = ruleIn(practice.answer);
      assert.equal(formOf(rule.at), expected, `${id}: ${practice.answer}`);
      // The scenario states the start and the rate the rule uses.
      const start = rule.at(0);
      const rate = math.abs(math.subtract(rule.at(1), start));
      assert.ok(practice.prompt.includes(String(start)) && practice.prompt.includes(String(rate)), practice.prompt);
      // Every row of the table is on the rule.
      const rows = [.../table ([^;]+)/.exec(practice.answer)[1].matchAll(/\((\d+), (\d+)\)/g)].map(([, x, y]) => [Number(x), Number(y)]);
      assert.ok(rows.length >= 3, practice.answer);
      rows.forEach(([x, y]) => assert.ok(math.equal(rule.at(x), F(y)), `${id}: (${x}, ${y}) is on ${practice.answer}`));
      // A model that goes down ends where it reaches zero, and its range runs from zero to the start.
      const domain = /domain (?:0 ≤ [a-z] ≤ (\d+)|\{0, 1, 2, \.\.\., (\d+)\})/.exec(practice.answer);
      const range = /range (?:0 ≤ [A-Z]\([a-z]\) ≤ (\d+)|\{0, \d+, \d+, \.\.\., (\d+)\})/.exec(practice.answer);
      if (expected === 'decreasing' && question.correctDomain) {
        assert.ok(domain && range, `${id}: a domain and a range in "${practice.answer}"`);
        const end = Number(domain[1] || domain[2]);
        assert.ok(math.equal(rule.at(end), 0), `${id}: the domain ends where ${practice.answer.split(';')[1]} is zero`);
        assert.ok(math.equal(F(Number(range[1] || range[2])), start), `${id}: the range runs up to the start`);
      }
    });
    // While the item is open, "Try a similar one" is still the proportional sibling.
    const open = buildSimilarWorkedExample(question, { seed: 0 });
    assert.equal(formOf(ruleIn(open.answer).at), 'proportional', `${id}: ${open.answer}`);
  });
});

test('every sentence of the model builder\'s practice has Spanish', async () => {
  const pack = await loadLanguagePack('es');
  const missing = new Set();
  [[L3, 'm3l3-cw-1'], [L3, 'm3l3-cw-12']].forEach(([questions, id]) => {
    const done = [];
    for (let index = 0; index < 4; index += 1) {
      const practice = buildPracticeLikeThis(byId(questions, id), { seed: 0, avoidPrompts: done });
      done.push(practice.prompt);
      [practice.prompt, ...practice.steps, `Answer: ${practice.answer}`].forEach((text) => translateWithPack(text, pack).sentences
        .filter((sentence) => !sentence.translated && !sentence.mathOnly).forEach((sentence) => missing.add(sentence.source)));
    }
  });
  assert.deepEqual([...missing], []);
});
