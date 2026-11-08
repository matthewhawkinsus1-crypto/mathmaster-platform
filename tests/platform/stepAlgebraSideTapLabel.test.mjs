import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spokenOperation } from '../../src/tools/shared/spokenMathValue.js';
import { placementSideName } from '../../src/algebraOperationPlacement.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// Live QA: after the -5 tile was placed on the left, that side kept role=button
// and announced "Place undefined 5 on both sides on the left side".
//
// Pass 3 (A11Y-3): the name now says the operation in words — "Place subtract
// 4 on the left side" — through spokenOperation, which says nothing for an
// operation it does not know.
//
// student-a11y-3: the name is built by placementSideName, which also says the
// place on the side once the arrow keys have chosen one; and a side answers a
// click only while it is that named Tab stop, so at rest it offers no
// pointer-only action (the Tab walk counted the resting click handler).

// The side box's own opening tag, from the line that decides it is a target.
const sideBox = () => {
  const source = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));
  return region(source, 'const sideTapReady', 'style={{ gridColumn: index === 0 ? 1 : 3, gridRow: 1 }}', 'the side box');
};

test('an equation side is a named tap target only while an operation is armed', () => {
  const box = sideBox();
  assert.match(box, /const sideTapReady = tapPlacementArmed && Boolean\(armedTile\?\.operation\);/);
  // Each thing that makes it a control is there only while armed: the role, the
  // Tab stop, the name, the click, the keys. At rest it is plain mathematics.
  for (const prop of ['role', 'tabIndex', 'aria-label', 'onClick', 'onKeyDown']) {
    assert.match(box, new RegExp(`\\b${prop}=\\{sideTapReady \\? `), `${prop} only while an operation is in hand`);
  }
  // The name describes the armed operation in words, through the one name builder.
  assert.match(box, /aria-label=\{sideTapReady \? placementSideName\(\{ operationWords: spokenOperation\(armedTile\.operation, operandLabel\), side, place: chosenPlace \}\) : undefined\}/);
  assert.doesNotMatch(box, /armedTile\?\.operation, operand\b/, 'never describe an operation that may be missing');
});

test('the side\'s name says the operation in words, and the place once the arrow keys chose one', () => {
  const operationWords = spokenOperation('subtract', '4');
  // The name a side has always had: browser drivers and voice control find it by its end.
  assert.equal(placementSideName({ operationWords, side: 'left' }), 'Place subtract 4 on the left side');
  assert.equal(placementSideName({ operationWords, side: 'right', place: 'under 4' }), 'Place subtract 4 under 4 on the right side');
  for (const side of ['left', 'right']) {
    // The visible label is "left side" / "right side": the name keeps it (WCAG 2.5.3).
    assert.ok(placementSideName({ operationWords, side, place: 'before 2 x' }).endsWith(`on the ${side} side`));
  }
  assert.doesNotMatch(placementSideName({ operationWords: spokenOperation(undefined, '5'), side: 'left' }), /undefined/);
});

test('the operation is said in words, and never as "undefined"', () => {
  assert.equal(spokenOperation('subtract', '4'), 'subtract 4');
  assert.equal(spokenOperation('divide', '-3'), 'divide by negative 3');
  assert.equal(spokenOperation('multiply', '(1)/(2)'), 'multiply by 1 over 2');
  assert.equal(spokenOperation('add', '2*x'), 'add 2 times x');
  assert.equal(spokenOperation(undefined, '5'), '');
  assert.doesNotMatch(`Place ${spokenOperation(undefined, '5')} on the left side`, /undefined/);
});
