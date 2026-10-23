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
 *
 * Each lesson also has an Honors file ("… Honors (M3 Tn Ln)") held to the
 * same checks here; algebra1Module3Honors.test.mjs holds what an Honors class
 * gets from it.
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
import { equationWorkspaceWork, relationWorkspaceWork, stepAlgebraWorkGrader } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { relationSourceFromQuestion, resolveStepAlgebraMode } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { parseRelationSource, relationSolutionSummary } from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { all, create } from 'mathjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../teacher-import-jsons/algebra1-module3');
const FILES = {
  'T1 L1': 'T1_L1_Solving_Linear_Equations.json',
  'T1 L3': 'T1_L3_Modeling_and_Solving_Linear_Inequalities.json',
  'T2 L1': 'T2_L1_Solving_Systems_by_Graphing.json',
  'T2 L2': 'T2_L2_Solving_Systems_by_Substitution.json',
  'T1 L1 Honors': 'T1_L1_Solving_Linear_Equations_Honors.json',
  'T1 L3 Honors': 'T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json',
  'T2 L1 Honors': 'T2_L1_Solving_Systems_by_Graphing_Honors.json',
  'T2 L2 Honors': 'T2_L2_Solving_Systems_by_Substitution_Honors.json',
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
    assert.match(lesson.raw.assignment.title, key.endsWith('Honors') ? /^[A-Z][A-Za-z ]+ Honors \(M3 T\d L\d\)$/ : /^[A-Z][A-Za-z ]+ \(M3 T\d L\d\)$/);
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

/* ----------------------------------- every written equation, from itself */

const exact = create(all, { number: 'Fraction' });
const fractionText = (value) => {
  const fraction = exact.fraction(value);
  const sign = fraction.s < 0 ? '-' : '';
  return Number(fraction.d) === 1 ? `${sign}${fraction.n}` : `${sign}${fraction.n}/${fraction.d}`;
};
const FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' };

// The solution of a linear equation or inequality, read from its two sides
// (each side evaluated exactly at 0 and 1), never from a key.
const solveFromSides = (source, variable) => {
  const text = source.replace(/−/g, '-').replace(/≤/g, '<=').replace(/≥/g, '>=');
  const [, left, relation, right] = /^(.*?)(<=|>=|<|>|=)(.*)$/.exec(text);
  const gap = (value) => exact.subtract(
    exact.fraction(exact.evaluate(left, { [variable]: exact.fraction(value) })),
    exact.fraction(exact.evaluate(right, { [variable]: exact.fraction(value) })),
  );
  const b = gap(0);
  const a = exact.subtract(gap(1), b);
  if (exact.equal(a, 0)) {
    // No variable left: the statement b (relation) 0 is true for every value or for none.
    const sign = Number(exact.compare(b, 0));
    const holds = { '=': sign === 0, '<': sign < 0, '>': sign > 0, '<=': sign <= 0, '>=': sign >= 0 }[relation];
    return { special: holds ? 'allReals' : 'noSolution' };
  }
  const boundary = exact.divide(exact.unaryMinus(b), a);
  return { relation: relation === '=' || exact.compare(a, 0) > 0 ? relation : FLIP[relation], boundary };
};

const stepAlgebraItems = Object.entries(LESSONS).flatMap(([key, lesson]) => lesson.questions
  .filter((question) => question.type === 'stepAlgebra' && !question.questionFamily)
  .map((question) => ({ key, question })));

test('every hand-written Step Algebra equation and inequality is graded right from its own solution, and wrong one unit off, in the browser and on the server', () => {
  assert.ok(stepAlgebraItems.length >= 30, `${stepAlgebraItems.length} items`);
  const verdict = (question, work) => {
    const browser = gradeToolCheck(stepAlgebraWorkGrader, question, work);
    const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
    assert.equal(server.isCorrect, browser.isCorrect, `${question.questionId}: browser and server agree`);
    return browser.isCorrect;
  };
  stepAlgebraItems.forEach(({ key, question }) => {
    const variable = question.solveFor || 'x';
    const solved = solveFromSides(relationSourceFromQuestion(question), variable);
    const label = `${key} ${question.questionId}`;
    if (resolveStepAlgebraMode(question) !== 'relation') {
      assert.ok(!solved.special && solved.relation === '=', `${label} opens the equation workspace with one solution`);
      const at = (value) => equationWorkspaceWork({ equation: { left: variable, right: fractionText(value) } });
      assert.equal(verdict(question, at(solved.boundary)), true, `${label}: ${variable} = ${fractionText(solved.boundary)}`);
      assert.equal(verdict(question, at(exact.add(solved.boundary, 1))), false, `${label}: one unit off`);
      return;
    }
    const relationWork = (state) => relationWorkspaceWork({
      relationState: state,
      representation: state.special || question.representSolution === false ? null : { intervals: relationSolutionSummary(state).intervals, notation: '', inequality: '' },
    });
    if (solved.special) {
      assert.equal(verdict(question, relationWork({ special: solved.special, branches: [] })), true, `${label}: ${solved.special}`);
      assert.equal(verdict(question, relationWork({ special: solved.special === 'allReals' ? 'noSolution' : 'allReals', branches: [] })), false, `${label}: the other special case`);
      return;
    }
    const final = (boundary) => parseRelationSource(`${variable} ${solved.relation} ${fractionText(boundary)}`, variable);
    assert.equal(verdict(question, relationWork(final(solved.boundary))), true, `${label}: ${variable} ${solved.relation} ${fractionText(solved.boundary)}`);
    assert.equal(verdict(question, relationWork(final(exact.add(solved.boundary, 1)))), false, `${label}: one unit off`);
  });
});

/* -------------------------------------------- written models, any form */

test('T1 L1 and its Honors file: an area, perimeter or cost model is graded as an expression in any equivalent form', () => {
  const both = (question, answers) => {
    const browser = gradeMultiAnswerResponse(question, answers);
    const server = gradeServerResponse({ question, response: { kind: 'fields', fields: Object.entries(answers).map(([id, value]) => ({ id, value })) } });
    assert.equal(server.isCorrect, browser.isCorrect, question.questionId);
    return browser.isCorrect;
  };
  const keyOf = (question) => Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
  ['T1 L1', 'T1 L1 Honors'].forEach((key) => {
    const rectangles = compiled(key, key === 'T1 L1' ? 'm3l1-cw-16' : 'm3l1h-cw-16');
    const answers = keyOf(rectangles);
    assert.equal(both(rectangles, { ...answers, areaA: '30 + 12x', areaB: '8x + 40' }), true, `${key}: 8x + 40 is the area of rectangle B`);
    assert.equal(both(rectangles, { ...answers, areaB: '8(5 + x)' }), true, `${key}: so is 8(5 + x)`);
    assert.equal(both(rectangles, { ...answers, areaB: '8x + 5' }), false, `${key}: 8x + 5 is not`);
  });
  const shapes = compiled('T1 L1 Honors', 'm3l1h-pr-13');
  assert.equal(both(shapes, { ...keyOf(shapes), tri: '(2x + 1) + (x + 5) + (3x - 2)', sq: '4x + 12' }), true);
  assert.equal(both(shapes, { ...keyOf(shapes), sq: '4x + 3' }), false);
  const plumbers = compiled('T1 L1 Honors', 'm3l1h-pr-11');
  assert.equal(both(plumbers, { ...keyOf(plumbers), a: '45h + 65', b: '52.5h + 35' }), true);
  assert.equal(both(plumbers, { ...keyOf(plumbers), a: '110h' }), false, 'adding the fee to the rate is not the model');
});

/* ---------------------------------------------------- Honors, re-derived */

const linesOf = (question) => question.graph.functions.map(({ m, b }) => ({ m, b }));
const crossing = ([first, second]) => {
  const x = (second.b - first.b) / (first.m - second.m);
  return [x, first.m * x + first.b];
};

test('T2 L1 Honors: lines that look parallel in the window meet at (30, 17), off the screen — re-derived from the graphed lines', () => {
  const question = compiled('T2 L1 Honors', 'm3t2l1h-cw-16');
  const [x, y] = crossing(linesOf(question));
  assert.ok(Math.abs(x - 30) < 1e-9 && Math.abs(y - 17) < 1e-9, `(${x}, ${y})`);
  assert.ok(x > question.graph.xMax, 'the crossing is outside the graph the student sees');
  const key = Object.fromEntries(question.answerFields.map((field) => [field.id, String(field.answer)]));
  assert.equal(gradeMultiAnswerResponse(question, { ...key, sol: '(30, 17)' }).isCorrect, true);
  assert.equal(gradeMultiAnswerResponse(question, { ...key, sol: '(17, 30)' }).isCorrect, false);
});

test('T2 L1 Honors: standard-form and rental systems are graphed from the student\'s own grid points, and their crossings are re-derived', () => {
  const gridPoints = ({ m1, b1, m2, b2 }, graph, snap) => [[m1, b1], [m2, b2]].map(([m, b]) => {
    const points = [];
    for (let x = Math.ceil(graph.xMin / snap) * snap; x <= graph.xMax && points.length < 2; x += snap) {
      const y = m * x + b;
      if (y >= graph.yMin && y <= graph.yMax && Math.abs(y / snap - Math.round(y / snap)) < 1e-9) points.push({ x, y: Math.round(y / snap) * snap });
    }
    return { points };
  });
  [['m3t2l1h-pr-6', [3, 2]], ['m3t2l1h-pr-8', [100, 65]]].forEach(([id, expected]) => {
    const question = compiled('T2 L1 Honors', id);
    assert.equal(question.interaction, 'construct');
    const { x, y } = solve(question.equationLabels.map((label) => label.replace(/−/g, '-')), ['x', 'y']);
    assert.deepEqual([Math.round(x * 1e9) / 1e9, Math.round(y * 1e9) / 1e9], expected, id);
    const construction = gridPoints(question.system, question.graph, Number(question.snapStep) || 1);
    construction.forEach((line) => assert.equal(line.points.length, 2, `${id}: two clickable grid points on each line`));
    const work = { construction, classification: 'one', x: String(expected[0]), y: String(expected[1]) };
    const browser = gradeToolWork({ toolId: 'systemsWorkspace', question, work });
    assert.equal(browser.isCorrect, true, id);
    assert.equal(gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).isCorrect, true, id);
    assert.equal(gradeToolWork({ toolId: 'systemsWorkspace', question, work: { ...work, x: work.y, y: work.x } }).isCorrect, false, `${id}: swapped`);
  });
});

