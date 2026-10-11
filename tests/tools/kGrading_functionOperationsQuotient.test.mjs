import test from 'node:test';
import assert from 'node:assert/strict';
import { all, create } from 'mathjs';

import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { sameValue } from '../../functions/shared/answerEquivalence.mjs';
import { functionOperationAnswerMatches } from '../../functions/shared/toolMath/functionOperations/functionOperationsMath.mjs';
import { buildFunctionOperationsLabReview } from '../../src/tools/shared/reviews/functionOperationsLabReview.js';

/*
 * JOB K 2d — A SIMPLIFIED QUOTIENT IS A CORRECT QUOTIENT.
 *
 * For f(x) = x² − 1 and g(x) = x² + x the lab asks the student to divide,
 * simplify and keep the excluded values. g does not divide f exactly, so the
 * grader's key is the unreduced (x² − 1)/(x² + x) — and the old comparison
 * also demanded the key's numerator and denominator degrees, so the simplified
 * (x − 1)/x was marked wrong. Any answer equal to f/g as a rational function is
 * now accepted, reduced or not, unless its denominator is 0 somewhere f/g is
 * defined (an extra hole). The excluded values are graded as before: the
 * cancelled x = −1 is still required.
 *
 * Expected verdicts are computed here with mathjs (values at points off the
 * excluded set, and where each denominator is 0), never with the module's own
 * helpers. The second half audits the worked-solution builder the same way.
 */

const math = create(all);
const TOOL_ID = 'functionOperationsLab';
const q = (fields = {}) => ({ type: TOOL_ID, questionId: 'k-fol', prompt: 'Find the quotient.', ...fields });
const grade = (question, work) => gradeToolWork({ toolId: TOOL_ID, question, work });
const failedIds = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

// x² − 1 over x² + x.
const SHARED = q({ f: { type: 'polynomial', coefficients: [1, 0, -1] }, g: { type: 'polynomial', coefficients: [1, 1, 0] }, operations: ['quotient'] });
const SAMPLE_POINTS = [-3.7, -2.2, -0.6, 0.45, 1.3, 2.9, 5.1];

// Independent oracle: equal to f/g at points where f/g is defined, and its
// own denominator (read by mathjs) is 0 nowhere f/g is defined.
// mathjs reads x(x + 1) as a call: make every implicit product explicit.
const explicitProducts = (text) => text.replace(/([\dx)])\s*\(/g, '$1*(');
const quotientOracle = (answer, { f, g, excluded }) => {
  const node = math.parse(explicitProducts(answer));
  const denominator = node.type === 'OperatorNode' && node.op === '/' ? node.args[1] : math.parse('1');
  const sameValues = SAMPLE_POINTS.every((x) => Math.abs(node.evaluate({ x }) - f(x) / g(x)) <= 1e-9 * Math.max(1, Math.abs(f(x) / g(x))));
  // Candidate zeros of the answer's denominator: every integer and half in range.
  const extraHole = Array.from({ length: 81 }, (_, index) => -10 + index / 4)
    .some((x) => Math.abs(denominator.evaluate({ x })) < 1e-12 && !excluded.includes(x));
  return sameValues && !extraHole;
};
const SHARED_MATH = { f: (x) => x * x - 1, g: (x) => x * x + x, excluded: [-1, 0] };

test('2d: the reduced and the unreduced quotient are both correct, with x = −1 and x = 0 excluded', () => {
  const correct = ['(x-1)/x', '\\frac{x-1}{x}', '(x^2-1)/(x^2+x)', '((x+1)(x-1))/(x(x+1))', '(2x-2)/(2x)', '(1-x)/(-x)', '(x - 1)/(x)'];
  for (const answer of correct) {
    const typed = answer.replace(/\\frac\{(.*)\}\{(.*)\}/, '($1)/($2)');
    assert.equal(quotientOracle(typed, SHARED_MATH), true, `oracle: ${answer} is the quotient`);
    const result = grade(SHARED, { responses: { quotient: answer }, restrictions: '-1, 0' });
    assert.equal(result.isCorrect, true, `${answer} is accepted`);
    assert.equal(result.score, 1, `${answer} full score`);
  }
});

