/*
 * A QUESTION FAMILY KEY IS NOT A SET — ON THE TEACHER IMPORT PATH TOO.
 *
 * An assignment-local family writes its key as a placeholder: '{{k}}' for a
 * number, '{{pa}}a+{{ps}}s={{R}}' for an equation. The V5 compiler already knew
 * those braces are template syntax (kFollow_compilerDrops.test.mjs), but the
 * teacher import normalizes response fields first, with its own copy of the
 * set rule, and that copy read every such key as roster notation. A number box
 * imported as `type: 'set'` and the student got the set keypad; an equation box
 * did too. Both now share keyLooksLikeFiniteSet.
 *
 * Driven through parseAssignmentBlueprintText, the function the teacher's
 * "Import JSON" runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';

const importFields = (answerFields) => {
  const parsed = parseAssignmentBlueprintText(JSON.stringify({
    schemaVersion: 5,
    assignment: { title: 'Template keys', courseId: 'algebra2', instructionalPurpose: 'review', gradingPurpose: 'classwork' },
    sections: [{
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [{
        questionId: 'template-keys',
        standard: 'A2.6D',
        prompt: 'Use {{a}}, {{b}} and {{k}}.',
        studentActions: ['multipleResponses'],
        answerFields,
        questionFamily: { scope: 'assignment' },
        generator: { parameters: { a: { type: 'int', min: 2, max: 9 }, b: { type: 'int', min: 2, max: 9 }, k: { type: 'int', min: 2, max: 9 } } },
      }],
    }],
  }));
  return Object.fromEntries(parsed.assignmentV5.sections[0].questions[0].answerFields.map((field) => [field.id, field]));
};

test('a generated number key ("{{k}}") imports as a number box, not a set box', () => {
  const { n } = importFields([{ id: 'n', label: 'Value', inputProfile: 'number', answer: '{{k}}' }]);
  assert.notEqual(n.type, 'set');
  assert.notEqual(n.toolProfile, 'set');
});

test('keys built from several placeholders import as what they are, not as sets', () => {
  const fields = importFields([
    { id: 'equation', label: 'Equation', inputProfile: 'equation', answer: '{{a}}a+{{b}}s={{k}}' },
    { id: 'ratio', label: 'Ratio', inputProfile: 'number', answer: '{{a}}/{{b}}' },
    { id: 'expression', label: 'Expression', inputProfile: 'expression', answer: '{{a}}x + {{b|signed}}' },
  ]);
  Object.values(fields).forEach((field) => {
    assert.notEqual(field.type, 'set', field.id);
    assert.notEqual(field.toolProfile, 'set', field.id);
  });
});

test('braces the author wrote around placeholders, and literal rosters, are still sets', () => {
  const fields = importFields([
    { id: 'rosterOfPlaceholders', label: 'Solutions', answer: '{ {{a}}, {{b}} }' },
    { id: 'literalRoster', label: 'Domain', answer: '{-4, -3, -2}' },
  ]);
  Object.values(fields).forEach((field) => {
    assert.equal(field.type, 'set', field.id);
    assert.equal(field.toolProfile, 'set', field.id);
  });
});

test('the Algebra II Honors Lesson 1 Digital SAT item imports its "{{ans}}" key as a number box', () => {
  const parsed = parseAssignmentBlueprintText(readFileSync(
    new URL('../../teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json', import.meta.url),
    'utf8',
  ));
  const fields = parsed.assignmentV5.sections.flatMap((section) => section.questions)
    .flatMap((question) => question.answerFields || [])
    .filter((field) => field.answer === '{{ans}}');
  assert.equal(fields.length, 1);
  assert.notEqual(fields[0].type, 'set');
  assert.equal(parsed.repairs.some((repair) => /finite-set notation/.test(repair)), false);
});
