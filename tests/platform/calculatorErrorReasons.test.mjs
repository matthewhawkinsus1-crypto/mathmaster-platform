/*
 * THE CALCULATOR SAYS WHAT IT COULD NOT READ (student pass 3, TOOL-8).
 *
 * The screen showed a bare "Error" for every refusal; a screen reader heard
 * "The calculator could not work that out." Now each refusal carries its
 * reason, and the screen and the announcement say the same sentence:
 * "It could not read “=”.", "A bracket is not closed.", "That has no number
 * answer. Check for dividing by 0." The thrown messages are unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCalculatorExpressionExact } from '../../src/platform/policies/calculatorExpression.js';
import { CALCULATOR_MODES } from '../../src/platform/policies/calculatorPolicy.js';
import { calculatorErrorMessage, calculatorResultAnnouncement } from '../../src/components/calculatorKeys.js';
import { region } from './helpers/sourceContract.mjs';

const refusalOf = (expression, mode = 'basic') => {
  try {
    evaluateCalculatorExpressionExact(expression, mode);
  } catch (error) {
    return error;
  }
  assert.fail(`${expression} was not refused`);
};
const said = (expression, mode) => calculatorErrorMessage(refusalOf(expression, mode));

test('each refusal names what the calculator could not read', () => {
  assert.equal(said('2+3=5'), 'It could not read “=”. Use numbers, + − × ÷, brackets and the function keys.');
  assert.equal(said('abc'), 'It could not read “abc”. Use the function keys for √, sin, cos, tan, log and ln.');
  assert.equal(said('1/0'), 'That has no number answer. Check for dividing by 0.');
  assert.equal(said('(2+3'), 'A bracket is not closed. Add the missing “)”.');
  assert.equal(said('2+3)'), 'A “)” has no “(” to match it.');
  assert.equal(said('2+*3'), 'It could not read that. Check for a missing number, or two signs side by side.');
  assert.equal(said(''), 'Type a calculation first.');
  assert.equal(said('1+'.repeat(100)), 'That calculation is too long. Work it out in smaller steps.');
  assert.equal(said('2^3', CALCULATOR_MODES.SQUARE_ROOT), 'This calculator does not have that key on this question.');
  // Anything without a reason keeps the general sentence.
  assert.equal(calculatorErrorMessage(new Error('x')), 'The calculator could not work that out. Check the expression.');
  // The thrown text is what it always was.
  assert.match(refusalOf('1/0').message, /finite number/);
  assert.match(refusalOf('abc').message, /Unsupported calculator function/);
});

test('the screen shows the reason under "Error", and the announcement says the same words', () => {
  assert.equal(calculatorResultAnnouncement({ error: said('2+3=5') }), said('2+3=5'));
  assert.equal(calculatorResultAnnouncement({ error: true }), 'The calculator could not work that out. Check the expression.');
  const panel = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');
  // Both ways to press "=" (Enter in the field, the = key) set the shown reason and say it.
  const enter = region(panel, 'const handleKeyDown = (event) => {', 'const preventContextMenu', 'Enter');
  const equals = region(panel, "if (button.action === 'equals') {", 'return;', '= key');
  [enter, equals].forEach((handler) => {
    assert.match(handler, /catch \(error\) \{[\s\S]*setErrorText\(calculatorErrorMessage\(error\)\);\s*announceResult\(\{ error: calculatorErrorMessage\(error\) \}\);/);
  });
  assert.match(panel, /\{display === 'Error' && errorText \? \(\s*\/\/[^\n]*\n\s*<p data-calculator-error=""[^>]*>\s*\{errorText\}\s*<\/p>/);
});

test('a key typed after Clear replaces the placeholder 0, so (2+3 is 5, not 0(2+3) = 0', async () => {
  const { typedKeyReplacesPlaceholder } = await import('../../src/components/calculatorKeys.js');
  const typed = (key, extra = {}) => ({ key, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });
  assert.equal(typedKeyReplacesPlaceholder(typed('('), { value: '0', placeholderShown: true }), true, 'the panel\'s own 0');
  assert.equal(typedKeyReplacesPlaceholder(typed('5'), { value: 'Error', placeholderShown: false }), true, 'Error');
  assert.equal(typedKeyReplacesPlaceholder(typed('.'), { value: '0', placeholderShown: false }), false, 'a 0 the student typed stays (0.5)');
  assert.equal(typedKeyReplacesPlaceholder(typed('Enter'), { value: '0', placeholderShown: true }), false, 'Enter evaluates, it types nothing');
  assert.equal(typedKeyReplacesPlaceholder(typed('Backspace'), { value: '0', placeholderShown: true }), false);
  assert.equal(typedKeyReplacesPlaceholder(typed('c', { ctrlKey: true }), { value: '0', placeholderShown: true }), false, 'a shortcut');
  assert.equal(typedKeyReplacesPlaceholder(typed('2'), { value: '42', placeholderShown: false }), false, 'a result keeps going');
  // Wiring: checked before MathLive inserts the key (capture, registered before
  // the typed-fraction step), the panel's 0 marks the placeholder, and input clears it.
  const panel = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');
  const listeners = region(panel, "mathField.addEventListener('input', handleInput);", "mathField.addEventListener('pointerdown'", 'listeners');
  assert.ok(listeners.indexOf("addEventListener('keydown', replacePlaceholder, { capture: true })") > -1
    && listeners.indexOf("addEventListener('keydown', replacePlaceholder, { capture: true })") < listeners.indexOf("addEventListener('keydown', leaveTypedFraction"));
  assert.match(region(panel, 'const replacePlaceholder = (event) => {', '};', 'replacePlaceholder'), /if \(!typedKeyReplacesPlaceholder\(event, \{ value: mathField\.value, placeholderShown: placeholderShownRef\.current \}\)\) return;\s*mathField\.value = '';/);
  // Only Clear writes the placeholder (review N1): a 0 that "=" computed is a result.
  assert.match(region(panel, 'const setCalculatorValue = useCallback(', '}, []);', 'setCalculatorValue'), /placeholderShownRef\.current = placeholder;/);
  assert.match(region(panel, "if (button.action === 'clear') {", 'return;', 'Clear'), /setCalculatorValue\('0', \{ placeholder: true \}\);/);
  assert.doesNotMatch(panel, /setCalculatorValue\((?:evaluated\.decimal|'Error')\s*,\s*\{ placeholder: true/);
  assert.match(region(panel, 'const handleInput = () => {', '};', 'handleInput'), /placeholderShownRef\.current = false;/);
});

test('text that arrives without a key (paste, IME, dictation, a touch keyboard) also replaces the placeholder (review F1, N2)', async () => {
  const { deleteKeyClearsError, valueWithoutPlaceholder } = await import('../../src/components/calculatorKeys.js');
  assert.equal(valueWithoutPlaceholder('0\\left(2+3\\right)', { placeholderShown: true }), '\\left(2+3\\right)');
  assert.equal(valueWithoutPlaceholder('0-3\\cdot2', { placeholderShown: true }), '-3\\cdot2');
  assert.equal(valueWithoutPlaceholder('07', { placeholderShown: true }), null, 'a digit after the 0 is harmless');
  assert.equal(valueWithoutPlaceholder('0.5', { placeholderShown: true }), null, 'nor a decimal point');
  assert.equal(valueWithoutPlaceholder('0\\left(2+3\\right)', { placeholderShown: false }), null, 'a 0 the student typed or computed stays');
  assert.equal(valueWithoutPlaceholder('Error(2+3)', { placeholderShown: false }), '(2+3)');
  assert.equal(valueWithoutPlaceholder('Error'), null);
  assert.equal(deleteKeyClearsError({ key: 'Backspace' }, 'Error'), true);
  assert.equal(deleteKeyClearsError({ key: 'Delete' }, 'Error'), true);
  assert.equal(deleteKeyClearsError({ key: 'Backspace' }, '12'), false);
  const panel = readFileSync(new URL('../../src/components/CalculatorPanel.jsx', import.meta.url), 'utf8');
  const repair = region(panel, 'const repairPlaceholder = useCallback(', '}, []);', 'repairPlaceholder');
  assert.match(repair, /valueWithoutPlaceholder\(mathField\.value, \{ placeholderShown: placeholderShownRef\.current \}\)/);
  const input = region(panel, 'const handleInput = () => {', 'setDisplay(', 'handleInput');
  assert.ok(input.indexOf('repairPlaceholder(mathField);') > -1
    && input.indexOf('repairPlaceholder(mathField);') < input.indexOf('placeholderShownRef.current = false;'), 'repaired before the placeholder is forgotten');
  // And again just before evaluating, on both Enter and "=": MathLive reports
  // committed text late, so Enter can come before the input that repairs it.
  const enterEval = region(panel, 'const handleKeyDown = (event) => {', 'const preventContextMenu', 'Enter');
  assert.match(enterEval, /repairPlaceholder\(mathField\);\s*const expression = expressionFromMathField/);
  const equalsEval = region(panel, "if (button.action === 'equals') {", 'return;', '= key');
  assert.match(equalsEval, /repairPlaceholder\(mathFieldRef\.current\);\s*const expression = expressionFromMathField/);
  // An input that leaves only the placeholder "0" (MathLive reports one before
  // committed text lands) does not end the placeholder.
  assert.match(input, /if \(mathField\.value !== '0'\) placeholderShownRef\.current = false;/);
  assert.match(region(panel, 'const replacePlaceholder = (event) => {', 'if (!typedKeyReplacesPlaceholder', 'delete on Error'), /if \(deleteKeyClearsError\(event, mathField\.value\)\) \{\s*event\.preventDefault\(\);[\s\S]*mathField\.value = '0';\s*placeholderShownRef\.current = true;/);
});

test('a pasted "*" (MathLive\'s ∗, U+2217) and a dot operator ⋅ multiply (review N-a)', () => {
  assert.equal(evaluateCalculatorExpressionExact('0.5∗2', 'basic').decimal, '1');
  assert.equal(evaluateCalculatorExpressionExact('3⋅4', 'basic').decimal, '12');
});
