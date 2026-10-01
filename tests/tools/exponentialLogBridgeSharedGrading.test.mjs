import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import exponentialLogGrader from '../../functions/shared/serverGrading/tools/exponentialLogBridge.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/exponentialLogBridge.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { nearlyEqual } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  composeForwardAfterInverse,
  composeInverseAfterForward,
  equivalentExpLogValues,
  inversePairFeatures,
  normalizeExponentialSpec,
  solveExponentialLinearExponent,
  solveLogLinearArgument,
  transformedExponentialValue,
} from '../../functions/shared/toolMath/exponentialLog/exponentialLogMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * EXPONENTIAL ↔ LOG BRIDGE IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts for every view — and
 * that verdict must be the one the bridge's old inline Check reached.
 */

const COMPONENT = 'src/tools/exponentialLog/ExponentialLogBridge.jsx';
const code = executableSource(fs.readFileSync(COMPONENT, 'utf8'));

const TYPE = 'exponentialLogBridge';
const q = (fields = {}) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(exponentialLogGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces a tool response for the server');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  if (!browser.graded) assert.equal(server.reason, browser.reason, 'ungraded reason');
  return { ...browser, mode: server.mode, serverReason: server.reason };
};

const partIds = (result) => result.parts.map((part) => part.id);
const failedIds = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

const componentRouting = (() => {
  const body = region(code, 'export default function ExponentialLogBridge', '\nfunction ', 'router');
  const fallback = body.match(/const mode = questionData\.mode \|\| '(\w+)';/)?.[1];
  const routed = [...body.matchAll(/if \(mode === '(\w+)'\) return </g)].map((match) => match[1]);
  assert.ok(fallback, 'router reads questionData.mode with a default');
  assert.equal(routed.length, 4, 'router has its four explicit views');
  return { fallback, routed };
})();
const componentMode = (question) => {
  const mode = question.mode || componentRouting.fallback;
  return componentRouting.routed.includes(mode) ? mode : componentRouting.fallback;
};

test('every view the bridge routes to is declared shared-server, contract v1, default Equivalent Forms', () => {
  assert.equal(GRADING_MANIFEST.exponentialLogBridge, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, componentRouting.fallback);
  assert.deepEqual(Object.keys(declaration.modes).sort(), [componentRouting.fallback, ...componentRouting.routed].sort());
  for (const [mode, entry] of Object.entries(declaration.modes)) {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER, `${mode} is shared-server`);
    assert.equal(entry.blocker, null);
  }
  assert.deepEqual(Object.keys(exponentialLogGrader.modeGraders).sort(), Object.keys(declaration.modes).sort());
  assert.deepEqual([...exponentialLogGrader.problems], []);
});

