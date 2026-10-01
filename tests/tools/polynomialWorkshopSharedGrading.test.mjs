import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import polynomialGrader from '../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/polynomialWorkshop.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { evaluatePolynomial, matchesNumericAnswer, nearlyEqual, parseNumericAnswer } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  POLYNOMIAL_WORKSHOP_DEFAULTS,
  coefficientsFromRoots,
  endBehavior,
  factorBehaviorAtRoot,
  integerFactorPairForMonicQuadratic,
  parseCoefficientList,
  polynomialLongDivide,
  polynomialMultiply,
  rationalFeatureMap,
  sameNumberMultiset,
} from '../../functions/shared/toolMath/polynomialWorkshop/polynomialMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * POLYNOMIAL WORKSHOP IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts for every view — and
 * that verdict must be the one the workshop's old inline Check reached, except
 * for the three documented fixes (blank list pieces, coefficient order, and a
 * target value that is no listed root).
 */

const COMPONENT = 'src/tools/polynomialWorkshop/PolynomialWorkshop.jsx';
const code = executableSource(fs.readFileSync(COMPONENT, 'utf8'));

const TYPE = 'polynomialWorkshop';
const q = (fields = {}) => ({ type: TYPE, ...fields });

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(polynomialGrader, question, work);
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

// The component's own routing, read from its source: `questionData.mode ||
// '<default>'`, then `if (mode === '<view>') return <...`, else the default.
const componentRouting = (() => {
  const body = region(code, 'export default function PolynomialWorkshop', '\nfunction ', 'router');
  const fallback = body.match(/const mode\s*=\s*questionData\.mode \|\| '(\w+)';/)?.[1];
  const routed = [...body.matchAll(/if\s*\(mode\s*===\s*'(\w+)'\)\s*return </g)].map((match) => match[1]);
  assert.ok(fallback, 'router reads questionData.mode with a default');
  assert.equal(routed.length, 5, 'router has its five explicit views');
  return { fallback, routed };
})();
const componentMode = (question) => {
  const mode = question.mode || componentRouting.fallback;
  return componentRouting.routed.includes(mode) ? mode : componentRouting.fallback;
};

test('every view the workshop routes to is declared shared-server, contract v1, default FactorZero', () => {
  assert.equal(GRADING_MANIFEST.polynomialWorkshop, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, componentRouting.fallback);
  assert.deepEqual(Object.keys(declaration.modes).sort(), [componentRouting.fallback, ...componentRouting.routed].sort());
  for (const [mode, entry] of Object.entries(declaration.modes)) {
    assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER, `${mode} is shared-server`);
    assert.equal(entry.blocker, null);
  }
  assert.deepEqual(Object.keys(polynomialGrader.modeGraders).sort(), Object.keys(declaration.modes).sort());
  assert.deepEqual([...polynomialGrader.problems], []);
});

