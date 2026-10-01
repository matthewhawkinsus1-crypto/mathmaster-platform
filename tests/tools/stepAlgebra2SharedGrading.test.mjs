import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import stepAlgebra2Grader, {
  LEGACY_SOLVER_DEFAULT_EQUATION,
  applyLegacySolverOperation,
  legacySolverWork,
  resolveRewriteTargetForm,
  rewriteLinearFormWork,
} from '../../functions/shared/serverGrading/tools/stepAlgebra2.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/stepAlgebra2.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST, resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { applyBalancedOperation, parseEquationInput } from '../../src/algebraAstEngine.js';
import { resolveEquationAfterMove } from '../../src/algebraSupportLevels.js';
import { commitStructureTool, openStructureTool } from '../../src/algebraStructureTools.js';
import {
  exposeFactorTokens,
  factorTokensForTerm,
  findFactorableList,
  pullOutCommonFactor,
  setFactorQuotient,
  toggleFactorTerm,
  toggleFactorToken,
  toggleNegativeFactor,
} from '../../src/algebraFactoringModel.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * STEP ALGEBRA 2 IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The browser's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts — and that verdict must
 * be the one the screen's old inline Check reached for the work a student can
 * really produce. Both graded views are step workspaces, so the work is the
 * student's steps, re-checked against the question's own equation.
 */

const STEP_ALGEBRA_2 = 'src/tools/stepAlgebra2/StepAlgebra2.jsx';
const REWRITE = 'src/tools/stepAlgebra2/RewriteLinearForm.jsx';
const solverCode = executableSource(fs.readFileSync(STEP_ALGEBRA_2, 'utf8'));
const rewriteCode = executableSource(fs.readFileSync(REWRITE, 'utf8'));

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(stepAlgebra2Grader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces a tool response for the server');
  const response = JSON.parse(JSON.stringify(browser.toolResponse));
  const server = gradeServerResponse({ question, response });
  // Ingestion grades the delivered (runtime-repaired) question. For every
  // question that still reaches this tool that is the same verdict; a question
  // the repair moves to the mature engine is graded there instead.
  const delivered = deliveredQuestionForGrading(question);
  const comparisons = [['stored', server]];
  if (resolveGradingSurfaceId(delivered) === 'stepAlgebra2') comparisons.push(['delivered', gradeServerResponse({ question: delivered, response })]);
  for (const [label, result] of comparisons) {
    assert.equal(result.graded, browser.graded, `${label}: graded`);
    assert.equal(result.isCorrect, browser.isCorrect, `${label}: isCorrect`);
    assert.equal(result.isComplete, browser.isComplete, `${label}: isComplete`);
    assert.equal(result.score, browser.score, `${label}: score`);
    assert.deepEqual(result.parts, browser.parts, `${label}: parts`);
    if (!browser.graded) assert.equal(result.reason, browser.reason, `${label}: ungraded reason`);
  }
  return { ...browser, mode: server.mode, serverReason: server.reason };
};

const failedIds = (result) => result.parts.filter((part) => !part.isCorrect).map((part) => part.id);

/* ------------------------------------------------------------------ */
/* realistic work, built the way each screen builds it                 */
/* ------------------------------------------------------------------ */

// StepAlgebra2.jsx's Apply: each committed move is { before, operation, operand, after }.
const solverHistory = (equation, moves) => {
  let state = { ...equation };
  return moves.map(([operation, operand]) => {
    const after = applyLegacySolverOperation(state, operation, operand);
    const entry = { before: state, operation, operand, after };
    state = after;
    return entry;
  });
};
const solverWork = (equation, moves) => legacySolverWork(solverHistory(equation, moves));

// The rewrite screen's equation and history mirrors, as the embedded Step
// Algebra reports them: { kind, description, parts, before, after } per step.
const coreStep = (before, after, description = 'Algebra step') => ({
  kind: 'step',
  description,
  parts: [description],
  before: { left: before.left, right: before.right },
  after: { left: after.left, right: after.right },
});
const rewriteState = (equation, objective) => ({ left: equation.left, right: equation.right, variable: 'y', objective });

