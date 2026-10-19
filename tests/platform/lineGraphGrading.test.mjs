import test from 'node:test';
import assert from 'node:assert/strict';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import { latticePointsInView, lineFromPointSlope, slopeOf, yInterceptOf } from '../../functions/shared/lineGraphMath.mjs';
import { LINE_FORM, SPECIAL_FORM } from '../../functions/shared/lineGraphForms.mjs';
import { LINE_DIAGNOSIS } from '../../functions/shared/lineGraphFeedback.mjs';
import { generateLineQuestionForSlot, listLineSlots } from '../../functions/shared/lineGraphGenerator.mjs';
import {
  checkChoiceAnswer,
  checkEquationAnswer,
  checkLineAnswer,
  normalizeEquationFields,
  normalizeLinePoints,
} from '../../functions/shared/lineGraphGrading.mjs';
import { LINE_ANSWER_STYLE, LINE_ITEM_TYPE, LINE_LIMITS, LINE_VERDICT } from '../../functions/shared/lineGraphRules.mjs';

/*
 * AUTO-CHECK: THE VERDICT IN THE FRAME AFTER A POINT IS LET GO.
 *
 * Any two grid points of the right line are right; any other line is wrong
 * and says why; a gesture that is not two placeable points is no attempt at
 * all. The same answer drawn twice is one answer (its answerKey), so letting
 * go of a point where it already was is never a second miss.
 */

const { GRAPH, NAME } = LINE_ITEM_TYPE;

const itemsFor = (filter, config = { nameStyle: 'choice' }, seeds = 10) => listLineSlots()
  .filter(filter)
  .flatMap((slot) => Array.from({ length: seeds }, (_, seed) => generateLineQuestionForSlot({ slot, seedText: `grading|${slot.variant}|${slot.tier}|${seed}`, config })));

const GRAPH_ITEMS = itemsFor((slot) => slot.itemType === GRAPH);
const CHOICE_ITEMS = itemsFor((slot) => slot.itemType === NAME);
const BUILD_ITEMS = itemsFor((slot) => slot.itemType === NAME && slot.form !== SPECIAL_FORM, { nameStyle: 'build' });

test('any two grid points of the right line are right, and are one answer', () => {
  let pairs = 0;
  for (const item of GRAPH_ITEMS) {
    const points = latticePointsInView(item.line, item.view);
    const keys = new Set();
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 2) {
        const verdict = checkLineAnswer({ question: item, points: [points[i], points[j]] });
        assert.equal(verdict.verdict, LINE_VERDICT.CORRECT, item.equation.text);
        keys.add(verdict.answerKey);
        pairs += 1;
      }
    }
    assert.equal(keys.size, 1);
  }
  assert.ok(pairs > 5_000, `${pairs} right lines checked`);
});

test('a wrong line is wrong, says why, and is the same answer through any of its points', () => {
  for (const item of GRAPH_ITEMS) {
    const [p] = latticePointsInView(item.line, item.view, { inset: 1 });
    // Pivot the right line about one of its points: a different line.
    const q = { x: p.x + 1, y: p.y + 1 };
    const r = { x: p.x + 2, y: p.y + 2 };
    const first = checkLineAnswer({ question: item, points: [p, q] });
    if (first.verdict === LINE_VERDICT.CORRECT) continue; // the line was y = x + k
    assert.equal(first.verdict, LINE_VERDICT.INCORRECT);
    assert.ok(first.message && first.diagnosis, 'a wrong line gets a hint');
    if (r.x <= item.view.xMax && r.y <= item.view.yMax) {
      assert.equal(checkLineAnswer({ question: item, points: [q, r] }).answerKey, first.answerKey, 'same line, same answer');
    }
  }
});

test('the classic mistakes are diagnosed from the two points a student placed', () => {
  const slot = { itemType: GRAPH, form: LINE_FORM.SLOPE_INTERCEPT, variant: 'wholeSlope', tier: 'easy' };
  const item = generateLineQuestionForSlot({ slot, seedText: 'diagnosed', config: {} });
  const m = slopeOf(item.line);
  const b = yInterceptOf(item.line);
  // The slope's sign flipped, through the right y-intercept — one run either
  // way, whichever stays on the grid.
  const step = [1, -1].find((dx) => Math.abs(b.n - dx * m.n) <= item.view.yMax);
  const flipped = checkLineAnswer({ question: item, points: [{ x: 0, y: b.n }, { x: step, y: b.n - step * m.n }] });
  assert.equal(flipped.diagnosis, LINE_DIAGNOSIS.SLOPE_SIGN, item.equation.text);
  assert.equal(flipped.misconception, 'slope-sign-reversed');
  assert.match(flipped.message, /sign of the slope/);
});