test('declared mode resolution reproduces the screen routing, including padded, mis-cased and non-string modes', () => {
  const samples = [
    {}, { mode: '' }, { mode: null }, { mode: 'factorZero' }, { mode: 'multiplyArea' }, { mode: 'factorQuadratic' },
    { mode: 'division' }, { mode: 'graphConnection' }, { mode: 'rationalFeatures' }, { mode: 'unknownView' },
    { mode: ' division ' }, { mode: 'Division' }, { mode: 'graphconnection' }, { mode: 3 }, { mode: ['division'] },
    { mode: { toString: () => 'division' } }, { mode: 'constructor' }, { mode: 'toString' },
  ];
  for (const question of samples) {
    assert.equal(resolveToolMode(declaration, question), componentMode(question), `mode ${JSON.stringify(question.mode)}`);
  }
  // A padded mode the manifest's generic fallback would trim into `division`
  // is graded as the FactorZero screen the student actually saw.
  const padded = grade(q({ mode: ' division ' }), { value: '0', factorChoice: 'yes' });
  assert.equal(padded.mode, 'factorZero');
  assert.equal(padded.isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* the component is wired to the shared grader and nothing else        */
/* ------------------------------------------------------------------ */

const VIEWS = {
  factorZero: 'FactorZero',
  multiplyArea: 'MultiplyArea',
  factorQuadratic: 'FactorQuadratic',
  division: 'DivisionMode',
  graphConnection: 'GraphConnection',
  rationalFeatures: 'RationalFeatures',
};

test('every view grades its Check through the shared grader and reports the same work it submits', () => {
  assert.match(code, /import polynomialWorkshopGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/polynomialWorkshop\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  for (const [mode, name] of Object.entries(VIEWS)) {
    const body = region(code, `function ${name}(`, '\nfunction ', name);
    const check = region(body, 'const check=()=>{', '\n  };', `${name} check`);
    assert.match(body, /const work=\{[^}]+\};/, `${name} builds work at render scope`);
    assert.match(body, /useReportToolWork\(work\);/, `${name} reports live work`);
    assert.match(check, /const result=gradeToolCheck\(polynomialWorkshopGrader,questionData,work\);/, `${name} grades through the shared grader`);
    assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \},work,\{mode:'(\w+)',parts:result\.parts\}\);/, `${name} submits the shared verdict, its work and only mode + parts`);
    assert.equal(check.match(/mode:'(\w+)'/)[1], mode, `${name} reports the mode the declaration grades it as`);
    assert.doesNotMatch(check, /===|expected|Correct\s*=|parse|nearlyEqual|matches|filter\(Boolean\)/, `${name} computes no verdict of its own`);
  }
});

test('the views draw their unauthored problem from the same defaults table the grader marks', () => {
  for (const [name, fields] of Object.entries({
    FactorZero: ['coefficients', 'candidateRoot'],
    MultiplyArea: ['leftBinomial', 'rightBinomial'],
    FactorQuadratic: ['coefficients'],
    DivisionMode: ['dividend', 'divisor'],
    GraphConnection: ['roots', 'leadingCoefficient'],
    RationalFeatures: ['numeratorRoots', 'denominatorRoots'],
  })) {
    const body = region(code, `function ${name}(`, '\nfunction ', name);
    const mode = Object.entries(VIEWS).find(([, view]) => view === name)[0];
    for (const field of fields) {
      assert.match(body, new RegExp(`questionData\\.${field} (\\|\\||\\?\\?) DEFAULTS\\.${mode}\\.${field}`), `${name} reads ${field} with the shared default`);
    }
  }
  assert.match(region(code, 'function GraphConnection(', '\nfunction ', 'GraphConnection'), /graphConnectionTargetEntry\(roots, questionData\.targetRoot\)/);
  assert.match(region(code, 'function RationalFeatures(', '\nfunction ', 'RationalFeatures'), /rationalFeatureTargetValue\(features, questionData\.targetValue\)/);
});

