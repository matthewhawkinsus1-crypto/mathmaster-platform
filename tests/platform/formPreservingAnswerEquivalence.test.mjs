import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sameFormPreservingEquation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';

test('vertex-form machine key accepts the normal student spelling', () => {
  const bank = 'f(x)=2*(x-(4))^2+(-3)';
  const student = 'f(x)=2(x-4)^2-3';
  assert.equal(sameFormPreservingEquation(student, bank), true);
  assert.equal(sameValue(student, bank), true);
});

test('negative vertex parameter is normalized without changing vertex form', () => {
  const bank = 'f(x)=3*(x-(-2))^2+(-4)';
  const student = 'f(x)=3(x+2)^2-4';
  assert.equal(sameFormPreservingEquation(student, bank), true);
  assert.equal(sameValue(student, bank), true);
});

test('coefficient one may be omitted in the same vertex form', () => {
  assert.equal(
    sameValue('f(x)=(x-4)^2-3', 'f(x)=1*(x-(4))^2+(-3)'),
    true,
  );
});

test('form-preserving normalization does not turn vertex form into standard form', () => {
  assert.equal(
    sameFormPreservingEquation('f(x)=2(x-4)^2-3', 'f(x)=2x^2-16x+29'),
    false,
  );
  assert.equal(
    sameValue('f(x)=2(x-4)^2-3', 'f(x)=2x^2-16x+29'),
    false,
  );
});

test('form-preserving normalization does not turn numeric multiplication into concatenation', () => {
  assert.equal(
    sameFormPreservingEquation('y=2*3+x', 'y=23+x'),
    false,
  );
});

test('wrong vertex remains wrong', () => {
  assert.equal(
    sameValue('f(x)=2(x-5)^2-3', 'f(x)=2*(x-(4))^2+(-3)'),
    false,
  );
});
