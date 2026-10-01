/*
 * STEP ALGEBRA STEP CREDIT: THE SERVER DERIVES WHAT THE WORKSPACE AWARDED.
 *
 * Every committed step used to reach the server as a finished verdict
 * ({ productive, accepted, earned, possible }). Now it carries its raw work,
 * and functions/shared/serverGrading/stepAlgebraStepVerification.mjs derives
 * the credit from that work alone, against the authoritative question and the
 * canonical record.
 *
 * These tests drive the REAL engines through realistic solves — the balance
 * moves, cancellations, typed simplifications, "keep as written", the
 * distribution / like-terms / structure models, the relation workspace's
 * transitions and the intercept checks — building each onStepGrade payload
 * exactly as the workspaces now build it, and require:
 *
 *   PARITY       the server, from the step's raw work only (through JSON),
 *                derives the same stepGrade, attempt use and saved state, and
 *                the record it builds with recordQuestionStep equals the
 *                record the browser built, field for field;
 *   SECURITY     a step that does not follow from a state the variant has
 *                been in, is not what its operation produces, belongs to
 *                another question, or is malformed earns nothing — and an
 *                attempt a rejected move spends is still spent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyBalancedOperation,
  equationToLatex,
  expressionsEquivalent,
  latexToExpression,
  parseEquationInput,
} from '../../functions/shared/algebra/algebraAstEngine.mjs';
import {
  evaluateMove,
  resolveEquationAfterKeepingMove,
  resolveEquationAfterMove,
  resolveEquationAfterStudentSimplification,
} from '../../src/algebraSupportLevels.js';
import { buildCancellationModel } from '../../src/algebraCancellationModel.js';
import {
  armFactor,
  commitDistribution,
  detectDistributableGroup,
  initDistributionState,
  placeOnTerm,
} from '../../src/algebraDistributionModel.js';
import { findLikeTermGroups, replaceSelectedLikeTerms } from '../../src/algebraLikeTermsModel.js';
import { armSplitDenominator, findSplittableFraction, openFractionSplit, placeSplitDenominator } from '../../src/algebraFractionSplitModel.js';
import { commitStructureTool } from '../../src/algebraStructureTools.js';
import {
  applyBalancedOperationToBranches,
  buildStudentAuthoredAbsoluteValueSplit,
  cloneRelationState,
  normalizeRelationExpressionInput,
  obviousSpecialClaim,
  parseRelationSource,
  relationStateToText,
  validateRelationTransition,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { resolveStandardCoefficients } from '../../functions/shared/toolMath/stepAlgebra2/linearInterceptsMath.mjs';
import { emptyQuestionRecord, recordQuestionStep } from '../../functions/shared/attemptPolicy.mjs';
import { STEP_WORK_LIMITS, normalizeStepWork } from '../../functions/shared/submissionEnvelope.mjs';
import { checkLinearIntercept, literalWorkspaceQuestion } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { IDENTITY, compareIdentically } from '../../functions/shared/serverGrading/stepAlgebraEquivalence.mjs';
import { parse } from '../../functions/shared/algebra/safeMath.mjs';
import {
  STEP_ACTIONS,
  STEP_BEYOND_SERVER_BUDGET,
  UNVERIFIED_STEP_KIND,
  equationMoveStepGrade,
  equationRewriteStepGrade,
  equationStatePatch,
  equationStepWork,
  interceptStepGrade,
  interceptStepWork,
  interceptSubEquationQuestion,
  prefilledFirstStep,
  rejectedMoveStatePatch,
  relationStatePatch,
  relationStepGrade,
  relationStepWork,
  stepActionCountsAttempt,
  stepCreditContext,
  verifyStepAlgebraStep,
} from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';

const AT = Date.parse('2026-09-14T15:20:00Z');
const MAX_ATTEMPTS = 3;

const LINEAR = { questionId: 'q-linear', type: 'stepAlgebra', prompt: 'Solve.', equation: '3x + 6 = 21', workspaceDifficulty: 3 };
const DISTRIBUTE = { questionId: 'q-dist', type: 'stepAlgebra', prompt: 'Solve.', equation: '3(2x - 4) + 5x = 24', workspaceDifficulty: 3 };
const LINE = { questionId: 'q-line', type: 'stepAlgebra', prompt: 'Write in slope-intercept form.', equation: '5x + 2y = 6', targetForm: 'slopeIntercept' };
const LITERAL = { questionId: 'q-literal', type: 'literal', prompt: 'Solve for w.', formula: 'A = l w', solveFor: 'w', workspace: true };
const RETIRED_ALGEBRA = { questionId: 'q-algebra', type: 'algebra', prompt: 'Solve.', equation: '4x + 7 = 23' };
const INEQUALITY = { questionId: 'q-ineq', type: 'stepAlgebra', prompt: 'Solve.', equation: '-2x + 3 > 7' };
const ABS_EQ = { questionId: 'q-abs', type: 'stepAlgebra', prompt: 'Solve.', equation: '|2x - 3| = 7' };
const NO_SOLUTION = { questionId: 'q-none', type: 'stepAlgebra', prompt: 'Solve.', equation: '|2x - 3| = -5' };
const INTERCEPTS = { questionId: 'q-int', type: 'stepAlgebra', mode: 'linearIntercepts', prompt: 'Find both intercepts.', equation: '3x + 4y = 24' };

// ---------------------------------------------------------------------------
// The two halves.
// ---------------------------------------------------------------------------

const newRecords = () => ({ browser: emptyQuestionRecord(), server: emptyQuestionRecord() });

/** App.handleStepGrade's local half: the workspace's stepGrade through the attempt policy. */
const applyBrowser = (records, payload) => {
  const outcome = recordQuestionStep({
    record: records.browser,
    stepGrade: payload.stepGrade,
    countsAttempt: payload.countsAttempt,
    statePatch: payload.statePatch,
    maximumAttempts: MAX_ATTEMPTS,
    occurredAt: AT,
  });
  records.browser = outcome.record;
  return outcome;
};

/** The server half: the step's raw work only — through JSON — on the canonical record. */
const verifyOnServer = (question, record, stepWork) => verifyStepAlgebraStep({
  question,
  record,
  stepWork: JSON.parse(JSON.stringify(normalizeStepWork(stepWork))),
});

const applyServer = (question, records, stepWork) => {
  const verdict = verifyOnServer(question, records.server, stepWork);
  assert.equal(verdict.eligible, true, `the server must take this step: ${verdict.reason}`);
  records.server = recordQuestionStep({
    record: records.server,
    stepGrade: verdict.stepGrade,
    countsAttempt: verdict.countsAttempt,
    statePatch: verdict.statePatch,
    maximumAttempts: MAX_ATTEMPTS,
    occurredAt: AT,
  }).record;
  return verdict;
};

