/*
 * ALGEBRA I · MODULE 2 · TOPIC 2 — LESSONS 2 AND 3, AS A TEACHER IMPORTS THEM.
 *
 *   L2  Vertical and Horizontal Transformations of Linear Functions  (A.3E)
 *   L3  Slopes of Perpendicular Lines and Horizontal & Vertical Lines (A.2F, A.2G)
 *
 * Each is one 90-minute lesson in the four sections (Warm-Up, Classwork,
 * Practice, DOL). Everything here reads the files through the same chain a
 * teacher's import uses (scripts/check-teacher-import.mjs), and every verdict
 * comes from the shared graders the server runs — never from the JSON's own
 * idea of its key. The mathematics each key encodes is re-derived here from
 * the prompt's givens, so a key that is wrong cannot pass by agreeing with
 * itself.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { render, withBrowser } from './helpers/studentToolRender.mjs';
import { STATIC_GRAPH_PLOT_ASPECT, fitStaticGraphViewport } from '../../src/graphSpecUtils.js';
import { gradeMultiAnswerResponse, gradeTableResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { mapParentPoint } from '../../functions/shared/toolMath/transformations/transformationsMath.mjs';
import { buildFigureMatchResponse } from '../../src/platform/workflow/figureMatch.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';

after(closeEngine);

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../../teacher-import-jsons/algebra1-module2-topic2');
const FILES = {
  L2: 'L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json',
  L3: 'L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json',
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

for (const [key, lesson] of Object.entries(LESSONS)) {
  test(`${key} passes the teacher import's Pre-Flight with no errors and no warnings`, () => {
    assert.deepEqual(lesson.model.errors, []);
    assert.deepEqual(lesson.model.warnings || [], []);
    assert.equal(lesson.model.isValid, true);
    assert.deepEqual(lesson.semantic.errors, []);
  });

  test(`${key} is one 90-minute lesson in the four sections, and its Practice is the largest section`, () => {
    const sections = lesson.raw.sections;
    assert.deepEqual(sections.map((section) => section.role), ['warmup', 'classwork', 'practice', 'dol']);
    assert.equal(sections.reduce((total, section) => total + section.recommendedMinutes, 0), 90);
    const counts = Object.fromEntries(sections.map((section) => [section.role, section.questions.length]));
    assert.ok(counts.practice >= counts.classwork, 'Practice gives at least as much work as Classwork');
    assert.ok(counts.practice >= 12, `Practice has ${counts.practice} questions`);
    const dol = sections[3];
    assert.equal(dol.attemptsAllowed, 1);
    assert.equal(dol.hintsAllowed, false);
    assert.equal(dol.feedbackMode, 'afterAssignmentSubmit');
    for (const question of dol.questions) {
      assert.equal(question.hints, undefined, `${question.questionId}: no hints on the DOL`);
      assert.equal(question.guidedNotes, undefined, `${question.questionId}: no guided notes on the DOL`);
    }
    assert.equal(lesson.questions.length, sections.reduce((total, section) => total + section.questions.length, 0), 'every question survives the import');
  });

  test(`${key} uses the interactive tools, not only typed boxes`, () => {
    const types = new Set(lesson.questions.map((question) => question.type));
    const rich = [...types].filter((type) => !['multiAnswer'].includes(type));
    assert.ok(rich.length >= 3, `rich tools used: ${rich.join(', ')}`);
  });

  test(`${key}: every typed and chosen key is accepted by the shared grader, and a wrong answer is not`, () => {
    for (const question of lesson.questions.filter((candidate) => candidate.type === 'multiAnswer')) {
      const fields = question.answerFields;
      const right = Object.fromEntries(fields.map((field) => [field.id, String(field.answer)]));
      const graded = gradeMultiAnswerResponse(question, right);
      assert.equal(graded.isCorrect, true, `${question.questionId}: its own key is correct (${JSON.stringify(graded.parts.filter((part) => !part.isCorrect))})`);
      for (const field of fields) {
        const wrong = field.type === 'choice'
          ? field.options.find((option) => option !== field.answer)
          : field.inputProfile === 'equation' ? `${String(field.answer).split('=')[0]}=999` : field.answerFormat === 'orderedPair' ? '(999, 999)' : '999';
        const partial = gradeMultiAnswerResponse(question, { ...right, [field.id]: wrong });
        assert.equal(partial.isCorrect, false, `${question.questionId}.${field.id}: "${wrong}" is marked wrong`);
      }
      for (const field of fields.filter((candidate) => candidate.type === 'choice')) {
        assert.ok(field.options.length >= 3, `${question.questionId}.${field.id}: a choice has a real distractor, not a coin flip`);
      }
    }
  });
}

/* ------------------------------------------------------------------ L2 */

