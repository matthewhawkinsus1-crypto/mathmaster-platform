/*
 * ALGEBRA I · MODULE 3 — FOUR LESSONS, AS A TEACHER IMPORTS THEM.
 *
 *   T1 L1  Solving Linear Equations                        (A.5A)
 *   T1 L3  Modeling and Solving Linear Inequalities        (A.5B)
 *   T2 L1  Solving Systems by Graphing                     (A.3F, A.3G, A.5C)
 *   T2 L2  Solving Systems by Substitution                 (A.5C, A.2I)
 *
 * Each is one assignment in the four sections (Warm-Up, Classwork, Practice,
 * DOL), read through the chain a teacher's import uses
 * (scripts/check-teacher-import.mjs). Every Warm-Up and DOL question is a
 * Question Family slot, so the Warm-Up is shared in class and recoverable and
 * every student gets their own DOL and a fresh Recovery. Verdicts come from
 * the shared graders the server runs; the systems keys are re-derived here
 * from each prompt's givens, never read back from the key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { evaluateEquationSides } from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../teacher-import-jsons/algebra1-module3');
const FILES = {
  'T1 L1': 'T1_L1_Solving_Linear_Equations.json',
  'T1 L3': 'T1_L3_Modeling_and_Solving_Linear_Inequalities.json',
  'T2 L1': 'T2_L1_Solving_Systems_by_Graphing.json',
  'T2 L2': 'T2_L2_Solving_Systems_by_Substitution.json',
};
const load = (name) => {
  const text = fs.readFileSync(path.join(DIR, name), 'utf8');
  return { raw: JSON.parse(text), ...compileTeacherImport(text) };
};
const LESSONS = Object.fromEntries(Object.entries(FILES).map(([key, name]) => [key, load(name)]));
const compiled = (lesson, id) => {
  const question = LESSONS[lesson].questions.find((candidate) => candidate.questionId === id);
  assert.ok(question, `${lesson} compiles ${id}`);
  return question;
};
const ADVISORY_GROUPS = ['hiddenHints', 'hintAnswers', 'attemptFeedback', 'solutionReviews'];

for (const [key, lesson] of Object.entries(LESSONS)) {
  test(`${key}: Pre-Flight finds no error, warning or advisory, and Recovery is ready for the Warm-Up and the DOL`, () => {
    assert.deepEqual(lesson.model.errors, []);
    assert.deepEqual(lesson.model.warnings || [], []);
    assert.equal(lesson.model.isValid, true);
    ADVISORY_GROUPS.forEach((group) => assert.deepEqual(lesson.model[group]?.warnings || [], [], group));
    assert.deepEqual(lesson.semantic.errors, []);
    assert.deepEqual(lesson.semantic.warnings, []);
    const generation = lesson.model.questionGeneration;
    assert.equal(generation.recoveryReadiness?.fullyReady, true);
    assert.equal(generation.recovery?.warmup?.status, 'ready');
    assert.equal(generation.recovery?.dol?.status, 'ready');
  });

  test(`${key}: a simply named assignment in the four sections, with a one-try, hint-free DOL`, () => {
    assert.match(lesson.raw.assignment.title, /^[A-Z][A-Za-z ]+ \(M3 T\d L\d\)$/);
    const sections = lesson.raw.sections;
    assert.deepEqual(sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
    const counts = Object.fromEntries(sections.map((section) => [section.role, section.questions.length]));
    assert.equal(counts.warmup, 3);
    assert.equal(counts.dol, 2);
    assert.ok(counts.classwork >= 15 && counts.practice >= 14, JSON.stringify(counts));
    const dol = sections[3];
    assert.deepEqual([dol.attemptsAllowed, dol.hintsAllowed, dol.feedbackMode], [1, false, 'afterAssignmentSubmit']);
    dol.questions.forEach((question) => ['hints', 'guidedNotes', 'scaffold'].forEach((field) => assert.equal(question[field], undefined, `${question.questionId}: no ${field}`)));
    assert.equal(lesson.questions.length, sections.reduce((total, section) => total + section.questions.length, 0), 'every question survives the import');
  });

  test(`${key}: every Warm-Up and DOL question is a registered, Recovery-eligible Question Family slot`, () => {
    lesson.raw.sections.filter((section) => ['warmup', 'dol'].includes(section.role)).forEach((section) => {
      section.questions.forEach((question) => {
        const reference = question.questionFamily;
        assert.ok(reference?.id, `${question.questionId} names a family`);
        const family = getPlatformQuestionFamily(reference.id, reference.version);
        assert.ok(family, `${reference.id}${reference.version ? `@${reference.version}` : ''} is registered`);
        assert.equal(family.recovery?.eligible, true, `${reference.id} may serve Recovery`);
      });
    });
  });

  test(`${key}: students work in the interactive tools, not only typed boxes`, () => {
    const rich = new Set(lesson.questions.map((question) => question.type).filter((type) => type !== 'multiAnswer'));
    assert.ok(rich.size >= 2, `interactive tools used: ${[...rich].join(', ')}`);
  });

  test(`${key}: every written and chosen key is accepted by the shared grader, and one wrong part is not`, () => {
    const wrongOf = (field) => {
      const right = String(field.answer);
      if (Array.isArray(field.options) && field.options.length) return field.options.find((option) => option !== right);
      if (/[<>≤≥]/.test(right)) return right.replace(/<=|>=|[<>≤≥]/, (relation) => ({ '<': '>', '>': '<', '<=': '>=', '>=': '<=', '≤': '≥', '≥': '≤' }[relation]));
      if (right.includes('=')) return `${right} + 1`;
      const pair = /^\(\s*(-?[\d./]+)\s*,\s*(-?[\d./]+)\s*\)$/.exec(right);
      if (pair) return `(${pair[2]}, ${pair[1]})` === right.replace(/\s/g, '') ? `(${pair[1]}, 999)` : `(${pair[2]}, ${pair[1]})`;
      return '999';
    };
    lesson.questions.filter((question) => question.type === 'multiAnswer' && !question.questionFamily).forEach((question) => {
      const right = Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
      assert.equal(gradeMultiAnswerResponse(question, right).isCorrect, true, `${question.questionId}: its key is right`);
      question.answerFields.forEach((field) => {
        const wrong = wrongOf(field);
        if (wrong === undefined || wrong === String(field.answer)) return;
        assert.notEqual(gradeMultiAnswerResponse(question, { ...right, [field.id]: wrong }).isCorrect, true, `${question.questionId}.${field.id}: ${wrong} is not ${field.answer}`);
      });
    });
  });
}

/* ------------------------------------------------- the systems, re-derived */

