/*
 * SYSTEMS WORKSPACE — ALGEBRAIC MODE: ONE VERDICT, IN THE BROWSER AND ON THE SERVER.
 *
 * The 2×2 (AlgebraicSystemMode) and 3×3 (SubstitutionReductionMode /
 * EliminationReductionMode) Check handlers used to compute their verdicts
 * inline. They now ask the shared grader
 * (functions/shared/serverGrading/tools/systemsWorkspace/algebraic.mjs), the
 * function the server runs as the authority. These tests prove:
 *
 *   - every rubric (ordered pair, special case, ordered triple, 3×3
 *     interpretation) grades correct, wrong, partial, tampered and
 *     equivalent-form work the way the screen did;
 *   - the browser path (gradeToolCheck) and the server path
 *     (gradeServerResponse on the JSON the device sends) agree exactly;
 *   - the shared verdict equals the verdict the old inline handlers computed
 *     on the same student state (reproduced below as oracles);
 *   - the declaration resolves the same mode and dimension the screen renders;
 *   - work never carries a key or a verdict, and stays bounded.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import algebraicGraders, { solvedValuesWork, verificationSidesWork } from '../../functions/shared/serverGrading/tools/systemsWorkspace/algebraic.mjs';
import algebraicDeclarations from '../../functions/shared/serverGrading/declarations/systemsWorkspace/algebraic.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { toolModeSupport } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { NON_WORK_KEYS, TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { matchesNumericAnswer } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  algebraicSystemDimension,
  degenerateStatementTruth,
  isDegenerateStatement,
  isPlainArithmetic,
  linearEquationCoefficients,
  linearEquationForm,
  normalizeAlgebraicSystemConfig,
  parseNumericEntry,
  solveAlgebraicSystem,
  twoByTwoVerificationValid,
} from '../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { latexToExpression } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import * as R from '../../functions/shared/toolMath/systemsWorkspace/substitutionReduction.mjs';
import * as E from '../../functions/shared/toolMath/systemsWorkspace/eliminationReduction.mjs';
import { checkSubstitutedStatement, substitutedStatementSides } from '../../functions/shared/toolMath/systemsWorkspace/degenerateSubstitution.mjs';
import { planeTruthFor, planeWorkEarned } from '../../functions/shared/toolMath/systemsWorkspace/algebraicOutcomeModel.mjs';
import { planeRelationshipTypes } from '../../functions/shared/toolMath/systemsWorkspace/spatialFeedback.mjs';
import { resolveSystemsWorkspaceMode } from '../../functions/shared/toolMath/systemsWorkspace/systemsWorkspaceMode.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

const XYZ = ['x', 'y', 'z'];
const declaration = GRADING_MANIFEST.systemsWorkspace;

/* ---------------------------------------------------------------- fixtures */