test('the inline verdict code is gone from the component', () => {
  assert.doesNotMatch(code, /matchesNumericAnswer|parseNumericAnswer|sameNumberMultiset|parseNumbers|polynomialLongDivide|integerFactorPairForMonicQuadratic|factorBehaviorAtRoot|endBehavior\(|expectedCells|isFactor/);
});

/* ------------------------------------------------------------------ */
/* the old inline Check, as a parity oracle                            */
/* ------------------------------------------------------------------ */

// Verbatim from PolynomialWorkshop.jsx before the shared grader, for
// UI-shaped (string) work. The shared grader must reach the same verdict and
// score on every fixture that does not hit one of the documented fixes.
const legacyParseNumbers = (text) => String(text || '').split(',').map((v) => Number(v.trim())).filter(Number.isFinite);
const legacyCheck = (question, work) => {
  const mode = componentMode(question);
  if (mode === 'multiplyArea') {
    const left = question.leftBinomial || [2, 3];
    const right = question.rightBinomial || [1, -4];
    const expectedCells = [left[0] * right[0], left[0] * right[1], left[1] * right[0], left[1] * right[1]];
    const product = polynomialMultiply(left, right);
    const cellCorrect = work.cells.map((v, i) => matchesNumericAnswer(v, expectedCells[i], 0.01));
    const expandedCorrect = sameNumberMultiset(legacyParseNumbers(work.expanded), product, 0.01) && legacyParseNumbers(work.expanded).length === product.length;
    const correctCount = cellCorrect.filter(Boolean).length + (expandedCorrect ? 1 : 0);
    return { isCorrect: correctCount === 5, score: correctCount / 5 };
  }
  if (mode === 'factorQuadratic') {
    const expected = integerFactorPairForMonicQuadratic(question.coefficients || [1, -5, 6]);
    const parsedP = parseNumericAnswer(work.p);
    const parsedQ = parseNumericAnswer(work.q);
    const isCorrect = !!expected && parsedP !== null && parsedQ !== null && sameNumberMultiset([parsedP, parsedQ], expected, 0.01);
    return { isCorrect, score: isCorrect ? 1 : 0 };
  }
  if (mode === 'division') {
    const result = polynomialLongDivide(question.dividend || [1, -4, -7, 10], question.divisor || [1, -2]);
    const quotient = legacyParseNumbers(work.quotient);
    const remainder = legacyParseNumbers(work.remainder);
    const qCorrect = quotient.length === result.quotient.length && quotient.every((v, i) => nearlyEqual(v, result.quotient[i], 0.01));
    const rCorrect = remainder.length === result.remainder.length && remainder.every((v, i) => nearlyEqual(v, result.remainder[i], 0.01));
    return { isCorrect: qCorrect && rCorrect, score: [qCorrect, rCorrect].filter(Boolean).length / 2 };
  }
  if (mode === 'graphConnection') {
    const roots = question.roots || [{ root: -2, multiplicity: 2 }, { root: 3, multiplicity: 1 }];
    const coefficients = coefficientsFromRoots(roots, Number(question.leadingCoefficient ?? 1));
    const target = question.targetRoot ?? roots[0].root;
    const targetEntry = roots.find((entry) => nearlyEqual(entry.root, target)) || roots[0];
    const behaviorCorrect = work.behavior === factorBehaviorAtRoot(targetEntry.multiplicity);
    const endCorrect = work.end === endBehavior(coefficients).label;
    return { isCorrect: behaviorCorrect && endCorrect, score: [behaviorCorrect, endCorrect].filter(Boolean).length / 2 };
  }
  if (mode === 'rationalFeatures') {
    const features = rationalFeatureMap({ numeratorRoots: question.numeratorRoots || [2, -1], denominatorRoots: question.denominatorRoots || [2, 4] });
    const targetValue = Number(question.targetValue ?? features[0]?.root ?? 2);
    const target = features.find((f) => nearlyEqual(f.root, targetValue));
    return { isCorrect: work.choice === target?.type, score: work.choice === target?.type ? 1 : 0 };
  }
  const polynomialValue = evaluatePolynomial(question.coefficients || [1, -5, 6], Number(question.candidateRoot ?? 2));
  const isFactor = Math.abs(polynomialValue) < 1e-9;
  const valueCorrect = matchesNumericAnswer(work.value, polynomialValue, 0.01);
  const factorCorrect = (work.factorChoice === 'yes') === isFactor;
  return { isCorrect: valueCorrect && factorCorrect, score: [valueCorrect, factorCorrect].filter(Boolean).length / 2 };
};

const assertLegacyParity = (question, work, label) => {
  const result = grade(question, work);
  const legacy = legacyCheck(question, work);
  assert.equal(result.graded, true, `${label}: graded`);
  assert.equal(result.isCorrect, legacy.isCorrect, `${label}: isCorrect matches the old Check`);
  assert.equal(result.score, legacy.score, `${label}: score matches the old Check`);
  return result;
};

test('the shared defaults table holds exactly the problems the old views drew', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(POLYNOMIAL_WORKSHOP_DEFAULTS)), {
    factorZero: { coefficients: [1, -5, 6], candidateRoot: 2 },
    multiplyArea: { leftBinomial: [2, 3], rightBinomial: [1, -4] },
    factorQuadratic: { coefficients: [1, -5, 6] },
    division: { dividend: [1, -4, -7, 10], divisor: [1, -2] },
    graphConnection: { roots: [{ root: -2, multiplicity: 2 }, { root: 3, multiplicity: 1 }], leadingCoefficient: 1 },
    rationalFeatures: { numeratorRoots: [2, -1], denominatorRoots: [2, 4] },
  });
  assert.ok(Object.isFrozen(POLYNOMIAL_WORKSHOP_DEFAULTS.graphConnection.roots[0]), 'a view cannot mutate the shared default');
});