/** One honest step: the server reaches the browser's step and record exactly. */
const step = (session, payload, label) => {
  const browser = applyBrowser(session.records, payload);
  const verdict = applyServer(session.question, session.records, payload.stepWork);
  assert.equal(verdict.verified, true, `${label}: the server refused an honest step (${verdict.reason})`);
  assert.deepEqual(verdict.stepGrade, payload.stepGrade, `${label}: stepGrade`);
  assert.equal(verdict.countsAttempt, payload.countsAttempt, `${label}: attempt use`);
  assert.deepEqual(verdict.statePatch, payload.statePatch || {}, `${label}: saved state`);
  assert.deepEqual(session.records.server, session.records.browser, `${label}: the server's record must equal the browser's, field for field`);
  return browser;
};

// ---------------------------------------------------------------------------
// The equation workspace, step for step as StepByStepAlgebraCore reports it.
// ---------------------------------------------------------------------------

const equationSession = (question, { supportLevel = 3, workspaceQuestion = question, zeroVariable = null, records = newRecords(), start = null } = {}) => ({
  question,
  workspaceQuestion,
  supportLevel,
  zeroVariable,
  records,
  equation: start || parseEquationInput(workspaceQuestion),
});

// An intercept sub-solve opens on a record with no algebra state, so its
// counter always restarts (LinearInterceptsOrchestrator solverQuestionRecord).
const stepNumberFor = (session) => (session.zeroVariable ? 1 : Number(session.records.browser.algebraState?.stepNumber || 0) + 1);

/** saveStep: a balanced, inefficient or rejected move. */
const movePayload = (session, { move, action, after = session.equation }) => {
  const stepGrade = equationMoveStepGrade({ action, move, supportLevel: session.supportLevel, before: session.equation, after, question: session.workspaceQuestion });
  return {
    stepGrade,
    countsAttempt: stepActionCountsAttempt(action),
    statePatch: stepGrade.accepted
      ? equationStatePatch({ equation: after, supportLevel: session.supportLevel, stepNumber: stepNumberFor(session) })
      : rejectedMoveStatePatch(move),
    stepWork: equationStepWork({
      action,
      before: session.equation,
      after: action === STEP_ACTIONS.BALANCED_MOVE ? after : null,
      move,
      supportLevel: session.supportLevel,
      zeroVariable: session.zeroVariable,
    }),
  };
};

/** rewriteStepPayload: Rewrite / Simplify, like terms, structure tools, distribution, cancellation. */
const rewritePayload = (session, after, { kind, label }) => ({
  stepGrade: equationRewriteStepGrade({ kind, label, supportLevel: session.supportLevel, before: session.equation, after, question: session.workspaceQuestion }),
  countsAttempt: stepActionCountsAttempt(STEP_ACTIONS.REWRITE),
  statePatch: equationStatePatch({ equation: after, supportLevel: session.supportLevel, stepNumber: stepNumberFor(session) }),
  stepWork: equationStepWork({
    action: STEP_ACTIONS.REWRITE,
    kind,
    label,
    before: session.equation,
    after,
    supportLevel: session.supportLevel,
    zeroVariable: session.zeroVariable,
  }),
});

/**
 * attemptMove + commitMove: the operand as typed, where the student wrote it,
 * the cancellations struck, then the engine's resolution, "keep as written"
 * or the student's typed simplification.
 */
const pendingMove = (session, { operation, operand, placementBySide = {} }) => {
  const move = { ...applyBalancedOperation({ equationState: session.equation, operation, operand, placementBySide }), placementBySide };
  assert.equal(move.preservesSolution, true);
  return move;
};

const balance = (session, { operation, operand, placementBySide = {}, resolution = 'normal', crossed = null, answers = {} }) => {
  const move = pendingMove(session, { operation, operand, placementBySide });
  if (evaluateMove(move, session.supportLevel).countsAttempt) {
    const spent = step(session, movePayload(session, { move, action: STEP_ACTIONS.INEFFICIENT_MOVE }), `inefficient ${operation} ${operand}`);
    if (spent.result.expired) return { move, expired: true };
  }
  const struck = crossed ?? move.requiredCancellationSides;
  const typed = Object.fromEntries(Object.entries(answers).map(([side, value]) => [side, latexToExpression(value)]));
  Object.entries(typed).forEach(([side, value]) => {
    const target = move.simplificationTargets.find((candidate) => candidate.side === side);
    assert.ok(target && expressionsEquivalent(value, target.simplifiedExpression, session.equation.variable), `the typed ${side} simplification is accepted by the workspace`);
  });
  const after = resolution === 'simplified'
    ? resolveEquationAfterStudentSimplification(move, typed, struck)
    : resolution === 'keep'
      ? resolveEquationAfterKeepingMove(move, struck)
      : resolveEquationAfterMove(move, session.supportLevel, struck);
  step(session, movePayload(session, { move, action: STEP_ACTIONS.BALANCED_MOVE, after }), `${operation} ${operand}`);
  session.equation = after;
  return { move, expired: false };
};

/** checkStudentRewrite: the student types an equivalent side. */
const rewriteSide = (session, side, typedValue) => {
  const value = latexToExpression(typedValue);
  assert.ok(expressionsEquivalent(value, session.equation[side], session.equation.variable), 'the workspace accepts only an equivalent rewrite');
  const after = { ...session.equation, [side]: value };
  step(session, rewritePayload(session, after, { kind: 'student-rewrite', label: `Rewrite / simplify ${side}` }), `rewrite ${side} as ${typedValue}`);
  session.equation = after;
};

const records = (session) => session.records;

// ===========================================================================
// One definition of what a step earns
// ===========================================================================

test('the credit table: efficient 2/2, valid 1/2, inefficient attempt 1/2, rejected 0/1, rewrites and relation steps 1/1', () => {
  const equation = parseEquationInput(LINEAR);
  const efficient = applyBalancedOperation({ equationState: equation, operation: 'subtract', operand: '6' });
  const longWay = applyBalancedOperation({ equationState: equation, operation: 'add', operand: '2' });
  const after = resolveEquationAfterMove(efficient, 3, efficient.requiredCancellationSides);
  const grade = (action, move, to = after) => equationMoveStepGrade({ action, move, supportLevel: 3, before: equation, after: to, question: LINEAR });
  assert.deepEqual(
    [grade(STEP_ACTIONS.BALANCED_MOVE, efficient), grade(STEP_ACTIONS.BALANCED_MOVE, longWay), grade(STEP_ACTIONS.INEFFICIENT_MOVE, longWay, equation), grade(STEP_ACTIONS.REJECTED_MOVE, efficient)]
      .map(({ accepted, earned, possible, productive }) => ({ accepted, earned, possible, productive })),
    [
      { accepted: true, earned: 2, possible: 2, productive: true },
      { accepted: true, earned: 1, possible: 2, productive: false },
      { accepted: true, earned: 1, possible: 2, productive: false },
      { accepted: false, earned: 0, possible: 1, productive: true },
    ],
  );
  assert.equal(grade(STEP_ACTIONS.REJECTED_MOVE, efficient).equationAfter, grade(STEP_ACTIONS.REJECTED_MOVE, efficient).equationBefore, 'a rejected move changes nothing');
  assert.equal(grade(STEP_ACTIONS.BALANCED_MOVE, efficient).expectedTotalPoints, 6, 'the planned denominator defaults to 6');
  assert.equal(equationRewriteStepGrade({ kind: 'student-rewrite', label: 'x', supportLevel: 3, before: equation, after: equation, question: { expectedStepPoints: 4 } }).expectedTotalPoints, 4);
  const relation = parseRelationSource('x > 1', 'x');
  assert.equal(relationStepGrade({ label: 'x', before: relation, after: relation, question: {} }).expectedTotalPoints, 8, 'relations default to 8');
  assert.equal(interceptStepGrade({ standard: { A: 3, B: 4, C: 24 }, intercept: 'x', point: '(8, 0)' }).expectedTotalPoints, 2);
  // Attempt use, by action.
  assert.equal(stepActionCountsAttempt(STEP_ACTIONS.REJECTED_MOVE), true);
  assert.equal(stepActionCountsAttempt(STEP_ACTIONS.INEFFICIENT_MOVE), true);
  assert.equal(stepActionCountsAttempt(STEP_ACTIONS.INEFFICIENT_MOVE, { attemptsDoNotExpire: true }), false, 'Live Challenge keeps its attempts');
  [STEP_ACTIONS.BALANCED_MOVE, STEP_ACTIONS.REWRITE, STEP_ACTIONS.RELATION_STEP, STEP_ACTIONS.INTERCEPT_CHECK]
    .forEach((action) => assert.equal(stepActionCountsAttempt(action), false, action));
});

