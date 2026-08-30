import test from 'node:test';
import assert from 'node:assert/strict';

import { compileDigitalSatProductionSeed } from '../../scripts/lib/digital-sat-production-seed.mjs';

const EXPECTED = Object.freeze({
  'mathmaster:sat:A.10A:missing-linear-coefficient': ['satDistractor3', 'q'],
  'mathmaster:sat:A.10A:subtraction-constant-parameter': ['satDistractor3', 'f'],
  'mathmaster:sat:A.10A:ccmr-challenge-equivalent-sum-parameter': ['satDistractor3', 'q'],
  'mathmaster:sat:A.10B:ccmr-challenge-three-factor-linear-coefficient': ['satDistractor3', 'q'],
  'mathmaster:sat:A.10E:missing-middle-coefficient': ['satDistractor3', 'q'],
  'mathmaster:sat:A.10F:missing-square-constant': ['satDistractor3', '25'],
  'mathmaster:sat:A.10F:ccmr-challenge-leading-parameter-from-factors': ['satDistractor3', 'n*n'],
  'mathmaster:sat:A.11A:ccmr-challenge-radical-coefficient-parameter': ['satDistractor3', 'b'],
  'mathmaster:sat:A.11B:quotient-exponent-law': ['satDistractor3', 'b'],
  'mathmaster:sat:A.12B:ccmr-challenge-challenge-reciprocal-function-value': ['satDistractor3', 'k'],
  'mathmaster:sat:A.12E:advanced:ccmr-challenge-inverse-square-parameter': ['satDistractor2', 'r*r'],
  'mathmaster:sat:A.2B:ccmr-challenge-derived-feature-from-two-points': ['satDistractor3', 'b'],
  'mathmaster:sat:A.2F:ccmr-challenge-perpendicular-rational-step-output': ['satDistractor3', 'q'],
  'mathmaster:sat:A.2G:ccmr-challenge-horizontal-vertical-intersection': ['satDistractor3', 'h'],
  'mathmaster:sat:A.2I:ccmr-challenge-parameterized-common-solution': ['satDistractor3', 'c'],
  'mathmaster:sat:A.3A:ccmr-challenge-compare-representations': ['satDistractor3', 'mq'],
  'mathmaster:sat:A.3F:ccmr-challenge-intersection-derived-sum': ['satDistractor3', 'q'],
  'mathmaster:sat:A.5B:ccmr-challenge-parameter': ['satDistractor3', 'delta'],
  'mathmaster:sat:A.5C:ccmr-challenge-combined-value': ['satDistractor3', 'y'],
  'mathmaster:sat:A.8A:ccmr-challenge-challenge-one-solution-parameter': ['satDistractor3', '4*h*h'],
  'mathmaster:sat:A.9D:ccmr-challenge-shifted-center-value': ['satDistractor3', 'k'],
  'mathmaster:sat:A2.4F:ccmr-challenge-context-square-root-model': ['satDistractor3', 'dval*dval'],
  'mathmaster:sat:A2.5D:ccmr-challenge-exponent-parameter-from-solution': ['satDistractor3', 'p'],
  'mathmaster:sat:A2.7F:ccmr-challenge-numerator-coefficient-parameter': ['satDistractor3', 'c'],
  'mathmaster:sat:A2.7G:ccmr-challenge-radical-quotient-variable': ['satDistractor2', 'xval*xval'],
  // Renamed, not weakened: the sector-area challenge was rebuilt during the V2.1
  // certification sweep and its distractors now carry meaning-bearing names.
  // `dWhole` is 4*k*k, which is exactly the r*r this line used to pin - the whole
  // circle's area coefficient, the same misconception under a readable name.
  'mathmaster:sat:native:circles:ccmr-challenge-sector-area-coefficient': ['dWhole', '4*k*k'],
  'mathmaster:sat:native:inferenceMarginOfError:lower-bound': ['satDistractor3', 'margin'],
  // Same rename. `dAdjacent` is 180-a-b, which is the 180-answer this line used to
  // pin, written out now that `answer` is a+b: the adjacent interior angle.
  'mathmaster:sat:native:linesAnglesTriangles:triangle-exterior-angle': ['dAdjacent', '180-a-b'],
});

const KEEP = Object.freeze({
  'mathmaster:sat:A.3H:ccmr-challenge-integer-points-vertical-slice': ['satDistractor3', '(answer)+1'],
  'mathmaster:sat:A2.3F:ccmr-challenge-challenge-integer-count': ['satDistractor3', '(count)+1'],
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
