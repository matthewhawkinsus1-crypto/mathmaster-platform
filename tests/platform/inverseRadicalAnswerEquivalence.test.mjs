import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sameFormPreservingEquation,
  sameValue,
} from '../../functions/shared/answerEquivalence.mjs';

const equivalentCases = [
  ['f^-1(x)=sqrt(x-(1))+1',  'f^{-1}(x)=sqrt(x-1)+1'],
  ['f^-1(x)=sqrt(x-(-5))+5','f^{-1}(x)=sqrt(x+5)+5'],
  ['f^-1(x)=sqrt(x-(0))+2', 'f^{-1}(x)=sqrt(x-0)+2'],
  ['f^-1(x)=sqrt(x-(-3))-1','f^{-1}(x)=sqrt(x+3)-1'],
  ['f^-1(x)=sqrt(x-(5))+0', 'f^{-1}(x)=sqrt(x-5)+0'],
  ['f^-1(x)=sqrt(x-(-1))-5','f^{-1}(x)=sqrt(x+1)-5'],
  ['f^-1(x)=sqrt(x-(3))-4', 'f^{-1}(x)=sqrt(x-3)-4'],
];

test('generated inverse-square-root keys accept natural student spellings', () => {
  for (const [bank, student] of equivalentCases) {
    assert.equal(
      sameFormPreservingEquation(student, bank),
      true,
      `${student} should preserve the same written inverse-radical form as ${bank}`,
    );
    assert.equal(
      sameValue(student, bank),
      true,
      `${student} should grade correct against ${bank}`,
    );
  }
});

test('MathLive LaTeX square-root notation also grades correctly', () => {
  assert.equal(
    sameValue('f^{-1}(x)=\\sqrt{x+5}+5', 'f^-1(x)=sqrt(x-(-5))+5'),
    true,
  );
  assert.equal(
    sameValue('f^{-1}(x)=\\sqrt{x-3}-4', 'f^-1(x)=sqrt(x-(3))-4'),
    true,
  );
});

test('wrong inverse radical remains wrong', () => {
  assert.equal(
    sameValue('f^{-1}(x)=sqrt(x+4)+5', 'f^-1(x)=sqrt(x-(-5))+5'),
    false,
  );
  assert.equal(
    sameValue('f^{-1}(x)=sqrt(x+5)+4', 'f^-1(x)=sqrt(x-(-5))+5'),
    false,
  );
});

test('opposite sign in the radicand remains wrong', () => {
  assert.equal(
    sameValue('f^{-1}(x)=sqrt(x-5)+5', 'f^-1(x)=sqrt(x-(-5))+5'),
    false,
  );
});