// ===========================================================================
// Parity: honest solves through the real engines
// ===========================================================================

test('a balance solve — cancellation, a typed rewrite, division — earns the same record on both sides', () => {
  const session = equationSession(LINEAR);
  // −6 written after the +6 on the left and at the end of the right.
  balance(session, { operation: 'subtract', operand: '6', placementBySide: { left: { kind: 'after', termIndex: 1 }, right: { kind: 'end', termIndex: 0 } } });
  assert.deepEqual([session.equation.left, session.equation.right], ['3 x', '(21) - (6)'], 'the left cancelled; the right waits to be simplified');
  rewriteSide(session, 'right', '15');
  balance(session, { operation: 'divide', operand: '3' });
  rewriteSide(session, 'right', '5');
  assert.equal(session.equation.left.replace(/\s+/g, ''), 'x');
  assert.equal(records(session).server.partialCredit, 90, '2 + 1 + 2 + 1 of 6, capped at 90');
  assert.equal(records(session).server.status, 'attempted', 'steps never finish a question');
  assert.equal(records(session).server.attemptCount, 0);
});

test('a rewrite the workspace accepts is credited even where the fast sampler separates the two sides — and the solve goes on', () => {
  // mathjs simplifies (x^2)^(1/2) - x to 0, so the workspace's own check
  // (expressionsEquivalent) accepts this rewrite, while the sampler finds a
  // defined sample (a negative x) where the two sides differ. The server must
  // follow the workspace: refusing the step would leave the state it reached
  // unrecorded, and every later step from it would fail continuity.
  const session = equationSession(LINEAR);
  const typed = '3 (x^2)^(1/2) + 6';
  assert.equal(
    compareIdentically(parse(latexToExpression(typed)), parse(session.equation.left)),
    IDENTITY.DIFFERENT,
    'the fixture really takes the fallback path',
  );
  rewriteSide(session, 'left', typed);
  // The next step starts from the state that rewrite reached.
  rewriteSide(session, 'right', '\\frac{42}{2}');
  assert.equal(records(session).server.stepGrades.length, 2);
  assert.ok(records(session).server.stepGrades.every((entry) => entry.accepted && entry.earned === 1), 'both rewrites earn their credit on the server');
  assert.equal(records(session).server.partialCredit, records(session).browser.partialCredit);
});

test('typed simplification and "keep as written" then a standalone cancellation', () => {
  const simplified = equationSession(LINEAR);
  balance(simplified, { operation: 'subtract', operand: '6', resolution: 'simplified', answers: { right: '15' } });
  assert.equal(`${simplified.equation.left} = ${simplified.equation.right}`, '3 x = 15');

  const kept = equationSession(LINEAR);
  balance(kept, { operation: 'subtract', operand: '6', resolution: 'keep', crossed: [] });
  assert.match(kept.equation.left, /- \(6\)/, 'the move is kept as written');
  const model = buildCancellationModel(kept.equation.left, null, kept.equation.variable, []);
  assert.ok(model?.pairs?.length, 'the kept side offers its +6/−6 pair');
  const after = { ...kept.equation, left: model.resultExpression };
  step(kept, rewritePayload(kept, after, { kind: 'student-cancellation', label: 'Cancel matching terms on the left side' }), 'standalone cancellation');
});

test('distribution, combine like terms and the balance finish earn the same record', () => {
  const session = equationSession(DISTRIBUTE);
  let distribution = initDistributionState(detectDistributableGroup(session.equation));
  distribution.terms.forEach((_, index) => { distribution = placeOnTerm(armFactor(distribution), index); });
  const distributed = commitDistribution(session.equation, distribution, { simplifyProducts: false });
  step(session, rewritePayload(session, distributed, {
    kind: 'distribution',
    label: `Distribute ${distribution.factorText} over (${distribution.groupText})`,
  }), 'distribution');
  session.equation = distributed;
  rewriteSide(session, 'left', '6x - 12 + 5x');
  const [group] = findLikeTermGroups(session.equation.left);
  const combined = { ...session.equation, left: replaceSelectedLikeTerms(session.equation.left, group.indices, latexToExpression('11x')) };
  step(session, rewritePayload(session, combined, { kind: 'combine-like-terms', label: 'Combine like terms on the left side' }), 'combine like terms');
  session.equation = combined;
  balance(session, { operation: 'add', operand: '12', resolution: 'simplified', answers: { right: '36' } });
  balance(session, { operation: 'divide', operand: '11' });
  assert.equal(records(session).server.stepGrades.length, records(session).browser.stepGrades.length);
});

test('a slope-intercept rewrite through the Split fraction structure tool', () => {
  const session = equationSession(LINE);
  balance(session, { operation: 'subtract', operand: '5x' });
  balance(session, { operation: 'divide', operand: '2' });
  let tool = openFractionSplit(session.equation);
  const candidate = findSplittableFraction(session.equation, tool.candidateId);
  tool = armSplitDenominator(tool, session.equation);
  candidate.numeratorTerms.forEach((_, index) => { tool = placeSplitDenominator(tool, session.equation, index); });
  const result = commitStructureTool(tool, session.equation);
  assert.equal(result.ok, true);
  step(session, rewritePayload(session, result.equation, { kind: result.step.kind, label: result.step.description }), 'split fraction');
});

