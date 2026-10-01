import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyBalancedOperation,
  equationToLatex,
  expressionsEquivalent,
  isSolvedEquation,
  parseEquationInput,
} from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { compareOrderedPair, parseOrderedPair } from '../../functions/shared/answerUtils.mjs';
import {
  buildAbsoluteValueSplit,
  parseRelationSource,
  relationSolutionSummary,
  relationStateContainsAbsoluteValue,
  verifyRelationCandidates,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { expectedInterceptPoint, resolveStandardCoefficients } from '../../functions/shared/toolMath/stepAlgebra2/linearInterceptsMath.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { interceptSubEquationQuestion } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import {
  checkLinearIntercept,
  equationWorkspaceWork,
  linearInterceptsWork,
  relationWorkspaceWork,
  stepAlgebraWorkGrader,
  workGraderForQuestion,
} from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { parse } from 'mathjs';
import {
  MAX_SOLUTION_MAGNITUDE,
  STUDENT_EXPRESSION_BUDGET,
  expressionComplexity,
  isSafeStudentExpression,
  studentExpressionBudget,
} from '../../functions/shared/serverGrading/stepAlgebraEquivalence.mjs';
import stepAlgebraQuestionGrader from '../../functions/shared/serverGrading/questionGraders/stepAlgebra.mjs';
import stepAlgebraDeclaration from '../../functions/shared/serverGrading/declarations/types/stepAlgebra.mjs';
import intervalNumberLineGrader from '../../functions/shared/serverGrading/tools/intervalNumberLine.mjs';
import { GRADING_MANIFEST, resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import {
  gradeServerResponse,
  serverResponseGradingSupport,
} from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  TOOL_RESPONSE_LIMITS,
  boundToolWork,
  buildToolResponse,
  canonicalToolWorkJson,
} from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { serverCanRegradeEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { ALGEBRA_WORKSPACE_ROUTES, resolveAlgebraWorkspaceRoute } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * SERVER-AUTHORITATIVE GRADING PARITY FOR STEP ALGEBRA (`stepAlgebra`, `algebra`).
 *
 * Three engines render a Step Algebra question — the equation workspace, the
 * relation workspace and the intercept orchestrator — and each now reports its
 * work through one shared grader
 * (functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs). These
 * tests prove:
 *
 *   1. it IS the workspaces' own verdict for every solve the workspace can
 *      produce — frozen copies of the old inline verdicts (the LEGACY ORACLES
 *      below) agree with it on legitimate work;
 *   2. the browser path (gradeToolCheck) and the server path
 *      (gradeServerResponse over the serialized response) agree exactly;
 *   3. it is a function of the work and the QUESTION — the same final
 *      equation against an altered question is marked wrong, and a forged
 *      "isolated" equation that is not the question's answer is wrong.
 */

const read = (path) => fs.readFileSync(path, 'utf8');
const CORE = 'src/StepByStepAlgebraCore.jsx';
const RELATION_CORE = 'src/MultiRelationAlgebraCore.jsx';
const ORCHESTRATOR = 'src/LinearInterceptsOrchestrator.jsx';

// ---------------------------------------------------------------------------
// LEGACY ORACLES — the inline verdicts the workspaces computed before the
// shared grader, frozen here verbatim (minus React) for comparison.
// ---------------------------------------------------------------------------
const legacyEquationVerdict = (question, equation, promptAnswers = {}) => {
  const solved = isSolvedEquation(equation);
  const prompts = Array.isArray(question.algebraPrompts) ? question.algebraPrompts : [];
  const promptParts = prompts.map((prompt, index) => {
    const id = String(prompt.id || `algebra-prompt-${index + 1}`);
    const response = String(promptAnswers[id] || '');
    const accepted = prompt.acceptedExpressions || prompt.acceptedAnswers || (prompt.acceptedExpression ? [prompt.acceptedExpression] : []);
    const isComplete = response.trim() !== '';
    const isCorrect = isComplete && accepted.some((candidate) => expressionsEquivalent(response, candidate, equation.variable));
    return { id, isComplete, isCorrect };
  });
  return {
    isComplete: solved && promptParts.every((part) => part.isComplete),
    isCorrect: solved && promptParts.every((part) => part.isCorrect),
    parts: [{ id: 'algebra-objective', isComplete: solved, isCorrect: solved }, ...promptParts],
  };
};

const legacyRelationVerdict = ({ pristine, relationState, candidateChecks = {}, pending = false, representationCorrect = null, requireRepresentations = false }) => {
  const summary = relationSolutionSummary(relationState);
  const candidateVerification = summary.kind !== 'values' || !relationStateContainsAbsoluteValue(pristine)
    ? []
    : verifyRelationCandidates(pristine, summary.values, pristine.variable);
  const requireCandidateVerification = candidateVerification.length > 0;
  const candidateVerificationComplete = !requireCandidateVerification
    || candidateVerification.every(({ value }) => candidateChecks[String(value)] != null);
  const candidateVerificationCorrect = !requireCandidateVerification
    || candidateVerification.every(({ value, valid }) => candidateChecks[String(value)] === (valid ? 'valid' : 'extraneous'));
  const fullyComplete = !pending && summary.solved && candidateVerificationComplete
    && (!requireRepresentations || representationCorrect === true);
  return { isComplete: fullyComplete, isCorrect: fullyComplete && candidateVerificationCorrect };
};

const legacyInterceptCheck = (question, kind, point) => {
  const standard = resolveStandardCoefficients(question);
  const expectedPoint = expectedInterceptPoint(standard, kind);
  const pair = parseOrderedPair(point);
  return Boolean(pair && expectedPoint && compareOrderedPair(point, expectedPoint, 1e-6));
};

// ---------------------------------------------------------------------------
// Realistic work, produced by the workspaces' own engines.
// ---------------------------------------------------------------------------
/** Solve on the balance: apply each move with the engine, as the workspace commits it. */
const solveOnBalance = (question, moves) => {
  let state = parseEquationInput(question);
  for (const [operation, operand] of moves) state = applyBalancedOperation({ equationState: state, operation, operand }).simplified;
  return state;
};
/** The same, ending on the last move's unsimplified (as-written) state, which the workspace may also keep. */
const solveOnBalanceUnsimplified = (question, moves) => {
  let state = parseEquationInput(question);
  let written = state;
  for (const [operation, operand] of moves) {
    const move = applyBalancedOperation({ equationState: state, operation, operand });
    written = move.unsimplified;
    state = move.simplified;
  }
  return written;
};
const equationWork = (equation, promptAnswers = {}) => equationWorkspaceWork({ equation, promptAnswers });
const relation = (source, variable = 'x') => parseRelationSource(source, variable);
const relationWork = (source, extra = {}) => relationWorkspaceWork({ relationState: typeof source === 'string' ? relation(source) : source, ...extra });

/** Browser verdict and server verdict over the serialized bytes, asserted identical. */
const parity = (question, work, label = '') => {
  const browser = gradeToolCheck(stepAlgebraWorkGrader, question, work);
  assert.ok(browser.toolResponse, `${label}: the browser built a tool response`);
  assert.equal(browser.toolResponse.toolId, 'stepAlgebra', label);
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.surfaceId, 'stepAlgebra', label);
  assert.equal(server.graded, browser.graded, `${label}: graded (${server.reason})`);
  assert.equal(server.isCorrect, browser.isCorrect, `${label}: isCorrect`);
  assert.equal(server.isComplete, browser.isComplete, `${label}: isComplete`);
  assert.equal(server.score, browser.score, `${label}: score`);
  assert.deepEqual(server.parts, browser.parts, `${label}: parts`);
  // Both paths record the same attempt.
  assert.deepEqual(attemptInputsFromGrading(server), attemptInputsFromGrading(browser), `${label}: attempt inputs`);
  return browser;
};

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------
const LINEAR = { type: 'stepAlgebra', prompt: 'Solve for x.', equation: '3x + 6 = 21' };
const LATEX_ONLY = { type: 'stepAlgebra', prompt: 'Solve.', equationLatex: '\\frac{x}{2}+1=4' };
const STRICT = { ...LINEAR, requireSimplifiedFinalForm: true };
const SLOPE = { type: 'stepAlgebra', prompt: 'Write in slope-intercept form.', equation: '2x + 3y = 15', targetForm: 'slopeIntercept', requireSimplifiedFinalForm: true };
const FACTORED = { type: 'stepAlgebra', prompt: 'Write in factored form.', equation: 'y = 15x - 45', targetForm: 'factoredLinear' };
const STANDARD = { type: 'stepAlgebra', prompt: 'Reduce.', equation: '2(6 - y - z) - y + 3z = 9', solveFor: 'y', objective: { kind: 'linearStandardForm', variable: 'y', variables: ['y', 'z'] } };
const PROMPTS = {
  type: 'stepAlgebra',
  prompt: 'Solve, then simplify.',
  equation: '2x = 7',
  algebraPrompts: [
    { id: 'expand', prompt: 'Expand 2(x + 1).', acceptedExpressions: ['2x + 2'] },
    { prompt: 'Simplify x + x.', acceptedAnswers: ['2x'] },
  ],
};
const LITERAL_STEP = { type: 'stepAlgebra', prompt: 'Solve for t.', equation: 'd = r*t', solveFor: 't' };
const RETIRED_ALGEBRA = { type: 'algebra', prompt: 'Solve for x.', equationLatex: '3x + 6 = 21' };

