import test from 'node:test';
import assert from 'node:assert/strict';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import {
  horizontalLine,
  lineFromCoefficients,
  lineFromPointSlope,
  lineFromSlopeIntercept,
  lineKey,
  lineThroughPoints,
  verticalLine,
} from '../../functions/shared/lineGraphMath.mjs';
import { LINE_FORM, POINT_SLOPE_LAYOUT, SPECIAL_FORM } from '../../functions/shared/lineGraphForms.mjs';
import {
  DIAGNOSIS_MISCONCEPTION,
  LINE_DIAGNOSIS,
  diagnoseLine,
  diagnosisMessage,
  isSpecificDiagnosis,
  methodMessage,
  mistakeLinesFor,
} from '../../functions/shared/lineGraphFeedback.mjs';
import { LINE_ITEM_TYPE } from '../../functions/shared/lineGraphRules.mjs';
import { isMisconceptionCode } from '../../functions/shared/misconceptionCodes.mjs';
import { generateLineQuestionForSlot, listLineSlots } from '../../functions/shared/lineGraphGenerator.mjs';
import { createRng } from '../../functions/shared/seededRandom.mjs';

/*
 * A HINT IS SPECIFIC ONLY WHEN IT IS TRUE.
 *
 * The rule under test: a wrong line earns a specific hint exactly when it is
 * the line of ONE modelled mistake for that equation. When two mistakes draw
 * the same line, the hint falls back to what is true of the line itself.
 */

const { GRAPH, NAME } = LINE_ITEM_TYPE;
const D = LINE_DIAGNOSIS;

const si = (m, b) => ({ form: LINE_FORM.SLOPE_INTERCEPT, line: lineFromSlopeIntercept(m, b) });
const ps = (x, y, m, layout = POINT_SLOPE_LAYOUT.POINT_SLOPE) => ({
  form: LINE_FORM.POINT_SLOPE,
  line: lineFromPointSlope({ x, y }, m),
  point: { x, y },
  layout,
});
const std = (A, B, C) => ({ form: LINE_FORM.STANDARD, line: lineFromCoefficients(A, B, C) });
const special = (line) => ({ form: SPECIAL_FORM, line });

const code = (spec, studentLine, itemType = GRAPH) => diagnoseLine({ spec, studentLine, itemType }).code;
const through = (p, q) => lineThroughPoints(p, q);

test('slope-intercept: each classic graphing mistake is named, and only that one', () => {
  const spec = si(2, 3);
  assert.equal(code(spec, lineFromSlopeIntercept(2, 3)), D.CORRECT);
  assert.equal(code(spec, lineFromSlopeIntercept(-2, 3)), D.SLOPE_SIGN);
  assert.equal(code(spec, lineFromSlopeIntercept(Q.rat(1, 2), 3)), D.SLOPE_RECIPROCAL);
  assert.equal(code(spec, lineFromSlopeIntercept(2, -3)), D.INTERCEPT_SIGN);
  assert.equal(code(spec, lineFromPointSlope({ x: 3, y: 0 }, 2)), D.INTERCEPT_ON_X_AXIS);
  assert.equal(code(spec, lineFromSlopeIntercept(3, 2)), D.SLOPE_INTERCEPT_SWAPPED);
  // Not a modelled mistake, but true of the line: right slope, wrong place.
  assert.equal(code(spec, lineFromSlopeIntercept(2, 1)), D.RIGHT_SLOPE);
  // Through the right y-intercept with an unmodelled slope.
  assert.equal(code(spec, lineFromSlopeIntercept(5, 3)), D.RIGHT_ANCHOR);
  assert.equal(code(spec, lineFromSlopeIntercept(-1, -7)), D.OFF_TRACK);
});

test('naming a graph goes wrong differently: reading the x-intercept as b', () => {
  const spec = si(2, -4); // crosses the x-axis at 2
  assert.equal(code(spec, lineFromSlopeIntercept(2, 2), NAME), D.X_INTERCEPT_AS_B);
  // The graphing mistake "b on the x-axis" is not modelled for naming.
  assert.equal(code(spec, lineFromPointSlope({ x: -4, y: 0 }, 2), NAME), D.RIGHT_SLOPE);
  assert.equal(code(spec, lineFromPointSlope({ x: -4, y: 0 }, 2), GRAPH), D.INTERCEPT_ON_X_AXIS);
});