const factoredStart = (equation) => parseEquationInput({ equation, targetForm: 'factoredLinear' });
const factorAll = (equation, chosen, { negate = false, quotients }) => {
  const options = { allowSignOnly: equation.objective?.kind === 'factoredLinear' };
  const list = findFactorableList(equation, 'right:side', options);
  let tool = openStructureTool('factor', equation);
  list.terms.forEach((_, index) => { tool = toggleFactorTerm(tool, equation, 'right:side', index, options).state; });
  tool = exposeFactorTokens(tool, equation, options).state;
  list.terms.forEach((term, termIndex) => {
    const tokens = factorTokensForTerm(term.signedText);
    const used = new Set();
    chosen.forEach((value) => {
      const index = tokens.findIndex((token, tokenIndex) => token.selectable && String(token.value) === String(value) && !used.has(tokenIndex));
      used.add(index);
      tool = toggleFactorToken(tool, equation, termIndex, index, options).state;
    });
  });
  if (negate) tool = toggleNegativeFactor(tool).state;
  tool = pullOutCommonFactor(tool, equation, options).state;
  quotients.forEach((value, position) => { tool = setFactorQuotient(tool, tool.selected[position], value); });
  const result = commitStructureTool(tool, equation);
  assert.equal(result.ok, true, 'the factoring reducer accepts the move');
  return result.equation;
};
const balancedMove = (equation, operation, operand) => {
  const move = applyBalancedOperation({ equationState: equation, operation, operand });
  return resolveEquationAfterMove(move, 3, move.requiredCancellationSides);
};

/* ------------------------------------------------------------------ */
/* declaration, mode resolution and which questions reach this tool    */
/* ------------------------------------------------------------------ */

