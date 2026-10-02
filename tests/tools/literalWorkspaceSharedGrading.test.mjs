import test from 'node:test';
import assert from 'node:assert/strict';

import { applyBalancedOperation, equationToLatex, parseEquationInput } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { parseRelationSource } from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { buildLiteralWorkspaceQuestion } from '../../functions/shared/toolMath/algebra-literal/literalWorkspace.mjs';
import { gradeOrdinaryResponse, normalizeOrdinaryResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { GRADING_MANIFEST, resolveGradingSurfaceId } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import literalWorkspaceDeclaration, { resolveLiteralWorkspaceMode } from '../../functions/shared/serverGrading/declarations/types/literalWorkspace.mjs';
import literalWorkspaceQuestionGrader from '../../functions/shared/serverGrading/questionGraders/literalWorkspace.mjs';
import {
  gradeServerResponse,
  serverResponseGradingSupport,
} from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  equationWorkspaceWork,
  literalWorkspaceWorkGrader,
  relationWorkspaceWork,
  stepAlgebraWorkGrader,
  workGraderForQuestion,
} from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import {
  TOOL_RESPONSE_LIMITS,
  boundToolWork,
  buildToolResponse,
  canonicalToolWorkJson,
} from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { ALGEBRA_WORKSPACE_ROUTES, resolveAlgebraWorkspaceRoute } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';

/*
 * SERVER-AUTHORITATIVE GRADING FOR A LITERAL QUESTION SOLVED ON THE BALANCE.
 *
 * A `literal` question that opts into the workspace (`workspace: true`,
 * `solveOnBalance: true` or `presentation: 'workspace'`) is solved in Step
 * Algebra on the question buildLiteralWorkspaceQuestion builds, and is graded
 * on its own surface, `literalWorkspace`.
 *
 * THE BUG THIS FILE PINS: before the surface existed the server regraded such
 * a question as a TYPED literal answer — the final equation `\frac{A}{b} = h|{}`
 * against acceptedAnswers ['A/b'] — and marked every correct workspace solve
 * WRONG, overwriting the browser's verdict (and a deadline auto-submitted the
 * same wrong verdict). Now the server builds the same workspace question and
 * runs the same shared grader the workspace ran: the letter isolated, and the
 * isolated side equivalent to the original formula.
 */

// --- Fixtures ------------------------------------------------------------------

const AREA = {
  type: 'literal',
  prompt: 'Solve A = bh for h.',
  equationLatex: 'A = bh',
  solveFor: 'h',
  workspace: true,
  // The key the old (wrong) typed-answer regrade compared the equation with.
  acceptedAnswers: ['A/b', '\\frac{A}{b}'],
};
const PERIMETER = { type: 'literal', prompt: 'Solve for w.', equation: 'P = 2l + 2w', solveFor: 'w', solveOnBalance: true };
const VOLUME = { type: 'literal', prompt: 'Solve for w.', formula: 'V = lwh', variable: 'w', presentation: 'workspace' };
const LINE = { type: 'literal', prompt: 'Solve for x.', formulaLatex: 'y = mx + b', objective: { variable: 'x' }, workspace: true };
const CIRCLE = { type: 'literal', prompt: 'Solve for r.', equation: 'A = pi r^2', solveFor: 'r', workspace: true };
const WITH_PROMPT = {
  ...AREA,
  algebraPrompts: [{ id: 'check', prompt: 'Write b times your answer.', acceptedExpressions: ['A'] }],
};
// Asked for the balance, but the workspace cannot be built (no letter to
// solve for): QuestionEngine shows the typed LiteralGrader with a notice.
const UNBUILDABLE = { type: 'literal', prompt: 'Rearrange.', equation: 'A = bh', workspace: true, acceptedAnswers: ['A/b'] };

const built = (question) => buildLiteralWorkspaceQuestion(question).question;

