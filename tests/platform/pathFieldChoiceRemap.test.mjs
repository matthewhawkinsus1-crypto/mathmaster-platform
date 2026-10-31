/*
 * A PATH FIELD'S CHOICES: WHERE THE SCREEN SHOWS THEM, THE SERVER REMAPS (MP13).
 *
 * The server serves every field's own choices with runtime ids, but remaps a
 * field's key to those ids only when the field's profile is "choice". That is
 * right because it is exactly when the Path screen draws them: a field whose
 * profile is not "choice" is a typed box even if it carries choices, so the
 * student types the value and the authored key is what grades it. Remapping
 * that key too would mark a typed answer wrong. Kept as built; these pin the
 * two halves together so they cannot drift apart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const question = (inputProfile) => ({
  id: 'q-mp13',
  prompt: 'Which is the slope?',
  responseFields: [{ id: 'a', inputProfile, expected: '2', choices: [{ id: '1', label: '1' }, { id: '2', label: '2' }] }],
});

test('the screen draws a field\'s choices only for a "choice" profile', () => {
  const fields = readFileSync(new URL('../../src/components/student/PathResponseFields.jsx', import.meta.url), 'utf8');
  assert.match(fields, /const choices = field\.choices\?\.length \? field\.choices : questionChoices;\s*if \(profile === 'choice' && choices\.length\) \{/);
});

test('the server remaps a field\'s key to runtime ids exactly then', () => {
  const choice = mathPath.privateGradingDefinition(question('choice')).fields[0];
  assert.notEqual(choice.expected, '2', 'a choice field is graded on the runtime id the student picks');
  assert.match(String(choice.expected), /\S/);
  const typed = mathPath.privateGradingDefinition(question('number')).fields[0];
  assert.equal(typed.expected, '2', 'a typed field keeps its authored key: the student types the value');
});

test('a typed field that carries choices still grades the typed value', async () => {
  const typed = mathPath.privateGradingDefinition(question('number'));
  assert.equal((await mathPath.gradeResponse(typed, { responses: { a: '2' } })).isCorrect, true);
  assert.equal((await mathPath.gradeResponse(typed, { responses: { a: '1' } })).isCorrect, false);
});
