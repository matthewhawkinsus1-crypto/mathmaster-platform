/*
 * CT02 — WORKED STEPS FOR THE DISTRICT DOL #2 REVIEW: SEVEN TASKS, 336 VARIANTS.
 *
 * Audit findings A3-142 / A1-58: the seven review tasks of
 * drafts/district-dol2/assignment.json (48 variants each) showed a student who
 * closed one only the answer — the largest answer-only group a student can
 * reach outside the secure retest (kSteps_answerOnlyInventory.test.mjs).
 * functions/shared/districtDol2WorkedSolution.mjs now works each variant from
 * what the student was shown, and closedQuestionReview.js shows those steps
 * when the item has none of its own.
 *
 * Here:
 *   1. every variant (7 tasks × 48, pinned), as stored and as a student's
 *      device resolves it, gets steps, and what they state is graded right by
 *      the shared grader;
 *   2. every step is read back from its TEXT and checked against an oracle
 *      that works the stimulus itself (mathjs fractions, its own code): each
 *      arithmetic chain is true, each value stated is the oracle's, each point
 *      named is on the graph shown;
 *   3. it returns null — never a wrong step — when a key disagrees with what
 *      is shown, a panel is missing or out of place, or the item is anything
 *      else; it never states an answer the item does not already hold as its
 *      key, so a secure item's device copy (no keys) gets nothing;
 *   4. the closed review uses it only when the item has no steps of its own;
 *      only the closed review reads it, and it is not on the first load;
 *   5. rendered, the student's worked-solution panel shows the steps; Pre-Flight
 *      no longer names the seven tasks as answer-only.
 *
 * Mutation-checked (each went red, then was restored byte-for-byte):
 *   - the common difference written backwards (42 - 38 = -4), or the -d term's
 *     sign flipped in the multiplied-out rule → the chain check;
 *   - the constant worked as a₁ + d, with the grader guard on (no steps: the
 *     count) and off (the oracle and the shared grader);
 *   - each recursive line restarting from its own result → the chain check;
 *   - the y-intercept step reading the x-crossing → "on the line drawn";
 *   - the worked table row stating another row's total → the chain check;
 *   - the range written as its two ends, a strict comparison, the room's range
 *     as rate + hours, the intercepts swapped → the shared grader / oracle;
 *   - a zero named one to the right → "on the parabola";
 *   - the axis value not halved → the chain check;
 *   - a repeated pair counted as a second output → every variant gets steps;
 *   - predictions rounded down (the key's tolerance of 1 still accepts it) →
 *     the oracle and "to the nearest whole item";
 *   - the association verdicts swapped; a missing box label quoted as "";
 *   - no grader guard at all → the null cases and the keyless secure item;
 *   - closedQuestionReview letting the builder replace authored steps, not
 *     asking it, or never setting fromBuilder → section 4 and the device test;
 *   - a hint module importing the builder, App.jsx importing the closed review
 *     statically → "only the closed review reads it … not on the first load";
 *   - one task losing a variant → the pinned 7 × 48.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { all, create } from 'mathjs';

import mathPath from '../../functions/lib/mathPath.js';
import { districtDol2ReviewWorkedSolution } from '../../functions/shared/districtDol2WorkedSolution.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { auditAssignmentSolutionReviews, workedSolutionDepth } from '../../src/platform/preflight/solutionReviewPreflight.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const readJson = (relative) => JSON.parse(read(relative));

const assignment = readJson('drafts/district-dol2/assignment.json');
const TASKS = assignment.sections[0].questions;
const secureBank = readJson('functions/seeds/secureAssessments/algebra1_district_dol2.json');

// The seven review tasks as scripts/content/build_district_dol2.py writes them, 48 variants each.
const TASK_IDS = ['dol2-r01', 'dol2-r02', 'dol2-r03', 'dol2-r04', 'dol2-r05', 'dol2-r06', 'dol2-r07'];
const VARIANTS_PER_TASK = 48;
const taskById = (id) => TASKS.find((task) => task.questionId === id);
const variantsOf = (task) => task.variants.map((variant, index) => ({ index, question: { ...task, ...variant } }));
const copy = (value) => JSON.parse(JSON.stringify(value));

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const exact = (value) => math.fraction(String(value));
const same = (a, b) => math.equal(exact(a), exact(b));
const plain = (value) => Number(math.format(value, { fraction: 'decimal' }));
const roundHalfUp = (value) => Math.floor(plain(math.add(value, exact(0.5))));
const numbersIn = (value) => String(value).replace(/[{}()]/g, '').split(',').map((entry) => Number(entry.trim())).sort((a, b) => a - b);
const panelsOf = (question) => question.stimulus.panels;
const pairs = (points) => points.map((point) => [point.x, point.y]);

/** The parabola through three of the graph's points written exactly (four decimals at most): { a, b, c }. */
const parabolaThrough = (points) => {
  const chosen = points.filter(({ x, y }) => /^-?\d+(?:\.\d{1,4})?$/.test(String(x)) && /^-?\d+(?:\.\d{1,4})?$/.test(String(y)));
  assert.ok(chosen.length >= 3, 'three exactly written points on the curve');
  const picks = [chosen[0], chosen[Math.floor(chosen.length / 2)], chosen[chosen.length - 1]];
  const square = math.matrix(picks.map(({ x }) => [math.multiply(exact(x), exact(x)), exact(x), exact(1)]));
  const [a, b, c] = math.lusolve(square, math.matrix(picks.map(({ y }) => [exact(y)]))).toArray().map(([entry]) => entry);
  // The rest of the exactly written points agree with it: it IS the curve drawn.
  chosen.forEach(({ x, y }) => assert.ok(math.equal(valueAt({ a, b, c }, x), exact(y)), `(${x}, ${y}) is on the fitted parabola`));
  return { a, b, c };
};
const valueAt = ({ a, b, c }, x) => math.add(math.multiply(a, exact(x), exact(x)), math.multiply(b, exact(x)), c);
const escaped = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Least squares on the table, exactly. */
const leastSquares = (rows) => {
  const xs = rows.map(([x]) => exact(x));
  const ys = rows.map(([, y]) => exact(y));
  const mean = (values) => math.divide(values.reduce((sum, value) => math.add(sum, value), exact(0)), exact(values.length));
  const mx = mean(xs);
  const my = mean(ys);
  const sxy = xs.reduce((sum, x, index) => math.add(sum, math.multiply(math.subtract(x, mx), math.subtract(ys[index], my))), exact(0));
  const sxx = xs.reduce((sum, x) => math.add(sum, math.multiply(math.subtract(x, mx), math.subtract(x, mx))), exact(0));
  const slope = math.divide(sxy, sxx);
  return { slope, intercept: math.subtract(my, math.multiply(slope, mx)) };
};