/** Solve on the balance with the workspace's own engine, move by move. */
const solveOnBalance = (question, moves) => {
  let state = parseEquationInput(built(question));
  for (const [operation, operand] of moves) state = applyBalancedOperation({ equationState: state, operation, operand }).simplified;
  return state;
};
const equationWork = (left, right, promptAnswers = {}) => equationWorkspaceWork({ equation: { left, right }, promptAnswers });

/*
 * The browser path (the workspace, opened on the BUILT question, grading its
 * own work through gradeToolCheck) and the server path (the STORED literal
 * question and the serialized response) must agree exactly.
 */
const parity = (stored, work, label = '') => {
  const workspaceQuestion = built(stored);
  assert.ok(workspaceQuestion, `${label}: the workspace can be built`);
  const grader = workGraderForQuestion(workspaceQuestion);
  assert.equal(grader, literalWorkspaceWorkGrader, `${label}: the workspace reports as literalWorkspace`);
  const browser = gradeToolCheck(grader, workspaceQuestion, work);
  assert.equal(browser.toolResponse.toolId, 'literalWorkspace', label);
  const server = gradeServerResponse({ question: stored, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.surfaceId, 'literalWorkspace', label);
  assert.equal(server.graded, browser.graded, `${label}: graded (${server.reason})`);
  assert.equal(server.isCorrect, browser.isCorrect, `${label}: isCorrect`);
  assert.equal(server.isComplete, browser.isComplete, `${label}: isComplete`);
  assert.equal(server.score, browser.score, `${label}: score`);
  assert.deepEqual(server.parts, browser.parts, `${label}: parts`);
  assert.deepEqual(attemptInputsFromGrading(server), attemptInputsFromGrading(browser), `${label}: attempt inputs`);
  return browser;
};

// The response the pre-contract client sent for a workspace literal: the
// workspace's response key, normalized against the stored type (`literal`).
const legacyResponse = (question, responseKey) => normalizeOrdinaryResponse({ question, answerState: { responseKey, parts: [] } });

// ===========================================================================
// The surface, and the mode QuestionEngine opens
// ===========================================================================

test('a literal question that opts into the balance is the literalWorkspace surface, graded by the shared server grader', () => {
  for (const question of [AREA, PERIMETER, VOLUME, LINE, CIRCLE]) {
    assert.equal(resolveGradingSurfaceId(question), 'literalWorkspace', question.prompt);
    const support = serverResponseGradingSupport(question);
    assert.equal(support.supported, true, `${question.prompt}: ${support.reason}`);
    assert.equal(support.authority, 'shared-server-authoritative');
    assert.equal(support.mode, 'workspace');
  }
  assert.equal(GRADING_MANIFEST.literalWorkspace, literalWorkspaceDeclaration);
  assert.equal(literalWorkspaceDeclaration.kind, 'question');
  // A literal question that did not opt in keeps its typed-answer surface.
  const { workspace, ...typed } = AREA;
  assert.equal(workspace, true);
  assert.equal(resolveGradingSurfaceId(typed), 'literal');
  assert.equal(resolveGradingSurfaceId({ ...AREA, workspace: false }), 'literal');
});

test('the declared mode is the view QuestionEngine opens', () => {
  // QuestionEngine: the workspace when buildLiteralWorkspaceQuestion builds a
  // question, else the typed LiteralGrader (QuestionEngine.jsx `case 'literal'`).
  const engineMode = (question) => (built(question) ? 'workspace' : 'answerBox');
  const questions = [
    AREA, PERIMETER, VOLUME, LINE, CIRCLE, WITH_PROMPT, UNBUILDABLE,
    { type: 'literal', workspace: true, solveFor: 'h', acceptedAnswers: ['A/b'] },
    { type: 'literal', workspace: true, equation: 'A = bh', variable: 'b' },
    { type: 'literal', presentation: 'WORKSPACE', equationAscii: 'd = rt', solveFor: 't' },
  ];
  for (const question of questions) {
    assert.equal(resolveLiteralWorkspaceMode(question), engineMode(question), JSON.stringify(question));
  }
  // The workspace on a formula with a square is the relation workspace, as the
  // renderer routes it.
  assert.equal(resolveAlgebraWorkspaceRoute(built(CIRCLE)).route, ALGEBRA_WORKSPACE_ROUTES.RELATION);
  assert.equal(resolveAlgebraWorkspaceRoute(built(AREA)).route, ALGEBRA_WORKSPACE_ROUTES.STEP_ALGEBRA);
  // The one place the light (parser-free) check cannot see: a letter the
  // formula does not contain. The declaration names the workspace, QuestionEngine
  // shows the answer box — and the grader follows QuestionEngine: the typed
  // answer is marked as the typed answer it is.
  const missingLetter = { type: 'literal', workspace: true, equation: 'A = bh', solveFor: 'q', acceptedAnswers: ['A/b'] };
  assert.equal(resolveLiteralWorkspaceMode(missingLetter), 'workspace');
  assert.equal(engineMode(missingLetter), 'answerBox');
  const typedAnswer = gradeServerResponse({ question: missingLetter, response: legacyResponse(missingLetter, 'A/b') });
  assert.equal(typedAnswer.graded, true);
  assert.equal(typedAnswer.isCorrect, true);
});

// ===========================================================================
// THE REGRESSION: a correct workspace solve is CORRECT on the server
// ===========================================================================

test('REGRESSION: a correct solve on the balance is marked correct by the server (it used to be marked wrong)', () => {
  const final = solveOnBalance(AREA, [['divide', 'b']]);
  assert.deepEqual([final.left, final.right], ['A / b', 'h']);
  const work = equationWorkspaceWork({ equation: final });
  assert.deepEqual(boundToolWork(work).dropped, []);
  const result = parity(AREA, work, 'A = bh');
  assert.equal(result.isComplete, true);
  assert.equal(result.isCorrect, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.parts.map((part) => [part.id, part.label]), [['algebra-objective', 'Isolate h']]);

  // The response an older client queued (the workspace key, sent as a typed
  // literal scalar) is marked by the same shared grader — correct.
  const legacy = legacyResponse(AREA, '\\frac{A}{b} = h|{}');
  assert.equal(legacy.kind, 'scalar');
  const server = gradeServerResponse({ question: AREA, response: legacy });
  assert.equal(server.surfaceId, 'literalWorkspace');
  assert.equal(server.graded, true);
  assert.equal(server.isCorrect, true);
  // ...which is exactly what the typed-answer grader got wrong.
  assert.equal(gradeOrdinaryResponse({ question: AREA, response: legacy }).isCorrect, false);
});

// ===========================================================================
// Correct, incorrect, partial
// ===========================================================================

test('equivalent finished forms are correct; a wrong isolation is a complete, incorrect attempt', () => {
  const correct = [
    [AREA, 'h', 'A / b'],
    [AREA, 'A / b', 'h'],
    [AREA, 'h', '(2 A) / (2 b)'],
    [AREA, 'h', 'A * b ^ (-1)'],
    [PERIMETER, 'w', '(P - 2 l) / 2'],
    [PERIMETER, 'w', 'P / 2 - l'],
    [VOLUME, 'w', 'V / (l * h)'],
    [VOLUME, 'V / h / l', 'w'],
    [LINE, 'x', '(y - b) / m'],
  ];
  correct.forEach(([question, left, right]) => {
    const result = parity(question, equationWork(left, right), `${left} = ${right}`);
    assert.equal(result.isCorrect, true, `${question.prompt} ${left} = ${right}`);
  });
  // Solved with the workspace's own engine.
  assert.equal(parity(VOLUME, equationWorkspaceWork({ equation: solveOnBalance(VOLUME, [['divide', 'l h']]) }), 'V = lwh solved').isCorrect, true);
  assert.equal(parity(LINE, equationWorkspaceWork({ equation: solveOnBalance(LINE, [['subtract', 'b'], ['divide', 'm']]) }), 'y = mx + b solved').isCorrect, true);

  const wrong = [
    [AREA, 'h', 'A * b'],
    [AREA, 'h', 'b / A'],
    [PERIMETER, 'w', 'P - 2 l'],
    [PERIMETER, 'w', 'P / 2 - 2 l'],
    [VOLUME, 'w', 'V * l * h'],
    [LINE, 'x', '(y + b) / m'],
  ];
  wrong.forEach(([question, left, right]) => {
    const result = parity(question, equationWork(left, right), `${left} = ${right}`);
    assert.equal(result.isComplete, true, 'isolated, so a real attempt');
    assert.equal(result.isCorrect, false, `${question.prompt} ${left} = ${right}`);
    assert.equal(result.score, 0);
  });
});

test('unfinished work is incomplete (a deadline never auto-submits it); prompts earn partial credit', () => {
  const start = parseEquationInput(built(AREA));
  for (const state of [start, { left: 'A', right: 'b * h + 0' }, solveOnBalance(PERIMETER, [['subtract', '2l']])]) {
    const question = state === start || state.left === 'A' ? AREA : PERIMETER;
    const result = parity(question, equationWork(state.left, state.right), `${state.left} = ${state.right}`);
    assert.equal(result.graded, true);
    assert.equal(result.isComplete, false);
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
  // A literal question may carry algebra prompts, exactly like Step Algebra.
  const all = parity(WITH_PROMPT, equationWork('h', 'A / b', { check: 'A' }), 'prompt right');
  assert.equal(all.isCorrect, true);
  const promptWrong = parity(WITH_PROMPT, equationWork('h', 'A / b', { check: 'A b' }), 'prompt wrong');
  assert.equal(promptWrong.isComplete, true);
  assert.equal(promptWrong.isCorrect, false);
  assert.equal(promptWrong.score, 0.5);
  assert.equal(attemptInputsFromGrading(promptWrong).partialCreditPercent, 50);
  const promptBlank = parity(WITH_PROMPT, equationWork('h', 'A / b'), 'prompt blank');
  assert.equal(promptBlank.isComplete, false);
});

test('an old workspace key that cannot be read back exactly keeps the legacy path — never re-marked wrong', () => {
  // F = 9/5 C + 32 solved for C, kept as written: the display LaTeX writes
  // (9/5) C as \frac{C9}{5}, which reads back as the name `C9`.
  const FAHRENHEIT = { type: 'literal', prompt: 'Solve for C.', equationLatex: 'F = \\frac{9}{5}C + 32', solveFor: 'C', workspace: true };
  let state = parseEquationInput(built(FAHRENHEIT));
  let written = state;
  for (const [operation, operand] of [['subtract', '32'], ['multiply', '5/9']]) {
    const move = applyBalancedOperation({ equationState: state, operation, operand });
    written = move.unsimplified;
    state = move.simplified;
  }
  assert.equal(parity(FAHRENHEIT, equationWorkspaceWork({ equation: written }), 'as written').isCorrect, true);
  const key = `${equationToLatex(written)}|{}`;
  assert.match(key, /C9/);
  const response = legacyResponse(FAHRENHEIT, key);
  assert.equal(literalWorkspaceQuestionGrader.accepts(response), false);
  assert.equal(gradeServerResponse({ question: FAHRENHEIT, response }).reason, 'response-shape-not-accepted');
  // The simplified state's key reads back exactly, and is marked.
  const simplifiedKey = legacyResponse(FAHRENHEIT, `${equationToLatex(state)}|{}`);
  assert.equal(literalWorkspaceQuestionGrader.accepts(simplifiedKey), true);
  assert.equal(gradeServerResponse({ question: FAHRENHEIT, response: simplifiedKey }).isCorrect, true);
});

test('a literal question carrying mode "linearIntercepts" is still graded as the equation engine it opens', () => {
  // QuestionEngine's `literal` case always mounts StepByStepAlgebra on the
  // built question (relation or equation engine), never the intercept
  // orchestrator — even though the built question is `type: 'stepAlgebra'`
  // and keeps the literal question's `mode`.
  const MODED = { ...AREA, mode: 'linearIntercepts' };
  assert.equal(built(MODED).type, 'stepAlgebra');
  assert.equal(built(MODED).mode, 'linearIntercepts');
  const right = parity(MODED, equationWork('h', 'A / b'), 'moded');
  assert.equal(right.isComplete, true);
  assert.equal(right.isCorrect, true);
  assert.equal(literalWorkspaceWorkGrader.grade(MODED, equationWork('h', 'A / b')).mode, 'equation');
  assert.equal(parity(MODED, equationWork('h', 'A * b'), 'moded wrong').isCorrect, false);
  // The pre-contract key too.
  const legacy = gradeServerResponse({ question: MODED, response: legacyResponse(MODED, '\\frac{A}{b} = h|{}') });
  assert.equal(legacy.graded, true);
  assert.equal(legacy.isCorrect, true);
});

test('a formula with a square is solved on the relation workspace and graded there', () => {
  const work = (source) => relationWorkspaceWork({ relationState: parseRelationSource(source, 'r') });
  assert.equal(parity(CIRCLE, work('r = sqrt(A / pi)'), 'principal root').isCorrect, true);
  assert.equal(parity(CIRCLE, work('r = sqrt(A / pi) OR r = -sqrt(A / pi)'), 'both roots').isCorrect, true);
  assert.equal(parity(CIRCLE, work('r = sqrt(A * pi)'), 'wrong root').isCorrect, false);
  const unfinished = parity(CIRCLE, work('A / pi = r^2'), 'unfinished');
  assert.equal(unfinished.isComplete, false);
});

// ===========================================================================
// Unauthored defaults, discrimination, tampering
// ===========================================================================

test('unauthored fields default exactly as the workspace builds them', () => {
  // The formula from any of its historical fields, the letter from solveFor,
  // variable or objective.variable; the objective is "isolate", unsimplified
  // forms allowed.
  for (const question of [VOLUME, LINE, { ...AREA, equationLatex: undefined, equationAscii: 'A = bh' }]) {
    const workspaceQuestion = built(question);
    assert.equal(workspaceQuestion.objective.kind, 'isolate');
    assert.equal(workspaceQuestion.objective.simplifyRequired, false);
    assert.equal(workspaceQuestion.gradingSurface, 'literalWorkspace');
  }
  assert.equal(parity({ ...AREA, equationLatex: undefined, equationAscii: 'A = bh' }, equationWork('h', 'A / b'), 'equationAscii').isCorrect, true);
  // An unsimplified isolated side is finished (simplifyRequired: false).
  assert.equal(parity(AREA, equationWork('h', '(A + 0) / b'), 'unsimplified').isCorrect, true);
});

test('discrimination: the same correct work against an altered formula is wrong', () => {
  const work = equationWork('h', 'A / b');
  assert.equal(parity(AREA, work, 'key').isCorrect, true);
  assert.equal(parity({ ...AREA, equationLatex: 'A = 2bh' }, work, 'altered formula').isCorrect, false);
  assert.equal(parity({ ...AREA, equationLatex: 'A = \\frac{1}{2}bh' }, work, 'triangle').isCorrect, false);
  assert.equal(parity({ ...AREA, equationLatex: 'A = \\frac{1}{2}bh' }, equationWork('h', '2 A / b'), 'triangle solved').isCorrect, true);
  // The letter is the question's: the same isolation for another letter is not finished.
  assert.equal(parity({ ...AREA, solveFor: 'b' }, work, 'other letter').isComplete, false);
});

test('tampered work: injected verdicts, a forged objective, wrong types, foreign responses, code', () => {
  const injected = { ...equationWork('h', 'A * b'), isCorrect: true, score: 1, expected: 'A/b', answerKey: ['A/b'] };
  assert.deepEqual(boundToolWork(injected).dropped.sort(), ['answerKey', 'expected', 'isCorrect', 'score']);
  assert.equal(parity(AREA, injected, 'injected').isCorrect, false);
  // A forged objective is never read: the question's objective (isolate h) decides.
  assert.equal(parity(AREA, { ...equationWork('A', 'b * h'), objective: { kind: 'isolate', variable: 'A' } }, 'forged objective').isComplete, false);
  for (const work of [{ equation: 'h = A/b' }, { equation: { left: 'h', right: 7 } }, { equation: null }, {}]) {
    const result = parity(AREA, work, JSON.stringify(work));
    assert.equal(result.graded, true);
    assert.equal(result.isComplete, false);
  }
  // Non-object work is not gradable, on either side.
  for (const work of ['h = A/b', 3, [{ left: 'h', right: 'A / b' }]]) {
    const browser = gradeToolCheck(literalWorkspaceWorkGrader, built(AREA), work);
    assert.equal(browser.graded, false);
    assert.equal(gradeServerResponse({ question: AREA, response: JSON.parse(JSON.stringify(browser.toolResponse)) }).graded, false);
  }
  // Student text is data: a function call or assignment is never evaluated.
  for (const right of ['createUnit("m")', 'evaluate("A/b")', 'h = A / b', '1:100000']) {
    assert.equal(parity(AREA, equationWork('h', right), right).isCorrect, false, right);
  }
  // Another surface's response is not this surface's work, and the reverse.
  const stepResponse = buildToolResponse({ question: built(AREA), toolId: 'stepAlgebra', work: equationWork('h', 'A / b') });
  assert.equal(literalWorkspaceQuestionGrader.accepts(stepResponse), false);
  assert.equal(gradeServerResponse({ question: AREA, response: stepResponse }).graded, false);
  const literalResponse = buildToolResponse({ question: built(AREA), toolId: 'literalWorkspace', work: equationWork('x', '5') });
  assert.equal(gradeServerResponse({ question: { type: 'stepAlgebra', equation: '3x + 6 = 21' }, response: literalResponse }).graded, false);
  assert.equal(literalWorkspaceQuestionGrader.accepts(literalResponse), true);
  assert.equal(literalWorkspaceQuestionGrader.accepts({ kind: 'scalar', type: 'literal', value: '   ' }), false);
  assert.equal(literalWorkspaceQuestionGrader.accepts(null), false);
  // A newer client's work waits for a server that can read it.
  assert.equal(gradeServerResponse({ question: AREA, response: { ...literalResponse, contractVersion: 2 } }).reason, 'response-contract-newer-than-server');
});

test('realistic maximal literal work stays inside the response limits and drops nothing', () => {
  const work = equationWork('w', '(P - 2 l) / 2', Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`prompt-${index}`, `\\frac{P-2l}{2}+${index}`])));
  assert.deepEqual(boundToolWork(work).dropped, []);
  assert.equal(boundToolWork(work).truncated, false);
  assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength);
  assert.equal(parity(PERIMETER, work, 'maximal').isCorrect, true);
});

