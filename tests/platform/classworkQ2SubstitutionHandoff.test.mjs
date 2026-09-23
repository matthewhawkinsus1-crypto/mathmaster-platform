/*
 * ISSUE #334 — CLASSWORK Q2 SUBSTITUTION HANDOFF.
 *
 *   x - 2y = -3
 *   3x + 5y = 24
 *
 * Five earlier fixes (#329-#333) each passed a unit test and each still failed
 * live, because every one of those tests handed the engine a token string that
 * a person typed: '-(3) + (2 y)', '-3 + 2y', a Unicode minus. None of them
 * handed it the string Step Algebra actually produces.
 *
 * What the live workflow really does (captured in a browser, see
 * tests/browser/algebraicSubstitutionHandoff.mjs):
 *
 *   1. The student adds the operand they typed, 2y, to both sides. The operand
 *      parser keeps it as an IMPLICIT product: `2 y`.
 *   2. Step Algebra reports the solved equation as LaTeX (`equationToLatex`),
 *      and MathJS writes an implicit product in LaTeX with a non-breaking
 *      space: `2~ y`.
 *   3. `latexToExpression` did not translate `~`, so the systems workspace
 *      stored isolation.expression = "-(3)+(2~ y)" — and shows it verbatim in
 *      the work-trail chip, where the tilde reads as a minus sign.
 *   4. In MathJS `~` is bitwise NOT. "-(3)+(2~ y)" is a SyntaxError, so the
 *      token AND the "original isolated form" fallback (the same string) both
 *      fail, and the student is told the token form could not be opened.
 *
 * So every fixture below is either derived by running the real serialisers or
 * is the literal value recorded from the browser — never a clean hand-written
 * stand-in.
 */
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from 'mathjs';
import {
  applyBalancedOperation,
  equationToLatex,
  expressionsEquivalent,
  latexToExpression,
  parseEquationInput,
} from '../../src/algebraAstEngine.js';
import {
  isolatedExpressionFor,
  linearEquationCoefficients,
  normalizeEquationForStepAlgebra,
  repairPersistedIsolation,
  substituteIntoEquation,
} from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';
import { componentSource, executableSource } from './helpers/sourceContract.mjs';

const EQUATION_1 = 'x - 2y = -3';
const EQUATION_2 = '3x + 5y = 24';

// Recorded from the live workflow in Chromium at 1eb11ea (PR #333) — see the
// fixture's `capturedFrom`. The browser driver seeds the same draft.
const CAPTURE = JSON.parse(readFileSync(new URL('./fixtures/classworkQ2RuntimeCapture.json', import.meta.url), 'utf8'));
const RUNTIME = Object.freeze({
  // Step Algebra's own draft after the student cancelled the 2y zero pair.
  stepAlgebraSolvedState: CAPTURE.stepAlgebraSolvedState,
  // The `algebra-objective` response handed to handleIsolated().
  solvedResponse: CAPTURE.handleIsolated.find((entry) => entry.solvedExpression).latexResponse,
  // isolation.expression and isolation.tokenExpression as persisted.
  isolationExpression: CAPTURE.attemptSubstitution.rawIsolationExpression,
});

/** The same two steps `solvedExpressionFor` takes inside AlgebraicSystemMode. */
const solvedExpressionFor = (latexResponse, variable) => isolatedExpressionFor(latexToExpression(latexResponse), variable);

/** Eq. 2 after substitution must be 0x + 11y = 33 — one variable, y = 3. */
const assertOneVariableEquationForY = (substituted, label) => {
  const coefficients = linearEquationCoefficients(substituted, ['x', 'y']);
  assert.ok(coefficients, `${label}: ${substituted} must be a linear equation`);
  assert.deepEqual(
    { a: coefficients.a, b: coefficients.b, c: coefficients.c },
    { a: 0, b: 11, c: 33 },
    `${label}: ${substituted} must be equivalent to 3(-3 + 2y) + 5y = 24`,
  );
};

test('Step Algebra really does serialise the student-typed 2y as LaTeX with a ~ spacing command', () => {
  // Not a pin on wording: this is the precondition the rest of the file is
  // about. If a future toTex stops emitting `~` the tests below still hold.
  const state = parseEquationInput({ equation: normalizeEquationForStepAlgebra(EQUATION_1), solveFor: 'x' });
  const move = applyBalancedOperation({ equationState: state, operation: 'add', operand: '2y' });
  const operandProduct = parse(move.operandExpression);
  assert.equal(operandProduct.type, 'OperatorNode');
  assert.equal(operandProduct.implicit, true, 'the typed operand 2y stays an implicit product');
  assert.match(equationToLatex(RUNTIME.stepAlgebraSolvedState), /2~\s*y/);
});

test('latexToExpression turns the LaTeX ~ space into a space MathJS reads as implicit multiplication', () => {
  const plain = latexToExpression('2~ y');
  assert.doesNotMatch(plain, /~/);
  assert.equal(parse(plain).evaluate({ y: 5 }), 10);
  // Two letters must stay two factors, never fuse into the symbol `xy`.
  assert.equal(parse(latexToExpression('x~y')).evaluate({ x: 3, y: 4 }), 12);
});