test('declared mode resolution reproduces the screen routing, including padded, mis-cased and non-string modes', () => {
  const samples = [
    {}, { mode: '' }, { mode: null }, { mode: 'equivalentForms' }, { mode: 'solveExponential' }, { mode: 'solveLogarithmic' },
    { mode: 'inverse' }, { mode: 'composition' }, { mode: 'unknownView' }, { mode: ' inverse ' }, { mode: 'Inverse' },
    { mode: 'solveexponential' }, { mode: 3 }, { mode: ['inverse'] }, { mode: { toString: () => 'inverse' } }, { mode: 'constructor' },
  ];
  for (const question of samples) {
    assert.equal(resolveToolMode(declaration, question), componentMode(question), `mode ${JSON.stringify(question.mode)}`);
  }
  const padded = grade(q({ mode: ' composition ' }), { logAnswer: '3', expAnswer: '8' });
  assert.equal(padded.mode, 'equivalentForms');
  assert.equal(padded.isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* the component is wired to the shared grader and nothing else        */
/* ------------------------------------------------------------------ */

const VIEWS = {
  equivalentForms: 'EquivalentForms',
  solveExponential: 'SolveExponential',
  solveLogarithmic: 'SolveLogarithmic',
  inverse: 'InverseMode',
  composition: 'CompositionMode',
};

test('every view grades its Check through the shared grader, reports the same work, and sends no answer in metadata', () => {
  assert.match(code, /import exponentialLogGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/exponentialLogBridge\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  for (const [mode, name] of Object.entries(VIEWS)) {
    const body = region(code, `function ${name}(`, '\nfunction ', name);
    const check = region(body, 'const check = () => {', '\n  };', `${name} check`);
    assert.match(body, /const work = \{[^}]+\};/, `${name} builds work at render scope`);
    assert.match(body, /useReportToolWork\(work\);/, `${name} reports live work`);
    assert.match(check, /const result = gradeToolCheck\(exponentialLogGrader, questionData, work\);/, `${name} grades through the shared grader`);
    // Only the mode and the shared parts ride along: the old inverse metadata
    // carried sampleX and composition carried x and y — each an expected answer.
    assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode: '(\w+)', parts: result\.parts \}\);/, `${name} submits the shared verdict, its work and only mode + parts`);
    assert.equal(check.match(/mode: '(\w+)'/)[1], mode, `${name} reports the mode the declaration grades it as`);
    assert.doesNotMatch(check, /checks|matchesNumber|nearlyEqual|===|expected|solution|features\.|sampleX/, `${name} computes no verdict of its own`);
  }
});

test('the inline verdict code is gone from the component', () => {
  assert.doesNotMatch(code, /matchesNumber|nearlyEqual|solveExponentialLinearExponent|solveLogLinearArgument|composeInverseAfterForward|composeForwardAfterInverse/);
  assert.doesNotMatch(code, /isCorrect: checks|checks\.every/);
});

/* ------------------------------------------------------------------ */
/* the old inline Check, as a parity oracle                            */
/* ------------------------------------------------------------------ */

// Verbatim from ExponentialLogBridge.jsx before the shared grader.
const matchesNumber = (answer, expected, tolerance = 0.01) => `${answer}`.trim() !== '' && nearlyEqual(answer, expected, tolerance);
const expSpec = (question) => normalizeExponentialSpec(question.function || question.exponential || {
  a: question.a ?? 1, base: question.base ?? 2, h: question.h ?? 0, k: question.k ?? 0,
});
const legacyCheck = (question, work) => {
  const mode = componentMode(question);
  let checks;
  if (mode === 'solveExponential') {
    const solution = solveExponentialLinearExponent({ base: Number(question.equation?.base ?? question.base ?? 2), m: Number(question.equation?.m ?? 2), c: Number(question.equation?.c ?? -1), rhs: Number(question.equation?.rhs ?? 16) });
    checks = [matchesNumber(work.xAnswer, solution.x, 0.01), matchesNumber(work.exponentAnswer, solution.exponentValue, 0.01)];
  } else if (mode === 'solveLogarithmic') {
    const solution = solveLogLinearArgument({ base: Number(question.equation?.base ?? question.base ?? 3), m: Number(question.equation?.m ?? 2), c: Number(question.equation?.c ?? 1), result: Number(question.equation?.result ?? 2) });
    checks = [matchesNumber(work.argumentAnswer, solution.argumentValue, 0.01), matchesNumber(work.xAnswer, solution.x, 0.01)];
  } else if (mode === 'inverse') {
    const spec = expSpec(question); const sampleX = Number(question.x ?? 2); const features = inversePairFeatures(spec);
    checks = [matchesNumber(work.inverseAnswer, sampleX, 0.01), matchesNumber(work.asymptote, features.logarithmVerticalAsymptote, 0.01), work.domainSide === features.logarithmDomainSide];
  } else if (mode === 'composition') {
    const spec = expSpec(question); const x = Number(question.x ?? 1);
    const y = Number(question.y ?? transformedExponentialValue(spec, Number(question.inverseSeedX ?? x + 1)));
    checks = [matchesNumber(work.inverseAfterForward, composeInverseAfterForward(spec, x), 0.01), matchesNumber(work.forwardAfterInverse, composeForwardAfterInverse(spec, y), 0.01)];
  } else {
    const values = equivalentExpLogValues({ base: Number(question.base ?? 2), exponent: Number(question.exponent ?? 3) });
    checks = [matchesNumber(work.logAnswer, values.exponent), matchesNumber(work.expAnswer, values.value)];
  }
  return { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length };
};

