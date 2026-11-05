import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mathInput = fs.readFileSync('src/MathInput.jsx', 'utf8');
const orderedPair = fs.readFileSync('src/OrderedPairGrader.jsx', 'utf8');
const multiAnswer = fs.readFileSync('src/MultiAnswerGrader.jsx', 'utf8');

test('ordered-pair grader explicitly requests the ordered-pair answer contract', () => {
  assert.match(orderedPair, /answerFormat=["']orderedPair["']/);
});

test('MathInput resolves required symbols and renders a priority mobile key strip', () => {
  assert.match(mathInput, /resolveRequiredAnswerSymbols/);
  assert.match(mathInput, /Needed for this answer/);
  assert.match(mathInput, /unservedRequiredSymbols/);
  assert.match(mathInput, /requiredAnswerSymbols/);
  assert.match(mathInput, /requiredAnswerToolForSymbol/);
});

test('unknown required symbols fail open to the device keyboard instead of trapping touch users', () => {
  assert.match(mathInput, /unservedRequiredSymbols\.length === 0/);
  assert.match(mathInput, /Additional symbol needed/);
});

test('multi-answer fields infer required mobile keys and still honor authored semantic contracts', () => {
  assert.match(multiAnswer, /inferRequiredAnswerSymbols\(acceptedAnswersForField\(field\)\)/);
  assert.match(multiAnswer, /answerFormat=\{field\.answerFormat \|\| field\.inputContract\?\.format/);
  // They reach the keypad wherever outcomes are shown; on an exit ticket, a
  // quiz or a test before release nothing read from the key does (N56,
  // withheldVerdictKeypad.test.mjs holds both sides).
  assert.match(multiAnswer, /requiredSymbols=\{withheldKeys \? NO_SYMBOLS : requiredSymbols\}/);
  assert.match(multiAnswer, /const withheldKeys = verdictsWithheld \? withheldVerdictKeys\(field, \{ prompt, toolProfile \}\) : null;/);
});