/** Each relation's verdict, and every input with two different outputs. */
const relationVerdicts = (panel) => {
  const verdicts = {};
  const conflicts = [];
  for (const relation of panel.panels) {
    const id = relation.title.replace('Relation ', '');
    const list = relation.kind === 'graph' ? pairs(relation.graph.points) : relation.table.rows.map((row) => row.cells);
    const byInput = new Map();
    list.forEach(([x, y]) => byInput.set(x, new Set([...(byInput.get(x) || []), y])));
    const broken = [...byInput].filter(([, outputs]) => outputs.size > 1);
    verdicts[id] = broken.length ? 'Not a function' : 'Function';
    broken.forEach(([x]) => conflicts.push({ id, x }));
  }
  return { verdicts, conflicts };
};

/** What the oracle says each box's answer is, from the stimulus alone. */
const ORACLE = {
  'dol2-r01': (question) => {
    // Every case is a relationship seen in observations; none is an experiment.
    assert.match(panelsOf(question)[0].note, /observations from \d+ days/);
    return { association: 'Yes', causation: 'No' };
  },
  'dol2-r02': (question) => {
    const [explicit, recursive] = panelsOf(question);
    const terms = explicit.expressions[0].split(',').map((entry) => exact(entry.trim()));
    const d = math.subtract(terms[1], terms[0]);
    terms.forEach((term, index) => index && assert.ok(math.equal(math.subtract(term, terms[index - 1]), d), 'an arithmetic sequence'));
    const [, a1, step] = /a₁ = (-?[\d.]+) and aₙ = aₙ₋₁ \+ ([\d.]+)/.exec(recursive.note);
    const a = [exact(a1)];
    for (let n = 2; n <= 4; n += 1) a.push(math.add(a[n - 2], exact(step)));
    return { Part_1_coefficient: d, Part_1_constant: math.subtract(terms[0], d), Part_2_a2: a[1], Part_2_a3: a[2], Part_2_a4: a[3] };
  },
  'dol2-r03': () => null, // a line read on the grid: checked point by point against the line drawn (below)
  'dol2-r04': (question) => {
    const [table, graph, words] = panelsOf(question);
    const costs = table.table.rows.map((row) => row.cells[1]);
    const ys = graph.graph.curves[0].points.map((point) => point.y);
    const [, rate, hours] = /costs \$(\d+) per hour\. .*durations: ([\d, ]+)\./.exec(words.note);
    const durations = hours.split(',').map(Number);
    return {
      Part_1_range: costs,
      Part_2_lower: Math.min(...ys), Part_2_leftComparison: '≤', Part_2_variable: 'y', Part_2_rightComparison: '≤', Part_2_upper: Math.max(...ys),
      Part_3_domain: durations, Part_3_range: durations.map((value) => value * Number(rate)),
    };
  },
  'dol2-r05': (question) => {
    const [zerosPanel, axisPanel] = panelsOf(question);
    const { a, b, c } = parabolaThrough(zerosPanel.graph.curves[0].points);
    const root = math.sqrt(plain(math.subtract(math.multiply(b, b), math.multiply(4, a, c))));
    assert.ok(Number.isInteger(root), 'the zeros are rational');
    const zeros = [-1, 1].map((sign) => plain(math.divide(math.add(math.unaryMinus(b), exact(sign * root)), math.multiply(2, a)))).sort((x, y) => x - y);
    const path = parabolaThrough(axisPanel.graph.curves[0].points);
    return { Part_1_zeros: zeros, Part_2_variable: 'x', Part_2_value: math.divide(math.unaryMinus(path.b), math.multiply(2, path.a)) };
  },
  'dol2-r06': (question) => {
    const { verdicts, conflicts } = relationVerdicts(panelsOf(question)[0]);
    assert.equal(conflicts.length, 1, 'one input breaks the rule');
    return { ...verdicts, conflictInput: conflicts[0].x };
  },
  'dol2-r07': (question) => {
    const rows = panelsOf(question)[0].table.rows.map((row) => row.cells);
    const { slope, intercept } = leastSquares(rows);
    const prices = [...panelsOf(question)[0].note.matchAll(/at \$(\d+\.\d{2})/g)].map((match) => match[1]);
    const predict = (price) => roundHalfUp(math.add(math.multiply(slope, exact(price)), intercept));
    return { prediction1: predict(prices[0]), prediction2: predict(prices[1]) };
  },
};

