import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findLikeTermGroups,
  monomialSignature,
  replacementIsSingleLikeTerm,
  replaceSelectedLikeTerms,
  replaceSingleAdditiveTerm,
  selectedLikeTermInfo,
} from '../../src/algebraLikeTermsModel.js';
import { expressionsEquivalent } from '../../src/algebraAstEngine.js';

test('detects linear variable and constant like-term groups without naming the answer', () => {
  const groups = findLikeTermGroups('2*x - 4*x + 12 + 3');
  assert.deepEqual(groups, [
    { key: 'x^1', indices: [0, 1] },
    { key: 'constant', indices: [2, 3] },
  ]);
});

test('keeps unlike variable parts separate', () => {
  assert.equal(monomialSignature('2*x'), 'x^1');
  assert.equal(monomialSignature('3*y'), 'y^1');
  const selection = selectedLikeTermInfo('2*x + 3*y + 4', [0, 1]);
  assert.equal(selection.valid, false);
});

test('supports higher powers and exact rational coefficients', () => {
  assert.equal(monomialSignature('2*x^2'), 'x^2');
  assert.equal(monomialSignature('x/2'), 'x^1');
  const groups = findLikeTermGroups('2*x^2 + 3*x^2 + x/2 + 3*x/2');
  assert.deepEqual(groups, [
    { key: 'x^2', indices: [0, 1] },
    { key: 'x^1', indices: [2, 3] },
  ]);
});

test('requires the replacement to be one term with the same variable part', () => {
  assert.equal(replacementIsSingleLikeTerm('-2*x', 'x^1'), true);
  assert.equal(replacementIsSingleLikeTerm('2*x + 3*x', 'x^1'), false);
  assert.equal(replacementIsSingleLikeTerm('5*y', 'x^1'), false);
});

test('replaces only the student-selected terms and preserves the rest of the side', () => {
  const before = '2*x - 4*x + 12';
  const info = selectedLikeTermInfo(before, [0, 1]);
  assert.equal(info.valid, true);
  assert.equal(expressionsEquivalent(info.selectedExpression, '-2*x', 'x'), true);
  const after = replaceSelectedLikeTerms(before, info.indices, '-2*x');
  assert.ok(after);
  assert.equal(expressionsEquivalent(after, '-2*x + 12', 'x'), true);
});


test('replaces one student-selected additive term without changing its neighbors', () => {
  const before = '3*(-3) + 3*(2*y) + 5*y';
  const after = replaceSingleAdditiveTerm(before, 0, '-9');
  assert.ok(after);
  assert.equal(expressionsEquivalent(after, '-9 + 3*(2*y) + 5*y', 'y'), true);

  const next = replaceSingleAdditiveTerm(after, 1, '6*y');
  assert.ok(next);
  assert.equal(expressionsEquivalent(next, '-9 + 6*y + 5*y', 'y'), true);
});

test('single-term replacement refuses a multi-term rewrite', () => {
  assert.equal(replaceSingleAdditiveTerm('3*(-3) + 5*y', 0, '-9 + y'), null);
});
