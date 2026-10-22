/*
 * ALGEBRA II HONORS · MODULE 2 · LESSON 1 — OPERATIONS ON POLYNOMIALS (A2.7B),
 * AS A TEACHER IMPORTS IT.
 *
 * Built from the district's lesson slides (vocabulary; Examples A and B and
 * their Check Your Progress; the Distributive Property; E-SALES; INTEREST;
 * multiplying polynomials) and textbook Lesson 5-1 (Exercises 9–15, 28–40,
 * 58–61, the TEKS items 70–73 and the box-volume example).
 *
 * Everything reads the file through the same chain a teacher's import uses
 * (scripts/check-teacher-import.mjs), and every verdict comes from the shared
 * graders the server runs. Each key is re-derived here by EVALUATING the
 * original expression and the key at several points with plain JavaScript —
 * not with the platform's polynomial reader — so a key cannot pass by
 * agreeing with itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { buildFigureMatchResponse } from '../../src/platform/workflow/figureMatch.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { answerLinesFromResolvedQuestion } from '../../src/platform/resources/assignmentWorksheetPdfModel.js';
import { workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(here, '../../teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json');
const TEXT = fs.readFileSync(FILE, 'utf8');
const LESSON = { raw: JSON.parse(TEXT), ...compileTeacherImport(TEXT) };
const compiled = (id) => {
  const question = LESSON.questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `the import compiles ${id}`);
  return question;
};
const field = (id, fieldId) => compiled(id).answerFields.find((entry) => entry.id === fieldId);
const workshop = (question, work) => gradeServerResponse({ question, response: buildToolResponse({ question, toolId: 'polynomialWorkshop', work }) });

/* -------------------------------------------- independent arithmetic */

