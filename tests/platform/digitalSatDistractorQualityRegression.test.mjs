import test from 'node:test';
import assert from 'node:assert/strict';

import { compileDigitalSatProductionSeed } from '../../scripts/lib/digital-sat-production-seed.mjs';

const EXPECTED = Object.freeze({
  'mathmaster:sat:A.10A:missing-linear-coefficient': ['dSecondOnly', 'q'],
  'mathmaster:sat:A.10A:subtraction-constant-parameter': ['dRemovedOnly', 'f'],
  'mathmaster:sat:A.10A:ccmr-challenge-equivalent-sum-parameter': ['dSecondOnly', 'q'],
  'mathmaster:sat:A.10B:ccmr-challenge-three-factor-linear-coefficient': ['dSecondFactor', 'q'],
  // Replaced. With {p+q, p-q, p, q} the key was the largest in every draw
  // because all four constants were positive. Signing them and swapping one
  // single-constant option for the product spread the key across all four ranks.
  'mathmaster:sat:A.10E:missing-middle-coefficient': ['dProduct', 'p*q'],
  // Generalized: the leading coefficient was hard-coded as 25, so the "other
  // square" option was the literal 25. It is a drawn parameter now, and the
  // option is that parameter squared - the same misconception, and one that
  // moves against the key instead of sitting still.
  'mathmaster:sat:A.10F:missing-square-constant': ['dLeadingSquare', 'c*c'],
  'mathmaster:sat:A.10F:ccmr-challenge-leading-parameter-from-factors': ['dOtherSquare', 'n*n'],
  // Replaced. a+b, a-b, a and b are all one-sided when a and b are positive
  // coefficients of like radicals; doubling one coefficient is the option that
  // crosses the key, so it took the second coefficient's place.
  'mathmaster:sat:A.11A:ccmr-challenge-radical-coefficient-parameter': ['dDoubledFirst', '2*a'],
  // Replaced. The exponents are signed now, and multiplying them - the power
  // rule applied to a quotient - is the option whose side depends on both signs.
  'mathmaster:sat:A.11B:quotient-exponent-law': ['dProduct', 'a*b'],
  'mathmaster:sat:A.12B:ccmr-challenge-challenge-reciprocal-function-value': ['dConstantOnly', 'k'],
  // Replaced. r^2 alone always sat below F*r^2; squaring F instead of r is the
  // same "squared the wrong quantity" error, and it crosses the key on F vs r.
  'mathmaster:sat:A.12E:advanced:ccmr-challenge-inverse-square-parameter': ['dSquaredForce', 'F*F*r'],
  'mathmaster:sat:A.2B:ccmr-challenge-derived-feature-from-two-points': ['satDistractor3', 'b'],
  // Replaced, not weakened. The V2.1 certification sweep found this family's key
  // sitting at an extreme of the four: its three distractors all moved with the
  // sign of the step, so the key could only ever be the largest or the smallest.
  // The `q` option ("answered with the run") moved with them, so it gave way to
  // one that does not - the x-coordinate the question hands you - which is the
  // stronger "grabbed the wrong number" misconception anyway, because that value
  // is printed in the stem.
  'mathmaster:sat:A.2F:ccmr-challenge-perpendicular-rational-step-output': ['dGaveXCoordinate', 'x1+run'],
  'mathmaster:sat:A.2G:ccmr-challenge-horizontal-vertical-intersection': ['satDistractor3', 'h'],
  'mathmaster:sat:A.2I:ccmr-challenge-parameterized-common-solution': ['satDistractor3', 'c'],
  // Replaced, not weakened, for the same reason. With options {mp-mq, mp+mq, mp,
  // mq} the key was an extreme in 92% of draws. Answering with one input slope
  // was the option that had to go; `-mp-mq` is the classic sign error, computing
  // line p's slope as (y1-y2)/(x2-x1) and then subtracting.
  'mathmaster:sat:A.3A:ccmr-challenge-compare-representations': ['dSlopeSignError', '-mp-mq'],
  'mathmaster:sat:A.3F:ccmr-challenge-intersection-derived-sum': ['satDistractor3', 'q'],
  // Renamed, not weakened: still the coefficient gap offered in place of k.
  'mathmaster:sat:A.5B:ccmr-challenge-parameter': ['dCoefficientOnly', 'delta'],
  'mathmaster:sat:A.5C:ccmr-challenge-combined-value': ['satDistractor3', 'y'],
  'mathmaster:sat:A.8A:ccmr-challenge-challenge-one-solution-parameter': ['dFourTimes', '4*h*h'],
  'mathmaster:sat:A.9D:ccmr-challenge-shifted-center-value': ['dShiftOnly', 'k'],
  'mathmaster:sat:A2.4F:ccmr-challenge-context-square-root-model': ['satDistractor3', 'dval*dval'],
  'mathmaster:sat:A2.5D:ccmr-challenge-exponent-parameter-from-solution': ['satDistractor3', 'p'],
  'mathmaster:sat:A2.7F:ccmr-challenge-numerator-coefficient-parameter': ['satDistractor3', 'c'],
  'mathmaster:sat:A2.7G:ccmr-challenge-radical-quotient-variable': ['satDistractor2', 'xval*xval'],
  // The eight entries above were renamed in the V2.1 certification sweep, not
  // weakened: each still pins the same expression, now under a name that says
  // which misconception it encodes.
  // Renamed, not weakened: the sector-area challenge was rebuilt during the V2.1
  // certification sweep and its distractors now carry meaning-bearing names.
  // `dWhole` is 4*k*k, which is exactly the r*r this line used to pin - the whole
  // circle's area coefficient, the same misconception under a readable name.
  'mathmaster:sat:native:circles:ccmr-challenge-sector-area-coefficient': ['dWhole', '4*k*k'],
  // Renamed, not weakened. This family was rebuilt during the V2.1 certification
  // sweep. "Answered the margin" is still one of its options - it is now one arm
  // of a distractor that swings between the margin and the estimate, which is
  // what stops the key sitting at a fixed rank among the four.
  'mathmaster:sat:native:inferenceMarginOfError:lower-bound': ['dSwing', 'hi*estimate+(1-hi)*margin'],
  // Same rename. `dAdjacent` is 180-a-b, which is the 180-answer this line used to
  // pin, written out now that `answer` is a+b: the adjacent interior angle.
  'mathmaster:sat:native:linesAnglesTriangles:triangle-exterior-angle': ['dAdjacent', '180-a-b'],
});