/* ------------------------------------------------------------------ */
/* factorZero                                                          */
/* ------------------------------------------------------------------ */

test('factorZero: unauthored P(x) = x² − 5x + 6 at r = 2 is a factor; the default "yes" earns its half', () => {
  const correct = assertLegacyParity(q({}), { value: '0', factorChoice: 'yes' }, 'defaults');
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.mode, 'factorZero');
  assert.deepEqual(partIds(correct), ['value', 'factor']);
  const untouched = assertLegacyParity(q({}), { value: '', factorChoice: 'yes' }, 'untouched');
  assert.equal(untouched.score, 0.5, 'exactly what the workshop awarded a blank Check');
  assert.equal(untouched.isComplete, false, 'so a deadline never auto-submits it');
  assert.deepEqual(failedIds(assertLegacyParity(q({}), { value: '0', factorChoice: 'no' }, 'no')), ['factor']);
});

test('factorZero: an authored polynomial that is not a factor, with fractions, U+2212 and the 0.01 tolerance', () => {
  // x³ − 4x + 1 at r = 3: 27 − 12 + 1 = 16.
  const question = q({ mode: 'factorZero', coefficients: [1, 0, -4, 1], candidateRoot: 3 });
  for (const value of ['16', '32/2', ' 16.009 ', '15.991']) {
    assert.equal(assertLegacyParity(question, { value, factorChoice: 'no' }, value).isCorrect, true, value);
  }
  assert.deepEqual(failedIds(assertLegacyParity(question, { value: '16.02', factorChoice: 'no' }, 'tolerance')), ['value']);
  const wrongChoice = assertLegacyParity(question, { value: '16', factorChoice: 'yes' }, 'wrong choice');
  assert.deepEqual(failedIds(wrongChoice), ['factor']);
  assert.equal(wrongChoice.score, 0.5);
  // x + 2 at r = −5 is −3: the U+2212 minus is read.
  assert.equal(assertLegacyParity(q({ coefficients: [1, 2], candidateRoot: -5 }), { value: '−3', factorChoice: 'no' }, 'unicode').isCorrect, true);
  // String coefficients (a rebuilt family instance) read with Number().
  assert.equal(grade(q({ coefficients: ['1', '-5', '6'], candidateRoot: '3' }), { value: '0', factorChoice: 'yes' }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* multiplyArea                                                        */
/* ------------------------------------------------------------------ */

const AREA_KEY = { cells: ['2', '-8', '3', '-12'], expanded: '2, -5, -12' };

test('multiplyArea: four area cells and the expanded coefficients, one fifth each', () => {
  // Unauthored (2x + 3)(x − 4) = 2x² − 5x − 12.
  const area = q({ mode: 'multiplyArea' });
  const correct = assertLegacyParity(area, AREA_KEY, 'key');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['cell-1', 'cell-2', 'cell-3', 'cell-4', 'expanded']);
  assert.equal(assertLegacyParity(area, { cells: ['4/2', '−8', ' 3 ', '-12.004'], expanded: '2,-5,-12' }, 'forms').isCorrect, true);

  const oneCell = assertLegacyParity(area, { ...AREA_KEY, cells: ['2', '8', '3', '-12'] }, 'one cell');
  assert.deepEqual(failedIds(oneCell), ['cell-2']);
  assert.equal(oneCell.score, 0.8);

  const incomplete = assertLegacyParity(area, { cells: ['2', '', '3', '-12'], expanded: '2, -5, -12' }, 'incomplete');
  assert.equal(incomplete.isComplete, false);
  assert.equal(incomplete.score, 0.8);

  // A missing degree must be entered as 0: (x + 2)(x − 2) = x² + 0x − 4.
  const square = q({ mode: 'multiplyArea', leftBinomial: [1, 2], rightBinomial: [1, -2] });
  assert.equal(assertLegacyParity(square, { cells: ['1', '-2', '2', '-4'], expanded: '1, 0, -4' }, 'missing degree').isCorrect, true);
  assert.deepEqual(failedIds(assertLegacyParity(square, { cells: ['1', '-2', '2', '-4'], expanded: '1, -4' }, 'no zero')), ['expanded']);
});

test('BEHAVIOUR CHANGE: multiplyArea reads the expanded coefficients in order, and ignores a stray comma', () => {
  const area = q({ mode: 'multiplyArea' });
  // "-12, -5, 2" is −12x² − 5x + 2, not 2x² − 5x − 12. The old Check compared
  // the lists as unordered multisets and accepted it, against its own
  // "highest degree down" instruction.
  const reversed = { ...AREA_KEY, expanded: '-12, -5, 2' };
  assert.deepEqual(legacyCheck(area, reversed), { isCorrect: true, score: 1 }, 'before');
  const now = grade(area, reversed);
  assert.equal(now.isCorrect, false, 'after');
  assert.deepEqual(failedIds(now), ['expanded']);
  assert.equal(now.score, 0.8);

  // A trailing comma used to append a 0 coefficient.
  const trailing = { ...AREA_KEY, expanded: '2, -5, -12,' };
  assert.equal(legacyCheck(area, trailing).isCorrect, false, 'before');
  assert.equal(grade(area, trailing).isCorrect, true, 'after');
  assert.deepEqual(parseCoefficientList('2, -5, -12,'), [2, -5, -12]);
  assert.deepEqual(parseCoefficientList(''), []);
});

/* ------------------------------------------------------------------ */
/* factorQuadratic                                                     */
/* ------------------------------------------------------------------ */

test('factorQuadratic: p and q in either order, all or nothing', () => {
  // Unauthored x² − 5x + 6 = (x − 2)(x − 3): p, q = −2, −3.
  const quadratic = q({ mode: 'factorQuadratic' });
  for (const [p, q2] of [['-2', '-3'], ['-3', '-2'], ['−2', '-6/2']]) {
    const result = assertLegacyParity(quadratic, { p, q: q2 }, `${p}, ${q2}`);
    assert.equal(result.isCorrect, true);
    assert.deepEqual(partIds(result), ['factor-pair']);
  }
  const wrong = assertLegacyParity(quadratic, { p: '2', q: '3' }, 'signs');
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.score, 0);
  assert.equal(wrong.isComplete, true);

  const half = assertLegacyParity(quadratic, { p: '-2', q: '' }, 'half');
  assert.equal(half.isComplete, false);
  assert.equal(half.score, 0);

  const authored = q({ mode: 'factorQuadratic', coefficients: [1, 3, -10] });
  assert.equal(assertLegacyParity(authored, { p: '5', q: '-2' }, 'authored').isCorrect, true);
});

test('factorQuadratic: a quadratic with no integer factor pair can never be matched, exactly as on screen', () => {
  for (const coefficients of [[2, 3, 1], [1, 1, 1], [1, 0.5, 0]]) {
    const result = assertLegacyParity(q({ mode: 'factorQuadratic', coefficients }), { p: '1', q: '1' }, JSON.stringify(coefficients));
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false);
  }
});

/* ------------------------------------------------------------------ */
/* division                                                            */
/* ------------------------------------------------------------------ */

test('division: quotient and remainder coefficient lists, in order, half each', () => {
  // Unauthored (x³ − 4x² − 7x + 10) ÷ (x − 2) = x² − 2x − 11, remainder −12.
  const division = q({ mode: 'division' });
  const correct = assertLegacyParity(division, { quotient: '1, -2, -11', remainder: '-12' }, 'key');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['quotient', 'remainder']);
  assert.equal(assertLegacyParity(division, { quotient: '1,-2.004,-11', remainder: ' -12 ' }, 'tolerance').isCorrect, true);
  const reversed = assertLegacyParity(division, { quotient: '-11, -2, 1', remainder: '-12' }, 'reversed');
  assert.deepEqual(failedIds(reversed), ['quotient']);
  assert.equal(reversed.score, 0.5);
  const remainderWrong = assertLegacyParity(division, { quotient: '1, -2, -11', remainder: '12' }, 'remainder');
  assert.deepEqual(failedIds(remainderWrong), ['remainder']);
  // An authored exact division: (x² − 4) ÷ (x − 2) = x + 2 remainder 0.
  const exact = q({ mode: 'division', dividend: [1, 0, -4], divisor: [1, -2] });
  assert.equal(assertLegacyParity(exact, { quotient: '1, 2', remainder: '0' }, 'exact').isCorrect, true);
});