const assertLegacyParity = (question, work, label) => {
  const result = grade(question, work);
  const legacy = legacyCheck(question, work);
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isCorrect, legacy.isCorrect, `${label}: isCorrect matches the old Check`);
  assert.equal(result.score, legacy.score, `${label}: score matches the old Check`);
  return result;
};

/* ------------------------------------------------------------------ */
/* equivalentForms                                                     */
/* ------------------------------------------------------------------ */

test('equivalentForms: both notations, half credit each, blanks incomplete, defaults 2³', () => {
  const question = q({ base: 5, exponent: -2 });
  const correct = assertLegacyParity(question, { logAnswer: '-2', expAnswer: '0.04' }, 'correct');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['logarithm', 'power']);
  assert.equal(assertLegacyParity(question, { logAnswer: ' -2 ', expAnswer: '.045' }, 'tolerance').isCorrect, true, 'within 0.01');
  const half = assertLegacyParity(question, { logAnswer: '2', expAnswer: '0.04' }, 'half');
  assert.deepEqual(failedIds(half), ['logarithm']);
  assert.equal(half.score, 0.5);
  const incomplete = assertLegacyParity(question, { logAnswer: '-2', expAnswer: '' }, 'incomplete');
  assert.equal(incomplete.isComplete, false);
  assert.equal(incomplete.score, 0.5);
  // Unauthored: 2³ = 8.
  const defaults = grade(q({}), { logAnswer: '3', expAnswer: '8' });
  assert.equal(defaults.mode, 'equivalentForms');
  assert.equal(defaults.isCorrect, true);
});

