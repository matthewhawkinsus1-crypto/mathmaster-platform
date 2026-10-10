/*
 * JOB K AUDIT: THE "FRACTIONS" SUPPORT FAMILY
 * (src/platform/supports/families/fractions.js).
 *
 * Two defects found by recomputing every hint and worked sibling with
 * fraction.js / mathjs over generated drills and authored arithmetic:
 *
 *   1. A worked sibling could SHOW this question's answer unreduced. The drill
 *      1/3 + 1/2 (answer 5/6) was offered the sibling 1/8 + 10/12, and 3/8 + 3/8
 *      (answer 3/4) the sibling 9/12 + 9/12: an operand, or a step, worth the
 *      answer. The guard only reads spellings, so 10/12 passed beside 5/6.
 *   2. "Simplify 3/25." (already in lowest terms) got hints that start from a
 *      false premise: "Look for a number greater than one that divides both 3
 *      and 25", "Divide … by that same common factor". There is none.
 *
 * Every value here is computed with fraction.js, never with the family's helpers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import Fraction from 'fraction.js';
import { all, create } from 'mathjs';

import * as fractions from '../../src/platform/supports/families/fractions.js';
import { generateQuestion } from '../../src/problemGenerator.js';

const math = create(all);

// Every fraction a line writes, read by the test itself: \frac{p}{q}, -\frac{p}{q}, p/q.
const fractionsWritten = (line) => [...String(line).matchAll(/(-?)\\frac\{(\d+)\}\{(\d+)\}|(-?\d+)\/(\d+)(?!\d)/g)]
  .map((match) => (match[2] !== undefined
    ? new Fraction(Number(match[2]) * (match[1] ? -1 : 1), Number(match[3]))
    : new Fraction(Number(match[4]), Number(match[5]))));

const fr = (n, d) => (d === 1 ? String(n) : `${n < 0 ? '-' : ''}\\frac{${Math.abs(n)}}{${d}}`);

const ITEMS = [];
for (let index = 0; index < 160; index += 1) {
  const question = generateQuestion({ type: 'fraction', prompt: 'Add the fractions.' }, `k-audit|seat-${index}|${index % 7}|variant:0`);
  ITEMS.push({ label: `drill ${question.n1}/${question.d1} + ${question.n2}/${question.d2}`, question, value: new Fraction(question.n1, question.d1).add(question.n2, question.d2) });
}
[[1, 3, 1, 2], [3, 8, 3, 8], [1, 10, 4, 10], [3, 10, 1, 5], [2, 8, 5, 12]].forEach(([n1, d1, n2, d2]) => {
  ITEMS.push({ label: `sum ${n1}/${d1} + ${n2}/${d2}`, question: { type: 'fraction', prompt: 'Add.', n1, d1, n2, d2 }, value: new Fraction(n1, d1).add(n2, d2) });
});
[['-', [5, 6], [1, 4]], ['×', [2, 3], [3, 4]], ['÷', [3, 4], [3, 8]], ['-', [1, 4], [3, 4]]].forEach(([op, [a, b], [c, d]]) => {
  const value = { '-': () => new Fraction(a, b).sub(c, d), '×': () => new Fraction(a, b).mul(c, d), '÷': () => new Fraction(a, b).div(c, d) }[op]();
  const symbol = { '-': '-', '×': '\\times', '÷': '\\div' }[op];
  ITEMS.push({ label: `${a}/${b} ${op} ${c}/${d}`, question: { type: 'fraction', prompt: `Compute $${fr(a, b)} ${symbol} ${fr(c, d)}$.`, answer: value.toFraction() }, value });
});

test('a worked sibling never shows a fraction worth this question\'s answer, reduced or not, signed or not', () => {
  let siblings = 0;
  for (const { label, question, value } of ITEMS) {
    for (let seed = 0; seed < 4; seed += 1) {
      const sibling = fractions.similarProblem(question, { seed });
      if (!sibling) continue;
      siblings += 1;
      assert.ok(!new Fraction(sibling.answer).equals(value), `${label}: the sibling's answer differs`);
      for (const line of [sibling.prompt, ...sibling.steps]) {
        for (const shown of fractionsWritten(line)) {
          assert.ok(!shown.abs().equals(value.abs()), `${label} seed ${seed}: "${line}" shows ${shown.toFraction()}, worth the answer ${value.toFraction()}`);
        }
      }
    }
  }
  assert.ok(siblings >= ITEMS.length * 3, `siblings are still offered (${siblings})`);
});

test('a fraction already in lowest terms gets no hint that presumes a common factor', () => {
  const PRESUMES_FACTOR = /divides both|by that (?:same )?common factor/i;
  for (const [n, d] of [[3, 25], [-7, 12], [27, 4], [11, 26]]) {
    assert.equal(Number(math.gcd(Math.abs(n), d)), 1, `precondition: ${n}/${d} is in lowest terms`);
    const question = { type: 'fraction', prompt: `Simplify ${n}/${d}.`, answer: new Fraction(n, d).toFraction() };
    const hints = fractions.hints(question);
    assert.ok(hints.length, `Simplify ${n}/${d}: still helped`);
    hints.forEach((hint) => assert.doesNotMatch(hint, PRESUMES_FACTOR, `Simplify ${n}/${d}: "${hint}"`));
  }
  // Control: a reducible fraction keeps its specific simplify hints.
  const [n, d] = [6, 8];
  assert.ok(Number(math.gcd(n, d)) > 1);
  const hints = fractions.hints({ type: 'fraction', prompt: `Simplify ${n}/${d}.`, answer: new Fraction(n, d).toFraction() });
  assert.ok(hints.some((hint) => PRESUMES_FACTOR.test(hint)), 'Simplify 6/8 is still helped with its common factor');
});