test('BEHAVIOUR CHANGE: a blank remainder is no answer, not the remainder 0', () => {
  const exact = q({ mode: 'division', dividend: [1, 0, -4], divisor: [1, -2] });
  const blankRemainder = { quotient: '1, 2', remainder: '' };
  // The old Check read '' as [0] and marked the untouched box right.
  assert.deepEqual(legacyCheck(exact, blankRemainder), { isCorrect: true, score: 1 }, 'before');
  const now = grade(exact, blankRemainder);
  assert.equal(now.isCorrect, false, 'after');
  assert.equal(now.isComplete, false);
  assert.deepEqual(failedIds(now), ['remainder']);
  assert.equal(now.score, 0.5);

  const untouched = grade(q({ mode: 'division' }), { quotient: '', remainder: '' });
  assert.equal(untouched.score, 0);
  assert.equal(untouched.isComplete, false);
});

/* ------------------------------------------------------------------ */
/* graphConnection                                                     */
/* ------------------------------------------------------------------ */

const END_LABELS = ['both ends rise', 'both ends fall', 'left falls, right rises', 'left rises, right falls'];

test('graphConnection: behaviour at the target zero from its multiplicity, ends from degree and leading sign', () => {
  // Unauthored (x + 2)²(x − 3): target −2 has multiplicity 2 → touches; cubic, positive → left falls, right rises.
  const defaults = q({ mode: 'graphConnection' });
  const correct = assertLegacyParity(defaults, { behavior: 'touches', end: 'left falls, right rises' }, 'defaults');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['behavior', 'end-behavior']);
  const untouched = assertLegacyParity(defaults, { behavior: 'crosses', end: 'both ends rise' }, 'untouched');
  assert.equal(untouched.score, 0);
  assert.equal(untouched.isComplete, true, 'a <select> always holds an answer');

  // −2(x − 1)³(x + 1)²: degree 5, negative leading coefficient; target 1 has multiplicity 3.
  const authored = q({ mode: 'graphConnection', roots: [{ root: -1, multiplicity: 2 }, { root: 1, multiplicity: 3 }], leadingCoefficient: -2, targetRoot: 1 });
  assert.equal(assertLegacyParity(authored, { behavior: 'crosses', end: 'left rises, right falls' }, 'authored').isCorrect, true);
  const half = assertLegacyParity(authored, { behavior: 'touches', end: 'left rises, right falls' }, 'half');
  assert.deepEqual(failedIds(half), ['behavior']);
  assert.equal(half.score, 0.5);
  // A target that is not a listed root falls back to the first root, as on screen.
  const fallback = q({ mode: 'graphConnection', roots: [{ root: -1, multiplicity: 2 }, { root: 1, multiplicity: 3 }], targetRoot: 9 });
  assert.equal(assertLegacyParity(fallback, { behavior: 'touches', end: 'both ends fall' }, 'fallback').score, 0.5);
  for (const end of END_LABELS) assertLegacyParity(authored, { behavior: 'crosses', end }, end);
});