test('T2 L2 Honors: systems with no coefficient of 1, fraction and decimal coefficients solve by substitution to the values re-derived from their equations', () => {
  const decimals = (equation) => equation.replace(/\((-?\d+)\/(\d+)\)/g, (_, n, d) => String(Number(n) / Number(d)));
  [['m3t2l2h-cw-6', [0.5, 2]], ['m3t2l2h-pr-7', [6, 3]], ['m3t2l2h-pr-8', [7, 10]], ['m3t2l2h-pr-13', [170, 150]]].forEach(([id, expected]) => {
    const question = compiled('T2 L2 Honors', id);
    assert.equal(question.mode, 'algebraic');
    assert.equal(question.method, 'substitution');
    const { x, y } = solve(question.equations.map(decimals), question.variables);
    assert.ok(Math.abs(x - expected[0]) < 1e-9 && Math.abs(y - expected[1]) < 1e-9, `${id}: (${x}, ${y})`);
    const [u, v] = question.variables;
    const values = { [u]: expected[0], [v]: expected[1] };
    const verification = Object.fromEntries(question.equations.map((equation, index) => {
      const sides = evaluateEquationSides(equation, values);
      return [`E${index + 1}`, { left: String(sides.left), right: String(sides.right) }];
    }));
    const work = { dimension: 2, method: 'substitution', values, verification, reducedStatement: null, specialCase: { statementTruth: '', solutionCount: '', classification: '' } };
    const browser = gradeToolWork({ toolId: 'systemsWorkspace', question, work });
    assert.equal(browser.isCorrect, true, id);
    assert.equal(gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).isCorrect, true, id);
    assert.equal(gradeToolWork({ toolId: 'systemsWorkspace', question, work: { ...work, values: { [u]: expected[0] + 1, [v]: expected[1] } } }).isCorrect, false, id);
  });
});

test('T1 L3 Honors: the radios work strictly between 80 and 140 minutes — the compound interval is graded from the number line and the inequality', () => {
  const question = compiled('T1 L3 Honors', 'm3l3h-cw-14');
  const below = (4800 - 3200) / 20;
  const above = (4800 - 2000) / 20;
  assert.deepEqual([below, above], [80, 140]);
  const open = [{ min: below, max: above, minClosed: false, maxClosed: false }];
  const grade = (work) => {
    const browser = gradeToolWork({ toolId: 'intervalNumberLine', question, work });
    assert.equal(gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).isCorrect, browser.isCorrect);
    return browser.isCorrect;
  };
  assert.equal(grade({ intervals: open, notation: '', inequality: '80 < m < 140' }), true);
  assert.equal(grade({ intervals: [{ ...open[0], minClosed: true }], notation: '', inequality: '80 < m < 140' }), false, 'the troop is not yet below 3,200 feet at 80 minutes');
  assert.equal(grade({ intervals: open, notation: '', inequality: '80 < m < 240' }), false);
});