test('2d: an answer missing x = −1 from the excluded values is still wrong — the expression half alone is right', () => {
  for (const restrictions of ['0', '', '-1', '0, 1']) {
    const result = grade(SHARED, { responses: { quotient: '(x-1)/x' }, restrictions });
    assert.equal(result.isCorrect, false, `restrictions "${restrictions}"`);
    assert.deepEqual(failedIds(result), ['quotient-restrictions'], `restrictions "${restrictions}": only the excluded values are wrong`);
  }
});

test('2d: an expression that is not f/g on its domain is still wrong', () => {
  const wrong = ['(x+1)/x', '(x-1)/(x+1)', 'x-1', '(x-1)/x+1', '(x^2+1)/(x^2+x)', '1/x',
    // equal to (x − 1)/x as a fraction, but undefined at x = 5 where f/g is defined
    '((x-1)(x-5))/(x(x-5))', '((x-1)(x-5)^2)/(x(x-5)^2)',
    // 0 (or 1) over a tiny constant: once the degree check was gone these
    // cross-multiplied to within the absolute 1e-6 of every key.
    '0/0.00000001', '0/0.0000001', '0.0000001/0.0000001',
    // x − 1/x by precedence is (x² − 1)/x, not the quotient; the slash split
    // alone would read it as (x − 1)/x.
    'x-1/x', 'x - 1/x'];
  for (const answer of wrong) {
    assert.equal(quotientOracle(answer, SHARED_MATH), false, `oracle: ${answer} is not the quotient on its domain`);
    const result = grade(SHARED, { responses: { quotient: answer }, restrictions: '-1, 0' });
    assert.equal(result.isCorrect, false, `${answer} is rejected`);
    assert.deepEqual(failedIds(result), ['quotient'], `${answer}: the expression part is the wrong one`);
  }
});

test('2d: a tiny-constant answer, a shifted pole and a precedence-breaking spelling are wrong for every key', () => {
  // Each key's f/g is evaluated by mathjs at points off its excluded values;
  // the answers below are constants or have a pole 1e-7 away from g's zero.
  const keys = [
    { f: [1, 0, -1], g: [1, 1, 0], restrictions: '-1, 0' },
    { f: [3, -2, 7], g: [1, 5], restrictions: '-5' },
    { f: [1, 1, -2], g: [1, -2, 1], restrictions: '1' },
    { f: [2, 0, 0, 5], g: [1, 0, -4], restrictions: '-2, 2' },
    { f: [1, -6], g: [2, 4], restrictions: '-2' },
  ];
  const poly = (coefficients) => coefficients.map((c, i) => `(${c})*x^${coefficients.length - 1 - i}`).join(' + ');
  for (const { f, g, restrictions } of keys) {
    const question = q({ f: { type: 'polynomial', coefficients: f }, g: { type: 'polynomial', coefficients: g }, operations: ['quotient'] });
    const fx = math.compile(poly(f));
    const gx = math.compile(poly(g));
    // The key itself is right, so only the answer can make the verdict wrong.
    assert.equal(grade(question, { responses: { quotient: `(${poly(f)})/(${poly(g)})` }, restrictions }).isCorrect, true);
    for (const answer of ['\\frac{0}{0.00000001}', '0/0.0000001', '0.0000001/0.0000001', '\\frac{0.0000001}{0.0000001}']) {
      const value = math.evaluate(answer.replace(/\\frac\{(.*)\}\{(.*)\}/, '($1)/($2)'));
      assert.ok(SAMPLE_POINTS.some((x) => Math.abs(fx.evaluate({ x }) / gx.evaluate({ x }) - value) > 1e-3), `oracle: ${answer} is not f/g`);
      const result = grade(question, { responses: { quotient: answer }, restrictions });
      assert.equal(result.isCorrect, false, `f = ${f}, g = ${g}: ${answer} is rejected`);
      assert.deepEqual(failedIds(result), ['quotient']);
    }
  }
  // g = (x − 1)², f = (x − 1)(x + 2): (x + 2)/(x − 1) is the quotient; with the
  // pole moved to 1.0000001 the answer is undefined where f/g is defined.
  const repeated = q({ f: { type: 'polynomial', coefficients: [1, 1, -2] }, g: { type: 'polynomial', coefficients: [1, -2, 1] }, operations: ['quotient'] });
  assert.equal(grade(repeated, { responses: { quotient: '\\frac{x+2}{x-1}' }, restrictions: '1' }).isCorrect, true);
  for (const answer of ['\\frac{x+2}{x-1.0000001}', '(x+2)/(x-0.9999999)']) {
    assert.equal(grade(repeated, { responses: { quotient: answer }, restrictions: '1' }).isCorrect, false, `${answer} is rejected`);
  }
  // The bracketed and MathLive spellings of the reduced answer stay right;
  // MathLive's x − \frac{1}{x} was already wrong and stays wrong.
  assert.equal(functionOperationAnswerMatches('quotient', '(x-1)/x', '(x^2 - 1)/(x^2 + x)'), true);
  assert.equal(functionOperationAnswerMatches('quotient', '-(x-1)/(-x)', '(x^2 - 1)/(x^2 + x)'), true);
  assert.equal(functionOperationAnswerMatches('quotient', 'x-1/x', '(x^2 - 1)/(x^2 + x)'), false);
  assert.equal(functionOperationAnswerMatches('quotient', 'x-\\frac{1}{x}', '(x^2 - 1)/(x^2 + x)'), false);
});