/* ------------------------------------------------------------------ */
/* rationalFeatures                                                    */
/* ------------------------------------------------------------------ */

test('rationalFeatures: hole, asymptote or zero after cancelling common factors', () => {
  // Unauthored numerator roots 2, −1; denominator roots 2, 4. The default
  // target is the smallest root, −1: a zero. The select's default 'hole' is wrong.
  const defaults = q({ mode: 'rationalFeatures' });
  const correct = assertLegacyParity(defaults, { choice: 'zero' }, 'defaults');
  assert.equal(correct.isCorrect, true);
  assert.deepEqual(partIds(correct), ['feature']);
  assert.equal(assertLegacyParity(defaults, { choice: 'hole' }, 'untouched').score, 0);
  assert.equal(assertLegacyParity(q({ mode: 'rationalFeatures', targetValue: 2 }), { choice: 'hole' }, 'hole').isCorrect, true);
  assert.equal(assertLegacyParity(q({ mode: 'rationalFeatures', targetValue: '4' }), { choice: 'verticalAsymptote' }, 'asymptote').isCorrect, true);
  // A doubled denominator factor survives one cancellation: still an asymptote.
  const doubled = q({ mode: 'rationalFeatures', numeratorRoots: [3], denominatorRoots: [3, 3], targetValue: 3 });
  assert.equal(assertLegacyParity(doubled, { choice: 'verticalAsymptote' }, 'doubled').isCorrect, true);
  assert.equal(assertLegacyParity(doubled, { choice: 'hole' }, 'doubled hole').isCorrect, false);
});