// The component's own routing, read from its source: an exact
// `questionData.mode === '<view>'` check per extra view, else the solver.
const componentRouting = (() => {
  const body = region(solverCode, 'export default function StepAlgebra2', 'const original =', 'router');
  const routed = [...body.matchAll(/if \(questionData\.mode === '(\w+)'\) \{?\s*(?:\n\s*)*return </g)].map((match) => match[1]);
  assert.deepEqual(routed.sort(), ['linearIntercepts', 'rewriteLinearForm'], 'the router names its two extra views');
  return routed;
})();
const componentMode = (question) => (componentRouting.includes(question.mode) ? question.mode : 'default');

test('the declaration names every view the tool renders: two shared, one fail-closed with its blocker', () => {
  assert.equal(GRADING_MANIFEST.stepAlgebra2, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, 'default');
  assert.deepEqual(Object.keys(declaration.modes).sort(), ['default', ...componentRouting].sort());
  assert.equal(declaration.modes.default.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(declaration.modes.rewriteLinearForm.authority, GRADING_AUTHORITY.SHARED_SERVER);
  assert.equal(declaration.modes.linearIntercepts.authority, GRADING_AUTHORITY.CLIENT_GRADED);
  assert.match(declaration.modes.linearIntercepts.blocker, /consolidateStepAlgebra2Question/);
  assert.match(declaration.modes.linearIntercepts.blocker, /deliveredQuestionForGrading/);
  assert.doesNotMatch(declaration.modes.linearIntercepts.blocker, /PENDING/);
  assert.deepEqual(Object.keys(stepAlgebra2Grader.modeGraders).sort(), ['default', 'rewriteLinearForm']);
});

test('declared mode resolution reproduces the screen routing exactly, including mis-cased and non-string modes', () => {
  const samples = [
    {}, { mode: '' }, { mode: null }, { mode: 'default' }, { mode: 'rewriteLinearForm' }, { mode: 'linearIntercepts' },
    { mode: 'RewriteLinearForm' }, { mode: 'rewritelinearform' }, { mode: ' rewriteLinearForm ' }, { mode: 'LinearIntercepts' },
    { mode: 'solve' }, { mode: 5 }, { mode: ['rewriteLinearForm'] }, { mode: { toString: () => 'rewriteLinearForm' } },
    { mode: 'constructor' }, { mode: 'toString' },
  ];
  for (const question of samples) {
    assert.equal(resolveToolMode(declaration, question), componentMode(question), `mode ${JSON.stringify(question.mode)}`);
  }
});

test('only the ax + b = c solver and factored-linear rewrites still reach this tool after runtime repair', () => {
  const surfaceAndMode = (stored) => {
    const delivered = deliveredQuestionForGrading(stored);
    const surfaceId = resolveGradingSurfaceId(delivered);
    return { surfaceId, mode: surfaceId === 'stepAlgebra2' ? resolveToolMode(declaration, delivered) : null };
  };
  // Migrated onto the mature engine: never graded by this tool.
  for (const stored of [
    { type: 'stepAlgebra2', toolId: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 3, B: 4, C: 24 } },
    { type: 'stepAlgebra2', mode: 'LinearIntercepts', equation: '2x + 3y = 12' },
    { type: 'stepAlgebra2', mode: 'rewriteLinearForm', equation: '5x + 2y = 6' },
    { type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'slopeIntercept', equation: '5x + 2y = 6' },
    { type: 'stepAlgebra2', equation: '3x + 6 = 21' },
  ]) {
    assert.equal(surfaceAndMode(stored).surfaceId, 'stepAlgebra', JSON.stringify(stored));
  }
  // Still on this tool.
  assert.deepEqual(surfaceAndMode({ type: 'stepAlgebra2', equation: { a: 2, b: 3, c: 7 } }), { surfaceId: 'stepAlgebra2', mode: 'default' });
  assert.deepEqual(surfaceAndMode({ type: 'stepAlgebra2' }), { surfaceId: 'stepAlgebra2', mode: 'default' });
  assert.deepEqual(surfaceAndMode({ toolId: 'stepAlgebra2', type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 5x - 20' }), { surfaceId: 'stepAlgebra2', mode: 'rewriteLinearForm' });
  // A mis-cased factored target is left here by the repair, and the screen opens
  // the slope-intercept objective for it; so does the grader.
  const miscased = { type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'FactoredLinear', equation: '5x + 2y = 6' };
  assert.deepEqual(surfaceAndMode(miscased), { surfaceId: 'stepAlgebra2', mode: 'rewriteLinearForm' });
  assert.equal(resolveRewriteTargetForm(miscased), 'slopeIntercept');
  // A mis-cased rewrite mode stays here too — and the screen opens the solver.
  assert.deepEqual(surfaceAndMode({ type: 'stepAlgebra2', mode: 'RewriteLinearForm', targetForm: 'factoredLinear', equation: { a: 2, b: 3, c: 7 } }), { surfaceId: 'stepAlgebra2', mode: 'default' });

  // An unrepaired intercept question fails closed instead of being marked by the solver grader.
  const unrepaired = { type: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 3, B: 4, C: 24 } };
  const support = serverResponseGradingSupport(unrepaired);
  assert.equal(support.supported, false);
  assert.equal(support.reason, 'mode-not-server-gradable:linearIntercepts');
  const refused = gradeToolCheck(stepAlgebra2Grader, unrepaired, solverWork({ a: 3, b: 6, c: 21 }, [['subtract', 6], ['divide', 3]]));
  assert.equal(refused.graded, false);
  assert.equal(refused.isCorrect, false);
});

/* ------------------------------------------------------------------ */
/* the screens are wired to the shared grader and nothing else         */
/* ------------------------------------------------------------------ */

test('the ax + b = c solver grades its Check through the shared grader and reports the same work it submits', () => {
  assert.match(solverCode, /import stepAlgebra2Grader, \{[^}]*\} from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/stepAlgebra2\.mjs';/);
  assert.match(solverCode, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(solverCode, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  const body = region(solverCode, 'const original =', 'const feedbackMessage', 'legacy solver');
  assert.match(body, /const original = questionData\.equation \|\| LEGACY_SOLVER_DEFAULT_EQUATION;/, 'the screen opens the equation the grader replays from');
  assert.match(body, /const work = useMemo\(\(\) => legacySolverWork\(history\), \[history\]\);/, 'the work is built at render scope from the move history');
  assert.match(body, /useReportToolWork\(work\);/, 'the live work is reported for deadlines');
  // The moves on screen are made by the engine the grader replays with.
  assert.match(solverCode, /applyLegacySolverOperation as applyOperation/);
  assert.doesNotMatch(solverCode, /const applyOperation = /, 'no second definition of a balanced move');
  const apply = region(body, 'const apply = () => {', '\n  };', 'apply');
  assert.match(apply, /const next = applyOperation\(state, operation, operandValue\);/);
  assert.match(apply, /operation, operand: operandValue/, 'every committed move is recorded with its operand');

  const check = region(body, 'const check = () => {', '\n  };', 'check');
  assert.match(check, /const result = gradeToolCheck\(stepAlgebra2Grader, questionData, work\);/);
  assert.match(check, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,\s*\{[^}]*mode: 'default'/);
  assert.match(check, /parts: result\.parts/);
  assert.doesNotMatch(check, /solution|solved|nearlyEqual|state\.c|0\.5/, 'no verdict of its own, and no answer in the metadata');
});

test('the rewrite screen grades its Check through the shared grader and reports the same work it submits', () => {
  assert.match(rewriteCode, /import stepAlgebra2Grader, \{[^}]*\} from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/stepAlgebra2\.mjs';/);
  assert.match(rewriteCode, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(rewriteCode, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  assert.match(rewriteCode, /const targetForm = resolveRewriteTargetForm\(questionData\);/, 'the screen and the grader read the target the same way');
  assert.match(rewriteCode, /const work = useMemo\(\(\) => rewriteLinearFormWork\(equationState, history\), \[equationState, history\]\);/);
  assert.match(rewriteCode, /useReportToolWork\(work\);/);
  const check = region(rewriteCode, 'const check = () => {', '\n  };', 'check');
  assert.match(check, /const result = gradeToolCheck\(stepAlgebra2Grader, questionData, work\);/);
  assert.match(check, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,\s*\{[^}]*mode: 'rewriteLinearForm'/);
  assert.match(check, /parts: result\.parts/);
  assert.doesNotMatch(check, /complete|history\.length|0\.75|0\.4|0\.15|equationState/, 'no verdict or score of its own');
});

/* ------------------------------------------------------------------ */
/* default: the legacy ax + b = c solver                               */
/* ------------------------------------------------------------------ */

const SOLVER = { type: 'stepAlgebra2', toolId: 'stepAlgebra2', equation: { a: 3, b: 6, c: 21 } };

test('solver: the student’s balanced moves solve the equation', () => {
  const work = solverWork(SOLVER.equation, [['subtract', 6], ['divide', 3]]);
  const result = grade(SOLVER, work);
  assert.equal(result.mode, 'default');
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.parts.map((part) => part.id), ['x-isolated', 'x-value']);
  assert.equal(result.parts[1].response, '5');
  // Realistic work loses nothing at the boundary, and carries no answer.
  assert.deepEqual(boundToolWork(work).dropped, []);
  assert.deepEqual(Object.keys(work).sort(), ['stepCount', 'steps']);
  assert.ok(work.steps.every((step) => Object.keys(step).sort().join() === 'operand,operation'));
});

test('solver: every route to x = a number is accepted — order, fractions as decimals, negatives', () => {
  // Divide first, then subtract the new constant.
  assert.equal(grade(SOLVER, solverWork(SOLVER.equation, [['divide', 3], ['subtract', 2]])).isCorrect, true);
  // Multiply by a decimal reciprocal instead of dividing: within the screen's tolerance.
  assert.equal(grade(SOLVER, solverWork(SOLVER.equation, [['subtract', 6], ['multiply', 0.3333333333]])).isCorrect, true);
  // Redundant but balanced moves do not matter.
  assert.equal(grade(SOLVER, solverWork(SOLVER.equation, [['add', 4], ['subtract', 10], ['multiply', 2], ['divide', 6]])).isCorrect, true);
  // A rational answer: 9x = 20.
  const rational = { type: 'stepAlgebra2', equation: { a: 9, b: 0, c: 20 } };
  const result = grade(rational, solverWork(rational.equation, [['divide', 9]]));
  assert.equal(result.isCorrect, true);
  assert.equal(result.parts[1].response, '20/9');
  // A negative coefficient: −2x + 4 = 10.
  const negative = { type: 'stepAlgebra2', equation: { a: -2, b: 4, c: 10 } };
  assert.equal(grade(negative, solverWork(negative.equation, [['subtract', 4], ['divide', -2]])).isCorrect, true);
});

test('solver: unfinished and wrong work, and the isolated-but-wrong half credit', () => {
  const blank = grade(SOLVER, solverWork(SOLVER.equation, []));
  assert.equal(blank.isCorrect, false);
  assert.equal(blank.isComplete, false, 'nothing isolated yet: a deadline must not auto-submit it');
  assert.equal(blank.score, 0);

  const halfway = grade(SOLVER, solverWork(SOLVER.equation, [['subtract', 6]]));
  assert.equal(halfway.isComplete, false);
  assert.equal(halfway.isCorrect, false);
  assert.equal(halfway.score, 0);
  assert.deepEqual(failedIds(halfway), ['x-isolated', 'x-value']);

  const wrongWay = grade(SOLVER, solverWork(SOLVER.equation, [['add', 6], ['divide', 3]]));
  assert.equal(wrongWay.isCorrect, false);
  assert.equal(wrongWay.score, 0);

  // Moves the solver allows can still lose the value to floating point: 1e17
  // swallows the constant. x is isolated, the value is wrong — half credit,
  // exactly as the screen's inline Check gave it.
  const swallowed = grade(SOLVER, solverWork(SOLVER.equation, [['add', 1e17], ['subtract', 1e17], ['divide', 3]]));
  assert.equal(swallowed.isComplete, true);
  assert.equal(swallowed.isCorrect, false);
  assert.equal(swallowed.score, 0.5);
  assert.deepEqual(failedIds(swallowed), ['x-value']);
});

test('solver: an unauthored question grades against the screen default 3x + 6 = 21', () => {
  assert.deepEqual(LEGACY_SOLVER_DEFAULT_EQUATION, { a: 3, b: 6, c: 21 });
  const unauthored = { type: 'stepAlgebra2' };
  const result = grade(unauthored, solverWork(LEGACY_SOLVER_DEFAULT_EQUATION, [['subtract', 6], ['divide', 3]]));
  assert.equal(result.mode, 'default');
  assert.equal(result.isCorrect, true);
  // An unknown mode renders the solver too, and is graded as it.
  assert.equal(grade({ type: 'stepAlgebra2', mode: 'solve' }, solverWork(LEGACY_SOLVER_DEFAULT_EQUATION, [['subtract', 6], ['divide', 3]])).isCorrect, true);
  // a = 0 has no solution: x can never be isolated, so nothing is credited.
  const degenerate = { type: 'stepAlgebra2', equation: { a: 0, b: 2, c: 5 } };
  assert.equal(grade(degenerate, solverWork(degenerate.equation, [['subtract', 2]])).score, 0);
});

test('solver discrimination: the same moves against a different equation are not credited', () => {
  const work = solverWork(SOLVER.equation, [['subtract', 6], ['divide', 3]]);
  assert.equal(grade(SOLVER, work).isCorrect, true);
  // The moves are replayed on the question's equation, so they are judged
  // against THAT equation: a different constant term leaves x unisolated...
  const otherConstant = grade({ ...SOLVER, equation: { a: 3, b: 9, c: 21 } }, work);
  assert.equal(otherConstant.isCorrect, false);
  assert.equal(otherConstant.isComplete, false);
  assert.equal(otherConstant.score, 0);
  // ...and so does a different coefficient.
  const otherCoefficient = grade({ ...SOLVER, equation: { a: 2, b: 6, c: 21 } }, work);
  assert.equal(otherCoefficient.isCorrect, false);
  assert.equal(otherCoefficient.isComplete, false);
  // A different right side changes the value, not the moves: the replay
  // reaches x = 6, which is that equation's solution.
  const otherRightSide = grade({ ...SOLVER, equation: { a: 3, b: 6, c: 24 } }, work);
  assert.equal(otherRightSide.isCorrect, true);
  assert.equal(otherRightSide.parts[1].response, '6');
});

test('solver: a claimed equation or verdict is ignored — only the replayed moves count', () => {
  const tampered = {
    steps: [],
    stepCount: 0,
    state: { a: 1, b: 0, c: 5 },
    equation: { a: 1, b: 0, c: 5 },
    isCorrect: true,
    score: 1,
    expected: 5,
    solution: 5,
    answerKey: { x: 5 },
  };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'expected', 'isCorrect', 'score', 'solution']);
  const result = grade(SOLVER, tampered);
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0);
});

test('solver: moves the screen never allows, wrong types and non-object work are not graded', () => {
  const ungraded = (work, reason) => {
    const result = grade(SOLVER, work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
    if (reason) assert.equal(result.serverReason, reason);
  };
  ungraded({ steps: [{ operation: 'divide', operand: 0 }], stepCount: 1 }, 'malformed-response');
  ungraded({ steps: [{ operation: 'multiply', operand: 0 }], stepCount: 1 }, 'malformed-response');
  ungraded({ steps: [{ operation: 'power', operand: 2 }], stepCount: 1 }, 'malformed-response');
  ungraded({ steps: [{ operation: 'subtract', operand: '6' }], stepCount: 1 }, 'malformed-response');
  ungraded({ steps: [{ operation: 'subtract' }], stepCount: 1 }, 'malformed-response');
  ungraded({ steps: [{ operation: 'subtract', operand: Infinity }], stepCount: 1 }, 'malformed-response');
  ungraded({ steps: 'subtract 6, divide 3' }, 'malformed-response');
  ungraded({ steps: [{ operation: 'subtract', operand: 6 }], stepCount: 2 }, 'step-history-truncated');
  ungraded(null, 'empty-response');
  ungraded([{ operation: 'subtract', operand: 6 }], 'empty-response');
  ungraded('x = 5', 'empty-response');
  // A missing step list is a blank workspace, not a crash.
  const blank = grade(SOLVER, {});
  assert.equal(blank.graded, true);
  assert.equal(blank.isCorrect, false);
});

test('solver: realistic maximal work fits the response contract; a longer list is refused, not mis-replayed', () => {
  // 300 moves with long decimal operands, ending solved.
  const moves = [];
  for (let index = 0; index < 149; index += 1) moves.push(['add', 0.123456789012345], ['subtract', 0.123456789012345]);
  moves.push(['subtract', 6], ['divide', 3]);
  assert.equal(moves.length, 300);
  const work = solverWork(SOLVER.equation, moves);
  const json = canonicalToolWorkJson(work);
  assert.ok(json.length < TOOL_RESPONSE_LIMITS.maxJsonLength, `${json.length} chars`);
  assert.equal(boundToolWork(work).truncated, false);
  const result = grade(SOLVER, work);
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, true);

  // 301 moves: the contract keeps 300, and the grader refuses rather than
  // marking an equation the student never reached.
  const longer = solverWork(SOLVER.equation, [['add', 1], ...moves]);
  assert.equal(boundToolWork(longer).truncated, true);
  assert.equal(grade(SOLVER, longer).serverReason, 'step-history-truncated');

  // Oversize work is refused whole.
  const oversize = { steps: Array.from({ length: 40 }, () => ({ operation: 'add'.padEnd(900, ' '), operand: 1 })), stepCount: 40 };
  assert.equal(grade(SOLVER, oversize).serverReason, 'oversize-response');
});

/* ------------------------------------------------------------------ */
/* rewriteLinearForm                                                   */
/* ------------------------------------------------------------------ */

const FACTORED = {
  type: 'stepAlgebra2',
  toolId: 'stepAlgebra2',
  mode: 'rewriteLinearForm',
  targetForm: 'factoredLinear',
  equation: 'y = 5x - 20',
};
const FACTORED_OBJECTIVE = { kind: 'factoredLinear', variable: 'y', targetForm: 'factoredLinear', requireSimplifiedFinalForm: false };

const factoredSolution = () => {
  const start = factoredStart('y = 5x - 20');
  const finished = factorAll(start, [5], { quotients: ['x', '-4'] });
  return { start, finished, work: rewriteLinearFormWork(rewriteState(finished, FACTORED_OBJECTIVE), [coreStep(start, finished, 'Factored 5 from the right side')]) };
};

test('rewrite: factoring y = 5x − 20 with the workspace’s own Factor tool is correct', () => {
  const { finished, work } = factoredSolution();
  assert.equal(finished.right, '5 * (x - 4)');
  const result = grade(FACTORED, work);
  assert.equal(result.mode, 'rewriteLinearForm');
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.parts.map((part) => part.id), ['same-line', 'y-isolated', 'no-y-on-right', 'target-form']);
  assert.deepEqual(boundToolWork(work).dropped, []);
  assert.deepEqual(Object.keys(work).sort(), ['equation', 'steps']);
  // The question's equation is never part of the work.
  assert.ok(!canonicalToolWorkJson(work).includes('5x - 20'));
});

test('rewrite: every factored way of writing the same line is accepted', () => {
  const negative = factorAll(factoredStart('y = -3x - 12'), [3], { negate: true, quotients: ['x', '4'] });
  const negativeQuestion = { ...FACTORED, equation: 'y = -3x - 12' };
  assert.equal(grade(negativeQuestion, rewriteLinearFormWork(negative, [])).isCorrect, true);
  for (const right of ['5 * (x - 4)', '5(x-4)', '5 (x - 4)', '5(x - 4)']) {
    assert.equal(grade(FACTORED, rewriteLinearFormWork({ left: 'y', right }, [])).isCorrect, true, right);
  }
});

test('rewrite: unfinished forms keep the screen’s partial credit', () => {
  // Untouched: the question is already y = ..., but not factored.
  const untouched = grade(FACTORED, rewriteLinearFormWork({ left: 'y', right: '5x - 20' }, []));
  assert.equal(untouched.isComplete, false, 'not in the target form: a deadline must not auto-submit it');
  assert.equal(untouched.isCorrect, false);
  assert.equal(untouched.score, 0.75);
  assert.deepEqual(failedIds(untouched), ['target-form']);

  // A common factor pulled out, but not the one that leaves x − c.
  const partial = factorAll(factoredStart('y = 12x + 8'), [2], { quotients: ['6x', '4'] });
  assert.equal(grade({ ...FACTORED, equation: 'y = 12x + 8' }, rewriteLinearFormWork(partial, [coreStep(factoredStart('y = 12x + 8'), partial)])).score, 0.75);

  // 2y = 10x − 40: divide both sides by 2 (equivalent, not yet factored).
  const start = factoredStart('2y = 10x - 40');
  const divided = balancedMove(start, 'divide', '2');
  const twoY = { ...FACTORED, equation: '2y = 10x - 40' };
  assert.equal(grade(twoY, rewriteLinearFormWork(divided, [coreStep(start, divided)])).score, 0.75);

  // y still on the right.
  const subtracted = balancedMove(start, 'subtract', 'y');
  const bothSides = grade(twoY, rewriteLinearFormWork(subtracted, [coreStep(start, subtracted)]));
  assert.equal(bothSides.score, 0.4);
  assert.deepEqual(failedIds(bothSides), ['no-y-on-right', 'target-form']);

  // Not isolated yet: credit only for a real committed step.
  const added = balancedMove(start, 'add', '40');
  const notIsolated = grade(twoY, rewriteLinearFormWork(added, [coreStep(start, added)]));
  assert.equal(notIsolated.score, 0.15);
  assert.deepEqual(failedIds(notIsolated), ['y-isolated', 'no-y-on-right', 'target-form']);
  assert.equal(grade(twoY, rewriteLinearFormWork(start, [])).score, 0);
});

test('rewrite: the slope-intercept objective (an unrecognised target) is graded as the screen grades it', () => {
  const question = { type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'FactoredLinear', equation: '5x + 2y = 6' };
  for (const right of ['-(5/2) x + 3', '3 - (5/2) x', '-2.5x + 3']) {
    const result = grade(question, rewriteLinearFormWork({ left: 'y', right }, [{ after: { left: 'y', right } }]));
    assert.equal(result.isCorrect, true, right);
    assert.equal(result.parts.at(-1).label, 'Written as y = mx + b');
  }
  const single = grade(question, rewriteLinearFormWork({ left: 'y', right: '(6 - 5x) / 2' }, []));
  assert.equal(single.isCorrect, false);
  assert.equal(single.score, 0.75, 'equivalent but still one fraction');
  // An unauthored target is slope-intercept too (such a question is moved to
  // the mature engine by the runtime repair, but the grader still agrees with
  // the screen that would render it).
  const unauthored = { ...question };
  delete unauthored.targetForm;
  assert.equal(resolveRewriteTargetForm(unauthored), 'slopeIntercept');
  assert.equal(grade(unauthored, rewriteLinearFormWork({ left: 'y', right: '-(5/2) x + 3' }, [])).isCorrect, true);
});

test('rewrite discrimination: a finished form of a different line is not credited', () => {
  const { work } = factoredSolution();
  const altered = grade({ ...FACTORED, equation: 'y = 5x - 15' }, work);
  assert.equal(altered.isCorrect, false);
  assert.equal(altered.isComplete, true, 'the form is finished — it is the wrong line');
  assert.equal(altered.score, 0);
  assert.deepEqual(failedIds(altered), ['same-line']);

  // Typed straight into the response, a wrong factorisation earns nothing.
  const wrong = grade(FACTORED, rewriteLinearFormWork({ left: 'y', right: '5(x - 3)' }, []));
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.score, 0);
});

test('rewrite: claimed steps, verdicts and identities are not credit', () => {
  const twoY = { ...FACTORED, equation: '2y = 10x - 40' };
  const start = factoredStart('2y = 10x - 40');
  // A "step" that is not the question's line does not earn the step credit.
  const fakeStep = grade(twoY, rewriteLinearFormWork(start, [{ after: { left: 'y', right: '7' } }]));
  assert.equal(fakeStep.score, 0);
  // 0 = 0 is satisfied everywhere: not the original line.
  assert.equal(grade(twoY, rewriteLinearFormWork({ left: '0', right: '0' }, [coreStep(start, { left: '0', right: '0' })])).score, 0);
  // y = y.
  assert.equal(grade(twoY, rewriteLinearFormWork({ left: 'y', right: 'y' }, [coreStep(start, { left: 'y', right: 'y' })])).score, 0);

  const tampered = { equation: { left: 'y', right: '5x - 20' }, steps: [], isCorrect: true, score: 1, checks: [true], expected: '5(x-4)', solution: '5(x-4)' };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['checks', 'expected', 'isCorrect', 'score', 'solution']);
  const result = grade(FACTORED, tampered);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 0.75);
});