// ===========================================================================
// When the workspace could not be built: the typed answer box
// ===========================================================================

test('a workspace literal that falls back to the answer box is graded as the typed answer it is', () => {
  assert.equal(resolveGradingSurfaceId(UNBUILDABLE), 'literalWorkspace');
  const support = serverResponseGradingSupport(UNBUILDABLE);
  assert.equal(support.supported, true);
  assert.equal(support.mode, 'answerBox');
  const typed = (value) => gradeServerResponse({ question: UNBUILDABLE, response: legacyResponse(UNBUILDABLE, value) });
  assert.equal(typed('A/b').isCorrect, true);
  assert.equal(typed('\\frac{A}{b}').isCorrect, true);
  assert.equal(typed('A*b').isCorrect, false);
  // The same verdict the typed-answer grader gives: one definition.
  assert.equal(typed('A/b').isCorrect, gradeOrdinaryResponse({ question: { ...UNBUILDABLE, workspace: false }, response: legacyResponse(UNBUILDABLE, 'A/b') }).isCorrect);
  // A tool response cannot answer a question whose workspace never opened.
  const forged = buildToolResponse({ question: UNBUILDABLE, toolId: 'literalWorkspace', work: equationWork('h', 'A / b') });
  assert.equal(gradeServerResponse({ question: UNBUILDABLE, response: forged }).graded, false);
  // With no key for the typed answer the device verdict is kept (documented blocker).
  const noKey = { ...UNBUILDABLE, acceptedAnswers: [] };
  const unsupported = serverResponseGradingSupport(noKey);
  assert.equal(unsupported.supported, false);
  assert.match(unsupported.blocker, /acceptedAnswers/);
  // A typed answer (no equals sign) on a question whose workspace DOES build —
  // a client that predates the workspace — is a typed answer, not an unreadable equation.
  assert.equal(gradeServerResponse({ question: AREA, response: legacyResponse(AREA, 'A/b') }).isCorrect, true);
});

