import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { normalizeExponentialSpec } from '../../functions/shared/toolMath/exponentialLog/exponentialLogMath.mjs';
import { evaluateGraphFunction } from '../../functions/shared/toolMath/graphWorkspace/functionGraphUtils.mjs';
import { buildExponentialLogBridgeReview } from '../../src/tools/shared/reviews/exponentialLogBridgeReview.js';

/*
 * JOB P, ITEM 7 — one meaning for `b` in an exponential.
 *
 * The call: `b` is the BASE when `base` is not written, f(x) = a·b^(x − h) + k.
 * Survey (Job P handoff): every exponential prompt in the banks writes a·b^x
 * (the Algebra I graphWorkspace item keyed {type: 'exponential', a: 1, b: 2}
 * draws y = 2^x), the graph engine has always read b as the base, and K's
 * compiler fix reads a typeless bridge function's b as the base. Only the
 * bridge's own grader and its review disagreed: the grader graded base 2 and
 * the review refused to describe the function.
 *
 * Stored questions are graded as stored, so this is pinned on a stored
 * question (no compiler in between).
 */
// f(x) = 3·5^(x − 1) + 4; with no y the composition asks for f(f⁻¹(f(2))) = f(2) = 19.
const stored = { toolId: 'exponentialLogBridge', type: 'exponentialLogBridge', mode: 'composition', function: { type: 'exponential', a: 3, b: 5, h: 1, k: 4 }, x: 1 };

test('the bridge grader reads b as the base when base is not written', () => {
  assert.equal(normalizeExponentialSpec({ a: 3, b: 5 }).base, 5);
  assert.equal(normalizeExponentialSpec({ a: 3, b: 5, base: 2 }).base, 2, 'an explicit base wins');
  assert.equal(normalizeExponentialSpec({ a: 3 }).base, 2, 'the default is unchanged');
  const graded = (forwardAfterInverse) => gradeToolWork({ toolId: 'exponentialLogBridge', question: stored, work: { inverseAfterForward: '1', forwardAfterInverse } });
  assert.equal(graded('19').isCorrect, true);
  // Base 2 gave f(2) = 3·2 + 4 = 10, graded right before.
  assert.equal(graded('10').isCorrect, false);
  assert.equal(graded('20').isCorrect, false);
});

test('the grader, the graph engine and the review agree on the function', () => {
  for (const x of [-1, 0, 2.5]) {
    const engine = evaluateGraphFunction({ type: 'exponential', a: 3, b: 5, h: 1, k: 4 }, x);
    assert.ok(Math.abs(engine - (3 * 5 ** (x - 1) + 4)) < 1e-9);
  }
  const review = buildExponentialLogBridgeReview(stored);
  assert.ok(review, 'the review describes the function it used to refuse');
  const text = JSON.stringify(review);
  assert.match(text, /5\^/);
  assert.doesNotMatch(text, /2\^\{/);
});