test('the isolation handed to the workspace by the real Step Algebra response is parseable MathJS', () => {
  const fromCapture = solvedExpressionFor(RUNTIME.solvedResponse, 'x');
  const fromSerialiser = solvedExpressionFor(equationToLatex(RUNTIME.stepAlgebraSolvedState), 'x');
  for (const [label, expression] of [['captured response', fromCapture], ['live serialiser', fromSerialiser]]) {
    assert.ok(expression, `${label}: x must be isolated`);
    assert.doesNotThrow(() => parse(expression), `${label}: ${JSON.stringify(expression)} must parse`);
  }
});

test('Classwork Q2: the token Step Algebra really produces opens the one-variable equation for y', () => {
  const isolated = solvedExpressionFor(equationToLatex(RUNTIME.stepAlgebraSolvedState), 'x');
  assertOneVariableEquationForY(substituteIntoEquation(EQUATION_2, 'x', isolated), 'fresh attempt');
});

test('Classwork Q2: the token persisted by a draft written before the fix still substitutes', () => {
  // A student who reached the Substitute stage on the broken build has exactly
  // this string stored as both expression and tokenExpression.
  assertOneVariableEquationForY(substituteIntoEquation(EQUATION_2, 'x', RUNTIME.isolationExpression), 'persisted draft');
});

test('Classwork Q2: the optional "Simplify first" route accepts a correct rewrite of the real isolation', () => {
  // The error message sends the student to "Change expression and use an
  // equivalent form". That route compared their rewrite against the same
  // unparseable string and rejected 2y - 3 as not equivalent.
  assert.equal(expressionsEquivalent('2y-3', RUNTIME.isolationExpression, 'x'), true);
  assert.equal(expressionsEquivalent('2y+3', RUNTIME.isolationExpression, 'x'), false, 'a wrong rewrite is still rejected');
});

// ---------------------------------------------------------------------------
// Drafts saved on the broken build (acceptance criterion 9)
// ---------------------------------------------------------------------------

// The `isolation` field of the draft record, exactly as it was stored.
const PERSISTED_BROKEN_ISOLATION = Object.freeze(CAPTURE.persistedDraft[':work:tool'].isolation);

test('a draft saved on the broken build is repaired to plain, parseable MathJS without a reset', () => {
  const repaired = repairPersistedIsolation(PERSISTED_BROKEN_ISOLATION);
  for (const field of ['expression', 'tokenExpression']) {
    assert.doesNotMatch(repaired[field], /~/, `${field} must not keep the LaTeX spacing the work trail shows`);
    assert.doesNotThrow(() => parse(repaired[field]), `${field}: ${JSON.stringify(repaired[field])}`);
    assertOneVariableEquationForY(substituteIntoEquation(EQUATION_2, 'x', repaired[field]), `repaired ${field}`);
  }
  // Only the two expression fields change; the student's other state is kept.
  assert.deepEqual(
    { ...repaired, expression: null, tokenExpression: null },
    { ...PERSISTED_BROKEN_ISOLATION, expression: null, tokenExpression: null },
  );
});

test('the draft repair is deterministic and idempotent, and leaves a healthy record untouched', () => {
  const once = repairPersistedIsolation(PERSISTED_BROKEN_ISOLATION);
  assert.deepEqual(repairPersistedIsolation({ ...PERSISTED_BROKEN_ISOLATION }), once);
  assert.equal(repairPersistedIsolation(once), once, 'repairing a repaired record is a no-op');
  const fresh = { expression: null, tokenExpression: null, simplificationDraft: '', simplifying: false, simplificationChecked: false, simplificationValid: false };
  assert.equal(repairPersistedIsolation(fresh), fresh, 'a record with nothing to repair keeps its identity (no re-render, no draft write)');
  assert.equal(repairPersistedIsolation(null), null);
});

test('AlgebraicSystemMode reads the persisted isolation only through the repair', () => {
  const source = executableSource(componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx'));
  // The raw stored value is bound once, and the `isolation` every stage reads
  // is the repaired one. A second use of the raw binding would be a path that
  // shows or substitutes the unrepaired string.
  const persisted = source.match(/const \[(\w+), setIsolation\] = usePersistentToolState\('isolation'/);
  assert.ok(persisted, 'isolation must stay draft-backed');
  const raw = persisted[1];
  assert.notEqual(raw, 'isolation', 'the draft value must not be read directly as `isolation`');
  assert.match(source, new RegExp(`const isolation = useMemo\\(\\(\\) => repairPersistedIsolation\\(${raw}\\)`));
  assert.equal(source.match(new RegExp(`\\b${raw}\\b`, 'g')).length, 3, `${raw} is bound, repaired, and listed as the memo dependency — nothing else`);
});