test('a balance literal whose workspace cannot be built after all, with no key, keeps the device verdict instead of being held', async () => {
  const { buildIngestedAttempt, normalizeSubmissionEnvelope } = await import('../../functions/shared/submissionIngestion.mjs');
  const { buildSubmissionEnvelope } = await import('../../functions/shared/submissionEnvelope.mjs');
  // The parser-free mode check reads `I = Prt` / `P` as buildable, but the
  // workspace cannot be built (an unexpanded run of letters), so the student
  // saw the typed answer box — which has no key.
  const question = { questionId: 'lw-unbuilt', type: 'literal', prompt: 'Solve for P.', equation: 'I = Prt', solveFor: 'P', workspace: true, activityRole: 'classwork' };
  assert.equal(resolveLiteralWorkspaceMode(question), 'workspace');
  assert.equal(built(question), null);
  const response = legacyResponse(question, 'I/(rt)');
  const graded = gradeServerResponse({ question, response });
  assert.equal(graded.graded, false);
  assert.equal(graded.reason, 'mode-not-server-gradable:answerBox');

  const envelope = Object.assign(normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: 'act-lw-unbuilt',
    kind: 'ordinarySubmission',
    studentId: 'S1',
    assignmentId: 'A1',
    questionIndex: 0,
    questionId: question.questionId,
    activityRole: 'classwork',
    capturedAt: Date.parse('2026-09-14T15:00:00Z'),
    previousTotalAttempts: 0,
    record: { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100 },
    response,
  })), { studentId: 'S1' });
  const ingested = buildIngestedAttempt({ envelope, assignment: { id: 'A1' }, question, canonicalRecord: null, ingestedAt: Date.parse('2026-09-14T15:00:05Z') });
  // Before the workspace surface existed this was a sanitized client record;
  // it still is — never held for review as if the work were unreadable.
  assert.notEqual(ingested.blocked, true);
  assert.equal(ingested.gradedBy, 'client');
  assert.equal(ingested.record.serverGradingReason, 'mode-not-server-gradable:answerBox');
  assert.equal(ingested.record.status, 'correct');

  // With a key, the same fallback is graded on the server.
  const keyed = { ...question, acceptedAnswers: ['I/(rt)'] };
  assert.equal(gradeServerResponse({ question: keyed, response: legacyResponse(keyed, 'I/(rt)') }).isCorrect, true);
});

test('the workspace a literal question opens reports through the literal surface, never Step Algebra\'s', () => {
  const workspaceQuestion = built(AREA);
  assert.equal(workGraderForQuestion(workspaceQuestion), literalWorkspaceWorkGrader);
  assert.equal(workGraderForQuestion({ type: 'stepAlgebra', equation: 'A = b*h', solveFor: 'h' }), stepAlgebraWorkGrader);
  // The literal grader on the built question and on the stored question is one verdict.
  const work = equationWork('h', 'A / b');
  assert.deepEqual(literalWorkspaceWorkGrader.grade(workspaceQuestion, work), literalWorkspaceWorkGrader.grade(AREA, work));
});
