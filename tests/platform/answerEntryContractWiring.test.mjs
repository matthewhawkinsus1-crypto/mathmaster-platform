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
});

test('unknown required symbols fail open to the device keyboard instead of trapping touch users', () => {
  assert.match(mathInput, /unservedRequiredSymbols\.length === 0/);
  assert.match(mathInput, /Additional symbol needed/);
});

test('multi-answer fields can carry an authored input contract forward to MathInput', () => {
  assert.match(multiAnswer, /answerFormat=\{field\.answerFormat \|\| field\.inputContract\?\.format/);
  assert.match(multiAnswer, /requiredSymbols=\{field\.requiredSymbols \|\| field\.inputContract\?\.requiredSymbols/);
});