test('L2: each plotted transformation is graded at the lab\'s own images, and the same LINE with the wrong correspondence is not', () => {
  const plots = LESSONS.L2.questions.filter((question) => question.type === 'transformationsLab' && question.mode === 'plotTransform');
  assert.ok(plots.length >= 12, `${plots.length} plot-the-transformation items`);
  for (const question of plots) {
    const images = question.sourcePoints.map((point) => mapParentPoint(point, { type: 'linear', ...question.function }));
    const result = gradeToolWork({ toolId: 'transformationsLab', question, work: { plottedPoints: images } });
    assert.equal(result.isCorrect, true, `${question.questionId}: the images are correct`);
    const { xMin, xMax, yMin, yMax } = question.graphBounds;
    for (const [x, y] of images) assert.ok(x >= xMin && x <= xMax && y >= yMin && y <= yMax, `${question.questionId}: (${x}, ${y}) is on the visible grid`);
  }
  // The lesson's central idea: for f(x) = x, left 3 and up 3 draw the same
  // line, but the CORRESPONDING points differ. A student who moves every
  // point up 3 for a "left 3" task has drawn the right line through the wrong
  // images, and the lab must say so.
  const left3 = compiled('L2', 'l2-cw-1');
  assert.equal(left3.function.h, -3);
  const movedUp = left3.sourcePoints.map(({ x, y }) => [x, y + 3]);
  assert.equal(gradeToolWork({ toolId: 'transformationsLab', question: left3, work: { plottedPoints: movedUp } }).isCorrect, false);
});

test('L2: the simplified equations are the algebra of the stated transformation', () => {
  // f(x) = x and j(x) = 2x − 1, evaluated at sample inputs: the key must agree
  // with the transformation described in its own label.
  const j = (x) => 2 * x - 1;
  const evaluate = (expression, x) => Function('x', `return ${expression.replace(/(\d)x/g, '$1*x')};`)(x);
  const fields = (id) => Object.fromEntries(compiled('L2', id).answerFields.map((field) => [field.id, field.answer]));
  const checks = [
    ['l2-cw-3', 'tSimplified', (x) => x + 3],
    ['l2-cw-5', 'qSimplified', (x) => j(x) + 4],
    ['l2-cw-5', 'rSimplified', (x) => j(x + 4)],
    ['l2-cw-6', 'uSimplified', (x) => j(x - 2)],
    ['l2-cw-6', 'vSimplified', (x) => j(x) - 2],
    ['l2-cw-10', 'twoJ', (x) => 2 * j(x)],
    ['l2-cw-10', 'jTwoX', (x) => j(2 * x)],
    ['l2-pr-12', 'gSimplified', (x) => (x - 4) + 1],
    ['l2-pr-12', 'hSimplified', (x) => 3 * x - 2],
    ['l2-pr-13', 'pSimplified', (x) => -(x + 2) + 6],
    ['l2-pr-13', 'sSimplified', (x) => (-x + 6) - 2],
    ['l2-dol-2', 'simplified', (x) => 3 * (x - 2) + 1],
  ];
  for (const [id, fieldId, rule] of checks) {
    const key = fields(id)[fieldId];
    for (const x of [-3, 0, 2, 5]) assert.equal(evaluate(key, x), rule(x), `${id}.${fieldId} = ${key} at x = ${x}`);
  }
  assert.equal(fields('l2-cw-5').upEquivalent, '8', 'j(x + 4) = j(x) + 8 for slope 2');
});