test('a display label longer than the step-work bound is recorded identically on both sides', () => {
  // A distribution or structure-tool label names the factor and group the
  // student acted on, so it can be long. The raw work bounds it, and the
  // shared builders bound the recorded label the same way.
  const session = equationSession(LINEAR);
  const long = `Factored 3 from the left side ${'of a long authored group '.repeat(30)}`;
  assert.ok(long.length > STEP_WORK_LIMITS.maxLabelLength);
  const factored = { ...session.equation, left: '3 (x + 2)' };
  const payload = rewritePayload(session, factored, { kind: 'factor', label: long });
  assert.equal(payload.stepGrade.label, long.slice(0, STEP_WORK_LIMITS.maxLabelLength));
  step(session, payload, 'long label');
  assert.equal(records(session).server.stepGrades[0].label, records(session).browser.stepGrades[0].label);
  // A realistic label is never cut.
  assert.equal(rewritePayload(session, factored, { kind: 'distribution', label: 'Distribute -3 over (2x + 5)' }).stepGrade.label, 'Distribute -3 over (2x + 5)');
});

test('an inefficient move at Standard spends an attempt on both sides, then commits at 1 of 2', () => {
  const session = equationSession(LINEAR);
  const { move } = balance(session, { operation: 'add', operand: '2', resolution: 'keep', crossed: [] });
  assert.equal(move.productive, false);
  assert.equal(records(session).server.attemptCount, 1);
  assert.equal(records(session).server.stepGrades.length, 2, 'the attempt step and the commit');
  assert.equal(records(session).server.partialCredit, 0, 'an unproductive move earns no credit');
  // At Open (level 5) the same move costs nothing and reports once.
  const open = equationSession(LINEAR, { supportLevel: 5 });
  balance(open, { operation: 'add', operand: '2', resolution: 'keep', crossed: [] });
  assert.equal(records(open).server.attemptCount, 0);
  assert.equal(records(open).server.stepGrades.length, 1);
});

test('rejected cancellations and simplifications spend attempts until the version expires — on the server too', () => {
  const session = equationSession(LINEAR);
  const move = pendingMove(session, { operation: 'subtract', operand: '6' });
  // strikeSide on the right (the cancellation is on the left), then a wrong
  // typed simplification: each is a rejected move that costs an attempt.
  step(session, movePayload(session, { move, action: STEP_ACTIONS.REJECTED_MOVE }), 'wrong-side strike');
  step(session, movePayload(session, { move, action: STEP_ACTIONS.REJECTED_MOVE }), 'wrong simplification');
  const last = step(session, movePayload(session, { move, action: STEP_ACTIONS.REJECTED_MOVE }), 'third rejection');
  assert.equal(last.result.expired, true);
  assert.equal(records(session).server.status, 'expired');
  assert.equal(records(session).server.attemptCount, MAX_ATTEMPTS);
  assert.equal(records(session).server.partialCredit, 0);
});

test('Undo and Reset: a step may continue from any state the variant reached, or from the question', () => {
  const session = equationSession(LINEAR);
  const start = session.equation;
  balance(session, { operation: 'subtract', operand: '6' });
  const afterFirst = session.equation;
  rewriteSide(session, 'right', '15');
  // Undo the rewrite: the next step starts from the first move's result.
  session.equation = afterFirst;
  rewriteSide(session, 'right', '\\frac{30}{2}');
  // Reset Work: back to the question's own equation.
  session.equation = start;
  balance(session, { operation: 'divide', operand: '3' });
});

test('a step replayed over an earlier state adds no credit on either side', () => {
  const session = equationSession(LINEAR);
  balance(session, { operation: 'subtract', operand: '6' });
  const credit = records(session).server.partialCredit;
  session.equation = parseEquationInput(LINEAR);
  balance(session, { operation: 'subtract', operand: '6' });
  assert.equal(records(session).server.partialCredit, credit, 'the same state again earns nothing new');
});

test('the prefill-first-step support starts from the engine\'s suggested move, and its steps are credited', () => {
  const prefill = prefilledFirstStep(parseEquationInput(LINEAR));
  assert.deepEqual(prefill.suggestion, { operation: 'subtract', operand: 6 });
  const session = equationSession(LINEAR, { start: prefill.equation });
  balance(session, { operation: 'divide', operand: '3' });
  assert.equal(records(session).server.stepGrades[0].earned, 2);
});

test('a literal formula on the balance and the retired algebra alias', () => {
  const built = literalWorkspaceQuestion(LITERAL).question;
  const literal = equationSession(LITERAL, { workspaceQuestion: built });
  balance(literal, { operation: 'divide', operand: 'l' });
  assert.equal(literal.equation.variable, 'w');

  const retired = equationSession(RETIRED_ALGEBRA);
  balance(retired, { operation: 'subtract', operand: '7' });
  balance(retired, { operation: 'divide', operand: '4' });
});

