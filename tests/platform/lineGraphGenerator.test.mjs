import test from 'node:test';
import assert from 'node:assert/strict';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import {
  containsPoint,
  isHorizontal,
  isLatticePoint,
  isVertical,
  latticePointsInView,
  pointInView,
  sameLine,
  slopeOf,
  xInterceptOf,
  yInterceptOf,
} from '../../functions/shared/lineGraphMath.mjs';
import { LINE_FORM, POINT_SLOPE_LAYOUT, SPECIAL_FORM } from '../../functions/shared/lineGraphForms.mjs';
import { normalizeLineGraphConfig } from '../../functions/shared/lineGraphConfig.mjs';
import {
  KEY_POINT_INSET,
  LINE_GRAPH_GENERATOR_VERSION,
  LINE_SCHEDULE_BLOCK_SIZE,
  MAX_LINE_GENERATION_ATTEMPTS,
  generateLineQuestion,
  generateLineQuestionForSlot,
  lineBlockTemplate,
  lineViewForTier,
  listLineSlots,
  publicLineQuestion,
  scheduledLineSlot,
} from '../../functions/shared/lineGraphGenerator.mjs';
import { LINE_ANSWER_STYLE, LINE_GRAPH_FORMAT, LINE_ITEM_TYPE } from '../../functions/shared/lineGraphRules.mjs';
import { lineOfText } from './helpers/lineEquationOracle.mjs';

/*
 * EVERY GENERATED ITEM IS CHECKED BY A SECOND, INDEPENDENT METHOD.
 *
 * The generator builds an item's line exactly and writes its equation; these
 * tests trust neither. They read the equation a student sees with an oracle
 * that knows nothing of the forms module (helpers/lineEquationOracle.mjs),
 * and check the grid itself: the key points a method needs are placeable,
 * the points a reader needs are on grid intersections, and the four options
 * of a choice item hold exactly one right answer.
 */

const { GRAPH, NAME } = LINE_ITEM_TYPE;
const SEEDS_PER_SLOT = 40;

const SLOTS = listLineSlots();
const generateAll = (slot, config = { nameStyle: 'choice' }) => Array.from({ length: SEEDS_PER_SLOT }, (_, seed) => generateLineQuestionForSlot({
  slot,
  seedText: `generator-test|${slot.itemType}|${slot.form}|${slot.variant}|${slot.tier}|${seed}`,
  config,
}));

const ALL = SLOTS.flatMap((slot) => generateAll(slot).map((item) => ({ slot, item })));
const BUILT = SLOTS.filter((slot) => slot.itemType === NAME && slot.form !== SPECIAL_FORM)
  .flatMap((slot) => generateAll(slot, { nameStyle: 'build' }).map((item) => ({ slot, item })));

test('the catalog covers every item type, form and tier', () => {
  for (const itemType of [GRAPH, NAME]) {
    for (const form of [...Object.values(LINE_FORM), SPECIAL_FORM]) {
      for (const tier of ['easy', 'standard', 'challenge']) {
        assert.ok(SLOTS.some((slot) => slot.itemType === itemType && slot.form === form && slot.tier === tier), `${itemType}/${form}/${tier}`);
      }
    }
  }
});

test('every slot at every tier issues real items, quickly, and never needs a fallback', () => {
  let attempts = 0;
  for (const { slot, item } of ALL) {
    assert.equal(item.fallback, false, `${slot.itemType}/${slot.form}/${slot.variant}/${slot.tier}`);
    assert.ok(item.buildAttempts < MAX_LINE_GENERATION_ATTEMPTS / 3, `${slot.variant} needed ${item.buildAttempts} draws`);
    assert.equal(item.generatorVersion, LINE_GRAPH_GENERATOR_VERSION);
    attempts += item.buildAttempts;
  }
  assert.ok(attempts / ALL.length < 1.5, `mean ${attempts / ALL.length} draws per item`);
});

test('the equation a student reads describes the line that is graded', () => {
  for (const { slot, item } of [...ALL, ...BUILT]) {
    const written = item.itemType === GRAPH ? item.equation : item.answer;
    assert.ok(written?.text, `${slot.variant} writes its equation`);
    assert.ok(sameLine(lineOfText(written.text), item.line), `${written.text} (${slot.form}/${slot.variant}) is not its line`);
    assert.ok(sameLine(item.spec.line, item.line));
    if (item.itemType === GRAPH) assert.equal(item.answer, null);
    else assert.equal(item.equation, null, 'a Name-it item never shows its equation');
  }
});