test('2d: seeded shared-factor quotients — reduced and unreduced correct, an extra hole or a changed factor wrong', () => {
  let seed = 20261010;
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const integer = (low, high) => low + Math.floor(next() * (high - low + 1));
  for (let draw = 0; draw < 60; draw += 1) {
    // f = (x − r)(ax + b), g = (x − r)(x − s): the reduced form is (ax + b)/(x − s).
    const r = integer(-4, 4);
    let s = integer(-4, 4);
    if (s === r) s += 1;
    const a = [1, -1, 2, 3][integer(0, 3)];
    let b = integer(-5, 5);
    if (a * s + b === 0) b += 1; // (ax + b) must not contain (x − s)
    const f = [a, b - a * r, -b * r];
    const g = [1, -(r + s), r * s];
    const question = q({ f: { type: 'polynomial', coefficients: f }, g: { type: 'polynomial', coefficients: g }, operations: ['quotient'] });
    const excluded = [...new Set([r, s])].sort((left, right) => left - right).join(', ');
    const reduced = `(${a}x + ${b})/(x - (${s}))`;
    const unreduced = `(${f[0]}x^2 + ${f[1]}x + ${f[2]})/(x^2 + ${g[1]}x + ${g[2]})`;
    const label = `f = ${f}, g = ${g}`;
    assert.equal(grade(question, { responses: { quotient: reduced }, restrictions: excluded }).isCorrect, true, `${label}: reduced`);
    assert.equal(grade(question, { responses: { quotient: unreduced }, restrictions: excluded }).isCorrect, true, `${label}: unreduced`);
    const hole = r + s === 0 ? 7 : -(r + s) + 9; // a value outside the excluded ones
    assert.equal(grade(question, { responses: { quotient: `((${a}x + ${b})(x - ${hole}))/((x - (${s}))(x - ${hole}))` }, restrictions: excluded }).isCorrect, false, `${label}: extra hole`);
    assert.equal(grade(question, { responses: { quotient: `(${a}x + ${b + 1})/(x - (${s}))` }, restrictions: excluded }).isCorrect, false, `${label}: changed numerator`);
    assert.equal(grade(question, { responses: { quotient: reduced }, restrictions: String(s) }).isCorrect, r === s, `${label}: the cancelled zero is required`);
  }
});