test('a Question Family instance: steps on the instance the pin rebuilds are credited', async () => {
  const { resolveFamilyQuestionInstance } = await import('../../functions/shared/questionFamilyInstance.mjs');
  const instance = resolveFamilyQuestionInstance({
    question: { questionId: 'fam-1', type: 'stepAlgebra', prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation' } },
    assignmentId: 'A1',
    storageIndex: 0,
    allocation: { seat: 0, variant: 0, stride: 1, index: 3, basis: 'personal' },
  }).question;
  const session = equationSession(instance);
  const { suggestion } = prefilledFirstStep(session.equation);
  balance(session, { operation: suggestion.operation, operand: String(suggestion.operand) });
  assert.ok(records(session).server.partialCredit > 0);
});

// ---------------------------------------------------------------------------
// The relation workspace
// ---------------------------------------------------------------------------

const relationSession = (question) => ({
  question,
  records: newRecords(),
  state: parseRelationSource(question.equation, 'x'),
});

/** persistStep, with the validation context commitState / chooseRelationSymbol checked. */
const relationStep = (session, after, { kind = 'relation-step', label, transition }) => {
  assert.equal(validateRelationTransition(session.state, after, transition).valid, true, `the workspace accepts ${label}`);
  step(session, {
    stepGrade: relationStepGrade({ kind, label, before: session.state, after, question: session.question }),
    countsAttempt: stepActionCountsAttempt(STEP_ACTIONS.RELATION_STEP),
    statePatch: relationStatePatch(after),
    stepWork: relationStepWork({ kind, label, before: session.state, after, transition }),
  }, label);
  session.state = after;
};

const relationRewrite = (session, branch, index, typed) => {
  const next = cloneRelationState(session.state);
  next.branches[branch].expressions[index] = normalizeRelationExpressionInput(typed);
  relationStep(session, next, { kind: 'student-rewrite', label: `Student rewrite of expression ${index + 1} on Branch ${String.fromCharCode(65 + branch)}`, transition: { kind: 'equivalentRewrite' } });
};

test('an inequality: placed operations, rewrites and the student\'s own sign reversal', () => {
  const session = relationSession(INEQUALITY);
  const placed = (operation, operand, placements) => applyBalancedOperationToBranches(session.state, operation, operand, {
    branchIndices: [0],
    placementByBranch: { 0: placements },
    requireExplicitPlacement: true,
  });
  const subtract = placed('subtract', '3', { 0: { kind: 'end', termIndex: 1 }, 1: { kind: 'end', termIndex: 0 } });
  relationStep(session, subtract.state, { label: 'Subtract 3', transition: { kind: 'balancedOperation', operation: 'subtract', operandExpression: '3', branchIndices: [0] } });
  relationRewrite(session, 0, 0, '-2x');
  relationRewrite(session, 0, 1, '4');
  // ÷ −2: the operation is written, then the student flips the symbol.
  const divide = placed('divide', '-2', { 0: { kind: 'whole-operation' }, 1: { kind: 'whole-operation' } });
  assert.equal(divide.branchResults[0].requiresInequalityFlip, true);
  const flipped = cloneRelationState(divide.state);
  flipped.branches[0].relations = divide.branchResults[0].expectedRelations;
  relationStep(session, flipped, {
    kind: 'student-relation-direction',
    label: 'Divide by -2',
    transition: { kind: 'balancedOperation', operation: 'divide', operandExpression: '-2', branchIndices: [0] },
  });
  relationRewrite(session, 0, 0, 'x');
  relationRewrite(session, 0, 1, '-2');
  assert.equal(relationStateToText(session.state), 'x < -2');
  assert.equal(records(session).server.partialCredit, 75, '6 of 8');
});

test('an absolute-value split into student-authored branches, and a justified "no solution" claim', () => {
  const session = relationSession(ABS_EQ);
  const split = buildStudentAuthoredAbsoluteValueSplit(session.state, 0, 'or', { branches: [{ value: '7', relation: '=' }, { value: '-7', relation: '=' }] });
  relationStep(session, split.state, {
    kind: 'absolute-value-split',
    label: 'Reverse absolute value using student-authored split branches',
    transition: { kind: 'absoluteSplit', branchIndex: 0, structure: 'or' },
  });
  const added = applyBalancedOperationToBranches(session.state, 'add', '3', {
    branchIndices: [0, 1],
    placementByBranch: { 0: { 0: { kind: 'end', termIndex: 1 }, 1: { kind: 'end', termIndex: 0 } }, 1: { 0: { kind: 'end', termIndex: 1 }, 1: { kind: 'end', termIndex: 0 } } },
    requireExplicitPlacement: true,
  });
  relationStep(session, added.state, {
    kind: 'multi-branch-relation-step',
    label: 'Add 3 across 2 branches',
    transition: { kind: 'balancedOperation', operation: 'add', operandExpression: '3', branchIndices: [0, 1] },
  });

  const none = relationSession(NO_SOLUTION);
  assert.equal(obviousSpecialClaim(none.state), 'noSolution');
  const claimed = { ...cloneRelationState(none.state), branches: [], connective: null, special: 'noSolution' };
  relationStep(none, claimed, { kind: 'solution-claim', label: 'Declare no solution', transition: { kind: 'solutionClaim', claim: 'noSolution' } });
});

// ---------------------------------------------------------------------------
// The intercept orchestrator
// ---------------------------------------------------------------------------

test('intercepts: each sub-solve and each correct check earn the same record on both sides', () => {
  const recordsShared = newRecords();
  const standard = resolveStandardCoefficients(INTERCEPTS);
  const check = (intercept, point) => step({ question: INTERCEPTS, records: recordsShared }, {
    stepGrade: interceptStepGrade({ standard, intercept, point }),
    countsAttempt: false,
    stepWork: interceptStepWork({ intercept, point }),
  }, `${intercept}-intercept check`);
  for (const [zeroVariable, intercept, point] of [['y', 'x', '(8, 0)'], ['x', 'y', '(0, 6)']]) {
    const sub = interceptSubEquationQuestion(INTERCEPTS, standard, zeroVariable);
    const session = equationSession(INTERCEPTS, { workspaceQuestion: sub, zeroVariable, records: recordsShared });
    balance(session, { operation: 'divide', operand: zeroVariable === 'y' ? '3' : '4' });
    check(intercept, point);
  }
  assert.equal(recordsShared.server.stepGrades.filter((entry) => entry.kind === 'linear-intercept').length, 2);
});

test('intercepts on a vertical line: the orchestrator\'s own line is used, so the sub-solve and the x-intercept are credited as the browser credits them', () => {
  // The orchestrator reads its line with resolveStandardCoefficients, which
  // keeps a line with B = 0; the final-answer grader's stricter reader does
  // not. The browser credits this sub-solve and this check, so the server
  // must too — reading the line any other way records them as unverified.
  const VERTICAL = { questionId: 'q-vertical', type: 'stepAlgebra', mode: 'linearIntercepts', prompt: 'Find the intercepts.', equation: '2x + 0y = 8' };
  assert.equal(stepCreditContext(VERTICAL).mode, 'linearIntercepts', 'the orchestrator opens it');
  const standard = resolveStandardCoefficients(VERTICAL);
  assert.deepEqual(standard, { A: 2, B: 0, C: 8 });
  const recordsShared = newRecords();
  const sub = interceptSubEquationQuestion(VERTICAL, standard, 'y');
  const session = equationSession(VERTICAL, { workspaceQuestion: sub, zeroVariable: 'y', records: recordsShared });
  balance(session, { operation: 'divide', operand: '2' });
  step({ question: VERTICAL, records: recordsShared }, {
    stepGrade: interceptStepGrade({ standard, intercept: 'x', point: '(4, 0)' }),
    countsAttempt: false,
    stepWork: interceptStepWork({ intercept: 'x', point: '(4, 0)' }),
  }, 'x-intercept of a vertical line');
  assert.equal(recordsShared.server.partialCredit, recordsShared.browser.partialCredit);
  assert.ok(recordsShared.server.partialCredit > 0);
  // The intercept the line does not have is never matched, on either side.
  assert.equal(checkLinearIntercept(standard, 'y', '(0, 4)'), false, 'the browser refuses it');
  const missing = verifyOnServer(VERTICAL, recordsShared.server, interceptStepWork({ intercept: 'y', point: '(0, 4)' }));
  assert.deepEqual([missing.verified, missing.reason], [false, 'step-intercept-incorrect']);
});

// ===========================================================================
// Security: what the server refuses
// ===========================================================================

const solvedOnce = () => {
  const session = equationSession(LINEAR);
  balance(session, { operation: 'subtract', operand: '6' });
  return session;
};

const expectUnverified = (verdict, reason, label) => {
  assert.equal(verdict.eligible, true, label);
  assert.equal(verdict.verified, false, `${label}: must not be verified`);
  assert.equal(verdict.reason, reason, label);
  assert.equal(verdict.stepGrade.kind, UNVERIFIED_STEP_KIND);
  assert.equal(verdict.stepGrade.accepted, false);
  assert.equal(verdict.stepGrade.earned, 0);
  assert.equal(verdict.stepGrade.possible, 0);
  assert.equal(verdict.stepGrade.expectedTotalPoints, 0, 'it never raises the denominator');
  assert.deepEqual(verdict.statePatch, {}, 'it never moves the saved state');
};

test('a step from a state this variant was never in earns nothing (another question, or a jump ahead)', () => {
  const session = solvedOnce();
  // Another question's equation.
  const other = parseEquationInput({ equation: '2x + 1 = 9' });
  const foreign = applyBalancedOperation({ equationState: other, operation: 'subtract', operand: '1' });
  expectUnverified(verifyOnServer(LINEAR, records(session).server, equationStepWork({
    action: STEP_ACTIONS.BALANCED_MOVE,
    before: other,
    after: resolveEquationAfterMove(foreign, 3, foreign.requiredCancellationSides),
    move: foreign,
    supportLevel: 3,
  })), 'step-not-continuous', 'another question');
  // A state of this question two moves ahead, which the student never reached.
  const skipped = { ...session.equation, left: 'x', right: '(15) / (3)' };
  expectUnverified(verifyOnServer(LINEAR, records(session).server, equationStepWork({
    action: STEP_ACTIONS.REWRITE,
    kind: 'student-rewrite',
    label: 'x',
    before: skipped,
    after: { ...skipped, right: '5' },
    supportLevel: 3,
  })), 'step-not-continuous', 'jump');
});

test('the prefill support\'s start is accepted one suggested move ahead — and that skipped move earns nothing', () => {
  const pristine = parseEquationInput(LINEAR);
  const prefilled = prefilledFirstStep(pristine).equation;
  assert.equal(equationToLatex(prefilled).replace(/[\s~]+/g, ''), '3x=15');
  const fromPrefill = verifyOnServer(LINEAR, null, equationStepWork({
    action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', label: 'x', before: prefilled, after: { ...prefilled, right: '30 / 2' }, supportLevel: 3,
  }));
  assert.equal(fromPrefill.verified, true, fromPrefill.reason);
  // Two suggested moves ahead is not a start.
  const twice = prefilledFirstStep(prefilled).equation;
  expectUnverified(verifyOnServer(LINEAR, null, equationStepWork({
    action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', label: 'x', before: twice, after: { ...twice, right: '10 / 2' }, supportLevel: 3,
  })), 'step-not-continuous', 'two moves ahead');
});

test('an "after" the operation did not produce earns nothing — however productive the operation', () => {
  const session = solvedOnce();
  const move = applyBalancedOperation({ equationState: session.equation, operation: 'divide', operand: '3' });
  expectUnverified(verifyOnServer(LINEAR, records(session).server, equationStepWork({
    action: STEP_ACTIONS.BALANCED_MOVE,
    before: session.equation,
    after: { left: 'x', right: '6' },
    move,
    supportLevel: 3,
  })), 'step-not-from-operation', 'a wrong result');
  // The honest result of the same move is verified (the control).
  const honest = verifyOnServer(LINEAR, records(session).server, equationStepWork({
    action: STEP_ACTIONS.BALANCED_MOVE,
    before: session.equation,
    after: resolveEquationAfterMove(move, 3, move.requiredCancellationSides),
    move,
    supportLevel: 3,
  }));
  assert.equal(honest.verified, true, honest.reason);
  assert.equal(honest.stepGrade.earned, 2);
});

test('a rewrite that is not equivalent, changes nothing, or is not one side earns nothing', () => {
  const session = solvedOnce();
  const rewrite = (after, kind = 'student-rewrite') => verifyOnServer(LINEAR, records(session).server, equationStepWork({
    action: STEP_ACTIONS.REWRITE, kind, label: 'x', before: session.equation, after, supportLevel: 3,
  }));
  expectUnverified(rewrite({ ...session.equation, right: '16' }), 'step-not-equivalent', 'not equivalent');
  expectUnverified(rewrite({ ...session.equation }), 'step-unchanged', 'unchanged');
  expectUnverified(rewrite({ left: '3 * x', right: '15' }, 'combine-like-terms'), 'step-not-one-side', 'two sides for a one-side tool');
  expectUnverified(rewrite({ ...session.equation, right: '15' }, 'magic-solve'), 'step-kind-unknown', 'unknown tool');
  assert.equal(rewrite({ ...session.equation, right: '15' }).verified, true, 'the honest rewrite (control)');
});

test('forged credit fields, verdicts and keys in the step work are never read', () => {
  const session = solvedOnce();
  const honest = rewritePayload(session, { ...session.equation, right: '15' }, { kind: 'student-rewrite', label: 'Rewrite / simplify right' });
  const forged = {
    ...honest.stepWork,
    earned: 99, possible: 1, productive: true, isCorrect: true, score: 1, expectedTotalPoints: 1,
    stepGrade: { earned: 99 },
  };
  const normalized = normalizeStepWork(forged);
  for (const key of ['earned', 'possible', 'productive', 'isCorrect', 'score', 'expectedTotalPoints', 'stepGrade']) {
    assert.equal(key in normalized, false, `${key} is dropped`);
  }
  const verdict = verifyOnServer(LINEAR, records(session).server, forged);
  assert.equal(verdict.verified, true);
  assert.deepEqual(verdict.stepGrade, honest.stepGrade, 'the credit is the server\'s own');
});

test('the inefficient-move report is checked: a helpful move claimed as inefficient is not credited, but its attempt is spent', () => {
  const session = equationSession(LINEAR);
  const efficient = applyBalancedOperation({ equationState: session.equation, operation: 'subtract', operand: '6' });
  const verdict = verifyOnServer(LINEAR, records(session).server, equationStepWork({
    action: STEP_ACTIONS.INEFFICIENT_MOVE, before: session.equation, move: efficient, supportLevel: 3,
  }));
  expectUnverified(verdict, 'step-move-not-inefficient', 'efficient move');
  assert.equal(verdict.countsAttempt, true, 'claiming to spend an attempt spends it');
});

test('a rejected move that fails continuity still spends its attempt', () => {
  const session = equationSession(LINEAR);
  const other = parseEquationInput({ equation: '2x + 1 = 9' });
  const verdict = verifyOnServer(LINEAR, records(session).server, equationStepWork({
    action: STEP_ACTIONS.REJECTED_MOVE,
    before: other,
    move: applyBalancedOperation({ equationState: other, operation: 'subtract', operand: '1' }),
    supportLevel: 3,
  }));
  expectUnverified(verdict, 'step-not-continuous', 'rejected elsewhere');
  assert.equal(verdict.countsAttempt, true);
});

test('student text that is not plain algebra never reaches the engine', () => {
  const session = equationSession(LINEAR);
  const before = session.equation;
  const attacks = [
    { left: 'createUnit("foo")', right: '21' },
    { left: 'import({}, {override: true})', right: '21' },
    { left: '1:1e9', right: '21' },
    { left: 'x[1]', right: '21' },
  ];
  for (const after of attacks) {
    expectUnverified(verifyOnServer(LINEAR, records(session).server, equationStepWork({
      action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', label: 'x', before, after, supportLevel: 3,
    })), 'step-state-unreadable', `after ${after.left.slice(0, 30)}`);
  }
  // Plain algebra beyond the complexity budget is not judged at all: the
  // engine never sees it, and the step is declined to the sanitized path a
  // step without work takes (see the next test for why).
  const long = { left: Array.from({ length: 40 }, (_, index) => `${index + 1} x`).join(' + '), right: '21' };
  const declined = verifyOnServer(LINEAR, records(session).server, equationStepWork({
    action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', label: 'x', before, after: long, supportLevel: 3,
  }));
  assert.deepEqual([declined.eligible, declined.reason], [false, STEP_BEYOND_SERVER_BUDGET]);
  // A malicious operand.
  const move = applyBalancedOperation({ equationState: before, operation: 'subtract', operand: '6' });
  const work = equationStepWork({ action: STEP_ACTIONS.BALANCED_MOVE, before, after: resolveEquationAfterMove(move, 3, move.requiredCancellationSides), move, supportLevel: 3 });
  work.operation.operand = 'createUnit("x")';
  expectUnverified(verifyOnServer(LINEAR, records(session).server, work), 'step-operation-invalid', 'operand');
  // Multiplying both sides by zero is refused by the engine.
  work.operation = { operation: 'multiply', operand: '0', placementBySide: null };
  expectUnverified(verifyOnServer(LINEAR, records(session).server, work), 'step-operation-invalid', 'times zero');
});

test('an honest state that outgrows the server\'s budget is declined, never recorded as unverified', () => {
  // Eight additive moves in a row kept "as written" (Open level: no attempt
  // cost) build a sum chain past the budget's ten links. The browser credits
  // the ninth step; the server will not hand that chain to the simplifier.
  // Recording it as unverified would strand the rest of the solve — the
  // state it reached would never be recorded — so it is declined instead
  // (the ingestion keeps today's sanitized path for it).
  const session = equationSession({ ...LINEAR, workspaceDifficulty: 5 }, { supportLevel: 5 });
  for (let index = 1; index <= 8; index += 1) {
    balance(session, { operation: index % 2 ? 'subtract' : 'add', operand: '1', resolution: 'keep', crossed: [] });
  }
  const move = pendingMove(session, { operation: 'subtract', operand: '1' });
  const after = resolveEquationAfterKeepingMove(move, []);
  const ninth = verifyOnServer(session.question, records(session).server, movePayload(session, { move, action: STEP_ACTIONS.BALANCED_MOVE, after }).stepWork);
  assert.equal(ninth.eligible, false, 'declined, not judged');
  assert.equal(ninth.reason, STEP_BEYOND_SERVER_BUDGET);
  assert.equal('stepGrade' in ninth, false, 'nothing for the record');
  // Simplifying from there is declined too (its `before` is the long state);
  // the state it reaches is inside the budget again.
  const simplified = { ...after, left: '3 x + 5', right: '20' };
  const rewrite = verifyOnServer(session.question, records(session).server, equationStepWork({
    action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', label: 'x', before: after, after: simplified, supportLevel: 5,
  }));
  assert.deepEqual([rewrite.eligible, rewrite.reason], [false, STEP_BEYOND_SERVER_BUDGET]);
});

test('a step whose checks would hand the engine a composition beyond its budget is declined before the engine sees it', () => {
  // Each expression below is inside the per-expression budget (a 10-link
  // chain), but the checks COMPOSE them: a balanced move simplifies
  // (side) − (operand), a side the sampler cannot confirm is compared as
  // (after) − (before), a relation step compares ((before) op (operand)) −
  // (after). Composed, three 10-link chains kept one verification busy for
  // more than five minutes (a relation step of the same shape: 24 s). Such a
  // step is declined — the sanitized path a step without work takes — and
  // the engine is never handed the composition.
  const tenLinks = 'x + x + x + 1 + 1 + 1 + 1 + 1 + 1 + 0';
  const otherTen = Array.from({ length: 10 }, (_, index) => `${index + 2} x`).join(' + ');
  const session = equationSession(LINEAR);
  rewriteSide(session, 'left', tenLinks);
  const timed = (work) => {
    const started = Date.now();
    const verdict = verifyOnServer(LINEAR, records(session).server, work);
    return { verdict, elapsed: Date.now() - started };
  };
  const declined = ({ verdict, elapsed }, label) => {
    assert.deepEqual([verdict.eligible, verdict.reason], [false, STEP_BEYOND_SERVER_BUDGET], label);
    assert.ok(elapsed < 2_000, `${label}: decided in ${elapsed} ms, before any simplification`);
  };
  // A rewrite the sampler refutes, whose fallback would compare 10 + 10 links.
  declined(timed(equationStepWork({
    action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', label: 'x', before: session.equation, after: { ...session.equation, left: otherTen }, supportLevel: 3,
  })), 'rewrite');
  // A balanced move whose side and operand compose to 20 links.
  declined(timed(equationStepWork({
    action: STEP_ACTIONS.BALANCED_MOVE,
    before: session.equation,
    after: { ...session.equation, left: otherTen },
    move: { operation: 'subtract', operandExpression: otherTen },
    supportLevel: 3,
  })), 'balanced move');
  // The same composition on the relation workspace.
  const relation = relationSession(INEQUALITY);
  const long = cloneRelationState(relation.state);
  long.branches[0].expressions[0] = '-x - x + 1 + 1 + 1 + 0 + 0 + 0 + 0 + 0';
  relationStep(relation, long, { kind: 'student-rewrite', label: 'Student rewrite of expression 1 on Branch A', transition: { kind: 'equivalentRewrite' } });
  const foreign = cloneRelationState(relation.state);
  foreign.branches[0].expressions[0] = otherTen;
  const started = Date.now();
  const verdict = verifyOnServer(INEQUALITY, records(relation).server, relationStepWork({
    kind: 'student-rewrite', label: 'x', before: relation.state, after: foreign, transition: { kind: 'equivalentRewrite' },
  }));
  declined({ verdict, elapsed: Date.now() - started }, 'relation rewrite');
  // An honest step of ordinary size is still judged (the control): the
  // sampler confirms it, whatever the composition.
  rewriteSide(session, 'right', '\\frac{42}{2}');
});

test('malformed step work is unreadable as a whole, never half-read', () => {
  const valid = equationStepWork({ action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', before: { left: '3x + 6', right: '21' }, after: { left: '6 + 3x', right: '21' } });
  assert.ok(valid);
  const broken = [
    null, 'x = 5', [], 42,
    { ...valid, version: 2 },
    { ...valid, surface: 'graph' },
    { ...valid, action: 'solve' },
    { ...valid, before: { left: 3, right: '21' } },
    { ...valid, before: { left: 'x'.repeat(STEP_WORK_LIMITS.maxExpressionLength + 1), right: '21' } },
    { ...valid, after: 'x = 5' },
    { ...valid, kind: 'k'.repeat(STEP_WORK_LIMITS.maxKindLength + 1) },
    { ...valid, operation: { operation: 'exponentiate', operand: '2' } },
    { ...valid, zeroVariable: 'z' },
  ];
  broken.forEach((raw, index) => assert.equal(normalizeStepWork(raw), null, `case ${index}`));
  // The server declines what it cannot read whole (the caller keeps its sanitized path).
  assert.equal(verifyStepAlgebraStep({ question: LINEAR, record: null, stepWork: { ...valid, version: 2 } }).eligible, false);
  // A whole relation of maximal size stays under the limit; one beyond it is dropped.
  const branch = { expressions: ['x'.repeat(200), 'y'.repeat(200), 'z'.repeat(200)], relations: ['<', '<'] };
  const big = { version: 1, surface: 'relation', action: 'relation-step', kind: 'relation-step', label: 'x', before: { branches: [branch, branch] }, after: { branches: [branch, branch] } };
  assert.ok(normalizeStepWork(big));
  const huge = { ...big, before: { branches: Array(8).fill({ expressions: Array(5).fill('x'.repeat(900)), relations: ['<', '<', '<', '<'] }) } };
  assert.equal(normalizeStepWork(huge), null, 'beyond maxJsonLength');
  // Realistic step work is a few hundred characters.
  assert.ok(JSON.stringify(valid).length < 400);
});

test('a surface mismatch earns nothing: relation work on an equation, equation work on an inequality, a sub-solve without its substitution', () => {
  const relationWork = relationStepWork({ label: 'x', before: parseRelationSource('3x + 6 = 21', 'x'), after: parseRelationSource('3x = 15', 'x'), transition: { kind: 'equivalentRewrite' } });
  expectUnverified(verifyOnServer(LINEAR, null, relationWork), 'step-surface-mismatch', 'relation on equation');
  const equationWork = equationStepWork({ action: STEP_ACTIONS.REWRITE, kind: 'student-rewrite', before: { left: '-2x + 3', right: '7' }, after: { left: '3 - 2x', right: '7' } });
  expectUnverified(verifyOnServer(INEQUALITY, null, equationWork), 'step-surface-mismatch', 'equation on inequality');
  expectUnverified(verifyOnServer(INTERCEPTS, null, equationWork), 'step-surface-mismatch', 'sub-solve without zeroVariable');
});

test('relation steps the workspace would refuse earn nothing: a kept symbol after ÷ −2, a foreign relation, an unjustified claim', () => {
  const session = relationSession(INEQUALITY);
  const subtract = applyBalancedOperationToBranches(session.state, 'subtract', '3', { branchIndices: [0], placementByBranch: { 0: { 0: { kind: 'end', termIndex: 1 }, 1: { kind: 'end', termIndex: 0 } } }, requireExplicitPlacement: true });
  relationStep(session, subtract.state, { label: 'Subtract 3', transition: { kind: 'balancedOperation', operation: 'subtract', operandExpression: '3', branchIndices: [0] } });
  const divide = applyBalancedOperationToBranches(session.state, 'divide', '-2', { branchIndices: [0], placementByBranch: { 0: { 0: { kind: 'whole-operation' }, 1: { kind: 'whole-operation' } } }, requireExplicitPlacement: true });
  const transition = { kind: 'balancedOperation', operation: 'divide', operandExpression: '-2', branchIndices: [0] };
  expectUnverified(verifyOnServer(INEQUALITY, records(session).server, relationStepWork({
    kind: 'student-relation-direction', label: 'Divide by -2', before: session.state, after: divide.state, transition,
  })), 'step-transition-invalid', 'kept > after ÷ −2');
  expectUnverified(verifyOnServer(INEQUALITY, records(session).server, relationStepWork({
    label: 'x', before: parseRelationSource('5x > 10', 'x'), after: parseRelationSource('x > 2', 'x'), transition: { kind: 'equivalentRewrite' },
  })), 'step-not-continuous', 'foreign relation');
  const claim = { ...cloneRelationState(session.state), branches: [], connective: null, special: 'allReals' };
  expectUnverified(verifyOnServer(INEQUALITY, records(session).server, relationStepWork({
    kind: 'solution-claim', label: 'Declare all real numbers', before: session.state, after: claim, transition: { kind: 'solutionClaim', claim: 'allReals' },
  })), 'step-transition-invalid', 'unjustified claim');
});

test('an intercept check must be the line\'s intercept, and is credited once', () => {
  const standard = resolveStandardCoefficients(INTERCEPTS);
  const recordsShared = newRecords();
  expectUnverified(verifyOnServer(INTERCEPTS, recordsShared.server, interceptStepWork({ intercept: 'x', point: '(6, 0)' })), 'step-intercept-incorrect', 'wrong point');
  expectUnverified(verifyOnServer(INTERCEPTS, recordsShared.server, interceptStepWork({ intercept: 'x', point: '(0, 6)' })), 'step-intercept-incorrect', 'the other intercept');
  step({ question: INTERCEPTS, records: recordsShared }, {
    stepGrade: interceptStepGrade({ standard, intercept: 'x', point: '(8, 0)' }),
    countsAttempt: false,
    stepWork: interceptStepWork({ intercept: 'x', point: '(8, 0)' }),
  }, 'x-intercept');
  // The same intercept again, written differently, is not a second step.
  expectUnverified(verifyOnServer(INTERCEPTS, recordsShared.server, interceptStepWork({ intercept: 'x', point: '(8.0, 0)' })), 'step-intercept-already-found', 'farming');
});

test('discrimination: honest work checked against a question with another equation earns nothing', () => {
  const session = equationSession(LINEAR);
  const move = pendingMove(session, { operation: 'subtract', operand: '6' });
  const payload = movePayload(session, { move, action: STEP_ACTIONS.BALANCED_MOVE, after: resolveEquationAfterMove(move, 3, move.requiredCancellationSides) });
  assert.equal(verifyOnServer(LINEAR, null, payload.stepWork).verified, true, 'control');
  expectUnverified(verifyOnServer({ ...LINEAR, equation: '3x + 6 = 24' }, null, payload.stepWork), 'step-not-continuous', 'altered key');
});

// ===========================================================================
// Which questions the server credits — the renderer's own routing
// ===========================================================================

test('the step context opens the workspace QuestionEngine opens, and declines what the server does not hold', () => {
  const context = (question) => {
    const resolved = stepCreditContext(question);
    return resolved.supported ? `${resolved.surfaceId}/${resolved.mode}` : `no:${resolved.reason}`;
  };
  assert.equal(context(LINEAR), 'stepAlgebra/equation');
  assert.equal(context(LINE), 'stepAlgebra/equation');
  assert.equal(context(INEQUALITY), 'stepAlgebra/relation');
  assert.equal(context(ABS_EQ), 'stepAlgebra/relation');
  assert.equal(context(INTERCEPTS), 'stepAlgebra/linearIntercepts');
  assert.equal(context({ ...RETIRED_ALGEBRA, mode: 'linearIntercepts' }), 'algebra/equation', 'only stepAlgebra opens the orchestrator');
  assert.equal(context(LITERAL), 'literalWorkspace/equation');
  assert.equal(context({ ...LITERAL, mode: 'linearIntercepts' }), 'literalWorkspace/equation', 'a literal on the balance never opens the orchestrator');
  assert.equal(context({ ...LINEAR, generator: { kind: 'stepLinearEquation' } }), 'no:generated-question');
  assert.equal(context({ type: 'stepAlgebra', questionFamily: { id: 'linear.twoStepEquation' } }), 'no:family-template');
  assert.equal(context({ ...LINEAR, variants: [{ equation: '2x = 4' }] }), 'no:variant-selection');
  assert.match(context({ type: 'literal', formula: 'A = l w', solveFor: 'w', acceptedAnswers: ['A/l'] }), /^no:not-step-algebra/, 'the typed literal box has no steps');
  assert.match(context({ type: 'graphing', equation: 'y = 2x' }), /^no:/);
});
