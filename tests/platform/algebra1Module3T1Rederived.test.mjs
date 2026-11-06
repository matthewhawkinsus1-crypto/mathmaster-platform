/*
 * ALGEBRA I · MODULE 3 · TOPIC 1 — LESSONS 1 AND 3, REGULAR AND HONORS,
 * CHECKED THE WAY A STUDENT MEETS THEM (walkthrough 2026-11-06,
 * docs/qa/2026-11-06-a1-m3-t1-walkthrough/walkthrough.md).
 *
 * Every number here is worked out again from what the student reads — the
 * expression and the value in a box's label, the statements of a worked
 * solution — and never read back from the key, so a key that disagrees with
 * its own question fails here even when the grader accepts the key.
 *
 *   W1  L1 CW 5 keyed the check "the value of 24x + 7 when x = −1/4" as −1.
 *       It is 24(−1/4) + 7 = 1, as the item's own worked steps say: a student
 *       who checked correctly was marked wrong.
 *   W2  L3 Honors CW 14's worked steps read "4800 − 20m > 2000 → −20m < −2800
 *       → m < 140": the symbol turned at the subtraction, in the lesson whose
 *       point is that only multiplying or dividing by a negative turns it.
 *   W3  L3 CW 4 asks for "an inequality for the number of boxes, b, in this
 *       region" of a graph drawn from b = 0, and its box's example is the
 *       compound "a ≤ x ≤ b". 0 ≤ b ≤ 420, the region exactly, was marked wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, create } from 'mathjs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { answerCandidatesForField } from '../../functions/shared/answerUtils.mjs';
import { inferRequiredAnswerSymbols } from '../../src/platform/interaction/answerEntryTools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../teacher-import-jsons/algebra1-module3');
const FILES = {
  'T1 L1': 'T1_L1_Solving_Linear_Equations.json',
  'T1 L1 Honors': 'T1_L1_Solving_Linear_Equations_Honors.json',
  'T1 L3': 'T1_L3_Modeling_and_Solving_Linear_Inequalities.json',
  'T1 L3 Honors': 'T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json',
};
const RAW = Object.fromEntries(Object.entries(FILES).map(([key, name]) => [key, fs.readFileSync(path.join(DIR, name), 'utf8')]));
const LESSONS = Object.fromEntries(Object.entries(RAW).map(([key, text]) => [key, JSON.parse(text)]));
const authoredQuestions = (key) => LESSONS[key].sections.flatMap((section) => section.questions);

const exact = create(all, { number: 'Fraction' });
// The lessons write mathematics as a student reads it: a true minus sign,
// a superscript square, implicit products such as 24x and (1/2)x.
const asMath = (text) => String(text).replace(/−/g, '-').replace(/²/g, '^2').replace(/·/g, '*').trim();
const valueAt = (expression, variable, value) => exact.fraction(exact.evaluate(asMath(expression), { [variable]: exact.fraction(exact.evaluate(asMath(value))) }));
const keyValue = (answer) => exact.fraction(exact.evaluate(asMath(answer)));
const shown = (fraction) => (Number(fraction.d) === 1 ? `${fraction.s < 0 ? '-' : ''}${fraction.n}` : `${fraction.s < 0 ? '-' : ''}${fraction.n}/${fraction.d}`);

/*
 * The boxes that ask for the value of an expression at a stated value:
 *   "Value of −2x + 28 when x = 2", "Check: the value of 24x + 7 when x = −1/4",
 *   "Check x = −1: the value of 4(3x + 2) — and of 8x + 4 — when x = −1",
 *   "Check x = 0: the value of 5x + 2", "Test x = −6 in the original inequality: the value of −3x + 4".
 */
const valueBoxes = (key) => authoredQuestions(key).flatMap((question) => (question.responses || []).flatMap((field) => {
  const label = String(field.label || '');
  // The value is a number as written (2, −1/4, 4.5); an intercept's "(the value
  // of h when m = 0)" is read from the function instead, and is not one of these.
  const when = /value of (.+?) when ([a-z]) = ([−-]?\d+(?:\.\d+)?(?:\/\d+)?)$/i.exec(label);
  const named = /^(?:Check|Test) ([a-z]) = ([−-]?\d+(?:\.\d+)?(?:\/\d+)?)(?: in the original inequality)?: the value of (.+)$/i.exec(label);
  if (when) {
    const expressions = when[1].split(/\s*—\s*(?:and of\s*)?/).map((part) => part.trim()).filter(Boolean);
    return [{ question: question.questionId, field, expressions, variable: when[2], value: when[3] }];
  }
  if (named) return [{ question: question.questionId, field, expressions: [named[3]], variable: named[1], value: named[2] }];
  return [];
}));

