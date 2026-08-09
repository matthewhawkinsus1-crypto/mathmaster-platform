import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';

// Every case below is text a language model actually produced when asked for
// MathMaster JSON. LaTeX inside a JSON string is the single most common way a
// generated lesson fails to import.

const promptOf = (result, index = 0) => result.questions[index].prompt;

test('a LaTeX command that breaks JSON outright is repaired, not rejected', () => {
  // "\le" is not a legal JSON escape, so JSON.parse throws before we ever see
  // the question.
  const raw = '[{"type":"algebra","prompt":"Solve -3 \\le x < 5."}]';
  const result = parseAssignmentBlueprintText(raw);
  assert.equal(promptOf(result), 'Solve -3 \\le x < 5.');
  assert.ok(result.repairs.some((note) => /LaTeX backslash/.test(note)), 'the repair is reported');
});

test('a LaTeX command that silently corrupts the prompt is repaired', () => {
  // This one is worse than a syntax error: "\f" IS a legal escape, so the JSON
  // parses and the prompt quietly becomes formfeed + "rac12".
  const raw = '[{"type":"algebra","prompt":"Simplify \\frac12 + \\frac13."}]';
  const result = parseAssignmentBlueprintText(raw);
  const prompt = promptOf(result);
  assert.ok(!/\f/.test(prompt), 'no formfeed control character survives in the prompt');
  assert.equal(prompt, 'Simplify \\frac12 + \\frac13.');
});

test('\\text, \\times and escaped braces all survive', () => {
  const raw = '[{"type":"algebra","prompt":"Write \\text{the set} \\{2 \\times 3\\} in words."}]';
  const result = parseAssignmentBlueprintText(raw);
  assert.equal(promptOf(result), 'Write \\text{the set} \\{2 \\times 3\\} in words.');
});

test('legitimate JSON escapes are left exactly as they are', () => {
  const raw = JSON.stringify([{
    type: 'algebra',
    prompt: 'Line one\nLine two\tafter a tab, a "quote", a backslash \\ and café.',
  }]);
  const result = parseAssignmentBlueprintText(raw);
  assert.equal(
    promptOf(result),
    'Line one\nLine two\tafter a tab, a "quote", a backslash \\ and café.',
  );
  assert.ok(
    !result.repairs.some((note) => /LaTeX backslash/.test(note)),
    'valid JSON escapes are not counted as repairs',
  );
});

test('a real \\uXXXX escape is preserved but \\underline is not mistaken for one', () => {
  const raw = '[{"type":"algebra","prompt":"\\u2264 and \\underline{blank}"}]';
  const result = parseAssignmentBlueprintText(raw);
  assert.equal(promptOf(result), '≤ and \\underline{blank}');
});

test('structural JSON outside strings is untouched by the repair', () => {
  const raw = '[{"type":"algebra","prompt":"a \\le b","answer":"x = \\frac{1}{2}","dok":2}]';
  const result = parseAssignmentBlueprintText(raw);
  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].dok, 2);
  assert.equal(result.questions[0].answer, 'x = \\frac{1}{2}');
});

test('the repair composes with the existing Python-literal repair', () => {
  const raw = '[{"type": "algebra", "prompt": "Solve \\le for x", "showWork": True}]';
  const result = parseAssignmentBlueprintText(raw);
  assert.equal(result.questions[0].showWork, true);
  assert.equal(promptOf(result), 'Solve \\le for x');
});

test('an ambiguous LaTeX command is escaped but a real tab escape is not', () => {
  // "\times" and "\tabular" both start with the legal \t escape; only the one
  // that names a LaTeX command may be rewritten.
  const latex = parseAssignmentBlueprintText('[{"type":"algebra","prompt":"3 \\times 4"}]');
  assert.equal(promptOf(latex), '3 \\times 4');

  const realTab = parseAssignmentBlueprintText('[{"type":"algebra","prompt":"two\\tafter"}]');
  assert.equal(promptOf(realTab), 'two\tafter', 'a legitimate tab escape survives untouched');

  const realFormfeedish = parseAssignmentBlueprintText('[{"type":"algebra","prompt":"a\\bc"}]');
  assert.equal(promptOf(realFormfeedish), 'a\bc', 'an unrecognised \\b escape is left as a backspace');
});

test('clean JSON with no backslashes at all reports no repair', () => {
  const raw = JSON.stringify([{ type: 'algebra', prompt: 'Solve 2x + 3 = 11.' }]);
  const result = parseAssignmentBlueprintText(raw);
  assert.deepEqual(result.repairs.filter((note) => /LaTeX backslash/.test(note)), []);
});