// 2×2: y = 2x + 1, x + y = 7  ->  (2, 5)
const PAIR = { type: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', equations: ['y = 2x + 1', 'x + y = 7'], variables: ['x', 'y'] };
const PAIR_DEPENDENT = { type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', equations: ['x + y = 2', '2x + 2y = 4'] };
const PAIR_INCONSISTENT = { type: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', equations: ['x + y = 2', '2x + 2y = 5'] };
// 3×3: (1, 2, 3)
const TRIPLE_EQUATIONS = ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'];
const TRIPLE = { type: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', equations: TRIPLE_EQUATIONS };
// 3×3 whose solution is fractional: (1/3, 1/2, 7/6)
const FRACTIONAL = { type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', equations: ['x + y + z = 2', 'x - y + z = 1', '2x + y - z = 0'] };
const DEPENDENT = ['2x + y - 3z = 5', 'x + 2y - 4z = 7', '6x + 3y - 9z = 15'];
const INCONSISTENT = ['3x - y - 2z = 4', '6x - 2y - 4z = 11', '9x - 3y - 6z = 12'];
const ELIM_DEPENDENT = { type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', equations: DEPENDENT };
const ELIM_INCONSISTENT = { type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', equations: INCONSISTENT };

const pairWork = (overrides = {}) => ({
  dimension: 2,
  method: 'substitution',
  values: { x: 2, y: 5 },
  verification: { E1: { left: '5', right: '5' }, E2: { left: '7', right: '7' } },
  reducedStatement: null,
  specialCase: { statementTruth: '', solutionCount: '', classification: '' },
  ...overrides,
});
const specialCaseWork = (statement, truth, count, classification, overrides = {}) => pairWork({
  method: 'elimination',
  values: {},
  verification: {},
  reducedStatement: statement,
  specialCase: { statementTruth: truth, solutionCount: count, classification },
  ...overrides,
});
// The right sides of the 3×3 originals are written as numbers, so only the
// left sides are typed (verificationGivenSides).
const tripleWork = (overrides = {}) => ({
  dimension: 3,
  method: 'substitution',
  values: { x: 1, y: 2, z: 3 },
  verification: { E1: { left: '6', right: '' }, E2: { left: '9', right: '' }, E3: { left: '4', right: '' } },
  ...overrides,
});
const interpretationWork = (outcome, overrides = {}) => ({
  dimension: 3,
  method: 'elimination',
  values: {},
  verification: {},
  outcome,
  ...overrides,
});
const truthFor = (equations) => planeRelationshipTypes(equations.map((equation) => linearEquationForm(equation, XYZ)), XYZ);

/* ------------------------------------------------------------ both paths */

const verdict = (result) => ({ graded: result.graded, reason: result.graded ? null : result.reason, isCorrect: result.isCorrect, isComplete: result.isComplete, score: result.score, parts: result.parts });

/** Grade through the browser path and the server path; they must agree exactly. */
const both = (question, work) => {
  const browser = gradeToolCheck(systemsWorkspaceGrader, question, work);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.deepEqual(verdict(server), verdict(browser), 'the server must reach the browser\'s verdict on the same bytes');
  return browser;
};

const partsById = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part]));

/* ------------------------------------------------- declaration and modes */

test('the algebraic mode is declared shared-server and bound to a grader', () => {
  assert.equal(algebraicDeclarations.algebraic.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(declaration.modes.algebraic.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(typeof algebraicGraders.algebraic, 'function');
  assert.deepEqual(Object.keys(algebraicGraders), ['algebraic']);
  assert.equal(systemsWorkspaceGrader.modeGraders.algebraic, algebraicGraders.algebraic);
  assert.equal(declaration.contractVersion, 1);
});

test('the declaration resolves the mode SystemsWorkspace.jsx renders, and the grader the same dimension', () => {
  const cases = [
    // explicit algebraic 2×2
    [{ ...PAIR }, 'algebraic', 2],
    // old V5 content stored as "linear" but authored as an algebraic solve
    [{ type: 'systemsWorkspace', mode: 'linear', studentActions: ['solveSystem'], method: 'elimination', equations: ['x + y = 3', 'x - y = 1'] }, 'algebraic', 2],
    // the plain authored shape from #341: no mode at all
    [{ type: 'systemsWorkspace', equations: ['y = 2x + 1', 'x + y = 7'], variables: ['x', 'y'] }, 'algebraic', 2],
    // 3×3, with and without authored variables
    [{ ...TRIPLE }, 'algebraic', 3],
    [{ ...TRIPLE, variables: XYZ, method: 'studentChoice' }, 'algebraic', 3],
    // three equations but two variables: the screen renders the 2×2 workspace
    [{ type: 'systemsWorkspace', mode: 'algebraic', equations: TRIPLE_EQUATIONS, variables: ['x', 'y'] }, 'algebraic', 2],
    // not algebraic: the graph workspace and its unknown-mode fallback
    [{ type: 'systemsWorkspace', mode: 'linear', system: { m1: 2, b1: 1, m2: -1, b2: 7 } }, 'linear', null],
    [{ type: 'systemsWorkspace', mode: 'no-such-mode' }, 'linear', null],
  ];
  for (const [question, mode, dimension] of cases) {
    const component = resolveSystemsWorkspaceMode(question);
    // SystemsWorkspace renders LinearMode for any mode it does not know.
    const rendered = ['inequalities', 'linearQuadratic', 'matrix', 'matrix3', 'spatial', 'algebraic'].includes(component) ? component : 'linear';
    assert.equal(toolModeSupport(declaration, question).mode, rendered, JSON.stringify(question));
    assert.equal(rendered, mode);
    if (dimension) {
      assert.equal(algebraicSystemDimension(question), dimension);
      const result = systemsWorkspaceGrader.grade(question, dimension === 3 ? tripleWork() : pairWork());
      assert.equal(result.graded, true);
      assert.equal(result.mode, 'algebraic');
      assert.equal(result.parts.filter((part) => part.id.startsWith('value-')).length, dimension, 'graded with the dimension the screen renders');
    }
  }
});

test('old V5 content stored as "linear" is graded as the algebraic screen it renders, on both paths', () => {
  // The device stamps the stored mode ("linear") on the response; the server
  // re-resolves the mode from the question, never from the response.
  const legacy = { type: 'systemsWorkspace', mode: 'linear', studentActions: ['solveSystem'], method: 'elimination', equations: ['x + y = 3', 'x - y = 1'] };
  const work = pairWork({ method: 'elimination', values: { x: 2, y: 1 }, verification: { E1: { left: '3', right: '3' }, E2: { left: '1', right: '1' } } });
  const result = both(legacy, work);
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, true);
  assert.equal(gradeServerResponse({ question: legacy, response: result.toolResponse }).mode, 'algebraic');
  assert.equal(both(legacy, pairWork({ values: { x: 1, y: 2 } })).isCorrect, false);
});

/* --------------------------------------------------------- 2×2 ordered pair */

test('2×2: a solved, verified ordered pair is correct on both paths', () => {
  const result = both(PAIR, pairWork());
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.parts.map((part) => part.id), ['value-x', 'value-y', 'verify-E1', 'verify-E2']);
});

test('2×2: a wrong ordered pair is incorrect even when its verification arithmetic is right', () => {
  // (3, 4): E1 sides really are 4 and 7 — the arithmetic is right, the pair is not.
  const result = both(PAIR, pairWork({ values: { x: 3, y: 4 }, verification: { E1: { left: '4', right: '7' }, E2: { left: '7', right: '7' } } }));
  assert.equal(result.isCorrect, false);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 0);
  const parts = partsById(result);
  assert.equal(parts['value-x'].isCorrect, false);
  assert.equal(parts['verify-E1'].isCorrect, false, 'the two sides are not equal');
  assert.equal(parts['verify-E2'].isCorrect, true);
});

test('2×2: a right pair with wrong verification arithmetic is incorrect, and all-or-nothing', () => {
  const result = both(PAIR, pairWork({ verification: { E1: { left: '5', right: '6' }, E2: { left: '7', right: '7' } } }));
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0, 'the workspace never awarded partial credit');
  assert.equal(partsById(result)['verify-E1'].isCorrect, false);
});

test('2×2: partial work is incomplete and incorrect', () => {
  const firstOnly = both(PAIR, pairWork({ values: { y: 5 }, verification: {} }));
  assert.equal(firstOnly.isComplete, false);
  assert.equal(firstOnly.isCorrect, false);
  const unverified = both(PAIR, pairWork({ verification: {} }));
  assert.equal(unverified.isComplete, false, 'verification is required by default');
  assert.equal(unverified.isCorrect, false);
  const oneSide = both(PAIR, pairWork({ verification: { E1: { left: '5', right: '' }, E2: { left: '7', right: '7' } } }));
  assert.equal(oneSide.isComplete, false);
  assert.equal(oneSide.isCorrect, false);
  const empty = both(PAIR, { dimension: 2, method: '' });
  assert.equal(empty.graded, true);
  assert.equal(empty.isComplete, false);
  assert.equal(empty.isCorrect, false);
});

test('2×2: requireVerification:false grades the values alone, with the 0.05 tolerance', () => {
  const question = { ...PAIR, requireVerification: false };
  const result = both(question, pairWork({ verification: {} }));
  assert.equal(result.isCorrect, true);
  assert.deepEqual(result.parts.map((part) => part.id), ['value-x', 'value-y']);
  assert.equal(both(question, pairWork({ values: { x: 2.04, y: 4.96 } })).isCorrect, true, 'within 0.05');
  assert.equal(both(question, pairWork({ values: { x: 2.06, y: 5 } })).isCorrect, false, 'outside 0.05');
});

test('2×2: equivalent forms the workspace accepts are accepted', () => {
  // Typed sides as LaTeX fractions (MathInput), products and decimals.
  const forms = both(PAIR, pairWork({ verification: { E1: { left: '\\frac{10}{2}', right: '2(2)+1' }, E2: { left: '7.0', right: '\\frac{14}{2}' } } }));
  assert.equal(forms.isCorrect, true);
  // Fractional solutions arrive as Step Algebra's floats: 3x + 2y = 7, x - y = 1/3 -> (23/15, 6/5).
  const fractional = { ...PAIR, equations: ['3x + 2y = 7', 'x - y = 1/3'] };
  const work = pairWork({
    values: { x: 23 / 15, y: 6 / 5 },
    verification: { E1: { left: '7', right: '7' }, E2: { left: '\\frac{1}{3}', right: '1/3' } },
  });
  assert.equal(both(fractional, work).isCorrect, true);
  // Whichever variable was solved first, the values are keyed by variable.
  assert.equal(both(PAIR, pairWork({ values: { y: 5, x: 2 } })).isCorrect, true);
});

test('2×2: an unauthored question grades against the system the screen shows', () => {
  // normalizeAlgebraicSystemConfig: x - 2y = -3, 3x + 5y = 24 -> (3, 3); verification required.
  const unauthored = { type: 'systemsWorkspace', mode: 'algebraic' };
  const work = pairWork({ method: 'elimination', values: { x: 3, y: 3 }, verification: { E1: { left: '-3', right: '-3' }, E2: { left: '24', right: '24' } } });
  const result = both(unauthored, work);
  assert.equal(result.isCorrect, true);
  assert.equal(both(unauthored, pairWork()).isCorrect, false);
});

/* -------------------------------------------------------- 2×2 special case */

test('2×2 dependent: the identity and its three readings are correct; any wrong reading is not', () => {
  const right = both(PAIR_DEPENDENT, specialCaseWork('0 = 0', 'true', 'infinite', 'consistent-dependent'));
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.deepEqual(right.parts.map((part) => part.id), ['reduced-statement', 'statement-truth', 'solution-count', 'classification']);
  for (const wrong of [
    specialCaseWork('0 = 0', 'false', 'infinite', 'consistent-dependent'),
    specialCaseWork('0 = 0', 'true', 'none', 'consistent-dependent'),
    specialCaseWork('0 = 0', 'true', 'infinite', 'inconsistent'),
  ]) {
    const result = both(PAIR_DEPENDENT, wrong);
    assert.equal(result.isCorrect, false);
    assert.equal(result.isComplete, true);
    assert.equal(result.score, 0);
  }
});

test('2×2 inconsistent: the contradiction and its three readings', () => {
  assert.equal(both(PAIR_INCONSISTENT, specialCaseWork('0 = 1', 'false', 'none', 'inconsistent')).isCorrect, true);
  // A statement that does not match the system is not the student's reduction.
  assert.equal(both(PAIR_INCONSISTENT, specialCaseWork('0 = 0', 'false', 'none', 'inconsistent')).isCorrect, false);
  assert.equal(both(PAIR_INCONSISTENT, specialCaseWork('0 = 1', 'true', 'infinite', 'consistent-dependent')).isCorrect, false);
});

test('2×2 special case: unanswered readings are incomplete, never accidentally right', () => {
  // The old expression `(answer === 'true') === isTrue` read a blank as "false".
  const blank = both(PAIR_INCONSISTENT, specialCaseWork('0 = 1', '', 'none', 'inconsistent'));
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false);
  const noStatement = both(PAIR_INCONSISTENT, specialCaseWork(null, 'false', 'none', 'inconsistent'));
  assert.equal(noStatement.isComplete, false);
  assert.equal(noStatement.isCorrect, false);
});

test('the system decides the rubric, never the shape of the work', () => {
  // Special-case answers for a system with one solution, and an ordered pair
  // for a system without one, are both simply wrong.
  assert.equal(both(PAIR, specialCaseWork('0 = 0', 'true', 'infinite', 'consistent-dependent')).isCorrect, false);
  assert.equal(both(PAIR_DEPENDENT, pairWork({ values: { x: 1, y: 1 }, verification: { E1: { left: '2', right: '2' }, E2: { left: '4', right: '4' } } })).isCorrect, false);
  assert.equal(both(ELIM_DEPENDENT, tripleWork({ method: 'elimination', values: { x: 1, y: 1, z: 0 } })).isCorrect, false);
  assert.equal(both(TRIPLE, interpretationWork({ statement: '0 = 0', classificationChoice: 'infinite', planes: { '1-2': 'line', '1-3': 'line', '2-3': 'line' } }, { method: 'substitution' })).isCorrect, false);
});

/* --------------------------------------------------------- 3×3 ordered triple */

test('3×3 unique: solved and verified is correct, by either method', () => {
  for (const method of ['substitution', 'elimination', 'studentChoice']) {
    const question = { ...TRIPLE, method };
    const result = both(question, tripleWork({ method: method === 'studentChoice' ? 'elimination' : method }));
    assert.equal(result.isCorrect, true, method);
    assert.equal(result.score, 1);
    assert.deepEqual(result.parts.map((part) => part.id), ['value-x', 'value-y', 'value-z', 'verify-E1', 'verify-E2', 'verify-E3']);
  }
});

test('3×3 unique: wrong, partial and unverified work', () => {
  const wrong = both(TRIPLE, tripleWork({ values: { x: 1, y: 2, z: 4 } }));
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.isComplete, true);
  const partial = both(TRIPLE, tripleWork({ values: { y: 2, z: 3 }, verification: {} }));
  assert.equal(partial.isComplete, false, 'the reduced 2×2 is solved but the third value is not');
  assert.equal(partial.isCorrect, false);
  const unverified = both(TRIPLE, tripleWork({ verification: { E1: { left: '6', right: '' } } }));
  assert.equal(unverified.isComplete, false);
  assert.equal(unverified.isCorrect, false);
  const badArithmetic = both(TRIPLE, tripleWork({ verification: { ...tripleWork().verification, E2: { left: '8', right: '' } } }));
  assert.equal(badArithmetic.isCorrect, false);
  assert.equal(partsById(badArithmetic)['verify-E2'].isCorrect, false);
  // The relative 1e-6 rule, not the 2×2's 0.05.
  assert.equal(both({ ...TRIPLE, requireVerification: false }, tripleWork({ values: { x: 1.001, y: 2, z: 3 } })).isCorrect, false);
  assert.equal(both({ ...TRIPLE, requireVerification: false }, tripleWork({ values: { x: 1 + 1e-9, y: 2, z: 3 } })).isCorrect, true);
});