test('point-slope: the sign traps of y + 3 = −2(x − 4) are told apart', () => {
  const spec = ps(4, -3, -2);
  assert.equal(code(spec, lineFromPointSlope({ x: -4, y: 3 }, -2)), D.POINT_SIGN);
  assert.equal(code(spec, lineFromPointSlope({ x: -4, y: -3 }, -2)), D.POINT_SIGN_X);
  assert.equal(code(spec, lineFromPointSlope({ x: 4, y: 3 }, -2)), D.POINT_SIGN_Y);
  assert.equal(code(spec, lineFromPointSlope({ x: -3, y: 4 }, -2)), D.POINT_SWAPPED);
  assert.equal(code(spec, lineFromPointSlope({ x: 4, y: -3 }, 2)), D.SLOPE_SIGN);
  assert.equal(code(spec, lineFromPointSlope({ x: 4, y: -3 }, Q.rat(-1, 2))), D.SLOPE_RECIPROCAL);
  assert.equal(code(spec, lineFromPointSlope({ x: 4, y: -3 }, 5)), D.RIGHT_ANCHOR);

  const message = diagnosisMessage(diagnoseLine({ spec, studentLine: lineFromPointSlope({ x: -4, y: -3 }, -2) }));
  assert.equal(message, 'Check the sign: (x − 4) means x = 4.');
  const both = diagnosisMessage(diagnoseLine({ spec, studentLine: lineFromPointSlope({ x: -4, y: 3 }, -2) }));
  assert.equal(both, 'Check both signs: (x − 4) means x = 4, and (y + 3) means y = −3.');
});

test('when two mistakes draw the same line, neither is claimed', () => {
  // y − 2 = (x − 1): flipping both signs gives the line through (−1, −2);
  // swapping the coordinates gives the line through (2, 1). With slope 1 those
  // are the same line, y = x − 1, so the work does not say which happened.
  const spec = ps(1, 2, 1);
  const ambiguous = lineFromSlopeIntercept(1, -1);
  const found = mistakeLinesFor({ spec }).filter((entry) => lineKey(entry.line) === lineKey(ambiguous)).map((entry) => entry.code).sort();
  assert.deepEqual(found, [D.POINT_SIGN, D.POINT_SWAPPED].sort());
  const diagnosis = diagnoseLine({ spec, studentLine: ambiguous });
  assert.equal(diagnosis.specific, false);
  assert.equal(diagnosis.code, D.RIGHT_SLOPE);
  assert.equal(diagnosis.misconception, null);

  // y + 2 = 2(x − 1): flipping only x, or only y, both give y = 2x.
  const other = ps(1, -2, 2);
  assert.equal(code(other, lineFromSlopeIntercept(2, 0)), D.RIGHT_SLOPE);
});

test('standard form: intercept mistakes, read the way students graph it', () => {
  const spec = std(2, 3, 6); // (3, 0) and (0, 2)
  assert.equal(code(spec, through({ x: -3, y: 0 }, { x: 0, y: 2 })), D.X_INTERCEPT_SIGN);
  assert.equal(code(spec, through({ x: 3, y: 0 }, { x: 0, y: -2 })), D.Y_INTERCEPT_SIGN);
  assert.equal(code(spec, through({ x: -3, y: 0 }, { x: 0, y: -2 })), D.INTERCEPT_SIGNS);
  assert.equal(code(spec, through({ x: 2, y: 0 }, { x: 0, y: 3 })), D.INTERCEPTS_SWAPPED);
  assert.equal(code(spec, through({ x: 3, y: 0 }, { x: 0, y: 5 })), D.RIGHT_ANCHOR);
  assert.equal(code(spec, lineFromCoefficients(2, 3, 12)), D.RIGHT_SLOPE);

  // Through the origin the intercepts are no help: the slope's sign and
  // fraction are what slip.
  const origin = std(3, -2, 0); // slope 3/2
  assert.equal(code(origin, lineFromSlopeIntercept(Q.rat(-3, 2), 0)), D.SLOPE_SIGN);
  assert.equal(code(origin, lineFromSlopeIntercept(Q.rat(2, 3), 0)), D.SLOPE_RECIPROCAL);
  assert.match(diagnosisMessage(diagnoseLine({ spec: origin, studentLine: lineFromSlopeIntercept(4, 1) })), /origin/);
});

test('horizontal and vertical lines: the confusion between them is named', () => {
  const flat = special(horizontalLine(3));
  assert.equal(code(flat, verticalLine(3)), D.HORIZONTAL_VERTICAL);
  assert.equal(code(flat, horizontalLine(-3)), D.SPECIAL_SIGN);
  assert.equal(code(flat, horizontalLine(5)), D.OFF_TRACK);
  assert.equal(diagnosisMessage(diagnoseLine({ spec: flat, studentLine: verticalLine(3) })), 'y = 3 is horizontal: every point on it has y = 3.');

  const upright = special(verticalLine(-2));
  assert.equal(code(upright, horizontalLine(-2)), D.HORIZONTAL_VERTICAL);
  assert.equal(code(upright, verticalLine(2)), D.SPECIAL_SIGN);
  assert.match(diagnosisMessage(diagnoseLine({ spec: upright, studentLine: lineFromSlopeIntercept(1, 1) })), /x = −2/);
});