// Two counting families deliberately offer one-past-the-answer. Both were
// renamed in the V2.1 sweep and both still evaluate to answer+1: `gap+2` where
// the answer is gap+1, and `span+2` where the count is span+1.
const KEEP = Object.freeze({
  'mathmaster:sat:A.3H:ccmr-challenge-integer-points-vertical-slice': ['dCountedBothEnds', 'gap+2'],
  'mathmaster:sat:A2.3F:ccmr-challenge-challenge-integer-count': ['dCountedBothEnds', 'span+2'],
});

const norm = (value) => String(value ?? '').replace(/\s+/g, '');

test('30 repaired Digital SAT families use intentional misconception distractors', async () => {
  const seed = await compileDigitalSatProductionSeed();
  const byFamily = new Map(seed.items.map((item) => [item.familyId, item]));

  assert.equal(Object.keys(EXPECTED).length, 28);
  assert.equal(Object.keys(KEEP).length, 2);

  for (const [familyId, [key, expression]] of Object.entries(EXPECTED)) {
    const item = byFamily.get(familyId);
    assert.ok(item, `${familyId}: missing`);
    assert.equal(norm(item?.generator?.derived?.[key]), norm(expression), `${familyId}: ${key}`);
  }

  for (const [familyId, [key, expression]] of Object.entries(KEEP)) {
    const item = byFamily.get(familyId);
    assert.ok(item, `${familyId}: missing`);
    assert.equal(norm(item?.generator?.derived?.[key]), norm(expression), `${familyId}: intentional off-by-one`);
  }
});