const INEQUALITY = { type: 'stepAlgebra', prompt: 'Solve.', equation: '2x + 3 <= 7', representSolution: false };
const FLIP = { type: 'stepAlgebra', prompt: 'Solve.', equation: '-3x + 4 > 10', representSolution: false };
const PROMPT_ONLY = { type: 'stepAlgebra', prompt: 'Solve -2x + 3 > 7.', representSolution: false };
const BETWEEN = { type: 'stepAlgebra', prompt: 'Solve.', equation: '|2x - 3| < 7', representSolution: false };
const OUTSIDE = { type: 'stepAlgebra', prompt: 'Solve.', equation: '|x + 1| >= 4', representSolution: false };
const ABS_EQ = { type: 'stepAlgebra', prompt: 'Solve.', equation: '|2x - 3| = 7' };
const EXTRANEOUS = { type: 'stepAlgebra', prompt: 'Solve.', equation: '|x + 1| = 2x - 4' };
const SQUARE = { type: 'stepAlgebra', prompt: 'Solve.', equation: 'x^2 = 9' };
const NO_SOLUTION = { type: 'stepAlgebra', prompt: 'Solve.', equation: '|x| < -2' };
const ALL_REALS = { type: 'stepAlgebra', prompt: 'Solve.', equation: '|x| >= -1' };
// Default representations (graph + interval notation) and Algebra I (graph only).
const REPRESENT = { type: 'stepAlgebra', prompt: 'Solve and graph.', equation: '2x + 3 <= 7' };
const REPRESENT_ALG1 = { ...REPRESENT, courseId: 'algebra1' };

const INTERCEPTS = { type: 'stepAlgebra', mode: 'linearIntercepts', prompt: 'Find both intercepts.', equation: '2x + 3y = 12' };
const INTERCEPTS_STANDARD = { type: 'stepAlgebra', mode: 'linearIntercepts', prompt: 'Find both intercepts.', standard: { A: 4, B: -5, C: 10 } };

// A Question Family instance, built by the real family engine.
const familyInstance = (index = 3) => resolveFamilyQuestionInstance({
  question: { questionId: 'fam-1', type: 'stepAlgebra', prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation' } },
  assignmentId: 'A1',
  storageIndex: 0,
  allocation: { seat: 0, variant: 0, stride: 1, index, basis: 'personal' },
}).question;

// ===========================================================================
// Declaration and mode resolution
// ===========================================================================

test('the manifest routes stepAlgebra and algebra to this shared question grader, on every route', () => {
  assert.equal(GRADING_MANIFEST.stepAlgebra, stepAlgebraDeclaration);
  assert.equal(GRADING_MANIFEST.algebra, stepAlgebraDeclaration);
  assert.equal(GRADING_MANIFEST.stepAlgebra.kind, 'question');
  assert.equal(GRADING_MANIFEST.stepAlgebra.authority, 'shared-server-authoritative');
  for (const question of [LINEAR, LATEX_ONLY, SLOPE, FACTORED, STANDARD, PROMPTS, RETIRED_ALGEBRA, INEQUALITY, PROMPT_ONLY, ABS_EQ, SQUARE, INTERCEPTS, INTERCEPTS_STANDARD, familyInstance()]) {
    assert.equal(resolveGradingSurfaceId(question), question.type === 'algebra' ? 'algebra' : 'stepAlgebra');
    const support = serverResponseGradingSupport(question);
    assert.equal(support.supported, true, `${question.equation || question.prompt}: ${support.reason}`);
    assert.equal(support.authority, 'shared-server-authoritative');
  }
});

test('the declared mode is exactly the engine QuestionEngine opens, for every kind of question', () => {
  const ROUTE_FOR_MODE = {
    equation: ALGEBRA_WORKSPACE_ROUTES.STEP_ALGEBRA,
    relation: ALGEBRA_WORKSPACE_ROUTES.RELATION,
    linearIntercepts: ALGEBRA_WORKSPACE_ROUTES.LINEAR_INTERCEPTS,
  };
  const questions = [
    LINEAR, LATEX_ONLY, STRICT, SLOPE, FACTORED, STANDARD, PROMPTS, LITERAL_STEP, RETIRED_ALGEBRA,
    INEQUALITY, FLIP, PROMPT_ONLY, BETWEEN, OUTSIDE, ABS_EQ, EXTRANEOUS, SQUARE, NO_SOLUTION, ALL_REALS, REPRESENT,
    INTERCEPTS, INTERCEPTS_STANDARD,
    // The relation check wins over the intercept route.
    { type: 'stepAlgebra', mode: 'linearIntercepts', equation: '2x + 3y > 12' },
    // `algebra` is never the intercept orchestrator; QuestionEngine's algebra case has no such branch.
    { type: 'algebra', mode: 'linearIntercepts', equation: '2x + 3y = 12' },
    // Unknown or legacy modes open the equation engine.
    { type: 'stepAlgebra', mode: 'rigorous', equation: '3x + 6 = 21' },
    { type: 'stepAlgebra', mode: 'LinearIntercepts', equation: '2x + 3y = 12' },
    // Explicit relation-workspace flags.
    { type: 'stepAlgebra', relationWorkspace: true, equation: '2x = 4' },
    { type: 'stepAlgebra', relationWorkspace: false, equation: 'x^2 = 4' },
    { type: 'stepAlgebra', workspaceMode: 'relations', equation: '2x = 4' },
    // Split authoring.
    { type: 'stepAlgebra', leftExpression: '2x + 1', rightExpression: '9', relation: '<' },
    familyInstance(),
  ];
  for (const question of questions) {
    const declared = stepAlgebraDeclaration.supports(question).mode;
    const route = resolveAlgebraWorkspaceRoute(question).route;
    assert.equal(ROUTE_FOR_MODE[declared], route, `${JSON.stringify(question)} declared ${declared}, renders ${route}`);
  }
});

test('a question no workspace can read is non-graded on every device, not client-graded', () => {
  const support = serverResponseGradingSupport({ type: 'stepAlgebra', prompt: 'Solve the equation.' });
  assert.equal(support.supported, false);
  assert.equal(support.reason, 'no-readable-equation');
  assert.equal(support.authority, 'non-graded-read-only');
  assert.match(support.blocker, /could not be loaded/);
  // A legacy seeded generator or a family TEMPLATE is still excluded (the
  // server grades the instance rebuilt from its pin, never the template).
  assert.equal(serverResponseGradingSupport({ ...LINEAR, generator: { kind: 'stepLinearEquation' } }).reason, 'generated-question');
  assert.equal(serverResponseGradingSupport({ type: 'stepAlgebra', questionFamily: { id: 'linear.twoStepEquation' } }).reason, 'family-template');
  // The readability check makes the workspace's own field choice: the FIRST of
  // equation / equationAscii / initialEquation that is set, else equationLatex,
  // with exactly one equals sign.
  const readable = (question) => stepAlgebraDeclaration.supports(question).supported;
  const opens = (question) => {
    try {
      parseEquationInput(question);
      return true;
    } catch {
      return false;
    }
  };
  for (const question of [
    { type: 'stepAlgebra', equation: 'x + 1', equationAscii: 'x + 1 = 2' },
    { type: 'stepAlgebra', equation: 'x = 1 = 2' },
    { type: 'stepAlgebra', equationAscii: '2x = 4' },
    { type: 'stepAlgebra', initialEquation: '2x = 4', equationLatex: 'x' },
    { type: 'stepAlgebra', equationLatex: '\\frac{x}{2}=3' },
    { type: 'stepAlgebra', leftExpression: '2x', rightExpression: '4' },
    { type: 'stepAlgebra', leftExpression: '2x', equation: '2x = 4' },
    { type: 'algebra', equationLatex: '3x + 6 = 21' },
  ]) {
    assert.equal(readable(question), opens(question), JSON.stringify(question));
  }
  // A blank generated answer is not a key.
  assert.equal(readable({ type: 'stepAlgebra', generatedAnswer: null }), false);
  assert.equal(readable({ type: 'stepAlgebra', generatedAnswer: '' }), false);
  assert.equal(readable({ type: 'stepAlgebra', generatedAnswer: 4 }), true);
});

// ===========================================================================
// Equation workspace
// ===========================================================================

test('equation: a solve made on the balance is correct, and the shared grader agrees with the old inline verdict', () => {
  const final = solveOnBalance(LINEAR, [['subtract', '6'], ['divide', '3']]);
  assert.deepEqual([final.left, final.right], ['x', '5']);
  const work = equationWork(final);
  assert.deepEqual(boundToolWork(work).dropped, []);
  const result = parity(LINEAR, work, 'linear');
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.parts.map((part) => [part.id, part.label, part.response]), [['algebra-objective', 'Isolate x', equationToLatex(final)]]);
  const legacy = legacyEquationVerdict(LINEAR, final);
  assert.equal(result.isCorrect, legacy.isCorrect);
  assert.equal(result.isComplete, legacy.isComplete);
});

test('equation: every intermediate state the workspace passes through is incomplete, graded, and scored 0', () => {
  const afterSubtract = solveOnBalance(LINEAR, [['subtract', '6']]);
  const result = parity(LINEAR, equationWork(afterSubtract), 'partial');
  assert.equal(result.graded, true);
  assert.equal(result.isComplete, false);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  assert.equal(legacyEquationVerdict(LINEAR, afterSubtract).isComplete, false);
  // The untouched original equation, too.
  assert.equal(parity(LINEAR, equationWork(parseEquationInput(LINEAR)), 'untouched').isComplete, false);
});

test('equation: a forged "isolated" equation that is not the question\'s answer is wrong — the case the old browser verdict could not see', () => {
  const forged = { left: 'x', right: '6' };
  const result = parity(LINEAR, equationWork(forged), 'forged');
  assert.equal(result.isComplete, true, 'it IS isolated, so the attempt is a real (complete) one');
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
  // The old verdict trusted the process and called any isolation correct.
  assert.equal(legacyEquationVerdict(LINEAR, { ...forged, variable: 'x', objective: parseEquationInput(LINEAR).objective }).isCorrect, true);
});

