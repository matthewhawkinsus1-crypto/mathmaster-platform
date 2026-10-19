import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spokenOperation } from '../../src/tools/shared/spokenMathValue.js';

// Live QA: after the -5 tile was placed on the left, that side kept role=button
// and announced "Place undefined 5 on both sides on the left side".
//
// Pass 3 (A11Y-3): the name now says the operation in words — "Place subtract
// 4 on the left side" — through spokenOperation, which says nothing for an
// operation it does not know.

test('an equation side is a named tap target only while an operation is armed', () => {
  const source = readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8');
  const box = source.slice(source.indexOf('const sideTapReady'), source.indexOf('onClick={(event) => tapPlacementOnSide(side, event)}'));
  assert.match(box, /const sideTapReady = tapPlacementArmed && Boolean\(armedTile\?\.operation\);/);
  assert.match(box, /role=\{sideTapReady \? 'button' : undefined\}/);
  assert.match(box, /tabIndex=\{sideTapReady \? 0 : undefined\}/);
  // The name exists only while armed, and describes the armed operation in words.
  assert.match(box, /aria-label=\{sideTapReady \? `Place \$\{spokenOperation\(armedTile\.operation, operandLabel\)\} on the \$\{side\} side` : undefined\}/);
  assert.doesNotMatch(box, /armedTile\?\.operation, operand/, 'never describe an operation that may be missing');
});

test('the operation is said in words, and never as "undefined"', () => {
  assert.equal(spokenOperation('subtract', '4'), 'subtract 4');
  assert.equal(spokenOperation('divide', '-3'), 'divide by negative 3');
  assert.equal(spokenOperation('multiply', '(1)/(2)'), 'multiply by 1 over 2');
  assert.equal(spokenOperation('add', '2*x'), 'add 2 times x');
  assert.equal(spokenOperation(undefined, '5'), '');
  assert.doesNotMatch(`Place ${spokenOperation(undefined, '5')} on the left side`, /undefined/);
});