// "a^3+8a-9" → a JavaScript function of its letters: implicit products and
// powers written out. Letters are single characters.
// A power is parenthesized: JavaScript refuses -x**2.
const toJs = (text) => String(text)
  .replace(/[−–]/g, '-')
  .replace(/\s+/g, '')
  .replace(/([a-z])\^(\d+)/g, '($1**$2)')
  .replace(/(\d|\))(?=[a-z(])/g, '$1*')
  .replace(/([a-z])(?=[a-z(\d])/g, '$1*');
const LETTERS = 'abcmnprtxyz';
const evaluate = (text, point) => Function(...LETTERS, `return ${toJs(text)};`)(...LETTERS.split('').map((letter) => point[letter] ?? 0));
const POINTS = [-3, -1.5, 0.5, 2, 3.25].map((value, index) => Object.fromEntries(LETTERS.split('').map((letter, k) => [letter, value + k * 0.37 + index * 0.11])));
const sameEverywhere = (original, key) => POINTS.every((point) => Math.abs(evaluate(original, point) - evaluate(key, point)) <= 1e-6 * Math.max(1, Math.abs(evaluate(original, point))));

/* ------------------------------------------------------------ shape */

test('the lesson passes the teacher import with no errors and two known, informational warnings', () => {
  assert.deepEqual(LESSON.model.errors, []);
  assert.equal(LESSON.model.isValid, true);
  assert.deepEqual(LESSON.semantic.errors, []);
  assert.deepEqual(LESSON.model.warnings, [
    // The SAT-style item is authored, not drawn from the audited CCMR bank.
    'Question 28 is direct digitalSAT practice but is not sourced from the audited CCMR V2.1 assignment bank. Its alignment can still validate, but MathMaster cannot label its provenance as bank-backed.',
    // Every item IS A2.7B: the Warm-Up practices its parts (products of
    // monomials, opposites, like terms), which Recovery binds to A2.7B too.
    'Every question in this assignment is aligned to A2.7B, but the assignment uses 3 different question types (figureMatch, multiAnswer, polynomialWorkshop). Alignment is per question — check each item and give it the standard it actually assesses, including a prerequisite standard where that is what the question measures.',
  ]);
});

test('one 90-minute lesson in the four sections; the DOL is an exit ticket', () => {
  const sections = LESSON.raw.sections;
  assert.deepEqual(sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
  assert.equal(sections.reduce((total, section) => total + section.recommendedMinutes, 0), 90);
  assert.deepEqual(sections.map((section) => section.questions.length), [3, 11, 15, 3]);
  const dol = sections[3];
  assert.equal(dol.attemptsAllowed, 1);
  assert.equal(dol.hintsAllowed, false);
  assert.equal(dol.feedbackMode, 'afterAssignmentSubmit');
  for (const question of dol.questions) {
    assert.equal(question.hints, undefined, `${question.questionId}: no hints on the DOL`);
    assert.equal(question.guidedNotes, undefined, `${question.questionId}: no guided notes on the DOL`);
  }
  for (const question of sections.slice(0, 3).flatMap((section) => section.questions)) {
    assert.ok(question.hints?.length >= 2, `${question.questionId} offers hints`);
    assert.doesNotMatch(question.hints.join(' '), /\$|\\[a-z]+/, `${question.questionId}: hints are plain Unicode, not LaTeX`);
  }
  assert.equal(LESSON.questions.length, 32, 'every question survives the import');
  assert.ok(LESSON.questions.every((question) => question.standard === 'A2.7B'));
});

test('the rich tools carry the worked examples and the DOL; Check Your Progress follows without them', () => {
  const tools = Object.fromEntries(LESSON.questions.filter((question) => question.type === 'polynomialWorkshop').map((question) => [question.questionId, question.mode]));
  assert.deepEqual(tools, {
    'opp-cw-3': 'addSubtract',
    'opp-cw-4': 'addSubtract',
    'opp-cw-7': 'multiplyArea',
    'opp-cw-10': 'multiplyArea',
    'opp-pr-6': 'addSubtract',
    'opp-pr-7': 'multiplyArea',
    'opp-pr-11': 'multiplyArea',
    'opp-dol-1': 'addSubtract',
    'opp-dol-2': 'multiplyArea',
  });
  for (const id of Object.keys(tools)) {
    const question = compiled(id);
    assert.deepEqual(validateToolQuestion(question).errors, [], `${id} is a question the workshop can draw`);
    assert.ok(buildToolSolutionReviewModel(question)?.steps?.length, `${id} has a worked solution once it closes`);
    assert.ok(answerLinesFromResolvedQuestion(question).length >= 2, `${id} prints its steps in the answer key`);
  }
  // Each worked example's Check Your Progress is typed, with no tool.
  for (const id of ['opp-cw-5', 'opp-cw-8', 'opp-cw-11']) assert.equal(compiled(id).type, 'multiAnswer');
});

/* ------------------------------------------- every key, independently */

// The expression each typed polynomial simplifies, written out from the slide
// or the textbook — never from the key.
const ORIGINALS = {
  'opp-wu-1.single': '(3x^2)(-4x^5)',
  'opp-wu-1.double': '(-2a^3b)(5ab^2)',
  'opp-wu-2.opposite': '-(a^3-3a+2)',
  'opp-wu-2.combine': '4a^2+3a-a^2-5a',
  'opp-cw-5.cypA': '(3x^2+2x-3)-(4x^2+x-5)',
  'opp-cw-5.cypB': '(-3x^2-4x+1)-(4x^2+x-5)',
  'opp-cw-6.fixed': '(5y^2-2y+4)-(2y^2-6y+1)',
  'opp-cw-8.cyp': '-x(3x^3-2x+5)',
  'opp-cw-8.twoLetters': '3x^2(2xy-3xy^2+4x^2y^3)',
  'opp-cw-9.profit': '10x-(0.001x^2+5x+500)',
  'opp-cw-11.product': '(x^2+3x-2)(x+4)',
  'opp-pr-1.p9': '(x^2-5x+2)-(3x^2+x-1)',
  'opp-pr-1.p29': '(7b^2+6b-7)-(4b^2-2)',
  'opp-pr-2.p34': '4(a^2+5a-6)-3(2a^3+4a-5)',
  'opp-pr-3.p13': '(n-9)(n+7)',
  'opp-pr-3.p11': '2a(4b+5)',
  'opp-pr-3.p30': '3p(np-z)',
  'opp-pr-4.p35': '5c(2c^2-3c+4)+2c(7c-8)',
  'opp-pr-8.first': '12x+11(15-x)',
  'opp-pr-8.second': '12(15-y)+11y',
  'opp-pr-9.interest': '0.022x+0.019(1300-x)',
  'opp-pr-10.total': '(0.108x^2-0.876x+474.1)+(0.047x^2+9.694x+361.7)',
  'opp-pr-10.difference': '(0.108x^2-0.876x+474.1)-(0.047x^2+9.694x+361.7)',
  'opp-pr-12.square': '(4n-5)(4n-5)',
  'opp-pr-12.cube': '(4n-5)(4n-5)(4n-5)',
  'opp-dol-3.profit': '12x-(0.002x^2+4x+350)',
};

test('every typed polynomial key has the value of the expression it simplifies, and asks for simplest form', () => {
  const polynomialFields = LESSON.questions.flatMap((question) => (question.answerFields || [])
    .filter((entry) => entry.answerForm)
    .map((entry) => [`${question.questionId}.${entry.id}`, entry]));
  assert.deepEqual(polynomialFields.map(([id]) => id).sort(), Object.keys(ORIGINALS).sort(), 'every simplest-form field is checked here');
  for (const [id, entry] of polynomialFields) {
    assert.equal(entry.answerForm, 'simplifiedPolynomial');
    assert.ok(sameEverywhere(ORIGINALS[id], entry.answer), `${id}: ${ORIGINALS[id]} = ${entry.answer}`);
  }
});

test('the numbers: degrees, values in context and the SAT-style item', () => {
  assert.deepEqual(['d1', 'd2', 'd3', 'd4'].map((id) => field('opp-cw-2', id).answer), ['2', '5', '13', '2']);
  assert.equal(field('opp-cw-9', 'value').answer, String(evaluate('10x-(0.001x^2+5x+500)', { x: 1000 })));
  assert.equal(field('opp-dol-3', 'value').answer, String(evaluate('12x-(0.002x^2+4x+350)', { x: 500 })));
  assert.equal(Number(field('opp-pr-9', 'at800').answer), Math.round(evaluate('0.022x+0.019(1300-x)', { x: 800 }) * 100) / 100);
  assert.equal(field('opp-pr-13', 'atTwo').answer, String(evaluate('7p(3p-4)(2p^2)', { p: 2 })));
  // (2x + k)(x − 3) = 2x² + (k − 6)x − 3k = 2x² + x − 21.
  const k = Number(field('opp-pr-14-ccmr', 'k').answer);
  assert.ok(sameEverywhere(`(2x+${k})(x-3)`, '2x^2+x-21'));
  // a + b + c is the difference at x = 1.
  assert.equal(field('opp-pr-14-ccmr', 'abc').answer, String(evaluate('(3x^2-5x+2)-(x^2-2x-4)', { x: 1 })));
});

test('the TEKS item keeps the textbook\'s diagnosed answer choices, and each is the error it names', () => {
  const choices = field('opp-pr-5', 'p70').options;
  const original = '(2y^3-5y^2-4)-(4y^3+11y^2-3y+5)';
  const toAscii = (text) => text.replace(/³/g, '^3').replace(/²/g, '^2');
  const [A, B, C, D] = choices.map(toAscii);
  assert.ok(sameEverywhere(original, B), 'B is the difference');
  assert.ok(sameEverywhere('-((2y^3-5y^2-4)+(4y^3+11y^2-3y+5))', A), 'A: added, then took the opposite');
  assert.ok(sameEverywhere('(2y^3-5y^2-4)-4y^3+11y^2-3y+5', C), 'C: subtracted only the first term');
  assert.ok(sameEverywhere('(4y^3+11y^2-3y+5)-(2y^3-5y^2-4)', D), 'D: subtracted the first from the second');
  assert.equal(field('opp-pr-5', 'p70').answer, choices[1]);
  assert.equal(field('opp-pr-5', 'wrongC').answer, 'Subtracting only the first term of the second polynomial');
});

test('every typed and chosen key is accepted by the shared grader, and a wrong answer is not', () => {
  for (const question of LESSON.questions.filter((candidate) => candidate.type === 'multiAnswer')) {
    const fields = question.answerFields;
    const right = Object.fromEntries(fields.map((entry) => [entry.id, String(entry.answer)]));
    assert.equal(gradeMultiAnswerResponse(question, right).isCorrect, true, `${question.questionId}: its own key is correct`);
    for (const entry of fields) {
      const wrong = entry.type === 'choice' ? entry.options.find((option) => option !== entry.answer) : '999';
      assert.equal(gradeMultiAnswerResponse(question, { ...right, [entry.id]: wrong }).isCorrect, false, `${question.questionId}.${entry.id}: "${wrong}" is wrong`);
    }
    for (const entry of fields.filter((candidate) => candidate.type === 'choice')) assert.ok(entry.options.length >= 3, `${question.questionId}.${entry.id}: a real distractor`);
  }
});

test('simplest form is required: the right value, distributed and left uncombined, is not the answer', () => {
  const unsimplified = {
    'opp-cw-5.cypA': '3x^2+2x-3-4x^2-x+5',
    'opp-cw-6.fixed': '5y^2-2y+4-2y^2+6y-1',
    'opp-cw-11.product': 'x^3+4x^2+3x^2+12x-2x-8',
    'opp-wu-1.double': '(-2a^3b)(5ab^2)',
    'opp-dol-3.profit': '12x-0.002x^2-4x-350',
  };
  for (const [id, typed] of Object.entries(unsimplified)) {
    const [questionId, fieldId] = id.split('.');
    const question = compiled(questionId);
    const right = Object.fromEntries(question.answerFields.map((entry) => [entry.id, String(entry.answer)]));
    assert.ok(sameEverywhere(typed, right[fieldId]), `${id}: the typed answer has the right value`);
    const graded = gradeMultiAnswerResponse(question, { ...right, [fieldId]: typed });
    assert.equal(graded.parts.find((part) => part.id === fieldId).isCorrect, false, `${id}: "${typed}" is not simplified`);
  }
});

test('the vocabulary and always–sometimes–never sorts grade their own key', () => {
  for (const id of ['opp-cw-1', 'opp-pr-15']) {
    const question = compiled(id);
    const [stage] = question.workflow;
    assert.equal(gradeWorkflow({ stages: question.workflow, grading: question.grading, responses: { sort: buildFigureMatchResponse(stage, question.grading.sort.match) } }).isCorrect, true, id);
  }
});

/* --------------------------------------------- the DOL shows the work */

test('DOL Q1: every opposite and every column is graded, so a pasted answer earns only its share', () => {
  const question = compiled('opp-dol-1');
  const full = { opposites: ['-2x^3', '-4x^2', '3x', '-1'], sums: ['3x^3', '-6x^2', '3x', '6'], result: '3x^3-6x^2+3x+6' };
  assert.ok(sameEverywhere('(5x^3-2x^2+7)-(2x^3+4x^2-3x+1)', full.result));
  assert.equal(workshop(question, full).isCorrect, true);
  const pasted = workshop(question, { opposites: [], sums: [], result: full.result });
  assert.equal(pasted.isCorrect, false);
  assert.ok(pasted.score <= 1 / 9 + 1e-9, `the answer alone scores ${pasted.score}`);
  // "Subtracted only the first term": the steps say where.
  const firstOnly = workshop(question, { opposites: ['-2x^3', '4x^2', '-3x', '1'], sums: ['3x^3', '2x^2', '-3x', '8'], result: '3x^3+2x^2-3x+8' });
  assert.deepEqual(firstOnly.parts.filter((part) => !part.isCorrect).map((part) => part.id), ['opposite-2', 'opposite-3', 'opposite-4', 'sum-2', 'sum-3', 'sum-4', 'result']);
});

test('DOL Q2: every cell of the area model is graded, so a pasted product earns only its share', () => {
  const question = compiled('opp-dol-2');
  const full = { terms: ['2x^3', '-10x^2', '-3x^2', '15x', '4x', '-20'], product: '2x^3-13x^2+19x-20' };
  assert.ok(sameEverywhere('(2x^2-3x+4)(x-5)', full.product));
  assert.equal(workshop(question, full).isCorrect, true);
  const pasted = workshop(question, { terms: [], product: full.product });
  assert.equal(pasted.isCorrect, false);
  assert.ok(pasted.score <= 1 / 7 + 1e-9, `the product alone scores ${pasted.score}`);
});

/* ------------------------------------------- the worked solutions */

// A worked step is Unicode text ("x² · x⁵ = x²⁺⁵ = x⁷, so …"). Each clause
// with "=" is a chain of sides claimed equal; a side is checked when it reads
// as mathematics in the lesson's letters (the first side may start with
// words, the last may end with them). "With x = 800" and "so k = 7" fix a
// letter for the rest of the line; "a + b + c = 2 + (−3) + 6" names a value,
// so where some sides are bare numbers, a side with a free letter is not an
// identity and is left out.
const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', 'ⁿ': 'n' };
const STEP_LETTERS = 'abcknmprtxyz';
const stepSide = (side) => {
  const text = side.trim().replace(/[−–]/g, '-').replace(/·/g, '*')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺ⁿ]+/g, (run) => `^(${[...run].map((character) => SUPERSCRIPT[character]).join('')})`)
    .replace(/\s+/g, '');
  if (!text || /[^-+*().\d^a-z]/.test(text) || [...text].some((character) => /[a-z]/.test(character) && !STEP_LETTERS.includes(character))) return null;
  // A power is parenthesized: JavaScript refuses -x**2.
  return text.replace(/([a-z]|\d+(?:\.\d+)?|\([^()]*\))\^\(([^()]*)\)/g, '($1**($2))')
    .replace(/(\d|\))(?=[a-z(])/g, '$1*').replace(/([a-z])(?=[a-z(\d])/g, '$1*');
};
const longestSide = (words, fromEnd) => {
  for (let count = words.length; count > 0; count -= 1) {
    const side = stepSide((fromEnd ? words.slice(-count) : words.slice(0, count)).join(' '));
    if (side) return side;
  }
  return null;
};
const stepChains = (line) => {
  const clauses = line.replace(/\.$/, '').split(/: |; |, so |, and |, then | and |, (?=\S)/)
    .map((clause) => clause.replace(/\s(dollars|cubic units)$/, ''));
  const bound = {};
  clauses.forEach((clause) => {
    const binding = clause.match(/^(?:With |so )?([a-z]) = (-?[\d.]+)$/);
    if (binding) bound[binding[1]] = Number(binding[2]);
  });
  const hasFreeLetter = (side) => [...side].some((character) => /[a-z]/.test(character) && !(character in bound));
  return clauses.filter((clause) => clause.includes(' = ') && !/^(?:With |so )?[a-z] = -?[\d.]+$/.test(clause)).map((clause) => {
    const parts = clause.split(' = ');
    const sides = parts.map((part, index) => {
      const words = part.trim().split(/\s+/);
      if (index === 0) return longestSide(words, true);
      if (index === parts.length - 1) return longestSide(words, false);
      return stepSide(part);
    }).filter(Boolean);
    return { fixed: bound, sides: sides.some((side) => !hasFreeLetter(side)) ? sides.filter((side) => !hasFreeLetter(side)) : sides };
  }).filter(({ sides }) => sides.length >= 2);
};
const holdsEverywhere = ({ fixed, sides }) => POINTS.every((point) => {
  const values = sides.map((side) => Function(...STEP_LETTERS, `return ${side};`)(...STEP_LETTERS.split('').map((letter) => fixed[letter] ?? point[letter] ?? 0.7)));
  return values.every((value) => Math.abs(value - values[0]) <= 1e-9 * Math.max(1, Math.abs(values[0])));
});

test('every practice-like item walks through steps after the last try, and every equation in those steps is true', () => {
  const practiceLike = LESSON.raw.sections.filter((section) => section.role !== 'dol').flatMap((section) => section.questions);
  assert.equal(practiceLike.length, 29);
  let checked = 0;
  for (const raw of practiceLike) {
    assert.equal(workedSolutionDepth(compiled(raw.questionId)), 'steps', `${raw.questionId} shows worked steps, not only the answer`);
    const review = raw.solutionReview;
    if (!review) continue;
    assert.ok(review.headline && review.commonError && review.reasoning.length >= 2, `${raw.questionId} has a headline, steps and the mistake it catches`);
    const chains = review.reasoning.flatMap(stepChains);
    // Like terms or not is read, not computed: its steps are reasons.
    if (raw.questionId === 'opp-wu-3') assert.equal(chains.length, 0);
    else assert.ok(chains.length >= 1, `${raw.questionId}: its steps are checked (${chains.length} equations read)`);
    chains.forEach((chain) => assert.ok(holdsEverywhere(chain), `${raw.questionId}: ${chain.sides.join(' = ')} holds`));
    checked += chains.length;
  }
  assert.ok(checked >= 60, `${checked} equations checked`);
});

test('the DOL prompts do not print what they grade', () => {
  for (const id of ['opp-dol-1', 'opp-dol-2', 'opp-dol-3']) {
    const prompt = compiled(id).prompt.replace(/\s/g, '');
    assert.doesNotMatch(prompt, /3x\^3-6x\^2|2x\^3-13x\^2|3150|-0\.002x\^2\+8x/, `${id} does not print its answer`);
  }
});