test('equation: equivalent finished forms the workspace accepts are all correct', () => {
  const forms = [
    { left: 'x', right: '5' },
    { left: '5', right: 'x' },
    { left: 'x', right: '10 / 2' },
    { left: 'x', right: '(21 - 6) / 3' },
    { left: 'x', right: '5.0' },
  ];
  forms.forEach((form) => assert.equal(parity(LINEAR, equationWork(form), JSON.stringify(form)).isCorrect, true, JSON.stringify(form)));
  // An unsimplified value is not finished when the question demands the simplified form.
  assert.equal(parity(STRICT, equationWork({ left: 'x', right: '(21 - 6) / 3' }), 'strict').isComplete, false);
  assert.equal(parity(STRICT, equationWork({ left: 'x', right: '5' }), 'strict simplified').isCorrect, true);
  // Fractions and decimals are the same answer.
  const half = { type: 'stepAlgebra', equation: '2x = 7' };
  assert.equal(parity(half, equationWork({ left: 'x', right: '7 / 2' }), '7/2').isCorrect, true);
  assert.equal(parity(half, equationWork({ left: 'x', right: '3.5' }), '3.5').isCorrect, true);
  assert.equal(parity(half, equationWork({ left: 'x', right: '3.4' }), '3.4').isCorrect, false);
});

test('equation: a value close to the answer is not the answer — the identity check is exact to floating error', () => {
  // The balance only commits exact moves (its own typed-simplification check
  // accepts a value within 1e-9), so a final value that is merely near the
  // solution was not produced by it.
  for (const right of ['5.000001', '4.9999', '5.001', '(21 - 6) / 3 + 0.0000001']) {
    const result = parity(LINEAR, equationWork({ left: 'x', right }), right);
    assert.equal(result.isComplete, true, right);
    assert.equal(result.isCorrect, false, right);
  }
  assert.equal(parity({ type: 'stepAlgebra', equation: '3x = 1' }, equationWork({ left: 'x', right: '0.333333' }), '0.333333').isCorrect, false);
  assert.equal(parity({ type: 'stepAlgebra', equation: '3x = 1' }, equationWork({ left: 'x', right: '1 / 3' }), '1/3').isCorrect, true);
  assert.equal(parity(LITERAL_STEP, equationWork({ left: 't', right: 'd / r + 0.00001' }), 'literal near-miss').isCorrect, false);
  assert.equal(parity(SLOPE, equationWork({ left: 'y', right: '-0.666666 x + 5' }), 'slope near-miss').isCorrect, false);
  assert.equal(parity(STANDARD, equationWork({ left: '-3 y + z', right: '-3.00001' }), 'standard near-miss').isCorrect, false);
});

test('equation: an unauthored objective defaults exactly as the workspace does (isolate x, from equationLatex alone)', () => {
  const final = solveOnBalance(LATEX_ONLY, [['subtract', '1'], ['multiply', '2']]);
  const result = parity(LATEX_ONLY, equationWork(final), 'latex only');
  assert.equal(result.isCorrect, true);
  assert.equal(result.parts[0].label, 'Isolate x');
  assert.equal(parity(LATEX_ONLY, equationWork({ left: 'x', right: '8' }), 'x = 8').isCorrect, false);
  // The retired `algebra` type is the same surface and the same grader.
  const algebraFinal = solveOnBalance(RETIRED_ALGEBRA, [['subtract', '6'], ['divide', '3']]);
  const browser = gradeToolCheck(stepAlgebraWorkGrader, RETIRED_ALGEBRA, equationWork(algebraFinal));
  const server = gradeServerResponse({ question: RETIRED_ALGEBRA, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.surfaceId, 'algebra');
  assert.equal(server.isCorrect, true);
  assert.deepEqual(server.parts, browser.parts);
});

test('equation: line targets — slope-intercept, factored and standard form — need the form AND the same line', () => {
  // Slope-intercept, strict: the structure the workspace demands, any textbook order.
  assert.equal(parity(SLOPE, equationWork({ left: 'y', right: '-2 / 3 x + 5' }), 'mx+b').isCorrect, true);
  assert.equal(parity(SLOPE, equationWork({ left: 'y', right: '5 - (2 x) / 3' }), 'b - mx').isCorrect, true);
  assert.equal(parity(SLOPE, equationWork({ left: 'y', right: '(15 - 2 x) / 3' }), 'unsplit').isComplete, false);
  const wrongLine = parity(SLOPE, equationWork({ left: 'y', right: '-2 / 3 x + 6' }), 'wrong intercept');
  assert.equal(wrongLine.isComplete, true);
  assert.equal(wrongLine.isCorrect, false);
  assert.equal(parity(SLOPE, equationWork({ left: 'y', right: '-2 / 3 x + 5' }), 'label').parts[0].label, 'Write in slope-intercept form');
  // Factored linear.
  assert.equal(parity(FACTORED, equationWork({ left: 'y', right: '15 (x - 3)' }), 'factored').isCorrect, true);
  assert.equal(parity(FACTORED, equationWork({ left: 'y', right: '15 (x - 2)' }), 'wrong factor').isCorrect, false);
  assert.equal(parity(FACTORED, equationWork({ left: 'y', right: '15 x - 45' }), 'not factored').isComplete, false);
  // Standard form: any orientation, order or nonzero multiple of the same equation.
  assert.equal(parity(STANDARD, equationWork({ left: '-3 y + z', right: '-3' }), 'standard').isCorrect, true);
  assert.equal(parity(STANDARD, equationWork({ left: 'z - 3 y', right: '-3' }), 'reordered').isCorrect, true);
  assert.equal(parity(STANDARD, equationWork({ left: '-3', right: '-3 y + z' }), 'flipped').isCorrect, true);
  assert.equal(parity(STANDARD, equationWork({ left: '-6 y + 2 z', right: '-6' }), 'scaled').isCorrect, true);
  assert.equal(parity(STANDARD, equationWork({ left: '-3 y + z', right: '-4' }), 'wrong constant').isCorrect, false);
  assert.equal(parity(STANDARD, equationWork({ left: 'y', right: '1 + z / 3' }), 'isolated, not standard').isComplete, false);
});

test('equation: algebra prompts — every prompt graded by the engine\'s own equivalence, partial credit per part', () => {
  const final = { left: 'x', right: '7 / 2' };
  const all = parity(PROMPTS, equationWork(final, { expand: '2+2x', 'algebra-prompt-2': '2x' }), 'all prompts');
  assert.equal(all.isCorrect, true);
  assert.deepEqual(all.parts.map((part) => part.id), ['algebra-objective', 'expand', 'algebra-prompt-2']);
  const oneWrong = parity(PROMPTS, equationWork(final, { expand: '2x+1', 'algebra-prompt-2': 'x\\cdot2' }), 'one wrong');
  assert.equal(oneWrong.isComplete, true);
  assert.equal(oneWrong.isCorrect, false);
  assert.equal(oneWrong.score, 2 / 3);
  assert.equal(attemptInputsFromGrading(oneWrong).partialCreditPercent, 67);
  const blank = parity(PROMPTS, equationWork(final, { expand: '2x+2' }), 'blank prompt');
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false);
  // LaTeX from the prompt's MathInput is read as the engine reads it.
  assert.equal(parity(PROMPTS, equationWork(final, { expand: '2\\left(x+1\\right)', 'algebra-prompt-2': '2x' }), 'latex').isCorrect, true);
  // Agreement with the old verdict on the same answers.
  for (const answers of [{ expand: '2+2x', 'algebra-prompt-2': '2x' }, { expand: '2x+1', 'algebra-prompt-2': '2x' }, { expand: '2x+2' }]) {
    const legacy = legacyEquationVerdict(PROMPTS, { ...final, ...parseEquationInput(PROMPTS), left: 'x', right: '7 / 2' }, answers);
    const shared = stepAlgebraWorkGrader.grade(PROMPTS, equationWork(final, answers));
    assert.equal(shared.isCorrect, legacy.isCorrect, JSON.stringify(answers));
    assert.equal(shared.isComplete, legacy.isComplete, JSON.stringify(answers));
    assert.deepEqual(shared.parts.map((part) => part.isCorrect), legacy.parts.map((part) => part.isCorrect));
  }
  // A prompt id that collides with a key the contract strips still travels.
  const collides = { ...PROMPTS, algebraPrompts: [{ id: 'solution', prompt: 'Expand 2(x + 1).', acceptedExpressions: ['2x + 2'] }] };
  const collidingWork = equationWork(final, { solution: '2x+2' });
  assert.deepEqual(boundToolWork(collidingWork).dropped, []);
  assert.equal(parity(collides, collidingWork, 'colliding id').isCorrect, true);
});

test('equation: a literal formula solved for a letter is checked by substituting back, for every value of the other letters', () => {
  const final = solveOnBalance(LITERAL_STEP, [['divide', 'r']]);
  const work = equationWork({ left: final.right, right: final.left });
  assert.equal(parity(LITERAL_STEP, equationWork(final), 'd/r = t').isCorrect, true);
  assert.equal(parity(LITERAL_STEP, work, 't = d/r').isCorrect, true);
  assert.equal(parity(LITERAL_STEP, equationWork({ left: 't', right: 'd * r' }), 't = dr').isCorrect, false);
  assert.equal(parity(LITERAL_STEP, equationWork({ left: 't', right: 'd / r + 1' }), 't = d/r + 1').isCorrect, false);
});

test('equation: an extraneous root created by multiplying by a variable expression is wrong (a documented change)', () => {
  // x/(x - 2) = 2/(x - 2): multiplying both sides by (x - 2) — a move the
  // balance allows — leaves x = 2, which makes the original's denominators
  // zero. The old browser verdict was "isolated, so correct"; the shared
  // grader substitutes back and finds no solution there.
  const RATIONAL = { type: 'stepAlgebra', prompt: 'Solve.', equation: 'x/(x-2) = 2/(x-2)' };
  const final = solveOnBalance(RATIONAL, [['multiply', 'x - 2']]);
  assert.deepEqual([final.left, final.right], ['x', '2']);
  const result = parity(RATIONAL, equationWork(final), 'extraneous');
  assert.equal(result.isComplete, true);
  assert.equal(result.isCorrect, false);
  assert.equal(legacyEquationVerdict(RATIONAL, final).isCorrect, true, 'the old verdict called it correct');
  // A genuine solution reached the same way is still correct.
  const RECIPROCAL = { type: 'stepAlgebra', prompt: 'Solve.', equation: '6/x = 2' };
  assert.equal(parity(RECIPROCAL, equationWork(solveOnBalance(RECIPROCAL, [['multiply', 'x'], ['divide', '2']])), '6/x = 2').isCorrect, true);
});