test('2d: an exact quotient accepts the unreduced fraction when the excluded values are passed, and nothing else changes', () => {
  // (x² − 1)/(x − 1) = x + 1 with x = 1 excluded: the unreduced fraction's
  // only zero is an excluded value. Without the excluded values the key x + 1
  // has no denominator to check against, so the matcher stays strict.
  assert.equal(functionOperationAnswerMatches('quotient', '(x^2-1)/(x-1)', 'x + 1', { excludedValues: [1] }), true);
  assert.equal(functionOperationAnswerMatches('quotient', '(x^2-1)/(x-1)', 'x + 1'), false);
  assert.equal(functionOperationAnswerMatches('quotient', '((x+1)(x-2))/(x-2)', 'x + 1', { excludedValues: [1] }), false, 'a hole at 2 is not excluded');
  assert.equal(functionOperationAnswerMatches('quotient', '1+x', 'x + 1'), true);
  // No real zero at all is never an extra hole.
  assert.equal(functionOperationAnswerMatches('quotient', '((x-1)(x^2+1))/(x(x^2+1))', '(x^2 - 1)/(x^2 + x)'), true);
});

test('2d: sum, difference, product and composition are compared exactly as before (sameValue)', () => {
  const pairs = [
    ['3x - 1', '3x - 1'], ['-1+3x', '3x - 1'], ['2x^{2}-3x-2', '2x^2 - 3x - 2'], ['(2x+1)(x-2)', '2x^2 - 3x - 2'],
    ['x^2 - 4x', 'x^2 - 2x'], ['(x^2-1)/(x-1)', 'x + 1'], ['x+1', 'x + 1'], ['', 'x'], ['8x^3-12x^2+6x+1', '8x^3 - 12x^2 + 6x + 1'],
  ];
  for (const operation of ['sum', 'difference', 'product', 'composition']) {
    for (const [submitted, expected] of pairs) {
      assert.equal(functionOperationAnswerMatches(operation, submitted, expected), sameValue(submitted, expected), `${operation}: ${submitted} vs ${expected}`);
    }
  }
  // The full grader: the default four with no shared factor, unchanged.
  const basic = q({ f: { type: 'linear', a: 2, h: 0, k: 1 }, g: { type: 'linear', a: 1, h: 2, k: 0 } });
  const key = { responses: { sum: '3x - 1', difference: 'x + 3', product: '2x^2 - 3x - 2', quotient: '(2x + 1)/(x - 2)' }, restrictions: '2' };
  assert.equal(grade(basic, key).isCorrect, true);
  assert.deepEqual(failedIds(grade(basic, { ...key, responses: { ...key.responses, quotient: '(2x+1)/(x+2)' } })), ['quotient']);
});

/* ------------------------------------------------------------------ */
/* worked-solution builder audit                                        */
/* ------------------------------------------------------------------ */

const OPERATION_BY_LABEL = {
  '(f + g)(x)': 'sum', '(f − g)(x)': 'difference', '(fg)(x)': 'product', '(f / g)(x)': 'quotient', '(f ∘ g)(x)': 'composition', '(g ∘ f)(x)': 'composition',
};
const RESTRICTIONS = 'Excluded x-value(s)';
const latexToMathjs = (latex) => {
  let text = latex.replace(/\^\{(\d+)\}/g, '^($1)').replace(/\\left|\\right/g, '').replace(/\\cdot/g, '*').replace(/\\div/g, '/');
  for (let pass = 0; pass < 6; pass += 1) text = text.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))');
  return explicitProducts(text.replace(/\{/g, '(').replace(/\}/g, ')'));
};
const evaluateCoefficients = (coefficients, x) => coefficients.reduce((total, value) => total * x + value, 0);
const close = (a, b) => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b));

