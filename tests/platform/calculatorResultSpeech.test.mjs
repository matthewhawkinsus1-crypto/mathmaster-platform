/*
 * A11Y-6 (pass 3): calculator keys have spoken names, and the answer is said.
 *
 * Keys were named by their faces ("C", "x superscript y", "a fraction slash
 * b"), and after "=" nothing was announced unless the answer had an exact
 * fraction. The browser half (every rendered key named, Enter and "=" heard,
 * 44px Close and Move) is tests/browser/calculatorKeyboard.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buttonSpec, calculatorButtonsFor, calculatorResultAnnouncement } from '../../src/components/calculatorKeys.js';
import { getCalculatorButtonsForMode } from '../../src/platform/policies/calculatorPolicy.js';

test('every key of every calculator mode has a spoken name in words', () => {
  for (const mode of ['basic', 'scientific', 'graphing', 'squareRoot']) {
    for (const key of calculatorButtonsFor(getCalculatorButtonsForMode(mode))) {
      assert.ok(key.ariaLabel, `${mode}: ${key.label} has a name`);
      assert.doesNotMatch(key.ariaLabel, /[ʸ⁄^√π×÷−]/, `${mode}: ${key.label} is named in words (${key.ariaLabel})`);
    }
  }
  assert.equal(buttonSpec('C').ariaLabel, 'Clear');
  assert.equal(buttonSpec('^').ariaLabel, 'Insert exponent');
  assert.equal(buttonSpec('-').ariaLabel, 'Minus');
  assert.equal(buttonSpec('7').ariaLabel, '7');
  // The keys still do what they did.
  assert.equal(buttonSpec('^').command, '#@^{#?}');
  assert.equal(buttonSpec('÷').action, 'fractionize');
  const keys = calculatorButtonsFor(getCalculatorButtonsForMode('basic'));
  assert.equal(keys[keys.findIndex((key) => key.action === 'equals') - 1].ariaLabel, 'Insert stacked fraction', 'a⁄b sits before =');
});

test('the answer is said in words, with its exact fraction', () => {
  assert.equal(calculatorResultAnnouncement({ decimal: '3.75', fraction: '15/4' }), 'equals 3.75, exactly 15 over 4');
  assert.equal(calculatorResultAnnouncement({ decimal: '-2' }), 'equals negative 2');
  assert.equal(calculatorResultAnnouncement({ decimal: '1.41421356' }), 'equals 1.41421356');
  assert.match(calculatorResultAnnouncement({ error: true }), /could not work that out/);
  assert.equal(calculatorResultAnnouncement({}), '');
});