test('equation: a Question Family instance is marked by its generated answer, through the same response contract', () => {
  const instance = familyInstance();
  assert.ok(Number.isFinite(Number(instance.generatedAnswer)));
  const answer = Number(instance.generatedAnswer);
  const right = parity(instance, equationWork({ left: instance.variable || 'x', right: String(answer) }), 'family');
  assert.equal(right.isCorrect, true);
  const wrong = parity(instance, equationWork({ left: instance.variable || 'x', right: String(answer + 1) }), 'family wrong');
  assert.equal(wrong.isComplete, true);
  assert.equal(wrong.isCorrect, false);
  // An unsimplified value of the right number is still the right answer.
  assert.equal(parity(instance, equationWork({ left: instance.variable || 'x', right: `(${answer * 2}) / 2` }), 'family unsimplified').isCorrect, true);
});

test('discrimination: the same correct final work against an altered question (or key) is wrong', () => {
  const final = solveOnBalance(LINEAR, [['subtract', '6'], ['divide', '3']]);
  assert.equal(parity(LINEAR, equationWork(final), 'key').isCorrect, true);
  assert.equal(parity({ ...LINEAR, equation: '3x + 6 = 24' }, equationWork(final), 'altered equation').isCorrect, false);
  assert.equal(parity(SLOPE, equationWork({ left: 'y', right: '-2 / 3 x + 5' }), 'slope').isCorrect, true);
  assert.equal(parity({ ...SLOPE, equation: '2x + 3y = 18' }, equationWork({ left: 'y', right: '-2 / 3 x + 5' }), 'altered line').isCorrect, false);
  const instance = familyInstance();
  const work = equationWork({ left: instance.variable || 'x', right: String(instance.generatedAnswer) });
  assert.equal(parity(instance, work, 'family key').isCorrect, true);
  assert.equal(parity({ ...instance, generatedAnswer: Number(instance.generatedAnswer) + 1 }, work, 'altered key').isCorrect, false);
  assert.equal(parity(PROMPTS, equationWork({ left: 'x', right: '7 / 2' }, { expand: '2x+2', 'algebra-prompt-2': '2x' }), 'prompts').isCorrect, true);
  const alteredPrompt = { ...PROMPTS, algebraPrompts: [{ ...PROMPTS.algebraPrompts[0], acceptedExpressions: ['2x + 3'] }, PROMPTS.algebraPrompts[1]] };
  assert.equal(parity(alteredPrompt, equationWork({ left: 'x', right: '7 / 2' }, { expand: '2x+2', 'algebra-prompt-2': '2x' }), 'altered prompt key').isCorrect, false);
});

test('equation: tampered work — injected verdicts, a forged objective, wrong types, non-object work, oversize, code', () => {
  const final = { left: 'x', right: '6' };
  // Injected verdict and key material is stripped and changes nothing.
  const injected = { ...equationWork(final), isCorrect: true, score: 1, expected: '6', checks: [true], objective: { kind: 'isolate', variable: 'x' } };
  const dropped = boundToolWork(injected).dropped.sort();
  assert.deepEqual(dropped, ['checks', 'expected', 'isCorrect', 'score']);
  const result = parity(LINEAR, injected, 'injected');
  assert.equal(result.isCorrect, false);
  // A forged objective in the work is never read: the question's objective decides.
  assert.equal(parity(SLOPE, { ...equationWork({ left: 'x', right: '15 / 2 - 3 / 2 y' }), objective: { kind: 'isolate', variable: 'x' } }, 'forged objective').isComplete, false);
  // Wrong types are blank work, graded as an incomplete attempt.
  for (const work of [{ equation: 'x = 5' }, { equation: { left: 5, right: 'x' } }, { equation: null, promptAnswers: 'x' }, { promptAnswers: { expand: '2x+2' } }, {}]) {
    const graded = parity(PROMPTS, work, JSON.stringify(work));
    assert.equal(graded.graded, true);
    assert.equal(graded.isComplete, false);
    assert.equal(graded.isCorrect, false);
  }
  // Non-object work is not gradable.
  for (const work of ['x = 5', 5, [{ left: 'x', right: '5' }]]) {
    const browser = gradeToolCheck(stepAlgebraWorkGrader, LINEAR, work);
    assert.equal(browser.graded, false);
    assert.equal(gradeServerResponse({ question: LINEAR, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).graded, false);
  }
  // Oversize work is refused on both sides rather than half-read.
  const huge = equationWork({ left: 'x', right: '5' }, Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`p${index}`, 'x'.repeat(900)])));
  assert.ok(canonicalToolWorkJson(huge).length > TOOL_RESPONSE_LIMITS.maxJsonLength);
  const browser = gradeToolCheck(stepAlgebraWorkGrader, LINEAR, huge);
  assert.equal(browser.graded, false);
  assert.equal(browser.reason, 'oversize-response');
  // The oversize response carries no work at all (its value is empty), so the
  // server has nothing to mark either — never half a response.
  const oversize = gradeServerResponse({ question: LINEAR, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(oversize.graded, false);
  assert.ok(['oversize-response', 'blank-response'].includes(oversize.reason), oversize.reason);
  // Student text is data: a forged function call or assignment is never evaluated or solved.
  for (const right of ['createUnit("knot")', 'import({}, {})', 'f(x) = 5', '1:100000000', '[5]', '"5"']) {
    assert.equal(isSafeStudentExpression(right), false, right);
    const forged = parity(LINEAR, equationWork({ left: 'x', right }), right);
    assert.equal(forged.isComplete, false, right);
    assert.equal(forged.isCorrect, false, right);
  }
  assert.equal(parity(PROMPTS, equationWork({ left: 'x', right: '7 / 2' }, { expand: 'createUnit("knot")', 'algebra-prompt-2': '2x' }), 'unsafe prompt').parts[1].isCorrect, false);
  // ...while the pure functions of school mathematics are read, as the
  // workspace always read them (a prompt keyed with sec(x) or log10(x)).
  const TRIG = { ...PROMPTS, algebraPrompts: [{ id: 'recip', prompt: 'Rewrite 1/cos(x).', acceptedExpressions: ['sec(x)'] }, { id: 'log', prompt: 'Rewrite log(x)/log(10).', acceptedExpressions: ['log10(x)'] }] };
  const trig = parity(TRIG, equationWork({ left: 'x', right: '7 / 2' }, { recip: 'sec(x)', log: 'log10(x)' }), 'school functions');
  assert.deepEqual(trig.parts.map((part) => part.isCorrect), [true, true, true]);
  assert.equal(isSafeStudentExpression('nthRoot(x, 3) + asin(x) + cot(x) + log2(x)'), true);
});

test('equation: realistic maximal work stays inside the response limits and drops nothing', () => {
  // The longest states the balance produces: a multi-step equation's sides
  // carried unsimplified through several moves, and every prompt box full.
  const question = {
    type: 'stepAlgebra',
    equation: '3(2x - 5) + 4(x + 1) - 2(3x - 7) = 5(x + 2) - 3(x - 4)',
    algebraPrompts: Array.from({ length: 10 }, (_, index) => ({ id: `prompt-${index}`, prompt: 'Simplify.', acceptedExpressions: [`${index + 1}x + ${index}`] })),
  };
  const longSide = '3(2 x - 5) + 4(x + 1) - 2(3 x - 7) - 5 x - 10 + 3 x - 12 + 15 - 4 + 14';
  const work = equationWork(
    { left: longSide, right: '5(x + 2) - 3(x - 4) - 5 x - 10 + 3 x - 12' },
    Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`prompt-${index}`, `\\frac{${2 * index + 2}x+${2 * index}}{2}`])),
  );
  const { dropped, truncated } = boundToolWork(work);
  assert.deepEqual(dropped, []);
  assert.equal(truncated, false);
  assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength);
  const result = parity(question, work, 'maximal');
  assert.equal(result.graded, true);
  assert.equal(result.isComplete, false, 'not isolated yet');
  // Every prompt was read (the long unsimplified answers are each worth their part).
  assert.deepEqual(result.parts.slice(1).map((part) => part.isCorrect), Array(10).fill(true));
  // The solved state of the same question (4x + 3 = 2x + 22) is correct.
  const solved = parity(question, equationWork({ left: 'x', right: '19 / 2' }, Object.fromEntries(work.promptAnswers.map(({ id, value }) => [id, value]))), 'maximal solved');
  assert.equal(solved.isComplete, true);
  assert.equal(solved.isCorrect, true);
});

