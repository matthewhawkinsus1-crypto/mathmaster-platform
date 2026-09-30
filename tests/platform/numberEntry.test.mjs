/*
 * A NEGATIVE FRACTION CAN BE TYPED ON A PHONE.
 *
 * Student UX pass, R-6. Inside a question a phone swaps every decimal box for
 * MathMaster's keypad, which had ± but no fraction bar, so a slope or rate of
 * −2/3 — graded exactly, and not equal to 0.667 within 1e-6 — could not be
 * entered on Linear Table Workbench, the representation bridge, the sequence
 * explorer or a table question at all. And ± on an empty box produced "0",
 * so "±, 3" became "03".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FRACTION_ENTRY_PROPS,
  acceptsFractionEntry,
  applyNumberKey,
} from '../../src/platform/interaction/numberEntry.js';
import { parseNumericAnswer } from '../../src/tools/shared/toolMath.js';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const typeKeys = (keys, options) => keys.reduce((text, key) => applyNumberKey(text, key, options), '');

test('a phone student can type −2/3, and it parses to exactly −2/3', () => {
  const typed = typeKeys(['±', '2', '/', '3'], { fraction: true });
  assert.equal(typed, '-2/3');
  assert.equal(parseNumericAnswer(typed), -2 / 3);
});

test('± starts a negative instead of writing a zero', () => {
  assert.equal(typeKeys(['±', '3']), '-3');
  assert.equal(typeKeys(['3', '±']), '-3');
  assert.equal(typeKeys(['3', '±', '±']), '3');
  // A type="number" box cannot hold a lone "-": ± waits for a digit there.
  assert.equal(typeKeys(['±'], { bareMinus: false }), '');
  assert.equal(typeKeys(['±', '4', '±'], { bareMinus: false }), '-4');
});

test('one fraction bar, after a numerator, and only where fractions are accepted', () => {
  assert.equal(typeKeys(['/'], { fraction: true }), '', 'no bar before a numerator');
  assert.equal(typeKeys(['1', '/', '/', '2'], { fraction: true }), '1/2');
  assert.equal(typeKeys(['1', '/', '2'], { fraction: false }), '12', 'a box that does not take fractions never gets a bar');
});

test('one decimal point per number, on each side of the bar', () => {
  assert.equal(typeKeys(['1', '.', '.', '5']), '1.5');
  assert.equal(typeKeys(['1', '.', '5', '/', '2', '.', '5'], { fraction: true }), '1.5/2.5');
  assert.equal(typeKeys(['1', '2', 'backspace', 'clear', '7']), '7');
});

test('a fraction box asks for a text keyboard and the phone keypad', () => {
  assert.equal(FRACTION_ENTRY_PROPS.type, 'text');
  assert.notEqual(FRACTION_ENTRY_PROPS.inputMode, 'decimal', 'an iPhone decimal pad has no minus and no slash');
  assert.equal(FRACTION_ENTRY_PROPS['data-mathmaster-mobile-keypad'], 'true');
  assert.equal(acceptsFractionEntry({ getAttribute: (name) => FRACTION_ENTRY_PROPS[name] ?? null }), true);
  assert.equal(acceptsFractionEntry({ getAttribute: () => null }), false);
});

test('the phone keypad serves those boxes and offers the bar only to them', () => {
  const container = executableSource(read('src/components/student/MobileViewportContainer.jsx'));
  assert.match(container, /NUMERIC_SELECTOR = [^;]*input\[data-mathmaster-mobile-keypad="true"\]/);
  assert.match(container, /applyNumberKey\(current, key, \{\s*fraction: acceptsFractionEntry\(numericTarget\),\s*bareMinus: String\(numericTarget\.type \|\| ''\)\.toLowerCase\(\) !== 'number',/);
  assert.match(container, /\{fractionEntry \? <button type="button" className="mathmaster-keypad-fraction" aria-label="Fraction bar"[\s\S]*?onClick=\{\(\) => applyKey\('\/'\)\}>/);
  assert.doesNotMatch(container, /setReactInputValue\(numericTarget, '0'\)/, 'the old "0" on ± is gone');
});

test('every box graded as a fraction-capable number takes fraction entry', () => {
  // These tools grade the boxes with matchesNumericAnswer / compareMathAnswer,
  // which accept a/b. None may ask for a decimal pad any more.
  const files = [
    'src/tools/linearTableWorkbench/LinearTableWorkbench.jsx',
    'src/tools/representationBridge/RepresentationBridge.jsx',
    'src/tools/sequenceExplorer/SequenceExplorer.jsx',
    'src/TableGrader.jsx',
  ];
  let boxes = 0;
  files.forEach((file) => {
    const source = executableSource(read(file));
    assert.doesNotMatch(source, /inputMode="decimal"/, `${file} still asks for a decimal pad`);
    const uses = source.match(/\{\.\.\.FRACTION_ENTRY_PROPS\}/g) || [];
    assert.ok(uses.length > 0, `${file} uses fraction entry`);
    boxes += uses.length;
    // Never on a number input, which would reject "3/4".
    source.split('<input').slice(1).forEach((tag) => {
      const attrs = tag.slice(0, tag.indexOf('/>'));
      if (attrs.includes('FRACTION_ENTRY_PROPS')) assert.doesNotMatch(attrs, /type="number"/, `${file}: fraction entry on a number input`);
    });
  });
  assert.equal(boxes, 22, 'LTW 6 + bridge 8 + sequence 7 + table 1');
});

test('the box being typed into is scrolled above the number keypad, not left under it', async () => {
  // 390×844: the keypad (fixed, top 570) covered Linear Table Workbench's slope
  // box (bottom 600) while the scroller — the workspace — ended at 844.
  const { scrollFocusedControlVertically } = await import('../../src/platform/mobile/mobileFocusViewport.js');
  const calls = [];
  const scroller = {
    scrollLeft: 0,
    getBoundingClientRect: () => ({ top: 280, bottom: 844, left: 0, right: 390 }),
    scrollBy: (options) => calls.push(options),
  };
  const target = {
    getBoundingClientRect: () => ({ top: 556, bottom: 600, left: 30, right: 190 }),
    closest: () => scroller,
  };
  const keypad = { getBoundingClientRect: () => ({ top: 570, bottom: 836, left: 8, right: 382, height: 266 }) };
  const documentObject = { querySelector: (selector) => (selector === '.mathmaster-mobile-numeric-keypad' ? keypad : null) };
  scrollFocusedControlVertically(target, { root: null, margin: 12, windowObject: { visualViewport: { scale: 1 } }, documentObject });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].top, 600 - (570 - 12));

  // No keypad: the same box inside the scroller stays where it is.
  calls.length = 0;
  scrollFocusedControlVertically(target, { root: null, margin: 12, windowObject: { visualViewport: { scale: 1 } }, documentObject: { querySelector: () => null } });
  assert.equal(calls.length, 0);
});