test('3×3 unique: fractional values and LaTeX verification entries', () => {
  const work = tripleWork({
    method: 'elimination',
    values: { x: 1 / 3, y: 1 / 2, z: 7 / 6 },
    // Right sides 2, 1 and 0 are written as numbers (given); only the left is typed.
    verification: { E1: { left: '2', right: '' }, E2: { left: '\\frac{2}{2}', right: '' }, E3: { left: '0', right: '' } },
  });
  assert.equal(both(FRACTIONAL, work).isCorrect, true);
});

test('3×3: the method screen, and systems the workspace refuses', () => {
  // studentChoice with no method chosen is the choice screen: nothing to grade yet.
  const choosing = both({ ...TRIPLE, method: 'studentChoice' }, { dimension: 3, method: '' });
  assert.equal(choosing.graded, true);
  assert.equal(choosing.isComplete, false);
  assert.equal(choosing.isCorrect, false);
  // A dependent or inconsistent 3×3 by substitution shows an "unsupported" notice
  // and no Check; an unreadable system does in both workspaces.
  const refusals = [
    [{ ...ELIM_DEPENDENT, method: 'substitution' }, tripleWork()],
    [{ ...ELIM_DEPENDENT, method: 'studentChoice' }, tripleWork({ method: 'substitution' })],
    [{ ...TRIPLE, method: 'elimination', equations: ['x + y + z = 6', 'x^2 + y = 3', 'z = 1'] }, tripleWork({ method: 'elimination' })],
  ];
  for (const [question, work] of refusals) {
    const result = both(question, work);
    assert.equal(result.graded, false);
    assert.equal(result.reason, 'unsupported-system');
  }
});

