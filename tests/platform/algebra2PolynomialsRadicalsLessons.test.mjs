/*
 * ALGEBRA II · POLYNOMIALS AND RADICALS — FIVE LESSONS, AS A TEACHER IMPORTS
 * THEM.
 *
 *   Factoring Polynomials         Bluebonnet Polynomials, Lesson 1   A2.7D, A2.7E
 *   Remainder & Factor Theorems   Bluebonnet Polynomials, Lesson 2   A2.7D, A2.7E
 *   Radical Expressions           Bluebonnet Radicals, Lesson 2      A2.7G
 *   Rational Exponents            Bluebonnet Radicals, Lesson 3      A2.7G
 *   Solving Radical Equations     Bluebonnet Radicals, Lesson 4      A2.7H
 *
 * Each lesson is one assignment in the four sections. Its Warm-Up and DOL are
 * assignment-local templates, so every student meets fresh, server-graded
 * versions, and both back Recovery.
 *
 * Everything reads the files through the chain a teacher's import uses
 * (scripts/check-teacher-import.mjs), every verdict comes from the shared
 * graders the server runs, and a template is checked at each of the first 32
 * versions a class meets. Each key is also re-derived from its own prompt: the
 * small reader below evaluates the prompt's LaTeX and a key's typed form with
 * plain floating-point arithmetic — not with any grader's reader — so a key
 * cannot pass by agreeing with itself, and a prompt cannot drift from its
 * tool's data. Steps that are not the prompt's own expression are derived by
 * hand from the prompt.
 *
 * What the lessons promise a teacher is pinned as well: a student does not
 * finish an item by retyping the question, by pasting a calculator's display,
 * or by typing only the final answer into a staged tool.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { getEffectiveActivityPolicy } from '../../functions/shared/activityPolicies.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import { buildTemplateFamily } from '../../functions/shared/questionFamilyTemplate.mjs';
// Also registers the factoredForm and simplestRadicalForm comparators, as the server does.
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { radicalSolveKey, validRadicalCandidates } from '../../functions/shared/toolMath/signSolutionAnalyzer/signSolutionMath.mjs';
import { PLATFORM_OWNED_FIELDS } from '../../src/platform/contract/platformOwnedFields.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { close, evaluator, read, sameValue, SCOPES, segmentsOf, sidesOf } from './helpers/plainMathReader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../teacher-import-jsons/algebra2-polynomials-radicals');
const FILES = {
  'Factoring Polynomials': '1_Factoring_Polynomials.json',
  'Remainder & Factor Theorems': '2_Remainder_and_Factor_Theorems.json',
  'Radical Expressions': '3_Radical_Expressions.json',
  'Rational Exponents': '4_Rational_Exponents.json',
  'Solving Radical Equations': '5_Solving_Radical_Equations.json',
};
const LESSONS = Object.entries(FILES).map(([title, name]) => {
  const text = fs.readFileSync(path.join(DIR, name), 'utf8');
  return { title, raw: JSON.parse(text), ...compileTeacherImport(text) };
});

const isTemplate = (question) => Boolean(question.generator && question.questionFamily);
// What students meet: an authored question as written, a template at each of
// its first `count` versions.
const versionsOf = (question, count = 32) => {
  if (!isTemplate(question)) return [question];
  const family = buildTemplateFamily(question, { slotKey: question.questionId });
  const sequence = cachedFamilyInstanceSequence(family, {}, `lessons|${question.questionId}`);
  const versions = [];
  for (let index = 0; index < count; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    versions.push(buildFamilyQuestion({ family, instance, constraintValues: {}, authored: question, tool: family.defaultTool }));
  }
  return versions;
};
const MET = LESSONS.flatMap((lesson) => lesson.questions.flatMap((question) => versionsOf(question)));
const met = (id) => MET.filter((question) => question.questionId === id);
const metAll = (predicate) => MET.filter(predicate);

/* ------------------------------------------------------ the reader */

// close, evaluator, read, sameValue, SCOPES, segmentsOf and sidesOf come from
// the independent reader in ./helpers/plainMathReader.mjs (plain arithmetic,
// never a grader's reader).

