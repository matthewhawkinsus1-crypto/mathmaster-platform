import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sameFormPreservingExpression,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';

test('implicit coefficient times sqrt is accepted against generator spelling', () => {
  assert.equal(sameFormPreservingExpression('8sqrt(x)', '8*sqrt(x)'), true);
  assert.equal(sameValue('8sqrt(x)', '8*sqrt(x)'), true);
});

test('MathLive radical notation is accepted against generator sqrt notation', () => {
  assert.equal(sameValue('8\\sqrt{x}', '8*sqrt(x)'), true);
  assert.equal(sameValue('11\\sqrt{x}', '11*sqrt(x)'), true);
});

test('unicode minus with radical coefficient remains equivalent', () => {
  assert.equal(sameValue('−4sqrt(x)', '-4*sqrt(x)'), true);
});

test('wrong radical coefficient remains wrong', () => {
  assert.equal(sameValue('7sqrt(x)', '8*sqrt(x)'), false);
});

test('wrong radicand remains wrong', () => {
  assert.equal(sameValue('8sqrt(y)', '8*sqrt(x)'), false);
});

test('radical normalization does not expand or alter a different form', () => {
  assert.equal(
    sameFormPreservingExpression('8sqrt(x)', 'sqrt(64*x)'),
    false,
  );
});

test('explicit multiplication before a MathLive LaTeX radical is cosmetic', () => {
  assert.equal(sameValue('8\\sqrt{x}', '8*\\sqrt{x}'), true);
  assert.equal(sameValue('12\\sqrt{x}', '12*sqrt(x)'), true);
});

test('a changed radicand remains incorrect even in LaTeX form', () => {
  assert.equal(sameValue('8\\sqrt{y}', '8*sqrt(x)'), false);
});

