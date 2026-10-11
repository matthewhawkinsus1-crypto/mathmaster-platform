/*
 * JOB K AUDIT — THE linesAndSlope SUPPORT FAMILY, SWEPT.
 *
 * supportFamily_linesAndSlope.test.mjs checks the family on its real items.
 * This file draws many more: linear.slopeFromPoints in every slope form,
 * functions.identifyIntercepts, linear.multipleRepresentations for every
 * GIVEN, the legacy lineGraph generator (equation shown and graph only), and
 * a fixed sweep of graphing2 lines in all six modes (vertical, horizontal,
 * zero and fractional slopes, a = ±1 factored forms, standard forms missing a
 * variable), linearTableWorkbench tables in all three modes (shuffled rows,
 * zero and fractional rates, a broken row anywhere), linear bridge tables and
 * the Step Algebra intercept orchestrator. Every value is recomputed with
 * mathjs in exact fraction arithmetic from what the question shows, and every
 * worked sibling is re-solved from its own prompt.
 *
 * Defects this file pins (each test failed on the code before its fix):
 *   - y = (x − 3) and y = −(x + 2) were told "The number in front of the
 *     parentheses is the slope" when no number is written there; a sibling
 *     said "The number in front of the parentheses, 1, is the slope";
 *   - 2y = −6 (a standard form with no x) was asked "Replace x or y with zero
 *     to find an intercept" as its first move, against its own hints;
 *   - a hidden NEGATIVE value leaked where a positive one could not: the hint
 *     quoted "y = (x - 3)" whose y-intercept is −3, and a sibling ended on
 *     "y = 5x - 5" for a question whose y-intercept is −5, because the platform
 *     guard does not read "- 5" as −5.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import * as linesAndSlope from '../../src/platform/supports/families/linesAndSlope.js';
import { similarExampleIsSafe } from '../../src/platform/supports/workedExample/similarProblem.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { generateQuestion } from '../../src/problemGenerator.js';

/* ------------------------------------------------------------ the independent oracle */

const math = create(all, { number: 'Fraction' });
const F = (value) => math.fraction(value);
const eq = (a, b) => math.equal(F(a), F(b));

const through = ([x1, y1], [x2, y2]) => {
  if (eq(x1, x2)) return { vertical: true, x: F(x1) };
  const m = math.divide(math.subtract(F(y2), F(y1)), math.subtract(F(x2), F(x1)));
  return { m, b: math.subtract(F(y1), math.multiply(m, F(x1))) };
};
const onLine = (line, [x, y]) => (line.vertical ? eq(x, line.x) : eq(y, math.add(math.multiply(line.m, F(x)), line.b)));
const pointsIn = (value) => [...String(value).replace(/−/g, '-')
  .matchAll(/\(\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:\/\d+)?)\s*\)/g)].map((match) => [F(match[1]), F(match[2])]);

/** A line written as y = …, x = … or Ax + By = C, read by evaluating it. */
const lineOf = (written) => {
  const source = written.replace(/−/g, '-').trim();
  const sides = source.split('=');
  const expression = `(${sides[0]}) - (${sides[1]})`.replace(/(\d)\s*([xy(])/g, '$1*$2').replace(/\)\s*([xy(])/g, ')*$1');
  const at = (x, y) => F(math.evaluate(expression, { x: F(x), y: F(y) }));
  const constant = at(0, 0);
  const A = math.subtract(at(1, 0), constant);
  const B = math.subtract(at(0, 1), constant);
  assert.ok(math.equal(at(2, 3), math.add(math.add(math.multiply(A, 2), math.multiply(B, 3)), constant)), `${written} is a line`);
  if (math.equal(B, 0)) return { vertical: true, x: math.divide(math.unaryMinus(constant), A) };
  return { m: math.divide(math.unaryMinus(A), B), b: math.divide(math.unaryMinus(constant), B) };
};

/** Every number a text states, signed: "- 5" is −5. Subscripts are not numbers. */
const numbersIn = (value) => [...String(value).replace(/[−–]/g, '-').replace(/[₀-₉]/g, '')
  .matchAll(/(-\s*)?(?:\\frac\{(\d+)\}\{(\d+)\}|(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?|\.\d+))/g)]
  .map((match) => {
    const magnitude = match[2] ? F(`${match[2]}/${match[3]}`) : match[4] ? F(`${match[4]}/${match[5]}`) : F(match[6]);
    return match[1] ? math.unaryMinus(magnitude) : magnitude;
  });

/** "(8 - 12) ÷ (1 - (-1)) = -4 ÷ 2 = -2": every all-number chain in a step holds. */
const assertArithmetic = (label, step) => {
  const source = String(step).replace(/−/g, '-');
  for (const match of source.matchAll(/[-\d\s().\/÷×+]*\d[-\d\s().\/÷×+]*(?:=[-\d\s().\/÷×+]*\d[-\d\s().\/÷×+]*)+/g)) {
    if (/[A-Za-z)]$/.test(source.slice(0, match.index).trimEnd()) || /^\s*[+-]\s/.test(match[0])) continue;
    const parts = match[0].split('=').map((part) => part.trim()).filter(Boolean);
    let values;
    try { values = parts.map((part) => F(math.evaluate(part.replace(/÷/g, '/').replace(/×/g, '*')))); } catch { continue; }
    values.forEach((value) => assert.ok(math.equal(value, values[0]), `${label}: "${parts.join(' = ')}" in "${step}"`));
  }
};