test('the method message names the form\'s key points', () => {
  assert.match(methodMessage(si(2, 3)), /y-intercept/);
  assert.match(methodMessage(ps(1, 2, 3)), /point in the equation/);
  assert.match(methodMessage(std(2, 3, 6)), /both intercepts/);
  assert.match(methodMessage(std(3, -2, 0)), /origin/);
});

test('every misconception a diagnosis maps to is a registered platform code', () => {
  for (const [diagnosis, misconception] of Object.entries(DIAGNOSIS_MISCONCEPTION)) {
    assert.ok(isSpecificDiagnosis(diagnosis), `${diagnosis} is a specific diagnosis`);
    assert.ok(isMisconceptionCode(misconception), `${misconception} is registered`);
  }
});

/*
 * OVER EVERY GENERATED ITEM: every modelled mistake is diagnosed as itself
 * when it is the only explanation for its line, never specifically when it
 * is not, and every wrong line — modelled or random — gets a sentence.
 */

const SEEDS = 12;
const items = listLineSlots().flatMap((slot) => Array.from({ length: SEEDS }, (_, seed) => generateLineQuestionForSlot({
  slot,
  seedText: `feedback|${slot.itemType}|${slot.form}|${slot.variant}|${slot.tier}|${seed}`,
  config: { nameStyle: 'choice' },
})));

const assertSentence = (message, context) => {
  assert.equal(typeof message, 'string', context);
  assert.ok(message.length >= 12 && message.length <= 130, `${context}: "${message}"`);
  assert.doesNotMatch(message, /undefined|null|NaN|\[object/, context);
};

test('every modelled mistake of every item is named when, and only when, it is unambiguous', () => {
  let specific = 0;
  let ambiguous = 0;
  for (const item of items) {
    const mistakes = mistakeLinesFor({ spec: item.spec, itemType: item.itemType });
    const byLine = new Map();
    mistakes.forEach((entry) => byLine.set(lineKey(entry.line), [...(byLine.get(lineKey(entry.line)) || []), entry.code]));
    for (const entry of mistakes) {
      const diagnosis = diagnoseLine({ spec: item.spec, studentLine: entry.line, itemType: item.itemType });
      const explanations = byLine.get(lineKey(entry.line));
      if (explanations.length === 1) {
        specific += 1;
        assert.equal(diagnosis.code, entry.code, `${item.equation?.text ?? item.answer?.text}: ${entry.code}`);
        assert.equal(diagnosis.specific, true);
      } else {
        ambiguous += 1;
        assert.equal(diagnosis.specific, false);
        assert.ok(!isSpecificDiagnosis(diagnosis.code));
      }
      assertSentence(diagnosisMessage(diagnosis), `${item.form}/${item.variant} ${entry.code}`);
    }
  }
  assert.ok(specific > 1_000, `checked ${specific} named mistakes`);
  assert.ok(ambiguous >= 0);
});

test('random wrong lines always get a sentence, and generic sentences never quote a number', () => {
  const rng = createRng('feedback-random-lines');
  for (const item of items) {
    for (let trial = 0; trial < 6; trial += 1) {
      const p = { x: rng.int(-9, 9), y: rng.int(-9, 9) };
      const q = { x: rng.int(-9, 9), y: rng.int(-9, 9) };
      const studentLine = lineThroughPoints(p, q);
      if (!studentLine) continue;
      const diagnosis = diagnoseLine({ spec: item.spec, studentLine, itemType: item.itemType });
      // A random line is occasionally the answer; that is not a hint.
      if (diagnosis.code === D.CORRECT) continue;
      const message = diagnosisMessage(diagnosis);
      assertSentence(message, `${item.form}/${item.variant}`);
      // A hint names what to check, never the answer: outside point-slope
      // (whose point IS the prompt) and x = h / y = k (whose number is the
      // whole equation), no sentence carries a number — apart from "x = 0"
      // and "y = 0", which say what an intercept is.
      if (![LINE_FORM.POINT_SLOPE, SPECIAL_FORM].includes(item.form)) {
        assert.doesNotMatch(message.replace(/[xy] = 0/g, ''), /\d/, `${item.form}/${item.variant}: "${message}"`);
      }
    }
  }
});