test('equation: work the simplifier could choke on is refused, quickly, before any engine sees it', () => {
  // mathjs simplify is super-linear in a chain's length: a 20-term sum takes
  // seconds, a 30-term one minutes. A forged response must not be able to
  // hold the grading process (or a student's browser) that long.
  const chain = (count, separator, term) => Array.from({ length: count }, (_, index) => term(index)).join(separator);
  const forged = [
    chain(30, ' + ', (index) => `${index + 2} x`),
    chain(24, ' * ', (index) => (index % 2 ? 'x' : String(index + 2))),
    `${'('.repeat(40)}x${' + 1)'.repeat(40)}`,
    chain(20, ' + ', (index) => chain(12, ' * ', (inner) => (inner % 2 ? 'x' : String(index + inner + 2)))),
    // Inside the old 12-link floor and still ~3 s per simplify call, because
    // every term must be brought over a common denominator (each side and each
    // prompt answer is simplified, so one forged response cost 6-15 s):
    chain(12, ' - ', (index) => `${index + 2} / (x - ${index + 1})`),
    chain(12, ' - ', (index) => `${index + 2} (x - ${index + 1})^(-1)`),
    // ...and one such term is enough to make a 10-link sum of cubes cost ~1.2 s.
    [`2 / (x - 1)`, ...Array.from({ length: 9 }, (_, index) => `(x - ${index})^3`)].join(' - '),
    // More reciprocal terms than the question's own (+1), however short.
    chain(4, ' + ', (index) => `${index + 1} / (x - ${index})`),
  ];
  const started = Date.now();
  for (const side of forged) {
    assert.equal(isSafeStudentExpression(side), false, side.slice(0, 40));
    const isolated = parity(LINEAR, equationWork({ left: 'x', right: side }), side.slice(0, 40));
    assert.equal(isolated.isComplete, false);
    assert.equal(isolated.isCorrect, false);
    const both = parity(LINEAR, equationWork({ left: side, right: side }), side.slice(0, 40));
    assert.equal(both.isComplete, false);
    const prompt = parity(PROMPTS, equationWork({ left: 'x', right: '7 / 2' }, { expand: side, 'algebra-prompt-2': '2x' }), 'prompt');
    assert.equal(prompt.parts[1].isCorrect, false);
  }
  // Generous for a loaded CI machine; the unbounded engine took minutes here.
  assert.ok(Date.now() - started < 30_000, `took ${Date.now() - started}ms`);
  // The budget is measured, not guessed (see STUDENT_EXPRESSION_BUDGET): the
  // floor admits a 10-link chain, an 8-link chain once a letter sits in a
  // denominator or under a negative or fractional power, and 3 such terms.
  assert.deepEqual(STUDENT_EXPRESSION_BUDGET, { nodes: 200, depth: 24, chain: 10, reciprocalChain: 8, reciprocals: 3 });
  assert.equal(isSafeStudentExpression(chain(10, ' + ', (index) => `${index + 2} x`)), true);
  assert.equal(isSafeStudentExpression(chain(11, ' + ', (index) => `${index + 2} x`)), false);
  assert.equal(isSafeStudentExpression([`2 / (x - 1)`, ...Array.from({ length: 7 }, (_, index) => `${index + 2} x`)].join(' + ')), true);
  assert.equal(isSafeStudentExpression([`2 / (x - 1)`, ...Array.from({ length: 8 }, (_, index) => `${index + 2} x`)].join(' + ')), false);
  assert.equal(isSafeStudentExpression(chain(3, ' + ', (index) => `${index + 1} / (x - ${index})`)), true);
  // Numbers in denominators, whole-number powers and e or pi are not reciprocal terms.
  assert.equal(expressionComplexity(parse('x / 3 + (x + 1)^2 + 2 / pi')).reciprocals, 0);
  assert.equal(expressionComplexity(parse('a / (x - 1) + (x + 2)^(-1) + x^(1/2) + V / l / w')).reciprocals, 5);
  // An authored question larger than the floor raises the budget to its own size.
  const authored = chain(14, ' + ', (index) => `${index + 2} x`);
  assert.equal(studentExpressionBudget(authored, '5').chain, 14);
  assert.equal(isSafeStudentExpression(authored, studentExpressionBudget(authored, '5')), true);
  // Reciprocal terms move between sides as a formula is rearranged: every
  // authored one plus one more.
  assert.equal(studentExpressionBudget('1 / f', '1 / u + 1 / v').reciprocals, 4);
  assert.deepEqual(expressionComplexity(parse('2(x + 3) - 4 x + 1')), { nodes: 12, depth: 6, chain: 3, reciprocals: 0 });
});

test('equation: the budget admits every state the balance produces — successive divisions and a rearranged reciprocal formula', () => {
  // Rearranged with the workspace's own engine: divide by each letter in turn.
  const PRODUCT = { type: 'stepAlgebra', prompt: 'Solve for t.', equation: 'I = P*r*t', solveFor: 't' };
  const successive = solveOnBalance(PRODUCT, [['divide', 'P'], ['divide', 'r']]);
  assert.equal(parity(PRODUCT, equationWork(successive), 'I / P / r').isCorrect, true);
  // 1/f = 1/u + 1/v solved for u ends with three reciprocal terms on one side.
  const LENS = { type: 'stepAlgebra', prompt: 'Solve for u.', equation: '1/f = 1/u + 1/v', solveFor: 'u' };
  assert.equal(parity(LENS, equationWork({ left: 'u', right: '1 / (1 / f - 1 / v)' }), 'lens').isCorrect, true);
  assert.equal(parity(LENS, equationWork({ left: 'u', right: '1 / (1 / f + 1 / v)' }), 'lens wrong').isCorrect, false);
  // A side still carrying ten unsimplified terms (the floor) is read: x is
  // isolated once it simplifies to x. (The engine-driven batteries in review
  // never produced a side longer than 7 links.)
  const padded = { left: '(3 x + 6 + 2 - 8 + 4 - 4 + 1 - 1 + 5 - 5) / 3', right: '5' };
  assert.equal(parity(LINEAR, equationWork(padded), 'padded').isCorrect, true);
});

// ===========================================================================
// Relation workspace
// ===========================================================================

test('relation: inequalities — the workspace\'s final relation is correct, a different one is not, and the old verdict agrees', () => {
  const cases = [
    [INEQUALITY, 'x <= 2', true],
    [INEQUALITY, '2 >= x', true],
    [INEQUALITY, 'x < 2', false],
    [INEQUALITY, 'x <= 3', false],
    [FLIP, 'x < -2', true],
    [FLIP, 'x > -2', false],
    [PROMPT_ONLY, 'x < -2', true],
    [BETWEEN, '-2 < x < 5', true],
    [BETWEEN, '5 > x > -2', true],
    [BETWEEN, '-2 <= x < 5', false],
    [OUTSIDE, 'x <= -5 OR x >= 3', true],
    [OUTSIDE, 'x >= 3 OR x <= -5', true],
    [OUTSIDE, 'x >= 3', false],
  ];
  cases.forEach(([question, final, expected]) => {
    const result = parity(question, relationWork(final), `${question.equation || question.prompt} -> ${final}`);
    assert.equal(result.isComplete, true, final);
    assert.equal(result.isCorrect, expected, `${question.equation || question.prompt} -> ${final}`);
    assert.deepEqual(result.parts.map((part) => part.id), ['relation-work']);
    assert.equal(result.parts[0].response, final.replace(/\s+/g, ' '));
    if (expected) {
      const pristine = relation(question.equation || '-2x + 3 > 7');
      assert.equal(legacyRelationVerdict({ pristine, relationState: relation(final) }).isCorrect, true, final);
    }
  });
  // Unsolved and pending-symbol states are incomplete.
  assert.equal(parity(FLIP, relationWork('-3 x > 6'), 'unsolved').isComplete, false);
  const pending = parity(FLIP, relationWork('x > -2', { awaitingSymbolDecision: true }), 'pending flip');
  assert.equal(pending.isComplete, false);
  assert.equal(pending.isCorrect, false);
});

test('relation: absolute-value equations — candidates classified against the ORIGINAL equation, partial credit', () => {
  const both = relationWork('x = 5 OR x = -2', { candidateChecks: { 5: 'valid', '-2': 'valid' } });
  const right = parity(ABS_EQ, both, 'both valid');
  assert.equal(right.isCorrect, true);
  assert.deepEqual(right.parts.map((part) => [part.id, part.response]), [['relation-work', 'x = 5 OR x = -2'], ['candidate-verification', '-2:valid, 5:valid']]);
  const misclassified = parity(ABS_EQ, relationWork('x = 5 OR x = -2', { candidateChecks: { 5: 'valid', '-2': 'extraneous' } }), 'misclassified');
  assert.equal(misclassified.isComplete, true);
  assert.equal(misclassified.isCorrect, false);
  assert.equal(misclassified.score, 0.5);
  const unchecked = parity(ABS_EQ, relationWork('x = 5 OR x = -2', { candidateChecks: { 5: 'valid' } }), 'unchecked');
  assert.equal(unchecked.isComplete, false);
  // An extraneous candidate must be called extraneous.
  assert.equal(parity(EXTRANEOUS, relationWork('x = 5 OR x = 1', { candidateChecks: { 5: 'valid', 1: 'extraneous' } }), 'extraneous').isCorrect, true);
  assert.equal(parity(EXTRANEOUS, relationWork('x = 5 OR x = 1', { candidateChecks: { 5: 'valid', 1: 'valid' } }), 'called valid').isCorrect, false);
  // A dropped branch, or an invented "extraneous" value, is not the original's solution set.
  assert.equal(parity(ABS_EQ, relationWork('x = 5', { candidateChecks: { 5: 'valid' } }), 'dropped branch').isCorrect, false);
  assert.equal(parity(EXTRANEOUS, relationWork('x = 5 OR x = 100', { candidateChecks: { 5: 'valid', 100: 'extraneous' } }), 'invented').isCorrect, false);
  // The old verdict agreed on the legitimate states.
  for (const [question, final, checks, expected] of [
    [ABS_EQ, 'x = 5 OR x = -2', { 5: 'valid', '-2': 'valid' }, true],
    [ABS_EQ, 'x = 5 OR x = -2', { 5: 'valid', '-2': 'extraneous' }, false],
    [EXTRANEOUS, 'x = 5 OR x = 1', { 5: 'valid', 1: 'extraneous' }, true],
  ]) {
    assert.equal(legacyRelationVerdict({ pristine: relation(question.equation), relationState: relation(final), candidateChecks: checks }).isCorrect, expected);
    assert.equal(stepAlgebraWorkGrader.grade(question, relationWork(final, { candidateChecks: checks })).isCorrect, expected);
  }
});