test('a gesture that is not two placeable points is no attempt', () => {
  const [item] = GRAPH_ITEMS;
  const { xMax } = item.view;
  const invalid = [
    undefined,
    [],
    [{ x: 0, y: 0 }],
    [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    [{ x: 0, y: 0 }, { x: 0.5, y: 1 }],
    [{ x: 0, y: 0 }, { x: '1', y: 'two' }],
    [{ x: 0, y: 0 }, { x: xMax + 1, y: 0 }],
    [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }],
  ];
  for (const points of invalid) {
    assert.equal(checkLineAnswer({ question: item, points }).verdict, LINE_VERDICT.INVALID, JSON.stringify(points));
  }
  assert.deepEqual(normalizeLinePoints([{ x: '2', y: -0 }, { x: 3, y: 1 }], item.view), [{ x: 2, y: 0 }, { x: 3, y: 1 }]);
  assert.equal(checkLineAnswer({ question: CHOICE_ITEMS[0], points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }).verdict, LINE_VERDICT.INVALID);
});

test('show your method: the right line counts only through every key point', () => {
  let checked = 0;
  for (const item of GRAPH_ITEMS) {
    const points = latticePointsInView(item.line, item.view);
    const anchors = item.anchors;
    const other = points.filter((point) => !anchors.some((anchor) => anchor.x === point.x && anchor.y === point.y));
    if (!anchors.length) {
      // Nothing placeable to require (y = ½x + 3/2): any two points count.
      assert.equal(checkLineAnswer({ question: item, points: points.slice(0, 2), showMethod: true }).verdict, LINE_VERDICT.CORRECT);
      continue;
    }
    const through = anchors.length === 2 ? anchors : [anchors[0], other[0]];
    assert.equal(checkLineAnswer({ question: item, points: through, showMethod: true }).verdict, LINE_VERDICT.CORRECT, item.equation.text);
    assert.equal(checkLineAnswer({ question: item, points: [...through].reverse(), showMethod: true }).verdict, LINE_VERDICT.CORRECT);
    if (other.length >= 2) {
      const elsewhere = checkLineAnswer({ question: item, points: [other[0], other[1]], showMethod: true });
      assert.equal(elsewhere.verdict, LINE_VERDICT.METHOD, item.equation.text);
      assert.match(elsewhere.message, /^Right line!/);
      // Without the requirement the same line is simply right.
      assert.equal(checkLineAnswer({ question: item, points: [other[0], other[1]] }).verdict, LINE_VERDICT.CORRECT);
      checked += 1;
    }
  }
  assert.ok(checked > 200);
});

test('a tapped option: the answer is right, every other option is a diagnosed mistake', () => {
  for (const item of CHOICE_ITEMS) {
    assert.equal(item.answerStyle, LINE_ANSWER_STYLE.CHOICE);
    for (const choice of item.choices) {
      const verdict = checkChoiceAnswer({ question: item, choiceId: choice.id });
      if (choice.id === item.answerChoice) {
        assert.equal(verdict.verdict, LINE_VERDICT.CORRECT);
      } else {
        assert.equal(verdict.verdict, LINE_VERDICT.INCORRECT);
        assert.equal(verdict.answerKey, `choice:${choice.id}`);
        assert.ok(verdict.message.length > 10);
      }
    }
    assert.equal(checkChoiceAnswer({ question: item, choiceId: 'e' }).verdict, LINE_VERDICT.INVALID);
  }
  assert.equal(checkChoiceAnswer({ question: GRAPH_ITEMS[0], choiceId: 'a' }).verdict, LINE_VERDICT.INVALID);
});

const fieldsFor = (item) => {
  const m = slopeOf(item.line);
  if (item.form === LINE_FORM.SLOPE_INTERCEPT) return { m: Q.format(m), b: Q.format(yInterceptOf(item.line)) };
  if (item.form === LINE_FORM.POINT_SLOPE) return { x1: String(item.marked.x), y1: String(item.marked.y), m: Q.format(m) };
  return { A: String(item.line.a), B: String(item.line.b), C: String(item.line.c) };
};

test('a built equation is right whenever it is the line, however it was written', () => {
  for (const item of BUILD_ITEMS) {
    assert.equal(checkEquationAnswer({ question: item, fields: fieldsFor(item) }).verdict, LINE_VERDICT.CORRECT, item.answer.text);
    if (item.form === LINE_FORM.POINT_SLOPE) {
      // Any point of the line will do, not only the marked one.
      for (const point of latticePointsInView(item.line, item.view).slice(0, 4)) {
        const fields = { x1: String(point.x), y1: String(point.y), m: Q.format(slopeOf(item.line)) };
        assert.equal(checkEquationAnswer({ question: item, fields }).verdict, LINE_VERDICT.CORRECT);
      }
    }
    if (item.form === LINE_FORM.STANDARD) {
      // Any whole-number multiple: 4x + 6y = 12 is 2x + 3y = 6.
      const fields = { A: String(-2 * item.line.a), B: String(-2 * item.line.b), C: String(-2 * item.line.c) };
      assert.equal(checkEquationAnswer({ question: item, fields }).verdict, LINE_VERDICT.CORRECT);
    }
  }
});

