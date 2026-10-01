import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import functionOperationsGrader from '../../functions/shared/serverGrading/tools/functionOperationsLab.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/functionOperationsLab.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  deriveFunctionOperations,
  functionOperationAnswerMatches,
  normalizeFunctionOperations,
  parseExcludedValues,
  restrictionsMatch,
} from '../../functions/shared/toolMath/functionOperations/functionOperationsMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * FUNCTION OPERATIONS LAB IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts — and that verdict
 * must be the one the lab's old inline Check reached, except where the old
 * Check read a blank excluded-values box as "x = 0" (documented below).
 */

const COMPONENT = 'src/tools/functionOperations/FunctionOperationsLab.jsx';
const code = executableSource(fs.readFileSync(COMPONENT, 'utf8'));

const TYPE = 'functionOperationsLab';
const q = (fields = {}) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(functionOperationsGrader, question, work);
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

// f(x) = 2x + 1, g(x) = x − 2. The key: sum 3x − 1, difference x + 3,
// product 2x² − 3x − 2, quotient (2x + 1)/(x − 2) excluding 2,
// f∘g = 2x − 3, g∘f = 2x − 1.
const F = { type: 'linear', a: 2, h: 0, k: 1 };
const G = { type: 'linear', a: 1, h: 2, k: 0 };
const BASIC = q({ f: F, g: G });
const BASIC_KEY = {
  responses: { sum: '3x - 1', difference: 'x + 3', product: '2x^2 - 3x - 2', quotient: '(2x + 1)/(x - 2)' },
  restrictions: '2',
};

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