test('relation: square roots, no solution and all real numbers are judged against the original\'s solution set', () => {
  assert.equal(parity(SQUARE, relationWork('x = 3 OR x = -3'), 'both roots').isCorrect, true);
  assert.equal(parity(SQUARE, relationWork('x = -3 OR x = 3'), 'reordered roots').isCorrect, true);
  assert.equal(parity(SQUARE, relationWork('x = 3'), 'missing root').isCorrect, false);
  assert.equal(parity(NO_SOLUTION, relationWorkspaceWork({ relationState: { special: 'noSolution', branches: [] } }), 'no solution').isCorrect, true);
  assert.equal(parity(ALL_REALS, relationWorkspaceWork({ relationState: { special: 'allReals', branches: [] } }), 'all reals').isCorrect, true);
  assert.equal(parity(ALL_REALS, relationWorkspaceWork({ relationState: { special: 'noSolution', branches: [] } }), 'wrong claim').isCorrect, false);
  assert.equal(parity(INEQUALITY, relationWorkspaceWork({ relationState: { special: 'allReals', branches: [] } }), 'false claim').isCorrect, false);
});

test('relation: a literal absolute-value equation split on the workspace is correct — each value solves one sign branch', () => {
  // |x - h| = k reversed on the workspace becomes x - h = k OR x - h = -(k),
  // solved as x = k + h OR x = -k + h. Substituted back, |k| = k holds only
  // for k >= 0, so the original never holds identically; each value must be
  // judged against the sign branch it came from (as a numeric extraneous
  // candidate already is).
  const LITERAL_ABS = { type: 'stepAlgebra', prompt: 'Solve for x.', equation: '|x - h| = k', solveFor: 'x' };
  const split = buildAbsoluteValueSplit(relation('|x - h| = k'), 0, 'or');
  assert.equal(split.ready, true);
  assert.deepEqual(split.state.branches.map((branch) => branch.expressions), [['x - h', 'k'], ['x - h', '-(k)']]);
  for (const final of ['x = k + h OR x = -k + h', 'x = h - k OR x = h + k']) {
    const result = parity(LITERAL_ABS, relationWork(final), final);
    assert.equal(result.isComplete, true, final);
    assert.equal(result.isCorrect, true, final);
    assert.equal(legacyRelationVerdict({ pristine: relation(LITERAL_ABS.equation), relationState: relation(final) }).isCorrect, true);
  }
  // A value from neither branch is wrong; so is the right work against another question.
  assert.equal(parity(LITERAL_ABS, relationWork('x = h + 2k OR x = h - k'), 'h + 2k').isCorrect, false);
  assert.equal(parity({ ...LITERAL_ABS, equation: '|x - h| = 2k' }, relationWork('x = k + h OR x = -k + h'), 'altered').isCorrect, false);
  // A numeric bound needs no sign branch, and still checks out.
  assert.equal(parity({ ...LITERAL_ABS, equation: '|2x - a| = 6' }, relationWork('x = (6 + a) / 2 OR x = (a - 6) / 2'), 'numeric bound').isCorrect, true);
});

test('relation: solution representations are re-graded from the checked number line, exactly as the number line grades itself', () => {
  const graphed = (intervals, notation = '', inequality = '') => ({ intervals, notation, inequality });
  const ray = graphed([{ min: -Infinity, max: 2, minClosed: false, maxClosed: true }], '(-\\infty, 2]');
  const right = parity(REPRESENT, relationWork('x <= 2', { representation: ray }), 'graph + notation');
  assert.equal(right.isCorrect, true);
  assert.deepEqual(right.parts.map((part) => [part.id, part.label, part.response]), [
    ['relation-work', 'Solve the equation or inequality', 'x <= 2'],
    ['solution-representations', 'Graph and interval notation', 'correct'],
  ]);
  // Not yet checked: incomplete. Checked but wrong: still incomplete (the
  // workspace only finishes on a correct representation) and the part is wrong.
  assert.equal(parity(REPRESENT, relationWork('x <= 2'), 'unchecked').isComplete, false);
  const openEnd = graphed([{ min: -Infinity, max: 2, minClosed: false, maxClosed: false }], '(-\\infty, 2)');
  const wrong = parity(REPRESENT, relationWork('x <= 2', { representation: openEnd }), 'open endpoint');
  assert.equal(wrong.isComplete, false);
  assert.deepEqual(wrong.parts.map((part) => [part.isComplete, part.isCorrect]), [[true, true], [true, false]]);
  // Algebra I asks for the graph only.
  const algebraOne = parity(REPRESENT_ALG1, relationWork('x <= 2', { representation: graphed(ray.intervals) }), 'algebra 1');
  assert.equal(algebraOne.isCorrect, true);
  assert.equal(algebraOne.parts[1].label, 'Graph the solution');
  // The representation is graded against THIS solution, never an author's key.
  assert.equal(parity(REPRESENT, relationWork('x <= 2', { representation: graphed([{ min: -Infinity, max: 3, minClosed: false, maxClosed: true }], '(-\\infty, 3]') }), 'other ray').isComplete, false);

  // Pinned to the number line's own shared grader on the same work: the mirror
  // here cannot drift from tools/intervalNumberLine.mjs.
  const ask = (question) => (question.courseId ? ['graph'] : ['graph', 'interval']);
  const works = [
    ray, openEnd, graphed(ray.intervals), graphed(ray.intervals, '(-inf, 2]'), graphed(ray.intervals, '(-\\infty,2)'),
    graphed([]), graphed([{ min: -10, max: 2, minClosed: true, maxClosed: true }], '[-10, 2]'), graphed(ray.intervals, 'x <= 2'),
    graphed([{ min: -Infinity, max: 2, minClosed: false, maxClosed: true }, { min: 5, max: 6, minClosed: true, maxClosed: true }], '(-\\infty, 2]'),
  ];
  for (const question of [REPRESENT, REPRESENT_ALG1]) {
    works.forEach((representation) => {
      const nested = gradeToolCheck(intervalNumberLineGrader, {
        intervals: relationSolutionSummary(relation('x <= 2')).intervals, ask: ask(question), variable: 'x',
      }, representation);
      const ours = stepAlgebraWorkGrader.grade(question, relationWork('x <= 2', { representation }));
      assert.equal(ours.parts.find((part) => part.id === 'solution-representations').isCorrect, nested.isCorrect, JSON.stringify(representation));
    });
  }
});

test('relation discrimination and tampering: altered relation, forged states, injected keys, non-object work', () => {
  assert.equal(parity(INEQUALITY, relationWork('x <= 2'), 'key').isCorrect, true);
  assert.equal(parity({ ...INEQUALITY, equation: '2x + 3 <= 9' }, relationWork('x <= 2'), 'altered').isCorrect, false);
  assert.equal(parity(ABS_EQ, relationWork('x = 5 OR x = -2', { candidateChecks: { 5: 'valid', '-2': 'valid' } }), 'abs key').isCorrect, true);
  assert.equal(parity({ ...ABS_EQ, equation: '|2x - 3| = 9' }, relationWork('x = 5 OR x = -2', { candidateChecks: { 5: 'valid', '-2': 'valid' } }), 'abs altered').isCorrect, false);
  // Injected verdicts are dropped and ignored.
  const injected = { ...relationWork('x < 2'), isCorrect: true, correct: true, score: 1, feedback: 'great' };
  assert.deepEqual(boundToolWork(injected).dropped.sort(), ['correct', 'feedback', 'isCorrect', 'score']);
  assert.equal(parity(INEQUALITY, injected, 'injected').isCorrect, false);
  // Malformed relation states are blank work.
  for (const work of [
    { relation: 'x <= 2' },
    { relation: { branches: [{ expressions: ['x'], relations: [] }] } },
    { relation: { branches: [{ expressions: ['x', '2'], relations: ['=>'] }] } },
    { relation: { branches: [{ expressions: ['x', 'createUnit("knot")'], relations: ['<='] }] } },
    { relation: { special: 'everything' } },
  ]) {
    const graded = parity(INEQUALITY, work, JSON.stringify(work));
    assert.equal(graded.graded, true);
    assert.equal(graded.isCorrect, false);
  }
  assert.equal(gradeToolCheck(stepAlgebraWorkGrader, INEQUALITY, 'x <= 2').graded, false);
  // Realistic maximal relation work is small and drops nothing.
  const maximal = relationWork('x = 5 OR x = -2', {
    candidateChecks: { 5: 'valid', '-2': 'valid' },
    representation: { intervals: Array.from({ length: 4 }, () => ({ min: -Infinity, max: 2, minClosed: false, maxClosed: true })), notation: '(-\\infty, 2]', inequality: 'x \\le 2' },
  });
  assert.deepEqual(boundToolWork(maximal).dropped, []);
  assert.ok(canonicalToolWorkJson(maximal).length < 2000);
});