test('a decimal is the fraction it equals; a wrong box is a diagnosed mistake', () => {
  const slot = { itemType: NAME, form: LINE_FORM.SLOPE_INTERCEPT, variant: 'fractionSlope', tier: 'standard' };
  const halves = Array.from({ length: 60 }, (_, seed) => generateLineQuestionForSlot({ slot, seedText: `halves|${seed}`, config: { nameStyle: 'build' } }))
    .find((item) => slopeOf(item.line).d === 2);
  const m = slopeOf(halves.line);
  const b = yInterceptOf(halves.line);
  const decimal = String(m.n / m.d);
  assert.equal(checkEquationAnswer({ question: halves, fields: { m: decimal, b: String(b.n) } }).verdict, LINE_VERDICT.CORRECT);

  const flipped = checkEquationAnswer({ question: halves, fields: { m: Q.format(Q.neg(m)), b: String(b.n) } });
  assert.equal(flipped.verdict, LINE_VERDICT.INCORRECT);
  assert.equal(flipped.diagnosis, LINE_DIAGNOSIS.SLOPE_SIGN);
  assert.match(flipped.message, /rise or fall/, 'Name-it words, not graphing words');

  const swapped = checkEquationAnswer({ question: halves, fields: { m: Q.format(Q.div(m.d, m.n)), b: String(b.n) } });
  assert.equal(swapped.diagnosis, LINE_DIAGNOSIS.SLOPE_RECIPROCAL);
});

test('boxes that do not yet spell an equation are neither credit nor a miss', () => {
  const standard = BUILD_ITEMS.find((item) => item.form === LINE_FORM.STANDARD);
  const half = checkEquationAnswer({ question: standard, fields: { A: '1/2', B: '1', C: '3' } });
  assert.equal(half.verdict, LINE_VERDICT.FORM);
  assert.match(half.message, /whole numbers/);
  const empty = checkEquationAnswer({ question: standard, fields: { A: '2', B: '', C: '6' } });
  assert.equal(empty.verdict, LINE_VERDICT.FORM);
  assert.equal(empty.field, 'B');
  assert.equal(checkEquationAnswer({ question: standard, fields: { A: '0', B: '0', C: '6' } }).verdict, LINE_VERDICT.FORM);
  assert.equal(checkEquationAnswer({ question: CHOICE_ITEMS[0], fields: {} }).verdict, LINE_VERDICT.INVALID);
});

test('only the form\'s own boxes are read, each bounded', () => {
  const typed = normalizeEquationFields(LINE_FORM.POINT_SLOPE, { x1: ' 3 ', y1: '-2', m: '1'.repeat(40), extra: 'ignored' });
  assert.deepEqual(Object.keys(typed).sort(), ['m', 'x1', 'y1']);
  assert.equal(typed.x1, '3');
  assert.equal(typed.m.length, LINE_LIMITS.fieldLength);
  assert.equal(checkEquationAnswer({
    question: BUILD_ITEMS.find((item) => item.form === LINE_FORM.POINT_SLOPE),
    fields: { x1: '1', y1: '1', m: '1'.repeat(40) },
  }).verdict, LINE_VERDICT.FORM, 'an over-long box is not a number');
});

test('a sign error in point-slope form is caught from the boxes as well as from a graph', () => {
  const item = BUILD_ITEMS.find((entry) => entry.form === LINE_FORM.POINT_SLOPE && entry.marked.x !== 0 && entry.marked.y !== 0);
  const m = Q.format(slopeOf(item.line));
  const both = checkEquationAnswer({ question: item, fields: { x1: String(-item.marked.x), y1: String(-item.marked.y), m } });
  assert.equal(both.verdict, LINE_VERDICT.INCORRECT);
  // Flipping both signs of a point is a reflection through the origin, so it
  // is diagnosed whichever point of the line the student started from.
  const expected = lineFromPointSlope({ x: -item.marked.x, y: -item.marked.y }, slopeOf(item.line));
  assert.ok(expected);
  assert.ok([LINE_DIAGNOSIS.POINT_SIGN, LINE_DIAGNOSIS.RIGHT_SLOPE].includes(both.diagnosis), both.diagnosis);
});