const HYGIENE = [/\+\s*-/, /-\s*-(?!\))/, /\+\s*\+/, /(^|[^\d.\\{/])1(?=[a-z](?![a-z]))/, /NaN|undefined|Infinity|null|\[object/, /(^|[=(,$]\s*)-\s*0(?![.\d])/, /\{-/];

/* ------------------------------------------------------------ the instances */

const sweep = [];
const add = (label, kind, question, hidden) => sweep.push({ label, kind, question, hidden });
const seat = (slot, index) => {
  const resolved = resolveFamilyQuestionInstance({ question: slot, assignmentId: 'k-audit-lines', storageIndex: 0, allocation: { seat: index, variant: 0, stride: 300, index, basis: 'seated' } });
  assert.equal(resolved.error, null);
  return resolved;
};
for (let index = 0; index < 14; index += 1) {
  for (const slopeForm of ['integer', 'fraction', 'any']) {
    const { question, instance: { values } } = seat({ questionId: `k-slope-${slopeForm}`, type: 'multiAnswer', questionFamily: { id: 'linear.slopeFromPoints', version: 1, tool: 'multiAnswer', constraints: { slopeForm } } }, index);
    add(`slopeFromPoints ${slopeForm} #${index}`, 'slope', question, [math.divide(F(values.rise), F(values.run))]);
  }
  // An intercept is a POINT: the guard lists pairs, so no single number is hidden.
  add(`identifyIntercepts #${index}`, 'intercepts', seat({ questionId: 'k-int', type: 'multiAnswer', questionFamily: { id: 'functions.identifyIntercepts', version: 1, tool: 'multiAnswer' } }, index).question, []);
  const shown = generateQuestion({ type: 'graphing', prompt: 'Identify the slope and the y-intercept.', generator: { kind: 'lineGraph' } }, `k${index}`);
  add(`lineGraph #${index}`, 'lineFeatures', shown, [F(shown.m), F(shown.b)]);
  const graphOnly = generateQuestion({ type: 'graphing', prompt: 'Read the slope and y-intercept from the graph.', showEquation: false, generator: { kind: 'lineGraph' } }, `g${index}`);
  add(`lineGraph graph only #${index}`, 'lineFeatures', graphOnly, [F(graphOnly.m), F(graphOnly.b)]);
}
for (const given of ['standardForm', 'slopeIntercept', 'pointSlope', 'twoPoints', 'table', 'scenario']) {
  for (const slope of given === 'scenario' ? ['integer'] : ['integer', 'fraction']) {
    for (const index of [0, 3, 6, 9]) {
      const { question, instance: { values } } = seat({ questionId: `k-lmr-${given}-${slope}`, type: 'representationBridge', questionFamily: { id: 'linear.multipleRepresentations', version: 1, tool: 'representationBridge', constraints: { given, slope } } }, index);
      add(`multipleRepresentations ${given} ${slope} #${index}`, 'multiRep', question, [math.divide(F(values.n), F(values.d)), F(values.b), F(values.zero)]);
    }
  }
}
// graphing2: what is hidden is m and b, unless the question prints them.
const hiddenOf = (line, printed) => (line.vertical ? [] : [line.m, line.b]).filter((value) => !printed.some((entry) => eq(entry, value)));
const SLOPES = [-3, -2, -1, 0, 1, 2, 3, 0.5, -0.5, 1.5, -2.5, 0.25, -4];
SLOPES.forEach((m, index) => {
  const b = (index * 5) % 13 - 6;
  add(`graphing2 slopeIntercept ${m},${b}`, 'graphLine', { type: 'graphing2', mode: 'slopeIntercept', prompt: 'Graph the line.', line: { m, b } }, []);
  const point = [(index % 7) - 3, ((index * 3) % 9) - 4];
  add(`graphing2 pointSlope ${point} ${m}`, 'graphLine', { type: 'graphing2', mode: 'pointSlope', prompt: 'Graph the line.', point, slope: m },
    hiddenOf({ m: F(m), b: math.subtract(F(point[1]), math.multiply(F(m), F(point[0]))) }, [...point.map(F), F(m)]));
  if (m) {
    const c = (index % 9) - 4;
    add(`graphing2 factoredLinear ${m},${c}`, 'graphLine', { type: 'graphing2', mode: 'factoredLinear', prompt: 'Graph the line.', factored: { a: m, c } },
      hiddenOf({ m: F(m), b: math.unaryMinus(math.multiply(F(m), F(c))) }, [F(m), F(c)]));
  }
});
[[[1, -4], [3, -2]], [[5, -3], [5, 0]], [[4, -3], [6, -3]], [[-2, -1], [2, 3]], [[0, 4], [3, -2]], [[-3, 5], [1, -3]], [[2, 7], [-1, -2]]].forEach(([first, second]) => {
  add(`graphing2 throughPoints ${first} ${second}`, 'graphLine', { type: 'graphing2', mode: 'throughPoints', prompt: 'Graph the line through the two points.', givenPoints: [first, second] }, hiddenOf(through(first, second), [...first, ...second].map(F)));
});
[[2, 3, 12], [0, 2, -6], [3, 0, 6], [-4, 2, 8], [5, -2, 10], [1, 1, -4], [-3, -6, 9]].forEach(([A, B, C]) => {
  const line = B === 0 ? { vertical: true, x: math.divide(F(C), F(A)) } : { m: math.divide(F(-A), F(B)), b: math.divide(F(C), F(B)) };
  add(`graphing2 standardForm ${A},${B},${C}`, 'graphLine', { type: 'graphing2', mode: 'standardForm', prompt: 'Graph the line.', standard: { A, B, C } }, hiddenOf(line, [A, B, C].map(F)));
});
[['vertical', 3], ['horizontal', -2], ['vertical', -5], ['horizontal', 0]].forEach(([orientation, value]) => add(`graphing2 ${orientation} ${value}`, 'graphLine', { type: 'graphing2', mode: 'verticalHorizontal', prompt: 'Graph the line.', orientation, value }, []));
// Tables.
[[2, 3, -2, 1], [-3, 1, 0, 2], [0.5, -1, -2, 3], [-1.5, 4, 1, 2], [4, -6, -1, 1], [0, 5, -3, 2], [1, 0, 0, 1], [-2, -3, 2, 3]].forEach(([m, b, x0, step], index) => {
  const at = (k) => ({ x: x0 + k * step, y: m * (x0 + k * step) + b });
  const rows = [0, 1, 2, 3].map(at);
  const shuffled = index % 2 ? [rows[2], rows[0], rows[3], rows[1]] : rows;
  add(`table deriveEquation ${index}`, 'tableEquation', { type: 'linearTableWorkbench', mode: 'deriveEquation', prompt: 'Write the equation.', rows: shuffled }, [F(m), F(b)]);
  add(`table constantRate ${index}`, 'tableRate', { type: 'linearTableWorkbench', mode: 'constantRate', prompt: 'Is the rate constant?', rows: shuffled }, [F(m)]);
  const bent = rows.map((row, k) => (k === 3 ? { x: row.x, y: row.y + 5 } : row));
  add(`table constantRate bent ${index}`, 'tableRate', { type: 'linearTableWorkbench', mode: 'constantRate', prompt: 'Is the rate constant?', rows: bent },
    [1, 2, 3].map((k) => math.divide(F(bent[k].y - bent[k - 1].y), F(bent[k].x - bent[k - 1].x))));
  const five = [0, 1, 2, 3, 4].map(at);
  const brokenAt = index % 5;
  add(`table repairValue ${index}`, 'tableRepair', { type: 'linearTableWorkbench', mode: 'repairValue', prompt: 'Fix the broken row.', rows: five.map((row, k) => (k === brokenAt ? { x: row.x, y: row.y + [3, -4, 7][index % 3] } : row)) }, [F(five[brokenAt].y), F(m)]);
  if (m) add(`bridge table ${index}`, 'bridge', { type: 'representationBridge', mode: 'linear', prompt: 'Connect every representation.', source: { kind: 'table', rows } }, [F(m), F(b), math.divide(F(-b), F(m))]);
});
[[3, 4, 24], [2, -5, 10], [6, 4, -12], [-1, 3, 9], [5, 1, -10]].forEach(([A, B, C]) => {
  add(`linearIntercepts ${A},${B},${C}`, 'intercepts', { type: 'stepAlgebra2', toolId: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A, B, C }, prompt: `Find both intercepts of ${A}x + ${B}y = ${C}.` }, []);
});

/* ------------------------------------------------------------ the sibling, re-solved */

const verifySibling = ({ label, kind }, sibling) => {
  sibling.steps.forEach((step) => assertArithmetic(label, step));
  let match;
  if (kind === 'slope') {
    const [first, second] = pointsIn(sibling.prompt);
    assert.ok(eq(F(sibling.answer), through(first, second).m), `${label}: ${sibling.answer} is the slope of ${sibling.prompt}`);
    return;
  }
  if (kind === 'intercepts') {
    const line = lineOf(/of (.+?)(?:\.$|\. Write)/.exec(sibling.prompt)[1]);
    const [xIntercept, yIntercept] = pointsIn(sibling.answer);
    assert.ok(onLine(line, xIntercept) && onLine(line, yIntercept) && math.equal(xIntercept[1], 0) && math.equal(yIntercept[0], 0), `${label}: ${sibling.answer}`);
    return;
  }
  if (kind === 'lineFeatures') {
    const [, m, b] = /^m = (.+), b = (.+)$/.exec(sibling.answer);
    if ((match = /of the line (.+)\.$/.exec(sibling.prompt))) {
      const line = lineOf(match[1]);
      assert.ok(eq(line.m, F(m)) && eq(line.b, F(b)), `${label}: ${sibling.answer}`);
    } else {
      assert.ok(eq(F(/at y = (-?[\d/]+)/.exec(sibling.prompt)[1]), F(b)) && onLine({ m: F(m), b: F(b) }, pointsIn(sibling.prompt)[0]), `${label}: ${sibling.answer}`);
    }
    return;
  }
  if (kind === 'graphLine') {
    let line;
    if (/^Graph the line that passes through/.test(sibling.prompt)) line = through(...pointsIn(sibling.prompt));
    else if ((match = /^Graph the line through (\(.+?\)) with slope (.+)\.$/.exec(sibling.prompt))) {
      const [point] = pointsIn(match[1]);
      line = { m: F(match[2]), b: math.subtract(point[1], math.multiply(F(match[2]), point[0])) };
    } else line = lineOf(/^Graph (.+)\.$/.exec(sibling.prompt)[1]);
    const points = pointsIn(sibling.answer.split(':')[0]);
    assert.ok(points.length === 2 && points.every((point) => onLine(line, point)) && !(eq(points[0][0], points[1][0]) && eq(points[0][1], points[1][1])), `${label}: ${sibling.answer} lies on ${sibling.prompt}`);
    sibling.steps.forEach((step) => pointsIn(step).forEach((point) => assert.ok(onLine(line, point), `${label}: "${step}" plots a point of the line`)));
    return;
  }
  if (kind === 'multiRep') {
    const parts = sibling.answer.split(';').map((part) => part.trim());
    const slope = F(/^slope (.+)$/.exec(parts[0])[1]);
    const [yIntercept] = pointsIn(parts[1]);
    const [xIntercept] = pointsIn(parts[2]);
    const slopeIntercept = lineOf(parts[3]);
    const standard = lineOf(parts[4]);
    assert.ok(eq(slopeIntercept.m, slope) && eq(slopeIntercept.b, yIntercept[1]) && onLine(slopeIntercept, xIntercept) && math.equal(xIntercept[1], 0)
      && eq(standard.m, slope) && eq(standard.b, slopeIntercept.b), `${label}: ${sibling.answer}`);
    // The representation it was given is that same line.
    const given = /^You are given (.+?)\. Find/.exec(sibling.prompt)[1];
    let givenLine = null;
    if ((match = /^the (?:standard form|slope-intercept) equation (.+)$/.exec(given))) givenLine = lineOf(match[1]);
    else if (/^(two points|the table)/.test(given)) givenLine = through(...pointsIn(given).slice(0, 2));
    if (givenLine) assert.ok(eq(givenLine.m, slope) && eq(givenLine.b, slopeIntercept.b), `${label}: ${given} is ${parts[3]}`);
    if (/^the table/.test(given)) assert.ok(pointsIn(given).every((point) => onLine(slopeIntercept, point)), `${label}: every row is on ${parts[3]}`);
    return;
  }
  const rows = pointsIn(sibling.prompt);
  if (kind === 'tableRepair') {
    const [, x, y] = /x = (-?[\d/]+) should have y = (-?[\d/]+)/.exec(sibling.answer);
    const good = rows.filter((row) => !eq(row[0], F(x)));
    const line = through(good[0], good[1]);
    assert.ok(good.every((row) => onLine(line, row)) && onLine(line, [F(x), F(y)]), `${label}: ${sibling.answer}`);
    assert.ok(rows.some((row) => eq(row[0], F(x)) && !eq(row[1], F(y))), `${label}: the named row really is broken`);
    return;
  }
  assert.ok(rows.length >= 3, `${label}: the sibling's table: ${sibling.prompt}`);
  const line = through(rows[0], rows[1]);
  assert.ok(rows.every((row) => onLine(line, row)), `${label}: the sibling's table is linear`);
  if (kind === 'tableRate') {
    assert.ok(eq(F(/: (-?[\d/]+)$/.exec(sibling.answer)[1]), line.m), `${label}: ${sibling.answer}`);
    return;
  }
  const parts = sibling.answer.split(';').map((part) => part.trim());
  const equation = lineOf(parts[0]);
  assert.ok(eq(equation.m, line.m) && eq(equation.b, line.b), `${label}: ${sibling.answer}`);
  if (kind === 'bridge') {
    const factored = lineOf(parts[1]);
    const [xIntercept] = pointsIn(parts[2]);
    assert.ok(eq(factored.m, line.m) && eq(factored.b, line.b) && onLine(line, xIntercept) && math.equal(xIntercept[1], 0), `${label}: ${sibling.answer}`);
  }
};

/* ------------------------------------------------------------ the sweep */

test('every swept item: hints, back-up and sibling are true, clean, and never state a hidden value (sign included)', () => {
  let siblings = 0;
  for (const item of sweep) {
    const { label, question, hidden } = item;
    assert.equal(linesAndSlope.matches(question), true, `${label}: matched`);
    const hints = linesAndSlope.hints(question);
    const backUp = linesAndSlope.backUpQuestion(question);
    assert.ok(hints.length >= 2, `${label}: hints`);
    assert.ok(backUp && backUp.options.includes(backUp.correct) && backUp.options[0] !== backUp.options[1], `${label}: back-up`);
    const told = [...hints, backUp.prompt, ...backUp.options];
    told.forEach((line) => assert.ok(!numbersIn(line).some((number) => hidden.some((value) => math.equal(number, value))),
      `${label}: "${line}" states one of ${hidden.map((value) => value.toFraction())}`));
    for (const seed of [0, 4]) {
      const sibling = linesAndSlope.similarProblem(question, { seed });
      if (!sibling) continue; // b = 0 or b = 1 can leave no candidate the guard accepts: the generic help is used
      siblings += 1;
      verifySibling(item, sibling);
      assert.ok(!numbersIn(sibling.answer).some((number) => hidden.some((value) => math.equal(number, value))), `${label}: sibling answer "${sibling.answer}"`);
      assert.equal(similarExampleIsSafe(question, sibling), true, `${label}: similarExampleIsSafe`);
      told.push(sibling.prompt, ...sibling.steps, sibling.answer);
    }
    told.forEach((line) => HYGIENE.forEach((pattern) => assert.doesNotMatch(line, pattern, `${label}: "${line}"`)));
  }
  assert.ok(siblings >= sweep.length * 2 * 0.9, `${siblings} siblings for ${sweep.length} items`);
});

/* ------------------------------------------------------------ the defects, one by one */

test('y = (x - 3) and y = -(x + 2): no number is "in front of the parentheses", and the hints say so', () => {
  for (const [a, c, slope] of [[1, 3, '1'], [-1, -2, '-1']]) {
    const question = { type: 'graphing2', mode: 'factoredLinear', prompt: 'Graph the line.', factored: { a, c } };
    const hints = linesAndSlope.hints(question);
    hints.forEach((hint) => assert.doesNotMatch(hint, /The number in front of the parentheses is the slope/, hint));
    assert.ok(hints.some((hint) => new RegExp(`slope is (${slope.replace('-', '\\-')}|${a === 1 ? 'one' : 'negative one'})`).test(hint)), hints.join(' | '));
  }
  // A worked sibling with a = ±1 says the same.
  const question = { type: 'graphing2', mode: 'factoredLinear', prompt: 'Graph the line.', factored: { a: 3, c: -2 } };
  const unit = [];
  for (let seed = 0; seed < 120 && unit.length < 2; seed += 1) {
    const sibling = linesAndSlope.similarProblem(question, { seed });
    if (/^Graph y = -?\(x/.test(sibling.prompt)) unit.push(sibling);
  }
  assert.ok(unit.length >= 1, 'a sibling with a = ±1 is drawn');
  unit.forEach((sibling) => sibling.steps.forEach((step) => assert.doesNotMatch(step, /The number in front of the parentheses, -?1,/, step)));
});

test('a standard form missing a variable is backed up on the coordinate that stays fixed', () => {
  for (const [A, B, C, correct] of [[0, 2, -6, 'The y-coordinate'], [3, 0, 6, 'The x-coordinate']]) {
    const question = { type: 'graphing2', mode: 'standardForm', prompt: 'Graph the line.', standard: { A, B, C } };
    const backUp = linesAndSlope.backUpQuestion(question);
    assert.doesNotMatch(backUp.options.join(' '), /intercept/, backUp.options.join(' | '));
    assert.equal(backUp.correct, correct);
    // The coordinate it names really is fixed on that line.
    const line = B === 0 ? { vertical: true, x: math.divide(F(C), F(A)) } : { m: F(0), b: math.divide(F(C), F(B)) };
    assert.equal(line.vertical ? 'The x-coordinate' : 'The y-coordinate', correct);
  }
});

test('a hidden negative value is guarded like a positive one, in hints and in siblings', () => {
  // y = (x - 3): its y-intercept, -3, is what the student finds.
  const factored = { type: 'graphing2', mode: 'factoredLinear', prompt: 'Graph the line.', factored: { a: 1, c: 3 } };
  linesAndSlope.hints(factored).forEach((hint) => assert.ok(!numbersIn(hint).some((number) => math.equal(number, -3)), hint));
  // Through (1, -4) and (3, -2): slope 1 is printed, the y-intercept -5 is not.
  const twoPoints = { type: 'graphing2', mode: 'throughPoints', prompt: 'Graph the line through the two points.', givenPoints: [[1, -4], [3, -2]] };
  assert.ok(eq(through([1, -4], [3, -2]).b, -5));
  for (let seed = 0; seed < 60; seed += 1) {
    const sibling = linesAndSlope.similarProblem(twoPoints, { seed });
    if (!sibling) continue;
    [sibling.prompt, ...sibling.steps, sibling.answer].forEach((line) => assert.ok(!numbersIn(line).some((number) => math.equal(number, -5)), `seed ${seed}: ${line}`));
  }
});