const num = (value) => String(Number(Number(value).toFixed(6)) + 0);
const polynomialText = (coefficients, variable = 'x') => coefficients.map((value, index) => {
  const degree = coefficients.length - 1 - index;
  if (Math.abs(value) < 1e-12) return '';
  const size = Math.abs(value);
  const number = degree > 0 && Math.abs(size - 1) < 1e-12 ? '' : num(size);
  return `${value < 0 ? '-' : '+'}${number}${degree === 0 ? '' : degree === 1 ? variable : `${variable}^${degree}`}`;
}).join('').replace(/^\+/, '') || '0';
// The r in "divide by x − r": an item's candidateRoot, or its divisor x − r.
const rootOf = (question) => {
  if (question.candidateRoot !== undefined) return Number(question.candidateRoot);
  assert.equal(question.divisor[0], 1, `${question.questionId}: a monic divisor`);
  return -question.divisor[1];
};
const horner = (coefficients, root) => {
  const middle = [];
  const bottom = [coefficients[0]];
  for (let index = 1; index < coefficients.length; index += 1) {
    middle.push(root * bottom[index - 1]);
    bottom.push(coefficients[index] + middle[index - 1]);
  }
  return { middle, bottom };
};
// '{±1, ±2, ±1/3}' → [1, -1, 2, -2, 1/3, -1/3]
const listOf = (text) => String(text).replace(/[{}\s]/g, '').replace(/−/g, '-').split(',').flatMap((entry) => {
  const [numerator, denominator = '1'] = entry.replace(/^±/, '').split('/');
  const value = Number(numerator) / Number(denominator);
  return entry.startsWith('±') ? [value, -value] : [value];
});
const sameSet = (left, right) => left.length === right.length
  && left.every((value) => right.some((other) => close(value, other)))
  && right.every((value) => left.some((other) => close(value, other)));

/* ------------------------------------------- one assignment per lesson */