/** The stated answer is the oracle's: numbers exactly, sets as sets, words as words. */
const assertSameAnswer = (stated, expected, label) => {
  if (Array.isArray(expected)) {
    assert.deepEqual(numbersIn(stated), [...expected].map(Number).sort((a, b) => a - b), label);
  } else if (typeof expected === 'string') {
    assert.equal(stated, expected, label);
  } else {
    assert.ok(same(stated, typeof expected === 'number' ? expected : math.format(expected, { fraction: 'decimal' })), `${label}: ${stated} ≠ ${expected}`);
  }
};

/*
 * EVERY ARITHMETIC CHAIN IN A STEP IS TRUE. Each " = " joins the arithmetic
 * that ends the text before it (digits, brackets, + - × ÷ ·, and n after a
 * digit or a bracket) to the arithmetic that starts the text after it; a side
 * that is a bare name ("x = 0", "aₙ = …") is a statement, not arithmetic, and
 * is left to the per-skill checks. Both sides are evaluated in exact
 * fractions, at n = 1 … 5 when they mention n.
 */
const ARITHMETIC = /[\d.()+\-×÷·\s]/;
const allowed = (text, index) => ARITHMETIC.test(text[index]) || (text[index] === 'n' && /[\d(]/.test(text[index - 1] || ''));
const tailOf = (text) => {
  let start = text.length;
  while (start > 0 && allowed(text, start - 1)) start -= 1;
  return text.slice(start);
};
const headOf = (text) => {
  let end = 0;
  while (end < text.length && allowed(text, end)) end += 1;
  return text.slice(0, end);
};
const balance = (expression) => {
  let value = expression.trim().replace(/\.+$/, '').trim();
  const opens = () => (value.match(/\(/g) || []).length;
  const closes = () => (value.match(/\)/g) || []).length;
  while (value.startsWith('(') && opens() > closes()) value = value.slice(1).trim();
  while (value.endsWith(')') && closes() > opens()) value = value.slice(0, -1).trim();
  return value;
};
const toMath = (expression) => expression.replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/(\d|\))\s*\(/g, '$1*(').replace(/(\d|\))n/g, '$1*n');
const checkedChains = (step) => {
  const segments = step.split(' = ');
  const chains = [];
  for (let index = 0; index + 1 < segments.length; index += 1) {
    const left = balance(tailOf(segments[index]));
    const right = balance(headOf(segments[index + 1]));
    // Both sides arithmetic, each starting with a number, a bracket or a minus sign.
    if (!/\d/.test(left) || !/\d/.test(right) || !/^[-(\d]/.test(left) || !/^[-(\d]/.test(right)) continue;
    const values = (expression) => [1, 2, 3, 4, 5].map((n) => math.evaluate(toMath(expression), { n: exact(n) }));
    const [l, r] = [values(left), values(right)];
    l.forEach((value, n) => assert.ok(math.equal(value, r[n]), `"${left} = ${right}" is false (n = ${n + 1}) in: ${step}`));
    chains.push(`${left} = ${right}`);
  }
  return chains;
};

/** A point on the line through the two points drawn (each drawn to 8 decimals). */
const onDrawnLine = (graph, [x, y]) => {
  const [p, q] = graph.lines[0].points;
  return Math.abs((q.y - p.y) * (x - p.x) - (y - p.y) * (q.x - p.x)) <= 1e-6 * Math.abs(q.x - p.x);
};

/* ------------------------------------------------------------ 1–2. every variant */

const allVariants = () => TASK_IDS.flatMap((id) => variantsOf(taskById(id)).map((entry) => ({ id, ...entry })));

test('the seven tasks are the ones the builder was written for: 7 × 48 variants, no family covers them', () => {
  assert.deepEqual(TASKS.map((task) => task.questionId), TASK_IDS);
  TASKS.forEach((task) => assert.equal(task.variants.length, VARIANTS_PER_TASK, task.questionId));
  allVariants().forEach(({ id, index, question }) => assert.equal(familyFor(question), null, `${id}#${index}: no support family`));
});

test('every variant gets steps, and what they state is graded right by the shared grader and is the oracle\'s answer', () => {
  const worked = new Map(TASK_IDS.map((id) => [id, 0]));
  for (const { id, index, question } of allVariants()) {
    const label = `${id}#${index}`;
    const solution = districtDol2ReviewWorkedSolution(question);
    assert.ok(solution, `${label}: worked`);
    assert.ok(solution.steps.length >= 2 && solution.headline && solution.answerSummary, label);
    // Every box is stated, and the shared grader marks the statement right.
    assert.deepEqual(Object.keys(solution.answers).sort(), question.answerFields.map((field) => field.id).sort(), label);
    const grade = gradeMultiAnswerResponse(question, solution.answers);
    assert.equal(grade.isCorrect, true, `${label}: ${JSON.stringify(grade.parts.filter((part) => !part.isCorrect))}`);
    // What is graded is what the student reads.
    const shown = [...solution.steps, solution.answerSummary].join(' ');
    Object.entries(solution.answers).forEach(([box, answer]) => assert.ok(shown.includes(answer), `${label}: ${box} = ${answer} is written in the steps`));
    // And it is the oracle's answer, worked from the stimulus.
    const expected = ORACLE[id](question);
    if (expected) Object.entries(expected).forEach(([box, value]) => assertSameAnswer(solution.answers[box], value, `${label} ${box}`));
    // Plain words: no step turns into a formula, none leaks a value.
    [solution.headline, ...solution.steps, solution.answerSummary].forEach((line) => {
      assert.deepEqual(splitMathSegments(line).filter(isMathSegment), [], `${label}: "${line}" is shown as prose`);
      assert.doesNotMatch(line, /NaN|undefined|null|Infinity|\[object/, label);
    });
    worked.set(id, worked.get(id) + 1);
  }
  // All of them: a task that loses its steps is named here.
  assert.deepEqual(Object.fromEntries(worked), Object.fromEntries(TASK_IDS.map((id) => [id, VARIANTS_PER_TASK])));
});

test('every arithmetic chain in every step is true, and each task has the chains it should', () => {
  // The fewest true chains each task's steps carry (a checker that silently
  // checks nothing would pass otherwise).
  const FEWEST = { 'dol2-r01': 0, 'dol2-r02': 5, 'dol2-r03': 0, 'dol2-r04': 3, 'dol2-r05': 1, 'dol2-r06': 0, 'dol2-r07': 2 };
  for (const { id, index, question } of allVariants()) {
    const chains = districtDol2ReviewWorkedSolution(question).steps.flatMap(checkedChains);
    assert.ok(chains.length >= FEWEST[id], `${id}#${index}: ${chains.length} chains checked (${chains.join('; ')})`);
  }
  // The checker itself catches a false one.
  assert.throws(() => checkedChains('So 38 - 42 = 4.'));
  assert.throws(() => checkedChains('Multiply out and combine: 42 - 4n + 4 = -4n + 45.'));
});

test('each step says what is true of THIS variant: read back from its text against the stimulus', () => {
  for (const { id, index, question } of allVariants()) {
    const label = `${id}#${index}`;
    const { steps } = districtDol2ReviewWorkedSolution(question);
    const panels = panelsOf(question);
    if (id === 'dol2-r01') {
      const [association, causation] = question.answerFields;
      assert.match(steps[0], new RegExp(`"${association.label.replace(/[?]/g, '\\?')}" is Yes\\.$`), label);
      assert.match(steps[1], /only summarizes observations/, label);
      assert.match(steps[1], new RegExp(`"${causation.label.replace(/[?]/g, '\\?')}" is No\\.$`), label);
    }
    if (id === 'dol2-r02') {
      const terms = panels[0].expressions[0].split(',').map(Number);
      const d = terms[1] - terms[0];
      const first = /^Part 1: Each term is (\d+) (less|more) than the one before \((-?\d+) - \(?(-?\d+)\)? = (-?\d+)\), so the common difference is d = (-?\d+)\.$/.exec(steps[0]);
      assert.ok(first, `${label}: ${steps[0]}`);
      assert.deepEqual([Number(first[1]), first[2], Number(first[3]), Number(first[4]), Number(first[6])], [Math.abs(d), d < 0 ? 'less' : 'more', terms[1], terms[0], d], label);
      const second = /^The first term, (-?\d+), is at n = 1, so aₙ = a₁ \+ \(n - 1\)·d = (-?\d+) \+ \(n - 1\)·\(?(-?\d+)\)?\.$/.exec(steps[1]);
      assert.ok(second, `${label}: ${steps[1]}`);
      assert.deepEqual([Number(second[1]), Number(second[2]), Number(second[3])], [terms[0], terms[0], d], label);
      // The rule it ends on gives the terms shown, at n = 1, 2, 3, ...
      const rule = /= ([^=]+)\. The coefficient of n is (-?\d+) and the constant is (-?\d+)\.$/.exec(steps[2]);
      assert.ok(rule, `${label}: ${steps[2]}`);
      terms.forEach((term, n) => assert.ok(math.equal(math.evaluate(toMath(rule[1]), { n: exact(n + 1) }), exact(term)), `${label}: the rule gives term ${n + 1}`));
      const [, a1, step] = /a₁ = (-?[\d.]+) and aₙ = aₙ₋₁ \+ ([\d.]+)/.exec(panels[1].note);
      assert.match(steps[3], new RegExp(`^Part 2: Start from a₁ = ${escaped(a1)} and add ${escaped(step)} for each next term: a₂ = a₁ \\+ ${escaped(step)} = ${escaped(a1)} \\+ ${escaped(step)} = `), label);
      [4, 5].forEach((position) => assert.match(steps[position], new RegExp(`^a${['₃', '₄'][position - 4]} = a${['₂', '₃'][position - 4]} \\+ ${escaped(step)} = [\\d.]+ \\+ ${escaped(step)} = [\\d.]+\\.$`), label));
      // Each term starts from the one the step before ended on.
      [3, 4].forEach((position) => assert.equal(/= ([\d.]+)\.$/.exec(steps[position])[1], /^a. = a. \+ [\d.]+ = ([\d.]+) /.exec(steps[position + 1])[1], label));
    }
    if (id === 'dol2-r03') {
      const { graph } = panels[0];
      const yRead = /crosses it at y = (-?\d+), so the y-intercept is \(0, (-?\d+)\)\.$/.exec(steps[0]);
      const xRead = /crosses it at x = (-?\d+), so the x-intercept is \((-?\d+), 0\)\.$/.exec(steps[1]);
      assert.ok(yRead && xRead && yRead[1] === yRead[2] && xRead[1] === xRead[2], `${label}: ${steps[0]} ${steps[1]}`);
      const [y, x] = [Number(yRead[1]), Number(xRead[1])];
      assert.ok(onDrawnLine(graph, [0, y]), `${label}: (0, ${y}) is on the line drawn`);
      assert.ok(onDrawnLine(graph, [x, 0]), `${label}: (${x}, 0) is on the line drawn`);
      assert.ok(x >= graph.xMin && x <= graph.xMax && y >= graph.yMin && y <= graph.yMax, `${label}: both crossings are inside the window`);
      assert.match(steps[2], new RegExp(`The zero is x = ${x}\\.$`), label);
    }
    if (id === 'dol2-r04') {
      const [table, graph, words] = panels;
      // The worked row is one of the table's, at the cost the words give.
      const [, perPerson, vehicle] = /costs \$([\d.]+) per person plus \$([\d.]+) for one vehicle/.exec(table.note);
      const row = /for (\d+) people, ([\d.]+) \+ ([\d.]+) × (\d+) = ([\d.]+) dollars\./.exec(steps[1]);
      assert.ok(row, `${label}: ${steps[1]}`);
      assert.deepEqual([row[2], row[3], row[1]], [vehicle, perPerson, row[4]], label);
      assert.ok(table.table.rows.some((entry) => entry.cells[0] === Number(row[1]) && same(entry.cells[1], row[5])), `${label}: the row is in the table`);
      const people = table.table.rows.map((entry) => entry.cells[0]);
      assert.match(steps[2], new RegExp(`from ${Math.min(...people)} through ${Math.max(...people)} can go, so the total is always one of these ${people.length} costs`), label);
      // The graph's ends are the points named.
      const [start, end] = graph.graph.points;
      assert.equal(steps[4], `The graph starts at (${start.x}, ${start.y}) and goes down to (${end.x}, ${end.y}). Both ends are part of the graph.`, label);
      const [, rate] = /costs \$(\d+) per hour/.exec(words.note);
      assert.match(steps[7], new RegExp(`^The output is the cost, ${rate} dollars for each hour: `), label);
    }
    if (id === 'dol2-r05') {
      const [zerosPanel, axisPanel] = panels;
      const { a, b, c } = parabolaThrough(zerosPanel.graph.curves[0].points);
      const crossings = [...steps[1].matchAll(/\((-?\d+), 0\)/g)].map((match) => Number(match[1]));
      assert.equal(crossings.length, 2, label);
      crossings.forEach((x) => assert.ok(math.equal(valueAt({ a, b, c }, x), exact(0)), `${label}: (${x}, 0) is on the parabola`));
      const [start, land] = axisPanel.graph.points;
      assert.match(steps[4], new RegExp(`^The path starts at \\(${start.x}, 0\\) and lands at \\(${land.x}, 0\\), both at height 0, `), label);
      assert.equal(start.y, 0, label);
      assert.equal(land.y, 0, label);
    }
    if (id === 'dol2-r06') {
      const { verdicts, conflicts } = relationVerdicts(panels[0]);
      for (const relation of panels[0].panels) {
        const relationId = relation.title.replace('Relation ', '');
        const said = steps.find((step) => step.startsWith(`Relation ${relationId}:`));
        assert.ok(said, `${label}: Relation ${relationId} is worked`);
        assert.match(said, new RegExp(`so Relation ${relationId} is ${verdicts[relationId] === 'Function' ? 'a function' : 'not a function'}\\.$`), label);
        const list = relation.kind === 'graph' ? pairs(relation.graph.points) : relation.table.rows.map((entry) => entry.cells);
        if (verdicts[relationId] === 'Function') {
          // It names exactly the relation's inputs.
          const named = /input \(([^)]+)\) has exactly one output/.exec(said)[1].split(/, | and /).map(Number).sort((x, y) => x - y);
          assert.deepEqual(named, [...new Set(list.map(([x]) => x))].sort((x, y) => x - y), label);
        } else {
          // It names the two pairs that break the rule, and they are in the relation.
          const named = [...said.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((match) => [Number(match[1]), Number(match[2])]);
          assert.equal(named.length, 2, label);
          named.forEach(([x, y]) => assert.ok(list.some(([px, py]) => px === x && py === y), `${label}: (${x}, ${y}) is in Relation ${relationId}`));
          assert.equal(named[0][0], named[1][0], label);
          assert.notEqual(named[0][1], named[1][1], label);
        }
      }
      assert.equal(steps[steps.length - 1], `An input with two different outputs is ${conflicts[0].x}, from Relation ${conflicts[0].id}.`, label);
    }
    if (id === 'dol2-r07') {
      const rows = panels[0].table.rows.map((entry) => entry.cells);
      const { slope, intercept } = leastSquares(rows);
      const line = /The line of best fit is y = (.+)x ([+-]) ([\d.]+)\.$/.exec(steps[0]);
      assert.ok(line, `${label}: ${steps[0]}`);
      assert.ok(same(line[1], math.format(slope, { fraction: 'decimal' })), `${label}: slope`);
      assert.ok(same(`${line[2] === '-' ? '-' : ''}${line[3]}`, math.format(intercept, { fraction: 'decimal' })), `${label}: intercept`);
      const prices = [...panels[0].note.matchAll(/at \$(\d+\.\d{2})/g)].map((match) => match[1]);
      prices.forEach((price, position) => {
        const said = /^At a price of ([\d.]+): y = .+ = ([\d.]+)(?:, which rounds to (\d+))?, so about (\d+) sold\.$/.exec(steps[position + 1]);
        assert.ok(said, `${label}: ${steps[position + 1]}`);
        assert.equal(said[1], price, label);
        const value = math.add(math.multiply(slope, exact(price)), intercept);
        assert.ok(same(said[2], math.format(value, { fraction: 'decimal' })), `${label}: the value at ${price}`);
        assert.equal(Boolean(said[3]), !Number.isInteger(Number(said[2])), `${label}: "rounds to" exactly when it is not whole`);
        // To the nearest whole item, a half rounding up — as the key was made.
        assert.equal(Number(said[4]), roundHalfUp(value), `${label}: ${said[2]} to the nearest whole item`);
        if (said[3]) assert.equal(said[3], said[4], label);
      });
    }
  }
});

test('a student\'s device resolves a review variant the same way: steps from the closed review, on the delivered question', () => {
  const storedVariants = new Map(TASKS.map((task) => [task.questionId, task.variants.map((variant) => JSON.stringify(variant.answerFields))]));
  TASKS.forEach((task, storageIndex) => {
    for (let seat = 0; seat < 10; seat += 1) {
      const runtime = prepareQuestionForRuntimeRouting({ ...task, activityRole: 'review' }, { serverGraded: false });
      const delivered = normalizeContextualQuestion(generateQuestion(runtime, `assignment:ct02:question:${storageIndex}`, null, null, { assignmentId: 'ct02', storageIndex, allocation: { seat } }));
      assert.ok(storedVariants.get(task.questionId).includes(JSON.stringify(delivered.answerFields)), `${task.questionId} seat ${seat}: one of the 48 checked above`);
      const review = buildClosedQuestionReview({ question: delivered, isToolQuestion: false, wasCorrect: false });
      assert.equal(review.fromBuilder, true, `${task.questionId} seat ${seat}`);
      assert.deepEqual(review.authored.reasoning, districtDol2ReviewWorkedSolution(delivered).steps);
      assert.equal(review.hasSteps, true);
      assert.equal(review.intro, 'Compare each step of your work with the worked solution.');
      assert.ok(review.speechText.includes(review.authored.reasoning[0]), 'read aloud reads the steps');
      // Not the teacher's words: Translate keeps them in English rather than offering the author's Spanish.
      assert.ok(review.speechParts.filter((part) => review.authored.reasoning.includes(part.text)).every((part) => !part.path));
    }
  });
});

/* ------------------------------------------------------------ 3. null, never a wrong step */

test('it returns null — never a wrong step — when a key disagrees with what is shown', () => {
  const variant = (id, index = 0) => copy(variantsOf(taskById(id))[index].question);
  const field = (question, id) => question.answerFields.find((entry) => entry.id === id);
  const cases = [
    ['an explicit-rule constant off by one', (q) => { field(q, 'Part_1_constant').answer += 1; }, 'dol2-r02'],
    ['a recursive term off by one', (q) => { field(q, 'Part_2_a3').answer += 1; }, 'dol2-r02'],
    ['the terms shown are not arithmetic', (q) => { q.stimulus.panels[0].expressions = ['42, 38, 35, 30, 26']; }, 'dol2-r02'],
    ['the y-intercept key off the line', (q) => { field(q, 'yIntercept').answer = '(0,1)'; }, 'dol2-r03'],
    ['a line drawn elsewhere', (q) => { q.stimulus.panels[0].graph.lines[0].points[0].y += 1; }, 'dol2-r03'],
    ['a table cost that the words do not give', (q) => { q.stimulus.panels[0].table.rows[1].cells[1] += 1; }, 'dol2-r04'],
    ['a strict comparison keyed', (q) => { field(q, 'Part_2_leftComparison').answer = '<'; }, 'dol2-r04'],
    ['a room rate that disagrees with the range key', (q) => { q.stimulus.panels[2].note = q.stimulus.panels[2].note.replace(/costs \$(\d+) per hour/, (whole, rate) => `costs $${Number(rate) + 5} per hour`); }, 'dol2-r04'],
    ['a parabola that crosses only once in its samples', (q) => { q.stimulus.panels[0].graph.curves[0].points = q.stimulus.panels[0].graph.curves[0].points.map((point) => ({ ...point, y: point.y + 0.5 })); }, 'dol2-r05'],
    ['an axis keyed off the middle', (q) => { field(q, 'Part_2_value').answer += 1; }, 'dol2-r05'],
    ['a second relation that breaks the rule', (q) => { const [inner] = q.stimulus.panels; const tableC = inner.panels.find((panel) => panel.title === 'Relation C'); tableC.table.rows[1].cells[1] += 7; }, 'dol2-r06'],
    ['a verdict keyed wrong', (q) => { field(q, 'C').answer = 'Not a function'; }, 'dol2-r06'],
    ['a prediction keyed one too high', (q) => { field(q, 'prediction1').answer += 2; field(q, 'prediction1').numericTolerance = 1; }, 'dol2-r07'],
    ['a table that is not the one keyed', (q) => { q.stimulus.panels[0].table.rows[0].cells[1] += 3; }, 'dol2-r07'],
    ['an experiment in the report', (q) => { q.stimulus.panels[0].note = q.stimulus.panels[0].note.replace('The report summarizes observations', 'Students were randomly assigned. The report summarizes observations'); }, 'dol2-r01'],
  ];
  for (const [what, mutate, id] of cases) {
    const question = variant(id);
    assert.ok(districtDol2ReviewWorkedSolution(question), `${what}: the unmutated item is worked`);
    mutate(question);
    assert.equal(districtDol2ReviewWorkedSolution(question), null, what);
    // The review then keeps what it showed before: the answers, no steps.
    const review = buildClosedQuestionReview({ question, legacyContent: () => ({ hasContent: true }) });
    assert.equal(review.fromBuilder, false, what);
    assert.equal(review.hasSteps, false, what);
  }
});

test('a missing, extra or misplaced part, or any other item, is not claimed', () => {
  const r04 = variantsOf(taskById('dol2-r04'))[0].question;
  const without = (question, change) => { const next = copy(question); change(next); return next; };
  const rejected = {
    'a panel missing': without(r04, (q) => { q.stimulus.panels.pop(); }),
    'the panels out of order': without(r04, (q) => { q.stimulus.panels.reverse(); }),
    'a box renamed': without(r04, (q) => { q.answerFields[0].id = 'Part_1_costs'; }),
    'a box more': without(r04, (q) => { q.answerFields.push({ id: 'Part_1_extra', answer: '1' }); }),
    'a box from no part': without(r04, (q) => { q.answerFields.push({ id: 'range2', answer: '1' }); }),
    'not a multiAnswer': without(r04, (q) => { q.type = 'table'; }),
    'no stimulus': without(r04, (q) => { delete q.stimulus; }),
  };
  // A step that quotes a box's question needs the question: no label, no steps.
  rejected['an association box with no label'] = without(variantsOf(taskById('dol2-r01'))[0].question, (q) => { delete q.answerFields[1].label; });
  Object.entries(rejected).forEach(([what, question]) => assert.equal(districtDol2ReviewWorkedSolution(question), null, what));
  for (const question of [null, undefined, {}, 7, 'x', { type: 'multiAnswer' }, { type: 'multiAnswer', answerFields: [{ id: 'range', answer: '{1,2}' }], stimulus: { panels: [{ note: 'Enter the range.' }] } }]) {
    assert.equal(districtDol2ReviewWorkedSolution(question), null, JSON.stringify(question));
  }
  const hostile = new Proxy({ type: 'multiAnswer' }, { get(target, key) { if (key === 'type') return 'multiAnswer'; if (typeof key === 'symbol') return undefined; throw new Error(`no ${String(key)}`); } });
  assert.equal(districtDol2ReviewWorkedSolution(hostile), null, 'never throws');
});

test('it never states an answer the item does not hold as its key: a secure retest item gets nothing, on the server or the device', async () => {
  for (const family of secureBank.documents) {
    for (const [index, variant] of family.variants.entries()) {
      const stored = { ...family, ...variant };
      // The server's copy (keys in responseFields[].expected) is not a review task.
      assert.equal(districtDol2ReviewWorkedSolution(stored), null, `${family.id}#${index} stored`);
      // What a student's device receives while testing: no keys, and no worked solution.
      const delivered = mathPath.buildSanitizedQuestion(stored);
      assert.equal(districtDol2ReviewWorkedSolution(delivered), null, `${family.id}#${index} delivered`);
      const review = buildClosedQuestionReview({ question: delivered });
      assert.equal(review.fromBuilder, false);
      assert.equal(review.hasSteps, false);
    }
  }
  // Even dressed as a review task, an item with no keys is never worked: the
  // steps state only what the item's own key accepts.
  const r03 = variantsOf(taskById('dol2-r03'))[0].question;
  const keyless = { ...r03, answerFields: r03.answerFields.map(({ answer: _answer, ...field }) => field) };
  assert.equal(districtDol2ReviewWorkedSolution(keyless), null);
});

/* ------------------------------------------------------------ 4. where it is read */

test('closed review: authored steps win; the builder fills only an item with none, keeping the author\'s summary and warning', () => {
  const question = variantsOf(taskById('dol2-r05'))[3].question;
  const built = districtDol2ReviewWorkedSolution(question);
  const authoredReview = { headline: 'Read the graph.', reasoning: ['Find where it meets the x-axis.', 'Halfway between the ends is the axis.'] };
  const authored = buildClosedQuestionReview({ question: { ...question, solutionReview: authoredReview } });
  assert.equal(authored.fromBuilder, false);
  assert.deepEqual(authored.authored.reasoning, authoredReview.reasoning, 'the author\'s steps, unchanged');
  const partial = buildClosedQuestionReview({ question: { ...question, solutionReview: { answerSummary: 'Zeros and axis as read.', commonError: 'The axis is a vertical line, so it is x = …, not y = ….' } } });
  assert.equal(partial.fromBuilder, true);
  assert.equal(partial.fromFamily, false);
  assert.deepEqual(partial.authored.reasoning, built.steps);
  assert.equal(partial.authored.headline, built.headline);
  assert.equal(partial.authored.answerSummary, 'Zeros and axis as read.', 'the author\'s summary wins');
  assert.equal(partial.authored.commonError, 'The axis is a vertical line, so it is x = …, not y = ….');
  const plainReview = buildClosedQuestionReview({ question });
  assert.equal(plainReview.authored.answerSummary, built.answerSummary);
  // A family's steps are never replaced (the builder is asked only when no family wrote any).
  const familyItem = { type: 'multiAnswer', prompt: 'A line passes through (0, 4) and (3, 2). Find its slope and y-intercept.', answerFields: [{ id: 'm', label: 'Slope', answer: '-2/3' }, { id: 'b', label: 'y-intercept', answer: '4' }] };
  const familyReview = buildClosedQuestionReview({ question: familyItem });
  assert.equal(familyReview.fromFamily, true);
  assert.equal(familyReview.fromBuilder, false);
});

test('only the closed review reads it (it states the answer), and it is not on the student\'s first load', () => {
  const files = [];
  const walk = (directory) => readdirSync(new URL(directory, ROOT)).forEach((name) => {
    const child = `${directory}/${name}`;
    if (statSync(new URL(child, ROOT)).isDirectory()) walk(child);
    else if (/\.(m?js|jsx|cjs)$/.test(name)) files.push(child);
  });
  ['src', 'functions/lib', 'functions/shared'].forEach(walk);
  // No hint, back-up step, sibling, practice or server path: only the closed review.
  const readers = files.filter((file) => /districtDol2WorkedSolution/.test(executableSource(read(file))));
  assert.deepEqual(readers, ['src/platform/supports/review/closedQuestionReview.js']);
  const graph = firstLoadGraph();
  const builder = path.join(repo, 'functions/shared/districtDol2WorkedSolution.mjs');
  assert.ok(!graph.has(builder), `on the first load: ${chainTo(graph, builder)}`);
});

/* ------------------------------------------------------------ 5. what the student and the teacher see */

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

test('rendered: the worked-solution panel of a closed review task lists its steps under the part-by-part rows', async () => {
  const SolutionReviewPanel = (await vite.ssrLoadModule('/src/SolutionReviewPanel.jsx')).default;
  const question = variantsOf(taskById('dol2-r04'))[0].question;
  const { steps, headline } = districtDol2ReviewWorkedSolution(question);
  const yourParts = question.answerFields.map((field, index) => ({ key: field.id, response: index === 0 ? '{59.5, 205.5}' : String(field.answer), isCorrect: index !== 0 }));
  const html = renderToStaticMarkup(React.createElement(SolutionReviewPanel, { question, yourParts, readAloud: { language: 'en' } }));
  assert.match(html, /data-worked-solution="present"/);
  assert.match(html, /Compare each step of your work with the worked solution\./);
  assert.match(html, /data-part-review=""/);
  const authored = html.slice(html.indexOf('data-review-source="authored"'));
  assert.ok(html.indexOf('data-part-review=""') < html.indexOf('data-review-source="authored"'), 'the rows, then the steps');
  assert.equal((authored.slice(0, authored.indexOf('</ol>')).match(/<li/g) || []).length, steps.length, 'one list item per step');
  assert.ok(authored.includes(headline.split(';')[0]));
  assert.ok(authored.includes('Only whole numbers of people from 1 through 5 can go'));
});

test('Pre-Flight: the seven tasks no longer show only the answer after the last try', () => {
  TASKS.forEach((task) => assert.equal(workedSolutionDepth(task), 'steps', task.questionId));
  assert.deepEqual(auditAssignmentSolutionReviews(TASKS).answerOnly, []);
});