test('typed numbers are read with Number(), exactly as the bridge read them', () => {
  // The bridge never accepted a fraction or the U+2212 minus, so neither does
  // its grader — and Number()'s own spellings (1e1, 0x10) still read.
  const question = q({ base: 2, exponent: -1 });
  assert.equal(assertLegacyParity(question, { logAnswer: '-1', expAnswer: '1/2' }, 'fraction').isCorrect, false);
  assert.equal(assertLegacyParity(question, { logAnswer: '−1', expAnswer: '0.5' }, 'unicode minus').isCorrect, false);
  assert.equal(assertLegacyParity(q({ base: 2, exponent: 4 }), { logAnswer: '4', expAnswer: '0x10' }, 'hex').isCorrect, true);
  assert.equal(assertLegacyParity(q({ base: 10, exponent: 1 }), { logAnswer: '1', expAnswer: '1e1' }, 'exponent').isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* solveExponential / solveLogarithmic                                 */
/* ------------------------------------------------------------------ */

test('solveExponential: x and the exponent value, defaults 2^(2x − 1) = 16', () => {
  const question = q({ mode: 'solveExponential', equation: { base: 3, m: 2, c: 1, rhs: 81 } });
  const correct = assertLegacyParity(question, { xAnswer: '1.5', exponentAnswer: '4' }, 'correct');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['x', 'exponent']);
  const half = assertLegacyParity(question, { xAnswer: '2', exponentAnswer: '4' }, 'half');
  assert.deepEqual(failedIds(half), ['x']);
  assert.equal(half.score, 0.5);
  // A flat `base` stands in when the equation omits one.
  assert.equal(grade(q({ mode: 'solveExponential', base: 10, equation: { m: 1, c: 0, rhs: 1000 } }), { xAnswer: '3', exponentAnswer: '3' }).isCorrect, true);
  // Unauthored: 2^(2x − 1) = 16 → exponent 4, x = 2.5.
  assert.equal(grade(q({ mode: 'solveExponential' }), { xAnswer: '2.5', exponentAnswer: '4' }).isCorrect, true);
  // A non-positive right side has no real solution: graded, never correct.
  const none = assertLegacyParity(q({ mode: 'solveExponential', equation: { base: 2, m: 1, c: 0, rhs: -4 } }), { xAnswer: '2', exponentAnswer: '2' }, 'no solution');
  assert.equal(none.graded, true);
  assert.equal(none.score, 0);
});

test('solveLogarithmic: the argument and x, with its own base-3 default', () => {
  const question = q({ mode: 'solveLogarithmic', equation: { base: 2, m: 3, c: -1, result: 3 } });
  const correct = assertLegacyParity(question, { argumentAnswer: '8', xAnswer: '3' }, 'correct');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['argument', 'x']);
  assert.equal(assertLegacyParity(question, { argumentAnswer: '8', xAnswer: '' }, 'incomplete').isComplete, false);
  // Unauthored: log₃(2x + 1) = 2 → argument 9, x = 4. Base 2 would give 4, 1.5.
  assert.equal(grade(q({ mode: 'solveLogarithmic' }), { argumentAnswer: '9', xAnswer: '4' }).isCorrect, true);
  assert.equal(grade(q({ mode: 'solveLogarithmic' }), { argumentAnswer: '4', xAnswer: '1.5' }).score, 0);
});

/* ------------------------------------------------------------------ */
/* inverse / composition                                               */
/* ------------------------------------------------------------------ */

test('inverse: the inverse value, the asymptote and the domain side, a third each', () => {
  const question = q({ mode: 'inverse', function: { a: -2, base: 3, h: 1, k: 4 }, x: 3 });
  const correct = assertLegacyParity(question, { inverseAnswer: '3', asymptote: '4', domainSide: 'less' }, 'correct');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['inverse-value', 'asymptote', 'domain-side']);
  const twoThirds = assertLegacyParity(question, { inverseAnswer: '3', asymptote: '4', domainSide: 'greater' }, 'side');
  assert.deepEqual(failedIds(twoThirds), ['domain-side']);
  assert.equal(twoThirds.score, 2 / 3);
  const unchosen = assertLegacyParity(question, { inverseAnswer: '3', asymptote: '4', domainSide: '' }, 'unchosen');
  assert.equal(unchosen.isComplete, false, 'the "Choose…" placeholder is not an answer');

  // `exponential` and flat fields are the same spec.
  assert.equal(grade(q({ mode: 'inverse', exponential: { a: -2, base: 3, h: 1, k: 4 }, x: 3 }), { inverseAnswer: '3', asymptote: '4', domainSide: 'less' }).isCorrect, true);
  assert.equal(grade(q({ mode: 'inverse', a: -2, base: 3, h: 1, k: 4, x: 3 }), { inverseAnswer: '3', asymptote: '4', domainSide: 'less' }).isCorrect, true);
  // Unauthored: f(x) = 2^x, x = 2, asymptote x = 0, domain x > 0.
  assert.equal(grade(q({ mode: 'inverse' }), { inverseAnswer: '2', asymptote: '0', domainSide: 'greater' }).isCorrect, true);
});

test('composition: both orders return the start, with y defaulting to f(x + 1) or f(inverseSeedX)', () => {
  const question = q({ mode: 'composition', function: { a: 2, base: 2, h: 0, k: 3 }, x: 1, y: 7 });
  const correct = assertLegacyParity(question, { inverseAfterForward: '1', forwardAfterInverse: '7' }, 'correct');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['inverse-after-forward', 'forward-after-inverse']);
  assert.equal(assertLegacyParity(question, { inverseAfterForward: '1', forwardAfterInverse: '5' }, 'half').score, 0.5);

  // Unauthored: f(x) = 2^x, x = 1, y = f(2) = 4.
  assert.equal(grade(q({ mode: 'composition' }), { inverseAfterForward: '1', forwardAfterInverse: '4' }).isCorrect, true);
  // inverseSeedX 3 → y = f(3) = 8.
  assert.equal(grade(q({ mode: 'composition', inverseSeedX: 3 }), { inverseAfterForward: '1', forwardAfterInverse: '8' }).isCorrect, true);
  // A y outside the logarithm's domain composes to NaN: graded, never right.
  const outside = assertLegacyParity(q({ mode: 'composition', function: { a: 1, base: 2, h: 0, k: 3 }, y: 1 }), { inverseAfterForward: '1', forwardAfterInverse: '1' }, 'outside');
  assert.deepEqual(failedIds(outside), ['forward-after-inverse']);
});

