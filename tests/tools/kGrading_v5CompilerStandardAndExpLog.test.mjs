/*
 * Job K, defects 2a and 2b: what the V5 compiler hands a tool is what the
 * shared grader marks, so a compiled question must still describe the
 * function or line its prompt shows.
 *
 * 2a  graphing2 standard form keeps the line's { A, B, C } in `standard`, the
 *     same key a V5 question uses for its curriculum code. The code used to
 *     overwrite the coefficients, and no plotted line could ever be right.
 * 2b  An exponentialLogBridge `function` with no type compiled to
 *     { type: 'linear', a, k }, dropping h and the base, so the bridge graded
 *     a different function from the prompt.
 *
 * Every expected value is hand-derived from the prompt's own mathematics.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { normalizeQuestionAlignments } from '../../src/platform/contract/alignments.js';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

const payloadOf = (questions) => ({
  schemaVersion: 5,
  assignment: { title: 'Job K compiler', courseId: 'algebra1' },
  sections: [{ role: 'practice', title: 'Practice', questions }],
});
const compileOne = (question) => compileAuthoringIntentV5(payloadOf([question])).package.sections[0].questions[0];
const importOne = (question) => parseAssignmentBlueprintText(JSON.stringify(payloadOf([question]))).questions[0];

// 2x + 3y = 12 crosses the axes at (6, 0) and (0, 4); (3, 2) is on it too
// (6 + 6 = 12). 4x + 3y = 12 — (0, 4), (3, 0), (6, −4) — is a different line.
const STANDARD_FORM_INTENT = {
  prompt: 'Graph 2x + 3y = 12.',
  studentActions: ['constructLine'],
  standard: 'A.3C',
  standardForm: { A: 2, B: 3, C: 12 },
};
const KEY_POINTS = [[6, 0], [0, 4], [3, 2]];
const WRONG_LINE_POINTS = [[0, 4], [3, 0], [6, -4]];
const gradeLine = (question, points) => gradeToolWork({ toolId: 'graphing2', question, work: { points } });

test('2a: a standard-form graphing2 question keeps its coefficients and its curriculum standard', () => {
  const compiled = compileOne(STANDARD_FORM_INTENT);
  assert.equal(compiled.type, 'graphing2');
  assert.equal(compiled.mode, 'standardForm');
  assert.deepEqual(compiled.standard, { A: 2, B: 3, C: 12 });
  assert.equal(compiled.primaryStandard, 'A.3C');

  const key = gradeLine(compiled, KEY_POINTS);
  assert.equal(key.graded, true);
  assert.equal(key.isCorrect, true, 'the key line must be marked correct');
  assert.equal(gradeLine(compiled, WRONG_LINE_POINTS).isCorrect, false, 'a different line must stay wrong');
});

test('2a: through the import pipeline the code becomes the primary alignment and the line still grades', () => {
  const imported = importOne(STANDARD_FORM_INTENT);
  assert.deepEqual(imported.standard, { A: 2, B: 3, C: 12 });
  assert.equal(gradeLine(imported, KEY_POINTS).isCorrect, true);
  const primary = normalizeQuestionAlignments(imported, { includeCrosswalks: false }).filter((entry) => entry.role === 'primary');
  assert.deepEqual(primary.map((entry) => entry.code), ['A.3C']);
});

test('2a: a different authored primary keeps the code as a secondary standard', () => {
  const compiled = compileOne({ ...STANDARD_FORM_INTENT, primaryStandard: 'A.2B' });
  assert.deepEqual(compiled.standard, { A: 2, B: 3, C: 12 });
  assert.equal(compiled.primaryStandard, 'A.2B');
  assert.deepEqual(compiled.secondaryStandards, ['A.3C']);
});

test('2a: a question whose standard is only a curriculum code is unchanged', () => {
  const compiled = compileOne({ prompt: 'Graph y = 2x + 1.', studentActions: ['constructLine'], standard: 'A.3C', lineIntent: { m: 2, b: 1 } });
  assert.equal(compiled.standard, 'A.3C');
  assert.equal(compiled.primaryStandard, undefined);
});

// composition, x = 1: f⁻¹(f(1)) = 1, and the default y is f(x + 1) = f(2), so
// f(f⁻¹(y)) = f(2).
//   f(x) = 3·2^(x − 1) + 4: f(2) = 3·2 + 4 = 10.
//   f(x) = 3·5^(x − 1) + 4: f(2) = 3·5 + 4 = 19.
// The old compile graded 3·2^x + 4 (h and base dropped): f(2) = 3·4 + 4 = 16;
// for the b-as-base spec it graded 3·2^x + 5 (b read as the intercept): 17.
const gradeComposition = (question, inverseAfterForward, forwardAfterInverse) => gradeToolWork({
  toolId: 'exponentialLogBridge',
  question,
  work: { inverseAfterForward, forwardAfterInverse },
});
const bridgeIntent = (fn) => ({
  prompt: 'Use f to find f⁻¹(f(1)) and f(f⁻¹(f(2))).',
  studentActions: ['exponentialLogBridge'],
  mode: 'composition',
  function: fn,
  x: 1,
});

test('2b: a typeless bridge function compiles to the exponential it describes, base and h kept', () => {
  const compiled = compileOne(bridgeIntent({ a: 3, base: 2, h: 1, k: 4 }));
  assert.equal(compiled.type, 'exponentialLogBridge');
  assert.deepEqual(compiled.function, { type: 'exponential', a: 3, base: 2, h: 1, k: 4 });
  assert.equal(gradeComposition(compiled, '1', '10').isCorrect, true, 'the key for 3·2^(x − 1) + 4 must be correct');
  assert.equal(gradeComposition(compiled, '1', '16').isCorrect, false, 'the answer for 3·2^x + 4 must stay wrong');
});

test('2b: an a·b^(x − h) + k bridge function reads b as the base', () => {
  const compiled = compileOne(bridgeIntent({ a: 3, b: 5, h: 1, k: 4 }));
  assert.deepEqual(compiled.function, { type: 'exponential', a: 3, base: 5, h: 1, k: 4 });
  assert.equal(gradeComposition(compiled, '1', '19').isCorrect, true);
  assert.equal(gradeComposition(compiled, '1', '17').isCorrect, false);
});

test('2b: typed bridge functions and line-shaped ones compile exactly as before', () => {
  assert.deepEqual(
    compileOne(bridgeIntent({ type: 'exponential', a: 3, base: 2, h: 1, k: 4 })).function,
    { type: 'exponential', a: 3, base: 2, h: 1, k: 4 },
  );
  assert.deepEqual(compileOne(bridgeIntent({ m: 2, b: 1 })).function, { type: 'linear', a: 2, h: 0, k: 1 });
});

// Review follow-up. The bridge can only grade a base that is positive and ≠ 1,
// and it never reads `b`. A typeless {a, b: 0} now compiles to base 0, which
// the grader leaves ungraded; a typed exponential written with b grades base
// 2. Grading is unchanged in both cases (so the second test pins the
// ungraded verdict), but the import must warn the teacher instead of
// leaving them to find out at grade time.
const compileWarningsOf = (question) => compileAuthoringIntentV5(payloadOf([question])).warnings;
const importWarningsOf = (question) => parseAssignmentBlueprintText(JSON.stringify(payloadOf([question]))).warnings;
const bridgeInverse = (fn) => ({ ...bridgeIntent(fn), mode: 'inverse' });

test('2b review: a bridge function whose base is 0, 1 or negative warns at compile and import', () => {
  for (const fn of [{ a: 2, b: 0 }, { a: 1, b: 1 }, { a: 2, b: -3 }, { type: 'exponential', a: 2, base: 1 }]) {
    const compileWarnings = compileWarningsOf(bridgeInverse(fn));
    assert.equal(compileWarnings.filter((w) => /exponentialLogBridge function base .* must be positive and not 1/.test(w)).length, 1, JSON.stringify(fn));
    assert.ok(importWarningsOf(bridgeInverse(fn)).some((w) => /must be positive and not 1/.test(w)), `import warns for ${JSON.stringify(fn)}`);
  }
  const graded = gradeToolWork({ toolId: 'exponentialLogBridge', question: compileOne(bridgeInverse({ a: 2, b: 0 })), work: { inverseAnswer: '1', asymptote: '0', domainSide: 'greater' } });
  assert.equal(graded.graded, false, 'an invalid base stays ungraded rather than grading another function');
});

test('2b review: a typed exponential written with b warns that the bridge grades base 2', () => {
  const warnings = compileWarningsOf(bridgeIntent({ type: 'exponential', a: 3, b: 5 }));
  assert.equal(warnings.filter((w) => /has b = 5 but no base; the bridge grades it with base 2/.test(w)).length, 1);
});

test('2b review: valid bridge functions compile with no base warning', () => {
  for (const fn of [{ a: 3, base: 2, h: 1, k: 4 }, { a: 3, b: 5, h: 1, k: 4 }, { type: 'exponential', a: 3, base: 0.5 }, { type: 'exponential', a: 3 }]) {
    assert.deepEqual(compileWarningsOf(bridgeIntent(fn)).filter((w) => /exponentialLogBridge/.test(w)), [], JSON.stringify(fn));
  }
});