test('T1 L1 and L3, regular and Honors: every "value of … when x = …" box is keyed with the value its expression takes there', () => {
  const boxes = Object.keys(FILES).flatMap((key) => valueBoxes(key).map((box) => ({ key, ...box })));
  // The reader must find the lessons' check boxes, or this test passes by finding none.
  assert.ok(boxes.length >= 24, `${boxes.length} check boxes found`);
  boxes.forEach(({ key, question, field, expressions, variable, value }) => {
    expressions.forEach((expression) => {
      const worked = valueAt(expression, variable, value);
      assert.equal(shown(keyValue(field.answer)), shown(worked), `${key} ${question}.${field.id}: ${expression} at ${variable} = ${value} is ${shown(worked)}, keyed ${field.answer}`);
    });
  });
});

test('T1 L1 CW 5: the check takes 24(−1/4) + 7 = 1, the value the worked steps reach, and refuses −1, in the browser and on the server', () => {
  const question = compileTeacherImport(RAW['T1 L1']).questions.find((candidate) => candidate.questionId === 'm3l1-cw-5');
  assert.ok(question, 'm3l1-cw-5 survives the import');
  const right = Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
  const verdict = (answers) => {
    const browser = gradeMultiAnswerResponse(question, answers).isCorrect;
    const server = gradeServerResponse({ question, response: { kind: 'fields', fields: Object.entries(answers).map(([id, value]) => ({ id, value })) } }).isCorrect;
    assert.equal(server, browser, 'browser and server agree');
    return browser;
  };
  assert.equal(shown(valueAt('24x + 7', 'x', '−1/4')), '1');
  assert.equal(verdict({ ...right, check: '1' }), true, '24(−1/4) + 7 = −6 + 7 = 1');
  assert.equal(verdict({ ...right, check: '−1' }), false, '−1 is not the value of 24x + 7 at x = −1/4');
});

/*
 * A worked chain, "4800 − 20m > 2000 → −20m > −2800 → m < 140": each statement
 * is the one before it with the same thing done to both sides, so each has the
 * first one's solution set. A statement's set is worked out from its two sides
 * (each evaluated exactly at 0 and 1), as the shared grader's test does.
 * Prose arrows ("Same x-coefficient … → no value works") and statements in two
 * letters (kx > 4) are not statements of this kind and are passed over; an
 * approximate one ("b < 153.33…") is not compared.
 */