test('the lab has one view, declared shared-server, contract v1', () => {
  assert.equal(GRADING_MANIFEST.functionOperationsLab, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.deepEqual(Object.keys(declaration.modes), ['functionOperations']);
  assert.equal(declaration.defaultMode, 'functionOperations');
  assert.equal(declaration.modes.functionOperations.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(declaration.modes.functionOperations.blocker, null);
  assert.deepEqual(Object.keys(functionOperationsGrader.modeGraders), ['functionOperations']);
  assert.deepEqual([...functionOperationsGrader.problems], []);
});

test('mode resolution: the component never reads a mode, so every question resolves to the one view', () => {
  const body = region(code, 'export default function FunctionOperationsLab', '\n}\n', 'component');
  assert.doesNotMatch(body, /\bmode\s*===|questionData\.mode|questionData\[['"]mode/, 'the lab does not route on questionData.mode');
  for (const mode of [undefined, '', 'functionOperations', 'sum', 'quotient', ' functionOperations ', 'default', 7, ['sum'], 'constructor']) {
    assert.equal(resolveToolMode(declaration, q({ mode })), 'functionOperations', `mode ${JSON.stringify(mode)}`);
  }
  const anyMode = grade(q({ f: F, g: G, mode: 'quotient' }), BASIC_KEY);
  assert.equal(anyMode.mode, 'functionOperations');
  assert.equal(anyMode.isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* the component is wired to the shared grader and nothing else        */
/* ------------------------------------------------------------------ */

test('the Check grades through the shared grader and reports the same work it submits', () => {
  assert.match(code, /import functionOperationsGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/functionOperationsLab\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  const body = region(code, 'export default function FunctionOperationsLab', '\n  return (', 'component body');
  assert.match(body, /const work = \{ responses, restrictions: restrictionResponse \};/, 'work is built at render scope from the two inputs');
  assert.match(body, /useReportToolWork\(work\);/, 'live work is reported');
  const check = region(body, 'const check = () => {', '\n  };', 'check');
  assert.match(check, /const result = gradeToolCheck\(functionOperationsGrader, questionData, work\);/);
  assert.match(check, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,\s*\{ mode: 'functionOperations', composeOrder, parts: result\.parts \},\s*\);/);
  assert.doesNotMatch(check, /operationScores|expected|Matches|answers|===|reduce/, 'the Check computes no verdict of its own');
  // The rendered operation list is the one the grader marks.
  assert.match(body, /normalizeFunctionOperations\(questionData\.operations\)/);
  assert.match(body, /normalizeComposeOrder\(questionData\.composeOrder\)/);
});

test('the inline verdict code and the answer-derived metadata are gone from the component', () => {
  assert.doesNotMatch(code, /functionOperationAnswerMatches|restrictionsMatch|operationScores|operationExpectedExpression|excludedValues/);
});

/* ------------------------------------------------------------------ */
/* the old inline Check, as a parity oracle                            */
/* ------------------------------------------------------------------ */

// Verbatim from FunctionOperationsLab.jsx (and the old restrictionsMatch)
// before the shared grader. The shared grader must reach the same verdict and
// score on every fixture that does not leave the excluded-values box blank or
// end it with a stray comma.
const OLD_META_KEYS = ['sum', 'difference', 'product', 'quotient', 'composition'];
const legacyRestrictionsMatch = (submitted, expectedValues = []) => {
  const unique = (values) => {
    const out = [];
    values.map(Number).filter(Number.isFinite).sort((a, b) => a - b).forEach((value) => {
      if (!out.some((existing) => Math.abs(existing - value) <= 1e-9)) out.push(value);
    });
    return out;
  };
  const actual = unique(String(submitted ?? '').split(',').map((value) => Number(value.trim())).filter(Number.isFinite));
  const expected = unique(expectedValues);
  return actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) <= 1e-9);
};
const legacyCheck = (question, work) => {
  const requested = Array.isArray(question.operations) && question.operations.length ? question.operations : ['sum', 'difference', 'product', 'quotient'];
  const operations = [...new Set(requested.filter((operation) => OLD_META_KEYS.includes(operation)))];
  const composeOrder = question.composeOrder === 'gOfF' ? 'gOfF' : 'fOfG';
  const answers = deriveFunctionOperations({ f: question.f, g: question.g, operations, composeOrder, restrictions: question.restrictions });
  const scores = operations.map((operation) => {
    const expressionCorrect = functionOperationAnswerMatches(operation, work.responses[operation], answers?.[operation]?.expression || '');
    if (operation !== 'quotient') return expressionCorrect ? 1 : 0;
    const restrictionCorrect = legacyRestrictionsMatch(work.restrictions, answers.quotient?.excludedValues || []);
    return ((expressionCorrect ? 1 : 0) + (restrictionCorrect ? 1 : 0)) / 2;
  });
  const score = scores.length ? scores.reduce((total, value) => total + value, 0) / scores.length : 0;
  return { isCorrect: score === 1, score };
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
/* the four default operations                                         */
/* ------------------------------------------------------------------ */

test('default operations: correct, equivalent spellings, and the parts it reports', () => {
  const correct = assertLegacyParity(BASIC, BASIC_KEY, 'key');
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.isComplete, true);
  assert.equal(correct.score, 1);
  assert.deepEqual(partIds(correct), ['sum', 'difference', 'product', 'quotient', 'quotient-restrictions']);
  assert.deepEqual(correct.parts.map((part) => part.weight), [1, 1, 1, 0.5, 0.5], 'a quotient share is split between expression and exclusions');

  // Reordered terms, MathLive LaTeX, a \frac quotient, a common factor in the
  // quotient, padded and repeated exclusions — all forms the lab accepted.
  for (const work of [
    { responses: { sum: '-1+3x', difference: '3+x', product: '2x^{2}-3x-2', quotient: '\\frac{2x+1}{x-2}' }, restrictions: ' 2 ' },
    { responses: { sum: '3x-1', difference: 'x+3', product: '-2-3x+2x^2', quotient: '(4x+2)/(2x-4)' }, restrictions: '2, 2' },
  ]) assert.equal(assertLegacyParity(BASIC, work, JSON.stringify(work)).isCorrect, true, JSON.stringify(work));
});

test('default operations: partial credit is the mean of operation shares, half a share per quotient half', () => {
  const sumWrong = assertLegacyParity(BASIC, { ...BASIC_KEY, responses: { ...BASIC_KEY.responses, sum: '3x + 1' } }, 'sum wrong');
  assert.deepEqual(failedIds(sumWrong), ['sum']);
  assert.equal(sumWrong.score, 0.75);
  assert.equal(sumWrong.isComplete, true);

  const restrictionWrong = assertLegacyParity(BASIC, { ...BASIC_KEY, restrictions: '-2' }, 'restriction wrong');
  assert.deepEqual(failedIds(restrictionWrong), ['quotient-restrictions']);
  assert.equal(restrictionWrong.score, 0.875);

  // Exclusions are read with Number(), as they always were: "-1/2" is not a
  // number to the lab, so that piece is ignored rather than read as −0.5.
  const unreadablePiece = assertLegacyParity(BASIC, { ...BASIC_KEY, restrictions: '2, -1/2' }, 'unreadable piece');
  assert.deepEqual(failedIds(unreadablePiece), []);
  assert.equal(grade(BASIC, { ...BASIC_KEY, restrictions: '2, -0.5' }).score, 0.875, 'an extra exclusion is wrong');

  const factored = assertLegacyParity(BASIC, { ...BASIC_KEY, responses: { ...BASIC_KEY.responses, product: '(2x+1)(x-2)' } }, 'unexpanded product');
  assert.deepEqual(failedIds(factored), ['product'], 'a product must be simplified, as on screen');

  const allWrong = assertLegacyParity(BASIC, { responses: { sum: '1', difference: '1', product: '1', quotient: '1' }, restrictions: '1' }, 'all wrong');
  assert.equal(allWrong.score, 0);
});

test('default operations: blank boxes are incomplete and an explicit Check on them is still graded', () => {
  const blankProduct = assertLegacyParity(BASIC, { ...BASIC_KEY, responses: { ...BASIC_KEY.responses, product: '' } }, 'blank product');
  assert.equal(blankProduct.isComplete, false);
  assert.equal(blankProduct.isCorrect, false);
  assert.equal(blankProduct.score, 0.75);
  assert.equal(blankProduct.parts.find((part) => part.id === 'product').isComplete, false);

  const missingKey = assertLegacyParity(BASIC, { responses: { sum: '3x-1' }, restrictions: '2' }, 'missing responses');
  assert.equal(missingKey.isComplete, false);
  assert.equal(missingKey.score, 0.375);

  const untouched = grade(BASIC, { responses: { sum: '', difference: '', product: '', quotient: '' }, restrictions: '' });
  assert.equal(untouched.isComplete, false, 'so a deadline never auto-submits it');
  assert.equal(untouched.score, 0);
});

/* ------------------------------------------------------------------ */
/* composition, subsets, exact quotients                               */
/* ------------------------------------------------------------------ */

test('composition follows composeOrder (f∘g unless exactly gOfF), and a subset grades only what it asks', () => {
  const fOfG = assertLegacyParity(q({ f: F, g: G, operations: ['composition'] }), { responses: { composition: '2x-3' }, restrictions: '' }, 'f∘g');
  assert.equal(fOfG.isCorrect, true);
  assert.deepEqual(partIds(fOfG), ['composition']);
  assert.equal(fOfG.parts[0].label, '(f ∘ g)(x)');
  assert.equal(fOfG.isComplete, true, 'no quotient, so no excluded-values box to fill');

  const gOfF = q({ f: F, g: G, operations: ['composition'], composeOrder: 'gOfF' });
  assert.equal(assertLegacyParity(gOfF, { responses: { composition: '2x-1' } }, 'g∘f').isCorrect, true);
  assert.equal(assertLegacyParity(gOfF, { responses: { composition: '2x-3' } }, 'g∘f wrong order').isCorrect, false);
  assert.equal(grade(q({ f: F, g: G, operations: ['composition'], composeOrder: 'GOFF' }), { responses: { composition: '2x-3' } }).isCorrect, true, 'anything but exactly gOfF is f∘g');

  const subset = assertLegacyParity(q({ f: F, g: G, operations: ['product', 'sum', 'composition'] }), {
    responses: { sum: '3x-1', difference: 'not asked', product: '2x^2-3x-2', composition: '2x-3' },
  }, 'subset');
  assert.equal(subset.isCorrect, true);
  assert.deepEqual(partIds(subset), ['product', 'sum', 'composition'], 'authored order');
});

test('operations are normalized exactly as the lab renders them', () => {
  assert.deepEqual(normalizeFunctionOperations(undefined), ['sum', 'difference', 'product', 'quotient']);
  assert.deepEqual(normalizeFunctionOperations([]), ['sum', 'difference', 'product', 'quotient']);
  assert.deepEqual(normalizeFunctionOperations('sum'), ['sum', 'difference', 'product', 'quotient']);
  assert.deepEqual(normalizeFunctionOperations(['sum', 'sum', 'bogus', 5, 'product']), ['sum', 'product']);
  // Before, the lab filtered with `OPERATION_META[operation]`, which an
  // inherited name ('toString', 'constructor') passed: it rendered an empty
  // panel no answer could satisfy. Only the five supported operations count.
  assert.deepEqual(normalizeFunctionOperations(['toString', 'constructor', 'sum']), ['sum']);

  const duplicated = grade(q({ f: F, g: G, operations: ['sum', 'sum', 'bogus'] }), { responses: { sum: '3x-1' } });
  assert.equal(duplicated.isCorrect, true);
  assert.deepEqual(partIds(duplicated), ['sum']);

  const nothingAsked = assertLegacyParity(q({ f: F, g: G, operations: ['bogus'] }), { responses: {} }, 'nothing asked');
  assert.equal(nothingAsked.isCorrect, false);
  assert.equal(nothingAsked.score, 0);
  assert.equal(nothingAsked.isComplete, false, 'nothing to answer is not finished work');
});

test('a quotient that divides exactly is the simplified polynomial; the cancelled factor stays excluded', () => {
  // (x² − 1)/(x − 1) = x + 1, excluding 1.
  const exact = q({ f: { type: 'polynomial', coefficients: [1, 0, -1] }, g: { type: 'linear', a: 1, h: 1, k: 0 }, operations: ['quotient'] });
  assert.equal(assertLegacyParity(exact, { responses: { quotient: 'x+1' }, restrictions: '1' }, 'exact').isCorrect, true);
  assert.equal(assertLegacyParity(exact, { responses: { quotient: '1+x' }, restrictions: '1' }, 'exact reordered').isCorrect, true);
  assert.deepEqual(failedIds(assertLegacyParity(exact, { responses: { quotient: 'x+1' }, restrictions: '-1' }, 'wrong exclusion')), ['quotient-restrictions']);
  // Authored exclusions join the derived ones.
  const authored = q({ f: { type: 'linear', a: 1, h: 0, k: 0 }, g: { type: 'polynomial', coefficients: [1, 0, 0, -1] }, operations: ['quotient'], restrictions: { excludedValues: [1] } });
  assert.equal(assertLegacyParity(authored, { responses: { quotient: 'x/(x^3-1)' }, restrictions: '1' }, 'authored').isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* the blank excluded-values box — the one deliberate change           */
/* ------------------------------------------------------------------ */

test('BEHAVIOUR CHANGE: a blank excluded-values box means "none", never "x = 0"', () => {
  assert.deepEqual(parseExcludedValues(''), []);
  assert.deepEqual(parseExcludedValues('  '), []);
  assert.deepEqual(parseExcludedValues('2, -5,'), [2, -5]);
  assert.deepEqual(parseExcludedValues('2,,3'), [2, 3]);
  assert.equal(restrictionsMatch('', []), true);
  assert.equal(restrictionsMatch('', [0]), false);

  // (3x + 6)/3 = x + 2: a constant denominator excludes nothing, and the lab
  // says "leave blank only when there are none". The old Check read the blank
  // as [0] and marked the instructed answer WRONG.
  const constantDenominator = q({ f: { type: 'linear', a: 3, h: 0, k: 6 }, g: { type: 'linear', a: 0, h: 0, k: 3 }, operations: ['quotient'] });
  const work = { responses: { quotient: 'x+2' }, restrictions: '' };
  assert.deepEqual(legacyCheck(constantDenominator, work), { isCorrect: false, score: 0.5 }, 'before');
  const now = grade(constantDenominator, work);
  assert.equal(now.isCorrect, true, 'after');
  assert.equal(now.isComplete, true, 'blank is the complete answer when nothing is excluded');
  assert.equal(grade(constantDenominator, { ...work, restrictions: '0' }).isCorrect, false, 'typing 0 still claims an exclusion that is not there');

  // x² + 1 has no real zeros either.
  const noRealZeros = q({ f: { type: 'polynomial', coefficients: [1, 0, 1, 0] }, g: { type: 'quadratic', a: 1, h: 0, k: 1 }, operations: ['quotient'] });
  assert.equal(grade(noRealZeros, { responses: { quotient: 'x' }, restrictions: '' }).isCorrect, true);

  // (x² + x)/x = x + 1, excluding 0. The old Check read a blank as "0" and
  // marked it RIGHT; a blank is now incomplete and wrong.
  const zeroExcluded = q({ f: { type: 'polynomial', coefficients: [1, 1, 0] }, g: { type: 'linear', a: 1, h: 0, k: 0 }, operations: ['quotient'] });
  assert.deepEqual(legacyCheck(zeroExcluded, { responses: { quotient: 'x+1' }, restrictions: '' }), { isCorrect: true, score: 1 }, 'before');
  const blank = grade(zeroExcluded, { responses: { quotient: 'x+1' }, restrictions: '' });
  assert.equal(blank.isCorrect, false, 'after');
  assert.equal(blank.isComplete, false);
  assert.equal(blank.score, 0.5);
  assert.equal(assertLegacyParity(zeroExcluded, { responses: { quotient: 'x+1' }, restrictions: '0' }, 'typed 0').isCorrect, true);

  // A stray trailing comma used to add an exclusion at 0.
  assert.equal(legacyCheck(BASIC, { ...BASIC_KEY, restrictions: '2,' }).isCorrect, false, 'before');
  assert.equal(grade(BASIC, { ...BASIC_KEY, restrictions: '2,' }).isCorrect, true, 'after');
});

/* ------------------------------------------------------------------ */
/* tampering, malformed work, bounds                                   */
/* ------------------------------------------------------------------ */

test('injected verdicts and keys are dropped at every depth and never change the verdict', () => {
  const tampered = {
    responses: { sum: '0', difference: '0', product: '0', quotient: '0', isCorrect: true, expected: '3x - 1' },
    restrictions: '7',
    isCorrect: true,
    score: 1,
    checks: [true, true, true, true],
    expected: BASIC_KEY,
    answerKey: BASIC_KEY,
    solution: '3x - 1',
  };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'checks', 'expected', 'isCorrect', 'score', 'solution']);
  const result = grade(BASIC, tampered);
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
});

test('wrong types read as blank and never crash the grader', () => {
  const wrongTypes = grade(BASIC, { responses: { sum: ['3x - 1'], difference: { value: 'x + 3' }, product: true, quotient: null }, restrictions: ['2'] });
  assert.equal(wrongTypes.graded, true);
  assert.equal(wrongTypes.isCorrect, false);
  assert.equal(wrongTypes.isComplete, false);
  assert.equal(wrongTypes.score, 0);
  for (const responses of [null, 'sum', ['3x - 1'], 5]) {
    const result = grade(BASIC, { responses, restrictions: '2' });
    assert.equal(result.graded, true, JSON.stringify(responses));
    assert.equal(result.score, 0.125, 'only the excluded values can be right');
  }
  // A number is what a box would have held as text, and reads the same.
  const numeric = grade(q({ f: { type: 'linear', a: 0, h: 0, k: 3 }, g: { type: 'linear', a: 0, h: 0, k: 1 }, operations: ['sum'] }), { responses: { sum: 4 } });
  assert.equal(numeric.isCorrect, true);
});

test('non-object, oversize and unrenderable questions are not graded, on either path', () => {
  for (const work of [null, 'x+1', 4, [BASIC_KEY]]) {
    const result = grade(BASIC, work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
  const oversize = grade(BASIC, { ...BASIC_KEY, notes: Array.from({ length: 40 }, () => '9'.repeat(900)) });
  assert.equal(oversize.graded, false);
  assert.equal(oversize.serverReason, 'oversize-response');
  // The lab throws while deriving these (it cannot render them); the grader
  // names the question, not the student's work, as the reason.
  for (const question of [
    q({}),
    q({ f: F }),
    q({ f: { type: 'exponential' }, g: G }),
    q({ f: F, g: { type: 'polynomial', coefficients: [1, 0, 0, -1] }, operations: ['quotient'] }),
    q({ f: F, g: { type: 'linear', a: 0, h: 0, k: 0 }, operations: ['quotient'] }),
  ]) {
    const result = grade(question, BASIC_KEY);
    assert.equal(result.graded, false, JSON.stringify(question));
    assert.equal(result.reason, 'invalid-question');
  }
});

test('realistic maximal work stays inside the response bounds with nothing dropped', () => {
  const long = `\\frac{${'x^{2}+'.repeat(30)}1}{x-2}`;
  const work = {
    responses: { sum: long, difference: long, product: long, quotient: long, composition: long },
    restrictions: Array.from({ length: 20 }, (_, index) => index - 10).join(', '),
  };
  const bounded = boundToolWork(work);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 10);
  const result = grade(q({ f: F, g: G, operations: ['sum', 'difference', 'product', 'quotient', 'composition'] }), work);
  assert.equal(result.graded, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.isCorrect, false);
  // Real work never names a dropped key.
  assert.deepEqual(boundToolWork(BASIC_KEY).dropped, []);
});

/* ------------------------------------------------------------------ */
/* discrimination: the key decides                                     */
/* ------------------------------------------------------------------ */

test('correct work fails against a question whose key was altered', () => {
  const composition = { responses: { composition: '2x-3' } };
  const cases = [
    [BASIC, q({ f: { ...F, k: 2 }, g: G }), BASIC_KEY],
    [BASIC, q({ f: F, g: { ...G, h: 3 } }), BASIC_KEY],
    [BASIC, q({ f: F, g: G, restrictions: [5] }), BASIC_KEY],
    [q({ f: F, g: G, operations: ['composition'] }), q({ f: F, g: G, operations: ['composition'], composeOrder: 'gOfF' }), composition],
    [q({ f: F, g: G, operations: ['sum'] }), q({ f: F, g: G, operations: ['difference'] }), { responses: { sum: '3x-1', difference: '3x-1' } }],
  ];
  for (const [question, altered, work] of cases) {
    assert.equal(grade(question, work).isCorrect, true, `control ${JSON.stringify(question)}`);
    const result = grade(altered, work);
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false, `against an altered key ${JSON.stringify(altered)}`);
  }
});