test('3×3: an authored method decides the route; only studentChoice reads the method the work names', () => {
  // Algebraic3SystemMode renders the AUTHORED method's workspace; the work's
  // `method` matters only when the student picked it.
  const interpretation = interpretationWork({ statement: '0 = 0', classificationChoice: 'infinite', planes: truthFor(DEPENDENT) });
  // Authored substitution on a dependent 3×3 is the "unsupported" notice,
  // whatever route the work claims.
  const claimsElimination = both({ ...ELIM_DEPENDENT, method: 'substitution' }, { ...interpretation, method: 'elimination' });
  assert.equal(claimsElimination.graded, false);
  assert.equal(claimsElimination.reason, 'unsupported-system');
  // Authored elimination is graded as elimination even if the work names substitution.
  const claimsSubstitution = both(ELIM_DEPENDENT, { ...interpretation, method: 'substitution' });
  assert.equal(claimsSubstitution.graded, true);
  assert.equal(claimsSubstitution.isCorrect, true);
  // Under studentChoice the pick is the student's, so it routes the grade.
  assert.equal(both({ ...ELIM_DEPENDENT, method: 'studentChoice' }, interpretation).isCorrect, true);
  assert.equal(both({ ...ELIM_DEPENDENT, method: 'studentChoice' }, { ...interpretation, method: 'substitution' }).reason, 'unsupported-system');
});

test('3×3: an unauthored method is the student\'s choice, and verification is still required', () => {
  // normalizeAlgebraicSystemConfig: no method -> studentChoice; no requireVerification -> required.
  const unauthored = { type: 'systemsWorkspace', mode: 'algebraic', equations: TRIPLE_EQUATIONS };
  const choosing = both(unauthored, { dimension: 3, method: '' });
  assert.equal(choosing.graded, true);
  assert.deepEqual(choosing.parts.map((part) => part.id), ['method']);
  assert.equal(choosing.isComplete, false);
  for (const method of ['substitution', 'elimination']) {
    assert.equal(both(unauthored, tripleWork({ method })).isCorrect, true, method);
    const unverified = both(unauthored, tripleWork({ method, verification: {} }));
    assert.equal(unverified.isComplete, false, method);
    assert.equal(unverified.isCorrect, false, method);
  }
});

/* ------------------------------------------------- 3×3 interpretation */

test('3×3 dependent (elimination): statement, classification and every plane pair must be right', () => {
  const truth = truthFor(DEPENDENT);
  assert.deepEqual(truth, { '1-2': 'line', '1-3': 'coincident', '2-3': 'line' });
  const right = interpretationWork({ statement: '0 = 0', classificationChoice: 'infinite', planes: truth });
  const result = both(ELIM_DEPENDENT, right);
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.deepEqual(result.parts.map((part) => part.id), ['statement', 'classification', 'planes-1-2', 'planes-1-3', 'planes-2-3']);
  // The identity from the reduced 2×2 in the student's own numbers (27 = 27) is as good as 0 = 0.
  assert.equal(both(ELIM_DEPENDENT, interpretationWork({ ...right.outcome, statement: '27 = 27' })).isCorrect, true);
  for (const outcome of [
    { ...right.outcome, classificationChoice: 'none' },
    { ...right.outcome, classificationChoice: 'unique' },
    { ...right.outcome, statement: '0 = 4' },
    { ...right.outcome, planes: { ...truth, '1-3': 'parallel' } },
  ]) {
    const wrong = both(ELIM_DEPENDENT, interpretationWork(outcome));
    assert.equal(wrong.isCorrect, false, JSON.stringify(outcome));
    assert.equal(wrong.isComplete, true);
  }
  const unstated = both(ELIM_DEPENDENT, interpretationWork({ ...right.outcome, planes: { '1-2': 'line' } }));
  assert.equal(unstated.isComplete, false);
  assert.equal(unstated.isCorrect, false);
  const nothing = both(ELIM_DEPENDENT, interpretationWork(null));
  assert.equal(nothing.isComplete, false);
  assert.equal(nothing.isCorrect, false);
});

test('3×3 inconsistent (elimination): a contradiction, and studentChoice routed to elimination', () => {
  const truth = truthFor(INCONSISTENT);
  const work = interpretationWork({ statement: '0 = 9/2', classificationChoice: 'none', planes: truth });
  assert.equal(both(ELIM_INCONSISTENT, work).isCorrect, true);
  assert.equal(both({ ...ELIM_INCONSISTENT, method: 'studentChoice' }, work).isCorrect, true);
  assert.equal(both(ELIM_INCONSISTENT, interpretationWork({ ...work.outcome, statement: '0 = 4.5' })).isCorrect, true, 'the same statement as a decimal');
  assert.equal(both(ELIM_INCONSISTENT, interpretationWork({ ...work.outcome, classificationChoice: 'infinite' })).isCorrect, false);
});

/* ------------------------------------------------- tampered and malformed work */