for (const lesson of LESSONS) {
  test(`${lesson.title}: passes the teacher import's Pre-Flight with no errors and no warnings`, () => {
    assert.deepEqual(lesson.model.errors, []);
    assert.deepEqual(lesson.model.warnings || [], []);
    assert.equal(lesson.model.isValid, true);
    assert.deepEqual(lesson.semantic.errors, []);
    assert.deepEqual(lesson.semantic.warnings, []);
    // No hint is hidden for stating an answer, and every question — the DOL
    // after it is submitted — closes with worked steps, not the answer alone.
    assert.deepEqual(lesson.model.hiddenHints.warnings, []);
    assert.deepEqual(lesson.model.solutionReviews.warnings.filter((warning) => /only the answer/.test(warning)), []);
  });

  test(`${lesson.title}: its Warm-Up and DOL are templates, so Recovery can issue fresh versions of both`, () => {
    const notes = lesson.model.questionGeneration?.notes || [];
    assert.ok(notes.some((note) => note.startsWith('Warm-Up Recovery ready')), JSON.stringify(notes));
    assert.ok(notes.some((note) => note.startsWith('DOL Recovery ready')), JSON.stringify(notes));
    for (const section of lesson.raw.sections.filter((candidate) => ['warmup', 'dol'].includes(candidate.role))) {
      for (const question of section.questions) {
        assert.ok(question.generator, `${question.questionId} is a template`);
        assert.equal(question.questionFamily?.scope, 'assignment', `${question.questionId} is assignment-local`);
      }
    }
    for (const question of lesson.questions.filter((candidate) => candidate.sectionId === 'dol')) {
      const prompts = new Set(versionsOf(question).map((version) => version.prompt));
      assert.equal(prompts.size, 32, `${question.questionId}: a different DOL for each of 32 students`);
    }
  });

  test(`${lesson.title}: one assignment in the four sections, simply named, paced, with Practice the largest section`, () => {
    const { assignment, sections } = lesson.raw;
    assert.equal(assignment.title, lesson.title);
    assert.ok(assignment.title.split(/\s+/).length <= 4 && !/bluebonnet|lesson/i.test(assignment.title), assignment.title);
    assert.match(assignment.teacherNotes, /^Bluebonnet Algebra II — (Polynomials|Radicals), Lesson \d \(/, 'the district\'s name is kept for the teacher');
    assert.match(assignment.folder, /^Algebra II\//);
    assert.deepEqual(sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
    const minutes = sections.map((section) => section.recommendedMinutes);
    assert.ok(minutes[0] <= 10 && minutes[3] <= 10, `a short Warm-Up and exit ticket: ${minutes}`);
    const total = minutes.reduce((sum, value) => sum + value, 0);
    assert.ok(total >= 90 && total <= 120, `${total} minutes: one lesson, its days together`);
    const counts = sections.map((section) => section.questions.length);
    assert.ok(counts[2] >= 12 && counts[2] >= counts[1], `Practice gives the most work: ${counts}`);
    assert.equal(lesson.questions.length, counts.reduce((sum, value) => sum + value, 0), 'every question survives the import');
    // Hints and notes teach in the lesson; the DOL is the student's own work.
    for (const question of sections.slice(0, 3).flatMap((section) => section.questions)) {
      assert.ok(question.hints?.length >= 1, `${question.questionId} offers a hint`);
    }
    // After a miss, each typed item before the DOL backs up to a simpler
    // question of its own; neither choice is one of the item's answers.
    let rightFirst = 0;
    let steps = 0;
    for (const question of sections.slice(0, 3).flatMap((section) => section.questions).filter((candidate) => candidate.responses)) {
      const { scaffold } = question;
      assert.ok(scaffold?.prompt?.startsWith('Let’s back up. '), `${question.questionId}: a back-up step`);
      assert.equal(scaffold.options.length, 2, question.questionId);
      assert.ok(scaffold.options.includes(scaffold.correct), question.questionId);
      const answers = question.responses.map((field) => String(field.answer ?? field.correct).trim().toLowerCase());
      scaffold.options.forEach((option) => assert.ok(!answers.includes(option.trim().toLowerCase()), `${question.questionId}: "${option}" is an answer`));
      steps += 1;
      if (scaffold.options[0] === scaffold.correct) rightFirst += 1;
    }
    assert.ok(steps >= 5 && rightFirst > 0 && rightFirst < steps, `the right choice is first on ${rightFirst} of ${steps}`);
    for (const question of sections[3].questions) {
      assert.equal(question.hints, undefined, `${question.questionId}: no hints on the DOL`);
      assert.equal(question.guidedNotes, undefined, `${question.questionId}: no guided notes on the DOL`);
      assert.equal(question.scaffold, undefined, `${question.questionId}: no scaffold on the DOL`);
    }
    // Attempts, hints and feedback are the platform's, by role: the files
    // leave them to it.
    const policyFields = PLATFORM_OWNED_FIELDS.filter((field) => /attempt|hint|feedback|replacement|mastery/i.test(field));
    assert.ok(policyFields.includes('attemptsAllowed') && policyFields.includes('hintsAllowed'));
    for (const owner of [...sections, ...sections.flatMap((section) => section.questions)]) {
      for (const field of policyFields) assert.equal(Object.hasOwn(owner, field), false, `${owner.questionId || owner.id} authors ${field}`);
    }
    const dol = getEffectiveActivityPolicy('dol');
    assert.deepEqual([dol.attempts, dol.hintsAllowed, dol.feedback], [1, false, 'afterAssignmentSubmit']);
  });

  test(`${lesson.title}: every typed and chosen key is accepted by the shared grader, and a wrong answer is not`, () => {
    const questions = MET.filter((question) => question.type === 'multiAnswer' && lesson.questions.some((own) => own.questionId === question.questionId));
    const templateIds = new Set(lesson.questions.filter(isTemplate).map((question) => question.questionId));
    assert.ok(questions.length > 0);
    for (const question of questions) {
      const fields = question.answerFields;
      const right = Object.fromEntries(fields.map((field) => [field.id, String(field.answer)]));
      const graded = gradeMultiAnswerResponse(question, right);
      assert.equal(graded.isCorrect, true, `${question.questionId}: its own key (${JSON.stringify(graded.parts.filter((part) => !part.isCorrect))})`);
      for (const field of fields) {
        const wrong = field.type === 'choice' ? field.options.find((option) => option !== field.answer) : '999';
        assert.equal(gradeMultiAnswerResponse(question, { ...right, [field.id]: wrong }).isCorrect, false, `${question.questionId}.${field.id}: "${wrong}" is wrong`);
      }
      for (const field of fields.filter((candidate) => candidate.type === 'choice')) {
        assert.ok(field.options.length >= 3, `${question.questionId}.${field.id}: a real distractor, not a coin flip`);
      }
      // No version of a template asks for the same answer twice (a root to
      // the power 1 made "the root" and "the value" one number).
      if (templateIds.has(question.questionId)) {
        const answers = fields.map((field) => String(field.answer).replace(/\s/g, ''));
        assert.equal(new Set(answers).size, answers.length, `${question.questionId}: two boxes take ${answers.join(', ')}`);
      }
    }
  });

  test(`${lesson.title}: every tool question has a worked solution the shared grader accepts`, () => {
    for (const question of lesson.questions.filter((candidate) => !['multiAnswer', 'openSortBoard'].includes(candidate.type))) {
      for (const version of versionsOf(question)) {
        assert.ok(buildToolSolutionReviewModel({ ...version, toolId: version.type })?.steps?.length, `${version.questionId}: ${version.prompt}`);
      }
    }
  });
}

test('the lessons are worked in the platform\'s tools, not only in answer boxes', () => {
  const tools = (title) => LESSONS.find((lesson) => lesson.title === title).questions
    .filter((question) => question.type !== 'multiAnswer')
    .map((question) => `${question.type}/${question.mode || ''}`);
  const count = (list, entry) => list.filter((candidate) => candidate === entry).length;
  const factoring = tools('Factoring Polynomials');
  assert.ok(count(factoring, 'polynomialWorkshop/factorQuadratic') >= 3 && count(factoring, 'polynomialWorkshop/multiplyArea') >= 1, factoring.join(' '));
  assert.ok(count(factoring, 'openSortBoard/controlled') >= 2, 'factoring methods are sorted by the structure that calls for them');
  const theorems = tools('Remainder & Factor Theorems');
  assert.ok(count(theorems, 'polynomialWorkshop/synthetic') >= 10, `${count(theorems, 'polynomialWorkshop/synthetic')} synthetic divisions`);
  const equations = tools('Solving Radical Equations');
  assert.ok(count(equations, 'signSolutionAnalyzer/radicalSolve') >= 15, `${count(equations, 'signSolutionAnalyzer/radicalSolve')} staged solves`);
  // A simplified radical is graded by value AND form, never by equivalence
  // (which would take the question retyped).
  for (const title of ['Radical Expressions', 'Rational Exponents']) {
    const fields = LESSONS.find((lesson) => lesson.title === title).questions.flatMap((question) => question.answerFields || []);
    assert.ok(fields.filter((field) => field.gradingMode === 'simplestRadicalForm').length >= 30, title);
    assert.equal(fields.filter((field) => field.gradingMode === 'equivalentExpression').length, 0, title);
    assert.ok(count(tools(title), 'openSortBoard/controlled') >= 2, title);
  }
});

/* ------------------------------------------------- template versions */

// What a template would print where a person would not: "1x", "+ 0x",
// "+ -4", "x^1", an unfilled placeholder.
const BLEMISHES = [
  [/(?<![\d.,{}\w])1\s?[a-z](?![a-z(])/, 'a coefficient of 1'],
  [/(?<![\d.,{}\w])1\s?(?:\\sqrt|√|∛|∜)/, 'a coefficient of 1 on a radical'],
  [/(?<![\d.])0\s?[a-z]\b/, 'a zero coefficient'],
  [/[+−-]\s*0(?![\d.])(?!\s*[<>=])/, 'plus or minus zero'],
  [/\+\s*[-−]|[-−]\s*[-−]|\+\s*\+/, 'a run of signs'],
  [/\^\{?\s*1\s*\}?(?![\d/.])/, 'a power of 1'],
  [/NaN|undefined|null|Infinity|\{\{/, 'a missing value'],
];

test('template versions read like hand-written problems, in every version a template can give', () => {
  // The check catches each blemish it names.
  assert.deepEqual(['x^3 - 1x^2', 'x^3 + 0x^2', 'x + -4', 'a^{ 1 }b', 'f({{r}})', '3\\sqrt{20} + 1\\sqrt{5}'].map((sample) => BLEMISHES.filter(([pattern]) => pattern.test(sample)).length > 0), [true, true, true, true, true, true]);
  assert.deepEqual(['11\\sqrt{3}', '21√2', '1/√3', 'x + 1'].filter((sample) => BLEMISHES.some(([pattern]) => pattern.test(sample))), []);
  let checked = 0;
  for (const question of LESSONS.flatMap((lesson) => lesson.questions).filter(isTemplate)) {
    for (const version of versionsOf(question, 400)) {
      checked += 1;
      const texts = {
        prompt: version.prompt,
        hints: (version.hints || []).join(' | '),
        keys: (version.answerFields || []).map((field) => field.answer).join(' | '),
        scaffold: JSON.stringify(version.scaffold || {}),
        review: JSON.stringify(version.solutionReview || {}),
      };
      for (const [where, text] of Object.entries(texts)) {
        for (const [pattern, label] of BLEMISHES) assert.doesNotMatch(String(text), pattern, `${question.questionId} ${where}: ${label} in ${text}`);
      }
    }
  }
  assert.ok(checked > 9000, `${checked} versions`);
});

/* ------------------------------------- keys re-derived from the prompt */

// Steps a multi-step item asks for along the way. None is the prompt's own
// expression, so each is derived here by hand from its prompt.
const STEPS = {
  'fp-cw-2': { g1: ({ a, b }) => 15 * a - 3 * a * b, g2: ({ b }) => 4 * b - 20 },
  'fp-cw-3': { g1: ({ x }) => x ** 3 + 5 * x ** 2, g2: ({ x }) => -2 * x - 10 },
  'rf-cw-4': { depressed: ({ x }) => x ** 2 + 7 * x + 6 },
  'rf-p-13': { factored: ({ x }) => (x + 2) * (x - 1) * (x - 5) },
  'rx-cw-7': { t1: () => 3 * Math.sqrt(45), t2: () => -5 * Math.sqrt(80), t3: () => 4 * Math.sqrt(20) },
  'rx-cw-8': {
    first: () => 2 * Math.sqrt(3) * 3,
    outer: () => 2 * Math.sqrt(3) * -Math.sqrt(3),
    inner: () => 3 * Math.sqrt(5) * 3,
    last: () => 3 * Math.sqrt(5) * -Math.sqrt(3),
  },
  'rx-p-6': { t1: () => 3 * Math.sqrt(75), t2: () => -2 * Math.sqrt(48) },
  're-cw-2': { radical: ({ a }) => a ** (1 / 7), exponent: ({ w }) => Math.sqrt(w) },
  're-cw-7': { power: () => 16 ** (1 / 6) },
  're-p-3': { r1: ({ a }) => a ** (1 / 3), e1: ({ x }) => x ** (1 / 5), e2: ({ x }) => Math.cbrt(x ** 2), r2: ({ y }) => y ** (3 / 4) },
  'sr-cw-3': { square1: ({ x }) => (2 - Math.sqrt(x)) ** 2 },
  'sr-p-4': { square1: ({ x }) => (-1 - Math.sqrt(x)) ** 2 },
};
// Numbers asked along the way, each computed here from its prompt's givens.
const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;
const NUMBERS = {
  'fp-cw-5': { ac: 24 * 3 },
  'rf-cw-8': { test: 1 - 2 - 5 + 6 },
  'rf-p-11': { p2: 5, k: (6 - 2 ** 3) / 2 },
  'rf-p-13': { yint: (0 + 2) * (0 - 1) * (0 - 5) },
  'rx-p-13': { length: round(0.46 * Math.cbrt(30), 2) },
  're-cw-2': { cube: Math.cbrt(27) },
  're-cw-3': { root49: Math.sqrt(49), root32: 32 ** (1 / 5), value32: 32 ** (2 / 5) },
  're-cw-5': { M: round(512 - 146230 * 168 ** (-8 / 5), 0) },
  're-p-9': { M: round(512 - 146230 * 80 ** (-8 / 5), 0) },
  're-p-10': { y: round(10 * 360 ** (3 / 4), 1) },
  // √(x − 12) = 2 − √x squared: x − 12 = 4 − 4√x + x, so 4√x = 16.
  'sr-cw-3': { isolated: (4 + 12) / 4, candidate: 4 ** 2, left: Math.sqrt(16 - 12), right: 2 - Math.sqrt(16) },
  // √(x + 4) + 5 = 9.
  'sr-cw-9': { isolated: 9 - 5, solution: (9 - 5) ** 2 - 4 },
  // √(x + 5) = −1 − √x squared: x + 5 = 1 + 2√x + x, so 2√x = 4.
  'sr-p-4': { isolated: (5 - 1) / 2, candidate: 2 ** 2, left: Math.sqrt(4 + 5), right: -1 - Math.sqrt(4) },
  'sr-p-12': { candidate: 7 + 1 },
};

const FORM_GRADED = ['factoredForm', 'simplestRadicalForm'];

test('every form-graded key is its prompt\'s expression in value, and every step is the step its prompt asks for', () => {
  let matched = 0;
  for (const question of metAll((candidate) => candidate.type === 'multiAnswer')) {
    const sides = sidesOf(question.prompt);
    for (const field of question.answerFields) {
      const step = STEPS[question.questionId]?.[field.id];
      if (step) {
        assert.ok(sameValue(field.answer, step), `${question.questionId}.${field.id} = ${field.answer}`);
        continue;
      }
      // The one number asked about a prompt with one expression is its value.
      const lone = field.inputProfile === 'number' && sides.length === 1
        && question.answerFields.filter((candidate) => candidate.inputProfile === 'number').length === 1;
      if (!FORM_GRADED.includes(field.gradingMode) && !lone) continue;
      assert.ok(sides.some((side) => sameValue(side, field.answer)), `${question.questionId}.${field.id} = ${field.answer} is none of ${sides.join(' | ')}`);
      matched += 1;
    }
  }
  assert.ok(matched > 800, `${matched} keys matched to their prompts`);
});

test('every number asked along the way is the number its prompt gives', () => {
  for (const [id, fields] of Object.entries(NUMBERS)) {
    const [question] = met(id);
    for (const [fieldId, expected] of Object.entries(fields)) {
      const field = question.answerFields.find((candidate) => candidate.id === fieldId);
      assert.ok(close(Number(field.answer), expected), `${id}.${fieldId}: ${field.answer} is ${expected}`);
    }
  }
  // Root first, at every version: b^(1/n), then b^(m/n).
  for (const version of [...met('re-p-4'), ...met('re-dol-1')]) {
    const [, b, m, n] = /(\d+)\^\{\\frac\{ (\d+) \}\{ (\d+) \}\}/.exec(version.prompt).map(Number);
    const keys = Object.fromEntries(version.answerFields.map((field) => [field.id, Number(field.answer)]));
    assert.ok(close(keys.root, b ** (1 / n)) && close(keys.value, b ** (m / n)), `${version.prompt} ${JSON.stringify(keys)}`);
  }
  // Template numbers, at every version: f(r) by direct substitution, and ac.
  for (const version of met('rf-wu-1')) {
    const [, polynomial] = segmentsOf(version.prompt)[0].split('=');
    const r = Number(/f\((-?\d+)\)/.exec(segmentsOf(version.prompt)[1])[1]);
    assert.ok(close(read(polynomial)({ x: r }), Number(version.answerFields[0].answer)), version.prompt);
  }
  for (const version of met('fp-p-7')) {
    const q = read(segmentsOf(version.prompt)[0]);
    const [c, a] = [q({ x: 0 }), (q({ x: 1 }) + q({ x: -1 })) / 2 - q({ x: 0 })];
    assert.equal(Number(version.answerFields.find((field) => field.id === 'ac').answer), a * c, version.prompt);
  }
  // The GCF field is the monomial the factored form takes out.
  for (const version of met('fp-wu-1')) {
    const [gcf, factored] = version.answerFields.map((field) => field.answer);
    assert.ok(factored.startsWith(`${gcf}(`), `${gcf} | ${factored}`);
  }
});

test('the Rational Zero Theorem lists and the zeros are built from the prompt\'s polynomial', () => {
  const divisors = (n) => Array.from({ length: Math.abs(n) }, (_, index) => index + 1).filter((d) => n % d === 0);
  const plusMinus = (values) => values.flatMap((value) => [value, -value]);
  const unique = (values) => values.filter((value, index) => values.findIndex((other) => close(other, value)) === index);
  // [question, the polynomial's coefficients, field → p, q or p/q]
  const LISTS = [
    ['rf-cw-6', [3, -1, 0, 0, 4], { p: 'p', q: 'q', zeros: 'p/q' }],
    ['rf-cw-7', [1, 7, 0, 0, -15], { g: 'p/q' }],
    ['rf-cw-7', [2, 0, 1, 6], { h: 'p/q' }],
    ['rf-cw-8', [1, -2, -5, 6], { candidates: 'p/q' }],
    ['rf-p-6', [1, 0, 3, 24], { zeros: 'p/q' }],
    ['rf-p-7', [4, -2, 1, -3], { p: 'p', q: 'q', zeros: 'p/q' }],
    ['rf-p-10', [1, 1, -7, -1, 6], { candidates: 'p/q' }],
  ];
  for (const [id, coefficients, asks] of LISTS) {
    const [question] = met(id);
    assert.ok(sidesOf(question.prompt).some((side) => sameValue(side, polynomialText(coefficients))), `${id} is about ${polynomialText(coefficients)}`);
    const p = divisors(coefficients.at(-1));
    const q = divisors(coefficients[0]);
    const expected = { p: plusMinus(p), q: plusMinus(q), 'p/q': plusMinus(unique(p.flatMap((top) => q.map((bottom) => top / bottom)))) };
    for (const [fieldId, kind] of Object.entries(asks)) {
      const key = question.answerFields.find((field) => field.id === fieldId).answer;
      assert.ok(sameSet(listOf(key), expected[kind]), `${id}.${fieldId}: ${key}`);
    }
  }
  // Every listed zero makes the polynomial 0, and there are as many as its degree.
  for (const [id, coefficients] of [['rf-cw-4', [1, 4, -15, -18]], ['rf-cw-11', [1, -2, -7, 8, 12]], ['rf-p-8', [1, 1, -4, -4]], ['rf-p-10', [1, 1, -7, -1, 6]]]) {
    const [question] = met(id);
    assert.ok(sidesOf(question.prompt).some((side) => sameValue(side, polynomialText(coefficients))), id);
    const zeros = listOf(question.answerFields.find((field) => field.id === 'zeros').answer);
    assert.equal(new Set(zeros).size, coefficients.length - 1, `${id}: one zero per degree`);
    for (const zero of zeros) assert.equal(horner(coefficients, zero).bottom.at(-1), 0, `${id}: P(${zero}) = 0`);
  }
  // The ac method's pair: product ac = 72 and sum b = −22.
  const pair = listOf(met('fp-cw-5')[0].answerFields.find((field) => field.id === 'pair').answer);
  assert.deepEqual([pair[0] * pair[1], pair[0] + pair[1]], [24 * 3, -22]);
});

/* ------------------------------------------- what cannot earn credit */

test('retyping the question is never the answer: no expression in a prompt is accepted for a form-graded key', () => {
  let refused = 0;
  for (const question of metAll((candidate) => candidate.type === 'multiAnswer')) {
    for (const field of question.answerFields.filter((candidate) => FORM_GRADED.includes(candidate.gradingMode))) {
      if (STEPS[question.questionId]?.[field.id]) continue;
      for (const side of sidesOf(question.prompt).filter((candidate) => sameValue(candidate, field.answer))) {
        assert.equal(matchesFieldAnswer(side, field), false, `${question.questionId}.${field.id}: "${side}" retyped is taken for ${field.answer}`);
        refused += 1;
      }
    }
  }
  assert.ok(refused > 750, `${refused} retypings refused`);
});

test('a calculator\'s display is never the exact answer, however many digits it shows', () => {
  let refused = 0;
  for (const question of metAll((candidate) => candidate.type === 'multiAnswer')) {
    for (const field of question.answerFields.filter((candidate) => candidate.gradingMode === 'simplestRadicalForm')) {
      const key = String(field.answer).replace(/\s/g, '');
      // A fraction whose denominator has only the factors 2 and 5 ends as a
      // decimal — 0.2 for 1/5 is the exact value, and right.
      const fraction = /^-?\d+(?:\/(\d+))?$/.exec(key);
      let denominator = Number(fraction?.[1] || 1);
      [2, 5].forEach((prime) => { while (denominator % prime === 0) denominator /= prime; });
      if (/[a-z]/i.test(key.replace(/sqrt|cbrt|root/g, '')) || (fraction && denominator === 1)) continue;
      const value = read(key)(SCOPES[0]);
      assert.equal(matchesFieldAnswer(String(value), field), false, `${question.questionId}.${field.id}: ${value} for ${field.answer}`);
      refused += 1;
    }
  }
  assert.ok(refused > 150, `${refused} displays refused`);
});

/* ------------------------------------------ the Polynomial Workshop */

test('each Polynomial Workshop item works on the prompt\'s own polynomial and divisor', () => {
  const rootShown = (prompt, r) => sidesOf(prompt).some((side) => sameValue(side, polynomialText([1, -r])))
    || segmentsOf(prompt).some((segment) => new RegExp(`^\\s*(?:[A-Za-z]\\(\\s*${r}\\s*\\)|x\\s*=\\s*${r})\\s*$`).test(segment.replace(/−/g, '-')));
  let checked = 0;
  for (const version of metAll((question) => question.type === 'polynomialWorkshop')) {
    const sides = sidesOf(version.prompt);
    const shows = (coefficients) => sides.some((side) => sameValue(side, polynomialText(coefficients)));
    if (version.mode === 'synthetic' || version.mode === 'factorZero') {
      const coefficients = version.mode === 'synthetic' ? version.dividend : version.coefficients;
      assert.ok(shows(coefficients), `${version.questionId}: ${polynomialText(coefficients)} in ${version.prompt}`);
      assert.ok(rootShown(version.prompt, rootOf(version)), `${version.questionId}: r = ${rootOf(version)} in ${version.prompt}`);
    } else if (version.mode === 'factorQuadratic') {
      assert.ok(shows(version.coefficients), `${version.questionId}: ${version.prompt}`);
    } else if (version.mode === 'multiplyArea') {
      const [[a, b], [c, d]] = [version.leftBinomial, version.rightBinomial];
      assert.ok(shows([a * c, a * d + b * c, b * d]), `${version.questionId}: ${version.prompt}`);
    } else {
      assert.fail(`${version.questionId}: unchecked mode ${version.mode}`);
    }
    checked += 1;
  }
  assert.ok(checked > 250, `${checked} workshop versions`);
});

test('where a prompt says x − r IS a factor, it is, in every version', () => {
  let checked = 0;
  const claim = /(?:^|(?<!so )that |\. )\$x\s*([+-])\s*(\d+)\$ is a factor of \$(?:P\(x\)\s*=\s*)?([^$]+)\$/;
  for (const version of metAll((question) => claim.test(question.prompt))) {
    const [, sign, size, polynomial] = claim.exec(version.prompt);
    const r = sign === '-' ? Number(size) : -Number(size);
    assert.ok(close(read(polynomial)({ x: r }), 0), `${version.questionId}: ${version.prompt}`);
    checked += 1;
  }
  assert.ok(checked > 90, `${checked} claims`);
});

test('synthetic division: the whole table earns full credit; the answers without the table do not', () => {
  let checked = 0;
  for (const version of metAll((question) => question.type === 'polynomialWorkshop' && question.mode === 'synthetic')) {
    const r = rootOf(version);
    const { middle, bottom } = horner(version.dividend, r);
    const remainder = bottom.at(-1);
    const answers = { value: num(remainder), quotient: polynomialText(bottom.slice(0, -1)), factorChoice: remainder === 0 ? 'yes' : 'no' };
    const table = { root: num(r), top: version.dividend.map(num), middle: middle.map(num), bottom: bottom.map(num) };
    const full = gradeToolWork({ toolId: 'polynomialWorkshop', question: version, work: { ...table, ...answers } });
    assert.equal(full.isCorrect, true, `${version.questionId}: ${JSON.stringify(full.parts?.filter((part) => !part.isCorrect))}`);
    const shortcut = gradeToolWork({ toolId: 'polynomialWorkshop', question: version, work: answers });
    assert.equal(shortcut.isCorrect, false, `${version.questionId}: the answers alone`);
    assert.ok(shortcut.score <= 0.5, `${version.questionId}: ${shortcut.score}`);
    checked += 1;
  }
  assert.ok(checked > 100, `${checked} synthetic divisions`);
});

/* ---------------------------------------------- radical equations */

// The equation a radical item states, as [left, right] evaluators: the one
// whose two sides agree at every genuine solution.
const statedEquation = (prompt, variable, solutions, extraneous) => segmentsOf(prompt)
  .filter((segment) => segment.split('=').length === 2 && segment.includes(variable))
  .map((segment) => segment.split('=').map(evaluator))
  .find(([left, right]) => left && right
    && solutions.every((value) => close(left({ [variable]: value }), right({ [variable]: value })))
    && extraneous.every((value) => !close(left({ [variable]: value }), right({ [variable]: value }))));

test('each radical equation\'s solutions solve the equation its prompt states, and its extraneous candidates do not', () => {
  let checked = 0;
  for (const version of metAll((question) => question.type === 'signSolutionAnalyzer' && question.questionId !== 'sr-p-11')) {
    const spec = version.radicalEquation;
    const variable = spec.variable || 'x';
    const { candidates, solutions } = version.mode === 'radicalCheck'
      ? { candidates: version.candidates, solutions: validRadicalCandidates(spec, version.candidates) }
      : radicalSolveKey(spec);
    assert.ok(candidates.length >= 1, `${version.questionId}: something to check`);
    const extraneous = candidates.filter((value) => !solutions.some((solution) => close(solution, value)));
    assert.ok(statedEquation(version.prompt, variable, solutions, extraneous), `${version.questionId}: ${version.prompt} → ${solutions} (extraneous ${extraneous})`);
    checked += 1;
  }
  assert.ok(checked > 200, `${checked} equations`);
  // Skid marks: s = √(30fd) with f = 0.75 and s = 45 mph.
  const [skid] = met('sr-p-11');
  assert.equal(skid.radicalEquation.radicand.m, 30 * 0.75);
  const { solutions } = radicalSolveKey(skid.radicalEquation);
  assert.deepEqual(solutions.map((d) => Math.sqrt(30 * 0.75 * d)), [45]);
  assert.match(skid.prompt, /45 mph/);
});

test('every DOL version of a radical equation is the item it is meant to be', () => {
  for (const version of met('sr-dol-1')) {
    const key = radicalSolveKey(version.radicalEquation);
    assert.deepEqual([key.candidates.length, key.solutions.length], [1, 1], version.prompt);
  }
  // Q2 always has exactly one extraneous candidate to catch.
  for (const version of met('sr-dol-2')) {
    const key = radicalSolveKey(version.radicalEquation);
    assert.deepEqual([key.candidates.length, key.solutions.length], [2, 1], version.prompt);
  }
});

test('the staged solver: full work earns full credit; a calculator\'s final answer alone earns one stage of five', () => {
  let checked = 0;
  for (const version of metAll((question) => question.type === 'signSolutionAnalyzer' && question.mode === 'radicalSolve')) {
    const key = radicalSolveKey(version.radicalEquation);
    const { variable } = key.equation;
    const list = (values) => values.map((value) => `${variable} = ${num(value)}`).join(', ');
    const extraneous = key.candidates.filter((value) => !key.solutions.some((solution) => close(solution, value)));
    const equation = version.questionId === 'sr-p-11'
      ? [read('sqrt(22.5d)'), () => 45]
      : statedEquation(version.prompt, variable, key.solutions, extraneous);
    // Both sides of the ORIGINAL equation at each candidate, from the prompt.
    const rows = key.candidates.map((value) => {
      const [left, right] = equation.map((side) => side({ [variable]: value }));
      return { left: Number.isFinite(left) ? num(left) : 'not real', right: num(right), decision: close(left, right) ? 'solution' : 'extraneous' };
    });
    const final = key.solutions.length ? { finalAnswer: list(key.solutions), noRealSolution: false } : { finalAnswer: '', noRealSolution: true };
    const work = {
      isolated: polynomialText([key.isolated.m, key.isolated.b], variable),
      raised: polynomialText(key.raised, variable),
      candidates: key.candidates.length ? list(key.candidates) : 'none',
      rows,
      ...final,
    };
    const full = gradeToolWork({ toolId: 'signSolutionAnalyzer', question: version, work });
    assert.equal(full.isCorrect, true, `${version.questionId}: ${JSON.stringify(full.parts?.filter((part) => !part.isCorrect))}`);
    const alone = gradeToolWork({ toolId: 'signSolutionAnalyzer', question: version, work: final });
    assert.equal(alone.isCorrect, false, `${version.questionId}: the final answer alone`);
    assert.ok(alone.score <= 0.2 + 1e-9, `${version.questionId}: ${alone.score}`);
    checked += 1;
  }
  assert.ok(checked > 200, `${checked} staged solves`);
});

/* -------------------------------------------------------- the sorts */

test('each sort board grades its key right, and the key with one card moved wrong', () => {
  const sorts = LESSONS.flatMap((lesson) => lesson.questions).filter((question) => question.type === 'openSortBoard');
  assert.equal(sorts.length, 6);
  for (const question of sorts) {
    const [scheme] = question.validSchemes;
    const groups = question.categories.map((category) => ({
      id: String(category.id),
      name: String(category.label),
      rationale: '',
      itemIds: scheme.groups.find((group) => group.id === category.id)?.itemIds || [],
    }));
    const placed = groups.flatMap((group) => group.itemIds);
    assert.deepEqual([...placed].sort(), question.items.map((item) => item.id).sort(), `${question.questionId}: every card placed once`);
    assert.equal(gradeToolWork({ toolId: 'openSortBoard', question, work: { groups } }).isCorrect, true, question.questionId);
    const moved = groups.map((group) => ({ ...group, itemIds: [...group.itemIds] }));
    moved[1].itemIds.push(moved[0].itemIds.shift());
    assert.equal(gradeToolWork({ toolId: 'openSortBoard', question, work: { groups: moved } }).isCorrect, false, `${question.questionId}: one card moved`);
  }
});