// Every stated answer, every chain of equalities in the steps, and the
// excluded values, checked with mathjs; then the grader must accept the review.
const auditReview = (question, F, G, zeros, label) => {
  const model = buildFunctionOperationsLabReview(question);
  if (!model) return null;
  const points = SAMPLE_POINTS.filter((x) => zeros.every((zero) => Math.abs(zero - x) > 1e-3));
  const outer = question.composeOrder === 'gOfF' ? G : F;
  const inner = question.composeOrder === 'gOfF' ? F : G;
  const truth = {
    sum: (x) => evaluateCoefficients(F, x) + evaluateCoefficients(G, x),
    difference: (x) => evaluateCoefficients(F, x) - evaluateCoefficients(G, x),
    product: (x) => evaluateCoefficients(F, x) * evaluateCoefficients(G, x),
    quotient: (x) => evaluateCoefficients(F, x) / evaluateCoefficients(G, x),
    composition: (x) => evaluateCoefficients(outer, evaluateCoefficients(inner, x)),
  };
  const responses = {};
  let restrictions = '';
  for (const item of model.items) {
    const typed = /^\$([^$]+)\$$/.exec(item.value)?.[1] ?? '';
    if (item.label === RESTRICTIONS) {
      restrictions = typed;
      const stated = typed ? typed.split(',').map(Number) : [];
      assert.deepEqual(stated, zeros, `${label}: the excluded values are exactly the real zeros of g`);
      continue;
    }
    const operation = OPERATION_BY_LABEL[item.label];
    responses[operation] = typed;
    const node = math.parse(latexToMathjs(typed));
    for (const x of points) assert.ok(close(node.evaluate({ x }), truth[operation](x)), `${label}: ${operation} ${typed} at ${x}`);
  }
  for (const step of [...model.steps, model.why || '']) {
    for (const segment of step.match(/\$[^$]+\$/g) || []) {
      const sides = segment.slice(1, -1).split('=').map((side) => side.trim())
        // a side naming f or g (outside a LaTeX command) is a label, not a polynomial
        .filter((side) => /x/.test(side) && !/[fg<]/.test(side.replace(/\\[a-z]+/g, '')));
      if (sides.length < 2) continue;
      const nodes = sides.map((side) => math.parse(latexToMathjs(side)));
      for (const x of points) {
        const values = nodes.map((node) => node.evaluate({ x }));
        assert.ok(values.every((value) => close(value, values[0])), `${label}: the steps chain at x = ${x}: ${segment}`);
      }
    }
  }
  const result = grade(question, { responses, restrictions });
  assert.equal(result.isCorrect, true, `${label}: the grader accepts ${JSON.stringify(responses)} / ${restrictions}`);
  return model;
};

test('builder audit: seeded draws, including shared factors, both composition orders, decimals and negatives', () => {
  let seed = 4242;
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const integer = (low, high) => low + Math.floor(next() * (high - low + 1));
  const pick = (values) => values[integer(0, values.length - 1)];
  const multiply = (left, right) => {
    const out = Array(left.length + right.length - 1).fill(0);
    left.forEach((a, i) => right.forEach((b, j) => { out[i + j] += a * b; }));
    return out;
  };
  let reviewed = 0;
  let cancelled = 0;
  for (let draw = 0; draw < 250; draw += 1) {
    const r = pick([integer(-4, 4), 0.5, -1.5]);
    const s = integer(-4, 4);
    const shared = next() < 0.5;
    const F = shared
      ? multiply([1, -r], [pick([1, -2, 0.5]), integer(-5, 5)])
      : [pick([1, -1, 2, 0.5]), integer(-6, 6), pick([integer(-6, 6), 0.25])];
    const G = pick([[pick([1, 2, -1]), -pick([1, 2, -1]) * s], multiply([1, -r], [1, -s]), [pick([3, -0.5])], [1, 0, pick([1, 4])]]);
    // Real zeros of G, by construction.
    const zeros = G.length === 1 ? [] : G.length === 2 ? [-G[1] / G[0] || 0]
      : G[1] === 0 && G[2] > 0 ? [] : [...new Set([r, s])].sort((a, b) => a - b);
    const question = q({
      f: { type: 'polynomial', coefficients: F },
      g: { type: 'polynomial', coefficients: G },
      operations: pick([undefined, ['quotient'], ['sum', 'difference', 'product', 'quotient', 'composition'], ['composition']]),
      composeOrder: pick(['fOfG', 'gOfF']),
    });
    const model = auditReview(question, F, G, zeros, `draw ${draw}: f = ${F}, g = ${G}`);
    if (model) reviewed += 1;
    if (model?.steps.some((step) => step.includes('Cancel the common factor'))) cancelled += 1;
  }
  assert.ok(reviewed >= 200, `most draws are reviewed (${reviewed})`);
  assert.ok(cancelled >= 10, `shared factors are reviewed, not dropped (${cancelled})`);
});