test('relation: a boundary is judged where the student put it — near-misses and forged far branches are wrong', () => {
  const QUADRATIC = { type: 'stepAlgebra', prompt: 'Solve.', equation: 'x^2 - 5x + 6 < 0', representSolution: false };
  assert.equal(parity(QUADRATIC, relationWork('2 < x < 3'), 'quadratic').isCorrect, true);
  // A wrong interval with a far-away extra branch: the extra endpoint used to
  // stretch the scan of the original until its real boundary (3) was missed.
  for (const forged of ['2 < x < 3.5 OR x > 1e300', '2 < x < 3.5 OR x > 100000000000', '2 < x < 4 OR x > 1e300']) {
    const result = parity(QUADRATIC, relationWork(forged), forged);
    assert.equal(result.isComplete, true, forged);
    assert.equal(result.isCorrect, false, forged);
  }
  // Beyond the magnitude the scan can confirm, nothing is confirmed — even a union that happens to be equivalent.
  assert.equal(MAX_SOLUTION_MAGNITUDE, 1e12);
  assert.equal(parity(INEQUALITY, relationWork('x <= 2 OR x <= -1e300'), 'far duplicate').isCorrect, false);
  // A boundary close to the right one is still the wrong boundary.
  const THIRD = { type: 'stepAlgebra', prompt: 'Solve.', equation: '3x - 1 <= 0', representSolution: false };
  assert.equal(parity(THIRD, relationWork('x <= 1 / 3'), '1/3').isCorrect, true);
  assert.equal(parity(THIRD, relationWork('x <= 0.3333333'), '0.3333333').isCorrect, false);
  assert.equal(parity(INEQUALITY, relationWork('x <= 2.000001'), '2.000001').isCorrect, false);
  // A boundary far from zero is found, and judged exactly.
  const FAR = { type: 'stepAlgebra', prompt: 'Solve.', equation: '0.001x <= 5000', representSolution: false };
  assert.equal(parity(FAR, relationWork('x <= 5000000'), 'far boundary').isCorrect, true);
  assert.equal(parity(FAR, relationWork('x < 5000001'), 'far near-miss').isCorrect, false);
  assert.equal(parity(FAR, relationWork('x <= 4999999'), 'far near-miss inside').isCorrect, false);
  // Exact forms the workspace writes, judged at their own value.
  const SEVENTHS = { type: 'stepAlgebra', prompt: 'Solve.', equation: '7x < 2', representSolution: false };
  assert.equal(parity(SEVENTHS, relationWork('x < 2 / 7'), '2/7').isCorrect, true);
  const TOUCH = { type: 'stepAlgebra', prompt: 'Solve.', equation: '(x - 3)^2 > 0', representSolution: false };
  assert.equal(parity(TOUCH, relationWork('x < 3 OR x > 3'), 'touching').isCorrect, true);
  assert.equal(parity({ ...TOUCH, equation: 'x^2 = 2' }, relationWork('x = sqrt(2) OR x = -sqrt(2)'), 'irrational values').isCorrect, true);
  // More branches, or longer chains, than the workspace ever writes are not its work.
  const many = relationWork(Array.from({ length: 9 }, (_, index) => `x = ${index}`).join(' OR '));
  assert.equal(parity(ABS_EQ, many, 'nine branches').isCorrect, false);
  const longChain = relationWorkspaceWork({ relationState: { branches: [{ expressions: ['-2', 'x', '1', '2', '3', '5'], relations: ['<', '<', '<', '<', '<'] }] } });
  assert.equal(parity(BETWEEN, longChain, 'six-part chain').isComplete, false);
});

test('relation: realistic relation work grades quickly enough to run on every committed state', () => {
  const started = Date.now();
  for (const [question, final, checks] of [
    [BETWEEN, '-2 < x < 5', {}],
    [OUTSIDE, 'x <= -5 OR x >= 3', {}],
    [ABS_EQ, 'x = 5 OR x = -2', { 5: 'valid', '-2': 'valid' }],
    [SQUARE, 'x = 3 OR x = -3', {}],
  ]) {
    assert.equal(stepAlgebraWorkGrader.grade(question, relationWork(final, { candidateChecks: checks })).isCorrect, true, final);
  }
  assert.ok(Date.now() - started < 10_000, `took ${Date.now() - started}ms`);
});

// ===========================================================================
// Linear intercepts
// ===========================================================================

test('intercepts: each typed ordered pair is checked exactly as the orchestrator\'s Check did', () => {
  const points = ['(6, 0)', '(6,0)', '\\left(6,0\\right)', '(6.0000001, 0)', '(6.01, 0)', '(0, 4)', '(0,4)', '(4, 0)', '6, 0', '(6)', '', 'six'];
  for (const question of [INTERCEPTS, INTERCEPTS_STANDARD]) {
    const standard = resolveStandardCoefficients(question);
    for (const kind of ['x', 'y']) {
      for (const point of [...points, '(2.5, 0)', '(0, -2)']) {
        assert.equal(checkLinearIntercept(standard, kind, point), legacyInterceptCheck(question, kind, point), `${kind} ${point}`);
      }
    }
  }
});

test('intercepts: both pairs right is correct; one wrong is half credit; one blank is incomplete', () => {
  const right = parity(INTERCEPTS, linearInterceptsWork({ xIntercept: '(6, 0)', yIntercept: '(0, 4)' }), 'both');
  assert.equal(right.isCorrect, true);
  assert.deepEqual(right.parts.map((part) => [part.id, part.response]), [['x-intercept', '(6, 0)'], ['y-intercept', '(0, 4)']]);
  const oneWrong = parity(INTERCEPTS, linearInterceptsWork({ xIntercept: '(4, 0)', yIntercept: '(0, 4)' }), 'one wrong');
  assert.equal(oneWrong.isComplete, true);
  assert.equal(oneWrong.score, 0.5);
  assert.equal(parity(INTERCEPTS, linearInterceptsWork({ xIntercept: '(6, 0)' }), 'blank').isComplete, false);
  // Fractions and decimals, LaTeX pairs.
  assert.equal(parity(INTERCEPTS_STANDARD, linearInterceptsWork({ xIntercept: '(2.5, 0)', yIntercept: '\\left(0,-2\\right)' }), 'standard').isCorrect, true);
  // Discrimination: the same pairs against another line.
  assert.equal(parity({ ...INTERCEPTS, equation: '2x + 3y = 18' }, linearInterceptsWork({ xIntercept: '(6, 0)', yIntercept: '(0, 4)' }), 'altered line').isCorrect, false);
  // Injected verdicts and non-object work.
  const injected = { ...linearInterceptsWork({ xIntercept: '(4, 0)', yIntercept: '(0, 4)' }), isCorrect: true, expected: [[6, 0], [0, 4]] };
  assert.equal(parity(INTERCEPTS, injected, 'injected').isCorrect, false);
  assert.equal(parity(INTERCEPTS, { xIntercept: [6, 0], yIntercept: { x: 0, y: 4 } }, 'wrong types').isCorrect, false);
});

// ===========================================================================
// Responses captured before the structured contract (older clients, Recovery)
// ===========================================================================

test('legacy responses: the family final answer keeps its existing path; other old keys are re-marked by the shared grader', () => {
  const instance = familyInstance();
  const answer = Number(instance.generatedAnswer);
  const legacy = (question, value) => gradeServerResponse({ question, response: { kind: 'opaque', type: question.type, value, fields: [] } });
  assert.equal(legacy(instance, `x=${answer}`).isCorrect, true);
  assert.equal(legacy(instance, `x=${answer + 1}`).isCorrect, false);
  // An unsimplified final the workspace accepts as solved, which the
  // final-answer parser cannot read, is still marked against the generated answer.
  const unsimplified = legacy(instance, ` x = -1\\left(${-answer}\\right)|{}`);
  assert.equal(unsimplified.graded, true);
  assert.equal(unsimplified.isCorrect, true);
  assert.equal(legacy(instance, ` x = -1\\left(${-answer - 1}\\right)|{}`).isCorrect, false);
  // A static question's old `latex|prompts` key.
  assert.equal(legacy(LINEAR, ' x = 5|{}').isCorrect, true);
  assert.equal(legacy(LINEAR, ' x = 6|{}').isCorrect, false);
  assert.equal(legacy({ type: 'stepAlgebra', equation: '2x = 7' }, ' x = \\frac{7}{2}|{}').isCorrect, true);
  assert.equal(legacy(SLOPE, ' y = \\frac{-2}{3}~ x+5|{}').isCorrect, true);
  assert.equal(legacy(PROMPTS, ` x = \\frac{7}{2}|${JSON.stringify({ expand: '2+2x', 'algebra-prompt-2': '2x' })}`).isCorrect, true);
  assert.equal(legacy(PROMPTS, ` x = \\frac{7}{2}|${JSON.stringify({ expand: '2x+1', 'algebra-prompt-2': '2x' })}`).isCorrect, false);
  // Relation (the engine's own text) and intercept keys.
  assert.equal(legacy(ABS_EQ, `x = 5 OR x = -2|${JSON.stringify({ 5: 'valid', '-2': 'valid' })}`).isCorrect, true);
  assert.equal(legacy(ABS_EQ, `x = 5 OR x = -2|${JSON.stringify({ 5: 'valid', '-2': 'extraneous' })}`).isCorrect, false);
  assert.equal(legacy(INTERCEPTS, JSON.stringify({ x: [6, 0], y: [0, 4] })).isCorrect, true);
  assert.equal(legacy(INTERCEPTS, JSON.stringify({ x: [4, 0], y: [0, 4] })).isCorrect, false);
  assert.equal(legacy(LINEAR, 'garbage = = =').graded, false);
});