test('work that is not an object is not graded, on either path', () => {
  for (const work of [null, undefined, 'x = 2, y = 5', 42, [], [2, 5]]) {
    const result = both(PAIR, work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
});

test('wrong types are read as missing, never coerced into a right answer', () => {
  const stringValues = both(PAIR, pairWork({ values: { x: '2', y: '5' } }));
  assert.equal(stringValues.isComplete, false, 'the screen holds solved values as numbers');
  assert.equal(stringValues.isCorrect, false);
  for (const work of [
    pairWork({ values: 'x=2,y=5' }),
    pairWork({ values: [2, 5] }),
    pairWork({ values: { x: Infinity, y: 5 } }),
    pairWork({ values: { x: Number.NaN, y: 5 } }),
    pairWork({ verification: 'checked' }),
    pairWork({ verification: [{ left: '5', right: '5' }, { left: '7', right: '7' }] }),
    pairWork({ verification: { E1: { left: '5', right: '5', checked: true, valid: true }, E2: { checked: true, valid: true } } }),
  ]) {
    const result = both(PAIR, work);
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false, JSON.stringify(work));
  }
  assert.equal(both(PAIR_DEPENDENT, specialCaseWork('0 = 0', true, 'infinite', 'consistent-dependent')).isCorrect, false, 'a boolean is not the select\'s value');
  assert.equal(both(PAIR_DEPENDENT, specialCaseWork('0 = 0', 'yes', 'infinite', 'consistent-dependent')).isCorrect, false);
  assert.equal(both(ELIM_DEPENDENT, interpretationWork({ statement: '0 = 0', classificationChoice: 'infinite', planes: 'line,coincident,line' })).isCorrect, false);
  assert.equal(both(ELIM_DEPENDENT, interpretationWork({ statement: 42, classificationChoice: ['infinite'], planes: truthFor(DEPENDENT) })).isCorrect, false);
});

test('injected verdicts and answer keys are stripped and change nothing', () => {
  const clean = both(PAIR, pairWork({ values: { x: 3, y: 4 } }));
  assert.equal(clean.isCorrect, false);
  const injected = {
    ...pairWork({ values: { x: 3, y: 4 } }),
    isCorrect: true,
    score: 1,
    correct: true,
    expected: { type: 'one', x: 3, y: 4 },
    solution: { x: 3, y: 4 },
    answerKey: { x: 3, y: 4 },
    checks: [true, true],
    verification: { E1: { left: '4', right: '7', checked: true, valid: true, isCorrect: true }, E2: { left: '7', right: '7', graded: true } },
  };
  const { dropped } = boundToolWork(injected);
  for (const key of ['isCorrect', 'score', 'correct', 'expected', 'solution', 'answerKey', 'checks', 'graded']) assert.ok(dropped.includes(key), key);
  const result = both(PAIR, injected);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  // Prototype keys from a parsed payload are dropped too.
  const polluted = JSON.parse('{"__proto__":{"isCorrect":true},"dimension":2,"values":{"x":3,"y":4}}');
  assert.equal(both(PAIR, polluted).isCorrect, false);
});

test('only plain arithmetic is ever evaluated, in the browser check and on the server', () => {
  // Every form a student types into a side box still reads as its number…
  for (const [typed, value] of [['7', 7], ['-3', -3], ['2.5', 2.5], ['\\frac{5}{3}', 5 / 3], ['-\\frac{1}{2}', -0.5], ['2\\cdot3+1', 7], ['2(3)+1', 7], ['\\left(2\\right)\\left(3\\right)', 6], ['3^{2}', 9], ['\\sqrt{4}', 2], ['-(2)-(3)+6', 1], ['4!', 24], ['1e-7', 1e-7]]) {
    assert.ok(Math.abs(parseNumericEntry(typed) - value) < 1e-12, typed);
    assert.equal(isPlainArithmetic(latexToExpression(typed)), true, typed);
  }
  // …but mathjs's wider library — matrices, ranges, strings, units, globals —
  // is never run: `sum(ones(20000, 20000))` would exhaust a server's memory.
  for (const typed of ['sum(ones(2,2))+1', 'sum(range(1,3))', '[5]', '"5"', 'true', 'createUnit("q")', '5 cm', 'x', 'f(x)=5', 'evaluate("5")']) {
    assert.ok(Number.isNaN(parseNumericEntry(typed)), typed);
  }
  // Before this guard `sum(ones(2,2))+1` read as 5 and verified E1's right side.
  const disguised = both(PAIR, pairWork({ verification: { E1: { left: '5', right: 'sum(ones(2,2))+1' }, E2: { left: '7', right: '7' } } }));
  assert.equal(partsById(disguised)['verify-E1'].isCorrect, false);
  assert.equal(disguised.isCorrect, false);
  // A statement a client sends is held to the same rule, in the system's variables.
  assert.equal(isPlainArithmetic('0', XYZ), true);
  assert.equal(isPlainArithmetic('2x - y', XYZ), true);
  assert.equal(isPlainArithmetic('2w', XYZ), false);
  const truth = truthFor(DEPENDENT);
  assert.equal(both(ELIM_DEPENDENT, interpretationWork({ statement: 'sum(ones(1,1)) = 1', classificationChoice: 'infinite', planes: truth })).isCorrect, false);
  assert.equal(both(PAIR_DEPENDENT, specialCaseWork('det(ones(2,2)) = 0', 'true', 'infinite', 'consistent-dependent')).isCorrect, false);
  // The minus sign a typeset statement can carry is still the student's minus.
  assert.equal(both(ELIM_INCONSISTENT, interpretationWork({ statement: '0 = −9/2', classificationChoice: 'none', planes: truthFor(INCONSISTENT) })).isCorrect, true);
});

test('oversize work is refused as a whole, never graded in part', () => {
  const huge = pairWork({ notes: Array.from({ length: 40 }, (_, index) => `${index}`.padEnd(900, '·')) });
  assert.ok(JSON.stringify(huge).length > TOOL_RESPONSE_LIMITS.maxJsonLength);
  const result = both(PAIR, huge);
  assert.equal(result.graded, false);
  assert.equal(result.reason, 'oversize-response');
});

/* --------------------------------------------------------- discrimination */

test('correct work against an altered key is incorrect', () => {
  assert.equal(both({ ...PAIR, equations: ['y = 2x + 2', 'x + y = 7'] }, pairWork()).isCorrect, false);
  assert.equal(both({ ...PAIR, requireVerification: false, equations: ['y = 2x + 2', 'x + y = 7'] }, pairWork()).isCorrect, false);
  assert.equal(both({ ...TRIPLE, equations: ['x + y + z = 7', '2x - y + 3z = 9', '3x + 2y - z = 4'] }, tripleWork()).isCorrect, false);
  assert.equal(both({ ...TRIPLE, requireVerification: false, equations: ['x + y + z = 7', '2x - y + 3z = 9', '3x + 2y - z = 4'] }, tripleWork()).isCorrect, false);
  // The dependent system's interpretation is wrong for the inconsistent one.
  assert.equal(both(ELIM_INCONSISTENT, interpretationWork({ statement: '0 = 0', classificationChoice: 'infinite', planes: truthFor(DEPENDENT) })).isCorrect, false);
  // An identity's readings are wrong for a contradiction.
  assert.equal(both(PAIR_INCONSISTENT, specialCaseWork('0 = 0', 'true', 'infinite', 'consistent-dependent')).isCorrect, false);
});

/* ------------------------------------------- parity with the old inline verdicts */

/*
 * The verdicts the Check handlers computed inline before this change,
 * reproduced only as oracles: the shared grader must reach the same verdict
 * and score on the same student state.
 */
const legacyTwoByTwo = (question, { solution, typed, reducedStatement, specialCase }) => {
  const config = normalizeAlgebraicSystemConfig(question);
  const reduce = reducedStatement ? linearEquationCoefficients(reducedStatement, config.variables) : null;
  const isDegenerate = reduce ? isDegenerateStatement(reduce) : false;
  const degenerateTruth = isDegenerate ? degenerateStatementTruth(reduce) : null;
  // "Check equation n" stored checked/valid for what was typed.
  const verification = [0, 1].map((index) => (solution && typed?.[index]
    ? { checked: true, valid: twoByTwoVerificationValid(config.equations[index], solution, typed[index][0], typed[index][1]) }
    : { checked: false, valid: false }));
  const allVerified = solution && verification[0].checked && verification[0].valid && verification[1].checked && verification[1].valid;
  const specialCaseCorrect = specialCase && degenerateTruth && (
    (specialCase.isTrueAnswer === 'true') === degenerateTruth.isTrue
    && specialCase.solutionsAnswer === (degenerateTruth.isTrue ? 'infinite' : 'none')
    && specialCase.classificationAnswer === (degenerateTruth.isTrue ? 'consistent-dependent' : 'inconsistent'));
  const expected = solveAlgebraicSystem(config.coefficients);
  const isCorrect = isDegenerate
    ? Boolean(specialCaseCorrect)
    : Boolean(solution && expected.type === 'one'
      && matchesNumericAnswer(solution[config.variables[0]], expected.x, 0.05)
      && matchesNumericAnswer(solution[config.variables[1]], expected.y, 0.05)
      && (!config.requireVerification || allVerified));
  return { isCorrect, score: isCorrect ? 1 : 0 };
};

// The same state, as AlgebraicSystemMode now hands it to the grader.
const twoByTwoWorkFromState = ({ solution, typed, reducedStatement, specialCase }, method = 'substitution') => ({
  dimension: 2,
  method,
  values: solvedValuesWork(solution || {}),
  verification: verificationSidesWork(Object.fromEntries((typed || []).map(([leftAnswer, rightAnswer], index) => [`E${index + 1}`, { leftAnswer, rightAnswer }]))),
  reducedStatement: reducedStatement || null,
  specialCase: {
    statementTruth: specialCase?.isTrueAnswer || '',
    solutionCount: specialCase?.solutionsAnswer || '',
    classification: specialCase?.classificationAnswer || '',
  },
});

test('2×2 parity: the shared verdict equals the old inline verdict on the same screen state', () => {
  const states = [
    [PAIR, { solution: { y: 5, x: 2 }, typed: [['5', '5'], ['7', '7']] }],
    [PAIR, { solution: { y: 5, x: 2 }, typed: [['5', '6'], ['7', '7']] }],
    [PAIR, { solution: { y: 4, x: 3 }, typed: [['4', '7'], ['7', '7']] }],
    [{ ...PAIR, requireVerification: false }, { solution: { y: 5.03, x: 2.01 } }],
    [{ ...PAIR, requireVerification: false }, { solution: { y: 5.2, x: 2 } }],
    [{ type: 'systemsWorkspace', mode: 'algebraic' }, { solution: { x: 3, y: 3 }, typed: [['-3', '-3'], ['\\frac{48}{2}', '24']] }],
    [PAIR_DEPENDENT, { reducedStatement: '0 = 0', specialCase: { isTrueAnswer: 'true', solutionsAnswer: 'infinite', classificationAnswer: 'consistent-dependent' } }],
    [PAIR_DEPENDENT, { reducedStatement: '0 = 0', specialCase: { isTrueAnswer: 'true', solutionsAnswer: 'none', classificationAnswer: 'consistent-dependent' } }],
    [PAIR_INCONSISTENT, { reducedStatement: '0 = 1', specialCase: { isTrueAnswer: 'false', solutionsAnswer: 'none', classificationAnswer: 'inconsistent' } }],
    [PAIR_INCONSISTENT, { reducedStatement: '0 = 1', specialCase: { isTrueAnswer: 'true', solutionsAnswer: 'none', classificationAnswer: 'inconsistent' } }],
  ];
  for (const [question, state] of states) {
    const legacy = legacyTwoByTwo(question, state);
    const shared = both(question, twoByTwoWorkFromState(state));
    assert.deepEqual({ isCorrect: shared.isCorrect, score: shared.score }, legacy, JSON.stringify(state));
  }
});

// The 3×3 substitution round, played through its own transitions.
const TRIPLE_SYSTEM = R.buildReductionSystem({ variables: XYZ, equations: TRIPLE_EQUATIONS });
const REDUCED = { y: 2, z: 3 };
const play = (state, ...moves) => moves.reduce((current, move) => {
  const { state: next, feedback } = move(current);
  assert.equal(feedback, null, JSON.stringify(feedback));
  return next;
}, state);
const solvedRound = (reducedSolution, backValue) => play(
  R.emptyReductionState(),
  (s) => R.chooseReductionSource(s, TRIPLE_SYSTEM, 'E1', 'x'),
  (s) => R.recordIsolatedExpression(s, TRIPLE_SYSTEM, '-(y) - (z) + (6)'),
  (s) => R.useIsolatedExpressionAsToken(s, TRIPLE_SYSTEM),
  (s) => R.attemptTargetSubstitution(s, TRIPLE_SYSTEM, 'E2', 'x'),
  (s) => R.attemptTargetSubstitution(s, TRIPLE_SYSTEM, 'E3', 'x'),
  (s) => R.openTargetSimplification(s, 'E2'),
  (s) => R.recordTargetStandardForm(s, TRIPLE_SYSTEM, 'E2', '-3 y+ z = -3'),
  (s) => R.recordTargetStandardForm(s, TRIPLE_SYSTEM, 'E3', '- y-4 z = -14'),
  (s) => R.attemptBackPlacement(s, TRIPLE_SYSTEM, reducedSolution, R.RELATION_DESTINATION_ID, 'y', 'y'),
  (s) => R.attemptBackPlacement(s, TRIPLE_SYSTEM, reducedSolution, R.RELATION_DESTINATION_ID, 'z', 'z'),
  (s) => R.recordBackSolve(s, backValue, String(backValue)),
);
const verifyRound = (state, reducedSolution, typedLeft) => {
  const solution = R.knownSolution(state, reducedSolution);
  return TRIPLE_SYSTEM.equations.reduce((current, equation) => {
    let next = current;
    R.verificationVariables(TRIPLE_SYSTEM, equation.id).forEach((name) => { next = R.placeVerificationValue(next, TRIPLE_SYSTEM, equation.id, name, name).state; });
    next = R.setVerificationAnswer(next, equation.id, 'leftAnswer', typedLeft[equation.id]).state;
    return R.checkVerification(next, TRIPLE_SYSTEM, solution, equation.id).state;
  }, state);
};
// The same state, as SubstitutionReductionMode now hands it to the grader.
const substitutionWorkFromState = (state, reducedSolution) => ({
  dimension: 3,
  method: 'substitution',
  values: solvedValuesWork(R.knownSolution(state, reducedSolution)),
  verification: verificationSidesWork(state.verification),
});

test('3×3 substitution parity: the shared verdict equals gradeReduction on states the round really reaches', () => {
  const cases = [
    ['complete and verified', verifyRound(solvedRound(REDUCED, 1), REDUCED, { E1: '6', E2: '9', E3: '4' }), REDUCED, true],
    ['verification arithmetic wrong', verifyRound(solvedRound(REDUCED, 1), REDUCED, { E1: '6', E2: '8', E3: '4' }), REDUCED, true],
    ['back-substitution solved but not verified', solvedRound(REDUCED, 1), REDUCED, true],
    ['wrong reduced solution, honestly verified', verifyRound(solvedRound({ y: 2, z: 4 }, 0), { y: 2, z: 4 }, { E1: '6', E2: '10', E3: '3' }), { y: 2, z: 4 }, true],
    ['verification turned off', solvedRound(REDUCED, 1), REDUCED, false],
    ['wrong values, verification turned off', solvedRound({ y: 2, z: 4 }, 0), { y: 2, z: 4 }, false],
  ];
  for (const [label, state, reducedSolution, requireVerification] of cases) {
    const legacy = R.gradeReduction(state, TRIPLE_SYSTEM, reducedSolution, { requireVerification });
    const shared = both({ ...TRIPLE, requireVerification }, substitutionWorkFromState(state, reducedSolution));
    assert.equal(shared.isCorrect, legacy.isCorrect, label);
    assert.equal(shared.score, legacy.isCorrect ? 1 : 0, label);
  }
});

// The 3×3 elimination round, played through its own transitions (as the
// Day 2 journeys do).
const eliminationJourney = (equations) => {
  const system = R.buildReductionSystem({ variables: XYZ, equations });
  let state = E.chooseEliminationVariable(E.emptyEliminationState(), system, 'x').state;
  const act = (fn, ...args) => { state = E.repairEliminationState(fn(state, ...args).state, system); };
  const round = (key, pairId, scaled, factor, products, operation, terms) => {
    act(E.chooseEliminationPair, system, key, pairId);
    if (scaled) {
      act(E.setEliminationMultiplierDraft, key, scaled, factor);
      act(E.applyEliminationMultiplier, system, key, scaled);
      for (const [name, value] of Object.entries(products)) act(E.setEliminationMultiplierProductTerm, key, scaled, name, value);
      act(E.checkEliminationMultiplierProducts, system, key, scaled);
    }
    act(E.setEliminationOperation, key, operation);
    for (const id of state.rounds[key].pair) act(E.toggleEliminationCancellation, system, key, id);
    for (const [name, value] of Object.entries(terms)) act(E.setEliminationCombinationTerm, key, name, value);
    act(E.checkEliminationCombination, system, key);
  };
  return { system, round, act, get state() { return state; } };
};

test('3×3 elimination parity: a contradiction reached by the rows grades as EliminationReductionMode did', () => {
  const journey = eliminationJourney(INCONSISTENT);
  journey.round('round1', 'E1E3', 'E1', '3', { x: '9', y: '-3', z: '-6', constant: '12' }, 'subtract', { y: '0', z: '0', constant: '0' });
  journey.round('round2', 'E2E3', 'E2', '3/2', { x: '9', y: '-3', z: '-6', constant: '33/2' }, 'subtract', { y: '0', z: '0', constant: '9/2' });
  const outcome = E.eliminationOutcome(journey.state, journey.system);
  assert.equal(outcome.type, 'none');
  const planeQuestion = { ...ELIM_INCONSISTENT, equations: journey.system.equations.map((equation) => equation.text), variables: XYZ };
  const truth = planeTruthFor(planeQuestion);
  const scenarios = [
    ['right classification and planes', 'none', { answers: truth, checked: true }],
    ['wrong classification recorded', 'infinite', { answers: truth, checked: true }],
    ['right classification, wrong planes', 'none', { answers: { ...truth, '1-2': 'line' }, checked: true }],
  ];
  for (const [label, choice, planeWork] of scenarios) {
    const state = E.classifyEliminationOutcome(journey.state, journey.system, choice).state;
    // EliminationReductionMode's old inline verdict for an outcome:
    // isCorrect = classified && planesEarned.
    const classified = E.eliminationPhase(state, journey.system) === 'classified';
    const legacy = Boolean(classified && planeWorkEarned(planeWork, planeQuestion));
    // ...and the work it now submits.
    const work = interpretationWork({
      statement: outcome.statement,
      classificationChoice: state.classification?.statement === outcome.statement ? state.classification.choice : '',
      planes: planeWork.answers,
    });
    assert.equal(both(ELIM_INCONSISTENT, work).isCorrect, legacy, label);
  }
});

test('3×3 elimination parity: an identity reached in the reduced 2×2, in the student\'s own numbers', () => {
  // The dependent system's rows are never zero; the reduced 2×2 reaches the identity.
  const reduced = ['-3y + 5z = -9', '9y - 15z = 27'];
  const sides = substitutedStatementSides('9((5z + 9)/3) - 15z = 27', ['y', 'z']);
  const checked = checkSubstitutedStatement(sides, { left: '27' });
  assert.equal(checked.valid, true);
  assert.equal(checked.type, 'infinite');
  assert.ok(reduced.length === 2);
  const work = interpretationWork({ statement: checked.statement, classificationChoice: 'infinite', planes: truthFor(DEPENDENT) });
  assert.equal(both(ELIM_DEPENDENT, work).isCorrect, true);
});

/* ------------------------------------------------- the work is work, bounded */

test('realistic maximal work carries no key or verdict and fits the response contract', () => {
  const long = (seed) => `\\frac{${'2(3)+'.repeat(40)}${seed}}{1}`;
  const works = [
    [PAIR, { ...pairWork({ verification: { E1: { left: long(5), right: long(5) }, E2: { left: long(7), right: long(7) } } }), efficiencyReason: 'y is already isolated, so substitution is one step shorter. '.repeat(15) }],
    [PAIR_DEPENDENT, specialCaseWork('0 = 0', 'true', 'infinite', 'consistent-dependent')],
    [TRIPLE, tripleWork({ values: { x: 1 / 3, y: 2 / 7, z: 13 / 11 }, verification: { E1: { left: long(1), right: long(2) }, E2: { left: long(3), right: long(4) }, E3: { left: long(5), right: long(6) } } })],
    [ELIM_DEPENDENT, interpretationWork({ statement: '-27/4 = -27/4', classificationChoice: 'infinite', planes: truthFor(DEPENDENT) }, { values: { y: 1, z: 2 }, verification: {} })],
  ];
  for (const [question, work] of works) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, [], 'no student field may share a name with a stripped key');
    assert.equal(bounded.truncated, false);
    assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength);
    const keys = JSON.stringify(work).match(/"([^"]+)":/g).map((match) => match.slice(1, -2));
    for (const key of keys) assert.ok(!NON_WORK_KEYS.includes(key), key);
    assert.doesNotMatch(canonicalToolWorkJson(work), /"(expected|answer|solution|valid|checked|isCorrect|score)"/);
    const result = both(question, work);
    assert.equal(result.graded, true);
  }
});