test('L2: the dilation table is keyed by the stated factors, and decimals are accepted', () => {
  const question = compiled('L2', 'l2-cw-9');
  const rows = question.table.rows;
  const right = {};
  rows.forEach((row, index) => {
    right[`${index}:cx`] = String((4 / 5) * row.fx);
    right[`${index}:dx`] = String((5 / 4) * row.dy);
  });
  assert.equal(gradeTableResponse(question, right).isCorrect, true);
  assert.equal(gradeTableResponse(question, { ...right, '0:dx': '-1.6' }).isCorrect, false, 'c(x)\'s value in d(x)\'s input column is wrong');
});

test('L2: CW 9 names the column d draws its input in by the words its prompt uses, and says what a row is (CT04 / E3-43)', () => {
  const question = compiled('L2', 'l2-cw-9');
  const header = question.table.columns.find((column) => column.key === 'dx').label;
  // The column read "input of d" and nothing said that a row's (new input, d(x)) is
  // the point d draws. The walkthrough found it needed a second read and was the
  // slowest item in the lesson (about five minutes).
  assert.match(header, /new input/i, `"${header}" says the input is the new one`);
  // After "Complete the table." the prompt walks the row: where it starts and where it
  // lands for c and for d, naming every column by the header the student sees.
  const walk = question.prompt.slice(question.prompt.indexOf('Complete the table.'));
  assert.ok(walk.length > 'Complete the table.'.length, 'the prompt says what a row is');
  question.table.columns.forEach((column) => assert.ok(walk.includes(column.label), `the prompt names the column "${column.label}" as the table does`));
});

test('L2: each function CW 10 looks back at is made by one Classwork question, and no function is named for a number its own question uses (CT04 / A2-43)', () => {
  const classwork = LESSONS.L2.raw.sections[1].questions;
  const lookBack = classwork.find((question) => /^Look back at/.test(question.prompt));
  assert.ok(lookBack, 'CW 10 looks back at the functions made before it');
  for (const name of ['a', 'b', 'c', 'd']) {
    assert.match(lookBack.prompt, new RegExp(`\\b${name}\\(x\\)`), `CW 10 looks back at ${name}(x)`);
    const makers = classwork.filter((question) => question !== lookBack && new RegExp(`\\b${name}\\(x\\)`).test(JSON.stringify(question)));
    // CW 6 used to make a b(x) of its own ("j shifted right 2") and CW 8 another
    // ("inputs × 1/2"), so "look back at b(x)" meant two functions.
    assert.equal(makers.length, 1, `${name}(x) is made by ${makers.map((question) => question.questionId).join(' and ')}`);
  }
  // PR 13 named two functions m(x) and n(x), then asked about a line "with slope m"
  // shifted "n units".
  const pr13 = LESSONS.L2.raw.sections[2].questions.find((question) => question.questionId === 'l2-pr-13');
  const named = [...pr13.prompt.matchAll(/\b([a-z])\(x\)\s*=/g)].map(([, name]) => name).filter((name) => name !== 'j');
  assert.equal(named.length, 2, 'PR 13 makes two functions from j(x)');
  const general = pr13.responses.find((response) => response.id === 'general').label;
  const numbers = new Set(general.match(/\b[mn]\b/g));
  assert.deepEqual([...numbers].sort(), ['m', 'n'], 'its last part talks about a slope m and a distance n');
  named.forEach((name) => assert.ok(!numbers.has(name), `${name}(x) is also a number in the same question`));
});

