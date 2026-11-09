// WHERE ON A SIDE, FROM THE KEYBOARD (student-a11y-3).
//
// A pointer chooses where on a side of the balance the operation it places goes:
// a term before, under or after one of the side's terms, a factor in front of the
// whole side or after it, a divisor under it. Enter on a focused side could only
// put it where a tap that says nothing does. The arrow keys on a focused side now
// step through the places a pointer can choose (src/algebraOperationPlacement.js),
// and Enter with no arrow pressed still places exactly as it did.
//
// The places are checked against what the equation becomes, through the engine
// both routes share (applyAdditiveOperationAtPlacement), so "the keyboard reaches
// every place" means every equation a pointer can write, not a list of words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  keyboardPlacementSlots, keyboardPlacementStart, moveKeyboardPlacement,
} from '../../src/algebraOperationPlacement.js';
import { semanticPlacementFromTap } from '../../src/platform/mobile/mobileInteractionFoundation.js';
import { applyAdditiveOperationAtPlacement, applyBalancedOperation, splitAdditiveTerms } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const SIDES = ['2*x + 7', '7 - 2*x + 3*x^2', '-9*x + 21', 'x / 2 - 5', '21'];

// What a pointer can choose on an added or subtracted term's side: before, under
// or after any term, or the end (StepByStepAlgebraCore resolveAdditivePlacementFromPoint).
const pointerPlacements = (terms) => [
  ...terms.flatMap((_, termIndex) => ['before', 'under', 'after'].map((kind) => ({ kind, termIndex }))),
  { kind: 'end', termIndex: Math.max(0, terms.length - 1) },
];

test('the arrow keys reach every equation a pointer can write on a side, and nothing else', () => {
  for (const expression of SIDES) {
    const terms = splitAdditiveTerms(expression);
    for (const operation of ['add', 'subtract']) {
      const written = (position) => applyAdditiveOperationAtPlacement(expression, operation, '7', position);
      const byPointer = new Set(pointerPlacements(terms).map(written));
      const slots = keyboardPlacementSlots({ operation, terms });
      const byKeyboard = new Set(slots.map((slot) => written(slot.position)));
      assert.deepEqual([...byKeyboard].sort(), [...byPointer].sort(), `${operation} 7 on ${expression}`);
      // Each place is one a pointer can choose, so the cue it draws is one the side already draws.
      for (const slot of slots) {
        assert.ok(['before', 'under', 'after', 'end'].includes(slot.position.kind), JSON.stringify(slot));
        assert.ok(slot.position.termIndex >= 0 && slot.position.termIndex < terms.length, JSON.stringify(slot));
      }
      // Before the first term, under each term, after each but the last, and the end: in reading order.
      assert.equal(slots.length, 2 * terms.length + 1, expression);
      assert.equal(slots[0].position.kind, 'before');
      assert.equal(slots.at(-1).position.kind, 'end');
    }
  }
});

test('Enter with no arrow pressed places as a keyboard always did', () => {
  for (const expression of SIDES) {
    const terms = splitAdditiveTerms(expression);
    const slots = keyboardPlacementSlots({ operation: 'subtract', terms });
    // A keyboard event has no point, and the pointer's resolver gives a term the side's end for it.
    assert.deepEqual(slots[keyboardPlacementStart(slots)].position, { kind: 'end', termIndex: terms.length - 1 }, expression);
  }
  for (const operation of ['multiply', 'divide']) {
    const slots = keyboardPlacementSlots({ operation });
    // What semanticPlacementFromTap gives a press with no point: a factor in front, a divisor under.
    assert.equal(slots[keyboardPlacementStart(slots)].position, semanticPlacementFromTap({ operation }), operation);
  }
  // A side the engine cannot split into terms has the one place it always had.
  assert.deepEqual(keyboardPlacementSlots({ operation: 'add', terms: null }).map((slot) => slot.position), [{ kind: 'end', termIndex: 0 }]);
});

test('a factor goes in front of the whole side or after it, and a divisor under it, as a tap chooses', () => {
  const tap = (operation, clientX) => semanticPlacementFromTap({ operation, clientX, expressionRect: { left: 0, width: 100 } });
  const multiply = keyboardPlacementSlots({ operation: 'multiply' }).map((slot) => slot.position);
  // The tap's halves: the left half is in front ('before', which the keyboard's 'side' draws), the right half after.
  assert.deepEqual([tap('multiply', 10), tap('multiply', 90)], ['before', 'after']);
  assert.deepEqual(multiply, ['side', 'after']);
  // Where the factor is drawn does not change the move: the engine writes the same equation for each.
  const equation = { left: '2 * x', right: '10', variable: 'x' };
  const written = multiply.map((position) => applyBalancedOperation({ equationState: equation, operation: 'multiply', operand: '3', placementBySide: { left: position, right: position } }).unsimplified);
  assert.deepEqual(written[0], written[1]);
  assert.deepEqual(keyboardPlacementSlots({ operation: 'divide' }).map((slot) => slot.position), [tap('divide', 10)]);
});