// a·u + b·v = c from "5s + 10a = 3000" (one-letter variables, integers).
const row = (equation, [u, v]) => {
  const [left, right] = equation.replace(/\s+/g, '').split('=');
  const out = { a: 0, b: 0, c: 0 };
  const read = (side, sign) => side.replace(/-/g, '+-').split('+').filter(Boolean).forEach((term) => {
    const [, coefficient, letter] = /^(-?\d*\.?\d*)([a-z]?)$/.exec(term);
    const value = coefficient === '' ? 1 : coefficient === '-' ? -1 : Number(coefficient);
    if (letter === u) out.a += sign * value;
    else if (letter === v) out.b += sign * value;
    else out.c -= sign * value;
  });
  read(left, 1);
  read(right, -1);
  return out;
};
const solve = (equations, variables) => {
  const [p, q] = equations.map((equation) => row(equation, variables));
  const determinant = p.a * q.b - q.a * p.b;
  return { x: (p.c * q.b - q.c * p.b) / determinant, y: (p.a * q.c - q.a * p.c) / determinant };
};

test('T2 L1: the ticket system is graphed from the student\'s own points; its crossing is (300, 150), re-derived', () => {
  const question = compiled('T2 L1', 'm3t2l1-cw-7');
  assert.equal(question.interaction, 'construct');
  const { x, y } = solve(question.equationLabels, question.variables);
  assert.deepEqual([x, y], [300, 150]);
  const onLine = (m, b) => [0, 100].map((s) => ({ x: s, y: m * s + b }));
  const { m1, b1, m2, b2 } = question.system;
  const work = { construction: [{ points: onLine(m1, b1) }, { points: onLine(m2, b2) }], classification: 'one', x: String(x), y: String(y) };
  const browser = gradeToolWork({ toolId: 'systemsWorkspace', question, work });
  assert.equal(browser.isCorrect, true);
  assert.equal(gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).isCorrect, true);
  assert.equal(gradeToolWork({ toolId: 'systemsWorkspace', question, work: { ...work, x: String(y), y: String(x) } }).isCorrect, false, 'the coordinates swapped');
});

test('T2 L2: the band and the ticket-booth systems solve, by substitution in the workspace, to the prices re-derived from their equations', () => {
  [['m3t2l2-cw-16', [65, 45]], ['m3t2l2-cw-17', [8, 16]], ['m3t2l2-pr-15', [2, 3]]].forEach(([id, expected]) => {
    const question = compiled('T2 L2', id);
    assert.equal(question.mode, 'algebraic');
    assert.equal(question.method, 'substitution');
    const { x, y } = solve(question.equations, question.variables);
    assert.deepEqual([x, y], expected, id);
    const [u, v] = question.variables;
    const values = { [u]: x, [v]: y };
    const verification = Object.fromEntries(question.equations.map((equation, index) => {
      const sides = evaluateEquationSides(equation, values);
      return [`E${index + 1}`, { left: String(sides.left), right: String(sides.right) }];
    }));
    const work = { dimension: 2, method: 'substitution', values, verification, reducedStatement: null, specialCase: { statementTruth: '', solutionCount: '', classification: '' } };
    const browser = gradeToolWork({ toolId: 'systemsWorkspace', question, work });
    assert.equal(browser.isCorrect, true, id);
    assert.equal(gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).isCorrect, true, id);
    assert.equal(gradeToolWork({ toolId: 'systemsWorkspace', question, work: { ...work, values: { [u]: x + 1, [v]: y } } }).isCorrect, false, id);
  });
  // Mia's next customer: 5 student and 3 adult tickets at the prices found.
  const [s, a] = [8, 16];
  assert.equal(compiled('T2 L2', 'm3t2l2-cw-18').answerFields.find((field) => field.id === 'charge').answer, String(5 * s + 3 * a));
});

test('T2 L2: "write the system" fields take any form of the relation, so the equation is graded and not its spelling', () => {
  const question = compiled('T2 L2', 'm3t2l2-cw-12');
  const key = Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
  assert.equal(gradeMultiAnswerResponse(question, { ...key, people: 'y = 449 - x', fees: '5y + 7x = 2768' }).isCorrect, true);
  assert.equal(gradeMultiAnswerResponse(question, { ...key, fees: '5x + 7y = 2768' }).isCorrect, false, 'adults pay $7');
});