test('L2: the Warm-Up graphs of g(x) = 3x − 8 and h(x) = −(2/3)x + 5 are drawn with equal units, so each slope looks its size (CT04 / A2-43)', () => {
  for (const id of ['l2-wu-2', 'l2-wu-3']) {
    const question = compiled('L2', id);
    const [{ m, b }] = question.graph.functions;
    // The picture a student sees: the authored window, reframed as GraphDisplay reframes it.
    const framed = fitStaticGraphViewport(question.graph);
    const width = framed.xMax - framed.xMin;
    const height = framed.yMax - framed.yMin;
    // One unit of x as long as one unit of y: the window is as wide, in units, as the
    // plot is wide in pixels. Without it the fitter widened y to −50…30 to keep the
    // steep line in frame and slope 3 drew at about half a unit of slope.
    assert.ok(Math.abs(width / height - STATIC_GRAPH_PLOT_ASPECT) < 0.02, `${id}: ${width} × ${height} units is not the plot's shape`);
    assert.ok(height <= 30, `${id}: y spans ${height} units`);
    // Both intercepts the question asks for are on the page.
    const inside = (x, y) => x >= framed.xMin && x <= framed.xMax && y >= framed.yMin && y <= framed.yMax;
    assert.ok(inside(0, b), `${id}: the y-intercept (0, ${b}) is in the window`);
    assert.ok(inside(-b / m, 0), `${id}: the x-intercept (${-b / m}, 0) is in the window`);
  }
});

for (const [key, lesson] of Object.entries(LESSONS)) {
  test(`${key}: every box that takes an expression is a math field, not a plain text box (CT04 / A2-43)`, async () => {
    // The box chooser reads a key with no sign it knows as plain words, and a minus is
    // not one (a hyphenated word must stay a word): "2x-5" was a text box beside "2x+3"
    // as a math field, on the same kind of question. Rendered here, as a student sees it.
    const { server } = await loadEngine();
    const { default: MultiAnswerGrader } = await server.ssrLoadModule('/src/MultiAnswerGrader.jsx');
    let boxes = 0;
    for (const question of lesson.questions.filter((candidate) => candidate.type === 'multiAnswer')) {
      const markup = await withBrowser(() => render(React.createElement(MultiAnswerGrader, { question, onStateChange() {}, onUndoStateChange() {}, feedback: null, draftKey: null })));
      const typed = question.answerFields.filter((field) => field.type !== 'choice');
      const words = typed.filter((field) => field.type === 'text');
      boxes += typed.length;
      assert.equal((markup.match(/<math-field\b/g) || []).length, typed.length - words.length, `${question.questionId}: a typed answer is in a math field`);
      assert.equal((markup.match(/<input\b[^>]*type="text"/g) || []).length, words.length, `${question.questionId}: only a field that asks for words is a plain box`);
    }
    assert.ok(boxes >= 15, `${boxes} typed boxes were looked at`);
  });
}

test('L2: the graph-sort matches each line to the equation that draws it', () => {
  const question = compiled('L2', 'l2-pr-8');
  const [stage] = question.workflow;
  const key = question.grading.sort.match;
  assert.equal(gradeWorkflow({ stages: question.workflow, grading: question.grading, responses: { sort: buildFigureMatchResponse(stage, key) } }).isCorrect, true);
  const swapped = { ...key, h: key.g, g: key.h };
  assert.equal(gradeWorkflow({ stages: question.workflow, grading: question.grading, responses: { sort: buildFigureMatchResponse(stage, swapped) } }).isCorrect, false);
  // 2f(x) is y = 2x, (1/2)f(x) is y = x/2, f(x) + 8 is y = x + 8, f(x − 7) is y = x − 7.
  const raw = LESSONS.L2.raw.sections[2].questions.find((candidate) => candidate.questionId === 'l2-pr-8');
  const slopeAndIntercept = Object.fromEntries(raw.figures.map((figure) => [figure.category, [figure.function.m, figure.function.b]]));
  assert.deepEqual(slopeAndIntercept, { plus8: [1, 8], times2: [2, 0], half: [0.5, 0], minus7: [1, -7] });
});

/* ------------------------------------------------------------------ L3 */