test('a choice item has four distinct options and exactly one right answer', () => {
  for (const { slot, item } of ALL.filter(({ item: entry }) => entry.answerStyle === LINE_ANSWER_STYLE.CHOICE)) {
    assert.equal(item.choices.length, 4, slot.variant);
    assert.deepEqual(item.choices.map((choice) => choice.id), ['a', 'b', 'c', 'd']);
    const right = item.choices.filter((choice) => sameLine(choice.line, item.line));
    assert.equal(right.length, 1, `${slot.form}/${slot.variant} has one right option`);
    assert.equal(right[0].id, item.answerChoice);
    item.choices.forEach((choice, index) => {
      assert.ok(sameLine(lineOfText(choice.equation.text), choice.line), `option ${choice.equation.text} reads as its line`);
      item.choices.slice(index + 1).forEach((other) => assert.ok(!sameLine(choice.line, other.line), 'options are distinct lines'));
    });
  }
});

test('the right option is not always in the same place', () => {
  const positions = new Set(ALL.filter(({ item }) => item.answerChoice).map(({ item }) => item.answerChoice));
  assert.deepEqual([...positions].sort(), ['a', 'b', 'c', 'd']);
});

test('key points are placeable and the line can be read from the grid', () => {
  for (const { slot, item } of ALL) {
    const { line, view } = item;
    assert.deepEqual(view, lineViewForTier(slot.tier));
    assert.ok(!(line.c === 0 && (isHorizontal(line) || isVertical(line))), 'never an axis');
    const inside = latticePointsInView(line, view, { inset: KEY_POINT_INSET });
    assert.ok(inside.length >= (item.itemType === NAME ? 3 : 2), `${slot.variant}: ${inside.length} grid points`);
    for (const anchor of item.anchors) {
      assert.ok(isLatticePoint(anchor), 'a key point is a grid point');
      assert.ok(containsPoint(line, anchor), 'a key point is on the line');
      assert.ok(pointInView(anchor, view, { inset: KEY_POINT_INSET }), `${slot.variant}: key point (${anchor.x}, ${anchor.y}) is inside`);
    }
    assert.equal(item.reveal.points.length, 2);
    item.reveal.points.forEach((point) => assert.ok(containsPoint(line, point) && pointInView(point, view)));
  }
});

test('a Name-it answer is read from points that are on the grid', () => {
  for (const { slot, item } of ALL.filter(({ item: entry }) => entry.itemType === NAME)) {
    if (item.form === LINE_FORM.SLOPE_INTERCEPT) assert.equal(yInterceptOf(item.line).d, 1, `${slot.variant}: y-intercept on the grid`);
    if (item.form === LINE_FORM.STANDARD && item.line.c !== 0) {
      assert.equal(xInterceptOf(item.line).d, 1);
      assert.equal(yInterceptOf(item.line).d, 1);
    }
    if (item.form === LINE_FORM.POINT_SLOPE) {
      assert.ok(item.marked && containsPoint(item.line, item.marked) && isLatticePoint(item.marked));
      assert.ok(pointInView(item.marked, item.view, { inset: KEY_POINT_INSET }));
    }
  }
});

const ofVariant = (form, variant, tier = null) => ALL
  .filter(({ slot }) => slot.itemType === GRAPH && slot.form === form && slot.variant === variant && (!tier || slot.tier === tier))
  .map(({ item }) => item);