const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '=': '=' };
const solutionSet = (statement) => {
  const text = asMath(statement).replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/\.$/, '');
  const parts = /^([^<>=]*?)(<=|>=|<|>|=)([^<>=]*)$/.exec(text);
  if (!parts) return null;
  const letters = new Set(text.match(/[a-z]/gi) || []);
  if (letters.size !== 1) return null;
  const [variable] = letters;
  const [, left, relation, right] = parts;
  let gap;
  try {
    gap = (value) => exact.fraction(exact.subtract(
      exact.evaluate(left, { [variable]: exact.fraction(value) }),
      exact.evaluate(right, { [variable]: exact.fraction(value) }),
    ));
    gap(0);
  } catch {
    return null;
  }
  const b = gap(0);
  const a = exact.subtract(gap(1), b);
  if (!exact.equal(exact.add(exact.multiply(a, 2), b), gap(2))) return null; // not linear
  if (exact.equal(a, 0)) {
    const sign = Number(exact.compare(b, 0));
    return { set: { '=': sign === 0, '<': sign < 0, '>': sign > 0, '<=': sign <= 0, '>=': sign >= 0 }[relation] ? 'every number' : 'no number' };
  }
  const boundary = exact.divide(exact.unaryMinus(b), a);
  const solved = relation === '=' || exact.compare(a, 0) > 0 ? relation : FLIP[relation];
  return { set: `${variable} ${solved} ${shown(boundary)}` };
};
const strings = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => strings(entry, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => strings(entry, out));
  return out;
};
const workedChains = (text) => text.split(/\n|;|\.\s/).filter((segment) => segment.includes('→')).flatMap((segment) => {
  const pieces = segment.split('→').map((piece, index) => {
    let statement = index === 0 ? piece.slice(piece.lastIndexOf(':') + 1) : piece.split(':')[0];
    // What follows a comma, a dash or a bracketed word is prose: "h > 10 (the symbol reverses)".
    statement = statement.split(/,\s| \((?=[a-z]{2})| —/i)[0].trim();
    return statement;
  }).filter((statement) => !statement.includes('…'));
  const sets = pieces.map((statement) => ({ statement, solved: solutionSet(statement) }));
  return sets.length >= 2 && sets.every((entry) => entry.solved) ? [sets] : [];
});

test('T1 L1 and L3, regular and Honors: every statement in a worked chain (a → b → c) has the solution set of the first', () => {
  const chains = Object.keys(FILES).flatMap((key) => authoredQuestions(key).flatMap((question) => strings(question)
    .flatMap((text) => workedChains(text).map((chain) => ({ key, question: question.questionId, chain })))));
  // The reader must find the lessons' worked chains, or this passes by finding none.
  assert.ok(chains.length >= 60, `${chains.length} worked chains found`);
  chains.forEach(({ key, question, chain }) => {
    const [first, ...rest] = chain;
    rest.forEach(({ statement, solved }) => {
      assert.equal(solved.set, first.solved.set, `${key} ${question}: "${first.statement}" is ${first.solved.set}, but the step "${statement}" is ${solved.set}`);
    });
  });
});

test('T1 L3 CW 4: the region below y = 1600 is graded as b ≤ 420 or, bounded by the graph, 0 ≤ b ≤ 420, and a near miss is not', () => {
  const question = compileTeacherImport(RAW['T1 L3']).questions.find((candidate) => candidate.questionId === 'm3l3-cw-4');
  assert.ok(question, 'm3l3-cw-4 survives the import');
  // The region, from the graph the student reads: f(b) = 3.75b + 25 drawn from
  // its domain's start, up to where it meets the horizontal line y = 1600.
  const [sales, goal] = question.graph.functions;
  assert.deepEqual([goal.m, goal.b], [0, 1600]);
  const meets = exact.divide(exact.fraction(goal.b - sales.b), exact.fraction(sales.m));
  assert.equal(shown(meets), '420');
  const start = sales.domain.min;
  assert.equal(start, 0, 'the graph starts at 0 boxes');
  const field = question.answerFields.find((candidate) => candidate.id === 'ineq');
  const right = Object.fromEntries(question.answerFields.map((candidate) => [candidate.id, String(candidate.answer)]));
  const verdict = (ineq) => {
    const answers = { ...right, ineq };
    const browser = gradeMultiAnswerResponse(question, answers).isCorrect;
    const server = gradeServerResponse({ question, response: { kind: 'fields', fields: Object.entries(answers).map(([id, value]) => ({ id, value })) } }).isCorrect;
    assert.equal(server, browser, `${ineq}: browser and server agree`);
    return browser;
  };
  [`b <= ${shown(meets)}`, `${start} <= b <= ${shown(meets)}`, `${start}\\le b\\le ${shown(meets)}`, `${start} ≤ b ≤ ${shown(meets)}`, `${shown(meets)} >= b >= ${start}`]
    .forEach((ineq) => assert.equal(verdict(ineq), true, `${ineq} is the region`));
  ['0 < b <= 420', '0 <= b < 420', '0 <= b <= 421', '1 <= b <= 420', 'b >= 0', 'b < 420']
    .forEach((ineq) => assert.equal(verdict(ineq), false, `${ineq} is not the region`));
  // On a phone the "Needed for this answer" keys are read from every accepted
  // answer: the bounded form needs no key the key itself did not.
  assert.deepEqual(inferRequiredAnswerSymbols(answerCandidatesForField(field)).sort(), inferRequiredAnswerSymbols([field.answer]).sort());
});