// '−4/3', '5', '-0.25' → a number (a lone numerator must not stay a string).
const fraction = (text) => {
  const [numerator, denominator = '1'] = String(text).replace(/−/g, '-').split('/');
  return Number(numerator) / Number(denominator);
};
const lineKey = (text) => {
  const match = String(text).replace(/\s/g, '').match(/^y=(-?[\d/]*)x([+-][\d/]+)?$/);
  assert.ok(match, `${text} is a slope-intercept key`);
  const value = (part) => (part === '' ? 1 : part === '-' ? -1 : fraction(part));
  return { m: value(match[1]), b: match[2] ? value(match[2]) : 0 };
};
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('L3: every perpendicular-line key is perpendicular to the given line and passes through the given point', () => {
  const cases = [
    // [question, equation field, given slope, point the answer must pass through]
    ['l3-pr-1', 'eq', 2, [6, 2]],
    ['l3-pr-2', 'eq', -3 / 4, [3, -8]],
    ['l3-pr-3', 'eq', (-9 - 3) / (-1 - -5), [6, 2]],
    ['l3-pr-4', 'eq', (4 - 1) / (0 - -6), [-2, 7]],
    ['l3-pr-5', 'eq', (4 - 9) / (-4 - 5), [5, 9]],
    ['l3-pr-12', 'eq', 4, [0, 0]],
    ['l3-dol-1', 'eq', -2, [4, 1]],
    ['l3-dol-3', 'eq', (4 - 1) / (2 - -4), [2, 4]],
  ];
  for (const [id, fieldId, givenSlope, [x, y]] of cases) {
    const field = compiled('L3', id).answerFields.find((candidate) => candidate.id === fieldId);
    const { m, b } = lineKey(field.answer);
    assert.ok(close(m * givenSlope, -1), `${id}: ${field.answer} is perpendicular to slope ${givenSlope}`);
    assert.ok(close(m * x + b, y), `${id}: ${field.answer} passes through (${x}, ${y})`);
  }
});

test('L3: slope-intercept answers accept the forms a student types, and refuse a form the label does not ask for', () => {
  const question = compiled('L3', 'l3-pr-1');
  const answer = (eq) => gradeMultiAnswerResponse(question, { m: '-1/2', b: '5', eq }).isCorrect;
  for (const typed of ['y=-\\frac{1}{2}x+5', 'y=-0.5x+5', 'y=5-\\frac{1}{2}x', 'y = −1/2x + 5']) assert.equal(answer(typed), true, typed);
  assert.equal(answer('y-2=-\\frac{1}{2}(x-6)'), false, 'the label asks for slope-intercept form');
  assert.equal(answer('y=2x+5'), false);
});

test('L3: the rotation warm-up keys are the images of B(8, 5), and their slopes are negative reciprocals', () => {
  const rotation = Object.fromEntries(compiled('L3', 'l3-wu-1').answerFields.map((field) => [field.id, field.answer]));
  assert.deepEqual(rotation, { b90: '(-5, 8)', b180: '(-8, -5)', b270: '(5, -8)' });
  const slopes = Object.fromEntries(compiled('L3', 'l3-wu-2').answerFields.map((field) => [field.id, field.answer]));
  assert.equal(slopes.ab, '5/8');
  assert.equal(slopes.ab90, '-8/5');
  assert.equal(slopes.ab180, '5/8');
  assert.equal(slopes.ab270, '-8/5');
});

test('L3: horizontal and vertical lines are graphed and named correctly', () => {
  const horizontal = compiled('L3', 'l3-cw-8');
  const vertical = compiled('L3', 'l3-cw-9');
  assert.equal(gradeToolWork({ toolId: 'graphing2', question: horizontal, work: { points: [[0, -2], [3, -2]] } }).isCorrect, true);
  assert.equal(gradeToolWork({ toolId: 'graphing2', question: horizontal, work: { points: [[-2, 0], [-2, 3]] } }).isCorrect, false, 'x = −2 is not y = −2');
  assert.equal(gradeToolWork({ toolId: 'graphing2', question: vertical, work: { points: [[3, 0], [3, 4]] } }).isCorrect, true);
  const pointSlope = compiled('L3', 'l3-pr-6');
  assert.equal(gradeToolWork({ toolId: 'graphing2', question: pointSlope, work: { points: [[-2, 4], [0, 3]] } }).isCorrect, true);
  assert.equal(gradeToolWork({ toolId: 'graphing2', question: pointSlope, work: { points: [[-2, 4], [-1, 6]] } }).isCorrect, false, 'slope 2 is the given line\'s slope, not the perpendicular one');
  const names = Object.fromEntries(compiled('L3', 'l3-cw-11').answerFields.map((field) => [field.id, field.answer]));
  assert.deepEqual(names, { h: 'y=-1', v: 'x=2', perpX5: 'y=0', perpYm2: 'x=5' });
});