test('BEHAVIOUR CHANGE: at a value that is no listed root, "None of these" is the answer', () => {
  // Neither numerator nor denominator vanishes at x = 7, so the function has
  // no hole, asymptote or zero there. The old Check compared against an
  // undefined feature and no choice could ever be right.
  const unlisted = q({ mode: 'rationalFeatures', targetValue: 7 });
  for (const choice of ['hole', 'verticalAsymptote', 'zero', 'none']) {
    assert.equal(legacyCheck(unlisted, { choice }).isCorrect, false, `before: ${choice}`);
  }
  assert.equal(grade(unlisted, { choice: 'none' }).isCorrect, true, 'after');
  for (const choice of ['hole', 'verticalAsymptote', 'zero']) assert.equal(grade(unlisted, { choice }).isCorrect, false, `after: ${choice}`);
  // At a listed root 'none' stays wrong.
  assert.equal(grade(q({ mode: 'rationalFeatures', targetValue: 2 }), { choice: 'none' }).isCorrect, false);
});

/* ------------------------------------------------------------------ */
/* tampering, malformed work, bounds                                   */
/* ------------------------------------------------------------------ */

test('injected verdicts and keys are dropped and never change the verdict', () => {
  const tampered = { value: '7', factorChoice: 'no', isCorrect: true, score: 1, correct: true, expected: { value: 0 }, answerKey: { value: '0' }, checks: [true, true], feedback: 'ok' };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'checks', 'correct', 'expected', 'feedback', 'isCorrect', 'score']);
  const result = grade(q({}), tampered);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  const area = grade(q({ mode: 'multiplyArea' }), { cells: ['0', '0', '0', '0'], expanded: '0', isCorrect: true, partialCredit: 100 });
  assert.equal(area.score, 0);
});

test('wrong types read as blank (or an invalid choice) and never crash the grader', () => {
  const factorZero = grade(q({}), { value: ['0'], factorChoice: true });
  assert.equal(factorZero.graded, true);
  assert.equal(factorZero.isCorrect, false);
  assert.equal(factorZero.isComplete, false);
  assert.equal(factorZero.score, 0);
  // A number is what a box would have held as text, and reads the same.
  assert.equal(grade(q({}), { value: 0, factorChoice: 'yes' }).isCorrect, true);

  // A select only ever holds one of its options. Before, a forged 'maybe'
  // read as "no" and could score the factor decision.
  const forged = grade(q({ coefficients: [1, 2], candidateRoot: -5 }), { value: '-3', factorChoice: 'maybe' });
  assert.deepEqual(failedIds(forged), ['factor']);
  assert.equal(forged.isComplete, false);
  assert.deepEqual(failedIds(grade(q({ mode: 'graphConnection' }), { behavior: 'bounces', end: ['left falls, right rises'] })), ['behavior', 'end-behavior']);
  assert.equal(grade(q({ mode: 'rationalFeatures' }), { choice: 'Zero' }).isComplete, false);

  for (const cells of [null, 'abc', { 0: '2' }, [['2'], { v: '-8' }]]) {
    const result = grade(q({ mode: 'multiplyArea' }), { cells, expanded: '2, -5, -12' });
    assert.equal(result.graded, true, JSON.stringify(cells));
    assert.equal(result.score, 0.2, 'only the expanded list can be right');
    assert.equal(result.isComplete, false);
  }
  // Extra cells beyond the four the area model draws are ignored.
  assert.equal(grade(q({ mode: 'multiplyArea' }), { ...AREA_KEY, cells: [...AREA_KEY.cells, '99'] }).isCorrect, true);
  assert.equal(grade(q({ mode: 'division' }), { quotient: [1, -2, -11], remainder: { r: -12 } }).score, 0);
});

