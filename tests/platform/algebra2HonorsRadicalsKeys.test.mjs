import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The answer keys of the Algebra II Honors radicals lessons, recomputed. The
// lesson test (algebra2HonorsRadicalsLessons) holds each file to its builder;
// this one holds the mathematics. Two keys shipped wrong (PR #537 review):
// L3 CW 6 keyed 168^(8/5) as 3638 (it is 3634.92, so the right 3635 was
// refused), and L1 PR 1 called b·x^h the positive square root of b²x^(2h) for
// odd h, where a negative x makes it the negative one.

const lesson = (file) => JSON.parse(readFileSync(new URL(`../../teacher-import-jsons/algebra2-honors-radicals/${file}`, import.meta.url), 'utf8'));
const find = (node, questionId) => {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = find(item, questionId);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (node.questionId === questionId) return node;
  for (const value of Object.values(node)) {
    const found = find(value, questionId);
    if (found) return found;
  }
  return null;
};

test('L3 CW 6: each weightlifting key is the number the formula gives', () => {
  const item = find(lesson('L3_Rational_Exponents.json'), 'a2r3-cw-6');
  const key = (id) => item.responses.find((response) => response.id === id);
  const power = 168 ** (8 / 5);
  assert.equal(key('power').answer, String(Math.round(power)), `168^(8/5) = ${power}`);
  assert.equal(key('quotient').answer, (146230 / power).toFixed(1));
  assert.equal(key('mass').answer, String(Math.round(512 - 146230 / power)));
  const light = 512 - 146230 / 80 ** (8 / 5);
  assert.equal(key('cyp').answer, `${Math.round(light / 20) * 20} kg`, `M for 80 kg is ${light}`);
  // The worked steps state the same numbers.
  const steps = item.solutionReview.reasoning.join(' ');
  assert.match(steps, new RegExp(`168\\^\\(8/5\\) ≈ ${power.toFixed(1)}`));
  assert.match(steps, new RegExp(`80\\^\\(8/5\\) ≈ ${(80 ** (8 / 5)).toFixed(1)}`));
  assert.match(steps, new RegExp(`≈ ${(146230 / 80 ** (8 / 5)).toFixed(1)}, so M ≈ 380 kg`));
});

test('L1 PR 1: the "positive square root" key is never negative, for any version', () => {
  const item = find(lesson('L1_nth_Roots.json'), 'a2r1-p-1');
  assert.deepEqual(item.responses.map((response) => [response.label, response.answer]), [
    ['Positive square root', '{{b}}x^{{h}}'],
    ['Negative square root', '-{{b}}x^{{h}}'],
  ]);
  // b·x^h is nonnegative for every real x only when h is even, as the lesson
  // teaches ("every even power is already nonnegative, so it needs no bars").
  const { parameters, derived } = item.generator;
  const values = (name) => {
    if (parameters[name]) {
      const { min, max } = parameters[name];
      return Array.from({ length: max - min + 1 }, (_, index) => min + index);
    }
    const [factor, variable] = derived[name].split('*');
    return values(variable).map((value) => Number(factor) * value);
  };
  const exponents = values('h');
  assert.ok(exponents.length > 0);
  for (const h of exponents) {
    assert.equal(h % 2, 0, `x^${h} is negative for a negative x`);
    for (const x of [-3, -1, 2]) assert.ok(x ** h >= 0);
  }
  // The radicand's exponent stays twice the root's.
  assert.deepEqual(values('e'), exponents.map((h) => 2 * h));
});