test('rewrite: missing or mistyped equations are graded as blank; an unreadable question is not graded', () => {
  for (const work of [{}, { equation: null }, { equation: { left: 5, right: 'x' } }, { equation: { left: 'y', right: '' } }, { equation: 'y = 5(x-4)' }, { equation: { left: 'y' }, steps: 'many' }]) {
    const result = grade(FACTORED, work);
    assert.equal(result.graded, true, JSON.stringify(work));
    assert.equal(result.isComplete, false);
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
  const noEquation = grade({ type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear' }, factoredSolution().work);
  assert.equal(noEquation.graded, false);
  assert.equal(noEquation.serverReason, 'malformed-response');
  for (const work of [null, ['y', '5(x-4)'], 'y = 5(x-4)']) {
    assert.equal(grade(FACTORED, work).serverReason, 'empty-response');
  }
});

test('rewrite: realistic maximal work fits the response contract', () => {
  const start = factoredStart('2y = 10x - 40');
  // The embedded workspace keeps at most 80 committed steps; the work keeps the latest 80.
  const added = balancedMove(start, 'add', '40');
  const undone = balancedMove(added, 'subtract', '40');
  const history = [];
  for (let index = 0; index < 90; index += 1) {
    history.push(index % 2
      ? coreStep(added, undone, 'Subtract 40 from both sides')
      : coreStep(index ? undone : start, added, 'Add 40 to both sides'));
  }
  const work = rewriteLinearFormWork(undone, history);
  assert.equal(work.steps.length, 80);
  const json = canonicalToolWorkJson(work);
  assert.ok(json.length < TOOL_RESPONSE_LIMITS.maxJsonLength, `${json.length} chars`);
  assert.equal(boundToolWork(work).truncated, false);
  assert.deepEqual(boundToolWork(work).dropped, []);
  assert.equal(grade({ ...FACTORED, equation: '2y = 10x - 40' }, work).graded, true);
});

test('rewrite: a long log of long equations is never refused as oversize — the newest steps are kept', () => {
  // A long session of long equations (each step adds and removes terms the
  // student chose) outgrows the response contract's 24,000 characters, and
  // an oversize response is refused whole, finished equation included.
  const question = { ...FACTORED, equation: '2y = 10x - 40' };
  const padding = '(y - y) + '.repeat(20);
  const history = [];
  let equation = { left: '2y', right: '10x - 40' };
  for (let index = 1; index <= 79; index += 1) {
    const next = { left: `(2y) + ${padding}${index} - ${index}`, right: `(10x - 40) + ${padding}${index} - ${index}` };
    history.push(coreStep(equation, next, `Added and removed ${index}`));
    equation = next;
  }
  // The student then rewrites both sides back (the workspace's "Rewrite" box).
  const rewritten = { left: '2y', right: '10x - 40' };
  history.push(coreStep(equation, rewritten, 'Rewrote both sides'));
  assert.ok(JSON.stringify(history.map((step) => step.after)).length > TOOL_RESPONSE_LIMITS.maxJsonLength, 'the full log alone is over the cap');
  // A step whose side the contract would cut short is left out, not cut.
  const overlong = { left: `(2y) + ${'(y - y) + '.repeat(120)}0`, right: '10x - 40' };
  assert.ok(overlong.left.length > TOOL_RESPONSE_LIMITS.maxStringLength);
  const log = [...history.slice(0, -1), coreStep(equation, overlong), history.at(-1)];
  const work = rewriteLinearFormWork(rewritten, log);
  assert.ok(work.steps.length > 1 && work.steps.length < 80, `${work.steps.length} steps kept`);
  const kept = history.slice(-work.steps.length).map((step) => step.after);
  assert.deepEqual(work.steps, kept, 'the newest steps that fit, in order, with only the overlong one left out');
  assert.ok(canonicalToolWorkJson(work).length <= TOOL_RESPONSE_LIMITS.maxJsonLength);
  assert.equal(boundToolWork(work).truncated, false);
  const result = grade(question, work);
  assert.equal(result.graded, true);
  assert.equal(result.score, 0.15, 'not isolated, with real steps: the screen’s step credit');
  assert.equal(result.parts[0].isCorrect, true, 'still the original line');
});

test('rewrite: a step that barely changes off the line is still the original line, not an identity', () => {
  // y = 12x + 8, then ÷(−y), ÷(5x), ÷40 and + 2y on both sides — every move the
  // workspace's own engine makes. Off the line the equation now changes by
  // under 1e-7 of its sides' size (the + 2y dominates), yet it is the same line.
  const question = { ...FACTORED, equation: 'y = 12x + 8' };
  const start = factoredStart('y = 12x + 8');
  const moves = [['divide', '-y'], ['divide', '5x'], ['divide', '40'], ['add', '2y']];
  const history = [];
  let equation = start;
  for (const [operation, operand] of moves) {
    const next = balancedMove(equation, operation, operand);
    history.push(coreStep(equation, next));
    equation = next;
  }
  const result = grade(question, rewriteLinearFormWork(equation, history));
  assert.equal(result.parts[0].id, 'same-line');
  assert.equal(result.parts[0].isCorrect, true);
  assert.equal(result.score, 0.15, 'the screen gave the step credit for this work');
  // Thirty multiplications by x shrink the change off the line at x = −0.577
  // below 1e-7 of the sides, too; it is still the line, and 0 = 0 still is not.
  const power = 'x^30';
  const shrunk = { left: `${power} * (2y) + 2y`, right: `${power} * (10x - 40) + 2y` };
  const twoY = { ...FACTORED, equation: '2y = 10x - 40' };
  assert.equal(grade(twoY, rewriteLinearFormWork(shrunk, [coreStep(factoredStart('2y = 10x - 40'), shrunk)])).score, 0.15);
  assert.equal(grade(twoY, rewriteLinearFormWork({ left: `0 * ${power} * (2y)`, right: `0 * ${power} * (10x - 40)` }, [])).score, 0);
});