test('builder audit: a repeated cancelled factor and a cancelled quadratic factor say only what is true', () => {
  // (x − 1)(x − 2) / (x − 1)²: one (x − 1) cancels; the answer is still undefined at 1.
  const repeated = q({ f: { type: 'polynomial', coefficients: [1, -3, 2] }, g: { type: 'polynomial', coefficients: [1, -2, 1] }, operations: ['quotient'] });
  const model = auditReview(repeated, [1, -3, 2], [1, -2, 1], [1], 'repeated');
  assert.equal(model.items[0].value, '$\\frac{x - 2}{x - 1}$');
  assert.ok(!model.steps.some((step) => /stays? excluded/.test(step)), 'x = 1 is not a removed hole: (x − 2)/(x − 1) is undefined there too');
  // (x⁴ + x²)/(x³ − x² + x − 1) = x²/(x − 1): the factor x² + 1 cancels, no zero is removed.
  const quadratic = q({ f: { type: 'polynomial', coefficients: [1, 0, 1, 0, 0] }, g: { type: 'polynomial', coefficients: [1, -1, 1, -1] }, operations: ['quotient'], restrictions: [1] });
  const quadraticModel = auditReview(quadratic, [1, 0, 1, 0, 0], [1, -1, 1, -1], [1], 'quadratic factor');
  assert.equal(quadraticModel.items[0].value, '$\\frac{x^{2}}{x - 1}$');
  assert.ok(!quadraticModel.steps.some((step) => /\s{2}stays?|^\s*stays?/.test(step) || /stays? excluded/.test(step)), 'no sentence about a cancelled zero that does not exist');
});

test('builder audit: an approximation is never stated as an exact value', () => {
  // 3(x + 3)² − 2.5 = 0 at x = −3 ± √(5/6). The review used to state
  // −3.91287093 and −2.08712907 as the excluded values (and factor g with them).
  const irrational = q({ f: { type: 'linear', a: -2, h: -1, k: 0.25 }, g: { type: 'quadratic', a: 3, h: -3, k: -2.5 }, operations: ['quotient'] });
  assert.equal(buildFunctionOperationsLabReview(irrational), null);
  // ±√(2/3) = ±0.816496580927726…: 0.81649658 is within 1e-9 of it, and was stated.
  assert.equal(buildFunctionOperationsLabReview(q({ f: { type: 'linear', a: 1, h: 0, k: 0 }, g: { type: 'quadratic', a: 3, h: 0, k: -2 }, operations: ['quotient'] })), null);
  // (3x + 100)/3 = x + 100/3: the review used to state x + 33.33333333.
  assert.equal(buildFunctionOperationsLabReview(q({ f: { type: 'polynomial', coefficients: [3, 100] }, g: { type: 'polynomial', coefficients: [3] }, operations: ['quotient'] })), null);
  // A terminating decimal is still stated: (x + 2.5)/(2x − 1).
  const exact = q({ f: { type: 'polynomial', coefficients: [1, 2.5] }, g: { type: 'polynomial', coefficients: [2, -1] }, operations: ['quotient'] });
  assert.ok(auditReview(exact, [1, 2.5], [2, -1], [0.5], 'terminating decimals'));
});