/* ------------------------------------------------------------------ */
/* tampering, malformed work, bounds                                   */
/* ------------------------------------------------------------------ */

test('injected verdicts and keys are dropped and never change the verdict', () => {
  const tampered = { logAnswer: '0', expAnswer: '0', isCorrect: true, score: 1, verdict: 'correct', expected: { logAnswer: '3' }, solution: { x: 3 }, partialCredit: 100 };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['expected', 'isCorrect', 'partialCredit', 'score', 'solution', 'verdict']);
  const result = grade(q({}), tampered);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
});

test('wrong types read as blank (or no choice) and never crash the grader', () => {
  const result = grade(q({ mode: 'inverse' }), { inverseAnswer: ['2'], asymptote: { value: 0 }, domainSide: ['greater'] });
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, false);
  assert.equal(result.isComplete, false);
  assert.equal(result.score, 0);
  assert.equal(grade(q({ mode: 'solveExponential' }), { xAnswer: 2.5, exponentAnswer: 4 }).isCorrect, true, 'a number reads like its text');
  assert.equal(grade(q({ mode: 'solveExponential' }), { xAnswer: true, exponentAnswer: null }).score, 0);
});

test('non-object, oversize and unrenderable questions are not graded, on either path', () => {
  for (const work of [null, 'answer', 8, ['3', '8']]) {
    const result = grade(q({}), work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.score, 0);
  }
  const oversize = grade(q({}), { logAnswer: '3', expAnswer: '8', scratch: Array.from({ length: 30 }, () => 'x'.repeat(999)) });
  assert.equal(oversize.graded, false);
  assert.equal(oversize.serverReason, 'oversize-response');
  // Base 1, a = 0, m = 0: the bridge throws rendering these, so there is no
  // screen to grade, and the grader says the question is the reason.
  for (const question of [q({ base: 1 }), q({ mode: 'solveExponential', equation: { base: 2, m: 0, c: 0, rhs: 4 } }), q({ mode: 'inverse', function: { a: 0 } }), q({ mode: 'composition', base: -2 })]) {
    const result = grade(question, { logAnswer: '3', expAnswer: '8' });
    assert.equal(result.graded, false, JSON.stringify(question));
    assert.equal(result.reason, 'invalid-question');
  }
});