test('legacy responses: an old key the server cannot read back exactly keeps the sanitized legacy path — never re-marked wrong', () => {
  const opaque = (question, value) => ({ kind: 'opaque', type: question.type, value, fields: [] });
  const legacy = (question, value) => gradeServerResponse({ question, response: opaque(question, value) });
  const regrade = (question, value) => serverCanRegradeEnvelope({ envelope: { kind: 'ordinarySubmission', response: opaque(question, value) }, question });
  // The equation half of an old key is DISPLAY LaTeX (equationToLatex), which
  // drops what separates two factors. Each key below is what the old workspace
  // wrote for an isolated (so complete, so submittable) engine state of a
  // CORRECT solve. Read back, r * t is the name `rt` and t * 7 the name `t7`,
  // and the solve was re-marked WRONG; `b1` and `Area2` cannot be told from
  // b * 1 and Area * 2.
  const RATE = { type: 'stepAlgebra', prompt: 'Solve for t.', equation: 'd = r*t', solveFor: 't' };
  const DECIMAL = { type: 'stepAlgebra', prompt: 'Solve.', equation: '0.7t + 1.3 = 2.1', solveFor: 't' };
  const SUBSCRIPT = { type: 'stepAlgebra', prompt: 'Solve for x.', equation: 'y = m*x + b1', solveFor: 'x' };
  const NAMED = { type: 'stepAlgebra', prompt: 'Solve for A.', equation: 'A = Area*2', solveFor: 'A' };
  const key = (equation) => `${equationToLatex(equation)}|{}`;
  const lossy = [
    [RATE, key(solveOnBalanceUnsimplified(RATE, [['divide', 'r']]))],
    [DECIMAL, key(solveOnBalanceUnsimplified(DECIMAL, [['subtract', '1.3'], ['divide', '0.7']]))],
    [SUBSCRIPT, key(solveOnBalance(SUBSCRIPT, [['subtract', 'b1'], ['divide', 'm']]))],
    [NAMED, key(parseEquationInput(NAMED))],
  ];
  assert.deepEqual(lossy.map(([, value]) => value.match(/rt|t7|b1|Area2/)?.[0]), ['rt', 't7', 'b1', 'Area2']);
  for (const [question, value] of lossy) {
    // Each is a complete, correct state on the structured path.
    const state = question === NAMED ? parseEquationInput(NAMED) : question === SUBSCRIPT
      ? solveOnBalance(SUBSCRIPT, [['subtract', 'b1'], ['divide', 'm']])
      : solveOnBalanceUnsimplified(question, question === RATE ? [['divide', 'r']] : [['subtract', '1.3'], ['divide', '0.7']]);
    assert.equal(parity(question, equationWork(state), value).isCorrect, true, value);
    assert.equal(stepAlgebraQuestionGrader.accepts(opaque(question, value)), false, value);
    const result = legacy(question, value);
    assert.equal(result.graded, false, value);
    assert.equal(result.reason, 'response-shape-not-accepted', value);
    // Ingestion: not blocked, not re-marked — the sanitized path it always took.
    assert.deepEqual(regrade(question, value), { regrade: false, reason: 'legacy-unstructured-response' }, value);
  }
  // An old inequality key never carried the number line it was asked for
  // (and only that check decides it), so it takes the same legacy path.
  for (const question of [INEQUALITY, REPRESENT]) {
    assert.equal(legacy(question, 'x <= 2|{}').reason, 'response-shape-not-accepted');
    assert.deepEqual(regrade(question, 'x <= 2|{}'), { regrade: false, reason: 'legacy-unstructured-response' });
  }
  // A readable key IS re-marked (and a family instance's still is).
  assert.equal(regrade(LINEAR, ' x = 5|{}').regrade, true);
  // Safety nets behind accepts(): a key that reads back as unfinished work
  // (the old workspace wrote one only for finished work) or with a letter the
  // question does not have was misread or forged — held, never marked wrong.
  assert.equal(stepAlgebraQuestionGrader.accepts(opaque(LINEAR, ' 3x + 6 = 21|{}')), true);
  assert.equal(legacy(LINEAR, ' 3x + 6 = 21|{}').reason, 'legacy-response-unreadable');
  assert.equal(legacy(LINEAR, ' x = q|{}').reason, 'legacy-response-unreadable');
});

test('accepts(): this surface\'s structured response and the old key — never another tool\'s response or a blank', () => {
  const tool = buildToolResponse({ question: LINEAR, toolId: 'stepAlgebra', work: equationWork({ left: 'x', right: '5' }) });
  assert.equal(stepAlgebraQuestionGrader.accepts(tool), true);
  assert.equal(stepAlgebraQuestionGrader.accepts({ ...tool, toolId: 'graphing2' }), false);
  assert.equal(stepAlgebraQuestionGrader.accepts({ ...tool, toolId: 'literalWorkspace' }), false);
  assert.equal(stepAlgebraQuestionGrader.accepts({ kind: 'opaque', type: 'stepAlgebra', value: 'x = 5|{}' }), true);
  assert.equal(stepAlgebraQuestionGrader.accepts({ kind: 'opaque', type: 'stepAlgebra', value: '  ' }), false);
  assert.equal(stepAlgebraQuestionGrader.accepts(null), false);
  // A response for another tool is refused even if it reaches grade().
  assert.equal(gradeServerResponse({ question: LINEAR, response: { ...tool, toolId: 'graphing2' } }).graded, false);
  // A client newer than the server: the work waits, ungraded.
  assert.equal(gradeServerResponse({ question: LINEAR, response: { ...tool, contractVersion: 2 } }).reason, 'response-contract-newer-than-server');
});

// ===========================================================================
// The workspaces report ONLY the shared verdict
// ===========================================================================

test('StepByStepAlgebraCore reports the shared grader\'s verdict for its own work, and computes none of its own', () => {
  const core = executableSource(read(CORE));
  assert.match(core, /import \{ equationWorkspaceWork, workGraderForQuestion \} from '\.\.\/functions\/shared\/serverGrading\/stepAlgebraWorkspaceGrading\.mjs';/);
  assert.match(core, /import \{ gradeToolCheck \} from '\.\/tools\/shared\/sharedToolGrading\.js';/);
  assert.match(core, /const gradingWork = useMemo\(\(\) => equationWorkspaceWork\(\{ equation, promptAnswers \}\), \[equation, promptAnswers\]\);/);
  const report = region(core, 'const result = gradeToolCheck(workGraderForQuestion(question), question, gradingWork);', '}, [equation, gradingWork', 'state report');
  assert.match(report, /\.\.\.shared,/);
  assert.match(report, /answerStateFromSharedGrading\(result/);
  // No verdict of its own: neither isSolvedEquation nor prompt equivalence
  // decides the report, and the only verdict it writes itself is the
  // "unreadable work" placeholder, which is never correct.
  assert.doesNotMatch(report, /isSolvedEquation|expressionsEquivalent/);
  assert.doesNotMatch(report, /isCorrect:(?!\s*false\b)/);
  assert.doesNotMatch(report, /isComplete:(?!\s*false\b)/);
});

test('MultiRelationAlgebraCore reports the shared verdict, and keeps the nested number line\'s WORK rather than its verdict', () => {
  const core = executableSource(read(RELATION_CORE));
  assert.match(core, /const sharedResult = useMemo\(\s*\(\) => gradeToolCheck\(workGraderForQuestion\(question\), question, gradingWork\),/);
  assert.match(core, /relationWorkspaceWork\(\{\s*relationState,\s*awaitingSymbolDecision: Boolean\(pendingRelationFlip\),\s*candidateChecks,\s*representation: representationWork,/);
  const report = region(core, 'const relationText = relationStateToText(relationState);', 'onRelationDisplayChange?.(relationStateToLatex', 'state report');
  assert.match(report, /answerStateFromSharedGrading\(sharedResult/);
  assert.match(report, /\.\.\.shared,/);
  assert.doesNotMatch(report, /isCorrect:(?!\s*false\b)/);
  assert.doesNotMatch(report, /isComplete:(?!\s*false\b)/);
  assert.doesNotMatch(report, /candidateVerificationCorrect|representationCorrect/);
  const nested = region(core, "if (action === 'ATTEMPT_SUBMITTED') {", '}', 'nested number line');
  assert.match(nested, /setRepresentationWork\(payload\?\.response \?\? null\)/);
  assert.doesNotMatch(nested, /payload\?\.isCorrect/);
});

test('LinearInterceptsOrchestrator checks each point and reports completion through the shared grader', () => {
  const orchestrator = executableSource(read(ORCHESTRATOR));
  const check = region(orchestrator, 'const checkCurrentIntercept = () => {', 'if (!isCorrect) {', 'intercept check');
  assert.match(check, /const isCorrect = checkLinearIntercept\(standard, kind, stage\.point\);/);
  const payload = region(orchestrator, 'const interceptCompletionPayload = (finishedWork) => {', 'const progressiveRedirect', 'completion payload');
  assert.match(payload, /gradeToolCheck\(stepAlgebraWorkGrader, question, linearInterceptsWork\(\{ xIntercept, yIntercept \}\)\)/);
  assert.doesNotMatch(payload, /isCorrect: true/);
  // Each one-variable sub-solve is marked by the shared grader against the
  // sub-equation it opened — so it must not inherit the PARENT's generated
  // answer, which would mark a correct sub-solve (and so the stage) unsolved.
  // The orchestrator builds that question with the shared
  // interceptSubEquationQuestion (the one the server checks the sub-solve's
  // steps against), which keeps the parent's other fields and drops the key.
  const subQuestion = region(orchestrator, 'const subEquationQuestion = useMemo(', '[stage.committed', 'sub-equation question');
  assert.match(subQuestion, /interceptSubEquationQuestion\(question, standard, stage\.placedZeroVariable\)/);
  const built = interceptSubEquationQuestion({ ...INTERCEPTS, generatedAnswer: 4, expectedStepPoints: 5 }, { A: 2, B: 3, C: 12 }, 'y');
  assert.equal(built.generatedAnswer, undefined, 'the parent key is dropped');
  assert.equal(built.expectedStepPoints, 5, 'the parent question is otherwise kept');
  assert.equal(built.equation, '2x = 12');
  assert.equal(built.solveFor, 'x');
  const subSolve = { type: 'stepAlgebra', mode: undefined, equation: '2 * x = 12', solveFor: 'x', variable: 'x' };
  const solved = equationWork({ left: 'x', right: '6' });
  assert.equal(stepAlgebraWorkGrader.grade(subSolve, solved).isCorrect, true);
  assert.equal(stepAlgebraWorkGrader.grade({ ...subSolve, generatedAnswer: 4 }, solved).isCorrect, false, 'what an inherited key would do');
  assert.equal(stepAlgebraWorkGrader.grade({ ...subSolve, generatedAnswer: undefined }, solved).isCorrect, true);
});

test('the workspace picks its surface from the question it was opened with', () => {
  assert.equal(workGraderForQuestion(LINEAR), stepAlgebraWorkGrader);
  assert.equal(workGraderForQuestion(INEQUALITY), stepAlgebraWorkGrader);
  assert.equal(workGraderForQuestion({ ...LINEAR, gradingSurface: 'literalWorkspace' }).toolId, 'literalWorkspace');
});