test('difficulty is in what the equation asks, not in bigger numbers', () => {
  for (const item of ALL.filter(({ slot }) => slot.tier === 'easy' && slot.form === LINE_FORM.SLOPE_INTERCEPT).map(({ item: entry }) => entry)) {
    assert.equal(slopeOf(item.line).d, 1, 'Easy slopes are whole numbers');
  }
  for (const item of ofVariant(LINE_FORM.POINT_SLOPE, 'positivePoint')) {
    assert.ok(item.spec.point.x > 0 && item.spec.point.y > 0);
  }
  for (const item of ofVariant(LINE_FORM.POINT_SLOPE, 'signedPoint')) {
    assert.ok(item.spec.point.x < 0 || item.spec.point.y < 0, 'a sign to flip');
    assert.match(item.equation.text, /\+/);
  }
  for (const item of ofVariant(LINE_FORM.SLOPE_INTERCEPT, 'fractionSlope')) assert.notEqual(slopeOf(item.line).d, 1);
  for (const item of ofVariant(LINE_FORM.SLOPE_INTERCEPT, 'decimalSlope')) assert.match(item.equation.text, /\d\.\d/);
  for (const item of ofVariant(LINE_FORM.SLOPE_INTERCEPT, 'constantFirst')) assert.match(item.equation.text, /^y = −?\d+ [+−] /);
  for (const item of ofVariant(LINE_FORM.SLOPE_INTERCEPT, 'fractionIntercept')) {
    assert.notEqual(yInterceptOf(item.line).d, 1, 'the y-intercept is between grid lines');
    assert.equal(item.anchors.length, 0, 'so it is no placeable key point');
  }
  for (const item of ofVariant(LINE_FORM.STANDARD, 'throughOrigin')) {
    assert.equal(item.line.c, 0);
    assert.deepEqual(item.anchors, [{ x: 0, y: 0 }]);
  }
  for (const item of ofVariant(LINE_FORM.STANDARD, 'fractionIntercept')) {
    assert.ok(xInterceptOf(item.line).d !== 1 || yInterceptOf(item.line).d !== 1);
  }
  for (const item of ofVariant(LINE_FORM.STANDARD, 'scaledCoefficients')) {
    const [A, B] = item.equation.text.match(/\d+/g).map(Number);
    assert.ok(A % 2 === 0 || A % 3 === 0, item.equation.text);
    assert.ok(Math.abs(A) > Math.abs(item.line.a) || Math.abs(B) > Math.abs(item.line.b), 'written unreduced');
  }
  for (const item of ofVariant(LINE_FORM.POINT_SLOPE, 'pointOnXAxis')) {
    assert.equal(item.spec.point.y, 0);
    assert.match(item.equation.text, /^y = /);
  }
  for (const item of ofVariant(LINE_FORM.POINT_SLOPE, 'solvedForY')) {
    assert.equal(item.spec.layout, POINT_SLOPE_LAYOUT.SOLVED_FOR_Y);
    assert.match(item.equation.text, /^y = .*\(x [+−] \d+\) [+−] \d+$/);
  }
  for (const item of ofVariant(LINE_FORM.POINT_SLOPE, 'negativeOne')) {
    assert.deepEqual(slopeOf(item.line), Q.rat(-1));
    assert.match(item.equation.text, /= −\(x/);
  }
  for (const item of ofVariant(SPECIAL_FORM, 'scaledVertical')) assert.match(item.equation.text, /^\dx = /);
});

test('a horizontal or vertical Name-it item is always answered by choosing', () => {
  const special = SLOTS.filter((slot) => slot.itemType === NAME && slot.form === SPECIAL_FORM);
  for (const slot of special) {
    for (const item of generateAll(slot, { nameStyle: 'build' })) {
      assert.equal(item.answerStyle, LINE_ANSWER_STYLE.CHOICE);
      assert.equal(item.build, null);
    }
  }
  for (const { item } of BUILT) {
    assert.equal(item.answerStyle, LINE_ANSWER_STYLE.BUILD);
    assert.equal(item.choices, null);
    assert.equal(item.build.form, item.form);
  }
});

/*
 * DETERMINISM. The server regenerates an item to grade it, so the same
 * inputs must give the same item forever. These are pinned: a change to the
 * generator or to seededRandom.mjs fails here, and must bump
 * LINE_GRAPH_GENERATOR_VERSION.
 */

const GOLDEN_CONFIG = Object.freeze({
  format: LINE_GRAPH_FORMAT.SPRINT,
  itemTypes: [NAME, GRAPH],
  forms: [LINE_FORM.SLOPE_INTERCEPT, LINE_FORM.STANDARD, LINE_FORM.POINT_SLOPE],
  specialLines: true,
  difficulty: 'mixed',
  nameStyle: 'choice',
  sameEquations: false,
  showMethod: false,
});

const GOLDEN = [
  [0, 'name', 'slopeIntercept', 'wholeSlope', 'easy', 'y = 3x + 4', 'c'],
  [1, 'graph', 'pointSlope', 'positivePoint', 'easy', 'y − 2 = 2(x − 2)', null],
  [2, 'graph', 'special', 'horizontal', 'standard', 'y = 6', null],
  [3, 'graph', 'standard', 'unitCoefficients', 'standard', 'x + y = −7', null],
  [4, 'name', 'pointSlope', 'wholeSlope', 'standard', 'y + 4 = −3(x − 5)', 'b'],
  [5, 'graph', 'standard', 'wholeIntercepts', 'easy', '3x + 2y = 6', null],
  [6, 'graph', 'pointSlope', 'fractionSlope', 'standard', 'y − 1 = −(4/3)(x − 5)', null],
  [7, 'name', 'slopeIntercept', 'fractionSlope', 'standard', 'y = −(5/3)x − 1', 'c'],
  [8, 'name', 'standard', 'wholeIntercepts', 'standard', 'x − y = 3', 'b'],
  [9, 'graph', 'special', 'scaledHorizontal', 'challenge', '3y = 12', null],
  [10, 'graph', 'standard', 'wholeIntercepts', 'challenge', 'x − 2y = −6', null],
  [11, 'graph', 'slopeIntercept', 'wholeSlope', 'standard', 'y = 3x + 5', null],
];

test('generated items are pinned: the same inputs give the same item', () => {
  for (const [k, itemType, form, variant, tier, text, answerChoice] of GOLDEN) {
    const item = generateLineQuestion({ seed: 'golden-seed', studentKey: 'student-a', roundIndex: 1, questionIndex: k, config: GOLDEN_CONFIG });
    assert.deepEqual(
      [k, item.itemType, item.form, item.variant, item.tier, (item.equation || item.answer).text, item.answerChoice],
      [k, itemType, form, variant, tier, text, answerChoice],
    );
    assert.deepEqual(item, generateLineQuestion({ seed: 'golden-seed', studentKey: 'student-a', roundIndex: 1, questionIndex: k, config: GOLDEN_CONFIG }));
  }
});

/*
 * THE SCHEDULE. Students share the mix, not the items.
 */

const sprintConfig = (overrides = {}) => normalizeLineGraphConfig({
  itemTypes: [GRAPH, NAME],
  forms: [LINE_FORM.SLOPE_INTERCEPT, LINE_FORM.STANDARD, LINE_FORM.POINT_SLOPE],
  specialLines: true,
  difficulty: 'mixed',
  ...overrides,
}, { format: overrides.format || LINE_GRAPH_FORMAT.SPRINT });

const slotKey = (slot) => `${slot.itemType}|${slot.form}|${slot.variant}|${slot.tier}`;

test('every block holds exactly two Name-it items, one horizontal or vertical line, and the forms dealt evenly', () => {
  const config = sprintConfig();
  for (let block = 0; block < 12; block += 1) {
    const template = lineBlockTemplate({ seed: 'schedule', scope: 'r0', blockIndex: block, config });
    assert.equal(template.length, LINE_SCHEDULE_BLOCK_SIZE);
    assert.equal(template.filter((slot) => slot.itemType === NAME).length, 2);
    assert.equal(template.filter((slot) => slot.form === SPECIAL_FORM).length, 1);
    const counts = [LINE_FORM.SLOPE_INTERCEPT, LINE_FORM.STANDARD, LINE_FORM.POINT_SLOPE]
      .map((form) => template.filter((slot) => slot.form === form).length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `forms ${counts}`);
  }
  const graphOnly = sprintConfig({ itemTypes: [GRAPH], specialLines: false, forms: [LINE_FORM.POINT_SLOPE] });
  const template = lineBlockTemplate({ seed: 'schedule', scope: 'r0', blockIndex: 0, config: graphOnly });
  assert.ok(template.every((slot) => slot.itemType === GRAPH && slot.form === LINE_FORM.POINT_SLOPE));
});

test('students face the same mix in each block, in their own order, with their own numbers', () => {
  const config = sprintConfig();
  const students = ['ana', 'ben', 'cy', 'dee', 'eli'];
  for (const block of [0, 1, 2]) {
    const mixes = students.map((studentKey) => Array.from({ length: LINE_SCHEDULE_BLOCK_SIZE }, (_, offset) => slotKey(scheduledLineSlot({
      seed: 'room', studentKey, roundIndex: 0, questionIndex: block * LINE_SCHEDULE_BLOCK_SIZE + offset, config,
    }))).sort().join());
    assert.equal(new Set(mixes).size, 1, `block ${block}: one mix`);
  }
  const first = (studentKey) => Array.from({ length: 12 }, (_, k) => generateLineQuestion({ seed: 'room', studentKey, roundIndex: 0, questionIndex: k, config }));
  const [ana, ben] = [first('ana'), first('ben')];
  assert.ok(ana.some((item, k) => !sameLine(item.line, ben[k].line)), 'neighbours see different lines');
});

test('with the same equations, every student gets the identical item', () => {
  const config = sprintConfig({ sameEquations: true });
  for (let k = 0; k < 14; k += 1) {
    const items = ['ana', 'ben', 'cy'].map((studentKey) => generateLineQuestion({ seed: 'room', studentKey, roundIndex: 2, questionIndex: k, config }));
    assert.deepEqual(items[1], items[0]);
    assert.deepEqual(items[2], items[0]);
  }
});

test('a Classic game schedules across rounds, one item a round, the same for everyone by default', () => {
  const config = normalizeLineGraphConfig({ presetId: 'allThreeForms' }, { format: LINE_GRAPH_FORMAT.CLASSIC });
  assert.equal(config.sameEquations, true);
  const rounds = Array.from({ length: 6 }, (_, roundIndex) => generateLineQuestion({ seed: 'classic-room', studentKey: 'ana', roundIndex, questionIndex: 0, config }));
  rounds.forEach((item) => assert.equal(item.questionIndex, 0));
  // Rounds 0–5 are one block: each of the three forms twice.
  const forms = rounds.map((item) => item.form).sort();
  assert.deepEqual(forms, [LINE_FORM.POINT_SLOPE, LINE_FORM.POINT_SLOPE, LINE_FORM.SLOPE_INTERCEPT, LINE_FORM.SLOPE_INTERCEPT, LINE_FORM.STANDARD, LINE_FORM.STANDARD]);
  // Everyone: the same item each round.
  rounds.forEach((item, roundIndex) => assert.deepEqual(
    generateLineQuestion({ seed: 'classic-room', studentKey: 'ben', roundIndex, questionIndex: 0, config }),
    item,
  ));
  // A teacher may give everyone their own equations: the same forms, other lines.
  const own = { ...config, sameEquations: false };
  const ownMix = (studentKey) => Array.from({ length: 6 }, (_, roundIndex) => scheduledLineSlot({ seed: 'classic-room', studentKey, roundIndex, questionIndex: 0, config: own }))
    .map(slotKey).sort().join();
  assert.equal(ownMix('ana'), ownMix('ben'));
});

test('two items in a row are never the same line asked the same way', () => {
  const config = sprintConfig({ difficulty: 'easy', forms: [LINE_FORM.SLOPE_INTERCEPT], itemTypes: [GRAPH], specialLines: false });
  for (const studentKey of ['ana', 'ben', 'cy']) {
    const items = Array.from({ length: 150 }, (_, k) => generateLineQuestion({ seed: 'repeat-room', studentKey, roundIndex: 0, questionIndex: k, config }));
    items.slice(1).forEach((item, index) => {
      const previous = items[index];
      if (previous.itemType === item.itemType && previous.form === item.form) {
        assert.ok(!sameLine(previous.line, item.line), `${studentKey} item ${index + 1} repeats ${item.equation.text}`);
      }
    });
  }
});

test('the device receives what it needs to check an answer at once', () => {
  for (const { item } of [...ALL.slice(0, 400), ...BUILT.slice(0, 100)]) {
    const shown = publicLineQuestion(item);
    for (const key of ['questionIndex', 'itemType', 'form', 'title', 'view', 'line', 'spec', 'anchors', 'answerStyle', 'reveal', 'targetCount']) {
      assert.notEqual(shown[key], undefined, key);
    }
    if (shown.itemType === GRAPH) assert.ok(shown.equation.tokens.length > 2);
    if (shown.answerStyle === LINE_ANSWER_STYLE.CHOICE) assert.ok(shown.choices.some((choice) => choice.id === shown.answerChoice));
    if (shown.answerStyle === LINE_ANSWER_STYLE.BUILD) assert.ok(shown.build.fields.length >= 2);
    assert.equal(shown.targetCount, 1);
    assert.equal(JSON.stringify(shown).includes('undefined'), false);
  }
  assert.equal(publicLineQuestion(null), null);
});