test('L3: graph-preview choices and the slope-pair sort are keyed to the mathematics', () => {
  for (const [id, key] of [['l3-cw-6', 'y = 4'], ['l3-cw-7', 'x = 4'], ['l3-pr-7', 'y = 2x − 3']]) {
    const question = compiled('L3', id);
    const [stage] = question.workflow;
    const keyed = stage.choices.find((choice) => choice.id === question.grading.choice);
    assert.equal(keyed.label, key, `${id} keys ${key}`);
    assert.equal(gradeWorkflow({ stages: question.workflow, grading: question.grading, responses: { choice: keyed.id } }).isCorrect, true);
    const wrong = stage.choices.find((choice) => choice.id !== keyed.id);
    assert.equal(gradeWorkflow({ stages: question.workflow, grading: question.grading, responses: { choice: wrong.id } }).isCorrect, false);
  }
  // y = 2x − 3 is perpendicular to y = −(1/2)x + 4 and passes through (1, −1).
  assert.ok(close(2 * -0.5, -1) && close(2 * 1 - 3, -1));

  const sort = compiled('L3', 'l3-cw-5');
  const raw = LESSONS.L3.raw.sections[1].questions.find((candidate) => candidate.questionId === 'l3-cw-5');
  const value = (text) => (text === 'undefined' ? Infinity : fraction(text));
  for (const figure of raw.figures) {
    const slopes = [...figure.text.matchAll(/m[₁₂] (?:= ([−\d./]+)|is (undefined))/g)].map((match) => value(match[1] || match[2]));
    assert.equal(slopes.length, 2, figure.math);
    const [m1, m2] = slopes;
    const expected = !Number.isFinite(m1) || !Number.isFinite(m2)
      ? ((m1 === 0 || m2 === 0) ? 'perp' : 'par')
      : close(m1 * m2, -1) ? 'perp' : close(m1, m2) ? 'par' : 'neither';
    assert.equal(figure.category, expected, figure.text);
  }
  const [stage] = sort.workflow;
  assert.equal(gradeWorkflow({ stages: sort.workflow, grading: sort.grading, responses: { sort: buildFigureMatchResponse(stage, sort.grading.sort.match) } }).isCorrect, true);
});

test('L3: the quadrilateral is a rectangle by its slopes', () => {
  const slopes = Object.fromEntries(compiled('L3', 'l3-pr-11').answerFields.filter((field) => field.type !== 'choice').map((field) => [field.id, field.answer]));
  const at = { A: [1, 1], B: [5, 3], C: [4, 5], D: [0, 3] };
  const slope = (p, q) => (at[q][1] - at[p][1]) / (at[q][0] - at[p][0]);
  assert.ok(close(fraction(slopes.AB), slope('A', 'B')) && close(fraction(slopes.BC), slope('B', 'C')));
  assert.ok(close(fraction(slopes.CD), slope('C', 'D')) && close(fraction(slopes.DA), slope('D', 'A')));
  assert.ok(close(slope('A', 'B') * slope('B', 'C'), -1), 'adjacent sides are perpendicular');
});

test('the DOLs ask; they never print the answer they grade', () => {
  for (const [lesson, id] of [['L3', 'l3-dol-1'], ['L3', 'l3-dol-3'], ['L2', 'l2-dol-2']]) {
    const question = compiled(lesson, id);
    for (const field of question.answerFields.filter((candidate) => candidate.type !== 'choice')) {
      const key = String(field.answer).replace(/\s/g, '').replace(/^y=/, '');
      assert.ok(!question.prompt.replace(/\s/g, '').replace(/−/g, '-').includes(key), `${id} does not print ${field.answer}`);
    }
  }
});
