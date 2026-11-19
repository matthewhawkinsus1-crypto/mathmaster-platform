/*
 * A LONG ANSWER NEVER STALLS THE CHECK: THE SIMPLIFY BUDGET.
 *
 * isAlgebraicallyEquivalent (composed workflows on the device AND the server,
 * Pre-Flight's key self-check) decided a pair by having mathjs simplify
 * `(student) - (key)`. simplify's cost is exponential in the length of a sum
 * or product chain, and nothing in the 300 characters an answer may hold
 * stopped one: `x^2+x^2+…` at 20 terms took 2.2 s, `(x+1)(x+1)…` at 20
 * factors 3.1 s, `x*y/x*y/…` at 14 terms 5 s, and a 241-character `x1/x1/…`
 * did not finish (a developer machine; a Chromebook is several times slower).
 * The student's tab froze on Check and the server held a function instance.
 * The grader fuzz harness found it (scripts/lib/graderFuzz).
 *
 * A difference past the budget (simplifyBudget.mjs) is now compared at sample
 * points first: a wrong answer is wrong at once, and simplify is asked only
 * about sides that agree everywhere, and only while the chain is one it
 * finishes. Inside the budget nothing changed. scripts/sweep-algebraic-
 * equivalence-budget.mjs runs every bank key against its spellings, its near
 * misses and the harness's own inputs, 17,769 pairs: no verdict the old rule
 * gave moves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { fraction, parse } from '../../functions/shared/algebra/safeMath.mjs';
import { gradeComposedWorkflowCheck } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { composedWorkflowWork } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { isAlgebraicallyEquivalent } from '../../functions/shared/toolMath/workflow/equivalence.mjs';
import { SAMPLED, SIMPLIFY_BUDGET, SIMPLIFY_LIMIT, compareAtSamples, decidePastBudget, sampledIdentity, simplifyCost, withinSimplifyBudget } from '../../functions/shared/toolMath/workflow/simplifyBudget.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { gradeResponseField } from '../../src/grading/fieldGrader.js';

const repeated = (term, count, joiner) => Array(count).fill(term).join(joiner);

// Each took seconds, or never came back, before the budget. Now milliseconds;
// the limit is far above that and far below what they took.
const STALLED = [
  ['x^2 + x^2 + … (20 terms)', repeated('x^2', 20, '+')],
  ['(x+1)(x+1)… (20 factors)', repeated('(x+1)', 20, '')],
  ['x*y/x*y/… (14 terms)', repeated('x*y', 14, '/')],
  ['x/x/… (24 terms)', repeated('x', 24, '/')],
  ['x - x - … (30 terms)', repeated('x', 30, '-')],
  ['2x/2x/… (24 terms)', repeated('2x', 24, '/')],
  ['x1/x1/… (241 characters)', repeated('x1', 81, '/').slice(0, 241)],
  ['a sum of 20 rational terms', repeated('(x+1)/(x-1)', 20, '+')],
];
const LIMIT_MS = 1000;

test('a long chain is answered at once, by every caller', () => {
  // Warm the engine: the first call pays for loading mathjs.
  isAlgebraicallyEquivalent('x+1', 'x+2');
  for (const [name, typed] of STALLED) {
    for (const key of ['-7', '2x+3']) {
      const started = performance.now();
      assert.equal(isAlgebraicallyEquivalent(typed, key), false, `${name} is not ${key}`);
      const elapsed = performance.now() - started;
      assert.ok(elapsed < LIMIT_MS, `${name} against ${key} took ${Math.round(elapsed)} ms`);
    }
    const started = performance.now();
    assert.equal(gradeResponseField({ expected: -7, inputProfile: 'number' }, typed).isCorrect, false);
    assert.ok(performance.now() - started < LIMIT_MS, `Pre-Flight's field check on ${name}`);
  }
});

// A compiled function workflow, keyed with the bare rule: an answer with no
// `=` in it is compared with the key by isAlgebraicallyEquivalent's last resort.
const composedQuestion = () => {
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Simplify budget', courseId: 'algebra1' },
    sections: [{ role: 'practice', questions: [{
      standard: 'A.3C',
      studentActions: ['writeEquation', 'completeTable'],
      prompt: 'Model the cost.',
      answerModel: { equation: 'f(x)=2x+3', tableXValues: [0, 1, 2] },
    }] }],
  }).package.sections[0].questions[0];
  return {
    ...compiled,
    workflow: compiled.workflow.filter((stage) => stage.id === 'equation'),
    grading: { equation: '2x+3' },
  };
};

test('a composed question marks a long chain at once, on the device and on the server', () => {
  const question = composedQuestion();
  const equationPart = (result) => result.parts.find((part) => part.id === 'equation');
  const check = (equation) => {
    const device = gradeComposedWorkflowCheck(question, composedWorkflowWork({ equation }));
    const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(device.toolResponse)) });
    return { device, server };
  };
  // The question reads a right rule, so a wrong verdict below is a verdict.
  assert.equal(equationPart(check('2x+3').device).isCorrect, true);
  assert.equal(equationPart(check('3+2x').device).isCorrect, true);
  assert.equal(equationPart(check('x+x+3').device).isCorrect, true, 'like terms, by simplify');
  assert.equal(equationPart(check('2x+4').device).isCorrect, false);
  for (const [name, typed] of STALLED) {
    const started = performance.now();
    const { device, server } = check(typed);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 2 * LIMIT_MS, `${name} took ${Math.round(elapsed)} ms`);
    assert.equal(device.graded, true, `${name}: ${device.reason}`);
    assert.equal(equationPart(device).isCorrect, false, name);
    assert.equal(equationPart(server).isCorrect, false, `${name}: the server agrees with the screen`);
  }
});

const sides = (student, key) => [parse(`(${student}) - (${key})`), parse(student), parse(key), fraction];

test('past the budget a wrong answer is wrong at once, and simplify still decides what it can finish', () => {
  // 11 to 14 links: sides that agree at every point are still simplify's to
  // decide, so its verdict is the one it always gave...
  const product = repeated('(x+1)', 12, '*');
  assert.equal(simplifyCost(parse(`(${product}) - ((x+1)^12)`)).chain, 12);
  assert.equal(decidePastBudget(...sides(product, '(x+1)^12')), 'simplify');
  assert.equal(isAlgebraicallyEquivalent(product, '(x+1)^12'), true);
  // ...including "not the same form": simplify does not expand, here or anywhere.
  const padded = `2(x+3)${'+x-x'.repeat(5)}`;
  assert.equal(decidePastBudget(...sides(padded, '2x+6')), 'simplify');
  assert.equal(isAlgebraicallyEquivalent(padded, '2x+6'), false);
  assert.equal(isAlgebraicallyEquivalent('2(x+3)', '2x+6'), false, 'as it is inside the budget');
  // ...and sides that differ at a point are never handed to it.
  assert.equal(decidePastBudget(...sides(product, '(x+1)^11')), SAMPLED.DIFFERENT);
  assert.equal(isAlgebraicallyEquivalent(product, '(x+1)^11'), false);
});

test('past what simplify finishes, equal at every point is equal and anything else is not', () => {
  const polynomial = 'x^11+2x^10+3x^9+4x^8+5x^7+6x^6+7x^5+8x^4+9x^3+10x^2+11x+12';
  const reversed = '12+11x+10x^2+9x^3+8x^4+7x^5+6x^6+5x^7+4x^8+3x^9+2x^10+x^11';
  assert.equal(withinSimplifyBudget(parse(`(${reversed}) - (${polynomial})`), SIMPLIFY_LIMIT), false, 'a 24-link difference');
  assert.equal(isAlgebraicallyEquivalent(reversed, polynomial), true);
  assert.equal(isAlgebraicallyEquivalent(reversed.replace('12+', '13+'), polynomial), false);
  assert.equal(isAlgebraicallyEquivalent(reversed.replace('11x+', '11x^2+'), polynomial), false);
  for (const [student, key, verdict] of [
    [repeated('(x+1)', 16, '*'), '(x+1)^16', true],
    [repeated('(x+1)', 16, '*'), '(x+1)^15', false],
    [repeated('x*y', 16, '+'), '16*x*y', true],
    [repeated('1/(x-1)', 16, '+'), '16/(x-1)', true],
    [repeated('1/(x-1)', 16, '+'), '16/(x+1)', false],
    [repeated('1', 30, '+'), '30', true],
    [repeated('1', 30, '+'), '31', false],
  ]) {
    assert.equal(decidePastBudget(...sides(student, key)), verdict ? SAMPLED.EQUAL : SAMPLED.DIFFERENT, `${student.slice(0, 30)}… for ${key}`);
    assert.equal(isAlgebraicallyEquivalent(student, key), verdict, `${student.slice(0, 30)}… for ${key}`);
  }
  // A name nothing can evaluate says nothing: not shown equal.
  const unknownName = repeated('g(x)', 16, '*');
  assert.equal(decidePastBudget(...sides(unknownName, `2*${unknownName}`)), SAMPLED.DIFFERENT);
});

// PR #560 review: two ways the sample points could give a wrong verdict past
// what simplify finishes. Both were real, on the device and on the server.
test('past what simplify finishes, a large shared term hides nothing and a root of a negative number is still a value', () => {
  // The sides differ by exactly one at every point. A relative tolerance called that equal.
  for (const [student, key] of [
    [`10000000+x${'+0'.repeat(15)}`, '10000001+x'],
    [`1000000000000000+x${'+0'.repeat(15)}`, '1000000000000001+x'],
    [`x^3+123456789${'+0'.repeat(15)}`, 'x^3+123456790'],
    [`(1000000x+1)/x${'+0'.repeat(15)}`, '(1000000x+2)/x'],
  ]) {
    assert.equal(decidePastBudget(...sides(student, key)), SAMPLED.DIFFERENT, `${student.slice(0, 24)}… for ${key}`);
    assert.equal(isAlgebraicallyEquivalent(student, key), false, `${student.slice(0, 24)}… for ${key}`);
  }
  assert.equal(isAlgebraicallyEquivalent(`10000001+x${'+0'.repeat(15)}`, '10000001+x'), true, 'and the right one is still right');
  // Defined at no sample as a real number, equal at every one as a complex one:
  // simplify proved these equal, and they are.
  for (const [student, key, verdict] of [
    [repeated('sqrt(x-100)', 15, '+'), '15*sqrt(x-100)', true],
    [repeated('sqrt(x-100)', 15, '+'), '14*sqrt(x-100)', false],
    [repeated('sqrt(x-100)', 15, '+'), '15*sqrt(x-99)', false],
    [repeated('log(x-100)', 15, '+'), '15*log(x-100)', true],
    [repeated('ln(x)', 15, '+'), '15*ln(x)', true],
    [repeated('ln(x)', 15, '+'), '15*ln(x+1)', false],
    [repeated('x^(1/2)', 15, '*'), 'x^(15/2)', true],
  ]) assert.equal(isAlgebraicallyEquivalent(student, key), verdict, `${student.slice(0, 24)}… for ${key}`);
  // The same through a composed question, on the device and on the server.
  const question = composedQuestion();
  const mark = (equation, key) => {
    const asked = { ...question, grading: { equation: key } };
    const device = gradeComposedWorkflowCheck(asked, composedWorkflowWork({ equation }));
    const server = gradeServerResponse({ question: asked, response: JSON.parse(JSON.stringify(device.toolResponse)) });
    const part = (result) => result.parts.find((entry) => entry.id === 'equation').isCorrect;
    assert.equal(part(server), part(device));
    return part(device);
  };
  assert.equal(mark(`10000000+x${'+0'.repeat(15)}`, '10000001+x'), false);
  assert.equal(mark(repeated('sqrt(x-100)', 15, '+'), '15*sqrt(x-100)'), true);
});

test('compareAtSamples: exact where the expression is rational, two lines where it is not', () => {
  const compare = (left, right) => compareAtSamples(parse(left), parse(right), fraction);
  assert.equal(compare('(x+1)^2', 'x^2+2x+1'), SAMPLED.EQUAL);
  assert.equal(compare('(x+1)^2', 'x^2+2x+2'), SAMPLED.DIFFERENT);
  assert.equal(compare('x/x', '1'), SAMPLED.EQUAL, 'a point where a side is undefined is skipped');
  assert.equal(compare('f(x)+1', 'f(x)+1'), SAMPLED.UNKNOWN, 'a name it cannot evaluate');
  assert.equal(compare('1/(x-x)', '1/(x-x)'), SAMPLED.UNKNOWN, 'defined nowhere');
  assert.equal(compare('2*pi', 'pi+pi'), SAMPLED.EQUAL);
  assert.equal(compare('2*pi', '6.28'), SAMPLED.DIFFERENT);
  assert.equal(compare('sqrt(-1-x^2)', 'sqrt(-1-x^2)'), SAMPLED.EQUAL, 'a complex value is a value');
  assert.equal(sampledIdentity(parse('x+x'), parse('2x'), fraction), true);
  // Fractions do not round: forty tenths are four, and a difference of one in ten million is a difference.
  assert.equal(compare(repeated('0.1*x', 40, '+'), '4x'), SAMPLED.EQUAL);
  assert.equal(compare('10000000+x', '10000001+x'), SAMPLED.DIFFERENT);
  assert.equal(compare('x^2+1e15', 'x^2+1e15+1'), SAMPLED.DIFFERENT);
  // In floating point, a difference too small to call is 'unknown', never 'equal'.
  assert.equal(compare('sqrt(x^2+1)+1e9', 'sqrt(x^2+1)+1e9+1'), SAMPLED.UNKNOWN);
  assert.equal(compare('sqrt(x^2+1)+1e3', 'sqrt(x^2+1)+1e3+1'), SAMPLED.DIFFERENT);
  // Without the exact constructor it is floating point throughout.
  assert.equal(compareAtSamples(parse('(x+1)^2'), parse('x^2+2x+1')), SAMPLED.EQUAL);
  // A tower of powers is never raised exactly (it would be enormous): it still gets an answer, at once.
  const started = performance.now();
  assert.notEqual(compare('((x^99)^99)^99', '((x^99)^99)^98'), SAMPLED.EQUAL);
  assert.ok(performance.now() - started < 1000);
});

test('inside the budget the rule is the one it always was', () => {
  assert.deepEqual(SIMPLIFY_BUDGET, { nodes: 200, chain: 10 });
  assert.deepEqual(SIMPLIFY_LIMIT, { nodes: 200, chain: 14 });
  assert.deepEqual(simplifyCost(parse('(a+b+c)*(d-e)')), { nodes: 11, chain: 3 });
  assert.equal(simplifyCost(parse('(x+1+1+1) - (x+3)')).chain, 6, 'the difference flattens both sides into one chain');
  // What simplify decides, as it did: a name is kept as written, like terms
  // are combined, nothing is expanded or factored.
  for (const [student, key, verdict] of [
    ['f(x)+2', '2+f(x)', true],
    ['x+x', '2x', true],
    ['x*x', 'x^2', true],
    ['x/2+x/2', 'x', true],
    ['sin(x)+1', '1+sin(x)', true],
    ['2(x+3)', '2x+6', false],
    ['(x+1)^2', 'x^2+2x+1', false],
    ['x^2-9', '(x-3)(x+3)', false],
    ['(x+1)/(x-1)', '(x-1)/(x+1)', false],
    ['3x+2', '2x+3', false],
    ['y=2x+3', '2x+3=y', true],
  ]) assert.equal(isAlgebraicallyEquivalent(student, key), verdict, `${student} for ${key}`);
});