test('Left and Right step through the places in reading order; Home and End jump; nothing wraps', () => {
  const count = 5;
  assert.equal(moveKeyboardPlacement({ key: 'ArrowLeft', index: 4, count }), 3);
  assert.equal(moveKeyboardPlacement({ key: 'ArrowRight', index: 3, count }), 4);
  assert.equal(moveKeyboardPlacement({ key: 'ArrowRight', index: 4, count }), 4, 'the end stays the end');
  assert.equal(moveKeyboardPlacement({ key: 'ArrowLeft', index: 0, count }), 0, 'the first stays the first');
  assert.equal(moveKeyboardPlacement({ key: 'Home', index: 3, count }), 0);
  assert.equal(moveKeyboardPlacement({ key: 'End', index: 1, count }), 4);
  // Up and Down scroll the page; Enter, Space and Tab are not moves.
  for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab', 'a']) assert.equal(moveKeyboardPlacement({ key, index: 2, count }), null, key);
  assert.equal(moveKeyboardPlacement({ key: 'ArrowLeft', index: 0, count: 0 }), null, 'no places, no move');
});

test('each place is said in words a student would use, from the term the screen shows', () => {
  const words = (expression) => keyboardPlacementSlots({ operation: 'add', terms: splitAdditiveTerms(expression) }).map((slot) => slot.words);
  assert.deepEqual(words('2 x - 7'), ['before 2 x', 'under 2 x', 'after 2 x', 'under minus 7', 'at the end']);
  assert.deepEqual(words('-9 x + 21'), ['before negative 9 x', 'under negative 9 x', 'after negative 9 x', 'under 21', 'at the end']);
  assert.deepEqual(words('7 - 3 x^2').slice(3, 4), ['under minus 3 x squared'], 'a power is read as one');
  assert.deepEqual(keyboardPlacementSlots({ operation: 'multiply' }).map((slot) => slot.words), ['in front of the whole side', 'after the whole side']);
  assert.deepEqual(keyboardPlacementSlots({ operation: 'divide' }).map((slot) => slot.words), ['under the whole side']);
  for (const expression of SIDES) {
    for (const said of words(expression)) assert.doesNotMatch(said, /undefined|\*|\^|\bNaN\b/, `${expression}: ${said}`);
  }
});

test('the side takes the arrow keys only while it can take the operation, and Enter places where they chose', () => {
  const core = executableSource(readFileSync(new URL('../../src/StepByStepAlgebraCore.jsx', import.meta.url), 'utf8'));
  const keys = region(core, 'const placementSlotsFor = (side) =>', 'const suggestedMove = getSuggestedMove(equation);', 'the keyboard placement');
  // The places come from the side on screen and the operation in hand.
  assert.match(keys, /keyboardPlacementSlots\(\{\s*operation: armedTile\?\.operation,\s*terms: splitAdditiveTerms\(sideExpression\(side\)\) \|\| \[\],\s*\}\)/);
  // Enter or Space stages the operation at the chosen place, or where it always went.
  assert.match(keys, /const index = keyboardSlotIndex\(side, slots\);/);
  assert.match(keys, /keyboardSlot\?\.side === side \? keyboardSlot\.index : keyboardPlacementStart\(slots\)/);
  assert.match(keys, /stagePlacement\(side, slots\[index\]\?\.position\);/);
  // An arrow moves the place and draws it with the pointer's own hover cue.
  assert.match(keys, /const next = moveKeyboardPlacement\(\{ key: event\.key, index, count: slots\.length \}\);/);
  assert.match(keys, /setKeyboardSlot\(\{ side, index: next \}\);\s*showPlacementCue\(side, slots\[next\]\);/);
  assert.match(keys, /setDragOverSide\(side\);\s*setFactorZoneHint\(\{ side, position: slot\.position \}\);/);
  // A side that has the operation already keeps its place.
  assert.match(keys, /placedOperationSidesRef\.current\.includes\(side\)\) return;/);
  // Keyboard focus shows the place; a click places at once without it; leaving the side takes the cue away.
  const box = region(core, 'const sideTapReady', 'style={{ gridColumn: index === 0 ? 1 : 3, gridRow: 1 }}', 'the side box');
  assert.match(box, /onFocus=\{sideTapReady \? \(event\) => \{\s*if \(event\.currentTarget\.matches\?\.\(':focus-visible'\)\) showPlacementCue\(/);
  assert.match(box, /onBlur=\{sideTapReady \? \(\) => leavePlacementSide\(side\) : undefined\}/);
  // A screen reader is told the arrow keys choose the place, where there is a choice.
  assert.match(box, /aria-describedby=\{sideTapReady && placementSlots\.length > 1 \? `\$\{placementHintId\}-\$\{side\}` : undefined\}/);
  assert.match(core, /<span id=\{`\$\{placementHintId\}-\$\{side\}`\} style=\{SR_ONLY_STYLE\}>The left and right arrow keys choose where on this side it goes\.<\/span>/);
});