test('realistic maximal work stays inside the response bounds with nothing dropped', () => {
  const long = '1.0000000000000000000000000000000';
  const works = [
    { logAnswer: long, expAnswer: long },
    { xAnswer: long, exponentAnswer: long },
    { argumentAnswer: long, xAnswer: long },
    { inverseAnswer: long, asymptote: long, domainSide: 'greater' },
    { inverseAfterForward: long, forwardAfterInverse: long },
  ];
  for (const work of works) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, []);
    assert.equal(bounded.truncated, false);
    assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 50);
  }
  assert.equal(grade(q({ mode: 'composition' }), { inverseAfterForward: long, forwardAfterInverse: '4' }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* discrimination: the key decides                                     */
/* ------------------------------------------------------------------ */

test('correct work fails against a question whose key was altered', () => {
  const cases = [
    [q({ base: 5, exponent: -2 }), q({ base: 5, exponent: -3 }), { logAnswer: '-2', expAnswer: '0.04' }],
    [q({ mode: 'solveExponential', equation: { base: 3, m: 2, c: 1, rhs: 81 } }), q({ mode: 'solveExponential', equation: { base: 3, m: 2, c: 1, rhs: 27 } }), { xAnswer: '1.5', exponentAnswer: '4' }],
    [q({ mode: 'solveLogarithmic', equation: { base: 2, m: 3, c: -1, result: 3 } }), q({ mode: 'solveLogarithmic', equation: { base: 2, m: 3, c: 2, result: 3 } }), { argumentAnswer: '8', xAnswer: '3' }],
    [q({ mode: 'inverse', function: { a: -2, base: 3, h: 1, k: 4 }, x: 3 }), q({ mode: 'inverse', function: { a: 2, base: 3, h: 1, k: 4 }, x: 3 }), { inverseAnswer: '3', asymptote: '4', domainSide: 'less' }],
    [q({ mode: 'composition', function: { a: 2, base: 2, h: 0, k: 3 }, x: 1, y: 7 }), q({ mode: 'composition', function: { a: 2, base: 2, h: 0, k: 3 }, x: 2, y: 7 }), { inverseAfterForward: '1', forwardAfterInverse: '7' }],
  ];
  for (const [question, altered, work] of cases) {
    assert.equal(grade(question, work).isCorrect, true, `${question.mode || 'equivalentForms'} control`);
    const result = grade(altered, work);
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false, `${question.mode || 'equivalentForms'} against an altered key`);
  }
});

/* ------------------------------------------------------------------ */
/* tolerance ceiling and which authored field wins                     */
/* ------------------------------------------------------------------ */

test('the 0.01 tolerance is a ceiling: 0.015 off is wrong, as it was on screen', () => {
  // 5⁻² = 0.04. 0.0499 is inside 0.01; 0.055 is 0.015 off and must fail.
  const question = q({ base: 5, exponent: -2 });
  assert.equal(assertLegacyParity(question, { logAnswer: '-2', expAnswer: '0.0499' }, 'inside').isCorrect, true);
  const outside = assertLegacyParity(question, { logAnswer: '-2', expAnswer: '0.055' }, 'outside');
  assert.deepEqual(failedIds(outside), ['power']);
  // log₃(81) = 4 → x = 1.5; 1.515 is 0.015 off.
  const solve = q({ mode: 'solveExponential', equation: { base: 3, m: 2, c: 1, rhs: 81 } });
  assert.deepEqual(failedIds(assertLegacyParity(solve, { xAnswer: '1.515', exponentAnswer: '4' }, 'x outside')), ['x']);
  assert.deepEqual(failedIds(assertLegacyParity(solve, { xAnswer: '1.5', exponentAnswer: '3.985' }, 'exponent outside')), ['exponent']);
});

test('an authored equation base wins over a flat base, and `function` wins over `exponential` and the flat fields', () => {
  // equation.base 2 (not the flat 10): 2^x = 8 → exponent 3, x 3.
  const solve = q({ mode: 'solveExponential', base: 10, equation: { base: 2, m: 1, c: 0, rhs: 8 } });
  assert.equal(assertLegacyParity(solve, { xAnswer: '3', exponentAnswer: '3' }, 'equation base').isCorrect, true);
  assert.equal(grade(solve, { xAnswer: '0.903', exponentAnswer: '0.903' }).score, 0, 'the flat base is not the equation');
  const solveLog = q({ mode: 'solveLogarithmic', base: 10, equation: { base: 2, m: 1, c: 0, result: 3 } });
  assert.equal(assertLegacyParity(solveLog, { argumentAnswer: '8', xAnswer: '8' }, 'log equation base').isCorrect, true);

  // f = −2·3^(x−1) + 4 from `function`; `exponential` and flat fields are ignored.
  const both = { function: { a: -2, base: 3, h: 1, k: 4 }, exponential: { a: 1, base: 2, h: 0, k: 0 }, a: 1, base: 2, h: 0, k: -3 };
  const inverse = q({ mode: 'inverse', ...both, x: 3 });
  assert.equal(assertLegacyParity(inverse, { inverseAnswer: '3', asymptote: '4', domainSide: 'less' }, 'function wins').isCorrect, true);
  assert.deepEqual(failedIds(grade(inverse, { inverseAnswer: '3', asymptote: '0', domainSide: 'greater' })), ['asymptote', 'domain-side']);
  // `exponential` wins over the flat fields when there is no `function`.
  const exponentialOnly = q({ mode: 'inverse', exponential: { a: 1, base: 2, h: 0, k: 0 }, a: -2, base: 3, h: 1, k: 4, x: 3 });
  assert.equal(assertLegacyParity(exponentialOnly, { inverseAnswer: '3', asymptote: '0', domainSide: 'greater' }, 'exponential wins').isCorrect, true);
  // Composition reads the same spec: f(x) = 2·2^x + 3 from `function`, y = 7.
  const composition = q({ mode: 'composition', function: { a: 2, base: 2, h: 0, k: 3 }, exponential: { a: 1, base: 2, h: 0, k: 0 }, x: 1, y: 7 });
  assert.equal(assertLegacyParity(composition, { inverseAfterForward: '1', forwardAfterInverse: '7' }, 'composition spec').isCorrect, true);
  assert.equal(grade(q({ mode: 'composition', function: { a: 2, base: 2, h: 0, k: 3 }, exponential: { a: 1, base: 2, h: 0, k: 0 }, x: 1, y: 2 }), { inverseAfterForward: '1', forwardAfterInverse: '2' }).score, 0.5, 'y = 2 is outside this inverse\'s domain (y > 3)');
});

/* ------------------------------------------------------------------ */
/* the submitted work holds every input the verdict depends on         */
/* ------------------------------------------------------------------ */

// The server can only reproduce the screen's verdict if the work each view
// submits carries every input that verdict reads. So: each view's `work` is
// exactly its own input state, and the grader needs every one of those fields
// (drop any one from correct work and the verdict, and completeness, are lost).
test('each view submits exactly its on-screen inputs, and the grader needs every one of them', () => {
  const correct = {
    equivalentForms: [q({ base: 5, exponent: -2 }), { logAnswer: '-2', expAnswer: '0.04' }],
    solveExponential: [q({ mode: 'solveExponential', equation: { base: 3, m: 2, c: 1, rhs: 81 } }), { xAnswer: '1.5', exponentAnswer: '4' }],
    solveLogarithmic: [q({ mode: 'solveLogarithmic', equation: { base: 2, m: 3, c: -1, result: 3 } }), { argumentAnswer: '8', xAnswer: '3' }],
    inverse: [q({ mode: 'inverse', function: { a: -2, base: 3, h: 1, k: 4 }, x: 3 }), { inverseAnswer: '3', asymptote: '4', domainSide: 'less' }],
    composition: [q({ mode: 'composition', function: { a: 2, base: 2, h: 0, k: 3 }, x: 1, y: 7 }), { inverseAfterForward: '1', forwardAfterInverse: '7' }],
  };
  for (const [mode, name] of Object.entries(VIEWS)) {
    const body = region(code, `function ${name}(`, '\nfunction ', name);
    const fields = body.match(/const work = \{ ([^}]+) \};/)[1].split(',').map((field) => field.trim());
    const [question, work] = correct[mode];
    assert.deepEqual([...fields].sort(), Object.keys(work).sort(), `${name} submits exactly the fields its grader reads`);
    for (const field of fields) {
      assert.match(body, new RegExp(`const \\[${field}, set\\w+\\] = usePersistentToolState\\('${field}',`), `${name}: ${field} is the student's own input state`);
    }
    assert.equal(grade(question, work).isCorrect, true, `${mode} control`);
    for (const field of fields) {
      const rest = { ...work };
      delete rest[field];
      const without = grade(question, rest);
      assert.equal(without.isCorrect, false, `${mode}: the verdict depends on ${field}`);
      assert.equal(without.isComplete, false, `${mode}: ${field} is required for completeness`);
    }
  }
});