test('the work helpers keep only what the student did', () => {
  assert.deepEqual(solvedValuesWork({ x: 2, y: Number.NaN, z: '3', w: Infinity, v: -0.5 }), { x: 2, v: -0.5 });
  assert.deepEqual(solvedValuesWork(null), {});
  assert.deepEqual(
    verificationSidesWork({ E1: { placed: { x: true }, leftAnswer: '6', rightAnswer: '', checked: true, valid: true }, E2: null, E3: 'x' }),
    { E1: { left: '6', right: '' } },
  );
});

/* ----------------------------------------------- the screens use the grader */

const source = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('every algebraic Check handler marks through the shared grader and submits the work it reports', () => {
  for (const path of [
    'src/tools/systemsWorkspace/AlgebraicSystemMode.jsx',
    'src/tools/systemsWorkspace/SubstitutionReductionMode.jsx',
    'src/tools/systemsWorkspace/EliminationReductionMode.jsx',
  ]) {
    const component = source(path);
    assert.match(component, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/, path);
    assert.match(component, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/, path);
    assert.match(component, /import systemsWorkspaceGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/systemsWorkspace\.mjs';/, path);
    const check = region(component, 'const check = () => {', '\n  };', `${path} check`);
    assert.match(check, /const result = gradeToolCheck\(systemsWorkspaceGrader, questionData, work\);/, path);
    assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{/, path);
    assert.match(check, /parts: result\.parts/, path);
    // No verdict of its own, and no key in what it sends.
    assert.doesNotMatch(check, /matchesNumericAnswer|gradeReduction|reductionAnswerKey|solveAlgebraicSystem|planeWorkEarned|1e-6|0\.05|expected|answerKey/, path);
    // The live work is the object Check submits.
    const work = region(component, 'const work = {', 'const check = () => {', `${path} work`);
    assert.match(work, /useReportToolWork\(work(?:, \{ enabled: !subsystem \})?\);/, path);
    assert.doesNotMatch(work, /checked|valid:|expected|answerKey/, path);
  }
  // A reduced subsystem inside a 3×3 neither reports nor submits: its parent does.
  assert.match(source('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'), /useReportToolWork\(work, \{ enabled: !subsystem \}\);/);
  // The method choice screen reports that there is no work yet.
  assert.match(source('src/tools/systemsWorkspace/Algebraic3SystemMode.jsx'), /useReportToolWork\(\{ dimension: config\.dimension, method: '' \}, \{ enabled: isStudentChoice && !effectiveMethod \}\);/);
  // EliminationReductionMode sends the classification the student RECORDED,
  // never the outcome type its rows imply (which always equals the key).
  const elimination = source('src/tools/systemsWorkspace/EliminationReductionMode.jsx');
  const work = region(elimination, 'const work = {', 'const check = () => {', 'elimination work');
  assert.match(work, /classificationChoice: recordedClassification/);
  assert.doesNotMatch(work, /outcome\.type/);
});

/*
 * The grader reads named fields of the work. Nothing here renders React, so
 * the only way to prove each screen writes its state under THOSE names — a
 * renamed field would mark every honest student wrong, on screen and on the
 * server alike — is to read the work literal each screen builds.
 */
test('each screen writes its work under the field names the grader reads', () => {
  const twoByTwo = region(source('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'), 'const work = {', 'useReportToolWork(work', '2×2 work');
  // The solved values, keyed by the variable each solve was for.
  assert.match(twoByTwo, /values: solvedValuesWork\(\{[^]*?\[survivingVariable\]: firstSolved\.value[^]*?\[removedVariable\]: secondSolved\.value[^]*?\}\)/);
  // Each original equation's typed sides, under the grader's E1 / E2 ids.
  assert.match(twoByTwo, /verification: verificationSidesWork\(\{ E1: verification\[0\], E2: verification\[1\] \}\)/);
  // The no-variable statement the reduction reached — only once it has.
  assert.match(twoByTwo, /reducedStatement: isDegenerate \? formatLinearEquation\(reduceCoefficients, variables\) : null/);
  // The three special-case selects.
  assert.match(twoByTwo, /statementTruth: specialCase\?\.isTrueAnswer \|\| ''/);
  assert.match(twoByTwo, /solutionCount: specialCase\?\.solutionsAnswer \|\| ''/);
  assert.match(twoByTwo, /classification: specialCase\?\.classificationAnswer \|\| ''/);

  // Every value found so far: the reduced 2×2's, then the back-solved third.
  const substitutionSource = source('src/tools/systemsWorkspace/SubstitutionReductionMode.jsx');
  assert.match(substitutionSource, /const solution = knownSolution\(reduction, reducedSolution\);/);
  const substitution = region(substitutionSource, 'const work = {', 'useReportToolWork(work', '3×3 substitution work');
  assert.match(substitution, /method: 'substitution'/);
  assert.match(substitution, /values: solvedValuesWork\(solution\)/);
  assert.match(substitution, /verification: verificationSidesWork\(reduction\.verification\)/);

  const eliminationSource = source('src/tools/systemsWorkspace/EliminationReductionMode.jsx');
  assert.match(eliminationSource, /const solution = eliminationKnownSolution\(elimination, reducedSolution\);/);
  const elimination = region(eliminationSource, 'const work = {', 'useReportToolWork(work', '3×3 elimination work');
  assert.match(elimination, /method: 'elimination'/);
  assert.match(elimination, /values: solvedValuesWork\(solution\)/);
  assert.match(elimination, /verification: verificationSidesWork\(elimination\.verification\)/);
  assert.match(elimination, /statement: outcome\.statement/);
  assert.match(elimination, /planes: Object\.fromEntries\(planePairs\(3\)\.map\(\(\{ id \}\) => \[id, planeWork\?\.answers\?\.\[id\] \|\| ''\]\)\)/);
  // The recorded classification is the one the student recorded for THIS statement.
  const recorded = region(eliminationSource, 'const recordedClassification =', 'const work = {', 'recorded classification');
  assert.match(recorded, /elimination\.classification\?\.statement === outcome\.statement \? elimination\.classification\?\.choice/);
  assert.match(recorded, /subsystemClassification\?\.identity === outcomeIdentity \? subsystemClassification\?\.choice/);
});
