import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';

// Every case below is text a language model actually produced when asked for
// MathMaster JSON. LaTeX inside a JSON string is the single most common way a
// generated lesson fails to import.
//
// Assignment V5 deliberately rejects raw question arrays, so these repair tests
// exercise the same malformed strings inside the current V5 boundary instead
// of reviving the retired array/V3 authoring contract.

const wrapQuestion = (questionFields) => `{
  "schemaVersion": 5,
  "assignment": { "title": "JSON repair", "courseId": "algebra1" },
  "sections": [{
    "role": "classwork",
    "questions": [{
      "standard": "A.5A",
      "studentActions": ["solveStepByStep"],
      "equation": "2x = 4",
      ${questionFields}
    }]
  }]
}`;

const promptOf = (result, index = 0) => result.questions[index].prompt;

test('a LaTeX command that breaks JSON outright is repaired, not rejected', () => {
  const result = parseAssignmentBlueprintText(wrapQuestion('"prompt":"Solve -3 \\le x < 5."'));
  assert.equal(promptOf(result), 'Solve -3 \\le x < 5.');
  assert.ok(result.repairs.some((note) => /LaTeX backslash/.test(note)), 'the repair is reported');
});

test('a LaTeX command that silently corrupts the prompt is repaired', () => {
  const result = parseAssignmentBlueprintText(wrapQuestion('"prompt":"Simplify \\frac12 + \\frac13."'));
  const prompt = promptOf(result);
  assert.ok(!/\f/.test(prompt), 'no formfeed control character survives in the prompt');
  assert.equal(prompt, 'Simplify \\frac12 + \\frac13.');
});

test('\\text, \\times and escaped braces all survive', () => {
  const result = parseAssignmentBlueprintText(wrapQuestion('"prompt":"Write \\text{the set} \\{2 \\times 3\\} in words."'));
  assert.equal(promptOf(result), 'Write \\text{the set} \\{2 \\times 3\\} in words.');
});

test('legitimate JSON escapes are left exactly as they are', () => {
  const raw = {
    schemaVersion: 5,
    assignment: { title: 'JSON repair', courseId: 'algebra1' },
    sections: [{
      role: 'classwork',
      questions: [{
        standard: 'A.5A',
        studentActions: ['solveStepByStep'],
        equation: '2x = 4',
        prompt: 'Line one\nLine two\tafter a tab, a "quote", a backslash \\ and café.',
      }],
    }],
  };
  const result = parseAssignmentBlueprintText(JSON.stringify(raw));
  assert.equal(promptOf(result), 'Line one\nLine two\tafter a tab, a "quote", a backslash \\ and café.');
  assert.ok(!result.repairs.some((note) => /LaTeX backslash/.test(note)), 'valid JSON escapes are not counted as repairs');
});

test('a real \\uXXXX escape is preserved but \\underline is not mistaken for one', () => {
  const result = parseAssignmentBlueprintText(wrapQuestion('"prompt":"\\u2264 and \\underline{blank}"'));
  assert.equal(promptOf(result), '≤ and \\underline{blank}');
});

test('structural JSON outside strings is untouched by the repair', () => {
  const result = parseAssignmentBlueprintText(wrapQuestion('"prompt":"a \\le b","dok":2'));
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].dok, 2);
  assert.equal(result.questions[0].prompt, 'a \\le b');
});

test('the repair composes with the existing Python-literal repair', () => {
  const result = parseAssignmentBlueprintText(wrapQuestion('"prompt":"Solve \\le for x","guidedNotes":{"enabled":True}'));
  assert.equal(promptOf(result), 'Solve \\le for x');
  assert.equal(result.questions[0].guidedNotes.enabled, true);
});

test('an ambiguous LaTeX command is escaped but a real tab escape is not', () => {
  const latex = parseAssignmentBlueprintText(wrapQuestion('"prompt":"3 \\times 4"'));
  assert.equal(promptOf(latex), '3 \\times 4');

  const realTab = parseAssignmentBlueprintText(wrapQuestion('"prompt":"two\\tafter"'));
  assert.equal(promptOf(realTab), 'two\tafter', 'a legitimate tab escape survives untouched');

  const realBackspace = parseAssignmentBlueprintText(wrapQuestion('"prompt":"a\\bc"'));
  assert.equal(promptOf(realBackspace), 'a\bc', 'an unrecognised \\b escape is left as a backspace');
});

test('clean JSON with no backslashes at all reports no repair', () => {
  const result = parseAssignmentBlueprintText(wrapQuestion('"prompt":"Solve 2x + 3 = 11."'));
  assert.deepEqual(result.repairs.filter((note) => /LaTeX backslash/.test(note)), []);
});