test('non-object, oversize and unrenderable questions are not graded, on either path', () => {
  for (const work of [null, 'value', 4, [{ value: '0' }]]) {
    const result = grade(q({}), work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
  const oversize = grade(q({}), { value: '0', factorChoice: 'yes', notes: Array.from({ length: 40 }, () => '9'.repeat(900)) });
  assert.equal(oversize.graded, false);
  assert.equal(oversize.serverReason, 'oversize-response');
  // Questions the workshop cannot render throw inside the mathematics; the
  // grader names the question, not the student's work, as the reason.
  for (const question of [
    q({ coefficients: '1,-5,6' }),
    q({ mode: 'multiplyArea', leftBinomial: '23' }),
    q({ mode: 'factorQuadratic', coefficients: { a: 1 } }),
    q({ mode: 'division', divisor: [0, 0] }),
    q({ mode: 'graphConnection', roots: [] }),
    q({ mode: 'rationalFeatures', numeratorRoots: 5 }),
  ]) {
    const result = grade(question, { value: '0', factorChoice: 'yes' });
    assert.equal(result.graded, false, JSON.stringify(question));
    assert.equal(result.reason, 'invalid-question');
  }
});

test('realistic maximal work stays inside the response bounds with nothing dropped', () => {
  const long = '-12.0000000000000000000000';
  const list = Array.from({ length: 12 }, () => long).join(', ');
  const works = [
    { value: long, factorChoice: 'no' },
    { cells: [long, long, long, long], expanded: list },
    { p: long, q: long },
    { quotient: list, remainder: list },
    { behavior: 'touches', end: 'left rises, right falls' },
    { choice: 'verticalAsymptote' },
  ];
  for (const work of works) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, []);
    assert.equal(bounded.truncated, false);
    assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 20);
  }
  assert.equal(grade(q({ mode: 'division' }), { quotient: '1, -2, -11', remainder: long }).isCorrect, true);
});

/* ------------------------------------------------------------------ */
/* discrimination: the key decides                                     */
/* ------------------------------------------------------------------ */

test('correct work fails against a question whose key was altered', () => {
  const cases = [
    [q({}), q({ candidateRoot: 4 }), { value: '0', factorChoice: 'yes' }],
    [q({}), q({ coefficients: [1, -5, 7] }), { value: '0', factorChoice: 'yes' }],
    [q({ mode: 'multiplyArea' }), q({ mode: 'multiplyArea', rightBinomial: [1, 4] }), AREA_KEY],
    [q({ mode: 'factorQuadratic' }), q({ mode: 'factorQuadratic', coefficients: [1, 5, 6] }), { p: '-2', q: '-3' }],
    [q({ mode: 'division' }), q({ mode: 'division', divisor: [1, 2] }), { quotient: '1, -2, -11', remainder: '-12' }],
    [q({ mode: 'graphConnection' }), q({ mode: 'graphConnection', leadingCoefficient: -1 }), { behavior: 'touches', end: 'left falls, right rises' }],
    [q({ mode: 'graphConnection' }), q({ mode: 'graphConnection', targetRoot: 3 }), { behavior: 'touches', end: 'left falls, right rises' }],
    [q({ mode: 'rationalFeatures' }), q({ mode: 'rationalFeatures', numeratorRoots: [2, -1], denominatorRoots: [2, -1] }), { choice: 'zero' }],
  ];
  for (const [question, altered, work] of cases) {
    assert.equal(grade(question, work).isCorrect, true, `${question.mode || 'factorZero'} control`);
    const result = grade(altered, work);
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false, `${question.mode || 'factorZero'} against an altered key ${JSON.stringify(altered)}`);
  }
});
