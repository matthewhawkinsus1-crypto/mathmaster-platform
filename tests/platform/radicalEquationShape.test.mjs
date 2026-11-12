import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RADICAL_INDEX_RANGE,
  isSupportedRadicalEquation,
  parseRadicalEquation,
  radicalDomainText,
  radicalHoldsAt,
  radicalSidesAt,
  rational,
  rationalToText,
  solveRadicalShape,
} from '../../functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs';
import {
  RADICAL_ALGEBRA_TOOLS,
  factoredProductOf,
  isolatedRadicalInBranch,
  obviousSpecialClaim,
  parseRelationSource,
  raiseRadicalRelation,
  relationSolutionSummary,
  relationStateNeedsCandidateCheck,
  validateRelationTransition,
  zeroProductFactors,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { normalizeStepWork } from '../../functions/shared/submissionEnvelope.mjs';
import { relationStepWork, RELATION_STEP_KINDS } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';

/*
 * THE EXACT RADICAL MODEL AND THE THREE TRANSITIONS BUILT ON IT.
 *
 * Tomorrow's verified scope is one radical with a linear radicand: index 2 with
 * a linear other side, index 3-5 with a constant other side. The model must say
 * "not in scope" for everything else rather than guess, and the transitions
 * must accept the student's honest next line and refuse the wrong ones.
 */

const solved = (source, options) => {
  const parsed = parseRadicalEquation(source, options);
  assert.equal(parsed.ok, true, `${source}: ${parsed.reason}`);
  const result = solveRadicalShape(parsed.shape);
  assert.equal(result.ok, true, `${source}: ${result.reason}`);
  return { shape: parsed.shape, ...result };
};
const text = (values) => values.map(rationalToText);

// ---------------------------------------------------------------------------
// What the model reads and solves exactly
// ---------------------------------------------------------------------------

test('the lesson equations: exact candidates, which satisfy the ORIGINAL equation, and both sides at each', () => {
  const cases = [
    // [source, candidates, genuine, [candidate, left, right] ...]
    ['sqrt(x+4)+2=x', ['0', '5'], ['5'], [['0', '4', '0'], ['5', '5', '5']]],
    ['sqrt(5x-1)=2x-1', ['1/4', '2'], ['2'], [['1/4', '1/2', '-1/2'], ['2', '3', '3']]],
    ['sqrt(3x+1)+1=x', ['0', '5'], ['5'], [['0', '2', '0'], ['5', '5', '5']]],
    ['sqrt(2x+2)=3x-1', ['-1/9', '1'], ['1'], [['-1/9', '4/3', '-4/3'], ['1', '2', '2']]],
  ];
  for (const [source, candidates, genuine, sides] of cases) {
    const result = solved(source);
    assert.deepEqual(text(result.candidates), candidates, `${source}: candidates`);
    assert.deepEqual(text(result.genuine), genuine, `${source}: genuine`);
    for (const [candidate, left, right] of sides) {
      const [n, d = '1'] = candidate.split('/');
      const at = radicalSidesAt(result.shape, rational(Number(n), Number(d)));
      assert.deepEqual([rationalToText(at.left), rationalToText(at.right)], [left, right], `${source} at ${candidate}`);
    }
  }
});

test('the distinct outcomes: solutions, a repeated root, two genuine, every candidate failing, a structural no-solution', () => {
  assert.deepEqual(text(solved('cbrt(2x-1)=3').genuine), ['14'], 'a cube root');
  assert.deepEqual(text(solved('2 cbrt(x+3) + 1 = 7').genuine), ['24'], 'an outside coefficient and constant');
  assert.deepEqual(text(solved('nthRoot(3x+1,4)=2').genuine), ['5'], 'a 4th root');
  assert.deepEqual(text(solved('3 nthRoot(2x+5,5)-1=8').genuine), ['119'], 'a 5th root');
  const repeated = solved('sqrt(4x-4)=x');
  assert.deepEqual(text(repeated.candidates), ['2'], 'a repeated root is one candidate');
  assert.deepEqual(text(solved('sqrt(5x-6)=x').genuine), ['2', '3'], 'two genuine solutions');

  const allFail = solved('sqrt(-7x+23)=x-5');
  assert.deepEqual(text(allFail.candidates), ['1', '2']);
  assert.deepEqual(allFail.genuine, []);
  assert.equal(allFail.outcome, 'allCandidatesFail');
  assert.equal(allFail.structuralNoSolution, false, 'it takes the algebra to see this one');

  const structural = solved('sqrt(x+1)=-3');
  assert.equal(structural.structuralNoSolution, true, 'an isolated even root equal to a negative number');
  assert.deepEqual(text(structural.candidates), ['8'], 'raising still produces a candidate...');
  assert.equal(structural.outcome, 'allCandidatesFail', '...which fails');
  // An odd root equal to a negative number is fine.
  assert.equal(solved('cbrt(x+1)=-3').structuralNoSolution, false);
  assert.deepEqual(text(solved('cbrt(x+1)=-3').genuine), ['-28']);
});

test('the same equation in every notation a source can arrive in', () => {
  const plain = solved('sqrt(x+4)+2=x');
  for (const source of ['\\sqrt{x+4}+2=x', 'sqrt(x + 4) + 2 = x ', '√(x+4)+2=x']) {
    assert.deepEqual(text(solved(source).candidates), text(plain.candidates), source);
  }
  assert.deepEqual(text(solved('\\sqrt[3]{2x-1}=3').genuine), ['14']);
  assert.deepEqual(text(solved('\\sqrt{\\frac{1}{2}x+3}=2').genuine), ['2']);
  // The variable need not be x (the horizon-distance item is in h).
  const horizon = solved('sqrt(1.5h)=6', { variable: 'h' });
  assert.deepEqual(text(horizon.genuine), ['24']);
  assert.equal(horizon.shape.variable, 'h');
  // The radical may be on either side.
  assert.deepEqual(text(solved('x = sqrt(5x-6)').genuine), ['2', '3']);
});

test('family-formatted strings read as the equation they render', () => {
  // {{m|coef}}x {{b|term}} and {{k|signed}} leave stray spaces and a vanished term.
  assert.deepEqual(text(solved('sqrt(-x + 3) - 4 = x - 1').genuine), ['-1']);
  assert.deepEqual(text(solved('sqrt(4x ) + 3 = x + 3 ').candidates), ['0', '4']);
  assert.deepEqual(text(solved('2 nthRoot(3x - 5, 4) + 7 = 13').genuine), ['86/3']);
  assert.deepEqual(text(solved(' nthRoot(x + 4, 3) - 2 = 3').genuine), ['121']);
});

test('outside the verified scope the model says so instead of guessing', () => {
  const refused = {
    'sqrt(x+1)+sqrt(x)=3': 'two-radicals',
    'sqrt(x^2+1)=3': 'nonlinear',
    'sqrt(x)=x^2': 'nonlinear',
    'cbrt(x)=x': 'variable-beyond-square-root',
    'nthRoot(x,6)=2': 'index',
    'nthRoot(x,1)=2': 'index',
    'd=sqrt(2*g*h)': 'multiple-variables',
    '3x+1=7': 'no-radical',
    'sqrt(7)=x': 'constant-radicand',
    'sqrt(sqrt(x)+1)=2': 'nested-radical',
    // A radical that cancels would take its domain restriction with it.
    '0*sqrt(x-10)+sqrt(x+4)=x-2': 'cancelled-radical',
    'sqrt(x)-sqrt(x)+sqrt(x+9)=x-3': 'cancelled-radical',
    '2sqrt(x+4)-2sqrt(x+4)=0': 'cancelled-radical',
    'sqrt(x+1)': 'not-an-equation',
    'sqrt(x+1)=2=2': 'not-an-equation',
    'sqrt(3x 1)+1=x': 'syntax',
    'sin(x)=sqrt(x)': 'name',
  };
  for (const [source, reason] of Object.entries(refused)) {
    const parsed = parseRadicalEquation(source);
    assert.equal(parsed.ok, false, source);
    assert.equal(parsed.reason, reason, source);
    assert.equal(isSupportedRadicalEquation(source), false, source);
  }
  // Read, but the raised equation has no rational roots the lesson can factor.
  assert.equal(solveRadicalShape(parseRadicalEquation('sqrt(x+3)=x').shape).reason, 'irrational-candidates');
  assert.equal(solveRadicalShape(parseRadicalEquation('sqrt(2x+1)=x+3').shape).reason, 'no-real-candidates');
  assert.equal(isSupportedRadicalEquation('sqrt(x+3)=x'), false);
  // A pinned variable that is not the equation's is not the same equation.
  assert.equal(parseRadicalEquation('sqrt(x+4)=3', { variable: 'y' }).reason, 'multiple-variables');
  assert.equal(RADICAL_INDEX_RANGE.min, 2);
  assert.equal(RADICAL_INDEX_RANGE.max, 5);
});

test('real-domain restrictions: an even root needs a radicand of 0 or more, an odd root does not', () => {
  assert.equal(radicalDomainText(solved('sqrt(x+4)+2=x').shape), 'x + 4 ≥ 0');
  assert.equal(radicalDomainText(solved('sqrt(-7x+23)=x-5').shape), '-7x + 23 ≥ 0');
  assert.equal(radicalDomainText(solved('cbrt(2x-1)=3').shape), '', 'a cube root is defined for every real number');
  const shape = solved('sqrt(x+4)+2=x').shape;
  assert.deepEqual(radicalSidesAt(shape, rational(-5)), { defined: false, left: null, right: null }, 'sqrt(-1) is not a real number');
  assert.equal(radicalHoldsAt(shape, rational(5)), true);
  assert.equal(radicalHoldsAt(shape, rational(0)), false);
  assert.equal(radicalHoldsAt(shape, rational(-5)), false, 'outside the domain it does not hold');
  assert.equal(radicalHoldsAt(shape, rational(1, 3)), null, 'an irrational radical value is not claimed exact');
});

// ---------------------------------------------------------------------------
// The transitions
// ---------------------------------------------------------------------------

const equation = (expressions, original = 'sqrt(x+4)+2=x', extra = {}) => ({
  kind: 'relation', variable: 'x', branches: [{ expressions, relations: ['='] }], connective: null, special: null, original, ...extra,
});
const orBranches = (pairs) => ({
  ...equation(['0', '0']),
  branches: pairs.map((expressions) => ({ expressions, relations: ['='] })),
  connective: pairs.length > 1 ? 'OR' : null,
});
const valid = (before, after, context) => validateRelationTransition(before, after, context).valid;

test('raise both sides: only an isolated radical, only to its own index, and the student\'s line must follow', () => {
  const start = parseRelationSource('sqrt(x+4)+2=x');
  const isolated = equation(['sqrt(x+4)', 'x-2']);
  const raise = { kind: 'radicalRaise', branchIndex: 0, power: 2 };
  assert.equal(valid(isolated, equation(['x+4', 'x^2-4*x+4']), raise), true, 'the honest next line');
  assert.equal(valid(isolated, equation(['x+4', '(x-2)^2']), raise), true, 'left unexpanded is the same line');
  assert.equal(valid(isolated, equation(['x+4', 'x^2+4']), raise), false, '(x - 2)^2 is not x^2 + 4');
  assert.equal(valid(isolated, equation(['x+5', 'x^2-4*x+4']), raise), false, 'the radicand is x + 4');
  assert.equal(valid(isolated, equation(['x-2', 'x+4']), raise), false, 'sides swapped');
  assert.equal(valid(isolated, equation(['x+4', 'x^2-4*x+4']), { ...raise, power: 3 }), false, 'cubing does not undo a square root');
  assert.equal(valid(isolated, equation(['x+4', 'x^2-4*x+4']), { ...raise, power: 6 }), false, 'a power outside 2-5');
  assert.equal(valid(isolated, equation(['x+4', 'x^2-4*x+4']), { ...raise, power: null }), false);
  assert.equal(raiseRadicalRelation(start, 0, 2).ready, false, 'the radical is not alone yet');
  assert.match(raiseRadicalRelation(start, 0, 2).reason, /Isolate the radical/);
  assert.match(raiseRadicalRelation(isolated, 0, 3).reason, /power that matches/);
  // A coefficient in front of the radical means it is not isolated.
  assert.equal(raiseRadicalRelation(equation(['2*sqrt(x+4)', 'x']), 0, 2).ready, false);
  // The radical may be on the right.
  assert.equal(valid(equation(['x', 'sqrt(x+6)']), equation(['x^2', 'x+6']), raise), true);
  // Index 3, 4 and 5.
  assert.equal(valid(equation(['cbrt(2*x-1)', '3']), equation(['2*x-1', '27']), { ...raise, power: 3 }), true);
  assert.equal(valid(equation(['nthRoot(3*x+1, 4)', '2']), equation(['3*x+1', '16']), { ...raise, power: 4 }), true);
  assert.equal(valid(equation(['nthRoot(2*x+5, 5)', '3']), equation(['2*x+5', '243']), { ...raise, power: 5 }), true);
  assert.equal(valid(equation(['nthRoot(2*x+5, 5)', '3']), equation(['2*x+5', '125']), { ...raise, power: 5 }), false, '3^5 is not 125');
  // Raising is one equation's step, not a branch's.
  assert.equal(raiseRadicalRelation(orBranches([['sqrt(x)', '1'], ['x', '2']]), 0, 2).ready, false);
});

test('factor: the zero stays, the polynomial becomes an equal product of linear factors', () => {
  const standard = equation(['0', 'x^2-5*x']);
  const factor = { kind: 'factor', branchIndex: 0 };
  assert.equal(valid(standard, equation(['0', 'x*(x-5)']), factor), true);
  assert.equal(valid(equation(['x^2-5*x', '0']), equation(['x*(x-5)', '0']), factor), true, 'either side may hold the zero');
  assert.equal(valid(standard, equation(['0', 'x^2-5*x+0']), factor), false, 'the same sum is not factored');
  assert.equal(valid(standard, equation(['0', 'x*(x+5)']), factor), false, 'a different product');
  assert.equal(valid(standard, equation(['1', 'x*(x-5)']), factor), false, 'the zero must stay');
  assert.equal(valid(equation(['x+4', 'x^2-4*x+4']), equation(['x+4', '(x-2)^2']), factor), false, 'factor needs the 0 on one side first');
  assert.equal(valid(equation(['0', 'x^2+1']), equation(['0', '(x^2+1)*1']), factor), false, 'an irreducible factor');
  // Fractions, a leading constant, a repeated factor.
  assert.equal(valid(equation(['0', '4*x^2-9*x+2']), equation(['0', '(4*x-1)*(x-2)']), factor), true);
  assert.equal(valid(equation(['0', '2*x^2-14*x+24']), equation(['0', '2*(x-3)*(x-4)']), factor), true);
  assert.equal(valid(equation(['0', 'x^2-4*x+4']), equation(['0', '(x-2)^2']), factor), true);
  assert.equal(valid(equation(['0', 'x^2-4*x+4']), equation(['0', '(x-2)*(x-2)']), factor), true);
  assert.deepEqual(factoredProductOf('(x-3)^2'), { ok: true, factors: [{ expression: 'x - 3', multiplicity: 2 }], degree: 2 });
  assert.equal(factoredProductOf('x^2-5*x').ok, false);
  assert.equal(factoredProductOf('x-5').ok, false, 'one linear factor is not a factoring');
});

test('zero-product: one equation per distinct factor — unordered, a repeated factor once', () => {
  const split = { kind: 'zeroProduct', branchIndex: 0 };
  const product = equation(['0', 'x*(x-5)']);
  assert.deepEqual(zeroProductFactors(product, 0), ['x', 'x - 5']);
  assert.equal(valid(product, orBranches([['x', '0'], ['x-5', '0']]), split), true);
  assert.equal(valid(product, orBranches([['x-5', '0'], ['x', '0']]), split), true, 'order does not matter');
  assert.equal(valid(product, orBranches([['0', 'x'], ['0', 'x-5']]), split), true, 'zero on the left');
  assert.equal(valid(product, orBranches([['x', '0']]), split), false, 'a factor is missing');
  assert.equal(valid(product, orBranches([['x', '0'], ['x+5', '0']]), split), false, 'not a factor');
  assert.equal(valid(product, orBranches([['x', '1'], ['x-5', '1']]), split), false, 'each factor equals ZERO, not one');
  assert.equal(valid(product, { ...orBranches([['x', '0'], ['x-5', '0']]), connective: null }, split), false, 'the branches are joined by OR');
  // A fraction candidate keeps its factor as written.
  assert.equal(valid(equation(['0', '(4*x-1)*(x-2)']), orBranches([['4*x-1', '0'], ['x-2', '0']]), split), true);
  // A repeated root is written once (or twice).
  for (const repeated of ['(x-2)^2', '(x-2)*(x-2)']) {
    assert.equal(valid(equation(['0', repeated]), orBranches([['x-2', '0']]), split), true, repeated);
  }
  assert.equal(valid(equation(['0', '(x-2)^2']), orBranches([['x-2', '0'], ['x-2', '0']]), split), true);
  // Nothing to split in a single factor.
  assert.equal(zeroProductFactors(equation(['0', 'x-5']), 0), null);
  assert.equal(valid(equation(['0', 'x-5']), orBranches([['x-5', '0']]), split), false);
});

test('"no real solution" without algebra: only an isolated even root equal to a negative number', () => {
  const noSolution = (original) => ({ kind: 'relation', variable: 'x', branches: [], connective: null, special: 'noSolution', original });
  const negative = parseRelationSource('sqrt(x+1)=-3');
  assert.equal(obviousSpecialClaim(negative), 'noSolution');
  assert.equal(valid(negative, noSolution(negative.original), { kind: 'solutionClaim', claim: 'noSolution' }), true);
  // A false claim is refused.
  const real = parseRelationSource('sqrt(x+4)+2=x');
  assert.equal(valid(real, noSolution(real.original), { kind: 'solutionClaim', claim: 'noSolution' }), false);
  // Not the structural shape.
  assert.equal(obviousSpecialClaim(parseRelationSource('sqrt(x+1)=3')), null);
  assert.equal(obviousSpecialClaim(parseRelationSource('cbrt(x+1)=-3')), null, 'an odd root may be negative');
  assert.equal(obviousSpecialClaim(parseRelationSource('2*sqrt(x+1)=-3')), null, 'not isolated');
  assert.equal(obviousSpecialClaim(parseRelationSource('sqrt(-7x+23)=x-5')), null, 'this one is earned by checking both candidates');
});

test('a relation reaches the candidate check when the ORIGINAL contains a radical, and the tools are named', () => {
  assert.equal(relationStateNeedsCandidateCheck(parseRelationSource('sqrt(x+4)+2=x')), true);
  assert.equal(relationStateNeedsCandidateCheck(parseRelationSource('|2x-3|=7')), true, 'absolute value still does');
  assert.equal(relationStateNeedsCandidateCheck(parseRelationSource('3x+1=7')), false);
  assert.deepEqual(RADICAL_ALGEBRA_TOOLS.map((tool) => tool.id), ['raisePower', 'factor', 'zeroProduct']);
  assert.equal(isolatedRadicalInBranch(equation(['sqrt(x+4)', 'x-2']).branches[0]).index, 2);
  assert.equal(isolatedRadicalInBranch(equation(['sqrt(x+4)+2', 'x']).branches[0]), null);
  assert.deepEqual(relationSolutionSummary(orBranches([['x', '0'], ['x', '5']])).values, [0, 5]);
});

// ---------------------------------------------------------------------------
// The step reaches the server readable
// ---------------------------------------------------------------------------

test('every new transition survives the step envelope, bounded and typed; an unknown power is refused whole', () => {
  const before = equation(['sqrt(x+4)', 'x-2']);
  const after = equation(['x+4', 'x^2-4*x+4']);
  for (const [kind, stepKind, transition] of [
    ['radical-raise', 'radical-raise', { kind: 'radicalRaise', branchIndex: 0, power: 2 }],
    ['factor', 'factor', { kind: 'factor', branchIndex: 0 }],
    ['zero-product', 'zero-product', { kind: 'zeroProduct', branchIndex: 0 }],
  ]) {
    assert.ok(RELATION_STEP_KINDS.includes(stepKind), `${stepKind} is a known relation step kind`);
    const work = normalizeStepWork(relationStepWork({ kind, label: kind, before, after, transition }));
    assert.deepEqual(work?.transition, transition, `${kind}: the transition is kept as the validator reads it`);
  }
  assert.equal(
    normalizeStepWork(relationStepWork({ kind: 'radical-raise', before, after, transition: { kind: 'radicalRaise', branchIndex: 0, power: 9 } })),
    null,
    'a power the workspace never offers makes the whole step unreadable, not half-read',
  );
  assert.equal(
    normalizeStepWork(relationStepWork({ kind: 'radical-raise', before, after, transition: { kind: 'somethingElse' } })),
    null,
  );
});
